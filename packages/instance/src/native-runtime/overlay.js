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
  settings: 'fishball-settings',
  hostedSettings: 'fishball-hosted-settings',
  recommend: 'fishball-recommend-plugins',
})
const WEB_CONFIG = Object.freeze({ host: RUNTIME.host, port: 0, tls: undefined })
const WEB_RUNTIME_CONFIG = Object.freeze({ openBrowser: false, printUrl: false, publicUrl: undefined })
// V3 F-GUARDS: the LITE guard rows (read-only policy, the one permission preset, the
// session-creating rows and the delegation/schedule tools inside the agent presets) moved into
// fishball-core's own cordis.patch.yml, their one definition (design §5a.2, R-HOST-04: the launch
// overlays carry no guard rows). Until I-PLACE places core as a bundle, a hosted child starts
// without them (user decision 2026-11-14).
/**
 * fishball-core's slim child modules (V3 R-CORE). copyChildCode copies core beside native-child.js
 * (RUNTIME.corePackage), so these rows resolve inside the snapshot by path, never by import.
 */
const CORE_CHILD = path.join(RUNTIME.corePackage.target, 'src', 'slim', 'child')
/** core's fishball-ui page packages, copied with it (NATIVE_WEB.pageDirectory). */
const CORE_UI = path.join(RUNTIME.corePackage.target, NATIVE_WEB.pageDirectory)
/** The child app row (T03). */
const APP_MODULE = path.join(CORE_CHILD, 'app.js')
/** The shared bridge client and the session tools (T05); the approvals and inbox rows read its fishballBridge. */
const SESSION_TOOLS_MODULE = path.join(CORE_CHILD, 'session-tools.js')
/** T09's approval bridge: the app row injects its fishballApprovals for /api/approvals. */
const APPROVALS_MODULE = path.join(CORE_CHILD, 'approvals.js')
/** The inbox consumer: it injects the bridge and the app row's fishballChat. */
const INBOX_MODULE = path.join(CORE_CHILD, 'inbox.js')
/** The T11 admin row: the same tree, so the settings page's requests reach the child itself (§9). */
const ADMIN_MODULE = path.join(CORE_CHILD, 'admin.js')
/** T16's provider-sync target row: preview/confirm into the child's own home (§10). */
const PROVIDER_SYNC_MODULE = path.join(CORE_CHILD, 'provider-sync-target.js')

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
  // confined provider of fishball-core src/slim/child/skills.js may read it.
  const skillConfig = config => ({
    ...config, includeDefaultRoots: false, watchFollowSymlinks: false,
    customSkillDirs: [path.join(paths.agentsHome, 'skills'), path.join(paths.workspace, '.dsh', 'skills'), path.join(paths.workspace, '.agents', 'skills')],
    dshHome: paths.home, agentsHome: paths.agentsHome,
  })
  function isolatePlugins(plugins) {
    return plugins.map(row => {
      if (row.name === '@deepseek-ai/dsh-agent-instructions') return { ...row, config: instructionConfig(row.config) }
      if (row.name === '@deepseek-ai/dsh-skill-filesystem') return { ...row, config: skillConfig(row.config) }
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
  // Settings and enabled native client rows are deliberately preserved, not roster-filtered. The
  // policy rows are no longer patched here (F-GUARDS), but a profile without them stays refused
  // as before (UNSUPPORTED_PROFILE): it is not the native composition this launcher was written
  // for, and core's guards target exactly these rows once I-PLACE places core.
  for (const id of [ROW.hmr, ROW.sandboxPolicy, ROW.approval, ROW.webserver, ROW.webRuntime]) if (!rows.has(id)) fail('UNSUPPORTED_PROFILE')
  const config = { mainHome: paths.mainHome, hostId: record.hostId, instanceId: record.instanceId, limits, control }
  return [
    ...overlays,
    { id: ROW.hmr, disabled: true },
    { id: ROW.webserver, disabled: false, config: { ...rows.get(ROW.webserver).config, ...WEB_CONFIG } },
    { id: ROW.webRuntime, disabled: false, config: { ...rows.get(ROW.webRuntime).config, ...WEB_RUNTIME_CONFIG } },
    { insert: [
      // Native Web supplies its standard services. PG-1 owns navigation and permission
      // enforcement; this composition alone is not a read-only or session-isolation boundary.
      { id: ROW.nativeWeb, name: path.join(path.dirname(childModule), NATIVE_WEB.adapterModule), required: true, config },
      { id: ROW.page, name: path.join(path.dirname(childModule), CORE_UI, NATIVE_WEB.pagePackage, 'index.js'), required: true },
      // SET's generic slim settings panel (core) and the instance's hosted-only sections with their
      // relay routes, which register into the panel's extension point (R-HOST-11). Inserted here
      // until I-PLACE places fishball-hosted-settings as a bundle. Not required: a settings fault
      // must not take the Fishball conversation down with it.
      { id: ROW.settings, name: path.join(path.dirname(childModule), CORE_UI, NATIVE_WEB.settingsPackage, 'index.js') },
      { id: ROW.hostedSettings, name: path.join(path.dirname(childModule), ...NATIVE_WEB.hostedSettings, 'index.js') },
      // V2 RP: the Fishball Recommended tab on the child's native Plugins page. Child-only because
      // only this overlay inserts it; not required, so a failing tab never blocks the child boot.
      // copyChildCode already copies core's ui tree and the src/recommended.js it imports.
      { id: ROW.recommend, name: path.join(path.dirname(childModule), CORE_UI, NATIVE_WEB.recommendPackage, 'index.js') },
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
