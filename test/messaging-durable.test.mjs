/**
 * Intake durability on the H-STUB harness: the connector's intake ledger is the durable queue
 * (contract §4.5, §9; slim §5.2 "Delivery rules"; DESIGN §5b, §9). With no instance attached the
 * automated inputs are queued and delivered once each, in global arrival order, on the next attach;
 * an unacked item is pushed again unchanged after a reconnect or a restart; an error reply keeps the
 * item and nothing is retried on that connection; `maxQueuedInputs` counts every open item and
 * refuses only automated kinds. Cases of docs/test-design/connector.md C1 keep their ids.
 *
 * | id     | technique | requirement | expected |
 * |--------|-----------|-------------|----------|
 * | C1-EP-01 | EP (message_fishball, no instance) | contract §9 | the result reports success (queued), never unavailable; delivered once as kind session on attach |
 * | C1-P-03 | P (three turns, no instance) | contract §9 | three ok results; exactly m1, m2, m3 in order, once each; once acked, a detach and a new attach re-deliver nothing |
 * | C1-P-06 | P (note, message, finished notice; no instance) | contract §9 (conn-OQ-33, -34) | items arrive in arrival order, once each: the note (kind user, n1 outside the untrusted block), m1 (kind session), the finished notice (kind watch) |
 * | C1-EP-03 | EP (notify_when_finished, no instance) | contract §9 | the finished notice is queued and delivered once (kind watch), after m1 |
 * | C1-ST-01 | ST N→A→N→A | contract §1.3, §9 | the first ready delivers m1; m2 at once; m3 after the second ready; each once and acked |
 * | C1-ST-02 | ST A→N (onClose) | contract §1.3 | after fireClose m1 is queued (no send on the closed transport) and delivered once after the new ready |
 * | C1-ST-07 | ST detach mid-delivery (ackPolicy 2) | contract §3.3, §4.5 | the second ready delivers exactly m3, m4, m5 in order, each with its first push's dedupeKey; m1, m2 not again |
 * | C1-ST-10 | ST an error reply | contract §4.5, §3.3 | m1 pushed once and refused, not pushed again on that connection; m2 acked; after a new ready m1 again with the same dedupeKey, m2 not |
 * | DUR-02 | ST (queued → sender archived → attach) | contract §9 "delivered once each" | an item queued before its managed sender was archived is still delivered once on the next attach |
 * | C1-ST-09 | ST N across a DSH restart | contract §9; DESIGN §5b | m1 and m2 queued before the restart are delivered once each, in order |
 * | DUR-01 | ST (pushed, unacked → restart) | contract §3.3, §4.5; slim §5.2 | the item is pushed again after the restart, unchanged (same payload, same dedupeKey); once acked it is consumed |
 * | DUR-03 | EP | DESIGN §9; slim §5.2 "Ack consumes" | $DSH_HOME/storages/fishball_intake holds per-record files, and no file holds the text of a consumed message |
 * | DUR-04 | ST (restart) | contract §4.5 | a restart re-delivers nothing that was already acked |
 * | C1-BVA-04 | BVA (min − 1) | DESIGN §16; C2 | maxQueuedInputs 0 is refused and the old value stays |
 * | C1-BVA-03 | BVA (min: 1) | contract §8, §9 | m1 accepted; m2 queue-full |
 * | C1-BVA-05 | BVA (back below max, limit 3) | contract §9 (conn-OQ-32) | three open, the fourth queue-full; after one ack the next is accepted (2 + 1 = 3) and the one after refused |
 * | C1-BVA-06 | BVA (kinds at the bound, limit 2) | contract §9 (conn-OQ-03) | with two messages open, Hand over with a note answers 200, the session is managed and the note queued past the bound; a watched session's finished notice is refused (nothing more is queued) |
 * | C1-BVA-01 | BVA (max − 1 → max, default 200) | contract §8, §9 | the 200th is accepted |
 * | C1-BVA-02 | BVA (max + 1) | contract §9 (conn-OQ-02) | the 201st is refused queue-full; on attach exactly 200 arrive, in order, the 201st never |
 *
 * Retired:
 * - WAK-01..WAK-05: the wake-up cap `wakeupsPerHour` went with the in-process agent (slim §5.2 "Wake-up belongs to the child", conn-OQ-20); the connector no longer counts or parks wake-ups.
 * - ADO-01: adopt and the recovery route belonged to the removed in-process session's lifecycle (slim §12); the instance owns its own session.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'
import { INTAKE_DIR, LIMITS, NOTE_PREFIX, P5_CODE } from './support/constants.mjs'
import { HOOK, turn, untrustedBlock } from './support/expect.mjs'
import { KIND, OPERATION, bootStub, managedSession, messageFishball, quietPushes, restartStub, stopStub, userSession } from './support/instance-stub.mjs'
import {
  MSGF, drainedDetached, forward, intakeNow, managedDrained, messageOf, pushedItems, pushesSettled, sendTexts, sessionMessages, setLimit, tok, untilQueued,
} from './support/instance-stub-messaging.mjs'
import { sleep, until } from './support/util.mjs'

const T = MSGF.long
/** C1-ST-10: how long the case waits to show that nothing is retried on the same connection. */
const NO_RETRY_MS = 5000
/** The default ack policy (ack every push). */
const ACK_ALL = null

/** One message_fishball call per turn; asserts each is accepted. */
async function sendEach(host, sessionId, texts) {
  for (const message of texts) assert.equal((await messageFishball(host, sessionId, { message })).json?.ok, true, message)
}
/** The session items of one sender as {message, dedupeKey}, on one attachment. */
const sessionItems = async (stub, sessionId, index) => (await pushedItems(stub, index)).filter((p) => p.kind === KIND.session && p.sourceSessionId === sessionId)
/** Wait until n session items of the sender were pushed on the attachment, then until it is quiet. */
async function messagesSettled(stub, sessionId, n, index) {
  await until(async () => (await sessionItems(stub, sessionId, index)).length >= n, MSGF.waitMs, MSGF.pollMs)
  await quietPushes(stub, index)
  return sessionItems(stub, sessionId, index)
}
/** Attach with the default handshake; asserts it was accepted; returns the attachment index. */
async function attach(stub) {
  const a = await stub.attach()
  assert.equal(a.ok, true, 'attach: ' + JSON.stringify(a))
  return a.index
}

describe('no-instance queueing and reconnects', () => {
  let booted
  let host
  let stub
  let sender

  before(async () => {
    booted = await bootStub('dur-queue')
    ;({ host, stub } = booted)
    sender = await managedDrained(booted, 'dur-sender')
    await stub.detach()
  }, HOOK)
  // Every case starts with no instance attached and an empty queue, whatever the previous case left.
  afterEach(() => drainedDetached(booted), HOOK)
  after(() => stopStub(booted), HOOK)

  it('C1-EP-01 message_fishball with no instance is queued, never unavailable, and delivered once on attach', T, async () => {
    const m1 = tok('ep01')
    const { json } = await messageFishball(host, sender, { message: m1 })
    assert.equal(json?.ok, true, JSON.stringify(json))
    assert.notEqual(json?.code, P5_CODE.unavailable)
    await attach(stub)
    await pushesSettled(stub, 1)
    assert.deepEqual(await sessionMessages(stub, sender), [m1])
  })

  it('C1-P-03 three queued messages arrive once each, in order; acked ones are not re-delivered', T, async () => {
    const texts = [tok('p03a'), tok('p03b'), tok('p03c')]
    await sendEach(host, sender, texts)
    await attach(stub)
    await pushesSettled(stub, texts.length)
    assert.deepEqual(await sessionMessages(stub, sender), texts)
    assert.ok(await untilQueued(host, 0), 'all acked')
    await stub.detach()
    await attach(stub)
    await quietPushes(stub)
    assert.deepEqual(await sessionMessages(stub, sender), [], 'nothing re-delivered')
  })

  describe('a hand-over note, a message and its finished notice, queued with no instance', () => {
    let order
    let note
    let m1
    let s1
    before(async () => {
      s1 = await userSession(host, 'dur-p06')
      note = tok('p06note')
      m1 = tok('p06m1')
      const res = await forward(host, s1, note)
      assert.equal(res.status, 200, 'precondition: hand over with a note: ' + res.text)
      const { json } = await messageFishball(host, s1, { message: m1, notify_when_finished: true })
      assert.equal(json?.ok, true, 'precondition: ' + JSON.stringify(json))
      // The finished notice is queued once the turn ends; wait for its intake item before attaching.
      await until(async () => (await intakeNow(host)).queued >= 3, MSGF.watchWaitMs, MSGF.pollMs)
      await attach(stub)
      await pushesSettled(stub, 3, undefined, MSGF.watchWaitMs)
      order = (await pushedItems(stub)).filter((p) => p.sourceSessionId === s1)
    }, HOOK)

    it('C1-P-06 they arrive in arrival order, once each: the note (user), m1 (session), the finished notice (watch)', T, () => {
      assert.deepEqual(order.map((p) => p.kind), [KIND.user, KIND.session, KIND.watch], JSON.stringify(order.map((p) => [p.kind, p.text.slice(0, 60)])))
      const block = untrustedBlock(order[0].text)
      assert.ok(block.header.includes(NOTE_PREFIX + JSON.stringify(note)), 'n1 outside the untrusted block')
      assert.equal(messageOf(order[1]), m1)
    })
    it('C1-EP-03 the finished notice is delivered once, as kind watch, after m1', T, () => {
      const watch = order.filter((p) => p.kind === KIND.watch)
      assert.equal(watch.length, 1)
      assert.ok(order.indexOf(watch[0]) > order.findIndex((p) => messageOf(p) === m1))
    })
  })

  it('C1-ST-01 N→A→N→A: queued, at once, queued again, each once and acked', T, async () => {
    const [m1, m2, m3] = [tok('st01a'), tok('st01b'), tok('st01c')]
    await sendEach(host, sender, [m1])
    const first = await attach(stub)
    await pushesSettled(stub, 1)
    assert.deepEqual(await sessionMessages(stub, sender), [m1], 'the first ready delivers m1')
    await sendEach(host, sender, [m2])
    await pushesSettled(stub, 2)
    assert.deepEqual(await sessionMessages(stub, sender), [m1, m2], 'm2 at once')
    assert.ok(await untilQueued(host, 0), 'acked')
    await stub.detach()
    await sendEach(host, sender, [m3])
    assert.ok(await untilQueued(host, 1), 'm3 queued')
    await attach(stub)
    await pushesSettled(stub, 1)
    assert.deepEqual(await sessionMessages(stub, sender), [m3], 'm3 after the second ready')
    assert.deepEqual(await sessionMessages(stub, sender, first), [m1, m2], 'the first connection got nothing more')
    assert.ok(await untilQueued(host, 0), 'acked')
  })

  it('C1-ST-02 after onClose the next message is queued, then delivered once after the new ready', T, async () => {
    const closed = await attach(stub)
    await quietPushes(stub)
    await stub.fireClose(closed)
    const sendsBefore = (await stub.transportCalls(closed)).calls.filter((c) => c === 'send').length
    const m1 = tok('st02')
    await sendEach(host, sender, [m1])
    assert.ok(await untilQueued(host, 1), 'm1 is queued')
    assert.equal((await stub.transportCalls(closed)).calls.filter((c) => c === 'send').length, sendsBefore, 'no send on the closed transport')
    await attach(stub)
    await pushesSettled(stub, 1)
    assert.deepEqual(await sessionMessages(stub, sender), [m1])
  })

  it('C1-ST-07 a detach mid-delivery: the next ready delivers exactly the unacked items, with their first dedupeKeys', T, async (t) => {
    const texts = Array.from({ length: 5 }, (_, i) => tok('st07n' + i))
    await sendEach(host, sender, texts)
    await stub.ackPolicy(2)
    const first = await attach(stub)
    // The test design waits for five pushes; the contract does not say whether the connector pushes
    // the next item before the previous one is acked, so the case waits for the pushes to settle.
    const firstItems = await messagesSettled(stub, sender, 3, first)
    t.diagnostic('pushed on the first connection before the detach: ' + firstItems.length)
    assert.deepEqual(firstItems.map(messageOf), texts.slice(0, firstItems.length), 'pushed in order')
    assert.ok(await untilQueued(host, texts.length - 2), 'two acked')
    await stub.detach()
    await stub.ackPolicy(ACK_ALL)
    await attach(stub)
    const again = await messagesSettled(stub, sender, 3)
    assert.deepEqual(again.map(messageOf), texts.slice(2), 'exactly m3, m4, m5, in order')
    const firstKey = new Map(firstItems.map((p) => [messageOf(p), p.dedupeKey]))
    for (const p of again) if (firstKey.has(messageOf(p))) assert.equal(p.dedupeKey, firstKey.get(messageOf(p)), 'the first push\'s dedupeKey')
  })

  it('C1-ST-10 an error reply keeps the item, nothing is retried on that connection, and the next ready pushes it again', T, async () => {
    const first = await attach(stub)
    await quietPushes(stub)
    await stub.errorPolicy('operation-failed')
    const [m1, m2] = [tok('st10a'), tok('st10b')]
    await sendEach(host, sender, [m1, m2])
    await sleep(NO_RETRY_MS)
    const onFirst = await sessionItems(stub, sender, first)
    assert.deepEqual(onFirst.map(messageOf), [m1, m2], 'm1 pushed once (refused), m2 once')
    assert.ok(await untilQueued(host, 1), 'm1 stays queued, m2 was acked')
    await stub.detach()
    await attach(stub)
    await pushesSettled(stub, 1)
    const again = await sessionItems(stub, sender)
    assert.deepEqual(again.map(messageOf), [m1], 'm1 again, m2 not')
    assert.equal(again[0].dedupeKey, onFirst[0].dedupeKey, 'the same dedupeKey')
  })

  it('DUR-02 an item queued before its sender was archived is still delivered once on the next attach', T, async () => {
    const archived = await managedSession(host, 'dur-archived')
    const m1 = tok('dur02')
    await sendEach(host, archived, [m1])
    const r = await host.call('archive', { sessionId: archived, stopActivity: true })
    assert.equal(r.ok, true, 'precondition: archived: ' + JSON.stringify(r))
    await attach(stub)
    await pushesSettled(stub, 2)
    assert.deepEqual(await sessionMessages(stub, archived), [m1])
  })
})

describe('durability across DSH restarts', () => {
  let booted
  let sender
  const consumed = []
  const restart = async (opts) => {
    booted = await restartStub(booted, opts)
    // Ordinary sessions are not resumed at boot; open the sender again as the GUI would.
    await booted.host.call('resume', { sessionId: sender })
  }

  before(async () => {
    booted = await bootStub('dur-restart')
    sender = await managedDrained(booted, 'dur-restart-sender')
    await booted.stub.detach()
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('C1-ST-09 items queued with no instance survive a restart and arrive once each, in order', T, async () => {
    const texts = [tok('st09a'), tok('st09b')]
    await sendEach(booted.host, sender, texts)
    await restart()
    await pushesSettled(booted.stub, texts.length)
    assert.deepEqual(await sessionMessages(booted.stub, sender), texts)
    assert.ok(await untilQueued(booted.host, 0))
    consumed.push(...texts)
  })

  it('DUR-01 an item pushed but not acked before a restart is pushed again unchanged, then consumed once acked', T, async () => {
    const m1 = tok('dur01')
    await booted.stub.ackPolicy(0)
    await sendEach(booted.host, sender, [m1])
    const [firstPush] = (await messagesSettled(booted.stub, sender, consumed.length + 1)).filter((p) => messageOf(p) === m1)
    assert.ok(firstPush, 'precondition: pushed and unacked')
    await restart()
    const again = await messagesSettled(booted.stub, sender, 1)
    assert.equal(again.length, 1, 'pushed again once')
    assert.equal(again[0].dedupeKey, firstPush.dedupeKey, 'the same dedupeKey')
    assert.deepEqual(again[0], firstPush, 'unchanged')
    assert.ok(await untilQueued(booted.host, 0), 'consumed once acked')
    consumed.push(m1)
  })

  it('DUR-03 the intake store holds per-record files without the text of consumed messages', T, () => {
    const dir = INTAKE_DIR(booted.home)
    assert.ok(fs.statSync(dir).isDirectory(), dir)
    const files = []
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p) } }
    walk(dir)
    assert.ok(files.length >= consumed.length, 'one file per record: ' + files.length)
    for (const f of files) {
      const body = fs.readFileSync(f, 'utf8')
      for (const t of consumed) assert.equal(body.includes(t), false, path.relative(booted.home, f) + ' holds message text')
    }
  })

  it('DUR-04 a restart re-delivers nothing that was already acked', T, async () => {
    await restart()
    await quietPushes(booted.stub)
    assert.deepEqual(await sessionMessages(booted.stub, sender), [])
  })
})

describe('the queue bound maxQueuedInputs', () => {
  let booted
  let host
  let stub
  let sender
  let watched
  const bound = async (n) => setLimit(host, { maxQueuedInputs: n })
  const resetBound = async () => { await bound(LIMITS.maxQueuedInputs.default); await drainedDetached(booted) }

  before(async () => {
    booted = await bootStub('dur-bound')
    ;({ host, stub } = booted)
    sender = await managedDrained(booted, 'bound-sender')
    watched = await managedDrained(booted, 'bound-watched')
    const w = await stub.op(OPERATION.sessionWatch, { sessionId: watched, mode: 'once' }, watched)
    assert.equal(typeof w.payload?.watchId, 'string', 'precondition: a watch on the watched session: ' + JSON.stringify(w))
    await stub.detach()
  }, HOOK)
  after(() => stopStub(booted), HOOK)

  it('C1-BVA-04 maxQueuedInputs 0 is refused and the old value stays', T, async () => {
    const r = await host.call('settingsUpdate', { patch: { maxQueuedInputs: LIMITS.maxQueuedInputs.min - 1 } })
    assert.equal(r.ok, false)
    assert.equal((await host.state()).limits.maxQueuedInputs, LIMITS.maxQueuedInputs.default)
  })

  it('C1-BVA-03 at the minimum 1: m1 is accepted, m2 queue-full', T, async () => {
    await bound(LIMITS.maxQueuedInputs.min)
    try {
      const answers = await sendTexts(host, sender, [tok('b03a'), tok('b03b')])
      assert.equal(answers[0]?.ok, true)
      assert.deepEqual(answers[1], { ok: false, code: P5_CODE.queueFull })
    } finally { await resetBound() }
  })

  it('C1-BVA-05 after one ack the queue takes one more, and refuses the next', T, async () => {
    const LIMIT = 3
    await bound(LIMIT)
    try {
      const answers = await sendTexts(host, sender, Array.from({ length: LIMIT + 1 }, (_, i) => tok('b05n' + i)))
      assert.ok(answers.slice(0, LIMIT).every((a) => a?.ok === true), JSON.stringify(answers))
      assert.deepEqual(answers[LIMIT], { ok: false, code: P5_CODE.queueFull })
      await stub.ackPolicy(1)
      await attach(stub)
      assert.ok(await untilQueued(host, LIMIT - 1), 'one acked: ' + JSON.stringify(await intakeNow(host)))
      const [next, refused] = await sendTexts(host, sender, [tok('b05x'), tok('b05y')])
      assert.equal(next?.ok, true, 'accepted (2 + 1 = 3): ' + JSON.stringify(next))
      assert.deepEqual(refused, { ok: false, code: P5_CODE.queueFull })
    } finally { await resetBound() }
  })

  it('C1-BVA-06 at the bound a note is still accepted and a finished notice is refused', T, async (t) => {
    const LIMIT = 2
    await bound(LIMIT)
    try {
      const answers = await sendTexts(host, sender, [tok('b06a'), tok('b06b')])
      assert.ok(answers.every((a) => a?.ok === true), JSON.stringify(answers))
      const s2 = await userSession(host, 'bound-s2')
      const res = await forward(host, s2, tok('b06note'))
      assert.equal(res.status, 200, 'Hand over never fails for a full queue: ' + res.text)
      assert.ok((await host.state()).managed.some((m) => m.sessionId === s2), 'S2 is managed')
      assert.ok(await untilQueued(host, LIMIT + 1), 'the note is queued past the bound')
      await turn(host, watched, [[{ text: 'finished' }]])
      await sleep(MSGF.waitMs / 2)
      assert.equal((await intakeNow(host)).queued, LIMIT + 1, 'the finished notice was refused: ' + JSON.stringify(await intakeNow(host)))
      await bound(LIMITS.maxQueuedInputs.default)
      await attach(stub)
      await quietPushes(stub)
      t.diagnostic('watch items after the bound was lifted: ' + (await pushedItems(stub)).filter((p) => p.kind === KIND.watch).length)
    } finally { await resetBound() }
  })

  it('C1-BVA-01/02 the 200th input is accepted, the 201st is queue-full, and exactly 200 arrive in order', T, async () => {
    const MAX = LIMITS.maxQueuedInputs.default
    const texts = Array.from({ length: MAX + 1 }, (_, i) => tok('b01n' + i))
    const answers = await sendTexts(host, sender, texts)
    assert.ok(answers.slice(0, MAX - 1).every((a) => a?.ok === true), 'the first 199 accepted')
    assert.equal(answers[MAX - 1]?.ok, true, 'C1-BVA-01: the 200th accepted')
    assert.deepEqual(answers[MAX], { ok: false, code: P5_CODE.queueFull }, 'C1-BVA-02: the 201st refused')
    await attach(stub)
    await pushesSettled(stub, MAX, undefined, MSGF.watchWaitMs)
    assert.deepEqual(await sessionMessages(stub, sender), texts.slice(0, MAX), 'exactly 200, in order, the 201st never')
  })
})
