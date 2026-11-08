/**
 * Regression of the bearer proxy's admission order, which §18.7 keeps "as regression of the
 * existing bearer proxy (no task owns new work)" (docs/slim-native-design.md §3.6, §18.5
 * inst-OQ-11 and the D28 note above it: "inst-OQ-11 and -13 stand for the bearer proxy, without
 * the token rule (there is no launch token; a browser `token` query is still refused 400)").
 * Not in the I9 task list; written because the 503 harness reaches it for free.
 * Observation point: createEmbedBroker on a loopback server (test/support/body-soul-http.mjs).
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I3-ADM-01 | EP (inst-OQ-11 (1)) | PUT → 405 with `Allow: GET, HEAD, POST` |
 * | I3-ADM-02 | DT (inst-OQ-11 order) | PUT with a `..` path → 405 (method before path) |
 * | I3-ADM-03 | EP (inst-OQ-11 (2)) | encoded `..` / backslash under the prefix → 400 |
 * | I3-ADM-04 | EP (inst-OQ-11 (3)) | `Sec-Fetch-Site: cross-site` → 403 |
 * | I3-ADM-05..07 | EP (inst-OQ-11 (3)) | `same-site` / `none` / absent header → accepted (here: the 503 page, not 403) |
 * | I3-ADM-08 | EP (inst-OQ-11 (4), -12) | a `token` query → 400, never forwarded |
 * | I3-ADM-09 | P (inst-OQ-12) | `/fishball/embed` without the slash → 308 to `/fishball/embed/` |
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { embedHarness } from './support/body-soul-http.mjs'

const DOC = '/fishball/embed/'
const NOT_READY = Object.freeze({ enabled: true, state: 'failed', code: 'NATIVE_CHILD_EXITED' })
const READY = Object.freeze({ enabled: true, state: 'ready', code: null })
const htmlLang = (body) => /<html[^>]*\blang="([^"]*)"/i.exec(body)?.[1]

describe('I3 regression: the bearer proxy admission order (inst-OQ-11)', () => {
  it('I3-ADM-01 PUT → 405 with Allow: GET, HEAD, POST', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const answer = await h.send(DOC, { method: 'PUT' })
    assert.equal(answer.status, 405)
    assert.equal(answer.headers.allow, 'GET, HEAD, POST')
  })
  it('I3-ADM-02 PUT with a bad path → 405 (the method is checked first)', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    assert.equal((await h.send('/fishball/embed/ui/%2e%2e/x', { method: 'PUT' })).status, 405)
  })
  for (const target of ['/fishball/embed/ui/%2e%2e/secret', '/fishball/embed/ui/%2E%2E/secret', '/fishball/embed/ui/a\\b']) {
    it('I3-ADM-03 path ' + target + ' → 400', async (t) => {
      const h = await embedHarness(t, { status: READY })
      assert.equal((await h.send(target)).status, 400)
      assert.equal(h.calls.access, 0, 'never forwarded')
    })
  }
  it('I3-ADM-04 Sec-Fetch-Site: cross-site → 403, no error page', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const answer = await h.send(DOC + '?lang=zh', { headers: { 'sec-fetch-site': 'cross-site' } })
    assert.equal(answer.status, 403)
    assert.equal(answer.body.includes(NOT_READY.code), false)
  })
  for (const [id, headers, label] of [['I3-ADM-05', { 'sec-fetch-site': 'same-site' }, 'same-site'], ['I3-ADM-06', { 'sec-fetch-site': 'none' }, 'none (typed URL, Open in a tab)'], ['I3-ADM-07', {}, 'absent']]) {
    it(id + ' Sec-Fetch-Site ' + label + ' is accepted (the 503 page, not 403)', async (t) => {
      const h = await embedHarness(t, { status: NOT_READY })
      const answer = await h.send(DOC + '?lang=zh', { headers })
      assert.equal(answer.status, 503)
      assert.equal(htmlLang(answer.body), 'zh-CN')
    })
  }
  it('I3-ADM-08 a token query → 400, never forwarded', async (t) => {
    const h = await embedHarness(t, { status: READY })
    const answer = await h.send(DOC + '?token=fbtest-token')
    assert.equal(answer.status, 400)
    assert.equal(h.calls.access, 0)
  })
  it('I3-ADM-09 /fishball/embed without the slash → 308 to /fishball/embed/', async (t) => {
    const h = await embedHarness(t, { status: NOT_READY })
    const answer = await h.send('/fishball/embed')
    assert.equal(answer.status, 308)
    assert.equal(new URL(answer.headers.location, 'http://main.invalid').pathname, DOC)
  })
})
