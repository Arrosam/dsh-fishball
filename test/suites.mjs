/**
 * The one map from source paths to test suites (the user, 2026-11-16: "按照实际插件的模块分布拆分，
 * 每次动了哪个模块才跑哪个的测试"). test/run-affected.mjs reads it to pick the suites a change needs;
 * test/run-suite.mjs runs one named suite; test/run-v3.mjs and test/run-v2.mjs stay the full runs.
 *
 * A suite is a list of test files. It is selected when a changed path matches one of its
 * `triggers` (node:path matchesGlob, repo-relative, `/` separators), or when the suite's own files
 * change. Nothing here changes what a file asserts: the map only chooses which files run.
 *
 * How the triggers were derived (2026-11-16, at RENAME-DSH): from each suite's import closure
 * (its own modules and the package modules they load), closed over the packages' own import
 * graph, so a module's suite also runs when a module it imports changes. Two kinds of file are
 * wider than their imports and say why at their entry:
 * - a suite that boots a real DSH host (H-STUB, the slim child) loads whole packages at runtime
 *   through the profile, not through imports, so it triggers on the whole package;
 * - a static check that reads every file of a package (the contract suites) triggers on it all.
 * Revisit an entry when a suite starts loading another module. `node test/run-affected.mjs --check`
 * reports every V2- or V3-selected test file no suite owns, any owned twice, and any listed file
 * that does not exist.
 */

/** Package folders by their package name (design §1.0c). Folder names are the checkout's. */
export const PACKAGE = Object.freeze({
  dshConnector: 'packages/dsh-connector',
  dshConnectorUi: 'packages/dsh-connector-ui',
  dshInstance: 'packages/dsh-instance',
  // dsh-connector-adapter and dsh-connector-shared have no folder yet (C-MCP-ADAPTER, SPLIT-SHARED).
  fishballCore: 'packages/core',
  fishballShared: 'packages/shared',
  fishballBoard: 'packages/board',
})

const all = (pkg) => pkg + '/**'
const sub = (pkg, ...parts) => [pkg, ...parts].join('/') + '/**'
/** A package's files outside any subfolder (index.js, package.json, cordis.patch.yml, …). */
const top = (pkg) => pkg + '/*'

/**
 * Package modules many suites depend on: the K1/K2/V2 contracts the connector's modules import,
 * and the shared library. Changing one reruns every suite that imports it (closure above).
 */
const CONNECTOR_CONTRACTS = Object.freeze([
  sub(PACKAGE.dshConnector, 'mcp-schema'), sub(PACKAGE.dshConnector, 'tools'), sub(PACKAGE.dshConnector, 'contract'),
])
/**
 * The connector's top-level src/*.js files the V3 modules import (src/tokens … src/mcp/*): measured
 * 2026-11-16, the union of their import closures is these four. Other src/*.js files are V2's,
 * reached only from index.js (CONNECTOR_BOOT); the package's manifest is in that set too.
 */
const CONNECTOR_CORE = Object.freeze(['constants', 'digest', 'errors', 'text'].map((name) => `${PACKAGE.dshConnector}/src/${name}.js`))
/** The connector's manifest: k1 reads its dependencies, core's vendor script its export map. */
const CONNECTOR_MANIFEST = PACKAGE.dshConnector + '/package.json'
/** core's link and the vendored K1 copy every link-side module imports (core/src/link → vendor, contracts). */
const CORE_LINK = Object.freeze([sub(PACKAGE.fishballCore, 'src', 'link'), sub(PACKAGE.fishballCore, 'vendor'), sub(PACKAGE.fishballCore, 'contracts')])

/**
 * What a booted connector row loads: the import closure of its entry (index.js → src/*.js,
 * src/slim/, contract/, mcp-schema/, tools/), plus the files DSH reads to install the bundle
 * (package.json, cordis.patch.yml, locale/, assets/). The V3 modules under src/ (tokens, pairs,
 * mailbox, routing, handover, contrib, mcp, schema-value) are not imported by the entry yet, so a
 * change there does not rerun the H-STUB suites. When C-WIRE imports them from index.js, add them.
 */
const CONNECTOR_BOOT = Object.freeze([
  PACKAGE.dshConnector + '/src/*', top(PACKAGE.dshConnector), sub(PACKAGE.dshConnector, 'src', 'slim'), ...CONNECTOR_CONTRACTS,
  sub(PACKAGE.dshConnector, 'locale'), sub(PACKAGE.dshConnector, 'assets'),
])

/** Test support every suite may load, and the runners: a change there reruns every suite. */
export const FULL = Object.freeze(['test/support/**', 'test/suites.mjs', 'test/run-*.mjs', 'test/run-*.sh', 'test/v2-suites.mjs', 'package.json'])

/** The SDKs each V3 suite has one entry file for (test/v3/<package>/<module>/sdk-<version>.test.mjs). */
export const SDK_VERSIONS = Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1'])
const v3 = (dir) => Object.freeze(SDK_VERSIONS.map((sdk) => `test/v3/${dir}/sdk-${sdk}.test.mjs`))
const suite = (description, files, triggers) => Object.freeze({ description, files: Object.freeze(files), triggers: Object.freeze(triggers) })

/**
 * V3 suites, one per package module (test/v3/<package>/<module>), plus `contract.*`, the
 * cross-package contract and boundary rows (test/v3/contract/*). Ids are `<package>.<module>`.
 */
export const V3_SUITES = Object.freeze({
  'dsh-connector.tokens': suite('token entries, generation, revocation signal (C-TOKENS)', v3('dsh-connector/tokens'),
    [sub(PACKAGE.dshConnector, 'src', 'tokens'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.pairs': suite('pair store, pair / set_name, names (C-PAIR)', v3('dsh-connector/pairs'),
    [sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.mailbox': suite('per-pair mailbox, poll/ack, hints (C-MAILBOX)', v3('dsh-connector/mailbox'),
    [sub(PACKAGE.dshConnector, 'src', 'mailbox'), sub(PACKAGE.dshConnector, 'src', 'schema-value'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.schema-value': suite('validateValue wrapper (C-MAILBOX, C-EXT)', ['test/v3/dsh-connector/schema-value/index.test.mjs'],
    [sub(PACKAGE.dshConnector, 'src', 'schema-value')]),
  'dsh-connector.routing': suite('managed state, routing, hand-over service (C-ROUTE)', v3('dsh-connector/routing'),
    [sub(PACKAGE.dshConnector, 'src', 'routing'), sub(PACKAGE.dshConnector, 'src', 'handover'), sub(PACKAGE.dshConnector, 'src', 'mailbox'),
      sub(PACKAGE.dshConnector, 'src', 'pairs'), sub(PACKAGE.dshConnector, 'src', 'mcp', 'http'), sub(PACKAGE.dshConnector, 'src', 'mcp', 'oauth'),
      sub(PACKAGE.dshConnector, 'src', 'schema-value'), sub(PACKAGE.dshConnector, 'host-services'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.mcp-http': suite('MCP route, request gate, limits (C-HTTP)', v3('dsh-connector/mcp-http'),
    [sub(PACKAGE.dshConnector, 'src', 'mcp', 'http'), sub(PACKAGE.dshConnector, 'src', 'mcp', 'oauth'), sub(PACKAGE.dshConnector, 'src', 'pairs'),
      ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.mcp-tools': suite('core MCP tools and result envelope (C-TOOLS)', v3('dsh-connector/mcp-tools'),
    [sub(PACKAGE.dshConnector, 'src', 'mcp'), sub(PACKAGE.dshConnector, 'src', 'mailbox'), sub(PACKAGE.dshConnector, 'src', 'pairs'),
      sub(PACKAGE.dshConnector, 'src', 'schema-value'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.oauth': suite('authorization server: store, limiter, verifier, token endpoint (C-OAUTH)', v3('dsh-connector/oauth'),
    [sub(PACKAGE.dshConnector, 'src', 'mcp', 'oauth'), sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.oauth-web': suite('browser authorization: approval page, CIMD, code and refresh grants (C-OAUTH-WEB)', v3('dsh-connector/oauth-web'),
    [sub(PACKAGE.dshConnector, 'src', 'mcp', 'oauth-web'), sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector.contrib': suite('contribution service (C-EXT)', v3('dsh-connector/contrib'),
    [sub(PACKAGE.dshConnector, 'src', 'contrib'), sub(PACKAGE.dshConnector, 'src', 'mailbox'), sub(PACKAGE.dshConnector, 'src', 'schema-value'),
      all(PACKAGE.fishballShared), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  'dsh-connector-ui.shell': suite('host half and client shell (U-SHELL)', v3('dsh-connector-ui/shell'),
    [all(PACKAGE.dshConnectorUi), sub(PACKAGE.dshInstance, 'src', 'child-settings'), sub(PACKAGE.dshConnector, 'tools'), sub(PACKAGE.dshConnector, 'host-services')]),
  // Reads the instance's whole placement and launch overlay, and core's patch it places.
  'dsh-instance.placement': suite('placement of the set, launch overlay, hosted-child guards (I-PLACE)', v3('dsh-instance/placement'),
    [all(PACKAGE.dshInstance), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared)]),
  'fishball-core.package': suite('core package, slim child move, settings-section point (R-CORE)', v3('fishball-core/package'),
    [all(PACKAGE.fishballCore), sub(PACKAGE.dshInstance, 'src', 'slim'), sub(PACKAGE.dshInstance, 'src', 'child-settings')]),
  'fishball-core.bridge': suite('bridge façade, list_changed refresh, X8 attention (F-FACADE)', v3('fishball-core/bridge'),
    [sub(PACKAGE.fishballCore, 'src', 'bridge'), sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS]),
  'fishball-core.events': suite('interception, acceptance ledger, wake (F-INTERCEPT)', v3('fishball-core/events'),
    [sub(PACKAGE.fishballCore, 'src', 'events'), ...CORE_LINK, ...CONNECTOR_CONTRACTS]),
  'fishball-core.link': suite('MCP link (F-LINK)', v3('fishball-core/link'),
    [...CORE_LINK, sub(PACKAGE.fishballCore, 'scripts'), top(PACKAGE.fishballCore), ...CONNECTOR_CONTRACTS, ...CONNECTOR_CORE, CONNECTOR_MANIFEST, sub(PACKAGE.dshConnector, 'host-services')]),
  'fishball-core.asks': suite('ask cards: ask_user, the asks service and routes (F-ASKCARD)', v3('fishball-core/asks'),
    [sub(PACKAGE.fishballCore, 'src', 'asks'), PACKAGE.fishballCore + '/client.asks.js', ...CORE_LINK]),
  'fishball-core.identity': suite('identity, pairing decisions, token-revoked (F-PAIR)', v3('fishball-core/identity'),
    [sub(PACKAGE.fishballCore, 'src', 'identity'), ...CORE_LINK, sub(PACKAGE.dshConnector, 'src', 'pairs'), ...CONNECTOR_CORE, ...CONNECTOR_CONTRACTS]),
  // fishball-ui has no folder yet (F-UI moves it out of core): its guards are core's src/guards, ui/ and patch.
  'fishball-ui.guards': suite('guard rows, override report, self-reorder (F-GUARDS)', v3('fishball-ui/guards'),
    [sub(PACKAGE.fishballCore, 'src', 'guards'), sub(PACKAGE.fishballCore, 'ui'), sub(PACKAGE.fishballCore, 'contracts'), top(PACKAGE.fishballCore),
      all(PACKAGE.dshInstance)]),
  'fishball-board.peers': suite('board and fold-notify without core (FEAT-PEERS)', v3('fishball-board/peers'),
    [all(PACKAGE.fishballBoard), sub(PACKAGE.dshConnector, 'mcp-schema')]),
  // The contract suites read every file of the packages they bound, so any change there reruns them.
  'contract.k1-mcp-schema': suite('K1 MCP schema freeze', v3('contract/k1-mcp-schema'),
    [...CONNECTOR_CONTRACTS, sub(PACKAGE.fishballCore, 'vendor'), ...CONNECTOR_CORE, CONNECTOR_MANIFEST, sub(PACKAGE.dshConnector, 'host-services')]),
  // K1d amends K1 and K3's tokens.d.ts; its retire rows drive the real mailbox module (c-mailbox's world).
  'contract.k1d-amendments': suite('K1d amendments: token reveal, page id, Mailbox.transfer, SettingsWriter, SessionNotes', v3('contract/k1d-amendments'),
    [...CONNECTOR_CONTRACTS, sub(PACKAGE.dshConnector, 'host-services'), sub(PACKAGE.fishballCore, 'vendor'), sub(PACKAGE.fishballCore, 'scripts'),
      sub(PACKAGE.dshConnector, 'src', 'mailbox'), sub(PACKAGE.dshConnector, 'src', 'schema-value'), ...CONNECTOR_CORE]),
  'contract.k2-tools': suite('K2 contribution contract freeze', v3('contract/k2-tools'),
    [sub(PACKAGE.dshConnector, 'tools'), sub(PACKAGE.fishballCore, 'vendor')]),
  'contract.k3-host-services': suite('K3 host-only service and core contract freeze', v3('contract/k3-host-services'),
    [sub(PACKAGE.dshConnector, 'host-services'), sub(PACKAGE.fishballCore, 'contracts')]),
  // K3a reads core's contracts and patch against the connector's published schema and tools, and
  // scans the DSH-side package folders for imports of core.
  'contract.k3a-core-seams': suite('K3a core-side seams: own MCP-surface copy, hosted import names, Connect, fishball-ui seam', v3('contract/k3a-core-seams'),
    [sub(PACKAGE.fishballCore, 'contracts'), top(PACKAGE.fishballCore), sub(PACKAGE.dshConnector, 'host-services'), ...CONNECTOR_CONTRACTS,
      all(PACKAGE.dshConnector), all(PACKAGE.dshConnectorUi), all(PACKAGE.dshInstance)]),
  'contract.package-boundaries': suite('package boundaries, imports, packing (R-SHARED, PLAT-EP-07)', v3('contract/package-boundaries'),
    [...Object.values(PACKAGE).map(all)]),
  'contract.embed': suite('connector-ui package and the moved client (R-EMBED)', v3('contract/embed'),
    [all(PACKAGE.dshConnectorUi), all(PACKAGE.dshInstance), all(PACKAGE.dshConnector)]),
})

/**
 * V2 release suites by the package they exercise. The files stay where they are (the V2 release
 * selection, test/v2-suites.mjs, and its V2B-SUITE checks name them by path); only the grouping is
 * new. `v2.connector-host` boots a real DSH with the connector and the stub instance (H-STUB), so a
 * change to what that row loads (CONNECTOR_BOOT) or to the shared library reruns it.
 */
const v2 = (names) => names.map((n) => (n.includes('/') ? n : `test/${n}.test.mjs`))
export const V2_GROUPS = Object.freeze({
  'v2.connector-host': suite('connector behaviour on a booted DSH with the stub instance (H-STUB)', v2([
    'approvals-broker', 'approvals-provenance', 'approvals-ptc', 'approvals-routing', 'config', 'limits-config', 'limits-live',
    'limits-read-roles', 'managed-durable', 'managed-list', 'managed-marks', 'managed-start', 'managed-ways', 'messaging-durable',
    'messaging-inbound', 'messaging-outbound', 'messaging-read-roles', 'messaging-send', 'messaging-start-halfmade',
    'messaging-start-title', 'persona-bold', 'rev11b-ask', 'rev11b-direct', 'rev11b-list', 'rev11b-pass', 'rev11b-ptc',
    'rev11b-quotes', 'rev11b-sources', 'rev11c-answer', 'rev11c-leave', 'rev11c-pile', 'rev11d-end', 'rev11d-grants',
    'rev11d-regress', 'rev11e-answer', 'rev11e-direct', 'rev11e-frozen', 'rev11g-flow', 'rev11g-hold', 'rev11g-modes',
    'rev11g-plan', 'rev11g-restart', 'rev11g-validate', 'rev11h-stop', 'session-list-activity', 'session-list-activity-boundaries',
    'start-session-model', 'start-session-model-persistence', 'start-session-model-races', 'watches-durable', 'watches-fire',
    'watches-http', 'e1-d2-invalid-main-home',
  ]), [...CONNECTOR_BOOT, all(PACKAGE.fishballShared), sub(PACKAGE.dshConnectorUi, 'src', 'client')]),
  'v2.connector-unit': suite('connector contract and modules, no host (V2 D1–D3)', v2([
    'v2-d1-contract', 'v2-d1-d3-schema', 'v2-d1-runtime', 'v2-d2-config-retention', 'v2-d3-connector-attention', 'v2-d3-signal-producer',
    'packages/dsh-connector/test/instance-ext/k1.test.mjs', 'slim-022-install',
  ]), [all(PACKAGE.dshConnector)]),
  'v2.connector-ui': suite('the moved V2 client: brand, frame, card titles, framed lang', v2([
    'brand-font-language', 'v2-pg-origin-frame-policy', 'body-soul-k2-frame', 'e1-card-titles',
  ]), [all(PACKAGE.dshConnectorUi), sub(PACKAGE.dshConnector, 'contract'), top(PACKAGE.dshConnector), top(PACKAGE.dshInstance)]),
  // These boot the instance's real child (lifecycle, admission, embed): a change in the instance,
  // the core it places, or the shared library it bundles reruns them.
  'v2.instance': suite('the instance: launch, lifecycle, embed, provider sync, child pages', v2([
    'body-soul-i1c-status', 'body-soul-i2-launch', 'body-soul-i3-admission', 'body-soul-i6-sync', 'body-soul-i9-embed',
    'e1-p1-connector-departure', 'e1-p3-sync-https', 'instance-ext-fakehost', 'provider-sync-coordinator', 'provider-sync-official',
    'runtime-isolation-boundary', 'runtime-isolation-transport', 'v2-pg-origin-broker', 'v2-r2-start-detail', 'v2-r3-native-access',
    'v2-r4-core-copy', 'v2-r4-exit-race', 'test/verification/w0-host-session.test.mjs',
    'packages/dsh-instance/test/instance-ext/manager-attach-background.test.mjs', 'packages/dsh-instance/test/instance-ext/manager-workspace.test.mjs',
    'packages/dsh-instance/test/instance-ext/page-open-session.test.mjs', 'packages/dsh-instance/test/instance-ext/ready-gate.test.mjs',
    'packages/dsh-instance/test/instance-ext/x0-c-held-context.test.mjs', 'packages/dsh-instance/test/instance-ext/x0-c.test.mjs',
    'test/v2-page-cases/child-boot.test.mjs', 'test/v2-page-cases/child-boot-nav.test.mjs', 'test/v2-page-cases/child-boot-reopen.test.mjs',
    'test/v2-page-cases/set-main-only-sync.test.mjs',
  ]), [all(PACKAGE.dshInstance), all(PACKAGE.fishballCore), all(PACKAGE.fishballShared), sub(PACKAGE.dshConnector, 'contract')]),
  'v2.fishball-core': suite('core\'s slim child and pages: chat, records, i18n, persona, skills, settings, lite', v2([
    'body-soul-i6-settings-view', 'body-soul-i7-records', 'body-soul-i9-lang', 'e1-p2-model-choice', 'e1-p4-header-name',
    'persona-bold-render', 'test/instance-ext/x0-i.test.mjs', 'test/instance-ext/x0-w.test.mjs',
    'test/private-skills/sk-bva.test.mjs', 'test/private-skills/sk-dt.test.mjs', 'test/private-skills/sk-ep.test.mjs',
    'test/private-skills/sk-st.test.mjs', 'test/private-skills/sk-uc.test.mjs',
    'test/v2-page-cases/lite.test.mjs', 'test/v2-page-cases/page.test.mjs', 'test/v2-page-cases/pg-origin.test.mjs',
    'test/v2-page-cases/ready.test.mjs', 'test/v2-page-cases/set.test.mjs',
    'test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs', 'test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs',
    'packages/dsh-instance/test/instance-ext/page-boot-unwind.test.mjs', 'packages/dsh-instance/test/instance-ext/page-open-listed.test.mjs',
  ]), [all(PACKAGE.fishballCore), all(PACKAGE.dshInstance), sub(PACKAGE.dshConnector, 'contract')]),
  'v2.fishball-shared': suite('the shared library\'s provider-sync engine and host', v2(['provider-sync-engine', 'provider-sync-host']),
    [all(PACKAGE.fishballShared)]),
  // Static readers of whole packages: v2-boundary reads every manifest and the V2 selection,
  // limits-source every src/ and contract/ file of four packages and the plugin author guide.
  'v2.boundary': suite('V2 release boundary, suite selection and the source-level limit checks', v2(['v2-boundary', 'limits-source']),
    [...Object.values(PACKAGE).map(all), 'test/v2-suites.mjs', 'docs/plugin-author-guide.md']),
})

/** Every suite by id. */
export const SUITES = Object.freeze({ ...V3_SUITES, ...V2_GROUPS })


/** Changed paths that need no suite (documents, reports, the design). */
export const IGNORED = Object.freeze(['docs/**', 'spikes/**', '**/*.md', 'DESIGN.md', 'LICENSE', 'examples/**', '.runtime/**', '.agents/**'])
