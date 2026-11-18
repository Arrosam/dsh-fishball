/**
 * CONN-TOOLS user decision, requirements-first. Real tools/list and tools/call over ephemeral
 * loopback HTTP using each installed SDK; no mocks of registration or unknown-tool dispatch.
 * EP: removed names vs all retained tools; empty/ordinary/malformed historical payloads.
 * DT: both names × payload partition × unmanaged/own/other management (unknown before validation).
 * BVA: zero/one items and omitted arguments. ST: repeated removed calls leave management, pairs,
 * queued events and domain untouched; a retained call and generic settlement delivery still work.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { CONN_FIXTURE as F, CONN_TOOLS as C } from '../../contract/k1-mcp-schema/conn-tools-constants.mjs'
import { assertRefusal, assertSuccess } from './cases.mjs'
import { SCOPE_HINT } from '../../contract/k1-mcp-schema/constants.mjs'
import { sdkClient } from '../mcp-http/subject.mjs'
import { EVENT_TYPE, FIXTURE, MAILBOX, PAIR_ONLY, REFUSAL, SCOPE, TOOL } from './constants.mjs'
import { protocolCodes, toolsWorld } from './subject.mjs'

const STATE = Object.freeze({ none: 'unmanaged', own: 'managed by caller', other: 'managed by another principal' })
const PAYLOADS = Object.freeze([
  { label: 'omitted arguments', args: undefined },
  { label: 'empty object', args: {} },
  { label: 'zero items', argsFor: (name) => name === C.removed[0] ? { questions: [] } : { questionId: F.questionId, answers: [] } },
  { label: 'ordinary historical request / one item', argsFor: (name) => name === C.removed[0] ? { questions: [F.question] } : { questionId: F.questionId, answers: F.answers.slice(0, 1) } },
  { label: 'malformed fields', args: { sessionId: false, questionId: null, questions: 'invalid', answers: false, extra: true } },
])

const row = (sdk, id, part, title, fn) => caseTest(sdk, id, part, title, fn)
const toolNames = async (client) => (await client.listTools()).tools.map((tool) => tool.name)

async function pairedWorld(t, sdk, state = STATE.none) {
  const w = await toolsWorld(t, sdk)
  const p = await w.full(FIXTURE.idP, FIXTURE.nameP)
  const q = await w.full(FIXTURE.idQ, FIXTURE.nameQ)
  if (state !== STATE.none) assert.equal((await w.managed.manage(FIXTURE.s1, state === STATE.own ? p.principalKey : q.principalKey)).ok, true)
  const client = await w.connect(p.token)
  await client.listTools()
  return { w, p, q, client }
}

/** Only public state APIs: catches unintended ask/settlement events as well as registry mutations. */
async function snapshot({ w, p, q }) {
  const mailboxes = await Promise.all([p, q].map(async ({ principalKey }) => ({
    summary: await w.mailbox.summary(principalKey),
    page: await w.mailbox.poll(principalKey, undefined, MAILBOX.pageMax),
  })))
  return JSON.stringify({ pairs: w.pairs.list(), managed: w.managed.managed(), mailboxes, domainCalls: w.domainCalls })
}

async function unknown(client, code, name, args) {
  await assert.rejects(client.callTool({ name, ...(args === undefined ? {} : { arguments: args }) }), (error) => {
    assert.equal(error.code, code, `${name} must be an MCP unknown-tool error, not an execution refusal: ${error.name}: ${error.message}`)
    return true
  }, `${name} returned a tool result instead of the protocol unknown-tool error`)
}

export function registerConnToolsBoundaryCases(sdk) {
  row(sdk, 'CONN-TOOLS-EP-03', 'tools/list', 'full token advertises exactly the 20 retained tools; neither removed name is advertised', async (t) => {
    const { client } = await pairedWorld(t, sdk)
    assert.deepEqual(await toolNames(client), [...C.retained])
  })

  for (const state of Object.values(STATE)) {
    row(sdk, 'CONN-TOOLS-DT-03', state, 'both removed names are unknown for every payload partition, with no domain, registry or mailbox effect', async (t) => {
      const env = await pairedWorld(t, sdk, state)
      const { w, p, q, client } = env
      for (const principal of [p, q]) {
        const committed = await w.mailbox.commit(principal.principalKey, { type: EVENT_TYPE.message, sourceSessionId: null, correlationId: null, payload: FIXTURE.messagePayload })
        assert.equal(committed.ok, true)
      }
      const before = await snapshot(env)
      const { InvalidParams } = await protocolCodes(sdk)
      for (const name of C.removed) for (const { label, args, argsFor } of PAYLOADS) {
        await unknown(client, InvalidParams, name, argsFor === undefined ? args : argsFor(name))
        assert.equal(await snapshot(env), before, `${name}: ${label}`)
      }
      assert.deepEqual(w.domainCalls, [])
      assert.deepEqual(await toolNames(client), [...C.retained], 'failed calls changed advertised tools')
    })
  }

  // Explicit clarification: R-OA-04/R-ID-06 scope-first precedence survives tool removal. The
  // SDK's typed transport error represents HTTP 403 + Bearer insufficient_scope, not JSON-RPC.
  row(sdk, 'CONN-TOOLS-DT-04', 'pair-only token', 'an unpaired caller sees only pair; removed calls get HTTP 403 insufficient_scope without binding an entry or changing state', async (t) => {
    const env = await pairedWorld(t, sdk, STATE.own)
    const { w } = env
    const client = await w.connect(w.pairOnly(F.unpairedId))
    assert.deepEqual(await toolNames(client), [...PAIR_ONLY.tools])
    const before = await snapshot(env)
    const { InsufficientScopeError } = await sdkClient(sdk)
    for (const name of C.removed) for (const { label, args, argsFor } of PAYLOADS) {
      const arguments_ = argsFor === undefined ? args : argsFor(name)
      await assert.rejects(client.callTool({ name, ...(arguments_ === undefined ? {} : { arguments: arguments_ }) }), (error) => {
        assert.ok(error instanceof InsufficientScopeError, `${name}: ${error.name}: ${error.message}`)
        assert.equal(error.requiredScope, SCOPE.full)
        assert.equal(error.errorDescription, SCOPE_HINT.notPaired)
        return true
      })
      assert.equal(await snapshot(env), before, `${name}: ${label}`)
    }
    assert.equal(w.pairs.pairOf(FIXTURE.entry(F.unpairedId)), undefined)
    assert.deepEqual(await toolNames(client), [...PAIR_ONLY.tools])
    assert.deepEqual(w.domainCalls, [])
  })

  row(sdk, 'CONN-TOOLS-ST-01', 'retry then retained call', 'repeated removed calls preserve management; question_answer remains a known tool with normal validation and authority refusals', async (t) => {
    const env = await pairedWorld(t, sdk, STATE.other)
    const { w, q, client } = env
    const { InvalidParams } = await protocolCodes(sdk)
    const before = await snapshot(env)
    for (const name of [...C.removed, ...C.removed]) await unknown(client, InvalidParams, name, {})
    const args = { sessionId: FIXTURE.s1, questionId: F.questionId, offerId: F.offerId, answers: F.answers.slice(0, 1) }
    assertRefusal(await client.callTool({ name: C.answer, arguments: args }), REFUSAL.forbidden)
    assertRefusal(await client.callTool({ name: C.answer, arguments: { ...args, answers: [{ id: 'choice', selected: false }] } }), REFUSAL.invalidArguments)
    assert.equal(await snapshot(env), before)
    assert.equal(w.managed.managerOf(FIXTURE.s1), q.principalKey)
    assertSuccess(await client.callTool({ name: TOOL.setName, arguments: { name: null } }))
    assert.equal(w.pairs.byPrincipal(env.p.principalKey).name, null)
    assert.deepEqual(w.domainCalls, [])
  })

  row(sdk, 'CONN-TOOLS-ST-02', 'generic settlement', 'generic settlement answers remain durable and visible unchanged through inbox_poll after removed calls', async (t) => {
    const env = await pairedWorld(t, sdk, STATE.own)
    const { w, p, client } = env
    const payload = { ...F.settlement, answers: F.answers }
    const committed = await w.mailbox.commit(p.principalKey, { type: C.settlement, sourceSessionId: FIXTURE.s1, correlationId: F.questionId, payload })
    assert.equal(committed.ok, true)
    const before = await snapshot(env)
    const { InvalidParams } = await protocolCodes(sdk)
    for (const name of C.removed) await unknown(client, InvalidParams, name, { questionId: F.questionId, answers: F.answers })
    assert.equal(await snapshot(env), before)
    const result = assertSuccess(await client.callTool({ name: TOOL.inboxPoll, arguments: {} }))
    assert.deepEqual(result.events.map((event) => event.eventId), [committed.eventId])
    assert.deepEqual(result.events[0].payload, payload)
    assert.equal(await snapshot(env), before, 'inbox_poll or removed calls consumed the settlement')
  })
}
