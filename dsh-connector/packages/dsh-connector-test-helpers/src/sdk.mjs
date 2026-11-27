/**
 * Binding product modules to one installed DSH version.
 *
 * A repository module is imported under a `?dshsdk=<version>` URL. A resolve hook carries the tag
 * to every import that lands inside the repository, and resolves DSH's own packages
 * (`@deepseek-ai/*` and the runtime packages a profile takes from DSH, such as zod) from that
 * version's node_modules. So a case exercises the module against the version it names, and the SDK
 * packages a case imports itself (`importSdk`) are the same instances the module sees.
 */
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runVersions, sdkRoot, versionsDir } from './config.mjs'
import { SDK_LAYOUT, VERSION_TAG } from './constants.mjs'
import { MONOREPO, REPO } from './repo.mjs'

const REPO_URL = pathToFileURL(MONOREPO + path.sep).href
const NODE_SCHEME = 'node:'
/** Packages outside @deepseek-ai/ that DSH ships and a DSH profile resolves from DSH, not from the repo. */
const RUNTIME_PACKAGES = Object.freeze(['zod', 'yaml'])
let hooked = false

const tagged = (url, version) => {
  const next = new URL(url)
  next.searchParams.set(VERSION_TAG, version)
  return next.href
}
/** The version a repository module URL was bound to, or undefined. */
export const versionOf = (url) => (url?.startsWith(REPO_URL) ? new URL(url).searchParams.get(VERSION_TAG) ?? undefined : undefined)
const fromDsh = (specifier) => specifier.startsWith(SDK_LAYOUT.scope) || RUNTIME_PACKAGES.includes(specifier)

function install() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = versionOf(context.parentURL)
      if (version === undefined || specifier.startsWith(NODE_SCHEME)) return nextResolve(specifier, context)
      if (!fromDsh(specifier)) {
        const resolved = nextResolve(specifier, context)
        return resolved.url.startsWith(REPO_URL) ? { ...resolved, url: tagged(resolved.url, version) } : resolved
      }
      // A parent inside the version directory makes Node find that version's own copy.
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(sdkRoot(version), SDK_LAYOUT.packageFile)).href })
    },
  })
}

/** The DSH versions this run covers (the current DSH, unless the release matrix is set). */
export const versions = () => runVersions()

/** A repository file URL tagged for `version` (for loaders that take a URL, such as a Cordis loader row). */
export function boundUrl(version, file) {
  install()
  return tagged(pathToFileURL(file).href, version)
}

/** Import a repository file (absolute path) bound to DSH `version`. */
export const importBound = (version, file) => import(boundUrl(version, file))

/** The node_modules folder of DSH `version`. */
export const runtimeOf = (version) => path.join(sdkRoot(version), SDK_LAYOUT.nodeModules)

/** A file inside DSH `version`'s node_modules. */
export const sdkFile = (version, ...parts) => path.join(runtimeOf(version), ...parts)

/** Import one of DSH `version`'s packages by its public entry (lib/index.js unless `entry` is given). */
export const importSdk = (version, pkg, entry = SDK_LAYOUT.entry) => import(pathToFileURL(sdkFile(version, pkg, entry)).href)

/** require() rooted in DSH `version` (for the CommonJS packages it ships, such as saxes or zod). */
export const requireSdk = (version, pkg) => createRequire(path.join(sdkRoot(version), SDK_LAYOUT.packageFile))(pkg)

export { sdkRoot, VERSION_TAG }
// ------------------------------------------------------------------------------------------------
// The names the suites used with the old root harness (test/private-skills/support), kept so the
// moved suites read the same. `importInstance(version, relative)` resolves `relative` against
// INSTANCE.dir (a fixed folder inside the repository), so path.relative(INSTANCE.dir, file) works.

/** The folder relative module paths are resolved from (the old dsh-instance anchor). */
export const INSTANCE = Object.freeze({ dir: path.join(REPO, 'packages', 'dsh-instance') })
/** Import a repository module (relative to INSTANCE.dir) bound to DSH `version`. */
export const importInstance = (version, relative) => importBound(version, path.join(INSTANCE.dir, relative))
/** The DSH versions folder layout, under its old name. */
export const SKILL_SDK = Object.freeze({ versionsDir, nodeModules: SDK_LAYOUT.nodeModules, packageFile: SDK_LAYOUT.packageFile, entry: SDK_LAYOUT.entry })
/** The binding tag, under its old name. */
export const HARNESS = Object.freeze({ versionTag: VERSION_TAG })
