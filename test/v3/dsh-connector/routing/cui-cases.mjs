/**
 * R-FIX-CUI black-box rows for UI-01 of the connector-UI review
 * (.runtime/reports/review-x-dsh-connector-ui.md): management is recorded per ROOT session (a
 * subagent child, header origin 'subagent' + parentSession, belongs to its root, possibly several
 * levels up), so the hand-over service's `handOver(sessionId, …)` and `takeBack(sessionId, …)` act
 * on the root of the session they are given. The user's rule: CUI.rule.
 *
 * Expected outcomes are the requirements the parent relayed for the task, and the session-source
 * port the dev session relayed (2026-11-18): `sessions.rootOf(id) → Promise<root | undefined>`,
 * undefined for no such session; a walk whose parent is gone stops at the last session that exists;
 * a read failure fails the call and never treats the session as a root. No routing or handover
 * module body was read.
 *
 * Level: integration, the C-ROUTE world (subject.mjs routeWorld: real storage and mailbox; the
 * session source is fakes.mjs FakeSessions with a child → parent map).
 *
 * Techniques: Decision Table (operation × the given id's kind × the root's state), Equivalence
 * Partitioning (root, child, unknown, orphan), Boundary Value (chain depth 0, 1, 2) and State
 * Transition (Unmanaged → Managed(B) through a child → Unmanaged through the root, and back).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { expectNone, expectOne, managedSet } from './cases.mjs'
import { CUI, EVENT_TYPE, HANDOVER, WAIT } from './constants.mjs'
import { routeWorld } from './subject.mjs'

const T = Object.freeze({ timeout: WAIT.testMs })
const S = CUI.sessions
const CODE = HANDOVER.codes
const row = (sdk, part, title, fn) => test(caseName(sdk, CUI.id, part, title), T, fn)

/**
 * A world with A and B paired, root R, its child C, C's child G, and O (a child of a parent that is
 * not a session). `managedBy` (a principal name of `ids`) manages R before the row acts.
 */
async function chainWorld(t, sdk, { managedBy } = {}) {
  const w = await routeWorld(t, sdk)
  const keys = { a: w.principal(CUI.ids.a), b: w.principal(CUI.ids.b) }
  w.sessions.add(S.root)
  w.sessions.child(S.child, S.root)
  w.sessions.child(S.grandchild, S.child)
  w.sessions.child(S.orphan, S.goneParent)
  if (managedBy !== undefined) assert.deepEqual(await w.managed.manage(S.root, keys[managedBy]), { ok: true }, 'harness: manage refused')
  return { w, keys }
}
/** The managed set as `[[sessionId, principalKey]]`, and the service's own `managed()` ids. */
const owners = (w) => managedSet(w).map((r) => [r.sessionId, r.principalKey])
const listedIds = (w) => w.handover.managed().map((m) => m.sessionId).sort()

/** A Hand over of `sessionId` that succeeds for `key` and manages `root`: one handover {root, note} to `key`. */
async function handsOverRoot(w, sessionId, key, root) {
  const { value, event } = await expectOne(w, () => w.handover.handOver(sessionId, key, CUI.note), key, EVENT_TYPE.handover)
  assert.equal(value?.ok, true, `handOver(${sessionId}) refused: ${JSON.stringify(value)}`)
  assert.equal(value.principal.key, key)
  assert.deepEqual(event.payload, { sessionId: root, note: CUI.note }, 'the handover event does not name the root')
  assert.deepEqual(owners(w), [[root, key]], 'the managed set is not exactly the root')
  assert.deepEqual(listedIds(w), [root], 'managed() lists another session than the root')
  return event
}
/** A Take back of `sessionId` that ends `root`'s management by `key`: one takeback {root, note} to `key`. */
async function takesBackRoot(w, sessionId, key, root) {
  const { value, event } = await expectOne(w, () => w.handover.takeBack(sessionId, CUI.note), key, EVENT_TYPE.takeback)
  assert.deepEqual(value, { ok: true })
  assert.deepEqual(event.payload, { sessionId: root, note: CUI.note }, 'the takeback event does not name the root')
  assert.deepEqual(owners(w), [], 'a session is still managed after the Take back')
  return event
}
/** A refusal with `code` that changes nothing and commits nothing. */
async function refuses(w, act, code) {
  const before = owners(w)
  const { value } = await expectNone(w, act)
  assert.deepEqual(value, { ok: false, code })
  assert.deepEqual(owners(w), before, 'a refusal changed the managed set')
}

/** Every R-FIX-CUI UI-01 row of the routing suite for `sdk`. */
export function registerCuiCases(sdk) {
  // ---------------------------------------------------------------- DT: Hand over × the root's state
  row(sdk, 'DT handOver (child, root unmanaged)', 'Hand over C to B → ok; B manages R; managed() lists R only, never C; one handover {sessionId: R} to B', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.child, keys.b, S.root)
    assert.equal(w.managed.managerOf(S.root), keys.b)
    assert.equal(w.managed.managerOf(S.child), undefined, 'C has a manager entry of its own')
  })
  row(sdk, 'DT handOver (child, root managed by A)', 'R managed by A; Hand over C to B → conflict; R still A\'s; no C entry; no event for anyone', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    await refuses(w, () => w.handover.handOver(S.child, keys.b, CUI.note), CODE.conflict)
    assert.deepEqual(owners(w), [[S.root, keys.a]])
  })
  row(sdk, 'DT handOver (child, root managed by A, to A)', 'R managed by A; Hand over C to A itself → conflict (already managed, by anyone); nothing changes', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    await refuses(w, () => w.handover.handOver(S.child, keys.a, CUI.note), CODE.conflict)
  })

  // ---------------------------------------------------------------- DT: Take back × the root's state
  row(sdk, 'DT takeBack (child, root managed by A)', 'R managed by A; Take back C → {ok: true}; R unmanaged; one takeback {sessionId: R} to A', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    await takesBackRoot(w, S.child, keys.a, S.root)
  })
  row(sdk, 'DT takeBack (child, root unmanaged)', 'nobody manages R; Take back C → not-managed; no event', async (t) => {
    const { w } = await chainWorld(t, sdk)
    await refuses(w, () => w.handover.takeBack(S.child, CUI.note), CODE.notManaged)
  })

  // ---------------------------------------------------------------- EP: the root itself, unknown, orphan
  row(sdk, 'EP (root id)', 'a root id behaves as before: Hand over R to B → ok, the event names R; Take back R → ok, takeback to B', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.root, keys.b, S.root)
    await takesBackRoot(w, S.root, keys.b, S.root)
  })
  row(sdk, 'EP (unknown session)', 'an id no session has → unknown-session for Hand over and for Take back; nothing changes', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    await refuses(w, () => w.handover.handOver(S.goneParent, keys.b, CUI.note), CODE.unknownSession)
    await refuses(w, () => w.handover.takeBack(S.goneParent, CUI.note), CODE.unknownSession)
  })
  row(sdk, 'EP (parent gone)', 'O\'s parent is no session of this DSH → O is its own root (the walk stops at the last session that exists): Hand over O to B manages O', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.orphan, keys.b, S.orphan)
  })
  row(sdk, 'EP (root read fails)', 'the session source cannot be read → Hand over and Take back of C fail (reject or refuse, never ok); nothing changes; no event; C is never treated as a root', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    w.sessions.failRoots = true
    for (const act of [() => w.handover.handOver(S.child, keys.b, CUI.note), () => w.handover.takeBack(S.child, CUI.note)]) {
      const { value } = await expectNone(w, () => Promise.resolve().then(act).then((v) => v, (error) => ({ rejected: error })))
      assert.notEqual(value?.ok, true, 'a call whose root could not be read succeeded: ' + JSON.stringify(value))
      assert.deepEqual(owners(w), [[S.root, keys.a]], 'a failed root read changed the managed set')
    }
  })

  // ---------------------------------------------------------------- BVA: chain depth 2 (grandchild)
  row(sdk, 'BVA (depth 2: grandchild)', 'Hand over G (C\'s child) to B → B manages the top root R; Take back G → R unmanaged, takeback {sessionId: R} to B', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.grandchild, keys.b, S.root)
    await takesBackRoot(w, S.grandchild, keys.b, S.root)
  })
  row(sdk, 'BVA (depth 2, root managed)', 'R managed by A; Hand over G to B → conflict; Take back G → ok, takeback to A', async (t) => {
    const { w, keys } = await chainWorld(t, sdk, { managedBy: 'a' })
    await refuses(w, () => w.handover.handOver(S.grandchild, keys.b, CUI.note), CODE.conflict)
    await takesBackRoot(w, S.grandchild, keys.a, S.root)
  })

  // ---------------------------------------------------------------- ST: one root, entered through any member of its tree
  row(sdk, 'ST (via child → via root → via grandchild)', 'Unmanaged –Hand over C to B→ Managed(B) of R –Hand over R to A→ conflict –Take back R→ Unmanaged (takeback to B) –Hand over G to A→ Managed(A) of R –Take back C→ Unmanaged (takeback to A)', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.child, keys.b, S.root)
    await refuses(w, () => w.handover.handOver(S.root, keys.a, CUI.note), CODE.conflict)
    await takesBackRoot(w, S.root, keys.b, S.root)
    await handsOverRoot(w, S.grandchild, keys.a, S.root)
    await takesBackRoot(w, S.child, keys.a, S.root)
  })
  row(sdk, 'ST (restart)', 'Hand over C to B, then a connector restart → R is still B\'s and C has no entry of its own', async (t) => {
    const { w, keys } = await chainWorld(t, sdk)
    await handsOverRoot(w, S.child, keys.b, S.root)
    await w.reopen()
    assert.deepEqual(owners(w), [[S.root, keys.b]])
  })
}
