/**
 * Vocabulary for the C-SUCCEED cases (v3-w4-briefs.md "C-SUCCEED"; the dev session's relayed surface
 * and its Amendment 1, 2026-11-16): HOST-UC-03, HOST-DT-02, HOST-ST-02, NAME-ST-01 rows 8–9, HAND-ST-01
 * row 7, WATCH-EP-01 row 6, WATCH-ST-01 row 6, PLAT-ST-01 row 7, the K1d `Mailbox.transfer` rows and
 * the K3 `dshConnectorTokens` members (`createHosted`, `entryState`, `retire`).
 *
 * Product values come from K1 / K1d (`dsh-agent-connector/mcp-schema`) and K3 (`host-services/tokens.d.ts`,
 * types only, so its literals are restated here and read back from the declaration text by
 * `k3Literals`). The hosted module's own names (SUBJECT) and the storage domain names (DOMAIN) are
 * the surface the dev session relayed. Nothing comes from `packages/dsh-connector/src/`. The rest is
 * fixture data and harness timing, which are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  DECISION_KIND_OF, EVENT_TYPE, MAILBOX, NAME_RULES, OFFER_ID, OFFER_TYPES, QUEUE, REFUSAL, RESOURCE, RETIREMENT_REASON, REVOCATION_KIND,
  SCOPE, SETTLED_BY, SETTLEMENT_OUTCOME, TIME_UNIT, TOOL, formatOfferId, nameKey, principalLabel,
} from '../../mcp-schema/index.js'
// K1 owns these vocabularies since C-WIRE-2 (the V2 ./contract export is gone).
import { APPROVAL_DECISION as DECISION, RISK } from '../../mcp-schema/index.js'
import { REPO } from 'dsh-connector-test-helpers/legacy'

export {
  DECISION, DECISION_KIND_OF, EVENT_TYPE, MAILBOX, NAME_RULES, OFFER_ID, OFFER_TYPES, QUEUE, REFUSAL, RESOURCE, RETIREMENT_REASON,
  REVOCATION_KIND, RISK, SCOPE, SETTLED_BY, SETTLEMENT_OUTCOME, TIME_UNIT, TOOL, formatOfferId, nameKey, principalLabel,
}
/** The hosted entry's label (K3 HostedTokenEntry.label) and a generated value's grammar (K1 TOKEN_VALUE), as the C-TOKENS suite names them. */
export { HOSTED_LABEL, VALUE_ANYWHERE, VALUE_PATTERN } from '../tokens/constants.mjs'
/** Logger levels that count as "logged" (the level is not frozen), as the C-REVOKE suite names them. */
export { LOGGED_LEVELS } from '../revocation/constants.mjs'

/**
 * The relayed surface of `packages/dsh-connector/src/hosted/index.js` (dev session 2026-11-16,
 * Amendment 1). FBTEST_C_SUCCEED_ENTRY moves the entry (another checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_SUCCEED_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'hosted', 'index.js'),
  owner: 'C-SUCCEED "Owns" packages/dsh-connector/src/hosted/',
  open: 'openHostedStore',
  create: 'createHostedTokens',
  /** The exported values the cases read (Amendment 1). */
  values: Object.freeze(['HOSTED_SERVICE', 'HOSTED_TIMING', 'HOSTED_ENTRY_STATE', 'RETIRE_REFUSAL', 'SUCCESSION_NOTE', 'HostedServiceError']),
  /** Routing members this suite drives beyond the C-ROUTE list (the relayed succession surface). */
  /** C-WIRE-2: no askAgent (the user, "不给ask_agent工具"). */
  routingMembers: Object.freeze(['succeedPrincipal', 'liveOffers', 'offer', 'settle', 'withdraw']),
  /**
   * The C-MAILBOX member routing's port needs for the succession (phase 3, 2026-11-16; not K1; it
   * replaces Amendment 1's `transferReversible`): `stage(from, to) → Promise<{movedIds,
   * commit(draft), confirm(), undo(sourceSessions)}>`.
   */
  stagedTransfer: 'stage',
  /** createHostedTokens' result members (phase 3: `resume` added, C-WIRE calls it once at start). */
  made: Object.freeze(['service', 'resume', 'close']),
  /** The hosted record's optional field naming the successor entry, set before the commit point (phase 3). */
  succeededBy: 'succeededBy',
})

/** C-WIRE-2's withdrawals of this suite's rows (the user's decisions, 2026-11-16/17). */
export const WITHDRAWN = Object.freeze({
  designated: 'withdrawn by C-WIRE-2: the user (q5) "Remove agentToken entirely" — no designated role, so the succession moves sessions and name but no role (第三版其实就是第一版)',
  ask: 'withdrawn by C-WIRE-2: the user "不给ask_agent工具" — no ask_agent, so no live ask to move',
})

/** The relayed contract (phase 3): HOSTED_TIMING.retryMs is still 30 s, derived from K1 TIME_UNIT. */
export const SUCCEED_TIMING = Object.freeze({ retrySeconds: 30 })

/** The storage domains of the connector's modules (relayed by the dev session, 2026-11-16). */
export const DOMAIN = Object.freeze({
  routing: 'dsh_connector_routing',
  managedTable: 'managed',
  pairs: 'dsh_connector_pairs',
  mailbox: 'dsh_connector_mailbox',
  hosted: 'dsh_connector_hosted',
  hostedTable: 'entries',
  tokens: 'dsh_connector_tokens',
})

/** K3 `dshConnectorTokens` (host-services/tokens.d.ts; types only). `codes` restates its literals; `k3Literals` reads them back. */
const TOKENS_DTS = path.join(REPO, 'packages', 'dsh-connector', 'host-services', 'tokens.d.ts')
export const K3 = Object.freeze({
  service: 'dshConnectorTokens',
  apiVersion: 1,
  // K3 I-SUCCEED added onChange; 283748d7 added hosted recovery methods (host-services/tokens.d.ts).
  // The methods are optional for older providers, but this connector supplies all three.
  members: Object.freeze([
    'apiVersion', 'createHosted', 'entryState', 'retire', 'onChange',
    'hostedState', 'matchHosted', 'discardHosted',
  ]),
  createdFields: Object.freeze(['entryKey', 'label', 'value']),
  codes: Object.freeze({
    unknownEntry: 'unknown-entry', notHosted: 'not-hosted', successorUnpaired: REFUSAL.successorUnpaired, operationFailed: REFUSAL.operationFailed,
  }),
  states: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
  types: Object.freeze({ retire: 'RetireRefusalCode', state: 'HostedEntryState', create: 'CreateHostedErrorCode' }),
})
/** The string literals of a K3 union type in tokens.d.ts (a K3 amendment then fails a row instead of drifting). */
export function k3Literals(typeName) {
  const m = new RegExp(String.raw`export type ${typeName}\s*=([^\n]*)`).exec(fs.readFileSync(TOKENS_DTS, 'utf8'))
  if (!m) throw new Error('tokens.d.ts declares no ' + typeName)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}

/** What the seam (fakes.mjs Seam) records: a storage write or a port call. */
export const STEP = Object.freeze({ write: 'write', call: 'call' })
/** The ports whose calls the seam records, and their members. */
export const PORT = Object.freeze({
  mailbox: 'mailbox',
  writer: 'settings-writer',
  notes: 'session-notes',
})
export const CALL = Object.freeze({
  commit: 'commit', retire: 'retire', transfer: 'transfer', ack: 'ack', stage: SUBJECT.stagedTransfer,
  /** The staged transfer's handle members the seam journals (as `mailbox.stage.commit` / `mailbox.stage.undo`). */
  stagedCommit: `${SUBJECT.stagedTransfer}.commit`, stagedUndo: `${SUBJECT.stagedTransfer}.undo`,
  // C-WIRE-2 (q5): the SettingsWriter has no setDesignated.
  addToken: 'addToken', removeToken: 'removeToken',
  system: 'system',
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-c-succeed-',
  /** The instance's own non-secret id (K3 createHosted's argument), and a second instance's. */
  instance: 'fbtest-instance-1',
  otherInstance: 'fbtest-instance-2',
  /** BVA of "a non-empty string": the shortest one. */
  shortestInstance: 'i',
  /** createHosted's instanceId partitions that are not a non-empty string. */
  badInstances: Object.freeze({ 'empty string': '', undefined, null: null, number: 42, object: Object.freeze({}), array: Object.freeze([]) }),
  /** HOST-UC-03: the old and new child ids, a third principal Q (user-made), a later successor. */
  ids: Object.freeze({ old: 'fb-old', new: 'fb-new', next: 'fb-next', q: 'agent-q' }),
  names: Object.freeze({ navigator: 'Navigator', successorOwn: 'Scout', q: 'Quill' }),
  /** S1, S2 managed by Eo; S3 by Q; S4 by En before the succession. */
  sessions: Object.freeze({ s1: 'fbtest-s1', s2: 'fbtest-s2', s3: 'fbtest-s3', s4: 'fbtest-s4' }),
  userLabel: 'fbtest user-made entry',
  unknownEntry: 'fbtest-entry-no-such-entry',
  injected: 'fbtest injected failure',
  refusedSave: 'fbtest: the settings sync refused the save',
  reason: 'fbtest reason',
  /** A plain message's text (e2 of HOST-UC-03, the BVA rows' events). */
  text: (n) => `FBTEST-SUCC-${n}`,
  /** BVA of the managed-session count. */
  sessionCounts: Object.freeze([0, 1, 2]),
  /** The K1d transfer rows' two mailboxes and a key nobody committed to. */
  from: 'fbtest-principal-from',
  to: 'fbtest-principal-to',
  nobody: 'fbtest-principal-nobody',
  /** A third mailbox (the stage rows' second source). */
  third: 'fbtest-principal-third',
  /** Mailbox.transfer's key partitions that are misuse (K1d: not a non-empty string, or both the same). */
  badTransfers: Object.freeze({
    'empty from': Object.freeze(['', 'fbtest-principal-to']), 'empty to': Object.freeze(['fbtest-principal-from', '']),
    'number from': Object.freeze([42, 'fbtest-principal-to']), 'undefined to': Object.freeze(['fbtest-principal-from', undefined]),
    'from === to': Object.freeze(['fbtest-principal-from', 'fbtest-principal-from']),
  }),
  /** How many retry rounds a post-commit row lets the timers run before it gives up. */
  retryRounds: 3,
  /** The C-TOOLS world's MCP client and loopback (as packages/dsh-connector/tests/mcp-tools). */
  loopback: '127.0.0.1',
  urlBase: 'http://fbtest.invalid',
  clientInfo: Object.freeze({ name: 'fbtest-c-succeed', version: '0.0.0' }),
  accessToken: (id) => `fbtest-at-${Buffer.from(id).toString('base64url')}`,
})

/** Case ids of this suite's own rows (the rules no case file numbers: the K3 members and the K1d transfer). */
export const CASE = Object.freeze({
  uc03: 'HOST-UC-03', dt02: 'HOST-DT-02', st02: 'HOST-ST-02', nameSt01: 'NAME-ST-01', handSt01: 'HAND-ST-01', watchEp01: 'WATCH-EP-01',
  watchSt01: 'WATCH-ST-01', platSt01: 'PLAT-ST-01', transfer: 'K1d-TRANSFER', stage: 'SUCC-STAGE-01',
  service: 'SUCC-EP-01', create: 'SUCC-EP-02', state: 'SUCC-EP-03', offers: 'SUCC-EP-04', createDt: 'SUCC-DT-01', refusalDt: 'SUCC-DT-02',
  stepDt: 'SUCC-DT-03', bva: 'SUCC-BVA-01', post: 'SUCC-ST-01',
})

/** Harness timing only. */
export const WAIT = Object.freeze({
  testMs: 120000,
  /** How long a promise that must not settle is watched. */
  quietMs: 300,
  /** The failure sweep opens one world per step of the succession. */
  sweepMs: 900000,
})

/** Rows this suite cannot check alone: each names its owner. */
export const LATER = Object.freeze({
  instance: 'I-HOST (the instance decides when to call retire: reinstall, Retry after a user delete, restart)',
  wire: 'C-WIRE (the service provided as dshConnectorTokens, and the SessionNotes port on a real DSH: the note starts no turn)',
})

/** R-FIX-CONNECTOR review rows (review-x-cases.mjs, finding F03): the row id. */
export const REVIEW_X = Object.freeze({ id: 'RX-F03' })
