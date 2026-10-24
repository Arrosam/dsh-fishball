/** S2b realistic order: the attribution wrapper is installed by a bundle listed LAST in the profile. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, runSpike, until, REPO } from './harness.mjs'
const link = (dir, name, target) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
  pkg.dsh.profile.bundles.push(name)
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(target, path.join(dir, 'node_modules', name))
}
await runSpike('S2b-attribution-real-order', async () => {
  const { ctx } = await bootDsh('s2b2', [], { setupProfile: async (dir) => {
    link(dir, 'fishball-spike-demo', path.join(REPO, 'spikes', 'fixtures', 'demo-plugin'))
    link(dir, 'fishball-spike-attrib', path.join(REPO, 'spikes', 'fixtures', 'attrib-plugin'))
  } })
  await until(() => globalThis.__spikeAttribApplied !== undefined, 5000)
  const owners = globalThis.__spikeToolOwners ?? new Map()
  const globalTools = ctx.tools.schemas().map((t) => t.name)
  const attributed = globalTools.map((n) => [n, owners.has(n) ? owners.get(n) : 'UNATTRIBUTED'])
  return { pass: attributed.every(([, o]) => o !== 'UNATTRIBUTED'), attributed }
})
