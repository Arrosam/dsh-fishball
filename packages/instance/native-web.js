import http from 'node:http'
import { NATIVE_WEB, nativeAccess, fail } from './src/native-runtime/constants.js'
import { registerSessionRoute } from './src/native-runtime/session-route.js'

export const name = 'fishball-native-web'
export const inject = [...NATIVE_WEB.services]

// Never propagate node:http errors: a request error can contain the launch-token URL.
function probe(url, timeout, cookie) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { agent: false, headers: cookie ? { cookie } : {} }, response => {
      const result = { status: response.statusCode, location: response.headers.location, cookies: response.headers['set-cookie'] }
      response.resume()
      response.on('end', () => resolve(result))
      response.on('error', refused)
    })
    function refused() { reject(new Error('NATIVE_ACCESS_UNAVAILABLE')) }
    request.setTimeout(timeout, () => request.destroy())
    request.on('error', refused)
  })
}

/** Native SDK adapter: private admission plus the authenticated X1 identity route. */
export function apply(ctx, config) {
  registerSessionRoute(ctx)
  let disposed = false
  ctx.effect(() => () => { disposed = true })
  function access() {
    try {
      if (disposed) fail('NATIVE_ACCESS_UNAVAILABLE')
      const origin = ctx.webServer.getOrigin()
      return nativeAccess({ origin, authenticatedUrl: ctx.connection.authenticatedUrl(origin) })
    } catch { fail('NATIVE_ACCESS_UNAVAILABLE') }
  }
  ctx.provide(NATIVE_WEB.service, {
    access,
    async ready() {
      try {
        const admission = access()
        const anonymous = await probe(admission.origin, config.limits.requestTimeoutMs)
        if (anonymous.status !== NATIVE_WEB.unauthorized) fail('NATIVE_ACCESS_UNAVAILABLE')
        const exchange = await probe(admission.authenticatedUrl, config.limits.requestTimeoutMs)
        if (exchange.status !== NATIVE_WEB.redirect || exchange.location !== NATIVE_WEB.redirectLocation || !exchange.cookies?.length) fail('NATIVE_ACCESS_UNAVAILABLE')
        // Consume only this loopback exchange; no cookies are retained or sent over lifecycle.
        const cookie = exchange.cookies.map(value => value.split(';')[0]).join('; ')
        const authenticated = await probe(admission.origin, config.limits.requestTimeoutMs, cookie)
        if (authenticated.status !== NATIVE_WEB.success || disposed) fail('NATIVE_ACCESS_UNAVAILABLE')
      } catch { fail('NATIVE_ACCESS_UNAVAILABLE') }
    },
  })
}
