/**
 * Values of the guard rows: core's frozen K3 contract packages/core/contracts/guards.d.ts (GuardedRow,
 * ShippedPresetRow, FishballAgentPreset, IntendedPolicy, ManagerTool, OverriddenGuard, GuardReport), restated
 * here as the old suite read it from the declaration text; the runtime spellings come from core's published
 * contracts GUARDS. DSH's own row ids an owner uses. Harness budgets are marked.
 */
import { GUARDS as CONTRACT } from 'fishball-core/contracts'

export const GUARDS = Object.freeze({
  rows: Object.freeze(['ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller', 'dsh-instance', 'ui-model-selection']),
  shippedPresets: Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  offeredPresets: Object.freeze(['fishball']),
  policy: Object.freeze({ sandbox: 'read-only', approval: 'ask', permissionPresets: Object.freeze(['read-only']), defaultPermissionPreset: 'read-only', defaultAgentPreset: 'fishball' }),
  managerTools: CONTRACT.managerTools,
  instanceRow: 'dsh-instance',
  uiRow: 'ui-subagent',
  coreRow: 'schedule',
})
export const REPORT = Object.freeze({
  ok: CONTRACT.status.ok, overridden: CONTRACT.status.overridden,
  row: (id) => CONTRACT.code.rowPrefix + id, policy: (key) => CONTRACT.code.policyPrefix + key,
  agentPresets: CONTRACT.code.agentPresets, bundleOrder: CONTRACT.code.bundleOrder, managerTools: CONTRACT.code.managerTools,
})
export const FIXTURE = Object.freeze({
  instance: 'dsh-instance', other: 'fbtest-other-plugin', deselected: 'fbtest-deselected', probe: 'fbtest-guard-probe',
  extraPreset: Object.freeze({ name: 'fbtest-extra-presets', id: 'fbtest-extra' }),
  hmrRow: 'hmr',
})
/** The owner's own values (test inputs on DSH's rows). */
export const OWNER = Object.freeze({
  widerMode: 'workspace-write', approval: 'never',
  presetIdOf: (row) => row.replace(/^preset-/, ''), presetRowOf: (id) => 'preset-' + id,
  writableFiles: Object.freeze({ read: true, readImage: true, write: true, edit: true }),
  fileTools: (config) => ({ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config }),
  sandboxOverride: '- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: !!js process.cwd()\n',
  approvalOverride: JSON.stringify([{ id: 'approval', config: { policy: 'never' } }]),
  emptyPatch: '[]\n',
})
export const G = Object.freeze({
  home: Object.freeze({ native: 'fbcu-g-native', coreOff: 'fbcu-g-coreoff', nohmr: 'fbcu-g-nohmr', last: 'fbcu-g-last', shaped: 'fbcu-g-shaped', preset: 'fbcu-g-preset' }),
  pageOk: 400,
  /** DSH's profile layout: <home>/profiles/<profile>/cordis.patch.yml, the owner's profile patch. */
  profilesDir: 'profiles', profilePatch: 'cordis.patch.yml',
  // Harness waits only.
  readyMs: 90000, recomposeMs: 60000, settleMs: 3000, observeMs: 10000, pollMs: 100, caseMs: 1200000,
})
