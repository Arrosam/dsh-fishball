/**
 * The hosted token and the child's lifecycle in a real host DSH with the real connector (README
 * "The hosted token", "The child", "Ready", "Model sync", "Uninstall"): the host suite's rows that
 * needed a hosted child (HOST-UC-01 main 4–5, wire, overlay; HOST-UC-06 main and A2; HOST-EP-02
 * rows 2, 4, 5; HOST-ST-01 row 10; SYNC Q-G7), the ready suite's SYSTEM rows and the succession rows
 * (HOST-UC-03 main 1, HOST-DT-01 rule 7).
 *
 * Observed only through routes (the instance's status, reconnect and model sync; the connector's
 * settings-page state), the files the instance writes under the throwaway home (hosted.json, the
 * launch overlay, lifecycle.log, the child's own credential store and profile) and processes by pid.
 * The lifecycle rows share one home per SDK and run in order. Each HOST-UC-02 case uses its own home.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { eachSdk } from '@dsh-instance/test-helpers/cases'
import { untilValue } from '@dsh-instance/test-helpers/host-dsh'
import { filesUnder, leakHits } from '@dsh-instance/test-helpers/scratch'
import {
  CHILD, FIXTURE, HTTP, OVERLAY, ROUTE, STATE, admitChild, alive, connectorEntries, psAvailable, hostedWorld, insertedRow, perSdk, readJson, readText, runUninstall, show,
} from '../support/hosted-child.mjs'

const LOG = Object.freeze({ file: 'lifecycle.log', ready: 'READY', stop: 'STOP', start: 'START', childFailed: 'CHILD_FAILED' })
/** The connector's entry label for an instance-made entry (README "The hosted token": "Fishball (hosted)"). */
const HOSTED_LABEL = 'Fishball (hosted)'
/** Core's default local identity (dsh-fishball HOST-UC-01 main 4: id fb- + 16 lowercase base32, name "Fishball"). */
const CORE_ID = /^fb-[a-z2-7]{16}$/
const CORE_NAME = 'Fishball'
/** The one-shot reference imported into the child (README "The hosted token"), as a DSH YAML key. */
const IMPORTED_REF_KEY = /^ {2}DSH_AGENT_TOKEN:/m
/** The child page's public view of the reserved parent (README "The hosted token"). */
const PARENT = Object.freeze({
  route: '/api/fishball/targets', id: 'parent', needId: 'need-id',
  blockedLinkStates: Object.freeze(['target-unset', 'target-unreachable', 'token-refused']),
})

const lifecycleCodes = (home) => (readText(path.join(home, ...CHILD.runtime, LOG.file)) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l).code)
/** The top-level record names of a DSH credential store (YAML, two-space keys under records:). */
const recordNames = (file) => (readText(file) ?? '').split('\n').filter((l) => /^  \S[^:]*:\s*$/.test(l)).map((l) => l.trim().slice(0, -1))

const hostedKeys = (entries) => entries.filter((e) => e.label === HOSTED_LABEL).map((e) => e.key).sort()

const childCredentialFile = (child) => path.join(child.dshHome, CHILD.credentials)
const hasSavedParent = (child) => recordNames(childCredentialFile(child)).includes(CHILD.savedRecord)

// Report only the endpoint, never any userinfo, query, or response body.
function endpoint(url) {
  const parsed = url && URL.parse(url)
  return parsed ? parsed.origin + parsed.pathname : null
}

async function parentTarget({ origin, cookie }) {
  const response = await fetch(origin + PARENT.route, { headers: { cookie }, redirect: 'manual' })
  assert.equal(response.status, HTTP.ok, 'the child target list was not served')
  // Parse outside the JSON error path so invalid responses cannot echo body snippets.
  const body = await response.json().catch(() => null)
  const parent = body?.targets?.find((target) => target.targetId === PARENT.id)
  return parent && { url: endpoint(parent.url), link: parent.link?.state, code: parent.link?.code, pairing: parent.pairing?.state, connecting: parent.connecting }
}

const linkBlocked = (target) => target && target.connecting !== true && (target.pairing === PARENT.needId || PARENT.blockedLinkStates.includes(target.link))

const observeRestart = (world, admission, key) => untilValue(async () => {
  const parent = await parentTarget(admission)
  const entries = await connectorEntries(world.host)
  const entry = entries.find((item) => item.key === key)
  // Either the original link is back or the child reports an idle failure; never wait for the
  // original link alone, since BUG-3 still needs observations after its failure.
  return (entry?.connected === true || linkBlocked(parent)) && { parent, entries, entry }
})

async function readyInWorld(world, sdk) {
  const s = await world.start(sdk)
  assert.equal(s?.state, STATE.ready, 'precondition: the hosted child is ready; status ' + show(s))
  return world.child
}

/** The child has paired: its connector entry is paired and connected (the import is asynchronous after ready). */
const pairedInWorld = (world) => untilValue(async () => {
  const entries = (await connectorEntries(world.host)).filter((e) => e.label === HOSTED_LABEL)
  const key = world.child.hosted()?.entries?.at(-1)
  const entry = entries.find((e) => e.key === key)
  return entry?.paired === true && entry.connected === true && { entry, entries }
})

async function admitOwner(world) {
  const admission = await admitChild(world.host)
  assert.equal(admission.status, HTTP.seeOther, 'the child did not admit its owner')
  return admission
}

/** Observe a real host restart without requiring the MCP link to come back. */
async function restartAndAdmit(world) {
  const status = await world.restart()
  assert.equal(status?.state, STATE.ready, show(status))
  return admitOwner(world)
}

eachSdk((sdk) => {
  const w = hostedWorld('hc-token', { env: { [FIXTURE.providerKeyEnv]: FIXTURE.providerKey } })
  perSdk(sdk, 'hosted token and lifecycle', w, (caseRow) => {
    // Every case ends with a one-line trace of the hosted record and the connector's entries (keys
    // shortened, no value), so a later case's surprise can be traced to the case that caused it.
    const row = (id, part, title, fn, options) => caseRow(id, part, title, async () => {
      try { await fn() } finally {
        if (w.host && !w.host.exited) {
          const entries = await connectorEntries(w.host).catch(() => [])
          console.log('# ' + id + ' ' + part + ': hosted ' + show((w.child.hosted()?.entries ?? []).map((k) => k.slice(0, 6))) + ' connector ' + show(entries.map((e) => [e.key.slice(0, 6), e.paired, e.connected, e.name])))
        }
      }
    }, options)
    const ready = () => readyInWorld(w, sdk)
    const paired = () => pairedInWorld(w)
    const memo = {}

    // ============================================================== HOST-UC-01: the first start
    row('HOST-UC-01', 'overlay', 'a real start writes dsh-instance-child {targetUrl: <host origin>/api/agent/mcp} with a same-DSH connector', async () => {
      const child = await ready()
      const row = insertedRow(child.overlays()[0] ?? [], OVERLAY.childRow)
      assert.ok(row, 'no ' + OVERLAY.childRow + ' row in the launch overlay')
      const origin = new URL(w.host.origin)
      origin.hostname = '127.0.0.1'
      assert.equal(row.config?.[OVERLAY.targetField], origin.origin + OVERLAY.mcpPath, show(row.config))
    })
    row('HOST-UC-01', 'wire', 'the host asks over mcp-credential after the start\'s authenticated wire: exactly one "Fishball (hosted)" entry created and recorded, and the child stores it', async () => {
      const child = await ready()
      const { entries } = await paired()
      const record = child.hosted()
      assert.equal(record?.entries?.length, 1, 'hosted.json: ' + show(record))
      assert.deepEqual(entries.map((e) => e.key), record.entries, 'the connector\'s hosted entries are not the recorded one: ' + show(entries))
      assert.ok(recordNames(path.join(child.dshHome, CHILD.credentials)).includes(CHILD.savedRecord), 'core saved no hosted copy in the child credential store')
      memo.firstKey = record.entries[0]
      // The value, read from the one allowed child place (core's saved copy), for HOST-EP-02's sweep.
      memo.value = /token:\s*(dsht_\S+)/.exec(readText(path.join(child.dshHome, CHILD.credentials)) ?? '')?.[1]
    })
    row('HOST-UC-01', 'main 4–5', 'core authenticates with its own identity.id, pairs, and the hosted entry is the agent with a window here (named Fishball, connected)', async () => {
      await ready()
      const { entry } = await paired()
      assert.match(entry.id ?? '', CORE_ID, show(entry))
      assert.equal(entry.name, CORE_NAME, show(entry))
      // The designated-agent part (routing.fishballToken) was withdrawn (dsh-connector C-WIRE-2: "Remove
      // agentToken entirely"); what replaces it is the locator's agentEntry, the newest recorded key.
      assert.equal(entry.key, w.child.hosted().entries.at(-1))
    })
    // Right after the first pairing, so the record's newest entry is the paired one named Fishball: the
    // succession's old entry is always the newest the record holds (README "Reinstall").
    row('HOST-UC-03', 'main 1', 'a real reinstalled child DSH pairs nameless (name-taken), then takes the old name in the succession', async () => {
      await ready()
      const before = w.child.hosted().entries
      const old = before.at(-1)
      const s = await w.restart((home) => {
        const r = runUninstall(home)
        assert.equal(r.status, 0, 'uninstall refused: ' + r.stdout + r.stderr)
      })
      assert.equal(s?.state, STATE.ready, show(s))
      // The reinstalled child has no credential: the first start creates one new entry (its successor).
      const record = await untilValue(() => { const h = w.child.hosted(); return h?.entries?.length === before.length + 1 && h })
      assert.deepEqual(record.entries.slice(0, -1), before, show(record))
      const successor = record.entries.at(-1)
      // The succession ends with the old entry deleted and the successor paired, holding the old name
      // (it paired nameless first, since the old entry held "Fishball").
      const entries = await untilValue(async () => {
        const list = await connectorEntries(w.host)
        return !list.some((e) => e.key === old) && list.find((e) => e.key === successor)?.paired === true && list
      })
      assert.equal(entries.find((e) => e.key === successor).name, CORE_NAME, show(entries))
      // The rows after this one run on the reinstalled child: its entry is the one a restart must keep.
      memo.firstKey = successor
      memo.value = /token:\s*(dsht_\S+)/.exec(readText(path.join(w.child.dshHome, CHILD.credentials)) ?? '')?.[1]
    })

    row('HOST-DT-01', 2, 'a child restart (credential present) creates nothing: the newest entry is the same key and the connector lists one hosted entry', async () => {
      await ready()
      await paired()
      const s = await w.restart()
      assert.equal(s?.state, STATE.ready, show(s))
      // The first-start rule has run once the wire is up; a created entry would be recorded by then.
      await admitChild(w.host)
      assert.equal(w.child.hosted().entries.at(-1), memo.firstKey, 'a restart created an entry: ' + show(w.child.hosted()))
      assert.equal((await connectorEntries(w.host)).filter((e) => e.label === HOSTED_LABEL).length, 1)
    })


    // ============================================================== HOST-EP-02 rows 2, 4, 5 (where the hosted value may appear)
    row('HOST-EP-02', '2, 4, 5', 'child home files other than its credential store, child argv and environment, temp dirs and logs of a running child: the hosted value is absent', async () => {
      const child = await ready()
      const value = memo.value
      assert.ok(value, 'precondition: HOST-UC-01 wire read no token value from core\'s saved copy')
      const allowed = [path.join(child.dshHome, CHILD.credentials), path.join(w.home, CHILD.credentials)]
      const places = { output: w.host.output, overlay: show(child.overlays()), status: show(await w.status()) }
      const hits = leakHits([value], { places, dirs: [w.home, process.env.TMPDIR].filter(Boolean), allowed })
      assert.deepEqual(hits, [])
      // Row 4 (argv and environment) is read through the files above: the overlay and the launch
      // records are the child's arguments; /proc-style environment reads are not available on macOS.
    })

    // ============================================================== SYNC Q-G7, INITSYNC-SYSTEM-01
    row('INITSYNC-SYSTEM-01', 'real-child', 'first real child start syncs once and a restart does not', async () => {
      const child = await ready()
      const marker = path.join(child.runtime, CHILD.initialSync)
      await untilValue(() => fs.existsSync(marker))
      assert.equal(readJson(marker)?.format, CHILD.initialSyncFormat, show(readJson(marker)))
      const before = fs.statSync(marker).mtimeMs
      assert.equal((await w.restart())?.state, STATE.ready)
      await admitChild(w.host)
      assert.equal(fs.statSync(marker).mtimeMs, before, 'a restart wrote the marker again')
    })
    row('SYNC', 'Q-G7', "a check and add from the instance's page add the provider to the child and leave the child's default-model setting unchanged; the key never reaches the page", async () => {
      const child = await ready()
      const set = await w.host.call('settingsUpdate', { ns: FIXTURE.provider.ns, patch: { providers: { [FIXTURE.provider.id]: FIXTURE.provider.profile } } })
      assert.equal(set?.ok, true, 'precondition: the main provider could not be written: ' + show(set))
      const patchFile = path.join(child.profile, CHILD.patch)
      // The child's model choice is fishball-core's / DSH's default-model setting (README "Model sync": it syncs the list only).
      const modelLines = (text) => (text ?? '').split('\n').filter((l) => /defaultModel|agent-default-model/.test(l))
      const before = modelLines(readText(patchFile))
      const check = await w.host.post(ROUTE.modelsCheck, {})
      assert.equal(check.json?.ok, true, show(check.json))
      const missing = (check.json.result?.missing ?? []).map((m) => m.id)
      assert.ok(missing.includes(FIXTURE.provider.id), 'the provider is not offered: ' + show(check.json))
      const add = await w.host.post(ROUTE.modelsAdd, { checkId: check.json.result.checkId, ids: [FIXTURE.provider.id] })
      assert.equal(add.json?.ok, true, show(add.json))
      for (const text of [check.text, add.text]) assert.equal(text.includes(FIXTURE.providerKey), false, 'the key reached the page')
      const after = readText(patchFile)
      assert.ok(after.includes(FIXTURE.provider.id), 'the provider was not added to the child: ' + after)
      assert.deepEqual(modelLines(after), before, 'the child\'s default-model settings changed')
    })

    // ============================================================== IREADY-SYSTEM
    row('IREADY-SYSTEM', 'origin', 'attached generation childOrigin is the authenticated health origin: Open admits at the child\'s own loopback origin', async () => {
      await ready()
      const child = await admitChild(w.host)
      assert.equal(child.status, HTTP.seeOther)
      const url = new URL(child.origin)
      assert.equal(url.hostname, '127.0.0.1')
      assert.notEqual(url.port, new URL(w.host.origin).port)
    })
    row('IREADY-SYSTEM', 'stop', 'real lifecycle stop never returns ready on late publication: after a stop the status is not ready and lifecycle.log ends STOP', async () => {
      await ready()
      const off = await w.host.call('settingsUpdate', { ns: 'dsh-instance', patch: { enabled: false } })
      assert.equal(off?.ok, true, show(off))
      const s = await w.settle([STATE.disabled, STATE.failed, STATE.stopped])
      assert.equal(s.state, STATE.disabled, show(s))
      assert.equal(lifecycleCodes(w.home).at(-1), LOG.stop, show(lifecycleCodes(w.home)))
      assert.notEqual((await w.status())?.state, STATE.ready)
      const on = await w.host.call('settingsUpdate', { ns: 'dsh-instance', patch: { enabled: true } })
      assert.equal(on?.ok, true, show(on))
      assert.equal((await w.settle())?.state, STATE.ready)
    })
    // Rewritten to what is observable: the lifecycle row injects every base service it requires, so a
    // child missing one never applies the row and DSH's loader fails the boot first (seen: lifecycle.log
    // ends START, never CHILD_BOOT); the row's own "missing at appReady → CHILD_FAILED" branch needs a
    // service that vanishes between apply and appReady, which nothing outside can cause.
    row('IREADY-SYSTEM', 'fatal', 'missing base service: the start fails (failed, the child exited) and its process is gone; with the service back the child starts again', async () => {
      const child = await ready()
      const patch = path.join(child.profile, CHILD.patch)
      const original = readText(patch)
      try {
        // 'agent' provides the base service agents (README "Ready" lists the base services).
        const status = await w.restart(() => fs.writeFileSync(patch, JSON.stringify([{ id: 'agent', disabled: true }])))
        assert.equal(status?.state, STATE.failed, show(status))
        assert.notEqual(lifecycleCodes(w.home).at(-1), LOG.ready, show(lifecycleCodes(w.home)))
        for (const pid of w.child.pids()) assert.equal(alive(pid), false, 'the failed child ' + pid + ' still runs')
      } finally {
        fs.writeFileSync(patch, original)
        assert.equal((await w.restart())?.state, STATE.ready, 'the child did not start again with the service back')
      }
    })
    row('IREADY-SYSTEM', 'operations', 'removed native-access/control operations return lifecycle error; attach publishes retained transports', () => {}, { todo: 'not observable from outside: the lifecycle wire is an authenticated socket whose secret is the instance\'s; a test that speaks it would imitate the implementation. Its outcome (provider-sync and mcp-credential work) is covered by SYNC Q-G7 and HOST-UC-01 wire' })
    row('IREADY-SYSTEM', 'publish-dispose', 'nativeRuntime.publishWeb dispose withdraws lifecycle health readiness', () => {}, { todo: 'not observable from outside: no public action disposes the child-side row\'s web publication without stopping the child' })

    // ============================================================== HOST-DT-01 rule 7, HOST-UC-03 main 1 (reinstall)
    row('HOST-DT-01', 7, 'pair answers already-paired → create another new entry', () => {}, { todo: 'not reachable from outside: a hosted child pairs with a token created for it (R-HOST-05: "A hosted child therefore never meets already-paired"); making pair answer it needs a token the instance created but someone else bound, and only the instance and the child ever hold that value' })
    // ============================================================== HOST-UC-06 A2, HOST-ST-01 row 10, HOST-UC-06 main (last: they stop the host)
    row('HOST-UC-06', 'A2', "uninstall removes the child runtime and never touches the connector's hosted entries (Q-B3 B)", async () => {
      await ready()
      // Observed while DSH is down, before the next start's succession runs: the connector's entries
      // are its own settings (the main profile's patch) and its storage, neither of which the command touches.
      const connectorFiles = (home) => [path.join(home, 'profiles', 'dshi', CHILD.patch), ...filesUnder(path.join(home, 'storages')).map(([f]) => f)].map((f) => [f, readText(f)])
      let result
      await w.restart((home) => {
        const hosted = readText(path.join(home, ...CHILD.hosted))
        const before = connectorFiles(home)
        result = runUninstall(home)
        assert.equal(result.status, 0, result.stdout + result.stderr)
        assert.equal(fs.existsSync(path.join(home, ...CHILD.runtime)), false, 'the runtime is still there')
        assert.equal(readText(path.join(home, ...CHILD.hosted)), hosted, 'hosted.json changed')
        assert.deepEqual(connectorFiles(home), before, "the uninstall changed the connector's files")
      })
    })
    row('HOST-ST-01', 10, 'Running → uninstall → Removed (with DSH quit first; while the child runs the command refuses, CHILD_RUNNING)', async () => {
      await ready()
      const running = runUninstall(w.home)
      assert.notEqual(running.status, 0, 'uninstall ran while the child runs: ' + running.stdout)
      // README "Uninstall": CHILD_RUNNING; CHILD_STATE_UNKNOWN where /bin/ps cannot be run (a sandbox).
      assert.match(running.stdout + running.stderr, psAvailable() ? /CHILD_RUNNING/ : /CHILD_RUNNING|CHILD_STATE_UNKNOWN/)
      assert.ok(fs.existsSync(path.join(w.home, ...CHILD.runtime)), 'a refused uninstall removed something')
      let removed
      await w.restart((home) => { removed = runUninstall(home); assert.equal(fs.existsSync(path.join(home, ...CHILD.runtime)), false) })
      assert.equal(removed.status, 0, removed.stdout + removed.stderr)
    })
    row('HOST-UC-06', 'main', 'the child starts only after the host app ready; when the host exits, the child stops', async () => {
      await ready()
      // The host logs READY once it has seen the child's ready answer (right after the status turns ready).
      const codes = await untilValue(() => { const c = lifecycleCodes(w.home); return c.at(-1) === LOG.ready && c })
      assert.ok(codes.lastIndexOf(LOG.start) < codes.lastIndexOf(LOG.ready), show(codes))
      const pids = w.child.pids()
      assert.ok(pids.length === 1 && alive(pids[0]), 'precondition: one live child ' + show(pids))
      await w.host.stop()
      await untilValue(() => !alive(pids[0]))
      assert.equal(w.child.overlays().length, 0, 'the stopped child left its launch overlay')
      assert.equal(lifecycleCodes(w.home).at(-1), LOG.stop)
    })
  })

  // A fresh pairing per case makes the three observations independent and individually filterable.
  const regression = (part, title, check, todo) => {
    const world = hostedWorld('hc-token-' + part)
    perSdk(sdk, 'hosted token ' + part, world, (row) => {
      row('HOST-UC-02', part, title, async () => {
        const child = await readyInWorld(world, sdk)
        const initial = await pairedInWorld(world)
        // Start from the durable credential, not a transient reference the core has not consumed yet.
        await untilValue(() => hasSavedParent(child) && !IMPORTED_REF_KEY.test(readText(childCredentialFile(child)) ?? ''))
        await check(world, initial)
      }, { todo })
    })
  }

  regression('A1', 'a host DSH restart (a new wire, the credential present): the child links to the parent again with its paired entry', async (world, initial) => {
    const admission = await restartAndAdmit(world)
    const { parent, entry } = await observeRestart(world, admission, initial.entry.key)
    const launchTarget = endpoint(insertedRow(world.child.overlays()[0] ?? [], OVERLAY.childRow)?.config?.[OVERLAY.targetField])
    assert.deepEqual({ paired: entry?.paired, connected: entry?.connected }, { paired: true, connected: true },
      'after the restart: ' + show({ launchTarget, parent, savedParent: hasSavedParent(world.child) }))
  }, 'BUG-2: Fishball does not preserve the parent link when the host origin changes')

  regression('main', 'repeated host restarts (credential present each time) create nothing: no new hosted entry after a second and a third restart', async (world, initial) => {
    const before = { record: world.child.hosted().entries, connector: hostedKeys(initial.entries) }
    const lastRestart = 3
    const observations = []
    const diagnostics = []
    for (let restart = 1; restart <= lastRestart; restart++) {
      const admission = await restartAndAdmit(world)
      const { parent, entries } = await observeRestart(world, admission, initial.entry.key)
      // A new entry can show up in the connector even if the child did not save it in hosted.json.
      observations.push({ restart, record: world.child.hosted().entries, connector: hostedKeys(entries) })
      diagnostics.push({ restart, parent, savedParent: hasSavedParent(world.child) })
    }
    assert.deepEqual(observations, observations.map(({ restart }) => ({ restart, ...before })), 'a restart changed the hosted entries: ' + show(diagnostics))
  }, 'BUG-3: later host restarts create new hosted entries after Fishball loses its saved parent credential')

  regression('reconnect', 'Reconnect creates one new entry, imports it once, and the child pairs it without removing or unpairing the old entry', async (world, initial) => {
    const before = world.child.hosted().entries
    const res = await world.host.post(ROUTE.reconnect, {})
    assert.deepEqual(res.json, { ok: true }, show(res.json))
    const after = world.child.hosted().entries
    assert.deepEqual(after.slice(0, -1), before, 'Reconnect moved or deleted a recorded entry')
    assert.equal(after.length, before.length + 1, 'not exactly one new entry: ' + show(after))
    const newKey = after.at(-1)
    assert.ok(!before.includes(newKey), 'Reconnect recorded an existing key again: ' + show(after))
    const admission = await admitOwner(world)
    const oldKey = initial.entry.key
    const { parent, entries, oldEntry, added } = await untilValue(async () => {
      const parent = await parentTarget(admission)
      const entries = await connectorEntries(world.host)
      const oldEntry = entries.find((entry) => entry.key === oldKey)
      const added = entries.find((entry) => entry.key === newKey)
      // Besides pairing, an idle link failure or prompt for a new ID ends the observation.
      const settled = added?.paired === true || linkBlocked(parent)
      return oldEntry?.connected !== true && settled && { parent, entries, oldEntry, added }
    })
    assert.deepEqual(hostedKeys(entries), [...hostedKeys(initial.entries), newKey].sort(), 'Reconnect changed more than one connector entry')
    assert.equal(oldEntry?.paired, true, 'Reconnect unpaired or removed the old entry')
    assert.equal(added?.paired, true, 'the child did not pair the Reconnect entry: ' + show({ parent, savedParent: hasSavedParent(world.child) }))
  }, 'BUG-4: Reconnect cannot pair a new entry while the old entry holds the same Fishball identity')
})