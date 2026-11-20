/**
 * Runs every suite in this repository: the cross-package ones under test/v3/**\/*.test.mjs and each
 * package's own (packages/**\/tests/test.config.mjs; see test/run-package.mjs for one package).
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './support/constants.mjs'
import { packageSuiteFiles, packagesWithTests } from './support/package-tests.mjs'
import { runSuites } from './support/suite-runner.mjs'

const V3_SUITES = Object.freeze({ dir: path.posix.join('test', 'v3'), suffix: '.test.mjs' })

const files = fs.readdirSync(path.join(REPO, V3_SUITES.dir), { recursive: true })
  .map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith(V3_SUITES.suffix))
  .sort().map((f) => path.posix.join(V3_SUITES.dir, f))
for (const dir of packagesWithTests()) files.push(...await packageSuiteFiles(dir))
process.exitCode = await runSuites(files, process.argv.slice(2))
