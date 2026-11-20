/**
 * DISCOVERY-TOOLS decision (2026-11-21), not inferred from the implementation: two core tools,
 * models_list and workspaces_list, with a closed empty input and a oneOf output of the success
 * shape and the refusal envelope. Values below are the requirement's names and fixture results.
 */
import { CORE_TOOLS } from './constants.mjs'

export const DISCOVERY_TOOLS = Object.freeze({
  /** TOOL member → tool name, as the requirement names them. */
  names: Object.freeze({ modelsList: 'models_list', workspacesList: 'workspaces_list' }),
  /** They follow sessions_list in tools/list order. */
  after: 'sessions_list',
  all: CORE_TOOLS,
  count: 22,
  /** The closed, empty input schema (verbatim). */
  emptyInput: Object.freeze({ type: 'object', properties: Object.freeze({}), additionalProperties: false }),
  /** sessions_list is unchanged (the existing pin in tests/wire/review/constants.mjs). */
  sessionsListDescription: 'List the main-DSH sessions you manage. Sessions nobody manages and sessions another principal manages are omitted.',
})

/** Fixture results the output schemas must admit (success) or refuse (shape errors). */
const effortModel = Object.freeze({ model: 'p/m1', provider: 'p', providerName: 'P', name: 'M1', reasoningEfforts: Object.freeze(['low', 'high']), defaultReasoningEffort: 'low' })
const plainModel = Object.freeze({ model: 'p/m2', provider: 'p', providerName: 'P', name: 'M2', reasoningEfforts: Object.freeze([]) })
const workspace = Object.freeze({ workspaceId: 'ws-1', title: 'Work', path: '/abs/work', available: true })
const models = (rest) => ({ ok: true, models: [effortModel, plainModel], defaultModel: { model: 'p/m1' }, unavailableProviders: [], ...rest })

export const DISCOVERY_FIXTURE = Object.freeze({
  models: Object.freeze({
    accepted: Object.freeze([
      ['empty lists', { ok: true, models: [], defaultModel: { model: 'p/m1' }, unavailableProviders: [] }],
      ['models with and without efforts / default effort', models()],
      ['default with reasoningEffort', models({ defaultModel: { model: 'p/m1', reasoningEffort: 'high' } })],
      ['an unavailable provider', models({ unavailableProviders: [{ provider: 'q', providerName: 'Q' }] })],
    ]),
    refused: Object.freeze([
      ['an extra root field', models({ extra: true })],
      ['models missing', { ok: true, defaultModel: { model: 'p/m1' }, unavailableProviders: [] }],
      ['defaultModel missing', { ok: true, models: [], unavailableProviders: [] }],
      ['unavailableProviders missing', { ok: true, models: [], defaultModel: { model: 'p/m1' } }],
      ['an extra model field', models({ models: [{ ...plainModel, extra: true }] })],
      ['a model without reasoningEfforts', models({ models: [{ model: 'p/m2', provider: 'p', providerName: 'P', name: 'M2' }] })],
      ['a non-string effort', models({ models: [{ ...plainModel, reasoningEfforts: [1] }] })],
      ['an extra defaultModel field', models({ defaultModel: { model: 'p/m1', extra: true } })],
      ['a failure message on an unavailable provider', models({ unavailableProviders: [{ provider: 'q', providerName: 'Q', message: 'boom' }] })],
      ['ok false without code', { ok: false }],
    ]),
  }),
  workspaces: Object.freeze({
    accepted: Object.freeze([
      ['empty registry', { ok: true, workspaces: [] }],
      ['duplicate titles, one unavailable', { ok: true, workspaces: [workspace, { ...workspace, workspaceId: 'ws-2', available: false }] }],
    ]),
    refused: Object.freeze([
      ['an extra root field', { ok: true, workspaces: [], extra: true }],
      ['workspaces missing', { ok: true }],
      ['an extra workspace field', { ok: true, workspaces: [{ ...workspace, extra: true }] }],
      ['available missing', { ok: true, workspaces: [{ workspaceId: 'ws-1', title: 'Work', path: '/abs/work' }] }],
      ['available not boolean', { ok: true, workspaces: [{ ...workspace, available: 'yes' }] }],
      ['ok false without code', { ok: false }],
    ]),
  }),
  /** Inputs the closed empty input refuses (and the empty one it admits). */
  arguments: Object.freeze([{ x: 1 }, { limit: 1 }, { workspaceId: 'ws-1' }, { model: 'p/m1' }]),
})
