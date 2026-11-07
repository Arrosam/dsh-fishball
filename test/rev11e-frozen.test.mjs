/**
 * Revision 11 rev11e: prompts already showing (DESIGN §7a.1 "Yours", §7a.9, §13d S33; requirements item 20 and
 * done-when for rev11e). The scripted stock prompt is HELD, standing in for a prompt showing in a browser. The
 * broker remembers each prompt it passed on; Fishball is told nothing; list_frozen_sessions lists them (session,
 * tool, exact arguments, a prompt id). One host; cases run in order; each case ends by freeing its sessions.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | FRZ-01  | EP (nothing showing) | list_frozen_sessions answers ok with no entry |
 * | FRZ-02  | EP (a prompt in a session that is yours) | listed with the session, the tool and its exact arguments, a prompt id; Fishball took no step, no intake item, no notice, no audit row, no card; the session is still yours |
 * | FRZ-03  | EP (arguments with quotes, markup, unicode and several fields) | the listed arguments equal the call's arguments exactly |
 * | FRZ-04  | EP (two sessions) | two entries with different prompt ids, each with its own session and arguments |
 * | FRZ-05  | ST (your own click: Allow once) | the call runs; the entry leaves the list; Fishball is told nothing; the session is still yours; answer_prompt on the old id is refused |
 * | FRZ-06  | ST (your own click: Reject) | the entry leaves; the call got the rejection |
 * | FRZ-07  | ST (the turn is stopped) | the entry leaves; answer_prompt on its id is refused |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { OUTCOME, PROMPT_DECISION, NEEDS_INSTANCE_STUB } from './support/constants.mjs'
import { HOOK, T, pileNow, requestMessages, storedRows } from './support/expect.mjs'
import { approvalAudit } from './support/expect.mjs'
import { QUIET_MS, argsOf, entryFor, idOf, pileHost, promptTools, refused, sleep, toolOf, tokens, yoursSession } from './support/rev11e.mjs'
import { ASK_TOOL } from './support/constants.mjs'

const { tok, cid } = tokens('FRZ')

describe('Revision 11 rev11e: list_frozen_sessions', { skip: NEEDS_INSTANCE_STUB }, () => {
  let ctx
  let p
  let x
  let y
  before(async () => {
    ctx = await pileHost('rev11e-frozen')
    p = promptTools(ctx, { tok, cid })
    x = await yoursSession(ctx, 'frz-x')
    y = await yoursSession(ctx, 'frz-y')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('FRZ-01 nothing showing: an empty list', T, async () => {
    const { json, entries } = await p.frozen()
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.deepEqual(entries, [])
  })

  it('FRZ-02 a prompt in a session that is yours is listed with its tool and exact arguments; Fishball took no step', T, async () => {
    const text = tok('02')
    const before = await p.fbWork()
    const auditBefore = approvalAudit(ctx.home).length
    await p.show(x, text, cid('02'))
    await sleep(QUIET_MS)
    assert.deepEqual(await p.fbWork(), before, 'no Fishball step and no intake item when the prompt appeared')
    assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 0, 'no notice about it')
    assert.equal(approvalAudit(ctx.home).length, auditBefore, 'no audit row')
    assert.deepEqual(await pileNow(ctx.host), [], 'a prompt in your own session is not a card')
    assert.equal(await p.managed(x), undefined, 'still yours')
    const { json, entries } = await p.frozen()
    assert.equal(json?.ok, true, JSON.stringify(json))
    const e = entryFor(entries, text)
    assert.ok(e, 'the prompt is listed: ' + JSON.stringify(json))
    assert.ok(idOf(e), 'a prompt id: ' + JSON.stringify(e))
    assert.equal(toolOf(e), ASK_TOOL)
    assert.deepEqual(argsOf(e), { text }, 'the exact arguments')
    assert.ok(JSON.stringify(e).includes(x), 'names the session: ' + JSON.stringify(e))
    assert.equal(entries.filter((z) => JSON.stringify(z).includes(text)).length, 1, 'once')
    await p.click(OUTCOME.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('FRZ-03 arguments with quotes, markup, unicode and several fields are listed exactly', T, async () => {
    const text = tok('03')
    const extra = { justification: 'say "hi" <b>é世界</b> \\ \n second line' }
    await p.show(x, text, cid('03'), extra)
    const { entries } = await p.frozen()
    const e = entryFor(entries, text)
    assert.ok(e, 'listed')
    assert.deepEqual(argsOf(e), { text, ...extra })
    await p.click(OUTCOME.reject)
    await ctx.host.call('waitIdle', { sessionId: x })
  })

  it('FRZ-04 two sessions with a prompt each: two entries with different ids, each with its own session and arguments', T, async () => {
    const [a, b] = [tok('04a'), tok('04b')]
    await p.show(x, a, cid('04a'))
    await p.show(y, b, cid('04b'))
    const { entries } = await p.frozen()
    const [ea, eb] = [entryFor(entries, a), entryFor(entries, b)]
    assert.ok(ea && eb, 'both listed: ' + JSON.stringify(entries))
    assert.notEqual(idOf(ea), idOf(eb))
    assert.ok(JSON.stringify(ea).includes(x) && !JSON.stringify(ea).includes(y))
    assert.ok(JSON.stringify(eb).includes(y) && !JSON.stringify(eb).includes(x))
    assert.deepEqual(argsOf(ea), { text: a })
    assert.deepEqual(argsOf(eb), { text: b })
    // Your click answers the oldest prompt (x's): only that entry leaves.
    await p.click(OUTCOME.allow)
    await ctx.host.call('waitIdle', { sessionId: x })
    const after = (await p.frozen()).entries
    assert.equal(entryFor(after, a), undefined, 'the clicked prompt left')
    assert.ok(entryFor(after, b), 'the other still showing')
    await p.click(OUTCOME.reject)
    await ctx.host.call('waitIdle', { sessionId: y })
  })

  for (const [id, label, outcome] of [['FRZ-05', 'Allow once', OUTCOME.allow], ['FRZ-06', 'Reject', OUTCOME.reject]]) {
    it(id + ' your own click (' + label + '): the call gets it, the entry leaves, Fishball took no step, the session stays yours', T, async () => {
      const text = tok(id)
      const callId = cid(id)
      await p.show(x, text, callId)
      const { entries } = await p.frozen()
      const promptId = idOf(entryFor(entries, text))
      assert.ok(promptId)
      await p.click(outcome)
      assert.equal((await p.result(x, callId)).text, 'outcome=' + outcome)
      assert.equal(entryFor((await p.frozen()).entries, text), undefined, 'the entry left the list')
      const late = await p.answerPrompt({ prompt_id: promptId, decision: PROMPT_DECISION.reject, reason: 'late ' + text })
      assert.ok(refused(late), 'an answer after your click is refused: ' + late.result?.text)
      assert.equal(await p.managed(x), undefined, 'a refused answer does not make the session managed')
      assert.equal((await requestMessages(ctx.host, ctx.fb, text)).length, 0, 'your click told Fishball nothing')
    })
  }

  it('FRZ-07 the turn is stopped while the prompt shows: the entry leaves and answer_prompt on its id is refused', T, async () => {
    const text = tok('07')
    await p.show(x, text, cid('07'))
    const promptId = idOf(entryFor((await p.frozen()).entries, text))
    assert.ok(promptId)
    await p.stop(x)
    assert.equal(entryFor((await p.frozen()).entries, text), undefined, 'the entry left')
    const late = await p.answerPrompt({ prompt_id: promptId, decision: PROMPT_DECISION.reject, reason: 'late ' + text })
    assert.ok(refused(late), 'refused: ' + late.result?.text)
    assert.equal(await p.managed(x), undefined)
    assert.deepEqual(storedRows(ctx.home, 'decisions').filter((d) => d.target === promptId), [], 'nothing audited for a refused answer')
  })
})
