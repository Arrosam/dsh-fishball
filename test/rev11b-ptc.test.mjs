/**
 * Revision 11 rev11b on the H-STUB harness: the connector's wording for calls made inside run_code (DESIGN §7a.4
 * "Calls inside run_code"; S35 "PTC"). run_code hands the program an inner call's value, not its text, so an
 * allowed inner call's hint arrives as a separate context message (source fishball-notice) after the run_code
 * result; a reject and the instance's question arrive as the inner call's thrown error. The instance (the stub)
 * answers through `approval.answer`. Host boots in PTC tool mode (DSH 0.2.1's DSH_TOOLS_MODE=ptc) with
 * FBTEST_APPROVER_AFTER=1; on a build without run_code the cases are skipped with the reason. One host; cases run
 * in order.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | PTC-01  | EP (inner call allowed) | the program gets the plain value (no hint in the run_code result); the agent's next request has, after that result, a message of source fishball-notice carrying the hint; the session log holds that notice |
 * | PTC-02  | EP (inner call rejected) | the program catches an error whose message is exactly "Fishball rejected this call: <reason>\nNext time, call ask_fishball …" |
 * | PTC-03  | EP (the instance asks on an inner call) | the program catches an error naming the request id and the question and pointing to ask_fishball |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_OUTPUT, ASK_TOOL, HINT_ALLOWED, NOTICE, OUTCOME, REJECTED_TEXT } from './support/constants.mjs'
import { HOOK, T, resultById, step, turn } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import { APPROVALS, answerWhen, bootApprovals, mentions, ptcOffered, tok } from './support/instance-stub-approvals.mjs'

const THREW = 'THREW: '
/** The program's value may come back as text or JSON text; a needle with a newline is then escaped. */
const carries = (text, needle) => text.includes(needle) || text.includes(JSON.stringify(needle).slice(1, -1))
/** A program that makes one inner call of the asking tool and returns its value, or the caught error's message. */
const program = (args) => 'try { return await tools.' + ASK_TOOL + '(' + JSON.stringify(args) + ') } catch (e) { return ' + JSON.stringify(THREW) + ' + e.message }'

describe('Revision 11 rev11b: calls inside run_code (H-STUB)', () => {
  let booted
  let host
  let x
  let ptc = false
  /** One turn whose model runs the program once while the stub answers its inner request; returns the result, the requests and the offer. */
  async function runCode(args, answer) {
    const answered = answerWhen(booted.stub, mentions(args.text), answer)
    const id = 'call_' + tok('run')
    const r = await turn(host, x, [step(APPROVALS.runCode, { code: program(args), description: 'fbtest inner ask' }, id), [{ text: 'done' }]])
    const offer = await answered
    assert.ok(offer, 'the inner call reached the instance')
    assert.equal(offer.reply.type, 'response', JSON.stringify(offer.reply))
    const result = resultById(r, id)
    assert.ok(result, 'a run_code result: ' + JSON.stringify(r.results))
    return { result, requests: r.requests, offer }
  }
  const needPtc = (t) => (ptc ? false : (t.skip(APPROVALS.skip.ptcRuntime), true))

  before(async () => {
    booted = await bootApprovals('rev11b-ptc', { env: APPROVALS.ptcEnv })
    host = booted.host
    x = await managedSession(host, 'ptc-x')
    await host.call('setSandboxMode', { sessionId: x, mode: APPROVALS.ptcSandboxMode })
    ptc = await ptcOffered(host, x)
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('PTC-01 an allowed inner call: the plain value, then a separate Fishball notice with the hint', T, async (t) => {
    if (needPtc(t)) return
    const text = tok('P01')
    const { result, requests } = await runCode({ text }, APPROVALS.answer.allow())
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

  it('PTC-02 a rejected inner call: the program catches the instance\'s reason and the hint', T, async (t) => {
    if (needPtc(t)) return
    const text = tok('P02')
    const reason = 'touches files outside the workspace ' + text
    const { result } = await runCode({ text }, APPROVALS.answer.reject(reason))
    assert.ok(carries(result.text, THREW + REJECTED_TEXT(reason)), 'the thrown message: ' + result.text)
  })

  it('PTC-03 the instance asks on an inner call: the program catches the question with the request id', T, async (t) => {
    if (needPtc(t)) return
    const text = tok('P03')
    const question = 'what is this for? ' + text
    const { result, offer } = await runCode({ text }, APPROVALS.answer.ask(question))
    const requestId = offer.frame.payload.approvalId
    assert.ok(result.text.includes(THREW), 'thrown: ' + result.text)
    assert.ok(result.text.includes(requestId), 'names the request id')
    assert.ok(carries(result.text, question), 'carries the question')
    assert.match(result.text, APPROVALS.askFishballWord)
  })
})
