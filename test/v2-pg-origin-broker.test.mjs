/**
 * PG-ORIGIN — the main-side embed broker becomes an admission redirect to the isolated child origin
 * (docs/planning/v2-final-scope.md §4.3(4) "Admission design"; docs/test-design/v2-origin-lite-set-cases.md §1).
 * Requirements-only black-box file: no implementation source was read while writing it.
 *
 * Observation point: createEmbedBroker({ service, connection }) of packages/dsh-instance/src/slim/host/embed.js,
 * mounted at /fishball/embed on a real loopback http.Server (port 0). The service is a stand-in *native*
 * service (status / embedAccess / restart / nativeEmbedAccess). Every child generation is a real spy
 * http.Server on 127.0.0.1 that counts TCP connections, so "the broker never contacts the child" is
 * observed rather than assumed. The connection stand-in models DSH's requestRejection: undefined when the
 * main session is authenticated, 401 when it is not, 403 for `Sec-Fetch-Site: cross-site`.
 * All tokens are synthetic sentinels; no real credential is used.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | PGO-UC-01 | Use Case | ready + authenticated GET / → 303 to exactly the generation's authenticatedUrl; no-store, no-referrer; child port untouched |
 * | PGO-EP-01..04 | EP (continuation) | view=settings / lang=zh / lang=en / both → carried only in the Location fragment |
 * | PGO-EP-05..08 | EP (unsupported continuation) | view=evil / lang=fr / next=https://example.invalid/ / arbitrary param → dropped; origin stays the child origin |
 * | PGO-BVA-01..04 | BVA (continuation values) | lang=ZH / lang=zh-CN / view=Settings / view=settings+lang=fr → only the exact supported values survive |
 * | PGO-B5-EP-01..03 | EP R6 (key order × lang) | view=settings&lang=en / lang=en&view=settings / lang=zh&view=settings → fragment view=settings plus that lang |
 * | PGO-B5-BVA-01..02 | BVA R6 | view=x&lang=en / lang=en&view=Settings → view dropped, lang=en kept |
 * | PGO-DT-01 | DT R1 | unauthenticated (401) → 401, no location, nativeEmbedAccess not called |
 * | PGO-DT-02 | DT | Sec-Fetch-Site cross-site → 403, no location, nativeEmbedAccess not called |
 * | PGO-EP-09..10 | EP | `token` query on the broker URL (valued / empty) → 400, no location |
 * | PGO-DT-03..04 | DT R3 | status starting / failed → 503, no location, no token |
 * | PGO-DT-05 | DT R2 | nativeEmbedAccess rejects → 503 |
 * | PGO-DT-06 | DT R2 | nativeEmbedAccess returns an already-aborted signal (retired generation) → 503 |
 * | PGO-DT-07..16 | DT R5 (inexact authority) | sibling port / non-127.0.0.1 host / https / extra query / two tokens / empty token / path ≠ / / userinfo / fragment / no token → 503 |
 * | PGO-ST-01 | ST | generation A → B: next launch redirects to B only |
 * | PGO-ST-02 | ST | launch waiting on A; A retired and B current before A resolves → late A not redirected; next launch → B |
 * | PGO-EP-11..13 | EP (other paths) | /ui/x.js, /api/events, /api/remote.mux → 404, child untouched |
 * | PGO-ST-03 | ST | POST / while not ready is the Retry: restart() called, no token returned |
 * | PGO-ST-04 | ST | after close() → no location, no token |
 * Every case also checks that the token sentinel appears nowhere except the single 303 Location header.
 */
import assert from 'node:assert/strict'
import http from 'node:http'
import { describe, it } from 'node:test'
import { loadInstance } from './support/body-soul-env.mjs'

const ROUTE = Object.freeze({
  document: '/fishball/embed/',
  otherPaths: Object.freeze(['/fishball/embed/ui/x.js', '/fishball/embed/api/events', '/fishball/embed/api/remote.mux']),
})
const HTTP_STATUS = Object.freeze({ seeOther: 303, badRequest: 400, unauthorized: 401, forbidden: 403, notFound: 404, unavailable: 503 })
const LOOPBACK = '127.0.0.1'
const SENTINEL = Object.freeze({
  tokenA: 'SENTINEL-TOKEN-A-7f3c9e1d5b',
  tokenB: 'SENTINEL-TOKEN-B-2a8d6c4e0f',
  generationA: 'owned-A',
  generationB: 'owned-B',
  bearer: 'SENTINEL-BEARER-legacy-91c2',
  failure: 'SENTINEL-FAILURE-detail-44ab',
})
const STATUS = Object.freeze({
  ready: Object.freeze({ enabled: true, state: 'ready', code: null }),
  starting: Object.freeze({ enabled: true, state: 'starting', code: null }),
  failed: Object.freeze({ enabled: true, state: 'failed', code: 'NATIVE_CHILD_EXITED' }),
})
const SAME_ORIGIN = Object.freeze({ 'sec-fetch-site': 'same-origin' })
const CROSS_SITE = Object.freeze({ 'sec-fetch-site': 'cross-site' })
/** Header the connection stand-in reads to play an unauthenticated main session. */
const UNAUTHENTICATED_MARK = 'x-fbtest-unauthenticated'
const REQUEST_TIMEOUT_MS = 10000
const CONTINUATION_KEYS = Object.freeze(['view', 'lang'])

/** A real loopback listener standing in for one child generation; counts every TCP connection. */
async function spyChild(t) {
  const seen = { connections: 0, requests: 0 }
  const server = http.createServer((request, response) => { seen.requests++; response.end() })
  server.on('connection', () => { seen.connections++ })
  await new Promise((resolve) => server.listen(0, LOOPBACK, resolve))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  const port = server.address().port
  return { seen, port, origin: 'http://' + LOOPBACK + ':' + port }
}

/** One generation's exact native access answer, plus the controller that retires it. */
function generation(child, token, name) {
  const controller = new AbortController()
  return {
    controller,
    token,
    access: { generation: name, origin: child.origin, authenticatedUrl: child.origin + '/?token=' + token, signal: controller.signal },
  }
}

/**
 * Mount the broker. `access` is what nativeEmbedAccess answers: an object, or a function returning a
 * value/promise (it may throw or reject).
 */
async function nativeHarness(t, { status = STATUS.ready, access, afterRestart } = {}) {
  const { createEmbedBroker } = await loadInstance('src/slim/host/embed.js')
  const calls = { nativeAccess: 0, embedAccess: 0, restart: 0 }
  const state = { status, access }
  const service = {
    status: () => state.status,
    async embedAccess() { calls.embedAccess++; return { origin: 'http://' + LOOPBACK + ':1', bearer: SENTINEL.bearer } },
    async restart() { calls.restart++; if (afterRestart !== undefined) state.status = afterRestart },
    async nativeEmbedAccess() {
      calls.nativeAccess++
      return typeof state.access === 'function' ? state.access() : state.access
    },
  }
  const connection = {
    requestRejection({ headers }) {
      if (headers[UNAUTHENTICATED_MARK] !== undefined) return HTTP_STATUS.unauthorized
      if (headers['sec-fetch-site'] === CROSS_SITE['sec-fetch-site']) return HTTP_STATUS.forbidden
      return undefined
    },
  }
  const broker = createEmbedBroker({ service, connection })
  const server = http.createServer((request, response) => { broker.handle(request, response) })
  await new Promise((resolve) => server.listen(0, LOOPBACK, resolve))
  let closed = false
  t.after(() => new Promise((resolve) => { if (!closed) broker.close(); server.closeAllConnections?.(); server.close(resolve) }))
  const port = server.address().port
  function send(target, { method = 'GET', headers = SAME_ORIGIN, body } = {}) {
    return new Promise((resolve, reject) => {
      const extra = body === undefined ? {} : { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body) }
      const request = http.request({ host: LOOPBACK, port, method, path: target, headers: { ...headers, ...extra }, timeout: REQUEST_TIMEOUT_MS }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') }))
      })
      request.on('timeout', () => request.destroy(new Error('broker did not answer ' + method + ' ' + target)))
      request.on('error', reject)
      request.end(body)
    })
  }
  return {
    send,
    calls,
    setStatus: (value) => { state.status = value },
    setAccess: (value) => { state.access = value },
    close: () => { closed = true; broker.close() },
  }
}

/** No sentinel secret anywhere in the answer, except (when allowed) the Location header. */
function assertNoSecret(answer, { allowLocation = false } = {}) {
  const secrets = [SENTINEL.tokenA, SENTINEL.tokenB, SENTINEL.bearer, SENTINEL.failure]
  for (const secret of secrets) {
    assert.equal(answer.body.includes(secret), false, 'secret in body: ' + secret)
    for (const [name, value] of Object.entries(answer.headers)) {
      if (allowLocation && name === 'location') continue
      assert.equal(String(value).includes(secret), false, 'secret in header ' + name + ': ' + secret)
    }
  }
}

function assertRefused(answer, status) {
  assert.equal(answer.status, status, 'status, body: ' + answer.body.slice(0, 200))
  assert.equal(answer.headers.location, undefined, 'no location')
  assertNoSecret(answer)
}

function assertUntouched(...children) {
  for (const child of children) assert.equal(child.seen.connections, 0, 'child port ' + child.port + ' was contacted')
}

/** The 303 points exactly at `access.authenticatedUrl`; returns the continuation fragment params. */
function assertAdmission(answer, access) {
  assert.equal(answer.status, HTTP_STATUS.seeOther, 'status, body: ' + answer.body.slice(0, 200))
  const location = answer.headers.location
  assert.equal(typeof location, 'string', 'a location')
  const hashAt = location.indexOf('#')
  const base = hashAt < 0 ? location : location.slice(0, hashAt)
  assert.equal(base, access.authenticatedUrl, 'location is exactly the authenticated URL')
  assert.equal(new URL(location).origin, access.origin, 'location origin is the child origin')
  assert.match(answer.headers['cache-control'] ?? '', /\bno-store\b/)
  assert.equal(answer.headers['referrer-policy'], 'no-referrer')
  assertNoSecret(answer, { allowLocation: true })
  const fragment = new URLSearchParams(hashAt < 0 ? '' : location.slice(hashAt + 1))
  for (const key of fragment.keys()) assert.ok(CONTINUATION_KEYS.includes(key), 'unsupported fragment key ' + key)
  for (const key of CONTINUATION_KEYS) assert.ok(fragment.getAll(key).length <= 1, 'one ' + key + ' at most')
  return fragment
}

async function readyHarness(t) {
  const child = await spyChild(t)
  const gen = generation(child, SENTINEL.tokenA, SENTINEL.generationA)
  const h = await nativeHarness(t, { access: gen.access })
  return { h, child, gen }
}

describe('PG-ORIGIN admission redirect', () => {
  it('PGO-UC-01 Use Case: ready + authenticated GET → 303 to exact authenticatedUrl, no-store/no-referrer, no child contact', async (t) => {
    const { h, child, gen } = await readyHarness(t)
    const fragment = assertAdmission(await h.send(ROUTE.document), gen.access)
    assert.equal([...fragment.keys()].length, 0, 'no continuation without a query')
    assert.equal(h.calls.nativeAccess, 1)
    assertUntouched(child)
  })

  for (const [id, query, expected] of [
    ['PGO-EP-01', 'view=settings', { view: 'settings' }],
    ['PGO-EP-02', 'lang=zh', { lang: 'zh' }],
    ['PGO-EP-03', 'lang=en', { lang: 'en' }],
    ['PGO-EP-04', 'view=settings&lang=zh', { view: 'settings', lang: 'zh' }],
  ]) {
    it(id + ' EP supported continuation ?' + query + ' → carried in the Location fragment only', async (t) => {
      const { h, child, gen } = await readyHarness(t)
      const fragment = assertAdmission(await h.send(ROUTE.document + '?' + query), gen.access)
      assert.deepEqual(Object.fromEntries(fragment), expected)
      assertUntouched(child)
    })
  }

  for (const [id, query, absent] of [
    ['PGO-EP-05', 'view=evil', ['evil']],
    ['PGO-EP-06', 'lang=fr', ['fr']],
    ['PGO-EP-07', 'next=' + encodeURIComponent('https://example.invalid/'), ['example.invalid', 'next']],
    ['PGO-EP-08', 'fbtestArbitrary=fbtest-value-77', ['fbtestArbitrary', 'fbtest-value-77']],
    ['PGO-BVA-01', 'lang=ZH', ['ZH']],
    ['PGO-BVA-02', 'lang=zh-CN', ['zh-CN']],
    ['PGO-BVA-03', 'view=Settings', ['Settings']],
  ]) {
    it(id + ' unsupported continuation ?' + query + ' → dropped, Location origin is the child origin', async (t) => {
      const { h, child, gen } = await readyHarness(t)
      const answer = await h.send(ROUTE.document + '?' + query)
      const fragment = assertAdmission(answer, gen.access)
      assert.equal([...fragment.keys()].length, 0, 'nothing carried: ' + answer.headers.location)
      for (const text of absent) assert.equal(answer.headers.location.includes(text), false, text + ' appears in Location')
      assertUntouched(child)
    })
  }

  // B5 (round-2 bug 6, R6): the connector registers ui.settings as '/fishball/embed/?view=settings' and
  // frames it with lang appended, so the documented query form must reach the fragment in either key
  // order and with either language. EP over key order × language; the lone-view and lone-lang
  // partitions are PGO-EP-01 and PGO-EP-03 above.
  for (const [id, query, expected] of [
    ['PGO-B5-EP-01', 'view=settings&lang=en', { view: 'settings', lang: 'en' }],
    ['PGO-B5-EP-02', 'lang=en&view=settings', { view: 'settings', lang: 'en' }],
    ['PGO-B5-EP-03', 'lang=zh&view=settings', { view: 'settings', lang: 'zh' }],
  ]) {
    it(id + ' EP R6 documented settings form ?' + query + ' → 303 whose fragment carries view=settings and lang', async (t) => {
      const { h, child, gen } = await readyHarness(t)
      const fragment = assertAdmission(await h.send(ROUTE.document + '?' + query), gen.access)
      assert.deepEqual(Object.fromEntries(fragment), expected)
      assertUntouched(child)
    })
  }
  // An unknown view value is dropped while the language survives (BVA on the exact value 'settings').
  for (const [id, query] of [['PGO-B5-BVA-01', 'view=x&lang=en'], ['PGO-B5-BVA-02', 'lang=en&view=Settings']]) {
    it(id + ' BVA R6 unknown view ?' + query + ' → view dropped, lang=en kept', async (t) => {
      const { h, child, gen } = await readyHarness(t)
      const fragment = assertAdmission(await h.send(ROUTE.document + '?' + query), gen.access)
      assert.deepEqual(Object.fromEntries(fragment), { lang: 'en' })
      assertUntouched(child)
    })
  }

  it('PGO-BVA-04 mixed ?view=settings&lang=fr&next=https://example.invalid/ → only view=settings survives', async (t) => {
    const { h, child, gen } = await readyHarness(t)
    const answer = await h.send(ROUTE.document + '?view=settings&lang=fr&next=' + encodeURIComponent('https://example.invalid/'))
    const fragment = assertAdmission(answer, gen.access)
    assert.deepEqual(Object.fromEntries(fragment), { view: 'settings' })
    assert.equal(answer.headers.location.includes('example.invalid'), false)
    assertUntouched(child)
  })

  it('PGO-DT-01 DT R1 unauthenticated main session → 401, no location, nativeEmbedAccess never called', async (t) => {
    const { h, child } = await readyHarness(t)
    assertRefused(await h.send(ROUTE.document + '?view=settings', { headers: { ...SAME_ORIGIN, [UNAUTHENTICATED_MARK]: '1' } }), HTTP_STATUS.unauthorized)
    assert.equal(h.calls.nativeAccess, 0)
    assertUntouched(child)
  })

  it('PGO-DT-02 DT cross-site fetch → 403, no location, nativeEmbedAccess never called', async (t) => {
    const { h, child } = await readyHarness(t)
    assertRefused(await h.send(ROUTE.document, { headers: CROSS_SITE }), HTTP_STATUS.forbidden)
    assert.equal(h.calls.nativeAccess, 0)
    assertUntouched(child)
  })

  for (const [id, query] of [['PGO-EP-09', 'token=fbtest-supplied-token'], ['PGO-EP-10', 'view=settings&token=']]) {
    it(id + ' EP token query on the broker URL ?' + query + ' → 400, no location', async (t) => {
      const { h, child } = await readyHarness(t)
      assertRefused(await h.send(ROUTE.document + '?' + query), HTTP_STATUS.badRequest)
      assertUntouched(child)
    })
  }

  for (const [id, status] of [['PGO-DT-03', STATUS.starting], ['PGO-DT-04', STATUS.failed]]) {
    it(id + ' DT R3 status ' + status.state + ' → 503, no location, no token', async (t) => {
      const child = await spyChild(t)
      const gen = generation(child, SENTINEL.tokenA, SENTINEL.generationA)
      const h = await nativeHarness(t, { status, access: gen.access })
      assertRefused(await h.send(ROUTE.document + '?lang=zh'), HTTP_STATUS.unavailable)
      assertUntouched(child)
    })
  }

  it('PGO-DT-05 DT R2 nativeEmbedAccess rejects → 503, no location', async (t) => {
    const child = await spyChild(t)
    const h = await nativeHarness(t, { access: () => Promise.reject(new Error(SENTINEL.failure + ' ' + SENTINEL.tokenA)) })
    assertRefused(await h.send(ROUTE.document), HTTP_STATUS.unavailable)
    assertUntouched(child)
  })

  it('PGO-DT-06 DT R2 nativeEmbedAccess answers an already-aborted signal (retired generation) → 503', async (t) => {
    const child = await spyChild(t)
    const gen = generation(child, SENTINEL.tokenA, SENTINEL.generationA)
    gen.controller.abort()
    const h = await nativeHarness(t, { access: gen.access })
    assertRefused(await h.send(ROUTE.document), HTTP_STATUS.unavailable)
    assertUntouched(child)
  })

  // Each row changes exactly one property of an otherwise exact authority (Decision Table R5).
  const inexact = [
    ['PGO-DT-07', 'authenticatedUrl on a sibling port', (c, s) => ({ authenticatedUrl: s.origin + '/?token=' + SENTINEL.tokenA })],
    ['PGO-DT-08', 'host not 127.0.0.1', (c) => ({ origin: 'http://example.invalid:' + c.port, authenticatedUrl: 'http://example.invalid:' + c.port + '/?token=' + SENTINEL.tokenA })],
    ['PGO-DT-09', 'https scheme', (c) => ({ origin: 'https://' + LOOPBACK + ':' + c.port, authenticatedUrl: 'https://' + LOOPBACK + ':' + c.port + '/?token=' + SENTINEL.tokenA })],
    ['PGO-DT-10', 'extra query parameter', (c) => ({ authenticatedUrl: c.origin + '/?token=' + SENTINEL.tokenA + '&view=settings' })],
    ['PGO-DT-11', 'two token parameters', (c) => ({ authenticatedUrl: c.origin + '/?token=' + SENTINEL.tokenA + '&token=' + SENTINEL.tokenA })],
    ['PGO-DT-12', 'empty token', (c) => ({ authenticatedUrl: c.origin + '/?token=' })],
    ['PGO-DT-13', 'path other than /', (c) => ({ authenticatedUrl: c.origin + '/x/?token=' + SENTINEL.tokenA })],
    ['PGO-DT-14', 'userinfo', (c) => ({ authenticatedUrl: 'http://fbuser:fbpass@' + LOOPBACK + ':' + c.port + '/?token=' + SENTINEL.tokenA })],
    ['PGO-DT-15', 'fragment', (c) => ({ authenticatedUrl: c.origin + '/?token=' + SENTINEL.tokenA + '#view=settings' })],
    ['PGO-DT-16', 'no token parameter', (c) => ({ authenticatedUrl: c.origin + '/' })],
  ]
  for (const [id, label, change] of inexact) {
    it(id + ' DT R5 inexact authority (' + label + ') → 503, never followed', async (t) => {
      const child = await spyChild(t)
      const sibling = await spyChild(t)
      const gen = generation(child, SENTINEL.tokenA, SENTINEL.generationA)
      const h = await nativeHarness(t, { access: { ...gen.access, ...change(child, sibling) } })
      assertRefused(await h.send(ROUTE.document + '?view=settings&lang=zh'), HTTP_STATUS.unavailable)
      assertUntouched(child, sibling)
    })
  }

  it('PGO-ST-01 ST generation A → B: the next launch redirects to B only', async (t) => {
    const childA = await spyChild(t)
    const childB = await spyChild(t)
    const genA = generation(childA, SENTINEL.tokenA, SENTINEL.generationA)
    const genB = generation(childB, SENTINEL.tokenB, SENTINEL.generationB)
    const h = await nativeHarness(t, { access: genA.access })
    assertAdmission(await h.send(ROUTE.document), genA.access)
    genA.controller.abort()
    h.setAccess(genB.access)
    const answer = await h.send(ROUTE.document)
    assertAdmission(answer, genB.access)
    assert.equal(answer.headers.location.includes(SENTINEL.tokenA), false, 'old token reused')
    assert.equal(answer.headers.location.includes(String(childA.port)), false, 'old port reused')
    assertUntouched(childA, childB)
  })

  it('PGO-ST-02 ST late generation-A access retired before it resolves → no redirect; next launch → B', async (t) => {
    const childA = await spyChild(t)
    const childB = await spyChild(t)
    const genA = generation(childA, SENTINEL.tokenA, SENTINEL.generationA)
    const genB = generation(childB, SENTINEL.tokenB, SENTINEL.generationB)
    let release
    let entered
    const accessEntered = new Promise((resolve) => { entered = resolve })
    const h = await nativeHarness(t, { access: () => { entered(); return new Promise((resolve) => { release = resolve }) } })
    const late = h.send(ROUTE.document)
    await accessEntered
    genA.controller.abort()
    h.setAccess(genB.access)
    release(genA.access)
    assertRefused(await late, HTTP_STATUS.unavailable)
    assertAdmission(await h.send(ROUTE.document), genB.access)
    assertUntouched(childA, childB)
  })

  for (const [index, target] of ROUTE.otherPaths.entries()) {
    it('PGO-EP-' + (11 + index) + ' EP other path ' + target + ' under the prefix → 404, child untouched', async (t) => {
      const { h, child } = await readyHarness(t)
      assertRefused(await h.send(target), HTTP_STATUS.notFound)
      assertUntouched(child)
    })
  }

  it('PGO-ST-03 ST POST / while not ready is the Retry: restart() called, no token returned', async (t) => {
    const child = await spyChild(t)
    const gen = generation(child, SENTINEL.tokenA, SENTINEL.generationA)
    const h = await nativeHarness(t, { status: STATUS.failed, access: gen.access, afterRestart: STATUS.ready })
    const answer = await h.send(ROUTE.document + '?view=settings&lang=zh', { method: 'POST', body: '' })
    assert.equal(h.calls.restart, 1)
    assertNoSecret(answer)
    assert.equal((answer.headers.location ?? '').includes(SENTINEL.tokenA), false)
    assertUntouched(child)
  })

  it('PGO-ST-04 ST after close() → no location, no token', async (t) => {
    const { h, child } = await readyHarness(t)
    h.close()
    // A closed broker may also drop the connection; a dropped request carries no location either.
    const answer = await h.send(ROUTE.document).catch(() => ({ status: 0, headers: {}, body: '' }))
    assert.equal(answer.headers.location, undefined, 'no location after close, status ' + answer.status)
    assertNoSecret(answer)
    assertUntouched(child)
  })
})
