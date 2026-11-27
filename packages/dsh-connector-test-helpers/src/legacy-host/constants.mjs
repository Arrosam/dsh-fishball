/**
 * Shared test vocabulary for the Fishball P2 black-box suite. Values come from
 * the P2 requirements given to the test author (see test/CASES.md), never from
 * the implementation.
 */
/**
 * Shared test vocabulary for the Fishball P2 black-box suite. Values come from
 * the P2 requirements given to the test author (see test/CASES.md), never from
 * the implementation.
 */
import os from 'node:os'

import path from 'node:path'

export const REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..')

export const NODE = process.execPath

/** The DSH runtime a worker boots: set by the caller (bootHost's env), never a fixed install. */
export const RUNTIME = process.env.FBTEST_DSH_RUNTIME

/**
 * Root of the throwaway DSH homes. FBTEST_TEST_HOMES moves it (e.g. under the OS temp dir, so a
 * baseline run writes no home into the checkout); it must still end in `.runtime/test-homes`,
 * because run.mjs's delete guard and the worker's home check both require that suffix.
 * The default is process-isolated outside Git: native child preflight rejects Git ancestors.
 */
export const TEST_HOMES = process.env.FBTEST_TEST_HOMES ?? process.env.DSH_TEST_HOMES ?? path.join(os.tmpdir(), 'fbtest-' + process.pid, '.runtime', 'test-homes')

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

export const PACKAGE_NAME = CONNECTOR.name

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

/** R-COMPOSITION: names never shown to Fishball. */
export const HIDDEN_TOOLS = [
  'image_generate', 'video_generate', 'mover_move_session', 'create_worktree', 'git_worktree',
  'diff_approval_annotate', 'ralph', 'code_review_report', 'write', 'edit', 'str_replace_editor',
  'plugin_manager', 'subagent', 'subagent_fork', 'workflow', 'send_message', 'interrupt_agent',
  'spawn_teammate',
]

/** R-FILEWRITE shell tools. run_code is reserved by DSH and cannot be registered as a fixture (see CASES.md). */
export const SHELL_TOOLS = ['bash', 'pwsh', 'run_code', 'terminal_open', 'terminal_send']

export const FIXTURE_SHELL_TOOLS = SHELL_TOOLS.filter((n) => n !== 'run_code')

/** Ordinary names that must stay visible to Fishball. */
export const VISIBLE_TOOLS = ['demo_echo', 'bsk_inspect']

/** Every fixture tool name; the fixture bundle registers all but LATE_TOOLS at boot. */
export const BOOT_TOOLS = [...new Set([...HIDDEN_TOOLS, ...FIXTURE_SHELL_TOOLS, ...VISIBLE_TOOLS])]

/** Hidden names registered only after Fishball is live (R-COMPOSITION re-evaluation), plus one ordinary late name. */
export const LATE_TOOLS = ['ralph', 'code_review_report']

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

export const STATUS = { starting: 'starting', live: 'live', recovery: 'recovery', archived: 'archived', stopped: 'stopped', failed: 'failed' }

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

/** DSH's progress events, each carrying the request id the caller chose. */
export const INSTALL_EVENTS = { state: 'plugin-manager/install-state', log: 'plugin-manager/install-log' }

/** DSH approval outcomes a test answerer can return (dsh-user-approval ApprovalOutcome). */
export const OUTCOME = { allow: 'allowed-once', reject: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' }

export const MS = { boot: 45000, live: 20000, turn: 20000, stop: 20000, poll: 100, sseFirstFrame: 3000, sseChange: 8000 }

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

/**
 * A scripted tool argument with exactly this value becomes the newest apr_<hex> id seen in the session's
 * conversation (fixtures/fake-llm.mjs), so a script can continue a request minted during the turn.
 */
export const REQUEST_PLACEHOLDER = '$fbtest:last-request-id'

