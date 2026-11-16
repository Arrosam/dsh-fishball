/**
 * Vocabulary for the I-PLACE cases (.runtime/reports/v3-w3-briefs.md "I-PLACE test brief";
 * v3-tasks.md row I-PLACE). Every value comes from the requirements (R-BND-01…05, R-FB-02/09/10/12,
 * R-HOST-02/04/11, R-ARCH-08), the cases (docs/test-design/v3/08-hosted.md, 11-platform.md), design
 * §5a.2, §6.2, §8.1, §9.1, the frozen K3 contracts (packages/core/contracts/), or a decision Fishball
 * relayed (RELAYED below). None comes from an implementation.
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'

/** The set a hosted child holds: board and core (design §1.0, plan §4; R-FB-01). */
export const SET = Object.freeze({
  core: V3.core.name,
  features: Object.freeze([V3.board.name]),
  /** Design §8.1 "Order": the features come before core, core is last. */
  get placed() { return Object.freeze([...this.features, this.core]) },
  /**
   * The libraries beside the bundles in the child, never profile bundles (R-BND-01, R-ARCH-08; one
   * per side since SPLIT-SHARED): dsh-connector-shared for the instance's lifecycle code, and
   * fishball-shared as core's own dependency.
   */
  libraries: Object.freeze([V3.dshShared.name, V3.shared.name]),
  /** Placed for its contract only (RELAYED.copies), never a profile bundle. */
  contractOnly: V3.connector.name,
})

/**
 * The seam the I-PLACE dev session relayed through Fishball (2026-11-15). Only subject.mjs reads it.
 * `<H>` is the main DSH home.
 */
export const RELAYED = Object.freeze({
  /** 1. `<H>/fishball/runtime/dsh-home/profiles/fishball/fishball-placement.json`, mode 0600. */
  record: Object.freeze({ file: 'fishball-placement.json', mode: 0o600, format: 1, key: 'placed' }),
  childProfile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  /** 2. `<H>/fishball/runtime/launches/<instanceId>/launch.patch.yml`, a JSON array of patch ops, removed at stop. */
  launches: Object.freeze(['fishball', 'runtime', 'launches']),
  launchFile: 'launch.patch.yml',
  /** The pure export with the V2 arguments: launchOverlay(paths, record, childModule, limits, control, entries). */
  overlayModule: Object.freeze({ specifier: 'dsh-instance/native-runtime', file: Object.freeze(['src', 'native-runtime', 'index.js']), name: 'launchOverlay' }),
  /** 3. Each placed package goes to both folders of the child profile. */
  copyDirs: Object.freeze(['vendor', 'node_modules']),
  /**
   * The bundle a blocked start names: K3 ChildStatus `plugin` (PROPOSED), or the relayed message
   * (dev 6d13f6a1) in the status `detail` or `message`.
   */
  blocked: Object.freeze({ field: 'plugin', texts: Object.freeze(['detail', 'message']), message: /Enabled bundles cannot load: (\S+) \(/ }),
  /**
   * Core's patch rows (Fishball 2026-11-15, Q-13 probe correction). DSH client-modules serves a
   * client only for a path row (resolved to its nearest manifest) or a bare package name, never
   * for `fishball-core/<sub>`. So:
   * - core's guards row is the only path row whose nearest package.json is fishball-core's own (Q-13;
   *   since F-UI it is `fishball-core-guards`, and the page and Recommended-tab rows are
   *   fishball-ui's, which the instance does not place until I-HOST);
   * - every slim child row is a `fishball-core/slim/*` subpath.
   */
  rows: Object.freeze({
    corePathRow: 'fishball-core-guards',
    /** The rows that left core's patch for fishball-ui's (F-UI). */
    movedToUi: Object.freeze(['fishball-page', 'fishball-recommend-plugins']),
    slim: Object.freeze(['session-tools', 'approvals', 'app', 'inbox', 'admin', 'provider-sync'].map((n) => 'fishball-native-' + n)),
    slimPrefix: V3.core.name + '/slim/',
  }),
})

/**
 * HOST-EP-03 row 6 / R-HOST-04 / design §6.2: the only rows a launch overlay may touch. `hmr`
 * (off), the child's own origin and port (V2 PG-ORIGIN: `webserver`, `web-runtime`), and the rows
 * that carry the admission key and the target URL. Their row ids are not frozen by any contract,
 * so admission and target are recognised by those two values in the op, not by a row id.
 */
export const OVERLAY = Object.freeze({
  hmr: 'hmr',
  /**
   * The two instance runtime rows a child needs that are neither guards nor configuration (Q-5 as
   * recommended; dev 6d13f6a1 relayed 2026-11-15): the lifecycle endpoint and the native-web
   * admission adapter. Every other V2 row left the overlay.
   */
  runtimeRows: Object.freeze(['fishball-native-web', 'fishball-native-child']),
  origin: Object.freeze(['webserver', 'web-runtime']),
  /**
   * The child isolation rows (Fishball 2026-11-15, isolation: Fishball must never read the user's
   * skills or project instructions). DSH's own row ids (dsh-base, dsh-web-app presets) and fields
   * (dsh-agent-instructions `projectRootMarkers`, dsh-skill-filesystem `includeDefaultRoots`).
   */
  isolation: Object.freeze({
    instructions: Object.freeze({ id: 'agent-instructions', field: 'projectRootMarkers', value: Object.freeze([]) }),
    // dsh-skill-filesystem's own config fields (both SDKs): dshHome, agentsHome, customSkillDirs.
    skills: Object.freeze({ id: 'skill-filesystem', field: 'includeDefaultRoots', value: false, home: 'dshHome', agentsHome: 'agentsHome', customDirs: 'customSkillDirs' }),
    /** The child runtime root, relative to the main home (RELAYED.launches' parent). */
    runtimeRoot: Object.freeze(['fishball', 'runtime']),
    /** The user's real agents home folder name under their OS home (DSH's `~/.agents` default). */
    userAgentsDir: '.agents',
  }),
  /** The dsh-agent-preset rows that nest the two rows above (dsh-web-app/presets, both SDKs). */
  presetRow: /^preset-/,
})

/** The guards' vocabulary (K3 guards.d.ts, read by the F-GUARDS reader; design §5a.2 as amended at 32fca3c5). */
export { GUARDS, REPORT, DSH_ROW } from '../../fishball-ui/guards/constants.mjs'

/** The DSH rows of the restored V2 guard cases (LITE-UC-03, LITE-EP-13, SET-EP-12). */
export const POLICY = Object.freeze({
  readOnly: 'read-only',
  approvalAsk: 'ask',
  /** A stored owner preference wider than read-only (SET-EP-12 "stored higher sandbox preference"). */
  wider: 'workspace-write',
})

/** HOST-ST-01 / K3 child.d.ts: states and codes. */
export const CHILD = Object.freeze({
  state: Object.freeze({ starting: 'starting', ready: 'ready', failed: 'failed', stopped: 'stopped' }),
  /** design §8.1, R-BND-03, child.d.ts LifecycleCode. */
  incompatible: 'PROFILE_INCOMPATIBLE',
  /** R-FB-10, child.d.ts LifecycleCode (state ready). */
  off: 'fishball-off',
  /** An engines.dsh range no SDK of the matrix meets (the incompatible fixture's own value). */
  impossibleEngine: '>=99.0.0',
})

/** The child copy of core (Q-21, RELAYED.copies 3): its `files` plus package.json; the two K3/K1 entries the brief names. */
export const CORE_COPY = Object.freeze({
  manifest: 'package.json',
  mustCarry: Object.freeze([path.join('contracts', 'constants.js')]),
})

/** HOST-UC-08 A3 (Q-13, O5): the generic panel moves to a flat chunk beside core's client.js. */
export const PANEL = Object.freeze({
  chunk: 'client.settings.js',
  /** The V2 panel folder I-PLACE drops (HOST-UC-08 A3; brief note 3). */
  dropped: path.join('ui', 'fishball-settings'),
  /** The withdrawn settings-section service (R-HOST-11 withdrawn, 1.34 item 4): absence checks only. */
  service: 'fishballSettingsSections',
  /**
   * The child page's Fishball client entries once the panel is core's chunk (dev 6d13f6a1, relayed
   * 2026-11-15); fishball-hosted-settings left the set (REMOVE-WD, design §1.0).
   */
  childEntries: Object.freeze(['fishball-page', 'fishball-recommend-plugins', V3.core.name]),
})
/** Core's own guard rows after F-UI (the UI-only rows are fishball-ui's patch, not placed in a hosted child yet). */
export const CORE_GUARD_ROWS = Object.freeze(['schedule', 'open-in-app', 'terminal-controller', V3.instance.name])

/** Integration rows need a real host DSH and its child (K3/R-CORE pattern); skipped by name otherwise. */
export const INTEGRATION = Object.freeze({
  env: 'FBTEST_V3_INTEGRATION',
  on: '1',
  skip: 'integration (real hosted child): run with FBTEST_V3_INTEGRATION=1',
  homeLabel: 'v3-i-place',
})

/** Harness budgets (waiting only; none is a product oracle). */
export const BUDGET = Object.freeze({ readyMs: 150000, restartMs: 150000, pollMs: 500 })

/** Owners of the rows I-PLACE cannot check. */
export const LATER = Object.freeze({
  host: 'I-HOST (W4: the dshInstanceChild locator, Retry, lifecycle codes such as fishball-off)',
  placeUi: 'I-HOST (the instance places fishball-ui in the hosted child; until then the child has core only, so no page, Recommended tab or UI guard row)',
  restartNotice: 'U-SHELL / E2E-UI (the "restart required" line in the UI)',
  relPack: 'REL-PACK (P-1 mechanism B: a real copy of its side\'s library in each tarball; PLAT-EP-07 row 5 stays failing until then)',
  uninstall: 'I-HOST (HOST-ST-01 row 10: uninstall with the export offer, Q-23)',
  e2e: 'E2E-UI (W6 browser flows; no browser in this suite)',
})
