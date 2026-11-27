/** Auto-update acceptance and board contracts exercised on the real taskboard row and DSH storage. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { BOARD_KEYS, CODE, FIXTURE, LIMIT, NOTIFY, POST_MEMO_KEYS, POST_TASK_KEYS, READ_KEYS, REVISION, ROUTE, STATUS, TOOL, WAIT } from './constants.mjs'
import { MODELS, autoWorld, observation, otherTarget } from './auto-world.mjs'
import { worldFor } from './world.mjs'

const AUTO = Object.freeze({
  audit: '/api/fishball-taskboard/auto',
  settings: '/api/fishball-taskboard/auto/settings',
  undo: '/api/fishball-taskboard/auto/undo',
})
const options = { timeout: WAIT.testMs }
const pick = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]))
const keys = (value) => Object.keys(value).sort()
const board = (w) => fetchOk(w, ROUTE.get, ROUTE.board)
const audit = (w) => fetchOk(w, ROUTE.get, AUTO.audit)
const draft = ({ revision, tasks, memos }) => ({ baseRevision: revision, tasks: tasks.map((row) => pick(row, POST_TASK_KEYS)), memos: memos.map((row) => pick(row, POST_MEMO_KEYS)) })

async function fetchOk(w, method, path, input) {
  const { status, body } = await w.fetch(method, path, input)
  assert.equal(status, ROUTE.status.ok, JSON.stringify(body))
  return body
}

async function add(w, tasks) {
  const result = await w.call(TOOL.add, { tasks })
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.created
}

function row(label, run) {
  test('TB-AUTO ' + label, options, run)
}

row('is off by default; owner settings and audit leave the legacy board projection intact', async (t) => {
  const w = await worldFor(t)
  await add(w, [{ title: FIXTURE.goal, subtasks: [{ title: FIXTURE.hotel }] }])
  assert.equal((await w.call(TOOL.memo, { text: FIXTURE.passport })).ok, true)
  const before = await board(w)
  const settings = await audit(w)
  assert.equal(settings.model, null)
  assert.equal(settings.revision, before.revision)
  assert.deepEqual(settings.batches, [])
  assert.deepEqual(settings.reviews, [])
  assert.equal((await fetchOk(w, ROUTE.post, AUTO.settings, { model: null })).ok, true)
  assert.deepEqual(await board(w), before)
  assert.deepEqual(keys(await w.read()), READ_KEYS)
  assert.deepEqual(keys(before), BOARD_KEYS)
  const input = draft(before)
  input.memos[0].text = FIXTURE.visa
  assert.deepEqual(await fetchOk(w, ROUTE.post, ROUTE.board, input), {
    ok: true, changed: true, notified: true, revision: before.revision + REVISION.step,
  })
  assert.equal(w.notices.length, 1)
  assert.match(w.notices[0].dedupeKey, /^fishball-taskboard:user-edit:/)
  await w.restart()
  assert.equal((await audit(w)).model, null)
  assert.deepEqual((await board(w)).tasks, before.tasks)
  assert.equal((await board(w)).memos[0].text, FIXTURE.visa)
})

row('owner settings reject a malformed route and preserve both settings and board', async (t) => {
  const w = await worldFor(t)
  const before = await board(w)
  const refusal = await w.fetch(ROUTE.post, AUTO.settings, { model: { model: FIXTURE.hotel } })
  assert.equal(refusal.status, ROUTE.status.badRequest)
  assert.equal(refusal.body.ok, false)
  assert.equal((await audit(w)).model, null)
  assert.deepEqual(await board(w), before)
  assert.deepEqual(w.notices, [])
})

row('review resolution independently guards against calls made by a worker or without an agent', async (t) => {
  const w = await worldFor(t)
  const session = w.otherSession()
  const input = { reviewId: FIXTURE.taskId(), expectedReviewVersion: REVISION.step, baseRevision: REVISION.initial, decision: 'reject' }
  for (const as of [{ id: session.id, session }, undefined]) {
    assert.deepEqual(await w.callAs(as, TOOL.resolveReview, input), { ok: false, code: CODE.notManager })
  }
  assert.equal((await w.read()).revision, REVISION.initial)
})
const VALUE = Object.freeze({ parent: 45, child: 70, pending: 90, autoMax: 99, autoRows: 20, attempts: 6, hourMs: 3_600_000 })
const REVIEW = Object.freeze({ pending: 'pending', reject: 'reject' })
const PROJECTION = ['id', 'note', 'parentId', 'progress', 'status', 'title']
const SOURCE_KEYS = ['targetId', 'endpointEpoch', 'eventId', 'sessionId', 'assignmentId', 'turnId', 'sequence']
const task = (b, id) => b.tasks.find((item) => item.id === id)
const one = (items) => { assert.equal(items.length, 1); return items[0] }
const select = (w, model) => fetchOk(w, ROUTE.post, AUTO.settings, { model })
const progressFact = (taskId, progress) => ({ taskId, progress, evidence: taskId + ' is at ' + progress + '% progress.' })
const doneFact = (taskId, fields) => ({ taskId, status: STATUS.done, evidence: taskId + ' is complete.', ...fields })
const noteFact = (taskId) => ({ taskId, evidence: taskId + ': Checksum verified.', noteAppend: 'Checksum verified.' })
const resolveInput = (review, baseRevision, decision = REVIEW.reject) => ({ reviewId: review.reviewId, expectedReviewVersion: review.reviewVersion, baseRevision, decision })
const undoInput = ({ batchId, batchVersion, revision }) => ({ batchId, expectedBatchVersion: batchVersion, baseRevision: revision })
const setProposals = (w, proposals) => w.setInference(() => ({ proposals }))
async function propose(w, proposals, { text = proposals.map((p) => p.evidence).join('\n'), ...eventOptions } = {}) {
  setProposals(w, proposals)
  const event = observation(text, eventOptions)
  await w.turn(event)
  return event
}
async function enabled(t, tasks = [{ title: FIXTURE.goal }]) {
  const w = await autoWorld(t)
  const created = tasks.length ? await add(w, tasks) : []
  assert.equal((await select(w, MODELS.first)).ok, true)
  return { w, created }
}
async function quiet(w, before, { calls, reviews = 0, batches = 0 } = {}) {
  assert.deepEqual(await board(w), before)
  assert.deepEqual(w.notices, [])
  if (calls !== undefined) assert.equal(w.calls.length, calls)
  const history = await audit(w)
  assert.equal(history.reviews.length, reviews)
  assert.equal(history.batches.filter((batch) => batch.changes.length > 0).length, batches)
}

/** Start a model response and release it only after the competing operation has committed. */
async function inFlight(w, proposal) {
  const started = Promise.withResolvers()
  const result = Promise.withResolvers()
  w.setInference(() => { started.resolve(); return result.promise })
  const event = observation(proposal.evidence)
  const done = w.turn(event)
  try {
    await Promise.race([started.promise, Promise.resolve(done).then(() => assert.fail('eligible turn returned without a model attempt'))])
  } catch (error) {
    result.resolve({ proposals: [] })
    throw error
  }
  return { event, done, finish: () => result.resolve({ proposals: [proposal] }) }
}

row('mixed batch commits once, uses post-commit direct-parent values, preserves unrelated rows, and stales an older owner draft', async (t) => {
  const { w, created: [root, parent, child, pending, untouched] } = await enabled(t, [
    { title: FIXTURE.goal, progress: FIXTURE.progressMid, subtasks: [{ title: FIXTURE.flights, subtasks: [{ title: FIXTURE.hotel, progress: FIXTURE.progressMid }] }] },
    { title: FIXTURE.oldIdea, progress: VALUE.pending, status: STATUS.inProgress, note: FIXTURE.note },
    { title: FIXTURE.renamed, status: STATUS.dropped },
  ])
  assert.equal((await w.call(TOOL.memo, { text: FIXTURE.passport })).ok, true)
  const before = await board(w)
  w.advance(REVISION.step)
  const proposals = [progressFact(child.id, VALUE.child), progressFact(parent.id, VALUE.parent), doneFact(pending.id), progressFact(root.id, VALUE.parent)]
  const text = proposals.map((p) => p.evidence).concat('Private unrelated final-text marker.').join('\n')
  const event = await propose(w, proposals, { text })
  const after = await board(w)
  assert.equal(after.revision, before.revision + REVISION.step)
  assert.deepEqual(after.memos, before.memos)
  assert.deepEqual(after.tasks.map(({ id }) => id), before.tasks.map(({ id }) => id))
  assert.deepEqual(task(after, pending.id), task(before, pending.id))
  assert.deepEqual(task(after, untouched.id), task(before, untouched.id))
  for (const proposal of proposals.filter((p) => 'progress' in p)) {
    const old = task(before, proposal.taskId)
    const current = task(after, old.id)
    assert.ok(current.updatedAt > old.updatedAt)
    assert.deepEqual(current, { ...old, progress: proposal.progress, updatedAt: current.updatedAt })
  }
  assert.equal(w.calls.length, 1)
  const call = w.calls[0]
  assert.deepEqual(call.model, MODELS.first)
  assert.equal(call.text, text)
  assert.deepEqual(call.tasks, before.tasks.map((item) => pick(item, PROJECTION)))
  const history = await audit(w)
  const batch = one(history.batches)
  const review = one(history.reviews)
  assert.equal(batch.revision, after.revision)
  assert.equal(batch.baseRevision, before.revision)
  assert.deepEqual(batch.model, MODELS.first)
  assert.deepEqual(pick(batch.source, SOURCE_KEYS), {
    ...event.source, eventId: event.eventId, sessionId: event.payload.sessionId,
    assignmentId: event.payload.assignment.id, turnId: event.payload.turnFinal.turnId, sequence: event.payload.turnFinal.sequence,
  })
  assert.deepEqual(batch.reviewIds, [review.reviewId])
  assert.equal(review.taskId, pending.id)
  assert.equal(review.status, REVIEW.pending)
  assert.equal(one((await w.read()).autoReviews).reviewId, review.reviewId)
  assert.equal(batch.changes.length, 3)
  const childChange = batch.changes.find(({ taskId }) => taskId === child.id)
  assert.deepEqual(childChange.parent, { taskId: parent.id, title: parent.title, progress: VALUE.parent, status: task(after, parent.id).status, path: [root.title, parent.title] })
  assert.deepEqual(childChange.fields, { progress: { before: FIXTURE.progressMid, after: VALUE.child } })
  assert.equal(batch.changes.find(({ taskId }) => taskId === root.id).parent, null)
  assert.ok(!JSON.stringify(history).includes('Private unrelated final-text marker.'))
  const notice = one(w.notices)
  assert.equal(notice.pluginId, 'fishball-taskboard')
  assert.equal(notice.wake, true)
  assert.doesNotMatch(notice.dedupeKey, /^fishball-taskboard:user-edit:/)
  for (const part of [event.payload.sessionId, child.title, parent.title, VALUE.child + '%', VALUE.parent + '%']) assert.ok(notice.text.includes(part), part)
  assert.match(notice.text, /no parent|top.level|无父/i)
  const stale = await w.fetch(ROUTE.post, ROUTE.board, draft(before))
  assert.equal(stale.status, ROUTE.status.conflict)
  assert.deepEqual(pick(stale.body, ['code', 'revision']), { code: CODE.stale, revision: after.revision })
  assert.deepEqual(await board(w), after)
  assert.equal(w.notices.length, 1)
})

row('review-only advice survives restart; manager confirms one field without implicitly completing the other', async (t) => {
  const { w, created: [target] } = await enabled(t, [{ title: FIXTURE.goal, status: STATUS.inProgress, progress: VALUE.pending, note: FIXTURE.note }])
  const before = await board(w)
  await propose(w, [doneFact(target.id, { progress: LIMIT.progress.max, evidence: target.id + ' is complete; progress is ' + LIMIT.progress.max + '%.' })])
  await quiet(w, before, { calls: 1, reviews: 1 })
  const review = one((await w.read()).autoReviews)
  assert.equal(review.taskId, target.id)
  assert.equal(review.status, REVIEW.pending)
  await w.restart()
  assert.deepEqual(one((await w.read()).autoReviews), review)
  assert.deepEqual(keys(await board(w)), BOARD_KEYS)
  const args = resolveInput(review, before.revision, { confirm: ['status'] })
  assert.equal((await w.call(TOOL.resolveReview, args)).ok, true)
  const after = await board(w)
  assert.equal(after.revision, before.revision + REVISION.step)
  assert.equal(task(after, target.id).status, STATUS.done)
  assert.equal(task(after, target.id).progress, VALUE.pending)
  assert.equal(task(after, target.id).note, FIXTURE.note)
  assert.deepEqual(keys(await w.read()), READ_KEYS)
  assert.equal((await w.call(TOOL.resolveReview, args)).ok, false)
  assert.deepEqual(await board(w), after)
  assert.deepEqual(w.notices, [])
  assert.equal(w.calls.length, 1)
})

row('atomic undo restores only changed fields, voids pending reviews, and cannot repeat after disabling', async (t) => {
  const { w, created: [target, pending] } = await enabled(t, [{ title: FIXTURE.goal, note: FIXTURE.note }, { title: FIXTURE.hotel, progress: VALUE.pending }])
  const before = await board(w)
  await propose(w, [noteFact(target.id), doneFact(pending.id)])
  const committed = await board(w)
  assert.equal(committed.revision, before.revision + REVISION.step)
  assert.equal(task(committed, target.id).note, FIXTURE.note + '\n' + noteFact(target.id).noteAppend)
  assert.equal(one((await audit(w)).batches).changes[0].progress, task(before, target.id).progress)
  await select(w, null)
  await w.restart()
  const batch = one((await audit(w)).batches)
  const input = undoInput(batch)
  w.advance(REVISION.step)
  assert.equal((await fetchOk(w, ROUTE.post, AUTO.undo, input)).ok, true)
  const after = await board(w)
  assert.equal(after.revision, committed.revision + REVISION.step)
  assert.deepEqual(after.tasks, before.tasks.map((item) => item.id === target.id ? { ...item, updatedAt: task(after, target.id).updatedAt } : item))
  assert.ok(task(after, target.id).updatedAt > task(committed, target.id).updatedAt)
  assert.equal(one((await audit(w)).batches).undoable, false)
  assert.deepEqual(keys(await w.read()), READ_KEYS)
  await w.fetch(ROUTE.post, AUTO.undo, input)
  assert.equal((await audit(w)).model, null)
  assert.deepEqual(await board(w), after)
  assert.equal(w.calls.length, 1)
  assert.equal(w.notices.length, 1)
})
row('eligibility excludes legacy, empty, truncated, stopped and non-work finals, but does not exclude a background job', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const before = await board(w)
  const proposal = progressFact(target.id, VALUE.child)
  setProposals(w, [proposal])
  const ignored = [
    { text: proposal.evidence, proven: false },
    { text: FIXTURE.blank },
    { text: proposal.evidence, truncated: true },
    { text: proposal.evidence, reason: 'max-tokens' },
    { text: proposal.evidence, reason: 'stopped' },
    { text: proposal.evidence, purpose: 'consultant' },
  ]
  for (const [i, { text, ...shape }] of ignored.entries()) await w.turn(observation(text, { ...shape, sequence: i + REVISION.step }))
  await quiet(w, before, { calls: 0 })
  const eligible = observation(proposal.evidence, { sequence: ignored.length + REVISION.step })
  eligible.payload.backgroundJobs = [{ id: FIXTURE.goal, state: 'running' }]
  await w.turn(eligible)
  assert.equal(w.calls.length, 1)
  assert.equal(task(await board(w), target.id).progress, VALUE.child)
})

row('model selection is provider-specific; a missing model stays selected and never falls back', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const before = await board(w)
  assert.equal((await select(w, MODELS.second)).ok, true)
  await w.restart()
  w.setModels(({ provider }) => provider === MODELS.first.provider)
  const proposal = progressFact(target.id, VALUE.child)
  await propose(w, [proposal])
  const unavailable = await audit(w)
  assert.deepEqual(unavailable.model, MODELS.second)
  assert.equal(unavailable.available, false)
  await quiet(w, before, { calls: 0 })
  await select(w, MODELS.first)
  await propose(w, [proposal], { sequence: REVISION.step + REVISION.step })
  assert.deepEqual(one(w.calls).model, MODELS.first)
})

for (const [label, competing] of [
  ['manual memo edit', (w) => w.call(TOOL.memo, { text: FIXTURE.visa })],
  ['settings A→B→A', async (w) => { await select(w, MODELS.second); await select(w, MODELS.first) }],
  ['settings off→on', async (w) => { await select(w, null); await select(w, MODELS.first) }],
  ['source reassignment', (w) => w.setCurrent(() => false)],
  ['newer same-session turn skipped while busy', (w, proposal) => w.turn(observation(proposal.evidence, { sequence: REVISION.step + REVISION.step }))],
]) row('invalidates a pending model result after ' + label, async (t) => {
  const { w, created: [target] } = await enabled(t)
  const proposal = progressFact(target.id, VALUE.child)
  const { event, done, finish } = await inFlight(w, proposal)
  let current
  try {
    await competing(w, proposal)
    current = await board(w)
  } finally { finish(); await done }
  await quiet(w, current, { calls: 1 })
  await w.turn(event)
  await quiet(w, current, { calls: 1 })
})

row('deduplicates concurrent and restarted receipt replay without conflating a different target or next turn', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const proposal = progressFact(target.id, VALUE.child)
  const before = await board(w)
  const { event, done, finish } = await inFlight(w, proposal)
  const duplicate = w.turn(structuredClone(event))
  finish()
  await Promise.all([done, duplicate])
  const first = await board(w)
  assert.equal(first.revision, before.revision + REVISION.step)
  await w.restart()
  await w.turn(event)
  assert.deepEqual(await board(w), first)
  assert.equal(w.calls.length, 1)
  assert.equal(w.notices.length, 1)
  const second = progressFact(target.id, FIXTURE.progressLate)
  setProposals(w, [second])
  const sameId = otherTarget(observation(second.evidence, { eventId: event.eventId }))
  await w.turn(sameId)
  assert.equal(task(await board(w), target.id).progress, FIXTURE.progressLate)
  const third = progressFact(target.id, VALUE.autoMax)
  await propose(w, [third], { sequence: REVISION.step + REVISION.step })
  assert.equal(task(await board(w), target.id).progress, VALUE.autoMax)
  assert.equal(w.calls.length, 3)
  assert.equal(w.notices.length, 3)
  assert.equal(new Set(w.notices.map(({ dedupeKey }) => dedupeKey)).size, 3)
})

for (const [label, count, allClosed, expected] of [
  ['empty', 0, false, 0],
  ['all closed', 1, true, 0],
  ['exactly 20 including closed descendants', VALUE.autoRows, false, 1],
  ['21 including closed descendants', VALUE.autoRows + REVISION.step, false, 0],
  ['at manual storage capacity', LIMIT.tasks, false, 0],
]) row('board admission budget: ' + label, async (t) => {
  const open = { title: FIXTURE.goal, status: allClosed ? STATUS.dropped : STATUS.todo }
  const subtasks = Array.from({ length: Math.max(0, count - REVISION.step) }, (_, i) => ({ title: FIXTURE.title(i), status: STATUS.done }))
  const { w, created } = await enabled(t, count === 0 ? [] : [{ ...open, ...(subtasks.length ? { subtasks } : {}) }])
  const before = await board(w)
  assert.equal(before.tasks.length, count)
  await propose(w, [], { text: 'No task progress was reported.' })
  await quiet(w, before, { calls: expected })
  if (expected) assert.equal(w.calls[0].tasks.length, count)
  if (created.length) assert.equal((await w.call(TOOL.update, { id: created[0].id, note: FIXTURE.note })).ok, true)
})

row('the seventh attempt is refused even when earlier calls fail; an expired window admits a new turn, not replay', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const before = await board(w)
  w.setInference(() => { throw new Error('fixture-provider-failed') })
  const failed = observation('The provider fails this attempt.')
  await w.turn(failed)
  await w.turn(failed)
  for (let sequence = 2; sequence <= VALUE.attempts; sequence++) await w.turn(observation(failed.payload.turnFinal.message.text, { sequence }))
  await quiet(w, before, { calls: VALUE.attempts })
  const proposal = progressFact(target.id, VALUE.child)
  const seventh = await propose(w, [proposal], { sequence: VALUE.attempts + REVISION.step })
  await quiet(w, before, { calls: VALUE.attempts })
  await w.restart()
  w.advance(VALUE.hourMs + REVISION.step)
  await w.turn(seventh)
  await quiet(w, before, { calls: VALUE.attempts })
  await propose(w, [proposal], { sequence: seventh.payload.turnFinal.sequence + REVISION.step })
  assert.equal(w.calls.length, VALUE.attempts + REVISION.step)
  assert.equal(task(await board(w), target.id).progress, VALUE.child)
})

for (const [label, invalid] of [
  ['unknown field', (p) => ({ ...p, title: FIXTURE.renamed })],
  ['unknown task ID', () => progressFact(FIXTURE.taskId(), VALUE.child)],
  ['memo ID', (_p, memoId) => progressFact(memoId, VALUE.child)],
  ['negative percent', (p) => progressFact(p.taskId, -REVISION.step)],
  ['fractional percent', (p) => progressFact(p.taskId, FIXTURE.fraction)],
  ['regression to zero', (p) => progressFact(p.taskId, LIMIT.progress.min)],
  ['future claim', (p) => ({ ...p, evidence: p.taskId + ' will reach ' + VALUE.child + '% progress tomorrow.' })],
  ['denied claim', (p) => ({ ...p, evidence: p.taskId + ' is not at ' + VALUE.child + '% progress.' })],
  ['ambiguous title', (p) => ({ ...p, evidence: FIXTURE.hotel + ' is at ' + VALUE.child + '% progress.' })],
  ['model evidence not in final text', (p) => ({ ...p, evidence: p.taskId + ' is at ' + FIXTURE.progressLate + '% progress.' })],
]) row('bad model batch is atomic: ' + label, async (t) => {
  const { w, created: [valid, ambiguous] } = await enabled(t, [
    { title: FIXTURE.goal }, { title: FIXTURE.hotel, progress: FIXTURE.progressMid }, { title: FIXTURE.hotel },
  ])
  assert.equal((await w.call(TOOL.memo, { text: FIXTURE.passport })).ok, true)
  const before = await board(w)
  const good = progressFact(valid.id, VALUE.child)
  const bad = invalid(progressFact(ambiguous.id, VALUE.child), one(before.memos).id)
  const text = [good.evidence, ...(label === 'model evidence not in final text' ? [] : [bad.evidence])].join('\n')
  await propose(w, [good, bad], { text })
  await quiet(w, before, { calls: 1 })
})

const CONTRADICTION = Object.freeze({ lower: 60, higher: 80 })
for (const [label, selected, conflicting] of [
  ['progress', (id) => progressFact(id, CONTRADICTION.lower), (id) => progressFact(id, CONTRADICTION.higher).evidence],
  ['status', (id) => ({ taskId: id, status: STATUS.inProgress, evidence: id + ' is in progress.' }), (id) => id + ' is blocked waiting for validation.'],
]) row('same-turn contradiction rejects the entire batch: ' + label, async (t) => {
  const { w, created: [target, other] } = await enabled(t, [{ title: FIXTURE.goal }, { title: FIXTURE.hotel }])
  const before = await board(w)
  const picked = selected(target.id)
  const independent = progressFact(other.id, VALUE.child)
  const text = [picked.evidence, conflicting(target.id), independent.evidence].join('\n')
  await propose(w, [picked, independent], { text })
  await quiet(w, before, { calls: 1 })
})

for (const over of [0, REVISION.step]) row('note append uses Unicode code points and newline at 2000 +' + over, async (t) => {
  const fragment = noteFact(FIXTURE.taskId()).noteAppend
  const old = FIXTURE.astral.repeat(LIMIT.note.max - [...fragment].length - '\n'.length + over)
  const { w, created: [target, other] } = await enabled(t, [{ title: FIXTURE.goal, note: old }, { title: FIXTURE.hotel }])
  const before = await board(w)
  const proposals = [noteFact(target.id), progressFact(other.id, VALUE.child)]
  const event = await propose(w, proposals)
  if (over) { await quiet(w, before, { calls: 1 }); return }
  const after = await board(w)
  assert.equal(after.revision, before.revision + REVISION.step)
  assert.equal([...task(after, target.id).note].length, LIMIT.note.max)
  assert.equal(task(after, target.id).note, old + '\n' + fragment)
  await w.turn(event)
  await propose(w, proposals, { sequence: REVISION.step + REVISION.step })
  assert.deepEqual(await board(w), after)
  assert.equal(w.calls.length, 2)
  assert.equal(w.notices.length, 1)
})

for (const edited of ['memo', 'review']) row('undo conflict after a subsequent ' + edited + ' edit', async (t) => {
  const { w, created: [target, pending] } = await enabled(t, [{ title: FIXTURE.goal }, { title: FIXTURE.hotel }])
  await propose(w, [progressFact(target.id, VALUE.child), doneFact(pending.id)])
  const { batches, reviews } = await audit(w)
  const batch = one(batches)
  const review = one(reviews)
  if (edited === 'memo') {
    assert.equal((await w.call(TOOL.memo, { text: FIXTURE.visa })).ok, true)
    const stale = await w.call(TOOL.resolveReview, resolveInput(review, batch.revision))
    assert.equal(stale.ok, false)
    assert.equal(one((await audit(w)).reviews).status, REVIEW.pending)
  } else {
    assert.equal((await w.call(TOOL.resolveReview, resolveInput(review, batch.revision))).ok, true)
    assert.equal((await board(w)).revision, batch.revision)
  }
  const current = await board(w)
  const result = await w.fetch(ROUTE.post, AUTO.undo, undoInput(batch))
  assert.equal(result.status, ROUTE.status.conflict)
  assert.equal(result.body.ok, false)
  assert.deepEqual(await board(w), current)
  assert.equal(w.notices.length, 1)
})

row('delivery failure preserves a committed reversible batch and never retries the notification', async (t) => {
  const { w, created: [target] } = await enabled(t)
  w.notifyMode = NOTIFY.reject
  const before = await board(w)
  const event = await propose(w, [progressFact(target.id, VALUE.child)])
  const after = await board(w)
  assert.equal(after.revision, before.revision + REVISION.step)
  const batch = one((await audit(w)).batches)
  assert.equal(batch.undoable, true)
  assert.ok(batch.notification)
  assert.equal(w.notices.length, 1)
  await w.restart()
  await w.turn(event)
  assert.equal(w.calls.length, 1)
  assert.equal(w.notices.length, 1)
  assert.deepEqual(await board(w), after)
  assert.equal((await fetchOk(w, ROUTE.post, AUTO.undo, undoInput(one((await audit(w)).batches)))).ok, true)
})
const LEGACY_DOMAIN = 'fishball_taskboard'
const LEGACY_VERSION = 1
const STAMP = Date.UTC(2025, 0, 1)

async function seedLegacy(ctx, value) {
  // Use the public SDK domain writer with a v1 shape, not the plugin's current encoder.
  const schema = { parse: (data) => data, safeParse: (data) => ({ success: data !== null, data }) }
  const legacy = await ctx.storage.domain.open({
    name: LEGACY_DOMAIN, version: LEGACY_VERSION, tables: {},
    global: { schema, initial: { revision: REVISION.initial, tasks: [], memos: [] } },
  })
  try { await legacy.global.set(value) } finally { await legacy.close() }
}

row('opens a populated v1 board without changing timestamps, order or revision; manual save persists after upgrade', async (t) => {
  const rootId = FIXTURE.taskId()
  const legacyTask = (id, title, parentId = null) => ({ id, title, parentId, note: FIXTURE.note, status: STATUS.inProgress, progress: FIXTURE.progressMid, createdAt: STAMP, updatedAt: STAMP })
  const legacy = {
    revision: 17,
    tasks: [legacyTask(rootId, FIXTURE.goal), legacyTask(FIXTURE.taskId(), FIXTURE.hotel, rootId)],
    memos: [{ id: FIXTURE.memoId(), text: FIXTURE.passport, createdAt: STAMP, updatedAt: STAMP }],
  }
  let seeded = false
  const w = await worldFor(t, { async configureHost(ctx) { if (!seeded) { await seedLegacy(ctx, legacy); seeded = true } } })
  assert.deepEqual(await board(w), { ...legacy, unfinished: legacy.tasks.length })
  assert.deepEqual((await audit(w)).batches, [])
  await w.restart()
  assert.deepEqual(await board(w), { ...legacy, unfinished: legacy.tasks.length })
  const edit = draft(await board(w))
  edit.memos[0].text = FIXTURE.visa
  assert.equal((await fetchOk(w, ROUTE.post, ROUTE.board, edit)).revision, legacy.revision + REVISION.step)
  await w.restart()
  const upgraded = await board(w)
  assert.deepEqual(upgraded.tasks, legacy.tasks)
  assert.equal(upgraded.memos[0].text, FIXTURE.visa)
  assert.deepEqual((await audit(w)).reviews, [])
})

row('refuses a corrupt legacy board instead of resetting it to empty', async (t) => {
  const w = await worldFor(t, { configureHost: (ctx) => seedLegacy(ctx, { revision: REVISION.initial, tasks: [null], memos: [] }) })
  assert.equal(w.active(), false)
  assert.deepEqual(w.toolNames(), [])
})

row('review-only metadata uses a named invalidation without changing the legacy SSE board frame', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const before = await board(w)
  const stream = await w.events(t)
  assert.deepEqual(await stream.next(), before)
  assert.equal((await stream.nextFrame())?.event, 'auto', 'initial audit capability')
  await propose(w, [doneFact(target.id)])
  const frame = await stream.nextFrame(WAIT.quietMs)
  assert.equal(frame?.event, 'auto')
  assert.equal(await stream.next(WAIT.quietMs), undefined)
  await quiet(w, before, { calls: 1, reviews: 1 })
  await stream.close()
})
const RUNTIME = Object.freeze({
  route: Object.freeze({ provider: 'deepseek-account', model: 'deepseek-flash' }),
  settingsNs: 'llm-deepseek-account',
  endpoint: 'https://api.deepseek.com/anthropic',
  contextWindow: 65_536,
  outputTokens: 1_024,
  cooldownMs: 60_000,
})

async function runtimeWorld(t, { contextWindow = RUNTIME.contextWindow, extension = false } = {}) {
  const calls = []
  let preparations = 0
  let observer
  let reply = () => []
  const w = await worldFor(t, {
    configureHost(ctx, instance) {
      instance.events = {
        observeTurnFinished(fn) { observer = fn; return () => { if (observer === fn) observer = undefined } },
        isCurrentWorkTurn: () => true,
      }
      ctx.provide('settings', {
        describe: () => [{ ns: RUNTIME.settingsNs, value: { baseURL: RUNTIME.endpoint }, revision: REVISION.initial }],
      })
      if (extension) ctx.provide('deepseekLlmApiExtensions', {})
      ctx.provide('llm', {
        listConfigurableProviders: () => [{ provider: RUNTIME.route.provider, settingsNs: RUNTIME.settingsNs, settingsPath: [] }],
        listModels: (provider) => provider !== undefined && provider !== RUNTIME.route.provider ? [] : [{ provider: RUNTIME.route.provider, id: RUNTIME.route.model, name: RUNTIME.route.model }],
        async prepareCall(config) {
          preparations += 1
          return {
            config,
            context: { contextWindow },
            async *stream(input) {
              calls.push({ config, input })
              yield* reply()
            },
          }
        },
      })
    },
  })
  return Object.assign(w, {
    calls,
    prepared: () => preparations,
    replyWith: (fn) => { reply = fn },
    turn: async (event) => { assert.equal(typeof observer, 'function'); await observer(event) },
  })
}

const answer = (proposals, reason = { kind: 'stop' }) => [
  { type: 'text-delta', index: 0, text: JSON.stringify({ proposals }) },
  { type: 'finish', reason },
]

row('real plugin uses the selected no-tool weak-model route and does not expose memos', async (t) => {
  const w = await runtimeWorld(t)
  const [target] = await add(w, [{ title: FIXTURE.goal, note: FIXTURE.note }])
  assert.equal((await w.call(TOOL.memo, { text: FIXTURE.passport })).ok, true)
  const proposal = progressFact(target.id, VALUE.child)
  assert.equal((await select(w, RUNTIME.route)).ok, true)
  assert.equal((await audit(w)).available, true)
  w.replyWith(() => answer([proposal]))
  await w.turn(observation(proposal.evidence))
  const { config, input } = one(w.calls)
  assert.deepEqual(pick(config, ['provider', 'model']), RUNTIME.route)
  assert.equal(config.maxTokens, RUNTIME.outputTokens)
  assert.ok(input.tools == null || input.tools.length === 0)
  const wire = JSON.stringify(input)
  for (const expected of [target.id, FIXTURE.goal, FIXTURE.note, proposal.evidence]) assert.ok(wire.includes(expected), expected)
  assert.ok(!wire.includes(FIXTURE.passport))
  assert.equal(task(await board(w), target.id).progress, VALUE.child)
  assert.equal(w.notices.length, 1)
})

row('real model max-token finish discards even a complete-looking patch and never replays it', async (t) => {
  const w = await runtimeWorld(t)
  const [target] = await add(w, [{ title: FIXTURE.goal }])
  const before = await board(w)
  await select(w, RUNTIME.route)
  const proposal = progressFact(target.id, VALUE.child)
  const event = observation(proposal.evidence)
  w.replyWith(() => answer([proposal], { kind: 'max-tokens' }))
  await w.turn(event)
  await w.turn(event)
  await quiet(w, before, { calls: 1 })
})

row('real model rate limiting pauses later turns without retrying or changing the board', async (t) => {
  const w = await runtimeWorld(t)
  const [target] = await add(w, [{ title: FIXTURE.goal }])
  const before = await board(w)
  await select(w, RUNTIME.route)
  const proposal = progressFact(target.id, VALUE.child)
  const event = observation(proposal.evidence)
  w.replyWith(() => answer([], { kind: 'error', failure: { code: 'RATE_LIMIT', status: 429, providerRetryAfterMs: RUNTIME.cooldownMs } }))
  await w.turn(event)
  await w.restart()
  w.replyWith(() => answer([proposal]))
  await w.turn(observation(proposal.evidence, { sequence: event.payload.turnFinal.sequence + REVISION.step }))
  await quiet(w, before, { calls: 1 })
})

row('real model never dispatches when its context cannot fit the required input and output', async (t) => {
  const w = await runtimeWorld(t, { contextWindow: RUNTIME.outputTokens + REVISION.step })
  const [target] = await add(w, [{ title: FIXTURE.goal }])
  const before = await board(w)
  // A runtime may reject the selection up front or deny the turn in preflight; neither may dispatch.
  const selected = await w.fetch(ROUTE.post, AUTO.settings, { model: RUNTIME.route })
  if (selected.body.ok) await w.turn(observation(progressFact(target.id, VALUE.child).evidence))
  await quiet(w, before, { calls: 0 })
})

row('failed durable commit emits neither a half batch nor a Fishball notice', async (t) => {
  const { w, created: [target] } = await enabled(t)
  const before = await board(w)
  const proposal = progressFact(target.id, VALUE.child)
  const { done, finish } = await inFlight(w, proposal)
  try {
    if (!w.breakStorage()) { t.skip('read-only domain is writable to this process'); return }
  } finally { finish(); await done }
  await quiet(w, before, { calls: 1 })
})
row('a delayed model readiness check cannot override a newer owner Off save', async (t) => {
  const { w } = await enabled(t)
  const before = await board(w)
  const began = Promise.withResolvers()
  const ready = Promise.withResolvers()
  w.setModels((model) => {
    if (model.provider !== MODELS.second.provider) return true
    began.resolve()
    return ready.promise
  })
  const older = w.fetch(ROUTE.post, AUTO.settings, { model: MODELS.second })
  try {
    await Promise.race([began.promise, older.then(() => assert.fail('model readiness was not awaited'))])
    assert.equal((await select(w, null)).ok, true)
  } finally { ready.resolve(true) }
  const refused = await older
  assert.equal(refused.status, ROUTE.status.conflict)
  assert.equal(refused.body.code, CODE.stale)
  assert.equal((await audit(w)).model, null)
  await quiet(w, before, { calls: 0 })
})
row('a host request extension that can add undisclosed data prevents model selection and preparation', async (t) => {
  const w = await runtimeWorld(t, { extension: true })
  await add(w, [{ title: FIXTURE.goal }])
  const before = await board(w)
  const history = await audit(w)
  assert.deepEqual(history.models, [])
  assert.equal(history.available, false)
  const refusal = await w.fetch(ROUTE.post, AUTO.settings, { model: RUNTIME.route })
  assert.equal(refusal.body.ok, false)
  assert.equal((await audit(w)).model, null)
  assert.equal(w.prepared(), 0)
  await quiet(w, before, { calls: 0 })
})
