/**
 * `tools/list` and `tools/call` on one caller's McpServer (task C-TOOLS; design §3.2, §13.5;
 * R-CON-02, R-WATCH-03, R-EXT-12, R-OA-04).
 *
 * **Why this module answers both methods itself** rather than through `McpServer.registerTool`:
 * the SDK (2.2.0, both hosts) turns a failed input check into a prose-only `isError` result, and
 * it stamps `type: "object"` beside the root `oneOf` of every advertised output schema. The first
 * breaks R-CON-02 ("never just prose": an undeclared argument must be `invalid-arguments` in
 * `structuredContent`); the second changes K1's frozen output schemas into one DSH's subset
 * refuses ("cannot declare both type and oneOf"). So `tools/list` returns K1's TOOLS as frozen,
 * and `tools/call` runs the steps below. The SDK still validates the request and result wire
 * shapes around both handlers. The SDK's `projectCallToolResult` is not called: under C-HTTP's
 * `legacy: 'reject'` (2026-07-28 only) it is the identity for an object `structuredContent`, which
 * every K1 envelope is. A legacy-era mode would have to call it again.
 *
 * `tools/list`: K1's core tools in TOOLS order, then the contributed tools (`contributions.list()`,
 * C-EXT; core tools first, R-EXT-12). A pair-only caller gets `pair` only (PAIR_ONLY, R-OA-04).
 *
 * `tools/call`, one refusal at the first failing step, each a K1 envelope:
 * 1. a name the caller's list does not hold (a removed watch tool, a quarantined contributed
 *    tool, any tool but `pair` for a pair-only caller) → JSON-RPC -32602, a protocol fault;
 * 2. a contributed name → C-EXT's own pipeline (`contributions.call`), unchanged; a throw from it
 *    (C-EXT is built never to) is `operation-failed`, so no thrown message reaches the client;
 * 3. the arguments against K1's closed `inputSchema` → `invalid-arguments` (an undeclared
 *    `notifyWhenFinished` included, R-WATCH-03);
 * 4. V2's payload rules (contract 1.2 §8: lengths, counts, bytes, required reasons) → V2's code,
 *    with V2's shape break read as the client's `invalid-arguments`;
 * 5. the tool's body (handlers.js). A `{ok: false, code}` is that refusal; a code outside K1's
 *    REFUSAL is a wiring fault, logged by that code and answered `operation-failed`. A throw is a
 *    refusal only for a V2 `ContractError` whose code is in K1's REFUSAL; anything else
 *    (`PairStore.pair`'s `TypeError` for an invalid id, W3 brief F6, included) is
 *    `operation-failed`, logged by its error code or class only, never its message, so no id,
 *    argument or token reaches the client or the log;
 * 6. the envelope's `structuredContent` (success or refusal with its extras) is checked against
 *    the tool's `outputSchema`; a mismatch is `operation-failed`, so an answer that breaks K1 never
 *    reaches a client.
 * Nothing here starts a timer (R-CON-05).
 */
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server'
import { ContractError, ERROR as V2_ERROR, validateRequest } from '../../../contract/index.js'
import { PAIR_ONLY, REFUSAL, SCOPE, TOOLS, okResult, refusalResult } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { validateValue } from '../../schema-value/index.js'
import { ENVELOPE_KEYS, LOG, TOOLS_METHOD, UNKNOWN_TOOL, V2_ADAPT, V2_PAYLOAD } from './constants.js'

/** The codes a refusal may carry: K1's vocabulary only (R-CON-02). */
const REFUSAL_CODES = new Set(Object.values(REFUSAL))

/**
 * The refusal branch of a K1 output schema: the one that admits K1's own refusal envelope
 * (`refusalResult`), whatever its position in the `oneOf`.
 */
const REFUSAL_PROBE = refusalResult(REFUSAL.operationFailed).structuredContent
const refusalBranch = (definition) => definition.outputSchema.oneOf.find((branch) => validateValue(branch, REFUSAL_PROBE).ok)

/** A refusal's extra fields its tool declares (K1: `pair`'s `bound` and `advice`); every other key is dropped. */
const declaredExtras = (definition) => Object.keys(refusalBranch(definition).properties).filter((key) => !ENVELOPE_KEYS.includes(key))

const CORE = new Map(TOOLS.map((definition) => [definition.name, Object.freeze({ definition, extras: declaredExtras(definition) })]))
const PAIR_ONLY_TOOLS = TOOLS.filter((definition) => PAIR_ONLY.tools.includes(definition.name))

const fullPower = (caller) => caller.scope === SCOPE.full
const unknownTool = () => new ProtocolError(ProtocolErrorCode.InvalidParams, UNKNOWN_TOOL)

/** A V2 contract throw's code, when it is K1 vocabulary. */
const contractCode = (error) => (error instanceof ContractError && REFUSAL_CODES.has(error.code) ? error.code : undefined)

/**
 * Step 4: the V2 payload rule's refusal code, or undefined when it passes. Only here is V2's
 * shape break (`invalid-envelope`) the client's `invalid-arguments`; from a body it is a fault.
 */
function v2Refusal(name, args, now) {
  const operation = V2_PAYLOAD[name]
  if (operation === undefined) return undefined
  const adapt = V2_ADAPT[name] ?? ((value) => value)
  try {
    validateRequest(operation, adapt(args), { now })
    return undefined
  } catch (error) {
    if (error instanceof ContractError && error.code === V2_ERROR.invalid) return REFUSAL.invalidArguments
    // V2's payload codes are all K1 vocabulary (K1 REFUSAL restates them); anything else is a fault.
    if (contractCode(error) !== undefined) return error.code
    throw error
  }
}

/**
 * @param {object} deps
 * @param {Readonly<Record<string, Function>>} deps.handlers handlers.js
 * @param {{list(): readonly object[], call(name: string, args: unknown, context: object): Promise<object | undefined>}} [deps.contributions] C-EXT
 * @param {Pick<import('../../../mcp-schema/index.js').PairStore, 'byPrincipal'>} deps.pairs
 * @param {() => number} deps.now
 * @param {{warn(...args: unknown[]): void}} deps.logger
 */
export function createDispatch({ handlers, contributions, pairs, now, logger }) {
  const failed = (line, diagnostic) => {
    logger.warn(LOG.format, line, diagnostic)
    return refusalResult(REFUSAL.operationFailed)
  }

  /** Step 5's refusal and step 6's check: the envelope of a body's `{ok, …}` answer. */
  function envelope(core, answer) {
    let result
    if (answer?.ok === true) result = okResult(answer)
    else if (!REFUSAL_CODES.has(answer?.code)) return failed(LOG.unknownCode, String(answer?.code))
    else result = refusalResult(answer.code, Object.fromEntries(core.extras.filter((key) => answer[key] !== undefined).map((key) => [key, answer[key]])))
    const checked = validateValue(core.definition.outputSchema, result.structuredContent)
    return checked.ok ? result : failed(LOG.outputInvalid, checked.path)
  }

  /** Steps 3–6 for one core tool. */
  async function callCore(core, args, caller) {
    const { name, inputSchema } = core.definition
    if (!validateValue(inputSchema, args).ok) return refusalResult(REFUSAL.invalidArguments)
    try {
      const refused = v2Refusal(name, args, now())
      if (refused !== undefined) return refusalResult(refused)
      return envelope(core, await handlers[name](args, { caller }))
    } catch (error) {
      const code = contractCode(error)
      return code === undefined ? failed(LOG.toolFailed, diagnosticOf(error)) : refusalResult(code)
    }
  }

  /** Step 2: C-EXT's pipeline, with the caller as a contributor sees it (R-EXT-10); undefined = unknown. */
  async function callContributed(name, args, caller, signal) {
    if (contributions === undefined) return undefined
    const principal = { key: caller.principalKey, name: pairs.byPrincipal(caller.principalKey)?.name ?? null }
    try {
      return await contributions.call(name, args, { principal, signal })
    } catch (error) {
      return failed(LOG.contributedFailed, diagnosticOf(error))
    }
  }

  /** Registers both handlers on `server` (an McpServer) for `caller`. */
  return function populate(server, caller) {
    server.server.setRequestHandler(TOOLS_METHOD.list, () => ({
      tools: fullPower(caller) ? [...TOOLS, ...(contributions?.list() ?? [])] : PAIR_ONLY_TOOLS,
    }))
    server.server.setRequestHandler(TOOLS_METHOD.call, async (request, ctx) => {
      const { name, arguments: args = {} } = request.params
      const core = CORE.get(name)
      if (core !== undefined && (fullPower(caller) || PAIR_ONLY.tools.includes(name))) return callCore(core, args, caller)
      if (core === undefined && fullPower(caller)) {
        const result = await callContributed(name, args, caller, ctx?.mcpReq?.signal)
        if (result !== undefined) return result
      }
      throw unknownTool()
    })
  }
}
