/**
 * Vocabulary for fishball-ui's package rows (README.md beside this file). Every expected value comes
 * from the requirements (v3-requirements R-FB-14, R-ARCH-08, R-ARCH-10; requirements 1.38 Q-N2; the
 * F-UI interface relayed 2026-11-16 with its amendments; 117cb2a2: fishball-ui is core's ./ui/
 * component), never from the implementation.
 */
import path from 'node:path'
import { UI } from '../support/ui-page.mjs'

/** Interface item 1, as 117cb2a2 left it: the package, its export map and its browser files. */
export const UI_PACKAGE = Object.freeze({
  name: 'fishball-ui',
  /** Its folder (docs/testing/README.md package table). */
  folder: 'packages/core/ui',
  dir: UI.dir,
  manifest: 'package.json',
  patchFile: 'cordis.patch.yml',
  platform: 'web',
  /** The export map, exactly. */
  exports: Object.freeze({ '.': './index.js', './client': './client.js', './core-missing': './src/core-missing.js', './package.json': './package.json' }),
  /** Its one library (R-ARCH-08), imported, carried by core (core's manifest lists and bundles it). */
  library: 'fishball-shared',
  /** DSH host packages are the only other names its manifest may carry. */
  hostScope: '@deepseek-ai/',
  /** The manifest fields that name packages (npm): runtime, peer, optional, dev, bundled. */
  depFields: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies', 'bundleDependencies', 'bundledDependencies']),
  runtimeFields: Object.freeze(['dependencies', 'bundleDependencies', 'bundledDependencies']),
  nameFields: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies']),
  dshField: 'dsh',
  /** R-FIX-FUI F2: the guard reader went to core, and with it the dsh-app-boot peer. */
  goneFiles: Object.freeze([path.join('src', 'guards.js')]),
  gonePeer: '@deepseek-ai/dsh-app-boot',
})

/**
 * R-ARCH-10, R-FB-14 "Fishball side only": the DSH-side packages fishball-ui may never name (by any
 * manifest field or import; they live in other repositories since 6b7c53bf), and core, which it may
 * not import either (Q-G2: fishball-ui reads core only through fishball-shared's seam).
 */
export const FORBIDDEN = Object.freeze({
  dshSide: Object.freeze(['dsh-agent-connector', 'dsh-connector-ui', 'dsh-instance', 'dsh-connector-adapter', 'dsh-connector-shared']),
  core: 'fishball-core',
})

/** The page and Recommended-tab packages inside fishball-ui (interface item 10), folder → own package name. */
export const UI_PACKAGES = Object.freeze({ 'fishball-page': 'fishball-page', 'fishball-recommend-plugins': 'fishball-recommend-plugins' })
export const NESTED_CLIENT = './client'

/** Interface item 8 (as amended by F-WIRE, R-FIX-FUI F1, LOGO-BUTTON, MULTI-3 D and the removal of the legacy model dialog): the browser entry and its four parts. */
export const CLIENT = Object.freeze({
  moduleId: 'fishball-ui',
  entry: 'client.js',
  parts: Object.freeze({
    entries: Object.freeze({ file: 'client.entries.js', export: 'entriesPart', plugin: 'fishball-ui: entries' }),
    asks: Object.freeze({ file: 'client.asks.js', export: 'asksPart', plugin: 'fishball-ui: asks' }),
    // F-WIRE lead, 2026-11-17: the strip part's plugin name is not specified (null: a non-empty name).
    strip: Object.freeze({ file: 'client.strip.js', export: 'stripPart', plugin: null }),
    brand: Object.freeze({ file: 'client.brand.js', export: 'brandPart', plugin: null }),
  }),
  /** The order client.js loads its parts in. */
  partOrder: Object.freeze(['client.entries.js', 'client.asks.js', 'client.strip.js', 'client.brand.js']),
  /** The legacy page picker was superseded by dsh-instance onboarding. */
  removedParts: Object.freeze(['client.model.js']),
  localPrefix: './',
  /** The kit member a part gets (`mountStyle(id, cssText) → dispose`). */
  kitStyle: 'mountStyle',
  /** Platform modules a chunk may require (the DSH page's served set). */
  platform: Object.freeze(['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives']),
  styleTag: 'style',
})

/**
 * Interface item 10, "moved unchanged in behaviour": the oracle is the file as it was at the task's
 * base commit (`integrate/v3-w2` @ e3cf8d5b), read with `git show`, never the new code.
 */
export const MOVED = Object.freeze({
  ref: 'e3cf8d5b',
  // R-FIX-FUI F1: the keys the pairing card added (its title, the refused-choice line, the Intl locale of its times).
  pairing: Object.freeze({ before: UI_PACKAGE.folder + '/pairing/text.js', after: path.join('src', 'pairing', 'text.js'), export: 'PAIRING_TEXT', added: Object.freeze(['title', 'chooseFailed', 'locale']) }),
  // MULTI-3 requirement B: the per-target frame.
  status: Object.freeze({ after: path.join('src', 'status', 'index.js'), exports: Object.freeze(['targetsView', 'TARGET_LINE', 'STATUS_TEXT']) }),
  recommended: Object.freeze({ after: path.join('src', 'recommended.js'), exports: Object.freeze(['recommendedList']), prefix: 'RECOMMENDED_' }),
  /** Sample arguments for the pairing copy's formatters (fixtures). */
  args: Object.freeze(['fbtest-name', 'fbtest-when']),
  tempPrefix: 'fbtest-f-ui-base-',
  encoding: 'utf8',
})

/** The SDK's Cordis fiber status event and FiberState FAILED (cordis lib/types/fiber.d.ts). */
export const CORDIS = Object.freeze({ name: 'cordis', statusEvent: 'internal/status', failed: 3 })

/** Test fixtures (never product values). */
export const FIXTURE = Object.freeze({
  styleId: 'fbtest-ui-style',
  css: '.fbtest-ui { color: red }',
  partName: (file) => 'fbtest stand-in part ' + file,
  chunkFault: 'fbtest: the chunk did not load',
  baseURI: 'http://fishball-ui.test/',
  lang: 'en',
  notFound: 404,
  settleRounds: 60,
})
