/**
 * S30 (revision 10, DESIGN §10d): does mounting a private-tree row again with a new config
 * hand the plugin the new values, leave the other private rows running, and refuse an invalid
 * config without touching the other rows? The private tree is the same EntryTree shape and
 * update call Fishball uses (src/composition.js mountRows: tree.root.update(prepareProfileEntries)).
 * A Fishball turn is not involved: Fishball only calls this in its idle phase (§4), as P3 checked
 * for plugin switches.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, hostPkg, hostRow, runSpike, stage, REPO } from './harness.mjs'

const { EntryTree } = await hostPkg('cordis-plugin-loader')
const { prepareProfileEntries } = await hostPkg('dsh-app-boot')
const { auditRows } = await hostPkg('dsh-agent-preset-registry')

class PrivateTree extends EntryTree {
  constructor(ctx) {
    const owner = ctx.fiber.entry; const subtree = owner?.subtree; const subgroup = owner?.subgroup
    super(ctx)
    if (owner !== undefined) { if (subtree === undefined) delete owner.subtree; else owner.subtree = subtree; if (subgroup === undefined) delete owner.subgroup; else owner.subgroup = subgroup }
  }
  write() {}
}
const FIXTURES = { 'fishball-spike-settings': 'settings-plugin', 'fishball-spike-demo': 'demo-plugin' }

await runSpike('S30-settings-remount', async () => {
  const { ctx } = await bootDsh('s30', [], {
    setupProfile: (dir) => {
      // Installed in the profile but not selected: they run only in the private tree.
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      for (const [name, folder] of Object.entries(FIXTURES)) {
        const target = path.join(REPO, 'spikes', 'fixtures', folder)
        pkg.dependencies = { ...pkg.dependencies, [name]: 'link:' + target }
        fs.symlinkSync(target, path.join(dir, 'node_modules', name))
      }
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    },
  })
  stage('tree')
  const rowCtx = await hostRow(ctx, 'fishball-spike-s30-row', ['loader'])
  const tree = new PrivateTree(rowCtx)
  const rows = (settings) => [
    { id: 'fbo-settings--spike-settings', name: 'fishball-spike-settings', config: { greeting: 'hello', ...settings } },
    { id: 'fbo-demo--spike-demo', name: 'fishball-spike-demo', config: {} },
  ]
  const mount = async (settings) => {
    await tree.root.update(prepareProfileEntries(rowCtx, rows(settings), rowCtx.baseUrl))
    const audit = await auditRows(tree)
    return { failed: audit.failed.map((f) => f.entry?.options?.id ?? f.id ?? String(f)), fibers: new Map([...tree.entries()].map((e) => [e.options.id, e.fiber])) }
  }
  const out = {}
  const first = await mount({})
  out.first = { applies: [...globalThis.__s30], demoApplies: globalThis.__spikeDemoApplies, failed: first.failed }

  stage('ordinary change')
  const second = await mount({ limit: 7 })
  out.ordinaryChange = {
    applies: globalThis.__s30.slice(1),
    demoApplies: globalThis.__spikeDemoApplies,
    demoFiberKept: second.fibers.get('fbo-demo--spike-demo') === first.fibers.get('fbo-demo--spike-demo'),
    settingsFiberReplaced: second.fibers.get('fbo-settings--spike-settings') !== first.fibers.get('fbo-settings--spike-settings'),
    failed: second.failed,
  }

  stage('volatile change')
  const before = globalThis.__s30.length
  const third = await mount({ limit: 7, live: 'two' })
  const live = globalThis.__s30config?.live
  out.volatileChange = {
    newApplies: globalThis.__s30.slice(before),
    liveValueNow: typeof live?.get === 'function' ? live.get() : live,
    demoFiberKept: third.fibers.get('fbo-demo--spike-demo') === first.fibers.get('fbo-demo--spike-demo'),
  }

  stage('invalid change')
  const beforeInvalid = globalThis.__s30.length
  let invalid
  try { const fourth = await mount({ limit: 'many' }); invalid = { failed: fourth.failed, demoFiberKept: fourth.fibers.get('fbo-demo--spike-demo') === first.fibers.get('fbo-demo--spike-demo'), newApplies: globalThis.__s30.slice(beforeInvalid) } } catch (error) { invalid = { threw: String(error?.message ?? error).slice(0, 200) } }
  out.invalidChange = invalid

  stage('back to valid')
  const fifth = await mount({ limit: 5 })
  out.recovered = { failed: fifth.failed, last: globalThis.__s30.at(-1) }

  const pass = out.ordinaryChange.applies.at(-1)?.limit === 7
    && out.ordinaryChange.demoFiberKept
    && out.volatileChange.demoFiberKept
    && out.recovered.last?.limit === 5
  return { pass, ...out }
})
