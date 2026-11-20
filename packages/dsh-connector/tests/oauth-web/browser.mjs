/**
 * A scripted browser for the approval page (AUTH-UC-10 "integration (flow with a scripted
 * browser)"): it dials a loopback listener with the `Host` a real browser would send, keeps
 * cookies, reads the server-rendered page and submits its form the way a user would. It knows only
 * HTML, not the page's field names: the token field is the one masked input (R-OA-11), the name
 * field the text input (R-OA-11 as amended by 1.32 R13: the page has no id field; the agent passes
 * its id in the authorization request, R-OA-22); Authorize and Cancel are found by their labels. Every response is kept, so a case can grep all of them for a token value.
 */
import http from 'node:http'
import { FORM_TYPE, HTML_FORM, HTTP_HEADER, HTTP_METHOD, PAGE_TEXT } from './constants.mjs'

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })
export const decode = (text) => text
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)

/** The attributes of one tag's source (after its name): names lower-cased, values decoded. */
export function attributes(source) {
  const attrs = {}
  for (const m of source.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
    attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return attrs
}
const has = (attrs, name) => Object.hasOwn(attrs, name)

/** The page's text as a user reads it: tags removed, entities decoded, whitespace collapsed. */
export const pageText = (html) => decode(html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

/**
 * A page with its per-render values masked (Fishball, 2026-11-14: every render carries a fresh form
 * nonce): each hidden input's value and any `nonce` attribute become one placeholder, so two
 * renders compare equal exactly when everything a user can see or submit is equal.
 */
export const masked = (html) => html
  .replace(/<input\b[^>]*>/gi, (tag) => (attributes(tag.slice(6)).type === HTML_FORM.hidden ? tag.replace(/(\bvalue\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/i, '$1"*"') : tag))
  .replace(/(\bnonce\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/gi, '$1"*"')

/** Every form of a page: action, method, inputs and submit controls. */
export function forms(html) {
  return [...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map(([, open, inner]) => {
    const attrs = attributes(open)
    const inputs = [...inner.matchAll(/<input\b([^>]*)>/gi)].map((m) => attributes(m[1]))
    const buttons = [
      ...[...inner.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)].map(([, a, label]) => ({ ...attributes(a), label: pageText(label) })),
      ...inputs.filter((i) => i.type === HTML_FORM.submit).map((i) => ({ ...i, label: i.value ?? '' })),
    ]
    return { action: attrs.action ?? '', method: (attrs.method ?? HTTP_METHOD.get).toUpperCase(), inputs, buttons }
  })
}

const textInput = (i) => i.type === undefined || i.type === '' || i.type === HTML_FORM.text
/**
 * The page's fields by role (R-OA-11, 1.32 R13): token (masked) and name (optional). `texts` are
 * every text input, so a case can show there is no other (no id field).
 */
export function fields(form) {
  const token = form.inputs.find((i) => i.type === HTML_FORM.password)
  const texts = form.inputs.filter(textInput)
  return { token, name: texts[0], texts, passwords: form.inputs.filter((i) => i.type === HTML_FORM.password) }
}
/** Whether an input is marked required (an HTML boolean attribute). */
export const isRequired = (input) => has(input, 'required')

function request({ port, method, path, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

/**
 * One browser profile against one approval listener. `host` is the `Host` it sends (what the user
 * dialled); `scheme` builds the `Origin` it sends on a form POST (its own origin, as browsers do).
 */
export class Browser {
  constructor({ port, host, scheme }) {
    this.port = port
    this.host = host
    this.origin = `${scheme}//${host}`
    this.cookies = new Map()
    this.responses = []
    this.page = null
  }

  async send(method, path, { body, origin, headers = {} } = {}) {
    const all = { [HTTP_HEADER.host]: this.host, ...headers }
    if (this.cookies.size > 0) all.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
    if (origin !== undefined) all[HTTP_HEADER.origin] = origin
    if (body !== undefined) all[HTTP_HEADER.contentType] = FORM_TYPE
    const res = await request({ port: this.port, method, path, headers: all, body })
    for (const line of [res.headers['set-cookie'] ?? []].flat()) {
      const [pair] = line.split(';')
      const at = pair.indexOf('=')
      if (at > 0) this.cookies.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim())
    }
    this.responses.push({ method, path, ...res })
    if (res.headers[HTTP_HEADER.location] === undefined && res.body.length > 0) this.page = res
    return res
  }

  /** Opens `<approval origin><path>?<params>` as a top-level navigation (no Origin header). */
  open(path, params) {
    const query = params === undefined ? '' : '?' + new URLSearchParams(params).toString()
    return this.send(HTTP_METHOD.get, path + query)
  }

  /** The current page's form holding the control labelled `label`, and that control. */
  control(label, page = this.page) {
    for (const form of forms(page?.body ?? '')) {
      const button = form.buttons.find((b) => label.test(b.label) || label.test(b.value ?? ''))
      if (button) return { form, button }
    }
    return undefined
  }

  /** The form body a submit of `label` sends, with `fill` by role (`token`, `name`). */
  formBody(label, fill = {}, page = this.page) {
    const found = this.control(label, page)
    if (!found) throw new Error(`no ${label} control on the page: ${pageText(page?.body ?? '')}`)
    const { form, button } = found
    const { token, name } = fields(form)
    const roles = { token, name }
    const body = new URLSearchParams()
    for (const input of form.inputs) {
      if (input.name === undefined || input.type === HTML_FORM.submit) continue
      const role = Object.entries(roles).find(([, i]) => i === input)?.[0]
      body.append(input.name, role !== undefined && fill[role] !== undefined ? fill[role] : input.value ?? '')
    }
    if (button.name !== undefined) body.append(button.name, button.value ?? '')
    return { action: form.action, body: body.toString() }
  }

  /** Submits the page's form with `label` (Authorize or Cancel) from the page's own origin. */
  async submit(label, fill, { origin = this.origin, page, headers } = {}) {
    return this.post(this.formBody(label, fill, page), { origin, headers })
  }

  /** POSTs a captured form (`formBody`'s result) to its action, as a browser would. */
  post({ action, body }, { origin = this.origin, headers } = {}) {
    return this.send(HTTP_METHOD.post, new URL(action, this.origin + '/').pathname, { body, origin, headers })
  }

  authorize(fill, options) { return this.submit(PAGE_TEXT.authorize, fill, options) }
  cancel(options) { return this.submit(PAGE_TEXT.cancel, {}, options) }
}
