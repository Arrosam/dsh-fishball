/** I-READY: requirements-only EP/BVA, full 2^5 decision table and state transitions.
 * Pure public seams run in-process. Snapshot/process-dependent system rows stay named skips.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { READY } from './constants.mjs'
import { registerInitialSyncCases } from './initial-sync-cases.mjs'
import { once } from 'node:events'
import { at, constantsOf, childOf, hostOf, sourceFiles, wirePair } from './subject.mjs'

export function registerReadyCases(sdk) {
  registerInitialSyncCases(sdk)
  const row = (id, part, title, fn) => caseTest(sdk, id, part, title, fn)
  for (const [name, value] of READY.invalidOrigins) row('IREADY-EP-01', name, 'unsafe origin is fatal', async () => {
    const { loopbackOrigin } = await constantsOf(sdk)
    assert.throws(() => loopbackOrigin(value), { code: READY.unsafe })
  })
  for (const value of READY.validOrigins) row('IREADY-BVA-01', value, 'explicit loopback port boundaries and root slash accepted', async () => {
    const { loopbackOrigin } = await constantsOf(sdk)
    assert.equal(loopbackOrigin(value), new URL(value).origin)
  })
  for (let bits = 0; bits < 32; bits += 1) {
    const present = Boolean(bits & 1), appReady = Boolean(bits & 2), published = Boolean(bits & 4), listening = Boolean(bits & 8), stopped = Boolean(bits & 16)
    row('IREADY-DT-01', bits, `services=${present}, appReady=${appReady}, published=${published}, listening=${listening}, stopped=${stopped}`, async () => {
      const { RUNTIME } = await constantsOf(sdk)
      const { childReadiness } = await childOf(sdk)
      const ctx = { get: (name) => present || name !== RUNTIME.requiredServices[0] ? {} : undefined }
      const web = published ? () => { if (!listening) throw new Error('not listening'); return READY.origin } : undefined
      const got = childReadiness({ ctx, appReady, web, stopped })
      if (present && appReady && published && listening && !stopped) {
        assert.equal(got.origin, READY.origin)
        assert.deepEqual([...got.capabilities].sort(), [...RUNTIME.requiredServices, ...Object.values(RUNTIME.capabilities)].sort())
      } else assert.equal(got, null)
    })
  }
  for (const [name, origin] of READY.invalidOrigins) row('IREADY-DT-02', name, 'published but unsafe origin cannot satisfy readiness', async () => {
    const { childReadiness } = await childOf(sdk)
    assert.equal(childReadiness({ ctx: { get: () => ({}) }, appReady: true, web: () => origin, stopped: false }), null)
  })
  row('IREADY-EP-02', 'each-base-service', 'each missing service independently fails appReady validation', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    const { requireBaseServices } = await childOf(sdk)
    for (const absent of RUNTIME.requiredServices) assert.throws(() => requireBaseServices({ get: (name) => name === absent ? undefined : {} }), { code: READY.missing }, absent)
    assert.doesNotThrow(() => requireBaseServices({ get: () => ({}) }))
  })
  row('IREADY-ST-01', 'withdraw', 'starting → ready → withdrawn publication → starting', async () => {
    const { childReadiness } = await childOf(sdk)
    const input = { ctx: { get: () => ({}) }, appReady: false, web: () => READY.origin, stopped: false }
    assert.equal(childReadiness(input), null)
    input.appReady = true
    assert.equal(childReadiness(input).origin, READY.origin)
    input.web = undefined
    assert.equal(childReadiness(input), null)
  })
  row('IREADY-ST-02', 'stop', 'starting → stop → late ready signals never ready', async () => {
    const { childReadiness } = await childOf(sdk)
    const input = { ctx: { get: () => ({}) }, appReady: false, stopped: false }
    assert.equal(childReadiness(input), null)
    input.stopped = true; input.appReady = true; input.web = () => READY.origin
    assert.equal(childReadiness(input), null)
  })
  row('IREADY-EP-03', 'capabilities', 'host rejects every missing base service and missing admission independently', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    const { readyHealth } = await hostOf(sdk)
    const capabilities = [...RUNTIME.requiredServices, ...Object.values(RUNTIME.capabilities)]
    assert.equal(readyHealth({ state: 'ready', capabilities, origin: READY.origin }), READY.origin)
    for (const absent of [...RUNTIME.requiredServices, RUNTIME.capabilities.admission]) assert.throws(() => readyHealth({ state: 'ready', capabilities: capabilities.filter((c) => c !== absent), origin: READY.origin }), { code: READY.missing }, absent)
    assert.throws(() => readyHealth({ state: 'starting', capabilities, origin: READY.origin }), { code: READY.notReady })
  })
  for (const [name, origin] of READY.invalidOrigins) row('IREADY-EP-04', name, 'ready health with invalid origin is UNSAFE_CHILD_ORIGIN', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    const { readyHealth } = await hostOf(sdk)
    assert.throws(() => readyHealth({ state: 'ready', capabilities: [...RUNTIME.requiredServices, ...Object.values(RUNTIME.capabilities)], origin }), { code: READY.unsafe })
    assert.ok(RUNTIME.fatalStartupCodes.includes(READY.unsafe))
  })
  row('IREADY-EP-05', 'package', 'no removed modules, connector peer or native-web package entry', () => {
    const manifest = JSON.parse(fs.readFileSync(at('package.json'), 'utf8'))
    assert.equal(manifest.peerDependencies?.['dsh-agent-connector'], undefined)
    assert.equal(manifest.files.includes('native-web.js'), false)
    for (const file of READY.absent) assert.equal(fs.existsSync(at(file)), false, file)
  })
  row('IREADY-EP-06', 'imports', 'production code contains no V2 readiness probe or connector import', () => {
    for (const file of sourceFiles()) {
      const text = fs.readFileSync(file, 'utf8')
      for (const forbidden of READY.forbiddenText) assert.equal(text.includes(forbidden), false, `${file}: ${forbidden}`)
      assert.doesNotMatch(text, /(?:from\s*|import\s*\(|require\s*\()\s*['"](?:dsh-agent-connector|dsh-connector)(?:\/[^'"]*)?['"]/, file)
    }
  })
  row('IREADY-EP-07', 'host', 'host has no migration, storageDomain injection or removed native routes', () => {
    const text = fs.readFileSync(at('host.js'), 'utf8')
    for (const forbidden of ['storageDomain', 'settings-migration', '/api/fishball/native/status', '/api/fishball/native/admin/']) assert.equal(text.includes(forbidden), false, forbidden)
  })
  row('IREADY-EP-09', 'no-core-status', 'readiness never consults core status or performs HTTP probes', async () => {
    const { childReadiness } = await childOf(sdk)
    const reads = []
    const ctx = { get(name) {
      reads.push(name)
      if (['fishballStatus', 'fishballInstance'].includes(name)) throw new Error('forbidden core service read')
      return {}
    } }
    const saved = globalThis.fetch
    globalThis.fetch = () => { throw new Error('readiness made an HTTP probe') }
    try {
      assert.equal(childReadiness({ ctx, appReady: true, web: () => READY.origin, stopped: false }).origin, READY.origin)
    } finally { globalThis.fetch = saved }
    assert.equal(reads.includes('fishballStatus') || reads.includes('fishballInstance'), false)
  })
  row('IREADY-EP-08', 'snapshot', 'lifecycle snapshot excludes native-web', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    assert.equal(JSON.stringify(RUNTIME.snapshot).includes('native-web.js'), false)
  })
  for (const channel of ['control', 'admin', 'instance-settings', 'unknown']) row('IREADY-WIRE-01', channel, 'removed payload channel closes authenticated connection', async (t) => {
    const { sender, receiver } = await wirePair(t, sdk)
    const closed = once(receiver, 'closed', { signal: AbortSignal.timeout(3000) })
    sender.send({ channel, payload: 'sentinel' })
    await closed
    assert.equal(receiver.closed, true)
  })
  for (const [channel, transport] of [['provider-sync', 'providerSyncTransport'], ['mcp-credential', 'credentialTransport']]) row('IREADY-WIRE-02', channel, 'retained transport receives payload without closing', async (t) => {
    const { sender, receiver } = await wirePair(t, sdk)
    const message = new Promise((resolve) => receiver[transport]().onMessage(resolve))
    sender.send({ channel, payload: 'sentinel' })
    assert.equal(await Promise.race([message, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('wire message timeout')), 3000)
      timer.unref()
    })]), 'sentinel')
    assert.equal(receiver.closed, false)
  })
  for (const [part, title] of [
    ['operations', 'removed native-access/control operations return lifecycle error; attach publishes retained transports'],
    ['fatal', 'missing base service at appReady logs CHILD_FAILED and exits 1'],
    ['publish-dispose', 'nativeRuntime.publishWeb dispose withdraws lifecycle health readiness'],
    ['stop', 'real lifecycle stop never returns ready on late publication'],
    ['origin', 'attached generation childOrigin is the authenticated health origin'],
  ]) test(caseName(sdk, 'IREADY-SYSTEM', part, title), { skip: READY.hostedSkip }, () => {})
}
