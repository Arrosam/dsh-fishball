/**
 * Client ID Metadata Document fetch with SSRF limits and caching (R-OA-13, AUTH-EP-08; [spec] CIMD
 * draft §3, §4.4, §6.5, §6.6; MCP Security § Authorization Server Abuse Protection; S7b
 * `cimd-fetch.mjs`).
 *
 * Network access is two injected seams, so no test reaches the network and the address rule cannot
 * be bypassed by a later lookup: `resolve(hostname)` answers the addresses once, every one of them is
 * checked, and `transport.get(url, addresses, signal)` connects only to those checked addresses
 * (the default transport pins node's `lookup` to them, as DSH's own `dsh-web-fetch-http` does; that
 * package exports no reusable helper, so the pinning is restated here). Every limit is applied here,
 * not in the transport: https only, no redirect followed, CIMD_LIMITS.maxBytes, CIMD_LIMITS.timeoutMs
 * for the whole exchange, and a cache by `max-age` capped at CIMD_LIMITS.maxCacheMs and at
 * STATE_CAPS.cimdCacheEntries documents. Failures are never cached. Every exchange is aborted when
 * it ends, read or not, so no refused response keeps its socket.
 */
import { lookup } from 'node:dns/promises'
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import { CIMD_LIMITS, TIME_UNIT } from '../../../mcp-schema/index.js'
import { documentProblem, isClientIdUrl } from './client-rules.js'
import { BLOCKED_SUBNETS, CIMD_HTTP, CIMD_REFUSAL, SERVER_EVENT, STATE_CAPS } from './constants.js'
import { readCapped } from './io.js'

const blocked = new BlockList()
for (const [network, prefix] of BLOCKED_SUBNETS.ipv4) blocked.addSubnet(network, prefix, BLOCKED_SUBNETS.family.ipv4)
for (const [network, prefix] of BLOCKED_SUBNETS.ipv6) blocked.addSubnet(network, prefix, BLOCKED_SUBNETS.family.ipv6)

const IP_FAMILY = Object.freeze({ 4: BLOCKED_SUBNETS.family.ipv4, 6: BLOCKED_SUBNETS.family.ipv6 })

/** Whether a resolved address is one no CIMD fetch may reach; anything unparsable counts as blocked. */
export function isBlockedAddress(address) {
  const family = IP_FAMILY[isIP(address)]
  return family === undefined || blocked.check(address, family)
}

const stripBrackets = (hostname) => (hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname)

/** The system resolver: every address of `hostname`, in the resolver's order. */
async function systemResolve(hostname) {
  const answers = await lookup(hostname, { all: true, verbatim: true })
  return answers.map((answer) => answer.address)
}

/**
 * The default transport: one GET over node:https whose `lookup` serves only the checked addresses,
 * so the connection cannot resolve the name again (no DNS-rebinding window). The URL's hostname
 * stays the TLS server name and the Host header.
 */
const httpsTransport = Object.freeze({
  get(url, addresses, signal) {
    return new Promise((resolve, reject) => {
      const pinned = (hostname, options, callback) => {
        const all = addresses.map((address) => ({ address, family: isIP(address) }))
        if (options?.all) callback(null, all)
        else callback(null, all[0].address, all[0].family)
      }
      const request = https.request(url, {
        method: CIMD_HTTP.method, agent: CIMD_HTTP.agent, lookup: pinned, signal, headers: { [CIMD_HTTP.headers.accept]: CIMD_HTTP.accept },
      },
        (response) => resolve({ status: response.statusCode, headers: response.headers, body: response }))
      request.on(SERVER_EVENT.error, reject)
      request.end()
    })
  },
})

/** The response's cache lifetime in ms (RFC 9111 §5.2.2): 0 unless a `max-age` allows reuse; capped by CIMD_LIMITS.maxCacheMs. */
function cacheLifetimeMs(cacheControl) {
  const value = Array.isArray(cacheControl) ? cacheControl.join(',') : cacheControl ?? ''
  if (CIMD_HTTP.noReuseDirectives.test(value)) return 0
  const match = CIMD_HTTP.maxAge.exec(value)
  return match === null ? 0 : Math.min(Number(match[2]) * TIME_UNIT.msPerSecond, CIMD_LIMITS.maxCacheMs)
}

const isRedirect = (status) => status >= CIMD_HTTP.redirectStatuses.min && status <= CIMD_HTTP.redirectStatuses.max

/** A refusal carrying its CIMD_REFUSAL code, thrown inside one fetch and caught at its end. */
class CimdRefusal extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

/**
 * @param options.resolve - `(hostname) => Promise<string[]>` addresses (default: the system resolver)
 * @param options.transport - `{get(url: URL, addresses: string[], signal: AbortSignal) => Promise<{status, headers, body: AsyncIterable<Uint8Array>}>}`
 *   (default: node:https pinned to `addresses`); `headers` names are lower case, as Node's
 * @param options.now - the clock of the cache, `() => epoch ms`
 * @param options.timers - `{setTimeout, clearTimeout}` for the time bound (default: the global ones)
 * @returns `{fetch(clientId) => Promise<{ok: true, doc} | {ok: false, reason}>}`; it never rejects,
 *   and `reason` (CIMD_REFUSAL) is for diagnostics only, never shown.
 */
export function createCimdFetcher({ resolve = systemResolve, transport = httpsTransport, now = Date.now, timers = globalThis } = {}) {
  /**
   * clientId → {doc, expiresAt}, in insertion order (a Map's), so the oldest is first. At
   * STATE_CAPS.cimdCacheEntries the oldest is evicted; an expired hit is dropped when read.
   */
  const cache = new Map()

  function remember(clientId, doc, lifetimeMs) {
    if (lifetimeMs <= 0) return
    cache.delete(clientId)
    while (cache.size >= STATE_CAPS.cimdCacheEntries) cache.delete(cache.keys().next().value)
    cache.set(clientId, { doc, expiresAt: now() + lifetimeMs })
  }

  function cached(clientId) {
    const hit = cache.get(clientId)
    if (hit === undefined) return undefined
    if (hit.expiresAt > now()) return hit.doc
    cache.delete(clientId)
    return undefined
  }

  async function checkedAddresses(url) {
    const hostname = stripBrackets(url.hostname)
    let addresses
    try {
      addresses = isIP(hostname) === 0 ? await resolve(hostname) : [hostname]
    } catch {
      throw new CimdRefusal(CIMD_REFUSAL.unresolvable)
    }
    if (!Array.isArray(addresses) || addresses.length === 0) throw new CimdRefusal(CIMD_REFUSAL.unresolvable)
    // Every answer must be public, or none is used: refused before any connection.
    if (addresses.some(isBlockedAddress)) throw new CimdRefusal(CIMD_REFUSAL.privateAddress)
    return addresses
  }

  async function download(clientId, signal) {
    const url = new URL(clientId)
    const addresses = await checkedAddresses(url)
    const response = await transport.get(url, addresses, signal)
    if (isRedirect(response.status)) throw new CimdRefusal(CIMD_REFUSAL.redirect)
    if (response.status !== CIMD_HTTP.okStatus) throw new CimdRefusal(CIMD_REFUSAL.status)
    if (!CIMD_HTTP.jsonType.test(response.headers?.[CIMD_HTTP.headers.contentType] ?? '')) throw new CimdRefusal(CIMD_REFUSAL.notJson)
    const text = await readCapped(response.body, CIMD_LIMITS.maxBytes)
    if (text === undefined) throw new CimdRefusal(CIMD_REFUSAL.tooLarge)
    let doc
    try { doc = JSON.parse(text) } catch { throw new CimdRefusal(CIMD_REFUSAL.notJson) }
    const problem = documentProblem(doc, clientId)
    if (problem !== undefined) throw new CimdRefusal(problem)
    return { doc, lifetimeMs: cacheLifetimeMs(response.headers?.[CIMD_HTTP.headers.cacheControl]) }
  }

  /** The time bound covers resolution, connection and the body; when it fires the exchange is aborted. */
  async function bounded(clientId) {
    const controller = new AbortController()
    let timer
    const expiry = new Promise((_, reject) => {
      timer = timers.setTimeout(() => {
        controller.abort()
        reject(new CimdRefusal(CIMD_REFUSAL.timeout))
      }, CIMD_LIMITS.timeoutMs)
    })
    const exchange = download(clientId, controller.signal)
    // The losing side of the race must not surface as an unhandled rejection.
    exchange.catch(() => {})
    try {
      return await Promise.race([exchange, expiry])
    } finally {
      timers.clearTimeout(timer)
      // Releases the socket of a response that was refused before (or without) its body being read.
      controller.abort()
    }
  }

  return Object.freeze({
    async fetch(clientId) {
      if (!isClientIdUrl(clientId)) return { ok: false, reason: CIMD_REFUSAL.clientIdInvalid }
      const hit = cached(clientId)
      if (hit !== undefined) return { ok: true, doc: hit }
      try {
        const { doc, lifetimeMs } = await bounded(clientId)
        remember(clientId, doc, lifetimeMs)
        return { ok: true, doc }
      } catch (error) {
        return { ok: false, reason: error instanceof CimdRefusal ? error.reason : CIMD_REFUSAL.fetchFailed }
      }
    },
  })
}

