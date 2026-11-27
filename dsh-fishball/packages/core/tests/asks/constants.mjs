/**
 * Vocabulary for the F-ASKCARD cases (USE-CASES.md): PLAT-UC-07 (R-FB-11, R-UI-12, R-CON-05,
 * R-CON-06, R-CON-08), K3 `packages/core/contracts/ask-card.d.ts` and `ui.d.ts` `asks`, and the
 * user's decision Q3 = A (the card offers Allow and Reject, each with an optional reason).
 *
 * Every product value comes from a frozen contract or from the requirements the test author was
 * given, never from the implementation:
 * - K1 `dsh-agent-connector/mcp-schema`: event types, tool names, offer ids, refusal codes;
 * - K1's answer vocabulary (`APPROVAL_DECISION`, `RISK`, `APPROVAL_KIND`, moved there from the V2
 *   contract by C-WIRE-2): the answer's `decision` and `risk` words;
 * - K3 `ask-card.d.ts`: the card's fields and its three states (types only, so they are written
 *   here as the declaration spells them);
 * - the F-ASKCARD requirements: the tool name `ask_user`, the default reason line, the two routes,
 *   the `unknown-offer` code and the HTTP statuses of the answer route.
 * DSH's own vocabulary is the installed SDK's. The rest is fixture data and harness timing.
 */
import path from 'node:path'
import { APPROVAL_KIND, APPROVAL_DECISION as DECISION, ARGUMENTS_STATUS, RISK } from 'fishball-test-helpers/connector-contract/mcp-schema'
import {
  DECISION_KIND, DECISION_KIND_OF, EVENT_TYPE, LINK_REFUSAL, OFFER_ID, REFUSAL, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL,
} from 'fishball-test-helpers/connector-contract/mcp-schema'
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'

export { APPROVAL_KIND, ARGUMENTS_STATUS, DECISION_KIND, DECISION_KIND_OF, EVENT_TYPE, OFFER_ID, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL }

/**
 * F-FIX (the user, 2026-11-17, answering "ask cards after ask_agent removed": "Permission requests
 * become cards"): the offer types ask_user files (`ask` stays, frozen) and those it never files.
 */
export const CARDABLE = Object.freeze({
  filed: Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.ask]),
  never: Object.freeze([EVENT_TYPE.question, EVENT_TYPE.planReview]),
})

/** fishball-core's folder (tests/asks/ is two levels below it). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')
/** The F-ASKCARD "Owns" entry (the Node half; the browser half is fishball-ui's since F-UI). */
export const SUBJECT = Object.freeze({
  packageDir: PACKAGE_DIR,
  entry: path.join(PACKAGE_DIR, 'src', 'asks', 'index.js'),
  /** The module's public surface (the seam the task names). */
  exports: Object.freeze({ open: 'openAskCards', create: 'createAsks', routes: 'registerAskRoutes', constants: 'ASKS', states: 'CARD_STATE' }),
})

/**
 * K3 ask-card.d.ts: the card's fields and states, as the declaration spells them. F-FIX (the user,
 * 2026-11-17: "Show arguments and reason") adds `arguments`, `argumentsStatus` and `reason`.
 */
export const K3 = Object.freeze({
  // MULTI-0 adds `handle` and `source`, and the state `voided` (a removed / retired target, Q07).
  fields: Object.freeze(['handle', 'source', 'approvalId', 'offerId', 'sessionId', 'sessionTitle', 'question', 'arguments', 'argumentsStatus', 'reason', 'choices', 'askedAt', 'state']),
  state: Object.freeze({ open: 'open', answered: 'answered', closed: 'closed', voided: 'voided' }),
})

/** Q3 = A and the F-ASKCARD answer rule: the two choices and the answer object each one commits. */
export const ANSWER = Object.freeze({
  choices: Object.freeze([DECISION.allow, DECISION.reject]),
  allow: DECISION.allow,
  reject: DECISION.reject,
  riskOf: Object.freeze({ [DECISION.allow]: RISK.low, [DECISION.reject]: RISK.high }),
  /** The reason committed when the user's text is absent or blank. */
  defaultReason: 'The user answered on Fishball\'s card.',
})

/** The core manager tool and its refusals (F-ASKCARD requirements). */
export const ASK_TOOL = Object.freeze({ name: 'ask_user', arg: 'offer_id' })

/** Every code an oracle reads: K1's, plus the task's own `unknown-offer`. */
export const CODE = Object.freeze({
  invalidArguments: REFUSAL.invalidArguments,
  unknownSession: REFUSAL.unknownSession,
  notManaged: REFUSAL.notManaged,
  forbidden: REFUSAL.forbidden,
  unknownOffer: 'unknown-offer',
  /** ui.d.ts (MULTI-0): an unknown handle (`SEAM_TARGETS.refusal.unknownTarget`). */
  unknownTarget: SEAM_TARGETS.refusal.unknownTarget,
  expired: REFUSAL.expired,
  alreadySettled: REFUSAL.alreadySettled,
  disconnected: LINK_REFUSAL.disconnected,
  reasonRequired: REFUSAL.reasonRequired,
  argumentsIncomplete: REFUSAL.argumentsIncomplete,
  operationFailed: REFUSAL.operationFailed,
})

/** Startup reconciliation (Fishball's decision 2026-11-16): the store member F-WIRE calls once per start. */
export const RECONCILE = Object.freeze({ member: 'reconcile' })

/** `approval_answer`'s success (K1 tools.js: `{ok: true, accepted: true}`). */
export const CONNECTOR_OK = Object.freeze({ ok: true, accepted: true })

/** The two owner-only Fetch routes and their answers (F-ASKCARD requirements). */
export const ROUTE = Object.freeze({
  events: '/api/fishball/asks/events',
  answer: '/api/fishball/asks/answer',
  get: 'GET',
  post: 'POST',
  sse: 'text/event-stream',
  contentType: 'content-type',
  framePrefix: 'data: ',
  frameEnd: '\n\n',
  lineEnd: '\n',
  status: Object.freeze({ ok: 200, badRequest: 400, notFound: SEAM_TARGETS.http.notFound, conflict: 409 }),
})

/** DSH's own vocabulary (installed SDK). */
export const DSH = Object.freeze({
  cordis: 'cordis',
  llm: 'dsh-llm',
  storage: 'dsh-storage',
  storageDomain: 'dsh-storage-domain',
  storageJson: 'dsh-storage-json',
  persistence: 'dsh-session-persistence-jsonl',
  checkpoint: 'dsh-session-checkpoint-policy',
  agentLoop: 'dsh-agent-loop',
  executor: 'dsh-tool-executor-native',
  sdkPlugins: Object.freeze([
    'dsh-session', 'dsh-session-projection', 'dsh-agent',
    'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-storage',
  ]),
  block: Object.freeze({ text: 'text', toolCall: 'tool-call' }),
  /** dsh-llm StreamChunk types. */
  chunk: Object.freeze({ start: 'block-start', end: 'block-end', finish: 'finish' }),
  userRole: 'user',
  userSource: Object.freeze({ kind: 'user' }),
  noCompression: 'none',
  finish: Object.freeze({ stop: 'stop', toolCalls: 'tool-calls' }),
  toolRole: 'tool',
  idle: 'idle',
  jsonBackend: 'json',
  allLevels: 3,
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  provider: 'fbtest-fake',
  model: 'fbtest-fake',
  managerSession: 'fbtest-fishball',
  askingSession: 'fbtest-s1',
  otherSession: 'fbtest-s2',
  generation: 'fbtest-gen-1',
  /** An event id and an ask's approval id differ, so a retirement naming the wrong one is told apart. */
  eventPrefix: 'fbtest-evt-',
  approvalPrefix: 'fbtest-ask-',
  question: 'FBTEST-Q Use the staging database?',
  /** Joins the question and the ask's number, so every card's question is its own. */
  numberSeparator: ' #',
  title: 'FBTEST-T staging migration',
  toolName: 'ask_agent',
  reason: 'FBTEST-R the session asked',
  /** A descriptor's own choices (a V2 ask has none); the card still offers Allow / Reject (Q3 = A). */
  otherChoices: Object.freeze(['yes', 'no']),
  /** The descriptor's `at` and the event's `at` differ, so `askedAt` is seen to come from the descriptor. */
  askedAt: 1_800_000_000_000,
  eventAtOffsetMs: 7_000,
  emptyTitle: '',
  /** Appended to a re-offer's prompt (F-FIX re-offer rows): the replaced record's question is its own. */
  reofferSuffix: ' (re-offer r',
  /** F-FIX card detail: a call's arguments as the connector sends them (text), with markup in it. */
  argumentsText: '{"command":"rm -rf <b>build</b>","cwd":"/tmp/fbtest"}',
  /** A session reason holding markup, which the drawn card must show as text. */
  markupReason: 'FBTEST-R <img src=x onerror=alert(1)> & <script>alert(2)</script>',
  origin: 'http://127.0.0.1:4000',
  modelText: 'fbtest ok',
  callId: 'fbtest-call-',
  userId: 'fbtest-u',
  userText: 'FBTEST-USER a session asked something',
  loggerName: 'fbtest-f-askcard',
  tempPrefix: 'fbtest-f-askcard-',
  dirs: Object.freeze({ domain: 'domain', sessions: 'sessions', cwd: 'cwd' }),
  unreadableBody: '{not json',
  unknownApproval: 'fbtest-ask-unknown',
  jsonType: 'application/json',
  injectedFault: 'fbtest: injected callTool fault',
  listenerFault: 'fbtest: listener throws',
  /** Joins a source's id and epoch in the world's link map (harness key only). */
  keyJoin: '|',
  /** A string no target tuple encodes (base64url of non-JSON). */
  notAHandle: 'bm90LWEtaGFuZGxl',
  /** A user's reason, and the forms around it the BVA rows use. */
  text: 'FBTEST-WHY yes, staging is fine',
  hashAlgorithm: 'sha256',
  hashEncoding: 'hex',
})

/** ASK-BVA-01: the user's text and the reason it must commit (`undefined` = the default line). */
export const REASON_ROWS = Object.freeze([
  ['absent', undefined, undefined],
  ['empty', '', undefined],
  ['spaces only', '   ', undefined],
  ['newline and tab only', '\n\t', undefined],
  ['one character', 'x', 'x'],
  ['padded with spaces', ' x ', 'x'],
  ['padded with newlines and tabs', '\n\tx\n', 'x'],
])

/** ASK-EP-03: answers that are not `{choice, text?}` with an offered choice and a string text. */
export const INVALID_ANSWERS = Object.freeze([
  ['null', null],
  ['a string', DECISION.allow],
  ['no choice', Object.freeze({ text: 'x' })],
  ['a choice not offered (grant)', Object.freeze({ choice: DECISION.grant })],
  ['a choice in another case (Allow)', Object.freeze({ choice: 'Allow' })],
  ['text is a number', Object.freeze({ choice: DECISION.allow, text: 7 })],
  ['text is null', Object.freeze({ choice: DECISION.reject, text: null })],
])

/**
 * ASK-EP-07 (F-FIX card detail): the descriptor's `argumentsStatus` partitions and the choices each
 * one offers (ask-card.d.ts: Reject only when the status is set and not `complete`).
 */
export const DETAIL_STATUS_ROWS = Object.freeze([
  ['absent', undefined, Object.freeze([DECISION.allow, DECISION.reject])],
  [ARGUMENTS_STATUS.complete, ARGUMENTS_STATUS.complete, Object.freeze([DECISION.allow, DECISION.reject])],
  [ARGUMENTS_STATUS.truncated, ARGUMENTS_STATUS.truncated, Object.freeze([DECISION.reject])],
  [ARGUMENTS_STATUS.unavailable, ARGUMENTS_STATUS.unavailable, Object.freeze([DECISION.reject])],
])
/** ASK-BVA-03 (F-FIX card detail): the descriptor's `reason` at the blank / non-blank edge (null = shown as none). */
export const DETAIL_REASON_ROWS = Object.freeze([
  ['empty', '', null],
  ['spaces only', '   ', null],
  ['newline and tab only', '\n\t', null],
  ['one character', 'x', 'x'],
])

/** ASK-EP-01: `ask_user` arguments that are not a string offer id. */
export const INVALID_TOOL_ARGS = Object.freeze([
  ['offer_id missing', Object.freeze({})],
  ['offer_id a number', Object.freeze({ offer_id: 1 })],
  ['offer_id null', Object.freeze({ offer_id: null })],
])

/** ASK-BVA-02 / PLAT-UC-07 E1: the fake clock's advance. */
export const CLOCK = Object.freeze({ waitedMs: 48 * 60 * 60 * 1000, apis: Object.freeze(['setTimeout', 'setInterval', 'Date']) })

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ settleMs: 15000, pollMs: 20, quietMs: 300, frameMs: 5000, testMs: 120000, immediateTurns: 10 })
