/**
 * The frame's single-use admission ticket (design §4.1; spike V3-S4 `b9809b7` F1; constants.js
 * TICKET). The host mints it for one `admit`; the child-side row redeems it once. Neither end ever
 * logs a ticket, and no ticket carries a credential: it is an HMAC proof bound to the child
 * generation, the audience (`<hostname>:<port>` the browser opens), the view and the language.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { TICKET } from './constants.js'

const sign = (key, body) => createHmac(TICKET.algorithm, key).update(body).digest(TICKET.encoding)

/**
 * The admission key both ends derive from the lifecycle secret (`control.secret`), so no key
 * travels in a launch overlay or an argument, and a key is never the wire secret itself.
 * @param {Buffer|string} secret - the lifecycle secret
 * @returns {Buffer}
 */
export function admissionKey(secret) {
  return createHmac(TICKET.algorithm, secret).update(TICKET.keyLabel).digest()
}

/**
 * @param key - the admission key
 * @param {{generation: string, audience: string, view: string, lang: string}} claims
 * @param {number} [now] - milliseconds since the epoch
 * @returns {string} the ticket, `<body>.<mac>`
 */
export function mintTicket(key, { generation, audience, view, lang }, now = Date.now()) {
  const nonce = randomBytes(TICKET.nonceBytes).toString(TICKET.encoding)
  const body = Buffer.from(JSON.stringify({ gen: generation, aud: audience, view, lang, exp: now + TICKET.ttlMs, nonce })).toString(TICKET.encoding)
  return body + TICKET.separator + sign(key, body)
}

/**
 * @returns {{view: string, lang: string, nonce: string, exp: number} | null} null for a bad
 *   signature, another generation or audience, a damaged body, or an expired ticket (valid while
 *   `now < exp`).
 */
export function verifyTicket(key, ticket, { generation, audience }, now = Date.now()) {
  if (typeof ticket !== 'string') return null
  const [body, mac, extra] = ticket.split(TICKET.separator)
  if (!body || !mac || extra !== undefined) return null
  const want = Buffer.from(sign(key, body))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null
  let claims
  try { claims = JSON.parse(Buffer.from(body, TICKET.encoding).toString()) } catch { return null }
  if (claims?.gen !== generation || claims.aud !== audience || !(claims.exp > now) || typeof claims.nonce !== 'string') return null
  return { view: claims.view, lang: claims.lang, nonce: claims.nonce, exp: claims.exp }
}

/**
 * One child generation's redeemer: each ticket works once (a nonce is spent even when the caller
 * then fails to mint the cookie). A restart is a new generation and a new redeemer.
 * @returns {{redeem(ticket: string, audience: string): {view: string, lang: string} | null}}
 */
export function createTicketRedeemer(key, generation, now = () => Date.now()) {
  // nonce → exp. A spent nonce is forgotten once its ticket has expired, because an expired
  // ticket is refused anyway; so the set holds at most the tickets of one TICKET.ttlMs window.
  const spent = new Map()
  return Object.freeze({
    redeem(ticket, audience) {
      const at = now()
      for (const [nonce, exp] of spent) if (!(exp > at)) spent.delete(nonce)
      const claims = verifyTicket(key, ticket, { generation, audience }, at)
      if (claims === null || spent.has(claims.nonce)) return null
      spent.set(claims.nonce, claims.exp)
      return { view: claims.view, lang: claims.lang }
    },
  })
}
