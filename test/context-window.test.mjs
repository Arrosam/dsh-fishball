/**
 * P4 C1-C4, C6-C9: the context-window setting of the one assistant session, through the HTTP API.
 * Model: the fake model (window 128000, defaultMaxTokens 4096) unless a block says otherwise.
 *
 * | id     | technique                    | req   | expected |
 * |--------|------------------------------|-------|----------|
 * | CTX-01 | EP                           | C1    | GET state and the first SSE frame have contextWindow with exactly the 9 keys; error null or a code; compactionOff boolean |
 * | CTX-02 | EP (nothing set)             | C2    | effectiveWindow = modelWindow = 128000; outputCap, contextWindowTokens, maxOutputTokens null; threshold = floor(min(W*0.8, W-4096-65536)); pressureTokens a positive integer (C13) |
 * | CTX-03 | EP (nothing set)             | C2    | every Fishball request so far carries maxTokens 4096 (the adapter default) |
 * | CTX-04 | DT (body)                    | C3    | each malformed body -> 400 {ok:false, code:'bad-body'}; state unchanged |
 * | CTX-05 | DT + BVA (accepted values)   | C3, C4, C6 | 200 {ok:true, state}; the answer's and GET's contextWindow show the values and the derived effectiveWindow, outputCap, threshold |
 * | CTX-06 | DT + BVA (refused values)    | C3, C7 | 409 {ok:false, code}; state unchanged |
 * | CTX-07 | BVA (window-too-small edge)  | C7    | the smallest accepted N is found by bisection; N-1 is window-too-small; reported as a diagnostic |
 * | CTX-07b | BVA (maxOutputTokens alone) | C6, C7 update | the largest O accepted alone, found by bisection, equals the engine rule's (49980); O+1 is output-too-large |
 * | PRE-01 | BVA + DT (before any request) | C7 update | N 4095, 4095/1, 1, 1/1 and 8 are refused window-too-small before the prompt is measured |
 * | PRE-02 | ST (accepted early -> prompt measured) | C7 update | N 6000 saved early: 200 or window-too-small; after live, a turn completes; the state is consistent (A49); a new save of 6000 is refused |
 * | CTX-08 | ST (unset -> N -> clear -> N+O -> N>=W -> clear) | C4, C6, C8 | Fishball's next request maxTokens follows each save; an ordinary session keeps 4096 |
 * | CTX-09 | ST (SSE)                     | C1, C3 | a frame with the new contextWindow follows a save |
 * | CTX-10 | EP (no cookie)               | C3    | not 200; nothing changes |
 * | CTX-11 | EP (model with no window, nothing set) | C1, C7 | modelWindow, effectiveWindow, threshold null; error null |
 * | CTX-12 | DT (no window x something set) | C7  | 409 model-window-unknown; state unchanged |
 * | CTX-13 | EP (no window, clear)        | C7, C8 | both null -> 200 |
 * | CTX-14 | ST (set -restart->)          | C9    | values and the reply cap survive a restart with the same DSH_HOME |
 * | CTX-15 | ST (set -> recovery -adopt-> live) | C9 | the adopted session starts at defaults; its requests carry 4096 |
 * | CTX-16 | ST (recovery, POST)          | C3    | diagnostic only (A40): observed answer of a save while in recovery |
 * | CTX-17 | DT (failed store x POST)     | C3    | 409 {ok:false, code:'unavailable'} (A41 for the state shape) |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, CONTEXT_WINDOW_KEYS, CW_CODE, DSH_COMPACTION, FAKE_WINDOW, MIN_WINDOW, MS, PRESET, STATUS, STORE } from './support/constants.mjs'
import { HOOK, T, defaultOutputCap, defaultThreshold, engineAcceptsCap, moveArtifacts, saveWindow, smallThreshold, turn, windowNow } from './support/expect.mjs'
import { bootHost, bootLive, newHome, until } from './support/host.mjs'

const W = FAKE_WINDOW.default
const R = FAKE_WINDOW.defaultMaxTokens
/** Review update C6/C7: the largest reply cap DSH's engine accepts alone on window W (49980 for 128000). */
const LARGEST_O = (() => { let o = 1; while (engineAcceptsCap(W, o + 1)) o++; return o })()
const ERRORS = [null, CW_CODE.windowTooSmall, CW_CODE.outputTooLarge, CW_CODE.modelWindowUnknown]
/** The stored and derived fields: everything except the live measurement pressureTokens. */
const settled = ({ pressureTokens: _p, ...rest } = {}) => rest
const DEFAULTS = { contextWindowTokens: null, maxOutputTokens: null, modelWindow: W, effectiveWindow: W, outputCap: null, threshold: defaultThreshold(W, R), error: null, compactionOff: false }
const smaller = (N, O = null) => ({ contextWindowTokens: N, maxOutputTokens: O, modelWindow: W, effectiveWindow: N, outputCap: O ?? defaultOutputCap(N), threshold: smallThreshold(N, O ?? defaultOutputCap(N)), error: null, compactionOff: false })

function assertShape(cw) {
  assert.deepEqual(Object.keys(cw ?? {}).sort(), CONTEXT_WINDOW_KEYS)
  for (const k of ['contextWindowTokens', 'maxOutputTokens', 'modelWindow', 'effectiveWindow', 'outputCap', 'threshold', 'pressureTokens']) {
    assert.ok(cw[k] === null || Number.isInteger(cw[k]), k + ' is null or a whole number: ' + cw[k])
  }
  assert.ok(ERRORS.includes(cw.error), 'error ' + cw.error)
  assert.equal(typeof cw.compactionOff, 'boolean')
}

/** A request's reply cap, the next plain turn of a session. */
const nextCap = async (host, sessionId) => (await turn(host, sessionId, [[{ text: 'ok' }]], 'cap probe')).requests.at(-1)?.maxTokens

describe('P4 context window: API (model window 128000)', () => {
  let host
  let fb
  let ordinary

  before(async () => {
    const booted = await bootLive(newHome('ctx-api'))
    host = booted.host
    fb = booted.state?.sessionId
    ordinary = (await host.call('ordinary', { preset: PRESET.bare })).sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CTX-01 state and the first SSE frame carry contextWindow with the documented keys', T, async () => {
    assertShape(await windowNow(host))
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20))
      assertShape(stream.frames[0].contextWindow)
    } finally { stream.close() }
  })

  it('CTX-02 with nothing set the window is the model window and the threshold is DSH\'s default', T, async () => {
    const cw = await windowNow(host)
    assert.deepEqual(settled(cw), DEFAULTS)
    assert.ok(Number.isInteger(cw.pressureTokens) && cw.pressureTokens > 0, 'pressureTokens after the setup turn: ' + cw.pressureTokens)
  })

  it('CTX-03 with nothing set Fishball\'s requests carry the adapter\'s default maxTokens', T, async () => {
    await turn(host, fb, [[{ text: 'ok' }]])
    const caps = (await host.call('requests', { sessionId: fb })).map((r) => r.maxTokens)
    assert.ok(caps.length >= 2)
    assert.deepEqual([...new Set(caps)], [R])
  })

  const badBodies = [
    ['invalid JSON', '{contextWindowTokens:', true],
    ['a JSON array', '[40000, null]', true],
    ['a JSON string', '"40000"', true],
    ['a JSON number', '40000', true],
    ['JSON null', 'null', true],
    ['{}', {}, false],
    ['missing maxOutputTokens', { contextWindowTokens: 40000 }, false],
    ['missing contextWindowTokens', { maxOutputTokens: 1000 }, false],
    ['contextWindowTokens 0', { contextWindowTokens: 0, maxOutputTokens: null }, false],
    ['maxOutputTokens 0', { contextWindowTokens: null, maxOutputTokens: 0 }, false],
    ['contextWindowTokens -1', { contextWindowTokens: -1, maxOutputTokens: null }, false],
    ['maxOutputTokens -1', { contextWindowTokens: 40000, maxOutputTokens: -1 }, false],
    ['contextWindowTokens 40000.5', { contextWindowTokens: 40000.5, maxOutputTokens: null }, false],
    ['maxOutputTokens 1.5', { contextWindowTokens: 40000, maxOutputTokens: 1.5 }, false],
    ['contextWindowTokens "40000"', { contextWindowTokens: '40000', maxOutputTokens: null }, false],
    ['maxOutputTokens "1000"', { contextWindowTokens: null, maxOutputTokens: '1000' }, false],
    ['contextWindowTokens true', { contextWindowTokens: true, maxOutputTokens: null }, false],
    ['maxOutputTokens false', { contextWindowTokens: null, maxOutputTokens: false }, false],
    ['contextWindowTokens [40000]', { contextWindowTokens: [40000], maxOutputTokens: null }, false],
    ['maxOutputTokens {}', { contextWindowTokens: null, maxOutputTokens: {} }, false],
  ]
  for (const [label, body, raw] of badBodies) {
    it('CTX-04 a body with ' + label + ' answers 400 bad-body and changes nothing', T, async () => {
      const before = settled(await windowNow(host))
      const res = await host.post(API.contextWindow, body, { raw })
      assert.equal(res.status, 400, res.text)
      assert.deepEqual(res.json, { ok: false, code: CW_CODE.badBody })
      assert.deepEqual(settled(await windowNow(host)), before)
    })
  }

  const fullWindow = (N, O) => ({ ...DEFAULTS, contextWindowTokens: N, maxOutputTokens: O, outputCap: O, threshold: O === null ? DEFAULTS.threshold : defaultThreshold(W, O) })
  const accepted = [
    ['N 40000 (cap defaults to N/8)', 40000, null, smaller(40000)],
    ['N 40000, O 10000', 40000, 10000, smaller(40000, 10000)],
    ['N 40000, O 1 (smallest O)', 40000, 1, smaller(40000, 1)],
    ['N 24000', 24000, null, smaller(24000)],
    ['N 127999 (model window - 1)', 127999, null, smaller(127999)],
    ['N 128000 (= model window: same as unset)', 128000, null, fullWindow(128000, null)],
    ['N 1e9 (above the model window: same as unset)', 1e9, null, fullWindow(1e9, null)],
    // C6: maxOutputTokens alone caps replies with the full window. The threshold then uses that cap as DSH's R (A39).
    ['O 1000 alone (full window)', null, 1000, fullWindow(null, 1000)],
    ['O 1 alone (smallest O, full window)', null, 1, fullWindow(null, 1)],
    // Review update: O alone is refused only when DSH's engine would refuse it (example from the update).
    ['O 32000 alone (full window)', null, 32000, fullWindow(null, 32000)],
    ['O at the engine\'s largest accepted cap alone', null, LARGEST_O, fullWindow(null, LARGEST_O)],
    ['N 200000 with O 1000 (full window)', 200000, 1000, fullWindow(200000, 1000)],
    ['both null (defaults)', null, null, DEFAULTS],
  ]
  for (const [label, N, O, expected] of accepted) {
    it('CTX-05 saving ' + label + ' is accepted and shows at once', T, async () => {
      const res = await saveWindow(host, N, O)
      assert.equal(res.status, 200, res.text)
      assert.equal(res.json?.ok, true)
      assert.deepEqual(settled(res.json?.state?.contextWindow), expected, 'state in the answer')
      assert.deepEqual(settled(await windowNow(host)), expected, 'GET state')
    })
  }

  const refused = [
    ['N 20000 with O 30000', 20000, 30000, CW_CODE.outputTooLarge],
    ['N 40000 with O 40000 (cap = window)', 40000, 40000, CW_CODE.outputTooLarge],
    ['N 40000 with O 39999 (cap = window - 1)', 40000, 39999, CW_CODE.windowTooSmall],
    ['O 128000 alone (= model window)', null, 128000, CW_CODE.outputTooLarge],
    ['O 128001 alone', null, 128001, CW_CODE.outputTooLarge],
    ['O 70000 alone (example from the update)', null, 70000, CW_CODE.outputTooLarge],
    ['O 62464 alone (W - O - 65536 = 0)', null, W - DSH_COMPACTION.headroom, CW_CODE.outputTooLarge],
    ['O 62463 alone (W - O - 65536 = 1, tail >= threshold)', null, W - DSH_COMPACTION.headroom - 1, CW_CODE.outputTooLarge],
    ['O one above the engine\'s largest accepted cap alone', null, LARGEST_O + 1, CW_CODE.outputTooLarge],
    ['N 1000', 1000, null, CW_CODE.windowTooSmall],
    ['N 5000', 5000, null, CW_CODE.windowTooSmall],
    ['N 1 (smallest whole number)', 1, null, CW_CODE.windowTooSmall],
    ['N 1 with O 1 (below 4096 wins over the cap rule)', 1, 1, CW_CODE.windowTooSmall],
    ['N 4095 (MIN_WINDOW - 1)', MIN_WINDOW - 1, null, CW_CODE.windowTooSmall],
    ['N 4095 with O 1', MIN_WINDOW - 1, 1, CW_CODE.windowTooSmall],
    ['N 4096 with O 4096 (cap = window)', MIN_WINDOW, MIN_WINDOW, CW_CODE.outputTooLarge],
  ]
  describe('refusals leave the stored value', () => {
    before(async () => { assert.equal((await saveWindow(host, 40000, null)).status, 200, 'precondition: a stored non-default value') }, HOOK)
    for (const [label, N, O, code] of refused) {
      it('CTX-06 saving ' + label + ' is refused ' + code + ' and stores nothing', T, async () => {
        const before = settled(await windowNow(host))
        const res = await saveWindow(host, N, O)
        assert.equal(res.status, 409, res.text)
        assert.deepEqual(res.json, { ok: false, code })
        assert.deepEqual(settled(await windowNow(host)), before)
      })
    }
  })

  it('CTX-07 the smallest accepted window lies next to a window-too-small refusal', T, async (t) => {
    let lo = 5000
    let hi = 40000
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if ((await saveWindow(host, mid, null)).status === 200) hi = mid
      else lo = mid
    }
    t.diagnostic('smallest accepted contextWindowTokens (maxOutputTokens null): ' + hi)
    assert.equal((await saveWindow(host, hi, null)).status, 200)
    assert.deepEqual(settled(await windowNow(host)), smaller(hi))
    const below = await saveWindow(host, hi - 1, null)
    assert.equal(below.status, 409, below.text)
    assert.deepEqual(below.json, { ok: false, code: CW_CODE.windowTooSmall })
    assert.ok(smaller(hi).threshold > 0)
  })

  it('CTX-07b the largest maxOutputTokens accepted alone is where DSH\'s engine stops accepting it', T, async (t) => {
    let lo = 1
    let hi = W
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2)
      if ((await saveWindow(host, null, mid)).status === 200) lo = mid
      else hi = mid
    }
    t.diagnostic('largest maxOutputTokens accepted alone: ' + lo + ' (engine rule predicts ' + LARGEST_O + ')')
    assert.equal(lo, LARGEST_O)
    assert.deepEqual((await saveWindow(host, null, hi)).json, { ok: false, code: CW_CODE.outputTooLarge })
    assert.equal((await saveWindow(host, null, null)).status, 200)
  })

  describe('the reply cap follows each save (state transitions)', () => {
    const steps = [
      ['unset', null, null, (cap) => cap === R],
      ['N 24000 (cap 3000)', 24000, null, (cap) => cap !== null && cap <= 3000],
      ['cleared (no added cap)', null, null, (cap) => cap === R],
      ['N 40000 with O 2000', 40000, 2000, (cap) => cap !== null && cap <= 2000],
      ['N 200000 (>= model window, no cap)', 200000, null, (cap) => cap === R],
      ['N 24000 again (cap 3000)', 24000, null, (cap) => cap !== null && cap <= 3000],
      ['cleared again', null, null, (cap) => cap === R],
    ]
    for (const [label, N, O, ok] of steps) {
      it('CTX-08 after saving ' + label + ' the next request carries the right maxTokens', T, async () => {
        const res = await saveWindow(host, N, O)
        assert.equal(res.status, 200, res.text)
        const cap = await nextCap(host, fb)
        assert.ok(ok(cap), 'Fishball request maxTokens ' + cap + ' (state outputCap ' + (await windowNow(host)).outputCap + ')')
        assert.equal(await nextCap(host, ordinary), R, 'an ordinary session is unchanged')
      })
    }
  })

  it('CTX-09 a save produces an SSE frame with the new contextWindow', T, async () => {
    const stream = await host.sse()
    try {
      assert.ok(await until(() => stream.frames.length > 0, MS.sseFirstFrame, 20))
      const count = stream.frames.length
      assert.equal((await saveWindow(host, 30000, null)).status, 200)
      const frame = await until(() => stream.frames.slice(count).find((f) => f.contextWindow?.contextWindowTokens === 30000), MS.sseChange, 20)
      assert.ok(frame, 'a frame with the new value arrives')
      assert.deepEqual(settled(frame.contextWindow), smaller(30000))
    } finally {
      stream.close()
      await saveWindow(host, null, null)
    }
  })

  it('CTX-10 a save without the browser cookie is refused', T, async () => {
    const before = settled(await windowNow(host))
    const res = await fetch(host.origin + API.contextWindow, { method: 'POST', headers: { origin: host.origin, 'content-type': 'application/json' }, body: JSON.stringify({ contextWindowTokens: 40000, maxOutputTokens: null }) })
    await res.text()
    assert.notEqual(res.status, 200)
    assert.deepEqual(settled(await windowNow(host)), before)
  })
})

describe('P4 context window: saves before any request has measured the prompt', () => {
  let host

  before(async () => {
    // The first conversation call is held before its request is prepared, so no request has been measured yet.
    host = await bootHost(newHome('ctx-premeasure'), { env: { FBTEST_FIRST_PREPARE_DELAY_MS: '12000' } })
    await until(async () => (await host.state())?.sessionId, MS.live, MS.poll)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  for (const [N, O] of [[MIN_WINDOW - 1, null], [MIN_WINDOW - 1, 1], [1, null], [1, 1], [8, null]]) {
    it('PRE-01 before any request, N ' + N + (O ? ' with O ' + O : '') + ' is refused window-too-small', T, async () => {
      assert.equal((await host.call('requests', { sessionId: (await host.state()).sessionId })).length, 0, 'precondition: no request yet')
      const res = await saveWindow(host, N, O)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CW_CODE.windowTooSmall })
    })
  }

  it('PRE-02 a window accepted before the prompt is measured ends in a consistent state, and turns complete (A49)', T, async (t) => {
    const early = await saveWindow(host, 6000, null)
    t.diagnostic('N 6000 before any request: ' + early.status + ' ' + JSON.stringify(early.json?.code ?? early.json?.state?.contextWindow))
    assert.ok(early.status === 200 || (early.status === 409 && early.json?.code === CW_CODE.windowTooSmall), early.text)
    const st = await host.waitStatus(STATUS.live, 40000)
    assert.equal(st?.status, STATUS.live)
    const r = await turn(host, st.sessionId, [[{ text: 'ok' }]])
    assert.deepEqual(r.turnEnds, [{ kind: 'completed' }])
    const cw = await windowNow(host)
    t.diagnostic('after the prompt was measured: ' + JSON.stringify(cw))
    assertShape(cw)
    // Either the window still fits (no error) or it is reported as too small, and then no smaller-window cap applies.
    if (cw.error === null) assert.ok(r.requests.at(-1).maxTokens <= cw.outputCap)
    else assert.equal(cw.error, CW_CODE.windowTooSmall)
    const again = await saveWindow(host, 6000, null)
    assert.deepEqual(again.json, { ok: false, code: CW_CODE.windowTooSmall }, 'the measured prompt no longer fits 6000')
  })
})

describe('P4 context window: a model that reports no window', () => {
  let host

  before(async () => {
    host = await bootHost(newHome('ctx-nowin'), { env: { FBTEST_MODEL_WINDOW: 'none' } })
    await host.waitStatus(STATUS.live)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CTX-11 with nothing set the window fields are null and there is no error', T, async () => {
    const cw = await windowNow(host)
    assertShape(cw)
    assert.deepEqual(settled(cw), { contextWindowTokens: null, maxOutputTokens: null, modelWindow: null, effectiveWindow: null, outputCap: null, threshold: null, error: null, compactionOff: false })
  })

  for (const [N, O] of [[40000, null], [null, 1000], [40000, 1000]]) {
    it('CTX-12 saving ' + JSON.stringify({ N, O }) + ' is refused model-window-unknown', T, async () => {
      const before = settled(await windowNow(host))
      const res = await saveWindow(host, N, O)
      assert.equal(res.status, 409, res.text)
      assert.deepEqual(res.json, { ok: false, code: CW_CODE.modelWindowUnknown })
      assert.deepEqual(settled(await windowNow(host)), before)
    })
  }

  it('CTX-13 clearing is accepted', T, async () => {
    const res = await saveWindow(host, null, null)
    assert.equal(res.status, 200, res.text)
    assert.equal(res.json?.state?.contextWindow?.contextWindowTokens, null)
  })
})

describe('P4 context window: persistence and adopt', () => {
  let host
  let home
  let sid

  before(async () => {
    home = newHome('ctx-persist')
    const booted = await bootLive(home)
    host = booted.host
    sid = booted.state?.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CTX-14 the setting and its reply cap survive a restart', T, async () => {
    assert.equal((await saveWindow(host, 24000, 2000)).status, 200)
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st.sessionId, sid)
    assert.deepEqual(settled(st.contextWindow), smaller(24000, 2000))
    const cap = (await turn(host, sid, [[{ text: 'ok' }]])).requests.at(-1)?.maxTokens
    assert.ok(cap !== null && cap <= 2000, 'maxTokens after restart ' + cap)
  })

  it('CTX-16 a save while in recovery (diagnostic, A40)', T, async (t) => {
    await host.stop()
    moveArtifacts(home, sid, 'away')
    host = await bootHost(home)
    const st = await host.waitStatus(STATUS.recovery)
    assert.equal(st?.status, STATUS.recovery)
    t.diagnostic('contextWindow in recovery: ' + JSON.stringify(st.contextWindow))
    const res = await saveWindow(host, 40000, null)
    t.diagnostic('save in recovery: ' + res.status + ' ' + JSON.stringify(res.json?.code ?? res.json?.state?.contextWindow))
    assert.ok([200, 409].includes(res.status), res.text)
    if (res.status === 409) assert.deepEqual(res.json, { ok: false, code: CW_CODE.unavailable })
    // Put back the value saved for the old session, so CTX-15 tests only C9 (the old session's setting must not carry over).
    if (res.status === 200) assert.equal((await saveWindow(host, 24000, 2000)).status, 200)
  })

  it('CTX-15 the adopted new session starts at defaults', T, async () => {
    const res = await host.post(API.recovery, { action: 'adopt' })
    assert.equal(res.status, 200, res.text)
    const st = await host.waitStatus(STATUS.live)
    assert.notEqual(st.sessionId, sid)
    assert.deepEqual(settled(st.contextWindow), DEFAULTS)
    // The new session's setup turn and a later turn both carry the adapter default (no cap left from the old session).
    const setup = (await host.call('requests', { sessionId: st.sessionId })).map((r) => r.maxTokens)
    const later = (await turn(host, st.sessionId, [[{ text: 'ok' }]])).requests.map((r) => r.maxTokens)
    assert.deepEqual({ setup: [...new Set(setup)], later: [...new Set(later)] }, { setup: [R], later: [R] })
  })
})

describe('P4 context window: unreadable store', () => {
  let host
  let home

  before(async () => {
    home = newHome('ctx-failed')
    fs.mkdirSync(path.dirname(STORE.file(home)), { recursive: true })
    fs.writeFileSync(STORE.file(home), '{"unit": ')
    host = await bootHost(home)
    await host.waitStatus(STATUS.failed)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('CTX-17 with no assistant session a save answers 409 unavailable', T, async (t) => {
    const st = await host.state()
    assert.equal(st.status, STATUS.failed)
    // A41: the state shape while no session exists is not specified; null is observed.
    t.diagnostic('contextWindow while failed: ' + JSON.stringify(st.contextWindow))
    if (st.contextWindow !== null) assertShape(st.contextWindow)
    const res = await saveWindow(host, 40000, null)
    assert.equal(res.status, 409, res.text)
    assert.deepEqual(res.json, { ok: false, code: CW_CODE.unavailable })
  })
})
