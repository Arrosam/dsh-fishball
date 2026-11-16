import path from 'node:path'
import { fail, RUNTIME, NATIVE_WEB, HOSTED } from './constants.js'

/** Row identities the attached profile composes; each id is also the patch target below. */
const ROW = Object.freeze({
  hmr: 'hmr',
  sandboxPolicy: 'sandbox-policy',
  approval: 'approval',
  lifecycle: 'fishball-native-child',
  webserver: 'webserver',
  webRuntime: 'web-runtime',
  nativeWeb: 'fishball-native-web',
  child: HOSTED.childRow,
})
/** The child-side row's module in the lifecycle snapshot (RUNTIME.snapshot.entries). */
const CHILD_ROW_MODULE = 'child-row.js'
const WEB_CONFIG = Object.freeze({ host: RUNTIME.host, port: 0, tls: undefined })
const WEB_RUNTIME_CONFIG = Object.freeze({ openBrowser: false, printUrl: false, publicUrl: undefined })
/**
 * What the launch overlay carries (R-HOST-04; design §6.2; Q-5 and the isolation patches decided
 * 2026-11-15): HMR off, the child's own origin and port, the three instance runtime rows (the
 * lifecycle row, the native-web adapter and the child-side row `dsh-instance-child`, whose config
 * is the target URL core reads, from the instance's snapshot) and the isolation of the
 * child's instructions and skills from the user's own. No guard row: the guards are fishball-core's
 * own patch (F-GUARDS), which applies because the instance places core last (placement.js). No
 * plugin-set row: those are placed bundles, which the child's owner can switch off (R-BND-02);
 * core's own patch inserts its V2 child rows.
 *
 * No token value and no key: the hosted import travels on the wire (credential.js), and the
 * admission key is derived from the lifecycle secret at both ends (ticket.js).
 *
 * Whole-row replacement preserves standard native configuration and tool declarations.
 * @param child - `{targetUrl}` for the child-side row ('' when there is no target)
 */
export function launchOverlay(paths, record, childModule, limits, control, entries, child = { [HOSTED.targetField]: '' }) {
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
  // policy rows are not patched here (F-GUARDS), but a profile without them stays refused
  // (UNSUPPORTED_PROFILE): it is not the native composition this launcher was written for, and
  // core's guards target exactly these rows.
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
      // The lifecycle row provides nativeRuntime, which core's session-tools, admin and
      // provider-sync rows inject (core's cordis.patch.yml), so they start once it is up.
      { id: ROW.lifecycle, name: childModule, required: true, config },
      // The child-side row (child-row.js): it injects the lifecycle row's nativeRuntime, so it
      // starts after it. Not `required`: a failure there loses the import and the admission, which
      // the host reports through their own answers, and never blocks the child's start.
      { id: ROW.child, name: path.join(path.dirname(childModule), CHILD_ROW_MODULE), config: { [HOSTED.targetField]: child[HOSTED.targetField] } },
    ] },
  ]
}
