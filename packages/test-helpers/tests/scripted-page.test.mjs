/**
 * fishball-test-helpers ./scripted-page and ./dsh-primitives: a probe client (fixtures/clients) run
 * unread in the scripted DSH page on the current DSH's Cordis.
 * Techniques: UC for the settings flow (open → edit → save), DT for the write answer (applied /
 * refused / transport failure) and the fetch routing (route × method × fallback), ST for
 * `whileServed` (none → one → both → one → none → one served), EP for the locale lookup
 * (active, fallback, missing), the page's error kinds and Cordis's inject rule on `remote.session`,
 * BVA for settingsTextField's parse at the blank edge.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { DSH_VERSION } from '../dsh.mjs'
import { DESIGN, STAND_IN, primitivesFor, realFormLogic } from '../dsh-primitives.mjs'
import { createReactShim, findAll, snapshotStore, textOf } from '../react-shim.mjs'
import { DSH_PAGE, SCRIPTED, createWorld, loadChunkAlone, loadPage, settle } from '../scripted-page.mjs'

const CLIENTS = path.join(import.meta.dirname, 'fixtures', 'clients')
/** The probe's own vocabulary (fixtures/clients/probe/client.js). */
const PROBE = Object.freeze({
  client: Object.freeze({ id: 'fbtest-probe', file: path.join(CLIENTS, 'probe', 'client.js') }),
  chunk: path.join(CLIENTS, 'probe', 'client.part.js'),
  replacement: path.join(CLIENTS, 'replacement', 'client.part.js'),
  ns: 'fbtest-probe', other: 'fbtest-probe-other', bundle: 'fbtest-probe', field: 'greeting',
  page: 'data-probe-page', hello: 'data-probe-hello', only: 'data-probe-only', missing: 'data-probe-missing', fieldMark: 'data-probe-field',
  saveFailed: 'Save failed',
})
const broken = Object.freeze({ id: 'fbtest-broken', file: path.join(CLIENTS, 'broken', 'client.js') })
const failing = Object.freeze({ id: 'fbtest-failing', file: path.join(CLIENTS, 'failing', 'client.js') })

async function probePage(t, options = {}) {
  const world = createWorld({ clients: [PROBE.client], namespaces: { [PROBE.ns]: { [PROBE.field]: 'stored' } }, ...options })
  const page = await loadPage(t, world)
  return { world, page }
}
const fieldInput = (page) => findAll(page.byAttr(PROBE.fieldMark, PROBE.field), (n) => n.tag === 'input')[0]
const mainEntries = (world, key) => world.entries(DSH_PAGE.slot.main).filter((e) => e.options.key === key)

test(`HLP-PAGE-UC-01 [DSH ${DSH_VERSION}] the settings page: open with its stored value, edit, save → one set op at the baseline revision, value served`, async (t) => {
  const { world, page } = await probePage(t)
  assert.deepEqual(world.failedFibers, [])
  assert.deepEqual(world.errors, [])
  assert.equal(world.configEntries(PROBE.bundle).length, 1)
  await page.openConfig(PROBE.bundle, DSH_PAGE.view.page)
  assert.equal(page.byAttr(PROBE.page)[0].props[PROBE.page], DSH_PAGE.view.page)
  assert.equal(fieldInput(page).props.value, 'stored')
  assert.equal(page.saveButton().props.disabled, true, 'not dirty: Save is disabled')
  await page.edit(fieldInput(page), '  new  ')
  assert.equal(page.saveButton().props.disabled, false)
  await page.save()
  assert.deepEqual(world.mutations, [{ ns: PROBE.ns, ops: [{ op: DSH_PAGE.op.set, path: [PROBE.field], value: 'new' }], expectedRevision: SCRIPTED.revision }])
  assert.equal(world.valueOf(PROBE.ns)[PROBE.field], 'new')
  assert.equal(fieldInput(page).props.value, 'new')
  assert.equal(page.saveButton().props.disabled, true, 'saved: nothing staged')
  assert.deepEqual(world.formGets, [PROBE.ns])
})

const WRITE_ROWS = Object.freeze([
  { row: 1, answer: true, applied: true, failed: false, why: 'applied' },
  { row: 2, answer: false, applied: false, failed: true, why: 'refused (revision conflict)' },
  { row: 3, answer: SCRIPTED.answer.reject, applied: false, failed: true, why: 'transport failure' },
])
for (const r of WRITE_ROWS) {
  test(`HLP-PAGE-DT-01 row ${r.row} [DSH ${DSH_VERSION}] mutate ${r.why} → value ${r.applied ? 'changed' : 'kept'}, failed line ${r.failed ? 'shown' : 'absent'}`, async (t) => {
    const { world, page } = await probePage(t)
    world.mutateAnswer = r.answer
    await page.openConfig(PROBE.bundle)
    await page.edit(fieldInput(page), 'changed')
    await page.save()
    assert.equal(world.mutations.length, 1)
    assert.equal(world.valueOf(PROBE.ns)[PROBE.field], r.applied ? 'changed' : 'stored')
    assert.equal(page.byAttr(STAND_IN.saveFailed).length > 0, r.failed)
    assert.equal(page.text().includes(PROBE.saveFailed), r.failed)
  })
}

test(`HLP-PAGE-ST-01 [DSH ${DSH_VERSION}] whileServed: registers when one namespace is served, keeps through a second, disposes when none is, registers again`, async (t) => {
  const world = createWorld({ clients: [PROBE.client] })
  await loadPage(t, world)
  const served = () => mainEntries(world, 'served')
  assert.equal(served().length, 0, 'none served: nothing registered')
  world.serve(PROBE.other, {})
  await settle()
  assert.equal(served().length, 1)
  // The entry's options were made in the page realm: compared by value.
  assert.deepEqual([...served()[0].options.served], [PROBE.other])
  world.serve(PROBE.ns, {})
  await settle()
  assert.equal(served().length, 1, 'a second namespace does not register again')
  world.unserve(PROBE.other)
  await settle()
  assert.equal(served().length, 1, 'one still served: kept')
  world.unserve(PROBE.ns)
  await settle()
  assert.equal(served().length, 0, 'none served: disposed')
  world.serve(PROBE.ns, {})
  await settle()
  assert.equal(served().length, 1, 'served again: registered again')
  assert.deepEqual([...served()[0].options.served], [PROBE.ns])
})

test(`HLP-PAGE-ST-02 [DSH ${DSH_VERSION}] a served namespace withdrawn while the page is open → DSH's unavailable state; served again → the form again`, async (t) => {
  const { world, page } = await probePage(t)
  await page.openConfig(PROBE.bundle)
  world.unserve(PROBE.ns)
  await settle()
  assert.equal(page.byAttr(STAND_IN.unavailable).length, 1)
  assert.equal(fieldInput(page), undefined)
  world.serve(PROBE.ns, { [PROBE.field]: 'back' }, { writable: false })
  await settle()
  assert.equal(fieldInput(page).props.value, 'back')
  assert.ok(page.text().includes('Read only'), 'not writable: the read-only line')
})

const LOCALE_ROWS = Object.freeze([
  { row: 1, lang: 'en', hello: 'Hello Ada', only: 'English only' },
  { row: 2, lang: 'zh', hello: '你好 Ada', only: 'English only' },
])
for (const r of LOCALE_ROWS) {
  test(`HLP-PAGE-EP-01 row ${r.row} [DSH ${DSH_VERSION}] locale ${r.lang}: interpolated, en fallback for a missing word, the key for a missing key; setLang re-renders`, async (t) => {
    const { world, page } = await probePage(t, { lang: r.lang })
    await page.openConfig(PROBE.bundle)
    assert.equal(textOf(page.byAttr(PROBE.hello)[0]), r.hello)
    assert.equal(textOf(page.byAttr(PROBE.only)[0]), r.only)
    assert.equal(textOf(page.byAttr(PROBE.missing)[0]), 'missing.key')
    const other = r.lang === 'en' ? 'zh' : 'en'
    world.setLang(other)
    await settle()
    assert.equal(textOf(page.byAttr(PROBE.hello)[0]), LOCALE_ROWS.find((x) => x.lang === other).hello)
    assert.equal(world.html.lang, other)
    assert.deepEqual(world.services.locale.getLocale().locales.map((l) => l.id), [...DSH_PAGE.locales])
  })
}

const FETCH_ROWS = Object.freeze([
  { row: 1, request: ['api/thing'], status: 200, body: '{"ok":true}', why: 'a route, any method' },
  { row: 2, request: ['api/post-only', { method: 'POST', body: '{"a":1}' }], status: 201, body: 'made', why: 'a method-bound route, its method' },
  { row: 3, request: ['api/post-only'], status: 418, body: 'other', why: 'a method-bound route, another method → fetchOther' },
  { row: 4, request: ['http://elsewhere.test/api/thing'], status: 418, body: 'other', why: 'same path, another origin → fetchOther' },
  { row: 5, request: ['api/thing?x=1'], status: 200, body: '{"ok":true}', why: 'a query does not change the route' },
  { row: 6, request: ['api/down'], reject: true, why: "a route answering 'reject' → a network failure" },
])
for (const r of FETCH_ROWS) {
  test(`HLP-PAGE-DT-02 row ${r.row} [DSH ${DSH_VERSION}] page fetch: ${r.why}`, async (t) => {
    const world = createWorld({ base: 'http://scripted.test/sub/page/' })
    world.route('api/thing', () => ({ status: 200, json: { ok: true } }))
    world.route('api/post-only', (call) => ({ status: 201, text: call.json().a === 1 ? 'made' : 'bad' }), { method: 'POST' })
    world.route('api/down', () => SCRIPTED.answer.reject)
    world.fetchOther = () => ({ status: 418, text: 'other' })
    await loadPage(t, world)
    const run = world.page.sandbox.fetch(...r.request)
    if (r.reject) { await assert.rejects(run, TypeError); return }
    const response = await run
    assert.equal(response.status, r.status)
    assert.equal(await response.text(), r.body)
    assert.equal(world.fetches.length, 1)
    assert.equal(world.fetches[0].url, new URL(r.request[0], world.base).href, 'document-relative to the base')
  })
}

test(`HLP-PAGE-EP-02 [DSH ${DSH_VERSION}] no route and no fetchOther → 404; a removed route no longer answers`, async (t) => {
  const world = createWorld()
  const off = world.route('api/x', () => ({ status: 200, text: 'x' }))
  await loadPage(t, world)
  assert.equal((await world.page.sandbox.fetch('api/x')).status, 200)
  off()
  assert.equal((await world.page.sandbox.fetch('api/x')).status, SCRIPTED.notFound)
})

const CHUNK_ROWS = Object.freeze([
  { row: 1, chunkFiles: {}, word: 'own part', why: "from the client's folder" },
  { row: 2, chunkFiles: { 'client.part.js': PROBE.replacement }, word: 'replacement part', why: 'a chunkFiles replacement' },
])
for (const r of CHUNK_ROWS) {
  test(`HLP-PAGE-EP-03 row ${r.row} [DSH ${DSH_VERSION}] the chunk the apply asks for loads ${r.why} before loadPage resolves`, async (t) => {
    const { world } = await probePage(t, { chunkFiles: r.chunkFiles })
    assert.deepEqual(mainEntries(world, 'part').map((e) => e.options.word), [r.word])
  })
}

test(`HLP-PAGE-EP-04 [DSH ${DSH_VERSION}] a throwing factory is a module error; a throwing apply is a failed fiber; the other clients still apply`, async (t) => {
  const { world } = await probePage(t, { clients: [broken, failing, PROBE.client] })
  assert.deepEqual(world.errors, ['fbtest-broken: fbtest broken factory'])
  assert.deepEqual(world.failedFibers, ['fbtest-failing'])
  assert.equal(world.configEntries(PROBE.bundle).length, 1)
})

test(`HLP-PAGE-EP-05 [DSH ${DSH_VERSION}] remote: credentials set/describe as DSH Results, unknown members recorded, $on events, navigation selects the Plugins panel`, async (t) => {
  const world = createWorld({ credentials: { 'ref-a': false } })
  await loadPage(t, world)
  const { remote, layout, pluginNavigation } = world.services
  assert.deepEqual(await remote.credentials.describe(['ref-a']), { ok: true, value: { 'ref-a': { configured: false, writable: true } } })
  assert.deepEqual(await remote.credentials.set('ref-a', 'secret'), { ok: true, value: undefined })
  assert.equal((await remote.credentials.describe(['ref-a'])).value['ref-a'].configured, true)
  world.credentialAnswer = SCRIPTED.answer.refused
  assert.equal((await world.services[DSH_PAGE.remoteCredentials].set('ref-a', 'x')).ok, false)
  assert.equal((await remote.someNs.someCall(1)).ok, false)
  assert.deepEqual(world.remoteOther, [{ name: 'someNs.someCall', args: [1] }])
  const heard = []
  const off = remote.$on('evt', (v) => heard.push(v))
  world.emitRemote('evt', 1); off(); world.emitRemote('evt', 2)
  assert.deepEqual(heard, [1])
  pluginNavigation.openBundle('pkg')
  assert.equal(layout.panelInfo.getSnapshot().activePanelId, DSH_PAGE.pluginsPanel)
  assert.deepEqual(world.selectPanel, [], 'openBundle is not a selectPanel call')
  assert.deepEqual(world.sequence, ['credentials.set', 'credentials.set'])
})

const SERVICE_ROWS = Object.freeze([
  { row: 1, options: {}, navigation: true, layout: true },
  { row: 2, options: { navigation: false }, navigation: false, layout: true },
  { row: 3, options: { omit: ['layout'] }, navigation: true, layout: false },
])
for (const r of SERVICE_ROWS) {
  test(`HLP-PAGE-DT-03 row ${r.row} [DSH ${DSH_VERSION}] provided services: pluginNavigation ${r.navigation ? 'on' : 'off'}, layout ${r.layout ? 'on' : 'off'}; extra services join`, () => {
    const world = createWorld({ ...r.options, services: { sessions: {} } })
    assert.equal(world.provided.includes(DSH_PAGE.navigation), r.navigation)
    assert.equal(world.provided.includes('layout'), r.layout)
    assert.ok(world.provided.includes('sessions'))
  })
}

test(`HLP-PAGE-EP-06 [DSH ${DSH_VERSION}] remoteSession: Cordis's rule holds — without remote.session in inject ctx.remote.session throws, with it the face; ctx.get answers the face`, async (t) => {
  const face = { modelCatalog: async () => ({ ok: true, value: { groups: [] } }) }
  const world = createWorld({ remoteSession: face })
  await loadPage(t, world)
  const seen = {}
  const probe = (key, inject) => world.root.plugin({ name: 'fbtest-probe-' + key, inject, apply(ctx) {
    try { seen[key] = { value: ctx.remote.session } } catch (error) { seen[key] = { error: String(error?.message ?? error) } }
    seen[key].get = ctx.get(DSH_PAGE.remoteSession)
  } })
  const fibers = [probe('without', [DSH_PAGE.remoteName]), probe('with', [DSH_PAGE.remoteName, DSH_PAGE.remoteSession])]
  await Promise.all(fibers)
  t.after(async () => { for (const f of fibers) await f.dispose?.() })
  assert.ok(seen.without?.error, 'without inject: no throw ' + JSON.stringify(seen.without))
  assert.equal(seen.with.value, face)
  assert.equal(seen.without.get, face)
})

test(`HLP-PAGE-EP-07 [DSH ${DSH_VERSION}] hostRefs: a ref'd host element is an element of the page DOM, attributes from props`, async (t) => {
  const world = createWorld({ hostRefs: true })
  const page = await loadPage(t, world)
  const ref = { current: null }
  await page.mount('shell', world.React.createElement('nav', { ref }, world.React.createElement('button', { 'aria-label': 'New', ref: () => {} })))
  assert.equal(ref.current.localName, 'nav')
  assert.equal(ref.current.querySelector('button').getAttribute('aria-label'), 'New')
})

test(`HLP-PAGE-EP-08 [DSH ${DSH_VERSION}] loadChunkAlone runs one chunk alone: one registration, its exports, what it required`, () => {
  const { registrations, exports, required } = loadChunkAlone(PROBE.chunk)
  assert.equal(registrations.length, 1)
  assert.equal(exports.word, 'own part')
  assert.deepEqual(required, [DSH_PAGE.modules.react])
})

// ------------------------------------------------------------------------------- dsh-primitives

const PARSE_ROWS = Object.freeze([
  { row: 1, text: '', parsed: { kind: 'clear' } },
  { row: 2, text: '   ', parsed: { kind: 'clear' } },
  { row: 3, text: ' x', parsed: { kind: 'set', value: 'x' } },
  { row: 4, text: 'a b', parsed: { kind: 'set', value: 'a b' } },
])
for (const r of PARSE_ROWS) {
  test(`HLP-PRIM-BVA-01 row ${r.row} [DSH ${DSH_VERSION}] DSH's settingsTextField parses ${JSON.stringify(r.text)} → ${r.parsed.kind}`, () => {
    const { settingsTextField } = realFormLogic()
    assert.deepEqual(settingsTextField('f').parse(r.text), r.parsed)
    assert.equal(settingsTextField('f').format(undefined), '')
  })
}

test(`HLP-PRIM-EP-01 [DSH ${DSH_VERSION}] DSH's SettingsFormModel over a store: stage, plan, reset to base (unset), a save DSH accepts calls mutate once at the baseline revision and clears the staging`, async () => {
  const { SettingsFormModel, settingsTextField } = realFormLogic()
  const scope = snapshotStore({ status: DSH_PAGE.status.ready, writable: true, value: { a: 'v', b: 'w' }, base: { a: 'base' }, user: { a: 'v', b: 'w' }, revision: 3 })
  const calls = []
  scope.mutate = async (ops, revision) => { calls.push({ ops, revision }); return true }
  const form = new SettingsFormModel(scope, [settingsTextField('a'), settingsTextField('b')])
  assert.equal(form.shell().dirty, false)
  form.actions().edit('a', 'next')
  form.actions().resetField('b')
  assert.equal(form.shell().dirty, true)
  await form.save()
  assert.deepEqual(calls, [{ ops: [{ op: 'set', path: ['a'], value: 'next' }, { op: 'unset', path: ['b'] }], revision: 3 }])
  assert.equal(form.shell().failed, false)
  assert.equal(form.shell().dirty, false, 'a save DSH accepted clears what was staged')
})

test(`HLP-PRIM-EP-02 [DSH ${DSH_VERSION}] stand-ins: StateDot, Tag, Tooltip on hover, Checkbox, Modal only when asked, icons, a generic export`, async () => {
  const shim = createReactShim()
  const { React } = shim
  const h = React.createElement
  const P = primitivesFor(React)
  const withModal = primitivesFor(React, { modal: true })
  const checked = []
  shim.mount('r', () => h('div', null,
    h(P.StateDot, { state: DESIGN.ongoing }), h(P.StateDot, { state: 'idle' }),
    h(P.Tag, { tone: 'success', 'data-lost': 'x' }, 'tag'),
    h(P.Tooltip, { label: 'tip', shortcutKeys: ['⌘', 'K'] }, h('button', { id: 'b' })),
    h(P.Checkbox, { checked: false, label: 'c', onChange: (v) => checked.push(v) }),
    h(withModal.Modal, { open: true, title: 'M', 'data-own': 'y', onClose() {} }),
    h(P.Modal, { open: true, title: 'generic' }),
    h(P.IconGear), h(P.FishLogo), h(P.Anything, { title: 'g' })))
  const all = () => findAll(shim.treeOf('r'), () => true)
  const prim = (name) => all().filter((n) => n.props[STAND_IN.primitive] === name)
  assert.deepEqual(prim('StateDot').map((n) => n.tag), ['svg', 'span'])
  assert.equal(prim('Tag')[0].props['data-tone'], 'success')
  assert.equal(prim('Tag')[0].props['data-lost'], undefined, "DSH's Tag forwards no other prop")
  const button = all().find((n) => n.props.id === 'b')
  assert.equal(button.props[STAND_IN.tooltip], 'tip')
  button.props.onMouseEnter()
  await settle()
  const bubble = all().find((n) => n.props.role === DESIGN.tooltipRole)
  assert.equal(textOf(bubble), 'tip⌘ K')
  findAll(prim('Checkbox'), (n) => n.tag === 'input')[0].props.onChange({ target: { checked: true } })
  assert.deepEqual(checked, [true])
  assert.equal(all().filter((n) => n.props.role === DESIGN.dialogRole).length, 1, 'only the modal: true primitives draw a dialog')
  assert.equal(prim('Modal').find((n) => n.props.role === DESIGN.dialogRole).props['data-own'], 'y')
  assert.equal(prim('IconGear')[0].tag, 'svg')
  assert.equal(prim('FishLogo')[0].tag, 'svg')
  assert.equal(prim('Anything')[0].props.title, 'g')
})
