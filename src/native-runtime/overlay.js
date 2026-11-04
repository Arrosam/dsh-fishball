import path from 'node:path'
import { fail } from './constants.js'

/** Row identities the attached profile composes; each id is also the patch target below. */
const ROW = Object.freeze({
  hmr: 'hmr',
  sandboxPolicy: 'sandbox-policy',
  approval: 'approval',
  lifecycle: 'fishball-native-child',
  app: 'fishball-native-app',
  schedule: 'schedule',
  toolSchedule: 'tool-schedule',
})
const PACKAGE = Object.freeze({ schedule: '@deepseek-ai/dsh-schedule', toolSchedule: '@deepseek-ai/dsh-tool-schedule' })
/** Policies the slim child fixes independently of the main deployment (§2.3). */
const POLICY = Object.freeze({ sandboxMode: 'read-only', approval: 'ask' })
/** copyChildCode copies this tree beside native-child.js, so the app row resolves inside the snapshot. */
const APP_MODULE = path.join('src', 'slim', 'child', 'app.js')

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
  const skillConfig = config => ({
    ...config, includeDefaultRoots: false, watchFollowSymlinks: false,
    customSkillDirs: [path.join(paths.home, 'skills'), path.join(paths.agentsHome, 'skills'), path.join(paths.workspace, '.dsh', 'skills'), path.join(paths.workspace, '.agents', 'skills')],
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
  // The profile is base-only (§2.3), so only the rows this overlay rewrites must be present;
  // webserver, web-runtime and preset-standard belonged to the Web UI bundle and are gone.
  for (const id of [ROW.hmr, ROW.sandboxPolicy, ROW.approval]) if (!rows.has(id)) fail('UNSUPPORTED_PROFILE')
  const config = { mainHome: paths.mainHome, hostId: record.hostId, instanceId: record.instanceId, limits, control }
  return [
    ...overlays,
    { id: ROW.hmr, disabled: true },
    { id: ROW.sandboxPolicy, config: { ...rows.get(ROW.sandboxPolicy).config, mode: POLICY.sandboxMode } },
    { id: ROW.approval, config: { ...rows.get(ROW.approval).config, policy: POLICY.approval } },
    { insert: [
      // Reminders were Web-bundle rows; the slim child composes them itself (§2.1, §2.3).
      { id: ROW.schedule, name: PACKAGE.schedule },
      { id: ROW.toolSchedule, name: PACKAGE.toolSchedule },
      { id: ROW.lifecycle, name: childModule, required: true, config },
      // The app row is T03's module. required:true makes a missing or inactive app row fail the
      // boot loudly instead of leaving a child that serves nothing (§15 LIFE-02).
      { id: ROW.app, name: path.join(path.dirname(childModule), APP_MODULE), required: true, config },
    ] },
  ]
}
