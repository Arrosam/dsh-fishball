/**
 * The running managed sessions of a target (the sidebar's nested list), core side. Requirements, as
 * the lead relayed the user's feature (2026-11-21): when Fishball starts sessions, the target's
 * view lists its Fishball-managed sessions that are RUNNING. Rules under test:
 * - read with `sessions_list` `{limit: 100}` (the connector's maximum) when the link becomes
 *   `connected`, and after a polled page holding a `state`, `turn-finished`, `handover`, `takeback`
 *   or `retirement` event; no other page and no timer reads it;
 * - one call in flight; any number of triggers meanwhile make exactly one more call after it;
 * - only `running: true` sessions, as `{sessionId, title}`; `null` before the first answer on a
 *   connection and again the moment the link leaves `connected`; an answer of an earlier connection
 *   is dropped; a refused or failed call keeps the last list and logs a code only;
 * - after disposal: no change, no listener, no call;
 * - `TargetView.runningSessions` carries it and a change re-emits the targets snapshot.
 * Techniques: EP (event types, answers), BVA (limit), ST (connection transitions, coalescing), DT
 * (running × kept). Level: unit on `targets/sessions.js` with a scripted link, and `createTargets`
 * over the same scripted link (no network).
 */
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { setImmediate as tick } from 'node:timers/promises'
import { FIXTURE } from '../identity/constants.mjs'
import { MULTI, runtimeOf } from './constants.mjs'
import { MCP } from './targets-oracle.mjs'
import { linkScope, scriptedLink } from './running-sessions-link.mjs'

const CORE = new URL('../../../../packages/core/', import.meta.url).href
const LINK = new URL('src/link/link.js', CORE).href
const SCRIPTED = new URL('./running-sessions-link.mjs', import.meta.url).href
const E = MCP.eventTypes
const TRIGGERS = Object.freeze([E.state, E.turnFinished, E.handover, E.takeback, E.retirement])
const OTHERS = Object.freeze([E.message, E.permission, E.question, E.planReview, E.settlement, E.ask, E.notice, 'contributed:fbtest-x'])
const LIMIT = 100
const ROW_MS = 5000
const settle = async () => { for (let i = 0; i < 5; i++) await tick() }
const session = (id, running, title = 'Session ' + id) => ({ sessionId: id, title, workspaceId: null, running, pendingInteraction: false })
const listed = (...sessions) => ({ ok: true, sessions })

async function sessionsModule() { return import(new URL('src/targets/sessions.js', CORE)) }

/** One running-sessions read over a scripted link; `changes` counts onChange, `warns` the logged args. */
async function unit() {
  const { createRunningSessions } = await sessionsModule()
  const s = scriptedLink()
  const changes = { n: 0 }
  const warns = []
  const read = createRunningSessions(s.link, { onChange: () => { changes.n += 1 }, logger: { warn: (...args) => warns.push(args) } })
  return { s, read, changes, warns }
}

/** `createTargets` with this file's scripted link in place of core's (retirement.mjs's hook, same shape). */
async function targetsSubject(sdk) {
  const tag = '?running-sessions=' + sdk
  const hook = registerHooks({ resolve(specifier, ctx, next) {
    if (!ctx.parentURL?.endsWith(tag)) return next(specifier, ctx)
    if (specifier.startsWith('@deepseek-ai/')) return next(specifier, { ...ctx, parentURL: pathToFileURL(runtimeOf(sdk) + '/../package.json').href })
    const result = next(specifier, ctx)
    if (!result.url.startsWith(CORE)) return result
    return { ...result, url: result.url === LINK ? SCRIPTED : result.url + tag }
  } })
  try { return (await import(new URL('src/targets/index.js' + tag, CORE))).createTargets }
  finally { hook.deregister() }
}

/** One collection over the scripted links, with a remote target added; `links` gets each new link. */
async function targetsWorld(t, sdk, links) {
  const createTargets = await targetsSubject(sdk)
  const table = () => { const rows = new Map(); return { entries: () => rows.entries(), get: (k) => rows.get(k), put: async (k, v) => rows.set(k, v), delete: async (k) => rows.delete(k) } }
  const credentials = { async resolve() {}, async unset() {}, async readRecord() {}, async deleteRecord() {}, async modifyRecord() {} }
  const controller = createTargets({ credentials, settings: { describe: () => [] }, on: () => () => {} }, {
    tables: { targets: table(), bindings: table() }, identityRecords: table(),
    asks: { take: async () => [], drained: async () => {}, reconcile: async () => {}, voidWhere: async () => {} },
    events: { intake: async () => {}, retire() {} }, recovered: Promise.resolve(),
    settings: { clientId: () => FIXTURE.coreId, clientMetadataUrl: () => MULTI.metadataUrl, name: () => FIXTURE.boundName },
  })
  t.after(() => controller.close())
  await controller.settled()
  const emitted = []
  controller.service.onChange((snapshot) => emitted.push(snapshot))
  const added = await controller.service.add(MULTI.url.remote)
  assert.equal(added.ok, true, JSON.stringify(added))
  const view = () => controller.service.list().targets.find((v) => v.targetId === added.targetId)
  return { controller, emitted, view, link: links.at(-1), targetId: added.targetId }
}

export function registerRunningSessionsCases(sdk) {
  const row = (name, fn) => test(`${sdk} SESSIONS ${name}`, { timeout: ROW_MS }, fn)

  // ---------------------------------------------------------------- triggers (EP, BVA)
  row('ST connect reads once with limit 100', async () => {
    const { s, read } = await unit()
    assert.equal(read.list(), null, 'known before any connection')
    assert.equal(s.calls.length, 0, 'read before connecting')
    s.connect()
    assert.equal(s.calls.length, 1)
    assert.equal(s.calls[0].name, MCP.tools.sessionsList)
    assert.deepEqual(s.calls[0].args, { limit: LIMIT })
    assert.equal(read.list(), null, 'known before the first answer')
    s.answer(0, listed())
    await settle()
    assert.deepEqual(read.list(), [])
  })
  for (const type of TRIGGERS) {
    row(`EP page with ${type} reads again`, async () => {
      const { s } = await unit()
      s.connect(); s.answer(0, listed()); await settle()
      s.page(E.message, type)
      assert.equal(s.calls.length, 2, type + ' did not ask for a new list')
    })
  }
  row('EP pages without a trigger, refused pages and malformed pages read nothing', async () => {
    const { s } = await unit()
    s.connect(); s.answer(0, listed()); await settle()
    for (const type of OTHERS) s.page(type)
    s.page()
    for (const page of [{ ok: false, code: 'fbtest' }, { ok: true }, { ok: true, events: 'x' }, { ok: true, events: [null] }, null, undefined]) s.pageRaw(page)
    assert.equal(s.calls.length, 1)
  })
  row('EP a trigger while not connected reads nothing', async () => {
    const { s } = await unit()
    s.page(E.state)
    assert.equal(s.calls.length, 0)
  })

  // ---------------------------------------------------------------- coalescing (ST)
  row('ST triggers during a call make exactly one more', async () => {
    const { s, read } = await unit()
    s.connect()
    for (let i = 0; i < 5; i++) s.page(E.state)
    assert.equal(s.calls.length, 1, 'more than one call in flight')
    s.answer(0, listed(session('a', true)))
    await settle()
    assert.equal(s.calls.length, 2, 'not exactly one follow-up')
    s.answer(1, listed(session('a', true), session('b', true)))
    await settle()
    assert.equal(s.calls.length, 2)
    assert.deepEqual(read.list().map((x) => x.sessionId), ['a', 'b'], 'the follow-up answer is not the one kept')
    s.page(E.turnFinished)
    assert.equal(s.calls.length, 3, 'a trigger after the run did not read')
  })

  // ---------------------------------------------------------------- filter (DT)
  row('DT only running sessions, as {sessionId, title}', async () => {
    const { s, read } = await unit()
    s.connect()
    s.answer(0, listed(session('r1', true, '<b>x</b>'), session('idle', false), session('r2', true, ''), { sessionId: 'odd', running: 'yes' }, { running: true }, null, { ...session('r3', true), title: 7 }))
    await settle()
    assert.deepEqual(JSON.parse(JSON.stringify(read.list())), [
      { sessionId: 'r1', title: '<b>x</b>' }, { sessionId: 'r2', title: '' }, { sessionId: 'r3', title: '' },
    ])
  })
  row('ST a session that stops leaves the list; onChange only on a change', async () => {
    const { s, read, changes } = await unit()
    s.connect(); s.answer(0, listed(session('a', true))); await settle()
    const after = changes.n
    s.page(E.state); s.answer(1, listed(session('a', true))); await settle()
    assert.equal(changes.n, after, 'an unchanged answer fired onChange')
    s.page(E.turnFinished); s.answer(2, listed(session('a', false))); await settle()
    assert.deepEqual(read.list(), [])
    assert.equal(changes.n, after + 1)
  })

  // ---------------------------------------------------------------- failures (EP)
  for (const [label, act, code] of [
    ['refused', (s) => s.answer(1, { ok: false, code: 'forbidden' }), 'forbidden'],
    ['disconnected answer', (s) => s.answer(1, { ok: false, code: 'disconnected' }), 'disconnected'],
    ['thrown', (s) => s.fail(1, Object.assign(new Error('fbtest secret text'), { code: 'ECONNRESET' })), 'ECONNRESET'],
    ['no sessions array', (s) => s.answer(1, { ok: true }), undefined],
    ['nothing', (s) => s.answer(1, undefined), undefined],
  ]) {
    row(`EP ${label} keeps the last list and logs a code only`, async () => {
      const { s, read, warns } = await unit()
      s.connect(); s.answer(0, listed(session('a', true))); await settle()
      s.page(E.state); act(s); await settle()
      assert.deepEqual(read.list().map((x) => x.sessionId), ['a'])
      assert.equal(warns.length, 1)
      const text = JSON.stringify(warns[0])
      assert.equal(text.includes('fbtest secret text'), false, 'the error message was logged')
      if (code !== undefined) assert.ok(warns[0].includes(code), 'the code is not logged: ' + text)
    })
  }

  // ---------------------------------------------------------------- connection transitions (ST)
  row('ST leaving connected clears to null; a late answer of that connection is dropped', async () => {
    const { s, read } = await unit()
    s.connect(); s.answer(0, listed(session('a', true))); await settle()
    s.page(E.state)
    s.drop()
    assert.equal(read.list(), null)
    s.answer(1, listed(session('late', true))); await settle()
    assert.equal(read.list(), null, 'an answer of the old connection was adopted')
    s.connect()
    assert.equal(s.calls.length, 3, 'the reconnect did not read')
    s.answer(2, listed(session('b', true))); await settle()
    assert.deepEqual(read.list().map((x) => x.sessionId), ['b'])
  })
  row('ST a reconnect while a call is in flight reads again for the new connection', async () => {
    const { s, read } = await unit()
    s.connect()
    s.drop(); s.connect()
    s.answer(0, listed(session('old', true))); await settle()
    assert.equal(s.calls.length, 2, 'the new connection was not read')
    s.answer(1, listed(session('new', true))); await settle()
    assert.deepEqual(read.list().map((x) => x.sessionId), ['new'])
  })

  // ---------------------------------------------------------------- disposal (ST)
  row('ST after dispose: no listener, no change, no call', async () => {
    const { s, read, changes } = await unit()
    s.connect()
    read.dispose()
    assert.equal(s.listening(), 0, 'a listener stayed')
    s.answer(0, listed(session('a', true))); await settle()
    assert.equal(read.list(), null)
    assert.equal(changes.n, 0)
    s.page(E.state)
    assert.equal(s.calls.length, 1)
  })

  // ---------------------------------------------------------------- TargetView (integration over createTargets)
  row('ST TargetView.runningSessions follows the read and re-emits the snapshot', async (t) => {
    const links = []
    await linkScope.run({ links }, async () => {
      const w = await targetsWorld(t, sdk, links)
      assert.equal(w.view().runningSessions, null)
      w.link.connect()
      const before = w.emitted.length
      w.link.answer(0, listed(session('a', true, 'Fix the login'), session('b', false)))
      await settle()
      assert.deepEqual(JSON.parse(JSON.stringify(w.view().runningSessions)), [{ sessionId: 'a', title: 'Fix the login' }])
      assert.ok(w.emitted.length > before, 'no snapshot emitted for the change')
      const count = w.emitted.length
      w.link.page(E.state); w.link.answer(1, listed(session('a', true, 'Fix the login'))); await settle()
      assert.equal(w.emitted.length, count, 'an unchanged list re-emitted the snapshot')
      w.link.drop()
      assert.equal(w.view().runningSessions, null)
    })
  })
  row('ST a removed target\'s late answer changes nothing', async (t) => {
    const links = []
    await linkScope.run({ links }, async () => {
      const w = await targetsWorld(t, sdk, links)
      w.link.connect()
      assert.equal((await w.controller.service.remove(w.targetId, { confirmed: true })).ok, true)
      const count = w.emitted.length
      w.link.answer(0, listed(session('a', true))); await settle()
      assert.equal(w.emitted.length, count)
      assert.equal(w.view(), undefined)
    })
  })
}
