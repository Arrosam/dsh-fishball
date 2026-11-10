/**
 * Shared support for the round-2 bug-fix suites (test/v2-r2-*.test.mjs): one real DSH boot of the
 * main profile (support/host.mjs) with the instance row, its owner-only routes, the instance's
 * runtime directory and two real ways to make the child start fail. Values come from the round-2
 * requirements (R2.x, R3), never from the implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { TEST_HOMES } from './constants.mjs'
import { until } from './util.mjs'

export const R2 = Object.freeze({
  route: Object.freeze({
    status: '/api/fishball-instance/status',
    retry: '/api/fishball-instance/retry',
    nativeStatus: '/api/fishball/native/status',
    embed: '/fishball/embed/',
    /** The child's own Restart route (the settings view's Restart, relayed to the main host). */
    childRestart: '/api/fishball-instance/restart',
  }),
  state: Object.freeze({ ready: 'ready', failed: 'failed' }),
  /** Unchanged contract vocabulary (R2.1). */
  code: Object.freeze({ startFailed: 'NATIVE_START_FAILED' }),
  /** The specific preflight refusal of a private core-package shadow (R2.1 example, e2e symptom). */
  shadowCode: 'PREFLIGHT_CORE_SHADOW',
  lifecycle: Object.freeze({ failed: 'FAILED', stop: 'STOP', ready: 'READY' }),
  /** An UPPER_SNAKE identifier (R2.2's reason; the code part of R2.1's detail). */
  identifier: /^[A-Z][A-Z0-9_]*$/,
  /** R2.1: `<CODE>` or `<CODE>: <first line>`. */
  detailShape: /^([A-Z][A-Z0-9_]*)(?:: (.+))?$/s,
  separator: ': ',
  redacted: '[redacted]',
  /** The three statuses R2.4 / R2.3 name, read in one go. */
  publicKeys: Object.freeze(['code', 'detail', 'state']),
  runtime: Object.freeze(['fishball', 'runtime']),
  lifecycleFile: 'lifecycle.log',
  launches: 'launches',
  childProfile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  /** The planted core identity (a real DSH core package name). */
  shadowSlot: Object.freeze(['node_modules', '@deepseek-ai', 'schemastery']),
  shadowManifest: Object.freeze({ name: '@deepseek-ai/schemastery', version: '0.0.0-fbtest-shadow' }),
  manifestFile: 'package.json',
  sameOrigin: Object.freeze({ 'sec-fetch-site': 'same-origin' }),
  seeOther: 303,
  loopback: '127.0.0.1',
  /** Native admission answer of the child (PG-ORIGIN: 303 ./). */
  childAdmission: './',
})

/** Harness waits (host side; no product oracle). */
export const R2_BUDGET = Object.freeze({ settleMs: 90_000, pollMs: 250, caseMs: 240_000 })

export const runtimeDir = (home) => path.join(home, ...R2.runtime)
export const childProfileDir = (home) => path.join(home, ...R2.childProfile)

/** Every lifecycle.log line, parsed (R2.2: JSON lines {time, code, ...}). */
export function lifecycleLines(home) {
  const file = path.join(runtimeDir(home), R2.lifecycleFile)
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => ({ raw: line, json: JSON.parse(line) }))
}

/** Live launch record names (one per running child). */
export function launchRecords(home) {
  const dir = path.join(runtimeDir(home), R2.launches)
  return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []
}

/** Poll the status route until it reports one of the settled states; returns the last answer. */
export async function settledStatus(host, states = [R2.state.ready, R2.state.failed]) {
  let last
  await until(async () => {
    last = (await host.get(R2.route.status)).json
    return states.includes(last?.state)
  }, R2_BUDGET.settleMs, R2_BUDGET.pollMs)
  assert.ok(states.includes(last?.state), 'status never reached ' + states.join('/') + '; last ' + JSON.stringify(last))
  return last
}

/**
 * Plant the private core-package shadow in the child profile (the reported e2e symptom). The slot
 * is planted after a first ready boot, when the child profile exists, so the real preflight is
 * what refuses it.
 */
export function plantShadow(home) {
  const slot = path.join(childProfileDir(home), ...R2.shadowSlot)
  fs.mkdirSync(slot, { recursive: true })
  fs.writeFileSync(path.join(slot, R2.manifestFile), JSON.stringify(R2.shadowManifest))
  return () => fs.rmSync(slot, { recursive: true, force: true })
}

/** Replace the child profile manifest; returns the restore function. */
export function replaceChildManifest(home, text) {
  const file = path.join(childProfileDir(home), R2.manifestFile)
  const original = fs.readFileSync(file)
  fs.writeFileSync(file, text)
  return () => fs.writeFileSync(file, original)
}

/** Remove a home this suite created under the test-homes root (guarded recursive delete). */
export function removeHome(home) {
  if (path.dirname(home) !== TEST_HOMES) throw new Error('refusing to remove ' + home)
  fs.rmSync(home, { recursive: true, force: true })
}

/** GET the embed launch route as the browser does (same-origin, the main cookie, no redirect follow). */
export async function launchEmbed(host, query = '') {
  const response = await fetch(host.origin + R2.route.embed + query, { headers: { cookie: host.cookie, ...R2.sameOrigin }, redirect: 'manual' })
  await response.arrayBuffer()
  return { status: response.status, location: response.headers.get('location') }
}

/**
 * The embed route admits again: 303 to a loopback child origin other than the main one, and that
 * child accepts the admission (its own 303 ./). Returns the child origin and its session cookie.
 */
export async function assertEmbedAdmits(host, why) {
  const answer = await launchEmbed(host)
  assert.equal(answer.status, R2.seeOther, why + ': the embed route redirects (303), not the unavailable card (' + answer.status + ')')
  const target = new URL(answer.location)
  assert.equal(target.hostname, R2.loopback, why + ': the redirect targets the loopback child')
  assert.notEqual(target.origin, host.origin, why + ': the redirect leaves the main origin')
  const admission = await fetch(answer.location, { redirect: 'manual' })
  await admission.arrayBuffer()
  assert.equal(admission.status, R2.seeOther, why + ': the child accepts the admission')
  assert.equal(admission.headers.get('location'), R2.childAdmission, why + ': native admission answers ./')
  const cookie = (admission.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { origin: target.origin, cookie, location: answer.location }
}

/** SDK version of the selected runtime (titles only). */
export function selectedSdk(runtime) {
  try { return JSON.parse(fs.readFileSync(path.join(runtime, '@deepseek-ai', 'dsh', 'package.json'), 'utf8')).version } catch { return 'unknown-sdk' }
}
