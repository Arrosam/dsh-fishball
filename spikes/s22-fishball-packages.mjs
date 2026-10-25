/**
 * S22: can Fishball install a plugin package into its own folder under DSH's profiles tree
 * (`<profilesDir>/.fishball`) and import it so that its peer imports resolve to the host's
 * installation packages (same module instances), while the active profile's packages stay out?
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { bootDsh, runSpike, hostPkg, REPO } from './harness.mjs'

await runSpike('S22-fishball-packages', async () => {
  const { ctx } = await bootDsh('s22')
  const profilesDir = ctx.pluginPackages?.resolution?.profilesDir
  const dir = path.join(profilesDir, '.fishball')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fishball-plugins', private: true, dependencies: {} }))
  fs.writeFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  execFileSync('pnpm', ['add', 'file:' + path.join(REPO, 'spikes', 'fixtures', 'peer-plugin')], { cwd: dir, stdio: 'ignore' })
  const entry = path.join(dir, 'node_modules', 'fishball-spike-peer', 'index.js')
  const { ModuleLoader } = await hostPkg('cordis-plugin-loader')
  const internal = ModuleLoader.fromInternal()
  const parent = pathToFileURL(path.join(dir, 'node_modules', 'fishball-spike-peer', 'package.json')).href
  const resolved = internal.version === 'v2' ? internal.resolveSync(parent, { specifier: 'fishball-spike-peer', attributes: {} }) : internal.resolveSync('fishball-spike-peer', parent, {})
  const mod = await import(resolved.url)
  const scope = await hostPkg('dsh-scope')
  // Its own peer import must be the host's instance: compare through a re-export probe.
  const peerScope = await import(internal.version === 'v2' ? internal.resolveSync(parent, { specifier: '@deepseek-ai/dsh-scope', attributes: {} }).url : internal.resolveSync('@deepseek-ai/dsh-scope', parent, {}).url)
  return {
    pass: typeof mod.apply === 'function' && peerScope.createScope === scope.createScope && resolved.url === pathToFileURL(fs.realpathSync(entry)).href,
    profilesDir, resolved: resolved.url, sameScope: peerScope.createScope === scope.createScope,
  }
})
