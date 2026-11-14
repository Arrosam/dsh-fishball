/**
 * The connector's one `RequestGate` (task K1b; index.d.ts `RequestGate`; design §3.1, §5.5;
 * R-REM-02/03, R-SEC-03, R-OA-20, R-TOK-06). C-WIRE builds it once with the listener facts; the MCP
 * route (this module's endpoint), C-OAUTH's token endpoint and metadata, and C-OAUTH-WEB's approval
 * listener call `check`; only the MCP route calls `admit`.
 *
 * Every value is K1's: REQUEST_GATE (order, routes, origin rules, header names), HOSTS,
 * HTTP_STATUS, HTTP_REFUSAL and ENDPOINT_LIMITS. Neither method throws, reads a token or says which
 * tokens exist.
 */
import {
  ENDPOINT_LIMITS, HOSTS, HTTP_REFUSAL, HTTP_STATUS, ORIGIN_RULE, RATE_LIMITS, REQUEST_GATE, TIME_UNIT,
} from '../../../mcp-schema/index.js'
import { originOf } from '../oauth/index.js'
import { AUTHORITY, BUCKET_COST, LOG, MS_PER_MINUTE } from './constants.js'

const SILENT_LOGGER = Object.freeze({ warn() {} })

const PASS = Object.freeze({ pass: true })
const NO_HEADERS = Object.freeze({})
/** A body-less refusal with `status`; the gate's 403 and the endpoint's own 403, 404 and 500 share it. */
export const bareRefusal = (status) => Object.freeze({ pass: false, status, headers: NO_HEADERS, body: null })
export const FORBIDDEN = bareRefusal(HTTP_STATUS.forbidden)
const INSECURE = Object.freeze({
  pass: false, status: HTTP_STATUS.serviceUnavailable, headers: NO_HEADERS, body: Object.freeze({ error: HTTP_REFUSAL.insecureListener }),
})

/** ENDPOINT_LIMITS' JSON-RPC refusal body: no `id` member (K1b-EP-13, index.d.ts LimitRefusalBody). */
export const limitRefusalBody = (message) => Object.freeze({
  jsonrpc: ENDPOINT_LIMITS.jsonRpcVersion,
  error: Object.freeze({ code: ENDPOINT_LIMITS.jsonRpcCode, message }),
})
/** The 413: `admit`'s for a declared length, and the endpoint's for an undeclared body that grew past the limit. */
export const TOO_LARGE = Object.freeze({
  pass: false, status: HTTP_STATUS.payloadTooLarge, headers: NO_HEADERS, body: limitRefusalBody(HTTP_REFUSAL.tooLarge),
})

/** `Retry-After` is whole seconds (TIME_UNIT), rounded up so a client never retries early. */
const retryAfterSeconds = (ms) => String(Math.ceil(ms / TIME_UNIT.msPerSecond))

/** A 429 with ENDPOINT_LIMITS' body and `Retry-After` for `retryAfterMs`. */
export const rateLimited = (retryAfterMs) => Object.freeze({
  pass: false,
  status: HTTP_STATUS.tooManyRequests,
  headers: Object.freeze({ [RATE_LIMITS.retryAfterHeader]: retryAfterSeconds(retryAfterMs) }),
  body: limitRefusalBody(HTTP_REFUSAL.rateLimited),
})
const IN_FLIGHT_LIMITED = rateLimited(REQUEST_GATE.inFlightRetryAfterMs)

/** One header's value, or undefined when it is absent or repeated (a repeated Host or Origin is never trusted). */
function single(headers, name) {
  const value = headers[name]
  return typeof value === 'string' ? value : undefined
}

/**
 * The authority `value` names, parsed under `scheme` (so a default port normalises away, as in DSH's
 * own fence), or undefined when it is not a bare `host[:port]`: userinfo, a path, a query, a
 * fragment or anything WHATWG parsing would silently drop is refused rather than reinterpreted.
 */
function parseAuthority(value, scheme) {
  if (value === '' || AUTHORITY.notBare.test(value)) return undefined
  try {
    return new URL(scheme + AUTHORITY.schemeSuffix + value)
  } catch {
    return undefined
  }
}

/**
 * A bind address as a `Host` hostname reads after URL normalisation (DSH's `isBindAddressAuthority`):
 * any `%zone` dropped, an IPv6 literal bracketed, then parsed, so `0:0:0:0:0:0:0:1` is `[::1]` and
 * `FE80::1` is `[fe80::1]`. An unparseable bind matches no Host and is not loopback.
 */
function bindHostname(host, scheme) {
  const zoneAt = host.indexOf(AUTHORITY.zoneSeparator)
  const address = zoneAt === -1 ? host : host.slice(0, zoneAt)
  const bracketed = address.includes(AUTHORITY.ipv6Separator) && !address.startsWith(AUTHORITY.ipv6Open)
    ? AUTHORITY.ipv6Open + address + AUTHORITY.ipv6Close
    : address
  return parseAuthority(bracketed, scheme)?.hostname
}

/**
 * Whether an entry writes a port. Judged from parses under both schemes, as DSH does, because each
 * drops its own default port (`:80` / `:443` still count as written).
 */
const writesPort = (entry) => [HOSTS.loopbackScheme, HOSTS.remoteScheme].some((scheme) => parseAuthority(entry, scheme)?.port)

/**
 * One `--trusted-host` entry as a Host matcher, by DSH's rule (`dsh-client-connection`
 * `isTrustedAuthority`): an entry with a port matches that exact authority, a port-less entry the
 * hostname on any port. An entry that is no bare authority matches nothing (DSH refuses it at load).
 */
function trustedMatcher(entry, scheme) {
  const entryUrl = parseAuthority(entry, scheme)
  if (entryUrl === undefined) return () => false
  return writesPort(entry) ? (hostUrl) => entryUrl.host === hostUrl.host : (hostUrl) => entryUrl.hostname === hostUrl.hostname
}

/**
 * @param {import('../../../mcp-schema/index.js').GateListenerFacts} facts DSH's listener facts and the clock.
 *   `approvalPort` is part of the facts but unused here: `Host` is port-agnostic on every surface,
 *   as on DSH's own fence (Fishball 2026-11-14, Q9).
 * @param {object} [ports]
 * @param {{warn(...args: unknown[]): void}} [ports.logger] gets the one insecure-listener diagnostic
 * @returns {import('../../../mcp-schema/index.js').RequestGate}
 */
export function createRequestGate(facts, { logger = SILENT_LOGGER } = {}) {
  const scheme = facts.secure ? HOSTS.remoteScheme : HOSTS.loopbackScheme
  // The listener facts never change while it runs (DSH rebinds by restarting), so the bind address,
  // the trusted hosts and the exposure are decided once.
  const bound = bindHostname(facts.host, scheme)
  const trusted = facts.trustedHosts.map((entry) => trustedMatcher(entry, scheme))
  const insecure = !HOSTS.loopbackNames.includes(bound) && !facts.secure
  // One diagnostic per listener, never per request (R-REM-02, design §3.1).
  if (insecure) logger.warn(LOG.format, LOG.insecureListener, HTTP_REFUSAL.insecureListener)

  function hostAllowed(headers) {
    const host = single(headers, REQUEST_GATE.headers.host)
    const hostUrl = host === undefined ? undefined : parseAuthority(host, scheme)
    if (hostUrl === undefined) return false
    return HOSTS.loopbackNames.includes(hostUrl.hostname) || hostUrl.hostname === bound || trusted.some((matches) => matches(hostUrl))
  }

  /** A present `Origin` (empty and `null` included) passes only the surface's ORIGIN_RULE. */
  function originAllowed(req, surface) {
    if (req.headers[REQUEST_GATE.headers.origin] === undefined) return true
    if (REQUEST_GATE.originRule[surface] !== ORIGIN_RULE.ownOnly) return false
    const origin = single(req.headers, REQUEST_GATE.headers.origin)
    // The page's own origin is the checked `Host` under the listener's scheme (R-OA-11, S7b F4), by
    // C-OAUTH's one host → origin rule.
    return origin !== undefined && origin === originOf(req, { secure: facts.secure })
  }

  function check(req, surface) {
    const methods = REQUEST_GATE.routes[surface]?.[req.path]
    if (methods !== undefined && !methods.includes(req.method)) {
      return Object.freeze({
        pass: false,
        status: HTTP_STATUS.methodNotAllowed,
        headers: Object.freeze({ [REQUEST_GATE.headers.allow]: methods.join(REQUEST_GATE.allowSeparator) }),
        body: null,
      })
    }
    if (!hostAllowed(req.headers) || !originAllowed(req, surface)) return FORBIDDEN
    return insecure ? INSECURE : PASS
  }

  // Per token entry (Caller.entryKey; the user's decision 2026-11-14): requests in flight and a
  // token bucket. A state is only created for a verified caller, so the map holds one per token
  // entry that has made a request in this connector life (entry keys of deleted entries included:
  // they are few and small, and dropping them would need C-TOKENS' revocation feed here).
  const limits = new Map()
  const refillPerMs = ENDPOINT_LIMITS.requestsPerMinute / MS_PER_MINUTE

  function limitsOf(entryKey, now) {
    let state = limits.get(entryKey)
    if (state === undefined) {
      state = { inFlight: 0, tokens: ENDPOINT_LIMITS.requestBurst, at: now }
      limits.set(entryKey, state)
    }
    // A clock that steps back refills nothing rather than draining the bucket.
    const elapsed = Math.max(0, now - state.at)
    state.tokens = Math.min(ENDPOINT_LIMITS.requestBurst, state.tokens + elapsed * refillPerMs)
    state.at = now
    return state
  }

  function admit(req, surface, caller) {
    // `token` and `approval` keep their own limits and never call this (REQUEST_GATE.admitSurfaces);
    // a call for them limits nothing rather than throwing.
    if (!REQUEST_GATE.admitSurfaces.includes(surface)) return Object.freeze({ pass: true, done() {} })
    // `bodyBytes` is the declared length, absent for a chunked body (K1 AdmitRequest): `admit` runs
    // before the body is read, and the endpoint judges an undeclared body itself as it reads it.
    if (req.bodyBytes !== undefined && req.bodyBytes > ENDPOINT_LIMITS.bodyBytes) return TOO_LARGE
    const state = limitsOf(caller.entryKey, facts.now())
    if (state.inFlight >= ENDPOINT_LIMITS.inFlightPerPrincipal) return IN_FLIGHT_LIMITED
    if (state.tokens < BUCKET_COST) return rateLimited((BUCKET_COST - state.tokens) / refillPerMs)
    state.tokens -= BUCKET_COST
    state.inFlight += 1
    let released = false
    return Object.freeze({
      pass: true,
      // Exactly once frees the slot; a second call is a no-op so a caller's double release cannot
      // hand the principal a slot it never took.
      done() {
        if (released) return
        released = true
        state.inFlight -= 1
      },
    })
  }

  return Object.freeze({ check, admit })
}
