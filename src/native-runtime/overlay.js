import path from 'node:path'
import { RUNTIME, fail } from './constants.js'

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
  if (!rows.has('webserver') || !rows.has('web-runtime') || !rows.has('preset-standard')) fail('UNSUPPORTED_PROFILE')
  return [
    ...overlays,
    { id: 'webserver', config: { ...rows.get('webserver').config, host: RUNTIME.host, port: 0, tls: undefined } },
    { id: 'web-runtime', config: { ...rows.get('web-runtime').config, printUrl: false, openBrowser: false, publicUrl: undefined } },
    { insert: [{ id: 'fishball-native-child', name: childModule, required: true, config: { mainHome: paths.mainHome, hostId: record.hostId, instanceId: record.instanceId, limits, control } }] },
  ]
}
