/**
 * Vocabulary for the R-CORE cases: HOST-UC-08 (V2-mechanism part) and HOST-EP-03 rows 1–4, with the
 * task's definition of done (PLAT-EP-07 for core).
 *
 * Every value comes from `test/v3-cases` at `fb1cbd2`: docs/test-design/v3/08-hosted.md and
 * 11-platform.md, docs/planning/v3-tasks.md (R-CORE row and the owners of the later rows),
 * v3-requirements.md (R-HOST-04, R-HOST-07, R-HOST-11, R-ARCH-05, R-ARCH-08, R-FB-01, R-BND-01) and
 * v3-design.md §1.1, §6.1, §9.1. "Behaves as before" is observed through the V2 child's own public
 * page markers and routes (the V2 settings panel, docs/planning/v2-set.md), never an implementation.
 */
import path from 'node:path'
import { SDK, V3 } from '../shared/constants.mjs'

/** R-CORE (1): core's manifest, its F-GUARDS patch file and its root workspace. */
export const CORE = Object.freeze({
  workspace: 'packages/core',
  patchFile: 'cordis.patch.yml',
  /** Comment and blank lines only, or an empty YAML list: no patch entry yet (F-GUARDS adds them). */
  emptyPatch: Object.freeze({ comment: /^\s*(?:#.*)?$/, emptyList: /^\s*\[\s*\]\s*$/ }),
  /** Core reaches the connector only for `./contract` (R-CORE; design §9.1 until F-STATUS drops it). */
  connectorAllowed: Object.freeze(['fishball-connector/contract']),
})

/** R-CORE (2): what moves into core. The instance ships none of it after the move. */
export const MOVED = Object.freeze({
  /** The V2 paths that move as a whole (the slim child, child-web/**, persona). */
  prefixes: Object.freeze(['child-web/', 'src/slim/child/']),
  files: Object.freeze(['src/persona.js']),
})

/** R-CORE (4): the hosted-only sections' instance-owned home (later the fishball-hosted-settings source). */
export const CHILD_SETTINGS = Object.freeze({ folder: 'src/child-settings/', dir: path.join(V3.instance.dir, 'src', 'child-settings') })

/**
 * HOST-EP-03 row 3: words that name hosting. The extension point names "nothing about hosting" (no
 * hosted flag, no instance types, R-HOST-11), so neither an identifier nor a string of the generic
 * panel may carry one. Matched case-insensitively, so `isHosted` and `HOSTED` count.
 */
// `fishballInstance` is not a hosting word: it is core's own extension service (design §5a.1).
export const HOSTING_WORDS = Object.freeze([/hosted/i, /fishball-instance/i, /instance-?settings/i, /settings-?relay/i, /fishballchild/i])

/** The V2 settings panel's public page markers ("the hosted child behaves as before"). */
export const MARK = Object.freeze({
  /** The generic panel's root (core). */
  panel: 'data-fishball-settings',
  /** The header action that opens the panel. */
  entry: 'data-fishball-settings-entry',
  /** Generic: the one Read Only line and the links to DSH's own Settings and Plugins pages. */
  readOnly: 'data-fishball-settings-readonly',
  open: 'data-fishball-settings-open',
  openTargets: Object.freeze(['settings', 'plugins']),
  /** Hosted-only: the status line (its state) and Restart (relayed to the host). */
  status: 'data-fishball-instance-state',
  restart: 'data-fishball-settings-restart',
  /** R-HOST-07: any model-sync control (V2 SET-MAIN-ONLY marker family). */
  modelPrefix: 'data-fishball-model-',
  roles: Object.freeze({ alert: 'alert', status: 'status' }),
})

/** DSH client slots the V2 panel uses (the main panel and the conversation header). */
export const SLOT = Object.freeze({ main: 'main', header: 'conversation.session.header.actions' })

/** The hosted child's routes, at the host and at the child's own origin. */
export const ROUTE = Object.freeze({
  status: '/api/fishball-instance/status',
  embed: '/fishball/embed/',
  /** R-HOST-07: the child has no model-sync route; DSH answers 404. */
  sync: Object.freeze(['/api/fishball-instance/models/check', '/api/fishball-instance/models/add']),
  instancePrefix: '/api/fishball-instance/',
  childRoot: '/',
})
export const HTTP = Object.freeze({ notFound: 404, seeOther: 303, sameOrigin: Object.freeze({ 'sec-fetch-site': 'same-origin' }) })
export const STATE = Object.freeze({ ready: 'ready', failed: 'failed', starting: 'starting' })
/** lifecycle.log codes of a restart (support/v2-r2.mjs R2.lifecycle). */
export const LIFECYCLE = Object.freeze({ stop: 'STOP', ready: 'READY' })

/** DSH's boot page: the graph global and the package-local chunk route (dsh-client-modules, both SDKs). */
export const BOOT = Object.freeze({
  graph: /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\});?\s*<\/script>/s,
  sdkScope: '@deepseek-ai/',
  chunkUrl: (id, file, rev) => `plugins/${id}/${file}?rev=${rev}`,
  clientFile: /^client(?:\.[\w-]+)?\.js$/,
  /** The platform modules a classic client script may require (the V2 panel's set). */
  platform: Object.freeze({ react: 'react', reactDom: 'react-dom', reactDomClient: 'react-dom/client', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  /** Services the scripted page provides (the panel's documented inject list); others stay absent. */
  services: Object.freeze(['slots', 'layout', 'locale']),
  cordisEntry: path.join('@deepseek-ai', 'cordis', 'lib', 'index.js'),
})

/** Harness budgets (waiting only; none is a product oracle). */
export const BUDGET = Object.freeze({ readyMs: 150000, pollMs: 500, restartMs: 150000, caseMs: 600000, settleRounds: 60 })

export const runtimeOf = (sdk) => path.join(SDK.versionsDir, sdk, 'node_modules')

/** The token worker (Node's built-in acorn, see tokens-worker.mjs). */
export const TOKENS_WORKER = path.join(import.meta.dirname, 'tokens-worker.mjs')

/** Owners of the rows R-CORE cannot check (v3-tasks.md at fb1cbd2). */
export const LATER = Object.freeze({
  place: 'I-PLACE (places the set and fishball-hosted-settings; replaces the V2 child-row insertion)',
  host: 'I-HOST (lifecycle codes, fishball-off)',
  guards: 'F-GUARDS (guard rows and guards-overridden)',
  status: 'F-STATUS (core status: set completeness; never reports fishball-hosted-settings)',
  standalone: 'F-GUARDS and S6 (standalone loading of core is not required in R-CORE)',
  saved: 'unassigned in v3-tasks.md (the V2 hosted sections have no setting the instance saves; see the R-CORE test report)',
  e2e: 'E2E (W6 browser flows; no browser in this suite)',
})
