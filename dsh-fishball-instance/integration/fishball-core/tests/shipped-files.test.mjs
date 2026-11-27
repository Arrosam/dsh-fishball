/**
 * SHIP-UC-01: placement copies exactly what a package ships (README "Placement"; Q-21), reading the
 * manifest's "files" as npm does: an entry starting with '!' is an exclusion (commit fab3837). Over
 * the REAL fishball-core of the sibling checkout, which lists "ui/" and "!ui/tests/": the copy the
 * instance places in a child (composedProfile, its export './native-runtime') holds exactly npm
 * pack's own file list (an isolated `npm pack --dry-run --json`, which writes nothing) minus the
 * README npm always adds and placement never ships.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'
import { composeChild, coreDir, coreManifest, CORE } from './support/compose.mjs'
import { PACK } from './support/constants.mjs'

const skip = missingSibling('fishball')

/** npm's own file list of `dir` (POSIX paths), isolated from any user config; nothing is written. */
function npmFiles(dir, scratch) {
  const env = { PATH: process.env.PATH, HOME: scratch, npm_config_userconfig: '/dev/null', npm_config_cache: path.join(scratch, 'npm-cache'), npm_config_offline: 'true' }
  const out = execFileSync('npm', [...PACK.args], { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return JSON.parse(out.slice(out.indexOf('[')))[0].files.map((f) => f.path)
}
/** Every regular file under `dir`, POSIX-relative. */
function treeFiles(dir, rel = '', out = []) {
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const p = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) treeFiles(dir, p, out)
    else out.push(p)
  }
  return out
}

eachSdk((sdk) => {
  caseTest(sdk, 'SHIP-UC-01', 'main', `the real fishball-core places exactly npm pack's file list minus README (${PACK.mustShip} in, nothing under ${PACK.excluded})`, async (t) => {
    const scope = cleanups(t)
    const manifest = coreManifest()
    assert.ok(manifest.files.includes('!' + PACK.excluded), 'precondition: core lists !' + PACK.excluded + ': ' + JSON.stringify(manifest.files))
    const expected = npmFiles(coreDir(), tempRoot(scope)).filter((f) => !PACK.npmOnly.includes(f)).sort()
    const c = await composeChild(sdk, scope)
    for (const dir of ['vendor', 'node_modules']) {
      const copy = path.join(c.profile, dir, CORE.name)
      const placed = treeFiles(copy).filter((f) => !f.startsWith('node_modules/')).sort()
      assert.deepEqual(placed, expected, dir + '/fishball-core differs from npm pack --dry-run')
      assert.ok(placed.includes(PACK.mustShip), PACK.mustShip + ' not placed')
      assert.deepEqual(placed.filter((f) => f.startsWith(PACK.excluded)), [], 'paths under ' + PACK.excluded)
    }
  }, { skip })
})
