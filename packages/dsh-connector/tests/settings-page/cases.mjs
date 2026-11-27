/**
 * C-TOKENS-REVEAL black-box cases, settings page and route level (../tokens/USE-CASES.md):
 * AUTH-UC-01 main 2 and 4–6, E1, E2 at the route; AUTH-UC-15 (create and copy once); AUTH-ST-08
 * (the reveal modal); the create body's boundaries (BVA within AUTH-UC-01 E1); PLAT-EP-03 row 1
 * and HAND-EP-01 row 3 (reworded: the connector's settings page and its own routes are the only
 * browser surface). Requirements R-ARCH-03, R-ARCH-04, R-CON-10, R-TOK-03, R-TOK-04, R-TOK-11;
 * design §5.9.
 *
 * Level: integration. The routes run over the real registry of ../tokens/world.mjs (a DSH storage
 * domain of the SDK under test); the page runs the real client.js in a scripted page (page.mjs)
 * whose fetch goes to those routes. DSH's own Host/Origin fence and the Plugins page in a browser
 * are other levels (`todo`, LATER).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { textOf } from 'dsh-connector-test-helpers/page/react-shim'
import { eventually, leaksOf, worldFor } from '../tokens/world.mjs'
import { CLIENT, FIXTURE, HTTP, LATER, ROUTE, SETTINGS_REFUSAL, SUBJECT, VALUE_ANYWHERE, VALUE_PATTERN, WAIT } from './constants.mjs'
import { click, input, openTokensPage, treeText } from './page.mjs'
import { clientSource, pageModule, routesOf, send } from './subject.mjs'

const T = { timeout: WAIT.testMs }
const ID = Object.freeze({ uc01: 'AUTH-UC-01', uc15: 'AUTH-UC-15', st08: 'AUTH-ST-08', plat03: 'PLAT-EP-03', hand01: 'HAND-EP-01' })

function row(sdk, id, part, title, fn, todo) {
  const name = caseName(sdk, id, part, title)
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, T, fn)
}

const url = (pathname) => new URL(pathname, FIXTURE.baseURI).href
const postCreate = (routes, body) => send(routes, url(ROUTE.create), { method: ROUTE.post, headers: { 'content-type': 'application/json' }, body })
const getNotice = (routes) => send(routes, url(ROUTE.notice), { method: ROUTE.get })

/** Every answer of the page's routes: JSON, `Cache-Control: no-store`, never HTML (design §5.9 step 2, R-TOK-11). */
function assertJsonNoStore(answer) {
  assert.match(answer.headers.get(HTTP.contentType) ?? '', HTTP.json, 'not JSON: ' + answer.headers.get(HTTP.contentType))
  assert.match(answer.headers.get(HTTP.cacheControl) ?? '', HTTP.noStore, 'no Cache-Control: no-store')
  assert.equal(answer.headers.get(HTTP.location), null, 'the answer redirects')
  assert.notEqual(answer.json, undefined, 'the body is not JSON')
}
/** A refused create: `code`, JSON no-store, nothing created and no value anywhere. */
function assertRefused(world, answer, status, code) {
  assertJsonNoStore(answer)
  assert.equal(answer.status, status)
  assert.deepEqual([answer.json.ok, answer.json.code], [false, code])
  assert.ok(!VALUE_ANYWHERE.test(answer.text), 'a refusal carries a value')
  assert.deepEqual(world.registry.list(), [], 'a refused create made an entry')
  assert.deepEqual(world.doc.tokens, [])
  assert.deepEqual(leaksOf(world, VALUE_ANYWHERE), [], 'a value was written or logged')
}
/** A tokens world and the routes over it. */
async function routeWorld(t, sdk, options) {
  const world = await worldFor(t, sdk, options)
  return { world, routes: await routesOf(sdk, world) }
}
/** A body of exactly `bytes` UTF-8 bytes `{"label":"…"}`, its label built from `unit`. */
function bodyOfBytes(bytes, unit) {
  const room = bytes - Buffer.byteLength(FIXTURE.emptyLabelBody)
  const unitBytes = Buffer.byteLength(unit)
  const label = unit.repeat(Math.floor(room / unitBytes)) + FIXTURE.pad.repeat(room % unitBytes)
  const body = JSON.stringify({ label })
  assert.equal(Buffer.byteLength(body), bytes, 'harness: body size')
  return body
}

export function registerSettingsPageCases(sdk) {
  // ---- the route (AUTH-UC-01 main 2, 4; E1, E2; R-TOK-11) ----

  row(sdk, ID.uc01, 'main 4 (route)', 'POST create {label} → 200 {ok: true, entryKey, label, value}, JSON, no-store; the value is a dsht_ value and authenticates as the new entry', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    const answer = await postCreate(routes, JSON.stringify({ label: FIXTURE.labelA }))
    assertJsonNoStore(answer)
    assert.equal(answer.status, ROUTE.ok)
    assert.deepEqual(Object.keys(answer.json).sort(), [...ROUTE.createFields].sort())
    assert.equal(answer.json.ok, true)
    assert.equal(answer.json.label, FIXTURE.labelA)
    assert.match(answer.json.value, VALUE_PATTERN)
    assert.equal(world.registry.match(answer.json.value)?.entryKey, answer.json.entryKey)
    assert.equal(world.registry.get(answer.json.entryKey)?.hosted, false)
  })
  row(sdk, ID.uc01, 'main 4 (log)', 'the route logs the label at most, never the value; the value is in no file, settings document or later answer', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    const { json } = await postCreate(routes, JSON.stringify({ label: FIXTURE.labelA }))
    const notice = await getNotice(routes)
    assert.ok(!notice.text.includes(json.value), 'the notice route returns the value')
    assert.deepEqual(leaksOf(world, json.value), [], 'the value leaked')
    assert.deepEqual(world.credentialWrites, [], 'the host credential store was written')
  })
  row(sdk, ID.uc01, 'main 2 (URL)', 'the value is never in a URL: the routes take no value in their path or query', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    const { json } = await postCreate(routes, JSON.stringify({ label: FIXTURE.labelA }))
    assert.ok(routes.every((r) => !r.path.includes(json.value)))
  })
  row(sdk, ID.uc01, 'A1 (route)', 'a padded label is trimmed in the answer', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    assert.equal((await postCreate(routes, JSON.stringify({ label: `  ${FIXTURE.labelA}  ` }))).json.label, FIXTURE.labelA)
  })
  for (const [part, body] of [
    ['not JSON', '{label: Agent A'],
    ['empty body', ''],
    ['JSON, not an object', JSON.stringify(FIXTURE.labelA)],
    ['no label', JSON.stringify({ name: FIXTURE.labelA })],
    ['label a number', JSON.stringify({ label: 1 })],
    ['label null', JSON.stringify({ label: null })],
    ['label blank', JSON.stringify({ label: '   ' })],
    ['label empty', FIXTURE.emptyLabelBody],
  ]) {
    row(sdk, ID.uc01, `E1 (route, ${part})`, '400 {ok: false, code: bad-body}, JSON, no-store; nothing created', async (t) => {
      const { world, routes } = await routeWorld(t, sdk)
      assertRefused(world, await postCreate(routes, body), ROUTE.badRequest, ROUTE.badBody)
    })
  }
  row(sdk, ID.uc01, `E1 (route, ${ROUTE.maxBodyBytes} bytes)`, 'a body of exactly maxBodyBytes is accepted', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    assert.equal((await postCreate(routes, bodyOfBytes(ROUTE.maxBodyBytes, FIXTURE.pad))).json?.ok, true)
  })
  row(sdk, ID.uc01, `E1 (route, ${ROUTE.maxBodyBytes + 1} bytes)`, 'a body one byte over maxBodyBytes → 400 bad-body; nothing created', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    assertRefused(world, await postCreate(routes, bodyOfBytes(ROUTE.maxBodyBytes + 1, FIXTURE.pad)), ROUTE.badRequest, ROUTE.badBody)
  })
  row(sdk, ID.uc01, `E1 (route, ${ROUTE.maxBodyBytes} bytes multi-byte)`, 'the bound counts bytes: maxBodyBytes of multi-byte characters is accepted', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    assert.equal((await postCreate(routes, bodyOfBytes(ROUTE.maxBodyBytes, FIXTURE.multiByte))).json?.ok, true)
  })
  row(sdk, ID.uc01, `E1 (route, ${ROUTE.maxBodyBytes + 1} bytes multi-byte)`, 'one byte over, in fewer than maxBodyBytes characters → 400 bad-body (bytes, not characters)', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    const body = bodyOfBytes(ROUTE.maxBodyBytes + 1, FIXTURE.multiByte)
    assert.ok(body.length <= ROUTE.maxBodyBytes, 'harness: the body is not shorter in characters')
    assertRefused(world, await postCreate(routes, body), ROUTE.badRequest, ROUTE.badBody)
  })
  row(sdk, ID.uc01, 'E2 (route)', 'the create fails (the settings save fails) → 500 {ok: false, code: operation-failed}; nothing created; no value', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    world.failSaves = true
    const answer = await postCreate(routes, JSON.stringify({ label: FIXTURE.labelA }))
    assert.ok(await eventually(() => world.liveRecords().length === 0), 'the failed create left a record')
    assertRefused(world, answer, ROUTE.serverError, ROUTE.operationFailed)
  })
  row(sdk, ID.uc01, 'notice (route)', 'GET notice → 200 {ok: true, notice: null} with no problem; JSON, no-store', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    const answer = await getNotice(routes)
    assertJsonNoStore(answer)
    assert.equal(answer.status, ROUTE.ok)
    assert.deepEqual(answer.json, { ok: true, notice: null })
  })
  row(sdk, ID.uc01, 'notice (route, problem)', 'GET notice with an item with no record at start → {ok: true, notice: {code: token-duplicate, labels}}, labels only', async (t) => {
    const { routes } = await routeWorld(t, sdk, { tokens: [{ label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }] })
    const answer = await getNotice(routes)
    assertJsonNoStore(answer)
    assert.deepEqual(answer.json, { ok: true, notice: { code: SETTINGS_REFUSAL.tokenDuplicate, labels: [[FIXTURE.handLabel]] } })
    assert.ok(!answer.text.includes(FIXTURE.handKey), 'the notice carries the entry key')
  })
  row(sdk, ID.uc01, 'main 2 (fence)', 'the route is owner-only behind DSH\'s Host and Origin fence', null, LATER.fence)

  // ---- PLAT-EP-03 row 1 and HAND-EP-01 row 3 (reworded): the routes and their registration ----

  // C-WIRE (2026-11-16): an optional `state` port adds the third route, GET state, the page's
  // read-only pair state (R-ID-12, AUTH-UC-09) and approval status (R-OA-20); without it there are two.
  const PATHS = Object.freeze({ two: [[ROUTE.create, [ROUTE.post]], [ROUTE.notice, [ROUTE.get]]], three: [[ROUTE.create, [ROUTE.post]], [ROUTE.notice, [ROUTE.get]], [ROUTE.state, [ROUTE.get]]] })
  const routeSet = (routes) => routes.map((r) => [r.path, r.methods.map((m) => m.toUpperCase()).sort()]).sort()
  row(sdk, ID.plat03, '1 (routes)', 'without a state port the settings page serves exactly two routes: POST create and GET notice, at the relayed paths', async (t) => {
    const { routes } = await routeWorld(t, sdk)
    const mod = await pageModule(sdk)
    assert.deepEqual(mod[SUBJECT.constants].route, { create: ROUTE.create, notice: ROUTE.notice, state: ROUTE.state })
    assert.equal(mod[SUBJECT.constants].maxBodyBytes, ROUTE.maxBodyBytes)
    assert.deepEqual(routeSet(routes), [...PATHS.two].sort())
  })
  row(sdk, ID.plat03, '1 (routes, state)', 'with a state port: exactly three routes, GET state answering {ok: true, ...state()} as JSON, no-store', async (t) => {
    const world = await worldFor(t, sdk)
    const mod = await pageModule(sdk)
    const routes = mod[SUBJECT.routes]({ tokens: world.registry, state: () => FIXTURE.stateAnswer, logger: world.logger })
    assert.deepEqual(routeSet(routes), [...PATHS.three].sort())
    const answer = await send(routes, url(ROUTE.state), { method: ROUTE.get })
    assertJsonNoStore(answer)
    assert.equal(answer.status, ROUTE.ok)
    assert.deepEqual(answer.json, { ok: true, ...FIXTURE.stateAnswer })
  })
  for (const withState of [false, true]) {
    row(sdk, ID.plat03, `1 (registration${withState ? ', state' : ''})`, 'registerSettingsPage registers exactly those routes with connection.fetch, each with requestBody: buffered, and nothing else', async (t) => {
      const world = await worldFor(t, sdk)
      const mod = await pageModule(sdk)
      const registered = []
      const ctx = {
        connection: { fetch: { register: (options) => { registered.push(options); return () => {} } } },
        effect: (fn) => fn(),
      }
      await mod[SUBJECT.register](ctx, { tokens: world.registry, logger: world.logger, ...(withState ? { state: () => FIXTURE.stateAnswer } : {}) })
      assert.deepEqual(registered.map((r) => r.path).sort(), (withState ? PATHS.three : PATHS.two).map(([p]) => p).sort())
      assert.ok(registered.every((r) => r.requestBody === ROUTE.requestBody && typeof r.fetch === 'function'), 'a route without requestBody: buffered')
    })
  }
  row(sdk, ID.hand01, '3 (reworded)', 'a browser fetch reaches only the page\'s routes: none serves hand-over, HTML or a value outside the create answer', async (t) => {
    const { world, routes } = await routeWorld(t, sdk)
    assert.deepEqual(routes.filter((r) => /hand[-_]?over|take[-_]?back/i.test(r.path)), [])
    const made = await world.registry.create(FIXTURE.labelA)
    const notice = await getNotice(routes)
    assert.doesNotMatch(notice.headers.get(HTTP.contentType) ?? '', HTTP.html)
    assert.ok(!notice.text.includes(made.value))
  })

  // ---- PLAT-EP-03 row 1 (reworded): the connector's one browser module ----

  row(sdk, ID.plat03, '1 (module)', `client.js loads one module ${CLIENT.moduleId}: a client plugin ${CLIENT.pluginName} injecting exactly slots, locale and configForms, requiring only react and the primitives`, async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    assert.equal(page.definition.id, CLIENT.moduleId)
    assert.equal((page.plugin.default ?? page.plugin).name, CLIENT.pluginName)
    assert.deepEqual([...((page.plugin.default ?? page.plugin).inject ?? [])].sort(), [...CLIENT.inject].sort())
    assert.deepEqual(page.required.filter((r) => !CLIENT.requires.includes(r)), [])
    assert.deepEqual(page.errors, [])
  })
  row(sdk, ID.plat03, '1 (slot)', `the only registration is one ${CLIENT.slot} entry keyed ${CLIENT.slotKey}, while its own namespace is served`, async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    assert.deepEqual(page.registrations.map((r) => [r.options.name, r.options.key]), [[CLIENT.slot, CLIENT.slotKey]])
    assert.deepEqual(page.served, [[CLIENT.servedNamespace]])
  })
  row(sdk, ID.plat03, '1 (locale)', `its locale namespace ${CLIENT.localeNamespace} has en and zh with the same keys`, async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    const mine = page.dictionaries.filter((d) => d.ns === CLIENT.localeNamespace)
    assert.equal(mine.length, 1, 'locale registrations of the namespace')
    for (const lang of CLIENT.locales) assert.ok(mine[0].dicts[lang] && Object.keys(mine[0].dicts[lang]).length > 0, 'no ' + lang + ' dictionary')
    assert.deepEqual(Object.keys(mine[0].dicts.zh).sort(), Object.keys(mine[0].dicts.en).sort())
    assert.deepEqual(page.dictionaries.filter((d) => d.ns !== CLIENT.localeNamespace).map((d) => d.ns), [], 'another locale namespace')
  })
  row(sdk, ID.plat03, '1 (no style)', 'loading and opening the page adds no style element, stylesheet link, adopted stylesheet or head/body node', async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    await page.open()
    assert.deepEqual(page.created.tags.filter((tag) => CLIENT.styleTags.includes(tag)), [])
    assert.deepEqual(page.created.appended, [])
    assert.deepEqual(page.document.adoptedStyleSheets, [])
  })
  row(sdk, ID.plat03, '1 (no other slot)', 'client.js names no other host-DSH slot (no sidebar, header, chat or bundle card)', () => {
    const source = clientSource()
    assert.deepEqual(CLIENT.otherSlots.filter((s) => source.includes(`'${s}'`) || source.includes(`"${s}"`) || source.includes('`' + s + '`')), [])
  })
  row(sdk, ID.plat03, '1 (no embed-UI)', 'with embed-UI absent (only the connector\'s client loaded), the page, New token and the modal work', async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    const view = await page.open()
    await newToken(page, view, FIXTURE.labelA)
    // The create answer lands after real storage writes, so the modal is waited for as in openWithModal.
    await page.until(() => view.modal().length === 1)
    assert.equal(view.modal().length, 1)
  })

  // ---- AUTH-UC-15 and AUTH-ST-08: create, copy once, close (Use Case, State Transition) ----

  /** Types `label` into the label field and presses New token; waits for the create answer. */
  async function newToken(page, view, label) {
    input(view.one(CLIENT.attr.newLabel), label)
    await page.settle()
    const before = page.requests.length
    click(view.one(CLIENT.attr.newToken))
    await page.until(() => page.requests.length > before)
    await page.settle()
  }
  /** The value the modal shows (its value element's text or value). */
  function revealed(view) {
    const node = view.one(CLIENT.attr.reveal)
    return (typeof node.props.value === 'string' ? node.props.value : textOf(node)).trim()
  }
  async function openWithModal(t, sdk_, options) {
    const world = await worldFor(t, sdk_, options)
    const page = await openTokensPage(t, { sdk: sdk_, world, routes: await routesOf(sdk_, world) })
    const view = await page.open()
    assert.equal(view.modal().length, 0, 'a modal is open before New token')
    await newToken(page, view, FIXTURE.labelA)
    await page.until(() => view.modal().length === 1)
    const value = revealed(view)
    return { world, page, view, value }
  }

  row(sdk, ID.uc15, 'main 1', 'New token POSTs {label} to the page-relative create route, never with a value in the URL', async (t) => {
    const { page, value } = await openWithModal(t, sdk)
    const posts = page.requests.filter((r) => r.method === ROUTE.post)
    assert.equal(posts.length, 1)
    assert.equal(posts[0].url, new URL(ROUTE.createRelative, FIXTURE.baseURI).href)
    assert.deepEqual(JSON.parse(posts[0].body), { label: FIXTURE.labelA })
    assert.ok(page.requests.every((r) => !r.url.includes(value)), 'a request URL carries the value')
  })
  row(sdk, ID.st08, 1, 'Closed → New token, created → Open: the value element shows exactly the created value, which authenticates as the new entry', async (t) => {
    const { world, view, value } = await openWithModal(t, sdk)
    assert.match(value, VALUE_PATTERN)
    const entry = world.registry.match(value)
    assert.ok(entry, 'the shown value matches no entry')
    assert.equal(entry.label, FIXTURE.labelA)
    assert.equal(view.find(CLIENT.attr.reveal).length, 1)
  })
  row(sdk, ID.st08, 2, 'Open → Copy → Open (copied): navigator.clipboard.writeText gets exactly the value, once', async (t) => {
    const { page, view, value } = await openWithModal(t, sdk)
    click(view.one(CLIENT.attr.copy))
    await page.until(() => page.clipboard.length > 0)
    assert.deepEqual(page.clipboard, [value])
    assert.equal(view.modal().length, 1, 'Copy closed the modal')
  })
  for (const copied of [false, true]) {
    row(sdk, ID.st08, `3 (${copied ? 'after Copy' : 'without Copy'})`, `Open${copied ? ' (copied)' : ''} → Close → Closed: the modal is gone and no value is anywhere in the page tree`, async (t) => {
      const { page, view, value } = await openWithModal(t, sdk)
      if (copied) click(view.one(CLIENT.attr.copy))
      const [modal] = view.modal()
      assert.equal(typeof modal.props.onClose, 'function', 'the Modal has no onClose (Close)')
      modal.props.onClose()
      await page.until(() => view.modal().length === 0)
      assert.ok(!treeText(view.tree()).includes(value), 'the value is still in the page')
      assert.deepEqual(view.find(CLIENT.attr.reveal), [])
      assert.deepEqual(page.clipboard, copied ? [value] : [])
    })
  }
  row(sdk, ID.st08, 4, 'Closed → the page re-rendered and opened again → Closed: the new entry is listed by key without a value; nothing reopens the modal', async (t) => {
    const { world, page, view, value } = await openWithModal(t, sdk)
    view.modal()[0].props.onClose()
    await page.until(() => view.modal().length === 0)
    const { entryKey } = world.registry.match(value)
    await page.settle()
    assert.equal(view.modal().length, 0, 'the modal reopened on a re-render')
    view.close()
    const again = await page.open()
    assert.equal(again.find(CLIENT.attr.row, entryKey).length, 1, 'the new entry is not listed')
    assert.equal(again.modal().length, 0, 'the modal reopened')
    assert.ok(!treeText(again.tree()).includes(value), 'the reopened page shows the value')
  })
  row(sdk, ID.st08, 5, 'Closed → New token, refused (the create fails) → Closed: no modal; the refusal code is shown; nothing created', async (t) => {
    const world = await worldFor(t, sdk)
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    const view = await page.open()
    world.failSaves = true
    await newToken(page, view, FIXTURE.labelA)
    await page.until(() => view.text().includes(ROUTE.operationFailed))
    assert.equal(view.modal().length, 0, 'a modal opened for a refused create')
    assert.ok(view.text().includes(ROUTE.operationFailed), 'the refusal code is not shown')
    assert.ok(!VALUE_ANYWHERE.test(treeText(view.tree())))
    assert.deepEqual(world.registry.list(), [])
  })
  row(sdk, ID.uc15, 'main 6', 'the page lists each entry by its key with its label, and never a value', async (t) => {
    const { world, page, view, value } = await openWithModal(t, sdk)
    view.modal()[0].props.onClose()
    await page.until(() => view.modal().length === 0)
    for (const item of world.doc.tokens) {
      const rows = view.find(CLIENT.attr.row, item.key)
      assert.equal(rows.length, 1, 'no row for ' + item.label)
      // The label is shown in its row, as text or as the value of its (editable) label field.
      assert.ok(view.shown(rows[0]).includes(item.label), 'the row does not show its label ' + item.label)
    }
    assert.ok(world.doc.tokens.some((i) => i.label === FIXTURE.labelA))
    assert.ok(!VALUE_ANYWHERE.test(treeText(view.tree())), 'a value is on the page')
    assert.ok(!treeText(view.tree()).includes(value))
  })
  row(sdk, ID.uc15, 'save', 'a label edit saved from the page goes through form.mutate as one set of [tokens] with the read revision; the notice is fetched after the save', async (t) => {
    const { world, page, view } = await openWithModal(t, sdk)
    view.modal()[0].props.onClose()
    await page.until(() => view.modal().length === 0)
    const [item] = world.doc.tokens
    await editLabel(page, view, item.key, FIXTURE.renamed)
    const saveButton = findSave(page, view)
    const noticesBefore = page.requests.filter((r) => r.url.endsWith(ROUTE.noticeRelative)).length
    click(saveButton)
    await page.until(() => page.mutations.length > 0)
    const [{ ops, expected }] = page.mutations
    assert.equal(expected, FIXTURE.revision)
    assert.deepEqual(ops.map((o) => [o.op, o.path]), [[CLIENT.setOp, [CLIENT.tokensField]]])
    assert.deepEqual(ops[0].value, [{ ...item, label: FIXTURE.renamed }])
    await page.until(() => page.requests.filter((r) => r.url.endsWith(ROUTE.noticeRelative)).length > noticesBefore)
    assert.equal(world.registry.get(item.key).label, FIXTURE.renamed)
  })
  row(sdk, ID.uc15, 'notice', 'a save of a list with a hand-added item is refused token-duplicate; the page shows the notice naming its label, and no key or value', async (t) => {
    const world = await worldFor(t, sdk)
    const made = await world.registry.create(FIXTURE.labelA)
    // The document was edited by hand (an item with no record), and the owner presses Save on it.
    world.doc.tokens = [...world.doc.tokens, { label: FIXTURE.handLabel, enabled: true, key: FIXTURE.handKey }]
    const page = await openTokensPage(t, { sdk, world, routes: await routesOf(sdk, world) })
    const view = await page.open()
    // An ordinary edit (so the save is not empty), saved together with the hand-added item.
    await editLabel(page, view, made.entryKey, FIXTURE.renamed)
    click(findSave(page, view))
    await page.until(() => view.find(CLIENT.attr.notice).length === 1 && textOf(view.one(CLIENT.attr.notice)).includes(FIXTURE.handLabel))
    assert.equal(world.restored.length, 1, 'the refused save was not restored')
    const notice = textOf(view.one(CLIENT.attr.notice))
    assert.ok(!notice.includes(FIXTURE.handKey), 'the notice shows the entry key')
    assert.ok(!treeText(view.tree()).includes(made.value), 'the page shows a value')
  })
  row(sdk, ID.uc15, 'E2E', 'the real Plugins page opens this page from the connector row, and the clipboard holds the value after Copy', null, LATER.plugins)
}

/** Types `label` into the label field of the row of `key` (the row's text input, not its switch). */
async function editLabel(page, view, key, label) {
  const field = view.find(CLIENT.attr.row, key).flatMap((r) => [r, ...allBelow(r)])
    .find((n) => typeof n.props.onChange === 'function' && n.props.type !== 'checkbox' && n.props[CLIENT.primitiveAttr] !== 'Switch')
  assert.ok(field, 'the row of ' + key + ' has no label field')
  input(field, label)
  await page.settle()
}
/** Every element below `node`. */
function allBelow(node) {
  return (node.children ?? []).filter((c) => typeof c !== 'string').flatMap((c) => [c, ...allBelow(c)])
}
/**
 * The page's Save control. The relayed surface gives it no data attribute, so it is found by its en
 * text in the page's own dictionary (a key whose en text is "Save").
 */
function findSave(page, view) {
  const dict = page.dictionaries.find((d) => d.ns === CLIENT.localeNamespace)?.dicts.en ?? {}
  const words = Object.values(dict).filter((v) => typeof v === 'string' && /^\s*save\b/i.test(v)).map((v) => v.trim())
  assert.ok(words.length > 0, 'the page\'s en dictionary has no "Save" text')
  const found = view.tree().flatMap((n) => (typeof n === 'string' ? [] : [n, ...allBelow(n)])).filter((n) => n.tag === 'button' && words.includes(textOf(n).trim()))
  assert.equal(found.length, 1, 'Save buttons: ' + found.length)
  return found[0]
}
