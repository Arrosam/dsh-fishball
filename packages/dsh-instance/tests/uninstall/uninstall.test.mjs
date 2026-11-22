/**
 * Uninstall (README "Uninstall"; createNativeRuntime().uninstall() JSDoc; uninstall.js): the tree
 * `<DSH_HOME>/fishball/runtime` is removed only when no recorded child can still run; a recorded
 * child proven alive is refused CHILD_RUNNING, one whose state cannot be checked CHILD_STATE_UNKNOWN,
 * and a refusal removes nothing. The command prints its own message per cause.
 *
 * Each case lays out a real runtime tree under a scratch main home with the runtime's own layout
 * (files.js prepareLayout: owner marker and secret), then writes the launch records the runtime
 * reads (active.json, launches/<id>/pid.json). The only fake is the runtime's `spawn` dependency,
 * which plays /bin/ps; no real pid is probed. The command rows run the real uninstall.js under
 * plain Node; the ps row preloads ps-unavailable.mjs.
 *
 * Techniques: decision table over the ps answer; EP over the records (no pid record, no recorded
 * child); EP over the command's outcomes (no tree, each cause of an unknown state).
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { importInstance, packageFile } from '../support/instance.mjs'
import { CODE, EXIT, FIXTURE, LAYOUT, PS_ROWS, TEXT, UNKNOWN_CAUSES } from './constants.mjs'

/** A canonical scratch main home (the runtime requires its own real path). */
function mainHome(t) {
  const home = path.join(tempRoot(cleanups(t), FIXTURE.tempPrefix), FIXTURE.homeDir)
  fs.mkdirSync(home, { mode: LAYOUT.dirMode })
  return home
}
const runtimeRoot = (home) => path.join(home, ...LAYOUT.runtime)
const privateJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value) + '\n', { mode: LAYOUT.fileMode, flag: 'wx' })
const treeKept = (home) => fs.existsSync(path.join(runtimeRoot(home), LAYOUT.active))

/** The tree a launch leaves: the layout, then active.json naming one child and (unless `pid: false`) its pid.json. */
async function recordedTree(sdk, home, { child = true, pid = true } = {}) {
  const { prepareLayout } = await importInstance(sdk, 'src/native-runtime/files.js')
  const { paths, marker } = await prepareLayout(home)
  if (!child) return
  const instanceId = randomUUID()
  privateJson(path.join(paths.root, LAYOUT.active), { format: LAYOUT.format, hostId: marker.hostId, instanceId, installAnchor: LAYOUT.installAnchor })
  const launch = path.join(paths.root, LAYOUT.launches, instanceId)
  fs.mkdirSync(launch, { recursive: true, mode: LAYOUT.dirMode })
  if (pid) privateJson(path.join(launch, LAYOUT.pid), { hostId: marker.hostId, instanceId, pid: FIXTURE.pid })
}

/** A `spawn` that plays one ps answer in Node's event order (stdout data, then close; error, then close). */
function fakePs(probe) {
  const calls = []
  const spawn = (command, args) => {
    calls.push({ command, args })
    if (probe.throws) throw new Error('dshi: spawn refused')
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.kill = () => true
    setImmediate(() => {
      if (probe.error) child.emit('error', Object.assign(new Error('dshi: ' + probe.error), { code: probe.error }))
      const output = probe.output === 'listed' ? FIXTURE.listed(FIXTURE.pid) : probe.output
      if (output) child.stdout.emit('data', Buffer.from(output))
      child.emit('close', probe.exit)
    })
    return child
  }
  return { spawn, calls }
}

async function uninstall(sdk, home, probe) {
  const { createNativeRuntime } = await importInstance(sdk, 'src/native-runtime/index.js')
  const ps = fakePs(probe)
  try { return { value: await createNativeRuntime({ mainHome: home }, { spawn: ps.spawn }).uninstall(), ps } } catch (error) { return { error, ps } }
}

const EXPECT = {
  running: (home, outcome) => { assert.equal(outcome.error?.code, CODE.running, JSON.stringify(outcome.value)); assert.ok(treeKept(home), 'the refusal removed the tree') },
  unknown: (home, outcome) => { assert.equal(outcome.error?.code, CODE.unknown, JSON.stringify(outcome.value)); assert.ok(treeKept(home), 'the refusal removed the tree') },
  removed: (home, outcome) => {
    assert.equal(outcome.error, undefined, 'refused: ' + outcome.error?.code)
    assert.equal(outcome.value?.removed, true)
    assert.equal(fs.existsSync(runtimeRoot(home)), false, 'the tree is still there')
    // Nothing else under the main home is removed.
    assert.ok(fs.existsSync(path.dirname(runtimeRoot(home))))
  },
}

/** The real command for `home`, named by --home only (DSH_HOME unset). */
function command(home, { psUnavailable = false } = {}) {
  const preload = psUnavailable ? ['--import', pathToFileURL(path.join(import.meta.dirname, 'ps-unavailable.mjs')).href] : []
  const env = { ...process.env }
  delete env.DSH_HOME
  return spawnSync(process.execPath, [...preload, packageFile('uninstall.js'), '--home', home], { encoding: 'utf8', env })
}

eachSdk((sdk) => {
  for (const r of PS_ROWS) {
    caseTest(sdk, 'UNINST-DT', r.row, `a recorded child whose ps probe ends "${r.row}" → ${r.outcome === 'removed' ? 'the tree is removed' : 'refused ' + CODE[r.outcome] + ', nothing removed'}`, async (t) => {
      const home = mainHome(t)
      await recordedTree(sdk, home)
      const outcome = await uninstall(sdk, home, r.probe)
      EXPECT[r.outcome](home, outcome)
      // ps was asked about the recorded pid, so the row tests the ps answer, not an earlier refusal.
      assert.ok(outcome.ps.calls.some((c) => c.args.includes(String(FIXTURE.pid))), JSON.stringify(outcome.ps.calls))
    })
  }
  caseTest(sdk, 'UNINST-DT', 'no pid record', 'an active record with no pid record for it → refused CHILD_STATE_UNKNOWN, nothing removed', async (t) => {
    const home = mainHome(t)
    await recordedTree(sdk, home, { pid: false })
    EXPECT.unknown(home, await uninstall(sdk, home, { exit: 1, output: '' }))
  })
  caseTest(sdk, 'UNINST-DT', 'no recorded child', 'a tree with no active record → removed', async (t) => {
    const home = mainHome(t)
    await recordedTree(sdk, home, { child: false })
    // Nothing recorded can still run, so ps is never needed (here it could not even be started).
    EXPECT.removed(home, await uninstall(sdk, home, { throws: true }))
  })

  caseTest(sdk, 'UNINST-CLI', 'no tree', 'no runtime tree → "Nothing to remove", exit 0', (t) => {
    const home = mainHome(t)
    const run = command(home)
    assert.equal(run.status, EXIT.done, run.stderr)
    assert.ok(run.stdout.includes(TEXT.absent), run.stdout)
    assert.equal(fs.existsSync(runtimeRoot(home)), false, 'the command created the tree')
  })
  for (const c of UNKNOWN_CAUSES) {
    caseTest(sdk, 'UNINST-CLI', 'state unknown: ' + c.cause, c.cause + ' → exit 1 with CHILD_STATE_UNKNOWN and the message for that cause; nothing removed', async (t) => {
      const home = mainHome(t)
      await recordedTree(sdk, home, { pid: c.pid })
      const run = command(home, { psUnavailable: c.psUnavailable })
      assert.equal(run.status, EXIT.refused, run.stdout + run.stderr)
      assert.ok(run.stderr.includes(CODE.unknown), run.stderr)
      assert.equal(run.stderr.includes(CODE.running), false, 'reported as running: ' + run.stderr)
      assert.doesNotMatch(run.stderr, TEXT.retry, 'the never-succeeding retry remedy')
      for (const phrase of c.mustSay) assert.match(run.stderr, phrase)
      if (c.namesRoot) assert.ok(run.stderr.includes(runtimeRoot(home)), 'names no runtime root: ' + run.stderr)
      for (const phrase of c.mustNotSay) assert.doesNotMatch(run.stderr, phrase)
      assert.ok(treeKept(home), 'the refusal removed the tree')
    })
  }
})
