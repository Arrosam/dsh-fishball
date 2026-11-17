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
import { APPROVAL_KIND, APPROVAL_DECISION as DECISION, ARGUMENTS_STATUS, RISK } from '../../../../packages/dsh-connector/mcp-schema/index.js'
import {
  DECISION_KIND, DECISION_KIND_OF, EVENT_TYPE, LINK_REFUSAL, OFFER_ID, REFUSAL, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { PACKAGE } from '../../../suites.mjs'
import { REPO } from '../../../support/constants.mjs'

export { APPROVAL_KIND, ARGUMENTS_STATUS, DECISION_KIND, DECISION_KIND_OF, EVENT_TYPE, OFFER_ID, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, TOOL }

/**
 * F-FIX (the user, 2026-11-17, answering "ask cards after ask_agent removed": "Permission requests
 * become cards"): the offer types ask_user files (`ask` stays, frozen) and those it never files.
 */
export const CARDABLE = Object.freeze({
  filed: Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.ask]),
  never: Object.freeze([EVENT_TYPE.question, EVENT_TYPE.planReview]),
})

const CORE_DIR = path.join(REPO, 'packages', 'core')
/** F-UI: the card's browser half is fishball-ui's (R-FB-14); the Node half stays core's. */
const UI_DIR = path.join(REPO, 'packages', 'fishball-ui')
/** The F-ASKCARD "Owns" files. FBTEST_F_ASKCARD_ENTRY moves the entry (another checkout). */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_F_ASKCARD_ENTRY ?? path.join(CORE_DIR, 'src', 'asks', 'index.js'),
  /** The module's public surface (the seam the task names). */
  exports: Object.freeze({ open: 'openAskCards', create: 'createAsks', routes: 'registerAskRoutes', constants: 'ASKS', states: 'CARD_STATE' }),
  /**
   * The browser half: a flat package-local chunk of fishball-ui's client (F-UI interface item 8, as
   * amended: it exports the part factory `asksPart(kit)`, which returns the client plugin).
   */
  chunk: Object.freeze({ file: path.join(UI_DIR, 'client.asks.js'), name: 'client.asks.js', owner: 'fishball-ui', export: 'asksPart' }),
  /** The manifest whose `files` ship the chunk (fishball-ui's since F-UI). */
  chunkManifest: path.join(UI_DIR, 'package.json'),
  /**
   * The pre-F-FIX module (the F-FIX base, integrate/v3-w2 @ c2995aa9), only to write a card record
   * in the old shape. `files` is its import closure at that commit.
   */
  legacy: Object.freeze({
    ref: 'c2995aa9',
    entry: 'packages/core/src/asks/index.js',
    files: Object.freeze([
      'packages/core/src/asks/index.js', 'packages/core/src/asks/store.js', 'packages/core/src/asks/routes.js', 'packages/core/src/asks/constants.js',
      'packages/core/src/link/listeners.js', 'packages/core/src/events/diagnostics.js', 'packages/core/contracts/constants.js',
    ]),
    manifest: 'package.json',
    tempPrefix: 'fbtest-f-askcard-legacy-',
  }),
})

/**
 * K3 ask-card.d.ts: the card's fields and states, as the declaration spells them. F-FIX (the user,
 * 2026-11-17: "Show arguments and reason") adds `arguments`, `argumentsStatus` and `reason`.
 */
export const K3 = Object.freeze({
  fields: Object.freeze(['approvalId', 'offerId', 'sessionId', 'sessionTitle', 'question', 'arguments', 'argumentsStatus', 'reason', 'choices', 'askedAt', 'state']),
  state: Object.freeze({ open: 'open', answered: 'answered', closed: 'closed' }),
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
  status: Object.freeze({ ok: 200, badRequest: 400, conflict: 409 }),
})

/** The packages that load in the main DSH (R-UI-12: none of them shows or reaches the card). */
export const MAIN_DSH_PACKAGES = Object.freeze([PACKAGE.dshConnector, PACKAGE.dshConnectorUi, PACKAGE.dshInstance])
/** The source files the main-DSH sweep reads, and the folder it skips (another package's copy). */
export const SWEEP = Object.freeze({ files: /\.(?:m?js|ya?ml|json)$/, skip: 'node_modules', encoding: 'utf8' })
/** What the main DSH must never name: the chunk and the card routes. */
export const MAIN_DSH_FORBIDDEN = Object.freeze([SUBJECT.chunk.name, ROUTE.events, ROUTE.answer])

/** DSH's own vocabulary (installed SDK). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  llm: '@deepseek-ai/dsh-llm',
  storage: '@deepseek-ai/dsh-storage',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  storageJson: '@deepseek-ai/dsh-storage-json',
  persistence: '@deepseek-ai/dsh-session-persistence-jsonl',
  checkpoint: '@deepseek-ai/dsh-session-checkpoint-policy',
  agentLoop: '@deepseek-ai/dsh-agent-loop',
  executor: '@deepseek-ai/dsh-tool-executor-native',
  sdkPlugins: Object.freeze([
    '@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-projection', '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-storage',
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

/**
 * ASK-UI-01 (the drawn card, render.mjs): DSH's slot the card dock sits in (dsh-web-app's
 * conversation input dock, both SDKs), the events route the page follows (ROUTE.events), and the
 * words a user reads (en): the two answer buttons and the requirement's "a note that the arguments
 * are incomplete".
 */
export const RENDER = Object.freeze({
  slot: 'conversation.input.dock',
  eventsPath: '/api/fishball/asks/events',
  managerSession: 'fbtest-fishball',
  messageEvent: 'message',
  mountKey: 'fbtest-ask-dock-',
  button: 'button',
  join: ' ',
  label: Object.freeze({ allow: /^allow\b/i, reject: /^reject\b/i }),
  incompleteNote: /\bincomplete\b/i,
})

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
