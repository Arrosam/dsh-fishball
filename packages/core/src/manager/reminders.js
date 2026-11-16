/**
 * Fishball's reminders: the manager's own durable tasks and its four schedule tools.
 *
 * Lives in core's manager folder since V3 F-WIRE (the user's decision 2026-11-16: keep reminders,
 * move them into V3 core unchanged, minus the earlier page routes). It does not mount DSH's
 * `schedule` service:
 * - 0.2.1-rc.3/rc.5 hard-inject `sessionController`, which only the Web bundle provides, so the
 *   service cannot be relied on in every composition core runs in;
 * - the service and tool contracts differ between rc.3/rc.5 (`list`/`update`/`delete`) and
 *   0.2.2-rc.1 (`list`/`view`/`edit`). A stub service would have to shadow a Web-owned DSH
 *   service and branch on the installed version in the tools.
 * Instead this module keeps its own durable tasks under the profile home and delivers them through
 * the caller's activation owner (`resolveAgent`):
 * - `reminder-schedule.js` owns the timing rules and the store schema (after / at / every /
 *   daily / weekly / cron), so the delivered task's shape and the schedule tool's semantics stay
 *   the same on every supported DSH version;
 * - every task is written to `<profile home>/fishball/reminders.json` before it is acknowledged,
 *   so a restart loses nothing. On startup a missed one-shot fires once and a missed recurring
 *   task fires once for its latest occurrence, then keeps its cadence;
 * - the agent gets `schedule_create`, `schedule_list`, `schedule_update` and `schedule_delete`
 *   with the schedule tool's names and parameters, so the persona and the model's habits carry
 *   over from the main DSH. They are registered only into the scope the caller passes to
 *   `registerTools` (the manager's own agent scope), never globally.
 */
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL } from './reminder-tools.js'
import {
  advance,
  decodeRecord,
  KIND,
  MIN_EVERY_SECONDS,
  normalizePrompt,
  normalizeTitle,
  recordFor,
  RULE_ERROR,
  ScheduleRuleError,
  TIMING_FIELDS,
  TITLE_MAX_CHARS,
} from './reminder-schedule.js'

const LOGGER = 'fishball-native-reminders'
/** The one boundary failure the tools return as data: the durable store could not be read. */
const ERROR = Object.freeze({ unavailable: 'schedule-unavailable' })

/** Stable result codes this module returns as data, mirroring the schedule service's own. */
const CODE = Object.freeze({
  notFound: 'schedule_not_found',
  subagent: 'subagent_session',
  internal: 'internal_error',
})

const MESSAGE = Object.freeze({
  // Model-facing (a tool result), so the wording is kept as it was.
  unavailable: 'The child reminder store is unavailable.',
  toolFailed: 'The schedule operation failed.',
  subagent: 'A delegated subagent cannot use scheduled tasks.',
  toolSelector: 'the tool selector is malformed.',
  id: 'the reminder id must be a non-empty trimmed string.',
  createSelector: 'schedule_create accepts exactly one of after_seconds, at, every_seconds, daily, weekly, or cron.',
  updateSelector: 'schedule_update accepts at most one of at, every_seconds, daily, weekly, or cron.',
  updateNeeds: 'schedule_update needs a new title, prompt, or one of at, every_seconds, daily, weekly, or cron.',
})

/**
 * Stored task states; `schedule_list` reports them as each reminder's `status`. Nothing sets
 * `paused` since the V2 page API went (F-WIRE); it stays a valid stored state so a store holding
 * one still loads and lists it rather than being refused.
 */
const TASK_STATUS = Object.freeze({ active: 'active', paused: 'paused', ended: 'ended' })

/** The two delivery states the schedule tool reports; a stale target reads `overdue`. */
const TOOL_STATE = Object.freeze({ scheduled: 'scheduled', overdue: 'overdue' })

/** One durable store in Fishball's private directory under the profile home, its own file. */
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

/** Fields a reminder view keeps; target ids and Host bookkeeping never leave this module. */
const VIEW_FIELDS = Object.freeze(['id', 'title', 'prompt', 'kind', 'scheduledAt'])
/** A receipt keeps only what a list row can show, not the message id or target Session. */
const RECEIPT_FIELDS = Object.freeze(['scheduledAt', 'deliveredAt'])

/** The four tool names and parameters the DSH schedule tool publishes. */
// The model tools' names live in reminder-tools.js (a module with no host import), so the persona
// and the guard check can read them without loading DSH's packages.
export { TOOL } from './reminder-tools.js'
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

/** A typed boundary refusal; a tool returns `code` and `message` unchanged. */
class ReminderStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ReminderStoreError'
    this.code = code
  }
}

function unavailable() { throw new ReminderStoreError(ERROR.unavailable, MESSAGE.unavailable) }

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)
const codeOf = (error) => String(error?.code ?? error?.name ?? error)

function copyDefined(source, target, field) {
  if (source[field] !== undefined) target[field] = source[field]
}

/** One stored task as a reminder view model; unknown future fields never leak out. */
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

/** An object with exactly the named keys, or undefined when its shape differs. */
function exactRecord(value, fields) {
  if (!isRecord(value)) return undefined
  const keys = Object.keys(value)
  if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) return undefined
  return value
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
 * Create the reminder store and its delivery over a row's Cordis context.
 *
 * @param {object} ctx - the owning row's context; it must have `get` and `on`.
 *   `profileContext.home` names the private store, `sessions` acknowledges a delivery, and
 *   `effect` (when present) stops the timer with the row.
 * @param {object} [options]
 * @param {(sessionId: string, next: () => Promise<object|undefined>) => Promise<object|undefined>}
 *   [options.resolveAgent] - the caller's activation owner. Delivery resumes the reminder's target
 *   Session through it; a target it does not own is asked to `next()` and an `undefined` answer
 *   means no live Agent, so the reminder cannot be delivered. `schedule_create` uses the same
 *   answer to refuse a Session it does not own.
 * @returns {{ registerTools: (tools: {register(definition: object): () => void}) => () => void, close: () => void }}
 *   `registerTools` registers the four schedule tools into the given DSH `tools` service (an agent
 *   scope's) and returns one disposer that removes all four; `close` stops delivery and the timer
 *   (idempotent; the row's effect calls it too).
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
    throw new TypeError('fishball-native-reminders: the profile home is required')
  }
  const logger = typeof ctx.logger === 'function' ? ctx.logger(LOGGER) : undefined
  const directory = path.join(profile.home, STORE.directory)
  const file = path.join(directory, STORE.file)
  let tasks = []
  let storeError
  let closed = false
  let timer
  let chain = Promise.resolve()
  let driving = false
  let requested = false
  let failed = new Set()

  const ready = load()

  /** One durable write at a time, so a delivery and a tool edit never overwrite each other. */
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
  }

  async function requireStore() {
    await ready
    if (storeError !== undefined) unavailable()
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
   * Apply one update to the task's content or timing, for the calling Session's tasks only. A
   * timing change re-arms the task from the update time and makes it active again.
   */
  async function updateTask(id, patch, now, sessionId) {
    return mutate(async () => {
      const index = tasks.findIndex((task) => task.record.id === id && task.sessionId === sessionId)
      if (index === -1) return { result: { id, updated: false, code: CODE.notFound } }
      const current = tasks[index]
      const title = patch.title ?? current.record.title
      const prompt = patch.prompt ?? current.record.prompt
      let record = current.record
      let status = current.status
      if (patch.timing !== undefined) {
        record = recordFor({ id, title, prompt, timing: patch.timing, now })
        status = TASK_STATUS.active
      } else if (patch.title !== undefined || patch.prompt !== undefined) {
        record = Object.freeze({ ...record, title: normalizeTitle(title), prompt: normalizePrompt(prompt) })
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
      const next = tasks.filter((task) => task.record.id !== id || task.sessionId !== sessionId)
      if (next.length === tasks.length) return { result: { id, code: CODE.notFound } }
      await commit(next)
      return { result: { id, deleted: true } }
    })
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
  }

  // ── agent tools ─────────────────────────────────────────────────────────────────────────────

  function toolFailure(error) {
    if (error instanceof ScheduleRuleError) return { code: error.code, message: error.message }
    if (error instanceof ReminderStoreError) return { code: error.code, message: error.message }
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

  /**
   * Register the four tools into one scope's tools service. Not global: the caller passes the
   * manager's own agent scope, so no other agent gets them. Tool state (the store, the timer)
   * stays here, so registering in a later manager generation sees the same tasks.
   */
  function registerTools(tools) {
    if (typeof tools?.register !== 'function') throw new TypeError('fishball-native-reminders: a tools service with register() is required')
    const removers = toolDefinitions().map((definition) => tools.register(defineTool(definition)))
    return () => { for (const remove of removers) remove() }
  }

  if (typeof ctx.effect === 'function') ctx.effect(() => () => close())

  void ready.then(() => requestDrive())

  return Object.freeze({ registerTools, close })
}
