/**
 * The one frozen object of guard values core's code reads (task F-GUARDS; design §5a.2; R-FB-02,
 * R-FB-09, R-FB-12, R-FB-13, R-HOST-11 (5)). It mirrors the K3 types in
 * `packages/core/contracts/guards.d.ts`, which are types only, so runtime code cannot import them.
 *
 * PROPOSED (the user, 2026-11-14): every value here that K3 names is the K3 spelling; the rest
 * (service name, record location, diagnostic name) are F-GUARDS's own and listed as missing K3
 * runtime constants. The K-VALUES task moves this object into `packages/core/contracts/` as a
 * runtime module, so a change touches one place.
 *
 * What is NOT here, on purpose: the guarded rows, the shipped preset rows and the intended policy
 * values. Their one definition is core's own `cordis.patch.yml`; `intended.js` reads them from it
 * at runtime, so the patch and the check can never disagree.
 */
/** dsh-app-boot's diagnostic prefix, also the prefix of core's own patch errors. */
const GUARDS_DIAGNOSTIC = 'fishball-core'

export const GUARDS = Object.freeze({
  /** GuardReport.status. */
  status: Object.freeze({ ok: 'ok', overridden: 'guards-overridden' }),
  /** OverriddenGuard spellings: `row:<id>`, `policy:<key>` and the three single codes. */
  code: Object.freeze({
    rowPrefix: 'row:',
    policyPrefix: 'policy:',
    agentPresets: 'agent-presets',
    bundleOrder: 'bundle-order',
    managerTools: 'manager-tools',
  }),
  /** GuardCheckTrigger: the two events core re-checks on (app ready is `appReady.onReady`). */
  triggers: Object.freeze(['settings/document-updated', 'plugin-manager/changed']),
  /**
   * FishballAgentPreset: a guarded DSH offers only core's preset (the patch's
   * `agent-preset-registry.default`, read through `managerPresetKey`) and fishball-watchdog's.
   */
  watchdogAgentPreset: 'watchdog',
  /** The IntendedPolicy key whose value is the manager's agent preset (core's patch sets it). */
  managerPresetKey: 'defaultAgentPreset',
  /** ManagerTool: the manager's model tools, exactly (R-FB-13). */
  managerTools: Object.freeze(['read', 'read_image', 'working_directory']),
  /**
   * Core's own model tools, by module (relative to this folder) and exported name table (user
   * decision 2026-11-14: core's tools are not the preset's and are left out of the R-FB-13 check).
   * Loaded lazily, because these modules import `fishball-connector/contract`, which a standalone
   * core may not resolve; a module that cannot load registers no tools, so its names cannot appear.
   */
  coreTools: Object.freeze([
    Object.freeze({ module: '../slim/child/session-tools.js', table: 'SESSION_TOOL' }),
    Object.freeze({ module: '../slim/child/reminders.js', table: 'TOOL' }),
    Object.freeze({ module: '../slim/child/skills.js', table: 'PRIVATE_SKILL_TOOL' }),
  ]),
  /** ReorderOutcome. */
  reorder: Object.freeze({ moved: 'moved', unchanged: 'unchanged', failed: 'failed' }),
  /**
   * IntendedPolicy keys, in report order, each with the DSH row and config field core's patch sets
   * and the public service member that reads the effective value back (S6 §3.5). `keys: true`
   * compares the config object's keys (the permission preset table) instead of a value.
   */
  policy: Object.freeze([
    Object.freeze({ key: 'sandbox', row: 'sandbox-policy', field: 'mode', service: 'sandboxPolicy', member: Object.freeze(['defaultMode']) }),
    // Read directly (requirements 1.24 item 4): ApprovalService has no public getter for its default.
    Object.freeze({ key: 'approval', row: 'approval', field: 'policy', service: 'approval', member: Object.freeze(['config', 'policy']) }),
    Object.freeze({ key: 'permissionPresets', row: 'permission', field: 'presets', keys: true, service: 'permissionPresets', member: Object.freeze(['names']) }),
    Object.freeze({ key: 'defaultPermissionPreset', row: 'permission', field: 'defaultPreset', service: 'permissionPresets', member: Object.freeze(['defaultPreset']) }),
    Object.freeze({ key: 'defaultAgentPreset', row: 'agent-preset-registry', field: 'default', service: 'agentPresets', member: Object.freeze(['defaultId']) }),
  ]),
  /**
   * The Cordis services the guards read, none injected (a missing one is "nothing to check"):
   * `profileContext` and `appReady` are read once at the row's start, the rest at each check.
   * `fishballInstance` is `EXTENSION_SERVICE` of src/slim/child/extensions.js, restated because that
   * module imports `fishball-connector/contract`, which a standalone core may not resolve.
   */
  services: Object.freeze({
    loader: 'loader',
    appReady: 'appReady',
    profileContext: 'profileContext',
    agentPresets: 'agentPresets',
    tools: 'tools',
    agents: 'agents',
    instance: 'fishballInstance',
  }),
  /** DSH's agent-registry event after a session's setup (create or resume), both SDKs. */
  agentCreated: 'agent/created',
  /** The service this row provides: `report()`, `reorder()`, `onChange(listener)` (PROPOSED, not in K3). */
  serviceName: 'fishballGuards',
  /** The guard module's Cordis plugin name (ui/patch/index.js `name`). */
  pluginName: 'fishball-ui',
  /** Core's own bundle name in `dsh.profile.bundles`. */
  bundleName: 'fishball-core',
  /** Core's patch, relative to this folder. */
  patchFile: '../../cordis.patch.yml',
  /** dsh-app-boot's diagnostic prefix for a malformed patch or manifest. */
  diagnostic: GUARDS_DIAGNOSTIC,
  /** The profile manifest the plugin manager locks for every bundle change (dsh-plugin-manager). */
  profileManifest: 'package.json',
  /**
   * The local record of the one reorder (R-FB-12: "recorded locally"): one file per profile under
   * `<DSH home>/fishball/guards/`, beside core's other records (`<home>/fishball/chat.json`).
   */
  record: Object.freeze({ directory: Object.freeze(['fishball', 'guards']), suffix: '.reorder.json', mode: 0o600, directoryMode: 0o700 }),
  /** The logger name the row warns under. */
  logger: 'fishball-guards',
  /** Log and error texts (the logger's printf format). */
  text: Object.freeze({
    report: '%s: %s',
    reportSeparator: ', ',
    checkFailed: 'guard check failed (%s)',
    reorderFailed: 'the bundle reorder failed (%s); bundle-order stays reported',
    recordFailed: 'the bundle was moved last, but its reorder record could not be written (%s)',
    missingPolicy: (file, row, field) => `${GUARDS_DIAGNOSTIC}: ${file} sets no ${row}.${field}`,
  }),
  /** The record's content: the outcome, one JSON line. */
  recordLine: (outcome) => JSON.stringify({ outcome }) + '\n',
  /** A missing record file (Node's fs error code). */
  notFound: 'ENOENT',
})
