import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { until } from 'fishball-test-helpers/wait'
import { SEAM_PAGE_STREAM } from 'fishball-shared/ui-seam'
import { FORM, batch, batchAnswers, freeBatch, freeAnswers } from 'fishball-test-helpers/manager-question-cards'
import { openHost, openSdk, sdkMissing } from './ptc-host.mjs'

const id = 'MGR-QUESTION'

const HOST = Object.freeze({
  tempPrefix: 'fishball-question-cards-', service: 'fishballInstance', timeout: 30_000,
  callBudget: 3_000, get: 'GET', post: 'POST', userMessage: 'user/message', user: 'user',
  carrierDescription: 'Open a question card without waiting', namespace: 'tools',
  model: { provider: 'question-card-fixture', model: 'scripted' }, reply: 'Answer received.',
})
const LONG = Object.freeze({
  notes: { ...FORM.free, id: 'notes' },
  skipped: { id: 'release-date', question: 'When should the release start?', options: [{ label: 'Today' }] },
})
const options = { skip: sdkMissing, timeout: HOST.timeout }
const textOf = ({ content }) => content.filter(({ type }) => type === 'text').map(({ text }) => text).join('\n')

async function withWorld(t, scenario) {
  const sdk = await openSdk(t)
  const home = await mkdtemp(join(await realpath(tmpdir()), HOST.tempPrefix))
  t.after(() => rm(home, { recursive: true, force: true }))
  const main = await import('../../src/main/index.js')
  const { assembleContextFor } = await sdk.host('dsh-agent')
  async function boot(run, { ptc = false, scriptedRuntime, modelHook, autoOpen = true } = {}) {
    const routes = new Map()
    const registerFetch = ({ path, methods, fetch }) => {
      const keys = methods.map((method) => method + ' ' + path)
      for (const key of keys) routes.set(key, fetch)
      return () => keys.forEach((key) => routes.delete(key))
    }
    const { ctx, close } = await openHost(sdk, home, { scriptedRuntime, registerFetch })
    let row
    const requests = await captureModel({ ctx, sdk }, modelHook)
    const mount = async () => {
      await row?.dispose()
      row = ctx.plugin(main, { ptc })
      await row.await()
    }
    const ensure = async () => {
      const sessionId = await ctx.get(HOST.service).manager.ensureSession()
      const manager = ctx.agents.get(sessionId)
      assert.ok(manager, 'Fishball must open its manager session')
      return manager
    }
    const reload = async () => { await mount(); return ensure() }
    const request = (method, path, body) => {
      const fetch = routes.get(method + ' ' + path)
      assert.ok(fetch, 'Fishball must register ' + method + ' ' + path)
      const signal = AbortSignal.timeout(HOST.callBudget)
      return fetch(new Request(FORM.origin + path, { method, signal, body: body === undefined ? undefined : JSON.stringify(body) }))
    }
    const withAsksStream = async (run) => {
      const response = await request(HOST.get, SEAM_PAGE_STREAM.route)
      assert.ok(response.ok, 'page stream request was refused')
      const reader = response.body.getReader()
      const next = async (accept = () => true) => {
        // Other public page topics may arrive before the asks snapshot.
        for (;;) {
          const { value, done } = await reader.read()
          assert.ok(!done, 'page stream closed without the expected asks frame')
          const data = new TextDecoder().decode(value).match(/^data: (.+)$/m)?.[1]
          if (data === undefined) continue
          const { topic, frame } = JSON.parse(data)
          if (topic === SEAM_PAGE_STREAM.topic.asks && accept(frame)) return frame
        }
      }
      try { return await run(next) } finally { await reader.cancel() }
    }
    const snapshot = () => withAsksStream((next) => next())
    const answer = (cardId, answers) => request(HOST.post, FORM.answer, { cardId, answers })
    try {
      await mount()
      return await run({ ctx, requests, manager: autoOpen ? await ensure() : undefined, reload, snapshot, answer, withAsksStream })
    } finally { await close() }
  }
  const inspect = (agent) => agent.ctx.systemPrompt.assemble(assembleContextFor(agent))
  await scenario({ sdk, home, boot, inspect })
}

async function call(agent, name, args) {
  const id = randomUUID()
  const { results } = await agent.ctx.tools.execute({
    agent, signal: AbortSignal.timeout(HOST.callBudget),
    calls: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }],
  })
  assert.equal(results[0]?.callId, id)
  return results[0].result
}

function cardIdOf(out) {
  assert.equal(out.isError, false, textOf(out))
  const value = JSON.parse(textOf(out))
  assert.ok(typeof value.cardId === 'string' && value.cardId.length > 0, 'tool must return a non-empty card id')
  assert.deepEqual(value, { cardId: value.cardId }, 'tool must not return the answer or other fields')
  return value.cardId
}

function expectPending({ managerSessionId, cards }, sessionId, expected) {
  assert.equal(managerSessionId, sessionId)
  const pending = cards.filter(({ state }) => state === FORM.open)
  assert.equal(pending.length, expected.length, 'unexpected pending card count')
  for (const { cardId, questions } of expected) {
    const card = pending.find((item) => item.cardId === cardId)
    assert.ok(card, 'expected the same pending card id on the wire: ' + cardId)
    assert.equal(card.handle, cardId)
    assert.equal(card.kind, FORM.kind)
    assert.equal(card.sessionId, sessionId)
    assert.deepEqual(card.questions, questions)
  }
}

const userMessages = (agent) => agent.session.snapshotEvents()
  .filter(({ type, data }) => type === HOST.userMessage && data.source?.kind === HOST.user).map(({ data }) => data)
const userInputs = ({ messages }) => messages.filter(({ role, source }) => role === HOST.user && source?.kind === HOST.user)

async function captureModel({ ctx, sdk }, onRequest = () => {}) {
  const { LlmAdapter } = await sdk.host('dsh-llm')
  const { default: DefaultModel } = await sdk.host('dsh-agent-default-model')
  const requests = []
  const model = { provider: HOST.model.provider, id: HOST.model.model, name: HOST.model.model, inputModalities: ['text'] }
  ctx.llm.registerAdapter([HOST.model.provider], new (class extends LlmAdapter {
    providerInfo(id) { return { id, name: id } }
    async listModels() { return [model] }
    async resolveModel() { return model }
    async prepareCall() { return { model, stream: (request) => this.stream(request) } }
    async *stream(request) {
      requests.push(request)
      await onRequest(request)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: HOST.reply } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  })())
  await ctx.plugin(DefaultModel, HOST.model).await()
  return requests
}

function expectUserAnswer(message, expected) {
  assert.equal(message?.role, HOST.user)
  assert.equal(message.source?.kind, HOST.user)
  const text = textOf(message)
  const at = text.indexOf('{')
  assert.ok(at > 0, 'normal user message should introduce the card answer before its JSON payload')
  assert.deepEqual(JSON.parse(text.slice(at)), expected)
}

caseTest(id, '', 'native Fishball offers only its own ask_user; an ordinary DSH session retains its native question tool', options, (t) => withWorld(t, async ({ boot, home, inspect }) => {
  await boot(async ({ ctx, manager, snapshot }) => {
    const { agent: other } = await ctx.agents.create({ meta: { cwd: home } })
    const offered = async (agent) => (await inspect(agent)).tools.map(({ name }) => name)
    const otherTools = await offered(other)
    assert.ok(otherTools.includes(FORM.legacy), 'ordinary DSH sessions must retain ask_user_question')
    assert.ok(!otherTools.includes(FORM.ask), 'ask_user must not leak to ordinary DSH sessions')
    assert.equal((await call(other, FORM.ask, { questions: freeBatch })).isError, true, 'ordinary direct invocation must be refused')
    const fishballTools = await offered(manager)
    assert.ok(fishballTools.includes(FORM.ask), 'native Fishball must advertise ask_user')
    assert.ok(!fishballTools.includes(FORM.legacy), 'Fishball must not advertise the blocking question tool')
    assert.equal((await call(manager, FORM.legacy, { questions: freeBatch })).isError, true, 'Fishball must reject invocation of the legacy tool')
    expectPending(await snapshot(), manager.id, [])
  })
}))

caseTest(id, '', 'PTC ask_user returns a cardId inside the program before any user answer', options, (t) => withWorld(t, async ({ boot, inspect }) => {
  // Run the installed executor and its SDK dispatch, substituting only the process carrier
  // because a sandboxed macOS test cannot always start the Node carrier's nested Seatbelt.
  const program = 'console.log(JSON.stringify(await tools.' + FORM.ask + '(' + JSON.stringify({ questions: freeBatch }) + ')))'
  let sdkValue
  const scriptedRuntime = async ({ program: received, bindings }) => {
    assert.equal(received, program)
    const binding = bindings.find(({ global }) => global === HOST.namespace)
    assert.equal(typeof binding.functions[FORM.legacy], 'undefined', 'PTC must not bind the blocking question tool')
    assert.equal(typeof binding.functions[FORM.ask], 'function', 'PTC should expose tools.ask_user')
    sdkValue = await binding.functions[FORM.ask]({ questions: freeBatch })
    return { logs: [JSON.stringify(sdkValue)] }
  }
  await boot(async ({ ctx, manager, snapshot, answer }) => {
    const { tools } = await inspect(manager)
    assert.ok(tools.some(({ name }) => name === FORM.program), 'manager must offer the program runner')
    assert.ok(!tools.some(({ name }) => name === FORM.legacy), 'manager must not offer the blocking tool directly')
    const out = await call(manager, FORM.program, { code: program, description: HOST.carrierDescription })
    assert.equal(out.isError, false, textOf(out))
    assert.ok(sdkValue?.cardId, 'the program did not get a card id before submission')
    assert.deepEqual(sdkValue, { cardId: sdkValue.cardId })
    expectPending(await snapshot(), manager.id, [{ cardId: sdkValue.cardId, questions: freeBatch }])
    assert.deepEqual(userMessages(manager), [], 'filing a question must not fabricate user input')

    const skip = [{ id: FORM.free.id, selected: [] }]
    const logs = []
    ctx.logger.exporter({ export: ({ name, type, args }) => logs.push({ name, type, args }) })
    const response = await answer(sdkValue.cardId, skip)
    assert.equal(response.ok, true, 'native empty selection means skipped, not malformed: HTTP ' + response.status + ' ' + await response.text() + '\n' + JSON.stringify(logs))
    await manager.whenIdle()
    expectPending(await snapshot(), manager.id, [])
    assert.equal(userMessages(manager).length, 1, 'one normal user message, excluding DSH context events')
    expectUserAnswer(userMessages(manager)[0], { cardId: sdkValue.cardId, answers: skip })
  }, { ptc: true, scriptedRuntime })
}))

caseTest(id, '', 'native cards survive reload and restart, and settle once through ordinary user input in the original session', options, (t) => withWorld(t, async ({ boot, home }) => {
  const { sessionId, multi, free } = await boot(async ({ manager, reload, snapshot }) => {
    expectPending(await snapshot(), manager.id, [])
    for (const [label, questions] of [['zero questions', []], ['duplicate question ids', [FORM.first, FORM.free]]]) {
      const result = await call(manager, FORM.ask, { questions })
      assert.equal(result.isError, true, label + ' must not file a card: ' + textOf(result))
      expectPending(await snapshot(), manager.id, [])
    }

    const multi = { cardId: cardIdOf(await call(manager, FORM.ask, { questions: batch })), questions: batch }
    const free = { cardId: cardIdOf(await call(manager, FORM.ask, { questions: freeBatch })), questions: freeBatch }
    assert.notEqual(multi.cardId, free.cardId, 'each card keeps an independent id even when a question id is reused')
    assert.deepEqual(userMessages(manager), [], 'no user answered either card before the returns')
    expectPending(await snapshot(), manager.id, [multi, free])
    const reopened = await reload()
    assert.equal(reopened.id, manager.id)
    expectPending(await snapshot(), reopened.id, [multi, free])
    return { sessionId: manager.id, multi, free }
  })

  await boot(async ({ ctx, manager, requests: modelInputs, snapshot, answer, withAsksStream }) => {
    const { agent: other } = await ctx.agents.create({ meta: { cwd: home } })
    const initialUserMessageCount = userMessages(manager).length
    assert.equal(manager.id, sessionId)
    expectPending(await snapshot(), sessionId, [multi, free])

    // Exact question coverage is independent of card existence and answer field type.
    for (const [label, cardId, answers] of [
      ['unknown card', randomUUID(), batchAnswers],
      ['empty answer batch', multi.cardId, []],
      ['partial batch', multi.cardId, batchAnswers.slice(0, 1)],
      ['duplicate question id', multi.cardId, [batchAnswers[0], batchAnswers[0]]],
      ['answers belong to another card', free.cardId, batchAnswers],
      ['malformed selected field', free.cardId, [{ id: FORM.free.id, selected: FORM.text }]],
    ]) {
      assert.equal((await answer(cardId, answers)).ok, false, label)
      expectPending(await snapshot(), sessionId, [multi, free])
      assert.equal(userMessages(manager).length, initialUserMessageCount, label)
    }

    const freePayload = { cardId: free.cardId, answers: freeAnswers }
    await withAsksStream(async (next) => {
      expectPending(await next(), sessionId, [multi, free])
      assert.equal((await answer(freePayload.cardId, freePayload.answers)).ok, true, 'the later-filed card should settle first')
      const settled = await next(({ cards }) => !cards.some(({ cardId, state }) => cardId === free.cardId && state === FORM.open))
      expectPending(settled, sessionId, [multi])
    })
    await manager.whenIdle()
    assert.equal(userMessages(manager).length, initialUserMessageCount + 1)
    expectUserAnswer(userMessages(manager).at(-1), freePayload)
    assert.equal(modelInputs.length, 1, 'answer must enter the normal manager model turn')
    assert.equal(modelInputs[0].sessionId, sessionId)
    expectUserAnswer(userInputs(modelInputs[0]).at(-1), freePayload)
    assert.deepEqual(userMessages(other), [], 'another session must not receive the answer')

    const multiPayload = { cardId: multi.cardId, answers: batchAnswers }
    assert.equal((await answer(multiPayload.cardId, multiPayload.answers)).ok, true)
    await manager.whenIdle()
    expectPending(await snapshot(), sessionId, [])
    assert.equal(userMessages(manager).length, initialUserMessageCount + 2)
    expectUserAnswer(userMessages(manager).at(-1), multiPayload)
    assert.equal((await answer(multiPayload.cardId, multiPayload.answers)).ok, false, 'settled cards refuse replay')
    assert.equal(userMessages(manager).length, initialUserMessageCount + 2)
  })

  await boot(async ({ manager, snapshot }) => {
    assert.equal(manager.id, sessionId)
    expectPending(await snapshot(), sessionId, [])
    expectUserAnswer(userMessages(manager).at(-2), { cardId: free.cardId, answers: freeAnswers })
    expectUserAnswer(userMessages(manager).at(-1), { cardId: multi.cardId, answers: batchAnswers })
  })
}))

caseTest(id, '', 'a four-question batch returns before submission and delivers one user message including the skipped id', options, (t) => withWorld(t, async ({ boot }) => {
  await boot(async ({ manager, snapshot, answer }) => {
    const questions = [...batch, LONG.notes, LONG.skipped]
    const cardId = cardIdOf(await call(manager, FORM.ask, { questions }))
    expectPending(await snapshot(), manager.id, [{ cardId, questions }])
    assert.deepEqual(userMessages(manager), [], 'filing the card does not fabricate user input')

    const answers = [...batchAnswers, { id: LONG.notes.id, selected: [], custom: FORM.text }, { id: LONG.skipped.id, selected: [] }]
    const response = await answer(cardId, answers)
    assert.ok(response.ok, 'the complete reply should accept an empty selection for the skipped id')
    await manager.whenIdle()
    expectPending(await snapshot(), manager.id, [])
    assert.equal(userMessages(manager).length, 1, 'the batch must emit one ordinary user message')
    expectUserAnswer(userMessages(manager)[0], { cardId, answers })
    assert.equal((await answer(cardId, answers)).ok, false, 'the settled batch refuses replay')
    assert.equal(userMessages(manager).length, 1, 'replay must not emit a second user message')
  })
}))

caseTest(id, '', 'an answer accepted during a live turn wakes the same session exactly once after a clean restart without opening the page', options, (t) => withWorld(t, async ({ boot, sdk }) => {
  const { createUserMessage } = await sdk.host('dsh-llm')
  const activePrompt = 'Keep this fixture turn active until DSH shuts down.'
  const holdTurn = async ({ signal }) => {
    // Only a clean host shutdown releases the in-flight turn, so the submitted answer cannot be
    // admitted before disposal. The fake provider is the only stalled dependency.
    if (!signal.aborted) await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }))
  }
  const { sessionId, payload } = await boot(async ({ manager, requests, answer, snapshot }) => {
    const cardId = cardIdOf(await call(manager, FORM.ask, { questions: freeBatch }))
    manager.steer(createUserMessage({ source: { kind: HOST.user }, content: [{ type: 'text', text: activePrompt }] }))
    assert.ok(await until(() => requests.length > 0, HOST.callBudget), 'manager did not reach the held model request')
    assert.equal(manager.status, 'running')
    const payload = { cardId, answers: freeAnswers }
    const response = await answer(cardId, payload.answers)
    assert.ok(response.ok, 'live turn should accept the answer: HTTP ' + response.status + ' ' + await response.text())
    expectPending(await snapshot(), manager.id, [])
    assert.deepEqual(userMessages(manager).map(textOf), [activePrompt], 'answer must still be unadmitted when shutdown begins')
    return { sessionId: manager.id, payload }
  }, { modelHook: holdTurn })

  await boot(async ({ ctx, requests }) => {
    // Neither ensureSession nor page SSE is touched on restart: accepting the answer already gave
    // Fishball responsibility for getting it to the manager without another user interaction.
    const request = await until(() => requests.find((item) => item.sessionId === sessionId), HOST.callBudget)
    assert.ok(request, 'a queued accepted answer must wake the original manager session after restart')
    expectUserAnswer(userInputs(request).at(-1), payload)
    const manager = ctx.agents.get(sessionId)
    assert.ok(manager)
    await manager.whenIdle()
    assert.equal(requests.length, 1, 'recovery should drive only one turn')
    assert.equal(userMessages(manager).length, 2, 'only the initial prompt and one admitted answer should remain')
    expectUserAnswer(userMessages(manager).at(-1), payload)
  }, { autoOpen: false })
}))
