/**
 * R-FIX-INSTANCE black-box rows for the host side of the instance (the findings relayed
 * 2026-11-18, with the fixer's corrections of that day: F06 has no retry). Written from those
 * requirements only.
 *
 * - F01 (decision table): the target the CURRENT child was launched with (captured when its launch
 *   was prepared, the runtime's `child()` call) decides Reconnect, the first-start import and
 *   targetStatus; the live setting applies at the next start; before any launch the configured
 *   value is used. Hosted level: a credential client replaced while createHosted is in flight →
 *   not-ready, the value sent to no client, nothing recorded.
 * - F05 (state transition): close() returns a Promise that settles after the running step (its
 *   record write included); steps after close do nothing; a host-row reload while an import's
 *   record write is pending never loses the successor's entry.
 * - F06 (decision table: old credential present × the child's answer): a definite answer is final;
 *   an unanswered import is credentials-unwritable at once (no retry); the probe never decides.
 * - F07 (state transition): off then on during the appReady start ends in a fresh start, ready.
 * - F08 (EP over the main home: canonical, aliased itself, aliased ancestor, `fishball` a link or a
 *   file): no hosted record or fishball folder is created through an alias; a warn names the code;
 *   Reconnect is not-ready. `fishballDirectory(mainHome)` proves the path and creates nothing.
 *
 * Levels: integration (the real hosted-token rules, record, locator and credential client over
 * fakes) and system-like row rows (row.mjs: the real host.js applied over a fake ctx and a fake
 * runtime, real files under a scratch dir). No child process is launched.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { requireModule } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { FIXTURE, K3, RELAYED, RFI } from './constants.mjs'
import { fakeTokens, memoryRecord } from './fakes.mjs'
import { rowWorld, gate } from './row.mjs'
import { hostedModule, scratch, settle } from './subject.mjs'

const T = { timeout: RFI.wait.testMs }
const show = (v) => JSON.stringify(v)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const entry = (n) => FIXTURE.entryPrefix + n
const unavailable = () => Object.assign(new Error(RELAYED.channelUnavailable), { code: RELAYED.channelUnavailable })
const UNREACHABLE = Object.freeze({ state: K3.target.unreachable, code: K3.code.unreachable })
const CONNECTED = Object.freeze({ state: K3.target.connected, code: null })
const UNSET = Object.freeze({ state: K3.target.unset, code: null })

/** Whether `promise` settles within `ms`. */
const settlesWithin = (promise, ms) => Promise.race([promise.then(() => true, () => true), sleep(ms).then(() => false)])

/**
 * A scripted credential client (the relayed client contract: `probe() → boolean`,
 * `importToken(value) → {ok:true} | {ok:false, code}`, rejecting CREDENTIAL_CHANNEL_UNAVAILABLE
 * when no answer comes). `answers` are the import answers in order (RFI.answer.none = no answer).
 */
function scriptedClient(answers = [], { present = false } = {}) {
  const queue = [...answers]
  const calls = { probe: 0, imports: [] }
  return {
    calls,
    async probe() { calls.probe += 1; return present },
    async importToken(value) {
      calls.imports.push(value)
      const answer = queue.length > 0 ? queue.shift() : RFI.answer.ok
      if (answer === RFI.answer.none) throw unavailable()
      return { ...answer }
    },
    close() {},
  }
}

/** The real hosted-token rules over a fake connector, a scripted client (replaceable) and an in-memory record. */
async function tokenWorld(t, sdk, { client = scriptedClient(), remote = FIXTURE.blank, record = memoryRecord() } = {}) {
  const { createHostedToken } = await hostedModule(sdk)
  const tokens = fakeTokens()
  let current = client
  const warnings = []
  const hosted = createHostedToken({
    tokens: () => tokens, record, credentials: () => current, instanceId: () => FIXTURE.instanceId,
    remoteTarget: () => remote, runtimeId: () => FIXTURE.runtimeId, changed: () => {}, warn: (...args) => warnings.push(args),
  })
  t.after(() => hosted.close?.())
  return { hosted, tokens, record, warnings, setClient(next) { current = next } }
}
/** createHosted that waits on a gate: `reached` resolves when a call arrives. */
function holdCreate(tokens) {
  const create = tokens.createHosted.bind(tokens)
  const held = gate()
  const reached = gate()
  tokens.createHosted = async (id) => { reached.open(); await held.promise; return create(id) }
  return { reached: reached.promise, open: held.open }
}
/** A record whose `add` waits on a gate; `done` lists the keys whose add finished. */
function heldRecord() {
  const record = memoryRecord()
  const add = record.add.bind(record)
  const held = gate()
  const reached = gate()
  const done = []
  record.add = async (key, options) => { reached.open(); await held.promise; await add(key, options); done.push(key) }
  return { record, done, reached: reached.promise, open: held.open }
}

/** A canonical scratch main home, or an alias of one: `{home, real}` (real = the folder an alias resolves to). */
function homeOf(t, kind) {
  const base = scratch(t)
  const real = path.join(base, RFI.fixture.real)
  fs.mkdirSync(real)
  if (kind === 'canonical') return { home: real, real, base }
  if (kind === 'alias') {
    const alias = path.join(base, RFI.fixture.alias)
    fs.symlinkSync(real, alias)
    return { home: alias, real, base }
  }
  // An aliased ancestor: <base>/ancestor-link → <base>/real-home, home = <base>/ancestor-link/home.
  const link = path.join(base, RFI.fixture.ancestor)
  fs.symlinkSync(real, link)
  fs.mkdirSync(path.join(real, RFI.fixture.child))
  return { home: path.join(link, RFI.fixture.child), real: path.join(real, RFI.fixture.child), base }
}
/** Every hosted.json and fishball folder under `dir` (recursive, links not followed). */
function recordTraces(dir) {
  return fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => [RFI.fishball, RELAYED.record.file].includes(path.basename(f)))
}
const recordOnDisk = (home) => JSON.parse(fs.readFileSync(path.join(home, RFI.fishball, RELAYED.record.file), 'utf8'))

export function registerFixInstanceCases(sdk) {
  const row = (id, part, title, fn) => test(caseName(sdk, id, part, title), T, fn)

  // ===================================================================== F01: the launched target decides
  // Decision table: target at launch × live setting now → Reconnect, imports, targetStatus.
  row('RFI-F01', 'remote, cleared', 'F01 launched with a remote target, live setting cleared → Reconnect target-remote, no createHosted, nothing imported, targetStatus target-unreachable', async (t) => {
    const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home, targetUrl: FIXTURE.remote })
    await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.status().state === K3.state.ready), 'not ready: ' + show(w.status()))
    assert.deepEqual(w.ctl.launches.map((l) => l.child?.[RFI.row.target]), [FIXTURE.remote], 'the launch overlay target')
    w.setField(RFI.row.target, FIXTURE.blank)
    assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.reconnect.remote })
    assert.deepEqual(w.tokens.calls.created, [], 'createHosted called')
    assert.deepEqual(w.ctl.credentials.calls.set, [], 'a value was imported')
    assert.deepEqual(w.locator().targetStatus(), UNREACHABLE)
  })
  row('RFI-F01', 'local, set remote', 'F01 launched local, live setting set to remote → Reconnect still imports a local token ({ok:true}); targetStatus follows the local entry', async (t) => {
    const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home })
    await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.status().state === K3.state.ready && w.ctl.credentials.calls.set.length === 1), 'first start did not import: ' + show(w.ctl.credentials.calls.set.length))
    w.setField(RFI.row.target, FIXTURE.remote)
    assert.deepEqual(w.ctl.calls.start, 1, 'a target change restarted the child')
    assert.deepEqual(await w.locator().reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2, 'Reconnect created no local entry')
    assert.equal(w.ctl.credentials.calls.set.length, 2, 'Reconnect imported nothing')
    assert.deepEqual(w.locator().targetStatus(), CONNECTED)
    w.tokens.setState(entry(2), K3.entry.disabled)
    assert.deepEqual(w.locator().targetStatus(), { state: K3.target.refused, code: K3.code.revoked }, 'targetStatus does not follow the local entry')
  })
  row('RFI-F01', 'next start', 'F01 the new setting applies at the next start: off/on after setting remote → Reconnect target-remote, targetStatus target-unreachable', async (t) => {
    const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home })
    await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.status().state === K3.state.ready && w.ctl.credentials.calls.set.length === 1))
    w.setField(RFI.row.target, FIXTURE.remote)
    w.setField(RFI.row.enabled, false)
    assert.ok(await w.until(() => w.status().state !== K3.state.ready), 'off did not stop')
    w.setField(RFI.row.enabled, true)
    assert.ok(await w.until(() => w.status().state === K3.state.ready && w.ctl.launches.length === 2), 'no second start: ' + show(w.status()))
    assert.equal(w.ctl.launches[1].child?.[RFI.row.target], FIXTURE.remote)
    const created = w.tokens.calls.created.length
    assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.reconnect.remote })
    assert.equal(w.tokens.calls.created.length, created)
    assert.deepEqual(w.locator().targetStatus(), UNREACHABLE)
  })
  row('RFI-F01', 'before launch', 'F01 before any launch the configured value is used: remote → target-unreachable; cleared → target-unset', async (t) => {
    const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home, targetUrl: FIXTURE.remote })
    await w.apply()
    // The row opens its hosted record asynchronously: let it settle (appReady never fires here).
    await sleep(RFI.wait.quietMs)
    assert.equal(w.ctl.calls.start, 0, 'a start before appReady')
    assert.deepEqual(w.locator().targetStatus(), UNREACHABLE)
    w.setField(RFI.row.target, FIXTURE.blank)
    assert.deepEqual(w.locator().targetStatus(), UNSET)
  })
  for (const [part, launched, now, imports] of [
    ['first start local → remote', FIXTURE.blank, FIXTURE.remote, 1],
    ['first start remote → blank', FIXTURE.remote, FIXTURE.blank, 0],
  ]) {
    row('RFI-F01', part, `F01 the setting changes between the launch and the first-start import: the launched target decides (${imports} import)`, async (t) => {
      const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home, targetUrl: launched, holdStarts: 1 })
      await w.apply()
      w.fireReady()
      assert.ok(await w.until(() => w.ctl.launches.length === 1), 'the start prepared no launch')
      w.setField(RFI.row.target, now)
      w.ctl.startGate.open()
      assert.ok(await w.until(() => w.status().state === K3.state.ready))
      await sleep(RFI.wait.quietMs)
      assert.equal(w.ctl.credentials.calls.set.length, imports, 'imports')
      assert.equal(w.tokens.calls.created.length, imports, 'createHosted calls')
    })
  }
  for (const step of ['reconnect', 'firstStart']) {
    row('RFI-F01', 'wire replaced, ' + step, `F01 ${step}: the credential client is replaced while createHosted is in flight → the value reaches neither client; nothing recorded${step === 'reconnect' ? '; not-ready' : ''}`, async (t) => {
      const first = scriptedClient()
      const second = scriptedClient()
      const w = await tokenWorld(t, sdk, { client: first })
      const held = holdCreate(w.tokens)
      const result = w.hosted[step]()
      await held.reached
      w.setClient(second)
      held.open()
      const outcome = await settle(() => result)
      if (step === 'reconnect') assert.deepEqual(outcome.value, { ok: false, code: K3.reconnect.notReady })
      assert.deepEqual([first.calls.imports, second.calls.imports], [[], []], 'the value was sent')
      assert.deepEqual(w.record.added, [], 'recorded')
    })
  }

  // ===================================================================== F05: close() drains; a reload keeps the successor's entry
  row('RFI-F05', 'promise', 'F05 close() returns a Promise; with nothing running it settles', async (t) => {
    const w = await tokenWorld(t, sdk)
    const closed = w.hosted.close()
    assert.equal(typeof closed?.then, 'function', 'close() returned ' + show(closed))
    assert.equal(await settlesWithin(closed, RFI.wait.readyMs), true)
  })
  row('RFI-F05', 'drain', 'F05 close() during a Reconnect whose record write is pending settles only after that write finished', async (t) => {
    const held = heldRecord()
    const w = await tokenWorld(t, sdk, { record: held.record })
    const reconnect = w.hosted.reconnect()
    await held.reached
    const closed = w.hosted.close()
    assert.equal(await settlesWithin(closed, RFI.wait.quietMs), false, 'close() settled while the record write was pending')
    held.open()
    await closed
    assert.deepEqual(held.done, [entry(1)], 'the running step\'s record write did not finish before close() settled')
    await reconnect
  })
  row('RFI-F05', 'after close', 'F05 steps after close do nothing: reconnect → not-ready, firstStart creates nothing, nothing imported', async (t) => {
    const client = scriptedClient()
    const w = await tokenWorld(t, sdk, { client })
    await w.hosted.close()
    assert.deepEqual(await w.hosted.reconnect(), { ok: false, code: K3.reconnect.notReady })
    await settle(() => w.hosted.firstStart())
    assert.deepEqual(w.tokens.calls.created, [])
    assert.deepEqual(client.calls.imports, [])
    assert.deepEqual(w.record.added, [])
  })
  row('RFI-F05', 'reload', "F05 a host-row reload while the predecessor's Reconnect record write is pending: hosted.json ends with the successor's entry", async (t) => {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home })
    const a = await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.status(a).state === K3.state.ready && w.ctl.credentials.calls.set.length === 1))
    assert.ok(await w.until(() => fs.existsSync(path.join(home, RFI.fishball, RELAYED.record.file)) && recordOnDisk(home)[RELAYED.record.key].length === 1), 'the first entry is not on disk')
    const held = w.holdRecordWrite()
    const predecessor = w.locator(a).reconnect()
    await held
    const disposed = w.dispose(a)
    const b = await w.apply()
    w.fireReady()
    // The successor acts while the predecessor's write is still held: an early Reconnect (if the
    // successor is ready by then). The fixed row opens its record only after the predecessor shut
    // down, so it may refuse or wait; an unfixed one writes at once and is then overwritten.
    const quickly = async (fn) => {
      const end = Date.now() + RFI.wait.predecessorMs
      while (Date.now() < end) { if (fn()) return true; await sleep(RFI.wait.pollMs) }
      return false
    }
    const early = (await quickly(() => w.status(b).state === K3.state.ready))
      ? await Promise.race([w.locator(b).reconnect(), sleep(RFI.wait.predecessorMs).then(() => undefined)])
      : undefined
    w.releaseRecord()
    await disposed
    await predecessor.catch(() => {})
    let last = early
    if (!early?.ok) {
      const end = Date.now() + RFI.wait.readyMs
      while (Date.now() < end && !last?.ok) {
        if (w.status(b).state === K3.state.ready) last = await w.locator(b).reconnect()
        else await sleep(RFI.wait.pollMs)
      }
    }
    assert.equal(last?.ok, true, 'the successor never reconnected: ' + show(last))
    // Let any late write land before reading the file.
    await sleep(RFI.wait.quietMs)
    const newest = entry(w.tokens.calls.created.length)
    const entries = recordOnDisk(home)[RELAYED.record.key]
    assert.equal(entries.at(-1), newest, "hosted.json does not end with the successor's entry: " + show(entries))
  })

  // ===================================================================== F06: the import's answer is final; no answer is unwritable
  // Decision table: old credential present (probe) × the child's answer → Reconnect's result, imports, record.
  for (const [part, present, answer, expected, recorded] of [
    ['present, unanswered', true, RFI.answer.none, { ok: false, code: K3.reconnect.unwritable }, []],
    ['absent, unanswered', false, RFI.answer.none, { ok: false, code: K3.reconnect.unwritable }, []],
    ['present, ok', true, RFI.answer.ok, { ok: true }, [entry(1)]],
    ['absent, ok', false, RFI.answer.ok, { ok: true }, [entry(1)]],
    ['present, refused', true, RFI.answer.refused, { ...RFI.answer.refused }, []],
  ]) {
    row('RFI-F06', part, `F06 Reconnect: old credential ${present ? 'present' : 'absent'}, import ${answer === RFI.answer.none ? 'unanswered' : show(answer)} → ${show(expected)}; one import, no retry; recorded ${show(recorded)}`, async (t) => {
      const client = scriptedClient([answer, RFI.answer.ok], { present })
      const w = await tokenWorld(t, sdk, { client })
      assert.deepEqual(await w.hosted.reconnect(), expected)
      assert.equal(client.calls.imports.length, 1, 'imports ' + client.calls.imports.length)
      assert.deepEqual(w.record.added, recorded)
    })
  }
  row('RFI-F06', 'notice kept', 'F06 an unanswered Reconnect import keeps the hosted-entry-deleted notice and records nothing', async (t) => {
    const client = scriptedClient([RFI.answer.ok, RFI.answer.none, RFI.answer.ok])
    const w = await tokenWorld(t, sdk, { client })
    assert.deepEqual(await w.hosted.reconnect(), { ok: true })
    w.tokens.setState(entry(1), K3.entry.deleted)
    w.hosted.retryNotice()
    assert.equal(w.hosted.notice(), RELAYED.notice)
    assert.deepEqual(await w.hosted.reconnect(), { ok: false, code: K3.reconnect.unwritable })
    assert.equal(w.hosted.notice(), RELAYED.notice, 'the notice was cleared')
    assert.deepEqual(w.record.added, [entry(1)])
  })
  for (const [part, answer, recorded] of [['unanswered', RFI.answer.none, []], ['ok', RFI.answer.ok, [entry(1)]], ['refused', RFI.answer.refused, []]]) {
    row('RFI-F06', 'first start ' + part, `F06 the first-start import ${part}: one import (no retry), recorded ${show(recorded)}`, async (t) => {
      const client = scriptedClient([answer, RFI.answer.ok])
      const w = await tokenWorld(t, sdk, { client })
      await settle(() => w.hosted.firstStart())
      assert.equal(client.calls.imports.length, 1, 'imports ' + client.calls.imports.length)
      assert.deepEqual(w.record.added, recorded)
    })
  }

  // ===================================================================== F07: off/on during the appReady start
  row('RFI-F07', 'off-on', 'F07 off while the appReady start is in progress stops at once; on again before its cleanup ends → a second start, ready', async (t) => {
    const w = await rowWorld(t, sdk, { home: homeOf(t, 'canonical').home, holdStarts: 1 })
    await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.ctl.calls.start === 1), 'appReady started nothing')
    w.setField(RFI.row.enabled, false)
    const halted = () => w.ctl.calls.stop + w.ctl.calls.shutdown + w.ctl.calls.parentExit
    assert.ok(await w.until(() => halted() > 0), 'off did not stop the starting child at once')
    w.setField(RFI.row.enabled, true)
    await sleep(RFI.wait.quietMs)
    w.ctl.cleanupGate.open()
    assert.ok(await w.until(() => w.status().state === K3.state.ready && w.ctl.calls.start >= 2), 'not restarted: ' + show({ status: w.status(), calls: w.ctl.calls }))
  })

  // ===================================================================== F08: the hosted record only under a proven main home
  for (const kind of ['alias', 'ancestor']) for (const enabled of [true, false]) {
    row('RFI-F08', `${kind}, enabled ${enabled}`, `F08 main home ${kind === 'alias' ? 'is a symlink' : 'under a symlinked ancestor'} (enabled ${enabled}): no hosted.json or fishball folder anywhere; warn ${show(RFI.row.recordWarn)} with ${RFI.code.invalidHome}; Reconnect not-ready`, async (t) => {
      const { home, base } = homeOf(t, kind)
      const w = await rowWorld(t, sdk, { home, enabled })
      await w.apply()
      w.fireReady()
      await sleep(RFI.wait.quietMs)
      if (enabled) await w.until(() => w.status().state === K3.state.ready)
      assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.reconnect.notReady })
      assert.deepEqual(recordTraces(base), [], 'created under the scratch dir')
      assert.deepEqual(w.tokens.calls.created, [])
      const warns = w.warns().filter((l) => l.args[0] === RFI.row.recordWarn)
      assert.deepEqual(warns.map((l) => l.args), [[RFI.row.recordWarn, RFI.code.invalidHome]], 'warns ' + show(w.warns()))
    })
  }
  row('RFI-F08', 'fishball link', `F08 <home>/fishball is a symlink to an outside folder: nothing written there; warn with ${RFI.code.unsafeDirectory}; Reconnect not-ready`, async (t) => {
    const { home, base } = homeOf(t, 'canonical')
    const outside = path.join(base, RFI.fixture.outside)
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(home, RFI.fishball))
    const w = await rowWorld(t, sdk, { home })
    await w.apply()
    w.fireReady()
    await w.until(() => w.status().state === K3.state.ready)
    assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.reconnect.notReady })
    assert.deepEqual(fs.readdirSync(outside), [], 'written through the link')
    const warns = w.warns().filter((l) => l.args[0] === RFI.row.recordWarn)
    assert.deepEqual(warns.map((l) => l.args), [[RFI.row.recordWarn, RFI.code.unsafeDirectory]], 'warns ' + show(w.warns()))
  })
  row('RFI-F08', 'canonical', 'F08 a canonical main home keeps working: hosted.json is created under <home>/fishball', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home })
    await w.apply()
    w.fireReady()
    assert.ok(await w.until(() => w.status().state === K3.state.ready && w.ctl.credentials.calls.set.length === 1))
    assert.ok(fs.existsSync(path.join(home, RFI.fishball, RELAYED.record.file)))
    assert.deepEqual(w.warns().filter((l) => l.args[0] === RFI.row.recordWarn), [])
  })

  // fishballDirectory(mainHome): EP over the home and its fishball folder.
  const filesModule = () => requireModule(sdk, { entry: path.join(V3.instance.dir, RFI.files.entry), exports: [RFI.files.export], task: RFI.task })
  for (const [part, setup, expected] of [
    ['canonical, no fishball', () => {}, 'path'],
    ['canonical, fishball dir', (home) => fs.mkdirSync(path.join(home, RFI.fishball)), 'path'],
    ['fishball a symlink', (home, base) => { fs.mkdirSync(path.join(base, RFI.fixture.outside)); fs.symlinkSync(path.join(base, RFI.fixture.outside), path.join(home, RFI.fishball)) }, RFI.code.unsafeDirectory],
    ['fishball a file', (home) => fs.writeFileSync(path.join(home, RFI.fishball), FIXTURE.blank), RFI.code.unsafeDirectory],
  ]) {
    row('RFI-F08', 'fishballDirectory ' + part, `F08 fishballDirectory: ${part} → ${expected === 'path' ? '<home>/fishball, nothing created' : expected}`, async (t) => {
      const { home, base } = homeOf(t, 'canonical')
      setup(home, base)
      const before = fs.readdirSync(base, { recursive: true }).map(String).sort()
      const outcome = await settle(() => filesModule().then((m) => m[RFI.files.export](home)))
      if (expected === 'path') assert.equal(outcome.value, path.join(home, RFI.fishball), show(outcome.error?.code))
      else assert.equal(outcome.error?.code, expected, show(outcome))
      assert.deepEqual(fs.readdirSync(base, { recursive: true }).map(String).sort(), before, 'created something')
    })
  }
  for (const kind of ['alias', 'ancestor']) {
    row('RFI-F08', 'fishballDirectory ' + kind, `F08 fishballDirectory: a main home ${kind === 'alias' ? 'that is a symlink' : 'under a symlinked ancestor'} → ${RFI.code.invalidHome}, nothing created`, async (t) => {
      const { home, base } = homeOf(t, kind)
      const before = fs.readdirSync(base, { recursive: true }).map(String).sort()
      const outcome = await settle(() => filesModule().then((m) => m[RFI.files.export](home)))
      assert.equal(outcome.error?.code, RFI.code.invalidHome, show(outcome))
      assert.deepEqual(fs.readdirSync(base, { recursive: true }).map(String).sort(), before)
    })
  }
}
