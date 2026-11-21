/**
 * The message that wakes Fishball after the user saves an edit (docs/plugins/fishball-taskboard.md
 * §5): a heading line, one line per change between the board before and after, and a closing hint.
 * Pure: it compares two boards and writes text, nothing else.
 */
import { MESSAGE } from './constants.js'
import { descendantsOf } from './board.js'

const TEXT = Object.freeze({
  heading: (revision) => `The user edited your task board in the UI (revision ${revision}):`,
  closing: 'Call taskboard_read for the whole board.',
  addedTask: (title, parent) => `- added task ${title}${parent === undefined ? '' : ` under ${parent}`}`,
  deletedTask: (title, subtasks) => `- deleted task ${title}${subtasks ? ` and its ${subtasks} subtask${subtasks === 1 ? '' : 's'}` : ''}`,
  changedTask: (title, parts) => `- changed task ${title}: ${parts.join('; ')}`,
  field: (name, from, to) => `${name} ${from} → ${to}`,
  moved: (parent) => parent === undefined ? 'moved to the top level' : `moved under ${parent}`,
  percent: (value) => `${value}%`,
  addedMemo: (text) => `- added memo ${text}`,
  deletedMemo: (text) => `- deleted memo ${text}`,
  changedMemo: (from, to) => `- changed memo ${from} → ${to}`,
  reorderedTasks: '- reordered the tasks',
  reorderedMemos: '- reordered the memos',
  more: (count) => `- …and ${count} more change${count === 1 ? '' : 's'}`,
  /** A field name as the user reads it. */
  names: Object.freeze({ title: 'title', note: 'note', status: 'status', progress: 'progress' }),
})

/** A quoted text, cut to MESSAGE.quoteChars code points: it is the user's text, framed as data. */
function quote(text) {
  const points = [...text]
  const cut = points.length > MESSAGE.quoteChars ? points.slice(0, MESSAGE.quoteChars).join('') + MESSAGE.ellipsis : text
  return JSON.stringify(cut)
}
/** How each changed task field is shown; a note is quoted, progress is a percentage. */
const SHOW = Object.freeze({ title: quote, note: quote, status: String, progress: TEXT.percent })

const byId = (items) => new Map(items.map((item) => [item.id, item]))
const sameOrder = (before, after) => {
  const kept = after.filter((item) => before.has(item.id)).map((item) => item.id)
  const old = [...before.keys()].filter((id) => kept.includes(id))
  return kept.every((id, index) => id === old[index])
}

function taskLines(before, after) {
  const old = byId(before.tasks)
  const now = byId(after.tasks)
  const titleOf = (id, board) => (id === null ? undefined : quote(board.get(id).title))
  const lines = []
  // A deleted parent reports its deleted subtasks in its own line, so they are not listed again.
  const reported = new Set()
  for (const task of before.tasks) {
    if (now.has(task.id) || reported.has(task.id)) continue
    const gone = descendantsOf(before.tasks, task.id).filter((id) => !now.has(id))
    gone.forEach((id) => reported.add(id))
    lines.push(TEXT.deletedTask(quote(task.title), gone.length))
  }
  for (const task of after.tasks) {
    const previous = old.get(task.id)
    if (!previous) { lines.push(TEXT.addedTask(quote(task.title), titleOf(task.parentId, now))); continue }
    const parts = Object.keys(SHOW).filter((name) => previous[name] !== task[name])
      .map((name) => TEXT.field(TEXT.names[name], SHOW[name](previous[name]), SHOW[name](task[name])))
    if (previous.parentId !== task.parentId) parts.push(TEXT.moved(titleOf(task.parentId, now)))
    if (parts.length) lines.push(TEXT.changedTask(quote(previous.title), parts))
  }
  if (!sameOrder(old, after.tasks)) lines.push(TEXT.reorderedTasks)
  return lines
}

function memoLines(before, after) {
  const old = byId(before.memos)
  const now = byId(after.memos)
  const lines = before.memos.filter((memo) => !now.has(memo.id)).map((memo) => TEXT.deletedMemo(quote(memo.text)))
  for (const memo of after.memos) {
    const previous = old.get(memo.id)
    if (!previous) lines.push(TEXT.addedMemo(quote(memo.text)))
    else if (previous.text !== memo.text) lines.push(TEXT.changedMemo(quote(previous.text), quote(memo.text)))
  }
  if (!sameOrder(old, after.memos)) lines.push(TEXT.reorderedMemos)
  return lines
}

/**
 * @param before - the board the save replaced.
 * @param after - the committed board.
 * @returns {string} the text of the wake message.
 */
export function describeUserEdit(before, after) {
  const changes = [...taskLines(before, after), ...memoLines(before, after)]
  const shown = changes.length > MESSAGE.maxLines ? [...changes.slice(0, MESSAGE.maxLines), TEXT.more(changes.length - MESSAGE.maxLines)] : changes
  return [TEXT.heading(after.revision), ...shown, TEXT.closing].join('\n')
}

