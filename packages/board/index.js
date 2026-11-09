import { LOG, NAMESPACE } from './src/constants.js'
import { createBoardStore } from './src/store.js'
import { createBoardTools } from './src/board.js'

export { Config } from './src/config.js'
export const name = NAMESPACE
// Both supported Cordis versions treat every injected name as required, even with '?'.
export const inject = ['tools']

// Extension points §1: a missing service OR another apiVersion is an "older instance".
const HOST = Object.freeze({ instance: 'fishballInstance', profile: 'profileContext', apiVersion: 1 })

export function apply(ctx) {
  // ctx.get is the host's unchecked read for the optional public service. Without X1/X2,
  // registering board tools globally would let other agents write it.
  const instance = ctx.get(HOST.instance)
  if (instance?.apiVersion !== HOST.apiVersion) {
    ctx.logger(NAMESPACE).warn(LOG.instanceHooksMissing)
    return
  }
  // One store per row (child home): every manager setup (create and each resume) shares its
  // in-process write queue. It is opened lazily on the first tool call, never at row load.
  const now = Date.now
  let store
  const openStore = () => store ??= createBoardStore({ home: ctx.get(HOST.profile).home, now })
  const sessionId = () => instance.manager.sessionId()
  const dispose = instance.manager.registerSetup(NAMESPACE, (agentCtx) => {
    // Tools registered in the X2 fiber are removed by its disposal. B5 adds guide/context here.
    for (const tool of createBoardTools({ openStore, sessionId, now })) agentCtx.tools.register(tool)
  })
  // Disabling the row removes every manager-scope contribution with the X2 registration.
  return dispose
}
