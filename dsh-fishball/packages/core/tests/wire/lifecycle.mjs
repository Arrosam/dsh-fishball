/**
 * MULTI-1 regression rows (the lead, 2026-11-18), system level in a real Fishball DSH:
 *
 * 1. Startup credential cleanup: "clean obsolete parent-bound credential material on startup while
 *    preserving valid and unbound handoffs" (link.d.ts security amendment: "On startup recover the
 *    durable parent epoch and reconcile the instance setting BEFORE reading the fixed reference or
 *    saved token … Cold restart must not adopt or relabel a retired/unmatched binding"; the lead's
 *    decision: "DSH_AGENT_TOKEN is unset only when the pending record binds it to the retired epoch.
 *    An unbound value stays and is bound to the new epoch").
 * 2. Parent epoch save failure: "keep the old parent usable/listed if saving its new epoch fails".
 * 3. Shutdown drain: "shutdown must drain in-flight target operations without leaking/starting a
 *    runtime after close".
 *
 * Techniques:
 * - DT MULTI-LIFE-CRED-DT-01 over (parent URL at the next start: same / changed) × (material: saved
 *   copy bound to the old epoch, pending reference bound to the old epoch, fresh unbound handoff);
 * - ST MULTI-LIFE-SAVE-ST-01: parent on E1 → URL change whose durable write fails → still listed on
 *   E1 with its URL and its credential (connected) → the write works again on the next change;
 * - ST MULTI-LIFE-DRAIN-ST-01: targets connected / an add in flight → core closes → after the close
 *   no request reaches any target, no listen stream stays open, and no runtime starts after it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from 'fishball-test-helpers/cases'
import { newToken } from 'fishball-test-helpers/fake-connector'
import { until } from 'fishball-test-helpers/wait'
import { PARENT_NAMES, SEAM_TARGETS, TARGETS } from '../support/targets-oracle.mjs'
import { C, LIFE, MULTI } from './constants.mjs'
import { fakeTarget, multiWorld } from './world.mjs'

const T = { timeout: C.budget.boot * 3 + MULTI.budget.connectMs * 4 }
const row = (id, part, title, fn) => caseTest(id, part, title, T, fn)
const S = SEAM_TARGETS.state
const quiet = () => sleep(MULTI.budget.quietMs)
const keysOf = async (w) => (await w.h.call('credRecords')).map((r) => r.key)
const parentOf = async (w) => (await w.list()).targets.find((t) => t.targetId === TARGETS.parentId)
const bindingOf = async (w, key) => (await w.h.call('credRecord', { key }))?.payload?.[TARGETS.credentials.bindingField] ?? null
/** The hosted child's parent URL on `fake` (an MCP URL under a loopback name). */
const parentUrl = (fake, host = LIFE.host.first) => fake.url(host)

/** A hosted child whose parent (fake A) connected through a handoff, its saved copy bound to epoch E1. */
async function connectedParent(open, fake) {
  const entry = fake.addEntry()
  const w = await open({ child: { targetUrl: parentUrl(fake) }, handoff: entry.secret, expect: 1 })
  await w.until(TARGETS.parentId, (v) => v.state === S.connected, 'parent connected through the handoff')
  return { w, entry, epoch: (await parentOf(w)).endpointEpoch }
}

export function registerLifecycleCases() {
  const hosted = multiWorld({ child: { targetUrl: LIFE.placeholderUrl }, liveChild: true })

  // ================================================================ 1. startup credential cleanup
  row('MULTI-LIFE-CRED-DT-01', '1 same URL', 'parent connected on E1 (hosted copy bound to E1) → restart with the same instance URL → the epoch is kept, the hosted copy is kept and used (connected), nothing re-presented from a reference', async () => {
    const fake = await hostedFake()
    const { w, epoch } = await connectedParent(hosted, fake)
    const home = w.h.home
    await w.stop()
    const again = await hosted({ home, child: { targetUrl: parentUrl(fake) }, expect: 1 })
    await again.until(TARGETS.parentId, (v) => v.state === S.connected, 'connected again')
    assert.equal((await parentOf(again)).endpointEpoch, epoch, 'the epoch changed though the URL did not')
    assert.ok((await keysOf(again)).includes(PARENT_NAMES.savedRecord), 'a valid hosted copy was deleted')
    assert.equal((await bindingOf(again, PARENT_NAMES.savedRecord))?.endpointEpoch, epoch)
  })
  row('MULTI-LIFE-CRED-DT-01', '2 changed URL, saved copy', 'parent connected on E1 → restart with another instance URL (another endpoint) → a new epoch E2; the hosted copy bound to E1 is deleted at startup and never presented to the new endpoint', async () => {
    const fake = await hostedFake()
    const { w, entry, epoch } = await connectedParent(hosted, fake)
    const home = w.h.home
    await w.stop()
    const presented = fake.presented().length
    const again = await hosted({ home, child: { targetUrl: parentUrl(fake, LIFE.host.other) }, expect: 1 })
    await quiet()
    const view = await parentOf(again)
    assert.notEqual(view.endpointEpoch, epoch, 'a new endpoint kept the old epoch')
    const saved = await bindingOf(again, PARENT_NAMES.savedRecord)
    assert.ok(saved === null || saved.endpointEpoch === view.endpointEpoch, 'a hosted copy bound to the retired epoch is still stored: ' + JSON.stringify(saved))
    assert.equal(fake.presented().slice(presented).filter((p) => p.secret === entry.secret).length, 0, 'the retired copy was presented to the new endpoint')
    assert.notEqual(view.state, S.connected, 'the new endpoint connected on retired material')
  })
  row('MULTI-LIFE-CRED-DT-01', '3 changed URL, pending reference bound to E1', 'a handoff value in DSH_AGENT_TOKEN bound (pending record) to E1, refused, then a restart with another URL → the reference is unset and the pending binding gone; the value is never presented to the new endpoint', async () => {
    const fake = await hostedFake()
    fake.state.refuseTokens = true
    const value = newToken()
    const w = await hosted({ child: { targetUrl: parentUrl(fake) }, handoff: value, expect: 1 })
    await until(async () => (await keysOf(w)).includes(PARENT_NAMES.pendingRecord), MULTI.budget.connectMs, MULTI.budget.pollMs)
    const epoch = (await parentOf(w)).endpointEpoch
    assert.equal((await bindingOf(w, PARENT_NAMES.pendingRecord))?.endpointEpoch, epoch, 'precondition: the pending value is bound to E1')
    const home = w.h.home
    await w.stop()
    fake.state.refuseTokens = false
    const presented = fake.presented().length
    const again = await hosted({ home, child: { targetUrl: parentUrl(fake, LIFE.host.other) }, expect: 1 })
    await quiet()
    assert.equal((await again.h.call('credDescribe', { ref: PARENT_NAMES.tokenRef })).configured, false, 'the reference bound to the retired epoch is still set')
    const pending = await bindingOf(again, PARENT_NAMES.pendingRecord)
    assert.ok(pending === null || pending.endpointEpoch !== epoch, 'the pending binding to the retired epoch is kept')
    assert.equal(fake.presented().slice(presented).filter((p) => p.secret === value).length, 0, 'the retired-bound value was presented to the new endpoint')
  })
  // The new URL is another fake DSH: one fake's pair registry refuses a second entry for the same
  // agent id (K1 id-taken), which a real instance avoids by retiring the old entry (succession).
  row('MULTI-LIFE-CRED-DT-01', '4 changed URL, fresh unbound handoff', 'parent connected on E1 (DSH A); while down the instance writes a NEW value (unbound) and the URL of DSH B → at startup the stale E1 copy is cleaned and never presented to B; the new value is kept, bound to the new epoch, and connects to B', async () => {
    const fa = await hostedFake()
    const fb = await hostedFake()
    const { w, entry, epoch } = await connectedParent(hosted, fa)
    const home = w.h.home
    await w.stop()
    const fresh = fb.addEntry()
    const again = await hosted({ home, child: { targetUrl: parentUrl(fb) }, handoff: fresh.secret, expect: 1 })
    await again.until(TARGETS.parentId, (v) => v.state === S.connected, 'connected on the fresh handoff')
    const view = await parentOf(again)
    assert.notEqual(view.endpointEpoch, epoch)
    assert.ok(fb.presented().some((p) => p.secret === fresh.secret), 'the fresh handoff was not used')
    assert.equal(fb.presented().filter((p) => p.secret === entry.secret).length, 0, 'the retired E1 copy was presented to B')
    assert.equal((await bindingOf(again, PARENT_NAMES.savedRecord))?.endpointEpoch, view.endpointEpoch, 'the saved copy is not bound to the new epoch')
  })
  row('MULTI-LIFE-CRED-DT-01', '5 unbound handoff before any connection', 'a handoff value written at the first start (no binding yet) is kept and used for the current epoch; startup cleanup does not delete it', async () => {
    const fake = await hostedFake()
    const entry = fake.addEntry()
    const w = await hosted({ child: { targetUrl: parentUrl(fake) }, handoff: entry.secret, expect: 1 })
    await w.until(TARGETS.parentId, (v) => v.state === S.connected, 'connected')
    assert.ok(fake.presented().some((p) => p.secret === entry.secret))
  })

  // N3 (the lead, 2026-11-18): an interrupted retirement. The durable parent ALREADY holds the current
  // URL and its epoch E2 (no URL change at this start), but the fixed parent records still name E1, as
  // if the retirement's deletes never landed. The changed-URL rows above run a normal retirement and
  // cannot reach this state. Fixture: E1 material core itself wrote (a pending binding for value V1
  // and the hosted copy of V1, both read back through DSH's credential API), restored after a normal
  // retirement to E2 through the same API (modifyRecord); then a fresh value V2 (mismatched with the
  // E1 pending binding) in DSH_AGENT_TOKEN, refused by the target so that it stays in the reference.
  row('MULTI-LIFE-CRED-ST-02', 'interrupted retirement', 'restart with the parent already on the current URL and E2, but saved and pending parent records bound to E1 → both stale records are cleared at startup and V1 is never sent; the fresh mismatched reference value V2 is not unset', async () => {
    const fa = await hostedFake()
    const fb = await hostedFake()
    const v1 = fa.addEntry()
    // E1, step 1: V1 refused once → core binds the pending value to E1.
    fa.state.refuseTokens = true
    let w = await hosted({ child: { targetUrl: parentUrl(fa) }, handoff: v1.secret, expect: 1 })
    await until(async () => (await keysOf(w)).includes(PARENT_NAMES.pendingRecord), MULTI.budget.connectMs, MULTI.budget.pollMs)
    const e1 = (await parentOf(w)).endpointEpoch
    const pendingE1 = await w.h.call('credRecord', { key: PARENT_NAMES.pendingRecord })
    assert.equal(pendingE1?.payload?.[TARGETS.credentials.bindingField]?.endpointEpoch, e1, 'harness: the pending record is not bound to E1')
    const home = w.h.home
    await w.stop()
    // E1, step 2: the same URL, V1 accepted after the restart → the hosted copy bound to E1.
    fa.state.refuseTokens = false
    w = await hosted({ home, child: { targetUrl: parentUrl(fa) }, expect: 1 })
    await w.until(TARGETS.parentId, (v) => v.state === S.connected, 'connected on V1')
    const savedE1 = await w.h.call('credRecord', { key: PARENT_NAMES.savedRecord })
    assert.equal(savedE1?.payload?.[TARGETS.credentials.bindingField]?.endpointEpoch, e1, 'harness: the hosted copy is not bound to E1')
    await w.stop()
    // E2: a normal retirement to DSH B; then the E1 records are restored (the interrupted deletes).
    fb.state.refuseTokens = true
    w = await hosted({ home, child: { targetUrl: parentUrl(fb) }, expect: 1 })
    await w.until(TARGETS.parentId, (v) => v.endpointEpoch !== e1, 'retired to E2')
    const e2 = (await parentOf(w)).endpointEpoch
    await quiet()
    await w.h.call('credWriteRecord', { key: PARENT_NAMES.savedRecord, record: savedE1 })
    await w.h.call('credWriteRecord', { key: PARENT_NAMES.pendingRecord, record: pendingE1 })
    // Precondition (read back through DSH): both fixed parent records name E1 while the durable parent is on E2.
    assert.equal((await bindingOf(w, PARENT_NAMES.savedRecord))?.endpointEpoch, e1, 'harness: the E1 hosted copy was not restored')
    assert.equal((await bindingOf(w, PARENT_NAMES.pendingRecord))?.endpointEpoch, e1, 'harness: the E1 pending binding was not restored')
    await w.stop()
    // The start under test: the same URL (B) and E2, a fresh value V2 written by the instance.
    const v2 = fb.addEntry()
    const sent = { a: fa.presented().length, b: fb.presented().length }
    w = await hosted({ home, child: { targetUrl: parentUrl(fb) }, handoff: v2.secret, expect: 1 })
    await quiet()
    assert.equal((await parentOf(w)).endpointEpoch, e2, 'the epoch changed at a start without a URL change')
    const saved = await bindingOf(w, PARENT_NAMES.savedRecord)
    const pending = await bindingOf(w, PARENT_NAMES.pendingRecord)
    assert.ok(saved === null || saved.endpointEpoch !== e1, 'the hosted copy bound to E1 is still stored')
    assert.ok(pending === null || pending.endpointEpoch !== e1, 'the pending binding to E1 is still stored')
    const presentedNow = [...fa.presented().slice(sent.a), ...fb.presented().slice(sent.b)].map((p) => p.secret)
    assert.equal(presentedNow.includes(v1.secret), false, 'the stale E1 value was sent')
    assert.equal((await w.h.call('credDescribe', { ref: PARENT_NAMES.tokenRef })).configured, true, 'the fresh mismatched reference value was unset')
  })

  // ================================================================ 2. parent epoch save failure
  row('MULTI-LIFE-SAVE-ST-01', 'write fails', 'parent connected on E1; the instance changes the URL while core\'s target store cannot be written → the parent stays listed with its old URL and epoch and stays connected (usable); when the store is writable again a later change moves it to a new epoch', async () => {
    const fake = await hostedFake()
    const { w, epoch } = await connectedParent(hosted, fake)
    const before = await parentOf(w)
    const store = path.join(w.h.home, LIFE.storages)
    const locked = lockStore(store)
    try {
      await w.h.call('setChildUrl', { url: parentUrl(fake, LIFE.host.other), rowName: C.childStandIn })
      await quiet()
      const during = await parentOf(w)
      assert.ok(during, 'the parent is no longer listed')
      assert.equal(during.endpointEpoch, epoch, 'the epoch moved though its save failed')
      assert.equal(during.url, before.url, 'the listed URL moved though its save failed')
      assert.equal(during.state, S.connected, 'the old parent is not usable any more')
      const call = await w.h.call('bridgeCall', { pluginId: MULTI.bridgePlugin, names: [LIFE.tool], target: { targetId: TARGETS.parentId }, name: LIFE.tool, args: LIFE.toolArgs })
      assert.notEqual(call.result?.code, SEAM_TARGETS.refusal.unknownTarget, 'the old parent refused a call: ' + JSON.stringify(call))
    } finally { locked.unlock() }
    await w.h.call('setChildUrl', { url: parentUrl(fake, LIFE.host.v6), rowName: C.childStandIn })
    await w.until(TARGETS.parentId, (v) => v.endpointEpoch !== epoch, 'a new epoch once the store is writable')
  })

  // ================================================================ 3. shutdown drain
  const standalone = multiWorld()
  for (const [part, close] of [['core switched off', (w) => w.h.call('disableCoreAt')], ['DSH shutdown', (w) => w.h.call('shutdownAt')]]) {
    row('MULTI-LIFE-DRAIN-ST-01', part, `two connected targets, then ${part} → after it resolves no request reaches either target and no listen stream stays open (nothing leaks, nothing restarts)`, async () => {
      const w = await standalone()
      const fa = await w.fake({ name: MULTI.name.office })
      const fb = await w.fake({ name: MULTI.name.lab })
      await w.connect(fa); await w.connect(fb)
      const at = await close(w)
      await sleep(LIFE.afterCloseMs)
      for (const f of [fa, fb]) {
        assert.deepEqual(f.requestsAfter(at).map((r) => r.method + ' ' + r.path), [], 'a request after the close')
        assert.equal(f.openListens().length, 0, 'a listen stream left open after the close')
      }
    })
  }
  row('MULTI-LIFE-DRAIN-ST-02', 'add in flight', 'an add() issued in the same turn as core\'s close → the close drains it: afterwards no request reaches the new target and nothing listens on it, whatever add() answered', async () => {
    const w = await standalone()
    const f = await w.fake({ name: MULTI.name.office })
    const { result, at } = await w.h.call('addThenDisable', { url: f.url() })
    assert.ok(result !== undefined, 'add() never settled')
    await sleep(LIFE.afterCloseMs)
    assert.deepEqual(f.requestsAfter(at).map((r) => r.method + ' ' + r.path), [], 'a runtime for the added target ran after the close')
    assert.equal(f.openListens().length, 0)
  })
  row('MULTI-LIFE-DRAIN-ST-03', 'core back on', 'core switched off and on again in the same DSH: exactly one runtime per target (one open listen stream each), the targets listed as before', async () => {
    const w = await standalone()
    const fa = await w.fake({ name: MULTI.name.office })
    const a = await w.connect(fa)
    await w.h.call('disableCoreAt')
    assert.equal(await w.h.call('enableCore'), true, 'core did not come back')
    await w.until(a.targetId, (v) => v.state === S.connected, 'reconnected')
    await quiet()
    assert.equal(fa.openListens().length, 1, 'not exactly one runtime for the target: ' + fa.openListens().length)
  })
}

/** A fake parent DSH for the hosted rows; it must exist before the child boots (its URL is the instance's value). */
const hostedFake = () => fakeTarget({ name: MULTI.name.office })
/** Makes DSH's storage folder and its files read-only (a failing durable write); returns its undo. */
function lockStore(dir) {
  const files = fs.readdirSync(dir).map((n) => path.join(dir, n))
  for (const f of files) fs.chmodSync(f, LIFE.mode.readOnly)
  fs.chmodSync(dir, LIFE.mode.readOnlyDir)
  return { unlock() { fs.chmodSync(dir, LIFE.mode.dir); for (const f of files) if (fs.existsSync(f)) fs.chmodSync(f, LIFE.mode.file) } }
}