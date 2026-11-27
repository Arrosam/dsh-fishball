/**
 * V3-S6 scenarios A (standalone) and B (owner override), one SDK per run.
 *  A1 native `dsh plugin add` of the core, board and instance tarballs into an ordinary web profile;
 *  A2 boot: composition, preflight output, policy, preset, model tools, client graph, plugin lists, route;
 *  B1 the owner re-enables a guard row through DSH's own Plugins service (setPluginEnabled);
 *  B2 the owner widens the permission preset by a hand edit of their profile patch;
 *  B3 the owner restores both;
 *  B4 (second process, S6_HOME=<home>) a reboot with the preset override in place reports it at app ready.
 * Env: SDK=<version>, S6_MEMBERS=core (optional). Writes results/standalone-<sdk>.json or standalone-reboot-<sdk>.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { boot, CORE_PACKAGES, dshPlugin, initProfile, isolateHome, profilePatchPath, record, TARBALLS, until, sleep } from './harness.mjs'
import { inspect } from './inspect.mjs'

const SETTLE_MS = 1500
const PRESET_OVERRIDE = `- id: permission
  config:
    presets:
      read-only: { sandbox: read-only, approval: ask }
      workspace-write: { sandbox: workspace-write, approval: ask }
    defaultPreset: workspace-write
`
const GUARD_OVERRIDE = '- { id: ui-subagent, disabled: false }\n'
const reboot = process.env.S6_HOME !== undefined
/** S6_MEMBERS=core installs core alone (no instance, no feature): the A-lite page without the instance. */
const CORE_ONLY = process.env.S6_MEMBERS === 'core'
const MEMBERS = CORE_ONLY ? [CORE_PACKAGES.core] : Object.values(CORE_PACKAGES)
const iso = isolateHome(CORE_ONLY ? 'core-only' : 'standalone', process.env.S6_HOME)
const evidence = { install: {}, boots: [] }

if (!reboot) {
  await initProfile(iso)
  // A1: DSH's native "add plugin" path (pnpm add of a local tarball), as a user would run it.
  for (const name of MEMBERS) {
    const result = await dshPlugin(['add', path.join(TARBALLS, `${name}-0.0.0-spike.1.tgz`)])
    evidence.install[name] = { ok: result.ok, tail: result.out.trim().split('\n').filter((line) => !/[│╭╰]/.test(line)).slice(-2) }
  }
}
evidence.bundles = JSON.parse(fs.readFileSync(path.join(iso.profileDir, 'package.json'), 'utf8')).dsh.profile.bundles

/** Run one owner action and collect the checks it triggered while the DSH keeps running. */
async function live(action) {
  const from = globalThis.__s6.checks.length
  const result = await action()
  await sleep(SETTLE_MS)
  const checks = globalThis.__s6.checks.slice(from)
  return { result, triggers: [...new Set(checks.map((check) => check.trigger))], report: globalThis.__s6.last.overridden }
}
const patchLines = () => fs.readFileSync(profilePatchPath(iso), 'utf8').split('\n').filter((line) => line.trim() && !line.startsWith('#'))

globalThis.__s6 = { checks: [] }
const booted = await boot(iso)
evidence.boots.push(await inspect(reboot ? 'reboot-with-preset-override' : 'installed', booted, iso))
const { ctx } = booted

if (!reboot && !CORE_ONLY) {
  // B1: re-enable a guard row through DSH's own Plugins service.
  const row = (await ctx.pluginManager.listPlugins()).find((item) => item.patchId === 'ui-subagent')
  evidence.b1 = {
    listedAs: row === undefined ? null : { entryId: row.entryId, readOnlyReason: row.readOnlyReason ?? null },
    ...(await live(() => ctx.pluginManager.setPluginEnabled(row.entryId, true))),
    entryDisabledAfter: [...ctx.loader.entries()].find((entry) => entry.options.id === 'ui-subagent')?.disabled,
    profilePatch: patchLines(),
  }
  // B2: widen the preset by a hand edit of the profile patch; HMR reloads the user layer.
  evidence.b2 = await live(() => { fs.writeFileSync(profilePatchPath(iso), GUARD_OVERRIDE + PRESET_OVERRIDE); return until(() => ctx.permissionPresets.names.length > 1, 8000) })
  evidence.b2.presetNames = ctx.permissionPresets.names
  // B3: restore both by emptying the profile patch.
  evidence.b3 = await live(() => { fs.writeFileSync(profilePatchPath(iso), '[]\n'); return until(() => ctx.permissionPresets.names.length === 1, 8000) })
  // Leave the preset override for the B4 reboot.
  fs.writeFileSync(profilePatchPath(iso), PRESET_OVERRIDE)
}
evidence.home = iso.home
record(reboot ? 'standalone-reboot' : CORE_ONLY ? 'core-only' : 'standalone', evidence)
process.exit(0)
