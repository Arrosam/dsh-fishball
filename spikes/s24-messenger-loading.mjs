/**
 * S24 (DESIGN §10c, revision 9): how does DSH load the browser half of a package that ships as a
 * dependency of a Fishball-like bundle?
 *
 * Fixture (written fresh under .runtime/): bundle `fishball-spike-main` depends on
 * `fishball-spike-messenger` through `file:./packages/messenger`, and its patch inserts a row for
 * each. The messenger package has a no-op host half and a browser half (`dsh.client`).
 *
 * Checks, in one throwaway home:
 *   A. installBundle(main) through DSH's own plugin manager: where pnpm puts the messenger
 *      (profile root, as the profile's hoisted linker suggests), what the profile records, and,
 *      after a restart when DSH asks for one, whether the messenger row runs and its browser half
 *      is in the served boot graph.
 *   B. A row mounted in a private EntryTree (as Fishball's private tree is): is its browser half
 *      in the boot graph? (Expected no: the private tree is hidden from the host Loader.)
 *
 * Run: SPIKE_PHASE=install spikes/run.sh spikes/s24-messenger-loading.mjs, then with
 * SPIKE_PHASE=restart and SPIKE_REUSE_HOME=<home printed by the first run>.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, host, hostRow, runSpike, stage, until, REPO } from './harness.mjs'

const PHASE = process.env.SPIKE_PHASE ?? 'install'
const FIXTURE = path.join(REPO, '.runtime', 'spikes', 's24-fixture')
const MAIN = 'fishball-spike-main'
const MESSENGER = 'fishball-spike-messenger'
const PRIVATE = 'fishball-spike-private-client'

/** A package with a no-op host half and a browser half that only registers itself. */
function writeClientPackage(dir, name, extra = {}) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name, version: '0.0.1', type: 'module',
    exports: { '.': './index.js', './client': './client.js', './package.json': './package.json' },
    ...extra,
    dsh: { ...(extra.dsh ?? {}), client: { platform: 'web', inject: [] } },
  }, null, 2))
  fs.writeFileSync(path.join(dir, 'index.js'), `export const name = ${JSON.stringify(name)}\nexport function apply(ctx) { globalThis.__s24Applied = [...(globalThis.__s24Applied ?? []), ${JSON.stringify(name)}] }\n`)
  fs.writeFileSync(path.join(dir, 'client.js'), `window.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory() { return { name: ${JSON.stringify(name)}, apply() { window.__s24 = [...(window.__s24 ?? []), ${JSON.stringify(name)}] } } } })\n`)
}

function writeFixture() {
  fs.rmSync(FIXTURE, { recursive: true, force: true })
  writeClientPackage(path.join(FIXTURE, 'main', 'packages', 'messenger'), MESSENGER)
  writeClientPackage(path.join(FIXTURE, 'main'), MAIN, {
    dependencies: { [MESSENGER]: 'file:./packages/messenger' },
    files: ['index.js', 'client.js', 'cordis.patch.yml', 'packages/'],
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  })
  fs.writeFileSync(path.join(FIXTURE, 'main', 'cordis.patch.yml'), [
    '- insert:',
    `    - id: spike-messenger`,
    `      name: '${MESSENGER}'`,
    `    - id: spike-main`,
    `      name: '${MAIN}'`,
    '',
  ].join('\n'))
  writeClientPackage(path.join(FIXTURE, 'private'), PRIVATE)
}

/** Ids of the browser modules DSH serves now. */
const servedIds = (ctx) => (ctx.clientModules.graph().entries ?? []).map((entry) => entry.id)
const loaderNames = (ctx) => [...ctx.loader.entries()].filter((e) => e.fiber !== undefined && !e.disabled).map((e) => e.options.name)

await runSpike(`S24-${PHASE}`, async () => {
  if (PHASE === 'install') writeFixture()
  stage('boot')
  const { ctx, home, profileDir } = await bootDsh('s24')
  await until(() => ctx.clientModules !== undefined && ctx.pluginManager !== undefined, 20000)
  const profile = () => JSON.parse(fs.readFileSync(path.join(profileDir, 'package.json'), 'utf8'))
  const result = { home }

  if (PHASE === 'install') {
    stage('A: install')
    const change = await ctx.pluginManager.installBundle(path.join(FIXTURE, 'main'), { enabled: true })
    result.installResult = { status: change.status, restartReason: change.restartReason ?? null, diagnostics: change.diagnostics ?? change.error ?? null }
    result.profileDependencies = Object.keys(profile().dependencies ?? {}).filter((name) => name.startsWith('fishball-spike'))
    result.profileBundles = (profile().dsh?.profile?.bundles ?? []).filter((name) => name.startsWith('fishball-spike'))
    result.messengerAtProfileRoot = fs.existsSync(path.join(profileDir, 'node_modules', MESSENGER, 'package.json'))
    result.messengerNested = fs.existsSync(path.join(profileDir, 'node_modules', MAIN, 'node_modules', MESSENGER, 'package.json'))
    result.messengerIsLink = result.messengerAtProfileRoot && fs.lstatSync(path.join(profileDir, 'node_modules', MESSENGER)).isSymbolicLink()
    await until(() => servedIds(ctx).includes(MESSENGER), 5000)
    result.liveAfterInstall = { messengerServed: servedIds(ctx).includes(MESSENGER), mainServed: servedIds(ctx).includes(MAIN), messengerRow: loaderNames(ctx).includes(MESSENGER) }

    stage('B: private tree')
    const { EntryTree } = await host('@deepseek-ai/cordis-plugin-loader/lib/index.js')
    await hostRow(ctx, 's24-private-owner', [], async (rowCtx) => {
      // Same construction as src/composition.js PrivateTree: the owner's subtree pointer is restored.
      const owner = rowCtx.fiber.entry
      const subtree = owner?.subtree
      class PrivateTree extends EntryTree { constructor(c) { super(c); if (owner) { if (subtree === undefined) delete owner.subtree; else owner.subtree = subtree } } write() {} }
      const tree = new PrivateTree(rowCtx.extend({ baseUrl: rowCtx.baseUrl }))
      await tree.root.update([{ id: 'private-client', name: path.join(FIXTURE, 'private', 'index.js') }])
      globalThis.__s24Tree = tree
    })
    await until(() => (globalThis.__s24Applied ?? []).includes(PRIVATE), 5000)
    await new Promise((r) => setTimeout(r, 500))
    result.privateTree = { rowApplied: (globalThis.__s24Applied ?? []).includes(PRIVATE), served: servedIds(ctx).includes(PRIVATE) }
    result.pass = null
    result.next = `SPIKE_PHASE=restart SPIKE_REUSE_HOME=${home}`
    return result
  }

  stage('A: after restart')
  await until(() => servedIds(ctx).includes(MESSENGER), 10000)
  result.afterRestart = {
    messengerServed: servedIds(ctx).includes(MESSENGER),
    mainServed: servedIds(ctx).includes(MAIN),
    messengerRow: loaderNames(ctx).includes(MESSENGER),
    hostHalvesApplied: globalThis.__s24Applied ?? [],
    profileDependencies: Object.keys(profile().dependencies ?? {}).filter((name) => name.startsWith('fishball-spike')),
  }
  result.pass = result.afterRestart.messengerServed && result.afterRestart.messengerRow && !result.afterRestart.profileDependencies.includes(MESSENGER)
  return result
})
