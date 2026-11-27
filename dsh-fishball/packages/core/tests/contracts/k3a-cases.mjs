/**
 * K3a black-box cases: what core needs from the DSH side, frozen as core's own copy of the MCP
 * surface and as DSH state under published names (design `design/v3` 9a531192 §1.0b row 1 / decided
 * D1, §1.0c, §6.3a; requirements 1.38–1.41: R-ARCH-10, R-HOST-05 as amended by Q-G6 = A, R12 = B,
 * R-FB-14, Q-G1, Q-G2 = A; the user's decisions 2026-11-16).
 *
 * Case ids (this suite's own; each test names its row and partition):
 * - K3a-ARCH (R-ARCH-10): core contracts reference nothing of the DSH side. EP over specifiers.
 * - K3a-MCP (D1): core's copy equals the connector's published `tools/list` and values. EP per
 *   constant group; BVA on the copied grammars (the copy's verdict equals the connector's).
 * - K3a-META (D1): core's paths, scopes and OAuth values agree with the metadata documents the
 *   connector publishes for a sample loopback origin. Decision table: one row per document field.
 * - K3a-NAMES (§1.0c): the neutral names.
 * - K3a-LINK: LINK equals the connector's TARGET_STATE / TARGET_CODE / LINK_REFUSAL / HOSTS / HTTP_STATUS.
 * - K3a-HOST (R-HOST-05, Q-G6 = A): the published reference, setting and record, checked against
 *   both SDKs' own credentials library (EP valid / invalid spelling, BVA at the refused spelling)
 *   and against core's guarded rows.
 * - K3a-CONNECT (§6.3a, R12 = B): states, setting, configuration codes, callbacks, begin outcomes
 *   (decision table), the OAuth client and the part fishball-ui sees.
 * - K3a-UI (R-FB-14, Q-G1, Q-G2): the `fishballInstance.ui` seam.
 * - K3a-DECL: each declared literal union equals its constants object (type and value do not drift).
 *
 * Level: unit. Core's constants are imported at runtime only; declarations are read with the K3
 * reader; the connector's published modules (vendored K1 / K2) and the current DSH's credentials
 * library are imported (no DSH is booted). The old `todo` rows naming F-LINK-SAVE, I-HOST, F-WIRE
 * and the F-UI suite are not ported: their behaviour is the link-save / wire areas' own rows, the
 * instance's (another repository) or fishball-ui's (another package).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { assertNoGeneratedSchema } from './absence.mjs'
import { assertParams, member, needDeclarations, serviceMembers } from './contracts.mjs'
import {
  CONNECT_EXPECTED, CREDENTIALS, DSH_SIDE, EXPORTS, GRAMMAR_SAMPLES, HOSTED, HOSTED_FIELDS as F, MCP_SHAPE, MOVED_EXPORT, NEUTRAL, OAUTH_CLIENT, SAMPLE, TYPE_TEXT,
  TYPES, UI,
} from './k3a-constants.mjs'
import {
  connector, core, coreConstants, credentials, credentialTypes, dshSideReferences, functionType, guardedRows, isDshSide, literalMember,
  literalUnion, membersOf, pathOf, reachableNames, uiSeam, unfrozen,
} from './surface.mjs'

export const pick = (object, keys) => Object.fromEntries(keys.map((k) => [k, object[k]]))
const sorted = (values) => [...values].sort()
export const sameSet = (actual, expected, what) => assert.deepEqual(sorted(actual), sorted(expected), what)
/** Both sides at once: core's constants module and the connector's published values. */
export const both = async () => ({ c: await coreConstants(), pub: await connector() })
/** A case over the current DSH's credentials library. */
export function sdkCase(id, row, title, fn) {
  caseTest(id, row, title, async (t) => fn(await credentials(), t))
}
/** A regular expression of the connector agrees with core's copy (source and flags) and with its verdicts. */
function assertSameGrammar(copy, flags, published, samples) {
  assert.equal(copy, published.source, 'pattern source')
  assert.equal(flags, published.flags, 'pattern flags')
  const mine = new RegExp(copy, flags)
  assert.deepEqual(samples.map(([label, s]) => [label, mine.test(s)]), samples.map(([label, s]) => [label, published.test(s)]), 'verdicts')
}

export function registerK3aCases() {
  // F-OWN-SCHEMA: core carries no generated copy of the connector's schema.
  caseTest('K3a-MCP', 'own schema', 'core no longer carries a generated connector copy (F-OWN-SCHEMA)', assertNoGeneratedSchema)
  // ================================================================ R-ARCH-10: no code dependency on the DSH side
  for (const [specifier, dshSide] of DSH_SIDE.samples) {
    caseTest('K3a-ARCH', 'self-check', `specifier ${JSON.stringify(specifier)} → ${dshSide ? 'DSH side' : 'not DSH side'}`, () => {
      assert.equal(isDshSide(specifier), dshSide)
    })
  }
  caseTest('K3a-ARCH', 1, 'core contracts (every .d.ts and constants.js) import or reference no DSH-side package, by name or by relative path', () => {
    assert.deepEqual(dshSideReferences(), [])
  })

  // ================================================================ the new objects are deeply frozen data
  for (const name of EXPORTS) {
    caseTest('K3a-MCP', 'frozen', `${name} is exported and deeply frozen, with no function anywhere`, async () => {
      const c = await coreConstants()
      assert.ok(Object.hasOwn(c, name), `constants.js does not export ${name}; it exports ${Object.keys(c).join(', ')}`)
      assert.deepEqual(unfrozen(c[name], name), [])
    })
  }

  // ================================================================ D1: core's copy equals the connector's published surface
  caseTest('K3a-MCP', 'protocol', 'protocolVersion and clientCredentialsExtension equal PROTOCOL.version / .clientCredentialsExtension', async () => {
    const { c, pub } = await both()
    assert.equal(c.MCP.protocolVersion, pub.PROTOCOL.version)
    assert.equal(c.MCP.clientCredentialsExtension, pub.PROTOCOL.clientCredentialsExtension)
  })
  caseTest('K3a-MCP', 'paths', 'paths hold exactly mcp, issuer, token, the two well-known prefixes and authorize, each equal to PATHS', async () => {
    const { c, pub } = await both()
    sameSet(Object.keys(c.MCP.paths), MCP_SHAPE.paths, 'MCP.paths keys')
    assert.deepEqual(c.MCP.paths, pick(pub.PATHS, MCP_SHAPE.paths))
  })
  caseTest('K3a-MCP', 'events', 'events {name, uri, mimeType} equal RESOURCE.events', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.events, pick(pub.RESOURCE.events, MCP_SHAPE.events))
  })
  caseTest('K3a-MCP', 'scope', 'scope {full, pair} equals SCOPE', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.scope, pick(pub.SCOPE, MCP_SHAPE.scope))
  })
  caseTest('K3a-MCP', 'tools', 'tools hold every tool tools/list returns: no more, no fewer, no duplicate', async () => {
    const { c, pub } = await both()
    const values = Object.values(c.MCP.tools)
    assert.equal(new Set(values).size, values.length, 'a duplicated tool name')
    sameSet(values, pub.TOOLS.map((t) => t.name), 'MCP.tools vs tools/list')
    sameSet(values, pub.TOOL_NAMES, 'MCP.tools vs TOOL_NAMES')
  })
  caseTest('K3a-MCP', 'tools', 'tools have the same keys as K1 TOOL, each with TOOL\'s value', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.tools, { ...pub.TOOL })
  })
  caseTest('K3a-MCP', 'eventTypes', 'eventTypes have the same keys and values as K1 EVENT_TYPE', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.eventTypes, { ...pub.EVENT_TYPE })
  })
  caseTest('K3a-MCP', 'eventTypes', 'contributedTypePrefix equals CONTRIBUTED_TYPE_PREFIX', async () => {
    const { c, pub } = await both()
    assert.equal(c.MCP.contributedTypePrefix, pub.CONTRIBUTED_TYPE_PREFIX)
  })
  caseTest('K3a-MCP', 'refusal', 'refusal holds exactly the twelve relayed codes, each equal to REFUSAL (idInvalid: ID_REFUSAL)', async () => {
    const { c, pub } = await both()
    sameSet(Object.keys(c.MCP.refusal), Object.keys(MCP_SHAPE.refusal), 'MCP.refusal keys')
    assert.deepEqual(c.MCP.refusal, Object.fromEntries(Object.entries(MCP_SHAPE.refusal).map(([k, [from, key]]) => [k, pub[from][key]])))
  })
  caseTest('K3a-MCP', 'oauth', 'oauth.grant equals GRANT (client_credentials, authorization_code, refresh_token)', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.oauth.grant, { ...pub.GRANT })
  })
  caseTest('K3a-MCP', 'oauth', 'oauth.clientAuth {basic, none} equals CLIENT_AUTH', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.oauth.clientAuth, pick(pub.CLIENT_AUTH, MCP_SHAPE.clientAuth))
  })
  caseTest('K3a-MCP', 'oauth', 'oauth.responseType equals RESPONSE_TYPE.code; oauth.pkceMethod equals PKCE.method', async () => {
    const { c, pub } = await both()
    assert.equal(c.MCP.oauth.responseType, pub.RESPONSE_TYPE.code)
    assert.equal(c.MCP.oauth.pkceMethod, pub.PKCE.method)
  })
  caseTest('K3a-MCP', 'oauth', 'oauth.error {invalidClient, invalidGrant, accessDenied} equals OAUTH_ERROR', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.MCP.oauth.error, pick(pub.OAUTH_ERROR, MCP_SHAPE.oauthError))
  })
  caseTest('K3a-MCP', 'oauth', `oauth.agentIdParameter is design §1.0c's ${NEUTRAL.agentIdParameter}`, async () => {
    assert.equal((await coreConstants()).MCP.oauth.agentIdParameter, NEUTRAL.agentIdParameter)
  })
  // Was a todo naming C-PAGE-ID: K1d now publishes the parameter as AUTHORIZE_EXTENSION.agentIdParam.
  caseTest('K3a-MCP', 'oauth', 'oauth.agentIdParameter equals the connector\'s published authorization parameter (AUTHORIZE_EXTENSION.agentIdParam)', async () => {
    const { c, pub } = await both()
    assert.equal(c.MCP.oauth.agentIdParameter, pub.AUTHORIZE_EXTENSION?.agentIdParam)
  })

  caseTest('K3a-MCP', 'id', 'id.pattern equals ID_GRAMMAR.pattern (source, no flags) and gives its verdicts at lengths 0, 1, 64, 65', async () => {
    const { c, pub } = await both()
    assertSameGrammar(c.MCP.id.pattern, TYPE_TEXT.noFlags, pub.ID_GRAMMAR.pattern, GRAMMAR_SAMPLES.id)
  })
  caseTest('K3a-MCP', 'name', 'name minChars, maxChars, space, normalForm and namelessPrefix equal NAME_RULES', async () => {
    const { c, pub } = await both()
    assert.deepEqual(pick(c.MCP.name, MCP_SHAPE.name), pick(pub.NAME_RULES, MCP_SHAPE.name))
  })
  caseTest('K3a-MCP', 'name', 'name.whitespaceRun with patternFlags equals NAME_RULES.whitespaceRun (source, flags, verdicts)', async () => {
    const { c, pub } = await both()
    assertSameGrammar(c.MCP.name.whitespaceRun, c.MCP.name.patternFlags, pub.NAME_RULES.whitespaceRun, GRAMMAR_SAMPLES.whitespaceRun)
  })
  caseTest('K3a-MCP', 'name', 'name.control with patternFlags equals NAME_RULES.control (source, flags; Cc, Cf and a letter)', async () => {
    const { c, pub } = await both()
    assertSameGrammar(c.MCP.name.control, c.MCP.name.patternFlags, pub.NAME_RULES.control, GRAMMAR_SAMPLES.control)
  })
  caseTest('K3a-MCP', 'namespace', 'namespace separator, reserved, publicMaxChars, aliases and externalName equal NAMESPACE / NAME_GRAMMAR / EXTERNAL_NAME', async () => {
    const { c, pub } = await both()
    const ns = c.MCP.namespace
    assert.equal(ns.separator, pub.NAMESPACE.separator, 'separator')
    sameSet(ns.reserved, pub.NAMESPACE.reserved, 'reserved')
    assert.equal(ns.publicMaxChars, pub.NAME_GRAMMAR.publicMaxChars, 'publicMaxChars')
    assert.deepEqual(ns.aliases, { ...pub.NAMESPACE.aliases }, 'aliases')
    assert.deepEqual(ns.externalName, { ...pub.EXTERNAL_NAME }, 'externalName')
  })
  caseTest('K3a-MCP', 'namespace', 'namespace.outside and .identifying equal NAMESPACE.outside / .identifying (source, no flags, verdicts)', async () => {
    const { c, pub } = await both()
    assertSameGrammar(c.MCP.namespace.outside, TYPE_TEXT.noFlags, pub.NAMESPACE.outside, GRAMMAR_SAMPLES.outside)
    assertSameGrammar(c.MCP.namespace.identifying, TYPE_TEXT.noFlags, pub.NAMESPACE.identifying, GRAMMAR_SAMPLES.outside)
  })
  caseTest('K3a-MCP', 'namespace', 'namespace.localName equals NAME_GRAMMAR.local (source, no flags) at lengths 1, 48, 49 and the dot rules', async () => {
    const { c, pub } = await both()
    assertSameGrammar(c.MCP.namespace.localName, TYPE_TEXT.noFlags, pub.NAME_GRAMMAR.local, GRAMMAR_SAMPLES.localName)
  })

  // ================================================================ D1: the published metadata documents (decision table, one row per field)
  const documents = async () => {
    const { c, pub } = await both()
    return {
      c: c.MCP,
      urls: pub.oauthUrls(SAMPLE.origin),
      resource: pub.protectedResourceMetadata(SAMPLE.origin),
      server: pub.authorizationServerMetadata(SAMPLE.origin, SAMPLE.approvalOrigin),
    }
  }
  caseTest('K3a-META', 'resource', 'protected-resource metadata: resource path is MCP.paths.mcp; authorization_servers[0] path is MCP.paths.issuer; scopes_supported holds MCP.scope.full', async () => {
    const { c, resource } = await documents()
    assert.equal(pathOf(resource.resource), c.paths.mcp, 'resource')
    assert.equal(pathOf(resource.authorization_servers[0]), c.paths.issuer, 'authorization_servers[0]')
    assert.ok(resource.scopes_supported.includes(c.scope.full), 'scopes_supported ' + JSON.stringify(resource.scopes_supported))
  })
  caseTest('K3a-META', 'well-known', 'the two well-known URLs are origin + prefix + MCP / issuer path, from core\'s copy', async () => {
    const { c, urls } = await documents()
    assert.equal(urls.protectedResourceMetadata, SAMPLE.origin + c.paths.protectedResourcePrefix + c.paths.mcp)
    assert.equal(urls.authorizationServerMetadata, SAMPLE.origin + c.paths.authorizationServerPrefix + c.paths.issuer)
  })
  caseTest('K3a-META', 'issuer', 'AS metadata: issuer path is MCP.paths.issuer; token_endpoint path is MCP.paths.token', async () => {
    const { c, server } = await documents()
    assert.equal(pathOf(server.issuer), c.paths.issuer, 'issuer')
    assert.equal(pathOf(server.token_endpoint), c.paths.token, 'token_endpoint')
  })
  caseTest('K3a-META', 'authorize', 'AS metadata: authorization_endpoint is the approval origin + MCP.paths.authorize', async () => {
    const { c, server } = await documents()
    assert.equal(server.authorization_endpoint, SAMPLE.approvalOrigin + c.paths.authorize)
  })
  caseTest('K3a-META', 'scopes', 'AS metadata: scopes_supported is exactly MCP.scope\'s values', async () => {
    const { c, server } = await documents()
    sameSet(server.scopes_supported, Object.values(c.scope), 'scopes_supported')
  })
  caseTest('K3a-META', 'grants', 'AS metadata: grant_types_supported is exactly MCP.oauth.grant\'s values', async () => {
    const { c, server } = await documents()
    sameSet(server.grant_types_supported, Object.values(c.oauth.grant), 'grant_types_supported')
  })
  caseTest('K3a-META', 'response', 'AS metadata: response_types_supported holds MCP.oauth.responseType; code_challenge_methods_supported holds MCP.oauth.pkceMethod', async () => {
    const { c, server } = await documents()
    assert.ok(server.response_types_supported.includes(c.oauth.responseType), JSON.stringify(server.response_types_supported))
    assert.ok(server.code_challenge_methods_supported.includes(c.oauth.pkceMethod), JSON.stringify(server.code_challenge_methods_supported))
  })
  caseTest('K3a-META', 'auth methods', 'AS metadata: token_endpoint_auth_methods_supported holds every MCP.oauth.clientAuth value', async () => {
    const { c, server } = await documents()
    const missing = Object.values(c.oauth.clientAuth).filter((m) => !server.token_endpoint_auth_methods_supported.includes(m))
    assert.deepEqual(missing, [], 'supported: ' + JSON.stringify(server.token_endpoint_auth_methods_supported))
  })

  // ================================================================ §1.0c: neutral names
  caseTest('K3a-NAMES', 'paths', 'core\'s MCP endpoint, issuer and token paths are /api/agent/mcp, /api/agent/oauth, /api/agent/oauth/token', async () => {
    const { MCP } = await coreConstants()
    assert.deepEqual([MCP.paths.mcp, MCP.paths.issuer, MCP.paths.token], [NEUTRAL.mcp, NEUTRAL.issuer, NEUTRAL.token])
  })
  caseTest('K3a-NAMES', 'well-known', 'the well-known metadata paths are the §1.0c ones', async () => {
    const { MCP } = await coreConstants()
    assert.equal(MCP.paths.protectedResourcePrefix + MCP.paths.mcp, NEUTRAL.protectedResourceMetadata)
    assert.equal(MCP.paths.authorizationServerPrefix + MCP.paths.issuer, NEUTRAL.authorizationServerMetadata)
  })
  caseTest('K3a-NAMES', 'scope', 'scopes are agent and agent:pair', async () => {
    const { MCP } = await coreConstants()
    assert.deepEqual([MCP.scope.full, MCP.scope.pair], [NEUTRAL.scopeFull, NEUTRAL.scopePair])
  })
  caseTest('K3a-NAMES', 'events', 'the event resource is agent-events at dsh-agent://events', async () => {
    const { MCP } = await coreConstants()
    assert.deepEqual([MCP.events.name, MCP.events.uri], [NEUTRAL.eventsName, NEUTRAL.eventsUri])
  })
  caseTest('K3a-NAMES', 'old word', 'no DSH-side wire name core copies (paths, scope, events, tools, OAuth) says "fishball"', async () => {
    const { MCP } = await coreConstants()
    const wire = [MCP.paths, MCP.scope, MCP.events, MCP.tools, MCP.oauth].flatMap((o) => JSON.stringify(o).match(/"[^"]*"/g))
    assert.deepEqual(wire.filter((s) => NEUTRAL.oldWord.test(s)), [])
  })

  // ================================================================ LINK: each side its own copy of the same words
  caseTest('K3a-LINK', 'state', 'LINK.state equals TARGET_STATE', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.LINK.state, { ...pub.TARGET_STATE })
  })
  caseTest('K3a-LINK', 'code', 'LINK.code equals TARGET_CODE', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.LINK.code, { ...pub.TARGET_CODE })
  })
  caseTest('K3a-LINK', 'disconnected', 'LINK.disconnected equals LINK_REFUSAL.disconnected', async () => {
    const { c, pub } = await both()
    assert.equal(c.LINK.disconnected, pub.LINK_REFUSAL.disconnected)
  })
  caseTest('K3a-LINK', 'hosts', 'LINK.hosts: loopback names (as a set) and both schemes equal HOSTS', async () => {
    const { c, pub } = await both()
    sameSet(c.LINK.hosts.loopbackNames, pub.HOSTS.loopbackNames, 'loopbackNames')
    assert.equal(c.LINK.hosts.loopbackScheme, pub.HOSTS.loopbackScheme, 'loopbackScheme')
    assert.equal(c.LINK.hosts.remoteScheme, pub.HOSTS.remoteScheme, 'remoteScheme')
  })
  caseTest('K3a-LINK', 'httpStatus', 'LINK.httpStatus {unauthorized, forbidden, notFound} equals HTTP_STATUS', async () => {
    const { c, pub } = await both()
    assert.deepEqual(c.LINK.httpStatus, pick(pub.HTTP_STATUS, MCP_SHAPE.linkHttpStatus))
  })

  // ================================================================ K3a-DECL: declared literal unions equal the constants
  for (const [type, read] of [
    [TYPES.linkState, (c) => c.LINK.state],
    [TYPES.linkCode, (c) => c.LINK.code],
    [TYPES.connectState, (c) => c.CONNECT.state],
    [TYPES.connectConfigurationCode, (c) => c.CONNECT.configuration],
  ]) {
    caseTest('K3a-DECL', type, `the declared ${type} union equals the constants object's values`, async () => {
      needDeclarations(core())
      sameSet(literalUnion(core(), type), Object.values(read(await coreConstants())), type)
    })
  }
  caseTest('K3a-DECL', TYPES.hostedImportNames, `${TYPES.hostedImportNames} is typed with HOSTED_IMPORT's literal values`, async () => {
    const c = core()
    needDeclarations(c)
    const { HOSTED_IMPORT } = await coreConstants()
    const names = c.m.members(TYPES.hostedImportNames)
    const setting = c.m.members(member(names, F.targetSetting, { method: false }).type)
    const record = c.m.members(member(names, F.savedRecord, { method: false }).type)
    assert.deepEqual({
      [F.credentialRef]: literalMember(c, names, F.credentialRef),
      [F.targetSetting]: { [F.row]: literalMember(c, setting, F.row), [F.field]: literalMember(c, setting, F.field) },
      [F.savedRecord]: { [F.key]: literalMember(c, record, F.key), [F.kind]: literalMember(c, record, F.kind) },
    }, HOSTED_IMPORT)
  })

  // ================================================================ R-HOST-05 (Q-G6 = A): hosted import names
  caseTest('K3a-HOST', 'names', 'HOSTED_IMPORT is DSH_AGENT_TOKEN, dsh-instance-child.targetUrl and the grant record fishball-core/hosted-agent (user decisions 2026-11-16)', async () => {
    assert.deepEqual((await coreConstants()).HOSTED_IMPORT, { credentialRef: HOSTED.credentialRef, targetSetting: HOSTED.targetSetting, savedRecord: HOSTED.savedRecord })
  })
  sdkCase('K3a-HOST', 'ref valid', 'the SDK\'s reference grammar accepts the published reference: isCredentialRefName true, credentialRef returns it', async (lib) => {
    const { HOSTED_IMPORT } = await coreConstants()
    assert.equal(lib.isCredentialRefName(HOSTED_IMPORT.credentialRef), true)
    assert.equal(String(lib.credentialRef(HOSTED_IMPORT.credentialRef)), HOSTED_IMPORT.credentialRef)
  })
  sdkCase('K3a-HOST', 'ref invalid (boundary)', `the user's first spelling ${HOSTED.refusedSpelling} is refused by the SDK (why the reference is ${HOSTED.credentialRef})`, async (lib) => {
    assert.equal(lib.isCredentialRefName(HOSTED.refusedSpelling), false)
    assert.throws(() => lib.credentialRef(HOSTED.refusedSpelling))
  })
  sdkCase('K3a-HOST', 'record key', 'the saved record key round-trips through parseCredentialKey; its scope segment is fishball-core', async (lib) => {
    const { HOSTED_IMPORT } = await coreConstants()
    const key = lib.parseCredentialKey(HOSTED_IMPORT.savedRecord.key)
    assert.equal(String(key), HOSTED_IMPORT.savedRecord.key, 'round trip')
    assert.equal(lib.credentialKeyScope(key), HOSTED.recordScope, 'scope')
    assert.equal(String(lib.credentialKey(lib.credentialKeyScope(key), lib.credentialKeyId(key))), HOSTED_IMPORT.savedRecord.key, 'rebuilt from its segments')
  })
  sdkCase('K3a-HOST', 'record kind', 'the saved record kind is one of the SDK\'s CredentialRecord kinds', async (lib) => {
    const { HOSTED_IMPORT } = await coreConstants()
    const types = credentialTypes()
    const kinds = types.m.leaves(F.sdkRecordUnion).flatMap((l) => (l.other ? types.m.leaves(types.m.members(l.other).get(F.kind)?.type ?? '') : [])).map((l) => l.literal)
    assert.ok(kinds.includes(HOSTED_IMPORT.savedRecord.kind), 'SDK kinds: ' + JSON.stringify(kinds))
  })
  sdkCase('K3a-HOST', 'presence', 'presence is answered by DSH alone: the SDK declares describe(ref) and describeRecord(key), both with `configured`', async () => {
    const types = credentialTypes()
    const text = [...types.texts.values()].join('\n')
    for (const method of CREDENTIALS.presenceMethods) assert.match(text, method)
    for (const info of CREDENTIALS.presenceInfos) assert.ok(types.m.members(info).has(CREDENTIALS.configuredField), `${info} has no ${CREDENTIALS.configuredField}`)
  })
  sdkCase('K3a-HOST', 'grant scope', 'CONNECT.grantRecordScope is fishball-core and a valid SDK key segment', async (lib) => {
    const { CONNECT } = await coreConstants()
    assert.equal(CONNECT.grantRecordScope, HOSTED.recordScope)
    assert.equal(lib.isCredentialKeySegment(CONNECT.grantRecordScope), true)
  })
  caseTest('K3a-HOST', 'setting row', 'the target setting row is not one of core\'s guarded rows (cordis.patch.yml bare rows)', async () => {
    const { HOSTED_IMPORT } = await coreConstants()
    const patch = guardedRows()
    assert.ok(patch.length > 0, 'no bare guard row read from cordis.patch.yml')
    assert.deepEqual(patch.filter((row) => row === HOSTED_IMPORT.targetSetting.row), [])
  })
  caseTest('K3a-HOST', 'setting row (boundary)', `${HOSTED.guardedInstanceRow} IS a guarded row, so the setting row must differ from it`, async () => {
    const { HOSTED_IMPORT } = await coreConstants()
    const patch = guardedRows()
    assert.ok(patch.includes(HOSTED.guardedInstanceRow), 'cordis.patch.yml guards: ' + patch.join(', '))
    assert.notEqual(HOSTED_IMPORT.targetSetting.row, HOSTED.guardedInstanceRow)
  })

  // ================================================================ §6.3a Connect
  caseTest('K3a-CONNECT', 'states', 'CONNECT.state is needs-configuration, needs-authorization, authorizing, authorized, failed', async () => {
    assert.deepEqual((await coreConstants()).CONNECT.state, CONNECT_EXPECTED.states)
  })
  caseTest('K3a-CONNECT', 'setting', 'the required setting is connect.clientMetadataUrl (R12 = B)', async () => {
    assert.equal((await coreConstants()).CONNECT.setting, CONNECT_EXPECTED.setting)
  })
  caseTest('K3a-CONNECT', 'configuration', 'needs-configuration codes: one per failing rule (missing, not https, root path), not-a-connector, insecure web callback; distinct, kebab-case', async () => {
    const { configuration } = (await coreConstants()).CONNECT
    sameSet(Object.keys(configuration), CONNECT_EXPECTED.configurationKeys, 'configuration keys')
    const values = Object.values(configuration)
    assert.equal(new Set(values).size, values.length, 'two rules share a code')
    assert.deepEqual(values.filter((v) => !CONNECT_EXPECTED.codeShape.test(v)), [], 'codes not kebab-case')
  })
  caseTest('K3a-CONNECT', 'callback', 'the loopback callback path is /callback', async () => {
    assert.equal((await coreConstants()).CONNECT.callback.loopbackPath, CONNECT_EXPECTED.loopbackPath)
  })
  caseTest('K3a-CONNECT', 'callback', 'the web callback is a path: starts with "/", not "//", no scheme or host', async () => {
    const { webPath } = (await coreConstants()).CONNECT.callback
    assert.equal(typeof webPath, typeof CONNECT_EXPECTED.pathStart)
    assert.ok(webPath.startsWith(CONNECT_EXPECTED.pathStart) && !webPath.startsWith(CONNECT_EXPECTED.protocolRelative), 'webPath ' + JSON.stringify(webPath))
    assert.equal(pathOf(SAMPLE.origin + webPath), webPath, 'not a plain path')
  })
  for (const row of CONNECT_EXPECTED.begin) {
    caseTest('K3a-CONNECT', `begin → ${row.outcome}`, `${TYPES.connectBegin} has the ${row.outcome} branch with ${row.fields.length ? row.fields.join(', ') : 'no other field'}`, () => {
      const c = core()
      needDeclarations(c)
      const branches = c.m.leaves(TYPES.connectBegin).map((l) => c.m.members(l.other ?? ''))
      const branch = branches.find((m) => m.has(CONNECT_EXPECTED.outcomeField) && literalMember(c, m, CONNECT_EXPECTED.outcomeField) === row.outcome)
      assert.ok(branch, `no ${row.outcome} branch in ${TYPES.connectBegin}`)
      sameSet([...branch.keys()].filter((k) => k !== CONNECT_EXPECTED.outcomeField), row.fields, `${row.outcome} fields`)
      if (row.urlType) assert.equal(branch.get(TYPE_TEXT.urlField).type.trim(), row.urlType, 'url type')
      if (row.codeVocabulary) sameSet(literalUnion(c, branch.get(TYPE_TEXT.codeField).type.trim()), literalUnion(c, TYPES.connectConfigurationCode), 'code vocabulary')
    })
  }
  caseTest('K3a-CONNECT', 'begin', `${TYPES.connectBegin} has exactly the three outcomes`, () => {
    const c = core()
    needDeclarations(c)
    const outcomes = c.m.leaves(TYPES.connectBegin).map((l) => literalMember(c, c.m.members(l.other ?? ''), CONNECT_EXPECTED.outcomeField))
    sameSet(outcomes, CONNECT_EXPECTED.begin.map((r) => r.outcome), 'outcomes')
  })
  caseTest('K3a-CONNECT', 'client', `${TYPES.oauthClient} has authProvider and status(), onChange(fn), begin(), cancel(), forget(); begin is asynchronous`, () => {
    const c = core()
    needDeclarations(c)
    const members = c.m.members(TYPES.oauthClient)
    member(members, OAUTH_CLIENT.provider, { method: false })
    for (const [name, arity] of Object.entries(OAUTH_CLIENT.methods)) assertParams(member(members, name), arity)
    for (const name of OAUTH_CLIENT.asynchronous) assert.match(members.get(name).returns, TYPE_TEXT.promise, name + ' returns ' + members.get(name).returns)
    assert.ok(functionType(c, members.get(UI.onChange).returns), 'onChange returns no dispose function')
  })
  caseTest('K3a-CONNECT', 'ui part', `${TYPES.fishballConnect} is status, onChange, begin, cancel of the client: no forget, no authProvider`, () => {
    const c = core()
    needDeclarations(c)
    sameSet([...membersOf(c, TYPES.fishballConnect).keys()], UI.fishballConnect, TYPES.fishballConnect)
  })

  // ================================================================ R-FB-14, Q-G1, Q-G2 = A: the fishball-ui seam
  // F-UI moved UI_SEAM unchanged from core's constants into fishball-shared/ui-seam (core's own
  // contract comment said so); the values and the member they name are unchanged.
  caseTest('K3a-UI', 'names', 'UI_SEAM (fishball-shared/ui-seam) is {member: ui, coreMissing: fishball-core-missing}, deeply frozen', async () => {
    const { UI_SEAM } = await uiSeam()
    assert.deepEqual(UI_SEAM, { member: UI.member, coreMissing: UI.coreMissing })
    assert.deepEqual(unfrozen(UI_SEAM, MOVED_EXPORT), [])
  })
  caseTest('K3a-UI', 'moved', `core's constants no longer export ${MOVED_EXPORT} (one owner of the seam's words)`, async () => {
    assert.equal(Object.hasOwn(await coreConstants(), MOVED_EXPORT), false)
  })
  caseTest('K3a-UI', 'member', `fishballInstance has a non-method member named UI_SEAM.member typed ${TYPES.fishballUi}`, async () => {
    const found = member(serviceMembers(core(), UI.instance), (await uiSeam()).UI_SEAM.member, { method: false })
    assert.equal(found.type.trim(), TYPES.fishballUi)
  })
  /** The members of whatever `fishballInstance.ui` is typed as. */
  const ui = () => membersOf(core(), member(serviceMembers(core(), UI.instance), UI.member, { method: false }).type)
  caseTest('K3a-UI', 'managerSessionId', 'managerSessionId() takes nothing', () => {
    for (const [name, arity] of Object.entries(UI.top)) assertParams(member(ui(), name), arity)
  })
  for (const [group, methods] of Object.entries(UI.groups)) {
    caseTest('K3a-UI', group, `ui.${group} has exactly ${Object.keys(methods).join(', ')} with the relayed arities`, () => {
      const members = membersOf(core(), member(ui(), group, { method: false }).type)
      sameSet([...members.keys()], Object.keys(methods), 'ui.' + group)
      for (const [name, arity] of Object.entries(methods)) assertParams(member(members, name), arity)
    })
    caseTest('K3a-UI', group, `ui.${group}.onChange takes one listener (a function) and returns a disposer`, () => {
      const c = core()
      const onChange = member(membersOf(c, member(ui(), group, { method: false }).type), UI.onChange)
      const [listener] = assertParams(onChange, { params: 1 })
      assert.ok(functionType(c, listener.type), 'the listener is typed ' + listener.type)
      assert.ok(functionType(c, onChange.returns), 'returns ' + onChange.returns + ', not a dispose function')
    })
  }
  // MULTI-0 re-baseline: the scalar link / connect / pairing rows became the `targets` rows above.
  caseTest('K3a-UI', 'withdrawn', `FishballUi has no ${UI.withdrawn.join(', ')} member any more (MULTI-0: one ${UI.targetsGroup} list)`, () => {
    assert.deepEqual(UI.withdrawn.filter((n) => ui().has(n)), [])
  })
  for (const name of UI.targetIdParam.methods) {
    caseTest('K3a-UI', UI.targetsGroup, `ui.${UI.targetsGroup}.${name} names the target first: (${UI.targetIdParam.name}: ${UI.targetIdParam.type}, …)`, () => {
      const [first] = member(membersOf(core(), member(ui(), UI.targetsGroup, { method: false }).type), name).params
      assert.deepEqual([first?.name, first?.type.trim(), first?.optional], [UI.targetIdParam.name, UI.targetIdParam.type, false])
    })
  }
  caseTest('K3a-UI', UI.answer.group, `ui.${UI.answer.group}.${UI.answer.method}'s first parameter is ${UI.answer.first}: ${UI.answer.firstType} (the card's opaque handle, MULTI-0)`, () => {
    const [first] = member(membersOf(core(), member(ui(), UI.answer.group, { method: false }).type), UI.answer.method).params
    assert.deepEqual([first?.name, first?.type.trim()], [UI.answer.first, UI.answer.firstType])
  })
  caseTest('K3a-UI', 'no secret', 'no member, parameter or field reachable from fishballInstance.ui is named like a token or secret', () => {
    const found = reachableNames(core(), TYPES.fishballUi).filter((n) => UI.secretField.test(n.name) || n.name === UI.tokenCarrier)
    assert.deepEqual(found.map((n) => n.where), [])
  })
  caseTest('K3a-UI', 'no secret', 'secret-name detector self-check: token, accessToken, refreshToken, credential, codeVerifier, authProvider are caught; state, url, code are not', () => {
    const caught = (n) => UI.secretField.test(n) || n === UI.tokenCarrier
    assert.deepEqual(UI.secretSamples.filter((n) => !caught(n)), [])
    assert.deepEqual(UI.plainSamples.filter(caught), [])
  })
}
