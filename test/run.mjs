/**
 * Single entry for the Fishball P2 black-box suite:
 *   /opt/homebrew/bin/node test/run.mjs [extra node --test args]
 * Runs every test/*.test.mjs with node:test and exits non-zero on failure.
 * Each test file boots its own throwaway DSH_HOME under .runtime/test-homes;
 * homes from earlier runs are removed first.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { NODE, TEST_HOMES } from './support/constants.mjs'

const dir = import.meta.dirname
// Guard the one recursive delete: it may only ever target <repo>/.runtime/test-homes.
if (path.basename(TEST_HOMES) !== 'test-homes' || path.basename(path.dirname(TEST_HOMES)) !== '.runtime') throw new Error('unexpected test home root ' + TEST_HOMES)
fs.rmSync(TEST_HOMES, { recursive: true, force: true })
fs.mkdirSync(TEST_HOMES, { recursive: true })

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f))
const result = spawnSync(NODE, ['--test', '--test-concurrency=3', '--test-reporter=spec', ...process.argv.slice(2), ...files], { stdio: 'inherit' })
process.exit(result.status ?? 1)
