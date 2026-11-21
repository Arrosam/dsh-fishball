/**
 * Shared test vocabulary for the Fishball P2 black-box suite. Values come from
 * the P2 requirements given to the test author (see test/CASES.md), never from
 * the implementation.
 */
import os from 'node:os'
import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..')
export const NODE = '/opt/homebrew/bin/node'
export const DSH_VERSIONS = process.env.FBTEST_DSH_VERSIONS ?? path.join(os.userInfo().homedir, 'Library', 'Application Support', 'DSH', 'data', 'versions')
export const RUNTIME = process.env.FBTEST_DSH_RUNTIME ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules'
/**
 * Root of the throwaway DSH homes. FBTEST_TEST_HOMES moves it (e.g. under the OS temp dir, so a
 * baseline run writes no home into the checkout); it must still end in `.runtime/test-homes`,
 * because run.mjs's delete guard and the worker's home check both require that suffix.
 * The default is process-isolated outside Git: native child preflight rejects Git ancestors.
 */
export const TEST_HOMES = process.env.FBTEST_TEST_HOMES ?? path.join(os.tmpdir(), 'fbtest-' + process.pid, '.runtime', 'test-homes')
export const REQUIRED_RELEASE = Object.freeze({ env: 'FBTEST_RELEASE_REQUIRED', on: '1' })
export const SUPPORT = import.meta.dirname
export const WORKER = path.join(SUPPORT, 'worker.mjs')

/** Profile created inside each throwaway DSH_HOME (never a shipped profile name). */
export const PROFILE = 'fbtest'
/**
 * After M1 (docs/package-layout.md) the repository holds two plugin packages and the root is not a
 * plugin. The connector carries the row, client and settings namespace the host cases exercise;
 * the instance is the built-in Fishball. Both are linked into every test profile.
 * The npm name is dsh-agent-connector (the user, 2026-11-17); its folder, row id and settings
 * namespace stay dsh-connector.
 */
export const CONNECTOR = { name: 'dsh-agent-connector', dir: path.join(REPO, 'packages', 'dsh-connector') }
export const INSTANCE = { name: 'dsh-instance', dir: path.join(REPO, 'packages', 'dsh-instance') }
/**
 * V3 R-SHARED (R-ARCH-08, one library per side since requirements 1.40 / SPLIT-SHARED): the libraries
 * the packages import by name. `dsh-connector-shared` is the DSH side's (the instance and the connector
 * import it); `fishball-shared` the Fishball side's (core imports it). Neither is a plugin: each is
 * linked as a plain dependency, never added to the profile's bundles. `folder` is the package folder
 * under `packages/` of whichever checkout is linked (FBTEST_PLUGIN_DIR may name another one).
 */
export const SHARED = { name: 'fishball-shared', folder: 'shared', dir: path.join(REPO, 'packages', 'shared') }
export const DSH_SHARED = { name: 'dsh-connector-shared', folder: 'dsh-connector-shared', dir: path.join(REPO, 'packages', 'dsh-connector-shared') }
/** Both libraries; a checkout that predates one of them simply has no folder for it. */
export const LIBRARIES = Object.freeze([DSH_SHARED, SHARED])
/**
 * V3 R-CORE: `fishball-core`, home of the slim child and ui, the persona and the fishball-ui page
 * packages. Nothing imports it by name (the instance copies it by path), so it is never linked.
 */
export const CORE = { name: 'fishball-core', dir: path.join(REPO, 'packages', 'core') }
/**
 * V3 R-EMBED: `dsh-connector-ui`, the only package with host-DSH UI. The V2 main clients moved into
 * its flat client chunks (DSH serves only `client.*.js` beside the `./client` entry).
 * V3 U-SHELL splits the moved connector UI, with no behaviour change, into the flat parts
 * `client.shell.js`, `client.marks.js` and `client.attention.js` (U-DRAW removed `client.records.js`: no inline records, requirements 1.41 Q-G4; v3-w3 briefs
 * F2 and Q-7; layout relayed by Fishball from dev/v3-u-shell `096da986`): the frame, the styles and
 * the page dictionaries (the card records' words included) are the shell's. Since I-HOST (QD1 = B) the
 * instance's card is its own settings page: `client.models.js` and `client.status.js` at the instance's root.
 */
export const EMBED_UI = Object.freeze({
  name: 'dsh-connector-ui',
  dir: path.join(REPO, 'packages', 'dsh-connector', 'ui'),
  clientDir: Object.freeze(['src', 'client']),
  connectorClient: path.join(REPO, 'packages', 'dsh-connector', 'ui', 'src', 'client', 'client.shell.js'),
  // I-HOST (QD1 = B): the card's model block is the instance's own settings page chunk now.
  instanceCard: path.join(REPO, 'packages', 'dsh-instance', 'client.models.js'),
  statusLine: path.join(REPO, 'packages', 'dsh-instance', 'client.status.js'),
})
export const PACKAGE_NAME = CONNECTOR.name
export const INSTANCE_NAME = INSTANCE.name
export const INSTANCE_ROW_ID = INSTANCE.name
export const SENTINEL_PRESET = 'fishball:assistant'

/** Fixture bundle linked into the test profile, before the plugin under test. */
export const FIXTURE_BUNDLE = { name: 'fbtest-tools', dir: path.join(SUPPORT, 'fixtures', 'fbtest-tools') }
/** FBTEST_BOOT_LOG=1: the overlay row that records every log line from boot on (fixtures/boot-log.mjs). */
export const BOOT_LOG = Object.freeze({ env: 'FBTEST_BOOT_LOG', on: '1', row: 'fbtest-boot-log', module: path.join(SUPPORT, 'fixtures', 'boot-log.mjs') })

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
  /** rev11g: sessions that can call ask_user_question (blocking, like the shipped presets) / the timed variant (default wait 120 s, per call `timeout`). */
  ask: 'fbtest-ask',
  askTimed: 'fbtest-ask-timed',
}

export const assistantDir = (home) => path.join(home, 'fishball', 'assistant')

/** R-COMPOSITION: names never shown to Fishball. */
export const HIDDEN_TOOLS = [
  'image_generate', 'video_generate', 'mover_move_session', 'create_worktree', 'git_worktree',
  'diff_approval_annotate', 'ralph', 'code_review_report', 'write', 'edit', 'str_replace_editor',
  'plugin_manager', 'subagent', 'subagent_fork', 'workflow', 'send_message', 'interrupt_agent',
  'spawn_teammate',
]
/**
 * P5: the state's hiddenTools also lists message_agent (Fishball's own inbound tool, hidden from
 * Fishball). It is not a fixture name: fbtest-tools never registers it.
 */
export const STATE_HIDDEN_TOOLS = [...HIDDEN_TOOLS, 'message_agent']

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
/** P5: the state snapshot's 11 keys; P6 adds 'watches' (12), P7 'approvals' (13), P8 'sources' (14), unread replies 'unread' (15), brand icon 'preferences' (16); rev11g 'questionMode' (DESIGN §10e snapshot). */
/** P11 R2 adds 'look' (17). */
/** Revision 10c adds 'features' (18). Revision 12 adds 'recommended' and 'welcome' (22, DESIGN §10f "Host API"). Revision 11 rev11a adds 'managed' (19, DESIGN §10e "Snapshot"); rev11c adds 'pile' (20). The tag records the Host publishes (§9 "Tag records") may add a 'tags' key, whose name the design leaves open: tests drop it before comparing (STATE_KEYS_OPTIONAL). */
export const STATE_KEYS = ['approvals', 'catalog', 'contextWindow', 'cwd', 'error', 'features', 'grants', 'hiddenTools', 'intake', 'limits', 'look', 'managed', 'modelSelection', 'outbox', 'pile', 'preferences', 'questionMode', 'recommended', 'sessionId', 'sources', 'status', 'unread', 'watches', 'welcome', 'workspaceId']
/** Brand icon feature (DESIGN §9/§10 1b): state.preferences = {brandStyle}, default 'fishball'. */
export const STATE_KEYS_OPTIONAL = ['tags']
export const PREFERENCES = { keys: ['brandStyle'], styles: ['fishball', 'deepseek'], defaultStyle: 'fishball' }
export const INTAKE_KEYS = ['failed', 'items', 'queued', 'wakeupsThisHour']
export const INTAKE_ITEM_KEYS = ['createdAt', 'errorCode', 'intakeId', 'kind', 'sourceIdentity', 'status']
export const INTAKE_KINDS = ['session', 'user', 'system']
/** M1/M4 (review update): the forward's notice summary. */
export const FORWARD_SUMMARY = 'The user forwarded a session'

// ---- P6 (watches) ----
export const WATCH_API = { add: '/api/fishball/watches', remove: '/api/fishball/watches/remove' }
/** W1: keys of state.watches and of one watch. */
export const WATCHES_KEYS = ['active', 'watches']
export const WATCH_KEYS = ['condition', 'createdAt', 'createdBy', 'firedCount', 'id', 'lastFiredAt', 'lastReason', 'mode', 'status', 'targetSessionId']
export const WATCH_CONDITIONS = ['finished', 'per-turn']
export const WATCH_MODES = ['once', 'repeat']
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
export const READ_ROLES = ['user', 'assistant']
/** Q-read-roles: the five labels read_session gives a message, from the source DSH recorded with it. */
export const READ_ROLE = { user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' }

/** P4 C1: keys of state.contextWindow, and its refusal codes (C3, C7). */
export const CONTEXT_WINDOW_KEYS = ['compactionOff', 'contextWindowTokens', 'effectiveWindow', 'error', 'maxOutputTokens', 'modelWindow', 'outputCap', 'pressureTokens', 'threshold']
export const CW_CODE = { windowTooSmall: 'window-too-small', outputTooLarge: 'output-too-large', modelWindowUnknown: 'model-window-unknown', unavailable: 'unavailable', badBody: 'bad-body' }
/** P4 review: a smaller window below this is always window-too-small; the summary word budget is floor(H * ratio). */
export const MIN_WINDOW = 4096
export const SUMMARY_WORDS_PER_TOKEN = 0.75
export const SUMMARY_HEADINGS = ['## Standing permissions', '## Commitments', '## Open loops', '## Watches', '## Preferences', '## Sources', '## Current conversation']

/** P3 R1: Fishball's own model tools. */
/** Plugin statuses: Fishball's own model tools (plugin statuses feature adds remove_plugin). */
/** P12 (plugin manager) adds get_plugin_settings and set_plugin_settings. */
export const FISHBALL_TOOLS = ['list_plugins', 'set_plugin_enabled', 'add_plugin', 'remove_plugin', 'get_plugin_settings', 'set_plugin_settings']
/** Revision 10c adds other-sessions: message_agent, registered for every other session and never visible to Fishball. */
export const TOOL_STATUS = { visible: 'visible', hidden: 'hidden', pluginOff: 'plugin-off', unchecked: 'unchecked', otherSessions: 'other-sessions' }
export const CHANGED_BY = { fishball: 'fishball', user: 'user' }
export const CATALOG_KEYS = ['allowedTools', 'otherTools', 'plugins']
/**
 * Plugin statuses feature: every entry also has actions, removing and status (12 keys).
 * P12 (DESIGN §10d "Host API") adds dsh, runs, packageName, version, description, meta, hasIcon and settings (20 keys).
 * Revision 10b adds blocked (21 keys).
 */
export const PLUGIN_KEYS = ['actions', 'applied', 'blocked', 'changedBy', 'description', 'dsh', 'hasIcon', 'kind', 'lastError', 'meta', 'on', 'packageName', 'plugin', 'removing', 'runs', 'settings', 'status', 'title', 'tools', 'version', 'waiting']
/** The catalog key of a Fishball-installed plugin is this prefix + its package name. */
export const INSTALLED_KEY = (name) => 'fishball:' + name
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

// ---- P7 (ApprovalBroker) ----
export const APPROVAL_PREFIX = /^\[permission request (apr_[0-9a-f]+)\]/
/** P1 block fields that appear only in their cases. */
export const APPROVAL_OPTIONAL_FIELDS = ['asked_by_subagent_session', 'call_was_to_tool']
/** P1: latest_user_message is cut to at most this many UTF-8 bytes. */
export const LATEST_USER_MAX_BYTES = 2048
/** P4-P6: the non-waking notes Fishball gets. */
export const APR_NOTE = {
  escalated: (id, outcome) => 'Fishball notice: permission request ' + id + " was escalated; the user's answer in that session: " + outcome,
  timeout: 'got no answer in time and went to the user',
  withdrawn: 'was withdrawn',
}
/** P8: state.approvals. */
export const APPROVALS_KEYS = ['pending', 'recent']
export const PENDING_KEYS = ['at', 'id', 'sessionId', 'toolName']
export const RECENT_KEYS = ['answer', 'argumentsStatus', 'at', 'decidedAt', 'finalOutcome', 'key', 'passBy', 'rationale', 'risk', 'sessionId', 'toolName']
export const RECENT_ANSWERS = ['allow', 'escalate', 'timeout', 'withdrawn']
export const FINAL_OUTCOMES = ['allowed-once', 'rejected', 'cancelled', 'unavailable']
export const RECENT_MAX = 20
/**
 * P9: rubric phrases in Fishball's system prompt (rules 1-5 stay word for word in revision 11, DESIGN §7a.7).
 * Revision 11 removes "You cannot reject" (Q-r11-reject): it is in RUBRIC_REMOVED, never expected.
 */
/** Rev11 pile list (P3): rule 4 no longer says "tell the user in one or two sentences"; the escalate note is one sentence for the user's card, so the rule reads "When you escalate, give a reason: ...". */
export const RUBRIC = ['**Permission requests.**', 'Approve only if the user has allowed you to', 'With no such allowance, escalate at once', 'Low risk:', 'High risk:', 'When unsure, it is high risk', 'When you escalate, give a reason', 'If you started the requesting session or its current turn, approve only work the user asked for', 'answer_approval']
export const RUBRIC_REMOVED = ['You cannot reject']
/**
 * Revision 11 (§7a.7, Q-r11-reject-rubric): one operational line lets Fishball reject only when the call goes
 * beyond what the user asked that session AND is dangerous. Its wording is the implementer's, so the line is
 * found by meaning: it mentions rejecting, going beyond the user's request, and danger.
 */
export const REJECT_RULE = { reject: /reject/i, beyond: /beyond|outside|more than|not ask/i, danger: /dangerous|danger/i }

export const MS = { boot: 45000, live: 20000, turn: 20000, stop: 20000, poll: 100, sseFirstFrame: 3000, sseChange: 8000 }
export const T = { timeout: 55000 }

// ---- Unread replies from Fishball ----
/** R1/R5: the snapshot's unread object, and the stored record (domain fishball, table 'unread', key 'assistant'). */
export const UNREAD = { keys: ['count'], table: 'unread', key: 'assistant', recordKeys: ['changedAt', 'count', 'sessionId'] }
/** R8: strings the served client bundle must carry (the browser half is otherwise manual, see CASES.md). */
export const UNREAD_UI = { badgeAttr: 'data-fishball-badge', openLabel: 'Open Fishball', reducedMotion: 'prefers-reduced-motion' }

// ---- P11 (Messenger look, revision 9) ----
/** R2: keys of state.look once the catalog exists. */
export const LOOK_KEYS = ['messenger']
/** R4: the keys an author may carry. */
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
export const PROMPT_VALUE_BYTES = 200
/** The outcome of a settings change that went through (or was rejected). */
export const AUDIT_OUTCOME = { ok: 'ok', rejected: 'rejected' }
/** The Compaction built-in and its engine row, whose config is the context-window policy (§6, S29). */
export const COMPACTION = { plugin: 'builtin:compaction', engineRow: 'compaction-basic' }

// ---- Revision 10c (Fishball's own plugins; DESIGN §10d "Fishball's own plugins", Q-own-plugins) ----
/** The snapshot's features object. */
export const FEATURE_KEYS = ['approvals', 'messages', 'plugins', 'watching']
/** Route answer (409) and watchError when the feature's plugin is off. */
export const FEATURE_OFF = 'feature-off'
/** The words of the permission request Fishball raises before it turns one of its own plugins on. */
export const OWN_ASK = 'Fishball asks to turn on'
/** The last commit before revision 10c (an install from before Fishball's own plugins). */
export const PRE_OWN_PLUGINS = { commit: '90a6a8c' }

// ---- Revision 11 rev11a (managed sessions; DESIGN §5b, §5e, §7a.1, §9, §10e) ----
/** Fishball's tool that ends management (§5e item 4). */
export const RELEASE_TOOL = 'release_session'
/**
 * rev11a follow-up (§10e "Settings page"): the Permission requests section's managed-sessions list. The heading
 * and the by-tags are the wording the coordinator stated; Take back is labelled 'Take back from Fishball' and an empty
 * list shows the page's usual empty line.
 */
export const MANAGED_LIST_LABELS = {
  heading: 'Managed sessions',
  empty: 'Nothing yet',
  by: { 'hand-over': 'Handed over by you', send: 'Sent by you', message: 'Messaged by Fishball', start: 'Started by Fishball' },
}
/** The commit before rev11a (an install from before managed sessions existed). */
export const PRE_REV11A = { commit: 'a5aed26' }

// ---- Revision 11 rev11b (asking Fishball first, passes, direct calls; DESIGN §7a.1-§7a.6, §9, §16; S35) ----
/**
 * A scripted tool argument with exactly this value becomes the newest apr_<hex> id seen in the session's
 * conversation (fixtures/fake-llm.mjs), so a script can continue a request minted during the turn.
 */
export const REQUEST_PLACEHOLDER = '$fbtest:last-request-id'

// ---- Revision 11 rev11c (your pile, buttons in both places, tags; DESIGN §7a.6, §9, §10e, §16; S37) ----
/** rev11c's new limit (§16 "Revision 11's new limits"): plugin config, whole number of at least 1 (§16 "Rules"). */
export const LIMITS_R11C = { pileMaxHeightVh: { default: 45, min: 1 } }
/** Tag records (§9 "Tag records"): table `tags` of the fishball domain, rows {sessionId, callId, seq, answer, kind, at}. */
export const TAGS_TABLE = 'tags'
export const TAG_KIND = { approval: 'approval', sentToYou: 'sent-to-you' }
export const TAG_KEYS = ['answer', 'at', 'callId', 'kind', 'seq', 'sessionId']
/** Fishball's own request returns this code when the pile is full (§7a.6, Q-r11-cap-own). */
export const TOO_MANY_WAITING = 'too-many-waiting'

// ---- Revision 11 rev11d (standing grants; DESIGN §7a.3, §7a.8, §9, §10e; requirements items 17-19) ----
/** Fishball's grant tools (§7a.8). */
export const GRANT_TOOLS = { list: 'list_grants', revoke: 'revoke_grant' }
/** Grant kinds (§7a.8, §9). */
export const GRANT_KIND = { exact: 'exact', prefix: 'prefix' }
/** The user's Revoke: POST {grantId}; 409 `unknown` or `ended` (§10e). */
export const GRANT_API = { revoke: '/api/fishball/grants/revoke' }
/** The statuses of a row of table `grants` of the fishball domain (§9). */
export const GRANT_STATUS = { active: 'active', expired: 'expired', revoked: 'revoked', ended: 'ended' }
/** `endedBy` values (§9). */
export const GRANT_ENDED_BY = { user: 'user', fishball: 'fishball', expiry: 'expiry', takeBack: 'take-back', release: 'release' }
/** decisions-table actions rev11d adds (§9 "Fishball's other decisions"): grant, revoke. */
export const GRANT_ACTION = { grant: 'grant', revoke: 'revoke' }
/** Audit answers rev11d adds to the approvals rows (§9 "Audit"). */
export const GRANT_AUDIT = { grant: 'grant', used: 'grant-used' }
/** A tag record made for a call a grant covered (§9 "Tag records"). */
export const GRANT_TAG_KIND = 'grant'

// ---- Revision 11 rev11e (prompts already showing, the fifth way in, cards for direct calls; DESIGN §7a.1, §7a.6, §7a.9, §9, §10e, §16; S33) ----
/** The registry's `by` for a session that became managed through answer_prompt (§9). */
export const PROMPT_MANAGED_BY = 'prompt-answer'
/** The tag record kind (§9 "Tag records"), the audit row kind (§9 "Audit") and the decisions action (§9 "Fishball's other decisions"). */
export const PROMPT_TAG_KIND = 'prompt'
export const PROMPT_AUDIT_KIND = 'prompt'
export const PROMPT_DECISION_ACTION = 'answer-prompt'
/** The approved tag of a session that became managed through answer_prompt (Q-r11-managed-tag-prompt, client wording). */
export const PROMPT_MANAGED_LABEL = 'Prompt answered by Fishball'

// ---- Revision 11 rev11f (Fishball's own requests; DESIGN §7a.11, §9 `own_requests`, §14, §16 Q-r11-own*; requirements items 21-24; S35) ----
/**
 * What Fishball's own tool returns while its request is a card (code `waiting-for-approval`, §7a.11) and the
 * notice that wakes it after Allow ("approved, run it again", item 22). The texts are matched, not compared whole:
 * the design gives their meaning, the client/plugin the exact wording (S35's wording is a proposal).
 */
export const OWN_REQUEST = { code: 'waiting-for-approval', waiting: /waiting[- ]for[- ](your )?approval|waits for the user's approval/i, again: /run it again/i, table: 'own_requests' }
/** Fishball's tool that removes its own card (item 23, §7a.11); its argument is `request_id`. */
export const WITHDRAW_TOOL = 'withdraw_request'
/** `own_requests` statuses (§9). */
export const OWN_STATUS = { waiting: 'waiting', approved: 'approved', rejected: 'rejected', withdrawn: 'withdrawn', used: 'used', expired: 'expired' }
/** The suffix a cut detail list ends with, and the mark of a cut single entry (Q-r11-own-card-detail). */
export const OWN_MORE = /and (\d+) more$/
export const CUT_MARK = '…'
/** The `too-many-waiting` text gains "or withdraw one" (the manager's decision for the user, 2026-11-02, DESIGN §16). */
export const OWN_WITHDRAW_HINT = /or withdraw one/i

// ---- Revision 11 rev11g (questions and plan reviews in managed sessions; DESIGN §7a.10, §9, §10e, §11, §14, §16; requirements items 25-27; S36, S37) ----
/** The code answer_question gives in User mode (§7a.10 "Code enforces only User mode"). */
export const MODE_USER_CODE = 'mode-user'
/** Table `settings`, key `questions`: {mode, changedAt} (§9). */
export const QUESTION_SETTINGS = { table: 'settings', key: 'questions' }
/** Tag kinds rev11g adds (§9 "Tag records"). */
export const QUESTION_TAG_KIND = { question: 'question', planReview: 'plan-review' }
/** A timed question's pending result carries these (dsh-tool-ask-user). */
export const PENDING = { key: 'pending' }

// ---- Persona rule: Chinese punctuation stays outside bold text (DESIGN §7 "Bold text and Chinese punctuation", §16 Q-bold-punct) ----
/**
 * What the persona tests compare against. `module` is the persona data module (exports PERSONA_ROLE and PERSONA_ROW);
 * FBTEST_PLUGIN_DIR points it at another checkout, as it does for the worker (a baseline run of a file).
 * `baseline` is where the persona stood before the rule was added: the live branch.
 */
export const PERSONA_BOLD = {
  // V3 R-CORE: the persona is core's; FBTEST_PLUGIN_DIR still names a checkout of the repository.
  module: path.join(process.env.FBTEST_PLUGIN_DIR ? path.join(process.env.FBTEST_PLUGIN_DIR, 'packages', 'core') : CORE.dir, 'src', 'persona.js'),
  baseline: { ref: 'rebuild/assistant', file: 'src/persona.js', moduleType: 'text/javascript' },
  exports: ['HIDDEN_PROMPT_ENTRIES', 'PERSONA_ROLE', 'PERSONA_ROW'],
  rowName: '@deepseek-ai/dsh-persona',
  lineBreak: '\n',
  carriageReturn: '\r',
  /** The bold marker, and the two forms of the requirement's example: to write, and not to write. */
  marker: '**',
  asterisk: '*',
  /** The example's words and its Chinese punctuation mark (the full-width colon, U+FF1A). */
  words: '还在进行中',
  punct: '：',
  good: '**还在进行中**：',
  bad: '**还在进行中：**',
  /** The words the rule line says it with (the requirement: "in bold text, put Chinese punctuation outside the ** markers"). */
  terms: ['bold', 'Chinese punctuation', 'outside'],
  /** What comes just before each example in the rule line: "write <good>, not <bad>". */
  before: { good: /write\W*$/i, bad: /\bnot\W*$/i },
  /** Ordinary (non-Fishball) prompts must not carry any of these. */
  absentFromOrdinary: ['Chinese punctuation', '还在进行中'],
  /** Sessions whose system prompt is checked. */
  sessions: { setup: 'Fishball setup turn', driven: 'Fishball driven turn', restarted: 'Fishball after a restart', bare: 'ordinary session (bare preset)', standard: 'ordinary session (standard preset)' },
}

/**
 * DSH's own markdown renderer, run offline: the web frontend bundles of the installed DSH versions
 * (`dsh-web-frontend/dist/assets/index-*.js` plus its `vendor-*.js` chunk). `versions` are checked one by one.
 * `generated` is the gitignored folder the extracted module is written to.
 */
export const DSH_MARKDOWN = {
  versionsDir: path.resolve(RUNTIME, '..', '..'),
  versions: ['0.2.1-rc.3', '0.2.1-rc.2'],
  assets: ['node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets'],
  generated: path.join(REPO, '.runtime', 'dsh-markdown'),
  indexFile: /^index-.*\.js$/,
  vendorFile: /^vendor-.*\.js$/,
  /** The bundle is the chat's renderer when it holds DSH's own attention rule. */
  marker: 'cjkFriendlyAttention',
  /** The renderer function: the parser with gfm, DSH's attention rule and math; the post-processing function it wraps. */
  parserPattern: /function ([\w$]+)\(e\)\{return ([\w$]+)\(([\w$]+)\(e,\{extensions:\[[\w$]+\(\),[\w$]+\(\),[\w$]+\(\),[\w$]+\(\)\],mdastExtensions:\[[\w$]+\(\),[\w$]+\(\)\]\}\),e\)\}/,
  /** The one helper the post-processing calls that is not part of the extracted slice (image file types); unused for bold text. */
  imageKindPattern: /([\w$]+)\([\w$]\[2\]\)==="image"/,
  /** What the bundle needs from a browser while it loads: only `document.compatMode` and an element for entity decoding. */
  compatMode: 'CSS1Compat',
  indexModule: 'dsh-renderer.mjs',
  vendorModule: 'vendor.mjs',
}

/** The mdast node types the bold checks read. */
export const MDAST = { text: 'text', strong: 'strong' }

/** Characters that may follow the punctuation, by class (the renderer decides by what follows a closing marker). */
export const AFTER_PUNCT = {
  latin: 'dsh',
  upper: 'DSH',
  digit: '1',
  accented: 'é',
  cyrillic: 'ж',
  chinese: '好',
  space: ' dsh',
  end: '',
  asciiPunct: '.',
}
/** After which the unclosed form stays unclosed (a letter or digit follows the closing marker), and after which it closes. */
export const AFTER_WORD = ['latin', 'upper', 'digit', 'accented', 'cyrillic']
export const AFTER_NON_WORD = ['chinese', 'space', 'end', 'asciiPunct']

/** Chinese (full-width and CJK) punctuation marks: the persona rule covers these. */
export const CHINESE_PUNCT = ['，', '。', '！', '？', '；', '：', '、', '）', '」', '”', '…', '—', '（', '【', '》']
/** Texts for the sentence-level cases. */
export const BOLD_SENTENCES = {
  midLine: { text: '状态：**还在进行中**：dsh 继续', strong: ['还在进行中'] },
  twoBold: { text: '**还在进行中**：dsh 和 **另一个**：abc', strong: ['还在进行中', '另一个'] },
  list: { text: '- **还在进行中**：dsh\n- **完成**：x', strong: ['还在进行中', '完成'] },
}

// ---- Revision 12 (DESIGN §10f): recommended plugins and the one-time welcome card ----
/** The commit before revision 12 (this branch's base), extracted as the "existing install" version. */
export const PRE_REV12 = { commit: '5343079' }
export const REC_API = { seen: '/api/fishball/welcome/seen', removedInstall: '/api/fishball/recommended/install' }
export const REC_ROOT_KEYS = ['categories', 'highlighted']
export const REC_ENTRY_KEYS = ['blocked', 'packageName', 'plugin', 'source', 'spec', 'state']
export const REC_STATE = { install: 'install', installed: 'installed', dshOn: 'dsh-on', dshOff: 'dsh-off' }
/** The four categories in order; the first two are highlighted. The design names them Context management, Memory, Channel, Pet; the ids are the builder's. */
export const REC_CATEGORY_COUNT = 4
export const REC_HIGHLIGHT_COUNT = 2
/** The design's list (table in §10f) by category position; a builder may drop entries (§16), never add others. */
export const REC_LISTED = [
  ['dsh-idle-compact', 'dsh-plugin-save-token', 'smart-compaction'],
  ['@openviking/dsh-memory-plugin', 'meow-memory', '@a9i5k4/dsh-auto-memory', '@zilliz/memsearch-dsh'],
  ['@michengai/dsh-im-connect', '@zaofan/dsh-qqbot', 'dsh-telegram-notify', 'dsh-slack', 'dsh-plugin-discord', 'dsh-dingtalk-channel'],
  [],
]
/** Left out for good (your answer "1c"): they edit other rows or publish a service. */
export const REC_NEVER = ['billion-context', 'dsh-handoff-compaction', '@xmanrui/dsh-im', 'dsh-plugin-weixin', '@wsz987/dsh-channels', 'dsh-lark-bot', '@agentscope-ai/reme-dsh-plugin']
/** Your answer: dsh-idle-compact installs from npm under its own name. */
export const REC_IDLE_SPEC = 'dsh-idle-compact'
/** Stand-ins named like listed packages (fixtures/rec-*): no test reaches npm. */
export const REC_STANDIN = {
  idle: { name: 'dsh-idle-compact', dir: fixtureDir('rec-dsh-idle-compact'), tool: 'rec_idle_echo' },
  telegram: { name: 'dsh-telegram-notify', dir: fixtureDir('rec-dsh-telegram-notify'), tool: 'rec_tg_echo' },
  smart: { name: 'smart-compaction', dir: fixtureDir('rec-smart-compaction'), tool: 'rec_smart_echo' },
  meow: { name: 'meow-memory', dir: fixtureDir('rec-meow-memory'), tool: 'rec_meow_echo' },
}
/** FBTEST_LINK: the DSH-profile stand-ins (on in DSH), linked at boot. */
export const REC_LINK_ENV = { FBTEST_LINK: JSON.stringify([REC_STANDIN.telegram, REC_STANDIN.smart].map((b) => ({ name: b.name, dir: b.dir, enabled: true }))) }
export const WELCOME_BAD_BODIES = [['invalid JSON', '{"a":', true], ['an array', []], ['a string', 'x'], ['a number', 5], ['null', null], ['a boolean', true]]
/** DESIGN §10f (after the c63fa9d review fix): 400 `bad-body` for a body that is not a JSON object; extra fields are ignored, so an object with a key answers 200. */
export const WELCOME_KEYED_BODY = { a: 1 }
