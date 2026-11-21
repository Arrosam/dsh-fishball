/**
 * GENTLE-TOOLS avatar rows' harness: fishball-page's real client (navPage, the UI-POLISH-F scripted page)
 * with core's settings form for the logo theme, then the page's own style rules laid out in a headless
 * Chromium (motion.mjs evaluateHtml) over a minimal conversation: Fishball's reply row as DSH marks it
 * (data-slot main.conversation > data-chat-flow-kind assistant-step, data-chat-group-part response),
 * and two rows the rules must not reach (a non-response part, and a response row outside
 * main.conversation). The <html> attributes are the ones the page set on the scripted <html>.
 *
 * The configForms face is DSH's ConfigForm (dsh-client-ui-settings config-form-types.d.ts, both SDKs):
 * get(entryId) -> {getSnapshot(), subscribe(fn) -> dispose}; the snapshot's value is core's section.
 * Only 'fishball-core' is served; any other entry id answers undefined (the LITE harness does so too).
 */
import { navPage } from '../package/nav-page.mjs'
import { evaluateHtml } from './motion.mjs'
import { AVATAR } from './constants.mjs'
import { Node } from './hide.mjs'

/** A served ConfigForm whose value a case can change (every listener is told, as DSH does). */
function coreForm(value) {
  const listeners = new Set()
  const snap = (v) => Object.freeze({ status: AVATAR.form.ready, value: v, base: undefined, user: v, revision: AVATAR.form.revision, writable: true })
  let snapshot = snap(value)
  return {
    face: { getSnapshot: () => snapshot, subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) } },
    set(next) { snapshot = snap(next); for (const fn of [...listeners]) fn() },
    get listeners() { return listeners.size },
  }
}
/** The section for one stored brandStyle; AVATAR.absent leaves the field out. */
export const sectionOf = (style) => (style === AVATAR.absent ? {} : { [AVATAR.field]: style })

/** Wraps an element's attribute writers so every written name is recorded in 'names'. */
function recordWrites(element, names) {
  for (const method of ['setAttribute', 'removeAttribute', 'toggleAttribute']) {
    const own = element[method]?.bind(element)
    if (own) element[method] = (name, ...rest) => { names.add(name); return own(name, ...rest) }
  }
}

/**
 * A settings-section-like element carrying core's settings hook (AVATAR.settingsHook), put in the
 * document the page queries: document.querySelector / querySelectorAll answer it for any simple
 * selector it matches (hide.mjs's Node), so a page that looked the hook up would find it.
 */
function settingsSection(sandbox) {
  const body = new Node('div')
  const section = new Node(AVATAR.settingsSection.tag, { [AVATAR.settingsHook]: AVATAR.settingsSection.value })
  body.appendChild(section)
  const writes = new Set()
  recordWrites(section, writes)
  const doc = sandbox.document
  const [ownAll, ownOne] = [doc.querySelectorAll.bind(doc), doc.querySelector.bind(doc)]
  doc.querySelectorAll = (selector) => [...ownAll(selector), ...body.querySelectorAll(selector)]
  doc.querySelector = (selector) => ownOne(selector) ?? body.querySelector(selector)
  return { element: section, writes }
}

/**
 * One Fishball page. Options: 'style' the stored brandStyle (AVATAR.absent: no field), 'forms' false
 * for a client without configForms, 'value' false for a served form with no value yet, 'section' true
 * to put a settings-section-like [data-fishball-brand] element in the same document (`p.section`).
 */
export async function avatarPage(t, sdk, { style = AVATAR.absent, forms = true, value = true, section: withSection = false } = {}) {
  const form = coreForm(value ? sectionOf(style) : undefined)
  const names = new Set()
  let section = null
  const page = await navPage(t, sdk, {
    primitives: { FISH_LOGO_PATH: AVATAR.dshPath, FISH_LOGO_VIEWBOX: AVATAR.dshViewBox },
    prepare(sandbox, ctx) {
      recordWrites(sandbox.document.documentElement, names)
      if (withSection) section = settingsSection(sandbox)
      if (forms) ctx.configForms = { get: (entryId) => (entryId === AVATAR.namespace ? form.face : undefined) }
    },
  })
  const htmlAttrs = () => [...names].filter((n) => page.html.hasAttribute(n)).map((n) => [n, page.html.getAttribute(n)])
  return {
    page, form, section,
    /** Every attribute name the page ever wrote on <html>. */
    htmlWrites: () => [...names],
    brand: () => page.html.getAttribute(AVATAR.brandAttr),
    /** Changes the stored theme live (a form notification), then lets the page react. */
    async restyle(next) { form.set(sectionOf(next)); await page.settle() },
    /** The computed pseudo-element styles of the conversation rows in Chromium. */
    measure: () => evaluateHtml(documentOf(htmlAttrs(), page.styles()), PROBE),
  }
}

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const row = (role, part) => '<div data-fbtest-row="' + role + '" data-chat-flow-kind="' + AVATAR.row.kind + '" data-chat-group-part="' + part + '"><div data-slot="conversation.chat.node"><div>fbtest reply</div></div></div>'
function documentOf(attrs, styles) {
  const html = attrs.map(([n, v]) => ' ' + n + '="' + escapeAttr(v) + '"').join('')
  // Distinct colours for the two DSH tokens the requirement names, so the painted colour is observable.
  const tokens = ':root{' + AVATAR.tokens.map(([name, colour]) => name + ':' + colour).join(';') + '}'
  return '<!doctype html><html' + html + '><head><meta charset="utf-8"><style>' + tokens + '</style>' +
    styles.map((s) => '<style>' + s + '</style>').join('') + '</head><body>' +
    '<div data-slot="' + AVATAR.row.conversation + '">' + row('reply', AVATAR.row.part) + row('other-part', AVATAR.row.otherPart) + '</div>' +
    '<div>' + row('outside', AVATAR.row.part) + '</div></body></html>'
}

/** Every row's ::before and ::after, and the row's own box, by data-fbtest-row. */
const PROBE = String(function probe() {
  const decode = (value) => {
    const m = /url\("?(data:[^")]*)"?\)/.exec(value || '')
    if (!m) return null
    const url = m[1]
    const comma = url.indexOf(',')
    const body = url.slice(comma + 1)
    return /;base64$/.test(url.slice(0, comma)) ? atob(body) : decodeURIComponent(body)
  }
  const out = {}
  for (const el of document.querySelectorAll('[data-fbtest-row]')) {
    const before = getComputedStyle(el, '::before')
    const after = getComputedStyle(el, '::after')
    const own = getComputedStyle(el)
    const mask = [before.maskImage, before.webkitMaskImage].find((v) => v && v !== 'none') || 'none'
    out[el.dataset.fbtestRow] = {
      before: { content: before.content, mask, maskSvg: decode(mask), backgroundImage: before.backgroundImage, backgroundSvg: decode(before.backgroundImage), backgroundColor: before.backgroundColor,
        box: [before.position, before.left, before.top, before.width, before.height].join(' ') },
      after: { content: after.content, box: [after.position, after.top, after.left, after.color, after.font].join(' ') },
      row: [own.position, own.margin, own.padding].join(' '),
    }
  }
  const probeColour = (colour) => { const d = document.createElement('div'); d.style.color = colour; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c }
  out.tokens = Object.fromEntries([...document.styleSheets[0].cssRules[0].style].map((name) => [name, probeColour(document.styleSheets[0].cssRules[0].style.getPropertyValue(name).trim())]))
  return out
})
