/**
 * A contributed `tools/call` (design §13.5; R-EXT-06…10; spike V3-S5 C1/C2, L3).
 *
 * Before `execute` (each refusal is the connector's code, and the contributor's code never runs):
 * 1. the name resolves to a visible registration, else `undefined` (the MCP layer answers
 *    JSON-RPC -32602 "unknown tool"; a quarantined tool is unknown too);
 * 2. the argument JSON fits min(declared, ceiling) bytes, else `limit-exceeded`;
 * 3. the arguments are valid against `inputSchema`, else `invalid-arguments`;
 * 4. fewer than TOOL_LIMITS.contributorInFlightCalls calls of the contributor are running, else
 *    `queue-full`. There is no per-contributor call rate (K2).
 * Authentication, pair-only filtering and the per-principal limits are the MCP layer's (C-HTTP,
 * C-TOOLS; Fishball 2026-11-14, F).
 *
 * After `execute`, every failure is exactly `{ok: false, code: 'contributor-failed'}` and counts
 * toward the quarantine (Fishball 2026-11-14, #2). The failures are a throw or rejection, a
 * timeout (the signal's reason is `timeout`), a result that is not the ContributedResult shape,
 * data over min(declared, ceiling) bytes, and data failing `outputSchema`.
 * Uncounted endings: the tool's withdrawal (`tool-withdrawn`), and the client's cancel, disconnect
 * or revocation (`operation-failed`, which the client no longer waits for; Fishball 2026-11-14).
 */
import { okResult, refusalResult } from '../../mcp-schema/index.js'
import { ABORT_REASON, CALL_CODE, SCHEMA_SUBSET, SHARED_CODES, TOOL_LIMITS, TOOLS_API } from '../../tools/index.js'
import { redact } from 'dsh-connector-shared/redact'
import { FAILURE_KIND, LOG, RESULT_FIELD, RESULT_KEYS } from './constants.js'
import { byteLength, snapshotJson } from './json.js'
import { validateValue } from '../schema-value/index.js'

/** Any lossless JSON object: what `data` must be before its own schema is checked (Fishball A). */
const ANY_OBJECT = Object.freeze({ type: SCHEMA_SUBSET.root })
/** The client-side abort reasons the MCP layer may give its signal; any other reason is `cancelled`. */
const CLIENT_REASONS = Object.freeze([ABORT_REASON.cancelled, ABORT_REASON.disconnected, ABORT_REASON.revoked])
const SETTLED = Object.freeze({ value: 'value', error: 'error', aborted: 'aborted' })

/** The secret-shape scrub first, then the cut to TOOL_LIMITS.messageChars code points (design §13.5). */
const safeMessage = (message) => [...redact(message)].slice(0, TOOL_LIMITS.messageChars).join('')

const hasOnly = (value, keys) => Object.keys(value).every((key) => keys.includes(key))
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * The client envelope of a returned value, or a FAILURE_KIND. The value may be hostile (a getter
 * or a proxy): each top-level field is read once, and `data` is one snapshot (json.js) that is
 * then measured, checked and sent. Any throw is a bad shape.
 * @returns {{result: object} | {failure: string}}
 */
function shape(reg, value) {
  try {
    if (!isRecord(value)) return { failure: FAILURE_KIND.shape }
    const ok = value[RESULT_FIELD.ok]
    if (ok === true) {
      if (!hasOnly(value, RESULT_KEYS.success)) return { failure: FAILURE_KIND.shape }
      const text = value[RESULT_FIELD.text]
      const data = snapshotJson(value[RESULT_FIELD.data], ANY_OBJECT)
      // `text` is accepted and dropped: the text block is always the same JSON (Fishball B).
      // A `data` with its own `ok` would be overwritten by the envelope's (Fishball G).
      if ((text !== undefined && typeof text !== 'string') || data === undefined || Object.hasOwn(data.value, RESULT_FIELD.ok)) {
        return { failure: FAILURE_KIND.shape }
      }
      if (byteLength(data.text) > reg.limits.resultBytes) return { failure: FAILURE_KIND.oversize }
      if (reg.def.outputSchema !== undefined && !validateValue(reg.def.outputSchema, data.value).ok) return { failure: FAILURE_KIND.outputSchema }
      return { result: okResult(data.value) }
    }
    if (ok !== false || !hasOnly(value, RESULT_KEYS.refusal)) return { failure: FAILURE_KIND.shape }
    const code = value[RESULT_FIELD.code]
    const message = value[RESULT_FIELD.message]
    if (typeof code !== 'string' || (message !== undefined && typeof message !== 'string')) return { failure: FAILURE_KIND.shape }
    const allowed = (reg.def.codes ?? []).includes(code) || SHARED_CODES.includes(code)
    return { result: refusalResult(allowed ? code : CALL_CODE.operationFailed, {}, message === undefined ? undefined : safeMessage(message)) }
  } catch {
    return { failure: FAILURE_KIND.shape }
  }
}

/**
 * @param {object} deps
 * @param {ReturnType<import('./registry.js').createRegistry>} deps.registry
 * @param {{warn: Function}} deps.logger
 */
export function createCalls({ registry, logger }) {
  /** `contributor-failed`, logged once per (activation, kind) and counted (R-EXT-08, R-EXT-09). */
  function failed(reg, kind) {
    const { act } = reg
    if (!act.loggedFailures.has(kind)) {
      act.loggedFailures.add(kind)
      logger.warn(LOG.failed, act.namespace, reg.def.name, kind)
    }
    registry.count(act, true)
    return refusalResult(CALL_CODE.contributorFailed)
  }

  /**
   * The checks before `execute` (steps 2–4 above): a refusal result, or undefined to run. The
   * arguments come from the MCP layer as parsed JSON, so they are measured as given; the schema
   * check needs no snapshot.
   */
  function precheck(reg, args) {
    let text
    try { text = JSON.stringify(args) } catch { return refusalResult(CALL_CODE.invalidArguments) }
    if (text === undefined) return refusalResult(CALL_CODE.invalidArguments)
    if (byteLength(text) > reg.limits.argumentBytes) return refusalResult(CALL_CODE.limitExceeded)
    if (!validateValue(reg.def.inputSchema, args).ok) return refusalResult(CALL_CODE.invalidArguments)
    if (registry.runningFor(reg.act) >= TOOL_LIMITS.contributorInFlightCalls) return refusalResult(CALL_CODE.queueFull)
    return undefined
  }

  /**
   * Run `execute` under the timeout and the abort signal. Its late result after an abort is
   * dropped (design §13.4 step 2). The in-flight bound counts calls the connector still waits for:
   * a contributor that ignores its signal can keep work running after the abort, which the
   * connector cannot stop (in-process code, design §13.5 "what containment does not cover").
   * @returns {Promise<{settled: string, value?: unknown, reason?: string}>}
   */
  async function run(reg, args, principal, clientSignal) {
    const controller = new AbortController()
    const abort = (reason) => { if (!controller.signal.aborted) controller.abort(reason) }
    const onClientAbort = () => abort(CLIENT_REASONS.includes(clientSignal.reason) ? clientSignal.reason : ABORT_REASON.cancelled)
    const untrack = registry.track({ registration: reg, abort })
    const timer = setTimeout(() => abort(ABORT_REASON.timeout), reg.limits.timeoutMs)
    // A pending contributor call never keeps the DSH process alive on its own.
    timer.unref?.()
    clientSignal?.addEventListener('abort', onClientAbort, { once: true })
    if (clientSignal?.aborted) onClientAbort()
    try {
      const call = Object.freeze({
        principal: Object.freeze({ key: principal.key, name: principal.name ?? null }),
        protocolVersion: TOOLS_API.protocolVersion,
        signal: controller.signal,
      })
      const aborted = new Promise((resolve) => {
        if (controller.signal.aborted) resolve()
        controller.signal.addEventListener('abort', resolve, { once: true })
      }).then(() => ({ settled: SETTLED.aborted, reason: controller.signal.reason }))
      // A synchronous return or throw is contained like a promise (K2 README); not started once aborted.
      const executed = controller.signal.aborted ? aborted : Promise.resolve().then(() => reg.def.execute(args, call))
        .then((value) => ({ settled: SETTLED.value, value }), () => ({ settled: SETTLED.error }))
      return await Promise.race([executed, aborted])
    } finally {
      clearTimeout(timer)
      clientSignal?.removeEventListener('abort', onClientAbort)
      untrack()
    }
  }

  /**
   * One contributed `tools/call`.
   * @param {string} publicName
   * @param {unknown} args the request's `arguments` (an absent one is `{}`)
   * @param {{principal: {key: string, name: string | null}, signal?: AbortSignal}} context
   * @returns {Promise<object | undefined>} a CallToolResult, or undefined for an unknown tool
   */
  async function call(publicName, args, { principal, signal }) {
    const reg = registry.resolve(publicName)
    if (reg === undefined) return undefined
    const input = args ?? {}
    const refused = precheck(reg, input)
    if (refused !== undefined) return refused
    const outcome = await run(reg, input, principal, signal)
    if (outcome.settled === SETTLED.aborted) {
      if (outcome.reason === ABORT_REASON.withdrawn) return refusalResult(CALL_CODE.toolWithdrawn)
      if (outcome.reason === ABORT_REASON.timeout) return failed(reg, FAILURE_KIND.timeout)
      return refusalResult(CALL_CODE.operationFailed)
    }
    if (outcome.settled === SETTLED.error) return failed(reg, FAILURE_KIND.threw)
    const shaped = shape(reg, outcome.value)
    if (shaped.failure !== undefined) return failed(reg, shaped.failure)
    registry.count(reg.act, false)
    return shaped.result
  }

  return Object.freeze({ call })
}
