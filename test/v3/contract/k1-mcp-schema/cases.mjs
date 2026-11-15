/**
 * K1 black-box cases: the freeze of `dsh-connector/mcp-schema` (v3-tasks.md row K1 at
 * `b1295de`). K1 "resolves the K flags in AUTH, NAME, EVT, PLAT, WATCH", and its definition of done
 * is "every K value used by a case is in the module or explicitly left to a task". So the cases are
 * the K-flagged rows of 01-auth-pairing.md, 02-names.md, 04-events-interception.md,
 * 06-watch.md and 11-platform.md, plus the row's own freeze items (tool names and schemas, result
 * envelope, refusal codes, event types, OAuth metadata and error mapping, offer-id format, page
 * limit, retention, "connected", the W2 interfaces, the SDK pins).
 *
 * Techniques: UC, EP, BVA, DT, ST only; each test name carries its case id and row.
 * Level: unit. The module is data, validators and types (design §9.1), so the rows check frozen
 * values against the requirements, and spec-defined shapes against this SDK's own MCP packages.
 * Behaviour rows over HTTP, MCP or a DSH host are `todo`, naming the W2–W4 task that owns them
 * (constants.mjs LATER). AUTH-UC-12 and AUTH-ST-06 are provisional on spike V3-S7c.
 *
 * Expected values come from the requirements, and from the design where a requirement defers to it
 * (D§n). Export names are K1's, so values are found by meaning (schema-module.mjs). Assumed
 * contract (see the K1 case questions): a K decision with no value of its own is written in the
 * module's text under its case id; a duration's unit is in its key's name.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  ABSENT_TOOL_WORDS, ABSENT_TOOLS, ADVICE, APPROVAL_PATHS, AUTH_CODES, CC_EXTENSION, CHAIN_CAP, CIMD_MAX_BYTES, CONNECTOR_MANIFEST, CORE_TOOLS,
  DURATION_S, ERROR_STATUS, EVENT_TYPES, EVENTS_URI, FAILURE_LIMIT_MEANING, FAILURE_LIMITER, FIELDS, IDS, INSTANT, INTERFACES, LATER, MAX_QUEUED_DEFAULT, MCP, MEANING, METADATA,
  NAME_MAX_CHARS, NO_NOTIFY, OAUTH_ERRORS, OFFER_ID, PAIR_RESULT, PATHS, PORT_RANGE, PROTOCOL_VERSION, RECORDED, REFUSAL, SCHEMA_MODULE, SCOPE,
  SCOPE_HINT, SECONDS_EPSILON, STOCK_TOKEN_REQUESTS_PER_FAILED_CALL, TOKEN_STORE, TOOL_CODES, UNITS, WELL_KNOWN, ENTRY_OK, WITHDRAWN_TOKEN_CODES,
} from './constants.mjs'
import { model } from '../k3-host-services/declarations.mjs'
import {
  allPropertyNames, allText, exportedRegExps, exportedStrings, exportedStringsAndKeys, folderTexts, hasListEqualTo, leaves, mcpClient, mcpClientVersion, mcpCore, numbersAt,
  readManifest, rootPropertyNames, schemaModule, secondsAt, statusesFor, toolDefinitions, toolsModule, validatorFor, walk,
} from './schema-module.mjs'

/**
 * One test per case row, named "<case id> row <n> [SDK x] <partition>"; `todo` names the owning task.
 * A body with one parameter gets the module; with none it runs on the SDK oracle alone.
 */
export function caseTest(sdk, id, row, title, fn, todo) {
  const name = `${id} row ${row} [SDK ${sdk}] ${title}`
  if (todo !== undefined) test.todo(`${name} — TODO ${todo}`)
  else test(name, async () => (fn.length === 0 ? fn() : fn(await schemaModule(sdk))))
}
/** A list of rows that only a later task can run. */
export const todos = (sdk, id, owner, rows) => { for (const [row, title] of rows) caseTest(sdk, id, row, title, null, owner) }

const assertExported = (mod, values, what, strings = exportedStrings(mod)) => {
  assert.deepEqual(values.filter((v) => !strings.has(v)), [], `${what}: not exported as data by ${SCHEMA_MODULE.specifier}`)
}
/** A frozen duration of the module at a path that means `meaning`, equal to `seconds` in its own unit. */
const assertDuration = (mod, meaning, seconds, what) => {
  const found = secondsAt(mod, meaning)
  assert.ok(found.some((l) => Math.abs(l.seconds - seconds) < SECONDS_EPSILON), `${what}: no exported duration of ${seconds} s; found ${JSON.stringify(found)}`)
}
const assertNumber = (mod, meaning, expected, what) => {
  const found = numbersAt(mod, meaning).map((l) => l.value)
  assert.ok(found.includes(expected), `${what}: no exported value ${expected}; found ${JSON.stringify(found)}`)
}
/** A positive integer frozen at `meaning` (a K value the requirements leave to the freeze); returns them all. */
const frozenPositive = (mod, meaning, what) => {
  const found = numbersAt(mod, meaning).map((l) => l.value).filter((v) => Number.isSafeInteger(v) && v > 0)
  assert.ok(found.length > 0, `${what}: no positive integer frozen`)
  return found
}
/** A K decision with no value: its case id and row are written in the module's text (README, freeze record). */
const assertRecorded = (id, row) => {
  const text = allText()
  assert.ok(text.includes(id), `${id} (row ${row}) is not recorded in ${SCHEMA_MODULE.folder}`)
}

/** The tool definitions (name → definition), required non-empty. */
const tools = (mod) => {
  const defs = toolDefinitions(mod)
  assert.ok(defs.size > 0, 'no tool definition (an object with an inputSchema) is exported')
  return defs
}
/** A tool's definition, required to exist. */
const toolDef = (mod, name) => {
  const def = tools(mod).get(name)
  assert.ok(def, `no frozen definition for the tool ${name}`)
  return def
}
/** `pair`'s output schema, compiled by this SDK's client validator. */
const pairOutput = async (sdk, mod) => {
  const def = toolDef(mod, mod.TOOL.pair)
  assert.ok(def.outputSchema, 'pair has no outputSchema')
  return (await validatorFor(sdk))(def.outputSchema)
}

/** Fishball ids: the frozen validator is the exported RegExp that accepts row 1 and refuses row 2a. */
const idPattern = (mod) => exportedRegExps(mod).find((re) => IDS.accepted.every((id) => re.test(id)) && !re.test(IDS.refused[0]))

/** K1a: the declaration file's text, required to exist. */
export const declarationText = () => {
  const file = path.join(SCHEMA_MODULE.folder, SCHEMA_MODULE.declarations)
  const text = folderTexts(SCHEMA_MODULE.codeFile).get(file)
  assert.ok(text !== undefined, 'no ' + file)
  return [file, text]
}
const isPositiveInteger = (v) => Number.isSafeInteger(v) && v > 0
/**
 * K1a: does one exported constant hold the whole failure limit by its own keys? A per-key and a
 * per-address ceiling (positive integers), a window with a unit in its key, and a string list of key
 * parts naming the remote address and the client id.
 */
const holdsFailureLimit = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const entries = Object.entries(value)
  const hasUnit = (k) => UNITS.some(([re]) => re.test(k))
  // A ceiling is a count, so its key has no unit; the window is the one with a unit.
  const ceiling = (re) => entries.some(([k, v]) => re.test(k) && !hasUnit(k) && isPositiveInteger(v))
  const window = entries.some(([k, v]) => FAILURE_LIMIT_MEANING.window.test(k) && hasUnit(k) && v > 0)
  const parts = entries.some(([, v]) => Array.isArray(v) && FAILURE_LIMIT_MEANING.keyParts.every((re) => v.some((p) => typeof p === 'string' && re.test(p))))
  return ceiling(FAILURE_LIMIT_MEANING.perKey) && ceiling(FAILURE_LIMIT_MEANING.perAddress) && window && parts
}

export function registerK1Cases(sdk) {
  // ======================================================================================
  // The module itself (K1 row: what is frozen; SDK pins)
  // ======================================================================================
  caseTest(sdk, 'PLAT-EP-02', 'K1', `${SCHEMA_MODULE.specifier} resolves and loads on this SDK`, (mod) => {
    assert.ok(Object.keys(mod).length > 0, 'the module exports nothing')
  })
  caseTest(sdk, 'PLAT-EP-02', 'K1', `the SDK pins: ${MCP.node} exactly ${MCP.nodePin}, ${MCP.server} exactly on the hosts' 2.2.x client line`, () => {
    const deps = readManifest(CONNECTOR_MANIFEST).dependencies ?? {}
    assert.equal(deps[MCP.node], MCP.nodePin)
    assert.match(deps[MCP.server] ?? '', MCP.exactVersion, 'the server SDK is not pinned to one exact version')
    const [major, minor] = mcpClientVersion(sdk).split('.')
    assert.deepEqual(deps[MCP.server].split('.').slice(0, 2), [major, minor], 'server line differs from this SDK\'s client ' + mcpClientVersion(sdk))
  })
  caseTest(sdk, 'PLAT-UC-01', 'K1', `the served protocol revision is ${PROTOCOL_VERSION}, the same value K2 froze`, async (mod) => {
    assertExported(mod, [PROTOCOL_VERSION], 'protocol revision')
    assert.ok(exportedStrings(await toolsModule(sdk)).has(PROTOCOL_VERSION), 'K2 no longer freezes ' + PROTOCOL_VERSION)
  })
  caseTest(sdk, 'PLAT-EP-02', 'K1', 'the internal W2 interfaces are typed in the module (bearer verifier, token registry, pair store, mailbox commit/poll/ack, router recipientFor)', () => {
    const text = allText(SCHEMA_MODULE.codeFile)
    assert.deepEqual(INTERFACES.filter(([, re]) => !re.test(text)).map(([what]) => what), [], 'interfaces missing from the module\'s code files')
  })

  // ======================================================================================
  // PLAT-EP-02 (K: names D§3.2) and WATCH: core tool set, schemas, result envelope
  // ======================================================================================
  caseTest(sdk, 'PLAT-EP-02', '1–2', 'every core tool of R-CON-02 is frozen under its design §3.2 name', (mod) => {
    const names = tools(mod)
    assert.deepEqual(CORE_TOOLS.filter((n) => !names.has(n)), [])
  })
  caseTest(sdk, 'PLAT-EP-02', '3–4', 'no watch tool and no attention tool is frozen (R-WATCH-03, R-EXT-13); WATCH-UC-03 main', (mod) => {
    const names = [...tools(mod).keys()]
    assert.deepEqual(names.filter((n) => ABSENT_TOOLS.includes(n) || ABSENT_TOOL_WORDS.test(n)), [])
  })
  caseTest(sdk, 'PLAT-EP-02', '1–4', 'every frozen tool definition is a valid MCP Tool for this SDK (name rule, object input schema)', async (mod) => {
    const core = await mcpCore(sdk)
    const bad = [...tools(mod)].filter(([, def]) => !core.ToolSchema.safeParse(def).success).map(([n]) => n)
    assert.deepEqual(bad, [])
  })
  caseTest(sdk, 'PLAT-EP-02', 6, 'every frozen tool has an outputSchema, and it admits the refusal envelope {ok: false, code, message} (R-CON-02)', async (mod) => {
    const validate = await validatorFor(sdk)
    const missing = []
    const refusing = []
    for (const [n, def] of tools(mod)) {
      if (!def.outputSchema) missing.push(n)
      else if (!validate(def.outputSchema)({ ...REFUSAL, code: mod.REFUSAL.limitExceeded })) refusing.push(n)
    }
    assert.deepEqual({ missing, refusing }, { missing: [], refusing: [] })
  })
  caseTest(sdk, 'PLAT-EP-02', 5, 'the shared refusal codes of the core tools are frozen (limit-exceeded, expired, queue-full, already-settled, …)', (mod) => {
    assertExported(mod, TOOL_CODES, 'tool refusal codes')
  })
  caseTest(sdk, 'WATCH-UC-01', 'E1', 'session_start and session_message have no notifyWhenFinished argument and refuse unknown arguments (TQ-12)', async (mod) => {
    const validate = await validatorFor(sdk)
    for (const n of [mod.TOOL.sessionStart, mod.TOOL.sessionMessage]) {
      const schema = toolDef(mod, n).inputSchema
      assert.ok(!allPropertyNames(schema).has(NO_NOTIFY.argument), n + ' declares ' + NO_NOTIFY.argument)
      assert.equal(schema.additionalProperties, false, n + ' does not refuse unknown arguments, so notifyWhenFinished would pass')
      assert.equal(validate(schema)({ [NO_NOTIFY.argument]: true }), false, n + ' accepts ' + NO_NOTIFY.argument)
    }
  })
  todos(sdk, 'PLAT-EP-02', LATER.tools, [
    ['4a', 'session_read / sessions_list of a session another principal manages → forbidden / omitted'],
    ['5', 'any refusal over MCP: isError true, structuredContent and the same JSON as a text block'],
    ['6', 'any success over MCP: isError false, structuredContent plus the same JSON as text'],
  ])
  todos(sdk, 'WATCH-UC-03', LATER.tools, [['E1', 'a tools/call to each removed watch tool → the MCP "unknown tool" error']])
  todos(sdk, 'WATCH-UC-01', LATER.route, [['E1', 'session_start with notifyWhenFinished over MCP → isError, invalid-arguments, nothing started']])
  todos(sdk, 'WATCH-ST-01', LATER.route, [['1–8', 'watch follows management (start, hand over, release, take back, revoke, succession)']])

  // ======================================================================================
  // AUTH-UC-02 (P:S7, K) and NAME-DT-01: the pair result shapes
  // ======================================================================================
  caseTest(sdk, 'AUTH-UC-02', 5, 'pair\'s output schema admits {ok, paired, id, name: null} (no default name, NAME-DT-01 rule 1)', async (mod) => {
    assert.ok((await pairOutput(sdk, mod))(PAIR_RESULT.nameless))
  })
  caseTest(sdk, 'AUTH-UC-02', 'A1', 'pair\'s output schema admits a named result with nameAssigned: true (NAME-DT-01 rules 2, 5)', async (mod) => {
    assert.ok((await pairOutput(sdk, mod))(PAIR_RESULT.named))
  })
  caseTest(sdk, 'NAME-DT-01', '3–4', 'pair\'s output schema admits name: null, nameAssigned: false, nameRefused name-taken / name-invalid (R-NAME-06)', async (mod) => {
    const check = await pairOutput(sdk, mod)
    for (const result of PAIR_RESULT.refused) assert.ok(check(result), result.nameRefused)
  })
  caseTest(sdk, 'NAME-DT-01', 1, 'pair\'s output schema has the R-NAME-06 fields (nameAssigned, nameRefused); "absent" for rule 1 is K', async (mod) => {
    const names = rootPropertyNames(toolDef(mod, mod.TOOL.pair).outputSchema)
    for (const f of ['ok', 'paired', 'id', 'name', 'nameAssigned', 'nameRefused', 'code', 'bound', 'advice']) assert.ok(names.has(f), f)
  })
  caseTest(sdk, 'AUTH-UC-04', 2, 'pair\'s output schema admits already-paired with bound {idMatches, boundId, name, pairedAt, lastSeenAt} and advice (R-ID-04)', async (mod) => {
    const check = await pairOutput(sdk, mod)
    const form = [INSTANT.iso, INSTANT.epochMs].find((t) => check({ ...PAIR_RESULT.alreadyPaired, bound: { ...PAIR_RESULT.alreadyPaired.bound, pairedAt: t, lastSeenAt: t }, advice: mod.PAIR_ADVICE.idMatches }))
    assert.ok(form !== undefined, 'no timestamp form (ISO string or epoch ms) is admitted for pairedAt / lastSeenAt')
  })
  caseTest(sdk, 'AUTH-UC-04', 'A1', 'the two fixed advice texts of R-ID-04 are frozen', (mod) => {
    assertExported(mod, [ADVICE.idMatches, ADVICE.idMismatch], 'advice')
  })
  caseTest(sdk, 'AUTH-UC-04', 'A3', 'pair\'s output schema admits {ok: false, code: id-taken} (R-ID-13)', async (mod) => {
    assert.ok((await pairOutput(sdk, mod))(PAIR_RESULT.idTaken))
  })
  caseTest(sdk, 'AUTH-UC-02', 'K', 'the pairing codes and settings refusals are frozen (already-paired, id-taken, id-invalid, name-*, token-duplicate, approval-port-in-use; K1d)', (mod) => {
    assertExported(mod, AUTH_CODES, 'pairing codes and refusals')
  })
  caseTest(sdk, 'AUTH-UC-02', 'K (K1d)', `the entry status is ok only, and no withdrawn token code is exported (${WITHDRAWN_TOKEN_CODES.join(', ')})`, (mod) => {
    assert.deepEqual(Object.values(mod.ENTRY_STATUS), [ENTRY_OK])
    const strings = exportedStringsAndKeys(mod)
    assert.deepEqual(WITHDRAWN_TOKEN_CODES.filter((c) => strings.has(c)), [], 'a withdrawn code is still exported')
  })
  caseTest(sdk, 'AUTH-UC-02', 4, `the two scopes, ${SCOPE.full} and ${SCOPE.pair}, and the ${CC_EXTENSION} extension are frozen (R-OA-04, R-OA-09)`, (mod) => {
    assertExported(mod, [SCOPE.full, SCOPE.pair, CC_EXTENSION], 'scopes and extension')
  })
  caseTest(sdk, 'AUTH-UC-02', 'E3', 'the 403 error_description hints not-paired and id-mismatch are frozen (R-ID-06)', (mod) => {
    assertExported(mod, Object.values(SCOPE_HINT), 'insufficient_scope hints')
  })
  todos(sdk, 'AUTH-UC-02', LATER.pair, [
    ['1–6', 'first authentication and pair over HTTP and MCP (401 challenge, metadata, pair-only token, pair, full power)'],
    ['E1–E3', 'no id → invalid_client; pair race → one binds; session_start before pair → 403 not-paired'],
  ])

  // ======================================================================================
  // OAuth metadata and error mapping (K1 row; AUTH-UC-08, AUTH-EP-01 rows 5–6, AUTH-EP-02 row 11)
  // ======================================================================================
  caseTest(sdk, 'AUTH-UC-08', 'K1', 'the endpoint paths are frozen: MCP, issuer and token endpoint (D§5.5)', (mod) => {
    assertExported(mod, Object.values(PATHS), 'paths')
  })
  caseTest(sdk, 'AUTH-UC-08', 'K1', 'the approval listener serves only /authorize and /authorize/decision (D§5.5a, R-OA-20)', (mod) => {
    assertExported(mod, Object.values(APPROVAL_PATHS), 'approval paths')
  })
  caseTest(sdk, 'AUTH-UC-08', 'main', 'the SDK\'s discovery URL for the frozen issuer is the path-inserted RFC 8414 one (R-OA-01)', async (mod) => {
    const client = await mcpClient(sdk)
    const [first] = client.buildDiscoveryUrls(new URL(mod.PATHS.issuer, WELL_KNOWN.base))
    assert.equal(first.url.pathname, WELL_KNOWN.server + mod.PATHS.issuer)
  })
  caseTest(sdk, 'AUTH-UC-08', 'main', 'the AS metadata lists are frozen: grants, response types, S256, auth methods, scopes (R-OA-02)', (mod) => {
    for (const what of ['grantTypes', 'responseTypes', 'challengeMethods', 'authMethods', 'asScopes']) {
      assert.ok(hasListEqualTo(mod, METADATA[what]), `${what}: no exported list equal to ${JSON.stringify(METADATA[what])}`)
    }
  })
  caseTest(sdk, 'AUTH-UC-08', 'main', 'the protected-resource metadata lists are frozen: bearer in the header only, scopes_supported [fishball] (R-OA-01)', (mod) => {
    assert.ok(hasListEqualTo(mod, METADATA.bearerMethods), 'bearer_methods_supported')
    assert.ok(hasListEqualTo(mod, METADATA.resourceScopes), 'scopes_supported')
  })
  caseTest(sdk, 'AUTH-UC-08', 'main', 'the AS metadata flags CIMD and iss support as true, and nothing names offline_access in a scope list (R-OA-02)', (mod) => {
    const flags = new Map()
    walk(mod, (value, keys) => { if (METADATA.trueFlags.includes(keys.at(-1))) flags.set(keys.at(-1), value) })
    for (const f of METADATA.trueFlags) assert.equal(flags.get(f), true, f)
    assert.ok(!exportedStrings(mod).has('offline_access'), 'offline_access is exported')
  })
  caseTest(sdk, 'AUTH-UC-08', 'E1', 'no registration endpoint is frozen (R-OA-13: no dynamic client registration)', (mod) => {
    const keys = []
    walk(mod, (_v, k) => keys.push(k.at(-1)))
    assert.deepEqual(keys.filter((k) => METADATA.forbiddenKey.test(k)), [])
  })
  caseTest(sdk, 'AUTH-EP-01', '3–10', 'the OAuth error codes the cases name are frozen and are the spec\'s codes in this SDK', async (mod) => {
    const spec = new Set(Object.values((await mcpClient(sdk)).OAuthErrorCode))
    assert.deepEqual(OAUTH_ERRORS.filter((c) => !spec.has(c)), [], 'the cases name a code the SDK does not know')
    assertExported(mod, OAUTH_ERRORS, 'OAuth error codes', exportedStringsAndKeys(mod))
  })
  caseTest(sdk, 'AUTH-EP-01', 'K1', 'the error mapping gives invalid_client and invalid_token HTTP 401, insufficient_scope 403 (R-OA-03, R-TOK-01, R-ID-06)', (mod) => {
    for (const [code, status] of Object.entries(ERROR_STATUS)) assert.ok(statusesFor(mod, code).includes(status), `${code} → ${status}; found ${statusesFor(mod, code)}`)
  })
  for (const [id, row, what] of RECORDED.filter(([id]) => id === 'AUTH-EP-01' || id === 'AUTH-EP-02')) caseTest(sdk, id, row, `K recorded: ${what}`, () => assertRecorded(id, row))
  todos(sdk, 'AUTH-EP-01', LATER.oauth, [['1–11', 'token endpoint request classes over HTTP (basic, post, grants, resource, query secret, no auth)']])
  todos(sdk, 'AUTH-EP-02', LATER.http, [['1–14', 'bearer value classes at the MCP endpoint (401s byte-identical, query tokens refused)']])
  todos(sdk, 'AUTH-UC-08', LATER.oauth, [['main, A1, A2, E1', 'the stock ClientCredentialsProvider end to end; issuer pinning; per-host issuer; audience']])

  // ======================================================================================
  // AUTH-EP-03 (unit rows) and AUTH-BVA-02: the fishball id validator (R-ID-02)
  // ======================================================================================
  caseTest(sdk, 'AUTH-EP-03', '1–2', 'the frozen id pattern accepts letters and every allowed character', (mod) => {
    const re = idPattern(mod)
    assert.ok(re, 'no exported RegExp accepts abc and Az_09- and refuses fb.1')
    for (const id of IDS.accepted) assert.ok(re.test(id), id)
  })
  caseTest(sdk, 'AUTH-EP-03', '2a–6', 'the frozen id pattern refuses a dot, space, / : @, non-ASCII and a control character', (mod) => {
    const re = idPattern(mod)
    assert.ok(re, 'no frozen id pattern')
    assert.deepEqual(IDS.refused.filter((id) => re.test(id)), [])
  })
  for (const [row, length, accepted] of [[1, 0, false], [2, 1, true], [3, 2, true], [4, IDS.maxChars - 1, true], [5, IDS.maxChars, true], [6, IDS.maxChars + 1, false]]) {
    caseTest(sdk, 'AUTH-BVA-02', row, `id length ${length} → ${accepted ? 'accepted' : 'refused'}`, (mod) => {
      const re = idPattern(mod)
      assert.ok(re, 'no frozen id pattern')
      assert.equal(re.test(IDS.pad.repeat(length)), accepted)
    })
  }
  caseTest(sdk, 'AUTH-BVA-02', 7, 'id of 64 characters including one dot → refused (dot, not length)', (mod) => {
    const re = idPattern(mod)
    assert.ok(re, 'no frozen id pattern')
    assert.equal(re.test(IDS.pad.repeat(IDS.maxChars - 1) + IDS.dot), false)
  })
  todos(sdk, 'AUTH-EP-03', LATER.oauth, [['1–9', 'id classes at the token endpoint (invalid_client), case sensitivity, id-taken, one principal']])

  // AUTH-BVA-03 rows 1–7 (the user-set token length) are withdrawn by design §5.9 (requirements
  // 1.27: every value is generated; no length rule). The generated value's form is k1d-amendments' row.

  // ======================================================================================
  // Durations: access token, code, pending request, grace window, chain, retention, lastSeenAt
  // ======================================================================================
  caseTest(sdk, 'AUTH-BVA-01', '1–8', `the access-token lifetime is frozen as ${DURATION_S.accessToken} s (R-OA-07)`, (mod) => {
    assertDuration(mod, MEANING.accessToken, DURATION_S.accessToken, 'access token')
  })
  caseTest(sdk, 'AUTH-BVA-07', '1–3', `the code lifetime is frozen as ${DURATION_S.code} s (R-OA-14, K)`, (mod) => {
    assertDuration(mod, MEANING.code, DURATION_S.code, 'code')
  })
  caseTest(sdk, 'AUTH-BVA-07', '4–6', `the pending-request lifetime is frozen as ${DURATION_S.pending} s (R-OA-15, K)`, (mod) => {
    assertDuration(mod, MEANING.pending, DURATION_S.pending, 'pending request')
  })
  caseTest(sdk, 'AUTH-BVA-08', '1–6', `the refresh grace window is frozen as ${DURATION_S.grace} s (R-OA-16 (4a), K)`, (mod) => {
    assertDuration(mod, MEANING.grace, DURATION_S.grace, 'grace window')
  })
  // Rewritten by K1d (R-OA-23, 1.32 R14; DECIDED #18 reversed): the row used to require a frozen
  // maximum chain lifetime (R-OA-16 (5)); now no chain lifetime exists and the README records why.
  caseTest(sdk, 'AUTH-ST-05', 'K', `no refresh-chain lifetime is frozen: no exported duration names a chain, LIFETIME has no ${CHAIN_CAP.withdrawn} (R-OA-23)`, (mod) => {
    assert.deepEqual(secondsAt(mod, MEANING.chain), [], 'a chain lifetime is still exported')
    assert.equal(Object.hasOwn(mod.LIFETIME, CHAIN_CAP.withdrawn), false)
  })
  caseTest(sdk, 'AUTH-ST-05', 'K (record)', `the README records the withdrawal: ${CHAIN_CAP.withdrawn} withdrawn under ${CHAIN_CAP.requirement}`, () => {
    const rows = [...folderTexts(CHAIN_CAP.readme).values()].join('\n').split('\n').filter((line) => line.includes(CHAIN_CAP.withdrawn))
    assert.ok(rows.some((line) => line.includes(CHAIN_CAP.requirement) && CHAIN_CAP.withdrawnWord.test(line)), `no README line says ${CHAIN_CAP.withdrawn} is withdrawn under ${CHAIN_CAP.requirement}`)
  })
  caseTest(sdk, 'AUTH-DT-04', '5–8', 'the disabled-entry retention is frozen as 30 days (R-TOK-05)', (mod) => {
    assertDuration(mod, MEANING.retention, DURATION_S.retention, 'retention')
  })
  caseTest(sdk, 'AUTH-BVA-05', '1–3', `the lastSeenAt write bound is frozen as ${DURATION_S.lastSeen} s (D§5.8, K)`, (mod) => {
    assertDuration(mod, MEANING.lastSeen, DURATION_S.lastSeen, 'lastSeenAt bound')
  })
  todos(sdk, 'AUTH-BVA-01', LATER.oauth, [['1–8', 'requests at t0 … t0 + 3601 with a fake clock; re-authentication at expiry; no extension by use']])
  // AUTH-BVA-07, AUTH-BVA-08, AUTH-ST-05, AUTH-DT-09 rows 1–7, AUTH-EP-08, AUTH-ST-04 and AUTH-DT-08 run in test/v3/dsh-connector/oauth-web.
  todos(sdk, 'AUTH-BVA-05', LATER.pair, [['1–5', 'lastSeenAt at 0 / 59 / 60 s after the last write, after pairing, on a 401']])
  todos(sdk, 'AUTH-DT-04', 'C-REVOKE (revocation effects by item kind)', [['1–12', 'disable / delete effects on streams, offers, sessions, queued events, the designated role, ATs']])
  todos(sdk, 'AUTH-UC-06', 'C-REVOKE (revocation effects by item kind)', [['main, A1–A4, E1', 'disable, delete, value change and 30-day expiry of a designated principal']])

  // ======================================================================================
  // AUTH-BVA-06 (K, P:S7): token-endpoint rate limit; AUTH-DT-09 (K): approval port; AUTH-EP-08 (K): CIMD
  // ======================================================================================
  caseTest(sdk, 'AUTH-BVA-06', 6, `the frozen per-client token-request LIMIT is ≥ ${STOCK_TOKEN_REQUESTS_PER_FAILED_CALL}, with a window (rows 3–5)`, (mod) => {
    const limits = frozenPositive(mod, MEANING.rate, 'rate limit')
    assert.ok(limits.some((v) => v >= STOCK_TOKEN_REQUESTS_PER_FAILED_CALL), 'every frozen limit trips the stock client: ' + limits)
    assert.ok(secondsAt(mod, MEANING.rateWindow).some((l) => l.seconds > 0), 'no rate window frozen with a unit in its name')
  })
  todos(sdk, 'AUTH-BVA-06', LATER.oauth, [['1–5, 7', '1, 2, LIMIT, LIMIT + 1 requests per window; the next window; authorization_code counted alike']])
  caseTest(sdk, 'AUTH-DT-09', 1, 'a fixed default approval port is frozen, a valid TCP port (R-OA-20, Q-OA-7 A, K)', (mod) => {
    const ports = frozenPositive(mod, MEANING.approvalPort, 'approval port')
    assert.ok(ports.every((p) => p >= PORT_RANGE.min && p <= PORT_RANGE.max), 'not a TCP port: ' + ports)
    assert.equal(new Set(ports).size, 1, 'more than one default approval port: ' + ports)
  })
  for (const [id, row, what] of RECORDED.filter(([id]) => id.startsWith('AUTH-'))) {
    if (id !== 'AUTH-EP-01' && id !== 'AUTH-EP-02') caseTest(sdk, id, row, `K recorded: ${what}`, () => assertRecorded(id, row))
  }
  caseTest(sdk, 'AUTH-EP-08', 6, `the CIMD body limit is frozen as ${CIMD_MAX_BYTES} bytes (R-OA-13, decided per spec)`, (mod) => {
    assertNumber(mod, MEANING.cimd, CIMD_MAX_BYTES, 'CIMD size')
  })
  caseTest(sdk, 'AUTH-EP-08', 6, 'a CIMD fetch time bound is frozen (K)', (mod) => {
    assert.ok(secondsAt(mod, MEANING.cimdTime).some((l) => l.seconds > 0), 'no CIMD time bound frozen with a unit in its name')
  })
  // AUTH-EP-04 rows 1 and 8 run in test/v3/dsh-connector/tokens (rows 2–7a withdrawn, design §5.9).
  todos(sdk, 'AUTH-EP-05', LATER.oauth, [['1–6', 'uniform invalid_client on failures; 100 failures; constant-time comparator']])

  // ======================================================================================
  // K1a (R-OA-17): one failure limit shared by the token endpoint and the approval page
  // ======================================================================================
  caseTest(sdk, 'K1a', 1, 'exactly one exported constant holds the failure limit (per-key and per-address ceilings, a window with a unit, key parts address + client id), and RATE_LIMITS carries no failure field', (mod) => {
    const holders = Object.entries(mod).filter(([, v]) => holdsFailureLimit(v)).map(([k]) => k)
    assert.equal(holders.length, 1, 'constants holding a failure limit: ' + JSON.stringify(holders))
    const rate = mod[FAILURE_LIMIT_MEANING.rateConstant]
    assert.ok(rate && typeof rate === 'object', FAILURE_LIMIT_MEANING.rateConstant + ' is not exported')
    assert.deepEqual(Object.keys(rate).filter((k) => FAILURE_LIMIT_MEANING.failure.test(k)), [], FAILURE_LIMIT_MEANING.rateConstant + ' still carries failure fields')
  })
  caseTest(sdk, 'K1a', 2, 'no second failure ceiling exists in the module: every number named after failures is in the one constant', (mod) => {
    const [holder] = Object.entries(mod).filter(([, v]) => holdsFailureLimit(v)).map(([k]) => k)
    assert.ok(holder, 'no constant holds the failure limit')
    const outside = leaves(mod).filter((l) => typeof l.value === 'number' && FAILURE_LIMIT_MEANING.failure.test(l.path) && l.path.split('.')[0] !== holder)
    assert.deepEqual(outside.map((l) => l.path), [])
  })
  caseTest(sdk, 'K1a', 3, `${SCHEMA_MODULE.declarations} declares ${FAILURE_LIMITER.name} (check, record a failure) and names ${TOKEN_STORE.owner} the owner of the one ${TOKEN_STORE.name} implementation, durable ${TOKEN_STORE.durable} included`, () => {
    const [file, text] = declarationText()
    const { members } = model(new Map([[file, text]]))
    const limiter = [...members(FAILURE_LIMITER.name).values()]
    assert.ok(limiter.some((m) => m.method && m.name === FAILURE_LIMITER.check), FAILURE_LIMITER.name + ' has no ' + FAILURE_LIMITER.check + ' method')
    assert.ok(limiter.some((m) => m.method && FAILURE_LIMITER.record.test(m.name)), FAILURE_LIMITER.name + ' has no record-failure method')
    const put = members(TOKEN_STORE.name).get(TOKEN_STORE.durable)
    assert.ok(put?.method && TOKEN_STORE.promise.test(put.returns), TOKEN_STORE.name + '.' + TOKEN_STORE.durable + ' is not a durable (Promise) write')
    // One sentence of a comment names the implementation, its owner (C-OAUTH, not C-OAUTH-WEB) and putRefresh.
    const owner = new RegExp(String.raw`\b${TOKEN_STORE.owner}(?!-)`)
    const sentences = (text.match(/\/\*[\s\S]*?\*\//g) ?? []).flatMap((c) => c.split(/\.\s/))
    assert.ok(sentences.some((c) => c.includes(TOKEN_STORE.name) && c.includes(TOKEN_STORE.durable) && TOKEN_STORE.implementation.test(c) && owner.test(c)),
      'no comment names ' + TOKEN_STORE.owner + ' as the owner of the one ' + TOKEN_STORE.name + ' implementation with ' + TOKEN_STORE.durable)
  })

  // ======================================================================================
  // Provisional on spike V3-S7c (P:S7c)
  // ======================================================================================
  todos(sdk, 'AUTH-UC-12', LATER.adapter, [
    ['main 1–5', 'a dsh-mcp-client row authorizes through the adapter and refreshes single-flight across lifetimes'],
    ['A1–A2', 'connector restart and DSH N restart: refresh with the persisted refresh token, no browser step'],
    ['E1–E3', 'entry disabled → invalid_grant reported once; cancel; adapter disabled'],
    ['post', 'only standard OAuth at M; no token or verifier in N\'s row config, logs or pages; no host patch'],
  ])
  todos(sdk, 'AUTH-ST-06', LATER.adapter, [
    ['1–4', 'Unauthorized → Authorizing → Connected; wrong iss or state; access_denied'],
    ['5–9', 'Connected → Refreshing (single-flight) → Connected / NeedsAuthorization; 401 after a connector restart'],
    ['10', 'adapter disabled → Stopped; nothing written to the row config'],
  ])

  // ======================================================================================
  // NAME-EP-01 rows 11–12, NAME-BVA-01 (K: code points after NFC)
  // ======================================================================================
  caseTest(sdk, 'NAME-BVA-01', '5–6', `the name maximum is frozen as ${NAME_MAX_CHARS} characters (R-NAME-02)`, (mod) => {
    assertNumber(mod, MEANING.nameMax, NAME_MAX_CHARS, 'name maximum')
  })
  for (const [id, row, what] of RECORDED.filter(([id]) => id.startsWith('NAME-'))) caseTest(sdk, id, row, `K recorded: ${what}`, () => assertRecorded(id, row))
  todos(sdk, 'NAME-BVA-01', LATER.pair, [['1–10', 'name lengths 0, 1, 2, 63, 64, 65 and the normalisation edges (trim, inner runs, NFD → NFC)']])
  todos(sdk, 'NAME-EP-01', LATER.pair, [['1–12', 'name normalisation and validity classes through set_name / pair']])
  todos(sdk, 'NAME-DT-01', LATER.pair, [['1–5', 'pair({name?}) outcomes over MCP']])

  // ======================================================================================
  // EVT: event types (R-EVS-02), mailbox shapes, page limit (EVT-BVA-01, K), capacity (EVT-BVA-02, K)
  // ======================================================================================
  caseTest(sdk, 'EVT-EP-01', '1–15', 'the event type vocabulary of R-EVS-02 is frozen, plus K2\'s contributed: prefix', async (mod) => {
    assertExported(mod, EVENT_TYPES, 'event types')
    const k2 = exportedStrings(await toolsModule(sdk))
    assert.ok([...exportedStrings(mod)].some((s) => s.endsWith(':') && k2.has(s)), 'the contributed event prefix is not the one K2 froze')
  })
  caseTest(sdk, 'EVT-UC-01', 'main', `the event resource URI ${EVENTS_URI} is frozen (R-EVS-01)`, (mod) => {
    assertExported(mod, [EVENTS_URI], 'event resource')
  })
  caseTest(sdk, 'EVT-UC-01', 3, 'inbox_poll\'s schemas carry cursor and limit in, events, hasMore and resync out; an event carries eventId, type, payloadDigest (D§3.4)', (mod) => {
    const poll = toolDef(mod, mod.TOOL.inboxPoll)
    const inNames = allPropertyNames(poll.inputSchema)
    const outNames = allPropertyNames(poll.outputSchema)
    assert.deepEqual(FIELDS.pollArgs.filter((f) => !inNames.has(f)), [], 'inbox_poll input')
    assert.deepEqual([...FIELDS.poll, ...FIELDS.event].filter((f) => !outNames.has(f)), [], 'inbox_poll output')
  })
  caseTest(sdk, 'EVT-EP-02', 6, 'the dsh-agent://events summary is {pending, headSequence, mailboxGeneration}, frozen by name (D§3.3)', (mod) => {
    const text = allText()
    assert.deepEqual(FIELDS.summary.filter((f) => !text.includes(f)), [])
  })
  caseTest(sdk, 'EVT-UC-01', 4, 'inbox_ack\'s input schema admits {receipts: [{eventId, payloadDigest}]} (D§3.4)', async (mod) => {
    assert.ok((await validatorFor(sdk))(toolDef(mod, mod.TOOL.inboxAck).inputSchema)(FIELDS.receipt))
  })
  caseTest(sdk, 'WATCH-UC-01', 2, 'the turn-finished payload says running and queued (R-EVS-02), frozen by name', () => {
    const text = allText()
    assert.deepEqual(FIELDS.turnFinished.filter((f) => !text.includes(f)), [])
  })
  caseTest(sdk, 'EVT-BVA-01', '3–6', 'the poll page LIMIT is frozen, and inbox_poll\'s limit schema accepts 1 and LIMIT', async (mod) => {
    const limits = frozenPositive(mod, MEANING.page, 'page limit')
    const validate = (await validatorFor(sdk))(toolDef(mod, mod.TOOL.inboxPoll).inputSchema)
    const limit = Math.max(...limits)
    assert.ok(validate({ limit: 1 }) && validate({ limit }), 'limit 1 or LIMIT = ' + limit + ' is refused by the schema')
  })
  caseTest(sdk, 'EVT-BVA-02', '1–4', `maxQueuedInputs defaults to ${MAX_QUEUED_DEFAULT} in the module (D§3.4, K)`, (mod) => {
    assertNumber(mod, MEANING.queued, MAX_QUEUED_DEFAULT, 'maxQueuedInputs')
  })
  for (const [id, row, what] of RECORDED.filter(([id]) => id.startsWith('EVT-'))) caseTest(sdk, id, row, `K recorded: ${what}`, () => assertRecorded(id, row))
  todos(sdk, 'EVT-BVA-01', LATER.mailbox, [['1–7', 'poll pages of 0, 1, LIMIT, LIMIT + 1 events; limit 0 and LIMIT + 1; order']])
  todos(sdk, 'EVT-BVA-02', LATER.mailbox, [['1–4', 'max − 1, max, a handover at max, max then one acked']])
  todos(sdk, 'EVT-EP-02', LATER.mailbox, [['1–8', 'mailbox access by pair; foreign ack; wrong digest; summary only; no answer authority from an ack']])
  todos(sdk, 'EVT-ST-01', LATER.mailbox, [['1–9', 'one mailbox event: commit, poll, ack, retire, hold 30 days, drop, re-enable']])
  todos(sdk, 'EVT-EP-01', LATER.route, [['1–16', 'event types and their one recipient']])
  todos(sdk, 'EVT-DT-02', LATER.intercept, [['7', 'a negative interception priority (K)']])

  // ======================================================================================
  // R-HOST-09: the offer-id format `<request>.r<n>` (K1 freezes it)
  // ======================================================================================
  caseTest(sdk, 'HOST-UC-03', 'E1a', 'the frozen offer-id pattern matches <request>.r<n> for n = 1, 2 and refuses a bare request id', (mod) => {
    const fits = (re) => OFFER_ID.requests.every((r) => re.test(OFFER_ID.revision(r, 1)) && re.test(OFFER_ID.revision(r, 2)) && !re.test(r))
    const found = leaves(mod).filter((l) => l.value instanceof RegExp && MEANING.offerId(l.path)).map((l) => l.value)
    assert.ok(found.some(fits), 'no exported offer-id RegExp fits <request>.r<n>: ' + found)
  })
  todos(sdk, 'HOST-UC-03', 'C-SUCCEED (succession re-issues offers as r<n+1>)', [['main, E1a', 'succession moves offers with new revisions; the old id answers expired; the user is never refused']])

  // ======================================================================================
  // PLAT: protocol, body limits, "connected", board and set completeness
  // ======================================================================================
  caseTest(sdk, 'PLAT-BVA-02', '1–4', 'the endpoint body and in-flight limits are frozen as positive integers (R-SEC-03, K)', (mod) => {
    frozenPositive(mod, MEANING.body, 'body limit')
    frozenPositive(mod, MEANING.inFlight, 'in-flight limit')
  })
  for (const [id, row, what] of RECORDED.filter(([id]) => id.startsWith('PLAT-'))) caseTest(sdk, id, row, `K recorded: ${what}`, () => assertRecorded(id, row))
  todos(sdk, 'PLAT-UC-01', LATER.http, [['main, E1–E6', '2026-07-28 client flow; initialize, old version, GET/DELETE, resources/subscribe, Mcp-Session-Id, header mismatch']])
  todos(sdk, 'PLAT-BVA-02', LATER.http, [['1–4', 'body limit − 1, limit, limit + 1 (413 structured); in-flight max + 1 (429 structured)']])
  todos(sdk, 'PLAT-UC-03', LATER.route, [['main, A1, E1, E2', 'message_agent / ask_agent routing; unavailable at once when not connected']])
  todos(sdk, 'PLAT-UC-07', LATER.card, [['main, A1, E1, E2', 'Fishball shows an ask card (card fields frozen by K3)']])
  todos(sdk, 'PLAT-BVA-01', LATER.board, [['1–3', 'board done-item visibility at 29 d 23:59:59, 30 d, 30 d + 1 s (fake clock)']])
  todos(sdk, 'PLAT-DT-02', LATER.status, [['1–4', 'standalone set completeness']])
}
