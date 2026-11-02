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
  /**
   * Installed by Fishball for itself alone, in its own package folder (src/fishball-packages.js),
   * never in the DSH profile; runs in its private tree when on. A package of the same name may
   * also be a DSH plugin: the two are separate catalog entries.
   */
  fishballInstalled: 'fishball-installed',
})

/**
 * Catalog key prefix of a Fishball-installed plugin (DESIGN §4): its key is this plus the package
 * name, so it never collides with a DSH plugin of the same name (whose key is the bare name).
 */
export const FISHBALL_INSTALLED_PREFIX = 'fishball:'

/**
 * The status each catalog plugin shows on the settings page and in list_plugins (DESIGN §4
 * "Plugin statuses"). A DSH plugin's status follows its desired on/off state for Fishball.
 */
export const PLUGIN_STATUS = Object.freeze({
  installedInFishball: 'installed-in-fishball',
  dshEnabled: 'dsh-enabled',
  dshDisabled: 'dsh-disabled',
  builtin: 'builtin',
})

/** Actions a catalog plugin offers; which ones depends on its status (src/plugin-catalog.js). */
export const PLUGIN_OFFER = Object.freeze({ enable: 'enable', disable: 'disable', uninstall: 'uninstall' })

/**
 * Fishball's own package folder (DESIGN §4 "Installed in Fishball only"): a pnpm project under
 * DSH's profiles directory, so DSH's runtime resolution gives its packages the host's peer
 * packages (spike S22). It is never a profile DSH boots.
 */
export const FISHBALL_PACKAGES = Object.freeze({
  folder: '.fishball-plugins',
  nodeModules: 'node_modules',
  manifest: 'package.json',
  /** pnpm copies a local directory installed with this protocol (a bare path would be linked). */
  fileProtocol: 'file:',
  /** pnpm commands (run through DSH's own runner, dsh-plugin-manager/operations). */
  add: 'add',
  remove: 'remove',
  /** Executable when the launcher supplies none (dsh-plugin-manager's pnpmCommand default). */
  pnpmCommand: 'pnpm',
  /** How DSH's runner runs pnpm for a service: secrets scrubbed, output captured. */
  execution: 'service',
  /**
   * Bounds of one package operation, mirroring dsh-plugin-manager's own config defaults
   * (outputBytes, idleTimeoutMs, lockWaitMs, inspectTimeoutMs), which it does not export.
   */
  outputBytes: 16384,
  idleTimeoutMs: 600000,
  lockWaitMs: 120000,
  lookupTimeoutMs: 20000,
  /** The patch file a profile-shaped folder would have; DSH's manager never writes it for installs (S31). */
  patchFile: 'cordis.patch.yml',
  /** How pnpm is told the registry a package came from, so its lockfile check passes on removal (DSH's removeBundle). */
  registryOption: '--config.registry=',
  /**
   * After a refused or cancelled install DSH restores the manifest and lockfile but leaves the
   * fetched files in node_modules; pnpm install with the restored files removes them again.
   */
  prune: Object.freeze(['install', '--prefer-offline']),
  /** How long the inherited manager may take to start before package operations give up on it. */
  managerStartMs: 30000,
})


/** Why installing or removing a Fishball-installed package failed (add_plugin's `reason`). */
export const PACKAGE_ERROR = Object.freeze({
  invalidSpec: 'invalid-spec',
  alreadyInstalled: 'already-installed',
  notBundle: 'not-bundle',
  ambiguousInstall: 'ambiguous-install',
  incompatibleVersion: 'incompatible-version',
  operationError: 'operation-error',
  noProfile: 'no-profile',
  /** You cancelled the install in the dialog (DSH's install process, revision 10a). */
  cancelled: 'cancelled',
  /** pnpm held back install scripts that need your approval (DSH's pendingBuilds). */
  buildBlocked: 'build-blocked',
  /** The spec is longer than maxMessageBytes (the bound the page's spec always had). */
  tooLarge: 'too-large',
})

/** Who last changed a plugin's Fishball state. */
export const CHANGED_BY = Object.freeze({ fishball: 'fishball', user: 'user' })

/** Plugin change audit outcome of a change that went through (failures store their code). */
export const PLUGIN_CHANGE_OK = 'ok'

/** Plugin change audit actions. */
export const PLUGIN_ACTION = Object.freeze({ on: 'on', off: 'off', add: 'add', remove: 'remove', settings: 'settings' })

/** Why a tool is not shown to Fishball, or that it is (list_plugins, settings). */
export const TOOL_STATUS = Object.freeze({
  visible: 'visible',
  hidden: 'hidden',
  pluginOff: 'plugin-off',
  unchecked: 'unchecked',
  /** Fishball's own tool for other sessions (message_fishball): never visible to Fishball (revision 10c). */
  otherSessions: 'other-sessions',
})

/**
 * Off answer of a route or tool whose Fishball plugin is off (revision 10c): Send to Fishball,
 * Tell Fishball when finished, notify_when_finished.
 */
export const FEATURE_OFF = 'feature-off'

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
  /** Fishball must ask before turning one of its own plugins on (revision 10c): it went off while Fishball was deciding. */
  askFirst: 'ask-first',
  installFailed: 'install-failed',
  restartRequired: 'restart-required',
  /** Only a Fishball-installed plugin can be uninstalled; DSH plugins and built-ins cannot. */
  notRemovable: 'not-removable',
  /** The plugin is being uninstalled; it offers no other action until that is done. */
  removing: 'removing',
  /** Uninstalling a Fishball-installed plugin failed; it stays installed and off. */
  removeFailed: 'remove-failed',
  /** Settings (DESIGN §10d): the plugin is on in DSH, so its settings are DSH's. */
  sharedWithDsh: 'shared-with-dsh',
  /** Settings: the plugin has no row of that id. */
  unknownRow: 'unknown-row',
  /** Settings: the row has no schema, or is the Compaction engine row (set by the context window). */
  noSettings: 'no-settings',
  /** Settings: Fishball may not see or set a secret field; only you do (Q-manager-secrets). */
  secretField: 'secret-field',
  /** Settings: the new complete config fails the row's schema. */
  invalidSettings: 'invalid',
  /** Settings: every value equals the current one. */
  noChange: 'no-change',
})

/**
 * Where a catalog plugin stands in DSH (snapshot `dsh`, DESIGN §10d): on for every session,
 * installed but off, a DSH capability package Fishball mounts itself, or not in DSH at all.
 */
export const PLUGIN_DSH = Object.freeze({ on: 'on', off: 'off', builtin: 'builtin', none: 'none',
  /** One of Fishball's own plugins (revision 10c): part of dsh-fishball itself, listed in the Fishball group. */
  fishball: 'fishball' })

/** Where a catalog plugin runs, from both sides' desired state (snapshot `runs`, DESIGN §10d). */
export const PLUGIN_RUNS = Object.freeze({ everywhere: 'everywhere', dsh: 'dsh', fishball: 'fishball', nowhere: 'nowhere' })

/** A plugin's Fishball settings (snapshot `settings`, DESIGN §10d). */
export const PLUGIN_SETTINGS_STATE = Object.freeze({ none: 'none', default: 'default', changed: 'changed', unused: 'unused' })

/** The plugin manager's bounds and fixed strings (DESIGN §10d). */
export const PLUGIN_MANAGER = Object.freeze({
  /** History entries the plugin page shows. */
  historyEntries: 10,
  /** Each old and new value in set_plugin_settings' prompt is cut to this many bytes. */
  promptValueBytes: 200,
  /** Query parameter naming the plugin on the GET routes. */
  pluginParam: 'plugin',
  /** Schemastery's error path prefix (`$.a.b expected …`) and how its segments are written. */
  errorPath: /^\$((?:\.[^\s.[\]]+|\[\d+\])*)/,
  errorSegment: /\.([^\s.[\]]+)|\[(\d+)\]/g,
  /** A data URL icon (DSH's metadata icons are base64 data URLs). */
  dataUrl: /^data:([^;,]+);base64,(.*)$/s,
  /** The settings role DSH's settings forms treat as secret. */
  secretRole: 'secret',
  /** The global symbol Schemastery sets on every schema (schemastery lib: Schema.prototype[kSchema]). */
  schemaMark: Symbol.for('schemastery'),
  /**
   * Schemastery's error messages end with the rejected data (`… but got ${data}`, unions and
   * intersections as JSON), which can hold a secret; everything from this marker on is dropped.
   */
  errorDataMarker: ' but got ',
  /** Keys a stored value may never carry: they would change an object's prototype when merged. */
  unsafeKeys: Object.freeze(['__proto__', 'constructor', 'prototype']),
  /** Why a row has no usable settings form (detail `rows[].error` when there is no schema message). */
  rowError: Object.freeze({ moduleUnavailable: 'module-unavailable', configUnresolved: 'config-unresolved', schemaUnreadable: 'schema-unreadable' }),
})

/**
 * Default on/off of DSH plugins for Fishball (DESIGN §4 "On at first start", src/plugin-defaults.js).
 * The one record in table plugin_defaults.
 */
export const PLUGIN_DEFAULTS = Object.freeze({ recordKey: 'dsh' })

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
  /** Another session's permission request (DESIGN §7a); never wake-capped (§16). */
  approval: 'approval',
  /** An event from a plugin source (ctx.fishball, DESIGN §8). */
  plugin: 'plugin',
})

/** Stable codes an intake call answers with (never message text). */
export const INTAKE_ERROR = Object.freeze({
  queueFull: 'queue-full',
  tooLarge: 'too-large',
  empty: 'empty',
  fromFishball: 'from-fishball',
  unknownSession: 'unknown-session',
  deliveryFailed: 'delivery-failed',
  featureOff: FEATURE_OFF,
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
  featureOff: FEATURE_OFF,
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

/** ctx.fishball, the extension service (DESIGN §8). */
export const SOURCES = Object.freeze({
  /** The service name plugins inject. */
  service: 'fishball',
  /** A source id: letters, digits, '-', '_' and '.', 1-64 characters. */
  idPattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  /** Bytes of a dedupe key and of a source description. */
  dedupeKeyBytes: 256,
  descriptionBytes: 1024,
  /** Bytes of a source title (shown in notices). */
  sourceTitleBytes: 200,
  separator: '/',
})
/** Stable codes ctx.fishball throws or rejects with (the error's code). */
export const SOURCE_ERROR = Object.freeze({
  duplicate: 'FISHBALL_SOURCE_DUPLICATE',
  limit: 'FISHBALL_LIMIT',
  invalid: 'FISHBALL_INVALID',
  tooLarge: 'FISHBALL_TOO_LARGE',
  queueFull: 'FISHBALL_QUEUE_FULL',
  disposed: 'FISHBALL_SOURCE_DISPOSED',
  unknownPlugin: 'FISHBALL_UNKNOWN_PLUGIN',
})
/** A source event's outcome (DESIGN §8). */
export const SOURCE_STATUS = Object.freeze({ accepted: 'accepted', duplicate: 'duplicate', disabled: 'disabled' })

/** Permission requests from other sessions (DESIGN §7a). */
export const APPROVAL = Object.freeze({
  /** Request id prefix Fishball sees (apr_<id>). */
  idPrefix: 'apr_',
  /** Bytes of the asking session's latest user message shown with a request. */
  userMessageBytes: 2048,
  /** Characters of a rationale kept in the audit (DESIGN §9). */
  rationaleChars: 500,
  /** setTimeout's limit (2^31-1 ms): a longer answer time is clamped to it. */
  maxTimerMs: 2147483647,
  /** Audit entries shown on the settings page. */
  shown: 20,
  waterfall: 'approval/request',
  assistantEvent: 'assistant/message',
  ptcDispatchEvent: 'tool/ptc-dispatch-start',
  toolCallBlock: 'tool-call',
  turnStartEvent: 'turn/start',
  userEvent: 'user/message',
  userSources: Object.freeze(['user', 'user-rpc']),
})
/** Fishball's answer (answer_approval) and what else ended a request. */
export const APPROVAL_DECISION = Object.freeze({ allow: 'allow', escalate: 'escalate' })
export const APPROVAL_ANSWER = Object.freeze({ allow: 'allow', escalate: 'escalate', timeout: 'timeout', withdrawn: 'withdrawn' })
export const APPROVAL_RISK = Object.freeze({ low: 'low', high: 'high' })
/** How complete the arguments Fishball sees are (a cut or missing call counts as high-risk). */
export const ARGUMENTS_STATUS = Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' })
/** DSH approval outcomes (dsh-user-approval). */
export const APPROVAL_OUTCOME = Object.freeze({ allowedOnce: 'allowed-once', rejected: 'rejected', cancelled: 'cancelled', unavailable: 'unavailable' })
export const APPROVAL_ERROR = Object.freeze({
  expired: 'expired',
  allowNeedsLowRisk: 'allow-needs-low-risk',
  reasonRequired: 'reason-required',
  argumentsIncomplete: 'arguments-incomplete',
})

/** Unread replies from Fishball (src/unread.js): the one stored record's key. */
export const UNREAD = Object.freeze({ recordKey: 'assistant' })

/**
 * Your display choices (src/preferences.js). The brand icon is Fishball's own mark, or DSH's
 * orca; the default is Fishball's, as before the choice existed.
 */
export const BRAND_STYLE = Object.freeze({ fishball: 'fishball', deepseek: 'deepseek' })
export const PREFERENCE = Object.freeze({ recordKey: 'display', defaultBrandStyle: BRAND_STYLE.fishball })

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
 * The Messenger look (DESIGN §10c): a Fishball built-in with no rows. Its package ships inside
 * dsh-fishball, and this row serves its browser file, because DSH serves browser halves only
 * for rows its host Loader lists (spike S24).
 */
export const MESSENGER = Object.freeze({
  /** Catalog key (src/builtins.js builds it from the built-in prefix and 'messenger'). */
  pluginKey: 'builtin:messenger',
  /** The browser file, relative to the dsh-fishball package folder. */
  clientFile: 'packages/messenger/client.js',
})

/**
 * The sender each intake message records in its source (`source.author`, DESIGN §10c), read by
 * the Messenger look. The name is the session or source title at arrival.
 */
export const AUTHOR = Object.freeze({
  /** UTF-8 bytes of a name: a plugin source's title is bounded the same, so it always fits whole. */
  nameBytes: SOURCES.sourceTitleBytes,
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
  /**
   * Who wrote a message read_session returns (DESIGN §5c): the user typing, that session's
   * agent, Fishball, another session, or context DSH or a plugin added.
   */
  roles: Object.freeze({ user: 'user', assistant: 'assistant', fishball: 'fishball', agent: 'agent', context: 'context' }),
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
  noTitle: 'no-title',
})

/**
 * Why start_session could not name the session it started (the result's titleError; the
 * session still starts, like a refused watch).
 */
export const TITLE_ERROR = Object.freeze({
  /** No sessionTitle service (dsh-base's session-title row is off). */
  unavailable: 'title-unavailable',
  /** DSH found no visible characters in the title. */
  invalid: 'title-invalid',
  /** Anything else DSH refused (logged). */
  failed: 'title-failed',
})

/**
 * start_session's `workspaceError` (DESIGN §5d): DSH created the session but could not add it
 * to the workspace. The session still starts and shows under Ungrouped, like one started in a
 * folder that is not a workspace.
 */
export const WORKSPACE_ERROR = Object.freeze({
  attachFailed: 'workspace-attach-failed',
  /** DSH's RemoteError code for this case; its details carry the new session's id. */
  dshCode: 'session/workspace-attach-failed',
})

/** Host API under DSH's authenticated /api channel. */
export const API = Object.freeze({
  state: '/api/fishball/state',
  events: '/api/fishball/events',
  recovery: '/api/fishball/recovery',
  /** POST { plugin, on }: your own on/off choice for one catalog plugin. */
  plugins: '/api/fishball/plugins',
  /** POST { plugin }: you uninstall a Fishball-installed plugin. */
  pluginsRemove: '/api/fishball/plugins/remove',
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
  /** POST {}: Fishball's chat is on screen, so its unread replies are read. */
  read: '/api/fishball/read',
  /** POST { style }: which brand icon the sidebar shows (BRAND_STYLE). */
  brand: '/api/fishball/brand',
  /** GET: the Messenger look's browser file (DESIGN §10c; Fishball's browser half loads it). */
  messengerClient: '/api/fishball/messenger/client.js',
  /** GET ?plugin=: one plugin's page data (rows, settings form, history; DESIGN §10d). */
  pluginsDetail: '/api/fishball/plugins/detail',
  /** GET ?plugin=: one plugin's icon image. */
  pluginsIcon: '/api/fishball/plugins/icon',
  /** POST { plugin, row, values?, reset? }: your settings for a plugin Fishball runs itself. */
  pluginsSettings: '/api/fishball/plugins/settings',
  /** POST {}: read the plugin list again now (the Fishball tab's Refresh, as DSH's page has one). */
  pluginsRefresh: '/api/fishball/plugins/refresh',
  /** POST { spec }: what a spec names, read by DSH's inspect (revision 10a). */
  installInspect: '/api/fishball/install/inspect',
  /** POST { spec, requestId, approvedBuilds? }: install for Fishball through DSH's process, then turn it on. */
  install: '/api/fishball/install',
  /** POST { requestId }: cancel that install. */
  installCancel: '/api/fishball/install/cancel',
})
export const HTTP = Object.freeze({ ok: 200, badRequest: 400, notFound: 404, conflict: 409, serverError: 500 })
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
  /** Settings (DESIGN §10d): the plugin is on in DSH; its settings are DSH's. */
  sharedWithDsh: 'shared-with-dsh',
  /** Settings: the row has no schema, or cannot be edited here. */
  noSettings: 'no-settings',
  /** Settings: the new config fails the row's schema (400, with `path`). */
  invalid: 'invalid',
  failed: 'failed',
})
export const RESPONSE_HEADERS = Object.freeze({
  json: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }),
  eventStream: Object.freeze({ 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' }),
  // no-store: the file changes with the installed dsh-fishball, so each page load fetches the installed copy.
  javascript: Object.freeze({ 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }),
  // The icon route sets the image's own content type; no-store, as an icon changes with its package.
  // An SVG opened on its own runs no script and no other content (sandbox, nosniff; review L6).
  image: Object.freeze({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'" }),
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
  /** The profile launcher's facts (absent in non-profile hosts): bundle rows and Fishball's package folder. */
  profileContext: 'profileContext',
  /** DSH's runtime package resolution: where the profiles directory is (Fishball's package folder). */
  pluginPackages: 'pluginPackages',
  /** DSH's session titles (dsh-base's session-title row; absent only if a profile turns that row off): start_session names the new session (DESIGN §5d). */
  sessionTitle: 'sessionTitle',
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
