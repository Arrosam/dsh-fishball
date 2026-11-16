/**
 * Vocabulary for the F-UI cases (USE-CASES.md beside this file). Every expected value comes from the
 * requirements (v3-requirements.md R-FB-14, R-FB-01, R-FB-02, R-FB-09, R-FB-11, R-ARCH-08,
 * R-ARCH-10; requirements 1.38 Q-N2, 1.41 Q-G1 and Q-G2 = A; design `design/v3` 9a531192 §1.0) or
 * from the interface the F-UI developer relayed (2026-11-16, with its two amendments: the chunks
 * export part factories, and the core-missing line is written at the row's start). None comes from
 * the implementation, which these cases never read.
 */
import path from 'node:path'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { MODEL } from '../../fishball-core/status/constants.mjs'

/** The package (interface item 1). */
export const UI_PACKAGE = Object.freeze({
  name: V3.ui.name,
  dir: V3.ui.dir,
  workspace: 'packages/fishball-ui',
  patch: './cordis.patch.yml',
  patchFile: 'cordis.patch.yml',
  platform: 'web',
  /** The export map, exactly. */
  exports: Object.freeze({ '.': './index.js', './client': './client.js', './core-missing': './src/core-missing.js', './package.json': './package.json' }),
  /** Its one library, bundled (R-ARCH-08). */
  library: V3.shared.name,
  /** DSH host packages are the only other names its manifest may carry (relayed: peers on `@deepseek-ai/*`). */
  hostScope: '@deepseek-ai/',
  /** The browser files it ships (interface item 8). */
  // Re-baselined (F-WIRE): client.js loads four parts; the strip and the model dialog are shipped too.
  clientFiles: Object.freeze(['client.js', 'client.entries.js', 'client.asks.js', 'client.strip.js', 'client.model.js']),
})

/**
 * R-ARCH-10, R-FB-14 "Fishball side only": the DSH-side packages fishball-ui may never name (by any
 * manifest field or import), and core, which it may not import either.
 */
export const FORBIDDEN = Object.freeze({
  dshSide: Object.freeze([V3.connector.name, V3.embed.name, V3.instance.name, 'dsh-connector-adapter', V3.dshShared.name]),
  core: V3.core.name,
})

/** Interface item 2: fishball-ui's patch rows. */
export const ROWS = Object.freeze({
  /** The UI-only guard rows, `{id, disabled: <with-core>}`, in this order. */
  // Re-baselined (F-WIRE, 2026-11-16): eight rows; `ui-model-selection` (the composer's model picker
  // and /model) comes last. The user: "Hide it. Only core's settings choose the model".
  guards: Object.freeze(['ui-subagent', 'ui-schedule', 'ui-permission', 'ui-agent-preset', 'entry-customization', 'ui-open-in-app', 'ui-sidebar-terminal', 'ui-model-selection']),
  /** Inserted rows `disabled: <without-core>` (on exactly when core is started), id → module name. */
  withCore: Object.freeze({
    'fishball-ui': './index.js',
    'fishball-page': './fishball-page/index.js',
    'fishball-recommend-plugins': './fishball-recommend-plugins/index.js',
  }),
  /** The row that is on exactly when core is not started (`disabled: <with-core>`), and its module (a package subpath). */
  coreMissing: Object.freeze({ id: 'fishball-ui-core-missing', name: 'fishball-ui/core-missing' }),
  /** The row of fishball-ui's own Node half (its manifest's one path row; DSH serves its client once). */
  self: 'fishball-ui',
})
/** The page and Recommended-tab packages inside fishball-ui (interface item 10), folder → own package name. */
export const UI_PACKAGES = Object.freeze({ 'fishball-page': 'fishball-page', 'fishball-recommend-plugins': 'fishball-recommend-plugins' })

/** Interface item 5: what core's patch keeps and no longer holds. */
export const CORE_SPLIT = Object.freeze({
  /** Core's own guard rows (non-UI). */
  guards: Object.freeze(['schedule', 'open-in-app', 'terminal-controller', V3.instance.name]),
  shippedPresets: Object.freeze(['preset-standard', 'preset-ptc', 'preset-cordis', 'preset-minimal']),
  ownPreset: 'preset-fishball',
  guardsRow: Object.freeze({ id: 'fishball-core-guards', tail: path.join('src', 'guards', 'row.js'), service: 'fishballGuards' }),
  /** Files and folders core no longer has. */
  gone: Object.freeze(['ui', 'client.asks.js', path.join('src', 'recommended.js')]),
  /** Core's constants: the guards plugin name, and the export that moved to fishball-shared. */
  pluginName: 'fishball-core-guards',
  movedExport: 'UI_SEAM',
  constantsFile: path.join(V3.core.dir, 'contracts', 'constants.js'),
})

/** Interface items 2–3: the started-bundles condition and the service. */
export const CONDITION = Object.freeze({
  /** The core bundle whose presence in `profileContext.startedBundles` decides the rows. */
  core: V3.core.name,
  service: 'profileContext',
  service2: 'fishballUiGuards',
})
/**
 * EP / BVA over `profileContext.startedBundles` → is core started? (interface item 2: "true exactly
 * when fishball-core is in startedBundles"). [label, startedBundles, core started].
 */
export const STARTED = Object.freeze([
  ['empty list (BVA: no bundle)', Object.freeze([]), false],
  ['fishball-core alone (BVA: one bundle)', Object.freeze([V3.core.name]), true],
  ['fishball-ui alone', Object.freeze([V3.ui.name]), false],
  ['core among others, not first', Object.freeze(['fbtest-other', V3.ui.name, V3.core.name]), true],
  ['core first, ui after', Object.freeze([V3.core.name, V3.ui.name]), true],
  ['a near name (fishball-core-x)', Object.freeze([V3.core.name + '-x']), false],
  ['a prefix of the name (fishball-cor)', Object.freeze([V3.core.name.slice(0, -1)]), false],
  ['another case (FISHBALL-CORE)', Object.freeze([V3.core.name.toUpperCase()]), false],
  ['a scoped name ending in it (@x/fishball-core)', Object.freeze(['@fbtest/' + V3.core.name]), false],
])

/** Interface item 4 (as amended): the one line of the core-missing row. */
export const CORE_MISSING = Object.freeze({ logger: V3.ui.name, type: 'warn', text: 'fishball-core-missing' })

/** Interface item 7: fishball-shared's `./ui-seam`. */
export const SEAM = Object.freeze({
  exportKey: './ui-seam',
  exportFile: './ui-seam.js',
  file: path.join(V3.shared.dir, 'ui-seam.js'),
  UI_SEAM: Object.freeze({ member: 'ui', coreMissing: CORE_MISSING.text }),
  UI_GUARDS: Object.freeze({ service: CONDITION.service2 }),
  /** SEAM_STATUS's own words (interface item 7; the same spellings as F-STATUS's relayed STATUS_MODEL). */
  status: Object.freeze({ fishball: MODEL.fishball, set: MODEL.set, reason: MODEL.reason, control: MODEL.control }),
  /** SEAM_STATUS key → [core constants export, its member]: the drift check (copies of core's K3 values). */
  drift: Object.freeze({ link: Object.freeze(['LINK', 'state']), connect: Object.freeze(['CONNECT', 'state']), guards: Object.freeze(['GUARDS', 'status']) }),
  keys: Object.freeze(['fishball', 'set', 'reason', 'control', 'link', 'connect', 'guards']),
})

/** Interface item 8 (as amended by F-WIRE): the browser entry and its four parts. */
export const CLIENT = Object.freeze({
  moduleId: V3.ui.name,
  entry: path.join(V3.ui.dir, 'client.js'),
  parts: Object.freeze({
    entries: Object.freeze({ file: 'client.entries.js', export: 'entriesPart', plugin: 'fishball-ui: entries', style: 'fishball-ui-entries-style' }),
    asks: Object.freeze({ file: 'client.asks.js', export: 'asksPart', plugin: 'fishball-ui: asks', style: 'fishball-asks-style' }),
    // Re-baselined (F-WIRE lead, 2026-11-17): "client.js now loads FOUR parts: client.entries.js,
    // client.asks.js, client.strip.js (the status strip, stripPart) and client.model.js (the model
    // dialog, modelPart)". Their plugin names and style ids are not specified: `plugin: null` means
    // UI-UC-05 checks only that the plugin has a non-empty name.
    strip: Object.freeze({ file: 'client.strip.js', export: 'stripPart', plugin: null, style: null }),
    model: Object.freeze({ file: 'client.model.js', export: 'modelPart', plugin: null, style: null }),
  }),
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
  pairing: Object.freeze({ before: 'packages/core/ui/pairing/text.js', after: path.join('src', 'pairing', 'text.js'), export: 'PAIRING_TEXT' }),
  status: Object.freeze({ after: path.join('src', 'status', 'index.js'), exports: Object.freeze(['stripView', 'STATUS_TEXT', 'STRIP_KIND']) }),
  recommended: Object.freeze({ after: path.join('src', 'recommended.js'), exports: Object.freeze(['recommendedList']), prefix: 'RECOMMENDED_' }),
  /** Sample arguments for the pairing copy's formatters (fixtures). */
  args: Object.freeze(['fbtest-name', 'fbtest-when']),
  tempPrefix: 'fbtest-f-ui-base-',
})

/** The Recommended tab's route (interface item 10). */
export const ROUTE = Object.freeze({ recommended: '/api/fishball/recommended', ok: 200 })

/** The owner's profile-patch override that keeps one UI row on whatever the bundle patches say. */
export const KEEP_ON = Object.freeze({ row: ROWS.guards[0], patch: (id) => JSON.stringify([{ id, disabled: false }]) + '\n' })

/** Core's browser entry and the one chunk it still loads (interface item 9). */
export const CORE_CLIENT = Object.freeze({ dir: V3.core.dir, file: 'client.js', moduleId: V3.core.name, chunks: Object.freeze(['./client.settings.js']) })

/** The SDK's Cordis: its entry, the fiber status event and FiberState FAILED (cordis lib/types/fiber.d.ts, both SDKs). */
export const CORDIS = Object.freeze({ entry: path.join('@deepseek-ai', 'cordis', 'lib', 'index.js'), statusEvent: 'internal/status', failed: 3 })

/** Test fixtures (never product values). */
export const FIXTURE = Object.freeze({
  styleId: 'fbtest-ui-style',
  css: '.fbtest-ui { color: red }',
  partName: (file) => 'fbtest stand-in part ' + file,
  chunkFault: 'fbtest: the chunk did not load',
  baseURI: 'http://fishball-ui.test/',
  rev: 'fbtest',
  logLevels: 3,
})

/** Harness waits only; never a product oracle. */
export const WAIT = Object.freeze({ settleRounds: 60 })

/** Owners of rows this suite cannot check. */
export const LATER = Object.freeze({
  hosted: 'I-HOST (the instance places fishball-ui in a hosted child; until then a hosted child has core only)',
  e2e: 'E2E-UI (W6: the page, the strip, the cards and the two entries in a real browser)',
  frame: 'design §1.0 "window style": no frame-only rule exists yet (interface item 11)',
  relPack: 'REL-PACK (P-1 mechanism B; PLAT-EP-07 row 5 checks every importer, fishball-ui included)',
})
