/**
 * Shared T-SK helpers: the SK-owned cases, disposable skill roots and the native document builder
 * used by the executable native-oracle premises.
 */
import fs from 'node:fs'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { tempPath } from 'fishball-test-helpers/temp-path'
import { LAYOUT } from './constants.mjs'

/**
 * SK-owned cases on the current DSH: `<id> [DSH v] <oracle>` (fishball-test-helpers/cases). Every
 * id needs its scenario; the old `todo` ids whose oracle needed a live manager→worker delivery are
 * not registered (README.md says why).
 * @param cases - [id, oracle] pairs.
 * @param scenarios - { [id]: (t) => Promise }.
 */
export function skCases(cases, scenarios) {
  for (const [id, oracle] of cases) {
    const scenario = scenarios[id]
    if (typeof scenario !== 'function') throw new Error(`${id} has no scenario`)
    caseTest(id, undefined, oracle, (t) => scenario(t))
  }
}

/**
 * A fresh fixture folder under the run's own temp directory, canonical (symlinks resolved), so the
 * containment checks compare real paths. The old suite used /private/tmp for the same reason.
 */
export async function freshTempDir() {
  return tempPath(await mkdtemp(path.join(fs.realpathSync(os.tmpdir()), LAYOUT.tempPrefix)))
}
/** Remove a folder made by freshTempDir (checked again against the temp boundary just before). */
export const removeTempDir = (dir) => rm(tempPath(dir), { recursive: true, force: true })

/** YAML double-quoted scalar: JSON strings are valid YAML, so any text survives exactly. */
function scalar(value) {
  return JSON.stringify(value)
}

/** One native-format document (S6). `extra` adds raw front-matter keys with scalar values. */
export function skillDocument({ name, description, body, extra = {} }) {
  const lines = [LAYOUT.frontmatter]
  if (name !== undefined) lines.push(`name: ${scalar(name)}`)
  if (description !== undefined) lines.push(`description: ${scalar(description)}`)
  for (const [key, value] of Object.entries(extra)) lines.push(`${key}: ${scalar(value)}`)
  lines.push(LAYOUT.frontmatter, body ?? '')
  return lines.join('\n')
}

/** Disposable workspace under the run's temp directory holding `skills/` plus an `outside/` directory. */
export async function skillWorkspace(t) {
  const base = await freshTempDir()
  const root = path.join(base, LAYOUT.root)
  const outside = path.join(base, 'outside')
  await mkdir(root)
  await mkdir(outside)
  t.after(() => removeTempDir(base))
  return { base, root, outside }
}

/** Write `<root>/<directory>/SKILL.md`; returns the file path. */
export async function placeSkill(root, directory, text) {
  const dir = path.join(root, directory)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, LAYOUT.file)
  await writeFile(file, text)
  return file
}

/** Bypass fixture: `<root>/<directory>/SKILL.md` is a symlink to `target`. */
export async function placeSymlinkedSkill(root, directory, target) {
  const dir = path.join(root, directory)
  await mkdir(dir, { recursive: true })
  await symlink(target, path.join(dir, LAYOUT.file))
}

/** Bypass fixture: `<root>/<directory>` itself is a symlink to `targetDir`. */
export async function placeSymlinkedDirectory(root, directory, targetDir) {
  await symlink(targetDir, path.join(root, directory))
}
