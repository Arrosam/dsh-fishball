/**
 * Host API on DSH's authenticated /api channel (DESIGN §10). DSH has already applied its
 * browser authentication and same-origin fence; bodies are validated here.
 *
 * GET  state                  -> current snapshot (JSON)
 * GET  events                 -> server-sent snapshots: one at once, then one per change
 * POST recovery               -> { action: 'retry' | 'adopt' }
 * POST plugins                -> { plugin: string, on: boolean } (your own choice, DESIGN §4)
 * POST tool-approvals/remove  -> { toolKey: string } (withdraw an allowance, DESIGN §7)
 */
import { API, API_CODE, HTTP, HTTP_METHOD, RECOVERY_ACTION, REQUEST_BODY_BUFFERED, RESPONSE_HEADERS } from './constants.js'
import { LifecycleStateError } from './errors.js'

const ACTIONS = new Set(Object.values(RECOVERY_ACTION))
const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: RESPONSE_HEADERS.json })
const frame = (payload) => `data: ${JSON.stringify(payload)}\n\n`

const isRecord = (body) => body !== null && typeof body === 'object' && !Array.isArray(body)
const isName = (value) => typeof value === 'string' && value.length > 0

/** Body readers: the validated command, or undefined for anything malformed. */
const BODY = Object.freeze({
  recovery: (body) => (isRecord(body) && ACTIONS.has(body.action) ? body.action : undefined),
  plugin: (body) => (isRecord(body) && isName(body.plugin) && typeof body.on === 'boolean' ? { plugin: body.plugin, on: body.on } : undefined),
  toolApproval: (body) => (isRecord(body) && isName(body.toolKey) ? body.toolKey : undefined),
})

/**
 * Register the routes; they are removed with the plugin context.
 * @param ctx - fishball row context (needs connection).
 * @param state - { snapshot(), subscribe(fn), recover(action), setPlugin(plugin, on),
 *   removeAllowance(toolKey) }; the commands reject LifecycleStateError for a 409.
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

  /**
   * One POST command: parse and validate the body, run it, answer with the new state.
   * A LifecycleStateError answers 409 with its code; anything else 500 `failed`.
   */
  const command = (read, run) => async (request) => {
    let body
    try { body = await request.json() } catch { return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody }) }
    const input = read(body)
    if (input === undefined) return json(HTTP.badRequest, { ok: false, code: API_CODE.badBody })
    try {
      await run(input)
      return json(HTTP.ok, { ok: true, state: state.snapshot() })
    } catch (error) {
      if (error instanceof LifecycleStateError) return json(HTTP.conflict, { ok: false, code: error.code })
      return json(HTTP.serverError, { ok: false, code: API_CODE.failed })
    }
  }

  const routes = [
    { path: API.state, methods: [HTTP_METHOD.get], fetch: () => Promise.resolve(json(HTTP.ok, state.snapshot())) },
    { path: API.events, methods: [HTTP_METHOD.get], fetch: events },
    { path: API.recovery, methods: [HTTP_METHOD.post], fetch: command(BODY.recovery, (action) => state.recover(action)) },
    { path: API.plugins, methods: [HTTP_METHOD.post], fetch: command(BODY.plugin, ({ plugin, on }) => state.setPlugin(plugin, on)) },
    { path: API.toolApprovals, methods: [HTTP_METHOD.post], fetch: command(BODY.toolApproval, (toolKey) => state.removeAllowance(toolKey)) },
  ]
  for (const route of routes) {
    ctx.effect(() => ctx.connection.fetch.register({ ...route, requestBody: REQUEST_BODY_BUFFERED }), `fishball: ${route.path}`)
  }
}
