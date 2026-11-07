/**
 * I6 — the model-sync button's main side: Check → choose → Add (docs/slim-native-design.md §10,
 * §18.2 I6 "R, the sync button", §18.7 "New cases are needed for untick / none ticked / Cancel /
 * stale `checkId` / an id not in the list / a restart between Check and Add / wire lost during
 * Add (`result-unknown`)").
 * Observation points:
 * - createChildProviderSync (src/provider-sync-service.js) `check()` / `add({checkId, ids})`, wired
 *   over an in-memory lifecycle wire to the child's real provider-sync endpoint and engine, whose
 *   host is the existing fake child host (writes observable) — test/support/body-soul-sync.mjs;
 * - registerProviderSyncRoutes (src/slim/host/provider-sync-routes.js) with a stand-in Fetch
 *   registry, for the two owner routes `models/check` and `models/add`.
 * The card's UI (ticks, disabled states, the result line) is the browser phase.
 *
 * Fixture inventory: main has `new-provider`, `second-provider` (both missing in the child),
 * `existing-provider` (same profile in the child → present), `conflict-provider` (different
 * profile in the child → notOffered `provider-conflict`) and one provider whose profile names an
 * env variable FBTEST_PLANTED_API_KEY_ENV (not copyable here → notOffered).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I6-S-P-01 | P | check → `{checkId, missing:[{id,name,models}], notOffered:[{id,name,reason}], present}`; missing = the two new ones with their model ids; conflict in notOffered as `provider-conflict`; present 1 |
 * | I6-S-P-02 | P | check writes nothing and reads no key |
 * | I6-S-P-03 | P (untick one) | add([one]) → only it is written, reported `added`; the unticked one is neither written nor reported |
 * | I6-S-P-04 | P (incremental) | a second check lists only the one not added |
 * | I6-S-BVA-01 | BVA (missing 0) | everything present → `missing: []` |
 * | I6-S-BVA-02 | BVA (missing 1 / 5) | 1 and 5 missing → listed exactly |
 * | I6-S-BVA-03 | BVA (ticked 0) | add([]) → nothing written, no key read |
 * | I6-S-BVA-03b | BVA (ticked 0) | the answer code for add([]) — todo: open question |
 * | I6-S-BVA-04 | BVA (ticked all) | add(all missing) → all `added` |
 * | I6-S-BVA-05 | BVA (list age = life − 1 s) | add accepted |
 * | I6-S-BVA-06 | BVA (list age = life + 1 s) | refused (`preview-expired`/`repreview-required`/`sync-closed`), nothing written, no key read |
 * | I6-S-EP-01..03 | EP (id not in the list) | a present id / a notOffered id / an unknown id → refused `invalid-selection`, nothing written, no key read |
 * | I6-S-EP-04 | EP (stale checkId) | an unknown checkId → refused, nothing written, no key read |
 * | I6-S-EP-05 | EP (one-use checkId) | the same checkId a second time → refused, nothing more written |
 * | I6-S-ST-01 | ST (concurrent Check) | two check() in flight share one check (same answer, one child preview) |
 * | I6-S-ST-02 | ST (Add during Add) | a second add while one runs → refused `sync-busy`; its entries not written |
 * | I6-S-ST-03 | ST (wire lost during Add) | every entry of that request → `failed` `result-unknown` |
 * | I6-S-ST-04 | ST (restart between Check and Add) | add after a new wire → refused before any key is read, nothing written |
 * | I6-S-ST-05 | ST (main providers changed between Check and Add) | refused `repreview-required` before any key is read, nothing written |
 * | I6-S-ST-06 | ST (instance stopped: coordinator closed) | add → refused, nothing written |
 * | I6-S-ST-07 | ST (wire lost during Check) | check fails with `child-sync-disconnected` or `sync-closed` |
 * | I6-S-ST-08 | ST (Cancel) | check, then no add → nothing written, no key read |
 * | I6-S-SEC-01 | EP (secret round trip) | no answer (check, add, refusals) carries a key, mask, endpoint, protocol or the planted env variable name |
 * | I6-R-P-01 | P | `POST models/check` (no body) → 200 with the service's check answer |
 * | I6-R-P-02 | P | `POST models/add` `{checkId, ids}` → 200; the service gets exactly that payload |
 * | I6-R-EP-01..10 | EP | an Add body that is not exactly `{checkId: string, ids: string[]}` → 400; service not called |
 * | I6-R-BVA-01 | BVA | an Add body of exactly SYNC_PAGE.maxBodyBytes bytes → accepted |
 * | I6-R-BVA-02 | BVA | maxBodyBytes + 1 → 400, service not called |
 * | I6-R-BVA-03 | BVA | a check body of maxBodyBytes + 1 → 400 |
 * | I6-R-EP-11 | EP | `Sec-Fetch-Site: cross-site` → refused (not 200), service not called, on both routes |
 * | I6-R-SEC-01 | EP | the route answers over the real bridge carry no planted secret |
 * | I6-R-P-03 | P | the routes are exactly `/api/fishball-instance/models/check` and `/models/add` |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CASE, inventory, provider } from './support/provider-sync-engine.mjs'
import { loadInstance } from './support/body-soul-env.mjs'
import { PREVIEW_LIFE_MS, SYNC_IDS as ID, post, routeContext, syncHarness } from './support/body-soul-sync.mjs'

const { SYNC_PAGE } = await loadInstance('src/provider-sync-service.js')
const { registerProviderSyncRoutes, PROVIDER_SYNC_ROUTE } = await loadInstance('src/slim/host/provider-sync-routes.js')

const ROUTE = Object.freeze({ check: '/api/fishball-instance/models/check', add: '/api/fishball-instance/models/add' })
/** The refusals §10 names for an Add whose check is no longer valid. */
const STALE = Object.freeze(['repreview-required', 'preview-expired', 'sync-closed'])
const NOTHING = Object.freeze({ additions: [], imports: [] })
const ids = (list) => list.map((item) => item.id).sort()

function assertRefused(answer, codes) {
  assert.equal(answer.ok, false, 'refused')
  if (codes !== undefined) assert.ok([codes].flat().includes(answer.error?.code), 'code ' + answer.error?.code + ' not in ' + [codes].flat())
}

describe('I6 sync service: check', () => {
  it('I6-S-P-01 check answers the browser shape with only what is missing', async (t) => {
    const h = await syncHarness(t)
    const answer = await h.check()
    assert.equal(answer.ok, true)
    const result = answer.result
    assert.deepEqual(Object.keys(result).sort(), ['checkId', 'missing', 'notOffered', 'present'])
    assert.equal(typeof result.checkId, 'string')
    assert.ok(result.checkId.length > 0)
    assert.deepEqual(ids(result.missing), [ID.add, ID.second].sort())
    for (const item of result.missing) {
      assert.deepEqual(Object.keys(item).sort(), ['id', 'models', 'name'])
      assert.equal(typeof item.name, 'string')
      assert.deepEqual(item.models, CASE.profile.models.map((m) => m.id))
    }
    for (const item of result.notOffered) assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'reason'])
    assert.equal(result.notOffered.find((item) => item.id === ID.conflict)?.reason, 'provider-conflict')
    assert.ok(result.notOffered.some((item) => item.id === ID.plantedEnv), 'the env-key provider is not offered here')
    assert.equal(result.present, 1)
  })
  it('I6-S-P-02 check writes nothing and reads no key', async (t) => {
    const h = await syncHarness(t)
    await h.check()
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-BVA-01 nothing missing → missing is empty', async (t) => {
    const h = await syncHarness(t, { source: inventory(CASE.source, [provider(ID.exists)]), target: inventory(CASE.target, [provider(ID.exists)]) })
    const { result } = await h.check()
    assert.deepEqual(result.missing, [])
    assert.equal(result.present, 1)
  })
  for (const count of [1, 5]) {
    it('I6-S-BVA-02 ' + count + ' missing → listed exactly', async (t) => {
      const fresh = Array.from({ length: count }, (_, i) => 'fresh-' + (i + 1))
      const h = await syncHarness(t, { source: inventory(CASE.source, fresh.map((id) => provider(id))), target: inventory(CASE.target, []) })
      assert.deepEqual(ids((await h.check()).result.missing), fresh.sort())
    })
  }
  it('I6-S-ST-01 concurrent checks share one check in flight', async (t) => {
    const h = await syncHarness(t)
    const [a, b] = await Promise.all([h.check(), h.check()])
    assert.deepEqual(a, b)
    assert.equal(h.child.calls.inventory, 1, 'one child preview')
  })
  it('I6-S-ST-07 the wire is lost during the check → it fails with its code', async (t) => {
    const h = await syncHarness(t)
    const hold = h.holdInventoryAt(1)
    const pending = h.check()
    await hold.arrived
    h.lose()
    hold.release()
    assertRefused(await pending, ['child-sync-disconnected', 'sync-closed'])
  })
})

describe('I6 sync service: add', () => {
  it('I6-S-P-03 untick one: only the ticked one is written and reported', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    const answer = await h.add({ checkId: result.checkId, ids: [ID.add] })
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.result.items, [{ id: ID.add, outcome: 'added' }])
    assert.deepEqual(h.writes(), { additions: [ID.add], imports: [ID.add] })
    assert.deepEqual(h.sourceReads, [ID.add], 'only the chosen key is read')
  })
  it('I6-S-P-04 the next check lists only what is still missing', async (t) => {
    const h = await syncHarness(t)
    const first = await h.check()
    await h.add({ checkId: first.result.checkId, ids: [ID.add] })
    assert.deepEqual(ids((await h.check()).result.missing), [ID.second])
  })
  it('I6-S-BVA-03 none ticked: add([]) writes nothing and reads no key', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    const answer = await h.add({ checkId: result.checkId, ids: [] })
    assert.equal(answer.ok === true ? answer.result.items.length : 0, 0, 'no entry reported')
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-BVA-03b the answer code for add([])', { todo: 'open question: §10 only says Add is disabled while nothing is ticked; the service answer for an empty selection is not stated' }, () => {})
  it('I6-S-BVA-04 all ticked: every missing entry is added', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    const answer = await h.add({ checkId: result.checkId, ids: result.missing.map((m) => m.id) })
    assert.deepEqual(answer.result.items.map((i) => [i.id, i.outcome]).sort(), [[ID.add, 'added'], [ID.second, 'added']].sort())
  })
  for (const [id, age, accepted] of [['I6-S-BVA-05', PREVIEW_LIFE_MS - 1000, true], ['I6-S-BVA-06', PREVIEW_LIFE_MS + 1000, false]]) {
    it(id + ' list age = preview life ' + (accepted ? '− 1 s → accepted' : '+ 1 s → refused, nothing written'), async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
      const h = await syncHarness(t)
      const { result } = await h.check()
      t.mock.timers.tick(age)
      const answer = await h.add({ checkId: result.checkId, ids: [ID.add] })
      if (accepted) {
        assert.deepEqual(answer.result?.items, [{ id: ID.add, outcome: 'added' }])
      } else {
        assertRefused(answer, STALE)
        assert.deepEqual(h.writes(), NOTHING)
        assert.deepEqual(h.sourceReads, [])
      }
    })
  }
  for (const [id, label, chosen] of [['I6-S-EP-01', 'a present id', ID.exists], ['I6-S-EP-02', 'a notOffered id', ID.conflict], ['I6-S-EP-03', 'an unknown id', ID.missing]]) {
    it(id + ' ' + label + ' → invalid-selection, nothing written, no key read', async (t) => {
      const h = await syncHarness(t)
      const { result } = await h.check()
      assertRefused(await h.add({ checkId: result.checkId, ids: [ID.add, chosen] }), 'invalid-selection')
      assert.deepEqual(h.writes(), NOTHING)
      assert.deepEqual(h.sourceReads, [])
    })
  }
  it('I6-S-EP-04 an unknown checkId → refused, nothing written, no key read', async (t) => {
    const h = await syncHarness(t)
    await h.check()
    assertRefused(await h.add({ checkId: 'f'.repeat(64), ids: [ID.add] }), STALE)
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-EP-05 a checkId is one-use: the second Add with it is refused', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    await h.add({ checkId: result.checkId, ids: [ID.add] })
    assertRefused(await h.add({ checkId: result.checkId, ids: [ID.second] }), STALE)
    assert.deepEqual(h.writes(), { additions: [ID.add], imports: [ID.add] })
  })
  it('I6-S-ST-02 an Add while another Add runs → sync-busy', async (t) => {
    const h = await syncHarness(t)
    const a = await h.check()
    const b = await h.check()
    // Inventory reads so far: one per check; the third is the running Add's re-check in the child.
    const hold = h.holdInventoryAt(3)
    const first = h.add({ checkId: a.result.checkId, ids: [ID.add] })
    await hold.arrived
    const second = await h.add({ checkId: b.result.checkId, ids: [ID.second] })
    hold.release()
    await first
    assertRefused(second, 'sync-busy')
    assert.equal(h.writes().additions.includes(ID.second), false)
    assert.equal(h.sourceReads.includes(ID.second), false)
  })
  it('I6-S-ST-03 the wire is lost during the Add → every entry failed result-unknown', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    const hold = h.holdInventoryAt(2)
    const pending = h.add({ checkId: result.checkId, ids: [ID.add, ID.second] })
    await hold.arrived
    h.lose()
    hold.release()
    const answer = await pending
    assert.equal(answer.ok, true)
    assert.deepEqual(answer.result.items.map((i) => [i.id, i.outcome, i.reason]).sort(), [[ID.add, 'failed', 'result-unknown'], [ID.second, 'failed', 'result-unknown']].sort())
  })
  it('I6-S-ST-04 the child restarted between Check and Add → refused before any key is read', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    h.lose()
    h.connect()
    assertRefused(await h.add({ checkId: result.checkId, ids: [ID.add] }), STALE)
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-ST-05 the main providers changed between Check and Add → repreview-required before any key is read', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    h.sourceState.inventory.providers.push(provider('late-provider'))
    assertRefused(await h.add({ checkId: result.checkId, ids: [ID.add] }), 'repreview-required')
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-ST-06 the instance stopped (bridge closed) between Check and Add → refused, nothing written', async (t) => {
    const h = await syncHarness(t)
    const { result } = await h.check()
    h.sync.close()
    assertRefused(await h.add({ checkId: result.checkId, ids: [ID.add] }), STALE)
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-ST-08 Cancel (no Add after a Check) writes nothing and reads no key', async (t) => {
    const h = await syncHarness(t)
    await h.check()
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.deepEqual(h.writes(), NOTHING)
    assert.deepEqual(h.sourceReads, [])
  })
  it('I6-S-SEC-01 no answer carries a key, mask, endpoint, protocol or env variable name', async (t) => {
    // Every h.check()/h.add() answer above already passed assertClean; this case walks one full
    // flow including each refusal kind in one place.
    const h = await syncHarness(t)
    const a = await h.check()
    await h.add({ checkId: a.result.checkId, ids: [ID.conflict] })
    await h.add({ checkId: 'f'.repeat(64), ids: [ID.add] })
    const b = await h.check()
    await h.add({ checkId: b.result.checkId, ids: [ID.add, ID.second] })
    h.assertClean(await h.check())
  })
})

describe('I6 sync routes (registerProviderSyncRoutes)', () => {
  /** A stand-in service.providerSync that records its calls. */
  function fakeSync() {
    const calls = { check: 0, add: [] }
    return {
      calls,
      providerSync: {
        async check() { calls.check++; return { ok: true, result: { checkId: 'c1', missing: [], notOffered: [], present: 0 } } },
        async add(payload) { calls.add.push(payload); return { ok: true, result: { items: [] } } },
      },
    }
  }
  function mount(service) {
    const { ctx, routes } = routeContext()
    registerProviderSyncRoutes(ctx, service)
    return routes
  }

  it('I6-R-P-03 the routes are the two §10 paths', () => {
    assert.deepEqual({ ...PROVIDER_SYNC_ROUTE }, ROUTE)
    const routes = mount(fakeSync())
    assert.deepEqual([...routes.keys()].sort(), [ROUTE.add, ROUTE.check].sort())
  })
  it('I6-R-P-01 POST models/check with no body → 200 with the check answer', async () => {
    const service = fakeSync()
    const answer = await post(mount(service), ROUTE.check, undefined)
    assert.equal(answer.status, 200)
    assert.equal(answer.json.ok, true)
    assert.equal(answer.json.result.checkId, 'c1')
    assert.equal(service.calls.check, 1)
  })
  it('I6-R-P-02 POST models/add {checkId, ids} → 200; the service gets exactly that payload', async () => {
    const service = fakeSync()
    const answer = await post(mount(service), ROUTE.add, JSON.stringify({ checkId: 'c1', ids: ['a', 'b'] }))
    assert.equal(answer.status, 200)
    assert.deepEqual(service.calls.add, [{ checkId: 'c1', ids: ['a', 'b'] }])
  })
  for (const [id, label, body] of [
    ['I6-R-EP-01', 'not JSON', '{checkId'],
    ['I6-R-EP-02', 'an array', '[]'],
    ['I6-R-EP-03', 'null', 'null'],
    ['I6-R-EP-04', 'no ids', JSON.stringify({ checkId: 'c1' })],
    ['I6-R-EP-05', 'no checkId', JSON.stringify({ ids: ['a'] })],
    ['I6-R-EP-06', 'an extra key', JSON.stringify({ checkId: 'c1', ids: ['a'], confirmed: true })],
    ['I6-R-EP-07', 'checkId a number', JSON.stringify({ checkId: 1, ids: ['a'] })],
    ['I6-R-EP-08', 'ids not an array', JSON.stringify({ checkId: 'c1', ids: 'a' })],
    ['I6-R-EP-09', 'ids with a number', JSON.stringify({ checkId: 'c1', ids: ['a', 2] })],
    ['I6-R-EP-10', 'an empty body', ''],
  ]) {
    it(id + ' an Add body that is ' + label + ' → 400, service not called', async () => {
      const service = fakeSync()
      const answer = await post(mount(service), ROUTE.add, body)
      assert.equal(answer.status, 400)
      assert.equal(answer.json?.ok, false)
      assert.deepEqual(service.calls.add, [])
    })
  }
  /** A valid Add body padded with JSON whitespace to exactly `bytes` bytes. */
  const padded = (bytes) => {
    const core = JSON.stringify({ checkId: 'c1', ids: ['a'] })
    return core + ' '.repeat(bytes - Buffer.byteLength(core))
  }
  it('I6-R-BVA-01 an Add body of exactly maxBodyBytes → accepted', async () => {
    const service = fakeSync()
    const answer = await post(mount(service), ROUTE.add, padded(SYNC_PAGE.maxBodyBytes))
    assert.equal(answer.status, 200)
    assert.equal(service.calls.add.length, 1)
  })
  it('I6-R-BVA-02 an Add body of maxBodyBytes + 1 → 400, service not called', async () => {
    const service = fakeSync()
    const answer = await post(mount(service), ROUTE.add, padded(SYNC_PAGE.maxBodyBytes + 1))
    assert.equal(answer.status, 400)
    assert.deepEqual(service.calls.add, [])
  })
  it('I6-R-BVA-03 a check body of maxBodyBytes + 1 → 400, service not called', async () => {
    const service = fakeSync()
    const answer = await post(mount(service), ROUTE.check, ' '.repeat(SYNC_PAGE.maxBodyBytes + 1))
    assert.equal(answer.status, 400)
    assert.equal(service.calls.check, 0)
  })
  for (const path of [ROUTE.check, ROUTE.add]) {
    it('I6-R-EP-11 Sec-Fetch-Site: cross-site on ' + path + ' → refused, service not called', async () => {
      const service = fakeSync()
      const answer = await post(mount(service), path, JSON.stringify({ checkId: 'c1', ids: ['a'] }), { 'sec-fetch-site': 'cross-site', 'content-type': 'application/json' })
      assert.notEqual(answer.status, 200)
      assert.equal(answer.json?.ok, false)
      assert.equal(service.calls.check, 0)
      assert.deepEqual(service.calls.add, [])
    })
  }
  it('I6-R-SEC-01 route answers over the real bridge carry no planted secret', async (t) => {
    const h = await syncHarness(t)
    const routes = mount({ providerSync: h.sync })
    const check = await post(routes, ROUTE.check, undefined)
    h.assertClean(check.text)
    const add = await post(routes, ROUTE.add, JSON.stringify({ checkId: check.json.result.checkId, ids: [ID.add] }))
    h.assertClean(add.text)
    assert.deepEqual(add.json.result.items, [{ id: ID.add, outcome: 'added' }])
  })
})
