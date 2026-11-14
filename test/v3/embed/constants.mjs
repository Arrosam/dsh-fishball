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
import { REPO } from '../../support/constants.mjs'

/** R-EMBED (1)–(2): the new package and where the moved client lives. */
export const EMBED = Object.freeze({
  workspace: 'packages/embed-ui',
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
   * U-SHELL (v3-w3 briefs F2, Q-7) splits the moved client, with no behaviour change, into flat
   * parts beside the entry. The moved connector UI is spread over every part; the moved instance
   * card (the Plugins card) is the shell's.
   */
  clientChunks: Object.freeze({
    shell: 'src/client/client.shell.js',
    marks: 'src/client/client.marks.js',
    attention: 'src/client/client.attention.js',
    records: 'src/client/client.records.js',
  }),
  cardChunk: 'src/client/client.shell.js',
})

/** R-EMBED (3): the client entries the connector and the instance lose in the same change. */
export const OLD_CLIENT = Object.freeze({
  connector: Object.freeze({ exports: Object.freeze(['./client', './records']), files: Object.freeze(['client.js', 'client.records.js']) }),
  instance: Object.freeze({ exports: Object.freeze(['./client']), files: Object.freeze(['client.js']) }),
})

/** The V2 main-DSH client manifests R-EMBED moves (their combined inject list, design §9.1). */
export const BASE = Object.freeze({
  commit: 'dac924f',
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

/** The browser module loader every DSH client bundle registers with (dsh-client-modules, both SDKs). */
export const MODULE_LOADER = '__ModuleLoader__'

/**
 * Host-DSH slots the V2 main clients fill (S4 §2.2 and the V2 Plugins cards). Only distinctive
 * names: `main` is too generic a string to count. PLAT-EP-03 row 3: no other package's shipped code
 * names one of them.
 */
export const HOST_SLOTS = Object.freeze([
  'sidebar.panellist', 'sidebar.brand.mark', 'sidebar.brand.name', 'sidebar.workspaces.session.menu.item',
  'sidebar.session.row.leading', 'sidebar.session.row.trailing', 'conversation.session.header.actions',
  'conversation.chat.node', 'tool.call.toolview', 'plugins.bundle.config', 'plugins.row.config',
])
/** Slot names a Plugins page card uses (the V2 connector card and the V2 instance card). */
export const CARD_SLOTS = Object.freeze(['plugins.bundle.config', 'plugins.row.config'])

/**
 * "The same UI renders from embed-UI" (definition of done): the V2 contributions the moved client
 * keeps, as S4 §2.2 lists them (slot, id or key). Conditional seats (the sidebar fish follows the
 * state; the row's trailing seat exists only on 0.2.2) and the surfaces U-SHELL drops (brand,
 * ask_fishball row) are not listed. A Plugins card is required in one of CARD_SLOTS; its key is not
 * fixed by the requirements (see the R-EMBED test report).
 */
export const EXPECTED_UI = Object.freeze([
  Object.freeze({ slot: 'main', key: 'fishball' }),
  Object.freeze({ slot: 'conversation.session.header.actions', id: 'fishball-hand-over' }),
  Object.freeze({ slot: 'sidebar.workspaces.session.menu.item', id: 'fishball-hand-over' }),
  Object.freeze({ slot: 'sidebar.session.row.leading', id: 'fishball-managed' }),
])

/** Words the instance must never use to reach into embed-UI's package (R-EMBED: "never reads a file inside"). */
export const EMBED_WORDS = Object.freeze(['fishball-embed-ui', 'embed-ui'])

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
  services: Object.freeze(['slots', 'locale', 'configForms', 'layout']),
  lang: 'en',
})

export const embedDir = () => path.join(REPO, EMBED.workspace)

/** Owners of the rows R-EMBED cannot check (v3-tasks.md at b1295de). */
export const LATER = Object.freeze({
  matrix: 'X-MATRIX (PLAT-EP-03 rows 2–6 on a real DSH: Plugins page install, enable, disable, list)',
  shell: 'U-SHELL (embed-UI host row, service detection, instance-missing, sidebar entry with no brand override)',
  e2e: 'E2E-UI (W6 browser flows; no browser in this suite)',
})
