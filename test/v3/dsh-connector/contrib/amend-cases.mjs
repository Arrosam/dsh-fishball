/**
 * C-EXT cases for the K1 amendment after W2 (mcp-schema index.d.ts `EventDraft.activationTag`,
 * `Mailbox.retireContributor`; R-EXT-19). No design case names these rows, so they are K1-AMEND-4.
 *
 * - Equivalence Partitioning (tags): every draft C-EXT commits carries an `activationTag` that is a
 *   non-empty string; one activation's drafts all carry one tag (to any recipient); a new activation
 *   (reload, disable + enable) carries another.
 * - State Transition (withdrawal): when a contributor activation ends (disable, uninstall, reload)
 *   or is quarantined, C-EXT calls `mailbox.retireContributor(namespace, tag)` with that
 *   activation's namespace and tag, instead of retiring event by event; the outcome is R-EXT-19's
 *   (pending retired, acked stays), and a reload retires only the old activation's events.
 *
 * Level: as cases.mjs, over world.mjs (real cordis and loader, the K1 FakeMailbox, which implements
 * `retireContributor` from K1's wording).
 */
import assert from 'node:assert/strict'
import { assertEmitOk, assertRetired, note, nsOf, pendingAndAcked, quarantine, row } from './cases.mjs'
import { FIXTURE } from './constants.mjs'
import { eventually, worldFor } from './world.mjs'

const ID = 'K1-AMEND-4'
const D = FIXTURE.pairs.d

/** The activationTag of every event C-EXT committed for contributor `c`, in commit order. */
const tagsOf = (world, c) => world.mailbox.commits.filter((x) => x.event.payload?.namespace === nsOf(c)).map((x) => x.event.activationTag)
/** The one tag of `c`'s commits from index `from` on (one activation), required to be a non-empty string. */
function activationTag(world, c, from = 0) {
  const tags = tagsOf(world, c).slice(from)
  assert.ok(tags.length > 0, 'harness: no commit of this contributor')
  for (const tag of tags) assert.ok(typeof tag === 'string' && tag.length > 0, `a committed draft carries no non-empty string activationTag: ${JSON.stringify(tag)}`)
  assert.equal(new Set(tags).size, 1, `one activation's drafts carry several tags: ${JSON.stringify(tags)}`)
  return tags[0]
}
/** C-EXT withdrew `c`'s activation `tag` through retireContributor, and by no per-event retire. */
async function assertWithdrawnBy(world, c, tag) {
  const expected = { namespace: nsOf(c), activationTag: tag }
  await eventually(() => world.mailbox.retireContributorCalls.some((x) => x.namespace === expected.namespace && x.activationTag === tag), 'retireContributor(namespace, tag) is called')
  assert.deepEqual(world.mailbox.retireCalls, [], 'C-EXT still retires event by event')
}

export function registerCExtAmendCases(sdk) {
  const r = (part, title, fn, pkg = FIXTURE.pkg.board) => row(sdk, ID, part, title, async (t) => {
    const world = await worldFor(t, sdk)
    await fn(world, await world.add(pkg))
  })

  // ---- Equivalence Partitioning: the tag on each draft ----
  r('EP 1', 'every committed draft carries a non-empty string activationTag', async (w, c) => {
    await assertEmitOk(w, c, note())
    activationTag(w, c)
  })
  r('EP 2', 'one activation: every draft carries the same tag, whatever its recipient', async (w, c) => {
    await assertEmitOk(w, c, note())
    await assertEmitOk(w, c, note({ sessionId: FIXTURE.session.managed }))
    await assertEmitOk(w, c, note({ sessionId: FIXTURE.session.unmanaged }))
    assert.equal(new Set(w.mailbox.commits.map((x) => x.recipient)).size, 2, 'harness: two recipients')
    activationTag(w, c)
  })
  for (const [part, how, act] of [
    ['EP 3 (reload)', 'a reload', (w, c) => w.restart(c)],
    ['EP 3 (disable + enable)', 'a disable and re-enable', async (w, c) => { await w.disable(c); await w.enable(c) }],
  ]) {
    r(part, `${how} starts a new activation: its drafts carry a different tag`, async (w, c) => {
      await assertEmitOk(w, c, note())
      const first = activationTag(w, c)
      const from = tagsOf(w, c).length
      await act(w, c)
      await assertEmitOk(w, c, note())
      assert.notEqual(activationTag(w, c, from), first, 'the new activation reuses the old tag')
    })
  }
  row(sdk, ID, 'EP 4', 'two contributors carry different tags', async (t) => {
    const w = await worldFor(t, sdk)
    const a = await w.add(FIXTURE.pkg.board)
    const b = await w.add(FIXTURE.pkg.other)
    await assertEmitOk(w, a, note())
    await assertEmitOk(w, b, note())
    assert.notEqual(activationTag(w, a), activationTag(w, b))
  })

  // ---- State Transition: the activation ends or is quarantined ----
  for (const [part, how, act] of [
    ['ST 1 (disabled)', 'the plugin is disabled', (w, c) => w.disable(c)],
    ['ST 1 (uninstalled)', 'the plugin is uninstalled', (w, c) => w.uninstall(c)],
    ['ST 1 (reloaded)', 'the plugin is reloaded', (w, c) => w.restart(c)],
  ]) {
    r(part, `Active → ${how} → retireContributor(namespace, that activation's tag); pending retired, acked stays`, async (w, c) => {
      const events = await pendingAndAcked(w, c)
      const tag = activationTag(w, c)
      await act(w, c)
      await assertWithdrawnBy(w, c, tag)
      await assertRetired(w, events)
    })
  }
  r('ST 2 (quarantined)', 'Active → quarantined → retireContributor(namespace, tag); pending retired, acked stays', async (w, c) => {
    const events = await pendingAndAcked(w, c)
    const tag = activationTag(w, c)
    await quarantine(sdk, w, c)
    await assertWithdrawnBy(w, c, tag)
    await assertRetired(w, events)
  })
  r('ST 3 (reload keeps new)', 'a reload retires only the old activation\'s events: an event of the new activation stays pending', async (w, c) => {
    await assertEmitOk(w, c, note())
    const oldTag = activationTag(w, c)
    await w.restart(c)
    await assertWithdrawnBy(w, c, oldTag)
    const from = tagsOf(w, c).length
    const fresh = await assertEmitOk(w, c, note())
    const newTag = activationTag(w, c, from)
    assert.ok(!w.mailbox.retireContributorCalls.some((x) => x.activationTag === newTag), 'the new activation was withdrawn')
    assert.ok(w.mailbox.pending(D.principalKey).some((e) => e.eventId === fresh.eventId), 'the new activation\'s event is not pending')
  })
  r('ST 4 (all recipients)', 'events of one activation to two pairs: one withdrawal retires both', async (w, c) => {
    const toD = await assertEmitOk(w, c, note())
    const toE2 = await assertEmitOk(w, c, note({ sessionId: FIXTURE.session.managed }))
    const tag = activationTag(w, c)
    await w.disable(c)
    await assertWithdrawnBy(w, c, tag)
    for (const { eventId } of [toD, toE2]) assert.ok(w.mailbox.retirements.some((x) => x.eventId === eventId), `${eventId} is not retired`)
  })
  row(sdk, ID, 'ST 5 (other contributor)', 'disabling one contributor withdraws only its namespace: the other\'s events stay pending', async (t) => {
    const w = await worldFor(t, sdk)
    const a = await w.add(FIXTURE.pkg.board)
    const b = await w.add(FIXTURE.pkg.other)
    await assertEmitOk(w, a, note())
    const kept = await assertEmitOk(w, b, note())
    await w.disable(a)
    await assertWithdrawnBy(w, a, activationTag(w, a))
    assert.ok(!w.mailbox.retireContributorCalls.some((x) => x.namespace === nsOf(b)), 'the other contributor was withdrawn')
    assert.ok(w.mailbox.pending(D.principalKey).some((e) => e.eventId === kept.eventId))
  })
}
