/**
 * The tool rules of DESIGN §7, as data. Code reads these sets; nothing else names a tool.
 *
 * HIDDEN: never exposed to Fishball, whatever plugin brings them. They save files, start
 * agents inside Fishball's own session, or edit the profile. Checked against the user's
 * installed plugins on 2026-10-24 (DESIGN §7 "Tools hidden from Fishball").
 */
/** DSH file and profile editors. The guard refuses them by name even if a hiding gap ever exposed them. */
export const FILE_WRITE_TOOLS = Object.freeze(['write', 'edit', 'str_replace_editor', 'plugin_manager'])

/** Every hidden tool (see HIDDEN above): masked for Fishball and refused by the guard. */
export const HIDDEN_TOOLS = Object.freeze([
  ...FILE_WRITE_TOOLS,
  // dsh-plugin-subscriptions: save generated media as files
  'image_generate', 'video_generate',
  // dsh-workspace-mover: moves a session archive folder
  'mover_move_session',
  // git worktrees: create branches and checkout folders
  'create_worktree', 'git_worktree',
  // dsh-diff-approval: writes review notes to disk
  'diff_approval_annotate',
  // agents inside Fishball's session: their tools sit outside the file-write rule
  'ralph', 'code_review_report', 'subagent', 'subagent_fork', 'workflow', 'send_message', 'interrupt_agent',
  // dsh-experimental-tool-agent-team: starts teammate agents inside the calling session
  'spawn_teammate',
].sort())

/** The only sandbox mode in which Fishball's shell tools may run, and the mode its session is created in. */
export const SAFE_SANDBOX_MODE = 'read-only'

/**
 * Shell and code tools. They may run only while Fishball's session sandbox is read-only,
 * where DSH confines processes from writing files, and never with `sandbox_permissions`.
 */
export const SHELL_TOOLS = Object.freeze(['bash', 'pwsh', 'run_code', 'terminal_open', 'terminal_send'])

/** The argument a shell tool uses to ask for a wider sandbox for one call. */
export const SANDBOX_ESCALATION_ARG = 'sandbox_permissions'

/**
 * browser-skill's bsk_inspect saves debug exports, recordings and table extracts to disk
 * through these options. Fishball gets a scoped copy without them (spike S19).
 */
export const BSK_INSPECT = Object.freeze({
  name: 'bsk_inspect',
  removedProperties: Object.freeze(['output']),
  enumFilters: Object.freeze([{ property: 'videoAction', removedValues: Object.freeze(['save']) }]),
})

/** Guard and refusal texts the model sees (stable, no secrets). */
export const REFUSAL = Object.freeze({
  hidden: (name) => `Fishball does not use "${name}": it would write files or start work inside Fishball's own session. Hand the work to another session instead.`,
  fileWrite: (name) => `Fishball never writes local files, so "${name}" is refused. Hand the change to another session.`,
  escalation: (name) => `Fishball never widens its sandbox, so this "${name}" call with sandbox_permissions is refused.`,
  notReadOnly: (name, mode) => `"${name}" runs for Fishball only while its session is read-only (it is now ${mode}).`,
  bskSave: () => 'Fishball cannot save browser output to disk: the "output" option and videoAction "save" are not available.',
})
