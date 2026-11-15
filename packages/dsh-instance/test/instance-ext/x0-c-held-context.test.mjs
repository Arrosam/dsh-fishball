/**
 * Independent X10 regression oracle: extension-points §1 X10 / §12.5 U18 and
 * docs/verification/v2-x0c-fakehost.md SDK contracts, never product implementation.
 * BVA: zero/one/two held items. EP/DT: new vs accepted duplicate, quiet vs wake.
 * ST: held -> next-step -> admitted -> restart; flushed pending -> crash replay.
 * Real SDK SessionStore, model-free fixture admission: not a real model/AgentLoop E2E.
 */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { bootChild, messageText } from '../../../../test/support/instance-ext.mjs'

const C = Object.freeze({
  none: 0, one: 1, counts: Object.freeze([0, 1, 2]),
  // Any plugin id: manager.notify takes the caller's id as given (X10).
  plugin: 'fbtest-plugin', file: 'notify-keys.jsonl',
  key: 'held-context-key-', text: 'quiet context 😀 ', changed: 'duplicate must not replace original',
  promptId: 'held-context-user-', prompt: 'ordinary manager input',
  role: 'user', block: 'text', source: Object.freeze({ kind: 'user' }),
  noticeSource: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: 'fbtest-plugin' }),
  status: Object.freeze({ held: 'held', duplicate: 'duplicate', queued: 'queued' }),
  event: Object.freeze({ start: 'turn/start', user: 'user/message', splice: 'agent/inbox/spliced' }),
  target: 'next-step',
  running: 'running', idle: 'idle', chat: '/api/chat', post: 'POST',
})
const events = (h) => h.manager().session.snapshotEvents()
const notices = (h) => events(h).filter(({ type, data }) => type === C.event.user && data.source?.pluginId === C.plugin).map(({ data }) => data)
const starts = (h) => events(h).filter(({ type }) => type === C.event.start)
const notify = async (h, index, overrides = {}) => {
  const result = await h.requireInstance().manager.notify({ pluginId: C.plugin, dedupeKey: C.key + index, text: C.text + index, wake: false, ...overrides })
  return result.status ?? result
}
async function turn(h, index = C.none) {
  h.manager().followup({ id: C.promptId + index, role: C.role, content: [{ type: C.block, text: C.prompt }], source: C.source })
  await h.driveTurn()
}

/** Observe, but always delegate to the real fixture/SDK port. No permissive queue substitute. */
function observeInject(h, t) {
  const agent = h.manager()
  const session = agent.session
  const append = session.append
  const inject = agent.inject
  const attempts = []
  let publishingStart = false
  session.append = function (type, ...args) {
    const previous = publishingStart
    if (type === C.event.start) publishingStart = true
    try { return append.call(this, type, ...args) } finally { publishingStart = previous }
  }
  agent.inject = function (message) {
    attempts.push({ message: structuredClone(message), publishingStart })
    return inject.call(this, message)
  }
  t.after(() => { session.append = append; agent.inject = inject })
  return attempts
}

for (const count of C.counts) {
  it(`XC-HELD-BVA-${count} quiet notices join the next manager turn through non-reentrant next-step context exactly once`, async (t) => {
    const h = await bootChild(t, { activate: true })
    const attempts = observeInject(h, t)
    for (let index = C.none; index < count; index++) {
      assert.equal(await notify(h, index), C.status.held)
      assert.equal(await notify(h, index, { text: C.changed }), C.status.duplicate)
    }
    assert.equal(starts(h).length, C.none, 'holding and duplicate retries never wake the manager')
    assert.equal(h.manager().followups.length, C.none)
    await turn(h)
    assert.equal(attempts.length, count, 'each held notice uses the supported inject boundary once')
    assert.ok(attempts.every(({ publishingStart }) => !publishingStart), 'inject must not reenter synchronous turn/start publication')
    const admitted = notices(h)
    assert.equal(admitted.length, count, 'held context reaches actual Session admission, not just a followup argument')
    assert.deepEqual(admitted.map(messageText).sort(), Array.from({ length: count }, (_, index) => C.text + index).sort())
    assert.equal(new Set(admitted.map(({ id }) => id)).size, count)
    for (const message of admitted) {
      assert.deepEqual(message.source, C.noticeSource)
      assert.ok(events(h).some(({ type, data }) => type === C.event.splice && data.target === C.target && data.inserted.some(({ id }) => id === message.id)))
    }
    assert.equal(starts(h).length, C.one, 'quiet context never owns an extra turn')
    for (let index = C.none; index < count; index++) assert.equal(await notify(h, index), C.status.duplicate)
    await turn(h, C.one)
    assert.deepEqual(notices(h), admitted, 'another ordinary turn cannot replay admitted quiet context')
  })
}

it('XC-HELD-ST-RESTART accepted quiet hold survives rebuild, admits once, and remains duplicate after another rebuild', async (t) => {
  const first = await bootChild(t, { activate: true })
  assert.equal(await notify(first, C.none), C.status.held)
  const persisted = await readFile(path.join(first.home, C.file), 'utf8')
  assert.ok(persisted.includes(JSON.stringify(C.key + C.none)))
  await first.close()
  const second = await bootChild(t, { home: first.home, activate: true, sessionLogs: first.sessionLogs })
  assert.equal(starts(second).length, C.none, 'recovery of a quiet hold cannot wake')
  assert.equal(await notify(second, C.none), C.status.duplicate)
  await turn(second)
  const admitted = notices(second)
  assert.equal(admitted.length, C.one)
  assert.equal(messageText(admitted[C.none]), C.text + C.none)
  assert.ok(persisted.includes(JSON.stringify(admitted[C.none].id)), 'admission keeps the identity reserved before rebuild')
  await second.close()
  const third = await bootChild(t, { home: first.home, activate: true, sessionLogs: first.sessionLogs })
  assert.equal(await notify(third, C.none), C.status.duplicate)
  await turn(third, C.one)
  assert.deepEqual(notices(third), admitted, 'accepted identity is not replayed after rebuild')
})

it('XC-HELD-ST-CRASH flushed quiet next-step survives crash checkpoint without a second identity or wake', async (t) => {
  const first = await bootChild(t, { activate: true })
  assert.equal(await notify(first, C.none), C.status.held)
  await first.ctx.sessions.flush(first.manager().session)
  // Preserve the crash image before orderly disposal cancels SDK pending inputs.
  const checkpoint = structuredClone(first.sessionLogs)
  const persisted = await readFile(path.join(first.home, C.file), 'utf8')
  await first.close()
  const restarted = await bootChild(t, { home: first.home, activate: true, sessionLogs: checkpoint })
  assert.equal(starts(restarted).length, C.none)
  assert.equal(await notify(restarted, C.none), C.status.duplicate)
  await turn(restarted)
  const admitted = notices(restarted)
  assert.equal(admitted.length, C.one)
  assert.equal(messageText(admitted[C.none]), C.text + C.none)
  assert.ok(persisted.includes(JSON.stringify(admitted[C.none].id)))
  assert.equal(starts(restarted).length, C.one)
})

it('XC-HELD-ST-BUSY-CHAT quiet hold cannot enter a running turn when owned chat queues next-turn input', async (t) => {
  const h = await bootChild(t, { activate: true })
  const manager = h.manager()
  const attempts = observeInject(h, t)
  await manager.whenIdle()
  // Established busy seam tests admission eligibility, not live provider execution.
  manager.status = C.running
  assert.equal(await notify(h, C.none), C.status.held)
  const response = await h.http(C.chat, { method: C.post, body: { text: C.prompt } })
  assert.equal(response.ok, true, 'owned chat must accept ordinary input while manager is busy')
  assert.equal(manager.inbox.nextTurn.length, C.one, 'ordinary input is queued for a later turn')
  assert.equal(attempts.length, C.none, 'quiet hold must not inject into the currently running turn')
  assert.equal(manager.inbox.nextStep.length, C.none, 'no held context becomes claimable by the running turn')
  assert.equal(notices(h).length, C.none)
  assert.equal(starts(h).length, C.none, 'synthetic busy seam never starts a real fixture turn')
  assert.equal(await notify(h, C.none), C.status.duplicate)
  // A later ordinary wake drains the queued input after the simulated busy period.
  manager.status = C.idle
  await turn(h)
  assert.equal(attempts.length, C.one)
  assert.equal(notices(h).length, C.one)
  assert.equal(messageText(notices(h)[C.none]), C.text + C.none)
})

it('XC-HELD-DT-WAKE quiet hold plus waking notice admits both in one turn; duplicate wake cannot create another', async (t) => {
  const h = await bootChild(t, { activate: true })
  assert.equal(await notify(h, C.none), C.status.held)
  assert.equal(await notify(h, C.one, { wake: true }), C.status.queued)
  await h.driveTurn()
  assert.deepEqual(notices(h).map(messageText).sort(), C.counts.slice(C.none, -C.one).map((index) => C.text + index).sort())
  assert.equal(starts(h).length, C.one)
  assert.equal(await notify(h, C.one, { wake: true }), C.status.duplicate)
  await h.driveTurn()
  assert.equal(starts(h).length, C.one)
})
