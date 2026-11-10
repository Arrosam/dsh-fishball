/**
 * Shared T-SK helpers: per-SDK case blocks, SK-owned cases (executable or reasoned TODO), disposable skill roots and the
 * native document builder used by the executable native-oracle premises.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, test } from 'node:test'
import { tempPath } from '../../support/temp-path.mjs'
import { LAYOUT, OWNER, SKILL_SDK, UNOBSERVABLE } from './constants.mjs'

/** Run `body(version)` once per supported SDK, so every case id is reported for both SDKs. */
export function perSdk(group, body) {
  for (const version of SKILL_SDK.versions) describe(`${group} [SDK ${version}]`, () => body(version))
}

/**
 * SK-owned cases, now executable against the SK implementation. The title stays the approved
 * `<id> <oracle> — owner: SK`. A case whose oracle needs a seam the in-process child does not have
 * gets `reason` (an UNOBSERVABLE value) and stays `test.todo`, its title ending with that reason.
 * @param version - the SDK this block runs on.
 * @param cases - [id, oracle] pairs.
 * @param scenarios - { [id]: (t, version) => Promise } or { [id]: { reason } }.
 */
export function skCases(version, cases, scenarios) {
  for (const [id, oracle] of cases) {
    const scenario = scenarios[id]
    if (scenario === undefined) throw new Error(`${id} has no scenario and no stated reason`)
    const title = `${id} ${oracle} — owner: ${OWNER.sk}`
    if (typeof scenario === 'function') test(title, (t) => scenario(t, version))
    else test.todo(`${title} — ${UNOBSERVABLE.prefix}: ${scenario.reason}`)
  }
}

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

/** Disposable workspace under /private/tmp holding `skills/` plus an `outside/` directory. */
export async function skillWorkspace(t) {
  const base = tempPath(await mkdtemp(LAYOUT.tempPrefix))
  const root = path.join(base, LAYOUT.root)
  const outside = path.join(base, 'outside')
  await mkdir(root)
  await mkdir(outside)
  t.after(() => rm(tempPath(base), { recursive: true, force: true }))
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
