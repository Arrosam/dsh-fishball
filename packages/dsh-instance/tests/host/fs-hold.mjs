/**
 * `node:fs/promises` for the modules of one host-row world (row-world.mjs): the real module, except
 * that when the world arms `holdRecord`, the next write that lands `hosted.json` (a `rename` onto it,
 * or an `open` of it for writing) waits on the world's gate: a hosted-record write still pending,
 * which the R-FIX-INSTANCE F05 reload row needs. Fault injection at the file system: whichever of
 * the two calls the record uses is held.
 */
import path from 'node:path'
import * as real from 'node:fs/promises'
import { RECORD, ROW } from './constants.mjs'

export * from 'node:fs/promises'

const world = () => globalThis[Symbol.for(ROW.worldsKey)].get(new URL(import.meta.url).searchParams.get(ROW.worldParam))
const WRITE_FLAGS = /[wa+]/

async function holdIfArmed(file) {
  const ctl = world()
  if (!ctl?.holdRecord || path.basename(String(file)) !== RECORD.file) return
  ctl.holdRecord = false
  ctl.recordHeld.open()
  await ctl.recordGate.promise
}

export async function rename(from, to) { await holdIfArmed(to); return real.rename(from, to) }
export async function open(file, flags, mode) {
  if (typeof flags === 'string' ? WRITE_FLAGS.test(flags) : (flags ?? 0) !== 0) await holdIfArmed(file)
  return real.open(file, flags, mode)
}
export default { ...real.default, rename, open }
