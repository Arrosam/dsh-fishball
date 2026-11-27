/**
 * The host row (host.js apply) over a fake row context and a fake runtime (row-world.mjs): the real
 * hosted record on disk, the real hosted-token rules, locator, routes and credential client.
 * Requirements: README ("The child", "The hosted token", "Settings page"); R-FIX-INSTANCE F01
 * (MULTI-2 supersedes its remote matrix: the launched handoff is always the actual parent), F05
 * (a reload never loses the successor's entry), F07 (off/on during the start), F08 (no hosted
 * record through an aliased main home); K3 ChildStatus (PROFILE_INCOMPATIBLE names the bundle; no
 * fishball-off, Q4). Waits poll their condition with no deadline.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { drain } from '@dsh-instance/test-helpers/wait'
import { CONNECTOR_MCP, FIXTURE, K3, RECORD, ROUTE, ROW, TARGET } from './constants.mjs'
import { homeOf, load } from './worlds.mjs'
import { rowWorld } from './row-world.mjs'

const entry = (n) => FIXTURE.entryPrefix + n
const PARENT = FIXTURE.hostOrigin + CONNECTOR_MCP
const recordOnDisk = (home) => JSON.parse(fs.readFileSync(path.join(home, RECORD.dir, RECORD.file), 'utf8'))
const traces = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => [RECORD.dir, RECORD.file].includes(path.basename(f)))

eachSdk((sdk) => {
  /** A row applied on a canonical home, appReady fired, ready with its first import done. */
  async function readyRow(t, options = {}) {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home, ...options })
    await w.apply()
    w.fireReady()
    await w.until(() => w.status().state === K3.state.ready && w.ctl.credentials.calls.set.length === 1)
    return { w, home }
  }

  caseTest(sdk, 'HOST-UC-01', 'E1', 'a blocked start reports {state: failed, code: PROFILE_INCOMPATIBLE, plugin: <the bundle>} through the locator', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home })
    w.ctl.failNext = Object.assign(new Error('Enabled bundles cannot load'), { code: K3.code.incompatible, plugin: FIXTURE.bundle })
    await w.apply()
    w.fireReady()
    await w.until(() => w.status().state === K3.state.failed)
    assert.deepEqual(w.status(), { state: K3.state.failed, code: K3.code.incompatible, plugin: FIXTURE.bundle })
  })
  caseTest(sdk, 'HOST-ST-01', 8, 'the instance never reports fishball-off (Q4): not in its code vocabulary, not through the locator', async (t) => {
    const { INSTANCE_CODES } = await load(sdk, 'constants')
    assert.equal(INSTANCE_CODES.includes(K3.withdrawnCode), false)
    const { w } = await readyRow(t)
    assert.notEqual(w.status().code, K3.withdrawnCode)
  })
  caseTest(sdk, 'ROUTES', 'status row', "the row's own GET status answers {state, code, detail, notice, busy} (busy false with no Fishball plugin change)", async (t) => {
    const { w } = await readyRow(t)
    const out = await w.call('GET', ROUTE.status)
    assert.deepEqual(Object.keys(out.json).sort(), [...ROUTE.statusKeys].sort())
    assert.deepEqual([out.json.state, out.json.busy], [K3.state.ready, false])
    const retry = await w.call('POST', ROUTE.retry, { body: {} })
    assert.deepEqual(Object.keys(retry.json).sort(), [...ROUTE.statusKeys].sort())
  })

  // ============================================================ F01 under MULTI-2: the parent handoff, whatever a leftover field says
  caseTest(sdk, 'RFI-F01', 'remote, cleared (MULTI-2)', 'a leftover remote targetUrl field cleared live → parent launch, one first import, no unsafe legacy replacement', async (t) => {
    const { w } = await readyRow(t, { extraTarget: FIXTURE.remote })
    assert.deepEqual(w.ctl.launches.map((l) => l.child?.[ROW.extraTarget]), [PARENT])
    w.setField(ROW.extraTarget, FIXTURE.blank)
    assert.equal((await w.locator().reconnect()).ok, false)
    assert.equal(w.tokens.calls.created.length, 1)
    assert.equal(w.locator().agentEntry(), entry(1))
    assert.deepEqual(w.locator().targetStatus(), TARGET.connected)
  })
  caseTest(sdk, 'RFI-F01', 'local, set remote', 'a leftover remote field set live → no restart; legacy Reconnect does not replace the parent entry', async (t) => {
    const { w } = await readyRow(t)
    w.setField(ROW.extraTarget, FIXTURE.remote)
    assert.equal(w.ctl.calls.start, 1)
    assert.equal((await w.locator().reconnect()).ok, false)
    assert.equal(w.tokens.calls.created.length, 1)
    assert.equal(w.locator().agentEntry(), entry(1))
    assert.deepEqual(w.locator().targetStatus(), TARGET.connected)
    w.tokens.setState(entry(1), K3.entry.disabled)
    assert.deepEqual(w.locator().targetStatus(), TARGET.revoked)
  })
  caseTest(sdk, 'RFI-F01', 'next start (MULTI-2)', 'off/on after a leftover remote field still launches and reconnects the actual parent', async (t) => {
    const { w } = await readyRow(t)
    w.setField(ROW.extraTarget, FIXTURE.remote)
    w.setField(ROW.enabled, false)
    await w.until(() => w.status().state === K3.state.disabled)
    w.setField(ROW.enabled, true)
    await w.until(() => w.status().state === K3.state.ready && w.ctl.launches.length === 2)
    assert.equal(w.ctl.launches[1].child?.[ROW.extraTarget], PARENT)
    const created = w.tokens.calls.created.length
    assert.equal((await w.locator().reconnect()).ok, false)
    assert.equal(w.tokens.calls.created.length, created)
    assert.deepEqual(w.locator().targetStatus(), TARGET.connected)
  })
  caseTest(sdk, 'RFI-F01', 'before launch (MULTI-2)', 'before appReady a leftover remote field never stands in for the absent parent entry: no start, target-unset', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home, extraTarget: FIXTURE.remote })
    await w.apply()
    // The row opens its hosted record asynchronously; the file appears once it has.
    await w.until(() => fs.existsSync(path.join(home, RECORD.dir, RECORD.file)))
    await drain()
    assert.equal(w.ctl.calls.start, 0)
    assert.deepEqual(w.locator().targetStatus(), TARGET.unset)
    w.setField(ROW.extraTarget, FIXTURE.blank)
    assert.deepEqual(w.locator().targetStatus(), TARGET.unset)
  })
  for (const [part, launched, now] of [['first start local → remote', FIXTURE.blank, FIXTURE.remote], ['first start remote → blank (MULTI-2 extra field ignored)', FIXTURE.remote, FIXTURE.blank]]) {
    caseTest(sdk, 'RFI-F01', part, 'the leftover field changes between the launch and the first-start import: one parent import, one createHosted', async (t) => {
      const { home } = homeOf(t, 'canonical')
      const w = await rowWorld(t, sdk, { home, extraTarget: launched, holdStarts: 1 })
      await w.apply()
      w.fireReady()
      await w.until(() => w.ctl.launches.length === 1)
      w.setField(ROW.extraTarget, now)
      w.ctl.startGate.open()
      await w.until(() => w.status().state === K3.state.ready && w.ctl.credentials.calls.set.length >= 1)
      await drain()
      assert.equal(w.ctl.credentials.calls.set.length, 1)
      assert.equal(w.tokens.calls.created.length, 1)
      assert.equal(w.ctl.launches[0].child?.[ROW.extraTarget], PARENT)
    })
  }

  // ============================================================ F05: a reload keeps the successor's entry
  caseTest(sdk, 'RFI-F05', 'reload', "a host-row reload while the predecessor's Reconnect record write is pending: hosted.json ends with the successor's entry", async (t) => {
    const { w, home } = await readyRow(t)
    const a = w.current
    await w.until(() => fs.existsSync(path.join(home, RECORD.dir, RECORD.file)) && recordOnDisk(home).entries.length === 1)
    w.tokens.setState(entry(1), K3.entry.deleted)
    const held = w.holdRecordWrite()
    const predecessor = w.locator(a).reconnect()
    await held
    const disposed = w.dispose(a)
    const b = await w.apply()
    w.fireReady()
    w.releaseRecord()
    await disposed
    await predecessor
    await w.until(() => w.status(b).state === K3.state.ready)
    // The successor's Reconnect, once its record is open (not-ready until then).
    let last
    await w.until(async () => { last = await w.locator(b).reconnect(); return last.ok === true })
    await drain()
    assert.equal(recordOnDisk(home).entries.at(-1), entry(w.tokens.calls.created.length))
  })

  // ============================================================ F07: off/on during the appReady start
  caseTest(sdk, 'RFI-F07', 'off-on', 'off while the appReady start runs stops it at once; on again before its cleanup ends → a second start, ready', async (t) => {
    const { home } = homeOf(t, 'canonical')
    const w = await rowWorld(t, sdk, { home, holdStarts: 1 })
    await w.apply()
    w.fireReady()
    await w.until(() => w.ctl.calls.start === 1)
    w.setField(ROW.enabled, false)
    await w.until(() => w.ctl.calls.stop + w.ctl.calls.shutdown + w.ctl.calls.parentExit > 0)
    w.setField(ROW.enabled, true)
    await drain()
    w.ctl.cleanupGate.open()
    await w.until(() => w.status().state === K3.state.ready && w.ctl.calls.start >= 2)
    assert.equal(w.status().state, K3.state.ready)
  })

  // ============================================================ F08: no hosted record through an aliased main home
  for (const kind of ['alias', 'ancestor']) for (const enabled of [true, false]) {
    caseTest(sdk, 'RFI-F08', `${kind}, enabled ${enabled}`, `main home ${kind === 'alias' ? 'is a symlink' : 'under a symlinked ancestor'} (enabled ${enabled}): no hosted.json or fishball folder anywhere; warn with INVALID_MAIN_HOME; Reconnect not-ready`, async (t) => {
      const { home, base } = homeOf(t, kind)
      const w = await rowWorld(t, sdk, { home, enabled })
      await w.apply()
      w.fireReady()
      await w.until(() => w.recordWarns().length > 0)
      assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.refusal.notReady })
      assert.deepEqual(traces(base), [])
      assert.deepEqual(w.tokens.calls.created, [])
      assert.deepEqual(w.recordWarns(), [[ROW.recordWarn, ROW.invalidHome]])
    })
  }
  caseTest(sdk, 'RFI-F08', 'fishball link', '<home>/fishball is a symlink to an outside folder: nothing written there; warn with UNSAFE_DIRECTORY; Reconnect not-ready', async (t) => {
    const { home, base } = homeOf(t, 'canonical')
    const outside = path.join(base, 'outside')
    fs.mkdirSync(outside)
    fs.symlinkSync(outside, path.join(home, RECORD.dir))
    const w = await rowWorld(t, sdk, { home })
    await w.apply()
    w.fireReady()
    await w.until(() => w.recordWarns().length > 0)
    assert.deepEqual(await w.locator().reconnect(), { ok: false, code: K3.refusal.notReady })
    assert.deepEqual(fs.readdirSync(outside), [])
    assert.deepEqual(w.recordWarns(), [[ROW.recordWarn, ROW.unsafeDirectory]])
  })
  caseTest(sdk, 'RFI-F08', 'canonical', 'a canonical main home keeps working: hosted.json is created under <home>/fishball, no record warn', async (t) => {
    const { w, home } = await readyRow(t)
    await w.until(() => fs.existsSync(path.join(home, RECORD.dir, RECORD.file)))
    assert.deepEqual(w.recordWarns(), [])
  })
})
