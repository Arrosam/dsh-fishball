/**
 * K1 MULTI-0 rows (2026-11-18): the additive server-identity contract (oracles and sources:
 * multi-constants.mjs). Named "K1-MULTI-<technique>-<n>":
 * - EP: one partition per frozen value group (identity resource, server identity, the type, the
 *   export list, the README record) and the unchanged partitions (events resource, tool names);
 * - DT: each frozen spec-defined value against the SDK's own MCP packages (key, method, params);
 * - BVA: the resource set is exactly two (events + identity), not one, not three.
 *
 * Level: unit over the loaded module (both SDKs), index.d.ts / index.js / README read as text, and
 * the SDK's MCP client/core entries. The live behaviour (name getter, push) is MULTI-2's (`todo`).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from '../../../../../test/support/constants.mjs'
import { caseTest } from './cases.mjs'
import { declarations, declaredConstType, readme, section, unquote } from './k1c-cases.mjs'
import { DECLARED_EXPORT } from './k1c-constants.mjs'
import {
  EVENTS_RESOURCE, IDENTITY_RESOURCE, MULTI_EXPORTS as X, MULTI_LATER, MULTI_README, NO_TARGET_ARGUMENT, RESOURCE_KEYS, SDK_ORACLE,
  SERVER_IDENTITY_TYPE, SERVER_IDENTITY_VALUES, TOOL_NAMES_UNCHANGED,
} from './multi-constants.mjs'
import { mcpClient, mcpCore, rootPropertyNames } from './schema-module.mjs'

const sorted = (list) => [...list].sort()
const isDeepFrozen = (v) => v === null || typeof v !== 'object' || (Object.isFrozen(v) && Object.values(v).every(isDeepFrozen))
/** The literal-typed members of `export declare const <name>: {…}` (or of a nested member of it) as a plain object. */
function declaredLiterals(m, type) {
  return Object.fromEntries([...m.members(type)].map(([k, v]) => [k, unquote(v.type.trim())]))
}

export function registerK1MultiCases(sdk) {
  // ------------------------------------------------------------------ RESOURCE
  caseTest(sdk, 'K1-MULTI-EP-01', 'identity', `RESOURCE.identity is exactly ${JSON.stringify(IDENTITY_RESOURCE)}, frozen`, (mod) => {
    assert.deepEqual({ ...mod[X.resource]?.identity }, IDENTITY_RESOURCE)
    assert.ok(Object.isFrozen(mod[X.resource].identity), 'RESOURCE.identity is not frozen')
  })
  caseTest(sdk, 'K1-MULTI-EP-01', 'events unchanged', `RESOURCE.events is still exactly ${JSON.stringify(EVENTS_RESOURCE)}`, (mod) => {
    assert.deepEqual({ ...mod[X.resource]?.events }, EVENTS_RESOURCE)
  })
  caseTest(sdk, 'K1-MULTI-BVA-01', 'resource count', `RESOURCE has exactly ${RESOURCE_KEYS.join(' and ')} (two; no third resource), deeply frozen`, (mod) => {
    assert.deepEqual(sorted(Object.keys(mod[X.resource])), sorted(RESOURCE_KEYS))
    assert.ok(isDeepFrozen(mod[X.resource]), 'RESOURCE is not deeply frozen')
  })
  caseTest(sdk, 'K1-MULTI-EP-01', 'distinct', 'the identity resource differs from the events resource in name and uri', (mod) => {
    const { events, identity } = mod[X.resource]
    assert.notEqual(identity.uri, events.uri)
    assert.notEqual(identity.name, events.name)
  })

  // ------------------------------------------------------------------ SERVER_IDENTITY
  caseTest(sdk, 'K1-MULTI-EP-02', 'values', `SERVER_IDENTITY is exactly ${JSON.stringify(SERVER_IDENTITY_VALUES)}, frozen`, (mod) => {
    assert.deepEqual({ ...mod[X.serverIdentity] }, SERVER_IDENTITY_VALUES)
    assert.ok(isDeepFrozen(mod[X.serverIdentity]), 'SERVER_IDENTITY is not frozen')
  })
  caseTest(sdk, 'K1-MULTI-DT-01', 'meta key', 'SERVER_IDENTITY.discoverMetaKey equals the SDK client\'s SERVER_INFO_META_KEY (the standard _meta location)', async (mod) => {
    const client = await mcpClient(sdk)
    assert.equal(typeof client[SDK_ORACLE.metaKeyExport], 'string', `the SDK client exports no ${SDK_ORACLE.metaKeyExport}`)
    assert.equal(mod[X.serverIdentity].discoverMetaKey, client[SDK_ORACLE.metaKeyExport])
  })
  caseTest(sdk, 'K1-MULTI-DT-01', 'notification', 'SERVER_IDENTITY.updatedNotification is the SDK\'s ResourceUpdatedNotification method and a ServerNotification (standard, not custom)', async (mod) => {
    const core = await mcpCore(sdk)
    assert.equal(mod[X.serverIdentity].updatedNotification, core[SDK_ORACLE.notificationSchema].shape.method.value)
    const methods = core[SDK_ORACLE.serverNotifications].options.map((o) => o.shape.method.value)
    assert.ok(methods.includes(mod[X.serverIdentity].updatedNotification), 'not a server notification: ' + methods.join(', '))
  })
  caseTest(sdk, 'K1-MULTI-DT-01', 'params', 'the notification\'s one required param is uri (the SDK\'s _meta stays optional): {uri: identity} parses with and without the SDK\'s subscription-id _meta', async (mod) => {
    const [core, client] = [await mcpCore(sdk), await mcpClient(sdk)]
    const params = core[SDK_ORACLE.notificationSchema].shape.params.shape
    assert.deepEqual(Object.keys(params).filter((k) => !params[k].isOptional()), [SDK_ORACLE.uriParam])
    const uri = { [SDK_ORACLE.uriParam]: mod[X.resource].identity.uri }
    const stamped = { ...uri, [SDK_ORACLE.metaParam]: { [client[SDK_ORACLE.subscriptionMetaKey]]: SDK_ORACLE.subscriptionId } }
    for (const p of [uri, stamped]) {
      assert.ok(core[SDK_ORACLE.notificationSchema].safeParse({ method: mod[X.serverIdentity].updatedNotification, params: p }).success, 'refused: ' + JSON.stringify(p))
    }
  })
  caseTest(sdk, 'K1-MULTI-DT-01', 'Implementation', 'ServerIdentity\'s members are exactly the SDK Implementation\'s required members (name, version)', async () => {
    const shape = (await mcpCore(sdk))[SDK_ORACLE.implementationSchema].shape
    assert.deepEqual(sorted(Object.keys(shape).filter((k) => !shape[k].isOptional())), sorted(Object.keys(SERVER_IDENTITY_TYPE.members)))
  })

  // ------------------------------------------------------------------ declarations and export list
  for (const [name, expected, pick] of [
    [`${X.resource}.identity`, IDENTITY_RESOURCE, (m, code) => m.members(declaredConstType(code, X.resource)).get(X.resourceKeys.identity).type],
    [`${X.resource}.events`, EVENTS_RESOURCE, (m, code) => m.members(declaredConstType(code, X.resource)).get(X.resourceKeys.events).type],
    [X.serverIdentity, SERVER_IDENTITY_VALUES, (m, code) => declaredConstType(code, X.serverIdentity)],
  ]) {
    caseTest(sdk, 'K1-MULTI-EP-03', `${name} (declared)`, `index.d.ts types ${name} with exactly the literal values of constants.js`, () => {
      const { code, m } = declarations()
      assert.deepEqual(declaredLiterals(m, pick(m, code)), expected)
    })
  }
  caseTest(sdk, 'K1-MULTI-EP-03', `${SERVER_IDENTITY_TYPE.name} (declared)`, `index.d.ts declares interface ${SERVER_IDENTITY_TYPE.name} with exactly {name: string, version: string}, required`, () => {
    const members = declarations().m.members(SERVER_IDENTITY_TYPE.name)
    assert.deepEqual(sorted(members.keys()), sorted(Object.keys(SERVER_IDENTITY_TYPE.members)))
    for (const [k, t] of Object.entries(SERVER_IDENTITY_TYPE.members)) {
      assert.equal(members.get(k).type.trim(), t, k)
      assert.equal(members.get(k).optional, false, k + ' is optional')
    }
  })
  caseTest(sdk, 'K1-MULTI-EP-03', 'export declared', `index.d.ts has an export declare line for ${X.serverIdentity}, and the runtime module exports it`, (mod) => {
    const declared = new Set([...declarations().code.matchAll(DECLARED_EXPORT)].map((x) => x[1]))
    assert.ok(declared.has(X.serverIdentity), 'not declared')
    assert.ok(Object.hasOwn(mod, X.serverIdentity), 'not exported')
  })
  caseTest(sdk, 'K1-MULTI-EP-03', 'index.js list', `index.js's frozen export-name list for constants.js names ${X.serverIdentity} and ${X.resource}`, () => {
    const header = X.headerList.exec(fs.readFileSync(path.join(REPO, X.indexFile), 'utf8'))?.[1] ?? ''
    const names = new Set(header.match(/[A-Z][A-Z0-9_]+/g) ?? [])
    assert.deepEqual([X.serverIdentity, X.resource].filter((n) => !names.has(n)), [])
  })

  // MULTI-0 changes no tools; the later explicit CONN-TOOLS decision removes two unsupported names.
  caseTest(sdk, 'K1-MULTI-EP-04', 'tool names', 'TOOL_NAMES and TOOLS are exactly the retained set after the CONN-TOOLS decision (MULTI-0 itself adds no tools)', (mod) => {
    assert.deepEqual(sorted(mod.TOOL_NAMES), sorted(TOOL_NAMES_UNCHANGED))
    assert.deepEqual(sorted(mod.TOOLS.map((t) => t.name)), sorted(TOOL_NAMES_UNCHANGED))
  })
  caseTest(sdk, 'K1-MULTI-EP-04', 'no dsh argument', 'no tool input schema has a target-selecting root argument (dsh, target, targetId, server; D01)', (mod) => {
    const found = mod.TOOLS.flatMap((t) => [...rootPropertyNames(t.inputSchema)].filter((p) => NO_TARGET_ARGUMENT.test(p)).map((p) => t.name + '.' + p))
    assert.deepEqual(found, [])
  })

  // ------------------------------------------------------------------ README record
  caseTest(sdk, 'K1-MULTI-EP-05', 'README', `README "${MULTI_README.section}" states every frozen value and rule`, () => {
    const body = section(readme(), MULTI_README.section)
    assert.deepEqual(MULTI_README.words.filter((w) => !w.test(body)).map(String), [])
  })

  for (const title of MULTI_LATER.rows) caseTest(sdk, 'K1-MULTI-EP-06', 'behaviour', title, null, MULTI_LATER.connector)
}
