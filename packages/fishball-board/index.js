import { LOG, NAMESPACE } from './src/constants.js'
import { createBoardStore } from './src/store.js'
import { createBoardTools } from './src/board.js'
import { registerBoardSearch } from './src/search.js'
import { followInstance, reportCoreMissing } from 'fishball-shared/instance-follower'

export { Config } from './src/config.js'
export const name = NAMESPACE
// Both supported Cordis versions treat every injected name as required, even with '?', so
// fishball-core's `fishballInstance` is looked up at runtime and never injected (R-FB-06).
export const inject = ['tools']

// Extension points §1: a missing service OR another apiVersion is an "older instance".
// No Fishball contract module is imported for these values: this package must load with no
// fishball-core and no connector installed (R-FB-06), so it cannot resolve `fishball-core/contracts`.
// `appReady` is DSH's launcher readiness service (dsh profile-boot, both SDKs).
const HOST = Object.freeze({
  service: 'fishballInstance', profile: 'profileContext', apiVersion: 1, serviceEvent: 'internal/service',
  appReady: 'appReady',
})

export function apply(ctx) {
  // One store per row (child home): every manager setup (create and each resume) shares its
  // in-process write queue. It is opened lazily on the first tool call, never at row load.
  const now = Date.now
  let store
  const openStore = () => store ??= createBoardStore({ home: ctx.get(HOST.profile).home, now })
  // ctx.get is the host's unchecked read for the optional public service. Without X1/X2,
  // registering board tools globally would let other agents write it.
  const binding = followInstance(ctx, HOST, (instance) => {
    const sessionId = () => instance.manager.sessionId()
    return instance.manager.registerSetup(NAMESPACE, (agentCtx) => {
      // X2 disposal removes tools and search guidance. B5 owns the remaining board guide/context.
      for (const tool of createBoardTools({ openStore, sessionId, now })) agentCtx.tools.register(tool)
      registerBoardSearch(agentCtx, { openStore, sessionId })
    })
  })
  // Once per load, at app ready; a later arrival attaches without a further log line. Disabling
  // the row removes every manager-scope contribution with the X2 registration (followInstance's effect).
  reportCoreMissing(ctx, HOST, binding, () => ctx.logger(NAMESPACE).warn(LOG.coreMissing))
}
