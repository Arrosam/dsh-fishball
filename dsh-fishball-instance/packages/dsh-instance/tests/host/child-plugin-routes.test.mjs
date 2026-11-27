/** The toggle-specific HTTP boundary (README "Plugins for Fishball" and child-plugin-routes.js). */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { callRoute } from '@dsh-instance/test-helpers/routes'
import { FIXTURE, K3, ROUTE, TOGGLE } from './constants.mjs'
import { routeContext } from './fakes.mjs'
import { load, ROUTE_ORIGIN } from './worlds.mjs'

const VALID = Object.freeze({ name: TOGGLE.name, enabled: false })
const INVALID = Object.freeze([
  '{bad-json', '[]', {}, { enabled: true }, { name: FIXTURE.spaces, enabled: false },
  { name: TOGGLE.name }, { ...VALID, enabled: 'false' }, { ...VALID, enabled: 0 }, { ...VALID, enabled: null },
  { ...VALID, extra: true },
])
const fence = ({ headers }) => {
  const origin = headers.get('origin')
  if (origin !== null && new URL(origin).host !== headers.get('host')) return { reason: K3.refusal.failed }
}

async function toggleWorld(sdk, { requestRejection = fence, answer } = {}) {
  const { CHILD_PLUGIN_ROUTE, registerChildPluginRoutes } = await load(sdk, 'childPluginRoutes')
  const { ctx, routes } = routeContext()
  if (requestRejection) ctx.connection.requestRejection = requestRejection
  const calls = []
  registerChildPluginRoutes(ctx, { setEnabled(name, enabled) { calls.push({ name, enabled }); return answer ?? { ok: true, name, enabled, applied: TOGGLE.restarting } } })
  return {
    calls, routes, path: CHILD_PLUGIN_ROUTE.toggle,
    post: (body, headers = {}) => callRoute(routes, 'POST', TOGGLE.route, { origin: ROUTE_ORIGIN, body, headers }),
  }
}

eachSdk((sdk) => {
  caseTest(sdk, 'CP-EP-TOGGLE', 'delegation', 'POST toggle delegates a trimmed name and either boolean; a service refusal is also HTTP 200', async () => {
    const w = await toggleWorld(sdk)
    assert.equal(w.path, TOGGLE.route)
    assert.deepEqual(w.routes.find((route) => route.path === TOGGLE.route)?.methods, ['POST'])
    const enabled = { ...VALID, enabled: true }
    for (const input of [VALID, enabled]) {
      const res = await w.post({ ...input, name: '  ' + input.name + '  ' })
      assert.equal(res.status, ROUTE.ok)
      assert.deepEqual(res.json, { ok: true, ...input, applied: TOGGLE.restarting })
    }
    assert.deepEqual(w.calls, [VALID, enabled])
    const answer = { ok: false, code: TOGGLE.protected }
    const refusal = await toggleWorld(sdk, { answer })
    const res = await refusal.post(VALID)
    assert.equal(res.status, ROUTE.ok)
    assert.deepEqual(res.json, answer)
  })

  caseTest(sdk, 'CP-BVA-TOGGLE', 'shape and bytes', 'invalid toggle bodies never delegate; 16 KiB is accepted, one byte over is refused', async () => {
    const w = await toggleWorld(sdk)
    const padded = JSON.stringify(VALID).padEnd(TOGGLE.maxBytes, ' ')
    for (const body of [...INVALID, padded + ' ']) {
      const res = await w.post(body)
      assert.equal(res.status, TOGGLE.badRequest, JSON.stringify(body).slice(0, 100))
      assert.deepEqual(res.json, { ok: false, code: K3.refusal.invalid })
    }
    assert.deepEqual(w.calls, [])
    assert.equal((await w.post(padded)).status, ROUTE.ok)
    assert.deepEqual(w.calls, [VALID])
  })

  caseTest(sdk, 'CP-DT-TOGGLE', 'same-origin fence', 'disallowed Sec-Fetch-Site, foreign Origin, or no connection check → 403 before delegation', async () => {
    const w = await toggleWorld(sdk)
    const noFence = await toggleWorld(sdk, { requestRejection: null })
    for (const [world, headers] of [
      ...TOGGLE.refusedSites.map((site) => [w, { 'sec-fetch-site': site, origin: ROUTE_ORIGIN }]),
      [w, { origin: TOGGLE.crossOrigin }],
      [noFence, { origin: ROUTE_ORIGIN }],
    ]) {
      const res = await world.post(VALID, headers)
      assert.equal(res.status, TOGGLE.forbidden)
      assert.deepEqual(res.json, { ok: false, code: K3.refusal.failed })
    }
    assert.deepEqual([...w.calls, ...noFence.calls], [])
  })
})
