/**
 * Core's status (task F-STATUS; design §5a.2, §6.3a step 1, §8.2; R-FB-03, R-FB-04, R-FB-09,
 * R-FB-10, R-BND-05, R-EXT-14; requirements 1.37 and 1.41 Q-G1). It reads what other modules own;
 * its own state is only the last set check, the last snapshot and whether it noticed:
 * - the link's `{state, code}` (F-LINK, `token-revoked` decided by F-PAIR's gate);
 * - Connect's state (F-LINK-SAVE, K3a `FishballConnect`), for the strip's Connect control;
 * - the guard report (F-GUARDS), plus the one manager notice of design §5a.2;
 * - the contributed-tool count (F-FACADE, R-EXT-14's note);
 * - set completeness, read from DSH at app ready and on every `plugin-manager/changed` (set.js).
 * It sends nothing to the target; its one write is the record of announced manager tools (below).
 * fishball-ui draws `snapshot()` through `fishballInstance.ui` (F-WIRE binds it); core reports
 * nothing about a missing fishball-ui (Q-G1).
 *
 * The notice: the first `guards-overridden` report gives Fishball's manager one notice through
 * `manager.notify`, under a dedupe key that lives as long as the process (one DSH start). The
 * manager keeps notice keys and answers `duplicate` for a key it accepted, so a row restarted in
 * the same process (HMR, a live plugin change) cannot notice twice, a failed notice may be retried,
 * and the next DSH start gets a new key (task brief: "one notice per DSH start"). Later changes
 * show in the strip only.
 *
 * The tools notice (the user, 2026-11-21): extra tools on the manager are announced gently, not as
 * an override. Each new name is announced once, ever: what was announced is recorded under the
 * profile's DSH home, so a restart or a re-check says nothing new, and a later added tool gets one
 * new notice. `manager-tools` then leaves the guards notice's list (guardsNoticeList).
 *
 * MULTI-1 (MULTI-0 `SEAM_TARGETS.snapshotVersion`): the snapshot is the global `fishball`,
 * `guards` and `set`, once per process, beside `targets: TargetsSnapshot`, the target collection's
 * list (every target's link, Connect, line, control and contributed-tool count). The scalar link
 * members are gone: there is no single target.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { GUARDS } from '../../contracts/constants.js'
import { codeOf } from '../events/diagnostics.js'
import { emitIsolated, subscribe } from '../link/index.js'
import { STATUS_MODEL } from './constants.js'
import { checkSet } from './set.js'

const { services: SERVICE, events: EVENT, text: TEXT } = STATUS_MODEL

/** What a reader sees without core's status service: Fishball is off in this DSH (R-FB-10). */
const OFF = Object.freeze({ fishball: STATUS_MODEL.fishball.off })

/** The logo themes the strip can draw (`SEAM_BRAND.style`); any other stored word is the default. */
const BRAND_STYLES = Object.freeze(Object.values(STATUS_MODEL.brand.style))
const brandStyleOf = (word) => (BRAND_STYLES.includes(word) ? word : STATUS_MODEL.brand.default)

/** The status of a DSH by its `fishballStatus` service, or `fishball-off` when it has none. */
export const statusOf = (service) => (typeof service?.snapshot === 'function' ? service.snapshot() : OFF)

/**
 * This DSH start's notice key. Held on the process's global object, not in a module variable,
 * because a recomposed row may load this module afresh, which must not make a new start.
 */
const startNoticeKey = () => (globalThis[Symbol.for(STATUS_MODEL.startSymbol)] ??= STATUS_MODEL.notice.guardsKeyPrefix + randomUUID())

const RECORD = STATUS_MODEL.toolsRecord

/**
 * The guard codes the guards notice names. `manager-tools` is left to the tools notice when the
 * report names extra tools (the user, 2026-11-21: added tools are informational, not an override);
 * a missing default tool (no extra name) keeps it in the guards notice, as before.
 */
const guardsNoticeList = (report) => (report.extraManagerTools?.length > 0
  ? report.overridden.filter((guard) => guard !== GUARDS.code.managerTools)
  : report.overridden)

/** `<DSH home>/fishball/manager-tools.json`, or undefined without a profile home (nothing persists). */
function toolsRecordPath(ctx) {
  const home = ctx.get(SERVICE.profileContext)?.home
  return typeof home === 'string' && path.isAbsolute(home) ? path.join(home, ...RECORD.directory, RECORD.file) : undefined
}

/** The names a well-formed record holds; anything else is nothing announced. */
function announcedIn(text) {
  const names = JSON.parse(text)?.[RECORD.member]
  if (!Array.isArray(names) || !names.every((name) => typeof name === 'string')) throw new TypeError(RECORD.member)
  return names
}

/**
 * The extra manager tools already announced (the user, 2026-11-21: "notify only once … announce again
 * only if a new tool is added"), in memory and, with a profile home, in `RECORD.file`. An unreadable
 * or malformed record is logged and counts as nothing announced, so the worst case is one more
 * notice, never a lost one.
 */
function createAnnounced(ctx, logger) {
  const file = toolsRecordPath(ctx)
  const names = new Set()
  const loaded = file === undefined ? Promise.resolve() : readFile(file, RECORD.encoding).then(
    (text) => { for (const name of announcedIn(text)) names.add(name) },
    (error) => { if (error?.code !== RECORD.notFound) throw error },
  ).catch((error) => logger?.warn(TEXT.toolsRecordUnreadable, codeOf(error)))
  return Object.freeze({
    loaded,
    /** The extra names not announced yet. */
    fresh: (extra) => extra.filter((name) => !names.has(name)),
    /** The announced set with `extra` added, sorted. */
    with: (extra) => [...new Set([...names, ...extra])].sort(),
    /** Marks `all` announced and writes the record; a failed write is logged (memory still holds it). */
    async save(all) {
      for (const name of all) names.add(name)
      if (file === undefined) return
      const line = JSON.stringify({ [RECORD.member]: all }) + RECORD.lineEnd
      await writeFileAtomic(file, line, { mode: RECORD.mode, dirMode: RECORD.directoryMode })
        .catch((error) => logger?.warn(TEXT.toolsRecordFailed, codeOf(error)))
    },
  })
}

/**
 * The tools notice's dedupe key: the announced set it completes. The manager keeps accepted keys
 * across starts (manager/service.js), so a notice accepted before a record write failed answers
 * `duplicate` at the next start instead of being given twice.
 */
const toolsNoticeKey = (all) => STATUS_MODEL.notice.toolsKeyPrefix + createHash(RECORD.keyHash).update(JSON.stringify(all)).digest(RECORD.keyEncoding)

/** Subscribes `fn` to an optional port's change stream; a port without one gives a no-op disposer. */
const follow = (port, method, fn) => (typeof port?.[method] === 'function' ? port[method](fn) : () => {})

/**
 * @param {object} ctx the core row's Cordis context (`get`, `on`, optional `logger`)
 * @param {object} ports
 * @param {{list(): object, onChange(fn: Function): Function}} ports.targets the target collection (`ui.targets`)
 * @param {{report(): object | undefined, onChange(fn: Function): Function}} [ports.guards]
 * @param {(input: {pluginId: string, dedupeKey: string, text: string}) => Promise<unknown>} [ports.notify]
 * @param {() => unknown} [ports.brand] LOGO-BUTTON: core's stored logo theme (config `brandStyle`);
 *   absent, or an unknown word, reports `SEAM_BRAND.default`
 */
export function createStatus(ctx, { targets, guards, notify, brand }) {
  const logger = ctx.logger?.(STATUS_MODEL.logger)
  const listeners = new Set()
  const noticeKey = startNoticeKey()
  const announced = createAnnounced(ctx, logger)
  let noticed = false
  let announcing = false
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
      // Always one offered word, so the strip never has to guess from an old/hand-written value.
      brand: Object.freeze({ style: brandStyleOf(brand?.()) }),
    })
  }

  function maybeNotice(report) {
    if (noticed || notify === undefined || report?.status !== GUARDS.status.overridden) return
    const list = guardsNoticeList(report)
    if (list.length === 0) return
    noticed = true
    const text = TEXT.guardsNotice(list.join(GUARDS.text.reportSeparator))
    // Deferred, so a notify that throws synchronously cannot break the refresh; a close() in the
    // meantime still wins. A failure (the manager not ready yet, at the app-ready check) is retried
    // at the next refresh that still sees the guards overridden; the dedupe key keeps it one notice.
    Promise.resolve().then(() => (closed ? undefined : notify({ pluginId: STATUS_MODEL.notice.pluginId, dedupeKey: noticeKey, text })))
      .catch((error) => { noticed = false; logger?.warn(TEXT.noticeFailed, codeOf(error)) })
  }

  /**
   * The tools notice: when the report names an extra manager tool not announced before, one notice
   * listing every current extra tool. One at a time; once it is accepted the set is recorded and the
   * latest report is looked at again, for a name that arrived meanwhile. A failed notice records
   * nothing and is retried at the next refresh that still sees an unannounced name.
   */
  async function maybeAnnounce(report) {
    const extra = report?.extraManagerTools ?? []
    if (announcing || notify === undefined || extra.length === 0) return
    announcing = true
    let accepted = false
    try {
      await announced.loaded
      if (closed || announced.fresh(extra).length === 0) return
      const all = announced.with(extra)
      await notify({ pluginId: STATUS_MODEL.notice.pluginId, dedupeKey: toolsNoticeKey(all), text: TEXT.toolsNotice(extra.join(GUARDS.text.reportSeparator)) })
      await announced.save(all)
      accepted = true
    } catch (error) {
      logger?.warn(TEXT.toolsNoticeFailed, codeOf(error))
    } finally {
      announcing = false
    }
    if (accepted && !closed) void maybeAnnounce(guards?.report())
  }

  /** Rebuilds the snapshot and emits it when it differs from the last one. */
  function refresh() {
    if (closed) return
    const next = build()
    maybeNotice(next.guards)
    void maybeAnnounce(next.guards)
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
    // LOGO-BUTTON: a saved volatile setting reaches the running row through the loader; the logo
    // theme is in the snapshot, so the strip must be re-read then too.
    ctx.on(EVENT.volatileUpdate, refresh),
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
