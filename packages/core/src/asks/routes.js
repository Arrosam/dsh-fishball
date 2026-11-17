/**
 * The ask cards' owner-only Fetch routes in the Fishball DSH (task F-ASKCARD; R-FB-11; Q-U2). The
 * browser half (fishball-ui's client.asks.js) draws the cards from them in Fishball's own
 * conversation. DSH's `connection.fetch` is owner-only and applies its Host/Origin fence first, as for core's other
 * routes; F-WIRE calls this from core's row in the Fishball DSH only, never in a main DSH.
 * They are core's published routes, the seam fishball-ui's card reads (F-UI, R-FB-14).
 *
 * - GET `ASK_ROUTE.events`: an SSE stream; each frame is `{managerSessionId, cards}`, the first at
 *   once and then one per change of the card list or of the manager session's id. The manager id
 *   tells the page which conversation is Fishball's, so the card shows there only; a frame on its
 *   change is what shows cards already stored when the page connected before the manager existed.
 *   The stream is the connector's state stream (dsh-connector src/http.js `events`), copied because
 *   the two sides share no package (requirements 1.39).
 * - POST `ASK_ROUTE.answer` `{handle, choice, text?}` (MULTI-0: the card's opaque target-qualified
 *   `handle`, `SEAM_TARGETS.ask.handleField`, never a raw `approvalId`): `service.answer`; 200
 *   `{ok: true}`, 404 for `unknown-target`, 409 for another refusal, 400 for an unreadable body or
 *   `invalid-arguments`.
 */
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { MCP } from '../../contracts/constants.js'
import { ASK_HTTP, ASK_ROUTE } from './constants.js'

const REFUSAL = MCP.refusal

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: ASK_HTTP.json })
const statusOf = (result) => {
  if (result.ok === true) return ASK_HTTP.ok
  if (result.code === SEAM_TARGETS.refusal.unknownTarget) return ASK_HTTP.notFound
  return result.code === REFUSAL.invalidArguments ? ASK_HTTP.badRequest : ASK_HTTP.conflict
}

/**
 * @param {object} ctx a Cordis context with DSH's `connection.fetch`
 * @param {object} options
 * @param {object} options.service the K3 `asks` service (index.js `createAsks().service`)
 * @param {() => string | undefined} options.managerSessionId the manager session's id once it exists
 * @param {(fn: () => void) => () => void} [options.onManagerChange] calls `fn` after the manager
 *   session's id changes and returns its disposer (F-WIRE binds it to the chat row's manager); without
 *   it a frame follows card changes only
 * @returns {() => Promise<void>} withdraws the routes (DSH's disposers are async) and closes every
 *   open stream
 */
export function registerAskRoutes(ctx, { service, managerSessionId, onManagerChange }) {
  const streams = new Set()
  const snapshot = () => JSON.stringify({ managerSessionId: managerSessionId() ?? null, cards: service.list() })

  async function events(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser already closed throws on enqueue; close it so it never breaks a listener.
        const push = () => { try { controller.enqueue(encoder.encode(ASK_HTTP.frame(snapshot()))) } catch { close() } }
        const offCards = service.onChange(push)
        const offManager = onManagerChange?.(push)
        close = () => {
          if (!streams.delete(close)) return
          offCards()
          offManager?.()
          request.signal?.removeEventListener('abort', close)
          try { controller.close() } catch { /* already closed by the reader */ }
        }
        streams.add(close)
        request.signal?.addEventListener('abort', close)
        push()
      },
      cancel: () => close(),
    })
    return new Response(body, { status: ASK_HTTP.ok, headers: ASK_HTTP.eventStream })
  }

  async function answer(request) {
    let body
    try { body = await request.json() } catch { return json(ASK_HTTP.badRequest, { ok: false, code: REFUSAL.invalidArguments }) }
    if (body === null || typeof body !== 'object') return json(ASK_HTTP.badRequest, { ok: false, code: REFUSAL.invalidArguments })
    const { [SEAM_TARGETS.ask.handleField]: handle, choice, text } = body
    const result = await service.answer(handle, text === undefined ? { choice } : { choice, text })
    return json(statusOf(result), result)
  }

  const disposers = []
  const dispose = async () => {
    for (const close of [...streams]) close()
    await Promise.all(disposers.splice(0).map((withdraw) => withdraw?.()))
  }
  try {
    for (const route of [
      { path: ASK_ROUTE.events, methods: [ASK_ROUTE.get], fetch: events },
      { path: ASK_ROUTE.answer, methods: [ASK_ROUTE.post], fetch: answer },
    ]) disposers.push(ctx.connection.fetch.register({ ...route, requestBody: ASK_ROUTE.requestBody }))
  } catch (error) {
    // A path another row claimed: withdraw what was registered, so no half-registered pair remains.
    void dispose().catch(() => {})
    throw error
  }
  return dispose
}
