/** MULTI-2 frozen identity resources, standard stream invalidation and local hostname sampler. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { BUDGET, K1, SURFACE } from './constants.mjs'
import { MULTI as M } from './multi-constants.mjs'
import { multiWorld as world, saveName, expectedInfo, observer, discovered, identity, bothResources, identityNotices, assertStandardIdentityHint, toolDefinitions, oauthSnapshot, quiet, eventually } from './multi-subject.mjs'
const row = (sdk, part, title, fn) => test(caseName(sdk, M.id, part, title), { timeout: BUDGET.testMs }, fn)
export function registerMultiWireCases(sdk) {
  row(sdk, 'EP real identity resource', 'resources/list/read expose standard Implementation from same live getter as discovery', async (t) => {
    const w = await world(sdk)
    await saveName(w, M.configured)
    const o = await observer(t, w)
    const listed = await o.client.listResources({}, { timeout: BUDGET.rpcMs })
    const entries = listed.resources.filter((r) => r.uri === M.identityUri)
    assert.equal(entries.length, 1, 'acknowledging a subscription URI is not a real resources/list entry')
    assert.equal(entries[0].name, K1.RESOURCE.identity.name)
    assert.equal(entries[0].mimeType, M.mimeType)
    assert.deepEqual(await identity(o.client), expectedInfo(M.configured))
    await saveName(w, M.renamed)
    assert.deepEqual(await identity(o.client), await discovered(o.client))
    assert.deepEqual(await identity(o.client), expectedInfo(M.renamed))
  })

  row(sdk, 'DT R3/R5 live broadcast', 'rename pushes on existing filtered streams with tools/OAuth/row/auth unchanged', async (t) => {
    const w = await world(sdk)
    await saveName(w, M.configured)
    const p = await observer(t, w, bothResources)
    const q = await observer(t, w, { resourceSubscriptions: [M.identityUri] })
    const r = await observer(t, w, { resourceSubscriptions: [K1.RESOURCE.events.uri] })
    const s = await observer(t, w, { toolsListChanged: true })
    const before = { row: await w.call('row'), tools: await toolDefinitions(p.client), oauth: await oauthSnapshot(w) }
    const baseline = p.requests.length
    await saveName(w, M.renamed)
    await eventually(() => identityNotices(p).length === 1 && identityNotices(q).length === 1, 'rename did not broadcast to both identity subscribers')
    await quiet()
    for (const o of [p, q]) { assert.equal(o.notices.length, 1, 'rename falsely invalidated mailbox'); assertStandardIdentityHint(o.notices[0]); assert.deepEqual(o.toolHints, []) }
    assert.deepEqual([r.notices, s.notices, r.toolHints, s.toolHints], [[], [], [], []], 'identity update escaped its subscription filter')
    assert.equal(p.requests.length, baseline, 'server push caused unsolicited client/network metadata polling')
    assert.deepEqual(await discovered(p.client), expectedInfo(M.renamed))
    assert.deepEqual(await identity(p.client), expectedInfo(M.renamed))
    assert.deepEqual(await toolDefinitions(p.client), before.tools, 'rename changed tools, schemas or descriptions')
    assert.deepEqual(await oauthSnapshot(w), before.oauth, 'rename changed OAuth endpoints/metadata')
    assert.equal((await w.call('row')).fiber, before.row.fiber, 'name save remounted endpoint')
    assert.equal(p.requests.filter((r) => r.method === 'subscriptions/listen').length, 1, 'rename reopened the stream')
  })

  row(sdk, 'DT R4 effective noop', 'same name, unrelated settings and blank-to-whitespace do not invalidate identity', async (t) => {
    const w = await world(sdk)
    await saveName(w, M.configured)
    const o = await observer(t, w, bothResources)
    await saveName(w, M.configured)
    const settings = await w.settings()
    const limit = SURFACE.settings.maxQueuedInputs
    assert.equal((await w.call('settingsUpdate', { patch: { [limit]: settings.value[limit] + 1 } })).ok, true)
    t.after(() => w.call('settingsUpdate', { patch: { [limit]: settings.value[limit] } }))
    await quiet()
    assert.deepEqual([o.notices, o.toolHints], [[], []])
    await saveName(w, '')
    await eventually(() => o.notices.length === 1, 'clearing configured name did not invalidate')
    o.notices.length = 0
    await saveName(w, ' \t\u2003')
    await quiet()
    assert.deepEqual([o.notices, o.toolHints], [[], []], 'effective hostname remained unchanged')
  })

  row(sdk, 'ST disconnect/reopen', 'after an offline rename current snapshot is recoverable and future existing-stream hints work', async (t) => {
    const w = await world(sdk)
    await saveName(w, M.configured)
    const o = await observer(t, w, bothResources)
    await o.subscription.close()
    await o.subscription.closed
    await saveName(w, M.renamed)
    await quiet()
    assert.deepEqual(o.notices, [], 'closed stream delivered a hint')
    await o.reopen()
    assert.deepEqual(await discovered(o.client), expectedInfo(M.renamed))
    assert.deepEqual(await identity(o.client), expectedInfo(M.renamed))
    await saveName(w, M.configured)
    await eventually(() => identityNotices(o).length === 1, 'reopened stream did not receive next rename')
    assertStandardIdentityHint(o.notices[0])
  })

  row(sdk, 'DT R6 revoked subscriber', 'revocation closes only that identity subscriber and leaves the other authenticated stream receiving rename', async (t) => {
    const w = await world(sdk)
    await saveName(w, M.configured)
    const p = await observer(t, w, bothResources)
    const q = await observer(t, w, bothResources)
    const current = await w.settings()
    const tokens = current.value.tokens.map((entry) => entry.key === p.made.entryKey ? { ...entry, enabled: false } : entry)
    assert.equal((await w.call('settingsMutate', { ops: [{ op: 'set', path: ['tokens'], value: tokens }] })).ok, true)
    let timer
    try { await Promise.race([p.subscription.closed, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('revoked identity stream remained open')), BUDGET.readyMs) })]) }
    finally { clearTimeout(timer) }
    await saveName(w, M.renamed)
    await eventually(() => identityNotices(q).length === 1, 'other authenticated identity subscriber stopped after revocation')
    await quiet()
    assert.deepEqual(p.notices, [], 'revoked subscriber received rename')
    assertStandardIdentityHint(q.notices[0])
    assert.deepEqual(await identity(q.client), expectedInfo(M.renamed))
  })

  row(sdk, 'BVA/ST hostname watcher', '30s local-only change/noop, setting disable/reenable and connector dispose lifecycle', async (t) => {
    const w = await world(sdk)
    await saveName(w, '')
    await w.call('multiHostname', { value: M.hostname })
    // Baseline a completed sample before testing the three-value temporal boundary.
    await w.call('multiAdvance', { ms: M.watchMs })
    const o = await observer(t, w, bothResources)
    const requestCount = o.requests.length
    await w.call('multiHostname', { value: M.nextHostname })
    await w.call('multiAdvance', { ms: M.beforeWatchMs })
    await quiet()
    assert.deepEqual(o.notices, [], 'hostname sampler fired before 30 seconds')
    const atBoundary = await w.call('multiAdvance', { ms: M.boundaryStepMs })
    await eventually(() => identityNotices(o).length === 1, 'changed OS hostname did not push at 30 seconds')
    assert.equal(atBoundary.activeHostnameTimers, 1, 'must own exactly one local hostname sampler')
    assertStandardIdentityHint(o.notices[0])
    assert.equal(o.requests.length, requestCount, 'local sampling triggered network metadata polling')
    assert.deepEqual(await discovered(o.client), expectedInfo(M.nextHostname))
    o.notices.length = 0
    await w.call('multiAdvance', { ms: M.watchMs + M.boundaryStepMs })
    await quiet()
    assert.deepEqual(o.notices, [], 'unchanged hostname invalidated identity')
    await saveName(w, M.configured)
    await eventually(() => o.notices.length === 1, 'configured name did not push')
    o.notices.length = 0
    const named = await w.call('multiClock')
    await w.call('multiHostname', { value: M.finalHostname })
    const stopped = await w.call('multiAdvance', { ms: M.watchMs })
    await quiet()
    assert.equal(stopped.activeHostnameTimers, 0, 'configured nonblank name left sampler running')
    assert.equal(stopped.reads, named.reads, 'configured name still sampled the OS hostname')
    assert.deepEqual(o.notices, [])
    await saveName(w, ' \t')
    await eventually(() => o.notices.length === 1, 'clearing setting did not restore OS identity')
    assert.deepEqual(await identity(o.client), expectedInfo(M.finalHostname))
    await saveName(w, '')
    await w.call('multiAdvance', { ms: M.watchMs })
    assert.equal((await w.call('multiClock')).activeHostnameTimers, 1, 'blank saves duplicated or failed to restart sampler')
    // Bundle disposal is asynchronous at the native loader boundary; prove its observable state,
    // then advance only the local sampler clock. This is not a product retry/polling mechanism.
    t.after(() => w.call('bundleEnabled', { enabled: true }))
    await w.call('bundleEnabled', { enabled: false })
    await eventually(async () => !(await w.call('row')).active, 'connector did not dispose')
    const disposed = await w.call('multiClock')
    const after = await w.call('multiAdvance', { ms: M.watchMs })
    assert.equal(after.activeHostnameTimers, 0, 'disposed connector retained hostname sampler')
    assert.equal(after.reads, disposed.reads, 'disposed connector still sampled hostname')
    await w.call('bundleEnabled', { enabled: true })
  })
}
