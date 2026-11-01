/**
 * Revision 11 rev11d: creating standing grants and what they cover (DESIGN §7a.3 "grant", §7a.8, §9 "Standing
 * grants", "Tag records", "Audit", "Fishball's other decisions"; requirements items 17-18, done-when 6; decisions
 * Q-r11-prefix-tools, Q-r11-grant-bounds, Q-r11-tag-scope). One host; the shell fixture tools (bash, pwsh,
 * terminal_open, terminal_send, run_code) ask for approval in their body. A "direct call" reaches Fishball, whose
 * answer_approval(grant) creates the grant. "Covered" means: the call runs (allowed-once), Fishball takes no model
 * step, no notice, no stock prompt.
 *
 * | id      | technique | expected |
 * |---------|-----------|----------|
 * | GRT-01  | EP (valid prefix grant on a direct bash call) | the creating call runs; snapshot, table, decisions, audit and tag show the grant |
 * | GRT-02  | ST (five covered runs) | all run, Fishball takes zero steps, uses 5 and lastUsedAt set, five `grant` tags, five grant-used audit rows |
 * | GRT-03  | EP (`npm test && git push`) | covered (accepted risk) |
 * | GRT-04 ×8 | BVA/EP (command vs prefix `npm test`) | exact, longer, `npm testing`: covered; shorter, other word, other case, double space, prefix not at start: to Fishball |
 * | GRT-05  | EP (same command, other tool) | `pwsh npm test` is not covered by the bash grant |
 * | GRT-06  | EP (same call, other session) | not covered |
 * | GRT-07  | DT (exact grant) | repeats covered (also with another key order); one argument changed: to Fishball |
 * | GRT-08 ×3 | EP (prefix on pwsh, terminal_open, terminal_send) | accepted; a following command is covered |
 * | GRT-09 ×2 | EP (prefix on run_code, fbtest_ask) | refused, request still pending, no grant |
 * | GRT-10 ×10 | DT (refused answers) | no/ past/ now/ garbage end time, no grant object, bad kind, prefix kind without/with empty prefix, risk high, empty reason: ok false, request pending, no grant row |
 * | GRT-11  | BVA (end time one year out; three active grants) | accepted; all three active at once |
 * | GRT-12  | EP (grant through ask_fishball; ask_fishball of a covered call) | allowed; later direct call covered; ask_fishball for a covered call answers allowed with no Fishball step |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_CODE, ASK_TOOL, DECISION, EXACT_ONLY_TOOLS, GRANT_ACTION, GRANT_AUDIT, GRANT_KIND, GRANT_STATUS, GRANT_TAG_KIND, PREFIX_TOOLS } from './support/constants.mjs'
import { HOOK, T, approvalAudit, askStep, auditOf, jsonOf, resultById, settledIdle, storedRows, turn, waitRequest } from './support/expect.mjs'
import { QUIET_MS, YEAR, activeFor, endsAt, grantEntries, grantHost, grantTools, iso, sleep, snapId, tokens } from './support/rev11d.mjs'

const { tok, cid } = tokens('GRT')
const HOUR = 3600 * 1000

describe('Revision 11 rev11d: creating grants and what they cover', () => {
  let ctx
  let g
  let x
  let y
  let prefixGrant
  const decisions = () => storedRows(ctx.home, 'decisions')
  const tags = () => storedRows(ctx.home, 'tags')
  const grantRows = () => grantEntries(ctx.home)

  before(async () => {
    ctx = await grantHost('rev11d-grants')
    g = grantTools(ctx, { tok, cid })
    x = await g.t.session('grt-x')
    y = await g.t.session('grt-y')
  }, HOOK)
  after(async () => { await ctx.host?.stop() }, HOOK)

  it('GRT-01 a prefix grant: the creating call runs and the grant is shown, stored, audited and tagged', T, async () => {
    const expiresAt = iso(HOUR)
    const cmd = 'npm test ' + tok('01')
    const c = await g.create(x, 'bash', cmd, { kind: GRANT_KIND.prefix, prefix: 'npm test', expires_at: expiresAt }, { id: cid('01') })
    assert.equal(c.json.ok, true, JSON.stringify(c.json))
    assert.ok(c.grantId, 'a grant id is known: ' + JSON.stringify(c.json))
    prefixGrant = c.grantId
    const snap = (await g.snapshotGrants()).find((e) => snapId(e) === c.grantId)
    assert.ok(snap, 'the snapshot lists the grant: ' + JSON.stringify(await g.snapshotGrants()))
    assert.equal(snap.sessionId, x)
    assert.equal(snap.toolName ?? snap.tool, 'bash')
    assert.equal(snap.prefix, 'npm test')
    assert.ok(Math.abs(endsAt(snap) - Date.parse(expiresAt)) < 1000, 'end time as given: ' + JSON.stringify(snap))
    const [, row] = grantRows().find(([k]) => k === c.grantId) ?? []
    assert.ok(row, 'a stored row keyed by the grant id')
    assert.equal(row.status, GRANT_STATUS.active)
    assert.equal(row.kind, GRANT_KIND.prefix)
    assert.equal(row.uses, 0)
    const dec = decisions().filter((d) => d.target === c.grantId)
    assert.ok(dec.some((d) => d.action === GRANT_ACTION.grant && d.by === 'fishball' && d.sessionId === x), 'a decisions row grant by fishball: ' + JSON.stringify(dec))
    assert.ok(auditOf(ctx.home, c.requestId).some((a) => a.answer === GRANT_AUDIT.grant), 'the request audited as grant: ' + JSON.stringify(auditOf(ctx.home, c.requestId)))
    assert.ok(tags().some((tg) => tg.callId === c.id && tg.sessionId === x), 'the grant answer is tagged like every answer_approval decision')
  })

  it('GRT-02 five covered runs: Fishball takes zero steps; uses, tags and audit follow', T, async () => {
    const before = tags().length
    const ids = []
    for (let i = 0; i < 5; i++) ids.push((await g.covered(x, 'bash', 'npm test ' + tok('02' + i))).id)
    const row = grantRows().find(([k]) => k === prefixGrant)[1]
    assert.equal(row.uses, 5)
    assert.ok(row.lastUsedAt, 'lastUsedAt recorded')
    const mine = tags().filter((tg) => ids.includes(tg.callId))
    assert.equal(mine.length, 5, 'one tag per covered call: ' + JSON.stringify(mine))
    for (const tg of mine) { assert.equal(tg.sessionId, x); assert.equal(tg.kind, GRANT_TAG_KIND) }
    assert.equal(tags().length, before + 5)
    const used = approvalAudit(ctx.home).filter((a) => a.record.answer === GRANT_AUDIT.used && a.record.grantId === prefixGrant)
    assert.equal(used.length, 5, 'one grant-used audit row per covered call')
  })

  it('GRT-03 `npm test && git push` is covered too (accepted risk)', T, async () => {
    await g.covered(x, 'bash', 'npm test && git push ' + tok('03'))
  })

  for (const [label, command, covered] of [
    ['longer, with a flag', 'npm test --watch', true],
    ['raw text: npm testing', 'npm testing', true],
    ['one character short', 'npm tes', false],
    ['other word', 'npm run test', false],
    ['other case', 'NPM test', false],
    ['double space', 'npm  test', false],
    ['prefix not at the start', 'echo npm test', false],
  ]) {
    it('GRT-04 ' + label + ': ' + (covered ? 'covered' : 'goes to Fishball'), T, async () => {
      const cmd = command + ' ' + tok('04')
      if (covered) await g.covered(x, 'bash', cmd)
      else await g.uncovered(x, 'bash', cmd)
    })
  }

  it('GRT-04 a command exactly equal to the prefix is covered (boundary)', T, async () => {
    const prefix = 'zq' + tok('04b')
    const c = await g.create(y, 'bash', prefix + ' init', { kind: GRANT_KIND.prefix, prefix, expires_at: iso(HOUR) })
    assert.equal(c.json.ok, true, JSON.stringify(c.json))
    await g.covered(y, 'bash', prefix)
  })

  it('GRT-05 the same command in another tool is not covered by the bash grant', T, async () => {
    await g.uncovered(x, 'pwsh', 'npm test ' + tok('05'))
  })

  it('GRT-06 the same command in another session is not covered (the grant belongs to its session)', T, async () => {
    await g.uncovered(y, 'bash', 'npm test ' + tok('06'))
  })

  it('GRT-07 an exact grant: repeats are covered, a changed argument is not', T, async () => {
    const text = tok('07')
    const args = { text, pad: 'p' }
    const requestId = await (async () => {
      await settledIdle(ctx.host, y)
      await ctx.host.call('driveStart', { sessionId: y, script: [[{ tool: ASK_TOOL, args, id: cid('07') }], [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, text)
      await settledIdle(ctx.host, ctx.fb)
      return req.id
    })()
    const j = await g.answer(requestId, { decision: 'grant', risk: 'low', reason: 'fbtest', grant: { kind: GRANT_KIND.exact, expires_at: iso(HOUR) } })
    assert.equal(j.ok, true, JSON.stringify(j))
    await ctx.host.call('waitIdle', { sessionId: y })
    const run = async (a) => { const id = cid('07r'); const r = await turn(ctx.host, y, [[{ tool: ASK_TOOL, args: a, id }], [{ text: 'done' }]]); return resultById(r, id)?.text }
    const steps = await g.fbSteps()
    assert.match(await run(args), /allowed-once/, 'first repeat')
    assert.match(await run(args), /allowed-once/, 'second repeat')
    assert.match(await run({ pad: 'p', text }), /allowed-once/, 'key order does not matter')
    assert.equal(await g.fbSteps(), steps, 'no Fishball step for the covered repeats')
    for (const changed of [{ text, pad: 'q' }, { text: text + '!', pad: 'p' }, { text }]) {
      const id = cid('07c')
      await settledIdle(ctx.host, y)
      await ctx.host.call('driveStart', { sessionId: y, script: [[{ tool: ASK_TOOL, args: changed, id }], [{ text: 'done' }]] })
      const req = await waitRequest(ctx.host, ctx.fb, changed.text)
      assert.ok(req, 'a changed call reaches Fishball: ' + JSON.stringify(changed))
      await settledIdle(ctx.host, ctx.fb)
      await g.finishRejected(req.id, y, id)
    }
  })

  for (const tool of PREFIX_TOOLS.filter((n) => n !== 'bash')) {
    it('GRT-08 a prefix grant on ' + tool + ' is accepted and covers a following command', T, async () => {
      const c = await g.create(x, tool, 'make build ' + tok('08' + tool), { kind: GRANT_KIND.prefix, prefix: 'make build', expires_at: iso(HOUR) })
      assert.equal(c.json.ok, true, JSON.stringify(c.json))
      await g.covered(x, tool, 'make build all ' + tok('08c'))
    })
  }

  for (const tool of EXACT_ONLY_TOOLS) {
    it('GRT-09 a prefix grant on ' + tool + ' is refused; the request stays pending; no grant', T, async () => {
      const before = grantRows().length
      const needle = 'make ' + tok('09' + tool)
      const id = cid('09')
      const args = tool === ASK_TOOL ? { text: needle } : { command: needle }
      const requestId = await g.directWith(x, tool, args, needle, id)
      const j = await g.answer(requestId, { decision: 'grant', risk: 'low', reason: 'fbtest', grant: { kind: GRANT_KIND.prefix, prefix: 'make', expires_at: iso(HOUR) } })
      assert.equal(j.ok, false, JSON.stringify(j))
      assert.equal(grantRows().length, before)
      await g.finishRejected(requestId, x, id)
    })
  }

  it('GRT-09 an exact grant on run_code is accepted (exact-call grants are for every tool)', T, async () => {
    const needle = 'print(' + tok('09x') + ')'
    const id = cid('09x')
    const requestId = await g.directWith(x, 'run_code', { command: needle }, needle, id)
    const j = await g.answer(requestId, { decision: 'grant', risk: 'low', reason: 'fbtest', grant: { kind: GRANT_KIND.exact, expires_at: iso(HOUR) } })
    assert.equal(j.ok, true, JSON.stringify(j))
    await ctx.host.call('waitIdle', { sessionId: x })
    await g.covered(x, 'run_code', needle)
  })

  describe('GRT-10 refused answers leave the request pending and create nothing', () => {
    const valid = () => ({ decision: 'grant', risk: 'low', reason: 'fbtest', grant: { kind: GRANT_KIND.prefix, prefix: 'make', expires_at: iso(HOUR) } })
    const cases = [
      ['no end time', (a) => { delete a.grant.expires_at }],
      ['an end time in the past', (a) => { a.grant.expires_at = iso(-HOUR) }],
      ['an end time of one second ago', (a) => { a.grant.expires_at = iso(-1000) }],
      ['an end time that is not a time', (a) => { a.grant.expires_at = 'tomorrow-ish' }],
      ['no grant object', (a) => { delete a.grant }],
      ['an unknown kind', (a) => { a.grant.kind = 'any' }],
      ['kind prefix without a prefix', (a) => { delete a.grant.prefix }],
      ['kind prefix with an empty prefix', (a) => { a.grant.prefix = '' }],
      ['risk high (allow\'s rules)', (a) => { a.risk = 'high' }],
      ['an empty reason (allow\'s rules)', (a) => { a.reason = '  ' }],
    ]
    for (const [label, mutate] of cases) {
      it(label, T, async () => {
        const before = grantRows().length
        const decisionsBefore = decisions().filter((d) => d.action === GRANT_ACTION.grant).length
        const cmd = 'make ' + tok('10')
        const id = cid('10')
        const requestId = await g.direct(x, 'bash', cmd, id)
        const args = valid()
        mutate(args)
        const j = await g.answer(requestId, args)
        assert.equal(j.ok, false, 'refused: ' + JSON.stringify(j))
        assert.equal(typeof j.code, 'string', 'with a code: ' + JSON.stringify(j))
        assert.equal(grantRows().length, before, 'no grant row')
        assert.equal(decisions().filter((d) => d.action === GRANT_ACTION.grant).length, decisionsBefore)
        // Still pending: a valid answer is accepted.
        await g.finishRejected(requestId, x, id)
      })
    }
  })

  it('GRT-11 an end time one year out is accepted and any number of grants are active at once', T, async () => {
    const before = activeFor(await g.snapshotGrants(), y).length
    const prefixes = ['aaa', 'bbb', 'ccc']
    const made = []
    for (const [i, prefix] of prefixes.entries()) {
      const c = await g.create(y, 'bash', prefix + ' ' + tok('11'), { kind: GRANT_KIND.prefix, prefix, expires_at: iso(i === 0 ? YEAR : HOUR) })
      assert.equal(c.json.ok, true, prefix + ': ' + JSON.stringify(c.json))
      made.push(c.grantId)
    }
    const active = activeFor(await g.snapshotGrants(), y)
    assert.equal(active.length, before + 3)
    const year = active.find((e) => snapId(e) === made[0])
    assert.ok(Math.abs(endsAt(year) - (Date.now() + YEAR)) < 60000, 'a year out: ' + JSON.stringify(year))
  })

  it('GRT-12 a grant made through ask_fishball; ask_fishball for a covered call answers allowed at once', T, async () => {
    const cmd = 'cargo build ' + tok('12')
    const args = { tool: 'bash', arguments: { command: cmd }, quote: [], why: 'fbtest why ' + cmd }
    await g.t.plan(cmd, { decision: 'grant', risk: 'low', reason: 'user said builds are fine', grant: { kind: GRANT_KIND.prefix, prefix: 'cargo build', expires_at: iso(HOUR) } })
    await settledIdle(ctx.host, x)
    const first = cid('12a')
    const r = await turn(ctx.host, x, [askStep(args, first), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r, first))?.code, ASK_CODE.allowed, resultById(r, first)?.text)
    await settledIdle(ctx.host, ctx.fb)
    // Now covered: a direct call, and an ask_fishball of another matching command.
    await g.covered(x, 'bash', 'cargo build --release ' + tok('12b'))
    const steps = await g.fbSteps()
    const second = cid('12c')
    const cmd2 = 'cargo build -p x ' + tok('12d')
    const r2 = await turn(ctx.host, x, [askStep({ ...args, arguments: { command: cmd2 } }, second), [{ text: 'done' }]])
    assert.equal(jsonOf(resultById(r2, second))?.code, ASK_CODE.allowed, resultById(r2, second)?.text)
    await sleep(QUIET_MS)
    assert.equal((await g.notices(cmd2)).length, 0, 'no notice')
    assert.equal(await g.fbSteps(), steps, 'no Fishball step')
  })
})
