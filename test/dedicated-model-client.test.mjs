/**
 * Requirement-derived integration tests through registered browser components + host blocks API.
 * EP: own vs ordinary composer; dedicated absent vs present; pending/rejected/successful saves.
 * BVA: zero confirmed selections and the first confirmed selection.
 * DT: old chat/default identity is irrelevant; only dedicated confirmation unlocks Fishball.
 * ST: absent -> draft -> pending -> rejected -> retry -> success -> confirmed snapshot.
 * Real browser editing/keyboard behavior remains a system smoke check, not simulated by this hook harness.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MODEL_CASE as C } from './support/dedicated-model.mjs'
import { UI, clientHarness, nodes, textOf } from './support/dedicated-model-client.mjs'

const DOM = Object.freeze({ settings: 'data-fishball-model-settings', gate: 'data-fishball-model-gate', select: 'data-fishball-model-select', save: /save/i, modelSeat: 'conversation.input.model' })
const has = (attribute) => (node) => node.props?.[attribute] !== undefined
const gateEntry = (harness) => harness.registrations.find((entry) => entry.name === UI.dock && entry.id === 'fishball-model-required')
const settingsEntry = (harness) => harness.registrations.find((entry) => entry.key === 'dsh-fishball' && /config/.test(entry.name))

async function withClient(run) {
  const harness = await clientHarness()
  try { await harness.emit(); await run(harness) } finally { harness.dispose() }
}

describe('Dedicated Fishball model: registered client integration', () => {
  it('DM-C01 EP/DT: missing dedicated selection blocks only Fishball before a dock is mounted', () => withClient(async (harness) => {
    assert.ok(harness.blocks.get(UI.fishball)?.reason, 'Fishball has a localized root-level composer block')
    assert.equal(harness.blocks.has(UI.ordinary), false, 'ordinary composer is not blocked')
  }))

  it('DM-C02 EP: missing model shows a settings gate only in the Fishball composer', () => withClient(async (harness) => {
    const entry = gateEntry(harness)
    assert.ok(entry, 'model-setting widget is registered in the composer dock')
    let tree = await harness.render(entry.Component, { sessionId: UI.fishball })
    const gate = nodes(tree, has(DOM.gate))
    assert.equal(gate.length, C.one, 'Fishball gets one model-setting gate')
    assert.match(textOf(gate), /model/i)
    const buttons = nodes(gate, (node) => typeof node.props?.onClick === 'function')
    assert.ok(buttons.length >= C.one, 'widget offers a settings action')
    buttons[C.zero].props.onClick()
    assert.ok(harness.opened.length >= C.one, 'gate opens Fishball settings, rather than an inline model switch')
    tree = await harness.render(entry.Component, { sessionId: UI.ordinary })
    assert.equal(nodes(tree, has(DOM.gate)).length, C.zero, 'ordinary session gets no gate')
  }))

  it('DM-C03 BVA/ST: first confirmed dedicated selection unblocks Fishball and removes its gate', () => withClient(async (harness) => {
    const entry = gateEntry(harness)
    assert.ok(entry)
    await harness.render(entry.Component, { sessionId: UI.fishball })
    const tree = await harness.emit(C.selection)
    assert.equal(harness.blocks.has(UI.fishball), false)
    assert.equal(harness.blocks.has(UI.ordinary), false)
    assert.equal(nodes(tree, has(DOM.gate)).length, C.zero)
  }))

  it('DM-C05 EP/DT: model widget suppression is scoped only to the Fishball session', () => withClient(async (harness) => {
    const selectors = harness.styles.map((element) => String(element.textContent ?? '')).filter((css) => css.includes(DOM.modelSeat))
    assert.ok(selectors.length >= C.one, 'the composer model seat is suppressed')
    for (const css of selectors) {
      assert.ok(css.includes(UI.fishball), 'model-seat suppression names the exact Fishball session')
      assert.equal(css.includes(UI.ordinary), false)
      for (const selector of css.split('}').filter((rule) => rule.includes(DOM.modelSeat))) {
        assert.ok(selector.split('{')[C.zero].includes(UI.fishball), 'no global model-seat selector affects ordinary sessions')
      }
    }
    await harness.emit(C.selection)
    assert.ok(harness.styles.some((element) => String(element.textContent).includes(DOM.modelSeat) && String(element.textContent).includes(UI.fishball)), 'the widget stays suppressed after dedicated selection')
  }))

  it('DM-C04 EP/ST: settings draft, pending Save and failed Save never unblock; successful confirmation does', () => withClient(async (harness) => {
    const entry = settingsEntry(harness)
    assert.ok(entry, 'Fishball owns a settings page')
    let tree = await harness.render(entry.Component)
    await harness.emit()
    tree = await harness.flush()
    const section = nodes(tree, has(DOM.settings))
    assert.equal(section.length, C.one, 'dedicated model selection is in Fishball settings')
    const select = nodes(section, has(DOM.select))[C.zero]
    assert.ok(select, 'settings has its own model selector')
    const value = nodes(select, (node) => node.type === 'option' && String(node.props?.value).includes(C.selection.model))[C.zero]?.props.value
    assert.ok(value, 'catalog supplies a selectable dedicated model')
    select.props.onChange({ target: { value } })
    tree = await harness.flush()
    assert.equal(harness.sent.length, C.zero, 'selecting a draft is not an implicit save')
    assert.ok(harness.blocks.has(UI.fishball), 'draft does not count as confirmed selection')
    const saveButton = () => nodes(tree, (node) => typeof node.props?.onClick === 'function' && DOM.save.test(textOf(node)))[C.zero]
    assert.ok(saveButton(), 'settings offers explicit Save')
    const saving = saveButton().props.onClick()
    tree = await harness.flush()
    assert.equal(harness.sent.at(-C.one)?.pathname, C.api.select)
    assert.deepEqual(harness.sent.at(-C.one)?.body, C.selection)
    assert.ok(harness.blocks.has(UI.fishball), 'pending Save cannot enable typing/sending')
    await harness.reply(false, { ok: false, code: 'failed' })
    await saving
    tree = await harness.flush()
    assert.ok(harness.blocks.has(UI.fishball), 'failed Save cannot enable typing/sending')
    const retrying = saveButton().props.onClick()
    await harness.flush()
    assert.ok(harness.blocks.has(UI.fishball), 'retry remains blocked until success')
    await harness.reply(true, { ok: true, state: harness.state(C.selection) })
    await retrying
    tree = await harness.emit(C.selection)
    assert.equal(harness.blocks.has(UI.fishball), false, 'successful confirmed selection unblocks without page reload')
    assert.equal(harness.blocks.has(UI.ordinary), false, 'settings never blocks ordinary sessions')
  }))
})
