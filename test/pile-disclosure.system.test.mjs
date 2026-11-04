/**
 * Black-box system tests: real isolated DSH host + fake model + real authenticated routes/SSE
 * + DSH-served browser plugin executed at its registered public slot boundary.
 * No implementation source or private helper is inspected/imported. This is not browser geometry:
 * host DOM layout, focus, native keyboard activation and CSS animation must be checked in a browser.
 * BVA 0/1/2/3 cards; EP grant/pending/ordinary; DT folded/expanded x incoming/removing;
 * ST create -> fold -> new request -> unfold -> allow/reject/revoke -> live snapshot -> empty.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { ASK_CODE, CLICK, GRANT_API, GRANT_KIND, PILE_API } from './support/constants.mjs'
import { HOOK, T, fishballClientBundle } from './support/expect.mjs'
import { grantHost, grantTools, iso, tokens, until } from './support/rev11d.mjs'
import { D, PileClient, textOf } from './support/pile-disclosure.mjs'

const CASE = Object.freeze({ label: 'pile-disclosure-system', grantPrefix: 'echo system disclosure ', first: 'Atlas permission', second: 'Boreal permission', third: 'Cedar permission', pollMs: 25, waitMs: 5000 })
const names = tokens('PDS')

describe('Pile groups: served-client and live-host system boundary', () => {
  let ctx, g, c, stream, granted
  const pending = []
  const sent = []
  async function add(label) {
    const sid = await g.t.session(names.tok(label))
    const callId = names.cid(label)
    const entry = { sid, callId, ...(await g.t.escalated(sid, names.tok(label), callId)) }
    pending.push(entry)
    return entry
  }
  async function update(predicate) {
    // Never replay an older matching frame: an old pile can coincidentally lack a later request id.
    assert.ok(await until(() => stream.frames.length && predicate(stream.frames.at(-D.one)), CASE.waitMs, CASE.pollMs), 'latest live SSE publishes the expected state')
    const frame = stream.frames.at(-D.one)
    await c.push(frame); await c.settle()
    return frame
  }
  async function action(entry, decision) {
    const row = c.rows().find((node) => node.props[D.attr.row] === entry.requestId)
    assert.ok(row, 'the real pending request is visible after reopening')
    const { result } = await c.click(c.button(decision === CLICK.allow ? D.action.allow : D.action.reject, row))
    await result
    await update((frame) => !frame.pile.some((card) => card.requestId === entry.requestId))
    const answer = await g.t.answered(entry.sid, entry.callId)
    assert.equal(answer.code, decision === CLICK.allow ? ASK_CODE.allowed : ASK_CODE.rejected)
    return answer
  }
  before(async () => {
    ctx = await grantHost(CASE.label)
    g = grantTools(ctx, names)
    const sid = await g.t.session(names.tok('grant'))
    granted = await g.create(sid, 'bash', CASE.grantPrefix + 'init', { kind: GRANT_KIND.prefix, prefix: CASE.grantPrefix, expires_at: iso(D.expiresMs) })
    assert.ok(granted.grantId, 'real grant creation succeeded')
    await add(CASE.first); await add(CASE.second)
    stream = await ctx.host.sse()
    assert.ok(await until(() => stream.frames.length > D.zero, CASE.waitMs, CASE.pollMs))
    const bundle = await fishballClientBundle(ctx.host)
    assert.equal(bundle.found, true); assert.equal(bundle.status, 200)
    c = await PileClient.create({ script: bundle.text, reducedMotion: true, fetch: async (url, options = {}) => {
      const path = new URL(url).pathname
      if (options.method === 'POST') sent.push({ path, body: JSON.parse(options.body) })
      return fetch(ctx.host.origin + path, { ...options, headers: { ...options.headers, cookie: ctx.host.cookie, origin: ctx.host.origin } })
    } })
    await c.mount(await ctx.host.state(), ctx.fb)
  }, { timeout: 120000 })
  after(async () => { stream?.close(); c?.dispose(); await ctx?.host?.stop() }, HOOK)

  it('PD-S01 EP/BVA: real two-card pile defaults open and the real standing grant defaults closed', T, async () => {
    c.expanded('pending', true); c.count('pending', D.two); c.expanded('grants', false); c.count('grants', D.one)
    assert.equal(c.rows().length, D.two)
  })
  it('PD-S02 ST/DT: title collapse survives a real third request and live count change', T, async () => {
    await c.toggle('pending'); const third = await add(CASE.third)
    await update((frame) => frame.pile.some((card) => card.requestId === third.requestId))
    c.expanded('pending', false); c.expanded('grants', false); c.count('pending', D.two + D.one)
    assert.equal(c.rows().length, D.zero)
    await c.toggle('pending'); assert.equal(c.rows().length, D.two + D.one)
  })
  it('PD-S03 ST: Allow once after whole-group toggles resolves only its real pending call', T, async () => {
    await action(pending[D.zero], CLICK.allow)
    c.expanded('pending', true); c.count('pending', D.two)
    assert.deepEqual(sent.at(-D.one), { path: PILE_API.answer, body: { requestId: pending[D.zero].requestId, decision: CLICK.allow } })
  })
  it('PD-S04 ST: outside answer while collapsed changes count but never reopens; remaining Reject still works', T, async () => {
    await c.toggle('pending')
    const entry = pending[D.one]
    assert.equal((await ctx.host.post(PILE_API.answer, { requestId: entry.requestId, decision: CLICK.reject })).status, 200)
    await update((frame) => frame.pile.length === D.one)
    c.expanded('pending', false); c.count('pending', D.one); assert.equal(c.rows().length, D.zero)
    await c.toggle('pending'); await action(pending.at(-D.one), CLICK.reject)
    assert.equal(c.rows().length, D.zero)
  })
  it('PD-S05 ST: open/collapse/reopen grant and Revoke ends the real grant via unchanged route', T, async () => {
    await c.toggle('grants'); await c.toggle('grants'); await c.toggle('grants')
    assert.match(textOf(c.tree), /Revoke/)
    const { result } = await c.click(c.button(D.action.revoke)); await result
    await update((frame) => !frame.grants.some((grant) => (grant.grantId ?? grant.id) === granted.grantId))
    assert.deepEqual(sent.at(-D.one), { path: GRANT_API.revoke, body: { grantId: granted.grantId } })
    assert.equal((await ctx.host.state()).pile.length, D.zero)
    assert.equal((await ctx.host.post(GRANT_API.revoke, { grantId: granted.grantId })).status, 409, 'a second revoke is still refused')
  })
})
