import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { setImmediate as settle } from 'node:timers/promises'
import { createBrowserSandbox } from '../../../test/support/browser-sandbox.mjs'
import { createReactShim, findAll, textOf } from '../../../test/support/rp-recommend.mjs'

const HOST = {
  origin: 'https://fishball.test/', lang: 'en', view: 'page',
  module: 'fishball-core', slot: 'plugins.bundle.config', namespace: 'fishball-core',
  primitives: '@deepseek-ai/dsh-client-ui-primitives', session: 'remote.session',
  ready: 'ready', revision: 1, set: 'set', unset: 'unset', model: 'model',
}
const LABEL = { model: "Fishball's model", effort: 'Reasoning effort', dshDefault: "This DSH's default model" }
const chunk = new URL('../client.settings.js', import.meta.url)
const noop = () => {}
const subscribeNoop = () => noop

function configForm(initialModel) {
  const writes = []
  const listeners = new Set()
  const value = initialModel === undefined ? {} : { [HOST.model]: initialModel }
  let snapshot = { status: HOST.ready, writable: true, value, user: value, base: {}, revision: HOST.revision }
  async function mutate(ops) {
    writes.push(...structuredClone(ops))
    const next = { ...snapshot.value }
    for (const { op, path: [key], value } of ops) {
      if (op === HOST.set) next[key] = value
      else if (op === HOST.unset) delete next[key]
    }
    snapshot = { ...snapshot, value: next, user: next, revision: snapshot.revision + 1 }
    for (const listener of listeners) listener()
    return true
  }
  return {
    writes, mutate, getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set: (field, value) => mutate([{ op: HOST.set, path: [field], value }]),
    unset: (field) => mutate([{ op: HOST.unset, path: [field] }]),
  }
}

// Execute the shipped chunk through the loader and render its registered settings slot.
// Only host boundaries are scripted; tests use rendered dropdowns and ConfigForm writes.
async function openSettings(t, catalog, model) {
  const shim = createReactShim({ stale: noop })
  const browser = createBrowserSandbox({ lang: HOST.lang, baseURI: HOST.origin, fetch: async () => ({ json: async () => null }) })
  const form = configForm(model)
  let page
  let dictionary
  const translate = (key, vars) => (dictionary?.[key] ?? key).replace(/\{([^}]+)\}/g, (_, name) => vars?.[name] ?? '')
  const ctx = {
    locale: {
      register: (_namespace, dictionaries) => { dictionary = dictionaries[HOST.lang] },
      bind: () => translate, subscribe: subscribeNoop, getSnapshot: () => HOST.lang,
    },
    configForms: {
      get: (namespace) => { assert.equal(namespace, HOST.namespace); return form },
      whileServed: (namespaces, register) => register(new Set(namespaces)),
    },
    slots: {
      inject: (slot, register) => { assert.equal(slot, HOST.slot); return register() },
      register: ({ name, key }, component) => {
        assert.equal(name, HOST.slot)
        assert.equal(key, HOST.module)
        page = component
        return noop
      },
    },
    remote: { credentials: {}, $on: subscribeNoop },
    get: (service) => service === HOST.session ? session : undefined,
    effect: (apply) => apply(),
    plugin: (plugin) => plugin.apply(ctx),
  }
  const session = { modelCatalog: async () => ({ ok: true, value: structuredClone(catalog) }), $on: subscribeNoop }
  ctx.remote.session = session
  const primitives = {
    // The staged text fields are unrelated to the picker's immediate namespace writes.
    SettingsFormModel: class {
      bind(read) { return { subscribe: subscribeNoop, getSnapshot: read } }
      shell() { return { writable: true } }
      field() { return {} }
      actions() { return {} }
      dispose() {}
    },
    settingsTextField: noop,
  }
  const modules = {
    react: shim.React,
    [HOST.primitives]: new Proxy(primitives, { get: (exports, name) => exports[name] ?? String(name) }),
  }
  t.after(() => { shim.unmountRoot(HOST.slot); browser.clearTimers() })
  browser.run(readFileSync(chunk, 'utf8'), chunk.pathname)
  const registration = browser.registrations.find((entry) => entry.id === HOST.module)
  assert.ok(registration, 'Core settings chunk did not register')
  registration.factory((name) => modules[name]).settingsPlugin.apply(ctx)
  assert.ok(page, 'Core settings slot did not register')
  shim.mount(HOST.slot, () => shim.React.createElement(page, { view: HOST.view, t: translate }))
  await settle()
  return { tree: shim.tree, writes: form.writes }
}

const options = (select) => findAll(select.children, (node) => node.tag === 'option')
const text = (node) => textOf(node).trim()
function dropdowns(page, name) {
  const tree = page.tree()
  const labels = findAll(tree, (node) => node.tag === 'label')
  return findAll(tree, (node) => node.tag === 'select').filter((select) => {
    const labelledBy = select.props['aria-labelledby']?.split(/\s+/) ?? []
    const related = findAll(tree, (node) => labelledBy.includes(node.props.id)).map(text).join(' ')
    const label = labels.find((node) => (select.props.id && node.props.htmlFor === select.props.id)
      || findAll(node.children, (child) => child === select).length)
    const caption = (related || select.props['aria-label'] || (label && label.children.filter((child) => child !== select).map(textOf).join('')) || '').trim()
    return caption.toLowerCase() === name.toLowerCase()
  })
}
function one(items, description) {
  assert.equal(items.length, 1, description)
  return items[0]
}
const dropdown = (page, name) => one(dropdowns(page, name), 'Expected one dropdown: ' + name)

function option(select, name) {
  return one(options(select).filter((entry) => text(entry).includes(name)), 'Expected one option named ' + name)
}

function assertSelected(select, name) {
  assert.equal(select.props.value ?? select.props.defaultValue ?? options(select)[0]?.props.value,
    option(select, name).props.value, 'Expected selected option: ' + name)
}

async function choose(page, caption, name) {
  const select = dropdown(page, caption)
  const choice = option(select, name)
  assert.ok(!select.props.disabled && !choice.props.disabled, 'Expected enabled option: ' + name)
  select.props.onChange({ target: { value: choice.props.value }, currentTarget: { value: choice.props.value } })
  await settle()
}

const effort = (id, name) => ({ id, name })
const light = effort('low', 'Light')
const balanced = effort('medium', 'Balanced')
const deep = effort('high', 'Deep')
const peak = effort('xhigh', 'Peak')
const fast = effort('minimal', 'Fast')
const retired = effort('retired', 'Retired')
const model = (id, name, efforts, defaultEffort) => ({
  id, name, ...(efforts === undefined ? {} : { reasoning: { efforts, ...(defaultEffort && { defaultEffort: defaultEffort.id }) } }),
})
const atlas = model('atlas', 'Atlas', [light, deep, balanced], light)
const boreal = model('boreal', 'Boreal', [light, balanced], light)
const cedar = model('cedar', 'Cedar', [peak, fast], fast)
const missingDefault = model('delta', 'Delta', [peak, fast])
const invalidDefault = model('ember', 'Ember', [peak, fast], retired)
const plain = model('plain', 'Plain')
const empty = model('empty', 'Empty Efforts', [])
const solo = model('solo', 'Solo', [fast])
const providerA = { id: 'provider-a', name: 'Provider A', models: [atlas, plain, empty] }
const providerB = { id: 'provider-b', name: 'Provider B', models: [boreal, cedar, missingDefault, invalidDefault, solo] }
const catalog = { groups: [providerA, providerB], failures: [] }
const selection = (provider, model, effort) => ({ provider: provider.id, model: model.id, ...(effort && { reasoningEffort: effort.id }) })
const write = (value) => ({ op: HOST.set, path: [HOST.model], value })

function assertPickers(page, modelName, expectedEffort, allowed = []) {
  assertSelected(dropdown(page, LABEL.model), modelName)
  const effortPickers = dropdowns(page, LABEL.effort)
  if (!expectedEffort) {
    assert.ok(effortPickers.length === 0 || (effortPickers.length === 1 && effortPickers[0].props.disabled),
      'An effort picker must not be usable without supported efforts')
    return
  }
  const effortPicker = one(effortPickers, 'Expected one Reasoning effort dropdown')
  assert.equal(options(effortPicker).length, allowed.length, 'Only supported efforts should be listed')
  for (const entry of allowed) {
    const choice = option(effortPicker, entry.name)
    if (allowed.length > 1) assert.ok(!effortPicker.props.disabled && !choice.props.disabled, 'Supported efforts must be selectable')
  }
  assertSelected(effortPicker, expectedEffort.name)
}

test('shows configured model and effort separately, lists models once, and keeps a supported effort on switch', async (t) => {
  const page = await openSettings(t, catalog, selection(providerA, atlas, deep))
  const picker = dropdown(page, LABEL.model)
  const models = catalog.groups.flatMap((group) => group.models)
  assert.equal(options(picker).length, models.length + 1)
  for (const entry of models) option(picker, entry.name)
  for (const entry of [light, balanced, deep, peak, fast]) {
    assert.ok(options(picker).every((choice) => !text(choice).includes(entry.name)), 'Model options must not include effort choices')
  }
  assertPickers(page, atlas.name, deep, [light, deep, balanced])
  assert.deepEqual(page.writes, [], 'Rendering the configured values must not save')

  await choose(page, LABEL.effort, balanced.name)
  assertPickers(page, atlas.name, balanced, [light, deep, balanced])
  await choose(page, LABEL.model, boreal.name)
  assertPickers(page, boreal.name, balanced, [light, balanced])
  assert.deepEqual(page.writes, [write(selection(providerA, atlas, balanced)), write(selection(providerB, boreal, balanced))])
})

for (const [description, destination, selected] of [
  ['uses a supported catalog default rather than the first effort', cedar, fast],
  ['uses the first effort when the default is absent', missingDefault, peak],
  ['uses the first effort when the default is unsupported', invalidDefault, peak],
]) {
  test(description, async (t) => {
    const page = await openSettings(t, catalog, selection(providerA, atlas, deep))
    await choose(page, LABEL.model, destination.name)
    assertPickers(page, destination.name, selected, [peak, fast])
    assert.deepEqual(page.writes, [write(selection(providerB, destination, selected))])
  })
}

test('omits stale efforts for models with none and still unsets the model for the DSH default', async (t) => {
  const page = await openSettings(t, catalog)
  assertPickers(page, LABEL.dshDefault)
  assert.deepEqual(page.writes, [])

  const steps = [
    [providerA, atlas, light, [light, deep, balanced]],
    [providerA, plain],
    [providerB, solo, fast, [fast]],
    [providerA, empty],
    // Delta supports Solo's effort, but switching through Empty Efforts clears it.
    [providerB, missingDefault, peak, [peak, fast]],
  ]
  const expectedWrites = []
  for (const [provider, destination, effort, allowed] of steps) {
    await choose(page, LABEL.model, destination.name)
    assertPickers(page, destination.name, effort, allowed)
    expectedWrites.push(write(selection(provider, destination, effort)))
    assert.deepEqual(page.writes, expectedWrites)
  }
  await choose(page, LABEL.model, LABEL.dshDefault)
  assertPickers(page, LABEL.dshDefault)
  assert.deepEqual(page.writes, [...expectedWrites, { op: HOST.unset, path: [HOST.model] }])
})
