/**
 * Vocabulary for the WD-ROUTE cases (.runtime/reports/v3-w3-briefs.md "WD-ROUTE test brief";
 * v3-tasks.md row WD-ROUTE): WD-UC-02, WD-UC-04, WD-EP-01 rows 1–11, WD-EP-03, WD-DT-02, WD-ST-01
 * and the `preset-watchdog` agent preset (R-WD-16, WD-EP-04 row 5).
 *
 * Product values come only from frozen contracts and requirements, never from an implementation:
 * - K1 `dsh-connector/mcp-schema` (event types, tool names, offer ids, `disconnected`);
 * - K1's V2 contract module (`DECISION`, the `approval_answer` verbs);
 * - K3 `packages/core/contracts/constants.js` (`INTERCEPT.defaultPriority`, `GUARDS.watchdogAgentPreset`,
 *   `GUARDS.managerTools`);
 * - requirements R-WD-07 (the failure kinds), R-FB-06 (`fishball-core-missing`), R-WD-07 / R-FB-07
 *   ("watchdog is down"), design §6.4 (Watchdog's two registrations, priority 0), §7.2 (X10
 *   `manager.notify`), the brief (`preset-watchdog`, id `watchdog`);
 * - the user's decision of 2026-11-15 (relayed in this session's request): `preset-watchdog` gets
 *   only the tools `read` and `read_image`.
 * The rest is fixture data and harness timing.
 */
import path from 'node:path'
import { DECISION } from '../../../../packages/dsh-connector/contract/contract.js'
import { EVENT_TYPE, LINK_REFUSAL, TOOL } from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { GUARDS, INTERCEPT } from '../../../../packages/core/contracts/constants.js'
import { BOOT_TOOLS } from '../../../support/constants.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

export { DECISION, EVENT_TYPE, LINK_REFUSAL, TOOL, INTERCEPT, V3 }

/**
 * WD-ROUTE's "Owns" folders. FBTEST_WD_ROUTE_ENTRY moves the entry (another checkout). The entry's
 * factory is the assumed surface of subject.mjs (no surface relayed yet, 2026-11-15).
 */
const ENTRY = process.env.FBTEST_WD_ROUTE_ENTRY ?? path.join(V3.watchdog.dir, 'src', 'intercept', 'index.js')
/** The watchdog package the entry belongs to (`<package>/src/intercept/index.js`), so its patch and row come from the same checkout. */
const PACKAGE_DIR = path.dirname(path.dirname(path.dirname(ENTRY)))
export const SUBJECT = Object.freeze({
  entry: ENTRY,
  packageDir: PACKAGE_DIR,
  patch: path.join(PACKAGE_DIR, 'cordis.patch.yml'),
})

/** Design §6.4: Watchdog's registrations, exactly these type sets (R-INT-07), at priority 0. */
export const REGISTRATIONS = Object.freeze({
  permission: Object.freeze([EVENT_TYPE.permission]),
  outcome: Object.freeze([EVENT_TYPE.settlement, EVENT_TYPE.retirement]),
  priority: INTERCEPT.defaultPriority,
  /** R-INT-07: "exactly two filters". */
  count: 2,
})

/** R-WD-07: every failure kind. `model` is driven through the judge port; the rest through `fail(cause)`. */
export const FAILURE = Object.freeze({
  model: 'model',
  viaFail: Object.freeze(['load', 'readiness', 'registration', 'provider', 'budget', 'store', 'claim', 'attach', 'runtime']),
})

/** R-WD-07 / R-FB-07: the notice Fishball gets; P-3 leaves the wording open, so only the phrase is the oracle. */
export const DOWN = Object.freeze({ text: /watchdog is down/i })
/** R-FB-06: the one diagnostic of a feature plugin without core. */
export const CORE_MISSING = 'fishball-core-missing'

/**
 * The tools that must never appear on Watchdog's own link: its MCP traffic is none of its own
 * (R-WD-02, WD-EP-03 row 3), and a failure never stops or restarts a watched session (R-WD-07).
 */
export const NOT_WATCHDOGS = Object.freeze([TOOL.inboxPoll, TOOL.inboxAck, TOOL.pair, TOOL.setName])
export const SESSION_CONTROL = Object.freeze([TOOL.sessionStop, TOOL.sessionStart, TOOL.sessionMessage, TOOL.sessionRedirect, TOOL.sessionRelease])

/** R-WD-16 + the user's decision 2026-11-15: the `watchdog` preset (row `preset-watchdog`) and its tools. */
export const PRESET = Object.freeze({
  id: GUARDS.watchdogAgentPreset,
  row: 'preset-watchdog',
  /** The DSH agent-preset row module (DSH's own preset rows use it; S6 round 2 `7c2230e`). */
  module: '@deepseek-ai/dsh-agent-preset',
  /** The user's decision: only these two tools. */
  tools: Object.freeze(['read', 'read_image']),
  /**
   * DSH's global tool from dsh-base, offered to every session whatever its preset (K3 manager tools
   * list it beside `read` / `read_image` for `preset-fishball`, which has the same two file tools).
   * Allowed beside the preset's own two tools (Fishball 2026-11-15, question 6).
   */
  global: Object.freeze(GUARDS.managerTools.filter((t) => t !== 'read' && t !== 'read_image')),
  /**
   * The test worker's fixture bundle `fbtest-tools` registers these test-only globals on every
   * session (test/support/constants.mjs BOOT_TOOLS); they do not exist in production, so the oracle
   * leaves exactly them out (Fishball 2026-11-15). Any other tool still fails the row.
   */
  harnessOnly: Object.freeze([...BOOT_TOOLS]),
})

/** Fixture data (not product values). */
export const FIXTURE = Object.freeze({
  s1: 'fbtest-wd-s1',
  s2: 'fbtest-wd-s2',
  s3: 'fbtest-wd-s3',
  marker: 'FBTEST-WD-',
  namespace: 'demo',
  contributedEvent: 'ping',
  generation: 'fbtest-wd-gen-1',
  reason: 'fbtest watchdog reason',
  reasoning: 'FBTEST-WD-REASONING cannot decide this one',
  modelFault: 'fbtest: injected model failure',
  registrationFault: 'fbtest: injected registration failure',
  logger: 'fbtest-wd-route',
  /** The core-provided service name plugins look up at runtime (K3 index.d.ts). */
  homeLabel: 'v3-wd-route',
  tempPrefix: 'fbtest-wd-route-',
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ eventMs: 20000, quietMs: 800, pollMs: 25, testMs: 180000, rowMs: 5000 })

/** Integration rows boot a standalone DSH (core + watchdog) in a worker process; run with FBTEST_V3_INTEGRATION=1. */
export const INTEGRATION = Object.freeze({
  env: 'FBTEST_V3_INTEGRATION',
  on: '1',
  skip: 'runs at integration (boots a standalone DSH worker; set FBTEST_V3_INTEGRATION=1)',
  /** The V2 support worker: FBTEST_PLUGIN=off keeps the connector and instance unselected (no child launch). */
  pluginOff: 'off',
})

/** Owners of rows WD-ROUTE cannot check (v3-tasks.md W4–W5; briefs Q-18). */
export const LATER = Object.freeze({
  neverLoaded: 'F-STATUS (standalone, R-FB-07) or I-HOST (hosted pending notice, R-HOST-08): the notice when Watchdog never loaded (Q-18)',
  revoke: 'X-REMOTE (a real connector revocation of Fishball\'s token cuts Watchdog off with Fishball\'s link)',
  connector: 'C-WIRE (connector routing end to end: this Fishball DSH receives no event of a session another principal manages, or of an unmanaged one)',
  wire: 'F-WIRE (core\'s app row provides fishballInstance, so a core-present DSH hands Watchdog its service)',
  decide: 'WD-DECIDE (the non-waking settlement note to Fishball for an offer Watchdog escalated to the user, R-WD-09)',
})
