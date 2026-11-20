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
 * Since requirements 1.39–1.41 (gate K3a) this file also holds core's own copy of the connector's
 * MCP surface (`MCP`), its link words (`LINK`), the hosted import's published names
 * (`HOSTED_IMPORT`) and Connect (`CONNECT`): the two sides
 * share no package, so core keeps its own values and a contract test checks them against the
 * connector. DECIDED Dn: the row of mcp-schema/README.md "User decisions", the one record of the
 * decisions of K1, K2 and K3.
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
  /**
   * WAKE: a batch cut at the max batch size (`n` wake events). Like the given-up notice it names
   * no payload. PROPOSED wording (model-facing English, Q7).
   */
  batchLimit: (n) => `Fishball notice: this batch reached the limit of ${n} events, so it was delivered at once. More events may follow in the next batch.`,
  /** WAKE: one silent event in the summary, by its id, type and the local id of its target. */
  silentLine: (event) => `- ${event.type} event ${event.eventId} from DSH target id ${event.source.targetId}`,
  /** WAKE: the summary of the silent events a batch carries, one `silentLine` each. */
  silentSummary: (lines) => `Fishball notice: these events were recorded without waking you (no action is needed for them):\n${lines.join('\n')}`,
})

/**
 * When an event on the Fishball branch wakes the Fishball agent (WAKE; the user's design,
 * 2026-11-21). Every event type is `wake` (delivered as part of an agent turn) or `silent`
 * (recorded; it never wakes Fishball by itself and rides along with the next delivery as a
 * summary line). Wake events are batched: each one restarts the quiet window, and when the window
 * passes with no new wake event, every buffered event goes to Fishball as one message. A buffer
 * holding `maxBatch` wake events is delivered at once with the `TEXT.batchLimit` notice.
 * - `class`: the two class words;
 * - `defaults`: the settings' defaults; a type not in `classes` (another contributed event) is
 *   `wake`. `state` stays listed although the connector no longer sends it (folded into tool
 *   results), so an older connector's `state` events stay quiet;
 * - `bounds`: the smallest valid window (0: deliver at the next idle) and max batch;
 * - `setting`: the settings' dotted paths in core's row namespace (nested, as `identity.id`);
 * - `msPerSecond`: the window's unit conversion.
 */
const WAKE_CLASS = Object.freeze({ wake: 'wake', silent: 'silent' })
export const WAKE = Object.freeze({
  class: WAKE_CLASS,
  defaults: Object.freeze({
    quietWindowSeconds: 10,
    maxBatch: 20,
    classes: Object.freeze({
      permission: WAKE_CLASS.wake,
      question: WAKE_CLASS.wake,
      'plan-review': WAKE_CLASS.wake,
      'turn-finished': WAKE_CLASS.wake,
      handover: WAKE_CLASS.wake,
      takeback: WAKE_CLASS.wake,
      message: WAKE_CLASS.wake,
      notice: WAKE_CLASS.wake,
      ask: WAKE_CLASS.wake,
      // The watchdog's drift event (dsh-connector-amenities), a contributed type.
      'contributed:dsh-connector-amenities.drift': WAKE_CLASS.wake,
      state: WAKE_CLASS.silent,
      settlement: WAKE_CLASS.silent,
      retirement: WAKE_CLASS.silent,
    }),
  }),
  bounds: Object.freeze({ quietWindowSeconds: 0, maxBatch: 1 }),
  setting: Object.freeze({ quietWindowSeconds: 'wake.quietWindowSeconds', maxBatch: 'wake.maxBatch', classes: 'wake.classes' }),
  msPerSecond: 1000,
})

/**
 * The message an event becomes in Fishball's session. Its id is derived from the `eventId`, so the
 * live admission (`user/message` with that id) is recognised as this event's. Since WAKE the
 * delivery list hands Fishball batches: one message for many events, whose id is its first
 * event's (so a one-event batch keeps the id it always had); its source names every event it
 * carries.
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

/**
 * The words of core's link status (`link.d.ts` `LinkStatus`; REM-DT-01; R-FB-03, R-FB-04,
 * R-HOST-10). Core's own since requirements 1.39: the two sides share no package, so the
 * connector's K1 `TARGET_STATE` / `TARGET_CODE` / `LINK_REFUSAL` are the DSH side's copy and these
 * are the Fishball side's (requirements 1.40: "duplicated, one copy per side"). They never travel
 * over MCP, so no drift test compares them.
 * - `code.insecure` / `code.invalid`: core's refusals of a target URL before any request
 *   (DECIDED D5), reported with state `target-unset`;
 * - `disconnected`: the answer of a call made while the link is down; it never reached the target;
 * - `hosts`: the target URL rule's loopback names and schemes (R-REM-05: plain `http:` only to a
 *   loopback name), a fact of the MCP and OAuth specifications rather than of the connector.
 */
export const LINK = Object.freeze({
  state: Object.freeze({
    connected: 'connected',
    unreachable: 'target-unreachable',
    refused: 'token-refused',
    unset: 'target-unset',
  }),
  code: Object.freeze({
    unreachable: 'TARGET_UNREACHABLE',
    refused: 'TOKEN_REFUSED',
    incompatible: 'TARGET_INCOMPATIBLE',
    revoked: 'token-revoked',
    insecure: 'target-insecure',
    invalid: 'target-invalid',
  }),
  disconnected: 'disconnected',
  hosts: Object.freeze({
    loopbackNames: Object.freeze(['localhost', '127.0.0.1', '[::1]']),
    loopbackScheme: 'http:',
    remoteScheme: 'https:',
  }),
  /** HTTP statuses the link classifies by (RFC 9110): a refused credential, or a V2 connector's 404. */
  httpStatus: Object.freeze({ unauthorized: 401, forbidden: 403, notFound: 404 }),
})

// ------------------------------------------------------------------------- the connector's MCP surface (core's own copy)

// Built once here so each path below is written once (the connector derives its well-known URLs
// the same way: RFC 9728 §3.1 / RFC 8414 §3.1 insert the well-known segment before the path).
const MCP_PATH = '/api/agent/mcp'
const ISSUER_PATH = '/api/agent/oauth'

/**
 * The values of `dsh-connector`'s public MCP surface that core uses, as core's **own copy**
 * (design §1.0b row 1, decided item 65 / D1; requirements 1.39, 1.40: no package crosses the two
 * sides, so core may not import or generate from the connector). They replaced the generated
 * `vendor/mcp-schema` copy (F-OWN-SCHEMA): core's link, identity, bridge and events read them here,
 * and `src/link/schema.js` holds the pure rules derived from them (id, name, event type, issuer).
 * The names are those of design §1.0c (requirements 1.41 Q-G8 = B).
 *
 * Drift is caught by the contract tests `test/v3/contract/k3a-core-seams/` and
 * `test/v3/contract/own-schema/`, which compare every value here with what
 * the connector publishes (its `tools/list` definitions and its OAuth metadata documents). A value
 * changes here only after the connector's own K1 changed it; the test then names the difference.
 *
 * - `protocolVersion`: the one MCP revision the connector serves, pinned by core's link (Q12);
 * - `paths`: the MCP endpoint, the OAuth issuer and token endpoint, the two well-known prefixes and
 *   the approval page's `/authorize`; with `scope.full` they are also the connector check of
 *   Connect (Q-S7C-5 A): the protected-resource `resource` path is `paths.mcp`, its first
 *   authorization server is the same origin plus `paths.issuer`, and its scopes include `full`;
 * - `events`: the one event resource core listens on (R-EVS-01);
 * - `identity`, `serverIdentity` (MULTI-0): the readable identity resource core also subscribes to
 *   on the same listen stream, where `server/discover` carries the server's name, and the standard
 *   notification that hints a rename (core rediscovers at once on it; no polling);
 * - `tools`: every core tool name `tools/list` lists (core tells core tools from contributed ones
 *   by this list, design §13.3);
 * - `eventTypes`, `contributedTypePrefix`: the event `type` vocabulary (R-EVS-02, K2);
 * - `refusal`: the refusal codes core reacts to (pairing, names, the bridge façade's own answers,
 *   and the ask card's first-commit-wins answers);
 * - `oauth`: the grants, client authentications and errors of core's two credential paths
 *   (`client_credentials` for the hosted import, authorization code + PKCE for Connect), and the
 *   authorization parameter that carries core's `identity.id` (`agent_id`, R-OA-22, design §1.0c);
 * - `id`, `name`: R-ID-02 and R-NAME-02/08, as strings (core compiles the patterns, flags `u`), so
 *   this file stays data only;
 * - `namespace`: K2's contributed-name rules core needs to read a contributed event type and to
 *   name a contributed tool for the model (`externalName`, DECIDED #W3-2).
 */
export const MCP = Object.freeze({
  protocolVersion: '2026-07-28',
  clientCredentialsExtension: 'io.modelcontextprotocol/oauth-client-credentials',
  paths: Object.freeze({
    mcp: MCP_PATH,
    issuer: ISSUER_PATH,
    token: ISSUER_PATH + '/token',
    protectedResourcePrefix: '/.well-known/oauth-protected-resource',
    authorizationServerPrefix: '/.well-known/oauth-authorization-server',
    authorize: '/authorize',
  }),
  events: Object.freeze({ name: 'agent-events', uri: 'dsh-agent://events', mimeType: 'application/json' }),
  // MULTI-0: K1 `RESOURCE.identity` and `SERVER_IDENTITY` (the live-rename push, PLAN-MULTI §4.3).
  // `suffix` is restated for the drift test only: core shows the raw name and never strips it.
  identity: Object.freeze({ name: 'dsh-identity', uri: 'dsh-agent://identity', mimeType: 'application/json' }),
  serverIdentity: Object.freeze({ suffix: '-DSH', discoverMetaKey: 'io.modelcontextprotocol/serverInfo', updatedNotification: 'notifications/resources/updated' }),
  scope: Object.freeze({ full: 'agent', pair: 'agent:pair' }),
  tools: Object.freeze({
    sessionsList: 'sessions_list',
    // The connector's two listing tools for session_start's `folder` (a workspaceId) and `model`.
    workspacesList: 'workspaces_list',
    modelsList: 'models_list',
    sessionStart: 'session_start',
    sessionMessage: 'session_message',
    sessionRedirect: 'session_redirect',
    sessionStop: 'session_stop',
    sessionRead: 'session_read',
    sessionRelease: 'session_release',
    approvalsList: 'approvals_list',
    approvalAnswer: 'approval_answer',
    questionAnswer: 'question_answer',
    promptsList: 'prompts_list',
    promptAnswer: 'prompt_answer',
    grantsList: 'grants_list',
    grantRevoke: 'grant_revoke',
    attachmentPut: 'attachment_put',
    attachmentRead: 'attachment_read',
    inboxPoll: 'inbox_poll',
    inboxAck: 'inbox_ack',
    pair: 'pair',
    setName: 'set_name',
  }),
  eventTypes: Object.freeze({
    permission: 'permission',
    question: 'question',
    planReview: 'plan-review',
    settlement: 'settlement',
    retirement: 'retirement',
    turnFinished: 'turn-finished',
    state: 'state',
    message: 'message',
    ask: 'ask',
    handover: 'handover',
    takeback: 'takeback',
    notice: 'notice',
  }),
  contributedTypePrefix: 'contributed:',
  refusal: Object.freeze({
    alreadyPaired: 'already-paired',
    idTaken: 'id-taken',
    idInvalid: 'id-invalid',
    nameInvalid: 'name-invalid',
    nameTaken: 'name-taken',
    forbidden: 'forbidden',
    unsupportedOperation: 'unsupported-operation',
    operationFailed: 'operation-failed',
    imagesUnsupported: 'images-unsupported',
    invalidArguments: 'invalid-arguments',
    alreadySettled: 'already-settled',
    expired: 'expired',
  }),
  oauth: Object.freeze({
    grant: Object.freeze({ clientCredentials: 'client_credentials', authorizationCode: 'authorization_code', refreshToken: 'refresh_token' }),
    clientAuth: Object.freeze({ basic: 'client_secret_basic', none: 'none' }),
    responseType: 'code',
    pkceMethod: 'S256',
    error: Object.freeze({ invalidClient: 'invalid_client', invalidGrant: 'invalid_grant', accessDenied: 'access_denied' }),
    agentIdParameter: 'agent_id',
  }),
  id: Object.freeze({ pattern: '^[A-Za-z0-9_-]{1,64}$' }),
  name: Object.freeze({
    minChars: 1,
    maxChars: 64,
    whitespaceRun: '\\p{White_Space}+',
    control: '[\\p{Cc}\\p{Cf}]',
    patternFlags: 'u',
    space: ' ',
    normalForm: 'NFC',
    namelessPrefix: 'ID: ',
  }),
  namespace: Object.freeze({
    separator: '.',
    outside: '[^a-z0-9-]',
    identifying: '[a-z0-9]',
    reserved: Object.freeze(['fishball', 'dsh-connector']),
    localName: '^(?!.*\\.$)[a-z0-9][a-z0-9_.-]{0,47}$',
    publicMaxChars: 128,
    aliases: Object.freeze({ 'dsh-connector-ui': 'embed-ui' }),
    externalName: Object.freeze({ replaced: '.', replacement: '__' }),
  }),
})

/**
 * The approval words of the connector's published `approval_answer` input schema (its `answer`
 * object's `decision` and `risk` enums), an offer descriptor's `argumentsStatus` words, and the `approvals_list` refusal that says the asked
 * session is gone. Core's ask cards (F-ASKCARD) answer and reconcile with them. They sit beside
 * `MCP`, not in it, because `MCP.refusal` is K3a's frozen set; `test/v3/contract/own-schema/`
 * checks every value here against the connector, as for `MCP` (Fishball's decision, 2026-11-16,
 * after F-OWN-SCHEMA removed the vendored V2 contract they were read from). No `ask`: the
 * connector's `approval_answer` refuses it (the user, 2026-11-17: "Refuse it"; X-SEC X-02), so core
 * neither sends nor offers it (F-FIX).
 */
export const APPROVAL = Object.freeze({
  decision: Object.freeze({ allow: 'allow', grant: 'grant', reject: 'reject', escalate: 'escalate' }),
  risk: Object.freeze({ low: 'low', high: 'high' }),
  /** An offer descriptor's `argumentsStatus` (K1 ARGUMENTS_STATUS); only `complete` arguments can be allowed (the connector's `arguments-incomplete`). */
  argumentsStatus: Object.freeze({ complete: 'complete', truncated: 'truncated', unavailable: 'unavailable' }),
  refusal: Object.freeze({ unknownSession: 'unknown-session' }),
})

// ------------------------------------------------------------------------- the hosted import (link.d.ts)

/**
 * How a hosted child's token and target reach core (requirements 1.39, 1.41 Q-G6 = A; design
 * §1.0b row 4, §5.4, §6.3). No code crosses the sides: the instance's child-side row (DSH side)
 * writes DSH state under these published names, and core reads it through DSH's own services.
 * The instance keeps its own copy of these names (I-HOST), so it imports nothing from core.
 * - `credentialRef`: the child credential reference the instance writes the imported token to
 *   (`ctx.credentials.set`). The user named it `dsh-agent-token`; DSH's reference grammar on both
 *   SDKs is `^[A-Za-z_][A-Za-z0-9_]*$` (`credentialRef`), which refuses a `-`, so the name is
 *   spelled in that grammar (the user's choice, 2026-11-16). Core resolves it as its client secret,
 *   and unsets it once it saved its own copy (design §5.4);
 * - `targetSetting`: the child setting with the target URL. DSH addresses a setting by its profile
 *   row id, and core's guard disables the row `dsh-instance` (no nested hosted Fishball), so the
 *   instance's child-side row has its own id (the user's choice, 2026-11-16);
 * - `savedRecord`: the credential record core saves the accepted hosted token into (R9). Its key is
 *   published so the instance can tell "the child holds a credential" without calling core: either
 *   `describe(credentialRef).configured` or `describeRecord(savedRecord.key).configured` (the
 *   user's choice, 2026-11-16, because the reference is gone once core saved its copy).
 */
// Core's credential-record scope (DSH's `<scope>/<id>` key: the owning plugin's name), shared by
// the hosted record and Connect's grants so the scope is written once.
const CORE_RECORD_SCOPE = 'fishball-core'
export const HOSTED_IMPORT = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  targetSetting: Object.freeze({ row: 'dsh-instance-child', field: 'targetUrl' }),
  savedRecord: Object.freeze({ key: CORE_RECORD_SCOPE + '/hosted-agent', kind: 'grant' }),
})

// ------------------------------------------------------------------------- Connect (link.d.ts)

/**
 * Connect: core as a browser OAuth client of the connector's approval page (design §6.3a;
 * R-FB-03, R-OA-19; requirements 1.31–1.33; decided items 11, 12, 67). The states are the S7c
 * token manager's (`v3-s7c.md` §4 K1), kept by core's own copy of it (`src/link/oauth-client.js`,
 * design §6.3a "one copy per side").
 * - `setting`: core's required CIMD document URL (R12 = B: user-hosted, no default);
 * - `configuration`: the `needs-configuration` codes, one per failing rule (decided item 12:
 *   `https:` and a non-root path, as the adapter's), plus a target that fails the connector check
 *   (Q-S7C-5 A) and an unusable web callback (R-OA-14: no plain-HTTP non-loopback redirect);
 *   PROPOSED spellings;
 * - `callback`: the loopback redirect path, any port (decided item 11), and the fixed path of core's
 *   owner-only web callback route for a browser on another machine (Q-A3 B; PROPOSED path);
 * - `grantRecordScope`: the scope segment of the credential records Connect saves its grants under,
 *   one per target origin (R9); the id segment is core's own (F-LINK-SAVE).
 */
export const CONNECT = Object.freeze({
  state: Object.freeze({
    needsConfiguration: 'needs-configuration',
    needsAuthorization: 'needs-authorization',
    authorizing: 'authorizing',
    authorized: 'authorized',
    failed: 'failed',
  }),
  setting: 'connect.clientMetadataUrl',
  configuration: Object.freeze({
    metadataUrlMissing: 'metadata-url-missing',
    metadataUrlNotHttps: 'metadata-url-not-https',
    metadataUrlRootPath: 'metadata-url-root-path',
    notAConnector: 'not-a-connector',
    webCallbackInsecure: 'web-callback-insecure',
  }),
  callback: Object.freeze({ loopbackPath: '/callback', webPath: '/api/fishball/connect/callback' }),
  grantRecordScope: CORE_RECORD_SCOPE,
})

// ------------------------------------------------------------------------- Fishball's model (F-WIRE)

/**
 * Fishball's own model choice (the user, 2026-11-16: "同步只是同步model list，至于fishball用什么还要在
 * fishball内设置"; "所有版本：先用DSH的默认模型"): a field of core's own row settings, `{provider, model,
 * reasoningEffort?}`; absent means this DSH's default model, and nothing ever blocks on it. Only
 * core's settings page and fishball-ui's model dialog write it (no DSH-side package reads it, the
 * user's cancellation of U-MODEL, 2026-11-16). `settingsNamespace` is core's main row id, the
 * namespace DSH's `settings.mutate` addresses; `path` is the field inside it.
 */
export const FISHBALL_MODEL = Object.freeze({
  settingsNamespace: CORE_RECORD_SCOPE,
  path: Object.freeze(['model']),
})

// ------------------------------------------------------------------------- the fishball-ui seam (ui.d.ts)

// `UI_SEAM` moved unchanged to `fishball-shared/ui-seam` (F-UI, as K3a announced): fishball-ui
// loads without core (Q-G2), so it cannot import this file, and core reads it from there too.

// ------------------------------------------------------------------------- guards (guards.d.ts)

/** dsh-app-boot's diagnostic prefix, also the prefix of core's own patch errors. */
const GUARDS_DIAGNOSTIC = 'fishball-core'

/**
 * The guard values core's code reads (design §5a.2; R-FB-02, R-FB-09, R-FB-12, R-FB-13). Every value `guards.d.ts` names has its K3 spelling there; the service name, record
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
  /** The IntendedPolicy key whose value is the manager's agent preset (core's patch sets it). */
  managerPresetKey: 'defaultAgentPreset',
  /**
   * ManagerTool: the manager's model tools, exactly (R-FB-13). `ask_user_question` is DSH's
   * ask-user plugin in core's preset (the user, 2026-11-18: Fishball asks with DSH's own tool).
   */
  managerTools: Object.freeze(['read', 'read_image', 'working_directory', 'ask_user_question']),
  /**
   * Core's own model tools, by module (relative to `src/guards/`) and exported name table (user
   * decision 2026-11-14: core's tools are not the preset's and are left out of the R-FB-13 check).
   * Loaded lazily, because these modules import DSH host packages (`@deepseek-ai/*`) that resolve
   * only inside DSH; a module that cannot load registers no tools, so its names cannot appear.
   */
  coreTools: Object.freeze([
    Object.freeze({ module: '../manager/reminders.js', table: 'TOOL' }),
    Object.freeze({ module: '../manager/skills.js', table: 'PRIVATE_SKILL_TOOL' }),
    Object.freeze({ module: '../asks/constants.js', table: 'ASK_TOOL' }),
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
   * `fishballInstance` is the service core's main row (`src/main/`) provides, restated here because
   * this file imports nothing (the K3 freeze above).
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
  /** Cordis's event for a service provided, replaced or withdrawn (both SDKs), with its name. */
  serviceEvent: 'internal/service',
  /**
   * The service this row provides: `report()`, `reorder()`, `onChange(listener)`. Not in K3's types;
   * the name is F-GUARDS's, kept as it was (owner DECIDED D7).
   */
  serviceName: 'fishballGuards',
  /**
   * The guard row's id and Cordis plugin name (src/guards/row.js `name`). It was `fishball-ui`
   * until F-UI made fishball-ui a package of its own.
   */
  pluginName: 'fishball-core-guards',
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

// ------------------------------------------------------------------------- multiple targets (targets.d.ts; MULTI-0)

/**
 * Core's side of multiple DSH targets (MULTI-0 freeze, 2026-11-18; PLAN-MULTI §3–§5, §7). What
 * fishball-ui also reads (states, kinds, routes, refusals) is `fishball-shared/ui-seam`'s
 * `SEAM_TARGETS`, not restated here. Every local key derived from a remote id carries the
 * locally generated `(targetId, endpointEpoch)`; server-supplied names never route anything.
 *
 * - `id` / `epoch`: the generated id formats (`prefix` + `randomChars` letters of `alphabet`, as
 *   `identity.id`'s generator: one random byte masked per letter). `parentId` is the hosted
 *   child's reserved parent, the only id not generated. Both fit DSH's credential-key segment
 *   grammar `[a-z][a-z0-9-]*` and hold no `_`;
 * - `store`: the durable target records (`TargetRecord`, keyed by id), one DSH storage table;
 * - `key`: the one collision-free tuple encoding of every local key and opaque handle. A key is
 *   `JSON.stringify([kind, targetId, endpointEpoch, remoteId])` (a JSON array: no delimiter can
 *   make two tuples meet); a handle or message id that must be a plain token is that JSON's UTF-8
 *   bytes in `encoding` (base64url, `[A-Za-z0-9_-]`). Kinds keep an event, an approval and a
 *   session with the same remote id apart. The manager message id of an event is
 *   `MESSAGE.idPrefix + handle(event tuple)`, so two targets' `event-1` never dedupe;
 * - `credentials`: per-target credential names. The parent alone uses `HOSTED_IMPORT`'s names
 *   (`DSH_AGENT_TOKEN`, `fishball-core/hosted-agent`) and core's internal pending-origin record
 *   (`src/link/constants.js` `LINK_SAVE.pendingOrigin`, `fishball-core/pending-token-origin`); an added target
 *   never reads or writes them, so it can never satisfy the instance's hosted probe. An added
 *   target's token entry is the reference `tokenRefPrefix + <id> + tokenRefSeparator + <epoch>`, with
 *   every `-` written `_` (DSH's reference grammar `^[A-Za-z_][A-Za-z0-9_]*$`); its saved token copy
 *   and its Connect grant are the records `fishball-core/<tokenRecordPrefix|grantRecordPrefix><id>-<epoch>`
 *   (the parent's grant too: `connect-parent-<epoch>`). Records still carry the canonical origin
 *   and agent-id binding they carry today. No per-target pending-origin record (review S3): the
 *   reference's name holds the epoch, and every endpoint change makes a new epoch, so a value
 *   written for one endpoint is never read for another; the parent keeps its record because its
 *   reference name (`DSH_AGENT_TOKEN`) is fixed. Fixed names do not waive endpoint isolation:
 *   `bindingField` holds `TargetCredentialBinding` in every core-private saved/pending credential
 *   payload, including both fixed parent records. The pending record also binds the non-secret
 *   reference-value id. All of target id, endpoint epoch, canonical origin and agent id must match
 *   before use, save or unset; a same-origin endpoint change retires the old binding too. A late
 *   completion cannot save, unset or rebind another generation's credential (link.d.ts);
 * - `duplicate`: the Fishball-local display alias of an equal name (D07, Q03): `name + open + n +
 *   close`, n from `firstSuffix`, the lowest n whose complete result no other current target holds
 *   (a literal server name ending in ` (2)` counts). Persisted in the record; never renumbers;
 * - `toolName`: the model-facing name of every exposed remote tool and of the target-bound local
 *   `ask_user` (PLAN-MULTI §4.4): `prefix + readable + separator + facade + digestSeparator + digest`,
 *   at most `maxChars`, all of `allowed`:
 *   - readable: the resolved `name` NFKD-normalised, each run of characters outside `[A-Za-z0-9]`
 *     (combining marks included: `résumé` → `re-sume`) made one `-`, lower-cased, `-` trimmed at both ends, cut to `readableMaxChars`, `-` trimmed
 *     again; `readableFallback` when nothing is left (`name` null or nothing ASCII);
 *   - facade: the K2 dotted public name with every `.` written `__` (`MCP.namespace.externalName`),
 *     or the core tool / local helper name unchanged; cut from the end to the room left;
 *   - digest: the first `digestHexChars` lowercase hex of SHA-256 over the UTF-8 of
 *     `JSON.stringify([digestVersion, targetId, endpointEpoch, name, origin, rawName])`, origin one of
 *     `origin` (`remote` for a listed tool, `local` for `ask_user`), so no two bindings share a name
 *     by construction except by a hash collision, which registration still detects;
 *   - a final name already bound, now or by a retired binding (`bindingStore`), to another tuple is
 *     never registered: that tool fails closed and is logged, it never overwrites. Withheld tools
 *     (core-internal `src/bridge/constants.js` `FACADE.withheld`) and reminder/skill tools are not
 *     namespaced; raw names and arguments go to
 *     the connector unchanged;
 * - `text.toolSource` (PROPOSED wording, plan §4.4 "descriptions include plain-text resolved
 *   source names"): the INNER untrusted text of every namespaced tool's source description, not
 *   a safe standalone prefix. `quotedName` is `JSON.stringify(name)` (or of the placeholder word
 *   when `name` is null). JSON encoding alone is not the required trust boundary: callers MUST
 *   enclose the entire formatter result using the existing `src/bridge/constants.js` `TEXT`
 *   `untrustedOpen(marker)` / `untrustedClose(marker)` with a fresh locally generated randomUUID
 *   marker, before appending the trusted facade description. Never interpolate a server name
 *   outside that block, even in persona guidance; the persona names the same tools by role
 *   (README examples). Reuse the existing framing constants, do not define a second set here.
 */
// The lowercase RFC 4648 base32 alphabet, as `identity.id`'s generator (src/identity/constants.js).
const TARGET_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'
// DSH host model-facing tool names: at most 64 of [A-Za-z0-9_-] (PLAN-MULTI §4.4).
const TOOL_NAME_MAX_CHARS = 64
export const TARGETS = Object.freeze({
  parentId: 'parent',
  id: Object.freeze({ prefix: 't-', randomChars: 16, alphabet: TARGET_ID_ALPHABET }),
  epoch: Object.freeze({ prefix: 'e-', randomChars: 16, alphabet: TARGET_ID_ALPHABET }),
  store: Object.freeze({ domain: 'fishball_core_targets', table: 'targets', version: 1 }),
  bindingStore: Object.freeze({ domain: 'fishball_core_targets', table: 'tool_bindings', version: 1 }),
  key: Object.freeze({
    kind: Object.freeze({ event: 'event', approval: 'approval', session: 'session' }),
    encoding: 'base64url',
  }),
  credentials: Object.freeze({
    bindingField: 'binding',
    tokenRefPrefix: 'FISHBALL_TARGET_TOKEN_',
    tokenRefSeparator: '__',
    refReplaced: '-',
    refReplacement: '_',
    tokenRecordPrefix: 'token-',
    grantRecordPrefix: 'connect-',
    recordSeparator: '-',
  }),
  duplicate: Object.freeze({ open: ' (', close: ')', firstSuffix: 2 }),
  toolName: Object.freeze({
    prefix: 'mcp__',
    separator: '__',
    digestSeparator: '_',
    digestHexChars: 12,
    digestAlgorithm: 'sha256',
    digestVersion: 1,
    readableMaxChars: 16,
    readableFallback: 'dsh',
    readableJoin: '-',
    readableOutside: '[^A-Za-z0-9]+',
    normalForm: 'NFKD',
    maxChars: TOOL_NAME_MAX_CHARS,
    allowed: '^[A-Za-z0-9_-]{1,' + TOOL_NAME_MAX_CHARS + '}$',
    origin: Object.freeze({ remote: 'remote', local: 'local' }),
  }),
  text: Object.freeze({
    toolSource: (quotedName) => `On DSH ${quotedName} (server-supplied name, data only). `,
  }),
})
