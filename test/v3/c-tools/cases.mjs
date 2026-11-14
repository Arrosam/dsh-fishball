/**
 * C-TOOLS black-box cases (v3-tasks.md row C-TOOLS, wave W3; .runtime/reports/v3-w3-briefs.md
 * "C-TOOLS test brief"): the 22 core MCP tools, their result envelope, closed inputs, no watch
 * tools, and "a session another principal manages" refusals.
 *
 * Cases (docs/test-design/v3/): PLAT-UC-02, PLAT-EP-02 rows 1–6 and 4a, PLAT-ST-01
 * (11-platform.md); WATCH-UC-03, and the rows moved here from C-ROUTE (O8, Q-15): WATCH-UC-01 E1,
 * WATCH-ST-01 rows 7 and 8 (06-watch.md). Brief oracle F6: an invalid-id throw from
 * `PairStore.pair` is `operation-failed`. Written from the requirements, the cases and the K1/K1c/K2
 * contracts only; `src/mcp/tools/` was not read.
 *
 * Techniques, and only these, in this order: Use Case (each test names its flow), Equivalence
 * Partitioning, Boundary Value Analysis, Decision Table, State Transition (one test per row).
 *
 * Level: integration. Real HTTP to C-HTTP's endpoint carrying C-TOOLS' populate, the installed
 * SDK's stock MCP client, real C-PAIR and C-MAILBOX over real DSH storage (subject.mjs). Rows that
 * need a live offer or a real session are `todo` naming their owner (Fishball Q2; constants.mjs LATER).
 *
 * Fishball's decisions applied (2026-11-14): Q3/Q5, a session another principal manages is
 * `forbidden` before any unknown-session or offer check, in every tool that names a session; Q4,
 * a late answer is `already-settled` or `expired`.
 *
 * Common refusal oracle (README): `isError: true`; `structuredContent` `{ok: false, code,
 * message?}` and exactly one text block holding the same JSON; nothing changed (store, mailbox,
 * managed state, the domain never reached) and nothing leaked (no token, stack, path, or echoed id).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../shared/cases.mjs'
import { validatorFor } from '../k1/schema-module.mjs'
import {
  DECISION, EVENT_TYPE, FIXTURE, LATER, LEAK, MAILBOX, MCP_RESULT, PAIR_ADVICE, PAIR_ONLY, REFUSAL, REMOVED, RISK,
  SESSION_CONTROL, TOOL, TOOL_NAMES, formatOfferId, toolDefinition,
} from './constants.mjs'
import { protocolCodes, toolsWorld } from './subject.mjs'

const CASE = Object.freeze({
  platUc02: 'PLAT-UC-02', watchUc01: 'WATCH-UC-01', watchUc03: 'WATCH-UC-03',
  platEp02: 'PLAT-EP-02', platSt01: 'PLAT-ST-01', watchSt01: 'WATCH-ST-01',
})

// ---------------------------------------------------------------------------------------------
// Oracles and steps shared by the cases
// ---------------------------------------------------------------------------------------------

/** No token, stack frame, repository path or `extra` secret in `text` (README: nothing leaks). */
function assertNoLeak(text, extra = []) {
  for (const id of [FIXTURE.idP, FIXTURE.idQ]) assert.ok(!text.includes(FIXTURE.accessToken(id)), 'a token value leaked')
  assert.ok(!LEAK.stackFrame.test(text), `a stack frame leaked: ${text}`)
  assert.ok(!text.includes(LEAK.repo), `a path leaked: ${text}`)
  for (const s of extra) assert.ok(!text.includes(s), `${JSON.stringify(s)} leaked: ${text}`)
}

/** R-CON-02: `structuredContent` and exactly one text block with the same JSON. */
function assertSameJson(result) {
  assert.equal(result.content?.length, MCP_RESULT.textBlocks, `expected one content block: ${JSON.stringify(result.content)}`)
  const [block] = result.content
  assert.equal(block.type, MCP_RESULT.textType)
  assert.deepEqual(JSON.parse(block.text), result.structuredContent, 'the text block is not the structuredContent JSON')
  return block.text
}

/** A refusal with `code` (PLAT-EP-02 row 5); `leaks` are strings it must not echo. Returns its structuredContent. */
export function assertRefusal(result, code, leaks = []) {
  assert.equal(result.isError, true, `not a tool execution error: ${JSON.stringify(result)}`)
  const s = result.structuredContent
  assert.ok(s !== null && typeof s === 'object', `no structuredContent: ${JSON.stringify(result)}`)
  assert.equal(s.ok, false)
  assert.equal(s.code, code, JSON.stringify(s))
  if (Object.hasOwn(s, 'message')) assert.equal(typeof s.message, 'string')
  assertNoLeak(assertSameJson(result), leaks)
  return s
}

/** A success (PLAT-EP-02 row 6). Returns its structuredContent. */
export function assertSuccess(result) {
  assert.equal(result.isError === true, false, `refused: ${JSON.stringify(result)}`)
  assert.equal(result.structuredContent?.ok, true, JSON.stringify(result))
  assertNoLeak(assertSameJson(result))
  return result.structuredContent
}

/** The listed tools by name. */
const listed = async (client) => (await client.listTools()).tools
const names = (tools) => tools.map((t) => t.name)

/** A world with P (and Q) paired and connected; `qManages` makes Q the manager of S1. */
async function twoPrincipals(t, sdk, { qManages = false, pManages = false } = {}) {
  const w = await toolsWorld(t, sdk)
  const p = await w.full(FIXTURE.idP, FIXTURE.nameP)
  const q = await w.full(FIXTURE.idQ, FIXTURE.nameQ)
  if (qManages) assert.equal((await w.managed.manage(FIXTURE.s1, q.principalKey)).ok, true)
  if (pManages) assert.equal((await w.managed.manage(FIXTURE.s1, p.principalKey)).ok, true)
  return { w, p, q, pc: await w.connect(p.token), qc: await w.connect(q.token) }
}

/** Unchanged after a refusal: the managed set, the pairs, and the domain never reached. */
function snapshot(w) {
  return JSON.stringify({ managed: w.managed.managed(), pairs: w.pairs.list() })
}
function assertUnchanged(w, before) {
  assert.equal(snapshot(w), before, 'a refusal changed managed state or pairs')
  assert.deepEqual(w.domainCalls, [], 'a refusal reached the session domain')
}

/** The arguments of a `session_read` / `approval_answer` that are valid apart from authority. */
const readArgs = () => ({ sessionId: FIXTURE.s1, maxMessages: FIXTURE.maxMessages, maxBytes: FIXTURE.maxBytes })
const answerArgs = () => ({
  sessionId: FIXTURE.s1, approvalId: FIXTURE.requestId, offerId: formatOfferId(FIXTURE.requestId, 1),
  answer: { decision: DECISION.allow, risk: RISK.low, reason: FIXTURE.reason },
})
const startArgs = (extra = {}) => ({ folder: FIXTURE.folder, title: FIXTURE.title, message: FIXTURE.message, attachments: [], ...extra })

/** One case on a fresh world. */
const world = (sdk, id, part, title, fn, todo) => caseTest(sdk, id, part, title, fn === null ? null : async (t) => fn(t), todo)
const todo = (sdk, id, part, title, owner) => caseTest(sdk, id, part, title, null, owner)

/** WATCH-UC-03 E1 / WATCH-ST-01 row 7: every removed watch tool is the MCP unknown-tool error, nothing changes. */
async function assertWatchToolsUnknown(sdk, w, client) {
  const codes = await protocolCodes(sdk)
  const before = snapshot(w)
  for (const name of REMOVED.watchTools) {
    await assert.rejects(client.callTool({ name, arguments: { sessionId: FIXTURE.s1 } }), (error) => {
      assert.equal(error.code, codes.InvalidParams, `${name}: ${error.message}`)
      return true
    }, `${name} did not fail as an unknown tool`)
  }
  assertUnchanged(w, before)
}

// ---------------------------------------------------------------------------------------------
// Use Cases
// ---------------------------------------------------------------------------------------------

function useCases(sdk) {
  // PLAT-UC-02 — A principal answers a delegated approval; the user races it. Every flow needs a live
  // offer raised by a real session through the real V2 approvals domain (Fishball Q2): todo.
  todo(sdk, CASE.platUc02, 'main', 'S1 (managed by P) asks permission → offer O1 in P\'s mailbox; approval_answer(O1, allow) is accepted; P gets one settlement (allowed, by principal)', LATER.firstCommit)
  todo(sdk, CASE.platUc02, 'A1', 'a question and a plan review: question_answer on the live offer settles them the same way (settlement answered)', LATER.firstCommit)
  todo(sdk, CASE.platUc02, 'A2', 'the user answers in S1 first → P\'s approval_answer is refused already-settled or expired (Q4: either), isError: true, nothing changes', LATER.firstCommit)
  todo(sdk, CASE.platUc02, 'E1', 'nobody answers for 48 h on the fake clock → O1 still waits: approvals_list still lists it, no settlement, no timer', LATER.firstCommit)
  todo(sdk, CASE.platUc02, 'E2', 'P answers twice → the second is refused already-settled; exactly one settlement', LATER.firstCommit)
  todo(sdk, CASE.platUc02, 'post', 'exactly one committed outcome per offer; no connector setting stops external principals receiving delegated items (R-CON-07)', LATER.settings)

  // WATCH-UC-01 E1 — notifyWhenFinished is an undeclared argument: invalid-arguments, nothing started.
  world(sdk, CASE.watchUc01, 'E1', `session_start with ${REMOVED.notifyArgument}: true → isError, ${REFUSAL.invalidArguments}; nothing started, nobody manages anything`, async (t) => {
    const w = await toolsWorld(t, sdk)
    const p = await w.full(FIXTURE.idP, FIXTURE.nameP)
    const client = await w.connect(p.token)
    const before = snapshot(w)
    const result = await client.callTool({ name: TOOL.sessionStart, arguments: startArgs({ [REMOVED.notifyArgument]: true }) })
    assertRefusal(result, REFUSAL.invalidArguments)
    assertUnchanged(w, before)
    assert.deepEqual(w.managed.managed(), [])
  })

  // WATCH-UC-03 — A client calls a removed V2 watch tool.
  world(sdk, CASE.watchUc03, 'main', `tools/list contains none of ${REMOVED.watchTools.join(', ')}`, async (t) => {
    const w = await toolsWorld(t, sdk)
    const client = await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token)
    const got = names(await listed(client))
    for (const name of REMOVED.watchTools) assert.ok(!got.includes(name), `${name} is listed`)
  })
  world(sdk, CASE.watchUc03, 'E1/post', 'a tools/call to each removed watch tool → the MCP unknown-tool error (JSON-RPC -32602), never a tool result; nothing changed', async (t) => {
    const w = await toolsWorld(t, sdk)
    const client = await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token)
    await assertWatchToolsUnknown(sdk, w, client)
  })
}

// ---------------------------------------------------------------------------------------------
// Equivalence Partitioning
// ---------------------------------------------------------------------------------------------

function partitions(sdk) {
  // PLAT-EP-02 — Core tool set (R-CON-02, R-WATCH-03, R-EXT-13).
  world(sdk, CASE.platEp02, 1, `full AT: the session-control tools are listed (${SESSION_CONTROL.join(', ')})`, async (t) => {
    const w = await toolsWorld(t, sdk)
    const got = names(await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token)))
    for (const name of SESSION_CONTROL) assert.ok(got.includes(name), `${name} is missing from ${JSON.stringify(got)}`)
  })
  world(sdk, CASE.platEp02, 2, 'full AT: approvals, questions, prompts, grants, attachments, inbox, pair and set_name are listed', async (t) => {
    const w = await toolsWorld(t, sdk)
    const got = names(await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token)))
    const rest = TOOL_NAMES.filter((n) => !SESSION_CONTROL.includes(n))
    for (const name of rest) assert.ok(got.includes(name), `${name} is missing from ${JSON.stringify(got)}`)
  })
  world(sdk, CASE.platEp02, '1/2', 'full AT, no contributor: tools/list is exactly K1 TOOLS, in K1 order, each input a closed object with K1\'s properties', async (t) => {
    const w = await toolsWorld(t, sdk)
    const tools = await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token))
    assert.deepEqual(names(tools), [...TOOL_NAMES])
    for (const tool of tools) {
      const k1 = toolDefinition(tool.name)
      assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name}: input is not closed`)
      assert.deepEqual(Object.keys(tool.inputSchema.properties ?? {}).sort(), Object.keys(k1.inputSchema.properties).sort(), tool.name)
      assert.deepEqual([...(tool.inputSchema.required ?? [])].sort(), [...(k1.inputSchema.required ?? [])].sort(), tool.name)
    }
  })
  world(sdk, CASE.platEp02, 2, `pair-only AT (another power partition): tools/list lists ${PAIR_ONLY.tools.join(', ')} only`, async (t) => {
    const w = await toolsWorld(t, sdk)
    const got = names(await listed(await w.connect(w.pairOnly(FIXTURE.idP))))
    assert.deepEqual(got, [...PAIR_ONLY.tools])
  })
  world(sdk, CASE.platEp02, 3, 'watch tools: absent (no listed name contains "watch"; no input declares notifyWhenFinished)', async (t) => {
    const w = await toolsWorld(t, sdk)
    const tools = await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token))
    assert.deepEqual(names(tools).filter((n) => REMOVED.watchWord.test(n)), [])
    for (const tool of tools) assert.ok(!Object.hasOwn(tool.inputSchema.properties ?? {}, REMOVED.notifyArgument), `${tool.name} declares ${REMOVED.notifyArgument}`)
  })
  world(sdk, CASE.platEp02, 4, 'attention signal without embed-UI: absent from core (no listed name contains "attention")', async (t) => {
    const w = await toolsWorld(t, sdk)
    const got = names(await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token)))
    assert.deepEqual(got.filter((n) => REMOVED.attentionWord.test(n)), [])
  })
  todo(sdk, CASE.platEp02, 4, 'with embed-UI present only embed-ui.attention.* (contributed) appear, after every core tool; runs without embed-UI only here (brief)', LATER.attention)
  world(sdk, CASE.platEp02, '4a', `session_read of a session another principal manages → ${REFUSAL.forbidden} (1.23), before any session lookup; Q still manages it`, async (t) => {
    const { w, pc, q } = await twoPrincipals(t, sdk, { qManages: true })
    const before = snapshot(w)
    assertRefusal(await pc.callTool({ name: TOOL.sessionRead, arguments: readArgs() }), REFUSAL.forbidden)
    assertUnchanged(w, before)
    assert.equal(w.managed.managerOf(FIXTURE.s1), q.principalKey)
  })
  todo(sdk, CASE.platEp02, '4a', 'sessions_list omits a session another principal manages and lists the caller\'s own (1.23)', LATER.domain)

  // Row 5 — any refusal: one test per refusal class the real modules can produce here.
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.invalidArguments} (an undeclared argument on session_message of a session P manages): envelope, same JSON as text`, async (t) => {
    const { w, pc } = await twoPrincipals(t, sdk, { pManages: true })
    const before = snapshot(w)
    const args = { sessionId: FIXTURE.s1, message: FIXTURE.message, attachments: [], [REMOVED.notifyArgument]: true }
    assertRefusal(await pc.callTool({ name: TOOL.sessionMessage, arguments: args }), REFUSAL.invalidArguments)
    assertUnchanged(w, before)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.forbidden}: approval_answer on a session another principal manages, before any offer check (R-ROUTE-02; Fishball Q5)`, async (t) => {
    const { w, pc } = await twoPrincipals(t, sdk, { qManages: true })
    const before = snapshot(w)
    assertRefusal(await pc.callTool({ name: TOOL.approvalAnswer, arguments: answerArgs() }), REFUSAL.forbidden)
    assertUnchanged(w, before)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.unknownEvent}: inbox_ack of a receipt naming no event of the caller's mailbox`, async (t) => {
    const { w, pc, p } = await twoPrincipals(t, sdk)
    const before = await w.mailbox.summary(p.principalKey)
    const receipts = [{ eventId: FIXTURE.unknownEventId, payloadDigest: FIXTURE.zeroDigest }]
    assertRefusal(await pc.callTool({ name: TOOL.inboxAck, arguments: { receipts } }), REFUSAL.unknownEvent, [FIXTURE.unknownEventId])
    assert.deepEqual(await w.mailbox.summary(p.principalKey), before)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.nameInvalid}: set_name with a blank name; the caller keeps its name`, async (t) => {
    const { w, pc, p } = await twoPrincipals(t, sdk)
    const before = snapshot(w)
    assertRefusal(await pc.callTool({ name: TOOL.setName, arguments: { name: FIXTURE.blankName } }), REFUSAL.nameInvalid)
    assert.equal(snapshot(w), before)
    assert.equal(w.pairs.byPrincipal(p.principalKey).name, FIXTURE.nameP)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.nameTaken}: set_name with another principal's name, any letter case; the caller keeps its name`, async (t) => {
    const { w, pc, p } = await twoPrincipals(t, sdk)
    const before = snapshot(w)
    assertRefusal(await pc.callTool({ name: TOOL.setName, arguments: { name: FIXTURE.nameQ.toUpperCase() } }), REFUSAL.nameTaken)
    assert.equal(snapshot(w), before)
    assert.equal(w.pairs.byPrincipal(p.principalKey).name, FIXTURE.nameP)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.alreadyPaired}: pair on a bound token carries bound {idMatches: true, …} and the fixed advice (R-ID-04)`, async (t) => {
    const { w, pc } = await twoPrincipals(t, sdk)
    const before = snapshot(w)
    const s = assertRefusal(await pc.callTool({ name: TOOL.pair, arguments: {} }), REFUSAL.alreadyPaired)
    assert.equal(s.bound.idMatches, true)
    assert.equal(s.bound.boundId, FIXTURE.idP)
    assert.equal(s.bound.name, FIXTURE.nameP)
    assert.equal(s.advice, PAIR_ADVICE.idMatches)
    assert.equal(snapshot(w), before)
  })
  world(sdk, CASE.platEp02, 5, `refusal ${REFUSAL.operationFailed} (brief F6): PairStore.pair throws TypeError on an invalid id → isError, not a JSON-RPC error or prose; nothing changes; the id is not echoed`, async (t) => {
    const thrown = []
    const w = await toolsWorld(t, sdk, {
      overridePairs: (store) => new Proxy(store, {
        get(target, prop) {
          if (prop === 'pair') {
            return async (entryKey, id) => {
              thrown.push(id)
              // As C-PAIR's store does (store.js MISUSE.invalidId); the message carries the id and a path, to prove neither leaks.
              throw new TypeError(`invalid fishball id ${id} at ${LEAK.repo}`)
            }
          }
          const value = Reflect.get(target, prop)
          return typeof value === 'function' ? value.bind(target) : value
        },
      }),
    })
    const client = await w.connect(w.pairOnly(FIXTURE.invalidId))
    const before = snapshot(w)
    const result = await client.callTool({ name: TOOL.pair, arguments: { name: FIXTURE.nameP } })
    assert.equal(thrown.length, 1, 'the throwing pair was not reached')
    assertRefusal(result, REFUSAL.operationFailed, [FIXTURE.invalidId])
    assertUnchanged(w, before)
    assert.equal(w.pairs.pairOf(FIXTURE.entry(FIXTURE.invalidId)), undefined)
  })
  todo(sdk, CASE.platEp02, 5, `refusals ${REFUSAL.expired} (a hostRef) and ${REFUSAL.queueFull} through the session tools`, LATER.domain)

  // Row 6 — any success.
  world(sdk, CASE.platEp02, 6, 'success set_name: isError false, structuredContent {ok: true, name} and the same JSON as text', async (t) => {
    const { w, pc, p } = await twoPrincipals(t, sdk)
    const s = assertSuccess(await pc.callTool({ name: TOOL.setName, arguments: { name: null } }))
    assert.equal(s.name, null)
    assert.equal(w.pairs.byPrincipal(p.principalKey).name, null)
  })
  world(sdk, CASE.platEp02, 6, 'success pair (pair-only AT, unbound entry): {ok: true, paired: true, id, name}', async (t) => {
    const w = await toolsWorld(t, sdk)
    const client = await w.connect(w.pairOnly(FIXTURE.idP))
    const s = assertSuccess(await client.callTool({ name: TOOL.pair, arguments: { name: FIXTURE.nameP } }))
    assert.equal(s.paired, true)
    assert.equal(s.id, FIXTURE.idP)
    assert.equal(s.name, FIXTURE.nameP)
    assert.equal(w.pairs.pairOf(FIXTURE.entry(FIXTURE.idP))?.id, FIXTURE.idP)
  })
  world(sdk, CASE.platEp02, 6, 'success inbox_poll: an event committed to P\'s mailbox is returned to P, with nextCursor and hasMore', async (t) => {
    const { w, pc, p } = await twoPrincipals(t, sdk)
    const committed = await w.mailbox.commit(p.principalKey, { type: EVENT_TYPE.message, sourceSessionId: null, correlationId: null, payload: FIXTURE.messagePayload })
    assert.equal(committed.ok, true, JSON.stringify(committed))
    const s = assertSuccess(await pc.callTool({ name: TOOL.inboxPoll, arguments: {} }))
    assert.deepEqual(s.events.map((e) => e.eventId), [committed.eventId])
    assert.equal(typeof s.nextCursor, 'string')
    assert.equal(typeof s.hasMore, 'boolean')
  })
  world(sdk, CASE.platEp02, 6, 'every listed output schema admits the refusal envelope {ok: false, code} (SDK validator)', async (t) => {
    const w = await toolsWorld(t, sdk)
    const tools = await listed(await w.connect((await w.full(FIXTURE.idP, FIXTURE.nameP)).token))
    const compile = await validatorFor(sdk)
    const envelope = { ok: false, code: REFUSAL.operationFailed }
    for (const tool of tools) {
      assert.ok(tool.outputSchema, `${tool.name} has no outputSchema`)
      assert.equal(compile(tool.outputSchema)(envelope), true, `${tool.name}'s outputSchema refuses the refusal envelope`)
    }
  })
}

// ---------------------------------------------------------------------------------------------
// Boundary Value Analysis
// ---------------------------------------------------------------------------------------------

function boundaries(sdk) {
  // PLAT-EP-02 row 5's limit-exceeded example, at inbox_poll's limit edges (MAILBOX.pageMax, EVT-BVA-01 K).
  for (const [limit, refused] of [[0, true], [1, false], [MAILBOX.pageMax, false], [MAILBOX.pageMax + 1, true]]) {
    world(sdk, CASE.platEp02, 5, `inbox_poll limit ${limit}: ${refused ? `refused ${REFUSAL.limitExceeded}, never clamped` : 'served'}`, async (t) => {
      const { pc } = await twoPrincipals(t, sdk)
      const result = await pc.callTool({ name: TOOL.inboxPoll, arguments: { limit } })
      if (refused) assertRefusal(result, REFUSAL.limitExceeded)
      else assertSuccess(result)
    })
  }
}

// ---------------------------------------------------------------------------------------------
// State Transitions
// ---------------------------------------------------------------------------------------------

function transitions(sdk) {
  // PLAT-ST-01 — One offer (approval / question / plan review). Needs a live offer (Fishball Q2).
  todo(sdk, CASE.platSt01, 1, '(none) --managed session asks--> Live(P): one offer event in P\'s mailbox, offerId <requestId>.r1', LATER.firstCommit)
  todo(sdk, CASE.platSt01, 2, 'Live(P) --P answers--> Settled; settlement (by principal) to P', LATER.firstCommit)
  todo(sdk, CASE.platSt01, 3, 'Live(P) --user answers--> Settled; settlement (by user) to P', LATER.firstCommit)
  todo(sdk, CASE.platSt01, 4, 'Settled --any answer--> Settled: already-settled / expired, nothing changes', LATER.firstCommit)
  todo(sdk, CASE.platSt01, 5, 'Live(P) --time passes (fake clock), silence--> Live(P): no timer settles it', LATER.firstCommit)
  todo(sdk, CASE.platSt01, 6, 'Live(P) --P revoked--> Live(user): card in the session', LATER.revoke)
  todo(sdk, CASE.platSt01, 7, 'Live(P) --succession--> Live(P\'): revision + 1; the old id answers expired to any principal', LATER.succeed)
  todo(sdk, CASE.platSt01, 8, 'Live(P) --Watchdog commits escalate--> Live(user card); Watchdog notified on settlement', LATER.escalate)
  todo(sdk, CASE.platSt01, 9, 'Live(P) --session ends / offer withdrawn--> Retired; retirement to P; a later answer is refused', LATER.firstCommit)

  // WATCH-ST-01 rows 7 and 8 (moved from C-ROUTE, O8).
  world(sdk, CASE.watchSt01, 7, 'Watched(P) --another principal calls a watch tool--> Watched(P): unknown tool; P still manages S1', async (t) => {
    const { w, qc, p } = await twoPrincipals(t, sdk, { pManages: true })
    await assertWatchToolsUnknown(sdk, w, qc)
    assert.equal(w.managed.managerOf(FIXTURE.s1), p.principalKey)
  })
  world(sdk, CASE.watchSt01, 8, `Watched(P) --session_read by another principal--> Watched(P): refused ${REFUSAL.forbidden}; no watch or management started`, async (t) => {
    const { w, qc, p } = await twoPrincipals(t, sdk, { pManages: true })
    const before = snapshot(w)
    assertRefusal(await qc.callTool({ name: TOOL.sessionRead, arguments: readArgs() }), REFUSAL.forbidden)
    assertUnchanged(w, before)
    assert.deepEqual(w.managed.managed(), [{ sessionId: FIXTURE.s1, principalKey: p.principalKey }])
  })
  todo(sdk, CASE.watchSt01, 8, 'Watched(P): S1 is absent from the other principal\'s sessions_list (1.23)', LATER.domain)
}

/** Registers every C-TOOLS case for `sdk`. */
export function registerCToolsCases(sdk) {
  useCases(sdk)
  partitions(sdk)
  boundaries(sdk)
  transitions(sdk)
}
