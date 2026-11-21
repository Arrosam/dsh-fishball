/**
 * Oracle values of the umbrella settings-page cases (R4, R5), from the requirements the lead relayed
 * on 2026-11-22 (with the lead's addition on the adapter list rules) and the page's public hooks the
 * implementer relayed the same day (dictionary keys, data attributes, roles). fishball-heartbeat's Config is its real one (src/config.js); the implementer relayed that the dictionary also labels field.compactThresholdTokens (another branch's future field).
 * client.js was not read; it runs in a scripted page (page.mjs).
 */
import os from 'node:os'
import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

export const UMBRELLA = Object.freeze({
  id: 'fishball-amenities',
  client: path.join(REPO, 'packages', 'fishball-amenities', 'client.js'),
  manifest: path.join(REPO, 'packages', 'fishball-amenities', 'package.json'),
  /** The configurable member rows: key "<umbrella>#<row id>". */
  rows: Object.freeze([
    Object.freeze({ id: 'fishball-heartbeat', configModule: path.join(REPO, 'packages', 'fishball-heartbeat', 'src', 'config.js') }),
  ]),
  /** Rows that must never get a configure entry, even when DSH serves a namespace of that id. */
  excluded: Object.freeze(['fishball-board', 'fishball-taskboard', 'fishball-amenities']),
  inject: Object.freeze(['slots', 'locale', 'configForms', 'settingsSchema']),
  clientInject: '@deepseek-ai/dsh-client-ui-settings',
})

export const PAGE = Object.freeze({
  versionsDir: process.env.FBTEST_DSH_VERSIONS ?? path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  sdks: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3']),
  baseURI: 'http://127.0.0.1:4100/',
  lang: Object.freeze({ en: 'en', zh: 'zh' }),
  require: Object.freeze({ react: 'react', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  slot: Object.freeze({ bundle: 'plugins.bundle.config', row: 'plugins.row.config' }),
  rowKey: (rowId) => 'fishball-amenities#' + rowId,
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  status: Object.freeze({ ready: 'ready', loading: 'loading', unavailable: 'unavailable' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  /** The implementer's DOM hooks. */
  attr: Object.freeze({ root: 'data-amenities-settings', setting: 'data-amenities-setting', list: 'data-amenities-list', item: 'data-amenities-list-item' }),
  /** The implementer's dictionary keys (namespace = the umbrella id). */
  key: Object.freeze({
    hint: 'hint', summary: (rowId) => 'summary.' + rowId, unavailable: 'unavailable', readOnly: 'readOnly', save: 'save', saving: 'saving',
    saveFailed: 'saveFailed', invalid: 'invalid', unique: 'invalid.unique', url: 'invalid.url', add: 'add', remove: 'remove', discard: 'discard',
    field: (name) => 'field.' + name, item: (list, name) => 'field.' + list + '.' + name,
  }),
  /** The first revision the scripted Host serves (non-zero, so an omitted revision shows). */
  firstRevision: 5,
  /** A namespace field used for a served namespace that is not a member's (excluded rows). */
  otherField: 'fbtestOther',
  /** A field no dictionary labels (R4: it renders with its name). */
  unlabelledField: 'fbtestUnlabelledLimit',
  settleRounds: 60,
  testMs: 60_000,
})

/** The one configurable row's form (R2, R4): two number fields, no list. */
export const FORMS = Object.freeze([
  Object.freeze({
    row: 'fishball-heartbeat',
    order: Object.freeze(['intervalSeconds', 'maxConsecutive']),
    settings: Object.freeze([
      Object.freeze({ name: 'intervalSeconds', kind: 'number', min: 1, max: 2_147_483 }),
      Object.freeze({ name: 'maxConsecutive', kind: 'number', min: 1 }),
    ]),
    lists: Object.freeze([]),
    /** Labelled in the dictionary although the field lands on another branch. */
    labelledExtra: Object.freeze(['compactThresholdTokens']),
  }),
])

/** R5: fishball-heartbeat already depends on and bundles fishball-shared (unchanged). */
export const MANIFESTS = Object.freeze([
  Object.freeze({ dir: path.join(REPO, 'packages', 'fishball-heartbeat'), depends: Object.freeze(['fishball-shared']), bundles: Object.freeze(['fishball-shared']) }),
])
