/**
 * Runs every test/v3/**\/*.test.mjs in this repository.
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './support/constants.mjs'
import { runSuites } from './support/suite-runner.mjs'

const V3_SUITES = Object.freeze({ dir: path.posix.join('test', 'v3'), suffix: '.test.mjs' })

const files = fs.readdirSync(path.join(REPO, V3_SUITES.dir), { recursive: true })
  .map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith(V3_SUITES.suffix))
  .sort().map((f) => path.posix.join(V3_SUITES.dir, f))
process.exitCode = await runSuites(files, process.argv.slice(2))
