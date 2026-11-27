/**
 * Oracle values of the umbrella settings-page cases (R4, R5), from the requirements the lead relayed
 * on 2026-11-22 and the page's public hooks the implementer relayed the same day (dictionary keys,
 * data attributes, roles). fishball-heartbeat's Config is its real one, reached through the package's
 * published export (a dependency of this package); the implementer relayed that the dictionary also
 * labels field.compactThresholdTokens. client.js was not read; it runs in the scripted page (page.mjs).
 */
import path from 'node:path'

export const UMBRELLA = Object.freeze({
  id: 'fishball-amenities',
  client: path.join(import.meta.dirname, '..', '..', 'client.js'),
  /** The configurable member rows (key "<umbrella>#<row id>"), each a dependency whose published export carries its Config. */
  rows: Object.freeze([Object.freeze({ id: 'fishball-heartbeat', pkg: 'fishball-heartbeat' })]),
  /** Rows that must never get a configure entry, even when DSH serves a namespace of that id. */
  excluded: Object.freeze(['fishball-board', 'fishball-taskboard', 'fishball-amenities']),
  inject: Object.freeze(['slots', 'locale', 'configForms', 'settingsSchema']),
  clientInject: '@deepseek-ai/dsh-client-ui-settings',
})

export const PAGE = Object.freeze({
  lang: Object.freeze({ en: 'en', zh: 'zh' }),
  require: Object.freeze({ react: 'react', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  slot: Object.freeze({ bundle: 'plugins.bundle.config', row: 'plugins.row.config' }),
  rowKey: (rowId) => 'fishball-amenities#' + rowId,
  rowOfKey: (key) => key.split('#')[1],
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  status: Object.freeze({ ready: 'ready', loading: 'loading', unavailable: 'unavailable' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  /** The settings service a page reads (configForms) and the schema helper (settingsSchema). */
  services: Object.freeze({ configForms: 'configForms', settingsSchema: 'settingsSchema' }),
  /** The implementer's DOM hooks. */
  attr: Object.freeze({ root: 'data-amenities-settings', setting: 'data-amenities-setting', list: 'data-amenities-list', item: 'data-amenities-list-item' }),
  /** The implementer's dictionary keys (namespace = the umbrella id). */
  key: Object.freeze({
    hint: 'hint', summary: (rowId) => 'summary.' + rowId, unavailable: 'unavailable', readOnly: 'readOnly', save: 'save', saving: 'saving',
    saveFailed: 'saveFailed', invalid: 'invalid', add: 'add', remove: 'remove', discard: 'discard',
    field: (name) => 'field.' + name,
  }),
  /** The hint names "a component" to open (R4). */
  component: /component/i,
  /** The first revision the scripted Host serves (non-zero, so an omitted revision shows). */
  firstRevision: 5,
  /** A namespace field used for a served namespace that is not a member's (excluded rows). */
  otherField: 'fbtestOther',
  /** A field no dictionary labels (R4: it renders with its name). */
  unlabelledField: 'fbtestUnlabelledLimit',
  unlabelledDescription: 'fbtest unlabelled',
  /** A value no number field accepts (BVA: text). */
  text: 'fbtest',
  /** A fraction step added to a minimum (BVA: an integer field refuses it). */
  fraction: 0.5,
  mountPrefix: 'fbtest-settings-',
  testMs: 60_000,
})

/**
 * The one configurable row's form (R2, R4): three number fields, no list. compactThresholdTokens
 * came with feat/heartbeat-compact (merged 2026-11-22); it has a default, so it has no max here.
 */
export const FORMS = Object.freeze([
  Object.freeze({
    row: 'fishball-heartbeat',
    order: Object.freeze(['intervalSeconds', 'maxConsecutive', 'compactThresholdTokens']),
    settings: Object.freeze([
      Object.freeze({ name: 'intervalSeconds', kind: 'number', min: 1, max: 2_147_483 }),
      Object.freeze({ name: 'maxConsecutive', kind: 'number', min: 1 }),
      Object.freeze({ name: 'compactThresholdTokens', kind: 'number', min: 0 }),
    ]),
  }),
])

/** R5: fishball-heartbeat already depends on and bundles fishball-shared (unchanged). */
export const MANIFESTS = Object.freeze([
  Object.freeze({ pkg: 'fishball-heartbeat', depends: Object.freeze(['fishball-shared']), bundles: Object.freeze(['fishball-shared']) }),
])
