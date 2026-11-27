/**
 * DSH row ids, standalone defaults, and owner inputs for the profile composition and reorder cases.
 * Sources: R-FB-02, R-FB-12, R-FB-13 and PLAT-DT-04 / PLAT-UC-04.
 */

export const GUARDS = Object.freeze({
  rows: Object.freeze(['ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller', 'dsh-instance', 'ui-model-selection']),
  shippedPresets: Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  offeredPresets: Object.freeze(['fishball']),
  policy: Object.freeze({ sandbox: 'read-only', approval: 'ask', permissionPresets: Object.freeze(['read-only']), defaultPermissionPreset: 'read-only', defaultAgentPreset: 'fishball' }),
  instanceRow: 'dsh-instance',
  uiRow: 'ui-subagent',
  coreRow: 'schedule',
})
export const FIXTURE = Object.freeze({
  instance: 'dsh-instance', other: 'fbtest-other-plugin', deselected: 'fbtest-deselected',
  extraPreset: Object.freeze({ name: 'fbtest-extra-presets', id: 'fbtest-extra' }),
  hmrRow: 'hmr',
})
/** The owner's own values (test inputs on DSH's rows). */
export const OWNER = Object.freeze({
  widerMode: 'workspace-write', approval: 'never',
  presetIdOf: (row) => row.replace(/^preset-/, ''), presetRowOf: (id) => 'preset-' + id,
  writableToolNames: Object.freeze(['edit', 'write']),
  writableFiles: Object.freeze({ read: true, readImage: true, write: true, edit: true }),
  fileTools: (config) => ({ id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs', config }),
  sandboxOverride: '- id: sandbox-policy\n  config:\n    mode: workspace-write\n    workspaceRoot: !!js process.cwd()\n',
  approvalOverride: JSON.stringify([{ id: 'approval', config: { policy: 'never' } }]),
  emptyPatch: '[]\n',
})
export const G = Object.freeze({
  pageOk: 400,
  home: Object.freeze({ native: 'fbcu-g-native', coreOff: 'fbcu-g-coreoff', nohmr: 'fbcu-g-nohmr', last: 'fbcu-g-last', shaped: 'fbcu-g-shaped', preset: 'fbcu-g-preset' }),
  /** DSH's profile layout: <home>/profiles/<profile>/cordis.patch.yml, the owner's profile patch. */
  profilesDir: 'profiles', profilePatch: 'cordis.patch.yml',
  reorderRecord: Object.freeze({ directory: Object.freeze(['fishball', 'guards']), suffix: '.reorder.json', moved: 'moved', unchanged: 'unchanged' }),
  // Harness waits only.
  recomposeMs: 60000, pollMs: 100, caseMs: 1200000,
})
