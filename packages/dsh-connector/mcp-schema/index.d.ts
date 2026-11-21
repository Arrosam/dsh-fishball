/**
 * Types of `dsh-connector/mcp-schema` (task K1). The values are in `index.js`; the prose
 * freeze is `README.md`. The interfaces under "Internal module interfaces" are the seams the W2
 * tasks build and test against with fakes (v3-tasks.md W2); they are connector-internal, never a
 * DSH service and never reachable over MCP or HTTP.
 */
import type { JsonSchemaNode, JsonSchemaObject, JsonValue } from '../tools/index.js'

export type Scope = 'agent' | 'agent:pair'
export type EventType =
  | 'permission' | 'question' | 'plan-review' | 'settlement' | 'retirement' | 'turn-finished' | 'state'
  | 'message' | 'ask' | 'handover' | 'takeback' | 'notice' | `contributed:${string}.${string}`

/** Milliseconds since the Unix epoch. */
export type EpochMs = number

/** The core tools' structured result (R-CON-02). */
export type ToolResult<T extends object = Record<string, JsonValue>> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message?: string; [extra: string]: JsonValue | undefined }

export interface CallToolResult {
  readonly structuredContent: { ok: boolean; [key: string]: unknown }
  readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  readonly isError: boolean
}

export interface Offer { offerId: string; revision: number; decisionKind: 'approval' | 'question' }

export interface MailboxEvent {
  eventId: string
  mailboxGeneration: string
  sequence: number
  type: EventType
  at: EpochMs
  sourceSessionId: string | null
  correlationId: string | null
  offer?: Offer
  payload: JsonValue
  payloadDigest: string
}

export type PollResult =
  | { ok: true; events: MailboxEvent[]; nextCursor: string; hasMore: boolean }
  | { ok: true; resync: { reason: 'stale-cursor'; headSequence: number } }
  | { ok: false; code: 'forbidden' | 'limit-exceeded' | 'invalid-arguments' }

export interface Receipt { eventId: string; payloadDigest: string }
export type AckResult = { ok: true; acked: number } | { ok: false; code: 'unknown-event' | 'digest-mismatch' }

// ---------------------------------------------------------------------------------------------
// Internal module interfaces (W2)
// ---------------------------------------------------------------------------------------------

/**
 * An opaque, stable key of one token entry (never the token or its label). It is the `key` of the
 * entry's item in the connector's settings list (TokenSettingsItem), written at creation.
 */
export type EntryKey = string
/**
 * A principal key: opaque and stable for one (entry, bound id). Handed to contributors as
 * `call.principal.key` (R-EXT-10) and to embed-UI as `principal.key` (design §3.6).
 */
export type PrincipalKey = string

/** Whatever authenticated one request: the principal it acts as, and its live power. */
export interface Caller {
  readonly entryKey: EntryKey
  /** The client id the access token was issued to. */
  readonly clientId: string
  /** Present when the entry is bound to `clientId` (full power). */
  readonly principalKey?: PrincipalKey
  /** Evaluated live (R-ID-03): `agent` as soon as `pair` binds this token's entry to `clientId`. */
  readonly scope: Scope
  /** The canonical MCP URI the token was issued for (its audience). */
  readonly audience: string
  /** The entry generation the token was issued under (TokenEntry.generation); a newer one means revoked. */
  readonly generation: number
}

/**
 * C-OAUTH's bearer verifier, called by C-HTTP after `RequestGate.check` and before any MCP
 * processing (design §3.1 step 3). It never throws and never says which tokens exist.
 */
export interface BearerVerifier {
  /**
   * @param authorization the raw `Authorization` header, or undefined
   * @param audience the canonical MCP URI of the checked request host
   * @param now injected clock
   * @returns the caller, or `{error}`: `missing` (no Bearer value: 401 without `error`) or
   *   `invalid_token` (unknown, expired at `now >= issuedAt + 3600 s`, revoked, foreign audience:
   *   401 with `error="invalid_token"`)
   */
  verify(authorization: string | undefined, audience: string, now: EpochMs): Caller | { error: 'missing' | 'invalid_token' }
}

/**
 * The connector-side state of one token entry (K1d token amendment, design §5.1, §5.9). Never
 * carries the value, its digest or a credential reference: the connector stores only the digest
 * (TOKEN_VALUE.digestAlgorithm) in the entry's own record, and no caller outside C-TOKENS reads it.
 */
export interface TokenEntry {
  readonly entryKey: EntryKey
  readonly label: string
  readonly enabled: boolean
  /**
   * Always ENTRY_STATUS.ok (K1d: a generated value is never too short or unset). The field stays so
   * that a caller admitting only `ok` entries needs no change.
   */
  readonly status: typeof ENTRY_STATUS[keyof typeof ENTRY_STATUS]
  /**
   * Bumped on disable or delete. Every access and refresh token records the generation it was
   * issued under, so a re-enable revives none (R-OA-06, S7 §4.4).
   */
  readonly generation: number
  /**
   * Whether `dshConnectorTokens.createHosted` made the entry (K1d; replaces `ref` and `generated`).
   * C-SUCCEED's `hosted/` storage keeps which instance it was made for.
   */
  readonly hosted: boolean
}

/** REVOCATION_KIND's values: `disabled` or `deleted` (K1d withdrew `value-changed`: a value never changes). */
export type RevocationKind = typeof REVOCATION_KIND[keyof typeof REVOCATION_KIND]

/** C-TOKENS: token entries over the connector's native settings list and its own digest records. */
export interface TokenRegistry {
  /**
   * Constant-time match of a presented value's digest against the digests of the **enabled**, `ok`
   * entries that are not in a duplicate (R-TOK-06, R3, R5). `undefined` for every miss, whatever
   * the reason. Two entries never hold one digest: such a save is refused `token-duplicate`
   * (SETTINGS_REFUSAL), and entries found duplicated outside a save refuse service, so a match is
   * unique.
   */
  match(value: string): TokenEntry | undefined
  get(entryKey: EntryKey): TokenEntry | undefined
  list(): readonly TokenEntry[]
  /** Fires synchronously when an entry is disabled or deleted (R-TOK-05). */
  onRevoked(listener: (entryKey: EntryKey, kind: RevocationKind, generation: number) => void): () => void
}

/** One item of the connector's native tokens list (design §5.1; K1d). Never a value or a digest. */
export interface TokenSettingsItem {
  readonly label: string
  readonly enabled: boolean
  /** The entry's EntryKey. */
  readonly key: EntryKey
}

/**
 * The one writer of the connector's settings document for the connector's own modules (K1d; C-WIRE
 * binds it, W4b). C-TOKENS-REVEAL's `create` and `createHosted` call `addToken`; C-SUCCEED calls
 * `removeToken` in a succession (R-HOST-09). Defined once so that these tasks share one port.
 * C-WIRE-2 withdrew `setDesignated` with the designated agent (the user's answer q5, 2026-11-17:
 * "Remove agentToken entirely"). Connector-internal: never a DSH service, never reachable over MCP or HTTP.
 *
 * Every method resolves only once the document is saved through DSH's settings service **and** the
 * token registry's sync of that save has resolved, so a caller that continues sees the change in
 * TokenRegistry and in routing. A method rejects when the save fails or that sync refuses it
 * (SETTINGS_REFUSAL); the document then holds the previous list, and the caller undoes its own
 * earlier steps. Calls run one after another, in call order.
 */
export interface SettingsWriter {
  /** Appends `item` to the end of the tokens list. The entry's digest record must already exist (design §5.2 step 2). */
  addToken(item: TokenSettingsItem): Promise<void>
  /** Removes the item whose `key` is `entryKey`; resolves with nothing changed when there is none. */
  removeToken(entryKey: EntryKey): Promise<void>
}

/**
 * The one "system note into a session" port (K1d; C-WIRE binds it, W4b): the revocation note of
 * R-ROUTE-06 (C-REVOKE) and the succession note of R-HOST-09 step 7 (C-SUCCEED). Connector-internal.
 */
export interface SessionNotes {
  /**
   * Appends `note` to the transcript of the root session `sessionId` as a `system` entry that its
   * agent reads at its next turn. It **starts no turn** (W4 Q2 = A) and is shown in the transcript
   * as a non-waking entry. `note` is model-facing text, English only (W4 Q7). Resolves once the
   * entry is stored; rejects when the session does not exist or the write fails, and the caller
   * logs it.
   */
  system(sessionId: string, note: string): Promise<void>
}

export interface Pair {
  readonly entryKey: EntryKey
  readonly principalKey: PrincipalKey
  readonly id: string
  readonly name: string | null
  readonly pairedAt: EpochMs
  readonly lastSeenAt: EpochMs | null
  /** Recorded for a pair the approval page made (R-ID-13, R-OA-12). */
  readonly clientIdUrl?: string
  readonly redirectUri?: string
}

/**
 * `pair`'s answer. Since the user's decision of 2026-11-21 (README "Generated names") a success's
 * `name` is the requested name or, without a usable one, a generated name (with `nameAssigned:
 * false` and `nameRefused` when one was refused); `null` remains in the type for pairs stored before.
 */
export type PairResult =
  | { ok: true; paired: true; id: string; name: string | null; nameAssigned?: boolean; nameRefused?: 'name-taken' | 'name-invalid' }
  | { ok: false; code: 'already-paired'; bound: { idMatches: boolean; boundId: string; name: string | null; pairedAt: EpochMs; lastSeenAt: EpochMs | null }; advice: string }
  | { ok: false; code: 'id-taken' }

/** `set_name`'s answer; `set_name(null)` answers a generated name since 2026-11-21 (README "Generated names"). */
export type SetNameResult = { ok: true; name: string | null } | { ok: false; code: 'name-taken' | 'name-invalid' }

/**
 * `PairStore.succeed`'s answer (K1 amendment after W2, for C-SUCCEED). `successor-unpaired`
 * (REFUSAL.successorUnpaired) is K3's RetireRefusalCode (host-services/tokens.d.ts), which
 * C-SUCCEED returns as it is.
 */
export type SucceedResult = { ok: true; pair: Pair } | { ok: false; code: 'successor-unpaired' }

/**
 * C-PAIR's pair store: one serial registry over every pair and name (S3: DSH storage has no
 * secondary index, so `pair`, the page's bind and `set_name` are one transaction each over it).
 */
export interface PairStore {
  /** Every pair, for the native status rows (R-ID-12) and the hand-over service's `principals()`. */
  list(): readonly Pair[]
  pairOf(entryKey: EntryKey): Pair | undefined
  byPrincipal(principalKey: PrincipalKey): Pair | undefined
  /**
   * `pair` (R-ID-03/04/13, R-NAME-06): already-paired before id-taken; a name never fails it. For a
   * machine client `id` is its OAuth client id (R-ID-01); the MCP tool's input is unchanged (K1d).
   * Without a usable name the pair gets a generated name (README "Generated names", 2026-11-21).
   */
  pair(entryKey: EntryKey, id: string, name: string | undefined, now: EpochMs): Promise<PairResult>
  /**
   * The approval page's bind of an unpaired entry (R-OA-22; K1d): in one atomic step, with full
   * rights at once. `id` is the agent's AUTHORIZE_EXTENSION.agentIdParam, or the id DERIVED_AGENT_ID
   * gives for `client.clientIdUrl` when it passed none; the page asks only for the token and an
   * optional name. Unlike `pair`, a bad or held name refuses and binds nothing.
   */
  bindFromPage(entryKey: EntryKey, id: string, name: string | undefined, client: { clientIdUrl: string; redirectUri: string }, now: EpochMs):
    Promise<{ ok: true; pair: Pair } | { ok: false; code: 'already-paired' | 'id-invalid' | 'id-taken' | 'name-invalid' | 'name-taken' }>
  /**
   * The approval page's reconnect (R-OA-22, requirements 1.33 Q-A2 A; K1d replaces
   * `renewFromPage`): a bound entry whose pair has this `id` (bound on the page or by `pair`:
   * R-OA-12 (2) refuses only "another id") keeps its principal (name, `pairedAt`, managed sessions,
   * queued events) and records the newest `client.clientIdUrl` and `client.redirectUri`; the page
   * then mints a new code and chain. Any other id is `already-paired`, and nothing changes. It binds
   * nothing new and has no age condition (R-OA-23: no chain cap).
   * @throws TypeError when the entry is unpaired: a caller bug, since the page calls `bindFromPage`
   *   for an unpaired entry (as `succeed`'s TypeError; K1d-5).
   */
  reconnectFromPage(entryKey: EntryKey, id: string, client: { clientIdUrl: string; redirectUri: string }):
    Promise<{ ok: true; pair: Pair } | { ok: false; code: 'already-paired' }>
  /**
   * `set_name`; `null` clears (R-NAME-02), which since 2026-11-21 replaces the name with a generated
   * one; a refused name keeps a held name and names a nameless pair with a generated one (README
   * "Generated names").
   */
  setName(principalKey: PrincipalKey, name: string | null): Promise<SetNameResult>
  /** Records an authenticated request; writes at most once per PAIR_TIMING.lastSeenWriteIntervalMs. */
  seen(principalKey: PrincipalKey, now: EpochMs): void
  /** Deleting an entry frees its id and name (R-ID-13, R-NAME-02). */
  remove(entryKey: EntryKey): Promise<void>
  /**
   * Reinstall succession's pair step (R-HOST-09, R-NAME-07; K1 amendment after W2, for C-SUCCEED's
   * `retire`). In one atomic registry write: the old entry's pair is removed (its id and name are
   * freed, as `remove`) and the successor's pair takes the old one's name, replacing the successor's
   * own; a nameless old pair (one bound on the page that never named itself) moves no name, and the
   * successor keeps its own (2026-11-21: no pair is left nameless by the connector). So the name is
   * never held twice and never refused.
   * - The successor's entry is unpaired: `successor-unpaired`, nothing changes.
   * - The old entry is unpaired: `{ok: true, pair}` with the successor's unchanged pair, and
   *   nothing changes (it has no principal, so there is no name to move; Fishball 2026-11-14).
   * - Otherwise `{ok: true, pair}` with the successor's pair after the step; its id, principal
   *   key, `pairedAt` and page fields are its own, unchanged.
   * Listeners run once after a change. A failed write changes nothing (the caller rolls back).
   * @throws TypeError when both keys name the same entry (a caller bug).
   */
  succeed(oldEntryKey: EntryKey, successorEntryKey: EntryKey): Promise<SucceedResult>
  onChange(listener: () => void): () => void
}

/** What a producer commits; the mailbox adds `eventId`, generation, sequence, digest and `at`. */
export interface EventDraft {
  type: EventType
  sourceSessionId: string | null
  correlationId: string | null
  offer?: Offer
  payload: JsonValue
  /** Contributor events only: a pending duplicate from the same contributor is `duplicate`. */
  dedupeKey?: string
  /**
   * Contributor events only (K1 amendment after W2): an opaque non-empty tag of the contributor
   * activation that emitted it, so `Mailbox.retireContributor` can find it. Stored with the
   * event; never part of the MailboxEvent a client polls.
   */
  activationTag?: string
}

/** `Mailbox.retire`'s answer: whether a pending event was replaced (K1 amendment at the W3 merge). */
export type RetireOutcome = Readonly<{ retired: boolean }>

export type CommitResult = { ok: true; eventId: string } | { ok: false; code: 'queue-full' | 'duplicate' }

/** C-MAILBOX: one durable ledger per pair (R-CON-03, R-ID-06). */
export interface Mailbox {
  /** Commits one event and sends its hint on that pair's listen streams only (R-EVT-04, S7 §4.4). */
  commit(recipient: PrincipalKey, draft: EventDraft): Promise<CommitResult>
  poll(principalKey: PrincipalKey, cursor: string | undefined, limit: number): Promise<PollResult>
  ack(principalKey: PrincipalKey, receipts: readonly Receipt[]): Promise<AckResult>
  summary(principalKey: PrincipalKey): Promise<{ pending: number; headSequence: number; mailboxGeneration: string }>
  /**
   * Replaces a pending event by a `retirement` naming it (R-EXT-19, R-TOK-05, R-HOST-09). A pending
   * event of a held mailbox counts as pending.
   * Resolves `{retired: true}` when it did, `{retired: false}` when the event was not pending in
   * this pair's mailbox (acked, already retired, unknown or another pair's): then nothing is
   * committed and nothing changes (K1 amendment at the W3 merge, DECIDED #W3-1). A caller that
   * must still tell the pair, because the pair may already have acked the event, sends a fresh
   * `retirement` on `false` (C-ROUTE: an ack can land between its own acked check and this call).
   * @throws TypeError **synchronously**, before the call is queued, when `principalKey` is not a
   *   non-empty string, `eventId` is not a string, or `reason` is not a RETIREMENT_REASON; nothing
   *   is committed or changed (K1d, decided item 45: a caller bug, as K3 #17). Any string `eventId`,
   *   the empty one included, is data: one that names no pending event resolves `{retired: false}`.
   */
  retire(principalKey: PrincipalKey, eventId: string, reason: 'withdrawn' | 'revoked' | 'released' | 'reissued' | 'contributor-withdrawn'): Promise<RetireOutcome>
  /**
   * A contributor activation's withdrawal or quarantine (R-EXT-19; K1 amendment after W2, for
   * C-EXT): every **pending** event of type `contributed:<namespace>.*` committed with this
   * `activationTag`, in every pair's mailbox (held ones included), is retired as `retire` does,
   * with reason `contributor-withdrawn`. Acked and already-retired events, other namespaces and
   * other activations' events are left alone. Repeating it is a no-op for what it already retired.
   */
  retireContributor(namespace: string, activationTag: string): Promise<void>
  /** Disable (R-TOK-05): the mailbox is held, not pollable, for MAILBOX.disabledRetentionMs from `now`. */
  hold(principalKey: PrincipalKey, now: EpochMs): Promise<void>
  /**
   * Re-enable within the hold: the held events are pending again, same identities.
   * `mailboxGeneration` (K1 amendment after W2): `hold`, `release`, `drop` and `expireHolds`
   * keep the pair's generation; it changes only when the mailbox's storage is lost or reset
   * (MAILBOX). Only then is an earlier cursor stale (`resync`).
   */
  release(principalKey: PrincipalKey): Promise<void>
  /**
   * Delete, or the end of the hold: every event is dropped. Returns the dropped `ask` events'
   * correlation ids, so the asking sessions are answered `unavailable` (R-TOK-05).
   */
  drop(principalKey: PrincipalKey): Promise<{ droppedAsks: readonly string[] }>
  /**
   * Reinstall succession's event move (R-HOST-09 step 5; K1d, for C-SUCCEED's `retire`). In one
   * serial step, every **pending** event of `fromPrincipal`'s mailbox (a held mailbox's included)
   * moves to `toPrincipal`'s, in their original order and after its own events:
   * - each keeps its `eventId`, `type`, `at`, `sourceSessionId`, `correlationId`, `offer`, `payload`
   *   and `payloadDigest`, and is delivered once, from the new mailbox only;
   * - `sequence` and `mailboxGeneration` become the new mailbox's (its head grows by `moved`);
   * - acked and retired events stay behind; nothing new is committed (no `retirement`), and the
   *   destination's `maxQueuedInputs` never refuses a moved event (it was accepted already);
   * - neither mailbox's hold changes: a moved event is pollable once `toPrincipal`'s mailbox is
   *   not held;
   * - when `moved > 0`, the hint goes to `toPrincipal`'s listen streams, as after a commit.
   * Moving nothing (an empty or unknown source) resolves `{moved: 0}`; a repeat moves nothing more.
   * A failed write moves nothing. C-SUCCEED re-issues the moved offers itself (`reissued`).
   * @throws TypeError **synchronously** (as `retire`) when either key is not a non-empty string or
   *   both are the same; nothing changes.
   */
  transfer(fromPrincipal: PrincipalKey, toPrincipal: PrincipalKey): Promise<{ readonly moved: number }>
  /**
   * `transfer` staged for a succession that may still fail (K1 amendment at W4b, C-WIRE; C-SUCCEED's
   * routing `succeedPrincipal`). In one serial step it sets a barrier in `toPrincipal`'s mailbox at
   * its next sequence, then moves `fromPrincipal`'s pending events in as `transfer` does. Until
   * `confirm` or `undo`, `poll` stops at the barrier and `ack` treats what lies past it as unknown.
   * The barrier is in memory only: a crash while staged leaves each event in one mailbox, visible.
   * @throws TypeError synchronously as `transfer`; rejects TypeError when `toPrincipal` is staged already
   */
  stage(fromPrincipal: PrincipalKey, toPrincipal: PrincipalKey): Promise<StagedTransfer>
}

/** `Mailbox.stage`'s handle (K1 amendment at W4b). */
export interface StagedTransfer {
  /** The `eventId`s moved from the source, in order. */
  readonly movedIds: readonly string[]
  /** Commits `draft` into the destination past the barrier; `undo` removes it again. @returns its eventId */
  commit(draft: EventDraft): Promise<string>
  /** Lifts the barrier (synchronous, cannot fail) and hints the destination's listen streams. */
  confirm(): void
  /**
   * Removes the staged commits, moves the transferred events still pending back to the source, and
   * moves back every other event committed past the barrier whose `sourceSessionId` is in
   * `sourceSessions`; then lifts the barrier.
   */
  undo(sourceSessions: readonly string[]): Promise<void>
}

/** C-HTTP's side of the hint (R-EVT-04): the mailbox calls it after each commit, for that pair only. */
export interface HintSink {
  resourceUpdated(principalKey: PrincipalKey, uri: string): void
}

/**
 * The token store C-OAUTH and C-OAUTH-WEB share (R-OA-05, R-OA-14, R-OA-16). Everything is held
 * by SHA-256 digest of the opaque value. Access tokens and codes are in memory only; refresh
 * tokens persist as digests with their chain id and entry generation (Q-S7B-3 A).
 */
export interface IssuedAccessToken {
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly audience: string
  readonly generation: number
  readonly issuedAt: EpochMs
  /** Set for a token from the code or refresh grant: revoking the chain revokes it (R-OA-16 (2)). */
  readonly chainId?: string
}
export interface RefreshRecord {
  readonly chainId: string
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly audience: string
  readonly generation: number
  /** Set once spent; within LIFETIME.refreshGraceMs a repeat gets `successor` (R-OA-16 (4a)). */
  readonly spentAt?: EpochMs
}
export interface CodeRecord {
  readonly entryKey: EntryKey
  readonly clientId: string
  readonly redirectUri: string
  readonly codeChallenge: string
  readonly audience: string
  readonly issuedAt: EpochMs
}
/**
 * The OAuth token store (R-OA-05, R-OA-14, R-OA-16).
 * Ownership (K1a): the one `OAuthTokenStore` implementation is C-OAUTH's
 * (`packages/dsh-connector/src/mcp/oauth/`), durable `putRefresh` included; C-OAUTH-WEB uses that one
 * instance and builds against a fake of this interface.
 */
export interface OAuthTokenStore {
  putAccess(digest: string, token: IssuedAccessToken): void
  getAccess(digest: string): IssuedAccessToken | undefined
  putCode(digest: string, code: CodeRecord): void
  /** Single use (R-OA-14): returns and removes the record; a second take is `undefined`. */
  takeCode(digest: string): CodeRecord | undefined
  /**
   * Stores a refresh record. A record with `spentAt` marks a rotation of its chain: the store then
   * keeps only this newest spent record of the chain (and the chain's live one), deleting older
   * spent ones, so a chain's records stay bounded with no chain cap (K1d-7). An older spent token
   * then reads as unknown (`getRefresh` → undefined), not as reuse.
   */
  putRefresh(digest: string, record: RefreshRecord): Promise<void>
  getRefresh(digest: string): RefreshRecord | undefined
  /** Revokes every access and refresh token of a chain (reuse, replayed code). */
  revokeChain(chainId: string): Promise<void>
  /** Revokes every token derived from an entry below `generation` (R-OA-06). */
  revokeEntry(entryKey: EntryKey, generation: number): Promise<void>
  /**
   * The page reconnect's revocation (R-OA-22; K1d-6): revokes every refresh chain the entry has,
   * with their access tokens, and drops its unredeemed codes, whatever client id URL they were
   * issued to. Access tokens with no chain (machine exchange) are kept. Visible to `getRefresh`
   * and `getAccess` at once; durable as `revokeChain`. An entry with no chain resolves with nothing
   * changed. C-OAUTH-WEB calls it after `PairStore.reconnectFromPage` succeeds, before it mints the
   * reconnect's code.
   */
  revokeEntryChains(entryKey: EntryKey): Promise<void>
}

/** A FailureLimiter key's parts (FAILURE_LIMIT.keyParts): `clientId` is absent for an MCP bearer. */
export interface FailureKey {
  readonly remoteAddress: string
  /** The agent id at the token endpoint, the CIMD URL on the approval page; never token material. */
  readonly clientId?: string
}

/**
 * The one failure limit of R-OA-17 (task K1a): the token endpoint (C-OAUTH), the approval page
 * (C-OAUTH-WEB) and the MCP endpoint's bearer check (C-HTTP) share one instance, so a wrong page
 * entry and a wrong client secret count toward the same limit (S7b P2). The one implementation is
 * C-OAUTH's (`packages/dsh-connector/src/mcp/oauth/`); the others build against fakes of it. In memory
 * only, with an injected clock; it never sees a token value. Limits and window: FAILURE_LIMIT.
 */
export interface FailureLimiter {
  /**
   * Whether `key` is limited at `now`: its own counted failures within the last
   * FAILURE_LIMIT.windowMs reach perKeyPerWindow, or its address's (over every key) reach
   * perAddressPerWindow. A limited request is refused, valid credential or not, and is not recorded.
   * @returns `{limited: true, retryAfterMs}` (ms until the window admits one more, for
   *   `Retry-After` in whole seconds) or `{limited: false}`
   */
  check(key: FailureKey, now: EpochMs): { limited: false } | { limited: true; retryAfterMs: number }
  /** Counts one refused credential for `key` (never an empty page field). */
  recordFailure(key: FailureKey, now: EpochMs): void
}

/** What an event is about, for routing (R-EVS-03). */
export interface RouteSubject {
  type: EventType
  sessionId: string | null
  /** For `settlement`, `retirement` and `takeback`: the pair that received the original. */
  followsPrincipal?: PrincipalKey
  /** For `contributed:*`: the contributor's namespace (rate limits and dedupe are per contributor and recipient, R-EXT-18). */
  contributor?: string
}

/**
 * The no-recipient outcome, by type (R-CON-09, R-EXT-17; C-WIRE-2): an offer is the user's
 * (`to-user`), a contributor event is `no-agent`, any other event is not produced (`dropped`).
 * C-WIRE-2 withdrew `queue` (K1c-3's no-recipient queue) and `unavailable` (`ask_agent`'s) with
 * the designated agent (the user's answer q5, 2026-11-17: "Remove agentToken entirely"; "There is
 * no 'designated agent' default for unmanaged sessions").
 */
export type NoRecipient = { recipient: null; fallback: 'to-user' | 'no-agent' | 'dropped' }

/**
 * C-ROUTE's router: exactly one recipient per event, decided at creation (R-EVS-03, EVT-DT-01).
 * A follow-up goes to `followsPrincipal`; a managed session's event to its manager; an event that
 * names no managed session has no recipient (NoRecipient).
 */
export interface Router {
  recipientFor(subject: RouteSubject): { recipient: PrincipalKey } | NoRecipient
}

/** The one "connected" definition (CONNECTED): an open listen stream on `dsh-agent://events`. */
export interface Presence {
  isConnected(principalKey: PrincipalKey): boolean
  onChange(listener: (principalKey: PrincipalKey, connected: boolean) => void): () => void
}

// --- Managed state (task K1c) ------------------------------------------------------------------

/** One managed session and its manager, as ManagedState lists it. */
export interface ManagedRecord {
  /** A root session id (the session the user sees). */
  readonly sessionId: string
  readonly principalKey: PrincipalKey
}

/** `manage`'s answer: MANAGED_REFUSAL.alreadyManaged (`conflict`) when the session has a manager. */
export type ManageResult = { readonly ok: true } | { readonly ok: false; readonly code: typeof MANAGED_REFUSAL.alreadyManaged }

/**
 * `release`'s answer: MANAGED_REFUSAL.notManaged (`not-managed`) when nobody manages the session,
 * MANAGED_REFUSAL.otherManager (`forbidden`) when another principal does (R-ROUTE-02, HAND-ST-01
 * row 9).
 */
export type ReleaseResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: typeof MANAGED_REFUSAL.notManaged | typeof MANAGED_REFUSAL.otherManager }

/**
 * Who manages a session (task K1c; R-ROUTE-01, R-WATCH-01; README "Managed state", K1c-1). The
 * seam C-ROUTE and C-TOOLS share: C-ROUTE owns the one implementation (with the router and K3's
 * `dshConnectorHandover`, which change the same state through Hand over and Take back).
 * C-TOOLS calls `manage` from `session_start` and `release` from `session_release`, and reads
 * `managerOf` in every tool that names a session ("a session you manage"; `sessions_list` omits and
 * `session_read` refuses `forbidden` a session another principal manages, R-ROUTE-02,
 * requirements 1.23) and for `approval_answer` authority. Connector-internal: never a DSH service,
 * never reachable over MCP or HTTP.
 *
 * - **Keys** are root session ids (the session the user sees; a subagent belongs to its root, as
 *   in V2). The caller resolves the root and checks that the session exists: an unknown session is
 *   the caller's `unknown-session` (C-TOOLS reads DSH), never this interface's.
 * - **One manager per session**, at most. Hand over and Take back stay K3's service; revocation
 *   and succession are added by C-REVOKE and C-SUCCEED, not here.
 * - **Durable** (as V2's managed table, which V3 keeps, design §10 step 3): a change resolves only
 *   once it is stored, and survives a connector restart. **Serial** (as V2's ManagedRegistry, so two
 *   overlapping calls never both see the old state): of two overlapping calls the first wins and
 *   the second sees its result. **Visible on resolve:** `managerOf` and `managed()` show a change
 *   once its promise has resolved (K1c-1).
 * - **Events:** `manage` commits none. `release` sends no release event or notification (K1c-2);
 *   its only events are the retirements of the session's live offers, one `retirement` with
 *   RETIREMENT_REASON.released per live offer to the releasing pair, which C-ROUTE's `release`
 *   performs once the change is stored. C-TOOLS calls nothing else. The offers then go to the user
 *   in the session.
 * - A refusal changes nothing. No method throws for a refusal.
 */
export interface ManagedState {
  /** The session's manager now, or `undefined` when it is unmanaged. Synchronous: no I/O. */
  managerOf(sessionId: string): PrincipalKey | undefined
  /** Every managed session with its manager, in no particular order. */
  managed(): readonly ManagedRecord[]
  /**
   * `session_start`: makes `principalKey` the session's manager. A session that already has a
   * manager, the caller included, is MANAGED_REFUSAL.alreadyManaged (the rule of K3's `handOver`).
   */
  manage(sessionId: string, principalKey: PrincipalKey): Promise<ManageResult>
  /** `session_release` by `principalKey`: the session becomes unmanaged. */
  release(sessionId: string, principalKey: PrincipalKey): Promise<ReleaseResult>
  /**
   * Calls `listener` after every change of the managed set, by any path (`manage`, `release`, Hand
   * over, Take back, revocation, succession). It gets no argument and reads `managed()` again. A
   * throwing listener does not stop the others (K1c-1). Returns the disposer of this listener.
   */
  onChange(listener: () => void): () => void
}

// --- Request gate (task K1b) -------------------------------------------------------------------

/** GATE_SURFACE: the MCP route, C-OAUTH's token endpoint and metadata, and the approval listener. */
export type GateSurface = typeof GATE_SURFACE[keyof typeof GATE_SURFACE]

/**
 * The listener facts the gate is built with (C-WIRE constructs the one `RequestGate` with them and
 * with an injected clock). Never taken from a request: no forwarded header is read (HOSTS). The
 * approval listener binds DSH's listener host (`webServer.host`) on its own port, so both surfaces
 * share `host`, `secure` and `trustedHosts` (the user's decision, 2026-11-14, K1b).
 */
export interface GateListenerFacts {
  /** DSH's `webServer.host`: the bind address, also an allowed `Host` (HOSTS). */
  readonly host: string
  /** Whether DSH's listener is https (`webServer.protocol`); a non-loopback `host` that is not is 503. */
  readonly secure: boolean
  /** DSH's `--trusted-host` list (`webStartup.trustedHosts`). */
  readonly trustedHosts: readonly string[]
  /**
   * The approval listener's current port (APPROVAL_LISTENER, the port setting), read live so a
   * rebind is followed. The page's own origin, the only `Origin` ORIGIN_RULE.ownOnly accepts, is
   * the listener's scheme with the checked `Host` (R-OA-11, S7b F4).
   */
  approvalPort(): number
  readonly now: () => EpochMs
}

/** What the gate reads of one request. */
export interface GateRequest {
  readonly method: string
  /** The path without its query. */
  readonly path: string
  /** Node's request headers, names in lower case (REQUEST_GATE.headers). */
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>
}

/**
 * `admit`'s request (K1 amendment after W2): the caller calls `admit` **before** it reads the MCP
 * body, so a pass's in-flight slot bounds one entry's concurrent uploads too.
 */
export interface AdmitRequest extends GateRequest {
  /**
   * The body length the request declares (`Content-Length`), or absent when it declares none
   * (chunked). More than ENDPOINT_LIMITS.bodyBytes is 413, exactly at it passes (PLAT-BVA-02). A
   * body with no declared length is read under the pass's slot; once it exceeds
   * ENDPOINT_LIMITS.bodyBytes the caller answers the same 413 itself and calls `done()` (the
   * bucket token stays spent).
   */
  readonly bodyBytes?: number
}

/** `check`'s refusals, in REQUEST_GATE.checkOrder. 405 and 403 have no body (the user's decision, 2026-11-14). */
export type CheckRefusal =
  | { readonly pass: false; readonly status: typeof HTTP_STATUS.methodNotAllowed; readonly headers: Readonly<Record<typeof REQUEST_GATE.headers.allow, string>>; readonly body: null }
  | { readonly pass: false; readonly status: typeof HTTP_STATUS.forbidden; readonly headers: Readonly<Record<string, never>>; readonly body: null }
  | { readonly pass: false; readonly status: typeof HTTP_STATUS.serviceUnavailable; readonly headers: Readonly<Record<string, never>>; readonly body: { readonly error: typeof HTTP_REFUSAL.insecureListener } }

/**
 * ENDPOINT_LIMITS' structured refusal: a JSON-RPC error with **no** `id` member. The body was never
 * parsed, so there is no request id; MCP 2026-07-28's `JSONRPCErrorResponse` makes `id` optional
 * and admits only a string or integer, so `id: null` (JSON-RPC 2.0 §5) is refused by both hosts'
 * clients (`@modelcontextprotocol/core` 2.2.0 `JSONRPCErrorResponseSchema`; K1b-EP-13).
 */
export interface LimitRefusalBody<M extends typeof HTTP_REFUSAL.tooLarge | typeof HTTP_REFUSAL.rateLimited> {
  readonly jsonrpc: typeof ENDPOINT_LIMITS.jsonRpcVersion
  readonly error: { readonly code: typeof ENDPOINT_LIMITS.jsonRpcCode; readonly message: M }
}

/**
 * `admit`'s refusals, in REQUEST_GATE.admitOrder. A 429 carries `Retry-After` in whole seconds
 * (TIME_UNIT): for an empty token bucket, until it holds one token again; for the in-flight limit,
 * REQUEST_GATE.inFlightRetryAfterMs (PROPOSED, the user's choice 2026-11-14: a slot frees when any
 * request ends).
 */
export type AdmitRefusal =
  | { readonly pass: false; readonly status: typeof HTTP_STATUS.payloadTooLarge; readonly headers: Readonly<Record<string, never>>; readonly body: LimitRefusalBody<typeof HTTP_REFUSAL.tooLarge> }
  | { readonly pass: false; readonly status: typeof HTTP_STATUS.tooManyRequests; readonly headers: Readonly<Record<typeof RATE_LIMITS.retryAfterHeader, string>>; readonly body: LimitRefusalBody<typeof HTTP_REFUSAL.rateLimited> }

/** The one surface `admit` serves (REQUEST_GATE.admitSurfaces). */
export type AdmitSurface = typeof REQUEST_GATE.admitSurfaces[number]

/** Any gate refusal: the caller writes `status`, `headers` and `body` (JSON, or none when `null`) and runs nothing else. */
export type GateRefusal = CheckRefusal | AdmitRefusal

/**
 * C-HTTP's request gate (task K1b; design §3.1, §5.5; R-REM-02/03, R-OA-20, R-SEC-03). C-HTTP owns
 * the only implementation; C-OAUTH (token endpoint and metadata), C-OAUTH-WEB (approval listener)
 * and C-HTTP's MCP route call it and build against fakes. Every value is REQUEST_GATE's, HOSTS',
 * HTTP_STATUS', HTTP_REFUSAL's and ENDPOINT_LIMITS'. The order of one MCP request is
 * `check` → BearerVerifier (401) → `admit` → version checks → dispatch (design §3.1, PLAT-EP-01).
 * Built once by C-WIRE from GateListenerFacts. Neither method throws, and neither reads a token
 * or says which tokens exist.
 */
export interface RequestGate {
  /**
   * Before authentication, on every surface. Refuses at the first failing step of
   * REQUEST_GATE.checkOrder:
   * 1. 405: the path is in REQUEST_GATE.routes[surface] and `method` is not one of its methods;
   *    `Allow` is those methods joined by REQUEST_GATE.allowSeparator. A path not listed passes
   *    this step only: steps 2 and 3 still apply, and its route answers 404 once `check` passes.
   * 2. 403: `Host` is not an allowed host (HOSTS: the loopback names, the listener's bind address,
   *    DSH's `--trusted-host` list), or a present `Origin` (`null` included) that the surface's
   *    REQUEST_GATE.originRule refuses: any on `mcp` and `token`, any but the page's own origin on
   *    `approval`.
   * 3. 503 `insecure-listener`: GateListenerFacts.host is not loopback and `secure` is false.
   */
  check(req: GateRequest, surface: GateSurface): { readonly pass: true } | CheckRefusal
  /**
   * After the bearer check, on REQUEST_GATE.admitSurfaces only (`mcp`; the user's decision,
   * 2026-11-14); `token` and `approval` never call it. Called before the body is read (AdmitRequest).
   * Refuses 413 when the declared `bodyBytes` exceeds
   * ENDPOINT_LIMITS.bodyBytes, else 429 when the caller has ENDPOINT_LIMITS.inFlightPerPrincipal
   * requests in flight or its token bucket (requestsPerMinute, requestBurst; clock from
   * GateListenerFacts.now) is empty. Limits are
   * counted per `caller.entryKey` (the user's decision, 2026-11-14, K1b: one entry holds at most
   * one principal, so this is "per principal" for a paired caller, and a pair-only caller, which
   * has no principal key yet, is counted too). A pass takes one bucket token and one in-flight
   * slot: the caller calls `done()` exactly once when the response ends, or, for a listen stream,
   * as soon as the stream is open (an open stream holds no slot; the user's decision, 2026-11-14).
   * A refusal takes nothing. The listen-stream cap (ENDPOINT_LIMITS.listenStreamsPerPrincipal) is
   * C-HTTP's stream registry's, not this method's.
   */
  admit(req: AdmitRequest, surface: AdmitSurface, caller: Caller): { readonly pass: true; done(): void } | AdmitRefusal
}

// --- Token-endpoint grants (task K1b) ----------------------------------------------------------

/** GRANT's values. */
export type GrantType = typeof GRANT[keyof typeof GRANT]

/**
 * The token request's form (`application/x-www-form-urlencoded`), parsed by C-OAUTH. A repeated
 * parameter never reaches a handler [spec: RFC 6749 §3.2, parameters MUST NOT repeat].
 */
export type TokenForm = Readonly<Record<string, string>>

/** How the client authenticated (CLIENT_AUTH), as C-OAUTH parsed it. `secret` is token material: never logged, never in a FailureKey. */
export interface ClientAuthentication {
  readonly method: typeof CLIENT_AUTH[keyof typeof CLIENT_AUTH]
  readonly clientId?: string
  readonly secret?: string
}

/** What C-OAUTH hands a handler with one request. */
export interface GrantContext {
  /** The checked origin (`check` passed): issuer and canonical MCP URI follow it (`oauthUrls`, R-OA-01). */
  readonly origin: string
  readonly client: ClientAuthentication
  /** The request's FailureLimiter key; C-OAUTH has already checked it is not limited. */
  readonly failureKey: FailureKey
  readonly now: EpochMs
}

/**
 * The OAUTH_ERROR values a grant answers (OAUTH_ERROR_STATUS gives each its status). The others
 * are the endpoint's own (`unsupported_grant_type`, `temporarily_unavailable`, `server_error` for a
 * throw) or the resource server's (`invalid_token`, `insufficient_scope`).
 */
export type GrantErrorCode =
  | typeof OAUTH_ERROR.invalidRequest | typeof OAUTH_ERROR.invalidClient | typeof OAUTH_ERROR.invalidGrant | typeof OAUTH_ERROR.invalidTarget

export type GrantResult =
  /** C-OAUTH sends it with 200 and TOKEN_RESPONSE_HEADERS. */
  | { readonly ok: true; readonly body: ReturnType<typeof tokenResponse> }
  /**
   * C-OAUTH sends `oauthErrorBody(error, description)` with OAUTH_ERROR_STATUS[error], plus
   * `WWW-Authenticate: Basic` on `invalid_client` when the client used Basic. `countedFailure` is
   * true exactly for a refused credential (FAILURE_LIMIT "Counted"); C-OAUTH then records it on
   * `ctx.failureKey`.
   */
  | { readonly ok: false; readonly error: GrantErrorCode; readonly description?: string; readonly countedFailure: boolean }

/**
 * One `grant_type` of the token endpoint (task K1b; R-OA-02). C-OAUTH owns the endpoint, the
 * dispatch on GRANT_DISPATCH.formField, `unsupported_grant_type`, the shared FailureLimiter and
 * the GRANT_DISPATCH.builtIn handlers (`client_credentials`). C-OAUTH-WEB supplies
 * `authorization_code` and `refresh_token`; C-WIRE registers them (GrantRegistry). Before any
 * handler runs, the endpoint answers itself: the RATE_LIMITS / FAILURE_LIMIT 429, a secret in the
 * URL and a repeated parameter (`invalid_request`, RFC 6749 §3.2, §5.2), a missing `grant_type`
 * (`invalid_request`) and a `grant_type` with no handler (`unsupported_grant_type`). A handler
 * never throws for a bad request; a throw is 500 `server_error`. C-OAUTH's built-in
 * `client_credentials` implements this interface too.
 */
export interface GrantHandler {
  readonly grantType: GrantType
  handle(form: TokenForm, ctx: GrantContext): Promise<GrantResult>
}

/** C-OAUTH's registration seam for C-WIRE. */
export interface GrantRegistry {
  /**
   * Adds a handler before the endpoint serves. A `grantType` that is built in, already
   * registered or not in OAUTH_METADATA's `grant_types_supported` throws `TypeError` (a wiring
   * bug, as K3's `intercept`, DECIDED #17; PROPOSED for this seam).
   */
  register(handler: GrantHandler & { readonly grantType: Exclude<GrantType, typeof GRANT_DISPATCH.builtIn[number]> }): void
}

// ---------------------------------------------------------------------------------------------
// Runtime exports (index.js). Literal types mirror the frozen values, except numeric tunables:
// a number marked PROPOSED or DECIDED in constants.js is typed `number` here, so changing it
// touches constants.js only (the user's rule: one place). A K1 amendment of any other value
// changes both files.
// ---------------------------------------------------------------------------------------------

export declare const ANSWER_DECISIONS: readonly ["allow", "grant", "reject", "escalate"]
export declare const ANSWERABLE_TYPES: readonly ["permission", "question", "plan-review", "ask"]
export declare const APPROVAL_DECISION: { readonly allow: "allow"; readonly grant: "grant"; readonly reject: "reject"; readonly ask: "ask"; readonly escalate: "escalate" }
export declare const APPROVAL_KIND: { readonly approval: "approval"; readonly question: "question" }
export declare const APPROVAL_LISTENER: { readonly defaultPort: number; readonly retryMs: number; readonly decisionBodyBytes: number; readonly pendingRequestsMax: number; readonly headers: { readonly "cache-control": "no-store"; readonly "referrer-policy": "same-origin"; readonly "content-security-policy": "default-src 'none'; style-src 'sha256-wkX+PGd3j5mohFYHazp5lMQO5mPsM8loy17wNal+3SA='; frame-ancestors 'none'" }; readonly redirectStatus: 303 }
export declare const ARGUMENTS_STATUS: { readonly complete: "complete"; readonly truncated: "truncated"; readonly unavailable: "unavailable" }
export declare const AUTHORIZE_EXTENSION: { readonly agentIdParam: "agent_id" }
export declare const BEARER_CHALLENGE: { readonly scheme: "Bearer"; readonly basicScheme: "Basic"; readonly params: readonly ["error", "error_description", "scope", "resource_metadata"]; readonly queryParameter: "access_token"; readonly queryClientSecret: "client_secret" }
export declare const CIMD_LIMITS: { readonly maxBytes: 5120; readonly timeoutMs: number; readonly maxCacheMs: number; readonly cacheEntriesMax: number; readonly scheme: "https:"; readonly forbiddenAuthFields: readonly ["client_secret", "client_secret_expires_at"] }
export declare const CLIENT_AUTH: { readonly basic: "client_secret_basic"; readonly post: "client_secret_post"; readonly none: "none" }
export declare const CONNECTED: { readonly listenResource: "dsh-agent://events" }
export declare const CONNECTOR_STATUS: { readonly approvalPortInUse: "approval-port-in-use" }
export declare const CONTRIBUTED_TYPE_PREFIX: "contributed:"
export declare const DECISION_KIND: { readonly approval: "approval"; readonly question: "question" }
export declare const DECISION_KIND_OF: { readonly permission: "approval"; readonly ask: "approval"; readonly question: "question"; readonly "plan-review": "question" }
export declare const DELIVERY: { readonly delivered: "delivered"; readonly unconfirmed: "unconfirmed" }
export declare const DERIVED_AGENT_ID: { readonly prefix: "cid-"; readonly chars: 16; readonly alphabet: "abcdefghijklmnopqrstuvwxyz234567"; readonly digestAlgorithm: "sha256" }
export declare const ENDPOINT_LIMITS: { readonly bodyBytes: number; readonly maxToolInputElements: number; readonly inFlightPerPrincipal: number; readonly listenStreamsPerPrincipal: number; readonly requestsPerMinute: number; readonly requestBurst: number; readonly jsonRpcCode: number; readonly jsonRpcVersion: "2.0" }
export declare const ENTRY_STATUS: { readonly ok: "ok" }
export declare const TURN_OUTCOME: { readonly completed: "completed"; readonly stopped: "stopped" }
export declare const TURN_FINISHED: { readonly finalMessageBytes: 4096; readonly truncationMarker: "…[truncated]" }
export declare const EVENT_TYPE: { readonly permission: "permission"; readonly question: "question"; readonly planReview: "plan-review"; readonly settlement: "settlement"; readonly retirement: "retirement"; readonly turnFinished: "turn-finished"; readonly state: "state"; readonly message: "message"; readonly ask: "ask"; readonly handover: "handover"; readonly takeback: "takeback"; readonly notice: "notice" }
export declare const FAILURE_LIMIT: { readonly windowMs: number; readonly keyParts: readonly ["remoteAddress", "clientId"]; readonly perKeyPerWindow: number; readonly perAddressPerWindow: number }
export declare const GATE_SURFACE: { readonly mcp: "mcp"; readonly token: "token"; readonly approval: "approval" }
export declare const GRANT: { readonly clientCredentials: "client_credentials"; readonly authorizationCode: "authorization_code"; readonly refreshToken: "refresh_token" }
export declare const GRANT_DISPATCH: { readonly formField: "grant_type"; readonly builtIn: readonly ["client_credentials"] }
export declare const GRANT_KIND: { readonly exact: "exact"; readonly prefix: "prefix" }
export declare const HOSTS: { readonly loopbackNames: readonly ["localhost", "127.0.0.1", "[::1]"]; readonly loopbackScheme: "http:"; readonly remoteScheme: "https:"; readonly forwardedHeadersIgnored: readonly ["forwarded", "x-forwarded-proto", "x-forwarded-host"] }
export declare const HTTP_METHOD: { readonly get: "GET"; readonly post: "POST" }
export declare const HTTP_REFUSAL: { readonly insecureListener: "insecure-listener"; readonly tooLarge: "limit-exceeded"; readonly rateLimited: "rate-limited" }
export declare const HTTP_STATUS: { readonly ok: 200; readonly seeOther: 303; readonly badRequest: 400; readonly unauthorized: 401; readonly forbidden: 403; readonly notFound: 404; readonly methodNotAllowed: 405; readonly payloadTooLarge: 413; readonly tooManyRequests: 429; readonly internalServerError: 500; readonly serviceUnavailable: 503 }
export declare const ID_GRAMMAR: { readonly pattern: RegExp }
export declare const ID_REFUSAL: { readonly idInvalid: "id-invalid" }
export declare const IMAGE_MEDIA: { readonly prefix: "image/"; readonly png: "image/png"; readonly jpeg: "image/jpeg"; readonly webp: "image/webp"; readonly gif: "image/gif" }
export declare const IMAGE_TYPES: readonly ["image/png", "image/jpeg", "image/webp", "image/gif"]
export declare const LINK_REFUSAL: { readonly disconnected: "disconnected" }
export declare const OAUTH_METADATA: {
  readonly protectedResource: { readonly bearer_methods_supported: readonly ["header"]; readonly scopes_supported: readonly ["agent"] }
  readonly authorizationServer: {
    readonly grant_types_supported: readonly ["client_credentials", "authorization_code", "refresh_token"]
    readonly response_types_supported: readonly ["code"]
    readonly code_challenge_methods_supported: readonly ["S256"]
    readonly token_endpoint_auth_methods_supported: readonly ["client_secret_basic", "client_secret_post", "none"]
    readonly client_id_metadata_document_supported: true
    readonly authorization_response_iss_parameter_supported: true
    readonly scopes_supported: readonly ["agent", "agent:pair"]
  }
}
export declare const INSUFFICIENT_SCOPE_REASON: { readonly notPaired: "not-paired"; readonly idMismatch: "id-mismatch" }
export declare const LIFETIME: { readonly accessTokenMs: 3600000; readonly codeMs: 60000; readonly pendingRequestMs: 600000; readonly refreshGraceMs: 10000 }
export declare const MAILBOX: { readonly pageDefault: number; readonly pageMax: number; readonly disabledRetentionMs: 2592000000; readonly ackedReceiptMs: number }
export declare const MANAGED_REFUSAL: { readonly alreadyManaged: "conflict"; readonly notManaged: "not-managed"; readonly otherManager: "forbidden" }
export declare const NAME_RULES: { readonly minChars: 1; readonly maxChars: 64; readonly whitespaceRun: RegExp; readonly control: RegExp; readonly space: " "; readonly normalForm: "NFC"; readonly namelessPrefix: "ID: " }
export declare const NOTICE: { readonly codeGrammar: RegExp; readonly codes: { readonly questionCallEnded: "question-call-ended" } }
export declare const OAUTH_ERROR: { readonly invalidRequest: "invalid_request"; readonly invalidClient: "invalid_client"; readonly invalidGrant: "invalid_grant"; readonly unsupportedGrantType: "unsupported_grant_type"; readonly invalidTarget: "invalid_target"; readonly unsupportedResponseType: "unsupported_response_type"; readonly accessDenied: "access_denied"; readonly serverError: "server_error"; readonly temporarilyUnavailable: "temporarily_unavailable"; readonly invalidToken: "invalid_token"; readonly insufficientScope: "insufficient_scope" }
export declare const OAUTH_ERROR_STATUS: { readonly invalid_request: 400; readonly invalid_client: 401; readonly invalid_grant: 400; readonly unsupported_grant_type: 400; readonly invalid_target: 400; readonly temporarily_unavailable: 429; readonly invalid_token: 401; readonly insufficient_scope: 403; readonly server_error: 500 }
export declare const OFFER_ID: { readonly pattern: RegExp; readonly separator: ".r"; readonly firstRevision: 1 }
export declare const OFFER_TYPES: readonly ["permission", "question", "plan-review"]
export declare const ORIGIN_RULE: { readonly refuseAny: "refuse-any"; readonly ownOnly: "own-only" }
export declare const PAIR_ADVICE: { readonly idMatches: "continue with this token and id only if no other agent uses this id with this token; otherwise use a new token and a new id"; readonly idDiffers: "use a new token" }
export declare const PAIR_ONLY: { readonly methods: readonly ["server/discover", "tools/list"]; readonly tools: readonly ["pair"] }
export declare const PAIR_STATE: { readonly paired: "paired"; readonly unpaired: "unpaired" }
export declare const PAIR_TIMING: { readonly lastSeenWriteIntervalMs: 60000 }
export declare const PATHS: { readonly mcp: "/api/agent/mcp"; readonly issuer: "/api/agent/oauth"; readonly token: "/api/agent/oauth/token"; readonly protectedResourcePrefix: "/.well-known/oauth-protected-resource"; readonly authorizationServerPrefix: "/.well-known/oauth-authorization-server"; readonly authorize: "/authorize"; readonly decision: "/authorize/decision" }
export declare const PAYLOAD_LIMITS: { readonly sessionsListed: 100; readonly attachmentEnvelopeBytes: number; readonly imageBytes: number; readonly imagePixels: 4194304; readonly imagesPerMessage: 20; readonly attachmentsPerMessage: 20; readonly chunkBytes: number; readonly hostRefTtlMs: number; readonly reasonChars: 500; readonly noteChars: 500; readonly feedbackChars: 500; readonly customChars: 500; readonly labelChars: 200; readonly titleChars: 200; readonly quoteBytes: 2048; readonly grantPrefixChars: 512; readonly questionsPerRequest: 32; readonly selectedLabelsPerAnswer: 32 }
export declare const PKCE: { readonly method: "S256" }
export declare const PLAN_REVIEW: "plan-review"
export declare const PROMPT_DECISIONS: readonly ["allow", "reject"]
export declare const PROTOCOL: { readonly version: "2026-07-28"; readonly unsupportedVersionCode: -32022; readonly headerMismatchCode: -32020; readonly ignoredHeaders: readonly ["mcp-session-id"]; readonly clientCredentialsExtension: "io.modelcontextprotocol/oauth-client-credentials" }
export declare const QUEUE: { readonly maxQueuedInputs: 200; readonly refusedTypes: readonly ["message", "turn-finished", "state", "notice"]; readonly contributedRefused: true }
export declare const RATE_LIMITS: { readonly windowMs: number; readonly tokenRequestsPerWindow: number; readonly tokenRequestsPerAddressPerWindow: number; readonly retryAfterHeader: "retry-after" }
export declare const REFUSAL: { readonly limitExceeded: "limit-exceeded"; readonly invalidArguments: "invalid-arguments"; readonly queueFull: "queue-full"; readonly rateLimited: "rate-limited"; readonly operationFailed: "operation-failed"; readonly forbidden: "forbidden"; readonly unknownSession: "unknown-session"; readonly expired: "expired"; readonly conflict: "conflict"; readonly unavailable: "unavailable"; readonly unsupportedOperation: "unsupported-operation"; readonly notReferenced: "not-referenced"; readonly tooLarge: "too-large"; readonly imagesUnsupported: "images-unsupported"; readonly notManaged: "not-managed"; readonly featureOff: "feature-off"; readonly sessionNotLive: "session-not-live"; readonly invalidDecision: "invalid-decision"; readonly riskRequired: "risk-required"; readonly reasonRequired: "reason-required"; readonly allowNeedsLowRisk: "allow-needs-low-risk"; readonly argumentsIncomplete: "arguments-incomplete"; readonly questionRequired: "question-required"; readonly modeUser: "mode-user"; readonly badAnswer: "bad-answer"; readonly alreadySettled: "already-settled"; readonly grantInvalid: "grant-invalid"; readonly prefixNotShellTool: "prefix-not-shell-tool"; readonly prefixEmpty: "prefix-empty"; readonly prefixNotInCall: "prefix-not-in-call"; readonly expiresRequired: "expires-at-required"; readonly expiresInvalid: "expires-at-invalid"; readonly expiresPast: "expires-at-past"; readonly grantUnknown: "unknown"; readonly grantEnded: "ended"; readonly empty: "empty"; readonly alreadyPaired: "already-paired"; readonly idTaken: "id-taken"; readonly nameInvalid: "name-invalid"; readonly nameTaken: "name-taken"; readonly unknownEvent: "unknown-event"; readonly digestMismatch: "digest-mismatch"; readonly successorUnpaired: "successor-unpaired" }
export declare const REQUEST_GATE: {
  readonly checkOrder: readonly [405, 403, 503]
  readonly admitOrder: readonly [413, 429]
  readonly admitSurfaces: readonly ["mcp"]
  readonly routes: {
    readonly mcp: { readonly "/api/agent/mcp": readonly ["POST"] }
    readonly token: {
      readonly "/api/agent/oauth/token": readonly ["POST"]
      readonly "/.well-known/oauth-protected-resource/api/agent/mcp": readonly ["GET"]
      readonly "/.well-known/oauth-authorization-server/api/agent/oauth": readonly ["GET"]
    }
    readonly approval: { readonly "/authorize": readonly ["GET"]; readonly "/authorize/decision": readonly ["POST"] }
  }
  readonly originRule: { readonly mcp: "refuse-any"; readonly token: "refuse-any"; readonly approval: "own-only" }
  readonly headers: { readonly host: "host"; readonly origin: "origin"; readonly allow: "allow" }
  readonly allowSeparator: ", "
  readonly inFlightRetryAfterMs: number
}
export declare const RESOURCE: {
  readonly events: { readonly name: "agent-events"; readonly uri: "dsh-agent://events"; readonly mimeType: "application/json" }
  readonly identity: { readonly name: "dsh-identity"; readonly uri: "dsh-agent://identity"; readonly mimeType: "application/json" }
}
/** MULTI-0: the advertised server identity (constants.js `SERVER_IDENTITY`). */
export declare const SERVER_IDENTITY: { readonly suffix: "-DSH"; readonly discoverMetaKey: "io.modelcontextprotocol/serverInfo"; readonly updatedNotification: "notifications/resources/updated" }
/**
 * MULTI-0: the one JSON text content of `resources/read dsh-agent://identity`, exactly the MCP
 * `Implementation` `{name, version}` of `server/discover`'s `_meta[SERVER_IDENTITY.discoverMetaKey]`
 * (same live getter, no other member).
 */
export interface ServerIdentity {
  readonly name: string
  readonly version: string
}
export declare const RESPONSE_TYPE: { readonly code: "code" }
export declare const RESYNC_REASON: { readonly staleCursor: "stale-cursor" }
export declare const RETIREMENT_REASON: { readonly withdrawn: "withdrawn"; readonly revoked: "revoked"; readonly released: "released"; readonly reissued: "reissued"; readonly contributorWithdrawn: "contributor-withdrawn" }
export declare const REVOCATION_KIND: { readonly disabled: "disabled"; readonly deleted: "deleted" }
export declare const RISK: { readonly low: "low"; readonly high: "high" }
export declare const SCOPE: { readonly full: "agent"; readonly pair: "agent:pair" }
export declare const SDK_PINS: { readonly "@modelcontextprotocol/server": "2.4.0"; readonly "@modelcontextprotocol/node": "2.1.2" }
export declare const SETTINGS_REFUSAL: { readonly tokenDuplicate: "token-duplicate" }
export declare const SETTLED_BY: { readonly user: "user"; readonly principal: "principal"; readonly delegate: "delegate" }
export declare const READ_ROLE: { readonly user: "user"; readonly assistant: "assistant"; readonly principal: "principal"; readonly agent: "agent"; readonly context: "context" }
export declare const SETTLEMENT_OUTCOME: { readonly allowed: "allowed"; readonly rejected: "rejected"; readonly answered: "answered" }
export declare const TARGET_CODE: { readonly unreachable: "TARGET_UNREACHABLE"; readonly refused: "TOKEN_REFUSED"; readonly incompatible: "TARGET_INCOMPATIBLE"; readonly revoked: "token-revoked"; readonly insecure: "target-insecure"; readonly invalid: "target-invalid" }
export declare const TARGET_STATE: { readonly connected: "connected"; readonly unreachable: "target-unreachable"; readonly refused: "token-refused"; readonly unset: "target-unset" }
export declare const TIME_UNIT: { readonly msPerSecond: 1000 }
export declare const TOKEN_ENDPOINT_LIMITS: { readonly formBodyBytes: number }
export declare const TOKEN_RESPONSE_HEADERS: { readonly "cache-control": "no-store"; readonly pragma: "no-cache" }
export declare const TOKEN_TYPE: "Bearer"
export declare const TOKEN_VALUE: { readonly generatedPrefix: "dsht_"; readonly generatedBytes: 32; readonly opaqueBytes: 32; readonly digestAlgorithm: "sha256" }
export declare const TOOL: { readonly sessionsList: "sessions_list"; readonly workspacesList: "workspaces_list"; readonly modelsList: "models_list"; readonly sessionStart: "session_start"; readonly sessionMessage: "session_message"; readonly sessionRedirect: "session_redirect"; readonly sessionStop: "session_stop"; readonly sessionRead: "session_read"; readonly sessionRelease: "session_release"; readonly approvalsList: "approvals_list"; readonly approvalAnswer: "approval_answer"; readonly questionAnswer: "question_answer"; readonly promptsList: "prompts_list"; readonly promptAnswer: "prompt_answer"; readonly grantsList: "grants_list"; readonly grantRevoke: "grant_revoke"; readonly attachmentPut: "attachment_put"; readonly attachmentRead: "attachment_read"; readonly inboxPoll: "inbox_poll"; readonly inboxAck: "inbox_ack"; readonly pair: "pair"; readonly setName: "set_name" }
export declare const WIRE: { readonly digestHexChars: 64; readonly digestPattern: RegExp }

/** A core tool's definition as `tools/list` lists it. */
export interface CoreToolDefinition {
  readonly name: string
  readonly description: string
  readonly inputSchema: JsonSchemaObject
  /** An exact-one `oneOf` of the success shape(s) and the refusal envelope. */
  readonly outputSchema: { readonly oneOf: readonly JsonSchemaNode[] }
}
export declare const TOOLS: readonly CoreToolDefinition[]
export declare const TOOL_NAMES: readonly string[]
export declare function toolDefinition(name: string): CoreToolDefinition | undefined
export declare function refusalSchema(extra?: Record<string, JsonSchemaNode>): JsonSchemaObject

export declare const EVENT_PAYLOAD_SCHEMA: Readonly<Record<Exclude<EventType, `contributed:${string}`>, JsonSchemaObject>>
export declare const CONTRIBUTED_PAYLOAD_SCHEMA: JsonSchemaObject
export declare const MAILBOX_EVENT_SCHEMA: JsonSchemaObject
export declare const MAILBOX_SUMMARY_SCHEMA: JsonSchemaObject
export declare function payloadSchemaOf(type: unknown): JsonSchemaObject | undefined

export declare function okResult(fields?: Record<string, JsonValue>): CallToolResult
export declare function refusalResult(code: string, extra?: Record<string, JsonValue>, message?: string): CallToolResult

export interface OAuthUrls {
  readonly issuer: string
  readonly resource: string
  readonly tokenEndpoint: string
  readonly protectedResourceMetadata: string
  readonly authorizationServerMetadata: string
}
export declare function oauthUrls(origin: string): OAuthUrls
export declare function protectedResourceMetadata(origin: string): Readonly<Record<string, JsonValue>>
export declare function authorizationServerMetadata(origin: string, approvalOrigin: string): Readonly<Record<string, JsonValue>>
export declare function tokenResponse(issued: { accessToken: string; scope: Scope; refreshToken?: string }):
  Readonly<{ access_token: string; token_type: 'Bearer'; expires_in: 3600; scope: Scope; refresh_token?: string }>
export declare function oauthErrorBody(error: string, description?: string): Readonly<{ error: string; error_description?: string }>
export declare function bearerChallenge(origin: string, problem?: { error?: 'invalid_token' | 'insufficient_scope'; description?: 'not-paired' | 'id-mismatch' }): string
export declare function invalidTokenChallenge(origin: string): string
export declare function insufficientScopeChallenge(origin: string, reason: 'not-paired' | 'id-mismatch'): string

export declare function isAgentId(value: unknown): value is string
export declare function normaliseName(value: unknown): string | undefined
export declare function checkName(value: unknown): Readonly<{ ok: true; name: string } | { ok: false; code: 'name-invalid' }>
export declare function nameKey(normalisedName: string): string
export declare function principalLabel(name: string | null, id: string): Readonly<{ name: string } | { prefix: 'ID: '; id: string }>
export declare function formatOfferId(requestId: string, revision: number): string | undefined
export declare function parseOfferId(value: unknown): Readonly<{ requestId: string; revision: number }> | undefined
export declare function isEventType(value: unknown): value is EventType
