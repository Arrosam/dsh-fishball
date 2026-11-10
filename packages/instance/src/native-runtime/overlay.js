import path from 'node:path'
import { fail, RUNTIME, NATIVE_WEB } from './constants.js'

/** Row identities the attached profile composes; each id is also the patch target below. */
const ROW = Object.freeze({
  hmr: 'hmr',
  sandboxPolicy: 'sandbox-policy',
  approval: 'approval',
  lifecycle: 'fishball-native-child',
  sessionTools: 'fishball-native-session-tools',
  approvals: 'fishball-native-approvals',
  app: 'fishball-native-app',
  inbox: 'fishball-native-inbox',
  admin: 'fishball-native-admin',
  providerSync: 'fishball-native-provider-sync',
  webserver: 'webserver',
  webRuntime: 'web-runtime',
  nativeWeb: 'fishball-native-web',
  page: 'fishball-page',
})
const WEB_CONFIG = Object.freeze({ host: RUNTIME.host, port: 0, tls: undefined })
const WEB_RUNTIME_CONFIG = Object.freeze({ openBrowser: false, printUrl: false, publicUrl: undefined })
/** Policies the slim child fixes independently of the main deployment (§2.3). */
const POLICY = Object.freeze({ sandboxMode: 'read-only', approval: 'ask' })
/** The one permission preset the child keeps; its policy is the child's fixed POLICY. */
const READ_ONLY_PRESET = 'read-only'
/**
 * LITE effective read-only (instance-extension-points §11.3/§11.6; U13 Q-I A; K-4). The approval
 * policy stays `ask`: `never` would mean "allowed without asking". Widening requests from the
 * manager are refused by approvals.js's explicit own-approval rejection (Q-J), not here.
 * - The `permission` row keeps only the read-only preset, so `/permission` refuses every other
 *   name; the launch overlay outranks the profile and home layers, so a saved value cannot widen it.
 * - Native rows switched off: each service they provide is injected only by another row switched
 *   off here (checked in 0.2.1-rc.5 and 0.2.2-rc.1), so boot is unaffected. The enabled
 *   ui-settings-plugin-inventory lists ui-agent-preset as an optional client dependency, which
 *   client-modules skips. Ids absent from a profile are skipped.
 *   ui-subagent: header lineage and catalogue tree items open other sessions (Enter/Space/click);
 *   ui-schedule/schedule: scheduled prompts run as new sessions; ui-permission/ui-agent-preset:
 *   permission and preset pickers (the preset creator also starts sessions); entry-customization:
 *   More-menu rows that start sessions; ui-open-in-app/open-in-app: native launches off the page;
 *   ui-sidebar-terminal/terminal-controller: a shell outside read-only.
 * - Agent-preset plugins switched off: delegation (subagent, subagent_fork, workflow) and the
 *   schedule tool create ordinary child sessions. The child's own reminders tools are unaffected.
 */
const LITE = Object.freeze({
  permission: Object.freeze({ row: 'permission', preset: READ_ONLY_PRESET,
    presets: Object.freeze({ [READ_ONLY_PRESET]: Object.freeze({ sandbox: POLICY.sandboxMode, approval: POLICY.approval }) }) }),
  disabledRows: Object.freeze(['ui-subagent', 'ui-schedule', 'schedule', 'ui-permission', 'ui-agent-preset',
    'entry-customization', 'ui-open-in-app', 'open-in-app', 'ui-sidebar-terminal', 'terminal-controller']),
  disabledPresetPlugins: Object.freeze(['tool-subagent', 'tool-subagent-fork', 'workflow-ptc', 'tool-workflow',
    'tool-subagent-control', 'tool-subagent-list-agents', 'tool-schedule']),
})
/** copyChildCode copies this tree beside native-child.js, so the app row resolves inside the snapshot. */
const APP_MODULE = path.join('src', 'slim', 'child', 'app.js')
/** The shared bridge client and the session tools (T05); the approvals and inbox rows read its fishballBridge. */
const SESSION_TOOLS_MODULE = path.join('src', 'slim', 'child', 'session-tools.js')
/** T09's approval bridge: the app row injects its fishballApprovals for /api/approvals. */
const APPROVALS_MODULE = path.join('src', 'slim', 'child', 'approvals.js')
/** The inbox consumer: it injects the bridge and the app row's fishballChat. */
const INBOX_MODULE = path.join('src', 'slim', 'child', 'inbox.js')
/** The T11 admin row: the same tree, so the settings page's requests reach the child itself (§9). */
const ADMIN_MODULE = path.join('src', 'slim', 'child', 'admin.js')
/** T16's provider-sync target row: preview/confirm into the child's own home (§10). */
const PROVIDER_SYNC_MODULE = path.join('src', 'slim', 'child', 'provider-sync-target.js')

/** Whole-row replacement preserves standard native configuration and tool declarations. */
export function launchOverlay(paths, record, childModule, limits, control, entries) {
  const rows = new Map()
  function collect(entries) {
    for (const row of entries) {
      rows.set(row.id, row)
      if (row.group && Array.isArray(row.config)) collect(row.config)
    }
  }
  collect(entries)
  const instructionConfig = config => ({ ...config, projectRootMarkers: [] })
  // `<child home>/skills` is Fishball's private library (SK). It is deliberately NOT a root of the
  // standard provider: that stock reader follows symbolic links, so only the manager-scoped
  // confined provider of src/slim/child/skills.js may read it.
  const skillConfig = config => ({
    ...config, includeDefaultRoots: false, watchFollowSymlinks: false,
    customSkillDirs: [path.join(paths.agentsHome, 'skills'), path.join(paths.workspace, '.dsh', 'skills'), path.join(paths.workspace, '.agents', 'skills')],
    dshHome: paths.home, agentsHome: paths.agentsHome,
  })
  function isolatePlugins(plugins) {
    return plugins.map(row => {
      if (row.name === '@deepseek-ai/dsh-agent-instructions') return { ...row, config: instructionConfig(row.config) }
      if (row.name === '@deepseek-ai/dsh-skill-filesystem') return { ...row, config: skillConfig(row.config) }
      if (LITE.disabledPresetPlugins.includes(row.id)) return { ...row, disabled: true }
      if (row.group && Array.isArray(row.config)) return { ...row, config: isolatePlugins(row.config) }
      return row
    })
  }
  const overlays = []
  for (const row of rows.values()) {
    if (row.name === '@deepseek-ai/dsh-agent-preset' && Array.isArray(row.config?.plugins)) overlays.push({ id: row.id, config: { ...row.config, plugins: isolatePlugins(row.config.plugins) } })
    else if (row.name === '@deepseek-ai/dsh-agent-instructions') overlays.push({ id: row.id, config: instructionConfig(row.config) })
    else if (row.name === '@deepseek-ai/dsh-skill-filesystem') overlays.push({ id: row.id, config: skillConfig(row.config) })
  }
  // Settings and enabled native client rows are deliberately preserved, not roster-filtered.
  for (const id of [ROW.hmr, ROW.sandboxPolicy, ROW.approval, ROW.webserver, ROW.webRuntime]) if (!rows.has(id)) fail('UNSUPPORTED_PROFILE')
  const config = { mainHome: paths.mainHome, hostId: record.hostId, instanceId: record.instanceId, limits, control }
  return [
    ...overlays,
    { id: ROW.hmr, disabled: true },
    { id: ROW.webserver, disabled: false, config: { ...rows.get(ROW.webserver).config, ...WEB_CONFIG } },
    { id: ROW.webRuntime, disabled: false, config: { ...rows.get(ROW.webRuntime).config, ...WEB_RUNTIME_CONFIG } },
    { id: ROW.sandboxPolicy, config: { ...rows.get(ROW.sandboxPolicy).config, mode: POLICY.sandboxMode } },
    { id: ROW.approval, config: { ...rows.get(ROW.approval).config, policy: POLICY.approval } },
    ...(rows.has(LITE.permission.row) ? [{ id: LITE.permission.row, config: { ...rows.get(LITE.permission.row).config, presets: LITE.permission.presets, defaultPreset: LITE.permission.preset } }] : []),
    ...LITE.disabledRows.filter(id => rows.has(id)).map(id => ({ id, disabled: true })),
    { insert: [
      // Native Web supplies its standard services. PG-1 owns navigation and permission
      // enforcement; this composition alone is not a read-only or session-isolation boundary.
      { id: ROW.nativeWeb, name: path.join(path.dirname(childModule), NATIVE_WEB.adapterModule), required: true, config },
      { id: ROW.page, name: path.join(path.dirname(childModule), NATIVE_WEB.pageDirectory, NATIVE_WEB.pagePackage, 'index.js'), required: true },
      { id: ROW.lifecycle, name: childModule, required: true, config },
      // The bridge, approvals and inbox rows are loader rows, not plugins the lifecycle row
      // starts itself: the loader's boot settlement only waits for its own entries, so a nested
      // plugin's chain (nativeRuntime -> fishballBridge -> fishballApprovals -> the app row) could
      // still be starting when appReady fires, and the readiness probe then finds no fishballApp.
      // As rows, each one's start is handed to the next by Cordis's inject notification, which
      // the settlement follows (B5).
      { id: ROW.sessionTools, name: path.join(path.dirname(childModule), SESSION_TOOLS_MODULE) },
      { id: ROW.approvals, name: path.join(path.dirname(childModule), APPROVALS_MODULE) },
      // The app row is T03's module. required:true makes a missing or inactive app row fail the
      // boot loudly instead of leaving a child that serves nothing (§15 LIFE-02).
      { id: ROW.app, name: path.join(path.dirname(childModule), APP_MODULE), required: true, config },
      { id: ROW.inbox, name: path.join(path.dirname(childModule), INBOX_MODULE) },
      // The admin row applies the settings page's changes with the child's own settings,
      // pluginManager and llm; it takes no config and comes up on the lifecycle wire's admin
      // channel (T11, §9). It is not required, so an unready admin never fails the child boot.
      { id: ROW.admin, name: path.join(path.dirname(childModule), ADMIN_MODULE) },
      // T16's target owns the child half of provider sync on the wire's provider-sync channel;
      // like the admin row it is not required, so an unreachable target never blocks the boot.
      { id: ROW.providerSync, name: path.join(path.dirname(childModule), PROVIDER_SYNC_MODULE) },
    ] },
  ]
}
