/**
 * The standard hosted setup an integration test boots: a host DSH (host-dsh.mjs) whose profile links
 * this checkout's dsh-instance and the sibling dsh-connector checkout's connector and its library,
 * with the instance placing fishball-core from the sibling dsh-fishball checkout (FISHBALL_REPO).
 * The siblings are only read: placement copies fishball-core into the child profile under the
 * throwaway home.
 */
import path from 'node:path'
import { REPO } from './constants.mjs'
import { bootHost, newHome, removeHome, untilValue } from './host-dsh.mjs'
import { siblingPackage, siblingRepo, SIBLING } from './siblings.mjs'

export const HOSTED = Object.freeze({
  instance: Object.freeze({ name: 'dsh-instance', dir: path.join(REPO, 'packages', 'dsh-instance') }),
  connector: Object.freeze({ name: 'dsh-agent-connector', folder: 'dsh-connector' }),
  connectorShared: Object.freeze({ name: 'dsh-connector-shared', folder: 'dsh-connector-shared' }),
  status: '/api/dsh-instance/status',
  /** The child states a start settles in (README "Ready"). */
  settled: Object.freeze(['ready', 'failed', 'disabled', 'stopped']),
  /** The child's private DSH home and profile under the main home (README "The child"). */
  childProfile: Object.freeze(['fishball', 'runtime', 'dsh-home', 'profiles', 'fishball']),
  launches: Object.freeze(['fishball', 'runtime', 'launches']),
})

/** The profile links of the standard setup; `connector: false` leaves the connector out. */
export function hostedLinks({ connector = true } = {}) {
  const links = [{ name: HOSTED.instance.name, dir: HOSTED.instance.dir }]
  if (connector) {
    links.unshift(
      { name: HOSTED.connector.name, dir: siblingPackage('connector', HOSTED.connector.folder) },
      { name: HOSTED.connectorShared.name, dir: siblingPackage('connector', HOSTED.connectorShared.folder), bundle: false },
    )
  }
  return links
}

/** The environment the instance needs to find fishball-core in the sibling checkout. */
export const hostedEnv = () => ({ [SIBLING.fishball.env]: siblingRepo('fishball') })

/** The instance's status route answer. */
export const instanceStatus = async (host) => (await host.get(HOSTED.status)).json

/** Wait (no deadline) until the instance's status is one of `states`; answers that status. */
export const settledStatus = (host, states = HOSTED.settled) => untilValue(async () => { const s = await instanceStatus(host).catch(() => undefined); return states.includes(s?.state) && s })

/**
 * One hosted setup for a test file: `start(sdk)` boots once (later calls reuse it), `restart(sdk, whileDown)`
 * stops the host (which stops the child), runs `whileDown(home)`, boots again on the same home and
 * answers the settled status. `close()` stops it and removes the home; call it from `after`.
 */
export function hostedSetup(label, { connector = true, env = {} } = {}) {
  let home
  let host
  let sdkOf
  const boot = async (sdk) => {
    sdkOf = sdk
    host = await bootHost(home, { sdk, links: hostedLinks({ connector }), env: { ...hostedEnv(), ...env } })
    return settledStatus(host)
  }
  return {
    get home() { return home },
    get host() { return host },
    childProfile: () => path.join(home, ...HOSTED.childProfile),
    async start(sdk) {
      if (host) return instanceStatus(host)
      home = newHome(label)
      return boot(sdk)
    },
    async restart(sdk = sdkOf, whileDown = () => {}) {
      await host.stop()
      await whileDown(home)
      return boot(sdk)
    },
    async close() {
      await host?.stop().catch(() => {})
      host = undefined
      if (home) removeHome(home, label)
      home = undefined
    },
  }
}
