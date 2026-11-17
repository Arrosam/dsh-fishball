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
  /** The client module registers under the npm name (dsh-agent-connector since 2026-11-17); its plugin keeps the row id's name (the plugin key is unchanged). */
  moduleId: 'dsh-agent-connector',
  pluginName: 'dsh-connector',
  inject: Object.freeze(['slots', 'locale', 'configForms']),
  requires: Object.freeze(['react', '@deepseek-ai/dsh-client-ui-primitives']),
  slot: 'plugins.row.config',
  /** DSH's rowConfigKey `<package>#<row id>`: the package renamed, the row id kept. */
  slotKey: 'dsh-agent-connector#dsh-connector',
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
  /** The Page Visibility API's words (document.hidden / visibilityState, the visibilitychange event). */
  visibility: Object.freeze({ hidden: 'hidden', visible: 'visible', event: 'visibilitychange' }),
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
  /** A stand-in for the wired row's `state()` (relayed shape; C-WIRE-2: no `designated`, the user's q5), echoed by GET state. */
  stateAnswer: Object.freeze({ entries: Object.freeze([]), approval: Object.freeze({ status: 'ok', port: 1, defaultPort: 47615 }) }),
  revision: 1,
})

/** Rows another level or task owns. */
export const LATER = Object.freeze({
  fence: 'C-WIRE (the route mounted in a real DSH: owner-only, behind DSH\'s Host and Origin fence; a non-owner or cross-origin request is refused before it reaches the route)',
  plugins: 'E2E (the Plugins page of a real DSH in a browser: the row\'s configure control opens this page; the clipboard really holds the value)',
})

/**
 * UI-POLISH-D rows (polish-cases.mjs; the requirements relayed 2026-11-18): the page is three titled
 * `h3` sections; the token count beside Tokens; the row's icon-only buttons named by the old words;
 * DSH's StateDot before a pair state and the approval status; the Input primitive for every text
 * field. Words are the page's dictionary values the requirements quote (en and zh).
 */
export const POLISH = Object.freeze({
  id: Object.freeze({ sections: 'UIPD-SET-SECTIONS', count: 'UIPD-SET-COUNT', buttons: 'UIPD-SET-BUTTONS', dots: 'UIPD-SET-DOTS', primitives: 'UIPD-SET-PRIMITIVES' }),
  langs: Object.freeze(['en', 'zh']),
  headingTag: 'h3',
  headings: Object.freeze({
    en: Object.freeze(['Tokens', 'Approval page', 'Safety limits']),
    zh: Object.freeze(['Token', '授权页面', '安全限制']),
  }),
  buttons: Object.freeze({
    en: Object.freeze({ up: 'Move up', down: 'Move down', remove: 'Delete' }),
    zh: Object.freeze({ up: '上移', down: '下移', remove: '删除' }),
  }),
  /** BVA over the list's length and a row's index: a single item, and the first / middle / last of three. */
  counts: Object.freeze([0, 1, 3]),
  labels: Object.freeze(['Agent A', 'Agent B', 'Agent C']),
  /** DSH StateDot states the requirements name for a paired entry. */
  dot: Object.freeze({ connected: 'done', offline: 'idle' }),
  stateDot: 'StateDot',
  input: 'Input',
  iconPrefix: 'Icon',
  /** The icon names' words the requirements give (a plus on New token; Copy swaps to a check). */
  icon: Object.freeze({ plus: /Plus/, copy: /Copy/, check: /Check/, warning: /Warning/ }),
  ariaLabel: 'aria-label',
  title: 'title',
  role: 'role',
  status: 'status',
  /** The words of the approval status (unchanged): `Approval page: listening on port N`. */
  approvalOk: (port) => `Approval page: listening on port ${port}`,
  approvalPrefix: 'Approval page: ',
  approvalPort: 47616,
  /** K1 CONNECTOR_STATUS.approvalPortInUse, as the state route reports it. */
  portInUse: 'approval-port-in-use',
  defaultPort: 47615,
  pairId: 'agent-a-1',
  pairName: 'Navigator',
  attr: Object.freeze({ pair: 'data-dsh-connector-pair', connected: 'data-dsh-connector-connected', approval: 'data-dsh-connector-approval', setting: 'data-dsh-connector-setting' }),
  paired: 'paired',
})

/**
 * R-FIX-CUI rows (cui-cases.mjs; .runtime/reports/review-x-dsh-connector-ui.md UI-03, UI-04,
 * UI-05). Words are the requirements' and the dev session's (2026-11-18): the conflict alert, the
 * status-failure alert and its Retry; the poll period (about once a second, 1000 ms relayed) is
 * waited for with `refreshMs` and watched for silence with `silentMs`. The rest is fixture data.
 */
export const CUI = Object.freeze({
  id: Object.freeze({ ui03: 'RFC-UI03', ui04: 'RFC-UI04', ui05: 'RFC-UI05' }),
  /** The setting rows' data hooks (POLISH.attr.setting values). */
  field: Object.freeze({ port: 'approval.port', dshName: 'approval.dshName', limit: 'maxQueuedInputs' }),
  path: Object.freeze({ port: Object.freeze(['approval', 'port']), dshName: Object.freeze(['approval', 'dshName']), limit: Object.freeze(['maxQueuedInputs']), otherLimit: Object.freeze(['readSessionBytes']) }),
  /** The row's settings at the start. */
  settings: Object.freeze({ approval: Object.freeze({ port: 47615, dshName: 'Original name' }), maxQueuedInputs: 200, readSessionBytes: 12288 }),
  /** What this editor types, and what another editor saves meanwhile, per field. */
  draft: Object.freeze({ dshName: 'Local draft', port: '47620', limit: '300' }),
  draftValue: Object.freeze({ dshName: 'Local draft', port: 47620, limit: 300 }),
  other: Object.freeze({ dshName: 'Other editor', port: 47700, limit: 400, otherLimit: 24576 }),
  conflict: /changed elsewhere/i,
  invalid: 'Enter a whole number.',
  keys: Object.freeze({ enter: 'Enter', escape: 'Escape' }),
  /** UI-05: the number field's text partitions and boundaries; `saves` is the saved number or null (refused). */
  portInputs: Object.freeze([
    Object.freeze({ part: 'BVA empty', text: '', saves: null }),
    Object.freeze({ part: 'EP whitespace', text: '   ', saves: null }),
    Object.freeze({ part: 'EP tab and newline', text: '\t\n', saves: null }),
    Object.freeze({ part: 'BVA min 0', text: '0', saves: 0 }),
    Object.freeze({ part: 'BVA below min', text: '-1', saves: null }),
    Object.freeze({ part: 'BVA max 65535', text: '65535', saves: 65535 }),
    Object.freeze({ part: 'BVA above max', text: '65536', saves: null }),
    Object.freeze({ part: 'EP non-numeric', text: 'abc', saves: null }),
  ]),
  limitInputs: Object.freeze([
    Object.freeze({ part: 'BVA empty', text: '', saves: null }),
    Object.freeze({ part: 'EP whitespace', text: '  ', saves: null }),
    Object.freeze({ part: 'BVA min 1', text: '1', saves: 1 }),
  ]),
  /** UI-04. */
  statusFailed: (code) => `The connector's status could not be read (${code}).`,
  retry: 'Retry',
  failure: Object.freeze({ status: 500, body: Object.freeze({ ok: false, code: 'operation-failed' }) }),
  requestFailed: 'request-failed',
  notJson: 'fbtest: not JSON',
  notPaired: 'Not paired',
  pairName: Object.freeze({ old: 'Old navigator', fresh: 'New navigator' }),
  pairId: 'cui-agent-1',
  refreshMs: 3000,
  silentMs: 2500,
})

/**
 * R-FIX-CUI multi-DSH naming rows (cui-cases.mjs, the user's decision relayed 2026-11-18): the DSH
 * name field's hint (en / zh, `<device name>` / `<设备名称>` literal), the old address wording gone,
 * and the name saved exactly as typed ("照 MCP 协议来": no sanitising); only an entirely blank value
 * unsets. `unsetOp` is dsh-settings' SettingsPathOpView op name.
 */
export const DSH_NAME = Object.freeze({
  id: 'RFC-DSHNAME',
  hint: Object.freeze({
    en: 'The name the approval page shows for this DSH. Empty: this DSH shows as <device name>-DSH.',
    zh: '授权页面为此 DSH 显示的名称。留空则此 DSH 显示为 <设备名称>-DSH。',
  }),
  oldHint: Object.freeze({ en: "Empty: it shows this DSH's address.", zh: '留空则显示此 DSH 的地址。' }),
  unsetOp: 'unset',
  saved: 'Original name',
  padded: '  Office DSH  ',
  special: 'Lab/α <b>x</b>',
  markupTag: 'b',
  plain: 'Office',
  blanks: Object.freeze([['empty', ''], ['spaces', '   '], ['tab', '\t']]),
})
