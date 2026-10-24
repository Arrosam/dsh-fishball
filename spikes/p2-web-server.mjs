/** Browser fixture for P2: isolated DSH Web with dsh-fishball linked, stays up for the browser check. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, REPO } from './harness.mjs'
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
await bootDsh('p2web', [], { args: ['--no-open', '--port', process.env.SPIKE_PORT ?? '3099'], setupProfile: link })
console.log('P2WEB-READY')
