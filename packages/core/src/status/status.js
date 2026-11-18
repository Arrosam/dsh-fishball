/**
 * Core's status (task F-STATUS; design §5a.2, §6.3a step 1, §8.2; R-FB-03, R-FB-04, R-FB-09,
 * R-FB-10, R-BND-05, R-EXT-14; requirements 1.37 and 1.41 Q-G1). It reads what other modules own;
 * its own state is only the last set check, the last snapshot and whether it noticed:
 * - the link's `{state, code}` (F-LINK, `token-revoked` decided by F-PAIR's gate);
 * - Connect's state (F-LINK-SAVE, K3a `FishballConnect`), for the strip's Connect control;
 * - the guard report (F-GUARDS), plus the one manager notice of design §5a.2;
 * - the contributed-tool count (F-FACADE, R-EXT-14's note);
 * - set completeness, read from DSH at app ready and on every `plugin-manager/changed` (set.js).
 * It sends nothing to the target and writes nothing. fishball-ui draws `snapshot()` through
 * `fishballInstance.ui` (F-WIRE binds it); core reports nothing about a missing fishball-ui (Q-G1).
 *
 * The notice: the first `guards-overridden` report gives Fishball's manager one notice through
 * `manager.notify`, under a dedupe key that lives as long as the process (one DSH start). The
 * manager keeps notice keys and answers `duplicate` for a key it accepted, so a row restarted in
 * the same process (HMR, a live plugin change) cannot notice twice, a failed notice may be retried,
 * and the next DSH start gets a new key (task brief: "one notice per DSH start"). Later changes
 * show in the strip only.
 *
 * MULTI-1 (MULTI-0 `SEAM_TARGETS.snapshotVersion`): the snapshot is the global `fishball`,
 * `guards` and `set`, once per process, beside `targets: TargetsSnapshot`, the target collection's
 * list (every target's link, Connect, line, control and contributed-tool count). The scalar link
 * members are gone: there is no single target.
 */
import { randomUUID } from 'node:crypto'
import { GUARDS } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { emitIsolated, subscribe } from '../link/index.js'
import { STATUS_MODEL } from './constants.js'
import { checkSet } from './set.js'

const { services: SERVICE, events: EVENT, text: TEXT } = STATUS_MODEL

/** What a reader sees without core's status service: Fishball is off in this DSH (R-FB-10). */
const OFF = Object.freeze({ fishball: STATUS_MODEL.fishball.off })

/** The status of a DSH by its `fishballStatus` service, or `fishball-off` when it has none. */
export const statusOf = (service) => (typeof service?.snapshot === 'function' ? service.snapshot() : OFF)

/**
 * This DSH start's notice key. Held on the process's global object, not in a module variable,
 * because a recomposed row may load this module afresh, which must not make a new start.
 */
const startNoticeKey = () => (globalThis[Symbol.for(STATUS_MODEL.startSymbol)] ??= STATUS_MODEL.notice.guardsKeyPrefix + randomUUID())

/** Subscribes `fn` to an optional port's change stream; a port without one gives a no-op disposer. */
const follow = (port, method, fn) => (typeof port?.[method] === 'function' ? port[method](fn) : () => {})

/**
 * @param {object} ctx the core row's Cordis context (`get`, `on`, optional `logger`)
 * @param {object} ports
 * @param {{list(): object, onChange(fn: Function): Function}} ports.targets the target collection (`ui.targets`)
 * @param {{report(): object | undefined, onChange(fn: Function): Function}} [ports.guards]
 * @param {(input: {pluginId: string, dedupeKey: string, text: string}) => Promise<unknown>} [ports.notify]
 */
export function createStatus(ctx, { targets, guards, notify }) {
  const logger = ctx.logger?.(STATUS_MODEL.logger)
  const listeners = new Set()
  const noticeKey = startNoticeKey()
  let noticed = false
  let closed = false
  let set = null
  let setGeneration = 0
  let current
  let currentJson

  function build() {
    return Object.freeze({
      fishball: STATUS_MODEL.fishball.on,
      guards: guards?.report() ?? null,
      set,
      targets: targets.list(),
    })
  }

  function maybeNotice(report) {
    if (noticed || notify === undefined || report?.status !== GUARDS.status.overridden) return
    noticed = true
    const text = TEXT.guardsNotice(report.overridden.join(GUARDS.text.reportSeparator))
    // Deferred, so a notify that throws synchronously cannot break the refresh; a close() in the
    // meantime still wins. A failure (the manager not ready yet, at the app-ready check) is retried
    // at the next refresh that still sees the guards overridden; the dedupe key keeps it one notice.
    Promise.resolve().then(() => (closed ? undefined : notify({ pluginId: STATUS_MODEL.notice.pluginId, dedupeKey: noticeKey, text })))
      .catch((error) => { noticed = false; logger?.warn(TEXT.noticeFailed, codeOf(error)) })
  }

  /** Rebuilds the snapshot and emits it when it differs from the last one. */
  function refresh() {
    if (closed) return
    const next = build()
    maybeNotice(next.guards)
    const json = JSON.stringify(next)
    if (json === currentJson) return
    current = next
    currentJson = json
    emitIsolated(listeners, next)
  }

  /** One set check; a slower earlier check never overwrites a newer one. */
  async function recheckSet() {
    const pluginManager = ctx.get(SERVICE.pluginManager)
    if (closed || typeof pluginManager?.listBundles !== 'function') return
    const generation = ++setGeneration
    try {
      const found = await checkSet(pluginManager, ctx.get(SERVICE.loader))
      if (generation !== setGeneration) return
      set = found
      refresh()
    } catch (error) {
      logger?.warn(TEXT.setFailed, codeOf(error))
    }
  }

  let ready = false
  const disposers = [
    follow(targets, 'onChange', refresh),
    follow(guards, 'onChange', refresh),
    // The set is DSH state that is partial before app ready (as the guards, S6 §3.5): read after it only.
    ctx.on(EVENT.pluginsChanged, () => { if (ready) void recheckSet() }),
    // A settings change may change the parent's URL (the instance's setting), which its line reads.
    ctx.on(EVENT.settingsUpdated, refresh),
  ]
  const appReady = ctx.get(SERVICE.appReady)
  if (typeof appReady?.onReady === 'function') disposers.push(appReady.onReady(() => { ready = true; void recheckSet() }))
  refresh()

  const status = Object.freeze({
    snapshot: () => current,
    /** Calls `fn(snapshot)` after each change. Returns its disposer. A throwing listener affects no other. */
    onChange: (fn) => subscribe(listeners, fn),
    /** Stops following: nothing is emitted or noticed after this. */
    close() {
      closed = true
      setGeneration += 1
      for (const dispose of disposers) {
        try { if (typeof dispose === 'function') dispose() } catch { /* one disposer's fault never stops the rest */ }
      }
      listeners.clear()
    },
  })
  // Tied to the row as well, so a disposed row stops following even if its caller never closes it.
  ctx.effect?.(() => () => status.close())
  return status
}
