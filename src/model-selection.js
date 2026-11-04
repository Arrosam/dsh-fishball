/** Fishball's explicit model choice: persisted only here, applied only in its agent scope. */
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import { API_CODE, HTTP, MODEL_SELECTION } from './constants.js'
import { LifecycleStateError } from './errors.js'
import { modelSelectionSchema } from './store.js'
import { ModelChoiceError, modelCatalog, validateModelChoice } from './model-catalog.js'

/** A detached public choice, without persistence metadata or an absent effort property. */
const selectionOf = ({ provider, model, reasoningEffort }) => ({
  provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
})

/** HTTP boundary: reject empty/invalid IDs; persist and match their trimmed values. */
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

export class ModelSelection {
  #ctx
  #store
  #onChange
  #onPrepare
  #saving = false
  #previous = null
  #saves = Promise.resolve()

  constructor(ctx, store, { onChange, onPrepare = () => Promise.resolve() }) {
    this.#ctx = ctx
    this.#store = store
    this.#onChange = onChange
    // Post-durability preparation must contain its own errors: the wired ContextWindow.evaluate
    // already logs/reconciles lookup failures rather than rejecting a valid model choice.
    this.#onPrepare = onPrepare
  }

  /** Absence stays null, even when Fishball already has a logged route or DSH has a default. */
  snapshot() {
    return this.#saving ? this.#previous : this.policySelection()
  }

  /** Policy preparation may inspect the durable candidate before the composer is released. */
  policySelection() {
    // The settings table also accepts context/question records; the key alone is not proof of a choice.
    return readModelSelection(this.#store.settings.get(MODEL_SELECTION.settingsKey)) ?? null
  }

  /** Use the host catalog, including its provider failures and reasoning metadata. */
  catalog() {
    return modelCatalog(this.#ctx)
  }

  /** Serialize validation and durable writes so an older, slower save cannot win a race. */
  save(input) {
    const run = this.#saves.then(async () => {
      const selection = readModelSelection(input)
      if (selection === undefined) throw new LifecycleStateError(API_CODE.badBody, { status: HTTP.badRequest })
      const catalog = await this.catalog()
      try {
        await validateModelChoice(this.#ctx, selection, catalog)
      } catch (error) {
        if (error instanceof ModelChoiceError) throw new LifecycleStateError(error.apiCode, { fields: error.fields })
        throw error
      }
      // The resolver may materialize adapter defaults. Preserve the user's omission instead,
      // so the next request cannot inherit a previous model's explicit reasoning effort.
      this.#previous = this.snapshot()
      this.#saving = true
      try {
        await this.#store.settings.put(MODEL_SELECTION.settingsKey, { ...selection, changedAt: new Date().toISOString() })
        // Hold the old public choice while its dependent context-window policy is being prepared.
        // Other state publications during that await must not release an unconfigured composer.
        await this.#onPrepare()
      } finally {
        this.#saving = false
      }
      this.#onChange()
    })
    this.#saves = run.catch(() => {})
    return run
  }

  /** Installed only through Fishball's private composition, never on ordinary agents. */
  installAgent(agentCtx) {
    const owner = this
    // Keep the host's assembly snapshot, model variables and switch notice coupled to routing.
    // Fishball's dedicated choice must wrap later session/default selectors, not be overwritten by them.
    installSelectedModel(agentCtx, {
      get current() { return owner.snapshot() ?? undefined },
      assembled: undefined,
    })
  }
}
