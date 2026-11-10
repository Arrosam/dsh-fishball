/**
 * Single entry for the Fishball P2 black-box suite:
 *   /opt/homebrew/bin/node test/run.mjs [extra node --test args]
 * Runs every test/*.test.mjs (except native-production-*) with node:test and exits non-zero on failure.
 * The V2 release selection (nested suites added, V3 suites excluded) is test/run-v2.mjs.
 */
import { rootSuiteFiles, runSuites } from './support/suite-runner.mjs'

process.exit(runSuites(rootSuiteFiles(), process.argv.slice(2)))
