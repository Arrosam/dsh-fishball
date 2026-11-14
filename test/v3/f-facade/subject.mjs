/**
 * The one place that binds the F-FACADE cases to the façade module (`packages/core/src/bridge/`).
 * No contract freezes its factory, and the dev session has relayed no surface yet, so this file
 * assumes ONE shape, from the brief's "Builds" list. If the module differs, only this file changes:
 *
 *   createBridge({ctx, link, logger}) → Bridge
 *     ctx     a cordis context with DSH's `tools` service: the façade re-exposes the target's
 *             tools to Fishball's model there (design §6.3: the stock dsh-mcp-client is not used)
 *     link    core's link, public API only (O4): tools(), onTools(fn), callTool(name, args),
 *             status(), onStatus(fn) (fakes.mjs FakeLink)
 *     logger  a cordis logger
 *   Bridge = {
 *     contributedCount() → number    contributed tools on offer, for F-STATUS (R-EXT-14 note)
 *     present(event) → content blocks
 *                                    F-INTERCEPT's `fishball.present` port, the X9 Fishball branch
 *     attention: { signal(pluginId, {important}) → Promise<result> }
 *                                    X8, the core side (Q-14): `embed-ui.attention.signal` over the
 *                                    link, or `{ok: false, code: 'unsupported-operation'}`
 *     close()                        withdraws what it registered
 *   }
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

/** The façade's factory: `createBridge`, else the one function export named like it. */
async function factoryOf(sdk) {
  const mod = await bound(sdk, SUBJECT.entry, 'F-FACADE "Owns" packages/core/src/bridge/')
  if (typeof mod[SUBJECT.factory] === 'function') return mod[SUBJECT.factory]
  const named = Object.entries(mod).filter(([name, value]) => typeof value === 'function' && SUBJECT.factoryName.test(name))
  assert.equal(named.length, 1, `packages/core/src/bridge/index.js exports no ${SUBJECT.factory}() (found ${Object.keys(mod).join(', ') || 'nothing'})`)
  return named[0][1]
}

/** One façade over `link` in `ctx`. */
export async function makeBridge(sdk, { ctx, link, logger }) {
  const create = await factoryOf(sdk)
  const bridge = await create({ ctx, link, logger })
  assert.ok(bridge && typeof bridge === 'object', 'createBridge returned no object')
  return bridge
}

/** F-INTERCEPT's events module bound to `sdk`. */
export const eventsModule = (sdk) => bound(sdk, EVENTS_ENTRY, 'F-INTERCEPT (merged in W2)')
