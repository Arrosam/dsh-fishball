/**
 * Vocabulary for the C-MAILBOX cases (v3-tasks.md row C-MAILBOX; .runtime/reports/v3-remaining-plan.md
 * W2): EVT-UC-01, EVT-EP-02, EVT-EP-04 rows 1, 2, 5, 6 (rows 3–4 are C-HTTP's), EVT-BVA-01,
 * EVT-BVA-02, EVT-ST-01.
 *
 * Every product value comes from the K1 freeze `dsh-agent-connector/mcp-schema` (event types, the
 * events resource, page limits, the queue bound, refusal codes, retirement reasons, offer ids, the
 * digest grammar, the event and summary schemas). DSH's own package names are the installed SDK's.
 * The rest is fixture data (principal keys, markers, the case's own burst size) and harness values,
 * which are not product values.
 */
import path from 'node:path'
import {
  ANSWERABLE_TYPES, CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, EVENT_PAYLOAD_SCHEMA, EVENT_TYPE, MAILBOX, MAILBOX_EVENT_SCHEMA,
  MAILBOX_SUMMARY_SCHEMA, OFFER_ID, QUEUE, REFUSAL, RESOURCE, RESYNC_REASON, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, WIRE,
  formatOfferId, payloadSchemaOf,
} from '../../mcp-schema/index.js'
import { NAMESPACE } from '../../tools/index.js'
import { REPO } from '../../../../test/support/constants.mjs'

export {
  ANSWERABLE_TYPES, CONTRIBUTED_TYPE_PREFIX, DECISION_KIND_OF, EVENT_PAYLOAD_SCHEMA, EVENT_TYPE, MAILBOX, MAILBOX_EVENT_SCHEMA,
  MAILBOX_SUMMARY_SCHEMA, OFFER_ID, QUEUE, REFUSAL, RESOURCE, RESYNC_REASON, RETIREMENT_REASON, SETTLED_BY, SETTLEMENT_OUTCOME, WIRE,
  formatOfferId, payloadSchemaOf,
}

/**
 * The C-MAILBOX "Owns" folder and its entry. K1 freezes the `Mailbox` and `HintSink` interfaces but
 * no factory, so the factory is found by meaning (subject.mjs states the one assumed shape).
 * FBTEST_C_MAILBOX_ENTRY moves the entry (another checkout).
 */
export const SUBJECT = Object.freeze({
  dir: path.join(REPO, 'packages', 'dsh-connector', 'src', 'mailbox'),
  entry: process.env.FBTEST_C_MAILBOX_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'mailbox', 'index.js'),
  factoryName: /^(?:create|open)\w*mailbox$/i,
  /** The K1 `Mailbox` methods every case drives (index.d.ts). */
  methods: Object.freeze(['commit', 'poll', 'ack', 'summary', 'retire', 'hold', 'release', 'drop']),
})

/** DSH packages the world is built from (installed SDK). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  storage: '@deepseek-ai/dsh-storage',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  /** dsh-storage-domain's config: the json backend, no per-domain routes. */
  domainConfig: Object.freeze({ backend: 'json', routes: Object.freeze({}) }),
})

/** Fixture data: not product values. */
export const FIXTURE = Object.freeze({
  /** Two pairs' opaque principal keys (K1 `PrincipalKey`). */
  p: 'fbtest-principal-p',
  q: 'fbtest-principal-q',
  /** The managed session of EVT-UC-01 (S1) and a second one. */
  s1: 'fbtest-s1',
  s2: 'fbtest-s2',
  marker: 'FBTEST-MBX-',
  namespace: 'fbtest',
  contributedEvent: 'ping',
  note: 'fbtest hand-over note',
  /** The injected clock's reference instant (ms since the epoch). */
  epochMs: Date.UTC(2026, 10, 14),
  /** EVT-EP-04 row 6: "100 events to P in a burst" (the case's own number). */
  burst: 100,
  /** A receipt digest that is well formed but not the event's (EVT-EP-02 row 5). */
  wrongDigest: '0'.repeat(WIRE.digestHexChars),
  tempPrefix: 'fbtest-c-mailbox-',
  storageDir: 'storage',
})

/**
 * The K1 amendments after W2 (amend-cases.mjs): mailboxGeneration (DECIDED #W2-1) and
 * `Mailbox.retireContributor` with `EventDraft.activationTag`. Fixture data only.
 */
export const AMEND = Object.freeze({
  /** `contributed:<namespace>.<event>`: K2's namespace separator. */
  typeSeparator: NAMESPACE.separator,
  /** A namespace that shares FIXTURE.namespace as a prefix, so `contributed:fbtest.*` must not reach it. */
  otherNamespace: FIXTURE.namespace + 'x',
  /** Two contributor activations' opaque tags. */
  tag: Object.freeze({ a: 'fbtest-activation-a', b: 'fbtest-activation-b', unknown: 'fbtest-activation-none' }),
  /** A contributor event's correlation id, kept by its retirement. */
  correlationId: 'fbtest-correlation',
  /** Tags that are no opaque non-empty string: a number and the empty string. */
  badTags: Object.freeze([42, '']),
  /** "After MAILBOX.disabledRetentionMs": this much past the end of the hold. */
  justAfterMs: 1,
})

/**
 * K1 amendment at the W3 merge (DECIDED #W3-1): `Mailbox.retire` resolves `RetireOutcome`
 * `{retired: boolean}` (index.d.ts, types only, so its two values are written out here). `true`:
 * a pending event of that pair was replaced by a `retirement`; `false`: nothing was pending to
 * replace (acked, already retired, unknown, another pair's), nothing committed or changed.
 * C-ROUTE's cases read these too (the same K1 type).
 */
export const RETIRE_OUTCOME = Object.freeze({
  replaced: Object.freeze({ retired: true }),
  nothing: Object.freeze({ retired: false }),
})

/** Fixture data of the RETIRE_OUTCOME rows (amend-cases.mjs K1-AMEND-9): not product values. */
export const RETIRE_FIXTURE = Object.freeze({
  /** An event id no commit returned. */
  unknownEventId: 'fbtest-no-such-event',
  /** A principal key that is no K1 `PrincipalKey` (a string): misuse, which throws. */
  badPrincipalKey: 42,
})

/** Harness timing only. */
export const WAIT = Object.freeze({ testMs: 60000 })

/** Owners of rows this task cannot check (v3-tasks.md W2–W4). */
export const LATER = Object.freeze({
  http: 'C-HTTP (the MCP route: subscriptions/listen and its acknowledgement, resources/read, HTTP 403 insufficient_scope)',
  httpUri: 'C-HTTP (resources/read and subscribe on any URI other than dsh-agent://events answer not found)',
  tools: 'C-TOOLS (approval_answer / question_answer authority: the live offer id and the holding pair, design §3.4)',
  generation: 'K1 amendment, then C-MAILBOX (K1 states no event that starts a new mailboxGeneration, so no test can make a stale cursor without inventing one; user decision 2026-11-14)',
})
