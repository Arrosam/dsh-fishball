/**
 * Round-4 — a child that exits while its start is still in progress keeps NATIVE_CHILD_EXITED and
 * still publishes the start's cause.
 *
 * Requirements (brief, derived only from it; main host row `fishball-instance`, the start path):
 * - R1 a failed start → state `failed`, `detail` = '<specific code>' + ': ' + first message line
 *   (sanitized, ≤ 2000 chars; the code is not repeated when the message already starts with it);
 *   the row's logger gets exactly one warn `start failed (%s)` whose only argument is the code.
 * - R2 race: the child exits during the start → onExit sets failed / NATIVE_CHILD_EXITED before the
 *   start's rejection arrives; the code STAYS NATIVE_CHILD_EXITED (never NATIVE_START_FAILED), and
 *   `detail` is the start failure's detail (e.g. beginning with CHILD_EXITED), not null; the warn
 *   line is still logged once for that start.
 * - R3 a start that fails while the state is neither `starting` nor failed/NATIVE_CHILD_EXITED (the
 *   row was stopped meanwhile) changes neither state, code nor detail.
 * - R4 detail is null whenever the state is not a failed start.
 *
 * Observation: a REAL DSH boot of the main profile (support/host.mjs) per SDK selected by
 * FBTEST_DSH_RUNTIME; its owner-only status/Retry routes; <home>/fishball/runtime (lifecycle.log,
 * launches/<instanceId>/pid.json); and the worker's loggedProblems (DSH's logger exporter, warn and
 * error lines of every logger, args joined with a space, so `start failed (%s) CODE` is the format
 * string followed by its single argument).
 * The race is driven from outside: the child's pid is read from its launch record as soon as the
 * record appears (state `starting`, before READY) and the child is SIGKILLed — a real exit of the
 * real child during its start. R3's "stopped meanwhile" is the connector being disabled through
 * DSH's plugin manager after CHILD_BOOT (the row then stops the child it was starting).
 *
 * | id | technique | requirement | expected |
 * |----|-----------|-------------|----------|
 * | R4-EXIT-01 | State Transition starting → (child killed) → failed | R2, R1 | failed / NATIVE_CHILD_EXITED (never NATIVE_START_FAILED in any poll); detail '<CODE>[: line]' starting CHILD_EXITED, CODE = lifecycle FAILED reason; one warn 'start failed (%s) CODE' |
 * | R4-EXIT-02 | State Transition failed(race) → Retry → ready | R4 | ready / code null / detail null on Retry and status |
 * | R4-EXIT-03 | BVA (failed but not a failed start: exit after ready) | R4 | failed / NATIVE_CHILD_EXITED / detail null (no stale detail); no new start-failed warn |
 * | R4-EXIT-04 | State Transition failed → Retry → (retry's child killed) → failed | R2 | same as R4-EXIT-01 for the Retry start; the warn count grows by exactly one |
 * | R4-EXIT-05 | State Transition starting → stopping (connector disabled) → start fails | R3, R4 | the start did fail (lifecycle FAILED) yet state stays the stop's (connector-missing), code null, detail null; never failed |
 * | R4-EXIT-06 | EP (ordinary start failure, no exit race) | R1 | failed / NATIVE_START_FAILED; detail 'PREFLIGHT_MANIFEST: <line>' (planted invalid dependency package.json) with the code not repeated; one warn with only the code |
 * TODO (no black-box seam): R2's ordering "onExit before the start's rejection" is the precondition,
 * not forced; R4-EXIT-01/04 report (diagnostic) whether the intermediate failed/NATIVE_CHILD_EXITED
 * with detail null was seen. R1's 2000-char bound and credential masking are covered in
 * v2-r2-start-detail (no exit-race message carries such text).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, describe, it } from 'node:test'
import { RUNTIME } from './support/constants.mjs'
import { bootHost, newHome } from './support/host.mjs'
import { sleep, until } from './support/util.mjs'
import { R2, R2_BUDGET, lifecycleLines, plantInvalidManifest, removeHome, runtimeDir, selectedSdk, settledStatus } from './support/v2-r2.mjs'

const SDK = selectedSdk(RUNTIME)
const R4 = Object.freeze({
  row: 'fishball-instance',
  state: Object.freeze({ starting: 'starting', ready: 'ready', failed: 'failed', missing: 'connector-missing' }),
  code: Object.freeze({ childExited: 'NATIVE_CHILD_EXITED', startFailed: 'NATIVE_START_FAILED' }),
  /** R2's example: the start failure's own code when its child exits. */
  exitStartCode: 'CHILD_EXITED',
  warn: Object.freeze({ type: 'warn', format: 'start failed (%s)' }),
  lifecycle: Object.freeze({ boot: 'CHILD_BOOT', ready: 'READY', failed: 'FAILED' }),
  pidFile: 'pid.json',
  connector: 'fishball-connector',
  killSignal: 'SIGKILL',
  detailCodePoints: 2000,
})
/** Harness waits (no product oracle). */
const WAIT = Object.freeze({ launchMs: 60_000, launchPollMs: 2, statusPollMs: 20, raceWindowMs: 15_000 })

const homes = []
after(() => { for (const home of homes.splice(0)) removeHome(home) })
const launchesDir = (home) => path.join(runtimeDir(home), R2.launches)
const status = async (host) => (await host.get(R2.route.status)).json

/** Live launch records: instance id → pid (only records whose pid file is already written). */
function launchPids(home) {
  const pids = new Map()
  const dir = launchesDir(home)
  if (!fs.existsSync(dir)) return pids
  for (const id of fs.readdirSync(dir)) {
    try {
      const pid = JSON.parse(fs.readFileSync(path.join(dir, id, R4.pidFile), 'utf8')).pid
      if (Number.isInteger(pid) && pid > 1) pids.set(id, pid)
    } catch { /* not written yet */ }
  }
  return pids
}

/** Wait for a launch record not in `known`, check the start is still in progress, and kill that child. */
async function killNewChildDuringStart(host, home, known) {
  let found
  await until(() => { found = [...launchPids(home)].find(([id]) => !known.has(id)); return found }, WAIT.launchMs, WAIT.launchPollMs)
  assert.ok(found, 'a new child launch record appeared')
  const [instanceId, pid] = found
  const before = await status(host)
  assert.equal(before?.state, R4.state.starting, 'precondition: the start is still in progress when the child is killed: ' + JSON.stringify(before))
  process.kill(pid, R4.killSignal)
  return instanceId
}

/** Poll the status until it settles on failed with a non-null detail; returns every distinct answer seen. */
async function traceUntilFailedWithDetail(host) {
  const seen = []
  await until(async () => {
    const answer = await status(host)
    if (JSON.stringify(seen.at(-1)) !== JSON.stringify(answer)) seen.push(answer)
    return answer?.state === R4.state.failed && answer.detail !== null
  }, WAIT.raceWindowMs, WAIT.statusPollMs)
  return seen
}

/** R1 shape: '<CODE>' or '<CODE>: <line>', one line, ≤ 2000 code points, code not repeated. */
function assertDetail(detail, why) {
  assert.equal(typeof detail, 'string', why + ': detail is a string, got ' + JSON.stringify(detail))
  assert.ok(detail.length > 0, why + ': detail is non-empty')
  assert.ok([...detail].length <= R4.detailCodePoints, why + ': detail ≤ ' + R4.detailCodePoints + ' code points')
  assert.equal(/[\r\n]/.test(detail), false, why + ': detail is one line: ' + JSON.stringify(detail))
  const match = R2.detailShape.exec(detail)
  assert.ok(match, why + ': detail is "<CODE>" or "<CODE>: <line>": ' + JSON.stringify(detail))
  const [, code, message] = match
  if (message !== undefined) assert.equal(message.startsWith(code), false, why + ': the code is not repeated: ' + JSON.stringify(detail))
  return { code, message }
}

/** The row's `start failed (%s)` warn lines since `since` (DSH logger exporter, args joined by ' '). */
async function startFailedWarns(host, since) {
  const problems = await host.call('loggedProblems', { since })
  return problems.filter((p) => p.name === R4.row && p.type === R4.warn.type && p.text.startsWith(R4.warn.format))
}
/** Exactly one warn for this start, whose only argument is `code`. */
async function assertOneWarn(host, since, code, message, why) {
  const warns = await startFailedWarns(host, since)
  assert.equal(warns.length, 1, why + ': exactly one start-failed warn: ' + JSON.stringify(warns))
  assert.equal(warns[0].text, R4.warn.format + ' ' + code, why + ': the warn argument is only the code: ' + warns[0].text)
  if (message) assert.equal(warns[0].text.includes(message), false, why + ': no message text in the warn')
}
const problemCount = async (host) => (await host.call('loggedProblems')).length
const lastFailedReason = (home) => lifecycleLines(home).filter((l) => l.json.code === R4.lifecycle.failed).at(-1)?.json.reason

/** R2: the race outcome as seen on the status route after the child was killed during its start. */
async function assertRaceOutcome(t, host, home, since, why) {
  const seen = await traceUntilFailedWithDetail(host)
  t.diagnostic(why + ' status sequence: ' + JSON.stringify(seen))
  const intermediate = seen.some((s) => s?.state === R4.state.failed && s.code === R4.code.childExited && s.detail === null)
  t.diagnostic(why + ': intermediate onExit status (failed/NATIVE_CHILD_EXITED, detail null) observed: ' + intermediate)
  assert.equal(seen.some((s) => s?.code === R4.code.startFailed), false, why + ': the code never became NATIVE_START_FAILED: ' + JSON.stringify(seen))
  const final = seen.at(-1)
  assert.equal(final?.state, R4.state.failed, why + ': failed: ' + JSON.stringify(final))
  assert.equal(final.code, R4.code.childExited, why + ': the code stays NATIVE_CHILD_EXITED: ' + JSON.stringify(final))
  const detail = assertDetail(final.detail, why)
  assert.equal(detail.code, R4.exitStartCode, why + ': detail begins with the start failure code CHILD_EXITED: ' + final.detail)
  assert.equal(detail.code, lastFailedReason(home), why + ': detail code is the start failure code recorded in lifecycle.log')
  // The status must stay there: the start's rejection is already in (detail set) and nothing reverts it.
  await sleep(WAIT.statusPollMs * 10)
  assert.deepEqual(await status(host), final, why + ': the failed status is stable')
  await assertOneWarn(host, since, detail.code, detail.message, why)
  return final
}

describe(`R4 [${SDK}] a child exit during its start keeps NATIVE_CHILD_EXITED and publishes the start's cause`, { timeout: R2_BUDGET.caseMs * 3 }, () => {
  /** One host for the R4-EXIT-01..04 transition chain; each step starts from the previous one's state. */
  const chain = {}
  after(async () => { await chain.host?.stop().catch(() => {}) })

  it('R4-EXIT-01 the child is killed during the boot start → failed / NATIVE_CHILD_EXITED with the start detail and one warn', { timeout: R2_BUDGET.caseMs }, async (t) => {
    chain.home = newHome('v2-r4-exit')
    homes.push(chain.home)
    chain.host = await bootHost(chain.home)
    const since = await problemCount(chain.host)
    await killNewChildDuringStart(chain.host, chain.home, new Set())
    chain.failed = await assertRaceOutcome(t, chain.host, chain.home, since, 'R4-EXIT-01')
    assert.equal(lifecycleLines(chain.home).some((l) => l.json.code === R4.lifecycle.ready), false, 'R4-EXIT-01: precondition held — the killed start never reached READY')
  })

  it('R4-EXIT-02 failed(race) → Retry → ready: code null, detail null', { timeout: R2_BUDGET.caseMs }, async () => {
    assert.ok(chain.failed, 'precondition: R4-EXIT-01 left the row failed')
    const retried = (await chain.host.post(R2.route.retry, {})).json
    const ready = retried?.state === R4.state.ready ? retried : await settledStatus(chain.host, [R4.state.ready])
    assert.equal(ready.state, R4.state.ready, 'Retry ends ready: ' + JSON.stringify(retried))
    for (const [why, answer] of [['Retry answer', retried], ['status', await status(chain.host)]]) {
      if (answer.state !== R4.state.ready) continue
      assert.equal(answer.code, null, 'R4-EXIT-02 ' + why + ': no code')
      assert.ok(Object.hasOwn(answer, 'detail'), 'R4-EXIT-02 ' + why + ': has a detail key')
      assert.equal(answer.detail, null, 'R4-EXIT-02 ' + why + ': detail null when ready (R4)')
    }
    chain.ready = true
  })

  it('R4-EXIT-03 the child exits after ready → failed / NATIVE_CHILD_EXITED, detail null (not a failed start), no start-failed warn', { timeout: R2_BUDGET.caseMs }, async () => {
    assert.ok(chain.ready, 'precondition: R4-EXIT-02 reached ready')
    const since = await problemCount(chain.host)
    const live = [...launchPids(chain.home)]
    assert.equal(live.length, 1, 'one live child while ready: ' + JSON.stringify(live))
    process.kill(live[0][1], R4.killSignal)
    let last
    await until(async () => { last = await status(chain.host); return last?.state === R4.state.failed }, WAIT.raceWindowMs, WAIT.statusPollMs)
    assert.equal(last?.state, R4.state.failed, 'the exit is reported: ' + JSON.stringify(last))
    assert.equal(last.code, R4.code.childExited)
    await sleep(WAIT.statusPollMs * 10)
    const settled = await status(chain.host)
    assert.equal(settled.detail, null, 'R4-EXIT-03: no start failed, so detail is null — not the earlier start\'s detail: ' + JSON.stringify(settled))
    assert.deepEqual(await startFailedWarns(chain.host, since), [], 'R4-EXIT-03: no start-failed warn for an exit after ready')
    chain.exited = true
  })

  it('R4-EXIT-04 Retry whose child is killed during the start → failed / NATIVE_CHILD_EXITED with the start detail; one more warn', { timeout: R2_BUDGET.caseMs }, async (t) => {
    assert.ok(chain.exited, 'precondition: R4-EXIT-03 left the row failed after an exit')
    const since = await problemCount(chain.host)
    const known = new Set(launchPids(chain.home).keys())
    const retry = chain.host.post(R2.route.retry, {})
    await killNewChildDuringStart(chain.host, chain.home, known)
    const final = await assertRaceOutcome(t, chain.host, chain.home, since, 'R4-EXIT-04')
    const answer = (await retry).json
    t.diagnostic('R4-EXIT-04 Retry answered ' + JSON.stringify(answer))
    assert.notEqual(answer?.code, R4.code.startFailed, 'R4-EXIT-04: the Retry answer never says NATIVE_START_FAILED')
    if (answer?.state === R4.state.failed && answer.detail !== null) assert.deepEqual(answer, final, 'R4-EXIT-04: a failed Retry answer with detail equals the status')
  })

  it('R4-EXIT-05 the connector is disabled during the start (row stops) → the failing start changes neither state, code nor detail', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const home = newHome('v2-r4-stop')
    homes.push(home)
    const host = await bootHost(home)
    t.after(async () => { await host.stop().catch(() => {}) })
    // After CHILD_BOOT the start is well under way, so stopping now makes that start fail.
    const booted = await until(() => lifecycleLines(home).some((l) => l.json.code === R4.lifecycle.boot), WAIT.launchMs, WAIT.launchPollMs)
    assert.ok(booted, 'precondition: the child booted')
    assert.equal((await status(host))?.state, R4.state.starting, 'precondition: still starting')
    const since = await problemCount(host)
    const off = host.call('setBundleEnabled', { name: R4.connector, enabled: false })
    const seen = []
    await until(async () => {
      const answer = await status(host)
      if (JSON.stringify(seen.at(-1)) !== JSON.stringify(answer)) seen.push(answer)
      return answer?.state === R4.state.missing
    }, WAIT.raceWindowMs, WAIT.statusPollMs)
    assert.equal((await off).changed, true, 'the connector bundle was deselected through DSH')
    t.diagnostic('R4-EXIT-05 status sequence: ' + JSON.stringify(seen))
    // Let any late start rejection land before judging the state.
    await until(() => lastFailedReason(home) !== undefined, WAIT.raceWindowMs, WAIT.statusPollMs)
    await sleep(WAIT.statusPollMs * 10)
    assert.ok(lastFailedReason(home), 'precondition: the interrupted start did fail (lifecycle FAILED): ' + JSON.stringify(lifecycleLines(home).map((l) => l.json)))
    assert.equal(seen.some((s) => s?.state === R4.state.failed), false, 'R4-EXIT-05: the failing start never set failed: ' + JSON.stringify(seen))
    const final = await status(host)
    assert.deepEqual(final, { state: R4.state.missing, code: null, detail: null }, 'R4-EXIT-05: the stop\'s state stands, code and detail unchanged')
    t.diagnostic('R4-EXIT-05 start-failed warns (not specified by R3): ' + JSON.stringify(await startFailedWarns(host, since)))
  })

  it('R4-EXIT-06 an ordinary start failure (planted invalid dependency manifest) → NATIVE_START_FAILED, detail with the code once, one warn with only the code', { timeout: R2_BUDGET.caseMs }, async (t) => {
    const home = newHome('v2-r4-manifest')
    homes.push(home)
    const first = await bootHost(home)
    try { assert.equal((await settledStatus(first)).state, R4.state.ready, 'precondition: first boot ready') } finally { await first.stop() }
    plantInvalidManifest(home)
    const host = await bootHost(home)
    t.after(async () => { await host.stop().catch(() => {}) })
    const failed = await settledStatus(host)
    assert.equal(failed.state, R4.state.failed)
    assert.equal(failed.code, R4.code.startFailed, 'R4-EXIT-06: no exit race → NATIVE_START_FAILED')
    const detail = assertDetail(failed.detail, 'R4-EXIT-06')
    assert.equal(detail.code, R2.faultCode, 'R4-EXIT-06: the specific preflight code')
    assert.ok(detail.message, 'R4-EXIT-06: the refusal has a message line')
    await assertOneWarn(host, 0, detail.code, detail.message, 'R4-EXIT-06')
  })
})
