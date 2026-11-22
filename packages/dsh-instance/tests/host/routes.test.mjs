/**
 * The instance's settings-page routes (routes.js JSDoc; README "Settings page"; QD1 = B): owner-only
 * DSH Fetch routes, JSON, no-store. GET status → {state, code, detail, notice, busy}; POST retry →
 * the same after the retry; POST restart → the status, with `refused` when refused; POST reconnect →
 * reconnect()'s answer; POST open {lang} → one admission under the page's own loopback hostname.
 * None carries a token. The route contract gained `busy()` and the restart route in fafbb5f ("Manage
 * the embedded Fishball's plugins from the main DSH; Restart button"), so the service stand-in
 * offers `busy()` and the status shape includes `busy`.
 *
 * Techniques: EP over Host headers (served / upper-case / non-loopback) and open bodies.
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { FIXTURE, HOSTNAME, K3, NOTICE, ROUTE, TICKET } from './constants.mjs'
import { fakeProviderSync, routeContext } from './fakes.mjs'
import { load, routesWorld } from './worlds.mjs'

/** A settings-page service as routes.js's JSDoc names it, recording its calls. */
function routeService(over = {}) {
  const calls = { retry: 0, restart: 0, reconnect: 0, open: [] }
  let state = K3.state.ready
  const service = {
    status: () => ({ state, code: null, detail: FIXTURE.detail }),
    notice: () => null,
    busy: () => false,
    async retry() { calls.retry += 1; state = K3.state.starting; return service.status() },
    async restart() { calls.restart += 1; return service.status() },
    async reconnect() { calls.reconnect += 1; return { ok: false, code: K3.refusal.connectorMissing } },
    // As the K3 locator's admit answers: a served loopback name gets a URL, any other is refused.
    async open(request) {
      calls.open.push(request)
      if (!HOSTNAME.served.includes(request.hostname)) return { ok: false, code: K3.refusal.hostname }
      return { ok: true, url: `http://${request.hostname}:${FIXTURE.port}${TICKET.path}?ticket=t` }
    },
    providerSync: fakeProviderSync(),
    ...over,
  }
  return { service, calls }
}

eachSdk((sdk) => {
  const world = (over) => { const s = routeService(over); return routesWorld(sdk, s.service, routeContext()).then((r) => ({ ...r, ...s })) }

  caseTest(sdk, 'ROUTES', 'status', 'GET /api/dsh-instance/status → 200 JSON no-store {state, code, detail, notice, busy}', async () => {
    const r = await world({ notice: () => NOTICE })
    const out = await r.call('GET', ROUTE.status)
    assert.equal(out.status, ROUTE.ok)
    assert.match(out.headers.get('content-type'), ROUTE.json)
    assert.equal(out.headers.get('cache-control'), ROUTE.noStore)
    assert.deepEqual(out.json, { state: K3.state.ready, code: null, detail: FIXTURE.detail, notice: NOTICE, busy: false })
  })
  caseTest(sdk, 'ROUTES', 'status busy', 'GET status says busy: true while a Fishball plugin change runs', async () => {
    const r = await world({ busy: () => true })
    assert.equal((await r.call('GET', ROUTE.status)).json.busy, true)
  })
  caseTest(sdk, 'ROUTES', 'retry', 'POST /api/dsh-instance/retry runs one retry and answers the status shape after it', async () => {
    const r = await world()
    const out = await r.call('POST', ROUTE.retry, { body: {} })
    assert.equal(r.calls.retry, 1)
    assert.deepEqual(Object.keys(out.json).sort(), [...ROUTE.statusKeys].sort())
    assert.equal(out.json.state, K3.state.starting)
  })
  caseTest(sdk, 'ROUTES', 'restart', 'POST /api/dsh-instance/restart runs one restart and answers the status; a refusal adds refused: <code>', async () => {
    const r = await world()
    const out = await r.call('POST', ROUTE.restart, { body: {} })
    assert.equal(r.calls.restart, 1)
    assert.deepEqual(Object.keys(out.json).sort(), [...ROUTE.statusKeys].sort())
    const refused = await world({ restart: async () => ({ refused: ROUTE.disabled }) })
    assert.equal((await refused.call('POST', ROUTE.restart, { body: {} })).json.refused, ROUTE.disabled)
  })
  caseTest(sdk, 'ROUTES', 'reconnect', "POST /api/dsh-instance/reconnect answers reconnect()'s result as it is", async () => {
    const r = await world()
    const out = await r.call('POST', ROUTE.reconnect, { body: {} })
    assert.equal(r.calls.reconnect, 1)
    assert.deepEqual(out.json, { ok: false, code: K3.refusal.connectorMissing })
  })
  for (const [hostHeader, hostname] of [[`${HOSTNAME.ipv4}:${FIXTURE.port}`, HOSTNAME.ipv4], [`${HOSTNAME.localhost}:${FIXTURE.port}`, HOSTNAME.localhost], [`${HOSTNAME.upper}:${FIXTURE.port}`, HOSTNAME.localhost]]) {
    caseTest(sdk, 'ROUTES', 'open', `POST open {lang: zh} under Host ${hostHeader} → {ok: true, url}; open was asked for hostname ${hostname} and lang zh`, async () => {
      const r = await world()
      const out = await r.call('POST', ROUTE.open, { body: { lang: K3.langs[0] }, host: hostHeader })
      assert.equal(out.json?.ok, true, out.text)
      assert.equal(typeof out.json.url, 'string')
      assert.deepEqual(r.calls.open.map((o) => [o.hostname, o.lang]), [[hostname, K3.langs[0]]])
    })
  }
  for (const name of [HOSTNAME.refused[0], HOSTNAME.refused[1]]) {
    caseTest(sdk, 'ROUTES', 'open', `POST open under a non-loopback Host ${name} → {ok: false, code: hostname-refused}; no URL`, async () => {
      const r = await world()
      const out = await r.call('POST', ROUTE.open, { body: { lang: K3.langs[1] }, host: `${name}:${FIXTURE.port}` })
      assert.deepEqual(out.json, { ok: false, code: K3.refusal.hostname })
      assert.deepEqual(r.calls.open.filter((o) => HOSTNAME.served.includes(o.hostname)), [])
    })
  }
  for (const body of [{ lang: 'fr' }, {}, { lang: K3.langs[0], view: 'settings' }, 'not json']) {
    caseTest(sdk, 'ROUTES', 'open', `POST open with body ${JSON.stringify(body)} → refused, no admission asked`, async () => {
      const r = await world()
      const out = await r.call('POST', ROUTE.open, { body })
      assert.notEqual(out.json?.ok, true, out.text)
      assert.deepEqual(r.calls.open, [])
    })
  }
  caseTest(sdk, 'ROUTES', 'open view', "Open admits the view chat (Q7: Fishball's page)", async () => {
    const { LOOPBACK } = await load(sdk, 'constants')
    assert.equal(LOOPBACK.openView, ROUTE.openView)
  })
  caseTest(sdk, 'ROUTES', 'models', 'the models/check and models/add routes keep their paths under /api/dsh-instance/', async () => {
    const { PROVIDER_SYNC_ROUTE } = await load(sdk, 'syncRoutes')
    assert.deepEqual({ ...PROVIDER_SYNC_ROUTE }, { ...ROUTE.models })
  })
  caseTest(sdk, 'ROUTES', 'secret', 'no route answer carries a token: status, retry, restart, reconnect, open', async () => {
    const r = await world()
    const answers = [
      await r.call('GET', ROUTE.status), await r.call('POST', ROUTE.retry, { body: {} }), await r.call('POST', ROUTE.restart, { body: {} }),
      await r.call('POST', ROUTE.reconnect, { body: {} }), await r.call('POST', ROUTE.open, { body: { lang: K3.langs[1] } }),
    ]
    assert.deepEqual(answers.map((a) => a.status), answers.map(() => ROUTE.ok))
    assert.equal(answers.map((a) => a.text).join('\n').includes(FIXTURE.planted), false)
  })
})
