/**
 * The board's pure rules (docs/plugins/fishball-taskboard.md §2–§4): field bounds, the task tree,
 * and the four changes (Fishball's add / update / memo, the user's whole-board save). Each takes the
 * current board and returns the next one, or the same object when nothing changes, so the store
 * commits nothing for a no-op. A refusal throws `{code, field?}`; nothing here touches storage, a
 * clock or randomness: `at` (epoch ms) and `newId(prefix)` come from the caller.
 *
 * Tasks are not linked to sessions (the user's requirement): no field names a session or an event.
 */
import { CODE, ID, LIMITS, OPEN_STATUSES, STATUS, STORE, TASK_DEFAULTS } from './constants.js'

const FIELD = Object.freeze({
  task: Object.freeze(['id', 'parentId', 'title', 'note', 'status', 'progress', 'createdAt', 'updatedAt']),
  memo: Object.freeze(['id', 'text', 'createdAt', 'updatedAt']),
  document: Object.freeze(['revision', 'tasks', 'memos']),
  /** Fishball's new-task item (taskboard_add). */
  addItem: Object.freeze(['title', 'note', 'status', 'progress', 'subtasks']),
  addArgs: Object.freeze(['tasks', 'parentId']),
  update: Object.freeze(['title', 'note', 'status', 'progress']),
  updateArgs: Object.freeze(['id', 'title', 'note', 'status', 'progress']),
  memoArgs: Object.freeze(['id', 'text', 'delete']),
  save: Object.freeze(['baseRevision', 'tasks', 'memos']),
  /** The fields a user save may change; the server owns the two times. */
  editable: Object.freeze(['parentId', 'title', 'note', 'status', 'progress']),
})

export const emptyBoard = () => ({ revision: STORE.emptyRevision, tasks: [], memos: [] })

export const refusal = (code, field, cause) => Object.assign(new Error(code, { cause }), { code, ...(field === undefined ? {} : { field }) })
const refuse = (code, field) => { throw refusal(code, field) }

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const onlyKeys = (record, keys, field) => {
  const extra = Object.keys(record).find((key) => !keys.includes(key))
  if (extra !== undefined) refuse(CODE.invalidInput, field ? field + '.' + extra : extra)
}
// Bounds count Unicode code points, as the board's do (board R1), not UTF-16 units.
export const codePoints = (text) => [...text].length

function text(value, bounds, field) {
  if (typeof value !== 'string') refuse(CODE.invalidInput, field)
  const trimmed = value.trim()
  const length = codePoints(trimmed)
  if (length < bounds.min || length > bounds.max) refuse(CODE.invalidInput, field)
  return trimmed
}
function status(value, field) {
  if (!Object.values(STATUS).includes(value)) refuse(CODE.invalidInput, field)
  return value
}
function progress(value, field) {
  if (!Number.isInteger(value) || value < LIMITS.progress.min || value > LIMITS.progress.max) refuse(CODE.invalidInput, field)
  return value
}
/** The validators of a task's editable fields, by name. */
const TASK_FIELD = Object.freeze({
  title: (value, field) => text(value, LIMITS.titleChars, field),
  note: (value, field) => text(value, LIMITS.noteChars, field),
  status,
  progress,
})

export const isUnfinished = (task) => OPEN_STATUSES.includes(task.status)
export const unfinishedCount = (board) => board.tasks.filter(isUnfinished).length
/** What Fishball's read and the UI's routes show: the document plus its unfinished count (§3, §4). */
export const viewOf = (board) => ({ revision: board.revision, unfinished: unfinishedCount(board), tasks: board.tasks, memos: board.memos })
/** A refusal as the tools and routes answer it; anything uncoded is a storage failure. */
export function refusalValue(error) {
  const code = Object.values(CODE).includes(error?.code) ? error.code : CODE.unavailable
  return { ok: false, code, ...(error?.field === undefined ? {} : { field: error.field }) }
}
/** The path of one list item in a refusal's `field` (`tasks[0]`), the form the doc names. */
const itemPath = (field, index) => field + '[' + index + ']'

/** The depth of `id` (top level 1) in `tasks`; a parent cycle or a missing parent refuses at `field`. */
function depthOf(tasks, id, field) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const seen = new Set()
  for (let current = id; current !== null;) {
    const task = byId.get(current)
    if (task === undefined || seen.has(current)) refuse(CODE.invalidInput, field)
    seen.add(current)
    current = task.parentId
  }
  return seen.size
}

function checkCounts(board) {
  if (board.tasks.length > LIMITS.tasks) refuse(CODE.limitReached, 'tasks')
  if (board.memos.length > LIMITS.memos) refuse(CODE.limitReached, 'memos')
}

/** Every task id under `id` (not itself), in board order. */
export function descendantsOf(tasks, id) {
  const found = []
  const walk = (parent) => { for (const task of tasks) if (task.parentId === parent) { found.push(task.id); walk(task.id) } }
  walk(id)
  return found
}

const isTime = (value) => Number.isSafeInteger(value)
/** One stored item's shape: exactly `keys`, a unique string id, the two times, and `fields`' types. */
function assertItem(item, keys, ids, fields) {
  if (!isRecord(item) || typeof item.id !== 'string' || ids.has(item.id) || !isTime(item.createdAt) || !isTime(item.updatedAt) ||
      Object.keys(item).length !== keys.length || !keys.every((key) => Object.hasOwn(item, key)) || !fields(item)) refuse(CODE.unavailable)
  ids.add(item.id)
}

/**
 * Storage's read check (the domain calls it when it opens): a stored board that is not one this
 * module could have written fails the open loudly instead of being trusted. It checks structure
 * only (types, unique ids, parents that exist, no cycle), never the LIMITS: those bound writes, and a
 * later, smaller limit must not make an existing board unreadable, which would take the user's
 * routes down with it.
 */
export function assertDocument(value) {
  if (!isRecord(value) || !isTime(value.revision) || value.revision < STORE.emptyRevision ||
      !Array.isArray(value.tasks) || !Array.isArray(value.memos)) refuse(CODE.unavailable)
  try { onlyKeys(value, FIELD.document) } catch { refuse(CODE.unavailable) }
  const taskIds = new Set()
  for (const task of value.tasks) {
    assertItem(task, FIELD.task, taskIds, (item) => (item.parentId === null || typeof item.parentId === 'string') &&
      typeof item.title === 'string' && typeof item.note === 'string' && Object.values(STATUS).includes(item.status) && Number.isInteger(item.progress))
  }
  try { for (const task of value.tasks) depthOf(value.tasks, task.id) } catch { refuse(CODE.unavailable) }
  const memoIds = new Set()
  for (const memo of value.memos) assertItem(memo, FIELD.memo, memoIds, (item) => typeof item.text === 'string')
  return value
}

const revised = (board, change) => ({ ...board, ...change, revision: board.revision + 1 })

/**
 * taskboard_add: `args.tasks` (1+ items, each with optional `subtasks`, recursively) under
 * `args.parentId` or at the top level, appended in depth-first item order. The whole call is one
 * change: any invalid item refuses it.
 * @returns {{board, created: {id, parentId, title}[]}}
 */
export function addTasks(board, args, at, newId) {
  if (!isRecord(args)) refuse(CODE.invalidInput)
  onlyKeys(args, FIELD.addArgs)
  const parentId = args.parentId ?? null
  if (parentId !== null && typeof parentId !== 'string') refuse(CODE.invalidInput, 'parentId')
  if (parentId !== null && !board.tasks.some((task) => task.id === parentId)) refuse(CODE.notFound, 'parentId')
  const added = []
  const build = (items, parent, depth, field) => {
    if (!Array.isArray(items) || items.length === 0) refuse(CODE.invalidInput, field)
    items.forEach((item, index) => {
      const at_ = itemPath(field, index)
      if (!isRecord(item)) refuse(CODE.invalidInput, at_)
      onlyKeys(item, FIELD.addItem, at_)
      if (depth > LIMITS.depth) refuse(CODE.limitReached, 'depth')
      // An explicit `undefined` (a field the model left empty) reads as omitted, not as a value.
      const given = Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))
      const fields = { ...TASK_DEFAULTS, ...given }
      const task = { id: newId(ID.task), parentId: parent, createdAt: at, updatedAt: at }
      for (const [name, check] of Object.entries(TASK_FIELD)) task[name] = check(fields[name], at_ + '.' + name)
      added.push(task)
      if (item.subtasks !== undefined) build(item.subtasks, task.id, depth + 1, at_ + '.subtasks')
    })
  }
  build(args.tasks, parentId, parentId === null ? 1 : depthOf(board.tasks, parentId) + 1, 'tasks')
  const next = revised(board, { tasks: [...board.tasks, ...added] })
  checkCounts(next)
  return { board: next, created: added.map(({ id, parentId: parent, title }) => ({ id, parentId: parent, title })) }
}

/** taskboard_update: one task's title / note / status / progress. Restating every value is a no-op. */
export function updateTask(board, args, at) {
  if (!isRecord(args)) refuse(CODE.invalidInput)
  onlyKeys(args, FIELD.updateArgs)
  if (typeof args.id !== 'string') refuse(CODE.invalidInput, 'id')
  const names = FIELD.update.filter((name) => Object.hasOwn(args, name))
  if (names.length === 0) refuse(CODE.invalidInput, FIELD.update.join('|'))
  const changes = Object.fromEntries(names.map((name) => [name, TASK_FIELD[name](args[name], name)]))
  const index = board.tasks.findIndex((task) => task.id === args.id)
  if (index < 0) refuse(CODE.notFound, 'id')
  const previous = board.tasks[index]
  if (names.every((name) => previous[name] === changes[name])) return { board, task: previous }
  const task = { ...previous, ...changes, updatedAt: at }
  return { board: revised(board, { tasks: board.tasks.with(index, task) }), task }
}

/** taskboard_memo: add (no id), replace the text (id + text) or delete (id + delete: true). */
export function changeMemo(board, args, at, newId) {
  if (!isRecord(args)) refuse(CODE.invalidInput)
  onlyKeys(args, FIELD.memoArgs)
  if (args.id === undefined) {
    if (args.delete !== undefined) refuse(CODE.invalidInput, 'delete')
    const memo = { id: newId(ID.memo), text: text(args.text, LIMITS.memoChars, 'text'), createdAt: at, updatedAt: at }
    const next = revised(board, { memos: [...board.memos, memo] })
    checkCounts(next)
    return { board: next, memo }
  }
  if (typeof args.id !== 'string') refuse(CODE.invalidInput, 'id')
  const deleting = args.delete !== undefined
  if (deleting ? args.delete !== true || args.text !== undefined : args.text === undefined) refuse(CODE.invalidInput, deleting ? 'delete' : 'text')
  const replacement = deleting ? undefined : text(args.text, LIMITS.memoChars, 'text')
  const index = board.memos.findIndex((memo) => memo.id === args.id)
  if (index < 0) refuse(CODE.notFound, 'id')
  if (deleting) return { board: revised(board, { memos: board.memos.toSpliced(index, 1) }), deleted: args.id }
  const previous = board.memos[index]
  if (previous.text === replacement) return { board, memo: previous }
  const memo = { ...previous, text: replacement, updatedAt: at }
  return { board: revised(board, { memos: board.memos.with(index, memo) }), memo }
}

const validId = (value, prefix) => typeof value === 'string' && value.startsWith(prefix) && ID.uuid.test(value.slice(prefix.length))

/**
 * One list of a user save: each item complete, ids unique; a known id keeps its createdAt (and its
 * updatedAt when unchanged); an unknown one is new and must be a well-formed id.
 */
function savedItems(items, previous, { field, keys, prefix, check, editable }, at) {
  if (!Array.isArray(items)) refuse(CODE.invalidInput, field)
  const before = new Map(previous.map((item) => [item.id, item]))
  const ids = new Set()
  return items.map((item, index) => {
    const at_ = itemPath(field, index)
    if (!isRecord(item)) refuse(CODE.invalidInput, at_)
    onlyKeys(item, keys, at_)
    const old = before.get(item.id)
    if (ids.has(item.id) || (!old && !validId(item.id, prefix))) refuse(CODE.invalidInput, at_ + '.id')
    ids.add(item.id)
    const values = check(item, at_)
    if (old && editable.every((name) => old[name] === values[name])) return old
    return { id: item.id, ...values, createdAt: old?.createdAt ?? at, updatedAt: at }
  })
}

const TASK_LIST = Object.freeze({
  field: 'tasks', keys: FIELD.task, prefix: ID.task, editable: FIELD.editable,
  check: (item, field) => {
    if (!(item.parentId === null || typeof item.parentId === 'string')) refuse(CODE.invalidInput, field + '.parentId')
    return { parentId: item.parentId, ...Object.fromEntries(Object.entries(TASK_FIELD).map(([name, check]) => [name, check(item[name], field + '.' + name)])) }
  },
})
const MEMO_LIST = Object.freeze({
  field: 'memos', keys: FIELD.memo, prefix: ID.memo, editable: Object.freeze(['text']),
  check: (item, field) => ({ text: text(item.text, LIMITS.memoChars, field + '.text') }),
})

const sameList = (left, right) => left.length === right.length && left.every((item, index) => item === right[index])

/**
 * The user's save from the UI: `{baseRevision, tasks, memos}`, the complete wanted board (§4). A
 * current id the body leaves out is deleted; deleting a parent without its subtasks is not possible,
 * because a kept subtask's parentId must name a task of the body. A save against another revision
 * refuses `stale`, so the user never overwrites a change of Fishball's they have not seen.
 */
export function saveBoard(board, body, at) {
  if (!isRecord(body)) refuse(CODE.invalidInput)
  onlyKeys(body, FIELD.save)
  if (!Number.isSafeInteger(body.baseRevision)) refuse(CODE.invalidInput, 'baseRevision')
  if (body.baseRevision !== board.revision) refuse(CODE.stale)
  const tasks = savedItems(body.tasks, board.tasks, TASK_LIST, at)
  const memos = savedItems(body.memos, board.memos, MEMO_LIST, at)
  tasks.forEach((task, index) => {
    const parentField = itemPath(TASK_LIST.field, index) + '.parentId'
    if (task.parentId === task.id || (task.parentId !== null && !tasks.some((other) => other.id === task.parentId))) refuse(CODE.invalidInput, parentField)
    if (depthOf(tasks, task.id, parentField) > LIMITS.depth) refuse(CODE.limitReached, 'depth')
  })
  const next = { revision: board.revision, tasks, memos }
  checkCounts(next)
  return sameList(tasks, board.tasks) && sameList(memos, board.memos) ? board : revised(board, { tasks, memos })
}
