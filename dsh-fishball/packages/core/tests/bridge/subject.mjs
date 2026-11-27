/**
 * The one place that binds the F-FACADE cases to the façade module (`packages/core/src/bridge/`).
 * The surface was relayed by Fishball on 2026-11-15 (`dev/v3-f-facade` @ 9694c90c):
 *
 *   createBridge({link, gate?, imagesSupported?, logger?}) → Bridge
 *     link             core's link, public API: status(), tools(), onTools(fn), callTool(name, args)
 *                      (fakes.mjs FakeLink)
 *     gate             X19: `gate.send('session.message' | 'session.redirect', sessionId)` →
 *                      `{ok: true}` or `{code, reason}`
 *     imagesSupported  `(exec) => boolean | Promise<boolean>`, called on every model call: whether
 *                      Fishball's model takes images (the image gate on the model's `attachment_read`).
 *                      Never a plain boolean; a non-function, or a `gate` without `send`, throws
 *                      TypeError at createBridge (Fishball 2026-11-15, dev c9e93398).
 *     logger           a cordis logger
 *   Bridge = {
 *     mount(toolsService) → dispose   registers DSH ToolDefinitions for Fishball's model
 *     bridge(pluginId, ops) → {supports(name), call(name, args)}   X12; a name outside `ops`
 *                                     answers `forbidden`
 *     attention: {signal(pluginId, {important})}   X8; never rejects
 *     present(event) → [{type: 'text', text}]       F-INTERCEPT's `fishball.present` port
 *     contributedCount(), onChange(fn), close()
 *   }
 *
 * `makeBridge` mounts the façade on the world's `ctx.tools` (what Fishball's agent sees) and
 * returns the Bridge plus `unmount` and a `close` that undoes both.
 *
 * F-INTERCEPT's merged entry (`packages/core/src/events/index.js`) is used as test/v3/fishball-core/events
 * binds it: `openLedger(ctx, storageDomain)` and `createEvents({table, link: {ack}, fishball:
 * {activate, present}, logger})` → `{service: {intercept}, intake(event), recover(), close()}`.
 * Both are imported bound to the current DSH (fishball-test-helpers/bind).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { importBound } from 'fishball-test-helpers/bind'
import { EVENTS_ENTRY, SUBJECT } from './constants.mjs'

async function bound(file, owner) {
  assert.ok(fs.existsSync(file), `${path.relative(SUBJECT.packageDir, file)} does not exist (${owner})`)
  return importBound(file)
}

/**
 * One façade over `link`, mounted on `ctx.tools`. `gate` and `imagesSupported` are passed only
 * when a case sets them, so the module's own defaults apply otherwise.
 */
export async function makeBridge({ ctx, link, logger, gate, imagesSupported, attachments }) {
  const mod = await bound(SUBJECT.entry, 'F-FACADE "Owns" packages/core/src/bridge/')
  assert.equal(typeof mod[SUBJECT.factory], 'function', `packages/core/src/bridge/index.js exports no ${SUBJECT.factory}()`)
  const bridge = mod[SUBJECT.factory]({
    link, logger,
    ...(gate === undefined ? {} : { gate }),
    // The cases say true/false; the module takes the function form.
    ...(imagesSupported === undefined ? {} : { imagesSupported: () => imagesSupported }),
    // R-FIX-CORE F13: DSH's attachment store, looked up per call (`() => store`).
    ...(attachments === undefined ? {} : { attachments }),
  })
  assert.equal(typeof bridge?.mount, 'function', `${SUBJECT.factory}() returned no mount()`)
  let dispose = bridge.mount(ctx.tools)
  const unmount = () => { dispose?.(); dispose = undefined }
  // A plain view: the module's object may be frozen (a Proxy over it could not replace `close`).
  // Every member is the module's own, called on the module's object (it may hold private state).
  const view = {}
  for (const key of Object.keys(bridge)) {
    const value = bridge[key]
    view[key] = typeof value === 'function' ? value.bind(bridge) : value
  }
  return Object.assign(view, { unmount, async close() { unmount(); await bridge.close?.() } })
}

/**
 * The façade's exported `name` (`MODEL_NAME`, `modelNameOf`; K2 amendment at the W3 merge): from
 * the entry when it re-exports it, else from the first module of the bridge folder that exports
 * it (which file holds it is the module's choice, not a contract). Only exports are read, never
 * the source. Undefined when no module of the folder exports it.
 */
export async function bridgeExport(name) {
  const files = [SUBJECT.entry, ...bridgeSources().filter((f) => f !== SUBJECT.entry)]
  for (const file of files) {
    const mod = await bound(file, 'F-FACADE "Owns" packages/core/src/bridge/')
    if (mod[name] !== undefined) return mod[name]
  }
  return undefined
}
/** The JavaScript files of the bridge folder (its top level, as K2-AMEND-1 static rows read them). */
export const bridgeSources = () => fs.readdirSync(SUBJECT.dir).filter((f) => SUBJECT.sourceFile.test(f)).map((f) => path.join(SUBJECT.dir, f))

/** F-INTERCEPT's events module bound to the current DSH. */
export const eventsModule = () => bound(EVENTS_ENTRY, 'F-INTERCEPT (merged in W2)')
