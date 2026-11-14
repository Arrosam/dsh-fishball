/**
 * The runtime values of fishball-core's K3 contracts (K3 amendment 2026-11-14, Fishball under the
 * user's rule: every tunable value is defined once, in its frozen contract's constants object, and
 * code and tests import it from here). The types beside this file (`events.d.ts`, `guards.d.ts`)
 * name the same values; a K3 amendment of one changes both in the same change.
 *
 * Data only, by the K3 freeze: frozen objects of strings, numbers, booleans and arrays, plus pure
 * template formatters (`(…) => \`…\``, interpolating names only). No import, no other call, no
 * behaviour; whatever is derived from these values lives in the module that derives it.
 *
 * The values of core's link that cross to the connector (target states and codes, the
 * `disconnected` answer) are K1's (`fishball-connector/mcp-schema` `TARGET_STATE`, `TARGET_CODE`,
 * `LINK_REFUSAL`; DECIDED D7), not this file's. DECIDED Dn: the row of mcp-schema/README.md "User
 * decisions", the one record of the decisions of K1, K2 and K3.
 */

// ------------------------------------------------------------------------- interception (events.d.ts)

/** `InterceptRegistration.priority` default (R-INT-01; DECIDED D3) and `CommitResult`'s fenced code. */
export const INTERCEPT = Object.freeze({
  defaultPriority: 0,
  fenced: 'fenced',
})

/**
 * The acceptance ledger: one DSH storage-domain table in the Fishball DSH, one record per
 * `eventId` (design §6.4, S2 §2.2).
 * finishedRetentionMs (DECIDED D2): a finished record (closed, admitted or discarded) that the
 * connector has acked is deleted this long after it finished. Only acked records go: the connector
 * never returns an acked event to a poll (K1 MAILBOX), so a deleted id cannot come back and be
 * handled twice; an unacked one is kept so its replay stays a duplicate.
 */
// K1 keeps its day length private (mcp-schema constants.js DAY_MS), and this file imports nothing.
const MS_PER_DAY = 24 * 60 * 60 * 1000
export const LEDGER = Object.freeze({
  domain: 'fishball_core_events',
  table: 'acceptance',
  version: 1,
  finishedRetentionMs: 30 * MS_PER_DAY,
})

/**
 * Ledger record states.
 * - offered: handed to one interceptor (`plugin`, `attempt`), not yet accepted; never acked.
 * - open: the interceptor's `ctl.accept()` resolved; durable, acked, undecided.
 * - committing: `ctl.commit(send)` began; the event stays with the interceptor from here on.
 * - closed: the interceptor's handler settled; log only (R-INT-09).
 * - fishball: accepted for the Fishball agent, in core's delivery list (R-INT-08, R-EVT-03).
 * - admitted: Fishball's session admitted its message (the event's own, or the given-up notice,
 *   decision 3.A); the one wake happened, and this record alone says so (decision 4.A).
 * - discarded: removed from the inbox, or its claiming turn ended before admission in another way
 *   than an owner teardown (S2-Q3 A, decision 1.B): acked, never retried.
 */
export const STATE = Object.freeze({
  offered: 'offered',
  open: 'open',
  committing: 'committing',
  closed: 'closed',
  fishball: 'fishball',
  admitted: 'admitted',
  discarded: 'discarded',
})

/** Why an event went to Fishball, or how an interceptor's record ended; background log only. */
export const REASON = Object.freeze({
  noMatch: 'no-match',
  notAccepted: 'not-accepted',
  handlerFailed: 'handler-failed',
  pluginNotLive: 'plugin-not-live',
  disposed: 'registration-disposed',
  released: 'released',
  sendNotDelivered: 'send-not-delivered',
  restartBeforeAccept: 'restart-before-accept',
  restartPluginOff: 'restart-plugin-off',
  handled: 'handled',
  commitInterrupted: 'commit-interrupted',
  userStopped: 'user-stopped',
  /**
   * The turn that claimed the event ended before admitting it in another way than a user Stop or
   * an owner teardown (`error`, `blocked`, an `aborted` by `parent` or `hook`): discarded (the
   * user's decision 2026-11-14 1.B).
   */
  claimTurnEnded: 'claim-turn-ended',
  /** Every attempt to present the event failed; Fishball got a notice instead (decision 3.A). */
  presentGivenUp: 'present-given-up',
})

/**
 * How often core tries to turn an event into Fishball's message before it gives up (decision 3.A;
 * the values DECIDED D1). Attempt n (1-based) that fails, with n < attempts, is followed by a wait
 * of backoffMs × backoffFactor^(n−1) before attempt n + 1.
 */
export const PRESENT_RETRY = Object.freeze({ attempts: 3, backoffMs: 1000, backoffFactor: 2 })

/**
 * The short notice Fishball gets for an event core could not present (decision 3.A; the text
 * DECIDED D6). It names the event only; no payload.
 */
export const TEXT = Object.freeze({
  blockType: 'text',
  presentGivenUp: (eventId, type) => `Fishball notice: event ${eventId} (${type}) could not be shown to you and was given up.`,
})

/**
 * The message an event becomes in Fishball's session. Its id is derived from the `eventId`, so the
 * live admission (`user/message` with that id) is recognised as this event's.
 */
export const MESSAGE = Object.freeze({
  idPrefix: 'fbe_',
  role: 'user',
  sourceKind: 'fishball-event',
})

// ------------------------------------------------------------------------- core's link

/**
 * Bounded reconnect backoff of core's link (R-FB-04 "retries with bounded backoff"; DECIDED D4).
 * The n-th consecutive failed attempt (from 0) waits `min(initialMs * factor ** n, maxMs)`; a
 * connected link resets the count.
 */
export const LINK_BACKOFF = Object.freeze({
  initialMs: 1000,
  factor: 2,
  maxMs: 60 * 1000,
})

// ------------------------------------------------------------------------- guards (guards.d.ts)

/** dsh-app-boot's diagnostic prefix, also the prefix of core's own patch errors. */
const GUARDS_DIAGNOSTIC = 'fishball-core'

/**
 * The guard values core's code reads (design §5a.2; R-FB-02, R-FB-09, R-FB-12, R-FB-13, R-HOST-11
 * (5)). Every value `guards.d.ts` names has its K3 spelling there; the service name, record
 * location and diagnostic texts are F-GUARDS's own, kept here too so the whole guard vocabulary has
 * one owner (DECIDED D7).
 *
 * What is NOT here, on purpose: the guarded rows, the shipped preset rows and the intended policy
 * values. Their one definition is core's own `cordis.patch.yml`; `src/guards/intended.js` reads them
 * from it at runtime, so the patch and the check can never disagree.
 *
 * Module paths (`coreTools[].module`, `patchFile`) are relative to `src/guards/`, the folder whose
 * modules resolve them (`new URL(path, import.meta.url)`), not to this file.
 */
export const GUARDS = Object.freeze({
  /** GuardReport.status. */
  status: Object.freeze({ ok: 'ok', overridden: 'guards-overridden' }),
  /** OverriddenGuard spellings: `row:<id>`, `policy:<key>` and the three single codes. */
  code: Object.freeze({
    rowPrefix: 'row:',
    policyPrefix: 'policy:',
    agentPresets: 'agent-presets',
    bundleOrder: 'bundle-order',
    managerTools: 'manager-tools',
  }),
  /** GuardCheckTrigger: the two events core re-checks on (app ready is `appReady.onReady`). */
  triggers: Object.freeze(['settings/document-updated', 'plugin-manager/changed']),
  /**
   * FishballAgentPreset: a guarded DSH offers only core's preset (the patch's
   * `agent-preset-registry.default`, read through `managerPresetKey`) and fishball-watchdog's.
   */
  watchdogAgentPreset: 'watchdog',
  /** The IntendedPolicy key whose value is the manager's agent preset (core's patch sets it). */
  managerPresetKey: 'defaultAgentPreset',
  /** ManagerTool: the manager's model tools, exactly (R-FB-13). */
  managerTools: Object.freeze(['read', 'read_image', 'working_directory']),
  /**
   * Core's own model tools, by module (relative to `src/guards/`) and exported name table (user
   * decision 2026-11-14: core's tools are not the preset's and are left out of the R-FB-13 check).
   * Loaded lazily, because these modules import `fishball-connector/contract`, which a standalone
   * core may not resolve; a module that cannot load registers no tools, so its names cannot appear.
   */
  coreTools: Object.freeze([
    Object.freeze({ module: '../slim/child/session-tools.js', table: 'SESSION_TOOL' }),
    Object.freeze({ module: '../slim/child/reminders.js', table: 'TOOL' }),
    Object.freeze({ module: '../slim/child/skills.js', table: 'PRIVATE_SKILL_TOOL' }),
  ]),
  /** ReorderOutcome. */
  reorder: Object.freeze({ moved: 'moved', unchanged: 'unchanged', failed: 'failed' }),
  /**
   * IntendedPolicy keys, in report order, each with the DSH row and config field core's patch sets
   * and the public service member that reads the effective value back (S6 §3.5). `keys: true`
   * compares the config object's keys (the permission preset table) instead of a value.
   */
  policy: Object.freeze([
    Object.freeze({ key: 'sandbox', row: 'sandbox-policy', field: 'mode', service: 'sandboxPolicy', member: Object.freeze(['defaultMode']) }),
    // Read directly (requirements 1.24 item 4): ApprovalService has no public getter for its default.
    Object.freeze({ key: 'approval', row: 'approval', field: 'policy', service: 'approval', member: Object.freeze(['config', 'policy']) }),
    Object.freeze({ key: 'permissionPresets', row: 'permission', field: 'presets', keys: true, service: 'permissionPresets', member: Object.freeze(['names']) }),
    Object.freeze({ key: 'defaultPermissionPreset', row: 'permission', field: 'defaultPreset', service: 'permissionPresets', member: Object.freeze(['defaultPreset']) }),
    Object.freeze({ key: 'defaultAgentPreset', row: 'agent-preset-registry', field: 'default', service: 'agentPresets', member: Object.freeze(['defaultId']) }),
  ]),
  /**
   * The Cordis services the guards read, none injected (a missing one is "nothing to check"):
   * `profileContext` and `appReady` are read once at the row's start, the rest at each check.
   * `fishballInstance` is `EXTENSION_SERVICE` of src/slim/child/extensions.js, restated because that
   * module imports `fishball-connector/contract`, which a standalone core may not resolve.
   */
  services: Object.freeze({
    loader: 'loader',
    appReady: 'appReady',
    profileContext: 'profileContext',
    agentPresets: 'agentPresets',
    tools: 'tools',
    agents: 'agents',
    instance: 'fishballInstance',
  }),
  /** DSH's agent-registry event after a session's setup (create or resume), both SDKs. */
  agentCreated: 'agent/created',
  /**
   * The service this row provides: `report()`, `reorder()`, `onChange(listener)`. Not in K3's types;
   * the name is F-GUARDS's, kept as it was (owner DECIDED D7).
   */
  serviceName: 'fishballGuards',
  /** The guard module's Cordis plugin name (ui/patch/index.js `name`). */
  pluginName: 'fishball-ui',
  /** Core's own bundle name in `dsh.profile.bundles`. */
  bundleName: 'fishball-core',
  /** Core's patch, relative to `src/guards/`. */
  patchFile: '../../cordis.patch.yml',
  /** dsh-app-boot's diagnostic prefix for a malformed patch or manifest. */
  diagnostic: GUARDS_DIAGNOSTIC,
  /** The profile manifest the plugin manager locks for every bundle change (dsh-plugin-manager). */
  profileManifest: 'package.json',
  /**
   * The local record of the one reorder (R-FB-12: "recorded locally"): one file per profile under
   * `<DSH home>/fishball/guards/`, beside core's other records (`<home>/fishball/chat.json`). Its
   * content is the outcome as one JSON line, `lineEnd` terminated.
   */
  record: Object.freeze({ directory: Object.freeze(['fishball', 'guards']), suffix: '.reorder.json', mode: 0o600, directoryMode: 0o700, lineEnd: '\n' }),
  /** The logger name the row warns under. */
  logger: 'fishball-guards',
  /** Log and error texts (the logger's printf format). */
  text: Object.freeze({
    report: '%s: %s',
    reportSeparator: ', ',
    checkFailed: 'guard check failed (%s)',
    reorderFailed: 'the bundle reorder failed (%s); bundle-order stays reported',
    recordFailed: 'the bundle was moved last, but its reorder record could not be written (%s)',
    missingPolicy: (file, row, field) => `${GUARDS_DIAGNOSTIC}: ${file} sets no ${row}.${field}`,
  }),
  /** A missing record file (Node's fs error code). */
  notFound: 'ENOENT',
})
