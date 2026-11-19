/**
 * The approval page's HTML (R-OA-11, R-ARCH-03's one exception: one server-rendered page, no client
 * module, no script, no CSS asset). Pure rendering: every caller-supplied text is HTML-escaped, and
 * nothing here ever receives a token value (R-OA-12: the value is never echoed back).
 *
 * Its look is page-theme.js: one inline `<style>` the CSP admits by its hash only (UI-POLISH-D; the
 * user, 2026-11-18), with no style attribute anywhere, so `PAGE_STYLE` is the page's only styling.
 * The page is one card: the connector's mark, the title, the request's facts, the warnings, then
 * the form with Authorize first in the markup (the Enter-key submit) and Cancel beside it.
 */
import { PATHS } from '../../../mcp-schema/index.js'
import { FORM_ACTION, FORM_FIELD, FORM_INPUT, PAGE_ROLE, PAGE_TEXT } from './constants.js'
import { MARK_SHAPE, PAGE_CLASS, PAGE_STYLE } from './page-theme.js'

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })
const HTML_SPECIAL = /[&<>"']/g
const SLOT = /\{(\w+)\}/g

export const escapeHtml = (text) => String(text).replace(HTML_SPECIAL, (char) => HTML_ESCAPES[char])

/**
 * A PAGE_TEXT template as HTML, its `{slot}`s filled: `values` are escaped here, `html` values are
 * markup the caller already built from escaped parts. The template itself is trusted copy.
 */
export const fill = (template, values = {}, html = {}) =>
  escapeHtml(template).replace(SLOT, (_, key) => (Object.hasOwn(html, key) ? html[key] : escapeHtml(values[key] ?? '')))

/** A paragraph, with its ARIA role and its class when given (an alert or a note is a tinted box). */
const paragraph = (html, role, className) =>
  `<p${className === undefined ? '' : ` class="${className}"`}${role === undefined ? '' : ` role="${role}"`}>${html}</p>`

/**
 * The connector's mark (assets/connector-icon.svg), decorative: the title carries the meaning. Size
 * and colours are presentation attributes, not style, so it renders the same without the style block.
 */
const { colors: MARK_COLOR, badgeCentre: BADGE_C } = MARK_SHAPE
/** The glyph's offset: its grid's centre lands on the badge's centre after scaling. */
const GLYPH_AT = Number((BADGE_C - (MARK_SHAPE.glyphGrid / 2) * MARK_SHAPE.glyphScale).toFixed(MARK_SHAPE.coordDigits))
const MARK_HTML = `<span class="${PAGE_CLASS.mark}" aria-hidden="true">`
  + `<svg width="${MARK_SHAPE.sizePx}" height="${MARK_SHAPE.sizePx}" viewBox="${MARK_SHAPE.viewBox}">`
  + `<rect width="${MARK_SHAPE.tileSize}" height="${MARK_SHAPE.tileSize}" rx="${MARK_SHAPE.tileRadius}" fill="${MARK_COLOR.tile}"/>`
  + `<path d="${MARK_SHAPE.body}" fill="${MARK_COLOR.paper}"/><path d="${MARK_SHAPE.eye}" fill="${MARK_COLOR.accent}"/>`
  + `<circle cx="${BADGE_C}" cy="${BADGE_C}" r="${MARK_SHAPE.ringRadius}" fill="${MARK_COLOR.tile}"/>`
  + `<circle cx="${BADGE_C}" cy="${BADGE_C}" r="${MARK_SHAPE.chipRadius}" fill="${MARK_COLOR.paper}"/>`
  + `<g transform="translate(${GLYPH_AT} ${GLYPH_AT}) scale(${MARK_SHAPE.glyphScale})" fill="none" stroke="${MARK_COLOR.tile}"`
  + ` stroke-width="${MARK_SHAPE.glyphStroke}" stroke-linecap="${MARK_SHAPE.glyphCap}" stroke-linejoin="${MARK_SHAPE.glyphJoin}">`
  + `${MARK_SHAPE.wrench.map((d) => `<path d="${d}"/>`).join('')}</g></svg></span>`

/**
 * The whole document: a viewport for phones, `color-scheme` so the browser's own parts (scrollbars,
 * autofill) follow the theme, the one hashed style block, and the card with the brand line.
 */
function document(titleHtml, bodyHtml) {
  return `<!doctype html><html lang="${PAGE_TEXT.lang}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark">'
    + `<title>${titleHtml}</title><style>${PAGE_STYLE}</style></head>`
    + `<body><main class="${PAGE_CLASS.card}"><div class="${PAGE_CLASS.brand}">${MARK_HTML}`
    + `<div><p class="${PAGE_CLASS.eyebrow}">${fill(PAGE_TEXT.brand)}</p><h1>${titleHtml}</h1></div></div>${bodyHtml}</main></body></html>`
}

/** A principal as R-NAME-08 shows it: its name, or `ID: <id>` with the prefix bold. */
export function principalHtml(label) {
  return label.name !== undefined ? escapeHtml(label.name) : `<b>${escapeHtml(label.prefix)}</b>${escapeHtml(label.id)}`
}

/** The error page of a request that cannot be served or redirected (a bad client id or redirect URI, an expired request). */
export const errorPage = (message) => document(fill(PAGE_TEXT.errorTitle), paragraph(fill(message), PAGE_ROLE.alert, PAGE_CLASS.alert))

/** A labelled field: the label's words above its input (DSH's settings field). */
const input = (type, name, label, autocomplete, extra = '') =>
  `<label class="${PAGE_CLASS.field}">${fill(label)} <input type="${type}" name="${name}" autocomplete="${autocomplete}"${extra}></label>`
const hidden = (name, value) => `<input type="${FORM_INPUT.hidden}" name="${name}" value="${escapeHtml(value)}">`
const button = (label, action, className, extra = '') =>
  `<button type="submit" class="${className}" name="${FORM_FIELD.action}" value="${action}"${extra}>${fill(label)}</button>`

/**
 * The form of one pending request: the token and an optional name only (R-OA-11 as amended by
 * requirements 1.32 R13; the id comes from the agent's request, R-OA-22).
 * @param view.clientName the document's `client_name` (shown as unverified, and only as the name field's hint)
 * @param view.clientHost the client id URL's host
 * @param view.redirectHost the redirect URI's host name
 * @param view.loopbackOnly whether every registered redirect is loopback (adds R-OA-11's warning)
 * @param view.dshName this DSH's name; `view.resource` its canonical MCP URI
 * @param view.requestId, view.nonce the pending request's id and this render's single-use form value
 * @param messageHtml an alert already built with `fill` (so already escaped), or undefined
 */
export function formPage(view, messageHtml) {
  const client = { client: view.clientName }
  return document(fill(PAGE_TEXT.title, client), [
    messageHtml === undefined ? '' : paragraph(messageHtml, PAGE_ROLE.alert, PAGE_CLASS.alert),
    `<div class="${PAGE_CLASS.facts}">`,
    paragraph(fill(PAGE_TEXT.client, { client: view.clientName, host: view.clientHost })),
    paragraph(fill(PAGE_TEXT.redirectHost, { host: view.redirectHost })),
    paragraph(fill(PAGE_TEXT.dsh, { dsh: view.dshName, resource: view.resource })),
    '</div>',
    view.loopbackOnly ? paragraph(fill(PAGE_TEXT.localhostOnly), PAGE_ROLE.note, PAGE_CLASS.note) : '',
    `<div class="${PAGE_CLASS.terms}">`,
    paragraph(fill(PAGE_TEXT.rights)),
    paragraph(fill(PAGE_TEXT.oneAgent)),
    '</div>',
    `<form method="post" action="${PATHS.decision}">`,
    hidden(FORM_FIELD.request, view.requestId),
    hidden(FORM_FIELD.nonce, view.nonce),
    input(FORM_INPUT.password, FORM_FIELD.token, PAGE_TEXT.tokenLabel, FORM_INPUT.autocompleteNewPassword, ' required'),
    input(FORM_INPUT.text, FORM_FIELD.name, PAGE_TEXT.nameLabel, FORM_INPUT.autocompleteOff, ` placeholder="${escapeHtml(view.clientName)}"`),
    `<div class="${PAGE_CLASS.actions}">`,
    button(PAGE_TEXT.authorize, FORM_ACTION.authorize, PAGE_CLASS.primary),
    button(PAGE_TEXT.cancel, FORM_ACTION.cancel, PAGE_CLASS.secondary, ' formnovalidate'),
    '</div>',
    '</form>',
  ].join(''))
}
