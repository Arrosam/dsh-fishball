/**
 * The one map from source paths to test suites (the user, 2026-11-16: "按照实际插件的模块分布拆分，
 * 每次动了哪个模块才跑哪个的测试"). test/run-affected.mjs reads it to pick the suites a change needs;
 * test/run-v3.mjs stays the full V3 run (REMOVE-V2 removed the V2 release run, test/run-v2.mjs).
 *
 * A suite is a list of test files. It is selected when a changed path matches one of its
 * `triggers` (node:path matchesGlob, repo-relative, `/` separators), or when the suite's own files
 * change. Nothing here changes what a file asserts: the map only chooses which files run.
 *
 * How the triggers were derived (2026-11-16, at RENAME-DSH): from each suite's import closure
 * (its own modules and the package modules they load), closed over the packages' own import
 * graph, so a module's suite also runs when a module it imports changes. Two kinds of file are
 * wider than their imports and say why at their entry:
 * - a suite that boots a real DSH host (the worker's profile) loads whole packages at runtime
 *   through the profile, not through imports, so it triggers on the whole package;
 * - a static check that reads every file of a package (the contract suites) triggers on it all.
 * Revisit an entry when a suite starts loading another module. `node test/run-affected.mjs --check`
 * reports every V3 test file no V3 suite owns, every root test file no suite owns, any file owned
 * twice, and any listed file that does not exist.
 */

/** Package folders by their package name (design §1.0c). Folder names are the checkout's. */
export const PACKAGE = Object.freeze({
  dshConnector: 'packages/dsh-connector',
  dshConnectorUi: 'packages/dsh-connector-ui',
  dshInstance: 'packages/dsh-instance',
  dshConnectorShared: 'packages/dsh-connector-shared',
  dshConnectorAdapter: 'packages/dsh-connector-adapter',
  fishballCore: 'packages/core',
  fishballUi: 'packages/core/ui',
  fishballShared: 'packages/shared',
  // The amenities split (the user, 2026-11-21): each amenity is its own package; fishball-amenities
  // is the umbrella that depends on and bundles them and inserts their rows.
  fishballBoard: 'packages/fishball-board',
  fishballHeartbeat: 'packages/fishball-heartbeat',
  fishballTaskboard: 'packages/fishball-taskboard',
  fishballAmenities: 'packages/fishball-amenities',
})

const all = (pkg) => pkg + '/**'
const sub = (pkg, ...parts) => [pkg, ...parts].join('/') + '/**'
/** A package's files outside any subfolder (index.js, package.json, cordis.patch.yml, …). */
const top = (pkg) => pkg + '/*'
// These README files are published/checked separately; they aren't runtime inputs to boot or draw.
const CONNECTOR_RUNTIME = `${PACKAGE.dshConnector}/**/!(README.md)`
// Placement uses the core runtime and manifest, not the maintainers’ contract README.
const CORE_RUNTIME = Object.freeze([top(PACKAGE.fishballCore), `${PACKAGE.fishballCore}/!(contracts)/**`, `${PACKAGE.fishballCore}/contracts/**/!(README.md)`])
const TOOLS_RUNTIME = `${PACKAGE.dshConnector}/tools/**/!(*.md|*.d.ts)`
const SCHEMA_TYPES = `${PACKAGE.dshConnector}/mcp-schema/index.d.ts`

/**
 * Package modules many suites depend on: the K1/K2 contracts the connector's modules import,
 * and the shared libraries. Changing one reruns every suite that imports it (closure above).
 */
const CONNECTOR_CONTRACTS = Object.freeze([
  `${PACKAGE.dshConnector}/mcp-schema/**/!(*.md|*.d.ts)`, TOOLS_RUNTIME,
])
/**
 * The connector's top-level src/*.js files the V3 modules import (src/tokens … src/mcp/*): measured
 * 2026-11-16, the union of their import closures is these four. Other src/*.js files are V2's,
 * reached only from index.js (CONNECTOR_BOOT); the package's manifest is in that set too.
 */
const CONNECTOR_CORE = Object.freeze(['constants', 'digest', 'errors', 'text'].map((name) => `${PACKAGE.dshConnector}/src/${name}.js`))
/** What embed-UI's draw world loads: embed-UI, the real UI backend, C-EXT, K2/K3 and their imports. */
const CONNECTOR_UI_DRAW_TRIGGERS = Object.freeze([all(PACKAGE.dshConnectorUi), sub(PACKAGE.dshConnector, 'src', 'ui'), sub(PACKAGE.dshConnector, 'src', 'contrib'),
  sub(PACKAGE.dshConnector, 'host-services'), all(PACKAGE.dshConnectorShared), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS])
/** The connector's manifest: k1 reads its dependencies. */
const CONNECTOR_MANIFEST = PACKAGE.dshConnector + '/package.json'
/**
 * core's link, its own K3a contracts every link-side module imports (core/src/link → contracts;
 * F-OWN-SCHEMA), and the `codeOf` log rule (src/events/diagnostics.js) the link and the Connect
 * route log failures by (F-FIX-3).
 */
const CORE_LINK = Object.freeze([sub(PACKAGE.fishballCore, 'src', 'link'), sub(PACKAGE.fishballCore, 'contracts'), `${PACKAGE.fishballCore}/src/events/diagnostics.js`])

/**
 * What a booted connector row loads: the import closure of its entry, plus the files DSH reads to
 * install the bundle (package.json, cordis.patch.yml, locale/, assets/). Since C-WIRE the entry
 * (index.js → src/wire/, src/settings/) imports every V3 module under src/ beside the V2 ones
 * (tokens, pairs, mailbox, routing, handover, contrib, mcp, revocation, hosted, ui, settings-page,
 * schema-value), so the whole of src/ is in the closure.
 */
const CONNECTOR_BOOT = Object.freeze([
  sub(PACKAGE.dshConnector, 'src'), `${PACKAGE.dshConnector}/!(README.md)`, ...CONNECTOR_CONTRACTS,
  sub(PACKAGE.dshConnector, 'host-services'), sub(PACKAGE.dshConnector, 'locale'), sub(PACKAGE.dshConnector, 'assets'),
])

/** The amenities' fishballInstance follower, fishball-shared's module since the amenities split (was board/src/instance.js). */
const INSTANCE_FOLLOWER = `${PACKAGE.fishballShared}/instance-follower.js`
/** The amenity packages and their umbrella (the amenities split, 2026-11-21). */
const AMENITY_PACKAGES = Object.freeze([PACKAGE.fishballBoard, PACKAGE.fishballHeartbeat, PACKAGE.fishballTaskboard, PACKAGE.fishballAmenities])

/** The ICON-SET rows' shared reader and vocabulary (package-boundaries), which the draw and oauth-web icon rows import too. */
const ICON_SET_SUPPORT = 'test/v3/contract/package-boundaries/icon-set.mjs'

/** The release pack (REL-PACK): its script and helpers. */
const RELEASE_SCRIPTS = 'scripts/**'
const MCP_RELEASE_PINS = 'test/v3/release/pack/mcp-pins.mjs'

/** Test support every suite may load, and the runners: a change there reruns every suite. */
export const FULL = Object.freeze(['test/support/**', 'test/suites.mjs', 'test/run-*.mjs', 'test/run-*.sh', 'package.json'])

/** The SDKs each V3 suite has one entry file for (test/v3/<package>/<module>/sdk-<version>.test.mjs). */
export const SDK_VERSIONS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])
const v3 = (dir) => Object.freeze(SDK_VERSIONS.map((sdk) => `test/v3/${dir}/sdk-${sdk}.test.mjs`))
const suite = (description, files, triggers) => Object.freeze({ description, files: Object.freeze(files), triggers: Object.freeze(triggers) })

/**
 * V3 suites, one per package module (test/v3/<package>/<module>), plus `contract.*`, the
 * cross-package contract and boundary rows (test/v3/contract/*). Ids are `<package>.<module>`.
 */
export const V3_SUITES = Object.freeze({
  // F-OWN-SCHEMA's fishball-core half (moved from dsh-connector with fishball-core, split 6b7c53bf).
  'contract.own-schema': suite('core-owned MCP surface and no generated connector schema (F-OWN-SCHEMA)', v3('contract/own-schema'),
    [sub(PACKAGE.fishballCore, 'contracts'), sub(PACKAGE.fishballCore, 'src'), top(PACKAGE.fishballCore), all(PACKAGE.fishballShared), ...AMENITY_PACKAGES.map(all),
      'test/v3/contract/own-schema/**']),
  'fishball-core.package': suite('core package, slim child move (R-CORE; the settings-section point withdrawn, 1.34)', v3('fishball-core/package'),
    [all(PACKAGE.fishballCore), sub(PACKAGE.dshInstance, 'src', 'slim'), sub(PACKAGE.dshInstance, 'src', 'child'), PACKAGE.dshInstance + '/client*.js']),
  'fishball-core.bridge': suite('bridge façade, list_changed refresh, X8 attention (F-FACADE)', v3('fishball-core/bridge'),
    [sub(PACKAGE.fishballCore, 'src', 'bridge'), sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS,
      // WAKE-BATCH: its world passes the events suite's 0 s batching.
      'test/v3/fishball-core/events/constants.mjs']),
  'fishball-core.events': suite('interception, acceptance ledger, wake (F-INTERCEPT)', v3('fishball-core/events'),
    [sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS]),
  'fishball-core.link': suite('MCP link (F-LINK)', v3('fishball-core/link'),
    [...CORE_LINK, top(PACKAGE.fishballCore), ...CONNECTOR_CONTRACTS, ...CONNECTOR_CORE, CONNECTOR_MANIFEST, MCP_RELEASE_PINS, sub(PACKAGE.dshConnector, 'host-services')]),
  // The card's browser half is fishball-ui's chunk since F-UI; its package.json ships it.
  // F-FIX: ASK-UI-01 draws the card with fishball-ui's client.js and client.asks.js in the F-SETTINGS scripted page.
  'fishball-core.asks': suite('ask cards: ask_user, the asks service and routes, the drawn card (F-ASKCARD, F-FIX)', v3('fishball-core/asks'),
    [sub(PACKAGE.fishballCore, 'src', 'asks'), PACKAGE.fishballUi + '/client.asks.js', PACKAGE.fishballUi + '/client.js', PACKAGE.fishballUi + '/package.json', ...CORE_LINK,
      'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs', 'test/v3/fishball-core/settings/constants.mjs',
      // The image-loop fix: the drawn card reads its frames from the page connection's stand-in.
      'test/v3/fishball-ui/stream/event-source.mjs']),
  'fishball-core.identity': suite('identity, pairing decisions, token-revoked (F-PAIR)', v3('fishball-core/identity'),
    [sub(PACKAGE.fishballCore, 'src', 'identity'), ...CORE_LINK, sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS,
      // Its name rows read the own-schema suite's constants.
      'test/v3/contract/own-schema/constants.mjs']),
  // Core's link, its saved credentials and Connect (src/link, with the Fishball side's OAuth client
  // copy since REMOVE-V2b) with F-PAIR's pairing over them; the fakes reuse F-PAIR's fake pair registry and the
  // oauth-client suite's in-process DSH host.
  'fishball-core.link-save': suite('saved credentials once on first acceptance, Connect (F-LINK-SAVE)', v3('fishball-core/link-save'),
    [sub(PACKAGE.fishballCore, 'src', 'identity'), ...CORE_LINK,
      'test/v3/fishball-core/identity/**', 'test/v3/dsh-connector-adapter/oauth-client/subject.mjs', 'test/v3/dsh-connector/pairs/subject.mjs', ...CONNECTOR_CONTRACTS]),
  // The strip view is fishball-ui's src/status since F-UI (it reads fishball-shared's ui-seam); the line reads the link's target rule.
  'fishball-core.status': suite('status, strip view, set completeness, guards notice (F-STATUS)', v3('fishball-core/status'),
    [sub(PACKAGE.fishballCore, 'src', 'status'), sub(PACKAGE.fishballUi, 'src'), all(PACKAGE.fishballShared), ...CORE_LINK]),
  // The chunk loads only through core's client.js and reads core's contracts (constants.js); the page
  // also loads fishball-ui's client, whose entries chunk holds the two Fishball-page entries (F-UI).
  // F-FIX-3: the route imports core's link (its log line, BEGIN_VIA); the route rows share the link
  // suite's thrown-value partitions and log oracle (log-privacy.mjs).
  'fishball-core.settings': suite("core's own settings page, token field, Connect, Fishball-page entries (F-SETTINGS)", v3('fishball-core/settings'),
    ['packages/core/client.settings.js', 'packages/core/client.js', sub(PACKAGE.fishballCore, 'src', 'settings'), sub(PACKAGE.fishballCore, 'contracts'),
      // LOGO-BUTTON: the brandStyle setting and the snapshot brand the settings rows assert.
      sub(PACKAGE.fishballCore, 'src', 'status'), sub(PACKAGE.fishballCore, 'src', 'main'), PACKAGE.fishballCore + '/client.js',
      'test/v3/fishball-core/status/world.mjs', 'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/fakes.mjs', 'test/v3/fishball-core/status/constants.mjs',
      top(PACKAGE.fishballUi), sub(PACKAGE.fishballUi, 'src'), all(PACKAGE.fishballShared), ...CORE_LINK, 'test/v3/fishball-core/link/log-privacy.mjs',
      // WAKE-BATCH: wake.mjs reads the events suite's requirement constants and core's main Config.
      'test/v3/fishball-core/events/constants.mjs', 'test/private-skills/support/**']),
  // Boots a real standalone DSH with core and fishball-ui installed as whole bundles (F-UI splits the
  // guard rows between their two patches; the instance's launch code is read for the LITE rows).
  'fishball-ui.guards': suite('guard rows, override report, self-reorder (F-GUARDS)', v3('fishball-ui/guards'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), all(PACKAGE.dshInstance)]),
  // Reads fishball-ui's whole package, core's patch, constants and client, fishball-shared's ui-seam,
  // and boots a real standalone DSH with them (the guards worker, so its harness files too).
  'fishball-ui.package': suite('fishball-ui package, patch rows and conditions, ui-seam, browser half, core/ui system rows (F-UI)', v3('fishball-ui/package'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/v3/fishball-ui/guards/**', 'test/v3/fishball-core/package/**',
      'test/v3/fishball-core/status/constants.mjs',
      // E-FIX-3: the guard-row reader is imported bound to the SDK through the oauth-client suite's importBound.
      'test/v3/dsh-connector-adapter/oauth-client/subject.mjs',
      // UI-POLISH-F: the navigation rows (nav-page.mjs) render through the F-SETTINGS primitive stand-ins and their constants.
      'test/v3/fishball-core/settings/primitives.mjs', 'test/v3/fishball-core/settings/constants.mjs']),
  // F-WIRE: core's main row, boots a real standalone DSH with core and fishball-ui as whole bundles
  // (the guards worker), and scans the Fishball side for DSH-side imports. fishball-board is shelved
  // (the user, 2026-11-18); the board-present partitions use the suite's own stand-in fixture.
  'fishball-core.wire': suite("core's main row: fishballInstance, fishballStatus, the manager, model, Connect routes and web callback (F-WIRE)", v3('fishball-core/wire'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), 'test/v3/fishball-ui/guards/**',
      // WAKE-BATCH: wire/batch.mjs reads the manager suite's persona entry.
      'test/v3/fishball-core/manager/constants.mjs']),
  // F-WIRE: core's manager in a real standalone DSH (core + shared only): reminders, the singleton,
  // the preset and persona, the generated identity and the model rule, with the scripted model.
  // DESIGN.md §28: core's two mode rows composed by DSH, and fishball-child-plugins' browser half in the
  // scripted page with DSH's real locale runtime and Plugins-page / Discover dictionaries, laid out in the
  // contrast rows' headless Chromium; R1 composes through the F-UI suite's readers. installed.test.mjs runs the
  // rows once more on the DSH installation the task names (constants.mjs INSTALLED_DSH).
  'fishball-core.child-plugins': suite("instance-run vs standalone rows, the child's hidden install entries and notice (§28)",
    [...v3('fishball-core/child-plugins'), 'test/v3/fishball-core/child-plugins/installed.test.mjs'],
    [sub(PACKAGE.fishballCore, 'ui', 'fishball-child-plugins'), sub(PACKAGE.fishballCore, 'ui', 'fishball-recommend-plugins'), PACKAGE.fishballCore + '/cordis.patch.yml',
      'test/v3/fishball-ui/package/subject.mjs', 'test/v3/fishball-ui/package/constants.mjs', 'test/v3/fishball-ui/contrast/**', 'test/v3/fishball-core/package/constants.mjs',
      'test/v3/contract/package-boundaries/**', 'test/v3/dsh-connector-adapter/oauth-client/**', 'test/v2-page-cases/lite-browser.mjs', 'test/v3/fishball-core/settings/primitives.mjs']),
  'fishball-core.manager': suite("core's manager: reminders, singleton, preset and persona, generated identity, model (F-WIRE)", v3('fishball-core/manager'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/support/fixtures/fake-llm.mjs', 'test/support/host.mjs']),
  // MSG-USER: core's manager-only message_user, its persona, and fishball-page's message rows and hidden
  // replies in DSH's real web UI (the manager suite's world, boots core with its ui/ rows; LITE's Chromium).
  'fishball-core.message-user': suite("message_user, its persona, the Fishball page's message rows and folded replies (MSG-USER)", v3('fishball-core/message-user'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/v3/fishball-core/manager/{world,subject,constants}.mjs', 'test/support/fixtures/fake-llm.mjs',
      'test/support/host.mjs', 'test/v2-page-cases/lite-browser.mjs']),
  // F-WIRE: fishball-ui's model dialog, strip route and live core rows, in the browser sandbox and a real DSH.
  'fishball-ui.model-dialog': suite('fishball-ui model dialog, status strip route, live core on/off, composer picker guard (F-WIRE)', v3('fishball-ui/model-dialog'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/v3/fishball-core/wire/**', 'test/v3/fishball-core/settings/**', 'test/v3/fishball-ui/guards/**',
      // UI-POLISH-F: the drawn status card rows build their frames with the F-STATUS strip view binding and its card constants.
      'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/constants.mjs',
      // The sidebar, ask-card and strip pages read their frames from the page connection's stand-in.
      'test/v3/fishball-ui/stream/event-source.mjs']),
  // UI-FIX-F: the drawn ask and status cards (fishball-ui's client and parts, with core's client, in the
  // F-SETTINGS scripted page through the ask-card and strip harnesses; frames from fishball-ui's
  // stripView over fishball-shared's ui-seam) laid out in the LITE rows' headless Chromium with DSH's
  // theme and page styles, measured for WCAG contrast. RESHOOT fix 1 adds the ask card's state badge
  // (the open card's warning Tag, light ≥ 4.5:1, dark DSH's own warning Tag; answered / closed neutral).
  'fishball-ui.contrast': suite('ask-card reason placeholder, open ask-card warning badge and connected status badge contrast, both DSH themes, DSH tokens only (UI-FIX-F, RESHOOT fix 1)', v3('fishball-ui/contrast'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared),
      'test/v3/fishball-core/asks/**', 'test/v3/fishball-core/settings/**', 'test/v3/fishball-core/status/**', 'test/v3/fishball-ui/model-dialog/**',
      'test/v3/contract/package-boundaries/**', 'test/v2-page-cases/lite-browser.mjs', 'test/private-skills/support/**']),
  // R-FIX-FUI F1: the pairing warning UI. The view model and the Node row (fishball-ui's index.js, its
  // pairing and strip routes, the shared view stream) in a real Cordis root; the card through
  // fishball-ui's client in the F-SETTINGS scripted page, with the F3 stream stand-in.
  'fishball-ui.pairing': suite('the pairing warning: pairingView, the pairing stream and choose routes, the drawn card and its stream health (R-FIX-FUI F1)', v3('fishball-ui/pairing'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), 'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs',
      'test/v3/fishball-core/settings/constants.mjs', 'test/v3/fishball-ui/stream/**', 'test/v3/dsh-connector-adapter/oauth-client/subject.mjs', 'test/v3/fishball-core/package/constants.mjs']),
  // R-FIX-FUI F3 / F9: every fishball-ui dock (strip, ask cards, pairing card) over one health-aware
  // EventSource stand-in, frames from the real stripView / pairingView and the F-ASKCARD card shape.
  'fishball-ui.stream': suite('stream health of the strip, ask cards and pairing card; the ask card time in the DSH UI language (R-FIX-FUI F3, F9)', v3('fishball-ui/stream'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), 'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs',
      'test/v3/fishball-core/settings/constants.mjs', 'test/v3/fishball-core/asks/world.mjs', 'test/v3/fishball-core/asks/constants.mjs', 'test/v3/fishball-core/asks/subject.mjs',
      'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/constants.mjs', 'test/v3/fishball-ui/model-dialog/strip.mjs', 'test/v3/fishball-ui/model-dialog/constants.mjs',
      'test/v3/fishball-ui/pairing/**', 'test/v3/dsh-connector-adapter/oauth-client/subject.mjs', 'test/v3/fishball-core/package/constants.mjs']),
  // LOGO-BUTTON: fishball-ui's brand part in DSH's sidebar slots, seen through a scripted shell;
  // fishball-page's New Session hiding over a scripted shell document; the motion rows in Chromium.
  'fishball-ui.brand': suite('the sidebar logo: Fishball mark/wordmark/status in the wide row and rail, state, theme, activation, New Session hiding, teardown (LOGO-BUTTON)', v3('fishball-ui/brand'),
    ['packages/fishball-ui/client.js', 'packages/fishball-ui/client.brand.js', sub(PACKAGE.fishballUi, 'fishball-page'), sub(PACKAGE.fishballUi, 'src'),
      all(PACKAGE.fishballShared), sub(PACKAGE.fishballCore, 'src', 'status'), sub(PACKAGE.fishballCore, 'src', 'main'), PACKAGE.fishballCore + '/client.js',
      'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs', 'test/v3/fishball-core/settings/constants.mjs',
      'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/constants.mjs', 'test/v3/fishball-core/status/world.mjs', 'test/v3/fishball-core/status/fakes.mjs',
      'test/v3/fishball-ui/stream/**', 'test/v3/fishball-ui/package/nav-page.mjs', 'test/v3/fishball-ui/package/polish-constants.mjs',
      'test/v3/fishball-ui/contrast/page.mjs', 'test/v3/fishball-ui/contrast/constants.mjs', 'test/v3/contract/package-boundaries/cases.mjs',
      'test/v2-page-cases/lite-browser.mjs']),
  // The image-loop fix (2026-11-22): the Fishball page's ONE live connection. Component rows run
  // fishball-ui's client and fishball-taskboard's browser half in the F-SETTINGS scripted page over the
  // brand shell; system rows boot the manager world (core, fishball-ui and fishball-taskboard installed
  // as bundles) and read DSH's real page in LITE's Chromium.
  'fishball-ui.connections': suite("the Fishball page's one live connection: one carrier, constant count, Host topics, taskboard on the carrier, sends complete", v3('fishball-ui/connections'),
    [all(PACKAGE.fishballUi), sub(PACKAGE.fishballCore, 'src', 'page'), sub(PACKAGE.fishballCore, 'src', 'main'), `${PACKAGE.fishballShared}/ui-seam.js`, all(PACKAGE.fishballTaskboard),
      'test/v3/fishball-core/settings/{page,primitives,constants}.mjs', 'test/v3/fishball-ui/brand/{page,constants}.mjs', 'test/v3/fishball-ui/stream/event-source.mjs',
      'test/v3/fishball-ui/model-dialog/{targets,targets-constants}.mjs', 'test/v3/fishball-core/manager/{world,subject,constants}.mjs',
      'test/v3/fishball-core/message-user/{page,constants}.mjs', 'test/support/fixtures/fake-llm.mjs', 'test/v2-page-cases/lite-browser.mjs']),
  'fishball-board.peers': suite('board without core (FEAT-PEERS; fold-notify was removed, REMOVE-WD)', v3('fishball-board/peers'),
    [all(PACKAGE.fishballBoard), sub(PACKAGE.dshConnector, 'mcp-schema')]),
  // The heartbeat row over a fake core, bound to each SDK (and 0.2.2-rc.3, the installed DSH); it
  // reuses the board suite's row loader and the package-boundaries case names.
  'fishball-amenities.heartbeat': suite('heartbeat amenity: config gate, timer, consecutive limit, restart, heartbeat_focus, compaction on cooling', [...v3('fishball-amenities/heartbeat'), 'test/v3/fishball-amenities/heartbeat/sdk-0.2.2-rc.3.test.mjs'],
    [all(PACKAGE.fishballHeartbeat), INSTANCE_FOLLOWER, all(PACKAGE.fishballAmenities), 'test/v3/fishball-amenities/heartbeat/**',
      'test/v3/fishball-board/peers/subject.mjs', 'test/v3/contract/package-boundaries/cases.mjs', 'test/private-skills/support/sdk.mjs',
      'test/support/amenity-settings.mjs', PACKAGE.fishballBoard + '/src/config.js']),
  // R1 (the amenities' settings pages, 2026-11-22): fishball-heartbeat's live-settings helper on a
  // real Loader of each SDK (and 0.2.2-rc.3).
  'fishball-amenities.live-settings': suite('live settings helper: settingsSnapshot, runWithSettings re-run on loader/volatile-update', [...v3('fishball-amenities/live-settings'), 'test/v3/fishball-amenities/live-settings/sdk-0.2.2-rc.3.test.mjs'],
    [PACKAGE.fishballHeartbeat + '/src/live-settings.js', 'test/v3/contract/package-boundaries/cases.mjs']),
  // R4/R5: the umbrella's client pages in a scripted Plugins page (browser sandbox, React shim, DSH's
  // own settings-form primitives from the 0.2.2-rc.3 frontend), the Host serving fishball-heartbeat's
  // real Config through DSH's dsh-settings.
  'fishball-amenities.settings-page': suite("umbrella settings pages: configure entries while served, heartbeat form, labels, save, manifests", [...v3('fishball-amenities/settings-page'), 'test/v3/fishball-amenities/settings-page/sdk-0.2.2-rc.3.test.mjs'],
    [PACKAGE.fishballAmenities + '/client.js', PACKAGE.fishballAmenities + '/package.json', PACKAGE.fishballHeartbeat + '/src/**', PACKAGE.fishballHeartbeat + '/package.json',
      'test/support/amenity-settings.mjs', 'test/support/browser-sandbox.mjs', 'test/support/rp-recommend.mjs', 'test/v3/fishball-core/package/page.mjs',
      'test/v3/contract/package-boundaries/cases.mjs', 'test/private-skills/support/sdk.mjs']),
  // The taskboard row over the SDK's real storage stack with fake host services; it reuses the
  // amenities' instance follower (fishball-shared/instance-follower) and is installed through its own
  // package's patch and manifest, or the umbrella's. Its world imports the private-skills SDK binder
  // and the package-boundaries caseName.
  'fishball-taskboard': suite("Fishball's task board and memo pad: tools, routes, wake notice, compaction reminder, persistence (fishball-taskboard)", v3('fishball-taskboard'),
    [all(PACKAGE.fishballTaskboard), INSTANCE_FOLLOWER, all(PACKAGE.fishballAmenities), 'test/v3/fishball-taskboard/**', 'test/private-skills/support/**', 'test/v3/contract/package-boundaries/cases.mjs']),
  // The Task board tab redesign (2026-11-22): fishball-taskboard's browser half alone in the F-SETTINGS
  // scripted page through fishball-ui.connections' boardOnlyPage, and laid out in the contrast rows'
  // headless Chromium with DSH's real theme and page styles (their page, constants and wcag helpers).
  'fishball-taskboard.view': suite('the Task board tab: progress fill, summary, condensed and completed rows, collapse, notes, memos, narrow width, edit mode (B1, V1–V12, E1–E2)', v3('fishball-taskboard-view'),
    [PACKAGE.fishballTaskboard + '/client.js', PACKAGE.fishballTaskboard + '/package.json', 'test/v3/fishball-taskboard-view/**',
      'test/v3/fishball-ui/connections/{page,constants}.mjs', 'test/v3/fishball-ui/brand/{page,constants}.mjs', 'test/v3/fishball-ui/stream/event-source.mjs',
      'test/v3/fishball-core/settings/{page,primitives,constants}.mjs', 'test/v3/fishball-ui/contrast/{page,constants,wcag}.mjs',
      'test/v3/contract/package-boundaries/cases.mjs', 'test/v2-page-cases/lite-browser.mjs']),
  // The amenities split (the user, 2026-11-21): each amenity its own package, the umbrella inserting
  // their rows, dsh.client only where there is browser code, read from manifests, patches (DSH's own
  // reader and bundle inspection) and import specifiers. It reuses the package-boundaries helpers
  // (caseName, dshInspect, the specifier worker) and core's package-suite patch reader.
  'fishball-amenities.packages': suite('amenities split: each amenity its own package and bundle, the umbrella inserting their rows, dsh.client only with browser code', v3('fishball-amenities/packages'),
    [...AMENITY_PACKAGES.map(all), all(PACKAGE.fishballShared), 'package.json', 'test/v3/contract/package-boundaries/**', 'test/v3/release/pack/**',
      'test/v3/fishball-core/package/constants.mjs', 'test/v3/fishball-core/package/static.mjs', 'test/v3/fishball-core/package/tokens-worker.mjs']),
  // Each amenity package's plugin icon (2026-11-21): manifests, the npm pack listing, DSH's own
  // readPluginMeta of each SDK (and 0.2.2-rc.3, the installed DSH), the SVGs, and the icons drawn in
  // the LITE rows' Chromium. fishball-core's and fishball-ui's icons are the family reference and the
  // distinctness peer; it reuses the package-boundaries case names and constants.
  'fishball-amenities.icons': suite('amenities plugin icons: declared, shipped, read by DSH, valid self-contained SVG, visible on light and dark, distinct', [...v3('fishball-amenities/icons'), 'test/v3/fishball-amenities/icons/sdk-0.2.2-rc.3.test.mjs'],
    [...AMENITY_PACKAGES.map(all), all(PACKAGE.fishballShared), sub(PACKAGE.fishballCore, 'assets'), PACKAGE.fishballCore + '/package.json', sub(PACKAGE.fishballUi, 'assets'), PACKAGE.fishballUi + '/package.json',
      'test/v3/contract/package-boundaries/cases.mjs', 'test/v3/contract/package-boundaries/constants.mjs', 'test/v3/release/pack/constants.mjs', 'test/v2-page-cases/lite-browser.mjs']),
  // K3a reads core's contracts and patch against the connector's published schema and tools, the
  // fishball-ui seam's values in fishball-shared (moved there by F-UI), and scans the DSH-side
  // package folders for imports of core.
  'contract.k3a-core-seams': suite('K3a core-side seams: own MCP-surface copy, hosted import names, Connect, fishball-ui seam', v3('contract/k3a-core-seams'),
    [sub(PACKAGE.fishballCore, 'contracts'), top(PACKAGE.fishballCore), all(PACKAGE.fishballShared), sub(PACKAGE.dshConnector, 'host-services'), ...CONNECTOR_CONTRACTS,
      all(PACKAGE.dshConnector), all(PACKAGE.dshConnectorUi), all(PACKAGE.dshInstance)]),
})

/**
 * Pre-V3 suites by the package they exercise. The files stay where they are; only the grouping is
 * new. REMOVE-V2c deleted the H-STUB suites (the connector booted with a stub instance) and the
 * pre-V3 selection (test/v2-suites.mjs) with them. `v2.connector-host` keeps the one file that still
 * boots the worker's DSH with both plugins linked, so a change to what that row loads
 * (CONNECTOR_BOOT) or to a shared library reruns it.
 */
const v2 = (names) => names.map((n) => (n.includes('/') ? n : `test/${n}.test.mjs`))
export const V2_GROUPS = Object.freeze({
  'v2.connector-host': suite("the instance's INVALID_MAIN_HOME status on a booted DSH with both plugins linked", v2([
    'e1-d2-invalid-main-home',
  ]), [...CONNECTOR_BOOT, all(PACKAGE.dshInstance), all(PACKAGE.dshConnectorShared), all(PACKAGE.fishballShared), sub(PACKAGE.dshConnectorUi, 'src', 'client')]),
  'v2.connector-ui': suite('the moved client: frame policy, card titles', v2([
    'v2-pg-origin-frame-policy', 'e1-card-titles',
  ]), [all(PACKAGE.dshConnectorUi), CONNECTOR_MANIFEST, `${PACKAGE.dshInstance}/package.json`, sub(PACKAGE.dshConnector, 'locale'), sub(PACKAGE.dshInstance, 'locale')]),
  // These boot the instance's real child (lifecycle, admission, embed): a change in the instance,
  // the core it places, or either shared library (the instance's own, core's placed copy) reruns them.
  // REMOVE-V2b deleted the V2 binding rows (body-soul-i1c-status, e1-p1-connector-departure) and the
  // V2 child-web page boots (v2-page-cases/child-boot*): their subjects are gone (V2 never deployed).
  // v2-page-cases/ready stays: core's manager keeps the READY gate (src/manager/service.js).
  'v2.instance': suite('the instance: launch, lifecycle, provider sync', v2([
    'body-soul-i2-launch', 'provider-sync-official',
    'runtime-isolation-boundary', 'runtime-isolation-transport', 'v2-r2-start-detail',
    'v2-r4-core-copy', 'v2-r4-exit-race',
  ]), [// v2-r2's support reads the I-HOST suite's status-route keys (ROUTE.statusKeys, REMOVE-V2b).
    'test/v3/dsh-instance/host/constants.mjs', all(PACKAGE.dshInstance), all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.dshConnectorShared), all(PACKAGE.fishballShared)]),
  // F-WIRE deleted core's slim child and its suites (V2 was never deployed, the user's rule); the
  // persona, private Skills and the page cases stay.
  'v2.fishball-core': suite('core\'s persona, private Skills and the Fishball page cases', v2([
    'persona-bold-render',
    'test/private-skills/sk-bva.test.mjs', 'test/private-skills/sk-dt.test.mjs', 'test/private-skills/sk-ep.test.mjs',
    'test/private-skills/sk-st.test.mjs', 'test/private-skills/sk-uc.test.mjs',
    'test/v2-page-cases/lite.test.mjs', 'test/v2-page-cases/page.test.mjs', 'test/v2-page-cases/pg-origin.test.mjs',
    'test/v2-page-cases/ready.test.mjs',
    'test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs', 'test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs',
    // The page and the Recommended tab are fishball-ui's since F-UI.
  ]), [all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.dshInstance),
    // lite.test.mjs's browser environment and harness page (fishball-ui.contrast reuses the browser too).
    'test/v2-page-cases/lite-browser.mjs', 'test/v2-page-cases/lite-harness.js']),
})

/** Every suite by id. */
export const SUITES = Object.freeze({ ...V3_SUITES, ...V2_GROUPS })

/**
 * Suites of shelved packages: kept in the repo and in the map (so `--check` still owns their files),
 * but left out of every default run (test/run-v3.mjs, and test/run-affected.mjs by base ref or
 * `--all`). Naming one with `--suite=<id>` still runs it. fishball-board is shelved, not in
 * 1.0.0-alpha.1 (SHELVE-BOARD, the user, 2026-11-18); remove its id here when it is released again.
 */
export const SHELVED_SUITES = Object.freeze(['fishball-board.peers'])
/** The files of the shelved suites, which the default runs skip. */
export const SHELVED_FILES = Object.freeze(SHELVED_SUITES.flatMap((id) => SUITES[id].files))


/** Changed paths that need no suite (documents, reports, the design). */
export const IGNORED = Object.freeze(['docs/**', 'spikes/**', '**/*.md', 'DESIGN.md', 'LICENSE', 'examples/**', '.runtime/**', '.agents/**'])
