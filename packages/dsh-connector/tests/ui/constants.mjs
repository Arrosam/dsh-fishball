/**
 * Vocabulary for the C-UI-BACKEND cases (task C-UI-BACKEND; R-UI-05, R-UI-10, R-ROUTE-05, R-FN-01
 * Q-N1 / Q-N3 = A, R-EXT-13, design §13.6; Q-U2, Q-G4). Every literal the cases use lives here.
 *
 * Product values come from three places only:
 * - K2 `dsh-agent-connector/tools` (namespaces, public names, the protocol version, call codes);
 * - K3 `host-services/handover.d.ts` (refusal codes, read back from the declaration by the C-ROUTE
 *   suite's `handoverCodes`, so a K3 amendment fails a row instead of drifting);
 * - the surface relayed by the dev session (2026-11-16, "the contract, not the implementation"):
 *   route paths and methods, answer statuses and codes, the body limit, the message limit, the
 *   service name. They are restated in SURFACE below, never read from the module under test.
 * The rest is fixture data and harness timing, which are not product values.
 */
import path from 'node:path'
import * as K2 from '../../tools/index.js'
import { REPO } from '../../../../test/support/constants.mjs'
import { handoverCodes } from '../routing/constants.mjs'

export { K2 }

/** The module under test (subject.mjs is its one import point). FBTEST_C_UI_ENTRY moves it. */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_UI_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'ui', 'index.js'),
  contribEntry: process.env.FBTEST_C_EXT_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'contrib', 'index.js'),
  factory: 'createUiBackend',
  contribFactory: 'createContributions',
  /** The exact exports the dev session relayed. */
  exports: Object.freeze(['createUiBackend', 'UI_ROUTE', 'UI_SERVICE', 'NOTIFY', 'UI_TOOL', 'UI_CODE']),
  /** `createUiBackend(...)` members. */
  backendMembers: Object.freeze(['service', 'provide', 'snapshot', 'close']),
})

const GET = 'GET'
const POST = 'POST'
const PREFIX = '/api/dsh-connector/ui'

/** The relayed surface (see the header). */
export const SURFACE = Object.freeze({
  serviceName: 'dshConnectorUi',
  apiVersion: 1,
  /** UI_ROUTE keys → [method, absolute path]. */
  routes: Object.freeze({
    state: Object.freeze([GET, PREFIX + '/state']),
    events: Object.freeze([GET, PREFIX + '/events']),
    handOver: Object.freeze([POST, PREFIX + '/handover']),
    takeBack: Object.freeze([POST, PREFIX + '/takeback']),
    dismiss: Object.freeze([POST, PREFIX + '/notice/dismiss']),
    opened: Object.freeze([POST, PREFIX + '/opened']),
  }),
  requestBody: 'buffered',
  status: Object.freeze({ ok: 200, invalid: 400, refused: 409, failed: 500 }),
  code: Object.freeze({ invalidRequest: 'invalid-request', operationFailed: 'operation-failed', messageEmpty: 'message-empty', limitExceeded: K2.CALL_CODE.limitExceeded }),
  headers: Object.freeze({ contentType: 'application/json; charset=utf-8', cacheControl: 'no-store', eventStream: 'text/event-stream' }),
  /** UTF-8 bytes of a request body; one more is `invalid-request`. */
  maxBodyBytes: 65536,
  /** Code points of a trimmed notify message (R-FN-01). */
  maxMessageChars: 4000,
  /** An SSE frame: `data: <JSON Snapshot>\n\n`. */
  frame: Object.freeze({ prefix: 'data: ', end: '\n\n' }),
  /** Snapshot keys and their nested keys. */
  // Contract A (2026-11-21, entries by window): the snapshot gains `windows`.
  snapshotKeys: Object.freeze(['attention', 'light', 'marks', 'notice', 'targets', 'windows']),
  windowKeys: Object.freeze(['id', 'key', 'name']),
  targetKeys: Object.freeze(['id', 'key', 'name', 'online']),
  refKeys: Object.freeze(['id', 'key', 'name']),
  noticeKeys: Object.freeze(['count', 'important', 'message']),
  /** The UI's contributor package (R-EXT-13); its namespace is K2's alias of it. */
  uiPackage: 'dsh-connector-ui',
  tools: Object.freeze({ notify: 'notify', signal: 'attention.signal', state: 'attention.state' }),
  /** The K2 schema words the closed input schemas are checked with. */
  schema: Object.freeze({ object: 'object', string: 'string', boolean: 'boolean' }),
})

/** K3 refusal codes, from the declaration. */
export const K3 = Object.freeze({
  handOverCodes: Object.freeze(handoverCodes('HandOverRefusalCode')),
  takeBackCodes: Object.freeze(handoverCodes('TakeBackRefusalCode')),
  apiVersion: 1,
  handover: 'dshConnectorHandover',
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  origin: 'http://127.0.0.1:43123',
  sessions: Object.freeze({ s1: 'fbtest-ui-s1', s2: 'fbtest-ui-s2', s3: 'fbtest-ui-s3', unknown: 'fbtest-ui-no-such-session' }),
  note: 'fbtest hand-over note',
  /** Principals: [key, name, id]. */
  p: Object.freeze({ key: 'fbtest-ui-pk-p', name: 'Planner', id: 'agent-p' }),
  q: Object.freeze({ key: 'fbtest-ui-pk-q', name: null, id: 'agent-q' }),
  d: Object.freeze({ key: 'fbtest-ui-pk-d', name: 'Fishball', id: 'fishball-d' }),
  x: Object.freeze({ key: 'fbtest-ui-pk-x', name: 'Disabled', id: 'agent-x' }),
  u: Object.freeze({ key: 'fbtest-ui-entry-u', name: null, id: null }),
  renamed: 'Indexer',
  unknownKey: 'fbtest-ui-no-such-principal',
  caller: Object.freeze({ key: 'fbtest-ui-caller', name: 'Caller' }),
  /** The token entry key a fixture principal is paired under (FakePairStore; fixture data). */
  entryOf: (principalKey) => 'fbtest-ui-entry-of-' + principalKey,
  /** An entry key no principal is paired under. */
  strayEntry: 'fbtest-ui-entry-nobody',
  message: 'Build 42 finished',
  message2: 'Build 43 failed',
  markup: '<b>bold</b> **not markdown** <script>x</script>',
  /** Whitespace String.prototype.trim removes (space, tab, NBSP, BOM, ideographic space, newline). */
  trimmable: ' \t\u00a0\ufeff\u3000\n',
  /** One astral code point (two UTF-16 units). */
  astral: '\u{1F41F}',
  ascii: 'a',
  notJson: '{not json',
  extraKey: 'fbtestExtra',
  wrongType: 42,
  noteKey: 'note',
  /** A `Request` body template of an exact size: `{"sessionId":…,"principalKey":…,"note":"<pad>"}`. */
  padChar: 'n',
  euro: '\u20ac',
  marker: 'FBTEST-C-UI-',
  failure: 'fbtest service failure',
  tempPrefix: 'fbtest-c-ui-',
  hookKey: 'fbtest.c-ui.worlds',
  pluginsDir: 'plugins',
  connectorRow: 'fbtest-ui-connector',
  version: '1.2.3',
  /** The routing world's ids (packages/dsh-connector/tests/routing world): P, Q, D. */
  routeIds: Object.freeze({ p: 'ui-agent-p', q: 'ui-agent-q', d: 'ui-fishball-d', later: 'ui-agent-later' }),
  routeNames: Object.freeze({ p: 'Planner', d: 'Fishball', renamed: 'Indexer', later: 'Later' }),
})

/** Expected latch, light and counter values (each named for its meaning). */
export const EXPECT = Object.freeze({
  latch: Object.freeze({
    clear: Object.freeze({ count: 0, important: false }),
    set: Object.freeze({ count: 1, important: false }),
    setImportant: Object.freeze({ count: 1, important: true }),
  }),
  light: Object.freeze({
    off: Object.freeze({ on: false, important: false }),
    on: Object.freeze({ on: true, important: false }),
    important: Object.freeze({ on: true, important: true }),
  }),
  firstNotice: 1,
  secondNotice: 2,
  noTargets: 0,
  oneTarget: 1,
  twoTargets: 2,
  /** One frame per change (the stream's contract). */
  oneFrame: 1,
  /** Tools the backend contributes. */
  toolCount: 3,
  /** Listeners left on the hand-over service after close(). */
  noListeners: 0,
  /** Disposer calls of one registration after its contribution ends (idempotent). */
  disposedOnce: 1,
  notDisposed: 0,
  /** UTF-8 bytes of FIXTURE.euro, to build bodies of an exact byte size. */
  euroBytes: 3,
  /** A body one byte over the limit. */
  oneByte: 1,
  /** A message one code point over the limit. */
  oneChar: 1,
  /** contribute()'s register throws on this (0-based) call. */
  throwOnSecond: 1,
  /** handOver(sessionId, principalKey, note): the note's argument index. */
  noteArg: 2,
})

/** The installed SDK packages the integration world is built from (read only). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  builtinPrefix: 'cordis:',
})

/** Harness timing only. */
export const WAIT = Object.freeze({
  testMs: 60_000,
  routeTestMs: 120_000,
  settleMs: 5_000,
  /** How long a stream or a state that must not change is watched. */
  quietMs: 200,
  pollMs: 10,
})

/**
 * The dev session's answers to this suite's questions (2026-11-16, implementation decisions under
 * the design, not the user's), cited by the rows that rely on one.
 */
export const DECIDED = Object.freeze({
  // Q-UIB-1 / Q-UIB-2 (designated loss) are void since C-WIRE-2 (the user's q5: no designated principal).
  ignoredBodyLimit: 'Q-UIB-3 (dev 2026-11-16): dismiss and opened never read their body; no limit or shape check, any body gets 200',
  emptyIds: 'Q-UIB-4 (dev 2026-11-16): an empty string is a string; passed to the service unchanged, which answers its own refusal',
  secondContribute: 'Q-UIB-5 (dev 2026-11-16): each contribute() is independent; a refusal by the contribution service disposes what it registered and is rethrown; the first is unaffected; ending one resets latch and notice',
  noOpFrame: 'Q-UIB-7 (dev 2026-11-16): no frame for a change that leaves the snapshot as it was; a hand-over onChange always sends one',
})

/**
 * R-FIX-CUI rows (cui-cases.mjs; .runtime/reports/review-x-dsh-connector-ui.md UI-01, UI-02).
 * `maxQueuedFrames` is the requirement's "bounded by a small constant (≤ 2 or 3, independent of
 * N)": the larger bound, so a row fails only past what the requirement allows. `changeCounts` are
 * the BVA points of N (one, two, and the review probe's 2,000).
 */
export const CUI = Object.freeze({
  id: Object.freeze({ ui01: 'RFC-UI01', ui02: 'RFC-UI02' }),
  code: Object.freeze({ conflict: 'conflict', notManaged: 'not-managed' }),
  maxQueuedFrames: 3,
  manyChanges: 2000,
  changeCounts: Object.freeze([1, 2, 2000]),
  liveChanges: 3,
  /** The order row's three changes (read, 1, 2, read, 3, drain). */
  orderChanges: 3,
})
