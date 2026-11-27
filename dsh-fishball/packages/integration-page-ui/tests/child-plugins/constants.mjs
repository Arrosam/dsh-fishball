/**
 * Vocabulary of the CHILD-PLUGINS page rows (DESIGN.md §28, R2–R5). Sources, and only these: §28 and
 * the requirements given to the test author (R1–R5 in ./cases.mjs); the public surface of fishball-core
 * (its cordis.patch.yml row ids) and of fishball-ui (the fishball-child-plugins sub-package's manifest
 * exports); DSH's own packages of the current version (dsh-app-boot, dsh-client-locale, the Plugins
 * page's markup in dsh-client-ui-plugin-manager's PluginManagerPage, its dictionaries, Discover's
 * registration in dsh-client-ui-plugin-market). Ported from test/v3/fishball-core/child-plugins/constants.mjs;
 * no value comes from the implementation under test.
 */

/** Row ids (§28; core's patch names them, the instance's launch overlay inserts the child-side one). */
export const ROWS = Object.freeze({
  child: 'fishball-child-plugins',
  recommend: 'fishball-recommend-plugins',
  /** The instance's child-side row: inserted only by the instance's launch overlay (§28). */
  instanceChild: 'dsh-instance-child',
  /** A module name for overlay rows (never loaded: the rows only compose). */
  moduleName: 'fbtest-overlay-module',
})

/** The two modes as the launch overlay files that make them (R1, ported in fishball-core's own tests). */
export const MODE = Object.freeze({
  instanceRun: Object.freeze({ name: 'instance-run', overlays: Object.freeze([Object.freeze([ROWS.instanceChild])]) }),
  standalone: Object.freeze({ name: 'standalone', overlays: Object.freeze([]) }),
})

/** fishball-child-plugins' sub-package (fishball-ui's `files` ships it; its own manifest names the entries). */
export const CHILD_PACKAGE = Object.freeze({
  manifest: 'package.json',
  clientExport: './client',
  nodeExport: '.',
  /** Where the page loads the script from (any URL under the child's base). */
  scriptUrl: 'http://child.test/fishball/plugins/fishball-child-plugins/client.js',
})

/** R4: the notice, word for word, per UI language. */
export const NOTICE = Object.freeze({
  en: 'Plugins for this Fishball are installed from the main DSH: Plugins → Fishball tab.',
  zh: '这个 Fishball 的插件在主 DSH 中安装：插件 → Fishball 标签页。',
})

/** UI languages. en and zh are DSH's built-in ones; ja is a further language DSH's Plugins page has words for. */
export const LANG = Object.freeze({
  en: 'en',
  zh: 'zh',
  ja: Object.freeze({ id: 'ja', label: '日本語', fallback: 'en' }),
})

/** DSH's browser packages these rows run (lib/client.js of each), and what they publish. */
export const DSH = Object.freeze({
  scope: '@deepseek-ai/',
  clientFile: Object.freeze(['lib', 'client.js']),
  locale: '@deepseek-ai/dsh-client-locale',
  manager: '@deepseek-ai/dsh-client-ui-plugin-manager',
  market: '@deepseek-ai/dsh-client-ui-plugin-market',
  /** Both plugins label their dictionary effect '<name>: dictionaries'; it is the first thing either applies. */
  dictionaryEffect: /: dictionaries$/,
  managerNs: 'pluginManager',
  marketNs: 'pluginMarket',
  /** Discover's registration id in 'plugins.tab' (dsh-client-ui-plugin-market) and its label key. */
  discoverId: 'discover',
  discoverLabelKey: 'title',
  /** The page's own tab value (PluginManagerPage INSTALLED_TAB). */
  installedTab: 'installed',
  /** The locale settings form's field. */
  preferenceField: 'preference',
  /** The Plugins page's word keys the markup uses (dsh-client-ui-plugin-manager locales). */
  key: Object.freeze({
    title: 'title', intro: 'intro', refresh: 'refresh', addPlugin: 'addPlugin', chooseAddMethod: 'chooseAddMethod',
    tabsLabel: 'tabsLabel', installedTab: 'installedTab', backToList: 'backToList', crumbRoot: 'crumbRoot',
    update: 'update', updateLabel: 'updateLabel', uninstall: 'uninstall', uninstallLabel: 'uninstallLabel', enableToggle: 'enableToggle',
    versionsUpdateLabel: 'versionsUpdateLabel', versionsTitle: 'versionsTitle', versionsRecheck: 'versionsRecheck', versionsCollapse: 'versionsCollapse', versionsInstalledTag: 'versionsInstalledTag',
  }),
  /** Host rows of DSH's plugin management (composition must keep them as DSH wrote them). */
  hostRowName: /dsh-(client-ui-)?plugin-(manager|market)/,
  /** DSH's shipped bundles every profile composes before a Fishball bundle. */
  shipped: Object.freeze(['dsh-base', 'dsh-web-app']),
  patchFile: 'cordis.patch.yml',
  profileContext: 'profileContext',
  fileScheme: 'file:',
})

/** The page as these rows draw it (PluginManagerPage.tsx markup). */
export const PAGE = Object.freeze({
  base: 'http://child.test/fishball/',
  /** React's useId value for the page's tabs (React 18 form ':r<n>:'). */
  tabsId: ':r5:',
  viewport: Object.freeze({ width: 1280, height: 800 }),
  /** DSH's CSS-module class prefix, read from its own sheet ('.<prefix>toolbar{'). */
  modulePrefix: /\.([A-Za-z0-9-]+_)toolbar\{/,
  /** The marker the drawn elements carry for the probe (an extra data attribute DSH does not use). */
  marker: 'data-fbtest',
  toolbarMarker: 'toolbar',
  notFound: 404,
})

/** Contributed tabs of the R3 table besides Discover. */
export const TABS = Object.freeze({
  other: Object.freeze({ id: 'fbtest-other', label: 'Fbtest other' }),
  other2: Object.freeze({ id: 'fbtest-other-two', label: 'Fbtest second' }),
  /** BVA: a tab whose id ends like Discover's but is another plugin's. */
  nearMiss: Object.freeze({ id: 'fbtest-discover', label: 'Fbtest look-alike' }),
})

/** Bundle pages of the R2 Uninstall partitions: the title the page shows and whether the Host can remove it. */
export const BUNDLES = Object.freeze([
  Object.freeze({ row: 'plain', name: 'fbtest-plain', title: 'fbtest-plain', removable: true }),
  Object.freeze({ row: 'scoped', name: '@fbtest/scoped-plugin', title: '@fbtest/scoped-plugin', removable: true }),
  Object.freeze({ row: 'quotes', name: 'fbtest-quotes', title: 'Quote "it" \\ back', removable: true }),
  Object.freeze({ row: 'cjk', name: 'fbtest-cjk', title: '插件 示例', removable: true }),
  Object.freeze({ row: 'not removable', name: 'fbtest-locked', title: 'fbtest-locked', removable: false }),
])
/**
 * R2 (follow-up, the lead 2026-11-20): the Update controls of a bundle page. Versions as a registry
 * lists them (BVA on the string: plain, prerelease, build metadata, a two-digit major); the installed one.
 */
export const VERSIONS = Object.freeze({
  installed: '1.0.0',
  newer: Object.freeze(['1.0.1', '2.0.0-beta.1', '10.0.0+build.7']),
  head: '1.0.1',
})
/** A control another plugin contributes to 'plugins.detail.actions' (must stay visible). */
export const DETAIL_ACTION = 'Fbtest detail action'
/** R2-09: a contributed detail action whose words begin like DSH's Update label (BVA look-alike). */
export const CONTRIBUTED_UPDATE = 'Update notes'

/** Scratch files for launch overlays. */
export const SCRATCH = Object.freeze({ prefix: 'fbtest-cp-ui-', overlayFile: 'launch-overlay.yml', empty: '[]\n', insertHead: '- insert:\n', label: 'fbtest-cp-ui' })
