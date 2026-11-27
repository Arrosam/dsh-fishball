/**
 * V3-S6 scenario C (hosted child): the same core, board and instance packages placed the way the
 * instance does it (vendor copy + node_modules copy + `file:` dependency + bundles list, written
 * before the profile loads, no pnpm), then booted with the instance's §6.2 launch configuration as
 * `--patch` overlays: hmr off, own webserver/web-runtime settings, the admission key and target URL
 * as core config. Checks: the guards behave exactly as standalone; the overlays carry no guard row;
 * an owner override in the child's profile patch is reported; `fishball-instance` stays off (no nested child).
 * Env: SDK=<version>, S6_ORDER=core-first|core-last. Writes results/hosted-<order>-<sdk>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { boot, CORE_PACKAGES, initProfile, isolateHome, profilePatchPath, record, writePatch } from './harness.mjs'
import { inspect } from './inspect.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
/** §6.2: what a hosted child needs to run under its host, and nothing else (no guard rows). */
const LAUNCH = Object.freeze({
  rows: (target) => [
    { id: 'hmr', disabled: true },
    { id: 'web-runtime', config: { openBrowser: false, printUrl: true, surfaceContext: true } },
    { id: 'fishball-core', config: { hosted: true, admissionKey: 'spike-admission-key-not-a-secret', target } },
  ],
  target: 'http://127.0.0.1:1/api/fishball/mcp',
})
const GUARD_OVERRIDE = '- { id: ui-subagent, disabled: false }\n'
/** S6_ORDER=core-last places core after the other members, as the instance's placement can choose. */
const ORDER = process.env.S6_ORDER ?? 'core-first'
const MEMBERS = ORDER === 'core-last'
  ? [CORE_PACKAGES.board, CORE_PACKAGES.instance, CORE_PACKAGES.core]
  : [CORE_PACKAGES.core, CORE_PACKAGES.board, CORE_PACKAGES.instance]

const iso = isolateHome('hosted')
await initProfile(iso)
// Placement (§8.1): copy each member into vendor/ and node_modules/, add the file: dependency and the bundle.
const manifestPath = path.join(iso.profileDir, 'package.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
for (const name of MEMBERS) {
  for (const dir of ['vendor', 'node_modules']) fs.cpSync(path.join(FIXTURES, name), path.join(iso.profileDir, dir, name), { recursive: true })
  manifest.dependencies = { ...manifest.dependencies, [name]: `file:./vendor/${name}` }
  manifest.dsh.profile.bundles.push(name)
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
fs.writeFileSync(profilePatchPath(iso), GUARD_OVERRIDE)
const launch = writePatch(iso.home, 'launch.patch.yml', LAUNCH.rows(LAUNCH.target))

globalThis.__s6 = { checks: [] }
const booted = await boot(iso, { overlays: [launch] })
const facts = await inspect('hosted-with-owner-override', booted, iso)
const hmr = [...booted.ctx.loader.entries()].find((entry) => entry.options.id === 'hmr')
record(`hosted-${ORDER}`, {
  bundles: manifest.dsh.profile.bundles,
  launchOverlay: LAUNCH.rows('<target>'),
  launchOverlayGuardRows: LAUNCH.rows('').filter((row) => row.disabled === true && row.id !== 'hmr').map((row) => row.id),
  hmrDisabled: hmr?.disabled,
  coreConfigSeen: { ...globalThis.__s6.config, admissionKey: globalThis.__s6.config?.admissionKey ? '<present>' : undefined },
  boots: [facts],
})
process.exit(0)
