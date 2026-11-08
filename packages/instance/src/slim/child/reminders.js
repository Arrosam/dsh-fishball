/**
 * Reminders in the slim child (§15 T10).
 *
 * The child owns reminders end to end; it does not mount DSH's `schedule` service:
 * - 0.2.1-rc.3/rc.5 hard-inject `sessionController`, which only the Web bundle provides, so the
 *   row stays pending in a base-only child and `/api/reminders` answers 503;
 * - the service and tool contracts differ between rc.3/rc.5 (`list`/`update`/`delete`) and
 *   0.2.2-rc.1 (`list`/`view`/`edit`), and the slim design forbids the Web bundle in the child
 *   (§2.1, §2.3). A stub service would have to shadow a Web-owned DSH service and branch on the
 *   installed version in both the HTTP adapter and the tools.
 * Instead this module keeps its own durable tasks under the child's own home and delivers them
 * through the one activation owner the chat module already publishes (T07's resolveAgent):
 * - `reminder-schedule.js` owns the timing rules and the store schema (after / at / every /
 *   daily / weekly / cron), so the delivered task's shape and the schedule tool's semantics stay
 *   the same on every supported DSH version;
 * - every task is written to `<child home>/fishball/reminders.json` before it is acknowledged, so
 *   a child restart loses nothing. On startup a missed one-shot fires once and a missed recurring
 *   task fires once for its latest occurrence, then keeps its cadence;
 * - the agent gets `schedule_create`, `schedule_list`, `schedule_update` and `schedule_delete`
 *   with the schedule tool's names and parameters, so the persona and the model's habits carry
 *   over from the main DSH;
 * - `schedule/changed` does not exist here: every durable write (create, update, cancel and a
 *   delivery) notifies this module's subscribers, and the app relays that as its `reminders` SSE
 *   event so the view re-reads a short list.
 *
 * API contract (the app's HTTP hook only reads the body and writes the answer):
 *   GET  /api/reminders[?active=true|false&limit=1..500&offset>=0]
 *        -> 200 { items, shown, total, limit, offset }; items are reminder view models.
 *   POST /api/reminders { action: "update", id, patch: { title?, prompt?, active?,
 *        at?, everySeconds?, daily?: { time, timeZone }, weekly?: { time, timeZone, weekdays },
 *        cron?: { expression, timeZone } } }
 *        -> 200 reminder view model, or { id, updated: false, code: "schedule_not_found" |
 *        "schedule_ended" }.
 *   POST /api/reminders { action: "cancel", id }
 *        -> 200 { id, deleted: true }, or { id, code: "schedule_not_found" }.
 *   400 { code, message } for an invalid request or a typed rule refusal (invalid_rule, ...).
 *   405 for any other method; 503 while the reminder store is unavailable; 500 for an unexpected
 *   failure. A miss is data, not an exception. HEAD is accepted with GET and the caller drops the
 *   body. The body is bounded by the embed's 1 MiB JSON limit, which the HTTP hook owns (§3.6).
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ROUTES } from '../contract.js'
import {
  advance,
  decodeRecord,
  isRecurring,
  KIND,
  MIN_EVERY_SECONDS,
  normalizePrompt,
  normalizeTitle,
  recordFor,
  RULE_ERROR,
  ScheduleRuleError,
  TIMING_FIELDS,
  TITLE_MAX_CHARS,
  timingOfRecord,
} from './reminder-schedule.js'

/** The child serves the contract's /api/* tails; the broker adds /fishball/embed in front (§3.1). */
const API_PATH = ROUTES.api.slice(ROUTES.prefix.length) + 'reminders'

/**
 * The reminder API contract the app's hooks and src/slim/ui/reminders.js both follow. The view
 * addresses the same resource as the document-relative "api/reminders", which resolves to this
 * path at the child's "/" and behind the broker's "/fishball/embed/" (§3.1).
 */
export const REMINDERS = Object.freeze({
  path: API_PATH,
  event: 'reminders',
  methods: Object.freeze(['GET', 'HEAD', 'POST']),
  action: Object.freeze({ update: 'update', cancel: 'cancel' }),
  // The app writes this as the SSE event data; the view re-reads rather than tracking a diff.
  change: Object.freeze({ changed: true }),
})

const LOGGER = 'fishball-native-reminders'
const METHOD = Object.freeze({ get: 'GET', head: 'HEAD', post: 'POST' })
const HTTP = Object.freeze({ ok: 200, badRequest: 400, methodNotAllowed: 405, unavailable: 503, failed: 500 })

/** API-level failures; the model-facing tools use the DSH schedule codes below. */
const ERROR = Object.freeze({
  unavailable: 'schedule-unavailable',
  invalid: 'invalid-input',
  method: 'method-not-allowed',
  failed: 'schedule-failed',
})
/** Only codes this module raises carry their own status; a typed rule refusal is a 400. */
const ERROR_STATUS = Object.freeze({ [ERROR.invalid]: HTTP.badRequest, [ERROR.unavailable]: HTTP.unavailable })

/** Stable result codes this module returns as data, mirroring the schedule service's own. */
const CODE = Object.freeze({
  notFound: 'schedule_not_found',
  ended: 'schedule_ended',
  subagent: 'subagent_session',
  internal: 'internal_error',
})

const MESSAGE = Object.freeze({
  unavailable: 'The child reminder store is unavailable.',
  invalid: 'The reminder request is invalid.',
  method: 'The reminder API accepts GET and POST.',
  failed: 'The reminder operation failed.',
  toolFailed: 'The schedule operation failed.',
  subagent: 'A delegated subagent cannot use scheduled tasks.',
  toolSelector: 'the tool selector is malformed.',
  id: 'the reminder id must be a non-empty trimmed string.',
  createSelector: 'schedule_create accepts exactly one of after_seconds, at, every_seconds, daily, weekly, or cron.',
  updateSelector: 'schedule_update accepts at most one of at, every_seconds, daily, weekly, or cron.',
  updateNeeds: 'schedule_update needs a new title, prompt, or one of at, every_seconds, daily, weekly, or cron.',
})

const QUERY = Object.freeze({ active: 'active', limit: 'limit', offset: 'offset' })
const FLAG = Object.freeze({ on: 'true', off: 'false' })
// A canonical non-negative integer only: Number("1e2") or " 1" must not become a page bound.
const INTEGER_TEXT = /^(?:0|[1-9]\d*)$/
const BODY = Object.freeze({ action: 'action', id: 'id', patch: 'patch' })
const CANCEL_KEYS = Object.freeze([BODY.action, BODY.id])
const UPDATE_KEYS = Object.freeze([BODY.action, BODY.id, BODY.patch])

/** The API patch's optional fields; one timing selector at most, in the record's own spelling. */
const PATCH = Object.freeze({
  title: 'title',
  prompt: 'prompt',
  active: 'active',
  at: 'at',
  everySeconds: 'everySeconds',
  daily: 'daily',
  weekly: 'weekly',
  cron: 'cron',
})
const PATCH_FIELDS = Object.freeze(Object.values(PATCH))
const API_TIMING = Object.freeze([PATCH.at, PATCH.everySeconds, PATCH.daily, PATCH.weekly, PATCH.cron])

/** Task state the slim UI distinguishes (§15 T10, src/slim/ui/reminders.js). */
const TASK_STATUS = Object.freeze({ active: 'active', paused: 'paused', ended: 'ended' })

/** The two delivery states the schedule tool reports; a stale target reads `overdue`. */
const TOOL_STATE = Object.freeze({ scheduled: 'scheduled', overdue: 'overdue' })

/** Page bounds the T10 contract publishes; the schedule service's own defaults. */
const LIST = Object.freeze({ defaultLimit: 100, maxLimit: 500 })

/** One durable store beside the chat record: same private directory, own file (§2.4). */
const STORE = Object.freeze({
  directory: 'fishball',
  file: 'reminders.json',
  version: 1,
  directoryMode: 0o700,
  fileMode: 0o600,
  tempSuffix: '.tmp',
  maxBytes: 4_194_304,
})

/** Node timers clamp above this; a longer wait is re-armed when the timer fires. */
const TIMER = Object.freeze({ maxDelayMs: 2_147_483_647 })

/** The model-facing frame the schedule service uses; the chat shows `schedule` as "Reminder". */
const DELIVERY = Object.freeze({
  source: 'schedule',
  mode: 'host',
  heading: '[SCHEDULE REMINDER]',
  origin: 'This is a scheduled message from the user',
  idField: 'schedule_id_json',
  occurrenceField: 'occurrence_at',
  promptField: 'reminder_prompt_json',
})

/** Fields the slim view keeps; target ids and Host bookkeeping never leave the child. */
const VIEW_FIELDS = Object.freeze(['id', 'title', 'prompt', 'kind', 'scheduledAt'])
/** A receipt keeps only what a list row can show, not the message id or target Session. */
const RECEIPT_FIELDS = Object.freeze(['scheduledAt', 'deliveredAt'])

/** The four tool names and parameters the DSH schedule tool publishes. */
const TOOL = Object.freeze({
  create: 'schedule_create',
  list: 'schedule_list',
  update: 'schedule_update',
  delete: 'schedule_delete',
})
const TOOL_SELECTOR = Object.freeze({
  after: 'after_seconds',
  at: 'at',
  every: 'every_seconds',
  daily: 'daily',
  weekly: 'weekly',
  cron: 'cron',
})
const CREATE_SELECTORS = Object.freeze(Object.values(TOOL_SELECTOR))
const UPDATE_SELECTORS = Object.freeze([TOOL_SELECTOR.at, TOOL_SELECTOR.every, TOOL_SELECTOR.daily, TOOL_SELECTOR.weekly, TOOL_SELECTOR.cron])
const STRING = Object.freeze({ type: 'string' })
const NUMBER = Object.freeze({ type: 'number' })
const OUTPUT = Object.freeze({
  schema: { type: 'json' },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

/** Model-facing copy, taken from the schedule tool so the persona's habits keep working. */
const TEXT = Object.freeze({
  create: 'Create a reminder in the current session that delivers prompt when it becomes due. Supply exactly one timing parameter: after_seconds, at, every_seconds, daily, weekly, or cron. Local times that do not exist in the zone are skipped; repeated local times fire once, at the earlier instant. After downtime, a recurring reminder delivers only its latest missed occurrence. Delivery can repeat after a crash.',
  list: 'List the reminders in the current session, active first.',
  update: 'Change a reminder in place, keeping its id. Supply a new title, prompt, or at most one timing parameter; omitted fields keep their stored values. To change a relative delay, create a new reminder.',
  delete: 'Delete a reminder in the current session, active or inactive. Deletion does not retract a reminder message that is already queued.',
  title: `Concise task name in the user's language, at most ${TITLE_MAX_CHARS} characters. Name only the core action and subject; keep essential target identifiers such as PR numbers and branch names. Do not include execution frequency (e.g. daily, hourly), scheduled dates/times, time zones, task status, or configuration and execution details (e.g. read-only mode, profile-tag filters), even when embedded in the requested or existing title. Do not append parenthetical notes. Put scheduling information in the timing parameters and execution instructions in prompt.`,
  prompt: 'Reminder content to present when the target becomes due.',
  afterSeconds: 'Delay in whole seconds.',
  everySeconds: `Fixed-rate interval in whole seconds, at least ${MIN_EVERY_SECONDS}, aligned to the creation time; changing it with schedule_update re-aligns it to the save time.`,
  daily: 'Every day at a local time.',
  weekly: 'On the given weekdays at a local time.',
  cron: 'Five-field Vixie cron expression in a time zone.',
  at: 'Absolute target: an RFC 3339 date-time with offset, or a local date, time, and IANA time_zone.',
  time: 'HH:mm:ss with optional 1-3 fractional digits, for example 23:00:00.',
  zone: 'UTC or IANA Area/Location, for example Asia/Shanghai.',
  weekdays: 'ISO weekdays, Monday 1 through Sunday 7, without repetitions.',
  cronExpression: 'minute hour day-of-month month day-of-week, for example "*/15 9-17 * * 1-5". When both day fields are restricted, a date matches if either one matches.',
  id: 'Reminder id returned by schedule_list.',
  exactId: 'Exact reminder id.',
  date: 'Four-digit ISO calendar date, for example 2026-11-06.',
})

/**
 * The schedule tool's selector parameters, shared by create and update. DSH's generated catalog
 * states the same order and wording; one definition here keeps two tools from drifting apart.
 */
const SELECTOR_PARAMETERS = Object.freeze({
  every_seconds: Object.freeze({ ...NUMBER, description: TEXT.everySeconds }),
  daily: Object.freeze({
    type: 'object',
    additionalProperties: false,
    description: TEXT.daily,
    properties: Object.freeze({
      time: Object.freeze({ ...STRING, required: true, description: TEXT.time }),
      time_zone: Object.freeze({ ...STRING, required: true, description: TEXT.zone }),
    }),
  }),
  weekly: Object.freeze({
    type: 'object',
    additionalProperties: false,
    description: TEXT.weekly,
    properties: Object.freeze({
      time: Object.freeze({ ...STRING, required: true, description: TEXT.time }),
      time_zone: Object.freeze({ ...STRING, required: true, description: TEXT.zone }),
      weekdays: Object.freeze({ type: 'array', required: true, description: TEXT.weekdays, items: Object.freeze({ type: 'integer' }) }),
    }),
  }),
  cron: Object.freeze({
    type: 'object',
    additionalProperties: false,
    description: TEXT.cron,
    properties: Object.freeze({
      expression: Object.freeze({ ...STRING, required: true, description: TEXT.cronExpression }),
      time_zone: Object.freeze({ ...STRING, required: true, description: TEXT.zone }),
    }),
  }),
  at: Object.freeze({
    description: TEXT.at,
    oneOf: Object.freeze([
      STRING,
      Object.freeze({
        type: 'object',
        additionalProperties: false,
        properties: Object.freeze({
          date: Object.freeze({ ...STRING, required: true, description: TEXT.date }),
          time: Object.freeze({ ...STRING, required: true, description: TEXT.time }),
          time_zone: Object.freeze({ ...STRING, required: true, description: TEXT.zone }),
        }),
      }),
    ]),
  }),
})

/** A typed boundary refusal; the HTTP hook returns `code` and `message` unchanged. */
class ReminderApiError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReminderApiError'
    this.code = code
  }
}

function invalid() { throw new ReminderApiError(ERROR.invalid, MESSAGE.invalid) }
function unavailable() { throw new ReminderApiError(ERROR.unavailable, MESSAGE.unavailable) }

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const codeOf = (error) => String(error?.code ?? error?.name ?? error)

function copyDefined(source, target, field) {
  if (source[field] !== undefined) target[field] = source[field]
}

/** One stored task as the slim view model; unknown future fields never leak out. */
function viewOf(task) {
  const reminder = { status: task.status }
  for (const field of VIEW_FIELDS) copyDefined(task.record, reminder, field)
  for (const field of TIMING_FIELDS[task.record.kind] ?? []) copyDefined(task.record, reminder, field)
  copyDefined(task, reminder, 'createdAt')
  copyDefined(task, reminder, 'updatedAt')
  if (task.lastDelivery !== undefined) {
    const receipt = {}
    for (const field of RECEIPT_FIELDS) copyDefined(task.lastDelivery, receipt, field)
    reminder.lastDelivery = receipt
  }
  return reminder
}

/** The agent tool's view: the schedule view adds the delivery state and its one mode. */
function toolView(task, now) {
  return Object.freeze({
    ...viewOf(task),
    state: Date.parse(task.record.scheduledAt) <= now ? TOOL_STATE.overdue : TOOL_STATE.scheduled,
    deliveryMode: DELIVERY.mode,
  })
}

/** Active tasks first, then by target; a stable id breaks ties so a page never reshuffles. */
function compareTasks(left, right) {
  const active = Number(right.status === TASK_STATUS.active) - Number(left.status === TASK_STATUS.active)
  if (active !== 0) return active
  return Date.parse(left.record.scheduledAt) - Date.parse(right.record.scheduledAt) || left.record.id.localeCompare(right.record.id)
}

function idOf(value) {
  // Stored ids are trimmed; an untrimmed id can only miss, so refuse it at the boundary.
  if (typeof value !== 'string' || value === '' || value.trim() !== value) invalid()
  return value
}

function textOf(value) {
  if (typeof value !== 'string' || value.trim() === '') invalid()
  return value
}

function booleanOf(value) {
  if (typeof value !== 'boolean') invalid()
  return value
}

function integerOf(raw) {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw !== 'string' || !INTEGER_TEXT.test(raw)) invalid()
  const value = Number(raw)
  if (!Number.isSafeInteger(value)) invalid()
  return value
}

function activeOf(raw) {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (raw === FLAG.on) return true
  if (raw === FLAG.off) return false
  invalid()
}

function exactKeys(keys, allowed) {
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) invalid()
}

/** An object with exactly the named keys, or undefined when its shape differs. */
function exactRecord(value, fields) {
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) return undefined
  return value
}

function listRequest(query) {
  if (query === undefined) return {}
  if (typeof query.get !== 'function') throw new TypeError('fishball-native-reminders: the reminder query must be URLSearchParams')
  const request = {}
  const active = activeOf(query.get(QUERY.active))
  if (active !== undefined) request.active = active
  const limit = integerOf(query.get(QUERY.limit))
  if (limit !== undefined) request.limit = limit
  const offset = integerOf(query.get(QUERY.offset))
  if (offset !== undefined) request.offset = offset
  return request
}

/** One absolute selector in the API's own spelling: an RFC 3339 string or a local calendar. */
function apiAt(value) {
  if (typeof value === 'string') return value
  const at = exactRecord(value, ['date', 'time', 'timeZone'])
  if (at === undefined) invalid()
  return at
}

/** Translate the API's timing fields into the normalized selector `recordFor` validates. */
function apiTiming(patch) {
  const present = API_TIMING.filter((field) => patch[field] !== undefined)
  if (present.length > 1) invalid()
  if (present.length === 0) return undefined
  const field = present[0]
  if (field === PATCH.at) return { kind: KIND.at, at: apiAt(patch[PATCH.at]) }
  if (field === PATCH.everySeconds) return { kind: KIND.every, everySeconds: patch[PATCH.everySeconds] }
  if (field === PATCH.daily) {
    const daily = exactRecord(patch[PATCH.daily], ['time', 'timeZone'])
    if (daily === undefined) invalid()
    return { kind: KIND.daily, time: daily.time, timeZone: daily.timeZone }
  }
  if (field === PATCH.weekly) {
    const weekly = exactRecord(patch[PATCH.weekly], ['time', 'timeZone', 'weekdays'])
    if (weekly === undefined) invalid()
    return { kind: KIND.weekly, time: weekly.time, timeZone: weekly.timeZone, weekdays: weekly.weekdays }
  }
  const cron = exactRecord(patch[PATCH.cron], ['expression', 'timeZone'])
  if (cron === undefined) invalid()
  return { kind: KIND.cron, expression: cron.expression, timeZone: cron.timeZone }
}

/** One update patch: content, state, or exactly one timing selector. */
function patchOf(value) {
  if (!isRecord(value)) invalid()
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !PATCH_FIELDS.includes(key))) invalid()
  const patch = {}
  if (keys.includes(PATCH.title)) patch.title = textOf(value[PATCH.title])
  if (keys.includes(PATCH.prompt)) patch.prompt = textOf(value[PATCH.prompt])
  if (keys.includes(PATCH.active)) patch.active = booleanOf(value[PATCH.active])
  const timing = apiTiming(value)
  if (timing !== undefined) patch.timing = timing
  if (patch.title === undefined && patch.prompt === undefined && patch.active === undefined && timing === undefined) invalid()
  return patch
}

/** Decode one stored task; any damaged part drops only that task. */
function decodeTask(value) {
  if (!isRecord(value)) return undefined
  const { sessionId, status, createdAt, updatedAt, lastDelivery } = value
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  if (!Object.hasOwn(TASK_STATUS, status)) return undefined
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) return undefined
  if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) return undefined
  const record = decodeRecord(value.record)
  if (record === undefined) return undefined
  const task = { sessionId, record, status, createdAt, updatedAt }
  if (lastDelivery !== undefined) {
    if (!isRecord(lastDelivery)) return undefined
    const receipt = {}
    for (const field of RECEIPT_FIELDS) {
      if (typeof lastDelivery[field] !== 'string' || !Number.isFinite(Date.parse(lastDelivery[field]))) return undefined
      receipt[field] = lastDelivery[field]
    }
    task.lastDelivery = receipt
  }
  return Object.freeze(task)
}

function renderFraming(record, occurrenceAt) {
  return [
    DELIVERY.heading,
    DELIVERY.origin,
    `${DELIVERY.idField}: ${JSON.stringify(record.id)}`,
    `${DELIVERY.occurrenceField}: ${occurrenceAt}`,
    `${DELIVERY.promptField}: ${JSON.stringify(record.prompt)}`,
  ].join('\n')
}

/**
 * Create the reminder surface over a child's Cordis context.
 *
 * @param {object} ctx - the fishball-native-app row's context. `get` and `on` serve every request;
 *   a context with `inject` also registers the four agent tools once the tools service is up.
 *   `profileContext.home` names the child's private store, and `effect` (when present) stops the
 *   timer with the row.
 * @param {object} [options]
 * @param {(sessionId: string, next: () => Promise<object|undefined>) => Promise<object|undefined>}
 *   [options.resolveAgent] - the chat module's activation owner (T07). Delivery resumes the
 *   reminder's target Session through it; a target it does not own is asked to `next()` and a
 *   `undefined` answer means no live Agent, so the reminder cannot be delivered.
 * @returns {{ handle: (request: object) => Promise<{status: number, body: object}>, subscribe: (listener: () => void) => () => void }}
 *   `handle` serves the HTTP hook; `subscribe` registers an SSE relay and returns its remover.
 */
export function createReminders(ctx, options = {}) {
  if (!ctx || typeof ctx.get !== 'function' || typeof ctx.on !== 'function') {
    throw new TypeError('fishball-native-reminders: a Cordis context with get() and on() is required')
  }
  const { resolveAgent } = options ?? {}
  if (resolveAgent !== undefined && typeof resolveAgent !== 'function') {
    throw new TypeError('fishball-native-reminders: resolveAgent must be a function')
  }
  const profile = ctx.get('profileContext')
  if (typeof profile?.home !== 'string' || !path.isAbsolute(profile.home)) {
    throw new TypeError('fishball-native-reminders: the child profile home is required')
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(LOGGER) : undefined
  const directory = path.join(profile.home, STORE.directory)
  const file = path.join(directory, STORE.file)
  const listeners = new Set()
  let tasks = []
  let storeError
  let closed = false
  let timer
  let chain = Promise.resolve()
  let driving = false
  let requested = false
  let failed = new Set()

  const ready = load()

  /** One durable write at a time, so a delivery and an API edit never overwrite each other. */
  function mutate(work) {
    const run = chain.then(work)
    chain = run.then(() => undefined, () => undefined)
    return run
  }

  async function load() {
    let raw
    try {
      raw = await readFile(file, 'utf8')
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        storeError = error
        logger?.warn('the reminder store could not be read (%s)', codeOf(error))
      }
      return
    }
    if (Buffer.byteLength(raw, 'utf8') > STORE.maxBytes) {
      logger?.warn('the reminder store is too large; it is ignored')
      return
    }
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      logger?.warn('the reminder store is not JSON; it is ignored')
      return
    }
    if (!isRecord(parsed) || parsed.version !== STORE.version || !Array.isArray(parsed.tasks)) {
      logger?.warn('the reminder store has an unexpected shape; it is ignored')
      return
    }
    const loaded = []
    let ignored = 0
    for (const value of parsed.tasks) {
      const task = decodeTask(value)
      if (task === undefined) ignored += 1
      else loaded.push(task)
    }
    if (ignored > 0) logger?.warn('%d stored reminder(s) were ignored as malformed', ignored)
    tasks = loaded
  }

  async function persist(next) {
    await mkdir(directory, { recursive: true, mode: STORE.directoryMode })
    const temporary = file + STORE.tempSuffix
    await writeFile(temporary, JSON.stringify({ version: STORE.version, tasks: next }) + '\n', { mode: STORE.fileMode })
    await rename(temporary, file)
  }

  /** Durability before visibility: a failed write leaves the previous tasks in place. */
  async function commit(next) {
    await persist(next)
    tasks = next
    emitChanged()
  }

  function emitChanged() {
    for (const listener of [...listeners]) {
      try { listener() } catch { /* a closed or broken SSE stream */ }
    }
  }

  async function requireStore() {
    await ready
    if (storeError !== undefined) unavailable()
  }

  async function page(query) {
    await requireStore()
    const request = listRequest(query)
    const limit = request.limit ?? LIST.defaultLimit
    const offset = request.offset ?? 0
    if (limit < 1 || limit > LIST.maxLimit) invalid()
    const matching = tasks
      .filter((task) => request.active === undefined || (task.status === TASK_STATUS.active) === request.active)
      .sort(compareTasks)
    const items = matching.slice(offset, offset + limit)
    return { items: items.map(viewOf), shown: items.length, total: matching.length, limit, offset }
  }

  async function createTask({ sessionId, title, prompt, timing, now }) {
    return mutate(async () => {
      const record = recordFor({ id: randomUUID(), title, prompt, timing, now })
      const stamp = new Date(now).toISOString()
      const task = Object.freeze({ sessionId, record, status: TASK_STATUS.active, createdAt: stamp, updatedAt: stamp })
      await commit([...tasks, task])
      return task
    })
  }

  /**
   * Apply one update to the task's content, state or timing. A timing change re-arms the task
   * from the update time; resuming a recurring task re-arms it the same way, while a paused
   * one-shot can only resume if its stored target is still ahead.
   */
  async function updateTask(id, patch, now, sessionId) {
    return mutate(async () => {
      // The agent tools act for one Session; the child's own API sees every task in the child.
      const index = tasks.findIndex((task) => task.record.id === id && (sessionId === undefined || task.sessionId === sessionId))
      if (index === -1) return { result: { id, updated: false, code: CODE.notFound } }
      const current = tasks[index]
      const title = patch.title ?? current.record.title
      const prompt = patch.prompt ?? current.record.prompt
      let record = current.record
      let status = current.status
      let rearmed = false
      if (patch.timing !== undefined) {
        record = recordFor({ id, title, prompt, timing: patch.timing, now })
        rearmed = true
        status = patch.active === false ? TASK_STATUS.paused : TASK_STATUS.active
      } else if (patch.title !== undefined || patch.prompt !== undefined) {
        record = Object.freeze({ ...record, title: normalizeTitle(title), prompt: normalizePrompt(prompt) })
      }
      if (patch.active !== undefined) {
        if (patch.active === true) {
          if (status === TASK_STATUS.ended) return { result: { id, updated: false, code: CODE.ended } }
          if (status === TASK_STATUS.paused && !rearmed) {
            if (isRecurring(record.kind)) record = recordFor({ id, title, prompt, timing: timingOfRecord(record), now })
            else if (Date.parse(record.scheduledAt) <= now) return { result: { id, updated: false, code: CODE.ended } }
            status = TASK_STATUS.active
          }
        } else if (status === TASK_STATUS.active) {
          status = TASK_STATUS.paused
        }
      }
      if (record === current.record && status === current.status) return { task: current }
      const updated = Object.freeze({ ...current, record, status, updatedAt: new Date(now).toISOString() })
      const next = [...tasks]
      next[index] = updated
      await commit(next)
      return { task: updated }
    })
  }

  async function cancelTask(id, sessionId) {
    return mutate(async () => {
      const next = tasks.filter((task) => task.record.id !== id || (sessionId !== undefined && task.sessionId !== sessionId))
      if (next.length === tasks.length) return { result: { id, code: CODE.notFound } }
      await commit(next)
      return { result: { id, deleted: true } }
    })
  }

  async function mutateRequest(body) {
    if (!isRecord(body)) invalid()
    const keys = Object.keys(body)
    const id = idOf(body[BODY.id])
    if (body[BODY.action] === REMINDERS.action.cancel) {
      exactKeys(keys, CANCEL_KEYS)
      await requireStore()
      return (await cancelTask(id)).result
    }
    if (body[BODY.action] === REMINDERS.action.update) {
      exactKeys(keys, UPDATE_KEYS)
      const patch = patchOf(body[BODY.patch])
      await requireStore()
      const outcome = await updateTask(id, patch, Date.now())
      requestDrive()
      return 'task' in outcome ? viewOf(outcome.task) : outcome.result
    }
    return invalid()
  }

  function failureOf(error) {
    if (error instanceof ReminderApiError) {
      return { status: ERROR_STATUS[error.code] ?? HTTP.failed, body: { code: error.code, message: error.message } }
    }
    if (error instanceof ScheduleRuleError) {
      return { status: HTTP.badRequest, body: { code: error.code, message: error.message } }
    }
    return { status: HTTP.failed, body: { code: ERROR.failed, message: MESSAGE.failed } }
  }

  async function handle(request) {
    const { method, query, body } = request ?? {}
    try {
      if (method === METHOD.get || method === METHOD.head) return { status: HTTP.ok, body: await page(query) }
      if (method === METHOD.post) return { status: HTTP.ok, body: await mutateRequest(body) }
      return { status: HTTP.methodNotAllowed, body: { code: ERROR.method, message: MESSAGE.method } }
    } catch (error) {
      return failureOf(error)
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball-native-reminders: a reminder change listener must be a function')
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  // ── delivery ─────────────────────────────────────────────────────────────────────────────────

  /** Deliver one task and resolve the occurrence it stands for; a refusal throws. */
  async function deliver(task, now) {
    if (typeof resolveAgent !== 'function') throw new Error('no activation owner is configured')
    const agent = await resolveAgent(task.sessionId, async () => undefined)
    if (agent === undefined) throw new Error('no live Agent owns the reminder target')
    const occurrence = advance(task.record, now)
    const message = createUserMessage({
      content: [{ type: 'text', text: renderFraming(task.record, occurrence.occurrenceAt) }],
      source: { kind: DELIVERY.source },
    })
    agent.followup(message)
    // The receipt is durable only after the Session log accepted the message; marking it
    // delivered first could lose the reminder if persistence then refuses.
    const sessions = ctx.get('sessions')
    if (typeof sessions?.flush !== 'function') throw new Error('the Session service cannot acknowledge a reminder')
    if (!await sessions.flush(agent.session)) throw new Error('Session persistence did not acknowledge the reminder')
    return occurrence
  }

  /**
   * Deliver every due task once. A failed delivery stays active but is left out of this pass's
   * timer, so one unreachable target cannot spin the loop; the next change or restart retries it.
   */
  async function deliverDue() {
    failed = new Set()
    const due = tasks
      .filter((task) => task.status === TASK_STATUS.active && Date.parse(task.record.scheduledAt) <= Date.now())
      .sort((left, right) => Date.parse(left.record.scheduledAt) - Date.parse(right.record.scheduledAt))
    for (const task of due) {
      if (closed) return
      const index = tasks.findIndex((candidate) => candidate.record.id === task.record.id)
      if (index === -1) continue
      try {
        const occurrence = await deliver(task, Date.now())
        const deliveredAt = new Date().toISOString()
        const record = Object.freeze({
          ...task.record,
          scheduledAt: occurrence.nextScheduledAt ?? occurrence.occurrenceAt,
        })
        const status = occurrence.nextScheduledAt === undefined ? TASK_STATUS.ended : TASK_STATUS.active
        const updated = Object.freeze({
          ...task,
          record,
          status,
          lastDelivery: { scheduledAt: occurrence.occurrenceAt, deliveredAt },
          updatedAt: deliveredAt,
        })
        const next = [...tasks]
        next[index] = updated
        await commit(next)
      } catch (error) {
        failed.add(task.record.id)
        logger?.warn('reminder %s was not delivered (%s)', task.record.id, codeOf(error))
      }
    }
  }

  function clearTimer() {
    if (timer === undefined) return
    clearTimeout(timer)
    timer = undefined
  }

  function scheduleNext() {
    clearTimer()
    if (closed) return
    let next
    for (const task of tasks) {
      if (task.status !== TASK_STATUS.active || failed.has(task.record.id)) continue
      const at = Date.parse(task.record.scheduledAt)
      if (next === undefined || at < next) next = at
    }
    if (next === undefined) return
    timer = setTimeout(() => {
      timer = undefined
      requestDrive()
    }, Math.max(0, Math.min(next - Date.now(), TIMER.maxDelayMs)))
    timer.unref?.()
  }

  /** One dispatch loop; a request arriving while it runs is folded into another pass. */
  function requestDrive() {
    if (closed) return
    requested = true
    if (driving) return
    driving = true
    void (async () => {
      try {
        await ready
        while (requested && !closed) {
          requested = false
          await mutate(deliverDue)
        }
      } catch (error) {
        logger?.warn('the reminder dispatch stopped (%s)', codeOf(error))
      } finally {
        driving = false
        scheduleNext()
      }
    })()
  }

  function close() {
    if (closed) return
    closed = true
    clearTimer()
    listeners.clear()
  }

  // ── agent tools ─────────────────────────────────────────────────────────────────────────────

  function toolFailure(error) {
    if (error instanceof ScheduleRuleError) return { code: error.code, message: error.message }
    if (error instanceof ReminderApiError) return { code: error.code, message: error.message }
    return { code: CODE.internal, message: MESSAGE.toolFailed }
  }

  function toolIdOf(value) {
    if (typeof value !== 'string' || value === '' || value.trim() !== value) throw new ScheduleRuleError(RULE_ERROR.rule, MESSAGE.id)
    return value
  }

  function toolRecord(value, fields) {
    const record = exactRecord(value, fields)
    if (record === undefined) throw new ScheduleRuleError(RULE_ERROR.rule, MESSAGE.toolSelector)
    return record
  }

  /** Map one tool selector (the schedule tool's snake_case spelling) to the normalized timing. */
  function toolTiming(args, name) {
    if (name === TOOL_SELECTOR.after) return { kind: KIND.after, afterSeconds: args.after_seconds }
    if (name === TOOL_SELECTOR.at) {
      const at = args.at
      if (typeof at === 'string') return { kind: KIND.at, at }
      const local = toolRecord(at, ['date', 'time', 'time_zone'])
      return { kind: KIND.at, at: { date: local.date, time: local.time, timeZone: local.time_zone } }
    }
    if (name === TOOL_SELECTOR.every) return { kind: KIND.every, everySeconds: args.every_seconds }
    if (name === TOOL_SELECTOR.daily) {
      const daily = toolRecord(args.daily, ['time', 'time_zone'])
      return { kind: KIND.daily, time: daily.time, timeZone: daily.time_zone }
    }
    if (name === TOOL_SELECTOR.weekly) {
      const weekly = toolRecord(args.weekly, ['time', 'time_zone', 'weekdays'])
      return { kind: KIND.weekly, time: weekly.time, timeZone: weekly.time_zone, weekdays: weekly.weekdays }
    }
    const cron = toolRecord(args.cron, ['expression', 'time_zone'])
    return { kind: KIND.cron, expression: cron.expression, timeZone: cron.time_zone }
  }

  function toolSelector(args, selectors, message) {
    const present = selectors.filter((field) => args[field] !== undefined)
    if (present.length > 1) throw new ScheduleRuleError(RULE_ERROR.selector, message)
    return present[0]
  }

  /** Run one tool call for the calling Agent's own Session; a subagent target is refused. */
  async function withAgent(exec, work) {
    const agent = exec?.agent
    if (agent === undefined) return { code: CODE.internal, message: MESSAGE.toolFailed }
    try {
      await requireStore()
      return await work(String(agent.session.id))
    } catch (error) {
      return toolFailure(error)
    }
  }

  function toolDefinitions() {
    return [
      {
        name: TOOL.create,
        description: TEXT.create,
        parameters: {
          prompt: { ...STRING, required: true, description: TEXT.prompt },
          title: { ...STRING, required: true, description: TEXT.title },
          after_seconds: { ...NUMBER, description: TEXT.afterSeconds },
          ...SELECTOR_PARAMETERS,
        },
        output: OUTPUT,
        async execute(args, exec) {
          return withAgent(exec, async (sessionId) => {
            const field = toolSelector(args, CREATE_SELECTORS, MESSAGE.createSelector)
            if (field === undefined) throw new ScheduleRuleError(RULE_ERROR.selector, MESSAGE.createSelector)
            // Only the chat's own Session can receive a reminder: the resolver delegates any
            // other Session and reports no live Agent, which would leave a task undeliverable.
            const live = await resolveAgent(sessionId, async () => undefined)
            if (live === undefined) return { code: CODE.subagent, message: MESSAGE.subagent }
            const now = Date.now()
            const task = await createTask({ sessionId, title: args.title, prompt: args.prompt, timing: toolTiming(args, field), now })
            requestDrive()
            return toolView(task, now)
          })
        },
      },
      {
        name: TOOL.list,
        description: TEXT.list,
        parameters: {},
        output: OUTPUT,
        async execute(_args, exec) {
          return withAgent(exec, async (sessionId) => {
            const now = Date.now()
            return tasks.filter((task) => task.sessionId === sessionId).sort(compareTasks).map((task) => toolView(task, now))
          })
        },
      },
      {
        name: TOOL.update,
        description: TEXT.update,
        parameters: {
          id: { ...STRING, required: true, description: TEXT.id },
          title: { ...STRING, description: TEXT.title },
          prompt: { ...STRING, description: TEXT.prompt },
          ...SELECTOR_PARAMETERS,
        },
        output: OUTPUT,
        async execute(args, exec) {
          return withAgent(exec, async (sessionId) => {
            const field = toolSelector(args, UPDATE_SELECTORS, MESSAGE.updateSelector)
            if (field === undefined && args.title === undefined && args.prompt === undefined) {
              throw new ScheduleRuleError(RULE_ERROR.selector, MESSAGE.updateNeeds)
            }
            const patch = {}
            if (args.title !== undefined) patch.title = args.title
            if (args.prompt !== undefined) patch.prompt = args.prompt
            if (field !== undefined) patch.timing = toolTiming(args, field)
            const now = Date.now()
            const outcome = await updateTask(toolIdOf(args.id), patch, now, sessionId)
            if (!('task' in outcome)) return outcome.result
            requestDrive()
            return toolView(outcome.task, now)
          })
        },
      },
      {
        name: TOOL.delete,
        description: TEXT.delete,
        parameters: { id: { ...STRING, required: true, description: TEXT.exactId } },
        output: OUTPUT,
        async execute(args, exec) {
          return withAgent(exec, async (sessionId) => {
            const result = (await cancelTask(toolIdOf(args.id), sessionId)).result
            return 'deleted' in result ? result : { ...result, deleted: false }
          })
        },
      },
    ]
  }

  function registerTools(tools) {
    for (const definition of toolDefinitions()) tools.register(defineTool(definition))
  }

  // A context without a tools service (and without inject) still serves the list and the API.
  if (typeof ctx.inject === 'function') {
    ctx.inject(['tools'], (scope) => {
      if (typeof scope.tools?.register === 'function') registerTools(scope.tools)
    })
  }
  if (typeof ctx.effect === 'function') ctx.effect(() => () => close())

  void ready.then(() => requestDrive())

  return Object.freeze({ handle, subscribe })
}
