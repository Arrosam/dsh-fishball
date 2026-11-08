/**
 * Revision 11 rev11d on H-STUB: how a grant ends, the pause while no instance is connected, and restarts
 * (DESIGN §7a.5, §7a.8 "Ending", "Paused while off", "Restarts", §9 "Standing grants", "Fishball's other
 * decisions", §11 "Revision 11" restart; requirements item 19, defaults "Restarts", done-when 6; contract §4.1
 * `session.release`, §4.3 `grant.list` / `grant.revoke` and their codes, §8 `reasonChars`). One host, a fresh
 * managed session per case so that grants do not touch one another; the restart case is last. After a grant
 * ends, "the next run goes to the instance" means an `approval.request` reaches the stub.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | END-01  | ST (active –end time→ expired) | §7a.8, §9 | covered before; after the end time the next run goes to the instance; row expired by expiry; gone from grant.list; no decisions row for the expiry |
 * | END-03  | ST (active –grant.revoke→ revoked) | §7a.8, §4.3 | grant.list lists it; `{grantId, revoked:true}`; row revoked by fishball; gone from grant.list; decisions `revoke` by fishball; next run to the instance |
 * | END-03b | DT (refused revokes) | §4.3 | a second revoke `ended`; an unknown id `unknown`; an empty reason `reason-required`; none adds a decisions row |
 * | END-03c | BVA (`reasonChars` 500) | contract §8 | a 500-character reason is accepted; 501 is not accepted and the grant stays active |
 * | END-04  | ST (take back) | §7a.8, item 19 | its grants end (take-back); the other session's stay; handing over again does not revive them |
 * | END-05  | ST (session.release) | §7a.8, §4.1 | `{sessionId, managed:false}`; its grants end (release) |
 * | END-07  | ST (instance detached, then attached) | §7a.8 "Paused while off", slim §5.2 (canAnswer is the bridge's ready state) | while detached a covered call shows the stock prompt, no use counted, row still active with its end time; after a new attach it is listed `paused:false` and covers again |
 * | END-08  | ST (restart) | §7a.8 Restarts, §11 | the unexpired grant survives with its uses and end time and still covers; one past its end time is not honoured; managed status stays |
 *
 * Retired:
 * - END-02: your Revoke on the grants list went with the pile UI; a standing grant is revoked by asking Fishball (slim §12); POST /api/fishball/grants/revoke answers 404.
 * - END-06: the Permission requests switch is gone, permission requests are always on (slim §12); the pause is exercised by a detached instance (END-07).
 * - END-06/07 "no tag": tag records were removed (slim §8.1, T08/T15).
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { ENVELOPE, OPERATION } from 'fishball-connector/contract'
import { OUTCOME, PREFIX_TOOLS } from './support/constants.mjs'
import { HOOK, T } from './support/expect.mjs'
import { STUB, handOver, managedSession, stopStub, takeBack } from './support/instance-stub.mjs'
import {
  GRANT_C, argsFor, assertNotAccepted, assertRefused, covered, create, decisions, grantRow, grantStub, listedGrant, listedGrants,
  prefixGrant, reattachIfClosed, restartGrantStub, resultOf, rowEnd, sizedText, sleep, startCall, tokens, uncovered, until,
} from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('END')
const SHELL = PREFIX_TOOLS[0]
const LONG = { timeout: 180000 }

describe('Revision 11 rev11d on H-STUB: how grants end, pause and survive', () => {
  let ctx
  const run = (sid, command, label) => covered(ctx, sid, SHELL, argsFor(SHELL, command), cid(label))
  const notRun = (sid, command, label) => uncovered(ctx, sid, SHELL, argsFor(SHELL, command), cid(label))
  const revoke = (grantId, reason) => ctx.stub.op(OPERATION.grantRevoke, { grantId, reason })
  const revokeRows = (grantId) => decisions(ctx, grantId).filter((d) => d.action === GRANT_C.action.revoke)
  /** A fresh managed session holding an active prefix grant on bash. */
  async function granted(label, ms = GRANT_C.hourMs) {
    const sid = await managedSession(ctx.host, 'end-' + label)
    const prefix = 'go ' + tok(label)
    const c = await create(ctx, sid, SHELL, prefix + ' init', prefixGrant(prefix, ms), cid(label))
    assert.equal(c.reply.type, ENVELOPE.type.response, JSON.stringify(c.reply))
    return { sid, prefix, grantId: c.grantId }
  }
  const assertEnded = async (g, endedBy, status = GRANT_C.status.ended) => {
    const row = grantRow(ctx, g.grantId)
    assert.deepEqual({ status: row.status, endedBy: row.endedBy }, { status, endedBy }, JSON.stringify(row))
    assert.ok(Number.isFinite(Date.parse(row.endedAt)), 'endedAt recorded')
    // grant.list follows the store within a short while (seen: under 1 s after a Take back), so it is polled.
    assert.ok(await until(async () => (await listedGrant(ctx, g.grantId)) === undefined, STUB.waitMs, STUB.pollMs), 'gone from grant.list')
  }

  before(async () => { ctx = await grantStub('rev11d-end') }, HOOK)
  // A refusal that closed the channel (reported by its own case) must not leave the next case without an instance.
  beforeEach(() => reattachIfClosed(ctx))
  after(() => stopStub(ctx), HOOK)

  it('END-01 a grant ends at its end time: the next run goes to the instance', T, async () => {
    const g = await granted('01', GRANT_C.shortGrantMs)
    await run(g.sid, g.prefix + ' once', '01a')
    await sleep(Math.max(0, rowEnd(grantRow(ctx, g.grantId)) - Date.now()) + GRANT_C.pastEndMs)
    await notRun(g.sid, g.prefix + ' after', '01b')
    await assertEnded(g, GRANT_C.endedBy.expiry, GRANT_C.status.expired)
    // §7a.8: an expiry writes no decisions row; the grant's own record is its audit.
    assert.deepEqual(revokeRows(g.grantId), [])
    assert.deepEqual(decisions(ctx, g.grantId).map((d) => d.action), [GRANT_C.action.grant])
  })

  it('END-03 the instance revokes with grant.revoke: the grant ends, the next run goes to the instance', T, async () => {
    const g = await granted('03')
    assert.ok(await listedGrant(ctx, g.grantId), 'listed while active')
    const reason = 'fbtest: the user changed their mind ' + tok('03r')
    const r = await revoke(g.grantId, reason)
    assert.deepEqual({ type: r.type, payload: r.payload }, { type: ENVELOPE.type.response, payload: { grantId: g.grantId, revoked: true } })
    await assertEnded(g, GRANT_C.endedBy.fishball, GRANT_C.status.revoked)
    const d = revokeRows(g.grantId)
    assert.equal(d.length, 1, JSON.stringify(decisions(ctx, g.grantId)))
    assert.deepEqual({ by: d[0].by, sessionId: d[0].sessionId, rationale: d[0].rationale }, { by: GRANT_C.by.fishball, sessionId: g.sid, rationale: reason })
    await notRun(g.sid, g.prefix + ' next', '03n')
  })

  it('END-03b refused revokes: ended, unknown, reason-required; none adds a decisions row', T, async () => {
    const g = await granted('03b')
    assert.equal((await revoke(g.grantId, 'fbtest first')).type, ENVELOPE.type.response)
    await assertRefused(ctx, await revoke(g.grantId, 'fbtest again'), 'ended')
    await assertRefused(ctx, await revoke('grt_fbtest_nothing', 'fbtest'), 'unknown')
    const live = await granted('03c')
    assert.equal(revokeRows(g.grantId).length, 1, 'only the accepted revoke is recorded')
    // Contract §4.3: an empty or blank reason is refused reason-required (an error frame, the channel open).
    for (const reason of ['  ', '']) {
      const r = await revoke(live.grantId, reason)
      try { await assertRefused(ctx, r, 'reason-required') } finally {
        assert.deepEqual(revokeRows(live.grantId), [], 'a refused revoke adds no decisions row')
        assert.equal(grantRow(ctx, live.grantId).status, GRANT_C.status.active, 'a refused revoke leaves the grant active')
        await reattachIfClosed(ctx)
      }
    }
  })

  for (const [n, accepted] of [[500, true], [501, false]]) {
    it('END-03c a revoke reason of ' + n + ' characters is ' + (accepted ? 'accepted' : 'not accepted'), T, async () => {
      const g = await granted('03d' + n)
      const r = await revoke(g.grantId, sizedText(n, tok('r')))
      if (accepted) assert.equal(r.type, ENVELOPE.type.response, JSON.stringify(r).slice(0, 300))
      else {
        assertNotAccepted(r)
        assert.equal(grantRow(ctx, g.grantId).status, GRANT_C.status.active)
      }
    })
  }

  it('END-04 Take back ends the session\'s grants only; handing over again does not revive them', T, async () => {
    const a = await granted('04a')
    const b = await granted('04b')
    const r = await takeBack(ctx.host, a.sid)
    assert.equal(r.status, 200, r.text)
    await assertEnded(a, GRANT_C.endedBy.takeBack)
    assert.equal(grantRow(ctx, b.grantId).status, GRANT_C.status.active, "the other session's grant stays")
    assert.ok(await listedGrant(ctx, b.grantId))
    assert.equal((await handOver(ctx.host, a.sid)).status, 200)
    await notRun(a.sid, a.prefix + ' again', '04c')
    await run(b.sid, b.prefix + ' still', '04d')
  })

  it('END-05 session.release ends the session\'s grants', T, async () => {
    const a = await granted('05')
    const rel = await ctx.stub.op(OPERATION.sessionRelease, { sessionId: a.sid, reason: 'fbtest: done' }, a.sid)
    assert.deepEqual({ type: rel.type, payload: rel.payload }, { type: ENVELOPE.type.response, payload: { sessionId: a.sid, managed: false } })
    await assertEnded(a, GRANT_C.endedBy.release)
  })

  it('END-07 no instance connected: the stock prompt and no use; attached again: the same grant covers again', LONG, async () => {
    const g = await granted('07')
    await run(g.sid, g.prefix + ' before', '07a')
    const usesBefore = grantRow(ctx, g.grantId).uses
    const endBefore = rowEnd(grantRow(ctx, g.grantId))
    assert.equal(await ctx.stub.detach(), true)
    try {
      const command = g.prefix + ' while-off'
      const callId = cid('07b')
      await ctx.host.call('setApprover', { outcome: OUTCOME.allow })
      try {
        await startCall(ctx, g.sid, SHELL, argsFor(SHELL, command), callId)
        assert.equal((await resultOf(ctx, g.sid, callId)).text, 'outcome=' + OUTCOME.allow, "the session's stock prompt answered")
      } finally { await ctx.host.call('setApprover', { outcome: OUTCOME.reject }) }
      const shown = (await ctx.host.call('approvals', {})).filter((p) => p.callId === callId)
      assert.equal(shown.length, 1, 'the stock prompt was shown once')
      const row = grantRow(ctx, g.grantId)
      assert.equal(row.uses, usesBefore, 'a paused grant counts no use')
      assert.equal(row.status, GRANT_C.status.active, 'paused, not ended')
      assert.equal(rowEnd(row), endBefore, 'the end time does not move')
    } finally {
      const a = await ctx.stub.attach()
      assert.ok(a.ok && a.handshake?.type === ENVELOPE.type.response, JSON.stringify(a))
    }
    const listed = await listedGrant(ctx, g.grantId)
    assert.ok(listed, 'listed again after the new attach')
    assert.deepEqual({ paused: listed.paused, uses: listed.uses, expiresAt: listed.expiresAt }, { paused: false, uses: usesBefore, expiresAt: endBefore })
    await run(g.sid, g.prefix + ' after-on', '07c')
    assert.equal(grantRow(ctx, g.grantId).uses, usesBefore + 1)
  })

  it('END-08 a restart: unexpired grants survive and cover; one past its end time does not', LONG, async () => {
    const long = await granted('08a')
    const short = await granted('08b', GRANT_C.shortGrantMs * 2)
    await run(long.sid, long.prefix + ' x', '08x')
    const usesBefore = grantRow(ctx, long.grantId).uses
    const endBefore = rowEnd(grantRow(ctx, long.grantId))
    for (const sid of [long.sid, short.sid]) await ctx.host.call('flush', { sessionId: sid })
    await restartGrantStub(ctx)
    // The restart ended the live agents; resume them so they can run again.
    for (const sid of [long.sid, short.sid]) await ctx.host.call('resume', { sessionId: sid })
    const row = grantRow(ctx, long.grantId)
    assert.deepEqual({ status: row.status, uses: row.uses, end: rowEnd(row) }, { status: GRANT_C.status.active, uses: usesBefore, end: endBefore })
    const listed = await listedGrant(ctx, long.grantId)
    assert.ok(listed, 'listed after the restart: ' + JSON.stringify(await listedGrants(ctx)))
    assert.deepEqual({ uses: listed.uses, expiresAt: listed.expiresAt, paused: listed.paused }, { uses: usesBefore, expiresAt: endBefore, paused: false })
    assert.ok(((await ctx.host.state()).managed ?? []).some((e) => e.sessionId === long.sid), 'managed status survives')
    await run(long.sid, long.prefix + ' after-restart', '08y')
    await sleep(Math.max(0, rowEnd(grantRow(ctx, short.grantId)) - Date.now()) + GRANT_C.pastEndMs)
    await notRun(short.sid, short.prefix + ' late', '08z')
  })
})
