/**
 * C-OAUTH-WEB cases for the K1 amendment after W2 that moved three approval-listener limits into
 * K1 (mcp-schema README "Lifetimes and limits"): APPROVAL_LISTENER.decisionBodyBytes (the decision
 * form; over it 413 with no body), APPROVAL_LISTENER.pendingRequestsMax (pending authorization
 * requests; the oldest is evicted first and then reads as expired) and CIMD_LIMITS.cacheEntriesMax
 * (cached documents; the oldest is evicted first). cases.mjs tests the same boundaries against the
 * values Fishball relayed (constants.mjs RELAYED); these K1-AMEND-7 rows test them against the K1
 * constants, and that the relayed values are now K1's. Boundary Value Analysis, one test per value.
 */
import assert from 'node:assert/strict'
import { assertCode, assertOnPage, open, openPaced, plain, redirectOf, resolver, row } from './cases.mjs'
import {
  APPROVAL_LISTENER, CIMD_LIMITS, FIXTURE, HTTP_HEADER, HTTP_STATUS, PAGE_TEXT, PARAM, RELAYED,
} from './constants.mjs'
import { fakeClock } from './fakes.mjs'
import { cimdFetcher, documentOf, served, stubTransport } from './subject.mjs'

const ID = 'K1-AMEND-7'
const E = FIXTURE.entry
const V = FIXTURE.value
const BODY_CAP = APPROVAL_LISTENER.decisionBodyBytes
const PENDING_MAX = APPROVAL_LISTENER.pendingRequestsMax
const CACHE_MAX = CIMD_LIMITS.cacheEntriesMax
/** The extra form field a padded decision carries (ignored by the form: unknown fields are not read). */
const PAD_FIELD = `&${PARAM.state}x=`
const PAD_CHAR = 'p'

/** A captured decision form padded to exactly `bytes`. */
function padded(captured, bytes) {
  const body = captured.body + PAD_FIELD + PAD_CHAR.repeat(bytes - captured.body.length - PAD_FIELD.length)
  assert.equal(Buffer.byteLength(body), bytes, 'harness: padded size')
  return { ...captured, body }
}
/** A CIMD URL of the fixture client's host, one per cached document. */
const cimdUrl = (i) => new URL(`cimd-${i}.json`, FIXTURE.clientId).href

export function registerCOAuthWebAmendCases(sdk) {
  plain(sdk, ID, 'moved', 'the values cases.mjs relayed are the K1 constants now (decisionBodyBytes, pendingRequestsMax, cacheEntriesMax)', () => {
    assert.deepEqual([BODY_CAP, PENDING_MAX, CACHE_MAX], [RELAYED.decisionBodyBytes, RELAYED.pendingMax, RELAYED.cimdCacheMax])
  })

  // ---- APPROVAL_LISTENER.decisionBodyBytes ----
  for (const [part, bytes, over] of [['body cap − 1', BODY_CAP - 1, false], ['body cap', BODY_CAP, false], ['body cap + 1', BODY_CAP + 1, true]]) {
    row(sdk, ID, part, `a decision body of ${bytes} bytes (APPROVAL_LISTENER.decisionBodyBytes ${BODY_CAP}) → ${over ? '413 with no body, nothing bound' : 'processed: the code redirect'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flow = await open(w)
      const res = await flow.b.post(padded(flow.b.formBody(PAGE_TEXT.authorize, { token: V(5) }), bytes))
      if (over) {
        assert.equal(res.status, HTTP_STATUS.payloadTooLarge)
        assert.equal(res.body, '')
        assert.equal(w.pairs.pairOf(E(5)), undefined)
      } else assertCode(w, { res, redirect: redirectOf(res) })
    })
  }

  // ---- APPROVAL_LISTENER.pendingRequestsMax ----
  // Re-baselined by X-SEC X-04: the opens are paced within GET /authorize's per-address rate (openPaced).
  for (const [part, count] of [['pending max', PENDING_MAX], ['pending max + 1', PENDING_MAX + 1]]) {
    const evicted = count > PENDING_MAX
    row(sdk, ID, part, `${count} pending requests (APPROVAL_LISTENER.pendingRequestsMax ${PENDING_MAX}) → the oldest ${evicted ? 'is evicted and reads as expired; the newest still authorizes' : 'still authorizes'}`, async (w) => {
      w.tokens.add(5, V(5))
      const flows = await openPaced(w, count)
      const res = await flows[0].b.authorize({ token: V(5) })
      if (!evicted) return assertCode(w, { res, redirect: redirectOf(res) })
      assertOnPage(res, PAGE_TEXT.expired)
      assert.equal(w.pairs.pairOf(E(5)), undefined)
      const newest = await flows.at(-1).b.authorize({ token: V(5) })
      assertCode(w, { res: newest, redirect: redirectOf(newest) })
    })
  }

  // ---- CIMD_LIMITS.cacheEntriesMax ----
  for (const [part, count] of [['cache max', CACHE_MAX], ['cache max + 1', CACHE_MAX + 1]]) {
    const evicted = count > CACHE_MAX
    plain(sdk, ID, part, `${count} cached documents (CIMD_LIMITS.cacheEntriesMax ${CACHE_MAX}) → the oldest is ${evicted ? 'evicted and fetched again, which evicts the next oldest; the third is still cached' : 'still cached'}`, async (mod) => {
      const urls = Array.from({ length: count }, (_, i) => cimdUrl(i))
      const transport = stubTransport((url) => served(JSON.stringify(documentOf(url)), { headers: { [HTTP_HEADER.cacheControl]: `max-age=${FIXTURE.cacheMaxAgeS}` } }))
      const fetcher = cimdFetcher(mod, { resolve: resolver(), transport, now: fakeClock(FIXTURE.t0).now })
      for (const url of urls) assert.equal((await fetcher.fetch(url)).ok, true)
      const fetched = transport.calls.length
      assert.equal(fetched, count, 'harness: one fetch per document')
      await fetcher.fetch(urls[0])
      assert.equal(transport.calls.length, fetched + (evicted ? 1 : 0), evicted ? 'the oldest was not evicted' : 'a cached document was fetched again')
      if (evicted) {
        // Oldest first: refetching index 0 evicted index 1, the oldest left; index 2 is still cached.
        await fetcher.fetch(urls[2])
        assert.equal(transport.calls.length, fetched + 1, 'a document that should be cached was fetched again')
      }
    })
  }
}

