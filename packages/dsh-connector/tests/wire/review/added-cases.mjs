/**
 * Rows added after Sol's review rows (cases.mjs), for requirements those rows leave out. Sol's rows
 * are not changed. The requirements are the C-WIRE brief's:
 * - item 1 (B1): after a real bundle remount, New token answers exactly {ok, entryKey, label, value},
 *   and no "already open" or "duplicate route" line is logged;
 * - item 6: the C-WIRE-2 rows, as named todos;
 * - item 7 (UIM-DT-01, connector half): with the real connector and the real dsh-connector-ui linked
 *   (no instance), dshConnectorUi is provided at app ready at apiVersion 1, embed-UI logs no
 *   connector-missing line, and its availability route answers connector: true;
 * - item 8: a wire file run with plain `node --test` exits by itself, also after a boot that fails
 *   once the worker has started (a State Transition: Started → Failed boot → Stopped, then exit).
 *
 * Techniques: Use Case (B1), State Transition (Mounted → Disabled → Remounted; boot failure → exit),
 * Decision Table (UIM-DT-01: connector installed × UI installed × instance absent).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test, { describe } from 'node:test'
import { NODE } from '../../../../../test/support/constants.mjs'
import { scenario } from '../world.mjs'
import { ENV, PACKAGES } from '../constants.mjs'
import { BUDGET, HTTP, K1, OP, SURFACE, V3_SERVICES } from './constants.mjs'
import { ADDED, CREATE_FIELDS, EXIT, LATER_ROWS, MOVED, REMOUNT_ERRORS, UI_AVAILABILITY } from './added-constants.mjs'
import { assertMetadata, remount } from './steps.mjs'

const T = Object.freeze({ timeout: BUDGET.testMs })
const SERIAL = Object.freeze({ concurrency: false })
/** One fixture run may boot, fail, stop and exit: the boot, the guard's wait and both stop waits. */
const EXIT_BUDGET_MS = BUDGET.bootMs + BUDGET.readyMs + 2 * BUDGET.stopMs
const withUi = (sdk) => scenario(sdk, ADDED.scenario.ui, { env: { [ENV.link]: JSON.stringify([{ name: PACKAGES.ui.name, dir: PACKAGES.ui.dir }]) } })
const logsAfter = async (w, offset) => (await w.call(OP.logs)).slice(offset)

/** Runs the exit fixture under plain `node --test` (no --test-force-exit) and answers how it ended. */
function plainRun(sdk, mode) {
  const run = spawnSync(NODE, ['--test', EXIT.fixture], {
    env: { ...process.env, [EXIT.sdkEnv]: sdk, [EXIT.modeEnv]: mode },
    encoding: 'utf8',
    timeout: EXIT_BUDGET_MS,
    killSignal: 'SIGKILL',
  })
  return { status: run.status, signal: run.signal, tail: (run.stdout + run.stderr).slice(-4000) }
}

export function registerAddedReviewCases(sdk) {
  describe(`C-WIRE review added rows [SDK ${sdk}]`, SERIAL, () => {
    test('B1 UC / ST (added): after a real bundle remount, New token answers exactly {ok, entryKey, label, value} and no "already open" / "duplicate route" line is logged', T, async () => {
      const w = await scenario(sdk, ADDED.scenario.b1)
      const offset = (await w.call(OP.logs)).length
      await remount(w)
      await assertMetadata(w)
      const created = await w.owner(K1.HTTP_METHOD.post, SURFACE.route.create, { label: ADDED.label })
      assert.equal(created.status, HTTP.ok, created.text)
      assert.deepEqual(Object.keys(created.json ?? {}).sort(), [...CREATE_FIELDS], created.text)
      assert.deepEqual([created.json.ok, created.json.label], [true, ADDED.label])
      for (const field of ['entryKey', 'value']) assert.equal(typeof created.json[field], 'string', field)
      const errors = (await logsAfter(w, offset)).filter((line) => REMOUNT_ERRORS.some((re) => re.test(line.text)))
      assert.deepEqual(errors, [], 'the remount logged an already-open or duplicate-route line')
    })

    test('UIM-DT-01 DT (connector half): real connector + real dsh-connector-ui, no instance → dshConnectorUi at app ready at apiVersion 1; no connector-missing line; availability answers connector: true', T, async () => {
      const w = await withUi(sdk)
      const atReady = w.dsh.atReady.services[SURFACE.service.ui]
      assert.deepEqual([atReady?.present, atReady?.apiVersion], [true, SURFACE.apiVersion], 'dshConnectorUi at app ready: ' + JSON.stringify(atReady))
      assert.equal((await w.call(OP.services, { names: ['dshInstanceChild'] })).dshInstanceChild.present, false, 'an instance is installed')
      const availability = await w.owner(K1.HTTP_METHOD.get, UI_AVAILABILITY.route)
      assert.equal(availability.status, HTTP.ok, availability.text)
      assert.equal(availability.json?.[UI_AVAILABILITY.connectorField], true, availability.text)
      const missing = (await w.call(OP.logs)).filter((line) => line.text.includes(UI_AVAILABILITY.missing))
      assert.deepEqual(missing, [], 'embed-UI logged connector-missing with the V3 connector loaded')
    })

    test('UIM-DT-01 DT (connector half, every V3 service): the same boot provided all four V3 services at app ready, each at apiVersion 1', T, async () => {
      const w = await withUi(sdk)
      for (const name of V3_SERVICES) {
        const s = w.dsh.atReady.services[name]
        assert.deepEqual([s?.present, s?.apiVersion], [true, SURFACE.apiVersion], name + ': ' + JSON.stringify(s))
      }
    })

    for (const [mode, title] of [[EXIT.mode.ok, 'after a normal boot'], [EXIT.mode.fail, 'after a boot that fails once the worker started (the services guard)']]) {
      test(`HARNESS ST (added): a wire file under plain node --test exits by itself ${title}`, T, () => {
        const run = plainRun(sdk, mode)
        assert.equal(run.signal, null, 'the run did not exit within its budget and was killed:\n' + run.tail)
        assert.equal(run.status, EXIT.exitedOk, run.tail)
      })
    }
  })

  for (const name of LATER_ROWS) test(`${name} [SDK ${sdk}]`, { skip: MOVED }, () => {})
}
