/**
 * Requirements-only MULTI-0 review regressions. EP/BVA/DT/ST are obligations of the public
 * freeze, not claimed tests of absent MULTI-1 runtime. No fake binding, callback, selector or
 * framing algorithm is executed: declarations/comments/examples are the system under test.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { caseTest } from '../package-boundaries/cases.mjs'
import { assertParams, member, needDeclarations } from '../k3-host-services/contracts.mjs'
import { blankComments } from '../k3-host-services/declarations.mjs'
import { core, coreConstants, importFile } from './surface.mjs'
import {
  BINDING_OBLIGATIONS, DESCRIPTION_EXPECTED, FRAMING_EXAMPLE as E, FRAMING_OBLIGATIONS, SECURITY_SURFACE as S, SELECTOR_OBLIGATIONS,
} from './multi-security-constants.mjs'

const sorted = (values) => [...values].sort()
const publicText = (file) => fs.readFileSync(path.join(core().dir, file), 'utf8')
/** Preserve evidence ownership: absent sections/comments cannot be filled by unrelated prose. */
function normativeEvidence(scope) {
  const readme = publicText('README.md')
  const start = readme.indexOf(scope.readmeStart)
  const end = readme.indexOf(scope.readmeEnd, start)
  assert.ok(start >= 0 && end > start, `missing owning README section ${scope.readmeStart}`)
  const blocks = { readme: readme.slice(start, end) }
  for (const [name, source] of Object.entries(scope.comments)) {
    const matches = (publicText(source.file).match(/\/\*[\s\S]*?\*\//g) ?? []).filter((text) => text.includes(source.contains))
    assert.equal(matches.length, 1, `${source.file} must retain its owning comment: ${source.contains}`)
    blocks[name] = source.from ? matches[0].slice(matches[0].indexOf(source.from)) : matches[0]
  }
  return Object.fromEntries(Object.entries(blocks).map(([name, text]) => [name, text.replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ')]))
}

function exportedInterface(name) {
  needDeclarations(core())
  const declarations = core().m.decls.get(name) ?? []
  assert.ok(declarations.some((d) => d.kind === 'interface'), `${name} must be an interface`)
  assert.match(blankComments(publicText(S.targetsFile)), S.interfaceExport(name), `${name} must be exported`)
  const exports = [...blankComments(publicText(S.indexFile)).matchAll(S.targetReExport)].flatMap((m) => m[1].split(',').map((s) => s.trim()))
  assert.ok(exports.includes(name), `${S.indexFile} must re-export ${name}`)
  return core().m.members(name)
}

export function registerMultiSecurityCases(sdk) {
  caseTest(sdk, 'K3a-MULTI-SEC-EP', 'binding declaration', 'TargetCredentialBinding is publicly exported with all four required readonly binding fields', () => {
    const fields = exportedInterface(S.bindingType)
    assert.deepEqual(sorted(fields.keys()), sorted(Object.keys(S.bindingMembers)))
    const body = E.declarationBody(S.bindingType).exec(blankComments(publicText(S.targetsFile)))?.[1]
    assert.ok(body, 'missing binding interface body')
    for (const [name, type] of Object.entries(S.bindingMembers)) {
      const field = member(fields, name, { method: false })
      assert.equal(field.optional, false, `${name} cannot be optional`)
      assert.equal(field.type.trim(), type, `${name} type`)
      assert.match(body, S.readonlyField(name), `${name} must be readonly`)
    }
  })
  caseTest(sdk, 'K3a-MULTI-SEC-EP', 'binding record field', 'TARGETS.credentials.bindingField is binding; fixed parent reference and saved-record spellings are unchanged', async () => {
    const { TARGETS, HOSTED_IMPORT } = await coreConstants()
    assert.equal(TARGETS.credentials.bindingField, S.bindingField)
    assert.equal(HOSTED_IMPORT.credentialRef, S.parent.ref)
    assert.equal(HOSTED_IMPORT.savedRecord.key, S.parent.saved)
  })
  for (const [scope, obligations] of [[S.scopes.binding, BINDING_OBLIGATIONS], [S.scopes.framing, FRAMING_OBLIGATIONS], [S.scopes.selector, SELECTOR_OBLIGATIONS]]) {
    for (const obligation of obligations) {
      caseTest(sdk, `K3a-MULTI-SEC-${obligation.technique}`, obligation.row, obligation.title, () => {
        const evidence = normativeEvidence(scope)
        for (const { block, patterns } of obligation.clauses) {
          const missing = patterns.filter((pattern) => !pattern.test(evidence[block]))
          assert.deepEqual(missing.map(String), [], `${block}: public freeze must state: ${obligation.title}`)
        }
      })
    }
  }
  caseTest(sdk, 'K3a-MULTI-SEC-DT', 'selector declaration', 'TargetSelector exports targetId plus optional endpointEpoch; targetId-only callers remain type-compatible', () => {
    const fields = exportedInterface(S.selectorType)
    assert.deepEqual(sorted(fields.keys()), sorted(Object.keys(S.selectorMembers)))
    for (const [name, expected] of Object.entries(S.selectorMembers)) {
      const field = member(fields, name, { method: false })
      assert.equal(field.type.trim(), expected.type, `${name} type`)
      assert.equal(field.optional, expected.optional, `${name} optionality`)
    }
  })
  for (const seam of S.seams) {
    caseTest(sdk, 'K3a-MULTI-SEC-DT', seam.name, `${seam.name} keeps its three required parameters and takes the public TargetSelector as its final parameter`, () => {
      const bound = core().m.members(S.boundType)
      const owner = seam.owner === S.boundType ? bound : core().m.members(member(bound, seam.owner, { method: false }).type)
      const params = assertParams(member(owner, seam.method), { params: 3 })
      assert.equal(params.at(-1).type.trim(), S.selectorType)
    })
  }
  for (const sample of DESCRIPTION_EXPECTED.samples) {
    caseTest(sdk, 'K3a-MULTI-SEC-BVA', sample.row, 'toolSource is still the one-argument inner-only formatter, preserving the complete JSON-encoded name', async () => {
      const format = (await coreConstants()).TARGETS.text.toolSource
      const encoded = JSON.stringify(sample.name)
      assert.equal(format.length, DESCRIPTION_EXPECTED.arity)
      assert.equal(format(encoded), DESCRIPTION_EXPECTED.prefix + encoded + DESCRIPTION_EXPECTED.suffix)
    })
  }
  caseTest(sdk, 'K3a-MULTI-SEC-DT', 'normative framing example', 'the executable usage example frames only JSON toolSource with a fresh local marker, followed by the trusted facade', async () => {
    normativeEvidence(S.scopes.framing)
    // Whitespace-normalized prose is for clause matching; execute the original fenced source.
    const readme = publicText('README.md')
    const start = readme.indexOf(S.scopes.framing.readmeStart)
    const source = readme.slice(start, readme.indexOf(S.scopes.framing.readmeEnd, start))
    const code = [...source.matchAll(E.blocks)].map((m) => m[1])
    assert.equal(code.length, 1, 'one executable normative framing example')
    const script = new vm.Script(code[0] + E.completion)
    const { TARGETS } = await coreConstants()
    const { TEXT } = await importFile(path.join(path.dirname(core().dir), ...E.bridgeConstants))
    const markers = new Set()
    // Execute the actual documentation example, not a test-owned composition algorithm.
    for (const sample of DESCRIPTION_EXPECTED.samples) {
      for (const repeat of [false, true]) {
        const generated = []
        const result = script.runInNewContext({
          TEXT, TARGETS, name: sample.name, trustedDescription: E.trustedTail,
          randomUUID: () => { const marker = randomUUID(); generated.push(marker); return marker },
        }, { timeout: E.timeoutMs })
        assert.deepEqual(generated, [result.marker], `${sample.row}/${repeat}: marker must be locally generated exactly once`)
        assert.equal(markers.has(result.marker), false, 'every assembly gets a fresh marker')
        markers.add(result.marker)
        const expected = [TEXT.untrustedOpen(result.marker), DESCRIPTION_EXPECTED.prefix + JSON.stringify(sample.name) + DESCRIPTION_EXPECTED.suffix, TEXT.untrustedClose(result.marker), E.trustedTail].join(TEXT.lineEnd)
        assert.equal(result.description, expected, `${sample.row}: exact framing excludes raw names or extra prose outside the block`)
      }
    }
  })
}
