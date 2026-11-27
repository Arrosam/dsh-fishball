/**
 * Runs test files with node:test in one isolated environment on one DSH version.
 *
 * Isolation: a private folder under the OS temp directory holds HOME, DSH_HOME, TMPDIR, the XDG
 * folders, npm's cache and the throwaway DSH homes; it is removed afterwards. The DSH version is
 * resolved once and passed down (FBTEST_DSH_VERSION, FBTEST_DSH_RUNTIME), so every file of one run tests
 * the same DSH. Files run in their own processes, `concurrency` at a time; the cases inside one file
 * run in order (they often share a booted world).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DSH_ENV, VERSIONS_DIR, runtimeOf } from './dsh.mjs'
import { REPO, WORKSPACE_ROOT, packages } from './packages.mjs'

export const RUN = Object.freeze({
  prefix: 'fbtest-run-', defaultConcurrency: 3, cancelExit: 130, signals: Object.freeze(['SIGINT', 'SIGTERM']),
  dirs: Object.freeze({ home: 'home', tmp: 'tmp', cache: 'cache', config: 'config', data: 'data', state: 'state', homes: path.join('.runtime', 'test-homes') }),
  /** The suffix the throwaway DSH homes' root must keep (workers refuse any other home). */
  homesEnv: 'FBTEST_TEST_HOMES', noUserConfig: '/dev/null', modules: 'node_modules',
  isolation: '--experimental-test-isolation=process', concurrencyFlag: '--test-concurrency=', reporter: '--test-reporter=spec',
})

/**
 * Workspace packages resolve one another by name, as an npm workspace install would link them: a
 * symlink `node_modules/<name>` at the repository root for each package that has none yet. Nothing
 * is installed or fetched; an existing entry (an npm install's own link) is left as it is.
 */
export function linkWorkspaces() {
  const root = path.join(WORKSPACE_ROOT, RUN.modules)
  for (const pkg of packages().values()) {
    const target = path.join(root, pkg.name)
    if (fs.existsSync(target)) continue
    fs.mkdirSync(path.dirname(target), { recursive: true })
    try { fs.symlinkSync(pkg.abs, target) } catch (error) { if (error.code !== 'EEXIST') throw error }
  }
}

/** The environment of one run, inside `base`. */
export function isolatedEnv(base, version) {
  const make = (...parts) => { const dir = path.join(base, ...parts); fs.mkdirSync(dir, { recursive: true }); return dir }
  const home = make(RUN.dirs.home)
  const tmp = make(RUN.dirs.tmp)
  return {
    ...process.env, HOME: home, DSH_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    XDG_CACHE_HOME: make(RUN.dirs.cache), XDG_CONFIG_HOME: make(RUN.dirs.config), XDG_DATA_HOME: make(RUN.dirs.data), XDG_STATE_HOME: make(RUN.dirs.state),
    npm_config_cache: make(RUN.dirs.cache, 'npm'), npm_config_userconfig: RUN.noUserConfig,
    [RUN.homesEnv]: make(RUN.dirs.homes),
    [DSH_ENV.version]: version, [DSH_ENV.versions]: VERSIONS_DIR, [DSH_ENV.runtime]: runtimeOf(version),
  }
}

/**
 * Run `files` (absolute) on DSH `version`; resolves to the exit status.
 * @param options.cwd - the folder node --test starts in (the repository, or an --against checkout).
 * @param options.concurrency - test files at once (1 = one after another).
 * @param options.args - extra node --test arguments (reporters, name patterns).
 * @param options.stdio - 'inherit' (default) or a [stdin, stdout, stderr] array (the release run's log files).
 */
export async function runFiles(files, version, { cwd = REPO, concurrency = RUN.defaultConcurrency, args = [], stdio = 'inherit' } = {}) {
  const anchor = fs.realpathSync(os.tmpdir())
  const base = fs.mkdtempSync(path.join(anchor, RUN.prefix))
  const children = new Set()
  const cancel = (signal) => { for (const child of children) { try { process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') console.error(error) } } }
  for (const signal of RUN.signals) process.on(signal, cancel)
  try {
    const nodeArgs = ['--test', RUN.isolation, RUN.concurrencyFlag + concurrency, ...(args.some((a) => a.startsWith('--test-reporter')) ? [] : [RUN.reporter]), ...args, ...files]
    const child = spawn(process.execPath, nodeArgs, { cwd, stdio, env: isolatedEnv(base, version), detached: true })
    children.add(child)
    return await new Promise((resolve) => {
      child.on('error', (error) => { console.error(error); resolve(1) })
      child.on('close', (status, signal) => { children.delete(child); resolve(signal ? RUN.cancelExit : status ?? 1) })
    })
  } finally {
    for (const signal of RUN.signals) process.off(signal, cancel)
    // Only the private mkdtemp folder this call made is removed.
    if (path.dirname(base) === anchor && path.basename(base).startsWith(RUN.prefix)) fs.rmSync(base, { recursive: true, force: true })
  }
}
