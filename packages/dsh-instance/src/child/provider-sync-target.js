/**
 * The isolated child's provider-sync target (§10, §15 T16). I-HOST moved it here from
 * fishball-core's former V2 child folder (requirements 1.41 Q-G7: model sync lives entirely in the
 * instance; design §1.0b row 5). It copies providers and their model lists into the child's own
 * DSH settings and nothing else: which model Fishball uses is chosen in Fishball's settings (the
 * user, 2026-11-16: "同步只是同步model list，至于fishball用什么还要在fishball内设置").
 *
 * The source is the main DSH; the target is this child's own home. The preview and confirmation
 * rules stay in dsh-connector-shared/provider-sync: this module only reaches that engine over the lifecycle
 * wire and supplies the child's own services. Nothing here reads a credential value; the engine's
 * inventory actions describe presence only, and a record arrives solely in a confirmed `import`
 * frame after the main side read it for that confirmation.
 *
 * Transport: the main host starts and owns this child, so the two already trust each other. The target rides
 * the already-authenticated lifecycle wire on its own payload channel, as the hosted token's
 * `mcp-credential` channel does. The frame shapes are dsh-connector-shared/provider-sync-codec's; this module owns the
 * endpoint and its mount; the wiring is:
 *   1. src/native-runtime/wire.js carries PROVIDER_SYNC_TARGET.channel;
 *   2. src/native-runtime/child.js publishes the child end through onProviderSyncTransport;
 *   3. src/native-runtime/index.js publishes the main end the same way;
 *   4. the child-side row (child-row.js, inserted by the launch overlay) calls mountProviderSyncTarget;
 *   5. src/native-runtime/placement.js places dsh-connector-shared in the child profile's
 *      node_modules, where this module, copied in the lifecycle snapshot, resolves it.
 *
 * No value ever appears in a preview, a refusal or a result: group entries are exact-key checked
 * against metadata only, and the record validator lives in dsh-connector-shared/provider-sync.
 */
import { randomUUID } from 'node:crypto'
import { HOSTED } from '../native-runtime/constants.js'
import { ProviderSyncEngine, ProviderSyncError } from 'dsh-connector-shared/provider-sync'
import {
  PROVIDER_SYNC_TARGET, ProviderSyncTargetError, createProviderSyncCodec, plain, providerSyncIdentity, safeCode,
} from 'dsh-connector-shared/provider-sync-codec'

// The frame codec and the identity are dsh-connector-shared's, used by both ends; re-exported for this
// module's existing readers.
export { PROVIDER_SYNC_TARGET, ProviderSyncTargetError, createProviderSyncCodec, providerSyncIdentity }
const T = PROVIDER_SYNC_TARGET
const A = T.actions
const E = T.code

/* ---------------------------------------------------------------- the target service */

/**
 * Wrap the shared engine as the child's target service. The engine owns every preview and
 * confirmation rule; this wrapper only keeps its typed refusal and hides an unexpected failure
 * behind `target-failed`, which the source treats as ambiguous (a write may have committed).
 */
export function createProviderSyncTarget({ engine } = {}) {
  if (typeof engine?.preview !== 'function' || typeof engine?.confirm !== 'function') {
    throw new TypeError('dsh-instance provider sync: the engine must implement preview and confirm')
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
 * onClose}` over the authenticated lifecycle wire; it has no `close`, because the lifecycle and
 * the credential channel share that wire and a sync problem must not drop them.
 */
export function createProviderSyncTargetEndpoint({ target } = {}) {
  if (typeof target?.handle !== 'function') throw new TypeError('dsh-instance provider sync: the target must implement handle')
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
      if (closed) throw new Error('dsh-instance provider sync: the endpoint is closed')
      for (const method of TRANSPORT_METHODS) {
        if (typeof next?.[method] !== 'function') throw new TypeError('dsh-instance provider sync: the transport must implement ' + method)
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

/* ---------------------------------------------------------------- the child-side row's mount */

const MOUNT = Object.freeze({ logger: HOSTED.childRow, identityUnavailable: 'the provider-sync target identity is unavailable' })

/**
 * Mount the target on the child's lifecycle runtime (child-row.js). The transport arrives with each
 * authenticated main connection and is replaced after a restart. The engine and host adapter are
 * the shared modules (dsh-connector-shared/provider-sync, …/provider-sync-host), so the child
 * applies exactly the reviewed preview/confirm rules.
 * @param ctx - the child-side row's context (`nativeRuntime`, `settings`, `credentials`, `llm`,
 *   `configEditor`, `authorization`, `profileContext`)
 * @returns {Promise<(() => void) | undefined>} its disposer; undefined when the identity is unavailable
 */
export async function mountProviderSyncTarget(ctx) {
  let identity
  try { identity = await providerSyncIdentity(ctx.profileContext, randomUUID()) } catch {
    ctx.logger(MOUNT.logger).warn(MOUNT.identityUnavailable)
    return undefined
  }
  // Imported lazily: the pi-ai adapter boundary loads only once the identity is known.
  const { createProviderSyncHost } = await import('dsh-connector-shared/provider-sync-host')
  const host = createProviderSyncHost(ctx, { identity })
  const engine = new ProviderSyncEngine({ host })
  const endpoint = createProviderSyncTargetEndpoint({ target: createProviderSyncTarget({ engine }) })
  const unsubscribe = ctx.nativeRuntime.onProviderSyncTransport((transport) => {
    try { endpoint.attach(transport) } catch { /* the next transport replaces it */ }
  })
  return () => { unsubscribe(); endpoint.close(); engine.close() }
}
