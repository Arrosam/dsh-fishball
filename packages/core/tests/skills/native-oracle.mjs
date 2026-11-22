/**
 * Native oracle: the current DSH's own skill grammar and filesystem provider, from its immutable
 * install (fishball-test-helpers/dsh importDsh). "Native-loadable" in the T-SK cases means this provider, configured
 * with exactly one custom root, no default roots and no watcher, lists and loads the skill.
 *
 * Only public exports are used (`isSkillName`, `isModelInvocable`, `FileSystemSkillProvider`).
 * Without a `fs` service the provider reads through Node, i.e. the STOCK reader. SK-SEAM decision 1
 * replaces that reader with a confined one, so the stock reader is an oracle for document format
 * only and never for confinement.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DSH_VERSION, dshPackageDir, importDsh } from 'fishball-test-helpers/dsh'
import { SKILL_DSH } from './constants.mjs'

const MANIFEST = 'package.json'
let loaded

/** One DSH skill package; a copy whose version is not the current DSH's would make the "[DSH v]" claim false, so it is refused. */
async function importPackage(name) {
  const dir = dshPackageDir(name)
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'))
  if (manifest.version !== DSH_VERSION) throw new Error(`${name} at ${dir} is ${manifest.version}, not ${DSH_VERSION}`)
  return importDsh(name)
}

/** The public skill API of the current DSH, imported once per process. */
export function loadSdk() {
  loaded ??= Promise.all([importPackage(SKILL_DSH.registry), importPackage(SKILL_DSH.filesystem)])
    .then(([registry, filesystem]) => Object.freeze({
      version: DSH_VERSION,
      isSkillName: registry.isSkillName,
      isModelInvocable: registry.isModelInvocable,
      FileSystemSkillProvider: filesystem.FileSystemSkillProvider,
    }))
  return loaded
}

/**
 * Open one native provider over `root` alone. `extra` adds provider config (e.g. homes that must
 * stay unscanned); the single-root, no-default, no-watcher settings always win over it.
 * The caller must `close()`; `t.after(close)` is the usual pattern.
 */
export async function openNative(root, extra = {}) {
  const sdk = await loadSdk()
  const warnings = []
  const lifetime = new AbortController()
  // Minimal host context: no `fs` service (stock Node reader) and a recording logger.
  const ctx = { get: () => undefined, logger: { warn: (message) => warnings.push(String(message)) } }
  const control = { signal: lifetime.signal, invalidate: () => {} }
  const provider = new sdk.FileSystemSkillProvider(ctx, control, { ...extra, includeDefaultRoots: false, customSkillDirs: [root], watch: false })
  return {
    sdk,
    warnings,
    /** @returns {{complete: boolean, candidates: object[]}} */
    async list() {
      const listed = await provider.list({})
      return Array.isArray(listed) ? { complete: true, candidates: listed } : { complete: listed.complete, candidates: [...listed.candidates] }
    },
    /** Load a previously listed candidate; undefined when it is no longer loadable. */
    get: (candidate) => provider.get(candidate, {}),
    async close() {
      lifetime.abort()
      await provider.dispose()
    },
  }
}

/**
 * List and load every skill the native provider finds in `root`.
 * @returns {{complete: boolean, skills: object[], warnings: string[]}} a skill the native parser
 *   ignores is absent and usually leaves a warning.
 */
export async function nativeLibrary(root, extra = {}) {
  const native = await openNative(root, extra)
  try {
    const { complete, candidates } = await native.list()
    const skills = []
    for (const candidate of candidates) {
      const definition = await native.get(candidate)
      if (definition !== undefined) skills.push(definition)
    }
    return { complete, skills, warnings: native.warnings }
  } finally {
    await native.close()
  }
}

/** The one native definition named `name`, or undefined. */
export async function nativeSkill(root, name) {
  const { skills } = await nativeLibrary(root)
  return skills.find((skill) => skill.name === name)
}
