/**
 * The test runner. Day to day one package is tested on its own (runPackage); before a release every
 * package and every integration package is tested at once, one worker process each (runRelease).
 *
 * Each run gets a throwaway environment: HOME, TMPDIR and the XDG folders point into a fresh mkdtemp
 * folder, npm reads no user config, and DSH_HOME is never inherited, so a test can never touch the
 * user's real DSH home or the checkout Fishball's placement reads from. No time limit is set
 * anywhere: node --test has none by default and the runner adds none.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO, RUN, SDK } from './constants.mjs'

/** Every `*.test.mjs` under `<dir>/tests`, sorted, absolute. */
export function testFiles(dir) {
  const root = path.join(dir, RUN.testsDir)
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(RUN.suffix)).sort().map((f) => path.join(root, f))
}

/**
 * Link this helpers package (and every workspace package) into the root node_modules under its
 * manifest name, as a workspace install would, so a test imports `@dsh-instance/test-helpers/<part>`
 * by name. Nothing is installed or downloaded; an existing link to the same folder is kept.
 */
/** The workspace folders the root manifest names (a trailing `/*` names every folder under it). */
export function workspaceDirs() {
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'))
  return (manifest.workspaces ?? []).flatMap((entry) => {
    if (!entry.endsWith('/*')) return [path.join(REPO, entry)]
    const parent = path.join(REPO, entry.slice(0, -2))
    return fs.existsSync(parent) ? fs.readdirSync(parent).sort().map((name) => path.join(parent, name)) : []
  }).filter((dir) => fs.existsSync(path.join(dir, 'package.json')))
}

export function linkWorkspaces() {
  for (const dir of workspaceDirs()) {
    const own = path.join(dir, 'package.json')
    if (!fs.existsSync(own)) continue
    const name = JSON.parse(fs.readFileSync(own, 'utf8')).name
    const link = path.join(REPO, 'node_modules', name)
    fs.mkdirSync(path.dirname(link), { recursive: true })
    try { fs.symlinkSync(dir, link) } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (fs.realpathSync(link) !== fs.realpathSync(dir)) throw new Error('unexpected workspace link: ' + link)
    }
  }
}

function isolatedEnvironment(base) {
  const make = (...parts) => { const dir = path.join(base, ...parts); fs.mkdirSync(dir, { recursive: true }); return dir }
  const home = make(RUN.dirs.home)
  const tmp = make(RUN.dirs.tmp)
  const env = { ...process.env }
  delete env.DSH_HOME
  return {
    ...env, HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    XDG_CACHE_HOME: make(RUN.dirs.cache), XDG_CONFIG_HOME: make(RUN.dirs.config), XDG_DATA_HOME: make(RUN.dirs.data), XDG_STATE_HOME: make(RUN.dirs.state),
    npm_config_cache: make(RUN.dirs.cache, 'npm'), npm_config_userconfig: RUN.noUserConfig,
    // Resolved before HOME is replaced: the installed SDKs live under the real home.
    FBTEST_DSH_VERSIONS: SDK.versionsDir,
    // Below the run's own temp folder: a hosted child refuses a DSH home with a Git ancestor.
    FBTEST_TEST_HOMES: make(RUN.dirs.homes),
  }
}

/**
 * Run one package's tests in a throwaway environment.
 * @param dir - the package folder.
 * @param args - extra `node --test` arguments; a plain path (relative to the package) selects tests.
 * @param options.stdio - 'inherit' (default) or a writable file descriptor for stdout and stderr.
 * @returns {Promise<number>} the exit status (0 when there is no test).
 */
export async function runPackage(dir, args = [], { stdio = 'inherit', children = new Set() } = {}) {
  // A plain argument naming a file or folder under the package selects those tests only.
  const selected = args.filter((arg) => !arg.startsWith('-') && fs.existsSync(path.resolve(dir, arg))).map((arg) => path.resolve(dir, arg))
  const flags = args.filter((arg) => !selected.includes(path.resolve(dir, arg)))
  const files = testFiles(dir).filter((file) => selected.length === 0 || selected.some((s) => file === s || file.startsWith(s + path.sep)))
  if (files.length === 0) return 0
  linkWorkspaces()
  const parent = fs.realpathSync(os.tmpdir())
  const base = fs.mkdtempSync(path.join(parent, RUN.prefix))
  try {
    const out = stdio === 'inherit' ? 'inherit' : ['ignore', stdio, stdio]
    const child = spawn(process.execPath, ['--test', '--test-concurrency=' + RUN.fileConcurrency, '--test-reporter=spec', ...flags, ...files], {
      cwd: dir, stdio: out, env: isolatedEnvironment(base), detached: process.platform !== 'win32',
    })
    children.add(child)
    return await new Promise((resolve) => {
      child.on('error', (error) => { console.error(error); resolve(1) })
      child.on('close', (status) => { children.delete(child); resolve(status ?? 1) })
    })
  } finally {
    // Guard the one recursive delete: the mkdtemp folder this run made.
    if (path.dirname(base) === parent && path.basename(base).startsWith(RUN.prefix)) fs.rmSync(base, { recursive: true, force: true })
  }
}

/** Stop every running worker's process group on Ctrl-C; returns the cleanup that removes the handlers. */
export function cancelOnSignal(children, onCancel) {
  const cancel = (signal) => {
    onCancel()
    for (const child of children) {
      if (child.pid === undefined) continue
      try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') console.error(error) }
    }
  }
  for (const signal of RUN.signals) process.on(signal, cancel)
  return () => { for (const signal of RUN.signals) process.off(signal, cancel) }
}
