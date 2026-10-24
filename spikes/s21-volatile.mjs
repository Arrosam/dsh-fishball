/** S21 a .volatile() limit changed through DSH's settings service reaches the running row without remount;
 *  an invalid value is refused and leaves the file and the running value unchanged. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, runSpike, sleep, stage, until, REPO } from './harness.mjs'
const PEER = path.join(REPO, 'spikes', 'fixtures', 'peer-plugin')
const liveValue = (v) => (v && typeof v.get === 'function' ? v.get() : v)
await runSpike('S21-volatile', async () => {
  const { ctx, profileDir } = await bootDsh('s21', [], {
    setupProfile: async (dir) => {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
      pkg.dependencies = { ...pkg.dependencies, 'fishball-spike-peer': 'link:' + PEER }
      pkg.dsh.profile.bundles.push('fishball-spike-peer')
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
      fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
      fs.symlinkSync(PEER, path.join(dir, 'node_modules', 'fishball-spike-peer'))
    },
  })
  await until(() => globalThis.__spikePeer !== undefined, 5000)
  const cfg = globalThis.__spikePeer.config
  const out = { before: liveValue(cfg.limit), applies0: globalThis.__spikePeerApplies }
  const describe = () => ctx.settings.describe().find((d) => d.ns === 'spike-peer')
  const d0 = describe()
  out.descriptor = d0 && { ns: d0.ns, value: d0.value, revision: d0.revision, applies: d0.applies }
  stage('valid update')
  await ctx.settings.update('spike-peer', { limit: 9 }, d0.revision)
  await until(() => liveValue(cfg.limit) === 9, 5000)
  await sleep(300)
  out.afterValid = { live: liveValue(cfg.limit), applies: globalThis.__spikePeerApplies, sameConfigObject: globalThis.__spikePeer.config === cfg }
  const patchFile = path.join(profileDir, 'cordis.patch.yml')
  const fileAfterValid = fs.readFileSync(patchFile, 'utf8')
  out.patchHasLimit = /limit:\s*9/.test(fileAfterValid)
  stage('invalid update')
  let invalidError
  try { await ctx.settings.update('spike-peer', { limit: 0 }, describe().revision) } catch (e) { invalidError = String(e?.message ?? e).slice(0, 300) }
  await sleep(300)
  out.afterInvalid = { error: invalidError, live: liveValue(cfg.limit), fileUnchanged: fs.readFileSync(patchFile, 'utf8') === fileAfterValid }
  stage('stale revision')
  let staleError
  try { await ctx.settings.update('spike-peer', { limit: 7 }, d0.revision) } catch (e) { staleError = String(e?.code ?? e?.message ?? e) }
  out.stale = staleError
  return { pass: out.afterValid.live === 9 && out.afterValid.applies === out.applies0 && out.patchHasLimit && invalidError !== undefined && out.afterInvalid.live === 9 && out.afterInvalid.fileUnchanged, ...out }
})
