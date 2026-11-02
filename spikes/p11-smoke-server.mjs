/**
 * P11 smoke server (implementer evidence, not the black-box suite): the real dsh-fishball in a
 * throwaway home, with an ordinary session that messages Fishball (message_fishball) and is
 * then forwarded to it ("Send to Fishball"), so Fishball's session holds inputs with authors.
 * Stays up for the browser check of the Messenger look (DESIGN §10c).
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, model, message, until, REPO } from './harness.mjs'

const port = process.env.SPIKE_PORT ?? '3098'
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }
const { ctx, home } = await bootDsh('p11smoke', [], {
  args: ['--no-open', '--port', port],
  setupProfile: (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    pkg.dependencies = { ...pkg.dependencies, 'dsh-fishball': 'link:' + REPO }
    pkg.dsh.profile.bundles.push('dsh-fishball')
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    fs.symlinkSync(REPO, path.join(dir, 'node_modules', 'dsh-fishball'))
  },
})
const sidOf = () => JSON.parse(fs.readFileSync(path.join(home, 'storages', 'fishball.json'), 'utf8')).global?.sessionId
let fishball
await until(() => { try { fishball = ctx.agents.get(sidOf()) } catch { fishball = undefined } return fishball !== undefined && fishball.status === 'idle' }, 60000, 200)
const idle = (agent) => until(() => agent.status === 'idle', 30000)

const cwd = path.join(home, 'work'); fs.mkdirSync(cwd, { recursive: true })
await ctx.workspaceRegistry.create(cwd, 'Work')
const { sessionId: otherId } = await ctx.sessionController.create({ cwd })
const other = (await ctx.sessionController.agents.resolveAgent(otherId)).agent
// The ordinary session's agent tells Fishball something, twice (two bubbles from one author).
model.queue(otherId, [{ tool: 'message_fishball', args: { message: 'Build finished: 2 tests failed in api-refactor.' } }], [{ tool: 'message_fishball', args: { message: 'Logs are in the run summary.' } }], [{ text: 'Told Fishball.' }])
model.queue(fishball.id, [{ text: 'Noted: 2 tests failed in **api-refactor**. I will keep an eye on it.' }])
other.steer(message('Run the build and tell Fishball how it went'))
await until(() => other.status === 'running', 3000, 5); await idle(other)
await until(() => fishball.status === 'running', 5000, 5).catch(() => {}); await idle(fishball)

await until(() => url !== undefined, 10000)
const base = new URL(url).origin
const login = await fetch(url, { redirect: 'manual' })
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
model.queue(fishball.id, [{ text: 'Thanks for forwarding it.' }])
const sent = await fetch(base + '/api/fishball/send', { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: otherId, note: 'Please watch this one.' }) })
await until(() => fishball.status === 'running', 5000, 5).catch(() => {}); await idle(fishball)
console.log('P11-READY ' + JSON.stringify({ url, fishball: fishball.id, other: otherId, sendStatus: sent.status, home }))
