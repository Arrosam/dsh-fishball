/**
 * MULTI-1 credential rows (contracts README "Added credentials", "Hosted reservation" and the
 * independent-review security amendment; link.d.ts MULTI-0 notes; TARGETS.credentials). Integration
 * level: core's real `createLinkCredentials` with `names` from its own `credentialNames(source)`
 * (relayed seam), over DSH's real credential store and authorization (oauth-client `openHost`).
 * Expected names come from the freeze (wire/targets-oracle.mjs), never from `credentialNames`'
 * answer: the first row checks core's names equal the frozen ones.
 *
 * Techniques: EP over the source (parent / added target), DT over the binding members (all match /
 * one differs), ST over the parent's epoch (bound → retired on a same-origin endpoint change).
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE, HARNESS, LINK } from './constants.mjs'
import { PARENT_SOURCE, linkSaveWorld } from './subject.mjs'
import { PARENT_NAMES, TARGETS, credentialNamesOf } from '../wire/targets-oracle.mjs'

const S = LINK.state
const letters = (n) => TARGETS.id.alphabet[n].repeat(TARGETS.id.randomChars)
/** An added target on one epoch, and the same target after an endpoint change (test data in the frozen grammar). */
const ADDED = Object.freeze({ targetId: TARGETS.id.prefix + letters(1), endpointEpoch: TARGETS.epoch.prefix + letters(1) })
const PARENT_NEXT = Object.freeze({ targetId: TARGETS.parentId, endpointEpoch: TARGETS.epoch.prefix + letters(2) })
const BINDING = TARGETS.credentials.bindingField

export function registerMultiLinkSaveCases(sdk) {
  const row = (id, part, title, fn) => caseTest(sdk, id, part, title, fn)

  row('MULTI-CRED-EP-01', 'names', 'credentialNames: the parent has DSH_AGENT_TOKEN, fishball-core/hosted-agent, fishball-core/pending-token-origin; an added target FISHBALL_TARGET_TOKEN_<id>__<epoch> (- → _) and fishball-core/token-<id>-<epoch>, no pending record', async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const parent = w.mod.credentialNames(PARENT_SOURCE)
    assert.equal(parent.ref, PARENT_NAMES.tokenRef)
    assert.equal(parent.tokenRecord, PARENT_NAMES.savedRecord)
    assert.equal(parent.pending, PARENT_NAMES.pendingRecord)
    const added = w.mod.credentialNames(ADDED)
    const frozen = credentialNamesOf(ADDED)
    assert.equal(added.ref, frozen.tokenRef)
    assert.equal(added.tokenRecord, frozen.tokenRecord)
    assert.equal(added.pending ?? null, null, 'an added target has a pending-origin record')
  })

  row('MULTI-CRED-EP-02', 'added target', 'an added target\'s token in its own reference: accepted → saved only as fishball-core/token-<id>-<epoch> with binding {targetId, endpointEpoch, origin, agentId}; DSH_AGENT_TOKEN, hosted-agent and pending-token-origin never written', async (t) => {
    const w = await linkSaveWorld(t, sdk, { source: ADDED })
    const e = w.f.addEntry()
    await w.ctx.credentials.set(w.targetNames().ref, e.secret)
    await w.untilStatus(S.connected)
    const keys = await w.recordKeys()
    const frozen = credentialNamesOf(ADDED)
    assert.ok(keys.includes(frozen.tokenRecord), 'no saved copy under ' + frozen.tokenRecord + ': ' + JSON.stringify(keys))
    for (const name of [PARENT_NAMES.savedRecord, PARENT_NAMES.pendingRecord]) assert.equal(keys.includes(name), false, name + ' written by an added target')
    assert.equal(await w.refConfigured(), false, 'DSH_AGENT_TOKEN configured by an added target')
    const saved = (await w.ctx.credentials.readRecord(keys.find((k) => k === frozen.tokenRecord)))?.payload
    assert.deepEqual(saved?.[BINDING], { ...ADDED, origin: w.origin(), agentId: FIXTURE.coreId })
  })

  row('MULTI-CRED-DT-01', 'binding mismatch', 'a saved copy whose binding names another endpoint epoch (or another agentId) is not used: nothing is presented, not connected', async (t) => {
    for (const [part, mutate] of [['epoch', (b) => ({ ...b, endpointEpoch: PARENT_NEXT.endpointEpoch })], ['agentId', (b) => ({ ...b, agentId: FIXTURE.coreId + FIXTURE.host.other })]]) {
      const w = await linkSaveWorld(t, sdk, { source: ADDED })
      const e = w.f.addEntry()
      await w.ctx.credentials.set(w.targetNames().ref, e.secret)
      await w.untilStatus(S.connected)
      await w.stop()
      const key = (await w.ctx.credentials.listRecords()).find((r) => String(r.key) === credentialNamesOf(ADDED).tokenRecord).key
      await w.ctx.credentials.modifyRecord(key, async (current) => ({ ...current, payload: { ...current.payload, [BINDING]: mutate(current.payload[BINDING]) } }))
      const presented = w.f.presented().length
      await w.start()
      await sleep(HARNESS.quietMs)
      assert.notEqual(w.status()?.state, S.connected, part + ': a mismatched binding connected')
      assert.equal(w.f.presented().length, presented, part + ': a mismatched saved copy was presented')
    }
  })

  row('MULTI-CRED-ST-01', 'parent epoch retired (same origin)', 'the parent connected on epoch E1 (hosted copy bound to E1); the endpoint changes on the same origin (new epoch E2) and core restarts → the E1 copy is not used for E2: nothing presented from it, not connected without a new handoff', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const e = w.f.addEntry()
    await w.importToken(e.secret)
    await w.untilStatus(S.connected)
    assert.equal((await w.hosted())?.payload?.[BINDING]?.endpointEpoch, PARENT_SOURCE.endpointEpoch, 'precondition: the hosted copy is bound to E1')
    await w.stop()
    w.source = PARENT_NEXT
    const presented = w.f.presented().length
    await w.start()
    await sleep(HARNESS.quietMs)
    assert.notEqual(w.status()?.state, S.connected, 'the retired epoch\'s token connected the new epoch')
    assert.equal(w.f.presented().filter((p) => p.secret === e.secret).length, w.f.presented().slice(0, presented).filter((p) => p.secret === e.secret).length, 'the retired copy was presented for the new epoch')
  })
}
