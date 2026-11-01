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
  leak: { name: 'fbtest-leak', tool: 'leak_echo', dir: fixtureDir('fbtest-leak'), service: 'fbtestLeaked' },
  leakB: { name: 'fbtest-leak-b', tool: 'leak_b_echo', dir: fixtureDir('fbtest-leak-b'), service: 'fbtestLeakedB' },
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

/**
 * Revision 11 rev11-limits (DESIGN §16 "Hard-coded limits moved to config", table "Today's constants"):
 * the sixteen fields added to the fishball row's config, with today's value as the default. Every
 * value is a whole number of at least 1 (§16 "Rules"), except replyCapShare, whose minimum is 2 (user's
 * decision 2026-11-01: the automatic reply cap is never more than half the window); `old` is the
 * constant's name in "Today in code".
 */
export const LIMITS_R11 = {
  requestUserMessageBytes: { default: 2048, min: 1, old: 'APPROVAL.userMessageBytes' },
  rationaleChars: { default: 500, min: 1, old: 'APPROVAL.rationaleChars' },
  approvalsShown: { default: 20, min: 1, old: 'APPROVAL.shown' },
  intakeRowsShown: { default: 20, min: 1, old: 'INTAKE.snapshotRows' },
  outboxShown: { default: 20, min: 1, old: 'OUTBOX_SHOWN' },
  watchesShown: { default: 50, min: 1, old: 'WATCH.shown' },
  readSessionMessages: { default: 12, min: 1, old: 'WATCH.readMessages' },
  readSessionBytes: { default: 12288, min: 1, old: 'WATCH.readBytes' },
  forwardExcerptBytes: { default: 3072, min: 1, old: 'SESSION_INFO.excerptBytes' },
  pluginHistoryShown: { default: 10, min: 1, old: 'PLUGIN_MANAGER.historyEntries' },
  settingsPromptValueBytes: { default: 200, min: 1, old: 'PLUGIN_MANAGER.promptValueBytes' },
  replyCapShare: { default: 8, min: 2, old: 'CONTEXT.outputShare' },
  headroomShare: { default: 8, min: 1, old: 'CONTEXT.headroomShare' },
  minWindowTokens: { default: 4096, min: 1, old: 'CONTEXT.minWindowTokens' },
  pluginManagerStartMs: { default: 30000, min: 1, old: 'FISHBALL_PACKAGES.managerStartMs' },
  defaultReplyCapTokens: { default: 32000, min: 1, old: 'CONTEXT.outputMax' },
}
/** rev11-limits: package-operation constants removed in favour of DSH's plugin-manager settings (§16 "Values that stay constants"). */
export const REMOVED_PACKAGE_CONSTANTS = ['FISHBALL_PACKAGES.outputBytes', 'FISHBALL_PACKAGES.idleTimeoutMs', 'FISHBALL_PACKAGES.lockWaitMs', 'FISHBALL_PACKAGES.lookupTimeoutMs']
/** rev11-limits: constants that stay (§16 "Values that stay constants"), by the name the table gives. */
export const STAYING_CONSTANTS = ['maxTimerMs', 'HOUR_MS', 'idPattern', 'dshDefaults', 'minCapTokens', 'dedupeKeyBytes', 'descriptionBytes', 'sourceTitleBytes', 'nameBytes', 'maxSubagentDepth', 'resumeAttempts', 'resumeRetryMs', 'maxAttempts', 'modelInfoTimeoutMs', 'SEQ_DIGITS', 'DIGEST_HEX_CHARS', 'WORDS_PER_TOKEN', 'ROUNDING_GUARD', 'FIBER_ACTIVE']

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
  pluginsRemove: '/api/fishball/plugins/remove',
  /** Revision 10a removes this route (it handed the spec to Fishball's chat); tests expect it absent. */
  removedPluginsInstall: '/api/fishball/plugins/install',
  /** A path no route serves: what DSH answers for an unknown path under /api/fishball. */
  unknownRoute: '/api/fishball/fbtest-no-such-route',
}

// ---- P5 (messaging, intake, outbox) ----
/** P5: the state snapshot's 11 keys; P6 adds 'watches' (12), P7 'approvals' (13), P8 'sources' (14), unread replies 'unread' (15), brand icon 'preferences' (16). */
/** P11 R2 adds 'look' (17). */
/** Revision 10c adds 'features' (18). Revision 11 rev11a adds 'managed' (19, DESIGN §10e "Snapshot"); rev11c adds 'pile' (20). The tag records the Host publishes (§9 "Tag records") may add a 'tags' key, whose name the design leaves open: tests drop it before comparing (STATE_KEYS_OPTIONAL). */
export const STATE_KEYS = ['approvals', 'catalog', 'contextWindow', 'cwd', 'error', 'features', 'grants', 'hiddenTools', 'intake', 'limits', 'look', 'managed', 'outbox', 'pile', 'preferences', 'sessionId', 'sources', 'status', 'unread', 'watches', 'workspaceId']
/** Brand icon feature (DESIGN §9/§10 1b): state.preferences = {brandStyle}, default 'fishball'. */
export const STATE_KEYS_OPTIONAL = ['tags']
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
/**
 * start_session names the session it starts (R1-R7): the refusal code for a missing title, the `titleError`
 * values of an ok result whose naming failed, and a plain title every start_session case that is not about
 * titles passes (DSH keeps it as given: single line, short, no edge whitespace).
 */
export const TITLE = { refused: 'no-title', unavailable: 'title-unavailable', invalid: 'title-invalid', failed: 'title-failed', plain: 'Fbtest started session' }
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
/** P12 (plugin manager) adds get_plugin_settings and set_plugin_settings. */
export const FISHBALL_TOOLS = ['list_plugins', 'set_plugin_enabled', 'add_plugin', 'remove_plugin', 'get_plugin_settings', 'set_plugin_settings']
export const KIND = { profile: 'profile', only: 'fishball-only', builtin: 'builtin', installed: 'fishball-installed' }
/** Revision 10c adds other-sessions: message_fishball, registered for every other session and never visible to Fishball. */
export const TOOL_STATUS = { visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked', otherSessions: 'other-sessions' }
export const CHANGED_BY = { fishball: 'fishball', user: 'user' }
export const CATALOG_KEYS = ['allowedTools', 'otherTools', 'plugins']
/**
 * Plugin statuses feature: every entry also has actions, removing and status (12 keys).
 * P12 (DESIGN §10d "Host API") adds dsh, runs, packageName, version, description, meta, hasIcon and settings (20 keys).
 * Revision 10b adds blocked (21 keys).
 */
export const PLUGIN_KEYS = ['actions', 'applied', 'blocked', 'changedBy', 'description', 'dsh', 'hasIcon', 'kind', 'lastError', 'meta', 'on', 'packageName', 'plugin', 'removing', 'runs', 'settings', 'status', 'title', 'tools', 'version', 'waiting']
/** Plugin statuses feature: the status of a catalog entry and the actions it offers. */
export const PLUGIN_STATUS = { installed: 'installed-in-fishball', dshEnabled: 'dsh-enabled', dshDisabled: 'dsh-disabled', builtin: 'builtin' }
export const ACTION = { enable: 'enable', disable: 'disable', uninstall: 'uninstall' }
/** The catalog key of a Fishball-installed plugin is this prefix + its package name. */
export const INSTALLED_KEY = (name) => 'fishball:' + name
/** Fishball's own package folder (a pnpm project), separate from the DSH profile (implementer's answer). */
export const FISHBALL_PLUGINS_DIR = (home) => path.join(home, 'profiles', '.fishball-plugins')
/** add_plugin install-failed reasons named by the requirements. */
export const INSTALL_REASON = { invalidSpec: 'invalid-spec', alreadyInstalled: 'already-installed', notBundle: 'not-bundle' }
/**
 * Revision 10a (DESIGN §10d "Install for Fishball"): every code an install refusal may carry (the route's 409 code,
 * add_plugin's reason). cancelled and build-blocked are new with DSH's inherited install process.
 */
export const PACKAGE_ERRORS = ['invalid-spec', 'already-installed', 'not-bundle', 'ambiguous-install', 'incompatible-version', 'cancelled', 'build-blocked', 'operation-error', 'no-profile']
export const INSTALL_API = { inspect: '/api/fishball/install/inspect', install: '/api/fishball/install', cancel: '/api/fishball/install/cancel' }
/** Revision 10a Refresh: read Fishball's plugin list again ({}). */
export const REFRESH_API = '/api/fishball/plugins/refresh'
/** A bundle a test links into the profile while DSH runs, outside DSH's plugin manager (no change event). */
export const REFRESH_BUNDLE = { name: 'fbtest-refresh', dir: path.join(SUPPORT, 'fixtures', 'fbtest-refresh') }
/** DSH's cancel answers and inspection statuses and problems (dsh-plugin-manager types). */
export const CANCEL_OUTCOMES = ['cancelled', 'too-late', 'not-running']
export const INSPECT_STATUS = { accepted: 'accepted', refused: 'refused' }
export const INSPECT_PROBLEM = { notFound: 'not-found', notAPackage: 'not-a-package', notABundle: 'not-a-bundle', invalidSpec: 'invalid-spec' }
/** DSH's progress events, each carrying the request id the caller chose. */
export const INSTALL_EVENTS = { state: 'plugin-manager/install-state', log: 'plugin-manager/install-log' }
export const ADD_ACTION = 'add'
/** A local package without a DSH bundle patch (add_plugin refuses it as not-bundle). */
export const NOT_BUNDLE = { name: 'fbtest-notbundle', dir: path.join(SUPPORT, 'fixtures', 'fbtest-notbundle') }
/** The previous version of the plugin, for the existing-install cases. */
export const OLD_VERSION = { commit: 'f368ad2' }
/** Post-review: the only values lastError may take (besides null). */
export const LAST_ERRORS = ['edits-other-rows', 'no-rows', 'row-failed', 'leaks-service', 'no-profile', 'row-id-conflict', 'limit-reached']
/**
 * Revision 10b (DESIGN §4 "Known before trying", §10d): why a package plugin cannot run in Fishball's tree,
 * the catalog entry's `blocked` (null otherwise). The first three come from its patch, known when the list is read;
 * leaks-service once Fishball turned it off for publishing a service, until it is reinstalled.
 */
export const BLOCKED = { editsOtherRows: 'edits-other-rows', noRows: 'no-rows', noProfile: 'no-profile', leaksService: 'leaks-service' }
/** Revision 10b, S32: DSH's own optional bundles whose patch edits other rows (blocked when the installation ships them). */
export const DSH_BLOCKED_BUNDLES = ['agent-team-profile', 'session-titles-bundle'].map((n) => '@deepseek-ai/dsh-experimental-' + n)
/** Revision 10b: a self-contained package whose patch edits another row, installed for Fishball only (blocked, uninstallable). */
export const INSTALLED_EDITS_BUNDLE = { name: 'fbtest-installed-edits', dir: fixtureDir('fbtest-installed-edits') }
/** Revision 10b: a self-contained package that provides a service of its own, installed into the profile while DSH runs (reinstall clears leaks-service). */
export const INSTALLED_LEAK_BUNDLE = { name: 'fbtest-installed-leak', dir: fixtureDir('fbtest-installed-leak'), service: 'fbtestInstalledLeaked' }
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
  /** A plugin whose rows publish a service into DSH's root realm is turned off with this lastError. */
  leaksService: 'leaks-service',
  /** Revision 10c (review M1): your off was written after Fishball decided not to ask; it must ask first. */
  askFirst: 'ask-first',
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
/**
 * P9: rubric phrases in Fishball's system prompt (rules 1-5 stay word for word in revision 11, DESIGN §7a.7).
 * Revision 11 removes "You cannot reject" (Q-r11-reject): it is in RUBRIC_REMOVED, never expected.
 */
export const RUBRIC = ['**Permission requests.**', 'Approve only if the user has allowed you to', 'With no such allowance, escalate at once', 'Low risk:', 'High risk:', 'When unsure, it is high risk', 'When you escalate, tell the user', 'If you started the requesting session or its current turn, approve only work the user asked for', 'answer_approval']
export const RUBRIC_REMOVED = ['You cannot reject']
/**
 * Revision 11 (§7a.7, Q-r11-reject-rubric): one operational line lets Fishball reject only when the call goes
 * beyond what the user asked that session AND is dangerous. Its wording is the implementer's, so the line is
 * found by meaning: it mentions rejecting, going beyond the user's request, and danger.
 */
export const REJECT_RULE = { reject: /reject/i, beyond: /beyond|outside|more than|not ask/i, danger: /dangerous|danger/i }

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

// ---- P12 (plugin manager, revision 10; DESIGN §10d) ----
/** P12: FBTEST_MANAGER=1 links the settings fixtures (MANAGER_BUNDLES) at the first boot of a home. */
export const MANAGER_ENV = { FBTEST_MANAGER: '1' }
export const MANAGER_API = { detail: '/api/fishball/plugins/detail', icon: '/api/fishball/plugins/icon', settings: '/api/fishball/plugins/settings' }
/**
 * P12 fixtures. settings: installed but not selected (fishball-only), two rows (one with every field
 * kind, one without a Config), a package description, version 1.2.3 and an icon. dsh: selected in
 * the profile (kind profile, on in DSH), with a Config. bad: fishball-only, its patch config fails its schema.
 */
export const MANAGER_BUNDLES = {
  settings: { name: 'fbtest-settings', dir: fixtureDir('fbtest-settings'), enabled: false, rows: { main: 'fbtest-settings', side: 'fbtest-settings-side' } },
  dsh: { name: 'fbtest-settings-dsh', dir: fixtureDir('fbtest-settings-dsh'), enabled: true, rows: { main: 'fbtest-settings-dsh' } },
  bad: { name: 'fbtest-settings-bad', dir: fixtureDir('fbtest-settings-bad'), enabled: false, rows: { main: 'fbtest-settings-bad' } },
  /** fishball-only; its patch gives the secret number `pin` a string, so the raw schema error would repeat it. */
  leak: { name: 'fbtest-settings-leak', dir: fixtureDir('fbtest-settings-leak'), enabled: false, rows: { main: 'fbtest-settings-leak' } },
}
/** P12: what the fbtest-settings fixture declares (its package.json, patch and Config). */
export const SETTINGS_FIXTURE = {
  version: '1.2.3',
  description: 'fbtest settings fixture: a Config with every field kind the plugin manager handles.',
  iconMarker: 'data-fbtest-icon="fbtest-settings"',
  /** The secret the patch sets, and one the user sets: neither may ever leave the Host. */
  patchSecret: 'fbtest-patch-secret-7f3a9c',
  /** The patch also sets a secret inside the nested group auth. */
  nestedSecret: 'fbtest-patch-secret-nested-2d81',
  /** ... and one inside the list of objects accounts. */
  listSecret: 'fbtest-patch-secret-list-90c4',
  /** The secret fbtest-settings-leak's patch puts where a number belongs. */
  errorSecret: 'fbtest-secret-in-error-e61b',
  /** A rejected value a save sends: no answer may repeat it. */
  rejected: 'fbtest-rejected-data-77d2',
  /** Schemastery repeats the rejected data after this; the Host cuts the message before it. */
  errorCut: ' but got ',
  userSecret: 'fbtest-user-secret-41be0d',
  /** A greeting that makes the row's apply throw (a valid value that fails to mount). */
  failGreeting: 'boom',
  /** The row's own resolved config (patch config over the schema defaults), secret removed. */
  base: { greeting: 'hello', limit: 3, enabled: false, mode: 'fast', live: 'one', nested: { a: 'x', b: 1 }, tags: ['a', 'b'], servers: [], auth: { user: 'u' }, accounts: [{ name: 'a1' }] },
  limit: { min: 1, max: 10 },
  /** Leaf field paths get_plugin_settings must list (dotted); servers (a list of objects) is not asserted. */
  fields: ['greeting', 'limit', 'enabled', 'mode', 'token', 'live', 'nested.a', 'nested.b', 'tags', 'auth.user', 'auth.key'],
  secretPath: ['token'],
  /** Every secret field's dotted path, and the one field with a fixed list of values and its choices. */
  secretPaths: ['accounts.0.secret', 'auth.key', 'token'],
  /** The secret fields get_plugin_settings lists (with set); accounts holds secrets but is not one. */
  secretFields: ['auth.key', 'token'],
  choiceField: { path: 'mode', choices: ['fast', 'slow'] },
}
/** P12 snapshot enums (DESIGN §10d "Host API"). */
/** Revision 10c adds fishball: Fishball's own plugins (the first group, with the Messenger look). */
export const DSH_STATE = { on: 'on', off: 'off', builtin: 'builtin', none: 'none', fishball: 'fishball' }
export const RUNS = { everywhere: 'everywhere', dsh: 'dsh', fishball: 'fishball', nowhere: 'nowhere' }
export const SETTINGS_STATE = { unused: 'unused', none: 'none', changed: 'changed', default: 'default' }
/** P12 route and tool codes. */
export const MANAGER_CODE = {
  badBody: 'bad-body', unknown: 'unknown', sharedWithDsh: 'shared-with-dsh', noSettings: 'no-settings', invalid: 'invalid',
  unknownPlugin: 'unknown-plugin', unknownRow: 'unknown-row', secretField: 'secret-field', noChange: 'no-change', rejected: 'rejected',
}
export const DETAIL_KEYS = ['history', 'plugin', 'rows', 'settings', 'shared']
export const DETAIL_ROW_KEYS = ['base', 'editable', 'error', 'module', 'row', 'schema', 'secrets', 'user', 'value']
export const HISTORY_KEYS = ['action', 'at', 'by', 'outcome']
export const HISTORY_MAX = 10
export const SETTINGS_TOOLS = { get: 'get_plugin_settings', set: 'set_plugin_settings' }
export const GET_FIELD_KEYS = ['changed', 'description', 'kind', 'path', 'pluginValue', 'secret', 'value']
/** A field with a fixed list of values also carries `choices` (DESIGN §10d, coordinator's decision on A120). */
export const GET_CHOICE_FIELD_KEYS = ['changed', 'choices', 'description', 'kind', 'path', 'pluginValue', 'secret', 'value']
export const GET_SECRET_FIELD_KEYS = ['changed', 'description', 'kind', 'path', 'secret', 'set']
/** set_plugin_settings' prompt: each changed field as `path: old → new`, each value as JSON cut to this many bytes. */
export const PROMPT_ARROW = ' → '
export const PROMPT_VALUE_BYTES = 200
/** The audit action of a settings change, and the outcome of one that went through (or was rejected). */
export const SETTINGS_ACTION = 'settings'
export const AUDIT_OUTCOME = { ok: 'ok', rejected: 'rejected' }
/** The Compaction built-in and its engine row, whose config is the context-window policy (§6, S29). */
export const COMPACTION = { plugin: 'builtin:compaction', engineRow: 'compaction-basic' }
/** Stored values: domain fishball, table plugin_settings (§9). */
export const SETTINGS_TABLE = 'plugin_settings'
/** Private-tree row ids carry this prefix (DESIGN §4 "Row ids"): fbo-<bundle>--<row>. */
export const PRIVATE_ROW_PREFIX = 'fbo-'

// ---- Revision 10c (Fishball's own plugins; DESIGN §10d "Fishball's own plugins", Q-own-plugins) ----
/**
 * The four new built-in plugins that hold every tool Fishball registers. `feature` names the snapshot's
 * features field that is true while the plugin runs (desired on AND applied).
 */
export const OWN_PLUGINS = {
  // Revision 11 rev11a: release_session joins Session messages (DESIGN §5e "Which Fishball plugin", §10d).
  messages: { key: 'builtin:session-messages', title: 'Session messages', feature: 'messages', tools: ['message_session', 'start_session', 'message_fishball', 'release_session'] },
  watching: { key: 'builtin:session-watching', title: 'Session watching', feature: 'watching', tools: ['watch_session', 'list_watches', 'unwatch_session', 'read_session'] },
  plugins: { key: 'builtin:plugin-management', title: 'Plugin management', feature: 'plugins', tools: ['list_plugins', 'set_plugin_enabled', 'add_plugin', 'remove_plugin', 'get_plugin_settings', 'set_plugin_settings'] },
  // Revision 11 rev11b: ask_fishball and list_user_messages belong to Permission requests, for managed sessions only (§5e, §7a.2).
  approvals: { key: 'builtin:permission-requests', title: 'Permission requests', feature: 'approvals', tools: ['answer_approval', 'ask_fishball', 'list_user_messages', 'list_grants', 'revoke_grant'] },
}
/** The five entries of the "Fishball" group (snapshot dsh 'fishball'): the four above and the Messenger look. */
export const FISHBALL_GROUP_KEYS = [...Object.values(OWN_PLUGINS).map((p) => p.key), 'builtin:messenger']
/** The snapshot's features object. */
export const FEATURE_KEYS = ['approvals', 'messages', 'plugins', 'watching']
/** Route answer (409) and watchError when the feature's plugin is off. */
export const FEATURE_OFF = 'feature-off'
/** The words of the permission request Fishball raises before it turns one of its own plugins on. */
export const OWN_ASK = 'Fishball asks to turn on'
/** The last commit before revision 10c (an install from before Fishball's own plugins). */
export const PRE_OWN_PLUGINS = { commit: '90a6a8c' }

// ---- Revision 11 rev11a (managed sessions; DESIGN §5b, §5e, §7a.1, §9, §10e) ----
/** Hand over / Take back: POST {sessionId, managed: boolean} (§10e "Host API"). */
export const MANAGED_API = '/api/fishball/managed'
/**
 * The snapshot's managed entries: exactly these keys (§10e "Snapshot"). The rev11a follow-up adds `title`
 * (the session's current DSH title, null while unknown): managed: [{sessionId, title, since, by}].
 */
export const MANAGED_ENTRY_KEYS = ['by', 'sessionId', 'since', 'title']
/** The ways in that rev11a builds, as the registry's `by` names them (§9; prompt-answer comes with rev11e). */
export const MANAGED_BY = { start: 'start', message: 'message', handOver: 'hand-over', send: 'send' }
/** The route's 409 codes (§10e). */
export const MANAGED_CODE = { unknownSession: 'unknown-session', isFishball: 'is-fishball', featureOff: 'feature-off', unavailable: 'unavailable' }
/** Source identity of the note a hand-over, take-back or release sends Fishball (§5e item 5). */
export const MANAGED_IDENTITY = (sessionId) => 'fishball/managed/' + sessionId
/** Fishball's tool that ends management (§5e item 4). */
export const RELEASE_TOOL = 'release_session'
/** DSH's own refusal of a tool the calling session cannot see (S34: `Error: unknown tool "<name>"`, UNKNOWN_TOOL). */
export const UNKNOWN_TOOL_TEXT = /unknown tool|UNKNOWN_TOOL/i
/** The client's labels beside Send to Fishball (§10, item 3; §10e). */
export const MANAGED_LABELS = { handOver: 'Hand over to Fishball', takeBack: 'Take back from Fishball' }
/**
 * rev11a follow-up (§10e "Settings page"): the Permission requests section's managed-sessions list. The heading
 * and the by-tags are the wording the coordinator stated; Take back reuses MANAGED_LABELS.takeBack and an empty
 * list shows the page's usual empty line.
 */
export const MANAGED_LIST_LABELS = {
  heading: 'Managed sessions',
  empty: 'Nothing yet',
  by: { 'hand-over': 'Handed over by you', send: 'Sent by you', message: 'Messaged by Fishball', start: 'Started by Fishball' },
}
/** The commit before rev11a (an install from before managed sessions existed). */
export const PRE_REV11A = { commit: 'a5aed26' }
/** Item 3: nothing in a session that is yours mentions Fishball. Case-sensitive, because the test homes sit under the lowercase dsh-fishball checkout path. */
export const FISHBALL_WORD = /Fishball/

// ---- Revision 11 rev11b (asking Fishball first, passes, direct calls; DESIGN §7a.1-§7a.6, §9, §16; S35) ----
/** The two tools rev11b adds to each managed agent, beside message_fishball (§7a.2, §5e). */
export const ASK_FISHBALL = 'ask_fishball'
export const LIST_USER_MESSAGES = 'list_user_messages'
export const MANAGED_TOOLS = [INBOUND_TOOL, ASK_FISHBALL, LIST_USER_MESSAGES]
/**
 * ask_fishball's result codes (§7a.2; contract given to the test writer). The interim `to-user` answer of rev11b is gone: from rev11c an escalated or timed-out request waits on a card. `ok` is true only for `allowed`.
 */
export const ASK_CODE = {
  allowed: 'allowed', rejected: 'rejected', question: 'question', unavailable: 'unavailable',
  overCapacity: 'over-capacity', noLongerManaged: 'no-longer-managed',
  notUserMessage: 'not-user-message', tooLarge: 'too-large', expired: 'expired',
}
/** Codes refused before anything is sent: no request id, no Fishball step (§7a.2). */
export const ASK_REFUSALS = [ASK_CODE.notUserMessage, ASK_CODE.tooLarge, ASK_CODE.expired]
/** answer_approval's four rev11b decisions (§7a.3; grant is rev11d) and its new refusal code. */
export const DECISION = { allow: 'allow', reject: 'reject', ask: 'ask', escalate: 'escalate' }
export const QUESTION_REQUIRED = 'question-required'
/** S35 wording, appended to an allowed direct call's own output and following Fishball's reject reason (§7a.4). */
export const HINT_NEXT = 'Next time, call ask_fishball before a call that needs approval, and explain why it is needed.'
export const HINT_ALLOWED = 'Fishball approved this call once. ' + HINT_NEXT
export const ALLOWED_TEXT = (output) => output + '\n\n' + HINT_ALLOWED
export const REJECTED_TEXT = (reason) => 'Fishball rejected this call: ' + reason + '\n' + HINT_NEXT
/** DSH's own wording that the rewrite replaces (S35). */
export const DSH_REJECT_WORDS = 'the user rejected'
/** The body of the asking fixture tool returns 'outcome=<DSH outcome>' (worker.mjs). */
export const ASK_OUTPUT = (outcome) => 'outcome=' + outcome
/** rev11b's new limits (§16 "Revision 11's new limits"): plugin config of the fishball row. */
export const LIMITS_R11B = {
  userMessagesListed: { default: 20, min: 1 },
  userMessageExcerptChars: { default: 1000, min: 1 },
}
/** Audit (§9 "Revision 11 additions"): approvals rows' kind and answers, and the decisions rows your clicks add. */
export const AUDIT_KIND = { asked: 'asked', direct: 'direct' }
export const AUDIT_ANSWER = { allow: 'allow', reject: 'reject', ask: 'ask', escalate: 'escalate', timeout: 'timeout', pass: 'pass', released: 'released', withdrawn: 'withdrawn' }
export const DECISION_ACTION = { allowOnce: 'allow-once', reject: 'reject' }
export const DECISIONS_TABLE = 'decisions'
/** A message source the web prompt records: kind 'user' with an rpc id (DSH's "user-rpc" source, dsh-api-session-controller). */
export const USER_RPC_SOURCE = { kind: 'user', rpcId: 'rpc-fbtest', clientTimeZone: 'UTC' }
/**
 * A scripted tool argument with exactly this value becomes the newest apr_<hex> id seen in the session's
 * conversation (fixtures/fake-llm.mjs), so a script can continue a request minted during the turn.
 */
export const REQUEST_PLACEHOLDER = '$fbtest:last-request-id'

// ---- Revision 11 rev11c (your pile, buttons in both places, tags; DESIGN §7a.6, §9, §10e, §16; S37) ----
/** Allow once / Reject on a card: POST {requestId, decision: 'allow'|'reject', note?} (§10e "Host API"); 409 `expired` when the card already left. */
export const PILE_API = { answer: '/api/fishball/requests/answer' }
export const PILE_CODE = { expired: 'expired', badBody: 'bad-body' }
/** The user's two decisions on a card. */
export const CLICK = { allow: 'allow', reject: 'reject' }
/** Card kinds (§9 "Session cards"); rev11c builds 'asked' only (direct calls come with rev11e, questions with rev11g). */
export const CARD_KIND = { asked: 'asked', direct: 'direct', question: 'question' }
/** Keys every card of an ask_fishball request carries (§9; callId is what S37's running-row buttons match on). */
export const CARD_KEYS = ['arguments', 'callId', 'kind', 'requestId', 'sessionId', 'since', 'toolName', 'why']
/** rev11c's new limit (§16 "Revision 11's new limits"): plugin config, whole number of at least 1 (§16 "Rules"). */
export const LIMITS_R11C = { pileMaxHeightVh: { default: 45, min: 1 } }
/** Tag records (§9 "Tag records"): table `tags` of the fishball domain, rows {sessionId, callId, seq, answer, kind, at}. */
export const TAGS_TABLE = 'tags'
export const TAG_KIND = { approval: 'approval', sentToYou: 'sent-to-you' }
export const TAG_KEYS = ['answer', 'at', 'callId', 'kind', 'seq', 'sessionId']
/** Fishball's own request returns this code when the pile is full (§7a.6, Q-r11-cap-own). */
export const TOO_MANY_WAITING = 'too-many-waiting'

// ---- Revision 11 rev11d (standing grants; DESIGN §7a.3, §7a.8, §9, §10e; requirements items 17-19) ----
/** answer_approval's fifth decision (the DECISION table above is rev11b's four). */
export const GRANT_DECISION = 'grant'
/** Fishball's grant tools (§7a.8). */
export const GRANT_TOOLS = { list: 'list_grants', revoke: 'revoke_grant' }
/** Grant kinds (§7a.8, §9). */
export const GRANT_KIND = { exact: 'exact', prefix: 'prefix' }
/** The user's Revoke: POST {grantId}; 409 `unknown` or `ended` (§10e). */
export const GRANT_API = { revoke: '/api/fishball/grants/revoke' }
/** Table `grants` of the fishball domain (§9) and its statuses. */
export const GRANTS_TABLE = 'grants'
export const GRANT_STATUS = { active: 'active', expired: 'expired', revoked: 'revoked', ended: 'ended' }
/** `endedBy` values (§9). */
export const GRANT_ENDED_BY = { user: 'user', fishball: 'fishball', expiry: 'expiry', takeBack: 'take-back', release: 'release' }
/** decisions-table actions rev11d adds (§9 "Fishball's other decisions"): grant, revoke. */
export const GRANT_ACTION = { grant: 'grant', revoke: 'revoke' }
/** Audit answers rev11d adds to the approvals rows (§9 "Audit"). */
export const GRANT_AUDIT = { grant: 'grant', used: 'grant-used' }
/** A tag record made for a call a grant covered (§9 "Tag records"). */
export const GRANT_TAG_KIND = 'grant'
/** run_code is a DSH built-in that only exists in PTC mode and cannot be a fixture here; demo_echo stands in for "every other tool" (exact-only). */
/** Tools that accept prefix grants (shell commands only, §7a.8, Q-r11-prefix-tools), and tools that get exact grants only. */
export const PREFIX_TOOLS = ['bash', 'pwsh', 'terminal_send']
/** terminal_open has no command text (the manager's decision, 2026-11-02): exact-call grants only. */
export const EXACT_ONLY_TOOLS = ['demo_echo', 'fbtest_ask', 'terminal_open']
/** The fixture tools that ask for approval in their body (fixture-tools.mjs). */
export const ASKING_SHELL_ENV = { FBTEST_ASKING_TOOLS: PREFIX_TOOLS.concat('demo_echo', 'terminal_open').join(',') }
