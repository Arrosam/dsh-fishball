/**
 * Vocabulary for the PINST cases: dsh-instance's install of the hosted child's plugin set from a
 * PACKED instance (REL-PACK item 5).
 *
 * Every value comes from the requirements the lead relayed on 2026-11-17 (packed-instance placement:
 * skip, registry specs then the bundled-tarball fallback, bundle order, R-BND-02 disable survival,
 * PLACEMENT_INSTALL_FAILED, the composedProfile seam) and from design §19 (core last), never from an
 * implementation. Package names and the release layout are REL-PACK's (../../release/pack/constants.mjs).
 */
import path from 'node:path'
import { DSH, INSTANCE_BUNDLED, PACKAGES, SETS, SHELVED, TARBALL, VERSION } from '../../release/pack/constants.mjs'

/** The packed instance is built as REL-SYS-01 builds it: the hosted set in one offline add. */
export const PACKED = Object.freeze({
  hostedSet: SETS.hosted,
  instance: PACKAGES.instance,
  /** The instance's bundled tarballs (bundled/<name>-<v>.tgz); <v> is the instance's own version. */
  bundledDir: INSTANCE_BUNDLED.dir,
  /** The instance's public seam: composedProfile({ mainHome, installAnchor }) lays out and places, starting no process. */
  module: Object.freeze(['src', 'native-runtime', 'index.js']),
  exportName: 'composedProfile',
  installAnchor: (sdk) => path.join(DSH.versionsDir, sdk, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  /** The main home handed to composedProfile (canonical real path, created by the case). */
  mainHomeDir: 'main-home',
})

/** The child profile and what placement leaves in it. */
export const CHILD = Object.freeze({
  /** <mainHome>/fishball/runtime/dsh-home/profiles/fishball (the runtime is <mainHome>/fishball/runtime). */
  profile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  manifest: TARBALL.manifest,
  lockfile: 'pnpm-lock.yaml',
  vendorDir: 'vendor',
  /**
   * dsh.profile.bundles ends with these, in this order (core last, design §19). Re-baselined
   * (SHELVE-BOARD, was board, ui, core; specOrder was ui, board, core): fishball-board is out of
   * 1.0.0-alpha.1. The user, 2026-11-18: "fishball-board先从这次release中移除，我要改的地方太多了。
   * 先封存，留到下一批再说。所以不要预留在子实例的Fishball内。"
   */
  bundleOrder: Object.freeze([PACKAGES.ui, PACKAGES.core]),
  /** The npm spec order of the registry add (fishball-ui@<v>, fishball-core@<v>). */
  specOrder: Object.freeze([PACKAGES.ui, PACKAGES.core]),
  /** SHELVE-BOARD: never placed, installed, bundled, recorded or reserved in the child. */
  shelved: SHELVED.board,
  core: PACKAGES.core,
  /** BVA on the skip rule: the prerelease just below the instance version (1.0.0-alpha.1) is not "already at <v>". */
  staleVersion: '1.0.0-alpha.0',
  /** fishball-core's own node_modules provides these. */
  coreProvides: Object.freeze([Object.freeze({ name: PACKAGES.shared.name }), Object.freeze({ name: '@modelcontextprotocol/client' })]),
  /** Still placed beside the bundles (installed in the profile, never a bundle). */
  beside: PACKAGES.dshShared,
  version: VERSION,
})

/** A refused start: both the registry install and the bundled fallback failed. */
export const FAILED = Object.freeze({ code: 'PLACEMENT_INSTALL_FAILED' })

/** Tampering the bundled tarballs of the installed instance (BVA on the bytes: first, middle, last; and absence). */
export const TAMPER = Object.freeze({
  target: PACKAGES.core,
  offsets: Object.freeze({ first: () => 0, middle: (size) => Math.floor(size / 2), last: (size) => size - 1 }),
})

/** Every proxy of this process points at a dead port while composedProfile runs, forcing the fallback. */
export const DEAD_NETWORK = Object.freeze({ url: 'http://127.0.0.1:9' })
/** Harness isolation of the in-process call: HOME and npm's cache move into the scratch folder (no user store or cache is touched). */
export const SCRATCH = Object.freeze({ home: 'compose-home', npmCache: 'compose-npm-cache' })

/** Harness budgets (waiting only). */
export const BUDGET = Object.freeze({ caseMs: 900000 })

export const CASE = Object.freeze({ id: 'PINST-ST-01', fail: 'PINST-DT-01', registry: 'PINST-UC-01', shelved: 'PINST-SHELVE' })
export const LATER = Object.freeze({
  registry: 'REL-PUBLISH (the registry spec path needs fishball-ui and fishball-core published at the instance version; nothing is published yet)',
})
