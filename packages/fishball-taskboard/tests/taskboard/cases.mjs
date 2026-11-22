/**
 * fishball-taskboard black-box cases (USE-CASES.md), written from the user's requirements, the
 * design document docs/plugins/fishball-taskboard.md and the lead's answers Q1-Q24 (2026-11-21).
 * No file of this package other than package.json and cordis.patch.yml was read.
 *
 * Level: integration and system, in-process (world.mjs): the real row on a loader of the current
 * DSH, over that DSH's real storage stack (dsh-storage, dsh-storage-json, dsh-storage-domain) in a
 * temp root and a real SessionStore; fakes only for connection.fetch, fishballInstance (apiVersion 2)
 * and appReady. A restart closes the whole DSH and opens a new one over the same root.
 *
 * Techniques: Use Cases (TB-UC), Equivalence Partitioning (TB-EP), Boundary Value Analysis (TB-BVA),
 * Decision Tables (TB-DT), State Transitions (TB-ST). Cases that depend on a PENDING value of the
 * document say "provisional" in their title; the value is one constant in constants.mjs.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { rowModule } from 'fishball-test-helpers/bind'
import { caseName } from 'fishball-test-helpers/cases'
import { DSH_VERSION, VERSIONS_DIR } from 'fishball-test-helpers/dsh'
import {
  BOARD_KEYS, CODE, CREATED_KEYS, DSH, DSH_ARGS_ERROR, FIELD, FIXTURE, ID, INSTANCE, LIMIT, LOG, MEMO_KEYS, NOT_A_STATUS, NOTICE, NOTIFY, PENDING,
  POST_MEMO_KEYS, POST_TASK_KEYS, READ_KEYS, REMINDER, REVISION, ROUTE, STATUS, STATUSES, SUBJECT, TASK_DEFAULT, TASK_KEYS, TOOL,
  UNFINISHED, UNKNOWN_KEY, WAIT,
} from './constants.mjs'
import { worldFor } from './world.mjs'

const T = { timeout: WAIT.testMs }
const json = (value) => JSON.stringify(value)
const sortedKeys = (value) => Object.keys(value).sort()
const pick = (value, keys) => Object.fromEntries(keys.filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]))
const text = (n, ch = FIXTURE.ascii) => ch.repeat(n)

/** One case on the current DSH: `<ID> <row> [DSH <version>] <title>`. */
function row(id, part, title, fn) { test(caseName(id, part, title), T, fn) }

// ------------------------------------------------------------------------------------------------
// Oracle helpers

function ok(result, what) {
  assert.equal(result?.ok, true, what + ' succeeds: ' + json(result))
  return result
}
/** DOC §3: a refusal is {ok: false, code, field?}; field is checked when the case names one. */
function refused(result, code, field) {
  assert.equal(result?.ok, false, 'refused: ' + json(result))
  assert.equal(result.code, code, 'code: ' + json(result))
  if (field instanceof RegExp) assert.match(String(result.field), field, 'field: ' + json(result))
  else if (field !== undefined) assert.equal(result.field, field, 'field: ' + json(result))
}
/** Runs fn and asserts the board (as GET sees it) did not change. */
async function unchanged(w, fn) {
  const before = await getBoard(w)
  const result = await fn()
  assert.deepEqual(await getBoard(w), before, 'the board is unchanged')
  return result
}

// ------------------------------------------------------------------------------------------------
// Board helpers

async function getBoard(w) {
  const { status, body } = await w.fetch(ROUTE.get, ROUTE.board)
  assert.equal(status, ROUTE.status.ok, 'GET board: ' + json(body))
  return body
}
/** taskboard_add, asserted to succeed; returns the created entries. */
async function add(w, tasks, parentId) {
  const args = parentId === undefined ? { tasks } : { tasks, parentId }
  return ok(await w.call(TOOL.add, args), TOOL.add).created
}
const byTitle = (board, title) => board.tasks.find((t) => t.title === title)
/** A nested chain of levels tasks (each the only subtask of the one above). */
const chain = (levels, n = 0) => ({ title: FIXTURE.title(n), ...(levels > 1 ? { subtasks: [chain(levels - 1, n + 1)] } : {}) })

/** DOC §4: a complete POST body from the current board, passed through edit(). */
function postBody(board, edit = (b) => b) {
  const body = { baseRevision: board.revision, tasks: board.tasks.map((t) => pick(t, POST_TASK_KEYS)), memos: board.memos.map((m) => pick(m, POST_MEMO_KEYS)) }
  return edit(body)
}
const newTask = (title, extra = {}) => ({ id: FIXTURE.taskId(), parentId: TASK_DEFAULT.parentId, title, note: TASK_DEFAULT.note, status: TASK_DEFAULT.status, progress: TASK_DEFAULT.progress, ...extra })
const newMemo = (memoText) => ({ id: FIXTURE.memoId(), text: memoText })
const save = (w, body) => w.fetch(ROUTE.post, ROUTE.board, body)
/** POSTs edit(body) of the current board; asserts 200 and returns {response, before, board}. */
async function userSave(w, edit) {
  const before = await getBoard(w)
  const response = await save(w, postBody(before, edit))
  assert.equal(response.status, ROUTE.status.ok, 'POST: ' + json(response.body))
  return { response: response.body, before, board: await getBoard(w) }
}
const edited = (tasks, id, change) => tasks.map((t) => (t.id === id ? { ...t, ...change } : t))
const without = (item, key) => { const copy = { ...item }; delete copy[key]; return copy }

/** DOC §5: exactly one new notice since count, with the text of lines at revision. */
function assertNotice(w, count, revision, lines) {
  assert.equal(w.notices.length, count + 1, 'exactly one notify for the save: ' + json(w.notices.slice(count)))
  const notice = w.notices.at(-1)
  assert.equal(notice.pluginId, NOTICE.pluginId, 'pluginId')
  assert.equal(notice.wake, NOTICE.wake, 'wake: true')
  assert.match(String(notice.dedupeKey), NOTICE.dedupeKey, 'dedupeKey')
  assert.equal(notice.text, NOTICE.text(revision, lines), 'the notice text')
  return notice
}

/** The messages injected into a live agent since count. */
const remindersSince = (w, count) => w.injects.slice(count)
function assertReminder(w, count, n) {
  const got = remindersSince(w, count)
  assert.equal(got.length, 1, 'exactly one inject: ' + json(got))
  assert.equal(got[0].liveId, w.live.id, 'on the manager\'s live agent')
  const message = got[0].message
  assert.equal(message.role, REMINDER.role, 'user role')
  assert.deepEqual(pick(message.source ?? {}, Object.keys(REMINDER.source)), REMINDER.source, 'source')
  assert.equal((message.content ?? []).filter((b) => b.type === DSH.textBlock).map((b) => b.text).join(''), REMINDER.text(n), 'the reminder line')
}
let compactions = 0
const compactionEnd = (error) => ({ type: DSH.compactionEnd, data: { compactionId: FIXTURE.compactionId + ++compactions, turn: null, ...(error === undefined ? {} : { error }) } })

/** A world with core, three unfinished tasks (goal + 2 subtasks) and one memo. */
async function seeded(t, options) {
  const w = await worldFor(t, options)
  await add(w, [{ title: FIXTURE.goal, subtasks: [{ title: FIXTURE.flights }, { title: FIXTURE.hotel }] }])
  ok(await w.call(TOOL.memo, { text: FIXTURE.passport }), TOOL.memo)
  return w
}

export function registerTaskboardCases() {
  // ==============================================================================================
  // Surface (EP of the package's public files)

  row('TB-EP-12', 1, 'the row module exports name fishball-taskboard, inject storage + storageDomain + connection, and apply', async () => {
    const mod = await rowModule(SUBJECT.entry)
    assert.equal(mod.name, SUBJECT.name)
    const inject = Array.isArray(mod.inject) ? mod.inject : Object.keys(mod.inject ?? {})
    assert.deepEqual([...inject].sort(), SUBJECT.inject)
  })
  row('TB-EP-12', 2, 'its own cordis.patch.yml has the row fishball-taskboard named by the package fishball-taskboard; the package is fishball-taskboard, dsh.client web, exports ./client', () => {
    const yaml = createRequire(path.join(VERSIONS_DIR, DSH_VERSION, DSH.sdkManifest))(DSH.yaml)
    const rows = yaml.parse(fs.readFileSync(SUBJECT.patch, SUBJECT.encoding)).flatMap((op) => Object.values(op).flat())
    const found = rows.filter((r) => r?.id === SUBJECT.patchRow.id)
    assert.equal(found.length, 1, 'one patch row ' + SUBJECT.patchRow.id)
    assert.equal(found[0].name, SUBJECT.patchRow.name)
    const manifest = JSON.parse(fs.readFileSync(SUBJECT.manifest, SUBJECT.encoding))
    assert.equal(manifest.name, SUBJECT.manifestName)
    assert.equal(manifest.dsh?.client?.platform, SUBJECT.clientPlatform)
    assert.ok(Object.hasOwn(manifest.exports ?? {}, SUBJECT.clientExport), 'exports ./client')
  })

  // ==============================================================================================
  // Use Cases

  // TB-UC-01: Fishball breaks a goal down and tracks it (REQ tools; DOC §3).
  row('TB-UC-01', 'main', 'Fishball creates a goal, breaks it into subtasks, updates status and progress, and reads the tree', async (t) => {
    const w = await worldFor(t)
    assert.deepEqual(w.toolNames(), Object.values(TOOL).sort(), 'the four tools are in the manager scope')
    const empty = ok(await w.read(), TOOL.read)
    assert.deepEqual(sortedKeys(empty), READ_KEYS)
    assert.equal(empty.revision, REVISION.initial, 'a new board is revision 0')
    assert.deepEqual([empty.tasks, empty.memos, empty.unfinished], [[], [], 0])
    const [goal] = await add(w, [{ title: FIXTURE.goal }])
    assert.deepEqual(sortedKeys(goal), CREATED_KEYS)
    assert.match(goal.id, ID.task)
    assert.equal(goal.parentId, null)
    const subs = await add(w, [{ title: FIXTURE.flights }, { title: FIXTURE.hotel, note: FIXTURE.note }], goal.id)
    assert.deepEqual(subs.map((s) => [s.title, s.parentId]), [[FIXTURE.flights, goal.id], [FIXTURE.hotel, goal.id]])
    const updated = ok(await w.call(TOOL.update, { id: subs[0].id, status: STATUS.inProgress, progress: FIXTURE.progressMid }), TOOL.update)
    assert.deepEqual(pick(updated.task, ['id', 'status', 'progress']), { id: subs[0].id, status: STATUS.inProgress, progress: FIXTURE.progressMid })
    const board = ok(await w.read(), TOOL.read)
    assert.equal(board.revision, REVISION.initial + 3 * REVISION.step, 'three committed changes')
    assert.deepEqual(board.tasks.map((x) => [x.title, x.parentId]), [[FIXTURE.goal, null], [FIXTURE.flights, goal.id], [FIXTURE.hotel, goal.id]])
    for (const task of board.tasks) assert.deepEqual(sortedKeys(task), TASK_KEYS, 'a task names no session, event or turn (REQ)')
    const hotel = byTitle(board, FIXTURE.hotel)
    assert.deepEqual(pick(hotel, ['status', 'progress', 'note']), { status: TASK_DEFAULT.status, progress: TASK_DEFAULT.progress, note: FIXTURE.note }, 'DOC §2 defaults')
    assert.equal(byTitle(board, FIXTURE.goal).note, TASK_DEFAULT.note)
    assert.equal(board.unfinished, 3)
    assert.equal(updated.revision, board.revision)
  })

  // TB-UC-02: the user edits the board in the UI; Fishball is woken with what changed (REQ; DOC §4, §5's example).
  row('TB-UC-02', 'main', 'a user save that deletes, changes and adds tasks and adds a memo commits once and wakes Fishball with the DOC §5 text', async (t) => {
    const w = await worldFor(t)
    const [goal] = await add(w, [{ title: FIXTURE.goal }])
    await add(w, [{ title: FIXTURE.oldIdea, subtasks: [{ title: FIXTURE.title(1) }, { title: FIXTURE.title(2) }] }])
    const before = await getBoard(w)
    const old = byTitle(before, FIXTURE.oldIdea)
    const count = w.notices.length
    const flights = newTask(FIXTURE.flights, { parentId: goal.id })
    const passport = newMemo(FIXTURE.passport)
    const response = await save(w, postBody(before, (b) => ({
      ...b,
      tasks: [...edited(b.tasks, goal.id, { status: STATUS.inProgress, progress: FIXTURE.progressMid }).filter((x) => x.id !== old.id && x.parentId !== old.id), flights],
      memos: [passport],
    })))
    const revision = before.revision + REVISION.step
    assert.deepEqual([response.status, response.body], [ROUTE.status.ok, { ok: true, revision, changed: true, notified: true }])
    const after = await getBoard(w)
    assert.deepEqual(after.tasks.map((x) => x.title), [FIXTURE.goal, FIXTURE.flights], 'Old idea and its subtasks are gone; Book flights appended')
    assert.equal(byTitle(after, FIXTURE.flights).id, flights.id, 'a new item keeps its t_<uuid> id')
    assert.deepEqual(after.memos.map((m) => [m.id, m.text]), [[passport.id, FIXTURE.passport]])
    assertNotice(w, count, revision, [
      NOTICE.deletedTask(FIXTURE.oldIdea, 2),
      NOTICE.changedTask(FIXTURE.goal, [NOTICE.part.status(STATUS.todo, STATUS.inProgress), NOTICE.part.progress(TASK_DEFAULT.progress, FIXTURE.progressMid)]),
      NOTICE.addedTask(FIXTURE.flights, FIXTURE.goal),
      NOTICE.addedMemo(FIXTURE.passport),
    ])
    assert.deepEqual(pick(ok(await w.read(), TOOL.read), BOARD_KEYS), after, 'Fishball reads the user\'s board')
  })

  // TB-UC-03: data persists across restarts (REQ).
  row('TB-UC-03', 'main', 'tool and POST results survive a restart: the reopened board is the same document', async (t) => {
    const w = await seeded(t)
    await userSave(w, (b) => ({ ...b, memos: [...b.memos, newMemo(FIXTURE.visa)] }))
    const before = await getBoard(w)
    await w.restart()
    assert.deepEqual(await getBoard(w), before, 'GET after the restart')
    assert.deepEqual(pick(ok(await w.read(), TOOL.read), BOARD_KEYS), before, 'taskboard_read after the restart')
    const next = ok(await w.call(TOOL.update, { id: byTitle(before, FIXTURE.goal).id, status: STATUS.inProgress }), TOOL.update)
    assert.equal(next.revision, before.revision + REVISION.step, 'the revision continues after the restart')
  })

  // TB-UC-04: the compaction reminder (REQ; DOC §6).
  row('TB-UC-04', 'main', 'after a successful compaction of the manager session with unfinished tasks, one reminder line naming the count is injected', async (t) => {
    const w = await seeded(t)
    const count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, count, 3)
  })

  // TB-UC-05: without core (DOC §7).
  row('TB-UC-05', 'main', 'without fishballInstance: no tools, one fishball-core-missing warn line, the routes still serve and edit the board, a save answers notified: false', async (t) => {
    const w = await worldFor(t, { core: false })
    assert.ok(w.active(), 'the row is up')
    assert.deepEqual(w.toolNames(), [], 'no tools')
    const lines = w.linesWith(LOG.coreMissing)
    assert.equal(lines.length, 1, 'one line: ' + json(lines))
    assert.deepEqual([lines[0].name, lines[0].type], [LOG.logger, LOG.warn])
    const board = await getBoard(w)
    assert.deepEqual(board, { revision: REVISION.initial, unfinished: 0, tasks: [], memos: [] })
    const response = await save(w, postBody(board, (b) => ({ ...b, tasks: [newTask(FIXTURE.goal)] })))
    assert.deepEqual([response.status, response.body], [ROUTE.status.ok, { ok: true, revision: REVISION.initial + REVISION.step, changed: true, notified: false }])
    assert.deepEqual((await getBoard(w)).tasks.map((x) => x.title), [FIXTURE.goal], 'the save stands')
    assert.deepEqual(w.notices, [], 'no notify')
  })

  // ==============================================================================================
  // Equivalence Partitioning

  // TB-EP-01: who calls a tool (DOC §3: exec.agent.session.id must be manager.sessionId()).
  const callers = [
    [1, 'the manager\'s agent', (w) => w.agent, true],
    [2, 'an agent of another session', (w) => { const s = w.otherSession(); return { id: s.id, session: s } }, false],
    [3, 'the manager\'s agent while core names no manager session', (w) => { w.noManager = true; return w.agent }, false],
    [4, 'no agent in exec', () => undefined, false],
  ]
  for (const [part, label, agentOf, allowed] of callers) {
    row('TB-EP-01', part, label + ': ' + (allowed ? 'every tool runs' : 'every tool answers not-manager and changes nothing'), async (t) => {
      const w = await seeded(t)
      const before = await getBoard(w)
      const as = agentOf(w)
      const calls = [[TOOL.read, {}], [TOOL.add, { tasks: [{ title: FIXTURE.title(9) }] }], [TOOL.update, { id: before.tasks[0].id, status: STATUS.blocked }], [TOOL.memo, { id: before.memos[0].id, text: FIXTURE.visa }]]
      for (const [name, args] of calls) {
        const result = await w.callAs(as, name, args)
        if (allowed) ok(result, name)
        else refused(result, CODE.notManager)
      }
      if (!allowed) assert.deepEqual(await getBoard(w), before, 'nothing changed')
    })
  }

  // TB-EP-02: the statuses (DOC §2; provisional: PENDING (statuses)).
  for (const status of STATUSES) {
    row('TB-EP-02', status, 'taskboard_update to ' + status + ' is accepted; unfinished counts it ' + (UNFINISHED.includes(status) ? 'in' : 'out') + ' (' + PENDING.statuses + ')', async (t) => {
      const w = await worldFor(t)
      const [task] = await add(w, [{ title: FIXTURE.goal, status: status === STATUS.todo ? STATUS.done : STATUS.todo }])
      const result = ok(await w.call(TOOL.update, { id: task.id, status }), TOOL.update)
      assert.equal(result.task.status, status)
      assert.equal(ok(await w.read(), TOOL.read).unfinished, UNFINISHED.includes(status) ? 1 : 0)
    })
  }
  row('TB-EP-02', 'invalid', 'a status DOC §2 does not name is refused (update: field status; add: tasks[0].status); nothing changes', async (t) => {
    const w = await seeded(t)
    const id = (await getBoard(w)).tasks[0].id
    refused(await unchanged(w, () => w.call(TOOL.update, { id, status: NOT_A_STATUS })), CODE.invalidInput, FIELD.status)
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), status: NOT_A_STATUS }] })), CODE.invalidInput, FIELD.nested([0], FIELD.status))
  })

  // TB-EP-03: unknown fields (Q5): refused with the key's path; REQ: no session link can be stored.
  const unknownRows = [
    [1, 'taskboard_update', (w, id) => w.call(TOOL.update, { id, title: FIXTURE.renamed, [UNKNOWN_KEY]: FIXTURE.ascii }), UNKNOWN_KEY],
    [2, 'taskboard_add item', (w) => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), [UNKNOWN_KEY]: FIXTURE.ascii }] }), FIELD.nested([0], UNKNOWN_KEY)],
    [3, 'taskboard_add nested subtask', (w) => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), subtasks: [{ title: FIXTURE.title(2), [UNKNOWN_KEY]: FIXTURE.ascii }] }] }), FIELD.nested([0, 0], UNKNOWN_KEY)],
    [4, 'taskboard_add top level', (w) => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1) }], [UNKNOWN_KEY]: FIXTURE.ascii }), UNKNOWN_KEY],
    [5, 'taskboard_memo', (w) => w.call(TOOL.memo, { text: FIXTURE.visa, [UNKNOWN_KEY]: FIXTURE.ascii }), UNKNOWN_KEY],
    [6, 'taskboard_add item naming a session (REQ: tasks are not linked to sessions)', (w) => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), sessionId: w.session.id }] }), FIELD.nested([0], 'sessionId')],
    [7, 'taskboard_update with delete (' + PENDING.delete + ': Fishball cannot delete a task)', (w, id) => w.call(TOOL.update, { id, delete: true }), FIELD.delete],
  ]
  for (const [part, label, call, field] of unknownRows) {
    row('TB-EP-03', part, label + ' with an unknown key: invalid-input, field ' + field + '; nothing changes', async (t) => {
      const w = await seeded(t)
      const id = (await getBoard(w)).tasks[0].id
      refused(await unchanged(w, () => call(w, id)), CODE.invalidInput, field)
    })
  }

  // TB-EP-04: not-found (Q6).
  row('TB-EP-04', 1, 'unknown id for update or memo: not-found, field id; unknown parentId for add: not-found, field parentId; nothing changes', async (t) => {
    const w = await seeded(t)
    refused(await unchanged(w, () => w.call(TOOL.update, { id: FIXTURE.taskId(), status: STATUS.done })), CODE.notFound, FIELD.id)
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1) }], parentId: FIXTURE.taskId() })), CODE.notFound, FIELD.parentId)
    refused(await unchanged(w, () => w.call(TOOL.memo, { id: FIXTURE.memoId(), text: FIXTURE.visa })), CODE.notFound, FIELD.id)
    refused(await unchanged(w, () => w.call(TOOL.memo, { id: FIXTURE.memoId(), delete: true })), CODE.notFound, FIELD.id)
  })

  // TB-EP-05: argument shapes that are not the tools' (Q23 as corrected by the lead, 2026-11-21).
  // Rows 1-2: arguments that are not an object are DOC §3's one exception: DSH's own registry
  // rejects them (ToolArgsError) before the tool runs, and the board is unchanged.
  for (const [part, label, args] of [[1, 'null', null], [2, 'a string', FIXTURE.notAnObject]]) {
    row('TB-EP-05', part, 'taskboard_add with ' + label + ' as arguments: DSH rejects the call (' + DSH_ARGS_ERROR + ', DOC §3 exception); nothing changes', async (t) => {
      const w = await seeded(t)
      await unchanged(w, () => assert.rejects(w.callRaw(TOOL.add, args), (error) => error?.name === DSH_ARGS_ERROR))
    })
  }
  const FIRST_ID = Symbol('first task id')
  const shapeRows = [
    [3, 'taskboard_add with tasks a string: field tasks', TOOL.add, { tasks: FIXTURE.notAnObject }, FIELD.tasks],
    [4, 'taskboard_add with no tasks key: field tasks', TOOL.add, {}, FIELD.tasks],
    [5, 'taskboard_update with no id: field id', TOOL.update, { status: STATUS.done }, FIELD.id],
    [6, 'taskboard_update naming no field: field title|note|status|progress', TOOL.update, FIRST_ID, FIELD.updateNone],
    [7, 'taskboard_memo add with no text: field text', TOOL.memo, {}, FIELD.text],
  ]
  for (const [part, label, name, args, field] of shapeRows) {
    row('TB-EP-05', part, label + ': invalid-input; nothing changes', async (t) => {
      const w = await seeded(t)
      const real = args === FIRST_ID ? { id: (await getBoard(w)).tasks[0].id } : args
      refused(await unchanged(w, () => w.call(name, real)), CODE.invalidInput, field)
    })
  }

  // TB-EP-06: trimming (DOC §3, Q8).
  row('TB-EP-06', 1, 'a padded title, note and memo text are stored trimmed; a blank title or memo is refused (empty after trimming)', async (t) => {
    const w = await worldFor(t)
    const [task] = await add(w, [{ title: FIXTURE.pad(FIXTURE.goal), note: FIXTURE.pad(FIXTURE.note) }])
    const memo = ok(await w.call(TOOL.memo, { text: FIXTURE.pad(FIXTURE.passport) }), TOOL.memo).memo
    const board = await getBoard(w)
    assert.deepEqual(pick(board.tasks[0], ['id', 'title', 'note']), { id: task.id, title: FIXTURE.goal, note: FIXTURE.note })
    assert.deepEqual(pick(board.memos[0], ['id', 'text']), { id: memo.id, text: FIXTURE.passport })
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.blank }] })), CODE.invalidInput, FIELD.nested([0], FIELD.title))
    refused(await unchanged(w, () => w.call(TOOL.update, { id: task.id, title: FIXTURE.blank })), CODE.invalidInput, FIELD.title)
    refused(await unchanged(w, () => w.call(TOOL.memo, { text: FIXTURE.blank })), CODE.invalidInput, FIELD.text)
  })

  // TB-EP-07: POST bodies that are not a valid board: 400, unchanged, no notify (DOC §4, Q9, Q15, Q21).
  const NO_FIELD = null
  const postRows = [
    ['unparsable JSON', () => FIXTURE.unparsable, CODE.invalidInput, NO_FIELD],
    ['baseRevision missing', (b) => without(b, FIELD.baseRevision), CODE.invalidInput, FIELD.baseRevision],
    ['baseRevision a string', (b) => ({ ...b, baseRevision: String(b.baseRevision) }), CODE.invalidInput, FIELD.baseRevision],
    ['baseRevision a fraction', (b) => ({ ...b, baseRevision: b.baseRevision + FIXTURE.fraction }), CODE.invalidInput, FIELD.baseRevision],
    ['tasks not an array', (b) => ({ ...b, tasks: FIXTURE.notAnObject }), CODE.invalidInput, FIELD.tasks],
    ['memos not an array', (b) => ({ ...b, memos: FIXTURE.notAnObject }), CODE.invalidInput, FIELD.memos],
    ['an unknown top-level key', (b) => ({ ...b, [UNKNOWN_KEY]: FIXTURE.ascii }), CODE.invalidInput, UNKNOWN_KEY],
    ['a task with an unknown key', (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { [UNKNOWN_KEY]: FIXTURE.ascii }) }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, UNKNOWN_KEY)],
    ['a task without note', (b) => ({ ...b, tasks: [without(b.tasks[0], FIELD.note), ...b.tasks.slice(1)] }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.note)],
    ['a task without parentId', (b) => ({ ...b, tasks: [without(b.tasks[0], FIELD.parentId), ...b.tasks.slice(1)] }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.parentId)],
    ['a task progress "50"', (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { progress: FIXTURE.numericString }) }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.progress)],
    ['a task progress 101', (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { progress: LIMIT.progress.max + 1 }) }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.progress)],
    ['a task status DOC §2 does not name', (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { status: NOT_A_STATUS }) }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.status)],
    ['a blank task title', (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { title: FIXTURE.blank }) }), CODE.invalidInput, FIELD.item(FIELD.tasks, 0, FIELD.title)],
    ['a new task with a malformed id', (b) => ({ ...b, tasks: [b.tasks[0], { ...newTask(FIXTURE.title(1)), id: FIXTURE.malformedTaskId }] }), CODE.invalidInput, FIELD.item(FIELD.tasks, 1, FIELD.id)],
    ['a duplicate task id', (b) => ({ ...b, tasks: [b.tasks[0], { ...newTask(FIXTURE.title(1)), id: b.tasks[0].id }] }), CODE.invalidInput, FIELD.item(FIELD.tasks, 1, FIELD.id)],
    ['a parentId naming no task of the body', (b) => ({ ...b, tasks: [b.tasks[0], newTask(FIXTURE.title(1), { parentId: FIXTURE.taskId() })] }), CODE.invalidInput, FIELD.item(FIELD.tasks, 1, FIELD.parentId)],
    ['a parentId cycle', (b) => { const x = newTask(FIXTURE.title(1)); const y = newTask(FIXTURE.title(2), { parentId: x.id }); return { ...b, tasks: [b.tasks[0], { ...x, parentId: y.id }, y] } }, CODE.invalidInput, FIELD.anyParentId],
    ['a new memo with a malformed id', (b) => ({ ...b, memos: [...b.memos, { id: FIXTURE.malformedMemoId, text: FIXTURE.visa }] }), CODE.invalidInput, FIELD.item(FIELD.memos, 1, FIELD.id)],
    ['a blank memo text', (b) => ({ ...b, memos: [{ ...b.memos[0], text: FIXTURE.blank }] }), CODE.invalidInput, FIELD.item(FIELD.memos, 0, FIELD.text)],
    ['a memo without text', (b) => ({ ...b, memos: [without(b.memos[0], FIELD.text)] }), CODE.invalidInput, FIELD.item(FIELD.memos, 0, FIELD.text)],
  ]
  postRows.forEach(([label, edit, code, field], index) => {
    row('TB-EP-07', index + 1, 'POST with ' + label + ': 400 ' + code + (field === NO_FIELD ? ' with no field' : ', field ' + field) + '; the board is unchanged; no notify', async (t) => {
      const w = await seeded(t)
      const count = w.notices.length
      const response = await unchanged(w, async () => save(w, edit(postBody(await getBoard(w)))))
      assert.equal(response.status, ROUTE.status.badRequest, json(response.body))
      refused(response.body, code, field === NO_FIELD ? undefined : field)
      if (field === NO_FIELD) assert.equal(response.body.field, undefined, 'no field')
      assert.equal(w.notices.length, count, 'no notify')
    })
  })

  // TB-EP-08: core present / missing / older, with and without appReady (DOC §7, SURFACE).
  const coreRows = [
    [1, 'fishballInstance apiVersion 2', { core: true }, true],
    [2, 'no fishballInstance', { core: false }, false],
    [3, 'an older fishballInstance (apiVersion 1)', { core: true, apiVersion: INSTANCE.older }, false],
  ]
  for (const [part, label, options, compatible] of coreRows) {
    row('TB-EP-08', part, label + ': ' + (compatible ? 'registers its X2 setup and the tools, no core-missing line' : 'no tools, exactly one core-missing warn line at load, the GET route serves'), async (t) => {
      const w = await worldFor(t, options)
      assert.ok(w.active(), 'the row is up')
      assert.equal(w.linesWith(LOG.coreMissing).length, compatible ? 0 : 1, json(w.linesWith(LOG.coreMissing)))
      assert.deepEqual(w.toolNames(), compatible ? Object.values(TOOL).sort() : [])
      if (compatible) assert.deepEqual(w.setups, [NOTICE.pluginId], 'registerSetup under fishball-taskboard')
      assert.equal((await w.fetch(ROUTE.get, ROUTE.board)).status, ROUTE.status.ok)
    })
  }
  row('TB-EP-08', 4, 'no fishballInstance with appReady: no line at load, exactly one at app ready', async (t) => {
    const w = await worldFor(t, { core: false, appReady: true })
    assert.equal(w.linesWith(LOG.coreMissing).length, 0, 'not at load')
    w.fireReady()
    await w.settle()
    assert.equal(w.linesWith(LOG.coreMissing).length, 1, 'one at app ready')
  })
  row('TB-EP-08', 5, 'fishballInstance with appReady: no line at app ready', async (t) => {
    const w = await worldFor(t, { core: true, appReady: true })
    w.fireReady()
    await w.settle()
    assert.equal(w.linesWith(LOG.coreMissing).length, 0)
  })

  // TB-EP-09: storage fails (DOC §3/§4: board-unavailable).
  row('TB-EP-09', 1, 'when the storage write fails: a tool answers board-unavailable and POST answers 503 board-unavailable', async (t) => {
    const w = await seeded(t)
    const board = await getBoard(w)
    if (!w.breakStorage()) { t.skip('this user can write a read-only folder (root): no storage fault to inject'); return }
    refused(await w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1) }] }), CODE.unavailable)
    const response = await save(w, postBody(board, (b) => ({ ...b, tasks: [...b.tasks, newTask(FIXTURE.title(2))] })))
    assert.deepEqual([response.status, response.body?.ok, response.body?.code], [ROUTE.status.unavailable, false, CODE.unavailable])
  })

  // ==============================================================================================
  // Boundary Value Analysis (limits: provisional, PENDING (limits))

  const lengthRows = (bound, make) => [
    ['0', make(0), bound.min <= 0],
    ['1', make(1), true],
    ['max ' + bound.max, make(bound.max), true],
    ['max + 1 = ' + (bound.max + 1), make(bound.max + 1), false],
    ['max astral code points (2 UTF-16 units each)', make(bound.max, FIXTURE.astral), true],
    ['max + 1 astral code points', make(bound.max + 1, FIXTURE.astral), false],
    ['max padded with spaces (checked after trimming)', FIXTURE.pad(make(bound.max)), true],
  ]
  lengthRows(LIMIT.title, text).forEach(([what, value, accepted], index) => {
    row('TB-BVA-01', index + 1, 'title ' + what + ': ' + (accepted ? 'accepted by add and update' : 'invalid-input tasks[0].title / title') + ' (' + PENDING.limits + ')', async (t) => {
      const w = await seeded(t)
      const id = (await getBoard(w)).tasks[0].id
      if (accepted) {
        ok(await w.call(TOOL.add, { tasks: [{ title: value }] }), TOOL.add)
        ok(await w.call(TOOL.update, { id, title: value }), TOOL.update)
        return
      }
      refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: value }] })), CODE.invalidInput, FIELD.nested([0], FIELD.title))
      refused(await unchanged(w, () => w.call(TOOL.update, { id, title: value })), CODE.invalidInput, FIELD.title)
    })
  })
  const countRows = (bound) => [['0', 0, bound.min <= 0], ['1', 1, bound.min <= 1], ['max ' + bound.max, bound.max, true], ['max + 1', bound.max + 1, false]]
  countRows(LIMIT.note).forEach(([what, n, accepted], index) => {
    row('TB-BVA-02', index + 1, 'note ' + what + ' code points: ' + (accepted ? 'accepted' : 'invalid-input') + ' (' + PENDING.limits + ')', async (t) => {
      const w = await seeded(t)
      const id = (await getBoard(w)).tasks[0].id
      if (accepted) {
        ok(await w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), note: text(n) }] }), TOOL.add)
        assert.equal(ok(await w.call(TOOL.update, { id, note: text(n) }), TOOL.update).task.note, text(n))
        return
      }
      refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), note: text(n) }] })), CODE.invalidInput, FIELD.nested([0], FIELD.note))
      refused(await unchanged(w, () => w.call(TOOL.update, { id, note: text(n) })), CODE.invalidInput, FIELD.note)
    })
  })
  countRows(LIMIT.memo).forEach(([what, n, accepted], index) => {
    row('TB-BVA-03', index + 1, 'memo text ' + what + ' code points: ' + (accepted ? 'accepted (add and replace)' : 'invalid-input field text') + ' (' + PENDING.limits + ', ' + PENDING.memo + ')', async (t) => {
      const w = await seeded(t)
      const id = (await getBoard(w)).memos[0].id
      if (accepted) {
        ok(await w.call(TOOL.memo, { text: text(n) }), TOOL.memo)
        assert.equal(ok(await w.call(TOOL.memo, { id, text: text(n) }), TOOL.memo).memo.text, text(n))
        return
      }
      refused(await unchanged(w, () => w.call(TOOL.memo, { text: text(n) })), CODE.invalidInput, FIELD.text)
      refused(await unchanged(w, () => w.call(TOOL.memo, { id, text: text(n) })), CODE.invalidInput, FIELD.text)
    })
  })
  const progressRows = [
    ['-1', LIMIT.progress.min - 1, false], ['0', LIMIT.progress.min, true], ['100', LIMIT.progress.max, true],
    ['101', LIMIT.progress.max + 1, false], ['1.5 (not an integer)', FIXTURE.fraction, false], ['"50" (a string)', FIXTURE.numericString, false],
  ]
  progressRows.forEach(([what, value, accepted], index) => {
    row('TB-BVA-04', index + 1, 'progress ' + what + ': ' + (accepted ? 'accepted' : 'invalid-input progress / tasks[0].progress') + ' (DOC §2)', async (t) => {
      const w = await seeded(t)
      const id = (await getBoard(w)).tasks[1].id
      if (accepted) {
        assert.equal(ok(await w.call(TOOL.update, { id, progress: value }), TOOL.update).task.progress, value)
        ok(await w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), progress: value }] }), TOOL.add)
        return
      }
      refused(await unchanged(w, () => w.call(TOOL.update, { id, progress: value })), CODE.invalidInput, FIELD.progress)
      refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(1), progress: value }] })), CODE.invalidInput, FIELD.nested([0], FIELD.progress))
    })
  })
  // Depth (top level = 1, at most 5).
  row('TB-BVA-05', 1, 'taskboard_add of a chain of depth 5 is accepted; depth 6 is limit-reached, field depth, nothing created (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    assert.equal((await add(w, [chain(LIMIT.depth)])).length, LIMIT.depth)
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [chain(LIMIT.depth + 1)] })), CODE.limitReached, FIELD.depth)
  })
  row('TB-BVA-05', 2, 'under a depth-4 task: two levels (depth 6) refused, one level (depth 5) accepted; under a depth-5 task: refused (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    const deepest = (await add(w, [chain(LIMIT.depth - 1)])).at(-1).id
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [chain(2)], parentId: deepest })), CODE.limitReached, FIELD.depth)
    const [fifth] = await add(w, [{ title: FIXTURE.title(LIMIT.depth) }], deepest)
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(LIMIT.depth + 1) }], parentId: fifth.id })), CODE.limitReached, FIELD.depth)
  })
  row('TB-BVA-05', 3, 'POST with a chain of depth 6 is 400 limit-reached, field depth; depth 5 is accepted (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    const tasks = []
    for (let level = 0; level <= LIMIT.depth; level += 1) tasks.push(newTask(FIXTURE.title(level), { parentId: tasks.at(-1)?.id ?? null }))
    const over = await unchanged(w, async () => save(w, postBody(await getBoard(w), (b) => ({ ...b, tasks }))))
    assert.equal(over.status, ROUTE.status.badRequest)
    refused(over.body, CODE.limitReached, FIELD.depth)
    await userSave(w, (b) => ({ ...b, tasks: tasks.slice(0, LIMIT.depth) }))
  })
  // Task count (at most 500).
  row('TB-BVA-06', 1, 'tasks: 499 then 1 = 500 accepted; the 501st is limit-reached, field tasks (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    await add(w, Array.from({ length: LIMIT.tasks - 1 }, (_, i) => ({ title: FIXTURE.title(i) })))
    await add(w, [{ title: FIXTURE.title(LIMIT.tasks) }])
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: [{ title: FIXTURE.title(LIMIT.tasks + 1) }] })), CODE.limitReached, FIELD.tasks)
    assert.equal((await getBoard(w)).tasks.length, LIMIT.tasks)
  })
  row('TB-BVA-06', 2, 'one taskboard_add of 501 tasks on an empty board is refused whole (limit-reached, tasks); one of 500 is accepted (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    const items = Array.from({ length: LIMIT.tasks + 1 }, (_, i) => ({ title: FIXTURE.title(i) }))
    refused(await unchanged(w, () => w.call(TOOL.add, { tasks: items })), CODE.limitReached, FIELD.tasks)
    assert.equal((await add(w, items.slice(0, LIMIT.tasks))).length, LIMIT.tasks)
  })
  row('TB-BVA-06', 3, 'POST with 501 tasks: 400 limit-reached, field tasks; with 500: accepted (' + PENDING.limits + ')', async (t) => {
    const w = await worldFor(t)
    const tasks = Array.from({ length: LIMIT.tasks + 1 }, (_, i) => newTask(FIXTURE.title(i)))
    const over = await unchanged(w, async () => save(w, postBody(await getBoard(w), (b) => ({ ...b, tasks }))))
    assert.equal(over.status, ROUTE.status.badRequest)
    refused(over.body, CODE.limitReached, FIELD.tasks)
    await userSave(w, (b) => ({ ...b, tasks: tasks.slice(0, LIMIT.tasks) }))
  })
  // Memo count (at most 200).
  row('TB-BVA-07', 1, 'memos: POST with 201 is 400 limit-reached, field memos; 199 by POST then 1 by the tool = 200 accepted; the 201st is limit-reached, field memos (' + PENDING.limits + ', ' + PENDING.memo + ')', async (t) => {
    const w = await worldFor(t)
    const memos = Array.from({ length: LIMIT.memos + 1 }, (_, i) => newMemo(FIXTURE.memoText(i)))
    const over = await unchanged(w, async () => save(w, postBody(await getBoard(w), (b) => ({ ...b, memos }))))
    assert.equal(over.status, ROUTE.status.badRequest)
    refused(over.body, CODE.limitReached, FIELD.memos)
    await userSave(w, (b) => ({ ...b, memos: memos.slice(0, LIMIT.memos - 1) }))
    ok(await w.call(TOOL.memo, { text: FIXTURE.memoText(LIMIT.memos) }), TOOL.memo)
    refused(await unchanged(w, () => w.call(TOOL.memo, { text: FIXTURE.memoText(LIMIT.memos + 1) })), CODE.limitReached, FIELD.memos)
  })
  // The quote cut (Q1, Q18): 160 not cut, 161 cut to its first 160 then the ellipsis, in code points.
  const cutRows = [['159 ASCII', text(NOTICE.quoteCut - 1)], ['160 ASCII', text(NOTICE.quoteCut)], ['161 ASCII', text(NOTICE.quoteCut + 1)], ['161 astral', text(NOTICE.quoteCut + 1, FIXTURE.astral)]]
  cutRows.forEach(([what, title], index) => {
    const cutting = [...title].length > NOTICE.quoteCut
    row('TB-BVA-08', index + 1, 'a quoted title of ' + what + ' code points in the notice: ' + (cutting ? 'its first 160 then the ellipsis' : 'not cut'), async (t) => {
      const w = await worldFor(t)
      const count = w.notices.length
      const { response } = await userSave(w, (b) => ({ ...b, tasks: [newTask(title)] }))
      assertNotice(w, count, response.revision, [NOTICE.addedTask(title)])
    })
  })
  // The 40-line cap (Q10).
  for (const [index, n] of [NOTICE.maxLines - 1, NOTICE.maxLines, NOTICE.maxLines + 1, NOTICE.maxLines + 2].entries()) {
    row('TB-BVA-09', index + 1, n + ' change lines: ' + (n > NOTICE.maxLines ? '40 lines then the "and ' + (n - NOTICE.maxLines) + ' more" line' : 'all shown'), async (t) => {
      const w = await worldFor(t)
      const count = w.notices.length
      const tasks = Array.from({ length: n }, (_, i) => newTask(FIXTURE.title(i)))
      const { response } = await userSave(w, (b) => ({ ...b, tasks }))
      assertNotice(w, count, response.revision, tasks.map((x) => NOTICE.addedTask(x.title)))
    })
  }
  // Deleted descendants (Q4): 0, 1, 2 (a grandchild counts), 3.
  const leaf = (n) => ({ title: FIXTURE.title(n) })
  const deleteRows = [[0, undefined], [1, [leaf(1)]], [2, [{ ...leaf(1), subtasks: [leaf(2)] }]], [3, [{ ...leaf(1), subtasks: [leaf(2)] }, leaf(3)]]]
  for (const [n, subtasks] of deleteRows) {
    row('TB-BVA-10', n + 1, 'the user deletes a task with ' + n + ' descendant(s): one line, ' + NOTICE.deletedTask(FIXTURE.oldIdea, n) + '; all are gone (' + PENDING.delete + ')', async (t) => {
      const w = await worldFor(t)
      await add(w, [{ title: FIXTURE.goal }, { title: FIXTURE.oldIdea, ...(subtasks ? { subtasks } : {}) }])
      const count = w.notices.length
      const { response, board } = await userSave(w, (b) => ({ ...b, tasks: [b.tasks[0]] }))
      assert.deepEqual(board.tasks.map((x) => x.title), [FIXTURE.goal])
      assertNotice(w, count, response.revision, [NOTICE.deletedTask(FIXTURE.oldIdea, n)])
    })
  }
  // The reminder's count (DOC §6, pluralised): 1 task / 2 tasks.
  for (const [index, n] of [1, 2].entries()) {
    row('TB-BVA-12', index + 1, 'a successful compaction with ' + n + ' unfinished task(s): the line reads ' + JSON.stringify(REMINDER.text(n)), async (t) => {
      const w = await worldFor(t)
      await add(w, Array.from({ length: n }, (_, i) => leaf(i)))
      const count = w.injects.length
      await w.emitSessionEvent(w.session, compactionEnd())
      assertReminder(w, count, n)
    })
  }
  // baseRevision (DOC §4, Q21): any integer mismatch is stale.
  const baseRows = [['current', (r) => r, true], ['current - 1', (r) => r - 1, false], ['current + 1', (r) => r + 1, false], ['-1', () => -1, false]]
  baseRows.forEach(([what, baseOf, fresh], index) => {
    row('TB-BVA-11', index + 1, 'baseRevision ' + what + ': ' + (fresh ? '200, committed at current + 1' : '409 stale with the current revision; unchanged; no notify'), async (t) => {
      const w = await seeded(t)
      const board = await getBoard(w)
      const count = w.notices.length
      const body = postBody(board, (b) => ({ ...b, baseRevision: baseOf(b.baseRevision), tasks: [...b.tasks, newTask(FIXTURE.title(1))] }))
      if (fresh) {
        const response = await save(w, body)
        assert.deepEqual([response.status, response.body.revision], [ROUTE.status.ok, board.revision + REVISION.step])
        return
      }
      const response = await unchanged(w, () => save(w, body))
      assert.deepEqual([response.status, response.body], [ROUTE.status.conflict, { ok: false, code: CODE.stale, revision: board.revision }])
      assert.equal(w.notices.length, count)
    })
  })

  // ==============================================================================================
  // Decision Tables

  // TB-DT-01: the compaction reminder (REQ; DOC §6). Conditions: event, error, session, unfinished.
  const BOARD = Object.freeze({ seeded: 'seeded', finished: 'finished', empty: 'empty', mixed: 'mixed' })
  const reminderRows = [
    [1, 'compaction/end, no error, the manager session, 3 unfinished', BOARD.seeded, (w) => w.session, () => compactionEnd(), 3],
    [2, 'compaction/end with an error', BOARD.seeded, (w) => w.session, () => compactionEnd(FIXTURE.compactionError), 0],
    [3, 'compaction/end of another session', BOARD.seeded, (w) => w.otherSession(), () => compactionEnd(), 0],
    [4, 'compaction/end, every task done or dropped', BOARD.finished, (w) => w.session, () => compactionEnd(), 0],
    [5, 'compaction/end, an empty board', BOARD.empty, (w) => w.session, () => compactionEnd(), 0],
    [6, 'compaction/start (not an end)', BOARD.seeded, (w) => w.session, () => ({ type: DSH.compactionStart, data: { compactionId: FIXTURE.compactionId } }), 0],
    [7, 'compaction/end, one task of each status: 3 unfinished (' + PENDING.statuses + ')', BOARD.mixed, (w) => w.session, () => compactionEnd(), UNFINISHED.length],
  ]
  for (const [part, label, board, sessionOf, eventOf, n] of reminderRows) {
    row('TB-DT-01', part, label + ': ' + (n > 0 ? 'one reminder naming ' + n : 'no inject'), async (t) => {
      const w = board === BOARD.seeded ? await seeded(t) : await worldFor(t)
      if (board === BOARD.finished) await add(w, [{ title: FIXTURE.title(1), status: STATUS.done }, { title: FIXTURE.title(2), status: STATUS.dropped }])
      if (board === BOARD.mixed) await add(w, STATUSES.map((status, i) => ({ title: FIXTURE.title(i), status })))
      const count = w.injects.length
      await w.emitSessionEvent(sessionOf(w), eventOf())
      if (n > 0) assertReminder(w, count, n)
      else assert.deepEqual(remindersSince(w, count), [], 'no inject')
    })
  }
  row('TB-DT-01', 8, 'two successful compactions: one reminder each, with the count at that moment', async (t) => {
    const w = await seeded(t)
    let count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, count, 3)
    ok(await w.call(TOOL.update, { id: (await getBoard(w)).tasks[0].id, status: STATUS.done }), TOOL.update)
    count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, count, 2)
  })

  // TB-DT-02: a save and the wake (REQ; DOC §4/§5; Q7, Q24). Conditions: changed, core, notify answer.
  const KIND = Object.freeze({ equal: 'equal', trimmed: 'trimmed', change: 'change' })
  const wakeRows = [
    [1, 'an equal body', KIND.equal, NOTIFY.queued, true, false, false],
    [2, 'a body equal after trimming (padded titles)', KIND.trimmed, NOTIFY.queued, true, false, false],
    [3, 'a changing body, notify queued', KIND.change, NOTIFY.queued, true, true, true],
    [4, 'a changing body, notify held', KIND.change, NOTIFY.held, true, true, true],
    [5, 'a changing body, notify rejects', KIND.change, NOTIFY.reject, true, true, false],
    [6, 'a changing body, core removed', KIND.change, NOTIFY.queued, false, true, false],
  ]
  for (const [part, label, kind, mode, core, changed, notified] of wakeRows) {
    row('TB-DT-02', part, label + ': changed ' + changed + ', notified ' + notified + (changed ? ', the save stands' : ', nothing committed, Fishball not woken'), async (t) => {
      const w = await seeded(t)
      if (!core) await w.removeCore()
      w.notifyMode = mode
      const board = await getBoard(w)
      const count = w.notices.length
      const response = await save(w, postBody(board, (b) => {
        if (kind === KIND.trimmed) return { ...b, tasks: b.tasks.map((x) => ({ ...x, title: FIXTURE.pad(x.title) })) }
        if (kind === KIND.change) return { ...b, tasks: edited(b.tasks, b.tasks[0].id, { status: STATUS.blocked }) }
        return b
      }))
      const revision = board.revision + (changed ? REVISION.step : 0)
      assert.deepEqual([response.status, response.body], [ROUTE.status.ok, { ok: true, revision, changed, notified }])
      const after = await getBoard(w)
      if (changed) assert.deepEqual([after.revision, after.tasks[0].status], [revision, STATUS.blocked], 'the save stands')
      else assert.deepEqual(after, board, 'nothing committed')
      const called = changed && core
      assert.equal(w.notices.length, count + (called ? 1 : 0), called ? 'notify called once' : 'notify not called')
    })
  }
  row('TB-DT-02', 7, 'two changing saves: each its own notify with its own dedupeKey', async (t) => {
    const w = await seeded(t)
    const count = w.notices.length
    await userSave(w, (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { status: STATUS.blocked }) }))
    await userSave(w, (b) => ({ ...b, tasks: edited(b.tasks, b.tasks[0].id, { status: STATUS.inProgress }) }))
    const keys = w.notices.slice(count).map((n) => n.dedupeKey)
    assert.equal(keys.length, 2)
    for (const key of keys) assert.match(String(key), NOTICE.dedupeKey)
    assert.notEqual(keys[0], keys[1], 'unique per save')
  })
  row('TB-DT-02', 8, 'client createdAt/updatedAt are ignored: sending other times alone is no change', async (t) => {
    const w = await seeded(t)
    const board = await getBoard(w)
    const stamp = (item) => ({ ...item, createdAt: FIXTURE.clientTime, updatedAt: FIXTURE.clientTime })
    const response = await save(w, postBody(board, (b) => ({ ...b, tasks: b.tasks.map(stamp), memos: b.memos.map(stamp) })))
    assert.deepEqual([response.status, response.body?.changed], [ROUTE.status.ok, false])
    assert.deepEqual(await getBoard(w), board, 'the stored times are the board\'s')
  })

  // TB-DT-03: one save per change kind gives its line (DOC §5 line forms, Q2-Q4, Q11-Q14, Q20).
  const lineRows = [
    ['add a top-level task', (b) => ({ ...b, tasks: [...b.tasks, newTask(FIXTURE.title(1))] }), () => [NOTICE.addedTask(FIXTURE.title(1))]],
    ['add a subtask under a task', (b, ids) => ({ ...b, tasks: [...b.tasks, newTask(FIXTURE.title(1), { parentId: ids.goal })] }), () => [NOTICE.addedTask(FIXTURE.title(1), FIXTURE.goal)]],
    ['change a title (the old title is quoted)', (b, ids) => ({ ...b, tasks: edited(b.tasks, ids.goal, { title: FIXTURE.renamed }) }), () => [NOTICE.changedTask(FIXTURE.goal, [NOTICE.part.title(FIXTURE.goal, FIXTURE.renamed)])]],
    ['change a note', (b, ids) => ({ ...b, tasks: edited(b.tasks, ids.flights, { note: FIXTURE.note }) }), () => [NOTICE.changedTask(FIXTURE.flights, [NOTICE.part.note(TASK_DEFAULT.note, FIXTURE.note)])]],
    ['change status and progress', (b, ids) => ({ ...b, tasks: edited(b.tasks, ids.flights, { status: STATUS.blocked, progress: FIXTURE.progressMid }) }),
      () => [NOTICE.changedTask(FIXTURE.flights, [NOTICE.part.status(STATUS.todo, STATUS.blocked), NOTICE.part.progress(TASK_DEFAULT.progress, FIXTURE.progressMid)])]],
    ['every part at once, in the order title, note, status, progress, move', (b, ids) => ({ ...b, tasks: edited(b.tasks, ids.hotel, { title: FIXTURE.renamed, note: FIXTURE.note, status: STATUS.done, progress: LIMIT.progress.max, parentId: null }) }),
      () => [NOTICE.changedTask(FIXTURE.hotel, [NOTICE.part.title(FIXTURE.hotel, FIXTURE.renamed), NOTICE.part.note(TASK_DEFAULT.note, FIXTURE.note), NOTICE.part.status(STATUS.todo, STATUS.done), NOTICE.part.progress(TASK_DEFAULT.progress, LIMIT.progress.max), NOTICE.part.movedTop])]],
    ['move a subtask to the top level', (b, ids) => ({ ...b, tasks: edited(b.tasks, ids.hotel, { parentId: null }) }), () => [NOTICE.changedTask(FIXTURE.hotel, [NOTICE.part.movedTop])]],
    ['move a task under a renamed task (the parent\'s new title)', (b, ids) => ({ ...b, tasks: edited(edited(b.tasks, ids.hotel, { parentId: ids.flights }), ids.flights, { title: FIXTURE.renamed }) }),
      () => [NOTICE.changedTask(FIXTURE.flights, [NOTICE.part.title(FIXTURE.flights, FIXTURE.renamed)]), NOTICE.changedTask(FIXTURE.hotel, [NOTICE.part.movedUnder(FIXTURE.renamed)])]],
    ['reorder the kept tasks only', (b) => ({ ...b, tasks: [b.tasks[0], b.tasks[2], b.tasks[1]] }), () => [NOTICE.reorderedTasks]],
    ['delete a memo', (b) => ({ ...b, memos: [] }), () => [NOTICE.deletedMemo(FIXTURE.passport)]],
    ['change a memo', (b) => ({ ...b, memos: [{ ...b.memos[0], text: FIXTURE.visa }] }), () => [NOTICE.changedMemo(FIXTURE.passport, FIXTURE.visa)]],
    ['add a memo', (b) => ({ ...b, memos: [...b.memos, newMemo(FIXTURE.visa)] }), () => [NOTICE.addedMemo(FIXTURE.visa)]],
    ['reorder the memos only', (b) => ({ ...b, memos: [b.memos[1], b.memos[0]] }), () => [NOTICE.reorderedMemos], true],
    ['every kind at once: deleted tasks first, then added/changed in the new board order, then the memos alike', (b, ids) => ({
      ...b,
      tasks: [newTask(FIXTURE.title(1)), ...edited(b.tasks, ids.goal, { progress: FIXTURE.progressLate }).filter((x) => x.id !== ids.hotel)],
      memos: [newMemo(FIXTURE.visa)],
    }), () => [NOTICE.deletedTask(FIXTURE.hotel), NOTICE.addedTask(FIXTURE.title(1)), NOTICE.changedTask(FIXTURE.goal, [NOTICE.part.progress(TASK_DEFAULT.progress, FIXTURE.progressLate)]), NOTICE.deletedMemo(FIXTURE.passport), NOTICE.addedMemo(FIXTURE.visa)]],
  ]
  lineRows.forEach(([label, edit, lines, twoMemos], index) => {
    row('TB-DT-03', index + 1, 'the user saves: ' + label + '; the notice lists exactly that', async (t) => {
      const w = await seeded(t)
      if (twoMemos) ok(await w.call(TOOL.memo, { text: FIXTURE.visa }), TOOL.memo)
      const board = await getBoard(w)
      const ids = { goal: byTitle(board, FIXTURE.goal).id, flights: byTitle(board, FIXTURE.flights).id, hotel: byTitle(board, FIXTURE.hotel).id }
      const count = w.notices.length
      const { response } = await userSave(w, (b) => edit(b, ids))
      assert.equal(response.changed, true)
      assertNotice(w, count, response.revision, lines())
    })
  })

  // TB-DT-04: taskboard_memo's forms (DOC §3, Q16; provisional: PENDING (memo)).
  // Outcome markers are Symbols: a refusal's field (e.g. 'delete') must never read as a success outcome.
  const MEMO = Object.freeze({ add: Symbol('add'), replace: Symbol('replace'), delete: Symbol('delete') })
  const memoForms = [
    [1, 'no id and a text: add', () => ({ text: FIXTURE.visa }), MEMO.add],
    [2, 'id + text: replace the text', (id) => ({ id, text: FIXTURE.visa }), MEMO.replace],
    [3, 'id + delete: true: delete', (id) => ({ id, delete: true }), MEMO.delete],
    [4, 'id alone: invalid-input, field text', (id) => ({ id }), FIELD.text],
    [5, 'id + text + delete: true: invalid-input, field delete', (id) => ({ id, text: FIXTURE.visa, delete: true }), FIELD.delete],
    [6, 'delete: true without id: invalid-input, field delete', () => ({ delete: true }), FIELD.delete],
    [7, 'id + delete: false: invalid-input, field delete', (id) => ({ id, delete: false }), FIELD.delete],
  ]
  for (const [part, label, args, outcome] of memoForms) {
    row('TB-DT-04', part, 'taskboard_memo with ' + label + ' (' + PENDING.memo + ')', async (t) => {
      const w = await seeded(t)
      const before = await getBoard(w)
      const id = before.memos[0].id
      if (!Object.values(MEMO).includes(outcome)) {
        refused(await unchanged(w, () => w.call(TOOL.memo, args(id))), CODE.invalidInput, outcome)
        return
      }
      const result = ok(await w.call(TOOL.memo, args(id)), TOOL.memo)
      assert.equal(result.revision, before.revision + REVISION.step)
      const memos = (await getBoard(w)).memos
      if (outcome === MEMO.delete) {
        assert.deepEqual([result.deleted, memos], [id, []])
        return
      }
      assert.deepEqual(sortedKeys(result.memo), MEMO_KEYS)
      assert.equal(result.memo.text, FIXTURE.visa)
      if (outcome === MEMO.add) {
        assert.match(result.memo.id, ID.memo)
        assert.deepEqual(memos.map((m) => m.text), [FIXTURE.passport, FIXTURE.visa])
      } else {
        assert.equal(result.memo.id, id)
        assert.deepEqual(memos.map((m) => m.text), [FIXTURE.visa])
      }
    })
  }

  // TB-DT-05: taskboard_add's whole-call atomicity (DOC §3: one invalid item refuses the whole call).
  const atomicRows = [
    [1, 'a deep subtask with progress 101', { tasks: [{ title: FIXTURE.goal, subtasks: [{ title: FIXTURE.flights }, { title: FIXTURE.hotel, progress: LIMIT.progress.max + 1 }] }] }, CODE.invalidInput, FIELD.nested([0, 1], FIELD.progress)],
    [2, 'the second top-level item with an empty title', { tasks: [{ title: FIXTURE.goal }, { title: '' }] }, CODE.invalidInput, FIELD.nested([1], FIELD.title)],
    [3, 'a valid first item and a second over the depth', { tasks: [{ title: FIXTURE.goal }, chain(LIMIT.depth + 1)] }, CODE.limitReached, FIELD.depth],
    [4, 'no items (tasks: [])', { tasks: [] }, CODE.invalidInput, FIELD.tasks],
  ]
  for (const [part, label, args, code, field] of atomicRows) {
    row('TB-DT-05', part, 'taskboard_add with ' + label + ': ' + code + ' ' + field + '; no task is created, the revision is kept', async (t) => {
      const w = await seeded(t)
      refused(await unchanged(w, () => w.call(TOOL.add, args)), code, field)
    })
  }
  row('TB-DT-05', 5, 'a valid nested call is one write: created lists every task depth-first in item order, appended at the end of the board', async (t) => {
    const w = await seeded(t)
    const before = await getBoard(w)
    const tree = [{ ...leaf(1), subtasks: [{ ...leaf(2), subtasks: [leaf(3)] }, leaf(4)] }, leaf(5)]
    const result = ok(await w.call(TOOL.add, { tasks: tree }), TOOL.add)
    assert.equal(result.revision, before.revision + REVISION.step, 'one committed change')
    assert.deepEqual(result.created.map((c) => c.title), [1, 2, 3, 4, 5].map(FIXTURE.title))
    const [a, b] = result.created
    assert.deepEqual(result.created.map((x) => x.parentId), [null, a.id, b.id, a.id, null])
    const after = await getBoard(w)
    assert.deepEqual(after.tasks.map((x) => x.id), [...before.tasks.map((x) => x.id), ...result.created.map((x) => x.id)], 'appended in that order (Q22)')
  })

  // ==============================================================================================
  // State Transitions

  // TB-ST-01 (system): a task's life across restarts, by Fishball and the user.
  row('TB-ST-01', 'system', 'todo, in_progress, blocked (Fishball); restart; done (user); reopened todo (Fishball); a sibling dropped (user); restart; reminder; goal deleted by the user; no reminder', async (t) => {
    const w = await worldFor(t)
    const [goal, flights, hotel] = (await add(w, [{ title: FIXTURE.goal, subtasks: [{ title: FIXTURE.flights }, { title: FIXTURE.hotel }] }])).map((c) => c.id)
    let revision = REVISION.initial + REVISION.step
    const expectState = async (status, unfinished) => {
      const board = await getBoard(w)
      assert.deepEqual([board.revision, board.tasks.find((x) => x.id === flights)?.status, board.unfinished], [revision, status, unfinished])
    }
    const fishball = async (args) => { ok(await w.call(TOOL.update, args), TOOL.update); revision += REVISION.step }
    const user = async (edit, lines) => {
      const count = w.notices.length
      const result = await userSave(w, edit)
      revision += REVISION.step
      assertNotice(w, count, result.response.revision, lines)
      return result
    }
    await expectState(STATUS.todo, 3)
    await fishball({ id: flights, status: STATUS.inProgress, progress: FIXTURE.progressMid })
    await expectState(STATUS.inProgress, 3)
    await fishball({ id: flights, status: STATUS.blocked })
    await expectState(STATUS.blocked, 3)
    await w.restart()
    await expectState(STATUS.blocked, 3)
    await user((b) => ({ ...b, tasks: edited(b.tasks, flights, { status: STATUS.done, progress: LIMIT.progress.max }) }),
      [NOTICE.changedTask(FIXTURE.flights, [NOTICE.part.status(STATUS.blocked, STATUS.done), NOTICE.part.progress(FIXTURE.progressMid, LIMIT.progress.max)])])
    await expectState(STATUS.done, 2)
    await fishball({ id: flights, status: STATUS.todo })
    await expectState(STATUS.todo, 3)
    await user((b) => ({ ...b, tasks: edited(b.tasks, hotel, { status: STATUS.dropped }) }), [NOTICE.changedTask(FIXTURE.hotel, [NOTICE.part.status(STATUS.todo, STATUS.dropped)])])
    await w.restart()
    await expectState(STATUS.todo, 2)
    let injects = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, injects, 2)
    const gone = await user((b) => ({ ...b, tasks: b.tasks.filter((x) => x.id !== goal && x.parentId !== goal) }), [NOTICE.deletedTask(FIXTURE.goal, 2)])
    assert.deepEqual(gone.board, { revision, unfinished: 0, tasks: [], memos: [] })
    injects = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assert.deepEqual(remindersSince(w, injects), [], 'no reminder for an empty board')
  })

  // TB-ST-02: the revision (DOC §2/§3): +1 per committed change, kept by a no-op or a refusal.
  row('TB-ST-02', 1, 'an update that changes nothing (same status, same progress, same title and note, the title padded) keeps the revision; a refusal keeps it; a change adds 1', async (t) => {
    const w = await seeded(t)
    const board = await getBoard(w)
    const task = board.tasks[0]
    for (const args of [{ id: task.id, status: task.status }, { id: task.id, progress: task.progress }, { id: task.id, title: task.title, note: task.note }, { id: task.id, title: FIXTURE.pad(task.title) }]) {
      assert.equal(ok(await w.call(TOOL.update, args), TOOL.update).revision, board.revision, 'no-op ' + json(args))
    }
    assert.deepEqual(await getBoard(w), board, 'nothing committed (updatedAt untouched)')
    refused(await w.call(TOOL.update, { id: task.id, progress: LIMIT.progress.max + 1 }), CODE.invalidInput, FIELD.progress)
    assert.equal((await getBoard(w)).revision, board.revision)
    assert.equal(ok(await w.call(TOOL.update, { id: task.id, status: STATUS.blocked }), TOOL.update).revision, board.revision + REVISION.step)
  })

  // TB-ST-03: the user's stale draft (DOC §4).
  row('TB-ST-03', 1, 'a draft at revision r; Fishball commits r+1; saving the draft is 409 stale (revision r+1), the board unchanged; after a reload the save commits r+2', async (t) => {
    const w = await seeded(t)
    const draftBase = await getBoard(w)
    ok(await w.call(TOOL.update, { id: draftBase.tasks[0].id, status: STATUS.inProgress }), TOOL.update)
    const count = w.notices.length
    const addVisa = (b) => ({ ...b, memos: [...b.memos, newMemo(FIXTURE.visa)] })
    const stale = await unchanged(w, () => save(w, postBody(draftBase, addVisa)))
    assert.deepEqual([stale.status, stale.body], [ROUTE.status.conflict, { ok: false, code: CODE.stale, revision: draftBase.revision + REVISION.step }])
    assert.equal(w.notices.length, count)
    const { response } = await userSave(w, addVisa)
    assert.equal(response.revision, draftBase.revision + 2 * REVISION.step)
  })

  // TB-ST-04: the X2 binding's life: core arrives, leaves, the row is removed (DOC §6/§7, SURFACE).
  row('TB-ST-04', 1, 'core absent: no tools; core arrives: tools and reminders; core leaves: tools withdrawn, no reminder; core again: both back', async (t) => {
    const w = await worldFor(t, { core: false })
    assert.deepEqual(w.toolNames(), [])
    await w.addCore()
    assert.deepEqual(w.toolNames(), Object.values(TOOL).sort(), 'followed through internal/service')
    await add(w, [{ title: FIXTURE.goal }])
    let count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, count, 1)
    await w.removeCore()
    assert.deepEqual(w.toolNames(), [], 'tools withdrawn with the X2 registration')
    count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assert.deepEqual(remindersSince(w, count), [], 'no reminder after the registration is gone')
    await w.addCore()
    assert.deepEqual(w.toolNames(), Object.values(TOOL).sort())
    count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assertReminder(w, count, 1)
  })
  row('TB-ST-04', 2, 'the row is removed: tools withdrawn, no more reminders', async (t) => {
    const w = await seeded(t)
    await w.removeRow()
    assert.deepEqual(w.toolNames(), [])
    const count = w.injects.length
    await w.emitSessionEvent(w.session, compactionEnd())
    assert.deepEqual(remindersSince(w, count), [])
  })

  // TB-ST-05: the SSE stream (DOC §4): one frame at once, then one per committed change.
  row('TB-ST-05', 1, 'events: the first frame is the GET body; a tool change and a user save each send one frame; a no-op save and a refused call send none', async (t) => {
    const w = await seeded(t)
    const stream = await w.events(t)
    const first = await stream.next()
    assert.deepEqual(first, await getBoard(w), 'one frame at once, equal to GET')
    assert.deepEqual(sortedKeys(first), BOARD_KEYS)
    ok(await w.call(TOOL.update, { id: first.tasks[0].id, status: STATUS.blocked }), TOOL.update)
    const second = await stream.next()
    assert.deepEqual(second, await getBoard(w), 'a frame for the tool change')
    assert.equal(second.revision, first.revision + REVISION.step)
    await userSave(w, (b) => ({ ...b, memos: [...b.memos, newMemo(FIXTURE.visa)] }))
    const third = await stream.next()
    assert.deepEqual(third, await getBoard(w), 'a frame for the user save')
    assert.equal(third.revision, second.revision + REVISION.step)
    await save(w, postBody(third))
    refused(await w.call(TOOL.update, { id: FIXTURE.taskId(), status: STATUS.done }), CODE.notFound)
    assert.equal(await stream.next(WAIT.quietMs), undefined, 'no frame without a committed change')
  })
}
