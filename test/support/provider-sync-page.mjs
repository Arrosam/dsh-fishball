/** Drive registered public settings components; reuse the model harness, never private client helpers. */
import assert from 'node:assert/strict'
import { clientHarness, nodes, textOf, UI } from './dedicated-model-client.mjs'
import { PAGE, previewDTO } from './provider-sync-page-data.mjs'
export { nodes, textOf, UI }
export const has = (attribute) => (node) => node.props?.[attribute] !== undefined

export async function pageFixture(t, options) {
  const harness = await clientHarness(options)
  t.after(() => harness.dispose())
  await harness.emit()
  const settings = harness.registrations.find((entry) => entry.key === PAGE.settingsKey && PAGE.settingsSlot.test(entry.name))
  assert.ok(settings, 'Fishball settings component is registered with the host')
  let tree = await harness.render(settings.Component)
  const settle = async () => { for (let index = PAGE.zero; index < PAGE.flushRounds; index++) tree = await harness.flush(); return tree }
  await settle()
  // Mount may ask for inactive status, but it must not initiate pairing/import.
  for (const request of harness.sent) {
    assert.equal(request.pathname, PAGE.api)
    assert.equal(request.body.action, PAGE.actions.status, 'rendering settings cannot start pairing or import')
    await harness.reply(true, { ok: true, result: { state: 'inactive' } })
  }
  await settle()
  const panel = () => nodes(tree, has(PAGE.selectors.panel))[PAGE.zero]
  assert.ok(panel(), 'settings has its own semantic provider-sync panel')
  const button = (label, scope = panel()) => nodes(scope, (node) => typeof node.props?.onClick === 'function' && label.test(textOf(node).trim()))[PAGE.zero]
  const begin = async (label) => {
    const action = button(label)
    assert.ok(action, 'expected action: ' + label)
    assert.notEqual(action.props.disabled, true, 'action is enabled: ' + label)
    const pending = action.props.onClick()
    await settle()
    return { pending }
  }
  const reply = async (operation, result, { ok = true, raw = false } = {}) => {
    await harness.reply(ok, raw ? result : { ok, result })
    await operation.pending
    return settle()
  }
  const perform = async (label, result, options) => reply(await begin(label), result, options)
  const input = (node, value) => node.props.onChange({ target: { value, checked: value }, currentTarget: { value, checked: value } })
  const checkboxes = (scope = panel()) => nodes(scope, (node) => node.props?.type === 'checkbox')
  const checkboxFor = (name) => {
    const label = nodes(panel(), (node) => node.type === 'label' && textOf(node).includes(name) && checkboxes(node).length === PAGE.one)[PAGE.zero]
    const box = label ? checkboxes(label)[PAGE.zero] : checkboxes().find((node) => node.props?.value === name || node.props?.['aria-label'] === name)
    assert.ok(box, 'an entry has an accessible selection checkbox: ' + name)
    return box
  }
  const consent = () => {
    const labels = nodes(panel(), (node) => node.type === 'label' && checkboxes(node).length === PAGE.one && !Object.values(PAGE.names).some((name) => textOf(node).includes(name)))
    assert.equal(labels.length, PAGE.one, 'a separate explicit consent checkbox is present')
    return checkboxes(labels[PAGE.zero])[PAGE.zero]
  }
  const check = async (box, checked = true) => { input(box, checked); return settle() }
  const assertNoLeak = () => {
    const serialized = JSON.stringify({ tree, sent: harness.sent })
    for (const marker of [...PAGE.forbidden, PAGE.errorMarker]) assert.equal(serialized.includes(marker), false, 'browser tree and requests contain no raw error/credential marker')
  }
  return { harness, settle, panel, button, begin, reply, perform, input, checkboxes, checkboxFor, consent, check, assertNoLeak,
    get tree() { return tree },
    get requests() { return harness.sent.filter((request) => request.pathname === PAGE.api) },
  }
}

export async function pairSource(page) {
  const textarea = nodes(page.panel(), (node) => node.type === 'textarea')[PAGE.zero]
  assert.ok(textarea, 'source accepts only a pairing invitation, not a key or credential record')
  page.input(textarea, PAGE.invitation)
  await page.settle()
  await page.perform(PAGE.labels.begin, { pairId: PAGE.pairId, identity: PAGE.target, expiresAt: Date.now() + PAGE.expiresInMs })
  await page.perform(PAGE.labels.finish, { state: 'paired', role: 'source', peer: PAGE.target, identity: PAGE.source, pairId: PAGE.pairId })
}

export async function showPreview(page, dto = previewDTO()) {
  await pairSource(page)
  const operation = await page.begin(PAGE.labels.preview)
  assert.deepEqual(page.requests.at(-PAGE.one).body, { action: PAGE.actions.preview }, 'Sync first asks for a preview, never imports directly')
  await page.reply(operation, dto)
  return dto
}

export async function selectForConfirm(page, ids = [PAGE.ids.first]) {
  const names = new Map([[PAGE.ids.first, PAGE.names.first], [PAGE.ids.second, PAGE.names.second]])
  for (const [id, name] of names) await page.check(page.checkboxFor(name), ids.includes(id))
  await page.check(page.consent(), true)
}
