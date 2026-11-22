/**
 * fishball-test-helpers ./fake-dom, ./browser-sandbox, ./event-source and ./client-graph.
 * Techniques: EP over selector kinds and event phases, DT for MutationObserver options × the
 * changed attribute, ST for an EventSource's states (CONNECTING → OPEN → CONNECTING / CLOSED, page
 * close), EP for the module table's specifier kinds (platform, graph entry, chunk, asset, miss).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createBrowserSandbox } from '../browser-sandbox.mjs'
import { applyPlugins, loadClients, moduleTable } from '../client-graph.mjs'
import { SOURCE_STATE, eventSourceClass } from '../event-source.mjs'
import { createDom, createEvent, matchesSelector } from '../fake-dom.mjs'
import { importDsh } from '../dsh.mjs'
import { createReactShim } from '../react-shim.mjs'
import { settle } from '../wait.mjs'

const FIXTURE = Object.freeze({
  base: 'http://page.test/app/',
  clients: path.join(import.meta.dirname, 'fixtures', 'clients'),
  attr: 'data-fbtest-mark',
  other: 'data-fbtest-other',
})
const probeClient = Object.freeze({ id: 'fbtest-probe', file: path.join(FIXTURE.clients, 'probe', 'client.js') })

// ------------------------------------------------------------------------------- fake DOM

const SELECTOR_ROWS = Object.freeze([
  ['button', true], ['div', false], ['#go', true], ['.primary', true], ['.missing', false],
  ['[aria-label]', true], ['[aria-label="New"]', true], ['[aria-label="Old"]', false],
  ['button.primary[aria-label="New"]', true], ['div, .primary', true], ['section button', false],
])
for (const [selector, hit] of SELECTOR_ROWS) {
  test(`HLP-DOM-EP-01 selector ${JSON.stringify(selector)} → ${hit ? 'matches' : 'no match'}`, () => {
    const dom = createDom()
    const button = dom.createElement('button')
    button.id = 'go'
    button.className = 'primary wide'
    button.setAttribute('aria-label', 'New')
    assert.equal(matchesSelector(button, selector), hit)
  })
}

test('HLP-DOM-EP-02 tree, dataset and closest; events run capture down, target, bubble up; stopPropagation ends the path', () => {
  const dom = createDom()
  const outer = dom.createElement('div')
  const button = dom.createElement('button')
  const span = dom.createElement('span')
  dom.body.append(outer)
  outer.append(button)
  button.append(span)
  span.dataset.fbtestKind = 'x'
  assert.equal(span.getAttribute('data-fbtest-kind'), 'x')
  assert.equal(span.closest('button'), button)
  assert.equal(dom.html.querySelector('span'), span)
  const order = []
  outer.addEventListener('click', () => order.push('outer capture'), true)
  outer.addEventListener('click', () => order.push('outer bubble'))
  span.addEventListener('click', () => order.push('target'))
  span.dispatchEvent(createEvent('click'))
  assert.deepEqual(order, ['outer capture', 'target', 'outer bubble'])
  order.length = 0
  outer.addEventListener('click', (e) => e.stopPropagation(), true)
  span.dispatchEvent(createEvent('click'))
  assert.deepEqual(order, ['outer capture'])
  span.remove()
  assert.equal(button.children.length, 0)
  assert.ok(span.removed)
})

const OBSERVER_ROWS = Object.freeze([
  { row: 1, options: { attributes: true }, change: 'own', records: 1, why: 'attributes, own change' },
  { row: 2, options: { attributeFilter: [FIXTURE.attr] }, change: 'own', records: 1, why: 'filter alone implies attributes' },
  { row: 3, options: { attributeFilter: [FIXTURE.other] }, change: 'own', records: 0, why: 'filtered out' },
  { row: 4, options: { childList: true }, change: 'own', records: 0, why: 'no attributes asked' },
  { row: 5, options: { attributes: true }, change: 'child', records: 0, why: 'child change without subtree' },
  { row: 6, options: { attributes: true, subtree: true }, change: 'child', records: 1, why: 'child change with subtree' },
])
for (const r of OBSERVER_ROWS) {
  test(`HLP-DOM-DT-01 row ${r.row} MutationObserver ${r.why} → ${r.records} record(s)`, async () => {
    const dom = createDom()
    const child = dom.createElement('span')
    dom.html.append(child)
    const seen = []
    const observer = new dom.MutationObserver((records) => seen.push(...records))
    observer.observe(dom.html, r.options)
    const target = r.change === 'own' ? dom.html : child
    target.setAttribute(FIXTURE.attr, 'a')
    target.setAttribute(FIXTURE.attr, 'b')
    await settle(2)
    // Two writes in one turn reach the observer in one batch, one record each.
    assert.equal(seen.length, r.records * 2)
    if (seen.length > 0) assert.equal(seen[0].oldValue, null, 'no attributeOldValue: oldValue is null')
    observer.disconnect()
    target.removeAttribute(FIXTURE.attr)
    await settle(2)
    assert.equal(seen.length, r.records * 2, 'nothing after disconnect')
  })
}

test('HLP-DOM-EP-03 hostRef gives a ref\'d host element an element with its attributes, parented on the render path', () => {
  const dom = createDom()
  const shim = createReactShim({ hostRef: dom.hostRef })
  const { React } = shim
  const h = React.createElement
  const refs = {}
  let label = 'New'
  shim.mount('r', () => h('div', { ref: (e) => { refs.outer = e } }, h('button', { 'aria-label': label, disabled: true, className: 'b', ref: (e) => { refs.button = e } })))
  assert.equal(refs.button.getAttribute('aria-label'), 'New')
  assert.equal(refs.button.getAttribute('disabled'), '')
  assert.equal(refs.button.getAttribute('class'), 'b')
  assert.equal(refs.button.parentElement, refs.outer)
  label = 'Changed'
  shim.mount('r', () => h('div', { ref: () => {} }, h('button', { 'aria-label': label, ref: () => {} })))
  assert.equal(refs.button.getAttribute('aria-label'), 'Changed', 'the same element follows the render path')
  assert.equal(refs.button.hasAttribute('disabled'), false)
})

// ------------------------------------------------------------------------------- browser sandbox

test('HLP-SBX-EP-01 a classic script registers with __ModuleLoader__, sees currentScript, location and the page fetch; window is the global', async () => {
  const calls = []
  const page = createBrowserSandbox({ lang: 'zh', baseURI: FIXTURE.base, hash: '#view=x', fetch: async (input) => { calls.push(String(input)); return new Response('ok') } })
  page.run(`
    const src = document.currentScript.src
    window.__ModuleLoader__.load({ id: 'a', factory: () => ({ src, lang: document.documentElement.lang, hash: location.hash, same: window === globalThis }) })
    globalThis.__ModuleLoader__.load({ id: 'a', chunk: 'part.js', factory: () => 1 })
    fetch('api/x')
  `, 'inline.js', 'http://page.test/app/client.js')
  await settle(2)
  assert.equal(page.registrations.length, 2)
  assert.deepEqual({ ...page.registrations[0].factory() }, { src: 'http://page.test/app/client.js', lang: 'zh', hash: '#view=x', same: true })
  assert.equal(page.registrations[1].chunk, 'part.js')
  assert.deepEqual(calls, ['api/x'])
  assert.equal(page.document.currentScript, null, 'currentScript is cleared after the script')
})

test('HLP-SBX-EP-02 window listeners, window.open, matchMedia changes, styles and timers', async (t) => {
  const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.base, media: () => false })
  t.after(() => page.clearTimers())
  page.run(`
    window.events = []
    addEventListener('focus', () => events.push('focus'))
    window.open('https://elsewhere.test/', '_blank', 'noopener')
    const m = matchMedia('(prefers-reduced-motion: reduce)')
    window.initial = m.matches
    m.addEventListener('change', (e) => events.push('media ' + e.matches))
    const s = document.createElement('style'); s.textContent = '.a{color:red}'; document.head.appendChild(s)
    const sheet = new CSSStyleSheet(); sheet.replaceSync('.b{color:blue}'); document.adoptedStyleSheets = [sheet]
    window.ticks = 0
    setInterval(() => { window.ticks++ }, 1)
  `, 'page.js')
  page.dispatchWindow('focus')
  page.setMedia(() => true)
  page.setMedia(() => true)
  assert.equal(page.window.initial, false)
  // Values made in the page realm are compared as JSON (their prototypes are the page realm's).
  assert.equal(JSON.stringify(page.window.events), JSON.stringify(['focus', 'media true']), 'one change event per change of answer')
  assert.equal(JSON.stringify(page.opened), JSON.stringify([['https://elsewhere.test/', '_blank', 'noopener']]))
  assert.deepEqual(page.styleTexts(), ['.a{color:red}', '.b{color:blue}'])
  page.clearTimers()
  const ticks = page.window.ticks
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(page.window.ticks, ticks, 'clearTimers stops the page interval')
})

// ------------------------------------------------------------------------------- EventSource

test('HLP-ES-ST-01 CONNECTING → open OPEN → message → recoverable error CONNECTING → message OPEN → terminal error CLOSED', () => {
  const sources = eventSourceClass()
  const source = new sources.EventSource('api/events?x=1')
  const seen = []
  // Both receivers, as a browser calls them: the on<event> property and every listener.
  source.onmessage = (e) => seen.push(['prop', e.data])
  source.addEventListener('message', (e) => seen.push(['listener', e.data]))
  source.addEventListener('error', () => seen.push(['error', source.readyState]))
  source.addEventListener('open', () => seen.push(['open', source.readyState]))
  assert.equal(source.readyState, SOURCE_STATE.connecting)
  source.open()
  source.deliver({ a: 1 })
  source.fail()
  source.deliverRaw('not json')
  assert.equal(source.readyState, SOURCE_STATE.open, 'a message arrives on an open stream')
  source.fail({ closed: true })
  assert.equal(source.readyState, SOURCE_STATE.closed)
  assert.deepEqual(seen, [
    ['open', SOURCE_STATE.open],
    ['prop', '{"a":1}'], ['listener', '{"a":1}'],
    ['error', SOURCE_STATE.connecting],
    ['prop', 'not json'], ['listener', 'not json'],
    ['error', SOURCE_STATE.closed],
  ])
  assert.equal(sources.EventSource.CLOSED, SOURCE_STATE.closed)
})

test('HLP-ES-ST-02 a source the page closed is CLOSED and silent; live/at list only open ones by URL part and pathname', () => {
  const sources = eventSourceClass()
  const a = new sources.EventSource('api/stream?lang=en')
  const b = new sources.EventSource('http://page.test/app/api/other')
  let heard = 0
  a.onmessage = () => { heard += 1 }
  a.close()
  a.deliver({})
  a.fail()
  assert.equal(heard, 0)
  assert.equal(a.readyState, SOURCE_STATE.closed)
  assert.deepEqual(sources.live('api/'), [b])
  assert.deepEqual(sources.at('/app/api/other', FIXTURE.base), [b])
  assert.equal(sources.opened.length, 2)
})

test('HLP-ES-EP-01 deliverEvent sends a named event to its listeners only', () => {
  const sources = eventSourceClass()
  const s = new sources.EventSource('x')
  const got = []
  s.onmessage = () => got.push('message')
  s.addEventListener('snapshot', (e) => got.push(JSON.parse(e.data)))
  s.deliverEvent('snapshot', { v: 2 })
  assert.deepEqual(got, [{ v: 2 }])
})

// ------------------------------------------------------------------------------- module table

const SPEC_ROWS = Object.freeze([
  { row: 1, kind: 'platform module', spec: 'react', expect: (m, platform) => assert.equal(m, platform.react) },
  { row: 2, kind: 'graph entry by id', spec: 'b', expect: (m) => assert.equal(m.value, 'b') },
  { row: 3, kind: 'graph entry by <id>/client', spec: 'b/client', expect: (m) => assert.equal(m.value, 'b') },
  { row: 4, kind: 'missing module', spec: 'nowhere', expect: null },
])
for (const r of SPEC_ROWS) {
  test(`HLP-GRAPH-EP-01 row ${r.row} require(${r.kind}) → ${r.expect ? 'the module' : 'a table miss'}`, () => {
    const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.base })
    page.run(`
      __ModuleLoader__.load({ id: 'a', factory: (require) => ({ get: (s) => require(s), asset: require.asset('img.svg') }) })
      __ModuleLoader__.load({ id: 'b', factory: () => ({ value: 'b' }) })
    `, 'graph.js')
    const platform = { react: { isReact: true } }
    const table = moduleTable({ page, platform, graph: [{ id: 'a' }, { id: 'b' }], loadChunk: async () => {} })
    const a = table.materialize('a')
    assert.equal(a.asset, 'img.svg')
    if (r.expect) r.expect(a.get(r.spec), platform)
    else assert.throws(() => a.get(r.spec), /missed the module table/)
    assert.equal(table.materialize('a'), a, 'a factory runs once')
  })
}

const chunked = Object.freeze({ id: 'fbtest-chunked', file: path.join(FIXTURE.clients, 'chunked', 'client.js'), other: path.join(FIXTURE.clients, 'chunked', 'other.part.js') })
const CHUNK_ROWS = Object.freeze([
  { row: 1, why: "the client's own folder", chunkFiles: {}, word: 'own part' },
  { row: 2, why: 'a <id>/<file> replacement', chunkFiles: { [chunked.id + '/client.part.js']: chunked.other }, word: 'replacement part' },
])
for (const r of CHUNK_ROWS) {
  test(`HLP-GRAPH-EP-02 row ${r.row} require.async('./client.part.js') loads the chunk from ${r.why}, once, on first use`, async () => {
    const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.base })
    const { React } = createReactShim()
    const { table, settleChunks } = loadClients(page, [chunked], { platform: { react: React }, chunkFiles: r.chunkFiles })
    const mod = table.materialize(chunked.id)
    assert.equal(mod.platform(), React)
    assert.equal(table.has(chunked.id + '/client.part.js'), false, 'nothing loads before the module asks')
    const [first, second] = await Promise.all([mod.part(), mod.part()])
    await settleChunks(settle)
    assert.equal(first.word, r.word)
    assert.equal(second, first, 'one module instance')
    if (r.row === 1) assert.equal(page.window.partFactories, 1, 'the factory ran once')
    assert.ok(table.required.includes('react'))
  })
}

test('HLP-GRAPH-EP-03 applyPlugins applies each plugin entry to the Cordis root; a throwing factory is recorded and skipped', async () => {
  const page = createBrowserSandbox({ lang: 'en', baseURI: FIXTURE.base })
  page.runFile(path.join(FIXTURE.clients, 'broken', 'client.js'))
  page.run(`__ModuleLoader__.load({ id: 'fbtest-ok', factory: () => ({ name: 'fbtest-ok', inject: ['x'], apply(ctx) { window.applied = true } }) })
    __ModuleLoader__.load({ id: 'fbtest-data', factory: () => ({ value: 1 }) })`, 'ok.js')
  const graph = [{ id: 'fbtest-broken' }, { id: 'fbtest-ok' }, { id: 'fbtest-data' }]
  const table = moduleTable({ page, platform: {}, graph, loadChunk: async () => {} })
  const { Context } = await importDsh('cordis')
  const root = new Context()
  root.provide('x', {})
  const errors = []
  const plugins = applyPlugins(root, graph, table, errors)
  await settle()
  assert.deepEqual(plugins.map((p) => [p.id, [...p.inject]]), [['fbtest-ok', ['x']]])
  assert.equal(page.window.applied, true)
  assert.deepEqual(errors, ['fbtest-broken: fbtest broken factory'])
  for (const p of plugins) await p.fiber.dispose()
})