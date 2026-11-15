/**
 * K1c black-box rows: the managed-state seam frozen in `dsh-connector/mcp-schema` (spec and
 * oracles: k1c-constants.mjs). Written from Fishball's K1c spec, the README and index.d.ts only; no
 * K1c implementation file was read.
 *
 * Each row is named "K1c-<technique>-<n> row <r> [SDK x] …" with one technique: EP, BVA or DT.
 * Level: unit over the loaded module's data, its declaration file and README read as text (as the
 * K1 and K1b rows), and over core's vendored copy loaded from packages/core/vendor/. ManagedState
 * has no implementation in K1c (C-ROUTE builds it), so no row drives its behaviour.
 *
 * Vendor byte equality: F-LINK's row "done 7" (test/v3/f-link/cases.mjs) runs the generator and
 * checks that every vendored file equals its connector source and the committed copy; it is not
 * repeated here. These rows check what K1c adds to the copy.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { blankComments, model, splitTop } from '../k3/declarations.mjs'
import { REPO } from '../../support/constants.mjs'
import { caseTest, declarationText } from './cases.mjs'
import { SCHEMA_MODULE } from './constants.mjs'
import {
  CODE_TYPE, DECLARED_EXPORT, DTS_PARTS, K1C_TYPES, K2_SHARED, MANAGED_RECORD, MANAGED_REFUSAL_NAME, MANAGED_REFUSAL_VALUES, MANAGED_STATE,
  NOTICE_SHAPE, README, REFUSAL_KEY_OF, RESULT_FIELDS, RESULTS, VENDORED_ENTRY,
} from './k1c-constants.mjs'
import { toolsModule } from './schema-module.mjs'

const isObject = (v) => v !== null && typeof v === 'object'
const sorted = (list) => [...list].sort()
const squash = (s) => s.replace(/\s+/g, ' ').trim()
const exported = (mod, name) => {
  assert.ok(isObject(mod[name]), name + ' is not exported as an object')
  return mod[name]
}

/** index.d.ts as code (comments blanked, whitespace-only lines dropped, as K1b reads it) and its model. */
function declarations() {
  const [file, text] = declarationText()
  const code = blankComments(text).replace(/\n[ \t]*(?=\n)/g, '')
  return { text, code: blankComments(text), m: model(new Map([[file, code]])) }
}
/** The union branches of a declared type alias (no nesting: both K1c results are flat unions). */
function aliasBranches(m, name) {
  const alias = (m.decls.get(name) ?? []).find((d) => d.kind === 'alias')
  assert.ok(alias, `${name} is not a declared type alias`)
  return splitTop(alias.raw, '|').map((p) => p.text.trim())
}
const memberType = (m, type, name) => m.members(type).get(name)?.type?.trim()
/** The object type text of `export declare const <name>: { … }` (code text, braces matched). */
function declaredConstType(code, name) {
  const at = new RegExp(String.raw`export\s+declare\s+const\s+${name}\s*:`).exec(code)
  assert.ok(at, `index.d.ts has no export declare const ${name}`)
  const open = code.indexOf('{', at.index + at[0].length)
  let depth = 0
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth += 1
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1)
  }
  return code.slice(open)
}
const unquote = (t) => t?.replace(/^(['"])(.*)\1$/, '$2')

/** The README, and the body of the `## …` section whose heading starts with `heading`. */
const readme = () => fs.readFileSync(path.join(REPO, SCHEMA_MODULE.folder, README.file), 'utf8')
function section(text, heading) {
  const start = text.indexOf(heading)
  assert.ok(start >= 0, `README has no "${heading}" section`)
  const rest = text.slice(start + heading.length)
  const end = rest.search(README.nextSection)
  return end < 0 ? rest : rest.slice(0, end)
}
/** The table rows (lines starting with `|`) of a section whose first cell is `id`. */
const rowsWithId = (body, id) => body.split('\n').filter((l) => l.trim().startsWith('|') && l.split('|')[1]?.trim() === id)

const vendored = () => import(pathToFileURL(VENDORED_ENTRY).href)

export function registerK1cCases(sdk) {
  // ======================================================================================
  // Spec 1: MANAGED_REFUSAL, its values and their one owner
  // ======================================================================================
  caseTest(sdk, 'K1c-EP-01', 1, `${MANAGED_REFUSAL_NAME} is exported, frozen and exactly {${Object.entries(MANAGED_REFUSAL_VALUES).map(([k, v]) => `${k}: ${v}`).join(', ')}}`, (mod) => {
    const refusal = exported(mod, MANAGED_REFUSAL_NAME)
    assert.ok(Object.isFrozen(refusal), MANAGED_REFUSAL_NAME + ' is not frozen')
    assert.deepEqual({ ...refusal }, MANAGED_REFUSAL_VALUES)
  })
  caseTest(sdk, 'K1c-EP-01', 2, `${MANAGED_REFUSAL_NAME} is a plain object of three distinct strings: no array, no extra or inherited key`, (mod) => {
    const refusal = exported(mod, MANAGED_REFUSAL_NAME)
    assert.ok(!Array.isArray(refusal), 'is an array')
    assert.deepEqual(Reflect.ownKeys(refusal).sort(), sorted(Object.keys(MANAGED_REFUSAL_VALUES)))
    const values = Object.values(refusal)
    assert.ok(values.every((v) => typeof v === 'string'), 'a value is not a string')
    assert.equal(new Set(values).size, values.length, 'two keys share one code')
  })
  for (const [key, refusalKey] of Object.entries(REFUSAL_KEY_OF)) {
    caseTest(sdk, 'K1c-DT-01', key, `${MANAGED_REFUSAL_NAME}.${key} === REFUSAL.${refusalKey} (one owner per value)`, (mod) => {
      const refusals = exported(mod, 'REFUSAL')
      assert.equal(typeof refusals[refusalKey], 'string', `REFUSAL.${refusalKey} is not exported`)
      assert.equal(exported(mod, MANAGED_REFUSAL_NAME)[key], refusals[refusalKey])
    })
  }
  for (const key of K2_SHARED.keys) {
    caseTest(sdk, 'K1c-DT-02', key, `${MANAGED_REFUSAL_NAME}.${key} (${MANAGED_REFUSAL_VALUES[key]}) is in K2's ${K2_SHARED.exportName}`, async (mod) => {
      const shared = (await toolsModule(sdk))[K2_SHARED.exportName]
      assert.ok(Array.isArray(shared), `K2 exports no ${K2_SHARED.exportName}`)
      assert.ok(shared.includes(exported(mod, MANAGED_REFUSAL_NAME)[key]), `${shared} lacks ${MANAGED_REFUSAL_VALUES[key]}`)
    })
  }

  // ======================================================================================
  // Spec 2: NOTICE.codes stays empty
  // ======================================================================================
  caseTest(sdk, 'K1c-BVA-01', 1, `${NOTICE_SHAPE.name}.codes is a frozen plain object with 0 keys (no notice code frozen)`, (mod) => {
    const codes = exported(mod, NOTICE_SHAPE.name).codes
    assert.ok(isObject(codes) && !Array.isArray(codes), 'codes is not a plain object')
    assert.ok(Object.isFrozen(codes), 'codes is not frozen')
    assert.equal(Reflect.ownKeys(codes).length, 0, `codes has ${String(Reflect.ownKeys(codes).map(String))}`)
  })
  caseTest(sdk, 'K1c-EP-02', 1, `${NOTICE_SHAPE.name} keeps exactly {${NOTICE_SHAPE.fields}}, codeGrammar a RegExp; index.d.ts types codes as an empty record`, (mod) => {
    const notice = exported(mod, NOTICE_SHAPE.name)
    assert.deepEqual(sorted(Object.keys(notice)), sorted(NOTICE_SHAPE.fields))
    assert.ok(notice.codeGrammar instanceof RegExp, 'codeGrammar is not a RegExp')
    const { code, m } = declarations()
    assert.match(memberType(m, declaredConstType(code, NOTICE_SHAPE.name), 'codes') ?? '', NOTICE_SHAPE.emptyCodesType)
  })

  // ======================================================================================
  // Spec 3: the declarations
  // ======================================================================================
  caseTest(sdk, 'K1c-EP-03', 1, `index.d.ts declares ${K1C_TYPES.join(', ')} in its internal-interfaces part, and stays valid TypeScript`, async () => {
    const { text, code, m } = declarations()
    assert.deepEqual(K1C_TYPES.filter((n) => !m.decls.has(n)), [], 'types not declared')
    const from = text.indexOf(DTS_PARTS.internal)
    const to = text.indexOf(DTS_PARTS.runtime)
    assert.ok(from >= 0 && to > from, 'index.d.ts has no internal-interfaces part before its runtime exports')
    const outside = K1C_TYPES.filter((n) => {
      const at = new RegExp(String.raw`\b(?:interface|type)\s+${n}\b`).exec(code)?.index ?? -1
      return at < from || at > to
    })
    assert.deepEqual(outside, [], 'declared outside the internal-interfaces part')
    const { stripTypeScriptTypes } = await import('node:module')
    assert.doesNotThrow(() => stripTypeScriptTypes(text, { mode: 'strip' }))
  })
  caseTest(sdk, 'K1c-EP-04', 1, `${MANAGED_STATE.name} has exactly the five members ${Object.keys(MANAGED_STATE.members).join(', ')}`, () => {
    const { m } = declarations()
    assert.deepEqual(sorted(m.members(MANAGED_STATE.name).keys()), sorted(Object.keys(MANAGED_STATE.members)))
  })
  for (const [name, { params, returns }] of Object.entries(MANAGED_STATE.members)) {
    caseTest(sdk, 'K1c-EP-04', name, `${MANAGED_STATE.name}.${name}(${params.join(', ')}): ${returns}`, () => {
      const { m } = declarations()
      const found = m.members(MANAGED_STATE.name).get(name)
      assert.ok(found?.method, `${MANAGED_STATE.name}.${name} is not a method`)
      assert.ok(!found.optional, `${MANAGED_STATE.name}.${name} is optional`)
      assert.deepEqual(found.params.map((p) => squash(`${p.name}${p.optional ? '?' : ''}: ${p.type}`)), params)
      assert.equal(squash(found.returns), returns)
    })
  }
  caseTest(sdk, 'K1c-EP-05', 1, `${MANAGED_RECORD.name} is exactly {readonly ${Object.entries(MANAGED_RECORD.members).map(([k, t]) => `${k}: ${t}`).join('; readonly ')}}`, () => {
    const { text, m } = declarations()
    const members = m.members(MANAGED_RECORD.name)
    assert.deepEqual(sorted(members.keys()), sorted(Object.keys(MANAGED_RECORD.members)))
    for (const [k, t] of Object.entries(MANAGED_RECORD.members)) {
      assert.ok(!members.get(k).optional && !members.get(k).method, `${k} is not a required field`)
      assert.equal(members.get(k).type.trim(), t)
    }
    // `readonly` is not kept by the member reader: read each field's own line in the interface body.
    const body = /\binterface\s+ManagedRecord\s*\{([^}]*)\}/.exec(blankComments(text))?.[1] ?? ''
    const lines = body.split(/[\n;]/).filter((l) => l.trim() !== '')
    assert.deepEqual(lines.filter((l) => !MANAGED_RECORD.readonly.test(l)).map((l) => l.trim()), [], 'fields without readonly')
  })
  for (const [result, keys] of Object.entries(RESULTS)) {
    caseTest(sdk, 'K1c-DT-03', result, `${result} = {ok: true} | {ok: false; code: ${keys.map((k) => `typeof ${MANAGED_REFUSAL_NAME}.${k}`).join(' | ')}}`, () => {
      const { m } = declarations()
      const all = aliasBranches(m, result)
      assert.equal(all.length, 2, `${result} has ${all.length} branches`)
      const ok = all.filter((b) => memberType(m, b, RESULT_FIELDS.ok) === RESULT_FIELDS.true)
      const refused = all.filter((b) => memberType(m, b, RESULT_FIELDS.ok) === RESULT_FIELDS.false)
      assert.equal(ok.length, 1, 'no single {ok: true} branch')
      assert.deepEqual([...m.members(ok[0]).keys()], [RESULT_FIELDS.ok], 'the ok branch carries more than ok')
      assert.equal(refused.length, 1, 'no single {ok: false} branch')
      assert.deepEqual(sorted(m.members(refused[0]).keys()), sorted([RESULT_FIELDS.ok, RESULT_FIELDS.code]))
      const codes = splitTop(memberType(m, refused[0], RESULT_FIELDS.code) ?? '', '|').map((p) => CODE_TYPE.exec(p.text.trim())?.[1])
      assert.deepEqual(sorted(codes), sorted(keys))
    })
  }
  caseTest(sdk, 'K1c-EP-06', 1, `export declare const ${MANAGED_REFUSAL_NAME} has exactly the literal types ${Object.values(MANAGED_REFUSAL_VALUES).map((v) => `"${v}"`).join(', ')}`, () => {
    const { code, m } = declarations()
    const members = m.members(declaredConstType(code, MANAGED_REFUSAL_NAME))
    assert.deepEqual(sorted(members.keys()), sorted(Object.keys(MANAGED_REFUSAL_VALUES)))
    for (const [k, v] of Object.entries(MANAGED_REFUSAL_VALUES)) {
      const t = members.get(k).type.trim()
      assert.match(t, /^(['"]).*\1$/, `${k} is typed ${t}, not a literal`)
      assert.equal(unquote(t), v)
    }
  })
  // No K1 row checked that the runtime exports and the `export declare` lines name the same set
  // (K1b-EP-03 and K1-AMEND-8 check named constants only), so this row covers MANAGED_REFUSAL and every other export.
  caseTest(sdk, 'K1c-EP-07', 1, 'the runtime exports and index.d.ts\'s export declare lines name the same set (MANAGED_REFUSAL included)', (mod) => {
    const { code } = declarations()
    const declared = new Set([...code.matchAll(DECLARED_EXPORT)].map((x) => x[1]))
    const runtime = new Set(Object.keys(mod))
    assert.ok(runtime.has(MANAGED_REFUSAL_NAME) && declared.has(MANAGED_REFUSAL_NAME), `${MANAGED_REFUSAL_NAME} is not both exported and declared`)
    assert.deepEqual({ undeclared: [...runtime].filter((n) => !declared.has(n)).sort(), missing: [...declared].filter((n) => !runtime.has(n)).sort() }, { undeclared: [], missing: [] })
  })

  // ======================================================================================
  // Spec 4: README decisions
  // ======================================================================================
  caseTest(sdk, 'K1c-EP-08', 1, `README has a heading "${README.section}"`, () => {
    const headings = readme().split('\n').filter((l) => README.heading.test(l)).map((l) => l.replace(README.heading, '').trim())
    assert.ok(headings.includes(README.section), 'no such heading')
  })
  caseTest(sdk, 'K1c-EP-08', 2, `README "Internal module interfaces" names ${README.interfaceName}`, () => {
    assert.ok(section(readme(), README.interfaces).includes(README.interfaceName))
  })
  caseTest(sdk, 'K1c-BVA-02', 1, `README "User decisions" has exactly the rows ${README.rows.map((r) => r.id).join(', ')}, once each and in order (no K1c-0, no K1c-5)`, () => {
    const body = section(readme(), README.decisions)
    const ids = body.split('\n').map((l) => /^\|\s*(K1c-\d+)\s*\|/.exec(l.trim())?.[1]).filter(Boolean)
    assert.deepEqual(ids, README.rows.map((r) => r.id))
  })
  for (const { id, words } of README.rows) {
    caseTest(sdk, 'K1c-EP-09', id, `README decision ${id} is "${README.decidedBy}" and says ${words.map(String).join(', ')}`, () => {
      const rows = rowsWithId(section(readme(), README.decisions), id)
      assert.equal(rows.length, 1, `${rows.length} rows ${id}`)
      assert.ok(rows[0].includes(README.decidedBy), `${id} is not marked "${README.decidedBy}"`)
      assert.deepEqual(words.filter((w) => !w.test(rows[0])).map(String), [], `${id} does not say`)
    })
  }
  caseTest(sdk, 'K1c-DT-04', 'notice', 'README "Left to a task": the notice-codes row names C-ROUTE only as producing none', () => {
    const rows = section(readme(), README.leftToTask).split('\n').filter((l) => l.trim().startsWith('|') && README.noticeRow.test(l))
    assert.ok(rows.length > 0, 'no notice-codes row')
    const producer = rows.flatMap((r) => r.split(README.clause)).filter((c) => README.route.test(c) && !README.producesNone.test(c))
    assert.deepEqual(producer.map((c) => c.trim()), [], 'C-ROUTE is still named as a producer of notice codes')
  })
  caseTest(sdk, 'K1c-DT-04', 'release', `README "Left to a task" no longer leaves "release emits nothing?" open; where it names it, it cites ${README.releaseDecision}`, () => {
    const body = section(readme(), README.leftToTask)
    assert.doesNotMatch(body, README.releaseOpen)
    const naming = body.split('\n').filter((l) => README.releaseNamed.test(l))
    assert.deepEqual(naming.filter((l) => !l.includes(README.releaseDecision)), [], 'names the release question without its decision')
  })

  // ======================================================================================
  // Spec 5: core's vendored copy (byte equality: F-LINK "done 7")
  // ======================================================================================
  caseTest(sdk, 'K1c-EP-10', 1, `core's vendored mcp-schema exports the same frozen ${MANAGED_REFUSAL_NAME}`, async () => {
    const refusal = exported(await vendored(), MANAGED_REFUSAL_NAME)
    assert.ok(Object.isFrozen(refusal), 'not frozen')
    assert.deepEqual({ ...refusal }, MANAGED_REFUSAL_VALUES)
  })
  caseTest(sdk, 'K1c-EP-10', 2, `core's vendored mcp-schema has the same empty frozen ${NOTICE_SHAPE.name}.codes`, async () => {
    const codes = exported(await vendored(), NOTICE_SHAPE.name).codes
    assert.ok(isObject(codes) && Object.isFrozen(codes), 'codes is not a frozen object')
    assert.equal(Reflect.ownKeys(codes).length, 0)
  })
}
