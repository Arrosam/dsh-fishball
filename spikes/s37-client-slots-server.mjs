/**
 * S37 browser fixture server (revision 11 browser UI): isolated DSH Web with the client-slots
 * fixture linked into the profile, and these sessions, all driven by the fake model:
 * - "Fishball": a stand-in for Fishball's own session; the pile renders above its composer;
 * - "Docs" and "Parser": managed sessions frozen inside a running `ask_fishball` call;
 * - "Library": a managed session whose `ask_user_question` Fishball answered (tag);
 * - "Plan": a managed session in plan mode whose `exit_plan_mode` review Fishball approved (tag);
 * - "Mine": the user's own session (Hand over to Fishball).
 * Plus two fixture-only cards (a question card and a Fishball own-request card) so the pile shows
 * every kind. Stays up for the browser check; prints S37-READY with the ids.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, message, model, until, sleep, REPO } from './harness.mjs'

const FIXTURE = path.join(REPO, 'spikes', 'fixtures', 'client-slots')
const NAME = 'fishball-spike-client-slots'
const port = process.env.SPIKE_PORT ?? '3137'
let url
const write = process.stdout.write.bind(process.stdout)
process.stdout.write = (chunk, ...rest) => { const m = String(chunk).match(/dsh web: (\S+)/); if (m) url = m[1]; return write(chunk, ...rest) }

const { ctx, home } = await bootDsh('s37', [], {
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
const s37 = globalThis.__s37
const cwd = path.join(home, 'work'); fs.mkdirSync(cwd, { recursive: true })
await ctx.workspaceRegistry.create(cwd, 'Work')

async function session(title) {
  const { sessionId } = await ctx.sessionController.create({ cwd })
  s37.titles[sessionId] = title
  return { sessionId, agent: (await ctx.sessionController.agents.resolveAgent(sessionId)).agent }
}
const settle = (agent) => until(() => agent.status === 'idle', 15000)
const started = (agent) => until(() => agent.status === 'running', 3000, 5)

// Fishball stand-in.
const fishball = await session('Fishball')
s37.assistantId = fishball.sessionId
model.queue(fishball.sessionId, [{ text: 'Hi, I am the Fishball stand-in. Requests I cannot decide land above this composer.' }])
fishball.agent.steer(message('Fishball, look after my sessions today. You may let the docs session run npm test.'))
await started(fishball.agent); await settle(fishball.agent)

// Two managed sessions frozen inside ask_fishball. seedFor gives each card its quotes, thread and note.
const SEEDS = {}
s37.seedFor = (sessionId) => SEEDS[sessionId]
async function frozen(title, userText, call, seed) {
  const s = await session(title)
  s37.managed.add(s.sessionId)
  SEEDS[s.sessionId] = seed
  model.queue(s.sessionId, [{ text: 'I need approval first.' }, { tool: 'ask_fishball', args: call }], [{ text: 'Thanks, carrying on.' }])
  s.agent.steer(message(userText))
  await started(s.agent)
  await until(() => [...s37.cards.values()].some((c) => c.sessionId === s.sessionId), 10000)
  return s
}
const docs = await frozen('Docs', 'Update the docs and make sure the tests pass.',
  { tool: 'bash', arguments: { command: 'npm test -- --runInBand', cwd: 'packages/docs' }, quote: ['msg_1'], why: 'You asked me to make sure the tests pass after the docs change.' },
  { quotes: [{ id: 'msg_1', text: 'Update the docs and make sure the tests pass.' }], thread: [{ from: 'Fishball', text: 'Which package do the tests cover?' }, { from: 'Docs', text: 'Only packages/docs; nothing outside it.' }], note: 'Your allowance covered npm test in the docs session, but this adds --runInBand; I left it to you.' })
const parser = await frozen('Parser', 'Refactor the parser and push it when done.',
  { tool: 'bash', arguments: { command: 'git push origin parser-refactor' }, quote: ['msg_2'], why: 'You asked me to push when done.' },
  { quotes: [{ id: 'msg_2', text: 'Refactor the parser and push it when done.' }], thread: [], note: 'Pushing is outside anything you allowed me in my chat.' })

// A question Fishball answered (tag on the ask_user_question row).
const library = await session('Library')
s37.managed.add(library.sessionId); s37.fishballAnswers.add(library.sessionId)
s37.currentCall = (sessionId) => (sessionId === library.sessionId ? 'call_question_1' : undefined)
const QUESTION = { questions: [{ id: 'lib', question: 'Which date library should I use?', options: [{ label: 'date-fns (Recommended)' }, { label: 'dayjs' }] }] }
model.queue(library.sessionId, [{ tool: 'ask_user_question', args: QUESTION, id: 'call_question_1' }], [{ text: 'Going with date-fns.' }])
library.agent.steer(message('Pick a date library and add it.'))
await started(library.agent); await settle(library.agent)

// A plan review Fishball approved (tag on the exit_plan_mode row).
const plan = await session('Plan')
s37.managed.add(plan.sessionId); s37.fishballAnswers.add(plan.sessionId)
// Plan mode is mounted per agent preset, so it is entered through DSH's own `/plan` command.
const planState = await ctx.commands.execute(plan.agent, '/plan', [], new AbortController().signal).then((r) => r?.status ?? r?.kind ?? 'ran', (e) => 'error: ' + e.message)
model.queue(plan.sessionId, [{ tool: 'exit_plan_mode', args: { plan: '# Split the parser\n\n1. Move the lexer out.\n2. Add tests.' }, id: 'call_plan_1' }], [{ text: 'Plan approved; starting.' }])
plan.agent.steer(message('Plan how to split the parser.'))
await started(plan.agent); await settle(plan.agent)

// The user's own session.
const mine = await session('Mine')
model.queue(mine.sessionId, [{ text: 'Done: this one is yours.' }])
mine.agent.steer(message('A session of my own.'))
await started(mine.agent); await settle(mine.agent)

// Fixture-only cards: a question that went to the pile, and one of Fishball's own requests.
s37.cards.set('fixture-question', { id: 'fixture-question', kind: 'question', sessionId: library.sessionId, callId: null, tool: 'ask_user_question', question: 'Should I also remove moment.js from package.json?', arguments: {}, why: null, quotes: [], thread: [], note: 'Auto mode: nothing you said covers this, so it is yours.' })
s37.cards.set('fixture-fishball', { id: 'fixture-fishball', kind: 'fishball', sessionId: fishball.sessionId, callId: null, tool: 'add_plugin', arguments: { spec: 'dsh-plugin-weather@1.2.0' }, why: 'You asked me for a daily weather note.', quotes: [], thread: [], note: null, settle: () => { s37.cards.delete('fixture-fishball'); s37.changed() } })
s37.changed()
await sleep(300)

const workspaces = ctx.workspaceRegistry.list().map((w) => ({ title: w.title, path: w.path, sessions: w.sessionIds.length }))
console.log('S37-READY ' + JSON.stringify({ url, workspaces, home, planState, fishball: fishball.sessionId, docs: docs.sessionId, parser: parser.sessionId, library: library.sessionId, plan: plan.sessionId, mine: mine.sessionId, tags: s37.tags, log: s37.log }))
globalThis.__s37Sessions = { fishball, docs, parser, library, plan, mine }
