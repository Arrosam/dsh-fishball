/**
 * The ask cards' owner-only Fetch routes in the Fishball DSH (task F-ASKCARD; R-FB-11; Q-U2). The
 * browser half (client.asks.js) draws the cards from them in Fishball's own conversation. DSH's
 * `connection.fetch` is owner-only and applies its Host/Origin fence first, as for core's other
 * routes; F-WIRE calls this from core's row in the Fishball DSH only, never in a main DSH.
 * Until F-UI moves the card's drawing to fishball-ui, these are the seam the page reads.
 *
 * - GET `ASK_ROUTE.events`: an SSE stream; each frame is `{managerSessionId, cards}`, the first at
 *   once and then one per change of the card list. The manager id tells the page which
 *   conversation is Fishball's, so the card shows there only.
 * - POST `ASK_ROUTE.answer` `{approvalId, choice, text?}`: `service.answer`; 200 `{ok: true}`,
 *   409 for a refusal, 400 for an unreadable body or `invalid-arguments`.
 */
import { REFUSAL } from '../link/schema.js'
import { ASK_HTTP, ASK_ROUTE } from './constants.js'

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: ASK_HTTP.json })
const statusOf = (result) => {
  if (result.ok === true) return ASK_HTTP.ok
  return result.code === REFUSAL.invalidArguments ? ASK_HTTP.badRequest : ASK_HTTP.conflict
}

/**
 * @param {object} ctx a Cordis context with DSH's `connection.fetch`
 * @param {object} options
 * @param {object} options.service the K3 `asks` service (index.js `createAsks().service`)
 * @param {() => string | undefined} options.managerSessionId the manager session's id once it exists
 * @returns {() => void} withdraws the routes and closes every open stream
 */
export function registerAskRoutes(ctx, { service, managerSessionId }) {
  const streams = new Set()
  const snapshot = () => JSON.stringify({ managerSessionId: managerSessionId() ?? null, cards: service.list() })

  function events(request) {
    const encoder = new TextEncoder()
    let close = () => {}
    const body = new ReadableStream({
      start(controller) {
        // A stream the browser already closed throws on enqueue; close it so it never breaks a listener.
        const push = () => { try { controller.enqueue(encoder.encode(ASK_HTTP.frame(snapshot()))) } catch { close() } }
        const off = service.onChange(push)
        close = () => {
          if (!streams.delete(close)) return
          off()
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
    const { approvalId, choice, text } = body
    const result = await service.answer(approvalId, text === undefined ? { choice } : { choice, text })
    return json(statusOf(result), result)
  }

  const disposers = [
    { path: ASK_ROUTE.events, methods: [ASK_ROUTE.get], fetch: events },
    { path: ASK_ROUTE.answer, methods: [ASK_ROUTE.post], fetch: answer },
  ].map((route) => ctx.connection.fetch.register({ ...route, requestBody: ASK_ROUTE.requestBody }))

  return () => {
    for (const close of [...streams]) close()
    for (const dispose of disposers.splice(0)) dispose?.()
  }
}
