/**
 * The instance's own settings-page routes (I-HOST; requirements 1.33 Q-D1 = B, R-ARCH-05: "its only
 * browser code is its own plugin settings page (status, Retry, Reconnect, model sync, Open in
 * window)"; R-HOST-10). Owner-only DSH Fetch routes (`connection.fetch`: exact path, owner-only,
 * Host/Origin fenced by DSH), JSON, no-store. None carries a token, a ticket or an origin, except
 * `open`'s one admission URL, which is never logged.
 * - GET status → `{state, code, detail, notice}`; POST retry → the same after the retry;
 * - POST reconnect → `{ok: true}` or `{ok: false, code}` (K3 `reconnect`);
 * - POST open `{lang}` → `{ok: true, url}`: one admission into the child's Fishball page (view
 *   `chat`) under the page's own loopback hostname (Q-G3; the user's answer Q7 = A: a new tab).
 * The model-sync routes stay src/slim/host/provider-sync-routes.js (same paths as before).
 */
import { LOOPBACK } from '../native-runtime/constants.js'
import { publicStatus, safeStatus } from '../native-web.js'
import { registerGetRoute, registerPostRoutes } from '../slim/host/fetch-routes.js'

export const INSTANCE_ROUTE = Object.freeze({
  // V2's original status route, kept with its shape ({enabled, state, code, detail}) for its
  // readers (the V2 slim suites) until REMOVE-V2.
  legacyStatus: '/api/fishball/native/status',
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  hostHeader: 'host',
  parseScheme: 'http://',
  /** Characters a bare `host[:port]` never holds (as dsh-connector-ui's admit route). */
  notInAuthority: /[@/?#\\]/,
  maxBodyBytes: 16384,
  invalid: 'invalid-request',
  failed: 'operation-failed',
  ok: 200,
  badRequest: 400,
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }),
  label: 'dsh-instance: settings page routes',
})
const R = INSTANCE_ROUTE

const json = (value, status = R.ok) => new Response(JSON.stringify(value), { status, headers: R.headers })

/** The page's hostname from its request's Host, as a WHATWG URL parses it, or undefined. */
export function requestHostname(request) {
  const host = request.headers.get(R.hostHeader)
  if (typeof host !== 'string' || R.notInAuthority.test(host)) return undefined
  try { return new URL(R.parseScheme + host).hostname } catch { return undefined }
}

/** `{lang}` with a K3 language, or undefined. */
async function openBody(request) {
  let text
  try { text = await request.text() } catch { return undefined }
  if (Buffer.byteLength(text) > R.maxBodyBytes) return undefined
  let body
  try { body = JSON.parse(text) } catch { return undefined }
  const keys = body !== null && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : []
  return keys.length === 1 && LOOPBACK.langs.includes(body.lang) ? body.lang : undefined
}

/**
 * @param ctx - the host row's context (`connection`)
 * @param service - `{status(), notice(), retry(), reconnect(), open({hostname, lang})}`
 */
export function registerInstanceRoutes(ctx, service) {
  const current = () => ({ ...publicStatus(service.status()), notice: service.notice() })
  registerGetRoute(ctx, { path: R.legacyStatus, fetch: () => json(safeStatus(service.status())) })
  registerGetRoute(ctx, { path: R.status, fetch: () => json(current()) })
  registerPostRoutes(ctx, [
    { path: R.retry, fetch: async () => { try { await service.retry() } catch { /* the status says what happened */ } return json(current()) } },
    { path: R.reconnect, fetch: async () => { try { return json(await service.reconnect()) } catch { return json({ ok: false, code: R.failed }) } } },
    {
      path: R.open,
      fetch: async (request) => {
        const lang = await openBody(request)
        if (lang === undefined) return json({ ok: false, code: R.invalid }, R.badRequest)
        try { return json(await service.open({ hostname: requestHostname(request), lang })) } catch { return json({ ok: false, code: R.failed }) }
      },
    },
  ], R.label)
}
