/**
 * Tools checked and left visible (DESIGN §7 "Checked and left visible"), as data.
 *
 * Each entry records the module that registers the tool and a digest of its parameters as
 * checked on 2026-10-24 against the owner's profile (spikes/p3-tool-digests.mjs, evidence
 * in spikes/results/P3-tool-digests.json). A tool counts as checked only when its name,
 * registering module AND parameter digest all match: an update that changes the parameters
 * may add a save option, so it becomes unchecked until you allow it again.
 *
 * Not listed here, because they count as checked by construction: Fishball's own tools,
 * and the tools of DSH built-ins Fishball mounts in its private tree (src/builtins.js).
 */
export const CHECKED_TOOLS = Object.freeze({
  // dsh-plugin-subscriptions: searches X
  x_search: { module: 'dsh-plugin-subscriptions', digest: '44b0b822d894be34' },
  // browser-skill: browser control; downloads are covered by the role prompt
  bsk_assist: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: '25fd6a432ddbdfe8' },
  bsk_interact: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: '7cabee9eb94dcfc1' },
  bsk_page: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: 'eb5660bd35dac722' },
  bsk_session: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: '5426c6d7054445aa' },
  bsk_tabs: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: '02ca8f7916223be5' },
  // browser-skill: checked as the source of Fishball's copy without save options (spike S19)
  bsk_inspect: { module: '@wxg-prc-cpg/browser-skill-dsh-plugin', digest: '33bac8bbd5196f31' },
  // dsh-workspace-mover: read-only, or registry-only changes (no files or folders)
  mover_list_sessions: { module: 'dsh-workspace-mover', digest: '99334726611ccf58' },
  mover_doctor: { module: 'dsh-workspace-mover', digest: '99334726611ccf58' },
  mover_create_workspace: { module: 'dsh-workspace-mover', digest: 'd50372b668aae55f' },
  mover_rename_workspace: { module: 'dsh-workspace-mover', digest: '5822983c4bdbed46' },
  mover_repair_sessions: { module: 'dsh-workspace-mover', digest: '99334726611ccf58' },
  // DSH session search (optional bundle): read-only
  session_search: { module: '@deepseek-ai/dsh-tool-session-query', digest: '4fdff6d6b2f88a01' },
  session_event_search: { module: '@deepseek-ai/dsh-tool-session-query', digest: '5423439d08cc0b92' },
  session_event_read: { module: '@deepseek-ai/dsh-tool-session-query', digest: '792c057f9e838a5d' },
  session_event_trace: { module: '@deepseek-ai/dsh-tool-session-query', digest: '17261487fdc7c5f4' },
  session_trace: { module: '@deepseek-ai/dsh-tool-session-query', digest: '37e77b5068d7738c' },
  // DSH plugin market (optional bundle): read-only catalog search
  plugin_market: { module: '@deepseek-ai/dsh-plugin-market/tools', digest: '6f11c0518ffe38fa' },
  // DSH MCP resources (host row): read-only
  list_mcp_resources: { module: '@deepseek-ai/dsh-mcp-resources', digest: '13d12c6c47e494a3' },
  list_mcp_resource_templates: { module: '@deepseek-ai/dsh-mcp-resources', digest: '13d12c6c47e494a3' },
  read_mcp_resource: { module: '@deepseek-ai/dsh-mcp-resources', digest: 'e3d13ceab174becd' },
  // DSH working directory (host row): changes only the session's cwd record, no file
  working_directory: { module: '@deepseek-ai/dsh-tool-working-directory', digest: '740d5b289d998dbf' },
})

/**
 * Whether a tool is in the checked set with the same module and parameters.
 * @param name - tool name.
 * @param module - registering module (src/tool-attribution.js), or undefined.
 * @param digest - parameter digest (src/digest.js).
 */
export function isChecked(name, module, digest) {
  const entry = Object.hasOwn(CHECKED_TOOLS, name) ? CHECKED_TOOLS[name] : undefined
  return entry !== undefined && entry.module === module && entry.digest === digest
}
