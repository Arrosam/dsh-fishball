/**
 * The readiness seams under test, each imported bound to one SDK through the package's own support
 * (tests/support/instance.mjs): loopbackOrigin and the RUNTIME vocabulary (constants.js), the child's
 * readiness gate (child.js childReadiness, requireBaseServices), the host's rule for one health answer
 * (index.js readyHealth), the lifecycle wire (wire.js Wire) and the first-install sync
 * (src/host/initial-sync.js createInitialSync).
 */
import net from 'node:net'
import { once } from 'node:events'
import { importInstance } from '../support/instance.mjs'

export const constantsOf = (sdk) => importInstance(sdk, 'src/native-runtime/constants.js')
export const childOf = (sdk) => importInstance(sdk, 'src/native-runtime/child.js')
export const hostOf = (sdk) => importInstance(sdk, 'src/native-runtime/index.js')
export const wireOf = (sdk) => importInstance(sdk, 'src/native-runtime/wire.js')
export const initialSyncOf = (sdk) => importInstance(sdk, 'src/host/initial-sync.js')

/** A ctx whose `get` answers a service for every name except `absent` (base services mounted, or one missing). */
export const servicesCtx = (absent = []) => ({ get: (name) => ([absent].flat().includes(name) ? undefined : {}) })

/**
 * Two authenticated Wire ends over a real in-process TCP pair (no DSH process, no HTTP). The
 * authentication handshake is not under test here, so both ends are marked authenticated, as the
 * mutual proof leaves them.
 */
export async function wirePair(scope, sdk) {
  const { Wire } = await wireOf(sdk)
  const { runtimeLimits } = await constantsOf(sdk)
  const server = net.createServer()
  scope.defer(() => new Promise((resolve) => server.close(() => resolve())))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const connected = once(server, 'connection')
  const client = net.connect(server.address().port, '127.0.0.1')
  const [socket] = await connected
  scope.defer(() => { client.destroy(); socket.destroy() })
  const sender = new Wire(client, runtimeLimits())
  const receiver = new Wire(socket, runtimeLimits())
  sender.authenticated = true
  receiver.authenticated = true
  return { sender, receiver }
}
