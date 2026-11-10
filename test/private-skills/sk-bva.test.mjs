/**
 * T-SK Boundary Value Analysis: BVA-12 name grammar, plus description, body and catalog-size
 * boundaries (docs/test-design/private-skills.md §4). No upper length/size limit or deadline is
 * specified, so none is tested (BVA-12 forbids inventing one).
 *
 * `SK-BVA-*-N` executable premises check each value against the installed SDK's own
 * `isSkillName`, because S6 adopts DSH's grammar. The matching SK cases are todos.
 */
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { NAME_BVA } from './support/constants.mjs'
import { perSdk, todoSk } from './support/fixtures.mjs'
import { loadSdk } from './support/native-oracle.mjs'

const label = (value) => JSON.stringify(value)

const NAME_CASES = NAME_BVA.map(([value, valid, boundary], index) => [
  `SK-BVA-12-${String(index + 1).padStart(2, '0')}`,
  `name ${label(value)} (${boundary}): create ${valid ? 'is accepted and loads natively under that name' : 'is refused with a validation error before any path use, and no skill is created or changed'}. The same holds for read, update and remove.`,
])

const CONTENT_CASES = [
  ['SK-BVA-D-01', 'description "" (length 0): create and update refused with a validation error naming description; the prior version is intact.'],
  ['SK-BVA-D-02', 'description " " (length 1, whitespace only): refused (Q4, trim then nonempty), although native would accept it.'],
  ['SK-BVA-D-03', 'description "a" (length 1, after trimming): accepted; native load returns a description whose trimmed value is "a".'],
  ['SK-BVA-D-04', 'description " a " (surrounding whitespace, trimmed length 1): accepted. Whether the stored text keeps the spaces is not specified, so it is not asserted; trimmed it equals "a".'],
  ['SK-BVA-B-01', 'body "" (length 0): create and update refused with a validation error naming the body (Q3).'],
  ['SK-BVA-B-02', 'body " \\n\\t" (whitespace only): refused (Q3).'],
  ['SK-BVA-B-03', 'body "x" (one non-whitespace character): accepted; native load returns body "x".'],
  ['SK-BVA-C-01', 'library with 0 skills (root absent, or present and empty): list succeeds with an empty complete catalog; this is not an error.'],
  ['SK-BVA-C-02', 'library with 1 skill: list returns exactly that one; after removing it, list returns 0.'],
  ['SK-BVA-C-03', 'library with 2 skills: removing one leaves exactly the other, byte-identical.'],
]

perSdk('T-SK BVA (SK-owned)', () => todoSk([...NAME_CASES, ...CONTENT_CASES]))

perSdk('T-SK BVA native-oracle premises', (version) => {
  NAME_BVA.forEach(([value, valid, boundary], index) => {
    it(`SK-BVA-12-${String(index + 1).padStart(2, '0')}-N native grammar: ${label(value)} (${boundary}) is ${valid ? 'valid' : 'invalid'}`, async () => {
      const { isSkillName } = await loadSdk(version)
      assert.equal(isSkillName(value), valid)
    })
  })
})
