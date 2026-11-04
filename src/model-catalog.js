/** Shared catalog/adapter validation for Fishball settings and delegated session starts. */
import { API_CODE, MODEL_SELECTION } from './constants.js'

export const MODEL_ERROR = Object.freeze({
  invalid: 'invalid-model', effort: 'invalid-reasoning-effort', required: 'model-required',
  unavailable: 'model-unavailable', failed: 'model-selection-failed',
})
export const MODEL_TEXT = Object.freeze({
  invalid: 'Choose an available model using provider/model.',
  effort: 'Choose a reasoning_effort advertised by this model; omit it for provider defaults.',
  required: 'reasoning_effort requires an explicit model (provider/model).',
  unavailable: 'DSH could not validate the requested model selection.',
  failed: 'The session was created, but its model selection could not be confirmed. No message was sent. Use the returned sessionId; do not start a duplicate.',
})

export class ModelChoiceError extends Error {
  constructor(code, message, fields, apiCode = API_CODE.refused) {
    super(message)
    this.code = code
    this.fields = { message, ...fields }
    this.apiCode = apiCode
  }
}

/** No cached or hard-coded models/efforts: both consumers use the GUI's live host catalog. */
export const modelCatalog = (ctx) => ctx.sessionController.modelCatalog()
export const modelChoices = (catalog) => catalog.groups.flatMap((group) => group.models.map((model) =>
  [group.id, model.id].join(MODEL_SELECTION.routeSeparator)))

/** Validate the same exact choice at both boundaries before adapter normalization can default it. */
export async function validateModelChoice(ctx, selection, catalog) {
  const availableModels = modelChoices(catalog)
  const model = catalog.groups.find((group) => group.id === selection.provider)?.models.find((model) => model.id === selection.model)
  if (model === undefined) throw new ModelChoiceError(MODEL_ERROR.invalid, MODEL_TEXT.invalid,
    { availableModels, failures: catalog.failures }, API_CODE.unknown)
  const availableReasoningEfforts = model.reasoning?.efforts.map((effort) => effort.id) ?? []
  if (selection.reasoningEffort !== undefined && !availableReasoningEfforts.includes(selection.reasoningEffort)) {
    throw new ModelChoiceError(MODEL_ERROR.effort, MODEL_TEXT.effort, { availableModels, availableReasoningEfforts })
  }
  try {
    const resolved = await ctx.llm.resolveCallConfig({ ...selection })
    // An adapter must not silently replace an explicit catalog choice with its default.
    if (resolved.provider !== selection.provider || resolved.model !== selection.model
      || (selection.reasoningEffort !== undefined && resolved.reasoningEffort !== selection.reasoningEffort)) {
      throw new ModelChoiceError(MODEL_ERROR.unavailable, MODEL_TEXT.unavailable)
    }
  } catch {
    throw new ModelChoiceError(MODEL_ERROR.unavailable, MODEL_TEXT.unavailable, { availableModels, availableReasoningEfforts })
  }
  // Keep an omitted effort omitted, rather than persisting an adapter's materialized default.
  return { ...selection }
}
