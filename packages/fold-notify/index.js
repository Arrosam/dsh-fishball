import { PLUGIN } from './src/constants.js'

export { Config } from './src/config.js'
export const name = PLUGIN.name
// Cordis on both supported hosts treats '?' literally, not as optional injection.
// Later contributions can use ctx.inject(['fishballInstance'], ...) without blocking this row.
export const inject = ['tools']

export function apply(ctx, config) {
  // FN-1 is only the loadable row and config. Contributions are added by FN-2/3/6;
  // do not require the optional instance hooks merely to load on an older instance.
}
