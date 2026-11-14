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
 * shapes around both handlers.
 *
 * `tools/list`: K1's core tools in TOOLS order, then the contributed tools (`contributions.list()`,
 * C-EXT; core tools first, R-EXT-12). A pair-only caller gets `pair` only (PAIR_ONLY, R-OA-04).
 *
 * `tools/call`, one refusal at the first failing step, each a K1 envelope:
 * 1. a name the caller's list does not hold (a removed watch tool, a quarantined contributed
 *    tool, any tool but `pair` for a pair-only caller) → JSON-RPC -32602, a protocol fault;
 * 2. a contributed name → C-EXT's own pipeline (`contributions.call`), unchanged;
 * 3. the arguments against K1's closed `inputSchema` → `invalid-arguments` (an undeclared
 *    `notifyWhenFinished` included, R-WATCH-03);
 * 4. V2's payload rules (contract 1.2 §8: lengths, counts, bytes, required reasons) → V2's code;
 * 5. the tool's body (handlers.js). A `{ok: false, code}` is that refusal. A throw is a refusal
 *    only for a V2 `ContractError` whose code is in K1's REFUSAL vocabulary; anything else
 *    (`PairStore.pair`'s `TypeError` for an invalid id, W3 brief F6, included) is
 *    `operation-failed`, logged by its error code or class only, never its message, so no id,
 *    argument or token reaches the client or the log;
 * 6. a success is checked against the tool's `outputSchema`; a mismatch is `operation-failed`, so
 *    a domain answer that breaks K1 never reaches a client.
 * Nothing here starts a timer (R-CON-05).
 */
import { ProtocolError, ProtocolErrorCode } from '@modelcontextprotocol/server'
import { ContractError, ERROR as V2_ERROR, validateRequest } from '../../../contract/index.js'
import { PAIR_ONLY, REFUSAL, SCOPE, TOOLS, okResult, refusalResult } from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { validateValue } from '../../schema-value/index.js'
import { LOG, TOOLS_METHOD, UNKNOWN_TOOL, V2_PAYLOAD, V3_ONLY_ARGUMENTS } from './constants.js'

/** The codes a refusal may carry: K1's vocabulary only (R-CON-02). */
const REFUSAL_CODES = new Set(Object.values(REFUSAL))
/** The envelope's own keys, never copied from a refusal's extra fields. */
const ENVELOPE_KEYS = Object.freeze(['ok', 'code', 'message'])

/** A refusal's extra fields its tool declares (K1: `pair`'s `bound` and `advice`); every other key is dropped. */
const declaredExtras = (definition) => Object.keys(definition.outputSchema.oneOf.at(-1).properties)
  .filter((key) => !ENVELOPE_KEYS.includes(key))

const CORE = new Map(TOOLS.map((definition) => [definition.name, Object.freeze({ definition, extras: declaredExtras(definition) })]))
const PAIR_ONLY_TOOLS = TOOLS.filter((definition) => PAIR_ONLY.tools.includes(definition.name))

const fullPower = (caller) => caller.scope === SCOPE.full

/** A V2 contract throw's code, when it is K1 vocabulary; V2's shape break is K1's `invalid-arguments`. */
function contractCode(error) {
  if (!(error instanceof ContractError)) return undefined
  if (error.code === V2_ERROR.invalid) return REFUSAL.invalidArguments
  return REFUSAL_CODES.has(error.code) ? error.code : undefined
}

/** `args` without the V3-only keys of `name`, for the V2 validator. */
function v2Payload(name, args) {
  const dropped = V3_ONLY_ARGUMENTS[name]
  if (dropped === undefined) return args
  return Object.fromEntries(Object.entries(args).filter(([key]) => !dropped.includes(key)))
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

  /** The envelope of a body's `{ok, …}` answer (step 5's refusal, step 6's check). */
  function envelope(core, answer) {
    if (answer?.ok !== true) {
      const code = REFUSAL_CODES.has(answer?.code) ? answer.code : REFUSAL.operationFailed
      const extra = Object.fromEntries(core.extras.filter((key) => answer?.[key] !== undefined).map((key) => [key, answer[key]]))
      return refusalResult(code, extra)
    }
    const checked = validateValue(core.definition.outputSchema, answer)
    return checked.ok ? okResult(answer) : failed(LOG.outputInvalid, checked.path)
  }

  /** Steps 3–6 for one core tool. */
  async function callCore(core, args, caller) {
    const { name, inputSchema } = core.definition
    if (!validateValue(inputSchema, args).ok) return refusalResult(REFUSAL.invalidArguments)
    try {
      const operation = V2_PAYLOAD[name]
      if (operation !== undefined) validateRequest(operation, v2Payload(name, args), { now: now() })
      return envelope(core, await handlers[name](args, { caller }))
    } catch (error) {
      const code = contractCode(error)
      return code === undefined ? failed(LOG.toolFailed, diagnosticOf(error)) : refusalResult(code)
    }
  }

  /** Step 2: C-EXT's pipeline, with the caller as a contributor sees it (R-EXT-10). */
  async function callContributed(name, args, caller, signal) {
    const principal = { key: caller.principalKey, name: pairs.byPrincipal(caller.principalKey)?.name ?? null }
    return contributions?.call(name, args, { principal, signal })
  }

  const unknownTool = () => new ProtocolError(ProtocolErrorCode.InvalidParams, UNKNOWN_TOOL)

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
