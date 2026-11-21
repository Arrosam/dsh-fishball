/**
 * fishball-taskboard's values (docs/plugins/fishball-taskboard.md). Four are PENDING the user's answer
 * (2026-11-21; the question timed out): the memo pad's form, the statuses, who deletes, and the
 * limits. Their provisional values are the recommended answers, each defined only here.
 */
export const NAMESPACE = 'fishball-taskboard'

/** PENDING (statuses). The first three are unfinished (OPEN_STATUSES). */
export const STATUS = Object.freeze({
  todo: 'todo',
  inProgress: 'in_progress',
  blocked: 'blocked',
  done: 'done',
  dropped: 'dropped',
})
export const OPEN_STATUSES = Object.freeze([STATUS.todo, STATUS.inProgress, STATUS.blocked])

/** PENDING (limits): Unicode code points after trimming; a top-level task has depth 1. */
export const LIMITS = Object.freeze({
  titleChars: Object.freeze({ min: 1, max: 200 }),
  noteChars: Object.freeze({ min: 0, max: 2000 }),
  memoChars: Object.freeze({ min: 1, max: 4000 }),
  tasks: 500,
  memos: 200,
  depth: 5,
  progress: Object.freeze({ min: 0, max: 100 }),
})

/** What a new task is unless the caller says otherwise. */
export const TASK_DEFAULTS = Object.freeze({ note: '', status: STATUS.todo, progress: LIMITS.progress.min })

/** Item ids: a kind prefix and a random UUID, so the user's UI can mint ids before saving. */
export const ID = Object.freeze({
  task: 't_',
  memo: 'm_',
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
})

export const CODE = Object.freeze({
  notManager: 'not-manager',
  invalidInput: 'invalid-input',
  notFound: 'not-found',
  limitReached: 'limit-reached',
  unavailable: 'board-unavailable',
  stale: 'stale',
})

/** The storage domain: its global value is the whole board, so each change is one atomic write. */
export const STORE = Object.freeze({
  domain: 'fishball_taskboard',
  version: 1,
  emptyRevision: 0,
})

/** The model's tools (§3). */
export const TOOL = Object.freeze({
  read: 'taskboard_read',
  add: 'taskboard_add',
  update: 'taskboard_update',
  memo: 'taskboard_memo',
})

/** The UI's routes (§4); the browser half restates them (a chunk imports no module). */
export const ROUTE = Object.freeze({
  board: '/api/fishball-taskboard/board',
  events: '/api/fishball-taskboard/events',
  get: 'GET',
  post: 'POST',
  requestBody: 'buffered',
  status: Object.freeze({ ok: 200, badRequest: 400, conflict: 409, unavailable: 503 }),
  json: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  frame: (json) => `data: ${json}\n\n`,
  abort: 'abort',
})

/**
 * The host's names. `fishballInstance` is looked up, never injected (R-FB-06: a missing core must
 * not block the row); core provides apiVersion 2 (MULTI-0). `appReady` is DSH's launcher readiness.
 */
export const HOST = Object.freeze({
  service: 'fishballInstance',
  apiVersion: 2,
  /**
   * Core's page stream (fishball-shared `SEAM_PAGE_STREAM`, restated: this row reads core only
   * through the instance): its member, and the board's topic, which the browser half restates.
   */
  pageMember: 'page',
  pageTopic: 'fishball-taskboard',
  serviceEvent: 'internal/service',
  appReady: 'appReady',
  sessionEvent: 'session/event',
  /** dsh-session's event closing a compaction; a failed one carries `data.error` (dsh-compaction-basic, both SDKs). */
  compactionEnd: 'compaction/end',
  /** A plugin notice's source, as core's manager.notify builds its own (core service.js `noticeSource`). */
  noticeSource: Object.freeze({ kind: 'fishball-notice', form: 'plugin', pluginId: NAMESPACE }),
  textBlock: 'text',
  userEditKey: NAMESPACE + ':user-edit:',
})

/** The user-edit message's bounds (§5). */
export const MESSAGE = Object.freeze({ quoteChars: 160, ellipsis: '…', maxLines: 40 })

export const LOG = Object.freeze({ coreMissing: 'fishball-core-missing', notifyFailed: 'user edit not delivered to Fishball (%s)' })
