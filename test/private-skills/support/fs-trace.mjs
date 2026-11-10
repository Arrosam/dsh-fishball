/**
 * Test-only trace of Node filesystem calls. It makes "refused before any read or write", "never reads
 * the link target" and "no watcher" observable without reading the implementation.
 *
 * The wrappers are installed once per process over `node:fs`, its callback and Sync forms and
 * `node:fs/promises`. `syncBuiltinESMExports` makes ESM named imports see them as well. Outside an open
 * window they only pass calls through. An `open` that succeeds records the opened file's device and
 * inode, so a read through a symbolic link is caught whatever path spelling reached it.
 */
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'

/** Path-taking operations. `open` counts as a write only when its flags ask for writing. */
const OPS = Object.freeze({
  read: Object.freeze(['access', 'stat', 'lstat', 'readFile', 'readdir', 'opendir', 'open', 'realpath', 'readlink', 'watch', 'watchFile', 'createReadStream']),
  write: Object.freeze(['mkdir', 'mkdtemp', 'writeFile', 'appendFile', 'rename', 'unlink', 'rm', 'rmdir', 'copyFile', 'cp', 'symlink', 'link', 'chmod', 'lchmod', 'chown', 'lchown', 'truncate', 'utimes', 'lutimes', 'createWriteStream']),
  /** Operations that exist only in the callback/stream form. */
  callbackOnly: Object.freeze(['watchFile', 'createReadStream', 'createWriteStream']),
  open: 'open',
  sync: 'Sync',
})
const WRITE_FLAGS = fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_APPEND
const WRITE_FLAG_TEXT = /[wa+]/
const fstatSync = fs.fstatSync
const windows = new Set()
let installed = false

function describe(target) {
  if (typeof target === 'string') return target
  if (target instanceof URL) return fileURLToPath(target)
  if (Buffer.isBuffer(target)) return target.toString()
  return undefined
}

function writes(op, flags) {
  if (OPS.write.includes(op)) return true
  if (op !== OPS.open || flags === undefined || flags === null) return false
  return typeof flags === 'number' ? (flags & WRITE_FLAGS) !== 0 : WRITE_FLAG_TEXT.test(String(flags))
}

function record(op, args) {
  if (windows.size === 0) return undefined
  const entry = { op, path: describe(args[0]), to: describe(args[1]), write: writes(op, args[1]) }
  for (const window of windows) {
    window.entries.push(entry)
    window.onCall?.(entry)
  }
  return entry
}

function opened(entry, fd) {
  if (typeof fd !== 'number') return
  try {
    const stat = fstatSync(fd)
    entry.inode = inodeOf(stat)
  } catch {
    // A descriptor closed concurrently cannot be attributed; the path is still recorded.
  }
}

/** Keep own properties such as `realpathSync.native`, so callers that use them still work. */
function keepProperties(wrapper, original) {
  for (const key of [...Object.keys(original), ...Object.getOwnPropertySymbols(original)]) wrapper[key] = original[key]
  return wrapper
}

/** Mark a recorded call as having succeeded (`ok`), so a refused attempt is not mistaken for a read. */
function succeeded(entry, value) {
  if (entry === undefined) return
  entry.ok = true
  if (entry.op === OPS.open) opened(entry, typeof value === 'number' ? value : value?.fd)
}

function wrapPromise(holder, op) {
  const original = holder[op]
  if (typeof original !== 'function') return
  holder[op] = keepProperties(function traced(...args) {
    const entry = record(op, args)
    const result = original.apply(this, args)
    return entry === undefined ? result : result.then((value) => (succeeded(entry, value), value))
  }, original)
}

function wrapSync(op) {
  const name = op + OPS.sync
  const original = fs[name]
  if (typeof original !== 'function') return
  fs[name] = keepProperties(function traced(...args) {
    const entry = record(op, args)
    const result = original.apply(this, args)
    succeeded(entry, result)
    return result
  }, original)
}

function wrapCallback(op) {
  const original = fs[op]
  if (typeof original !== 'function') return
  fs[op] = keepProperties(function traced(...args) {
    const entry = record(op, args)
    const last = args.length - 1
    if (entry !== undefined && typeof args[last] === 'function') {
      const done = args[last]
      args[last] = (error, value, ...rest) => {
        if (!error) succeeded(entry, value)
        done(error, value, ...rest)
      }
    }
    const result = original.apply(this, args)
    // Streams and watchers return synchronously; their creation is the observable call.
    if (entry !== undefined && typeof args[last] !== 'function') entry.ok = true
    return result
  }, original)
}

function install() {
  if (installed) return
  installed = true
  for (const op of [...OPS.read, ...OPS.write]) {
    wrapCallback(op)
    if (OPS.callbackOnly.includes(op)) continue
    wrapSync(op)
    wrapPromise(fs.promises, op)
  }
  syncBuiltinESMExports()
}

/** `dev:ino` identity of a stat result. */
export function inodeOf(stat) {
  return stat.dev + ':' + stat.ino
}

/**
 * Open a trace window. `onCall(entry)` runs synchronously before each traced call, so a test can
 * act at an exact filesystem step (e.g. abort at the k-th call).
 * @returns {{ entries: object[], stop(): object[] }}
 */
export function openTrace({ onCall } = {}) {
  install()
  const window = { entries: [], onCall }
  windows.add(window)
  return { entries: window.entries, stop: () => (windows.delete(window), window.entries) }
}

/** Run `fn` inside a trace window; returns its value and every traced call. */
export async function traced(fn, options) {
  const window = openTrace(options)
  try {
    const value = await fn()
    return { value, calls: window.stop() }
  } finally {
    window.stop()
  }
}
