/**
 * The host area's host row: the shared host-row world (support/host-row.mjs: host.js `apply` over
 * a fake row context and the fake runtime, the package's `node:fs/promises` held by fs-hold) with
 * the area's fixture: the fake connector `dshConnectorTokens`, one child store shared by every
 * child start (whose real credential receiver answers at the fake child's end of each in-memory
 * wire), and the config fields `enabled` and `extraTarget` (a leftover `targetUrl` field: MULTI-2
 * removed it; adversarial input). Everything else is the real instance code: the hosted record on
 * disk, the hosted-token rules, the locator and the credential client.
 */
import { turn, until } from '@dsh-instance/test-helpers/wait'
import { callRoute } from '@dsh-instance/test-helpers/routes'
import { fakeChildCredentials, fakeTokens } from '../support/fakes.mjs'
import { hostRowWorld } from '../support/host-row.mjs'
import { FIXTURE, K3, ROW } from './constants.mjs'
import { ROUTE_ORIGIN, scopeOf } from './worlds.mjs'

/**
 * One host-row world on `sdk`. Options: `home` (the main home), `enabled`, `extraTarget` (a leftover
 * targetUrl field), `holdStarts` (how many starts wait on `startGate`), `credentials`
 * (fakeChildCredentials options; one store shared by every child start).
 */
export async function rowWorld(t, sdk, { home, enabled = true, extraTarget = FIXTURE.blank, holdStarts = 0, credentials } = {}) {
  const tokens = fakeTokens({ fixture: FIXTURE, apiVersion: K3.tokensApiVersion, onChange: false })
  const row = await hostRowWorld(scopeOf(t), sdk, {
    home, holdStarts, tokens,
    fields: { [ROW.enabled]: enabled, [ROW.extraTarget]: extraTarget },
    volatileUpdate: ROW.volatileUpdate,
    credentials: fakeChildCredentials(credentials),
    hostId: FIXTURE.runtimeId, childOrigin: FIXTURE.hostOrigin, webOrigin: FIXTURE.hostOrigin,
    launchToken: FIXTURE.launchToken, generation: FIXTURE.generation,
  })
  const world = Object.assign(row, {
    tokens,
    /** One request to a route this row registered. */
    call: (method, routePath, options) => callRoute(row.routes, method, routePath, { origin: ROUTE_ORIGIN, ...options }),
    locator: (c = world.current) => world.serviceOf(K3.service, c),
    status: (c = world.current) => world.locator(c).status(),
    recordWarns: () => row.logs.filter((l) => l.level === ROW.warnLevel && l.args[0] === ROW.recordWarn).map((l) => l.args),
    /** Wait for `cond()` (no deadline). */
    until,
    turn,
  })
  return world
}
