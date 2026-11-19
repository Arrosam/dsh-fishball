/**
 * The V3 suites: /opt/homebrew/bin/node test/run-v3.mjs [extra node --test args]
 * Runs every test/v3/**\/*.test.mjs except the shelved suites' files (test/suites.mjs SHELVED_FILES).
 */
import fs from 'node:fs'
import path from 'node:path'
import { REPO } from './support/constants.mjs'
import { runSuites } from './support/suite-runner.mjs'
import { SHELVED_FILES } from './suites.mjs'

const V3_SUITES = Object.freeze({ dir: path.posix.join('test', 'v3'), suffix: '.test.mjs' })

const files = fs.readdirSync(path.join(REPO, V3_SUITES.dir), { recursive: true })
  .map((f) => f.split(path.sep).join('/')).filter((f) => f.endsWith(V3_SUITES.suffix))
  .sort().map((f) => path.posix.join(V3_SUITES.dir, f)).filter((f) => !SHELVED_FILES.includes(f))
process.exitCode = await runSuites(files, process.argv.slice(2))
