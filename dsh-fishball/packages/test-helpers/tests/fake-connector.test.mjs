/**
 * fishball-test-helpers ./fake-connector, black box over HTTP: what a client of the connector sees.
 * Expected values come from the vendored K1 contract (./connector-contract/mcp-schema), never from the
 * fake. EP over the endpoints (metadata, token, MCP) and the token classes; DT for FakePairs' pair
 * rules (bound entry × same id × id held elsewhere × name state); ST for an entry switched off and on.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import test from 'node:test'
import * as K1 from '../connector-contract/mcp-schema/index.js'
import { FakePairs, approvalBrowser, newToken, startConnectFake, startFakeConnector, startFakeDsh, startFakeTarget } from '../fake-connector.mjs'

const T = Object.freeze({
  id: 'fbtest-agent-1', otherId: 'fbtest-agent-2', badId: 'bad.id', name: 'Fishball', clash: 'FISHBALL', blank: '',
  entry: 'fbtest-entry-a', other: 'fbtest-entry-b', now: Date.UTC(2026, 10, 22), server: 'Office-DSH', renamed: 'Lab-DSH',
  json: 'application/json', sse: 'text/event-stream', callback: 'http://127.0.0.1:1/callback', event: 'fbtest-e1',
  pkceBytes: 32, state: 's1', s256: 'S256', frameEnd: '\n\n', dataPrefix: 'data: ',
})

const basic = (id, secret) => 'Basic ' + Buffer.from(encodeURIComponent(id) + ':' + encodeURIComponent(secret)).toString('base64')
const originOf = (url) => new URL(url).origin
const form = (body) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) })
const asJson = async (res) => ({ status: res.status, json: await res.json(), headers: res.headers })

async function tokenFor(fake, secret, id = T.id) {
  const res = await fetch(originOf(fake.url()) + K1.PATHS.token, { ...form({ grant_type: K1.GRANT.clientCredentials }), headers: { ...form({}).headers, authorization: basic(id, secret) } })
  return asJson(res)
}
let rpcId = 0
const envelope = (method, params) => JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params })
async function rpc(fake, accessToken, method, params = {}) {
  const res = await fetch(fake.url(), { method: 'POST', headers: { 'content-type': T.json, ...(accessToken ? { authorization: 'Bearer ' + accessToken } : {}) }, body: envelope(method, params) })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, json, challenge: res.headers.get('www-authenticate') }
}
const call = (fake, at, name, args = {}) => rpc(fake, at, 'tools/call', { name, arguments: args })

/** Open a listen stream; resolves at its first SSE frame and leaves the stream open (`close`). */
function listen(fake, accessToken, subscriptions) {
  return new Promise((resolve, reject) => {
    const req = http.request(fake.url(), { method: 'POST', headers: { 'content-type': T.json, authorization: 'Bearer ' + accessToken } }, (res) => {
      let buffer = ''
      const frames = []
      res.setEncoding('utf8').on('data', (d) => {
        buffer += d
        for (let cut = buffer.indexOf(T.frameEnd); cut >= 0; cut = buffer.indexOf(T.frameEnd)) {
          const data = buffer.slice(0, cut).split('\n').find((l) => l.startsWith(T.dataPrefix))
          frames.push(JSON.parse(data.slice(T.dataPrefix.length)))
          buffer = buffer.slice(cut + T.frameEnd.length)
        }
        if (frames.length > 0) resolve({ status: res.statusCode, type: res.headers['content-type'], frames, close: () => req.destroy() })
      })
    })
    req.on('error', reject)
    req.end(envelope('subscriptions/listen', { notifications: { resourceSubscriptions: subscriptions } }))
  })
}

async function pairingFake(t) {
  const entries = [{ entryKey: T.entry, secret: newToken() }, { entryKey: T.other, secret: newToken() }]
  const fake = await startFakeConnector({ entries, now: () => T.now })
  t.after(() => fake.stop())
  return { fake, entries }
}
/** Pair `secret`'s entry with T.id and answer a full-scope access token. */
async function pairedToken(fake, secret) {
  await call(fake, (await tokenFor(fake, secret)).json.access_token, K1.TOOL.pair)
  return (await tokenFor(fake, secret)).json.access_token
}

test('HLP-FC-EP-01 metadata: the RFC 9728 and RFC 8414 documents are K1\'s for the origin asked', async (t) => {
  const { fake } = await pairingFake(t)
  const o = originOf(fake.url())
  assert.deepEqual(await (await fetch(o + K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp)).json(), K1.protectedResourceMetadata(o))
  assert.deepEqual(await (await fetch(o + K1.PATHS.authorizationServerPrefix + K1.PATHS.issuer)).json(), K1.authorizationServerMetadata(o, o))
})

test('HLP-FC-EP-02 token: a known secret with a valid id gets K1\'s token response, scope agent:pair while unpaired', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const r = await tokenFor(fake, entries[0].secret)
  assert.equal(r.status, K1.HTTP_STATUS.ok)
  assert.equal(r.json.scope, K1.SCOPE.pair)
  assert.equal(r.json.token_type, K1.TOKEN_TYPE)
  for (const [k, v] of Object.entries(K1.TOKEN_RESPONSE_HEADERS)) assert.equal(r.headers.get(k), v)
  assert.deepEqual(fake.tokenClientIds(), [T.id])
})

test('HLP-FC-EP-03 token: an unknown secret, an invalid id or another grant is invalid_client', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const refused = [
    await tokenFor(fake, newToken()),
    await tokenFor(fake, entries[0].secret, T.badId),
    await asJson(await fetch(originOf(fake.url()) + K1.PATHS.token, form({ grant_type: K1.GRANT.refreshToken }))),
  ]
  for (const r of refused) {
    assert.equal(r.status, K1.OAUTH_ERROR_STATUS[K1.OAUTH_ERROR.invalidClient])
    assert.deepEqual(r.json, K1.oauthErrorBody(K1.OAUTH_ERROR.invalidClient))
  }
})

test('HLP-FC-EP-04 MCP: no token is the Bearer challenge; an unknown one invalid_token', async (t) => {
  const { fake } = await pairingFake(t)
  const none = await rpc(fake, null, 'server/discover')
  assert.equal(none.status, K1.HTTP_STATUS.unauthorized)
  assert.equal(none.challenge, K1.bearerChallenge(originOf(fake.url())))
  assert.equal((await rpc(fake, newToken(), 'server/discover')).challenge, K1.invalidTokenChallenge(originOf(fake.url())))
})

test('HLP-FC-EP-05 MCP pair-only: discover and tools/list (pair only) answer; another tool is 403 insufficient_scope', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const at = (await tokenFor(fake, entries[0].secret)).json.access_token
  assert.deepEqual((await rpc(fake, at, 'server/discover')).json.result.supportedVersions, [K1.PROTOCOL.version])
  assert.deepEqual((await rpc(fake, at, 'tools/list')).json.result.tools.map((x) => x.name), K1.PAIR_ONLY.tools)
  const refused = await call(fake, at, K1.TOOL.inboxPoll)
  assert.equal(refused.status, K1.HTTP_STATUS.forbidden)
  assert.equal(refused.challenge, K1.insufficientScopeChallenge(originOf(fake.url()), K1.INSUFFICIENT_SCOPE_REASON.notPaired))
})

test('HLP-FC-UC-01 MCP after pair: scope agent, the full tool list, inbox_poll returns the queued events, lastSeenAt kept', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const paired = await call(fake, (await tokenFor(fake, entries[0].secret)).json.access_token, K1.TOOL.pair, { name: T.name })
  assert.equal(paired.json.result.structuredContent.ok, true)
  assert.equal(paired.json.result.structuredContent.id, T.id)
  const next = await tokenFor(fake, entries[0].secret)
  assert.equal(next.json.scope, K1.SCOPE.full)
  assert.deepEqual((await rpc(fake, next.json.access_token, 'tools/list')).json.result.tools.map((x) => x.name), K1.TOOLS.map((x) => x.name))
  fake.enqueue({ eventId: T.event })
  assert.deepEqual((await call(fake, next.json.access_token, K1.TOOL.inboxPoll)).json.result.structuredContent.events, [{ eventId: T.event }])
  assert.equal(fake.store.pairOf(T.entry).lastSeenAt, T.now, 'a full-scope request keeps lastSeenAt')
})

test('HLP-FC-EP-06 MCP listen: the stream acknowledges its filter in an SSE frame', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const stream = await listen(fake, await pairedToken(fake, entries[0].secret), [K1.CONNECTED.listenResource])
  t.after(stream.close)
  assert.equal(stream.status, K1.HTTP_STATUS.ok)
  assert.ok(stream.type.startsWith(T.sse))
  assert.deepEqual(stream.frames[0].params.notifications, { resourceSubscriptions: [K1.CONNECTED.listenResource] })
  assert.equal(fake.eventListens().length, 1)
})

test('HLP-FC-ST-01 an entry switched off kills its tokens at once; switched on, a new token works', async (t) => {
  const { fake, entries } = await pairingFake(t)
  const at = (await tokenFor(fake, entries[0].secret)).json.access_token
  fake.setEnabled(T.entry, false)
  assert.equal((await rpc(fake, at, 'server/discover')).status, K1.HTTP_STATUS.unauthorized)
  assert.equal((await tokenFor(fake, entries[0].secret)).status, K1.OAUTH_ERROR_STATUS[K1.OAUTH_ERROR.invalidClient])
  fake.setEnabled(T.entry, true)
  assert.equal((await rpc(fake, (await tokenFor(fake, entries[0].secret)).json.access_token, 'server/discover')).status, K1.HTTP_STATUS.ok)
})

test('HLP-FC-ST-02 drop() makes the fake unreachable; restore() brings it back on the same port', async (t) => {
  const { fake } = await pairingFake(t)
  const port = fake.port
  await fake.drop()
  await assert.rejects(fetch(fake.url()))
  await fake.restore()
  assert.equal(fake.port, port)
  assert.equal((await rpc(fake, null, 'server/discover')).status, K1.HTTP_STATUS.unauthorized)
})

/**
 * FakePairs decision table (R-ID-03/04/13, R-NAME-02/06): one pair call per row on a store prepared
 * by `given`. Conditions: the entry already bound (same id / other id), the id held by another
 * entry, the name (absent / valid / invalid / held by another principal, case-insensitively).
 */
const PAIR_ROWS = Object.freeze([
  { row: 1, why: 'fresh entry, no name', given: [], call: [T.entry, T.id], expect: { ok: true, name: null, noNameOutcome: true } },
  { row: 2, why: 'fresh entry, valid name', given: [], call: [T.entry, T.id, T.name], expect: { ok: true, name: T.name, nameAssigned: true } },
  { row: 3, why: 'fresh entry, invalid name: paired without it', given: [], call: [T.entry, T.id, T.blank], expect: { ok: true, name: null, nameAssigned: false, nameRefused: K1.REFUSAL.nameInvalid } },
  { row: 4, why: 'fresh entry, name held by another (case-insensitive)', given: [[T.other, T.otherId, T.name]], call: [T.entry, T.id, T.clash], expect: { ok: true, name: null, nameAssigned: false, nameRefused: K1.REFUSAL.nameTaken } },
  { row: 5, why: 'entry bound to the same id', given: [[T.entry, T.id]], call: [T.entry, T.id], expect: { ok: false, code: K1.REFUSAL.alreadyPaired, idMatches: true, advice: K1.PAIR_ADVICE.idMatches } },
  { row: 6, why: 'entry bound to another id', given: [[T.entry, T.otherId]], call: [T.entry, T.id], expect: { ok: false, code: K1.REFUSAL.alreadyPaired, idMatches: false, advice: K1.PAIR_ADVICE.idDiffers } },
  { row: 7, why: 'id held by another entry', given: [[T.other, T.id]], call: [T.entry, T.id], expect: { ok: false, code: K1.REFUSAL.idTaken } },
  { row: 8, why: 'a bound entry wins over a held id (precedence)', given: [[T.entry, T.otherId], [T.other, T.id]], call: [T.entry, T.id], expect: { ok: false, code: K1.REFUSAL.alreadyPaired } },
])

for (const r of PAIR_ROWS) {
  test(`HLP-FC-DT-01 row ${r.row} FakePairs.pair: ${r.why}`, async () => {
    const pairs = new FakePairs()
    for (const [entry, id, name] of r.given) await pairs.pair(entry, id, name, T.now)
    const [entry, id, name] = r.call
    const out = await pairs.pair(entry, id, name, T.now)
    assert.equal(out.ok, r.expect.ok)
    if (r.expect.code) assert.equal(out.code, r.expect.code)
    if (r.expect.idMatches !== undefined) assert.equal(out.bound.idMatches, r.expect.idMatches)
    if (r.expect.advice) assert.equal(out.advice, r.expect.advice)
    if (!r.expect.ok) return
    assert.equal(out.name, r.expect.name)
    if (r.expect.noNameOutcome) assert.equal(Object.hasOwn(out, 'nameAssigned'), false, 'no name, no nameAssigned')
    else assert.equal(out.nameAssigned, r.expect.nameAssigned)
    assert.equal(out.nameRefused, r.expect.nameRefused)
    assert.equal(pairs.pairOf(entry).id, id)
  })
}

test('HLP-FC-DT-02 FakePairs.setName: held or invalid is refused and changes nothing; valid sets, null clears', async () => {
  const pairs = new FakePairs()
  await pairs.pair(T.entry, T.id, undefined, T.now)
  await pairs.pair(T.other, T.otherId, T.name, T.now)
  const principal = pairs.pairOf(T.entry).principalKey
  assert.deepEqual(await pairs.setName(principal, T.clash), { ok: false, code: K1.REFUSAL.nameTaken })
  assert.deepEqual(await pairs.setName(principal, T.blank), { ok: false, code: K1.REFUSAL.nameInvalid })
  assert.equal(pairs.pairOf(T.entry).name, null)
  assert.deepEqual(await pairs.setName(principal, T.renamed), { ok: true, name: T.renamed })
  assert.deepEqual(await pairs.setName(principal, null), { ok: true, name: null })
  pairs.seen(principal, T.now)
  assert.equal(pairs.byPrincipal(principal).lastSeenAt, T.now)
})

test('HLP-FC-EP-07 target DSH: the name is only at _meta[serverInfo].name; a rename pushes identity to subscribed streams', async (t) => {
  const fake = await startFakeDsh({ name: T.server })
  t.after(() => fake.stop())
  const full = await pairedToken(fake, fake.addEntry().secret)
  const discover = (await rpc(fake, full, 'server/discover')).json.result
  assert.equal(discover._meta[K1.SERVER_IDENTITY.discoverMetaKey].name, T.server)
  assert.notEqual(discover.serverInfo.name, T.server, 'the top-level serverInfo is a decoy')
  assert.ok((await rpc(fake, full, 'resources/list')).json.result.resources.some((r) => r.uri === K1.RESOURCE.identity.uri))
  const stream = await listen(fake, full, [K1.RESOURCE.identity.uri])
  t.after(stream.close)
  assert.equal(fake.rename(T.server), 0, 'an unchanged name pushes nothing')
  assert.equal(fake.rename(T.renamed), 1)
  assert.equal(JSON.parse((await rpc(fake, full, 'resources/read', { uri: K1.RESOURCE.identity.uri })).json.result.contents[0].text).name, T.renamed)
})

test('HLP-FC-UC-02 Connect fake: approval binds the id, PKCE S256 code exchange issues a chain, a reused refresh token is refused', async (t) => {
  const fake = await startConnectFake()
  t.after(() => fake.stop())
  const { entryKey, secret } = fake.addEntry()
  const verifier = randomBytes(T.pkceBytes).toString('base64url')
  const resource = fake.url()
  const authorize = new URL(K1.PATHS.authorize, fake.approvalOrigin())
  const query = { client_id: T.callback, redirect_uri: T.callback, resource, state: T.state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: T.s256, [K1.AUTHORIZE_EXTENSION.agentIdParam]: T.id }
  for (const [k, v] of Object.entries(query)) authorize.searchParams.set(k, v)
  const approved = await approvalBrowser.approve(authorize.href, { token: secret, name: T.name })
  const back = new URL(approved.location).searchParams
  assert.equal(back.get('state'), T.state)
  assert.equal(fake.pairs.pairOf(entryKey).id, T.id, 'the approval page bound the entry to agent_id')
  const exchange = async (body) => asJson(await fetch(originOf(resource) + K1.PATHS.token, form(body)))
  const first = await exchange({ grant_type: K1.GRANT.authorizationCode, code: back.get('code'), code_verifier: verifier, client_id: T.callback, redirect_uri: T.callback, resource })
  assert.equal(first.status, K1.HTTP_STATUS.ok)
  assert.equal(first.json.scope, K1.SCOPE.full)
  const refresh = { grant_type: K1.GRANT.refreshToken, refresh_token: first.json.refresh_token, client_id: T.callback, resource }
  assert.equal((await exchange(refresh)).status, K1.HTTP_STATUS.ok)
  assert.deepEqual((await exchange(refresh)).json, K1.oauthErrorBody(K1.OAUTH_ERROR.invalidGrant))
  assert.ok(fake.planted.has(first.json.refresh_token), 'issued secrets are planted for leak sweeps')
})

test('HLP-FC-EP-08 metadata-only target: K1 metadata, every client refused, MCP answers the Bearer challenge', async (t) => {
  const fake = await startFakeTarget()
  t.after(() => fake.stop())
  const o = originOf(fake.url)
  assert.deepEqual(await (await fetch(o + K1.PATHS.protectedResourcePrefix + K1.PATHS.mcp)).json(), K1.protectedResourceMetadata(o))
  const token = await fetch(o + K1.PATHS.token, form({ grant_type: K1.GRANT.clientCredentials, client_id: T.id, client_secret: newToken() }))
  assert.equal(token.status, K1.OAUTH_ERROR_STATUS[K1.OAUTH_ERROR.invalidClient])
  const mcp = await fetch(fake.url, { method: 'POST', body: '{}' })
  assert.equal(mcp.status, K1.HTTP_STATUS.unauthorized)
  assert.equal(mcp.headers.get('www-authenticate'), K1.bearerChallenge(o))
})
