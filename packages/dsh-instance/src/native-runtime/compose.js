import path from 'node:path'
import { RUNTIME, runtimeLimits } from './constants.js'
import { prepareLayout, snapshotPath } from './files.js'
import { resolveInstallation, initializeProfile } from './installation.js'
import { launchOverlay } from './overlay.js'
import { preflight as defaultPreflight } from '../native-preflight.js'

/**
 * The identity of the record composedProfile computes an overlay for. No child is ever started
 * with it: a start mints its own random instance id (index.js launch). It only fills the
 * lifecycle rows' config and the snapshot path the overlay names, as a start's record would.
 */
export const COMPOSE_RECORD = Object.freeze({
  instanceId: '00000000-0000-4000-8000-000000000000',
})

/**
 * A hosted child's composition without launching it: the same layout, placement, profile load
 * and launch overlay a start runs (index.js launch), for readers that check what a start would
 * compose. It writes what a start writes before its launch (the runtime layout, the placed
 * bundles, the placement record and the profile manifest) and nothing after it: no launch
 * directory, no snapshot, no overlay file, no child process. In a packed instance that includes
 * the set's install, which runs pnpm and may use the registry (placement.js installPackedSet).
 * @param {{mainHome: string, installAnchor: string, fishballLiveRepo?: string}} options - a canonical main DSH home, and the
 *   installed DSH package.json whose installation the child would run. Set fishballLiveRepo to an
 *   absolute Fishball checkout path to compose live links in place of release/copy placement.
 * @returns {Promise<{paths: object, entries: object[], overlay: object[], record: object}>} the
 *   runtime layout, the composed profile rows (bundle layers, the profile patch, the home patch),
 *   the launch overlay's operations for `record`, and that record.
 */
export async function composedProfile({ mainHome, installAnchor, fishballLiveRepo }) {
  const { paths, marker } = await prepareLayout(mainHome)
  const installation = await resolveInstallation(installAnchor)
  const { entries, hmrRoots } = await initializeProfile(paths, installation, defaultPreflight, [], undefined, fishballLiveRepo)
  const record = Object.freeze({ format: RUNTIME.format, hostId: marker.hostId, ...COMPOSE_RECORD, installAnchor: installation.installAnchor, installRoot: installation.installRoot, version: installation.version })
  const childModule = path.join(snapshotPath(paths, record.instanceId), RUNTIME.snapshot.lifecycle)
  const overlay = launchOverlay(paths, record, childModule, runtimeLimits(), {}, entries, undefined, hmrRoots)
  return { paths, entries, overlay, record }
}
