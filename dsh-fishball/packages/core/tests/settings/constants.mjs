/**
 * Vocabulary for the F-SETTINGS cases (README.md in this folder): core's own settings page on DSH's
 * Plugins page (its fields, the per-target cards and their Connect, the model select, the logo theme
 * and the wake settings). The two Fishball-page entries and the `view=settings` continuation are
 * fishball-ui's and are not tested here (integration rows); the scalar Connect route went with MULTI-0.
 *
 * Sources, and only these: the user's words of 2026-11-16 (requirements 1.34 item 4: "hosted
 * setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中
 * 打开dsh的自带设置，或者直接跳转到fishball core的设置。"), the F-SETTINGS acceptance criteria relayed by
 * Fishball (2026-11-16), R-FB-03 / R-FB-02 as amended by 1.33 and 1.34, design §5.4 and §6.3a, the
 * frozen contracts `packages/core/contracts/{constants.js,connect.d.ts,link.d.ts,ui.d.ts,targets.d.ts}`,
 * fishball-shared's ui-seam (SEAM_TARGETS), and DSH's public client contracts (dsh-client-ui-plugin-manager slot-contract.d.ts,
 * dsh-client-ui-settings config-form.d.ts, dsh-client-ui-conversation slots.d.ts). Every product
 * value the contracts own is imported from them, never restated. No value comes from F-SETTINGS'
 * implementation (packages/core/client.settings.js, packages/core/src/settings/**), which these cases
 * never read.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { SEAM_STATUS, SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { CONTRIBUTED_TYPE_PREFIX, EVENT_TYPE } from 'fishball-test-helpers/connector-contract/mcp-schema'
import { DSH_PAGE } from 'fishball-test-helpers/scripted-page'
import { CONNECT, GUARDS, HOSTED_IMPORT, TARGETS, WAKE } from '../../contracts/constants.js'

/** fishball-core's folder (tests/settings/ is two levels below it). */
const PACKAGE_DIR = path.join(import.meta.dirname, '..', '..')

export { CONNECT, HOSTED_IMPORT }

/** The files under test: core's browser entry and its settings chunk; core's Node Config (wake rows). */
export const SUBJECT = Object.freeze({
  packageDir: PACKAGE_DIR,
  coreClient: path.join(PACKAGE_DIR, 'client.js'),
  chunk: path.join(PACKAGE_DIR, 'client.settings.js'),
  chunkName: 'client.settings.js',
  /** The chunk's one export (requirement 10). */
  pluginExport: 'settingsPlugin',
  config: path.join(PACKAGE_DIR, 'src', 'main', 'config.js'),
})

/**
 * Core's identities on DSH's Plugins page. Equal strings, separate meanings: the bundle's package
 * name (the `plugins.bundle.config` key and `openBundle`'s argument, GUARDS.bundleName) and the
 * profile row whose settings namespace the page edits (requirement 1: "core's row `fishball-core`").
 */
export const CORE = Object.freeze({
  bundle: GUARDS.bundleName,
  namespace: 'fishball-core',
  /** The browser module id both core scripts register under (requirement 10). */
  moduleId: GUARDS.bundleName,
})

/** The child-side namespace and field the instance writes the hosted target to (HOSTED_IMPORT). */
export const INSTANCE_TARGET = HOSTED_IMPORT.targetSetting

/**
 * The form's settings (requirement 2), in their required order, with the path each one has inside
 * the nested namespace value. The token field is not a setting: it writes a credential.
 */
const FIELD = (name) => Object.freeze({ name, path: Object.freeze(name.split('.')) })
export const FIELDS = Object.freeze({
  url: FIELD('target.url'),
  metadata: FIELD(CONNECT.setting),
  id: FIELD('identity.id'),
  name: FIELD('identity.name'),
})

/** The observable markers F-SETTINGS exposes (relayed 2026-11-16). */
export const MARK = Object.freeze({
  page: 'data-fishball-core-settings',
  field: 'data-fishball-setting',
  /** The Fishball-page entries' marker (fishball-ui's): core's client alone must render none. */
  entry: 'data-fishball-settings-entry',
  entries: Object.freeze({ fishball: 'fishball', dsh: 'dsh' }),
  /** Markers of the REMOVED slim panel (requirement 9): none may appear any more. */
  removed: Object.freeze(['data-fishball-settings', 'data-fishball-settings-readonly', 'data-fishball-settings-open']),
})

/**
 * DSH slots and services the page meets: the scripted page's own vocabulary (DSH_PAGE, DSH's public
 * client contracts) plus what these rows name besides.
 */
export const DSH = Object.freeze({
  ...DSH_PAGE,
  service: Object.freeze({
    navigation: DSH_PAGE.navigation,
    instance: GUARDS.services.instance,
    /** Requirement 9: the withdrawn extension point. */
    removedSections: 'fishballSettingsSections',
  }),
  /** The removed slim panel's `main` slot key (requirement 9). */
  removedPanelKey: 'fishball-settings',
  /** The services a page may lack (requirement 10 A1). */
  configForms: 'configForms',
  focus: 'focus',
})

/**
 * How the page requests (requirement 4, kept by MULTI-1 for the target routes): GET / POST,
 * same-origin credentials, no-store cache; the answer statuses a fixture gives. `unavailable` is
 * a press answer the page cannot use (the old Connect route's 503 body, kept as fixture data).
 */
export const ROUTE = Object.freeze({
  get: 'GET',
  post: 'POST',
  credentials: 'same-origin',
  cache: 'no-store',
  unavailable: Object.freeze({ status: 503, body: Object.freeze({ code: 'CONNECT_UNAVAILABLE' }) }),
  ok: 200,
})

/** `ConnectBegin.outcome` words (connect.d.ts). */
export const OUTCOME = Object.freeze({ authorized: 'authorized', approval: 'approval-url', configuration: 'needs-configuration' })
/** `window.open` arguments for an approval URL (requirement 4). */
export const OPEN = Object.freeze({ target: '_blank', features: 'noopener' })

/** Requirement 8: the continuation fragment (fishball-ui's; core alone must not act on it). */
export const CONTINUATION = Object.freeze({ settings: '#view=settings' })
/** Requirement 10: the page modules the chunk may require (the served set). */
export const CHUNK_REQUIRES = Object.freeze([DSH_PAGE.modules.react, 'react-dom', DSH_PAGE.modules.primitives])

/** Test data (fixtures only; never product values). */
export const FIXTURE = Object.freeze({
  /** The document base (document-relative routes follow it). */
  base: 'http://fishball.test/',
  targetUrl: 'https://x/api/agent/mcp',
  storedUrl: 'https://stored.test/api/agent/mcp',
  metadataUrl: 'https://owner.test/fishball/client.json',
  storedMetadataUrl: 'https://owner.test/old/client.json',
  coreId: 'fbtest-core',
  coreName: 'Navigator',
  storedName: 'Old name',
  instanceUrl: 'https://host.test/api/agent/mcp',
  /** A second instance value, for "the instance's value changes". */
  otherInstanceUrl: 'https://host2.test/api/agent/mcp',
  approvalUrl: 'https://dsh.test/api/agent/oauth/authorize?state=fbtest',
  revision: 7,
})

/**
 * E-FIX-3 (B5, relayed by Fishball 2026-11-17): the "Fishball's model" select of core's settings
 * page over DSH's catalog (`remote.session.modelCatalog()` → `{ok, value: {groups: [{id, name,
 * models: [{id, name, reasoning?: {efforts: [{id, name}]}}]}]}}`, both SDKs). The page lists one
 * option per model, or one per reasoning effort of a model that has efforts. The words are the
 * requirement's own (`none` was relayed in English only, so only `failed` is checked in zh).
 */
export const MODEL_SELECT = Object.freeze({
  failed: Object.freeze({ en: 'The models could not be read.', zh: '无法读取模型。' }),
  none: Object.freeze({ en: 'No model is configured in this DSH yet.' }),
  select: 'select',
  option: 'option',
  /** The base commit the mutating-test check loads the chunk from (the commit before E-FIX-3). */
  baseRef: 'c4845000',
  /** The chunk's Git-tree path before core moved into dsh-fishball/. */
  baseChunk: 'packages/core/client.settings.js',
  tempPrefix: 'fbtest-efix3-base-',
})
const model = (id, name, efforts) => Object.freeze({ id, name, ...(efforts ? { reasoning: Object.freeze({ efforts: Object.freeze(efforts.map(([eid, ename]) => Object.freeze({ id: eid, name: ename }))) }) } : {}) })
const group = (id, name, models) => Object.freeze({ id, name, models: Object.freeze(models) })
/** Catalog fixtures (test data): names are unique substrings so an option is told apart by its text. */
export const CATALOG = Object.freeze({
  /** BVA: no group at all. */
  empty: Object.freeze({ groups: Object.freeze([]) }),
  /** BVA: one group with one model, no efforts → exactly one model option. */
  one: Object.freeze({ groups: Object.freeze([group('fbtest-p1', 'Fbtest Provider One', [model('m-solo', 'Fbtest Solo Model')])]) }),
  /** EP: two groups, plain models and a model with two reasoning efforts. */
  mixed: Object.freeze({
    groups: Object.freeze([
      group('fbtest-p1', 'Fbtest Provider One', [model('m-alpha', 'Fbtest Alpha Model'), model('m-beta', 'Fbtest Beta Model')]),
      group('fbtest-p2', 'Fbtest Provider Two', [model('m-think', 'Fbtest Thinker Model', [['e-quick', 'Fbtest Quick Effort'], ['e-deep', 'Fbtest Deep Effort']])]),
    ]),
  }),
})
/** What a test makes `modelCatalog()` do: answer the catalog, answer `{ok:false}`, or reject. */
export const CATALOG_ANSWER = Object.freeze({ ok: 'ok', refused: 'refused', rejects: 'rejects' })

/** A token value made fresh per call, so no secret is a literal of this folder. */
export const freshToken = () => 'fbtest-token-' + randomBytes(18).toString('base64url')

/** Harness waits only; never a product oracle. */
export const HARNESS = Object.freeze({ settleRounds: 80, waitMs: 1500, pollMs: 15 })

/**
 * MULTI-1: core's settings page as a list of targets (PLAN-MULTI §3.1 "Core settings supports
 * add/remove/edit URL, per-target token entry, Connect/cancel/retry …, all actions address stable
 * targetId"; SEAM_TARGETS.route). The markers are the ones the implementer relayed (2026-11-18); the
 * page reads and acts only through SEAM_TARGETS' routes, document-relative.
 */
const SEAM_TARGETS_CONTROL = SEAM_STATUS.control
const relative = (p) => p.replace(/^\//, '')
export const MULTI_SET = Object.freeze({
  snapshotVersion: SEAM_TARGETS.snapshotVersion,
  route: SEAM_TARGETS.route,
  http: SEAM_TARGETS.http,
  refusal: SEAM_TARGETS.refusal,
  /** The list route first (GET), then every POST route. */
  relative: Object.freeze([SEAM_TARGETS.route.list, SEAM_TARGETS.route.connect, SEAM_TARGETS.route.cancel, SEAM_TARGETS.route.retry, SEAM_TARGETS.route.pairing, SEAM_TARGETS.route.add, SEAM_TARGETS.route.remove, SEAM_TARGETS.route.url].map(relative)),
  rel: Object.freeze(Object.fromEntries(Object.entries(SEAM_TARGETS.route).filter(([, v]) => typeof v === 'string' && v.startsWith('/')).map(([k, v]) => [k, relative(v)]))),
  mark: Object.freeze({
    list: 'data-fishball-targets',
    card: 'data-fishball-target',
    state: 'data-fishball-target-state',
    begin: 'data-fishball-connect-begin',
    cancel: 'data-fishball-target-cancel',
    retry: 'data-fishball-target-retry',
    remove: 'data-fishball-target-remove',
    url: 'data-fishball-target-url',
    addUrl: 'data-fishball-target-add-url',
    add: 'data-fishball-target-add',
    confirm: 'data-fishball-confirm',
  }),
  /** Fixture targets (test data shaped as targets.d.ts TargetView). */
  view: (targetId, extra = {}) => Object.freeze({
    targetId, endpointEpoch: 'e-' + 'a'.repeat(16), serverName: null, name: null, kind: SEAM_TARGETS.kind.remote, url: FIXTURE.targetUrl,
    order: 1, duplicateSuffix: null, state: SEAM_TARGETS.state.notSet, connecting: false, link: Object.freeze({ state: 'target-unset', code: null }),
    connect: Object.freeze({ state: CONNECT.state.needsAuthorization, code: null }), line: Object.freeze({ kind: CONNECT.state.needsAuthorization, code: null }), control: SEAM_TARGETS_CONTROL.connect,
    pairing: Object.freeze({ state: 'unpaired', warning: null, choices: Object.freeze([]), nameIssue: null }),
    identity: SEAM_TARGETS.identity.pending, contributedTools: null, removable: true, urlEditable: true, ...extra,
  }),
  /** Element words the rows look for (HTML tag names, input types, ARIA role of DSH's Modal). */
  tag: Object.freeze({ button: 'button', input: 'input', password: 'password', dialog: 'dialog' }),
  control: SEAM_TARGETS_CONTROL,
  state: SEAM_TARGETS.state,
  unavailableCode: SEAM_TARGETS.unavailableCode,
  /** K3a URL refusals (core's LINK.code). */
  code: Object.freeze({ insecure: 'target-insecure', invalid: 'target-invalid' }),
  idA: 't-' + 'a'.repeat(16),
  idB: 't-' + 'b'.repeat(16),
  parentId: TARGETS.parentId,
  newUrl: 'https://new.test/api/agent/mcp',
  /** Why the scalar-page rows were retired (one decision for every row that asserted the scalar page; README.md). */
  withdrawn: 'withdrawn by MULTI-0 (targets.d.ts, ui.d.ts; contracts README "Version moves"): the scalar target.url field, the one token field for DSH_AGENT_TOKEN, GET/POST /api/fishball/connect and registerSettingsRoutes/effectiveTarget are gone; successors MULTI-SET-* (per-target cards over SEAM_TARGETS routes)',
})

/**
 * WAKE-BATCH requirement values (the user-approved design, items 1–4), restated as the oracle the
 * page and core's Config must follow; the class words are core's published WAKE.class and the event
 * types are K1's (vendored connector contract).
 */
export const WAKE_REQUIRED = Object.freeze({
  quietWindowSeconds: 10,
  maxBatch: 20,
  class: WAKE.class,
  /** Item 1: the watchdog's contributed drift event, a WAKE type by default. */
  drift: CONTRIBUTED_TYPE_PREFIX + 'dsh-connector-watchdog.drift',
  wake: Object.freeze([EVENT_TYPE.permission, EVENT_TYPE.question, EVENT_TYPE.planReview, EVENT_TYPE.turnFinished, EVENT_TYPE.handover, EVENT_TYPE.takeback, EVENT_TYPE.message, EVENT_TYPE.notice, EVENT_TYPE.ask]),
  silent: Object.freeze([EVENT_TYPE.state, EVENT_TYPE.settlement, EVENT_TYPE.retirement]),
})
