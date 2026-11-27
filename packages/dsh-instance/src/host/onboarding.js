/**
 * First-run onboarding state and persistence for the hosted Fishball instance.
 *
 * Trigger & completion rule:
 * - A marker file (`<home>/fishball/runtime/onboarding.json`) records that onboarding finished
 *   (`completed`, `skipped`, or `preconfigured`). Because it lives inside the runtime tree,
 *   `uninstall.js` removes it so a fresh reinstall starts onboarding again.
 * - Before the marker exists, `state()` inspects the ready child over the `child-model` channel:
 *   - if `fishball-core.model` is already configured AND onboarding has not already started in
 *     this host lifetime, the child is treated as preconfigured: the marker is written and
 *     onboarding is skipped (`needed: false`);
 *   - if `fishball-core.model` is unset, onboarding starts (`needed: true`, `inProgress = true`),
 *     and stays `needed: true` even after step 1 writes `fishball-core.model`, until `complete()`
 *     explicitly finishes or skips the wizard.
 * - While the child is not yet ready (or `fishball-core`'s settings namespace is still warming up),
 *   `needed` is `null` so the client knows to wait rather than wrongly skipping or showing onboarding.
 * - A generation counter prevents a `state()` call that was awaiting `childModel.read()` from
 *   overwriting `inProgress` or reporting `needed: true` after a concurrent `complete()`.
 */
import path from 'node:path'
import { CHILD_MODEL, ONBOARDING, REFUSAL } from '../native-runtime/constants.js'
import { exists, writePrivate } from '../native-runtime/files.js'
import { normalizeModelSelection } from '../native-runtime/child-model.js'

/**
 * @param deps
 * @param deps.childModel - `() => ({read(), set(selection)}) | undefined`, the live `child-model` client
 * @param deps.root - `(create?: boolean) => string | undefined | Promise<string | undefined>`,
 *   resolves the proven runtime directory (`<home>/fishball/runtime`); when `create` is true, may
 *   create the directory safely if absent.
 * @param [deps.warn] - `(format, code) => void`, optional logger
 */
export function createOnboarding({ childModel, root, warn = () => {} }) {
  /** Keeps the multi-step wizard alive after Step 1 saves the model until `complete()` is called. */
  let inProgress = false
  /** Monotonic counter bumped on `complete()` to reject stale in-flight `state()` results. */
  let completionGen = 0

  async function markerPath(create = false) {
    const dir = await Promise.resolve(root(create))
    return typeof dir === 'string' && dir !== '' ? path.join(dir, ONBOARDING.file) : undefined
  }

  async function markerExists() {
    try {
      const file = await markerPath(false)
      return file !== undefined && Boolean(await exists(file))
    } catch {
      return false
    }
  }

  async function writeMarker(outcome) {
    const file = await markerPath(true)
    if (file === undefined) throw Object.assign(new Error(REFUSAL.failed), { code: REFUSAL.failed })
    await writePrivate(file, {
      format: ONBOARDING.format,
      outcome,
      completedAt: new Date().toISOString(),
    })
  }

  return Object.freeze({
    /**
     * Reads onboarding status plus (when needed and child is ready) the child's current model
     * selection and model catalog.
     */
    async state() {
      const gen = completionGen
      const done = await markerExists()
      const client = childModel()
      if (done) {
        inProgress = false
        return { ok: true, completed: true, needed: false, childReady: client !== undefined, model: null, catalog: null }
      }
      if (client === undefined) {
        return { ok: true, completed: false, needed: null, childReady: false, model: null, catalog: null }
      }
      let snapshot
      try {
        snapshot = await client.read()
      } catch {
        return { ok: true, completed: false, needed: null, childReady: false, model: null, catalog: null }
      }
      // If `complete()` ran while `client.read()` was in flight, do not re-arm `inProgress`.
      if (gen !== completionGen || await markerExists()) {
        inProgress = false
        return { ok: true, completed: true, needed: false, childReady: true, model: snapshot.model, catalog: snapshot.catalog }
      }
      if (!snapshot.namespacePresent) {
        return { ok: true, completed: false, needed: null, childReady: false, model: null, catalog: snapshot.catalog }
      }
      if (snapshot.model !== null && !inProgress) {
        try { await writeMarker(ONBOARDING.outcome.preconfigured) } catch (error) { warn(ONBOARDING.writeFailedLog, error?.code ?? REFUSAL.failed) }
        return { ok: true, completed: true, needed: false, childReady: true, model: snapshot.model, catalog: snapshot.catalog }
      }
      inProgress = true
      return { ok: true, completed: false, needed: true, childReady: true, model: snapshot.model, catalog: snapshot.catalog }
    },

    /** Writes `{provider, model, reasoningEffort?}` to `fishball-core.model` inside the child. */
    async selectModel(selection) {
      const normalized = normalizeModelSelection(selection)
      if (normalized === null) return { ok: false, code: CHILD_MODEL.code.invalidModel }
      const client = childModel()
      if (client === undefined) return { ok: false, code: CHILD_MODEL.code.notReady }
      inProgress = true
      try {
        return await client.set(normalized)
      } catch {
        return { ok: false, code: CHILD_MODEL.code.notReady }
      }
    },

    /** Marks onboarding completed or skipped so it does not auto-open again. */
    async complete(outcome = ONBOARDING.outcome.completed) {
      if (!ONBOARDING.completeOutcomes.includes(outcome)) return { ok: false, code: REFUSAL.invalid }
      try {
        await writeMarker(outcome)
        completionGen++
        inProgress = false
        return { ok: true, completed: true, outcome }
      } catch (error) {
        warn(ONBOARDING.writeFailedLog, error?.code ?? REFUSAL.failed)
        return { ok: false, code: REFUSAL.failed }
      }
    },
  })
}
