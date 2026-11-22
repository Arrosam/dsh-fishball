/**
 * The one test runner every package and integration package uses.
 *
 * `runPackage(dir, args)` runs the suites of one package: every `tests/**\/*.test.mjs` under `dir`,
 * except the suites of a nested package (a sub-folder with its own package.json, such as
 * packages/dsh-connector/ui), which belong to that package. It runs them in one node --test process
 * with a throwaway HOME / TMPDIR / XDG tree, so no case reads or writes the user's real DSH or npm
 * state, and removes that tree afterwards. No per-package time limit is set: node:test's per-case
 * timeouts in the suites are the only limits.
 *
 * Which DSH versions the cases cover is the cases' choice through sdk.mjs: the current DSH unless
 * DSH_TEST_MATRIX is set (the release script sets it).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ENV, RUN, SUITES } from '../constants.mjs'
import { workspaceDirs } from './links.mjs'

/**
 * Sorted absolute paths of one package's suite files: `*.test.mjs` inside a `tests/` folder. A
 * sub-folder that is itself a workspace package is a separate package: its suites are its own. A
 * sub-folder with a package.json that is not a workspace is a component shipped inside this package
 * (packages/dsh-connector/ui is inside the dsh-agent-connector tarball): its suites are this
 * package's.
 */
export function suiteFiles(dir, workspaces = workspaceDirs()) {
  const separate = new Set(workspaces.map((w) => path.resolve(w)))
  const found = []
  const walk = (folder, inTests) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const full = path.join(folder, entry.name)
      if (entry.isDirectory()) {
        if (separate.has(path.resolve(full))) continue
        walk(full, inTests || entry.name === SUITES.dir)
      } else if (inTests && entry.name.endsWith(SUITES.suffix)) found.push(full)
    }
  }
  walk(dir, false)
  return found.sort()
}

const NAMES_REPORTER = path.join(import.meta.dirname, 'names-reporter.mjs')

/** A throwaway environment: HOME, TMPDIR and the XDG folders inside one fresh directory. */
function isolatedEnv(base) {
  const make = (...parts) => { const d = path.join(base, ...parts); fs.mkdirSync(d, { recursive: true }); return d }
  const home = make('home')
  const tmp = make('tmp')
  return {
    ...process.env,
    HOME: home, DSH_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    XDG_CACHE_HOME: make('cache'), XDG_CONFIG_HOME: make('config'), XDG_DATA_HOME: make('data'), XDG_STATE_HOME: make('state'),
    npm_config_cache: make('cache', 'npm'), npm_config_userconfig: '/dev/null',
    [ENV.homes]: make(...RUN.homesTail),
  }
}

/**
 * Run one package's suites. `args` are passed to node --test (e.g. --test-name-pattern=...).
 * Resolves to the exit status (0 = every case passed or was skipped/todo).
 */
export async function runPackage(dir, args = [], { stdio = 'inherit', label = path.basename(dir) } = {}) {
  const files = suiteFiles(dir)
  if (files.length === 0) {
    if (stdio === 'inherit') console.log(`${label}: no suites`)
    return 0
  }
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), RUN.homesPrefix))
  const children = new Set()
  const cancel = (signal) => { for (const child of children) try { process.kill(-child.pid, signal) } catch {} }
  for (const signal of RUN.signals) process.on(signal, cancel)
  try {
    const hasReporter = args.some((a) => a.startsWith('--test-reporter'))
    // DSH_TEST_NAMES=<file>: also write one JSON line per finished case (names-reporter.mjs), the
    // record the behaviour inventory is checked against.
    const names = process.env[ENV.names]
    const reporters = hasReporter ? [] : names
      ? ['--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=' + NAMES_REPORTER, '--test-reporter-destination=' + path.resolve(names)]
      : ['--test-reporter=spec']
    const nodeArgs = ['--test', '--test-concurrency=' + RUN.fileConcurrency, ...reporters, ...args, ...files]
    const child = spawn(process.execPath, nodeArgs, { cwd: dir, stdio, env: isolatedEnv(base), detached: process.platform !== 'win32' })
    children.add(child)
    return await new Promise((resolve) => {
      child.on('error', (error) => { console.error(error); resolve(1) })
      child.on('close', (status, signal) => { children.delete(child); resolve(signal ? RUN.cancelExit : status ?? 1) })
    })
  } finally {
    for (const signal of RUN.signals) process.off(signal, cancel)
    if (path.basename(base).startsWith(RUN.homesPrefix)) fs.rmSync(base, { recursive: true, force: true })
  }
}