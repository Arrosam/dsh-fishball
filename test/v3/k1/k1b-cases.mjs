/**
 * K1b black-box rows: the request gate and the grant dispatch frozen in
 * `fishball-connector/mcp-schema` (spec and decisions: k1b-constants.mjs). Written from the
 * requirements, the design, Fishball's K1b decisions and the frozen declaration names only; no K1b
 * implementation was read.
 *
 * Each row is named "K1b-<technique>-<n> row <r> [SDK x] …" with exactly one technique: EP, BVA,
 * DT (Decision Table), ST (State Transition) or UC (Use Case). Level: unit over the loaded
 * module's data and its declaration file, as the K1 rows (cases.mjs); the gate's and the
 * registry's behaviour is `todo`, naming the W2 task that implements it.
 *
 * Every status, path, grant, error and refusal word is taken from the loaded module's K1
 * constants by its K1 key (HTTP_STATUS.methodNotAllowed, PATHS.decision, …), never as a literal;
 * K1b-EP-15 checks the module's code writes each of them once, so no K1b constant restates one.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { blankComments, model, splitTop, unwrapPromise } from '../k3/declarations.mjs'
import { RESOLVE_DEPTH } from '../k3/constants.mjs'
import { SKILL_SDK } from '../../private-skills/support/constants.mjs'
import { caseTest, declarationText, todos } from './cases.mjs'
import { MCP } from './constants.mjs'
import { folderTexts, leaves } from './schema-module.mjs'
import {
  ADMIT_ORDER_KEYS, ADMIT_SURFACES, ALLOW_SEPARATOR, BUILT_IN_GRANT_KEYS, CHECK_ORDER_KEYS, CODE_FILE, DISPATCH_FIELDS, GATE_FIELDS, GATE_TYPE,
  GRANT_ERROR_KEYS, GRANT_FORM_FIELD, GRANT_TYPE, HEADER_NAMES, IN_FLIGHT_RETRY_AFTER_S, K1_OWNED, K1B_EXPORTS, K1B_LATER, K1B_TYPES, LIMIT_BODY,
  METHODS, NO_HEADERS, ORIGIN_RULES, REFUSAL_TABLE, ROUTES, STATUS_KEY, STATUS_TYPE, SURFACES,
} from './k1b-constants.mjs'

const isObject = (v) => v !== null && typeof v === 'object'
const sorted = (list) => [...list].sort()
const deepFrozen = (v) => !isObject(v) || (Object.isFrozen(v) && Object.values(v).every(deepFrozen))

/** A K1b or K1 constant of the loaded module, required to be an exported object. */
const exported = (mod, name) => {
  assert.ok(isObject(mod[name]), name + ' is not exported as an object')
  return mod[name]
}
const k1b = (mod, key) => exported(mod, K1B_EXPORTS[key])
const gate = (mod) => k1b(mod, 'gate')
/** A dotted K1 path (`HTTP_REFUSAL.tooLarge`) resolved against the loaded module. */
const at = (mod, dotted) => dotted.split('.').reduce((v, k) => (isObject(v) ? v[k] : undefined), mod)
const statuses = (mod, keys) => keys.map((k) => exported(mod, 'HTTP_STATUS')[k])

/**
 * The declaration model of index.d.ts (the frozen contract's types). `m` reads code with every
 * comment removed: the reader ends a type alias at a blank line, and a doc comment between two
 * union branches would otherwise leave one; `docs` keeps the comments for the documented contract.
 */
function declarations() {
  const [file, text] = declarationText()
  const code = blankComments(text).replace(/\n[ \t]*(?=\n)/g, '')
  return { text, m: model(new Map([[file, code]])), docs: model(new Map([[file, text]])) }
}
const member = (m, owner, name) => {
  const found = m.members(owner).get(name)
  assert.ok(found, `${owner} has no member ${name}`)
  return found
}
const methodOf = (m, owner, name) => {
  const found = member(m, owner, name)
  assert.ok(found.method, `${owner}.${name} is not a method`)
  return found
}
/** The branches of a union type, through aliases and a Promise wrapper. */
function branches(m, type, depth = 0) {
  const t = unwrapPromise(type ?? '').trim()
  const parts = splitTop(t, '|')
  if (parts.length > 1) return parts.flatMap((p) => branches(m, p.text, depth + 1))
  const alias = /^[A-Za-z_$][\w$]*$/.test(t) && (m.decls.get(t) ?? []).find((d) => d.kind === 'alias')
  return alias && depth < RESOLVE_DEPTH ? branches(m, alias.raw, depth + 1) : [t]
}
const typeOf = (m, owner, name) => m.members(owner).get(name)?.type?.trim()
/** The raw text of a type alias, required to exist. */
const aliasText = (m, name) => {
  const alias = (m.decls.get(name) ?? []).find((d) => d.kind === 'alias')
  assert.ok(alias, `${name} is not a declared type`)
  return alias.raw
}
/** A gate method's result: its `{pass: true}` branches and its refusal type. */
function gateResult(m, method) {
  const all = branches(m, methodOf(m, GATE_TYPE.name, method).returns)
  return { passing: all.filter((b) => typeOf(m, b, GATE_TYPE.pass) === GATE_TYPE.literal.true), all }
}
/** A refusal type's branch for one HTTP_STATUS key. */
function refusalBranch(m, refusal, statusKey) {
  const found = branches(m, refusal).filter((b) => STATUS_TYPE.exec(typeOf(m, b, GATE_TYPE.status) ?? '')?.[1] === statusKey)
  assert.equal(found.length, 1, `${refusal} has ${found.length} branches with status HTTP_STATUS.${statusKey}`)
  return found[0]
}

/** The module's code, comments blanked, every file. */
const moduleCode = () => [...folderTexts(CODE_FILE).values()].map(blankComments).join('\n')
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
/** How often a value is written in code: a number as a token, a string as a quoted literal. */
const writtenCount = (code, value) => (typeof value === 'number'
  ? code.match(new RegExp(String.raw`(?<![\w.$])${value}(?![\w.])`, 'g'))
  : code.match(new RegExp(String.raw`(['"\x60])${escape(value)}\1`, 'g')))?.length ?? 0
const assertWrittenOnce = (named) => {
  const code = moduleCode()
  assert.deepEqual(named.filter(([, v]) => v === undefined).map(([k]) => k), [], 'values missing from the module')
  assert.deepEqual(named.map(([k, v]) => [k, writtenCount(code, v)]).filter(([, n]) => n !== 1), [], 'written other than once in the module\'s code')
}

/** This SDK's JSON-RPC error schema (@modelcontextprotocol/core, 2.2.0 on both hosts). */
async function jsonRpcErrorSchema(sdk) {
  const entry = path.join(SKILL_SDK.versionsDir, sdk, SKILL_SDK.nodeModules, MCP.core, MCP.coreEntry)
  return (await import(new URL('file://' + entry).href)).JSONRPCErrorResponseSchema
}
/** A limit refusal's body built from the K1 constants, `id` as `extra` sets it. */
const limitBody = (mod, refusalKey, extra) => ({
  jsonrpc: at(mod, LIMIT_BODY.version),
  ...extra,
  error: { code: at(mod, LIMIT_BODY.code), message: exported(mod, 'HTTP_REFUSAL')[refusalKey] },
})

export function registerK1bCases(sdk) {
  // ======================================================================================
  // Both exports exist, with the right shape
  // ======================================================================================
  caseTest(sdk, 'K1b-EP-01', 1, `the five K1b constants are exported and deeply frozen: ${Object.values(K1B_EXPORTS).join(', ')}`, (mod) => {
    assert.deepEqual(Object.values(K1B_EXPORTS).filter((n) => !isObject(mod[n]) || !deepFrozen(mod[n])), [])
  })
  caseTest(sdk, 'K1b-EP-02', 1, `${K1B_EXPORTS.gate} has exactly {${GATE_FIELDS.join(', ')}}`, (mod) => {
    assert.deepEqual(sorted(Object.keys(gate(mod))), sorted(GATE_FIELDS))
  })
  caseTest(sdk, 'K1b-EP-02', 2, `${K1B_EXPORTS.grantDispatch} has exactly {${DISPATCH_FIELDS.join(', ')}}`, (mod) => {
    assert.deepEqual(sorted(Object.keys(k1b(mod, 'grantDispatch'))), sorted(DISPATCH_FIELDS))
  })
  caseTest(sdk, 'K1b-EP-03', 1, `index.d.ts declares ${K1B_TYPES.join(', ')} and the five constants; it is valid TypeScript`, async () => {
    const { text, m } = declarations()
    assert.deepEqual(K1B_TYPES.filter((n) => !m.decls.has(n)), [], 'types not declared')
    const code = blankComments(text)
    assert.deepEqual(Object.values(K1B_EXPORTS).filter((n) => !new RegExp(String.raw`\bdeclare\s+const\s+${n}\b`).test(code)), [], 'constants not declared')
    const { stripTypeScriptTypes } = await import('node:module')
    assert.doesNotThrow(() => stripTypeScriptTypes(text, { mode: 'strip' }))
  })
  caseTest(sdk, 'K1b-EP-04', 1, `${GATE_TYPE.name}.${GATE_TYPE.check.name}(req: ${GATE_TYPE.check.request}, surface: ${GATE_TYPE.check.surface}), the surface typed from ${K1B_EXPORTS.surface}`, () => {
    const { m } = declarations()
    const check = methodOf(m, GATE_TYPE.name, GATE_TYPE.check.name)
    assert.deepEqual(check.params.map((p) => p.type), [GATE_TYPE.check.request, GATE_TYPE.check.surface])
    assert.match(aliasText(m, GATE_TYPE.check.surface), GATE_TYPE.surfaceSource.check)
  })
  caseTest(sdk, 'K1b-EP-04', 2, `${GATE_TYPE.name}.${GATE_TYPE.admit.name}(req: ${GATE_TYPE.admit.request}, surface: ${GATE_TYPE.admit.surface}, caller: ${GATE_TYPE.admit.caller}), the surface typed from ${K1B_EXPORTS.gate}.admitSurfaces`, () => {
    const { m } = declarations()
    const admit = methodOf(m, GATE_TYPE.name, GATE_TYPE.admit.name)
    assert.deepEqual(admit.params.map((p) => p.type), [GATE_TYPE.admit.request, GATE_TYPE.admit.surface, GATE_TYPE.admit.caller])
    assert.match(aliasText(m, GATE_TYPE.admit.surface), GATE_TYPE.surfaceSource.admit)
    assert.ok(m.members(GATE_TYPE.admit.request).has(GATE_TYPE.admit.bodyBytes), `${GATE_TYPE.admit.request} carries no ${GATE_TYPE.admit.bodyBytes}`)
    assert.deepEqual([...m.members(GATE_TYPE.check.request).keys()].filter((k) => !m.members(GATE_TYPE.admit.request).has(k)), [], `${GATE_TYPE.admit.request} does not extend ${GATE_TYPE.check.request}`)
  })
  caseTest(sdk, 'K1b-EP-05', 1, `admit's ${GATE_TYPE.admit.caller} has a required ${GATE_TYPE.entryKey} and an optional ${GATE_TYPE.boundKey}: a pair-only caller is counted per entry`, () => {
    const { m } = declarations()
    const entry = member(m, GATE_TYPE.admit.caller, GATE_TYPE.entryKey)
    assert.ok(!entry.optional, GATE_TYPE.entryKey + ' is optional')
    const bound = m.members(GATE_TYPE.admit.caller).get(GATE_TYPE.boundKey)
    assert.ok(!bound || bound.optional, `${GATE_TYPE.boundKey} is required, so a pair-only caller could not be admitted`)
  })
  caseTest(sdk, 'K1b-DT-01', 'pass', `check passes with {pass: true}, else ${GATE_TYPE.checkRefusal}; admit passes with {pass: true, ${GATE_TYPE.done}()}, else ${GATE_TYPE.admitRefusal}; ${GATE_TYPE.refusal} is both refusals`, () => {
    const { m } = declarations()
    for (const [method, refusal] of [[GATE_TYPE.check.name, GATE_TYPE.checkRefusal], [GATE_TYPE.admit.name, GATE_TYPE.admitRefusal]]) {
      const { passing, all } = gateResult(m, method)
      assert.equal(passing.length, 1, `${method} has ${passing.length} pass branches`)
      assert.deepEqual(sorted(all.filter((b) => !passing.includes(b))), sorted(branches(m, refusal)), `${method}'s refusals are not ${refusal}`)
    }
    const [admitPass] = gateResult(m, GATE_TYPE.admit.name).passing
    assert.ok(m.members(admitPass).get(GATE_TYPE.done)?.method, `admit's pass has no ${GATE_TYPE.done}()`)
    assert.deepEqual(sorted(branches(m, GATE_TYPE.refusal)), sorted([...branches(m, GATE_TYPE.checkRefusal), ...branches(m, GATE_TYPE.admitRefusal)]))
  })
  let row = 0
  for (const [refusal, table] of Object.entries(REFUSAL_TABLE)) {
    for (const rule of table) {
      row += 1
      const header = rule.header ?? 'no header'
      const body = rule.body ?? 'no body'
      caseTest(sdk, 'K1b-DT-01', row, `${refusal}: status HTTP_STATUS.${rule.status} → {pass: false}, ${body}, ${header}`, () => {
        const { m } = declarations()
        const branch = refusalBranch(m, refusal, rule.status)
        assert.equal(typeOf(m, branch, GATE_TYPE.pass), GATE_TYPE.literal.false)
        const headers = typeOf(m, branch, GATE_TYPE.headers) ?? ''
        if (rule.header === null) assert.match(headers, NO_HEADERS)
        else assert.ok(headers.includes(rule.header), `headers ${headers} do not name ${rule.header}`)
        const bodyType = typeOf(m, branch, GATE_TYPE.body) ?? ''
        if (rule.body === null) assert.equal(bodyType, GATE_TYPE.literal.null)
        else assert.ok(bodyType.includes(rule.body), `body ${bodyType} does not name ${rule.body}`)
      })
    }
  }
  caseTest(sdk, 'K1b-DT-01', row + 1, `a limit refusal's body is a JSON-RPC error typed from ${LIMIT_BODY.version} and ${LIMIT_BODY.code}, with no ${LIMIT_BODY.id}`, () => {
    const { m } = declarations()
    for (const status of ADMIT_ORDER_KEYS) {
      const body = typeOf(m, refusalBranch(m, GATE_TYPE.admitRefusal, status), GATE_TYPE.body)
      const members = m.members(body)
      assert.ok([...members.values()].some((x) => x.type.includes(LIMIT_BODY.version)), `${body} has no ${LIMIT_BODY.version}`)
      assert.ok([...members.values()].some((x) => x.type.includes(LIMIT_BODY.code)), `${body} has no ${LIMIT_BODY.code}`)
      assert.ok(!members.has(LIMIT_BODY.id), `${body} has a member ${LIMIT_BODY.id}`)
    }
  })
  caseTest(sdk, 'K1b-EP-06', 1, `${GRANT_TYPE.handler} {${GRANT_TYPE.grantType}: GRANT's values, ${GRANT_TYPE.handle.name}(form: ${GRANT_TYPE.handle.form}, ctx: ${GRANT_TYPE.handle.context}): Promise<${GRANT_TYPE.result}>}`, () => {
    const { m } = declarations()
    const grantType = member(m, GRANT_TYPE.handler, GRANT_TYPE.grantType)
    assert.ok(!grantType.method && !grantType.optional, `${GRANT_TYPE.grantType} is not a required field`)
    assert.match(aliasText(m, grantType.type), GRANT_TYPE.grantTypeSource)
    const handle = methodOf(m, GRANT_TYPE.handler, GRANT_TYPE.handle.name)
    assert.deepEqual(handle.params.map((p) => p.type), [GRANT_TYPE.handle.form, GRANT_TYPE.handle.context])
    assert.deepEqual(branches(m, handle.returns).sort(), branches(m, GRANT_TYPE.result).sort())
  })
  caseTest(sdk, 'K1b-DT-02', 1, `${GRANT_TYPE.result}: ok → a body of K1's ${GRANT_TYPE.tokenBuilder}; not ok → an ${GRANT_TYPE.errorField} of ${GRANT_TYPE.errorCode}`, () => {
    const { m } = declarations()
    const all = branches(m, GRANT_TYPE.result)
    assert.equal(all.length, 2, `${GRANT_TYPE.result} has ${all.length} branches`)
    const ok = all.filter((b) => typeOf(m, b, 'ok') === GATE_TYPE.literal.true)
    const error = all.filter((b) => typeOf(m, b, 'ok') === GATE_TYPE.literal.false)
    assert.ok(ok.length === 1 && (typeOf(m, ok[0], GATE_TYPE.body) ?? '').includes(GRANT_TYPE.tokenBuilder), 'no token-response branch')
    assert.ok(error.length === 1 && typeOf(m, error[0], GRANT_TYPE.errorField) === GRANT_TYPE.errorCode, 'no OAuth-error branch')
  })
  caseTest(sdk, 'K1b-EP-07', 1, `${GRANT_TYPE.errorCode} is exactly OAUTH_ERROR.{${GRANT_ERROR_KEYS.join(', ')}}, each with an OAUTH_ERROR_STATUS`, (mod) => {
    const { m } = declarations()
    const keys = branches(m, GRANT_TYPE.errorCode).map((b) => GRANT_TYPE.codeType.exec(b)?.[1])
    assert.deepEqual(sorted(keys), sorted(GRANT_ERROR_KEYS))
    const errors = exported(mod, 'OAUTH_ERROR')
    assert.deepEqual(GRANT_ERROR_KEYS.filter((k) => typeof exported(mod, 'OAUTH_ERROR_STATUS')[errors[k]] !== 'number'), [])
  })
  caseTest(sdk, 'K1b-EP-08', 1, `${GRANT_TYPE.registry}.${GRANT_TYPE.register}(handler) excludes ${K1B_EXPORTS.grantDispatch}.builtIn by type and documents a ${TypeError.name} for a built-in, duplicate or unsupported type`, () => {
    const { m, docs } = declarations()
    const register = methodOf(m, GRANT_TYPE.registry, GRANT_TYPE.register)
    assert.equal(register.params.length, 1)
    assert.ok(register.params[0].type.includes(GRANT_TYPE.handler), 'register does not take a ' + GRANT_TYPE.handler)
    assert.match(register.params[0].type, GRANT_TYPE.builtInExcluded)
    assert.ok((methodOf(docs, GRANT_TYPE.registry, GRANT_TYPE.register).doc ?? '').includes(TypeError.name), 'register documents no ' + TypeError.name)
  })

  // ======================================================================================
  // The surface enum
  // ======================================================================================
  caseTest(sdk, 'K1b-EP-09', 1, `${K1B_EXPORTS.surface} is exactly {${Object.values(SURFACES).join(', ')}}, each key its own value`, (mod) => {
    assert.deepEqual(k1b(mod, 'surface'), SURFACES)
  })
  caseTest(sdk, 'K1b-DT-03', 1, `surface → admit: ${K1B_EXPORTS.gate}.admitSurfaces is [${ADMIT_SURFACES}]; ${SURFACES.token} and ${SURFACES.approval} get the pre-auth checks only`, (mod) => {
    const surfaces = Object.values(k1b(mod, 'surface'))
    assert.ok(gate(mod).admitSurfaces.every((s) => surfaces.includes(s)), 'admitSurfaces holds a value outside ' + K1B_EXPORTS.surface)
    assert.deepEqual([...gate(mod).admitSurfaces], ADMIT_SURFACES)
  })
  for (const [surface, ruleKey] of Object.entries(ORIGIN_RULES.bySurface)) {
    caseTest(sdk, 'K1b-DT-03', `origin ${surface}`, `surface → origin rule: ${surface} → ${K1B_EXPORTS.originRule}.${ruleKey}`, (mod) => {
      assert.deepEqual(sorted(Object.keys(k1b(mod, 'originRule'))), sorted(ORIGIN_RULES.keys))
      assert.deepEqual(sorted(Object.keys(gate(mod).originRule)), sorted(Object.values(SURFACES)))
      assert.equal(gate(mod).originRule[surface], k1b(mod, 'originRule')[ruleKey])
    })
  }

  // ======================================================================================
  // The order constants
  // ======================================================================================
  caseTest(sdk, 'K1b-ST-01', 1, `check order: HTTP_STATUS.{${CHECK_ORDER_KEYS.join(' → ')}} (405 → 403 Host/Origin → 503 TLS)`, (mod) => {
    assert.deepEqual([...gate(mod).checkOrder], statuses(mod, CHECK_ORDER_KEYS))
  })
  caseTest(sdk, 'K1b-ST-01', 2, `admit order: HTTP_STATUS.{${ADMIT_ORDER_KEYS.join(' → ')}} (413 → 429)`, (mod) => {
    assert.deepEqual([...gate(mod).admitOrder], statuses(mod, ADMIT_ORDER_KEYS))
  })
  caseTest(sdk, 'K1b-ST-01', 3, `the bearer verifier's HTTP_STATUS.${STATUS_KEY.bearer} sits between the orders: check → 401 → admit gives PLAT-EP-01's 405, 403, 401, 413`, (mod) => {
    const [bearer] = statuses(mod, [STATUS_KEY.bearer])
    const { checkOrder, admitOrder } = gate(mod)
    assert.ok(!checkOrder.includes(bearer) && !admitOrder.includes(bearer), 'an order holds the bearer verifier\'s status')
    assert.deepEqual(checkOrder.filter((s) => admitOrder.includes(s)), [], 'a status is in both orders')
    assert.deepEqual([...checkOrder.slice(0, 2), bearer, admitOrder[0]], statuses(mod, [STATUS_KEY.method, STATUS_KEY.hostOrigin, STATUS_KEY.bearer, STATUS_KEY.body]))
  })

  // ======================================================================================
  // Routes, methods and headers
  // ======================================================================================
  for (const [surface, routes] of Object.entries(ROUTES)) {
    caseTest(sdk, 'K1b-DT-04', surface, `routes of ${surface}: ${routes.map(([keys, methods]) => `${methods} PATHS.${keys.join('+PATHS.')}`).join('; ')}; nothing else`, (mod) => {
      const paths = exported(mod, 'PATHS')
      const expected = Object.fromEntries(routes.map(([keys, methods]) => [keys.map((k) => paths[k]).join(''), methods]))
      const actual = Object.fromEntries(Object.entries(gate(mod).routes?.[surface] ?? {}).map(([p, m]) => [p, [...m]]))
      assert.deepEqual(actual, expected)
    })
  }
  caseTest(sdk, 'K1b-EP-10', 1, `${K1B_EXPORTS.gate}.routes is keyed by exactly the ${K1B_EXPORTS.surface} values`, (mod) => {
    assert.deepEqual(sorted(Object.keys(gate(mod).routes)), sorted(Object.values(k1b(mod, 'surface'))))
  })
  caseTest(sdk, 'K1b-EP-11', 1, `${K1B_EXPORTS.method} is exactly {${Object.values(METHODS).join(', ')}} and every route method is one of them`, (mod) => {
    assert.deepEqual(k1b(mod, 'method'), METHODS)
    const used = Object.values(gate(mod).routes).flatMap((r) => Object.values(r).flat())
    assert.deepEqual(used.filter((v) => !Object.values(k1b(mod, 'method')).includes(v)), [])
  })
  caseTest(sdk, 'K1b-EP-12', 1, `${K1B_EXPORTS.gate}.headers is {${Object.values(HEADER_NAMES).join(', ')}} in lower case; allowSeparator is an RFC 9110 list comma`, (mod) => {
    assert.deepEqual(gate(mod).headers, HEADER_NAMES)
    assert.match(gate(mod).allowSeparator, ALLOW_SEPARATOR)
  })
  caseTest(sdk, 'K1b-BVA-01', 1, `in-flight Retry-After: inFlightRetryAfterMs is exactly ${IN_FLIGHT_RETRY_AFTER_S} whole second in TIME_UNIT (not 0, not a fraction)`, (mod) => {
    const msPerSecond = exported(mod, 'TIME_UNIT').msPerSecond
    assert.equal(gate(mod).inFlightRetryAfterMs, IN_FLIGHT_RETRY_AFTER_S * msPerSecond)
    assert.ok(Number.isSafeInteger(gate(mod).inFlightRetryAfterMs / msPerSecond), 'not a whole number of seconds (Retry-After is whole seconds)')
  })
  for (const [refusal, status] of [['tooLarge', STATUS_KEY.body], ['rateLimited', STATUS_KEY.rate]]) {
    caseTest(sdk, 'K1b-EP-13', `${status} without id`, `ENDPOINT_LIMITS.jsonRpcVersion with jsonRpcCode and HTTP_REFUSAL.${refusal}: this SDK's client accepts the body as a JSON-RPC error`, async (mod) => {
      const schema = await jsonRpcErrorSchema(sdk)
      assert.ok(schema.safeParse(limitBody(mod, refusal, {})).success, JSON.stringify(limitBody(mod, refusal, {})))
    })
    // Negative row: the MCP 2026-07-28 JSON-RPC schema, as @modelcontextprotocol/core 2.2.0 ships
    // it on both SDKs (JSONRPCErrorResponseSchema, `id: RequestIdSchema.optional()`), refuses
    // `id: null`; that is why the limit refusal's body omits `id` instead of writing it null.
    caseTest(sdk, 'K1b-EP-13', `${status} id null`, `the body with id null: this SDK's client refuses it as a JSON-RPC error`, async (mod) => {
      const schema = await jsonRpcErrorSchema(sdk)
      const body = limitBody(mod, refusal, { [LIMIT_BODY.id]: null })
      assert.ok(!schema.safeParse(body).success, `this SDK (MCP 2026-07-28 schema) accepts ${JSON.stringify(body)}`)
    })
  }

  // ======================================================================================
  // Grant dispatch
  // ======================================================================================
  caseTest(sdk, 'K1b-EP-14', 1, `${K1B_EXPORTS.grantDispatch}.formField is ${GRANT_FORM_FIELD} (RFC 6749 §4.4.2)`, (mod) => {
    assert.equal(k1b(mod, 'grantDispatch').formField, GRANT_FORM_FIELD)
  })
  caseTest(sdk, 'K1b-EP-14', 2, `${K1B_EXPORTS.grantDispatch}.builtIn is exactly GRANT.{${BUILT_IN_GRANT_KEYS}}, within the AS metadata's grant_types_supported`, (mod) => {
    const grant = exported(mod, 'GRANT')
    const builtIn = [...k1b(mod, 'grantDispatch').builtIn]
    assert.deepEqual(builtIn, BUILT_IN_GRANT_KEYS.map((k) => grant[k]))
    const supported = exported(mod, 'OAUTH_METADATA').authorizationServer.grant_types_supported
    assert.deepEqual(builtIn.filter((g) => !supported.includes(g)), [])
  })

  // ======================================================================================
  // Every value from the K1 constants
  // ======================================================================================
  caseTest(sdk, 'K1b-EP-15', 1, 'each K1-owned status, path, grant, refusal word and the Retry-After name is written once in the module\'s code: the K1b constants restate none', (mod) => {
    const status = exported(mod, 'HTTP_STATUS')
    const paths = exported(mod, 'PATHS')
    const refusals = exported(mod, 'HTTP_REFUSAL')
    assertWrittenOnce([
      ...K1_OWNED.statusKeys.map((k) => ['HTTP_STATUS.' + k, status[k]]),
      ...K1_OWNED.pathKeys.map((k) => ['PATHS.' + k, paths[k]]),
      ...Object.entries(exported(mod, 'GRANT')).map(([k, v]) => ['GRANT.' + k, v]),
      ...K1_OWNED.refusalKeys.map((k) => ['HTTP_REFUSAL.' + k, refusals[k]]),
      ['RATE_LIMITS.retryAfterHeader', exported(mod, 'RATE_LIMITS').retryAfterHeader],
      ['ENDPOINT_LIMITS.jsonRpcCode', exported(mod, 'ENDPOINT_LIMITS').jsonRpcCode],
    ])
  })
  caseTest(sdk, 'K1b-EP-15', 2, `the words K1b adds have one owner each: the surfaces, the methods, the origin rules and ${GRANT_FORM_FIELD} are written once (a word a K1 constant of another meaning also holds is exempt)`, (mod) => {
    // The project keeps equal values of different meanings under separate names, so a surface
    // spelled like a K1 word (`approval`, DECISION_KIND's) is a second literal, not a restatement.
    const k1Words = new Set(Object.entries(mod).filter(([n]) => !Object.values(K1B_EXPORTS).includes(n)).flatMap(([n]) => leaves({ [n]: mod[n] }).map((l) => l.value)))
    const words = [
      ...Object.entries(SURFACES).map(([k, v]) => [K1B_EXPORTS.surface + '.' + k, v]),
      ...Object.entries(METHODS).map(([k, v]) => [K1B_EXPORTS.method + '.' + k, v]),
      ...Object.entries(k1b(mod, 'originRule')).map(([k, v]) => [K1B_EXPORTS.originRule + '.' + k, v]),
      [K1B_EXPORTS.grantDispatch + '.formField', GRANT_FORM_FIELD],
    ]
    assertWrittenOnce(words.filter(([, v]) => !k1Words.has(v)))
  })

  // ======================================================================================
  // Behaviour (W2): the gate's and the registry's implementations
  // ======================================================================================
  todos(sdk, 'K1b-UC-01', K1B_LATER.http, [
    ['PLAT-EP-01 1–6', 'one MCP request through check → bearer → admit: 405, 403, 401 (beats 413), 413, 400 -32022, dispatched'],
    ['PLAT-UC-01 E3', 'GET and DELETE on the MCP endpoint: 405 with no body and Allow: POST'],
  ])
  todos(sdk, 'K1b-DT-05', K1B_LATER.http, [
    ['1–4', 'check per surface: foreign Host (AUTH-EP-09 row 5) → 403; present Origin → 403 on mcp/token, own origin passes on approval; non-loopback http listener → 503 {error: insecure-listener}; an unlisted path skips only 405'],
  ])
  todos(sdk, 'K1b-BVA-02', K1B_LATER.http, [
    ['PLAT-BVA-02 1–4', 'admit on mcp: bodyBytes = limit − 1 and limit pass, limit + 1 → 413; in-flight = max then one more → 429 Retry-After 1; counted per entryKey, a pair-only caller included'],
  ])
  todos(sdk, 'K1b-ST-02', K1B_LATER.http, [
    ['1–3', 'an in-flight slot: taken by a pass, freed by done(); a listen stream frees it once open; a refusal takes none'],
  ])
  // K1b-UC-02 (the token endpoint over the gate, the grant dispatch) and K1b-DT-06 (GrantRegistry)
  // run against C-OAUTH's implementation in test/v3/c-oauth/cases.mjs, under the same case ids.
  todos(sdk, 'K1b-DT-07', K1B_LATER.web, [
    ['1–3', 'approval: POST /authorize → 405 Allow: GET; GET /authorize/decision → 405 Allow: POST; an unknown path passes the gate and gets 404'],
  ])
}
