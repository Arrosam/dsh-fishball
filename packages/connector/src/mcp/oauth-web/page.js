/**
 * The approval page's HTML (R-OA-11, R-ARCH-03's one exception: one server-rendered page, no client
 * module, no script, no CSS asset). Pure rendering: every caller-supplied text is HTML-escaped, and
 * nothing here ever receives a token value (R-OA-12: the value is never echoed back).
 */
import { PATHS } from '../../../mcp-schema/index.js'
import { FORM_ACTION, FORM_FIELD, FORM_INPUT, PAGE_ROLE, PAGE_TEXT } from './constants.js'

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

const paragraph = (html, role) => (role === undefined ? `<p>${html}</p>` : `<p role="${role}">${html}</p>`)

function document(titleHtml, bodyHtml) {
  return `<!doctype html><html lang="${PAGE_TEXT.lang}"><head><meta charset="utf-8"><title>${titleHtml}</title></head>`
    + `<body><h1>${titleHtml}</h1>${bodyHtml}</body></html>`
}

/** A principal as R-NAME-08 shows it: its name, or `ID: <id>` with the prefix bold. */
export function principalHtml(label) {
  return label.name !== undefined ? escapeHtml(label.name) : `<b>${escapeHtml(label.prefix)}</b>${escapeHtml(label.id)}`
}

/** The error page of a request that cannot be served or redirected (a bad client id or redirect URI, an expired request). */
export const errorPage = (message) => document(fill(PAGE_TEXT.errorTitle), paragraph(fill(message), PAGE_ROLE.alert))

const input = (type, name, label, autocomplete, extra = '') =>
  `<label>${fill(label)} <input type="${type}" name="${name}" autocomplete="${autocomplete}"${extra}></label>`
const hidden = (name, value) => `<input type="${FORM_INPUT.hidden}" name="${name}" value="${escapeHtml(value)}">`
const button = (label, action, extra = '') => `<button type="submit" name="${FORM_FIELD.action}" value="${action}"${extra}>${fill(label)}</button>`

/**
 * The form of one pending request.
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
    messageHtml === undefined ? '' : paragraph(messageHtml, PAGE_ROLE.alert),
    paragraph(fill(PAGE_TEXT.client, { client: view.clientName, host: view.clientHost })),
    paragraph(fill(PAGE_TEXT.redirectHost, { host: view.redirectHost })),
    view.loopbackOnly ? paragraph(fill(PAGE_TEXT.localhostOnly), PAGE_ROLE.note) : '',
    paragraph(fill(PAGE_TEXT.dsh, { dsh: view.dshName, resource: view.resource })),
    paragraph(fill(PAGE_TEXT.rights)),
    paragraph(fill(PAGE_TEXT.oneAgent)),
    `<form method="post" action="${PATHS.decision}">`,
    hidden(FORM_FIELD.request, view.requestId),
    hidden(FORM_FIELD.nonce, view.nonce),
    input(FORM_INPUT.password, FORM_FIELD.token, PAGE_TEXT.tokenLabel, FORM_INPUT.autocompleteNewPassword, ' required'),
    input(FORM_INPUT.text, FORM_FIELD.id, PAGE_TEXT.idLabel, FORM_INPUT.autocompleteOff, ' required'),
    input(FORM_INPUT.text, FORM_FIELD.name, PAGE_TEXT.nameLabel, FORM_INPUT.autocompleteOff, ` placeholder="${escapeHtml(view.clientName)}"`),
    button(PAGE_TEXT.authorize, FORM_ACTION.authorize),
    button(PAGE_TEXT.cancel, FORM_ACTION.cancel, ' formnovalidate'),
    '</form>',
  ].join(''))
}
