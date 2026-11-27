/**
 * S24b, S25, S26 browser fixture server (DESIGN §10c): isolated DSH Web with the messenger-host
 * fixture linked into the profile, an "assistant" session (stands in for Fishball's) and an
 * ordinary session. Into the assistant it puts: your own message, a relay from the other
 * session (as message_fishball does), a fishball-notice carrying an extra `author` field (to see
 * whether extra source fields reach the browser), and a steered message while it runs.
 * Stays up for the browser check.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, until, sleep, REPO } from './harness.mjs'

const FIXTURE = path.join(REPO, 'spikes', 'fixtures', 'messenger-host')
const NAME = 'fishball-spike-messenger-host'
const port = process.env.SPIKE_PORT ?? '3097'
const { ctx, home } = await bootDsh('s24b', [], {
  args: ['--no-open', '--port', port],
  setupProfile: async (dir) => {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    pkg.dependencies = { ...pkg.dependencies, [NAME]: 'link:' + FIXTURE }
    pkg.dsh.profile.bundles.push(NAME)
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2))
    fs.mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
    fs.symlinkSync(FIXTURE, path.join(dir, 'node_modules', NAME))
  },
})
const cwd = path.join(home, 'work'); fs.mkdirSync(cwd, { recursive: true })
await ctx.workspaceRegistry.create(cwd, 'Work')
/** An ordinary session through DSH's own controller: its id and live agent. */
async function session() {
  const { sessionId } = await ctx.sessionController.create({ cwd })
  return { sessionId, agent: (await ctx.sessionController.agents.resolveAgent(sessionId)).agent }
}
const { sessionId: otherId, agent: other } = await session()
const otherSession = { sessionId: otherId }
model.queue(otherId, [{ text: 'I am an ordinary session.' }])
other.steer(message('hello ordinary'))
await until(() => other.status === 'idle', 10000)

const { sessionId: sid, agent: assistant } = await session()
globalThis.__spikeAssistantId = sid
const idle = () => until(() => assistant.status === 'idle', 15000)
// 1. Your own message.
model.queue(sid, [{ text: 'Hi, I am the stand-in assistant.' }])
assistant.steer(message('hello assistant'))
await until(() => assistant.status === 'running', 2000, 5); await idle()
// 2. A relay from the ordinary session (message_fishball's source).
model.queue(sid, [{ text: 'Got the relay.' }])
assistant.steer(message('relay text from the ordinary session', { kind: 'agent-message', form: 'relay', senderSessionId: otherSession.sessionId }))
await until(() => assistant.status === 'running', 2000, 5); await idle()
// 3. A Fishball notice with an extra author field.
model.queue(sid, [{ text: 'Got the notice.' }])
assistant.steer(message('watch notice text', { kind: 'fishball-notice', form: 'notice', summary: 'Session finished', author: { kind: 'watch', name: 'Ordinary session', seed: otherSession.sessionId } }))
await until(() => assistant.status === 'running', 2000, 5); await idle()
// 4. A steer while running: the model is slow for this turn.
const slow = model.respond.bind(model)
let delayed = false
model.respond = (options) => { if (options.sessionId === sid && !delayed) { delayed = true; return [{ text: 'Working on it…' }] } return slow(options) }
model.queue(sid, [{ text: 'Working on it…' }], [{ text: 'Saw your steer.' }])
assistant.steer(message('first of two'))
await until(() => assistant.status === 'running', 2000, 5)
assistant.steer(message('steered while running'))
await idle()
await sleep(200)
console.log('S24B-READY ' + JSON.stringify({ assistant: sid, other: otherSession.sessionId, home }))
