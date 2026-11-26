/**
 * Oracle values of the fishball-taskboard cases (USE-CASES.md), each with its source:
 * - REQ: the user's requirements as the lead relayed them (2026-11-21): tools to create tasks, break
 *   goals into subtasks, update status/progress and read the board; tasks are not linked to sessions;
 *   the user edits the board in the UI and each changing save wakes Fishball with what changed; data
 *   persists across restarts; after every compaction with unfinished tasks one short reminder line;
 * - DOC §n: docs/plugins/fishball-taskboard.md, with the lead's answers Q1–Q24 (2026-11-21), which the
 *   lead folded into the document;
 * - SURFACE: the public surface the lead named (row module, the host fakes' shapes, the log line);
 * - DSH: the installed SDKs' own vocabulary.
 * The four PENDING choices of DOC §2/§3 are each one constant here (PENDING below names them), and a
 * case that depends on one says "provisional" in its title.
 * No file under packages/fishball-taskboard/ (packages/fishball-amenities/taskboard/ before the
 * amenities split, 2026-11-21) other than package.json and cordis.patch.yml was read.
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { REPO } from '../../support/constants.mjs'

/** The installed SDK's packages the world is built from (read only), and DSH's own names. */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  session: '@deepseek-ai/dsh-session',
  storage: '@deepseek-ai/dsh-storage',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  tools: '@deepseek-ai/dsh-tools',
  systemPrompt: '@deepseek-ai/dsh-system-prompt',
  scope: '@deepseek-ai/dsh-scope',
  /** dsh-storage-json's backend name: the domain facility's default route. */
  jsonBackend: 'json',
  /** A loader row naming a built-in plugin. */
  builtinPrefix: 'cordis:',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level. */
  allLevels: 3,
  /** cordis FiberState.ACTIVE: the row is up. */
  fiberActive: 2,
  /** SURFACE: the services the row injects, and those it looks up at runtime. */
  services: Object.freeze({ connection: 'connection', instance: 'fishballInstance', appReady: 'appReady', systemPrompt: 'systemPrompt' }),
  /** SURFACE: the root event an appended session event is published on. */
  sessionEvent: 'session/event',
  /** dsh-session known event types. */
  compactionEnd: 'compaction/end',
  compactionStart: 'compaction/start',
  textBlock: 'text',
  /** The SDK's own yaml copy (the worktree has no node_modules), resolved from its version folder. */
  yaml: 'yaml',
  sdkManifest: 'package.json',
})

/** Its own package since the amenities split (the user, 2026-11-21). */
const PACKAGE_DIR = path.join(REPO, 'packages', 'fishball-taskboard')
/** SURFACE: the row module, its own package's patch row and manifest. */
export const SUBJECT = Object.freeze({
  name: 'fishball-taskboard',
  entry: path.join(PACKAGE_DIR, 'index.js'),
  /** The lead's correction (2026-11-21): storage, storageDomain and connection, as core's main row. */
  inject: Object.freeze(['connection', 'storage', 'storageDomain']),
  patch: path.join(PACKAGE_DIR, 'cordis.patch.yml'),
  /** The row names the package, never a ./path (the amenities split). */
  patchRow: Object.freeze({ id: 'fishball-taskboard', name: 'fishball-taskboard' }),
  manifest: path.join(PACKAGE_DIR, 'package.json'),
  manifestName: 'fishball-taskboard',
  clientPlatform: 'web',
  clientExport: './client',
  encoding: 'utf8',
})

/** SURFACE / DOC §7: the K3 fishballInstance apiVersion the row binds to, and an older one. */
export const INSTANCE = Object.freeze({ apiVersion: 2, older: 1 })
/** SURFACE: notify's receipts; Q7: notified is true whenever notify resolves. */
export const RECEIPT = Object.freeze({ queued: 'queued', held: 'held' })
/** The fake notify's behaviours (world.mjs). */
export const NOTIFY = Object.freeze({ queued: 'queued', held: 'held', reject: 'reject' })

/** DOC §3: the tools; DOC §3/§4: the refusal codes. */
export const TOOL = Object.freeze({ read: 'taskboard_read', add: 'taskboard_add', update: 'taskboard_update', memo: 'taskboard_memo', resolveReview: 'taskboard_resolve_review' })
export const CODE = Object.freeze({
  notManager: 'not-manager', invalidInput: 'invalid-input', notFound: 'not-found', limitReached: 'limit-reached',
  unavailable: 'board-unavailable', stale: 'stale',
})

/** DOC §2: the statuses. PENDING (statuses): the user may prefer todo, in_progress, done only. */
export const STATUS = Object.freeze({ todo: 'todo', inProgress: 'in_progress', blocked: 'blocked', done: 'done', dropped: 'dropped' })
export const STATUSES = Object.freeze(Object.values(STATUS))
/** DOC §2: unfinished = todo, in_progress or blocked (PENDING (statuses)). */
export const UNFINISHED = Object.freeze([STATUS.todo, STATUS.inProgress, STATUS.blocked])
/**
 * DOC §3's one exception (the lead, 2026-11-21): arguments that are not a JSON object are refused by
 * DSH's own tool registry before the tool runs, as a rejection with this error name (both SDKs).
 */
export const DSH_ARGS_ERROR = 'ToolArgsError'

/** A status DOC §2 does not name. */
export const NOT_A_STATUS = 'finished'

/** DOC §2: a new task's defaults. */
export const TASK_DEFAULT = Object.freeze({ status: STATUS.todo, progress: 0, note: '', parentId: null })
/** DOC §2 + REQ (no field names a session, an event or a turn): the stored items' keys, sorted. */
export const TASK_KEYS = Object.freeze(['createdAt', 'id', 'note', 'parentId', 'progress', 'status', 'title', 'updatedAt'])
export const MEMO_KEYS = Object.freeze(['createdAt', 'id', 'text', 'updatedAt'])
/** DOC §3: the created entries' keys. */
export const CREATED_KEYS = Object.freeze(['id', 'parentId', 'title'])
/** DOC §3 and Q17: the read value's and the GET body's (and each SSE frame's) members, sorted. */
export const READ_KEYS = Object.freeze(['memos', 'ok', 'revision', 'tasks', 'unfinished'])
export const BOARD_KEYS = Object.freeze(['memos', 'revision', 'tasks', 'unfinished'])
/** DOC §4: the POST body items' keys (Q15: complete). */
export const POST_TASK_KEYS = Object.freeze(['id', 'parentId', 'title', 'note', 'status', 'progress'])
export const POST_MEMO_KEYS = Object.freeze(['id', 'text'])
/** DOC §2: a new board's revision, and the step per committed change. */
export const REVISION = Object.freeze({ initial: 0, step: 1 })

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
/** DOC §2: t_<uuid>, m_<uuid>. */
export const ID = Object.freeze({ task: new RegExp('^t_' + UUID + '$'), memo: new RegExp('^m_' + UUID + '$'), taskPrefix: 't_', memoPrefix: 'm_' })

/** DOC §2 limits, in code points after trimming (PENDING (limits)); depth: top level = 1. */
export const LIMIT = Object.freeze({
  title: Object.freeze({ min: 1, max: 200 }),
  note: Object.freeze({ min: 0, max: 2000 }),
  memo: Object.freeze({ min: 1, max: 4000 }),
  tasks: 500,
  memos: 200,
  depth: 5,
  progress: Object.freeze({ min: 0, max: 100 }),
})

/** The PENDING labels a provisional case names (DOC §2/§3). */
export const PENDING = Object.freeze({
  statuses: 'provisional: PENDING (statuses)', memo: 'provisional: PENDING (memo)',
  limits: 'provisional: PENDING (limits)', delete: 'provisional: PENDING (delete)',
})

/** DOC §3 (Q5, Q6, Q16, Q23) and DOC §4 (Q9, Q15, Q21): the field paths of a refusal. */
export const FIELD = Object.freeze({
  tasks: 'tasks', memos: 'memos', depth: 'depth', id: 'id', parentId: 'parentId', text: 'text', delete: 'delete',
  title: 'title', note: 'note', status: 'status', progress: 'progress', baseRevision: 'baseRevision',
  /** Q6: an update naming no field. */
  updateNone: 'title|note|status|progress',
  /** tasks[i].subtasks[j]….key: a nested taskboard_add item's key (Q6). */
  nested: (indexes, key) => 'tasks' + indexes.map((index, level) => (level === 0 ? '' : '.subtasks') + '[' + index + ']').join('') + (key === undefined ? '' : '.' + key),
  /** list[i].key: a POST body item's key (Q9). */
  item: (list, index, key) => list + '[' + index + '].' + key,
  /** Q9: tasks[i].parentId for a cycle (which member of the cycle is reported is not fixed). */
  anyParentId: /^tasks\[\d+\]\.parentId$/,
})
/** Q5/Q9: a key no contract names. */
export const UNKNOWN_KEY = 'colour'

/** DOC §4: the routes and the HTTP answers. */
export const ROUTE = Object.freeze({
  board: '/api/fishball-taskboard/board',
  events: '/api/fishball-taskboard/events',
  get: 'GET',
  post: 'POST',
  origin: 'http://127.0.0.1',
  status: Object.freeze({ ok: 200, badRequest: 400, conflict: 409, unavailable: 503 }),
  contentType: 'content-type',
  json: 'application/json',
  framePrefix: 'data: ',
  frameEnd: '\n\n',
  lineEnd: '\n',
})

/** DOC §5 (Q1–Q4, Q10–Q14, Q18–Q20): the wake notice after a user save. */
const QUOTE_CUT = 160
const ELLIPSIS = '…'
const ARROW = ' → '
const MAX_LINES = 40
const LINE_JOIN = '\n'
const cut = (text) => { const points = [...text]; return points.length > QUOTE_CUT ? points.slice(0, QUOTE_CUT).join('') + ELLIPSIS : text }
const quote = (text) => JSON.stringify(cut(text))
export const NOTICE = Object.freeze({
  pluginId: 'fishball-taskboard',
  dedupeKey: new RegExp('^fishball-taskboard:user-edit:' + UUID + '$'),
  wake: true,
  quoteCut: QUOTE_CUT,
  maxLines: MAX_LINES,
  quote,
  heading: (revision) => 'The user edited your task board in the UI (revision ' + revision + '):',
  footer: 'Call taskboard_read for the whole board.',
  addedTask: (title, parent) => '- added task ' + quote(title) + (parent === undefined ? '' : ' under ' + quote(parent)),
  deletedTask: (title, descendants = 0) => '- deleted task ' + quote(title) + (descendants === 0 ? '' : ' and its ' + descendants + (descendants === 1 ? ' subtask' : ' subtasks')),
  changedTask: (oldTitle, parts) => '- changed task ' + quote(oldTitle) + ': ' + parts.join('; '),
  part: Object.freeze({
    title: (a, b) => 'title ' + quote(a) + ARROW + quote(b),
    note: (a, b) => 'note ' + quote(a) + ARROW + quote(b),
    status: (a, b) => 'status ' + a + ARROW + b,
    progress: (a, b) => 'progress ' + a + '%' + ARROW + b + '%',
    movedUnder: (parent) => 'moved under ' + quote(parent),
    movedTop: 'moved to the top level',
  }),
  reorderedTasks: '- reordered the tasks',
  addedMemo: (text) => '- added memo ' + quote(text),
  changedMemo: (a, b) => '- changed memo ' + quote(a) + ARROW + quote(b),
  deletedMemo: (text) => '- deleted memo ' + quote(text),
  reorderedMemos: '- reordered the memos',
  more: (n) => '- …and ' + n + (n === 1 ? ' more change' : ' more changes'),
  /** The whole text: heading, at most 40 change lines (then the "more" line), footer. */
  text(revision, lines) {
    const shown = lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), NOTICE.more(lines.length - MAX_LINES)] : lines
    return [NOTICE.heading(revision), ...shown, NOTICE.footer].join(LINE_JOIN)
  },
})

/**
 * DOC §6 (the lead's decision 2026-11-21: the count is pluralised; both forms are verbatim in the
 * document): the compaction reminder, injected one microtask after the event.
 */
export const REMINDER = Object.freeze({
  text: (n) => 'Reminder: your task board still has ' + n + ' unfinished ' + (n === 1 ? 'task' : 'tasks') + '; call taskboard_read to see them.',
  source: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-taskboard' }),
  role: 'user',
})

/**
 * DOC §3a (the user, 2026-11-22): the one manager-scope prompt section the X2 setup registers. order is
 * DSH's getSectionOrder('DEPLOYMENT_PERSONA_PREFIX') + 2; DSH's value for that name is 0 (both SDKs).
 */
const GUIDE_ORDER_ANCHOR = 0
const GUIDE_ORDER_OFFSET = 2
export const GUIDE = Object.freeze({
  name: 'fishball-taskboard',
  orderAnchor: 'DEPLOYMENT_PERSONA_PREFIX',
  orderAnchorValue: GUIDE_ORDER_ANCHOR,
  order: GUIDE_ORDER_ANCHOR + GUIDE_ORDER_OFFSET,
  text: [
    '**Task board.** Keep your task board up to date.',
    '- When the user gives you a new task, add it with taskboard_add right away. Break multi-part work into subtasks.',
    '- Whenever a task or subtask makes progress or finishes, update its status and progress with taskboard_update right away, in the same turn.',
    '- When a session you manage finishes work, update the matching task before or together with reporting to the user.',
    '- Never leave finished work in todo or in_progress.',
  ].join('\n'),
})
/** DSH's own section names (dsh-system-prompt), which a case tells apart from the guide. */
export const DSH_SECTION = Object.freeze({ personaPrefix: 'deployment:persona-prefix' })

/** DOC §7 / SURFACE: the one warn line without core, through ctx.logger('fishball-taskboard'). */
export const LOG = Object.freeze({ logger: 'fishball-taskboard', coreMissing: 'fishball-core-missing', warn: 'warn' })

/** Fixture data; every value is a test value, not a product one. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-taskboard-',
  /** The host plugin the manager's agent scope is minted from (world.mjs). */
  agentHost: 'fbtest-taskboard-agent-host',
  /** TB-ST-06: resumes in a row (more than one, so a second resume is not a first one again). */
  resumes: 2,
  /** Another agent's scope key (a worker), which must not see the manager-scope section. */
  workerKey: Object.freeze({ id: 'fbtest-taskboard-worker' }),
  /** A global section a case registers, to show the guide's name shadows only in the manager scope. */
  globalGuideText: 'fbtest: a global section of the same name',
  /**
   * Global probe sections around the guide's order (BVA: order − 1, the same order with a name that
   * sorts before / after 'fishball-taskboard' in code units, order + 1).
   */
  probe: Object.freeze({ step: 1, below: 'fbtest-probe-below', sameBefore: 'fbtest-probe-same', sameAfter: 'fishball-taskboard~fbtest', above: 'fbtest-probe-above' }),
  domainDir: 'domain',
  callIdPrefix: 'fbtest-tb-call-',
  compactionId: 'fbtest-compaction-',
  compactionError: 'fbtest: the summary model failed',
  /** DOC §5's example board. */
  goal: 'Plan trip',
  flights: 'Book flights',
  oldIdea: 'Old idea',
  passport: 'Passport expires in May',
  hotel: 'Book hotel',
  visa: 'Visa needs 3 weeks',
  note: 'window seat',
  renamed: 'Plan the trip',
  title: (n) => 'fbtest task ' + n,
  memoText: (n) => 'fbtest memo ' + n,
  /** One ASCII code point, and one astral one (two UTF-16 units, one code point). */
  ascii: 'a',
  astral: '\u{1F600}',
  blank: '   ',
  pad: (text) => '  ' + text + ' \t',
  progressMid: 30,
  progressLate: 80,
  taskId: () => ID.taskPrefix + randomUUID(),
  memoId: () => ID.memoPrefix + randomUUID(),
  malformedTaskId: 't_123',
  malformedMemoId: 'm_x',
  unparsable: '{not json',
  notAnObject: 'x',
  /** BVA rows' progress values that are not integers 0–100. */
  fraction: 1.5,
  numericString: '50',
  /** Client times the POST must ignore (DOC §4). */
  clientTime: 1,
  /** Storage fault: the domain folder made read-only (owner r-x), restored after. */
  readOnlyMode: 0o555,
  writableMode: 0o755,
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ testMs: 120_000, settleMs: 5_000, quietMs: 250, pollMs: 10, frameMs: 5_000, immediateTurns: 10 })
