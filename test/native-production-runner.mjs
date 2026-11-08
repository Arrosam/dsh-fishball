import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, realpath, rm } from 'node:fs/promises'
import { dirname, delimiter, join, resolve } from 'node:path'
import { isWithin } from './native-production-helpers.mjs'

const RUN = Object.freeze({
  prefix: '/tmp/fishball-production-run-', env: '/usr/bin/env',
  names: ['preflight', 'protocol', 'adapter', 'lifecycle'], deadlineMs: 240000,
  home: 'home', dsh: 'dsh-home', agents: 'agents-home', temporary: 'tmp',
  config: 'config', cache: 'cache', data: 'data', exitFailure: 1,
})
const requested = process.argv.slice(2)
assert.ok(requested.every(name => RUN.names.includes(name)), 'only explicit native-production suites are allowed')
const suites = requested.length ? requested : RUN.names
const root = await realpath(await mkdtemp(RUN.prefix))
let child, closed = false, timedOut = false, timer
try {
  const env = {
    FISHBALL_TEST_ROOT: root,
    HOME: join(root, RUN.home), DSH_HOME: join(root, RUN.dsh), DSH_AGENTS_HOME: join(root, RUN.agents),
    TMPDIR: join(root, RUN.temporary), TMP: join(root, RUN.temporary), TEMP: join(root, RUN.temporary),
    XDG_CONFIG_HOME: join(root, RUN.config), XDG_CACHE_HOME: join(root, RUN.cache), XDG_DATA_HOME: join(root, RUN.data),
    PATH: [dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter), LANG: 'en_US.UTF-8', TERM: 'dumb', NO_COLOR: '1',
  }
  for (const name of ['HOME', 'DSH_HOME', 'DSH_AGENTS_HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
    await mkdir(env[name], { recursive: true })
  }
  // Native runtime discovery is explicit only: never use a machine-specific fallback.
  if (process.env.DSH_RUNTIME_ROOT !== undefined) env.DSH_RUNTIME_ROOT = process.env.DSH_RUNTIME_ROOT
  const tests = suites.map(name => resolve(import.meta.dirname, 'native-production-' + name + '.test.mjs'))
  const selection = process.env.FISHBALL_TEST_NAME_PATTERN
  const filters = selection === undefined ? [] : ['--test-name-pattern=' + selection]
  if (selection !== undefined) console.log('native-production runner: DIAGNOSTIC subset pattern=' + selection)
  const args = ['-i', ...Object.entries(env).map(([key, value]) => key + '=' + value), process.execPath, '--test', '--test-concurrency=1', ...filters, ...tests]
  child = spawn(RUN.env, args, { cwd: root, env: {}, stdio: 'inherit' })
  const completion = new Promise((ok, fail) => {
    child.once('error', fail)
    child.once('close', (code, signal) => { closed = true; ok({ code, signal }) })
  })
  // A suite timeout cannot justify deleting a root while descendants may remain.
  timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, RUN.deadlineMs)
  const result = await completion
  process.exitCode = result.code ?? RUN.exitFailure
  assert.equal(timedOut, false, 'suite exceeded deadline; disposable tree retained for owned-child cleanup')
  assert.equal(result.signal, null, 'suite interrupted; disposable tree retained for owned-child cleanup')
  assert.equal(result.code, 0, 'failed suite; disposable tree retained until owned-child cleanup is verified')
  assert.equal(await realpath(root), root)
  assert.ok(isWithin(await realpath('/tmp'), root))
  await rm(root, { recursive: true, force: true })
  console.log('native-production runner: disposable tree removed; test process closed')
} catch (error) {
  process.exitCode = RUN.exitFailure
  console.error(error.message)
  console.error('native-production runner: retained disposable tree at ' + root)
} finally {
  clearTimeout(timer)
  if (child && !closed) child.kill('SIGTERM')
}
