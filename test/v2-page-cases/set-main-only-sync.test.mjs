/**
 * SET main-only model sync (the user's decision of 2026-11-11: "不允许子实例发起模型同步，只能主实例主动同步给子实例").
 *
 * Requirements: docs/planning/v2-set.md (child Fetch routes, settings relay, panel, exports) and
 * docs/slim-native-design.md §10 (the main card is the only entry point; key rules). Written from
 * those requirements alone; no implementation file was read.
 *
 * Seams (all real product code, no stand-in policy model):
 * - child-web/fishball-settings/index.js apply(ctx) with a fake ctx that collects its Fetch routes;
 * - src/slim/settings-relay.js server and client over the in-memory link of support/set-relay.mjs;
 * - the main side's real provider-sync bridge, coordinator, child target and engine
 *   (support/body-soul-sync.mjs, official disposable credential stores, planted fake keys), and the
 *   main owner routes (src/slim/host/provider-sync-routes.js registerProviderSyncRoutes);
 * - src/slim/host/admin.js createAdminRelay for the child → main admin channel;
 * - the slim panel's classic browser scripts in node:vm (support/set-panel.mjs);
 * - a real DSH main host with the real child (support/host.mjs) for the system cases.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | MOS-EP-01 | EP (child route set) | the child row registers exactly GET status, POST retry, POST restart; no models/* path |
 * | MOS-EP-02 | EP (relay op vocabulary) | SETTINGS_RELAY.op is exactly {status, retry, restart}; codes unchanged |
 * | MOS-DT-01 | DT (handler table: status × retry × restart present) | a server without any one of the three is refused (throws); all three → created |
 * | MOS-DT-02 | DT (extra check/add handlers × every frame) | passed check/add handlers are never called, whatever the child sends |
 * | MOS-EP-03 | EP (former and look-alike ops) | frames op check/add/CHECK/Add/'check '/models/check with {}, extra payload and a valid-looking add payload → exactly {v:1,id,ok:false,error:{code:invalid-request}}; the main sync is never reached (no inventory read, no key read, no write) |
 * | MOS-EP-04 | EP (other unknown op) | op bogus / '' → invalid-request, same shape |
 * | MOS-BVA-01 | BVA (frame id) | no id / null / number → dropped (no reply); a 1-char id and an id of limits.idChars chars → answered |
 * | MOS-EP-05 | EP (client-side ops) | request(check|add|Check, …) resolves invalid-request locally and sends nothing; status still sends one frame |
 * | MOS-ST-01 | ST (refused sync → lifecycle ops) | after refused check/add frames, status/retry/restart still answer over the same wire |
 * | MOS-ST-02 | ST (wire A → child restart → wire B) | a status request from A answered after B attached never reaches B |
 * | MOS-EP-06 | EP (unsolicited provider-sync frames) | reply-shaped, request-shaped and junk frames from the child start nothing on the main side and get no answer; an owner check afterwards works |
 * | MOS-EP-07 | EP (unsolicited admin frames) | reply-shaped and admin.restart/admin.status-shaped frames start nothing (no restart, no frame sent); an owner admin.status still answers |
 * | MOS-UC-01 | Use Case (owner check then add) | main routes: check (no body) lists only what the child lacks; add {checkId, ids} reports added / skipped (key created meanwhile) / failed per entry; OAuth never offered; key stored in credential-local, mode 0600; no key in answers, logs, temp files or relay frames |
 * | MOS-UC-02 | Use Case (child row + relay + real sync) | through the child row and relay, no child request reaches the main sync; status works |
 * | MOS-UC-03 | Use Case (main card keeps its block) | the instance client still carries the Model for Fishball block attributes and posts the two main owner routes (source presence: no main-card render seam here) |
 * | MOS-EP-08 | EP (panel, en) | no data-fishball-model-* element; exactly one note with the exact English words, no button/link inside |
 * | MOS-EP-09 | EP (panel, zh) | the same with the exact Chinese words |
 * | MOS-ST-03 | ST (panel interactions) | open, press Restart, Settings and Plugins: no request to models/check or models/add ever |
 * | MOS-EP-10 | EP (panel order) | status line, Restart, note, Read Only line, Settings/Plugins links, in that order; Retry shown while failed |
 * | MOS-EP-11 | EP (shared export) | exports.shared is exactly locale, dictionaries, mountStyles, mountStyle, useInstanceStatus, InstanceStatus; no ModelSync |
 * | MOS-SYS-01 | System (real main DSH + real child) | the child's POST models/check and models/add → 404; its status → 200; the main's POST models/check → ok with {checkId, missing, notOffered, present} |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { BODY_SOUL, loadInstance } from '../support/body-soul-env.mjs'
import { CASE as ENGINE_CASE, clone, inventory, provider } from '../support/provider-sync-engine.mjs'
import { FIXTURE as SDK_FIXTURE } from '../support/provider-sync-official.mjs'
import { post, routeContext, syncHarness } from '../support/body-soul-sync.mjs'
import { ACTIVE_SDK, parsedFrames, relayLink } from '../support/set-relay.mjs'
import { mountPanel, PANEL } from '../support/set-panel.mjs'
import { bootHost, newHome, until } from '../support/host.mjs'
import { SDK_VERSIONS } from './support.mjs'

const MOS = Object.freeze({
  task: 'SET-MAIN-ONLY',
  route: Object.freeze({
    status: '/api/fishball-instance/status',
    retry: '/api/fishball-instance/retry',
    restart: '/api/fishball-instance/restart',
    check: '/api/fishball-instance/models/check',
    add: '/api/fishball-instance/models/add',
  }),
  method: Object.freeze({ get: 'GET', post: 'POST' }),
  base: 'http://dsh.internal',
  site: Object.freeze({ header: 'sec-fetch-site', same: 'same-origin', cross: 'cross-site' }),
  rowModule: 'child-web/fishball-settings/index.js',
  relayModule: 'src/slim/settings-relay.js',
  relay: Object.freeze({
    version: 1,
    ops: Object.freeze({ status: 'status', retry: 'retry', restart: 'restart' }),
    codes: Object.freeze({
      unavailable: 'settings-relay-unavailable', disconnected: 'settings-relay-disconnected',
      timeout: 'settings-relay-timeout', closed: 'settings-relay-closed', failed: 'settings-relay-failed',
      invalid: 'invalid-request',
    }),
    clientTimeoutMs: 1000,
  }),
  /** The removed ops and their look-alikes; every one is an unknown op now. */
  syncOps: Object.freeze(['check', 'add', 'CHECK', 'Add', 'check ', 'models/check', 'models/add']),
  otherUnknownOps: Object.freeze(['bogus', '']),
  ids: Object.freeze({ a: 'provider-missing-a', b: 'provider-missing-b', c: 'provider-missing-c', existing: 'provider-existing', conflict: 'provider-conflict-fixture', oauth: 'provider-oauth-fixture' }),
  outcome: Object.freeze({ added: 'added', skipped: 'skipped', failed: 'failed' }),
  invalidSelection: 'invalid-selection',
  conflictReason: 'provider-conflict',
  fixtureWriteFailure: 'fixture child write failure',
  settleMs: 30,
  status: Object.freeze({ ready: Object.freeze({ state: 'ready', code: null, detail: null }), starting: Object.freeze({ state: 'starting', code: null, detail: null }) }),
  modelAttributes: Object.freeze(['data-fishball-model-sync', 'data-fishball-model-check', 'data-fishball-model-entry', 'data-fishball-model-add', 'data-fishball-model-result']),
  panel: Object.freeze({
    root: 'data-fishball-settings',
    state: 'data-fishball-instance-state',
    retry: 'data-fishball-instance-retry',
    restart: 'data-fishball-settings-restart',
    note: 'data-fishball-settings-model-sync-note',
    readonly: 'data-fishball-settings-readonly',
    open: 'data-fishball-settings-open',
    openTargets: Object.freeze(['settings', 'plugins']),
    interactive: Object.freeze(['button', 'a', 'input', 'select', 'textarea']),
  }),
  note: Object.freeze({
    en: 'New models from DSH are added in the main DSH: Plugins → Fishball instance → Model for Fishball.',
    zh: 'DSH 中的新模型请在主 DSH 中添加：插件 → Fishball 实例 → Fishball 的模型。',
  }),
  sharedKeys: Object.freeze(['locale', 'dictionaries', 'mountStyles', 'mountStyle', 'useInstanceStatus', 'InstanceStatus']),
  removedShared: 'ModelSync',
  admin: Object.freeze({ module: 'src/slim/host/admin.js', status: 'admin.status', restart: 'admin.restart' }),
  syncTargetModule: 'src/slim/child/provider-sync-target.js',
  credentialMode: 0o600,
  tempScanMaxBytes: 1024 * 1024,
  logMethods: Object.freeze(['log', 'info', 'warn', 'error', 'debug']),
  system: Object.freeze({
    embed: '/fishball/embed/',
    readyTimeoutMs: 120000,
    pollMs: 500,
    caseMs: 240000,
    notFound: 404,
    ok: 200,
    resultKeys: Object.freeze(['checkId', 'missing', 'notOffered', 'present']),
    homeLabel: 'set-main-only',
  }),
})
const R = MOS.relay
const ID = MOS.ids

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sortedIds = (list) => list.map((item) => item.id).sort()
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const NOTHING = Object.freeze({ additions: [], imports: [] })
const relayModule = () => loadInstance(MOS.relayModule)
const lifecycleHandlers = (calls) => ({
  status: async () => { calls.status++; return MOS.status.ready },
  retry: async () => { calls.retry++; return MOS.status.starting },
  restart: async () => { calls.restart++; return MOS.status.starting },
})

/** Capture console output for the duration of `body`; answers every captured line. */
async function captureLogs(body) {
  const lines = []
  const saved = MOS.logMethods.map((name) => console[name])
  for (const name of MOS.logMethods) console[name] = (...args) => { lines.push(args.map(String).join(' ')) }
  try { await body() } finally { MOS.logMethods.forEach((name, index) => { console[name] = saved[index] }) }
  return lines
}

/** Every regular file under os.tmpdir() modified since `since`, bounded, outside the credential stores. */
function recentTempFiles(since) {
  const stores = path.resolve(SDK_FIXTURE.root)
  const found = []
  const walk = (dir) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (full.startsWith(stores)) continue
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) {
        try {
          const stat = fs.statSync(full)
          if (stat.mtimeMs >= since && stat.size <= MOS.tempScanMaxBytes) found.push(full)
        } catch { /* gone meanwhile */ }
      }
    }
  }
  walk(os.tmpdir())
  return found
}

/**
 * A real relay server whose main end is the real provider-sync bridge. Its check/add handlers are
 * passed on purpose: the requirement says they are never called.
 */
async function relayToSync(t, h) {
  const { createSettingsRelayServer } = await relayModule()
  const calls = { status: 0, retry: 0, restart: 0, check: 0, add: 0 }
  const server = createSettingsRelayServer({
    ...lifecycleHandlers(calls),
    check: async () => { calls.check++; return h.sync.check() },
    add: async (payload) => { calls.add++; return h.sync.add(payload) },
  })
  t.after(() => server.close())
  return { server, calls }
}

/** Raw child end on a fresh link to `server`: send frames, collect replies. */
function rawChild(server) {
  const link = relayLink()
  server.attach(link.main)
  const replies = []
  link.child.onMessage((text) => replies.push(JSON.parse(text)))
  return { link, replies, send: (frame) => link.child.send(JSON.stringify(frame)) }
}

function assertMainUntouched(h, calls, message) {
  assert.equal(calls.check, 0, message + ': the check handler was called')
  assert.equal(calls.add, 0, message + ': the add handler was called')
  assert.equal(h.sourceCalls.inventory, 0, message + ': the main provider inventory was read')
  assert.deepEqual(h.sourceReads, [], message + ': a main key was read')
  assert.deepEqual(h.writes(), NOTHING, message + ': the child was written')
  assert.equal(h.child.calls.inventory, 0, message + ': a check reached the child')
}

/** The child row on a fake ctx; answers its registered routes and a relay connector. */
async function childRow(t) {
  const row = await loadInstance(MOS.rowModule)
  const routes = new Map()
  const listeners = new Set()
  const disposers = []
  const ctx = {
    connection: {
      requestRejection: ({ headers }) => (headers.get?.(MOS.site.header) === MOS.site.cross ? 403 : undefined),
      fetch: { register(route) { routes.set(route.path, route); return () => routes.delete(route.path) } },
    },
    nativeRuntime: { onInstanceSettingsTransport(listener) { listeners.add(listener); return () => listeners.delete(listener) } },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
  }
  row.apply(ctx)
  t.after(() => { for (const dispose of disposers.reverse()) { try { dispose() } catch { /* already gone */ } } })
  return {
    row, routes,
    connect(server) { const link = relayLink(); server.attach(link.main); for (const fn of [...listeners]) fn(link.child); return link },
    async call(method, routePath, body) {
      const route = routes.get(routePath)
      assert.ok(route, 'child route registered: ' + routePath)
      const init = { method, headers: { 'content-type': 'application/json', [MOS.site.header]: MOS.site.same } }
      if (body !== undefined) init.body = JSON.stringify(body)
      const response = await route.fetch(new Request(MOS.base + routePath, init))
      const text = await response.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: response.status, json, text }
    },
  }
}

const profileWith = (models) => {
  const [template] = ENGINE_CASE.profile.models
  return { ...clone(ENGINE_CASE.profile), models: models.map((id) => ({ ...clone(template), id, name: id })) }
}
function standardSync(t) {
  return syncHarness(t, {
    source: inventory(ENGINE_CASE.source, [provider(ID.a, { profile: profileWith(['alpha-small', 'alpha-large']) }), provider(ID.b), provider(ID.existing)]),
    target: inventory(ENGINE_CASE.target, [provider(ID.existing)]),
  })
}

/* ------------------------------------------------------------------------------ case bodies */

const IN_PROCESS = [
  ['MOS-EP-01', 'EP', 'the child row registers only status, retry and restart', async (t) => {
    const { routes } = await childRow(t)
    assert.deepEqual([...routes.keys()].sort(), [MOS.route.restart, MOS.route.retry, MOS.route.status].sort(), 'exactly the three lifecycle routes')
    for (const gone of [MOS.route.check, MOS.route.add]) assert.equal(routes.has(gone), false, gone + ' is not registered in the child')
    assert.equal([...routes.keys()].some((p) => p.includes('/models/')), false, 'no models/* route in the child')
    const methods = (p) => [routes.get(p).methods ?? routes.get(p).method].flat().map(String)
    assert.deepEqual(methods(MOS.route.status), [MOS.method.get])
    assert.deepEqual(methods(MOS.route.retry), [MOS.method.post])
    assert.deepEqual(methods(MOS.route.restart), [MOS.method.post])
  }],

  ['MOS-EP-02', 'EP', 'the relay op vocabulary is exactly status, retry and restart', async () => {
    const { SETTINGS_RELAY } = await relayModule()
    assert.deepEqual({ ...SETTINGS_RELAY.op }, { ...R.ops }, 'SETTINGS_RELAY.op is exactly {status, retry, restart}')
    assert.equal(Object.hasOwn(SETTINGS_RELAY.op, 'check'), false)
    assert.equal(Object.hasOwn(SETTINGS_RELAY.op, 'add'), false)
    assert.deepEqual({ ...SETTINGS_RELAY.code }, { ...R.codes }, 'the relay codes are unchanged')
    assert.equal(SETTINGS_RELAY.version, R.version)
  }],

  ['MOS-DT-01', 'Decision Table', 'the server requires status, retry and restart handlers', async () => {
    const { createSettingsRelayServer } = await relayModule()
    const calls = { status: 0, retry: 0, restart: 0 }
    for (const missing of Object.keys(R.ops)) {
      const handlers = lifecycleHandlers(calls)
      delete handlers[missing]
      assert.throws(() => createSettingsRelayServer(handlers), 'a server without ' + missing + ' is refused')
    }
    const server = createSettingsRelayServer(lifecycleHandlers(calls))
    assert.equal(typeof server.attach, 'function')
    server.close()
  }],

  ['MOS-DT-02', 'Decision Table', 'check and add handlers passed to the server are never called', async (t) => {
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const raw = rawChild(server)
    const payloads = [{}, { checkId: 'fixture-check', ids: [ID.a] }]
    let n = 0
    for (const op of ['check', 'add']) for (const payload of payloads) raw.send({ v: R.version, id: 'dt02-' + n++, op, payload })
    for (const op of Object.keys(R.ops)) raw.send({ v: R.version, id: 'dt02-' + n++, op, payload: {} })
    await delay(MOS.settleMs)
    assertMainUntouched(h, calls, 'passed check/add handlers')
    assert.equal(calls.status + calls.retry + calls.restart, Object.keys(R.ops).length, 'each lifecycle op ran once')
  }],

  ['MOS-EP-03', 'EP', 'former and look-alike sync ops from the child are refused invalid-request and reach nothing', async (t) => {
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const raw = rawChild(server)
    const payloads = [{}, { extra: true }, { checkId: 'fixture-check', ids: [ID.a, ID.b] }, { checkId: 'f'.repeat(64), ids: [] }]
    const sent = []
    const logs = await captureLogs(async () => {
      for (const op of MOS.syncOps) {
        for (const payload of payloads) {
          const id = 'ep03-' + sent.length
          sent.push(id)
          raw.send({ v: R.version, id, op, payload })
        }
      }
      await delay(MOS.settleMs)
    })
    assert.deepEqual(raw.replies.map((reply) => reply.id).sort(), [...sent].sort(), 'every frame with an id is answered once')
    for (const reply of raw.replies) assert.deepEqual(reply, { v: R.version, id: reply.id, ok: false, error: { code: R.codes.invalid } }, 'exact invalid-request reply')
    assertMainUntouched(h, calls, 'sync-op frames')
    h.assertClean(raw.link.frames.toChild)
    h.assertClean(logs)
  }],

  ['MOS-EP-04', 'EP', 'any other unknown op is refused the same way', async (t) => {
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const raw = rawChild(server)
    MOS.otherUnknownOps.forEach((op, index) => raw.send({ v: R.version, id: 'ep04-' + index, op, payload: {} }))
    await delay(MOS.settleMs)
    assert.deepEqual(raw.replies.map((reply) => [reply.id, reply.ok, reply.error?.code]).sort(), MOS.otherUnknownOps.map((_op, index) => ['ep04-' + index, false, R.codes.invalid]).sort())
    assertMainUntouched(h, calls, 'unknown ops')
    assert.equal(calls.status + calls.retry + calls.restart, 0, 'no lifecycle handler runs for an unknown op')
  }],

  ['MOS-BVA-01', 'BVA', 'a frame without a usable id is dropped; a usable id is answered', async (t) => {
    const { SETTINGS_RELAY } = await relayModule()
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const raw = rawChild(server)
    raw.send({ v: R.version, op: 'check', payload: {} })
    raw.send({ v: R.version, id: null, op: 'add', payload: { checkId: 'fixture-check', ids: [ID.a] } })
    raw.send({ v: R.version, id: 7, op: 'check', payload: {} })
    await delay(MOS.settleMs)
    assert.deepEqual(raw.replies, [], 'frames with no usable id get no reply')
    const shortest = 'x'
    const longest = 'i'.repeat(SETTINGS_RELAY.limits.idChars)
    raw.send({ v: R.version, id: shortest, op: 'check', payload: {} })
    raw.send({ v: R.version, id: longest, op: 'add', payload: { checkId: 'fixture-check', ids: [ID.a] } })
    await delay(MOS.settleMs)
    assert.deepEqual(raw.replies.map((reply) => [reply.id, reply.error?.code]).sort(), [[longest, R.codes.invalid], [shortest, R.codes.invalid]].sort(), 'a 1-char and an idChars-long id are answered invalid-request')
    assertMainUntouched(h, calls, 'id boundaries')
  }],

  ['MOS-EP-05', 'EP', 'the client refuses check and add locally and sends nothing', async (t) => {
    const { createSettingsRelayServer, createSettingsRelayClient } = await relayModule()
    const calls = { status: 0, retry: 0, restart: 0 }
    const server = createSettingsRelayServer(lifecycleHandlers(calls))
    const client = createSettingsRelayClient({ timeoutMs: R.clientTimeoutMs })
    const link = relayLink()
    server.attach(link.main)
    client.attach(link.child)
    t.after(() => { client.close(); server.close() })
    for (const [op, payload] of [['check', {}], ['add', { checkId: 'fixture-check', ids: [ID.a] }], ['add', {}], ['Check', {}], ['check', { extra: 1 }]]) {
      assert.deepEqual(await client.request(op, payload), { ok: false, error: { code: R.codes.invalid } }, 'local refusal of ' + op)
    }
    assert.deepEqual(link.frames.toMain, [], 'refused requests send nothing')
    assert.deepEqual(await client.request('status', {}), { ok: true, result: MOS.status.ready }, 'status still works')
    assert.deepEqual(parsedFrames(link.frames.toMain).map((frame) => frame.op), ['status'], 'only the status frame was sent')
  }],

  ['MOS-ST-01', 'State Transition', 'refused sync frames leave status, retry and restart working on the same wire', async (t) => {
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const raw = rawChild(server)
    raw.send({ v: R.version, id: 'st01-check', op: 'check', payload: {} })
    raw.send({ v: R.version, id: 'st01-add', op: 'add', payload: { checkId: 'fixture-check', ids: [ID.a] } })
    for (const op of Object.keys(R.ops)) raw.send({ v: R.version, id: 'st01-' + op, op, payload: {} })
    await delay(MOS.settleMs)
    const byId = Object.fromEntries(raw.replies.map((reply) => [reply.id, reply]))
    assert.equal(byId['st01-check']?.error?.code, R.codes.invalid)
    assert.equal(byId['st01-add']?.error?.code, R.codes.invalid)
    assert.deepEqual(byId['st01-status'], { v: R.version, id: 'st01-status', ok: true, result: MOS.status.ready })
    assert.deepEqual(byId['st01-retry'], { v: R.version, id: 'st01-retry', ok: true, result: MOS.status.starting })
    assert.deepEqual(byId['st01-restart'], { v: R.version, id: 'st01-restart', ok: true, result: MOS.status.starting })
    assert.deepEqual([calls.status, calls.retry, calls.restart], [1, 1, 1])
    assertMainUntouched(h, calls, 'after refused frames')
  }],

  ['MOS-ST-02', 'State Transition', 'a reply goes only to the wire the request came in on', async (t) => {
    const { createSettingsRelayServer } = await relayModule()
    const gate = deferred()
    const server = createSettingsRelayServer({ status: async () => { await gate.promise; return MOS.status.ready }, retry: async () => MOS.status.ready, restart: async () => MOS.status.ready })
    t.after(() => { gate.resolve(); server.close() })
    const first = rawChild(server)
    first.send({ v: R.version, id: 'st02-a', op: 'status', payload: {} })
    await delay(MOS.settleMs)
    const second = rawChild(server)
    gate.resolve()
    await delay(MOS.settleMs)
    assert.equal(second.link.frames.toChild.length, 0, 'the new generation receives no reply to the old request')
  }],

  ['MOS-EP-06', 'EP', 'unsolicited provider-sync frames from the child start nothing', async (t) => {
    const h = await standardSync(t)
    const { PROVIDER_SYNC_TARGET } = await loadInstance(MOS.syncTargetModule)
    const toChild = []
    const wire = h.wire()
    wire.child.onMessage((text) => toChild.push(text))
    const v = PROVIDER_SYNC_TARGET.version
    const unsolicited = [
      { v, id: 'u-1', ok: true, result: { identity: clone(ENGINE_CASE.target), providers: [] } },
      { v, id: 'u-2', ok: false, error: { code: 'target-failed' } },
      { v, id: 'u-3', op: PROVIDER_SYNC_TARGET.actions.inventory, peer: clone(ENGINE_CASE.target), payload: {} },
      { v, id: 'u-4', op: PROVIDER_SYNC_TARGET.actions.import, peer: clone(ENGINE_CASE.target), payload: {} },
      { v, id: 'u-5', op: 'check', payload: {} },
      { v, id: 'u-6', op: 'add', payload: { checkId: 'fixture-check', ids: [ID.a] } },
    ]
    for (const frame of unsolicited) wire.child.send(JSON.stringify(frame))
    wire.child.send('not json')
    await delay(MOS.settleMs)
    assert.equal(h.sourceCalls.inventory, 0, 'no main inventory read')
    assert.deepEqual(h.sourceReads, [], 'no main key read')
    assert.deepEqual(h.writes(), NOTHING, 'nothing written')
    assert.deepEqual(toChild, [], 'nothing is sent toward the child in answer')
    // The owner path still works afterwards: an unsolicited frame did not disturb the bridge.
    const checked = await h.check()
    assert.equal(checked.ok, true)
    assert.deepEqual(sortedIds(checked.result.missing), [ID.a, ID.b].sort())
  }],

  ['MOS-EP-07', 'EP', 'unsolicited admin frames from the child start nothing', async (t) => {
    const { createAdminRelay, ADMIN, ADMIN_OPERATION } = await loadInstance(MOS.admin.module)
    const calls = { status: 0, restart: 0 }
    const relay = createAdminRelay({ status: () => { calls.status++; return MOS.status.ready }, restart: async () => { calls.restart++ } })
    t.after(() => relay.close())
    const link = relayLink()
    relay.attach(link.main)
    const v = ADMIN.version
    for (const frame of [
      { v, id: 'a-1', ok: true, result: {} },
      { v, id: 'a-2', ok: false, error: { code: 'operation-failed' } },
      { v, id: 'a-3', op: ADMIN_OPERATION.restart, payload: {} },
      { v, id: 'a-4', op: ADMIN_OPERATION.status, payload: {} },
      { v, id: 'a-5', op: 'check', payload: {} },
    ]) link.child.send(JSON.stringify(frame))
    link.child.send('not json')
    await delay(MOS.settleMs)
    assert.equal(calls.restart, 0, 'no restart from an unsolicited frame')
    assert.equal(calls.status, 0, 'no status read from an unsolicited frame')
    assert.deepEqual(link.frames.toChild, [], 'nothing is sent toward the child')
    assert.deepEqual(await relay.request(MOS.admin.status), { ok: true, result: MOS.status.ready }, 'the owner admin.status still answers')
  }],

  ['MOS-UC-01', 'Use Case', 'owner check then add through the main routes, with per-entry outcomes and key rules', async (t) => {
    const startedAt = Date.now()
    const oauth = provider(ID.oauth, { credential: { configured: true, kind: 'grant', writable: true } })
    const conflictTarget = provider(ID.conflict, { profile: { ...clone(ENGINE_CASE.profile), baseURL: 'https://other.example.invalid/v1' } })
    const h = await syncHarness(t, {
      source: inventory(ENGINE_CASE.source, [provider(ID.a), provider(ID.b), provider(ID.c), provider(ID.existing), provider(ID.conflict), oauth]),
      target: inventory(ENGINE_CASE.target, [provider(ID.existing), conflictTarget]),
    })
    const { registerProviderSyncRoutes } = await loadInstance('src/slim/host/provider-sync-routes.js')
    const { ctx, routes } = routeContext()
    registerProviderSyncRoutes(ctx, { providerSync: h.sync })
    // c's child write fails: a partial success must be reported per entry.
    const importRecord = h.child.host.importRecord
    h.child.host.importRecord = async (id, record) => { if (id === ID.c) throw new Error(MOS.fixtureWriteFailure); return importRecord(id, record) }
    const texts = []
    const logs = await captureLogs(async () => {
      const checked = await post(routes, MOS.route.check, undefined)
      texts.push(checked.text)
      assert.equal(checked.status, MOS.system.ok)
      assert.equal(checked.json?.ok, true)
      assert.deepEqual(sortedIds(checked.json.result.missing), [ID.a, ID.b, ID.c].sort(), 'only what the child lacks is listed')
      assert.equal(checked.json.result.present, 1, 'the existing entry is only counted')
      assert.equal(checked.json.result.missing.some((item) => item.id === ID.oauth), false, 'an OAuth login is never offered')
      assert.equal(checked.json.result.notOffered.find((item) => item.id === ID.conflict)?.reason, MOS.conflictReason, 'a conflicting entry is not offered')
      assert.deepEqual(h.sourceReads, [], 'the check reads no key')
      assert.deepEqual(h.writes(), NOTHING, 'the check writes nothing')
      const forced = await post(routes, MOS.route.add, JSON.stringify({ checkId: checked.json.result.checkId, ids: [ID.oauth] }))
      texts.push(forced.text)
      assert.equal(forced.json?.ok, false)
      assert.equal(forced.json?.error?.code, MOS.invalidSelection, 'an OAuth id cannot be forced')
      const fresh = await post(routes, MOS.route.check, undefined)
      texts.push(fresh.text)
      // b gains a key in the child between Check and Add: it is skipped and kept.
      const kept = h.child.credentials.record()
      await h.child.credentials.seed(ID.b, kept)
      const added = await post(routes, MOS.route.add, JSON.stringify({ checkId: fresh.json.result.checkId, ids: [ID.a, ID.b, ID.c] }))
      texts.push(added.text)
      assert.equal(added.status, MOS.system.ok)
      assert.deepEqual(added.json?.result?.items?.map((item) => [item.id, item.outcome]).sort(),
        [[ID.a, MOS.outcome.added], [ID.b, MOS.outcome.skipped], [ID.c, MOS.outcome.failed]].sort(), 'per-entry outcomes')
      await h.child.credentials.assertSame(ID.b, kept)
      assert.ok(await h.child.credentials.read(ID.a), 'a key landed in the child credential-local store')
      assert.equal(h.writes().additions.includes(ID.conflict), false, 'the conflicting profile is never written')
      assert.equal(h.sourceReads.includes(ID.oauth), false, 'no OAuth grant is read')
    })
    await h.child.credentials.assertOwnerOnly()
    assert.equal(fs.statSync(h.child.credentials.file).mode & 0o777, MOS.credentialMode, 'credential-local is mode 0600')
    for (const text of texts) h.assertClean(text)
    h.assertClean(logs)
    for (const file of recentTempFiles(startedAt)) h.assertClean(fs.readFileSync(file, 'latin1'))
  }],

  ['MOS-UC-02', 'Use Case', 'no request from the child row and relay reaches the main sync', async (t) => {
    const h = await standardSync(t)
    const { server, calls } = await relayToSync(t, h)
    const child = await childRow(t)
    const link = child.connect(server)
    assert.equal(child.routes.has(MOS.route.check), false)
    assert.equal(child.routes.has(MOS.route.add), false)
    const status = await child.call(MOS.method.get, MOS.route.status)
    assert.deepEqual(status.json, MOS.status.ready, 'status goes through the relay')
    const restart = await child.call(MOS.method.post, MOS.route.restart)
    assert.deepEqual(restart.json, { ok: true, result: MOS.status.starting })
    assertMainUntouched(h, calls, 'child row')
    for (const frame of parsedFrames(link.frames.toMain)) assert.ok(Object.values(R.ops).includes(frame.op), 'the child sent only lifecycle ops')
    h.assertClean(link.frames.toChild)
  }],

  ['MOS-UC-03', 'Use Case', 'the main card keeps its Model for Fishball block and owner routes', async () => {
    // No main-card render seam is available offline (its settings form needs the SDK's configForms
    // service); this is a source-presence check, the rendered flow stays a browser case.
    const source = fs.readFileSync(path.join(BODY_SOUL.instance, 'client.js'), 'utf8')
    for (const attribute of MOS.modelAttributes) assert.ok(source.includes(attribute), 'main card keeps ' + attribute)
    for (const route of [MOS.route.check, MOS.route.add]) assert.ok(source.includes(route.slice(1)), 'main card posts ' + route)
    const { PROVIDER_SYNC_ROUTE } = await loadInstance('src/slim/host/provider-sync-routes.js')
    assert.deepEqual({ ...PROVIDER_SYNC_ROUTE }, { check: MOS.route.check, add: MOS.route.add }, 'the main owner routes are unchanged')
  }],
]

/** The slim panel: no sync control, the note in en/zh, the order, no sync request. */
function interactiveInside(panel, node) {
  return panel.all().filter((candidate) => candidate !== node && MOS.panel.interactive.includes(candidate.tag) && contains(node, candidate))
}
function contains(ancestor, node) {
  const stack = [...(ancestor.children ?? [])]
  while (stack.length) {
    const next = stack.pop()
    if (next === node) return true
    if (typeof next !== 'string') stack.push(...(next.children ?? []))
  }
  return false
}
const syncRequests = (panel) => panel.fetches.filter((call) => call.pathname.includes('/models/'))

async function assertNote(t, lang) {
  const panel = await mountPanel(t, { lang })
  assert.equal(panel.byAttr(MOS.panel.root).length, 1, 'the panel root is rendered')
  for (const attribute of MOS.modelAttributes) assert.deepEqual(panel.byAttr(attribute), [], 'no ' + attribute + ' element')
  const notes = panel.byAttr(MOS.panel.note)
  assert.equal(notes.length, 1, 'exactly one model sync note')
  assert.equal(panel.text(notes[0]).trim(), MOS.note[lang], 'the note words (' + lang + ')')
  assert.equal(MOS.panel.interactive.includes(notes[0].tag), false, 'the note is not itself a control')
  assert.deepEqual(interactiveInside(panel, notes[0]), [], 'the note holds no button or link')
  assert.equal(notes[0].props.onClick, undefined, 'the note does nothing on click')
  assert.deepEqual(syncRequests(panel), [], 'opening the panel posts no sync request')
}

const PANEL_CASES = [
  ['MOS-EP-08', 'EP', 'the panel has no sync control and shows the English note', (t) => assertNote(t, 'en')],
  ['MOS-EP-09', 'EP', 'the panel has no sync control and shows the Chinese note', (t) => assertNote(t, 'zh')],

  ['MOS-ST-03', 'State Transition', 'no panel interaction ever requests models/check or models/add', async (t) => {
    const panel = await mountPanel(t, { lang: 'en' })
    for (const attribute of [MOS.panel.restart, MOS.panel.open]) for (const node of panel.byAttr(attribute)) await panel.press(node)
    for (const node of panel.all().filter((candidate) => candidate.tag === 'button')) await panel.press(node)
    assert.deepEqual(syncRequests(panel), [], 'no sync request after every press')
    assert.ok(panel.fetches.some((call) => call.pathname.endsWith(MOS.route.restart)), 'Restart still posts its route')
    for (const attribute of MOS.modelAttributes) assert.deepEqual(panel.byAttr(attribute), [], 'no ' + attribute + ' after interaction')
  }],

  ['MOS-EP-10', 'EP', 'the panel order is status, Restart, note, Read Only, links; Retry while failed', async (t) => {
    const panel = await mountPanel(t, { lang: 'en', status: PANEL.status.failed })
    const order = panel.all()
    const at = (attribute, value) => order.findIndex((node) => node.props[attribute] !== undefined && node.props[attribute] !== false && (value === undefined || String(node.props[attribute]) === value))
    const positions = [
      at(MOS.panel.state), at(MOS.panel.restart), at(MOS.panel.note), at(MOS.panel.readonly),
      ...MOS.panel.openTargets.map((target) => at(MOS.panel.open, target)),
    ]
    assert.ok(positions.every((index) => index >= 0), 'every part is rendered: ' + JSON.stringify(positions))
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'status, Restart, note, Read Only, Settings, Plugins in this order')
    assert.equal(panel.byAttr(MOS.panel.retry).length, 1, 'Retry is shown while failed')
  }],

  ['MOS-EP-11', 'EP', 'exports.shared has no ModelSync', async (t) => {
    const panel = await mountPanel(t, { lang: 'en' })
    const shared = panel.chunk.exports?.shared
    assert.ok(shared, 'the chunk exports shared')
    assert.deepEqual(Object.keys(shared).sort(), [...MOS.sharedKeys].sort(), 'exactly the documented shared members')
    assert.equal(Object.hasOwn(shared, MOS.removedShared), false, 'no ModelSync')
  }],
]

/* ------------------------------------------------------------------------------ system case */

async function systemCase() {
  const host = await bootHost(newHome(MOS.system.homeLabel))
  try {
    let status
    await until(async () => { status = (await host.get(MOS.route.status)).json; return status?.state === MOS.status.ready.state }, MOS.system.readyTimeoutMs, MOS.system.pollMs)
    assert.equal(status?.state, MOS.status.ready.state, 'precondition: the child is ready; saw ' + JSON.stringify(status))
    // The child's own origin, through the main embed's admission redirect (the way the frame reaches it).
    const admission = await fetch(host.origin + MOS.system.embed, { headers: { cookie: host.cookie, [MOS.site.header]: MOS.site.same }, redirect: 'manual' })
    const location = admission.headers.get('location')
    assert.ok(location, 'the embed admits to the child origin')
    const login = await fetch(location, { redirect: 'manual' })
    const childCookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    assert.ok(childCookie, 'the child admission sets its cookie')
    const childOrigin = new URL(location).origin
    const childRequest = (method, routePath, body) => fetch(childOrigin + routePath, {
      method,
      headers: { cookie: childCookie, origin: childOrigin, [MOS.site.header]: MOS.site.same, 'content-type': 'application/json' },
      body,
    })
    const childStatus = await childRequest(MOS.method.get, MOS.route.status)
    assert.equal(childStatus.status, MOS.system.ok, 'the child status route answers')
    for (const [routePath, body] of [[MOS.route.check, undefined], [MOS.route.add, JSON.stringify({ checkId: 'fixture-check', ids: [ID.a] })]]) {
      const answer = await childRequest(MOS.method.post, routePath, body)
      assert.equal(answer.status, MOS.system.notFound, 'the child has no ' + routePath)
    }
    const mainCheck = await host.post(MOS.route.check, undefined, { raw: true, headers: { [MOS.site.header]: MOS.site.same } })
    assert.equal(mainCheck.status, MOS.system.ok, 'the main owner check answers')
    assert.equal(mainCheck.json?.ok, true, 'the main owner check succeeds: ' + JSON.stringify(mainCheck.json?.error ?? null))
    assert.deepEqual(Object.keys(mainCheck.json.result).sort(), [...MOS.system.resultKeys].sort())
  } finally {
    await host.stop()
  }
}

/* ------------------------------------------------------------------------------ registration */

for (const sdk of SDK_VERSIONS) {
  for (const [id, technique, title, body] of [...IN_PROCESS, ...PANEL_CASES]) {
    const name = `${MOS.task} ${id} [${sdk}] ${title} (${technique})`
    if (sdk === ACTIVE_SDK) test(name, body)
    else test.todo(`${name} — run this file with FBTEST_DSH_RUNTIME of ${sdk} (this run: ${ACTIVE_SDK ?? 'unsupported runtime'})`)
  }
  const systemName = `${MOS.task} MOS-SYS-01 [${sdk}] the real child has no models routes; the main owner check works (System)`
  if (sdk === ACTIVE_SDK) test(systemName, { timeout: MOS.system.caseMs }, systemCase)
  else test.todo(`${systemName} — run this file with FBTEST_DSH_RUNTIME of ${sdk}`)
}
