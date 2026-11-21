/**
 * Fishball's taskboard tools (docs/plugins/fishball-taskboard.md §3), registered only in the
 * manager's scope through X2, and checked again at run time against X1 `manager.sessionId()` (the
 * board's guard rule, board/src/board.js `createBoardGuard`): a tool that leaked into another scope
 * still refuses `not-manager` before touching the store. A refusal is the returned value
 * `{ok: false, code, field?}`; the tools never throw.
 */
import { randomUUID } from 'node:crypto'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { CODE, LIMITS, OPEN_STATUSES, STATUS, TOOL } from './constants.js'
import { addTasks, changeMemo, refusal, refusalValue, updateTask, viewOf } from './board.js'

const statuses = Object.values(STATUS).join(' | ')
const TEXT = Object.freeze({
  read: `Read your task board: every task (a tree by parentId) and every memo. Tasks are your own notes of work, not tied to any session; unfinished means ${OPEN_STATUSES.join(', ')}. The user can view and edit this board at any time; you are told when they save a change.`,
  add: `Add tasks to your task board. To break a goal into subtasks, pass the goal's id as parentId and the subtasks as tasks; each item may hold its own subtasks (at most ${LIMITS.depth} levels in all). One invalid item refuses the whole call and adds nothing.`,
  tasks: `1 or more items {title, note?, status?, progress?, subtasks?}: title 1–${LIMITS.titleChars.max} characters, note up to ${LIMITS.noteChars.max}, status ${statuses} (default todo), progress a whole number ${LIMITS.progress.min}–${LIMITS.progress.max} (default ${LIMITS.progress.min}).`,
  parentId: 'Optional: the id of an existing task to add these under; omit for the top level.',
  update: "Update one task's title, note, status or progress. Give the id and at least one field. Status and progress are independent; you cannot delete a task (set dropped), only the user can.",
  id: 'The task id (t_…).',
  required: 'Required. ',
  title: `1–${LIMITS.titleChars.max} characters.`,
  note: `Up to ${LIMITS.noteChars.max} characters; replaces the note.`,
  status: statuses + '.',
  progress: `A whole number ${LIMITS.progress.min}–${LIMITS.progress.max} (percent).`,
  memo: `Your memo pad: without id, add a memo (text); with id and text, replace that memo's text; with id and delete: true, delete it. Text 1–${LIMITS.memoChars.max} characters.`,
  memoId: 'The memo id (m_…); omit to add a memo.',
  memoText: 'The memo text.',
  memoDelete: 'true: delete the memo with this id.',
})

// defineTool rejects schema violations (a missing `required` property included) before execute with
// its own ToolArgsError, not this tool's typed refusal (board/src/board.js, same reason). So no field
// is marked required and each is typed `json`: the board rules check them and refuse
// `invalid-input` with the field that failed. Arguments that are not a JSON object at all are still
// refused by defineTool itself (both SDKs); the doc says so.
const FIELD = (description) => ({ type: 'json', description })
const JSON_OUTPUT = Object.freeze({ type: 'json' })
const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
const newId = (prefix) => prefix + randomUUID()

/**
 * @param {{store: object, sessionId: () => string | undefined, now?: () => number}} options
 *   `store` the row's one store (store.js); `sessionId` X1; `now` epoch milliseconds.
 * @returns {object[]} registry-ready definitions for `agentCtx.tools.register`.
 */
export function createTools({ store, sessionId, now = Date.now }) {
  const guarded = (work) => async (args, exec) => {
    const manager = sessionId()
    if (typeof manager !== 'string' || manager === '' || String(exec?.agent?.session?.id) !== manager) return { ok: false, code: CODE.notManager }
    try { return await work(args ?? {}) } catch (error) { return refusalValue(error) }
  }
  /** One change through the store; the value is `{ok, revision, ...result}`. */
  const changing = (rule) => guarded(async (args) => {
    const { after, result } = await store.change((board) => rule(board, args, now(), newId))
    return { ok: true, revision: after.revision, ...result }
  })
  const tool = (name, description, parameters, execute) => defineTool({ name, description, parameters, output: { schema: JSON_OUTPUT, render }, execute })
  return [
    tool(TOOL.read, TEXT.read, {}, guarded(async (args) => {
      if (Object.keys(args).length) throw refusal(CODE.invalidInput, Object.keys(args)[0])
      return { ok: true, ...viewOf(store.read()) }
    })),
    tool(TOOL.add, TEXT.add, { tasks: FIELD(TEXT.required + TEXT.tasks), parentId: FIELD(TEXT.parentId) }, changing(addTasks)),
    tool(TOOL.update, TEXT.update, {
      id: FIELD(TEXT.required + TEXT.id), title: FIELD(TEXT.title), note: FIELD(TEXT.note), status: FIELD(TEXT.status), progress: FIELD(TEXT.progress),
    }, changing(updateTask)),
    tool(TOOL.memo, TEXT.memo, { id: FIELD(TEXT.memoId), text: FIELD(TEXT.memoText), delete: FIELD(TEXT.memoDelete) }, changing(changeMemo)),
  ]
}
