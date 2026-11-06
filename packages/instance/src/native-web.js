/** Native lifecycle status over rc3's exact, authenticated Connection route.
 * Do not move this to webServer: that would bypass Connection's admission and owner checks.
 * The browser reaches the child only through the embed broker (src/slim/host/embed.js); the old
 * capability-URL open route is gone, so this file exposes status and nothing else.
 */
const WEB = Object.freeze({
  statusPath: '/api/fishball/native/status',
  get: 'GET', body: 'buffered', unavailable: 'unavailable',
  states: Object.freeze(['disabled', 'waiting', 'starting', 'ready', 'stopping', 'stopped', 'failed']),
  codes: Object.freeze(['NATIVE_START_FAILED', 'NATIVE_STOP_FAILED', 'NATIVE_CHILD_EXITED', 'NATIVE_UNAVAILABLE', 'NATIVE_TIMEOUT', 'NATIVE_DISABLED']),
  ok: 200, json: 'application/json; charset=utf-8',
  headers: Object.freeze({ 'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff' }),
})

/** Requires connection; service.status() is synchronous and carries no token. */
export function registerNativeWeb(ctx, service) {
  const status = () => {
    try {
      const value = service.status()
      return { enabled: value?.enabled === true,
        state: WEB.states.includes(value?.state) ? value.state : WEB.unavailable,
        code: WEB.codes.includes(value?.code) ? value.code : null }
    } catch { return { enabled: false, state: WEB.unavailable, code: null } }
  }
  try {
    return ctx.connection.fetch.register({
      path: WEB.statusPath, methods: [WEB.get], requestBody: WEB.body,
      fetch: () => new Response(JSON.stringify(status()), {
        status: WEB.ok, headers: { ...WEB.headers, 'content-type': WEB.json },
      }),
    })
  } catch {
    // An absent or duplicate status route must not take down the native service.
    return () => {}
  }
}
