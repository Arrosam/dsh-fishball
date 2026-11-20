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
  fishballUi: 'packages/fishball-ui',
  fishballShared: 'packages/shared',
  fishballBoard: 'packages/board',
})

const all = (pkg) => pkg + '/**'
const sub = (pkg, ...parts) => [pkg, ...parts].join('/') + '/**'
/** A package's files outside any subfolder (index.js, package.json, cordis.patch.yml, …). */
const top = (pkg) => pkg + '/*'
const TOOLS_RUNTIME = `${PACKAGE.dshConnector}/tools/**/!(*.md|*.d.ts)`

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
 * reached only from index.js; the package's manifest is in that set too.
 */
const CONNECTOR_CORE = Object.freeze(['constants', 'digest', 'errors', 'text'].map((name) => `${PACKAGE.dshConnector}/src/${name}.js`))
/** The connector's manifest: k1 reads its dependencies. */
const CONNECTOR_MANIFEST = PACKAGE.dshConnector + '/package.json'
/**
 * core's link, its own K3a contracts every link-side module imports (core/src/link → contracts;
 * F-OWN-SCHEMA), and the `codeOf` log rule (src/events/diagnostics.js) the link and the Connect
 * route log failures by (F-FIX-3).
 */
const CORE_LINK = Object.freeze([sub(PACKAGE.fishballCore, 'src', 'link'), sub(PACKAGE.fishballCore, 'contracts'), `${PACKAGE.fishballCore}/src/events/diagnostics.js`])

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
  'contract.own-schema': suite('core-owned MCP surface and real connector drift (F-OWN-SCHEMA)', v3('contract/own-schema'),
    [sub(PACKAGE.fishballCore, 'contracts'), PACKAGE.fishballCore + '/src/*', PACKAGE.fishballCore + '/src/!(slim)/**', top(PACKAGE.fishballCore),
      // The absence rows must rerun if a generated copy or its generator comes back.
      sub(PACKAGE.fishballCore, 'vendor'), sub(PACKAGE.fishballCore, 'scripts'), all(PACKAGE.fishballBoard), all(PACKAGE.fishballShared), ...CONNECTOR_CONTRACTS,
      // What the real-connector rows boot (as dsh-connector.mcp-tools).
      sub(PACKAGE.dshConnector, 'src', 'mcp'), sub(PACKAGE.dshConnector, 'src', 'pairs'), sub(PACKAGE.dshConnector, 'src', 'mailbox'),
      sub(PACKAGE.dshConnector, 'src', 'schema-value'), ...CONNECTOR_CORE, sub(PACKAGE.dshConnector, 'host-services')]),
  'fishball-core.package': suite('core package, slim child move (R-CORE; the settings-section point withdrawn, 1.34)', v3('fishball-core/package'),
    [all(PACKAGE.fishballCore), sub(PACKAGE.dshInstance, 'src', 'slim'), sub(PACKAGE.dshInstance, 'src', 'child'), PACKAGE.dshInstance + '/client*.js']),
  'fishball-core.bridge': suite('bridge façade, list_changed refresh, X8 attention (F-FACADE)', v3('fishball-core/bridge'),
    [sub(PACKAGE.fishballCore, 'src', 'bridge'), sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS]),
  'fishball-core.events': suite('interception, acceptance ledger, wake (F-INTERCEPT)', v3('fishball-core/events'),
    [sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS]),
  'fishball-core.link': suite('MCP link (F-LINK)', v3('fishball-core/link'),
    [...CORE_LINK, top(PACKAGE.fishballCore), ...CONNECTOR_CONTRACTS, ...CONNECTOR_CORE, CONNECTOR_MANIFEST, MCP_RELEASE_PINS, sub(PACKAGE.dshConnector, 'host-services')]),
  // The card's browser half is fishball-ui's chunk since F-UI; its package.json ships it.
  // F-FIX: ASK-UI-01 draws the card with fishball-ui's client.js and client.asks.js in the F-SETTINGS scripted page.
  'fishball-core.asks': suite('ask cards: ask_user, the asks service and routes, the drawn card (F-ASKCARD, F-FIX)', v3('fishball-core/asks'),
    [sub(PACKAGE.fishballCore, 'src', 'asks'), PACKAGE.fishballUi + '/client.asks.js', PACKAGE.fishballUi + '/client.js', PACKAGE.fishballUi + '/package.json', ...CORE_LINK,
      'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs', 'test/v3/fishball-core/settings/constants.mjs']),
  'fishball-core.identity': suite('identity, pairing decisions, token-revoked (F-PAIR)', v3('fishball-core/identity'),
    [sub(PACKAGE.fishballCore, 'src', 'identity'), ...CORE_LINK, sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS,
      // Its name rows read the own-schema suite's constants.
      'test/v3/contract/own-schema/constants.mjs']),
  // Core's link, its saved credentials and Connect (src/link, with the Fishball side's OAuth client
  // copy since REMOVE-V2b) with F-PAIR's pairing over them; the fakes reuse F-PAIR's fake pair registry and the
  // oauth-client suite's in-process DSH host.
  'fishball-core.link-save': suite('saved credentials once on first acceptance, Connect (F-LINK-SAVE)', v3('fishball-core/link-save'),
    [sub(PACKAGE.fishballCore, 'src', 'identity'), ...CORE_LINK,
      'test/v3/fishball-core/identity/**', 'test/v3/shared/dsh-host/subject.mjs', 'test/v3/shared/connector-pairs/subject.mjs', ...CONNECTOR_CONTRACTS]),
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
      top(PACKAGE.fishballUi), sub(PACKAGE.fishballUi, 'src'), all(PACKAGE.fishballShared), ...CORE_LINK, 'test/v3/fishball-core/link/log-privacy.mjs']),
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
      'test/v3/shared/dsh-host/subject.mjs',
      // UI-POLISH-F: the navigation rows (nav-page.mjs) render through the F-SETTINGS primitive stand-ins and their constants.
      'test/v3/fishball-core/settings/primitives.mjs', 'test/v3/fishball-core/settings/constants.mjs']),
  // F-WIRE: core's main row, boots a real standalone DSH with core and fishball-ui as whole bundles
  // (the guards worker), and scans the Fishball side for DSH-side imports. fishball-board is shelved
  // (the user, 2026-11-18); the board-present partitions use the suite's own stand-in fixture.
  'fishball-core.wire': suite("core's main row: fishballInstance, fishballStatus, the manager, model, Connect routes and web callback (F-WIRE)", v3('fishball-core/wire'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), 'test/v3/fishball-ui/guards/**']),
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
      'test/v3/contract/package-boundaries/**', 'test/v3/shared/dsh-host/**', 'test/v2-page-cases/lite-browser.mjs', 'test/v3/fishball-core/settings/primitives.mjs']),
  'fishball-core.manager': suite("core's manager: reminders, singleton, preset and persona, generated identity, model (F-WIRE)", v3('fishball-core/manager'),
    [all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/support/fixtures/fake-llm.mjs', 'test/support/host.mjs']),
  // F-WIRE: fishball-ui's model dialog, strip route and live core rows, in the browser sandbox and a real DSH.
  'fishball-ui.model-dialog': suite('fishball-ui model dialog, status strip route, live core on/off, composer picker guard (F-WIRE)', v3('fishball-ui/model-dialog'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), 'test/v3/fishball-core/wire/**', 'test/v3/fishball-core/settings/**', 'test/v3/fishball-ui/guards/**',
      // UI-POLISH-F: the drawn status card rows build their frames with the F-STATUS strip view binding and its card constants.
      'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/constants.mjs']),
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
      'test/v3/fishball-core/settings/constants.mjs', 'test/v3/fishball-ui/stream/**', 'test/v3/shared/dsh-host/subject.mjs', 'test/v3/fishball-core/package/constants.mjs']),
  // R-FIX-FUI F3 / F9: every fishball-ui dock (strip, ask cards, pairing card) over one health-aware
  // EventSource stand-in, frames from the real stripView / pairingView and the F-ASKCARD card shape.
  'fishball-ui.stream': suite('stream health of the strip, ask cards and pairing card; the ask card time in the DSH UI language (R-FIX-FUI F3, F9)', v3('fishball-ui/stream'),
    [all(PACKAGE.fishballUi), all(PACKAGE.fishballShared), 'test/v3/fishball-core/settings/page.mjs', 'test/v3/fishball-core/settings/primitives.mjs',
      'test/v3/fishball-core/settings/constants.mjs', 'test/v3/fishball-core/asks/world.mjs', 'test/v3/fishball-core/asks/constants.mjs', 'test/v3/fishball-core/asks/subject.mjs',
      'test/v3/fishball-core/status/subject.mjs', 'test/v3/fishball-core/status/constants.mjs', 'test/v3/fishball-ui/model-dialog/strip.mjs', 'test/v3/fishball-ui/model-dialog/constants.mjs',
      'test/v3/fishball-ui/pairing/**', 'test/v3/shared/dsh-host/subject.mjs', 'test/v3/fishball-core/package/constants.mjs']),
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
  'fishball-board.peers': suite('board without core (FEAT-PEERS; fold-notify was removed, REMOVE-WD)', v3('fishball-board/peers'),
    [all(PACKAGE.fishballBoard), sub(PACKAGE.dshConnector, 'mcp-schema')]),
  // K3a reads core's contracts and patch against the connector's published schema and tools, the
  // fishball-ui seam's values in fishball-shared (moved there by F-UI), and scans the DSH-side
  // package folders for imports of core.
  'contract.k3a-core-seams': suite('K3a core-side seams: own MCP-surface copy, hosted import names, Connect, fishball-ui seam', v3('contract/k3a-core-seams'),
    [sub(PACKAGE.fishballCore, 'contracts'), top(PACKAGE.fishballCore), all(PACKAGE.fishballShared), sub(PACKAGE.dshConnector, 'host-services'), ...CONNECTOR_CONTRACTS,
      all(PACKAGE.dshConnector), all(PACKAGE.dshConnectorUi), all(PACKAGE.dshInstance)]),
  // SHELVE-BOARD: its core/ui board-reference rows read source tokens with the R-CORE suite's token worker.
  'contract.package-boundaries': suite('package boundaries, imports, packing (R-SHARED, PLAT-EP-07)', v3('contract/package-boundaries'),
    [...Object.values(PACKAGE).map(all), RELEASE_SCRIPTS, 'test/v3/release/pack/release.mjs',
      'test/v3/fishball-core/package/static.mjs', 'test/v3/fishball-core/package/constants.mjs', 'test/v3/fishball-core/package/tokens-worker.mjs']),
  // Reads every package's manifest and import graph and runs the placement over package copies.
  'contract.split-shared': suite('one shared library per side: cross-side edges, library contents, interim copies, placement (SPLIT-SHARED)', v3('contract/split-shared'),
    [...Object.values(PACKAGE).map(all)]),
  // SHELVE-BOARD: the runners' selection of shelved suites, through their command lines (no SDK).
  'contract.suite-map': suite('the runners leave shelved suites out of default runs, --suite still runs them (SHELVE-BOARD)', ['test/v3/contract/suite-map/index.test.mjs'],
    ['test/run-affected.mjs', 'test/run-v3.mjs', 'test/suites.mjs', 'test/support/suite-runner.mjs', 'test/support/contract-link.mjs', 'test/support/constants.mjs']),
  // REL-PACK: the release tarballs scripts/pack-v3.mjs writes. Every package's shipped files and
  // manifest are in a tarball, so any package file, or the pack script itself, reruns it. It reads
  // the release output (.runtime/release/<version>/, built beforehand), so run the pack first.
  'release.pack': suite('the release tarballs: contents, versions, checksums, offline install with the DSH CLI (REL-PACK)', v3('release/pack'),
    [...Object.values(PACKAGE).map(all), RELEASE_SCRIPTS]),
})

/**
 * Pre-V3 suites by the package they exercise. The files stay where they are; only the grouping is
 * new. REMOVE-V2c deleted the H-STUB suites (the connector booted with a stub instance) and the
 * pre-V3 selection (test/v2-suites.mjs) with them. The connector's and the instance's pre-V3 suites
 * moved to the dsh-connector and dsh-fishball-instance repositories.
 */
const v2 = (names) => names.map((n) => (n.includes('/') ? n : `test/${n}.test.mjs`))
export const V2_GROUPS = Object.freeze({
  // DSH host checks that import no package: the official credential store and the public runtime
  // isolation boundary. The instance's launch and lifecycle suites moved to dsh-fishball-instance.
  'v2.host': suite('DSH host: provider sync, runtime isolation', v2([
    'provider-sync-official', 'runtime-isolation-boundary', 'runtime-isolation-transport',
  ]), [all(PACKAGE.fishballCore), all(PACKAGE.fishballUi), all(PACKAGE.fishballShared)]),
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
