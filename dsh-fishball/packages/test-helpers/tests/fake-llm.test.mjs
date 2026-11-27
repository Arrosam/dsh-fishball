/**
 * fishball-test-helpers ./fake-llm, driven through its adapter as DSH's llm service would (no DSH
 * boot). EP over the answer sources (queue, approval plan, nothing scripted), BVA on the streamed
 * text pieces, DT on the finish kinds.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { FAKE, FAKE_LLM, FakeAdapter, REQUEST_PLACEHOLDER, chunksFor, model } from '../fake-llm.mjs'

const T = Object.freeze({ session: 'fbtest-llm-session', other: 'fbtest-llm-other', text: 'scripted answer', tool: 'fbtest_tool', callId: 'call_fbtest_1', needle: 'fbtest-needle', approval: 'apr_0a1b' })

const userMessage = (text) => ({ role: 'user', content: [{ type: 'text', text }] })
/** One conversation request through the adapter; answers its chunks. */
async function ask(sessionId, messages = [userMessage('hello')]) {
  const call = await new FakeAdapter().prepareCall(FAKE.provider, FAKE.model)
  const chunks = []
  for await (const chunk of call.stream({ sessionId, messages, tools: [] })) chunks.push(chunk)
  return chunks
}
const textOf = (chunks) => chunks.filter((c) => c.type === 'text-delta').map((c) => c.text).join('')
const toolCalls = (chunks) => chunks.filter((c) => c.type === 'block-end' && c.block.type === 'tool-call').map((c) => c.block)
const finishOf = (chunks) => chunks.find((c) => c.type === 'finish').reason.kind

test('HLP-LLM-EP-01 a queued script answers its session once, then plain "ok"', async () => {
  model.queue(T.session, [{ text: T.text }])
  const before = model.requests.length
  assert.equal(textOf(await ask(T.session)), T.text)
  const second = await ask(T.session)
  assert.equal(textOf(second), FAKE_LLM.plainText)
  assert.equal(finishOf(second), 'stop')
  assert.equal(model.requests.length - before, 2, 'both requests are recorded')
  assert.equal(model.requests.at(-1).sessionId, T.session)
})

test('HLP-LLM-EP-02 a queued answer of one session is not taken by another', async () => {
  model.queue(T.session, [{ text: T.text }])
  assert.equal(textOf(await ask(T.other)), FAKE_LLM.plainText)
  assert.equal(textOf(await ask(T.session)), T.text)
})

test('HLP-LLM-EP-03 a tool step streams one tool call with its arguments and a tool-calls finish', async () => {
  model.queue(T.session, [{ tool: T.tool, args: { a: 1 }, id: T.callId }])
  const chunks = await ask(T.session)
  assert.deepEqual(toolCalls(chunks), [{ type: 'tool-call', id: T.callId, name: T.tool, arguments: JSON.stringify({ a: 1 }) }])
  assert.equal(finishOf(chunks), 'tool-calls')
})

test('HLP-LLM-EP-04 an approval plan answers the newest permission request that holds its needle, once', async () => {
  model.plans.push({ sessionId: T.session, needle: T.needle, args: { decision: 'allow' } })
  const chunks = await ask(T.session, [userMessage(`[permission request ${T.approval}] ${T.needle}`)])
  assert.deepEqual(JSON.parse(toolCalls(chunks)[0].arguments), { request_id: T.approval, decision: 'allow' })
  assert.equal(textOf(await ask(T.session, [userMessage(`[permission request ${T.approval}] ${T.needle}`)])), FAKE_LLM.plainText, 'a used plan answers no more')
})

test('HLP-LLM-EP-05 REQUEST_PLACEHOLDER becomes the newest permission request id of the conversation', async () => {
  model.queue(T.session, [{ tool: T.tool, args: { request_id: REQUEST_PLACEHOLDER } }])
  const chunks = await ask(T.session, [userMessage('apr_00 first'), userMessage(`${T.approval} newest`)])
  assert.equal(JSON.parse(toolCalls(chunks)[0].arguments).request_id, T.approval)
})

test('HLP-LLM-BVA-01 deltas: 1 streams one piece, n streams n pieces that join to the text', () => {
  const pieces = (deltas) => chunksFor([{ text: 'abcdef', deltas }]).filter((c) => c.type === 'text-delta').map((c) => c.text)
  assert.deepEqual(pieces(1), ['abcdef'])
  assert.deepEqual(pieces(2), ['abc', 'def'])
  assert.equal(pieces(6).length, 6)
  assert.equal(pieces(4).join(''), 'abcdef')
})

test('HLP-LLM-DT-01 finish kinds: text → stop, tool → tool-calls, fail → error, max-tokens → max-tokens', () => {
  const kind = (steps) => chunksFor(steps).at(-1).reason.kind
  assert.equal(kind([{ text: 'x' }]), 'stop')
  assert.equal(kind([{ tool: T.tool }]), 'tool-calls')
  assert.equal(kind([{ fail: 'fbtest-code' }]), 'error')
  assert.equal(kind([{ text: 'x', finish: 'max-tokens' }]), 'max-tokens')
})

test('HLP-LLM-EP-06 an auxiliary call is answered without taking the queue', async () => {
  model.queue(T.session, [{ text: T.text }])
  const call = await new FakeAdapter().prepareCall(FAKE.provider, FAKE.model)
  const chunks = []
  for await (const chunk of call.stream({ sessionId: T.session, purpose: 'title', messages: [userMessage('x')] })) chunks.push(chunk)
  assert.equal(textOf(chunks), FAKE_LLM.titleText)
  assert.equal(textOf(await ask(T.session)), T.text, 'the queued answer is still there')
})
