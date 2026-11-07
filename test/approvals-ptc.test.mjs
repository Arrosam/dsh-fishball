/**
 * P7 P11 on the H-STUB harness: in PTC tool mode a managed session reaches tools through run_code; a request asked
 * by an inner call shows THAT inner call's arguments (DSH gives inner calls the id '<outer>:ptc:<n>'; DESIGN §7a.4
 * "Calls inside run_code", §7a.14). The instance reads them in the descriptor (contract §5.1) and the notice.
 * PTC needs DSH 0.2.1's DSH_TOOLS_MODE switch; on a build without run_code the case is skipped with the reason.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | PTA-01 | EP (inner call of run_code) | P11 | the descriptor's callId is the inner id, argumentsStatus complete, arguments equal to the inner call's JSON (not run_code's code); the item says 'Arguments: complete'; allow → allowed-once inside the program |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ARGS_STATUS, ASK_TOOL, OUTCOME } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import { APPROVALS, answerOffer, bootApprovals, itemFor, offerFor, outcomeOf, ptcOffered } from './support/instance-stub-approvals.mjs'

describe('P7 run_code inner calls (PTC mode, H-STUB)', () => {
  let booted
  let x
  before(async () => {
    booted = await bootApprovals('approvals-ptc', { env: APPROVALS.ptcEnv })
    x = await managedSession(booted.host, 'ptc-x')
    await booted.host.call('setSandboxMode', { sessionId: x, mode: APPROVALS.ptcSandboxMode })
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('PTA-01 the request shows the inner call\'s arguments', T, async (t) => {
    if (!(await ptcOffered(booted.host, x))) return t.skip(APPROVALS.skip.ptcRuntime)
    const { host, stub } = booted
    const text = 'PTA01' + Math.random().toString(36).slice(2, 8)
    const inner = { text, pad: 'inner-pad' }
    const code = 'return await tools.' + ASK_TOOL + '(' + JSON.stringify(inner) + ')'
    await host.call('driveStart', { sessionId: x, text: 'fbtest ask turn', script: [[{ tool: APPROVALS.runCode, args: { code, description: 'fbtest inner ask' } }], [{ text: 'done' }]] })
    const frame = await offerFor(stub, text)
    assert.ok(frame, 'the inner request reached the instance')
    const d = frame.payload
    assert.equal(d.toolName, ASK_TOOL)
    assert.equal(d.argumentsStatus, ARGS_STATUS.complete)
    assert.deepEqual(JSON.parse(d.arguments), inner)
    const item = await itemFor(stub, d.approvalId)
    assert.ok(item.header.includes(APPROVALS.item.argumentsLine(ARGS_STATUS.complete)), item.header)
    assert.deepEqual(JSON.parse(item.fields.arguments), inner)
    assert.equal(item.fields.tool, ASK_TOOL)
    assert.deepEqual((await answerOffer(stub, frame.sessionId, d, APPROVALS.answer.allow())).payload, { accepted: true })
    const call = await outcomeOf(host, text)
    assert.match(call.callId, /:ptc:/, 'an inner call id')
    assert.equal(d.callId, call.callId, "the descriptor names the inner call")
    assert.equal(call.outcome, OUTCOME.allow)
  })
})
