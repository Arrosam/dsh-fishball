/**
 * UI-POLISH-D rows of the approval page (the requirements relayed 2026-11-18; constants.mjs POLISH).
 * The restyle changed only the page's look: one hashed inline `<style>`, a card with a brand line,
 * the facts, warnings and controls in their own blocks. Behaviour, escaping and headers are as
 * before, except the CSP, which the user changed that day to admit that one style block by hash.
 *
 * Techniques:
 * - EP over the page's responses (form page, error page, form re-render with an alert, an empty
 *   413, the 303 after Cancel): each carries exactly the CSP shape and the unchanged headers;
 * - Decision table for the hash: CSP hash = base64(SHA-256(UTF-8 of the `<style>` text)) on the
 *   form page and the error page, and both pages serve the same block;
 * - EP over the client's redirects (loopback only → the `role="note"` warning; one non-loopback
 *   redirect → none) and over the alert variants (an error page, a refused token);
 * - markup in the client name (escaped in the title, the facts and the placeholder).
 *
 * Level: integration over the fakes of webWorld (subject.mjs), the page read as served HTML.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { assertPageShown, open, row } from './cases.mjs'
import { attributes, decode, fields, forms, pageText } from './browser.mjs'
import { APPROVAL_LISTENER, DOC, FIXTURE, HTTP_STATUS, PAGE_TEXT, PARAM, POLISH, RELAYED } from './constants.mjs'
import { documentOf } from './subject.mjs'

const V = FIXTURE.value
const ID = POLISH.id

/** Every element `<tag …>` of `html` as `{attrs, index, open}`, in document order. */
const elements = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'gi'))].map((m) => ({ attrs: attributes(m[1]), index: m.index, open: m[0] }))
/** The class list of an element. */
const classes = (el) => (el.attrs.class ?? '').split(/\s+/).filter(Boolean)
const withClass = (html, tag, cls) => elements(html, tag).filter((el) => classes(el).includes(cls))
/** The inner HTML of the first `<tag class="cls">…</tag>` (no element of the same tag nested inside). */
function innerOf(html, tag, cls) {
  const [el] = withClass(html, tag, cls)
  assert.ok(el, `no <${tag} class="${cls}">`)
  const start = el.index + el.open.length
  return { start, end: html.indexOf(`</${tag}>`, start), inner: html.slice(start, html.indexOf(`</${tag}>`, start)) }
}
/** The text of every `<style>` element. */
const styles = (html) => [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])
/** base64(SHA-256(UTF-8 of `text`)): the CSP's `sha256-` source of an inline block. */
const hashOf = (text) => createHash(POLISH.hashAlgorithm).update(text, 'utf8').digest(POLISH.hashEncoding)

/** The CSP of a response matches the exact shape; returns its one hash. */
function cspHash(res, what) {
  const csp = res.headers[POLISH.cspHeader]
  assert.equal(typeof csp, 'string', `${what}: no ${POLISH.cspHeader}`)
  const m = POLISH.cspShape.exec(csp)
  assert.ok(m, `${what}: CSP is not exactly default-src 'none'; style-src 'sha256-…'; frame-ancestors 'none': ${csp}`)
  assert.equal(m[1].length, POLISH.hashChars, `${what}: not a SHA-256 hash`)
  assert.ok(!csp.includes(POLISH.unsafeInline), `${what}: 'unsafe-inline'`)
  for (const [name, value] of Object.entries(POLISH.unchanged)) assert.equal(res.headers[name], value, `${what}: ${name}`)
  return m[1]
}
/** A page: one `<style>` whose hash is the CSP's; no style attribute, script or link. */
function assertHashedPage(res, what) {
  const hash = cspHash(res, what)
  const blocks = styles(res.body)
  assert.equal(blocks.length, 1, `${what}: <style> elements`)
  assert.equal(hashOf(blocks[0]), hash, `${what}: the CSP hash is not base64(SHA-256) of the served <style> text`)
  assert.doesNotMatch(res.body, /<[a-z][^>]*\sstyle\s*=/i, `${what}: a style= attribute`)
  assert.doesNotMatch(res.body, /<script\b/i, `${what}: a <script>`)
  assert.doesNotMatch(res.body, /<link\b/i, `${what}: a <link>`)
  return blocks[0]
}
/** An error page: a redirect URI the client never registered (shown on the page, never redirected). */
const errorPage = async (w) => (await open(w, { overrides: { [PARAM.redirectUri]: FIXTURE.redirectForeign } })).page
/** The one alert paragraph `<p class="alert" role="alert">` of a page, and its text. */
function alertOf(html) {
  const alerts = elements(html, 'p').filter((p) => p.attrs.role === POLISH.role.alert)
  assert.equal(alerts.length, 1, 'role=alert paragraphs')
  assert.ok(classes(alerts[0]).includes(POLISH.cls.alert), 'the alert is not class="alert"')
  return pageText(html.slice(alerts[0].index, html.indexOf('</p>', alerts[0].index)))
}

export function registerPolishWebCases(sdk) {
  // ---------------------------------------------------------------- the CSP (EP over responses, DT for the hash)
  row(sdk, ID.csp, 'K1', 'APPROVAL_LISTENER.headers CSP is exactly default-src \'none\'; style-src \'sha256-X\'; frame-ancestors \'none\'; cache-control and referrer-policy unchanged', () => {
    assert.match(APPROVAL_LISTENER.headers[POLISH.cspHeader], POLISH.cspShape)
    for (const [name, value] of Object.entries(POLISH.unchanged)) assert.equal(APPROVAL_LISTENER.headers[name], value, name)
  })
  row(sdk, ID.csp, 'form page', 'the form page: the exact CSP; X = base64(SHA-256) of its one <style>; no style=, <script>, <link>, \'unsafe-inline\'', async (w) => {
    const { page } = await open(w)
    assertPageShown(page)
    assertHashedPage(page, 'form page')
  })
  row(sdk, ID.csp, 'error page', 'the error page: the exact CSP; X = base64(SHA-256) of its one <style>, the same block as the form page\'s', async (w) => {
    const error = await errorPage(w)
    assert.ok(error.status >= HTTP_STATUS.badRequest, 'not an error page: ' + error.status)
    const errorStyle = assertHashedPage(error, 'error page')
    const formStyle = assertHashedPage((await open(w)).page, 'form page')
    assert.equal(errorStyle, formStyle, 'the two pages serve different style blocks')
    assert.equal(cspHash(error, 'error page'), hashOf(formStyle))
  })
  row(sdk, ID.csp, 're-render', 'the form re-rendered with an alert (a wrong token): the exact CSP and the same hashed block', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const res = await flow.b.authorize({ token: V(1) })
    assert.equal(hashOf(assertHashedPage(res, 're-render')), cspHash(flow.page, 'form page'))
  })
  row(sdk, ID.csp, 'empty', `an empty answer (a decision body over ${RELAYED.decisionBodyBytes} bytes → 413, no body) carries the exact CSP and the unchanged headers`, async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const captured = flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) })
    const res = await flow.b.post({ ...captured, body: captured.body + '&' + PARAM.state + 'x=' + 'p'.repeat(RELAYED.decisionBodyBytes) })
    assert.equal(res.status, HTTP_STATUS.payloadTooLarge)
    assert.equal(res.body, '')
    assert.equal(cspHash(res, '413'), cspHash(flow.page, 'form page'))
  })
  row(sdk, ID.csp, 'redirect', 'the 303 after Cancel carries the exact CSP and the unchanged headers', async (w) => {
    const flow = await open(w)
    const res = await flow.b.cancel()
    assert.equal(res.status, APPROVAL_LISTENER.redirectStatus)
    assert.equal(cspHash(res, '303'), cspHash(flow.page, 'form page'))
  })

  // ---------------------------------------------------------------- the markup (EP)
  row(sdk, ID.markup, 'head', 'the head: viewport and color-scheme metas, one <style>; the body is <main class="card"> with the brand line "Fishball connector" above the <h1>, beside an aria-hidden mark', async (w) => {
    const { page } = await open(w)
    const head = page.body.slice(0, page.body.indexOf('</head>'))
    const metas = elements(head, 'meta')
    assert.ok(metas.some((m) => m.attrs.name === 'viewport' && m.attrs.content === POLISH.viewport), 'no viewport meta')
    assert.ok(metas.some((m) => m.attrs.name === 'color-scheme' && m.attrs.content === POLISH.colorScheme), 'no color-scheme meta')
    assert.equal(styles(head).length, 1, 'the <style> is not in the head')
    assert.equal(withClass(page.body, 'main', POLISH.cls.card).length, 1, 'no <main class="card">')
    const [eyebrow] = withClass(page.body, 'p', POLISH.cls.eyebrow)
    assert.ok(eyebrow, 'no <p class="eyebrow">')
    assert.equal(pageText(page.body.slice(eyebrow.index, page.body.indexOf('</p>', eyebrow.index))), POLISH.brand)
    assert.ok(eyebrow.index < page.body.indexOf('<h1'), 'the brand line is not above the title')
    const [mark] = withClass(page.body, 'span', POLISH.cls.mark)
    assert.ok(mark && mark.attrs['aria-hidden'] === 'true', 'no decorative <span class="mark" aria-hidden="true">')
    assert.match(page.body.slice(mark.index + mark.open.length), /^<svg\b/, 'the mark holds no <svg>')
  })
  row(sdk, ID.markup, 'facts', 'facts in <div class="facts">: Client, Redirect host, then DSH; the localhost note after them; rights and one-agent in <div class="terms">', async (w) => {
    const { page } = await open(w)
    const facts = innerOf(page.body, 'div', POLISH.cls.facts)
    const lines = [...facts.inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => pageText(m[1]))
    assert.equal(lines.length, POLISH.facts.length, 'fact lines: ' + JSON.stringify(lines))
    POLISH.facts.forEach((shape, i) => assert.match(lines[i], shape, 'fact ' + (i + 1)))
    const [note] = elements(page.body, 'p').filter((p) => p.attrs.role === POLISH.role.note)
    assert.ok(note, 'no role=note for a loopback-only client')
    assert.ok(classes(note).includes(POLISH.cls.note))
    const terms = innerOf(page.body, 'div', POLISH.cls.terms)
    assert.ok(facts.end < note.index && note.index < terms.start, 'the note is not between the facts and the terms')
    const text = pageText(terms.inner).toLowerCase()
    for (const words of [PAGE_TEXT.fullRights, PAGE_TEXT.oneAgent]) assert.ok(text.includes(words), 'terms lack ' + words)
  })
  row(sdk, ID.markup, 'note (EP)', 'a client with a non-loopback redirect too → no role=note; the facts are the same three lines', async (w) => {
    w.cimd.document(FIXTURE.clientId, documentOf(FIXTURE.clientId, [FIXTURE.redirect, FIXTURE.httpsRedirect]))
    const { page } = await open(w)
    assertPageShown(page)
    assert.deepEqual(elements(page.body, 'p').filter((p) => p.attrs.role === POLISH.role.note), [], 'a localhost note for a client that is not loopback only')
    assert.equal([...innerOf(page.body, 'div', POLISH.cls.facts).inner.matchAll(/<p\b/gi)].length, POLISH.facts.length)
  })
  row(sdk, ID.markup, 'controls', 'the form: labels class="field"; in <div class="actions"> Authorize is the first submit button (class primary), Cancel second (class secondary, formnovalidate)', async (w) => {
    const { page } = await open(w)
    const [form] = forms(page.body).filter((f) => fields(f).token !== undefined)
    assert.ok(form.buttons.length >= 2, 'submit buttons: ' + form.buttons.length)
    const [first, second] = form.buttons
    assert.match(first.label, PAGE_TEXT.authorize, 'the first submit button is not Authorize')
    assert.match(second.label, PAGE_TEXT.cancel)
    assert.ok(classes({ attrs: first }).includes(POLISH.cls.primary), 'Authorize is not class primary')
    assert.ok(classes({ attrs: second }).includes(POLISH.cls.secondary), 'Cancel is not class secondary')
    assert.ok(Object.hasOwn(second, 'formnovalidate'), 'Cancel lost formnovalidate')
    const actions = innerOf(page.body, 'div', POLISH.cls.actions)
    assert.equal([...actions.inner.matchAll(/<button\b/gi)].length, 2, 'both buttons in <div class="actions">')
    const labels = elements(page.body, 'label')
    assert.ok(labels.length >= 2 && labels.every((l) => classes(l).includes(POLISH.cls.field)), 'a label without class="field"')
  })
  row(sdk, ID.markup, 'alert (error page)', 'the error page\'s message is <p class="alert" role="alert">', async (w) => {
    const error = await errorPage(w)
    assert.ok(alertOf(error.body).length > 0)
  })
  row(sdk, ID.markup, 'alert (form)', 'a wrong token re-renders the form with <p class="alert" role="alert"> saying "this token is not valid"', async (w) => {
    w.tokens.add(5, V(5))
    const flow = await open(w)
    const res = await flow.b.authorize({ token: V(1) })
    assert.ok(alertOf(res.body).toLowerCase().includes(PAGE_TEXT.invalid))
    assert.deepEqual(elements((await open(w)).page.body, 'p').filter((p) => p.attrs.role === POLISH.role.alert), [], 'an alert on a fresh page')
  })
  row(sdk, ID.markup, 'escaping', 'a client_name with markup is escaped in the title, the <h1>, the Client fact and the name placeholder; no element is made of it', async (w) => {
    w.cimd.document(FIXTURE.clientId, documentOf(FIXTURE.clientId, [FIXTURE.redirect], { [DOC.clientName]: POLISH.markupName }))
    const { page } = await open(w)
    assertPageShown(page)
    assert.ok(!page.body.includes(POLISH.markupName), 'the raw name is in the page')
    assert.doesNotMatch(page.body, /<script\b|<b>/i, 'the name made an element')
    const title = decode(/<title>([\s\S]*?)<\/title>/i.exec(page.body)[1])
    const h1 = pageText(/<h1>([\s\S]*?)<\/h1>/i.exec(page.body)[1])
    for (const [where, text] of [['title', title], ['h1', h1]]) assert.ok(text.includes(POLISH.markupName), `${where} does not show the name as text: ${text}`)
    const client = [...innerOf(page.body, 'div', POLISH.cls.facts).inner.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => decode(m[1]))[0]
    assert.ok(client.includes(POLISH.markupName), 'the Client fact does not show the name as text: ' + client)
    const [form] = forms(page.body).filter((f) => fields(f).token !== undefined)
    assert.equal(fields(form).name.placeholder, POLISH.markupName, 'the placeholder is not the name, escaped')
  })
}

