/**
 * P3 survey (implementer evidence): in a plain Web profile with dsh-fishball linked, which
 * tools does Fishball's agent see, which row registered each global tool, and which bundles
 * does the plugin manager list? Grounds the catalog and checked-tool constants.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, runSpike, until, REPO } from './harness.mjs'

const { ToolRuntime } = await hostPkg('dsh-tools')
const { scopeOf } = await hostPkg('dsh-scope')
const owners = new Map()
const entryOf = (ctx) => { let f = ctx.fiber; while (f) { if (f.entry) return f.entry; const p = f.parent?.fiber; if (!p || p === f) break; f = p } }
const original = ToolRuntime.prototype.register
ToolRuntime.prototype.register = function (definition) {
  const e = entryOf(this.ctx)
  owners.set(definition.name, e ? e.options.name + '#' + e.options.id : 'unknown')
  return original.call(this, definition)
}
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
await runSpike('P3-survey', async () => {
  const { ctx } = await bootDsh('p3survey', [], { setupProfile: link })
  const res = await fetch
  await until(() => [...ctx.agents.list?.() ?? []].length > 0 || ctx.agents.get !== undefined, 2000)
  let fishball
  await until(() => { for (const a of ctx.agents.list?.() ?? []) if (String(a.id).startsWith('session-fishball-')) fishball = a; return fishball !== undefined }, 15000)
  const global = ctx.tools.schemas().map((t) => t.name).sort()
  const mine = fishball ? ctx.tools.schemas(scopeOf(fishball.ctx)).map((t) => t.name).sort() : null
  const bundles = (await ctx.pluginManager.listBundles()).map((b) => ({ name: b.name, enabled: b.enabled, installed: b.installed, availability: b.availability, official: b.official, optional: b.optional, rows: b.rows.map((r) => r.rowId + ':' + r.moduleName), overrides: b.overrides }))
  const plugins = (await ctx.pluginManager.listPlugins()).slice(0, 400).map((p) => [p.id ?? p.entryId, p.name ?? p.moduleName, p.enabled, p.patchId ?? p.readOnlyReason])
  return { pass: fishball !== undefined, global: global.map((n) => [n, owners.get(n) ?? 'pre-wrapper']), fishballTools: mine, bundles, pluginSample: plugins.slice(0, 5), pluginCount: plugins.length, agentsApi: Object.keys(Object.getPrototypeOf(ctx.agents)) }
})
