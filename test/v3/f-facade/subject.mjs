/**
 * The one place that binds the F-FACADE cases to the façade module (`packages/core/src/bridge/`).
 * The surface was relayed by Fishball on 2026-11-15 (`dev/v3-f-facade` @ 9694c90c):
 *
 *   createBridge({link, gate?, imagesSupported?, logger?}) → Bridge
 *     link             core's link, public API: status(), tools(), onTools(fn), callTool(name, args)
 *                      (fakes.mjs FakeLink)
 *     gate             X19: `gate.send('session.message' | 'session.redirect', sessionId)` →
 *                      `{ok: true}` or `{code, reason}`
 *     imagesSupported  whether Fishball's model takes images (the image gate on the model's
 *                      `attachment_read`). ASSUMED a boolean: the relay names no type.
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
 * F-INTERCEPT's merged entry (`packages/core/src/events/index.js`) is used as test/v3/f-intercept
 * binds it: `openLedger(ctx, storageDomain)` and `createEvents({table, link: {ack}, fishball:
 * {activate, present}, logger})` → `{service: {intercept}, intake(event), recover(), close()}`.
 * Both are imported bound to the SDK under test (their `@deepseek-ai/*` imports resolve to it).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE, REPO } from '../../support/constants.mjs'
import { linkContractForSourceRun } from '../../support/contract-link.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

const EVENTS_ENTRY = path.join(REPO, 'packages', 'core', 'src', 'events', 'index.js')

async function bound(sdk, file, owner) {
  assert.ok(fs.existsSync(file), `${path.relative(REPO, file)} does not exist (${owner})`)
  linkContractForSourceRun()
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/**
 * One façade over `link`, mounted on `ctx.tools`. `gate` and `imagesSupported` are passed only
 * when a case sets them, so the module's own defaults apply otherwise.
 */
export async function makeBridge(sdk, { ctx, link, logger, gate, imagesSupported }) {
  const mod = await bound(sdk, SUBJECT.entry, 'F-FACADE "Owns" packages/core/src/bridge/')
  assert.equal(typeof mod[SUBJECT.factory], 'function', `packages/core/src/bridge/index.js exports no ${SUBJECT.factory}()`)
  const bridge = mod[SUBJECT.factory]({
    link, logger,
    ...(gate === undefined ? {} : { gate }),
    ...(imagesSupported === undefined ? {} : { imagesSupported }),
  })
  assert.equal(typeof bridge?.mount, 'function', `${SUBJECT.factory}() returned no mount()`)
  let dispose = bridge.mount(ctx.tools)
  const unmount = () => { dispose?.(); dispose = undefined }
  const own = { unmount, async close() { unmount(); await bridge.close?.() } }
  // Every other member is the module's own, called on the module's object (it may hold private state).
  return new Proxy(bridge, {
    get(target, prop) {
      if (Object.hasOwn(own, prop)) return own[prop]
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** F-INTERCEPT's events module bound to `sdk`. */
export const eventsModule = (sdk) => bound(sdk, EVENTS_ENTRY, 'F-INTERCEPT (merged in W2)')
