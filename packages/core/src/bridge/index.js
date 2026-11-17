/**
 * `fishball-core`'s bridge façade (task F-FACADE; design §6.3, §6.4, §13.4, §13.6; requirements
 * R-EXT-05/13/14/20, R-FN-01, R-REM-04; extension points X8, X9 (the Fishball branch), X12, X19).
 *
 * The one path from Fishball's DSH to its target connector's tools, over core's link and only its
 * public API (`status()`, `tools()`, `onTools`, `callTool`; the link is F-PAIR's to edit in W3):
 * - `mount(tools)`: every listed tool, core and contributed, offered to the model unfiltered
 *   (R-EXT-14) under a local DSH tool name, never a raw `mcp__…` one (names.js), re-offered after
 *   every `tools/list` the link makes (`list_changed`, reconnect; design §13.4);
 * - `bridge(pluginId, operations)`: X12, a scoped client for feature plugins;
 * - `attention.signal(pluginId, {important})`: X8 over embed-UI's contributed tool (Q-14);
 * - `contributedCount()` / `onChange`: the number of contributed tools on offer, for F-STATUS;
 * - `present(event)`: the model-facing content of an event on the Fishball branch, the port
 *   F-INTERCEPT's delivery list calls (Q-11).
 *
 * Every call goes through `call()`, in this order, and nothing leaves the process on a refusal:
 * 1. the link is not connected → `disconnected` (`LINK.disconnected`; the offer waits at the
 *    connector, R-REM-04);
 * 2. the tool is not listed now → `unsupported-operation` (D3, R-FN-01);
 * 3. a manager→session send (`FACADE.sendTools`) is judged by the X19 send gate;
 * 4. for the model, a tool that brings images in is refused `images-unsupported` when Fishball's
 *    model declares no image input (the V2 Q2 rule);
 * 5. `link.callTool`.
 * A failure in steps 1–4 sent nothing (`operation-failed`, "not sent"); a failure of step 5 may
 * have reached the connector, and the model is told to check before repeating it.
 * For the model, an image tool's successful result is shown as an image (image.js, R-FIX F13): the
 * call prepares the content, and the tool's `projectContent` (DSH ToolRuntime, both SDKs) hands it
 * to the model in place of the JSON text, which never carries the image's base64.
 * Mounting, the wiring of the gate and of the model lookup are F-WIRE's (it mounts nothing here).
 *
 * MULTI-1 (PLAN-MULTI §4.3, §4.4): one façade per target epoch, over that target's link only, so a
 * call (one in flight included) can only ever reach the link it was offered for. The target's
 * collection passes `naming`:
 * - `finalName(facade, rawName)`: the target-qualified model name (`targets/names.js` `toolNameOf`);
 * - `admit(offered)`: whether the name may be registered (its binding is free or this tuple's own;
 *   a name bound, or once bound, to another tuple is refused and logged, never overwritten);
 * - `label()`: `{name, targetId}`: the target's resolved name, shown in each description as
 *   JSON-quoted untrusted data, and its trusted local id, which tells two equal names apart.
 * `locals` are target-bound local helpers offered with the remote tools under the same naming
 * (the target's `ask_user`, origin `local`): `{facade, build(modelName) → definition}`.
 * `rename()` re-derives every name after the target's name changed: the old set is withdrawn and the
 * new one registered in the same synchronous turn; if any of the new registrations fails, every one
 * of that generation is disposed again, so the target's tools are unavailable rather than half
 * renamed (other targets are untouched). `close()` (removal, URL edit) withdraws everything, and a
 * call reaching a closed façade sends nothing.
 */
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { LINK } from '../../contracts/constants.js'
import { isEventType } from '../link/schema.js'
import { CODE, FACADE, LOG, MISUSE, TEXT, TOOL_OUTPUT } from './constants.js'
import { imageContent } from './image.js'
import { offerOf } from './names.js'

export { FACADE, MODEL_NAME, TEXT as FACADE_TEXT } from './constants.js'
export { modelNameOf, offerOf } from './names.js'

const ALLOW = Object.freeze({ ok: true })

/** X19 while no supervision feeds it: effective off, every send passes (U7, §2.5). */
const OPEN_GATE = Object.freeze({ send: () => ALLOW })

const refusal = (code, extra) => Object.freeze({ ...extra, ok: false, code })

const isPortLink = (link) => FACADE.linkMembers.every((member) => typeof link?.[member] === 'function')

const textBlock = (text) => [{ type: TOOL_OUTPUT.blockType, text }]

/** One JSON text block of a result, as session-tools.js renders its own. */
const render = (_args, value) => textBlock(JSON.stringify(value, null, TOOL_OUTPUT.jsonIndent))

/** An image tool's text rendering: its result without the image's chunks (image.js shows the image). */
const renderWithoutChunks = (args, value) => render(args, value?.ok === true ? { ...value, [FACADE.imageChunksField]: undefined } : value)

/** What a failure contributes to the log: its code or name, never its message (R-SEC-02). */
const codeOf = (error) => String(error?.code ?? error?.name ?? typeof error)

/** A connector-supplied name as the log shows it: JSON-quoted and bounded (LOG.nameChars). */
const logName = (name) => JSON.stringify(String(name).slice(0, LOG.nameChars))

function assertPluginId(pluginId) {
  if (typeof pluginId !== 'string' || pluginId.trim() === '') throw new TypeError(MISUSE.pluginId)
}

/**
 * The X19 verdict as the façade answers it. The gate's documented refusal is `{code, reason}`
 * (instance-extension-points X19); it becomes a K1-shaped refusal, and anything that is not
 * `{ok: true}` and names no code refuses `operation-failed`, so no gate answer reaches the model raw.
 */
function gateRefusal(verdict) {
  if (verdict?.ok === true) return undefined
  const code = typeof verdict?.code === 'string' ? verdict.code : CODE.failed
  return refusal(code, typeof verdict?.reason === 'string' ? { reason: verdict.reason } : undefined)
}

/** The turn stopped waiting for a step-5 send (the send itself is not cancelled; see raced()). */
class Cancelled extends Error {}

/**
 * `promise`, or a rejection with Cancelled once `signal` aborts. Only the turn stops waiting: the
 * link's request keeps running, and the answer is the post-send one, because the request may still
 * reach the connector. The user's decision (2026-11-15): stopping Fishball's turn never cancels work
 * already sent, so the turn's signal is not passed to `link.callTool`, although F-PAIR's link
 * accepts `{signal}` (dev/v3-f-pair `a5ec0bfd`).
 */
function raced(promise, signal) {
  if (signal === undefined) return promise
  if (signal.aborted) return Promise.reject(new Cancelled())
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Cancelled())
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

/**
 * @param {object} options
 * @param {object} options.link core's link (link.js `McpLink`), public API only
 * @param {object} [options.ctx] a Cordis context with DSH's `tools` service: the offer is mounted
 *   into `ctx.tools` at once (the same as `mount(ctx.tools)`) and withdrawn by `close()`. Which
 *   context (the manager's agent scope) is the wiring's choice (F-WIRE)
 * @param {{send(operation: string, sessionId: unknown): {ok: true} | {code: string, reason?: string}}} [options.gate]
 *   the X19 send gate, asked with the V2 send operation (`session.message`, `session.redirect`) and
 *   the target session id; default: off (all pass)
 * @param {(exec: object) => boolean | Promise<boolean>} [options.imagesSupported] a function, asked
 *   at each model call with DSH's tool execution, whether the calling agent's current model takes
 *   image input (the model can change between turns, so it is never a fixed value); default: an
 *   unknown model takes them (as images.js judges it)
 * @param {() => ({saveImages: Function} | undefined)} [options.attachments] DSH's attachment store,
 *   looked up per call (it may load later); without one an image is shown as unavailable
 * @param {{info: Function, warn: Function}} [options.logger] the background log
 */
/** A façade of one link with no namespace (a single-link caller): the façade names, all admitted, no label. */
const BARE_NAMING = Object.freeze({ finalName: undefined, localName: (facade) => Object.freeze({ name: facade, valid: true }), admit: () => true, label: () => undefined })

/** A description with the target header first (see the header), or as it is without a label. */
const describe = (label, description) => (label === undefined ? description : TEXT.targetHeader(JSON.stringify(label.name), label.targetId) + description)

/**
 * The Fishball branch's content for one event (Q-11): a header naming its type and, since
 * MULTI-1, the target it came from (its name JSON-quoted as data, its trusted local id), then the
 * whole event inside an untrusted block whose fence has a random marker, so no payload text can
 * close the block or imitate core's own framing (as the connector's framing.js). Only a K1 event
 * type (`isEventType`) is named in the header; any other value stays inside the block. One text block.
 */
export function presentEvent(event) {
  const marker = randomUUID()
  const type = isEventType(event?.type) ? event.type : TEXT.unknownType
  const source = event?.source
  const header = source === undefined ? [TEXT.eventHeader(type)] : [TEXT.eventHeader(type), TEXT.eventSource(JSON.stringify(source.name), source.targetId)]
  return textBlock([...header, TEXT.untrustedOpen(marker), TEXT.eventFields + JSON.stringify(event), TEXT.untrustedClose(marker)].join(TEXT.lineEnd))
}

export function createBridge({ link, ctx, gate = OPEN_GATE, imagesSupported = async () => true, attachments = () => undefined, logger, naming = BARE_NAMING, locals = [] }) {
  if (!isPortLink(link)) throw new TypeError(MISUSE.link)
  // Checked here so a wrong port fails at wiring time, not as a refused call at the model's turn.
  if (typeof gate?.send !== 'function') throw new TypeError(MISUSE.gate)
  if (typeof imagesSupported !== 'function') throw new TypeError(MISUSE.imagesSupported)
  const mounts = new Set()
  const listeners = new Set()
  // Connector names already logged as not offered: each is logged once, not on every re-list.
  // Per façade, which is per process in production (F-WIRE makes one); a test's own façade
  // starts with none.
  const reported = new Set()
  let offer
  let closed = false

  const listed = (name) => link.tools().some((tool) => tool.name === name)

  /** Steps 1–4 of the header: a refusal, or `undefined` when the call may be sent. Sends nothing. */
  async function check(name, args, exec) {
    if (closed) return refusal(CODE.unknownTarget)
    if (link.status()?.state !== LINK.state.connected) return refusal(CODE.disconnected)
    if (!listed(name)) return refusal(CODE.unsupported)
    if (Object.hasOwn(FACADE.sendOperations, name)) {
      const refused = gateRefusal(gate.send(FACADE.sendOperations[name], args?.[FACADE.sessionArgument]))
      if (refused !== undefined) return refused
    }
    if (exec !== undefined && FACADE.imageTools.includes(name) && !(await imagesSupported(exec))) return refusal(CODE.imagesUnsupported)
    return undefined
  }

  /**
   * One call of a connector tool. It never rejects: it resolves to the tool's `structuredContent`
   * or to a refusal. A failure before sending is `operation-failed` with `TEXT.notSent`; one after
   * sending is `operation-failed` with `TEXT.maybeSent` (link.js `callTool`: whether it reached
   * the connector is then unknown, so the caller must check before repeating it).
   * @param {object} [exec] the DSH tool execution, present only for the model's own calls
   */
  async function call(name, args, exec) {
    let refused
    try { refused = await check(name, args, exec) } catch (error) {
      logger?.warn(LOG.checkFailed, logName(name), codeOf(error))
      return refusal(CODE.failed, { message: TEXT.notSent })
    }
    if (refused !== undefined) return refused
    try {
      return (await raced(link.callTool(name, args), exec?.signal)) ?? TOOL_OUTPUT.absent
    } catch (error) {
      logger?.warn(LOG.callFailed, logName(name), codeOf(error))
      return refusal(CODE.failed, { message: TEXT.maybeSent })
    }
  }

  /** The DSH tool definition of one offered tool (dsh-mcp-client's raw form, both SDKs). */
  function definitionOf({ name, modelName, tool, local }) {
    const label = naming.label()
    if (local !== undefined) {
      const built = local.build(modelName)
      return { ...built, description: describe(label, built.description) }
    }
    const definition = {
      name: modelName,
      description: describe(label, tool.description ?? TEXT.noDescription),
      parameters: tool.inputSchema,
      output: { schema: TOOL_OUTPUT.schema, render },
      execute: (args, exec) => call(name, args, exec),
    }
    return FACADE.imageTools.includes(name) ? withImageProjection(definition) : definition
  }

  /**
   * An image tool: its successful result's model content is prepared during the call, keyed by
   * the execution, and handed over by `projectContent` only for that very value (as dsh-mcp-client
   * does), so a result a later policy replaced keeps its own rendering.
   */
  function withImageProjection(definition) {
    const projections = new WeakMap()
    return {
      ...definition,
      output: { ...definition.output, render: renderWithoutChunks },
      async execute(args, exec) {
        const value = await definition.execute(args, exec)
        if (exec !== undefined && value?.ok === true) projections.set(exec, { value, content: await imageContent(value, attachments()) })
        return value
      },
      projectContent(exec, result) {
        const projection = projections.get(exec)
        projections.delete(exec)
        return projection === undefined || result.isError || !isDeepStrictEqual(result.value, projection.value) ? undefined : projection.content
      },
    }
  }

  /** Withdraw one mount's tools; a disposer that throws (a scope already gone) stops no other. */
  function withdraw(mount) {
    for (const dispose of mount.disposers.splice(0)) {
      try { dispose() } catch (error) { logger?.warn(LOG.withdrawFailed, codeOf(error)) }
    }
  }

  /**
   * Register the current offer into one mount, replacing what it had. Tools are registered one by
   * one, and one that DSH refuses is logged and skipped: unlike dsh-mcp-client, which rolls a
   * failed generation back to zero tools, the façade is Fishball's only path to the connector, so
   * one bad contributed tool must not take the core tools away with it.
   */
  function sync(mount, atomic = false) {
    withdraw(mount)
    for (const entry of offer.offered) {
      try { mount.disposers.push(mount.tools.register(definitionOf(entry))) }
      catch (error) {
        logger?.warn(LOG.registerFailed, logName(entry.modelName), codeOf(error))
        // A rename registers all of its new names or none (see the header): no mixed set.
        if (atomic) { withdraw(mount); return }
      }
    }
  }

  /** The offer for `tools`: the namespaced names, minus any whose binding is another tuple's. */
  function offerFor(tools) {
    const computed = offerOf(tools, naming.finalName)
    const localEntries = locals.map((local) => {
      const final = naming.localName(local.facade)
      return Object.freeze({ name: local.facade, facade: local.facade, modelName: final.name, tuple: final.tuple, valid: final.valid, local, contributed: false })
    })
    const taken = new Set(computed.offered.map((entry) => entry.modelName))
    const usable = localEntries.filter((entry) => entry.valid && !taken.has(entry.modelName))
    const admitted = [...computed.offered, ...usable].filter((entry) => naming.admit(entry))
    const bound = [...computed.offered, ...usable].filter((entry) => !admitted.includes(entry)).map((entry) => Object.freeze({ name: entry.name, modelName: entry.modelName, reason: LOG.reason.bound }))
    return Object.freeze({ offered: Object.freeze(admitted), refused: Object.freeze([...computed.refused, ...bound]) })
  }

  /** A new offer, logged, synced into every mount, then announced. */
  function refresh(tools, atomic = false) {
    offer = offerFor(tools)
    for (const { name, modelName, reason } of offer.refused) {
      const seen = JSON.stringify([name, modelName])
      if (reported.has(seen)) continue
      reported.add(seen)
      logger?.warn(LOG.notOffered, logName(name), logName(modelName), reason)
    }
    for (const mount of mounts) sync(mount, atomic)
    for (const fn of [...listeners]) { try { fn() } catch { /* a listener owns its failure */ } }
  }
  refresh(link.tools())
  const offTools = link.onTools((tools) => { if (!closed) refresh(tools) })

  /**
   * X12: a client limited to `operations` (K1 or contributed tool names). A name outside the list
   * answers `forbidden` and sends nothing (X12, U9). The link's own tools (`FACADE.withheld`) are
   * never in scope, whatever the list says: a plugin's `inbox_ack` would bypass core's ledger
   * exactly as a model's would (R-INT-08).
   */
  function bridge(pluginId, operations) {
    assertPluginId(pluginId)
    if (!Array.isArray(operations) || !operations.every((operation) => typeof operation === 'string')) throw new TypeError(MISUSE.operations)
    // A copy: changing the caller's list later never widens the handle.
    const allowed = new Set(operations.filter((operation) => !FACADE.withheld.includes(operation)))
    return Object.freeze({
      /** Whether `name` is in scope and listed now (whether the link is up is `call`'s answer). */
      supports: (name) => allowed.has(name) && listed(name),
      call: (name, args = {}) => (allowed.has(name) ? call(name, args) : Promise.resolve(refusal(CODE.forbidden))),
    })
  }

  const isAttentionInput = (input) => typeof input?.important === 'boolean'
    && Object.keys(input).length === FACADE.attentionKeys.length && FACADE.attentionKeys.every((key) => Object.hasOwn(input, key))

  const attention = Object.freeze({
    /**
     * X8 (Q-14): `{ok: true, accepted: true}` only when embed-UI accepted it; otherwise a refusal,
     * `unsupported-operation` when the target lists no attention tool. Stateless and never retried
     * or replayed. A missing plugin id is a programming error and throws; an input other than
     * exactly `{important: boolean}` is refused `invalid-arguments` without a send (§3.1: an
     * invalid payload is a refusal, never a thrown or fabricated acceptance).
     */
    async signal(pluginId, input) {
      assertPluginId(pluginId)
      if (!isAttentionInput(input)) return refusal(CODE.invalidArguments)
      return call(FACADE.attentionTool, { important: input.important })
    },
  })

  /** Offer the tools into one DSH `tools` service (an agent scope); returns its disposer. */
  function mount(tools) {
    if (closed) return () => {}
    const entry = { tools, disposers: [] }
    mounts.add(entry)
    sync(entry)
    return () => { if (mounts.delete(entry)) withdraw(entry) }
  }
  if (ctx !== undefined) mount(ctx.tools)

  return Object.freeze({
    mount,
    bridge,
    attention,
    present: presentEvent,
    /** How many contributed tools are on offer to the model now (R-EXT-14's status note). */
    contributedCount: () => offer.offered.filter((entry) => entry.contributed).length,
    /** Calls `fn()` after each refresh of the offer. Returns its disposer. */
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    /** The target's name changed: every model name is derived again, atomically (see the header). */
    rename() { if (!closed) refresh(link.tools(), true) },
    /** The model names on offer now (for the persona's and the guards' reads). */
    offered: () => offer.offered.map((entry) => entry.modelName),
    /** Withdraw every offered tool and stop following the link. */
    close() {
      closed = true
      try { offTools() } catch (error) { logger?.warn(LOG.withdrawFailed, codeOf(error)) }
      for (const mount of mounts) withdraw(mount)
      mounts.clear()
      listeners.clear()
    },
  })
}
