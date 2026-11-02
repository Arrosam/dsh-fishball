/**
 * S28 browser fixture server (DESIGN §10d): isolated DSH Web with the manager-host fixture
 * and the demo bundle linked into the profile. Stays up for the browser check.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, REPO } from './harness.mjs'

const LINKS = { 'fishball-spike-manager-host': path.join(REPO, 'spikes', 'fixtures', 'manager-host'), 'fishball-spike-demo': path.join(REPO, 'spikes', 'fixtures', 'demo-plugin') }
const port = process.env.SPIKE_PORT ?? '3096'
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
await bootDsh('s28', [], {
  args: ['--no-open', '--port', port],
  setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    for (const [name, target] of Object.entries(LINKS)) {
      pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
      pkg.dsh.profile.bundles.push(name)
      fs.symlinkSync(target, path.join(dir, 'node_modules', name))
    }
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  },
})
await new Promise((r) => setTimeout(r, 1500))
console.log('S28-READY ' + JSON.stringify({ url }))
