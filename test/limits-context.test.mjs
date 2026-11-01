/**
 * Revision 11 rev11-limits: the context-window policy fields (DESIGN §16 "Today's constants":
 * replyCapShare 8, headroomShare 8, minWindowTokens 4,096, defaultReplyCapTokens 32,000; §6 for the
 * formulas). Observed through POST /api/fishball/context-window and state.contextWindow. One host
 * (fake model, window 128000 unless a case changes it); cases run in order, each restores defaults.
 *
 * Formulas (§6, with today's constants replaced by the fields):
 *   outputCap (maxOutputTokens unset) = min(defaultReplyCapTokens, floor(N / replyCapShare))
 *   headroom = min(65536, floor(N / headroomShare)); threshold = floor(min(0.8 N, N - outputCap - headroom))
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | L20    | EP (defaults: config lacks the fields) | N 40000: outputCap 5000, threshold 30000 (today's values) |
 * | L21    | ST + BVA (minWindowTokens 50000) | N 49999 refused window-too-small and nothing stored; N 50000 accepted |
 * | L22    | EP (example: minWindowTokens 8192) | N 6000 refused window-too-small |
 * | L23    | ST (minWindowTokens back to 4096) | N 40000 accepted again |
 * | L24    | EP (defaultReplyCapTokens 2000) | N 40000: outputCap 2000; Fishball's next request carries maxTokens <= 2000 |
 * | L25    | DT (defaultReplyCapTokens 2000 x maxOutputTokens 10000) | your own maxOutputTokens wins: outputCap 10000 |
 * | L26    | EP (example: defaultReplyCapTokens 16000, model window 400000) | N 200000: outputCap 16000 (25000 with the default) |
 * | L27    | EP (replyCapShare 4) | N 40000: outputCap 10000, threshold 25000 |
 * | L28    | EP (headroomShare 4) | N 40000: outputCap 5000, threshold 25000 |
 * | L31    | ST + BVA (replyCapShare 8 -> 2 -> 1 refused -> 8) | N 40000: cap 20000 = floor(N/2) (< defaultReplyCapTokens 32000), threshold 15000, next request maxTokens in (5000, 20000]; 1 refused and cap stays 20000; 8 gives 5000 / 30000 again; same agent |
 * | L29    | ST (each field back to its default) | N 40000 gives outputCap 5000, threshold 30000 again |
 * | L30    | ST (no restart) | after every change Fishball is the same agent, never disposed, status live |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { CW_CODE, DSH_COMPACTION, FAKE_WINDOW, LIMITS_R11, STATUS } from './support/constants.mjs'
import { HOOK, T, saveWindow, turn, windowNow } from './support/expect.mjs'
import { bootLive, newHome, until } from './support/host.mjs'

const N = 40000
const D = Object.fromEntries(Object.entries(LIMITS_R11).map(([k, v]) => [k, v.default]))
/** §6 with the fields in place of today's constants. */
const capFor = (n, f = D) => Math.min(f.defaultReplyCapTokens, Math.floor(n / f.replyCapShare))
const thresholdFor = (n, cap, f = D) => Math.floor(Math.min(n * DSH_COMPACTION.thresholdRatio, n - cap - Math.min(DSH_COMPACTION.headroom, Math.floor(n / f.headroomShare))))

describe('rev11-limits: context-window fields', () => {
  let host
  let fb
  let agentTag

  before(async () => {
    const booted = await bootLive(newHome('limits-context'))
    host = booted.host
    fb = booted.state?.sessionId
    agentTag = fb ? (await host.call('inspect', { sessionId: fb })).agentTag : null
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, 'update refused: ' + JSON.stringify(r.error)) }
  const clear = async () => assert.equal((await saveWindow(host, null, null)).status, 200, 'clearing the window')
  async function accepted(n, o = null) {
    const res = await saveWindow(host, n, o)
    assert.equal(res.status, 200, 'save ' + n + '/' + o + ': ' + res.text)
    return windowNow(host)
  }
  async function refused(n, o, code) {
    const before = await windowNow(host)
    const res = await saveWindow(host, n, o)
    assert.equal(res.status, 409, 'save ' + n + '/' + o + ' must be refused: ' + res.text)
    assert.deepEqual(res.json, { ok: false, code })
    const now = await windowNow(host)
    assert.equal(now.contextWindowTokens, before.contextWindowTokens, 'nothing stored')
    assert.equal(now.maxOutputTokens, before.maxOutputTokens, 'nothing stored')
  }
  async function sameAgent() {
    const now = await host.call('inspect', { sessionId: fb })
    assert.equal(now.agentTag, agentTag, 'same agent object (no restart)')
    assert.equal((await host.call('lifecycle')).filter((e) => e.id === fb && e.type === 'disposed').length, 0, 'not disposed')
    assert.equal((await host.state()).status, STATUS.live)
  }

  it('L20 with no field saved, N 40000 gives today\'s cap (5000) and threshold (30000)', T, async () => {
    const cw = await accepted(N)
    assert.equal(cw.outputCap, capFor(N))
    assert.equal(cw.outputCap, 5000)
    assert.equal(cw.threshold, thresholdFor(N, 5000))
    assert.equal(cw.threshold, 30000)
    await clear()
  })

  describe('minWindowTokens', () => {
    it('L21 minWindowTokens 50000: 49999 is refused window-too-small, 50000 is accepted', T, async () => {
      await clear()
      await setLimit({ minWindowTokens: 50000 })
      await refused(49999, null, CW_CODE.windowTooSmall)
      await refused(N, null, CW_CODE.windowTooSmall)
      const cw = await accepted(50000)
      assert.equal(cw.effectiveWindow, 50000)
      await clear()
      await sameAgent()
    })
    it('L22 minWindowTokens 8192 refuses a 6000-token window', T, async () => {
      await setLimit({ minWindowTokens: 8192 })
      await refused(6000, null, CW_CODE.windowTooSmall)
      await sameAgent()
    })
    it('L23 minWindowTokens back to 4096: N 40000 is accepted again', T, async () => {
      await setLimit({ minWindowTokens: D.minWindowTokens })
      const cw = await accepted(N)
      assert.equal(cw.outputCap, 5000)
      await clear()
    })
  })

  describe('defaultReplyCapTokens', () => {
    it('L24 defaultReplyCapTokens 2000 caps the automatic reply cap at 2000, and the next request follows', T, async () => {
      await setLimit({ defaultReplyCapTokens: 2000 })
      const cw = await accepted(N)
      assert.equal(cw.outputCap, 2000)
      assert.equal(cw.threshold, thresholdFor(N, 2000))
      const r = await turn(host, fb, [[{ text: 'ok' }]], 'cap probe')
      const cap = r.requests.at(-1)?.maxTokens
      assert.ok(cap !== null && cap !== undefined && cap <= 2000, 'request maxTokens ' + cap)
      await sameAgent()
    })
    it('L25 your own maxOutputTokens still wins over defaultReplyCapTokens', T, async () => {
      const cw = await accepted(N, 10000)
      assert.equal(cw.outputCap, 10000)
      await clear()
    })
    it('L26 defaultReplyCapTokens 16000 caps the automatic cap at 16000 (model window 400000, N 200000)', T, async (t) => {
      await host.call('setModelWindow', { window: 400000 })
      try {
        assert.ok(await until(async () => (await windowNow(host)).modelWindow === 400000, 5000, 50), 'precondition: model window 400000')
        await setLimit({ defaultReplyCapTokens: D.defaultReplyCapTokens })
        const base = await accepted(200000)
        t.diagnostic('default cap for N 200000: ' + base.outputCap)
        assert.equal(base.outputCap, 25000, 'default: one eighth of the window, under 32000')
        await setLimit({ defaultReplyCapTokens: 16000 })
        const cw = await accepted(200000)
        assert.equal(cw.outputCap, 16000)
        await sameAgent()
      } finally {
        await saveWindow(host, null, null)
        await setLimit({ defaultReplyCapTokens: D.defaultReplyCapTokens })
        await host.call('setModelWindow', { window: FAKE_WINDOW.default })
        await until(async () => (await windowNow(host)).modelWindow === FAKE_WINDOW.default, 5000, 50)
      }
    })
  })

  describe('replyCapShare and headroomShare', () => {
    it('L27 replyCapShare 4: N 40000 gives cap 10000 and threshold 25000', T, async () => {
      await setLimit({ replyCapShare: 4 })
      const cw = await accepted(N)
      assert.equal(cw.outputCap, 10000)
      assert.equal(cw.threshold, thresholdFor(N, 10000))
      assert.equal(cw.threshold, 25000)
      await clear()
      await setLimit({ replyCapShare: D.replyCapShare })
      await sameAgent()
    })
    it('L28 headroomShare 4: N 40000 gives cap 5000 and threshold 25000', T, async () => {
      await setLimit({ headroomShare: 4 })
      const f = { ...D, headroomShare: 4 }
      const cw = await accepted(N)
      assert.equal(cw.outputCap, 5000)
      assert.equal(cw.threshold, thresholdFor(N, 5000, f))
      assert.equal(cw.threshold, 25000)
      await clear()
      await setLimit({ headroomShare: D.headroomShare })
      await sameAgent()
    })
  })

  it('L31 replyCapShare 2 applies live: N 60000 gives cap floor(N/2) 30000; 1 is refused; 8 restores the default cap', T, async () => {
    // rev11e: the window is 60000, not 40000: Fishball's prompt and tools take about 0.17 x W with this share, and rev11e's two tools
    // and persona lines pushed them over the 6800 a 40000 window leaves (manager 2026-11-02, who named 64000). 64000 would make
    // floor(N/2) equal defaultReplyCapTokens (32000) and hide what the case checks, so 60000 (10200 of room) is used.
    const N = 60000
    const f = { ...D, replyCapShare: 2 }
    assert.ok(Math.floor(N / 2) < D.defaultReplyCapTokens, 'precondition: defaultReplyCapTokens does not hide the effect')
    await setLimit({ replyCapShare: 2 })
    const cw = await accepted(N)
    assert.equal(cw.outputCap, capFor(N, f))
    assert.equal(cw.outputCap, 30000)
    assert.equal(cw.threshold, thresholdFor(N, 20000, f))
    assert.equal(cw.threshold, 22500)
    const r = await turn(host, fb, [[{ text: 'ok' }]], 'share-2 probe')
    const cap = r.requests.at(-1)?.maxTokens
    assert.ok(cap !== null && cap !== undefined && cap > 5000 && cap <= 30000, 'request maxTokens ' + cap + ' follows the half-window cap')
    await sameAgent()
    const bad = await host.call('settingsUpdate', { patch: { replyCapShare: 1 } })
    assert.equal(bad.ok, false, 'replyCapShare 1 must be refused')
    assert.equal((await host.state()).limits?.replyCapShare, 2, 'state.limits keeps 2')
    assert.equal((await accepted(N)).outputCap, 30000, 'cap unchanged after the refused 1')
    await setLimit({ replyCapShare: D.replyCapShare })
    const back = await accepted(N)
    assert.equal(back.outputCap, capFor(N, D))
    assert.equal(back.threshold, thresholdFor(N, capFor(N, D), D))
    await clear()
    await sameAgent()
  })

  it('L29 with every field back at its default, N 40000 gives cap 5000 and threshold 30000 again', T, async () => {
    await setLimit({ replyCapShare: D.replyCapShare, headroomShare: D.headroomShare, minWindowTokens: D.minWindowTokens, defaultReplyCapTokens: D.defaultReplyCapTokens })
    const cw = await accepted(N)
    assert.equal(cw.outputCap, 5000)
    assert.equal(cw.threshold, 30000)
    await clear()
  })

  it('L30 none of the changes restarted Fishball', T, async () => {
    await sameAgent()
    assert.equal((await host.call('lifecycle')).filter((e) => e.id === fb && e.type === 'created').length, 1, 'created once')
  })
})
