/**
 * R-FIX-CUI UI-01 end to end (.runtime/reports/review-x-dsh-connector-ui.md UI-01; DECISION_TEXT.own):
 * on a real DSH, a real subagent child C of root R (DSH's own `subagent` tool, scripted model, as
 * APR-17 makes one; C has finished, so it resolves through its persisted header). Hand over / Take
 * back of C, through `dshConnectorHandover` and the owner's UI routes, act on R; afterwards session
 * tools and permission routing agree: R's manager reads C and R, another principal is `forbidden`,
 * and C's permission request goes to R's manager. Expected outcomes are the requirements the parent
 * relayed for the task; no connector module is read.
 * Techniques: Decision Table (the surface × the root's state), State Transition (Unmanaged –Hand
 * over C→ Managed(P) of R –Take back C→ Unmanaged).
 */
import assert from 'node:assert/strict'
import { EVENT_TYPE, IX, REFUSAL, SURFACE, TOOL } from './constants.mjs'
import { row } from './rows.mjs'
import { call, cid, eventually, free, managedOf, ofType, pending, permissionsFor, principal, session, step, tok, turn, world } from './subject.mjs'

const ID = 'RFC-UI01'
const H = SURFACE.service.handover
const READ = Object.freeze({ maxMessages: 4, maxBytes: 4096 })
const ROUTE = Object.freeze({ handOver: SURFACE.route.uiHandOver, takeBack: SURFACE.route.uiTakeBack })
const STATUS = Object.freeze({ ok: 200, refused: 409 })
/** K3 refusal codes (host-services/handover.d.ts). */
const K3 = Object.freeze({ conflict: 'conflict', notManaged: 'not-managed' })

/** A root session R on the standard preset whose turn spawns one subagent child C (finished): `{root, child}`. */
async function rootAndChild(w) {
  const root = await session(w, IX.dsh.standardPreset)
  const marker = tok('child')
  await w.call('queueMarker', { marker, except: root, script: [[{ text: 'child done' }]] })
  await turn(w, root, [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn'))])
  assert.ok(await eventually(async () => (await w.call('markerState', { marker }))?.sessions.length > 0), 'harness: the subagent never ran')
  const [child] = (await w.call('markerState', { marker })).sessions
  assert.notEqual(child, root, 'harness: the child is the root')
  return { root, child }
}
const managedIds = async (w) => (await managedOf(w)).map((m) => m.sessionId).sort()
const readOf = (p, sessionId) => call(p.client, TOOL.sessionRead, { sessionId, ...READ })
/** One of the two surfaces the user's Hand over / Take back reach: the service, or the owner's UI route. */
const SURFACES = Object.freeze([
  ['service', {
    handOver: async (w, sessionId, p) => (await w.service(H, 'handOver', sessionId, p.principalKey)).value,
    takeBack: async (w, sessionId) => (await w.service(H, 'takeBack', sessionId)).value,
  }],
  ['UI route', {
    handOver: async (w, sessionId, p) => (await w.owner('POST', ROUTE.handOver, { sessionId, principalKey: p.principalKey })).json,
    takeBack: async (w, sessionId) => (await w.owner('POST', ROUTE.takeBack, { sessionId })).json,
  }],
])

export function registerCuiInteractionCases(sdk) {
  for (const [part, via] of SURFACES) {
    row(sdk, ID, `ST (${part}: Hand over child → Take back child)`, 'Hand over C to P → ok; managed() lists R, never C; P gets one handover naming R; Take back C → ok; nothing is managed; P gets one takeback naming R', async (t) => {
      const w = await world(sdk)
      const p = await principal(t, w)
      const { root, child } = await rootAndChild(w)
      assert.equal((await via.handOver(w, child, p))?.ok, true)
      assert.deepEqual(await managedIds(w), [root])
      const events = async (type) => ofType(await pending(p.client), type)
      assert.ok(await eventually(async () => (await events(EVENT_TYPE.handover)).length > 0), 'no handover event')
      assert.deepEqual((await events(EVENT_TYPE.handover)).map((e) => e.payload.sessionId), [root])
      assert.equal((await via.takeBack(w, child))?.ok, true)
      assert.deepEqual(await managedIds(w), [])
      assert.ok(await eventually(async () => (await events(EVENT_TYPE.takeback)).length > 0), 'no takeback event')
      assert.deepEqual((await events(EVENT_TYPE.takeback)).map((e) => e.payload.sessionId), [root])
    })
    row(sdk, ID, `DT (${part}: root managed by P, Hand over child to Q)`, 'R handed to P; Hand over C to Q → conflict; R still P\'s, no C entry; Take back C with R unmanaged later → not-managed', async (t) => {
      const w = await world(sdk)
      const p = await principal(t, w)
      const q = await principal(t, w)
      const { root, child } = await rootAndChild(w)
      assert.equal((await w.service(H, 'handOver', root, p.principalKey)).value?.ok, true)
      const refused = await via.handOver(w, child, q)
      assert.deepEqual([refused?.ok, refused?.code], [false, K3.conflict])
      assert.deepEqual((await managedOf(w)).map((m) => [m.sessionId, m.principal.key]), [[root, p.principalKey]])
      assert.equal((await w.service(H, 'takeBack', root)).value?.ok, true)
      const notManaged = await via.takeBack(w, child)
      assert.deepEqual([notManaged?.ok, notManaged?.code], [false, K3.notManaged])
    })
  }
  /** R and its finished child C, handed over from C to P; Q is another paired principal. */
  async function handedFromChild(t) {
    const w = await world(sdk)
    const p = await principal(t, w)
    const q = await principal(t, w)
    const { root, child } = await rootAndChild(w)
    assert.equal((await w.service(H, 'handOver', child, p.principalKey)).value?.ok, true, 'harness: Hand over of the child refused')
    return { w, p, q, root, child }
  }
  for (const [part, target] of [['the child', (x) => x.child], ['the root', (x) => x.root]]) {
    row(sdk, ID, `DT (after Hand over from the child: session_read of ${part})`, `P (R's manager) reads ${part} → ok; Q → forbidden`, async (t) => {
      const x = await handedFromChild(t)
      const mine = await readOf(x.p, target(x))
      assert.equal(mine.ok, true, `the root's manager cannot read ${part}: ` + JSON.stringify(mine))
      const other = await readOf(x.q, target(x))
      assert.deepEqual([other.ok, other.code], [false, REFUSAL.forbidden], `another principal reads ${part}`)
    })
  }
  row(sdk, ID, 'DT (after Hand over from the child: permission routing)', 'a permission request of a new subagent child of R goes to P (R\'s manager), never to Q', async (t) => {
    const { w, p, q, root } = await handedFromChild(t)
    await w.call('askInNewAgents', { on: true })
    t.after(() => w.call('askInNewAgents', { on: false }))
    const marker = tok('sub')
    const text = tok('cui')
    await w.call('queueMarker', { marker, except: root, script: [step(IX.fixture.askTool, { text }, cid('sub')), [{ text: 'sub done' }]] })
    await free(w, root)
    await w.call('driveStart', { sessionId: root, text: tok('u'), script: [step(IX.dsh.subagentTool, { description: tok('d'), prompt: marker }, cid('spawn')), [{ text: 'done' }]] })
    assert.ok(await eventually(async () => (await permissionsFor(p, text)).length > 0), 'the child\'s request did not reach the root\'s manager')
    assert.deepEqual(await permissionsFor(q, text), [], 'another principal got the child\'s request')
    await free(w, root)
  })
  // The route's statuses for a child (UI routes: 200 ok, 409 a K3 refusal).
  row(sdk, ID, 'EP (UI route statuses)', 'POST handover of C → 200; again for another principal → 409 conflict; POST takeback of C → 200; again → 409 not-managed', async (t) => {
    const w = await world(sdk)
    const p = await principal(t, w)
    const q = await principal(t, w)
    const { child } = await rootAndChild(w)
    const post = (route, body) => w.owner('POST', route, body)
    assert.equal((await post(ROUTE.handOver, { sessionId: child, principalKey: p.principalKey })).status, STATUS.ok)
    assert.equal((await post(ROUTE.handOver, { sessionId: child, principalKey: q.principalKey })).status, STATUS.refused)
    assert.equal((await post(ROUTE.takeBack, { sessionId: child })).status, STATUS.ok)
    assert.equal((await post(ROUTE.takeBack, { sessionId: child })).status, STATUS.refused)
  })
}
