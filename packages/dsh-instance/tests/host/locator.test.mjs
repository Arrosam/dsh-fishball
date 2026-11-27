/**
 * The child locator `dshInstanceChild` (K3 child.d.ts as I-HOST amended it; locator.js JSDoc):
 * lifecycle transitions as the locator reports them (HOST-UC-06 A1, HOST-ST-01 rows 4–9), the
 * loopback hostnames it serves (UIM-EP-02; Q5 = A), and `agentEntry()` (contract C, 2026-11-21:
 * the entry key of the hosted entry the child holds now, newest recorded, null before any).
 * Real locator + hosted-token rules over fakes (worlds.mjs hostedWorld).
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { drain, settle } from '@dsh-instance/test-helpers/wait'
import { FIXTURE, HOSTNAME, K3, TICKET } from './constants.mjs'
import { hostedWorld, load, recordFile } from './worlds.mjs'

const entry = (n) => FIXTURE.entryPrefix + n
const codeOf = (outcome) => outcome?.error?.code
const admit = (w, over = {}) => settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv4, ...over }))

eachSdk((sdk) => {
  // ============================================================ the K3 service object
  caseTest(sdk, 'HOST-ST-01', 'K', 'the real locator is the K3 service: apiVersion 1, every member a function, providerSync passed through', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.apiVersion, K3.apiVersion)
    for (const m of K3.members) assert.equal(typeof w.locator[m], 'function', m)
    assert.equal(w.locator.providerSync, w.providerSync)
  })

  // ============================================================ lifecycle transitions through the locator
  caseTest(sdk, 'HOST-UC-06', 'A1', 'a crashed child reports its code; Retry restarts it (failed → starting)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.failed, code: K3.code.exited } })
    assert.deepEqual(w.locator.status(), { state: K3.state.failed, code: K3.code.exited })
    await w.locator.retry()
    assert.equal(w.lifecycle.calls.retry, 1)
    assert.equal(w.locator.status().state, K3.state.starting)
  })
  caseTest(sdk, 'HOST-ST-01', 4, 'Running → crash → Failed with the crash code; origin null', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.failed, code: K3.code.exited })
    assert.deepEqual(w.locator.status(), { state: K3.state.failed, code: K3.code.exited })
    assert.equal(w.locator.origin(HOSTNAME.ipv4), null)
  })
  caseTest(sdk, 'HOST-ST-01', 5, 'Failed → Retry → Starting', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.failed, code: K3.code.exited } })
    await w.locator.retry()
    assert.equal(w.locator.status().state, K3.state.starting)
  })
  caseTest(sdk, 'HOST-ST-01', 6, 'Running → restart → Starting: origin null and admit not-ready; ready again → origin back', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.starting, code: null })
    assert.equal(w.locator.origin(HOSTNAME.ipv4), null)
    assert.equal(codeOf(await admit(w)), K3.refusal.notReady)
    w.lifecycle.set({ state: K3.state.ready, code: null })
    assert.equal(w.locator.origin(HOSTNAME.ipv4), `http://${HOSTNAME.ipv4}:${FIXTURE.port}`)
  })
  caseTest(sdk, 'HOST-ST-01', '6 onChange', 'onChange fires on a lifecycle change; its dispose stops it and is idempotent', async (t) => {
    const w = await hostedWorld(t, sdk)
    let calls = 0
    const dispose = w.locator.onChange(() => { calls += 1 })
    w.lifecycle.set({ state: K3.state.starting, code: null })
    await drain()
    assert.ok(calls >= 1, 'onChange did not fire')
    dispose(); dispose()
    const before = calls
    w.lifecycle.set({ state: K3.state.ready, code: null })
    await drain()
    assert.equal(calls, before)
  })
  caseTest(sdk, 'HOST-ST-01', 7, 'Running → host exits → Stopped: origin null, admit not-ready', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.stopped, code: null })
    assert.equal(w.locator.status().state, K3.state.stopped)
    assert.equal(w.locator.origin(HOSTNAME.localhost), null)
    assert.equal(codeOf(await admit(w, { hostname: HOSTNAME.localhost })), K3.refusal.notReady)
  })
  caseTest(sdk, 'HOST-ST-01', 9, 'Stopped → Retry → Stopped (nothing restarts, nothing created)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.stopped, code: null } })
    await w.locator.retry()
    assert.equal(w.locator.status().state, K3.state.stopped)
    assert.equal(w.lifecycle.calls.retry, 0)
    assert.deepEqual(w.tokens.calls.created, [])
  })

  // ============================================================ UIM-EP-02: the hostnames admit and origin serve
  for (const [row, hostname] of [[1, HOSTNAME.ipv4], [2, HOSTNAME.localhost]]) {
    caseTest(sdk, 'UIM-EP-02', row, `origin(${hostname}) is http://${hostname}:<child port> while ready`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(w.locator.origin(hostname), `http://${hostname}:${FIXTURE.port}`)
    })
    caseTest(sdk, 'UIM-EP-02', row, `admit under ${hostname} resolves {url} = http://${hostname}:<port>/api/dsh-instance/admit?ticket=… and nothing else`, async (t) => {
      const w = await hostedWorld(t, sdk)
      const out = (await admit(w, { hostname })).value
      assert.deepEqual(Object.keys(out), ['url'])
      const url = new URL(out.url)
      assert.equal(url.origin, `http://${hostname}:${FIXTURE.port}`)
      assert.equal(url.pathname, TICKET.path)
      assert.deepEqual([...url.searchParams.keys()], [TICKET.param])
      assert.ok(url.searchParams.get(TICKET.param).length > 0)
    })
    caseTest(sdk, 'UIM-EP-02', row, `admit under ${hostname} asks for a ticket with audience ${hostname}:<port>, the view and the lang`, async (t) => {
      const w = await hostedWorld(t, sdk)
      await admit(w, { view: K3.views[1], lang: K3.langs[0], hostname })
      assert.deepEqual(w.issued, [{ audience: `${hostname}:${FIXTURE.port}`, view: K3.views[1], lang: K3.langs[0] }])
    })
  }
  caseTest(sdk, 'UIM-EP-02', 3, '[::1] (Q5 = A): origin null and admit rejects not-ready, even while ready', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.origin(HOSTNAME.ipv6), null)
    assert.equal(codeOf(await admit(w, { hostname: HOSTNAME.ipv6 })), K3.refusal.notReady)
  })
  for (const name of HOSTNAME.refused) {
    caseTest(sdk, 'UIM-EP-02', 4, `a non-loopback name ${JSON.stringify(name)} → admit rejects hostname-refused; origin null`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(codeOf(await admit(w, { hostname: name })), K3.refusal.hostname)
      assert.equal(w.locator.origin(name), null)
      assert.deepEqual(w.issued, [])
    })
  }
  caseTest(sdk, 'UIM-EP-02', '4 not ready', 'a non-loopback name is refused hostname-refused even while the child is not ready (the name is checked first)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.stopped, code: null } })
    assert.equal(codeOf(await admit(w, { hostname: HOSTNAME.refused[0] })), K3.refusal.hostname)
  })
  for (const [title, request] of [['a view outside K3', { view: 'board' }], ['a lang outside K3', { lang: 'fr' }]]) {
    caseTest(sdk, 'UIM-EP-02', 'input', `${title} under a served hostname → admit rejects invalid-request`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(codeOf(await admit(w, request)), K3.refusal.invalid)
      assert.deepEqual(w.issued, [])
    })
  }
  caseTest(sdk, 'UIM-EP-02', 'mint', 'a ticket that cannot be minted (the child left) → admit rejects not-ready', async (t) => {
    const w = await hostedWorld(t, sdk, { ticket: async () => { throw new Error('fbtest child gone') } })
    assert.equal(codeOf(await admit(w)), K3.refusal.notReady)
  })
  caseTest(sdk, 'UIM-EP-02', 'one-time', 'two admits give two different tickets (one per frame navigation)', async (t) => {
    const w = await hostedWorld(t, sdk)
    const a = (await admit(w)).value
    const b = (await admit(w)).value
    assert.notEqual(a.url, b.url)
  })

  // ============================================================ AGENT-ENTRY (K3 agentEntry)
  caseTest(sdk, 'AGENT-ENTRY', 'member', 'the real locator has agentEntry() as a function', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(typeof w.locator.agentEntry, 'function')
  })
  caseTest(sdk, 'AGENT-ENTRY', 0, 'no hosted entry recorded yet (before any start) → null', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.agentEntry(), null)
  })
  caseTest(sdk, 'AGENT-ENTRY', '0 (no connector)', 'a start with no connector records nothing → still null', async (t) => {
    const w = await hostedWorld(t, sdk, { tokens: false })
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), null)
  })
  caseTest(sdk, 'AGENT-ENTRY', 1, 'the first start records one entry → agentEntry() is that entry key', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), entry(1))
  })
  caseTest(sdk, 'AGENT-ENTRY', 2, 'a Reconnect after deletion records a replacement → agentEntry() is the newest, not the deleted entry', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(entry(1), K3.entry.deleted)
    assert.equal((await w.locator.reconnect()).ok, true)
    assert.equal(w.locator.agentEntry(), entry(2))
  })
  caseTest(sdk, 'AGENT-ENTRY', 'seeded', 'a record from an earlier run [k-old, k-new] → agentEntry() is k-new, before and after a start that creates nothing', async (t) => {
    const w = await hostedWorld(t, sdk, { record: ['fbtest-k-old', 'fbtest-k-new'], credentials: { ref: true } })
    assert.equal(w.locator.agentEntry(), 'fbtest-k-new')
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), 'fbtest-k-new')
  })
  caseTest(sdk, 'AGENT-ENTRY', 'ST', 'null --first start--> e1 --Reconnect--> e1; after deletion a refused replacement keeps the recorded e1', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.agentEntry(), null)
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), entry(1))
    assert.equal((await w.locator.reconnect()).ok, false)
    assert.equal(w.locator.agentEntry(), entry(1))
    w.tokens.setState(entry(1), K3.entry.deleted)
    w.credentials.failSet = true
    assert.deepEqual(await w.locator.reconnect(), { ok: false, code: K3.refusal.unwritable })
    assert.equal(w.locator.agentEntry(), entry(1))
  })
  caseTest(sdk, 'AGENT-ENTRY', 'ST refused', 'a refused first start (the child cannot store the value) records nothing → null', async (t) => {
    const w = await hostedWorld(t, sdk, { credentials: { failSet: true } })
    await settle(() => w.hosted.firstStart())
    assert.equal(w.locator.agentEntry(), null)
  })
  for (const [part, title, before] of [
    ['announce first', 'the first recorded entry (first start) is announced (changed) and agentEntry() answers it', async () => {}],
    ['announce reconnect', 'Reconnect after deletion announces the replacement and agentEntry() answers the new key', async (w) => {
      await w.hosted.firstStart()
      w.tokens.setState(entry(1), K3.entry.deleted)
    }],
  ]) {
    caseTest(sdk, 'AGENT-ENTRY', part, title, async (t) => {
      const w = await hostedWorld(t, sdk)
      await before(w)
      const changes = w.changes
      let seen
      const act = part === 'announce first' ? w.hosted.firstStart() : w.locator.reconnect()
      await act
      seen = w.locator.agentEntry()
      assert.ok(w.changes > changes, 'no change was announced')
      assert.equal(seen, entry(part === 'announce first' ? 1 : 2))
    })
  }
  caseTest(sdk, 'AGENT-ENTRY', 'secret', 'agentEntry() is the entry key only: it never carries the token value', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.equal(String(w.locator.agentEntry()).includes(FIXTURE.planted), false)
  })
  caseTest(sdk, 'AGENT-ENTRY', 'file', 'the file-backed record: null when missing; the newest key after a start; a reopened record over the file answers the same key', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    assert.equal(w.locator.agentEntry(), null)
    await w.hosted.firstStart()
    assert.equal(w.locator.agentEntry(), entry(1))
    const { openHostedRecord } = await load(sdk, 'record')
    assert.equal((await openHostedRecord(recordFile(w.mainHome))).entries().at(-1), entry(1))
  })
})
