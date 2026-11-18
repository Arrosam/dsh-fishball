/**
 * Independent review regressions. Use Cases FIRST; then EP, BVA, Decision Table, State Transition.
 * Derived only from DESIGN/K1/contracts and the user's B1/B2/S1/S5/S12 + 2026-11-16 decisions.
 * No product implementation was read. USE-CASES.md records scope, tables, and honest run ownership.
 */
import assert from 'node:assert/strict'
import test, { describe } from 'node:test'
import { freePort, nonWebScenario, scenario } from '../world.mjs'
import * as IXS from '../../interactions/subject.mjs'
import { BUDGET, DATA, DECISION, DELIVERY, DESCRIPTION, EXPECT, FIXTURE, FUTURE, K1, OP, RISK, SCHEMA_TEXT, SURFACE, V3_SERVICES } from './constants.mjs'
import {
  activityAfter, assertDuplicateRefused, assertMetadata, connect, createToken, duplicateOf, eventually,
  fresh, handOver, listedIds, managedOf, managedSession, noticeOf, okCall, ownerJson, paired, read,
  refusedCall, remount, saveTokens, stateOf, tokensOf, userSession,
} from './steps.mjs'

const T = Object.freeze({ timeout: BUDGET.testMs })
const SERIAL = Object.freeze({ concurrency: false })
const S = SURFACE.settings
const accessWorld = (sdk) => scenario(sdk, DATA.scenario.access)
const readArgs = (sessionId) => ({ sessionId, ...DATA.read })

export function registerReviewCases(sdk) {
  // DESIGN §3.1: "method is POST; GET and DELETE get 405"; §5.5a: "DSH's web listener ...
  // MCP endpoint, protected-resource metadata, AS metadata, token endpoint". K1 SETTINGS_REFUSAL:
  // "A settings save of the tokens list is refused, the previous list is written back".
  // User B1/B2: "disable/re-enable real dsh-connector bundle, routes/services return";
  // "new token works post-remount"; "describe().value.tokens equals previous list". User activity:
  // "session_message and session_redirect bump recent activity same as user message (api-session/activity)".
  describe(`C-WIRE review Use Cases FIRST [SDK ${sdk}]`, SERIAL, () => {
    test('B1 Use Case / State Transition: real bundle remount restores services/routes, a new token and duplicate write-back', T, async (t) => {
      const w = await scenario(sdk, DATA.scenario.b1)
      await remount(w)
      await assertMetadata(w)
      await stateOf(w)
      await ownerJson(w, K1.HTTP_METHOD.get, SURFACE.route.uiState)
      const principal = await paired(t, w)
      const listed = (await principal.client.listTools({}, { timeout: BUDGET.rpcMs })).tools.map((tool) => tool.name)
      assert.deepEqual(listed.slice(0, K1.TOOL_NAMES.length), [...K1.TOOL_NAMES], 'new post-remount token cannot use the core endpoint')
      const before = await tokensOf(w)
      const label = fresh(DATA.copyLabel)
      await saveTokens(w, duplicateOf(before, principal.made.entryKey, label))
      await assertDuplicateRefused(w, before, label)
    })

    test('B2 Use Case / State Transition: remount then refused user duplicate restores native describe().value.tokens exactly', T, async (t) => {
      const w = await scenario(sdk, DATA.scenario.b2)
      const original = await createToken(w)
      const before = structuredClone(await tokensOf(w))
      await remount(w)
      const label = fresh(DATA.copyLabel)
      await saveTokens(w, duplicateOf(before, original.entryKey, label))
      await assertDuplicateRefused(w, before, label)
      const described = await w.settings()
      assert.deepEqual(described.value[S.tokens], before, 'native settings still describes the refused list after remount')
      // The restored saved item must authenticate; a correct-looking page snapshot alone is insufficient.
      const client = await connect(t, w, { id: fresh(), value: original.value })
      assert.equal((await okCall(client, K1.TOOL.pair)).paired, true)
    })

    test('ACCESS-UC Use Case: caller reads and lists the actual session handed over to it', T, async (t) => {
      const w = await accessWorld(sdk)
      const principal = await paired(t, w)
      const session = await managedSession(w, principal.principalKey)
      assert.ok((await read(principal.client, session.sessionId)).messages.some((message) => message.role === K1.READ_ROLE.user && message.text.includes(DATA.userText)))
      assert.ok((await listedIds(principal.client)).includes(session.sessionId))
    })

    for (const tool of [K1.TOOL.sessionMessage, K1.TOOL.sessionRedirect]) {
      test(`ACTIVITY Use Case: ${tool} bumps native recent activity after a real user message`, T, async (t) => {
        const w = await accessWorld(sdk)
        const principal = await paired(t, w)
        const session = await managedSession(w, principal.principalKey)
        const baseline = (await w.call(OP.activity)).filter((event) => event.sessionId === session.sessionId)
        assert.ok(baseline.length > 0, 'control: the real user message must emit native recent activity')
        const priorTimestamp = baseline.at(-1).timestamp
        assert.equal(Number.isFinite(priorTimestamp), true)
        assert.ok(await eventually(() => Date.now() > priorTimestamp), 'real clock must pass the control event timestamp')
        const offset = (await w.call(OP.activity)).length
        const text = fresh(DATA.message)
        const delivery = await okCall(principal.client, tool, { sessionId: session.sessionId, message: text, attachments: [] })
        assert.equal(delivery.status, DELIVERY.delivered)
        const events = await activityAfter(w, offset, session.sessionId)
        assert.ok(events.some((event) => event.timestamp > priorTimestamp), 'principal delivery failed to advance recent activity beyond the user control')
        assert.ok(await eventually(async () => (await w.call(OP.session, { sessionId: session.sessionId })).events.some((event) => event.type === EXPECT.userMessageEvent && event.text.includes(text))), 'the activity bump must accompany real delivery, not replace it')
        await w.call(OP.waitIdle, { sessionId: session.sessionId })
      })
    }
  })

  // DESIGN §3.2: "Each tool wraps today's connector domain function ... and keeps contract 1.2's
  // semantics, vocabularies and limits". K1 W4b-2: "only sessions the caller manages; an unmanaged
  // session and another principal's are forbidden to read". User S1, decision A (2026-11-17,
  // superseding the earlier "loads and warns once" wording): "the connector requires dsh-web-app
  // (its MCP endpoint is served on DSH's web server, and V2 is being removed): a profile without it
  // leaves the dsh-connector row pending, DSH's own missing-dependency state, present and enabled
  // but not active, and no connector service, V2 or V3, is provided".
  describe(`C-WIRE review Equivalence Partitioning [SDK ${sdk}]`, SERIAL, () => {
    test('S1 EP: a profile without dsh-web-app leaves the connector row pending and provides no connector service, V2 or V3', T, async () => {
      const w = await nonWebScenario(sdk, DATA.scenario.noWeb)
      const row = await w.call(OP.row)
      assert.deepEqual([row.present, row.disabled, row.active, row.pending], [true, false, false, true], 'the row is not in DSH\'s pending (missing-dependency) state: ' + JSON.stringify(row))
      const services = await w.call(OP.services, { names: [SURFACE.service.v2, ...V3_SERVICES] })
      for (const name of [SURFACE.service.v2, ...V3_SERVICES]) assert.equal(services[name].present, false, `a connector service is provided without dsh-web-app: ${name}`)
    })

    for (const [tool, description] of Object.entries(DESCRIPTION)) {
      test(`K1-DESCRIPTION EP: ${tool} has the exact frozen manage-only text`, T, async (t) => {
        assert.equal(K1.toolDefinition(tool).description, description, 'published K1 text drifted')
        const w = await accessWorld(sdk)
        const principal = await paired(t, w)
        const tools = (await principal.client.listTools({}, { timeout: BUDGET.rpcMs })).tools
        assert.equal(tools.find((entry) => entry.name === tool)?.description, description, 'wire text differs from the user-approved K1 requirement')
      })
    }

    for (const managedByOther of [false, true]) {
      test(`ACCESS EP: ${managedByOther ? 'another principal manages' : 'nobody manages'} the session — read forbidden and list omits it`, T, async (t) => {
        const w = await accessWorld(sdk)
        const caller = await paired(t, w)
        const session = await userSession(w)
        if (managedByOther) await handOver(w, session.sessionId, (await paired(t, w)).principalKey)
        const before = await managedOf(w)
        await refusedCall(caller.client, K1.TOOL.sessionRead, readArgs(session.sessionId), K1.REFUSAL.forbidden)
        assert.equal((await listedIds(caller.client)).includes(session.sessionId), false)
        assert.deepEqual(await managedOf(w), before, 'a read/list refusal changed management')
      })
    }
  })

  // DESIGN §5.5a: "the AS metadata's authorization_endpoint points at the approval listener";
  // "On loopback authorization_endpoint uses the client's hostname with the approval port".
  // User S12: "approval.port=0 AS metadata authorization_endpoint uses actual bound port, not 0".
  describe(`C-WIRE review Boundary Value Analysis [SDK ${sdk}]`, SERIAL, () => {
    test('S12 BVA: configured approval.port=0 advertises and serves its actual OS-bound positive port', T, async () => {
      const w = await scenario(sdk, DATA.scenario.port, { rowConfig: () => ({ [S.approval]: { [S.port]: EXPECT.portZero } }) })
      assert.equal((await w.settings()).value[S.approval][S.port], EXPECT.portZero)
      let boundPort
      for (const hostname of K1.HOSTS.loopbackNames.slice(0, -1)) {
        const metadata = await w.raw(K1.HTTP_METHOD.get, SCHEMA_TEXT.authorizationServer, { hostHeader: `${hostname}:${w.port}` })
        assert.equal(metadata.status, K1.HTTP_STATUS.ok, metadata.text)
        const endpoint = new URL(metadata.json.authorization_endpoint)
        assert.equal(endpoint.hostname, hostname)
        assert.equal(endpoint.pathname, K1.PATHS.authorize)
        assert.equal(endpoint.protocol, K1.HOSTS.loopbackScheme)
        const advertisedPort = Number(endpoint.port)
        assert.ok(Number.isInteger(advertisedPort) && advertisedPort > EXPECT.portZero && advertisedPort <= S.portMax, 'metadata advertises configured 0 instead of a real bound port')
        // The first hostname only supplies a candidate. A real /authorize response verifies it.
        const port = boundPort ?? advertisedPort
        const page = await w.approval(K1.HTTP_METHOD.get, K1.PATHS.authorize, { port, hostHeader: endpoint.host })
        assert.equal(page.status, K1.HTTP_STATUS.badRequest, page.text)
        assert.equal(page.headers['cache-control'], K1.APPROVAL_LISTENER.headers['cache-control'])
        boundPort = port
        assert.equal(advertisedPort, boundPort, 'changing the loopback hostname changed the advertised port')
      }
      const explicitPort = await freePort()
      assert.equal((await w.call(OP.settingsUpdate, { patch: { [S.approval]: { [S.port]: explicitPort } } })).ok, true)
      assert.ok(await eventually(async () => {
        const metadata = await w.raw(K1.HTTP_METHOD.get, SCHEMA_TEXT.authorizationServer)
        if (metadata.status !== K1.HTTP_STATUS.ok || new URL(metadata.json.authorization_endpoint).port !== String(explicitPort)) return false
        const page = await w.approval(K1.HTTP_METHOD.get, K1.PATHS.authorize, { port: explicitPort }).catch(() => null)
        return page?.status === K1.HTTP_STATUS.badRequest
      }), 'metadata and the actual approval listener failed to follow a live switch from zero to an explicit port')
      const page = await w.approval(K1.HTTP_METHOD.get, K1.PATHS.authorize, { port: explicitPort })
      assert.equal(page.status, K1.HTTP_STATUS.badRequest, page.text)
    })
  })

  // DESIGN §3.2: "Each tool ... keeps contract 1.2's semantics". K1 SETTINGS_REFUSAL: "A settings
  // save ... is refused, the previous list is written back"; SettingsWriter: "Every method resolves
  // only once the document is saved ... and the token registry's sync ... has resolved".
  // User S5: "user duplicate save racing own createHosted write is REFUSED/not ingested";
  // prompt decision: "Agent不能回答不归自己管的会话，只能操作自己管的会话"; unmanaged → not-managed.
  describe(`C-WIRE review Decision Table [SDK ${sdk}]`, SERIAL, () => {
    test('S5 DT R1: user duplicate racing own createHosted save is REFUSED, never ingested', T, async (t) => {
      const w = await scenario(sdk, DATA.scenario.race)
      const original = await paired(t, w)
      const token = original.made
      const before = await tokensOf(w)
      const label = fresh(DATA.copyLabel)
      const raced = await w.call(OP.raceHostedUserSave, { instanceId: DATA.hostedInstance, tokens: duplicateOf(before, token.entryKey, label) })
      // The native save really completed, but its acknowledgement stayed held during the user save.
      // Merely launching both calls in one tick would not prove the own-settings window was reached.
      assert.equal(raced.held, true, 'fixture did not hold an actual native own settings-save acknowledgement')
      assert.ok(raced.hosted?.made, 'valid own creation must resolve with its hosted entry: ' + JSON.stringify(raced))
      const made = raced.hosted.made
      const expected = [...before, { label: SURFACE.k3.hostedLabel, enabled: true, key: made.entryKey }]
      await assertDuplicateRefused(w, expected, label)
      assert.equal((await noticeOf(w)).notice.code, K1.SETTINGS_REFUSAL.tokenDuplicate)
      const state = await stateOf(w)
      const originalEntry = state.entries.find((entry) => entry.key === token.entryKey)
      assert.deepEqual([originalEntry.paired, originalEntry.id], [true, original.id], 'the refused duplicate changed the previous principal pair')
      // A fresh exchange proves the original value still authenticates, not just its earlier bearer.
      const again = await connect(t, w, { id: original.id, value: token.value })
      assert.deepEqual((await okCall(again, K1.TOOL.inboxPoll)).events, [])
      const hostedId = fresh()
      const hostedClient = await connect(t, w, { id: hostedId, value: made.value })
      assert.equal((await okCall(hostedClient, K1.TOOL.pair)).id, hostedId, 'the successful hosted token no longer authenticates or pairs after refusal')
      const disabled = expected.map((entry) => entry.key === token.entryKey ? { ...entry, enabled: false } : entry)
      assert.equal((await saveTokens(w, disabled)).ok, true)
      assert.ok(await eventually(async () => (await stateOf(w)).entries.find((entry) => entry.key === token.entryKey)?.enabled === false), 'own-write protection swallowed the next real user save')
      assert.deepEqual(await tokensOf(w), disabled)
    })

    test('PROMPT DT R2: prompt_answer on an unmanaged session returns not-managed and acquires no authority', T, async (t) => {
      const w = await accessWorld(sdk)
      const principal = await paired(t, w)
      const session = await userSession(w)
      const beforeManaged = await managedOf(w)
      const beforeSession = await w.call(OP.session, { sessionId: session.sessionId })
      // A non-empty unknown id isolates authorization precedence; this row claims no real prompt settlement.
      await refusedCall(principal.client, K1.TOOL.promptAnswer, { sessionId: session.sessionId, promptId: DATA.promptId, decision: DECISION.allow, reason: FIXTURE.reason, risk: RISK.low }, K1.REFUSAL.notManaged)
      assert.deepEqual(await managedOf(w), beforeManaged, 'answering a session nobody manages acquired management')
      assert.deepEqual(await w.call(OP.session, { sessionId: session.sessionId }), beforeSession, 'refused answer changed the session')
    })
  })

  // DESIGN §3.2: "session_start makes the caller the managing principal". K1 W4b-2: "only sessions
  // the caller manages; an unmanaged session ... [is] forbidden to read"; tools.js: "Give a session
  // you manage back to the user, with a reason"; "Sessions nobody manages ... are omitted".
  describe(`C-WIRE review State Transition [SDK ${sdk}]`, SERIAL, () => {
    test('ACCESS ST: Managed → release → Unmanaged immediately revokes read and list access', T, async (t) => {
      const w = await accessWorld(sdk)
      const principal = await paired(t, w)
      const session = await managedSession(w, principal.principalKey)
      assert.ok((await read(principal.client, session.sessionId)).messages.length > 0)
      assert.ok((await listedIds(principal.client)).includes(session.sessionId))
      assert.equal((await okCall(principal.client, K1.TOOL.sessionRelease, { sessionId: session.sessionId, reason: FIXTURE.reason })).managed, false)
      await refusedCall(principal.client, K1.TOOL.sessionRead, readArgs(session.sessionId), K1.REFUSAL.forbidden)
      assert.equal((await listedIds(principal.client)).includes(session.sessionId), false)
      assert.equal((await managedOf(w)).some((entry) => entry.sessionId === session.sessionId), false)
    })

    test('ACCESS ST: Unmanaged → owner Hand over → Managed grants read and list only after handover', T, async (t) => {
      const w = await accessWorld(sdk)
      const principal = await paired(t, w)
      const session = await userSession(w)
      await refusedCall(principal.client, K1.TOOL.sessionRead, readArgs(session.sessionId), K1.REFUSAL.forbidden)
      assert.equal((await listedIds(principal.client)).includes(session.sessionId), false)
      await handOver(w, session.sessionId, principal.principalKey)
      assert.ok((await read(principal.client, session.sessionId)).messages.some((message) => message.text.includes(DATA.userText)))
      assert.ok((await listedIds(principal.client)).includes(session.sessionId))
    })
  })

  // K1 QUEUE: "offers always reach their manager's mailbox (R-CON-09 'always')". The user (2026-11-16/17):
  // "No cap on pending approvals. Requests from managed sessions wait in the queue indefinitely and are
  // never refused for being too many". Made real by C-WIRE-2 on the interactions world (its asking fixture
  // tools and stock-prompt stand-in; test/v3/dsh-connector/interactions/subject.mjs).
  describe(`C-WIRE future: no cap on pending approvals [SDK ${sdk}]`, SERIAL, () => {
    test(`C-WIRE-2 BVA: ${FUTURE.noCapCount} pending requests of managed sessions (V2's cap was ${FUTURE.v2Cap}) are all offered and listed; none goes to the stock prompt`, T, async (t) => {
      const w = await IXS.world(sdk, DATA.scenario.noCap)
      const p = await IXS.principal(t, w)
      const reqs = []
      for (let i = 0; i < FUTURE.noCapCount; i++) reqs.push(await IXS.asked(w, p, await IXS.managed(w, p)))
      for (const r of reqs) assert.ok(await IXS.isListed(p, r), 'not offered: ' + r.text)
      for (const r of reqs) assert.deepEqual(await IXS.stockFor(w, r.text), [], 'refused to the stock prompt: ' + r.text)
      assert.equal(Object.hasOwn((await w.settings()).value, FUTURE.capField), false, 'maxPendingApprovals is still a setting')
      for (const r of reqs) await IXS.free(w, r.sid)
    })
  })

  // The user (2026-11-16/17): "list_user_messages is deleted"; "不给ask_agent工具". K1 tools.js's closed
  // tool list contains neither. Made real by C-WIRE-2: a managed session's model request and the MCP list.
  describe(`C-WIRE future: list_user_messages deleted [SDK ${sdk}]`, SERIAL, () => {
    test('C-WIRE-2 EP: a managed session\'s next model request has message_agent and neither list_user_messages nor ask_agent; tools/list has neither', T, async (t) => {
      const w = await IXS.world(sdk, DATA.scenario.noCap)
      const p = await IXS.principal(t, w)
      const sid = await IXS.managed(w, p)
      await IXS.turn(w, sid, [[{ text: IXS.tok('hi') }]])
      const names = (await w.call(OP.requestTools, { sessionId: sid })).at(-1).map((tool) => tool.name)
      assert.ok(names.includes(FUTURE.messageTool), 'no ' + FUTURE.messageTool)
      for (const gone of FUTURE.deletedTools) assert.equal(names.includes(gone), false, gone + ' is still a session tool')
      const listed = (await p.client.listTools({}, { timeout: BUDGET.rpcMs })).tools.map((tool) => tool.name)
      for (const gone of FUTURE.deletedTools) {
        assert.equal(listed.includes(gone), false, gone + ' is an MCP tool')
        assert.equal(K1.TOOL_NAMES.includes(gone), false, gone + ' is in K1')
      }
    })
  })
}
