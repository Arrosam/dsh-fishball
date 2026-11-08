/** WD-1 package row only. Runtime hooks and readiness are wired by WD-12/WD-13. */
import { PLUGIN, SERVICES } from './src/constants.js'
export { Config } from './src/config.js'

export const name = PLUGIN.name
export const inject = [...SERVICES]

export function apply(ctx) {
  // Cordis has no '?' injection suffix. Public lookup allows older instances to load
  // the row without requiring fishballInstance (or reaching into internal fishballChat).
  const instance = ctx.get(PLUGIN.instanceService)
  if (instance?.apiVersion !== PLUGIN.apiVersion) return
  // Deliberately do not register supervision/claims or mark this skeleton ready.
}
