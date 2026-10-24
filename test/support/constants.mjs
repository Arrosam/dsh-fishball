/**
 * Shared test vocabulary for the Fishball P2 black-box suite. Values come from
 * the P2 requirements given to the test author (see test/CASES.md), never from
 * the implementation.
 */
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..')
export const NODE = '/opt/homebrew/bin/node'
export const RUNTIME = process.env.FBTEST_DSH_RUNTIME ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules'
export const TEST_HOMES = path.join(REPO, '.runtime', 'test-homes')
export const SUPPORT = import.meta.dirname
export const WORKER = path.join(SUPPORT, 'worker.mjs')

/** Profile created inside each throwaway DSH_HOME (never a shipped profile name). */
export const PROFILE = 'fbtest'
export const PACKAGE_NAME = 'dsh-fishball'
export const ROW_ID = 'fishball'
/** P3: the bundle patch inserts this row before the fishball row. */
export const ATTRIBUTION_ROW = { id: 'fishball-attribution', module: 'dsh-fishball/attribution' }
export const SENTINEL_PRESET = 'fishball:assistant'

/** Fixture bundle linked into the test profile, before the plugin under test. */
export const FIXTURE_BUNDLE = { name: 'fbtest-tools', dir: path.join(SUPPORT, 'fixtures', 'fbtest-tools') }

const fixtureDir = (name) => path.join(SUPPORT, 'fixtures', name)
/**
 * P3: fixture bundles installed in the profile (dependencies) but not enabled there.
 * Each registers one tool when mounted and records apply/dispose (R8).
 * `edits` also edits the fbtest-tools row, so it may not run Fishball-only.
 */
export const ONLY_BUNDLES = {
  a: { name: 'fbtest-only', tool: 'only_echo', dir: fixtureDir('fbtest-only') },
  b: { name: 'fbtest-only-b', tool: 'only_b_echo', dir: fixtureDir('fbtest-only-b') },
  c: { name: 'fbtest-only-c', tool: 'only_c_echo', dir: fixtureDir('fbtest-only-c') },
  edits: { name: 'fbtest-edits', tool: 'edits_echo', dir: fixtureDir('fbtest-edits') },
}
/** P3 R12: a local package add_plugin installs by absolute path; never linked at boot. */
export const ADDED_BUNDLE = { name: 'fbtest-added', tool: 'added_echo', dir: fixtureDir('fbtest-added') }
/** Post-review: a second local package, installed through DSH's plugin manager while DSH runs. */
export const ADDED_BUNDLE_B = { name: 'fbtest-added-b', tool: 'added_b_echo', dir: fixtureDir('fbtest-added-b') }
/** Post-review change 13: installed AND enabled in the profile through the plugin manager while DSH runs. */
export const ADDED_BUNDLE_C = { name: 'fbtest-added-c', tool: 'added_c_echo', dir: fixtureDir('fbtest-added-c') }

/**
 * Post-review fixture bundles, linked (installed, not enabled) only when the worker runs with
 * FBTEST_REVIEW_BUNDLES=1, so the other files keep their catalog:
 * broken: its main file is missing; norows: its patch inserts nothing; idinsert: an entry with an id AND insert;
 * dup: two rows without id naming the same module.
 */
export const REVIEW_BUNDLES = {
  broken: { name: 'fbtest-broken', dir: fixtureDir('fbtest-broken') },
  norows: { name: 'fbtest-norows', dir: fixtureDir('fbtest-norows') },
  idinsert: { name: 'fbtest-idinsert', tool: 'idinsert_echo', dir: fixtureDir('fbtest-idinsert') },
  dup: { name: 'fbtest-dup', tool: 'dup_echo', dir: fixtureDir('fbtest-dup') },
  waits: { name: 'fbtest-waits', tool: 'waits_echo', dir: fixtureDir('fbtest-waits'), service: 'fbtestLateService' },
  leak: { name: 'fbtest-leak', tool: 'leak_echo', dir: fixtureDir('fbtest-leak') },
  leakB: { name: 'fbtest-leak-b', tool: 'leak_b_echo', dir: fixtureDir('fbtest-leak-b') },
  throws: { name: 'fbtest-throws', tool: 'throws_echo', dir: fixtureDir('fbtest-throws') },
  importThrows: { name: 'fbtest-import-throws', dir: fixtureDir('fbtest-import-throws') },
}
/** Post-review: host rows whose ids look like private-tree ids (FBTEST_SPOOF_ROWS=1). */
export const SPOOF_MODULE = path.join(SUPPORT, 'fixtures', 'spoof-row.mjs')
export const SPOOF_ROWS = [
  { id: 'fb-web--x', tool: 'spoof_web_echo' },
  { id: 'fbo-fbtest-only--x', tool: 'spoof_only_echo' },
]
/** Post-review: fbtest-tools registers this tool in every new agent's own scope (FBTEST_AGENT_SCOPE_TOOL=1). */
export const AGENT_SCOPE_TOOL = 'agent_scope_echo'
/**
 * Post-review R1: with FBTEST_AGENT_SCOPE_SHADOW=<names>, fbtest-tools also registers fixture tools under
 * these names in every new agent's own scope, shadowing a tool Fishball can see.
 */
export const SHADOW_TOOLS = ['demo_echo', 'schedule_list']

/** Fixture tool descriptions have two lines; an approval reason carries only the first (R6). */
export const FIXTURE_DESCRIPTION = {
  first: (name) => 'fbtest fixture tool ' + name + '. Records every call.',
  second: 'Second description line, never part of an approval reason.',
}
/** Fake model plugin, inserted by the per-boot overlay patch. */
export const FAKE_LLM_MODULE = path.join(SUPPORT, 'fixtures', 'fake-llm.mjs')

/** The scripted model route. */
export const FAKE = { provider: 'fishball-test', model: 'test-model' }

/** Ordinary presets used for comparison sessions. */
export const PRESET = {
  standard: 'standard',
  /** A test preset with no tools of its own, so the global fixture tools are what an ordinary session sees. */
  bare: 'fbtest-bare',
}

export const assistantDir = (home) => path.join(home, 'fishball', 'assistant')

/** R-CONFIG: field -> default and minimum valid whole number. */
export const LIMITS = {
  maxQueuedInputs: { default: 200, min: 1 },
  maxActiveWatches: { default: 50, min: 1 },
  maxSourcesPerPlugin: { default: 8, min: 1 },
  maxFishballOnlyPlugins: { default: 32, min: 1 },
  wakeupsPerHour: { default: 60, min: 0 },
  messagesPerHour: { default: 30, min: 0 },
  sessionsPerHour: { default: 10, min: 0 },
  maxPendingApprovals: { default: 8, min: 1 },
  approvalAnswerSeconds: { default: 120, min: 1 },
  argumentExcerptBytes: { default: 8192, min: 1 },
  maxMessageBytes: { default: 65536, min: 1 },
  auditEntriesKept: { default: 500, min: 1 },
}

/** R-COMPOSITION: names never shown to Fishball. */
export const HIDDEN_TOOLS = [
  'image_generate', 'video_generate', 'mover_move_session', 'create_worktree', 'git_worktree',
  'diff_approval_annotate', 'ralph', 'code_review_report', 'write', 'edit', 'str_replace_editor',
  'plugin_manager', 'subagent', 'subagent_fork', 'workflow', 'send_message', 'interrupt_agent',
  'spawn_teammate',
]

/** R-FILEWRITE: refused by name for Fishball. */
export const FILE_TOOLS = ['write', 'edit', 'str_replace_editor', 'plugin_manager']

/** R-FILEWRITE shell tools. run_code is reserved by DSH and cannot be registered as a fixture (see CASES.md). */
export const SHELL_TOOLS = ['bash', 'pwsh', 'run_code', 'terminal_open', 'terminal_send']
export const FIXTURE_SHELL_TOOLS = SHELL_TOOLS.filter((n) => n !== 'run_code')

/** Ordinary names that must stay visible to Fishball. */
export const VISIBLE_TOOLS = ['demo_echo', 'bsk_inspect']

/** Every fixture tool name; the fixture bundle registers all but LATE_TOOLS at boot. */
export const BOOT_TOOLS = [...new Set([...HIDDEN_TOOLS, ...FIXTURE_SHELL_TOOLS, ...VISIBLE_TOOLS])]

/** Hidden names registered only after Fishball is live (R-COMPOSITION re-evaluation), plus one ordinary late name. */
export const LATE_TOOLS = ['ralph', 'code_review_report']
export const LATE_VISIBLE_TOOL = 'late_echo'

/** P3 R4: fbtest-tools names that are neither hidden nor checked, so they are 'unchecked' for Fishball until allowed. */
export const FIXTURE_UNCHECKED = BOOT_TOOLS.filter((n) => !HIDDEN_TOOLS.includes(n))
/** fbtest-tools hidden names registered at boot. */
export const FIXTURE_HIDDEN = BOOT_TOOLS.filter((n) => HIDDEN_TOOLS.includes(n) && !LATE_TOOLS.includes(n))

/** bsk_inspect fixture schema: carries the two save options the copy must drop. */
export const BSK_PARAMETERS = {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['observe', 'snapshot', 'video'] },
    output: { type: 'string', description: 'save path' },
    videoAction: { type: 'string', enum: ['start', 'status', 'stop', 'save', 'list', 'discard'] },
    maxRows: { type: 'number' },
  },
  required: ['action'],
}

export const SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access']

/** Source of the one setup message at first creation. */
export const SETUP_SOURCE = { kind: 'fishball-notice', form: 'notice', summary: 'Fishball is set up' }

export const STATUS = { starting: 'starting', live: 'live', recovery: 'recovery', archived: 'archived', stopped: 'stopped', failed: 'failed' }

/** Every status except "starting": the state a start settles in. */
export const SETTLED = Object.values(STATUS).filter((s) => s !== STATUS.starting)

/** Error codes of status "failed", and the 409 codes of POST recovery. */
export const ERROR_CODE = { storeUnreadable: 'store-unreadable', composeFailed: 'compose-failed' }
export const CONFLICT_CODE = { notInRecovery: 'not-in-recovery', unavailable: 'unavailable' }

/** Fishball's own storage domain file (DESIGN.md §9: domain "fishball", version 1, global record). */
export const STORE = { file: (home) => path.join(home, 'storages', 'fishball.json'), name: 'fishball', version: 1 }

export const API = {
  state: '/api/fishball/state', events: '/api/fishball/events', recovery: '/api/fishball/recovery',
  plugins: '/api/fishball/plugins', removeApproval: '/api/fishball/tool-approvals/remove',
}

/** P3 R1: Fishball's own model tools. */
export const FISHBALL_TOOLS = ['list_plugins', 'set_plugin_enabled', 'add_plugin']
export const KIND = { profile: 'profile', only: 'fishball-only', builtin: 'builtin' }
export const TOOL_STATUS = { visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked' }
export const CHANGED_BY = { fishball: 'fishball', user: 'user' }
export const CATALOG_KEYS = ['allowedTools', 'otherTools', 'plugins']
export const PLUGIN_KEYS = ['applied', 'changedBy', 'kind', 'lastError', 'on', 'plugin', 'title', 'tools', 'waiting']
/** Post-review: the only values lastError may take (besides null). */
export const LAST_ERRORS = ['edits-other-rows', 'no-rows', 'row-failed', 'leaks-service', 'no-profile', 'row-id-conflict', 'limit-reached']
/** Post-review: plugin_changes and tool_approvals keys use only these characters. */
export const STORE_KEY = /^[A-Za-z0-9_-]+$/

/** P3 R2/R3: built-in catalog entries, their default state and the tools each brings to Fishball. */
export const BUILTINS = {
  'builtin:compaction': { on: true, tools: [] },
  'builtin:web': { on: true, tools: ['web_search', 'web_fetch'] },
  'builtin:time': { on: true, tools: [] },
  'builtin:reminders': { on: true, tools: ['schedule_create', 'schedule_list', 'schedule_delete', 'schedule_update'] },
  'builtin:ask-user': { on: false, tools: ['ask_user_question'] },
  'builtin:skills': { on: false, tools: ['skill'] },
  'builtin:shell': { on: false, tools: ['bash'] },
}
/** P3 R3: checked host tools Fishball sees at first start. */
export const CHECKED_HOST_TOOLS = ['working_directory']

/** P3 result codes. */
export const CODE = {
  rejected: 'rejected', limit: 'limit-reached', editsOtherRows: 'edits-other-rows',
  unknown: 'unknown', refused: 'refused', badBody: 'bad-body',
}

/** DSH approval outcomes a test answerer can return (dsh-user-approval ApprovalOutcome). */
export const OUTCOME = { allow: 'allowed-once', reject: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' }
/** Not an outcome: the scripted answerer throws instead of answering (post-review change 8). */
export const APPROVER_THROWS = 'throw'
/** Not an outcome: the scripted answerer holds the question open until the test releases it (race cases). */
export const APPROVER_HOLDS = 'hold'

export const MS = { boot: 45000, live: 20000, turn: 20000, stop: 20000, poll: 100, sseFirstFrame: 3000, sseChange: 8000 }
