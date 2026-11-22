/**
 * Scratch space and leak sweeps. Every recursive delete is guarded: only a folder a helper made under
 * the canonical OS temp dir, with the helpers' prefix, is ever removed.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SCRATCH } from './constants.mjs'
/** The canonical OS temp dir (`/private/var/...` on macOS), with no trailing separator. */
export const canonicalTmp = () => fs.realpathSync(os.tmpdir()).replace(/\/+$/, '')

/**
 * One cleanup stack per test, run last-in first-out from a single `t.after`, so a host closes before
 * its connector stops and before its temp root is removed.
 */
export function cleanups(t) {
  const stack = []
  t.after(async () => {
    const errors = []
    for (const fn of stack.reverse()) { try { await fn() } catch (error) { errors.push(error) } }
    if (errors.length > 0) throw errors[0]
  })
  return { defer: (fn) => { stack.push(fn) } }
}

/** A fresh temp root removed by `scope`'s cleanup (the one recursive delete, guarded). */
export function tempRoot(scope, prefix = SCRATCH.prefix) {
  const base = canonicalTmp()
  const root = fs.mkdtempSync(path.join(base, prefix))
  scope.defer(() => {
    assert.ok(path.dirname(root) === base && path.basename(root).startsWith(prefix), 'refusing to remove ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  return root
}

/**
 * Every regular file under `dir` (not following links), as `[path, latin1 text]`. A file that
 * vanishes during the walk is skipped: other suites running at the same time may share a temp HOME
 * and create and delete their own scratch trees under it.
 *
 * The walk is explicit because `fs.readdirSync(dir, { recursive: true })` descends into symlinked
 * directories: a temp HOME holding a pnpm store has link cycles, so that walk never ends. A dirent
 * describes the entry itself (lstat semantics), so a symlink is neither descended into nor read;
 * anything reached only through a link lies outside the swept tree.
 */
export function filesUnder(dir) {
  if (!dir || !fs.existsSync(dir)) return []
  const files = []
  const pending = [dir]
  while (pending.length > 0) {
    const current = pending.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const f = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(f)
      else if (entry.isFile()) { try { files.push([f, fs.readFileSync(f, 'latin1')]) } catch { /* vanished */ } }
    }
  }
  return files
}

/**
 * The temp HOME to sweep as well (R-SEC-02: no secret in any home file), only when it is a dedicated
 * directory below the canonical temp dir, never the temp dir itself, so a shared TMPDIR's unrelated
 * trees are not swept.
 */
export function sweepableHome() {
  const home = process.env.HOME
  const base = canonicalTmp()
  return home !== undefined && home.startsWith(base + path.sep) ? [home] : []
}

/**
 * R-TOK-04 / R-SEC-02 / AUTH-EP-13: where any planted value appears. `places` maps a place name to
 * text; `dirs` are swept file by file except the `allowed` files (the credential store).
 */
export function leakHits(planted, { places = {}, dirs = [], allowed = [] }) {
  const hits = []
  const values = [...planted].filter((v) => typeof v === 'string' && v.length > 0)
  for (const [place, text] of Object.entries(places)) for (const v of values) if (String(text).includes(v)) hits.push(`${place}: ${v.slice(0, 24)}…`)
  for (const dir of dirs) {
    for (const [file, text] of filesUnder(dir)) {
      if (allowed.includes(file)) continue
      for (const v of values) if (text.includes(v)) hits.push(`file ${file}: ${v.slice(0, 24)}…`)
    }
  }
  return hits
}

/** The file mode bits of `file` (R-OA-21 rule 9: 0600). */
export const modeOf = (file) => fs.statSync(file).mode & 0o777
