/**
 * K3a MULTI-0 rows (2026-11-18): core's `TARGETS` and `MCP.identity` / `MCP.serverIdentity`,
 * fishball-shared's `SEAM_TARGETS`, their agreement with core's declarations, and the instance's
 * copy of the hosted names (oracles: targets-constants.mjs; the README rules read as
 * targets-rules.mjs). Named "K3a-MULTI-<technique>-<n>":
 * - EP: one partition per value group, per route class (GET list / POST actions), per word set;
 * - BVA: generated ids at the alphabet's ends, the readable key at 16/17, the tool-name budget at
 *   exactly 64 and 65, the duplicate suffix from 2;
 * - DT: adversarial remote ids × kinds × targets for the tuple keys; DSH's credential grammars
 *   (SDK library) × each per-target name; parent-owned names × added-target names;
 * - ST: the duplicate-name allocation through arrival, rename, refresh and removal (README Examples).
 *
 * Level: unit. Core's constants, fishball-shared and the instance's constants are imported as data;
 * declarations are read with the K3 reader; the SDKs' credentials library is imported read only.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { caseTest } from '../package-boundaries/cases.mjs'
import { member, needDeclarations } from '../k3-host-services/contracts.mjs'
import { both, pick, sameSet, sdkCase } from './cases.mjs'
import { HOSTED } from './constants.mjs'
import { core, coreConstants, importFile, literalUnion, membersOf, sdkDir, sdkMissing, uiSeam, unfrozen } from './surface.mjs'
import path from 'node:path'
import {
  CREDENTIALS, DISALLOWED, DUPLICATE_OPS, DUPLICATE_STEPS, FALLBACK_NAMES, FIXTURE, IDS, INSTANCE_COPY, KEYS, LITERAL_STEPS, LONG_EXAMPLE, MCP_MULTI, NAMES,
  HOSTED_SIGNAL, PARENT_GRANT, README_ROWS, SEAM, SEAM_DECL, SEAM_UNIONS, STORAGE_NAMES, TARGETS_EXPECTED, TOOL_BUDGET, TOOL_EXAMPLES, TOOL_SOURCE,
} from './targets-constants.mjs'
import {
  duplicateAllocator, fixedChars, generatedId, handleOf, keyOf, messageIdOf, readableOf, recordIdOf, recordKeyOf, tokenRefOf, toolNameOf,
} from './targets-rules.mjs'

const sorted = (values) => [...values].sort()
const distinct = (values, what) => assert.equal(new Set(values).size, values.length, `${what}: ${JSON.stringify(values)}`)
const targets = async () => (await coreConstants())[NAMES.targetsExport]
const seam = async () => (await uiSeam())[SEAM.exportName]
/** BVA over a generated id's letters: all the first letter, all the last, and the alphabet in order cut to length. */
const boundaryLetters = (format) => ({
  first: format.alphabet[0].repeat(format.randomChars),
  last: format.alphabet.at(-1).repeat(format.randomChars),
  mixed: format.alphabet.repeat(Math.ceil(format.randomChars / format.alphabet.length)).slice(0, format.randomChars),
})
/** Every id the rows build: the parent id and each format's boundary ids. */
async function sampleIds() {
  const T = await targets()
  const ids = (format) => FIXTURE.bounds.map((b) => generatedId(format, boundaryLetters(format)[b]))
  return { T, targetIds: [T.parentId, ...ids(T.id)], epochs: ids(T.epoch) }
}
/** Every (target, epoch) pair of the samples, with its per-target names (README "Added credentials"). */
async function credentialNames() {
  const { T, targetIds, epochs } = await sampleIds()
  const { CONNECT } = await coreConstants()
  const record = (prefix, id, epoch) => recordKeyOf(CONNECT.grantRecordScope, CREDENTIALS.keySeparator, recordIdOf(T, prefix, id, epoch))
  return targetIds.flatMap((id) => epochs.map((epoch) => ({
    id, epoch,
    ref: tokenRefOf(T, id, epoch),
    tokenRecord: record(T.credentials.tokenRecordPrefix, id, epoch),
    grantRecord: record(T.credentials.grantRecordPrefix, id, epoch),
    recordIds: [recordIdOf(T, T.credentials.tokenRecordPrefix, id, epoch), recordIdOf(T, T.credentials.grantRecordPrefix, id, epoch)],
  })))
}
/** Runs a duplicate-name transition table, asserting every step's resolved names. */
async function runAllocation(steps) {
  const allocator = duplicateAllocator(await targets())
  for (const s of steps) {
    if (s.op === DUPLICATE_OPS.remove) allocator.remove(s.target)
    else allocator.observe(s.target, s.name)
    assert.deepEqual(allocator.names(), s.expect, s.step)
  }
}
/** The parameter list of one `ui.targets` method (declared in targets.d.ts). */
const targetsParams = (name) => member(membersOf(core(), SEAM_DECL.targetsType), name).params

export function registerK3aTargetCases(sdk) {
  // ================================================================ TARGETS: exact values
  caseTest(sdk, 'K3a-MULTI-EP-01', 'TARGETS', 'core exports TARGETS, deeply frozen, exactly as the README freezes it', async () => {
    const c = await coreConstants()
    assert.ok(Object.hasOwn(c, NAMES.targetsExport), 'constants.js exports no ' + NAMES.targetsExport)
    const { [NAMES.textKey]: text, ...data } = c[NAMES.targetsExport]
    // unfrozen() flags functions, so the formatters are checked apart; the data copy is compared, the original checked frozen.
    assert.ok(Object.isFrozen(c[NAMES.targetsExport]) && Object.isFrozen(text), 'TARGETS or TARGETS.text is not frozen')
    assert.deepEqual(Object.keys(data).flatMap((k) => unfrozen(data[k], NAMES.targetsExport + '.' + k)), [])
    assert.deepEqual(data, TARGETS_EXPECTED)
    assert.deepEqual(sorted(Object.keys(text)), sorted(NAMES.formatters))
    assert.deepEqual(NAMES.formatters.filter((f) => typeof text[f] !== NAMES.functionType), [])
  })
  caseTest(sdk, 'K3a-MULTI-EP-01', 'formats', 'id and epoch prefixes differ; the alphabet is 32 distinct lowercase segment characters', async () => {
    const T = await targets()
    assert.notEqual(T.id.prefix, T.epoch.prefix)
    for (const format of [T.id, T.epoch]) {
      distinct([...format.alphabet], 'alphabet letters')
      assert.ok([...format.alphabet].every((ch) => IDS.keySegment.test(IDS.id.alphabet[0] + ch)), 'a letter outside the key-segment grammar')
    }
  })
  caseTest(sdk, 'K3a-MULTI-EP-01', 'kinds', 'the key kinds event, approval and session are distinct', async () => {
    distinct(Object.values((await targets()).key.kind), 'key kinds')
  })
  caseTest(sdk, 'K3a-MULTI-BVA-01', 'duplicate', 'the duplicate suffix is " (" + n + ")" from n = 2: open and close differ, firstSuffix is an integer ≥ 2', async () => {
    const { duplicate } = await targets()
    assert.notEqual(duplicate.open, duplicate.close)
    assert.ok(Number.isSafeInteger(duplicate.firstSuffix) && duplicate.firstSuffix >= TARGETS_EXPECTED.duplicate.firstSuffix)
  })

  // ================================================================ ids and credential names against DSH's grammars
  caseTest(sdk, 'K3a-MULTI-BVA-02', 'ids', 'parentId and generated ids at the alphabet\'s ends fit [a-z][a-z0-9-]*, hold no "_", and have length prefix + 16', async () => {
    const { T, targetIds, epochs } = await sampleIds()
    const bad = [...targetIds, ...epochs].filter((v) => !IDS.keySegment.test(v) || v.includes(IDS.forbidden))
    assert.deepEqual(bad, [])
    for (const v of [...targetIds.slice(1), ...epochs]) assert.equal(v.length, T.id.prefix.length + T.id.randomChars, v)
  })
  sdkCase(sdk, 'K3a-MULTI-DT-01', 'SDK segments', 'the SDK accepts every sample id and epoch as a credential-key segment', async (lib) => {
    const { targetIds, epochs } = await sampleIds()
    assert.deepEqual([...targetIds, ...epochs].filter((v) => !lib.isCredentialKeySegment(v)), [])
  })
  caseTest(sdk, 'K3a-MULTI-EP-02', 'token ref', 'the per-target reference is FISHBALL_TARGET_TOKEN_<id>__<epoch> with - → _, inside DSH\'s reference grammar', async () => {
    const names = await credentialNames()
    assert.deepEqual(names.filter((n) => !IDS.refName.test(n.ref)).map((n) => n.ref), [])
    assert.deepEqual(names.filter((n) => n.ref !== CREDENTIALS.readmeRef(n.id, n.epoch)).map((n) => n.ref), [])
  })
  sdkCase(sdk, 'K3a-MULTI-DT-01', 'SDK ref', 'the SDK accepts every per-target reference (isCredentialRefName, credentialRef)', async (lib) => {
    for (const { ref } of await credentialNames()) {
      assert.equal(lib.isCredentialRefName(ref), true, ref)
      assert.equal(String(lib.credentialRef(ref)), ref)
    }
  })
  caseTest(sdk, 'K3a-MULTI-EP-02', 'records', 'the per-target records are fishball-core/token-<id>-<epoch> and fishball-core/connect-<id>-<epoch>', async () => {
    for (const n of await credentialNames()) {
      assert.equal(n.tokenRecord, CREDENTIALS.readmeTokenRecord(n.id, n.epoch))
      assert.equal(n.grantRecord, CREDENTIALS.readmeGrantRecord(n.id, n.epoch))
      assert.ok(n.recordIds.every((r) => IDS.keySegment.test(r)), 'a record id outside the key-segment grammar: ' + n.recordIds)
    }
  })
  sdkCase(sdk, 'K3a-MULTI-DT-01', 'SDK records', 'every per-target record key round-trips through the SDK\'s parseCredentialKey with scope fishball-core', async (lib) => {
    for (const n of await credentialNames()) {
      for (const key of [n.tokenRecord, n.grantRecord]) {
        const parsed = lib.parseCredentialKey(key)
        assert.equal(String(parsed), key)
        assert.equal(lib.credentialKeyScope(parsed), HOSTED.recordScope)
      }
    }
  })
  caseTest(sdk, 'K3a-MULTI-DT-02', 'parent-owned', 'no added target\'s reference or record equals the parent\'s DSH_AGENT_TOKEN, fishball-core/hosted-agent or fishball-core/pending-token-origin', async () => {
    const { HOSTED_IMPORT } = await coreConstants()
    assert.equal(HOSTED_IMPORT.credentialRef, CREDENTIALS.parentOwned.ref)
    assert.ok(CREDENTIALS.parentOwned.records.includes(HOSTED_IMPORT.savedRecord.key))
    const names = await credentialNames()
    assert.deepEqual(names.filter((n) => n.ref === CREDENTIALS.parentOwned.ref).map((n) => n.ref), [])
    assert.deepEqual(names.flatMap((n) => [n.tokenRecord, n.grantRecord]).filter((k) => CREDENTIALS.parentOwned.records.includes(k)), [])
  })
  caseTest(sdk, 'K3a-MULTI-DT-02', 'isolation', 'every (target, epoch) has its own reference and records; token and grant records differ', async () => {
    const names = await credentialNames()
    distinct(names.map((n) => n.ref), 'references')
    distinct(names.flatMap((n) => [n.tokenRecord, n.grantRecord]), 'records')
  })

  // ================================================================ tuple keys and handles (README "Local keys")
  caseTest(sdk, 'K3a-MULTI-EP-03', 'README example', 'A and B both sending event-1 give the README keys, two handles and two manager message ids', async () => {
    const T = await targets()
    const { MESSAGE } = await coreConstants()
    const keys = [FIXTURE.a, FIXTURE.b].map((t) => keyOf(T.key.kind.event, t.targetId, t.endpointEpoch, KEYS.sameEvent))
    assert.deepEqual(keys, [FIXTURE.a, FIXTURE.b].map((t) => KEYS.readmeKey(KEYS.kind.event, t.targetId, t.endpointEpoch, KEYS.sameEvent)))
    distinct(keys.map((k) => handleOf(T, k)), 'handles')
    distinct(keys.map((k) => messageIdOf(MESSAGE, T, k)), 'message ids')
    assert.ok(keys.every((k) => KEYS.token.test(handleOf(T, k))), 'a handle outside base64url')
  })
  caseTest(sdk, 'K3a-MULTI-EP-03', 'approval', 'A and B both offering ap-1 give two approval handles; a new epoch of A gives a third', async () => {
    const T = await targets()
    distinct([FIXTURE.a, FIXTURE.b, FIXTURE.aNewEpoch].map((t) => handleOf(T, keyOf(T.key.kind.approval, t.targetId, t.endpointEpoch, KEYS.sameApproval))), 'approval handles')
  })
  caseTest(sdk, 'K3a-MULTI-DT-03', 'adversarial', 'remote ids holding ", \\, ], , or a forged tuple tail never make two (kind, target, epoch, id) tuples share a key or handle', async () => {
    const T = await targets()
    const tuples = Object.values(T.key.kind).flatMap((kind) => [FIXTURE.a, FIXTURE.b, FIXTURE.aNewEpoch].flatMap((t) => KEYS.adversarial.map((remote) => [kind, t.targetId, t.endpointEpoch, remote])))
    const keys = tuples.map((tuple) => keyOf(...tuple))
    distinct(keys, 'keys')
    distinct(keys.map((k) => handleOf(T, k)), 'handles')
    assert.deepEqual(keys.map((k) => JSON.parse(k)), tuples, 'a key does not decode to its own tuple')
  })

  // ================================================================ tool names (README "Tool names" and Examples)
  caseTest(sdk, 'K3a-MULTI-BVA-03', 'budget', 'prefix + readable 16 + separators + 12 hex leave ≥ 1 character for the facade inside 64; the digest fits SHA-256', async () => {
    const T = await targets()
    assert.ok(T.toolName.maxChars - fixedChars(T) - T.toolName.readableMaxChars >= TOOL_BUDGET.minFacadeChars)
    assert.ok(T.toolName.digestHexChars <= toolNameDigestRoom(T))
  })
  caseTest(sdk, 'K3a-MULTI-BVA-03', 'allowed', 'TOOL allowed accepts 1 and 64 characters of [A-Za-z0-9_-], refuses 65 and spaces, dots, Unicode, empty', async () => {
    const T = await targets()
    const allowed = new RegExp(T.toolName.allowed)
    const unit = T.toolName.readableFallback[0]
    assert.equal(allowed.test(unit), true, 'length 1')
    assert.equal(allowed.test(unit.repeat(T.toolName.maxChars)), true, 'length 64')
    assert.equal(allowed.test(unit.repeat(T.toolName.maxChars + 1)), false, 'length 65')
    assert.deepEqual(DISALLOWED.filter((n) => allowed.test(n)), [])
  })
  for (const ex of TOOL_EXAMPLES) {
    caseTest(sdk, 'K3a-MULTI-EP-04', ex.row, `${JSON.stringify(ex.name)} → readable ${ex.readable}; the final name is allowed and ≤ 64`, async () => {
      const [T, c] = [await targets(), await coreConstants()]
      assert.equal(readableOf(T, ex.name), ex.readable)
      const final = toolNameOf(T, c.MCP, FIXTURE.a, ex.name, T.toolName.origin.remote, ex.facade)
      assert.match(final, new RegExp(T.toolName.allowed))
      if (ex.final) assert.match(final, ex.final)
    })
  }
  caseTest(sdk, 'K3a-MULTI-EP-04', 'fallback', `names with nothing ASCII left, and null (Q01), read as the fallback ${TARGETS_EXPECTED.toolName.readableFallback}`, async () => {
    const T = await targets()
    assert.deepEqual(FALLBACK_NAMES.map((n) => readableOf(T, n)), FALLBACK_NAMES.map(() => T.toolName.readableFallback))
  })
  caseTest(sdk, 'K3a-MULTI-BVA-03', 'README 200 chars', 'a 200-character name with acme-tools. + 48 characters: readable 16, facade cut from the end, total exactly 64', async () => {
    const [T, c] = [await targets(), await coreConstants()]
    const name = LONG_EXAMPLE.nameChar.repeat(LONG_EXAMPLE.nameChars)
    const raw = LONG_EXAMPLE.namespace + LONG_EXAMPLE.dot + LONG_EXAMPLE.localChar.repeat(LONG_EXAMPLE.localChars)
    const final = toolNameOf(T, c.MCP, FIXTURE.a, name, T.toolName.origin.remote, raw)
    assert.equal(final.length, LONG_EXAMPLE.total)
    assert.equal(readableOf(T, name).length, T.toolName.readableMaxChars)
    assert.ok(final.startsWith(T.toolName.prefix + readableOf(T, name) + T.toolName.separator + LONG_EXAMPLE.namespace + c.MCP.namespace.externalName.replacement), final)
    assert.match(final, new RegExp(T.toolName.allowed))
  })
  caseTest(sdk, 'K3a-MULTI-DT-04', 'equal names', 'two targets with the same name, one target before and after an endpoint change, and remote vs local origin all give different final names', async () => {
    const [T, c] = [await targets(), await coreConstants()]
    const at = (target, origin) => toolNameOf(T, c.MCP, target, FIXTURE.officeName, origin, FIXTURE.rawTool)
    const { remote, local } = T.toolName.origin
    distinct([at(FIXTURE.a, remote), at(FIXTURE.b, remote), at(FIXTURE.aNewEpoch, remote), at(FIXTURE.a, local)], 'final names')
  })

  caseTest(sdk, 'K3a-MULTI-EP-06', 'toolSource', `TARGETS.text.toolSource(JSON.stringify(${JSON.stringify(TOOL_SOURCE.example.name)})) is the README persona example exactly`, async () => {
    const T = await targets()
    assert.equal(T[NAMES.textKey].toolSource(JSON.stringify(TOOL_SOURCE.example.name)), TOOL_SOURCE.example.output)
  })
  caseTest(sdk, 'K3a-MULTI-EP-06', 'toolSource (adversarial)', 'an adversarial name stays one JSON token: the formatter output holds JSON.stringify(name) once, and it parses back to the name', async () => {
    const T = await targets()
    for (const name of TOOL_SOURCE.adversarial) {
      const quoted = JSON.stringify(name)
      const out = T[NAMES.textKey].toolSource(quoted)
      assert.equal(out.split(quoted).length, 2, out)
      assert.equal(JSON.parse(quoted), name)
    }
  })

  // ================================================================ duplicate names (README Examples; ST)
  caseTest(sdk, 'K3a-MULTI-ST-01', 'Office-DSH', 'A, B both Office-DSH → Office-DSH, Office-DSH (2); A renames: B stays; a third gets Office-DSH; removal renumbers nobody; renaming into a group is the later appearance', () => runAllocation(DUPLICATE_STEPS))
  caseTest(sdk, 'K3a-MULTI-ST-01', 'literal (2)', 'a literal Office-DSH (2) held with Office-DSH held → the next Office-DSH is Office-DSH (3)', () => runAllocation(LITERAL_STEPS))

  // ================================================================ hosted signal and the parent's grant (link.d.ts, README "Hosted signal")
  caseTest(sdk, 'K3a-MULTI-EP-07', 'parent grant', 'the parent\'s grant record is fishball-core/connect-parent-<epoch> by the per-target rule, a valid key, never a parent-owned hosted name', async () => {
    const { T, epochs } = await sampleIds()
    const { CONNECT } = await coreConstants()
    for (const epoch of epochs) {
      const key = recordKeyOf(CONNECT.grantRecordScope, CREDENTIALS.keySeparator, recordIdOf(T, T.credentials.grantRecordPrefix, T.parentId, epoch))
      assert.equal(key, PARENT_GRANT(epoch))
      assert.ok(IDS.keySegment.test(recordIdOf(T, T.credentials.grantRecordPrefix, T.parentId, epoch)), key)
      assert.equal(CREDENTIALS.parentOwned.records.includes(key), false, key)
    }
  })
  sdkCase(sdk, 'K3a-MULTI-DT-01', 'SDK parent grant', 'the SDK parses the parent\'s grant record keys with scope fishball-core', async (lib) => {
    const { epochs } = await sampleIds()
    for (const key of epochs.map(PARENT_GRANT)) assert.equal(lib.credentialKeyScope(lib.parseCredentialKey(key)), HOSTED.recordScope, key)
  })
  caseTest(sdk, 'K3a-MULTI-EP-07', 'hosted signal', 'link.d.ts states the URL-independent hosted signal (settings lists targetSetting.row), the renewed parent epoch, the parent grant and the withdrawn target.url', () => {
    const text = core().texts.get(HOSTED_SIGNAL.file)
    assert.ok(text, 'no ' + HOSTED_SIGNAL.file)
    assert.deepEqual(HOSTED_SIGNAL.words.filter((w) => !w.test(text)).map(String), [])
  })
  for (const { row, words } of README_ROWS.rows) {
    caseTest(sdk, 'K3a-MULTI-EP-08', `README ${row}`, `the core contracts README has one "${row}" row stating ${words.length} frozen points`, () => {
      const lines = fs.readFileSync(path.join(core().dir, README_ROWS.file), 'utf8').split('\n').filter((l) => l.split(README_ROWS.cell)[1]?.trim() === row)
      assert.equal(lines.length, 1, row + ' rows: ' + lines.length)
      assert.deepEqual(words.filter((w) => !w.test(lines[0])).map(String), [])
    })
  }

  // ================================================================ storage unit names against DSH storage's grammar
  caseTest(sdk, 'K3a-MULTI-EP-09', 'storage names', 'every frozen store domain and table name matches the SDK\'s dsh-storage UNIT_NAME_RE (dsh-storage-domain refuses others at open)', async (t) => {
    const dir = sdkDir(sdk)
    if (dir === null) return t.skip(sdkMissing(sdk))
    const grammar = (await importFile(path.join(dir, STORAGE_NAMES.entry)))[STORAGE_NAMES.exportName]
    assert.ok(grammar instanceof RegExp, 'the SDK exports its unit-name grammar')
    assert.equal(grammar.test(STORAGE_NAMES.refused), false, 'the grammar refuses a hyphenated table name')
    const c = await coreConstants()
    for (const { exportName, path: at } of STORAGE_NAMES.stores) {
      const store = at.reduce((value, key) => value[key], c[exportName])
      for (const name of [store.domain, store.table]) assert.ok(grammar.test(name), `${[exportName, ...at].join('.')}: '${name}' outside ${grammar}`)
    }
  })
  // ================================================================ core's copy of K1's identity values (drift)
  caseTest(sdk, 'K3a-MCP', 'identity', 'MCP.identity {name, uri, mimeType} equals K1 RESOURCE.identity', async () => {
    const { c, pub } = await both()
    sameSet(Object.keys(c.MCP.identity), MCP_MULTI.identityKeys, 'MCP.identity keys')
    assert.deepEqual(c.MCP.identity, pick(pub.RESOURCE.identity, MCP_MULTI.identityKeys))
  })
  caseTest(sdk, 'K3a-MCP', 'serverIdentity', 'MCP.serverIdentity {suffix, discoverMetaKey, updatedNotification} equals K1 SERVER_IDENTITY', async () => {
    const { c, pub } = await both()
    sameSet(Object.keys(c.MCP.serverIdentity), MCP_MULTI.serverIdentityKeys, 'MCP.serverIdentity keys')
    assert.deepEqual(c.MCP.serverIdentity, pick(pub.SERVER_IDENTITY, MCP_MULTI.serverIdentityKeys))
  })

  // ================================================================ SEAM_TARGETS (fishball-shared)
  caseTest(sdk, 'K3a-MULTI-EP-05', 'values', 'SEAM_TARGETS is deeply frozen and exactly as the README and the MULTI-1 list amendment freeze it', async () => {
    const s = await seam()
    assert.deepEqual(unfrozen(s, SEAM.exportName), [])
    assert.deepEqual(s, SEAM.values)
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'action routes', `every POST action route is under ${SEAM.actionPrefix}, one segment, unique, and the method is POST`, async () => {
    const { route } = await seam()
    const paths = SEAM.actions.map((k) => route[k])
    assert.deepEqual(paths.filter((p) => !p.startsWith(SEAM.actionPrefix) || p.slice(SEAM.actionPrefix.length).includes('/') || p === SEAM.actionPrefix), [])
    distinct(paths, 'action routes')
    sameSet(Object.keys(route).filter((k) => !SEAM.routeMeta.includes(k)), SEAM.actions, 'route path keys')
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'list route', `the list route is exactly ${SEAM.routeBase}, read with GET (≠ the actions' POST), and differs from every action route`, async () => {
    const { route } = await seam()
    assert.equal(route.list, SEAM.routeBase)
    assert.equal(route.read, SEAM.values.route.read)
    assert.notEqual(route.read, route.method)
    assert.equal(route.list.startsWith(SEAM.actionPrefix), false, 'the list route is under the action prefix')
    assert.deepEqual(SEAM.actions.filter((k) => route[k] === route.list), [])
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'http', 'SEAM_TARGETS.http statuses are distinct; ok, badRequest, notFound and unavailable equal K1 HTTP_STATUS; unavailableCode is not a K1 refusal', async () => {
    const [s, { pub }] = [await seam(), await both()]
    distinct(Object.values(s.http), 'http statuses')
    for (const [key, k1] of Object.entries(SEAM.k1Status)) assert.equal(s.http[key], pub.HTTP_STATUS[k1], key)
    assert.equal(Object.values(pub.REFUSAL).includes(s.unavailableCode), false, s.unavailableCode)
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'ask answers', 'the seam states the ask route\'s new answers: 404 unknown-target for an unknown handle, a voided card K1 expired (409)', async () => {
    const [s, { pub }] = [await seam(), await both()]
    const text = fs.readFileSync(SEAM.askAnswers.file, 'utf8')
    assert.deepEqual(SEAM.askAnswers.words.filter((w) => !w.test(text)).map(String), [])
    assert.equal(pub.REFUSAL[SEAM.voidedRefusal], SEAM.voidedRefusal, 'K1 REFUSAL.expired')
    assert.equal(s.refusal.unknownTarget, SEAM.values.refusal.unknownTarget)
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'words', 'state, kind, identity, placeholder, refusal and ask words are each distinct within their group', async () => {
    const s = await seam()
    for (const group of NAMES.wordGroups) distinct(Object.values(s[group]), group)
    distinct(Object.values(s.route.fields), 'route fields')
  })
  caseTest(sdk, 'K3a-MULTI-EP-05', 'refusals new', 'no target refusal word is already a K1 / K2 / K3a word (connector, tools, LINK, CONNECT, MCP, GUARDS, SEAM_STATUS)', async () => {
    const { c, pub } = await both()
    const shared = await uiSeam()
    const words = new Set()
    const walk = (v, seen = new Set()) => {
      if (typeof v === 'string') words.add(v)
      else if (v && typeof v === 'object' && !seen.has(v)) { seen.add(v); for (const [k, x] of Object.entries(v)) { words.add(k); walk(x, seen) } }
    }
    walk([pub, c.LINK, c.CONNECT, c.MCP, c.GUARDS, c.HOSTED_IMPORT, shared.SEAM_STATUS, shared.UI_SEAM])
    assert.deepEqual(Object.values((await seam()).refusal).filter((w) => words.has(w)), [])
  })

  // ---------------------------------------------------------------- SEAM_TARGETS against core's declarations
  for (const { type, key } of SEAM_UNIONS) {
    caseTest(sdk, 'K3a-DECL', type, `the declared ${type} union equals SEAM_TARGETS.${key}'s values`, async () => {
      needDeclarations(core())
      sameSet(literalUnion(core(), type), Object.values((await seam())[key]), type)
    })
  }
  caseTest(sdk, 'K3a-DECL', SEAM_DECL.snapshot, 'TargetsSnapshot.version is SEAM_TARGETS.snapshotVersion', async () => {
    const version = core().m.members(SEAM_DECL.snapshot).get(SEAM_DECL.version)
    assert.equal(version.type.trim(), String((await seam()).snapshotVersion))
  })
  caseTest(sdk, 'K3a-DECL', 'member', `FishballUi's member named SEAM_TARGETS.member is typed ${SEAM_DECL.targetsType}`, async () => {
    const found = member(core().m.members(SEAM_DECL.ui), (await seam()).member, { method: false })
    assert.equal(found.type.trim(), SEAM_DECL.targetsType)
  })
  caseTest(sdk, 'K3a-DECL', 'control', 'TargetView.control is SEAM_STATUS.control\'s words or null', async () => {
    const { SEAM_STATUS } = await uiSeam()
    const leaves = core().m.leaves(core().m.members(SEAM_DECL.view).get(SEAM_DECL.control).type)
    sameSet(leaves.filter((l) => l.literal !== undefined).map((l) => l.literal), Object.values(SEAM_STATUS.control), 'control literals')
    assert.deepEqual(leaves.filter((l) => l.literal === undefined).map((l) => l.other), [String(null)])
  })
  caseTest(sdk, 'K3a-DECL', 'voided', 'AskCard.state holds SEAM_TARGETS.ask.voided', async () => {
    const leaves = core().m.leaves(core().m.members(SEAM_DECL.askCard).get(SEAM_DECL.state).type)
    const { voided } = (await seam()).ask
    assert.ok(leaves.some((l) => l.literal === voided), JSON.stringify(leaves))
  })
  caseTest(sdk, 'K3a-DECL', 'route fields', 'the route body names equal FishballTargets\' parameters: targetId first, add(url), choose(…, choice, …), {confirmed}', async () => {
    const { route } = await seam()
    for (const name of [SEAM_DECL.remove, SEAM_DECL.setUrl, SEAM_DECL.choose]) assert.equal(targetsParams(name)[0].name, route.targetIdField, name)
    assert.equal(targetsParams(SEAM_DECL.add)[0].name, route.fields.url, SEAM_DECL.add)
    assert.equal(targetsParams(SEAM_DECL.setUrl)[1].name, route.fields.url, SEAM_DECL.setUrl)
    assert.equal(targetsParams(SEAM_DECL.choose)[1].name, route.fields.choice, SEAM_DECL.choose)
    for (const name of [SEAM_DECL.remove, SEAM_DECL.setUrl, SEAM_DECL.choose]) {
      assert.ok(core().m.members(targetsParams(name).at(-1).type).has(route.fields.confirmed), name + ' options lack ' + route.fields.confirmed)
    }
  })

  // ================================================================ hosted reservation: the instance's own copy of the names
  caseTest(sdk, 'K3a-HOST', 'instance copy', 'the instance\'s HOSTED credentialRef, savedRecord, childRow and targetField equal core\'s HOSTED_IMPORT', async () => {
    assert.ok(fs.existsSync(INSTANCE_COPY.file), INSTANCE_COPY.file + ' is missing')
    const copy = (await import(pathToFileURL(INSTANCE_COPY.file).href))[INSTANCE_COPY.exportName]
    const { HOSTED_IMPORT } = await coreConstants()
    assert.deepEqual(
      [copy.credentialRef, copy.savedRecord, copy.childRow, copy.targetField],
      [HOSTED_IMPORT.credentialRef, HOSTED_IMPORT.savedRecord.key, HOSTED_IMPORT.targetSetting.row, HOSTED_IMPORT.targetSetting.field],
    )
  })
}


/** The hex length of the digest algorithm's whole output (SHA-256: 64), from the algorithm itself. */
const toolNameDigestRoom = (T) => createHash(T.toolName.digestAlgorithm).digest(NAMES.hexEncoding).length
