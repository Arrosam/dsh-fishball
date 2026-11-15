/**
 * The MCP Streamable HTTP endpoint on DSH's listener (task C-HTTP; design §3.1, §3.3, §5.5;
 * R-CON-01, R-REM-01/03, R-TOK-01/02/06, R-ID-06, R-OA-05/09, R-SEC-03; spike V3-S1).
 * C-WIRE registers `handler` as the `exact` raw route PATHS.mcp (S1 F3: exact beats DSH's `/api`
 * prefix, whose browser fence therefore does not apply, so the gate checks Host itself).
 *
 * One request runs, and nothing after a refusal runs (design §3.1, PLAT-EP-01):
 * 1. `RequestGate.check` (405 → 403 → 503);
 * 2. a token in the query string → 400 `invalid_request`, before any lookup (R-TOK-02; RFC 6750 §2.3);
 * 3. the shared FailureLimiter, keyed by the remote address alone (FAILURE_LIMIT) → 429;
 * 4. `BearerVerifier.verify` → 401 with the K1 challenge and no body; the SDK is never reached;
 * 5. `RequestGate.admit` (413 for a declared length → 429), before the body is read, so the
 *    in-flight slot it takes also bounds the entry's concurrent uploads (K1 AdmitRequest);
 *    then the body is read up to one byte past the limit, and an undeclared body past it is 413;
 * 6. a pair-only caller reaches only PAIR_ONLY → else 403 `insufficient_scope` (R-ID-06);
 * 7. the SDK (`createMcpHandler`, `legacy: 'reject'`): version and header checks, then dispatch.
 *
 * Every tunable is K1's (`../../../mcp-schema`). The audience and `resource_metadata` follow the
 * request's origin as C-OAUTH's `originOf(req, {secure})` (`../oauth/`) gives it (R-OA-01, S1 C29),
 * so this module never derives a scheme or reads a forwarded header.
 */
import { readFileSync } from 'node:fs'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import {
  BEARER_CHALLENGE, ENDPOINT_LIMITS, GATE_SURFACE, HTTP_STATUS, OAUTH_ERROR, PAIR_ONLY, PATHS, PROTOCOL, REQUEST_GATE, RESOURCE, SCOPE,
  bearerChallenge, insufficientScopeChallenge, invalidTokenChallenge, oauthErrorBody, oauthUrls,
} from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { powerOf } from '../../pairs/index.js'
import { originOf } from '../oauth/index.js'
import {
  BEARER_MISSING, HTTP_HEADER, JSON_RPC, LOG, MANIFEST_URL, MEDIA_TYPE, SDK_OPTION, SERVER_NAME, TEXT_ENCODING, UNKNOWN_ADDRESS,
  URL_BASE, unsupportedVersionMessage,
} from './constants.js'
import { FORBIDDEN, TOO_LARGE, bareRefusal, rateLimited } from './gate.js'
import { createListenStreams, listensForEvents } from './streams.js'

const SERVER_INFO = Object.freeze({ name: SERVER_NAME, version: JSON.parse(readFileSync(MANIFEST_URL, TEXT_ENCODING)).version })
const CAPABILITIES = Object.freeze({ tools: Object.freeze({ listChanged: true }), resources: Object.freeze({ subscribe: true }) })
/** The Node adapter's own bound: the same as the gate's, so the SDK never answers a size the gate admitted. */
const NODE_ADAPTER_OPTIONS = Object.freeze({ maxRequestBodySize: ENDPOINT_LIMITS.bodyBytes })
const NOT_FOUND = bareRefusal(HTTP_STATUS.notFound)
const INTERNAL_ERROR = bareRefusal(HTTP_STATUS.internalServerError)

/** The listen-stream cap's 429 (ENDPOINT_LIMITS.listenStreamsPerPrincipal): K1 has it reuse REQUEST_GATE.inFlightRetryAfterMs. */
const STREAMS_LIMITED = rateLimited(REQUEST_GATE.inFlightRetryAfterMs)
const QUERY_TOKEN = Object.freeze({ pass: false, status: HTTP_STATUS.badRequest, headers: Object.freeze({}), body: oauthErrorBody(OAUTH_ERROR.invalidRequest) })

/**
 * Writes a gate-shaped refusal: `status`, `headers`, and `body` as JSON, or no body when `null`.
 *
 * A refusal is written before the body is read, or after only part of it, and the connection is
 * deliberately not closed with it: closing a socket that still holds unread request bytes makes
 * the kernel reset it, and a client that is still sending (an oversize body, PLAT-EP-01 row 3,
 * PLAT-BVA-02 row 3) then never reads its 401 or 413. Node's server discards an unread body itself
 * and only buffers none of it; the time it spends doing so is bounded by DSH's listener timeouts.
 */
function writeRefusal(res, { status, headers, body }) {
  if (body === null) {
    res.writeHead(status, headers)
    res.end()
    return
  }
  res.writeHead(status, { ...headers, [HTTP_HEADER.contentType]: MEDIA_TYPE.json })
  res.end(JSON.stringify(body))
}

/** A 401 or 403 bearer answer: only `WWW-Authenticate`, no body (AUTH-EP-02: byte-identical apart from `error`). */
const writeChallenge = (res, status, challenge) => writeRefusal(res, { status, headers: { [HTTP_HEADER.wwwAuthenticate]: challenge }, body: null })

/**
 * Reads the body, stopping one byte past ENDPOINT_LIMITS.bodyBytes, so an oversize body is never
 * buffered whole. It runs under the in-flight slot `admit` took (index.d.ts AdmitRequest). Past
 * the limit the rest is discarded as it arrives, never buffered. The request is neither destroyed
 * nor paused, for the reason `writeRefusal` gives: the client must be able to finish sending and
 * read its 413. This is what Node's server does itself with an unread body (`IncomingMessage._dump`),
 * bounded by DSH's listener timeouts.
 * @returns `{body, bytes}`, or undefined when the client aborted the upload (nothing to answer)
 */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    let bytes = 0
    const finish = (result) => {
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('error', onAbort)
      req.off('aborted', onAbort)
      resolve(result)
    }
    const onData = (chunk) => {
      chunks.push(chunk)
      bytes += chunk.length
      if (bytes <= ENDPOINT_LIMITS.bodyBytes) return
      finish({ body: Buffer.concat(chunks), bytes })
      // Flowing with no `data` listener: the remainder is read and dropped.
      req.resume()
    }
    const onEnd = () => finish({ body: Buffer.concat(chunks), bytes })
    // A client that hangs up mid-upload is not a server failure: no answer, no log line.
    const onAbort = () => finish(undefined)
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onAbort)
    req.once('aborted', onAbort)
  })
}

/**
 * The body length the request declares, for `admit` (K1 AdmitRequest.bodyBytes), or undefined
 * when it declares none (chunked). Node's parser has already refused a malformed `Content-Length`
 * and enforces a declared one, so a body never runs past what it declared.
 */
function declaredLength(req) {
  const header = req.headers[HTTP_HEADER.contentLength]
  const length = header === undefined ? undefined : Number(header)
  return Number.isSafeInteger(length) ? length : undefined
}

// The SDK decodes a body with TextDecoder, which drops a UTF-8 byte-order mark; decoding the same
// way here keeps this module's view of a message (pair-only power, listen routing) identical to
// the one the SDK then dispatches.
const decoder = new TextDecoder()

/** The single JSON-RPC message of a body, or undefined (not JSON, a batch, a non-object). */
function messageOf(body) {
  try {
    const value = JSON.parse(decoder.decode(body))
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether a pair-only caller may send `message` (PAIR_ONLY, R-OA-04): discovery, `tools/list`,
 * `tools/call pair`. Anything else, notifications included, needs full power.
 */
function pairOnlyMay(message) {
  if (PAIR_ONLY.methods.includes(message.method)) return true
  return message.method === JSON_RPC.toolsCallMethod && PAIR_ONLY.tools.includes(message.params?.name)
}

/**
 * The SDK's answer, with a -32022 (PROTOCOL.unsupportedVersionCode) message rewritten to name the
 * served revision (design §3.1, PLAT-UC-01 E1); status, code and `data` stay the SDK's. Any other
 * answer, streams included, passes untouched.
 */
async function namingServedRevision(response) {
  if (response.status !== HTTP_STATUS.badRequest || !response.headers.get(HTTP_HEADER.contentType)?.startsWith(MEDIA_TYPE.json)) return response
  const body = messageOf(Buffer.from(await response.clone().arrayBuffer()))
  if (body?.error?.code !== PROTOCOL.unsupportedVersionCode) return response
  const headers = new Headers(response.headers)
  headers.delete(HTTP_HEADER.contentLength)
  const named = { ...body, error: { ...body.error, message: unsupportedVersionMessage(PROTOCOL.version) } }
  return new Response(JSON.stringify(named), { status: response.status, headers })
}

/** A fetch face that answers as `handler.fetch` does, with the served revision named. */
const naming = (fetch) => async (request, options) => namingServedRevision(await fetch(request, options))

/**
 * The request as the SDK's Node adapter reads it, replaying the body this module already read.
 * `toWebRequest` duck-types its input (method, url, headers, async-iterable body), so the SDK's
 * own content-type, JSON and size answers stay authoritative. The token value stops at the
 * verifier: `auth` (the SDK's `authInfo`) carries none, and the `Authorization` header is left out,
 * because the SDK hands the request to every handler as `ctx.http.req` (tools, contributors).
 */
function replayed(req, body, caller) {
  const headers = { ...req.headers }
  delete headers[HTTP_HEADER.authorization]
  return {
    method: req.method,
    url: req.url,
    headers,
    auth: { token: '', clientId: caller.clientId, scopes: [caller.scope], resource: new URL(caller.audience), extra: { caller } },
    async *[Symbol.asyncIterator]() { if (body.length > 0) yield body },
  }
}

/**
 * @param {object} ports
 * @param {import('../../../mcp-schema/index.js').RequestGate} ports.gate the one gate (C-WIRE)
 * @param {import('../../../mcp-schema/index.js').BearerVerifier} ports.verifier C-OAUTH's
 * @param {import('../../../mcp-schema/index.js').FailureLimiter} ports.failures the one shared limiter (C-OAUTH)
 * @param {Pick<import('../../../mcp-schema/index.js').PairStore, 'pairOf' | 'seen'>} ports.pairs C-PAIR's store
 * @param {boolean} ports.secure GateListenerFacts.secure of DSH's listener
 * @param {(principalKey: string) => Promise<object>} ports.readEvents the `resources/read dsh-agent://events`
 *   result for a full caller (C-WIRE binds C-MAILBOX's `readEventsResource`; Fishball 2026-11-14, Q6 B)
 * @param {(server: McpServer, caller: object) => void} [ports.populate] registers the caller's tools
 *   (C-TOOLS, C-EXT; C-WIRE composes them); pair-only callers get `pair` only (R-OA-04)
 * @param {() => number} ports.now injected clock
 * @param {{warn(...args: unknown[]): void}} ports.logger
 */
export function createMcpEndpoint({ gate, verifier, failures, pairs, secure, readEvents, populate = () => {}, now, logger }) {
  const onerror = (error) => logger.warn(LOG.format, LOG.sdkError, diagnosticOf(error))

  /** One fresh McpServer per request (the SDK's per-request factory), built for the verified caller. */
  function factory({ authInfo }) {
    const caller = authInfo.extra.caller
    const server = new McpServer(SERVER_INFO, { capabilities: CAPABILITIES })
    // R-OA-09: `server/discover` advertises the client-credentials extension, with empty settings.
    server.server.registerCapabilities({ extensions: { [PROTOCOL.clientCredentialsExtension]: {} } })
    if (caller.scope === SCOPE.full) {
      server.registerResource(RESOURCE.events.name, RESOURCE.events.uri, { mimeType: RESOURCE.events.mimeType }, () => readEvents(caller.principalKey))
    }
    populate(server, caller)
    return server
  }

  const handlerOptions = Object.freeze({ legacy: SDK_OPTION.legacy, maxRequestBodySize: ENDPOINT_LIMITS.bodyBytes, onerror })
  const requests = createMcpHandler(factory, { ...handlerOptions, maxSubscriptions: SDK_OPTION.noListenStreams })
  const requestNode = toNodeHandler({ fetch: naming(requests.fetch) }, NODE_ADAPTER_OPTIONS)
  const streams = createListenStreams({ factory, handlerOptions, logger })

  /** Steps 2–4: the caller, or undefined once a refusal has been written. */
  function authenticate(req, res, url, origin) {
    if (url.searchParams.has(BEARER_CHALLENGE.queryParameter)) return void writeRefusal(res, QUERY_TOKEN)
    const failureKey = { remoteAddress: req.socket?.remoteAddress ?? UNKNOWN_ADDRESS }
    const at = now()
    const limited = failures.check(failureKey, at)
    if (limited.limited) return void writeRefusal(res, rateLimited(limited.retryAfterMs))
    const caller = verifier.verify(req.headers[HTTP_HEADER.authorization], oauthUrls(origin).resource, at)
    if (caller.error === BEARER_MISSING) return void writeChallenge(res, HTTP_STATUS.unauthorized, bearerChallenge(origin))
    if (caller.error !== undefined) {
      // A refused credential counts toward the shared failure limit (FAILURE_LIMIT, AUTH-UC-07); no token is not one.
      failures.recordFailure(failureKey, at)
      return void writeChallenge(res, HTTP_STATUS.unauthorized, invalidTokenChallenge(origin))
    }
    if (caller.principalKey !== undefined) pairs.seen(caller.principalKey, at)
    return caller
  }

  /** `subscriptions/listen`: on the pair's own handler, within its stream cap; it holds no in-flight slot. */
  async function listen(req, res, body, caller, message, admitted) {
    const reservation = streams.reserve(caller.principalKey, caller.entryKey)
    if (reservation === undefined) {
      admitted.done()
      return writeRefusal(res, STREAMS_LIMITED)
    }
    const events = listensForEvents(message)
    const node = toNodeHandler({
      fetch: async (request, options) => {
        try {
          return await namingServedRevision(await reservation.fetch(request, options, { res, events }))
        } finally {
          // An open stream holds no in-flight slot (the user's decision 2026-11-14, K1b).
          admitted.done()
        }
      },
    }, NODE_ADAPTER_OPTIONS)
    try {
      await node(replayed(req, body, caller), res)
    } finally {
      reservation.release()
    }
  }

  async function serve(req, res) {
    const url = new URL(req.url ?? PATHS.mcp, URL_BASE)
    const checked = gate.check({ method: req.method, path: url.pathname, headers: req.headers }, GATE_SURFACE.mcp)
    if (!checked.pass) return writeRefusal(res, checked)
    const origin = originOf(req, { secure })
    // `check` passed, so the Host is allowed and well formed; an origin C-OAUTH still cannot build
    // is refused as a Host the endpoint cannot name, before any credential is read.
    if (origin === undefined) return writeRefusal(res, FORBIDDEN)
    // Defensive: DSH's `exact` route sends only PATHS.mcp here, but the handler stays correct if mounted otherwise.
    if (url.pathname !== PATHS.mcp) return writeRefusal(res, NOT_FOUND)
    const caller = authenticate(req, res, url, origin)
    if (caller === undefined) return undefined
    const admitted = gate.admit({
      method: req.method, path: url.pathname, headers: req.headers, bodyBytes: declaredLength(req),
    }, GATE_SURFACE.mcp, caller)
    if (!admitted.pass) return writeRefusal(res, admitted)
    try {
      const read = await readBody(req)
      if (read === undefined) return undefined
      const { body, bytes } = read
      // Only an undeclared (chunked) body gets here oversize: `admit` refused a declared one. Its
      // bucket token stays spent, as for any admitted request.
      if (bytes > ENDPOINT_LIMITS.bodyBytes) return writeRefusal(res, TOO_LARGE)
      const message = messageOf(body)
      // A body that is no single JSON-RPC message (not JSON, a batch) is left to the SDK, which
      // refuses it as malformed whatever the caller's power (Fishball 2026-11-14, Q3).
      if (caller.scope !== SCOPE.full && message !== undefined && !pairOnlyMay(message)) {
        const { reason } = powerOf(pairs.pairOf(caller.entryKey), caller.clientId)
        return writeChallenge(res, HTTP_STATUS.forbidden, insufficientScopeChallenge(origin, reason))
      }
      if (message?.method === JSON_RPC.listenMethod) return await listen(req, res, body, caller, message, admitted)
      return await requestNode(replayed(req, body, caller), res)
    } finally {
      admitted.done()
    }
  }

  /** The raw route handler. It never throws into DSH's webserver. */
  async function handler(req, res) {
    try {
      await serve(req, res)
    } catch (error) {
      logger.warn(LOG.format, LOG.requestFailed, diagnosticOf(error))
      if (!res.headersSent) writeRefusal(res, INTERNAL_ERROR)
      else res.destroy()
    }
  }

  /** Closes every handler: open streams complete gracefully, in-flight requests are aborted. */
  async function close() {
    streams.close()
    await requests.close()
  }

  return Object.freeze({
    handler,
    hints: streams.hints,
    presence: streams.presence,
    toolsChanged: streams.toolsChanged,
    closeEntry: streams.closeEntry,
    close,
  })
}
