/**
 * I9 — the main proxy's 503 page follows `lang` (docs/slim-native-design.md §0.5 "Languages",
 * §3.3, §3.6, §11, §18.2 I9 R1/R2, §18.5 inst-OQ-12/-13). The admission order (inst-OQ-11) is in
 * body-soul-i3-admission.test.mjs.
 * Observation point: createEmbedBroker({service, connection}) of
 * packages/instance/src/slim/host/embed.js on a real loopback http.Server (port 0), with a
 * stand-in lifecycle service (status / embedAccess / restart) and a stand-in DSH admission that
 * refuses `Sec-Fetch-Site: cross-site` with 403 as DSH's requestRejection does (inst-OQ-11 (3)).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I9-503-P-01 | P | not ready + `?lang=zh` → 503 HTML, `<html lang="zh-CN">`, Chinese words |
 * | I9-503-EP-01..05 | EP | no lang / `lang=en` / `lang=ZH` / `lang=zh-CN` / `lang=en&lang=zh` → `<html lang="en">`, no Chinese |
 * | I9-503-EP-06 | EP | `lang=zh&lang=en` → Chinese (first wins) |
 * | I9-503-EP-07 | EP | `view=settings&lang=zh` → Chinese |
 * | I9-503-DT-01 | DT (inst-OQ-13) | state `connector-missing` / `failed`+code / `stopped` / `starting` / `waiting` → 503 page |
 * | I9-503-P-02 | P (§3.6) | the failed page names its code (carries the error) |
 * | I9-503-P-03 | P (§3.6) | the page has a Retry form whose target is the same document URL with its query (`lang`, `view`) |
 * | I9-503-ST-01 | ST | POST (Retry) to `?lang=zh&view=settings`, restart ends failed → 503 in Chinese; restart called once |
 * | I9-503-ST-02 | ST | POST (Retry), restart ends ready → the answer leads back to the document with `lang` and `view` |
 * | I9-503-SEC-01 | EP (§11) | no planted bearer, child origin/port, private path or launch detail in any 503 body |
 * | I9-503-EP-08 | EP (§11, conn-OQ-53) | `status()` throws → 503 page with `failed` and `NATIVE_UNAVAILABLE` |
 * | I9-503-EP-09 | EP (§11) | an unknown state or code is not echoed |
 * | I9-503-P-04 | P (inst-OQ-12) | the document answer has X-Frame-Options SAMEORIGIN, Referrer-Policy no-referrer, Cache-Control no-store, CSP frame-ancestors 'self' |
 * | I9-503-EP-10 | EP | HEAD → 503 with no body |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CJK } from './support/body-soul-env.mjs'
import { PLANTED, embedHarness } from './support/body-soul-http.mjs'

const DOC = '/fishball/embed/'
const NOT_READY = Object.freeze({ enabled: true, state: 'failed', code: 'NATIVE_CHILD_EXITED' })
const READY = Object.freeze({ enabled: true, state: 'ready', code: null })
const htmlLang = (body) => /<html[^>]*\blang="([^"]*)"/i.exec(body)?.[1]

function assertNoSecret(body) {
  for (const [name, value] of Object.entries(PLANTED)) assert.equal(body.includes(value), false, 'planted ' + name + ' leaked')
  assert.equal(new URL(PLANTED.origin).port !== '' && body.includes(new URL(PLANTED.origin).port), false, 'child port leaked')
  assert.equal(/bearer/i.test(body), false, 'no bearer word')
  assert.equal(/\/Users\/|\/home\/|[A-Z]:\\/.test(body), false, 'no file path')
}

describe('I9 the 503 page follows lang', () => {
  it('I9-503-P-01 not ready + ?lang=zh → 503 HTML in Chinese, <html lang="zh-CN">', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const answer = await h.send(DOC + '?lang=zh')
    assert.equal(answer.status, 503)
    assert.match(answer.headers['content-type'] ?? '', /^text\/html/)
    assert.equal(htmlLang(answer.body), 'zh-CN')
    assert.ok(CJK.test(answer.body), 'Chinese words')
    assertNoSecret(answer.body)
  })

  for (const [id, query] of [['I9-503-EP-01', ''], ['I9-503-EP-02', '?lang=en'], ['I9-503-EP-03', '?lang=ZH'], ['I9-503-EP-04', '?lang=zh-CN'], ['I9-503-EP-05', '?lang=en&lang=zh']]) {
    it(id + ' ' + (query || 'no lang') + ' → English, <html lang="en">', async (t) => {
      const h = await embedHarness(t, { status: NOT_READY })
      const answer = await h.send(DOC + query)
      assert.equal(answer.status, 503)
      assert.equal(htmlLang(answer.body), 'en')
      assert.equal(CJK.test(answer.body), false, 'no Chinese words')
    })
  }
  for (const [id, query] of [['I9-503-EP-06', '?lang=zh&lang=en'], ['I9-503-EP-07', '?view=settings&lang=zh']]) {
    it(id + ' ' + query + ' → Chinese', async (t) => {
      const h = await embedHarness(t, { status: NOT_READY })
      const answer = await h.send(DOC + query)
      assert.equal(htmlLang(answer.body), 'zh-CN')
      assert.ok(CJK.test(answer.body))
    })
  }

  for (const status of [
    { enabled: true, state: 'connector-missing', code: null },
    NOT_READY,
    { enabled: true, state: 'stopped', code: null },
    { enabled: true, state: 'starting', code: null },
    { enabled: true, state: 'waiting', code: null },
  ]) {
    it('I9-503-DT-01 state ' + status.state + ' → 503 error page (both languages)', async (t) => {
      const h = await embedHarness(t, { status })
      for (const [query, lang] of [['?lang=zh', 'zh-CN'], ['?lang=en', 'en']]) {
        const answer = await h.send(DOC + query)
        assert.equal(answer.status, 503)
        assert.equal(htmlLang(answer.body), lang)
        assertNoSecret(answer.body)
      }
      assert.equal(h.calls.access, 0, 'nothing is forwarded while not ready')
    })
  }

  it('I9-503-P-02 a failed page carries its code', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    for (const query of ['?lang=zh', '?lang=en']) assert.ok((await h.send(DOC + query)).body.includes(NOT_READY.code))
  })

  it('I9-503-P-03 the Retry form posts to the same document URL, query included', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const target = DOC + '?lang=zh&view=settings'
    const answer = await h.send(target)
    const form = /<form\b([^>]*)>/i.exec(answer.body)
    assert.ok(form, 'a Retry form')
    assert.match(form[1], /\bmethod\s*=\s*"?post"?/i)
    const action = /\baction\s*=\s*"([^"]*)"/i.exec(form[1])?.[1]
    // An absent action (or an empty one) submits to the document's own URL, query included.
    const base = new URL(target, 'http://main.invalid')
    const resolved = action === undefined || action === '' ? base : new URL(action, base)
    assert.equal(resolved.pathname + resolved.search, target)
  })

  it('I9-503-ST-01 Retry POST to ?lang=zh&view=settings that stays failed → 503 in Chinese', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY, afterRestart: NOT_READY })
    const answer = await h.send(DOC + '?lang=zh&view=settings', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin', 'content-type': 'application/x-www-form-urlencoded' }, body: '' })
    assert.equal(answer.status, 503)
    assert.equal(htmlLang(answer.body), 'zh-CN')
    assert.ok(CJK.test(answer.body))
    assert.equal(h.calls.restart, 1)
    assertNoSecret(answer.body)
  })

  it('I9-503-ST-02 Retry POST that ends ready leads back to the document with lang and view', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY, afterRestart: READY })
    const answer = await h.send(DOC + '?lang=zh&view=settings', { method: 'POST', headers: { 'sec-fetch-site': 'same-origin' }, body: '' })
    assert.equal(h.calls.restart, 1)
    assert.ok(answer.status >= 300 && answer.status < 400, 'a redirect back to the page, got ' + answer.status)
    const location = new URL(answer.headers.location, 'http://main.invalid')
    assert.equal(location.pathname, DOC)
    assert.equal(location.searchParams.get('lang'), 'zh')
    assert.equal(location.searchParams.get('view'), 'settings')
  })

  it('I9-503-EP-08 a status() that throws → 503 with failed and NATIVE_UNAVAILABLE', async (t) => {
    const h = await embedHarness(t, { status: () => { throw new Error(PLANTED.detail + ' ' + PLANTED.path) } })
    const answer = await h.send(DOC + '?lang=en')
    assert.equal(answer.status, 503)
    assert.ok(answer.body.includes('failed'))
    assert.ok(answer.body.includes('NATIVE_UNAVAILABLE'))
    assertNoSecret(answer.body)
  })

  it('I9-503-EP-09 an unknown state and code are not echoed', async (t) => {
    const h = await embedHarness(t, { status: { enabled: true, state: 'fbtest-state-<b>x</b>', code: 'FBTEST_UNKNOWN_CODE', detail: PLANTED.detail } })
    for (const query of ['?lang=zh', '?lang=en']) {
      const answer = await h.send(DOC + query)
      assert.equal(answer.status, 503)
      assert.equal(answer.body.includes('fbtest-state'), false)
      assert.equal(answer.body.includes('FBTEST_UNKNOWN_CODE'), false)
      assertNoSecret(answer.body)
    }
  })

  it('I9-503-P-04 the document answer carries the §3.3 framing headers', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const { headers } = await h.send(DOC + '?lang=zh')
    assert.equal(headers['x-frame-options'], 'SAMEORIGIN')
    assert.equal(headers['referrer-policy'], 'no-referrer')
    assert.equal(headers['cache-control'], 'no-store')
    assert.match(headers['content-security-policy'] ?? '', /frame-ancestors 'self'/)
  })

  it('I9-503-EP-10 HEAD → 503 with no body', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const answer = await h.send(DOC + '?lang=zh', { method: 'HEAD' })
    assert.equal(answer.status, 503)
    assert.equal(answer.body, '')
  })
})
