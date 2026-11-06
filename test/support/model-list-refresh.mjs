/** Requirement-owned data and driver for refresh; execute only the registered client boundary. */
import assert from 'node:assert/strict'
import { UI, clientHarness, nodes, textOf } from './dedicated-model-client.mjs'
import { MODEL_CASE as M } from './dedicated-model.mjs'

export const REFRESH = Object.freeze({
  zero: 0, one: 1, two: 2, last: -1, settleTurns: 12,
  settings: 'data-fishball-model-settings', picker: 'data-fishball-model-select',
  button: 'data-fishball-model-refresh', bundle: 'fishball-connector', config: /config/,
  tag: Object.freeze({ option: 'option', select: 'select', button: 'button', label: 'label' }),
  method: Object.freeze({ get: 'GET', post: 'POST' }),
  empty: '', separator: ' ',
  labels: Object.freeze({ refresh: /refresh/i, save: /save/i, unavailable: /unavailable/i, loading: /loading|refreshing|fetching/i, error: /error|fail|unable|could not|invalid/i, empty: /no .*models|models.*(?:unavailable|found|configured)|empty/i }),
  attributes: Object.freeze({ ariaLabel: 'aria-label', ariaLabelledBy: 'aria-labelledby', ariaBusy: 'aria-busy', ariaLive: 'aria-live' }),
  values: Object.freeze({ noStore: 'no-store', reload: 'reload', noCache: 'no-cache', status: 'status', alert: 'alert', button: 'button' }),
  http: Object.freeze({ ok: 200, failure: 503 }),
  networkError: 'synthetic model catalog network failure', jsonError: 'synthetic catalog JSON parse failure',
  applicationError: 'synthetic_catalog_failure',
  provider: Object.freeze({ good: 'refresh-good', other: 'refresh-other', broken: 'refresh-broken' }),
  model: Object.freeze({ old: 'old-model', draft: 'draft-model', fresh: 'newly-added-model', latest: 'latest-model', stale: 'stale-model' }),
  names: Object.freeze({ good: 'Refresh provider', other: 'Other provider', old: 'Old model', draft: 'Draft model', fresh: 'Newly added model', latest: 'Latest model', stale: 'Stale model' }),
  effort: 'high',
  partialFailure: Object.freeze({ id: 'refresh-broken', name: 'Unavailable provider', message: 'synthetic provider catalog failure' }),
  initialStates: Object.freeze([
    Object.freeze({ name: 'no confirmed selection', selection: null, blocked: true }),
    Object.freeze({ name: 'confirmed selection', selection: M.original, blocked: false }),
  ]),
  api: M.api,
})
const C = REFRESH
export const clone = value => JSON.parse(JSON.stringify(value))
export const modelName = model => C.names[Object.keys(C.model).find(key => C.model[key] === model)] ?? model
export const identity = (model = C.model.old, provider = C.provider.good) => ({ provider, model })
export const catalog = (models = [C.model.old, C.model.draft], { provider = C.provider.good, failures = [] } = {}) => ({
  groups: [{ id: provider, name: C.names.good, models: models.map(id => ({ id, name: modelName(id) })) }],
  failures, routableProviders: [provider], default: identity(models[C.zero], provider),
})
export const emptyCatalog = () => ({ groups: [], failures: [], routableProviders: [], default: null })
export const response = (body, { ok = true, jsonError = false } = {}) => ({ ok, status: ok ? C.http.ok : C.http.failure, json: async () => { if (jsonError) throw new SyntaxError(C.jsonError); return clone(body) } })
export const successful = value => response({ ok: true, catalog: value })
export const FAILURES = Object.freeze([
  { name: 'HTTP rejection with success-shaped body', response: () => response({ ok: true, catalog: emptyCatalog() }, { ok: false }) },
  { name: 'network rejection', error: () => new Error(C.networkError) },
  { name: 'malformed JSON', response: () => response(null, { jsonError: true }) },
  { name: 'application failure with replacement catalog', response: () => response({ ok: false, code: C.applicationError, catalog: emptyCatalog() }) },
  { name: 'missing catalog', response: () => response({ ok: true }) },
  { name: 'null catalog', response: () => response({ ok: true, catalog: null }) },
  { name: 'nonarray groups', response: () => response({ ok: true, catalog: { ...emptyCatalog(), groups: {} } }) },
  { name: 'nonarray group models', response: () => response({ ok: true, catalog: { ...catalog(), groups: [{ id: C.provider.good, name: C.names.good, models: {} }] } }) },
  { name: 'null model entry', response: () => response({ ok: true, catalog: { ...catalog(), groups: [{ id: C.provider.good, name: C.names.good, models: [null] }] } }) },
  { name: 'missing model identity', response: () => response({ ok: true, catalog: { ...catalog(), groups: [{ id: C.provider.good, name: C.names.good, models: [{ name: C.names.old }] }] } }) },
])

export class CatalogTransport {
  requests = []
  fetch = (url, options = {}) => {
    const target = new URL(url, UI.base)
    if (target.pathname !== C.api.models) return undefined
    let resolve, reject
    const promise = new Promise((accept, refuse) => { resolve = accept; reject = refuse })
    // Deliberately ignore AbortSignal: late completions can happen after cancellation,
    // so correctness must not depend on the fake network preventing delivery.
    this.requests.push({ url: target, options, resolve, reject })
    return promise
  }
  get latest() { return this.requests.at(C.last) }
  deliver(request, outcome) { if (outcome.error) request.reject(outcome.error()); else request.resolve(outcome.response()) }
}
const has = attribute => node => node.props?.[attribute] !== undefined
export class RefreshDriver {
  constructor(harness, transport, entry) { Object.assign(this, { harness, transport, entry }) }
  async mount(selection = null) { await this.harness.render(this.entry.Component); this.tree = await this.harness.emit(selection); await this.flush() }
  async flush() { for (let turn = C.zero; turn < C.settleTurns; turn++) this.tree = await this.harness.flush(); return this.tree }
  get section() { const matches = nodes(this.tree, has(C.settings)); assert.equal(matches.length, C.one, 'one dedicated-model settings section'); return matches[C.zero] }
  get picker() { const matches = nodes(this.section, has(C.picker)); assert.equal(matches.length, C.one, 'one settings model picker'); return matches[C.zero] }
  get refresh() {
    const matches = nodes(this.section, node => typeof node.props?.onClick === 'function' && (has(C.button)(node) || C.labels.refresh.test(textOf(node))))
    assert.equal(matches.length, C.one, 'one manual Refresh action in the model settings')
    return matches[C.zero]
  }
  get save() { const matches = nodes(this.section, node => typeof node.props?.onClick === 'function' && C.labels.save.test(textOf(node))); assert.equal(matches.length, C.one); return matches[C.zero] }
  get options() { return nodes(this.picker, node => node.type === C.tag.option) }
  get selected() { return this.options.find(node => node.props.value === this.picker.props.value) }
  get text() { return textOf(this.section) }
  optionFor(model) { return this.options.find(node => String(node.props.value).includes(model) || textOf(node).includes(modelName(model))) }
  snapshot() { return this.options.map(node => ({ value: node.props.value, label: textOf(node), disabled: Boolean(node.props.disabled) })) }
  async choose(model) { const option = this.optionFor(model); assert.ok(option, 'catalog exposes the desired draft'); this.picker.props.onChange({ target: { value: option.props.value } }); await this.flush(); return option.props.value }
  async beginRefresh() { assert.equal(Boolean(this.refresh.props.disabled), false, 'Refresh can be activated'); const completion = Promise.resolve(this.refresh.props.onClick()); await this.flush(); return { completion, request: this.transport.latest } }
  async respond(request, value) { request.resolve(successful(value)); await this.flush() }
  async fail(request, failure) { this.transport.deliver(request, failure); await this.flush() }
  assertReadOnly(blocked) {
    assert.equal(this.harness.sent.length, C.zero, 'refresh never POSTs selection or settings')
    assert.equal(this.harness.reloads.length, C.zero, 'refresh never reloads the page')
    assert.equal(this.harness.blocks.has(UI.fishball), blocked, 'catalog changes cannot grant or revoke dedicated-model consent')
    assert.equal(this.harness.blocks.has(UI.ordinary), false, 'ordinary composer remains unchanged')
  }
  assertUnavailable(value, model) {
    assert.equal(this.picker.props.value, value, 'missing saved/draft identity stays selected')
    assert.ok(this.selected, 'the current value still has a visible select option')
    assert.match(textOf(this.selected), C.labels.unavailable, 'current option is explicitly labelled unavailable')
    assert.ok(textOf(this.selected).includes(model), 'unavailable option identifies the saved/draft model')
  }
}
export async function withRefresh(run, { selection = null, initialCatalog = catalog(), initialFailure, holdInitial = false } = {}) {
  const transport = new CatalogTransport()
  const harness = await clientHarness({ interceptFetch: transport.fetch })
  try {
    const entry = harness.registrations.find(item => item.key === C.bundle && C.config.test(item.name))
    assert.ok(entry, 'Fishball settings register with the host')
    const driver = new RefreshDriver(harness, transport, entry)
    await driver.mount(selection)
    assert.equal(transport.requests.length, C.one, 'mount fetches host catalog exactly once')
    if (!holdInitial) { if (initialFailure) await driver.fail(transport.latest, initialFailure); else await driver.respond(transport.latest, initialCatalog) }
    await run(driver, harness, transport)
  } finally { harness.dispose() }
}
export function accessibleName(node, tree) {
  if (node.props?.[C.attributes.ariaLabel]) return String(node.props[C.attributes.ariaLabel])
  const labelled = node.props?.[C.attributes.ariaLabelledBy]
  if (labelled) return labelled.split(C.separator).map(id => textOf(nodes(tree, item => item.props?.id === id))).join(C.separator)
  return textOf(node)
}
export function nearestSharedContainer(tree, first, second) {
  const children = nodes(tree, node => node !== first && node !== second && nodes(node, item => item === first).length && nodes(node, item => item === second).length)
  return children.at(C.last)
}
