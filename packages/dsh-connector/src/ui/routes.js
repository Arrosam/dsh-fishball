/**
 * The UI backend's owner-only DSH Fetch routes and its live-change stream (task C-UI-BACKEND;
 * requirements 1.34; R-UI-05, R-UI-10, R-FN-01; design §3.6, §13.6). Embed-UI's browser half
 * calls them; it never calls a host-only service itself and keeps no state of its own.
 *
 * DSH's `connection.fetch` is owner-only and applies its Host/Origin fence before a handler runs
 * (dsh-client-connection, both SDKs), so a handler validates only its body. Every answer is JSON
 * with `no-store`, except the stream. Nothing here carries a token: principals are K3 keys only.
 *
 * The stream follows V2's state stream (src/http.js `events`): one frame at once, then one per
 * change. `json`, `isRecord` and the stream repeat src/http.js on purpose: that file is bound to
 * V2's row state, is outside this task, and is deleted by REMOVE-V2, after which this copy is the
 * only one. Revisit if src/http.js outlives REMOVE-V2.
 */
import { HTTP, HTTP_METHOD, REQUEST_BODY_BUFFERED, RESPONSE_HEADERS } from '../constants.js'
import { diagnosticOf } from '../errors.js'
import { byteLength } from '../text.js'
import { LOG, SSE, UI_BODY, UI_CODE, UI_ROUTE } from './constants.js'

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: RESPONSE_HEADERS.json })
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const INVALID = () => json(HTTP.badRequest, { ok: false, code: UI_CODE.invalid })

/**
 * The closed body `shape` of a request as its fields, or undefined: not JSON, over
 * UI_BODY.maxBytes, a key outside the shape, a required field missing, or a field not a string.
 */
async function closedBody(request, shape) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (byteLength(text) > UI_BODY.maxBytes) return undefined
  let body
  try { body = JSON.parse(text) } catch { return undefined }
  if (!isRecord(body)) return undefined
  const known = [...shape.required, ...shape.optional]
  const keys = Object.keys(body)
  if (!keys.every((key) => known.includes(key)) || !shape.required.every((key) => keys.includes(key))) return undefined
  return keys.every((key) => typeof body[key] === 'string') ? body : undefined
}

/**
 * @param {object} deps
 * @param deps.handover - K3 `DshConnectorHandover`
 * @param deps.state - the UI state (`./state.js`)
 * @param deps.streams - the stream set (`createStreams`)
 * @param deps.maxNoteBytes - `() => number`: the live note bound in UTF-8 bytes (the connector's
 *   `maxMessageBytes`); a note over it is refused before the hand-over service is called
 * @param deps.logger - `{warn}`
 * @returns `[{path, methods, fetch}]`
 */
export function uiRoutes({ handover, state, streams, maxNoteBytes, logger }) {
  const snapshot = () => state.snapshot()
  const answered = (fields) => json(HTTP.ok, { ok: true, ...fields, state: snapshot() })

  /**
   * A K3 operation: success 200 with the fields `fieldsOf(result)` picks, so only the contract's
   * fields reach the browser; a refusal 409 (data, K3); a throw 500 with no detail.
   */
  const operation = (shape, run, fieldsOf) => async (request) => {
    const body = await closedBody(request, shape)
    if (body === undefined) return INVALID()
    if (body.note !== undefined && byteLength(body.note) > maxNoteBytes()) return json(HTTP.badRequest, { ok: false, code: UI_CODE.noteTooLarge })
    let result
    try { result = await run(body) } catch (error) {
      logger.warn(LOG.format, LOG.handoverFailed, diagnosticOf(error))
      return json(HTTP.serverError, { ok: false, code: UI_CODE.failed })
    }
    if (result?.ok !== true) return json(HTTP.conflict, { ok: false, code: result?.code, state: snapshot() })
    return answered(fieldsOf(result))
  }
  /** A UI-state change with no body: its answer is the new snapshot. */
  const change = (apply) => async () => { apply(); return answered({}) }
  // An omitted note stays omitted, so K3's own default ('') applies.
  const noteArgs = (note) => (note === undefined ? [] : [note])

  return [
    { path: UI_ROUTE.state, methods: [HTTP_METHOD.get], fetch: async () => json(HTTP.ok, { ok: true, state: snapshot() }) },
    { path: UI_ROUTE.events, methods: [HTTP_METHOD.get], fetch: async (request) => streams.open(request) },
    {
      path: UI_ROUTE.handOver,
      methods: [HTTP_METHOD.post],
      fetch: operation(UI_BODY.handOver, ({ sessionId, principalKey, note }) => handover.handOver(sessionId, principalKey, ...noteArgs(note)), ({ principal }) => ({ principal })),
    },
    {
      path: UI_ROUTE.takeBack,
      methods: [HTTP_METHOD.post],
      fetch: operation(UI_BODY.takeBack, ({ sessionId, note }) => handover.takeBack(sessionId, ...noteArgs(note)), () => ({})),
    },
    { path: UI_ROUTE.dismiss, methods: [HTTP_METHOD.post], fetch: change(() => state.dismiss()) },
    { path: UI_ROUTE.opened, methods: [HTTP_METHOD.post], fetch: change(() => state.opened()) },
  ]
}

/**
 * The open event streams. `open(request)` answers one stream; `publish()` sends the snapshot now
 * to every open one; `close()` ends them all. A stream ends when its request aborts, when its
 * reader cancels, or when a write to it fails (a browser that went away between abort and cleanup).
 * After `close()` a new request gets a stream that ends at once, after its one frame.
 *
 * Bounded per reader (review UI-02): a frame is a whole current-state snapshot, not a ledger entry,
 * so a reader that does not drain needs only the latest one. Each stream queues at most
 * `SSE.queuedFrames` frames (its strategy's high-water mark) and keeps one more, the latest, aside;
 * a newer snapshot replaces that one, and `pull` (the reader made room) queues it. A stalled
 * browser therefore holds a constant number of frames however many changes the agents cause, and
 * when it drains, its last frame is the current state.
 * @param snapshot - `() => Snapshot`
 * @param logger - `{warn}`: a snapshot that throws while publishing is logged, never thrown into
 *   the change that caused it (that change has already taken effect)
 */
export function createStreams(snapshot, logger) {
  const encoder = new TextEncoder()
  const open = new Set()
  let closed = false
  const frame = (value) => encoder.encode(SSE.prefix + JSON.stringify(value) + SSE.suffix)

  function start(request) {
    let stream
    // Built before the stream is tracked, so a snapshot that throws leaves no stream behind (the
    // route then fails as a whole).
    const first = frame(snapshot())
    /** The latest frame the reader had no room for yet, or undefined (see above). */
    let pending
    let controller
    const enqueue = (bytes) => { try { controller.enqueue(bytes) } catch { stream.end() } }
    const body = new ReadableStream({
      start(streamController) {
        controller = streamController
        const end = () => {
          if (!open.delete(stream)) return
          request.signal?.removeEventListener('abort', end)
          pending = undefined
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        stream = {
          end,
          // While a frame is held aside, a newer one replaces it there, even if the queue has room
          // again: the reader can empty the queue while a pull is still running, and a direct
          // enqueue would then be followed by the older held frame (review of R-FIX-CUI).
          push(bytes) {
            if (pending === undefined && controller.desiredSize > 0) enqueue(bytes)
            else pending = bytes
          },
        }
        open.add(stream)
        request.signal?.addEventListener('abort', end, { once: true })
        stream.push(first)
        if (closed || request.signal?.aborted) end()
      },
      pull() {
        if (pending === undefined) return
        const bytes = pending
        pending = undefined
        enqueue(bytes)
      },
      cancel: () => stream?.end(),
    }, new CountQueuingStrategy({ highWaterMark: SSE.queuedFrames }))
    return new Response(body, { status: HTTP.ok, headers: RESPONSE_HEADERS.eventStream })
  }

  return Object.freeze({
    open: start,
    publish() {
      if (open.size === 0) return
      let bytes
      try { bytes = frame(snapshot()) } catch (error) {
        logger.warn(LOG.format, LOG.publishFailed, diagnosticOf(error))
        return
      }
      for (const stream of [...open]) stream.push(bytes)
    },
    close() {
      closed = true
      for (const stream of [...open]) stream.end()
    },
  })
}

/**
 * Registers one route, as V2's are (src/http.js), and returns its disposer. The caller holds it
 * inside its own effect, so the routes leave with the service they belong to.
 * @param ctx - the connector row's context (`connection.fetch`)
 */
export const registerUiRoute = (ctx, route) => ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED })
