/**
 * What DSH's own settings service serves for one plugin row: `servedNamespace({id, Config, raw})` runs
 * the current DSH's dsh-settings `SettingsForms` over a scripted configEditor holding one running
 * entry, and answers the namespace view (or undefined when DSH serves none). `fieldsOf(Config)` and
 * `assertField` read a schemastery Config's top-level fields (type, volatile, default, bounds, description).
 */
import assert from 'node:assert/strict'
import { importDsh } from './dsh.mjs'

const SETTINGS = Object.freeze({
  /** cordis FiberState.ACTIVE (cordis does not export it). */
  fiberActive: 2,
  profile: 'fbtest', none: '/fbtest/none', metaKeys: Object.freeze(['default', 'min', 'max', 'step', 'required', 'description']),
})

/** The top-level field nodes of a Config, by name (schemastery's toJSON keeps refs by uid). */
export function fieldsOf(Config) {
  const json = Config.toJSON()
  const root = json.refs[json.uid]
  assert.equal(root.type, 'object', 'Config is an object schema')
  return Object.fromEntries(Object.entries(root.dict).map(([name, uid]) => [name, resolveNode(json.refs, uid)]))
}
function resolveNode(refs, uid) {
  const node = structuredClone(refs[uid])
  if (node.inner !== undefined) node.inner = resolveNode(refs, node.inner)
  if (node.dict !== undefined) node.dict = Object.fromEntries(Object.entries(node.dict).map(([k, v]) => [k, resolveNode(refs, v)]))
  return node
}

/**
 * One field node matches its row `{type, volatile, default?, min?, max?, step?, required?, pattern?,
 * description?, absent?}`; `absent` lists meta keys that must not be set.
 */
export function assertField(node, row, label) {
  assert.ok(node, label + ': the field exists')
  assert.equal(node.type, row.type, label + ' type')
  assert.equal(node.meta.volatile === true, row.volatile, label + ' volatile: ' + JSON.stringify(node.meta))
  for (const key of SETTINGS.metaKeys) if (row[key] !== undefined) assert.deepEqual(node.meta[key], row[key], label + ' ' + key)
  if (row.pattern !== undefined) assert.equal(node.meta.pattern?.source, row.pattern, label + ' pattern')
  for (const key of row.absent ?? []) assert.equal(node.meta[key], undefined, label + ' has no ' + key)
}

/** The namespace DSH's settings service serves for one running entry of `Config` with `raw` config. */
export async function servedNamespace({ id, Config, raw = {}, inherited = {} }) {
  const [{ Context }, { SettingsForms }] = await Promise.all([importDsh('cordis'), importDsh('dsh-settings')])
  const ctx = new Context()
  ctx.logger.exporter({ levels: { default: 0 }, export() {} })
  const effective = Config({ ...inherited, ...raw })
  const fiber = { uid: 1, state: SETTINGS.fiberActive, runtime: { Config }, effectiveConfig: effective, config: effective }
  fiber.ctx = { fiber }
  const entry = { id, options: { id, config: raw }, fiber }
  ctx.provide('configEditor', { configuration: () => [{ entry, inherited, override: raw }], entries: () => [entry], documentPath: SETTINGS.none, edit: async () => {} })
  ctx.provide('profileContext', { name: SETTINGS.profile, home: SETTINGS.none, dir: SETTINGS.none })
  // The service imports a legacy document after the Loader settles; there is no Loader here.
  ctx.provide('loader', { await: () => new Promise(() => {}) })
  try {
    await ctx.plugin(SettingsForms)
    return ctx.settings.describe().find((view) => view.ns === id)
  } finally {
    await ctx.fiber.dispose()
  }
}
