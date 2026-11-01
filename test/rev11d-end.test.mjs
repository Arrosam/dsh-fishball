/**
 * Revision 11 rev11d: how a grant ends, the pause while Fishball or Permission requests is off, and restarts
 * (DESIGN §7a.5, §7a.8 "Ending", "Paused while off", "Restarts", §9 "Standing grants", "Fishball's other decisions",
 * §10e "Active grants", "Host API"; requirements item 19, defaults "Restarts", done-when 6; decisions Q-r11-grants-off,
 * Q-r11-audit-user). One host, a fresh managed session per case so that grants do not touch one another; the restart
 * case is last. After a grant ends, "the next run goes to Fishball" means a notice reaches Fishball.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | END-01  | ST (active –end time→ expired) | covered before; after the end time the next run goes to Fishball; row expired by expiry; gone from the active list |
 * | END-02  | ST (active –your Revoke→ ended) | route 200; next run to Fishball; decisions `revoke` by user; repeat and unknown id 409; row revoked by user |
 * | END-03  | ST (active –revoke_grant→ ended) | list_grants lists it, then not as active; ok; next run to Fishball; decisions `revoke` by fishball; second revoke and unknown id refused |
 * | END-04  | ST (take back) | its grants end (take-back); the other session's stay; handing over again does not revive them |
 * | END-05  | ST (release_session) | its grants end (release) |
 * | END-06  | ST (Permission requests off, then on) | covered call shows the stock prompt, no use counted, no tag; grant stays active, end time unmoved, marked paused; after on, covered again |
 * | END-07  | ST (Fishball archived, then live) | as END-06 |
 * | END-08  | ST (restart) | the unexpired grant survives with its uses and end time and still covers; one that passes its end time is not honoured; managed status stays |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, GRANT_API, GRANT_ACTION, GRANT_ENDED_BY, GRANT_KIND, GRANT_STATUS, GRANT_TAG_KIND, GRANT_TOOLS, OUTCOME, OWN_PLUGINS, RELEASE_TOOL, STATUS } from './support/constants.mjs'
import { HOOK, T, fishballCall, managedEntry, setManaged, settledIdle, stockSeen, storedRows, makeManaged, turn } from './support/expect.mjs'
import { boot, activeFor, endsAt, grantEntries, grantHost, grantTools, iso, snapId, sleep, tokens, until } from './support/rev11d.mjs'

const { tok, cid } = tokens('END')
const HOUR = 3600 * 1000
const LONG = { timeout: 120000 }

describe('Revision 11 rev11d: how grants end, pause and survive', () => {
  let ctx
  let g
  const decisions = () => storedRows(ctx.home, 'decisions')
  const row = (id) => grantEntries(ctx.home).find(([k]) => k === id)?.[1]
  const tagsFor = (sid) => storedRows(ctx.home, 'tags').filter((t) => t.sessionId === sid && t.kind === GRANT_TAG_KIND)
  /** A fresh managed session holding an active prefix grant `prefix` on bash. */
  async function granted(label, prefix = 'go ' + tok(label), ms = HOUR) {
    const sid = await g.t.session(label)
    const c = await g.create(sid, 'bash', prefix + ' init', { kind: GRANT_KIND.prefix, prefix, expires_at: iso(ms) })
    assert.equal(c.json.ok, true, JSON.stringify(c.json))
    assert.ok(c.grantId, 'a grant id: ' + JSON.stringify(c.json))
    return { sid, prefix, grantId: c.grantId }
  }
  const toggleApprovals = async (on) => {
    const r = await ctx.host.post(API.plugins, { plugin: OWN_PLUGINS.approvals.key, on })
    assert.equal(r.status, 200, r.text)
    assert.ok(await until(async () => (await ctx.host.state()).features?.approvals === on, 10000, 100), 'features.approvals ' + on)
  }

  before(async () => {
    ctx = await grantHost('rev11d-end')
    g = grantTools(ctx, { tok, cid })
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('END-01 a grant ends at its end time: the next run goes to Fishball', T, async () => {
    const { sid, prefix, grantId } = await granted('end01', 'e1 ' + tok('01'), 4000)
    await g.covered(sid, 'bash', prefix + ' once')
    await sleep(Math.max(0, endsAt(row(grantId) ?? {}) - Date.now()) + 600)
    await g.uncovered(sid, 'bash', prefix + ' after')
    assert.equal(activeFor(await g.snapshotGrants(), sid).length, 0, 'not in the active list')
    const r = row(grantId)
    assert.notEqual(r.status, GRANT_STATUS.active)
    assert.ok([GRANT_STATUS.expired, GRANT_STATUS.ended].includes(r.status), r.status)
    assert.equal(r.endedBy, GRANT_ENDED_BY.expiry)
  })

  it('END-02 your Revoke: the grant ends, the next run goes to Fishball, the click is audited', T, async () => {
    const { sid, prefix, grantId } = await granted('end02')
    await g.covered(sid, 'bash', prefix + ' a')
    const ok = await ctx.host.post(GRANT_API.revoke, { grantId })
    assert.equal(ok.status, 200, ok.text)
    assert.ok(!activeFor(await g.snapshotGrants(), sid).some((e) => snapId(e) === grantId), 'gone from the active list')
    await g.uncovered(sid, 'bash', prefix + ' b')
    assert.equal(row(grantId).status, GRANT_STATUS.revoked)
    assert.equal(row(grantId).endedBy, GRANT_ENDED_BY.user)
    const d = decisions().filter((e) => e.target === grantId && e.action === GRANT_ACTION.revoke)
    assert.equal(d.length, 1, JSON.stringify(decisions().filter((e) => e.target === grantId)))
    assert.equal(d[0].by, 'user')
    assert.equal(d[0].sessionId, sid)
    assert.equal((await ctx.host.post(GRANT_API.revoke, { grantId })).status, 409, 'already ended')
    assert.equal((await ctx.host.post(GRANT_API.revoke, { grantId: 'gnt_fbtest_nothing' })).status, 409, 'unknown')
  })

  it('END-03 Fishball revokes with revoke_grant; list_grants shows active grants only as active', T, async () => {
    const { sid, prefix, grantId } = await granted('end03')
    const listed = await fishballCall(ctx.host, ctx.fb, GRANT_TOOLS.list, {})
    assert.ok(listed.json, 'list_grants answers JSON: ' + listed.result?.text)
    assert.ok(JSON.stringify(listed.json).includes(grantId), 'the active grant is listed: ' + JSON.stringify(listed.json).slice(0, 600))
    const done = await fishballCall(ctx.host, ctx.fb, GRANT_TOOLS.revoke, { grant_id: grantId, reason: 'fbtest: the user changed their mind' })
    assert.notEqual(done.json?.ok, false, JSON.stringify(done.json))
    assert.equal(row(grantId).status, GRANT_STATUS.revoked)
    assert.equal(row(grantId).endedBy, GRANT_ENDED_BY.fishball)
    const after = await fishballCall(ctx.host, ctx.fb, GRANT_TOOLS.list, {})
    const entry = (after.json?.grants ?? []).find((e) => snapId(e) === grantId)
    assert.ok(!entry || (entry.status && entry.status !== GRANT_STATUS.active), 'no longer active in list_grants')
    const d = decisions().filter((e) => e.target === grantId && e.action === GRANT_ACTION.revoke)
    assert.equal(d.length, 1)
    assert.equal(d[0].by, 'fishball')
    await g.uncovered(sid, 'bash', prefix + ' next')
    const again = await fishballCall(ctx.host, ctx.fb, GRANT_TOOLS.revoke, { grant_id: grantId, reason: 'fbtest again' })
    assert.equal(again.json?.ok, false, 'a second revoke is refused: ' + JSON.stringify(again.json))
    const unknown = await fishballCall(ctx.host, ctx.fb, GRANT_TOOLS.revoke, { grant_id: 'gnt_fbtest_nothing', reason: 'fbtest' })
    assert.equal(unknown.json?.ok, false, JSON.stringify(unknown.json))
    assert.equal(decisions().filter((e) => e.action === GRANT_ACTION.revoke && e.target === grantId).length, 1, 'refused revokes add no row')
  })

  it('END-04 Take back ends the session\'s grants only; handing over again does not revive them', T, async () => {
    const a = await granted('end04a')
    const b = await granted('end04b')
    const r = await setManaged(ctx.host, a.sid, false)
    assert.equal(r.status, 200, r.text)
    assert.equal(row(a.grantId).status !== GRANT_STATUS.active, true)
    assert.equal(row(a.grantId).endedBy, GRANT_ENDED_BY.takeBack)
    assert.equal(row(b.grantId).status, GRANT_STATUS.active, "the other session's grant stays")
    assert.equal(activeFor(await g.snapshotGrants(), a.sid).length, 0)
    await makeManaged(ctx.host, ctx.fb, a.sid)
    await g.uncovered(a.sid, 'bash', a.prefix + ' again')
    await g.covered(b.sid, 'bash', b.prefix + ' still')
  })

  it('END-05 Fishball releasing a session ends its grants', T, async () => {
    const a = await granted('end05')
    const rel = await fishballCall(ctx.host, ctx.fb, RELEASE_TOOL, { session_id: a.sid, reason: 'fbtest: done' })
    assert.equal(rel.json?.ok, true, JSON.stringify(rel.json))
    assert.equal(row(a.grantId).endedBy, GRANT_ENDED_BY.release)
    assert.notEqual(row(a.grantId).status, GRANT_STATUS.active)
    assert.equal(activeFor(await g.snapshotGrants(), a.sid).length, 0)
  })

  /** The pause: while off, a covered call shows the stock prompt and the grant is untouched; back on, it covers again. */
  async function pauseCase(label, off, on) {
    const { sid, prefix, grantId } = await granted(label)
    await g.covered(sid, 'bash', prefix + ' before')
    const usesBefore = row(grantId).uses
    const endBefore = endsAt(row(grantId))
    const tagsBefore = tagsFor(sid).length
    await off()
    try {
      const cmd = prefix + ' while-off'
      const id = cid(label)
      await ctx.host.call('setApprover', { outcome: OUTCOME.allow })
      await settledIdle(ctx.host, sid)
      const r = await turn(ctx.host, sid, [g.cmd('bash', cmd, id), [{ text: 'done' }]])
      await ctx.host.call('setApprover', { outcome: OUTCOME.reject })
      assert.equal(r.results.find((x) => x.callId === id)?.text, 'outcome=' + OUTCOME.allow, "the session's stock prompt answered")
      assert.equal((await stockSeen(ctx.host, cmd)).length, 1, 'the stock prompt was shown once')
      assert.equal((await g.notices(cmd)).length, 0, 'Fishball was not asked')
      assert.equal(row(grantId).uses, usesBefore, 'a paused grant counts no use')
      assert.equal(tagsFor(sid).length, tagsBefore, 'and leaves no tag')
      assert.equal(row(grantId).status, GRANT_STATUS.active, 'paused, not ended')
      assert.equal(endsAt(row(grantId)), endBefore, 'the end time does not move')
      const snap = activeFor(await g.snapshotGrants(), sid).find((e) => snapId(e) === grantId)
      assert.ok(snap, 'still listed')
      assert.ok(snap.paused === true || /paus/i.test(JSON.stringify(snap)), 'marked paused: ' + JSON.stringify(snap))
    } finally { await on() }
    await g.covered(sid, 'bash', prefix + ' after-on')
    assert.equal(row(grantId).uses, usesBefore + 1)
    assert.equal(row(grantId).status, GRANT_STATUS.active)
  }

  it('END-06 Permission requests off: the stock prompt; back on: the same grant covers again', LONG, async () => {
    await pauseCase('end06', () => toggleApprovals(false), () => toggleApprovals(true))
  })

  it('END-07 Fishball not live: the stock prompt; live again: the same grant covers again', LONG, async () => {
    await pauseCase('end07', async () => {
      const a = await ctx.host.call('archive', { sessionId: ctx.fb, stopActivity: true })
      assert.equal(a.ok, true, JSON.stringify(a))
    }, async () => {
      await ctx.host.call('unarchive', { sessionId: ctx.fb })
      const rec = await ctx.host.post(API.recovery, { action: 'retry' })
      assert.equal(rec.status, 200, rec.text)
      await ctx.host.waitStatus(STATUS.live)
      await settledIdle(ctx.host, ctx.fb)
    })
  })

  it('END-08 a restart: unexpired grants survive and cover; one past its end time does not', { timeout: 180000 }, async () => {
    const long = await granted('end08a', 'rs ' + tok('08a'), HOUR)
    const short = await granted('end08b', 'rt ' + tok('08b'), 12000)
    await g.covered(long.sid, 'bash', long.prefix + ' x')
    const usesBefore = row(long.grantId).uses
    const endBefore = endsAt(row(long.grantId))
    for (const sid of [long.sid, short.sid]) await ctx.host.call('flush', { sessionId: sid })
    await ctx.host.stop()
    await boot(ctx)
    g = grantTools(ctx, { tok, cid })
    assert.equal(row(long.grantId).status, GRANT_STATUS.active)
    assert.equal(row(long.grantId).uses, usesBefore)
    assert.equal(endsAt(row(long.grantId)), endBefore)
    const snap = activeFor(await g.snapshotGrants(), long.sid).find((e) => snapId(e) === long.grantId)
    assert.ok(snap, 'listed after the restart: ' + JSON.stringify(await g.snapshotGrants()))
    assert.ok(await managedEntry(ctx.host, long.sid), 'managed status survives')
    await g.covered(long.sid, 'bash', long.prefix + ' after-restart')
    await sleep(Math.max(0, endsAt(row(short.grantId)) - Date.now()) + 600)
    await g.uncovered(short.sid, 'bash', short.prefix + ' late')
  })
})
