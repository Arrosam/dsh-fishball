/**
 * Helpers for the persona-rule tests: the persona as data (current and baseline) and the rule line's parts.
 * Only data exports of src/persona.js are read; no behaviour of the plugin is called.
 */
import { execFileSync } from 'node:child_process'
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
 * The persona module as it stands on the baseline ref, imported from a data URL: no copy is written inside the repo.
 * The file has no imports, so it loads on its own.
 */
export async function loadBaseline() {
  const source = execFileSync('git', ['show', PERSONA_BOLD.baseline.ref + ':' + PERSONA_BOLD.baseline.file], { cwd: REPO, encoding: 'utf8' })
  return import('data:' + PERSONA_BOLD.baseline.moduleType + ';base64,' + Buffer.from(source, 'utf8').toString('base64'))
}

/** A rule line shows both forms of the example: the one to write and the one not to write. */
export const isRuleLine = (line) => line.includes(PERSONA_BOLD.good) && line.includes(PERSONA_BOLD.bad)

/** The text just before an example in a line. */
export const textBefore = (line, example) => line.slice(0, line.indexOf(example))

/** How many times `needle` occurs in `text`. */
export const countIn = (text, needle) => text.split(needle).length - 1
