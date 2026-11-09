/** D2 retained inert configuration, partitions derived only from requirements. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadConnector } from './support/body-soul-env.mjs'
const { Config, readLimits, readQuestionMode } = await loadConnector('src/config.js')
const CASES = Object.freeze([
  ['object', { retired: true }, { retired: true }],
  ['null', null, null],
  ['user-negative', 'user', -1],
  ['unknown-string', 'unknown-mode', 'not-a-duration'],
])
describe('V2 D2 retains ignored legacy config without validation/coercion', () => {
  for (const [name, questionMode, approvalAnswerSeconds] of CASES) {
    it('D2-RETAIN-' + name, () => {
      const input = { questionMode, approvalAnswerSeconds }
      const value = Config(input)
      assert.deepEqual(value.questionMode, questionMode)
      assert.deepEqual(value.approvalAnswerSeconds, approvalAnswerSeconds)
      assert.equal(readQuestionMode(value), 'fishball')
      assert.equal(Object.hasOwn(readLimits(value), 'approvalAnswerSeconds'), false)
    })
  }
})
