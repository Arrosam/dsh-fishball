/**
 * R-SEC-02 / R10 leak sweep (FLS-EP-03): where any planted value appears. Ported from the old
 * test/v3/dsh-connector-adapter/oauth-client/subject.mjs (gone with the adapter, 6b7c53bf), which
 * the link-save world used; the same rules.
 */
import fs from 'node:fs'
import path from 'node:path'
import { canonicalTmp } from 'fishball-test-helpers/dsh-host'

const LEAK = Object.freeze({ previewChars: 24, ellipsis: '…', encoding: 'latin1' })

/**
 * Every regular file under `dir` (not following links), as `[path, latin1 text]`. The walk is
 * explicit because `readdirSync({recursive: true})` descends into symlinked directories (a temp
 * HOME holding a pnpm store has link cycles). A file that vanishes during the walk is skipped.
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
      else if (entry.isFile()) { try { files.push([f, fs.readFileSync(f, LEAK.encoding)]) } catch { /* vanished */ } }
    }
  }
  return files
}

/** The temp HOME to sweep as well, only when it is a dedicated folder below the canonical temp dir (the runner's). */
export function sweepableHome() {
  const home = process.env.HOME
  const base = canonicalTmp()
  return home !== undefined && home.startsWith(base + path.sep) ? [home] : []
}

/** Where any planted value appears: `places` maps a place name to text; `dirs` are swept file by file except `allowed`. */
export function leakHits(planted, { places = {}, dirs = [], allowed = [] }) {
  const hits = []
  const values = [...planted].filter((v) => typeof v === 'string' && v.length > 0)
  const show = (v) => v.slice(0, LEAK.previewChars) + LEAK.ellipsis
  for (const [place, text] of Object.entries(places)) for (const v of values) if (String(text).includes(v)) hits.push(`${place}: ${show(v)}`)
  for (const dir of dirs) {
    for (const [file, text] of filesUnder(dir)) {
      if (allowed.includes(file)) continue
      for (const v of values) if (text.includes(v)) hits.push(`file ${file}: ${show(v)}`)
    }
  }
  return hits
}
