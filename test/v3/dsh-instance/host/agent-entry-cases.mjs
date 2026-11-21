/**
 * AGENT-ENTRY rows of the instance locator (contract C, 2026-11-21: "entries by window"). The
 * user's requirement: the main DSH's sidebar shows an entry for each connected agent that has a
 * window this DSH can open; the instance's part is to say which agent that is. The K3
 * `dshInstanceChild` gains `agentEntry()`: the connector token entry key of the hosted entry the
 * child holds now (the newest key of the hosted record), or null before any is recorded. A newly
 * recorded entry is announced by `onChange` (child.d.ts). Written from the requirement and the
 * contract only; src/host/locator.js, hosted.js and host.js were not read.
 *
 * Techniques: BVA over the record (0, 1, 2 keys; newest last), State transition (no entry → first
 * start → reconnect → reconnect; a refused reconnect records nothing), EP (a record seeded from an
 * earlier run, the real file-backed record), and the K3 declaration.
 *
 * Level: integration, the I-HOST world (subject.mjs hostedWorld): the real hosted-token logic and
 * the real locator over in-process fakes.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { contracts, member, serviceMembers } from '../../contract/k3-host-services/contracts.mjs'
import { FOLDER } from '../../contract/k3-host-services/constants.mjs'
import { FIXTURE, K3 } from './constants.mjs'
import { hostedWorld, recordFile, recordModule, scratch, tick } from './subject.mjs'

const ID = 'AGENT-ENTRY'
const newest = (n) => FIXTURE.entryPrefix + n

export function registerAgentEntryCases(sdk) {
  caseTest(sdk, ID, 'K3', 'child.d.ts declares dshInstanceChild.agentEntry() with no parameters, returning string | null', () => {
    const c = contracts(FOLDER.hostServices)
    const found = member(serviceMembers(c, K3.service), 'agentEntry')
    assert.ok(found, 'no agentEntry member')
    assert.equal((found.params ?? []).length, 0, 'agentEntry takes parameters')
    assert.match(String(found.returns), /string\s*\|\s*null|null\s*\|\s*string/, 'agentEntry returns ' + found.returns)
  })
  caseTest(sdk, ID, 'member', 'the real locator has agentEntry() as a function', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(typeof w.locator.agentEntry, 'function')
  })

  // ---------------------------------------------------------------- BVA over the record
  caseTest(sdk, ID, '0', 'no hosted entry recorded yet (before any start) → null', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.agentEntry(), null)
  })
  caseTest(sdk, ID, '0 (no connector)', 'a start with no connector records nothing → still null', async (t) => {
    const w = await hostedWorld(t, sdk, { tokens: false })
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), null)
  })
  caseTest(sdk, ID, '1', 'the first start records one entry → agentEntry() is that entry key', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.record.entries(), [newest(1)], 'harness: one entry recorded')
    assert.equal(w.locator.agentEntry(), newest(1))
  })
  caseTest(sdk, ID, '2', 'a reconnect records a second entry → agentEntry() is the newest, not the first', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.deepEqual(w.record.entries(), [newest(1), newest(2)], 'harness: two entries, newest last')
    assert.equal(w.locator.agentEntry(), newest(2))
  })
  caseTest(sdk, ID, 'seeded', 'a record from an earlier run [k-old, k-new] → agentEntry() is k-new, before any start', async (t) => {
    const w = await hostedWorld(t, sdk, { record: ['fbtest-k-old', 'fbtest-k-new'], credentials: { ref: true } })
    assert.equal(w.locator.agentEntry(), 'fbtest-k-new')
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), 'fbtest-k-new', 'a start that creates nothing changed it')
  })

  // ---------------------------------------------------------------- state transitions
  caseTest(sdk, ID, 'ST', 'null --first start--> e1 --reconnect--> e2 --reconnect--> e3; a refused reconnect (credentials-unwritable) keeps e3', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.agentEntry(), null)
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), newest(1))
    await w.locator.reconnect()
    assert.equal(w.locator.agentEntry(), newest(2))
    await w.locator.reconnect()
    assert.equal(w.locator.agentEntry(), newest(3))
    w.credentials.failSet = true
    assert.deepEqual(await w.locator.reconnect(), { ok: false, code: K3.reconnect.unwritable })
    assert.equal(w.locator.agentEntry(), newest(3), 'a refused reconnect moved agentEntry')
  })
  caseTest(sdk, ID, 'ST', 'a refused first start (the child cannot store the value) records nothing → null', async (t) => {
    const w = await hostedWorld(t, sdk, { credentials: { failSet: true } })
    await w.hosted.firstStart().catch(() => {})
    assert.equal(w.locator.agentEntry(), null)
  })
  // child.d.ts: "A new recorded entry is announced by onChange". In this world the hosted module's
  // `changed` hook is the seam host.js forwards to the locator's onChange (subject.mjs: createHostedToken
  // {changed}); the host row itself is not built here, so the rows observe that seam, and that
  // agentEntry() already answers the new key when it fires.
  const announced = (w) => { const before = w.changes; return { fired: () => w.changes > before } }
  caseTest(sdk, ID, 'announce', 'the first recorded entry (first start) is announced (changed fires) and agentEntry() answers it', async (t) => {
    const w = await hostedWorld(t, sdk)
    const a = announced(w)
    await w.hosted.firstStart()
    await tick()
    assert.ok(a.fired(), 'no change was announced for the first entry')
    assert.equal(w.locator.agentEntry(), newest(1))
  })
  caseTest(sdk, ID, 'announce', 'a newly recorded entry (reconnect) is announced (changed fires) and agentEntry() answers the new key', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    await tick()
    const a = announced(w)
    await w.locator.reconnect()
    await tick()
    assert.ok(a.fired(), 'no change was announced for the new entry')
    assert.equal(w.locator.agentEntry(), newest(2))
  })
  caseTest(sdk, ID, 'secret', 'agentEntry() is the entry key only: it never carries the token value', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.equal(String(w.locator.agentEntry()).includes(FIXTURE.planted), false)
  })

  // ---------------------------------------------------------------- the real record file
  caseTest(sdk, ID, 'file', 'the file-backed record: null when missing; the newest key after a start; a reopened record over the same file answers the same key', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    assert.equal(w.locator.agentEntry(), null)
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), newest(1))
    const { openHostedRecord } = await recordModule(sdk)
    const again = await openHostedRecord(recordFile(w.mainHome))
    assert.deepEqual(again.entries().at(-1), newest(1), 'harness: the file holds the entry')
  })
}
