import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { C, MULTI } from './constants.mjs'
import { registerMultiCases } from './multi.mjs'
import { registerLifecycleCases } from './lifecycle.mjs'
import { SEAM_TARGETS } from './targets-oracle.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { boot, brokenBoardCopy, contracts, forbiddenImports, manifest, patches, request, requestAs } from './subject.mjs'
import { until } from '../../../support/util.mjs'
/** Core's `set` once app ready has settled it (null before). */
async function settledSet(h) {
  let s
  await until(async () => { s = await h.call('snapshot'); return s?.set != null }, C.budget.call, C.budget.poll)
  return s?.set
}
export function registerWireCases(sdk) {
  registerMultiCases(sdk)
  registerLifecycleCases(sdk)
  test(`${sdk} WIRE-EP-01 manifest exports and dependency boundary`, () => {
    const pkg = manifest()
    for (const key of C.exports) assert.ok(pkg.exports[key], key)
    assert.deepEqual(Object.keys(pkg.exports).filter((k) => k.startsWith('./slim/')), [])
    assert.deepEqual(Object.keys(pkg.peerDependencies ?? {}).filter((k) => C.forbiddenDependency.test(k)), [])
  })
  test(`${sdk} WIRE-EP-02 no cross-side imports anywhere in Fishball packages`, () => assert.deepEqual(forbiddenImports(), []))
  test(`${sdk} WIRE-DT-01 patch inserts main and preserved rows, no V2 rows`, async () => {
    const rows = (await patches(sdk)).flatMap((p) => p.insert ?? [])
    for (const id of C.rows) assert.equal(rows.filter((r) => r.id === id).length, C.one, id)
    assert.equal(rows.find((r) => r.id === C.core)?.name, C.main)
    for (const id of C.absentRows) assert.equal(rows.some((r) => r.id === id), false, id)
  })
  test(`${sdk} WIRE-EP-03 model seam and core tool tables`, async () => {
    const values = await contracts()
    assert.deepEqual(values.FISHBALL_MODEL, C.modelSeam)
    for (const table of C.coreToolTables) assert.ok(values.GUARDS.coreTools.some((entry) => entry.module === table.module && entry.table === table.table), table.table)
  })
  for (const members of [[C.core], [C.ui, C.core], [C.board, C.ui, C.core]]) {
    let live; let first
    const get = () => first ??= boot(sdk, members).then((h) => { live = h; return h })
    after(async () => live?.stop())
    const prefix = `${sdk} WIRE-SYS ${members.join('+')}`
    test(`${prefix} apiVersion and complete public service shape`, async () => {
      const f = await (await get()).call('shape')
      // MULTI-0: apiVersion 2; ui.targets replaces the scalar ui.link / connect / pairing.
      assert.equal(f.apiVersion, MULTI.apiVersion)
      for (const key of C.members) assert.ok(f.shape[key], key)
      for (const key of C.managerMembers) assert.equal(f.shape.manager[key], 'function', key)
      for (const key of MULTI.uiMembers) assert.ok(f.shape.ui[key], key)
      for (const key of MULTI.withdrawnUiMembers) assert.equal(f.shape.ui[key], undefined, 'withdrawn ui.' + key)
    })
    // MULTI-0 (StatusSnapshot): the scalar `line` moved into each TargetView; standalone has none.
    test(`${prefix} no-target status is on with an empty target list`, async () => {
      const s = await (await get()).call('snapshot')
      assert.equal(s.fishball, 'on')
      assert.deepEqual(s.targets, { version: SEAM_TARGETS.snapshotVersion, targets: [] }, JSON.stringify(s))
      for (const key of MULTI.withdrawnStatusMembers) assert.equal(Object.hasOwn(s, key), false, 'withdrawn status member ' + key)
    })
    // SHELVE-BOARD: core's set check has no board member, so the set is ok with the board absent or present.
    test(`${prefix} SHELVE set is ok, nothing missing, never naming fishball-board`, async () => {
      const h = await get()
      // Precondition of the "board present" partition: the stand-in's row really is loaded.
      if (members.includes(C.board)) assert.deepEqual((await h.call('rows', { ids: [C.board] })).map((r) => [r.present, r.disabled]), [[true, false]], 'the stand-in board row is not loaded')
      assert.deepEqual(await settledSet(h), C.shelved.set)
    })
    test(`${prefix} manager ensure is idempotent; generated identity stays out of settings`, async () => {
      const h = await get(); const f = await h.call('ensure')
      assert.ok(f.id)
      assert.equal(f.a, f.id); assert.equal(f.b, f.id)
      assert.equal(f.ids.filter((id) => id === f.id).length, C.one)
      assert.equal(f.ids.length, C.one)
      // DESIGN §20: "Generated `identity.id` | Kept in core's storage domain `fishball_core_main`, not
      // in the settings document". The user's layer stays without it; the generated id itself (Connect
      // agent_id) is covered by test/v3/fishball-core/manager MGR-ID-EP-02 / MGR-ID-ST-01.
      const config = await h.call('config'); assert.equal(config.user?.identity?.id, undefined, JSON.stringify(config.user))
    })
    test(`${prefix} manager tool scope and guards hold`, async () => {
      const h = await get(); await h.call('ensure'); const f = await h.call('tools')
      for (const name of C.coreTools) { assert.ok(f.local.includes(name), name); assert.equal(f.global.includes(name), false, name) }
      assert.equal(f.local.includes(C.bareAsk), false, 'the bare ask_user is offered (MULTI-0: per target only)')
      assert.ok(f.local.some((n) => C.privateSkill.test(n)))
      assert.equal(f.global.some((n) => C.privateSkill.test(n)), false)
      const optional = members.includes(C.board) ? (n) => n.startsWith(C.boardToolPrefix) : () => false
      assert.deepEqual(f.local.filter((n) => !C.coreTools.includes(n) && !C.privateSkill.test(n) && !optional(n)).sort(), [...C.baseTools].sort())
      const guards = await h.call('guards'); assert.equal(guards.status, C.guardsOk, JSON.stringify(guards)); assert.deepEqual(guards.overridden, [])
    })
    test(`${prefix} persona has only V3 tool names`, async () => {
      const h = await get(); await h.call('ensure'); const requests = await h.call('turn')
      assert.ok(requests.length)
      const system = requests.map((r) => r.system).join(C.empty)
      for (const name of C.persona.present) assert.ok(system.includes(name), name)
      for (const name of C.persona.absent) assert.equal(system.includes(name), false, name)
      // SHELVE-BOARD: without the board, nothing in the manager's prompt or tools mentions it.
      if (!members.includes(C.board)) assert.equal(C.shelved.mention.exec(JSON.stringify(requests.map((r) => ({ system: r.system, tools: r.tools?.map((t) => t.name) }))))?.[0], undefined, 'a board mention')
      assert.equal(JSON.stringify(requests).includes(C.opaqueSecret), false)
    })
    // MULTI-0 withdrew GET/POST /api/fishball/connect and /connect/cancel for the per-target
    // SEAM_TARGETS.route.connect / .cancel ({targetId}); the loopback partitions are kept on them.
    test(`${prefix} Connect per target: loopback pages, cancel and callback without cookie`, async () => {
      const h = await get()
      for (const route of MULTI.withdrawnRoutes) assert.notEqual((await request(h, route, {})).status, C.status.ok, route + ' still answers')
      const added = await h.call('targetAction', { op: 'add', args: [C.target] })
      assert.equal(added.ok, true, JSON.stringify(added))
      const body = { [SEAM_TARGETS.route.targetIdField]: added.targetId }
      // Loopback pages ("Loopback Origin host (127.0.0.1, localhost, [::1]) → loopback callback"; "No
      // Origin with a loopback Host → loopback"), on the listener's port so DSH's fence admits them.
      // Without a target the loopback press refuses with a configuration code, never the insecure one.
      const { port } = new URL(h.origin)
      for (const name of C.loopbackHosts) {
        const authority = name + ':' + port
        for (const origin of [C.scheme.http + authority, C.scheme.https + authority, undefined]) {
          const begin = await requestAs(h, SEAM_TARGETS.route.connect, { authority, origin, body })
          const why = authority + ' ' + origin + ' ' + begin.text
          assert.equal(begin.status, C.status.ok, why); assert.equal(begin.json?.outcome, 'needs-configuration', why)
          assert.ok(C.configurationCodes.includes(begin.json.code), why); assert.notEqual(begin.json.code, C.insecureCode, why)
        }
      }
      const cancel = await request(h, SEAM_TARGETS.route.cancel, body)
      assert.equal(cancel.status, C.status.ok, cancel.text)
      assert.equal((await request(h, C.routes.callback, undefined, {}, false)).status, C.status.missing)
      await h.call('targetAction', { op: 'remove', args: [added.targetId, { confirmed: true }] })
    })
    test(`${prefix} ST model unset/default → live set → unroutable/default`, async () => {
      const h = await get(); await h.call('ensure')
      // The live selection is the model of the manager's next request (interface: "applied to the live
      // manager session on activation and on every `model` change"); Agent.options is create-time.
      const waitModel = async (want) => { let last; await until(async () => (last = await h.call('requestModel')) === want, C.budget.call, C.budget.poll); return last }
      assert.equal(await h.call('requestModel'), C.defaultModel)
      await h.call('mutate', { path: C.modelSeam.path, value: C.selection })
      assert.equal(await waitModel(C.selection.model), C.selection.model)
      await h.call('mutate', { path: C.modelSeam.path, value: C.unroutable })
      assert.equal(await waitModel(C.defaultModel), C.defaultModel)
      await h.call('mutate', { path: C.modelSeam.path, unset: true })
    })
    // MULTI-0 withdrew the `target.url` setting: a target added through ui.targets moves the status.
    test(`${prefix} ST an added target appears in the status snapshot and leaves on removal`, async () => {
      const h = await get()
      const added = await h.call('targetAction', { op: 'add', args: [C.target] })
      assert.equal(added.ok, true, JSON.stringify(added))
      let s; await until(async () => { s = await h.call('snapshot'); return s.targets?.targets.some((t) => t.targetId === added.targetId) }, C.budget.call, C.budget.poll)
      assert.ok(s.targets.targets.some((t) => t.targetId === added.targetId), JSON.stringify(s))
      await h.call('targetAction', { op: 'remove', args: [added.targetId, { confirmed: true }] })
      await until(async () => { s = await h.call('snapshot'); return !s.targets?.targets.some((t) => t.targetId === added.targetId) }, C.budget.call, C.budget.poll)
      assert.equal(s.targets.targets.some((t) => t.targetId === added.targetId), false)
    })
    test(`${prefix} restart resumes exactly the same manager; user settings unchanged`, async () => {
      const h = await get(); const old = await h.call('ensure'); const config = await h.call('config')
      await h.stop(); live = await boot(sdk, members, h.home)
      const next = await live.call('ensure'); assert.equal(next.id, old.id); assert.equal(next.ids.length, C.one)
      // DESIGN §20 keeps the generated id out of settings; its persistence across a restart is
      // fishball-core/manager MGR-ID-ST-01. Here: the user's layer is unchanged by the restart.
      assert.deepEqual((await live.call('config')).user, config.user)
    })
  }
  // SHELVE-BOARD: the board present but broken (incompatible, so DSH skips it) is not reported either.
  {
    let live; let copy
    after(async () => {
      await live?.stop()
      // Guard the one recursive delete: the broken copy this file made under the test-homes root.
      if (copy && path.dirname(copy) === path.join(C.temp, C.homesSuffix) && path.basename(copy).startsWith(C.shelved.brokenPrefix)) fs.rmSync(copy, { recursive: true, force: true })
    })
    test(`${sdk} WIRE-SYS SHELVE broken fishball-board+fishball-ui+fishball-core: set ok, nothing missing`, async () => {
      copy = brokenBoardCopy()
      live = await boot(sdk, [C.board, C.ui, C.core], undefined, { [C.board]: copy })
      assert.deepEqual(await settledSet(live), C.shelved.set)
    })
  }
  test(`${sdk} WIRE browser callback completion and matching HTTPS redirect_uri`, { todo: C.todo }, () => {})
  test(`${sdk} WIRE Connect non-loopback http / mismatching https → web-callback-insecure`, { todo: C.insecureTodo }, () => {})
}
