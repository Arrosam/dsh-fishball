/**
 * S23 (review H3): a package installed in Fishball's folder under the same name as a package the
 * DSH installation ships. Which copy does bundleManifest read, and which copy does a bare-name
 * resolve from inside the package select?
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { bootDsh, runSpike, hostPkg, REPO } from './harness.mjs'

await runSpike('S23-same-name', async () => {
  const { ctx } = await bootDsh('s23')
  const resolution = ctx.pluginPackages?.resolution
  const shipped = resolution.entries.find((e) => e.scope === 'installation' && e.name.startsWith('@deepseek-ai/dsh-experimental-'))
  const name = shipped.name
  const fake = path.join(REPO, '.runtime', 's23-fake')
  fs.rmSync(fake, { recursive: true, force: true })
  fs.mkdirSync(fake, { recursive: true })
  fs.writeFileSync(path.join(fake, 'package.json'), JSON.stringify({ name, version: '9.9.9', type: 'module', exports: { '.': './index.js' }, dsh: { bundle: { patch: './cordis.patch.yml' } }, fishballMarker: true }))
  fs.writeFileSync(path.join(fake, 'cordis.patch.yml'), '- insert:\n    - id: s23\n      name: ' + JSON.stringify(name) + '\n')
  fs.writeFileSync(path.join(fake, 'index.js'), 'export const marker = "fishball-copy"\n')
  const dir = path.join(resolution.profilesDir, '.fishball-plugins')
  const boot = await hostPkg('dsh-app-boot')
  boot.initProfile(dir, [])
  execFileSync('pnpm', ['add', 'file:' + fake], { cwd: dir, stdio: 'ignore' })
  const ops = await import(pathToFileURL(path.join(process.env.DSH_RUNTIME_ROOT ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules', '@deepseek-ai/dsh-plugin-manager/lib/types/operations.js')).href)
  const manifest = ops.bundleManifest(name, dir, ctx.profileContext.installAnchor)
  const { ModuleLoader } = await hostPkg('cordis-plugin-loader')
  const internal = ModuleLoader.fromInternal()
  const pkgDir = path.join(dir, 'node_modules', name)
  const parent = pathToFileURL(path.join(pkgDir, 'package.json')).href
  const resolve = (specifier) => internal.version === 'v1' ? internal.resolveSync(specifier, parent, {}).url : internal.resolveSync(parent, { specifier, attributes: {} }).url
  const fromPackage = resolve(name)
  const own = pathToFileURL(fs.realpathSync(path.join(pkgDir, 'index.js'))).href
  return {
    name,
    manifestIsFishballCopy: manifest?.fishballMarker === true,
    bareResolveIsFishballCopy: fromPackage === own,
    fromPackage, own,
    pass: true,
  }
})