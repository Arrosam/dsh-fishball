/**
 * Vocabulary for the C-TOKENS-REVEAL settings-page cases (../tokens/USE-CASES.md): the connector's
 * own plugin settings page (R-ARCH-03, R-CON-10, R-TOK-03, R-TOK-11; design §5.9, §1.0c) and its
 * owner-only JSON routes. The paths, the body bound, the refusal code, the slot key, the locale
 * namespace and the data attributes are the surface the dev session relayed (2026-11-16); the slot
 * name and its `<package>#<row id>` key form are DSH's (`dsh-client-ui-plugin-manager`
 * slot-contract.d.ts, the same on both SDKs).
 */
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'
import { HOST_SLOTS } from '../../contract/embed/constants.mjs'

export { HOSTED_LABEL, SETTINGS_REFUSAL, TOKEN_VALUE, VALUE_ANYWHERE, VALUE_PATTERN, WAIT } from '../tokens/constants.mjs'

const CONNECTOR = path.join(REPO, 'packages', 'dsh-connector')

/** The relayed module `packages/dsh-connector/src/settings-page/index.js`. */
export const SUBJECT = Object.freeze({
  entry: process.env.FBTEST_SETTINGS_PAGE_ENTRY ?? path.join(CONNECTOR, 'src', 'settings-page', 'index.js'),
  routes: 'routes',
  register: 'registerSettingsPage',
  constants: 'SETTINGS_PAGE',
  client: process.env.FBTEST_CONNECTOR_CLIENT ?? path.join(CONNECTOR, 'client.js'),
})

/**
 * The page's routes and their answers (relayed; design §5.9 steps 2–4). C-WIRE added `state`, the
 * read-only pair state and approval status the page shows (R-ID-12, AUTH-UC-09, R-OA-20).
 */
export const ROUTE = Object.freeze({
  create: '/api/dsh-connector/tokens/create',
  notice: '/api/dsh-connector/tokens/notice',
  state: '/api/dsh-connector/settings/state',
  /** The page calls them page-relative (resolved against `document.baseURI`). */
  createRelative: 'api/dsh-connector/tokens/create',
  noticeRelative: 'api/dsh-connector/tokens/notice',
  post: 'POST',
  get: 'GET',
  maxBodyBytes: 4096,
  /** DSH's Fetch registry option the route asks for (`connection.fetch.register`). */
  requestBody: 'buffered',
  badBody: 'bad-body',
  operationFailed: 'operation-failed',
  ok: 200,
  badRequest: 400,
  serverError: 500,
  createFields: Object.freeze(['ok', 'entryKey', 'label', 'value']),
})

/** HTTP's own vocabulary (RFC 9110, RFC 9111), not product values. */
export const HTTP = Object.freeze({
  contentType: 'content-type',
  cacheControl: 'cache-control',
  location: 'location',
  json: /^application\/json\b/i,
  noStore: /\bno-store\b/i,
  html: /^text\/html\b/i,
})

/** The client module (relayed) and DSH's slot (slot-contract.d.ts). */
export const CLIENT = Object.freeze({
  moduleId: 'dsh-connector',
  pluginName: 'dsh-connector',
  inject: Object.freeze(['slots', 'locale', 'configForms']),
  requires: Object.freeze(['react', '@deepseek-ai/dsh-client-ui-primitives']),
  slot: 'plugins.row.config',
  slotKey: 'dsh-connector#dsh-connector',
  servedNamespace: 'dsh-connector',
  localeNamespace: 'dsh-connector-tokens',
  locales: Object.freeze(['en', 'zh']),
  /** Every other host-DSH slot the repo's contract suites know of: the page names none of them. */
  otherSlots: Object.freeze(HOST_SLOTS.filter((s) => s !== 'plugins.row.config')),
  view: Object.freeze({ page: 'page', summary: 'summary' }),
  tokensField: 'tokens',
  setOp: 'set',
  attr: Object.freeze({
    root: 'data-dsh-connector-tokens',
    row: 'data-dsh-connector-token-row',
    newLabel: 'data-dsh-connector-new-label',
    newToken: 'data-dsh-connector-new-token',
    notice: 'data-dsh-connector-notice',
    reveal: 'data-dsh-connector-reveal',
    copy: 'data-dsh-connector-copy',
  }),
  /** The fake primitives' element marker (support/set-panel.mjs) and the Modal export. */
  primitiveAttr: 'data-primitive',
  modal: 'Modal',
  /** DOM element names a page would use to add global CSS. */
  styleTags: Object.freeze(['style', 'link']),
})

/** Fixture data and harness settings: not product values. */
export const FIXTURE = Object.freeze({
  baseURI: 'http://dsh.test/',
  lang: 'en',
  labelA: 'Agent A',
  labelB: 'Agent B',
  handLabel: 'Typed by hand',
  handKey: 'fbtest-hand-added-key',
  renamed: 'Agent A on the laptop',
  /** `{"label":""}`: the JSON a body of only a label costs around the label itself. */
  emptyLabelBody: JSON.stringify({ label: '' }),
  multiByte: '€',
  pad: 'x',
  settleRounds: 40,
  /** A stand-in for the wired row's `state()` (relayed shape), echoed by GET state. */
  stateAnswer: Object.freeze({ entries: Object.freeze([]), approval: Object.freeze({ status: 'ok', port: 1, defaultPort: 47615 }), designated: null }),
  revision: 1,
})

/** Rows another level or task owns. */
export const LATER = Object.freeze({
  fence: 'C-WIRE (the route mounted in a real DSH: owner-only, behind DSH\'s Host and Origin fence; a non-owner or cross-origin request is refused before it reaches the route)',
  plugins: 'E2E (the Plugins page of a real DSH in a browser: the row\'s configure control opens this page; the clipboard really holds the value)',
})
