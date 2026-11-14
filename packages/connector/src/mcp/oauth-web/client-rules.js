/**
 * Pure rules of a browser client's identity and redirects (R-OA-13, R-OA-14; [spec] CIMD draft §3,
 * §4.1, §4.5; OAuth 2.1 §2.3.1, §8.4.2; MCP Security § Communication Security). No I/O.
 */
import { CIMD_LIMITS, CLIENT_AUTH, HOSTS } from '../../../mcp-schema/index.js'
import { CIMD_HTTP, CIMD_REFUSAL, URL_RULES } from './constants.js'

const parse = (value) => {
  if (typeof value !== 'string') return undefined
  try { return new URL(value) } catch { return undefined }
}

/**
 * No fragment and no userinfo. WHATWG drops an empty fragment (`…/cb#`) from `hash`, so the raw
 * text is checked for the separator too.
 */
const isPlain = (value, url) => url.hash === '' && !value.includes(URL_RULES.fragment) && url.username === '' && url.password === ''

/** Loopback host names of a URL: `localhost`, `[::1]` and the whole 127.0.0.0/8 (WHATWG keeps IPv6 brackets). */
export const isLoopbackHostname = (hostname) => HOSTS.loopbackNames.includes(hostname) || URL_RULES.ipv4Loopback.test(hostname)

/**
 * Whether `value` is a usable client id URL (R-OA-13): `https:`, a path other than `/`, no fragment
 * and no userinfo, and it survives WHATWG parsing unchanged (so no dot segment, no default port and
 * no other non-canonical spelling: the document's `client_id` is then compared by plain string
 * equality, CIMD draft §3).
 */
export function isClientIdUrl(value) {
  const url = parse(value)
  return url !== undefined && url.protocol === CIMD_LIMITS.scheme && url.pathname !== URL_RULES.rootPath
    && isPlain(value, url) && url.href === value
}

/** A registered redirect must be `https:` or loopback `http:`, with no fragment (R-OA-14). */
function isRegistrableRedirect(value) {
  const url = parse(value)
  if (url === undefined || !isPlain(value, url)) return false
  return url.protocol === HOSTS.remoteScheme || (url.protocol === HOSTS.loopbackScheme && isLoopbackHostname(url.hostname))
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * Checks a fetched document against its client id (R-OA-13, AUTH-DT-07 rules 3, 9, 10).
 * @returns `undefined` when usable, else a CIMD_REFUSAL code
 */
export function documentProblem(doc, clientId) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return CIMD_REFUSAL.documentInvalid
  if (doc[CIMD_HTTP.clientIdField] !== clientId) return CIMD_REFUSAL.clientIdMismatch
  if (!isNonEmptyString(clientNameOf(doc))) return CIMD_REFUSAL.clientNameMissing
  const redirects = redirectUrisOf(doc)
  if (!Array.isArray(redirects) || redirects.length === 0 || !redirects.every(isRegistrableRedirect)) return CIMD_REFUSAL.redirectUrisInvalid
  // Browser clients are public (CIMD draft §4.1): no secret field, and no auth method but `none`
  // (Fishball 2026-11-14, item 7: any other method, private_key_jwt included, is refused, because
  // the two browser grants support `none` only).
  const method = doc[CIMD_HTTP.authMethodField]
  const secretBearing = CIMD_LIMITS.forbiddenAuthFields.some((field) => Object.hasOwn(doc, field))
  if (secretBearing || (method !== undefined && method !== CLIENT_AUTH.none)) return CIMD_REFUSAL.secretNotAllowed
  return undefined
}

/**
 * Whether `requested` matches one of `registered` (R-OA-14): exactly, or, for a loopback `http:`
 * redirect, in everything but the port (`localhost` and `127.0.0.1` stay distinct hosts). A
 * port-only match must also be canonical (it survives WHATWG parsing unchanged), so the URI the
 * code is bound to is the one the browser is sent to, never a dot-segment spelling of another path.
 */
export function isAllowedRedirect(requested, registered) {
  if (typeof requested !== 'string') return false
  if (registered.includes(requested)) return true
  const asked = parse(requested)
  if (asked === undefined || asked.protocol !== HOSTS.loopbackScheme || !isPlain(requested, asked) || asked.href !== requested) return false
  return registered.some((value) => {
    const url = parse(value)
    return url !== undefined && url.protocol === HOSTS.loopbackScheme && isLoopbackHostname(url.hostname)
      && url.hostname === asked.hostname && url.pathname === asked.pathname && url.search === asked.search
  })
}

/** Whether every registered redirect is on this computer (R-OA-11's extra warning). */
export const isLoopbackOnly = (registered) => registered.every((value) => isLoopbackHostname(new URL(value).hostname))

/** The document's `client_name` and registered redirect URIs, by their field names. */
export const clientNameOf = (doc) => doc[CIMD_HTTP.clientNameField]
export const redirectUrisOf = (doc) => doc[CIMD_HTTP.redirectUrisField]
