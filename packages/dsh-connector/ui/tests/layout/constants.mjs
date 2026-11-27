/**
 * Vocabulary for the UI-FIX-D layout rows (narrow-width fixes; the requirements relayed 2026-11-18,
 * R1–R4). Values come from those requirements, from DSH's own words (its header buttons' accessible
 * names) and from the relayed data hooks. Everything else is fixture data or harness timing.
 */
export const CHROME = Object.freeze({
  cache: Object.freeze(['Library', 'Caches', 'ms-playwright']),
  shellPrefix: 'chromium_headless_shell-',
  shell: Object.freeze(['chrome-headless-shell-mac-arm64', 'chrome-headless-shell']),
  tempPrefix: 'fbtest-uifixd-chrome-',
  // The brief: Chrome only with a mock keychain, basic password store and a temp profile.
  flags: Object.freeze(['--use-mock-keychain', '--password-store=basic', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0']),
  height: 900,
  startMs: 20000,
  stopMs: 3000,
  loadMs: 45000,
  pollMs: 100,
  /** After a viewport change: layout and DSH's own width budget settle. */
  settleMs: 700,
  /** How long a fresh profile may take to show DSH's first-run notice (absent on SDKs without one). */
  firstRunMs: 8000,
  testMs: 300000,
})

/** DSH's own UI as a user reaches it (DSH 0.2.1-rc.5 / 0.2.2-rc.1 words and hooks, English). */
export const NAV = Object.freeze({
  tree: '[role=treeitem]',
  sessionKey: 'session:',
  workspaceKey: 'workspace:',
  headerSlot: '[data-slot="conversation.session.header"]',
  actionsSlot: '[data-slot="conversation.session.header.actions"]',
  utilitiesSlot: '[data-slot="conversation.session.header.utilities"]',
  titleRow: '[data-slot="conversation.session.header"] > *',
  rowMenuSlot: 'sidebar.workspaces.session.menu.item',
  firstRun: 'Continue',
  plugins: 'Plugins',
  connectorCard: 'Fishball connector',
  components: 'Components',
  /** Page-side: the deepest element whose text is exactly `text`. */
  findText: (text) => `[...document.querySelectorAll('*')].filter((e) => e.textContent.trim() === ${JSON.stringify(text)}).at(-1)`,
})

/** The viewport widths every requirement names (R1: 320, 390, 768, 1440). */
export const WIDTH = Object.freeze({ all: Object.freeze([320, 390, 768, 1440]), narrow: 390, wide: 1440, clickable: Object.freeze([390, 1440]) })

/** R1: the session header's hooks and words. */
export const HEADER = Object.freeze({
  // DESIGN.md §28 (2026-11-20, R4): the header controls are dsh-agent-connector's marks part, data-dsh-connector-* hooks.
  takeBack: 'data-dsh-connector-take-back',
  managedBy: 'data-dsh-connector-managed-by',
  handOver: 'data-dsh-connector-hand-over',
  handOverMany: 'data-dsh-connector-hand-over-many',
  managedByPrefix: 'Managed by ',
  takeBackWords: 'Take back',
  handOverPrefix: 'Hand over to ',
  handOverManyWords: 'Handover to…',
  /** "Managed by" is display:none when the title row's content box is this wide or narrower (DSH's container query), shown when wider. */
  titleRowPx: 540,
  /** DSH's own header buttons (their accessible names on DSH 0.2.1-rc.5 / 0.2.2-rc.1, English). */
  dshButtons: Object.freeze([/^Open in /, /^More ways to open/, /^More actions$/, /sidebar/i]),
})

/** R2: the connector settings page's hooks and words. */
export const SETTINGS = Object.freeze({
  tokens: 'data-dsh-connector-tokens',
  row: 'data-dsh-connector-token-row',
  pair: 'data-dsh-connector-pair',
  newLabel: 'data-dsh-connector-new-label',
  newToken: 'data-dsh-connector-new-token',
  approval: 'data-dsh-connector-approval',
  limits: 'data-dsh-connector-limits',
  setting: 'data-dsh-connector-setting',
  /** The row's label holds the title and wrapped control; hint and errors are its siblings. */
  limitPath: 'maxQueuedInputs',
  requestSwitchPaths: Object.freeze([
    'requests.allowHighRisk',
    'requests.autoEscalatePermissions',
    'requests.autoRejectIncompleteArguments',
  ]),
  minRows: 7,
  /** Side by side needs ≥ 240 px for the words and for the input, plus the gap. */
  columnPx: 240,
  /** "≈ 240 px wide" at 1440 (the input's column). */
  columnSlackPx: 24,
  alert: 'alert',
  switchRole: 'switch',
  errorText: 'Enter a whole number.',
  invalidValue: 'abc',
  longLabel: 'Claude Code (MacBook Pro)',
  pairedPrefix: 'Paired as',
  themes: Object.freeze(['light', 'dark']),
})

/** R3: the Fishball window's not-ready header. */
export const WINDOW = Object.freeze({
  embedState: 'data-fishball-embed-state',
  embedCode: 'data-fishball-embed-code',
  retry: 'data-fishball-retry-link',
  code: 'INVALID_MAIN_HOME',
  title: 'Fishball',
  refresh: 'Refresh',
  stateLine: 'State failed',
  codeLine: 'Code INVALID_MAIN_HOME',
  failed: 'failed',
  /** The instance's status route (e1-d2-invalid-main-home.test.mjs reads the same one). */
  statusRoute: '/api/dsh-instance/status',
})

/** Measurement tolerances (sub-pixel rounding only). */
export const PX = Object.freeze({ epsilon: 0.5, edge: 2, search: 6 })

/** Fixture data (not product values). */
export const FIXTURE = Object.freeze({
  scenario: 'uifixd',
  /** 64 characters: the longest name pair accepts (K1 NAME_RULES.maxChars). */
  longName: 'Navigator of an Extremely Long Principal Name For Truncation Tes',
  oneName: 'Navigator',
  otherName: 'Pathfinder',
  managerName: 'Helmsman',
  labelBase: 'uifixd-entry',
  idBase: 'uifixd-agent',
  realHome: 'uifixd-real-',
  linkHome: 'uifixd-link-',
})
