/**
 * Schema checks shared by the settings suites of the amenity rows (R2): every user setting of a row is
 * `.volatile()` and keeps its type, default, bounds and description, and DSH's own settings service
 * (dsh-settings SettingsForms.describe, over a scripted configEditor holding one running entry)
 * therefore serves the row's namespace with those fields.
 */
import assert from 'node:assert/strict'
import { importSdk } from '../sdk.mjs'

const sdkPackage = importSdk
/** cordis FiberState.ACTIVE (not exported). */
const ACTIVE = 2

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
 * Asserts one field node matches its row: `{type, volatile, default?, min?, max?, step?, required?,
 * pattern?, description}`; `absent` lists meta keys that must not be set (no default, no max).
 */
export function assertField(node, row, label) {
  assert.ok(node, label + ': the field exists')
  assert.equal(node.type, row.type, label + ' type')
  assert.equal(node.meta.volatile === true, row.volatile, label + ' volatile: ' + JSON.stringify(node.meta))
  for (const key of ['default', 'min', 'max', 'step', 'required', 'description']) {
    if (row[key] !== undefined) assert.deepEqual(node.meta[key], row[key], label + ' ' + key)
  }
  if (row.pattern !== undefined) assert.equal(node.meta.pattern?.source, row.pattern, label + ' pattern')
  for (const key of row.absent ?? []) assert.equal(node.meta[key], undefined, label + ' has no ' + key)
}

/**
 * The namespace DSH's settings service serves for one running entry of `Config` with `raw`
 * config, or undefined when it serves none. `dsh-settings` of the SDK under test.
 */
export async function servedNamespace(sdk, { id, Config, raw = {}, inherited = {} }) {
  const [{ Context }, { SettingsForms }] = await Promise.all([sdkPackage(sdk, '@deepseek-ai/cordis'), sdkPackage(sdk, '@deepseek-ai/dsh-settings')])
  const ctx = new Context()
  ctx.logger.exporter({ levels: { default: 0 }, export() {} })
  const effective = Config({ ...inherited, ...raw })
  const fiber = { uid: 1, state: ACTIVE, runtime: { Config }, effectiveConfig: effective, config: effective }
  fiber.ctx = { fiber }
  const entry = { id, options: { id, config: raw }, fiber }
  ctx.provide('configEditor', { configuration: () => [{ entry, inherited, override: raw }], entries: () => [entry], documentPath: '/fbtest/none', edit: async () => {} })
  ctx.provide('profileContext', { name: 'fbtest', home: '/fbtest/none', dir: '/fbtest/none' })
  // The service imports a legacy document after the Loader settles; there is no Loader here.
  ctx.provide('loader', { await: () => new Promise(() => {}) })
  try {
    await ctx.plugin(SettingsForms)
    return ctx.settings.describe().find((view) => view.ns === id)
  } finally {
    await ctx.fiber.dispose()
  }
}