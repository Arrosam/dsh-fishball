/**
 * The instance's own settings-page routes (I-HOST; requirements 1.33 Q-D1 = B, R-ARCH-05: "its only
 * browser code is its own plugin settings page (status, Retry, Reconnect, model sync, Open in
 * window)"; R-HOST-10). Owner-only DSH Fetch routes (`connection.fetch`: exact path, owner-only,
 * Host/Origin fenced by DSH), JSON, no-store. None carries a token, a ticket or an origin, except
 * `open`'s one admission URL, which is never logged.
 * - GET status → `{state, code, detail, notice}`; POST retry → the same after the retry;
 * - POST restart → the status after the restart, like retry; with `refused: <code>` beside it when
 *   the restart was refused (`instance-disabled` while the instance is off, `busy` while a Fishball
 *   plugin change or the restart it queued runs) — the settings page's Restart button (the user,
 *   2026-11-20);
 * - POST reconnect → `{ok: true}` or `{ok: false, code}` (K3 `reconnect`);
 * - POST open `{lang}` → `{ok: true, url}`: one admission into the child's Fishball page (view
 *   `chat`) under the page's own loopback hostname (Q-G3; the user's answer Q7 = A: a new tab).
 * The model-sync routes are provider-sync-routes.js beside this file (same paths as before).
 */
import { requestHostname } from '../lib/request-host.js'
import { INSTANCE_CODES, INSTANCE_STATES, LOOPBACK, REFUSAL } from '../native-runtime/constants.js'
import { statusLaunchDetail } from './launch-detail.js'
import { registerGetRoute, registerPostRoutes } from './fetch-routes.js'

export const INSTANCE_ROUTE = Object.freeze({
  status: '/api/dsh-instance/status',
  retry: '/api/dsh-instance/retry',
  restart: '/api/dsh-instance/restart',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  maxBodyBytes: 16384,
  ok: 200,
  badRequest: 400,
  headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }),
  label: 'dsh-instance: settings page routes',
  // A state outside the instance's vocabulary, as the page reads it (§11).
  unavailable: 'unavailable',
})
const R = INSTANCE_ROUTE
const STATES = new Set(INSTANCE_STATES)
const CODES = new Set(INSTANCE_CODES)

/**
 * The instance's public `{state, code, detail}` (§11; moved here from src/native-web.js, whose V2
 * readers are gone): known states and codes only, and a failed start's cause after main's public
 * sanitizer runs again, so no answer carries the child's origin or more than its bounded first line.
 */
export function publicStatus(value) {
  return {
    state: STATES.has(value?.state) ? value.state : R.unavailable,
    code: CODES.has(value?.code) ? value.code : null,
    detail: statusLaunchDetail(value),
  }
}

const json = (value, status = R.ok) => new Response(JSON.stringify(value), { status, headers: R.headers })


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
 * @param service - `{status(), notice(), busy(), retry(), restart(), reconnect(), open({hostname, lang})}`;
 *   `busy()` tells whether a Fishball package operation runs; `restart()` resolves `{refused?: code}`.
 */
export function registerInstanceRoutes(ctx, service) {
  // `busy` lets the page disable Restart while a Fishball install or uninstall runs.
  const current = () => ({ ...publicStatus(service.status()), notice: service.notice(), busy: service.busy() })
  registerGetRoute(ctx, { path: R.status, fetch: () => json(current()) })
  registerPostRoutes(ctx, [
    { path: R.retry, fetch: async () => { try { await service.retry() } catch { /* the status says what happened */ } return json(current()) } },
    {
      path: R.restart,
      fetch: async () => {
        let refused
        try { refused = (await service.restart())?.refused } catch { /* the status says what happened */ }
        return json(refused === undefined ? current() : { ...current(), refused })
      },
    },
    { path: R.reconnect, fetch: async () => { try { return json(await service.reconnect()) } catch { return json({ ok: false, code: REFUSAL.failed }) } } },
    {
      path: R.open,
      fetch: async (request) => {
        const lang = await openBody(request)
        if (lang === undefined) return json({ ok: false, code: REFUSAL.invalid }, R.badRequest)
        try { return json(await service.open({ hostname: requestHostname(request), lang })) } catch { return json({ ok: false, code: REFUSAL.failed }) }
      },
    },
  ], R.label)
}
