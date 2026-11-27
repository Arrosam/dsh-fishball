/**
 * Oracle values of the umbrella settings-page cases (R4, R5), from the requirements the lead relayed
 * on 2026-11-22 (with the lead's addition on the adapter list rules) and the page's public hooks the
 * implementer relayed the same day (dictionary keys, data attributes, roles). Member Configs are the members' real ones (index.js exports Config).
 * client.js was not read; it runs in a scripted page (page.mjs).
 */
import { versionsDir } from 'dsh-connector-test-helpers/config'
import path from 'node:path'
import { REPO } from 'dsh-connector-test-helpers/legacy'

export const UMBRELLA = Object.freeze({
  id: 'dsh-connector-amenities',
  client: path.join(REPO, 'packages', 'dsh-connector-amenities', 'client.js'),
  manifest: path.join(REPO, 'packages', 'dsh-connector-amenities', 'package.json'),
  /** The configurable member rows: key "<umbrella>#<row id>". */
  rows: Object.freeze([
    Object.freeze({ id: 'dsh-connector-adapter', configModule: path.join(REPO, 'packages', 'dsh-connector-adapter', 'index.js') }),
    Object.freeze({ id: 'dsh-connector-watchdog', configModule: path.join(REPO, 'packages', 'dsh-connector-watchdog', 'index.js') }),
  ]),
  /** Rows that must never get a configure entry, even when DSH serves a namespace of that id. */
  excluded: Object.freeze(['preset-watchdog', 'dsh-connector-amenities']),
  inject: Object.freeze(['slots', 'locale', 'configForms', 'settingsSchema']),
  clientInject: '@deepseek-ai/dsh-client-ui-settings',
})

export const PAGE = Object.freeze({
  versionsDir: versionsDir,
  sdks: Object.freeze(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3']),
  baseURI: 'http://127.0.0.1:4100/',
  lang: Object.freeze({ en: 'en', zh: 'zh' }),
  require: Object.freeze({ react: 'react', primitives: '@deepseek-ai/dsh-client-ui-primitives' }),
  slot: Object.freeze({ bundle: 'plugins.bundle.config', row: 'plugins.row.config' }),
  rowKey: (rowId) => 'dsh-connector-amenities#' + rowId,
  view: Object.freeze({ summary: 'summary', page: 'page' }),
  status: Object.freeze({ ready: 'ready', loading: 'loading', unavailable: 'unavailable' }),
  op: Object.freeze({ set: 'set', unset: 'unset' }),
  /** The implementer's DOM hooks. */
  attr: Object.freeze({
    root: 'data-amenities-settings',
    setting: 'data-amenities-setting',
    list: 'data-amenities-list',
    item: 'data-amenities-list-item',
    model: 'data-amenities-model',
    modelSelect: 'data-amenities-model-select',
  }),
  /** The implementer's dictionary keys (namespace = the umbrella id). */
  key: Object.freeze({
    hint: 'hint', summary: (rowId) => 'summary.' + rowId, unavailable: 'unavailable', readOnly: 'readOnly', save: 'save', saving: 'saving',
    saveFailed: 'saveFailed', invalid: 'invalid', unique: 'invalid.unique', url: 'invalid.url', add: 'add', remove: 'remove', discard: 'discard',
    modelDisabled: 'modelDisabled', modelLoading: 'modelLoading', modelNone: 'modelNone', modelFailed: 'modelFailed', modelSaveFailed: 'modelSaveFailed',
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

const url = (name) => 'https://' + name + '.fbtest.example/api/agent/mcp'
const server = (serverName, u = url(serverName)) => Object.freeze({ serverName, url: u })
const LOOPBACK_PORT = 4123

/**
 * Each configurable row's form as R4 and the members' Configs (R2) give it: the served order, the
 * scalar settings (number fields with their bounds, text fields with a sample) and the list fields
 * with the list rules (R4 and the lead's addition: unique serverName; https, or http on 127.0.0.1 /
 * [::1] / localhost only).
 */
export const FORMS = Object.freeze([
  Object.freeze({
    row: 'dsh-connector-adapter',
    order: Object.freeze(['clientMetadataUrl', 'servers']),
    settings: Object.freeze([Object.freeze({ name: 'clientMetadataUrl', kind: 'text', sample: 'https://agent.example/fbtest-cimd.json' })]),
    lists: Object.freeze([Object.freeze({
      name: 'servers',
      item: Object.freeze(['serverName', 'url']),
      start: Object.freeze([server('m'), server('n2')]),
      added: server('o3'),
      otherField: 'clientMetadataUrl',
      otherValue: 'https://agent.example/fbtest-other.json',
      refused: Object.freeze([
        Object.freeze({ label: 'empty serverName', entry: server('', url('p1')), why: 'serverName is required and matches 1..32 characters' }),
        Object.freeze({ label: 'bad pattern', entry: server('bad name!', url('p2')), why: 'serverName pattern' }),
        Object.freeze({ label: 'serverName 33', entry: server('n'.repeat(33), url('p3')), why: 'serverName longer than 32' }),
        Object.freeze({ label: 'missing url', entry: server('p4', ''), why: 'url is required' }),
        Object.freeze({ label: 'duplicate serverName', entry: server('m', url('p5')), why: 'a serverName already in the list', invalid: 'serverName' }),
        Object.freeze({ label: 'http public host', entry: server('p6', 'http://example.com/api/agent/mcp'), why: 'http off loopback', invalid: 'url' }),
        Object.freeze({ label: 'ftp', entry: server('p7', 'ftp://example.com/api/agent/mcp'), why: 'neither https nor http', invalid: 'url' }),
        Object.freeze({ label: 'not a URL', entry: server('p8', 'not a url'), why: 'not a URL', invalid: 'url' }),
      ]),
      accepted: Object.freeze([
        Object.freeze({ label: 'serverName 32', entry: server('n'.repeat(32), url('q1')), why: 'serverName of exactly 32' }),
        Object.freeze({ label: 'http 127.0.0.1', entry: server('q2', 'http://127.0.0.1:' + LOOPBACK_PORT + '/api/agent/mcp'), why: 'http on 127.0.0.1' }),
        Object.freeze({ label: 'http [::1]', entry: server('q3', 'http://[::1]:' + LOOPBACK_PORT + '/api/agent/mcp'), why: 'http on [::1]' }),
        Object.freeze({ label: 'http localhost', entry: server('q4', 'http://localhost:' + LOOPBACK_PORT + '/api/agent/mcp'), why: 'http on localhost' }),
      ]),
    })]),
  }),
  Object.freeze({
    row: 'dsh-connector-watchdog',
    order: Object.freeze(['model', 'minCheckIntervalSeconds', 'readMaxMessages', 'readMaxBytes', 'checkTimeoutSeconds']),
    models: Object.freeze(['model']),
    settings: Object.freeze([
      Object.freeze({ name: 'minCheckIntervalSeconds', kind: 'number', min: 60, max: 86_400 }),
      Object.freeze({ name: 'readMaxMessages', kind: 'number', min: 1, max: 100 }),
      Object.freeze({ name: 'readMaxBytes', kind: 'number', min: 1024, max: 1_048_576 }),
      Object.freeze({ name: 'checkTimeoutSeconds', kind: 'number', min: 30, max: 900 }),
    ]),
    lists: Object.freeze([]),
  }),
])

/** Fake DSH model catalog for model-selector cases. */
export const CATALOG = Object.freeze({
  default: Object.freeze({
    groups: Object.freeze([
      Object.freeze({
        id: 'cheap',
        name: 'Cheap',
        models: Object.freeze([
          Object.freeze({ id: 'mini', name: 'Mini' }),
          Object.freeze({
            id: 'mini-reason',
            name: 'Mini Reason',
            reasoning: Object.freeze({
              efforts: Object.freeze([
                Object.freeze({ id: 'low', name: 'Low' }),
                Object.freeze({ id: 'high', name: 'High' }),
              ]),
            }),
          }),
        ]),
      }),
    ]),
  }),
  empty: Object.freeze({ groups: Object.freeze([]) }),
  plainSelection: Object.freeze({ provider: 'cheap', model: 'mini' }),
  effortSelection: Object.freeze({ provider: 'cheap', model: 'mini-reason', reasoningEffort: 'low' }),
  staleSelection: Object.freeze({ provider: 'removed', model: 'old-mini', reasoningEffort: 'medium' }),
})

/** R5: the members and the umbrella bundle the DSH side's library. */
export const MANIFESTS = Object.freeze([
  Object.freeze({ dir: path.join(REPO, 'packages', 'dsh-connector-adapter'), depends: Object.freeze(['dsh-connector-shared']), bundles: Object.freeze(['dsh-connector-shared']) }),
  Object.freeze({ dir: path.join(REPO, 'packages', 'dsh-connector-watchdog'), depends: Object.freeze(['dsh-connector-shared']), bundles: Object.freeze(['dsh-connector-shared']) }),
  Object.freeze({ dir: path.join(REPO, 'packages', 'dsh-connector-amenities'), depends: Object.freeze(['dsh-connector-shared']), bundles: Object.freeze(['dsh-connector-shared']) }),
])
