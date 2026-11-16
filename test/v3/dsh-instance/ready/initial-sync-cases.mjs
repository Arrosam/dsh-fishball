/** I-READY initial install sync: EP, count BVA (0/1/many), collapsed decision table,
 * and no-marker → refused → retry → marker → restart state transitions.
 * Only the public injected sync contract is exercised; no hosted process is launched.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { at, moduleOf } from './subject.mjs'
import { INITSYNC as C } from './initial-sync-constants.mjs'

async function world(t, sdk, { count = 1, marker = false, check, add, outcomes = ['added'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), C.prefix))
  // This exact directory was allocated above, never derived from production settings.
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const file = path.join(root, C.file)
  const { INITIAL_SYNC } = await moduleOf(sdk, 'constants', ['INITIAL_SYNC'])
  assert.equal(INITIAL_SYNC.file, C.file)
  const { createInitialSync } = await import(pathToFileURL(at('src/host/initial-sync.js')).href)
  const missing = C.providers.slice(0, count)
  const calls = { check: 0, add: [], warn: [] }
  const goodCheck = { ok: true, result: { checkId: C.checkId, missing, notOffered: [], present: [] } }
  const goodAdd = { ok: true, result: { items: missing.map((p, i) => ({ id: p.id, outcome: outcomes[i % outcomes.length], reason: C.privateText })) } }
  const sync = {
    async check() { calls.check += 1; return check ? check() : goodCheck },
    async add(value) { calls.add.push(value); return add ? add(value) : goodAdd },
  }
  const make = () => createInitialSync({ sync, codes: C.codes, root: () => root, warn: (...args) => calls.warn.push(args) })
  if (marker) fs.writeFileSync(file, JSON.stringify({ format: INITIAL_SYNC.format }))
  return { runner: make(), make, calls, file, missing, goodCheck, INITIAL_SYNC }
}
function warnings(w, expected) {
  assert.deepEqual(w.calls.warn, expected)
  assert.equal(JSON.stringify(w.calls.warn).includes(C.privateText), false)
}
function added(w) {
  assert.deepEqual(w.calls.add, [{ checkId: C.checkId, ids: w.missing.map((p) => p.id) }])
}
function refused(code) { return { ok: false, error: { code, message: C.privateText } } }
function throwing(code) { return () => { throw Object.assign(new Error(C.privateText), code ? { code } : {}) } }

export function registerInitialSyncCases(sdk) {
  const row = (id, part, title, fn) => caseTest(sdk, id, part, title, fn)
  // Marker=yes collapses all remaining conditions: neither check nor add is allowed.
  row('INITSYNC-DT-01', 'existing', 'marker suppresses even a failing check across new coordinator instances', async (t) => {
    const w = await world(t, sdk, { marker: true, check: throwing(C.thrown) })
    const before = fs.readFileSync(w.file, 'utf8')
    assert.equal(await w.runner.run(), true)
    assert.equal(await w.make().run(), true)
    assert.equal(w.calls.check, 0)
    assert.deepEqual(w.calls.add, [])
    assert.equal(fs.readFileSync(w.file, 'utf8'), before)
    warnings(w, [])
  })
  row('INITSYNC-DT-02', 'check-refused', 'refused check stops before add and leaves no marker', async (t) => {
    const w = await world(t, sdk, { check: () => refused(C.refused) })
    assert.equal(await w.runner.run(), false)
    assert.equal(w.calls.check, 1)
    assert.deepEqual(w.calls.add, [])
    assert.equal(fs.existsSync(w.file), false)
    warnings(w, [[w.INITIAL_SYNC.failedLog, C.refused]])
  })
  for (const count of C.counts) row('INITSYNC-DT-03', count, 'successful check with 0/1/many missing providers adds exactly all ids or skips add', async (t) => {
    const w = await world(t, sdk, { count })
    assert.equal(await w.runner.run(), true)
    assert.equal(w.calls.check, 1)
    if (count) added(w)
    else assert.deepEqual(w.calls.add, [])
    assert.equal(fs.existsSync(w.file), true)
    warnings(w, [])
  })
  for (const count of C.counts.filter(Boolean)) row('INITSYNC-DT-04', count, 'refused add leaves no marker and logs only its code', async (t) => {
    const w = await world(t, sdk, { count, add: () => refused(C.addRefused) })
    assert.equal(await w.runner.run(), false)
    assert.equal(w.calls.check, 1)
    added(w)
    assert.equal(fs.existsSync(w.file), false)
    warnings(w, [[w.INITIAL_SYNC.failedLog, C.addRefused]])
  })
  for (const outcome of C.outcomes) row('INITSYNC-DT-05', outcome, 'successful add records completion even for failed provider items', async (t) => {
    const w = await world(t, sdk, { outcomes: [outcome] })
    assert.equal(await w.runner.run(), true)
    added(w)
    assert.equal(fs.existsSync(w.file), true)
    warnings(w, outcome === C.codes.outcomeFailed ? [[w.INITIAL_SYNC.itemFailedLog, C.codes.outcomeFailed]] : [])
    assert.equal(await w.runner.run(), true)
    assert.equal(w.calls.check, 1)
    assert.equal(w.calls.add.length, 1)
  })
  row('INITSYNC-DT-06', 'mixed-items', 'all offered ids are submitted once despite mixed per-provider outcomes', async (t) => {
    const w = await world(t, sdk, { count: C.providers.length, outcomes: C.outcomes })
    assert.equal(await w.runner.run(), true)
    added(w)
    warnings(w, [[w.INITIAL_SYNC.itemFailedLog, C.codes.outcomeFailed]])
    assert.equal(fs.existsSync(w.file), true)
  })
  for (const phase of ['check', 'add']) for (const code of [C.thrown, undefined]) row('INITSYNC-EP-01', `${phase}-${code ?? 'uncoded'}`, 'thrown errors resolve false with code-only diagnostics and no marker', async (t) => {
    const w = await world(t, sdk, { [phase]: throwing(code) })
    assert.equal(await w.runner.run(), false)
    assert.equal(w.calls.check, 1)
    if (phase === 'add') added(w)
    else assert.deepEqual(w.calls.add, [])
    assert.equal(fs.existsSync(w.file), false)
    warnings(w, [[w.INITIAL_SYNC.failedLog, code ?? C.codes.failed]])
  })
  for (const phase of ['check', 'add']) row('INITSYNC-ST-01', phase, 'no marker → refusal → next attempt succeeds → durable marker suppresses later start', async (t) => {
    let fail = true
    const w = await world(t, sdk, { [phase]: () => fail ? refused(C.refused) : phase === 'check' ? w.goodCheck : { ok: true, result: { items: [] } } })
    assert.equal(await w.runner.run(), false)
    assert.equal(fs.existsSync(w.file), false)
    fail = false
    assert.equal(await w.runner.run(), true)
    assert.equal(fs.existsSync(w.file), true)
    const before = structuredClone(w.calls)
    assert.equal(await w.make().run(), true)
    assert.deepEqual(w.calls, before)
    assert.equal(w.calls.check, 2)
    warnings(w, [[w.INITIAL_SYNC.failedLog, C.refused]])
  })
  for (const success of [true, false]) row('INITSYNC-ST-02', String(success), 'concurrent run calls share one pending attempt and result', async (t) => {
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const w = await world(t, sdk, { count: 0, check: () => pending })
    const first = w.runner.run(), second = w.runner.run()
    release(success ? w.goodCheck : refused(C.refused))
    assert.deepEqual(await Promise.all([first, second]), [success, success])
    assert.equal(w.calls.check, 1)
    assert.deepEqual(w.calls.add, [])
    assert.equal(fs.existsSync(w.file), success)
    warnings(w, success ? [] : [[w.INITIAL_SYNC.failedLog, C.refused]])
  })
  row('INITSYNC-ST-03', 'pending-add', 'marker is absent until the successful add completes', async (t) => {
    let release, entered
    const started = new Promise((resolve) => { entered = resolve })
    const pending = new Promise((resolve) => { release = resolve })
    const w = await world(t, sdk, { add: () => { entered(); return pending } })
    const result = w.runner.run()
    await started
    assert.equal(fs.existsSync(w.file), false)
    release({ ok: true, result: { items: [] } })
    assert.equal(await result, true)
    assert.equal(fs.existsSync(w.file), true)
    added(w)
  })
  row('INITSYNC-ST-04', 'reinstall', 'removing runtime marker allows a reinstalled coordinator to sync again', async (t) => {
    const w = await world(t, sdk, { count: 0 })
    assert.equal(await w.runner.run(), true)
    fs.unlinkSync(w.file)
    assert.equal(await w.make().run(), true)
    assert.equal(w.calls.check, 2)
    assert.equal(fs.existsSync(w.file), true)
    warnings(w, [])
  })
  row('INITSYNC-WIRE-01', 'start', 'start schedules automatic sync after ready without awaiting it', () => {
    const source = fs.readFileSync(at('host.js'), 'utf8')
    const start = source.slice(source.indexOf('async function start()'), source.indexOf('async function restart()'))
    assert.match(start, /set\(PLUGIN\.state\.ready\)[\s\S]*?\binitialSync\.run\(\)/)
    assert.doesNotMatch(start, /await\s+initialSync\.run\(/)
    assert.match(start, /(?:void\s+|^\s*)initialSync\.run\(\)/m)
  })
  test(caseName(sdk, 'INITSYNC-SYSTEM-01', 'real-child', 'first real child start syncs once and a restart does not'), { skip: C.skip }, () => {})
}
