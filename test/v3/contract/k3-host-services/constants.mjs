/**
 * Vocabulary for the K3 cases: the freeze of the host-only service contracts and core's
 * settings-section extension point (v3-tasks.md row K3, spec `test/v3-cases` at `b1295de`, "types
 * only"). K3 "resolves the K flags in HAND, HOST, UIM, EVT-UC-03"; PLAT-UC-07 is K3's through
 * R-FB-11 ("exact card fields: K3").
 *
 * Every value comes from docs/planning/v3-requirements.md (R-CON-11, R-ROUTE-05, R-HOST-05/06/10/11,
 * R-UI-01/02, R-INT-01…05, R-FB-10/11, R-ARCH-05), from v3-design.md where a requirement defers to it
 * (§3.6 hand-over service, §4.1 child locator, §5.4 token service, §6.1 status codes, §6.4
 * interception) and from the spikes S2 `a499141`, S3 `b4dca86`, S6 `7c2230e`. None comes from an
 * implementation.
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/**
 * K3 "Owns": the two folders the freeze fills, both types only. FBTEST_K3_ROOT moves the package
 * root (a checkout of another branch, or a design-shaped sample used to check these oracles).
 */
const ROOT = process.env.FBTEST_K3_ROOT ?? path.join(REPO, 'packages')
export const FOLDER = Object.freeze({
  /** Host-only services of a main / host DSH (connector-side folder). */
  hostServices: path.join(ROOT, 'dsh-connector', 'host-services'),
  /** Fishball-side contracts of fishball-core (interception, settings sections, ask card). */
  coreContracts: path.join(ROOT, 'core', 'contracts'),
})
/** Declaration files carry the types; other files may only be docs or empty stubs ("types only"). */
export const FILES = Object.freeze({
  declaration: /\.d\.(?:c|m)?ts$/,
  doc: /\.md$/i,
  script: /\.(?:c|m)?js$/,
  /** A script that only re-exports nothing (`export {}`) carries no behaviour. */
  emptyScript: /^(?:export\s*\{\s*\}\s*;?)?$/,
})

/**
 * K3 amendment 2026-11-14 (Fishball, under the user's rule that every tunable value is defined once
 * in its frozen contract's constants object): core contracts may hold one data-only `constants.js`
 * next to the types. Data only means no function, class, method or value import; `import type` and
 * JSDoc comments are fine. Host-services stays types only.
 */
export const DATA_ONLY = Object.freeze({
  /** The one script file core contracts may hold (top level of the folder, this exact name). */
  file: 'constants.js',
  /**
   * Fishball's final rule 2026-11-14: the one function shape allowed is a pure template formatter,
   * `(a, b) => \`…${a}…${b.c}…\`` (plain identifier parameters, the body only a template literal,
   * each interpolation an identifier or dotted member access). Set false to forbid it again.
   */
  templateFormatters: true,
  /**
   * Fishball 2026-11-14 (addition): outside a template formatter the only call allowed is
   * `Object.freeze(…)`, as the contract freezes its objects. Number arithmetic, numeric literals
   * (`0o600`) and `const NAME = …` reused by later values are data.
   */
  allowedCall: Object.freeze(['Object', 'freeze']),
  keyword: Object.freeze({
    function: 'function', class: 'class', import: 'import', export: 'export', type: 'type', from: 'from', new: 'new', default: 'default',
  }),
  punct: Object.freeze({
    arrow: '=>', backtick: '`', interpolation: '${', escape: '\\', quotes: '\'"',
    braceOpen: '{', braceClose: '}', parenOpen: '(', parenClose: ')', bracketClose: ']', comma: ',', dot: '.', star: '*',
  }),
  /** Tokens that may follow a formatter's template body: the next entry, the statement's end or a closing bracket. */
  bodyEnd: Object.freeze([',', ';', '}', ')', ']']),
  violation: Object.freeze({
    function: 'a function', class: 'a class', valueImport: 'a value import', dynamicImport: 'a dynamic import(',
    reExport: 'a value re-export', arrow: 'an arrow function', methodBody: 'a method or function body `) {`',
    call: 'a call other than Object.freeze(…)',
  }),
})

/**
 * Self-check of the data-only detector (EP / BVA over the amendment's rule; inline texts, no
 * filesystem): [title, text, data only?]. Each failing sample breaks the rule in one way only.
 */
const FORMATTER = 'export const NOTICE = Object.freeze({ label: (id, type) => `notice ${id} (${type})` })'
export const DATA_ONLY_SAMPLES = Object.freeze([
  ['a frozen object of strings, numbers, booleans, arrays and a nested frozen object', 'export const X = Object.freeze({ a: 1, b: \'s\', c: true, d: Object.freeze([1, 2]), e: Object.freeze({ f: -0.5 }) })', true],
  ['JSDoc and line comments that mention function, class, import and =>', '/** A function-free table; see import(\'x\') => class. */\n// function f() {}\nexport const X = Object.freeze({ a: 1 })', true],
  ['a string literal holding "=>", "function" and "import("', 'export const X = Object.freeze({ a: \'(a) => b\', b: "function f() {}", c: \'import("y")\' })', true],
  ['an `import type` and an `export type … from`', 'import type { T } from \'./events\'\nexport type { U } from \'./guards\'\nexport const X = Object.freeze({ a: 1 })', true],
  ['an empty `export {}` stub', 'export {}', true],
  ['an arrow function', 'export const X = Object.freeze({ f: (a) => a })', false],
  ['a `function`', 'export function f() { return 1 }', false],
  ['a `class`', 'export class C {}', false],
  ['a method shorthand', 'export const X = Object.freeze({ f() { return 1 } })', false],
  ['a value `import { X } from`', 'import { X } from \'./x.js\'\nexport const Y = Object.freeze({ X })', false],
  ['a default value import named `type`', 'import type from \'./x.js\'\nexport const Y = Object.freeze({ type })', false],
  ['a dynamic `import(`', 'export const X = Object.freeze({ p: import(\'./x.js\') })', false],
  ['a value re-export `export { X } from`', 'export { X } from \'./x.js\'', false],
  ['a value re-export `export * from`', 'export * from \'./x.js\'', false],
  ['a property key named `class` (strict token reading, decided 2026-11-14)', 'export const X = Object.freeze({ class: 1 })', false],
  // The formatter allowance (Fishball's final rule 2026-11-14), both sides of its boundary.
  ['a pure template formatter `(id, type) => `notice ${id} (${type})``', FORMATTER, true],
  ['formatters with no parameter, one bare parameter and a dotted access', 'export const X = Object.freeze({ a: () => `fb-notice`, b: id => `#${id}`, c: (e) => `${e.session.id}:${PREFIX}` })', true],
  ['a template formatter with "=>" and "${" as template text', 'export const X = Object.freeze({ a: (id) => `a => b \\${id} ${id}` })', true],
  ['a formatter calling a function in an interpolation `(x) => `${f(x)}``', 'export const X = Object.freeze({ a: (x) => `${f(x)}` })', false],
  ['a formatter with an operator in an interpolation', 'export const X = Object.freeze({ a: (x) => `${x + 1}` })', false],
  ['a formatter with a nested template in an interpolation', 'export const X = Object.freeze({ a: (x) => `${`${x}`}` })', false],
  ['an arrow with an expression body `(x) => x + 1`', 'export const X = Object.freeze({ a: (x) => x + 1 })', false],
  ['an arrow with a block body `(x) => { return `a` }`', 'export const X = Object.freeze({ a: (x) => { return `a` } })', false],
  ['a template body continued by an operator', 'export const X = Object.freeze({ a: (x) => `${x}` + x })', false],
  ['a tagged template body', 'export const X = Object.freeze({ a: (x) => tag`${x}` })', false],
  ['a destructured parameter', 'export const X = Object.freeze({ a: ({ id }) => `${id}` })', false],
  ['a default parameter value', 'export const X = Object.freeze({ a: (id = 1) => `${id}` })', false],
  ['an async template arrow', 'export const X = Object.freeze({ a: async (id) => `${id}` })', false],
  // The call rule (Fishball 2026-11-14, addition): Object.freeze is the only call outside formatters.
  ['`Object.freeze({a: 1})`', 'export const X = Object.freeze({a: 1})', true],
  ['number arithmetic, `0o600` and a `const` reused by a later value',
    'const DAY_MS = 24 * 60 * 60 * 1000\nexport const X = Object.freeze({ dayMs: DAY_MS, weekMs: 7 * DAY_MS, mode: 0o600, half: -0.5, big: 1_000 })', true],
  ['`Object.values(X).filter(f)`', 'export const Y = Object.freeze({ a: Object.values(X).filter(f) })', false],
  ['`Symbol.for(\'x\')`', 'export const X = Object.freeze({ s: Symbol.for(\'x\') })', false],
  ['`JSON.stringify(x)`', 'export const X = Object.freeze({ s: JSON.stringify(x) })', false],
  ['a bare call `foo()`', 'export const X = foo()', false],
  ['`Object.freeze` reached through another object `a.Object.freeze(…)`', 'export const X = a.Object.freeze({ a: 1 })', false],
  ['a call on a frozen result `Object.freeze([1]).map(f)`', 'export const X = Object.freeze([1]).map(f)', false],
  ['an optional call `f?.(x)`', 'export const X = Object.freeze({ a: f?.(x) })', false],
  ['a `new` expression', 'export const X = Object.freeze({ a: new Map() })', false],
])
/** The formatter sample, checked again with the allowance switched off (the flag is what allows it). */
export const DATA_ONLY_FORMATTER = FORMATTER

/** The Cordis service names the K3 row and design §3.6 / §4.1 / §5.4 / §6.4 give. */
export const SERVICE = Object.freeze({
  handover: 'dshConnectorHandover',
  tokens: 'dshConnectorTokens',
  child: 'dshInstanceChild',
  instance: 'fishballInstance',
})
/** Design §3.6, §4.1, §5.4: every host-only service carries `apiVersion: 1` (UIM-EP-01 row 5). */
export const API_VERSION = Object.freeze({ member: 'apiVersion', value: '1' })

/** Design §3.6 (HAND): members, arities and refusal codes of `dshConnectorHandover`. */
export const HANDOVER = Object.freeze({
  members: Object.freeze(['apiVersion', 'managed', 'principals', 'onChange', 'handOver', 'takeBack']),
  /** handOver(sessionId, principalKey, note?) and takeBack(sessionId, note?): the note is optional. */
  handOver: Object.freeze({ params: 3, optionalFrom: 2 }),
  takeBack: Object.freeze({ params: 2, optionalFrom: 1 }),
  onChange: Object.freeze({ params: 1 }),
  /** HAND-DT-01 rules 1, 2, 6, 7, 7a (R-ROUTE-05). */
  handOverCodes: Object.freeze(['no-agent', 'conflict', 'unknown-session']),
  /** HAND-DT-02 rule 4. */
  takeBackCodes: Object.freeze(['unknown-session']),
  /** Design §3.6 `principals()` fields (R-UI-10: enabled + paired are listed; online = listen stream). */
  principalFields: Object.freeze(['key', 'name', 'id', 'online', 'enabled', 'paired', 'designated']),
  /** Design §3.6 `managed()` entries. */
  managedFields: Object.freeze(['sessionId', 'principal']),
  /** HAND-EP-01 row 5: no session read, approval, question, prompt or answer power on the service. */
  forbiddenMember: /approv|answer|question|prompt|^read|^get|session(?:s|Read)|^list/i,
  /** HAND-EP-01 row 5: `principal.key` is never a token or entry label; no secret field at all. */
  secretField: /token|secret|credential|label|value|password/i,
  /** HAND-EP-02 row 5 (K: "a stable order"): the freeze says how principals() is ordered. */
  orderWords: /\border(?:ed)?\b|\bsort(?:ed)?\b|\bstable\b/i,
})

/** Design §5.4 (HOST): `dshConnectorTokens`. */
export const TOKENS = Object.freeze({
  members: Object.freeze(['apiVersion', 'createHosted', 'retire']),
  createHosted: Object.freeze({ params: 1 }),
  retire: Object.freeze({ params: 2 }),
  /** createHosted resolves to {ref, entryKey, label} and never the value (R-HOST-05). */
  createdFields: Object.freeze(['ref', 'entryKey', 'label']),
  valueField: /^(?:value|token|secret|credential|password|bearer)$/i,
})

/** Design §4.1 and §6.1 (HOST, UIM): `dshInstanceChild`. */
export const CHILD = Object.freeze({
  members: Object.freeze(['apiVersion', 'status', 'onChange', 'origin', 'admit', 'retry', 'targetStatus', 'providerSync']),
  origin: Object.freeze({ params: 1 }),
  admit: Object.freeze({ params: 1, fields: Object.freeze(['view', 'lang', 'hostname']) }),
  retry: Object.freeze({ params: 0 }),
  /** R-UI-02 / S4-Q1 decided A: the loopback hostnames the locator accepts (UIM-EP-02 rows 1–3). */
  hostnames: Object.freeze(['127.0.0.1', 'localhost', '[::1]']),
  /** admit resolves to {url} only: no ticket, token or cookie field beside it (UIM-UC-01 post). */
  admissionField: 'url',
  admissionSecret: /token|ticket|cookie|secret|key/i,
  /** Design §4.1 targetStatus states (HOST-UC-05, REM-DT-01). */
  targetStates: Object.freeze(['connected', 'target-unreachable', 'token-refused', 'target-unset']),
  /**
   * HOST-ST-01 (K: status codes): the lifecycle codes the requirements name for the locator:
   * R-HOST-10 `token-revoked`, R-FB-10 `fishball-off`, design §8.1 `PROFILE_INCOMPATIBLE`, and the
   * §6.1 locator codes `TARGET_UNREACHABLE`, `TOKEN_REFUSED`, `TARGET_INCOMPATIBLE`.
   */
  statusCodes: Object.freeze(['token-revoked', 'fishball-off', 'PROFILE_INCOMPATIBLE', 'TARGET_UNREACHABLE', 'TOKEN_REFUSED', 'TARGET_INCOMPATIBLE']),
  /** HOST-ST-01 states (Stopped, Starting, Running = ready, Failed). */
  states: Object.freeze(['starting', 'ready', 'failed']),
})

/** R-INT-01 and design §6.4 (EVT-UC-03): `fishballInstance.events.intercept`. */
export const INTERCEPT = Object.freeze({
  path: Object.freeze(['events', 'intercept']),
  params: 2,
  registrationFields: Object.freeze(['pluginId', 'types', 'filter', 'priority']),
  /** `filter` and `priority` are optional; `pluginId` and `types` are not. */
  optionalFields: Object.freeze(['filter', 'priority']),
  requiredFields: Object.freeze(['pluginId', 'types']),
  /** The handler gets (e, ctl); `ctl` has exactly these members (R-INT-01, "exactly"). */
  handlerParams: 2,
  controller: Object.freeze(['accept', 'commit', 'release']),
  accept: Object.freeze({ params: 0 }),
  commit: Object.freeze({ params: 1 }),
  /** release(e, {toFishball: true}) (R-INT-05). */
  release: Object.freeze({ params: 2, option: 'toFishball' }),
  /** R-INT-01: priority defaults to 0; the freeze records the default where `priority` is declared. */
  priorityDefault: Object.freeze({ word: /default/i, value: /\b0\b/ }),
  promise: /^Promise\s*</,
})

/** R-HOST-11, R-CORE (3): a section has an id, a title, an order, mount and unmount. */
export const SECTION = Object.freeze({
  register: 'register',
  fields: Object.freeze(['id', 'title', 'order', 'mount', 'unmount']),
  /** The integration probe: its own marker attribute and text (test fixture values, not product values). */
  probe: Object.freeze({ id: 'fbtest-k3-section', title: 'K3 probe', order: 1000, marker: 'data-fbtest-k3-section', text: 'K3 probe section' }),
})

/** R-FB-11 / PLAT-UC-07 (K: card fields, K3): the asking session, the question, choices or a free answer. */
export const ASK_CARD = Object.freeze({
  session: /session/i,
  question: /question|prompt|text/i,
  choices: /choice|option/i,
  free: /free|allowText|answerText|custom/i,
})

/** Parser budgets (a referenced type is followed at most this deep). */
export const RESOLVE_DEPTH = 8

/** Integration rows need a real hosted child; they run only when this variable is set. */
export const INTEGRATION = Object.freeze({
  env: 'FBTEST_V3_INTEGRATION',
  on: '1',
  note: 'integration (real hosted child): run with FBTEST_V3_INTEGRATION=1',
  homeLabel: 'v3-k3',
  /** Harness waits only; not a product oracle. */
  waitMs: 150000,
  pollMs: 200,
})

/** Owners of the rows K3 cannot check (v3-tasks.md W2–W6 at `b1295de`). */
export const LATER = Object.freeze({
  route: 'C-ROUTE (hand-over service behaviour: managed state, handOver / takeBack, principals, onChange)',
  intercept: 'F-INTERCEPT (interception service: dispatch, priority, ties, warnings, fallback, ledger)',
  host: 'I-HOST (dshInstanceChild locator: lifecycle codes, Retry, admission, hostname rules)',
  succeed: 'C-SUCCEED (dshConnectorTokens: createHosted and retire)',
  shell: 'U-SHELL (embed-UI service detection, instance-missing, the sidebar entry)',
  marks: 'U-MARKS (Hand over control labels and order)',
  records: 'U-RECORDS (inline records)',
  tools: 'C-TOOLS / K1 (session_release over MCP)',
  e2e: 'E2E-UI / E2E-CORE (W6 browser flows; no browser in this suite)',
})
