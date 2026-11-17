/**
 * Test-only external OS/clock controls loaded before the real connector by the existing wire worker.
 * No product imports or state access. Only the requirement's local 30s intervals are virtual;
 * HTTP, OAuth, stream keepalives and all other clocks remain real.
 */
import os from 'node:os'
import timers from 'node:timers'
import { syncBuiltinESMExports } from 'node:module'
import { MULTI as M } from './multi-constants.mjs'

let hostname = M.hostname
let reads = 0
let now = 0
let next = 0
let firing
const intervals = new Map()
const originalSet = timers.setInterval
const originalClear = timers.clearInterval
os.hostname = () => { reads += 1; if (firing) firing.hostnameReads += 1; return hostname }
const setInterval = (fn, ms, ...args) => {
  if (ms !== M.watchMs) return originalSet(fn, ms, ...args)
  const handle = { id: ++next, unref() { return this }, ref() { return this }, hasRef() { return false }, [Symbol.toPrimitive]() { return this.id } }
  intervals.set(handle, { fn, args, due: now + ms, ms, hostnameReads: 0 })
  return handle
}
const clearInterval = (handle) => { if (!intervals.delete(handle)) originalClear(handle) }
timers.setInterval = globalThis.setInterval = setInterval
timers.clearInterval = globalThis.clearInterval = clearInterval
syncBuiltinESMExports()

export function ops() {
  return {
    multiHostname({ value }) { hostname = value; return true },
    multiClock() { return { now, reads, hostname, activeHostnameIntervals: [...intervals.values()].filter((r) => r.hostnameReads > 0).length } },
    async multiAdvance({ ms }) {
      const until = now + ms
      while (true) {
        const due = Math.min(...[...intervals.values()].map((r) => r.due))
        if (due > until) break
        now = due
        for (const [handle, row] of [...intervals]) {
          if (!intervals.has(handle) || row.due !== due) continue
          row.due += row.ms
          firing = row
          try { await row.fn(...row.args) } finally { firing = undefined }
        }
      }
      now = until
      return { now, reads, activeHostnameIntervals: [...intervals.values()].filter((r) => r.hostnameReads > 0).length }
    },
  }
}
