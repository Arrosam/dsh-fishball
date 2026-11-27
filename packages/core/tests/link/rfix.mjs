/**
 * R-FIX-CORE black-box rows for the link (review findings F02, F03, F04; acceptance criteria in
 * the task's requirements, .rfix-requirements.md):
 * - F02: after the gate admits an attempt the link lists tools again before it listens and
 *   reports `connected`; a held attempt does not list again;
 * - F03: every (re)connect and events hint drains the mailbox page by page (`hasMore` /
 *   `nextCursor`), restarts once on `resync`, ends on a missing or repeated cursor, is single
 *   flight, emits nothing once overtaken, and ends on a failed page;
 * - F04: an authentication refusal of a call or poll of the connected link tears it down, calls
 *   `refused()` once, reports `token-refused` (`token-revoked` when the gate says paired) and
 *   retries with backoff; any other failure leaves it connected.
 *
 * Level: unit, core's real `createLink` against F-LINK's fake connector (fake-connector.mjs) with
 * its R-FIX-CORE hooks (`tools`, `onTool`, `onRpc`, `hint`, `revokeAccess`, `acceptSecret`).
 * Expected values come from the requirements only; the words are K1's and K3a's (constants.mjs).
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from 'fishball-test-helpers/cases'
import { ANSWER, CODE, HARNESS, K1, LINK, LINK_BACKOFF, PRINCIPAL, RPC, STATE, TARGET, mcpUrl } from './constants.mjs'
import { startFakeConnector } from './fake-connector.mjs'
import { defer, mcpClient, openRawLink, untilState, untilTrue } from './link-driver.mjs'

/** Fixture words of these rows (test data, not product values). */
const RFIX = Object.freeze({
  ref: 'fbtest-rfix-ref',
  held: Object.freeze({ state: STATE.unset, code: 'fbtest-rfix-held' }),
  cursor: (n) => 'fbtest-rfix-c' + n,
  overtaken: 'fbtest-rfix-overtaken',
  end: 'fbtest-rfix-end',
  serverError: 500,
  jsonRpcInternal: -32603,
})
const POLL = K1.TOOL.inboxPoll
const WWW_AUTHENTICATE = 'www-authenticate'
const PROBE = Object.freeze({
  testId: 'LINK-PROBE', name: K1.TOOL.sessionRead, capability: 'forTurnEventId', missing: 'notAdvertised',
  args: Object.freeze({ sessionId: 'fbtest-session', forTurnEventId: 'fbtest-turn', maxMessages: 1, maxBytes: 1024 }),
  reply: Object.freeze({ messages: Object.freeze([]), truncated: false, ok: true }),
})
const probeTools = () => K1.TOOLS.map((tool) => (tool.name === PROBE.name ? {
  ...tool, inputSchema: { ...tool.inputSchema, properties: { ...tool.inputSchema.properties, [PROBE.capability]: { type: 'string' } } },
} : tool))
const probe = (raw, options = {}) => raw.link.probeTool(PROBE.name, PROBE.args, { capability: PROBE.capability, ...options })

/** A fake connector with the R-FIX-CORE hooks; `hooks(f)` may read the started fake. */
async function fake(t, hooks = () => ({})) {
  const box = {}
  const f = await startFakeConnector(hooks(box))
  box.f = f
  defer(t, () => f.stop())
  return f
}

/**
 * A raw link to `f` as the cases' principal. `timers: 'real'` (default) runs retries and any
 * continuation on real timers; `'fake'` holds them (`raw.pending()`, F-FIX-3's driver).
 * `refused` counts the credential's refused() hook.
 */
async function rawLink(t, f, { gate, timers = 'real', customizeClient = (client) => client } = {}) {
  const url = mcpUrl(K1.HOSTS.loopbackScheme, TARGET.anyLoopback, f.port)
  const counts = { refused: 0 }
  const credentials = async () => ({ clientId: PRINCIPAL.clientId, secret: PRINCIPAL.secret, ref: RFIX.ref, refused: () => { counts.refused += 1 }, accepted: () => {} })
  const real = timers === 'real' ? { setTimer: (fn, ms) => setTimeout(fn, ms), clearTimer: (h) => clearTimeout(h) } : {}
  const raw = await openRawLink(t, { target: () => url, credentials, sdk: customizeClient(await mcpClient()), ...(gate === undefined ? {} : { gate }), ...real })
  const polls = []
  raw.link.onPoll((page) => polls.push(page))
  return { ...raw, counts, polls }
}

const rpcOf = (r) => { try { return JSON.parse(r.body || '{}') } catch { return {} } }
/** The index in `f.requests` of every MCP request with JSON-RPC `method`. */
const requestsOf = (f, method) => f.requests.map((r, i) => [i, rpcOf(r)]).filter(([, m]) => m.method === method).map(([i]) => i)
const listCalls = (f) => requestsOf(f, RPC.toolsList).length
const pollArgs = (f) => f.callsOf(POLL).map((c) => c.args ?? {})
const toolNames = (tools) => (tools ?? []).map((tool) => tool.name).sort()

/** A connected link whose connect drain is over (the first page answered). */
async function connectedRaw(t, f, options) {
  const raw = await rawLink(t, f, options)
  raw.link.start()
  await untilState(raw.link, STATE.connected)
  return raw
}

/** A one-shot gate: `wait()` holds a fake tool call until `open()`. */
function holdOnce() {
  const reached = Promise.withResolvers()
  const released = Promise.withResolvers()
  let used = false
  return {
    async wait() { if (used) return false; used = true; reached.resolve(); await released.promise; return true },
    reached: reached.promise,
    open: () => released.resolve(),
  }
}

export function registerRfixLinkCases() {
  // ================================================================ F02: re-list after admission
  /** A connector where a fresh token lists only `pair` until it is paired (connector dispatch). */
  const pairingConnector = (t) => {
    const state = { paired: false }
    return fake(t, () => ({
      tools: () => (state.paired ? K1.TOOLS : K1.TOOLS.filter((tool) => K1.PAIR_ONLY.tools.includes(tool.name))),
      onTool: (name) => {
        if (name !== K1.TOOL.pair) return undefined
        state.paired = true
        return { paired: true, id: PRINCIPAL.clientId, name: null }
      },
    }))
  }
  const pairingGate = { hold: async () => null, paired: async () => false, admit: async (_a, session) => { await session.call(K1.TOOL.pair, {}); return null } }

  caseTest('RFIX-F02-ST-01', 'pair succeeded', 'pair-only list → gate pairs → the link lists tools again before it listens; connected with the full list; onTools fired with it', async (t) => {
    const f = await pairingConnector(t)
    const raw = await rawLink(t, f, { gate: pairingGate })
    const seen = []
    raw.link.onTools((tools) => seen.push(toolNames(tools)))
    let toolsAtConnected
    raw.link.onStatus((s) => { if (s.state === STATE.connected && toolsAtConnected === undefined) toolsAtConnected = toolNames(raw.link.tools()) })
    raw.link.start()
    await untilState(raw.link, STATE.connected)
    const full = toolNames(K1.TOOLS)
    assert.equal(listCalls(f), 2, 'tools/list requests (before and after the gate admitted)')
    const [, second] = requestsOf(f, RPC.toolsList)
    const [listen] = requestsOf(f, RPC.listen)
    assert.ok(second < listen, `the second tools/list (request #${second}) came after the listen (#${listen})`)
    assert.deepEqual(toolsAtConnected, full, 'link.tools() when connected was reported')
    assert.deepEqual(toolNames(raw.link.tools()), full)
    assert.deepEqual(seen.at(-1), full, 'the last onTools call')
  })
  caseTest('RFIX-F02-ST-01', 'record exists', 'the gate admits without pairing (a record exists) → tools are listed again after admission too', async (t) => {
    const f = await fake(t)
    const raw = await rawLink(t, f, { gate: { hold: async () => null, paired: async () => false, admit: async () => null } })
    raw.link.start()
    await untilState(raw.link, STATE.connected)
    assert.equal(listCalls(f), 2, 'tools/list requests')
    assert.deepEqual(toolNames(raw.link.tools()), toolNames(K1.TOOLS))
  })
  caseTest('RFIX-F02-ST-01', 'held', 'the gate holds the attempt after the first list → no second tools/list, no listen, not connected', async (t) => {
    const f = await pairingConnector(t)
    const raw = await rawLink(t, f, { gate: { hold: async () => null, paired: async () => false, admit: async () => RFIX.held } })
    raw.link.start()
    assert.ok(await untilTrue(() => raw.link.status()?.code === RFIX.held.code), 'the hold was not reported: ' + JSON.stringify(raw.link.status()))
    await sleep(HARNESS.quietMs)
    assert.equal(listCalls(f), 1, 'tools/list requests of a held attempt')
    assert.deepEqual(requestsOf(f, RPC.listen), [], 'a held attempt listened')
  })

  // ================================================================ F03: the mailbox drain
  /** A connector whose inbox_poll answers `pageOf(cursor, n)` (n = the poll's 1-based count). */
  const pagedConnector = (t, pageOf, more = () => ({})) => {
    let n = 0
    return fake(t, (box) => ({ onTool: async (name, args) => (name === POLL ? pageOf(args?.cursor, ++n, box) : undefined), ...more(box) }))
  }
  const page = (nextCursor, hasMore, extra = {}) => ({ events: [], hasMore, ...(nextCursor === undefined ? {} : { nextCursor }), ...extra })
  /** `pages` pages: page k (1-based) is answered for cursor k−1 and names cursor k; the last has hasMore false. */
  const chain = (pages) => (cursor) => {
    const k = cursor === undefined ? 1 : Number(cursor.slice(RFIX.cursor('').length)) + 1
    return page(RFIX.cursor(k), k < pages)
  }
  const expectedArgs = (pages) => Array.from({ length: pages }, (_, i) => (i === 0 ? {} : { cursor: RFIX.cursor(i) }))

  for (const pages of [1, 2, 3]) {
    caseTest('RFIX-F03-BVA-01', `${pages} page${pages === 1 ? '' : 's'}`, `a backlog of ${pages} page${pages === 1 ? '' : 's'} on connect → ${pages} poll${pages === 1 ? '' : 's'} following nextCursor; each page to onPoll in order`, async (t) => {
      const f = await pagedConnector(t, chain(pages))
      const raw = await connectedRaw(t, f)
      await untilTrue(() => raw.polls.length >= pages)
      await sleep(HARNESS.quietMs)
      assert.deepEqual(pollArgs(f), expectedArgs(pages), 'inbox_poll arguments, in order')
      assert.deepEqual(raw.polls.map((p) => p.nextCursor), expectedArgs(pages + 1).slice(1).map((a) => a.cursor), 'onPoll pages, in order')
    })
  }
  caseTest('RFIX-F03-BVA-01', 'hint', 'an events hint on the open link drains too: from no cursor, following nextCursor', async (t) => {
    let draining = false
    const f = await pagedConnector(t, (cursor) => (draining ? chain(2)(cursor) : page(RFIX.end, false)))
    const raw = await connectedRaw(t, f)
    await untilTrue(() => raw.polls.length >= 1)
    const from = f.callsOf(POLL).length
    draining = true
    f.hint()
    assert.ok(await untilTrue(() => f.callsOf(POLL).length >= from + 2), 'the hint did not drain two pages: ' + JSON.stringify(pollArgs(f)))
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f).slice(from), expectedArgs(2))
  })

  caseTest('RFIX-F03-DT-01', 'rule 1 (resync once)', 'the first page answers resync → the drain restarts once from no cursor, then follows the pages', async (t) => {
    const f = await pagedConnector(t, (cursor, n) => (n === 1 ? { resync: { reason: K1.RESYNC_REASON.staleCursor, headSequence: 0 } } : chain(2)(cursor)))
    const raw = await connectedRaw(t, f)
    await untilTrue(() => f.callsOf(POLL).length >= 3)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f), [{}, ...expectedArgs(2)])
    assert.equal(raw.link.status().state, STATE.connected)
  })
  caseTest('RFIX-F03-DT-01', 'rule 2 (resync every time)', 'every page answers resync → one restart only: two polls, then the drain ends (no loop)', async (t) => {
    const f = await pagedConnector(t, () => ({ resync: { reason: K1.RESYNC_REASON.staleCursor, headSequence: 0 } }))
    await connectedRaw(t, f)
    await untilTrue(() => f.callsOf(POLL).length >= 2)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f), [{}, {}])
  })
  caseTest('RFIX-F03-DT-01', 'rule 3 (no nextCursor)', 'hasMore true but no nextCursor → the drain ends after that page', async (t) => {
    const f = await pagedConnector(t, () => page(undefined, true))
    await connectedRaw(t, f)
    await untilTrue(() => f.callsOf(POLL).length >= 1)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f), [{}])
  })
  caseTest('RFIX-F03-DT-01', 'rule 4 (same cursor)', 'hasMore true and nextCursor equal to the cursor just sent → the drain ends (no loop)', async (t) => {
    const f = await pagedConnector(t, () => page(RFIX.cursor(1), true))
    await connectedRaw(t, f)
    await untilTrue(() => f.callsOf(POLL).length >= 2)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f), [{}, { cursor: RFIX.cursor(1) }])
  })
  caseTest('RFIX-F03-DT-01', 'rule 5 (failed page)', 'page 2 fails (HTTP 500) → the drain ends there; the link stays connected; the next hint polls again from no cursor', async (t) => {
    const f = await pagedConnector(t, chain(3), () => ({
      onRpc: (m) => (m.method === RPC.toolsCall && m.params?.name === POLL && m.params?.arguments?.cursor === RFIX.cursor(1) ? { status: RFIX.serverError, body: {} } : undefined),
    }))
    const raw = await connectedRaw(t, f)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(pollArgs(f), [{}], 'tools/call inbox_poll reaching the tool (the failed one is answered before it)')
    assert.equal(raw.link.status().state, STATE.connected, 'a failed page took the link down')
    f.hint()
    assert.ok(await untilTrue(() => f.callsOf(POLL).length >= 2), 'the hint after a failed page did not poll')
    assert.deepEqual(pollArgs(f)[1], {})
  })

  caseTest('RFIX-F03-ST-01', 'single flight', 'three hints while the connect drain is held → never two polls at once; exactly one more drain (from no cursor) after it', async (t) => {
    const hold = holdOnce()
    let inFlight = 0
    let most = 0
    const f = await pagedConnector(t, async () => {
      inFlight += 1
      most = Math.max(most, inFlight)
      await hold.wait()
      inFlight -= 1
      return page(RFIX.end, false)
    })
    const raw = await rawLink(t, f)
    raw.link.start()
    await hold.reached
    for (let i = 0; i < 3; i++) f.hint()
    await sleep(HARNESS.quietMs)
    hold.open()
    await untilTrue(() => f.callsOf(POLL).length >= 2)
    await sleep(HARNESS.quietMs)
    assert.equal(most, 1, 'polls in flight at once')
    assert.deepEqual(pollArgs(f), [{}, {}], 'one drain on connect and exactly one after the hints')
  })
  for (const how of ['reconnect', 'stop']) {
    caseTest('RFIX-F03-ST-01', `overtaken (${how})`, `a drain overtaken by ${how}() while its page 2 is in flight emits nothing more`, async (t) => {
      const hold = holdOnce()
      const f = await pagedConnector(t, async (cursor) => {
        if (cursor === undefined) return page(RFIX.cursor(1), true)
        return (await hold.wait()) ? page(RFIX.overtaken, false) : page(RFIX.end, false)
      })
      const raw = await rawLink(t, f)
      raw.link.start()
      await hold.reached
      if (how === 'reconnect') raw.link.reconnect(); else await raw.link.stop()
      hold.open()
      await sleep(HARNESS.quietMs)
      if (how === 'reconnect') await untilState(raw.link, STATE.connected)
      await sleep(HARNESS.quietMs)
      assert.deepEqual(raw.polls.filter((p) => p.nextCursor === RFIX.overtaken), [], 'the overtaken page reached onPoll')
    })
  }

  // ================================================================ F04: runtime authentication refusal
  /** Breaks the connected link's authority for real: every access token dies and the secret is refused. */
  const revoke = (f) => { f.revokeAccess(); f.acceptSecret(false) }
  /** A 403 insufficient_scope answer to every tools/call while `box.forbid` is set. */
  const forbidding = (box) => ({
    onRpc: (m) => (box.forbid && m.method === RPC.toolsCall
      ? { status: K1.HTTP_STATUS.forbidden, body: {}, headers: { [WWW_AUTHENTICATE]: K1.insufficientScopeChallenge(box.f.origin(TARGET.anyLoopback), K1.INSUFFICIENT_SCOPE_REASON.idMismatch) } }
      : undefined),
  })
  async function assertRefusedAtRuntime(raw, code) {
    const status = await untilState(raw.link, STATE.refused)
    assert.equal(status.code, code)
    assert.equal(raw.counts.refused, 1, 'refused() hook calls')
  }
  const call = (raw) => raw.link.callTool(K1.TOOL.approvalAnswer, ANSWER)

  caseTest('RFIX-F04-EP-01', 1, `a call meets 401 and the token request answers ${K1.OAUTH_ERROR.invalidClient} → the call rejects; ${STATE.refused} / ${CODE.refused}; refused() once; a retry at the backoff's first delay`, async (t) => {
    const f = await fake(t)
    const raw = await connectedRaw(t, f, { timers: 'fake' })
    revoke(f)
    await assert.rejects(call(raw), 'callTool resolved after an authentication refusal')
    await assertRefusedAtRuntime(raw, CODE.refused)
    assert.ok(await untilTrue(() => raw.pending().some((h) => h.ms === LINK_BACKOFF.initialMs)), 'no retry at the first backoff delay: ' + JSON.stringify(raw.pending().map((h) => h.ms)))
  })
  caseTest('RFIX-F04-EP-01', 2, `a call answered 403 insufficient_scope → the call rejects; ${STATE.refused}; refused() once`, async (t) => {
    let box
    const f = await fake(t, (b) => { box = b; return forbidding(b) })
    const raw = await connectedRaw(t, f, { timers: 'fake' })
    box.forbid = true
    await assert.rejects(call(raw))
    await assertRefusedAtRuntime(raw, CODE.refused)
  })
  caseTest('RFIX-F04-EP-01', 3, `a poll after an events hint meets the refusal → ${STATE.refused}; refused() once; the open listen stream does not keep it connected`, async (t) => {
    const f = await fake(t)
    const raw = await connectedRaw(t, f, { timers: 'fake' })
    await untilTrue(() => f.callsOf(POLL).length >= 1)
    revoke(f)
    f.hint()
    await assertRefusedAtRuntime(raw, CODE.refused)
  })
  caseTest('RFIX-F04-EP-01', 4, `the gate says the refused credential was paired → ${STATE.refused} / ${LINK.code.revoked}`, async (t) => {
    const f = await fake(t)
    const raw = await connectedRaw(t, f, { timers: 'fake', gate: { hold: async () => null, admit: async () => null, paired: async () => true } })
    revoke(f)
    await assert.rejects(call(raw))
    await assertRefusedAtRuntime(raw, LINK.code.revoked)
  })
  caseTest(PROBE.testId, 'capability', 'only a capability advertised by the named tool permits the optional call', async (t) => {
    const f = await fake(t, () => ({ tools: probeTools, onTool: (name) => (name === PROBE.name ? PROBE.reply : undefined) }))
    const raw = await connectedRaw(t, f)
    for (const capability of [PROBE.missing, 'toString']) {
      const result = await probe(raw, { capability })
      assert.equal(result?.ok, false)
    }
    assert.deepEqual(f.callsOf(PROBE.name), [], 'missing capabilities must not send a request')
    assert.equal((await probe(raw, { signal: AbortSignal.abort() }))?.ok, false)
    assert.deepEqual(f.callsOf(PROBE.name), [], 'an already aborted probe must not send a request')
    assert.deepEqual(await probe(raw), PROBE.reply)
    assert.deepEqual(f.callsOf(PROBE.name).map(({ name, args }) => ({ name, args })), [{ name: PROBE.name, args: PROBE.args }])
  })

  caseTest(PROBE.testId, 'isolation', 'a probe refused by the target does not invalidate the shared link or credential', async (t) => {
    let refusals = 0
    const f = await fake(t, (box) => {
      box.forbid = true
      const denied = forbidding(box).onRpc
      return {
        tools: probeTools,
        onRpc: (m) => {
          if (m.params?.name !== PROBE.name) return undefined
          const reply = denied(m)
          if (reply !== undefined) refusals += 1
          return reply
        },
      }
    })
    const raw = await connectedRaw(t, f, { timers: 'fake' })
    const status = []
    raw.link.onStatus((next) => status.push(next))
    const before = f.tokenRequests().length
    const result = await probe(raw)
    assert.equal(result?.ok, false)
    assert.ok(refusals > 0, 'the probe must reach the target and be refused')
    assert.deepEqual(await call(raw), { ok: true, accepted: true }, 'ordinary tools still use the open link')
    assert.equal(raw.link.status().state, STATE.connected)
    assert.deepEqual(status, [], 'no shared status transition')
    assert.equal(raw.counts.refused, 0, 'the credential must not be marked refused')
    assert.equal(raw.pending().length, 0, 'no reconnect work was queued')
    assert.equal(f.tokenRequests().length, before, 'the refused probe did not require a new shared access token')
  })

  caseTest(PROBE.testId, 'reconnect', 'a successful reply that returns after reconnect is unusable', async (t) => {
    const f = await fake(t, () => ({ tools: probeTools, onTool: (name) => (name === PROBE.name ? PROBE.reply : undefined) }))
    const held = holdOnce()
    defer(t, held.open)
    const raw = await connectedRaw(t, f, {
      customizeClient: (mcp) => ({ ...mcp, Client: class extends mcp.Client {
        async callTool(call, options) {
          const reply = await super.callTool(call, options)
          // Hold the successful result above the transport: closing the old HTTP connection
          // cannot mask a missing generation check by making the pending request reject.
          if (call.name === PROBE.name) await held.wait()
          return reply
        }
      } }),
    })
    const oldReply = probe(raw)
    await Promise.race([held.reached, oldReply.then((reply) => assert.fail('probe completed before holding the response: ' + JSON.stringify(reply)))])
    raw.link.reconnect()
    await untilState(raw.link, STATE.connected)
    assert.deepEqual(await probe(raw), PROBE.reply, 'the current generation can return its own result')
    held.open()
    assert.equal((await oldReply)?.ok, false, 'discard the old successful result')
  })

  const OTHER_FAILURES = [
    ['5 (HTTP 500)', (m) => (m.method === RPC.toolsCall ? { status: RFIX.serverError, body: {} } : undefined), undefined],
    ['6 (JSON-RPC error)', (m) => (m.method === RPC.toolsCall ? { status: K1.HTTP_STATUS.ok, body: { jsonrpc: RPC.jsonrpc, id: m.id, error: { code: RFIX.jsonRpcInternal, message: 'fbtest internal error' } } } : undefined), undefined],
    ['7 (aborted)', () => undefined, () => AbortSignal.abort()],
  ]
  for (const [row, onRpc, signal] of OTHER_FAILURES) {
    caseTest('RFIX-F04-EP-01', row, 'a call fails for another reason → it rejects; the link stays connected; refused() not called', async (t) => {
      let armed = false
      const f = await fake(t, () => ({ onRpc: (m) => (armed ? onRpc(m) : undefined) }))
      const raw = await connectedRaw(t, f, { timers: 'fake' })
      armed = true
      await assert.rejects(raw.link.callTool(K1.TOOL.approvalAnswer, ANSWER, signal === undefined ? {} : { signal: signal() }))
      await sleep(HARNESS.quietMs)
      assert.equal(raw.link.status().state, STATE.connected, 'the link left connected: ' + JSON.stringify(raw.link.status()))
      assert.equal(raw.counts.refused, 0, 'refused() hook calls')
    })
  }
  caseTest('RFIX-F04-ST-01', 1, 'connected → runtime refusal → token-refused → the secret is accepted again → the retry connects', async (t) => {
    const f = await fake(t)
    const raw = await connectedRaw(t, f)
    revoke(f)
    await assert.rejects(call(raw))
    await untilState(raw.link, STATE.refused)
    f.acceptSecret(true)
    await untilState(raw.link, STATE.connected, LINK_BACKOFF.initialMs * LINK_BACKOFF.factor * 4 + HARNESS.settleMs)
  })
}
