/**
 * Dedicated, ephemeral host-to-host provider migration channel. The owner-authenticated
 * page routes own every public call; this class must never be registered as a session tool.
 * No DSH Web/OAuth credentials or credential files are read here.
 *
 * identity: { runtimeId, profileId, schemaVersion, version }, safe identifiers only.
 * profileId must identify the canonical home/profile; runtimeId changes on every boot.
 * start(); target.invitation() -> text; source.beginPair(text) -> {pairId, identity, expiresAt};
 * target.approvePair(pairId); source.finishPair(pairId) -> peer();
 * peer(): {identity, pairId, request('inventory'|'import', JSON object, {signal}?)}.
 * Aborting a source request permanently closes its channel; it never retries the operation.
 * handle(action, payload, peerIdentity, {signal, pairId}) runs only on the paired target.
 * The adapter must honor signal before writes; JavaScript cannot revoke an SDK write
 * already in progress. Failed operations are never retried by this transport.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'

/** Feature-owned protocol and capacity limits; neither routes nor limits reuse the session bridge. */
export const PROVIDER_SYNC_CHANNEL = Object.freeze({
  protocol: 'fishball-provider-sync', protocolVersion: 1,
  host: '127.0.0.1', protocolScheme: 'http:', path: '/provider-sync/v1', randomPort: 0,
  ttlMs: 300_000, timeoutMs: 10_000, maxTimerMs: 2_147_483_647,
  maxJsonBytes: 1_048_576, maxInvitationBytes: 8_192, maxHeaderBytes: 16_384,
  maxConnections: 16, requestsPerSocket: 1, tokenBytes: 32,
  initialSequence: 1, minPort: 1, maxPort: 65_535,
  encoding: 'utf8', tokenEncoding: 'hex', jsonType: 'application/json',
  method: 'POST', bearerPrefix: 'Bearer ', connectionClose: 'close',
  identityKeys: Object.freeze(['runtimeId', 'profileId', 'schemaVersion', 'version']),
  identifier: /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/,
  token: /^[a-f0-9]{64}$/, decimalPort: /^[1-9][0-9]{0,4}$/, contentLength: /^\d+$/,
  header: Object.freeze({type: 'content-type', length: 'content-length', authorization: 'authorization',
    host: 'host', origin: 'origin', cache: 'cache-control', connection: 'connection', fetchPrefix: 'sec-fetch-'}),
  noStore: 'no-store', hostPortSeparator: ':',
  state: Object.freeze({new: 'new', starting: 'starting', ready: 'ready',
    pendingSource: 'pendingSource', pendingTarget: 'pendingTarget', approvedSource: 'approvedSource',
    paired: 'paired', expired: 'expired', failed: 'failed', closed: 'closed'}),
  role: Object.freeze({source: 'source', target: 'target'}),
  kind: Object.freeze({begin: 'begin', finish: 'finish', operation: 'operation'}),
  actions: Object.freeze(['inventory', 'import']),
  status: Object.freeze({ok: 200, invalid: 400, unauthorized: 403, conflict: 409, large: 413, failed: 500}),
  code: Object.freeze({invalid: 'provider-sync-invalid', state: 'provider-sync-state',
    unauthorized: 'provider-sync-unauthorized', busy: 'provider-sync-busy',
    expired: 'provider-sync-expired', closed: 'provider-sync-closed',
    notApproved: 'provider-sync-not-approved', tooLarge: 'provider-sync-too-large',
    timeout: 'provider-sync-timeout', cancelled: 'provider-sync-cancelled',
    failed: 'provider-sync-failed', handler: 'provider-sync-handler-failed'}),
  errorMessage: 'Provider sync channel refused the operation.',
})
const C = PROVIDER_SYNC_CHANNEL
const S = C.state
const K = C.kind
const E = C.code
const H = C.header
const ignoreStreamError = () => {}
const ALLOWED_ERRORS = new Set(Object.values(E))
const TERMINAL_STATES = new Set([S.expired, S.failed, S.closed])
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const token = () => randomBytes(C.tokenBytes).toString(C.tokenEncoding)
const isToken = (value) => typeof value === 'string' && C.token.test(value)
const sameToken = (left, right) => isToken(left) && isToken(right)
  && timingSafeEqual(Buffer.from(left, C.tokenEncoding), Buffer.from(right, C.tokenEncoding))
const validDuration = (value) => Number.isSafeInteger(value) && value > 0 && value <= C.maxTimerMs
const sameIdentity = (left, right) => C.identityKeys.every((key) => left[key] === right[key])

export class ProviderSyncChannelError extends Error {
  constructor(code) { super(C.errorMessage); this.code = code }
}
const refusal = (code) => new ProviderSyncChannelError(code)
const safeError = (error) => refusal(error instanceof ProviderSyncChannelError ? error.code : E.failed)
function identityOf(value) {
  if (!isRecord(value) || Object.keys(value).length !== C.identityKeys.length
    || !C.identityKeys.every((key) => typeof value[key] === 'string' && C.identifier.test(value[key]))) throw refusal(E.invalid)
  return Object.freeze(Object.fromEntries(C.identityKeys.map((key) => [key, value[key]])))
}
function encode(value, maxBytes = C.maxJsonBytes) {
  let text
  try { text = JSON.stringify(value) } catch { throw refusal(E.invalid) }
  if (typeof text !== 'string') throw refusal(E.invalid)
  if (Buffer.byteLength(text, C.encoding) > maxBytes) throw refusal(E.tooLarge)
  return text
}
function decode(text) {
  try { return JSON.parse(text) } catch { throw refusal(E.invalid) }
}

/** Both HTTP directions are byte-bounded before parsing; no request body or native error escapes. */
function readJson(stream, signal) {
  return new Promise((resolve, reject) => {
    let chunks = [], size = 0, settled = false
    const cleanup = () => {
      stream.off('data', onData); stream.off('end', onEnd)
      stream.off('error', onError); stream.off('aborted', onError)
      signal.removeEventListener('abort', onAbort)
      chunks = []
    }
    const settle = (error, value) => {
      if (settled) return
      settled = true; cleanup()
      if (error) reject(error); else resolve(value)
    }
    const onError = () => settle(refusal(E.failed))
    const onAbort = () => settle(refusal(E.timeout))
    const onData = (chunk) => {
      size += chunk.length
      if (size > C.maxJsonBytes) { stream.pause(); settle(refusal(E.tooLarge)); return }
      chunks.push(chunk)
    }
    const onEnd = () => {
      try { settle(null, decode(Buffer.concat(chunks).toString(C.encoding))) }
      catch (error) { settle(safeError(error)) }
    }
    stream.on('data', onData); stream.once('end', onEnd)
    stream.once('error', onError); stream.once('aborted', onError)
    signal.addEventListener('abort', onAbort, {once: true})
    if (signal.aborted) onAbort()
    const length = stream.headers[H.length]
    if (length !== undefined && (!C.contentLength.test(length) || Number(length) > C.maxJsonBytes)) {
      stream.pause(); settle(refusal(E.tooLarge))
    }
  })
}
function endpointOf(invitationText) {
  if (typeof invitationText !== 'string') throw refusal(E.invalid)
  if (Buffer.byteLength(invitationText, C.encoding) > C.maxInvitationBytes) throw refusal(E.tooLarge)
  const value = decode(invitationText)
  if (!isRecord(value) || value.protocol !== C.protocol || value.version !== C.protocolVersion
    || !isToken(value.capability) || !Number.isSafeInteger(value.expiresAt)) throw refusal(E.invalid)
  let url
  try { url = new URL(value.url) } catch { throw refusal(E.invalid) }
  // Construct the request from validated components, never from a redirect or supplied hostname.
  if (url.protocol !== C.protocolScheme || url.hostname !== C.host || !C.decimalPort.test(url.port)
    || Number(url.port) < C.minPort || Number(url.port) > C.maxPort || url.pathname !== C.path
    || url.username || url.password || url.search || url.hash
    || value.url !== urlCanonical(url.port)) throw refusal(E.invalid)
  if (value.expiresAt <= Date.now()) throw refusal(E.expired)
  return {port: Number(url.port), capability: value.capability, expiresAt: value.expiresAt}
}
const urlCanonical = (port) => `${C.protocolScheme}//${C.host}:${port}${C.path}`

export class ProviderSyncChannel {
  #identity; #handle; #ttlMs; #timeoutMs
  #state = S.new; #role; #server; #port; #expiresAt; #expiryTimer; #invitationCapability
  #pairId; #pairCapability; #peerIdentity; #remote; #sequence = C.initialSequence
  #incomingBusy = false; #outgoingBusy = false; #closePromise; #cancelStart; #listenController
  #sockets = new Set(); #requests = new Set(); #controllers = new Set()

  constructor({identity, handle, ttlMs = C.ttlMs, timeoutMs = C.timeoutMs} = {}) {
    this.#identity = identityOf(identity)
    if (typeof handle !== 'function' || !validDuration(ttlMs) || !validDuration(timeoutMs)) throw refusal(E.invalid)
    this.#handle = handle; this.#ttlMs = ttlMs; this.#timeoutMs = timeoutMs
  }

  async start() {
    if (this.#state !== S.new) throw refusal(E.state)
    this.#state = S.starting
    const server = createServer({maxHeaderSize: C.maxHeaderBytes}, (req, res) => { void this.#receive(req, res) })
    this.#server = server
    this.#listenController = new AbortController()
    server.maxConnections = C.maxConnections
    server.maxRequestsPerSocket = C.requestsPerSocket
    server.requestTimeout = this.#timeoutMs
    server.headersTimeout = this.#timeoutMs
    server.on('connection', (socket) => {
      this.#sockets.add(socket)
      // Node's header timer is swept periodically and socket inactivity can be reset
      // by dribbled bytes. A dedicated total lifetime closes slow partial requests too.
      const timer = setTimeout(() => socket.destroy(), this.#timeoutMs)
      timer.unref?.()
      socket.once('close', () => { clearTimeout(timer); this.#sockets.delete(socket) })
    })
    server.on('clientError', (_error, socket) => socket.destroy())
    try {
      await new Promise((resolve, reject) => {
        this.#cancelStart = () => reject(refusal(E.closed))
        server.once('error', reject)
        server.listen({port: C.randomPort, host: C.host, signal: this.#listenController.signal},
          () => { server.off('error', reject); resolve() })
      })
      this.#cancelStart = undefined
      server.on('error', () => { void this.#terminate(S.failed) })
      if (this.#state !== S.starting) { await this.#terminate(this.#state); throw refusal(E.closed) }
      this.#port = server.address().port
      this.#expiresAt = Date.now() + this.#ttlMs
      this.#invitationCapability = token()
      this.#state = S.ready
      this.#expiryTimer = setTimeout(() => { void this.#terminate(S.expired) }, this.#ttlMs)
      this.#expiryTimer.unref?.()
      return this.status()
    } catch (error) {
      await this.#terminate(this.#state === S.closed ? S.closed : S.failed)
      throw safeError(error)
    }
  }

  invitation() {
    this.#assertLive()
    if (this.#state !== S.ready || this.#outgoingBusy) throw refusal(E.state)
    return encode({protocol: C.protocol, version: C.protocolVersion, url: urlCanonical(this.#port),
      capability: this.#invitationCapability, expiresAt: this.#expiresAt}, C.maxInvitationBytes)
  }

  async beginPair(invitationText) {
    this.#assertLive()
    if (this.#outgoingBusy) throw refusal(E.busy)
    if (this.#state !== S.ready || this.#incomingBusy) throw refusal(E.state)
    const remote = endpointOf(invitationText)
    if (remote.port === this.#port) throw refusal(E.invalid)
    this.#outgoingBusy = true
    this.#role = C.role.source
    this.#state = S.pendingTarget
    this.#invitationCapability = undefined
    this.#pairCapability = token()
    try {
      const result = await this.#post(remote.port, remote.capability,
        {kind: K.begin, identity: this.#identity, capability: this.#pairCapability})
      this.#assertLive()
      const identity = identityOf(result?.identity)
      if (!isToken(result?.pairId) || !Number.isSafeInteger(result?.expiresAt)
        || result.expiresAt > remote.expiresAt || result.expiresAt <= Date.now()
        || identity.runtimeId === this.#identity.runtimeId) throw refusal(E.invalid)
      this.#peerIdentity = identity; this.#pairId = result.pairId
      this.#remote = {port: remote.port}
      this.#shortenExpiry(result.expiresAt)
      return {pairId: this.#pairId, identity: {...identity}, expiresAt: this.#expiresAt}
    } catch (error) { await this.#terminate(S.failed); throw safeError(error) }
    finally { this.#outgoingBusy = false }
  }

  approvePair(pairId) {
    this.#assertLive()
    if (this.#incomingBusy || this.#outgoingBusy) throw refusal(E.busy)
    if (this.#role !== C.role.target || this.#state !== S.pendingSource || pairId !== this.#pairId) throw refusal(E.state)
    this.#state = S.approvedSource
    return this.status()
  }

  async finishPair(pairId) {
    this.#assertLive()
    if (this.#outgoingBusy) throw refusal(E.busy)
    if (this.#role !== C.role.source || this.#state !== S.pendingTarget || pairId !== this.#pairId) throw refusal(E.state)
    this.#outgoingBusy = true
    try {
      const result = await this.#post(this.#remote.port, this.#pairCapability, {kind: K.finish, pairId})
      this.#assertLive()
      if (!sameIdentity(identityOf(result?.identity), this.#peerIdentity) || result.pairId !== pairId) throw refusal(E.invalid)
      this.#state = S.paired
      return this.peer()
    } catch (error) {
      // A premature source-page confirmation can be explicitly submitted again, never retried here.
      if (!(error instanceof ProviderSyncChannelError) || error.code !== E.notApproved) await this.#terminate(S.failed)
      throw safeError(error)
    } finally { this.#outgoingBusy = false }
  }

  status() {
    this.#checkExpiry()
    return {state: this.#state, identity: {...this.#identity},
      ...(this.#role ? {role: this.#role} : {}),
      ...(this.#peerIdentity ? {peer: {...this.#peerIdentity}} : {}),
      ...(this.#pairId ? {pairId: this.#pairId} : {}),
      ...(this.#expiresAt ? {expiresAt: this.#expiresAt} : {})}
  }

  peer() {
    this.#assertLive()
    if (this.#state !== S.paired || this.#role !== C.role.source) throw refusal(E.state)
    return Object.freeze({identity: Object.freeze({...this.#peerIdentity}), pairId: this.#pairId,
      request: (action, payload, options) => this.#send(action, payload, options)})
  }

  async close() { await this.#terminate(S.closed) }

  #checkExpiry() {
    if (!TERMINAL_STATES.has(this.#state) && this.#expiresAt !== undefined && Date.now() >= this.#expiresAt) void this.#terminate(S.expired)
  }
  #assertLive() {
    this.#checkExpiry()
    if (this.#state === S.expired) throw refusal(E.expired)
    if (this.#state === S.closed) throw refusal(E.closed)
    if (TERMINAL_STATES.has(this.#state) || this.#state === S.new || this.#state === S.starting) throw refusal(E.state)
  }
  #shortenExpiry(expiresAt) {
    this.#expiresAt = Math.min(this.#expiresAt, expiresAt)
    clearTimeout(this.#expiryTimer)
    this.#expiryTimer = setTimeout(() => { void this.#terminate(S.expired) }, Math.max(0, this.#expiresAt - Date.now()))
    this.#expiryTimer.unref?.()
  }
  #deadline() {
    const controller = new AbortController()
    this.#controllers.add(controller)
    const timer = setTimeout(() => controller.abort(), Math.min(this.#timeoutMs, this.#expiresAt - Date.now()))
    timer.unref?.()
    return {signal: controller.signal, abort: () => controller.abort(),
      done: () => { clearTimeout(timer); this.#controllers.delete(controller) }}
  }

  async #send(action, payload, options = {}) {
    this.#assertLive()
    if (!isRecord(options) || (options.signal !== undefined && !(options.signal instanceof AbortSignal))) throw refusal(E.invalid)
    const {signal} = options
    if (this.#state !== S.paired || this.#role !== C.role.source) throw refusal(E.state)
    if (!C.actions.includes(action) || !isRecord(payload)) throw refusal(E.invalid)
    if (this.#outgoingBusy) throw refusal(E.busy)
    // Validate capacity before consuming the sequence; no side-effect request is automatically replayed.
    const body = {kind: K.operation, pairId: this.#pairId, sequence: this.#sequence, action, payload}
    const text = encode(body)
    this.#outgoingBusy = true
    this.#sequence++
    const onAbort = () => { void this.#terminate(S.closed) }
    signal?.addEventListener('abort', onAbort, {once: true})
    try {
      if (signal?.aborted) { onAbort(); throw refusal(E.cancelled) }
      return await this.#post(this.#remote.port, this.#pairCapability, body, text)
    } catch (error) {
      if (signal?.aborted) throw refusal(E.cancelled)
      // Handler failures have an acknowledged, consumed sequence. Transport ambiguity requires re-pairing.
      if (!(error instanceof ProviderSyncChannelError) || error.code !== E.handler) await this.#terminate(S.failed)
      throw safeError(error)
    } finally {
      signal?.removeEventListener('abort', onAbort)
      this.#outgoingBusy = false
    }
  }

  async #post(port, capability, body, text = encode(body)) {
    const deadline = this.#deadline()
    let req
    try {
      return await new Promise((resolve, reject) => {
        const fail = (error) => reject(safeError(error))
        req = httpRequest({hostname: C.host, port, path: C.path, method: C.method, agent: false,
          signal: deadline.signal, maxHeaderSize: C.maxHeaderBytes,
          headers: {[H.type]: C.jsonType, [H.length]: Buffer.byteLength(text, C.encoding),
            [H.authorization]: C.bearerPrefix + capability, [H.connection]: C.connectionClose}}, (res) => {
          res.on('error', ignoreStreamError)
          void (async () => {
            try {
              if (res.headers[H.type] !== C.jsonType) throw refusal(E.invalid)
              const value = await readJson(res, deadline.signal)
              if (res.statusCode !== C.status.ok || value?.ok !== true) {
                throw refusal(ALLOWED_ERRORS.has(value?.code) ? value.code : E.failed)
              }
              this.#assertLive()
              resolve(value.result)
            } catch (error) { fail(error) }
            finally { res.destroy() }
          })()
        })
        this.#requests.add(req)
        req.once('error', () => fail(refusal(deadline.signal.aborted ? E.timeout : E.failed)))
        req.once('close', () => this.#requests.delete(req))
        req.end(text)
      })
    } finally { deadline.done(); req?.destroy() }
  }

  async #receive(req, res) {
    let deadline, onDisconnect, ownsBusy = false, operation = false
    req.on('error', ignoreStreamError); res.on('error', ignoreStreamError)
    const send = (status, value) => {
      if (res.destroyed || res.writableEnded) return
      const text = encode(value)
      res.writeHead(status, {[H.type]: C.jsonType, [H.cache]: C.noStore,
        [H.length]: Buffer.byteLength(text, C.encoding), [H.connection]: C.connectionClose})
      res.end(text)
    }
    try {
      this.#assertLive()
      // Reject browser-originated traffic even when a page has seen an invitation. Pair secrets
      // and payloads belong to the host, not the browser or the host's ordinary authenticated API.
      if (req.socket.remoteAddress !== C.host || req.method !== C.method || req.url !== C.path
        || req.headers[H.host] !== C.host + C.hostPortSeparator + this.#port || req.headers[H.origin] !== undefined
        || Object.keys(req.headers).some((key) => key.startsWith(H.fetchPrefix))
        || req.headers[H.type] !== C.jsonType) throw refusal(E.unauthorized)
      if (this.#incomingBusy) throw refusal(E.busy)
      const authorization = req.headers[H.authorization]
      const capability = typeof authorization === 'string' && authorization.startsWith(C.bearerPrefix)
        ? authorization.slice(C.bearerPrefix.length) : undefined
      const beginning = this.#state === S.ready
      if (!sameToken(capability, beginning ? this.#invitationCapability : this.#pairCapability)) throw refusal(E.unauthorized)
      this.#incomingBusy = true; ownsBusy = true
      deadline = this.#deadline()
      onDisconnect = () => { if (!res.writableFinished) deadline.abort() }
      res.once('close', onDisconnect)
      const body = await readJson(req, deadline.signal)
      this.#assertLive()
      if (deadline.signal.aborted) throw refusal(E.timeout)
      if (!isRecord(body)) throw refusal(E.invalid)
      operation = body.kind === K.operation
      const result = await this.#dispatch(body, beginning, deadline.signal)
      this.#assertLive()
      if (deadline.signal.aborted) throw refusal(E.timeout)
      send(C.status.ok, {ok: true, result})
    } catch (error) {
      const code = safeError(error).code
      const status = code === E.unauthorized ? C.status.unauthorized : code === E.tooLarge ? C.status.large
        : code === E.invalid ? C.status.invalid : code === E.handler ? C.status.failed : C.status.conflict
      try { send(status, {ok: false, code}) } catch { res.destroy() }
    } finally {
      if (onDisconnect) res.off('close', onDisconnect)
      // A disconnected/expired import is ambiguous. Revoke the pairing rather than allow
      // another request alongside adapter work which may still be observing cancellation.
      if (operation && deadline?.signal.aborted) void this.#terminate(S.failed)
      deadline?.done()
      if (ownsBusy) this.#incomingBusy = false
    }
  }

  async #dispatch(body, beginning, signal) {
    if (beginning) {
      if (body.kind !== K.begin || !isToken(body.capability)) throw refusal(E.invalid)
      const identity = identityOf(body.identity)
      if (identity.runtimeId === this.#identity.runtimeId) throw refusal(E.invalid)
      this.#role = C.role.target; this.#peerIdentity = identity
      this.#pairId = token(); this.#pairCapability = body.capability
      this.#invitationCapability = undefined
      this.#state = S.pendingSource
      return {pairId: this.#pairId, identity: this.#identity, expiresAt: this.#expiresAt}
    }
    if (this.#role !== C.role.target || body.pairId !== this.#pairId) throw refusal(E.unauthorized)
    if (body.kind === K.finish) {
      if (this.#state === S.pendingSource) throw refusal(E.notApproved)
      if (this.#state !== S.approvedSource) throw refusal(E.state)
      this.#state = S.paired
      return {pairId: this.#pairId, identity: this.#identity}
    }
    if (this.#state !== S.paired || body.kind !== K.operation) throw refusal(E.state)
    if (!C.actions.includes(body.action) || !isRecord(body.payload)
      || body.sequence !== this.#sequence || !Number.isSafeInteger(body.sequence)) throw refusal(E.invalid)
    this.#sequence++
    // Consume before invoking the adapter. A replay must not run a partially completed import twice.
    let onAbort
    try {
      const aborted = new Promise((_resolve, reject) => {
        onAbort = () => reject(refusal(E.timeout))
        signal.addEventListener('abort', onAbort, {once: true})
        if (signal.aborted) onAbort()
      })
      const handled = Promise.resolve().then(() => {
        this.#assertLive()
        if (signal.aborted) throw refusal(E.timeout)
        return this.#handle(body.action, body.payload, {...this.#peerIdentity}, {signal, pairId: this.#pairId})
      })
      const result = await Promise.race([handled, aborted])
      return result ?? null
    } catch { throw refusal(signal.aborted ? E.timeout : E.handler) }
    finally { signal.removeEventListener('abort', onAbort) }
  }

  #terminate(state) {
    // State changes and key references are removed synchronously, before asynchronous socket cleanup.
    if (!TERMINAL_STATES.has(this.#state) || state === S.closed) this.#state = state
    this.#cancelStart?.(); this.#cancelStart = undefined
    this.#listenController?.abort()
    clearTimeout(this.#expiryTimer)
    this.#invitationCapability = undefined; this.#pairCapability = undefined
    this.#remote = undefined; this.#handle = undefined
    for (const controller of this.#controllers) controller.abort()
    for (const req of this.#requests) req.destroy()
    for (const socket of this.#sockets) socket.destroy()
    this.#controllers.clear(); this.#requests.clear(); this.#sockets.clear()
    if (!this.#closePromise || this.#server?.listening) {
      this.#closePromise = new Promise((resolve) => {
        if (!this.#server) { resolve(); return }
        this.#server.close(() => resolve())
        this.#server.closeAllConnections?.()
      })
    }
    return this.#closePromise
  }
}
