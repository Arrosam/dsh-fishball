import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createConnection } from 'node:net'
import { cp, mkdir, readFile, realpath } from 'node:fs/promises'
import { dirname, join, delimiter } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CASE, assertDisposableEnvironment, sandbox, sentinel, bounded, isWithin, deferred } from './native-production-helpers.mjs'

await assertDisposableEnvironment()
const NATIVE = Object.freeze({
  version: '0.2.1-rc.3', startupMs: 60000, stopMs: 15000, timeoutMs: 180000,
  guardSource: join(import.meta.dirname, 'fixtures', 'native-attached-egress.mjs'),
  observerSource: join(import.meta.dirname, 'native-production-observer.mjs'),
  guardName: 'egress.mjs', observerName: 'observer.mjs', marker: 'preserve.txt',
  nodeProbe: 'process.stdout.write(JSON.stringify({node:process.versions.node,electron:!!process.versions.electron}))',
  ps: '/bin/ps',
})
const nativeOptions = { timeout: NATIVE.timeoutMs, skip: process.env.DSH_RUNTIME_ROOT === undefined && 'set DSH_RUNTIME_ROOT explicitly for production native lifecycle integration' }

async function nativeFixture(t) {
  const layout = await sandbox(t, false)
  const selected = process.env.DSH_RUNTIME_ROOT
  assert.notEqual(selected, '', 'an explicitly empty runtime root is invalid, never auto-discovered')
  const modules = selected.endsWith('node_modules') ? selected : join(selected, 'node_modules')
  const installAnchor = await realpath(join(modules, '@deepseek-ai', 'dsh', 'package.json'))
  const manifest = JSON.parse(await readFile(installAnchor, 'utf8'))
  assert.equal(manifest.name, '@deepseek-ai/dsh')
  assert.equal(manifest.version, NATIVE.version)
  assert.equal(typeof manifest.bin.dsh, 'string')
  const bin = await realpath(join(dirname(installAnchor), manifest.bin.dsh))
  const binBefore = await readFile(bin)
  const guardDir = join(layout.root, 'test-only-preloads')
  await mkdir(guardDir)
  const guard = join(guardDir, NATIVE.guardName), observer = join(guardDir, NATIVE.observerName)
  await cp(NATIVE.guardSource, guard)
  await cp(NATIVE.observerSource, observer)
  const children = [], probes = [], owners = []
  let spawned = () => {}
  const { createNativeRuntime } = await import('../src/native-runtime/index.js')
  const { createControlHost } = await import('../src/native-control/index.js')
  const track = (child, collection, kind) => {
    const entry = { child, closed: false, exited: null }
    entry.exited = new Promise(resolve => child.once('close', (code, signal) => { entry.closed = true; resolve({ code, signal }) }))
    collection.push(entry)
    console.log('native-production owned ' + kind + ' pid=' + child.pid)
    entry.exited.then(() => console.log('native-production owned ' + kind + ' closed pid=' + child.pid))
    return entry
  }
  const spawnGuarded = (command, args, options) => {
    if (command === NATIVE.ps) {
      assert.equal(args.length, 4)
      assert.equal(args[0], '-p')
      assert.match(args[1], /^[1-9][0-9]*$/)
      assert.deepEqual(args.slice(2), ['-o', 'pid='])
      assert.deepEqual(options.env, {})
      assert.ok(isWithin(layout.runtimeRoot, options.cwd))
      assert.deepEqual(options.stdio, ['ignore', 'pipe', 'ignore'])
      const entry = track(spawn(command, args, options), probes, 'pid-probe')
      return entry.child
    }
    assert.equal(command, process.execPath, 'explicit native node executable, no shell or installer')
    if (args[0] === '-e') {
      assert.deepEqual(args, ['-e', NATIVE.nodeProbe])
      assert.ok(isWithin(layout.runtimeRoot, options.cwd))
      for (const key of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR', 'TMP', 'TEMP']) {
        assert.ok(isWithin(layout.runtimeRoot, options.env[key]), 'version probe ' + key + ' must be isolated')
      }
      const entry = track(spawn(command, args, options), probes, 'node-probe')
      return entry.child
    }
    assert.ok(args.includes(bin), 'launches selected unmodified installed CLI')
    assert.ok(isWithin(layout.runtimeRoot, options.cwd), 'child cwd is private before CLI import')
    for (const key of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR', 'TMP', 'TEMP']) {
      assert.ok(isWithin(layout.runtimeRoot, options.env[key]), key + ' replaced with private root')
    }
    for (const key of ['NODE_OPTIONS', 'NODE_PATH', 'HTTP_PROXY', 'HTTPS_PROXY', 'DSH_API_TOKEN', 'OPENAI_API_KEY']) {
      assert.equal(options.env[key], undefined, 'no inherited ambient ' + key)
    }
    const child = spawn(command, ['--import', pathToFileURL(guard).href, '--import', pathToFileURL(observer).href, ...args], options)
    const entry = track(child, children, 'child')
    spawned(entry)
    return child
  }
  const create = (overrides = {}, dependencies = {}, withBridge = true) => {
    const owner = createNativeRuntime({
      mainHome: layout.mainHome, installAnchor, nodeExecutable: process.execPath,
      executableSearchPath: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter), mainWorkspaces: [],
      ...overrides,
    }, { spawn: spawnGuarded, ...dependencies })
    const hosts = []
    if (withBridge) owner.onControlTransport((carrier, identity) => {
      const host = createControlHost({ hostId: identity.hostId, authorizeTarget: () => false,
        deliverMessage: () => { throw new Error('native lifecycle test must not deliver user messages') },
        getStatus: () => ({ state: 'idle', lastSequence: 0 }), watchSession: () => () => {},
      })
      hosts.push(host)
      host.attach(carrier, { connectionId: identity.connectionId, principalId: 'test-private-fishball' })
    })
    owners.push(owner)
    layout.cleanup.push(async () => { for (const host of hosts) host.close() })
    return owner
  }
  layout.cleanup.push(async () => {
    for (const owner of owners) {
      try { await bounded(owner.stop(), 'production owner stop did not complete', NATIVE.stopMs) } catch { /* tracked handle cleanup below */ }
    }
    for (const entry of [...children, ...probes]) {
      if (!entry.closed) entry.child.kill('SIGTERM')
      try { await bounded(entry.exited, 'production child did not exit', NATIVE.stopMs) }
      catch (error) {
        if (!entry.closed) entry.child.kill('SIGKILL')
        await bounded(entry.exited, 'tracked production child could not be reaped', NATIVE.stopMs)
        throw error
      }
    }
    assert.deepEqual(await readFile(bin), binBefore, 'native tests cannot modify installed CLI')
  })
  const report = async entry => {
    const value = JSON.parse(await readFile(join(guardDir, 'guard-report-' + entry.child.pid + '.json'), 'utf8'))
    assert.equal(value.phase, 'exit', 'only a final exit observation proves lifecycle-wide egress count')
    return value
  }
  const start = owner => bounded(owner.start(), 'production owner start timed out', NATIVE.startupMs)
  const stop = owner => bounded(owner.stop(), 'production owner stop timed out', NATIVE.stopMs)
  return { layout, create, children, start, stop, report, installAnchor, onSpawn: callback => { spawned = callback } }
}

async function portAccepts(url) {
  return bounded(new Promise(resolve => {
    const socket = createConnection({ host: url.hostname, port: Number(url.port) })
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => { socket.destroy(); resolve(false) })
  }), 'owned loopback endpoint did not settle', NATIVE.stopMs)
}

function ready(status) {
  assert.equal(status.state, 'ready')
  assert.equal(typeof status.hostId, 'string')
  assert.equal(typeof status.instanceId, 'string')
  assert.equal(status.version, NATIVE.version)
  assert.ok(Number.isSafeInteger(status.pid) && status.pid > 0)
  assert.ok(Array.isArray(status.warnings))
  assert.doesNotMatch(JSON.stringify(status), /token=|https?:\/\//, 'health status cannot leak a launch URL or token')
}

test('LIFE-01/02 new production owner launches one native child and stop closes it', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create()
  const first = await f.start(owner)
  ready(first)
  assert.equal(f.children.length, 1)
  assert.equal(first.pid, f.children[0].child.pid)
  const repeat = await f.start(owner)
  assert.equal(repeat.instanceId, first.instanceId)
  assert.equal(f.children.length, 1, 'repeat start cannot create a duplicate writer')
  ready(await owner.health())
  const url = new URL(await owner.openUrl())
  assert.equal(url.hostname, '127.0.0.1')
  assert.equal(await portAccepts(url), true, 'new child owns a live loopback web endpoint')
  const preserved = await sentinel(join(f.layout.workspace, NATIVE.marker))
  await f.stop(owner)
  await bounded(f.children[0].exited, 'stop returned before native child exit', NATIVE.stopMs)
  assert.notEqual((await owner.health()).state, 'ready')
  assert.equal(await portAccepts(url), false, 'stop releases the actual native Web port')
  await f.stop(owner)
  const report = await f.report(f.children[0])
  assert.deepEqual(report.attempts, [], 'no external JS TCP/TLS/fetch attempts during full lifecycle')
  assert.deepEqual(report.inherited, [])
  const next = await f.start(owner)
  ready(next)
  assert.equal(next.hostId, first.hostId)
  assert.notEqual(next.instanceId, first.instanceId)
  assert.notEqual(next.pid, first.pid)
  assert.equal(await readFile(preserved, 'utf8'), CASE.sentinel)
  await f.stop(owner)
  assert.deepEqual((await f.report(f.children[1])).attempts, [])
})

test('LIFE-04 genuine child crash loses readiness and explicit restart preserves private data', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create()
  const first = await f.start(owner)
  ready(first)
  const preserved = await sentinel(join(f.layout.workspace, NATIVE.marker))
  const child = f.children[0]
  child.child.kill('SIGKILL')
  await bounded(child.exited, 'test-owned crashed child did not close', NATIVE.stopMs)
  assert.notEqual((await owner.health()).state, 'ready')
  const restarted = await bounded(owner.restart(), 'production recovery timed out', NATIVE.startupMs)
  ready(restarted)
  assert.equal(restarted.hostId, first.hostId)
  assert.notEqual(restarted.instanceId, first.instanceId)
  assert.equal(await readFile(preserved, 'utf8'), CASE.sentinel)
  await f.stop(owner)
  assert.deepEqual((await f.report(f.children.at(-1))).attempts, [])
})

test('LIFE-05 detached main owner is replaced without duplicate child or changing identity', nativeOptions, async t => {
  const f = await nativeFixture(t), firstOwner = f.create()
  const first = await f.start(firstOwner)
  ready(first)
  await firstOwner.detach()
  assert.equal(f.children[0].closed, false, 'owner disconnect does not terminate native private host')
  const nextOwner = f.create()
  const reattached = await f.start(nextOwner)
  ready(reattached)
  assert.equal(reattached.hostId, first.hostId)
  assert.equal(reattached.instanceId, first.instanceId)
  assert.equal(reattached.pid, first.pid)
  assert.equal(f.children.length, 1, 'authenticated reattachment must not create second writer')
  await f.stop(nextOwner)
  await bounded(f.children[0].exited, 'reattached owner did not stop original child', NATIVE.stopMs)
  assert.deepEqual((await f.report(f.children[0])).attempts, [])
})

test('LIFE-02 simultaneous starts share one child without host-control bridge attached', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create({}, {}, false)
  const results = await Promise.allSettled([f.start(owner), f.start(owner)])
  assert.ok(results.some(result => result.status === 'fulfilled'))
  for (const result of results) if (result.status === 'fulfilled') ready(result.value)
  assert.equal(f.children.length, 1, 'only one native writer may be spawned')
  await f.stop(owner)
  assert.deepEqual((await f.report(f.children[0])).attempts, [])
})

test('LIFE-03 stop during actual native startup settles without a leaked child', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create(), spawned = deferred()
  f.onSpawn(entry => spawned.resolve(entry))
  const starting = f.start(owner)
  const outcome = starting.then(value => ({ value }), error => ({ error }))
  const child = await bounded(spawned.promise, 'production owner never spawned a child', NATIVE.startupMs)
  await f.stop(owner)
  await bounded(outcome, 'interrupted production start never settled', NATIVE.startupMs)
  await bounded(child.exited, 'startup interruption left a child running', NATIVE.stopMs)
  assert.notEqual((await owner.health()).state, 'ready')
  assert.equal(f.children.length, 1)
  // A stop may precede CLI evaluation entirely; do not claim an exit guard report.
})

test('LIFE-06 alive but unresponsive child is refused without duplicate writer or PID killing', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create()
  const first = await f.start(owner)
  ready(first)
  await owner.detach()
  const entry = f.children[0]
  assert.equal(entry.child.kill('SIGSTOP'), true)
  try {
    const replacement = f.create()
    await assert.rejects(() => f.start(replacement), error => {
      assert.equal(error.code, 'CHILD_UNREACHABLE')
      return true
    })
    assert.equal(f.children.length, 1, 'unreachable existing writer must not authorize replacement')
    assert.equal(entry.closed, false, 'cannot signal another owner from PID metadata alone')
  } finally {
    if (!entry.closed) entry.child.kill('SIGCONT')
  }
  const recoveredOwner = f.create()
  const recovered = await f.start(recoveredOwner)
  ready(recovered)
  assert.equal(recovered.pid, first.pid)
  assert.equal(recovered.instanceId, first.instanceId)
  await f.stop(recoveredOwner)
  await bounded(entry.exited, 'responsive owned child did not stop', NATIVE.stopMs)
  assert.deepEqual((await f.report(entry)).attempts, [])
})

test('DATA-01 failed new program anchor preserves attached and legacy state', nativeOptions, async t => {
  const f = await nativeFixture(t), owner = f.create()
  const first = await f.start(owner)
  ready(first)
  const legacy = join(f.layout.mainHome, 'fishball', 'assistant')
  await mkdir(legacy, { recursive: true })
  const paths = await Promise.all([f.layout.workspace, f.layout.profileDir, legacy].map(path => sentinel(join(path, NATIVE.marker))))
  await f.stop(owner)
  const invalid = f.create({ installAnchor: join(f.layout.root, 'missing-upgraded-install', 'package.json') })
  await assert.rejects(() => f.start(invalid))
  assert.notEqual((await invalid.health()).state, 'ready')
  assert.equal(f.children.length, 1, 'missing upgrade must not invoke any fallback CLI')
  for (const path of paths) assert.equal(await readFile(path, 'utf8'), CASE.sentinel)
  const recovered = f.create()
  const status = await f.start(recovered)
  ready(status)
  assert.equal(status.hostId, first.hostId)
  await f.stop(recovered)
})
