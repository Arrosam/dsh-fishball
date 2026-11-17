/**
 * F-SETTINGS black-box cases: core's own settings page on DSH's Plugins page, the write-only token
 * field, Connect, the hosted target line, the two Fishball-page entries, the `view=settings`
 * continuation, the removed slim panel and the Node Connect route. The Use Cases (SET3-UC-nn), the
 * levels and the technique index are in README.md beside this file; every value comes from
 * constants.mjs (requirements and frozen contracts only).
 *
 * Techniques, Use Cases first: Use Case (SET3-UC-01…11, each test naming its flow step), then EP
 * (SET3-EP-01…08), BVA (SET3-BVA-01…04), Decision Table (SET3-DT-01…06, one test per rule) and State
 * Transition (SET3-ST-01…05, one test per transition). Until F-SETTINGS lands these fail; that is
 * expected (the cases come first).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import {
  CLIENTS, CONNECT, CONNECT_ROUTE, CONTINUATION, CORE, DSH, ENTRY_ACTION, FIELD_ORDER, FIELDS, FIXTURE, HARNESS, HOSTED_IMPORT, INSTANCE_TARGET, LINK_SAVE, MARK, OPEN, OUTCOME,
  ROUTE, SUBJECT, TOKEN_FIELD, freshToken,
} from './constants.mjs'
import { CODE_THROW, SECRET, THROWN, assertNoSecret, assertOneWarning } from '../link/log-privacy.mjs'
import { createWorld, loadChunkAlone, loadPage, settle } from './page.mjs'
import { registerModelCatalogCases } from './model-catalog.mjs'
import { registerSettingsPolishCases } from './polish-cases.mjs'
import { registerConnectRaceCases } from './connect-cases.mjs'
import { STAND_IN } from './primitives.mjs'
import { instanceWith, routeWorld, targetRule } from './route.mjs'

const show = (v) => JSON.stringify(v)
const LATER = Object.freeze({ e2e: 'E2E-UI (W6 browser flows on a real DSH: the Plugins page, the native Settings dialog)' })

/** Core's stored settings in the nested shape the namespace holds (requirement 2). */
const STORED = Object.freeze({
  target: { url: FIXTURE.storedUrl },
  connect: { clientMetadataUrl: FIXTURE.storedMetadataUrl },
  identity: { id: FIXTURE.coreId, name: FIXTURE.storedName },
})
const set = (field, value) => ({ op: DSH.op.set, path: [...field.path], value })
const unset = (field) => ({ op: DSH.op.unset, path: [...field.path] })
const byPath = (a, b) => a.path.join('.').localeCompare(b.path.join('.'))

async function until(fn, ms = HARNESS.waitMs) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) { if (await fn()) return true; await new Promise((r) => setTimeout(r, HARNESS.pollMs)) }
  return Boolean(await fn())
}

/** A loaded page world; `open` mounts the bundle configuration entry with that view. */
async function pageOf(t, sdk, options = {}, open = DSH.view.page) {
  const world = createWorld({ sdk, core: STORED, ...options })
  const page = await loadPage(t, world)
  if (open) await page.open(open)
  return page
}
const inputValue = (page, name) => page.field(name).input?.props.value
const failedLine = (page) => page.byAttr(STAND_IN.saveFailed).length > 0
const connectBlock = (page) => page.byAttr(MARK.connect)[0]
const connectState = (page) => connectBlock(page)?.props[MARK.connectState]
const connectText = (page) => (connectBlock(page) ? textOfNode(connectBlock(page)) : '')
const textOfNode = (node) => (typeof node === 'string' ? node : (node.children ?? []).map(textOfNode).join(''))
const routeUrl = (base) => new URL(ROUTE.relative, base).href
const connectCalls = (world, method) => world.fetches.filter((f) => f.url === routeUrl(world.base) && f.method === method)
const secretField = (page) => page.find((n) => n.props[STAND_IN.primitive] === 'SettingsSecretField', [page.field(TOKEN_FIELD).wrapper].filter(Boolean))[0]
const secretConfigured = (page) => page.find((n) => n.props[STAND_IN.secretState] !== undefined, [page.field(TOKEN_FIELD).wrapper].filter(Boolean))[0]?.props[STAND_IN.secretState]
const secretLabel = (page) => textOfNode(page.find((n) => n.props[STAND_IN.secretState] !== undefined, [page.field(TOKEN_FIELD).wrapper].filter(Boolean))[0] ?? { children: [] })

/** The header action whose tree holds the entry marker `which`. */
async function headerEntry(page, which) {
  const headers = await page.headers()
  const found = headers.find((h) => page.byAttr(MARK.entry, which, h.tree).length > 0)
  assert.ok(found, `no header action carries ${MARK.entry}="${which}"; header ids ${show(headers.map((x) => x.id))}`)
  return { ...found, node: () => page.byAttr(MARK.entry, which, page.world.shim.treeOf(found.key))[0], tree: () => page.world.shim.treeOf(found.key) }
}
/** Press the clickable control of an entry (the marked node or the button inside it). */
async function pressEntry(page, entry) {
  const node = entry.node()
  const target = node.props.onClick ? node : page.find((n) => n.tag === 'button' && n.props.onClick, [node])[0]
  assert.ok(target, 'the entry has nothing to press')
  await page.press(target)
}

/** Nothing the page keeps or sends holds `value` (requirement 3). */
function assertNeverExposed(page, value) {
  const w = page.world
  assert.equal(page.visibleStrings().some((s) => s.includes(value)), false, 'the token is rendered')
  assert.equal(w.console.some((line) => line.includes(value)), false, 'the token is logged')
  assert.equal(w.fetches.some((f) => f.url.includes(value) || (f.body ?? '').includes(value)), false, 'a fetch carries the token')
  assert.equal(w.location.href.includes(value), false, 'the token is in the URL')
  assert.equal(JSON.stringify(w.mutations).includes(value), false, 'the token went into the settings')
  assert.equal(JSON.stringify(w.remoteOther).includes(value), false, 'the token went to another remote call')
  assert.equal(w.opened.some((args) => args.join(' ').includes(value)), false, 'the token was opened')
}

export function registerSettingsCases(sdk) {
  // ============================================================== SET3-UC-01: core's own settings page (req 1)
  caseTest(sdk, 'SET3-UC-01', 'main 1-2', "with the namespace served, one plugins.bundle.config entry keyed by the bundle name 'fishball-core'", async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    assert.equal(page.world.configEntries().length, 1, 'entries ' + show(page.world.entries(DSH.slot.bundleConfig).map((e) => e.options.key)))
    assert.deepEqual(page.world.failedFibers, [], 'failed plugins')
  })
  caseTest(sdk, 'SET3-UC-01', 'main 3', "view 'page' renders the form (page root, its fields) and the Connect control", async (t) => {
    const page = await pageOf(t, sdk)
    assert.equal(page.byAttr(MARK.page).length, 1, 'no page root ' + MARK.page)
    assert.ok(page.byAttr(MARK.field).length > 0, 'no fields')
    assert.equal(page.byAttr(MARK.connect).length, 1, 'no Connect control')
  })
  caseTest(sdk, 'SET3-UC-01', 'main 3', "the page edits the namespace of core's row 'fishball-core' (configForms.get)", async (t) => {
    const page = await pageOf(t, sdk)
    assert.ok(page.world.formGets.includes(CORE.namespace), 'configForms.get calls ' + show(page.world.formGets))
  })
  caseTest(sdk, 'SET3-UC-01', 'main 3', "pluginNavigation.openBundle('fishball-core') lands on this entry: its key is the bundle name openBundle is given", async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    await pressEntry(page, await headerEntry(page, MARK.entries.fishball))
    assert.deepEqual(page.world.openBundle, [CORE.bundle])
    assert.deepEqual(page.world.configEntries().map((e) => e.options.key), page.world.openBundle)
  })
  caseTest(sdk, 'SET3-UC-01', 'A1', 'namespace not served: no plugins.bundle.config entry, and nothing failed', async (t) => {
    const page = await pageOf(t, sdk, { core: null }, null)
    assert.equal(page.world.configEntries().length, 0)
    assert.deepEqual(page.world.failedFibers, [])
  })
  caseTest(sdk, 'SET3-UC-01', 'A3', "view 'summary' renders a one-liner or nothing: no field, no input, no Save", async (t) => {
    const page = await pageOf(t, sdk, {}, DSH.view.summary)
    assert.equal(page.byAttr(MARK.field).length, 0)
    assert.equal(page.find((n) => n.tag === 'input').length, 0)
    assert.equal(page.saveButton(), undefined)
  })
  caseTest(sdk, 'SET3-UC-01', 'A4', 'hosted child (the instance namespace served too): the same page, the same fields in the same order', async (t) => {
    const standalone = await pageOf(t, sdk)
    const hosted = await pageOf(t, sdk, { instanceTarget: { [INSTANCE_TARGET.field]: FIXTURE.instanceUrl } })
    const order = (p) => p.byAttr(MARK.field).map((n) => n.props[MARK.field])
    assert.deepEqual(order(hosted), order(standalone))
    assert.deepEqual(order(hosted), [...FIELD_ORDER])
    assert.equal(hosted.byAttr(MARK.connect).length, 1, 'no Connect control in hosted mode')
  })

  // ============================================================== SET3-UC-02: edit and save (req 2)
  caseTest(sdk, 'SET3-UC-02', 'main 1', 'the form holds exactly target.url, the token field, connect.clientMetadataUrl, identity.id, identity.name, in that order', async (t) => {
    const page = await pageOf(t, sdk)
    assert.deepEqual(page.byAttr(MARK.field).map((n) => n.props[MARK.field]), [...FIELD_ORDER])
  })
  caseTest(sdk, 'SET3-UC-02', 'main 1', 'each setting is a text field showing its stored (nested) value', async (t) => {
    const page = await pageOf(t, sdk)
    for (const [field, value] of [[FIELDS.url, FIXTURE.storedUrl], [FIELDS.metadata, FIXTURE.storedMetadataUrl], [FIELDS.id, FIXTURE.coreId], [FIELDS.name, FIXTURE.storedName]]) {
      const { input } = page.field(field.name)
      assert.ok(input, 'no input in ' + field.name)
      assert.notEqual(input.props.type, 'password', field.name + ' is not a text field')
      assert.equal(input.props.value, value, field.name)
    }
  })
  caseTest(sdk, 'SET3-UC-02', 'main 2-3', "saving target.url sends one mutate([{op:'set', path:['target','url'], value}], revision) to 'fishball-core'", async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
    await page.save()
    assert.deepEqual(page.world.mutations, [{ ns: CORE.namespace, ops: [set(FIELDS.url, FIXTURE.targetUrl)], expectedRevision: FIXTURE.revision }])
    assert.equal(page.world.coreValue().target.url, FIXTURE.targetUrl, 'the accepted value is not shown back')
    assert.equal(failedLine(page), false)
  })
  caseTest(sdk, 'SET3-UC-02', 'main 3', 'one Save holds one Save control: the form has exactly one Save button', async (t) => {
    const page = await pageOf(t, sdk)
    assert.equal(page.byAttr(STAND_IN.save).length, 1)
  })
  caseTest(sdk, 'SET3-UC-02', 'A1', "clearing a stored field sends {op:'unset', path:['identity','name']}", async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(FIELDS.name.name, '')
    await page.save()
    assert.deepEqual(page.world.mutations.map((m) => m.ops), [[unset(FIELDS.name)]])
  })
  caseTest(sdk, 'SET3-UC-02', 'A2', 'a field typed back to its stored value sends nothing (Save stays disabled)', async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
    await page.edit(FIELDS.url.name, FIXTURE.storedUrl)
    assert.equal(page.saveButton()?.props.disabled, true, 'Save is enabled with nothing changed')
    await page.save()
    assert.deepEqual(page.world.mutations, [])
  })
  caseTest(sdk, 'SET3-UC-02', 'E1', "the Host refuses (mutate resolves false): DSH's save-failed line, and the staged text stays", async (t) => {
    const page = await pageOf(t, sdk)
    page.world.mutateAnswer = false
    await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
    await page.save()
    assert.equal(page.world.mutations.length, 1)
    assert.ok(failedLine(page), 'no save-failed line')
    assert.equal(inputValue(page, FIELDS.url.name), FIXTURE.targetUrl, 'the staged text was lost')
  })
  caseTest(sdk, 'SET3-UC-02', 'E2', "the write rejects (transport failure): DSH's save-failed line, the staged text stays", async (t) => {
    const page = await pageOf(t, sdk)
    page.world.mutateAnswer = 'reject'
    await page.edit(FIELDS.id.name, FIXTURE.coreId + '-x')
    await page.save()
    assert.ok(failedLine(page), 'no save-failed line')
    assert.equal(inputValue(page, FIELDS.id.name), FIXTURE.coreId + '-x')
  })

  // ---- SET3-EP-01: form text partitions (settingsTextField: trimmed text sets, blank clears)
  for (const [row, title, stored, text, expected] of [
    ['1 new', 'a URL into an empty target.url → set', {}, FIXTURE.targetUrl, [set(FIELDS.url, FIXTURE.targetUrl)]],
    ['2 padded', 'a padded URL → set, trimmed', STORED, '  ' + FIXTURE.targetUrl + '  ', [set(FIELDS.url, FIXTURE.targetUrl)]],
    ['3 blank', "spaces only in a stored target.url (blank = target-unset) → unset", STORED, '   ', [unset(FIELDS.url)]],
    ['4 empty', 'empty text in a stored target.url → unset', STORED, '', [unset(FIELDS.url)]],
    ['5 never stored', 'empty text in a field never stored → nothing sent', {}, '', null],
  ]) {
    caseTest(sdk, 'SET3-EP-01', row, 'target.url: ' + title, async (t) => {
      const page = await pageOf(t, sdk, { core: stored })
      await page.edit(FIELDS.url.name, text)
      await page.save()
      assert.deepEqual(page.world.mutations.map((m) => m.ops), expected === null ? [] : [expected])
    })
  }
  caseTest(sdk, 'SET3-EP-01', '6 metadata', 'connect.clientMetadataUrl saves under [connect, clientMetadataUrl] (no default: blank clears it)', async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(FIELDS.metadata.name, FIXTURE.metadataUrl)
    await page.save()
    await page.edit(FIELDS.metadata.name, '')
    await page.save()
    assert.deepEqual(page.world.mutations.map((m) => m.ops), [[set(FIELDS.metadata, FIXTURE.metadataUrl)], [unset(FIELDS.metadata)]])
  })
  caseTest(sdk, 'SET3-EP-01', '7 identity', 'identity.id and identity.name save as nested paths', async (t) => {
    const page = await pageOf(t, sdk, { core: {} })
    await page.edit(FIELDS.id.name, FIXTURE.coreId)
    await page.edit(FIELDS.name.name, FIXTURE.coreName)
    await page.save()
    assert.equal(page.world.mutations.length, 1, 'one Save → one mutate')
    assert.deepEqual([...page.world.mutations[0].ops].sort(byPath), [set(FIELDS.id, FIXTURE.coreId), set(FIELDS.name, FIXTURE.coreName)].sort(byPath))
    assert.deepEqual(page.world.coreValue().identity, { id: FIXTURE.coreId, name: FIXTURE.coreName })
  })

  // ============================================================== SET3-UC-03: the write-only token field (req 3)
  caseTest(sdk, 'SET3-UC-03', 'main 1', 'the token field is a password input (SettingsSecretField), blank at load, in both modes', async (t) => {
    for (const options of [{}, { instanceTarget: { [INSTANCE_TARGET.field]: FIXTURE.instanceUrl } }, { configured: true }]) {
      const page = await pageOf(t, sdk, options)
      const { input } = page.field(TOKEN_FIELD)
      assert.ok(secretField(page), 'not DSH\'s SettingsSecretField: ' + show(options))
      assert.equal(input?.props.type, 'password', show(options))
      assert.equal(input?.props.value, '', 'the token field is not blank at load: ' + show(options))
    }
  })
  caseTest(sdk, 'SET3-UC-03', 'main 2-3', "a pasted token is written with remote.credentials.set(HOSTED_IMPORT.credentialRef, value), and nothing else is written", async (t) => {
    const page = await pageOf(t, sdk)
    const value = freshToken()
    await page.edit(TOKEN_FIELD, value)
    await page.save()
    assert.deepEqual(page.world.credentialSets, [{ ref: HOSTED_IMPORT.credentialRef, value }])
    assert.deepEqual(page.world.mutations, [], 'the token went into the settings namespace')
    assert.equal(failedLine(page), false)
  })
  caseTest(sdk, 'SET3-UC-03', 'main 4', 'after a successful write the field is blank again and the state label says a token is waiting', async (t) => {
    const page = await pageOf(t, sdk, { configured: false })
    const before = secretLabel(page)
    await page.edit(TOKEN_FIELD, freshToken())
    await page.save()
    assert.equal(inputValue(page, TOKEN_FIELD), '')
    assert.ok(await until(async () => { await settle(); return secretConfigured(page) === 'true' }), 'the state does not follow describe().configured')
    assert.notEqual(secretLabel(page), before, 'the label did not change from "none waiting"')
  })
  caseTest(sdk, 'SET3-UC-03', 'post', 'the value is never rendered, logged, put in a URL or sent anywhere but credentials.set (staged, saved, and after a refused save)', async (t) => {
    const page = await pageOf(t, sdk)
    const value = freshToken()
    await page.edit(TOKEN_FIELD, value)
    assertNeverExposed(page, value)
    await page.press(page.byAttr(MARK.connectBegin)[0])
    await page.save()
    assertNeverExposed(page, value)
    page.world.credentialAnswer = 'refused'
    const second = freshToken()
    await page.edit(TOKEN_FIELD, second)
    await page.save()
    assertNeverExposed(page, second)
  })
  caseTest(sdk, 'SET3-UC-03', 'post', 'the state label reflects describe([DSH_AGENT_TOKEN]).configured, never a value', async (t) => {
    const none = await pageOf(t, sdk, { configured: false })
    const waiting = await pageOf(t, sdk, { configured: true })
    assert.ok(waiting.world.credentialDescribes.some((refs) => refs.includes(HOSTED_IMPORT.credentialRef)), 'describe was not asked for the reference')
    assert.equal(secretConfigured(none), 'false')
    assert.equal(secretConfigured(waiting), 'true')
    assert.notEqual(secretLabel(none), secretLabel(waiting), 'one label for both states')
  })
  caseTest(sdk, 'SET3-UC-03', 'E1', "a refused write (credentials.set → {ok:false}) shows the save-failed line", async (t) => {
    const page = await pageOf(t, sdk)
    page.world.credentialAnswer = 'refused'
    await page.edit(TOKEN_FIELD, freshToken())
    await page.save()
    assert.equal(page.world.credentialSets.length, 1)
    assert.ok(failedLine(page), 'no save-failed line')
  })
  caseTest(sdk, 'SET3-UC-03', 'E1', 'a rejected write (credentials.set rejects) shows the save-failed line', async (t) => {
    const page = await pageOf(t, sdk)
    page.world.credentialAnswer = 'reject'
    await page.edit(TOKEN_FIELD, freshToken())
    await page.save()
    assert.ok(failedLine(page), 'no save-failed line')
  })

  // ---- SET3-EP-02 / SET3-BVA-01: token text (trimmed; blank writes nothing)
  for (const [id, row, title, make, written] of [
    ['SET3-BVA-01', '1 empty', "'' → nothing written", () => '', false],
    ['SET3-BVA-01', '2 one space', "' ' → nothing written", () => ' ', false],
    ['SET3-EP-02', '3 whitespace', 'tabs and newlines only → nothing written', () => '\t\n  ', false],
    ['SET3-BVA-01', '4 one character', 'one character → written as it is', () => 'x', true],
    ['SET3-BVA-01', '5 padded', 'a padded token → written trimmed', () => '  ' + freshToken() + '  ', true],
  ]) {
    caseTest(sdk, id, row, 'token field: ' + title, async (t) => {
      const page = await pageOf(t, sdk)
      const text = make()
      await page.edit(TOKEN_FIELD, text)
      await page.save()
      assert.deepEqual(page.world.credentialSets, written ? [{ ref: HOSTED_IMPORT.credentialRef, value: text.trim() }] : [])
    })
  }

  // ---- SET3-DT-01: one Save (settings changed × token typed × Host answer × credential answer)
  for (const [rule, title, { change, token, host = true, cred = 'ok' }, expect] of [
    [1, 'settings only, Host accepts → one mutate, no credential write, no failed line', { change: true, token: false }, { seq: ['mutate'], failed: false }],
    [2, 'settings and token, both accepted → mutate first, then credentials.set; token blank', { change: true, token: true }, { seq: ['mutate', 'credentials.set'], failed: false }],
    [3, 'settings and token, Host refuses → mutate only, no credential write, failed line', { change: true, token: true, host: false }, { seq: ['mutate'], failed: true }],
    [4, 'settings and token, credential refused → both, failed line', { change: true, token: true, cred: 'refused' }, { seq: ['mutate', 'credentials.set'], failed: true }],
    [5, 'token only, accepted → credentials.set only', { change: false, token: true }, { seq: ['credentials.set'], failed: false }],
    [6, 'nothing changed → nothing sent, Save disabled', { change: false, token: false }, { seq: [], failed: false }],
  ]) {
    caseTest(sdk, 'SET3-DT-01', rule, title, async (t) => {
      const page = await pageOf(t, sdk)
      page.world.mutateAnswer = host
      page.world.credentialAnswer = cred
      if (change) await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
      if (token) await page.edit(TOKEN_FIELD, freshToken())
      if (!change && !token) assert.equal(page.saveButton()?.props.disabled, true, 'Save enabled with nothing staged')
      await page.save()
      assert.deepEqual(page.world.sequence, expect.seq)
      assert.equal(failedLine(page), expect.failed)
      if (rule === 2) assert.equal(inputValue(page, TOKEN_FIELD), '')
    })
  }

  // ---- SET3-ST-02: the token field (blank → staged → saved | failed → saved)
  caseTest(sdk, 'SET3-ST-02', '1', 'blank → typed: staged (Save enabled), nothing written yet', async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(TOKEN_FIELD, freshToken())
    assert.equal(page.saveButton()?.props.disabled, false)
    assert.deepEqual(page.world.credentialSets, [])
  })
  caseTest(sdk, 'SET3-ST-02', '2', 'staged → Save refused → failed, then Save accepted → blank, no failed line', async (t) => {
    const page = await pageOf(t, sdk)
    page.world.credentialAnswer = 'refused'
    const value = freshToken()
    await page.edit(TOKEN_FIELD, value)
    await page.save()
    assert.ok(failedLine(page), 'no failed line after the refusal')
    page.world.credentialAnswer = 'ok'
    await page.edit(TOKEN_FIELD, value)
    await page.save()
    assert.equal(failedLine(page), false)
    assert.equal(inputValue(page, TOKEN_FIELD), '')
    assert.equal(page.world.credentialSets.length, 2)
  })
  caseTest(sdk, 'SET3-ST-02', '3', 'saved → reopened page: the field starts blank again (never shows a stored value)', async (t) => {
    const page = await pageOf(t, sdk)
    await page.edit(TOKEN_FIELD, freshToken())
    await page.save()
    await page.close()
    await page.open(DSH.view.page)
    assert.equal(inputValue(page, TOKEN_FIELD), '')
  })

  // ============================================================== SET3-UC-04: Connect (req 4)
  caseTest(sdk, 'SET3-UC-04', 'main 1', "reads GET api/fishball/connect document-relative with credentials 'same-origin' and cache 'no-store'", async (t) => {
    for (const base of [FIXTURE.base, FIXTURE.subBase]) {
      const page = await pageOf(t, sdk, { base })
      const gets = connectCalls(page.world, ROUTE.get)
      assert.ok(gets.length >= 1, 'no GET of ' + routeUrl(base) + '; fetches ' + show(page.world.fetches.map((f) => f.method + ' ' + f.url)))
      for (const call of gets) assert.deepEqual([call.credentials, call.cache], [ROUTE.credentials, ROUTE.cache])
    }
  })
  caseTest(sdk, 'SET3-UC-04', 'main 1', 'the Connect block shows the state it read, and a Connect button', async (t) => {
    const page = await pageOf(t, sdk)
    assert.ok(await until(async () => { await settle(); return connectState(page) === CONNECT.state.needsAuthorization }), 'state ' + connectState(page))
    assert.equal(page.byAttr(MARK.connectBegin).filter((n) => n.tag === 'button').length, 1)
  })
  caseTest(sdk, 'SET3-UC-04', 'main 2-3', "Connect → POST once; approval-url → window.open(url, '_blank', 'noopener') once; then a re-read", async (t) => {
    const page = await pageOf(t, sdk)
    page.world.connect.post = () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl } })
    const before = page.world.fetches.length
    await page.press(page.byAttr(MARK.connectBegin)[0])
    const after = page.world.fetches.slice(before)
    assert.deepEqual(after.filter((f) => f.method === ROUTE.post).map((f) => [f.url, f.credentials, f.cache]), [[routeUrl(page.world.base), ROUTE.credentials, ROUTE.cache]])
    assert.deepEqual(page.world.opened, [[FIXTURE.approvalUrl, OPEN.target, OPEN.features]])
    const postAt = after.findIndex((f) => f.method === ROUTE.post)
    assert.ok(after.slice(postAt + 1).some((f) => f.method === ROUTE.get), 'no re-read after the press')
  })
  caseTest(sdk, 'SET3-UC-04', 'main 2', 'Connect sits outside the form: it is not inside SettingsForm, and Save sends no Connect request', async (t) => {
    const page = await pageOf(t, sdk)
    const form = page.find((n) => n.props[STAND_IN.primitive] === 'SettingsForm')[0]
    assert.ok(form, 'no SettingsForm')
    assert.equal(page.find((n) => n.props[MARK.connect] !== undefined, [form]).length, 0, 'Connect is inside the form')
    await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
    await page.save()
    assert.deepEqual(connectCalls(page.world, ROUTE.post), [])
  })
  caseTest(sdk, 'SET3-UC-04', 'A3', 'window focus → the status is read again (exactly one GET per focus)', async (t) => {
    const page = await pageOf(t, sdk)
    for (let i = 0; i < 2; i++) {
      const before = connectCalls(page.world, ROUTE.get).length
      page.world.dispatchWindow(DSH.focus)
      await settle()
      assert.equal(connectCalls(page.world, ROUTE.get).length, before + 1, 'focus ' + (i + 1))
    }
  })

  // ---- SET3-EP-03: status answers
  for (const state of Object.values(CONNECT.state)) {
    caseTest(sdk, 'SET3-EP-03', 'state ' + state, `GET 200 {state: '${state}'} → the block's state is '${state}'`, async (t) => {
      const code = state === CONNECT.state.needsConfiguration ? CONNECT.configuration.metadataUrlMissing : null
      const world = createWorld({ sdk, core: STORED })
      world.connect.get = () => ({ status: ROUTE.ok, json: { state, code } })
      const page = await loadPage(t, world)
      await page.open(DSH.view.page)
      assert.ok(await until(async () => { await settle(); return connectState(page) === state }), 'state ' + connectState(page))
    })
  }
  for (const [row, title, answer] of [
    ['503', 'GET 503 {code: CONNECT_UNAVAILABLE}', () => ({ status: ROUTE.unavailable.status, json: ROUTE.unavailable.body })],
    ['non-JSON', 'GET 200 with a non-JSON body', () => ({ status: ROUTE.ok, text: FIXTURE.nonJson })],
    ['network', 'GET fails at the network', () => 'reject'],
    ['bad state', 'GET 200 with a state outside CONNECT.state', () => ({ status: ROUTE.ok, json: { state: FIXTURE.bogusState, code: null } })],
  ]) {
    caseTest(sdk, 'SET3-EP-03', row, title + " → state 'unavailable', nothing opened, nothing failed", async (t) => {
      const world = createWorld({ sdk, core: STORED })
      world.connect.get = answer
      const page = await loadPage(t, world)
      await page.open(DSH.view.page)
      assert.ok(await until(async () => { await settle(); return connectState(page) === MARK.unavailable }), 'state ' + connectState(page))
      assert.ok(connectText(page).trim() !== '', 'no unavailable line')
      assert.deepEqual(world.opened, [])
      assert.deepEqual(world.failedFibers, [])
    })
  }

  // ---- SET3-EP-04: begin answers
  caseTest(sdk, 'SET3-EP-04', 'authorized', "POST → {outcome:'authorized'}: nothing opened, the status is read again", async (t) => {
    const page = await pageOf(t, sdk)
    page.world.connect.post = () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.authorized } })
    page.world.connect.get = () => ({ status: ROUTE.ok, json: { state: CONNECT.state.authorized, code: null } })
    await page.press(page.byAttr(MARK.connectBegin)[0])
    assert.deepEqual(page.world.opened, [])
    assert.ok(await until(async () => { await settle(); return connectState(page) === CONNECT.state.authorized }), 'state ' + connectState(page))
  })
  caseTest(sdk, 'SET3-EP-04', 'needs-configuration', "POST → {outcome:'needs-configuration', code}: each code shows its own words; nothing opened", async (t) => {
    const texts = new Map()
    for (const code of Object.values(CONNECT.configuration)) {
      const page = await pageOf(t, sdk)
      page.world.connect.post = () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.configuration, code } })
      const before = connectText(page)
      await page.press(page.byAttr(MARK.connectBegin)[0])
      await settle()
      assert.deepEqual(page.world.opened, [], code)
      assert.notEqual(connectText(page), before, 'no words for ' + code)
      texts.set(code, connectText(page))
    }
    assert.equal(new Set(texts.values()).size, texts.size, 'two codes show the same words: ' + show([...texts]))
  })
  for (const [row, answer] of [
    ['503', () => ({ status: ROUTE.unavailable.status, json: ROUTE.unavailable.body })],
    ['non-JSON', () => ({ status: ROUTE.ok, text: FIXTURE.nonJson })],
    ['network', () => 'reject'],
    ['bad outcome', () => ({ status: ROUTE.ok, json: { outcome: FIXTURE.bogusState } })],
    ['approval without url', () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.approval } })],
  ]) {
    caseTest(sdk, 'SET3-EP-04', row, `POST answers ${row} → an unavailable line; nothing is opened; nothing failed`, async (t) => {
      const page = await pageOf(t, sdk)
      page.world.connect.post = answer
      const before = connectText(page)
      await page.press(page.byAttr(MARK.connectBegin)[0])
      await settle()
      assert.deepEqual(page.world.opened, [])
      assert.notEqual(connectText(page), before, 'no line after the failed Connect')
      assert.deepEqual(page.world.failedFibers, [])
    })
  }

  // ---- SET3-ST-03: the Connect control
  caseTest(sdk, 'SET3-ST-03', '1', 'unavailable → focus with the route back → shows the new state', async (t) => {
    const world = createWorld({ sdk, core: STORED })
    world.connect.get = () => ({ status: ROUTE.unavailable.status, json: ROUTE.unavailable.body })
    const page = await loadPage(t, world)
    await page.open(DSH.view.page)
    assert.ok(await until(async () => { await settle(); return connectState(page) === MARK.unavailable }))
    world.connect.get = () => ({ status: ROUTE.ok, json: { state: CONNECT.state.authorizing, code: null } })
    world.dispatchWindow(DSH.focus)
    assert.ok(await until(async () => { await settle(); return connectState(page) === CONNECT.state.authorizing }), 'state ' + connectState(page))
  })
  caseTest(sdk, 'SET3-ST-03', '2', 'shown → Connect pressed → re-read shows the state after the press', async (t) => {
    const page = await pageOf(t, sdk)
    page.world.connect.post = () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl } })
    page.world.connect.get = () => ({ status: ROUTE.ok, json: { state: CONNECT.state.authorizing, code: null } })
    await page.press(page.byAttr(MARK.connectBegin)[0])
    assert.ok(await until(async () => { await settle(); return connectState(page) === CONNECT.state.authorizing }), 'state ' + connectState(page))
  })
  caseTest(sdk, 'SET3-BVA-03', 'presses', 'two Connect presses → exactly two POSTs and two window.open calls', async (t) => {
    const page = await pageOf(t, sdk)
    page.world.connect.post = () => ({ status: ROUTE.ok, json: { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl } })
    await page.press(page.byAttr(MARK.connectBegin)[0])
    await page.press(page.byAttr(MARK.connectBegin)[0])
    assert.equal(connectCalls(page.world, ROUTE.post).length, 2)
    assert.equal(page.world.opened.length, 2)
  })

  // ============================================================== SET3-UC-05: the Node route (req 5)
  caseTest(sdk, 'SET3-UC-05', 'main 1', "registers {path:'/api/fishball/connect', methods:['GET','POST'], requestBody:'buffered', fetch}", async () => {
    const r = await routeWorld()
    assert.equal(r.routes.length, 1, show(r.routes.map((x) => x.path)))
    const [route] = r.routes
    assert.equal(route.path, ROUTE.path)
    assert.deepEqual([...route.methods].sort(), [...ROUTE.methods].sort())
    assert.equal(route.requestBody, ROUTE.requestBody)
    assert.equal(typeof route.fetch, 'function')
  })
  caseTest(sdk, 'SET3-UC-05', 'main 2', 'GET → 200 {state, code} of ui.connect.status(), JSON, cache-control no-store', async () => {
    const status = { state: CONNECT.state.needsConfiguration, code: CONNECT.configuration.metadataUrlRootPath }
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status }).service })
    const answer = await r.request(ROUTE.get)
    assert.equal(answer.status, ROUTE.ok)
    assert.deepEqual(answer.json, status)
    assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore)
    assert.match(answer.headers.get(ROUTE.contentType) ?? '', new RegExp(ROUTE.json))
  })
  caseTest(sdk, 'SET3-UC-05', 'main 2', 'GET answers only {state, code}, even when status() returns more', async () => {
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: { state: CONNECT.state.failed, code: null, extra: FIXTURE.routeError } }).service })
    assert.deepEqual((await r.request(ROUTE.get)).json, { state: CONNECT.state.failed, code: null })
  })
  for (const begin of [{ outcome: OUTCOME.authorized }, { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl }, { outcome: OUTCOME.configuration, code: CONNECT.configuration.notAConnector }]) {
    caseTest(sdk, 'SET3-UC-05', 'main 3', `POST → 200 with await begin() (${begin.outcome}), JSON, no-store; begin called once with no argument`, async () => {
      const instance = instanceWith({ begin })
      const r = await routeWorld({ [DSH.service.instance]: instance.service })
      const answer = await r.request(ROUTE.post)
      assert.equal(answer.status, ROUTE.ok)
      assert.deepEqual(answer.json, begin)
      assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore)
      assert.deepEqual(instance.calls.begin, [[]])
    })
  }
  caseTest(sdk, 'SET3-UC-05', 'main 3', 'POST ignores its body: any body gives the same answer', async () => {
    const begin = { outcome: OUTCOME.approval, url: FIXTURE.approvalUrl }
    const instance = instanceWith({ begin })
    const r = await routeWorld({ [DSH.service.instance]: instance.service })
    for (const body of [undefined, '', '{"url":"https://evil.test"}', FIXTURE.nonJson]) assert.deepEqual((await r.request(ROUTE.post, body)).json, begin, show(body))
    assert.ok(instance.calls.begin.every((args) => args.length === 0), 'begin got an argument')
  })
  caseTest(sdk, 'SET3-UC-05', 'post', 'the service is looked up per request: absent → 503, provided → 200, replaced → the new one answers', async () => {
    const r = await routeWorld()
    assert.equal((await r.request(ROUTE.get)).status, ROUTE.unavailable.status)
    r.setInstance(instanceWith({ status: { state: CONNECT.state.authorized, code: null } }).service)
    assert.deepEqual((await r.request(ROUTE.get)).json, { state: CONNECT.state.authorized, code: null })
    r.setInstance(instanceWith({ status: { state: CONNECT.state.failed, code: null } }).service)
    assert.deepEqual((await r.request(ROUTE.get)).json, { state: CONNECT.state.failed, code: null })
    r.setInstance(undefined)
    assert.equal((await r.request(ROUTE.post)).status, ROUTE.unavailable.status)
  })

  // ---- SET3-EP-06 / SET3-BVA-02 / SET3-DT-05: the service partitions at the route
  const unavailable = async (services, method, label) => {
    const r = await routeWorld(services)
    const answer = await r.request(method)
    assert.equal(answer.status, ROUTE.unavailable.status, label)
    assert.deepEqual(answer.json, ROUTE.unavailable.body, label)
    assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore, label)
    assert.equal(answer.text.includes(FIXTURE.routeError), false, 'error detail leaked: ' + label)
  }
  const ok = { state: CONNECT.state.authorized, code: null }
  for (const [row, title, service] of [
    ['1 absent', 'no fishballInstance', undefined],
    ['2 no ui', 'apiVersion 1 but no ui', { apiVersion: ROUTE.apiVersion }],
    ['3 no connect', 'ui without connect', { apiVersion: ROUTE.apiVersion, ui: {} }],
    ['4 not functions', 'ui.connect whose status/begin are not functions', { apiVersion: ROUTE.apiVersion, ui: { connect: { status: ok, begin: ok } } }],
    ['5 string version', "apiVersion '1' (a string)", { ...instanceWith({ status: ok, begin: ok }).service, apiVersion: String(ROUTE.apiVersion) }],
  ]) {
    caseTest(sdk, 'SET3-EP-06', row, `${title} → 503 CONNECT_UNAVAILABLE on GET and POST`, async () => {
      for (const method of ROUTE.methods) await unavailable(service === undefined ? {} : { [DSH.service.instance]: service }, method, method + ' ' + row)
    })
  }
  for (const [row, version, accepted] of [['0', ROUTE.apiVersion - 1, false], ['1', ROUTE.apiVersion, true], ['2', ROUTE.apiVersion + 1, false]]) {
    caseTest(sdk, 'SET3-BVA-02', 'apiVersion ' + row, `apiVersion ${version} → ${accepted ? '200' : '503'}`, async () => {
      const r = await routeWorld({ [DSH.service.instance]: instanceWith({ apiVersion: version, status: ok }).service })
      assert.equal((await r.request(ROUTE.get)).status, accepted ? ROUTE.ok : ROUTE.unavailable.status)
    })
  }
  for (const [rule, title, method, options] of [
    [1, 'GET, compatible service → 200 status', ROUTE.get, { status: ok }],
    [2, 'GET, status() throws → 503, no detail', ROUTE.get, { status: () => { throw new Error(FIXTURE.routeError) } }],
    [3, 'POST, compatible service → 200 begin', ROUTE.post, { begin: { outcome: OUTCOME.authorized } }],
    [4, 'POST, begin() rejects → 503, no detail', ROUTE.post, { begin: () => Promise.reject(new Error(FIXTURE.routeError)) }],
    [5, 'POST, begin() throws → 503, no detail', ROUTE.post, { begin: () => { throw new Error(FIXTURE.routeError) } }],
  ]) {
    caseTest(sdk, 'SET3-DT-05', rule, title, async () => {
      const services = { [DSH.service.instance]: instanceWith(options).service }
      if (rule === 1 || rule === 3) {
        const answer = await (await routeWorld(services)).request(method)
        assert.equal(answer.status, ROUTE.ok)
        assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore)
      } else await unavailable(services, method, title)
    })
  }

  // ============================================================== F-FIX-3: a throw behind the Connect routes is logged (Fishball, 2026-11-17)
  // The answer stays exactly SET3-DT-05's (503 CONNECT_UNAVAILABLE, no detail, no-store); in
  // addition one warn(LINK_SAVE.text.failed, CONNECT_ROUTE.connectFailed, code) goes to
  // ctx.logger(LINK_SAVE.logger), code = String(error.code ?? error.name ?? typeof error). No other
  // 503 (no service, an undefined answer) and no 200 logs anything. Nothing of the failure but its
  // code is logged (log-privacy.mjs: every thrown value carries fresh secrets in every field).
  const failedWarning = (code) => [LINK_SAVE.text.failed, CONNECT_ROUTE.connectFailed, code]
  /** One request on a fresh route world; the answer must be SET3-DT-05's 503. */
  const unavailableLogged = async (r, method, at, label) => {
    const answer = await r.request(method, undefined, at)
    assert.equal(answer.status, ROUTE.unavailable.status, label)
    assert.deepEqual(answer.json, ROUTE.unavailable.body, label)
    assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore, label)
    for (const secret of [FIXTURE.routeError, SECRET.token, SECRET.clientSecret, SECRET.url]) assert.equal(answer.text.includes(secret), false, 'error detail in the answer: ' + label)
    return answer
  }
  const throwing = (make) => () => { throw make() }
  const rejecting = (make) => () => Promise.reject(make())
  const VIA = Object.freeze({ fbtestCallback: 'web' })
  /**
   * The failing member of each route, by the request that reaches it (EP over the four calls), and
   * how it can fail. connect.d.ts types `status()` and `cancel()` as synchronous, so they fail by a
   * throw only; `begin()` (and the route-only BEGIN_VIA begin) returns a promise, so it may also reject.
   */
  const SYNC_ONLY = Object.freeze([['throws', throwing]])
  const SYNC_OR_ASYNC = Object.freeze([['throws', throwing], ['rejects', rejecting]])
  const MEMBERS = Object.freeze([
    ['GET status', ROUTE.get, ROUTE.path, (fail) => ({ status: fail }), {}, SYNC_ONLY],
    ['POST begin', ROUTE.post, ROUTE.path, (fail) => ({ begin: fail }), {}, SYNC_OR_ASYNC],
    ['POST begin via', ROUTE.post, ROUTE.path, (fail) => ({ via: fail, begin: { outcome: OUTCOME.authorized } }), { callbackFor: () => VIA }, SYNC_OR_ASYNC],
    ['cancel', ROUTE.post, ROUTE.cancelPath, (fail) => ({ cancel: fail, status: ok }), { cancel: true }, SYNC_ONLY],
  ])

  caseTest(sdk, 'SET3-UC-05', 'E3 (F-FIX-3)', "status() throws → the same 503, and one warning on ctx.logger('fishball-link'): the fixed line, the fixed reason, the code", async () => {
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: throwing(CODE_THROW.make) }).service })
    await unavailableLogged(r, ROUTE.get, ROUTE.path, 'GET')
    assert.ok(r.log.names.includes(LINK_SAVE.logger), "no ctx.logger('" + LINK_SAVE.logger + "'): " + show(r.log.names))
    assertOneWarning(r.log.logs, LINK_SAVE.logger, failedWarning(CODE_THROW.code), 'GET')
  })

  // ---- SET3-EP-09: the thrown value partitions → the code logged (Error with code / name only / neither; non-Error throws)
  for (const [row, title, make, code] of THROWN) {
    caseTest(sdk, 'SET3-EP-09', row, `status() throws ${title}; 503 and one warning carrying exactly that code, no message, URL, token or secret`, async () => {
      const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: throwing(make) }).service })
      await unavailableLogged(r, ROUTE.get, ROUTE.path, row)
      assertOneWarning(r.log.logs, LINK_SAVE.logger, failedWarning(code), row)
    })
  }
  caseTest(sdk, 'SET3-EP-09', '12 every partition on every member', 'each thrown partition, thrown by status, begin, begin via the web callback and cancel, and rejected by both begins → 503 and its one warning with its code', async () => {
    for (const [member, method, at, shape, options, failures] of MEMBERS) {
      for (const [kind, wrap] of failures) {
        for (const [row, , make, code] of THROWN) {
          const label = `${member} ${kind} ${row}`
          const r = await routeWorld({ [DSH.service.instance]: instanceWith(shape(wrap(make))).service }, options)
          await unavailableLogged(r, method, at, label)
          assertOneWarning(r.log.logs, LINK_SAVE.logger, failedWarning(code), label)
        }
      }
    }
  })

  // ---- SET3-DT-07: route × member × what the member does → answer, warnings (one test per rule)
  /**
   * `status()` answering `undefined` breaks the ConnectStatus contract: the route's own read of
   * `{state, code}` from it throws a TypeError, an error the route swallows, so it warns with that
   * error's name (Fishball's correction, 2026-11-17). `begin()` resolving `undefined` or an unknown
   * outcome is no error (the answer is only absent): 503, no warning.
   */
  const READ_UNDEFINED = 'TypeError'
  const DT7 = [
    // [rule, title, method, path, service options, route options, status, the code of its one warning (null: none)]
    [1, 'GET, status() answers → 200, nothing logged', ROUTE.get, ROUTE.path, { status: ok }, {}, ROUTE.ok, null],
    [2, 'GET, status() throws → 503, one warning', ROUTE.get, ROUTE.path, { status: throwing(CODE_THROW.make) }, {}, ROUTE.unavailable.status, CODE_THROW.code],
    [3, "GET, status() answers undefined (outside ConnectStatus) → 503, one warning: reading {state, code} from it throws, code 'TypeError'", ROUTE.get, ROUTE.path, { status: undefined }, {}, ROUTE.unavailable.status, READ_UNDEFINED],
    [4, 'POST, begin() answers → 200, nothing logged', ROUTE.post, ROUTE.path, { begin: { outcome: OUTCOME.authorized } }, {}, ROUTE.ok, null],
    [5, 'POST, begin() throws synchronously → 503, one warning', ROUTE.post, ROUTE.path, { begin: throwing(CODE_THROW.make) }, {}, ROUTE.unavailable.status, CODE_THROW.code],
    [6, 'POST, begin() rejects → 503, one warning', ROUTE.post, ROUTE.path, { begin: rejecting(CODE_THROW.make) }, {}, ROUTE.unavailable.status, CODE_THROW.code],
    [7, 'POST, begin() answers undefined → 503, nothing logged', ROUTE.post, ROUTE.path, { begin: undefined }, {}, ROUTE.unavailable.status, null],
    [8, 'POST with a web callback, BEGIN_VIA begin answers → 200, nothing logged', ROUTE.post, ROUTE.path, { via: { outcome: OUTCOME.authorized } }, { callbackFor: () => VIA }, ROUTE.ok, null],
    [9, 'POST with a web callback, BEGIN_VIA begin throws → 503, one warning', ROUTE.post, ROUTE.path, { via: throwing(CODE_THROW.make) }, { callbackFor: () => VIA }, ROUTE.unavailable.status, CODE_THROW.code],
    [10, 'POST with a web callback, BEGIN_VIA begin rejects → 503, one warning', ROUTE.post, ROUTE.path, { via: rejecting(CODE_THROW.make) }, { callbackFor: () => VIA }, ROUTE.unavailable.status, CODE_THROW.code],
    [11, 'cancel, cancel() and status() answer → 200, nothing logged', ROUTE.post, ROUTE.cancelPath, { status: ok }, { cancel: true }, ROUTE.ok, null],
    [12, 'cancel, cancel() throws → 503, one warning', ROUTE.post, ROUTE.cancelPath, { cancel: throwing(CODE_THROW.make), status: ok }, { cancel: true }, ROUTE.unavailable.status, CODE_THROW.code],
    [13, 'cancel, cancel() answers, then status() throws → 503, one warning', ROUTE.post, ROUTE.cancelPath, { status: throwing(CODE_THROW.make) }, { cancel: true }, ROUTE.unavailable.status, CODE_THROW.code],
    [19, 'POST, begin() answers an outcome outside connect.d.ts → 503, nothing logged (no error: the answer is absent)', ROUTE.post, ROUTE.path, { begin: { outcome: FIXTURE.bogusState, url: SECRET.url } }, {}, ROUTE.unavailable.status, null],
  ]
  for (const [rule, title, method, at, options, routeOptions, status, code] of DT7) {
    caseTest(sdk, 'SET3-DT-07', rule, title, async () => {
      const r = await routeWorld({ [DSH.service.instance]: instanceWith(options).service }, routeOptions)
      if (status === ROUTE.ok) {
        const answer = await r.request(method, undefined, at)
        assert.equal(answer.status, ROUTE.ok, title)
        assert.equal(answer.headers.get(ROUTE.cacheControl), ROUTE.noStore)
      } else await unavailableLogged(r, method, at, title)
      if (code === null) assert.deepEqual(r.log.logs, [], 'logged without a swallowed error: ' + title)
      else assertOneWarning(r.log.logs, LINK_SAVE.logger, failedWarning(code), title)
    })
  }
  for (const [rule, title, service] of [
    [14, 'no fishballInstance → 503 on GET, POST and cancel, nothing logged', undefined],
    [15, 'apiVersion 2 (another service version) → 503 on GET, POST and cancel, nothing logged', instanceWith({ apiVersion: ROUTE.apiVersion + 1, status: throwing(CODE_THROW.make), begin: throwing(CODE_THROW.make), cancel: throwing(CODE_THROW.make) }).service],
    [16, 'ui without connect → 503 on GET, POST and cancel, nothing logged', { apiVersion: ROUTE.apiVersion, ui: {} }],
  ]) {
    caseTest(sdk, 'SET3-DT-07', rule, title, async () => {
      const r = await routeWorld(service === undefined ? {} : { [DSH.service.instance]: service }, { cancel: true })
      for (const [method, at] of [[ROUTE.get, ROUTE.path], [ROUTE.post, ROUTE.path], [ROUTE.post, ROUTE.cancelPath]]) await unavailableLogged(r, method, at, `${method} ${at}`)
      assert.deepEqual(r.log.logs, [], 'a missing service was logged as a failure')
    })
  }
  caseTest(sdk, 'SET3-DT-07', 17, 'ctx without logger: status(), begin() and cancel() throwing still answer 503, and registering does not throw', async () => {
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: throwing(CODE_THROW.make), begin: rejecting(CODE_THROW.make), cancel: throwing(CODE_THROW.make) }).service }, { logger: false, cancel: true })
    for (const [method, at] of [[ROUTE.get, ROUTE.path], [ROUTE.post, ROUTE.path], [ROUTE.post, ROUTE.cancelPath]]) await unavailableLogged(r, method, at, `${method} ${at}`)
    assert.deepEqual(r.log.logs, [])
  })
  caseTest(sdk, 'SET3-DT-07', 18, 'ctx without logger: a compatible service still answers 200 on GET, POST and cancel', async () => {
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: ok, begin: { outcome: OUTCOME.authorized } }).service }, { logger: false, cancel: true })
    for (const [method, at] of [[ROUTE.get, ROUTE.path], [ROUTE.post, ROUTE.path], [ROUTE.post, ROUTE.cancelPath]]) assert.equal((await r.request(method, undefined, at)).status, ROUTE.ok, `${method} ${at}`)
  })

  // ---- SET3-BVA-05: warnings counted per failing request (0, 1, 2, 3 requests)
  for (const n of [0, 1, 2, 3]) {
    caseTest(sdk, 'SET3-BVA-05', `${n} requests`, `${n} failing GET${n === 1 ? '' : 's'} → exactly ${n} warning${n === 1 ? '' : 's'}, one per request`, async () => {
      const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: throwing(CODE_THROW.make) }).service })
      for (let i = 0; i < n; i++) await unavailableLogged(r, ROUTE.get, ROUTE.path, 'request ' + (i + 1))
      assert.deepEqual(r.log.logs.map((l) => [l.name, l.level, l.args]), Array.from({ length: n }, () => [LINK_SAVE.logger, 'warn', failedWarning(CODE_THROW.code)]))
      assertNoSecret(r.log.logs)
    })
  }

  // ---- SET3-ST-06: the same route over a service that fails, recovers, goes and fails again
  caseTest(sdk, 'SET3-ST-06', '1', 'throwing → answering → withdrawn → throwing (another code): warnings only for the two throws, each with its own code', async () => {
    const r = await routeWorld({ [DSH.service.instance]: instanceWith({ status: throwing(CODE_THROW.make) }).service })
    await unavailableLogged(r, ROUTE.get, ROUTE.path, 'throwing')
    r.setInstance(instanceWith({ status: ok }).service)
    assert.equal((await r.request(ROUTE.get)).status, ROUTE.ok, 'answering')
    r.setInstance(undefined)
    await unavailableLogged(r, ROUTE.get, ROUTE.path, 'withdrawn')
    const [, , makeOther, otherCode] = THROWN.find(([row]) => row === '7 string')
    r.setInstance(instanceWith({ status: throwing(makeOther) }).service)
    await unavailableLogged(r, ROUTE.get, ROUTE.path, 'throwing again')
    assert.deepEqual(r.log.logs.map((l) => [l.name, l.level, l.args]), [[LINK_SAVE.logger, 'warn', failedWarning(CODE_THROW.code)], [LINK_SAVE.logger, 'warn', failedWarning(otherCode)]])
    assertNoSecret(r.log.logs)
  })

  // ============================================================== SET3-UC-06: the hosted target line (req 6)
  caseTest(sdk, 'SET3-UC-06', 'main', "the instance namespace serves a non-blank targetUrl → one read-only line showing it", async (t) => {
    const page = await pageOf(t, sdk, { instanceTarget: { [INSTANCE_TARGET.field]: FIXTURE.instanceUrl } })
    const lines = page.byAttr(MARK.instanceTarget)
    assert.equal(lines.length, 1)
    assert.ok(textOfNode(lines[0]).includes(FIXTURE.instanceUrl), 'the line does not show the URL')
    const editable = page.find((n) => n.tag === 'input' && !n.props.readOnly && !n.props.disabled, [lines[0]])
    assert.deepEqual(editable, [], 'the instance target is editable')
  })
  for (const [row, title, served] of [
    ['1 not served', 'the instance namespace not served', null],
    ['2 empty', "targetUrl ''", { [INSTANCE_TARGET.field]: '' }],
    ['3 blank', 'targetUrl of spaces only', { [INSTANCE_TARGET.field]: '   ' }],
    ['4 not a string', 'targetUrl a number', { [INSTANCE_TARGET.field]: 443 }],
    ['5 missing', 'the namespace served without targetUrl', {}],
  ]) {
    caseTest(sdk, 'SET3-EP-07', row, `${title} → no instance target line`, async (t) => {
      const page = await pageOf(t, sdk, { instanceTarget: served })
      assert.equal(page.byAttr(MARK.instanceTarget).length, 0)
      assert.equal(page.byAttr(MARK.page).length, 1, 'the page itself is gone')
    })
  }
  caseTest(sdk, 'SET3-UC-06', 'A1', 'the line follows the Host: served later → it appears; withdrawn → it goes', async (t) => {
    const page = await pageOf(t, sdk)
    assert.equal(page.byAttr(MARK.instanceTarget).length, 0)
    page.world.serve(INSTANCE_TARGET.row, { [INSTANCE_TARGET.field]: FIXTURE.instanceUrl })
    assert.ok(await until(async () => { await settle(); return page.byAttr(MARK.instanceTarget).length === 1 }), 'no line once served')
    page.world.unserve(INSTANCE_TARGET.row)
    assert.ok(await until(async () => { await settle(); return page.byAttr(MARK.instanceTarget).length === 0 }), 'the line stayed')
  })

  // ============================================================== SET3-UC-11: target precedence (Fishball's decision, 2026-11-16)
  // The instance's value wins when it is a string with a non-white-space character; otherwise the
  // user's target.url applies. Either value is returned unchanged (no trimming, no URL check).
  const NO_VALUE = Symbol('absent')
  const argument = (instance, user) => ({ ...(instance === NO_VALUE ? {} : { instance }), ...(user === NO_VALUE ? {} : { user }) })
  const INSTANCE_VALUES = Object.freeze([
    ['absent', NO_VALUE, false],
    ['empty', '', false],
    ['spaces', '   ', false],
    ['number', 443, false],
    ['null', null, false],
    ['object', { url: FIXTURE.instanceUrl }, false],
    ['URL', FIXTURE.instanceUrl, true],
    ['padded URL', '  ' + FIXTURE.instanceUrl + '  ', true],
  ])
  const USER_VALUES = Object.freeze([['absent', NO_VALUE], ['blank', '   '], ['URL', FIXTURE.storedUrl]])
  const valueOf = (v) => (v === NO_VALUE ? undefined : v)

  caseTest(sdk, 'SET3-UC-11', 'main 1', 'the instance supplies a URL → effectiveTarget returns it, not the user\'s, and hasInstanceTarget is true', async () => {
    const rule = await targetRule()
    assert.equal(rule.effective({ instance: FIXTURE.instanceUrl, user: FIXTURE.storedUrl }), FIXTURE.instanceUrl)
    assert.equal(rule.hasInstance(FIXTURE.instanceUrl), true)
  })
  caseTest(sdk, 'SET3-UC-11', 'A1', 'no instance value (standalone) → the user\'s target.url, unchanged; hasInstanceTarget false', async () => {
    const rule = await targetRule()
    assert.equal(rule.effective({ user: FIXTURE.storedUrl }), FIXTURE.storedUrl)
    assert.equal(rule.hasInstance(undefined), false)
  })
  caseTest(sdk, 'SET3-UC-11', 'post', 'the rule is pure: the argument is left as it was, and the same call answers the same', async () => {
    const rule = await targetRule()
    for (const [instance, user] of [[FIXTURE.instanceUrl, FIXTURE.storedUrl], [{ url: FIXTURE.instanceUrl }, FIXTURE.storedUrl], ['   ', '  ' + FIXTURE.storedUrl]]) {
      const arg = { instance, user }
      const copy = structuredClone(arg)
      const first = rule.effective(arg)
      assert.deepEqual(arg, copy, 'the argument changed: ' + show(copy))
      assert.equal(rule.effective(arg), first, show(copy))
      rule.hasInstance(instance)
      assert.deepEqual(arg, copy, 'hasInstanceTarget changed its argument: ' + show(copy))
    }
  })

  // ---- SET3-DT-06: effectiveTarget / hasInstanceTarget (instance value × user target.url), one test per rule
  let dtRule = 0
  for (const [instanceRow, instance, wins] of INSTANCE_VALUES) {
    for (const [userRow, user] of USER_VALUES) {
      dtRule += 1
      const expected = wins ? valueOf(instance) : valueOf(user)
      caseTest(sdk, 'SET3-DT-06', dtRule, `instance ${instanceRow} × user ${userRow} → effectiveTarget ${show(expected) ?? 'undefined'} (${wins ? 'instance' : 'user'}), hasInstanceTarget ${wins}`, async () => {
        const rule = await targetRule()
        assert.equal(rule.effective(argument(instance, user)), expected)
        assert.equal(rule.hasInstance(valueOf(instance)), wins)
      })
    }
  }
  // ---- SET3-BVA-04: the white-space boundary of the instance value (the user's URL is there to lose to)
  for (const [row, instance, wins] of [
    ['1 one space', ' ', false],
    ['2 tab and newline', '\t\n ', false],
    ['3 one character', 'x', true],
    ['4 one padded character', ' x ', true],
  ]) {
    caseTest(sdk, 'SET3-BVA-04', row, `instance ${show(instance)} → ${wins ? 'the instance value, unchanged' : "the user's"}`, async () => {
      const rule = await targetRule()
      assert.equal(rule.effective({ instance, user: FIXTURE.storedUrl }), wins ? instance : FIXTURE.storedUrl)
      assert.equal(rule.hasInstance(instance), wins)
    })
  }

  // ---- the page: the instance line and the target.url hint (UC-11 main 2, EP-08, ST-05)
  // The field's own text, without the instance line should it sit inside the wrapper: the hint alone
  // must differ, not merely the presence of the line.
  const fieldText = (node) => (typeof node === 'string' ? node : node.props?.[MARK.instanceTarget] !== undefined ? '' : (node.children ?? []).map(fieldText).join(''))
  const urlHint = (page) => { const { wrapper } = page.field(FIELDS.url.name); return wrapper ? fieldText(wrapper) : undefined }
  const lineText = (page) => { const [line] = page.byAttr(MARK.instanceTarget); return line ? textOfNode(line) : undefined }
  const served = (value) => ({ [INSTANCE_TARGET.field]: value })
  /**
   * The target.url wrapper text of a standalone page in `lang` with the same stored `core` (the
   * ordinary hint). Same stored value on both sides, so only the hint can make the texts differ.
   */
  const ordinaryHint = async (t, lang, core = STORED) => urlHint(await pageOf(t, sdk, { lang, core }))
  /** Hosted: one line showing `url` with words of its own; the field still editable; its hint not the ordinary one. */
  const assertHosted = (page, url, ordinary, label) => {
    assert.equal(page.byAttr(MARK.instanceTarget).length, 1, 'no instance line: ' + label)
    const text = lineText(page)
    assert.ok(text.includes(url), `the line does not show ${url}: ${show(text)} (${label})`)
    assert.notEqual(text.split(url).join('').trim(), '', 'the line shows only the URL, not that it is in use: ' + label)
    const { input } = page.field(FIELDS.url.name)
    assert.ok(input, 'no target.url input: ' + label)
    assert.ok(!input.props.disabled && !input.props.readOnly, 'target.url is not editable: ' + label)
    assert.notEqual(urlHint(page), ordinary, 'the target.url hint is the ordinary one while the instance supplies a target: ' + label)
  }
  const assertStandalone = (page, ordinary, label) => {
    assert.equal(page.byAttr(MARK.instanceTarget).length, 0, 'an instance line: ' + label)
    assert.equal(urlHint(page), ordinary, 'the target.url hint is not the ordinary one: ' + label)
  }

  caseTest(sdk, 'SET3-UC-11', 'main 2', 'hosted (en, zh): the line shows the instance URL and says it is in use; target.url stays editable with a "not used" hint', async (t) => {
    const texts = {}
    for (const lang of DSH.locales) {
      const ordinary = await ordinaryHint(t, lang)
      assert.ok((ordinary ?? '').trim() !== '', 'no target.url field text in ' + lang)
      const page = await pageOf(t, sdk, { lang, instanceTarget: served(FIXTURE.instanceUrl) })
      assertHosted(page, FIXTURE.instanceUrl, ordinary, lang)
      texts[lang] = { line: lineText(page), hint: urlHint(page) }
    }
    assert.notEqual(texts.zh.line, texts.en.line, 'the line reads the same in en and zh')
    assert.notEqual(texts.zh.hint, texts.en.hint, 'the hint reads the same in en and zh')
  })
  caseTest(sdk, 'SET3-UC-11', 'main 2', 'hosted: the user\'s target.url can still be edited and saved (it is kept, only not used)', async (t) => {
    const page = await pageOf(t, sdk, { instanceTarget: served(FIXTURE.instanceUrl) })
    await page.edit(FIELDS.url.name, FIXTURE.targetUrl)
    await page.save()
    assert.deepEqual(page.world.mutations.map((m) => [m.ns, m.ops]), [[CORE.namespace, [set(FIELDS.url, FIXTURE.targetUrl)]]])
    assert.equal(page.world.namespaces.get(INSTANCE_TARGET.row).value[INSTANCE_TARGET.field], FIXTURE.instanceUrl, 'the instance value was written')
  })
  caseTest(sdk, 'SET3-UC-11', 'main 2', 'hosted: the "not used" hint does not depend on the user\'s value (stored or never stored)', async (t) => {
    for (const core of [STORED, {}]) {
      const ordinary = await ordinaryHint(t, 'en', core)
      const page = await pageOf(t, sdk, { core, instanceTarget: served(FIXTURE.instanceUrl) })
      assertHosted(page, FIXTURE.instanceUrl, ordinary, 'user ' + show(core.target ?? null))
    }
  })
  // ---- SET3-EP-08: every instance partition of DT-06, on the page (en and zh)
  for (const [row, instance, wins] of INSTANCE_VALUES) {
    caseTest(sdk, 'SET3-EP-08', row, `instance ${row} → ${wins ? 'the line (in use) and the "not used" hint' : 'no line, the ordinary hint'} (en, zh)`, async (t) => {
      for (const lang of DSH.locales) {
        const ordinary = await ordinaryHint(t, lang)
        // "absent" is the instance namespace not served at all.
        const page = await pageOf(t, sdk, { lang, instanceTarget: instance === NO_VALUE ? null : served(instance) })
        if (wins) assertHosted(page, FIXTURE.instanceUrl, ordinary, lang)
        else assertStandalone(page, ordinary, lang)
      }
    })
  }
  caseTest(sdk, 'SET3-EP-08', 'field missing', 'the instance namespace served without targetUrl → no line, the ordinary hint', async (t) => {
    const ordinary = await ordinaryHint(t, 'en')
    assertStandalone(await pageOf(t, sdk, { instanceTarget: {} }), ordinary, 'served {}')
  })
  // ---- SET3-ST-05: the line and the hint follow the instance live (not served → served → withdrawn → served; value changes)
  const waitFor = (page, check) => until(async () => { await settle(); try { check(); return true } catch { return false } }).then((ok) => { if (!ok) check() })
  for (const lang of DSH.locales) {
    caseTest(sdk, 'SET3-ST-05', '1-3 ' + lang, `(${lang}) not served → served: line and "not used" hint; → withdrawn: both back to standalone; → served again: hosted again`, async (t) => {
      const page = await pageOf(t, sdk, { lang })
      const ordinary = urlHint(page)
      assertStandalone(page, ordinary, 'start')
      page.world.serve(INSTANCE_TARGET.row, served(FIXTURE.instanceUrl))
      await waitFor(page, () => assertHosted(page, FIXTURE.instanceUrl, ordinary, 'served'))
      const hostedHint = urlHint(page)
      page.world.unserve(INSTANCE_TARGET.row)
      await waitFor(page, () => assertStandalone(page, ordinary, 'withdrawn'))
      page.world.serve(INSTANCE_TARGET.row, served(FIXTURE.instanceUrl))
      await waitFor(page, () => assertHosted(page, FIXTURE.instanceUrl, ordinary, 'served again'))
      assert.equal(urlHint(page), hostedHint, 'served again shows another hint than the first time')
    })
  }
  caseTest(sdk, 'SET3-ST-05', '4', 'served URL A → the value changes to URL B: the line shows B, not A; the hint stays "not used"', async (t) => {
    const ordinary = await ordinaryHint(t, 'en')
    const page = await pageOf(t, sdk, { instanceTarget: served(FIXTURE.instanceUrl) })
    page.world.serve(INSTANCE_TARGET.row, served(FIXTURE.otherInstanceUrl))
    await waitFor(page, () => {
      assertHosted(page, FIXTURE.otherInstanceUrl, ordinary, 'changed')
      assert.equal(lineText(page).includes(FIXTURE.instanceUrl), false, 'the line still shows the old URL')
    })
  })
  caseTest(sdk, 'SET3-ST-05', '5', 'served URL → the value becomes blank (still served): the line goes and the hint is the ordinary one; → a URL again: hosted', async (t) => {
    const ordinary = await ordinaryHint(t, 'en')
    const page = await pageOf(t, sdk, { instanceTarget: served(FIXTURE.instanceUrl) })
    page.world.serve(INSTANCE_TARGET.row, served('   '))
    await waitFor(page, () => assertStandalone(page, ordinary, 'blank'))
    page.world.serve(INSTANCE_TARGET.row, served(FIXTURE.instanceUrl))
    await waitFor(page, () => assertHosted(page, FIXTURE.instanceUrl, ordinary, 'URL again'))
  })

  // ============================================================== SET3-UC-07: the two Fishball-page entries (req 7)
  caseTest(sdk, 'SET3-UC-07', 'main 1', 'two header actions with distinct ids: Fishball settings and DSH settings', async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    const fishball = await headerEntry(page, MARK.entries.fishball)
    const dsh = await headerEntry(page, MARK.entries.dsh)
    assert.notEqual(fishball.id, undefined)
    assert.notEqual(fishball.id, dsh.id)
    assert.equal(new Set(page.world.headerEntries().map((e) => e.options.id)).size, page.world.headerEntries().length, 'duplicate header ids')
  })
  caseTest(sdk, 'SET3-BVA-03', 'entries', 'exactly one entry of each kind across the header actions', async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    const headers = await page.headers()
    for (const which of Object.values(MARK.entries)) assert.equal(headers.flatMap((h) => page.byAttr(MARK.entry, which, h.tree)).length, 1, which)
  })
  // ---- SET3-DT-02: Fishball settings
  caseTest(sdk, 'SET3-DT-02', 1, "pluginNavigation present → openBundle('fishball-core'), no selectPanel", async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    await pressEntry(page, await headerEntry(page, MARK.entries.fishball))
    assert.deepEqual(page.world.openBundle, [CORE.bundle])
    assert.deepEqual(page.world.selectPanel, [])
  })
  caseTest(sdk, 'SET3-DT-02', 2, "pluginNavigation absent → layout.selectPanel('plugins'), nothing else", async (t) => {
    const page = await pageOf(t, sdk, { navigation: false }, null)
    await pressEntry(page, await headerEntry(page, MARK.entries.fishball))
    assert.deepEqual(page.world.selectPanel, [DSH.pluginsPanel])
    assert.deepEqual(page.world.opened, [])
  })
  // ---- SET3-DT-03: DSH settings
  caseTest(sdk, 'SET3-DT-03', 1, "DSH's launcher on the page → it is pressed once; no alert; no navigation", async (t) => {
    const page = await pageOf(t, sdk, { launcher: true }, null)
    const entry = await headerEntry(page, MARK.entries.dsh)
    await pressEntry(page, entry)
    assert.equal(page.world.launcherPresses, 1)
    assert.deepEqual(page.alerts(entry.tree()), [])
    assert.deepEqual([page.world.openBundle, page.world.selectPanel], [[], []])
  })
  caseTest(sdk, 'SET3-DT-03', 2, 'no launcher on the page → an alert line (DSH Settings cannot be opened from here), nothing else happens', async (t) => {
    const page = await pageOf(t, sdk, { launcher: false }, null)
    const entry = await headerEntry(page, MARK.entries.dsh)
    const fetches = page.world.fetches.length
    await pressEntry(page, entry)
    assert.ok(page.alerts().length > 0, 'no alert line')
    assert.equal(page.world.launcherPresses, 0)
    assert.deepEqual([page.world.openBundle, page.world.selectPanel, page.world.opened], [[], [], []])
    assert.equal(page.world.fetches.length, fetches, 'a request was sent')
  })
  caseTest(sdk, 'SET3-DT-03', 3, 'the launcher appears later → the same press reaches it (looked up at the press)', async (t) => {
    const page = await pageOf(t, sdk, { launcher: false }, null)
    const entry = await headerEntry(page, MARK.entries.dsh)
    page.world.setLauncher(true)
    await pressEntry(page, entry)
    assert.equal(page.world.launcherPresses, 1)
  })

  // ============================================================== SET3-UC-08 / DT-04 / EP-05 / ST-04: view=settings (req 8)
  const markSession = async (page) => { page.world.html.element.setAttribute(DSH.sessionMark, ''); await settle() }
  caseTest(sdk, 'SET3-UC-08', 'main 1', '#view=settings at load → core\'s settings page opens once (the Fishball-settings action)', async (t) => {
    const page = await pageOf(t, sdk, { hash: CONTINUATION.settings }, null)
    assert.deepEqual(page.world.openBundle, [CORE.bundle])
  })
  caseTest(sdk, 'SET3-UC-08', 'main 1', '#view=settings without pluginNavigation → selectPanel(\'plugins\') once', async (t) => {
    const page = await pageOf(t, sdk, { hash: CONTINUATION.settings, navigation: false }, null)
    assert.deepEqual(page.world.selectPanel, [DSH.pluginsPanel])
  })
  for (const [rule, title, between, opens] of [
    [1, 'active panel still Plugins when the session mark arrives → opens again (2 in all)', () => {}, 2],
    [2, 'active panel none when the session mark arrives → opens again (2 in all)', (w) => w.setActivePanel(null), 2],
    [3, "the owner moved to another panel first → no second open (1 in all)", (w) => w.setActivePanel('fbtest-other-panel'), 1],
  ]) {
    caseTest(sdk, 'SET3-DT-04', rule, title, async (t) => {
      const page = await pageOf(t, sdk, { hash: CONTINUATION.settings }, null)
      between(page.world)
      await markSession(page)
      assert.equal(page.world.settingsOpens(), opens, show({ openBundle: page.world.openBundle, selectPanel: page.world.selectPanel }))
    })
  }
  caseTest(sdk, 'SET3-ST-04', '1', 'session marked → marked again, removed and set again: no further open (only the first mark counts)', async (t) => {
    const page = await pageOf(t, sdk, { hash: CONTINUATION.settings }, null)
    await markSession(page)
    const after = page.world.settingsOpens()
    page.world.html.element.setAttribute(DSH.sessionMark, 'again')
    page.world.html.element.removeAttribute(DSH.sessionMark)
    await markSession(page)
    assert.equal(page.world.settingsOpens(), after)
  })
  for (const [row, hash] of [['empty', ''], ['plugins', '#view=plugins'], ['case', '#view=Settings'], ['suffix', '#view=settings2'], ['lang only', '#lang=zh'], ['bare', '#settings']]) {
    caseTest(sdk, 'SET3-EP-05', row, `fragment ${show(hash)} → nothing opens, at load or at the session mark`, async (t) => {
      const page = await pageOf(t, sdk, { hash }, null)
      await markSession(page)
      assert.equal(page.world.settingsOpens(), 0, show({ openBundle: page.world.openBundle, selectPanel: page.world.selectPanel }))
    })
  }
  caseTest(sdk, 'SET3-EP-05', 'query', "view=settings in the query, not the fragment → nothing opens", async (t) => {
    const page = await pageOf(t, sdk, { base: FIXTURE.base + '?view=settings' }, null)
    await markSession(page)
    assert.equal(page.world.settingsOpens(), 0)
  })

  // ============================================================== SET3-UC-09: removed (req 9; 1.34 item 4, R-HOST-11 withdrawn)
  caseTest(sdk, 'SET3-UC-09', 'main', "no main slot entry 'fishball-settings', no slim panel markers, no fishballSettingsSections service", async (t) => {
    const page = await pageOf(t, sdk, { instanceTarget: { [INSTANCE_TARGET.field]: FIXTURE.instanceUrl } })
    await page.headers()
    assert.deepEqual(page.world.entries(DSH.slot.main).filter((e) => e.options.key === DSH.removedPanelKey), [])
    for (const marker of MARK.removed) assert.equal(page.byAttr(marker, undefined, page.all()).length, 0, marker)
    assert.equal(page.world.root.get(DSH.service.removedSections), undefined)
  })

  // ============================================================== SET3-UC-10: load, locales, plugin shape (req 10)
  caseTest(sdk, 'SET3-UC-10', 'main 1', "the chunk registers {id:'fishball-core', chunk:'client.settings.js'} and exports settingsPlugin {name, inject, apply}", () => {
    const { registrations, exports, required } = loadChunkAlone(sdk)
    assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CORE.moduleId, SUBJECT.chunkName]])
    const plugin = exports?.[SUBJECT.pluginExport]
    assert.equal(typeof plugin?.name, 'string')
    assert.ok(Array.isArray(plugin?.inject), 'no inject list')
    assert.equal(typeof plugin?.apply, 'function')
    assert.deepEqual(required.filter((name) => !['react', 'react-dom', '@deepseek-ai/dsh-client-ui-primitives'].includes(name)), [], 'requires outside the served set')
  })
  caseTest(sdk, 'SET3-UC-10', 'main 2', "core's client.js starts the chunk (the page appears with no other loader), and no fiber fails", async (t) => {
    const page = await pageOf(t, sdk)
    assert.equal(page.byAttr(MARK.page).length, 1)
    assert.deepEqual(page.world.failedFibers, [])
    assert.deepEqual(page.world.errors, [])
  })
  caseTest(sdk, 'SET3-UC-10', 'main 3', 'dictionaries en and zh registered through ctx.locale.register, with the same keys', async (t) => {
    const page = await pageOf(t, sdk)
    const registered = page.world.localeRegistrations.filter((r) => DSH.locales.every((l) => r.dicts?.[l]))
    assert.ok(registered.length > 0, 'no en+zh registration: ' + show(page.world.localeRegistrations.map((r) => [r.ns, Object.keys(r.dicts ?? {})])))
    const keys = (d) => JSON.stringify(Object.keys(d).sort())
    for (const r of registered) assert.equal(keys(r.dicts.zh), keys(r.dicts.en), r.ns)
  })
  caseTest(sdk, 'SET3-UC-10', 'main 3', 'the page and the entries read in the active locale: zh differs from en', async (t) => {
    const read = async (lang) => { const p = await pageOf(t, sdk, { lang }); return [p.text(), ...(await p.headers()).map((h) => h.tree.map(textOfNode).join(''))].join('|') }
    assert.notEqual(await read('zh'), await read('en'))
  })
  caseTest(sdk, 'SET3-UC-10', 'A1', 'configForms missing: the page entry stays pending; the Fishball-page entries still register; nothing fails', async (t) => {
    const page = await pageOf(t, sdk, { omit: ['configForms'] }, null)
    assert.equal(page.world.configEntries().length, 0)
    const headers = await page.headers()
    for (const which of Object.values(MARK.entries)) assert.ok(headers.some((h) => page.byAttr(MARK.entry, which, h.tree).length > 0), which + ' entry missing')
    assert.deepEqual(page.world.failedFibers, [])
    assert.deepEqual(page.world.errors, [])
  })

  // ============================================================== F-UI: the entries are fishball-ui's (interface items 8–9)
  // Decision table over the clients a page loads × what appears: core alone gives its settings page
  // and no Fishball-page entry; with fishball-ui both entries appear with their relayed ids and orders.
  caseTest(sdk, 'SET3-UC-07', 'F-UI core only', "core's client alone: its settings page registers; no Fishball-page header entry and no view=settings open", async (t) => {
    const page = await pageOf(t, sdk, { clients: CLIENTS.coreOnly, hash: CONTINUATION.settings }, null)
    assert.equal(page.world.configEntries().length, 1, "core's settings page entry")
    const headers = await page.headers()
    for (const which of Object.values(MARK.entries)) assert.equal(headers.flatMap((h) => page.byAttr(MARK.entry, which, h.tree)).length, 0, which + ' entry from core')
    assert.equal(page.world.settingsOpens(), 0, 'core continued view=settings')
    assert.deepEqual(page.world.failedFibers, [])
  })
  caseTest(sdk, 'SET3-UC-07', 'F-UI ids', 'the two header actions are fishball-core-settings (order 90) and fishball-dsh-settings (order 91)', async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    for (const [which, action] of Object.entries(ENTRY_ACTION)) {
      const entry = await headerEntry(page, MARK.entries[which])
      assert.equal(entry.id, action.id, which)
      const options = page.world.headerEntries().find((e) => e.options.id === action.id)?.options
      assert.equal(options?.order, action.order, which + ' order')
    }
  })
  caseTest(sdk, 'SET3-UC-10', 'F-UI locale', `the entries read their words from the locale namespace ${SUBJECT.entriesLocale} (en and zh, same keys)`, async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    const mine = page.world.localeRegistrations.filter((r) => r.ns === SUBJECT.entriesLocale)
    assert.equal(mine.length > 0, true, 'namespaces registered: ' + show(page.world.localeRegistrations.map((r) => r.ns)))
    for (const r of mine) assert.equal(JSON.stringify(Object.keys(r.dicts.zh ?? {}).sort()), JSON.stringify(Object.keys(r.dicts.en ?? {}).sort()))
    const entries = page.world.headerEntries().filter((e) => Object.values(ENTRY_ACTION).some((a) => a.id === e.options.id))
    assert.deepEqual(entries.map((e) => e.options.locale), entries.map(() => SUBJECT.entriesLocale), 'entry locale namespaces')
  })

  // ============================================================== SET3-ST-01: the page entry follows the Host
  caseTest(sdk, 'SET3-ST-01', '1', 'not served → served: the entry appears', async (t) => {
    const page = await pageOf(t, sdk, { core: null }, null)
    page.world.serve(CORE.namespace, STORED)
    await settle()
    assert.equal(page.world.configEntries().length, 1)
  })
  caseTest(sdk, 'SET3-ST-01', '2', 'served → withdrawn: the entry goes', async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    page.world.unserve(CORE.namespace)
    await settle()
    assert.equal(page.world.configEntries().length, 0)
  })
  caseTest(sdk, 'SET3-ST-01', '3', 'withdrawn → served again: exactly one entry (no leftover, no double)', async (t) => {
    const page = await pageOf(t, sdk, {}, null)
    page.world.unserve(CORE.namespace)
    page.world.serve(CORE.namespace, STORED)
    await settle()
    assert.equal(page.world.configEntries().length, 1)
    await page.open(DSH.view.page)
    assert.equal(inputValue(page, FIELDS.url.name), FIXTURE.storedUrl)
  })

  // ============================================================== E-FIX-3 (B5): the model catalog under Cordis's inject rule
  registerModelCatalogCases(sdk)

  // ============================================================== UI-POLISH-F §5, §7: icon entries, Connect card
  registerSettingsPolishCases(sdk)
  // R-FIX-FUI F5 / F6: the Connect control's read and press races, and its press notices.
  registerConnectRaceCases(sdk)

  // ============================================================== later
  caseTest(sdk, 'SET3-UC-01', 'e2e', "the page on DSH's real Plugins page, both views", null, LATER.e2e)
  caseTest(sdk, 'SET3-UC-07', 'e2e', "DSH settings opens DSH's native Settings dialog in a browser", null, LATER.e2e)
}
