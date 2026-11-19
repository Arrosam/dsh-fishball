/**
 * R-FIX-CORE-2 black-box rows for core's reminder store (`<profile home>/fishball/reminders.json`,
 * limit 4,194,304 bytes of the whole file's UTF-8). In-process DSH (inproc.mjs). Requirements:
 * - a create is refused `schedule-store-full` when its resulting file would be above 90% of the
 *   limit (3,774,873.6 bytes: 3,774,873 is accepted, 3,774,874 refused); nothing is written, and
 *   the previous tasks stay, also after a restart;
 * - an update is refused for space only when it grows the store and its result is above 90%; an
 *   update whose result is no larger than the current store is accepted at any size up to the limit;
 * - the space above 90% is kept for delivery's bookkeeping (pending occurrence, settling a one-shot
 *   or a recurring reminder), so a due reminder fires in a store that creates filled to 90%;
 * - `schedule_delete` is never refused for space;
 * - a delivery that still cannot be recorded (a store truly at 100%) is not dropped: the occurrence
 *   stays due and is retried. The failure is also logged, but no log name or text is specified, so
 *   that line is not identified here.
 *
 * Exact sizes: the rows size the store through the tools only. Two reminders of one fixed shape
 * (same title length, same `after_seconds`, an ASCII prompt) measure what one more such reminder
 * adds to the file; its prompt length then sets the resulting file size to the byte. An update of
 * a prompt changes the file by exactly the prompt's change (ids and timestamps are fixed-width).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { setTimeout as sleep } from 'node:timers/promises'
import { INPROC, eventually, openInproc, recurringClock } from './inproc.mjs'
import { CREATE_BOUND_BYTES, RFIX, T, busyOn, codeOf, listOf, listedTitles, name, oneShot, storeText, userTurn } from './rfix.mjs'

const MAX = INPROC.store.maxBytes
const percentOf = (percent) => Math.floor(MAX * percent / RFIX.percent)

/** Words and sizes of these rows. */
const RFIX2 = Object.freeze({
  /** The fixed shape of a sizing reminder: one title (and a same-length rename), one delay. */
  fillTitle: 'fbtest-rfix2-fill',
  fillRenamed: 'fbtest-rfix2-fixl',
  fillAfterSeconds: 3600,
  fillChar: 'x',
  growChar: 'y',
  seedPromptBytes: 1,
  /** A due one-shot comes due after the store was filled (filling takes well under this). */
  dueSeconds: 10,
  dueTitle: (row) => 'fbtest-rfix2-due-' + row,
  /** The growth rows start here, below every target. */
  updateStartPercent: 88,
  /** BVA around the bound: below it (89%), on it, one byte above it, and 91%. */
  belowPercent: 89,
  abovePercent: 91,
  oneByte: 1,
  oneTask: 1,
  noChange: 0,
  msPerSecond: 1000,
  /** What may follow the compact JSON in the store file (a final newline). */
  trailer: /^\s*$/,
  markerOf: (title) => 'FBTEST-RFIX2-REMINDER-' + title,
  /** Every minute (its first occurrence is at most 60 s away); filling must end before it. */
  cron: Object.freeze({ expression: '* * * * *', time_zone: 'UTC' }),
  cronFireMs: 90_000,
  cronTimeout: Object.freeze({ timeout: 180_000 }),
  /** A store "truly at 100%": one byte under the limit, so it loads but no pending record fits. */
  fullSlackBytes: 1,
  /** How long before the restart the missed one-shot was due. */
  missedAgoMs: 60_000,
  /** Wait for a retry after the store was shrunk (the transient path's backoff or idle edge). */
  retryMs: 60_000,
  pending: '"pending"',
})

const fileBytes = (w) => fs.statSync(w.storeFile()).size
const accepted = (r, what) => assert.equal(codeOf(r), undefined, `${what} was refused: ${r.text.slice(0, 200)}`)
const refusedFull = (r, what) => assert.equal(codeOf(r), RFIX.storeFull, `${what} was not refused ${RFIX.storeFull}: ${r.text.slice(0, 200)}`)

/** A reminder of the fixed sizing shape with an ASCII prompt of `promptBytes`; returns `{id, prompt, r}`. */
async function createFill(w, promptBytes, title = RFIX2.fillTitle) {
  const prompt = RFIX2.fillChar.repeat(promptBytes)
  const r = await w.tool(RFIX.tool.create, { title, prompt, after_seconds: RFIX2.fillAfterSeconds })
  return { id: r.json?.id, prompt, r }
}

/**
 * Measures what one more sizing reminder adds to the file (two seeds), then offers a create and a
 * prompt update whose resulting file is exactly `target` bytes.
 */
async function sizer(w) {
  accepted((await createFill(w, RFIX2.seedPromptBytes)).r, 'harness: the first seed')
  const afterFirst = fileBytes(w)
  accepted((await createFill(w, RFIX2.seedPromptBytes)).r, 'harness: the second seed')
  const perSeed = fileBytes(w) - afterFirst
  return {
    /** A create whose resulting file would be exactly `target` bytes. */
    createTo(target) {
      const promptBytes = RFIX2.seedPromptBytes + target - fileBytes(w) - perSeed
      assert.ok(promptBytes >= RFIX2.seedPromptBytes, `harness: the store is already too large for a create to ${target}`)
      return createFill(w, promptBytes)
    },
    /** An update of `fill`'s prompt whose resulting file would be exactly `target` bytes. */
    updateTo(fill, target) {
      const delta = target - fileBytes(w)
      const prompt = delta >= 0 ? fill.prompt + RFIX2.growChar.repeat(delta) : fill.prompt.slice(0, delta)
      return w.tool(RFIX.tool.update, { id: fill.id, prompt })
    },
  }
}

/** The tasks listed, in a restarted world on the same root (state across a restart). */
async function listedAfterRestart(t, sdk, w) {
  await w.close()
  const again = await openInproc(t, sdk, { root: w.root, reminders: true })
  return listOf(await again.tool(RFIX.tool.list, {}))
}

/** A refusal wrote nothing: the file's bytes are the same as before. */
const assertUnchanged = (w, before) => assert.ok(fs.readFileSync(w.storeFile()).equals(before), 'the refused change wrote the store')

export function registerRfix2ManagerCases(sdk) {
  registerCreate(sdk)
  registerUpdate(sdk)
  registerDelivery(sdk)
  registerAboveBound(sdk)
  registerFull(sdk)
}

// ================================================================== create: the 90% bound
function registerCreate(sdk) {
  const ROWS = [
    ['89%', percentOf(RFIX2.belowPercent), true],
    ['90% boundary', CREATE_BOUND_BYTES, true],
    ['boundary + 1 byte', CREATE_BOUND_BYTES + RFIX2.oneByte, false],
    ['91%', percentOf(RFIX2.abovePercent), false],
  ]
  for (const [label, target, ok] of ROWS) {
    test(name(sdk, 'RFIX2-CREATE-BVA-01', label, `a create whose resulting store is ${target} bytes → ${ok ? 'accepted, the file is exactly that size' : `refused ${RFIX.storeFull}, nothing written, the tasks stay after a restart`}`), T, async (t) => {
      const w = await openInproc(t, sdk, { reminders: true })
      const size = await sizer(w)
      const tasksBefore = listOf(await w.tool(RFIX.tool.list, {})).length
      const bytesBefore = fs.readFileSync(w.storeFile())
      const { r } = await size.createTo(target)
      if (ok) {
        accepted(r, `a create to ${target} bytes`)
        assert.equal(fileBytes(w), target, 'harness: the sized create did not land on its target')
        assert.equal((await listedAfterRestart(t, sdk, w)).length, tasksBefore + RFIX2.oneTask, 'tasks after a restart')
        return
      }
      refusedFull(r, `a create to ${target} bytes`)
      assertUnchanged(w, bytesBefore)
      assert.equal(listOf(await w.tool(RFIX.tool.list, {})).length, tasksBefore, 'tasks listed after the refusal')
      assert.equal((await listedAfterRestart(t, sdk, w)).length, tasksBefore, 'tasks listed after a restart')
    })
  }
}

// ================================================================== update: growth past 90%
function registerUpdate(sdk) {
  const ROWS = [
    ['89%', percentOf(RFIX2.belowPercent), true],
    ['90% boundary', CREATE_BOUND_BYTES, true],
    ['boundary + 1 byte', CREATE_BOUND_BYTES + RFIX2.oneByte, false],
    ['91%', percentOf(RFIX2.abovePercent), false],
  ]
  for (const [label, target, ok] of ROWS) {
    test(name(sdk, 'RFIX2-UPDATE-BVA-01', label, `an update growing a prompt from ${RFIX2.updateStartPercent}% to a ${target}-byte store → ${ok ? 'accepted, the file is exactly that size' : `refused ${RFIX.storeFull}, the old prompt stays, also after a restart`}`), T, async (t) => {
      const w = await openInproc(t, sdk, { reminders: true })
      const size = await sizer(w)
      const fill = await size.createTo(percentOf(RFIX2.updateStartPercent))
      accepted(fill.r, 'harness: the create to the start size')
      const bytesBefore = fs.readFileSync(w.storeFile())
      const r = await size.updateTo(fill, target)
      const promptOf = (list) => list.find((e) => e.id === fill.id)?.prompt
      if (ok) {
        accepted(r, `an update to ${target} bytes`)
        assert.equal(fileBytes(w), target, 'harness: the sized update did not land on its target')
        return
      }
      refusedFull(r, `an update to ${target} bytes`)
      assertUnchanged(w, bytesBefore)
      assert.equal(promptOf(listOf(await w.tool(RFIX.tool.list, {}))), fill.prompt, 'the prompt after the refusal')
      assert.equal(promptOf(await listedAfterRestart(t, sdk, w)), fill.prompt, 'the prompt after a restart')
    })
  }
}

// ================================================================== delivery in a store filled to 90%
function registerDelivery(sdk) {
  /** Fills the store with creates to exactly the 90% boundary; the due reminder exists already. */
  async function fillToBound(w) {
    const fill = await (await sizer(w)).createTo(CREATE_BOUND_BYTES)
    accepted(fill.r, 'harness: the create to the 90% boundary')
    assert.equal(fileBytes(w), CREATE_BOUND_BYTES, 'harness: the store is not exactly at the 90% boundary')
    return fill
  }
  test(name(sdk, 'RFIX2-DELIVER-ST-01', 'one-shot', `a one-shot comes due in a store creates filled to exactly ${CREATE_BOUND_BYTES} bytes → handed to the manager once, then removed`), T, async (t) => {
    const w = await openInproc(t, sdk, { reminders: true })
    const title = RFIX2.dueTitle('oneshot')
    const marker = await oneShot(w, title, RFIX2.dueSeconds)
    await fillToBound(w)
    assert.equal((await w.admissions(marker)).length, 0, 'harness: the reminder came due before the store was filled')
    assert.ok(await eventually(async () => (await w.admissions(marker)).length === 1), 'the due reminder was not delivered in a store at 90%')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await w.admissions(marker)).length, 1, 'admissions')
    assert.ok(await eventually(async () => !(await listedTitles(w)).includes(title)), 'the delivered one-shot was not removed')
    assert.equal(storeText(w).includes(marker), false, 'the delivered one-shot is still in the store file')
  })
  test(name(sdk, 'RFIX2-DELIVER-ST-01', 'recurring', `a recurring reminder (cron every minute) comes due in a store creates filled to exactly ${CREATE_BOUND_BYTES} bytes → delivered, lastDelivery recorded, moved on (the store passes 90%)`), RFIX2.cronTimeout, async (t) => {
    const w = await openInproc(t, sdk, { reminders: true })
    const clock = await recurringClock(t, w)
    const title = RFIX2.dueTitle('cron')
    const marker = RFIX2.markerOf(title)
    accepted(await w.tool(RFIX.tool.create, { title, prompt: marker, cron: RFIX2.cron }), 'harness: the cron create')
    const before = listOf(await w.tool(RFIX.tool.list, {})).find((e) => e.title === title)
    await fillToBound(w)
    assert.equal((await w.admissions(marker)).length, 0, 'harness: the occurrence came due before the store was filled')
    clock.makeDue()
    assert.ok(await clock.eventually(async () => (await w.admissions(marker)).length === 1, RFIX2.cronFireMs), 'the recurring reminder was not delivered in a store at 90%')
    const settled = async () => listOf(await w.tool(RFIX.tool.list, {})).find((e) => e.title === title)
    assert.ok(await clock.eventually(async () => (await settled())?.lastDelivery !== undefined), 'no lastDelivery recorded in a store at 90%')
    const after = await settled()
    assert.ok(Date.parse(after.scheduledAt) > Date.parse(before.scheduledAt), `the next occurrence is not later: ${before.scheduledAt} → ${after.scheduledAt}`)
    assert.ok(fileBytes(w) > CREATE_BOUND_BYTES, `the settled store is not above ${CREATE_BOUND_BYTES} bytes (the bookkeeping used no space above 90%)`)
  })
}

// ================================================================== a store above 90% through bookkeeping
function registerAboveBound(sdk) {
  /**
   * A store above 90%: creates fill it to exactly the boundary, then a one-shot comes due while the
   * manager is busy, so its pending occurrence is recorded on top. The busy turn is held until released.
   */
  async function aboveBound(t, row) {
    const busy = busyOn(INPROC.busyText)
    const w = await openInproc(t, sdk, { reminders: true, onRequest: busy.onRequest })
    w.defer(() => busy.release())
    const agent = await w.activate()
    userTurn(w, agent, INPROC.busyText)
    await busy.reached
    const dueTitle = RFIX2.dueTitle(row)
    const marker = await oneShot(w, dueTitle, RFIX2.dueSeconds)
    const size = await sizer(w)
    const fill = await size.createTo(CREATE_BOUND_BYTES)
    accepted(fill.r, 'harness: the create to the 90% boundary')
    assert.equal(fileBytes(w), CREATE_BOUND_BYTES, 'harness: the store is not exactly at the 90% boundary')
    assert.equal(storeText(w).includes(RFIX2.pending), false, 'harness: the occurrence came due before the store was filled')
    assert.ok(await eventually(() => storeText(w).includes(RFIX2.pending)), 'the due occurrence was not recorded pending in a store at 90%')
    assert.ok(fileBytes(w) > CREATE_BOUND_BYTES, 'harness: the pending record did not take the store above 90%')
    return { w, busy, size, fill, dueTitle, marker }
  }
  const promptOf = async (w, id) => listOf(await w.tool(RFIX.tool.list, {})).find((e) => e.id === id)
  const ROWS = [
    ['same-length rename', RFIX2.noChange, true, (s) => s.w.tool(RFIX.tool.update, { id: s.fill.id, title: RFIX2.fillRenamed })],
    ['shrink by one byte', -RFIX2.oneByte, true, (s) => s.size.updateTo(s.fill, fileBytes(s.w) - RFIX2.oneByte)],
    ['grow by one byte', RFIX2.oneByte, false, (s) => s.size.updateTo(s.fill, fileBytes(s.w) + RFIX2.oneByte)],
  ]
  assert.equal(RFIX2.fillRenamed.length, RFIX2.fillTitle.length, 'harness: the rename is not the same length')
  for (const [label, delta, ok, run] of ROWS) {
    test(name(sdk, 'RFIX2-ABOVE-DT-01', label, `in a store above 90% (bookkeeping), an update that changes the store by ${delta} bytes → ${ok ? 'accepted' : `refused ${RFIX.storeFull}, nothing written`}`), T, async (t) => {
      const s = await aboveBound(t, label.replace(/\W/g, ''))
      const bytesBefore = fs.readFileSync(s.w.storeFile())
      const r = await run(s)
      if (ok) {
        accepted(r, `the ${label} update`)
        assert.equal(fileBytes(s.w), bytesBefore.length + delta, `the store size after the ${label} update`)
        const listed = await promptOf(s.w, s.fill.id)
        assert.ok(listed?.title === RFIX2.fillRenamed || listed?.prompt !== s.fill.prompt, 'the accepted update is not listed')
        return
      }
      refusedFull(r, `the ${label} update`)
      assertUnchanged(s.w, bytesBefore)
      assert.equal((await promptOf(s.w, s.fill.id))?.prompt, s.fill.prompt, 'the prompt after the refusal')
    })
  }
  test(name(sdk, 'RFIX2-ABOVE-DT-01', 'create', `in a store above 90% (bookkeeping), a create → refused ${RFIX.storeFull}, nothing written`), T, async (t) => {
    const s = await aboveBound(t, 'create')
    const bytesBefore = fs.readFileSync(s.w.storeFile())
    refusedFull((await createFill(s.w, RFIX2.seedPromptBytes)).r, 'a create above 90%')
    assertUnchanged(s.w, bytesBefore)
  })
  test(name(sdk, 'RFIX2-ABOVE-DT-01', 'delete', `in a store above 90% (bookkeeping), ${RFIX.tool.delete} → accepted, the reminder gone, the store smaller`), T, async (t) => {
    const s = await aboveBound(t, 'delete')
    const bytesBefore = fileBytes(s.w)
    accepted(await s.w.tool(RFIX.tool.delete, { id: s.fill.id }), 'a delete above 90%')
    assert.equal(await promptOf(s.w, s.fill.id), undefined, 'the deleted reminder is still listed')
    assert.ok(fileBytes(s.w) < bytesBefore, 'the store did not shrink')
  })
  test(name(sdk, 'RFIX2-ABOVE-ST-01', 'pending → delivered', 'the occurrence pending in a store above 90% is delivered once when the busy turn ends, then removed'), T, async (t) => {
    const s = await aboveBound(t, 'release')
    s.busy.release()
    assert.ok(await eventually(async () => (await s.w.admissions(s.marker)).length === 1), 'the pending occurrence was not delivered')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await s.w.admissions(s.marker)).length, 1, 'admissions')
    assert.ok(await eventually(async () => !(await listedTitles(s.w)).includes(s.dueTitle)), 'the delivered one-shot was not removed')
  })
}

// ================================================================== a store truly at 100%
function registerFull(sdk) {
  test(name(sdk, 'RFIX2-FULL-ST-01', 'missed one-shot at 100%', `a one-shot missed while down in a store ${RFIX2.fullSlackBytes} byte under the limit → not dropped: still listed until delivered; after a delete (accepted at 100%) it is delivered once and removed`), T, async (t) => {
    const first = await openInproc(t, sdk, { reminders: true })
    const title = RFIX2.dueTitle('full')
    const marker = RFIX2.markerOf(title)
    accepted(await first.tool(RFIX.tool.create, { title, prompt: marker, after_seconds: RFIX2.fillAfterSeconds }), 'harness: the due create')
    const fill = await createFill(first, RFIX2.seedPromptBytes)
    accepted(fill.r, 'harness: the fill create')
    await first.close()
    // The stored file, edited as DSH being down past the one-shot's time: its times move into the
    // past (same widths), and the fill prompt pads the file to one byte under the limit.
    const file = first.storeFile()
    const text = fs.readFileSync(file, 'utf8')
    const store = JSON.parse(text)
    const trailer = text.slice(JSON.stringify(store).length)
    assert.match(trailer, RFIX2.trailer, 'harness: the store file is not compact JSON')
    const due = store.tasks.find((e) => e.record.title === title)
    const padded = store.tasks.find((e) => e.record.id === fill.id)
    const scheduled = Date.now() - RFIX2.missedAgoMs
    const created = new Date(scheduled - RFIX2.fillAfterSeconds * RFIX2.msPerSecond).toISOString()
    Object.assign(due, { createdAt: created, updatedAt: created })
    due.record.scheduledAt = new Date(scheduled).toISOString()
    const target = MAX - RFIX2.fullSlackBytes
    padded.record.prompt += RFIX2.fillChar.repeat(target - Buffer.byteLength(JSON.stringify(store) + trailer))
    const body = JSON.stringify(store) + trailer
    assert.equal(Buffer.byteLength(body), target, 'harness: the padded store is not one byte under the limit')
    fs.writeFileSync(file, body)
    const w = await openInproc(t, sdk, { root: first.root, reminders: true })
    await w.activate()
    await sleep(INPROC.wait.quietMs * 4)
    if ((await w.admissions(marker)).length === 0) {
      assert.ok((await listedTitles(w)).includes(title), 'the occurrence that could not be recorded was dropped')
      accepted(await w.tool(RFIX.tool.delete, { id: fill.id }), 'a delete in a store at 100%')
      await w.nextModel()
    }
    assert.ok(await eventually(async () => (await w.admissions(marker)).length >= 1, RFIX2.retryMs), 'the occurrence was not retried after the store had space')
    await sleep(INPROC.wait.quietMs * 2)
    assert.equal((await w.admissions(marker)).length, 1, 'admissions')
    assert.ok(await eventually(async () => !(await listedTitles(w)).includes(title)), 'the delivered one-shot was not removed')
  })
}
