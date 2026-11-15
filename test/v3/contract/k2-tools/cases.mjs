import { assertNoGeneratedSchema } from '../own-schema/absence.mjs'
/**
 * K2 black-box cases: the freeze of `dsh-connector/tools` (v3-tasks.md row K2). K2 "resolves
 * the K flags in EXT", so the cases are the K-flagged EXT cases of 07-contributors.md (`fb1cbd2`):
 * EXT-UC-03 (N of M), EXT-EP-01 (grammar, keyword subset), EXT-BVA-01 … 04 (limits, ceilings) and
 * EXT-DT-01 (emit vocabulary), plus the row's own freeze items (apiVersion, signatures, codes, the
 * `_meta` contributor field, the `defineTool` validator).
 *
 * Techniques: UC, EP, BVA, DT, ST only; each test name carries its case id and row.
 * Level: unit. The module is data and types (design §9.1); what a contributor can call without a
 * connector is `defineTool`, so the registration rows that need no caller context run against it.
 * Rows that need the registry, `emit`, a call path or a DSH host are `todo`, naming C-EXT.
 *
 * Expected values come from the requirements (R-EXT-02/03/12/18), and from design §13.2 where the
 * requirement defers to it. The exact export names are K2's, so frozen values are found by meaning
 * (tools-module.mjs). Assumed contract (see the K2 case questions): `defineTool(def)` validates the
 * definition and throws the same `ToolContributionError {code}` as `register` on a refusal.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import { REPO } from '../../../support/constants.mjs'
import {
  API, CALL_CODE, DESCRIPTION_MAX_BYTES, EMIT_CODE, EURO, EVENT_LIMITS, EXTERNAL_NAME_AMEND, FIXTURE, GRAMMAR, LATER, LIMIT_KEYS,
  MCP_TOOL_NAME, MEANING, MESSAGE_MAX_CHARS, META_KEY, NON_HINT_ANNOTATION, PROTOCOL_VERSION, REGISTER_CODE, SERVICE, SHORT_NAMESPACE,
} from './constants.mjs'
import {
  accepts, define, definition, exportedStrings, folderTexts, isInvalid, largestAccepted, leaves, mcpCore, numbersAt, resolveToolsFile,
  stringLists, toolsModule,
} from './tools-module.mjs'

/**
 * One test per case row, named "<case id> row <n> [SDK x] <partition>"; `todo` names the owning task.
 * The module is loaded only for a body that takes it, so an SDK-oracle row runs without it.
 */
function caseTest(sdk, id, row, title, fn, todo) {
  const name = `${id} row ${row} [SDK ${sdk}] ${title}`
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, async () => (fn.length === 0 ? fn() : fn(await toolsModule(sdk))))
}

const name = (length) => FIXTURE.pad.repeat(length)
const utf8 = (s) => Buffer.byteLength(s, 'utf8')
/** A public tool name `<namespace><separator><local>` on the short namespace, with the module's frozen separator. */
const publicName = (mod, local) => SHORT_NAMESPACE + mod.NAMESPACE.separator + local
/** A string of exactly `bytes` UTF-8 bytes, mostly three-byte characters (bytes, not characters, count). */
const ofBytes = (bytes) => EURO.repeat(Math.floor(bytes / utf8(EURO))) + FIXTURE.pad.repeat(bytes % utf8(EURO))
const assertExported = (mod, values) => {
  const strings = exportedStrings(mod)
  assert.deepEqual(values.filter((v) => !strings.has(v)), [], 'not exported as data by dsh-connector/tools')
}
/** A frozen number of the module, found at a path that means `meaning`; `expected` when the requirement fixes it. */
const assertFrozenNumber = (mod, meaning, expected) => {
  const found = numbersAt(mod, meaning)
  assert.ok(found.includes(expected), `no exported ${meaning} value ${expected}; found ${JSON.stringify(found)}`)
}
/** The parameter lists of every `<member>(…)` signature in the module's source and declaration text. */
function signatures(member) {
  const pattern = new RegExp(String.raw`\b${member}\s*\(([^)]*)\)`, 'g')
  return [...folderTexts()].flatMap(([file, text]) => [...text.matchAll(pattern)].map((m) => ({ file, params: m[1].trim() })))
}
const paramCount = (params) => (params === '' ? 0 : params.split(',').length)
/** The keyword subset: the exported string list holding the keywords every object schema needs. */
const keywordSubset = (mod) => stringLists(mod).find((list) => FIXTURE.subsetCore.every((k) => list.includes(k)))
const outsideSubset = (mod) => FIXTURE.keywordCandidates.filter(([k]) => !keywordSubset(mod)?.includes(k))
const withKeyword = ([keyword, value]) => ({ ...FIXTURE.valid.inputSchema, [keyword]: value })

export function registerK2Cases(sdk) {
  // ---- The module itself (K2 freeze: apiVersion, defineTool, signatures, vocabularies) ----
  // import.meta.resolve does not check that the target exists, so the row also imports the module.
  caseTest(sdk, 'EXT-EP-01', 'K2', 'dsh-connector/tools resolves and loads on this SDK', (mod) => {
    assert.ok(resolveToolsFile())
    assert.ok(Object.keys(mod).length > 0, 'the module exports nothing')
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'apiVersion is frozen as 1 (design §13.2)', (mod) => {
    const versions = leaves(mod).filter((l) => API.versionPath.test(l.path)).map((l) => l.value)
    assert.ok(versions.length > 0, 'no exported apiVersion')
    assert.deepEqual([...new Set(versions)], [API.version], 'exported apiVersion values')
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'defineTool is a function and ToolContributionError an Error subclass carrying a code', (mod) => {
    assert.equal(typeof mod[API.define], 'function')
    assert.equal(typeof mod[API.error], 'function')
    assert.ok(mod[API.error].prototype instanceof Error)
    const refused = define(mod, definition({ name: '' }))
    assert.equal(typeof refused.code, 'string')
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'register(def) takes one definition and no ctx (S5-Q1); emit(event) one event; mine() nothing', () => {
    const shapes = [[SERVICE.register, 1], [SERVICE.emit, 1], [SERVICE.mine, 0]]
    for (const [member, count] of shapes) {
      const found = signatures(member)
      assert.ok(found.length > 0, `no ${member}(…) signature in the module's text`)
      assert.deepEqual(found.filter((s) => paramCount(s.params) !== count || SERVICE.ctxParam.test(s.params)), [], member + ' signature')
    }
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'registration refusal codes are frozen, contributor-unidentified included (R-EXT-02/03)', (mod) => {
    assertExported(mod, Object.values(REGISTER_CODE))
  })
  caseTest(sdk, 'EXT-DT-01', 'K2', 'every emit refusal code of the decision table is frozen (rules 1–7, 11)', (mod) => {
    assertExported(mod, Object.values(EMIT_CODE))
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'the shared result vocabulary a contributor may use is frozen (R-EXT-07/08, design §13.5)', (mod) => {
    assertExported(mod, [CALL_CODE.failed, CALL_CODE.operationFailed, CALL_CODE.forbidden, CALL_CODE.limitExceeded])
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'the _meta contributor key is frozen (R-EXT-12, S5-Q3)', (mod) => {
    assertExported(mod, [META_KEY])
  })
  // The probe is the module's own key (the row above checks its value against R-EXT-12).
  caseTest(sdk, 'EXT-EP-01', 'K2', 'the frozen _meta key survives this SDK\'s MCP Tool schema; a non-hint annotation does not (S5 §3.5)', async (mod) => {
    const core = await mcpCore(sdk)
    const key = mod.CONTRIBUTOR_META_KEY
    const tool = core.ToolSchema.parse({
      name: publicName(mod, FIXTURE.valid.name), inputSchema: FIXTURE.valid.inputSchema,
      annotations: { ...FIXTURE.hint, [NON_HINT_ANNOTATION]: FIXTURE.contributor }, _meta: { [key]: FIXTURE.contributor },
    })
    assert.deepEqual(tool._meta[key], FIXTURE.contributor)
    assert.deepEqual(tool.annotations, FIXTURE.hint)
  })
  caseTest(sdk, 'EXT-EP-01', 'K2', 'the protocol revision handed to execute is 2026-07-28 (R-EXT-10)', (mod) => {
    const inText = [...folderTexts().values()].some((t) => t.includes(PROTOCOL_VERSION))
    assert.ok(inText || exportedStrings(mod).has(PROTOCOL_VERSION), PROTOCOL_VERSION + ' is not in dsh-connector/tools')
  })

  // ---- EXT-EP-01: registration validity (defineTool rows; registry rows are C-EXT's) ----
  caseTest(sdk, 'EXT-EP-01', 1, 'valid name, object schema, execute → accepted', (mod) => {
    assert.equal(define(mod, definition()).code, null)
    for (const n of FIXTURE.validNames) assert.equal(define(mod, definition({ name: n })).code, null, n)
  })
  caseTest(sdk, 'EXT-EP-01', 2, 'name with an upper-case letter / space / `/` (or a leading `_`/`-`) → tool-invalid', (mod) => {
    for (const n of FIXTURE.badCharacterNames) assert.ok(isInvalid(mod, definition({ name: n })), n)
  })
  caseTest(sdk, 'EXT-EP-01', 3, 'name with a leading or trailing `.` → tool-invalid', (mod) => {
    for (const n of FIXTURE.dotEdgeNames) assert.ok(isInvalid(mod, definition({ name: n })), n)
  })
  caseTest(sdk, 'EXT-EP-01', 4, 'input schema root type "array" → tool-invalid', (mod) => {
    assert.ok(isInvalid(mod, definition({ inputSchema: FIXTURE.arraySchema })))
  })
  caseTest(sdk, 'EXT-EP-01', 5, 'input schema not an object (string, null, missing) → tool-invalid', (mod) => {
    for (const [label, schema] of FIXTURE.nonObjectSchemas) assert.ok(isInvalid(mod, definition({ inputSchema: schema })), label)
    assert.ok(isInvalid(mod, definition({ inputSchema: undefined })), 'missing')
  })
  caseTest(sdk, 'EXT-EP-01', 6, '`$ref` to a remote URL → tool-invalid', (mod) => {
    const schema = { ...FIXTURE.valid.inputSchema, properties: { key: { $ref: FIXTURE.remoteRef } } }
    assert.ok(isInvalid(mod, definition({ inputSchema: schema })))
  })
  caseTest(sdk, 'EXT-EP-01', 6, 'the keyword subset is frozen as data and leaves some JSON Schema keywords out', (mod) => {
    assert.ok(keywordSubset(mod), 'no exported keyword list holding ' + FIXTURE.subsetCore.join(', '))
    assert.ok(outsideSubset(mod).length > 0, 'every candidate keyword is in the subset')
  })
  caseTest(sdk, 'EXT-EP-01', 6, 'a keyword outside the subset → tool-invalid, at the root and nested; one inside → accepted', (mod) => {
    const subset = keywordSubset(mod) ?? []
    for (const candidate of FIXTURE.keywordCandidates) {
      const [keyword] = candidate
      const nested = { ...FIXTURE.valid.inputSchema, properties: { key: { type: 'object', [keyword]: candidate[1] } } }
      if (subset.includes(keyword)) assert.ok(accepts(mod, definition({ inputSchema: withKeyword(candidate) })), keyword + ' is in the subset')
      else {
        assert.ok(isInvalid(mod, definition({ inputSchema: withKeyword(candidate) })), keyword + ' at the root')
        assert.ok(isInvalid(mod, definition({ inputSchema: nested })), keyword + ' nested')
      }
    }
  })
  caseTest(sdk, 'EXT-EP-01', 7, 'missing execute / execute not a function → tool-invalid', (mod) => {
    assert.ok(isInvalid(mod, definition({ execute: undefined })), 'missing')
    assert.ok(isInvalid(mod, definition({ execute: FIXTURE.nonFunctionExecute })), 'a string')
  })
  caseTest(sdk, 'EXT-EP-01', 8, 'empty description / over 2 KiB UTF-8 → tool-invalid; exactly 2 KiB → accepted', (mod) => {
    assert.ok(isInvalid(mod, definition({ description: '' })), 'empty')
    assert.ok(isInvalid(mod, definition({ description: undefined })), 'missing')
    assert.ok(accepts(mod, definition({ description: ofBytes(DESCRIPTION_MAX_BYTES) })), '2048 bytes')
    assert.ok(isInvalid(mod, definition({ description: ofBytes(DESCRIPTION_MAX_BYTES + 1) })), '2049 bytes')
    assert.ok(isInvalid(mod, definition({ description: name(DESCRIPTION_MAX_BYTES + 1) })), '2049 ASCII characters')
  })
  caseTest(sdk, 'EXT-EP-01', 9, 'limits.timeoutMs over the ceiling → tool-invalid; the ceiling itself → accepted', (mod) => {
    assertCeiling(mod, 'timeoutMs')
  })
  caseTest(sdk, 'EXT-EP-01', 10, 'a codes entry breaking `[a-z][a-z0-9-]{0,47}` → tool-invalid; grammar codes → accepted', (mod) => {
    assert.ok(accepts(mod, definition({ codes: FIXTURE.goodCodes })), 'good codes')
    assert.ok(accepts(mod, definition({ codes: [name(GRAMMAR.codeMax)] })), '48-character code')
    assert.ok(isInvalid(mod, definition({ codes: [name(GRAMMAR.codeMax + 1)] })), '49-character code')
    assert.ok(isInvalid(mod, definition({ codes: [''] })), 'empty code')
    for (const code of FIXTURE.badCodes) assert.ok(isInvalid(mod, definition({ codes: [...FIXTURE.goodCodes, code] })), code)
  })
  // Row 14a is K ("refused tool-invalid or dropped"); dropping may happen when the tool is listed, so
  // defineTool may accept the key, and the "not passed to clients" half is checked on tools/list.
  caseTest(sdk, 'EXT-EP-01', '14a', 'declared behaviour hints are accepted; a non-hint annotation key is accepted or refused tool-invalid', (mod) => {
    assert.equal(define(mod, definition({ annotations: FIXTURE.hint })).code, null, 'a declared behaviour hint is refused')
    const result = define(mod, definition({ annotations: { ...FIXTURE.hint, [NON_HINT_ANNOTATION]: FIXTURE.contributor } }))
    assert.ok([null, REGISTER_CODE.invalid].includes(result.code), 'refusal code ' + result.code)
  })
  caseTest(sdk, 'EXT-EP-01', '14a', 'a non-hint annotation key never reaches a client in tools/list', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 11, 'same public name twice → tool-exists; the first stays', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 12, 'derived namespace `fishball` or the connector\'s plugin name → namespace-reserved', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 13, 'the connector unloading → registry-closed', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 14, 'any refusal: nothing registered, nothing in tools/list, one log line', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 15, 'the same name after dispose → registered again', null, LATER.registry)
  caseTest(sdk, 'EXT-EP-01', 16, 'the disposer called twice → no-op', null, LATER.registry)

  // ---- EXT-BVA-01: tool name lengths ----
  caseTest(sdk, 'EXT-BVA-01', 1, 'public name length 128 → registered (needs a namespace of 79 characters)', null, LATER.registry)
  caseTest(sdk, 'EXT-BVA-01', 2, 'public name length 129 → tool-invalid (needs a long derived namespace)', null, LATER.registry)
  caseTest(sdk, 'EXT-BVA-01', 3, 'local name length 1 (`ns.a`) → accepted; the public name meets MCP\'s rule', (mod) => {
    assert.ok(accepts(mod, definition({ name: name(1) })))
    assert.match(publicName(mod, name(1)), MCP_TOOL_NAME)
  })
  caseTest(sdk, 'EXT-BVA-01', 4, 'local name length 0 → tool-invalid', (mod) => {
    assert.ok(isInvalid(mod, definition({ name: '' })))
  })
  caseTest(sdk, 'EXT-BVA-01', 5, 'local name 48 (grammar max) → accepted; `ns.` + 48 meets MCP\'s rule', (mod) => {
    assert.ok(accepts(mod, definition({ name: name(GRAMMAR.nameMax) })))
    assert.match(publicName(mod, name(GRAMMAR.nameMax)), MCP_TOOL_NAME)
  })
  caseTest(sdk, 'EXT-BVA-01', 6, 'local name 49 → tool-invalid', (mod) => {
    assert.ok(isInvalid(mod, definition({ name: name(GRAMMAR.nameMax + 1) })))
  })

  // ---- EXT-BVA-02: event payload and summary (frozen values; emit behaviour is C-EXT's) ----
  caseTest(sdk, 'EXT-BVA-02', '1–4', 'the payload limit is frozen as 8192 UTF-8 bytes (8 KiB)', (mod) => {
    assertFrozenNumber(mod, MEANING.payload, EVENT_LIMITS.payloadBytes)
  })
  caseTest(sdk, 'EXT-BVA-02', '6–8', 'the summary limit is frozen as 500 characters', (mod) => {
    assertFrozenNumber(mod, MEANING.summary, EVENT_LIMITS.summaryChars)
  })
  for (const [row, title] of [
    [1, 'payload 8191 bytes → ok'], [2, 'payload 8192 bytes → ok'], [3, 'payload 8193 bytes → payload-too-large, nothing queued'],
    [4, 'payload 2731 × € + quotes = 8195 bytes → payload-too-large'], [5, 'payload not JSON-serialisable (cycle, BigInt) → event-invalid'],
    [6, 'summary 499 characters → ok'], [7, 'summary 500 → ok'], [8, 'summary 501 → refused (code frozen by K2)'],
    [9, 'summary with HTML/markdown → stored as plain text (escaped or rejected, K)'], [10, 'event name "" or "A B" → event-invalid'],
  ]) caseTest(sdk, 'EXT-BVA-02', row, title, null, LATER.emit)

  // ---- EXT-BVA-03: event rate (frozen values; the token bucket with a fake clock is C-EXT's) ----
  caseTest(sdk, 'EXT-BVA-03', '1–2', 'the burst is frozen as 10', (mod) => {
    assertFrozenNumber(mod, MEANING.burst, EVENT_LIMITS.burst)
  })
  caseTest(sdk, 'EXT-BVA-03', '5–6', 'the sustained rate is frozen as 30 per minute', (mod) => {
    assertFrozenNumber(mod, MEANING.perMinute, EVENT_LIMITS.perMinute)
  })
  for (const [row, title] of [
    [1, '10 emits at t = 0 → all ok'], [2, '11th at t = 0 → rate-limited'], [3, 'after #1, one emit at t = 2 s → ok'],
    [4, 'after #1, one emit at t = 1.9 s → rate-limited'], [5, 'one emit every 2 s for 2 minutes → all ok'],
    [6, '31 emits spread evenly in 60 s after the burst is spent → the 31st refused'],
    [7, '10 to recipient A and 10 to B at t = 0 → all 20 ok'], [8, 'two contributors, 10 each to A at t = 0 → all 20 ok'],
    [9, 'a refused emit does not consume budget (K)'],
  ]) caseTest(sdk, 'EXT-BVA-03', row, title, null, LATER.emit)

  // ---- EXT-BVA-04: per-call limits (ceilings at registration here; the call path is C-EXT's) ----
  caseTest(sdk, 'EXT-BVA-04', 3, 'argumentBytes declared above the ceiling → tool-invalid; at the ceiling → accepted', (mod) => {
    assertCeiling(mod, 'argumentBytes')
  })
  caseTest(sdk, 'EXT-BVA-04', 3, 'resultBytes declared above the ceiling → tool-invalid; at the ceiling → accepted', (mod) => {
    assertCeiling(mod, 'resultBytes')
  })
  for (const [row, title] of [
    [1, 'argument bytes = declared 1000 → runs'], [2, 'argument bytes 1001 → limit-exceeded, execute not called'],
    [4, 'result bytes = declared R → ok'], [5, 'result bytes R + 1 → contributor-failed'],
    [6, 'returns at T − ε → ok'], [7, 'still running at T → contributor-failed; signal fired'],
  ]) caseTest(sdk, 'EXT-BVA-04', row, title, null, LATER.calls)

  // ---- EXT-EP-03 row 8: the cut length is a frozen limit of the result path (K2 "limits") ----
  caseTest(sdk, 'EXT-EP-03', 8, `a contributor message is cut to ${MESSAGE_MAX_CHARS} characters (frozen value, design §13.5)`, (mod) => {
    assertFrozenNumber(mod, MEANING.message, MESSAGE_MAX_CHARS)
  })

  // ---- EXT-DT-01: emit outcome (vocabulary above; the rules themselves are C-EXT's) ----
  for (const [rule, title] of [
    [1, 'contributor not active → contributor-unavailable'], [2, 'name invalid → event-invalid'], [3, 'size over → payload-too-large'],
    [4, 'no recipient → no-agent'], [5, 'rate over → rate-limited'], [6, 'duplicate pending → duplicate'], [7, 'queue full → queue-full'],
    [8, 'all checks pass → {ok: true, eventId}'], [9, 'same dedupeKey, earlier one acked → ok'], [10, 'same dedupeKey from another contributor → ok'],
    [11, 'connector unloading → registry-closed'], ['all', 'every rule returns a code, never a throw; checks in the frozen precedence order'],
  ]) caseTest(sdk, 'EXT-DT-01', rule, title, null, LATER.emit)

  // ---- EXT-UC-03: containment, quarantine N of M, restore ----
  caseTest(sdk, 'EXT-UC-03', 'K', 'quarantine N of M is frozen: two positive integers, N < M', (mod) => {
    const found = numbersAt(mod, MEANING.quarantine).filter((n) => Number.isInteger(n) && n > 0)
    assert.ok(found.length >= 2, 'quarantine constants: ' + JSON.stringify(found))
    assert.ok(Math.min(...found) < Math.max(...found), 'N must be below M: ' + JSON.stringify(found))
  })
  for (const [row, title, owner] of [
    ['main 1', 'execute throws → contributor-failed with no stack, message or path; others unaffected; one log line', LATER.calls],
    ['main 2', 'failures past N of M → quarantined: unlisted, list_changed, "unknown tool", emit contributor-unavailable, pending retired', LATER.quarantine],
    ['main 3', 'disable + re-enable (or reload) → new registrations listed again', LATER.quarantine],
    ['A1', 'emits that keep failing validation count toward the same quarantine', LATER.quarantine],
    ['E1', 'no connector setting lifts the quarantine; no per-contributor rows in the settings form', LATER.settings],
  ]) caseTest(sdk, 'EXT-UC-03', row, title, null, owner)
}

/**
 * K2-AMEND-1 (DECIDED #W3-2, Equivalence Partitioning: the frozen value, its relation to the
 * separator, the contract texts, core's vendored copy, and public names with 0, 1 and n dots).
 */
export function registerExternalNameCases(sdk) {
  const A = EXTERNAL_NAME_AMEND
  const rule = (row, title, fn) => caseTest(sdk, A.id, row, title, fn)
  const text = (file) => fs.readFileSync(path.join(REPO, file), 'utf8')
  const external = (mod, publicName) => publicName.split(mod[A.name].replaced).join(mod[A.name].replacement)
  rule(1, `${A.name} is exported, frozen, and is exactly {replaced: '.', replacement: '__'}`, (mod) => {
    assert.equal(typeof mod[A.name], 'object', `dsh-connector/tools exports no ${A.name}`)
    assert.ok(Object.isFrozen(mod[A.name]), `${A.name} is not frozen`)
    assert.deepEqual({ ...mod[A.name] }, A.value)
  })
  rule(2, `${A.name}.replaced is the same character as NAMESPACE.separator`, (mod) => {
    assert.equal(mod[A.name]?.replaced, mod.NAMESPACE.separator)
  })
  rule(3, `index.d.ts declares ${A.name} and the README lists it among the exported names`, () => {
    assert.match(text(A.declaration), A.declares)
    const readme = text(A.readme)
    assert.ok(readme.includes(A.readmeExports), 'the README has no exported-names section')
    assert.ok(readme.slice(readme.indexOf(A.readmeExports)).includes(A.name), `the README's exported names do not list ${A.name}`)
  })
  // F-OWN-SCHEMA (design §1.0b row 1): core no longer vendors K2.
  rule(4, 'core carries no generated schema', assertNoGeneratedSchema)
  rule(5, 'a public name with 0, 1 or n dots in its local name maps to a model tool name ([A-Za-z0-9_-]) with each `.` replaced', (mod) => {
    for (const local of A.locals) {
      const publicName = mod.publicNameOf(SHORT_NAMESPACE, local)
      const mapped = external(mod, publicName)
      assert.match(mapped, A.modelName, `${publicName} → ${mapped}`)
      const dots = publicName.split(mod.NAMESPACE.separator).length - 1
      assert.equal(mapped.length, publicName.length + dots * (A.value.replacement.length - A.value.replaced.length), `${publicName}: one extra character per dot`)
    }
  })
}

/** EXT-EP-01 row 9 / EXT-BVA-04 row 3: a finite ceiling exists, is frozen as data, and ceiling + 1 is refused. */
function assertCeiling(mod, key) {
  assert.ok(LIMIT_KEYS.includes(key))
  const ceiling = largestAccepted(mod, key)
  assert.ok(ceiling !== null, `limits.${key} = 1 is refused`)
  assert.ok(Number.isFinite(ceiling), `limits.${key} has no ceiling`)
  assert.ok(isInvalid(mod, definition({ limits: { [key]: ceiling + 1 } })), `limits.${key} = ceiling + 1`)
  assertFrozenNumber(mod, MEANING.limit[key], ceiling)
}
