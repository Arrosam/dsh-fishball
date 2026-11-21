/**
 * Vocabulary of the C-WIRE-2 interactions cases (USE-CASES.md). Product values come only from:
 * - K1 `dsh-agent-connector/mcp-schema` (tools, refusal codes, event types, offer ids, the payload limits
 *   and the vocabularies C-WIRE-2 moved into K1: APPROVAL_DECISION, RISK, GRANT_KIND, …);
 * - the C-WIRE world's constants (wire/constants.mjs: settings keys, services, the row id);
 * - the user's decisions of 2026-11-16/17 and the surface the dev session relayed for C-WIRE-2
 *   (RELAYED below: the message_agent notes, the rejection wording, the settings defaults).
 * DSH's own words (its tool names, events, approval outcomes and question codes) are restated in
 * IX.dsh as the installed SDKs spell them. Everything else is fixture data or harness timing.
 */
import path from 'node:path'
import * as K1 from '../../mcp-schema/index.js'
import { FAKE } from '../../../../test/support/constants.mjs'
import { BUDGET as WIRE_BUDGET, ENV, FIXTURE as WIRE_FIXTURE, SURFACE } from '../wire/constants.mjs'

export { K1, SURFACE }

export const {
  TOOL, REFUSAL, EVENT_TYPE, OFFER_ID, DECISION_KIND, SETTLEMENT_OUTCOME, SETTLED_BY, RETIREMENT_REASON, APPROVAL_DECISION, RISK,
  GRANT_KIND, APPROVAL_KIND, PAYLOAD_LIMITS, ARGUMENTS_STATUS, PLAN_REVIEW, formatOfferId,
} = K1

/**
 * What the dev session relayed for C-WIRE-2 (2026-11-17), and the user's decisions it implements.
 * The user's words are quoted where a row relies on them.
 */
export const RELAYED = Object.freeze({
  /** message_agent's tool name and results. */
  messageTool: 'message_agent',
  messageArg: 'message',
  delivered: 'Delivered to the agent that manages this session.',
  duplicate: 'The managing agent already has this message.',
  messageCode: Object.freeze({ empty: 'empty', tooLarge: 'too-large', notManaged: 'not-managed', queueFull: 'queue-full' }),
  /** A principal's reject as the session agent reads it (a blocked tool result). */
  rejected: (reason) => 'The managing agent rejected this call: ' + reason,
  /** The descriptor's `choices` of a permission request. */
  approvalChoices: Object.freeze(['allow', 'grant', 'reject', 'escalate']),
  /** A permission request's approval id: apr_ + 32 lowercase hex. */
  approvalId: /^apr_[0-9a-f]{32}$/,
  /** A question's or plan review's request id (its approvalId): qst_ + 32 lowercase hex, kept from V2 (relayed 2026-11-17). */
  questionId: /^qst_[0-9a-f]{32}$/,
  /** The kept limits and their defaults (Config({}) as relayed): top-level fields of the row's settings. */
  kept: Object.freeze({ maxQueuedInputs: 200, maxMessageBytes: 65536, argumentExcerptBytes: 8192, readSessionMessages: 12, readSessionBytes: 12288 }),
  /** The settings field names (keys of `kept`, plus the approval group's DSH name). */
  setting: Object.freeze({ maxQueuedInputs: 'maxQueuedInputs', maxMessageBytes: 'maxMessageBytes', argumentExcerptBytes: 'argumentExcerptBytes', approval: 'approval', dshName: 'dshName', tokens: 'tokens' }),
  /** The settings fields the user removed (decision list item 9). */
  removed: Object.freeze(['maxPendingApprovals', 'maxActiveWatches', 'watchesShown', 'auditEntriesKept', 'rationaleChars', 'requestUserMessageBytes',
    'forwardExcerptBytes', 'userMessagesListed', 'userMessageExcerptChars', 'questionMode']),
  /** The tools the user deleted (no ask_agent, no list_user_messages). */
  deletedTools: Object.freeze(['ask_agent', 'list_user_messages']),
  /** Prefix grants apply to these tools only, on these argument fields. */
  prefixTools: Object.freeze({ bash: 'command', pwsh: 'command', terminal_send: 'text' }),
  promptKeys: Object.freeze(['argumentsStatus', 'managed', 'promptId', 'sessionId', 'since', 'title', 'toolName']),
  settlementWithAnswers: 'answers',
  /** X-SEC X-02: the member approval_answer no longer declares. */
  questionMember: 'question',
})

/** The user's decisions (2026-11-16/17), quoted by the rows that rely on them. */
export const DECISION_TEXT = Object.freeze({
  noAsk: '不给ask_agent工具',
  noList: 'list_user_messages is deleted',
  noCap: 'No cap on pending approvals. Requests from managed sessions wait in the queue indefinitely and are never refused for being too many',
  q1: 'q1: an `ask` decision on a permission request — "Refuse it"',
  q2: 'q2: a managed question opens its own card too; the first answer wins',
  q3: 'q3: a grant "Still covers" while the agent is disconnected',
  q5: 'q5: "Remove agentToken entirely"',
  q6: 'q6: no approval or decision audit',
  q7: 'q7: "an escalated prompt is the user\'s"',
  own: 'Agent不能回答不归自己管的会话，只能操作自己管的会话',
  v1: '第三版其实就是第一版',
})

/** DSH's own words (installed SDKs 0.2.1-rc.5 and 0.2.2-rc.1). */
export const IX = Object.freeze({
  dsh: Object.freeze({
    presetPackage: '@deepseek-ai/dsh-agent-preset',
    timeRow: 'time-context', timePackage: '@deepseek-ai/dsh-time-context',
    askRow: 'tool-ask-user', askPackage: '@deepseek-ai/dsh-tool-ask-user', timedMode: 'timed',
    sandboxPolicyPackage: 'dsh-sandbox-policy',
    approvalService: 'approval',
    approvalEvent: 'approval/request', questionEvent: 'user-questions/request', agentCreated: 'agent/created',
    toolResult: 'tool/result', userMessage: 'user/message',
    userSource: 'user', running: 'running', idle: 'idle',
    workDir: 'work',
    /** DSH's attachment store under DSH_HOME (dsh-attachment-local: `DSH_HOME/attachments/v1`). */
    attachmentsDir: 'attachments',
    planOn: '/plan', planOff: '/plan off',
    askTool: 'ask_user_question', planTool: 'exit_plan_mode', subagentTool: 'subagent', runCode: 'run_code',
    /** exit_plan_mode's result words (dsh-plan-mode). */
    planApproved: /Plan approved/,
    keepPlanning: /keep planning/i,
    planModeOff: /Plan mode off\./,
    planInactive: /already inactive/i,
    standardPreset: 'standard',
    ptcEnv: Object.freeze({ DSH_TOOLS_MODE: 'ptc' }),
    fullAccess: 'danger-full-access',
    ptcInner: /:ptc:/,
  }),
  fake: FAKE,
  /** The V2 surface the user removed (decision list item 9): its services and routes. */
  v2: Object.freeze({
    sessionState: 'fishballSessionState',
    routes: Object.freeze(['/api/fishball/state', '/api/fishball/requests/answer', '/api/fishball/questions/answer', '/api/fishball/watches']),
    badRequest: 400,
  }),
  /** The fixture bundle (package name = row id) and its folder beside this file. */
  fixtureRow: Object.freeze({ name: 'fbix-tools', dir: 'fixture-bundle' }),
  /** The scripted delegate of delegate-cases.mjs (extension.mjs `delegateScript`). */
  delegate: Object.freeze({
    service: 'dshConnectorSessions', name: 'fbix-delegate', throws: 'fbix-delegate-throws',
    /** The offer's delegate outcome words and the invalid-answer reason (the user, 2026-11-21). */
    outcome: Object.freeze({ passed: 'passed', failed: 'failed' }), invalidVerdict: 'invalid-verdict',
  }),
  /** extension.mjs serviceStart: dshConnectorSessions.start with a scripted afterManaged (start-cases.mjs). */
  start: Object.freeze({
    mode: Object.freeze({ none: 'none', record: 'record', throws: 'throws', rejects: 'rejects' }),
    thrown: 'fbix-after-managed-throws',
    holdMs: 400,
    /** A failure is "logged": a warn or error line, not DSH's own client-module warning every boot of this harness writes. */
    logTypes: Object.freeze(['warn', 'error']),
    bootNoiseLogger: 'client-module-registry',
  }),
  /** DSH approval outcomes (dsh-user-approval). */
  outcome: Object.freeze({ allowed: 'allowed-once', rejected: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable', notAsked: 'not-asked' }),
  policy: Object.freeze({ ask: 'ask', never: 'never' }),
  /** Stand-in modes of the stock prompt. */
  stock: Object.freeze({ hold: 'hold', throws: 'throw', throwMessage: 'fbtest stock prompt failed' }),
  card: Object.freeze({ open: 'open', closed: 'closed', answered: 'answered', abortedCode: 'ASK_ABORTED', cancelledCode: 'ASK_CANCELLED', errorName: 'UserQuestionError' }),
  planReviewKind: PLAN_REVIEW,
  timedDefaultSeconds: 120,
  preset: Object.freeze({ bare: 'fbix-bare', ask: 'fbix-ask', askTimed: 'fbix-ask-timed', order: 90 }),
  keptPrefix: 'session-fbix-kept-',
  fixture: Object.freeze({
    askTool: 'fbtest_ask',
    echoTool: 'fbtest_echo',
    terminalOpen: 'terminal_open',
    otherTool: 'fbtest_other_tool',
    /** [name, asks] — the root fixture tools the extension registers. */
    tools: Object.freeze([['bash', true], ['pwsh', true], ['terminal_send', true], ['terminal_open', true], ['fbtest_ask', true], ['fbtest_echo', false]]),
    parameters: Object.freeze({
      type: 'object',
      properties: Object.freeze({
        command: Object.freeze({ type: 'string' }), text: Object.freeze({ type: 'string' }), pad: Object.freeze({ type: 'string' }),
        nocall: Object.freeze({ type: 'boolean' }), fakecall: Object.freeze({ type: 'boolean' }), as: Object.freeze({ type: 'string' }),
      }),
    }),
    description: (name) => 'fbtest fixture ' + name + ': asks for approval in its body.',
    reason: (text) => 'fbtest asks for ' + text,
    outcomeText: (outcome) => 'outcome=' + outcome,
    echoed: (text) => 'echo=' + text,
    nowhereCallId: 'call_fbtest_nowhere',
  }),
})

/** The worker extension and the scenario options of this suite. */
export const WORLD = Object.freeze({
  extension: path.join(import.meta.dirname, 'extension.mjs'),
  envKey: ENV.extension,
  scenario: Object.freeze({ main: 'ix-main', ptc: 'ix-ptc', restart: 'ix-restart', grants: 'ix-grants', questions: 'ix-questions', limits: 'ix-limits', coldRoot: 'ix-cold-root' }),
})

/** Fixture data (not product values). */
export const FIXTURE = Object.freeze({
  ...WIRE_FIXTURE,
  label: Object.freeze({ p: 'IX principal P', q: 'IX principal Q' }),
  idBase: 'ix-agent',
  folder: 'ix-work',
  tokenPrefix: 'IX',
  reason: 'fbtest: the user allows tests in its own folder',
  otherReason: 'fbtest: second thoughts',
  /** A smaller live maxMessageBytes so the BVA rows stay cheap. */
  smallBytes: 64,
  /** Room above what P already holds, so a turn's own watch events cannot fill the box again. */
  queueRoom: 20,
  /** argumentExcerptBytes for the truncation rows; a pad of 2-byte characters. */
  twoByte: '\u00e9',
  euro: '\u20ac',
  astral: '\u{1F600}',
  padUnit: 'a',
  padChars: 30,
  wideBytesPad: 200,
  shortExcerpt: 40,
  /** Grants. */
  npmTest: 'npm test',
  hourMs: 3600 * 1000,
  yearMs: 365 * 24 * 3600 * 1000,
  secondMs: 1000,
  beyondTimeRange: 8.64e15 + 1,
  gitPush: 'npm test && git push',
  single: (t) => [{ id: 'color', question: 'Which colour? ' + t, options: [{ label: 'Red' }, { label: 'Blue' }] }],
  mixed: (t) => [
    { id: 'color', question: 'Which colour? ' + t, options: [{ label: 'Red' }, { label: 'Blue' }] },
    { id: 'parts', question: 'Which parts? ' + t, multi_select: true, options: [{ label: 'Docs' }, { label: 'Tests' }, { label: 'Code' }] },
    { id: 'name', question: 'Branch name? ' + t },
  ],
  answer: Object.freeze({ blue: Object.freeze([{ id: 'color', selected: ['Blue'] }]), red: Object.freeze([{ id: 'color', selected: ['Red'] }]) }),
  planText: (t) => '# Plan ' + t + '\n\nStep one. Step two.',
  unknownApprovalId: 'apr_0123456789abcdef0123456789abcdef',
  unknownGrant: 'grt_fbtest_no_such_grant',
  unknownPrompt: 'prompt-fbtest-none',
  read: Object.freeze({ maxMessages: 50, maxBytes: 65536 }),
  /** More pending requests than V2's maxPendingApprovals default (8) ever allowed. */
  noCapCount: 10,
  /** A grant that ends soon (END-01), and a timed question's own timeout in seconds (HLD-01). */
  shortGrantMs: 4000,
  timedSeconds: 1,
  /** The one above JavaScript's safe-integer range (expires-at-invalid). */
  unsafeInteger: 2 ** 53 + 2,
  manyQuestions: (t, n) => Array.from({ length: n }, (_, i) => ({ id: 'q' + (i + 1), question: 'Question ' + (i + 1) + ' ' + t })),
  manyOptions: (t, n) => [{ id: 'many', question: 'Pick ' + t, multi_select: true, options: Array.from({ length: n }, (_, i) => ({ label: 'L' + (i + 1) })) }],
  free: (t) => [{ id: 'free', question: 'Anything? ' + t }],
  longLabel: (t, n) => [{ id: 'long', question: 'Long? ' + t, options: [{ label: 'c'.repeat(n) }, { label: 'short' }] }],
  /** Prefix-grant table (GRT-04): the command after the prefix `npm test`, and whether it is covered. */
  prefixTable: Object.freeze([
    ['exact', 'npm test', true], ['longer', 'npm test --watch', true], ['npm testing', 'npm testing', true], ['chained', 'npm test && git push', true],
    ['shorter', 'npm tes', false], ['other word', 'npx test', false], ['other case', 'NPM test', false], ['double space', 'npm  test', false], ['not at start', 'run npm test', false],
  ]),
})

/**
 * The managed-request lifecycle fix (lifecycle-cases.mjs; requirements R1…R9 relayed by the lead,
 * 2026-11-21): a toUser / escalate hands the request to the user without settling it; an asking call
 * ended by its own run_code program (its deadline, or the program ending with the ask unawaited)
 * keeps the question open and the principal's answer is delivered into the session as a message;
 * the user's own Stop or dismissal still withdraws it.
 */
export const LIFECYCLE = Object.freeze({
  /** K1 NOTICE.codes.questionCallEnded, and the notice's text naming the question as still open. */
  noticeCode: K1.NOTICE.codes.questionCallEnded,
  noticeOpen: /open/i,
  /** The kind of the JSON message an answer to an ended question is delivered as. */
  endedAnswerKind: 'answer_to_ended_question',
  /** The run_code deadline of the R4 rows: long enough for the question event, short for the suite. */
  deadlineMs: 4000,
  /** How long the R4 "finishes with the ask unawaited" program waits before it ends. */
  unawaitedMs: 3000,
  /** The scripted delegate's verdict that leaves a request to the manager (R8). */
  delegatePass: 'pass',
  noRunCode: 'run_code is not offered on this SDK (harness: DSH 0.2.2 ignores DSH_TOOLS_MODE)',
  id: Object.freeze({
    toUser: 'LIF-R1', userAfterToUser: 'LIF-R3', escalate: 'LIF-R2', silence: 'LIF-R7', ended: 'LIF-R6',
    callEnded: 'LIF-R4', userEnds: 'LIF-R5', delegate: 'LIF-R8',
  }),
})

/** Harness timing only. */
export const BUDGET = Object.freeze({ ...WIRE_BUDGET, eventMs: 30000, quietMs: 2000 })

// X-09's pacing inputs (XSEC.pace). The stock SDK's callTool sends one `tools/call` POST per put (it
// lists tools again only to recover from a header mismatch). The headroom covers what the principal's
// connection spent before the puts (initialize, initialized, pair; the OAuth token request goes to the
// token endpoint, not the MCP bucket), with room to spare. MINUTE_MS turns requestsPerMinute into a rate.
const PACE_REQUESTS_PER_PUT = 1
const PACE_HEADROOM_REQUESTS = 10
const MINUTE_MS = 60 * K1.TIME_UNIT.msPerSecond

/** The review fixes and X-SEC rows of this suite (xsec-cases.mjs; relayed 2026-11-17). */
export const XSEC = Object.freeze({
  id: Object.freeze({ rv01: 'C-WIRE-2 RV-01', rv02: 'C-WIRE-2 RV-02', rv03: 'C-WIRE-2 RV-03', rv04: 'C-WIRE-2 RV-04', x08: 'X-SEC X-08', x09: 'X-SEC X-09' }),
  /** The hostRef cap the requirements name (X-09: "past the 256-hostRef cap"). */
  hostRefCap: 256,
  /**
   * X-09's pacing under the MCP endpoint's token bucket (K1 ENDPOINT_LIMITS: one bucket per token
   * entry, refilled continuously). The cap + 1 puts are more than one burst holds, so unpaced they
   * are refused with 429 before the cap is reached. The first `burstPuts` puts spend the burst less
   * the headroom; every later put first waits `refillMs`, the time the bucket takes to refill what
   * one put costs, so the bucket never runs dry. Harness timing only, not an oracle.
   */
  pace: Object.freeze({
    burstPuts: (K1.ENDPOINT_LIMITS.requestBurst - PACE_HEADROOM_REQUESTS) / PACE_REQUESTS_PER_PUT,
    refillMs: PACE_REQUESTS_PER_PUT * MINUTE_MS / K1.ENDPOINT_LIMITS.requestsPerMinute,
  }),
  instanceId: 'fbix-hosted-instance',
  /** Own boots: one disables the connector row; one fills the shared hostRef table; one holds grant rows. */
  scenario: Object.freeze({ close: 'ix-close', attachments: 'ix-attachments', grants: 'ix-grants-x08' }),
})

/**
 * IX-MULTI (multi-agent-cases.mjs): one DSH, several agents (several Fishball instances or other
 * paired principals). Fixture names: two named, one unicode right-to-left name (Arabic letters, no
 * bidi control: K1 refuses Cc/Cf), a rename target, and Fishball's default name, which every
 * Fishball instance asks for when its owner set none (dsh-fishball identity: defaultName 'Fishball').
 */
export const MULTI_AGENT = Object.freeze({
  id: 'IX-MULTI',
  scenario: Object.freeze({ names: 'ix-multi-names', reorder: 'ix-multi-reorder', rename: 'ix-multi-rename', handOver: 'ix-multi-handover', fishball: 'ix-multi-fishball', freed: 'ix-multi-freed' }),
  label: Object.freeze({ first: 'IX multi first', second: 'IX multi second', rtl: 'IX multi rtl', nameless: 'IX multi nameless', disabled: 'IX multi disabled', never: 'IX multi never pairs' }),
  name: Object.freeze({ first: 'Fishball', second: 'Fishball Two', rtl: 'سمكة 🐟 بحر', disabled: 'Fishball Off', renamed: 'Fishball Second' }),
  defaultName: 'Fishball',
  /** The default name in another letter case: uniqueness is case-folded (R-NAME-02). */
  folded: 'FISHBALL',
  /** The UI backend's stream route and its frame (src/ui is not read: the C-UI-BACKEND suite's relayed surface). */
  events: '/api/dsh-connector/ui/events',
  frame: Object.freeze({ prefix: 'data: ', end: '\n\n' }),
  /** K1 pair result words. */
  nameTaken: 'name-taken',
})
