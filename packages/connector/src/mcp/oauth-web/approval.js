/**
 * The approval listener's two routes (R-OA-11…15, R-OA-17, R-OA-20; design §5.5a steps 2–7; S7b):
 * `GET /authorize` validates the request and shows the token page; `POST /authorize/decision`
 * handles Authorize and Cancel. Every request first passes K1b `RequestGate.check` on the
 * `approval` surface (405 per path, 403 Host/Origin, 503 insecure listener); after it, a path the
 * surface does not list is 404.
 *
 * Pending requests live in memory only (R-OA-15: none survives a restart). A token value is read
 * from the POST body, matched, and dropped: it is never stored, logged, rendered or redirected.
 */
import {
  APPROVAL_LISTENER, GATE_SURFACE, HTTP_STATUS, ID_REFUSAL, LIFETIME, OAUTH_ERROR, PATHS, RATE_LIMITS, REFUSAL,
  RESPONSE_TYPE, TIME_UNIT, oauthUrls, principalLabel,
} from '../../../mcp-schema/index.js'
import { diagnosticOf } from '../../errors.js'
import { clientNameOf, isAllowedRedirect, isLoopbackOnly, redirectUrisOf } from './client-rules.js'
import {
  ADDRESS, AUTHORIZE_PARAM, CHAINS_STATE, FORM_ACTION, FORM_FIELD, FORM_LIMITS, LOG, PAGE_HTTP, PAGE_TEXT, RESPONSE_PARAM, STATE_CAPS,
  URL_RULES,
} from './constants.js'
import { SILENT_LOGGER, readCapped } from './io.js'
import { issuerOriginFor } from './origin.js'
import { errorPage, fill, formPage, principalHtml } from './page.js'
import { digestOf, isS256Challenge, mintOpaque, sameSecret } from './secrets.js'

/** The page's message for each refusal of `PairStore.bindFromPage`. */
const BIND_MESSAGE = Object.freeze({
  [REFUSAL.alreadyPaired]: PAGE_TEXT.alreadyPaired,
  [ID_REFUSAL.idInvalid]: PAGE_TEXT.idInvalid,
  [REFUSAL.idTaken]: PAGE_TEXT.idTaken,
  [REFUSAL.nameInvalid]: PAGE_TEXT.nameInvalid,
  [REFUSAL.nameTaken]: PAGE_TEXT.nameTaken,
})

// ---- responses ---------------------------------------------------------------------------------

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}
/** Every answer of the page's own routes carries the page headers (no-store, no-referrer, CSP; R-OA-11/12). */
const sendEmpty = (res, status, extra = {}) => send(res, status, { ...APPROVAL_LISTENER.headers, ...extra })
const sendHtml = (res, status, html, extra = {}) => send(res, status, { ...APPROVAL_LISTENER.headers, ...PAGE_HTTP.contentType, ...extra }, html)

/** A gate refusal exactly as the gate built it: its status and headers, a JSON body or none. */
const sendRefusal = (res, refusal) => send(res, refusal.status, refusal.headers, refusal.body === null ? undefined : JSON.stringify(refusal.body))

/**
 * The authorization response (R-OA-14, R-OA-15): always `iss`, `state` when the request sent one,
 * and a 303 (APPROVAL_LISTENER.redirectStatus: RFC 9700 §4.12 after the form POST; a 303 after the
 * GET is the same browser behaviour). It never carries a token value.
 */
function redirect(res, redirectUri, params, request) {
  const url = new URL(redirectUri)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  if (request.state !== undefined) url.searchParams.set(RESPONSE_PARAM.state, request.state)
  url.searchParams.set(RESPONSE_PARAM.iss, request.iss)
  sendEmpty(res, APPROVAL_LISTENER.redirectStatus, { [PAGE_HTTP.locationHeader]: url.href })
}

/** The form body up to FORM_LIMITS.maxBodyBytes; `undefined` once it is larger. */
async function readForm(req) {
  const text = await readCapped(req, FORM_LIMITS.maxBodyBytes)
  return text === undefined ? undefined : new URLSearchParams(text)
}

/**
 * The request target's path and query, split at the first `?` (RFC 9112 §3.2.1 origin-form). Not
 * parsed with `new URL`, which would read a target such as `//authorize` as a host.
 */
function target(req) {
  const at = req.url.indexOf(URL_RULES.querySeparator)
  return at < 0 ? { path: req.url, query: new URLSearchParams() } : { path: req.url.slice(0, at), query: new URLSearchParams(req.url.slice(at + 1)) }
}

/** One query parameter: its value, `undefined` when absent, or REPEATED [spec: RFC 6749 §3.1, parameters MUST NOT repeat]. */
const REPEATED = Symbol('repeated')
function single(query, name) {
  const values = query.getAll(name)
  return values.length > 1 ? REPEATED : values[0]
}

const lastSeenText = (lastSeenAt) => (lastSeenAt === null ? PAGE_TEXT.neverSeen : new Date(lastSeenAt).toISOString())

/** R-OA-12 (2): `already-paired` with the bound pair's name and last-seen time (the token was verified). */
const alreadyPairedHtml = (pair) => `${fill(PAGE_TEXT.alreadyPaired)} ${
  fill(PAGE_TEXT.boundTo, { lastSeen: lastSeenText(pair.lastSeenAt) }, { name: principalHtml(principalLabel(pair.name, pair.id)) })}`

/**
 * @param deps.gate K1b `RequestGate` (C-HTTP's one instance)
 * @param deps.originOf C-OAUTH's `originOf(req, {secure})`: the checked origin as dialled, or undefined
 * @param deps.secure whether the approval listener speaks https (C-WIRE's `createServer` choice)
 * @param deps.cimd the CIMD fetcher (`./cimd.js`)
 * @param deps.tokens K1 `TokenRegistry`; `deps.pairs` K1 `PairStore`; `deps.store` K1 `OAuthTokenStore`
 * @param deps.limiter K1a `FailureLimiter`, the one the token endpoint shares (R-OA-17)
 * @param deps.dshName this DSH's name shown on the page (C-WIRE supplies it)
 * @param deps.dshPort `() => number`, DSH's own listener port; `deps.approvalPort` `() => number`, this listener's
 * @param deps.now `() => epoch ms`; `deps.logger` `{warn}`
 * @returns `(req, res) => Promise<void>`, a node:http request handler; it never rejects
 */
export function createApprovalHandler(deps) {
  const { gate, originOf, secure, cimd, tokens, pairs, store, limiter, dshName, dshPort, approvalPort, now, logger = SILENT_LOGGER } = deps
  /**
   * Pending requests by id, in creation order (a Map's), so the oldest is first. Bounded by
   * STATE_CAPS.pendingRequests: at the cap the oldest is evicted (it then reads as expired), and
   * expired ones are dropped from the front as new ones arrive.
   */
  const pending = new Map()

  const isExpired = (request, at) => at >= request.createdAt + LIFETIME.pendingRequestMs
  function remember(request) {
    for (const [id, held] of pending) {
      if (!isExpired(held, request.createdAt) && pending.size < STATE_CAPS.pendingRequests) break
      pending.delete(id)
    }
    pending.set(request.id, request)
  }

  /** Renders the form of `request` with a fresh single-use nonce (R-OA-17), so an older form is refused. */
  function showForm(res, request, messageHtml, status = HTTP_STATUS.ok, extra = {}) {
    request.nonce = mintOpaque()
    sendHtml(res, status, formPage({
      clientName: clientNameOf(request.doc),
      clientHost: new URL(request.clientId).host,
      redirectHost: new URL(request.redirectUri).hostname,
      loopbackOnly: isLoopbackOnly(redirectUrisOf(request.doc)),
      dshName,
      resource: request.resource,
      requestId: request.id,
      nonce: request.nonce,
    }, messageHtml), extra)
  }

  async function authorize(query, res, origin) {
    const at = now()
    // The origin passed C-OAUTH's `originOf`; one this rule cannot split into scheme, host and port
    // could only yield a broken `iss`, so it is refused before anything is fetched or redirected.
    const issuerOrigin = issuerOriginFor(origin, approvalPort(), dshPort())
    if (issuerOrigin === undefined) return sendEmpty(res, HTTP_STATUS.badRequest)
    const clientId = single(query, AUTHORIZE_PARAM.clientId)
    // R-OA-14: a bad client id or redirect URI is shown on the page and never redirected.
    const fetched = typeof clientId === 'string' ? await cimd.fetch(clientId) : { ok: false }
    if (!fetched.ok) return sendHtml(res, HTTP_STATUS.badRequest, errorPage(PAGE_TEXT.badClient))
    const redirectUri = single(query, AUTHORIZE_PARAM.redirectUri)
    if (!isAllowedRedirect(redirectUri, redirectUrisOf(fetched.doc))) return sendHtml(res, HTTP_STATUS.badRequest, errorPage(PAGE_TEXT.badRedirect))
    const urls = oauthUrls(issuerOrigin)
    const state = single(query, AUTHORIZE_PARAM.state)
    // A repeated `state` cannot be echoed unchanged, so its error goes without one.
    const request = { iss: urls.issuer, state: state === REPEATED ? undefined : state }
    const fail = (error) => redirect(res, redirectUri, { [RESPONSE_PARAM.error]: error }, request)
    const params = Object.values(AUTHORIZE_PARAM).map((name) => single(query, name))
    if (params.includes(REPEATED)) return fail(OAUTH_ERROR.invalidRequest)
    if (single(query, AUTHORIZE_PARAM.responseType) !== RESPONSE_TYPE.code) return fail(OAUTH_ERROR.unsupportedResponseType)
    const challenge = single(query, AUTHORIZE_PARAM.codeChallenge)
    if (!isS256Challenge(single(query, AUTHORIZE_PARAM.codeChallengeMethod), challenge)) return fail(OAUTH_ERROR.invalidRequest)
    if (single(query, AUTHORIZE_PARAM.resource) !== urls.resource) return fail(OAUTH_ERROR.invalidTarget)
    // `scope` is ignored: the grant's scope follows the pair (S7b §4, RFC 6749 §3.3).
    const created = { ...request, id: mintOpaque(), clientId, doc: fetched.doc, redirectUri, challenge, resource: urls.resource, createdAt: at }
    remember(created)
    showForm(res, created)
  }

  /** Mints the code of a bound or renewed pair and sends the browser back with it (R-OA-14). */
  function issueCode(res, request, entryKey, at) {
    const code = mintOpaque()
    store.putCode(digestOf(code), {
      entryKey, clientId: request.clientId, redirectUri: request.redirectUri, codeChallenge: request.challenge, audience: request.resource, issuedAt: at,
    })
    pending.delete(request.id)
    redirect(res, request.redirectUri, { [RESPONSE_PARAM.code]: code }, request)
  }

  /**
   * A valid token whose entry is bound: the renewal of R-OA-16 (7) when every chain of the entry
   * ended at the entry's current generation (`chainsOf` = `ended`: a disable, re-enable or value
   * change since makes the chains `revoked`), and the request comes from the client recorded at the
   * bind with the bound id. `renewFromPage` checks the client and id again inside its write, and the
   * redirect URI is any the document allows (already checked at `/authorize`). Otherwise
   * `already-paired`.
   */
  async function boundEntry(res, request, entry, pair, id, at) {
    const renewable = pair.clientIdUrl === request.clientId && pair.id === id
      && store.chainsOf(entry.entryKey, entry.generation, at) === CHAINS_STATE.ended
    const renewed = renewable ? await pairs.renewFromPage(entry.entryKey, id, { clientIdUrl: request.clientId, redirectUri: request.redirectUri }) : undefined
    if (renewed?.ok) return issueCode(res, request, entry.entryKey, at)
    return showForm(res, request, alreadyPairedHtml(pairs.pairOf(entry.entryKey) ?? pair))
  }

  async function authorizeDecision(res, request, form, failureKey, at) {
    const limit = limiter.check(failureKey, at)
    if (limit.limited) {
      const retryAfter = String(Math.ceil(limit.retryAfterMs / TIME_UNIT.msPerSecond))
      return showForm(res, request, fill(PAGE_TEXT.rateLimited), HTTP_STATUS.tooManyRequests, { [RATE_LIMITS.retryAfterHeader]: retryAfter })
    }
    const value = form.get(FORM_FIELD.token) ?? ''
    // AUTH-DT-08 rule 10: an empty field is not a credential, so it is not counted.
    if (value === '') return showForm(res, request, fill(PAGE_TEXT.enterToken))
    // Rules 1–4: an unknown, disabled, deleted or too-short value has one answer (match covers
    // only enabled, usable entries), counted toward the per-client limit shared with the token endpoint.
    const entry = tokens.match(value)
    if (entry === undefined) {
      limiter.recordFailure(failureKey, at)
      return showForm(res, request, fill(PAGE_TEXT.invalidToken))
    }
    const id = form.get(FORM_FIELD.id) ?? ''
    const pair = pairs.pairOf(entry.entryKey)
    if (pair !== undefined) return boundEntry(res, request, entry, pair, id, at)
    const bound = await pairs.bindFromPage(entry.entryKey, id, form.get(FORM_FIELD.name) ?? undefined,
      { clientIdUrl: request.clientId, redirectUri: request.redirectUri }, at)
    if (bound.ok) return issueCode(res, request, entry.entryKey, at)
    // A concurrent bind of this entry since `pairOf` answers `already-paired`, shown with its pair.
    const raced = bound.code === REFUSAL.alreadyPaired ? pairs.pairOf(entry.entryKey) : undefined
    return showForm(res, request, raced === undefined ? fill(BIND_MESSAGE[bound.code]) : alreadyPairedHtml(raced))
  }

  async function decision(req, res) {
    // A browser's cross-site POST is refused like a foreign Origin (R-OA-17; S7b).
    if (req.headers[PAGE_HTTP.fetchSiteHeader] === PAGE_HTTP.crossSite) return sendEmpty(res, HTTP_STATUS.forbidden)
    const form = await readForm(req)
    if (form === undefined) return sendEmpty(res, HTTP_STATUS.payloadTooLarge)
    const at = now()
    const request = pending.get(form.get(FORM_FIELD.request) ?? '')
    if (request === undefined) return sendHtml(res, HTTP_STATUS.badRequest, errorPage(PAGE_TEXT.expired))
    // R-OA-17: the single-use form value bound to this request; a stale or forged one is refused.
    if (!sameSecret(form.get(FORM_FIELD.nonce) ?? '', request.nonce)) return sendEmpty(res, HTTP_STATUS.forbidden)
    // Used up before any await, so a concurrent POST of the same form is refused above: one form
    // value admits one decision (R-OA-17). Every outcome that keeps the request pending re-renders
    // it with a fresh value; a request whose decision failed (500) stays unusable until it expires.
    request.nonce = undefined
    // AUTH-BVA-07 rows 4–6: expired at exactly LIFETIME.pendingRequestMs.
    if (isExpired(request, at)) {
      pending.delete(request.id)
      return sendHtml(res, HTTP_STATUS.badRequest, errorPage(PAGE_TEXT.expired))
    }
    if (form.get(FORM_FIELD.action) === FORM_ACTION.cancel) {
      pending.delete(request.id)
      return redirect(res, request.redirectUri, { [RESPONSE_PARAM.error]: OAUTH_ERROR.accessDenied }, request)
    }
    // The page's FailureLimiter key (K1a): the address and the CIMD URL, never token material.
    const failureKey = Object.freeze({ remoteAddress: req.socket?.remoteAddress ?? ADDRESS.unknown, clientId: request.clientId })
    return authorizeDecision(res, request, form, failureKey, at)
  }

  return async function handle(req, res) {
    try {
      const { path, query } = target(req)
      const checked = gate.check({ method: req.method, path, headers: req.headers }, GATE_SURFACE.approval)
      if (!checked.pass) return sendRefusal(res, checked)
      if (path !== PATHS.authorize && path !== PATHS.decision) return sendEmpty(res, HTTP_STATUS.notFound)
      const origin = originOf(req, { secure })
      if (origin === undefined) return sendEmpty(res, HTTP_STATUS.badRequest)
      return await (path === PATHS.authorize ? authorize(query, res, origin) : decision(req, res))
    } catch (error) {
      logger.warn(LOG.format, LOG.handlerFailed, diagnosticOf(error))
      if (!res.headersSent) sendEmpty(res, HTTP_STATUS.internalServerError)
      else res.destroy()
    }
  }
}
