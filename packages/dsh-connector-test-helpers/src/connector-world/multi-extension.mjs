/**
 * Test-only external OS/clock controls loaded before the real connector by the existing wire worker.
 * No product imports or state access. Only the requirement's local 30s timers are virtual;
 * HTTP, OAuth, stream keepalives and all other clocks remain real.
 */
import os from 'node:os'
import timers from 'node:timers'
import { syncBuiltinESMExports } from 'node:module'
import { MULTI as M } from 'dsh-connector-test-helpers/connector-world/multi-constants'

let hostname = M.hostname
let reads = 0
let now = 0
let next = 0
let firing
const scheduled = new Map()
const native = { setInterval: timers.setInterval, clearInterval: timers.clearInterval, setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout }
os.hostname = () => { reads += 1; if (firing) firing.hostnameReads += 1; return hostname }
function schedule(repeating, fn, ms, args) {
  if (ms !== M.watchMs) return (repeating ? native.setInterval : native.setTimeout)(fn, ms, ...args)
  const handle = { id: ++next, unref() { return this }, ref() { return this }, hasRef() { return false }, [Symbol.toPrimitive]() { return this.id } }
  scheduled.set(handle, { fn, args, due: now + ms, ms, repeating, hostnameReads: firing?.hostnameReads ?? 0 })
  return handle
}
function clear(handle) { if (!scheduled.delete(handle)) { native.clearInterval(handle); native.clearTimeout(handle) } }
timers.setInterval = globalThis.setInterval = (fn, ms, ...args) => schedule(true, fn, ms, args)
timers.setTimeout = globalThis.setTimeout = (fn, ms, ...args) => schedule(false, fn, ms, args)
timers.clearInterval = globalThis.clearInterval = clear
timers.clearTimeout = globalThis.clearTimeout = clear
syncBuiltinESMExports()

export function ops() {
  return {
    multiHostname({ value }) { hostname = value; return true },
    multiClock() { return { now, reads, hostname, activeHostnameTimers: [...scheduled.values()].filter((r) => r.hostnameReads > 0).length } },
    async multiAdvance({ ms }) {
      const until = now + ms
      while (true) {
        const due = Math.min(...[...scheduled.values()].map((r) => r.due))
        if (due > until) break
        now = due
        for (const [handle, row] of [...scheduled]) {
          if (!scheduled.has(handle) || row.due !== due) continue
          if (row.repeating) row.due += row.ms
          else scheduled.delete(handle)
          firing = row
          try { await row.fn(...row.args) } finally { firing = undefined }
        }
      }
      now = until
      return { now, reads, activeHostnameTimers: [...scheduled.values()].filter((r) => r.hostnameReads > 0).length }
    },
  }
}
