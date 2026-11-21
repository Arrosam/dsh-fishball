/**
 * A scripted Plugins page for an umbrella's settings pages (R4). No browser, no React: the repo's
 * harness parts are reused, as the connector's own settings-page suite does:
 * - support/browser-sandbox.mjs runs the classic client.js (`window.__ModuleLoader__.load`);
 * - support/rp-recommend.mjs is the React shim (hooks, effects, re-render) and tree queries;
 * - fishball-core/package/page.mjs `pageServices` gives the `slots` and `locale` page services;
 * - primitives.mjs gives DSH's own SettingsForm, SettingsValueField, settingsNumberField,
 *   settingsTextField and SettingsFormModel (Button and Input are pass-through fakes);
 * - the SDK's own cordis Context applies the client plugin with its declared `inject`.
 * Scripted here, from DSH's dsh-client-ui-settings contracts (config-form.ts, settings-mirror.ts,
 * schema.ts): `configForms` (describe() mirror, get(ns) ConfigForm, whileServed as DSH implements it)
 * and `settingsSchema` (rehydrate = new Schema(json), validate). The Host is a model per namespace:
 * its view (schema, value, base, user) is what DSH's own dsh-settings serves for the member's real
 * Config (amenity-settings.mjs servedNamespace); a mutate checks the expected revision, applies the
 * ops to the user layer, re-validates with the Config, bumps the revision and re-serves.
 *
 * LIMIT: not React's reconciler and not a DOM; interactions call the rendered elements' handlers.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createBrowserSandbox } from '../../../../test/support/browser-sandbox.mjs'
import { byAttr, createReactShim, findAll, textOf } from '../../../../test/support/rp-recommend.mjs'
import { servedNamespace } from '../../../../test/support/amenity-settings.mjs'
import { pageServices } from '../../../../test/v3/fishball-core/package/page.mjs'
import { importInstance } from '../../../../test/support/../private-skills/support/sdk.mjs'
import { INSTANCE } from '../../../../test/support/constants.mjs'
import { primitivesModule } from './primitives.mjs'
import { PAGE, UMBRELLA } from './constants.mjs'

const settle = async () => { for (let i = 0; i < PAGE.settleRounds; i++) await new Promise((resolve) => setImmediate(resolve)) }
const sdkUrl = (sdk, ...parts) => pathToFileURL(path.join(PAGE.versionsDir, sdk, 'node_modules', ...parts)).href

/** A member row's real Config, bound to `sdk`. */
export async function memberConfig(sdk, row) {
  const mod = await importInstance(sdk, path.relative(INSTANCE.dir, row.configModule))
  assert.ok(mod.Config, row.configModule + ' exports no Config')
  return mod.Config
}

/** The top-level fields of a serialized schema, in order: [{name, node}] (refs resolved). */
export function servedFields(json) {
  const root = json.refs[json.uid]
  const resolve = (uid) => { const node = structuredClone(json.refs[uid]); if (node.inner !== undefined) node.inner = resolve(node.inner); if (node.dict) node.dict = Object.fromEntries(Object.entries(node.dict).map(([k, v]) => [k, resolve(v)])); return node }
  return Object.entries(root.dict).map(([name, uid]) => ({ name, node: resolve(uid) }))
}

/** Applies one `{op, path, value}` to a plain object (set / unset at a path). */
function applyOp(target, op) {
  const parent = op.path.slice(0, -1).reduce((node, key) => (node[key] ??= {}), target)
  if (op.op === PAGE.op.set) parent[op.path.at(-1)] = structuredClone(op.value)
  else delete parent[op.path.at(-1)]
}

/**
 * Opens the page.
 * @param options.sdk - the SDK whose cordis applies the client plugin and whose dsh-settings serves.
 * @param options.lang - 'en' or 'zh'.
 * @param options.served - the namespaces the Host serves at the start (default: every configurable row).
 * @param options.users - the starting user layer per namespace.
 * @param options.extend - per namespace, `(Schema, Config) => Config` replacing the served Config.
 */
export async function openUmbrellaPage(t, { sdk, lang = PAGE.lang.en, served = UMBRELLA.rows.map((r) => r.id), users = {}, extend = {} } = {}) {
  const Schema = (await import(sdkUrl(sdk, '@deepseek-ai', 'schemastery', 'lib', 'index.mjs'))).default
  const { Context } = await import(sdkUrl(sdk, '@deepseek-ai', 'cordis', 'lib', 'index.js'))

  // ------------------------------------------------------------------ the Host model
  const hosts = new Map()
  async function hostOf(id) {
    if (hosts.has(id)) return hosts.get(id)
    const row = UMBRELLA.rows.find((r) => r.id === id)
    let Config = row ? await memberConfig(sdk, row) : Schema.object({ [PAGE.otherField]: Schema.string().volatile() })
    if (extend[id]) Config = extend[id](Schema, Config)
    const host = { id, Config, user: structuredClone(users[id] ?? {}), revision: PAGE.firstRevision, status: undefined, refuse: 0, view: undefined, mutations: [] }
    host.view = await servedNamespace(sdk, { id, Config, raw: host.user })
    assert.ok(host.view, 'DSH serves no namespace for ' + id)
    hosts.set(id, host)
    return host
  }
  const servedSet = new Set()
  let writable = true
  let mirrorSnapshot
  const mirrorListeners = new Set()
  const formListeners = new Map()
  const snapshots = new Map()
  const shim = createReactShim({ stale() {} })
  function publish() {
    mirrorSnapshot = {
      status: 'ready', error: null,
      view: { writable, hasDocument: true, namespaces: [...servedSet].map((id) => ({ ...hosts.get(id).view, revision: hosts.get(id).revision })) },
    }
    snapshots.clear()
    for (const l of [...mirrorListeners]) l()
    for (const set of formListeners.values()) for (const l of [...set]) l()
    shim.rerender()
  }
  function formSnapshot(id) {
    if (!snapshots.has(id)) {
      const host = hosts.get(id)
      const view = servedSet.has(id) ? host?.view : undefined
      const status = host?.status ?? (view ? PAGE.status.ready : PAGE.status.unavailable)
      snapshots.set(id, Object.freeze({ status, value: view?.value, base: view?.base, user: view?.user, revision: host?.revision, writable }))
    }
    return snapshots.get(id)
  }
  async function mutate(id, ops, expected) {
    const host = hosts.get(id)
    const plain = JSON.parse(JSON.stringify(ops))
    host.mutations.push({ ops: plain, expected, liveRevision: host.revision })
    if (host.refuse > 0) { host.refuse -= 1; return false }
    if (!writable || !servedSet.has(id)) return false
    if (expected !== undefined && expected !== host.revision) return false
    const next = structuredClone(host.user)
    for (const op of plain) applyOp(next, op)
    try { host.Config(next) } catch { return false }
    host.user = next
    host.view = await servedNamespace(sdk, { id, Config: host.Config, raw: host.user })
    host.revision += 1
    publish()
    return true
  }
  const forms = new Map()
  const configForms = {
    describe: () => ({
      getSnapshot: () => mirrorSnapshot,
      subscribe: (fn) => { mirrorListeners.add(fn); return () => mirrorListeners.delete(fn) },
      ensure: async () => {},
      acceptView() {},
    }),
    get(id) {
      if (!forms.has(id)) {
        forms.set(id, {
          getSnapshot: () => formSnapshot(id),
          subscribe: (fn) => { if (!formListeners.has(id)) formListeners.set(id, new Set()); formListeners.get(id).add(fn); return () => formListeners.get(id).delete(fn) },
          mutate: (ops, expected) => mutate(id, ops, expected),
          set: (field, value) => mutate(id, [{ op: PAGE.op.set, path: [field], value }]),
          unset: (field) => mutate(id, [{ op: PAGE.op.unset, path: [field] }]),
        })
      }
      return forms.get(id)
    },
    // DSH's own whileServed (dsh-client-ui-settings config-form.ts), over this mirror.
    whileServed(namespaces, register) {
      watches.push([...namespaces])
      let off
      const sync = () => {
        const now = new Set(mirrorSnapshot.view?.namespaces.map((v) => v.ns) ?? [])
        const watched = namespaces.some((ns) => now.has(ns))
        if (watched && off === undefined) off = register(now)
        else if (!watched && off !== undefined) { off(); off = undefined }
      }
      mirrorListeners.add(sync)
      sync()
      return () => { mirrorListeners.delete(sync); off?.(); off = undefined }
    },
  }
  const watches = []
  const settingsSchema = {
    rehydrate: (json) => new Schema(json),
    validate(schema, draft) { try { schema(draft); return undefined } catch (error) { return error instanceof Error ? error.message : String(error) } },
  }
  for (const id of served) { await hostOf(id); servedSet.add(id) }
  publish()

  // ------------------------------------------------------------------ the page
  const errors = []
  const pageConsole = { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn: () => {}, log: () => {}, info: () => {}, debug: () => {} }
  const sandbox = createBrowserSandbox({ lang, baseURI: PAGE.baseURI, fetch: async () => new Response('', { status: 404 }), console: pageConsole })
  assert.ok(fs.existsSync(UMBRELLA.client), UMBRELLA.client + ' does not exist')
  sandbox.run(fs.readFileSync(UMBRELLA.client, 'utf8'), UMBRELLA.client)
  assert.equal(sandbox.registrations.length, 1, '__ModuleLoader__.load calls: ' + sandbox.registrations.length)
  const [definition] = sandbox.registrations
  const { React } = shim
  const modules = { [PAGE.require.react]: React, [PAGE.require.primitives]: primitivesModule(React, PAGE.versionsDir) }
  const required = []
  const require = (spec) => {
    required.push(spec)
    if (!(spec in modules)) throw new Error('client.js required ' + JSON.stringify(spec))
    return modules[spec]
  }
  const plugin = definition.factory(require)
  const services = pageServices(shim, lang)
  const registrations = []
  const slots = {
    ...services.slots,
    register(options, Component) {
      const record = { options, Component, disposed: false }
      registrations.push(record)
      const dispose = services.slots.register(options, Component)
      return () => { record.disposed = true; dispose() }
    },
  }
  const dictionaries = new Map()
  const locale = { ...services.locale, register(ns, dicts) { dictionaries.set(ns, dicts); return services.locale.register(ns, dicts) } }
  const root = new Context()
  root.provide('slots', slots)
  root.provide('locale', locale)
  root.provide('configForms', configForms)
  root.provide('settingsSchema', settingsSchema)
  const fiber = root.plugin(plugin.default ?? plugin)
  await settle()

  let mounted = 0
  t.after(async () => {
    for (const key of shim.roots()) shim.unmountRoot(key)
    sandbox.clearTimers()
    await fiber.dispose?.()
  })
  const live = () => registrations.filter((r) => !r.disposed)
  const dict = () => dictionaries.get(UMBRELLA.id)
  const page = {
    definition, plugin, required, registrations, errors, watches, fiber, hosts, settle,
    host: (id) => hosts.get(id),
    dictionary: dict,
    /** The text the umbrella's dictionary gives `key` in `language` (undefined when absent). */
    text: (key, language = lang) => dict()?.[language]?.[key],
    entries: (slot) => live().filter((r) => r.options.name === slot),
    entry: (slot, key) => live().find((r) => r.options.name === slot && r.options.key === key),
    /** The Host starts or stops serving a namespace. */
    async serve(id, on = true) { if (on) { await hostOf(id); servedSet.add(id) } else servedSet.delete(id); publish(); await settle() },
    async setWritable(value) { writable = value; publish(); await settle() },
    async setStatus(id, status) { hosts.get(id).status = status; publish(); await settle() },
    /** Another editor (another tab) saves `ops` at the live revision. */
    async external(id, ops) {
      const host = hosts.get(id)
      for (const op of ops) applyOp(host.user, op)
      host.view = await servedNamespace(sdk, { id, Config: host.Config, raw: host.user })
      host.revision += 1
      publish()
      await settle()
    },
    refuseNext(id) { hosts.get(id).refuse += 1 },
    setLang: async (next) => { services.setLang(next); await settle() },
    /** Renders an entry in a new root, as the Plugins page opens it. */
    async open(slot, key, view = PAGE.view.page) {
      const entry = page.entry(slot, key)
      assert.ok(entry, `no live ${slot} entry with key ${key}; live: ${JSON.stringify(live().map((r) => [r.options.name, r.options.key]))}`)
      const rowId = key.split('#')[1]
      const id = 'root-' + ++mounted
      const form = rowId && hosts.get(rowId) ? { get state() { return formSnapshot(rowId) }, mutate: (ops, rev) => mutate(rowId, ops, rev) } : undefined
      shim.mount(id, () => React.createElement(entry.Component, { view, form }))
      await settle()
      return viewOf(() => shim.treeOf(id), () => shim.unmountRoot(id))
    },
  }
  return page
}

/** Queries over one rendered root. */
function viewOf(tree, close) {
  const all = () => findAll(tree(), () => true)
  const v = {
    tree, close,
    text: () => textOf({ children: tree() }),
    find: (attr, value) => byAttr(tree(), attr, value),
    /** The top-level controls in tree order: [{kind: 'setting'|'list', name}]. */
    controls: () => all().flatMap((n) => (n.props[PAGE.attr.setting] !== undefined ? [{ kind: 'setting', name: n.props[PAGE.attr.setting] }] : n.props[PAGE.attr.list] !== undefined ? [{ kind: 'list', name: n.props[PAGE.attr.list] }] : [])),
    setting: (name) => byAttr(tree(), PAGE.attr.setting, name)[0],
    list: (name) => byAttr(tree(), PAGE.attr.list, name)[0],
    inputs: (node) => findAll(node ? [node] : tree(), (n) => n.tag === 'input'),
    buttons: (node) => findAll(node ? [node] : tree(), (n) => n.tag === 'button'),
    /** Buttons whose text is `label`, outside every list section unless `within` is given. */
    button(label, within) {
      const lists = byAttr(tree(), PAGE.attr.list)
      const inList = (b) => lists.some((l) => findAll([l], (n) => n === b).length > 0)
      return v.buttons(within).filter((b) => textOf(b).trim() === label && (within !== undefined || !inList(b)))
    },
    items: (name) => byAttr([v.list(name)], PAGE.attr.item),
    alerts: () => findAll(tree(), (n) => n.props.role === 'alert'),
    statuses: () => findAll(tree(), (n) => n.props.role === 'status'),
  }
  return v
}

/** A user's input into a text control (its onChange with the new value). */
export function type(node, value) {
  assert.ok(node, 'no control to type into')
  const event = { target: { value }, currentTarget: { value }, preventDefault() {}, stopPropagation() {} }
  ;(node.props.onChange ?? node.props.onInput)?.(event)
}
export function click(node) {
  assert.ok(node, 'no control to click')
  // A browser fires no click on a disabled button.
  if (node.props.disabled === true) return
  node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
}
export { textOf }
