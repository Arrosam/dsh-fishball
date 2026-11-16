/**
 * Vocabulary for the F-GUARDS cases: PLAT-UC-04 (composition), PLAT-DT-04, UIM-DT-01 rows 9, 10b,
 * 14, HOST-DT-03 rule 6 and HOST-UC-08 A3 and E2 (.runtime/reports/v3-remaining-plan.md, W2 row
 * F-GUARDS; docs/test-design/v3/11-platform.md, 10-embed-ui-matrix.md, 08-hosted.md). The
 * hosted-settings rows (HOST-DT-03 rule 6, HOST-UC-08 E2) left with that bundle (REMOVE-WD, design §1.0).
 *
 * Every guard value comes from the frozen K3 contract (packages/core/contracts/guards.d.ts), read as
 * declaration text with the K3 reader (../k3/declarations.mjs), so no product value is copied here:
 * the guarded rows, the shipped presets, the offered presets, the intended policy, the manager tools,
 * the report's statuses and the spelling of each overridden guard. Requirements: R-FB-02, R-FB-09,
 * R-FB-12, R-FB-13; design §5a.2; spike V3-S6 (`86800d2`, `7c2230e`). None comes from
 * an implementation.
 */
import path from 'node:path'
import { declarationTexts, model } from '../../contract/k3-host-services/declarations.mjs'
import { FOLDER } from '../../contract/k3-host-services/constants.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

const contract = model(declarationTexts(FOLDER.coreContracts))
const declared = (name) => {
  const list = contract.decls.get(name)
  if (!list?.length) throw new Error(`K3 declares no ${name} in ${FOLDER.coreContracts} (guards.d.ts)`)
  return list[0]
}
const literalsOf = (name) => {
  declared(name)
  return Object.freeze(contract.leaves(name).map((leaf) => leaf.literal).filter((v) => v !== undefined))
}
/** A K3 member type as a value: `'x'` → x, `readonly ['a', 'b']` → ['a', 'b']. */
function typeValue(type) {
  const text = type.replace(/^readonly\s+/, '').trim()
  const list = /^\[([\s\S]*)\]$/.exec(text)
  if (list) return Object.freeze([...list[1].matchAll(/'([^']*)'/g)].map((m) => m[1]))
  const one = /^'([^']*)'$/.exec(text)
  if (!one) throw new Error('K3 IntendedPolicy member is not a literal: ' + type)
  return one[1]
}

/** OverriddenGuard: template prefixes (`row:${…}`, `policy:${…}`) and the plain kinds, found by meaning. */
const overriddenRaw = declared('OverriddenGuard').raw
const templates = [...overriddenRaw.matchAll(/`([^`$]+)\$\{([^}]+)\}`/g)].map((m) => ({ prefix: m[1], of: m[2] }))
const prefixFor = (word) => {
  const found = templates.find((t) => t.of.includes(word))
  if (!found) throw new Error('K3 OverriddenGuard has no template over ' + word + ': ' + overriddenRaw)
  return found.prefix
}
const kinds = literalsOf('OverriddenGuard')
const kindFor = (word) => {
  const found = kinds.find((k) => word.test(k))
  if (!found) throw new Error('K3 OverriddenGuard has no kind matching ' + word + ': ' + kinds.join(', '))
  return found
}

/** GuardReport: the `ok` status is the branch whose `overridden` is the empty tuple. */
const reportRaw = declared('GuardReport').raw
const okStatus = /status:\s*'([^']+)'\s*;?\s*readonly\s+overridden:\s*readonly\s*\[\s*\]/.exec(reportRaw)?.[1]
const statuses = [...reportRaw.matchAll(/status:\s*'([^']+)'/g)].map((m) => m[1])

const policy = Object.freeze(Object.fromEntries([...contract.members('IntendedPolicy')].map(([key, m]) => [key, typeValue(m.type)])))

/** The frozen guard vocabulary (K3 guards.d.ts). */
export const GUARDS = Object.freeze({
  rows: literalsOf('GuardedRow'),
  shippedPresets: literalsOf('ShippedPresetRow'),
  offeredPresets: literalsOf('FishballAgentPreset'),
  managerTools: literalsOf('ManagerTool'),
  triggers: literalsOf('GuardCheckTrigger'),
  /** IntendedPolicy, key → intended value (sandbox, approval, permissionPresets, …). */
  policy,
  policyKeys: Object.freeze(Object.keys(policy)),
  /** The guard row that keeps a nested hosted Fishball off (design §5a.2; R-FB-12 names it). */
  instanceRow: V3.instance.name,
})
if (!GUARDS.rows.includes(GUARDS.instanceRow)) throw new Error('K3 GuardedRow lacks ' + GUARDS.instanceRow)

/** The report (K3 GuardReport and OverriddenGuard). */
export const REPORT = Object.freeze({
  ok: okStatus,
  overridden: statuses.find((s) => s !== okStatus),
  statuses: Object.freeze(statuses),
  rowPrefix: prefixFor('GuardedRow'),
  policyPrefix: prefixFor('IntendedPolicy'),
  agentPresets: kindFor(/preset/),
  bundleOrder: kindFor(/order/),
  managerTools: kindFor(/tool/),
  kinds,
  row: (id) => prefixFor('GuardedRow') + id,
  policy: (key) => prefixFor('IntendedPolicy') + key,
})
if (!REPORT.ok || !REPORT.overridden) throw new Error('K3 GuardReport statuses not readable: ' + reportRaw)

/**
 * F-UI (requirements 1.38 Q-N2, R-FB-14): fishball-ui is its own bundle now, and the guard rows that
 * are only UI are its patch's; core keeps the rest (F-UI interface items 2 and 5). The UI rows apply
 * exactly when core is among the bundles this DSH started with.
 */
export const UI_COMPONENT = V3.ui.name
export const SPLIT = Object.freeze({
  uiRows: Object.freeze(['ui-subagent', 'ui-schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'ui-sidebar-terminal']),
  coreRows: Object.freeze(['schedule', 'open-in-app', 'terminal-controller', V3.instance.name]),
  /** fishball-ui's own package folders inside it (its page and Recommended tab, interface item 10), id → folder. */
  uiPackages: Object.freeze({ 'fishball-page': 'fishball-page', 'fishball-recommend-plugins': 'fishball-recommend-plugins' }),
})

/**
 * DSH rows and values a test uses to act as the owner (test inputs on DSH's own rows, not product
 * values): the rows core's guards set (design §5a.2, S6 §3.5) and a wider value for each.
 */
export const DSH_ROW = Object.freeze({
  hmr: 'hmr',
  sandbox: 'sandbox-policy',
  approval: 'approval',
  permission: 'permission',
  agentPresetRegistry: 'agent-preset-registry',
  agentPreset: '@deepseek-ai/dsh-agent-preset',
  defaultModel: 'agent-default-model',
  fakeLlm: 'fbtest-llm',
  /** DSH's file-tools row inside an agent preset's `config.plugins`, with the given switches. */
  fileTools: (config) => ({ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config }),
})
export const OWNER = Object.freeze({
  /** A sandbox mode wider than read-only (DSH's own mode names). */
  widerMode: 'workspace-write',
  /** An approval policy other than the intended one (DSH: allowed without asking). */
  approval: 'never',
  /** A shipped preset row → its preset id, and back (DSH's `preset-<id>` rows, dsh-web-app/presets/; core's own row follows it, design §5a.2). */
  presetIdOf: (row) => row.replace(/^preset-/, ''),
  presetRowOf: (id) => 'preset-' + id,
  /** File tools that also write (an owner widening the Fishball preset, R-FB-13). */
  writableFiles: Object.freeze({ read: true, readImage: true, write: true, edit: true }),
  /** Read-only file tools (the extra preset stand-in's: it is reported for being offered, not for its tools). */
  readOnlyFiles: Object.freeze({ read: true, readImage: true, write: false, edit: false }),
})

/** The standalone profile the worker boots, the worker file and its environment. */
export const PROFILE = 'fbg'
export const WORKER_FILE = path.join(import.meta.dirname, 'worker.mjs')
export const ENV = Object.freeze({ link: 'FBG_LINK', hmr: 'FBG_HMR', off: 'off', on: 'on' })
export const SDK_SCOPE = '@deepseek-ai/'

/** The fixture bundles a test generates in its home (stand-ins with the guarded row ids). */
export const FIXTURE = Object.freeze({
  dir: 'bundles',
  log: 'standin.log',
  version: '0.0.0-fbtest',
  probe: Object.freeze({ name: 'fbtest-guard-probe', module: path.join(import.meta.dirname, 'probe-row.mjs') }),
  standinModule: path.join(import.meta.dirname, 'standin-row.mjs'),
  /** A stand-in dsh-instance: only records that it started (a real one would start a nested child). */
  instance: V3.instance.name,
  /** An ordinary other bundle (R-ARCH-02: core refuses, hides or disables none). */
  other: 'fbtest-other-plugin',
  /**
   * A bundle offering an agent preset that is not core's (K3 FishballAgentPreset is `fishball`
   * alone, design §7): a guarded DSH reports it as `agent-presets`.
   */
  extraPreset: Object.freeze({ name: 'fbtest-extra-presets', row: 'fbtest-preset-extra', id: 'fbtest-extra', order: 90 }),
  /** Installed in the profile but never selected (PLAT-DT-04 rule 6). */
  deselected: 'fbtest-deselected',
  turnText: 'fbtest guard turn',
})

/** Cordis fiber state "active" (cordis lib/types, both SDKs). */
export const FIBER_ACTIVE = 2

/** The report finder (report.mjs): services searched by shape, since K3 freezes no service name for it. */
export const FINDER = Object.freeze({
  depth: 2,
  member: /guard|report|status/i,
  callMs: 1000,
  /**
   * A one-argument member of the same service that takes a change listener (report.mjs
   * `subscribeReport`). The history records every published value through it, because a correct
   * report can stand for a few milliseconds only (a recompose right after core's reorder), which a
   * poll misses.
   */
  subscribe: /change|subscribe|listen/i,
})

/** Harness budgets (waiting only; none is a product oracle). */
export const BUDGET = Object.freeze({
  bootMs: 180000,
  readyMs: 60000,
  recomposeMs: 60000,
  settleMs: 3000,
  observeMs: 3000,
  pollMs: 100,
  sampleMs: 50,
  turnMs: 30000,
  stopMs: 20000,
})

/** Owners of the flows F-GUARDS cannot check (v3-remaining-plan.md, v3-tasks.md). */
export const LATER = Object.freeze({
  wire: 'F-WIRE (core wiring: the one manager session, its notice to Fishball, the private Skills tool)',
  page: 'E2E-CORE (the A-lite page, shortcuts and the guards-overridden status-strip line in a browser)',
  pack: 'REL-PACK and X-MATRIX (native install of the four tarballs)',
  place: 'I-PLACE (the instance writes the hosted child profile with core last)',
  link: 'F-LINK (the manual token to the target)',
  matrix: 'X-MATRIX (the real dsh-instance package in a standalone DSH)',
})
