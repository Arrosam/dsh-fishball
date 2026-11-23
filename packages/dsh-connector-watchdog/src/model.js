/**
 * Watchdog's dedicated model selection: parsing the `model` setting, verifying it is still
 * routable in this DSH (never falling back to DSH's default model), and applying it to a side
 * session's Agent on both DSH 0.2.1 (`installModelSelection`) and 0.2.2+ (`agent.model.select`)
 * without ever writing DSH's profile default model.
 */
import { JUDGE_FAILURE, LOG, SIDE, WATCHDOG } from './constants.js'
import { judgeFailure } from './verdict.js'

const MODEL_REASON = Object.freeze({
  unset: 'model-unset',
  llmMissing: 'llm-unavailable',
  providerMissing: 'provider-unavailable',
  modelMissing: 'model-unavailable',
  effortMissing: 'reasoning-effort-unavailable',
  routeMismatch: 'route-mismatch',
  resolveFailed: 'resolve-failed',
})

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const trimmed = (value) => (typeof value === 'string' ? value.trim() : '')

/**
 * Normalizes a configured `model` value to `{provider, model, reasoningEffort?}`, or `undefined`
 * when unset or incomplete (which disables Watchdog).
 */
export function readModelSelection(value) {
  if (!isRecord(value)) return undefined
  const provider = trimmed(value.provider)
  const model = trimmed(value.model)
  if (provider === '' || model === '') return undefined
  const reasoningEffort = trimmed(value.reasoningEffort)
  return Object.freeze({ provider, model, ...(reasoningEffort === '' ? {} : { reasoningEffort }) })
}

export function sameModelSelection(a, b) {
  return a?.provider === b?.provider && a?.model === b?.model && a?.reasoningEffort === b?.reasoningEffort
}

function effortsOf(info) {
  const efforts = info?.reasoning?.efforts
  if (!Array.isArray(efforts)) return []
  return efforts.filter((effort) => typeof effort?.id === 'string' && effort.id !== '')
}

function failModel(logger, reason, cause) {
  logger?.warn(LOG.format, WATCHDOG.name, LOG.modelUnavailable, reason)
  throw judgeFailure(JUDGE_FAILURE.failed, cause ?? new Error(reason))
}

/**
 * Checks that `selection` is currently routable in this DSH without silent adapter substitution.
 * Throws `JUDGE_FAILURE.failed` when unavailable so Watchdog never falls back to DSH's default.
 */
export async function validateModelSelection(ctx, selection, logger) {
  const normalized = readModelSelection(selection)
  if (normalized === undefined) failModel(logger, MODEL_REASON.unset)
  const llm = ctx.get?.(WATCHDOG.service.llm)
  if (llm === undefined) failModel(logger, MODEL_REASON.llmMissing)
  try {
    const providers = llm.listProviders()
    if (!Array.isArray(providers) || !providers.some((route) => route?.id === normalized.provider)) {
      failModel(logger, MODEL_REASON.providerMissing)
    }
    const models = await llm.listModels(normalized.provider)
    if (!Array.isArray(models) || !models.some((entry) => entry?.id === normalized.model)) {
      failModel(logger, MODEL_REASON.modelMissing)
    }
    if (normalized.reasoningEffort !== undefined) {
      let info
      try { info = await llm.resolveModelInfo(normalized.provider, normalized.model) } catch { info = undefined }
      if (!effortsOf(info).some((effort) => effort.id === normalized.reasoningEffort)) {
        failModel(logger, MODEL_REASON.effortMissing)
      }
    }
    const prepared = await llm.resolveCallConfig({ ...normalized })
    if (prepared?.provider !== normalized.provider || prepared?.model !== normalized.model
      || (normalized.reasoningEffort !== undefined && prepared.reasoningEffort !== normalized.reasoningEffort)) {
      failModel(logger, MODEL_REASON.routeMismatch)
    }
  } catch (error) {
    if (error?.code === JUDGE_FAILURE.failed) throw error
    failModel(logger, MODEL_REASON.resolveFailed, error)
  }
}

/** Per-Agent selection port for DSH 0.2.1 (which lacks `agent.model`). */
const legacyPorts = new WeakMap()

function recordedSelection(agent) {
  let selection
  for (const event of agent.session.snapshotEvents()) {
    if (event.type === SIDE.modelSelectionEvent) selection = readModelSelection(event.data)
    else if (event.type === SIDE.requestHeaderEvent) selection = readModelSelection(event.data?.header?.config) ?? selection
  }
  return selection
}

async function defaultInstallModelSelection(agentCtx, selection) {
  const { installModelSelection } = await import('@deepseek-ai/dsh-agent')
  return installModelSelection(agentCtx, selection)
}

/**
 * Applies `selection` to `agent` without touching DSH's global default model (`agentDefaultModel`).
 * On DSH 0.2.2+ uses `agent.model.select`; on DSH 0.2.1 installs a prepended `installModelSelection`
 * hook on `agent.ctx` so it overrides `sessionController`'s default selector.
 */
export async function applyAgentModel(agent, selection, { install = defaultInstallModelSelection } = {}) {
  if (typeof agent.model?.select === 'function') {
    agent.model.select(selection)
    return
  }
  let port = legacyPorts.get(agent)
  if (port === undefined) {
    const ref = { current: recordedSelection(agent), assembled: undefined }
    // Wrap sessionController's selector outermost so prompt variables and routing use Watchdog's model.
    await install({
      on: (name, listener, options) => agent.ctx.on(name, listener, { ...options, prepend: true }),
    }, ref)
    port = {
      current: () => ref.current,
      select(next) {
        agent.session.append(SIDE.modelSelectionEvent, next)
        ref.current = next
      },
    }
    legacyPorts.set(agent, port)
  }
  if (!sameModelSelection(readModelSelection(port.current()), selection)) {
    port.select(selection)
  }
}
