/**
 * The loopback proxy (mechanism c2, R-OA-21 rule 7, design §5.5b; S7c §5). The stock
 * dsh-mcp-client child row of each server points here; the proxy swaps the child's per-start local
 * bearer for the real access token and forwards to the connector.
 *
 * Why a proxy: the stock row cannot report a 401 (S7c F1), so only a hop the adapter owns can
 * refresh once and retry once. The access token never reaches the child row or its configuration.
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import { listenLoopback, opaqueValue } from './oauth-client.js'
import { LIMIT, PROXY } from './constants.js'

const digest = (value) => createHash('sha256').update(String(value ?? '')).digest()
/** Constant time over digests, so neither the content nor the length of the local bearer leaks. */
const sameSecret = (presented, expected) => timingSafeEqual(digest(presented), digest(expected))

/** The whole body, or `undefined` once it passes `maxBytes` (nothing is forwarded then). */
async function readBody(req, maxBytes) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

/** The field names a `Connection` header lists (lower case; node's own header names already are). */
const connectionListed = (value) => [value ?? []].flat().flatMap((v) => v.split(PROXY.listSeparator)).map((n) => n.trim().toLowerCase()).filter(Boolean)

/**
 * The caller's headers minus hop-by-hop fields (the fixed list, plus every field its `Connection`
 * header names, RFC 9110 §7.6.1) and its own credentials, plus the real bearer.
 */
function forwardHeaders(incoming, accessToken) {
  const headers = new Headers()
  const listed = connectionListed(incoming[PROXY.connection])
  for (const [name, value] of Object.entries(incoming)) {
    if (value === undefined || PROXY.dropRequestHeaders.includes(name) || listed.includes(name)) continue
    for (const one of [value].flat()) headers.append(name, one)
  }
  headers.set(PROXY.authorization, PROXY.bearerPrefix + accessToken)
  return headers
}

const refuse = (res, status) => { res.writeHead(status); res.end() }

/**
 * Start the proxy on 127.0.0.1 with an OS port.
 * @param options.servers `Map<routeId, server>`; a server offers `upstream`, `accessToken()`,
 *   `recover(failedAccessToken)` → the next token or `undefined`, `lose(failedAccessToken)`
 *   (drop the tokens after a second 401, only while they are still the failed ones), and
 *   `unreachable()` (the connector could not be reached for the child).
 * @param options.fetchFn the fetch every upstream request uses.
 * @returns `{route(routeId)}` → the child row's `{url, headers}` for that route (its per-start local
 *   bearer, never on disk); and `close()`.
 */
export async function startProxy({ servers, fetchFn }) {
  /** One local bearer per route, made at start and held only here. */
  const bearers = new Map()
  const bearerOf = (routeId) => {
    if (!bearers.has(routeId)) bearers.set(routeId, PROXY.bearerPrefix + opaqueValue(LIMIT.localBearerBytes))
    return bearers.get(routeId)
  }

  async function handle(req, res) {
    const { pathname } = new URL(req.url, `http://${PROXY.host}`)
    const routeId = pathname.startsWith(PROXY.pathPrefix) ? pathname.slice(PROXY.pathPrefix.length) : undefined
    const server = servers.get(routeId)
    if (server === undefined || !bearers.has(routeId) || !sameSecret(req.headers[PROXY.authorization], bearers.get(routeId))) return refuse(res, PROXY.status.notFound)
    let body
    if (!PROXY.bodyless.includes(req.method)) {
      body = await readBody(req, LIMIT.proxyBodyBytes)
      if (body === undefined) return refuse(res, PROXY.status.tooLarge)
    }
    const abort = new AbortController()
    res.on(PROXY.closeEvent, () => abort.abort())
    const send = async (accessToken) => {
      try {
        return await fetchFn(server.upstream, { method: req.method, headers: forwardHeaders(req.headers, accessToken), body, redirect: PROXY.redirect, signal: abort.signal })
      } catch (error) {
        // The child's own close aborts the request; anything else means the connector is unreachable.
        if (!abort.signal.aborted) server.unreachable()
        throw error
      }
    }

    const first = server.accessToken()
    if (first === undefined) return refuse(res, PROXY.status.unauthorized)
    let upstream = await send(first)
    if (upstream.status === PROXY.status.unauthorized) {
      // One refresh and one retry (MCP Authorization § Error Handling); concurrent 401s for the same
      // token share one refresh (the token manager's single flight). A "recovered" token equal to the
      // one that just failed would fail again, so there is no retry then.
      await upstream.body?.cancel()
      const next = await server.recover(first)
      if (next === undefined || next === first) return refuse(res, PROXY.status.unauthorized)
      upstream = await send(next)
      if (upstream.status === PROXY.status.unauthorized) {
        await upstream.body?.cancel()
        refuse(res, PROXY.status.unauthorized)
        await server.lose(next)
        return
      }
    }
    const headers = {}
    for (const [name, value] of upstream.headers) if (!PROXY.dropResponseHeaders.includes(name)) headers[name] = value
    res.writeHead(upstream.status, headers)
    if (upstream.body === null) { res.end(); return }
    res.flushHeaders()
    // Streamed chunk by chunk, so a listen stream stays open for as long as the connector keeps it.
    for await (const chunk of upstream.body) res.write(chunk)
    res.end()
  }

  const listener = await listenLoopback((req, res) => {
    handle(req, res).catch(() => { if (res.headersSent) res.destroy(); else refuse(res, PROXY.status.badGateway) })
  })
  return Object.freeze({
    // A fresh, unfrozen headers object per call: dsh-mcp-client's Schemastery config refuses a
    // frozen dict (checked on both SDKs), and the child row gets its own copy.
    route: (routeId) => ({
      url: `http://${PROXY.host}:${listener.port}${PROXY.pathPrefix}${routeId}`,
      headers: { Authorization: bearerOf(routeId) },
    }),
    close: listener.close,
  })
}
