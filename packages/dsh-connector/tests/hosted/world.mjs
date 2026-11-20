/**
 * The C-TOOLS side of the C-SUCCEED world (HOST-UC-03 E1, HOST-ST-02 row 5, PLAT-ST-01 row 7: an
 * agent's answer to an offer's old id is `expired`). C-TOOLS' one `create*Tools(ports)` factory is
 * mounted on C-HTTP's real endpoint over the succession world's REAL pair store, mailbox and routing,
 * and an MCP client of the SDK under test talks to it, as packages/dsh-connector/tests/mcp-tools does.
 *
 * The domain port (dev session, 2026-11-16): an answer's `expired` check reads only
 * `managed.managerOf(sessionId)`, `domain.sessions.rootOf(sessionId)` (synchronous, a string) when
 * nobody manages the id, and `domain.interactions.liveOffers(rootSessionId)`, which is bound to
 * `routing.liveOffers`. Session ids here are root ids, so `rootOf` is the identity. Any other domain
 * member is a tripwire: it throws and is recorded, so a row whose oracle is "refused before the
 * domain answered it" sees the domain was not asked to answer.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { INSTANCE, REPO } from '../../../../test/support/constants.mjs'
import { importInstance } from '../../../../test/private-skills/support/sdk.mjs'
import { FakeFailures, FakeVerifier, fakeOriginOf, sdkClient } from '../mcp-http/subject.mjs'
import { PROTOCOL, RESOURCE, SCOPE, SUBJECT as TOOLS, oauthUrls } from '../mcp-tools/constants.mjs'
import { FIXTURE } from './constants.mjs'

const load = async (sdk, file) => {
  assert.ok(fs.existsSync(file), `${path.relative(REPO, file)} does not exist`)
  return importInstance(sdk, path.relative(INSTANCE.dir, file))
}

/** A domain port whose only live members are the two the expired check reads; every other call is recorded and throws. */
function domainPort(w, calls) {
  const live = { sessions: { rootOf: (sessionId) => sessionId }, interactions: { liveOffers: (sessionId) => w.routing.liveOffers(sessionId) } }
  const trip = (trail) => new Proxy(function domainMember() {}, {
    get(_, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined
      const next = [...trail, prop]
      const known = next.reduce((o, k) => (o === undefined ? undefined : o[k]), live)
      return known !== undefined ? known : trip(next)
    },
    apply() {
      calls.push(trail.join('.'))
      throw new Error(`harness: the domain port ${trail.join('.')} was reached`)
    },
  })
  return trip([])
}

/** `resources/read dsh-agent://events`, faked as the C-TOOLS world fakes it (not a C-SUCCEED concern). */
const readEvents = async () => ({ contents: [{ uri: RESOURCE.events.uri, mimeType: RESOURCE.events.mimeType, text: JSON.stringify([]) }] })

/**
 * Mounts the tools over succession world `w` for `t`. Returns `{domainCalls, connect(entryKey)}`:
 * `connect` authenticates as that entry's current pair (full power) and returns a connected client.
 */
export async function toolsOver(t, sdk, w) {
  const [tools, httpMod] = await Promise.all([load(sdk, TOOLS.entry), load(sdk, TOOLS.httpEntry)])
  const factories = Object.keys(tools).filter((n) => typeof tools[n] === 'function' && TOOLS.factory.test(n))
  assert.equal(factories.length, 1, `the C-TOOLS entry should export exactly one factory matching ${TOOLS.factory}; found ${JSON.stringify(factories)}`)
  const domainCalls = []
  const made = tools[factories[0]]({ pairs: w.pairs, mailbox: w.realMailbox, managed: w.managed, domain: domainPort(w, domainCalls), now: w.clock.now, logger: w.logger })
  const populate = typeof made === 'function' ? made : made?.populate
  assert.equal(typeof populate, 'function', 'the C-TOOLS factory returned no populate(server, caller)')

  const gate = httpMod[TOOLS.gateFactory]({ host: FIXTURE.loopback, secure: false, trustedHosts: [], approvalPort: () => 0, now: w.clock.now }, { originOf: fakeOriginOf, logger: w.logger })
  const verifier = new FakeVerifier()
  const route = await httpMod[TOOLS.endpointFactory]({
    gate, verifier, failures: new FakeFailures(), pairs: w.pairs, originOf: fakeOriginOf, secure: false, readEvents, populate, now: w.clock.now, logger: w.logger,
  })
  const mcpPath = new URL(oauthUrls(FIXTURE.urlBase).resource).pathname
  const server = http.createServer((req, res) => {
    if (new URL(req.url, FIXTURE.urlBase).pathname === mcpPath) return route.handler(req, res)
    res.statusCode = 404
    res.end()
  })
  await new Promise((resolve) => server.listen(0, FIXTURE.loopback, resolve))
  const audience = oauthUrls(`http://${FIXTURE.loopback}:${server.address().port}`).resource
  const clients = []
  t.after(async () => {
    await Promise.allSettled(clients.map((c) => c.close()))
    await route.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  return {
    domainCalls,
    async connect(entryKey) {
      const pair = w.pairs.pairOf(entryKey)
      assert.ok(pair, 'harness: the entry has no pair to authenticate as')
      const token = FIXTURE.accessToken(pair.id)
      verifier.issue(token, Object.freeze({
        entryKey, clientId: pair.id, principalKey: pair.principalKey, scope: SCOPE.full, audience, generation: w.registry.get(entryKey).generation,
      }))
      const { Client, StreamableHTTPClientTransport } = await sdkClient(sdk)
      const client = new Client(FIXTURE.clientInfo, { capabilities: {}, versionNegotiation: { mode: { pin: PROTOCOL.version } } })
      await client.connect(new StreamableHTTPClientTransport(new URL(audience), { authProvider: { token: async () => token } }))
      clients.push(client)
      return client
    },
  }
}
