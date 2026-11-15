import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from '../package-boundaries/cases.mjs'
import { REPO } from '../../../support/constants.mjs'
import * as oracle from '../../../../packages/dsh-connector/mcp-schema/index.js'
import { MCP, LINK } from '../../../../packages/core/contracts/constants.js'
import { linkModule } from '../../fishball-core/link/link-driver.mjs'
import { identityModule } from '../../fishball-core/identity/subject.mjs'
import { bridgeExport, makeBridge } from '../../fishball-core/bridge/subject.mjs'
import { FakeLink } from '../../fishball-core/bridge/fakes.mjs'
import { toolsWorld } from '../../dsh-connector/mcp-tools/subject.mjs'
import { oauthWorld } from '../../dsh-connector/oauth/subject.mjs'
import { OWN } from './constants.mjs'

const sorted = (xs) => [...xs].sort()
import { assertNoGeneratedSchema } from './absence.mjs'
const files = (root) => fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && OWN.source.test(e.name) && !path.relative(root, e.parentPath).split(path.sep).some((part) => ['node_modules', 'test', 'vendor'].includes(part))).map((e) => path.join(e.parentPath, e.name))
async function runtime(t, create) {
  try { return await create() } catch (error) {
    // Only dependency-resolution failures are environmental; assertions and route errors remain failures.
    if (!OWN.missingRuntime.test(String(error))) throw error
    t.skip(`Installed per-SDK connector runtime cannot resolve in this worktree: ${error.message}`)
  }
}
export function registerOwnSchemaCases(sdk) {
  caseTest(sdk, 'OWN-ARCH', 'absence', 'F-OWN-SCHEMA removes generated schema, generator, export and packed vendor entry', assertNoGeneratedSchema)
  caseTest(sdk, 'OWN-ARCH', 'imports', 'Fishball-side sources have no DSH-side or cross-package relative imports except V2 contract', () => {
    const bad = []
    for (const pkg of OWN.packages) {
      const root = path.join(REPO, 'packages', pkg)
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const name of Object.keys(manifest[section] ?? {})) {
          if (OWN.dsh.test(name) && !(pkg === 'core' && section === 'peerDependencies' && name === 'dsh-connector')) bad.push(`${pkg} ${section}: ${name}`)
        }
      }
      for (const file of files(root)) {
        const relative = path.relative(root, file).split(path.sep).join('/')
        if (pkg === 'core' && relative.startsWith('scripts/')) {
          assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /dsh-connector|packages[/'"\s,+]*connector/, 'a core generator still reads the connector')
        }
        for (const [, spec] of fs.readFileSync(file, 'utf8').matchAll(OWN.imports)) {
          const v2 = pkg === 'core' && OWN.v2.test(relative)
          if (OWN.dsh.test(spec) && !(v2 && spec === OWN.contract)) bad.push(`${pkg}/${relative}: ${spec}`)
          if (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(root + path.sep)) bad.push(`${pkg}/${relative}: ${spec}`)
        }
      }
    }
    assert.deepEqual(bad, [])
  })
  caseTest(sdk, 'OWN-ARCH', 'peer', 'REMOVE-V2 removes retained dsh-connector peer and V2 contract imports', null, 'REMOVE-V2 (user decision 2026-11-16: retain peer and V2 contract imports until removal)')
  for (const origin of OWN.targets) caseTest(sdk, 'OWN-LINK', origin, 'issuer follows connector oauthUrls and link uses own MCP/LINK', async () => {
    const m = await linkModule(sdk)
    assert.equal(m.checkTarget(origin + MCP.paths.mcp).issuer, oracle.oauthUrls(origin).issuer)
    assert.equal(m.LINK_MCP.versionPin, oracle.PROTOCOL.version)
    assert.equal(m.LINK_MCP.eventsUri, oracle.RESOURCE.events.uri)
    assert.deepEqual(m.STATUS.connected, { state: LINK.state.connected, code: null })
    assert.deepEqual(m.STATUS.revoked, { state: LINK.state.refused, code: LINK.code.revoked })
  })
  for (const id of OWN.ids) caseTest(sdk, 'OWN-ID', JSON.stringify(id), 'BVA/EP acceptId verdict equals isAgentId', async () => {
    assert.equal((await identityModule(sdk)).acceptId(id, OWN.fixture.id).ok, oracle.isAgentId(id))
  })
  // OWN-NAME uses pairing's observable rename path in the existing identity suite;
  // sameName is private, so this test never invents an implementation export.
  for (const name of [...oracle.TOOL_NAMES, ...OWN.tools]) caseTest(sdk, 'OWN-TOOLS', name, 'DT core classification, withholding and X19 operation names', async () => {
    const offerOf = await bridgeExport(sdk, 'offerOf')
    const modelNameOf = await bridgeExport(sdk, 'modelNameOf')
    const result = offerOf([{ name, inputSchema: OWN.fixture.schema }])
    const offer = result.offered.find((x) => x.name === name)
    if (OWN.withheld.includes(name)) {
      assert.equal(offer, undefined)
      assert.deepEqual(result.refused, [])
    } else if (oracle.TOOL_NAMES.includes(name) || name.includes('.')) {
      assert.ok(offer)
      assert.equal(offer.contributed, !oracle.TOOL_NAMES.includes(name))
      assert.equal(modelNameOf(name), name.replaceAll('.', '__'))
    } else assert.equal(offer, undefined)
    const facade = await bridgeExport(sdk, 'FACADE')
    assert.deepEqual(facade.sendOperations, OWN.send)
    assert.deepEqual(sorted(facade.withheld), sorted(OWN.withheld))
  })
  for (const type of [...Object.values(oracle.EVENT_TYPE), ...OWN.events]) caseTest(sdk, 'OWN-EVENT', String(type), 'EP/BVA event header names exactly accepted event types', async (t) => {
    const bridge = await makeBridge(sdk, { ctx: { tools: { register: () => () => {} } }, link: new FakeLink({ tools: [] }) })
    t.after(() => bridge.close())
    const blocks = await bridge.present({ ...OWN.fixture, type })
    const header = blocks[0].text.split('\n')[0]
    if (oracle.isEventType(type)) { assert.ok(header.includes(type)); assert.doesNotMatch(header, OWN.unknown) }
    else assert.match(header, OWN.unknown)
  })
  caseTest(sdk, 'OWN-HTTP', 'tools and resource', 'real connector tools/list and resources/list agree with core MCP', async (t) => {
    const w = await runtime(t, () => toolsWorld(t, sdk))
    if (!w) return
    const { token } = await w.full(OWN.fixture.id)
    const client = await w.connect(token)
    const listed = await client.listTools()
    assert.deepEqual(sorted(listed.tools.map((x) => x.name).filter((x) => !x.includes('.'))), sorted(Object.values(MCP.tools)))
    const resources = await client.listResources()
    const event = resources.resources.find((x) => x.uri === MCP.events.uri)
    assert.ok(event)
    for (const key of Object.keys(MCP.events)) assert.equal(event[key], MCP.events[key])
  })
  const rows = [
    ['resource', false, (d, w) => assert.equal(d.resource, w.origin() + MCP.paths.mcp)],
    ['authorization_servers', false, (d, w) => assert.equal(d.authorization_servers[0], w.origin() + MCP.paths.issuer)],
    ['scopes_supported', false, (d) => assert.ok(d.scopes_supported.includes(MCP.scope.full))],
    ['issuer', true, (d, w) => assert.equal(d.issuer, w.origin() + MCP.paths.issuer)],
    ['token_endpoint', true, (d, w) => assert.equal(d.token_endpoint, w.origin() + MCP.paths.token)],
    ['authorization_endpoint', true, (d) => assert.equal(new URL(d.authorization_endpoint).pathname, MCP.paths.authorize)],
    ['scopes_supported', true, (d) => assert.deepEqual(sorted(d.scopes_supported), sorted(Object.values(MCP.scope)))],
    ['grant_types_supported', true, (d) => assert.deepEqual(sorted(d.grant_types_supported), sorted(Object.values(MCP.oauth.grant)))],
    ['token_endpoint_auth_methods_supported', true, (d) => { for (const v of Object.values(MCP.oauth.clientAuth)) assert.ok(d.token_endpoint_auth_methods_supported.includes(v)) }],
    ['response_types_supported', true, (d) => assert.ok(d.response_types_supported.includes(MCP.oauth.responseType))],
    ['code_challenge_methods_supported', true, (d) => assert.ok(d.code_challenge_methods_supported.includes(MCP.oauth.pkceMethod))],
  ]
  for (const [field, server, check] of rows) caseTest(sdk, 'OWN-META', `${server ? 'AS' : 'PRM'} ${field}`, 'DT real HTTP document field agrees with core MCP', async (t) => {
    const w = await runtime(t, () => oauthWorld(t, sdk))
    if (!w) return
    const target = server ? MCP.paths.authorizationServerPrefix + MCP.paths.issuer : MCP.paths.protectedResourcePrefix + MCP.paths.mcp
    const response = await w.send({ method: OWN.method, path: target, host: w.hostHeader() })
    assert.equal(response.status, OWN.ok)
    check(response.body, w)
  })
}
