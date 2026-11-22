/**
 * Oracle values of the fishball-taskboard.view rows (USE-CASES.md beside this file). The only source
 * is the view requirements relayed by the lead (2026-11-22, .runtime/repro/VIEW-SPEC.md: B1, V1–V12,
 * E1–E2) and the lead's refinement of V6 (a condensed row is a toggle only when it has details).
 * No file under packages/ was read; every value is the requirement's own word or test data.
 */
import { TASKBOARD } from '../fishball-ui/connections/constants.mjs'

export { TASKBOARD }

/** Statuses, their English labels, and which are open (spec header). */
export const STATUS = Object.freeze({
  todo: 'todo', inProgress: 'in_progress', blocked: 'blocked', done: 'done', dropped: 'dropped',
  /** V1: the chip order. */
  order: Object.freeze(['todo', 'in_progress', 'blocked', 'done', 'dropped']),
  open: Object.freeze(['todo', 'in_progress', 'blocked']),
  closed: Object.freeze(['done', 'dropped']),
  label: Object.freeze({ todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done', dropped: 'Dropped' }),
})

/** The public markup (spec "Public markup"): attribute names and selectors-as-props. */
export const HOOK = Object.freeze({
  root: 'data-fishball-taskboard',
  mode: Object.freeze({ view: 'view', edit: 'edit' }),
  task: 'data-fishball-task',
  status: 'data-status',
  condensed: 'data-condensed',
  chip: 'data-fishball-status',
  /** The lead's addition (2026-11-22): a task row's title element. */
  title: 'data-fishball-title',
  summary: 'data-fishball-taskboard-summary',
  count: 'data-fishball-count',
  overall: 'data-fishball-overall',
  completed: 'data-fishball-completed',
  note: 'data-fishball-note',
  details: 'data-fishball-task-details',
  memo: 'data-fishball-memo',
  empty: 'data-fishball-empty',
  progressbar: 'progressbar',
  /** V2: the page brand attribute on <html>. */
  brandAttr: 'data-fishball-page-brand',
  brandDeepseek: 'deepseek',
})

/** English copy the requirements name. */
export const COPY = Object.freeze({
  heading: (n) => 'Tasks · ' + n + ' unfinished',
  percent: (p) => p + '%',
  overall: (d, e) => d + ' of ' + e + ' done',
  completed: (n) => 'Completed (' + n + ')',
  collapse: 'Collapse subtasks',
  expand: 'Expand subtasks',
  more: 'Show more',
  less: 'Show less',
  empty: 'Nothing yet.',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  addTask: 'Add task',
  addMemo: 'Add memo',
  addSubtask: 'Add subtask',
  deleteTask: 'Delete task and its subtasks',
  deleteMemo: 'Delete memo',
  fields: Object.freeze(['Title', 'Status', 'Progress (%)', 'Note']),
  saved: 'Saved; Fishball was told what changed.',
  savedUntold: 'Saved, but Fishball could not be told right now.',
  unchanged: 'Nothing changed.',
  /** The lead's answer (2026-11-22): the stale save's exact text. */
  stale: 'Not saved: the board changed meanwhile. Your draft is kept; Reload to start again from the current board.',
  changedMeanwhile: 'changed while you were editing',
  reload: 'Reload',
})

/** Colours the requirements name (V2, V4): the default Fishball accent and DSH tokens. */
export const COLOUR = Object.freeze({
  /** V2: Fishball's accent by default, magenta #EC0A6E, as Chromium computes it. */
  accent: Object.freeze({ r: 0xEC, g: 0x0A, b: 0x6E }),
  business: '--dsw-alias-state-business-primary',
  warn: '--dsw-alias-state-warn-primary',
  success: '--dsw-alias-state-success-primary',
  tertiary: '--dsw-alias-label-tertiary',
})

/** Numeric bounds of the requirements. */
export const BOUND = Object.freeze({
  /** B1: the progress values measured. */
  progress: Object.freeze([0, 1, 40, 99, 100]),
  /** B1: width tolerance (px) and height tolerance (px). */
  widthPx: 1,
  heightPx: 0.5,
  /** V9: a note longer than this many code points is clamped. */
  noteCodePoints: 120,
  /** V12: the narrow tab width (CSS px). */
  narrowPx: 280,
  /** The tab width of the other rendered rows (a usual right sidebar, test choice). */
  tabPx: 360,
  /** Channel comparison of two computed colours: within half an 8-bit step. */
  channel: 0.5 / 255,
})

/** Test data. */
export const FIXTURE = Object.freeze({
  /** A task id t_<uuid> for index n (test data). */
  id: (n) => 't_00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
  memoId: (n) => 'm_00000000-0000-4000-8000-' + String(n).padStart(12, '0'),
  title: (n) => 'fbtest-view task ' + n,
  /** A long unbreakable word (V12). */
  longWord: (n) => 'fbtestlongword'.repeat(Math.ceil(n / 14)).slice(0, n),
  /** The wrapper the rendered rows lay the tab out in (test-owned). */
  tabAttr: 'data-fbtest-tab',
  mountKey: 'fbtest-conn-board0',
})

/** Harness only, never an oracle. */
export const HARNESS = Object.freeze({ skipNoChrome: 'no Chromium (FBTEST_CHROME or the Playwright headless shell) on this machine' })
