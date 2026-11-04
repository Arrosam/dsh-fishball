/**
 * Black-box settings/composer integration through registered components and host HTTP/SSE boundaries.
 * BVA: zero confirmed models -> first confirmation; empty/nonempty provider/model identities.
 * EP: valid full host snapshot, failed HTTP, application failure, and absent/malformed confirmation.
 * DT: previous selection {none,A} x response {confirmed,rejected,unconfirmed}; no SSE before assertion.
 * ST: none/A -> draft B -> pending -> response -> later authoritative SSE; retry and new-client replay.
 * No production constants/helpers are imported and no client implementation is inspected.
 * Gap: unversioned SSE cannot distinguish a delayed pre-Save frame from a genuinely later change;
 * these cases cover absent SSE and deliberately later authoritative snapshots, not ordering policy.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MODEL_CASE as C } from './support/dedicated-model.mjs'
import { UI, clientHarness, nodes, textOf } from './support/dedicated-model-client.mjs'

const CASE = Object.freeze({
  settingsAttribute: 'data-fishball-model-settings',
  selectAttribute: 'data-fishball-model-select',
  saveLabel: /save/i,
  configName: /config/,
  bundle: 'dsh-fishball',
  option: 'option',
  empty: '',
  whitespace: ' ',
  invalidIdentity: 1,
  rejection: Object.freeze({ ok: false, code: 'save_failed' }),
  initial: Object.freeze([
    Object.freeze({ name: 'no previous selection', selection: null, blocked: true }),
    Object.freeze({ name: 'replacement of previous A', selection: C.original, blocked: false }),
  ]),
})

const hasAttribute = (attribute) => (node) => node.props?.[attribute] !== undefined

class SettingsDriver {
  constructor(harness, entry) { this.harness = harness; this.entry = entry }
  async mount(selection) {
    await this.harness.render(this.entry.Component)
    this.tree = await this.harness.emit(selection)
    this.tree = await this.harness.flush()
  }
  async flush() { this.tree = await this.harness.flush() }
  get section() {
    const matches = nodes(this.tree, hasAttribute(CASE.settingsAttribute))
    assert.equal(matches.length, C.one, 'one visible dedicated-model settings section')
    return matches[C.zero]
  }
  get selector() {
    const matches = nodes(this.section, hasAttribute(CASE.selectAttribute))
    assert.equal(matches.length, C.one, 'one model selector in Fishball settings')
    return matches[C.zero]
  }
  get save() {
    const matches = nodes(this.section, (node) => typeof node.props?.onClick === 'function' && CASE.saveLabel.test(textOf(node)))
    assert.equal(matches.length, C.one, 'one explicit Save action in the model section')
    return matches[C.zero]
  }
  valueFor(selection) {
    const group = UI.catalog.groups.find((candidate) => candidate.id === selection.provider)
    const model = group?.models.find((candidate) => candidate.id === selection.model)
    assert.ok(model, 'precondition: selected identity is offered by host catalog')
    const matches = nodes(this.selector, (node) => node.type === CASE.option && textOf(node).includes(model.name))
    assert.equal(matches.length, C.one, 'the catalog model has one visible option')
    return matches[C.zero].props.value
  }
  assertVisible(selection, reason) {
    const expected = selection ? this.valueFor(selection) : CASE.empty
    assert.equal(this.selector.props.value, expected, reason)
  }
  assertBlocked(expected, reason) {
    assert.equal(this.harness.blocks.has(UI.fishball), expected, reason)
    assert.equal(this.harness.blocks.has(UI.ordinary), false, 'ordinary composer remains unaffected')
  }
  async choose(selection) {
    this.selector.props.onChange({ target: { value: this.valueFor(selection) } })
    await this.flush()
    this.assertVisible(selection, 'the unsaved draft remains visible')
  }
  async beginSave(selection) {
    assert.equal(Boolean(this.save.props.disabled), false, 'draft can be explicitly saved/retried')
    const completed = Promise.resolve(this.save.props.onClick())
    await this.flush()
    assert.equal(this.harness.sent.at(-C.one)?.pathname, C.api.select, 'Save posts to dedicated-model endpoint')
    assert.deepEqual(this.harness.sent.at(-C.one)?.body, selection, 'Save submits the visible draft identity')
    return { completed }
  }
  async respond(pending, ok, body) {
    await this.harness.reply(ok, body)
    await pending.completed
    await this.flush()
  }
  async emit(selection) { this.tree = await this.harness.emit(selection) }
}

async function withSettings(initial, run) {
  const harness = await clientHarness()
  try {
    const entry = harness.registrations.find((candidate) => candidate.key === CASE.bundle && CASE.configName.test(candidate.name))
    assert.ok(entry, 'Fishball settings are registered with the host')
    const driver = new SettingsDriver(harness, entry)
    await driver.mount(initial.selection)
    driver.assertVisible(initial.selection, 'initial authoritative model is displayed')
    driver.assertBlocked(initial.blocked, 'only a previously confirmed dedicated model permits composing')
    await run(driver, harness)
  } finally { harness.dispose() }
}

const UNCONFIRMED = Object.freeze([
  { name: 'empty body', ok: true, body: () => ({}) },
  { name: 'success flag without state', ok: true, body: () => ({ ok: true }) },
  { name: 'null state', ok: true, body: () => ({ ok: true, state: null }) },
  { name: 'array state', ok: true, body: () => ({ ok: true, state: [] }) },
  { name: 'nonobject state', ok: true, body: () => ({ ok: true, state: CASE.whitespace }) },
  { name: 'missing modelSelection', ok: true, body: (harness) => { const state = harness.state(); delete state.modelSelection; return { ok: true, state } } },
  { name: 'null modelSelection', ok: true, body: (harness) => ({ ok: true, state: harness.state(null) }) },
  { name: 'missing provider', ok: true, body: (harness) => ({ ok: true, state: harness.state({ model: C.selection.model }) }) },
  { name: 'missing model', ok: true, body: (harness) => ({ ok: true, state: harness.state({ provider: C.selection.provider }) }) },
  { name: 'empty provider', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, provider: CASE.empty }) }) },
  { name: 'empty model', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, model: CASE.empty }) }) },
  { name: 'whitespace provider', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, provider: CASE.whitespace }) }) },
  { name: 'whitespace model', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, model: CASE.whitespace }) }) },
  { name: 'nonstring provider', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, provider: CASE.invalidIdentity }) }) },
  { name: 'nonstring model', ok: true, body: (harness) => ({ ok: true, state: harness.state({ ...C.selection, model: CASE.invalidIdentity }) }) },
  { name: 'wrong session confirmation', ok: true, body: (harness) => ({ ok: true, state: { ...harness.state(C.selection), sessionId: UI.ordinary } }) },
  { name: 'application failure in 2xx', ok: true, body: (harness) => ({ ok: false, state: harness.state(C.selection) }) },
  { name: 'failed HTTP Save', ok: false, body: () => CASE.rejection },
  { name: 'failed HTTP with a success-shaped body', ok: false, body: (harness) => ({ ok: true, state: harness.state(C.selection) }) },
])

describe('Dedicated model Save response: authoritative confirmation without SSE', () => {
  for (const initial of CASE.initial) {
    it(`BVA/DT/ST: ${initial.name} accepts a full confirmed POST snapshot before any SSE`, () => withSettings(initial, async (driver, harness) => {
      await driver.choose(C.selection)
      assert.equal(harness.sent.length, C.zero, 'choosing a draft does not save or imply consent')
      driver.assertBlocked(initial.blocked, 'draft alone does not change composer consent')
      const pending = await driver.beginSave(C.selection)
      driver.assertBlocked(initial.blocked, 'pending Save does not establish new consent')
      driver.assertVisible(C.selection, 'pending draft does not clear while waiting for host')
      // Deliberately withhold EventSource: the full POST result is an independent host confirmation.
      await driver.respond(pending, true, { ok: true, state: harness.state(C.selection) })
      driver.assertVisible(C.selection, 'confirmed saved model must remain visible without an SSE message')
      driver.assertBlocked(false, 'the authoritative POST confirmation enables Fishball composing without SSE')
      await driver.flush()
      driver.assertVisible(C.selection, 'an ordinary rerender must not revert the confirmed model')
      await driver.emit(C.selection)
      driver.assertVisible(C.selection, 'delayed matching SSE preserves the saved selection')
      driver.assertBlocked(false, 'delayed confirmation keeps the composer usable')
      await driver.emit(C.original)
      driver.assertVisible(C.original, 'later authoritative SSE overrides an older POST-confirmed model')
      driver.assertBlocked(false, 'later authoritative selection keeps the composer usable')
    }))

    for (const response of UNCONFIRMED) {
      it(`EP/DT/ST: ${initial.name}; ${response.name} retains draft and waits for confirmation`, () => withSettings(initial, async (driver, harness) => {
        await driver.choose(C.selection)
        const pending = await driver.beginSave(C.selection)
        driver.assertBlocked(initial.blocked, 'pending Save cannot introduce optimistic consent')
        await driver.respond(pending, response.ok, response.body(harness))
        driver.assertVisible(C.selection, 'failed/unconfirmed response must not discard the selected draft')
        driver.assertBlocked(initial.blocked, 'failed/unconfirmed response cannot establish dedicated-model consent')
        const retry = await driver.beginSave(C.selection)
        driver.assertBlocked(initial.blocked, 'retry stays gated when no model has been confirmed')
        // SSE remains authoritative even when an older/test host returns only a success flag.
        await driver.emit(C.selection)
        driver.assertVisible(C.selection, 'real SSE confirmation establishes the chosen model')
        driver.assertBlocked(false, 'real SSE confirmation enables composing')
        await driver.respond(retry, true, { ok: true })
        driver.assertVisible(C.selection, 'an unconfirmed POST body cannot undo a real SSE confirmation')
        driver.assertBlocked(false, 'a previously confirmed model stays usable')
      }))
    }
  }

  it('EP/DT/ST: a receipt for another model cannot confirm the requested dedicated Save', () => withSettings(CASE.initial[C.zero], async (driver, harness) => {
    await driver.choose(C.selection)
    const pending = await driver.beginSave(C.selection)
    await driver.respond(pending, true, { ok: true, state: harness.state(C.original) })
    driver.assertVisible(C.selection, 'a mismatched receipt preserves the requested draft for retry')
    driver.assertBlocked(true, 'a different model in the receipt does not establish the requested consent')
  }))

  it('ST: a newly loaded settings client displays the saved model from its persisted authoritative snapshot', () => withSettings({ selection: C.selection, blocked: false }, async (driver) => {
    await driver.flush()
    driver.assertVisible(C.selection, 'a fresh client keeps the persisted host-confirmed model visible')
    driver.assertBlocked(false, 'persisted confirmation permits composing after reload')
  }))
})
