/**
 * S31 (revision 10a, DESIGN §10d "Install for Fishball"): can Fishball inherit DSH's Host
 * PluginManager for its own package folder? A subclass, mounted in a scope where the
 * `pluginManager` service is isolated and `profileContext` names Fishball's folder, overrides
 * only publishAndReload (DSH's reload of the running profile) and hides itself from the browser
 * gateway (typertRemote). Checks:
 * - DSH's own pluginManager service is the same object afterwards, and DSH's profile files and
 *   the host Loader's entries are unchanged by every operation;
 * - inspect and installBundle (enabled: false) run DSH's whole process in Fishball's folder:
 *   progress events, a local folder installed as a copy (file:), not-bundle refused and undone,
 *   already-installed refused;
 * - a package with the same name as a bundle DSH ships is judged by Fishball's copy (S23) when
 *   the subclass's profile anchors installs in Fishball's folder.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { bootDsh, hostPkg, hostRow, runSpike, stage, until, REPO } from './harness.mjs'

const managerModule = await hostPkg('dsh-plugin-manager')
const PluginManager = managerModule.default ?? managerModule.PluginManager
const { initProfile, readProfileManifest } = await hostPkg('dsh-app-boot')
const FIXTURE = path.join(REPO, 'spikes', 'fixtures', 'manager-demo')
const FOLDER = '.fishball-plugins'

class FishballPluginManager extends PluginManager {
  constructor(ctx, config) {
    super(ctx, config)
    // Not served to the browser as a second `pluginManager`: Fishball serves its own routes.
    this.typertRemote = undefined
  }

  /** DSH would reload its running profile here; Fishball's catalog mounts the plugin instead. */
  async publishAndReload() {
    return { warnings: [] }
  }
}

const hash = (file) => { try { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16) } catch { return null } }

await runSpike('S31-inherit-manager', async () => {
  const { ctx, profileDir } = await bootDsh('s31')
  await until(() => ctx.pluginManager !== undefined, 20000, 100)
  const out = { hmr: ctx.get('hmr') !== undefined }
  const dshManager = ctx.pluginManager
  // cordis may hand out a fresh service proxy per read: compare what the service is, not identity.
  out.proxyPerRead = ctx.pluginManager !== ctx.pluginManager
  const isDsh = (manager) => !(manager instanceof FishballPluginManager) && manager?.profile?.dir === ctx.profileContext.dir
  const profileFiles = () => Object.fromEntries(['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].map((f) => [f, hash(path.join(profileDir, f))]))
  const loaderIds = () => [...ctx.loader.entries()].map((e) => e.options.id).sort().join(',')
  const before = { files: profileFiles(), loader: loaderIds() }

  stage('folder')
  const profile = ctx.profileContext
  const dir = path.join(path.dirname(profile.dir), FOLDER)
  initProfile(dir, [])
  const facts = { ...profile, name: FOLDER, dir, startedBundles: [], installAnchor: profile.installAnchor }

  stage('mount')
  const row = await hostRow(ctx, 'fishball-s31-row', ['loader'])
  let scoped
  try {
    scoped = row.isolate('pluginManager').extend({ profileContext: facts })
    out.scope = 'isolate+extend'
  } catch (error) {
    out.scopeError = String(error?.message ?? error).slice(0, 300)
  }
  const config = PluginManager.Config({})
  scoped.plugin(FishballPluginManager, config)
  await until(() => scoped.get('pluginManager') instanceof FishballPluginManager, 10000, 50)
  const fishball = scoped.get('pluginManager')
  out.mounted = {
    subclass: fishball instanceof FishballPluginManager,
    dshServiceUnchanged: isDsh(ctx.pluginManager) && isDsh(ctx.get('pluginManager')),
    dshProfileDir: dshManager.profile?.dir === profile.dir,
    fishballProfileDir: fishball.profile?.dir === dir,
    hiddenFromGateway: fishball.typertRemote === undefined,
  }

  const events = []
  ctx.on('plugin-manager/install-state', (e) => events.push({ type: 'state', phase: e.phase, requestId: e.requestId }))
  ctx.on('plugin-manager/install-log', (e) => events.push({ type: 'log', requestId: e.requestId, cwd: e.cwd === dir, text: String(e.text).slice(0, 60) }))
  let changes = 0
  ctx.on('plugin-manager/changed', () => { changes++ })

  stage('inspect')
  out.inspect = await fishball.inspect(FIXTURE)

  stage('install')
  const requestId = crypto.randomUUID()
  const installed = await fishball.installBundle('file:' + FIXTURE, { enabled: false, requestId })
  out.install = { application: installed.application, error: installed.error, bundle: installed.bundle, version: installed.version, changed: installed.changed }
  const manifest = readProfileManifest('dsh', dir)
  out.folder = {
    dependency: manifest.dependencies?.['fishball-spike-manager-demo'] ?? null,
    bundles: manifest.dsh?.profile?.bundles ?? null,
    copy: fs.existsSync(path.join(dir, 'node_modules', 'fishball-spike-manager-demo')) && !fs.lstatSync(path.join(dir, 'node_modules', 'fishball-spike-manager-demo')).isSymbolicLink(),
  }
  out.events = { states: events.filter((e) => e.type === 'state' && e.requestId === requestId).map((e) => e.phase), logLines: events.filter((e) => e.type === 'log' && e.requestId === requestId).length, logInFolder: events.filter((e) => e.type === 'log').every((e) => e.cwd), changedEmitted: changes }

  stage('again')
  const again = await fishball.installBundle('file:' + FIXTURE, { enabled: false })
  out.again = { application: again.application, error: again.error?.code ?? again.error }

  stage('not-bundle')
  const plain = path.join(path.dirname(profile.dir), '..', 's31-plain-' + Date.now())
  fs.mkdirSync(plain, { recursive: true })
  fs.writeFileSync(path.join(plain, 'package.json'), JSON.stringify({ name: 's31-plain', version: '1.0.0' }))
  const notBundle = await fishball.installBundle('file:' + plain, { enabled: false })
  out.notBundle = { application: notBundle.application, error: notBundle.error?.code ?? notBundle.error, leftInFolder: Object.hasOwn(readProfileManifest('dsh', dir).dependencies ?? {}, 's31-plain') }

  stage('compare')
  const after = { files: profileFiles(), loader: loaderIds() }
  out.dshUntouched = { files: JSON.stringify(before.files) === JSON.stringify(after.files), loader: before.loader === after.loader, serviceSame: isDsh(ctx.pluginManager) }
  out.listBundlesStillDsh = (await ctx.pluginManager.listBundles()).some((b) => b.name === '@deepseek-ai/dsh-web-app')

  const pass = out.mounted.subclass && out.mounted.dshServiceUnchanged && out.mounted.fishballProfileDir
    && out.install.application !== 'failed' && out.folder.dependency !== null && out.folder.copy
    && out.dshUntouched.files && out.dshUntouched.loader && out.dshUntouched.serviceSame
    && out.notBundle.leftInFolder === false
  return { pass, ...out }
})
