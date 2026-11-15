/**
 * Vocabulary for the F-PAIR cases (v3-tasks.md row F-PAIR; .runtime/reports/v3-w3-briefs.md
 * "F-PAIR test brief"): AUTH-UC-05 (decisions), AUTH-DT-06, AUTH-ST-03 (non-warning-UI rows),
 * NAME-UC-02 (core part), NAME-DT-03 (core reaction) and `token-revoked` (AUTH-ST-03 row 10,
 * HOST-UC-04 main as core sees it).
 *
 * Every value comes from docs/test-design/v3/01-auth-pairing.md, 02-names.md, 08-hosted.md,
 * docs/planning/v3-requirements.md (R-ID-02/05/07/10/13, R-OA-18/19, R-FB-04, R-NAME-02/03/05,
 * R-HOST-10) and the frozen contracts: K1 `dsh-connector/mcp-schema` (scopes, tools, OAuth
 * builders, pair results, TARGET_STATE / TARGET_CODE) and K3 `host-services/child.d.ts`
 * (`token-revoked` = refused after the child had paired with it). Tunable values are imported from
 * K1, never restated. No value comes from F-PAIR's implementation.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'

export { K1 }

/** Core's target status words (K1 is their one runtime owner, DECIDED D7; K3 child.d.ts types them). */
export const STATE = K1.TARGET_STATE
export const CODE = K1.TARGET_CODE

/**
 * `fishball-core`'s identity settings (R-ID-10, R-NAME-03). The generated id is `fb-` and 16 random
 * lowercase base32 characters (R-ID-10); base32 is read as RFC 4648's alphabet `a–z 2–7` in lower
 * case (spec question 5 to Fishball, 2026-11-15).
 */
export const IDENTITY = Object.freeze({
  idKey: 'identity.id',
  nameKey: 'identity.name',
  generated: /^fb-[a-z2-7]{16}$/,
  /** R-NAME-03 / R-NAME-04 (Q-NAME-1 B): the local default name. */
  defaultName: 'Fishball',
  /** R-ID-02: the refusal word of an invalid `identity.id` (K1 owns it). */
  idInvalid: K1.ID_REFUSAL.idInvalid,
  /** R-NAME-03: an empty `identity.name` clears the name (NAME-UC-02 E3). */
  cleared: '',
})

/** How many generated ids the generation row draws: enough that a fixed or short-period source shows. */
export const GENERATION_SAMPLE = 32

/**
 * AUTH-EP-03 and AUTH-BVA-02 id rows that `fishball-core` checks when the setting is saved
 * (R-ID-02, AUTH-EP-03 row 2c: "refused `id-invalid`; previous id stays").
 */
const LETTER = 'a'
/** R-ID-02 / AUTH-BVA-02: an id is 1–64 characters (the case's bound; K1's grammar must agree, see cases). */
const MAX_ID = 64
export const ID_ROWS = Object.freeze({
  valid: Object.freeze([
    ['EP-03 row 1', 'letters', 'abc'],
    ['EP-03 row 2', 'all allowed characters', 'Az_09-'],
    ['BVA-02 row 2', 'length 1', LETTER],
    ['BVA-02 row 3', 'length 2', LETTER.repeat(2)],
    ['BVA-02 row 4', 'length 63', LETTER.repeat(MAX_ID - 1)],
    ['BVA-02 row 5', 'length 64', LETTER.repeat(MAX_ID)],
  ]),
  invalid: Object.freeze([
    ['EP-03 row 2a / 2c', 'a dot inside', 'fb.1'],
    ['EP-03 row 2b', 'a leading dot', '.fb'],
    ['EP-03 row 2b', 'a trailing dot', 'fb.'],
    ['EP-03 row 2b', 'a dot only', '.'],
    ['EP-03 row 3', 'a space', 'a b'],
    ['EP-03 row 4', 'a slash', 'a/b'],
    ['EP-03 row 4', 'a colon', 'a:b'],
    ['EP-03 row 4', 'an at sign', 'a@b'],
    ['EP-03 row 5', 'non-ASCII', 'é'],
    ['EP-03 row 5', 'full-width', 'ｆｂ'],
    ['EP-03 row 6', 'a control character', 'a\u0000b'],
    ['BVA-02 row 1', 'length 0', ''],
    ['BVA-02 row 6', 'length 65', LETTER.repeat(MAX_ID + 1)],
    ['BVA-02 row 7', 'length 64 including one dot', LETTER.repeat(MAX_ID - 1) + '.'],
  ]),
})

/** Core's target settings (design §5.4 "Standalone": `target.url` and `target.tokenRef`). */
export const SETTING = Object.freeze({ url: 'target.url', tokenRef: 'target.tokenRef' })

/** Names of the NAME-UC-02 / NAME-DT-03 rows (test data of the cases). */
export const NAME = Object.freeze({
  renamed: 'Navigator',
  other: 'Ops',
  otherFolded: 'ops',
  ownCaseOnly: 'fishball',
  /** NAME-UC-02 E2: 65 characters, one over R-NAME-02's maximum. */
  tooLong: 'n'.repeat(K1.NAME_RULES.maxChars + 1),
  given: 'Bob',
})

/** A token value of K1's generated shape, fresh per call, so no secret is a literal of this folder. */
export const token = () => K1.TOKEN_VALUE.generatedPrefix + randomBytes(K1.TOKEN_VALUE.generatedBytes).toString('base64url')

/** Fixture ids and references (opaque test data; R-ID-02-valid ids). */
export const FIXTURE = Object.freeze({
  /** Core's own id in the rows that set one (not the generated one). */
  coreId: 'fbtest-core-a',
  /** A second id core moves to (A2, A5, ST-03 rows 9 and 13). */
  coreIdNext: 'fbtest-core-b',
  /** An id another agent holds on that DSH (A5, DT-06 rule 10, R-ID-13). */
  otherId: 'fbtest-other-agent',
  /** The bound pair's name in the `already-paired` rows (A1). */
  boundName: 'Old Fishball',
  /** Token references (R-FB-03: a credential-store reference; opaque, Q-9). */
  ref: 'fishball/token-a',
  refNext: 'fishball/token-b',
  /** C-PAIR's entry keys are opaque; any stable string a token registry might hand out. */
  entry: (n) => `fbtest-f-pair-entry-${n}`,
  /** A fixed `lastSeenAt` of a pre-bound entry (A1: the warning names it). */
  lastSeenAt: Date.UTC(2026, 10, 14, 9, 30),
  pairedAt: Date.UTC(2026, 10, 1),
})

/** MCP 2026-07-28 method names the fake connector answers (spec vocabulary, not product values). */
export const RPC = Object.freeze({
  discover: 'server/discover',
  toolsList: 'tools/list',
  toolsCall: 'tools/call',
  listen: 'subscriptions/listen',
  acknowledged: 'notifications/subscriptions/acknowledged',
  resourcesRead: 'resources/read',
  resourcesList: 'resources/list',
  jsonrpc: '2.0',
  resultComplete: 'complete',
  subscriptionIdKey: 'io.modelcontextprotocol/subscriptionId',
  parseError: -32700,
  methodNotFound: -32601,
})

/** HTTP and media-type words the fake uses. */
export const WEB = Object.freeze({
  json: 'application/json',
  sse: 'text/event-stream',
  basic: 'Basic ',
  bearer: K1.TOKEN_TYPE + ' ',
  accepted: 202,
  post: 'POST',
  get: 'GET',
  formGrant: 'grant_type',
  formClientId: 'client_id',
  formSecret: 'client_secret',
})

/**
 * AUTH-DT-06 rule 9 (R-OA-18): a custom token-response field that claims a pairing state. The
 * stock client drops custom fields, and core must read pairing state only from `scope` and `pair`.
 */
export const CUSTOM_TOKEN_FIELD = Object.freeze({ fishball_pairing: K1.PAIR_STATE.paired })

/** Fake mailbox data (K1 fixes only their shapes). */
export const MAILBOX = Object.freeze({ cursor: 'fbtest-cursor', generation: 'g1' })

/**
 * The pairing module, the one seam between these cases and F-PAIR (`packages/core/src/identity/`).
 * K1, K2 and K3 freeze no JS entry for it; the names are the surface Fishball relayed from the dev
 * session (2026-11-15, `dev/v3-f-pair` at `ed5f2b75` / `a5ec0bfd`), used only by subject.mjs.
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_F_PAIR_ENTRY ?? path.join(REPO, 'packages', 'core', 'src', 'identity', 'index.js'),
  factory: 'createPairing',
  openRecords: 'openRecords',
  createRecords: 'createRecords',
  generateId: 'generateId',
  acceptId: 'acceptId',
  requestedName: 'requestedName',
  functions: Object.freeze(['createPairing', 'openRecords', 'createRecords', 'generateId', 'acceptId', 'requestedName']),
  // Only the constants the cases read are required (the relay also named CHOICES_OF, CHOICE_REFUSAL, NO_CHOICES, SCOPE_LIST).
  constants: Object.freeze(['IDENTITY', 'PAIRING_STATE', 'CHOICE']),
  identity: 'IDENTITY',
  states: 'PAIRING_STATE',
  choices: 'CHOICE',
  choicesOf: 'CHOICES_OF',
})

/**
 * The words of AUTH-ST-03's core states, R-ID-07's choices and `choose`'s refusals, as the dev
 * session relayed them through Fishball (2026-11-15). The case files name the states (NoRecord,
 * WarnMatch, …) but fix no words, so these are the relay's, keyed by the case's names. AUTH-ST-03's
 * TokenRefused is not a pairing state: it is the link's TargetStatus `token-refused` (Fishball
 * answer 2), so it has no key here.
 */
export const RELAYED = Object.freeze({
  state: Object.freeze({
    noRecord: 'unpaired',
    paired: 'paired',
    warnMatch: 'warn-match',
    warnMismatch: 'warn-mismatch',
    needToken: 'need-token',
    needId: 'need-id',
    idMismatch: 'id-mismatch',
  }),
  choice: Object.freeze({ continue: 'continue', newTokenAndId: 'new-token-and-id', newToken: 'new-token' }),
  refusal: Object.freeze({ notConfirmed: 'not-confirmed', notOffered: 'not-offered', notSaved: 'not-saved' }),
})

/** Harness waits and polls only; never a product oracle. */
export const HARNESS = Object.freeze({
  settleMs: 20000,
  pollMs: 25,
  /** How long a "nothing happens" check watches before it decides. */
  quietMs: 1500,
  /** Dual-stack wildcard: one fake answers 127.0.0.1, localhost and [::1] on one port. */
  bindHost: '::',
  loopback: K1.HOSTS.loopbackNames[0],
  tempPrefix: 'fbtest-f-pair-',
})

/** `http://<loopback>:<port><mcp path>`. */
export const mcpUrl = (port) => `${K1.HOSTS.loopbackScheme}//${HARNESS.loopback}:${port}${K1.PATHS.mcp}`

/** Rows that need a later task. */
export const LATER = Object.freeze({
  page: 'E2E-CORE (the Fishball page: the warning, its tick and Continue button, the name-clash lines)',
  marks: 'E2E-UI (managed marks, the Hand over button and the token entry status show the new name)',
})
