import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { FAKE, FAKE_LLM_MODULE } from '../../../../test/support/constants.mjs'

export const FIXTURE = Object.freeze({
  user: 'Seed the Fishball transcript',
  message: '**Opening** keep Ωmega\n\nsecond line tail',
  assistant: 'Before, 雪, after.',
  tool: 'message_user',
  call: 'test-quote-call',
  route: '/api/fishball/session',
  modelRow: 'agent-default-model',
  profile: 'fishball-quote-test',
  pollMs: 20,
  waitMs: 10000,
})

const host = (pkg, file = 'index.js') => import(pathToFileURL(join(process.env.FBTEST_DSH_RUNTIME, '@deepseek-ai', pkg, 'lib', file)))

export const name = 'fishball-quote-fixture'
export const inject = ['connection', 'tools']
let managerId
export async function apply(ctx) {
  const { defineTool } = await host('dsh-tools')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: FIXTURE.tool,
    description: 'Record a message for the quote fixture',
    parameters: { message: { type: 'string', required: true } },
    output: { schema: { type: 'json' }, render: value => ({ content: [{ type: 'text', text: value }] }) },
    async execute() { return 'Recorded' },
  })))
  ctx.effect(() => ctx.connection.fetch.register({
    path: FIXTURE.route, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: () => Response.json({ sessionId: managerId ?? null }),
  }))
}

// Test-only DSH home: use the stock Web bundle and a direct source overlay, not a package install.
// Only the manager lookup and model are scripted. The actual browser client, chat, and editor run unchanged.
async function boot() {
  const home = mkdtempSync(join(tmpdir(), 'fbquote-'))
  process.env.DSH_HOME = home
  process.on('exit', () => rmSync(home, { recursive: true, force: true }))
  const { runProfile, initializeProfileFromDefault } = await host('dsh', 'profile-boot.js')
  const { loadLayeredEnv } = await host('dsh-app-boot')
  const { createUserMessage } = await host('dsh-llm')
  const { model } = await import(FAKE_LLM_MODULE)
  initializeProfileFromDefault(FIXTURE.profile, 'web', home)
  const overlay = join(home, 'quote.patch.yml')
  writeFileSync(overlay, JSON.stringify([
    { id: FIXTURE.modelRow, config: { provider: FAKE.provider, model: FAKE.model } },
    { insert: [
      { id: 'quote-fake-model', name: FAKE_LLM_MODULE },
      { id: 'quote-fishball-page', name: process.env.FBTEST_QUOTE_PAGE ?? fileURLToPath(new URL('../../ui/fishball-page/index.js', import.meta.url)) },
    ] },
  ]))
  const { ctx, shutdown } = await runProfile({
    profile: FIXTURE.profile, environment: loadLayeredEnv('dsh'), patchFiles: [overlay], args: ['--no-open', '--port', '0'],
  })
  await ctx.plugin({ name, inject, apply })
  await ctx.settings.mutate('ui-settings-general', [{ op: 'set', path: ['welcomeNoticeVersion'], value: '2026-09-28.1' }])
  const { sessionId } = await ctx.sessionController.create({ cwd: home })
  managerId = sessionId
  const { agent } = await (ctx.sessionController.agents ?? ctx.sessionController).resolveAgent(sessionId)
  model.queue(sessionId, [{ tool: FIXTURE.tool, id: FIXTURE.call, args: { message: FIXTURE.message } }], [{ text: FIXTURE.assistant }])
  agent.steer(createUserMessage({ content: [{ type: 'text', text: FIXTURE.user }], source: { kind: 'user' } }))
  const deadline = Date.now() + FIXTURE.waitMs
  while (model.requests.filter(request => request.sessionId === sessionId).length < 2 || agent.status !== 'idle') {
    if (Date.now() >= deadline) throw new Error('Scripted transcript did not finish: ' + JSON.stringify(model.requests))
    await sleep(FIXTURE.pollMs)
  }
  process.on('message', message => {
    if (message === 'requests') process.send(model.requests.filter(request => request.sessionId === sessionId))
  })
  process.send({ sessionId })
  process.on('disconnect', () => { void shutdown.shutdown(0) })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await boot()
