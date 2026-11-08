/** Resolver-only SDK bridge; never launches DSH or reaches user configuration. */
import { registerHooks } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { FIXTURE } from './provider-sync-official.mjs'

/** A parent URL inside the selected runtime: a bare name resolved from it finds the runtime's own copy. */
export const RUNTIME_PARENT_URL = pathToFileURL(path.join(FIXTURE.runtime, '../package.json')).href
let installed = false
/**
 * Resolve the given bare names (default: every `@deepseek-ai/*`) from the selected runtime. The hook
 * delegates to nextResolve with a runtime parent instead of calling require.resolve: since Node 24,
 * hooks from registerHooks also run inside require.resolve, so calling it here re-entered this hook
 * without end (RangeError: Maximum call stack size exceeded).
 */
export function resolveFromRuntime(matches) {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (!matches(specifier)) return nextResolve(specifier, context)
      return nextResolve(specifier, { ...context, parentURL: RUNTIME_PARENT_URL })
    },
  })
}
export function resolveOfficialSDK() {
  if (installed) return
  installed = true
  resolveFromRuntime((specifier) => specifier.startsWith('@deepseek-ai/'))
}
