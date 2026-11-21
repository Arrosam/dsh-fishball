/**
 * Finds core's guard report in a running DSH by its K3 shape (GuardReport: `{status, overridden}`,
 * `overridden` empty exactly when `status` is the ok status). K3 freezes the report's vocabulary but
 * no service name or member that carries it, so the report is looked for on every service whose name
 * names Fishball, as a value or as the result of a parameterless member whose name says guard,
 * report or status (FINDER). Black box: only public Cordis services are read; nothing is imported
 * from fishball-core.
 *
 * Shared by the worker (worker.mjs) and the probe row (probe-row.mjs), so both see the same report.
 */
import { FINDER, REPORT } from './constants.mjs'

/** A GuardReport-shaped value (K3 guards.d.ts). */
export function isReport(value) {
  if (value === null || typeof value !== 'object') return false
  if (!REPORT.statuses.includes(value.status) || !Array.isArray(value.overridden)) return false
  return (value.status === REPORT.ok) === (value.overridden.length === 0)
}

// GENTLE-TOOLS (2026-11-21): K3 GuardReport gained `extraManagerTools`; it is carried through when the
// report has it (string array), so a case can read it; isReport's shape test is unchanged.
const plain = (report) => ({
  status: report.status, overridden: [...report.overridden].map(String),
  ...(Array.isArray(report.extraManagerTools) ? { extraManagerTools: [...report.extraManagerTools].map(String) } : {}),
})

const withTimeout = (promise) => Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(undefined), FINDER.callMs))])

/** Member names of an object, its own and its prototype chain's (not Object's). */
function memberNames(value) {
  const names = new Set()
  for (let p = value; p && p !== Object.prototype && p !== Function.prototype; p = Object.getPrototypeOf(p)) {
    for (const key of Object.getOwnPropertyNames(p)) if (key !== 'constructor') names.add(key)
  }
  return [...names]
}

async function search(value, depth) {
  if (isReport(value)) return plain(value)
  if (depth > FINDER.depth || value === null || (typeof value !== 'object' && typeof value !== 'function')) return undefined
  for (const key of memberNames(value).filter((k) => FINDER.member.test(k))) {
    let member
    try { member = value[key] } catch { continue }
    if (typeof member === 'function') {
      if (member.length !== 0) continue
      let result
      try { result = await withTimeout(Promise.resolve(member.call(value))) } catch { continue }
      const found = await search(result, depth + 1)
      if (found) return found
    } else {
      const found = await search(member, depth + 1)
      if (found) return found
    }
  }
  return undefined
}

/** Fishball-named services of the root context: [{name, value}] (Cordis `reflect.store`, both SDKs). */
function fishballServices(ctx) {
  const root = ctx.root ?? ctx
  const store = root.reflect?.store ?? {}
  return Reflect.ownKeys(store).map((key) => store[key]).filter((impl) => impl && /fishball/i.test(String(impl.name))).map((impl) => ({ name: impl.name, value: impl.value }))
}

/**
 * Subscribe to every change of the report, synchronously: on a Fishball-named service with a
 * parameterless report member (FINDER.member) and a one-argument listener member
 * (FINDER.subscribe), call the listener member with a function that hands each GuardReport-shaped
 * argument to `onReport({status, overridden, service})`. It also hands over the value current at
 * subscription. It returns the subscribed service object, or null when none can be subscribed,
 * so the caller can poll instead.
 */
export function subscribeReport(ctx, onReport) {
  for (const { name, value } of fishballServices(ctx)) {
    if (value === null || typeof value !== 'object') continue
    const names = memberNames(value)
    const reader = names.find((k) => FINDER.member.test(k) && typeof value[k] === 'function' && value[k].length === 0)
    const listen = names.find((k) => FINDER.subscribe.test(k) && typeof value[k] === 'function' && value[k].length === 1)
    if (reader === undefined || listen === undefined) continue
    const hand = (report) => { if (isReport(report)) onReport({ ...plain(report), service: name }) }
    try { value[listen].call(value, hand) } catch { continue }
    try { hand(value[reader].call(value)) } catch { /* nothing current yet */ }
    return value
  }
  return null
}

/** Whether `service` (from subscribeReport) is still a provided Fishball service, not replaced by a recompose. */
export function stillProvided(ctx, service) {
  return fishballServices(ctx).some(({ value }) => value === service)
}

/** The current report `{status, overridden, service}`, or null when no service carries one. */
export async function findReport(ctx) {
  for (const { name, value } of fishballServices(ctx)) {
    const found = await search(value, 0)
    if (found) return { ...found, service: name }
  }
  return null
}
