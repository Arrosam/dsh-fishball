/**
 * Mount the child settings view (ui/settings.js) in Node: the fake document from
 * body-soul-dom.mjs, the real dictionaries from ui/i18n.js, and a stubbed admin endpoint that
 * answers the routes the view calls.
 *
 * The stub is the test's observation point: it records every admin call, so a test can prove a
 * button changed only a draft (no `model/set`) before the user pressed Save. All answers are
 * synchronous envelopes, so `mountSettings` settles deterministically after one macrotask.
 */
import { loadInstance } from './body-soul-env.mjs'
import { fakeDocument } from './body-soul-dom.mjs'

/** The admin routes the view calls; the slugs are the page's own protocol constants. */
export const ADMIN_ROUTE = Object.freeze({
  prefix: '/api/fishball/native/admin/',
  status: 'status',
  restart: 'restart',
  modelGet: 'model/get',
  modelSet: 'model/set',
  pluginsGet: 'plugins/get',
  pluginInstall: 'plugin/install',
  pluginRemove: 'plugin/remove',
  pluginEnable: 'plugin/enable',
  pluginDisable: 'plugin/disable',
  settingsGet: 'settings/get',
  settingsMutate: 'settings/mutate',
})

export const ok = (result) => ({ ok: true, result })
export const refused = (code) => ({ ok: false, error: { code } })

const { createSettingsView } = await loadInstance('src/slim/ui/settings.js')
const { createI18n } = await loadInstance('src/slim/ui/i18n.js')

const EMPTY_DIGEST = '0'.repeat(64)

/** The quiet answers every mount needs; a test overrides the block it exercises. */
export const DEFAULT_ANSWERS = Object.freeze({
  [ADMIN_ROUTE.status]: () => ok({ state: 'ready', code: null }),
  [ADMIN_ROUTE.restart]: () => ok({ state: 'ready', code: null }),
  [ADMIN_ROUTE.pluginsGet]: () => ok({ inventoryRevision: EMPTY_DIGEST, bundles: [], recommended: [] }),
  [ADMIN_ROUTE.settingsGet]: () => ok({ writable: true, namespaces: [] }),
})

/** Let every already-resolved admin answer and its DOM draw run. */
export async function settle(rounds = 4) {
  for (let round = 0; round < rounds; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Create the view in a fake document and wait for two complete reads. The second read (an
 * awaited `refresh`) makes the final DOM independent of the view's own fire-and-forget mount
 * read, whichever order the two rounds finish in.
 *
 * @returns {{view: object, calls: Array<{operation: string, payload: object}>, container: object}}
 */
export async function mountSettings(t, { lang = 'en', answers = {} } = {}) {
  const calls = []
  const all = { ...DEFAULT_ANSWERS, ...answers }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const operation = String(url).slice(ADMIN_ROUTE.prefix.length)
    const payload = JSON.parse(init.body)
    calls.push({ operation, payload })
    const answer = all[operation]
    if (answer === undefined) throw new Error('no admin answer for ' + operation)
    return { json: async () => (typeof answer === 'function' ? answer(payload) : answer) }
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const container = fakeDocument.createElement('div')
  const view = createSettingsView({ container, i18n: createI18n(lang) })
  await settle()
  await view.refresh()
  await settle()
  return { view, calls, container }
}

/** The section whose heading is exactly `title`. */
export function sectionOf(container, title) {
  return [...container.walk()].find((node) => node.tagName === 'SECTION' && node.childNodes[0]?.textContent === title)
}

/** The block's redrawable body (the section's only unclassed div). */
export function bodyOf(section) {
  return section.childNodes.find((node) => node.tagName === 'DIV' && node.className === '')
}

/** The model block's note lines: the children between its control row and its action row. */
export function notesOf(body) {
  return body.childNodes.slice(1, -1).map((node) => node.textContent)
}

/** Every label caption inside `root` (the settings-form labels). */
export function labelTexts(root) {
  return [...root.walk()].filter((node) => node.className === 'settings-label').map((node) => node.textContent)
}

/** The control inside the labelled field whose caption is `caption`. */
export function controlOf(root, caption) {
  for (const node of root.walk()) {
    if (node.tagName === 'LABEL' && node.childNodes[0]?.textContent === caption) {
      return node.childNodes.find((child) => typeof child !== 'string' && ['SELECT', 'INPUT', 'TEXTAREA'].includes(child.tagName))
    }
  }
  return undefined
}

/** The hint lines inside the labelled field whose caption is `caption` (description and control hint). */
export function hintsOfField(root, caption) {
  const field = [...root.walk()].find((node) => node.tagName === 'LABEL' && node.childNodes[0]?.textContent === caption)
  return field === undefined ? [] : field.childNodes.filter((node) => typeof node !== 'string' && node.className === 'settings-hint').map((node) => node.textContent)
}

/** Every sub-heading inside `root` (a settings namespace's name). */
export function headingTexts(root) {
  return [...root.walk()].filter((node) => node.tagName === 'H3').map((node) => node.textContent)
}

/** The first button whose text is exactly `text`. */
export function buttonOf(root, text) {
  return root.querySelectorAll('button').find((node) => node.textContent === text)
}

/** A settings snapshot for the model block; `active` is omitted unless the test passes null too. */
export function modelSnapshot({ revision = 7, selection, providers = [], models = [], active } = {}) {
  return ok({
    revision,
    selection,
    providers,
    models,
    ...(active === undefined ? {} : { active }),
  })
}

/** One catalog model with its optional efforts. */
export function catalogModel(provider, id, name = id, efforts = []) {
  return { provider, id, name, efforts }
}
