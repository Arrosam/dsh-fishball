/**
 * Revision 11 rev11b: Fishball's wording for calls made inside run_code (DESIGN §7a.4 "Calls inside run_code";
 * S35 "PTC"). run_code hands the program an inner call's value, not its text, so an allowed inner call's hint
 * arrives as a separate context message (source fishball-notice) after the run_code result; a reject and
 * Fishball's question arrive as the inner call's thrown error. Host boots in PTC tool mode (DSH_TOOLS_MODE=ptc)
 * with FBTEST_APPROVER_AFTER=1. One host; cases run in order. Expected values come from the requirements
 * (CASES.md "Revision 11 rev11b cases"), never the implementation.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PTC-01  | EP (inner call allowed) | the program gets the plain value (no hint in the run_code result); the agent's next request has, after that result, a message of source fishball-notice carrying the hint; the session log holds that notice |
 * | PTC-02  | EP (inner call rejected) | the program catches an error whose message is exactly "Fishball rejected this call: <reason>\nNext time, call ask_fishball …" |
 * | PTC-03  | EP (Fishball asks on an inner call) | the program catches an error naming the request id and the question and pointing to ask_fishball |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { APPROVER_AFTER_ENV, ASK_OUTPUT, ASK_TOOL, DECISION, HINT_ALLOWED, NOTICE, OUTCOME, REJECTED_TEXT, STATUS, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, managedSession, requestMessages, resultById, settledIdle, step, turn } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'

let seq = 0
const tok = (label) => 'PTC' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)
const THREW = 'THREW: '
/** The program's value may come back as text or JSON text; a needle with a newline is then escaped. */
const carries = (text, needle) => text.includes(needle) || text.includes(JSON.stringify(needle).slice(1, -1))
/** A program that makes one inner call of the asking tool and returns its value, or the caught error's message. */
const program = (args) => 'try { return await tools.' + ASK_TOOL + '(' + JSON.stringify(args) + ') } catch (e) { return ' + JSON.stringify(THREW) + ' + e.message }'

describe('Revision 11 rev11b: calls inside run_code', { skip: NEEDS_INSTANCE_STUB }, () => {
  let host
  let fb
  let x
  const plan = (needle, args) => host.call('planApproval', { sessionId: fb, needle, args })
  /** One turn whose model runs the program once; returns the run_code result and the turn's requests. */
  async function runCode(args) {
    await settledIdle(host, x)
    const id = 'call_' + tok('run')
    const r = await turn(host, x, [step('run_code', { code: program(args), description: 'fbtest inner ask' }, id), [{ text: 'done' }]])
    const result = resultById(r, id)
    assert.ok(result, 'a run_code result: ' + JSON.stringify(r.results))
    return { result, requests: r.requests }
  }

  before(async () => {
    host = await bootHost(newHome('rev11b-ptc'), { env: { ...APPROVER_AFTER_ENV, DSH_TOOLS_MODE: 'ptc' } })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
    x = await managedSession(host, fb, 'ptc-x')
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('PTC-01 an allowed inner call: the plain value, then a separate Fishball notice with the hint', T, async () => {
    const text = tok('01')
    await plan(text, { decision: DECISION.allow, risk: 'low', reason: 'fine' })
    const { result, requests } = await runCode({ text })
    assert.ok(carries(result.text, ASK_OUTPUT(OUTCOME.allow)), 'the inner value: ' + result.text)
    assert.equal(result.text.includes(THREW), false)
    assert.equal(result.text.includes(HINT_ALLOWED), false, 'the hint is not in the run_code result')
    const next = requests.at(-1)
    const at = next.last.findIndex((m) => m.text.includes(ASK_OUTPUT(OUTCOME.allow)))
    assert.ok(at >= 0, 'the run_code result is in the next request: ' + JSON.stringify(next.last.map((m) => [m.role, m.source, m.text.slice(0, 80)])))
    const notice = next.last.slice(at + 1).find((m) => m.text.includes(HINT_ALLOWED))
    assert.ok(notice, 'a message after the result carries the hint: ' + JSON.stringify(next.last.map((m) => [m.role, m.source, m.text.slice(0, 120)])))
    assert.equal(notice.source, NOTICE.kind, 'its source is a Fishball notice')
    assert.ok((await host.call('userMessageLog', { sessionId: x })).some((m) => m.kind === NOTICE.kind && m.text.includes(HINT_ALLOWED)), 'the notice is in the session log')
  })

  it('PTC-02 a rejected inner call: the program catches Fishball\'s reason and the hint', T, async () => {
    const text = tok('02')
    const reason = 'touches files outside the workspace ' + text
    await plan(text, { decision: DECISION.reject, risk: 'high', reason })
    const { result } = await runCode({ text })
    assert.ok(carries(result.text, THREW + REJECTED_TEXT(reason)), 'the thrown message: ' + result.text)
  })

  it('PTC-03 Fishball asks on an inner call: the program catches the question with the request id', T, async () => {
    const text = tok('03')
    const question = 'what is this for? ' + text
    await plan(text, { decision: DECISION.ask, risk: 'high', reason: 'unclear', question })
    const { result } = await runCode({ text })
    const requestId = /\[permission request (apr_[0-9a-f]+)\]/.exec((await requestMessages(host, fb, text))[0]?.text ?? '')?.[1]
    assert.ok(requestId, 'the inner call reached Fishball')
    assert.ok(result.text.includes(THREW), 'thrown: ' + result.text)
    assert.ok(result.text.includes(requestId), 'names the request id')
    assert.ok(carries(result.text, question), 'carries the question')
    assert.match(result.text, /ask_fishball/)
  })
})
