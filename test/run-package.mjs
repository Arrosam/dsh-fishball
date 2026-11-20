/**
 * Runs one package's suites: `npm test` in a package folder (npm sets the cwd to the package), or
 * `node test/run-package.mjs <package dir> [node --test args]`. Suites run from the repo root through
 * the shared isolated runner, exactly as test:v3 runs them.
 */
import fs from 'node:fs'
import path from 'node:path'
import { PACKAGE_TESTS, packageSuiteFiles } from './support/package-tests.mjs'
import { runSuites } from './support/suite-runner.mjs'

const args = process.argv.slice(2)
const named = args[0] !== undefined && !args[0].startsWith('-') && fs.existsSync(path.join(path.resolve(args[0]), PACKAGE_TESTS.config))
const packageDir = path.resolve(named ? args.shift() : process.cwd())
if (!fs.existsSync(path.join(packageDir, PACKAGE_TESTS.config))) throw new Error('no ' + PACKAGE_TESTS.config + ' in ' + packageDir)
process.exitCode = await runSuites(await packageSuiteFiles(packageDir), args)
