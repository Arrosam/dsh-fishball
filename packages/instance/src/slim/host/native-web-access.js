/** Server-private native admission. Never serialize this adapter or its returned access. */
import { request } from 'node:http'
import { LIMITS } from '../contract.js'

const AUTH = Object.freeze({
  protocol: 'http:', hostname: '127.0.0.1', root: '/', token: 'token',
  method: 'GET', redirectStatus: 303, redirect: './', unavailable: 'NATIVE_ACCESS_UNAVAILABLE',
  separator: ';', equals: '=', maxAge: 'max-age', expires: 'expires',
  millisecondsPerSecond: 1000, maxTimerMs: 2147483647, cookiePair: /^[!#$%&'*+.^_`|~\w-]+=[A-Za-z0-9._~-]+$/,
})
const unavailable = () => new Error(AUTH.unavailable)

function validate(value) {
  try {
    const origin = new URL(value.origin)
    const login = new URL(value.authenticatedUrl)
    if (typeof value.generation !== 'string' || !value.generation ||
        !(value.signal instanceof AbortSignal) || value.signal.aborted ||
        origin.protocol !== AUTH.protocol || origin.hostname !== AUTH.hostname || !origin.port ||
        origin.username || origin.password || origin.pathname !== AUTH.root || origin.search || origin.hash ||
        login.origin !== origin.origin || login.username || login.password || login.hash ||
        login.pathname !== AUTH.root || login.searchParams.getAll(AUTH.token).length !== 1 ||
        !login.searchParams.get(AUTH.token) || [...login.searchParams.keys()].some((key) => key !== AUTH.token)) throw unavailable()
    return { ...value, origin: origin.origin, host: origin.host, login }
  } catch { throw unavailable() }
}

/** Parse only the native session cookie, not a general cross-origin cookie jar. */
function cookieOf(headers) {
  const rows = headers['set-cookie']
  if (!Array.isArray(rows) || rows.length !== 1) throw unavailable()
  const [pair, ...attributes] = rows[0].split(AUTH.separator).map((part) => part.trim())
  if (!AUTH.cookiePair.test(pair)) throw unavailable()
  const fields = new Map(attributes.map((part) => {
    const at = part.indexOf(AUTH.equals)
    return at < 0 ? [part.toLowerCase(), ''] : [part.slice(0, at).toLowerCase(), part.slice(at + 1)]
  }))
  const seconds = Number(fields.get(AUTH.maxAge))
  const expires = Date.parse(fields.get(AUTH.expires))
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(expires)) throw unavailable()
  const expiresAt = Math.min(Date.now() + seconds * AUTH.millisecondsPerSecond, expires)
  if (expiresAt <= Date.now()) throw unavailable()
  return { cookie: pair, expiresAt }
}

/**
 * Producer contract: ready-only nativeEmbedAccess() -> {generation, origin, authenticatedUrl,
 * signal}. Its signal fences stop/restart/control loss synchronously. Cookie invalidation is
 * broker-local: it must not turn an embed authentication failure into control attachment loss.
 */
export function createNativeWebAccess(service) {
  let current
  let closed = false
  function retire(state) {
    if (!state) return
    state.controller.abort()
    clearTimeout(state.expiryTimer)
    state.cookie = undefined
    state.source.signal.removeEventListener('abort', state.onAbort)
    if (current === state) current = undefined
  }
  function scheduleExpiry(state) {
    const remaining = state.expiresAt - Date.now()
    if (remaining <= 0) { retire(state); return }
    state.expiryTimer = setTimeout(() => scheduleExpiry(state), Math.min(remaining, AUTH.maxTimerMs))
    state.expiryTimer.unref?.()
  }
  function exchange(state) {
    return new Promise((resolve, reject) => {
      let child
      const fail = () => { retire(state); reject(unavailable()) }
      try {
        child = request(state.source.login, {
          method: AUTH.method, headers: { host: state.source.host }, signal: state.controller.signal,
        })
      } catch { fail(); return }
      child.setTimeout(LIMITS.embedStreamIdleTimeoutMs, () => child.destroy())
      child.on('error', fail)
      child.on('response', (response) => {
        // Consume the native relative login redirect here. Neither its headers nor its body
        // can reach a browser; do not follow arbitrary redirect destinations with credentials.
        response.on('error', fail)
        response.resume()
        try {
          if (response.statusCode !== AUTH.redirectStatus || response.headers.location !== AUTH.redirect ||
              state.controller.signal.aborted || current !== state) throw unavailable()
          Object.assign(state, cookieOf(response.headers))
          scheduleExpiry(state)
          resolve()
        } catch { child.destroy(); fail() }
      })
      child.end()
    })
  }
  return Object.freeze({
    async acquire() {
      if (closed) throw unavailable()
      let source
      try { source = validate(await service.nativeEmbedAccess()) } catch { throw unavailable() }
      if (closed || source.signal.aborted) throw unavailable()
      if (current && (current.source.generation !== source.generation || current.source.origin !== source.origin ||
          current.source.signal !== source.signal || (current.expiresAt !== undefined && current.expiresAt <= Date.now()))) retire(current)
      if (!current) {
        const state = { source, controller: new AbortController() }
        state.onAbort = () => retire(state)
        current = state
        source.signal.addEventListener('abort', state.onAbort, { once: true })
        state.pending = exchange(state)
      }
      const state = current
      await state.pending
      if (closed || current !== state || state.controller.signal.aborted || state.expiresAt <= Date.now()) {
        retire(state)
        throw unavailable()
      }
      return Object.freeze({
        origin: source.origin, host: source.host, cookie: state.cookie,
        signal: state.controller.signal,
        valid: () => !closed && current === state && !state.controller.signal.aborted && state.expiresAt > Date.now(),
        invalidate: () => retire(state),
      })
    },
    close() { closed = true; retire(current) },
  })
}
