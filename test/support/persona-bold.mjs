/**
 * Helpers for the persona-rule tests: the persona as data (current and baseline) and the rule line's parts.
 * Only data exports of src/persona.js are read; no behaviour of the plugin is called.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PERSONA_BOLD, REPO } from './constants.mjs'

export const personaLines = (persona) => persona.split(PERSONA_BOLD.lineBreak)

/** The persona module as the plugin ships it now. */
export const loadCurrent = () => import(pathToFileURL(PERSONA_BOLD.module).href)

/** True when the repo can show the baseline ref's persona (a clone without the live branch cannot). */
export function baselineAvailable() {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', PERSONA_BOLD.baseline.ref + '^{commit}'], { cwd: REPO, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * The persona module as it stands on the baseline ref, imported from a temporary export of the ref's `src/` folder
 * (with its package.json, so `.js` loads as an ES module). Since rev11-pile-list persona.js imports `./constants.js`,
 * so a lone `data:` URL cannot resolve it; the relative imports need real files next to it. The export lives in a fresh
 * folder under the OS temp directory and is removed when the process exits: no copy is written inside the repo.
 */
export async function loadBaseline() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbtest-persona-baseline-'))
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }))
  const tar = path.join(dir, 'baseline.tar')
  execFileSync('git', ['archive', '--output', tar, PERSONA_BOLD.baseline.ref, 'package.json', 'src'], { cwd: REPO })
  execFileSync('tar', ['-x', '-f', tar, '-C', dir])
  return import(pathToFileURL(path.join(dir, PERSONA_BOLD.baseline.file)).href)
}

/** A rule line shows both forms of the example: the one to write and the one not to write. */
export const isRuleLine = (line) => line.includes(PERSONA_BOLD.good) && line.includes(PERSONA_BOLD.bad)

/** The text just before an example in a line. */
export const textBefore = (line, example) => line.slice(0, line.indexOf(example))

/** How many times `needle` occurs in `text`. */
export const countIn = (text, needle) => text.split(needle).length - 1
