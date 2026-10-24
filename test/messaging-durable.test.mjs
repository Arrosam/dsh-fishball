/**
 * P5 M9-M11: wake-up cap, durability across restarts, adopt, and the intake store.
 *
 * | id     | technique | req | expected |
 * |--------|-----------|-----|----------|
 * | WAK-01 | EP (input while Fishball runs) | M11 | wakeupsThisHour unchanged; the input is read by the running turn |
 * | WAK-02 | EP (cap 0 = no cap) | M11 | three inputs from idle each wake Fishball |
 * | WAK-03 | BVA (cap = count + 1) | M11 | the input at count + 1 wakes Fishball; the next two are parked: status accepted, queued 2, no model request for 3 s, Fishball idle |
 * | WAK-04 | ST (parked → user chat turn) | M11, M9 | the next chat turn reads both parked inputs; they end consumed (never discarded); queued 0 |
 * | WAK-05 | ST (parked → Send to Fishball) | M11 review | a forward from the user wakes Fishball at once while the cap is reached; that turn reads the parked inputs too |
 * | DUR-01 | ST (accepted while Fishball runs → restart) | M10 | delivered exactly once after the restart and read by Fishball; consumed |
 * | DUR-02 | ST (pending while archived → restart → unarchive + retry) | M10, M1 review | while archived the answer is ok with a 'Queued for Fishball' note and the item is pending; it survives the restart as pending and is delivered exactly once after Fishball is live again |
 * | DUR-03 | EP | M10 | $DSH_HOME/storages/fishball_intake holds per-record files, and no file holds the text of an accepted or consumed message |
 * | DUR-04 | ST (restart) | M10 | a restart re-delivers nothing that was already read |
 * | ADO-01 | ST (accepted in the old inbox → restart with the session lost → adopt) | M9 review | the item becomes discarded; the new session never receives it |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, INTAKE_DIR, MS, NOTE_TEXT, PRESET, STATUS } from './support/constants.mjs'
import { HOOK, T, fishballMessages, intakeNow, messageFishball, moveArtifacts, requestsWith, settledIdle, turn, untilSeen } from './support/expect.mjs'
import { bootHost, bootLive, newHome, sleep, until } from './support/host.mjs'

let seq = 0
const tok = (label) => 'TOK' + label + 'x' + (++seq) + Math.random().toString(36).slice(2, 8)
const LONG = { timeout: 120000 }
const QUIET_MS = 3000

/** Hold Fishball inside a turn so inputs arrive while it is running. */
async function holdFishball(host, fb) {
  await settledIdle(host, fb)
  await host.call('holdNext', { sessionId: fb })
  await host.call('driveStart', { sessionId: fb, text: 'held turn' })
  assert.ok(await until(() => host.call('isHeld', { sessionId: fb }), 5000, 50), 'Fishball is held in a turn')
}
const itemOf = async (host, needleIdentity, createdAfter) => (await intakeNow(host)).items.filter((i) => i.sourceIdentity === needleIdentity && Date.parse(i.createdAt) >= createdAfter)

describe('P5 wake-up cap', () => {
  let host
  let fb
  let sender
  const setLimit = async (patch) => { const r = await host.call('settingsUpdate', { patch }); assert.equal(r.ok, true, JSON.stringify(r.error)) }
  const wakeups = async () => (await intakeNow(host)).wakeupsThisHour

  before(async () => {
    const booted = await bootLive(newHome('wake'))
    host = booted.host
    fb = booted.state?.sessionId
    sender = (await host.call('ordinary', { preset: PRESET.bare, folder: 'wake-sender' })).sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('WAK-01 an input that arrives while Fishball runs does not count as a wake-up', T, async () => {
    const w = await wakeups()
    const text = tok('wak01')
    await holdFishball(host, fb)
    try { assert.equal((await messageFishball(host, sender, { message: text })).json?.ok, true) } finally { await host.call('releaseHold', { sessionId: fb }) }
    assert.ok(await untilSeen(host, fb, text), 'read by the running turn')
    assert.equal(await wakeups(), w)
  })

  it('WAK-02 with wakeupsPerHour 0 every input wakes Fishball', T, async () => {
    await setLimit({ wakeupsPerHour: 0 })
    for (let i = 0; i < 3; i++) {
      const text = tok('wak02')
      await settledIdle(host, fb)
      assert.equal((await messageFishball(host, sender, { message: text })).json?.ok, true)
      assert.ok(await untilSeen(host, fb, text), 'woke for input ' + (i + 1))
    }
  })

  const parked = []
  it('WAK-03 at the cap further inputs are parked: accepted, queued, and no turn starts', T, async () => {
    const w = await wakeups()
    await setLimit({ wakeupsPerHour: w + 1 })
    const last = tok('wak03last')
    await settledIdle(host, fb)
    assert.equal((await messageFishball(host, sender, { message: last })).json?.ok, true)
    assert.ok(await untilSeen(host, fb, last), 'the wake-up at the cap is still allowed')
    assert.equal(await wakeups(), w + 1)
    await settledIdle(host, fb)
    const requests = (await host.call('requests', { sessionId: fb })).length
    const since = Date.now()
    for (const label of ['a', 'b']) {
      const text = tok('wak03' + label)
      parked.push(text)
      assert.equal((await messageFishball(host, sender, { message: text })).json?.ok, true)
    }
    await sleep(QUIET_MS)
    assert.equal((await host.call('requests', { sessionId: fb })).length, requests, 'no model request while parked')
    assert.equal(await host.call('agentStatus', { sessionId: fb }), 'idle')
    const intake = await intakeNow(host)
    assert.equal(intake.queued, 2, 'queued: ' + JSON.stringify(intake))
    const items = intake.items.filter((i) => Date.parse(i.createdAt) >= since && i.kind === 'session')
    assert.equal(items.length, 2)
    for (const i of items) assert.equal(i.status, 'accepted')
    assert.equal(await wakeups(), w + 1, 'parking does not count')
  })

  it('WAK-04 the next chat turn reads every parked input; they end consumed', T, async () => {
    assert.equal(parked.length, 2, 'precondition: WAK-03 parked two inputs')
    const since = Date.now() - 60000
    const r = await turn(host, fb, [[{ text: 'read them' }]], 'the user writes')
    await settledIdle(host, fb)
    const all = await host.call('requests', { sessionId: fb })
    const readers = all.filter((q) => q.at >= r.requests[0]?.at && parked.every((p) => q.texts.includes(p)))
    assert.ok(readers.length > 0, 'a request of that turn has both parked inputs')
    for (const p of parked) assert.equal((await fishballMessages(host, fb, p)).length, 1, 'once')
    assert.ok(await until(async () => (await intakeNow(host)).queued === 0, 5000, 100))
    const items = (await intakeNow(host)).items.filter((i) => Date.parse(i.createdAt) >= since && i.kind === 'session')
    for (const i of items) assert.equal(i.status, 'consumed', JSON.stringify(i))
  })

  it('WAK-05 Send to Fishball wakes Fishball at the cap, and that turn reads the parked inputs', T, async () => {
    const w = await wakeups()
    await setLimit({ wakeupsPerHour: Math.max(1, w) })
    const texts = [tok('wak05a'), tok('wak05b')]
    for (const text of texts) assert.equal((await messageFishball(host, sender, { message: text })).json?.ok, true)
    await sleep(QUIET_MS)
    assert.equal((await requestsWith(host, fb, texts[0])).length, 0, 'precondition: parked')
    const last = tok('wak05answer')
    await turn(host, sender, [[{ text: last }]])
    const res = await host.post(API.send, { sessionId: sender, note: '' })
    assert.equal(res.status, 200, res.text)
    assert.ok(await untilSeen(host, fb, last, 8000), 'the forward woke Fishball at once')
    const readers = (await requestsWith(host, fb, last)).filter((q) => texts.every((t) => q.texts.includes(t)))
    assert.ok(readers.length > 0, 'the same turn read the parked inputs')
    assert.ok(await until(async () => (await intakeNow(host)).queued === 0, 5000, 100))
    await setLimit({ wakeupsPerHour: 0 })
  })
})

describe('P5 durability across restarts', () => {
  let host
  let home
  let fb
  let sender
  const reboot = async () => {
    await host.stop()
    host = await bootHost(home)
    const st = await host.waitStatus([STATUS.live, STATUS.archived, STATUS.recovery, STATUS.failed], MS.boot)
    // Ordinary sessions are not resumed at boot; open the sender again as the GUI would.
    await host.call('resume', { sessionId: sender })
    return st
  }
  const texts = {}

  before(async () => {
    home = newHome('durable')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    sender = (await host.call('ordinary', { preset: PRESET.bare, folder: 'dur-sender' })).sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('DUR-01 an input accepted while Fishball runs, right before a restart, arrives exactly once', LONG, async () => {
    texts.d1 = tok('dur01')
    await holdFishball(host, fb)
    assert.equal((await messageFishball(host, sender, { message: texts.d1 })).json?.ok, true)
    const st = await reboot()
    assert.equal(st?.status, STATUS.live, JSON.stringify(st))
    const seen = await untilSeen(host, fb, texts.d1, 20000)
    const item = (await intakeNow(host)).items.find((i) => i.sourceIdentity === 'session/' + sender)
    assert.ok(seen, 'Fishball read it after the restart; intake item: ' + JSON.stringify(item))
    await sleep(1500)
    assert.equal((await fishballMessages(host, fb, texts.d1)).length, 1, 'exactly once')
    assert.equal((await intakeNow(host)).items.find((i) => i.intakeId === item.intakeId)?.status, 'consumed')
  })

  it('DUR-02 an input pending while Fishball is archived survives a restart and arrives once when live', LONG, async (t) => {
    // Independent of DUR-01's outcome: start from a live, idle Fishball.
    if ((await host.state()).status !== STATUS.live) assert.equal((await reboot())?.status, STATUS.live)
    await settledIdle(host, fb)
    assert.equal((await host.call('archive', { sessionId: fb, stopActivity: true })).ok, true)
    await host.waitStatus(STATUS.archived)
    texts.d2 = tok('dur02')
    const since = Date.now() - 1000
    const { json } = await messageFishball(host, sender, { message: texts.d2 })
    assert.equal(json?.ok, true)
    t.diagnostic('note while archived: ' + json?.note)
    assert.ok(String(json?.note).startsWith(NOTE_TEXT.queuedPrefix), 'a Queued for Fishball note while Fishball is not running: ' + json?.note)
    const pending = await itemOf(host, 'session/' + sender, since)
    assert.equal(pending.length, 1)
    assert.equal(pending[0].status, 'pending')
    const st = await reboot()
    assert.equal(st?.status, STATUS.archived)
    const still = (await intakeNow(host)).items.find((i) => i.intakeId === pending[0].intakeId)
    assert.equal(still?.status, 'pending', 'still pending after the restart')
    await host.call('unarchive', { sessionId: fb })
    assert.equal((await host.post(API.recovery, { action: 'retry' })).status, 200)
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    assert.ok(await untilSeen(host, fb, texts.d2, 20000), 'delivered once live again')
    await sleep(1500)
    assert.equal((await fishballMessages(host, fb, texts.d2)).length, 1)
    assert.ok(await until(async () => (await intakeNow(host)).items.find((i) => i.intakeId === pending[0].intakeId)?.status === 'consumed', 5000, 100))
  })

  it('DUR-03 the intake store holds per-record files without the text of read messages', T, () => {
    const dir = INTAKE_DIR(home)
    assert.ok(fs.statSync(dir).isDirectory(), dir)
    const files = []
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p) } }
    walk(dir)
    assert.ok(files.length >= 2, 'one file per record: ' + files.length)
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8')
      for (const t of Object.values(texts)) assert.equal(body.includes(t), false, path.relative(home, f) + ' holds message text')
    }
  })

  it('DUR-04 a restart re-delivers nothing that was already read', LONG, async () => {
    const before = {}
    for (const [k, t] of Object.entries(texts)) before[k] = (await fishballMessages(host, fb, t)).length
    const st = await reboot()
    if (st?.status === STATUS.archived) { await host.call('unarchive', { sessionId: fb }); await host.post(API.recovery, { action: 'retry' }) }
    assert.equal((await host.waitStatus(STATUS.live))?.status, STATUS.live)
    await sleep(2000)
    await settledIdle(host, fb)
    for (const [k, t] of Object.entries(texts)) assert.ok((await fishballMessages(host, fb, t)).length <= Math.max(1, before[k]), t + ' delivered again')
  })
})

describe('P5 items of an adopted-away session', () => {
  let host
  let home
  let fb
  let sender
  before(async () => {
    home = newHome('adopt-intake')
    const booted = await bootLive(home)
    host = booted.host
    fb = booted.state?.sessionId
    sender = (await host.call('ordinary', { preset: PRESET.bare, folder: 'adopt-sender' })).sessionId
    await settledIdle(host, fb)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('ADO-01 an item left in the old session\'s inbox becomes discarded after adopt', LONG, async (t) => {
    const text = tok('ado01')
    await holdFishball(host, fb)
    assert.equal((await messageFishball(host, sender, { message: text })).json?.ok, true)
    const item = (await intakeNow(host)).items.find((i) => i.sourceIdentity === 'session/' + sender)
    assert.ok(item, 'precondition: item recorded')
    t.diagnostic('status while Fishball is held in its turn: ' + item.status)
    await host.stop()
    moveArtifacts(home, fb, 'away')
    host = await bootHost(home)
    const st = await host.waitStatus([STATUS.recovery, STATUS.live, STATUS.failed])
    assert.equal(st?.status, STATUS.recovery, JSON.stringify(st))
    t.diagnostic('status in recovery right before adopt: ' + (await intakeNow(host)).items.find((i) => i.intakeId === item.intakeId)?.status)
    const res = await host.post(API.recovery, { action: 'adopt' })
    assert.equal(res.status, 200, res.text)
    const live = await host.waitStatus(STATUS.live)
    assert.notEqual(live.sessionId, fb)
    const discarded = await until(async () => (await intakeNow(host)).items.find((i) => i.intakeId === item.intakeId)?.status === 'discarded', 10000, 100)
    await settledIdle(host, live.sessionId)
    const inNew = (await fishballMessages(host, live.sessionId, text)).length
    const now = (await intakeNow(host)).items.find((i) => i.intakeId === item.intakeId)
    assert.ok(discarded, 'expected discarded; got ' + now?.status + ', and the new session received it ' + inNew + ' time(s)')
    assert.equal(inNew, 0, 'the new session never receives it')
  })
})
