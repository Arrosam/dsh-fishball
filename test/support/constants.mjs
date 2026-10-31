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
/** P4: further fake models on the same provider: b has another window, nowin reports none. */
export const FAKE_MODELS = { b: 'test-model-b', nowin: 'test-model-nowin' }
/** P4: fake model windows and the adapter's default reply cap (defaultMaxTokens). */
export const FAKE_WINDOW = { default: 128000, b: 300000, defaultMaxTokens: 4096 }

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
/**
 * P5: the state's hiddenTools also lists message_fishball (Fishball's own inbound tool, hidden from
 * Fishball). It is not a fixture name: fbtest-tools never registers it.
 */
export const STATE_HIDDEN_TOOLS = [...HIDDEN_TOOLS, 'message_fishball']

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
  contextWindow: '/api/fishball/context-window',
  send: '/api/fishball/send',
  read: '/api/fishball/read',
  pluginsRemove: '/api/fishball/plugins/remove', pluginsInstall: '/api/fishball/plugins/install',
}

// ---- P5 (messaging, intake, outbox) ----
/** P5: the state snapshot's 11 keys; P6 adds 'watches' (12), P7 'approvals' (13), P8 'sources' (14), unread replies 'unread' (15), brand icon 'preferences' (16). */
/** P11 R2 adds 'look' (17). */
export const STATE_KEYS = ['approvals', 'catalog', 'contextWindow', 'cwd', 'error', 'hiddenTools', 'intake', 'limits', 'look', 'outbox', 'preferences', 'sessionId', 'sources', 'status', 'unread', 'watches', 'workspaceId']
/** Brand icon feature (DESIGN §9/§10 1b): state.preferences = {brandStyle}, default 'fishball'. */
export const PREFERENCES = { keys: ['brandStyle'], styles: ['fishball', 'deepseek'], defaultStyle: 'fishball' }
/** P5 M1: the tool every other agent has, and M6/M7 Fishball's own outbound tools. */
export const INBOUND_TOOL = 'message_fishball'
export const OUTBOUND_TOOLS = ['message_session', 'start_session']
export const RELAY = { kind: 'agent-message', form: 'relay' }
export const NOTICE = { kind: 'fishball-notice', form: 'notice' }
/** P5 result and route codes. */
export const P5_CODE = {
  empty: 'empty', tooLarge: 'too-large', queueFull: 'queue-full', unknownSession: 'unknown-session', fromFishball: 'from-fishball',
  unavailable: 'unavailable', badBody: 'bad-body', isFishball: 'is-fishball', archived: 'archived', hourlyCap: 'hourly-cap',
  deliveryFailed: 'delivery-failed', noFolder: 'no-folder', notAbsolute: 'not-absolute',
}
export const INTAKE_KEYS = ['failed', 'items', 'queued', 'wakeupsThisHour']
export const INTAKE_ITEM_KEYS = ['createdAt', 'errorCode', 'intakeId', 'kind', 'sourceIdentity', 'status']
export const INTAKE_KINDS = ['session', 'user', 'system']
export const INTAKE_STATUSES = ['pending', 'accepted', 'consumed', 'discarded', 'failed']
/** Required outbox entry keys; folder and errorCode are optional (M8). */
export const OUTBOX_KEYS = ['at', 'key', 'kind', 'messageDigest', 'status', 'targetSessionId']
export const OUTBOX_OPTIONAL = ['errorCode', 'folder']
/** M8/M9: at most this many entries/items in the state. */
export const STATE_LIST_MAX = 20
/** M4 (review update): the forwarded session's last answer is cut to at most this many UTF-8 bytes, ending with '…' when cut. */
export const FORWARD_ANSWER_MAX_BYTES = 3072
export const ELLIPSIS = '…'
export const NO_NOTE = 'The user added no note.'
/** M1/M4 (review update): the trusted first lines of a relayed message and of a forward, and the forward's notice summary. */
export const RELAY_HEADER = 'Fishball: a message from another session follows.'
export const FORWARD_HEADER = "Fishball: the user forwarded a session to you from DSH's sidebar."
export const NOTE_PREFIX = "The user's note: "
export const FORWARD_SUMMARY = 'The user forwarded a session'
/** M1 result notes (review update). */
export const NOTE_TEXT = { delivered: 'Delivered to Fishball.', queuedPrefix: 'Queued for Fishball' }
export const IDENTITY = { session: (id) => 'session/' + id, forward: (id) => 'user/forward/' + id, unchecked: 'fishball/unchecked-tools' }
/** M10: the intake store (per-record files). */
export const INTAKE_DIR = (home) => path.join(home, 'storages', 'fishball_intake')

// ---- P6 (watches) ----
export const WATCH_API = { add: '/api/fishball/watches', remove: '/api/fishball/watches/remove' }
/** W1: keys of state.watches and of one watch. */
export const WATCHES_KEYS = ['active', 'watches']
export const WATCH_KEYS = ['condition', 'createdAt', 'createdBy', 'firedCount', 'id', 'lastFiredAt', 'lastReason', 'mode', 'status', 'targetSessionId']
export const WATCH_CONDITIONS = ['finished', 'per-turn']
export const WATCH_MODES = ['once', 'repeat']
export const WATCH_STATUS = { active: 'active', closed: 'closed', targetMissing: 'target-missing' }
export const WATCH_CREATORS = ['user', 'assistant', 'agent']
/** W1: the state lists at most this many watches, newest first. */
export const WATCH_LIST_MAX = 50
/** W3: reasons that count as finished; 'interrupted' never fires. */
export const FINISH_REASONS = ['completed', 'error', 'aborted', 'blocked', 'max-tokens']
export const WATCH_CODE = {
  badBody: 'bad-body', unknownSession: 'unknown-session', isFishball: 'is-fishball', archived: 'archived',
  limit: 'limit-reached', unavailable: 'unavailable', unknownWatch: 'unknown-watch', notRelated: 'not-related',
}
/** W3/W4: notice source summary and the wording of its first line. */
export const WATCH_SUMMARY = (reason) => 'A watched session finished (' + reason + ')'
export const WATCH_TEXT = { finished: 'a session you are watching finished', perTurn: 'ended a turn' }
/** W5: Fishball's watch tools (only Fishball has them). */
export const WATCH_TOOLS = ['watch_session', 'list_watches', 'unwatch_session', 'read_session']
/** W5: read_session bounds. */
export const READ_MAX = { messages: 12, bytes: 12288 }
export const READ_ROLES = ['user', 'assistant']

/** P4 C1: keys of state.contextWindow, and its refusal codes (C3, C7). */
export const CONTEXT_WINDOW_KEYS = ['compactionOff', 'contextWindowTokens', 'effectiveWindow', 'error', 'maxOutputTokens', 'modelWindow', 'outputCap', 'pressureTokens', 'threshold']
export const CW_CODE = { windowTooSmall: 'window-too-small', outputTooLarge: 'output-too-large', modelWindowUnknown: 'model-window-unknown', unavailable: 'unavailable', badBody: 'bad-body' }
/** P4 C2/C4/C5: DSH's default compaction policy constants and the summary headings Fishball's compaction asks for. */
export const DSH_COMPACTION = { thresholdRatio: 0.8, headroom: 65536, retainRatio: 0.16 }
/** P4 review: a smaller window below this is always window-too-small; the summary word budget is floor(H * ratio). */
export const MIN_WINDOW = 4096
export const SUMMARY_WORDS_PER_TOKEN = 0.75
export const OUTPUT_CAP_MAX = 32000
export const SUMMARY_HEADINGS = ['## Standing permissions', '## Commitments', '## Open loops', '## Watches', '## Preferences', '## Sources', '## Current conversation']

/** P3 R1: Fishball's own model tools. */
/** Plugin statuses: Fishball's own model tools (plugin statuses feature adds remove_plugin). */
export const FISHBALL_TOOLS = ['list_plugins', 'set_plugin_enabled', 'add_plugin', 'remove_plugin']
export const KIND = { profile: 'profile', only: 'fishball-only', builtin: 'builtin', installed: 'fishball-installed' }
export const TOOL_STATUS = { visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked' }
export const CHANGED_BY = { fishball: 'fishball', user: 'user' }
export const CATALOG_KEYS = ['allowedTools', 'otherTools', 'plugins']
/** Plugin statuses feature: every entry also has actions, removing and status (12 keys). */
export const PLUGIN_KEYS = ['actions', 'applied', 'changedBy', 'kind', 'lastError', 'on', 'plugin', 'removing', 'status', 'title', 'tools', 'waiting']
/** Plugin statuses feature: the status of a catalog entry and the actions it offers. */
export const PLUGIN_STATUS = { installed: 'installed-in-fishball', dshEnabled: 'dsh-enabled', dshDisabled: 'dsh-disabled', builtin: 'builtin' }
export const ACTION = { enable: 'enable', disable: 'disable', uninstall: 'uninstall' }
/** The catalog key of a Fishball-installed plugin is this prefix + its package name. */
export const INSTALLED_KEY = (name) => 'fishball:' + name
/** Fishball's own package folder (a pnpm project), separate from the DSH profile (implementer's answer). */
export const FISHBALL_PLUGINS_DIR = (home) => path.join(home, 'profiles', '.fishball-plugins')
/** add_plugin install-failed reasons named by the requirements. */
export const INSTALL_REASON = { invalidSpec: 'invalid-spec', alreadyInstalled: 'already-installed', notBundle: 'not-bundle' }
/** A local package without a DSH bundle patch (add_plugin refuses it as not-bundle). */
export const NOT_BUNDLE = { name: 'fbtest-notbundle', dir: path.join(SUPPORT, 'fixtures', 'fbtest-notbundle') }
/** The previous version of the plugin, for the existing-install cases. */
export const OLD_VERSION = { commit: 'f368ad2' }
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
  installFailed: 'install-failed', notRemovable: 'not-removable', unknownPlugin: 'unknown-plugin',
}

/** DSH approval outcomes a test answerer can return (dsh-user-approval ApprovalOutcome). */
export const OUTCOME = { allow: 'allowed-once', reject: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' }
/** Not an outcome: the scripted answerer throws instead of answering (post-review change 8). */
export const APPROVER_THROWS = 'throw'
/** Not an outcome: the scripted answerer holds the question open until the test releases it (race cases). */
export const APPROVER_HOLDS = 'hold'

// ---- P7 (ApprovalBroker) ----
/**
 * P7: with FBTEST_APPROVER_AFTER=1 the scripted answerer stands in for the browser prompt AFTER the
 * broker (see worker.mjs), and the root registers this asking tool for ordinary sessions.
 */
export const ASK_TOOL = 'fbtest_ask'
export const ASK_REASON = (text) => 'fbtest asks for ' + text
export const APPROVER_AFTER_ENV = { FBTEST_APPROVER_AFTER: '1' }
/** P1: the request message. */
/** P1 (review update): the tool name is JSON-quoted in the summary. */
export const APPROVAL_SUMMARY = (tool) => 'Permission request: ' + JSON.stringify(tool)
export const APPROVAL_ID = /^apr_[0-9a-f]+$/
export const APPROVAL_PREFIX = /^\[permission request (apr_[0-9a-f]+)\]/
/** P1 block fields (review update adds approval_policy); the optional ones appear only in their cases. */
export const APPROVAL_FIELDS = ['session_id', 'session_title', 'session_folder', 'permission_mode', 'approval_policy', 'tool', 'reason_given', 'arguments', 'latest_user_message']
export const APPROVAL_OPTIONAL_FIELDS = ['asked_by_subagent_session', 'call_was_to_tool']
export const ARGS_STATUS = { complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' }
export const STARTED_BY = { user: 'the user', fishball: 'Fishball (start_session)' }
export const TURN_BY = { user: 'the user', fishball: 'Fishball (message_session)', other: 'another agent or a notice' }
/** Provenance update: a session not started by the user or Fishball. */
export const STARTED_BY_OTHER = ['another agent or a notice', 'unknown']
/** P1: latest_user_message is cut to at most this many UTF-8 bytes. */
export const LATEST_USER_MAX_BYTES = 2048
/** P2: answer_approval and its codes. */
export const ANSWER_TOOL = 'answer_approval'
export const APR_CODE = { lowRisk: 'allow-needs-low-risk', reason: 'reason-required', incomplete: 'arguments-incomplete', expired: 'expired' }
/** P4-P6: the non-waking notes Fishball gets. */
export const APR_NOTE = {
  escalated: (id, outcome) => 'Fishball notice: permission request ' + id + " was escalated; the user's answer in that session: " + outcome,
  timeout: 'got no answer in time and went to the user',
  withdrawn: 'was withdrawn',
}
/** P8: state.approvals. */
export const APPROVALS_KEYS = ['pending', 'recent']
export const PENDING_KEYS = ['at', 'id', 'sessionId', 'toolName']
export const RECENT_KEYS = ['answer', 'argumentsStatus', 'at', 'decidedAt', 'finalOutcome', 'key', 'rationale', 'risk', 'sessionId', 'toolName']
export const RECENT_ANSWERS = ['allow', 'escalate', 'timeout', 'withdrawn']
export const FINAL_OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable']
export const RECENT_MAX = 20
/** P9: rubric phrases in Fishball's system prompt. */
export const RUBRIC = ['**Permission requests.**', 'Approve only if the user has allowed you to', 'With no such allowance, escalate at once', 'Low risk:', 'High risk:', 'When unsure, it is high risk', 'answer_approval', 'You cannot reject']

// ---- P8 (ctx.fishball sources) ----
/**
 * P8: with FBTEST_SOURCES=1 the profile links fbtest-source (enabled; two rows, labels src-a and
 * src-b), fbtest-source-static (enabled; static inject) and fbtest-source-only (installed, off),
 * and the overlay inserts the plain host row SOURCE_ROW. Each row captures its fishball context
 * under its label, so the worker can call the service as that row.
 */
export const SOURCES_ENV = { FBTEST_SOURCES: '1' }
export const SOURCE_BUNDLES = {
  profile: { name: 'fbtest-source', dir: fixtureDir('fbtest-source'), rows: { a: { id: 'fbtest-source', label: 'src-a' }, b: { id: 'fbtest-source-b', label: 'src-b' } } },
  static: { name: 'fbtest-source-static', dir: fixtureDir('fbtest-source-static'), rows: { a: { id: 'fbtest-source-static', label: 'src-static' } } },
  only: { name: 'fbtest-source-only', dir: fixtureDir('fbtest-source-only'), rows: { a: { id: 'fbtest-source-only', label: 'src-only' } } },
}
export const SOURCE_ROW = { id: 'fbtest-source-row', module: path.join(SUPPORT, 'fixtures', 'source-row.mjs'), label: 'src-row' }
/**
 * P8 R5: the example plugin. FBTEST_EXAMPLE=everyone links it enabled, =only links it installed
 * and off; FBTEST_EXAMPLE_NOTES (JSON) is its notes config, given by the overlay as an edit of its row.
 */
export const EXAMPLE = { name: 'fishball-source-example', dir: path.join(REPO, 'examples', 'fishball-source-example'), row: 'fishball-source-example', source: { id: 'notes', title: 'Example notes' } }
export const SOURCE_ERR = {
  invalid: 'FISHBALL_INVALID', duplicate: 'FISHBALL_SOURCE_DUPLICATE', limit: 'FISHBALL_LIMIT', tooLarge: 'FISHBALL_TOO_LARGE',
  queueFull: 'FISHBALL_QUEUE_FULL', disposed: 'FISHBALL_SOURCE_DISPOSED',
}
export const PUBLISH_STATUS = { accepted: 'accepted', duplicate: 'duplicate', disabled: 'disabled' }
/** X3: '<bundle>/<entry id>/<source id>'. */
export const SOURCE_IDENTITY = (bundle, entry, id) => bundle + '/' + entry + '/' + id
/** X9: keys of state.sources and of one source. */
export const SOURCES_KEYS = ['sources']
export const SOURCE_KEYS = ['enabled', 'identity', 'plugin', 'title']
/** X4/X5: the title bound in characters, the dedupe key bound in bytes, the source title and description bounds in bytes. */
export const SOURCE_BOUNDS = { eventTitleChars: 120, dedupeKeyBytes: 256, sourceTitleBytes: 200, descriptionBytes: 1024, idChars: 64 }
export const PLUGIN_INTAKE_KIND = 'plugin'
/**
 * X5 (review update, P8 L2): the notice summary names the source's registered title, JSON-quoted;
 * DSH bounds a summary to 120 characters. The event title stays inside the untrusted block only.
 */
export const SOURCE_SUMMARY = (sourceTitle) => 'Plugin event: ' + JSON.stringify(sourceTitle)
export const SUMMARY_MAX_CHARS = 120
/** X9: client strings. */
export const SOURCE_UI = { section: 'Plugin sources', queueLabel: 'Plugin event' }

export const MS = { boot: 45000, live: 20000, turn: 20000, stop: 20000, poll: 100, sseFirstFrame: 3000, sseChange: 8000 }

// ---- Unread replies from Fishball ----
/** R1/R5: the snapshot's unread object, and the stored record (domain fishball, table 'unread', key 'assistant'). */
export const UNREAD = { keys: ['count'], table: 'unread', key: 'assistant', recordKeys: ['changedAt', 'count', 'sessionId'] }
/** R8: strings the served client bundle must carry (the browser half is otherwise manual, see CASES.md). */
export const UNREAD_UI = { badgeAttr: 'data-fishball-badge', openLabel: 'Open Fishball', reducedMotion: 'prefers-reduced-motion' }

// ---- P11 (Messenger look, revision 9) ----
/** R1/R3: the built-in catalog entry, its package and the route that serves its browser file. */
export const MESSENGER = {
  key: 'builtin:messenger', title: 'Messenger look',
  packageName: 'dsh-fishball-messenger', moduleId: 'dsh-fishball-messenger',
  dir: path.join(REPO, 'packages', 'messenger'),
  clientFile: path.join(REPO, 'packages', 'messenger', 'client.js'),
  packageFile: path.join(REPO, 'packages', 'messenger', 'package.json'),
  filesEntry: 'packages/messenger/',
  packed: ['packages/messenger/package.json', 'packages/messenger/client.js'],
  route: '/api/fishball/messenger/client.js',
  contentType: 'text/javascript; charset=utf-8',
  cacheControl: 'no-store',
}
/** R2: keys of state.look once the catalog exists. */
export const LOOK_KEYS = ['messenger']
/** R4: author kinds and the keys an author may carry. */
export const AUTHOR_KIND = { session: 'session', user: 'user', watch: 'watch', approval: 'approval', plugin: 'plugin', system: 'system' }
export const AUTHOR_KEYS = ['kind', 'name', 'seed']
/** R4: an author name is at most this many UTF-8 bytes, the ellipsis included. */
export const AUTHOR_NAME_MAX_BYTES = 200
/** P11: raises DSH's title cap (80 bytes in dsh-base) so titles longer than the author bound can exist. */
export const TITLE_ENV = { FBTEST_TITLE_MAX_BYTES: '1024' }
/** P11: the last commit before P11's implementation (an install from before this phase). */
export const PRE_MESSENGER = { commit: 'e221d23' }
