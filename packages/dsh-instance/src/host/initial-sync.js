/**
 * The one automatic model-list sync of a newly created hosted child (the user, 2026-11-16:
 * "instance初次安装时同步一次"). On the first ready child of an install, the instance runs its own
 * model sync once, exactly as the owner's Check then Add with every offered provider ticked
 * (src/provider-sync-service.js `check` and `add`, unchanged). It copies the main DSH's providers
 * and model lists only and never sets the model Fishball uses (R-HOST-07, 1.41 Q-G7: "同步只是同步
 * model list，至于fishball用什么还要在fishball内设置"). Every later sync is the owner's, on the
 * instance's settings page.
 *
 * "Once" is recorded by a marker in the runtime folder (INITIAL_SYNC.file): it is written after a
 * check that completed and, when something was missing, an add that completed (per-provider
 * failures inside it are logged, not retried: the owner's manual sync covers them). A refused check
 * or add writes no marker and is tried again at the next start (the marker place and this retry
 * rule were decided by Fishball under the user's rule). No failure here
 * reaches the child's start or status.
 */
import path from 'node:path'
import { INITIAL_SYNC } from '../native-runtime/constants.js'
import { exists, writePrivate } from '../native-runtime/files.js'

/**
 * @param deps
 * @param deps.sync - `{check(), add({checkId, ids})}`, the model sync's own API
 * @param deps.codes - `{failed, outcomeFailed}`: the sync's generic refusal code and its per-provider
 *   `failed` outcome (provider-sync-service.js CHILD_SYNC; passed in so this rule loads
 *   without the sync's DSH adapters)
 * @param deps.root - `() => string`, the runtime folder (`<home>/fishball/runtime`)
 * @param [deps.warn] - `(format, code) => void`, the row's logger (codes only)
 * @returns {{run(): Promise<boolean>}} `run` resolves true once the marker is written (or was
 *   already there), false after a refusal; it never rejects. Concurrent calls share one run.
 */
export function createInitialSync({ sync, codes, root, warn = () => {} }) {
  let running
  const marker = () => path.join(root(), INITIAL_SYNC.file)
  async function attempt() {
    if (await exists(marker())) return true
    const checked = await sync.check()
    if (!checked?.ok) { warn(INITIAL_SYNC.failedLog, checked?.error?.code ?? codes.failed); return false }
    const ids = checked.result.missing.map(({ id }) => id)
    if (ids.length > 0) {
      const added = await sync.add({ checkId: checked.result.checkId, ids })
      if (!added?.ok) { warn(INITIAL_SYNC.failedLog, added?.error?.code ?? codes.failed); return false }
      // The item's `reason` is the engine's text, which this rule does not vouch for, so only the
      // outcome code is logged; the owner's manual Check shows what is still missing.
      for (const item of added.result.items) if (item.outcome === codes.outcomeFailed) warn(INITIAL_SYNC.itemFailedLog, codes.outcomeFailed)
    }
    await writePrivate(marker(), { format: INITIAL_SYNC.format })
    return true
  }
  return Object.freeze({
    run() {
      running ??= attempt()
        .catch((error) => { warn(INITIAL_SYNC.failedLog, error?.code ?? codes.failed); return false })
        .finally(() => { running = undefined })
      return running
    },
  })
}
