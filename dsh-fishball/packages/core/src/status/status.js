/**
 * Core's status (F-STATUS): target views, plugin-set completeness and the sidebar brand theme.
 * fishball-ui draws the snapshot through the status service. Core reports nothing about a missing
 * fishball-ui (Q-G1).
 */
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

/** Subscribes `fn` to an optional port's change stream; a port without one gives a no-op disposer. */
const follow = (port, method, fn) => (typeof port?.[method] === 'function' ? port[method](fn) : () => {})

/**
 * @param {object} ctx the core row's Cordis context (`get`, `on`, optional `logger`)
 * @param {object} ports
 * @param {{list(): object, onChange(fn: Function): Function}} ports.targets the target collection (`ui.targets`)
 * @param {() => unknown} [ports.brand] LOGO-BUTTON: core's stored logo theme (config `brandStyle`);
 *   absent, or an unknown word, reports `SEAM_BRAND.default`
 */
export function createStatus(ctx, { targets, brand }) {
  const logger = ctx.logger?.(STATUS_MODEL.logger)
  const listeners = new Set()
  let closed = false
  let set = null
  let setGeneration = 0
  let current
  let currentJson

  function build() {
    return Object.freeze({
      fishball: STATUS_MODEL.fishball.on,
      set,
      targets: targets.list(),
      // Always one offered word, so the strip never has to guess from an old/hand-written value.
      brand: Object.freeze({ style: brandStyleOf(brand?.()) }),
    })
  }

  /** Rebuilds the snapshot and emits it when it differs from the last one. */
  function refresh() {
    if (closed) return
    const next = build()
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
    // The set is DSH state that is partial before app ready: read after it only.
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
    /** Stops following: nothing is emitted after this. */
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
