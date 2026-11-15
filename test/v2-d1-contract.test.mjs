/** D1 black-box contract coverage. Requirements supplied 2026-11-09; no implementation read.
 * Deliberately SDK-free: the public contract is imported directly, avoiding node_modules
 * link creation and resolver defaults pointing at a live DSH installation.
 * Negotiating a version alone does NOT establish interaction.timerfree capability.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CONNECTOR_CONTRACT, negotiateContract, validateAttachment } from '../packages/dsh-connector/contract/index.js'

const D1 = Object.freeze({
  contractId: 'dsh-connector', major: 1, minor: 2,
  minors: Object.freeze([0, 1, 2, 3]),
  instanceId: 'd1-legacy-fixture', instanceName: 'D1 legacy fixture',
  chatPath: '/fixture/chat/', settingsPath: '/fixture/settings/',
  unsupportedMajors: Object.freeze([0, 2]), refusal: 'contract-version',
})
const version = (minor, major = D1.major) => ({ id: D1.contractId, major, minor })
function legacyAttachment(minor) {
  return {
    id: D1.instanceId, name: D1.instanceName, contract: version(minor),
    transport: { send() {}, onMessage() {}, onClose() {}, close() {} },
    ui: { chat: D1.chatPath, settings: D1.settingsPath },
  }
}

describe('V2 D1 public version negotiation (EP/BVA)', () => {
  it('D1-CONTRACT-01 advertises contract 1.2', () => {
    assert.deepEqual({ ...CONNECTOR_CONTRACT }, version(D1.minor))
  })
  for (const minor of D1.minors) {
    it(`D1-CONTRACT-MINOR-${minor} common minor uses the lower supported version`, () => {
      assert.deepEqual({ ...negotiateContract(version(minor)) }, version(Math.min(minor, D1.minor)))
    })
  }
  for (const major of D1.unsupportedMajors) {
    it(`D1-CONTRACT-MAJOR-${major} refuses incompatible major without downgrade`, () => {
      assert.throws(() => negotiateContract(version(D1.minor, major)), { code: D1.refusal })
    })
  }
  for (const minor of D1.minors.filter((value) => value < D1.minor)) {
    it(`D1-LEGACY-ATTACH-${minor} accepts legacy attachment without semantic advertisement`, () => {
      const descriptor = legacyAttachment(minor)
      const accepted = validateAttachment(descriptor)
      assert.equal(accepted.contract.minor, minor)
      assert.deepEqual({ ...accepted.ui }, descriptor.ui)
    })
  }
})
