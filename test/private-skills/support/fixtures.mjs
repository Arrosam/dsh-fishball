/**
 * Shared T-SK helpers: per-SDK case blocks, SK-owned TODO cases, disposable skill roots and the
 * native document builder used by the executable native-oracle premises.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, test } from 'node:test'
import { tempPath } from '../../support/temp-path.mjs'
import { LAYOUT, OWNER, SKILL_SDK } from './constants.mjs'

/** Run `body(version)` once per supported SDK, so every case id is reported for both SDKs. */
export function perSdk(group, body) {
  for (const version of SKILL_SDK.versions) describe(`${group} [SDK ${version}]`, () => body(version))
}

/**
 * Cases this task cannot run: each needs the SK implementation (the dedicated tool, its trusted
 * storage service and the child manager). Every title carries id, requirement oracle and owner.
 * @param cases - [id, oracle] pairs.
 */
export function todoSk(cases) {
  for (const [id, oracle] of cases) test.todo(`${id} ${oracle} — owner: ${OWNER.sk}`)
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
