/**
 * The one place that binds the cases to F-INTERCEPT's module. K3 freezes what plugins see
 * (`fishballInstance.events.intercept`, events.d.ts) but no constructor for core's events module, and
 * F-LINK's link has no frozen in-process interface either (v3-tasks.md: W2 tasks build against fakes
 * of the frozen interfaces only). The seam below is therefore this suite's **assumption**, reported
 * with the commit; if the dev session's entry differs, only this file changes, never a case:
 *
 * - `packages/core/src/events/index.js` exports a factory (the default export when it is a function,
 *   else the one export named like `create…Events` / `create…Intercept…`);
 * - it is called as `factory({ ctx, agent, link })`:
 *   - `ctx`: the Fishball DSH's cordis context (real `storage.domain`, `logger`, `agentLoop`);
 *   - `agent`: the Fishball manager agent (a real DSH `Agent`);
 *   - `link`: core's MCP link as far as K1 freezes it: `callTool(name, args)` resolving to the tool's
 *     `structuredContent` (K1 `TOOL.inboxPoll` / `TOOL.inboxAck` shapes), and
 *     `onResourceUpdated(listener) → dispose` for the `fishball://events` listen hint;
 * - it returns (or resolves to) the K3 `FishballInstanceEvents` (`intercept`) directly or under
 *   `events`, optionally with `start()` and `close()` (stop before the agent's owner disposes it,
 *   design §6.4);
 * - plugins that load with core register between the factory call and `start()`, so a restart
 *   re-offers an open record to a plugin that is up (EVT-DT-04 rule 7) instead of falling back.
 * Core polls once when started and once per hint (design §6.3 "poll once on every (re)connect").
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/** The factory export, bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function factoryFor(sdk) {
  assert.ok(fs.existsSync(SUBJECT.entry), `${path.relative(process.cwd(), SUBJECT.entry)} does not exist (F-INTERCEPT "Owns" packages/core/src/events/)`)
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, SUBJECT.entry))
  if (typeof mod.default === 'function') return mod.default
  const named = Object.entries(mod).filter(([name, value]) => typeof value === 'function' && SUBJECT.factoryName.test(name))
  assert.equal(named.length, 1, `no single events factory export; exports: ${Object.keys(mod).join(', ')}`)
  return named[0][1]
}

/** Core's events service over one world: `{ intercept, start, close }`; `start` is the caller's. */
export async function makeSubject(sdk, { ctx, agent, link }) {
  const made = await (await factoryFor(sdk))({ ctx, agent, link })
  const events = typeof made?.intercept === 'function' ? made : made?.events
  assert.equal(typeof events?.intercept, 'function', 'the events factory returned no intercept(registration, onEvent)')
  return {
    intercept: (registration, onEvent) => events.intercept(registration, onEvent),
    start: async () => { if (typeof made.start === 'function') await made.start() },
    close: async () => { if (typeof made.close === 'function') await made.close() },
  }
}
