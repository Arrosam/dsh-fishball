/**
 * A model choice for one session the isolated Fishball starts (start_session's model and
 * reasoning effort, src/session-model.js): read at the boundary, applied in that agent's scope.
 */
import { z } from 'zod'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { MODEL_SELECTION } from './constants.js'

/** One provider/model choice; empty or whitespace ids are refused, their trimmed values kept. */
const modelSelectionSchema = z.object({
  provider: z.string().trim().min(MODEL_SELECTION.minIdLength),
  model: z.string().trim().min(MODEL_SELECTION.minIdLength),
  reasoningEffort: z.string().trim().min(MODEL_SELECTION.minIdLength).optional(),
})

/** A detached public choice, without an absent effort property. */
const selectionOf = ({ provider, model, reasoningEffort }) => ({
  provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
})

/** Boundary read: a valid choice, or undefined. */
export function readModelSelection(input) {
  const result = modelSelectionSchema.safeParse(input)
  return result.success ? selectionOf(result.data) : undefined
}

/** Wrap later host selectors so prompt variables and routing use the same official snapshot. */
export function installSelectedModel(agentCtx, selection) {
  return installModelSelection({
    on: (name, listener, options) => agentCtx.on(name, listener, { ...options, prepend: true }),
  }, selection)
}
