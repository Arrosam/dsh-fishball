/**
 * The one place that binds the WD-ROUTE cases to WD-ROUTE's module (`packages/watchdog/src/intercept/`
 * with `src/health/`). K3 freezes core's side (`fishballInstance.events.intercept`, `ctl`), X10 names
 * `manager.notify`, but nothing freezes Watchdog's own factory. No surface has been relayed yet
 * (2026-11-15), so this file assumes ONE shape, sent to Fishball as question 1; if the module
 * differs, only this file is adapted and no case changes.
 *
 *   openWatchdogRouting(ports) → routing
 *     ports = {
 *       events   K3 `FishballInstanceEvents` (the real F-INTERCEPT service of the world)
 *       notify   X10 `manager.notify({pluginId, dedupeKey, text, record?, wake}) → Promise`: in-session
 *                communication with Fishball (R-WD-08, design §7.2)
 *       link     core's link: `callTool(name, args) → Promise<K1 tool result>` (an answer goes out as
 *                Fishball's principal, R-INT-06), and `onResourceUpdated(listener)`, which Watchdog
 *                must never use (it has no subscription, R-WD-02)
 *       judge    WD-DECIDE's decision port (W4), stood in by the cases, called once per accepted
 *                supervised permission: `judge(event) → Promise<verdict>`, where verdict is
 *                - `{answer: {decision, reason}}`: a K1 `approval_answer` answer, which Watchdog
 *                  sends inside `ctl.commit(send)` through `link` (allow, reject or escalate), or
 *                - `{toFishball: {reasoning}}`: Watchdog cannot decide; it calls
 *                  `ctl.release(e, {toFishball: true})` and one waking `notify` carrying the
 *                  reasoning (design §7.2);
 *                a rejection is a model or provider failure (R-WD-07)
 *       logger   a cordis logger
 *     }
 *   routing = {
 *     ready()            core's X14 ready(): register the two interceptions (design §7.1 step 1)
 *     supervise(id)      a live claim on a session Fishball manages (X15; WD-PATROL owns claims in W4)
 *     unsupervise(id)    the claim ends
 *     fail(cause)        X14 fail(cause), synchronous; `cause = {kind, error}` (R-WD-07 failure kinds)
 *     dispose()          the plugin is switched off (WD-ST-01 row 7) or restarted
 *   }
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT } from './constants.mjs'

/** A module of the watchdog package bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function bound(sdk, file, owner) {
  assert.ok(fs.existsSync(file), `${path.relative(process.cwd(), file)} does not exist (${owner})`)
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** Opens one Watchdog routing over `ports`, checked against the assumed surface. */
export async function openRouting(sdk, ports) {
  const mod = await bound(sdk, SUBJECT.entry, 'WD-ROUTE "Owns" packages/watchdog/src/intercept/')
  assert.equal(typeof mod[SUBJECT.open], 'function', `src/intercept/index.js exports no ${SUBJECT.open}()`)
  const routing = await mod[SUBJECT.open](ports)
  for (const m of SUBJECT.members) assert.equal(typeof routing?.[m], 'function', `${SUBJECT.open}'s result has no ${m}()`)
  return routing
}
