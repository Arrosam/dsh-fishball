/** Resolver-only SDK bridge; never launches DSH or reaches user configuration. */
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FIXTURE } from './provider-sync-official.mjs'

const requireSDK = createRequire(path.join(FIXTURE.runtime, '../package.json'))
let installed = false
export function resolveOfficialSDK() {
  if (installed) return
  installed = true
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!specifier.startsWith('@deepseek-ai/')) return nextResolve(specifier, context)
      return { url: pathToFileURL(requireSDK.resolve(specifier)).href, shortCircuit: true }
    },
  })
}
