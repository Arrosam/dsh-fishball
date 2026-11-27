/**
 * R-FIX-CONNECTOR black-box rows for review finding F07 (.runtime/reports/review-x-dsh-connector.md;
 * R-TOK-05: a revocation closes the entry's listen streams). Expected outcomes, as relayed:
 * - a request authenticated with a valid bearer whose body (a `subscriptions/listen` for
 *   `dsh-agent://events`) is still uploading when the entry is revoked (`closeEntry(entry)` runs) must
 *   not open a stream once the upload finishes: the principal is not reported connected
 *   (`presence.isConnected` false) and the answer is a refusal (401 invalid_token), not an event stream;
 * - an ordinary non-listen request already past the token check still completes (R-TOK-05);
 * - with no revocation the same slow listen upload opens a stream (the principal is connected).
 *
 * Level: the suite's C-HTTP world (subject.mjs): the real endpoint and gate on loopback HTTP, the fake
 * verifier and the fake token registry, whose revocation calls `closeEntry` as C-WIRE wires it. In
 * the revocation rows the bearer is also withdrawn from the verifier at the revocation (the entry's
 * generation moved on, so its access token is revoked). The upload is a raw request held mid-body
 * (amend-cases.mjs `upload`). Techniques: State Transition (Authenticated → body uploading →
 * revoked → body done), Equivalence Partitioning (listen / discover; revoked / not).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { mcpHeaders, upload } from './amend-cases.mjs'
import { assert401, assertDiscovered, modernRpc, wireOf } from './cases.mjs'
import { FIXTURE, HEADER, REVIEW_X as RX, RESOURCE, REVOCATION, RPC, UPLOAD, WAIT } from './constants.mjs'
import { httpWorld } from './subject.mjs'

const row = (sdk, part, title, fn) => caseTest(sdk, RX.id, part, title, async (t) => fn(await httpWorld(t, sdk), await wireOf(sdk)))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const listenRpc = (wire) => modernRpc(wire, RPC.listen, { params: { notifications: { resourceSubscriptions: [RESOURCE.events.uri] } } })

/** `rpc`'s raw upload by P, held after its first bytes: `{held, text, caller}`. The route has not answered. */
async function heldUpload(w, wire, rpc) {
  const { token, caller } = w.principal(FIXTURE.idP)
  const text = JSON.stringify(rpc)
  const held = upload(w, mcpHeaders(wire, rpc, token), Buffer.byteLength(text))
  held.write(text.slice(0, UPLOAD.heldPrefixBytes))
  await sleep(WAIT.quietMs)
  return { held, text, caller, token }
}
/** The revocation while the body uploads: the registry's onRevoked (→ closeEntry), and the access token withdrawn. */
function revoke(w, caller, token) {
  w.verifier.issue(token, undefined)
  w.tokens.revoke(caller.entryKey, REVOCATION.disabled, FIXTURE.generation + 1)
}
const isStream = (res) => (res.headers[HEADER.contentType] ?? '').startsWith(HEADER.sse)

export function registerReviewXHttpCases(sdk) {
  row(sdk, 'ST (listen uploading, entry revoked)', 'no stream opens after the upload ends: P is not connected; 401 invalid_token, not an event stream', async (w, wire) => {
    const u = await heldUpload(w, wire, listenRpc(wire))
    revoke(w, u.caller, u.token)
    u.held.finish(u.text.slice(UPLOAD.heldPrefixBytes))
    const outcome = await Promise.race([u.held.response, sleep(WAIT.eventMs).then(() => null)])
    assert.equal(w.presence.isConnected(u.caller.principalKey), false, 'the revoked principal is reported connected')
    assert.ok(outcome !== null, 'the route opened a long-lived stream instead of refusing (no answer within the wait)')
    assert.ok(!isStream(outcome), 'an event stream was opened after the revocation')
    assert401(w, outcome, { presented: true })
    u.held.abort()
  })
  row(sdk, 'EP (discover uploading, entry revoked)', 'an ordinary request already past the token check still completes (R-TOK-05)', async (w, wire) => {
    const u = await heldUpload(w, wire, modernRpc(wire, RPC.discover))
    revoke(w, u.caller, u.token)
    u.held.finish(u.text.slice(UPLOAD.heldPrefixBytes))
    assertDiscovered(await u.held.response)
  })
  row(sdk, 'EP (listen uploading, no revocation)', 'the same slow listen upload opens the stream: P is connected', async (w, wire) => {
    const u = await heldUpload(w, wire, listenRpc(wire))
    u.held.finish(u.text.slice(UPLOAD.heldPrefixBytes))
    const connected = async () => { for (let i = 0; i * WAIT.pollMs < WAIT.eventMs; i += 1) { if (w.presence.isConnected(u.caller.principalKey)) return true; await sleep(WAIT.pollMs) } return false }
    assert.equal(await connected(), true, 'a listen upload with no revocation did not connect P')
    u.held.abort()
  })
}
