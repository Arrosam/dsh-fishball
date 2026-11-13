/**
 * Core's guard report (design §5a.2; R-FB-09, R-FB-12, R-FB-13; spike V3-S6 §3.5, §7.1): the
 * standalone self-reorder at the row's start, then a check at app ready and on every
 * `settings/document-updated` and `plugin-manager/changed`, published as the `fishballGuards`
 * service. Nothing is published before app ready, because those events fire during boot with
 * partial state (S6 §3.5). Core keeps running and changes nothing back (R-FB-09).
 *
 * The status strip line and the notice to Fishball's manager (design §5a.2) are F-STATUS's: they
 * read this service.
 */
import { GUARDS } from './constants.js'
import { readIntendedGuards } from './intended.js'
import { checkGuards } from './check.js'
import { reason, reorderOnce } from './reorder.js'

/**
 * @param {object} ctx - the fishball-ui row's Cordis context.
 * @returns {{report(): object|undefined, reorder(): Promise<string>, onChange(listener: Function): () => void}}
 *   `report()` is undefined until the app-ready check settles, then the latest K3 `GuardReport`.
 */
export function createGuards(ctx) {
  const intended = readIntendedGuards()
  const listeners = new Set()
  const logger = ctx.logger(GUARDS.logger)
  let ready = false
  let disposed = false
  let current
  // Checks run one at a time and the last trigger wins: a trigger during a check queues exactly one
  // more pass, so a burst of events (boot, a recompose) costs at most one queued check and a slower
  // earlier check never overwrites a newer result.
  let running
  let again = false
  // A recompose (HMR after a reorder) disposes this row and starts a new one; the old one must not
  // publish from its stale context.
  ctx.effect(() => () => { disposed = true })

  function publish(report) {
    const changed = current === undefined || current.status !== report.status ||
      current.overridden.length !== report.overridden.length || current.overridden.some((guard, index) => guard !== report.overridden[index])
    current = report
    if (!changed) return
    if (report.status !== GUARDS.status.ok) logger.warn(GUARDS.text.report, report.status, report.overridden.join(GUARDS.text.reportSeparator))
    for (const listener of listeners) {
      try { listener(report) } catch { /* a listener's fault never stops the report */ }
    }
  }

  async function pass() {
    try {
      do {
        again = false
        try {
          const report = await checkGuards(ctx, intended)
          if (!disposed) publish(report)
        } catch (error) {
          logger.warn(GUARDS.text.checkFailed, reason(error))
        }
      } while (again && !disposed)
    } finally {
      // Cleared in the same step that read `again`: a trigger after this point starts a new pass.
      running = undefined
    }
  }

  function check() {
    if (!ready || disposed) return undefined
    if (running) { again = true; return running }
    running = pass()
    return running
  }

  // Standalone: the one reorder, the first moment core's code runs (S6 §7.1). Not awaited by the
  // start: the boot that runs it is already composed, and the lock may wait on the plugin manager.
  // A finished reorder changes the manifest the check reads, so it re-checks.
  const profile = ctx.get(GUARDS.services.profileContext)
  const reorder = profile === undefined ? Promise.resolve(GUARDS.reorder.unchanged) : reorderOnce(profile, logger)
  void reorder.then(() => check())

  for (const trigger of GUARDS.triggers) ctx.on(trigger, () => { void check() })
  // A manager is checked by its tools on create and on resume (R-FB-13): `agent/created` fires
  // after setup with source `startup` or `resume`, so the tool list is final then. Every agent
  // triggers it; the check itself picks the manager sessions (check.js managerAgents).
  ctx.on(GUARDS.agentCreated, () => { void check() })
  // Every DSH launcher provides appReady (dsh profile-boot, both SDKs), and onReady calls a late
  // listener at once. Without it (a bare Cordis host, not a DSH profile) nothing is ever published:
  // "never before app ready" (R-FB-09) has no app-ready moment to wait for there.
  const appReady = ctx.get(GUARDS.services.appReady)
  if (typeof appReady?.onReady === 'function') ctx.effect(() => appReady.onReady(() => { ready = true; void check() }))

  return Object.freeze({
    report: () => current,
    reorder: () => reorder,
    onChange(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  })
}
