#!/usr/bin/env node
/**
 * The fab3837 regression demo (docs/testing/writing-tests.md "Regression cases"): runs the SHIP
 * cases (shipped-files.test.mjs) against dsh-instance as it was at a given commit, by default
 * fab3837^ (before '!' entries were read as exclusions), and then against this checkout.
 *
 *   node packages/dsh-instance/tests/placement/before-fix.mjs [commit]
 *
 * The old package is extracted with `git archive` into a fresh folder under the OS temp dir (never
 * the checkout), and the cases import placement.js from there (FBTEST_PLACEMENT_FROM). Expected:
 * failures before the fix, none after it.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { REPO } from '@dsh-instance/test-helpers/constants'
import { runPackage } from '@dsh-instance/test-helpers/runner'
import { PLACEMENT_FROM } from './constants.mjs'

const BEFORE_FIX = 'fab3837^'
const PACKAGE = path.join('packages', 'dsh-instance')
const CASES = path.join('tests', 'placement', 'shipped-files.test.mjs')
const PREFIX = 'dshi-before-fix-'

const commit = process.argv[2] ?? BEFORE_FIX
const base = fs.realpathSync(os.tmpdir())
const scratch = fs.mkdtempSync(path.join(base, PREFIX))
try {
  const archive = path.join(scratch, 'package.tar')
  execFileSync('git', ['archive', '--format=tar', '-o', archive, commit, PACKAGE], { cwd: REPO })
  execFileSync('tar', ['-xf', archive, '-C', scratch])
  const old = path.join(scratch, PACKAGE)
  const dir = path.join(REPO, PACKAGE)
  console.log(`== SHIP cases against ${commit} (${old})`)
  process.env[PLACEMENT_FROM] = old
  const before = await runPackage(dir, [CASES])
  delete process.env[PLACEMENT_FROM]
  console.log('== SHIP cases against this checkout')
  const after = await runPackage(dir, [CASES])
  console.log(`== exit status: ${commit} ${before}, this checkout ${after}`)
  process.exitCode = before !== 0 && after === 0 ? 0 : 1
} finally {
  // Guard the one recursive delete: the mkdtemp folder made above.
  if (path.dirname(scratch) === base && path.basename(scratch).startsWith(PREFIX)) fs.rmSync(scratch, { recursive: true, force: true })
}
