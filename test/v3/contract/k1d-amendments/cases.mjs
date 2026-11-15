/**
 * K1d black-box cases: the W4 contract gate (W4 briefs G3) that amends K1 (`dsh-connector/mcp-schema`)
 * and K3's `host-services/tokens.d.ts` before C-REVOKE and C-SUCCEED start.
 *
 * Spec: `design/v3` `9a531192` — design §1.0c, §5.1–§5.5a, §5.9; requirements 1.27–1.33, 1.41,
 * R-OA-22, R-OA-23, R-ID-01, R-HOST-09, R-HOST-10, R-ROUTE-04, R-ROUTE-06; the C-REVOKE and C-SUCCEED
 * briefs (the seams); open-questions decided items 1–13 and 45; and the review facts Fishball relayed
 * for 9c0e400a (K1d-4, K1d-5: reconnect of an unpaired entry, `chainStartedAt`, the derived id's
 * input, Retry creates no token).
 *
 * One case id per frozen item (constants.mjs ID). Techniques: Equivalence Partitioning (one row per
 * vocabulary, member, file or input class), Boundary Value Analysis (the derived id's exact
 * length; 256 generated bits), Decision Table (retire misuse: which argument is wrong × the
 * synchronous TypeError), State Transition is the owners' (todo rows).
 *
 * Level: unit over the frozen module (per SDK, the K1 harness), its declarations (K3's reader), the
 * READMEs, and core's generator run into a temp folder. The `retire` misuse rows drive the real
 * C-MAILBOX module through c-mailbox's own world (real DSH storage, no DSH child). Behaviour only a
 * later task can make runnable is `todo`, naming that task.
 */
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { caseTest, todos } from '../k1-mcp-schema/cases.mjs'
import { exportedStringsAndKeys, schemaModule, secondsAt } from '../k1-mcp-schema/schema-module.mjs'
import { assertParams, member, serviceMembers, vocabulary } from '../k3-host-services/contracts.mjs'
import { blankComments } from '../k3-host-services/declarations.mjs'
import { FIXTURE as MBX, RETIREMENT_REASON, EVENT_TYPE } from '../../dsh-connector/mailbox/constants.mjs'
import { pendingEvent, row, snapshot } from '../../dsh-connector/mailbox/cases.mjs'
import { worldFor } from '../../dsh-connector/mailbox/subject.mjs'
import {
  BASE32_VECTORS, CHAIN_MEANING, DERIVED_ID, FILES, HOSTED, ID, ID_ORACLE, K3_README_RECORDS, LATER, MAILBOX, NEW_NAMES, OLD_IN_DATA,
  OLD_NAMES, OLD_WORDS, PAGE, PORTS, README_RECORDS, RENAME_RECORD, RETIRE_MISUSE, TOKEN, TOKEN_ENTRY, VOCAB, WITHDRAWN_CODES,
  WITHDRAWN_MEMBER, WITHDRAWN_NAMES, WITHDRAWN_WORDS,
} from './constants.mjs'
import {
  base32, codeLiterals, derivedIdParts, deriveId, frozenIdParts, docOf, exportedData, hasIdentifier, hostContracts, interfaceMembers, k1Declarations,
  markdownBlocks, method, moduleIdPattern, readme, texts, typeValues, vendoredModule, vendorTrees,
} from './subject.mjs'

// ------------------------------------------------------------------------------------------------
// Shared oracles (each states one rule once)

const sameSet = (actual, expected, what) => assert.deepEqual([...new Set(actual)].sort(), [...expected].sort(), what)
const missing = (values, has) => values.filter((v) => !has(v))
/** A frozen constant's values, required to be exactly `expected` (as a set, no duplicates). */
function assertVocabulary(mod, name, expected) {
  assert.ok(mod[name] && typeof mod[name] === 'object', `${name} is not exported`)
  const values = Object.values(mod[name])
  assert.equal(values.length, new Set(values).size, `${name} repeats a value`)
  sameSet(values, expected, `${name} is not exactly ${JSON.stringify(expected)}`)
}
/** A method's parameter names, return text and doc, asserting the arity. */
function assertSignature(found, names) {
  assert.deepEqual(found.params.filter((p) => !p.rest).map((p) => p.name), names, `${found.name}'s parameters`)
  return found
}
/** Each `[what, pattern]` must be in `doc`; one row per point. */
function docRows(sdk, id, rowPrefix, subject, points, doc) {
  points.forEach(([what, pattern], i) => caseTest(sdk, id, `${rowPrefix}.${i + 1}`, `${subject} documents: ${what}`, () => {
    assert.match(doc(), pattern, `${subject}'s declaration does not say ${what}`)
  }))
}
/** Some block of `blocks` carries every pattern. */
function assertBlock(blocks, patterns, what) {
  assert.ok(blocks.some((b) => patterns.every((re) => re.test(b))), `no single README block records: ${what}`)
}
/** Every JSDoc / line comment of a source text, one block each. */
const commentBlocks = (text) => text.match(/\/\*\*[\s\S]*?\*\/|(?:^[ \t]*\/\/[^\n]*\n?)+/gm) ?? []

const k1 = () => k1Declarations()
const host = () => hostContracts()
const tokensService = () => serviceMembers(host(), HOSTED.service)
const schemaCode = () => texts(FILES.schemaDir, FILES.code)
const contractTexts = () => new Map([...texts(FILES.schemaDir), ...texts(FILES.hostDir)])

// ================================================================================================
// 1. The token amendment (design §5.1, §5.2, §5.9 table; requirements 1.27; decided item 9)

function tokenCases(sdk) {
  caseTest(sdk, ID.token, 1, 'ENTRY_STATUS is exactly {ok} (token-too-short and token-unconfigured withdrawn)', (mod) => {
    assertVocabulary(mod, 'ENTRY_STATUS', VOCAB.entryStatus)
  })
  caseTest(sdk, ID.token, 2, 'TokenEntry.status is typed through ENTRY_STATUS, so it admits ok only', (mod) => {
    const status = interfaceMembers(k1().m, TOKEN_ENTRY.type).get(TOKEN_ENTRY.status)
    assert.ok(status, 'TokenEntry has no status (design §5.9: "the field stays")')
    sameSet(typeValues(k1().m, status.type, mod), VOCAB.entryStatus, 'TokenEntry.status values')
  })
  caseTest(sdk, ID.token, 3, `${WITHDRAWN_MEMBER.owner}.${WITHDRAWN_MEMBER.key} is withdrawn from the module and its declaration`, (mod) => {
    assert.ok(mod[WITHDRAWN_MEMBER.owner], `${WITHDRAWN_MEMBER.owner} is not exported`)
    assert.equal(WITHDRAWN_MEMBER.key in mod[WITHDRAWN_MEMBER.owner], false, `${WITHDRAWN_MEMBER.owner}.${WITHDRAWN_MEMBER.key} is still exported`)
    const decl = new RegExp(String.raw`declare const ${WITHDRAWN_MEMBER.owner}\s*:[^\n]*\b${WITHDRAWN_MEMBER.key}\b`)
    assert.doesNotMatch(k1().code, decl, `index.d.ts still declares ${WITHDRAWN_MEMBER.owner}.${WITHDRAWN_MEMBER.key}`)
  })
  caseTest(sdk, ID.token, 4, 'isTokenLongEnough is not exported and not declared', (mod) => {
    assert.equal('isTokenLongEnough' in mod, false, 'isTokenLongEnough is still exported')
    assert.equal(hasIdentifier(k1().code, 'isTokenLongEnough'), false, 'index.d.ts still declares isTokenLongEnough')
  })
  caseTest(sdk, ID.token, 5, `TOKEN_VALUE keeps the generated prefix ${TOKEN.prefix} (§1.0c renames fbt_), ${TOKEN.bytes} generated bytes and digest ${TOKEN.digest}`, (mod) => {
    const tv = mod.TOKEN_VALUE ?? {}
    assert.ok(Object.values(tv).includes(TOKEN.prefix), `TOKEN_VALUE holds no ${TOKEN.prefix}: ${JSON.stringify(tv)}`)
    assert.ok(Object.entries(tv).some(([k, v]) => /generat/i.test(k) && /bytes/i.test(k) && v === TOKEN.bytes), `no generated-bytes count of ${TOKEN.bytes}`)
    assert.equal(tv.digestAlgorithm, TOKEN.digest, 'TOKEN_VALUE.digestAlgorithm (design §5.1 names it)')
  })
  caseTest(sdk, ID.token, '6 (BVA)', `a value built from the frozen parts carries at least ${TOKEN.minBits} random bits and has the form ${TOKEN.valuePattern}`, (mod) => {
    const bytes = Object.entries(mod.TOKEN_VALUE).find(([k]) => /generat/i.test(k) && /bytes/i.test(k))?.[1]
    assert.ok(bytes * TOKEN.bitsPerByte >= TOKEN.minBits, `${bytes} bytes is under ${TOKEN.minBits} bits`)
    const value = TOKEN.prefix + randomBytes(bytes).toString(TOKEN.encoding)
    assert.match(value, TOKEN.valuePattern)
  })
  caseTest(sdk, ID.token, 7, 'RevocationKind is exactly disabled | deleted (value-changed withdrawn)', (mod) => {
    const type = k1().m.decls.get(TOKEN_ENTRY.revocation)?.[0]
    assert.ok(type, 'RevocationKind is not declared')
    sameSet(typeValues(k1().m, TOKEN_ENTRY.revocation, mod), VOCAB.revocationKind, 'RevocationKind values')
  })
  caseTest(sdk, ID.token, 8, 'a runtime revocation-kind constant, if exported, holds exactly disabled and deleted', (mod) => {
    const holders = Object.entries(mod).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).includes(VOCAB.revocationKind[0]) && Object.values(v).includes(VOCAB.revocationKind[1]))
    for (const [name] of holders) assertVocabulary(mod, name, VOCAB.revocationKind)
  })
  caseTest(sdk, ID.token, 9, 'TokenRegistry.onRevoked reports a RevocationKind', () => {
    const on = method(interfaceMembers(k1().m, TOKEN_ENTRY.registry), TOKEN_ENTRY.onRevoked)
    assert.match(on.params[0]?.type ?? '', new RegExp(String.raw`\b${TOKEN_ENTRY.revocation}\b`), 'the listener\'s kind is not a RevocationKind')
  })
  caseTest(sdk, ID.token, 10, 'SETTINGS_REFUSAL is exactly {token-duplicate} (replaces ref-duplicate and value-duplicate; decided item 9)', (mod) => {
    assertVocabulary(mod, 'SETTINGS_REFUSAL', VOCAB.settingsRefusal)
  })
  caseTest(sdk, ID.token, 11, 'TokenEntry gains hosted: boolean and has no ref and no generated', () => {
    const members = interfaceMembers(k1().m, TOKEN_ENTRY.type)
    for (const [name, type] of Object.entries(TOKEN_ENTRY.added)) assert.equal(members.get(name)?.type.trim(), type, `TokenEntry.${name}`)
    assert.deepEqual(TOKEN_ENTRY.removed.filter((n) => members.has(n)), [], 'TokenEntry still has a withdrawn member')
  })
  caseTest(sdk, ID.token, 12, `no exported string or key of the module is a withdrawn code (${WITHDRAWN_CODES.join(', ')})`, (mod) => {
    const strings = exportedStringsAndKeys(mod)
    assert.deepEqual(WITHDRAWN_CODES.filter((c) => strings.has(c)), [])
  })
  caseTest(sdk, ID.token, 13, 'no type of index.d.ts produces a withdrawn code', () => {
    const literals = codeLiterals(k1().code)
    assert.deepEqual(WITHDRAWN_CODES.filter((c) => literals.has(c)), [])
  })
  caseTest(sdk, ID.token, 14, 'every README block that names a withdrawn code records it as withdrawn or replaced', () => {
    const offenders = markdownBlocks(readme(FILES.schemaDir)).filter((b) => WITHDRAWN_CODES.some((c) => b.includes(c)) && !WITHDRAWN_WORDS.test(b))
    assert.deepEqual(offenders, [], 'a README block still states a withdrawn code as current')
  })
  todos(sdk, ID.token, LATER.reveal, [
    ['B1', 'create(label) and createHosted each generate a dsht_ value of 32 random bytes, returned once; only its SHA-256 digest is stored'],
    ['B2', 'a save with two items of one key, or two entries of one digest, is refused token-duplicate and the previous list restored'],
    ['B3', 'a save that adds an item with no record is refused token-duplicate (R5, decided item 9)'],
    ['B4', 'onRevoked fires only disabled or deleted; nothing can produce value-changed, token-too-short or token-unconfigured'],
  ])
}

// ================================================================================================
// 2. K3 host-services/tokens.d.ts (design §5.4, §5.9 row "K3 host-services/tokens.d.ts"; G3 item 5)

function hostedCases(sdk) {
  caseTest(sdk, ID.hosted, 1, `${HOSTED.service} has ${HOSTED.members.join(', ')} and no create(label) (connector-internal, R2)`, () => {
    const members = tokensService()
    assert.deepEqual(missing(HOSTED.members, (n) => members.has(n)), [], 'missing members')
    assert.deepEqual(HOSTED.notMembers.filter((n) => members.has(n)), [], 'a connector-internal member is on the K3 service')
  })
  caseTest(sdk, ID.hosted, 2, 'createHosted(instanceId) resolves exactly {entryKey, label, value} (no ref)', () => {
    const found = member(tokensService(), 'createHosted')
    assertParams(found, HOSTED.createHosted)
    assert.match(found.returns, HOSTED.promise)
    sameSet([...host().m.members(found.returns).keys()], HOSTED.createdFields, 'createHosted result fields')
  })
  caseTest(sdk, ID.hosted, 3, `CreateHostedErrorCode is exactly operation-failed (${HOSTED.movedCode} moved to the instance)`, () => {
    const codes = vocabulary(host(), HOSTED.errorCodeType)
    assert.equal(codes.open, false)
    sameSet([...codes.literals], HOSTED.errorCodes, 'CreateHostedErrorCode')
    assert.equal(codeLiterals(blankComments([...host().texts.values()].join('\n'))).has(HOSTED.movedCode), false, `${HOSTED.movedCode} is still a host-services type literal`)
  })
  caseTest(sdk, ID.hosted, 4, 'HostedEntryState stays enabled | disabled | deleted, and disabled is documented as switched off only', () => {
    sameSet([...vocabulary(host(), HOSTED.stateType).literals], HOSTED.states, 'HostedEntryState')
    assert.match(docOf([...host().texts.values()].join('\n'), 'type', HOSTED.stateType), HOSTED.disabledMeaning)
  })
  caseTest(sdk, ID.hosted, 5, 'HostedEntryState documents that a deleted entry is never replaced on its own (R-HOST-10, R6 = B, R11)', () => {
    assert.match(docOf([...host().texts.values()].join('\n'), 'type', HOSTED.stateType), HOSTED.deletedMeaning)
  })
  caseTest(sdk, ID.hosted, 6, 'entryState(entryKey) is synchronous and answers a HostedEntryState (unchanged)', () => {
    const found = member(tokensService(), 'entryState')
    assertParams(found, HOSTED.entryState)
    assert.doesNotMatch(found.returns, HOSTED.promise)
    assert.equal(found.returns.trim(), HOSTED.stateType)
  })
  caseTest(sdk, ID.hosted, 7, 'retire(old, successor) and RetireRefusalCode are unchanged (DECIDED #13)', () => {
    const found = member(tokensService(), 'retire')
    assertParams(found, HOSTED.retire)
    assert.match(found.returns, HOSTED.promise)
    assert.match(found.returns, /\bRetireResult\b/, 'retire does not resolve RetireResult')
    const codes = vocabulary(host(), HOSTED.retireCodeType)
    assert.equal(codes.open, false)
    sameSet([...codes.literals], HOSTED.retireCodes, 'RetireRefusalCode')
  })
  caseTest(sdk, ID.hosted, 8, 'child.d.ts retry() says Retry creates no token after a delete (R-HOST-10)', null, LATER.childRetry)
  todos(sdk, ID.hosted, LATER.succeed, [
    ['B1', 'createHosted returns {entryKey, label: "Fishball (hosted)", value} once; the host stores no value; a failed write rejects operation-failed and creates nothing'],
    ['B2', 'entryState answers deleted for an unknown or not-hosted key'],
  ])
}

// ================================================================================================
// 3. Pairing and chain amendment (R-OA-22, R-OA-23, design §5.5a; decided item 6; K1d-4, K1d-5)

function pageCases(sdk) {
  caseTest(sdk, ID.page, 1, 'no exported duration names a refresh chain (LIFETIME.refreshChainMaxMs withdrawn, R-OA-23)', (mod) => {
    assert.deepEqual(secondsAt(mod, (p) => CHAIN_MEANING.test(p)), [])
    assert.equal('refreshChainMaxMs' in (mod.LIFETIME ?? {}), false)
  })
  caseTest(sdk, ID.page, 2, `${PAGE.tokenStore} has no ${PAGE.removedStoreMember}, and ${PAGE.removedType} is not declared`, () => {
    assert.equal(interfaceMembers(k1().m, PAGE.tokenStore).has(PAGE.removedStoreMember), false)
    assert.equal(k1().m.decls.has(PAGE.removedType), false)
  })
  caseTest(sdk, ID.page, 3, `${PAGE.pairStore} has no ${PAGE.removedPairMember}; ${PAGE.kept.join(' and ')} stay; the page's reconnect is ${PAGE.reconnect}`, () => {
    const members = interfaceMembers(k1().m, PAGE.pairStore)
    assert.equal(members.has(PAGE.removedPairMember), false)
    assert.deepEqual(missing([...PAGE.kept, PAGE.reconnect], (n) => members.get(n)?.method), [])
  })
  caseTest(sdk, ID.page, 4, `${PAGE.reconnect}(entryKey, id, client) is asynchronous and refuses only ${PAGE.alreadyPaired}`, () => {
    const found = method(interfaceMembers(k1().m, PAGE.pairStore), PAGE.reconnect)
    assert.equal(found.params.length, PAGE.reconnectParams)
    assert.match(found.returns, /^Promise\s*</)
    const code = k1().m.members(found.returns).get('code')
    sameSet(k1().m.leaves(code?.type).map((l) => l.literal), [PAGE.alreadyPaired], 'reconnect refusal codes')
  })
  docRows(sdk, ID.page, 5, PAGE.reconnect, PAGE.reconnectUnpaired, () => method(interfaceMembers(k1().m, PAGE.pairStore), PAGE.reconnect).doc)
  caseTest(sdk, ID.page, 6, `${PAGE.refreshRecord} has no ${PAGE.removedRefreshField} (withdrawn with the chain cap, K1d-5)`, () => {
    assert.equal(interfaceMembers(k1().m, PAGE.refreshRecord).has(PAGE.removedRefreshField), false)
  })
  caseTest(sdk, ID.page, 7, `no code or declaration of the module names ${WITHDRAWN_NAMES.join(', ')}`, () => {
    const offenders = [...schemaCode()].flatMap(([file, text]) => WITHDRAWN_NAMES.filter((n) => hasIdentifier(blankComments(text), n)).map((n) => `${file}: ${n}`))
    assert.deepEqual(offenders, [])
  })
  caseTest(sdk, ID.page, 8, `the authorization-request extension parameter ${PAGE.agentIdParam} is frozen as data (§1.0c renames fishball_id)`, (mod) => {
    assert.ok(exportedStringsAndKeys(mod).has(PAGE.agentIdParam), `${PAGE.agentIdParam} is not exported`)
  })
  caseTest(sdk, ID.page, 9, `the derived id's parts are frozen: ${DERIVED_ID.prefix}, ${DERIVED_ID.chars} characters, the RFC 4648 base32 alphabet lower-cased, ${DERIVED_ID.digest}`, (mod) => {
    const parts = derivedIdParts(mod)
    assert.deepEqual(parts.chars, [DERIVED_ID.chars], 'the character count')
    assert.deepEqual(parts.alphabet, [DERIVED_ID.alphabet], 'the alphabet')
    assert.deepEqual(parts.digest, [DERIVED_ID.digest], 'the digest')
  })
  for (const [i, [input, expected]] of BASE32_VECTORS.entries()) {
    caseTest(sdk, ID.page, `10.${i + 1} (oracle)`, `the test's base32 encoder gives RFC 4648 §10's ${JSON.stringify(input)} → ${JSON.stringify(expected)}`, () => {
      assert.equal(base32(Buffer.from(input), DERIVED_ID.alphabet), expected)
    })
  }
  for (const [i, [what, url]] of DERIVED_ID.samples.entries()) {
    caseTest(sdk, ID.page, `11.${i + 1} (BVA)`, `${what}: the id derived from the frozen parts is exactly ${DERIVED_ID.length} characters, fits R-ID-02 and the module's id grammar, and is deterministic`, (mod) => {
      const parts = frozenIdParts(mod)
      const id = deriveId(parts, url)
      assert.equal(id.length, DERIVED_ID.length)
      assert.ok(id.startsWith(DERIVED_ID.prefix))
      assert.match(id, ID_ORACLE.pattern)
      const pattern = moduleIdPattern(mod)
      assert.ok(pattern, 'no exported id grammar')
      assert.ok(pattern.test(id), `the module's id grammar refuses ${id}`)
      assert.equal(deriveId(parts, url), id)
    })
  }
  caseTest(sdk, ID.page, 12, 'two client id URLs that differ in one character derive two ids', (mod) => {
    const parts = frozenIdParts(mod)
    const [a, b] = DERIVED_ID.distinctPair.map((u) => deriveId(parts, u))
    assert.notEqual(a, b)
  })
  const derivedDoc = () => [...commentBlocks(schemaCode().get(path.join(path.relative(process.cwd(), FILES.schemaDir), 'constants.js')) ?? ''), ...markdownBlocks(readme(FILES.schemaDir))]
    .filter((b) => b.includes('DERIVED_AGENT_ID')).join('\n')
  docRows(sdk, ID.page, 13, 'DERIVED_AGENT_ID', DERIVED_ID.inputDoc, derivedDoc)
  todos(sdk, ID.page, LATER.pageId, [
    ['B1', 'Authorize binds at once with the agent_id passed in the authorization request (id-invalid / id-taken on the page)'],
    ['B2', 'a client that passes no id is bound to cid- + 16 base32 of SHA-256(client id URL)'],
    ['B3', 'the same token with the same id reconnects the same principal (name, sessions, queued events kept); another id is already-paired'],
    ['B4', 'no refresh chain ends by age: only reuse or a disable / delete of its entry ends it'],
  ])
}

// ================================================================================================
// 4. Mailbox.transfer (W4 briefs G3 item 1; K1d-1)

function transferCases(sdk) {
  const transfer = () => method(interfaceMembers(k1().m, MAILBOX.type), MAILBOX.transfer)
  caseTest(sdk, ID.transfer, 1, `Mailbox.transfer(${MAILBOX.transferParams.join(', ')}) takes two PrincipalKeys and resolves {moved: number}`, () => {
    const found = assertSignature(transfer(), MAILBOX.transferParams)
    for (const p of found.params) assert.equal(p.type.trim(), MAILBOX.keyType)
    assert.match(found.returns, MAILBOX.promise)
    assert.equal(k1().m.members(found.returns).get(MAILBOX.moved)?.type.trim(), MAILBOX.movedType)
  })
  docRows(sdk, ID.transfer, 2, 'Mailbox.transfer', MAILBOX.transferDoc, () => transfer().doc)
  todos(sdk, ID.transfer, LATER.succeed, [
    ['B1', 'every pending event of from moves to to, held events included, with the same eventIds, in order; {moved} counts them'],
    ['B2', 'acked and retired events stay behind; nothing is committed (no retirement)'],
    ['B3', 'an empty or unknown source resolves {moved: 0}; a repeat moves nothing more'],
    ['B4', 'a non-string or empty key, or from === to, throws TypeError synchronously and nothing changes'],
  ])
}

// ================================================================================================
// 5. Mailbox.retire misuse (decided item 45; G3 item 2; K1d-2)

/** `call()` throws a TypeError before it returns: a rejected promise is not a synchronous throw. */
async function assertThrowsSynchronously(call) {
  let returned
  try {
    returned = call()
  } catch (error) {
    assert.ok(error instanceof TypeError, `threw ${error?.name}, not TypeError`)
    return
  }
  const settled = await Promise.resolve(returned).then((v) => ['resolved', v], (e) => ['rejected', e?.name])
  assert.fail(`did not throw synchronously; the call ${settled[0]} with ${JSON.stringify(settled[1])}`)
}

function retireCases(sdk) {
  docRows(sdk, ID.retire, 1, 'Mailbox.retire', MAILBOX.retireDoc, () => method(interfaceMembers(k1().m, MAILBOX.type), MAILBOX.retire).doc)
  const reason = RETIREMENT_REASON.withdrawn
  // Decision table: exactly one argument is wrong in each rule; the others are a valid pending event.
  const rules = [
    ...RETIRE_MISUSE.principalKey.map(([what, bad]) => [`principalKey ${what}`, (e) => [bad, e.eventId, reason]]),
    ...RETIRE_MISUSE.eventId.map(([what, bad]) => [`eventId ${what}`, () => [MBX.p, bad, reason]]),
    ...RETIRE_MISUSE.reason.map(([what, bad]) => [`reason ${what}`, (e) => [MBX.p, e.eventId, bad]]),
  ]
  rules.forEach(([what, args], i) => row(sdk, ID.retire, `2.${i + 1}`, `real C-MAILBOX: retire with ${what} throws TypeError synchronously; nothing changes`, async (t) => {
    const w = await worldFor(t, sdk)
    const e = await pendingEvent(w.mailbox, MBX.p, EVENT_TYPE.permission)
    const before = await snapshot(w.mailbox)
    await assertThrowsSynchronously(() => w.mailbox.retire(...args(e)))
    assert.deepEqual(await snapshot(w.mailbox), before, 'a misused retire changed a mailbox')
  }))
}

// ================================================================================================
// 6. SettingsWriter and SessionNotes (G3 item 4; design §5.1, §5.2 step 3; W4 Q2 = A; K1d-3)

function portCases(sdk) {
  const writer = () => interfaceMembers(k1().m, PORTS.writer)
  caseTest(sdk, ID.ports, 1, `${PORTS.writer} declares ${PORTS.writerMembers.map(([n]) => n).join(', ')}, one parameter each, each resolving a Promise`, () => {
    for (const [name, params] of PORTS.writerMembers) {
      const found = method(writer(), name)
      assert.equal(found.params.length, params, `${name} parameters`)
      assert.match(found.returns, PORTS.promise, `${name} is not asynchronous`)
    }
  })
  caseTest(sdk, ID.ports, 2, `addToken's item is exactly {${PORTS.item.join(', ')}} (no value, digest or reference; design §5.1)`, () => {
    const item = method(writer(), 'addToken').params[0]
    const fields = [...k1().m.members(item.type).keys()]
    sameSet(fields, PORTS.item, 'the settings item')
    assert.deepEqual(fields.filter((f) => PORTS.itemForbidden.test(f)), [])
  })
  caseTest(sdk, ID.ports, 3, 'removeToken takes an entry key; setDesignated takes an entry key or undefined (unset)', () => {
    assert.match(method(writer(), 'removeToken').params[0].type, /EntryKey|string/)
    const designated = method(writer(), 'setDesignated').params[0].type
    assert.match(designated, /EntryKey|string/)
    assert.match(designated, PORTS.designatedUnset, 'setDesignated cannot unset')
  })
  docRows(sdk, ID.ports, 4, PORTS.writer, PORTS.writerDoc, () => docOf(k1().text, 'interface', PORTS.writer))
  caseTest(sdk, ID.ports, 5, `${PORTS.notes}.${PORTS.notesMember}(${PORTS.notesParams.join(', ')}) resolves a Promise`, () => {
    const found = assertSignature(method(interfaceMembers(k1().m, PORTS.notes), PORTS.notesMember), PORTS.notesParams)
    assert.match(found.returns, PORTS.promise)
  })
  docRows(sdk, ID.ports, 6, `${PORTS.notes}.${PORTS.notesMember}`, PORTS.notesDoc, () => docOf(k1().text, 'interface', PORTS.notes))
  for (const name of [PORTS.writer, PORTS.notes]) {
    caseTest(sdk, ID.ports, `7 (${name})`, `${name} is documented as connector-internal`, () => {
      assert.match(docOf(k1().text, 'interface', name), PORTS.internal)
    })
  }
  todos(sdk, ID.ports, LATER.wire, [
    ['B1', 'addToken / removeToken / setDesignated resolve only after the save and the token registry\'s sync; a refused save rejects and the previous list stays'],
    ['B2', 'SessionNotes.system appends a system entry that starts no turn (Q2 = A)'],
  ])
}

// ================================================================================================
// 7. Neutral names (design §1.0c; requirements 1.41 Q-G8, Q-G9; decided item 73)

function nameCases(sdk) {
  caseTest(sdk, ID.names, 1, 'no line of a K1 or K3 contract file carries a renamed DSH-side name, except a §1.0c rename record', () => {
    const offenders = []
    for (const [file, text] of contractTexts()) {
      text.split('\n').forEach((line, i) => {
        const hit = OLD_NAMES.find((n) => line.includes(n)) ?? OLD_WORDS.find((re) => re.test(line))
        if (hit && !RENAME_RECORD.test(line)) offenders.push(`${file}:${i + 1}: ${String(hit)}`)
      })
    }
    assert.deepEqual(offenders, [])
  })
  caseTest(sdk, ID.names, 2, 'no exported string or key of K1 carries a §1.0c old name (fishball_id, fbt_, /api/fishball/, …)', (mod) => {
    assert.deepEqual([...exportedStringsAndKeys(mod)].filter((s) => OLD_IN_DATA.some((n) => s.includes(n))), [])
  })
  caseTest(sdk, ID.names, 3, `the new names are frozen: scopes ${NEW_NAMES.scope.join(', ')}, ${NEW_NAMES.resource.join(' at ')}, ${NEW_NAMES.pathPrefix}* paths`, (mod) => {
    const strings = exportedStringsAndKeys(mod)
    assert.deepEqual(missing([...NEW_NAMES.scope, ...NEW_NAMES.resource], (v) => strings.has(v)), [])
    const paths = Object.values(mod.PATHS ?? {}).filter((p) => p.startsWith('/api/'))
    assert.ok(paths.length > 0 && paths.every((p) => p.startsWith(NEW_NAMES.pathPrefix)), `API paths: ${JSON.stringify(paths)}`)
  })
  caseTest(sdk, ID.names, 4, `the no-recipient fallback is ${NEW_NAMES.noAgent}, and the designated setting is worded ${NEW_NAMES.designated}`, () => {
    assert.ok(codeLiterals(k1().code).has(NEW_NAMES.noAgent), `${NEW_NAMES.noAgent} is not a type literal`)
    assert.ok(k1().text.includes(NEW_NAMES.designated), `${NEW_NAMES.designated} is not named`)
  })
  caseTest(sdk, ID.names, 5, `the host-only services are ${NEW_NAMES.services.join(', ')} and none is named fishball*`, () => {
    const context = host().m.members(NEW_NAMES.contextType)
    assert.deepEqual(missing(NEW_NAMES.services, (n) => context.has(n)), [])
    assert.deepEqual([...context.keys()].filter((n) => NEW_NAMES.oldServicePrefix.test(n)), [])
  })
}

// ================================================================================================
// 8. Core's vendored copy (design §9.1; the generator's usage line)

function vendorCases(sdk) {
  caseTest(sdk, ID.vendor, 1, 'core\'s committed vendor/ equals the generator\'s copy of the connector\'s mcp-schema closure, byte for byte', async () => {
    const { generated, committed } = await vendorTrees()
    assert.ok(generated.size > 0, 'the generator wrote nothing')
    sameSet([...committed.keys()], [...generated.keys()], 'vendored file list')
    assert.deepEqual([...generated].filter(([f, bytes]) => !committed.get(f)?.equals(bytes)).map(([f]) => f), [], 'files that differ')
  })
  caseTest(sdk, ID.vendor, 2, 'the vendored module exports the same K1d values as the connector\'s module', async () => {
    assert.deepEqual(exportedData(await vendoredModule()), exportedData(await schemaModule(sdk)))
  })
}

// ================================================================================================
// 9. The README records each change (item 9)

function readmeCases(sdk) {
  const k1Blocks = () => markdownBlocks(readme(FILES.schemaDir))
  README_RECORDS.forEach(([what, patterns], i) => caseTest(sdk, ID.readme, `1.${i + 1}`, `the K1 README records: ${what}`, () => assertBlock(k1Blocks(), patterns, what)))
  K3_README_RECORDS.forEach(([what, patterns], i) => caseTest(sdk, ID.readme, `2.${i + 1}`, `the host-services README records: ${what}`, () => assertBlock(markdownBlocks(readme(FILES.hostDir)), patterns, what)))
}

/** Every K1d case on one SDK. */
export function registerK1dCases(sdk) {
  tokenCases(sdk)
  hostedCases(sdk)
  pageCases(sdk)
  transferCases(sdk)
  retireCases(sdk)
  portCases(sdk)
  nameCases(sdk)
  vendorCases(sdk)
  readmeCases(sdk)
}
