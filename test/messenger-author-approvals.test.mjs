/**
 * P11 R4 for permission requests: the request message's author and the author of Fishball's short,
 * non-waking note after the user answers a request Fishball passed on. One host with the scripted
 * answerer standing in for the browser prompt AFTER the broker (FBTEST_APPROVER_AFTER=1, as in P7) and
 * DSH's title cap raised (FBTEST_TITLE_MAX_BYTES).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | AUT-14 | EP (session S asks; Fishball escalates) | the request message's source = {fishball-notice, notice, 'Permission request: "fbtest_ask"', author: {kind:'approval', name: S's title, seed: S}}; text unchanged ('[permission request apr_…]') |
 * | AUT-15 | EP (the user answers the escalated request) | the note in Fishball's next turn has author exactly {kind:'system'} |
 * | AUT-16 | EP (Fishball does not answer in time; the user answers) | the timeout note has author exactly {kind:'system'} |
 * | AUT-17 | BVA (S's title 201 ASCII bytes) | the approval author's name is cut to at most 200 bytes ending with '…' |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import {
  APPROVAL_PREFIX, APPROVAL_SUMMARY, APPROVER_AFTER_ENV, APR_NOTE, ASK_TOOL, AUTHOR_KIND, AUTHOR_NAME_MAX_BYTES, ELLIPSIS, LIMITS, NOTICE, OUTCOME, PRESET,
  STATUS, TITLE_ENV,
} from './support/constants.mjs'
import { HOOK, T, askSettled, fishballMessages, settledIdle, startAsk, turn, waitRequest, makeManaged } from './support/expect.mjs'
import { bootHost, newHome, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'APR' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 7)

describe('P11 authors of permission requests and their notes', () => {
  let host
  let fb
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const plan = (needle, args, callId) => host.call('planApproval', { sessionId: fb, needle, args, callId })
  const rename = async (sid, title) => {
    const r = await host.call('renameSession', { sessionId: sid, title })
    assert.equal(r.ok, true, 'rename: ' + JSON.stringify(r.error))
    assert.equal(await host.call('sessionTitle', { sessionId: sid }), title, 'precondition: DSH reports the title as given')
  }
  const named = async (folder, title) => {
    const sid = (await host.call('ordinary', { preset: PRESET.bare, folder })).sessionId
    await turn(host, sid, [[{ text: 'hello' }]], 'first words')
    await rename(sid, title)
    // rev11a: only a managed session's permission requests reach Fishball (DESIGN §7a.1).
    await makeManaged(host, fb, sid)
    return sid
  }
  async function asked(sid, text) {
    await settledIdle(host, sid)
    await startAsk(host, sid, ASK_TOOL, { text })
    const req = await waitRequest(host, fb, text)
    assert.ok(req, 'a permission request reached Fishball for ' + text)
    return req
  }
  /** The injected note reaches Fishball's log with its next turn; returns the one message containing every needle. */
  async function noteAfterNextTurn(needles) {
    await settledIdle(host, fb)
    await turn(host, fb, [[{ text: 'ok' }]])
    const got = (await fishballMessages(host, fb, needles[0])).filter((m) => needles.every((n) => m.text.includes(n)))
    assert.equal(got.length, 1, 'one note containing ' + JSON.stringify(needles))
    return got[0]
  }

  before(async () => {
    host = await bootHost(newHome('messenger-approvals'), { env: { ...APPROVER_AFTER_ENV, ...TITLE_ENV } })
    fb = (await host.waitStatus(STATUS.live))?.sessionId
    assert.ok(fb, 'precondition: live')
    await settledIdle(host, fb)
    await host.call('setApprover', { outcome: OUTCOME.reject })
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  let escalated
  it('AUT-14 a permission request: author kind approval with the asking session\'s title', T, async () => {
    const title = 'Asker "x" <i>' + tok('t') + '</i>'
    const x = await named('aut-14', title)
    const text = tok('14')
    // The stand-in holds the question, so the user's answer comes after Fishball's turn has ended (AUT-15).
    await host.call('setApprover', { outcome: 'hold' })
    await plan(text, { decision: 'escalate', risk: 'high', reason: 'no allowance' }, 'call_aut14')
    const req = await asked(x, text)
    escalated = { x, text, req }
    assert.deepEqual(req.source, { ...NOTICE, summary: APPROVAL_SUMMARY(ASK_TOOL), author: { kind: AUTHOR_KIND.approval, name: title, seed: x } })
    assert.match(req.text, APPROVAL_PREFIX, 'the text is unchanged')
  })

  it('AUT-15 the note after the user answers an escalated request: author {kind: system}', T, async () => {
    assert.ok(escalated, 'precondition: AUT-14 ran')
    const { x, text, req } = escalated
    try {
      assert.ok(await until(async () => (await host.call('heldApprovals')) > 0, 10000, 50), 'precondition: the request went on to the user')
      await settledIdle(host, fb)
      assert.equal(await host.call('releaseApproval', { outcome: OUTCOME.allow }), true)
      assert.equal((await askSettled(host, text)).outcome, OUTCOME.allow)
    } finally { await host.call('setApprover', { outcome: OUTCOME.reject }); await settledIdle(host, x) }
    const note = await noteAfterNextTurn([APR_NOTE.escalated(req.id, OUTCOME.allow)])
    assert.deepEqual(note.source.author, { kind: AUTHOR_KIND.system })
    assert.deepEqual(Object.keys(note.source.author), ['kind'])
  })

  it('AUT-16 the note after a request that got no answer in time: author {kind: system}', T, async () => {
    await setLimit({ approvalAnswerSeconds: 1 })
    try {
      const x = await named('aut-16', 'Slow ' + tok('t'))
      const text = tok('16')
      const req = await asked(x, text)
      assert.equal((await askSettled(host, text, 10000))?.outcome, OUTCOME.reject, 'precondition: the user (stand-in) answered')
      await settledIdle(host, x)
      const note = await noteAfterNextTurn([APR_NOTE.timeout])
      assert.deepEqual(note.source.author, { kind: AUTHOR_KIND.system })
    } finally { await setLimit({ approvalAnswerSeconds: LIMITS.approvalAnswerSeconds.default }) }
  })

  it('AUT-17 a 201-byte title is cut in the approval author', T, async () => {
    const title = 'q'.repeat(201)
    const x = await named('aut-17', title)
    const text = tok('17')
    await plan(text, { decision: 'escalate', risk: 'high', reason: 'no allowance' }, 'call_aut17')
    const req = await asked(x, text)
    await askSettled(host, text)
    const a = req.source.author
    assert.equal(a?.kind, AUTHOR_KIND.approval)
    assert.equal(a.seed, x)
    assert.ok(Buffer.byteLength(a.name) <= AUTHOR_NAME_MAX_BYTES, 'at most 200 bytes')
    assert.ok(a.name.endsWith(ELLIPSIS))
    assert.ok(title.startsWith(a.name.slice(0, -ELLIPSIS.length)))
    await settledIdle(host, x)
  })
})
