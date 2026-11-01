/**
 * P7 P11: in PTC tool mode an ordinary session reaches tools through run_code; a request asked by an
 * inner call shows THAT inner call's arguments (DSH gives inner calls the id '<outer>:ptc:<n>').
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | PTA-01 | EP (inner call of run_code) | P11 | the request shows 'Arguments: complete' and arguments equal to the inner call's JSON, not run_code's code; allow → allowed-once inside the program |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_TOOL, OUTCOME, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, T, askSettled, settledIdle, startAsk, turn, waitRequest, makeManaged } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'

describe('P7 run_code inner calls (PTC mode)', () => {
  let host
  let fb
  let x
  before(async () => {
    host = await bootHost(newHome('approvals-ptc'), { env: { ...APPROVER_AFTER_ENV, DSH_TOOLS_MODE: 'ptc' } })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    x = (await host.call('ordinary', { preset: PRESET.bare, folder: 'ptc-x' })).sessionId
    await turn(host, x, [[{ text: 'hello' }]], 'first words')
    // rev11a: only a managed session's permission requests reach Fishball (DESIGN §7a.1).
    await makeManaged(host, fb, x)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PTA-01 the request shows the inner call\'s arguments', T, async () => {
    const text = 'PTA01' + Math.random().toString(36).slice(2, 8)
    const inner = { text, pad: 'inner-pad' }
    await host.call('planApproval', { sessionId: fb, needle: text, args: { decision: 'allow', risk: 'low', reason: 'fine' } })
    const code = 'return await tools.' + ASK_TOOL + '(' + JSON.stringify(inner) + ')'
    await startAsk(host, x, 'run_code', { code, description: 'fbtest inner ask' })
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'the inner request reached Fishball')
    assert.ok(req.block.header.includes('Arguments: complete'), req.block.header)
    assert.deepEqual(JSON.parse(req.block.fields.arguments), inner)
    assert.equal(req.block.fields.tool, ASK_TOOL)
    const done = await askSettled(host, text)
    assert.match(done.callId, /:ptc:/, 'an inner call id')
    assert.equal(done.outcome, OUTCOME.allow)
  })
})
