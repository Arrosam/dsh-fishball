/**
 * The scripted Plugins page for the umbrella's settings pages (R4), on fishball-test-helpers/scripted-page:
 * the umbrella's real client.js runs unread in the scripted DSH page, applied by the current DSH's
 * Cordis with its declared `inject`; its `slots` and `locale` are the scripted page's. Two parts
 * are this area's own, modelled on DSH's dsh-client-ui-settings contracts (config-form.d.ts,
 * settings-mirror.d.ts, schema.d.ts):
 * - the primitives are DSH's real settings-form code (./primitives.mjs), given as the page's
 *   `@deepseek-ai/dsh-client-ui-primitives` module;
 * - `configForms` and `settingsSchema` over a Host model per namespace: its view (schema, value,
 *   base, user) is what DSH's own dsh-settings serves for the member's real Config
 *   (fishball-test-helpers/settings servedNamespace); a mutate is refused on a stale revision, when not
 *   writable, when told to refuse, or when the result fails the Config; otherwise it stores the user
 *   layer, bumps the revision and re-serves. `describe()` is the mirror
 *   ({status, view: {namespaces, writable, hasDocument}}), and `whileServed` is DSH's algorithm over it.
 * The member's Config comes from its published export (importBound of the dependency's entry, so its
 * DSH imports bind to the current DSH).
 *
 * LIMIT: not React's reconciler and not a DOM; interactions call the rendered elements' handlers.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { importBound } from 'fishball-test-helpers/bind'
import { importDsh } from 'fishball-test-helpers/dsh'
import { byAttr, findAll, textOf } from 'fishball-test-helpers/react-shim'
import { createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { servedNamespace } from 'fishball-test-helpers/settings'
import { realPrimitives } from './primitives.mjs'
import { PAGE, UMBRELLA } from './constants.mjs'

const require = createRequire(import.meta.url)

/** A member row's real Config, from the dependency's published entry, bound to the current DSH. */
export async function memberConfig(row) {
  const mod = await importBound(require.resolve(row.pkg))
  assert.ok(mod.Config, row.pkg + ' exports no Config')
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

/** The Host model behind configForms: namespaces served, their views, revisions and recorded mutations. */
function hostModel(Schema, { users, extend, rerender }) {
  const hosts = new Map()
  const served = new Set()
  let writable = true
  let mirror
  const mirrorListeners = new Set()
  const formListeners = new Map()
  const snapshots = new Map()
  const watches = []
  const serve = async (host) => { host.view = await servedNamespace({ id: host.id, Config: host.Config, raw: host.user }) }
  async function hostOf(id) {
    if (hosts.has(id)) return hosts.get(id)
    const row = UMBRELLA.rows.find((r) => r.id === id)
    let Config = row ? await memberConfig(row) : Schema.object({ [PAGE.otherField]: Schema.string().volatile() })
    if (extend[id]) Config = extend[id](Schema, Config)
    const host = { id, Config, user: structuredClone(users[id] ?? {}), revision: PAGE.firstRevision, status: undefined, refuse: 0, view: undefined, mutations: [] }
    await serve(host)
    assert.ok(host.view, 'DSH serves no namespace for ' + id)
    hosts.set(id, host)
    return host
  }
  function publish() {
    mirror = { status: PAGE.status.ready, error: null, view: { writable, hasDocument: true, namespaces: [...served].map((id) => ({ ...hosts.get(id).view, revision: hosts.get(id).revision })) } }
    snapshots.clear()
    for (const l of [...mirrorListeners]) l()
    for (const set of formListeners.values()) for (const l of [...set]) l()
    rerender()
  }
  function formSnapshot(id) {
    if (!snapshots.has(id)) {
      const host = hosts.get(id)
      const view = served.has(id) ? host?.view : undefined
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
    if (!writable || !served.has(id)) return false
    if (expected !== undefined && expected !== host.revision) return false
    const next = structuredClone(host.user)
    for (const op of plain) applyOp(next, op)
    try { host.Config(next) } catch { return false }
    host.user = next
    await serve(host)
    host.revision += 1
    publish()
    return true
  }
  const forms = new Map()
  const configForms = {
    describe: () => ({ getSnapshot: () => mirror, subscribe: (fn) => { mirrorListeners.add(fn); return () => mirrorListeners.delete(fn) }, ensure: async () => {}, acceptView() {} }),
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
    // DSH's own whileServed (dsh-client-ui-settings config-form.d.ts), over this mirror.
    whileServed(namespaces, register) {
      watches.push([...namespaces])
      let off
      const sync = () => {
        const now = new Set(mirror.view?.namespaces.map((v) => v.ns) ?? [])
        const watched = namespaces.some((ns) => now.has(ns))
        if (watched && off === undefined) off = register(now)
        else if (!watched && off !== undefined) { off(); off = undefined }
      }
      mirrorListeners.add(sync)
      sync()
      return () => { mirrorListeners.delete(sync); off?.(); off = undefined }
    },
  }
  return {
    hosts, watches, configForms, formSnapshot, mutate, publish,
    async start(ids) { for (const id of ids) { await hostOf(id); served.add(id) } publish() },
    async serve(id, on) { if (on) { await hostOf(id); served.add(id) } else served.delete(id); publish() },
    setWritable(value) { writable = value; publish() },
    setStatus(id, status) { hosts.get(id).status = status; publish() },
  }
}

/**
 * Opens the page.
 * @param options.lang - 'en' or 'zh'.
 * @param options.served - the namespaces the Host serves at the start (default: every configurable row).
 * @param options.users - the starting user layer per namespace.
 * @param options.extend - per namespace, `(Schema, Config) => Config` replacing the served Config.
 */
export async function openUmbrellaPage(t, { lang = PAGE.lang.en, served = UMBRELLA.rows.map((r) => r.id), users = {}, extend = {} } = {}) {
  const Schema = (await importDsh('schemastery')).default
  const settingsSchema = {
    rehydrate: (json) => new Schema(json),
    validate(schema, draft) { try { schema(draft); return undefined } catch (error) { return error instanceof Error ? error.message : String(error) } },
  }
  assert.ok(fs.existsSync(UMBRELLA.client), UMBRELLA.client + ' does not exist')
  const world = createWorld({ clients: [{ id: UMBRELLA.id, file: UMBRELLA.client }], lang, services: { [PAGE.services.settingsSchema]: settingsSchema } })
  const host = hostModel(Schema, { users, extend, rerender: () => world.shim.rerender() })
  world.services[PAGE.services.configForms] = host.configForms
  world.platform = { [PAGE.require.primitives]: realPrimitives(world.React) }
  await host.start(served)
  const handle = await loadPage(t, world)
  const settle = () => handle.settled()

  const dictionary = () => world.localeRegistrations.findLast((r) => r.ns === UMBRELLA.id)?.dicts
  let mounted = 0
  const page = {
    world, host: (id) => host.hosts.get(id), watches: host.watches, settle,
    /** The one __ModuleLoader__ registration and the plugin its factory made. */
    definition: () => world.page.registrations,
    plugin: () => world.table.materialize(UMBRELLA.id),
    required: () => world.table.required,
    fiber: () => world.plugins.find((p) => p.id === UMBRELLA.id)?.fiber,
    /** The text the umbrella's dictionary gives `key` in `language` (undefined when absent). */
    text: (key, language = lang) => dictionary()?.[language]?.[key],
    entries: (slot) => world.entries(slot),
    entry: (slot, key) => world.entries(slot).find((e) => e.options.key === key),
    /** The Host starts or stops serving a namespace. */
    async serve(id, on = true) { await host.serve(id, on); await settle() },
    async setWritable(value) { host.setWritable(value); await settle() },
    async setStatus(id, status) { host.setStatus(id, status); await settle() },
    /** Renders an entry in a new root, as the Plugins page opens it (owner props view and form). */
    async open(slot, key, view = PAGE.view.page) {
      const entry = page.entry(slot, key)
      assert.ok(entry, `no live ${slot} entry with key ${key}; live: ${JSON.stringify(world.entries(slot).map((e) => e.options.key))}`)
      const rowId = PAGE.rowOfKey(key)
      const form = rowId && host.hosts.get(rowId) ? { get state() { return host.formSnapshot(rowId) }, mutate: (ops, rev) => host.mutate(rowId, ops, rev) } : undefined
      const id = PAGE.mountPrefix + ++mounted
      await handle.mount(id, () => world.renderEntry(entry, { view, form }))
      return viewOf(() => world.shim.treeOf(id))
    },
  }
  return page
}

/** Queries over one rendered root. */
function viewOf(tree) {
  const all = () => findAll(tree(), () => true)
  const v = {
    tree,
    text: () => textOf({ children: tree() }),
    /** The top-level controls in tree order: [{kind: 'setting'|'list', name}]. */
    controls: () => all().flatMap((n) => (n.props[PAGE.attr.setting] !== undefined ? [{ kind: 'setting', name: n.props[PAGE.attr.setting] }] : n.props[PAGE.attr.list] !== undefined ? [{ kind: 'list', name: n.props[PAGE.attr.list] }] : [])),
    setting: (name) => byAttr(tree(), PAGE.attr.setting, name)[0],
    list: (name) => byAttr(tree(), PAGE.attr.list, name)[0],
    inputs: (node) => findAll(node ? [node] : tree(), (n) => n.tag === 'input'),
    buttons: (node) => findAll(node ? [node] : tree(), (n) => n.tag === 'button'),
    /** Buttons whose text is `label`, outside every list section. */
    button(label) {
      const lists = byAttr(tree(), PAGE.attr.list)
      const inList = (b) => lists.some((l) => findAll([l], (n) => n === b).length > 0)
      return v.buttons().filter((b) => textOf(b).trim() === label && !inList(b))
    },
  }
  return v
}

/** A user's input into a text control (its onChange with the new value). */
export function type(node, value) {
  assert.ok(node, 'no control to type into')
  const event = { target: { value }, currentTarget: { value }, preventDefault() {}, stopPropagation() {} }
  ;(node.props.onChange ?? node.props.onInput)?.(event)
}
/** A click; a browser fires none on a disabled button. */
export function click(node) {
  assert.ok(node, 'no control to click')
  if (node.props.disabled === true) return
  node.props.onClick?.({ preventDefault() {}, stopPropagation() {}, currentTarget: node, target: node })
}
export { textOf }
