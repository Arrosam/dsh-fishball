/** Test-only spawn for this host world's real runtime. No subprocess is started. */
import { worldOf } from '@dsh-instance/test-helpers/swap'

export const LAUNCH_WORLD = 'dshiLaunch'

export function spawn(...args) {
  return worldOf(LAUNCH_WORLD, import.meta.url).spawn(...args)
}
