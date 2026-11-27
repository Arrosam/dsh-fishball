/**
 * R-FIX-CONNECTOR black-box rows for review finding F02 (.runtime/reports/review-x-dsh-connector.md):
 * "an agent can operate only on sessions it manages". For a tool naming session S, who manages S is
 * checked again after every awaited DSH lookup and right before every side effect or before read
 * data is returned. Expected outcomes are the relayed requirement, not the implementation:
 * - P manages S; while one awaited lookup of P's call is held, S is taken back (unmanaged) → acting
 *   tools answer `not-managed`, reading tools (session_read, attachment_read) `forbidden`; or taken
 *   back and handed over to Q → `forbidden`. Either way no side effect happens (no message, no
 *   redirect, no stop, nothing answered) and no read data is returned;
 * - with no change during the call every tool works as before;
 * - sessions_list leaves out a session whose manager changed while it was described.
 *
 * Level: the real core tools on C-HTTP's real endpoint, the installed SDK's stock MCP client over real
 * HTTP (subject.mjs `toolsWorld`), with a FAKE domain port that follows the documented port shape
 * (mcp/tools/index.js): each awaited lookup can be held (a deferred promise), `admit()` is called at
 * the documented points (after each await, right before the side effect), and every side effect is
 * recorded. ManagedState is the suite's FakeManaged (K1c contract).
 *
 * Techniques: Decision Table (tool × held lookup × management change), State Transition (Managed →
 * call held → Unmanaged / Managed-by-Q → call resumes), Equivalence Partitioning (acting vs reading
 * tools; no change).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { assertRefusal, assertSuccess } from './cases.mjs'
import { DECISION, FIXTURE, REFUSAL, REVIEW_X as RX, RISK, TOOL } from './constants.mjs'
import { toolsWorld } from './subject.mjs'

const G = RX.gate
const E = RX.effect

/** A deferred promise: `{promise, resolve}`. */
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

/**
 * The fake domain port (index.js's shape). `hold(gate)` makes the next lookup of that gate wait;
 * it resolves `{reached, release()}`. `effects` lists every side effect that ran, as `[effect, sessionId]`.
 */
function fakeDomain() {
  const holds = new Map()
  const effects = []
  /** The awaited lookup of `gate`: held when a row asked for it, else one turn of the event loop. */
  const lookup = async (gate) => {
    const h = holds.get(gate)
    if (h === undefined) return
    holds.delete(gate)
    h.reached.resolve()
    await h.opened.promise
  }
  const summary = (sessionId) => ({ sessionId, title: RX.title, workspaceId: null, running: false, pendingInteraction: false })
  const prompt = { promptId: RX.promptId, sessionId: FIXTURE.s1, title: RX.title, toolName: RX.toolName, argumentsStatus: 'complete', since: FIXTURE.t0, managed: true }
  /** One delivery as the port documents it: admit after the await, and right before the side effect. */
  const deliver = (effect) => async ({ sessionId, admit }) => {
    await lookup(G.deliver)
    admit()
    effects.push([effect, sessionId])
    return { status: 'delivered' }
  }
  const domain = {
    sessions: {
      rootOf: (sessionId) => sessionId,
      async describe(sessionId) { await lookup(G.describe); return summary(sessionId) },
      message: deliver(E.message),
      redirect: deliver(E.redirect),
      async stop({ sessionId, admit }) { await lookup(G.stop); admit(); effects.push([E.stop, sessionId]) },
      async read({ sessionId }) { await lookup(G.read); effects.push([E.read, sessionId]); return { messages: [{ seq: 1, role: 'user', author: 'user', text: RX.title, images: [] }], truncated: false } },
    },
    interactions: {
      liveOffers: () => [],
      async listPrompts() { await lookup(G.prompts); return [prompt] },
      answerPrompt({ promptId, decision }) { effects.push([E.prompt, promptId]); return { ok: true, promptId, decision, managed: true } },
      listGrants: async () => [],
      revokeGrant: async () => ({ ok: false, code: REFUSAL.grantUnknown }),
      answerApproval: async () => ({ ok: false, code: REFUSAL.expired }),
      answerQuestion: async () => ({ ok: false, code: REFUSAL.expired }),
    },
    attachments: {
      put: async () => { throw new Error('not used') },
      async read({ sessionId, attachmentId }) {
        await lookup(G.attachment)
        effects.push([E.attachment, sessionId])
        return { attachmentId, mediaType: RX.mediaType, total: 1, sha256: RX.sha256, chunks: [RX.chunk] }
      },
    },
  }
  return {
    domain,
    effects,
    hold(gate) {
      const h = { reached: deferred(), opened: deferred() }
      holds.set(gate, h)
      return { reached: h.reached.promise, release: () => h.opened.resolve() }
    },
  }
}

/** The tools as the decision table names them: the call, the lookup to hold, acting or reading. */
const readArgs = () => ({ sessionId: FIXTURE.s1, maxMessages: FIXTURE.maxMessages, maxBytes: FIXTURE.maxBytes })
const TOOLS = Object.freeze([
  { tool: TOOL.sessionMessage, args: () => ({ sessionId: FIXTURE.s1, message: FIXTURE.message, attachments: [] }), gates: [G.describe, G.deliver], reading: false },
  { tool: TOOL.sessionRedirect, args: () => ({ sessionId: FIXTURE.s1, message: FIXTURE.message, attachments: [] }), gates: [G.describe, G.deliver], reading: false },
  { tool: TOOL.sessionStop, args: () => ({ sessionId: FIXTURE.s1 }), gates: [G.describe, G.stop], reading: false },
  { tool: TOOL.sessionRead, args: readArgs, gates: [G.describe, G.read], reading: true },
  { tool: TOOL.attachmentRead, args: () => ({ sessionId: FIXTURE.s1, attachmentId: RX.attachmentId }), gates: [G.describe, G.attachment], reading: true },
  { tool: TOOL.promptAnswer, args: () => ({ sessionId: FIXTURE.s1, promptId: RX.promptId, decision: DECISION.allow, risk: RISK.low, reason: FIXTURE.reason }), gates: [G.describe, G.prompts], reading: false },
])

/** P (and Q) paired and connected over a fake domain; P manages S1. */
async function world(t, sdk) {
  const fake = fakeDomain()
  const w = await toolsWorld(t, sdk, { domain: fake.domain })
  const p = await w.full(FIXTURE.idP, FIXTURE.nameP)
  const q = await w.full(FIXTURE.idQ, FIXTURE.nameQ)
  assert.equal((await w.managed.manage(FIXTURE.s1, p.principalKey)).ok, true)
  return { w, fake, p, q, pc: await w.connect(p.token) }
}
/** S1 leaves P while the call is held: taken back, or taken back and handed over to Q. */
async function change(x, kind) {
  assert.equal((await x.w.managed.release(FIXTURE.s1, x.p.principalKey)).ok, true)
  if (kind === RX.change.handOver) assert.equal((await x.w.managed.manage(FIXTURE.s1, x.q.principalKey)).ok, true)
}
const call = (x, spec) => x.pc.callTool({ name: spec.tool, arguments: spec.args() })
/** No read data in a refused read: no message text, no chunk. */
const assertNoData = (result) => {
  const text = JSON.stringify(result)
  assert.ok(!text.includes(RX.chunk) && !text.includes('"messages"'), `read data was returned: ${text}`)
}

function decisionTable(sdk) {
  for (const spec of TOOLS) {
    for (const gate of spec.gates) {
      for (const kind of Object.values(RX.change)) {
        const code = kind === RX.change.handOver || spec.reading ? REFUSAL.forbidden : REFUSAL.notManaged
        caseTest(sdk, 'RX-F02', `DT (${spec.tool}, ${gate} held, ${kind})`, `→ ${code}; no side effect, no data`, async (t) => {
          const x = await world(t, sdk)
          const held = x.fake.hold(gate)
          const answering = call(x, spec)
          await held.reached
          await change(x, kind)
          held.release()
          const result = await answering
          assertRefusal(result, code)
          if (spec.reading) assertNoData(result)
          assert.deepEqual(x.fake.effects.filter(([e]) => e !== E.read && e !== E.attachment), [], 'a side effect ran though the caller no longer manages the session')
        })
      }
    }
    caseTest(sdk, 'RX-F02', `EP (${spec.tool}, no change)`, 'with no management change the tool works as before', async (t) => {
      const x = await world(t, sdk)
      assertSuccess(await call(x, spec))
    })
  }
}

function sessionsList(sdk) {
  caseTest(sdk, 'RX-F02', 'DT (sessions_list, manager changed while described)', 'S1 taken back and handed to Q while its summary is read → P\'s list leaves S1 out', async (t) => {
    const x = await world(t, sdk)
    const held = x.fake.hold(G.describe)
    const listing = x.pc.callTool({ name: TOOL.sessionsList, arguments: { limit: 1 } })
    await held.reached
    await change(x, RX.change.handOver)
    held.release()
    const s = assertSuccess(await listing)
    assert.deepEqual(s.sessions.map((r) => r.sessionId), [], 'sessions_list listed a session another principal manages now')
  })
  caseTest(sdk, 'RX-F02', 'EP (sessions_list, no change)', 'P\'s list holds S1', async (t) => {
    const x = await world(t, sdk)
    const s = assertSuccess(await x.pc.callTool({ name: TOOL.sessionsList, arguments: { limit: 1 } }))
    assert.deepEqual(s.sessions.map((r) => r.sessionId), [FIXTURE.s1])
  })
}

/** Every R-FIX-CONNECTOR review row of the mcp-tools suite for `sdk`. */
export function registerReviewXToolsCases(sdk) {
  decisionTable(sdk)
  sessionsList(sdk)
}
