/**
 * Revision 11 rev11d on H-STUB: creating standing grants and what they cover (DESIGN §7a.3 "grant", §7a.8, §9
 * "Standing grants", "Audit", "Fishball's other decisions"; requirements items 17-18, done-when 6; contract §4.2
 * `approval.answer` with `decision:'grant'` and its refusals, §4.3 `grant.list`, §5 `approval.ran`, §8
 * `grantPrefixChars`, `reasonChars`). One host; the shell fixture tools (bash, pwsh, terminal_open, terminal_send,
 * demo_echo) ask for approval in their body. A direct call reaches the stub instance as `approval.request`; the
 * stub's `approval.answer` (grant) creates the grant. "Covered" means: the call runs (allowed-once), no
 * `approval.request` and no stock prompt, and one `approval.ran {via:'grant'}` reports it.
 *
 * | id      | technique | requirement | expected |
 * |---------|-----------|-------------|----------|
 * | GRT-01  | EP (valid prefix grant on a direct bash call) | §7a.8 Creating, §4.2, §9 | `{accepted, grantId, expiresAt}`; the call runs; settled grant by fishball; grant.list entry, stored row, decisions row and audit row show it |
 * | GRT-02  | ST (five covered runs) | item 17, done-when 6 | all run with no approval.request; uses 5 and lastUsedAt in grant.list and the row; five approval.ran; five grant-used audit rows |
 * | GRT-03  | EP (`npm test && git push`) | item 18 (accepted risk) | covered |
 * | GRT-04 ×8 | BVA/EP (command vs prefix `npm test`) | §7a.8 raw text | exact, longer, `npm testing`: covered; shorter, other word, other case, double space, prefix not at start: to the instance |
 * | GRT-05  | EP (same command, other tool) | §7a.8 | `pwsh npm test` is not covered by the bash grant |
 * | GRT-06  | EP (same call, other session) | §7a.8 "belongs to the asking session" | not covered |
 * | GRT-07  | DT (exact grant) | §7a.8 exact, §9 digest | repeats covered (also another key order); one argument changed: to the instance |
 * | GRT-08 ×2 | EP (prefix on pwsh, terminal_send) | §7a.8 prefix tools | accepted; a following command is covered |
 * | GRT-08s | EP (trailing `*`) | §7a.8 prefix rules | dropped: grant.list shows the prefix without it; covers |
 * | GRT-09 ×3 | EP (prefix on demo_echo, fbtest_ask, terminal_open) | §7a.8, §4.2 | `prefix-not-shell-tool`; request still offered; no grant |
 * | GRT-09x ×2 | EP (exact on demo_echo, terminal_open) | §7a.8 exact for every tool | accepted and covers |
 * | GRT-10 ×17 | DT (refused answers) | §4.2 refusals, §7a.3 code rules | each the named error frame, channel open, request still offered, no grant row, no grant decision |
 * | GRT-10b ×4 | BVA (`grantPrefixChars` 512, `reasonChars` 500) | contract §8 | prefix 512 and reason 500 (also astral) accepted; 513 / 501 not accepted and no grant |
 * | GRT-11  | BVA (end time one year out; three active grants) | §7a.8 "no longest lifetime, no cap" | accepted; all three listed at once |
 * | GRT-12  | EP (grant through ask_fishball; ask_fishball of a covered call) | §7a.8, §7a.3 Reading | allowed; a later direct call covered; ask_fishball for a covered call answers allowed with no approval.request |
 *
 * Retired:
 * - GRT-01/02 tags: tag records and the turn-tail tags were removed (slim §8.1, T08/T15); a covered call is reported by approval.ran instead.
 * - GRT-08 on terminal_open: DESIGN §7a.8 narrowed Q-r11-prefix-tools: terminal_open gets exact grants only (now GRT-09).
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, it } from 'node:test'
import { ENVELOPE } from 'fishball-connector/contract'
import { ASK_CODE, ASK_FISHBALL, ASK_TOOL, EXACT_ONLY_TOOLS, PREFIX_TOOLS } from './support/constants.mjs'
import { HOOK, T, jsonOf, settledIdle, step, turn } from './support/expect.mjs'
import { managedSession, stopStub } from './support/instance-stub.mjs'
import {
  GRANT_C, answer, argsFor, assertNotAccepted, assertRefused, auditOf, covered, create, decisions, direct, exactGrant, finishRejected,
  grantAnswer, grantRow, grantRowCount, grantStub, inMs, listedGrant, listedGrants, offeredIds, prefixGrant, sizedText,
  reattachIfClosed, requestsFor, rowEnd, settledFor, sleep, tokens, uncovered, usedRows,
} from './support/instance-stub-grants.mjs'

const { tok, cid } = tokens('GRT')
const BASE = 'npm test'
const SHELL = PREFIX_TOOLS[0]
const ALT_SHELL = PREFIX_TOOLS[1]

describe('Revision 11 rev11d on H-STUB: creating grants and what they cover', () => {
  let ctx
  let x
  let y
  let prefixGrantId
  const run = (sid, tool, command, label) => covered(ctx, sid, tool, argsFor(tool, command), cid(label))
  const notRun = (sid, tool, command, label) => uncovered(ctx, sid, tool, argsFor(tool, command), cid(label))
  const grantDecisions = () => decisions(ctx).filter((d) => d.action === GRANT_C.action.grant)

  before(async () => {
    ctx = await grantStub('rev11d-grants')
    x = await managedSession(ctx.host, 'grt-x')
    y = await managedSession(ctx.host, 'grt-y')
  }, HOOK)
  after(() => stopStub(ctx), HOOK)
  // A refusal that closed the channel (reported by its own case) must not leave the next case without an instance.
  beforeEach(() => reattachIfClosed(ctx))

  it('GRT-01 a prefix grant: the creating call runs and the grant is answered, listed, stored and audited', T, async () => {
    const expiresAt = inMs(GRANT_C.hourMs)
    const callId = cid('01')
    const desc = await direct(ctx, x, SHELL, argsFor(SHELL, BASE + ' ' + tok('01')), callId)
    const reply = await answer(ctx, x, desc, grantAnswer({ kind: 'prefix', prefix: BASE, expiresAt }))
    assert.equal(reply.type, ENVELOPE.type.response, JSON.stringify(reply))
    assert.deepEqual(Object.keys(reply.payload).sort(), ['accepted', 'expiresAt', 'grantId'])
    assert.equal(reply.payload.accepted, true)
    assert.ok(Math.abs(reply.payload.expiresAt - expiresAt) < GRANT_C.endToleranceMs, 'the end time as given')
    prefixGrantId = reply.payload.grantId
    await ctx.host.call('waitIdle', { sessionId: x })
    const events = (await ctx.host.call('inspect', { sessionId: x, events: true })).events
    assert.match(events.find((e) => e.type === 'tool/result' && e.result.callId === callId)?.result.text ?? '', /allowed-once/, 'the creating call ran as allow does')
    assert.deepEqual(await settledFor(ctx, desc.approvalId), [{ approvalId: desc.approvalId, decision: 'grant', by: GRANT_C.by.fishball }])
    const listed = await listedGrant(ctx, prefixGrantId)
    assert.ok(listed, 'grant.list lists it')
    assert.deepEqual(Object.keys(listed).sort(), [...GRANT_C.grantKeys, 'prefix'].sort(), 'exact keys before any use')
    assert.deepEqual({ ...listed, expiresAt: undefined }, { grantId: prefixGrantId, sessionId: x, toolName: SHELL, kind: 'prefix', prefix: BASE, expiresAt: undefined, uses: 0, paused: false })
    const row = grantRow(ctx, prefixGrantId)
    assert.ok(row, 'a stored row keyed by the grant id')
    assert.deepEqual({ status: row.status, kind: row.kind, uses: row.uses, sessionId: row.sessionId, prefix: row.prefix, requestId: row.requestId }, { status: GRANT_C.status.active, kind: 'prefix', uses: 0, sessionId: x, prefix: BASE, requestId: desc.approvalId })
    const dec = decisions(ctx, prefixGrantId)
    assert.ok(dec.some((d) => d.action === GRANT_C.action.grant && d.by === GRANT_C.by.fishball && d.sessionId === x), 'a decisions row grant by fishball: ' + JSON.stringify(dec))
    assert.ok(auditOf(ctx.home, desc.approvalId).some((a) => a.answer === GRANT_C.audit.grant && a.grantId === prefixGrantId), 'the request audited as grant')
  })

  it('GRT-02 five covered runs: no request to the instance; uses, approval.ran and audit follow', T, async () => {
    for (let i = 0; i < 5; i++) await run(x, SHELL, BASE + ' ' + tok('02' + i), '02' + i)
    const row = grantRow(ctx, prefixGrantId)
    assert.equal(row.uses, 5)
    assert.ok(row.lastUsedAt, 'lastUsedAt recorded')
    const listed = await listedGrant(ctx, prefixGrantId)
    assert.equal(listed.uses, 5)
    assert.ok(Number.isInteger(listed.lastUsedAt) && listed.lastUsedAt >= 0, 'lastUsedAt in epoch ms: ' + JSON.stringify(listed))
    assert.equal(usedRows(ctx, prefixGrantId).length, 5, 'one grant-used audit row per covered call')
  })

  it('GRT-03 `npm test && git push` is covered too (accepted risk)', T, async () => {
    await run(x, SHELL, BASE + ' && git push ' + tok('03'), '03')
  })

  for (const [label, command, isCovered] of [
    ['longer, with a flag', BASE + ' --watch', true],
    ['raw text: npm testing', BASE + 'ing', true],
    ['one character short', BASE.slice(0, -1), false],
    ['other word', 'npm run test', false],
    ['other case', BASE.toUpperCase(), false],
    ['double space', BASE.replace(' ', '  '), false],
    ['prefix not at the start', 'echo ' + BASE, false],
  ]) {
    it('GRT-04 ' + label + ': ' + (isCovered ? 'covered' : 'goes to the instance'), T, async () => {
      const cmd = command + ' ' + tok('04')
      if (isCovered) await run(x, SHELL, cmd, '04')
      else await notRun(x, SHELL, cmd, '04')
    })
  }

  it('GRT-04 a command exactly equal to the prefix is covered (boundary)', T, async () => {
    const prefix = 'zq' + tok('04b')
    const c = await create(ctx, y, SHELL, prefix + ' init', prefixGrant(prefix), cid('04b'))
    assert.equal(c.reply.type, ENVELOPE.type.response, JSON.stringify(c.reply))
    await run(y, SHELL, prefix, '04c')
  })

  it('GRT-05 the same command in another tool is not covered by the bash grant', T, async () => {
    await notRun(x, ALT_SHELL, BASE + ' ' + tok('05'), '05')
  })

  it('GRT-06 the same command in another session is not covered (the grant belongs to its session)', T, async () => {
    await notRun(y, SHELL, BASE + ' ' + tok('06'), '06')
  })

  it('GRT-07 an exact grant: repeats are covered, a changed argument is not', T, async () => {
    const text = tok('07')
    const args = { text, pad: 'p' }
    const desc = await direct(ctx, y, ASK_TOOL, args, cid('07'))
    const reply = await answer(ctx, y, desc, grantAnswer(exactGrant()))
    assert.equal(reply.type, ENVELOPE.type.response, JSON.stringify(reply))
    await ctx.host.call('waitIdle', { sessionId: y })
    await covered(ctx, y, ASK_TOOL, args, cid('07r'))
    await covered(ctx, y, ASK_TOOL, args, cid('07r'))
    // Canonical JSON (§9 digest): another key order is the same call.
    await covered(ctx, y, ASK_TOOL, { pad: 'p', text }, cid('07k'))
    for (const changed of [{ ...args, extra: 'e' }, { ...args, text: text + '!' }, { ...args, pad: 'q' }]) await uncovered(ctx, y, ASK_TOOL, changed, cid('07c'))
  })

  for (const tool of PREFIX_TOOLS.filter((n) => n !== SHELL)) {
    it('GRT-08 a prefix grant on ' + tool + ' is accepted and covers a following command', T, async () => {
      const prefix = 'make build ' + tok('08' + tool)
      const c = await create(ctx, x, tool, prefix + ' init', prefixGrant(prefix), cid('08'))
      assert.equal(c.reply.type, ENVELOPE.type.response, JSON.stringify(c.reply))
      await run(x, tool, prefix + ' all', '08c')
    })
  }

  it('GRT-08s a trailing * in the prefix is notation and is dropped', T, async () => {
    const prefix = 'yq' + tok('08s')
    const c = await create(ctx, y, SHELL, prefix + ' init', prefixGrant(prefix + '*'), cid('08s'))
    assert.equal(c.reply.type, ENVELOPE.type.response, JSON.stringify(c.reply))
    assert.equal((await listedGrant(ctx, c.grantId))?.prefix, prefix, 'listed without the star')
    await run(y, SHELL, prefix + 'tail more', '08t')
  })

  for (const tool of EXACT_ONLY_TOOLS) {
    it('GRT-09 a prefix grant on ' + tool + ' is refused prefix-not-shell-tool; the request stays offered; no grant', T, async () => {
      const before = grantRowCount(ctx)
      const desc = await direct(ctx, x, tool, argsFor(tool, 'make ' + tok('09' + tool)), cid('09'))
      await assertRefused(ctx, await answer(ctx, x, desc, grantAnswer(prefixGrant('make'))), 'prefix-not-shell-tool')
      assert.ok((await offeredIds(ctx, x)).includes(desc.approvalId), 'still offered')
      assert.equal(grantRowCount(ctx), before)
      assert.equal((await finishRejected(ctx, x, desc)).type, ENVELOPE.type.response, 'still pending: a reject is accepted')
    })
  }

  for (const tool of ['demo_echo', 'terminal_open']) {
    it('GRT-09x an exact grant on ' + tool + ' is accepted (exact-call grants are for every tool)', T, async () => {
      const command = 'print(' + tok('09x' + tool) + ')'
      const c = await create(ctx, x, tool, command, exactGrant(), cid('09x'))
      assert.equal(c.reply.type, ENVELOPE.type.response, JSON.stringify(c.reply))
      await run(x, tool, command, '09y')
    })
  }

  describe('GRT-10 refused answers leave the request offered and create nothing', () => {
    const PREFIX = 'make'
    const valid = () => grantAnswer(prefixGrant(PREFIX))
    // Contract §4.2 names each refusal; §7a.3: a refused answer leaves the request pending.
    const cases = [
      ['no end time', 'expires-at-required', (a) => { delete a.grant.expiresAt }],
      ['an end time an hour in the past', 'expires-at-past', (a) => { a.grant.expiresAt = inMs(-GRANT_C.hourMs) }],
      ['an end time one second ago', 'expires-at-past', (a) => { a.grant.expiresAt = inMs(-1000) }],
      ['an end time that is not a time', 'expires-at-invalid', (a) => { a.grant.expiresAt = 'tomorrow-ish' }],
      ['an end time that is not a whole number', 'expires-at-invalid', (a) => { a.grant.expiresAt = inMs(GRANT_C.hourMs) + 0.5 }],
      ['no grant object', 'grant-invalid', (a) => { delete a.grant }],
      ['an unknown kind', 'grant-invalid', (a) => { a.grant.kind = 'any' }],
      ['kind exact with a prefix', 'grant-invalid', (a) => { a.grant.kind = 'exact' }],
      ['a grant object on decision allow', 'grant-invalid', (a) => { a.decision = 'allow' }],
      ['kind prefix without a prefix', 'prefix-empty', (a) => { delete a.grant.prefix }],
      ['kind prefix with an empty prefix', 'prefix-empty', (a) => { a.grant.prefix = '' }],
      ['kind prefix with a blank prefix', 'prefix-empty', (a) => { a.grant.prefix = '   ' }],
      ['a prefix that is not the start of the asking call\'s command', 'prefix-not-in-call', (a) => { a.grant.prefix = 'c' + PREFIX }],
      ['risk high (allow\'s rules)', 'allow-needs-low-risk', (a) => { a.risk = 'high' }],
      ['no risk', 'risk-required', (a) => { delete a.risk }],
      ['an empty reason', 'reason-required', (a) => { a.reason = '' }],
      ['a blank reason', 'reason-required', (a) => { a.reason = '  ' }],
      ['no reason', 'reason-required', (a) => { delete a.reason }],
    ]
    for (const [label, code, mutate] of cases) {
      it(label + ': ' + code, T, async () => {
        const rows = grantRowCount(ctx)
        const decided = grantDecisions().length
        const desc = await direct(ctx, x, SHELL, argsFor(SHELL, PREFIX + ' ' + tok('10')), cid('10'))
        const a = valid()
        mutate(a)
        const reply = await answer(ctx, x, desc, a)
        try {
          await assertRefused(ctx, reply, code)
          assert.ok((await offeredIds(ctx, x)).includes(desc.approvalId), 'the request is still offered')
        } finally {
          assert.equal(grantRowCount(ctx), rows, 'no grant row')
          assert.equal(grantDecisions().length, decided, 'no grant decision')
          await finishRejected(ctx, x, desc)
        }
      })
    }
  })

  describe('GRT-10b boundaries: grantPrefixChars 512 and reasonChars 500', () => {
    for (const [label, accepted, make] of [
      // Each prefix starts with its own token, so an earlier long grant never covers the next case's call.
      ['a prefix of 512 characters is accepted', true, () => ({ prefix: sizedText(512, tok('p')) })],
      ['a prefix of 513 characters is not accepted', false, () => ({ prefix: sizedText(513, tok('p')) })],
      ['a reason of 500 characters is accepted', true, () => ({ reason: sizedText(500, tok('r')) })],
      ['a reason of 500 astral characters is accepted', true, () => ({ reason: '😀'.repeat(500) })],
      ['a reason of 501 characters is not accepted', false, () => ({ reason: sizedText(501, tok('r')) })],
    ]) {
      it(label, T, async () => {
        const { prefix = 'bv' + tok('10b'), reason } = make()
        const rows = grantRowCount(ctx)
        const desc = await direct(ctx, y, SHELL, argsFor(SHELL, prefix + ' tail'), cid('10b'))
        const reply = await answer(ctx, y, desc, grantAnswer(prefixGrant(prefix), reason === undefined ? {} : { reason }))
        if (accepted) {
          assert.equal(reply.type, ENVELOPE.type.response, JSON.stringify(reply).slice(0, 400))
          await ctx.host.call('waitIdle', { sessionId: y })
          assert.equal(grantRowCount(ctx), rows + 1)
        } else {
          assertNotAccepted(reply)
          assert.equal(grantRowCount(ctx), rows, 'no grant row')
          await finishRejected(ctx, y, desc)
        }
      })
    }
  })

  it('GRT-11 an end time one year out is accepted and any number of grants are active at once', T, async () => {
    const before = (await listedGrants(ctx)).filter((e) => e.sessionId === y).length
    const made = []
    for (const [i, prefix] of ['aaa', 'bbb', 'ccc'].entries()) {
      const c = await create(ctx, y, SHELL, prefix + ' ' + tok('11'), prefixGrant(prefix, i === 0 ? GRANT_C.yearMs : GRANT_C.hourMs), cid('11'))
      assert.equal(c.reply.type, ENVELOPE.type.response, prefix + ': ' + JSON.stringify(c.reply))
      made.push(c.grantId)
    }
    const mine = (await listedGrants(ctx)).filter((e) => e.sessionId === y)
    assert.equal(mine.length, before + 3)
    const year = mine.find((e) => e.grantId === made[0])
    assert.ok(Math.abs(year.expiresAt - inMs(GRANT_C.yearMs)) < 60000, 'a year out: ' + JSON.stringify(year))
    assert.ok(Math.abs(rowEnd(grantRow(ctx, made[0])) - year.expiresAt) < GRANT_C.endToleranceMs, 'the row keeps the same end time')
  })

  it('GRT-12 a grant made through ask_fishball; ask_fishball for a covered call answers allowed at once', T, async () => {
    const prefix = 'cargo build ' + tok('12')
    const ask = (command) => ({ tool: SHELL, arguments: argsFor(SHELL, command), quote: [], why: 'fbtest why ' + command })
    const first = cid('12a')
    const desc = await direct(ctx, x, ASK_FISHBALL, ask(prefix + ' init'), first)
    assert.equal((await answer(ctx, x, desc, grantAnswer(prefixGrant(prefix)))).type, ENVELOPE.type.response)
    await ctx.host.call('waitIdle', { sessionId: x })
    const events = (await ctx.host.call('inspect', { sessionId: x, events: true })).events
    assert.equal(jsonOf(events.find((e) => e.type === 'tool/result' && e.result.callId === first)?.result)?.code, ASK_CODE.allowed)
    await run(x, SHELL, prefix + ' --release', '12b')
    // Now covered: an ask_fishball for another matching command answers allowed without asking the instance.
    const second = cid('12c')
    await settledIdle(ctx.host, x)
    const r = await turn(ctx.host, x, [step(ASK_FISHBALL, ask(prefix + ' -p x'), second), [{ text: 'done' }]])
    assert.equal(jsonOf(r.results.find((e) => e.callId === second))?.code, ASK_CODE.allowed, JSON.stringify(r.results))
    await sleep(GRANT_C.quietMs)
    assert.deepEqual(await requestsFor(ctx, second), [], 'no approval.request for a covered ask_fishball')
  })
})
