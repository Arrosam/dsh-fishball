/**
 * Vocabulary for the C-PAIR cases (v3-tasks.md row C-PAIR): AUTH-UC-02, AUTH-UC-04, AUTH-EP-03,
 * AUTH-EP-06, AUTH-DT-02, AUTH-BVA-05, AUTH-ST-01 (rows 2–4, 11, 13, 14), NAME-UC-01, NAME-UC-03,
 * NAME-EP-01, NAME-EP-02, NAME-EP-03, NAME-EP-04, NAME-BVA-01, NAME-BVA-03, NAME-DT-01, NAME-DT-02,
 * NAME-ST-01 (rows 1–7).
 *
 * Every product value comes from K1, `dsh-connector/mcp-schema`: the runtime constants and
 * rules from `index.js`, and the `PairStore` member list from the frozen `index.d.ts` (types only,
 * so it is read from the declaration text). Nothing comes from `packages/dsh-connector/src/pairs/`.
 * The rest is case data (the ids, names and inputs the case tables name) and fixture keys, which
 * are not product values.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  ID_REFUSAL, INSUFFICIENT_SCOPE_REASON, NAME_RULES, PAIR_ADVICE, PAIR_TIMING, REFUSAL, SCOPE, TIME_UNIT, nameKey, principalLabel,
} from '../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../support/constants.mjs'

export { ID_REFUSAL, INSUFFICIENT_SCOPE_REASON, NAME_RULES, PAIR_ADVICE, PAIR_TIMING, REFUSAL, SCOPE, TIME_UNIT, nameKey, principalLabel }

/**
 * The C-PAIR entry and the two exports the cases use, as Fishball relayed C-PAIR's surface
 * (2026-11-14): `openPairStore(ctx, {defineDomain, domainTable}, {logger?})` resolves `{store,
 * close}` with `store` a K1 `PairStore` (ctx needs `ctx.storageDomain`), and the pure
 * `powerOf(pair, clientId)` resolves the live scope of R-ID-03 / R-ID-06 as `{scope}` or `{scope,
 * reason}`. FBTEST_C_PAIR_ENTRY moves the entry (e.g. to the dev checkout).
 */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_C_PAIR_ENTRY ?? path.join(REPO, 'packages', 'dsh-connector', 'src', 'pairs', 'index.js'),
  open: 'openPairStore',
  power: 'powerOf',
  /** AUTH-ST-01 row 11: no operation of the store may undo a binding (R-ID-09: there is no unpair). */
  unbindName: /unpair|unbind/i,
})


/** K1's declaration of the internal interfaces; the `PairStore` members are read from it. */
const K1_TYPES = path.join(REPO, 'packages', 'dsh-connector', 'mcp-schema', 'index.d.ts')
/** The member names of K1's `export interface PairStore { … }`, in declaration order. */
export function pairStoreMembers() {
  const body = /export interface PairStore \{([\s\S]*?)\n\}/.exec(fs.readFileSync(K1_TYPES, 'utf8'))
  if (!body) throw new Error('K1 index.d.ts declares no PairStore interface')
  return [...body[1].matchAll(/^\s{2}(\w+)\(/gm)].map((m) => m[1])
}

/**
 * `PairStore.succeed`'s refusal code: K1 declares it only as a type (`SucceedResult`, index.d.ts),
 * so it is read from the declaration text, as `pairStoreMembers` reads the members.
 */
export function succeedRefusal() {
  const m = /export type SucceedResult\s*=[^\n]*code:\s*'([^']+)'/.exec(fs.readFileSync(K1_TYPES, 'utf8'))
  if (!m) throw new Error('K1 index.d.ts declares no SucceedResult refusal code')
  return m[1]
}

/** Fixture data of the K1-amendment `succeed` rows (R-NAME-07, NAME-ST-01 rows 8–9, HOST-UC-03). */
export const SUCCEED = Object.freeze({
  /** HOST-UC-03: the old hosted entry's name and the two ids. */
  navigator: 'Navigator',
  navigatorLower: 'navigator',
  oldId: 'fb-old',
  newId: 'fb-new',
  thirdId: 'fb-third',
  successorOwnName: 'Scout',
  /** Rounds of the succeed / set_name race. */
  raceRounds: 6,
})

/** The installed SDK packages a pair store needs: DSH storage, its JSON backend and the domain layer. */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  storage: '@deepseek-ai/dsh-storage',
  storageJson: '@deepseek-ai/dsh-storage-json',
  storageDomain: '@deepseek-ai/dsh-storage-domain',
  backend: 'json',
  /** Runtime packages outside `@deepseek-ai/` that DSH ships and connector modules import. */
  runtimePackages: Object.freeze(['zod']),
})

/** Fixture data: opaque entry keys, the case tables' ids and names, and an injected clock. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-c-pair-',
  domainDir: 'domain',
  /** `EntryKey` is opaque (K1): any stable string a token registry might hand out. */
  entry: (n) => `fbtest-entry-${n}`,
  /** The reference instant of the fake clock (README "clock"); times are offsets from it. */
  t0: Date.UTC(2026, 10, 14),
  /** AUTH-UC-04: `pairedAt` T1 and the later authenticated request T2. */
  t1Offset: 1_000,
  t2Offset: 2 * PAIR_TIMING.lastSeenWriteIntervalMs,
  /** AUTH-BVA-05 row 4: the first request after pairing, some seconds later. */
  firstRequestOffset: 5_000,
  /** The approval page's client (AUTH-UC-10's fixture). */
  client: Object.freeze({ clientIdUrl: 'https://agent.example/cimd.json', redirectUri: 'http://127.0.0.1:7777/cb' }),
  /** NAME-BVA-03 row 2: "10 at once". */
  crowd: 10,
  /** NAME-BVA-03 row 3: rounds of the pair / set_name race (either branch may win). */
  raceRounds: 8,
  id: Object.freeze({
    agentA: 'agent-a', a: 'a', b: 'b', x: 'x', y: 'y', abc: 'abc', ABC: 'ABC', n123: '123', n999: '999',
    agentW: 'agent-w-1', crowd: (n) => `agent-${n}`, race: (n) => `racer-${n}`, holder: (n) => `holder-${n}`,
  }),
  name: Object.freeze({
    fishball: 'Fishball', fishballLower: 'fishball', ops: 'Ops', bob: 'Bob', agentA: 'Agent A', blank: '   ',
    fishball2: 'Fishball-2', indexer: 'Indexer', indexerUpper: 'INDEXER', watcher: 'Watcher',
    race: (n) => `Race ${n}`,
  }),
  /** NAME-BVA-01: the filler character, a space, and one NFD pair that is one code point in NFC. */
  fill: 'a',
  space: ' ',
  decomposed: 'e\u0301',
  decomposedPairs: 4,
})

/** AUTH-EP-03 rows 1–6: the id classes, and whether the id grammar accepts them (R-ID-02). */
export const ID_CLASSES = Object.freeze([
  ['1', 'letters', ['abc'], true],
  ['2', 'all allowed chars', ['Az_09-'], true],
  ['2a', 'dot inside', ['fb.1'], false],
  ['2b', 'leading / trailing dot, dot only', ['.fb', 'fb.', '.'], false],
  ['3', 'space', ['a b'], false],
  ['4', 'slash, colon, @', ['a/b', 'a:b', 'a@b'], false],
  ['5', 'non-ASCII', ['é', 'ｆｂ'], false],
  ['6', 'control char', ['a\u0000b'], false],
])

/** NAME-EP-01: [row, class, input, stored name, or `null` for `name-invalid`] (R-NAME-02, TQ-6 A). */
export const NAME_CLASSES = Object.freeze([
  ['1', 'plain', 'Bob', 'Bob'],
  ['2', 'surrounding spaces', '  Bob  ', 'Bob'],
  ['3', 'inner runs', 'Bob   the\t\tfish', 'Bob the fish'],
  ['4', 'other Unicode whitespace (NBSP)', 'Bob\u00A0\u00A0fish', 'Bob fish'],
  ['4', 'other Unicode whitespace (ideographic space)', 'Bob\u3000fish', 'Bob fish'],
  ['5', 'NFD input', 'Cafe\u0301', 'Caf\u00E9'],
  ['6', 'empty', '', null],
  ['7', 'whitespace only', '   ', null],
  ['8', 'control char inside', 'Bo\u0007b', null],
  ['9', 'newline inside', 'Bob\nFish', 'Bob Fish'],
  ['9a', 'tab inside', 'Bob\tFish', 'Bob Fish'],
  ['9b', 'a non-whitespace control char inside', 'Bo\u0007b', null],
  ['9c', 'name starting with ID:', 'ID: agent-x', 'ID: agent-x'],
  ['10', 'CJK', '小鱼', '小鱼'],
  ['11', 'emoji', '🐟 fish', '🐟 fish'],
])
/** NAME-EP-01 row 12: a non-string name (K1 README: `name-invalid`, or `invalid-arguments` at the schema). */
export const NON_STRING_NAME = 42

/** NAME-EP-02: A holds `holds`; B sets `sets`. `holder`: who holds it; `taken`: the expected clash. */
export const HOLDER = Object.freeze({ other: 'other', own: 'own', disabled: 'disabled', deleted: 'deleted' })
export const UNIQUENESS = Object.freeze([
  ['1', 'Fishball-2', 'fishball-2', HOLDER.other, true],
  ['2', 'Fishball-2', ' Fishball-2 ', HOLDER.other, true],
  ['3', 'Straße', 'STRASSE', HOLDER.other, true],
  ['4', 'Caf\u00E9', 'Cafe\u0301', HOLDER.other, true],
  ['5', 'Bob fish', 'Bob  fish', HOLDER.other, true],
  ['6', 'Bob', 'Bobb', HOLDER.other, false],
  ['7', 'Bob', 'BOB', HOLDER.own, false],
  ['8', 'Bob', 'Bob', HOLDER.own, false],
  ['9', 'Bob', 'bob', HOLDER.disabled, true],
  ['10', 'Bob', 'bob', HOLDER.deleted, false],
])

/**
 * The task that owns each flow C-PAIR cannot run alone (v3-tasks.md). A row needing one of them is
 * a `todo` naming it; the store-level part of the same row runs here.
 */
export const LATER = Object.freeze({
  mcpEndpoint: 'C-HTTP (W2): 401 / 403 insufficient_scope at the MCP endpoint, before any tool runs',
  seenCallSite: 'C-HTTP (W2): which requests call PairStore.seen (a 401 never does)',
  mailbox: 'C-MAILBOX (W2): one durable mailbox per pair',
  contributor: 'C-EXT (W2): call.principal handed to contributors',
  revoke: 'C-REVOKE (W4): a disabled entry keeps its pair and name until it is deleted',
  routeNotes: 'C-ROUTE (W3): connector notes in sessions ("managed by …")',
  marks: 'U-MARKS (W4): managed marks and the Hand over control',
  wire: 'C-WIRE (W4b): the tools over MCP end to end, and the native settings status rows',
  coreIdentity: 'F-PAIR (W3): fishball-core\'s identity.id setting',
  succeedFailure: 'C-SUCCEED (HOST-UC-03 E2): an injected storage failure in the succession step changes nothing (the C-PAIR world has no write-failure seam)',
})
