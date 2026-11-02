/**
 * S4  a custom source kind ({kind:'fishball', form:'notice', summary}) is accepted, persisted and survives resume;
 *     the Web chat renders notice/relay forms structurally (client code read: KNOWN_FORMS) and other kinds opaquely.
 * S13 (mechanism) the summarize() subclass output becomes the durable checkpoint the model sees after compaction.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, eventTypes, hostPkg, hostRow, message, model, runSpike, stage, until } from './harness.mjs'
const { boundContextSummary } = await hostPkg('dsh-llm')
await runSpike('S4-S13', async () => {
  const { ctx, home } = await bootDsh('s4')
  const out = {}
  const row = await hostRow(ctx, 'fishball-spike-row', ['agents'])
  const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
  const sid = 'session-fishball-s4'
  const opts = { provider: 'fishball-spike', model: 'spike-model' }
  let handle = await row.agents.create({ sessionId: sid, meta: { cwd }, agentOptions: opts })
  const source = { kind: 'fishball-notice', form: 'notice', summary: boundContextSummary('Session "Refactor billing" finished: completed. '.repeat(5)) }
  const notice = message('[watch] Session "Refactor billing" finished (completed).', source)
  stage('steer custom source')
  handle.agent.steer(notice)
  await until(() => handle.agent.status === 'running', 2000, 5)
  await until(() => handle.agent.status === 'idle', 10000)
  const req = model.requestsFor(sid).at(-1)
  out.modelSaw = JSON.stringify(req?.messages ?? []).includes('[watch] Session')
  out.summaryLength = source.summary.length
  await ctx.sessions.flush(handle.agent.session)
  await handle.dispose()
  stage('resume')
  handle = await row.agents.resume({ resumeSessionId: sid, agentOptions: opts })
  const logged = handle.agent.session.snapshotEvents().find((e) => e.type === 'user/message' && e.data.id === notice.id)
  out.afterResume = logged?.data.source
  await handle.dispose()
  return { pass: out.modelSaw && out.afterResume?.kind === 'fishball-notice' && out.summaryLength <= 120, ...out }
})
