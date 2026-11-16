/**
 * The one way the suite entries (test/run.mjs: every root file; test/run-affected.mjs: the selected suites)
 * run node:test, so both prepare test homes and the contract link identically.
 * Each test file boots its own throwaway DSH_HOME under the OS temp directory;
 * homes from earlier runs are removed first.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { NODE, REPO, TEST_HOMES } from './constants.mjs'
import { linkContractForSourceRun } from './contract-link.mjs'

const ROOT_SUITES = Object.freeze({
  dir: 'test',
  suffix: '.test.mjs',
  // native-production-*.test.mjs require their own disposable runner (support: test/native-production-runner.mjs)
  // and fail closed here; run them with `node test/native-production-runner.mjs preflight`.
  ownRunnerPrefix: 'native-production-',
})
const NODE_TEST_ARGS = Object.freeze(['--test', '--test-concurrency=3', '--test-reporter=spec'])

/** Repo-relative, sorted root suite files: every test/*.test.mjs except the own-runner ones. */
export function rootSuiteFiles() {
  return fs.readdirSync(path.join(REPO, ROOT_SUITES.dir))
    .filter((f) => f.endsWith(ROOT_SUITES.suffix) && !f.startsWith(ROOT_SUITES.ownRunnerPrefix))
    .sort().map((f) => path.posix.join(ROOT_SUITES.dir, f))
}

/**
 * Run repo-relative suite files with plain node --test; `args` follow the defaults, so a caller's
 * --test-concurrency/--test-timeout overrides them. Returns the exit status (non-zero on failure).
 */
export function runSuites(files, args) {
  // Guard the one recursive delete: the dedicated root must retain its .runtime/test-homes suffix.
  if (path.basename(TEST_HOMES) !== 'test-homes' || path.basename(path.dirname(TEST_HOMES)) !== '.runtime') throw new Error('unexpected test home root ' + TEST_HOMES)
  fs.rmSync(TEST_HOMES, { recursive: true, force: true })
  fs.mkdirSync(TEST_HOMES, { recursive: true })
  // Before any file starts: files importing instance modules directly must not race the first worker's link.
  linkContractForSourceRun()
  const result = spawnSync(NODE, [...NODE_TEST_ARGS, ...args, ...files.map((f) => path.join(REPO, f))], {
    stdio: 'inherit',
    env: { ...process.env, FBTEST_TEST_HOMES: TEST_HOMES },
  })
  return result.status ?? 1
}
