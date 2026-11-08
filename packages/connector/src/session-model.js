/** New-session model choice through public DSH Agent, Session and projection APIs only. */
import { MODEL_SELECTION } from './constants.js'
import { readModelSelection, installSelectedModel } from './model-selection.js'
import { ModelChoiceError, MODEL_ERROR, MODEL_TEXT, modelCatalog, modelChoices, validateModelChoice } from './model-catalog.js'

const SESSION_MODEL = Object.freeze({
  projection: 'modelSelection', selectionEvent: 'model/selection',
  eventFeed: 'session/event', requestHeader: 'request/header', turnStart: 'turn/start',
  firstPart: 0, separatorWidth: 1, missingSeparator: -1,
})

/** Undefined is the legacy path: no catalog calls, adapter calls, hooks or selection events. */
export async function prepareSessionModel(ctx, model, reasoningEffort) {
  if (model === undefined && reasoningEffort === undefined) return undefined
  let catalog
  try { catalog = await modelCatalog(ctx) } catch {
    throw new ModelChoiceError(MODEL_ERROR.unavailable, MODEL_TEXT.unavailable)
  }
  const availableModels = modelChoices(catalog)
  if (model === undefined) throw new ModelChoiceError(MODEL_ERROR.required, MODEL_TEXT.required, { availableModels })
  // Split once: provider-owned model ids can themselves contain slashes.
  const separator = typeof model === 'string' ? model.indexOf(MODEL_SELECTION.routeSeparator) : SESSION_MODEL.missingSeparator
  const selection = separator === SESSION_MODEL.missingSeparator ? undefined : readModelSelection({
    provider: model.slice(SESSION_MODEL.firstPart, separator),
    model: model.slice(separator + SESSION_MODEL.separatorWidth),
  })
  if (selection === undefined) throw new ModelChoiceError(MODEL_ERROR.invalid, MODEL_TEXT.invalid, { availableModels, failures: catalog.failures })
  // Validate effort against the chosen model's metadata, including wrong-type and empty input.
  if (reasoningEffort !== undefined) selection.reasoningEffort = typeof reasoningEffort === 'string' ? reasoningEffort.trim() : reasoningEffort
  return validateModelChoice(ctx, selection, catalog)
}

/**
 * selectModel also saves the profile default, so do not call it for a delegated session.
 * Session.append is DSH's supported event boundary (not a JSONL write); installModelSelection
 * supplies the same prompt/request coupling used by Fishball settings. The host's ordinary
 * selector snapshots pending intent at creation, so bridge only until the first request/header.
 * Thereafter DSH owns routing from the durable header, including GUI switches and cold resume.
 */
export async function applySessionModel(ctx, sessionId, selection) {
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if (resolved.agent === undefined) throw resolved.error
  const agent = resolved.agent
  // create publishes the blank agent before returning. Claim true idle, not just public
  // status: another GUI/plugin wake or maintenance must not slip an assembly past installation.
  await agent.runMaintenance(async (signal) => {
    if (agent.session.requestHeader() !== undefined
      || agent.session.snapshotEvents().some((event) => event.type === SESSION_MODEL.turnStart)) {
      throw new ModelChoiceError(MODEL_ERROR.failed, MODEL_TEXT.failed)
    }
    const pending = () => ctx.sessionProjections.stateOf(agent.session, SESSION_MODEL.projection)?.pending
    // Refuse a host missing the capability instead of starting on its default model.
    // A GUI selection completed before this lock may still live in the host's execution
    // cache. Do not overwrite its event and then reveal that stale cache after our bridge.
    if (pending() !== null) throw new ModelChoiceError(MODEL_ERROR.failed, MODEL_TEXT.failed)
    agent.session.append(SESSION_MODEL.selectionEvent, selection)
    const disposeSelection = installSelectedModel(agent.ctx, {
      get current() { return pending() ?? undefined },
      assembled: undefined,
    })
    const disposeEvent = agent.ctx.on(SESSION_MODEL.eventFeed, (_session, event) => {
      if (event.type !== SESSION_MODEL.requestHeader) return
      disposeSelection()
      disposeEvent()
    })
    // This durability barrier must finish BEFORE steer can wake the very first turn.
    // On failure keep the bridge for this still-existing session; a later explicit message
    // must not silently fall back. The tool reports its id without sending any message.
    if (!(await ctx.sessions.flush(agent.session)) || signal.aborted) throw new ModelChoiceError(MODEL_ERROR.failed, MODEL_TEXT.failed)
  })
}
