/** The registry is not evidence of admission; observe the tools actually offered to the model. */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { NATIVE_MANAGER } from '../support/core-world.mjs'
import { C } from './constants.mjs'
import { bootWire } from './world.mjs'

const TEAM_TOOLS = Object.freeze(['team_task_create', 'team_task_get', 'team_task_list', 'team_task_update'])
const PROBE = Object.freeze({ name: 'fbtest_guard_probe', description: 'Return a fixed guard test marker' })
const WITH_PROBE = Object.freeze([PROBE.name])
const WITH_TEAM = Object.freeze([...WITH_PROBE, ...TEAM_TOOLS].sort())
const TEST = Object.freeze({ timeout: C.budget.boot + C.budget.call * 4 })
function assertOffered(request, extra) {
  assert.ok(request, 'the scripted model did not receive the probe turn')
  const nonCore = request.tools.filter((name) => !C.coreTools.includes(name) && !C.privateSkill.test(name)).sort()
  assert.deepEqual(nonCore, [...C.baseTools, ...extra].sort())
}

export function registerGuardAdmissionCases() {
  caseTest('CORE-WIRE-B1', 'admission transition', 'Team tools are offered only when admitted in the manager model step', TEST, async (t) => {
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

    assert.deepEqual(await requests(), [], 'startup had no manager model step')
    const turn = async (extra) => assertOffered((await h.call('turn', scope))[C.first], extra)
    await turn([])

    await setTeam(true)
    await h.call('registerGuardProbe', { ...scope, ...PROBE })
    await turn(WITH_TEAM)

    await setTeam(false)
    await turn(WITH_PROBE)
  })
}
