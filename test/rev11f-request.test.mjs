/**
 * Revision 11 rev11f: Fishball's own requests (requirements items 21-24; DESIGN §7a.11, §9 `own_requests`, §14 row rev11f,
 * §16 Q-r11-own, Q-r11-own-scope; S35). One host with the scripted stock prompt after the broker (any request that
 * reaches it is seen), Fishball live. add_plugin is the representative tool; the cases run in order and share the host.
 * "Retry" = Fishball's woken turn makes the identical call (the fake model is scripted to do so through a marker).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | OWN-01 | EP (add_plugin, mode asks) | returns at once with ok:false, code waiting-for-approval and the waiting text; a card of Fishball's session in the pile with tool, exact arguments and Fishball's reason; the stock prompt is not asked; nothing installed; own_requests row `waiting` |
 * | OWN-02 | ST (card waiting) | Fishball answers another message at once; the card is still there; no second card |
 * | OWN-03 | ST (waiting –Allow→ approved) | route 200; the card leaves; Fishball is woken by a notice naming the request and saying to run it again; row `approved` |
 * | OWN-04 | ST (approved –identical retry→ used) | the retry in the woken turn runs (the plugin installs), no second card, no stock prompt; row `used` |
 * | OWN-07 | ST (waiting –Reject→ rejected) | Fishball takes no step (quiet); its next turn carries a note naming the request (and the user's note); row `rejected`; the identical call afterwards makes a new card |
 * | OWN-08 | DT (withdraw: waiting / withdrawn already / unknown / a session's card) | waiting: ok, card leaves, row `withdrawn`, a click is 409 expired; a second withdraw, an unknown id and another session's card id are refused and change nothing |
 * | OWN-09 | ST (pass ends with the turn it woke) | Allow with a woken turn that does not retry: a retry in a later turn files a new card |
 * | OWN-10 | EP (policy never) | the request is refused with no card, no stock prompt, no own_requests row |
 * | OWN-11 | ST (restart before the click) | the card is in the pile after the start; Allow after it works: Fishball is woken, the retry runs (installs); an approved but unused pass also survives a restart |
 * | OWN-12 | BVA (rationaleChars 5 / default) | Fishball's reason on the card is cut to at most 5 characters (+ an ellipsis); whole by default |
 * | OWN-13 | BVA (argumentExcerptBytes 16 / default) | the card's arguments are cut to at most 16 bytes + an ellipsis, a prefix of the real ones; whole by default |
 * | OWN-14 | EP (remove_plugin) | a card too, at once, no stock prompt; Allow + retry removes the package |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ADDED_BUNDLE, ADDED_BUNDLE_B, ADDED_BUNDLE_C, CLICK, LIMITS, LIMITS_R11, OWN_REQUEST, OWN_STATUS, PILE_API, WITHDRAW_TOOL } from './support/constants.mjs'
import { HOOK, T, answerCard, cardOf, inFishballFolder, pileNow, untilCard, untilNoCard } from './support/expect.mjs'
import { pileTools } from './support/rev11c.mjs'
import { AT_ONCE_MS, QUIET_MS, bootOwn, cardArguments, ownCards, ownHost, ownRow, ownRows, ownTools, sleep, tokens, until } from './support/rev11f.mjs'

const LONG = { timeout: 180000 }
const names = tokens('OWN')

describe('rev11f: Fishball\'s own requests are cards', () => {
  let ctx
  let t
  const status = (id) => ownRow(ctx.home, id)?.status
  const untilStatus = (id, want) => until(async () => status(id) === want, 5000, 50)
  const spec = ADDED_BUNDLE.dir

  before(async () => {
    ctx = await ownHost('rev11f-request')
    t = ownTools(ctx, names)
  }, HOOK)
  after(async () => { await ctx?.host?.stop() }, HOOK)

  let first // the add_plugin call of OWN-01
  let reason1
  it('OWN-01 add_plugin returns at once with a card; no stock prompt, nothing installed', T, async () => {
    reason1 = names.tok('r1')
    const stock = await t.stockAsked()
    first = await t.add(reason1)
    assert.ok(first.took < AT_ONCE_MS, 'at once: ' + first.took + ' ms')
    assert.equal(first.json?.ok, false, first.result.text)
    assert.equal(first.json.code, OWN_REQUEST.code)
    assert.match(first.result.text, OWN_REQUEST.waiting)
    assert.ok(first.card, 'a card of Fishball\'s session is in the pile: ' + JSON.stringify(await pileNow(ctx.host)))
    assert.equal(first.card.toolName, 'add_plugin')
    assert.equal(cardArguments(first.card).spec, spec, 'the exact arguments')
    assert.ok(JSON.stringify(first.card).includes(reason1), "Fishball's reason is on the card")
    assert.equal(await t.stockAsked(), stock, 'the stock prompt was not asked')
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE.name), false, 'not installed')
    assert.ok(await untilStatus(first.card.requestId, OWN_STATUS.waiting), 'own_requests row waiting: ' + JSON.stringify(ownRow(ctx.home, first.card.requestId)))
    assert.equal(ownRow(ctx.home, first.card.requestId).toolName, 'add_plugin')
  })

  it('OWN-02 Fishball answers another message while the card waits', T, async () => {
    const steps = await t.fbSteps()
    const r = await t.another('fbtest another message ' + names.tok('02'))
    assert.ok(r.idle)
    assert.ok((await t.fbSteps()) > steps, 'Fishball took a step for it')
    const cards = await ownCards(ctx)
    assert.deepEqual(cards.map((c) => c.requestId), [first.card.requestId], 'still the one card')
  })

  let woke
  it('OWN-03 Allow once wakes Fishball with a notice to run it again; the card leaves', LONG, async () => {
    const id = first.card.requestId
    const retry = { tool: 'add_plugin', args: { spec, reason: reason1 }, id: names.cid('retry1') }
    const steps = await t.fbSteps()
    const { answer, retry: got } = await t.click(id, CLICK.allow, { retry })
    assert.equal(answer.status, 200, answer.text)
    assert.equal(await cardOf(ctx.host, id), undefined, 'the card left')
    const notices = await t.notices(id)
    assert.equal(notices.length >= 1, true, 'a notice naming the request reached Fishball')
    assert.match(notices.map((n) => n.text).join('\n'), OWN_REQUEST.again)
    assert.ok((await t.fbSteps()) > steps, 'Fishball was woken')
    woke = got
    assert.ok(woke, 'the woken turn made the retry')
  })

  it('OWN-04 the identical retry ran under the pass: installed, no second add_plugin card, no stock prompt', LONG, async () => {
    // The install leaves a second request: the unchecked-tools prompt, its own card for set_plugin_enabled with its own pass
    // (the manager's confirmed reading, 2026-11-02), not a second add_plugin card.
    assert.equal(woke.json?.installed, 'fishball:' + ADDED_BUNDLE.name, woke.text)
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE.name), true, 'the plugin is installed')
    const cards = await ownCards(ctx)
    assert.deepEqual(cards.map((c) => c.toolName), ['set_plugin_enabled'], 'no second add_plugin card: ' + JSON.stringify(cards))
    assert.deepEqual(cardArguments(cards[0]), { plugin: 'fishball:' + ADDED_BUNDLE.name, on: true })
    assert.equal(await t.stockAsked(), 0)
    assert.ok(await untilStatus(first.card.requestId, OWN_STATUS.used), 'row used: ' + status(first.card.requestId))
    await t.clearOwn()
  })

  it('OWN-07 Reject tells Fishball without waking it, and gives no pass', LONG, async () => {
    const reason = names.tok('r7')
    const r = await t.add(reason, ADDED_BUNDLE_C.dir)
    assert.ok(t.isWaiting(r), r.result.text)
    const id = r.card.requestId
    await sleep(300)
    const steps = await t.fbSteps()
    const note = names.tok('note')
    const { answer } = await t.click(id, CLICK.reject, { note })
    assert.equal(answer.status, 200, answer.text)
    await untilNoCard(ctx.host, id)
    await sleep(QUIET_MS)
    assert.equal(await t.fbSteps(), steps, 'no Fishball step started by the reject')
    assert.ok(await untilStatus(id, OWN_STATUS.rejected))
    const next = await t.another('fbtest after reject ' + names.tok('07'))
    const seen = next.requests.at(-1).texts
    assert.ok(seen.includes(id), "Fishball's next turn carries a note naming the request")
    const again = await t.add(reason, ADDED_BUNDLE_C.dir)
    assert.ok(t.isWaiting(again), 'the identical call after a reject asks again')
    assert.notEqual(again.card.requestId, id)
    await t.withdraw(again.card.requestId)
  })

  describe('OWN-08 withdraw', () => {
    let c1
    before(async () => { c1 = (await t.add(names.tok('08a'), ADDED_BUNDLE_C.dir)).card })
    it('a waiting card: ok, the card leaves, row withdrawn, a click is 409 expired', T, async () => {
      const r = await t.withdraw(c1.requestId)
      assert.equal(r.json?.ok, true, r.result.text)
      assert.ok(await untilNoCard(ctx.host, c1.requestId))
      assert.ok(await untilStatus(c1.requestId, OWN_STATUS.withdrawn))
      const click = await answerCard(ctx.host, c1.requestId, CLICK.allow)
      assert.equal(click.status, 409, click.text)
      assert.equal(click.json?.code, 'expired')
    })
    it('withdrawing it again is refused', T, async () => {
      const r = await t.withdraw(c1.requestId)
      assert.notEqual(r.json?.ok, true, r.result.text)
    })
    it('an unknown id is refused', T, async () => {
      const r = await t.withdraw('apr_' + '0'.repeat(16))
      assert.notEqual(r.json?.ok, true, r.result.text)
    })
    it("another session's card id is refused and the card stays", LONG, async () => {
      const p = pileTools(ctx, names)
      const sid = await p.session('own-w')
      const { requestId } = await p.escalated(sid, names.tok('08s'), names.cid('08s'))
      const r = await t.withdraw(requestId)
      assert.notEqual(r.json?.ok, true, r.result.text)
      assert.ok(await cardOf(ctx.host, requestId), 'the session card is still in the pile')
      await answerCard(ctx.host, requestId, CLICK.reject)
      await ctx.host.call('waitIdle', { sessionId: sid })
    })
  })

  it('OWN-09 the pass ends with the turn Fishball was woken for', LONG, async () => {
    const reason = names.tok('r9')
    const r = await t.add(reason, ADDED_BUNDLE_C.dir)
    const { answer } = await t.click(r.card.requestId, CLICK.allow) // the woken turn does not retry
    assert.equal(answer.status, 200)
    await sleep(500)
    const later = await t.add(reason, ADDED_BUNDLE_C.dir) // a later turn
    assert.ok(t.isWaiting(later), 'a retry in a later turn needs a new card: ' + later.result.text)
    await t.withdraw(later.card.requestId)
  })

  it('OWN-10 policy never: refused with no card, no stock prompt, no row', T, async () => {
    await ctx.host.call('setApprovalPolicy', { sessionId: ctx.fb, policy: 'never' })
    try {
      const rows = ownRows(ctx.home).length
      const r = await t.add(names.tok('r10'), ADDED_BUNDLE_C.dir)
      assert.equal(r.card, undefined, 'no card')
      assert.equal(t.isWaiting(r), false, r.result.text)
      assert.equal(r.json?.ok, false, r.result.text)
      assert.equal(await t.stockAsked(), 0)
      assert.equal(ownRows(ctx.home).length, rows, 'no own_requests row')
    } finally { await ctx.host.call('setApprovalPolicy', { sessionId: ctx.fb, policy: 'ask' }) }
  })

  it('OWN-11 a restart before the click leaves the card; Allow after it works and the retry installs', LONG, async () => {
    await t.clearOwn()
    const args = { spec: ADDED_BUNDLE_B.dir, reason: names.tok('r11') }
    const r = await t.call('add_plugin', args)
    assert.ok(t.isWaiting(r), r.result.text)
    const id = r.card.requestId
    assert.ok(await untilStatus(id, OWN_STATUS.waiting))
    const was = JSON.stringify({ tool: r.card.toolName, arguments: r.card.arguments })
    await ctx.host.call('flush', { sessionId: ctx.fb })
    await ctx.host.stop()
    await bootOwn(ctx)
    t = ownTools(ctx, names)
    const card = await untilCard(ctx.host, id)
    assert.ok(card, 'the card is in the pile after the start: ' + JSON.stringify(await pileNow(ctx.host)))
    assert.equal(JSON.stringify({ tool: card.toolName, arguments: card.arguments }), was, 'same tool and arguments')
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE_B.name), false)
    const { answer, retry } = await t.click(id, CLICK.allow, { retry: { tool: 'add_plugin', args, id: names.cid('11') } })
    assert.equal(answer.status, 200, answer.text)
    assert.equal(retry?.json?.installed, 'fishball:' + ADDED_BUNDLE_B.name, retry?.text)
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE_B.name), true, 'installed')
    assert.deepEqual((await ownCards(ctx)).map((c) => c.toolName), ['set_plugin_enabled'], 'only the unchecked-tools card follows')
    await t.clearOwn()
  })

  it('OWN-12 rationaleChars: Fishball\'s reason is cut on the card (5), whole by default', T, async () => {
    const long = 'ABCDEFGHIJKLMNOP' + names.tok('r12')
    const whole = await t.add(long, ADDED_BUNDLE_C.dir)
    assert.ok(String(whole.card.why).includes(long), 'whole by default (' + LIMITS_R11.rationaleChars.default + ')')
    await t.withdraw(whole.card.requestId)
    await t.setLimit({ rationaleChars: 5 })
    try {
      const cut = await t.add(long, ADDED_BUNDLE_C.dir)
      const text = String(cut.card.why)
      assert.ok(text.includes('ABCDE'), 'the first 5 characters stay')
      assert.equal(text.includes('ABCDEF'), false, 'the sixth is cut: ' + text)
      await t.withdraw(cut.card.requestId)
    } finally { await t.setLimit({ rationaleChars: LIMITS_R11.rationaleChars.default }) }
  })

  it('OWN-13 argumentExcerptBytes: the card\'s arguments are cut to 16 bytes + an ellipsis, whole by default', T, async () => {
    const reason = names.tok('r13')
    const real = JSON.stringify({ spec: ADDED_BUNDLE_C.dir, reason })
    const a = await t.add(reason, ADDED_BUNDLE_C.dir)
    assert.deepEqual(cardArguments(a.card), { spec: ADDED_BUNDLE_C.dir, reason }, 'whole by default')
    await t.withdraw(a.card.requestId)
    await t.setLimit({ argumentExcerptBytes: 16 })
    try {
      const b = await t.add(reason, ADDED_BUNDLE_C.dir)
      const shown = typeof b.card.arguments === 'string' ? b.card.arguments : JSON.stringify(b.card.arguments)
      assert.ok(Buffer.byteLength(shown) <= 16 + 3, 'at most 16 bytes + an ellipsis: ' + shown)
      assert.ok(real.startsWith(shown.replace(/…$/, '')), 'a prefix of the real arguments: ' + shown)
      await t.withdraw(b.card.requestId)
    } finally { await t.setLimit({ argumentExcerptBytes: LIMITS.argumentExcerptBytes.default }) }
  })

  it('OWN-14 remove_plugin is a card too; Allow and the retry remove the package', LONG, async () => {
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE.name), true, 'precondition: installed by OWN-04')
    const args = { plugin: 'fishball:' + ADDED_BUNDLE.name, reason: names.tok('r14') }
    const r = await t.call('remove_plugin', args)
    assert.ok(t.isWaiting(r), r.result.text)
    assert.equal(await t.stockAsked(), 0)
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE.name), true, 'still installed while the card waits')
    const { retry } = await t.click(r.card.requestId, CLICK.allow, { retry: { tool: 'remove_plugin', args, id: names.cid('14') } })
    assert.equal(retry.json?.ok, true, retry.text)
    assert.equal(inFishballFolder(ctx.home, ADDED_BUNDLE.name), false, 'removed')
  })
})
