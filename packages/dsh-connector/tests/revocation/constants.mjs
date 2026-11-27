/**
 * Vocabulary for the C-REVOKE cases: step 1 (cases.mjs: the routing surface `endPrincipal`, the
 * routing member `askDropped`, and K1d `Mailbox.retire` misuse) and step 2 (handler-cases.mjs: the
 * revocation module `createRevocation`). Every product value comes from K1
 * (`dsh-agent-connector/mcp-schema`) through the C-ROUTE suite's constants (which take them from K1 and
 * K3 only), or from the two constants the step-2 module exports (REVOCATION_TIMING,
 * REVOCATION_NOTE, read by subject.mjs); nothing comes from `packages/dsh-connector/src/`. The
 * rest is fixture data and harness values.
 */
import path from 'node:path'
import { REPO } from 'dsh-connector-test-helpers/legacy'

export {
  EVENT_TYPE, FIXTURE, MAILBOX, OFFER_TYPES, REFUSAL, RETIREMENT_REASON, RETIRE_OUTCOME, REVOCATION, SETTLED_BY, SETTLEMENT_OUTCOME, WAIT,
} from '../routing/constants.mjs'

/** The routing members this suite drives beyond C-ROUTE's own list (C-WIRE-2: no askDropped, "不给ask_agent工具"). */
export const SURFACE = Object.freeze({ endPrincipal: 'endPrincipal', onLeft: 'onLeft' })

/** Case ids of this suite (cases.mjs names what each covers). */
export const CASE = Object.freeze({
  uc01: 'REV-UC-01', uc02: 'REV-UC-02',
  ep01: 'REV-EP-01', ep02: 'REV-EP-02', ep03: 'REV-EP-03', ep04: 'REV-EP-04', ep05: 'REV-EP-05',
  bva01: 'REV-BVA-01',
  dt01: 'REV-DT-01', dt02: 'REV-DT-02',
  st01: 'REV-ST-01', st02: 'REV-ST-02', st03: 'REV-ST-03',
  // Step 2 (handler-cases.mjs).
  ep06: 'REV-EP-06', ep07: 'REV-EP-07', ep08: 'REV-EP-08',
  bva02: 'REV-BVA-02',
  dt03: 'REV-DT-03', dt04: 'REV-DT-04',
  st04: 'REV-ST-04', st05: 'REV-ST-05', st06: 'REV-ST-06',
  // The design cases step 2 covers, under their own ids (docs/test-design/v3).
  authUc03: 'AUTH-UC-03', authUc06: 'AUTH-UC-06', authDt04: 'AUTH-DT-04',
  handSt01: 'HAND-ST-01', handUc03: 'HAND-UC-03', watchUc02: 'WATCH-UC-02', platSt01: 'PLAT-ST-01', nameEp02: 'NAME-EP-02',
})

/**
 * The step-2 module (relayed by the dev session; subject.mjs binds it). FBTEST_C_REVOKE_ENTRY moves
 * the entry (e.g. to the dev checkout).
 */
export const REVOKE_SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_REVOKE_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'revocation', 'index.js'),
  factory: 'createRevocation',
  timing: 'REVOCATION_TIMING',
  note: 'REVOCATION_NOTE',
  methods: Object.freeze(['start', 'close']),
  /** K1 Mailbox members passed to the real mailbox unrecorded (the module's own calls are hold, release, drop, expireHolds). */
  mailboxReads: Object.freeze(['commit', 'poll', 'ack', 'summary', 'retire', 'retireContributor', 'transfer']),
})

/** Labels of the port calls the revocation module makes, as fakes.mjs PortCalls journals them. */
export const PORT = Object.freeze({
  closeEntry: 'closeEntry',
  endPrincipal: 'endPrincipal',
  hold: 'hold',
  release: 'release',
  drop: 'drop',
  expireHolds: 'expireHolds',
  remove: 'pairs.remove',
  addToken: 'addToken',
  removeToken: 'removeToken',
  note: 'notes.system',
  /** An offer handed to the user's prompt (routing.onLeft since C-WIRE-2; was the `cards.toUser` port). */
  card: 'routing.onLeft',
})
/** A journal entry is a call's start, its resolution or its rejection. */
export const PHASE = Object.freeze({ call: 'call', done: 'done', failed: 'failed' })

/** Node's setTimeout cap (G8): a longer delay fires at once, so no single delay may exceed it. */
export const TIMER = Object.freeze({ maxDelayMs: 2 ** 31 - 1 })
const SECOND_MS = 1000
const HOUR_MS = 3600 * SECOND_MS
/** REVOCATION_TIMING as the dev session relayed it (the brief: the sweep every hour, a retry after 30 s). */
export const RELAYED_TIMING = Object.freeze({ expirySweepMs: HOUR_MS, retryMs: 30 * SECOND_MS })

/** Q7: the system note is model-facing text and stays English (Latin letters, no CJK script). */
export const NOTE_RULE = Object.freeze({ latin: /[A-Za-z]/, cjk: /[\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/ })

/** Fixture data of the step-2 rows: not product values. */
export const HANDLER_FIXTURE = Object.freeze({
  /** Sessions beyond the C-ROUTE fixture's three: Q's managed session, and one handed over to P. */
  sessions: Object.freeze({ s4: 'fbtest-s4', s5: 'fbtest-s5' }),
  /**
   * "After 30 days" in the rows that are not the boundary rows: this far past since +
   * MAILBOX.disabledRetentionMs (as the C-MAILBOX suite's AMEND.justAfterMs), so they hold whichever
   * side of the exact instant the hold ends on; REV-BVA-02 pins the instant itself.
   */
  pastHoldMs: 1,
  /** A message_agent text sent while the designated entry is off. */
  heldText: 'FBTEST-MSG-WHILE-OFF',
})

/**
 * Harness timing of the step-2 rows: the module's port calls count as settled once none is in
 * flight and the journal is unchanged for this many event-loop turns (drain in handler-cases.mjs).
 */
export const HANDLER_WAIT = Object.freeze({ stableTurns: 3 })

/** The mailbox port operations the journal records (fakes.mjs revocationPort). */
export const OP = Object.freeze({
  retire: 'retire',
  /** A `retirement` routing commits itself (a fresh retirement for an offer that is not pending). */
  freshRetirement: 'fresh-retirement',
  commit: 'commit',
  hold: 'hold',
  release: 'release',
  drop: 'drop',
})

/** Fixture data of the misuse and failure rows: not product values. */
export const MISUSE = Object.freeze({
  /** `endPrincipal`'s entry key: none of these is a non-empty string. */
  entryKeys: Object.freeze({ 'empty string': '', number: 42, undefined, null: null, object: Object.freeze({}) }),
  /** `endPrincipal`'s option argument list after the entry key: none carries a boolean `freshRetirements`. */
  options: Object.freeze({
    'options missing': Object.freeze([]),
    'options null': Object.freeze([null]),
    'empty object': Object.freeze([{}]),
    'freshRetirements "true"': Object.freeze([{ freshRetirements: 'true' }]),
    'freshRetirements 1': Object.freeze([{ freshRetirements: 1 }]),
    'freshRetirements null': Object.freeze([{ freshRetirements: null }]),
  }),
  /** `Mailbox.retire`'s principal key: none is a non-empty string. */
  principalKeys: Object.freeze({ 'empty string': '', number: 42, undefined, null: null }),
  /** `Mailbox.retire`'s event id: none is a string. */
  eventIds: Object.freeze({ number: 42, undefined, null: null, object: Object.freeze({}) }),
  /** `Mailbox.retire`'s reason: none is a RETIREMENT_REASON (the values are case-sensitive). */
  reasons: Object.freeze({ 'not a reason': 'fbtest-not-a-reason', 'upper case': 'REVOKED', 'empty string': '', undefined }),
  /** Event ids that are strings but name no pending event: data, not misuse (K1d). */
  dataEventIds: Object.freeze({ 'empty string': '', unknown: 'fbtest-no-such-event' }),
  /** A one-character principal key: the shortest valid one (BVA of "non-empty"). */
  shortestKey: 'k',
  /** An entry key no token entry has. */
  unknownEntry: 'fbtest-entry-no-such-entry',
  failure: 'fbtest injected mailbox failure',
})

/** Logger levels that count as "the failure is logged" (the level is not frozen; either is accepted). */
export const LOGGED_LEVELS = Object.freeze(['warn', 'error'])

/** Owners of rows C-REVOKE cannot check with its own module. */
export const LATER = Object.freeze({
  wire401: 'C-WIRE (C-OAUTH\'s verifier behind C-HTTP\'s route in one connector: C-REVOKE never touches access tokens; the verifier half runs in packages/dsh-connector/tests/oauth AUTH-UC-06 main step 2)',
})
