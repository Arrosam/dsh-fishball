/**
 * The one place that binds the WD-ROUTE cases to WD-ROUTE's modules, by the surface the dev session
 * relayed through Fishball (2026-11-15). The cases drive one `routing` port; this file maps it
 * onto the real modules and changes no expectation.
 *
 * Real surface (packages/watchdog/src/intercept/index.js, src/health/index.js):
 *   createRouting({instance, pluginId, logger, decide?, onOutcome?, newKey?}) → {health, supervision, dispose}
 *     - `instance` is core's `fishballInstance` (apiVersion 1): `events.intercept` (K3) and the X10
 *       `manager.notify` that carries "watchdog is down" (R-WD-08);
 *     - two interceptions at the default priority: `permission` (filter: healthy and
 *       `supervision.isClaimed(e.sourceSessionId)`), and `settlement` / `retirement` (filter: healthy and
 *       `supervision.holds(e.correlationId)`); each handler awaits `ctl.accept()` and acts only on true;
 *     - a permission calls `decide(e, ctl)`; an outcome calls `supervision.forget(correlationId)`, then
 *       `onOutcome`; a throwing decide / onOutcome fails health `runtime`, a throwing intercept `registration`.
 *   supervision: claim, release, isClaimed, hold, forget, holds, clear.
 *   health: state, isHealthy, ready, fail(cause), off, onOff; `HEALTH` {starting, healthy, down, off} and
 *   `CAUSE` are the health module's exports. `fail` is synchronous; one notice per episode.
 *
 * The cases' ports, and how each reaches the real modules:
 *   events, notify   become `instance` = {apiVersion: 1, events, manager: {notify}}
 *   link, judge      WD-DECIDE (W4) is not built, so `decide` here is its stand-in. It holds the offer
 *                    (`supervision.hold`, design §6.4 "offers it held or escalated"), then takes the
 *                    judge's verdict:
 *                    - `{answer}`: `ctl.commit(send)`, where send is K1 `approval_answer` on `link`, as
 *                      Fishball's principal (R-INT-06); the hold stays for the settlement;
 *                    - `{toFishball: {reasoning}}`: the offer is Fishball's now (`forget`), then
 *                      `ctl.release(e, {toFishball: true})` and one waking `notify` carrying the
 *                      reasoning (design §7.2);
 *                    a rejected judgement throws out of decide (a model failure, R-WD-07).
 *   logger           passed through.
 * The routing the cases drive:
 *   ready()          core's X14 ready(): `createRouting` (its interceptions), then `health.ready()` unless
 *                    the registration already failed it. Creating it here, not at open, lets a case refuse
 *                    the registration first (WD-ST-01 row 2).
 *   supervise(id)    `supervision.claim(id)`;  unsupervise(id)  `supervision.release(id)`
 *   fail({kind})     `health.fail(CAUSE[…])`, `kind` one of R-WD-07's failure kinds (CAUSE_OF_KIND)
 *   dispose()        the owner switches the plugin off: `health.off()`, then the routing's `dispose()`
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { INSTANCE } from '../../support/constants.mjs'
import { importInstance } from '../../private-skills/support/sdk.mjs'
import { SUBJECT as CASES_SUBJECT, TOOL, V3 } from './constants.mjs'

/** The relayed surface: entries, factory and result members (the cases' SUBJECT keeps its own paths). */
const SUBJECT = Object.freeze({
  entry: CASES_SUBJECT.entry,
  health: path.join(path.dirname(path.dirname(CASES_SUBJECT.entry)), 'health', 'index.js'),
  open: 'createRouting',
  members: Object.freeze(['health', 'supervision', 'dispose']),
})

/** K3 `fishballInstance.apiVersion`. */
const API_VERSION = 1
/** The `toFishball` option of K3 `ctl.release`. */
const TO_FISHBALL = Object.freeze({ toFishball: true })

/**
 * The cases name R-WD-07's failure kinds in its own words; CAUSE spells two of them differently:
 * "loss of its interception registration" is `registrationLost` (CAUSE's `registration` is a
 * refused registration at ready, which WD-ST-01 row 2 drives through the events port), and
 * "model or provider error" is one cause, `model`. Every other kind has its own name.
 */
const CAUSE_OF_KIND = Object.freeze({ registration: 'registrationLost', provider: 'model' })

/** A module of the watchdog package bound to `sdk` (its `@deepseek-ai/*` imports resolve to that SDK). */
async function bound(sdk, file, owner) {
  assert.ok(fs.existsSync(file), `${path.relative(process.cwd(), file)} does not exist (${owner})`)
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}
const valueOf = (member) => (typeof member === 'function' ? member() : member)

/** WD-DECIDE's stand-in over the cases' judge and link (see the header). */
function standInDecide({ judge, link, notify }, supervision) {
  return async (event, ctl) => {
    supervision().hold(event.correlationId)
    const verdict = await judge(event)
    if (verdict.toFishball) {
      supervision().forget(event.correlationId)
      await ctl.release(event, TO_FISHBALL)
      await notify({ pluginId: V3.watchdog.name, dedupeKey: `${V3.watchdog.name}:reasoning:${event.eventId}`, text: verdict.toFishball.reasoning, wake: true })
      return
    }
    await ctl.commit(() => link.callTool(TOOL.approvalAnswer, {
      sessionId: event.sourceSessionId, approvalId: event.payload.approvalId, offerId: event.offer.offerId, answer: verdict.answer,
    }))
  }
}

/** Opens one Watchdog routing over the cases' ports (not yet ready; see `ready()`). */
export async function openRouting(sdk, ports) {
  const [mod, healthMod] = await Promise.all([
    bound(sdk, SUBJECT.entry, 'WD-ROUTE "Owns" packages/watchdog/src/intercept/'),
    bound(sdk, SUBJECT.health, 'WD-ROUTE "Owns" packages/watchdog/src/health/'),
  ])
  assert.equal(typeof mod[SUBJECT.open], 'function', `src/intercept/index.js exports no ${SUBJECT.open}()`)
  const { HEALTH, CAUSE } = healthMod
  assert.ok(HEALTH && CAUSE, 'src/health/index.js exports no HEALTH or CAUSE')
  let real
  const instance = { apiVersion: API_VERSION, events: ports.events, manager: { notify: ports.notify } }
  const decide = standInDecide(ports, () => real.supervision)
  const live = () => {
    assert.ok(real, 'the routing was used before ready()')
    return real
  }
  return {
    async ready() {
      real = await mod[SUBJECT.open]({ instance, pluginId: V3.watchdog.name, logger: ports.logger, decide })
      for (const m of SUBJECT.members) assert.ok(real?.[m] !== undefined, `${SUBJECT.open}'s result has no ${m}`)
      if (valueOf(real.health.state) !== HEALTH.down) await real.health.ready()
    },
    supervise: async (id) => live().supervision.claim(id),
    unsupervise: async (id) => live().supervision.release(id),
    fail({ kind }) {
      const key = CAUSE_OF_KIND[kind] ?? kind
      assert.ok(Object.hasOwn(CAUSE, key), `CAUSE has no ${key} (R-WD-07 names it a failure kind)`)
      live().health.fail(CAUSE[key])
    },
    async dispose() {
      if (!real) return
      const done = real
      real = undefined
      done.health.off()
      await done.dispose()
    },
  }
}
