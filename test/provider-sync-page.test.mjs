/**
 * Requirements-only provider-sync page and public owner-route integration.
 * EP: four preview groups, accepted/refused route inputs, static vs raw errors.
 * BVA: zero vs one chosen addition, zero vs one consent, bounded route body.
 * DT: selection AND explicit consent AND preview required before Confirm.
 * ST: inactive -> invite/begin -> target approval + source finish -> preview -> confirm;
 * errors/partial/unknown -> new preview, never automatic import retries.
 * Uses only public registered components and route callbacks, no private helpers or source assertions.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PAGE, outcomeDTO, previewDTO } from './support/provider-sync-page-data.mjs'
import { has, nodes, pageFixture, selectForConfirm, showPreview, textOf, UI } from './support/provider-sync-page.mjs'
import { routeFixture } from './support/provider-sync-page-route.mjs'

const confirms = (page) => page.requests.filter((request) => request.body.action === PAGE.actions.confirm)
const previewOnly = (page) => page.requests.filter((request) => request.body.action === PAGE.actions.preview)
const confirmButton = (page) => page.button(PAGE.labels.confirm)
const assertGuarded = (page, message) => assert.ok(!confirmButton(page) || confirmButton(page).props.disabled, message)

// The harness renders public components, not DOM event propagation or a replacement model picker.
describe('Provider sync page: registered settings component', () => {
  for (const locale of ['en', 'zh']) it('PS-P01 EP: localized safe labels and unchanged dedicated-model gate (' + locale + ')', async (t) => {
    const page = await pageFixture(t, { locale })
    assert.match(textOf(page.panel()), locale === 'en' ? PAGE.labels.title : PAGE.labels.zhTitle)
    assert.equal(page.requests.length, PAGE.zero, 'startup does not open channel, read keys, or even poll status')
    assert.ok(page.harness.blocks.has(UI.fishball), 'sync panel does not replace required dedicated-model selection')
    assert.equal(page.harness.blocks.has(UI.ordinary), false)
    assert.equal(nodes(page.tree, has(PAGE.selectors.model)).length, PAGE.one, 'dedicated picker and Save remain separate')
    assert.equal(nodes(page.panel(), has(PAGE.selectors.model)).length, PAGE.zero)
    page.assertNoLeak()
  })

  it('PS-P02 ST/EP: target invitation is explicit owner-only output, scoped and short-lived', async (t) => {
    const page = await pageFixture(t)
    assert.equal(textOf(page.panel()).includes(PAGE.invitation), false)
    const operation = await page.begin(PAGE.labels.invite)
    assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.invite })
    await page.reply(operation, { state: 'ready', identity: PAGE.target, invitation: PAGE.invitation })
    const visible = JSON.stringify(page.panel())
    assert.ok(visible.includes(PAGE.invitation), 'owner can copy invitation after requesting it')
    assert.match(textOf(page.panel()), PAGE.labels.shortLived)
    assert.match(textOf(page.panel()), PAGE.labels.invitationScope)
    assert.match(textOf(page.panel()), PAGE.labels.notWebToken)
    assert.equal(confirms(page).length, PAGE.zero)
    page.assertNoLeak()
  })

  it('PS-P03 ST/DT: beginning is not pairing/import; refusing premature source finish remains recoverable', async (t) => {
    const page = await pageFixture(t)
    const textarea = nodes(page.panel(), (node) => node.type === 'textarea')[PAGE.zero]
    assert.ok(textarea)
    page.input(textarea, PAGE.invitation)
    await page.settle()
    await page.perform(PAGE.labels.begin, { pairId: PAGE.pairId, identity: PAGE.target, expiresAt: Date.now() + PAGE.expiresInMs })
    assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.begin, invitation: PAGE.invitation })
    const preview = page.button(PAGE.labels.preview)
    assert.ok(!preview || preview.props.disabled, 'before target approves and source finishes, no preview/import')
    const finish = await page.begin(PAGE.labels.finish)
    await page.reply(finish, { ok: false, code: PAGE.refused, message: PAGE.errorMarker }, { ok: false, raw: true })
    assert.equal(confirms(page).length, PAGE.zero)
    assert.equal(previewOnly(page).length, PAGE.zero)
    assert.ok(page.button(PAGE.labels.finish), 'premature finish does not dead-end owner pairing')
    page.assertNoLeak()
  })

  it('PS-P04 ST: target explicitly approves pending source and still never imports', async (t) => {
    const page = await pageFixture(t)
    await page.perform(PAGE.labels.invite, { state: 'ready', identity: PAGE.target, invitation: PAGE.invitation })
    await page.perform(/Check pairing status/i, { state: 'pendingSource', identity: PAGE.target, peer: PAGE.source, pairId: PAGE.pairId })
    await page.perform(PAGE.labels.approve, { state: 'approvedSource', identity: PAGE.target, peer: PAGE.source, pairId: PAGE.pairId })
    assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.approve, pairId: PAGE.pairId })
    assert.equal(confirms(page).length, PAGE.zero)
    assert.equal(previewOnly(page).length, PAGE.zero)
    const preview = page.button(PAGE.labels.preview)
    assert.ok(!preview || preview.props.disabled, 'target approval alone is not a source-side import')
  })

  it('PS-P05 EP/ST: Sync is preview-only; all groups visible and only additions selectable', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    const section = nodes(page.panel(), has(PAGE.selectors.preview))[PAGE.zero]
    assert.ok(section, 'preview has its own semantic section')
    for (const name of Object.values(PAGE.names)) assert.ok(textOf(section).includes(name), 'preview shows ' + name)
    assert.ok(textOf(section).includes(PAGE.mask), 'API keys use the fixed mask, never length or fragments')
    const entryCheckboxes = page.checkboxes(section).filter((checkbox) => checkbox !== page.consent())
    assert.equal(entryCheckboxes.length, PAGE.two, 'only add entries are selectable; all skip groups are read-only')
    assert.equal(confirms(page).length, PAGE.zero, 'fetching preview never starts an import')
    page.assertNoLeak()
  })

  it('PS-P11 EP: preview visibly identifies API, protocol, endpoint and model IDs before consent', async (t) => {
    const page = await pageFixture(t)
    const dto = previewDTO()
    Object.assign(dto.groups.add[PAGE.zero], { api: PAGE.display.api, endpoint: PAGE.display.endpoint, models: [PAGE.display.firstModel, PAGE.display.secondModel] })
    Object.assign(dto.groups.add[PAGE.one], { api: PAGE.display.protocol, endpoint: PAGE.display.endpoint, models: [PAGE.display.secondModel] })
    await showPreview(page, dto)
    const section = nodes(page.panel(), has(PAGE.selectors.preview))[PAGE.zero]
    assert.ok(section)
    const visible = textOf(section)
    for (const value of Object.values(PAGE.display)) assert.ok(visible.includes(value), 'preview displays safe provider metadata: ' + value)
    assert.ok(visible.includes(PAGE.mask), 'metadata disclosure never replaces the constant credential mask')
    assert.equal(confirms(page).length, PAGE.zero, 'metadata review still occurs before any import')
    page.assertNoLeak()
  })

  it('PS-P06 BVA/DT: selected additions AND separate explicit consent are required for minimal Confirm payload', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    for (const name of [PAGE.names.first, PAGE.names.second]) await page.check(page.checkboxFor(name), false)
    await page.check(page.consent(), false)
    assertGuarded(page, 'zero selection and no consent cannot confirm')
    await page.check(page.consent(), true)
    assertGuarded(page, 'consent without an addition cannot confirm')
    await page.check(page.consent(), false)
    await page.check(page.checkboxFor(PAGE.names.first), true)
    assertGuarded(page, 'selection without explicit consent cannot confirm')
    await page.check(page.consent(), true)
    const operation = await page.begin(PAGE.labels.confirm)
    assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.confirm, previewId: PAGE.previewId, ids: [PAGE.ids.first], confirmed: true })
    assertGuarded(page, 'pending import cannot be double-submitted')
    assert.equal(confirms(page).length, PAGE.one)
    await page.reply(operation, outcomeDTO())
    assert.equal(nodes(page.panel(), has(PAGE.selectors.result)).length, PAGE.one)
    assert.ok(page.harness.blocks.has(UI.fishball), 'even successful provider import never chooses a dedicated model')
    page.assertNoLeak()
  })

  it('PS-P07 ST/EP: refused confirm is static and a fresh preview remains possible', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    await selectForConfirm(page)
    const operation = await page.begin(PAGE.labels.confirm)
    await page.reply(operation, { ok: false, code: PAGE.refused, message: PAGE.errorMarker }, { ok: false, raw: true })
    page.assertNoLeak()
    assert.equal(confirms(page).length, PAGE.one)
    await page.perform(PAGE.labels.preview, previewDTO(PAGE.nextPreviewId))
    assert.equal(previewOnly(page).length, PAGE.two)
    assertGuarded(page, 'new preview requires new consent')
  })

  for (const [name, dto, expected] of [
    ['partial', outcomeDTO({ partial: true }), PAGE.labels.partial],
    ['unknown', outcomeDTO({ unknown: true }), PAGE.labels.unknown],
  ]) it('PS-P08 EP/ST: ' + name + ' outcomes are explicit, not full success and never retried automatically', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    await selectForConfirm(page, [PAGE.ids.first, PAGE.ids.second])
    await page.perform(PAGE.labels.confirm, dto)
    const result = nodes(page.panel(), has(PAGE.selectors.result))[PAGE.zero]
    assert.ok(result)
    assert.match(textOf(result), expected)
    for (const row of dto.results) assert.ok(textOf(result).includes(row.id), 'each per-provider outcome is visible')
    await page.settle()
    assert.equal(confirms(page).length, PAGE.one)
    assert.ok(page.button(PAGE.labels.preview), 'a new explicit preview remains available')
    page.assertNoLeak()
  })

  it('PS-P09 ST/error: network timeout is unknown, sanitized and does not auto-replay confirm', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    await selectForConfirm(page)
    const operation = await page.begin(PAGE.labels.confirm)
    await page.harness.reject(new Error(PAGE.errorMarker))
    await operation.pending
    await page.settle()
    page.assertNoLeak()
    assert.equal(confirms(page).length, PAGE.one)
    assert.ok(page.button(PAGE.labels.preview), 'unknown network result can be checked via fresh preview, never auto-retried')
  })

  it('PS-P10 ST: close clears capability and preview without saving dedicated model', async (t) => {
    const page = await pageFixture(t)
    await showPreview(page)
    await page.perform(PAGE.labels.close, { state: 'inactive' })
    assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.close })
    assert.equal(nodes(page.panel(), has(PAGE.selectors.preview)).length, PAGE.zero)
    assert.equal(JSON.stringify(page.panel()).includes(PAGE.invitation), false)
    assert.equal(confirms(page).length, PAGE.zero)
    page.assertNoLeak()
  })
})

// The host gateway authenticates the owner; here we test the feature's own browser-origin fence.
describe('Provider sync owner route: isolated effect fixture', () => {
  it('PS-R01 ST: registration, inactive status and close do not initialize profile/listener/credentials', async (t) => {
    const route = await routeFixture(t)
    assert.equal(route.registration.path, PAGE.api)
    assert.deepEqual(route.registration.methods, [PAGE.method])
    assert.equal(route.registration.requestBody, PAGE.bodyMode)
    assert.equal(route.calls.host, PAGE.zero)
    assert.equal(route.calls.channel, PAGE.zero)
    const status = await route.post({ action: PAGE.actions.status })
    assert.equal(status.status, PAGE.statusOk)
    assert.deepEqual(status.json, { ok: true, result: { state: 'inactive' } })
    await route.post({ action: PAGE.actions.close })
    assert.equal(route.calls.host, PAGE.zero)
    assert.equal(route.calls.channel, PAGE.zero)
    assert.deepEqual(route.calls.credentials, [])
  })

  for (const [name, headers] of [
    ['foreign origin', { origin: PAGE.foreignOrigin }],
    ['null origin', { origin: 'null' }],
    ['cross-site fetch metadata', { 'sec-fetch-site': 'cross-site' }],
  ]) it('PS-R02 EP: reject ' + name + ' with static response before effects', async (t) => {
    const route = await routeFixture(t)
    const response = await route.post({ action: PAGE.actions.invite }, { headers })
    route.assertRefused(response)
    assert.equal(route.calls.host, PAGE.zero)
    assert.equal(route.calls.channel, PAGE.zero)
  })

  for (const [name, body, options] of [
    ['malformed JSON', '{', { raw: true }],
    ['array body', [], {}], ['null body', null, {}], ['missing action', {}, {}],
    ['unknown action', { action: 'not-a-sync-action', message: PAGE.errorMarker }, {}],
    ['oversized body', ' '.repeat(PAGE.oversizeBytes), { raw: true }],
  ]) it('PS-R03 EP/BVA: ' + name + ' is a static refusal without lazy startup', async (t) => {
    const route = await routeFixture(t)
    route.assertRefused(await route.post(body, options))
    assert.equal(route.calls.host, PAGE.zero)
    assert.equal(route.calls.channel, PAGE.zero)
  })

  it('PS-R04 ST: invite lazily initializes once; close revokes without credential writes', async (t) => {
    const route = await routeFixture(t)
    const invited = await route.post({ action: PAGE.actions.invite })
    assert.equal(invited.json?.ok, true)
    assert.equal(invited.json?.result?.invitation, PAGE.invitation)
    assert.equal(route.calls.host, PAGE.one)
    assert.equal(route.calls.channel, PAGE.one)
    await route.post({ action: PAGE.actions.status })
    assert.equal(route.calls.host, PAGE.one)
    await route.post({ action: PAGE.actions.close })
    assert.ok(route.calls.closed >= PAGE.one)
    assert.deepEqual(route.calls.credentials, [])
    assert.deepEqual((await route.post({ action: PAGE.actions.status })).json, { ok: true, result: { state: 'inactive' } })
  })

  it('PS-R05 ST: premature preview/confirm cannot initialize service; begin alone cannot import', async (t) => {
    const route = await routeFixture(t)
    route.assertRefused(await route.post({ action: PAGE.actions.preview }))
    route.assertRefused(await route.post({ action: PAGE.actions.confirm, previewId: PAGE.previewId, ids: [PAGE.ids.first], confirmed: true }))
    assert.equal(route.calls.host, PAGE.zero)
    const result = await route.post({ action: PAGE.actions.begin, invitation: PAGE.invitation })
    assert.equal(result.json?.ok, true)
    assert.equal(route.calls.host, PAGE.one)
    assert.equal(route.calls.channel, PAGE.one)
    assert.deepEqual(route.calls.credentials, [])
  })

  it('PS-R07 ST: closing during deferred initialization revokes pending invite instead of reopening', async (t) => {
    const route = await routeFixture(t, { deferHost: true })
    const invitation = route.post({ action: PAGE.actions.invite })
    await route.started
    await route.post({ action: PAGE.actions.close })
    route.releaseHost()
    route.assertRefused(await invitation)
    assert.deepEqual((await route.post({ action: PAGE.actions.status })).json, { ok: true, result: { state: 'inactive' } })
    assert.deepEqual(route.calls.credentials, [])
  })

  it('PS-R06 EP/error: lazy factory failures do not expose raw error strings', async (t) => {
    const route = await routeFixture(t, { failHost: true })
    route.assertRefused(await route.post({ action: PAGE.actions.invite }))
    assert.deepEqual(route.calls.credentials, [])
  })
})
