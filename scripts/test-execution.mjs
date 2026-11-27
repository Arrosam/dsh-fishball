import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ROOT } from './test-workspaces.mjs'
import { pathToFileURL } from 'node:url'

export const RUN = Object.freeze({
  prefix: 'fbtest-run-', cancelExit: 130, signals: Object.freeze(['SIGINT', 'SIGTERM']),
  dirs: Object.freeze({ home: 'home', tmp: 'tmp', cache: 'cache', config: 'config', data: 'data', state: 'state', homes: path.join('.runtime', 'test-homes') }),
  /** The suffix the throwaway DSH homes' root must keep (workers refuse any other home). */
  homesEnv: 'FBTEST_TEST_HOMES', noUserConfig: '/dev/null',
  isolation: '--experimental-test-isolation=process', concurrencyFlag: '--test-concurrency=', reporter: '--test-reporter=spec',
})

/** The environment of one run, inside `base`. */
export function isolatedEnv(base, sdkEnv) {
  const make = (...parts) => { const dir = path.join(base, ...parts); fs.mkdirSync(dir, { recursive: true }); return dir }
  const home = make(RUN.dirs.home)
  const tmp = make(RUN.dirs.tmp)
  return {
    ...process.env, HOME: home, DSH_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    XDG_CACHE_HOME: make(RUN.dirs.cache), XDG_CONFIG_HOME: make(RUN.dirs.config), XDG_DATA_HOME: make(RUN.dirs.data), XDG_STATE_HOME: make(RUN.dirs.state),
    npm_config_cache: make(RUN.dirs.cache, 'npm'), npm_config_userconfig: RUN.noUserConfig,
    [RUN.homesEnv]: make(RUN.dirs.homes),
    ...sdkEnv, DSH_TEST_HOMES: path.join(base, RUN.dirs.homes),
  }
}

/**
 * Run the selected absolute files in an isolated SDK environment; resolves to the exit status.
 * @param options.cwd - the folder node --test starts in (the repository, or an --against checkout).
 * @param options.concurrency - test files at once (1 = one after another).
 * @param options.args - extra node --test arguments (reporters, name patterns).
 * @param options.stdio - 'inherit' (default) or a [stdin, stdout, stderr] array (the release run's log files).
 */
export async function runFiles(files, sdkEnv, { cwd = ROOT, concurrency, args = [], names, omitDshHome, stdio = 'inherit' } = {}) {
  const anchor = fs.realpathSync(os.tmpdir())
  const base = fs.mkdtempSync(path.join(anchor, RUN.prefix))
  const children = new Set()
  let cancelled = false
  const cancel = (signal) => { cancelled = true; for (const child of children) { try { if (child.pid !== undefined) process.kill(-child.pid, signal) } catch (error) { if (error.code !== 'ESRCH') console.error(error) } } }
  for (const signal of RUN.signals) process.on(signal, cancel)
  try {
    const customReporter = args.some((a) => a.startsWith('--test-reporter'))
    const reporters = customReporter ? [] : [RUN.reporter]
    if (names && !customReporter) {
      fs.writeFileSync(names, '')
      reporters.push('--test-reporter-destination=stdout', '--test-reporter=' + pathToFileURL(path.join(ROOT, 'dsh-connector/packages/dsh-connector-test-helpers/src/runner/names-reporter.mjs')).href, '--test-reporter-destination=' + names)
    }
    const nodeArgs = ['--test', RUN.isolation, ...(concurrency ? [RUN.concurrencyFlag + concurrency] : []), ...reporters, ...args, ...files]
    const env = isolatedEnv(base, sdkEnv)
    if (omitDshHome) delete env.DSH_HOME
    const child = spawn(process.execPath, nodeArgs, { cwd, stdio, env, detached: true })
    children.add(child)
    return await new Promise((resolve) => {
      child.on('error', (error) => { console.error(error); resolve(1) })
      child.on('close', (status, signal) => { children.delete(child); resolve(cancelled || signal ? RUN.cancelExit : status ?? 1) })
    })
  } finally {
    for (const signal of RUN.signals) process.off(signal, cancel)
    // Only the private mkdtemp folder this call made is removed.
    if (path.dirname(base) === anchor && path.basename(base).startsWith(RUN.prefix)) fs.rmSync(base, { recursive: true, force: true })
  }
}
