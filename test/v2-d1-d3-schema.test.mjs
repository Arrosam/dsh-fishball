/** Requirements-only D1/D3 schemas. Public validator signatures confirmed by coordinator.
 * SDK-free; no host boot, credentials, profile, clocks or transport. Not executed yet.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import * as contract from '../packages/connector/contract/index.js'

const C = Object.freeze({
  timerfree: 'interaction.timerfree', signal: 'attention.signal',
  approvalRequest: 'approval.request', approvalList: 'approval.list',
  options: Object.freeze({ interactionTimerfree: true }),
  at: 1_800_000_000_000, expiresAt: 1_800_000_060_000,
  invalidSignals: Object.freeze([
    ['missing', {}], ['null', null], ['array', []], ['string', { important: 'true' }],
    ['number', { important: 1 }], ['null-importance', { important: null }],
    ['count', { important: false, unread: 1 }],
    ['timestamp', { important: true, latestAt: 1_800_000_000_000 }],
    ['clear', { important: false, clear: true }],
  ]),
})
const descriptor = () => ({
  approvalId: 'apr-d1', offerId: 'off-d1', kind: 'approval', prompt: 'Allow?',
  choices: ['allow'], title: 'D1 fixture', at: C.at, toolName: 'bash', callId: 'call-d1',
  reason: 'Fixture request', quotes: [],
})
const modes = Object.freeze([
  { name: 'legacy-default', options: undefined, deadline: true },
  { name: 'timerfree', options: C.options, deadline: false },
])
const surfaces = Object.freeze([
  { name: 'event', validate: (value, options) => contract.validateEvent(C.approvalRequest, value, options) },
  { name: 'list', validate: (value, options) => contract.validateResponse(C.approvalList, { approvals: [value] }, options) },
])

describe('V2 D1 descriptor mode decision table', () => {
  it('D1-SEMANTIC advertises the frozen optional semantic name', () => {
    assert.equal(contract.SEMANTIC_CAPABILITY.interactionTimerfree, C.timerfree)
  })
  for (const mode of modes) for (const surface of surfaces) for (const hasDeadline of [false, true]) {
    it(`D1-SCHEMA-${mode.name}-${surface.name}-expiresAt-${hasDeadline}`, () => {
      const value = { ...descriptor(), ...(hasDeadline ? { expiresAt: C.expiresAt } : {}) }
      const validate = () => surface.validate(value, mode.options)
      if (mode.deadline === hasDeadline) assert.doesNotThrow(validate)
      else assert.throws(validate)
    })
  }
})

describe('V2 D3 exact attention signal schemas (EP)', () => {
  it('D3-SIGNAL-NAME names the optional operation', () => {
    assert.equal(contract.OPERATION.attentionSignal, C.signal)
  })
  for (const important of [false, true]) {
    it(`D3-SIGNAL-${important} accepts the boolean partition`, () => {
      assert.doesNotThrow(() => contract.validateRequest(C.signal, { important }))
    })
  }
  for (const [label, payload] of C.invalidSignals) {
    it(`D3-SIGNAL-INVALID-${label} rejects rather than coercing or forwarding private state`, () => {
      assert.throws(() => contract.validateRequest(C.signal, payload))
    })
  }
  it('D3-ACK accepts exactly accepted true', () => {
    assert.doesNotThrow(() => contract.validateResponse(C.signal, { accepted: true }))
  })
  for (const payload of [{}, { accepted: false }, { accepted: true, count: 1 }]) {
    it(`D3-ACK-INVALID-${JSON.stringify(payload)}`, () => {
      assert.throws(() => contract.validateResponse(C.signal, payload))
    })
  }
})
