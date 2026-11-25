import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { openHost, openSdk, sdkMissing } from './ptc-host.mjs'

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
  question: 'ask_user_question',
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
  const main = await import('../src/main/index.js')
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
      return await run({ ctx, manager, preexisting, reload })
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
  const registerProbe = (ctx) => ctx.tools.register(defineTool({
    name: FIXTURE.probe,
    description: FIXTURE.programDescription,
    parameters: { [FIXTURE.parameter]: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: (args) => markerOf(args[FIXTURE.parameter]),
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

function expectNative({ tools }) {
  assert.ok(!tools.includes(FIXTURE.program), 'The native session should not be offered run_code')
  assert.ok(tools.includes(FIXTURE.question), 'The native question tool should remain available')
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

test('new Fishball manager uses real scoped PTC without changing a native session or losing prompt guidance', OPTIONS, (t) => withWorld(t, async (world) => {
  await world.save({})
  await world.boot(async (host) => {
    const { ctx } = host
    world.registerProbe(ctx)
    const { agent: other } = await ctx.agents.create({ meta: { cwd: world.home } })
    const before = await world.inspect(other)
    expectNative(before)
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
    const questionGuidance = prose.split('\n').find((line) => line.includes(FIXTURE.question) && /(?:deadline|direct|own program)/i.test(line))
    assert.ok(questionGuidance, 'Fishball must tell the model how to ask blocking questions')
    if (prompt.tools.includes(FIXTURE.question)) assert.match(questionGuidance, /direct|outside/i)
    else {
      assert.match(questionGuidance, /(?:own|separate) program/i)
      assert.match(questionGuidance, /timeout|deadline/i)
    }
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

test('Fishball rejects wider run_code before approval or dispatch without affecting unrelated PTC', OPTIONS, (t) => withWorld(t, async (world) => {
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
  test('Fishball run_code dispatches multiple nested reads through the ' + carrier + ' PTC carrier', OPTIONS, (t) => withWorld(t, async (world) => {
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

test('the recorded Fishball session gets PTC on core resume, DSH resume and already-live adoption', OPTIONS, (t) => withWorld(t, async (world) => {
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
    expectNative(await world.inspect(agent))
    return agent
  } })
}))

test('persisted ptc=false opts only Fishball out, including a resume under deployment-wide PTC', OPTIONS, (t) => withWorld(t, async (world) => {
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

test('reapplying the core row keeps the live executor; a newly opened agent reads saved ptc=false', OPTIONS, (t) => withWorld(t, async (world) => {
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
