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

/**
 * Context window (DESIGN §6). DSH_DEFAULTS mirror dsh-compaction-basic's own defaults
 * (lib/index.js DEFAULT_THRESHOLD_RATIO, DEFAULT_RETAIN_RATIO, headroomTokens ?? 65536),
 * which it does not export; they price the threshold shown when no smaller window is set.
 */
export const CONTEXT = Object.freeze({
  dshDefaults: Object.freeze({ thresholdRatio: 0.8, retainRatio: 0.16, headroomTokens: 65536 }),
  /**
   * Headroom (and the summary's own token cap, which DSH ties to it) for a smaller window:
   * one eighth of it, at most DSH's 65,536, which alone would not fit a small window. At
   * 20,000 that is 2,500, as in spike S5, so a summary of that length fits.
   */
  headroomShare: 8,
  /** Default reply-length cap with a smaller window: one eighth of it, at most 32,000 (Q-defaults). */
  outputShare: 8,
  outputMax: 32000,
  /**
   * Smallest window accepted, whatever the prompt: below it the reply and summary caps would
   * be a few hundred tokens. It bounds a save made before any request has measured the
   * prompt and tools (review M2); with them measured the fit check is usually stricter.
   */
  minWindowTokens: 4096,
  /** Smallest reply or summary cap: DSH requires a positive summary cap, a 0 reply is none. */
  minCapTokens: 1,
  /** Bound on asking the model adapter for its window, so a slow discovery never stalls boot. */
  modelInfoTimeoutMs: 5000,
  /** Settings record key in the settings table (DESIGN §9). */
  settingsKey: 'assistant',
  /** Catalog key of the built-in compaction plugin and its engine row's own id (src/builtins.js). */
  compactionPlugin: 'builtin:compaction',
  compactionRow: 'compaction-basic',
  /** Fishball's compaction engine (DSH's, with an assistant-oriented summary). */
  compactionModule: 'dsh-fishball/compaction',
})

/** Why a context-window value is refused, or why a stored one cannot apply now. */
export const CONTEXT_ERROR = Object.freeze({
  /** The window cannot hold the reply cap, headroom, retained tail and prompt-plus-tools. */
  windowTooSmall: 'window-too-small',
  /** The reply-length cap does not fit inside the window. */
  outputTooLarge: 'output-too-large',
  /** The model reports no window, so a smaller one cannot be derived from it. */
  modelWindowUnknown: 'model-window-unknown',
})

/** DSH session projection with the latest request's system-prompt and tool sizes (dsh-token-meter). */
export const CONTEXT_PROJECTION = Object.freeze({ breakdown: 'contextBreakdown' })

/** Storage domain names and versions (fail closed on mismatch). */
export const DOMAIN = Object.freeze({ main: 'fishball', version: 1, intake: 'fishball_intake' })

/** Lifecycle of one intake item (DESIGN §5b, §9 fishball_intake.items). */
export const INTAKE_STATUS = Object.freeze({
  /** Recorded durably, not yet in Fishball's inbox. */
  pending: 'pending',
  /** In the inbox and flushed to the session log. */
  accepted: 'accepted',
  /** Fishball's turn took it. */
  consumed: 'consumed',
  /** DSH discarded it from the inbox (a cancel cleared it). */
  discarded: 'discarded',
  /** Could not be delivered; errorCode says why. */
  failed: 'failed',
})

/** Who an intake item came from (the part of its source identity the host works out). */
export const INTAKE_KIND = Object.freeze({
  /** message_fishball from another session's agent. */
  session: 'session',
  /** "Send to Fishball" in the GUI: you forward a session with a note. */
  user: 'user',
  /** A Fishball notice from Fishball itself (e.g. plugins already on with unchecked tools). */
  system: 'system',
  /** A watched session finished (DESIGN §5c). */
  watch: 'watch',
})

/** Stable codes an intake call answers with (never message text). */
export const INTAKE_ERROR = Object.freeze({
  queueFull: 'queue-full',
  tooLarge: 'too-large',
  empty: 'empty',
  fromFishball: 'from-fishball',
  unknownSession: 'unknown-session',
  deliveryFailed: 'delivery-failed',
})

/** Watches (DESIGN §5c, §9 watches). */
export const WATCH_CONDITION = Object.freeze({ finished: 'finished', perTurn: 'per-turn' })
export const WATCH_MODE = Object.freeze({ once: 'once', repeat: 'repeat' })
export const WATCH_STATUS = Object.freeze({ active: 'active', closed: 'closed', targetMissing: 'target-missing' })
/** Who set a watch up: you (GUI), Fishball (watch_session), or another agent (message_fishball). */
export const WATCH_BY = Object.freeze({ user: 'user', assistant: 'assistant', agent: 'agent' })
/** Turn-end reasons that never count as finished (crash closers and fork seeds). */
export const WATCH_IGNORED_REASONS = Object.freeze(['interrupted', 'forked'])
export const WATCH_ERROR = Object.freeze({
  unknownSession: 'unknown-session',
  archived: 'archived',
  isFishball: 'is-fishball',
  limitReached: 'limit-reached',
  unknownWatch: 'unknown-watch',
  notRelated: 'not-related',
})
export const WATCH = Object.freeze({
  /** Watches shown on the settings page and by list_watches. */
  shown: 50,
  /** read_session: recent messages and their byte bound. */
  readMessages: 12,
  readBytes: 12288,
  turnEndEvent: 'turn/end',
  sourcePrefix: 'fishball/watch/',
})

/** One hour, for the hourly caps (wake-ups, messages, sessions). */
export const HOUR_MS = 60 * 60 * 1000

/** Intake ledger parameters (src/intake.js). */
export const INTAKE = Object.freeze({
  /** Joins source identity and dedupe key before hashing them into the row key. */
  keySeparator: '\n',
  /** Delivery attempts before a row is marked failed (each restart or reconcile retries). */
  maxAttempts: 3,
  /** Rows shown on the settings page. */
  snapshotRows: 20,
})

/** Outcome of handing one item to the ledger. */
export const INTAKE_OUTCOME = Object.freeze({ accepted: 'accepted', duplicate: 'duplicate' })

/** Message sources Fishball uses (spike S4; DSH's agent-message relay is S16). */
export const SOURCE = Object.freeze({
  relay: Object.freeze({ kind: 'agent-message', form: 'relay' }),
  notice: Object.freeze({ kind: 'fishball-notice', form: 'notice' }),
})

/**
 * Reading another session for a notice (src/session-info.js). The excerpt bound keeps a
 * notice small however long the other session's last answer was.
 */
export const SESSION_INFO = Object.freeze({
  /** Bytes of a session's last answer in a forward (Fishball's own bound, not the sender's). */
  excerptBytes: 3072,
  ellipsis: '…',
  assistantEvent: 'assistant/message',
  userEvent: 'user/message',
  roles: Object.freeze({ user: 'user', assistant: 'assistant' }),
  textBlock: 'text',
  /** Session header marking a subagent's session, and how far up its parents are followed. */
  subagentOrigin: 'subagent',
  maxSubagentDepth: 8,
})

/** What Fishball sent or started (DESIGN §9 outbox). */
export const OUTBOX_KIND = Object.freeze({ message: 'message', start: 'start' })
/** unconfirmed: the session has the message, but its flush to disk could not be confirmed. */
export const OUTBOX_STATUS = Object.freeze({ delivered: 'delivered', unconfirmed: 'unconfirmed', failed: 'failed' })

/** Stable codes message_session and start_session answer with. */
export const OUTBOUND_ERROR = Object.freeze({
  hourlyCap: 'hourly-cap',
  tooLarge: 'too-large',
  empty: 'empty',
  unknownSession: 'unknown-session',
  archived: 'archived',
  isFishball: 'is-fishball',
  noFolder: 'no-folder',
  notAbsolute: 'not-absolute',
  deliveryFailed: 'delivery-failed',
})

/** Host API under DSH's authenticated /api channel. */
export const API = Object.freeze({
  state: '/api/fishball/state',
  events: '/api/fishball/events',
  recovery: '/api/fishball/recovery',
  /** POST { plugin, on }: your own on/off choice for one catalog plugin. */
  plugins: '/api/fishball/plugins',
  /** POST { toolKey }: withdraw an allowance for a tool nobody had checked. */
  toolApprovals: '/api/fishball/tool-approvals/remove',
  /** POST { contextWindowTokens, maxOutputTokens }: each a positive whole number or null (unset). */
  contextWindow: '/api/fishball/context-window',
  /** POST { sessionId, note }: you forward a session to Fishball ("Send to Fishball"). */
  send: '/api/fishball/send',
  /** POST { sessionId }: "Tell Fishball when finished". */
  watches: '/api/fishball/watches',
  /** POST { watchId }: remove a watch. */
  watchesRemove: '/api/fishball/watches/remove',
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
  /** The model's context window (resolveModelInfo) for the context-window setting (DESIGN §6). */
  llm: 'llm',
  /** Durable session flush after an inbox write (intake ledger, outbound messages). */
  sessions: 'sessions',
})

/** Optional services read with ctx.get (Fishball works without them, with less shown). */
export const OPTIONAL_SERVICE = Object.freeze({
  /** Measures a request's size for the context window's hard ceiling (DESIGN §6). */
  tokenMeter: 'tokenMeter',
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
  /** dsh-llm: adapters or their models changed (a model window may have changed). */
  adaptersUpdated: 'llm/adapters-updated',
  /** Agent request waterfall: the final call config of each model request. */
  agentRequest: 'agent/request',
  /** Agent request-error waterfall: decides whether a failed model request is retried. */
  agentRequestError: 'agent/request-error',
  /** dsh-llm: every model call (the hard ceiling answers Fishball's own requests). */
  llmStream: 'llm/stream',
  agentStatus: 'agent/status',
  /** Every event appended to any session (watches), and the turn start it watches for. */
  sessionEvent: 'session/event',
  turnStart: 'turn/start',
  /** Inbox events of Fishball's agent (intake ledger bookkeeping). */
  inboxClaimed: 'agent/inbox/claimed',
  inboxDiscarded: 'agent/inbox/discarded',
})

/** Agent status after a turn ends (dsh-agent). */
export const AGENT_IDLE = 'idle'

/** agent/request-error action that retries the request (dsh-agent-loop). */
export const REQUEST_RETRY = 'retry'

/** dsh-llm stream finish chunk and finish kinds. */
export const LLM_FINISH = Object.freeze({ chunk: 'finish', error: 'error', aborted: 'aborted', maxTokens: 'max-tokens' })

/** Approval outcome that grants the request; every other outcome refuses (dsh-user-approval). */
export const APPROVAL_GRANTED = 'allowed-once'
