/**
 * fishball-ui.connections vocabulary: the Fishball page's ONE live connection (the image-loop fix,
 * requirements R1–R8 relayed by the implementer "image-loop", 2026-11-22, .runtime/stream-tests-prompt.md;
 * the user's decision of 2026-11-21: every Fishball page data stream on one connection, a CONSTANT count).
 * Every value is the requirement's or DSH's public markup; none is read from the implementation.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/** Chrome's HTTP/1.1 limit per host, shared by every tab of a profile (the bug's cause; not asserted, it explains COUNT). */
export const PER_HOST_CONNECTIONS = 6

/** R1: the carrier, relative to the page, and its absolute path; R1 also names the routes the page must not open. */
export const CARRIER = Object.freeze({
  relative: 'api/fishball/page/events',
  path: '/api/fishball/page/events',
  langParam: 'lang',
  tzParam: 'tz',
  langs: Object.freeze(['en', 'zh']),
  /** R1: the per-view routes that still exist for other readers, which the Fishball page no longer opens. */
  retired: Object.freeze(['/api/fishball/strip', '/api/fishball/asks/events', '/api/fishball-taskboard/events']),
})

/** R2: the constant counts on the Fishball page with any reader mounted. */
export const COUNT = Object.freeze({
  /** Fishball-owned EventSources (the carrier). */
  fishball: 1,
  /** Every EventSource to the page origin: DSH's own /plugins/events and the carrier. */
  origin: 2,
  /** DSH's own page stream (the one non-Fishball EventSource of the page). */
  dshStream: /\/plugins\/events$/,
  /** R2: amenity topic counts that must all give the same count (boundary 0, 1, and many). */
  topics: Object.freeze([0, 1, 5]),
  /** The component rows also try a larger N. */
  manyTopics: 20,
})

/** R3 / R4: the built-in topics and the wire message's keys. */
export const TOPIC = Object.freeze({
  asks: 'asks',
  strip: 'strip',
  taskboard: 'fishball-taskboard',
  /** Fake amenity topics (test data). */
  fake: (i) => 'fbtest-topic-' + i,
  wireKeys: Object.freeze(['frame', 'topic']),
  /** R3: the Host service and its member. */
  service: 'fishballInstance',
  apiVersion: 2,
})

/** R5: the browser service and its health words; the Reconnect hook. */
export const CLIENT = Object.freeze({
  service: 'fishballPageStream',
  health: Object.freeze({ live: 'live', stale: 'stale', closed: 'closed' }),
  retry: 'data-fishball-stream-retry',
})

/** R8: the withdrawn budget warning's words (the prefix the earlier fix logged); nothing may log it. */
export const NO_WARNING = Object.freeze({ prefix: 'fishball-ui: more live streams open than its connection budget allows', word: /connection budget/i })

/** R6: fishball-taskboard's browser half, its tab and its board (docs/plugins/fishball-taskboard.md §2, §4). */
export const TASKBOARD = Object.freeze({
  client: path.join(REPO, 'packages', 'fishball-taskboard', 'client.js'),
  moduleId: 'fishball-taskboard',
  bodySlot: 'sidebar.right.pane.tab',
  board: '/api/fishball-taskboard/board',
  events: '/api/fishball-taskboard/events',
  folder: 'fishball-taskboard',
  /** A board document as GET /api/fishball-taskboard/board answers it (fixture values). */
  boardOf: (titles, revision = 1) => ({
    revision, unfinished: titles.length, memos: [],
    tasks: titles.map((title, i) => ({ id: 't_00000000-0000-4000-8000-00000000000' + i, parentId: null, title, note: '', status: 'todo', progress: 0, createdAt: 1, updatedAt: 1 })),
  }),
  /** A new task for a POST body (`t_<uuid>`, DOC §4). */
  newTask: (uuid, title) => ({ id: 't_' + uuid, parentId: null, title, note: '', status: 'todo', progress: 0 }),
  titles: Object.freeze({ first: 'fbtest-conn task first', second: 'fbtest-conn task second', hidden: 'fbtest-conn task while hidden', shown: 'fbtest-conn task shown again' }),
})

/** The real DSH web UI (DSH's public markup and English labels, the implementer's harness hints). */
export const UI = Object.freeze({
  editor: '[data-composer-card] [contenteditable=true]',
  sending: '[data-sending]',
  fileInput: 'input[type=file]',
  composerImage: '[data-composer-card] img',
  /** DSH's composer send control (its English aria-label). */
  sendLabel: 'Send message',
  pageMark: 'data-fishball-page',
  openRight: 'Open right sidebar',
  collapseRight: 'Collapse right sidebar',
  taskBoard: 'Task board',
  previewContinue: /^(Continue|继续)$/,
  dialog: '[role=dialog]',
  text: 'fbtest-conn send',
  imageText: 'fbtest-conn send with an image',
  /** A 1×1 PNG (fixture) the composer attaches. */
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  pngName: 'fbtest-conn.png',
})

/** Waiting only; SEND_MS is R7's "within a few seconds". */
export const BUDGET = Object.freeze({
  sendMs: 5000,
  pageMs: 90000,
  uiMs: 20000,
  settleMs: 1500,
  quietMs: 1000,
  frameMs: 10000,
  pollMs: 100,
})

/** The world extension (FBTEST_WORLD_EXTENSION) this suite boots the manager world with. */
export const WORLD_EXTENSION = path.join(import.meta.dirname, 'world-extension.mjs')

/** Test data of the component rows. */
export const FIXTURE = Object.freeze({
  managerSession: 'fbtest-fishball',
  mountKey: 'fbtest-conn-',
  fakeFrame: (i, n = 0) => ({ fbtest: i, n }),
  zone: 'Pacific/Auckland',
})
