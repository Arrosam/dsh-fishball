/**
 * Oracle values of the FEAT-PEERS cases, taken from the case files and the contracts only:
 * - R-FB-06 and PLAT-EP-04 (`fishball-core-missing`, boot ok);
 * - R-BRD-01, PLAT-UC-06 and PLAT-BVA-01 (30 days, day = 86 400 s, "archived at exactly 30 d", Q-24);
 * - docs/plugins/instance-extension-points.md §12.6 (archive file, `{id, clear: true}`, `not-closed`)
 *   and §12.7 (`board_search` and its `onBoard` flag);
 * - X8 / Q-14 (`attention.signal(pluginId, {important})`, answered `{ok: true, accepted: true}`
 *   or `unsupported-operation`), the fake core member's answers (world.mjs);
 * - the X0 namespace rule (pluginId = the npm package name).
 * K1's `REFUSAL.unsupportedOperation` is the one spelling of the refusal code.
 *
 * The user dropped the board export (2026-11-15): no `board_export` tool, no export offer on
 * uninstall; uninstalling the board deletes its data. So nothing here names an export.
 */
import path from 'node:path'
import * as K1 from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { REPO } from '../../../support/constants.mjs'

export { K1 }

/** The installed SDK's packages the world is built from (read only). */
export const DSH = Object.freeze({
  cordis: '@deepseek-ai/cordis',
  loader: '@deepseek-ai/cordis-plugin-loader',
  session: '@deepseek-ai/dsh-session',
  /** A loader row naming a built-in plugin. */
  builtinPrefix: 'cordis:',
  /** cordis LoggerLevel.DEBUG: the exporter takes every level, so no line is missed. */
  allLevels: 3,
  /** cordis FiberState.ACTIVE: the row is up ("boot ok"). */
  fiberActive: 2,
  /** DSH's own service names the rows may read. */
  services: Object.freeze({ tools: 'tools', profileContext: 'profileContext', instance: 'fishballInstance' }),
})

/** The feature plugins under test, each as its loader row (the package's own entry). */
export const PLUGIN = Object.freeze({
  board: Object.freeze({ name: 'fishball-board', entry: path.join(REPO, 'packages', 'board', 'index.js') }),
})

/** R-FB-06: the one line a feature plugin logs without fishball-core. */
export const CORE_MISSING = 'fishball-core-missing'

/** K3 `FishballInstance.apiVersion` (contracts/index.d.ts). */
export const INSTANCE_API_VERSION = 1

const SECOND_MS = 1000
/** PLAT-BVA-01 flag K: a day is 86 400 s. */
const DAY_MS = 86_400 * SECOND_MS

/** R-BRD-01 visibility window and the PLAT-BVA-01 values (time since done). */
export const RETENTION = Object.freeze({
  windowMs: 30 * DAY_MS,
  dayMs: DAY_MS,
  secondMs: SECOND_MS,
  /** PLAT-BVA-01: 29 d 23:59:59, 30 d (archived: K inclusive edge, Q-24), 30 d + 1 s. */
  bva: Object.freeze([
    Object.freeze({ row: 1, label: '29 d 23:59:59', sinceDoneMs: 30 * DAY_MS - SECOND_MS, onBoard: true }),
    Object.freeze({ row: 2, label: '30 d', sinceDoneMs: 30 * DAY_MS, onBoard: false }),
    Object.freeze({ row: 3, label: '30 d + 1 s', sinceDoneMs: 30 * DAY_MS + SECOND_MS, onBoard: false }),
  ]),
  /** "stays archived after that" (R-BRD-01): a year later. */
  yearMs: 366 * DAY_MS,
})

/** The board's manager tools and storage (§3.2 of the board design, §12.6, §12.7). */
export const BOARD = Object.freeze({
  tool: Object.freeze({ write: 'board_write', search: 'board_search' }),
  status: Object.freeze({ inProgress: 'in_progress', todo: 'todo', done: 'done' }),
  code: Object.freeze({ notClosed: 'not-closed' }),
  /** `<child home>/fishball-board/archive.jsonl`: one card snapshot per line, never shrinking. */
  archive: Object.freeze(['fishball-board', 'archive.jsonl']),
})

/** The fake core attention member's two answers (X8, Q-14). */
export const ATTENTION = Object.freeze({
  accepted: Object.freeze({ ok: true, accepted: true }),
  refused: Object.freeze({ ok: false, code: K1.REFUSAL.unsupportedOperation }),
})

/** Fixture data; every value is a test value, not a product one. */
export const FIXTURE = Object.freeze({
  tempPrefix: 'fbtest-feat-peers-',
  homeDir: 'dsh-home',
  profileName: 'fishball',
  /** A fixed start for the fake clock (2026-11-15T00:00:00Z). */
  epochMs: Date.UTC(2026, 10, 15),
  /** The keyword `board_search` looks for; each card's title carries it. */
  keyword: 'fbtestkeyword',
  title: (n) => `fbtestkeyword card ${n}`,
  callIdPrefix: 'fbtest-call-',
})

export const WAIT = Object.freeze({
  testMs: 60_000,
  settleMs: 5_000,
  pollMs: 20,
})

/** Rows a later task makes runnable (`todo`, naming it). */
export const LATER = Object.freeze({
  fWireBoard: 'F-WIRE (core wired: the board over core\'s real fishballInstance in a Fishball DSH)',
})
