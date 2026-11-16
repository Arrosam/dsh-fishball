/**
 * Round-2 BUG 2 — a failed child start no longer hides its reason.
 *
 * Requirements (round-2 brief, derived only from it):
 * - R2.1 the instance status keeps `state: 'failed'` and `code: 'NATIVE_START_FAILED'` and gains a
 *   string `detail`: the SPECIFIC failure code, then (when the failure has a message) ': ' and the
 *   sanitized first line of that message; at most 2000 code points; credential-like text and user
 *   home paths (/Users/<name>/…, /home/…, /root) become '[redacted]'. Not failed → `detail: null`.
 * - R2.2 lifecycle.log records the failure as a line {code: 'FAILED', reason} with reason the
 *   specific code (UPPER_SNAKE only, never message text, a path or a URL).
 * - R2.3 POST /api/dsh-instance/retry answers the same {state, code, detail} shape.
 * - R2.4 detail is read from /api/dsh-instance/status; I-READY removed the never-deployed
 *   V2 native/status relay. The historical nativeStatus helper now reads the instance route.
 *
 * Observation: a REAL DSH boot of the main profile (support/host.mjs) per SDK selected by
 * FBTEST_DSH_RUNTIME, its owner-only routes and <home>/fishball/runtime/lifecycle.log. Failures are
 * real: (a) a dependency with an invalid package.json under the child profile's node_modules,
 * refused by the real preflight as PREFLIGHT_MANIFEST; (b) an unparsable child profile manifest
 * whose JSON error quotes the planted text, which is how home paths and multi-line text reach a
 * real message. The child profile only exists after a first start, so every plant follows a first
 * ready boot.
 * Moved fault (decision A, 2026-11-11): R2-UC-01..03, R2-DT-01, R2-ST-01 and R2-EP-01 used a
 * planted @deepseek-ai/schemastery shadow (PREFLIGHT_CORE_SHADOW, the round-2 e2e symptom). That
 * copy no longer fails a start (test/v2-r4-core-copy.test.mjs), so they use fault (a) instead; the
 * R2.x requirements they check are unchanged.
 *
 * | id | technique | requirement | expected |
 * |----|-----------|-------------|----------|
 * | R2-UC-01 | Use Case (preflight refusal) | R2.1, R2.4 | invalid dependency manifest → failed / NATIVE_START_FAILED / detail 'PREFLIGHT_MANIFEST: <one line>' on both status routes |
 * | R2-UC-02 | Use Case | R2.2 | lifecycle FAILED line with reason PREFLIGHT_MANIFEST; no message, path or URL in the line |
 * | R2-UC-03 | Use Case | R2.3 | Retry while the cause persists answers {state, code, detail} with the same detail |
 * | R2-EP-01 | EP (not failed) | R2.1 | ready → detail null on both routes and on Retry |
 * | R2-ST-01 | State Transition ready → failed → (Retry, cause removed) → ready | R2.1 | detail appears with failed and returns to null with ready |
 * | R2-EP-02 | EP (second failure class: malformed child manifest) | R2.1, R2.2 | detail '<CODE>: <line>', CODE an identifier equal to the lifecycle reason |
 * | R2-EP-03 | EP (multi-line message source) | R2.1 | detail is a single line; the planted second line never appears |
 * | R2-SEC-01..03 | EP (home roots /Users/<name>, /home, /root) | R2.1 | the planted home path is not in detail; '[redacted]' is |
 * | R2-BVA-01 | BVA (length bound) | R2.1 | every observed detail is ≤ 2000 code points |
 * | R2-DT-01 | DT (state × route) | R2.4 | status, native/status and Retry agree on detail for failed and ready |
 * TODO (no black-box seam): R2.1 at exactly 2000/2001 code points (no real failure carries a message
 * that long), and R2.3's card text under the status line in the main Plugins page (needs the main
 * web UI in a browser; the card's data is the status route checked here).
 */
import assert from 'node:assert/strict'
import { after, describe, it, test } from 'node:test'
import { RUNTIME } from './support/constants.mjs'
import { newHome } from './support/host.mjs'
import { R2, R2_BUDGET, bootAfterFault, lifecycleLines, plantInvalidManifest, removeHome, replaceChildManifest, selectedSdk, settledStatus } from './support/v2-r2.mjs'

const SDK = selectedSdk(RUNTIME)
const LIMIT = Object.freeze({ detailCodePoints: 2000 })
/** Unparsable child manifests (case R2-EP-02/03, R2-SEC-*). Each JSON error quotes its first characters. */
const MANIFEST = Object.freeze({
  malformed: '{',
  multiline: '{"a":\n"FBTEST-SECOND-LINE-MARK',
  secondLineMark: 'FBTEST-SECOND-LINE-MARK',
  homes: Object.freeze([
    Object.freeze({ id: 'R2-SEC-01', root: '/Users/', body: '/Users/fbtestperson/secret' }),
    Object.freeze({ id: 'R2-SEC-02', root: '/home/', body: '/home/fbtestperson/secret' }),
    Object.freeze({ id: 'R2-SEC-03', root: '/root', body: '/root/fbtest-secret' }),
  ]),
})
const URL_LIKE = /https?:\/\//
const codePoints = (text) => [...text].length

/** R2.1 shape: returns {code, message|undefined}. */
function assertDetail(detail, why) {
  assert.equal(typeof detail, 'string', why + ': detail is a string, got ' + JSON.stringify(detail))
  assert.ok(codePoints(detail) <= LIMIT.detailCodePoints, why + ': detail ≤ ' + LIMIT.detailCodePoints + ' code points (' + codePoints(detail) + ')')
  assert.equal(/[\r\n]/.test(detail), false, why + ': detail is one line: ' + JSON.stringify(detail))
  const match = R2.detailShape.exec(detail)
  assert.ok(match, why + ': detail is "<CODE>" or "<CODE>: <message>": ' + JSON.stringify(detail))
  return { code: match[1], message: match[2] }
}
function assertFailed(answer, why) {
  assert.equal(answer?.state, R2.state.failed, why + ': state failed, got ' + JSON.stringify(answer))
  assert.equal(answer.code, R2.code.startFailed, why + ': code stays NATIVE_START_FAILED')
  return assertDetail(answer.detail, why)
}
function assertReady(answer, why) {
  assert.equal(answer?.state, R2.state.ready, why + ': ready, got ' + JSON.stringify(answer))
  assert.equal(answer.code, null, why + ': no code')
  assert.ok(Object.hasOwn(answer, 'detail'), why + ': the answer has a detail key')
  assert.equal(answer.detail, null, why + ': detail null when not failed')
}
/** R2.2: the newest FAILED line; reason an identifier equal to `code`, no message/path/URL in it. */
function assertFailureLogged(home, code, message) {
  const failed = lifecycleLines(home).filter((line) => line.json.code === R2.lifecycle.failed)
  assert.ok(failed.length > 0, 'a FAILED lifecycle line: ' + JSON.stringify(lifecycleLines(home).map((l) => l.json)))
  const last = failed.at(-1)
  assert.match(String(last.json.reason), R2.identifier, 'reason is an UPPER_SNAKE identifier: ' + last.raw)
  assert.equal(last.json.reason, code, 'reason is the specific failure code')
  assert.equal(last.raw.includes(home), false, 'no home path in the lifecycle line: ' + last.raw)
  assert.equal(URL_LIKE.test(last.raw), false, 'no URL in the lifecycle line')
  if (message) assert.equal(last.raw.includes(message), false, 'no message text in the lifecycle line: ' + last.raw)
  return last
}

/** One boot per describe: first ready boot (creates the child profile), then the given fault, then a reboot. */
const homes = []
after(() => { for (const home of homes.splice(0)) removeHome(home) })
async function failedBoot(t, label, fault) {
  const home = newHome('v2-r2-' + label)
  homes.push(home)
  const { host, restore } = await bootAfterFault(t, home, fault, (_first, status) => assertReady(status, 'precondition: first boot ready'))
  return { home, host, restore }
}
const read = async (host) => ({
  status: (await host.get(R2.route.status)).json,
  native: (await host.get(R2.route.nativeStatus)).json,
})

describe(`R2 [${SDK}] a failed start reports its specific reason`, { timeout: R2_BUDGET.caseMs * 3 }, () => {
  it('R2-UC-01/02/03 + R2-DT-01 + R2-ST-01 + R2-EP-01 a dependency with an invalid package.json in the child profile, through status, native/status, lifecycle and Retry', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const { home, host, restore } = await failedBoot(t, 'bad-dep-manifest', plantInvalidManifest)
    // R2-UC-01 / R2.4: both status routes.
    const failed = await settledStatus(host)
    const detail = assertFailed(failed, 'R2-UC-01 status')
    assert.equal(detail.code, R2.faultCode, 'R2-UC-01: the specific preflight code: ' + failed.detail)
    assert.ok(detail.message, 'R2-UC-01: the preflight refusal has a message, so detail carries ": <first line>"')
    const native = (await host.get(R2.route.nativeStatus)).json
    assert.equal(native.state, R2.state.failed)
    assert.equal(native.code, R2.code.startFailed)
    assert.equal(native.detail, failed.detail, 'R2-DT-01: native/status carries the same detail')
    // R2-UC-02 / R2.2.
    assertFailureLogged(home, R2.faultCode, detail.message)
    // R2-UC-03 / R2.3: Retry with the cause still there answers the same shape and detail.
    const retried = await host.post(R2.route.retry, {})
    assert.deepEqual(Object.keys(retried.json ?? {}).sort(), [...R2.publicKeys], 'R2-UC-03: Retry answers exactly {state, code, detail}: ' + retried.text)
    assertFailed(retried.json, 'R2-UC-03 Retry')
    assert.equal(retried.json.detail, failed.detail, 'R2-UC-03: Retry shows the new (same) detail')
    // R2-ST-01 + R2-EP-01: remove the cause, Retry → ready, detail back to null everywhere.
    restore()
    const recovered = await host.post(R2.route.retry, {})
    assert.deepEqual(Object.keys(recovered.json ?? {}).sort(), [...R2.publicKeys], 'Retry answers {state, code, detail}')
    const ready = recovered.json.state === R2.state.ready ? recovered.json : await settledStatus(host, [R2.state.ready])
    assertReady(ready, 'R2-ST-01 after Retry')
    const after = await read(host)
    assertReady(after.status, 'R2-EP-01 status')
    assertReady({ ...after.native, state: after.native.state }, 'R2-EP-01 native/status')
  })

  it('R2-EP-02 + R2-BVA-01 a malformed child manifest: detail "<CODE>: <line>", CODE = lifecycle reason', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const { home, host, restore } = await failedBoot(t, 'manifest', (h) => replaceChildManifest(h, MANIFEST.malformed))
    t.after(restore)
    const failed = await settledStatus(host)
    const detail = assertFailed(failed, 'R2-EP-02')
    assert.ok(detail.message, 'a JSON parse failure has a message: ' + failed.detail)
    assertFailureLogged(home, detail.code, detail.message)
    assert.equal((await read(host)).native.detail, failed.detail, 'native/status agrees')

    // R2-EP-03: a message source spanning two lines → one line, the second never shown.
    replaceChildManifest(home, MANIFEST.multiline)
    const multi = await host.post(R2.route.retry, {})
    assertFailed(multi.json, 'R2-EP-03')
    assert.equal(multi.json.detail.includes(MANIFEST.secondLineMark), false, 'R2-EP-03: no text of the second line: ' + multi.json.detail)

    // R2-SEC-01..03: each home root quoted by the real JSON error is masked.
    for (const entry of MANIFEST.homes) {
      replaceChildManifest(home, entry.body)
      const answer = (await host.post(R2.route.retry, {})).json
      const shown = assertFailed(answer, entry.id)
      assert.equal(answer.detail.includes(entry.root), false, entry.id + ': ' + entry.root + ' is masked: ' + answer.detail)
      assert.ok(answer.detail.includes(R2.redacted), entry.id + ': the masked text reads [redacted]: ' + answer.detail)
      assertFailureLogged(home, shown.code, shown.message)
    }
  })
})

// Requirement clauses with no black-box seam in this harness stay visible as TODO, never as a pass.
test.todo(`R2-BVA-02 [${SDK}] R2.1 detail at exactly 2000 and 2001 code points — no real start failure carries a message that long; needs a failure seam`)
test.todo(`R2-UC-04 [${SDK}] R2.3 the main Plugins card (row dsh-instance) shows detail under the status line while failed — needs the main web UI in a browser; its data (status/Retry routes) is R2-UC-01/03`)
