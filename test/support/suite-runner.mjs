/** Shared Node test runner: one isolated environment per SDK job, never an existing test home. */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DSH_VERSIONS, NODE, REPO } from './constants.mjs'
import { linkContractForSourceRun } from './contract-link.mjs'

const ROOT_SUITES = Object.freeze({ dir: 'test', suffix: '.test.mjs', ownRunnerPrefix: 'native-production-' })
export const REPORT_DESTINATION = '--test-reporter-destination'
const REPORT = Object.freeze({ inline: `${REPORT_DESTINATION}=`, shared: Object.freeze(['stdout', 'stderr', '/dev/null']), suffixSeparator: '.', endOfOptions: '--' })
const RUN = Object.freeze({
  serial: '--serial', parallel: '--parallel', fileConcurrency: 3, concurrency: '--test-concurrency=',
  isolationFlags: Object.freeze(['--test-isolation', '--experimental-test-isolation']), processIsolation: '--experimental-test-isolation=process',
  prefix: 'fbtest-run-', signals: ['SIGINT', 'SIGTERM'], cancelExit: 130, runtimeDir: '.runtime', homes: 'test-homes', home: 'home', tmp: 'tmp', cache: 'cache',
  config: 'config', data: 'data', state: 'state', modules: 'node_modules', noUserConfig: '/dev/null',
})

/** Repo-relative, sorted root suite files: native-production-* require their own disposable runner. */
export function rootSuiteFiles() {
  return fs.readdirSync(path.join(REPO, ROOT_SUITES.dir))
    .filter((f) => f.endsWith(ROOT_SUITES.suffix) && !f.startsWith(ROOT_SUITES.ownRunnerPrefix))
    .sort().map((f) => path.posix.join(ROOT_SUITES.dir, f))
}

function testEnvironment(sdk, base) {
  const make = (...parts) => {
    const dir = path.join(base, ...parts)
    fs.mkdirSync(dir, { recursive: true })
    return dir
  }
  const home = make(RUN.home)
  const tmp = make(RUN.tmp)
  const runtime = process.env.FBTEST_DSH_RUNTIME
  const versions = path.resolve(process.env.FBTEST_DSH_VERSIONS ?? (runtime ? path.dirname(path.dirname(path.resolve(runtime))) : DSH_VERSIONS))
  const env = {
    ...process.env, HOME: home, DSH_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    XDG_CACHE_HOME: make(RUN.cache), XDG_CONFIG_HOME: make(RUN.config), XDG_DATA_HOME: make(RUN.data),
    XDG_STATE_HOME: make(RUN.state), npm_config_cache: make(RUN.cache, 'npm'), npm_config_userconfig: RUN.noUserConfig,
    FBTEST_DSH_VERSIONS: versions, FBTEST_TEST_HOMES: make(RUN.runtimeDir, RUN.homes),
  }
  if (sdk !== undefined) env.FBTEST_DSH_RUNTIME = path.join(versions, sdk, RUN.modules)
  return { env }
}

async function runJob({ sdk, files }, args, concurrency, children) {
  // A shared anchor is not a run root: only the private mkdtemp directory can be cleaned up.
  const anchor = path.resolve(process.env.FBTEST_TEST_HOMES ?? os.tmpdir())
  fs.mkdirSync(anchor, { recursive: true })
  const parent = fs.realpathSync(anchor)
  const base = fs.mkdtempSync(path.join(parent, RUN.prefix))
  try {
    const { env } = testEnvironment(sdk, base)
    const child = spawn(NODE, ['--test', RUN.concurrency + concurrency, '--test-reporter=spec', ...args, ...files.map((f) => path.join(REPO, f))], {
      cwd: REPO, stdio: 'inherit', env, detached: process.platform !== 'win32',
    })
    children.add(child)
    return await new Promise((resolve) => {
      child.on('error', (error) => console.error(error))
      child.on('close', (status) => { children.delete(child); resolve(status ?? 1) })
    })
  } finally {
    if (path.dirname(base) === parent && path.basename(base).startsWith(RUN.prefix)) fs.rmSync(base, { recursive: true, force: true })
  }
}

function sdkReporterArgs(args, sdk) {
  const qualify = (destination) => destination && !REPORT.shared.includes(destination)
    ? `${destination}${REPORT.suffixSeparator}${sdk}` : destination
  const end = args.indexOf(REPORT.endOfOptions)
  const optionCount = end === -1 ? args.length : end
  const scoped = [...args]
  for (let i = 0; i < optionCount; i++) {
    const arg = args[i]
    if (arg.startsWith(REPORT.inline)) scoped[i] = REPORT.inline + qualify(arg.slice(REPORT.inline.length))
    else if (arg === REPORT_DESTINATION && i + 1 < optionCount) {
      i++
      scoped[i] = qualify(args[i])
    }
  }
  return scoped
}

/** Keep each file's dependent rows sequential; parallel mode only overlaps files and SDK jobs. */
export async function runSuiteJobs(jobs, args, { defaultConcurrency = 1, defaultParallel = false } = {}) {
  const serial = args.includes(RUN.serial)
  const explicitParallel = args.includes(RUN.parallel)
  if (serial && explicitParallel) throw new Error('choose either --serial or --parallel')
  const parallel = explicitParallel || (defaultParallel && !serial)
  const overridesConcurrency = args.some((arg) => arg === RUN.concurrency.slice(0, -1) || arg.startsWith(RUN.concurrency))
  if ((serial || parallel) && overridesConcurrency) throw new Error('managed scheduling cannot be combined with --test-concurrency')
  if (parallel && args.some((arg) => RUN.isolationFlags.some((flag) => arg === flag || arg.startsWith(flag + '=')))) {
    throw new Error('parallel scheduling manages Node test process isolation')
  }
  const nodeArgs = args.filter((arg) => arg !== RUN.serial && arg !== RUN.parallel)
  // Explicit CLI isolation takes precedence over NODE_OPTIONS inherited from the caller.
  if (parallel) nodeArgs.unshift(RUN.processIsolation)
  const children = new Set()
  let cancelled = false
  const cancel = (signal) => {
    cancelled = true
    for (const child of children) {
      if (child.pid === undefined) continue
      if (process.platform === 'win32') child.kill(signal)
      else {
        // Negative PID targets only the process group we created for this SDK job.
        try { process.kill(-child.pid, signal) } catch (error) {
          if (error.code !== 'ESRCH') console.error(error)
        }
      }
    }
  }
  linkContractForSourceRun()
  for (const signal of RUN.signals) process.on(signal, cancel)
  try {
    // Even serial SDK jobs would truncate each other's reports if they shared a file destination.
    const run = (job) => runJob(job, jobs.length > 1 ? sdkReporterArgs(nodeArgs, job.sdk) : nodeArgs,
      parallel ? RUN.fileConcurrency : serial ? 1 : defaultConcurrency, children)
    let status = 0
    if (parallel) {
      const results = await Promise.allSettled(jobs.map(run))
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) throw failed.reason
      status = results.find((result) => result.value)?.value ?? 0
    } else {
      for (const job of jobs) {
        if (cancelled) break
        status = (await run(job)) || status
      }
    }
    return cancelled ? RUN.cancelExit : status
  } finally {
    for (const signal of RUN.signals) process.off(signal, cancel)
  }
}

export const runSuites = (files, args) => runSuiteJobs([{ files }], args, { defaultConcurrency: RUN.fileConcurrency })
