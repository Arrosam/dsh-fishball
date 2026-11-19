/**
 * Shared support for the round-2 bug-fix suites (test/v2-r2-*.test.mjs): one real DSH boot of the
 * main profile (support/host.mjs) with the instance row, its owner-only routes, the instance's
 * runtime directory and two real ways to make the child start fail. Values come from the round-2
 * requirements (R2.x, R3), never from the implementation.
 *
 * Decision A (2026-11-11, test/v2-r4-core-copy.test.mjs): a private @deepseek-ai copy in the child
 * profile no longer fails a start, so the planted start failure is now an invalid package.json of a
 * dependency under the child profile's node_modules, which the preflight still refuses.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { RUNTIME, TEST_HOMES } from './constants.mjs'
import { ROUTE } from '../v3/dsh-instance/host/constants.mjs'
import { bootHost } from './host.mjs'
import { until } from './util.mjs'

export const R2 = Object.freeze({
  route: Object.freeze({
    status: '/api/dsh-instance/status',
    retry: '/api/dsh-instance/retry',
    // I-READY: the V2 status relay was never deployed; keep the same state/code/detail checks.
    nativeStatus: '/api/dsh-instance/status',
    embed: '/fishball/embed/',
  }),
  state: Object.freeze({ ready: 'ready', failed: 'failed' }),
  /** Unchanged contract vocabulary (R2.1). */
  code: Object.freeze({ startFailed: 'NATIVE_START_FAILED' }),
  /** The specific preflight refusal of an invalid dependency manifest (R2.1 example; decision A, C3). */
  faultCode: 'PREFLIGHT_MANIFEST',
  /** The refusal decision A retired (C1): never reported for an @deepseek-ai copy. */
  retiredCoreShadow: 'PREFLIGHT_CORE_SHADOW',
  lifecycle: Object.freeze({ failed: 'FAILED', stop: 'STOP', ready: 'READY' }),
  /** An UPPER_SNAKE identifier (R2.2's reason; the code part of R2.1's detail). */
  identifier: /^[A-Z][A-Z0-9_]*$/,
  /** R2.1: `<CODE>` or `<CODE>: <first line>`. */
  detailShape: /^([A-Z][A-Z0-9_]*)(?:: (.+))?$/s,
  separator: ': ',
  redacted: '[redacted]',
  /**
   * The keys of the status and Retry answers (R2.4 / R2.3), sorted. Re-baselined by REMOVE-V2b: R2
   * named {state, code, detail}; I-HOST's settings page routes answer {state, code, detail, notice}
   * (the notice a Retry records). One source: the I-HOST suite's ROUTE.statusKeys.
   */
  publicKeys: Object.freeze([...ROUTE.statusKeys].sort()),
  runtime: Object.freeze(['fishball', 'runtime']),
  lifecycleFile: 'lifecycle.log',
  launches: 'launches',
  childProfile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  /** The planted start failure: a dependency under the child profile whose package.json is not JSON. */
  faultSlot: Object.freeze(['node_modules', 'fbtest-invalid-manifest']),
  faultManifest: '{',
  manifestFile: 'package.json',
  modules: 'node_modules',
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
 * Write one package directory under the child profile (`segments` relative to it) whose
 * package.json is `manifestText`; returns the function that removes it again.
 */
export function plantProfilePackage(home, segments, manifestText) {
  const slot = path.join(childProfileDir(home), ...segments)
  fs.mkdirSync(slot, { recursive: true })
  fs.writeFileSync(path.join(slot, R2.manifestFile), manifestText)
  return () => fs.rmSync(slot, { recursive: true, force: true })
}

/**
 * Plant the real start failure: an invalid package.json under the child profile's node_modules.
 * It is planted after a first ready boot, when the child profile exists, so the real preflight is
 * what refuses it.
 */
export const plantInvalidManifest = (home) => plantProfilePackage(home, R2.faultSlot, R2.faultManifest)

/**
 * Copy a package of the selected SDK installation (`name`, e.g. '@deepseek-ai/schemastery') to
 * `segments` under the child profile: a real copy, same files and version. Returns the remover.
 */
export function copySdkPackage(home, name, segments) {
  const slot = path.join(childProfileDir(home), ...segments)
  fs.cpSync(path.join(RUNTIME, name), slot, { recursive: true })
  return () => fs.rmSync(slot, { recursive: true, force: true })
}

/**
 * One home's fault sequence: a first ready boot (it creates the child profile; `onFirst` may check
 * more on it), stop, `fault(home)`, then a second boot that stays up until the case ends.
 * Returns that host and the fault's restore function.
 */
export async function bootAfterFault(t, home, fault, onFirst = () => {}) {
  const first = await bootHost(home)
  try {
    const status = await settledStatus(first)
    assert.equal(status?.state, R2.state.ready, 'precondition: first boot ready, got ' + JSON.stringify(status))
    await onFirst(first, status)
  } finally { await first.stop() }
  const restore = fault(home)
  const host = await bootHost(home)
  t.after(async () => { await host.stop().catch(() => {}) })
  return { host, restore }
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
