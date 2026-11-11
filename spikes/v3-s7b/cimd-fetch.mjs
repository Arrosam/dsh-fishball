/**
 * Client ID Metadata Document fetch with SSRF limits (R-OA-13, AUTH-EP-08). Throwaway spike code.
 *
 * Name resolution goes through an injected `resolve(hostname) -> address[]` and connections through an
 * injected `route(address, port) -> {host, port}`, so the spike can simulate a public client host on
 * loopback without ever relaxing the address check: the check runs on the *resolved* address, and the
 * socket connects to exactly that validated address (no second lookup, so no DNS-rebinding window).
 */
import https from 'node:https'
import { BlockList, isIP } from 'node:net'
import { S7B } from './constants.mjs'

// Private, loopback, link-local, unique-local, CGNAT, multicast and unspecified ranges
// (draft-ietf-oauth-client-id-metadata-document-00 §6.5).
const blocked = new BlockList()
for (const [net, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(net, prefix, 'ipv4')
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) blocked.addSubnet(net, prefix, 'ipv6')

// BlockList maps an ipv6 `::ffff:0:0/96` rule onto every IPv4 address, so IPv4-mapped IPv6 is unwrapped by hand instead.
export function isBlockedAddress(address) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
  if (mapped) return blocked.check(mapped[1], 'ipv4')
  return blocked.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4')
}

/** draft §3: https, a path, no fragment, no userinfo, no dot segments. */
export function validClientIdUrl(value) {
  let url
  try { url = new URL(value) } catch { return false }
  if (url.protocol !== 'https:' || url.pathname === '/' || url.hash !== '' || url.username !== '' || url.password !== '') return false
  // WHATWG parsing removes dot segments and normalises case, so a value that does not survive parsing
  // unchanged had dot segments or a non-canonical spelling; the draft wants simple string comparison anyway.
  return url.href === value
}

const isLoopbackHost = (hostname) => S7B.loopbackNames.includes(hostname) || /^127\./.test(hostname)

/** Each registered redirect must be loopback or https [spec: Security Considerations § Communication Security]. */
const validRedirect = (value) => {
  try {
    const url = new URL(value)
    return url.hash === '' && (url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHost(url.hostname)))
  } catch { return false }
}

/** Structure checks (spec: client_id identical, client_name, redirect_uris; draft §4.1: no shared secret). */
export function validateDocument(doc, clientId) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return 'not-an-object'
  if (doc.client_id !== clientId) return 'client-id-mismatch'
  if (typeof doc.client_name !== 'string' || doc.client_name.trim() === '') return 'client-name-missing'
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0 || !doc.redirect_uris.every((u) => typeof u === 'string')) return 'redirect-uris-missing'
  if (!doc.redirect_uris.every(validRedirect)) return 'redirect-uri-insecure'
  if ('client_secret' in doc || (doc.token_endpoint_auth_method ?? 'none') !== 'none') return 'secret-auth-not-allowed'
  return undefined
}

const maxAge = (cacheControl) => {
  if (/no-store|no-cache|private/i.test(cacheControl ?? '')) return 0
  const m = /max-age=(\d+)/i.exec(cacheControl ?? '')
  return m ? Math.min(Number(m[1]), S7B.cimd.maxCacheSeconds) : 0
}

export function createCimdFetcher({ resolve, route, ca, now = () => Date.now() }) {
  const cache = new Map()   // client_id -> {doc, expiresAt}; errors and invalid documents are never cached (draft §4.4)
  const stats = { fetches: 0, cacheHits: 0, refusedBeforeConnect: 0 }

  function getOnce(url, address) {
    const target = route(address, Number(url.port || 443))
    return new Promise((resolvePromise, reject) => {
      const req = https.request({
        host: target.host, port: target.port, path: url.pathname + url.search, method: 'GET', servername: url.hostname, ca,
        headers: { host: url.host, accept: 'application/json' }, timeout: S7B.cimd.timeoutMs,
      }, (res) => {
        // Redirects are refused outright: a public name must not bounce the fetch to another (private) address.
        if (res.statusCode >= 300 && res.statusCode < 400) { res.resume(); reject(new Error('redirect-refused')); return }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`http-${res.statusCode}`)); return }
        if (!/^application\/([a-z0-9.+-]*\+)?json\b/i.test(res.headers['content-type'] ?? '')) { res.resume(); reject(new Error('not-json')); return }
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          size += chunk.length
          if (size > S7B.cimd.maxBytes) { req.destroy(new Error('too-large')); return }
          chunks.push(chunk)
        })
        res.on('end', () => resolvePromise({ body: Buffer.concat(chunks).toString('utf8'), cacheControl: res.headers['cache-control'] }))
        res.on('error', reject)
      })
      req.on('timeout', () => req.destroy(new Error('timeout')))
      req.on('error', reject)
      req.end()
    })
  }

  /** Returns {ok: true, doc, cached} or {ok: false, reason}. Never throws. */
  async function fetchDocument(clientId) {
    if (!validClientIdUrl(clientId)) return { ok: false, reason: 'client-id-url-invalid' }
    const hit = cache.get(clientId)
    if (hit && hit.expiresAt > now()) { stats.cacheHits += 1; return { ok: true, doc: hit.doc, cached: true } }
    const url = new URL(clientId)
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const addresses = isIP(hostname) ? [hostname] : await resolve(hostname)
    if (addresses.length === 0) return { ok: false, reason: 'unresolvable' }
    // Every resolved address must be public; otherwise refuse before any connection is made.
    if (addresses.some(isBlockedAddress)) { stats.refusedBeforeConnect += 1; return { ok: false, reason: 'private-address' } }
    try {
      stats.fetches += 1
      const { body, cacheControl } = await getOnce(url, addresses[0])
      let doc
      try { doc = JSON.parse(body) } catch { return { ok: false, reason: 'not-json' } }
      const invalid = validateDocument(doc, clientId)
      if (invalid !== undefined) return { ok: false, reason: invalid }
      const seconds = maxAge(cacheControl)
      if (seconds > 0) cache.set(clientId, { doc, expiresAt: now() + seconds * 1000 })
      return { ok: true, doc, cached: false }
    } catch (error) {
      return { ok: false, reason: error.message }
    }
  }

  return { fetchDocument, stats, clear: () => cache.clear() }
}
