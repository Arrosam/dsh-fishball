/**
 * What the CHILD-PLUGINS page rows read, and how (black box: no module of the implementation is read).
 *
 * - The mode (R1, decided by fishball-core): the current DSH's dsh-app-boot composes its shipped bundles,
 *   core's cordis.patch.yml and the launch overlay files (loadOverlayPatches, composeEntries); the
 *   fishball-child-plugins row's `disabled` is resolved by DSH's own loader (cordis-plugin-loader
 *   interpolate) against a real cordis Context providing `profileContext` with those overlays. Its
 *   `name` (a path into core's ./ui/) is fishball-ui's sub-package folder; that folder's manifest names
 *   the browser entry ("./client") and the Node half (".").
 * - R2–R5: the browser entry runs unread in the scripted page (fishball-test-helpers/browser-sandbox)
 *   after DSH's own locale runtime (dsh-client-locale LocaleRuntime) and the dictionaries of DSH's
 *   Plugins page and Discover (their real lib/client.js, applied up to their dictionary effect, which
 *   each applies first), exactly when the composed row runs (instance-run), not when it is off
 *   (standalone). Every style sheet the page then holds goes into a real headless Chromium
 *   (fishball-test-helpers/browser measure) over a DOM drawn like DSH's PluginManagerPage markup, with
 *   DSH's own words and CSS-module classes; the rows read what Chromium shows: checkVisibility() of each
 *   control, and the toolbar's text and generated content.
 *
 * Ported from test/v3/fishball-core/child-plugins/subject.mjs; the mode is now read from the composition
 * instead of being a flag, so the rows integrate core's patch and fishball-ui's client.
 */
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { importBound } from 'fishball-test-helpers/bind'
import { measure } from 'fishball-test-helpers/browser'
import { createBrowserSandbox } from 'fishball-test-helpers/browser-sandbox'
import { dshPackageDir, importDsh } from 'fishball-test-helpers/dsh'
import { packageByName } from 'fishball-test-helpers/packages'
import { settle } from 'fishball-test-helpers/wait'
import { CHILD_PACKAGE, DSH, PAGE, ROWS, SCRATCH } from './constants.mjs'

const UTF8 = 'utf8'
const NAME = Object.freeze({ core: 'fishball-core', ui: 'fishball-ui' })
/** fishball-core's folder, by name (this package's dependency). */
export const CORE_DIR = path.dirname(createRequire(path.join(import.meta.dirname, '..', '..', 'package.json')).resolve(NAME.core + '/package.json'))
/** fishball-ui's folder, by name (the helpers' package catalogue). */
export const UI_DIR = fs.realpathSync(packageByName(NAME.ui).abs)
const readJson = (file) => JSON.parse(fs.readFileSync(file, UTF8))

// ------------------------------------------------------------------------------------------ the mode

/** One launch overlay file's text: a patch inserting the given row ids. */
const overlayYaml = (ids) => SCRATCH.insertHead + ids.map((id) => '    - { id: ' + id + ', name: ' + ROWS.moduleName + ' }\n').join('')

/** A scratch folder removed when the test ends (guarded: only one this helper created). */
async function scratch(t) {
  const tmp = await realpath(os.tmpdir())
  const dir = await mkdtemp(path.join(tmp, SCRATCH.prefix))
  t.after(async () => {
    if (path.dirname(dir) !== tmp || !path.basename(dir).startsWith(SCRATCH.prefix)) throw new Error('unexpected temp dir ' + dir)
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

const patchOf = async (file) => (await importDsh('dsh-app-boot')).loadOverlayPatches(SCRATCH.label, file)

/** The entry list DSH composes from its shipped bundles, then `layers` (patch lists) in order. */
export async function composedWith(...layers) {
  const boot = await importDsh('dsh-app-boot')
  const shipped = DSH.shipped.map((name) => {
    const dir = dshPackageDir(name)
    return boot.bundlePatchPaths(dir, readJson(path.join(dir, CHILD_PACKAGE.manifest)).dsh.bundle).flatMap((file) => boot.loadOverlayPatches(SCRATCH.label, file))
  })
  return boot.composeEntries([...shipped, ...layers])
}

/** Every row with `id` in a composed entry list, nested group and preset rows included. */
function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row?.id === id) out.push(row)
    if (row?.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row?.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}

/** A row value (a `!!js` expression or a plain value) as DSH's loader resolves it. */
async function resolvedWith(value, profileContext) {
  const [{ Context }, { interpolate }] = await Promise.all([importDsh('cordis'), importDsh('cordis-plugin-loader')])
  const ctx = new Context()
  ctx.provide(DSH.profileContext, Object.freeze({ ...profileContext }))
  try { return interpolate(ctx, { value }).value } finally { await ctx.fiber?.dispose?.() }
}

/**
 * A launch with these overlay files (each a list of inserted row ids): the composed rows, whether
 * DSH runs the fishball-child-plugins row, and that row's folder (its `name` resolved in core's folder).
 */
export async function launch(t, overlayFiles) {
  const dir = await scratch(t)
  const overlays = []
  for (const [i, ids] of overlayFiles.entries()) {
    const file = path.join(dir, i + '-' + SCRATCH.overlayFile)
    await writeFile(file, ids.length === 0 ? SCRATCH.empty : overlayYaml(ids))
    overlays.push(await patchOf(file))
  }
  const rows = await composedWith(await patchOf(path.join(CORE_DIR, DSH.patchFile)), ...overlays)
  const [row] = findRows(rows, ROWS.child)
  if (!row) throw new Error('core\'s patch composes no ' + ROWS.child + ' row')
  const runs = !(await resolvedWith(row.disabled, { startedBundles: Object.freeze([]), overlays: Object.freeze(overlays.flat()) }))
  // DSH's composition resolves a path row's name against its bundle folder into a file: URL.
  const entry = String(row.name).startsWith(DSH.fileScheme) ? fileURLToPath(row.name) : path.resolve(CORE_DIR, row.name)
  return { rows, runs, rowDir: path.dirname(entry) }
}

/** The composed Host rows of DSH's plugin management (the Plugins page, the Host manager, Discover, their tools). */
export function hostRows(rows, out = []) {
  for (const row of rows) {
    if (DSH.hostRowName.test(String(row?.name))) out.push(row)
    if (row?.group && Array.isArray(row.config)) hostRows(row.config, out)
    if (Array.isArray(row?.config?.plugins)) hostRows(row.config.plugins, out)
  }
  return out
}

const childManifest = (rowDir) => readJson(path.join(rowDir, CHILD_PACKAGE.manifest))

/** The row's Node half (its sub-package's "." export) applied to a context that records every member it reads. */
export async function applyNodeHalf(rowDir) {
  const mod = await importBound(path.join(rowDir, childManifest(rowDir).exports[CHILD_PACKAGE.nodeExport]))
  const read = []
  const record = (at) => new Proxy(function recorded() {}, {
    get(_t, key) { if (typeof key === 'symbol' || key === 'then') return undefined; read.push(at + '.' + String(key)); return record(at + '.' + String(key)) },
    apply() { read.push(at + '()'); return record(at + '()') },
  })
  await mod.apply?.(record('ctx'), {})
  return { mod, read }
}

// ------------------------------------------------------------------------------------- browser

/** CSS.escape as the CSSOM spec defines it (a browser global the scripted page lacks). */
export function cssEscape(value) {
  const text = String(value)
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    const ch = text[i]
    const digit = c >= 0x30 && c <= 0x39
    if (c === 0) out += '\uFFFD'
    else if ((c >= 0x1 && c <= 0x1f) || c === 0x7f || (i === 0 && digit) || (i === 1 && digit && text.charCodeAt(0) === 0x2d)) out += '\\' + c.toString(16) + ' '
    else if (i === 0 && ch === '-' && text.length === 1) out += '\\' + ch
    else if (c >= 0x80 || ch === '-' || ch === '_' || digit || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) out += ch
    else out += '\\' + ch
  }
  return out
}

const clientFile = (pkg) => path.join(dshPackageDir(pkg.slice(DSH.scope.length)), ...DSH.clientFile)
const inert = new Proxy(function inert() {}, { get: (_t, key) => (key === 'then' || typeof key === 'symbol' ? undefined : inert), apply: () => inert, construct: () => inert })

/** The Host's locale preference as an in-memory settings form. */
function preferenceForm(initial) {
  const changes = new EventEmitter()
  let revision = 1
  let value = { [DSH.preferenceField]: initial }
  const snapshot = () => ({ status: 'ready', value, user: value, base: {}, revision, writable: true })
  let current = snapshot()
  return {
    getSnapshot: () => current,
    subscribe(fn) { changes.on('change', fn); return () => changes.off('change', fn) },
    async set(field, next) { value = { ...value, [field]: next }; revision++; current = snapshot(); changes.emit('change'); return true },
  }
}

/** Apply one DSH browser plugin up to its dictionaries (its first effect); its first other member read ends the run. */
function applyDictionaries(page, ctx, pkg) {
  const file = clientFile(pkg)
  page.run(fs.readFileSync(file, UTF8), file)
  const plugin = page.registrations.find((r) => r.id === pkg).factory(() => inert)
  const done = Symbol('dictionaries registered')
  const face = { effect(fn, label) { if (DSH.dictionaryEffect.test(String(label))) ctx.effect(fn, label) }, locale: ctx.locale }
  try { plugin.apply(new Proxy(face, { get(target, key) { if (key in target) return target[key]; throw done } })) } catch (error) { if (error !== done) throw error }
}

/**
 * One scripted child page in `lang` for a launch (`launch`'s answer): DSH's locale runtime, the
 * Plugins page's and Discover's dictionaries, then, when DSH runs the fishball-child-plugins row,
 * its sub-package's public browser entry applied as DSH's loader applies an entry. Returns the
 * language controls, DSH's words and every style sheet the page holds now.
 */
export async function childPage({ runs, rowDir }, { lang }) {
  const page = createBrowserSandbox({ lang, baseURI: PAGE.base, fetch: async () => new Response('', { status: PAGE.notFound }) })
  page.sandbox.CSS = Object.freeze({ escape: cssEscape, supports: () => true })
  const elements = []
  page.sandbox.CSSStyleSheet = class CSSStyleSheet {
    constructor() { this.text = '' }
    replaceSync(text) { this.text = String(text) }
    async replace(text) { this.text = String(text); return this }
    insertRule(rule) { this.text += String(rule); return 0 }
  }
  // The page's head is a plain recording list: the rows read only which <style> elements are live.
  page.document.createElement = (tagName) => {
    const element = {
      tagName: String(tagName).toLowerCase(), id: '', textContent: '', removed: false, dataset: {}, style: {}, attributes: {},
      setAttribute(k, v) { element.attributes[k] = String(v); if (k === 'id') element.id = String(v) },
      getAttribute: (k) => element.attributes[k] ?? null, append() {}, appendChild() {}, remove() { element.removed = true },
    }
    return element
  }
  const add = (element) => { element.removed = false; elements.push(element); return element }
  page.document.head = { append: (...nodes) => nodes.forEach(add), prepend: (...nodes) => nodes.forEach(add), appendChild: add, insertBefore: add, removeChild: (node) => { node.removed = true; return node } }
  page.document.getElementById = (id) => elements.find((e) => !e.removed && e.id === id) ?? null
  page.document.querySelector = (selector) => elements.find((e) => !e.removed && ('#' + e.id === selector || 'style#' + e.id === selector)) ?? null

  const events = new EventEmitter()
  const ctx = {
    effect(fn) { return fn() },
    on(event, fn) { events.on(event, fn); return () => events.off(event, fn) },
    emit: (event, ...args) => events.emit(event, ...args),
  }
  const form = preferenceForm(lang)
  ctx.configForms = { get: () => form }
  const localeFile = clientFile(DSH.locale)
  page.run(fs.readFileSync(localeFile, UTF8), localeFile)
  const { LocaleRuntime } = page.registrations.find((r) => r.id === DSH.locale).factory(() => ({}))
  const locale = new LocaleRuntime(ctx, form)
  ctx.locale = locale
  applyDictionaries(page, ctx, DSH.manager)
  applyDictionaries(page, ctx, DSH.market)
  const dshCount = elements.length

  if (runs) {
    const manifest = childManifest(rowDir)
    const file = path.join(rowDir, manifest.exports[CHILD_PACKAGE.clientExport])
    page.run(fs.readFileSync(file, UTF8), file, CHILD_PACKAGE.scriptUrl)
    const entry = page.registrations.find((r) => r.id === manifest.name && r.chunk === undefined)
    if (!entry) throw new Error('the client registered no module ' + manifest.name)
    const plugin = entry.factory((spec) => { throw new Error('fbtest page: unexpected require ' + spec) })
    await plugin.apply(ctx)
  }
  await settle()
  const live = (list) => list.filter((e) => !e.removed && e.tagName === 'style').map((e) => String(e.textContent))
  return {
    locale,
    /** DSH's own words now: the Plugins page's 't' and Discover's tab label. */
    words: () => ({ t: locale.bind(DSH.managerNs), discover: locale.bind(DSH.marketNs)(DSH.discoverLabelKey) }),
    async setLang(id) { locale.setLocale(id); await settle() },
    addLanguage: (definition) => locale.addLanguage(definition),
    dshSheets: () => live(elements.slice(0, dshCount)),
    sheets: () => [...live(elements), ...page.document.adoptedStyleSheets.map((sheet) => String(sheet.text ?? ''))],
  }
}

// ------------------------------------------------------------------------------- the drawn DOM

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attrs = (map) => Object.entries(map).filter(([, v]) => v !== undefined && v !== false).map(([k, v]) => (v === true ? ' ' + k : ' ' + k + '="' + escapeHtml(v) + '"')).join('')
const el = (tag, map, inner = '') => '<' + tag + attrs(map) + '>' + inner + '</' + tag + '>'
const mark = (name) => ({ [PAGE.marker]: name })
/** The probe's names for one tab button and one tab panel. */
export const tabMark = (id) => 'tab:' + id
export const panelMark = (id) => 'panel:' + id

/**
 * A bundle's page as PluginManagerPage.tsx's PackageDetail draws it: the top (crumb, contributed
 * action, the head's "Update {name}" when 'pkg.headUpdate', its "Update to {version}" when
 * 'pkg.headVersion' is a version, Uninstall, the switch), the title, and, when 'pkg.versions' is a
 * list, the Versions section unfolded (versions.tsx VersionSection / VersionList / VersionRow): one
 * row per newer version with its "Update to {version}" button, then the installed row (no button).
 * Every Update button carries 'disabled' while 'pkg.busy'. Marks: 'update', 'headVersion',
 * 'versionUpdate:<version>', and 'recheck' / 'installedRow' for the section's other parts.
 */
function detailBody({ t, cls, pkg }) {
  const k = DSH.key
  const busy = pkg.busy === true
  const actions = [
    el('button', { type: 'button', 'aria-label': pkg.detailActionLabel, ...mark('detailAction') }, escapeHtml(pkg.detailAction)),
    pkg.headUpdate === false ? '' : el('button', { type: 'button', class: cls('button'), 'aria-label': t(k.updateLabel, { name: pkg.title }), disabled: busy, ...mark('update') }, t(k.update)),
    pkg.headVersion === undefined ? '' : el('button', { type: 'button', 'aria-label': t(k.versionsUpdateLabel, { version: pkg.headVersion }), disabled: busy, ...mark('headVersion') }, t(k.versionsUpdateLabel, { version: pkg.headVersion })),
    el('button', { type: 'button', class: cls('danger'), 'aria-label': t(k.uninstallLabel, { name: pkg.title }), disabled: busy || !pkg.removable, ...mark('uninstall') }, t(k.uninstall)),
    el('span', { class: cls('bundleToggle') }, el('button', { type: 'button', role: 'switch', 'aria-checked': 'true', 'aria-label': t(k.enableToggle, { name: pkg.title }), disabled: busy, ...mark('switch') })),
  ].join('')
  const versionRow = (version) => el('li', { class: cls('versionRow'), 'data-plugin-version': version.version },
    el('div', { class: cls('versionMain') }, el('div', { class: cls('versionTitle') }, el('span', { class: cls('versionNumber') }, escapeHtml(version.version))))
    + el('span', { class: cls('versionAction') }, el('button', { type: 'button', 'aria-label': t(k.versionsUpdateLabel, { version: version.version }), disabled: busy, ...mark(versionMark(version.version)) }, t(k.update))))
  const installedRow = (version) => el('li', { class: cls('versionRow'), 'data-plugin-version': version, ...mark('installedRow') },
    el('div', { class: cls('versionMain') }, el('div', { class: cls('versionTitle') }, el('span', { class: cls('versionNumber') }, escapeHtml(version)) + el('span', {}, t(k.versionsInstalledTag)))))
  const versions = pkg.versions === undefined ? '' : el('section', { class: cls('detailSection'), 'data-plugin-versions': true },
    el('div', { class: cls('sectionHead') }, el('h4', { class: cls('sectionTitle') }, t(k.versionsTitle)) + el('span', { class: cls('versionSpacer') })
      + el('button', { type: 'button', ...mark('recheck') }, t(k.versionsRecheck)))
    + el('div', { class: cls('versionPanel') }, el('button', { type: 'button', class: cls('versionSummary'), 'aria-expanded': 'true' }, el('span', {}, t(k.versionsCollapse)))
      + el('div', { class: cls('versionBody') }, el('ul', { class: cls('versionRows') }, pkg.versions.map(versionRow).join('') + installedRow(pkg.installed)))))
  return el('div', { class: cls('detail'), 'data-plugin-detail': pkg.name },
    el('div', { class: cls('detailTop'), 'data-window-drag': true },
      el('button', { type: 'button', class: cls('crumb'), 'aria-label': t(k.backToList), ...mark('crumb') }, el('span', {}, t(k.crumbRoot)))
      + el('div', { class: cls('detailHead') }, el('span', { class: cls('cardIcon'), 'aria-hidden': 'true' }) + el('div', { class: cls('detailActions') }, actions)))
    + el('div', { class: cls('detailMain') }, el('h3', { class: cls('detailTitle'), ...mark('detailTitle') }, escapeHtml(pkg.title)))
    + el('div', { class: cls('detailSections') }, versions))
}
/** The probe's name for one Versions row's Update button. */
export const versionMark = (version) => 'versionUpdate:' + version

/** The list header (title, intro, toolbar with Refresh and Add plugin's group, the tab bar when there are contributed tabs) and the selected panel. */
function listBody({ t, cls, tabs, selected, disabled, menuOpen }) {
  const k = DSH.key
  const onInstalled = selected === DSH.installedTab
  const addGroup = el('span', { class: cls('addGroup'), role: 'group', 'aria-label': t(k.addPlugin), ...mark('addGroup') },
    el('button', { type: 'button', class: cls('addPrimary'), 'aria-label': t(k.addPlugin), disabled, ...mark('addPrimary') }, el('span', { class: cls('toolbarLabel') }, t(k.addPlugin)))
    + el('button', { type: 'button', class: cls('addMore'), disabled, 'aria-label': t(k.chooseAddMethod), 'aria-haspopup': 'menu', 'aria-expanded': String(menuOpen), ...mark('addMore') }))
  const toolbar = el('div', { class: cls('toolbar'), 'data-plugin-toolbar': true, 'data-plugin-header-part': 'toolbar', hidden: !onInstalled, ...mark(PAGE.toolbarMarker) },
    el('button', { type: 'button', class: cls('addButton'), 'aria-label': t(k.refresh), disabled, ...mark('refresh') }, el('span', { class: cls('toolbarLabel') }, t(k.refresh))) + addGroup)
  const items = [{ id: DSH.installedTab, label: t(k.installedTab) }, ...tabs]
  const tabBar = tabs.length === 0 ? '' : el('div', { class: cls('pageTabs'), 'data-plugin-header-part': 'tabs', ...mark('tabs') },
    el('div', { role: 'tablist', 'data-size': 'sm', 'aria-label': t(k.tabsLabel), class: cls('pageTabList') },
      el('span', { 'aria-hidden': 'true' }) + items.map((item) => el('button', {
        type: 'button', id: PAGE.tabsId + '-' + item.id, role: 'tab', 'aria-selected': String(item.id === selected),
        'aria-controls': PAGE.tabsId + '-' + item.id + '-panel', tabindex: item.id === selected ? '0' : '-1', ...mark(tabMark(item.id)),
      }, escapeHtml(item.label))).join('')))
  const bar = el('div', { class: [cls('pageBar'), tabs.length > 0 ? cls('pageBarWithTabs') : undefined].filter(Boolean).join(' '), 'data-plugin-bar': true },
    el('header', { class: cls('pageHead'), 'data-window-drag': true },
      el('div', { class: cls('pageHeading') }, el('h1', { class: cls('pageTitle'), 'data-plugin-header-part': 'title', ...mark('title') }, t(k.title))
        + el('div', { class: cls('pageIntro'), 'data-plugin-header-part': 'intro' }, el('span', {}, t(k.intro))))
      + toolbar + tabBar))
  const installedPanel = tabs.length === 0 ? {} : { role: 'tabpanel', id: PAGE.tabsId + '-' + DSH.installedTab + '-panel', 'aria-labelledby': PAGE.tabsId + '-' + DSH.installedTab }
  const panel = onInstalled
    ? el('div', { class: cls('installedPanel'), ...installedPanel, ...mark(panelMark(DSH.installedTab)) }, el('p', {}, 'fbtest installed list'))
    : el('div', { role: 'tabpanel', id: PAGE.tabsId + '-' + selected + '-panel', 'aria-labelledby': PAGE.tabsId + '-' + selected, class: cls('tabPanel'), ...mark(panelMark(selected)) }, el('p', {}, 'fbtest tab content'))
  return bar + panel
}

/**
 * The Plugins page as PluginManagerPage.tsx draws it, with DSH's own words ('t', the pluginManager
 * namespace) and its CSS-module classes ('cls'). view 'list' or 'detail' (one bundle's page, 'pkg').
 */
export function pageBody({ t, cls, view = 'list', tabs = [], selected = DSH.installedTab, pkg, disabled = false, menuOpen = false }) {
  const inner = view === 'detail' ? detailBody({ t, cls, pkg }) : listBody({ t, cls, tabs, selected, disabled, menuOpen })
  return el('section', { class: cls('page'), 'data-plugin-panel': true }, el('div', { class: cls('pageBody'), 'data-plugin-body': true }, inner))
}

/** DSH's CSS-module class function, read from the Plugins page's own sheet. */
export function moduleClasses(dshSheets) {
  const prefix = dshSheets.map((css) => PAGE.modulePrefix.exec(css)?.[1]).find(Boolean)
  if (!prefix) throw new Error('no Plugins page sheet among the page styles')
  return (name) => prefix + name
}

/** The page-side probe: each marked element's checkVisibility(), and the visible text in and generated by the toolbar. */
const PROBE = String(function probe() {
  const visible = {}
  for (const node of document.querySelectorAll('[data-fbtest]')) visible[node.getAttribute('data-fbtest')] = node.checkVisibility()
  const toolbar = document.querySelector('[data-plugin-toolbar]')
  const generated = []
  let text = ''
  if (toolbar && toolbar.checkVisibility()) {
    text = toolbar.innerText
    for (const node of [toolbar, ...toolbar.querySelectorAll('*')]) {
      if (!node.checkVisibility()) continue
      for (const pseudo of ['::before', '::after']) {
        const style = getComputedStyle(node, pseudo)
        if (style.display === 'none' || style.visibility === 'hidden' || !style.content || style.content === 'none' || style.content === 'normal') continue
        generated.push([...style.content.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1')).join(''))
      }
    }
  }
  return { visible, text, generated }
})

/** Draw 'body' under the page's style sheets in Chromium and read it back. */
export async function show(sheets, body, lang) {
  const html = '<!doctype html><html lang="' + lang + '"><head><meta charset="utf-8">' + sheets.map((css) => '<style>' + css + '</style>').join('') + '</head><body>' + body + '</body></html>'
  return measure(html, PROBE, null, PAGE.viewport)
}
