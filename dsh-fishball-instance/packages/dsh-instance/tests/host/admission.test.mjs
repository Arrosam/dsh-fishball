/**
 * The frame's admission (design §4.1; constants.js TICKET; ticket.js and child-row.js
 * registerAdmission JSDoc): a single-use HMAC ticket bound to the child generation, the audience
 * `<hostname>:<port>`, the view and the language, valid while `now < exp` (30 000 ms), with a key
 * both ends derive from the lifecycle secret; and the child-side raw route that redeems it once and
 * answers 303 with the child's own login cookie, or 403. Time is an injected clock.
 *
 * Techniques: BVA (ticket life 0 / 29 999 / 30 000 / 30 001 ms; audience port ±1; use 1 / use 2),
 * EP (audience, generation, key, Host header, method).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { textOf } from '@dsh-instance/test-helpers/json'
import { ADMIT, FIXTURE, HOSTNAME, K3, TICKET } from './constants.mjs'
import { admissionWorld, load } from './worlds.mjs'

const audience = (hostname = HOSTNAME.ipv4, port = FIXTURE.port) => `${hostname}:${port}`
const claims = (over = {}) => ({ generation: FIXTURE.generation, audience: audience(), view: K3.views[0], lang: K3.langs[1], ...over })
const expect = (over = {}) => ({ generation: FIXTURE.generation, audience: audience(), ...over })

eachSdk((sdk) => {
  const ticketApi = () => load(sdk, 'ticket')
  const mint = async (over = {}, at = FIXTURE.t0, secret = FIXTURE.secret) => {
    const { admissionKey, mintTicket } = await ticketApi()
    return mintTicket(admissionKey(secret), claims(over), at)
  }

  // ============================================================ the ticket
  caseTest(sdk, 'TICKET', 'constants', 'TICKET = {ttlMs: 30000, param: ticket, path: /api/dsh-instance/admit}', async () => {
    const { TICKET: actual } = await load(sdk, 'constants')
    assert.deepEqual({ ttlMs: actual.ttlMs, param: actual.param, path: actual.path }, { ttlMs: TICKET.ttlMs, param: TICKET.param, path: TICKET.path })
  })
  for (const [part, offset, valid] of [['BVA-0', 0, true], ['BVA-29999', TICKET.ttlMs - 1, true], ['BVA-30000', TICKET.ttlMs, false], ['BVA-30001', TICKET.ttlMs + 1, false]]) {
    caseTest(sdk, 'TICKET', part, `verify at mint + ${offset} ms → ${valid ? 'its view, lang and nonce' : 'null (expired)'}`, async () => {
      const { admissionKey, verifyTicket } = await ticketApi()
      const out = verifyTicket(admissionKey(FIXTURE.secret), await mint(), expect(), FIXTURE.t0 + offset)
      if (!valid) return assert.equal(out, null)
      assert.deepEqual([out?.view, out?.lang, typeof out?.nonce], [K3.views[0], K3.langs[1], 'string'])
    })
  }
  for (const [part, title, check] of [
    ['audience', 'another hostname (localhost vs 127.0.0.1)', { audience: audience(HOSTNAME.localhost) }],
    ['audience', 'the port + 1', { audience: audience(HOSTNAME.ipv4, FIXTURE.port + 1) }],
    ['audience', 'the port - 1', { audience: audience(HOSTNAME.ipv4, FIXTURE.port - 1) }],
    ['generation', 'another child generation (a restart)', { generation: FIXTURE.otherGeneration }],
  ]) {
    caseTest(sdk, 'TICKET', part, `verify with ${title} → null`, async () => {
      const { admissionKey, verifyTicket } = await ticketApi()
      assert.equal(verifyTicket(admissionKey(FIXTURE.secret), await mint(), expect(check), FIXTURE.t0 + 1), null)
    })
  }
  caseTest(sdk, 'TICKET', 'key', 'a ticket minted under another lifecycle secret, a tampered ticket and junk do not verify', async () => {
    const { admissionKey, verifyTicket } = await ticketApi()
    const key = admissionKey(FIXTURE.secret)
    assert.equal(verifyTicket(key, await mint({}, FIXTURE.t0, FIXTURE.otherSecret), expect(), FIXTURE.t0 + 1), null)
    const good = await mint()
    const flipped = good.slice(0, -1) + (good.at(-1) === 'A' ? 'B' : 'A')
    assert.equal(verifyTicket(key, flipped, expect(), FIXTURE.t0 + 1), null)
    for (const junk of ['', 'x', 'a.b.c', undefined]) assert.equal(verifyTicket(key, junk, expect(), FIXTURE.t0 + 1), null, String(junk))
  })
  caseTest(sdk, 'TICKET', 'key', 'admissionKey(secret) is deterministic, 32 bytes, differs per secret and is not the secret itself', async () => {
    const { admissionKey } = await ticketApi()
    const a = admissionKey(FIXTURE.secret)
    assert.ok(Buffer.isBuffer(a))
    assert.equal(a.length, TICKET.keyBytes)
    assert.deepEqual(admissionKey(FIXTURE.secret), a)
    assert.notDeepEqual(admissionKey(FIXTURE.otherSecret), a)
    assert.notEqual(a.toString('hex'), Buffer.from(FIXTURE.secret).toString('hex'))
  })
  caseTest(sdk, 'TICKET', 'secret', 'the ticket text carries neither the lifecycle secret nor the key', async () => {
    const { admissionKey } = await ticketApi()
    const key = admissionKey(FIXTURE.secret)
    const ticket = await mint()
    for (const hidden of [FIXTURE.secret, key.toString('hex'), key.toString('base64url'), key.toString('base64')]) assert.equal(ticket.includes(hidden), false)
  })
  caseTest(sdk, 'TICKET', 'replay', 'the redeemer answers {view, lang} once; a second redemption of the same ticket is null (use 1 / use 2)', async () => {
    const { admissionKey, createTicketRedeemer } = await ticketApi()
    const redeemer = createTicketRedeemer(admissionKey(FIXTURE.secret), FIXTURE.generation, () => FIXTURE.t0 + 1)
    const ticket = await mint()
    assert.deepEqual(redeemer.redeem(ticket, audience()), { view: K3.views[0], lang: K3.langs[1] })
    assert.equal(redeemer.redeem(ticket, audience()), null)
  })
  caseTest(sdk, 'TICKET', 'replay', 'a ticket replayed under another loopback hostname is refused (UIM-EP-02 row 6)', async () => {
    const { admissionKey, createTicketRedeemer } = await ticketApi()
    const redeemer = createTicketRedeemer(admissionKey(FIXTURE.secret), FIXTURE.generation, () => FIXTURE.t0 + 1)
    assert.equal(redeemer.redeem(await mint(), audience(HOSTNAME.localhost)), null)
  })
  caseTest(sdk, 'TICKET', 'BVA-30000', 'the redeemer refuses at mint + 30000 ms and accepts at mint + 29999 ms', async () => {
    const { admissionKey, createTicketRedeemer } = await ticketApi()
    let now = FIXTURE.t0 + TICKET.ttlMs
    const redeemer = createTicketRedeemer(admissionKey(FIXTURE.secret), FIXTURE.generation, () => now)
    assert.equal(redeemer.redeem(await mint(), audience()), null)
    now = FIXTURE.t0 + TICKET.ttlMs - 1
    assert.ok(redeemer.redeem(await mint(), audience()))
  })

  // ============================================================ the child-side admission route
  const clockAt = (offset) => () => FIXTURE.t0 + offset
  for (const hostname of HOSTNAME.served) {
    caseTest(sdk, 'ADMIT-ROUTE', 'ok', `GET under ${hostname}:<port> with a fresh ticket → 303 to /#view=<v>&lang=<l>, the child's own Set-Cookie, no-store, no-referrer`, async () => {
      const a = await admissionWorld(sdk, { now: clockAt(1) })
      const out = await a.get(await mint({ audience: audience(hostname), view: K3.views[1], lang: K3.langs[0] }), audience(hostname))
      assert.equal(out.status, ADMIT.seeOther, JSON.stringify(out))
      assert.equal(out.headers.location, ADMIT.landing(K3.views[1], K3.langs[0]))
      assert.equal([out.headers['set-cookie']].flat().join(), FIXTURE.cookie)
      assert.equal(out.headers['cache-control'], ADMIT.noStore)
      assert.equal(out.headers['referrer-policy'], ADMIT.noReferrer)
    })
  }
  caseTest(sdk, 'ADMIT-ROUTE', 'route', 'the admission is a raw exact web route at /api/dsh-instance/admit', async () => {
    const a = await admissionWorld(sdk)
    const route = a.routes.find((r) => r.path === TICKET.path)
    assert.equal(route?.kind, ADMIT.kind)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'replay', 'the same ticket a second time → 403 (single use)', async () => {
    const a = await admissionWorld(sdk, { now: clockAt(1) })
    const ticket = await mint()
    assert.equal((await a.get(ticket, audience())).status, ADMIT.seeOther)
    assert.equal((await a.get(ticket, audience())).status, ADMIT.forbidden)
  })
  for (const [title, host, over] of [
    ['a ticket for 127.0.0.1 presented under localhost', audience(HOSTNAME.localhost), {}],
    ['a Host header with the port + 1', audience(HOSTNAME.ipv4, FIXTURE.port + 1), { audience: audience(HOSTNAME.ipv4, FIXTURE.port + 1) }],
    ['a Host header [::1]:<port> (not served)', audience(HOSTNAME.ipv6), { audience: audience(HOSTNAME.ipv6) }],
    ['a non-loopback Host header', audience(HOSTNAME.refused[0]), { audience: audience(HOSTNAME.refused[0]) }],
    ['a ticket of another child generation', audience(), { generation: FIXTURE.otherGeneration }],
  ]) {
    caseTest(sdk, 'ADMIT-ROUTE', 'refused', `${title} → 403, no cookie`, async () => {
      const a = await admissionWorld(sdk, { now: clockAt(1) })
      const out = await a.get(await mint(over), host)
      assert.equal(out.status, ADMIT.forbidden, JSON.stringify(out))
      assert.equal(out.headers['set-cookie'], undefined)
    })
  }
  for (const [offset, status] of [[TICKET.ttlMs + 1, ADMIT.forbidden], [1, ADMIT.seeOther]]) {
    caseTest(sdk, 'ADMIT-ROUTE', 'expired', `a ticket redeemed ${offset} ms after its mint → ${status}`, async () => {
      const a = await admissionWorld(sdk, { now: clockAt(offset) })
      assert.equal((await a.get(await mint(), audience())).status, status)
    })
  }
  caseTest(sdk, 'ADMIT-ROUTE', 'refused', 'no ticket parameter → 403; a POST → 405', async () => {
    const a = await admissionWorld(sdk, { now: clockAt(1) })
    assert.equal((await a.get(undefined, audience())).status, ADMIT.forbidden)
    assert.equal((await a.get(await mint(), audience(), 'POST')).status, ADMIT.notAllowed)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'login', "DSH's login issues no cookie → 403 (never a 303 without the child's own cookie)", async () => {
    const a = await admissionWorld(sdk, { now: clockAt(1), cookie: null })
    assert.equal((await a.get(await mint(), audience())).status, ADMIT.forbidden)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'secret', 'the launch token never reaches the browser: not in Location, the body or any header', async () => {
    const a = await admissionWorld(sdk, { now: clockAt(1) })
    const out = await a.get(await mint(), audience())
    assert.equal(out.status, ADMIT.seeOther)
    assert.equal(textOf(out).includes(FIXTURE.launchToken), false)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'refused', 'every refusal answers no-store with no Location', async () => {
    const a = await admissionWorld(sdk, { now: clockAt(1) })
    for (const out of [await a.get('not-a-ticket', audience()), await a.get(await mint(), audience(HOSTNAME.refused[0])), await a.get(await mint(), audience(), 'POST')]) {
      assert.ok([ADMIT.forbidden, ADMIT.notAllowed].includes(out.status))
      assert.equal(out.headers['cache-control'], ADMIT.noStore)
      assert.equal(out.headers.location, undefined)
    }
  })
})
