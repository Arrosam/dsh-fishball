/**
 * Host API on DSH's authenticated /api channel (DESIGN §10, slim §5). DSH has already applied its
 * browser authentication and same-origin fence; bodies are validated here. These are the main
 * side's own routes only (the "body" of Fishball): the isolated child's pages and settings are
 * served by the child itself (src/slim/host/embed.js, settings-routes.js).
 *
 * GET  state                  -> current snapshot (JSON)
 * GET  events                 -> server-sent snapshots: one at once, then one per change
 * POST send                   -> { sessionId: string, note: string } (Hand over with a note, slim §8.3)
 * POST managed                -> { sessionId: string, managed: boolean } (Hand over / Take back,
 *                                DESIGN §10e); 409 unknown-session, is-fishball
 * POST requests/answer        -> { requestId: string, decision: 'allow' | 'reject', note?: string } (your
 *                                answer on a card, DESIGN §10e); 409 expired, too-large
 * POST watches                -> { sessionId: string } (tell Fishball when it finishes, DESIGN §5c);
 *                                409 unknown-session, is-fishball, archived, limit-reached
 * POST watches/remove         -> { watchId: string }; 409 unknown-watch
 * GET  connector/instance     -> the attached instance as the frame shows it (design §0.5 "The frame"):
 *                                { attached, name, ui, state, code, canRetry, attachCount }
 * POST connector/instance/retry -> no body; awaits the instance's retry() -> { ok: true, instance };
 *                                409 unavailable (no Retry offered) or NATIVE_UNAVAILABLE (it rejected)
 *
 * Retired by C2, so they answer 404: question-mode (the mode changes only in DSH's own form of the
 * row, design §0.7), brand and sidebar-entry (the icon is fixed, D22).
 */
import { API, API_CODE, CARD_DECISION, HTTP, HTTP_METHOD, REQUEST_BODY_BUFFERED, RESPONSE_HEADERS } from './constants.js'
import { LifecycleStateError } from './errors.js'

const CARD_DECISIONS = new Set(Object.values(CARD_DECISION))
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS.json })
/** A refused command: 409 unless the error names another status, with its extra fields (an invalid setting's path). */
const refusal = (error) => json(error.status ?? HTTP.conflict, { ok: false, code: error.code, ...error.fields })
const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`

const isRecord = (body) => body !== null && typeof body === 'object' && !Array.isArray(body)
const isName = (value) => typeof value === 'string' && value.length > 0
const isText = (value) => typeof value === 'string' && value.trim().length > 0

/** Body readers: the validated command, or undefined for anything malformed. */
const BODY = Object.freeze({
  managed: (body) => (isRecord(body) && isName(body.sessionId) && typeof body.managed === 'boolean' ? { sessionId: body.sessionId, managed: body.managed } : undefined),
  // An empty note is no note.
  requestAnswer: (body) => (isRecord(body) && isName(body.requestId) && CARD_DECISIONS.has(body.decision) && (body.note === undefined || typeof body.note === 'string')
    ? { requestId: body.requestId, decision: body.decision, ...(isText(body.note) ? { note: body.note.trim() } : {}) }
    : undefined),
  watch: (body) => (isRecord(body) && isName(body.sessionId) ? { sessionId: body.sessionId } : undefined),
  unwatch: (body) => (isRecord(body) && isName(body.watchId) ? { watchId: body.watchId } : undefined),
  send: (body) => (isRecord(body) && isName(body.sessionId) && typeof body.note === 'string' ? { sessionId: body.sessionId, note: body.note } : undefined),
})

/**
 * Register the routes; they are removed with the plugin context.
 * @param ctx - fishball row context (needs connection).
 * @param state - { snapshot(), subscribe(fn), send({ sessionId, note }), setManaged({ sessionId, managed }),
 *   answerRequest({ requestId, decision, note? }), addWatch({ sessionId }), removeWatch({ watchId }), instance(), retryInstance() }; the commands reject
 *   LifecycleStateError for a refusal (409 unless it names another status). instance() is the frame's
 *   view; retryInstance() resolves { ok } or { ok: false, code } and never rejects.
 */
export function registerRoutes(ctx, state) {
  const streams = new Set()
  ctx.effect(() => () => { for (const close of [...streams]) close() }, 'fishball: event streams')

  const events = (request) => {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser closed between abort and cleanup throws on enqueue; close it
        // here so one dead stream never surfaces as a listener failure.
        const push = (snapshot) => {
          try { controller.enqueue(encoder.encode(frame(snapshot))) } catch { close() }
        }
        const unsubscribe = state.subscribe(push)
        close = () => {
          if (!streams.delete(close)) return
          unsubscribe()
          request.signal.removeEventListener('abort', close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal.addEventListener('abort', close)
        push(state.snapshot())
      },
      cancel: () => close(),
    })
    return Promise.resolve(new Response(body, { status: HTTP.ok, headers: RESPONSE_HEADERS.eventStream }))
  }

  /** Share the result/error envelope across commands. */
  const result = async (run) => {
    try { return json(HTTP.ok, { ok: true, ...await run() }) } catch (error) {
      if (error instanceof LifecycleStateError) return refusal(error)
      return json(HTTP.serverError, { ok: false, code: API_CODE.failed })
    }
  }
  /** Parse and validate one POST; `answer` supplies the fields beside `ok: true`. */
  const post = (read, run, answer) => async (request) => {
    let body
    try { body = await request.json() } catch { return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody }) }
    const input = read(body)
    if (input === undefined) return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody })
    return result(async () => answer(await run(input)))
  }
  /** A command: its answer is the new state. */
  const command = (read, run) => post(read, run, () => ({ state: state.snapshot() }))
  /** The frame's Retry takes no body: a refusal keeps its code, an accepted one answers the new view. */
  const retryInstance = () => result(async () => {
    const answer = await state.retryInstance()
    if (!answer.ok) throw new LifecycleStateError(answer.code)
    return { instance: state.instance() }
  })

  const routes = [
    { path: API.state, methods: [HTTP_METHOD.get], fetch: () => Promise.resolve(json(HTTP.ok, state.snapshot())) },
    { path: API.events, methods: [HTTP_METHOD.get], fetch: events },
    { path: API.send, methods: [HTTP_METHOD.post], fetch: command(BODY.send, (input) => state.send(input)) },
    { path: API.managed, methods: [HTTP_METHOD.post], fetch: command(BODY.managed, (input) => state.setManaged(input)) },
    { path: API.requestsAnswer, methods: [HTTP_METHOD.post], fetch: command(BODY.requestAnswer, (input) => state.answerRequest(input)) },
    { path: API.watches, methods: [HTTP_METHOD.post], fetch: command(BODY.watch, (input) => state.addWatch(input)) },
    { path: API.watchesRemove, methods: [HTTP_METHOD.post], fetch: command(BODY.unwatch, (input) => state.removeWatch(input)) },
    { path: API.connectorInstance, methods: [HTTP_METHOD.get], fetch: () => Promise.resolve(json(HTTP.ok, state.instance())) },
    { path: API.connectorInstanceRetry, methods: [HTTP_METHOD.post], fetch: retryInstance },
  ]
  for (const route of routes) {
    ctx.effect(() => ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED }), `fishball: ${route.path}`)
  }
}
