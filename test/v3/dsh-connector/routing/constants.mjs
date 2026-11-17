/**
 * Vocabulary for the C-ROUTE cases (.runtime/reports/v3-w3-briefs.md "C-ROUTE test brief";
 * v3-tasks.md row C-ROUTE): EVT-EP-01, EVT-EP-04 (end to end), EVT-DT-01, WATCH-UC-01 (main, A1,
 * A2), WATCH-UC-02, WATCH-EP-01, WATCH-ST-01 rows 1–6, HAND-EP-01, HAND-DT-01, HAND-DT-02,
 * HAND-ST-01, HAND-UC-02 (service part), PLAT-UC-03, and the K1c / K3 rules no case file numbers
 * (the ROUTE-* ids, cases.mjs).
 *
 * Every product value comes from K1 (`dsh-agent-connector/mcp-schema`: event types, refusal codes,
 * MANAGED_REFUSAL, QUEUE, RETIREMENT_REASON, OFFER_ID, CONNECTED, TOOL_NAMES), K2
 * (`dsh-agent-connector/tools`: `no-agent`, the namespace separator) or K3
 * (`host-services/handover.d.ts`, types only, so its codes are restated in HANDOVER below and
 * checked against the declaration text). Nothing comes from `packages/dsh-connector/src/routing/` or
 * `src/handover/`. The rest is fixture data and harness timing, which are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  CONNECTED, CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, ENTRY_STATUS, EVENT_TYPE, MAILBOX, MANAGED_REFUSAL, OFFER_ID, OFFER_TYPES, PATHS,
  QUEUE, REFUSAL, REQUEST_GATE, RETIREMENT_REASON, TOOL_NAMES, formatOfferId,
} from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { EMIT_REFUSAL, NAMESPACE } from '../../../../packages/dsh-connector/tools/index.js'
// K1 owns IMAGE_TYPES since C-WIRE-2 (the V2 ./contract export is gone).
import { IMAGE_TYPES } from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../../support/constants.mjs'

export {
  CONNECTED, CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, ENTRY_STATUS, EVENT_TYPE, MAILBOX, MANAGED_REFUSAL, OFFER_ID, OFFER_TYPES, PATHS,
  QUEUE, REFUSAL, REQUEST_GATE, RETIREMENT_REASON, TOOL_NAMES, formatOfferId,
}

/** K1 settlement payload values (EVENT_PAYLOAD_SHAPES.settlement `{approvalId, outcome, by}`), for the settle rows. */
export { SETTLED_BY, SETTLEMENT_OUTCOME } from '../../../../packages/dsh-connector/mcp-schema/index.js'

/** K1 `RetireOutcome` of `Mailbox.retire` (DECIDED #W3-1; types only), as C-MAILBOX's cases name it. */
export { RETIRE_OUTCOME } from '../mailbox/constants.mjs'

/** K1 `RevocationKind` (index.d.ts, types only): the values FakeTokens fires and the end-to-end row passes C-HTTP. */
export const REVOCATION = Object.freeze({ disabled: 'disabled', deleted: 'deleted' })

/**
 * C-ROUTE's "Owns" folders and the assumed entry (subject.mjs states the one assumed shape).
 * FBTEST_C_ROUTE_ENTRY moves the entry (e.g. to the dev checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_ROUTE_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'routing', 'index.js'),
  open: 'openRouting',
  /**
   * Members of the opened routing object the cases drive (subject.mjs). C-WIRE-2 (the user: "不给ask_agent工具";
   * q5 "Remove agentToken entirely"): no askAgent, askDropped or liveAsksOf; escalate and onLeft are new.
   */
  members: Object.freeze(['router', 'managed', 'handover', 'provide', 'messageAgent', 'offer', 'settle', 'withdraw', 'escalate', 'onLeft', 'liveOffers', 'endPrincipal']),
  /** C-MAILBOX's entry and its two composition functions (as test/v3/dsh-connector/mailbox/subject.mjs binds them). */
  mailboxEntry: process.env.FBTEST_C_MAILBOX_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mailbox', 'index.js'),
  mailboxOpen: 'openMailboxTables',
  mailboxCreate: 'createMailbox',
})

/** K1c `ManagedState` members (index.d.ts). */
export const MANAGED_STATE_METHODS = Object.freeze(['managerOf', 'managed', 'manage', 'release', 'onChange'])

/**
 * K3 `dshConnectorHandover` (host-services/handover.d.ts; types only). `codes` restates the
 * refusal codes; `handoverCodes()` below reads them back from the declaration so a K3 amendment
 * fails the row instead of drifting.
 */
const HANDOVER_DTS = path.join(REPO, 'packages', 'dsh-connector', 'host-services', 'handover.d.ts')
export const HANDOVER = Object.freeze({
  service: 'dshConnectorHandover',
  apiVersion: 1,
  /** Exactly these members (HAND-EP-01 row 5: no session read, approval or answer member). */
  members: Object.freeze(['apiVersion', 'managed', 'principals', 'onChange', 'handOver', 'takeBack']),
  /** C-WIRE-2 (the user's q5, "Remove agentToken entirely"): the rows carry no `designated`. */
  principalFields: Object.freeze(['key', 'name', 'id', 'online', 'enabled', 'paired']),
  refFields: Object.freeze(['key', 'name', 'id']),
  codes: Object.freeze({ unknownSession: 'unknown-session', conflict: 'conflict', noAgent: EMIT_REFUSAL.noAgent, notManaged: MANAGED_REFUSAL.notManaged }),
  /** The `note` an event carries when the call omits it (K3 README "note"). */
  omittedNote: '',
})
/** The string literals of a K3 refusal-code union (`HandOverRefusalCode`, `TakeBackRefusalCode`). */
export function handoverCodes(typeName) {
  const m = new RegExp(String.raw`export type ${typeName}\s*=([^\n]*)`).exec(fs.readFileSync(HANDOVER_DTS, 'utf8'))
  if (!m) throw new Error('handover.d.ts declares no ' + typeName)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/**
 * K1 `NoRecipient.fallback` values (index.d.ts, types only). C-WIRE-2 narrows them to these three
 * (relayed by the dev session, 2026-11-17): offers → to-user; message, turn-finished, state, notice,
 * handover, ask → dropped; contributor events → no-agent. `queue` and `unavailable` are gone with the
 * designated agent (the user's q5).
 */
export const FALLBACK = Object.freeze({
  toUser: 'to-user',
  noAgent: EMIT_REFUSAL.noAgent,
  dropped: 'dropped',
})

/**
 * Fishball's answers to this session's questions (2026-11-14, decided by Fishball, not the user),
 * named where a row relies on one.
 */
export const RELAYED = Object.freeze({
  revocation: 'C-REVOKE step 1: routing.endPrincipal ends management; C-REVOKE\'s onRevoked handler calls it (routing no longer subscribes to onRevoked)',
  offerLedger: 'Fishball 2026-11-14 #2: C-ROUTE commits offers itself and keeps their live ledger',
  roomSignal: 'Fishball 2026-11-14 #3: the mailbox port signals freed room (onAcked)',
  askManagedOffline: 'Fishball 2026-11-14 #4: an ask from a session managed by an offline P waits in P\'s mailbox',
  noticeNoD: 'Fishball 2026-11-14 #5: a notice with no D goes to the background log only',
  offersUnmanaged: 'Fishball 2026-11-14 #5: question / plan-review of an unmanaged session go to the user',
  disabledD: 'Fishball 2026-11-14 #6: a paired but disabled designated entry counts as no D',
  /** C-WIRE-2 (the user, 2026-11-16/17), quoted by the re-baselined and withdrawn rows. */
  noDesignated: 'withdrawn by C-WIRE-2: the user (q5) "Remove agentToken entirely" — no designated agent and no no-recipient queue (第三版其实就是第一版)',
  noAsk: 'withdrawn by C-WIRE-2: the user "不给ask_agent工具" — no ask_agent, so no ask offer',
  unmanagedMessage: 'C-WIRE-2 (the user, q5): a message_agent of a session nobody manages is not-managed, nothing held',
  movedToWire2: 'moved by C-WIRE-2 to test/v3/dsh-connector/interactions (the main-session tools and the approval hook on a real DSH)',
  escalate: 'C-WIRE-2 (relayed 2026-11-17): escalate(offerId) sends an offer to the user; it leaves the live offers; the user\'s answer settles it to the same pair; dropped with no retirement if its session leaves management first',
  onLeft: 'C-WIRE-2 (relayed 2026-11-17): onLeft(fn(offers)) fires once after an end of management that retired offers, [{offerId, sessionId, type}]',
  sessionSource: 'Fishball 2026-11-14 #7: C-ROUTE takes an injected session source; binding it to DSH is C-WIRE\'s',
})

/** Fixture data: keys, ids, names and texts of the case tables; not product values. */
export const FIXTURE = Object.freeze({
  /** The same key formulas as test/v3/dsh-connector/mcp-http (FIXTURE.entry, FIXTURE.principal), so the end-to-end world shares them. */
  entry: (id) => `fbtest-entry-${id}`,
  principal: (id) => `fbtest-principal-${id}`,
  label: (id) => `fbtest label ${id}`,
  ref: (id) => `fbtest-ref-${id}`,
  /** Ids of the case tables: P, Q, D (designated), HF ("Navigator"), the nameless `agent-x`. */
  ids: Object.freeze({ p: 'agent-p', q: 'agent-q', d: 'fishball-d', hf: 'navigator', x: 'agent-x' }),
  names: Object.freeze({ hf: 'Navigator', p: 'Planner', renamed: 'Indexer' }),
  /** EVT-EP-04 row 3: two ids that differ only in case (ids are case-sensitive, R-ID-02). */
  caseIds: Object.freeze({ lower: 'agent', upper: 'Agent' }),
  sessions: Object.freeze({ s1: 'fbtest-s1', s2: 'fbtest-s2', s3: 'fbtest-s3' }),
  unknownSession: 'fbtest-no-such-session',
  unknownKey: 'fbtest-no-such-principal',
  note: 'fbtest hand-over note',
  text: (n) => `FBTEST-MSG-${n}`,
  question: 'FBTEST-ASK: may I go on?',
  namespace: 'fbtest',
  contributedEvent: 'ping',
  /** The injected clock's reference instant (README "clock"). */
  epochMs: Date.UTC(2026, 10, 14),
  /** PLAT-UC-03 postcondition / PLAT-UC-02 E1's span: 48 h on the fake clock. */
  longWaitMs: 48 * 3600 * 1000,
  /** A small live `maxQueuedInputs` for the queue rows (the setting is live, K1c-3). */
  smallQueue: 3,
  /** EVT-EP-04 row 6: "100 events to P in a burst" (the case's own number). */
  burst: 100,
  tempPrefix: 'fbtest-c-route-',
  /** The secret value of a token entry: never in any answer (HAND-EP-01 row 5). */
  tokenValue: (id) => `fbtest-token-value-${id}-0123456789abcdef`,
  /** An offer descriptor's approval id prefix (OFFER_ID: `[A-Za-z0-9_-]`) and its tool name. */
  offerPrefix: 'fbtest-offer-',
  toolName: 'fbtest_tool',
  /** The entry generation FakeTokens starts at; a revocation is the next one. */
  generation: 1,
  /** A hand-over name in a tool name or path (HAND-EP-01 rows 2–3). */
  handoverToolName: /hand[-_]?over|take[-_]?back/i,
  listenerError: 'fbtest listener failure',
})

/**
 * Fixture data of the merge-review fix-1 rows (ROUTE-ST-03, ROUTE-DT-03, ROUTE-EP-02): the values a
 * caller writes into a `message_agent` payload after the call, and an offer no one made.
 */
export const MUTATION = Object.freeze({
  /** A valid replacement of the top-level `text`. */
  text: 'FBTEST-MUTATED-AFTER-THE-CALL',
  /** Valid JSON of the wrong type for `text` (a number). */
  wrongType: 42,
  /** No JSON value at all: JSON.stringify throws on a BigInt. */
  nonJson: 10n,
  /** An `images` entry that is no K1 imageRef. */
  notAnImage: 'fbtest-not-an-image',
  /** A key no K1 payload has (an extra member, or one holding a function). */
  extraKey: 'fbtestExtra',
  /** An approval id no offer was made for. */
  unknownApproval: FIXTURE.offerPrefix + 'never-offered',
  /** A valid K1 imageRef (shapes.js imageRef) for the nested partitions; its sizes are fixture data. */
  image: (n) => ({ attachmentId: `fbtest-attachment-${n}`, mediaType: IMAGE_TYPES[0], width: n, height: n, bytes: n }),
})

/** Fixture data of the settle rows: a question answer (K1 questionAnswerItem) and values no K1 settlement allows. */
export const SETTLE_FIXTURE = Object.freeze({
  answer: Object.freeze({ id: 'fbtest-question-1', selected: Object.freeze(['fbtest-option-a']) }),
  otherChoice: 'fbtest-option-b',
  badOutcome: 'fbtest-not-an-outcome',
})

/** A contributor event type of the fixture namespace (`contributed:<ns>.<event>`, K2 separator). */
export const CONTRIBUTED = CONTRIBUTED_TYPE_PREFIX + FIXTURE.namespace + NAMESPACE.separator + FIXTURE.contributedEvent

/** Harness timing only. */
export const WAIT = Object.freeze({
  testMs: 120000,
  /** How long a produced event may take to reach a mailbox. */
  eventMs: 5000,
  /** How long a mailbox that must get nothing is watched. */
  quietMs: 300,
  pollMs: 20,
})

/** Owners of rows C-ROUTE cannot check alone (v3-tasks.md W3–W4; the brief's "Not yours"). */
export const LATER = Object.freeze({
  wire: 'C-WIRE (binding the session source to a real DSH session controller on both SDKs; Fishball 2026-11-14 #7)',
  wireRoutes: 'C-WIRE (the connector row: nothing but its listed routes is served; the service is a Cordis service of this process only)',
  wireToUser: 'C-WIRE (DSH approval binding: a retired or unmanaged offer is answered by the user in the session)',
})

/**
 * R-FIX-CONNECTOR review rows (review-x-cases.mjs, findings F01, F04, F05, F08, F09 of
 * .runtime/reports/review-x-dsh-connector.md). Product words are K1's (imported where used) or DSH's
 * own, restated here as the installed SDKs spell them; the rest is fixture data.
 */
export const REVIEW_X = Object.freeze({
  /** The session domain's composition entry (C-WIRE's), and the session-info module F09 names. */
  domainEntry: path.join(REPO, 'packages', 'dsh-connector', 'src', 'wire', 'domain.js'),
  domainFactory: 'createSessionDomain',
  grantsEntry: path.join(REPO, 'packages', 'dsh-connector', 'src', 'domain', 'grants.js'),
  grantsFactory: 'createGrants',
  sessionInfoEntry: path.join(REPO, 'packages', 'dsh-connector', 'src', 'session-info.js'),
  /** F09: the V2 helpers that go, and the shared ones that stay. */
  removedExports: Object.freeze(['describeSession', 'lastSeqOf', 'readSessionMessages']),
  keptExports: Object.freeze(['rootSessionOf', 'isSessionGone', 'titleOf', 'senderOf', 'textOfEvent']),
  /** The storage domains a fault is injected into (the grants' and routing's managed table). */
  grantsDomain: Object.freeze({ domain: 'dsh_connector_grants', table: 'grants' }),
  managedDomain: Object.freeze({ domain: 'dsh_connector_routing', table: 'managed' }),
  /** DSH's words: the approval waterfall, its outcomes, and the log facts a call's arguments come from. */
  dsh: Object.freeze({
    approvalWaterfall: 'approval/request',
    outcome: Object.freeze({ allowed: 'allowed-once', rejected: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' }),
    assistantEvent: 'assistant/message',
    toolCallBlock: 'tool-call',
    /** The DSH services the session port requires on its context (stubs: no session is ever attached). */
    services: Object.freeze(['sessions', 'sessionController', 'agents', 'workspaceRegistry']),
  }),
  /** The session domain's live limits (only the argument excerpt is read on this path). */
  readLimits: Object.freeze({ argumentExcerptBytes: 8192, maxMessageBytes: 65536, readSessionMessages: 12, readSessionBytes: 12288 }),
  /** Fixture data. */
  ids: Object.freeze({ a: 'agent-a', b: 'agent-b' }),
  sessions: Object.freeze({ s: 'fbtest-rx-s', t: 'fbtest-rx-t' }),
  shellTool: 'bash',
  shellArgument: 'command',
  command: (n) => `fbtest-rx-command-${n}`,
  reason: 'Do not run',
  allowReason: 'fbtest allow reason',
  dshReason: 'fbtest rx permission',
  grantMs: 3600 * 1000,
  injected: 'fbtest rx injected storage failure',
  /** The fake grants clock and its one-tick boundary (BVA of an end time). */
  t0: Date.UTC(2026, 10, 18),
  tickMs: 1,
})
