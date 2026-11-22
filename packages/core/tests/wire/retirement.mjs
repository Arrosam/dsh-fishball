/**
 * MULTI-1-FIX decisions at the transport/storage boundary (no host or listener):
 * BVA/ST: pause Continue at its durable write, retire by remove / shutdown / replacement, then release.
 * EP/DT: ambient A remains effective vs. writable B masks A; only B may bind to the replacement.
 * ST: B is accepted → save unsets B and exposes A → retry and restart still select B.
 * ST: E1 observes A then B → renewal clears B and exposes A → E2 still refuses A across restart.
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { SEAM_PAIRING } from 'fishball-shared/ui-seam'
import { caseName } from 'fishball-test-helpers/cases'
import { newToken as token } from 'fishball-test-helpers/fake-connector'
import { importWithLink } from '../support/link-swap.mjs'
import { HOSTED_IMPORT, PARENT_NAMES, TARGETS, credentialNamesOf } from '../support/targets-oracle.mjs'
import { C, FIXTURE, LIFE, MULTI } from './constants.mjs'
import { linkScope } from './retirement-link.mjs'

const OLD = LIFE.placeholderUrl
const NEXT = MULTI.url.remote
const CONFIRMED = { confirmed: true }
const CONTINUE = SEAM_PAIRING.choice.continue
const DECISION_MS = 5000
const RETIRE_BY = Object.freeze({ remove: 'remove', close: 'close', replace: 'replace' })
const SPY = path.join(import.meta.dirname, 'retirement-link.mjs')

/** createTargets over the offline link (../support/link-swap.mjs: only this import graph sees it). */
async function subject() {
  return (await importWithLink(path.join(C.coreDir, 'src', 'targets', 'index.js'), SPY)).createTargets
}

function table() {
  const rows = new Map()
  return { entries: () => rows.entries(), get: (k) => rows.get(k), put: async (k, v) => rows.set(k, v), delete: async (k) => rows.delete(k) }
}

function stores() {
  return { secret: token(), refs: new Map(), records: new Map(), targets: table(), bindings: table(), identityRecords: table() }
}

async function world(t, parentUrl, durable = stores()) {
  const createTargets = await subject()
  const { secret, refs, records, targets, bindings, identityRecords } = durable
  const writes = []
  const credentials = {
    // Ambient is a fallback, not an entry in the writable store: unset cannot erase it.
    async resolve(k) {
      if (refs.has(k)) return { source: 'store', value: refs.get(k) }
      if (parentUrl && k === PARENT_NAMES.tokenRef) return { source: 'env', value: secret }
    },
    async unset(k) { refs.delete(k) },
    async readRecord(k) { return records.get(k) },
    async deleteRecord(k) { records.delete(k) },
    async modifyRecord(k, change) {
      const next = await change(records.get(k))
      if (next !== undefined) { records.set(k, next); writes.push([k, next]) }
      return records.get(k)
    },
  }
  const { row, field } = HOSTED_IMPORT.targetSetting
  const settings = { describe: () => parentUrl ? [{ ns: row, value: { [field]: parentUrl } }] : [] }
  const controller = createTargets({ credentials, settings, on: () => () => {} }, {
    tables: { targets, bindings }, identityRecords,
    asks: { voidWhere: async () => {} }, events: { retire() {} }, recovered: Promise.resolve(),
    settings: { clientId: () => FIXTURE.coreId, clientMetadataUrl: () => MULTI.metadataUrl, name: () => FIXTURE.boundName },
  })
  t.after(() => controller.close())
  await controller.settled()
  return { controller, service: controller.service, refs, writes, credentials, identityRecords, secret,
    view: (id) => controller.service.list().targets.find(v => v.targetId === id),
    async renewParent() { parentUrl = NEXT; controller.settingsChanged({ link: false, name: false }); await controller.settled() },
  }
}

/** Hold the next durable decision, not the lifecycle operation; release it even on a test failure. */
function holdWrite(rows) {
  const entered = Promise.withResolvers(), release = Promise.withResolvers()
  const put = rows.put
  rows.put = async (...args) => { entered.resolve(); await release.promise; return put(...args) }
  return { entered: entered.promise, release: release.resolve }
}

const parentBinding = record => record?.payload?.[TARGETS.credentials.bindingField]
const parentBindingFor = ({ targetId, endpointEpoch, url }) => ({ targetId, endpointEpoch, origin: new URL(url).origin, agentId: FIXTURE.coreId })

async function ambientParent(t, links, durable) {
  const w = await world(t, OLD, durable)
  const before = w.view(TARGETS.parentId), [old] = links
  await old.done
  const pending = await w.credentials.readRecord(PARENT_NAMES.pendingRecord)
  assert.deepEqual(parentBinding(pending), parentBindingFor(before))
  assert.ok(old.sends.some(s => s.href === OLD && s.secret === w.secret && s.ref === pending.payload.ref), 'E1 did not use the bound ambient token')
  return { w, before, old, ambientRef: pending.payload.ref }
}

async function renewParent(w, links, before, old) {
  await w.renewParent()
  const after = w.view(TARGETS.parentId), current = links.at(-1)
  assert.notEqual(after.endpointEpoch, before.endpointEpoch)
  assert.notEqual(current, old)
  await current.done
  assert.ok(current.probes.includes(NEXT), 'E2 did not request credentials for the replacement URL')
  return { after, current }
}

export function registerRetirementCases() {
  const row = (name, fn, acceptAt) => test(caseName('MULTI-1-FIX', '', name), { timeout: DECISION_MS }, t => {
    const links = []
    return linkScope.run({ links, acceptAt }, () => fn(t, links))
  })
  for (const boundary of Object.values(RETIRE_BY)) row(`deferred continue across ${boundary}`, async (t, links) => {
    const w = await world(t)
    const added = await w.service.add(OLD)
    assert.equal(added.ok, true)
    const id = added.targetId, initial = w.view(id), [old] = links
    await old.done
    w.refs.set(credentialNamesOf(initial).tokenRef, w.secret)
    assert.equal((await w.service.retry(id)).ok, true)
    await old.done
    assert.ok(w.view(id).pairing.choices.includes(CONTINUE), 'the old endpoint offered Continue')
    assert.ok(old.sends.some(s => s.href === OLD), 'the old link reached the connector')
    const starts = old.starts.length, sends = old.sends.length
    const barrier = holdWrite(w.identityRecords)
    const choice = w.service.choose(id, CONTINUE, CONFIRMED)
    let closing
    try {
      await Promise.race([barrier.entered, choice.then(() => assert.fail('choice completed before its durable write'))])
      if (boundary === RETIRE_BY.close) closing = w.controller.close() // close may drain the write
      else if (boundary === RETIRE_BY.remove) {
        assert.equal((await w.service.remove(id, CONFIRMED)).ok, true)
        assert.equal(w.view(id), undefined)
      } else {
        assert.equal((await w.service.setUrl(id, NEXT, CONFIRMED)).ok, true)
        assert.notEqual(w.view(id).endpointEpoch, initial.endpointEpoch)
        const replacement = links.at(-1)
        await replacement.done
        assert.notEqual(replacement, old)
        assert.ok(replacement.probes.includes(NEXT))
        assert.notEqual(old.target(), NEXT, 'the old link must never read the replacement URL')
      }
    } finally { barrier.release(); await choice; await closing }
    await old.done
    assert.equal(old.starts.length, starts, 'the deferred choice restarted the old link')
    assert.equal(old.sends.length, sends, 'the old link dialled after retirement')
  })

  row('parent renewal with a still-effective ambient token', async (t, links) => {
    const { w, before, old, ambientRef } = await ambientParent(t, links)
    const { after } = await renewParent(w, links, before, old)
    assert.equal((await w.credentials.resolve(PARENT_NAMES.tokenRef))?.value === w.secret, true, 'ambient A is still effective in DSH')
    assert.ok(!w.writes.some(([k, r]) => k === PARENT_NAMES.pendingRecord && r.payload.ref === ambientRef && parentBinding(r)?.endpointEpoch === after.endpointEpoch), 'the old token was rebound to E2')
    assert.ok(!links.some(l => l.sends.some(s => s.href === NEXT && s.secret === w.secret)), 'the replacement origin received the old token')
  })

  row('parent renewal clears the last writable token without reviving the earlier ambient token', async (t, links) => {
    const durable = stores()
    const w = await world(t, OLD, durable)
    const id = TARGETS.parentId, before = w.view(id), [old] = links
    const ref = PARENT_NAMES.tokenRef
    await old.done
    assert.ok(old.selections.some(s => s.href === OLD && s.secret === w.secret), 'E1 did not observe ambient A')

    const writable = token()
    w.refs.set(ref, writable)
    const from = old.selections.length
    assert.equal((await w.service.retry(id)).ok, true)
    await old.done
    assert.equal(w.view(id).endpointEpoch, before.endpointEpoch, 'B must be observed on E1')
    assert.ok(old.selections.slice(from).some(s => s.href === OLD && s.secret === writable), 'E1 did not observe writable B')
    assert.equal((await w.credentials.resolve(ref))?.value === writable, true, 'B must still mask A at renewal')

    const { after } = await renewParent(w, links, before, old)
    const check = async (phase, world, phaseLinks) => {
      assert.equal((await world.credentials.resolve(ref))?.value === w.secret, true, `${phase}: clearing B did not expose A`)
      assert.ok(!phaseLinks.some(l => l.sends.some(s => s.href === NEXT && s.secret === w.secret)), `${phase}: the replacement origin received ambient A`)
      assert.ok(!phaseLinks.some(l => l.selections.some(s => s.href === NEXT && s.secret === w.secret)), `${phase}: E2 selected ambient A before the transport gate`)
      // A is the only available input. Its binding must not be written even if transport is held.
      // Check only the contract binding, not the pending record's presence, ref or metadata layout.
      assert.ok(!world.writes.some(([, record]) => parentBinding(record)?.endpointEpoch === after.endpointEpoch), `${phase}: a parent credential was bound to E2`)
    }
    await t.test('replacement probe after B is cleared', async () => check('renewal', w, links))
    await w.controller.close()

    const beforeRestart = links.length
    const again = await world(t, NEXT, durable)
    const restarted = links.at(-1)
    await restarted.done
    assert.equal(again.view(id).endpointEpoch, after.endpointEpoch)
    assert.ok(restarted.probes.includes(NEXT), 'E2 did not request credentials after restart')
    await check('cold restart', again, links.slice(beforeRestart))
  })

  row('parent renewal saves a fresh writable token and keeps using it after unmask and restart', async (t, links) => {
    const durable = stores()
    const { w, before, old, ambientRef } = await ambientParent(t, links, durable)
    const fresh = token()
    w.refs.set(PARENT_NAMES.tokenRef, fresh)
    assert.equal((await w.credentials.resolve(PARENT_NAMES.tokenRef))?.value === fresh, true, 'writable B must mask ambient A')

    const { after, current } = await renewParent(w, links, before, old)
    const assertSelectedB = (phase, sends) => {
      assert.ok(sends.length > 0, `${phase}: no credential was sent to E2`)
      assert.ok(sends.every(s => s.href === NEXT && s.secret === fresh), `${phase}: E2 used a credential other than B`)
    }
    const assertUnmasked = async credentials => {
      assert.equal((await credentials.resolve(PARENT_NAMES.tokenRef))?.value === w.secret, true, 'saving B did not expose ambient A again')
    }
    assertSelectedB('initial replacement', current.sends)
    const { ref: freshRef } = current.sends[0]
    assert.notEqual(freshRef, ambientRef, 'fresh B must have a credential id distinct from A')
    assert.ok(w.writes.some(([k, r]) => k === PARENT_NAMES.pendingRecord && r.payload.ref === freshRef && parentBinding(r)?.endpointEpoch === after.endpointEpoch), 'writable B was not bound to E2 before being used')
    assert.deepEqual(parentBinding(await w.credentials.readRecord(PARENT_NAMES.savedRecord)), parentBindingFor(after), 'the accepted B copy was not saved for E2')
    await assertUnmasked(w.credentials)

    await t.test('live retry after unmask', async () => {
      const from = current.sends.length
      assert.equal((await w.service.retry(TARGETS.parentId)).ok, true)
      await current.done
      assertSelectedB('live retry', current.sends.slice(from))
    })
    await w.controller.close()

    // Recreate the controller over the same durable tables/credential records with A still in env.
    const again = await world(t, NEXT, durable)
    const restarted = links.at(-1)
    await restarted.done
    assert.notEqual(restarted, current)
    assert.equal(again.view(TARGETS.parentId).endpointEpoch, after.endpointEpoch)
    await assertUnmasked(again.credentials)
    assertSelectedB('cold restart', restarted.sends)
  }, NEXT)
}