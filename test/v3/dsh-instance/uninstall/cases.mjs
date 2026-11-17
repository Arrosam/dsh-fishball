/**
 * Uninstall cases (E-FIX-1 B8, P2): the runtime's `uninstall()` and the `uninstall.js` command
 * tell "the recorded child runs" (CHILD_RUNNING) from "its state cannot be checked"
 * (CHILD_STATE_UNKNOWN), and remove the tree only when the child is proven dead or none is recorded.
 *
 * Level: integration over real files. Each case lays out a real runtime tree under a scratch main
 * home with the runtime's own layout function (files.js prepareLayout: owner marker and secret),
 * then writes the launch records the runtime reads (active.json, launches/<id>/pid.json) for one
 * recorded child. The only fake is the `spawn` dependency of `createNativeRuntime`, which plays
 * `/bin/ps`; no process is started and no real pid is probed. The command rows run the real
 * `uninstall.js` under plain Node, choosing only states that need no ps answer.
 *
 * Decision table (constants.mjs PS_ROWS, one row per ps ending × output), plus:
 * - no pid record for the active record → CHILD_STATE_UNKNOWN (B8);
 * - a tree with no recorded child → removed (nothing recorded can still run);
 * - no tree → nothing to remove, exit 0.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { importInstance } from '../../../private-skills/support/sdk.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { canonicalTmp, cleanups } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { CODE, EXIT, FIXTURE, LAYOUT, MODULES, PS_ROWS, TEXT } from './constants.mjs'

/** A scratch main home (canonical, as the runtime requires), removed after the test. */
function mainHome(t) {
  const scope = cleanups(t)
  const base = canonicalTmp()
  const root = fs.mkdtempSync(path.join(base, FIXTURE.tempPrefix))
  scope.defer(() => {
    assert.ok(path.dirname(root) === base && path.basename(root).startsWith(FIXTURE.tempPrefix), 'refusing to remove ' + root)
    fs.rmSync(root, { recursive: true, force: true })
  })
  const home = path.join(root, FIXTURE.homeDir)
  fs.mkdirSync(home, { mode: LAYOUT.dirMode })
  return home
}
const runtimeRoot = (home) => path.join(home, ...LAYOUT.runtime)
const privateJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value) + '\n', { mode: LAYOUT.fileMode, flag: 'wx' })

/**
 * The tree the runtime leaves after a launch: its own layout, then `active.json` naming one child
 * and (`pid: false` omits it) that launch's `pid.json`. `child: false` leaves the tree with no record.
 */
async function recordedTree(sdk, home, { child = true, pid = true } = {}) {
  const { prepareLayout } = await importInstance(sdk, MODULES.files)
  const { paths, marker } = await prepareLayout(home)
  if (!child) return paths
  const instanceId = randomUUID()
  privateJson(path.join(paths.root, LAYOUT.active), { format: LAYOUT.format, hostId: marker.hostId, instanceId, installAnchor: LAYOUT.installAnchor })
  const launch = path.join(paths.root, LAYOUT.launches, instanceId)
  fs.mkdirSync(launch, { recursive: true, mode: LAYOUT.dirMode })
  if (pid) privateJson(path.join(launch, LAYOUT.pid), { hostId: marker.hostId, instanceId, pid: FIXTURE.pid })
  return paths
}

/**
 * A `spawn` that plays one ps answer (constants.mjs PS_ROWS `probe`), recording each call. Its
 * events follow Node's order: stdout data, then `close`; a failed start emits `error`, then `close`.
 */
function fakePs(probe) {
  const calls = []
  const spawn = (command, args) => {
    calls.push({ command, args })
    if (probe.throws) throw new Error('fbtest: spawn refused')
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.kill = () => true
    setImmediate(() => {
      if (probe.error) child.emit('error', Object.assign(new Error('fbtest: ' + probe.error), { code: probe.error }))
      const output = probe.output === 'listed' ? FIXTURE.listed(FIXTURE.pid) : probe.output
      if (output) child.stdout.emit('data', Buffer.from(output))
      child.emit('close', probe.exit)
    })
    return child
  }
  return { spawn, calls }
}

/** `uninstall()` with a fake ps: `{value}` or `{error}`. */
async function uninstall(sdk, home, probe) {
  const { createNativeRuntime } = await importInstance(sdk, MODULES.runtime)
  const ps = fakePs(probe)
  try { return { value: await createNativeRuntime({ mainHome: home }, { spawn: ps.spawn }).uninstall(), ps } } catch (error) { return { error, ps } }
}

/** The tree is untouched by a refusal: it exists with its records. */
function assertKept(home, outcome, code) {
  assert.equal(outcome.error?.code, code, `expected ${code}, got ${outcome.error?.code ?? JSON.stringify(outcome.value)}`)
  assert.ok(fs.existsSync(path.join(runtimeRoot(home), LAYOUT.active)), 'the refusal removed the tree')
}

/** Runs the real command for `home` (no DSH_HOME, so only --home names it). */
function command(home) {
  const file = path.join(V3.instance.dir, MODULES.command)
  return spawnSync(process.execPath, [file, MODULES.homeFlag, home], { encoding: 'utf8', env: { ...process.env, ...FIXTURE.env } })
}

const EXPECT = {
  running: (home, outcome) => assertKept(home, outcome, CODE.running),
  unknown: (home, outcome) => assertKept(home, outcome, CODE.unknown),
  removed: (home, outcome) => {
    assert.equal(outcome.error, undefined, 'refused: ' + outcome.error?.code)
    assert.equal(outcome.value?.removed, true)
    assert.equal(fs.existsSync(runtimeRoot(home)), false, 'the tree is still there')
  },
}

export function registerUninstallCases(sdk) {
  // ================================================================ decision table: what ps answered
  for (const r of PS_ROWS) {
    caseTest(sdk, 'UNINST-DT', r.row, `a recorded child whose ps probe ends "${r.row}" → ${r.outcome === 'removed' ? 'the tree is removed' : 'refused ' + CODE[r.outcome] + ', nothing removed'}`, async (t) => {
      const home = mainHome(t)
      await recordedTree(sdk, home)
      const outcome = await uninstall(sdk, home, r.probe)
      EXPECT[r.outcome](home, outcome)
      // The probe really was asked about the recorded pid (so the row tests the ps answer, not an earlier refusal).
      assert.ok(outcome.ps.calls.some((c) => c.args.includes(String(FIXTURE.pid))), 'ps was not asked about the recorded pid: ' + JSON.stringify(outcome.ps.calls))
    })
  }

  // ================================================================ the records alone decide
  caseTest(sdk, 'UNINST-DT', 'no pid record', 'an active record with no pid record for it → refused CHILD_STATE_UNKNOWN, nothing removed', async (t) => {
    const home = mainHome(t)
    await recordedTree(sdk, home, { pid: false })
    EXPECT.unknown(home, await uninstall(sdk, home, { exit: 1, output: '' }))
  })
  // No recorded child at all: nothing recorded can still run, so the tree goes (and ps is never needed).
  caseTest(sdk, 'UNINST-DT', 'no recorded child', 'a tree with no active record → removed', async (t) => {
    const home = mainHome(t)
    await recordedTree(sdk, home, { child: false })
    EXPECT.removed(home, await uninstall(sdk, home, { throws: true }))
  })
  // ================================================================ the command (uninstall.js), real files, no ps needed
  caseTest(sdk, 'UNINST-CLI', 'no tree', 'no runtime tree → "Nothing to remove", exit 0', (t) => {
    const home = mainHome(t)
    const run = command(home)
    assert.equal(run.status, EXIT.done, run.stderr)
    assert.ok(run.stdout.includes(TEXT.absent), run.stdout)
  })
  caseTest(sdk, 'UNINST-CLI', 'state unknown', 'no pid record → exit 1 with CHILD_STATE_UNKNOWN; stderr says the state could not be checked, not only "wait and run it again"; nothing removed', async (t) => {
    const home = mainHome(t)
    await recordedTree(sdk, home, { pid: false })
    const run = command(home)
    assert.equal(run.status, EXIT.refused, run.stdout + run.stderr)
    assert.ok(run.stderr.includes(CODE.unknown), run.stderr)
    assert.equal(run.stderr.includes(CODE.running), false, 'reported as running: ' + run.stderr)
    // B8 forbids "Quit DSH, wait a few seconds and run it again" only as the sole remedy: the
    // message must say the state could not be checked, so other advice beside it is allowed.
    assert.match(run.stderr, TEXT.cannotCheck)
    assert.ok(fs.existsSync(path.join(runtimeRoot(home), LAYOUT.active)), 'the refusal removed the tree')
  })
}
