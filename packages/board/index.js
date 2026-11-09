import { LOG, NAMESPACE } from './src/constants.js'

export { Config } from './src/config.js'
export const name = NAMESPACE
// Both supported Cordis versions treat every injected name as required, even with '?'.
export const inject = ['tools']

export function apply(ctx) {
  // ctx.get is the host's unchecked read for the optional public service. Without X1/X2,
  // registering board tools globally would let other agents write it.
  if (!ctx.get('fishballInstance')) {
    ctx.logger(NAMESPACE).warn(LOG.instanceHooksMissing)
    return
  }
  // B1 is loading/configuration only. B4/B5 will register manager-scoped contributions.
}
