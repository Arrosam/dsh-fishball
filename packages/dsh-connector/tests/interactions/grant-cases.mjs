/**
 * IX-UC-04 (USE-CASES.md): standing grants, created with `approval_answer {decision: 'grant'}` and
 * ended by `grant_revoke`, expiry, Take back and release, on a real DSH. Gap-check (B) rows: GRT-01…11,
 * END-01, END-03, END-04, END-05, END-07 (as q3 decided). Techniques: UC, EP, BVA, DT, ST.
 *
 * Schema-level refusals (an integer/required `expiresAt`, an enum `kind`) answer `invalid-arguments`
 * (the dev session, 2026-11-17: "whatever K1's closed input schema refuses is invalid-arguments"), so
 * `expires-at-required` has no row of its own.
 */
import assert from 'node:assert/strict'
import { APPROVAL_DECISION, DECISION_TEXT, FIXTURE, GRANT_KIND, IX, PAYLOAD_LIMITS, REFUSAL, RELAYED, RISK, SURFACE, TOOL, WORLD } from 'dsh-connector-test-helpers/connector-world/interactions-constants'
import { row } from 'dsh-connector-test-helpers/connector-world/rows'
import {
  A, answer, asked, assertCovered, assertOffered, call, decided, exactGrant, free, handOver, isListed, managed, okCall, prefixGrant,
  principal, refusedCall, sleep, takeBack, tok, world,
} from 'dsh-connector-test-helpers/connector-world/interactions'

const SHELL = 'bash'
const accepted = (reply) => reply.ok === true && reply.accepted === true

/** The grants `p` lists for `sid`. */
const grantsOf = async (p, sid) => (await okCall(p.client, TOOL.grantsList, {})).grants.filter((g) => !sid || g.sessionId === sid)
/** A direct call of `tool` with `command` answered with `grant`; returns `{r, reply}` and lets the call run. */
async function granted(w, p, sid, tool, command, grant, extra = {}) {
  const r = await asked(w, p, sid, { tool, text: command })
  const reply = await answer(p, r, { ...A.grant(grant), ...extra })
  if (accepted(reply)) await decided(w, command, sid)
  return { r, reply }
}

export function registerGrantCases(sdk) {
  const w0 = () => world(sdk, WORLD.scenario.grants)
  const start = async (t) => { const w = await w0(); const p = await principal(t, w); const sid = await managed(w, p); return { w, p, sid } }

  row(sdk, 'GRT-01 / GRT-02', 'UC → ST (a prefix grant, then covered runs)', '{accepted, grantId grt_…, expiresAt}; the creating call runs; two later covered runs need no offer; grants_list shows uses 2 and lastUsedAt; paused false', async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('npm')
    const grant = prefixGrant(base)
    const { reply } = await granted(w, p, sid, SHELL, base + ' run', grant)
    assert.ok(accepted(reply), JSON.stringify(reply))
    assert.match(reply.grantId, /^grt_/)
    assert.equal(reply.expiresAt, grant.expiresAt)
    assert.equal((await decided(w, base + ' run', sid)).outcome, IX.outcome.allowed)
    await assertCovered(w, p, sid, SHELL, base + ' one')
    await assertCovered(w, p, sid, SHELL, base + ' two')
    const [g] = (await grantsOf(p, sid)).filter((x) => x.grantId === reply.grantId)
    assert.ok(g, 'not listed')
    assert.deepEqual([g.toolName, g.kind, g.prefix, g.expiresAt, g.uses, g.paused], [SHELL, GRANT_KIND.prefix, base, grant.expiresAt, 2, false])
    assert.equal(typeof g.lastUsedAt, 'number')
  })
  row(sdk, 'GRT-03 / GRT-04', 'BVA / EP (the raw command text against the prefix)', 'startsWith on the raw text: covered for the prefix itself, longer text, `npm testing` and a chained command; not for shorter, other word, other case, double space, prefix not at the start', async (t) => {
    const { w, p, sid } = await start(t)
    const marker = tok('g4')
    const prefix = FIXTURE.npmTest
    const { reply } = await granted(w, p, sid, SHELL, prefix + ' ' + marker, prefixGrant(prefix))
    assert.ok(accepted(reply), JSON.stringify(reply))
    // A unique tail keeps every command's DSH reason unique without changing how it starts.
    for (const [index, [, command, covered]] of FIXTURE.prefixTable.entries()) {
      const text = command + ' #' + marker + index
      if (covered) await assertCovered(w, p, sid, SHELL, text)
      else await assertOffered(w, p, sid, SHELL, text)
    }
  })
  row(sdk, 'GRT-05 / GRT-06', 'EP (the same command: another tool; another session)', 'a bash prefix grant does not cover pwsh, nor the same call in another managed session', async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('g5')
    assert.ok(accepted((await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))).reply))
    await assertOffered(w, p, sid, 'pwsh', base + ' b')
    await assertOffered(w, p, await managed(w, p), SHELL, base + ' c')
  })
  row(sdk, 'GRT-07', 'DT (an exact grant: same; other key order; one argument changed)', 'covered, covered, offered', async (t) => {
    const { w, p, sid } = await start(t)
    const text = tok('g7')
    const r = await asked(w, p, sid, { tool: IX.fixture.askTool, text, args: { text, pad: 'p1' } })
    assert.ok(accepted(await answer(p, r, A.grant(exactGrant()))))
    await decided(w, text, sid)
    await assertCovered(w, p, sid, IX.fixture.askTool, text, { text, pad: 'p1' })
    await assertCovered(w, p, sid, IX.fixture.askTool, text, { pad: 'p1', text })
    await assertOffered(w, p, sid, IX.fixture.askTool, text, { text, pad: 'p2' })
  })
  for (const tool of ['pwsh', 'terminal_send']) {
    row(sdk, 'GRT-08', `EP (a prefix grant on ${tool})`, `accepted on ${tool}'s ${RELAYED.prefixTools[tool]}; a following command is covered`, async (t) => {
      const { w, p, sid } = await start(t)
      const base = tok('g8')
      assert.ok(accepted((await granted(w, p, sid, tool, base + ' a', prefixGrant(base))).reply))
      await assertCovered(w, p, sid, tool, base + ' b')
    })
  }
  row(sdk, 'GRT-08s', 'EP (a trailing *)', 'the * is dropped: grants_list shows the prefix without it; it covers', async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('g8s')
    const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base + '*'))
    assert.ok(accepted(reply), JSON.stringify(reply))
    assert.equal((await grantsOf(p, sid)).find((g) => g.grantId === reply.grantId).prefix, base)
    await assertCovered(w, p, sid, SHELL, base + ' b')
  })
  for (const tool of [IX.fixture.askTool, IX.fixture.terminalOpen]) {
    row(sdk, 'GRT-09', `EP (a prefix grant on ${tool})`, `→ ${REFUSAL.prefixNotShellTool}; nothing granted; still offered`, async (t) => {
      const { w, p, sid } = await start(t)
      const text = tok('g9')
      const r = await asked(w, p, sid, { tool, text })
      const reply = await answer(p, r, A.grant(prefixGrant(text.slice(0, 4))))
      assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.prefixNotShellTool])
      assert.ok(await isListed(p, r))
      assert.deepEqual(await grantsOf(p, sid), [])
      await free(w, sid)
    })
  }
  row(sdk, 'GRT-09x', 'EP (an exact grant on terminal_open)', 'accepted; the same call is covered', async (t) => {
    const { w, p, sid } = await start(t)
    const text = tok('g9x')
    const r = await asked(w, p, sid, { tool: IX.fixture.terminalOpen, text })
    assert.ok(accepted(await answer(p, r, A.grant(exactGrant()))))
    await decided(w, text, sid)
    await assertCovered(w, p, sid, IX.fixture.terminalOpen, text)
  })

  // GRT-10: refused grant answers (each leaves the request offered and grants nothing).
  const valid = (prefix) => A.grant(prefixGrant(prefix))
  for (const [label, code, mutate] of [
    ['decision grant with no grant object', REFUSAL.grantInvalid, (a) => { delete a.grant }],
    ['kind exact with a prefix', REFUSAL.grantInvalid, (a) => { a.grant.kind = GRANT_KIND.exact }],
    ['a grant object on decision allow', REFUSAL.grantInvalid, (a) => { a.decision = APPROVAL_DECISION.allow }],
    ['expiresAt an hour ago', REFUSAL.expiresPast, (a) => { a.grant.expiresAt = Date.now() - FIXTURE.hourMs }],
    ['expiresAt 0', REFUSAL.expiresPast, (a) => { a.grant.expiresAt = 0 }],
    ['expiresAt negative', REFUSAL.expiresInvalid, (a) => { a.grant.expiresAt = -1 }],
    ['expiresAt beyond the safe-integer range', REFUSAL.expiresInvalid, (a) => { a.grant.expiresAt = FIXTURE.unsafeInteger }],
    ['kind prefix with no prefix', REFUSAL.prefixEmpty, (a) => { delete a.grant.prefix }],
    ['prefix \'\'', REFUSAL.prefixEmpty, (a) => { a.grant.prefix = '' }],
    ['prefix whitespace', REFUSAL.prefixEmpty, (a) => { a.grant.prefix = '   ' }],
    ['a prefix not at the start of the call\'s command', REFUSAL.prefixNotInCall, (a) => { a.grant.prefix = 'x' + a.grant.prefix }],
    ['risk high', REFUSAL.allowNeedsLowRisk, (a) => { a.risk = RISK.high }],
    ['no risk', REFUSAL.riskRequired, (a) => { delete a.risk }],
    ['reason \'\'', REFUSAL.reasonRequired, (a) => { a.reason = '' }],
    ['no reason', REFUSAL.reasonRequired, (a) => { delete a.reason }],
    ['no expiresAt (schema)', REFUSAL.invalidArguments, (a) => { delete a.grant.expiresAt }],
    ['expiresAt 1.5 (schema)', REFUSAL.invalidArguments, (a) => { a.grant.expiresAt = 1.5 }],
    ['kind any (schema)', REFUSAL.invalidArguments, (a) => { a.grant.kind = 'any' }],
  ]) {
    row(sdk, 'GRT-10', `DT (${label})`, `→ ${code}; nothing granted; the request is still offered`, async (t) => {
      const { w, p, sid } = await start(t)
      const base = tok('g10')
      const r = await asked(w, p, sid, { tool: SHELL, text: base + ' run' })
      const a = valid(base)
      mutate(a)
      const reply = await answer(p, r, a)
      assert.deepEqual([reply.ok, reply.code], [false, code], JSON.stringify(reply))
      assert.ok(await isListed(p, r))
      assert.deepEqual(await grantsOf(p, sid), [])
      await free(w, sid)
    })
  }
  row(sdk, 'GRT-10', 'DT (allow on truncated arguments)', `a grant on a truncated call → ${REFUSAL.argumentsIncomplete}`, async (t) => {
    const { w, p, sid } = await start(t)
    const was = (await w.settings()).value[RELAYED.setting.argumentExcerptBytes]
    t.after(() => w.call('settingsUpdate', { patch: { [RELAYED.setting.argumentExcerptBytes]: was } }))
    await w.call('settingsUpdate', { patch: { [RELAYED.setting.argumentExcerptBytes]: FIXTURE.shortExcerpt } })
    const base = tok('g10t')
    const r = await asked(w, p, sid, { tool: SHELL, text: base, extra: { pad: FIXTURE.padUnit.repeat(FIXTURE.wideBytesPad) } })
    const reply = await answer(p, r, valid(base))
    assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.argumentsIncomplete])
    await free(w, sid)
  })
  for (const [label, n, ok, field] of [
    [`prefix ${PAYLOAD_LIMITS.grantPrefixChars}`, PAYLOAD_LIMITS.grantPrefixChars, true, 'prefix'],
    [`prefix ${PAYLOAD_LIMITS.grantPrefixChars + 1}`, PAYLOAD_LIMITS.grantPrefixChars + 1, false, 'prefix'],
    [`reason ${PAYLOAD_LIMITS.reasonChars}`, PAYLOAD_LIMITS.reasonChars, true, 'reason'],
    [`reason ${PAYLOAD_LIMITS.reasonChars + 1}`, PAYLOAD_LIMITS.reasonChars + 1, false, 'reason'],
  ]) {
    row(sdk, 'GRT-10b', `BVA (${label})`, ok ? 'accepted' : `→ ${REFUSAL.limitExceeded}; nothing granted`, async (t) => {
      const { w, p, sid } = await start(t)
      const head = tok('g10b')
      const command = field === 'prefix' ? (head + FIXTURE.padUnit.repeat(n)).slice(0, n) + ' more' : head + ' run'
      const r = await asked(w, p, sid, { tool: SHELL, text: command })
      const a = field === 'prefix' ? A.grant(prefixGrant(command.slice(0, n))) : A.grant(prefixGrant(head), 'r'.repeat(n))
      const reply = await answer(p, r, a)
      if (ok) assert.ok(accepted(reply), JSON.stringify(reply))
      else {
        assert.deepEqual([reply.ok, reply.code], [false, REFUSAL.limitExceeded])
        assert.deepEqual(await grantsOf(p, sid), [])
      }
      await free(w, sid)
    })
  }
  row(sdk, 'GRT-11', 'BVA (no maximum lifetime; several grants)', 'an end time a year out is accepted; three active grants are listed at once', async (t) => {
    const { w, p, sid } = await start(t)
    const ids = []
    for (let i = 0; i < 3; i++) {
      const base = tok('g11')
      const { reply } = await granted(w, p, sid, SHELL, base + ' x', prefixGrant(base, FIXTURE.yearMs))
      assert.ok(accepted(reply), JSON.stringify(reply))
      ids.push(reply.grantId)
    }
    assert.deepEqual((await grantsOf(p, sid)).map((g) => g.grantId).filter((id) => ids.includes(id)).sort(), [...ids].sort())
  })

  // ------------------------------------------------------------------------- ending grants
  row(sdk, 'END-01', 'ST (Active → expiresAt passes → Ended)', 'at its end time the grant leaves grants_list and the next run is offered again', async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('e1')
    const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base, FIXTURE.shortGrantMs))
    assert.ok(accepted(reply))
    await sleep(Math.max(0, reply.expiresAt - Date.now()) + FIXTURE.secondMs)
    assert.deepEqual((await grantsOf(p, sid)).filter((g) => g.grantId === reply.grantId), [])
    await assertOffered(w, p, sid, SHELL, base + ' b')
  })
  row(sdk, 'END-03', 'ST (Active → revoke → Ended → revoke again)', `{grantId, revoked: true}; the next run is offered; again → ${REFUSAL.grantEnded}; an unknown id → ${REFUSAL.grantUnknown}`, async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('e3')
    const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))
    assert.deepEqual(await okCall(p.client, TOOL.grantRevoke, { grantId: reply.grantId, reason: FIXTURE.reason }), { ok: true, grantId: reply.grantId, revoked: true })
    assert.deepEqual((await grantsOf(p, sid)).filter((g) => g.grantId === reply.grantId), [])
    await assertOffered(w, p, sid, SHELL, base + ' b')
    await refusedCall(p.client, TOOL.grantRevoke, { grantId: reply.grantId, reason: FIXTURE.reason }, REFUSAL.grantEnded)
    await refusedCall(p.client, TOOL.grantRevoke, { grantId: FIXTURE.unknownGrant, reason: FIXTURE.reason }, REFUSAL.grantUnknown)
  })
  for (const [label, reason, code] of [
    ['reason \'\'', '', REFUSAL.reasonRequired],
    [`reason ${PAYLOAD_LIMITS.reasonChars}`, 'r'.repeat(PAYLOAD_LIMITS.reasonChars), null],
    [`reason ${PAYLOAD_LIMITS.reasonChars + 1}`, 'r'.repeat(PAYLOAD_LIMITS.reasonChars + 1), REFUSAL.limitExceeded],
  ]) {
    row(sdk, 'END-03b / END-03c', `BVA (grant_revoke ${label})`, code ? `→ ${code}; the grant stays` : 'revoked', async (t) => {
      const { w, p, sid } = await start(t)
      const base = tok('e3b')
      const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))
      const r = await call(p.client, TOOL.grantRevoke, { grantId: reply.grantId, reason })
      if (code) {
        assert.deepEqual([r.ok, r.code], [false, code])
        assert.equal((await grantsOf(p, sid)).some((g) => g.grantId === reply.grantId), true)
      } else assert.deepEqual(r, { ok: true, grantId: reply.grantId, revoked: true })
    })
  }
  row(sdk, 'END-03', 'EP (another principal revokes)', 'Q cannot end P\'s grant; it stays listed for P', async (t) => {
    const { w, p, sid } = await start(t)
    const q = await principal(t, w, FIXTURE.label.q)
    const base = tok('e3q')
    const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))
    assert.equal((await call(q.client, TOOL.grantRevoke, { grantId: reply.grantId, reason: FIXTURE.reason })).ok, false)
    assert.equal((await okCall(q.client, TOOL.grantsList, {})).grants.some((g) => g.grantId === reply.grantId), false, 'Q lists P\'s grant')
    assert.equal((await grantsOf(p, sid)).some((g) => g.grantId === reply.grantId), true)
  })
  for (const how of ['Take back', 'session_release']) {
    row(sdk, 'END-04 / END-05', `ST (Active → ${how} → Hand over again)`, `${how} ends the session's grants; handing it over again does not revive them`, async (t) => {
      const { w, p, sid } = await start(t)
      const base = tok('e4')
      const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))
      assert.ok(accepted(reply))
      if (how === 'Take back') await takeBack(w, sid)
      else await okCall(p.client, TOOL.sessionRelease, { sessionId: sid, reason: FIXTURE.reason })
      await handOver(w, sid, p)
      assert.deepEqual((await grantsOf(p, sid)).filter((g) => g.grantId === reply.grantId), [])
      await assertOffered(w, p, sid, SHELL, base + ' b')
    })
  }
  row(sdk, 'END-07 (q3)', 'EP (the principal disconnected)', `a grant still covers while P holds no listen stream; paused stays false (${DECISION_TEXT.q3})`, async (t) => {
    const { w, p, sid } = await start(t)
    const base = tok('e7')
    const { reply } = await granted(w, p, sid, SHELL, base + ' a', prefixGrant(base))
    assert.equal((await w.service(SURFACE.service.handover, 'principals')).value.find((x) => x.key === p.principalKey).online, false, 'P is connected')
    await assertCovered(w, p, sid, SHELL, base + ' b')
    assert.equal((await grantsOf(p, sid)).find((g) => g.grantId === reply.grantId).paused, false)
  })
}
