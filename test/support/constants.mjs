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
export const SENTINEL_PRESET = 'fishball:assistant'

/** Fixture bundle linked into the test profile, before the plugin under test. */
export const FIXTURE_BUNDLE = { name: 'fbtest-tools', dir: path.join(SUPPORT, 'fixtures', 'fbtest-tools') }
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

export const API = { state: '/api/fishball/state', events: '/api/fishball/events', recovery: '/api/fishball/recovery' }

export const MS = { boot: 45000, live: 20000, turn: 20000, stop: 20000, poll: 100, sseFirstFrame: 3000, sseChange: 8000 }
