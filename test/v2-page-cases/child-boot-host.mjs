/**
 * CHILD-BOOT host process (test-owned). Boots one REAL DSH web profile from the selected SDK, the
 * same way the child DSH runs: the SDK's default `web` profile, plus an overlay patch that appends
 * the given rows after the native rows. It prints DSH's own `dsh web: <url>` line and keeps
 * running until its stdin ends (DSH's launcher shuts down on stdin EOF; the parent holds it open).
 *
 * Environment (all set by child-boot.test.mjs):
 * - FBTEST_CHILD_RUNTIME: the SDK's node_modules directory;
 * - DSH_HOME: a throwaway home under `.runtime/test-homes`;
 * - FBTEST_CHILD_ROWS: JSON array of cordis rows to insert ({id, name, required?}).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PROFILE } from '../support/constants.mjs'

const CHILD_HOST = Object.freeze({
  homeMarker: path.join('.runtime', 'test-homes'),
  overlayFile: 'fbtest-child-boot.overlay.json',
  profileTemplate: 'web',
  envLayer: 'dsh',
  args: Object.freeze(['--no-open', '--port', '0']),
})

const runtime = process.env.FBTEST_CHILD_RUNTIME
const home = process.env.DSH_HOME
const rows = JSON.parse(process.env.FBTEST_CHILD_ROWS ?? '[]')
if (!runtime) throw new Error('child-boot host: FBTEST_CHILD_RUNTIME is not set')
// Never boot against a real home: the profile is created and the overlay written inside DSH_HOME.
if (!home || !home.includes(CHILD_HOST.homeMarker)) throw new Error('child-boot host refuses a DSH_HOME outside .runtime/test-homes')

const sdk = (spec) => import(pathToFileURL(path.join(runtime, spec)).href)
const { runProfile, initializeProfileFromDefault } = await sdk('@deepseek-ai/dsh/lib/profile-boot.js')
const { loadLayeredEnv } = await sdk(path.join('@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js'))

if (!fs.existsSync(path.join(home, 'profiles', PROFILE))) initializeProfileFromDefault(PROFILE, CHILD_HOST.profileTemplate, home)
const overlay = path.join(home, CHILD_HOST.overlayFile)
// A bare `insert` appends after the native rows, as the product's launch overlay does.
fs.writeFileSync(overlay, JSON.stringify([{ insert: rows }], null, 2))
await runProfile({ environment: loadLayeredEnv(CHILD_HOST.envLayer), profile: PROFILE, patchFiles: [overlay], args: [...CHILD_HOST.args] })
