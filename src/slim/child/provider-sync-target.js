/**
 * The isolated child's provider-sync target (§10, §15 T16).
 *
 * The source is the main DSH; the target is this child's own home. The preview and confirmation
 * rules stay in src/provider-sync.js: this module only reaches that engine over the lifecycle
 * wire and supplies the child's own services. Nothing here reads a credential value; the engine's
 * inventory actions describe presence only, and a record arrives solely in a confirmed `import`
 * frame after the main side read it for that confirmation.
 *
 * Transport: the pairing channel is useless across the lifecycle (`src/provider-sync-channel.js`
 * pairs two user-visible profiles over loopback), so the target rides the already-authenticated
 * lifecycle wire on its own payload channel, exactly like the T11 admin protocol. This module
 * owns the frame shapes, the endpoint and the child row; the wire/runtime/host wiring is a merge
 * hook (see the delivery report):
 *   1. src/native-runtime/wire.js carries PROVIDER_SYNC_TARGET.channel;
 *   2. src/native-runtime/child.js publishes the child end through onProviderSyncTransport;
 *   3. src/native-runtime/index.js publishes the main end the same way;
 *   4. src/native-runtime/overlay.js inserts this module as a child row;
 *   5. src/native-runtime/installation.js copyChildCode also copies src/provider-sync.js and
 *      src/provider-sync-host.js beside the snapshot's src/slim tree.
 *
 * No value ever appears in a preview, a refusal or a result: group entries are exact-key checked
 * against metadata only, and the record validator lives in src/provider-sync.js.
 */
import { createHash, randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { PROVIDER_SYNC, ProviderSyncEngine, ProviderSyncError } from '../../provider-sync.js'

const KIB = 1024
const HEX = '0123456789abcdef'
const NO_KEYS = Object.freeze([])
const CONFIG_OUTCOMES = Object.freeze(['added', 'unchanged', 'failed', 'unknown'])
const KEY_OUTCOMES = Object.freeze(['imported', 'exists', 'failed', 'not-attempted', 'unknown'])
const SYNC_STATUSES = Object.freeze(['succeeded', 'partial', 'failed', 'skipped', 'unknown'])
const SAFE_CODE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/

/**
 * Feature-owned protocol and capacity limits. The frame bound mirrors the T11 admin channel:
 * the lifecycle wire caps one frame at 1 MiB (RUNTIME_LIMITS.maxFrameBytes) and this protocol
 * rides inside it as a JSON string, where every quote gains an escape byte. Half of that frame
 * leaves headroom, so an oversize reply is a typed refusal instead of a dropped wire.
 */
export const PROVIDER_SYNC_TARGET = Object.freeze({
  version: 1,
  channel: 'provider-sync',
  actions: Object.freeze({ inventory: 'inventory', import: 'import' }),
  identity: Object.freeze({
    schemaVersion: '1',
    keys: Object.freeze(['runtimeId', 'profileId', 'schemaVersion', 'version']),
    identifier: /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/,
    hash: 'sha256',
    encoding: 'hex',
  }),
  limits: Object.freeze({
    frameBytes: 512 * KIB,
    requestTimeoutMs: 30_000,
    tokenHexChars: 64,
    digestHexChars: 64,
    idChars: 128,
    codeChars: 128,
    nameChars: 4096,
    modelChars: 4096,
    textChars: 4096,
    items: PROVIDER_SYNC.maxItems,
  }),
  code: Object.freeze({
    invalidFrame: 'invalid-frame',
    version: 'unsupported-version',
    action: 'unsupported-operation',
    payload: 'invalid-payload',
    limit: 'too-large',
    failed: 'target-failed',
    invalidResponse: 'invalid-response',
  }),
  state: Object.freeze({ inactive: 'inactive', ready: 'ready' }),
  errorMessage: 'Provider sync target refused the operation.',
})
const T = PROVIDER_SYNC_TARGET
const A = T.actions
const E = T.code
const ACTION_VALUES = Object.freeze(Object.values(A))

/** A typed protocol failure; its code is the only thing that crosses the wire. */
export class ProviderSyncTargetError extends Error {
  constructor(code) {
    super(T.errorMessage)
    this.name = 'ProviderSyncTargetError'
    this.code = code
  }
}
const refuse = (code) => { throw new ProviderSyncTargetError(code) }

/** Plain, data-only containers: accessors or extra keys cannot smuggle a value past a check. */
const plain = (value) => value !== null && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
const has = (value, key) => Object.hasOwn(value, key)
function exact(value, required, optional = NO_KEYS) {
  if (!plain(value)) refuse(E.payload)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) refuse(E.payload)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !has(descriptor, 'value')) refuse(E.payload)
  }
  for (const key of required) if (!has(value, key)) refuse(E.payload)
}
function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) refuse(E.payload)
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !has(descriptor, 'value')) refuse(E.payload)
  }
}
function text(value, max = T.limits.textChars) {
  if (typeof value !== 'string' || value.length === 0 || [...value].length > max) refuse(E.payload)
}
function natural(value) {
  if (!Number.isSafeInteger(value) || value < 0) refuse(E.payload)
}
function boolean(value) {
  if (typeof value !== 'boolean') refuse(E.payload)
}
function oneOf(value, values) {
  if (!values.includes(value)) refuse(E.payload)
}
function safeCode(value) {
  return typeof value === 'string' && value.length <= T.limits.codeChars && SAFE_CODE.test(value)
}
function hex(value, length) {
  if (typeof value !== 'string' || value.length !== length) refuse(E.payload)
  for (const character of value) if (!HEX.includes(character)) refuse(E.payload)
}
function identityOf(value) {
  exact(value, T.identity.keys)
  for (const key of T.identity.keys) if (typeof value[key] !== 'string' || !T.identity.identifier.test(value[key])) refuse(E.payload)
  return value
}

/* ---------------------------------------------------------------- result shapes */

/** One preview entry: metadata only, and no unknown field may add a value to it. */
function groupItem(value) {
  exact(value, ['id', 'name', 'models', 'keyMask'], ['api', 'endpoint', 'reason'])
  if (typeof value.id !== 'string' || !T.identity.identifier.test(value.id)) refuse(E.payload)
  text(value.name, T.limits.nameChars)
  if (value.keyMask !== PROVIDER_SYNC.mask) refuse(E.payload)
  list(value.models)
  for (const model of value.models) text(model, T.limits.modelChars)
  if (has(value, 'api')) text(value.api, T.limits.codeChars)
  if (has(value, 'endpoint')) text(value.endpoint, T.limits.textChars)
  if (has(value, 'reason') && !safeCode(value.reason)) refuse(E.payload)
}
function previewGroups(value) {
  exact(value, ['add', 'existsSkip', 'conflictSkip', 'unsupported'])
  for (const key of ['add', 'existsSkip', 'conflictSkip', 'unsupported']) {
    list(value[key])
    if (value[key].length > T.limits.items) refuse(E.limit)
    for (const item of value[key]) groupItem(item)
  }
}
function previewResult(value) {
  exact(value, ['token', 'source', 'target', 'sourceFingerprint', 'expiresAt', 'groups'])
  hex(value.token, T.limits.tokenHexChars)
  identityOf(value.source)
  identityOf(value.target)
  hex(value.sourceFingerprint, T.limits.digestHexChars)
  natural(value.expiresAt)
  previewGroups(value.groups)
}
function confirmItem(value) {
  // catalogAdvertised is the engine's best-effort post-write directory probe; it is a fact about
  // the target catalog, not a credential value, and must survive the frame so the page can show it.
  exact(value, ['id', 'config', 'key', 'status'], ['reason', 'catalogAdvertised'])
  if (typeof value.id !== 'string' || !T.identity.identifier.test(value.id)) refuse(E.payload)
  oneOf(value.config, CONFIG_OUTCOMES)
  oneOf(value.key, KEY_OUTCOMES)
  oneOf(value.status, SYNC_STATUSES)
  if (has(value, 'reason') && !safeCode(value.reason)) refuse(E.payload)
  if (has(value, 'catalogAdvertised')) boolean(value.catalogAdvertised)
}
function confirmResult(value) {
  exact(value, ['results', 'complete'])
  list(value.results)
  if (value.results.length > T.limits.items) refuse(E.limit)
  for (const item of value.results) confirmItem(item)
  boolean(value.complete)
}
const RESULT_SHAPES = Object.freeze({ [A.inventory]: previewResult, [A.import]: confirmResult })

/* ---------------------------------------------------------------- frame codec */

function outcomeShape(value) {
  if (!plain(value) || typeof value.ok !== 'boolean') refuse(E.payload)
  if (value.ok) { if (!has(value, 'result') || has(value, 'error')) refuse(E.payload) }
  else if (!has(value, 'error') || has(value, 'result')) refuse(E.payload)
}
function errorShape(value) {
  exact(value, ['code'])
  if (!safeCode(value.code)) refuse(E.payload)
  return { code: value.code }
}

/**
 * The frame codec both ends share. A request carries the source identity beside the source
 * inventory, because the target engine verifies that the inventory belongs to the peer that
 * sent it; the wire's mutual HMAC already authenticates the process, not the profile identity.
 */
export function createProviderSyncCodec() {
  return Object.freeze({
    request(action, peer, payload, id = randomUUID()) {
      if (!ACTION_VALUES.includes(action) || !plain(payload)) refuse(E.payload)
      identityOf(peer)
      text(id, T.limits.idChars)
      return { v: T.version, id, op: action, peer, payload }
    },
    encode(frame) {
      let encoded
      try { encoded = JSON.stringify(frame) } catch { refuse(E.payload) }
      if (Buffer.byteLength(encoded, 'utf8') > T.limits.frameBytes) refuse(E.limit)
      return encoded
    },
    decode(encoded) {
      if (typeof encoded !== 'string') refuse(E.invalidFrame)
      if (Buffer.byteLength(encoded, 'utf8') > T.limits.frameBytes) refuse(E.limit)
      let frame
      try { frame = JSON.parse(encoded) } catch { refuse(E.invalidFrame) }
      return frame
    },
    acceptRequest(frame) {
      exact(frame, ['v', 'id', 'op', 'peer', 'payload'])
      if (frame.v !== T.version) refuse(E.version)
      text(frame.id, T.limits.idChars)
      if (!ACTION_VALUES.includes(frame.op)) refuse(E.action)
      identityOf(frame.peer)
      if (!plain(frame.payload)) refuse(E.payload)
      return frame
    },
    reply(id, action, outcome) {
      text(id, T.limits.idChars)
      outcomeShape(outcome)
      if (outcome.ok) {
        if (!ACTION_VALUES.includes(action)) refuse(E.action)
        RESULT_SHAPES[action](outcome.result)
        return { v: T.version, id, ok: true, result: outcome.result }
      }
      return { v: T.version, id, ok: false, error: errorShape(outcome.error) }
    },
    acceptReply(frame, action) {
      exact(frame, ['v', 'id', 'ok'], ['result', 'error'])
      if (frame.v !== T.version || typeof frame.id !== 'string' || typeof frame.ok !== 'boolean') refuse(E.invalidResponse)
      outcomeShape(frame)
      if (frame.ok) {
        if (!ACTION_VALUES.includes(action)) refuse(E.invalidResponse)
        RESULT_SHAPES[action](frame.result)
        return { ok: true, result: frame.result }
      }
      return { ok: false, error: errorShape(frame.error) }
    },
  })
}

/* ---------------------------------------------------------------- identity */

/**
 * The target/source identity both ends exchange: a per-boot id, the canonical profile path hash,
 * and the running DSH version. The main service uses this helper too, so the source and target
 * cannot describe identity differently.
 */
export async function providerSyncIdentity(profile, runtimeId) {
  if (!profile || typeof profile.dir !== 'string' || profile.dir === '') throw new TypeError('fishball provider sync: a profile directory is required')
  if (typeof runtimeId !== 'string') throw new TypeError('fishball provider sync: a runtime id is required')
  const identity = {
    runtimeId,
    profileId: createHash(T.identity.hash).update(await realpath(profile.dir)).digest(T.identity.encoding),
    schemaVersion: T.identity.schemaVersion,
    version: getDshRuntimeVersion(),
  }
  identityOf(identity)
  return Object.freeze(identity)
}

/* ---------------------------------------------------------------- the target service */

/**
 * Wrap the shared engine as the child's target service. The engine owns every preview and
 * confirmation rule; this wrapper only keeps its typed refusal and hides an unexpected failure
 * behind `target-failed`, which the source treats as ambiguous (a write may have committed).
 */
export function createProviderSyncTarget({ engine } = {}) {
  if (typeof engine?.preview !== 'function' || typeof engine?.confirm !== 'function') {
    throw new TypeError('fishball provider sync: the engine must implement preview and confirm')
  }
  return Object.freeze({
    async handle(action, payload, peer, { signal } = {}) {
      try {
        if (action === A.inventory) return await engine.preview(payload.source, peer)
        if (action === A.import) return await engine.confirm(payload, peer, { signal })
        throw new ProviderSyncTargetError(E.action)
      } catch (error) {
        if (error instanceof ProviderSyncError || error instanceof ProviderSyncTargetError) throw error
        // Host adapters already use safe code names; keep the real refusal the source page needs.
        if (safeCode(error?.code)) throw new ProviderSyncTargetError(error.code)
        throw new ProviderSyncTargetError(E.failed)
      }
    },
    close() { if (typeof engine.close === 'function') engine.close() },
  })
}

/* ---------------------------------------------------------------- the wire end */

const TRANSPORT_METHODS = Object.freeze(['send', 'onMessage', 'onClose'])
const refusalOf = (error) => ({
  ok: false,
  error: {
    code: (error instanceof ProviderSyncTargetError || error instanceof ProviderSyncError) && safeCode(error.code)
      ? error.code : E.failed,
  },
})

/**
 * The child's end of the provider-sync channel. The transport view is `{send, onMessage,
 * onClose}` over the authenticated lifecycle wire; it has no `close`, because the admin and
 * session-bridge protocols share that wire and a sync problem must not drop them.
 */
export function createProviderSyncTargetEndpoint({ target } = {}) {
  if (typeof target?.handle !== 'function') throw new TypeError('fishball provider sync: the target must implement handle')
  const codec = createProviderSyncCodec()
  const controllers = new Set()
  let transport
  let disposers = []
  let closed = false

  function detach() {
    for (const dispose of disposers.splice(0)) { try { dispose() } catch { /* the wire is already gone */ } }
    transport = undefined
    // A confirmed import is cancelled only before an SDK write starts; afterwards the engine's
    // own signal check is the last chance, and the source reports the ambiguous item as unknown.
    for (const controller of controllers) controller.abort()
    controllers.clear()
  }

  function send(encoded) {
    const current = transport
    if (current === undefined) return
    try { current.send(encoded) } catch { detach() }
  }

  function reply(id, action, outcome) {
    const attempt = (candidate) => codec.encode(codec.reply(id, action, candidate))
    let encoded
    try { encoded = attempt(outcome) } catch (error) {
      const code = error instanceof ProviderSyncTargetError && error.code === E.limit ? E.limit : E.failed
      try { encoded = attempt(refusalOf(new ProviderSyncTargetError(code))) } catch { return }
    }
    send(encoded)
  }

  async function receive(encoded) {
    if (closed) return
    let frame
    try { frame = codec.decode(encoded) } catch { return }
    if (!plain(frame) || typeof frame.id !== 'string') return
    let request
    try { request = codec.acceptRequest(frame) } catch (error) {
      reply(frame.id, frame.op, refusalOf(error))
      return
    }
    const controller = new AbortController()
    controllers.add(controller)
    let outcome
    try {
      outcome = { ok: true, result: await target.handle(request.op, request.payload, request.peer, { signal: controller.signal }) }
    } catch (error) {
      outcome = refusalOf(error)
    } finally {
      controllers.delete(controller)
    }
    reply(request.id, request.op, outcome)
  }

  return Object.freeze({
    get attached() { return transport !== undefined },
    attach(next) {
      if (closed) throw new Error('fishball provider sync: the endpoint is closed')
      for (const method of TRANSPORT_METHODS) {
        if (typeof next?.[method] !== 'function') throw new TypeError('fishball provider sync: the transport must implement ' + method)
      }
      detach()
      transport = next
      disposers.push(next.onMessage((encoded) => { receive(encoded).catch(() => {}) }))
      disposers.push(next.onClose(detach))
    },
    detach,
    close() { closed = true; detach() },
    receive,
  })
}

/* ---------------------------------------------------------------- the child row */

/** Stable Cordis plugin name; the merge inserts this module under the same row id. */
export const name = 'fishball-native-provider-sync'
export const inject = Object.freeze(['nativeRuntime', 'settings', 'credentials', 'llm', 'configEditor', 'authorization', 'profileContext'])
const ROW = Object.freeze({ logger: 'fishball-native-provider-sync' })

/**
 * Mount the target in the child. The transport arrives with each authenticated main connection
 * and is replaced after a restart; a runtime without the channel (before the merge) leaves the
 * row inert rather than failing the child boot. The engine and host adapter are the same modules
 * the pairing sync uses, so the child applies exactly the reviewed preview/confirm rules.
 */
export async function apply(ctx) {
  if (typeof ctx.nativeRuntime?.onProviderSyncTransport !== 'function') {
    ctx.logger(ROW.logger).warn('the child runtime exposes no provider-sync transport; the target is unreachable')
    return
  }
  let identity
  try { identity = await providerSyncIdentity(ctx.profileContext, randomUUID()) } catch {
    ctx.logger(ROW.logger).warn('the provider-sync target identity is unavailable')
    return
  }
  // Imported lazily so the main process (which imports this module for its shapes) does not load
  // the pi-ai adapter boundary before it needs it.
  const { createProviderSyncHost } = await import('../../provider-sync-host.js')
  const host = createProviderSyncHost(ctx, { identity })
  const engine = new ProviderSyncEngine({ host })
  const target = createProviderSyncTarget({ engine })
  const endpoint = createProviderSyncTargetEndpoint({ target })
  const unsubscribe = ctx.nativeRuntime.onProviderSyncTransport((transport) => {
    try { endpoint.attach(transport) } catch { /* the next transport replaces it */ }
  })
  // Cordis treats an apply() return value as the fiber's disposer. The endpoint reaches the
  // main side through onProviderSyncTransport, never through the return value; a returned
  // object fails activation with "Invalid effect".
  return () => { unsubscribe(); endpoint.close(); engine.close() }
}
