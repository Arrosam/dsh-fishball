/**
 * Vocabulary for the F-SETTINGS cases (README.md in this folder): core's own settings page on DSH's
 * Plugins page, its write-only token field and Connect control, the two entries on the Fishball page,
 * the `view=settings` continuation, and the Node Connect route.
 *
 * Sources, and only these: the user's words of 2026-11-16 (requirements 1.34 item 4: "hosted
 * setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中
 * 打开dsh的自带设置，或者直接跳转到fishball core的设置。"), the F-SETTINGS acceptance criteria relayed by
 * Fishball (2026-11-16), R-FB-03 / R-FB-02 as amended by 1.33 and 1.34, design §5.4 and §6.3a, the
 * frozen contracts `packages/core/contracts/{constants.js,connect.d.ts,link.d.ts,ui.d.ts}`, and DSH's
 * public client contracts on both SDKs (dsh-client-ui-plugin-manager slot-contract.d.ts,
 * dsh-client-ui-settings config-form.d.ts, dsh-client-ui-conversation slots.d.ts). Every product
 * value the contracts own is imported from them, never restated. No value comes from F-SETTINGS'
 * implementation (packages/core/client.settings.js, packages/core/src/settings/**), which these cases
 * never read.
 */
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { CONNECT, GUARDS, HOSTED_IMPORT } from '../../../../packages/core/contracts/constants.js'
import { SDK } from '../../contract/package-boundaries/constants.mjs'

export { CONNECT, HOSTED_IMPORT }

/** The files under test: core's browser entry, its settings chunk, and the Node route module. */
export const SUBJECT = Object.freeze({
  coreClient: path.join(REPO, 'packages', 'core', 'client.js'),
  chunk: path.join(REPO, 'packages', 'core', 'client.settings.js'),
  chunkName: 'client.settings.js',
  /** The chunk's one export (requirement 10). */
  pluginExport: 'settingsPlugin',
  route: process.env.FBTEST_F_SETTINGS_ROUTE ?? path.join(REPO, 'packages', 'core', 'src', 'settings', 'index.js'),
  routeExport: 'registerSettingsRoutes',
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
/** The token field's marker value (the relayed marker list). */
export const TOKEN_FIELD = 'token'
/** Requirement 2: field order on the page, by marker value. */
export const FIELD_ORDER = Object.freeze([FIELDS.url.name, TOKEN_FIELD, FIELDS.metadata.name, FIELDS.id.name, FIELDS.name.name])

/** The observable markers F-SETTINGS exposes (relayed 2026-11-16). */
export const MARK = Object.freeze({
  page: 'data-fishball-core-settings',
  field: 'data-fishball-setting',
  instanceTarget: 'data-fishball-instance-target',
  connect: 'data-fishball-connect',
  connectState: 'data-fishball-connect-state',
  connectBegin: 'data-fishball-connect-begin',
  entry: 'data-fishball-settings-entry',
  entries: Object.freeze({ fishball: 'fishball', dsh: 'dsh' }),
  alertRole: 'alert',
  /** The Connect state word for "no usable answer" (requirement 4). */
  unavailable: 'unavailable',
  /** Markers of the REMOVED slim panel (requirement 9): none may appear any more. */
  removed: Object.freeze(['data-fishball-settings', 'data-fishball-settings-readonly', 'data-fishball-settings-open']),
})

/** DSH slots and services the page meets (DSH's own contracts, both SDKs). */
export const DSH = Object.freeze({
  slot: Object.freeze({
    bundleConfig: 'plugins.bundle.config',
    headerActions: 'conversation.session.header.actions',
    main: 'main',
  }),
  /** `PluginConfigViewProps.view`. */
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  /** The Plugins page's panel id (dsh-client-ui-plugin-manager PANEL_ID). */
  pluginsPanel: 'plugins',
  /** DSH's native Settings launcher as fishball-page portals it (requirement 7). */
  launcherClass: 'fishball-settings-launcher',
  launcherSelector: '.fishball-settings-launcher',
  /** fishball-page's ready mark on `<html>` (requirement 8). */
  sessionMark: 'data-fishball-session',
  service: Object.freeze({
    navigation: 'pluginNavigation',
    instance: GUARDS.services.instance,
    /** Requirement 9: the withdrawn extension point. */
    removedSections: 'fishballSettingsSections',
  }),
  /** The services a Fishball page offers (DSH's own composition); pluginNavigation is optional. */
  services: Object.freeze(['slots', 'layout', 'locale', 'configForms', 'remote', 'remote.credentials']),
  /** The credentials Remote namespace as its own service (dsh-api-gateway `remote.<namespace>`). */
  remoteCredentials: 'remote.credentials',
  /** The removed slim panel's `main` slot key (requirement 9). */
  removedPanelKey: 'fishball-settings',
  /** ConfigFormSnapshot.status. */
  status: Object.freeze({ ready: 'ready', unavailable: 'unavailable', loading: 'loading' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  locales: Object.freeze(['en', 'zh']),
  focus: 'focus',
})

/** Requirement 4 and 5: the Connect route. */
export const ROUTE = Object.freeze({
  path: '/api/fishball/connect',
  /** The page requests it document-relative (requirement 4). */
  relative: 'api/fishball/connect',
  methods: Object.freeze(['GET', 'POST']),
  requestBody: 'buffered',
  get: 'GET',
  post: 'POST',
  credentials: 'same-origin',
  cache: 'no-store',
  unavailable: Object.freeze({ status: 503, body: Object.freeze({ code: 'CONNECT_UNAVAILABLE' }) }),
  ok: 200,
  cacheControl: 'cache-control',
  noStore: 'no-store',
  contentType: 'content-type',
  json: 'application/json',
  /** `fishballInstance.apiVersion` the route accepts (requirement 5). */
  apiVersion: 1,
})

/** `ConnectBegin.outcome` words (connect.d.ts). */
export const OUTCOME = Object.freeze({ authorized: 'authorized', approval: 'approval-url', configuration: 'needs-configuration' })
/** `window.open` arguments for an approval URL (requirement 4). */
export const OPEN = Object.freeze({ target: '_blank', features: 'noopener' })

/** Requirement 8: the continuation fragment. */
export const CONTINUATION = Object.freeze({ settings: '#view=settings' })

/** Test data (fixtures only; never product values). */
export const FIXTURE = Object.freeze({
  /** Document bases: at the origin root, and under a sub-path (document-relative routes follow it). */
  base: 'http://fishball.test/',
  subBase: 'http://fishball.test/child/page/',
  targetUrl: 'https://x/api/agent/mcp',
  storedUrl: 'https://stored.test/api/agent/mcp',
  metadataUrl: 'https://owner.test/fishball/client.json',
  storedMetadataUrl: 'https://owner.test/old/client.json',
  coreId: 'fbtest-core',
  coreName: 'Navigator',
  storedName: 'Old name',
  instanceUrl: 'https://host.test/api/agent/mcp',
  approvalUrl: 'https://dsh.test/api/agent/oauth/authorize?state=fbtest',
  revision: 7,
  /** A wrong but well-formed status word (the "any other answer" partition). */
  bogusState: 'fbtest-not-a-state',
  nonJson: '<html>not json</html>',
  routeError: 'fbtest route failure detail',
})

/** A token value made fresh per call, so no secret is a literal of this folder. */
export const freshToken = () => 'fbtest-token-' + randomBytes(18).toString('base64url')

/** Harness waits only; never a product oracle. */
export const HARNESS = Object.freeze({ settleRounds: 80, waitMs: 1500, pollMs: 15 })

export const runtimeOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')
export const frontendAssetsOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'assets')
export const CORDIS_ENTRY = path.join('@deepseek-ai', 'cordis', 'lib', 'index.js')
/** Cordis fiber states the page reads (cordis lib/types/fiber.d.ts, both SDKs). */
export const FIBER = Object.freeze({ failed: 3 })
export const STATUS_EVENT = 'internal/status'

/**
 * Why rows elsewhere that assert the removed slim panel, its Read Only line and Open Plugins link,
 * or the `fishballSettingsSections` extension point are withdrawn (requirement 9). One reason, so
 * every withdrawn row cites the same decision.
 */
export const WITHDRAWN = 'withdrawn: requirements 1.34 item 4 (fishball-hosted-settings removed; core\'s settings are its own Plugins-page settings) and R-HOST-11 withdrawn; F-SETTINGS, test/v3/fishball-core/settings'
