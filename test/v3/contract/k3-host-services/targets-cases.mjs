/**
 * K3 MULTI-0 rows (2026-11-18): the multiple-target declarations of core's contracts and the
 * withdrawn remote override in K3's child.d.ts (oracles: targets-constants.mjs). Named
 * "K3-MULTI-<technique>-<n>":
 * - EP: one partition per declaration (each interface's member set, each changed type);
 * - BVA: `apiVersion` is the literal 2 (not 1); TargetsSnapshot.version the literal 1; the ask
 *   states gain exactly one word; ReconnectRefusalCode loses exactly one;
 * - DT: the target-bound seams (bridge / attention): parameter count and the target parameter's shape.
 *
 * Level: unit, static reading of the `.d.ts` files with the K3 reader (declarations.mjs).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { caseTest } from '../package-boundaries/cases.mjs'
import { FOLDER, SERVICE } from './constants.mjs'
import { assertParams, contracts, member, needDeclarations, serviceMembers, vocabulary } from './contracts.mjs'
import { blankComments, syntaxErrors } from './declarations.mjs'
import {
  BOUND, LINE, MEMBERS, NULLABLE, PROVENANCE, RESERVATION, SECRET_MEMBER, SNAPSHOT_VERSION, TARGETS_EXPORTS, TARGETS_FILE, TYPES, WITHDRAWN_REMOTE,
} from './targets-constants.mjs'

const core = () => contracts(FOLDER.coreContracts)
const host = () => contracts(FOLDER.hostServices)
const sorted = (list) => [...list].sort()
const text = (c, file) => {
  assert.ok(c.texts.has(file), `no ${file} in ${c.dir}`)
  return c.texts.get(file)
}
const isNullable = (c, found) => c.m.leaves(found.type).some((l) => l.other === TYPES.nullLeaf || l.literal === TYPES.nullLeaf)
/** The literals of a type, asserting it is a closed vocabulary. */
const closedLiterals = (c, type) => {
  const v = vocabulary(c, type)
  assert.equal(v.open, false, `${type} is an open type`)
  return [...v.literals]
}

export function registerK3MultiCases(sdk) {
  // ------------------------------------------------------------------ the file and its exports
  caseTest(sdk, 'K3-MULTI-EP-01', 'parse', `core contracts hold ${TARGETS_FILE.file}, and it parses`, () => {
    needDeclarations(core())
    const t = text(core(), TARGETS_FILE.file)
    assert.deepEqual(syntaxErrors(new Map([[TARGETS_FILE.file, t]])), [])
  })
  caseTest(sdk, 'K3-MULTI-EP-01', 'exports', `${TARGETS_FILE.file} declares exactly the ${TARGETS_EXPORTS.length} names ${TARGETS_FILE.index} re-exports from it, and those are ${TARGETS_EXPORTS.join(', ')}`, () => {
    const declared = [...blankComments(text(core(), TARGETS_FILE.file)).matchAll(TARGETS_FILE.declared)].map((m) => m[1])
    const reExport = TARGETS_FILE.reExport.exec(blankComments(text(core(), TARGETS_FILE.index)))
    assert.ok(reExport, `${TARGETS_FILE.index} re-exports nothing from ./targets.js`)
    const reExported = reExport[1].split(',').map((s) => s.trim()).filter(Boolean)
    assert.deepEqual(sorted(declared), sorted(reExported), 'declared vs re-exported')
    assert.deepEqual(sorted(reExported), sorted(TARGETS_EXPORTS), 're-exported vs frozen list')
  })

  // ------------------------------------------------------------------ member sets
  for (const [type, names] of Object.entries(MEMBERS)) {
    caseTest(sdk, 'K3-MULTI-EP-02', type, `${type} has exactly ${names.join(', ')}`, () => {
      assert.deepEqual(sorted(core().m.members(type).keys()), sorted(names))
    })
  }
  for (const [type, names] of Object.entries(NULLABLE)) {
    caseTest(sdk, 'K3-MULTI-EP-02', `${type} null`, `${type}'s ${names.join(', ')} may be null (Q01: nothing before discovery; no suffix)`, () => {
      const members = core().m.members(type)
      assert.deepEqual(names.filter((n) => !isNullable(core(), members.get(n))), [])
    })
  }
  caseTest(sdk, 'K3-MULTI-EP-02', 'TargetView.line', 'TargetView.line is a required {kind: string, code: string | null} and nothing else', () => {
    const line = member(core().m.members(LINE.view), LINE.member, { method: false })
    assert.equal(line.optional, false)
    const fields = core().m.members(line.type)
    assert.deepEqual(sorted(fields.keys()), sorted(Object.keys(LINE.fields)))
    for (const [name, { type, nullable }] of Object.entries(LINE.fields)) {
      const leaves = core().m.leaves(fields.get(name).type).map((l) => l.other ?? l.literal)
      assert.deepEqual(sorted(leaves), sorted(nullable ? [type, TYPES.nullLeaf] : [type]), name)
      assert.equal(fields.get(name).optional, false, name + ' is optional')
    }
  })
  caseTest(sdk, 'K3-MULTI-BVA-01', 'snapshot version', `TargetsSnapshot.version is the literal ${SNAPSHOT_VERSION}`, () => {
    assert.deepEqual(closedLiterals(core(), core().m.members(TYPES.snapshot).get(TYPES.version).type), [SNAPSHOT_VERSION])
  })
  caseTest(sdk, 'K3-MULTI-EP-02', 'no secret', 'no member of TargetRecord, TargetView or TargetSource is named like a token or credential', () => {
    const found = TYPES.noSecret.flatMap((t) => [...core().m.members(t).keys()].filter((n) => SECRET_MEMBER.test(n)).map((n) => t + '.' + n))
    assert.deepEqual(found, [])
  })

  // ------------------------------------------------------------------ fishballInstance: apiVersion 2, target-bound seams
  caseTest(sdk, 'K3-MULTI-BVA-02', 'apiVersion', `fishballInstance.apiVersion is the literal ${BOUND.apiVersion.value} (MULTI-0; was 1)`, () => {
    const found = member(serviceMembers(core(), SERVICE.instance), BOUND.apiVersion.member, { method: false })
    assert.equal(found.type.trim(), BOUND.apiVersion.value)
  })
  caseTest(sdk, 'K3-MULTI-DT-01', 'extends', `${BOUND.instanceType} extends ${BOUND.type}: bridge and attention are its members`, () => {
    const decl = (core().m.decls.get(BOUND.instanceType) ?? []).find((d) => d.kind === TYPES.interfaceKind)
    assert.ok(decl?.extends.includes(BOUND.type), `${BOUND.instanceType} extends ${JSON.stringify(decl?.extends)}`)
    const members = serviceMembers(core(), SERVICE.instance)
    member(members, BOUND.bridge.name)
    member(members, BOUND.attention.member, { method: false })
  })
  /** The `{targetId: TargetId}` target parameter, the last one, required. */
  const assertTargetParam = (found, params) => {
    const list = assertParams(found, { params })
    const target = core().m.members(list.at(-1).type)
    assert.deepEqual([...target.keys()], [BOUND.targetField], `${found.name}'s last parameter is ${list.at(-1).type}`)
    assert.equal(target.get(BOUND.targetField).type.trim(), BOUND.targetIdType)
  }
  caseTest(sdk, 'K3-MULTI-DT-01', 'bridge', 'bridge(pluginId, operations, {targetId}): three required parameters, the last exactly {targetId: TargetId}', () => {
    assertTargetParam(member(core().m.members(BOUND.type), BOUND.bridge.name), BOUND.bridge.params)
  })
  caseTest(sdk, 'K3-MULTI-DT-01', 'attention', 'attention.signal(pluginId, input, {targetId}): three required parameters, the last exactly {targetId: TargetId}', () => {
    const attention = core().m.members(member(core().m.members(BOUND.type), BOUND.attention.member, { method: false }).type)
    assertTargetParam(member(attention, BOUND.attention.method), BOUND.attention.params)
  })

  // ------------------------------------------------------------------ provenance on cards and events
  for (const type of [PROVENANCE.askCard, PROVENANCE.event]) {
    caseTest(sdk, 'K3-MULTI-EP-03', `${type}.source`, `${type} has a required source: TargetSource`, () => {
      const found = member(core().m.members(type), PROVENANCE.sourceField, { method: false })
      assert.equal(found.type.trim(), PROVENANCE.sourceType)
      assert.equal(found.optional, false)
    })
  }
  caseTest(sdk, 'K3-MULTI-EP-03', 'AskCard.handle', 'AskCard has a required handle: string', () => {
    const found = member(core().m.members(PROVENANCE.askCard), PROVENANCE.handleField, { method: false })
    assert.equal(found.type.trim(), PROVENANCE.stringType)
    assert.equal(found.optional, false)
  })
  caseTest(sdk, 'K3-MULTI-BVA-03', 'AskCard.state', `AskCard.state is exactly ${PROVENANCE.askStates.join(', ')} (voided added, Q07)`, () => {
    assert.deepEqual(sorted(closedLiterals(core(), core().m.members(PROVENANCE.askCard).get(PROVENANCE.stateField).type)), sorted(PROVENANCE.askStates))
  })

  // ------------------------------------------------------------------ hosted reservation and the withdrawn remote override
  caseTest(sdk, 'K3-MULTI-BVA-04', 'reconnect', `${WITHDRAWN_REMOTE.refusalType} is exactly ${WITHDRAWN_REMOTE.refusals.join(', ')}: ${WITHDRAWN_REMOTE.code} withdrawn`, () => {
    assert.deepEqual(sorted(closedLiterals(host(), WITHDRAWN_REMOTE.refusalType)), sorted(WITHDRAWN_REMOTE.refusals))
  })
  caseTest(sdk, 'K3-MULTI-EP-04', 'child.d.ts', `no host-services declaration code holds the literal ${WITHDRAWN_REMOTE.code}`, () => {
    const literal = new RegExp(`(['"])${WITHDRAWN_REMOTE.code}\\1`)
    assert.deepEqual([...host().texts].filter(([, t]) => literal.test(blankComments(t))).map(([f]) => f), [])
  })
  caseTest(sdk, 'K3-MULTI-EP-04', 'README', `host-services README's reconnect() row names ${WITHDRAWN_REMOTE.code} only as withdrawn`, () => {
    const rows = fs.readFileSync(WITHDRAWN_REMOTE.readme, 'utf8').split('\n').filter((l) => WITHDRAWN_REMOTE.reconnectRow.test(l))
    assert.equal(rows.length, 1, 'reconnect() rows: ' + rows.length)
    const listed = rows[0].split(WITHDRAWN_REMOTE.clause).filter((c) => c.includes(WITHDRAWN_REMOTE.code) && !WITHDRAWN_REMOTE.withdrawnWord.test(c))
    assert.deepEqual(listed, [], `${WITHDRAWN_REMOTE.code} is still listed as a refusal`)
  })
  caseTest(sdk, 'K3-MULTI-EP-04', 'link.d.ts', `${RESERVATION.file} states the hosted reservation (parent id, read-only, not removable, names owned by the parent alone)`, () => {
    const t = text(core(), RESERVATION.file)
    assert.deepEqual(RESERVATION.words.filter((w) => !w.test(t)).map(String), [])
  })
}
