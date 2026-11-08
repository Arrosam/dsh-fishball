/**
 * I6 — the settings view's plugin labels (P2) and its model section (P3), plus the model
 * snapshot's `active` contract and the chat reader behind it.
 *
 * Requirements (developer's fix report for e3150bc; design §0.5 "Settings view", §18.2 I6):
 * - P2: a plugin setting label comes from the schema's `meta.title`, then the page dictionary,
 *   then a humanised fallback; a namespace heading follows the same order. No raw schema key is
 *   ever shown as a label. `meta.description` supplies the description line.
 * - P3: the Model section separates three cases — provider missing, provider catalog empty, and a
 *   saved model absent from a non-empty catalog. It shows the actually running model (new
 *   `active` in `model/get`, `fishballChat.currentModel()`) and offers "Use the running model",
 *   which changes only the draft; Save is still the user's.
 *
 * Techniques: equivalence partitions and decision tables for the three label sources and the
 * three model cases; boundary values for an empty/blank meta title, a one-model catalog, an
 * absent `active`, and a running effort the model does not offer; state transitions for the
 * running-model button and for provider changes.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | P2-L-DT-01 | DT (meta, dict) | the schema meta title is the label |
 * | P2-L-DT-02 | DT (no meta, dict) | the dictionary label is the label |
 * | P2-L-DT-03 | DT (no meta, no dict) | the key is humanised, never shown raw |
 * | P2-L-EP-01/02 | EP (lang) | a localized meta title uses the page language |
 * | P2-L-EP-03 | EP (missing language) | a localized meta title falls back to English |
 * | P2-L-BVA-01 | BVA (empty/blank title) | an empty title falls through to the dictionary |
 * | P2-L-EP-04 | EP (nested path) | the last path segment's dictionary label is used |
 * | P2-L-EP-05 | EP (technical names) | scope/harness prefixes are dropped and camelCase split |
 * | P2-L-EP-06/07 | EP (namespace) | dictionary label, else humanised heading |
 * | P2-L-DT-04 | DT (namespace meta) | the schema root's meta title is the heading |
 * | P2-L-EP-08 | EP (description) | a localized meta description is shown; none shows nothing |
 * | P2-L-P-01 | P | no label equals a raw schema key |
 * | P3-M-DT-01/02/03 | DT (catalog state) | provider-missing / catalog-empty / model-unknown note |
 * | P3-M-EP-01 | EP (model present) | no note; Save disabled until a draft changes |
 * | P3-M-BVA-01 | BVA (one model) | one offered model with a saved absent one is "model unknown" |
 * | P3-M-EP-02/03 | EP (`active` null/absent) | no running note, no running button |
 * | P3-M-DT-04/05 | DT (`active` vs saved) | equal: no note; different: running note + button |
 * | P3-M-EP-04 | EP (running model not in catalog) | the note names it; no button |
 * | P3-M-ST-01 | ST (draft → saved) | the button drafts only; Save persists exactly that pair |
 * | P3-M-ST-02 | ST (effort) | a running effort the model does not offer is not drafted |
 * | P3-M-ST-03/04 | ST (provider change) | an empty catalog note; a non-empty one picks its first |
 * | P3-M-EP-05 | EP (zh) | the model notes are Chinese |
 * | P3-ACT-EP-01..03 | EP (`currentModel`) | null port → null; value → set; null/undefined/invalid/throw → null |
 * | P3-ACT-P-01..03 | P (`model/get` shape) | `active` null or a selection passes; malformed fails |
 * | P3-ACT-EP-04..06 | EP (chat) | before activation null; live selection; malformed/throw → null |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadInstance } from './support/body-soul-env.mjs'
import { chatHarness } from './support/body-soul-chat.mjs'
import {
  ADMIN_ROUTE, bodyOf, buttonOf, catalogModel, controlOf, headingTexts, hintsOfField,
  labelTexts, modelSnapshot, mountSettings, notesOf, ok, sectionOf, settle,
} from './support/body-soul-settings.mjs'

const { createI18n } = await loadInstance('src/slim/ui/i18n.js')
const { createAdminService, validateResult, ADMIN_OPERATION, ADMIN_ERROR, AdminFailure } = await loadInstance('src/slim/child/admin.js')
const loadChat = () => loadInstance('src/slim/child/chat.js')

const en = createI18n('en')
const zh = createI18n('zh')

/* ------------------------------------------------------------------ P2 fixtures */

/**
 * A serialized schema envelope: a root object with one field per `{key, type, meta}` entry.
 * `rootMeta` is the namespace root's meta (its title is the heading).
 */
function schemaOf(fields, rootMeta) {
  const refs = { 0: { type: 'object', dict: {}, ...(rootMeta === undefined ? {} : { meta: rootMeta }) } }
  fields.forEach((field, index) => {
    const ref = index + 1
    refs[0].dict[field.key] = ref
    refs[ref] = { type: field.type ?? 'string', ...(field.meta === undefined ? {} : { meta: field.meta }) }
  })
  return { uid: 0, refs }
}

function namespaceOf(ns, schema, value = {}) {
  return { ns, revision: 1, autoGenerate: false, schema, value, secrets: [] }
}

/** A nested schema `{auth: {provider: string}}`, for the last-path-segment fallback. */
const NESTED_SCHEMA = Object.freeze({
  uid: 0,
  refs: {
    0: { type: 'object', dict: { auth: 1 } },
    1: { type: 'object', dict: { provider: 2 } },
    2: { type: 'string' },
  },
})

async function mountPluginSettings(t, namespaces, lang = 'en') {
  const i18n = createI18n(lang)
  const mounted = await mountSettings(t, {
    lang,
    answers: { [ADMIN_ROUTE.settingsGet]: ok({ writable: true, namespaces }) },
  })
  const section = sectionOf(mounted.container, i18n.t('settings.settingsTitle'))
  return { ...mounted, i18n, section, body: bodyOf(section) }
}

describe('P2 plugin-setting labels resolve meta title, then dictionary, then a humanised key', () => {
  it('P2-L-DT-01 a schema meta title wins over the page dictionary', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'enabled', type: 'boolean', meta: { title: 'Turn it on' } }])),
    ])
    assert.deepEqual(labelTexts(section), ['Turn it on'])
  })

  it('P2-L-DT-02 with no meta title the dictionary label is used', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'enabled', type: 'boolean' }])),
    ])
    assert.deepEqual(labelTexts(section), ['Enabled'])
  })

  it('P2-L-DT-03 with no meta title and no dictionary entry the key is humanised, not shown raw', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'maxRetryCount' }])),
    ])
    assert.deepEqual(labelTexts(section), ['Max Retry Count'])
  })

  it('P2-L-EP-01 a localized meta title uses the page language (en)', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'flag', type: 'boolean', meta: { title: { en: 'Beta label', zh: '测试标签' } } }])),
    ])
    assert.deepEqual(labelTexts(section), ['Beta label'])
  })

  it('P2-L-EP-02 a localized meta title uses the page language (zh)', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'flag', type: 'boolean', meta: { title: { en: 'Beta label', zh: '测试标签' } } }])),
    ], 'zh')
    assert.deepEqual(labelTexts(section), ['测试标签'])
  })

  it('P2-L-EP-03 a localized meta title missing the page language falls back to English', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'flag', type: 'boolean', meta: { title: { en: 'Beta label' } } }])),
    ], 'zh')
    assert.deepEqual(labelTexts(section), ['Beta label'])
  })

  it('P2-L-BVA-01 an empty or blank meta title falls through to the dictionary', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([
        { key: 'enabled', type: 'boolean', meta: { title: '' } },
        { key: 'provider', meta: { title: '   ' } },
      ])),
    ])
    assert.deepEqual(labelTexts(section), ['Enabled', 'Provider'])
  })

  it('P2-L-EP-04 a nested path uses its last segment dictionary label', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', NESTED_SCHEMA),
    ])
    assert.deepEqual(labelTexts(section), [en.t('settings.field.provider')])
  })

  it('P2-L-EP-05 scope and harness prefixes are dropped and camelCase is split', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([
        { key: '@acme/cordis-plugin-dsh-host-retryBudget' },
        { key: 'cordis:session-log' },
      ])),
    ])
    assert.deepEqual(labelTexts(section), ['Retry Budget', 'Session Log'])
  })

  it('P2-L-EP-06 a namespace heading uses its dictionary label', async (t) => {
    const { body } = await mountPluginSettings(t, [
      namespaceOf('agent-default-model', schemaOf([{ key: 'enabled', type: 'boolean' }])),
    ])
    assert.deepEqual(headingTexts(body), [en.t('settings.ns.agent-default-model')])
  })

  it('P2-L-EP-07 a namespace with no dictionary label is humanised', async (t) => {
    const { body } = await mountPluginSettings(t, [
      namespaceOf('custom-ns', schemaOf([{ key: 'enabled', type: 'boolean' }])),
    ])
    assert.deepEqual(headingTexts(body), ['Custom Ns'])
  })

  it('P2-L-DT-04 a namespace root meta title wins over every fallback (zh)', async (t) => {
    const { body } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([{ key: 'enabled', type: 'boolean' }], { title: { en: 'Fish settings', zh: 'Fish 设置' } })),
    ], 'zh')
    assert.deepEqual(headingTexts(body), ['Fish 设置'])
  })

  it('P2-L-EP-08 a localized meta description is shown; a missing one shows no description line', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([
        { key: 'note', meta: { description: { en: 'Explains it.', zh: '说明。' } } },
        { key: 'plain' },
      ])),
    ], 'zh')
    assert.deepEqual(hintsOfField(section, 'Note'), ['说明。'])
    assert.deepEqual(hintsOfField(section, 'Plain'), [])
  })

  it('P2-L-P-01 no label is a raw schema key', async (t) => {
    const { section } = await mountPluginSettings(t, [
      namespaceOf('demo', schemaOf([
        { key: 'enabled', type: 'boolean' },
        { key: 'reasoningEffort' },
        { key: 'maxRetryCount' },
      ])),
    ])
    assert.deepEqual(labelTexts(section), ['Enabled', 'Reasoning effort', 'Max Retry Count'])
    for (const raw of ['enabled', 'reasoningEffort', 'maxRetryCount']) {
      assert.equal(labelTexts(section).includes(raw), false, 'raw key shown: ' + raw)
    }
  })
})

/* ------------------------------------------------------------------ P3 fixtures */

const ALPHA = Object.freeze({ id: 'alpha', name: 'Alpha' })
const BETA = Object.freeze({ id: 'beta', name: 'Beta' })
const ALPHA_NEW = catalogModel('alpha', 'new', 'New model')
const BETA_MODEL = catalogModel('beta', 'b1', 'Beta model')
const BETA_HIGH = catalogModel('beta', 'b1', 'Beta model', [{ id: 'high', name: 'High' }])

async function mountModel(t, options) {
  const lang = options.lang ?? 'en'
  const i18n = createI18n(lang)
  const answers = {
    [ADMIN_ROUTE.modelGet]: modelSnapshot({
      selection: options.selection,
      providers: options.providers ?? [],
      models: options.models ?? [],
      ...(Object.hasOwn(options, 'active') ? { active: options.active } : {}),
    }),
    ...(options.answers ?? {}),
  }
  const mounted = await mountSettings(t, { lang, answers })
  const section = sectionOf(mounted.container, i18n.t('settings.modelTitle'))
  const body = bodyOf(section)
  return { ...mounted, i18n, section, body, notes: notesOf(body) }
}

/** The status line at the end of a block (the model Save confirmation or refusal). */
const statusOf = (section) => section.childNodes[section.childNodes.length - 1].textContent

describe('P3 the Model section separates the three unavailable-default cases', () => {
  it('P3-M-DT-01 a provider missing from the catalog says the provider is unavailable', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'ghost', model: 'g1' }, providers: [ALPHA], models: [ALPHA_NEW],
    })
    assert.deepEqual(notes, [i18n.t('settings.modelProviderUnknown', { provider: 'ghost' })])
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
    assert.equal(buttonOf(body, i18n.t('settings.useRunningModel')), undefined)
  })

  it('P3-M-DT-02 a known provider whose catalog is empty says so, not that the model is unknown', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'm1' }, providers: [ALPHA], models: [],
    })
    assert.deepEqual(notes, [i18n.t('settings.modelCatalogEmpty', { provider: ALPHA.name })])
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
  })

  it('P3-M-DT-03 a saved model absent from a non-empty catalog says the model is unknown', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA], models: [ALPHA_NEW],
    })
    assert.deepEqual(notes, [i18n.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' })])
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
  })

  it('P3-M-EP-01 a saved model present in the catalog has no note and Save stays disabled', async (t) => {
    const { i18n, body, notes } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'new' }, providers: [ALPHA], models: [ALPHA_NEW],
    })
    assert.deepEqual(notes, [])
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
    assert.equal(controlOf(body, i18n.t('settings.provider')).value, 'alpha')
    assert.equal(controlOf(body, i18n.t('settings.model')).value, 'new')
  })

  it('P3-M-BVA-01 a one-model catalog with the saved model absent is still "model unknown"', async (t) => {
    const { i18n, notes } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA], models: [ALPHA_NEW],
    })
    assert.deepEqual(notes, [i18n.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' })])
  })
})

describe('P3 the running model: active null, equal, different and unavailable', () => {
  it('P3-M-EP-02 an explicit active null adds no running note and no button', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA], models: [ALPHA_NEW], active: null,
    })
    assert.deepEqual(notes, [i18n.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' })])
    assert.equal(buttonOf(body, i18n.t('settings.useRunningModel')), undefined)
  })

  it('P3-M-EP-03 an old snapshot without active behaves as null', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA], models: [ALPHA_NEW],
    })
    assert.deepEqual(notes, [i18n.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' })])
    assert.equal(buttonOf(body, i18n.t('settings.useRunningModel')), undefined)
  })

  it('P3-M-DT-04 active equal to the saved selection adds no running note', async (t) => {
    const { notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA], models: [ALPHA_NEW, BETA_MODEL],
      active: { provider: 'alpha', model: 'old' },
    })
    assert.equal(notes.length, 1)
    assert.equal(buttonOf(body, en.t('settings.useRunningModel')), undefined)
  })

  it('P3-M-DT-05 active different and available adds the running note and the button', async (t) => {
    const { i18n, notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA, BETA], models: [ALPHA_NEW, BETA_MODEL],
      active: { provider: 'beta', model: 'b1' },
    })
    assert.deepEqual(notes, [
      i18n.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' }),
      i18n.t('settings.modelRunning', { provider: BETA.name, model: BETA_MODEL.name }),
    ])
    assert.ok(buttonOf(body, i18n.t('settings.useRunningModel')))
  })

  it('P3-M-EP-04 a running model absent from the catalog is named but cannot be drafted', async (t) => {
    const { notes, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA, BETA], models: [ALPHA_NEW],
      active: { provider: 'beta', model: 'ghost' },
    })
    assert.equal(notes.length, 2)
    assert.match(notes[1], /Beta/)
    assert.match(notes[1], /ghost/)
    assert.equal(buttonOf(body, en.t('settings.useRunningModel')), undefined)
  })
})

describe('P3 the running-model button drafts; Save is still the user\'s', () => {
  it('P3-M-ST-01 the button changes only the draft, and Save persists exactly the running pair', async (t) => {
    const saved = { provider: 'alpha', model: 'old' }
    const running = { provider: 'beta', model: 'b1', reasoningEffort: 'high' }
    const { i18n, section, body, calls } = await mountModel(t, {
      selection: saved, providers: [ALPHA, BETA], models: [ALPHA_NEW, BETA_HIGH], active: running,
      answers: { [ADMIN_ROUTE.modelSet]: ok({ revision: 8, selection: running }) },
    })
    const modelSetCalls = () => calls.filter((call) => call.operation === ADMIN_ROUTE.modelSet)
    assert.equal(modelSetCalls().length, 0)

    buttonOf(body, i18n.t('settings.useRunningModel')).dispatch('click')
    await settle()

    // The draft now points at the running pair; nothing has been written.
    assert.equal(modelSetCalls().length, 0, 'the running-model button must never save')
    assert.equal(controlOf(body, i18n.t('settings.provider')).value, 'beta')
    assert.equal(controlOf(body, i18n.t('settings.model')).value, 'b1')
    assert.equal(controlOf(body, i18n.t('settings.effort')).value, 'high')
    assert.deepEqual(notesOf(body), [], 'a chosen draft has no unavailable-default note')
    const save = buttonOf(body, i18n.t('settings.save'))
    assert.equal(save.disabled, false)

    save.dispatch('click')
    await settle()

    assert.equal(modelSetCalls().length, 1)
    assert.deepEqual(modelSetCalls()[0].payload, { revision: 7, provider: 'beta', model: 'b1', reasoningEffort: 'high' })
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
    assert.equal(statusOf(section), i18n.t('settings.modelSaved'))
  })

  it('P3-M-ST-02 a running effort the model does not offer is dropped from the draft', async (t) => {
    const running = { provider: 'beta', model: 'b1', reasoningEffort: 'max' }
    const { i18n, body, calls } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA, BETA], models: [ALPHA_NEW, BETA_HIGH], active: running,
      answers: { [ADMIN_ROUTE.modelSet]: ok({ revision: 8, selection: { provider: 'beta', model: 'b1' } }) },
    })
    buttonOf(body, i18n.t('settings.useRunningModel')).dispatch('click')
    await settle()
    assert.equal(controlOf(body, i18n.t('settings.effort')).value, '')

    buttonOf(body, i18n.t('settings.save')).dispatch('click')
    await settle()
    const [call] = calls.filter((entry) => entry.operation === ADMIN_ROUTE.modelSet)
    assert.deepEqual(call.payload, { revision: 7, provider: 'beta', model: 'b1' })
  })

  it('P3-M-ST-03 switching to a provider whose catalog is empty shows the empty-catalog note', async (t) => {
    const { i18n, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'new' }, providers: [ALPHA, BETA], models: [ALPHA_NEW],
    })
    const provider = controlOf(body, i18n.t('settings.provider'))
    provider.value = BETA.id
    provider.dispatch('change')
    await settle()

    assert.deepEqual(notesOf(body), [i18n.t('settings.modelCatalogEmpty', { provider: BETA.name })])
    assert.equal(controlOf(body, i18n.t('settings.model')).value, '')
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, true)
  })

  it('P3-M-ST-04 switching to a provider with models picks its first model and enables Save', async (t) => {
    const { i18n, body } = await mountModel(t, {
      selection: { provider: 'alpha', model: 'a1' }, providers: [ALPHA, BETA],
      models: [catalogModel('alpha', 'a1', 'A1'), catalogModel('beta', 'b1', 'B1'), catalogModel('beta', 'b2', 'B2')],
    })
    const provider = controlOf(body, i18n.t('settings.provider'))
    provider.value = BETA.id
    provider.dispatch('change')
    await settle()

    assert.deepEqual(notesOf(body), [])
    assert.equal(controlOf(body, i18n.t('settings.model')).value, 'b1')
    assert.equal(buttonOf(body, i18n.t('settings.save')).disabled, false)
  })

  it('P3-M-EP-05 the model notes are Chinese', async (t) => {
    const { notes } = await mountModel(t, {
      lang: 'zh',
      selection: { provider: 'alpha', model: 'old' }, providers: [ALPHA, BETA], models: [ALPHA_NEW, BETA_MODEL],
      active: { provider: 'beta', model: 'b1' },
    })
    assert.deepEqual(notes, [
      zh.t('settings.modelUnknown', { provider: ALPHA.name, model: 'old' }),
      zh.t('settings.modelRunning', { provider: BETA.name, model: BETA_MODEL.name }),
    ])
  })
})

/* ------------------------------------------------------------------ model/get active */

const fakePlugins = Object.freeze({
  async listBundles() { return [] },
  async installBundle() { throw new Error('not used') },
  async removeBundle() { throw new Error('not used') },
  async setBundleEnabled() { throw new Error('not used') },
})

function adminService({ currentModel, selection = { provider: 'alpha', model: 'm1' } } = {}) {
  const settings = {
    writable: true,
    describe: () => [{ ns: 'agent-default-model', revision: 2, value: selection, secrets: [] }],
    mutate: async () => {},
  }
  const llm = {
    listProviders: () => [ALPHA],
    listModels: async (provider) => (provider === ALPHA.id ? [{ id: 'm1', name: 'M1' }] : []),
    resolveModelInfo: async () => ({}),
    resolveCallConfig: async (value) => value,
  }
  return createAdminService({ settings, llm, plugins: fakePlugins, ...(currentModel === undefined ? {} : { currentModel }) })
}

const MODEL_GET_RESULT = Object.freeze({
  revision: 2,
  selection: { provider: 'alpha', model: 'm1' },
  providers: [{ id: 'alpha', name: 'Alpha' }],
  models: [{ provider: 'alpha', id: 'm1', name: 'M1', efforts: [] }],
})

const isPayloadFailure = (error) => error instanceof AdminFailure && error.code === ADMIN_ERROR.payload

describe('P3 model/get exposes the live model as active', () => {
  it('P3-ACT-EP-01 without a currentModel port active is null', async () => {
    const answer = await adminService().handle(ADMIN_OPERATION.modelGet, {})
    assert.equal(answer.ok, true)
    assert.equal(answer.result.active, null)
    assert.doesNotThrow(() => validateResult(ADMIN_OPERATION.modelGet, answer.result))
  })

  it('P3-ACT-EP-02 a currentModel selection becomes active, effort included', async () => {
    const currentModel = () => ({ provider: 'alpha', model: 'm1', reasoningEffort: 'high' })
    const answer = await adminService({ currentModel }).handle(ADMIN_OPERATION.modelGet, {})
    assert.deepEqual(answer.result.active, { provider: 'alpha', model: 'm1', reasoningEffort: 'high' })
    assert.doesNotThrow(() => validateResult(ADMIN_OPERATION.modelGet, answer.result))
  })

  for (const [name, currentModel] of [
    ['null', () => null],
    ['undefined', () => undefined],
    ['an empty provider', () => ({ provider: '', model: 'm1' })],
    ['a throw', () => { throw new Error('no live session') }],
  ]) {
    it('P3-ACT-EP-03 ' + name + ' from currentModel makes active null', async () => {
      const answer = await adminService({ currentModel }).handle(ADMIN_OPERATION.modelGet, {})
      assert.equal(answer.result.active, null)
    })
  }

  it('P3-ACT-P-01 the result shape accepts active null and a valid selection', () => {
    assert.doesNotThrow(() => validateResult(ADMIN_OPERATION.modelGet, { ...MODEL_GET_RESULT, active: null }))
    assert.doesNotThrow(() => validateResult(ADMIN_OPERATION.modelGet, {
      ...MODEL_GET_RESULT,
      active: { provider: 'alpha', model: 'm1', reasoningEffort: 'high' },
    }))
  })

  it('P3-ACT-P-02 the old result shape without active still validates', () => {
    assert.doesNotThrow(() => validateResult(ADMIN_OPERATION.modelGet, MODEL_GET_RESULT))
  })

  it('P3-ACT-P-03 a malformed active is refused as invalid-payload', () => {
    for (const active of [{ provider: 'alpha' }, { provider: 'alpha', model: 'm1', extra: 1 }, { provider: '', model: '' }]) {
      assert.throws(() => validateResult(ADMIN_OPERATION.modelGet, { ...MODEL_GET_RESULT, active }), isPayloadFailure)
    }
  })
})

describe('P3 fishballChat.currentModel()', () => {
  it('P3-ACT-EP-04 before activation it is null', async (t) => {
    const h = await chatHarness(t, { loadChat, start: false })
    assert.equal(h.chat.service.currentModel(), null)
  })

  it('P3-ACT-EP-05 after activation it returns the live selection with its effort', async (t) => {
    const selection = { provider: 'alpha', model: 'm1', reasoningEffort: 'high' }
    const h = await chatHarness(t, { loadChat, currentModel: () => selection })
    await h.entries() // activates the chat's session, which creates the live agent
    assert.deepEqual(h.chat.service.currentModel(), selection)
  })

  it('P3-ACT-EP-06 a malformed live model is null', async (t) => {
    const h = await chatHarness(t, { loadChat, currentModel: () => ({ provider: '', model: 'm1' }) })
    await h.entries()
    assert.equal(h.chat.service.currentModel(), null)
  })
})
