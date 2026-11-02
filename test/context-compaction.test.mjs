/**
 * P4 C5, C10-C14: what a smaller window does to Fishball's session (compaction, reply cap, model changes).
 * Load turns are plain user messages of a fixed size; the fake model answers 'ok'.
 *
 * | id     | technique                    | req      | expected |
 * |--------|------------------------------|----------|----------|
 * | CMPN-01 | BVA (pressure below / at threshold(N)) | C5 | N 40000 (threshold 30000), 10k-token turns: no compaction while before+message < threshold-1000; a compaction at the latest in the first turn that starts at or above the threshold; earlier than DSH's default threshold for the model |
 * | CMPN-02 | EP                          | C5       | the summarisation call has purpose compaction, maxTokens H = min(65536, N/8); its final user message has the 7 headings and 'Keep the whole checkpoint under about floor(H*0.75) words' |
 * | CMPN-03 | EP (pressure after)          | C13      | after the compaction pressureTokens < threshold |
 * | CMPN-04 | EP (ordinary session, same load) | C5   | a standard-preset session given the same turns does not compact; its requests keep maxTokens 4096 |
 * | CMPN-05 | EP                          | C4       | every Fishball request of these turns has maxTokens <= outputCap |
 * | MOD-01 | ST (model a -pick b, turn->) | C10      | nothing set: modelWindow, effectiveWindow 300000 and threshold defaultThreshold(300000, 4096) after the turn |
 * | MOD-02 | ST (adapters-updated)        | C10      | b's window changed to 200000: state follows without a turn |
 * | MOD-03 | DT (N between the two windows) | C6, C10 | N 200000: full window on a (outputCap null), effective 200000 with cap 25000 on b, back to a: full window again |
 * | MOD-04 | ST (window disappears with N set) | C7, C10 | error model-window-unknown; the next turn still completes; window back -> error null |
 * | BOOT-01 | ST (window flips during boot: on adapter registration / after the first lookup) | C15 | N 150000 stored; window 128000 -> 200000: state shows effective 150000, cap 18750, threshold 112500 |
 * | BOOT-02 | ST (-> next idle -> load) | C15     | the session compacts at 112500 (not 58368 or 130368); caps <= 18750; summary maxTokens 18750 |
 * | LKP-01 | ST (lookup throws on adapters-updated) | C10 update | state unchanged (window, cap, threshold, error null); a turn completes with cap <= 5000 |
 * | LKP-02 | ST (lookup hangs 15 s)       | C10 update | same, also after the hang ends |
 * | LKP-03 | ST (lookups work again)      | C10      | the new window 60000 is taken; effective 40000 |
 * | OVF-03 | EP (summary fails)           | C12 update | the oversized turn completes with an answer; no summary; the request carried the whole message; the next turn completes |
 * | MID-01 | ST (save while a request is held) | C14   | the save answers 200; the held turn ends completed; the next turn's request has maxTokens <= the new cap |
 * | OVF-01 | EP (one message above W_eff - O) | C12  | N 24000, a 100000-character message: the turn ends completed with an assistant answer and a compaction; the message is logged in full (whether it reached the model verbatim is a diagnostic: it may be summarised) |
 * | OVF-02 | ST (after the oversized turn) | C13     | one more plain turn: completed, and pressureTokens < threshold (A43) |
 * | OFF-01 | ST (compaction on -user off->) with N set | C11 | compactionOff true after the change applies; the reply cap still applies |
 * | OFF-02 | EP (load above threshold, compaction off) | C11 | no compaction event; the turn completes |
 * | OFF-03 | DT (off x no smaller window / on x smaller window) | C11 | compactionOff false in both |
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { API, FAKE, FAKE_MODELS, FAKE_WINDOW, PRESET, SUMMARY_HEADINGS, SUMMARY_WORDS_PER_TOKEN } from './support/constants.mjs'
import { HOOK, T, assertCompactsAt, defaultOutputCap, defaultThreshold, headroomFor, loadTurn, loadUntilCompaction, saveWindow, settle, smallThreshold, turn, windowNow } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

const W = FAKE_WINDOW.default
const R = FAKE_WINDOW.defaultMaxTokens
const LONG = { timeout: 180000 }
const ok = [[{ text: 'ok' }]]
const COMPLETED = [{ kind: 'completed' }]

describe('P4 compaction at the smaller window', () => {
  const N = 40000
  const CHARS = 40000 // about 10,000 tokens per turn at DSH's 4 characters per token
  const MAX_TURNS = 6
  let host
  let fb
  let std
  const fbTurns = []
  let threshold
  let outputCap

  before(async () => {
    const booted = await bootLive(newHome('ctx-compact'))
    host = booted.host
    fb = booted.state?.sessionId
    std = (await host.call('ordinary', { preset: PRESET.standard })).sessionId
    const res = await saveWindow(host, N, null)
    assert.equal(res.status, 200, 'precondition: ' + res.text)
    ;({ threshold, outputCap } = res.json.state.contextWindow)
    assert.equal(threshold, smallThreshold(N, defaultOutputCap(N)))
    fbTurns.push(...(await loadUntilCompaction(host, fb, CHARS, MAX_TURNS)))
  }, LONG)
  after(async () => { await host?.stop() }, HOOK)

  it('CMPN-01 Fishball compacts once its request size reaches threshold(N), not before', T, async (t) => {
    t.diagnostic('threshold ' + threshold + '; turns ' + JSON.stringify(fbTurns.map(({ before, after, compactions }) => ({ before, after, compactions: compactions.length }))))
    const first = assertCompactsAt(fbTurns, threshold, CHARS / 4, assert)
    assert.ok(fbTurns[first].before + CHARS / 4 < defaultThreshold(W, R), 'earlier than DSH\'s default threshold ' + defaultThreshold(W, R))
    for (const x of fbTurns) assert.deepEqual(x.turnEnds, COMPLETED)
  })

  it('CMPN-02 the summary call uses Fishball\'s instruction and maxTokens H', T, async () => {
    const calls = await host.call('aux', { sessionId: fb, purpose: 'compaction' })
    assert.ok(calls.length >= 1, 'a compaction call was made')
    const budget = 'Keep the whole checkpoint under about ' + Math.floor(headroomFor(N) * SUMMARY_WORDS_PER_TOKEN) + ' words'
    for (const c of calls) {
      assert.equal(c.maxTokens, headroomFor(N))
      for (const h of SUMMARY_HEADINGS) assert.ok(c.lastUserText.includes(h), 'heading ' + h + ' in the final user message')
      assert.ok(c.lastUserText.includes(budget), 'word budget "' + budget + '" in: ' + (c.lastUserText.match(/Keep the whole checkpoint[^\n]*/)?.[0] ?? '(none)'))
    }
  })

  it('CMPN-03 after the compaction pressureTokens is below the threshold', T, async () => {
    const cw = await windowNow(host)
    assert.ok(Number.isInteger(cw.pressureTokens))
    assert.ok(cw.pressureTokens < threshold, cw.pressureTokens + ' < ' + threshold)
  })

  it('CMPN-04 an ordinary session with the same load does not compact', T, async (t) => {
    const caps = []
    for (let i = 0; i < fbTurns.length; i++) caps.push(...(await loadTurn(host, std, i, CHARS)).requests.map((q) => q.maxTokens))
    assert.deepEqual(await host.call('compactionEvents', { sessionId: std }), [])
    assert.deepEqual(await host.call('aux', { sessionId: std, purpose: 'compaction' }), [])
    assert.deepEqual([...new Set(caps)], [R])
    t.diagnostic('ordinary turns: ' + fbTurns.length)
  })

  it('CMPN-05 every Fishball request of the load has maxTokens <= outputCap', T, async () => {
    for (const x of fbTurns) for (const cap of x.caps) assert.ok(cap !== null && cap <= outputCap, cap + ' <= ' + outputCap)
  })
})

describe('P4 the window follows the model', () => {
  let host
  let fb
  const B = FAKE_MODELS.b
  const pick = async (model) => {
    const r = await host.call('selectModel', { sessionId: fb, model })
    assert.equal(r.ok, true, JSON.stringify(r.error))
  }
  /** One turn on the picked model; returns its requests once the state reports that model's window. */
  const turnOn = async (window) => {
    const r = await turn(host, fb, ok)
    await until(async () => (await windowNow(host)).modelWindow === window, 5000, 50)
    return r
  }

  before(async () => {
    const booted = await bootLive(newHome('ctx-model'))
    host = booted.host
    fb = booted.state?.sessionId
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MOD-01 picking another model updates the window after the next turn', T, async () => {
    await pick(B)
    const r = await turnOn(FAKE_WINDOW.b)
    assert.equal(r.requests.at(-1)?.model, B, 'precondition: the request went to model b')
    const cw = await windowNow(host)
    assert.equal(cw.modelWindow, FAKE_WINDOW.b)
    assert.equal(cw.effectiveWindow, FAKE_WINDOW.b)
    assert.equal(cw.threshold, defaultThreshold(FAKE_WINDOW.b, R))
    assert.equal(cw.outputCap, null)
  })

  it('MOD-02 llm/adapters-updated with a new window updates the state without a turn', T, async () => {
    await host.call('setModelWindow', { model: B, window: 200000 })
    const ok2 = await until(async () => (await windowNow(host)).modelWindow === 200000, 5000, 50)
    const cw = await windowNow(host)
    assert.ok(ok2, 'modelWindow follows: ' + JSON.stringify(cw))
    assert.equal(cw.effectiveWindow, 200000)
    assert.equal(cw.threshold, defaultThreshold(200000, R))
    await host.call('setModelWindow', { model: B, window: FAKE_WINDOW.b })
    assert.ok(await until(async () => (await windowNow(host)).modelWindow === FAKE_WINDOW.b, 5000, 50))
  })

  it('MOD-03 a window between the two models applies only on the larger one', T, async () => {
    const N = 200000
    await pick(FAKE.model)
    await turnOn(W)
    const saved = await saveWindow(host, N, null)
    assert.equal(saved.status, 200, saved.text)
    let cw = saved.json.state.contextWindow
    assert.equal(cw.effectiveWindow, W, 'on model a the setting acts as unset')
    assert.equal(cw.outputCap, null)
    await pick(B)
    await turnOn(FAKE_WINDOW.b)
    cw = await windowNow(host)
    assert.equal(cw.effectiveWindow, N)
    assert.equal(cw.outputCap, defaultOutputCap(N))
    assert.equal(cw.threshold, smallThreshold(N, defaultOutputCap(N)))
    const cap = (await turn(host, fb, ok)).requests.at(-1)?.maxTokens
    assert.ok(cap !== null && cap <= defaultOutputCap(N), 'request maxTokens ' + cap + ' on model b')
    await pick(FAKE.model)
    await turnOn(W)
    cw = await windowNow(host)
    assert.equal(cw.effectiveWindow, W)
    assert.equal(cw.outputCap, null)
    assert.equal(cw.contextWindowTokens, N)
  })

  it('MOD-04 a model losing its window with a setting reports model-window-unknown, and turns still complete', T, async () => {
    assert.equal((await saveWindow(host, 40000, null)).status, 200)
    await host.call('setModelWindow', { model: FAKE.model, window: null })
    assert.ok(await until(async () => (await windowNow(host)).error === 'model-window-unknown', 5000, 50), 'error: ' + JSON.stringify(await windowNow(host)))
    const cw = await windowNow(host)
    assert.equal(cw.modelWindow, null)
    assert.equal(cw.contextWindowTokens, 40000, 'the stored value is kept')
    assert.deepEqual((await turn(host, fb, ok)).turnEnds, COMPLETED)
    await host.call('setModelWindow', { model: FAKE.model, window: W })
    assert.ok(await until(async () => (await windowNow(host)).error === null, 5000, 50))
    assert.equal((await windowNow(host)).effectiveWindow, 40000)
  })
})

/**
 * C15: the model window changes during boot (llm/adapters-updated) while N 150000 is stored.
 * Before: window 128000 <= N, so the setting acts as unset (DSH default threshold 58368).
 * After: window 200000 > N, so effective 150000, cap 18750, H 18750, threshold 112500.
 * A stale config would compact at 58368 (old policy) or at DSH's default for 200000 (130368).
 * Load turns of about 20k tokens from about 3.4k start at 3.4k, 23.4k, ..., 103.4k: only the
 * turn starting at 103.4k reaches 112500, and it does not reach 130368.
 */
const FLIP_WINDOW = 200000
const FLIP_N = 150000
for (const at of ['apply', 'lookup']) {
  describe('P4 the policy changes during boot (' + at + ') and the mounted compaction follows it (C15)', () => {
    const CHARS = 80000
    let host
    let fb

    before(async () => {
      const home = newHome('ctx-flip-' + at)
      const booted = await bootLive(home)
      fb = booted.state?.sessionId
      const saved = await saveWindow(booted.host, FLIP_N, null)
      assert.equal(saved.status, 200, 'precondition: ' + saved.text)
      assert.equal(saved.json.state.contextWindow.effectiveWindow, W, 'precondition: acts as unset on 128000')
      await booted.host.stop()
      host = await bootHost(home, { env: { FBTEST_WINDOW_FLIP: JSON.stringify({ window: FLIP_WINDOW, at }) } })
      await host.waitStatus('live')
    }, HOOK)
    after(async () => { await host?.stop() }, HOOK)

    it('BOOT-01 (' + at + ') the state reports the new policy after boot', T, async (t) => {
      t.diagnostic('flip: ' + JSON.stringify(await host.call('windowFlip')))
      assert.ok(await host.call('windowFlip'), 'precondition: the window changed during boot')
      const O = defaultOutputCap(FLIP_N)
      assert.ok(await until(async () => (await windowNow(host)).modelWindow === FLIP_WINDOW, 5000, 50), JSON.stringify(await windowNow(host)))
      const cw = await windowNow(host)
      assert.equal(cw.effectiveWindow, FLIP_N)
      assert.equal(cw.outputCap, O)
      assert.equal(cw.threshold, smallThreshold(FLIP_N, O))
      assert.equal(cw.error, null)
    })

    it('BOOT-02 (' + at + ') after the next idle the session compacts at the new threshold, with the new caps', LONG, async (t) => {
      await turn(host, fb, ok) // one idle phase after boot
      const threshold = (await windowNow(host)).threshold
      const turns = await loadUntilCompaction(host, fb, CHARS, 8)
      t.diagnostic('threshold ' + threshold + '; turns ' + JSON.stringify(turns.map((x) => [x.before, x.compactions.length])))
      assertCompactsAt(turns, threshold, CHARS / 4, assert)
      for (const x of turns) for (const cap of x.caps) assert.ok(cap <= defaultOutputCap(FLIP_N), 'cap ' + cap)
      const calls = await host.call('aux', { sessionId: fb, purpose: 'compaction' })
      assert.ok(calls.length > 0 && calls.every((c) => c.maxTokens === headroomFor(FLIP_N)), 'summary maxTokens ' + JSON.stringify(calls.map((c) => c.maxTokens)))
    })
  })
}

describe('P4 failed model lookups keep the last known window (C10 update)', () => {
  const N = 40000
  let host
  let fb
  let known

  before(async () => {
    const booted = await bootLive(newHome('ctx-lookup'))
    host = booted.host
    fb = booted.state?.sessionId
    const res = await saveWindow(host, N, null)
    assert.equal(res.status, 200, 'precondition: ' + res.text)
    known = res.json.state.contextWindow
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  /** Same window, cap and threshold as when the lookup last worked; no error. */
  const assertKept = async () => {
    const { pressureTokens: _p, ...now } = await windowNow(host)
    const { pressureTokens: _k, ...was } = known
    assert.deepEqual(now, was)
  }

  it('LKP-01 a lookup that throws on llm/adapters-updated keeps the window and the cap', T, async () => {
    const lookups = await host.call('lookupCount')
    await host.call('setLookupFailure', { mode: 'throw' })
    await host.call('setModelWindow', { window: 60000 })
    assert.ok(await until(async () => (await host.call('lookupCount')) > lookups, 5000, 50), 'precondition: a lookup was attempted')
    await sleep(300)
    await assertKept()
    const r = await turn(host, fb, ok)
    assert.deepEqual(r.turnEnds, COMPLETED)
    assert.ok(r.requests.at(-1).maxTokens <= known.outputCap, 'cap kept: ' + r.requests.at(-1).maxTokens)
    await assertKept()
  })

  it('LKP-02 a lookup that hangs keeps the window and the cap, and turns complete', T, async () => {
    await host.call('setLookupFailure', { mode: 'hang', hangMs: 15000 })
    await host.call('setModelWindow', { window: 60000 })
    await sleep(500)
    await assertKept()
    const r = await turn(host, fb, ok)
    assert.deepEqual(r.turnEnds, COMPLETED)
    assert.ok(r.requests.at(-1).maxTokens <= known.outputCap, 'cap kept: ' + r.requests.at(-1).maxTokens)
    await sleep(16000)
    await assertKept()
  })

  it('LKP-03 when lookups work again the new window is taken', T, async () => {
    await host.call('setLookupFailure', { mode: null })
    await host.call('setModelWindow', { window: 60000 })
    assert.ok(await until(async () => (await windowNow(host)).modelWindow === 60000, 5000, 50), JSON.stringify(await windowNow(host)))
    const cw = await windowNow(host)
    assert.equal(cw.effectiveWindow, N)
    assert.equal(cw.error, null)
  })
})

describe('P4 mid-turn changes, the hard ceiling and compaction off', () => {
  const N = 24000
  let host
  let fb

  before(async () => {
    const booted = await bootLive(newHome('ctx-ovf'))
    host = booted.host
    fb = booted.state?.sessionId
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MID-01 a save during a turn never fails it and applies by the next turn', T, async () => {
    await host.call('holdNext', { sessionId: fb })
    await host.call('driveStart', { sessionId: fb, text: 'held turn' })
    assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 20), 'precondition: request held')
    const res = await saveWindow(host, N, null)
    assert.equal(res.status, 200, res.text)
    await host.call('releaseHold', { sessionId: fb })
    assert.equal(await host.call('waitIdle', { sessionId: fb }), true)
    assert.deepEqual(await host.call('lastTurnEnd', { sessionId: fb }), COMPLETED[0])
    const cap = (await turn(host, fb, ok)).requests.at(-1)?.maxTokens
    assert.ok(cap !== null && cap <= defaultOutputCap(N), 'next turn maxTokens ' + cap)
  })

  it('OVF-01 one message above effectiveWindow - outputCap ends in an answer and a compaction', T, async (t) => {
    const cw = await windowNow(host)
    assert.equal(cw.effectiveWindow, N, 'precondition')
    const chars = 100000 // about 25,000 tokens > 24000 - 3000
    const r = await host.call('drive', { sessionId: fb, text: 'z'.repeat(chars), timeoutMs: 60000 }, 90000)
    t.diagnostic(JSON.stringify({ compactions: r.compactions, turnEnds: r.turnEnds, requests: r.requests.length, after: (await windowNow(host)).pressureTokens }))
    assert.equal(r.idle, true)
    assert.deepEqual(r.turnEnds, COMPLETED)
    assert.ok(r.assistantTexts.some((x) => x.length > 0), 'an assistant answer')
    assert.ok(r.compactions.includes('compaction/summary'), 'a compaction in the same turn')
    assert.ok(r.userLengths.includes(chars), 'the user message is logged in full')
    // C12 update: overflow compaction may summarise the huge message itself, so whether it reached the model verbatim is only reported.
    t.diagnostic('largest request characters: ' + Math.max(...r.requests.map((q) => q.chars)))
  })

  it('OVF-02 the next turn brings the request size below the threshold (C13, A43)', T, async (t) => {
    const r = await turn(host, fb, ok)
    const cw = await windowNow(host)
    t.diagnostic(JSON.stringify({ compactions: r.compactions, pressure: cw.pressureTokens, threshold: cw.threshold }))
    assert.deepEqual(r.turnEnds, COMPLETED)
    assert.ok(cw.pressureTokens < cw.threshold, cw.pressureTokens + ' < ' + cw.threshold)
  })

  it('OVF-03 when the summary fails the oversized turn still completes, with the request sent unchanged (C12 update)', T, async (t) => {
    await host.call('setCompactionFailure', { on: true })
    try {
      const chars = 100000
      const r = await host.call('drive', { sessionId: fb, text: 'v'.repeat(chars), timeoutMs: 60000 }, 90000)
      t.diagnostic(JSON.stringify({ compactions: r.compactions, turnEnds: r.turnEnds, requests: r.requests.map((q) => [q.maxTokens, q.chars]) }))
      assert.equal(r.idle, true)
      assert.deepEqual(r.turnEnds, COMPLETED, 'never ends with the synthetic error')
      assert.ok(r.assistantTexts.some((x) => x.length > 0), 'an assistant answer')
      assert.equal(r.compactions.includes('compaction/summary'), false, 'precondition: the summary failed')
      assert.ok(r.requests.some((q) => q.chars >= chars), 'the request reached the model with the whole message')
      assert.ok(r.userLengths.includes(chars), 'the message is logged in full')
    } finally {
      await host.call('setCompactionFailure', { on: false })
    }
    assert.deepEqual((await turn(host, fb, ok)).turnEnds, COMPLETED, 'the next turn completes')
  })

  it('OFF-01 turning builtin:compaction off with a smaller window sets compactionOff; the cap still applies', T, async () => {
    const res = await host.post(API.plugins, { plugin: 'builtin:compaction', on: false })
    assert.equal(res.status, 200, res.text)
    await settle(host)
    assert.ok(await until(async () => (await windowNow(host)).compactionOff === true, 5000, 50), JSON.stringify(await windowNow(host)))
    const cap = (await turn(host, fb, ok)).requests.at(-1)?.maxTokens
    assert.ok(cap !== null && cap <= defaultOutputCap(N), 'maxTokens ' + cap)
  })

  it('OFF-02 with compaction off no compaction happens, even above the threshold', T, async () => {
    const r = await host.call('drive', { sessionId: fb, text: 'w'.repeat(100000), timeoutMs: 60000 }, 90000)
    assert.equal(r.idle, true)
    assert.deepEqual(r.turnEnds, COMPLETED)
    assert.ok((await windowNow(host)).pressureTokens >= (await windowNow(host)).threshold, 'precondition: above the threshold')
    const r2 = await turn(host, fb, ok)
    assert.deepEqual([...r.compactions, ...r2.compactions], [])
  })

  it('OFF-03 compactionOff is false with no smaller window, and with compaction back on', T, async () => {
    assert.equal((await saveWindow(host, null, null)).status, 200)
    await sleep(300)
    assert.equal((await windowNow(host)).compactionOff, false, 'off without a smaller window')
    assert.equal((await saveWindow(host, N, null)).status, 200)
    assert.ok(await until(async () => (await windowNow(host)).compactionOff === true, 5000, 50), 'off with a smaller window again')
    assert.equal((await host.post(API.plugins, { plugin: 'builtin:compaction', on: true })).status, 200)
    await settle(host)
    assert.ok(await until(async () => (await windowNow(host)).compactionOff === false, 5000, 50), JSON.stringify(await windowNow(host)))
  })
})
