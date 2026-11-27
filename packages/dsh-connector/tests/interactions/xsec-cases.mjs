/**
 * The review fixes and X-SEC X-08 / X-09 on a real DSH (the C-WIRE-2 requirements relayed 2026-11-17;
 * .runtime/reports/x-sec-audit.md). Techniques: ST (races and the connector's close), DT (grant
 * ownership by principal × management), BVA (the hostRef cap).
 * - RV-01: a call that ends during the offer is withdrawn; a release racing the offer hands the call
 *   to the user (the stock prompt).
 * - RV-02: a principal's reject that lost to a release → the user's later Allow keeps the tool's real
 *   output (no "managing agent rejected" text).
 * - RV-03: the connector closing (its row disabled) hands every waiting permission call to the stock
 *   prompt and every open question to its card alone.
 * - RV-04: a question answer after its session was released → expired.
 * - X-08: a grant belongs to the principal that made it; another principal managing the session later
 *   sees none, cannot revoke it (ended), and it covers nothing.
 * - X-09: attachment_put past the hostRef cap → limit-exceeded, nothing written to DSH's store.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { FIXTURE, IX, REFUSAL, RELAYED, RETIREMENT_REASON, SURFACE, TOOL, XSEC } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import {
  A, answer, asked, assertCovered, assertOffered, call, cardOf, cid, connect, decided, eventually, free, fresh, handOver, managed, okCall, prefixGrant,
  principal, qAnswer, questioned, quiet, resultOf, retirement, sleep, step, stockFor, takeBack, tok, untilStock, userClicks, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'

const SHELL = 'bash'
const grantsOf = async (p, sid) => (await okCall(p.client, TOOL.grantsList, {})).grants.filter((g) => g.sessionId === sid)
const release = (p, sid) => okCall(p.client, TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason })

export function registerXsecInteractionCases(sdk) {
  const w0 = () => world(sdk)

  // ---------------------------------------------------------------- RV-01 (ST: races)
  row(sdk, XSEC.id.rv01, 'ends during the offer', 'the turn is stopped while the request is being offered → one retirement withdrawn; nothing at the stock prompt; a late answer is refused', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await w.call('cancel', { sessionId: sid })
    assert.equal((await retirement(p.client, r.event)).payload.reason, RETIREMENT_REASON.withdrawn)
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.cancelled)
    assert.deepEqual(await stockFor(w, r.text), [])
    assert.equal((await answer(p, r, A.allow())).ok, false)
  })
  row(sdk, XSEC.id.rv01, 'release races the offer', 'session_release issued at once after the call starts → the call reaches the stock prompt and the user decides it', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const text = tok('rv1')
    await free(w, sid)
    await w.call('driveStart', { sessionId: sid, text: tok('u'), script: [step(IX.fixture.askTool, { text }, cid('rv1')), [{ text: 'done' }]] })
    await release(p, sid)
    await untilStock(w, text)
    await userClicks(w, text, IX.outcome.allowed)
    assert.equal((await decided(w, text)).outcome, IX.outcome.allowed)
  })

  // ---------------------------------------------------------------- RV-02 (ST: reject loses to release)
  row(sdk, XSEC.id.rv02, 'reject lost to release', 'release, then the principal\'s reject (refused) → the user\'s Allow keeps the tool\'s real output, with no "managing agent rejected" text', async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p)
    const r = await asked(w, p, sid)
    await release(p, sid)
    const why = tok('why')
    assert.equal((await answer(p, r, A.reject(why))).ok, false, 'a reject after the release was accepted')
    await untilStock(w, r.text)
    await userClicks(w, r.text, IX.outcome.allowed)
    const result = await resultOf(w, sid, r.id)
    assert.equal(result.isError, false, result.text)
    assert.equal(result.text, IX.fixture.outcomeText(IX.outcome.allowed))
    assert.equal(result.text.includes(RELAYED.rejected(why)), false)
  })

  // ---------------------------------------------------------------- RV-03 (ST: the connector closes)
  row(sdk, XSEC.id.rv03, 'connector closes', 'the row disabled while a permission call and a question wait → the call reaches the stock prompt, the question stays in its card alone; the user decides both', async (t) => {
    const w = await world(sdk, XSEC.scenario.close)
    const p = await principal(t, w)
    const sidA = await managed(w, p)
    const sidQ = await managed(w, p, IX.preset.ask)
    const r = await asked(w, p, sidA)
    const q = await questioned(w, p, sidQ)
    t.after(() => w.call('bundleEnabled', { enabled: true }))
    await w.call('bundleEnabled', { enabled: false })
    await untilStock(w, r.text)
    assert.equal((await cardOf(w, q)).state, IX.card.open, 'the question card closed with the connector')
    await userClicks(w, r.text, IX.outcome.rejected)
    assert.equal((await decided(w, r.text)).outcome, IX.outcome.rejected)
    assert.equal(await w.call('cardAnswer', { sessionId: sidQ, answers: FIXTURE.answer.blue }), true)
    assert.ok(await eventually(async () => (await w.call('results', { sessionId: sidQ })).some((x) => x.callId === q.id)), 'the card answer did not reach the session')
  })

  // ---------------------------------------------------------------- RV-04
  row(sdk, XSEC.id.rv04, 'answer after release', `a question answered after its session was released → ${REFUSAL.expired}; the card stays the user's`, async (t) => {
    const w = await w0()
    const p = await principal(t, w)
    const sid = await managed(w, p, IX.preset.ask)
    const q = await questioned(w, p, sid)
    await release(p, sid)
    const late = await qAnswer(p, q, { answers: FIXTURE.answer.blue })
    assert.deepEqual([late.ok, late.code], [false, REFUSAL.expired])
    assert.equal((await cardOf(w, q)).state, IX.card.open)
    await free(w, sid)
  })

  // ---------------------------------------------------------------- X-08 (DT: grant owner × manager)
  for (const how of ['Take back', 'session_release']) {
    row(sdk, XSEC.id.x08, `A's grant after ${how} → Hand over to B`, `B lists none of A's grants; grant_revoke of it → ${REFUSAL.grantEnded}; it covers nothing`, async (t) => {
      const w = await world(sdk, XSEC.scenario.grants)
      const a = await principal(t, w, FIXTURE.label.p)
      const b = await principal(t, w, FIXTURE.label.q)
      const sid = await managed(w, a)
      const base = tok('x08')
      const r = await asked(w, a, sid, { tool: SHELL, text: base + ' a' })
      const granted = await answer(a, r, A.grant(prefixGrant(base)))
      assert.equal(granted.ok, true, JSON.stringify(granted))
      await decided(w, base + ' a', sid)
      if (how === 'Take back') await takeBack(w, sid)
      else await release(a, sid)
      await handOver(w, sid, b)
      assert.deepEqual(await grantsOf(b, sid), [])
      const revoke = await call(b.client, TOOL.grantRevoke, { grantId: granted.grantId, reason: FIXTURE.reason })
      assert.deepEqual([revoke.ok, revoke.code], [false, REFUSAL.grantEnded])
      await assertOffered(w, b, sid, SHELL, base + ' b')
    })
  }
  row(sdk, XSEC.id.x08, 'owner only while managing', 'A\'s grant covers and lists while A manages; another principal never lists or revokes it', async (t) => {
    const w = await world(sdk, XSEC.scenario.grants)
    const a = await principal(t, w, FIXTURE.label.p)
    const b = await principal(t, w, FIXTURE.label.q)
    const sid = await managed(w, a)
    const base = tok('x08o')
    const r = await asked(w, a, sid, { tool: SHELL, text: base + ' a' })
    const granted = await answer(a, r, A.grant(prefixGrant(base)))
    await decided(w, base + ' a', sid)
    await assertCovered(w, a, sid, SHELL, base + ' b')
    assert.equal((await grantsOf(a, sid)).some((g) => g.grantId === granted.grantId), true)
    assert.deepEqual(await grantsOf(b, sid), [])
    assert.equal((await call(b.client, TOOL.grantRevoke, { grantId: granted.grantId, reason: FIXTURE.reason })).ok, false)
  })
  // A succession through the real K3 dshConnectorTokens (createHosted twice for one instance, then retire):
  // the successor manages the session and holds the grant; it still covers.
  row(sdk, XSEC.id.x08, 'succession', 'Eo (hosted) grants in its session; retire(Eo, En) → En lists the grant and it still covers', async (t) => {
    const w = await world(sdk, XSEC.scenario.grants)
    const hosted = async () => {
      const made = await w.service(SURFACE.service.tokens, 'createHosted', XSEC.instanceId)
      assert.ok(made.value?.entryKey, 'createHosted: ' + JSON.stringify(made))
      const id = fresh(FIXTURE.idBase)
      const client = await connect(t, w, { id, value: made.value.value })
      assert.equal((await okCall(client, TOOL.pair)).id, id)
      const row = (await w.service(SURFACE.service.handover, 'principals')).value.find((x) => x.id === id)
      return { client, id, entryKey: made.value.entryKey, principalKey: row.key, value: made.value.value }
    }
    const eo = await hosted()
    const sid = await managed(w, eo)
    const base = tok('x08s')
    const r = await asked(w, eo, sid, { tool: SHELL, text: base + ' a' })
    const granted = await answer(eo, r, A.grant(prefixGrant(base)))
    assert.equal(granted.ok, true, JSON.stringify(granted))
    await decided(w, base + ' a', sid)
    const en = await hosted()
    const retired = await w.service(SURFACE.service.tokens, 'retire', eo.entryKey, en.entryKey)
    assert.deepEqual(retired.value, { ok: true }, JSON.stringify(retired))
    assert.equal((await grantsOf(en, sid)).some((g) => g.grantId === granted.grantId), true, 'the grant did not move to the successor')
    await assertCovered(w, en, sid, SHELL, base + ' b')
  })

  // ---------------------------------------------------------------- X-09 (BVA: the hostRef cap)
  row(sdk, XSEC.id.x09, 'cap + 1', `attachment_put up to the hostRef cap (${XSEC.hostRefCap}) succeeds; one more → ${REFUSAL.limitExceeded} and nothing is written to DSH's attachment store`, async (t) => {
    const w = await world(sdk, XSEC.scenario.attachments)
    const p = await principal(t, w)
    const bytes = Buffer.from(FIXTURE.png, 'base64')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    // Every put past the burst first waits for the bucket to refill one put (XSEC.pace), so the
    // endpoint's rate limit never refuses a put and only the hostRef cap can.
    let puts = 0
    const put = async () => {
      if (puts++ >= XSEC.pace.burstPuts) await sleep(XSEC.pace.refillMs)
      return call(p.client, TOOL.attachmentPut, { transferId: tok('xfer'), total: bytes.length, sha256, mediaType: FIXTURE.pngType, chunks: [FIXTURE.png] })
    }
    for (let i = 0; i < XSEC.hostRefCap; i += 1) assert.equal((await put()).ok, true, 'put ' + (i + 1) + ' refused')
    const files = await w.call('attachmentFiles')
    const over = await put()
    assert.deepEqual([over.ok, over.code], [false, REFUSAL.limitExceeded])
    await quiet()
    assert.equal(await w.call('attachmentFiles'), files, 'a refused put wrote to the attachment store')
  })
}
