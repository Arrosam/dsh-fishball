/**
 * Native oracle: the installed SDK's own skill grammar and filesystem provider, loaded per version
 * from its immutable install. "Native-loadable" in the T-SK cases means this provider, configured
 * with exactly one custom root, no default roots and no watcher, lists and loads the skill.
 *
 * Only public exports are used (`isSkillName`, `isModelInvocable`, `FileSystemSkillProvider`).
 * Without a `fs` service the provider reads through Node, i.e. the STOCK reader. SK-SEAM decision 1
 * replaces that reader with a confined one, so the stock reader is an oracle for document format
 * only and never for confinement.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SKILL_SDK } from './constants.mjs'

const loaded = new Map()

function packageDir(version, pkg) {
  return path.join(SKILL_SDK.versionsDir, version, SKILL_SDK.nodeModules, pkg)
}

async function importPackage(version, pkg) {
  const dir = packageDir(version, pkg)
  const manifest = JSON.parse(await readFile(path.join(dir, SKILL_SDK.packageFile), 'utf8'))
  // A mismatched install would make the "both SDKs" claim false, so refuse it instead of testing it.
  if (manifest.version !== version) throw new Error(`${pkg} at ${dir} is ${manifest.version}, not ${version}`)
  return import(pathToFileURL(path.join(dir, SKILL_SDK.entry)).href)
}

/** The public skill API of one installed SDK version, imported once per process. */
export function loadSdk(version) {
  if (!loaded.has(version)) {
    loaded.set(version, Promise.all([importPackage(version, SKILL_SDK.registry), importPackage(version, SKILL_SDK.filesystem)])
      .then(([registry, filesystem]) => Object.freeze({
        version,
        isSkillName: registry.isSkillName,
        isModelInvocable: registry.isModelInvocable,
        FileSystemSkillProvider: filesystem.FileSystemSkillProvider,
      })))
  }
  return loaded.get(version)
}

/**
 * Open one native provider over `root` alone. `extra` adds provider config (e.g. homes that must
 * stay unscanned); the single-root, no-default, no-watcher settings always win over it.
 * The caller must `close()`; `t.after(close)` is the usual pattern.
 */
export async function openNative(version, root, extra = {}) {
  const sdk = await loadSdk(version)
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
export async function nativeLibrary(version, root, extra = {}) {
  const native = await openNative(version, root, extra)
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
export async function nativeSkill(version, root, name) {
  const { skills } = await nativeLibrary(version, root)
  return skills.find((skill) => skill.name === name)
}
