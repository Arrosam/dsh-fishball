/**
 * Vocabulary for the C-REVOKE step-1 cases (cases.mjs): the routing surface `endPrincipal`, the
 * routing member `askDropped`, and K1d `Mailbox.retire` misuse. Every product value comes from K1
 * (`dsh-connector/mcp-schema`) through the C-ROUTE suite's constants (which take them from K1 and
 * K3 only); nothing comes from `packages/dsh-connector/src/routing/` or `src/mailbox/`. The rest is
 * fixture data and harness values.
 */
export {
  EVENT_TYPE, FIXTURE, MAILBOX, OFFER_TYPES, REFUSAL, RETIREMENT_REASON, RETIRE_OUTCOME, REVOCATION, WAIT,
} from '../routing/constants.mjs'

/** The routing members this suite drives beyond C-ROUTE's own list (the step-1 surface the dev relayed). */
export const SURFACE = Object.freeze({ endPrincipal: 'endPrincipal', askDropped: 'askDropped' })

/** Case ids of this suite (cases.mjs names what each covers). */
export const CASE = Object.freeze({
  uc01: 'REV-UC-01', uc02: 'REV-UC-02',
  ep01: 'REV-EP-01', ep02: 'REV-EP-02', ep03: 'REV-EP-03', ep04: 'REV-EP-04', ep05: 'REV-EP-05',
  bva01: 'REV-BVA-01',
  dt01: 'REV-DT-01', dt02: 'REV-DT-02',
  st01: 'REV-ST-01', st02: 'REV-ST-02', st03: 'REV-ST-03',
})

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

/** Owners of rows step 1 cannot check (the brief's step-2 list). */
export const LATER = Object.freeze({
  step2: (what) => `C-REVOKE step 2 (${what})`,
})
