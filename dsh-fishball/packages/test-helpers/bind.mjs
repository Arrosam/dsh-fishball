/**
 * Import a repository module bound to the current DSH.
 *
 * A Fishball package imports DSH's own packages (`@deepseek-ai/*`) as peers; in the repository they
 * are not installed, so the module is imported under a `?fbsdk=<version>` URL and a resolve hook
 * resolves every `@deepseek-ai/*` import of that module graph from that installed version. Every other
 * bare specifier (`fishball-shared/*`, `@modelcontextprotocol/client`) resolves normally from the
 * importing file and keeps the tag when it lands inside the repository, so its own DSH imports bind to
 * the same version. The DSH packages themselves are the plain installed modules, the same instances
 * importDsh answers.
 */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DSH_VERSION, VERSIONS_DIR } from './dsh.mjs'
import { WORKSPACE_ROOT } from './packages.mjs'

const BIND = Object.freeze({ tag: 'fbsdk', nodeScheme: 'node:', dshScope: '@deepseek-ai/', manifest: 'package.json' })
const REPO_URL = pathToFileURL(WORKSPACE_ROOT + path.sep).href
let hooked = false

const tagged = (url, version) => {
  const next = new URL(url)
  next.searchParams.set(BIND.tag, version)
  return next.href
}
const versionOf = (url) => (url?.startsWith(REPO_URL) ? new URL(url).searchParams.get(BIND.tag) ?? undefined : undefined)

function install() {
  if (hooked) return
  hooked = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const version = versionOf(context.parentURL)
      if (version === undefined || specifier.startsWith(BIND.nodeScheme)) return nextResolve(specifier, context)
      if (!specifier.startsWith(BIND.dshScope)) {
        const resolved = nextResolve(specifier, context)
        return resolved.url.startsWith(REPO_URL) ? { ...resolved, url: tagged(resolved.url, version) } : resolved
      }
      // A parent inside the version folder makes Node find that version's own copy.
      return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(VERSIONS_DIR, version, BIND.manifest)).href })
    },
  })
}

/**
 * A plugin row module (`{name, apply, Config?, inject?}`) bound to the current DSH, as DSH's loader
 * would load it; fails the case when the file is missing or exports no apply().
 */
export async function rowModule(file) {
  const fs = await import('node:fs')
  if (!fs.existsSync(file)) throw new Error(file + ' does not exist')
  const mod = await importBound(file)
  if (typeof mod.apply !== 'function') throw new Error(file + ' exports no apply()')
  return mod
}

/** Import `file` (an absolute path inside the repository) bound to the current DSH. */
export function importBound(file, version = DSH_VERSION) {
  if (!path.isAbsolute(file)) throw new Error('importBound needs an absolute path: ' + file)
  install()
  return import(tagged(pathToFileURL(file).href, version))
}
