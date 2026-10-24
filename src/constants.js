/**
 * Fixed values owned by Fishball. Runtime-tunable safety limits are NOT here: they are
 * the row's config (src/config.js), which the user edits on the Plugins page.
 */
import { SAFE_SANDBOX_MODE } from './tool-rules.js'

/** Package identity and log channel. */
export const PLUGIN = Object.freeze({
  name: 'dsh-fishball',
  logger: 'fishball',
})

/**
 * Identity of the single assistant session. The preset id is written into the session
 * header but never registered, so DSH's picker cannot offer it and a GUI cold resume
 * fails closed instead of mounting a coding preset (spike S3).
 */
export const ASSISTANT = Object.freeze({
  presetId: 'fishball:assistant',
  /** Path segments under the DSH home: `$DSH_HOME/fishball/assistant` (Q-workspace). */
  homeSegments: Object.freeze(['fishball', 'assistant']),
  sessionIdPrefix: 'session-fishball-',
  /** Fishball runs in the one mode where its shell tools may run (DESIGN §7). */
  sandboxMode: SAFE_SANDBOX_MODE,
  approvalPolicy: 'ask',
  /**
   * Fishball's tools are presented natively whatever the deployment's mode (DESIGN §4.4):
   * under PTC it would otherwise see only run_code, which the guard allows only read-only.
   */
  toolPresentation: 'native',
  /** `workspace/session-activity` family reported while the assistant is live. */
  activityKind: 'fishball',
  /** Bounded retries when a GUI resume holds the writer at boot (spike S7). */
  resumeAttempts: 3,
  resumeRetryMs: 500,
})

/**
 * The setup turn Fishball runs while its session is still blank. DSH's GUI disables the
 * composer of a blank session that belongs to no workspace, and Fishball's session
 * deliberately has no workspace (DESIGN §5a). A session stops being blank when a turn
 * starts, so one turn makes it usable: one model call in the session's lifetime. A model
 * error still starts the turn, so the session becomes usable either way.
 *
 * The notice states a fact and asks for nothing: the persona (trusted) says what to do
 * with it, because the persona treats every non-user input as untrusted data.
 */
export const SETUP_NOTICE = Object.freeze({
  kind: 'fishball-notice',
  form: 'notice',
  summary: 'Fishball is set up',
  text: 'Fishball has just been set up. This chat is where the user talks to Fishball.',
})

/** DSH session projection that says whether a session is still blank (no turn started). */
export const PROJECTION = Object.freeze({ sessionListMetadata: 'sessionListMetadata' })

/** Lifecycle states published to the settings view. */
export const STATUS = Object.freeze({
  starting: 'starting',
  live: 'live',
  recovery: 'recovery',
  archived: 'archived',
  stopped: 'stopped',
  /** The core could not start (store unreadable, composition failed); DSH must restart. */
  failed: 'failed',
})

/** Stable error codes; message text never reaches logs or the browser. */
export const ERROR = Object.freeze({
  storeUnreadable: 'store-unreadable',
  resumeFailed: 'resume-failed',
  createFailed: 'create-failed',
  composeFailed: 'compose-failed',
})

/** Recovery actions the settings view may request. */
export const RECOVERY_ACTION = Object.freeze({ retry: 'retry', adopt: 'adopt' })

/** Where a catalog plugin runs (DESIGN §4 "Plugin states"). */
export const PLUGIN_KIND = Object.freeze({
  /** Enabled in the profile: runs for every session; Fishball can only mask it. */
  profile: 'profile',
  /** Installed but off in the profile: runs in Fishball's private tree when on. */
  fishballOnly: 'fishball-only',
  /** A DSH capability package Fishball mounts in its private tree when on. */
  builtin: 'builtin',
})

/** Who last changed a plugin's Fishball state. */
export const CHANGED_BY = Object.freeze({ fishball: 'fishball', user: 'user' })

/** Plugin change audit actions. */
export const PLUGIN_ACTION = Object.freeze({ on: 'on', off: 'off', add: 'add' })

/** Why a tool is not shown to Fishball, or that it is (list_plugins, settings). */
export const TOOL_STATUS = Object.freeze({
  visible: 'visible',
  hidden: 'hidden',
  pluginOff: 'plugin-off',
  unchecked: 'unchecked',
})

/** Stable plugin diagnostics (catalog `lastError`, tool results); never message text. */
export const PLUGIN_ERROR = Object.freeze({
  unknownPlugin: 'unknown-plugin',
  limitReached: 'limit-reached',
  editsOtherRows: 'edits-other-rows',
  noRows: 'no-rows',
  rowIdConflict: 'row-id-conflict',
  rowFailed: 'row-failed',
  leaksService: 'leaks-service',
  noProfile: 'no-profile',
  rejected: 'rejected',
  installFailed: 'install-failed',
  restartRequired: 'restart-required',
})

/** Storage domain names and versions (fail closed on mismatch). */
export const DOMAIN = Object.freeze({ main: 'fishball', version: 1 })

/** Host API under DSH's authenticated /api channel. */
export const API = Object.freeze({
  state: '/api/fishball/state',
  events: '/api/fishball/events',
  recovery: '/api/fishball/recovery',
  /** POST { plugin, on }: your own on/off choice for one catalog plugin. */
  plugins: '/api/fishball/plugins',
  /** POST { toolKey }: withdraw an allowance for a tool nobody had checked. */
  toolApprovals: '/api/fishball/tool-approvals/remove',
})
export const HTTP = Object.freeze({ ok: 200, badRequest: 400, conflict: 409, serverError: 500 })
export const HTTP_METHOD = Object.freeze({ get: 'GET', post: 'POST' })
export const REQUEST_BODY_BUFFERED = 'buffered'
export const API_CODE = Object.freeze({
  badBody: 'bad-body',
  notInRecovery: 'not-in-recovery',
  /** The named plugin or tool allowance does not exist. */
  unknown: 'unknown',
  /** The change was refused (a limit, or the plugin cannot run Fishball-only). */
  refused: 'refused',
  /** No assistant lifecycle runs: before the store opens, or after a core failure. */
  unavailable: 'unavailable',
  failed: 'failed',
})
export const RESPONSE_HEADERS = Object.freeze({
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
})

/**
 * Host services the row injects (index.js `inject`). `loader` resolves the private
 * tree's rows; `sandboxPolicy` backs the shell guard; `sessionPersistence` is required by
 * `agents.resume`; `sessionProjections` says whether the session is still blank, from the
 * `sessionListMetadata` projection that `sessionController` registers (so it is injected too:
 * without it the blank check would silently read "not blank" and skip the setup turn).
 */
export const SERVICE = Object.freeze({
  agents: 'agents',
  workspaceRegistry: 'workspaceRegistry',
  storageDomain: 'storageDomain',
  tools: 'tools',
  connection: 'connection',
  sandboxPolicy: 'sandboxPolicy',
  agentDefaultModel: 'agentDefaultModel',
  loader: 'loader',
  systemPrompt: 'systemPrompt',
  sessionPersistence: 'sessionPersistence',
  sessionProjections: 'sessionProjections',
  sessionController: 'sessionController',
  /** Catalog (listBundles) and add_plugin's install. */
  pluginManager: 'pluginManager',
  /** Permission prompts for add_plugin and tools nobody has checked (DESIGN §7). */
  approval: 'approval',
})

/** Host events this plugin listens to. */
export const EVENT = Object.freeze({
  toolsChange: 'tools/change',
  sessionActivity: 'workspace/session-activity',
  sessionStop: 'workspace/session-stop',
  volatileUpdate: 'loader/volatile-update',
  agentDisposed: 'agent/disposed',
  /** Cordis: a service was provided or removed (a row waiting for one may now run). */
  service: 'internal/service',
  /** dsh-plugin-manager: a bundle was installed, removed, enabled or disabled. */
  pluginManagerChanged: 'plugin-manager/changed',
})

/** Approval outcome that grants the request; every other outcome refuses (dsh-user-approval). */
export const APPROVAL_GRANTED = 'allowed-once'
