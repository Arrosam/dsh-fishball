/**
 * Reminders in the slim child (§15 T10).
 *
 * DSH 0.2.2 already owns reminders end to end, so this module adds no timing, storage or
 * delivery:
 * - the `schedule` row (T02's overlay) persists every task in the child's own DSH home
 *   (`<DSH_HOME>/storages/schedule.json`), loads it when the host opens, and delivers a due task
 *   into its target Session as a user message;
 * - the `tool-schedule` row gives the Fishball agent `schedule_create`, `schedule_list`,
 *   `schedule_view` and `schedule_edit` (update, pause, resume and delete), including the
 *   `this_session` target, so creating and editing from chat needs no code here;
 * - `schedule/changed` fires after every durable write, including a delivery, so the UI can
 *   re-read a short list instead of tracking individual tasks.
 *
 * What the services do not have is the child-owned surface the slim UI reads: this module maps a
 * Schedule page into reminder view models, validates the /api/reminders request/response contract
 * shared with src/slim/ui/reminders.js, and exposes the change subscription the app relays over
 * SSE. It also registers the embedding's `schedule/resolve-agent` handler when the app passes a
 * resolver: the Schedule runtime asks its embedding for a live Agent of an existing target
 * Session, and after a child restart only the chat module can resume Fishball's Session. Without
 * that handler DSH fails delivery with its own "no Session activation provider".
 *
 * API contract (the app's HTTP hook only reads the body and writes the answer):
 *   GET  /api/reminders[?active=true|false&limit=1..500&offset>=0]
 *        -> 200 { items, shown, total, limit, offset }; items are reminder view models.
 *   POST /api/reminders { action: "update", id, patch: { title?, prompt?, rrule?, active? } }
 *        -> 200 reminder view model, or { id, code: "schedule_not_found" }.
 *   POST /api/reminders { action: "cancel", id }
 *        -> 200 { id, deleted: true }, or { id, code: "schedule_not_found" }.
 *   400 { code, message } for an invalid request or a typed Schedule refusal (invalid_rule, ...).
 *   405 for any other method; 503 while the child runs no schedule service; 500 for a failure
 *   DSH did not type.
 * A Schedule miss is data, not an exception, mirroring the service's own result types. HEAD is
 * accepted with GET and the caller drops the body. The body is bounded by the embed's 1 MiB JSON
 * limit, which the HTTP hook owns (§3.6).
 */
import { ROUTES } from '../contract.js'

/** Names owned by DSH 0.2.2's Schedule service, tool and events; only these strings cross here. */
const DSH = Object.freeze({
  service: 'schedule',
  changed: 'schedule/changed',
  resolveAgent: 'schedule/resolve-agent',
  update: 'update',
  delete: 'delete',
  rrule: 'rrule',
})

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

const METHOD = Object.freeze({ get: 'GET', head: 'HEAD', post: 'POST' })
const HTTP = Object.freeze({ ok: 200, badRequest: 400, methodNotAllowed: 405, unavailable: 503, failed: 500 })
const ERROR = Object.freeze({
  unavailable: 'schedule-unavailable',
  invalid: 'invalid-input',
  method: 'method-not-allowed',
  failed: 'schedule-failed',
})
/** Only codes this module raises carry their own status; a typed DSH refusal is a 400. */
const ERROR_STATUS = Object.freeze({ [ERROR.invalid]: HTTP.badRequest, [ERROR.unavailable]: HTTP.unavailable })
const MESSAGE = Object.freeze({
  unavailable: 'The child is not running the schedule service.',
  invalid: 'The reminder request is invalid.',
  method: 'The reminder API accepts GET and POST.',
  failed: 'The reminder operation failed.',
})

const QUERY = Object.freeze({ active: 'active', limit: 'limit', offset: 'offset' })
const FLAG = Object.freeze({ on: 'true', off: 'false' })
// A canonical non-negative integer only: Number("1e2") or " 1" must not become a page bound.
const INTEGER_TEXT = /^(?:0|[1-9]\d*)$/
const BODY = Object.freeze({ action: 'action', id: 'id', patch: 'patch' })
const PATCH = Object.freeze({ title: 'title', prompt: 'prompt', rrule: 'rrule', active: 'active' })
const PATCH_FIELDS = Object.freeze(Object.values(PATCH))
const CANCEL_KEYS = Object.freeze([BODY.action, BODY.id])
const UPDATE_KEYS = Object.freeze([BODY.action, BODY.id, BODY.patch])

/** Task fields the slim view keeps; target ids and Host bookkeeping stay in the child service. */
const VIEW_FIELDS = Object.freeze(['id', 'title', 'prompt', 'status', 'kind', 'scheduledAt', 'createdAt', 'updatedAt'])
/** One field per timing kind; the record carries exactly the fields its `kind` selects. */
const TIMING_FIELDS = Object.freeze(['rrule', 'expression', 'timeZone', 'afterSeconds', 'everySeconds', 'time', 'weekdays'])
/** A receipt keeps only what a list row can show, not the message id or target Session. */
const RECEIPT_FIELDS = Object.freeze(['scheduledAt', 'deliveredAt'])

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

function copyDefined(source, target, field) {
  if (source[field] !== undefined) target[field] = source[field]
}

/** One Schedule catalog entry as the slim view model; unknown future fields never leak out. */
function reminderOf(entry) {
  const reminder = {}
  for (const field of VIEW_FIELDS) copyDefined(entry, reminder, field)
  for (const field of TIMING_FIELDS) copyDefined(entry, reminder, field)
  if (entry.lastDelivery !== undefined) {
    const receipt = {}
    for (const field of RECEIPT_FIELDS) copyDefined(entry.lastDelivery, receipt, field)
    reminder.lastDelivery = receipt
  }
  return reminder
}

function idOf(value) {
  // Schedule ids are stored trimmed; an untrimmed id can only miss, so refuse it at the boundary.
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

function listRequest(query) {
  if (query === undefined) return {}
  if (typeof query.get !== 'function') throw new TypeError('fishball-native-app: the reminder query must be URLSearchParams')
  const request = {}
  const active = activeOf(query.get(QUERY.active))
  if (active !== undefined) request.active = active
  const limit = integerOf(query.get(QUERY.limit))
  if (limit !== undefined) request.limit = limit
  const offset = integerOf(query.get(QUERY.offset))
  if (offset !== undefined) request.offset = offset
  return request
}

/** Translate the API's one timing field into the Schedule patch the service validates. */
function patchOf(value) {
  if (!isRecord(value)) invalid()
  const keys = Object.keys(value)
  if (keys.length === 0 || keys.some((key) => !PATCH_FIELDS.includes(key))) invalid()
  const patch = {}
  if (keys.includes(PATCH.title)) patch.title = textOf(value[PATCH.title])
  if (keys.includes(PATCH.prompt)) patch.prompt = textOf(value[PATCH.prompt])
  if (keys.includes(PATCH.rrule)) patch.timing = { kind: DSH.rrule, rrule: textOf(value[PATCH.rrule]) }
  if (keys.includes(PATCH.active)) patch.active = booleanOf(value[PATCH.active])
  return patch
}

function failureOf(error) {
  if (error instanceof ReminderApiError) {
    return { status: ERROR_STATUS[error.code] ?? HTTP.failed, body: { code: error.code, message: error.message } }
  }
  // DSH's ScheduleInputError cannot be imported into the child's copied tree, so its name and
  // typed `code` (invalid_rule, subagent_session, ...) are the contract for a 400.
  if (error instanceof Error && error.name === 'ScheduleInputError' && typeof error.code === 'string') {
    return { status: HTTP.badRequest, body: { code: error.code, message: error.message } }
  }
  return { status: HTTP.failed, body: { code: ERROR.failed, message: MESSAGE.failed } }
}

/**
 * Create the reminder surface over a child's Cordis context.
 *
 * @param {object} ctx - the fishball-native-app row's context. Only `get` and `on` are used, so
 *   the app can create the service before the `schedule` row finishes loading; every request
 *   reads the service through `ctx.get` and answers 503 while it is absent.
 * @param {object} [options]
 * @param {(sessionId: string, next: () => Promise<object>) => Promise<object>} [options.resolveAgent] -
 *   the chat module's activation owner for `schedule/resolve-agent`. It returns Fishball's live
 *   (or resumed) Agent for that Session, and delegates with `next()` for a Session it does not
 *   own. Without it the app has no provider and the Schedule runtime cannot deliver a reminder
 *   into an existing Session, which is every reminder created with `this_session`.
 * @returns {{ handle: (request: object) => Promise<{status: number, body: object}>, subscribe: (listener: () => void) => () => void }}
 *   `handle` serves the HTTP hook; `subscribe` registers an SSE relay and returns its remover.
 */
export function createReminders(ctx, options = {}) {
  if (!ctx || typeof ctx.get !== 'function' || typeof ctx.on !== 'function') {
    throw new TypeError('fishball-native-app: a Cordis context with get() and on() is required')
  }
  const { resolveAgent } = options ?? {}
  if (resolveAgent !== undefined && typeof resolveAgent !== 'function') {
    throw new TypeError('fishball-native-app: resolveAgent must be a function')
  }

  const listeners = new Set()
  // One shared event: every connected stream re-reads the same page, so one broken listener must
  // neither stop the others nor reach the Schedule runtime's own write path.
  ctx.on(DSH.changed, () => {
    for (const listener of [...listeners]) {
      try { listener() } catch { /* a closed or broken SSE stream */ }
    }
  })
  // The embedding's activation seam (Schedule type: 'schedule/resolve-agent'). Registering the
  // app's resolver here keeps one owner for the whole Schedule integration in the child.
  if (resolveAgent !== undefined) ctx.on(DSH.resolveAgent, (sessionId, next) => resolveAgent(sessionId, next))

  function service() {
    const found = ctx.get(DSH.service)
    if (found === undefined) unavailable()
    return found
  }

  async function page(query) {
    const result = await service().list(listRequest(query))
    return { ...result, items: result.items.map(reminderOf) }
  }

  async function mutate(body) {
    if (!isRecord(body)) invalid()
    const keys = Object.keys(body)
    const id = idOf(body[BODY.id])
    if (body[BODY.action] === REMINDERS.action.cancel) {
      exactKeys(keys, CANCEL_KEYS)
      return service().edit({ id, action: DSH.delete })
    }
    if (body[BODY.action] === REMINDERS.action.update) {
      exactKeys(keys, UPDATE_KEYS)
      const result = await service().edit({ id, action: DSH.update, patch: patchOf(body[BODY.patch]) })
      // A Schedule catalog entry discriminates on `kind`; a miss or conflict is returned as data.
      return 'kind' in result ? reminderOf(result) : result
    }
    return invalid()
  }

  async function handle(request) {
    const { method, query, body } = request ?? {}
    try {
      if (method === METHOD.get || method === METHOD.head) return { status: HTTP.ok, body: await page(query) }
      if (method === METHOD.post) return { status: HTTP.ok, body: await mutate(body) }
      return { status: HTTP.methodNotAllowed, body: { code: ERROR.method, message: MESSAGE.method } }
    } catch (error) {
      return failureOf(error)
    }
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('fishball-native-app: a reminder change listener must be a function')
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  return Object.freeze({ handle, subscribe })
}
