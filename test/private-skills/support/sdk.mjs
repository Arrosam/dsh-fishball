/**
 * Per-SDK module loading for the executable SK cases.
 *
 * Each `perSdk` block must run the instance code on ITS SDK, not on whatever FBTEST_DSH_RUNTIME
 * selects, or the "[SDK 0.2.1-rc.5]" and "[SDK 0.2.2-rc.1]" results would describe one runtime twice.
 * An instance module is imported under a `?fbsdk=<version>` URL. A resolve hook carries the tag to
 * every import inside the repository, and resolves only `@deepseek-ai/*` specifiers from that
 * version's installed node_modules. Every other bare specifier (e.g. `fishball-shared/*`, the V3
 * library of R-SHARED / R-ARCH-08) resolves normally from the importing file, and keeps the tag when
 * it lands inside the repository, so its own `@deepseek-ai/*` imports bind to the same version. The SDK packages
 * themselves are imported by their plain installed URLs, which are the same module instances the
 * tagged instance graph resolves to, and the same instances the native oracle imports.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../support/constants.mjs'
import { HARNESS, SKILL_SDK } from './constants.mjs'

const INSTANCE_DIR = path.join(REPO, 'packages', 'instance')
const REPO_URL = pathToFileURL(REPO + path.sep).href
const NODE_SCHEME = 'node:'
/** Only DSH's own packages are taken from the selected SDK. */
const SDK_SCOPE = '@deepseek-ai/'
let hooked = false

const sdkRoot = (version) => path.join(SKILL_SDK.versionsDir, version)
const tagged = (url, version) => {
  const next = new URL(url)
  next.searchParams.set(HARNESS.versionTag, version)
  return next.href
}
const versionOf = (url) => (url?.startsWith(REPO_URL) ? new URL(url).searchParams.get(HARNESS.versionTag) ?? undefined : undefined)

function install() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = versionOf(context.parentURL)
      if (version === undefined || specifier.startsWith(NODE_SCHEME)) return nextResolve(specifier, context)
      if (!specifier.startsWith(SDK_SCOPE)) {
        const resolved = nextResolve(specifier, context)
        return resolved.url.startsWith(REPO_URL) ? { ...resolved, url: tagged(resolved.url, version) } : resolved
      }
      // A parent inside the version directory makes Node find that version's own node_modules copy.
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(sdkRoot(version), SKILL_SDK.packageFile)).href })
    },
  })
}

/** Import a packages/instance module bound to one installed SDK version. */
export function importInstance(version, relative) {
  install()
  return import(tagged(pathToFileURL(path.join(INSTANCE_DIR, relative)).href, version))
}

/** Import one installed SDK package's public entry for `version`. */
export function importSdk(version, pkg) {
  return import(pathToFileURL(path.join(sdkRoot(version), SKILL_SDK.nodeModules, pkg, SKILL_SDK.entry)).href)
}
