/**
 * Revision 11 rev11-ui-fixes: the audit credits who gave a one-time pass, plus what the served client bundle
 * must say (requirements R2, R4; the hand check covers the rest). Nothing here names the stored field that
 * records the giver: the requirement only says it is stored with the audit entry. So the cases compare the
 * pass entries of the two origins (your Allow once, Fishball's allow) by every field that is not identity,
 * time or free text, in the snapshot's `approvals.recent` and in the stored audit record.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | UIF-01  | DT (giver: you / Fishball) x (store, snapshot) | both pass entries keep answer `pass`; their remaining fields differ between the two givers |
 * | UIF-02  | EP (two passes of each giver) | same giver, same remaining fields |
 * | UIF-03  | ST (restart) | each entry's remaining fields are the same after the restart, in the snapshot and in the store |
 * | UIF-04  | EP (an entry written before the fix: the giver's field removed) | the host starts live; the entry, if listed, still reads `pass` |
 * | UIF-05  | EP (served client bundle) | holds "Ran on your one-time approval", "used once" and "used {count} times" |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { AUDIT_ANSWER, CLICK } from './support/constants.mjs'
import { HOOK, T, answerCard, approvalAudit, askStep, callStep, fishballClientBundle, settledIdle, turn, waitRequest } from './support/expect.mjs'
import { boot, pileHost, pileTools, tokens } from './support/rev11c.mjs'

const { tok, cid } = tokens('UIF')
/** Fields that name identity, time or free text: never evidence of who gave the pass. */
const IGNORED = new Set(['key', 'at', 'decidedAt', 'rationale', 'sessionId', 'risk', 'finalOutcome', 'argumentsStatus', 'toolName', 'callId', 'argumentsDigest'])
const hexOf = (requestId) => String(requestId).replace(/^apr_/, '')

describe('Revision 11 rev11-ui-fixes: who gave a one-time pass', () => {
  let ctx
  let t
  let x
  const given = { user: [], fishball: [] }

  /** The remaining fields of an entry, minus anything that carries this request's id or token. */
  const fingerprint = (entry, requestId, text) => Object.fromEntries(Object.entries(entry)
    .filter(([k, v]) => !IGNORED.has(k) && !['at'].includes(k) && !JSON.stringify(v ?? null).includes(hexOf(requestId)) && !JSON.stringify(v ?? null).includes(text) && !/^\d{4}-\d\d-\d\dT/.test(String(v)))
    .map(([k, v]) => [k, JSON.stringify(v)]))
  const snapshotPass = async (requestId) => ((await ctx.host.state()).approvals?.recent ?? []).filter((e) => String(e.key).includes(hexOf(requestId)) && e.answer === AUDIT_ANSWER.pass)
  const storedPass = (requestId) => approvalAudit(ctx.home).filter((r) => r.file.includes(hexOf(requestId)) && r.record.answer === AUDIT_ANSWER.pass)

  async function userPass(label) {
    const text = tok(label)
    const [id, callId] = [cid(label), cid(label + 'call')]
    const { requestId } = await t.escalated(x, text, id, { after: [callStep({ text }, callId)] })
    assert.equal((await answerCard(ctx.host, requestId, CLICK.allow)).status, 200)
    await t.answered(x, id)
    await ctx.host.call('waitIdle', { sessionId: x })
    await settledIdle(ctx.host, ctx.fb)
    given.user.push({ requestId, text })
  }
  async function fishballPass(label) {
    const text = tok(label)
    const [id, callId] = [cid(label), cid(label + 'call')]
    await t.plan(text, { decision: 'allow', risk: 'low', reason: 'fine ' + text })
    await turn(ctx.host, x, [askStep(t.askArgs({ text }), id), callStep({ text }, callId), [{ text: 'done' }]])
    const req = await waitRequest(ctx.host, ctx.fb, text)
    assert.ok(req, 'the request reached Fishball')
    await settledIdle(ctx.host, ctx.fb)
    given.fishball.push({ requestId: req.id, text })
  }
  const prints = async () => {
    const out = { snapshot: {}, store: {} }
    for (const [giver, list] of Object.entries(given)) {
      out.snapshot[giver] = []
      out.store[giver] = []
      for (const { requestId, text } of list) {
        const s = await snapshotPass(requestId)
        const r = storedPass(requestId)
        assert.equal(s.length, 1, giver + ' pass in the snapshot: ' + requestId)
        assert.equal(r.length, 1, giver + ' pass in the store: ' + requestId)
        out.snapshot[giver].push(fingerprint(s[0], requestId, text))
        out.store[giver].push(fingerprint(r[0].record, requestId, text))
      }
    }
    return out
  }
  let before1

  before(async () => {
    ctx = await pileHost('rev11-ui-fixes')
    t = pileTools(ctx, { tok, cid })
    x = await t.session('uif-x')
    await userPass('a')
    await fishballPass('b')
    await userPass('c')
    await fishballPass('d')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('UIF-01 the two givers leave different entries, with answer pass kept', T, async () => {
    before1 = await prints()
    for (const where of ['snapshot', 'store']) {
      const [u] = before1[where].user
      const [f] = before1[where].fishball
      assert.notDeepEqual(u, f, where + ': the pass entry records who gave it: ' + JSON.stringify({ u, f }))
    }
  })

  it('UIF-02 the same giver leaves the same remaining fields', T, async () => {
    for (const where of ['snapshot', 'store']) {
      const [u1, u2] = before1[where].user
      const [f1, f2] = before1[where].fishball
      assert.deepEqual(u1, u2, where + ' user')
      assert.deepEqual(f1, f2, where + ' fishball')
    }
  })

  it('UIF-03 after a restart each entry still says who gave the pass', T, async () => {
    await ctx.host.stop()
    await boot(ctx)
    const after1 = await prints()
    assert.deepEqual(after1, before1)
  })

  it('UIF-04 an entry written before the fix still reads pass after a restart', T, async () => {
    const [u] = before1.store.user
    const [f] = before1.store.fishball
    const differing = Object.keys(u).filter((k) => u[k] !== f[k])
    const { requestId } = given.user[0]
    const { file } = approvalAudit(ctx.home).find((r) => r.file.includes(hexOf(requestId)) && r.record.answer === AUDIT_ANSWER.pass)
    const old = path.join(ctx.home, 'storages', 'fishball_intake', 'approvals')
    const fake = 'f'.repeat(hexOf(requestId).length)
    const json = JSON.parse(fs.readFileSync(path.join(old, file), 'utf8'))
    const strip = (x0, depth = 0) => {
      if (!x0 || typeof x0 !== 'object' || depth > 6) return false
      if (Object.hasOwn(x0, 'answer')) { for (const k of differing) delete x0[k]; return true }
      return Object.values(x0).some((v) => strip(v, depth + 1))
    }
    assert.ok(strip(json), 'found the record')
    await ctx.host.stop()
    fs.writeFileSync(path.join(old, file.replaceAll(hexOf(requestId), fake)), JSON.stringify(json).replaceAll(hexOf(requestId), fake))
    await boot(ctx)
    const listed = ((await ctx.host.state()).approvals?.recent ?? []).filter((e) => String(e.key).includes(fake))
    for (const e of listed) assert.equal(e.answer, AUDIT_ANSWER.pass)
  })

  it('UIF-05 the client bundle carries the new labels and both use-count forms', T, async () => {
    const bundle = await fishballClientBundle(ctx.host)
    assert.ok(bundle.found, 'client bundle served')
    for (const s of ['Ran on your one-time approval', 'used once', 'used {count} times']) assert.ok(bundle.text.includes(s), s)
  })
})
