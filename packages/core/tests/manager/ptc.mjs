import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { openHost, openSdk, sdkMissing } from './ptc-host.mjs'

const id = 'MGR-PTC'

const FIXTURE = Object.freeze({
  tempPrefix: 'fishball-core-ptc-',
  patch: 'cordis.patch.yml',
  row: 'fishball-core',
  encoding: 'utf8',
  service: 'fishballInstance',
  timeoutMs: 30_000,
  probe: 'fishball_test_read',
  marker: 'fishball nested tool marker',
  samples: Object.freeze(['one', 'two']),
  parameter: 'sample',
  bindingNamespace: 'tools',
  escalation: Object.freeze({ sandbox_permissions: 'workspace-write', justification: 'Exercise the fixture approval boundary' }),
  allowed: 'allowed-once',
  message: 'message_user',
  question: 'ask_user',
  legacyQuestion: 'ask_user_question',
  program: 'run_code',
  programDescription: 'Read a Fishball fixture value',
  guide: 'Keep the fixture taskboard current after each meaningful change.',
  section: 'fishball-test-taskboard',
  nestedSandboxDenial: 'sandbox-exec: sandbox_apply: Operation not permitted',
  events: Object.freeze({ start: 'tool/ptc-dispatch-start', result: 'tool/ptc-dispatch' }),
})

async function withWorld(t, scenario) {
  const sdk = await openSdk(t)
  const home = await mkdtemp(join(await realpath(tmpdir()), FIXTURE.tempPrefix))
  t.after(() => rm(home, { recursive: true, force: true }))
  const main = await import('../../src/main/index.js')
  const { assembleContextFor } = await sdk.host('dsh-agent')
  const { renderPrompt } = await sdk.host('dsh-system-prompt')
  const { defineTool } = await sdk.host('dsh-tools')
  const patch = join(home, FIXTURE.patch)
  const save = (config) => writeFile(patch, JSON.stringify([{ id: FIXTURE.row, config }]), FIXTURE.encoding)
  async function boot(run, { executor, beforeMount, scriptedRuntime } = {}) {
    const { ctx, close } = await openHost(sdk, home, { executor, scriptedRuntime })
    let row, disposeSetup
    async function reload() {
      disposeSetup?.()
      await row?.dispose()
      const config = JSON.parse(await readFile(patch, FIXTURE.encoding)).find(({ id }) => id === FIXTURE.row).config
      row = ctx.plugin(main, config)
      await row.await()
      const manager = ctx.get(FIXTURE.service).manager
      disposeSetup = manager.registerSetup(FIXTURE.section, (agentCtx) => {
        // The optional taskboard is external; emulate its use of the public manager setup port.
        agentCtx.systemPrompt.section({ name: FIXTURE.section, order: 1, text: FIXTURE.guide })
      })
      return manager
    }
    try {
      const preexisting = await beforeMount?.(ctx)
      const manager = await reload()
      return await run({ ctx, manager, preexisting, reload, sdk })
    } finally {
      disposeSetup?.()
      await close()
    }
  }
  const inspect = async (agent) => {
    const assembly = await agent.ctx.systemPrompt.assemble(assembleContextFor(agent))
    return { tools: assembly.tools.map(({ name }) => name), system: renderPrompt(assembly), sections: assembly.sections }
  }
  const call = async (agent, name, args) => {
    const id = randomUUID()
    const signal = AbortSignal.timeout(FIXTURE.timeoutMs)
    const { results } = await agent.ctx.tools.execute({ agent, signal, calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] })
    assert.equal(results[0]?.callId, id)
    const result = results[0].result
    return { id, error: result.isError, text: result.content.map((block) => block.text).join('\n') }
  }
  const registerProbe = (ctx, observe = () => {}) => ctx.tools.register(defineTool({
    name: FIXTURE.probe,
    description: FIXTURE.programDescription,
    parameters: { [FIXTURE.parameter]: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args) => {
      const sample = args[FIXTURE.parameter]
      observe(sample)
      return markerOf(sample)
    },
  }))
  await scenario({ home, save, boot, inspect, call, registerProbe })
}

async function managerAgent({ ctx, manager }) {
  const id = await manager.ensureSession()
  const agent = ctx.agents.get(id)
  assert.ok(agent, 'Fishball must have a live manager agent')
  return agent
}

function expectPtcPersona({ tools, sections }) {
  assert.ok(tools.includes(FIXTURE.program), 'Fishball should be offered run_code')
  // Use Fishball's prose rather than counting DSH's generic SDK instructions as its own guidance.
  const prose = sections.filter(({ name }) => !name.startsWith('tools:')).map(({ text }) => text).join('\n')
  assert.match(prose, /run_code[^\n]*(?:batch|group)[^\n]*independent/i)
  return prose
}

function expectPtc(prompt) {
  const prose = expectPtcPersona(prompt)
  const { tools, system } = prompt
  assert.ok(!tools.includes(FIXTURE.message), 'message_user should be a PTC binding, not a direct tool')
  assert.ok(system.includes(FIXTURE.message), 'message_user should remain available in the prompt')
  assert.ok(system.includes(FIXTURE.guide), 'manager contribution should still be in the prompt')
  return prose
}

function expectNative({ tools }, question = FIXTURE.question) {
  assert.ok(!tools.includes(FIXTURE.program), 'The native session should not be offered run_code')
  assert.ok(tools.includes(question), 'The session should be offered ' + question)
  const absent = question === FIXTURE.question ? FIXTURE.legacyQuestion : FIXTURE.question
  assert.ok(!tools.includes(absent), 'The session should not be offered ' + absent)
}

const probeArgs = (sample) => ({ [FIXTURE.parameter]: sample })
const markerOf = (sample) => FIXTURE.marker + ': ' + sample

/** Observe exactly one start and a successful settlement for each submitted binding. */
function expectDispatches(agent, out, samples) {
  assert.equal(out.error, false, out.text)
  const events = agent.session.snapshotEvents().filter(({ data }) => data.parentCallId === out.id)
  const starts = events.filter(({ type }) => type === FIXTURE.events.start)
  const results = events.filter(({ type }) => type === FIXTURE.events.result)
  assert.equal(events.length, samples.length * 2)
  assert.deepEqual(starts.map(({ data }) => data.arguments[FIXTURE.parameter]), samples)
  assert.equal(new Set(starts.map(({ data }) => data.subCallId)).size, samples.length)
  for (const { seq, data } of starts) {
    const settled = results.find((entry) => entry.data.subCallId === data.subCallId)
    assert.ok(settled?.seq > seq, 'every recorded dispatch should settle after its start')
    assert.equal(settled.data.name, FIXTURE.probe)
    assert.equal(settled.data.isError, false)
    assert.ok(out.text.includes(markerOf(data.arguments[FIXTURE.parameter])), out.text)
  }
}

const OPTIONS = { skip: sdkMissing, timeout: FIXTURE.timeoutMs }

caseTest(id, '', 'new Fishball manager uses real scoped PTC without changing a native session or losing prompt guidance', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({})
  await world.boot(async (host) => {
    const { ctx } = host
    world.registerProbe(ctx)
    const { agent: other } = await ctx.agents.create({ meta: { cwd: world.home } })
    const before = await world.inspect(other)
    expectNative(before, FIXTURE.legacyQuestion)
    const manager = await managerAgent(host)
    const prompt = await world.inspect(manager)
    const prose = expectPtc(prompt)
    const refused = await world.call(manager, FIXTURE.probe, probeArgs(FIXTURE.samples[0]))
    assert.equal(refused.error, true, 'rc.3 PTC must not dispatch a program-only tool directly')
    assert.deepEqual(await world.inspect(other), before)
    const direct = await world.call(other, FIXTURE.probe, probeArgs(FIXTURE.samples[0]))
    assert.equal(direct.error, false, direct.text)
    assert.equal(direct.text, markerOf(FIXTURE.samples[0]))
    assert.match(prose, /(?:check|inspect|review|verify).*results?.*(?:dependent|depend|next)/i)
    assert.ok(!prose.includes(FIXTURE.legacyQuestion), 'Fishball should not teach the old blocking tool')
    assert.ok(prose.includes(FIXTURE.question), 'Fishball should tell the model how to ask the user')
    assert.match(prose, /message_user[^\n]*(?:every reply|speak to the user)/i)
  })
}))

// Use the same fixed program and assertions with either the real Node carrier or a
// deterministic carrier that interprets only this test case (never general JavaScript).
const PROBE_PROGRAM = 'console.log(await Promise.all(' + JSON.stringify(FIXTURE.samples)
  + '.map(sample => tools.' + FIXTURE.probe + '({ ' + FIXTURE.parameter + ': sample }))))'

async function scriptedRuntime({ program, bindings }) {
  assert.equal(program, PROBE_PROGRAM)
  const binding = bindings.find(({ global }) => global === FIXTURE.bindingNamespace)
  const results = await Promise.all(FIXTURE.samples.map((sample) => binding.functions[FIXTURE.probe](probeArgs(sample))))
  return { logs: results }
}

const programArgs = Object.freeze({ code: PROBE_PROGRAM, description: FIXTURE.programDescription })

caseTest(id, '', 'Fishball rejects wider run_code before approval or dispatch without affecting unrelated PTC', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({})
  const approvals = []
  const programs = []
  const carrier = (spec) => { programs.push(spec.sandboxPolicy?.mode); return scriptedRuntime(spec) }
  await world.boot(async ({ ctx, manager }) => {
    // Only the fake request port and carrier can grant this fixture authority: no actual escalation or file writes.
    t.mock.method(ctx.approval, 'request', async (request) => { approvals.push(request.agent.id); return FIXTURE.allowed })
    world.registerProbe(ctx)
    const { agent: other } = await ctx.agents.create({ meta: { cwd: world.home } })
    const fishball = await managerAgent({ ctx, manager })
    const wider = { ...programArgs, ...FIXTURE.escalation }
    const denied = await world.call(fishball, FIXTURE.program, wider)
    assert.equal(denied.error, true, 'Fishball must not run under wider authority')
    assert.deepEqual(approvals, [], 'Fishball must not ask for outer approval')
    assert.deepEqual(programs, [], 'the denied Fishball program must not run')

    expectDispatches(fishball, await world.call(fishball, FIXTURE.program, programArgs), FIXTURE.samples)
    // This is the same valid request; an unaffected DSH session reaches approval and runs it.
    expectDispatches(other, await world.call(other, FIXTURE.program, wider), FIXTURE.samples)
    assert.deepEqual(approvals, [other.id])
    assert.deepEqual(programs, ['read-only', FIXTURE.escalation.sandbox_permissions])
  }, { executor: 'ptc', scriptedRuntime: carrier })
}))

for (const [carrier, runtime] of [['scripted', scriptedRuntime], ['installed Node', undefined]]) {
  caseTest(id, carrier, 'Fishball run_code dispatches multiple nested reads through the ' + carrier + ' PTC carrier', OPTIONS, (t) => withWorld(t, async (world) => {
    await world.save({})
    await world.boot(async (host) => {
      const manager = await managerAgent(host)
      world.registerProbe(host.ctx)
      const out = await world.call(manager, FIXTURE.program, programArgs)
      // An already-confined macOS test process cannot start another Seatbelt sandbox.
      if (runtime === undefined && out.error && out.text.includes(FIXTURE.nestedSandboxDenial)) {
        t.skip('The current sandbox denies nested Seatbelt; run from a regular terminal')
        return
      }
      expectDispatches(manager, out, FIXTURE.samples)
    }, { scriptedRuntime: runtime })
  }))
}

caseTest(id, '', 'the recorded Fishball session gets PTC on core resume, DSH resume and already-live adoption', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({})
  const id = await world.boot(async (host) => (await managerAgent(host)).id)
  await world.boot(async (host) => {
    assert.equal(host.ctx.agents.get(id), undefined, 'Fishball has not been opened by DSH')
    const agent = await managerAgent(host)
    assert.equal(agent.id, id)
    expectPtc(await world.inspect(agent))
  })
  await world.boot(async (host) => {
    const { agent } = await host.ctx.agents.resume({ resumeSessionId: id })
    assert.equal(host.manager.sessionId(), undefined, 'Fishball has not activated the DSH-resumed agent')
    expectPtcPersona(await world.inspect(agent))
    assert.equal(await managerAgent(host), agent, 'later Fishball activation keeps the DSH-resumed agent')
    expectPtc(await world.inspect(agent))
  })
  await world.boot(async (host) => {
    const agent = await managerAgent(host)
    assert.equal(agent, host.preexisting, 'Fishball must adopt the already-live DSH agent')
    expectPtc(await world.inspect(agent))
  }, { beforeMount: async (ctx) => {
    const { agent } = await ctx.agents.resume({ resumeSessionId: id })
    expectNative(await world.inspect(agent), FIXTURE.legacyQuestion)
    return agent
  } })
}))

caseTest(id, '', 'persisted ptc=false opts only Fishball out, including a resume under deployment-wide PTC', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({ ptc: false })
  const id = await world.boot(async (host) => {
    const agent = await managerAgent(host)
    const prompt = await world.inspect(agent)
    expectNative(prompt)
    assert.ok(prompt.tools.includes(FIXTURE.message), 'message_user should remain available as a direct tool')
    return agent.id
  })
  await world.boot(async (host) => {
    const before = await world.inspect(host.preexisting)
    assert.ok(before.tools.includes(FIXTURE.program), 'fixture should inherit deployment-wide PTC')
    const agent = await managerAgent(host)
    assert.equal(agent.id, id)
    expectNative(await world.inspect(agent))
    assert.deepEqual(await world.inspect(host.preexisting), before)
  }, { executor: 'ptc', beforeMount: async (ctx) => (await ctx.agents.create({ meta: { cwd: world.home } })).agent })
}))

caseTest(id, '', 'reapplying the core row keeps the live executor; a newly opened agent reads saved ptc=false', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({})
  const id = await world.boot(async (host) => (await managerAgent(host)).id)
  await world.boot(async (host) => {
    // DSH owns the resumed agent, so removing the core row need not tear down the agent.
    const live = await host.ctx.agents.resume({ resumeSessionId: id })
    assert.equal(await managerAgent(host), live.agent)
    const before = await world.inspect(live.agent)
    expectPtc(before)

    await world.save({ ptc: false })
    const manager = await host.reload()
    assert.notEqual(manager, host.manager, 'the core row must have a new manager service')
    const adopted = await managerAgent({ ...host, manager })
    assert.equal(adopted, live.agent, 'row reapply must preserve the live agent')
    assert.deepEqual(await world.inspect(adopted), before, 'composition and executor are unchanged on the live agent')
    world.registerProbe(host.ctx)
    const refused = await world.call(adopted, FIXTURE.probe, probeArgs(FIXTURE.samples[0]))
    assert.equal(refused.error, true, 'a direct probe remains blocked by PTC after reapply')

    await live.dispose()
    assert.equal(host.ctx.agents.get(id), undefined)
    const reopened = await managerAgent({ ...host, manager })
    assert.notEqual(reopened, live.agent)
    assert.equal(reopened.id, id)
    expectNative(await world.inspect(reopened))
  }, { scriptedRuntime })
}))

const REPLAY = Object.freeze({
  route: Object.freeze({ provider: 'history-fixture', model: 'scripted' }),
  oldCall: Object.freeze({ id: 'native-shadowed-call', sample: 'shadowed-native-read' }),
  retainedCall: Object.freeze({ id: 'native-retained-call', sample: 'retained-native-read' }),
  batchId: 'fresh-ptc-batch',
  firstPrompt: 'Describe this native fixture result for a future compacted conversation. ',
  firstPromptRepeats: 24,
  retainedPrompt: 'Run a second native fixture read that should remain in history.',
  resumePrompt: 'Run two fresh fixture reads in one program.',
  summary: 'Compaction checkpoint: one native fixture read already finished.',
  reply: 'Fixture turn completed.',
})

/** Only provider responses are scripted. DSH prepares every captured request and persists its events. */
async function mountReplayModel({ ctx, sdk }, script) {
  const { LlmAdapter, createUserMessage } = await sdk.host('dsh-llm')
  const model = { provider: REPLAY.route.provider, id: REPLAY.route.model, name: REPLAY.route.model, inputModalities: ['text'] }
  const inputs = []
  const replies = [...script]
  ctx.llm.registerAdapter([REPLAY.route.provider], new (class extends LlmAdapter {
    providerInfo(id) { return { id, name: id } }
    async listModels() { return [model] }
    async resolveModel() { return model }
    async prepareCall() { return { model, stream: (options) => this.stream(options) } }
    async *stream(options) {
      const isSummary = options.purpose === 'compaction'
      if (!isSummary) inputs.push({ sessionId: options.sessionId, tools: options.tools.map(({ name }) => name), messages: options.messages })
      const reply = isSummary ? { type: 'text', text: REPLAY.summary } : replies.shift()
      assert.ok(reply, 'unexpected model request')
      yield { type: 'block-start', index: 0, blockType: reply.type }
      yield { type: 'block-end', index: 0, block: reply }
      yield { type: 'finish', reason: { kind: reply.type === 'tool-call' ? 'tool-calls' : 'stop' } }
    }
  })())
  const { default: DefaultModel } = await sdk.host('dsh-agent-default-model')
  await ctx.plugin(DefaultModel, REPLAY.route).await()
  const turn = async (agent, prompt) => {
    agent.steer(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] }))
    await agent.whenIdle()
  }
  return { inputs, turn }
}

const replyBlock = () => ({ type: 'text', text: REPLAY.reply })
const toolBlock = (id, name, args) => ({ type: 'tool-call', id, name, arguments: JSON.stringify(args) })
const nativeBlock = ({ id, sample }) => toolBlock(id, FIXTURE.probe, probeArgs(sample))
const textOf = (message) => message.content.filter(({ type }) => type === 'text').map(({ text }) => text).join(' ')

function expectHistoricResult({ messages }, { id, sample }) {
  const assistant = messages.findIndex((msg) => msg.role === 'assistant' && msg.content.some((block) => block.type === 'tool-call' && block.id === id && block.name === FIXTURE.probe))
  const result = messages.findIndex((msg) => msg.role === 'tool' && msg.toolCallId === id)
  assert.ok(assistant >= 0 && result > assistant, 'the assistant call and its matching result should survive in order')
  assert.equal(messages[result].isError, false)
  assert.equal(textOf(messages[result]), markerOf(sample))
}

caseTest(id, '', 'native-to-PTC restart gives the model the same session, compacted history, and a working fresh batch', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({ ptc: false })
  const nativeReads = []
  const id = await world.boot(async (host) => {
    const model = await mountReplayModel(host, [nativeBlock(REPLAY.oldCall), replyBlock(), nativeBlock(REPLAY.retainedCall), replyBlock()])
    const { default: TokenMeter } = await host.sdk.host('dsh-token-meter')
    const { default: BasicCompaction } = await host.sdk.host('dsh-compaction-basic')
    await host.ctx.plugin(TokenMeter).await()
    await host.ctx.plugin(BasicCompaction, { auto: false }).await()
    world.registerProbe(host.ctx, (sample) => nativeReads.push(sample))
    const agent = await managerAgent(host)
    await model.turn(agent, REPLAY.firstPrompt.repeat(REPLAY.firstPromptRepeats))
    assert.ok(model.inputs[0].tools.includes(FIXTURE.probe), 'the native turn should advertise the direct fixture tool')
    expectHistoricResult(model.inputs[1], REPLAY.oldCall)
    const compacted = await host.ctx.compaction.compactNow(agent, AbortSignal.timeout(FIXTURE.timeoutMs))
    assert.ok(compacted, 'DSH should compact the first turn through its real compaction service')
    await model.turn(agent, REPLAY.retainedPrompt)
    expectHistoricResult(model.inputs.at(-1), REPLAY.retainedCall)
    return agent.id
  })
  assert.deepEqual(nativeReads, [REPLAY.oldCall.sample, REPLAY.retainedCall.sample])

  await world.save({})
  await world.boot(async (host) => {
    const executions = []
    const model = await mountReplayModel(host, [toolBlock(REPLAY.batchId, FIXTURE.program, programArgs), replyBlock()])
    world.registerProbe(host.ctx, (sample) => executions.push(sample))
    const agent = await managerAgent(host)
    assert.equal(agent.id, id)
    await model.turn(agent, REPLAY.resumePrompt)
    const [first, second] = model.inputs
    assert.equal(first.sessionId, id)
    assert.deepEqual(first.tools, [FIXTURE.program])
    assert.ok(first.messages.some((msg) => msg.source?.kind === 'compact-checkpoint' && textOf(msg).includes(REPLAY.summary)), 'the durable compaction summary should reach the model')
    assert.ok(!JSON.stringify(first.messages).includes(REPLAY.oldCall.id), 'the checkpoint should replace the shadowed native tool exchange')
    expectHistoricResult(first, REPLAY.retainedCall)
    assert.deepEqual(executions, FIXTURE.samples, 'only the two fresh calls execute after reopening')
    const result = second.messages.find((msg) => msg.role === 'tool' && msg.toolCallId === REPLAY.batchId)
    assert.ok(result, 'the model should receive the fresh batch result')
    expectDispatches(agent, { id: REPLAY.batchId, error: result.isError, text: textOf(result) }, FIXTURE.samples)
  }, { scriptedRuntime })
}))
