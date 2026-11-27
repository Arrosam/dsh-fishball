/**
 * A scripted browser for the approval page: it opens the authorization URL as a top-level navigation,
 * reads the form, submits it the way the page's own form would (same-origin POST, urlencoded body),
 * and returns the redirect it lands on, without following it. Throwaway spike code.
 */
const NAV_HEADERS = Object.freeze({ 'sec-fetch-site': 'none', 'sec-fetch-mode': 'navigate', accept: 'text/html' })

const hidden = (html, field) => new RegExp(`name="${field}" value="([^"]*)"`).exec(html)?.[1]
const alertOf = (html) => /<p role="alert">([^<]*)<\/p>/.exec(html)?.[1]?.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))

/** Open the page. Returns {status, headers, html, request, form, alert}. */
export async function openPage(authorizationUrl, { fetchFn = fetch } = {}) {
  const res = await fetchFn(authorizationUrl, { headers: NAV_HEADERS, redirect: 'manual' })
  const html = await res.text()
  return { status: res.status, headers: Object.fromEntries(res.headers), location: res.headers.get('location'), html,
    request: hidden(html, 'request'), form: hidden(html, 'form'), alert: alertOf(html), url: String(authorizationUrl) }
}

/** Submit the page's form. Origin is the page's own origin unless a probe overrides it. */
export async function submit(pageState, fields, { origin = new URL(pageState.url).origin, extraHeaders = {}, fetchFn = fetch } = {}) {
  const action = new URL('/authorize/decision', pageState.url)
  const body = new URLSearchParams({ request: pageState.request, form: pageState.form, ...fields })
  const headers = { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'navigate', ...extraHeaders }
  if (origin !== null) headers.origin = origin
  const res = await fetchFn(action, { method: 'POST', headers, body, redirect: 'manual' })
  const html = await res.text()
  return { status: res.status, headers: Object.fromEntries(res.headers), location: res.headers.get('location'), html,
    request: hidden(html, 'request') ?? pageState.request, form: hidden(html, 'form'), alert: alertOf(html), url: pageState.url }
}

/** Open, then authorize with {token, id, name}. Returns the final submit result (redirect or page). */
export async function approve(authorizationUrl, fields, options) {
  const opened = await openPage(authorizationUrl, options)
  if (opened.form === undefined) return opened
  return submit(opened, { action: 'authorize', ...fields }, options)
}

export const callbackParams = (location) => Object.fromEntries(new URL(location).searchParams)
