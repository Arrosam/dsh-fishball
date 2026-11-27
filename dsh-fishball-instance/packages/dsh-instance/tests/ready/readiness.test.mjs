/**
 * I-READY: when a hosted child counts as ready (README "Ready": its base services are mounted, its
 * appReady has fired and its web server listens with the admission route registered), and the
 * child web origin rule (loopbackOrigin JSDoc: exactly `http://127.0.0.1:<port>`, root slash allowed).
 *
 * Techniques: EP over unsafe origins, BVA over the port, the full 2^5 decision table of the child's
 * readiness signals, state transitions of a stopping child, EP over missing services/capabilities on
 * both sides (child gate, host health rule).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { READY } from './constants.mjs'
import { childOf, constantsOf, hostOf, servicesCtx } from './subject.mjs'

/** What a ready child must report beside its origin: the base services, admission and lifecycle. */
const expectedCapabilities = (RUNTIME) => [...RUNTIME.requiredServices, ...Object.values(RUNTIME.capabilities)].sort()

eachSdk((sdk) => {
  for (const [name, value] of READY.invalidOrigins) {
    caseTest(sdk, 'IREADY-EP-01', name, 'unsafe origin is fatal', async () => {
      const { loopbackOrigin } = await constantsOf(sdk)
      assert.throws(() => loopbackOrigin(value), { code: READY.unsafe })
    })
  }
  for (const value of READY.validOrigins) {
    caseTest(sdk, 'IREADY-BVA-01', value, 'explicit loopback port boundaries and root slash accepted', async () => {
      const { loopbackOrigin } = await constantsOf(sdk)
      // The origin, without a trailing slash (JSDoc @returns).
      assert.equal(loopbackOrigin(value), value.replace(/\/$/, ''))
    })
  }

  // ---------------------------------------------------------------- the child's readiness signals: 2^5 rules
  for (let bits = 0; bits < 32; bits += 1) {
    const services = Boolean(bits & 1), appReady = Boolean(bits & 2), published = Boolean(bits & 4), listening = Boolean(bits & 8), stopped = Boolean(bits & 16)
    caseTest(sdk, 'IREADY-DT-01', bits, `services=${services}, appReady=${appReady}, published=${published}, listening=${listening}, stopped=${stopped}`, async () => {
      const { RUNTIME } = await constantsOf(sdk)
      const { childReadiness } = await childOf(sdk)
      const ctx = servicesCtx(services ? [] : [RUNTIME.requiredServices[0]])
      // The published origin reader throws until the web server listens (child.js publishWeb JSDoc).
      const web = published ? () => { if (!listening) throw new Error('not listening'); return READY.origin } : undefined
      const got = childReadiness({ ctx, appReady, web, stopped })
      if (services && appReady && published && listening && !stopped) {
        assert.equal(got.origin, READY.origin)
        assert.deepEqual([...got.capabilities].sort(), expectedCapabilities(RUNTIME))
      } else assert.equal(got, null)
    })
  }
  for (const [name, origin] of READY.invalidOrigins) {
    caseTest(sdk, 'IREADY-DT-02', name, 'published but unsafe origin cannot satisfy readiness', async () => {
      const { childReadiness } = await childOf(sdk)
      assert.equal(childReadiness({ ctx: servicesCtx(), appReady: true, web: () => origin, stopped: false }), null)
    })
  }
  caseTest(sdk, 'IREADY-EP-02', 'each-base-service', 'each missing service independently fails appReady validation', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    const { requireBaseServices } = await childOf(sdk)
    for (const absent of RUNTIME.requiredServices) assert.throws(() => requireBaseServices(servicesCtx(absent)), { code: READY.missing }, absent)
    assert.doesNotThrow(() => requireBaseServices(servicesCtx()))
  })
  caseTest(sdk, 'IREADY-ST-02', 'stop', 'starting → stop → late ready signals never ready', async () => {
    const { childReadiness } = await childOf(sdk)
    const state = { ctx: servicesCtx(), appReady: false, web: undefined, stopped: false }
    assert.equal(childReadiness(state), null, 'starting')
    state.stopped = true
    state.appReady = true
    state.web = () => READY.origin
    assert.equal(childReadiness(state), null, 'stopped, then every ready signal arrived late')
  })
  caseTest(sdk, 'IREADY-EP-09', 'no-core-status', 'readiness never consults core status or performs HTTP probes', async (t) => {
    const { childReadiness } = await childOf(sdk)
    const reads = []
    const ctx = { get(name) { reads.push(name); if (READY.coreServices.includes(name)) throw new Error('core service read'); return {} } }
    const saved = globalThis.fetch
    globalThis.fetch = () => { throw new Error('readiness made an HTTP probe') }
    t.after(() => { globalThis.fetch = saved })
    assert.equal(childReadiness({ ctx, appReady: true, web: () => READY.origin, stopped: false }).origin, READY.origin)
    assert.deepEqual(reads.filter((name) => READY.coreServices.includes(name)), [])
  })

  // ---------------------------------------------------------------- the host's rule for one health answer
  caseTest(sdk, 'IREADY-EP-03', 'capabilities', 'host rejects every missing base service and missing admission independently', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    const { readyHealth } = await hostOf(sdk)
    const capabilities = expectedCapabilities(RUNTIME)
    assert.equal(readyHealth({ state: 'ready', capabilities, origin: READY.origin }), READY.origin)
    for (const absent of [...RUNTIME.requiredServices, RUNTIME.capabilities.admission]) {
      assert.throws(() => readyHealth({ state: 'ready', capabilities: capabilities.filter((c) => c !== absent), origin: READY.origin }), { code: READY.missing }, absent)
    }
    assert.throws(() => readyHealth({ state: 'starting', capabilities, origin: READY.origin }), { code: READY.notReady })
  })
  for (const [name, origin] of READY.invalidOrigins) {
    caseTest(sdk, 'IREADY-EP-04', name, 'ready health with invalid origin is UNSAFE_CHILD_ORIGIN', async () => {
      const { RUNTIME } = await constantsOf(sdk)
      const { readyHealth } = await hostOf(sdk)
      assert.throws(() => readyHealth({ state: 'ready', capabilities: expectedCapabilities(RUNTIME), origin }), { code: READY.unsafe })
      // A ready child reporting it can never recover by polling again (RUNTIME.fatalStartupCodes).
      assert.ok(RUNTIME.fatalStartupCodes.includes(READY.unsafe))
    })
  }
})
