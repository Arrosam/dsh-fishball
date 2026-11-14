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
 * Mounting, the wiring of the gate and of the model lookup are F-WIRE's (it mounts nothing here).
 */
import { randomUUID } from 'node:crypto'
import { TARGET_STATE } from '../link/schema.js'
import { CODE, FACADE, LOG, MISUSE, TEXT, TOOL_OUTPUT } from './constants.js'
import { offerOf } from './names.js'

export { FACADE, MODEL_NAME, TEXT as FACADE_TEXT } from './constants.js'
export { modelNameOf, offerOf } from './names.js'

const ALLOW = Object.freeze({ ok: true })

/** X19 while no supervision feeds it: effective off, every send passes (U7, §2.5). */
const OPEN_GATE = Object.freeze({ send: () => ALLOW })

const refusal = (code, extra) => Object.freeze({ ...extra, ok: false, code })

const isPortLink = (link) => FACADE.linkMembers.every((member) => typeof link?.[member] === 'function')

/** One JSON text block of a result, as session-tools.js renders its own. */
const render = (_args, value) => [{ type: TOOL_OUTPUT.blockType, text: JSON.stringify(value, null, TOOL_OUTPUT.jsonIndent) }]

/**
 * @param {object} options
 * @param {object} options.link core's link (link.js `McpLink`), public API only
 * @param {{send(tool: string, sessionId: unknown): {ok: true} | {ok: false, code: string}}} [options.gate]
 *   the X19 send gate, given the K1 tool name and the target session id; default: off (all pass)
 * @param {(exec: object) => Promise<boolean>} [options.imagesSupported] whether the calling agent's
 *   model takes image input; default: an unknown model takes them (as images.js judges it)
 * @param {{info: Function, warn: Function}} [options.logger] the background log
 */
export function createBridge({ link, gate = OPEN_GATE, imagesSupported = async () => true, logger }) {
  if (!isPortLink(link)) throw new TypeError(MISUSE.link)
  const mounts = new Set()
  const listeners = new Set()
  let offer
  let closed = false

  const listed = (name) => link.tools().some((tool) => tool.name === name)

  /**
   * One call of a connector tool (the order is the header's). Resolves to the tool's
   * `structuredContent`, or to a refusal; rejects only when the call failed after it was sent,
   * since whether it reached the connector is then unknown (link.js `callTool`) and the caller
   * decides (K3 `commit` treats a rejected send as `disconnected`).
   * @param {object} [exec] the DSH tool execution, present only for the model's own calls
   */
  async function call(name, args, exec) {
    if (link.status()?.state !== TARGET_STATE.connected) return refusal(CODE.disconnected)
    if (!listed(name)) return refusal(CODE.unsupported)
    if (FACADE.sendTools.includes(name)) {
      const verdict = gate.send(name, args?.[FACADE.sessionArgument])
      if (verdict?.ok !== true) return verdict
    }
    if (exec !== undefined && FACADE.imageTools.includes(name) && !(await imagesSupported(exec))) return refusal(CODE.imagesUnsupported)
    return (await link.callTool(name, args)) ?? TOOL_OUTPUT.absent
  }

  /** The DSH tool definition of one offered tool (dsh-mcp-client's raw form, both SDKs). */
  function definitionOf({ name, modelName, tool }) {
    return {
      name: modelName,
      description: tool.description ?? TEXT.noDescription,
      parameters: tool.inputSchema,
      output: { schema: TOOL_OUTPUT.schema, render },
      async execute(args, exec) {
        try {
          return await call(name, args, exec)
        } catch (error) {
          logger?.warn(LOG.callFailed, name, String(error?.code ?? error?.name ?? typeof error))
          return refusal(CODE.failed, { message: TEXT.maybeSent })
        }
      },
    }
  }

  /** Register the current offer into one mount, replacing what it had. */
  function sync(mount) {
    for (const dispose of mount.disposers.splice(0)) dispose()
    for (const entry of offer.offered) {
      try { mount.disposers.push(mount.tools.register(definitionOf(entry))) }
      catch (error) { logger?.warn(LOG.registerFailed, entry.modelName, String(error?.name ?? typeof error)) }
    }
  }

  /** A new list from the link: a new offer, logged, synced into every mount, then announced. */
  function refresh(tools) {
    offer = offerOf(tools)
    for (const { name, modelName, reason } of offer.refused) logger?.warn(LOG.notOffered, name, modelName, reason)
    for (const mount of mounts) sync(mount)
    for (const fn of [...listeners]) { try { fn() } catch { /* a listener owns its failure */ } }
  }
  refresh(link.tools())
  const offTools = link.onTools((tools) => { if (!closed) refresh(tools) })

  /** X12: a client limited to `operations` (K1 or contributed tool names); others are `forbidden`. */
  function bridge(pluginId, operations) {
    if (typeof pluginId !== 'string' || pluginId.trim() === '') throw new TypeError(MISUSE.pluginId)
    if (!Array.isArray(operations) || !operations.every((operation) => typeof operation === 'string')) throw new TypeError(MISUSE.operations)
    // A copy: changing the caller's list later never widens the handle.
    const allowed = new Set(operations)
    return Object.freeze({
      /** Whether `name` is in scope and listed now. */
      supports: (name) => allowed.has(name) && listed(name),
      call: (name, args = {}) => (allowed.has(name) ? call(name, args) : Promise.resolve(refusal(CODE.forbidden))),
    })
  }

  const attention = Object.freeze({
    /**
     * X8 (Q-14): `{ok: true, accepted: true}` only when embed-UI accepted it; otherwise a refusal,
     * `unsupported-operation` when the target lists no attention tool. Stateless and never retried
     * or replayed; it never rejects, a failure after sending included (`operation-failed`).
     */
    async signal(pluginId, input) {
      if (typeof pluginId !== 'string' || pluginId.trim() === '') throw new TypeError(MISUSE.pluginId)
      if (typeof input?.important !== 'boolean' || Object.keys(input).length !== 1) throw new TypeError(MISUSE.important)
      try { return await call(FACADE.attentionTool, { important: input.important }) }
      catch { return refusal(CODE.failed) }
    },
  })

  /**
   * The Fishball branch's content for one event (Q-11): a header naming its type, then the whole
   * event inside an untrusted block whose fence has a random marker, so no payload text can close
   * the block or imitate core's own framing (as the connector's framing.js). One text block.
   */
  function present(event) {
    const marker = randomUUID()
    const text = [TEXT.eventHeader(event.type), TEXT.untrustedOpen(marker), TEXT.eventFields + JSON.stringify(event), TEXT.untrustedClose(marker)].join(TEXT.lineEnd)
    return [{ type: TOOL_OUTPUT.blockType, text }]
  }

  return Object.freeze({
    /** Offer the tools into one DSH `tools` service (an agent scope); returns its disposer. */
    mount(tools) {
      const mount = { tools, disposers: [] }
      if (closed) return () => {}
      mounts.add(mount)
      sync(mount)
      return () => {
        if (!mounts.delete(mount)) return
        for (const dispose of mount.disposers.splice(0)) dispose()
      }
    },
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
      offTools()
      for (const mount of mounts) for (const dispose of mount.disposers.splice(0)) dispose()
      mounts.clear()
      listeners.clear()
    },
  })
}
