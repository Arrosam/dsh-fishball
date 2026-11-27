/**
 * MULTI-1 system rows (USE-CASES.md "MULTI-1"): a real Fishball DSH with core installed, and fake
 * target DSHs (fishball-test-helpers/fake-connector). Expected values come only from the MULTI-0 freeze
 * (../support/targets-oracle.mjs) and PLAN-MULTI.
 * Techniques per row id: EP, BVA, DT, ST (named in each title's row id).
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from 'fishball-test-helpers/cases'
import * as K1 from 'fishball-test-helpers/connector-contract/mcp-schema'
import { FAKE_DSH, approvalBrowser as connectBrowser, startConnectFake as startFakeConnector } from 'fishball-test-helpers/fake-connector'
import { until } from 'fishball-test-helpers/wait'
import {
  APPROVAL, CONNECT, ID_PATTERN, readableOf, LINK, MCP, PARENT_NAMES, SEAM_TARGETS, TARGETS, allocateSuffix, askHandle, askToolNameOf, connectorTools, credentialNamesOf, eventMessageId, resolvedName, toolNameOf,
} from '../support/targets-oracle.mjs'
import { C, FAKE_HOST, MULTI } from './constants.mjs'
import { multiWorld } from './world.mjs'

const T = { timeout: C.budget.boot + MULTI.budget.connectMs * 4 }
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)
const ok = (r) => assert.equal(r?.ok, true, JSON.stringify(r))
const refused = (r, code) => assert.deepEqual(r, { ok: false, code })
const R = SEAM_TARGETS.refusal
const S = SEAM_TARGETS.state
const VIEW_FIELDS = Object.freeze(['targetId', 'endpointEpoch', 'serverName', 'name', 'kind', 'url', 'order', 'duplicateSuffix', 'state', 'connecting', 'link', 'connect', 'line', 'control', 'pairing', 'identity', 'contributedTools', 'removable', 'urlEditable', 'runningSessions'])
const exposed = () => connectorTools(K1.TOOLS).filter((t) => ![K1.TOOL.inboxPoll, K1.TOOL.inboxAck, K1.TOOL.pair, K1.TOOL.setName].includes(t.name))
const sourceOf = (v) => ({ targetId: v.targetId, endpointEpoch: v.endpointEpoch, serverName: v.serverName, name: v.name })
const quiet = () => sleep(MULTI.budget.quietMs)
/**
 * The `sessions_list` calls a case made itself (its own arguments). Core reads every connected
 * target's running sessions with `sessions_list {limit: 100}` on connect (the running-sessions
 * requirement of 2026-11-21, SESSIONS rows; DESIGN §35), so a raw count of that tool's calls also
 * counts core's own read; the case's calls are told apart by their arguments.
 */
const ownCalls = (fake, args) => fake.callsOf(K1.TOOL.sessionsList).filter((c) => JSON.stringify(c.args) === JSON.stringify(args))
/** RFC 6749 `state` and ConnectBegin's outcome word (connect.d.ts). */
const OAUTH_STATE = 'state'
const CONNECT_OUTCOME = Object.freeze({ approvalUrl: 'approval-url' })
/** A Connect-capable fake target (link-save's: approval page, code + PKCE); stopped after the file. */
const connectFakes = []
after(async () => { for (const f of connectFakes.splice(0)) await f.stop().catch(() => {}) })
async function connectFake() { const f = await startFakeConnector(); connectFakes.push(f); return f }

async function setMetadataUrl(w) {
  const saved = await w.h.call('mutate', { ns: C.core, ops: [{ op: 'set', path: CONNECT.setting.split(MULTI.pathDot), value: MULTI.metadataUrl }] })
  assert.equal(saved.ok, true, JSON.stringify(saved))
}

export function registerMultiCases() {
  const standalone = multiWorld()
  const hostedWith = (targetUrl) => multiWorld({ child: { targetUrl } })

  // ============================================================== MULTI-TGT: the collection
  row('MULTI-TGT-EP-01', 'standalone empty', 'standalone first run: list() is {version: 1, targets: []}; GET /api/fishball/targets answers the same; apiVersion 2; ui has targets and no scalar link/connect/pairing', async () => {
    const w = await standalone()
    assert.deepEqual(await w.list(), { version: SEAM_TARGETS.snapshotVersion, targets: [] })
    const got = await w.route(SEAM_TARGETS.route.list)
    assert.equal(got.status, SEAM_TARGETS.http.ok)
    assert.deepEqual(got.json, { version: SEAM_TARGETS.snapshotVersion, targets: [] })
    const f = await w.h.call('shape')
    assert.equal(f.apiVersion, MULTI.apiVersion)
    for (const key of MULTI.uiMembers) assert.ok(f.shape.ui[key], key)
    for (const key of MULTI.withdrawnUiMembers) assert.equal(f.shape.ui[key], undefined, 'withdrawn ui.' + key)
    for (const key of MULTI.targetsMembers) assert.equal(f.shape.ui.targets[key], 'function', 'ui.targets.' + key)
    for (const route of MULTI.withdrawnRoutes) assert.notEqual((await w.route(route)).status, SEAM_TARGETS.http.ok, route + ' still answers')
  })

  row('MULTI-TGT-EP-02', 'add refusals', 'add(): insecure http → target-insecure; malformed / blank → target-invalid; an https URL → {ok, targetId t-<16 base32>}, epoch e-<16>; the same canonical URL again (a syntactic variant too) → target-duplicate', async () => {
    const w = await standalone()
    refused(await w.act('add', MULTI.url.insecure), LINK.code.insecure)
    for (const bad of [MULTI.url.malformed, MULTI.url.blank]) refused(await w.act('add', bad), LINK.code.invalid)
    const added = await w.act('add', MULTI.url.remote)
    ok(added)
    assert.match(added.targetId, ID_PATTERN.target)
    const view = await w.view(added.targetId)
    assert.match(view.endpointEpoch, ID_PATTERN.epoch)
    assert.equal(view.url, new URL(MULTI.url.remote).href, 'the URL was not canonicalised')
    refused(await w.act('add', MULTI.url.remote), R.targetDuplicate)
    refused(await w.act('add', MULTI.url.remoteVariant), R.targetDuplicate)
    assert.equal((await w.list()).targets.length, 1)
  })

  row('MULTI-TGT-DT-01', 'remove / setUrl', 'remove/setUrl: unconfirmed → confirmation-required (nothing changes); unknown id → unknown-target; confirmed remove → gone; setUrl to a new endpoint replaces the epoch, a variant canonicalising to the same endpoint keeps it', async () => {
    const w = await standalone()
    const { targetId } = await w.act('add', MULTI.url.remote)
    const before = await w.view(targetId)
    refused(await w.act('remove', targetId), R.confirmationRequired)
    refused(await w.act('remove', targetId, { confirmed: false }), R.confirmationRequired)
    refused(await w.act('setUrl', targetId, new URL(MULTI.url.otherPath, MULTI.url.remote).href), R.confirmationRequired)
    assert.deepEqual(await w.view(targetId), before, 'an unconfirmed action changed the target')
    refused(await w.act('remove', unknownId(), { confirmed: true }), R.unknownTarget)
    refused(await w.act('setUrl', unknownId(), MULTI.url.remote, { confirmed: true }), R.unknownTarget)
    ok(await w.act('setUrl', targetId, MULTI.url.remoteVariant, { confirmed: true }))
    assert.equal((await w.view(targetId)).endpointEpoch, before.endpointEpoch, 'a same-endpoint edit replaced the epoch')
    ok(await w.act('setUrl', targetId, new URL(MULTI.url.otherPath, MULTI.url.remote).href, { confirmed: true }))
    const moved = await w.view(targetId)
    assert.match(moved.endpointEpoch, ID_PATTERN.epoch)
    assert.notEqual(moved.endpointEpoch, before.endpointEpoch, 'a new endpoint kept its epoch')
    ok(await w.act('remove', targetId, { confirmed: true }))
    assert.deepEqual((await w.list()).targets, [])
    refused(await w.act('retry', targetId), R.unknownTarget)
  })

  row('MULTI-TGT-BVA-01', 'no cap and order', `${MULTI.manyTargets} targets are all accepted (Q12: no cap) and listed in ascending order; restart keeps every record (id, url, epoch, order)`, async () => {
    const w = await standalone()
    const ids = []
    for (let i = 0; i < MULTI.manyTargets; i += 1) { const r = await w.act('add', new URL(MULTI.url.otherPath + i, MULTI.url.remote).href); ok(r); ids.push(r.targetId) }
    const listed = (await w.list()).targets
    assert.deepEqual(listed.map((t) => t.targetId), ids)
    assert.deepEqual(listed.map((t) => t.order), [...listed.map((t) => t.order)].sort((a, b) => a - b))
    const keep = listed.map((t) => [t.targetId, t.url, t.endpointEpoch, t.order])
    const home = w.h.home
    await w.stop()
    const again = await standalone({ home, expect: keep.length })
    // Every target add() acknowledged is durable: a graceful restart right after keeps all of them.
    assert.deepEqual((await again.list()).targets.map((t) => [t.targetId, t.url, t.endpointEpoch, t.order]), keep, 'a target add() had acknowledged was lost across the restart')
  })

  row('MULTI-TGT-EP-03', 'view shape before discovery', 'a target added but never connected: every TargetView field; name and serverName null (never URL-derived); state not-set; identity pending; removable and urlEditable true; kind remote', async () => {
    const w = await standalone()
    const { targetId } = await w.act('add', MULTI.url.remote)
    const v = await w.view(targetId)
    assert.deepEqual(Object.keys(v).sort(), [...VIEW_FIELDS].sort())
    assert.equal(v.name, null); assert.equal(v.serverName, null)
    assert.equal(v.state, S.notSet)
    assert.equal(v.identity, SEAM_TARGETS.identity.pending)
    assert.equal(v.kind, SEAM_TARGETS.kind.remote)
    assert.equal(v.removable, true); assert.equal(v.urlEditable, true)
  })

  row('MULTI-TGT-EP-04', 'loopback alias is another endpoint', 'setUrl from http://127.0.0.1:P/… to http://localhost:P/… (two origins, R9) replaces the epoch', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const { targetId } = await w.act('add', fake.url(FAKE_HOST.first))
    const before = (await w.view(targetId)).endpointEpoch
    ok(await w.act('setUrl', targetId, fake.url(FAKE_HOST.other), { confirmed: true }))
    assert.notEqual((await w.view(targetId)).endpointEpoch, before, 'a change of origin kept the endpoint epoch')
  })

  row('MULTI-CRED-ST-01', 'standalone port edit', 'a manually added target on a different port is a new endpoint; retire the old credential and never present it to the new port', async () => {
    const w = await standalone()
    const first = await w.fake({ name: MULTI.name.office })
    const second = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(first)
    const oldNames = credentialNamesOf(a.view)
    const keys = async () => (await w.h.call('credRecords')).map((r) => r.key)
    assert.ok((await keys()).includes(oldNames.tokenRecord), 'precondition: the old endpoint saved its credential')
    assert.notEqual(new URL(first.url()).port, new URL(second.url()).port)
    ok(await w.act('setUrl', a.targetId, second.url(), { confirmed: true }))
    const changed = await w.view(a.targetId)
    assert.equal(changed.url, second.url())
    assert.notEqual(changed.endpointEpoch, a.view.endpointEpoch)
    await quiet()
    assert.equal((await keys()).includes(oldNames.tokenRecord), false, 'the retired endpoint kept its saved credential')
    assert.equal((await w.h.call('credDescribe', { ref: oldNames.tokenRef })).configured, false)
    assert.equal(second.presented().some(({ secret }) => secret === a.entry.secret), false, 'the new port received the old endpoint’s credential')
    assert.notEqual((await w.view(a.targetId)).state, S.connected)
  })

  // ============================================================== MULTI-HOST: the reserved parent
  for (const [part, targetUrl] of [['set', 'https://parent.example/api/agent/mcp'], ['blank', '   ']]) {
    row('MULTI-HOST-EP-01', part, `hosted child, dsh-instance-child.targetUrl ${part}: first target id parent, kind parent, ${part === 'set' ? 'URL from the setting' : 'not-set'}; not removable, URL not editable; remove/setUrl → target-reserved`, async () => {
      const w = await hostedWith(targetUrl)({ expect: 1 })
      const [first, ...rest] = (await w.list()).targets
      assert.deepEqual(rest, [])
      assert.equal(first.targetId, TARGETS.parentId)
      assert.equal(first.kind, SEAM_TARGETS.kind.parent)
      assert.equal(first.removable, false); assert.equal(first.urlEditable, false)
      if (part === 'set') assert.equal(first.url, targetUrl)
      else assert.equal(first.state, S.notSet)
      refused(await w.act('remove', TARGETS.parentId, { confirmed: true }), R.targetReserved)
      refused(await w.act('setUrl', TARGETS.parentId, MULTI.url.remote, { confirmed: true }), R.targetReserved)
      if (part === 'set') refused(await w.act('add', targetUrl), R.targetDuplicate)
      // An added target never satisfies the hosted probe: the parent's names stay unconfigured.
      const added = await w.act('add', MULTI.url.remote)
      ok(added)
      await w.h.call('credSet', { ref: credentialNamesOf(await w.view(added.targetId)).tokenRef, value: MULTI.otherToken })
      await quiet()
      assert.equal((await w.h.call('credDescribe', { ref: PARENT_NAMES.tokenRef })).configured, false)
      const keys = (await w.h.call('credRecords')).map((r) => r.key)
      assert.equal(keys.includes(PARENT_NAMES.savedRecord), false); assert.equal(keys.includes(PARENT_NAMES.pendingRecord), false)
    })
  }

  // ============================================================== MULTI-CRED: isolated credentials
  // Same origin, two endpoints. K3a's connector check pins the protected resource to `MCP.paths.mcp`,
  // so of two endpoints on one origin only the connector path can connect (AMBIGUITY reported: no
  // second connector endpoint can share an origin). The row proves isolation anyway: A connects, B
  // (same origin, other path) never uses, reads or overwrites A's credential, and neither touches the parent's.
  row('MULTI-CRED-EP-01', 'same origin, two targets', 'two targets on one origin: A\'s token is saved only as fishball-core/token-<A id>-<A epoch>; B\'s value stays under its own FISHBALL_TARGET_TOKEN_<B id>__<B epoch> and is never presented with A\'s; only A\'s secret reaches the token endpoint; DSH_AGENT_TOKEN and the parent records are never touched', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    const b = await w.connect(fake, { url: fake.url(undefined, MULTI.url.otherPath), connected: false })
    await quiet()
    const aNames = credentialNamesOf(await w.view(a.targetId))
    const bNames = credentialNamesOf(await w.view(b.targetId))
    assert.notEqual(aNames.tokenRef, bNames.tokenRef)
    const keys = (await w.h.call('credRecords')).map((r) => r.key)
    assert.ok(keys.includes(aNames.tokenRecord), 'no saved token record ' + aNames.tokenRecord + ' in ' + JSON.stringify(keys))
    assert.equal(keys.includes(PARENT_NAMES.savedRecord), false); assert.equal(keys.includes(PARENT_NAMES.pendingRecord), false)
    assert.equal((await w.h.call('credDescribe', { ref: PARENT_NAMES.tokenRef })).configured, false)
    const presented = fake.presented().map((p) => p.secret)
    assert.ok(presented.includes(a.entry.secret), 'A\'s secret never reached the token endpoint')
    assert.equal(presented.filter((p) => p !== a.entry.secret && p !== b.entry.secret).length, 0, 'a secret of neither target was presented')
    assert.equal(JSON.stringify(await w.h.call('credRecord', { key: aNames.tokenRecord })).includes(b.entry.secret), false, 'B\'s value was saved in A\'s record')
    const listed = JSON.stringify(await w.list())
    assert.equal(listed.includes(a.entry.secret) || listed.includes(b.entry.secret), false, 'a token value in the snapshot')
  })
  row('MULTI-CRED-ST-01', 'removal and retirement', 'confirmed setUrl to a new endpoint deletes the old epoch\'s token record and the new epoch has its own names; confirmed remove deletes the rest; nothing is sent to the target (no revocation, no answer)', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office, extraPaths: [MULTI.url.otherPath] })
    const a = await w.connect(fake)
    const oldNames = credentialNamesOf(await w.view(a.targetId))
    const sentBefore = fake.calls.filter((c) => ![K1.TOOL.inboxPoll, K1.TOOL.pair, K1.TOOL.setName].includes(c.name)).length
    ok(await w.act('setUrl', a.targetId, fake.url(undefined, MULTI.url.otherPath), { confirmed: true }))
    await quiet()
    const newView = await w.view(a.targetId)
    assert.notEqual(newView.endpointEpoch, a.view.endpointEpoch)
    let keys = (await w.h.call('credRecords')).map((r) => r.key)
    assert.equal(keys.includes(oldNames.tokenRecord), false, 'the retired epoch\'s token record is kept')
    assert.equal((await w.h.call('credDescribe', { ref: oldNames.tokenRef })).configured, false)
    assert.notEqual(credentialNamesOf(newView).tokenRef, oldNames.tokenRef)
    ok(await w.act('remove', a.targetId, { confirmed: true }))
    await quiet()
    keys = (await w.h.call('credRecords')).map((r) => r.key)
    assert.equal(keys.some((k) => k.includes(a.targetId)), false, 'token material of the removed target is kept: ' + JSON.stringify(keys))
    assert.equal(fake.calls.filter((c) => ![K1.TOOL.inboxPoll, K1.TOOL.pair, K1.TOOL.setName].includes(c.name)).length, sentBefore, 'removal sent a remote call')
  })

  row('MULTI-CRED-EP-02', 'one CIMD URL', 'connect.clientMetadataUrl is one global setting: setting it once moves every target\'s Connect out of metadata-url-missing (no per-target override)', async () => {
    const w = await standalone()
    const a = await w.act('add', MULTI.url.remote)
    const b = await w.act('add', new URL(MULTI.url.otherPath, MULTI.url.remote).href)
    for (const t of [a, b]) assert.equal((await w.view(t.targetId)).connect?.code, CONNECT.configuration.metadataUrlMissing)
    await setMetadataUrl(w)
    for (const t of [a, b]) await w.until(t.targetId, (v) => v.connect?.code !== CONNECT.configuration.metadataUrlMissing, 'the global CIMD URL in force')
  })

  // ============================================================== MULTI-NAME: discovery, duplicates, live rename
  row('MULTI-NAME-EP-01', 'name from discovery', 'the name is _meta[serverInfo].name from server/discover (not the title, not a top-level serverInfo); identity live; one listen stream subscribes to both dsh-agent://events and dsh-agent://identity', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    assert.equal(a.view.serverName, MULTI.name.office)
    assert.equal(a.view.name, MULTI.name.office)
    assert.equal(a.view.identity, SEAM_TARGETS.identity.live)
    const subscribed = fake.listens.map((l) => [...(l.filter.resourceSubscriptions ?? [])].sort())
    assert.ok(subscribed.length >= 1)
    for (const s of subscribed) assert.deepEqual(s, [MCP.events.uri, MCP.identity.uri].sort(), 'a listen stream without both URIs')
  })
  row('MULTI-NAME-EP-02', 'identity unsupported', 'a server whose resources/list lacks dsh-agent://identity → identity unsupported; the discovered name is still shown', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.lab, identity: false })
    const a = await w.connect(fake)
    assert.equal(a.view.identity, SEAM_TARGETS.identity.unsupported)
    assert.equal(a.view.name, MULTI.name.lab)
  })
  row('MULTI-NAME-DT-01', 'duplicates (D07, Q03)', 'A and B advertise Office-DSH → A Office-DSH (null), B Office-DSH (2); A renames to Lab-DSH → B stays (2); C Office-DSH → Office-DSH (lowest free); a literal "Office-DSH (2)" while (2) is held → its own (2) alias; restart keeps every allocation', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    assert.deepEqual([a.view.name, a.view.duplicateSuffix], [MULTI.name.office, null])
    assert.deepEqual([b.view.name, b.view.duplicateSuffix], [resolvedName(MULTI.name.office, TARGETS.duplicate.firstSuffix), TARGETS.duplicate.firstSuffix])
    fa.rename(MULTI.name.lab)
    await w.until(a.targetId, (v) => v.name === MULTI.name.lab, 'A renamed live')
    assert.equal((await w.view(b.targetId)).name, resolvedName(MULTI.name.office, TARGETS.duplicate.firstSuffix), 'B was renumbered')
    const fc = await w.fake({ name: MULTI.name.office })
    const c = await w.connect(fc)
    const held = [(await w.view(a.targetId)).name, (await w.view(b.targetId)).name]
    assert.equal(c.view.name, resolvedName(MULTI.name.office, allocateSuffix(MULTI.name.office, held)))
    const fd = await w.fake({ name: MULTI.name.literal2 })
    const d = await w.connect(fd)
    const heldD = (await w.list()).targets.filter((t) => t.targetId !== d.targetId).map((t) => t.name)
    assert.equal(d.view.name, resolvedName(MULTI.name.literal2, allocateSuffix(MULTI.name.literal2, heldD)), 'a literal name colliding with a held alias')
    const names = (await w.list()).targets.map((t) => [t.targetId, t.name, t.duplicateSuffix])
    assert.equal(new Set(names.map((n) => n[1])).size, names.length, 'two targets show one name')
    const home = w.h.home
    await w.stop()
    const again = await standalone({ home, expect: names.length })
    for (const t of [a, b, c, d]) await again.until(t.targetId, (v) => v.state === S.connected, 'reconnected after restart')
    assert.deepEqual((await again.list()).targets.map((t) => [t.targetId, t.name, t.duplicateSuffix]), names, 'allocations changed across restart')
  })
  row('MULTI-NAME-ST-01', 'rename into an occupied name', 'B (Lab-DSH) renames to A\'s Office-DSH → B is the later appearance: Office-DSH (2); A keeps Office-DSH', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.lab })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    fb.rename(MULTI.name.office)
    await w.until(b.targetId, (v) => v.serverName === MULTI.name.office, 'B renamed')
    assert.equal((await w.view(b.targetId)).name, resolvedName(MULTI.name.office, TARGETS.duplicate.firstSuffix))
    assert.equal((await w.view(a.targetId)).name, MULTI.name.office)
  })
  row('MULTI-NAME-ST-02', 'push and coalescing', 'a rename push triggers rediscovery at once (well under any reconnect); a burst of 5 pushes leads to at most 2 more discoveries (one in flight + one follow-up), ending on the last name; with no push for a quiet window there is no discovery (no polling)', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    await quiet()
    const idle = fake.discovers.length
    await sleep(MULTI.budget.quietMs * 2)
    assert.equal(fake.discovers.length, idle, 'a discovery without a push or a reconnect (polling)')
    const before = fake.discovers.length
    const names = [1, 2, 3, 4, 5].map((n) => MULTI.name.lab + n)
    for (const n of names) fake.rename(n)
    await w.until(a.targetId, (v) => v.name === names.at(-1), 'the last pushed name')
    await quiet()
    assert.ok(fake.discovers.length - before <= 2, `${fake.discovers.length - before} discoveries for one burst`)
    assert.ok(fake.discovers.length - before >= 1)
  })
  row('MULTI-NAME-ST-03', 'rediscover after listen ack', 'the listen stream drops and reopens: core rediscovers after the new acknowledgement and picks up a name changed while the stream was down (no push)', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    const listens = fake.listens.length
    fake.state.name = MULTI.name.lab
    fake.dropStreams()
    await until(() => fake.listens.length > listens, MULTI.budget.connectMs, MULTI.budget.pollMs)
    await w.until(a.targetId, (v) => v.name === MULTI.name.lab, 'the name read after the reopened stream')
  })
  row('MULTI-NAME-ST-04', 'transient failure keeps the name', 'a rediscovery that fails transiently keeps the last name and shows identity stale; the next push recovers it', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    fake.state.failDiscover = 1
    fake.pushIdentity()
    await w.until(a.targetId, (v) => v.identity === SEAM_TARGETS.identity.stale, 'stale')
    assert.equal((await w.view(a.targetId)).name, MULTI.name.office)
    fake.rename(MULTI.name.lab)
    await w.until(a.targetId, (v) => v.name === MULTI.name.lab && v.identity === SEAM_TARGETS.identity.live, 'recovered')
  })
  row('MULTI-NAME-ST-05', 'auth refusal tears down', 'the target revokes every token: the link is torn down (state failed, not connected) and its namespaced tools are withdrawn from the manager', async () => {
    const w = await standalone()
    const fake = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fake)
    const name = toolNameOf(sourceOf(a.view), K1.TOOL.sessionsList)
    assert.ok((await w.tools()).some((t) => t.name === name), 'precondition: the tool is offered')
    fake.revokeAll()
    fake.pushIdentity()
    await w.until(a.targetId, (v) => v.state === S.failed, 'failed after the refusal')
    let offered = true
    await until(async () => { offered = (await w.tools()).some((t) => t.name === name); return !offered }, MULTI.budget.connectMs, MULTI.budget.pollMs)
    assert.equal(offered, false, 'a refused target\'s tools are still offered')
  })

  // ============================================================== MULTI-TOOL: namespaces
  row('MULTI-TOOL-EP-01', 'every exposed tool namespaced', 'the manager sees, per target, exactly mcp__<readable>__<facade>_<12hex> for every exposed K1 tool and the local ask_user; never inbox_poll, inbox_ack, pair, set_name or a bare remote name; reminders unprefixed, once; every name ≤ 64 of [A-Za-z0-9_-]; each description starts with the framed source text', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    const tools = await w.tools()
    const names = tools.map((t) => t.name)
    for (const v of [a.view, b.view]) {
      for (const tool of exposed()) assert.ok(names.includes(toolNameOf(sourceOf(v), tool.name)), `${toolNameOf(sourceOf(v), tool.name)} missing for ${v.name}`)
      assert.ok(names.includes(askToolNameOf(sourceOf(v), MULTI.ask)), 'ask_user of ' + v.name)
    }
    for (const n of names) assert.match(n, ID_PATTERN.toolName)
    for (const raw of K1.TOOLS.map((t) => t.name)) assert.equal(names.includes(raw), false, 'bare remote/withheld name ' + raw)
    // CONN-TOOLS: the removed names are never offered in any form.
    for (const removed of K1.TOOLS.map((t) => t.name).filter((n) => !Object.values(MCP.tools).includes(n))) assert.equal(names.some((n) => n.includes(removed)), false, 'removed tool offered: ' + removed)
    assert.equal(names.filter((name) => name === MULTI.ask).length, 1, 'bare manager ask_user')
    for (const r of MULTI.reminderTools) assert.equal(names.filter((n) => n === r).length, 1, r)
    // Framing (contracts README security amendment): toolSource(JSON.stringify(name)) inside a random-marker block before the trusted text.
    for (const v of [a.view, b.view]) {
      const t = tools.find((x) => x.name === toolNameOf(sourceOf(v), K1.TOOL.sessionsList))
      const inner = TARGETS.text.toolSource(JSON.stringify(v.name))
      const at = t.description.indexOf(inner)
      assert.ok(at > 0, 'no framed source text: ' + t.description)
      const open = t.description.slice(0, at).trim()
      const close = t.description.slice(at + inner.length).trim().split('\n')[0]
      const marker = /^<untrusted-([0-9a-f-]{36})>$/.exec(open)?.[1]
      assert.ok(marker, 'the source text is not opened by a random marker: ' + open)
      assert.equal(close, `</untrusted-${marker}>`)
      assert.ok(t.description.endsWith(K1.TOOLS.find((x) => x.name === K1.TOOL.sessionsList).description), 'the trusted description does not follow')
    }
  })
  row('MULTI-TOOL-BVA-01', 'normative examples', 'names follow the README examples: 办公室-DSH → readable dsh; <b>x</b> → b-x-b; a 200-char name → readable cut to 16 and the name exactly 64 for a long facade', async () => {
    const w = await standalone()
    for (const [serverName, readable] of [['办公室-DSH', 'dsh'], [MULTI.name.markup, 'b-x-b'], ['n'.repeat(200), 'n'.repeat(TARGETS.toolName.readableMaxChars)]]) {
      const f = await w.fake({ name: serverName })
      const t = await w.connect(f)
      const names = (await w.tools()).map((x) => x.name)
      const expected = toolNameOf(sourceOf(t.view), K1.TOOL.sessionsList)
      assert.ok(expected.startsWith(TARGETS.toolName.prefix + readable + TARGETS.toolName.separator), 'fixture: ' + expected)
      assert.ok(names.includes(expected), expected + ' not offered')
      assert.equal(t.view.name, serverName, 'the display name is not the raw name (D06)')
    }
  })
  row('MULTI-TOOL-ST-01', 'rename and binding', 'on rename the old names are withdrawn and the new ones offered; a call reaches only its own target; after A renames to B\'s former name nothing is rebound to another tuple', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.lab })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    const oldA = toolNameOf(sourceOf(a.view), K1.TOOL.sessionsList)
    const got = await w.h.call('managerCall', { tool: oldA, args: MULTI.callArgs })
    assert.ok(got.offered.includes(oldA))
    assert.equal(ownCalls(fa, MULTI.callArgs).length, 1, 'A did not get its call')
    assert.equal(ownCalls(fb, MULTI.callArgs).length, 0, 'B got A\'s call')
    fa.rename(MULTI.name.office + '-2')
    const renamed = await w.until(a.targetId, (v) => v.serverName === MULTI.name.office + '-2', 'A renamed')
    const names = (await w.tools()).map((x) => x.name)
    assert.equal(names.includes(oldA), false, 'the old name is still offered')
    assert.ok(names.includes(toolNameOf(sourceOf(renamed), K1.TOOL.sessionsList)), 'the new name is not offered')
    const late = await w.h.call('managerCall', { tool: oldA, args: MULTI.callArgs })
    assert.equal(ownCalls(fb, MULTI.callArgs).length, 0, 'a withdrawn name reached another target')
    assert.ok(late.result === null || late.result.isError !== false, 'a withdrawn name answered successfully')
  })
  row('MULTI-TOOL-ST-02', 'in-flight call stays bound', 'a call in flight on A while A\'s URL is edited completes on A\'s original endpoint only; B and A\'s new endpoint get nothing', async () => {
    const w = await standalone()
    const held = Promise.withResolvers()
    const reached = Promise.withResolvers()
    // Only the case's own call is held: core's own connect read (sessions_list {limit: 100}) answers at once.
    const mine = (name, args) => name === K1.TOOL.sessionsList && JSON.stringify(args) === JSON.stringify(MULTI.callArgs)
    const fa = await w.fake({ name: MULTI.name.office, extraPaths: [MULTI.url.otherPath], onTool: (name, args) => (mine(name, args) ? (reached.resolve(), held.promise) : undefined) })
    const a = await w.connect(fa)
    const name = toolNameOf(sourceOf(a.view), K1.TOOL.sessionsList)
    const call = w.h.call('managerCall', { tool: name, args: MULTI.callArgs })
    await reached.promise
    ok(await w.act('setUrl', a.targetId, fa.url(undefined, MULTI.url.otherPath), { confirmed: true }))
    held.resolve({ sessions: [] })
    await call
    assert.deepEqual(ownCalls(fa, MULTI.callArgs).map((c) => c.endpoint), [K1.PATHS.mcp], 'the call was re-sent or moved to the new endpoint')
  })

  row('MULTI-TOOL-EP-02', 'adversarial names stay data', 'a server name holding quotes, a newline, a fake closing marker tag and a role-looking line stays entirely inside the framed block of each description; the manager persona names the tool scheme by role (mcp__<dsh>__<tool>_<id>) and never a server name', async () => {
    const w = await standalone()
    const f = await w.fake({ name: MULTI.name.adversarial })
    const a = await w.connect(f)
    const tools = await w.tools()
    for (const t of tools.filter((x) => x.name.startsWith(TARGETS.toolName.prefix + readableOf(a.view.name)))) {
      const inner = TARGETS.text.toolSource(JSON.stringify(a.view.name))
      const at = t.description.indexOf(inner)
      assert.ok(at > 0, 'no framed source text: ' + t.description)
      const marker = /^<untrusted-([0-9a-f-]{36})>$/.exec(t.description.slice(0, at).trim())?.[1]
      assert.ok(marker, 'not opened by a random marker')
      assert.equal(t.description.split('<untrusted-' + marker + '>').length, 2, 'the marker appears twice before the block')
      const outside = t.description.slice(0, at) + t.description.slice(at + inner.length)
      assert.equal(outside.includes(MULTI.name.adversarialNeedle), false, 'the server name leaks outside the framed block')
    }
    const system = await w.h.call('managerSystem')
    assert.equal(system.includes(MULTI.name.adversarialNeedle), false, 'a server name in the persona')
    assert.ok(system.includes(MULTI.personaScheme), 'the persona does not name the tool scheme by role: ' + MULTI.personaScheme)
  })

  // ============================================================== MULTI-CONN: Connect per target (Q05)
  /** Two Connect-capable targets (the link-save fake: approval page, code + PKCE), the CIMD URL set; both begun. */
  async function twoAttempts(w) {
    const fa = await connectFake(w); const fb = await connectFake(w)
    await setMetadataUrl(w)
    const ta = await w.act('add', fa.url()); const tb = await w.act('add', fb.url())
    for (const t of [ta, tb]) await w.until(t.targetId, (v) => v.connect?.state === CONNECT.state.needsAuthorization, 'needs authorization')
    const ra = await w.act('begin', ta.targetId); const rb = await w.act('begin', tb.targetId)
    for (const r of [ra, rb]) assert.equal(r?.outcome, CONNECT_OUTCOME.approvalUrl, JSON.stringify(r))
    return { fa, fb, a: ta.targetId, b: tb.targetId, ra, rb }
  }
  const grantOf = async (w, targetId) => credentialNamesOf(await w.view(targetId)).grantRecord
  row('MULTI-CONN-ST-01', 'concurrent', 'A and B begin Connect at once: two pending attempts with distinct state; a second begin on A answers the same URL; completing B first then A authorizes each with its own grant record (connect-<id>-<epoch>); neither overwrites the other', async () => {
    const w = await standalone()
    const { fa, fb, a, b, ra, rb } = await twoAttempts(w)
    assert.notEqual(new URL(ra.url).searchParams.get(OAUTH_STATE), new URL(rb.url).searchParams.get(OAUTH_STATE))
    assert.equal((await w.act('begin', a)).url, ra.url, 'a second begin started another attempt')
    await connectBrowser.approve(rb.url, { token: fb.addEntry().secret })
    await w.until(b, (v) => v.connect?.state === CONNECT.state.authorized, 'B authorized')
    assert.equal((await w.view(a)).connect?.state, CONNECT.state.authorizing, 'B\'s completion touched A\'s attempt')
    await connectBrowser.approve(ra.url, { token: fa.addEntry().secret })
    await w.until(a, (v) => v.connect?.state === CONNECT.state.authorized, 'A authorized')
    const keys = (await w.h.call('credRecords')).map((r) => r.key)
    for (const t of [a, b]) assert.ok(keys.includes(await grantOf(w, t)), 'no grant record for ' + t + ': ' + JSON.stringify(keys))
  })
  for (const [part, act] of [
    ['cancel', (w, t) => w.act('cancel', t)],
    ['remove', (w, t) => w.act('remove', t, { confirmed: true })],
    ['url edit', async (w, t) => w.act('setUrl', t, (await connectFake()).url(), { confirmed: true })],
  ]) {
    row('MULTI-CONN-DT-01', part, `A's pending attempt, then ${part}; the approval completed late → nothing is saved for A (no grant record), A not authorized by it; B's attempt is unaffected and completes`, async () => {
      const w = await standalone()
      const { fa, fb, a, b, ra, rb } = await twoAttempts(w)
      const before = await grantOf(w, a)
      ok(await act(w, a, fa))
      await connectBrowser.approve(ra.url, { token: fa.addEntry().secret }).catch(() => undefined)
      await quiet()
      const keys = (await w.h.call('credRecords')).map((r) => r.key)
      assert.equal(keys.includes(before), false, 'the late completion saved a grant for A')
      const view = await w.view(a)
      if (view !== undefined) assert.notEqual(view.connect?.state, CONNECT.state.authorized, 'A was authorized by a cancelled attempt')
      await connectBrowser.approve(rb.url, { token: fb.addEntry().secret })
      await w.until(b, (v) => v.connect?.state === CONNECT.state.authorized, 'B authorized')
    })
  }
  row('MULTI-CONN-DT-01', 'url edit to another origin of the same listener', 'A\'s attempt pending on http://127.0.0.1:P; setUrl to http://localhost:P (another origin, so another endpoint) → a new epoch; the late completion of the old attempt saves no grant and does not authorize A', async () => {
    const w = await standalone()
    const fa = await connectFake()
    await setMetadataUrl(w)
    const { targetId } = await w.act('add', fa.url(FAKE_HOST.first))
    await w.until(targetId, (v) => v.connect?.state === CONNECT.state.needsAuthorization, 'needs authorization')
    const begun = await w.act('begin', targetId)
    const before = await w.view(targetId)
    ok(await w.act('setUrl', targetId, fa.url(FAKE_HOST.other), { confirmed: true }))
    const after = await w.view(targetId)
    assert.notEqual(after.endpointEpoch, before.endpointEpoch, 'the origin changed but the epoch was kept')
    await connectBrowser.approve(begun.url, { token: fa.addEntry().secret }).catch(() => undefined)
    await quiet()
    const keys = (await w.h.call('credRecords')).map((r) => r.key)
    assert.equal(keys.some((k) => k.includes(targetId)), false, 'the retired attempt saved a grant: ' + JSON.stringify(keys))
    assert.notEqual((await w.view(targetId)).connect?.state, CONNECT.state.authorized, 'a retired attempt authorized the new endpoint')
  })

  // ============================================================== MULTI-EVT / MULTI-ASK (system)
  // Re-baselined (WAKE-BATCH, DESIGN §29, the user 2026-11-21): events are delivered in batches, so the
  // two copies of eventId X may share ONE manager message (a batch's id is its first record's own
  // message id, fbe_<handle>). What still holds: each target's copy is its own record (its own tuple,
  // so never deduplicated against the other's), each reaches the manager exactly once, and each is
  // acked only on its own target. The records are read from the delivery's source (§29: `{kind:
  // 'fishball-event', events: [{key, eventId, type, targetId}]}`) and the message ids from DSH's inbox.
  row('MULTI-EVT-SYS-01', 'same eventId, two targets', 'A and B both deliver eventId X → the manager receives both, each as its own record (A\'s and B\'s tuple) exactly once, in messages whose ids are fbe_<handle> of a record they carry; each acked only on its own target', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.lab })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    await w.h.call('ensure')
    const event = mailboxEvent(MULTI.event.id)
    fa.enqueue(structuredClone(event))
    fb.enqueue(structuredClone(event))
    const sources = [a.view, b.view]
    let batches = []
    const carried = () => batches.flatMap((x) => x.records ?? []).filter((r) => r.eventId === event.eventId)
    await until(async () => { batches = await w.h.call('managerEventBatches'); return sources.every((v) => carried().some((r) => r.targetId === v.targetId)) }, MULTI.budget.connectMs, MULTI.budget.pollMs)
    for (const v of sources) assert.equal(carried().filter((r) => r.targetId === v.targetId).length, 1, v.targetId + ' in ' + JSON.stringify(batches))
    // A batch's id is fbe_<handle> of one of its own records, so a target's copy never takes another tuple's id.
    const expectedIds = sources.map((v) => eventMessageId(v, event.eventId))
    const delivered = batches.filter((x) => (x.records ?? []).some((r) => r.eventId === event.eventId))
    for (const x of delivered) assert.ok(expectedIds.includes(x.id), 'message id ' + x.id + ' is not fbe_<handle> of a record: ' + JSON.stringify(x))
    const inbox = await w.h.call('managerInboxIds')
    for (const x of delivered) assert.equal(inbox.filter((id) => id === x.id).length, 1, x.id + ' in ' + JSON.stringify(inbox))
    await until(() => fa.acked.length > 0 && fb.acked.length > 0, MULTI.budget.connectMs, MULTI.budget.pollMs)
    assert.deepEqual(fa.acked.map((r) => r.eventId), [event.eventId]); assert.deepEqual(fb.acked.map((r) => r.eventId), [event.eventId])
  })
  row('MULTI-ASK-SYS-01', 'answer route and unknown', 'POST /api/fishball/asks/answer {handle of an unknown card} → 404 unknown-target, nothing sent; POST target routes with an unknown targetId → 404 unknown-target; a body without targetId → 400 or 404 (never 200)', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fa)
    const bogus = Buffer.from(JSON.stringify([TARGETS.key.kind.approval, a.targetId, a.view.endpointEpoch, MULTI.event.id]), 'utf8').toString(TARGETS.key.encoding)
    const r = await w.route(MULTI.askAnswerRoute, { [SEAM_TARGETS.ask.handleField]: bogus, choice: APPROVAL.decision.reject })
    assert.equal(r.status, SEAM_TARGETS.http.notFound, r.text)
    assert.equal(r.json?.code, R.unknownTarget)
    assert.equal(fa.callsOf(K1.TOOL.approvalAnswer).length, 0)
    for (const route of [SEAM_TARGETS.route.connect, SEAM_TARGETS.route.cancel, SEAM_TARGETS.route.retry, SEAM_TARGETS.route.pairing, SEAM_TARGETS.route.remove, SEAM_TARGETS.route.url]) {
      const got = await w.route(route, { [SEAM_TARGETS.route.targetIdField]: unknownId(), [SEAM_TARGETS.route.fields.confirmed]: true, [SEAM_TARGETS.route.fields.url]: MULTI.url.remote, [SEAM_TARGETS.route.fields.choice]: MULTI.choice })
      assert.equal(got.status, SEAM_TARGETS.http.notFound, route + ' ' + got.text)
      assert.equal(got.json?.code, R.unknownTarget, route)
      const none = await w.route(route, {})
      assert.ok([SEAM_TARGETS.http.badRequest, SEAM_TARGETS.http.notFound].includes(none.status), route + ' without targetId: ' + none.status)
    }
    const add = await w.route(SEAM_TARGETS.route.add, { [SEAM_TARGETS.route.fields.url]: fa.url() })
    assert.equal(add.status, SEAM_TARGETS.http.conflict); assert.equal(add.json?.code, R.targetDuplicate)
    const insecure = await w.route(SEAM_TARGETS.route.add, { [SEAM_TARGETS.route.fields.url]: MULTI.url.insecure })
    assert.equal(insecure.status, SEAM_TARGETS.http.badRequest)
    const unconfirmed = await w.route(SEAM_TARGETS.route.remove, { [SEAM_TARGETS.route.targetIdField]: a.targetId })
    assert.equal(unconfirmed.status, SEAM_TARGETS.http.conflict); assert.equal(unconfirmed.json?.code, R.confirmationRequired)
  })

  row('MULTI-ASK-SYS-02', 'two targets, equal approvalId, then removal', 'A and B offer the same approvalId; each target\'s own mcp__…__ask_user files it → two cards (handles = base64url ["approval", id, epoch, approvalId], source each its own); answering A\'s sends approval_answer on A only; removing B voids B\'s card; answering it is refused expired and sends nothing', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.lab })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    await w.h.call('ensure')
    const event = permissionEvent()
    fa.enqueue(structuredClone(event)); fb.enqueue(structuredClone(event))
    await quiet()
    for (const t of [a, b]) {
      const filed = await w.h.call('managerCall', { tool: askToolNameOf(sourceOf(await w.view(t.targetId)), MULTI.ask), args: { [MULTI.askArg]: event.offer.offerId } })
      assert.equal(filed.result?.isError, false, 'ask_user failed on ' + t.targetId + ': ' + JSON.stringify(filed.result))
    }
    const cards = await w.h.call('askCards')
    assert.equal(cards.length, 2, JSON.stringify(cards))
    for (const t of [a, b]) {
      const v = await w.view(t.targetId)
      const card = cards.find((c) => c.handle === askHandle(v, event.payload.approvalId))
      assert.ok(card, 'no card with ' + t.targetId + '\'s handle')
      assert.deepEqual(card.source, sourceOf(v))
    }
    ok(await w.h.call('askAnswer', { handle: askHandle(await w.view(a.targetId), event.payload.approvalId), answer: { choice: APPROVAL.decision.reject } }))
    assert.equal(fa.callsOf(K1.TOOL.approvalAnswer).length, 1); assert.equal(fb.callsOf(K1.TOOL.approvalAnswer).length, 0)
    const bHandle = askHandle(await w.view(b.targetId), event.payload.approvalId)
    ok(await w.act('remove', b.targetId, { confirmed: true }))
    await quiet()
    assert.equal((await w.h.call('askCards')).find((c) => c.handle === bHandle)?.state, SEAM_TARGETS.ask.voided)
    refused(await w.h.call('askAnswer', { handle: bHandle, answer: { choice: APPROVAL.decision.allow } }), MULTI.expired)
    assert.equal(fb.callsOf(K1.TOOL.approvalAnswer).length, 0, 'a voided card was answered remotely')
  })

  // ============================================================== MULTI-SVC: target-bound seams, status
  row('MULTI-SVC-DT-01', 'bridge and attention', 'bridge(plugin, ops, {targetId}) calls reach only that target; a removed target → supports false and unknown-target with nothing sent; an endpointEpoch mismatch fails closed too; attention.signal of a removed target → unknown-target', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const fb = await w.fake({ name: MULTI.name.lab })
    const a = await w.connect(fa)
    const b = await w.connect(fb)
    const ops = [K1.TOOL.sessionsList]
    const onA = await w.h.call('bridgeCall', { pluginId: MULTI.bridgePlugin, names: ops, target: { targetId: a.targetId }, name: K1.TOOL.sessionsList, args: MULTI.callArgs })
    assert.equal(onA.supports, true)
    assert.equal(ownCalls(fa, MULTI.callArgs).length, 1); assert.equal(ownCalls(fb, MULTI.callArgs).length, 0)
    const mismatch = await w.h.call('bridgeCall', { pluginId: MULTI.bridgePlugin, names: ops, target: { targetId: b.targetId, endpointEpoch: a.view.endpointEpoch }, name: K1.TOOL.sessionsList, args: MULTI.callArgs })
    assert.equal(mismatch.supports, false); assert.equal(mismatch.result?.code, R.unknownTarget)
    assert.equal(ownCalls(fb, MULTI.callArgs).length, 0, 'an epoch mismatch sent a call')
    ok(await w.act('remove', a.targetId, { confirmed: true }))
    const gone = await w.h.call('bridgeCall', { pluginId: MULTI.bridgePlugin, names: ops, target: { targetId: a.targetId }, name: K1.TOOL.sessionsList, args: MULTI.callArgs })
    assert.equal(gone.supports, false); assert.equal(gone.result?.code, R.unknownTarget)
    assert.equal(ownCalls(fa, MULTI.callArgs).length, 1, 'a removed target got a call')
    const signal = await w.h.call('attention', { pluginId: MULTI.bridgePlugin, input: { important: true }, target: { targetId: a.targetId } })
    assert.equal(signal?.code, R.unknownTarget)
  })
  row('MULTI-SVC-EP-01', 'status snapshot', 'fishballStatus.snapshot() is {fishball, guards, set, targets: {version: 1, targets}, brand: {style}} with no scalar link/connect/line/control/contributedTools; targets equals ui.targets.list(); contributedTools counts zero; an absent stored logo theme is fishball', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    await w.connect(fa)
    let snap
    await until(async () => { snap = await w.h.call('snapshot'); return snap?.set != null }, MULTI.budget.connectMs, MULTI.budget.pollMs)
    assert.deepEqual(Object.keys(snap).sort(), [...MULTI.statusMembers].sort())
    assert.deepEqual(snap.brand, { style: 'fishball' }, 'the normalized logo theme')
    for (const k of MULTI.withdrawnStatusMembers) assert.equal(Object.hasOwn(snap, k), false, k)
    assert.deepEqual(snap.targets, await w.list())
    assert.equal(snap.targets.targets[0].contributedTools, 0, 'zero contributed tools is not counted as 0')
  })
  row('MULTI-SVC-ST-01', 'one manager', 'with two connected targets there is still exactly one manager session and one set of reminder tools', async () => {
    const w = await standalone()
    await w.connect(await w.fake({ name: MULTI.name.office }))
    await w.connect(await w.fake({ name: MULTI.name.lab }))
    const f = await w.h.call('ensure')
    assert.equal(f.ids.length, C.one)
    const names = (await w.tools()).map((t) => t.name)
    for (const r of MULTI.reminderTools) assert.equal(names.filter((n) => n === r).length, 1, r)
  })
}

/** A well-formed target id no target holds (the all-first-letter id; generated ids are random). */
const unknownId = () => TARGETS.id.prefix + TARGETS.id.alphabet[0].repeat(TARGETS.id.randomChars)
/** One K1 mailbox `message` event (MAILBOX_EVENT_SCHEMA); equal ids on two targets are the case's point. */
function mailboxEvent(eventId) {
  const payload = { text: MULTI.event.textPrefix + eventId, images: [] }
  return { eventId, mailboxGeneration: FAKE_DSH.generation, sequence: MULTI.event.sequence, type: K1.EVENT_TYPE.message, at: Date.now(), sourceSessionId: null, correlationId: null, payload, payloadDigest: MULTI.event.digestFill.repeat(K1.WIRE.digestHexChars) }
}

/** One K1 permission offer event (MAILBOX_EVENT_SCHEMA, descriptor per K1 shapes); equal on two targets. */
function permissionEvent() {
  const offerId = K1.formatOfferId(MULTI.event.approvalId, K1.OFFER_ID.firstRevision)
  const payload = { approvalId: MULTI.event.approvalId, offerId, kind: K1.APPROVAL_KIND.approval, prompt: MULTI.event.prompt, choices: [], title: MULTI.event.prompt, at: Date.now(), toolName: MULTI.event.toolName, callId: null, reason: MULTI.event.prompt, quotes: [] }
  return { eventId: MULTI.event.offerEventId, mailboxGeneration: FAKE_DSH.generation, sequence: MULTI.event.sequence, type: K1.EVENT_TYPE.permission, at: Date.now(), sourceSessionId: MULTI.event.session, correlationId: offerId, offer: { offerId, revision: K1.OFFER_ID.firstRevision, decisionKind: K1.DECISION_KIND_OF[K1.EVENT_TYPE.permission] }, payload, payloadDigest: MULTI.event.digestFill.repeat(K1.WIRE.digestHexChars) }
}