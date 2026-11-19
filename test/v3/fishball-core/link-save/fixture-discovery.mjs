import assert from 'node:assert/strict'
import { tracingChannel } from 'node:diagnostics_channel'
import { get } from 'node:http'
import { text } from 'node:stream/consumers'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE, HARNESS, K1, MCP, REDIRECT } from './constants.mjs'
import { startFakeConnector } from './fakes.mjs'

const routes = [
  { host: FIXTURE.host.first, address: '::1', family: 6 },
  { host: FIXTURE.host.other, address: '127.0.0.1', family: 4 },
]

export function registerFixtureDiscoveryCase(sdk) {
  caseTest(sdk, 'FLS-FIXTURE', 1, 'discovery reaches the fake on both names without a wildcard listener', async (t) => {
    // Observe only this fixture's startup, including any candidate listeners later closed on retry.
    const channel = tracingChannel('net.server.listen').asyncEnd
    const binds = []
    const observe = ({ server }) => {
      const bind = server.address()
      if (bind) binds.push({ server, bind })
    }
    channel.subscribe(observe)
    let fake
    try { fake = await startFakeConnector() } finally { channel.unsubscribe(observe) }
    t.after(() => fake.stop())

    for (const { bind } of binds) assert.ok(routes.some((r) => r.address === bind.address), `non-loopback fixture listener: ${bind.address}`)
    for (const { host, address, family } of routes) {
      const target = new URL(fake.url(host))
      assert.equal(target.hostname, host)
      assert.equal(target.port, String(fake.port))
      assert.ok(binds.some(({ server }) => {
        const active = server.address()
        return active?.address === address && active.port === fake.port
      }), `fixture does not own ${address} on its advertised port`)
      // Pin localhost to its IPv6 loopback: no DNS ordering, fallback to IPv4, or contact with another service.
      const discovery = new URL(MCP.paths.protectedResourcePrefix + MCP.paths.mcp, target)
      const response = await new Promise((resolve, reject) => get(discovery, {
        agent: false, family, signal: AbortSignal.timeout(HARNESS.settleMs),
        lookup: (_name, _options, done) => done(null, address, family),
      }, resolve).on('error', reject))
      const body = await text(response)
      assert.equal(response.statusCode, K1.HTTP_STATUS.ok)
      assert.equal(JSON.parse(body).resource, target.href)
    }
    assert.equal(fake.stepRequests(REDIRECT.step.protectedResource).length, routes.length)
  })
}
