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

const plain = (report) => ({ status: report.status, overridden: [...report.overridden].map(String) })

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

/** The current report `{status, overridden, service}`, or null when no service carries one. */
export async function findReport(ctx) {
  for (const { name, value } of fishballServices(ctx)) {
    const found = await search(value, 0)
    if (found) return { ...found, service: name }
  }
  return null
}
