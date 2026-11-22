/**
 * F-SETTINGS black-box cases on core's own settings page (README.md beside this file): the page
 * entry on DSH's Plugins page, its fields and Save, the removed slim panel, the chunk's shape and
 * locales, and core alone on a page (no Fishball-page entry, no `view=settings` continuation). The
 * per-target cards (multi.mjs), their Connect races (connect-cases.mjs), the model select
 * (model-catalog.mjs), the logo theme (brand.mjs) and the wake settings (wake.mjs) are registered
 * from here. Every value comes from constants.mjs (requirements and frozen contracts only).
 *
 * Level: core's real client.js and client.settings.js in fishball-test-helpers' scripted page
 * (page.mjs), core's client alone. Rows that need fishball-ui's client (the two Fishball-page
 * entries, the continuation, CLIENTS.both) are integration rows; rows MULTI-0 withdrew are retired.
 * Neither kind is registered here (README.md lists them).
 *
 * Techniques: Use Case (SET3-UC-nn, each test naming its flow step), EP (SET3-EP-01 form text
 * partitions), Decision Table (SET3-DT-01 rule 6), State Transition (SET3-ST-01 the page entry).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { loadChunkAlone } from 'fishball-test-helpers/scripted-page'
import { STAND_IN } from 'fishball-test-helpers/dsh-primitives'
import { textOf } from 'fishball-test-helpers/react-shim'
import { CHUNK_REQUIRES, CONTINUATION, CORE, DSH, FIELDS, FIXTURE, MARK, SUBJECT } from './constants.mjs'
import { corePage, settle } from './page.mjs'
import { registerBrandSettingCases } from './brand.mjs'
import { registerConnectRaceCases } from './connect-cases.mjs'
import { registerModelCatalogCases } from './model-catalog.mjs'
import { registerMultiSettingsCases } from './multi.mjs'
import { registerWakeSettingCases } from './wake.mjs'

const show = (v) => JSON.stringify(v)

/** Core's stored settings in the nested shape the namespace holds (requirement 2; MULTI-1 removed target.url). */
const STORED = Object.freeze({
  connect: { clientMetadataUrl: FIXTURE.storedMetadataUrl },
  identity: { id: FIXTURE.coreId, name: FIXTURE.storedName },
})
const set = (field, value) => ({ op: DSH.op.set, path: [...field.path], value })
const unset = (field) => ({ op: DSH.op.unset, path: [...field.path] })
const byPath = (a, b) => a.path.join('.').localeCompare(b.path.join('.'))
const pageOf = (t, options = {}, view = DSH.view.page) => corePage(t, { core: STORED, ...options }, view)
const inputValue = (page, name) => page.field(name).input?.props.value
const failedLine = (page) => page.byAttr(STAND_IN.saveFailed).length > 0
/** Every request to open core's settings page, by either route (requirement 7). */
const settingsOpens = (world) => world.openBundle.length + world.selectPanel.filter((id) => id === DSH.pluginsPanel).length

export function registerSettingsCases() {
  registerMultiSettingsCases()
  registerBrandSettingCases()
  registerWakeSettingCases()

  // ============================================================== SET3-UC-01: core's own settings page (req 1)
  caseTest('SET3-UC-01', 'main 1-2', "with the namespace served, one plugins.bundle.config entry keyed by the bundle name 'fishball-core'", async (t) => {
    const page = await pageOf(t, {}, null)
    assert.equal(page.entries().length, 1, 'entries ' + show(page.world.entries(DSH.slot.bundleConfig).map((e) => e.options.key)))
    assert.deepEqual(page.world.failedFibers, [], 'failed plugins')
  })
  caseTest('SET3-UC-01', 'A1', 'namespace not served: no plugins.bundle.config entry, and nothing failed', async (t) => {
    const page = await pageOf(t, { core: null }, null)
    assert.equal(page.entries().length, 0)
    assert.deepEqual(page.world.failedFibers, [])
  })
  caseTest('SET3-UC-01', 'A3', "view 'summary' renders a one-liner or nothing: no field, no input, no Save", async (t) => {
    const page = await pageOf(t, {}, DSH.view.summary)
    assert.equal(page.byAttr(MARK.field).length, 0)
    assert.equal(page.find((n) => n.tag === 'input').length, 0)
    assert.equal(page.saveButton(), undefined)
  })

  // ============================================================== SET3-UC-02: edit and save (req 2)
  caseTest('SET3-UC-02', 'main 3', 'one Save holds one Save control: the form has exactly one Save button', async (t) => {
    const page = await pageOf(t)
    assert.equal(page.byAttr(STAND_IN.save).length, 1)
  })
  caseTest('SET3-UC-02', 'A1', "clearing a stored field sends {op:'unset', path:['identity','name']}", async (t) => {
    const page = await pageOf(t)
    await page.editField(FIELDS.name.name, '')
    await page.save()
    assert.deepEqual(page.world.mutations.map((m) => m.ops), [[unset(FIELDS.name)]])
  })
  caseTest('SET3-UC-02', 'E2', "the write rejects (transport failure): DSH's save-failed line, the staged text stays", async (t) => {
    const page = await pageOf(t)
    page.world.mutateAnswer = 'reject'
    await page.editField(FIELDS.id.name, FIXTURE.coreId + '-x')
    await page.save()
    assert.ok(failedLine(page), 'no save-failed line')
    assert.equal(inputValue(page, FIELDS.id.name), FIXTURE.coreId + '-x')
  })

  // ---- SET3-EP-01: form text partitions (settingsTextField: trimmed text sets, blank clears)
  caseTest('SET3-EP-01', '6 metadata', 'connect.clientMetadataUrl saves under [connect, clientMetadataUrl] (no default: blank clears it)', async (t) => {
    const page = await pageOf(t)
    await page.editField(FIELDS.metadata.name, FIXTURE.metadataUrl)
    await page.save()
    await page.editField(FIELDS.metadata.name, '')
    await page.save()
    assert.deepEqual(page.world.mutations.map((m) => m.ops), [[set(FIELDS.metadata, FIXTURE.metadataUrl)], [unset(FIELDS.metadata)]])
  })
  caseTest('SET3-EP-01', '7 identity', 'identity.id and identity.name save as nested paths', async (t) => {
    const page = await pageOf(t, { core: {} })
    await page.editField(FIELDS.id.name, FIXTURE.coreId)
    await page.editField(FIELDS.name.name, FIXTURE.coreName)
    await page.save()
    assert.equal(page.world.mutations.length, 1, 'one Save → one mutate')
    assert.deepEqual([...page.world.mutations[0].ops].sort(byPath), [set(FIELDS.id, FIXTURE.coreId), set(FIELDS.name, FIXTURE.coreName)].sort(byPath))
    assert.deepEqual(page.coreValue().identity, { id: FIXTURE.coreId, name: FIXTURE.coreName })
  })

  // ---- SET3-DT-01 rule 6: one Save with nothing staged (the token rules 1–5 went with MULTI-0)
  caseTest('SET3-DT-01', 6, 'nothing changed → nothing sent, Save disabled', async (t) => {
    const page = await pageOf(t)
    assert.equal(page.saveButton()?.props.disabled, true, 'Save enabled with nothing staged')
    await page.save()
    assert.deepEqual(page.world.sequence, [])
    assert.equal(failedLine(page), false)
  })

  // ============================================================== SET3-UC-09: removed (req 9; 1.34 item 4, R-HOST-11 withdrawn)
  // Core's half of requirement 9 (the slim panel was core's): core's client alone registers none of it.
  caseTest('SET3-UC-09', 'main', "no main slot entry 'fishball-settings', no slim panel markers, no fishballSettingsSections service", async (t) => {
    const page = await pageOf(t)
    await page.headers()
    assert.deepEqual(page.world.entries(DSH.slot.main).filter((e) => e.options.key === DSH.removedPanelKey), [])
    for (const marker of MARK.removed) assert.equal(page.byAttr(marker).length, 0, marker)
    assert.equal(page.world.root.get(DSH.service.removedSections), undefined)
  })

  // ============================================================== SET3-UC-10: load, locales, plugin shape (req 10)
  caseTest('SET3-UC-10', 'main 1', "the chunk registers {id:'fishball-core', chunk:'client.settings.js'} and exports settingsPlugin {name, inject, apply}", () => {
    const { registrations, exports, required } = loadChunkAlone(SUBJECT.chunk)
    assert.deepEqual(registrations.map((r) => [r.id, r.chunk]), [[CORE.moduleId, SUBJECT.chunkName]])
    const plugin = exports?.[SUBJECT.pluginExport]
    assert.equal(typeof plugin?.name, 'string')
    assert.ok(Array.isArray(plugin?.inject), 'no inject list')
    assert.equal(typeof plugin?.apply, 'function')
    assert.deepEqual(required.filter((name) => !CHUNK_REQUIRES.includes(name)), [], 'requires outside the served set')
  })
  caseTest('SET3-UC-10', 'main 2', "core's client.js starts the chunk (the page appears with no other loader), and no fiber fails", async (t) => {
    const page = await pageOf(t)
    assert.equal(page.byAttr(MARK.page).length, 1)
    assert.deepEqual(page.world.failedFibers, [])
    assert.deepEqual(page.world.errors, [])
  })
  caseTest('SET3-UC-10', 'main 3', 'dictionaries en and zh registered through ctx.locale.register, with the same keys', async (t) => {
    const page = await pageOf(t)
    const registered = page.world.localeRegistrations.filter((r) => DSH.locales.every((l) => r.dicts?.[l]))
    assert.ok(registered.length > 0, 'no en+zh registration: ' + show(page.world.localeRegistrations.map((r) => [r.ns, Object.keys(r.dicts ?? {})])))
    const keys = (d) => JSON.stringify(Object.keys(d).sort())
    for (const r of registered) assert.equal(keys(r.dicts.zh), keys(r.dicts.en), r.ns)
  })
  caseTest('SET3-UC-10', 'main 3', 'the page reads in the active locale: zh differs from en', async (t) => {
    const read = async (lang) => (await pageOf(t, { lang })).tree().map(textOf).join('|')
    assert.notEqual(await read('zh'), await read('en'))
  })
  caseTest('SET3-UC-10', 'A1', 'configForms missing: the page entry stays pending and nothing fails', async (t) => {
    const page = await pageOf(t, { omit: [DSH.configForms] }, null)
    assert.equal(page.entries().length, 0)
    assert.deepEqual(page.world.failedFibers, [])
    assert.deepEqual(page.world.errors, [])
  })

  // ============================================================== F-UI: core alone (interface items 8–9)
  caseTest('SET3-UC-07', 'F-UI core only', "core's client alone: its settings page registers; no Fishball-page header entry and no view=settings open", async (t) => {
    const page = await pageOf(t, { hash: CONTINUATION.settings }, null)
    assert.equal(page.entries().length, 1, "core's settings page entry")
    const headers = await page.headers()
    for (const which of Object.values(MARK.entries)) assert.equal(headers.flatMap((h) => page.byAttr(MARK.entry, which, h.tree)).length, 0, which + ' entry from core')
    assert.equal(settingsOpens(page.world), 0, 'core continued view=settings')
    assert.deepEqual(page.world.failedFibers, [])
  })

  // ============================================================== SET3-ST-01: the page entry follows the Host
  caseTest('SET3-ST-01', '1', 'not served → served: the entry appears', async (t) => {
    const page = await pageOf(t, { core: null }, null)
    page.world.serve(CORE.namespace, STORED, { revision: FIXTURE.revision })
    await settle()
    assert.equal(page.entries().length, 1)
  })
  caseTest('SET3-ST-01', '2', 'served → withdrawn: the entry goes', async (t) => {
    const page = await pageOf(t, {}, null)
    page.world.unserve(CORE.namespace)
    await settle()
    assert.equal(page.entries().length, 0)
  })

  // ============================================================== E-FIX-3 (B5), MULTI-1 Connect races
  registerModelCatalogCases()
  registerConnectRaceCases()
}
