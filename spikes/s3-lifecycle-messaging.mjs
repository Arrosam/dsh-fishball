/**
 * S3  create() with a never-registered sentinel preset id; GUI cold-resume of it fails closed without taking the writer;
 *     a live agent is reused by the controller.
 * S7  concurrent GUI resolve and our resume: no writer-held left.
 * S10 a stranded pending inbox item is requeued once (same id) and consumed once.
 * S16 message to another session: resolveAgent + steer with an agent-message relay source; a host-row tool
 *     reaches standard-preset agents and subagents.
 * S18 sessionController.create in an existing non-workspace folder runs the default preset; first relay message runs it.
 */
import fs from 'node:fs'
import path from 'node:path'
import { bootDsh, eventTypes, hostPkg, hostRow, message, model, runSpike, stage, until } from './harness.mjs'

const { scopeOf } = await hostPkg('dsh-scope')
const SENTINEL = 'fishball:assistant'
const relay = (sender) => ({ kind: 'agent-message', form: 'relay', senderSessionId: sender })

await runSpike('S3-S7-S10-S16-S18', async () => {
  const { ctx, home } = await bootDsh('s3')
  const out = {}
  const row = await hostRow(ctx, 'fishball-spike-row', ['agents', 'tools', 'sessionController'], (c) => {
    c.tools.register({
      name: 'message_fishball', description: 'Send a message to Fishball.',
      parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
      output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: String(v) }] },
      async execute() { return 'queued' },
    })
  })
  const cwd = path.join(home, 'assistant'); fs.mkdirSync(cwd, { recursive: true })
  const sessionId = 'session-fishball-s3'
  const setup = async () => {}

  stage('S3 create with sentinel')
  let handle = await row.agents.create({ sessionId, meta: { cwd, agentPreset: SENTINEL }, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup })
  model.queue(sessionId, [{ text: 'hello' }])
  handle.agent.steer(message('hi'))
  await until(() => handle.agent.status === 'idle' && model.requestsFor(sessionId).length > 0, 10000)
  const liveResolve = await ctx.sessionController.agents.resolveAgent(sessionId)
  out.S3 = { created: true, liveReused: liveResolve.agent === handle.agent, header: handle.agent.session.header.agentPreset }
  await ctx.sessions.flush(handle.agent.session)
  await handle.dispose()
  stage('S3 GUI cold resume')
  const cold = await ctx.sessionController.agents.resolveAgent(sessionId)
  out.S3.coldResume = { error: cold.error ? { code: cold.error.code, message: String(cold.error.message).slice(0, 200) } : undefined, agentLive: ctx.agents.get(sessionId) !== undefined }
  stage('S3 our resume after refused GUI resume')
  handle = await row.agents.resume({ resumeSessionId: sessionId, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup })
  out.S3.resumedAfterRefusal = handle.agent.id === sessionId
  await handle.dispose()

  stage('S7 race')
  const [gui, ours] = await Promise.allSettled([
    ctx.sessionController.agents.resolveAgent(sessionId),
    row.agents.resume({ resumeSessionId: sessionId, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup }),
  ])
  out.S7 = { gui: gui.status === 'fulfilled' ? (gui.value.error ? gui.value.error.code : 'agent') : String(gui.reason), ours: ours.status === 'fulfilled' ? 'agent' : String(ours.reason).slice(0, 200) }
  handle = ours.status === 'fulfilled' ? ours.value : await row.agents.resume({ resumeSessionId: sessionId, agentOptions: { provider: 'fishball-spike', model: 'spike-model' }, setup })
  const fishball = handle.agent

  stage('S10 stranded inbox')
  const stranded = message('stranded note', { kind: 'user' })
  fishball.inbox.append('next-step', stranded)
  await new Promise((r) => setTimeout(r, 300))
  const strandedStill = fishball.inbox.nextStep.some((m) => m.id === stranded.id) && fishball.status === 'idle'
  // Wake guard: remove and steer the SAME message.
  fishball.inbox.remove(stranded.id)
  fishball.steer(stranded)
  await until(() => fishball.status === 'running', 2000, 5)
  await until(() => fishball.status === 'idle', 10000)
  const consumedCount = fishball.session.snapshotEvents().filter((e) => e.type === 'user/message' && e.data.id === stranded.id).length
  out.S10 = { strandedStill, consumedCount, inboxEmpty: fishball.inbox.nextStep.length === 0 && fishball.inbox.nextTurn.length === 0 }

  stage('S16 message an idle ordinary session')
  const ws = path.join(home, 'ws'); fs.mkdirSync(ws, { recursive: true })
  const created = await ctx.sessionController.create({ cwd: ws })
  const target = (await ctx.sessionController.agents.resolveAgent(created.sessionId)).agent
  out.S16 = { targetPreset: created.agentPreset, targetHasMessageFishball: ctx.tools.schemas(scopeOf(target.ctx)).some((t) => t.name === 'message_fishball') }
  await ctx.sessions.flush(target.session)
  // Make it cold, then resolve (resume) and steer, as message_session will.
  await ctx.sessionController.agents.resolveAgent(created.sessionId)
  const relayMsg = message('Fishball here: please run the tests.', relay(sessionId))
  target.steer(relayMsg)
  await until(() => target.status === 'running', 2000, 5)
  await until(() => target.status === 'idle', 10000)
  const tReq = model.requestsFor(target.id).at(-1)
  const logged = target.session.snapshotEvents().find((e) => e.type === 'user/message' && e.data.id === relayMsg.id)
  out.S16.delivered = { requestSawText: JSON.stringify(tReq?.messages ?? []).includes('please run the tests'), loggedSource: logged?.data.source }

  stage('S16 subagent sees host-row tool')
  const parent = target
  model.queue(parent.id, [{ tool: 'subagent', id: 'call_sub_1', args: { description: 'spike child', prompt: 'say hi' } }], [{ text: 'ok' }])
  const beforeIds = new Set(model.requests.map((r) => r.sessionId))
  parent.steer(message('delegate'))
  await until(() => model.requests.some((r) => !beforeIds.has(r.sessionId) && r.sessionId !== parent.id), 15000)
  const childReq = model.requests.find((r) => !beforeIds.has(r.sessionId) && r.sessionId !== parent.id)
  out.S16.subagent = { childSeen: childReq !== undefined, childHasMessageFishball: (childReq?.tools ?? []).some((t) => t.name === 'message_fishball') }
  await until(() => parent.status === 'idle', 15000)

  stage('S18 start a session in an existing non-workspace folder')
  const folder = path.join(home, 'some-project'); fs.mkdirSync(folder)
  const wsBefore = ctx.workspaceRegistry.list().map((w) => w.path)
  const started = await ctx.sessionController.create({ cwd: folder })
  const startedAgent = (await ctx.sessionController.agents.resolveAgent(started.sessionId)).agent
  const first = message('Fishball here: summarise this folder.', relay(sessionId))
  startedAgent.steer(first)
  await until(() => startedAgent.status === 'running', 2000, 5)
  await until(() => startedAgent.status === 'idle', 10000)
  const wsAfter = ctx.workspaceRegistry.list().map((w) => w.path)
  out.S18 = { preset: started.agentPreset, ran: model.requestsFor(started.sessionId).length > 0, workspaceRegistered: wsAfter.includes(folder) && !wsBefore.includes(folder), byPath: (await ctx.workspaceRegistry.resolveByPath(folder))?.id ?? null, sandbox: ctx.sandboxPolicy?.modeOf?.(startedAgent.session) ?? 'n/a' }

  out.verdict = {
    S3_create: out.S3.created && out.S3.header === SENTINEL && out.S3.liveReused,
    S3_cold_refused: out.S3.coldResume.error !== undefined && !out.S3.coldResume.agentLive && out.S3.resumedAfterRefusal,
    S7_no_writer_held: out.S7.ours === 'agent',
    S10_once: out.S10.strandedStill && out.S10.consumedCount === 1 && out.S10.inboxEmpty,
    S16_relay: out.S16.delivered.requestSawText && out.S16.delivered.loggedSource?.kind === 'agent-message',
    S16_tool_everywhere: out.S16.targetHasMessageFishball && out.S16.subagent.childHasMessageFishball,
    S18_runs_default: out.S18.preset === 'standard' && out.S18.ran,
  }
  await handle.dispose()
  return { pass: Object.values(out.verdict).every(Boolean), ...out }
})