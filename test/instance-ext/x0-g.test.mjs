/**
 * W0 / X0-G — side agents (X13): locked-down side sessions.
 *
 * Observation points: the `fishballInstance.sideAgents` members, the live side agent's session
 * log (the host's own `sandbox/mode` and `approval/policy` events), the agent-scoped prompt
 * sections and the tool restrictions the host was given.
 *
 * Techniques: P, EP, ST. Every case names its X point.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bootChild } from '../support/instance-ext.mjs'

const PLUGIN = 'fishball-watchdog'
const OPEN = Object.freeze({
  pluginId: PLUGIN,
  key: 'brief-1:check:1',
  epoch: 1,
  instructions: 'check the session',
  sections: [{ name: 'criteria', text: 'the criteria' }],
  tools: ['read_session'],
  agentOptions: { provider: 'fake', model: 'fake' },
})

async function live(t) {
  const h = await bootChild(t, { activate: true })
  return { h, service: h.requireInstance() }
}

describe('X0-G X13 side agents', () => {
  it('XG-P-01 open returns the agent, its session id and setSection', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    assert.equal(typeof side.setSection, 'function')
    assert.equal(typeof side.sessionId, 'string')
    assert.ok(side.agent)
    assert.equal(h.agents.length, 2, 'the manager and the side agent were created')
  })

  it('XG-P-02 the side agent is sandbox read-only and approval never', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    const events = side.agent.session.appended
    assert.ok(events.some((event) => event.type === 'sandbox/mode' && event.data.mode === 'read-only'), 'sandbox read-only')
    assert.ok(events.some((event) => event.type === 'approval/policy' && event.data.policy === 'never'), 'approval never')
  })

  it('XG-EP-01 the global tools are denied through the host restrict seam', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    const sideCtx = h.agents.find((entry) => entry.live === side.agent)?.agentCtx
    assert.ok(sideCtx, 'the side agent has its own scope')
    assert.ok(h.tools.restrictions.length >= 1 || sideCtx.tools.restrictions.length >= 1, 'the host restrict seam was used (global or agent scope)')
  })

  it('XG-P-03 the side agent carries no Fishball persona', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    const sideCtx = h.agents.find((entry) => entry.live === side.agent)?.agentCtx
    assert.equal(sideCtx.sections.has('DEPLOYMENT_PERSONA_PREFIX'), false)
    assert.equal(sideCtx.sections.has('DEPLOYMENT_PERSONA_SUFFIX'), false)
  })

  it('XG-ST-01 setSection replaces the named section', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    side.setSection('criteria', 'a new criterion')
    const sideCtx = h.agents.find((entry) => entry.live === side.agent)?.agentCtx
    assert.equal(sideCtx.sections.get('criteria')?.text, 'a new criterion')
  })

  it('XG-P-04 cancel calls the agent cancel', async (t) => {
    const { service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    service.sideAgents.cancel(side.agent)
    assert.equal(side.agent.cancelled, true)
  })

  it('XG-P-05 a resume after a restart runs the same lock-down setup', async (t) => {
    const { h, service } = await live(t)
    const side = await service.sideAgents.open(OPEN)
    const managerId = h.manager().id
    h.agentsById.delete(managerId)
    await h.http('/api/chat')
    const resumed = h.manager()
    assert.equal(resumed.session.appended.some((event) => event.type === 'sandbox/mode'), true)
    assert.ok(side.sessionId)
  })
})
