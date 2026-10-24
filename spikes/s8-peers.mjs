/** S8 a linked package resolves zod, dsh-storage-domain, dsh-scope and schemastery as peers; domain under $DSH_HOME/storages. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, runSpike, stage, until, REPO } from './harness.mjs'
const PEER = path.join(REPO, 'spikes', 'fixtures', 'peer-plugin')
await runSpike('S8-peers', async () => {
  const { ctx, home } = await bootDsh('s8', [], {
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
  const found = []
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.includes('fishball_spike')) found.push(path.relative(home, p)) } }
  if (fs.existsSync(path.join(home, 'storages'))) walk(path.join(home, 'storages'))
  const v = globalThis.__spikePeer
  return { pass: v?.ok === true && v?.read?.n === 1 && found.length > 0, peer: v && { ok: v.ok, read: v.read, limit: typeof v.config.limit }, files: found }
})
