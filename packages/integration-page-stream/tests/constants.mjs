/**
 * Values of the page-stream rows. Sources: DESIGN §34 (the user, 2026-11-21: one connection for every
 * Fishball page stream, a constant count), fishball-shared's published ui-seam SEAM_PAGE_STREAM (route,
 * apiVersion, fields, built-in topics), fishball-taskboard's README and docs/plugins/fishball-taskboard.md
 * (its topic while bound, its routes), fishball-core's published contracts (FISHBALL_MODEL), the old
 * fishball-ui.connections requirements R1–R8 (2026-11-22, the image-loop fix) and DSH's public markup.
 * Harness budgets are marked.
 */
import { FAKE, FAKE_MODELS } from 'fishball-test-helpers/fake-llm'
import { FISHBALL_MODEL } from 'fishball-core/contracts'
import { SEAM_PAGE_STREAM } from 'fishball-shared/ui-seam'
import { NAMES } from './support/names.mjs'

export const CARRIER = Object.freeze({
  path: SEAM_PAGE_STREAM.route,
  langParam: SEAM_PAGE_STREAM.langParameter,
  tzParam: SEAM_PAGE_STREAM.zoneParameter,
  /** R1: the per-view routes that still exist for other readers; the Fishball page never opens them. */
  retired: Object.freeze(['/api/fishball/strip', '/api/fishball/asks/events', '/api/fishball-taskboard/events']),
  fishballRoutes: /\/api\/fishball/,
})
/** R2: on the Fishball page, one Fishball connection plus DSH's own /plugins/events. */
export const COUNT = Object.freeze({ fishball: SEAM_PAGE_STREAM.perPage, origin: 2, dshStream: /\/plugins\/events$/, topics: Object.freeze([0, 1, 5]) })
export const TOPIC = Object.freeze({
  asks: SEAM_PAGE_STREAM.topic.asks,
  strip: SEAM_PAGE_STREAM.topic.strip,
  taskboard: NAMES.taskboardTopic,
  fake: (i) => 'fbtest-topic-' + i,
  wireKeys: Object.freeze([SEAM_PAGE_STREAM.field.frame, SEAM_PAGE_STREAM.field.topic].sort()),
  service: NAMES.instance,
  apiVersion: SEAM_PAGE_STREAM.apiVersion,
  /** R3's malformed arguments (EP). */
  badTopics: Object.freeze([['empty', ''], ['number', 7], ['null', null]]),
  badProviders: Object.freeze(['none', 'null', 'string', 'noFrame', 'noOnChange', 'frameNotFn']),
  typeError: 'TypeError',
})
export const TASKBOARD = Object.freeze({
  board: '/api/fishball-taskboard/board',
  /** docs/plugins/fishball-taskboard.md §4: a complete task item of a POST body. */
  task: (title) => ({ id: 't_00000000-0000-4000-8000-0000000000a1', parentId: null, title, note: '', status: 'todo', progress: 0 }),
  title: 'fbtest-ps task',
})
/** Fishball's model for the scenario: a routable selection the scripted model serves (core's published path). */
export const MODEL = Object.freeze({ namespace: NAMES.coreNamespace, path: FISHBALL_MODEL.path, routable: Object.freeze({ provider: FAKE.provider, model: FAKE_MODELS.b }) })
export const SESSION_ROUTE = '/api/fishball/session'
export const NO_WARNING = Object.freeze({ prefix: 'fishball-ui: more live streams open than its connection budget allows', word: /connection budget/i })

export const PAGE = Object.freeze({ root: '/', blank: 'about:blank', viewport: Object.freeze({ width: 1280, height: 900 }) })
export const UI = Object.freeze({
  editor: '[data-composer-card] [contenteditable=true]', sending: '[data-sending]', fileInput: 'input[type=file]', composerImage: '[data-composer-card] img',
  sendLabel: 'Send message', pageMark: 'data-fishball-page', openRight: 'Open right sidebar', collapseRight: 'Collapse right sidebar', taskBoard: 'Task board',
  previewContinue: /^(Continue|继续)$/, dialog: '[role=dialog]', noticeTries: 3,
  text: 'fbtest-ps send', imageText: 'fbtest-ps send with an image',
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', pngName: 'fbtest-ps.png', tempPrefix: 'fbtest-ps-',
})
/** Harness waits; sendMs is R7's "within a few seconds". */
export const BUDGET = Object.freeze({ sendMs: 5000, pageMs: 90000, uiMs: 20000, settleMs: 1500, quietMs: 1000, frameMs: 10000, pollMs: 100, caseMs: 900000 })
/** The scripted page of the CONN-TB rows: DSH's right-sidebar contracts and the hooks of the two clients. */
export const TB_PAGE = Object.freeze({
  clientExport: './client', lang: 'en', notFound: 404, mountKey: 'fbtest-ps-board-', idPrefix: 'fbtest-ps-',
  right: Object.freeze({ controller: 'sidebarRight', tabs: 'sidebarRightTabs' }),
  bodySlot: 'sidebar.right.pane.tab',
  pageMark: 'data-fishball-page',
  client: SEAM_PAGE_STREAM.client,
  /** The taskboard's own standalone stream (docs/plugins/fishball-taskboard.md §4). */
  events: '/api/fishball-taskboard/events',
  /** A board document as GET /api/fishball-taskboard/board answers it (fixture values). */
  boardOf: (titles, revision = 1) => ({
    revision, unfinished: titles.length, memos: [],
    tasks: titles.map((title, i) => ({ id: 't_00000000-0000-4000-8000-00000000000' + i, parentId: null, title, note: '', status: 'todo', progress: 0, createdAt: 1, updatedAt: 1 })),
  }),
  titles: Object.freeze({ first: 'fbtest-conn task first', second: 'fbtest-conn task second', hidden: 'fbtest-conn task while hidden' }),
  invalid: Object.freeze([['null', null], ['a string', 'fbtest-not-a-board']]),
})
export const HOME = Object.freeze({ stream: 'fbps', unbound: 'fbps-unbound' })
export const fakeFrame = (i, n = 0) => ({ fbtest: i, n })
