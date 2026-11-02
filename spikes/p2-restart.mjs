/** Restart check: boot the same home twice and confirm one assistant session. */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, until, REPO } from './harness.mjs'
const link = (dir) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
  pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
  pkg.dsh.profile.bundles.push('dsh-fishball')
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
  fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
}
const { ctx, home, shutdown } = await bootDsh('restart', [], { setupProfile: link })
await until(() => ctx.agents.list().some((a) => a.session.header.agentPreset === 'fishball:assistant'), 15000)
const live = ctx.agents.list().filter((a) => a.session.header.agentPreset === 'fishball:assistant').map((a) => a.id)
const stored = await ctx.sessionPersistence.list()
const count = [...stored].filter((s) => s.header?.agentPreset === 'fishball:assistant').length
console.log(JSON.stringify({ home, live, storedFishball: count, total: stored.length }))
process.exit(0)