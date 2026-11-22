/**
 * Values the cases check. Guard vocabulary: core's frozen K3 contract (contracts/guards.d.ts of the
 * sibling checkout, read back as text by guards.mjs); launch overlay: the instance README ("How it
 * starts": HMR off, the two instance rows, the isolation; "No guard row and no token") and design
 * §6.2 (R-HOST-04); placement: README "Placement" (fishball-core placed, core last; fishball-board
 * never; fishball-ui retired, commit 8fdd0ef "place unified fishball-core bundle").
 */
export const OVERLAY = Object.freeze({
  hmr: 'hmr',
  /** The two instance rows a launch overlay inserts (README "How it starts"), both required. */
  runtimeRows: Object.freeze(['fishball-native-child', 'dsh-instance-child']),
  /** DSH's own isolation rows (README: isolation of the child's instructions and skills). */
  isolation: Object.freeze({ instructions: 'agent-instructions', instructionsField: 'projectRootMarkers', skills: 'skill-filesystem', skillsField: 'includeDefaultRoots' }),
  presetRow: /^preset-/,
})

/** DSH's own policy rows the guards set, and the values (core's IntendedPolicy, guards.d.ts). */
export const DSH_ROW = Object.freeze({ sandbox: 'sandbox-policy', approval: 'approval', permission: 'permission', agentPresetRegistry: 'agent-preset-registry' })
/** A stored owner preference wider than read-only (SET-EP-12 input; DSH's own mode name). */
export const WIDER = 'workspace-write'

/** HOST-EP-03 row 7: core's patch rows (core's manifest and patch; F-WIRE re-baseline: no slim rows). */
export const CORE_ROWS = Object.freeze({
  guardsRow: 'fishball-core-guards',
  slim: Object.freeze(['session-tools', 'approvals', 'app', 'inbox'].map((n) => 'fishball-native-' + n)),
  main: Object.freeze({ id: 'fishball-core', name: 'fishball-core/main' }),
  /**
   * The Fishball UI component's rows, part of core since the unified bundle (dsh-fishball 117cb2a2
   * "Combine fishball-core + fishball-ui components"; this repo 8fdd0ef "place unified fishball-core
   * bundle"): path rows into core's own ui/ sub-packages, each with its own package.json.
   */
  uiPackageRows: Object.freeze(['fishball-page', 'fishball-recommend-plugins', 'fishball-child-plugins']),
})

/** The placed set (README "Placement"; 8fdd0ef). */
export const SET = Object.freeze({ placed: Object.freeze(['fishball-core']), retired: 'fishball-ui', shelved: 'fishball-board' })

/** SHIP-UC-01: npm pack's own file list of fishball-core (dry run, isolated), less what placement never ships. */
export const PACK = Object.freeze({
  args: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']),
  /** npm always adds the README; placement copies the manifest's files only (Q-21; fab3837). */
  npmOnly: Object.freeze(['README.md']),
  excluded: 'ui/tests/',
  mustShip: 'ui/client.js',
})
