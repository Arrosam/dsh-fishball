/** CORE-WIRE-B1 (R-FB-13): the model request, not the registry, is evidence of step admission. */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { until } from 'fishball-test-helpers/wait'
import { GUARDS } from '../../contracts/constants.js'
import { NATIVE_MANAGER } from '../support/core-world.mjs'
import { C } from './constants.mjs'
import { bootWire } from './world.mjs'

const TEAM_TOOLS = Object.freeze(['team_task_create', 'team_task_get', 'team_task_list', 'team_task_update'])
const PROBE = Object.freeze({ name: 'fbtest_guard_probe', description: 'Return a fixed guard test marker' })
const WITH_PROBE = Object.freeze([PROBE.name])
const WITH_TEAM = Object.freeze([...WITH_PROBE, ...TEAM_TOOLS].sort())
const TEST = Object.freeze({ timeout: C.budget.boot + C.budget.call * 4 })
const expectedReport = (extraManagerTools) => ({
  status: extraManagerTools.length ? GUARDS.status.overridden : GUARDS.status.ok,
  overridden: extraManagerTools.length ? [GUARDS.code.managerTools] : [],
  extraManagerTools,
  missingManagerTools: [],
})

async function waitReport(h, ready, phase) {
  let report
  await until(async () => { report = await h.call('guards'); return ready(report) }, C.budget.call, C.budget.poll)
  assert.ok(ready(report), phase + ': ' + JSON.stringify(report))
  return report
}

function assertOffered(request, extra) {
  assert.ok(request, 'the scripted model did not receive the probe turn')
  const nonCore = request.tools.filter((name) => !C.coreTools.includes(name) && !C.privateSkill.test(name)).sort()
  assert.deepEqual(nonCore, [...C.baseTools, ...extra].sort())
}

export function registerGuardAdmissionCases() {
  caseTest('CORE-WIRE-B1', 'admission transition', 'reports only tools admitted to the current manager model step', TEST, async (t) => {
    const h = await bootWire({ profileConfig: NATIVE_MANAGER })
    t.after(() => h.stop())
    const { id: sessionId } = await h.call('ensure')
    const scope = { sessionId }
    const mode = await h.call('managerTeamMode', scope)
    if (!mode) return t.skip('This DSH does not ship the native Team service')
    assert.equal(mode.enabled, false, 'Team mode defaults to off')
    for (const name of TEAM_TOOLS) assert.ok(mode.registered.includes(name), 'registered for the manager: ' + name)
    const requests = () => h.call('requests', scope)
    const setTeam = async (enabled) => assert.equal(await h.call('setManagerTeamMode', { ...scope, enabled }), enabled)
    const mutateModel = async (op) => assert.deepEqual(await h.call('mutate', { ns: C.core, ops: [{ path: C.modelSeam.path, ...op }] }), { ok: true })

    const startup = await waitReport(h, (report) => report !== null, 'at app ready')
    assert.deepEqual(startup, expectedReport([]), 'the registered Team tools did not override startup guards')
    assert.deepEqual(await requests(), [], 'startup had no manager model step')
    const turn = async (extra) => assertOffered((await h.call('turn', scope))[C.first], extra)
    await turn([])
    assert.deepEqual(await h.call('guards'), expectedReport([]), 'Team off at a real model step')

    await setTeam(true)
    await h.call('registerGuardProbe', { ...scope, ...PROBE })
    const beforeEdit = (await requests()).length
    await mutateModel({ op: 'set', value: C.selection })
    // The unconditional extra makes a fresh report distinguishable from the earlier ok report.
    const idleReport = await waitReport(h, (report) => report?.extraManagerTools.includes(PROBE.name), 'config check before the Team step')
    assert.deepEqual(idleReport, expectedReport(WITH_PROBE), 'Team on does not admit conditional tools without a step')
    assert.equal((await requests()).length, beforeEdit, 'the config edit did not create a model step')

    // Hold the real step open while observing the report. The fake records the request on release.
    await h.call('startTurn', { ...scope, holdAt: C.one })
    try {
      assert.ok(await until(() => h.call('held', scope), C.budget.call, C.budget.poll), 'the model step was never held')
      const activeReport = await waitReport(h, (report) => report?.extraManagerTools.includes(TEAM_TOOLS[C.first]), 'during the Team model step')
      assert.deepEqual(activeReport, expectedReport(WITH_TEAM))
    } finally {
      await h.call('release', scope)
    }
    assert.equal(await h.call('idle', scope), true)
    const afterStep = await requests()
    assertOffered(afterStep[beforeEdit], WITH_TEAM)

    await mutateModel({ op: 'unset' })
    const cleared = await waitReport(h, (report) => report?.extraManagerTools.length === WITH_PROBE.length, 'config check after the Team step')
    assert.deepEqual(cleared, expectedReport(WITH_PROBE), 'a completed step does not keep its tools admitted')
    assert.equal((await requests()).length, afterStep.length, 'the config recheck had no model step')
    await setTeam(false)
    await turn(WITH_PROBE)
  })
}
