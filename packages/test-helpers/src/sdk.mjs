/**
 * Per-SDK module loading. A repository module imported through importBound(version, file) runs on
 * THAT installed SDK: a resolve hook carries the `?fbsdk=<version>` tag to every import inside the
 * repository and resolves `@deepseek-ai/*` specifiers from that version's node_modules. Any other
 * bare specifier resolves normally from the importing file and keeps the tag when it lands inside
 * the repository. So one test process can hold the same module bound to two SDKs side by side.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO, SDK } from './constants.mjs'

const NODE_SCHEME = 'node:'
/** Folders whose modules carry the SDK tag on: this repository, plus any sibling checkout an integration package binds. */
const roots = [pathToFileURL(REPO + path.sep).href]
let hooked = false

/** Let modules under `dir` (a sibling checkout) be bound to an SDK too. */
export function bindRoot(dir) {
  const url = pathToFileURL(path.resolve(dir) + path.sep).href
  if (!roots.includes(url)) roots.push(url)
}
const inRoots = (url) => roots.some((root) => url?.startsWith(root))

export const sdkRoot = (version) => path.join(SDK.versionsDir, version)
/** The installed node_modules folder of one SDK version. */
export const runtimeOf = (version) => path.join(sdkRoot(version), SDK.nodeModules)

const tagged = (url, version) => {
  const next = new URL(url)
  next.searchParams.set(SDK.versionTag, version)
  return next.href
}
const versionOf = (url) => (inRoots(url) ? new URL(url).searchParams.get(SDK.versionTag) ?? undefined : undefined)

function install() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = versionOf(context.parentURL)
      if (version === undefined || specifier.startsWith(NODE_SCHEME)) return nextResolve(specifier, context)
      if (!specifier.startsWith(SDK.scope)) {
        const resolved = nextResolve(specifier, context)
        return inRoots(resolved.url) ? { ...resolved, url: tagged(resolved.url, version) } : resolved
      }
      // A parent inside the version folder makes Node find that version's own copy.
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(sdkRoot(version), SDK.packageFile)).href })
    },
  })
}

/** Import a file (absolute path, in this repository or a bound root) bound to one installed SDK version. */
export function importBound(version, file) {
  install()
  return import(tagged(pathToFileURL(file).href, version))
}

/** Import one installed SDK package's public entry (`<pkg>/lib/index.js`) for `version`. */
export function importSdk(version, pkg, entry = SDK.entry) {
  return import(pathToFileURL(path.join(runtimeOf(version), pkg, entry)).href)
}

/** The SDK's own Cordis `Context` class. */
export async function cordisOf(version) {
  return (await import(pathToFileURL(path.join(runtimeOf(version), SDK.cordisEntry)).href)).Context
}

/** The SDK's built web frontend assets folder (DSH's own browser bundle). */
export const frontendAssetsOf = (version) => path.join(runtimeOf(version), SDK.frontendAssets)
