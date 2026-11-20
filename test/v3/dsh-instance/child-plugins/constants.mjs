/**
 * Vocabulary for the CHILD-PLUGINS cases (DESIGN.md §28 "Plugins for an embedded Fishball are managed
 * from the main DSH", its "Restart" and "Implementation decisions" paragraphs, and the instance
 * README's route list). Every product value here comes from those texts; fixture values (names,
 * request ids, timings) are test data. Nothing is taken from the code under test.
 */
import path from 'node:path'
import { SUPPORT } from '../../../support/constants.mjs'

/** The host routes (README "Plugins for Fishball" and "Settings page"). */
export const ROUTE = Object.freeze({
  list: '/api/dsh-instance/plugins',
  inspect: '/api/dsh-instance/plugins/inspect',
  install: '/api/dsh-instance/plugins/install',
  cancel: '/api/dsh-instance/plugins/cancel',
  uninstall: '/api/dsh-instance/plugins/uninstall',
  use: '/api/dsh-instance/plugins/use',
  restart: '/api/dsh-instance/restart',
  status: '/api/dsh-instance/status',
  /** R10: a route of DSH's own plugin manager that the child manager must not take over (§28). */
  mainDetailFile: '/api/plugin-manager/detail-file',
})

/** Refusal codes and answers named by §28 and the README. */
export const CODE = Object.freeze({
  protected: 'protected', busy: 'busy', notReady: 'not-ready', removeFailed: 'remove-failed', instanceDisabled: 'instance-disabled',
})
export const APPLIED = Object.freeze({ nextStart: 'next-start', restarting: 'restarting' })
export const HTTP = Object.freeze({ ok: 200, badRequest: 400, forbidden: 403, tooLarge: 413 })
/** DSH's cancel answers (support/constants.mjs CANCEL_OUTCOMES, dsh-plugin-manager types). */
export { CANCEL_OUTCOMES } from '../../../support/constants.mjs'

/** The child's states (README "Ready"). */
export const STATE = Object.freeze({
  disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed',
})
export const STATES = Object.freeze(Object.values(STATE))

/** The protected bundles (§28 Implementation decisions; the task's list). */
export const PROTECTED = Object.freeze(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'fishball-core', 'fishball-ui', 'dsh-instance'])
/** The bundles that get no per-plugin button on a main bundle page (README). */
export const NO_BUTTON = Object.freeze(['dsh-instance', 'fishball-core', 'fishball-ui'])

/** Where the child profile lives under the main home (README "The child"). */
export const CHILD = Object.freeze({
  profile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  launches: Object.freeze(['fishball', 'runtime', 'launches']),
  manifest: 'package.json',
  lockfile: 'pnpm-lock.yaml',
  nodeModules: 'node_modules',
})
/** The main test profile (support/worker.mjs PROFILE). */
export const MAIN = Object.freeze({ profile: Object.freeze(['profiles', 'fbtest']), manifest: 'package.json', settingsNs: 'dsh-instance', enabledField: 'enabled' })

/** Offline fixture bundles (support/fixtures); packed into a tarball by the case when needed. */
export const FIXTURE = Object.freeze({
  tarballSource: Object.freeze({ name: 'fbtest-only-b', version: '0.0.1', dir: path.join(SUPPORT, 'fixtures', 'fbtest-only-b') }),
  directorySource: Object.freeze({ name: 'fbtest-only-c', version: '0.0.1', dir: path.join(SUPPORT, 'fixtures', 'fbtest-only-c') }),
  /** A shipped official optional bundle of both SDKs (availability 'installation' in DSH's listBundles). */
  shippedOfficial: '@deepseek-ai/dsh-experimental-session-search',
  /** Names no installation ships: an unknown one, and one only the MAIN profile has (installed, off). */
  notShipped: Object.freeze(['fbtest-not-shipped-anywhere', 'fbtest-only']),
  /** A registry package the hanging registry never answers (R3). */
  hangingSpec: 'fbtest-hang-registry-pkg@1.0.0',
  requestPrefix: 'fbtest-child-plugins-',
  /** An external link the case plants in the child profile to make its start fail (failed state, R8). */
  brokenLink: 'fbtest-broken-link',
  homeLabel: 'v3-child-plugins',
  notReadyLabel: 'v3-child-plugins-not-ready',
  foreignOrigin: 'https://evil.example',
  /** A body far over any bound a spec, name or request id needs (BVA: clearly above), and one well under it. */
  oversizedBytes: 1024 * 1024,
  smallPadBytes: 512,
})

/**
 * Waiting budgets. cancelAnswerMs is the one oracle: DSH's cancelInstall answers only after the stuck
 * run stopped (its lookup bound, ~100 s; lead 2026-11-20), so the bound plus a margin.
 */
export const BUDGET = Object.freeze({ readyMs: 150000, opMs: 120000, cancelMs: 30000, cancelAnswerMs: 150000, registryDropMs: 5000, pollMs: 500, testMs: 600000, quietMs: 1500 })

/** The integration gate the other instance suites use (placement/constants.mjs INTEGRATION). */
export const INTEGRATION = Object.freeze({ env: 'FBTEST_V3_INTEGRATION', on: '1', skip: 'integration (real host DSH and hosted child): run with FBTEST_V3_INTEGRATION=1' })

/** Browser half (client.js + client.status.js + client.fishball.js). */
export const PAGE = Object.freeze({
  entry: 'client.js',
  base: 'http://127.0.0.1:47011/',
  row: 'dsh-instance',
  configSlots: Object.freeze(['plugins.bundle.config', 'plugins.row.config']),
  detailSlot: 'plugins.detail.actions',
  langs: Object.freeze(['en', 'zh']),
  /** §28 "Restart": the confirm texts (en; zh is the page's own translation of them). */
  restart: Object.freeze({
    words: Object.freeze({ en: 'Restart' }),
    title: Object.freeze({ en: 'Restart Fishball?' }),
    body: Object.freeze({ en: 'Running work in Fishball stops and the Fishball window reloads.' }),
    /** Harness handles: the page's data hooks for Restart and its confirm control. */
    attr: 'data-fishball-instance-restart',
    confirmAttr: 'data-fishball-instance-restart-confirm',
  }),
  /** Per-state expectation (EP over the states; ready/failed/stopped enabled, starting/stopping disabled, off hidden). */
  restartByState: Object.freeze({ ready: 'enabled', failed: 'enabled', stopped: 'enabled', starting: 'disabled', stopping: 'disabled', disabled: 'hidden' }),
  /**
   * The Fishball tab's Restart (user 2026-11-20 "Add a restart fishball button in the plugin -> fishball
   * tab"): the settings page's Restart, in the tab's top row beside Install for Fishball.
   */
  tab: Object.freeze({
    slot: 'plugins.tab',
    rootAttr: 'data-fishball-tab',
    installAttr: 'data-fishball-install-open',
    /** Words of the 'dsh-instance' locale namespace the Restart shows (the requirement names the keys). */
    ns: 'dsh-instance',
    key: Object.freeze({ restart: 'restart', restarting: 'restarting', title: 'restartTitle', body: 'restartDescription', cancel: 'restartCancel', refused: 'restartRefused.' }),
    /** EP over the state: shown (enabled unless busy / in flight), disabled, hidden (any other, an unknown one included). */
    shown: Object.freeze(['ready', 'failed', 'stopped']),
    disabled: Object.freeze(['starting', 'stopping']),
    hidden: Object.freeze(['disabled', 'waiting', 'unavailable', 'fbtest-unknown-state']),
    /** Refusals with words; any other code shows none. */
    refusals: Object.freeze(['instance-disabled', 'busy']),
    otherRefusal: 'fbtest-other-refusal',
    restartBody: '{}',
    /** ~1 s poll: a window of 2.5 s sees at least two polls when visible and mounted, none when hidden or unmounted. */
    pollWindowMs: 2500,
    minPolls: 2,
    transitionMs: 4000,
    alertRole: 'alert',
  }),
  /** The per-plugin button texts (README / §28). */
  button: Object.freeze({ uninstall: 'Uninstall from Fishball', use: 'Use in Fishball', install: 'Install to Fishball' }),
  settleRounds: 40,
  waitMs: 3000,
  pollMs: 20,
  primitiveAttr: 'data-primitive',
})
