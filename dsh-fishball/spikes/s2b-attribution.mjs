/**
 * S2b each tool can be traced to the plugin row that registered it.
 * Method: before any plugin row mounts (a host row loaded first, as the fishball row's `prepare` stage would be
 * too late), wrap ToolRuntime.prototype.register so each registration records the calling context's fiber entry.
 * This spike checks whether a wrapper installed AFTER boot attributes later registrations (plugins mounted later),
 * and whether the registry's own state can be scanned for tools registered before the wrapper.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, hostRow, runSpike, stage, REPO } from './harness.mjs'

const { ToolRuntime } = await hostPkg('dsh-tools')
const DEMO = path.join(REPO, 'spikes', 'fixtures', 'demo-plugin')

/** The loader entry (plugin row) that owns a context's fiber, walking up to the nearest entry. */
function entryOf(ctx) {
  let fiber = ctx.fiber
  while (fiber) { if (fiber.entry) return fiber.entry; const parent = fiber.parent?.fiber; if (!parent || parent === fiber) break; fiber = parent }
  return undefined
}

await runSpike('S2b-attribution', async () => {
  const owners = new Map()
  const original = ToolRuntime.prototype.register
  ToolRuntime.prototype.register = function (definition) {
    const entry = entryOf(this.ctx)
    owners.set(definition.name, entry ? { id: entry.id, name: entry.options.name } : { id: null })
    return original.call(this, definition)
  }
  stage('boot with wrapper installed before the tree mounts')
  const { ctx } = await bootDsh('s2b', [], {
    setupProfile: async (dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      pkg.dependencies = { ...pkg.dependencies, 'fishball-spike-demo': 'link:' + DEMO }
      pkg.dsh.profile.bundles.push('fishball-spike-demo')
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      fs.symlinkSync(DEMO, path.join(dir, 'node_modules', 'fishball-spike-demo'))
    },
  })
  const globalTools = ctx.tools.schemas().map((t) => t.name)
  const attributed = globalTools.map((n) => [n, owners.get(n)])
  return {
    pass: owners.get('demo_echo')?.name === 'fishball-spike-demo' && attributed.every(([, o]) => o && o.id),
    note: 'prototype wrapper installed before boot; in production the fishball row loads after other rows, so see verdict',
    attributed,
  }
})
