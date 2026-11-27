/**
 * Vocabulary for the R-EMBED cases: PLAT-EP-03 rows 1, 3 and 5 (static), HOST-EP-03 row 5 and the
 * task's definition of done.
 *
 * Every value comes from `test/v3-cases` at `b1295de`: docs/planning/v3-tasks.md (R-EMBED row and
 * the owners of the later rows), docs/test-design/v3/11-platform.md (PLAT-EP-03), 08-hosted.md
 * (HOST-EP-03, HOST-UC-08), questions.md (S4-Q3), v3-requirements.md (R-ARCH-01/03/04/05, R-HOST-11,
 * R-COMPAT) and v3-design.md §4.2 and §9.1; and from the S4 evidence (`b9809b7`,
 * docs/spikes/v3-s4.md §2.2: the V2 slot names, ids and keys the moved client keeps). The V2 client
 * manifests are read from Git at the task's base commit: they are the input R-EMBED moves.
 */
import path from 'node:path'
import { REPO } from 'dsh-connector-test-helpers/legacy'

/** R-EMBED (1)–(2): the new package and where the moved client lives. */
export const EMBED = Object.freeze({
  // Since df9d83d embed-UI is the inner package packages/dsh-connector/ui (no root workspace of its own).
  workspace: 'packages/dsh-connector/ui',
  /** The root workspace that carries it (the connector package). */
  workspaceRoot: 'packages/dsh-connector',
  clientExport: './client',
  platform: 'web',
  /**
   * Approved layout (Fishball decision after 3c23e6b): flat chunks beside the entry,
   * src/client/client.<part>.js, because DSH's client-modules serves only `client.*.js` files
   * next to a package's `client.js` (CLIENT_CHUNK rule, both SDKs). It replaces the task's
   * src/client/{connector,instance}/ folders.
   */
  clientEntry: 'src/client/client.js',
  /**
   * U-SHELL (v3-w3 briefs F2, Q-7) splits the moved connector UI, with no behaviour change, into
   * flat parts beside the entry; the moved instance card (the Plugins card) stays client.instance.js
   * (layout relayed by Fishball from dev/v3-u-shell `096da986`).
   */
  clientChunks: Object.freeze({
    shell: 'src/client/client.shell.js',
    // DESIGN.md §28 (2026-11-20): client.marks.js left embed-UI for dsh-agent-connector (CONNECTOR_CLIENT.marksChunk).
    attention: 'src/client/client.attention.js',
    // Q-G4 = A: client.records.js is removed (no inline records). I-HOST: client.instance.js left too (the instance's own page).
  }),
})

/**
 * The connector's own settings page (design §5.9; requirements 1.28 R2, R-ARCH-03 amended): its only
 * browser code is `client.js`, which registers only the Plugins page's `plugins.bundle.config` slot.
 * PLAT-EP-03 rows 1 and 3 were repointed to it at C-WIRE-2; the V2 records part stays gone.
 */
export const CONNECTOR_CLIENT = Object.freeze({
  platform: 'web',
  exportKey: './client',
  entry: 'client.js',
  slot: 'plugins.bundle.config',
  goneExports: Object.freeze(['./records']),
  goneFiles: Object.freeze(['client.records.js']),
  /** DESIGN.md §28: the marks part is the connector's chunk beside its entry. */
  marksChunk: 'client.marks.js',
})

/** The V2 main-DSH client manifests R-EMBED moves (their combined inject list, design §9.1). */
export const BASE = Object.freeze({
  commit: 'dac924f',
  // Paths inside `commit`, read with `git show`: they keep the folder names that commit had,
  // before RENAME-DSH (design §1.0c) moved packages/connector and packages/instance.
  manifests: Object.freeze(['packages/connector/package.json', 'packages/instance/package.json']),
  /** The V2 instance main client (its Plugins card), which the child copy must no longer carry. */
  instanceClient: 'packages/instance/client.js',
})

/**
 * R-EMBED (4): the instance's child-code copy (installation.js copyChildCode), run into a throwaway
 * profile under the run's .runtime folder. It copies files only; nothing is launched.
 */
export const CHILD_COPY = Object.freeze({
  module: Object.freeze(['src', 'native-runtime', 'installation.js']),
  tempPrefix: 'fbtest-v3-embed-snapshot-',
  profileDir: 'profile',
  /** The private profile mode the instance itself uses for its profile folder. */
  profileMode: 0o700,
  hostId: 'fbtest-embed-host',
})

/** The instance's status-line module stays in its one owner (R-EMBED (2), R-CORE). */
export const STATUS_LINE = Object.freeze({
  exportTarget: './src/child-settings/',
  /**
   * Approved reach (Fishball decision after 2665110): a committed RELATIVE symlink beside embed-UI's
   * entry, pointing at the instance's own status-line file, which the instance also exports
   * (`./status-line`). It is a sibling chunk because DSH serves only client.*.js beside client.js.
   */
  embedLink: 'src/client/client.status.js',
})

/** `git ls-files -s` mode of a committed symlink. */
export const GIT = Object.freeze({ symlinkMode: /^120000 / })

/** Manifest fields. */
export const FIELD = Object.freeze({ peers: 'peerDependencies', peersMeta: 'peerDependenciesMeta', engines: 'engines', dsh: 'dsh' })
/** Fishball packages start with this prefix (every peer of this family must be optional for embed-UI). */
export const FISHBALL_PREFIX = 'fishball-'

/**
 * Host-DSH slots the V2 main clients fill (S4 §2.2 and the V2 Plugins cards). Only distinctive
 * names: `main` is too generic a string to count. PLAT-EP-03 row 3: no other package's shipped code
 * names one of them.
 */
export const HOST_SLOTS = Object.freeze([
  'sidebar.panellist', 'sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.workspaces.session.menu.item',
  'sidebar.session.row.leading', 'sidebar.session.row.trailing', 'conversation.session.header.actions',
  // UI-FIX-D (2026-11-18): embed-UI's Hand over / Take back moved to the header's utilities seat.
  'conversation.session.header.utilities',
  'conversation.chat.node', 'tool.call.toolview', 'plugins.bundle.config', 'plugins.row.config',
])
/** Slot names a Plugins page card uses (the V2 connector card and the V2 instance card). */
export const CARD_SLOTS = Object.freeze(['plugins.bundle.config', 'plugins.row.config'])

/**
 * "The same UI renders from embed-UI" (definition of done): the V2 contributions the moved client
 * keeps, as S4 §2.2 lists them (slot, id or key). Conditional seats (the sidebar fish follows the
 * state; the row's trailing seat exists only on 0.2.2) and the surfaces U-SHELL drops (brand,
 * ask_agent row) are not listed. V2 never deployed (U-WIRE): embed-UI has no Plugins card.
 */
// Entries by window (the user, 2026-11-21): the window (main, key 'fishball') is no longer registered
// at apply time; like the sidebar fish it follows the state (one per window, key `fishball:<key>`), so
// it is a conditional seat and leaves this list. WINDOW_UI names both conditional seats.
export const EXPECTED_UI = Object.freeze([])
/** The window seats embed-UI fills while an agent has a window here: sidebar.panellist id and main key `fishball:<key>`. */
export const WINDOW_UI = Object.freeze([
  Object.freeze({ slot: 'sidebar.panellist', idPrefix: 'fishball:' }),
  Object.freeze({ slot: 'main', keyPrefix: 'fishball:' }),
])
/** Whether a registration matches an EXPECTED_UI / WINDOW_UI row (exact id / key, or a prefix). */
export const matchesExpected = (e, r) => r.slot === e.slot && (e.id === undefined || r.id === e.id) && (e.key === undefined || r.key === e.key)
  && (e.keyPrefix === undefined || String(r.key ?? '').startsWith(e.keyPrefix)) && (e.idPrefix === undefined || String(r.id ?? '').startsWith(e.idPrefix))
/**
 * DESIGN.md §28 (2026-11-20, R1, R4): the marks part's contributions, registered by dsh-agent-connector's
 * browser half (no longer by embed-UI). UI-FIX-D: "Managed by" in header.actions, Hand over / Take back in header.utilities.
 */
export const EXPECTED_MARKS = Object.freeze([
  Object.freeze({ slot: 'conversation.session.header.actions', id: 'dsh-connector-hand-over' }),
  Object.freeze({ slot: 'conversation.session.header.utilities', id: 'dsh-connector-hand-over' }),
  Object.freeze({ slot: 'sidebar.workspaces.session.menu.item', id: 'dsh-connector-hand-over' }),
  Object.freeze({ slot: 'shell.overlay', id: 'dsh-connector-hand-over-notice' }),
  Object.freeze({ slot: 'sidebar.session.row.leading', id: 'dsh-connector-managed' }),
])

/** Words the instance must never use to reach into embed-UI's package (R-EMBED: "never reads a file inside"). */
export const EMBED_WORDS = Object.freeze(['dsh-connector-ui', 'embed-ui'])

/** DSH's client-modules diagnostics start with this text (dsh-client-modules lib/index.js, both SDKs). */
export const CLIENT_LOADER_ERROR = 'client-modules:'

/**
 * Integration rows boot a host DSH with this checkout's instance, which launches a child. They are
 * written here and run at integration: set FBTEST_V3_INTEGRATION=1.
 */
export const INTEGRATION = Object.freeze({
  env: 'FBTEST_V3_INTEGRATION',
  on: '1',
  skip: 'runs at integration (needs a host DSH and a child launch; set FBTEST_V3_INTEGRATION=1)',
  homeLabel: 'v3-r-embed',
})

/** The scripted main page's fake services (inject lists of the V2 main clients). */
export const PAGE = Object.freeze({
  // #77 (R-UI-03 amended): the window's Retry link opens the instance's settings page through DSH's pluginNavigation.
  services: Object.freeze(['slots', 'locale', 'configForms', 'layout', 'pluginNavigation']),
  lang: 'en',
})

export const embedDir = () => path.join(REPO, EMBED.workspace)

/** Owners of the rows R-EMBED cannot check (v3-tasks.md at b1295de). */
export const LATER = Object.freeze({
  matrix: 'X-MATRIX (PLAT-EP-03 rows 2–6 on a real DSH: Plugins page install, enable, disable, list)',
  e2e: 'E2E-UI (W6 browser flows; no browser in this suite)',
})
