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
 * 1. the link is not connected → `disconnected` (K1 `LINK_REFUSAL`; the offer waits at the
 *    connector, R-REM-04);
 * 2. the tool is not listed now → `unsupported-operation` (D3, R-FN-01);
 * 3. a manager→session send (`FACADE.sendTools`) is judged by the X19 send gate;
 * 4. for the model, a tool that brings images in is refused `images-unsupported` when Fishball's
 *    model declares no image input (the V2 Q2 rule);
 * 5. `link.callTool`.
 * A failure in steps 1–4 sent nothing (`operation-failed`, "not sent"); a failure of step 5 may
 * have reached the connector, and the model is told to check before repeating it.
 * Mounting, the wiring of the gate and of the model lookup are F-WIRE's (it mounts nothing here).
 */
import { randomUUID } from 'node:crypto'
import { TARGET_STATE, isEventType } from '../link/schema.js'
import { CODE, FACADE, LOG, MISUSE, TEXT, TOOL_OUTPUT } from './constants.js'
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
 * @param {{info: Function, warn: Function}} [options.logger] the background log
 */
export function createBridge({ link, ctx, gate = OPEN_GATE, imagesSupported = async () => true, logger }) {
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
    if (link.status()?.state !== TARGET_STATE.connected) return refusal(CODE.disconnected)
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
  function definitionOf({ name, modelName, tool }) {
    return {
      name: modelName,
      description: tool.description ?? TEXT.noDescription,
      parameters: tool.inputSchema,
      output: { schema: TOOL_OUTPUT.schema, render },
      execute: (args, exec) => call(name, args, exec),
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
  function sync(mount) {
    withdraw(mount)
    for (const entry of offer.offered) {
      try { mount.disposers.push(mount.tools.register(definitionOf(entry))) }
      catch (error) { logger?.warn(LOG.registerFailed, logName(entry.modelName), codeOf(error)) }
    }
  }

  /** A new list from the link: a new offer, logged, synced into every mount, then announced. */
  function refresh(tools) {
    offer = offerOf(tools)
    for (const { name, modelName, reason } of offer.refused) {
      if (reported.has(name)) continue
      reported.add(name)
      logger?.warn(LOG.notOffered, logName(name), logName(modelName), reason)
    }
    for (const mount of mounts) sync(mount)
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

  /**
   * The Fishball branch's content for one event (Q-11): a header naming its type, then the whole
   * event inside an untrusted block whose fence has a random marker, so no payload text can close
   * the block or imitate core's own framing (as the connector's framing.js). Only a K1 event type
   * (`isEventType`) is named in the header; any other value stays inside the block. One text block.
   */
  function present(event) {
    const marker = randomUUID()
    const type = isEventType(event?.type) ? event.type : TEXT.unknownType
    return textBlock([TEXT.eventHeader(type), TEXT.untrustedOpen(marker), TEXT.eventFields + JSON.stringify(event), TEXT.untrustedClose(marker)].join(TEXT.lineEnd))
  }

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
    present,
    /** How many contributed tools are on offer to the model now (R-EXT-14's status note). */
    contributedCount: () => offer.offered.filter((entry) => entry.contributed).length,
    /** Calls `fn()` after each refresh of the offer. Returns its disposer. */
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
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
