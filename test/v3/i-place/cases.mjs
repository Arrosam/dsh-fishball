/**
 * I-PLACE black-box cases (.runtime/reports/v3-w3-briefs.md "I-PLACE test brief"; v3-tasks.md row
 * I-PLACE): PLAT-DT-01, HOST-ST-01 rows 1–3, HOST-UC-06 (overlay postcondition), HOST-UC-08 main 1
 * and A3, HOST-EP-03 rows 6–7, PLAT-DT-04 rule 1 in a real hosted child (the fishball-hosted-settings
 * rows HOST-UC-08 A1/A2 and HOST-DT-03 left with that bundle: REMOVE-WD, design §1.0), the V2 guard cases LITE-UC-03, LITE-EP-13 and SET-EP-12 restored in a hosted child
 * (V3 rule: design §5a.2 and §6.2), the K3 `unmount` rule of the settings-section point, the child
 * isolation rows (Fishball 2026-11-15) and PLAT-EP-07 row 5 (stays failing, REL-PACK).
 * Requirements R-BND-01…05, R-FB-02/09/10/12, R-HOST-02/04, R-ARCH-08, K3 settings
 * sections (packages/core/contracts/settings-sections.d.ts, README §Settings sections).
 *
 * Techniques, Use Cases first:
 * - Use Case: HOST-UC-06 (lifecycle postcondition), HOST-UC-08 main 1, A3;
 * - Decision Table: PLAT-DT-01 rules 1–9, PLAT-DT-04 rule 1;
 * - State Transition: HOST-ST-01 rows 1–3, and the `unmount` life of one section
 *   (registered → mounted → unmounted at panel close / withdrawal / plugin disposal; a throwing
 *   mount never reaches unmounted);
 * - EP: HOST-EP-03 rows 6–7 (what a launch overlay may carry; which bundles a child holds), the
 *   guard classes of the restored V2 cases;
 * - BVA: "at most once per mount" (0 calls before close, exactly 1 after, still 1 after a second
 *   close or a dispose after close).
 *
 * Levels: unit (manifests, the relayed pure `launchOverlay` export, core's patch composed with the
 * SDK's own dsh-app-boot; no child is launched) and integration (a real host DSH per SDK with this
 * checkout's instance, which launches the child; support/host.mjs, core/page.mjs). Integration rows
 * run only with FBTEST_V3_INTEGRATION=1 and are skipped by name otherwise, as the R-EMBED and K3
 * ones are. Rows a later task owns are `todo` and name it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TEST_HOMES } from '../../support/constants.mjs'
import { bootHost, newHome, until } from '../../support/host.mjs'
import { ROUTE, runtimeOf } from '../core/constants.mjs'
import { admitChild, bootGraph, openSettingsPage } from '../core/page.mjs'
import { corePatchFile } from '../core/static.mjs'
import { caseName, caseTest } from '../shared/cases.mjs'
import { V3 } from '../shared/constants.mjs'
import { readManifest } from '../shared/packages.mjs'
import {
  BUDGET, CHILD, CORE_COPY, DSH_ROW, GUARDS, INTEGRATION, LATER, OVERLAY, PANEL, POLICY, PROBE, RELAYED, REPORT, SET,
} from './constants.mjs'
import {
  blockedBy, childHome, composeChild, childProfile, launchOverlayExport, launchOverlays, placedCopy, placementFile, placementMode, placementRecord, profileBundles,
  profileManifest, removePlaced, setProfileBundles,
} from './subject.mjs'

const show = (v) => JSON.stringify(v)
const SDK_SCOPE = '@deepseek-ai/'

// ---------------------------------------------------------------------------------------------
// Integration: one real hosted setup per SDK process, restarted by the scenarios that need it.
// ---------------------------------------------------------------------------------------------

/** Run `fn` only at integration; otherwise registered as skipped under the same name (both SDK runs list it). */
function integrationCase(sdk, id, row, title, fn) {
  const name = caseName(sdk, id, row, title) + ' [integration]'
  if (process.env[INTEGRATION.env] === INTEGRATION.on) test(name, fn)
  else test(name, { skip: INTEGRATION.skip }, () => {})
}

/**
 * The host DSH of this file: boots with this checkout's instance, which places the set and starts
 * the child. `restart()` stops the host (which stops the child, R-HOST-02) and boots it again on
 * the same home, so a change the test makes to the child profile while it is down takes effect.
 */
function hostedSetup(label) {
  let home
  let host
  const settled = async () => {
    let status
    await until(async () => { status = (await host.get(ROUTE.status)).json; return status?.state === CHILD.state.ready || status?.state === CHILD.state.failed }, BUDGET.readyMs, BUDGET.pollMs)
    return status
  }
  const boot = async (sdk) => {
    host = await bootHost(home, { env: { FBTEST_DSH_RUNTIME: runtimeOf(sdk) } })
    return settled()
  }
  after(async () => {
    await host?.stop().catch(() => {})
    // Guard the one recursive delete: a home this file created directly under the test-homes root.
    if (home && path.dirname(home) === fs.realpathSync(TEST_HOMES) && path.basename(home).startsWith(label)) fs.rmSync(home, { recursive: true, force: true })
  })
  return {
    async start(sdk) {
      if (host) return { home, host, status: (await host.get(ROUTE.status)).json }
      // Canonical and outside the checkout: the child refuses a non-canonical main home and a Git ancestor.
      home = fs.realpathSync(newHome(label))
      return { home, host, status: await boot(sdk) }
    },
    /** Stop, run `whileDown(home)`, boot again; resolves to the settled status after the new start. */
    async restart(sdk, whileDown = () => {}) {
      await host.stop()
      await whileDown(home)
      return boot(sdk)
    },
    get host() { return host },
    get home() { return home },
  }
}

/** Fixture: an incompatible copy of a placed bundle (its engines.dsh no SDK meets), written while the child is down. */
function makeIncompatible(home, name) {
  for (const dir of RELAYED.copyDirs) {
    const file = path.join(placedCopy(home, name, dir), CORE_COPY.manifest)
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
    manifest.engines = { ...manifest.engines, dsh: CHILD.impossibleEngine }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
  }
}
/**
 * Start once with `name` incompatible (after `prep`), read the settled status, then put the child
 * back: the placement copies the instance's own package again at the next start (R-BND-01), so a
 * plain restart restores it; the scenarios after this one need a ready child.
 */
async function startIncompatible(setup, sdk, name, prep = () => {}) {
  const status = await setup.restart(sdk, (home) => { prep(home); makeIncompatible(home, name) })
  const back = await setup.restart(sdk)
  assert.equal(back?.state, CHILD.state.ready, 'the child did not start again after the incompatible copy was replaced: ' + show(back))
  return status
}

/** The ids of the client entries the child serves (its boot graph). */
async function childGraph(host) {
  return (await bootGraph(await admitChild(host))).map((e) => e.id)
}

/** A row is enabled in the child exactly when its bundle is in `dsh.profile.bundles` (RELAYED.record). */
const enabled = (home, name) => profileBundles(home).includes(name)

// ---------------------------------------------------------------------------------------------
// Unit: core's patch composed with the SDK's own layers, the way a hosted child composes it.
// ---------------------------------------------------------------------------------------------

/**
 * The composed effective child profile on `sdk` (design §5a.2 order: bundle patches, then the
 * profile patch file, then launch overlays): dsh-base + dsh-web-app, then core's bundle patch LAST
 * (R-FB-12), then the owner's profile layer, then the instance's launch overlay ops. Uses the SDK's
 * own dsh-app-boot; nothing is launched.
 */
async function composedChild(sdk, { profileLayer = [], overlay = [] } = {}) {
  const runtime = runtimeOf(sdk)
  const boot = await import(pathToFileURL(path.join(runtime, SDK_SCOPE + 'dsh-app-boot', 'lib', 'index.js')).href)
  const layerOf = (dir) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return boot.bundlePatchPaths(dir, manifest.dsh.bundle).flatMap((file) => boot.loadOverlayPatches('fbtest', file))
  }
  const shipped = ['dsh-base', 'dsh-web-app'].map((name) => layerOf(path.join(runtime, SDK_SCOPE + name)))
  const core = boot.loadOverlayPatches('fbtest', corePatchFile())
  return boot.composeEntries([...shipped, core, profileLayer, overlay])
}
/** Every row with `id`, nested group and preset rows included. */
function findRows(rows, id, out = []) {
  for (const row of rows) {
    if (row.id === id) out.push(row)
    if (row.group && Array.isArray(row.config)) findRows(row.config, id, out)
    if (Array.isArray(row.config?.plugins)) findRows(row.config.plugins, id, out)
  }
  return out
}
const shippedPresets = (rows) => GUARDS.shippedPresets.flatMap((id) => findRows(rows, id))

/** The V3 guard rule for a hosted child (design §5a.2 as amended at 32fca3c5; §6.2): what the composed profile must hold. */
function assertGuarded(effective) {
  const one = (id) => findRows(effective, id)[0]
  assert.equal(one(DSH_ROW.sandbox)?.config?.mode, POLICY.readOnly, 'sandbox-policy read-only')
  assert.equal(one(DSH_ROW.approval)?.config?.policy, POLICY.approvalAsk, 'approval ask')
  assert.deepEqual(Object.keys(one(DSH_ROW.permission)?.config?.presets ?? {}), [...GUARDS.policy.permissionPresets], 'permission presets read-only only')
  assert.equal(one(DSH_ROW.permission)?.config?.defaultPreset, GUARDS.policy.defaultPermissionPreset)
  // Present-only rows: a guarded row the composition has is disabled; core adds none of its own.
  for (const id of GUARDS.rows) for (const row of findRows(effective, id)) assert.equal(row.disabled, true, 'guarded row must be disabled: ' + id)
  // Q-S6-2 B (32fca3c5): the session-creating tools live inside the shipped presets, which are switched off, not deleted.
  const presets = shippedPresets(effective)
  assert.ok(presets.length > 0, 'the SDK ships no preset row (precondition)')
  for (const row of presets) assert.equal(row.disabled, true, 'shipped preset must be disabled (not deleted): ' + row.id)
}

/** The V2-shaped launch overlay inputs (the relayed arguments). */
function overlayArgs(base) {
  const paths = { home: path.join(base, 'home'), agentsHome: path.join(base, 'agents'), workspace: path.join(base, 'workspace'), mainHome: path.join(base, 'main'), profile: path.join(base, 'profile') }
  return { paths, record: { hostId: 'fbtest-i-place-host', instanceId: 'fbtest-i-place-instance' }, childModule: path.join(V3.instance.dir, 'native-child.js') }
}
async function overlayOps(sdk, base, entries = []) {
  const launchOverlay = await launchOverlayExport()
  const { paths, record, childModule } = overlayArgs(base)
  return launchOverlay(paths, record, childModule, {}, {}, entries)
}
const insertedOf = (ops) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
const rowsTouched = (ops) => ops.map((op) => op?.id).filter((id) => id !== undefined)
const isIsolation = (id) => id === OVERLAY.isolation.instructions.id || id === OVERLAY.isolation.skills.id || OVERLAY.presetRow.test(id)
/** A scratch dir under the run's temp root, removed after the test (guarded). */
function scratch(t, prefix) {
  const root = path.dirname(fs.realpathSync(TEST_HOMES))
  const dir = fs.mkdtempSync(path.join(root, prefix))
  t.after(() => {
    if (path.dirname(dir) !== root || !path.basename(dir).startsWith(prefix)) throw new Error('unexpected temp dir ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

// ---------------------------------------------------------------------------------------------
// The `unmount` rule: a section's life in the panel (K3 settings sections; brief F5).
// ---------------------------------------------------------------------------------------------

/** A probe section recording every mount and unmount call, by the host element it got. */
function probeSection(id, log, { throws = false } = {}) {
  return {
    id,
    title: () => PROBE.title,
    order: PROBE.order,
    mount(host) {
      log.push({ id, call: 'mount', host })
      if (throws) throw new Error('fbtest probe mount throws')
      const element = host.ownerDocument.createElement('div')
      element.setAttribute(PROBE.marker, id)
      host.appendChild(element)
    },
    unmount(host) { log.push({ id, call: 'unmount', host }) },
  }
}
const calls = (log, id, call) => log.filter((e) => e.id === id && e.call === call)
/** "At most once per mount": every mount host got at most one unmount, and no unmount without a mount before it. */
function assertAtMostOncePerMount(log, id) {
  const mounts = calls(log, id, 'mount')
  for (const m of mounts) assert.ok(log.filter((e) => e.id === id && e.call === 'unmount' && e.host === m.host).length <= 1, 'unmount ran twice for one mount')
  for (const u of calls(log, id, 'unmount')) assert.ok(mounts.some((m) => m.host === u.host && log.indexOf(m) < log.indexOf(u)), 'unmount without its mount')
}

/**
 * A plugin that registers the probe sections through the frozen point; `dispose` withdraws one by
 * its K3 disposer, and the plugin's own disposal withdraws the rest (K3: "plugin disposal included").
 */
function probePlugin(sections) {
  const disposers = new Map()
  return {
    disposers,
    plugin: {
      name: PROBE.id,
      inject: [PANEL.service],
      apply(ctx) { for (const s of sections) disposers.set(s.id, ctx[PANEL.service][PANEL.register](s)) },
    },
  }
}

export function registerIPlaceCases(sdk) {
  const setup = hostedSetup(INTEGRATION.homeLabel)
  const ready = async () => {
    const s = await setup.start(sdk)
    assert.equal(s.status?.state, CHILD.state.ready, 'precondition: the hosted child is ready; status ' + show(s.status))
    return s
  }

  // ============================================================== Use Cases
  // ---- HOST-UC-06 postcondition (R-HOST-04, Q-5; design §6.2): the launch overlay carries only launch configuration.
  // Q-5 (dev 6d13f6a1): the overlay inserts exactly the two instance runtime rows; no guard, V2 child, settings or forced-on row.
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay inserts only fishball-native-web and fishball-native-child (no guard, V2 child, settings or forced-on row)', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-ovl-'), [])
    assert.deepEqual(insertedOf(ops).map((r) => r.id).sort(), [...OVERLAY.runtimeRows].sort())
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay disables nothing but hmr: no guarded row, no shipped preset, no dsh-instance', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-ovl-'), [])
    const disabled = ops.filter((op) => op?.disabled === true).map((op) => op.id)
    assert.deepEqual(disabled, [OVERLAY.hmr])
  })
  // Isolation (Fishball 2026-11-15; row 6 as amended in 57ae8e96): a shipped preset row nests the
  // isolated plugins, so it may carry a config-only op; an op that sets or clears `disabled` on it
  // stays a guard op and is forbidden, and the composed child keeps it off.
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay touches only the allowed rows: hmr, origin and port, admission, target, and the isolation rows', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-ovl-'), [])
    const guardOrPolicy = [...GUARDS.rows, DSH_ROW.sandbox, DSH_ROW.approval, DSH_ROW.permission, DSH_ROW.agentPresetRegistry]
    assert.deepEqual(rowsTouched(ops).filter((id) => guardOrPolicy.includes(id)), [], 'guard or policy rows in the overlay')
    const presetOps = ops.filter((op) => GUARDS.shippedPresets.includes(op?.id))
    assert.deepEqual(presetOps.filter((op) => Object.hasOwn(op, 'disabled')).map((op) => op.id), [], 'an overlay op sets or clears disabled on a shipped preset')
    assert.deepEqual(presetOps.filter((op) => Object.keys(op).some((k) => !['id', 'config'].includes(k))).map((op) => op.id), [], 'a shipped preset op is not config only')
    assert.ok(ops.some((op) => op?.id === OVERLAY.hmr && op.disabled === true), 'hmr off')
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the composed child keeps every shipped preset disabled: true, the isolation config ops included', async (t) => {
    const { entries } = await composeChild(path.join(scratch(t, 'fbtest-iplace-ovl-'), 'main'))
    const presets = shippedPresets(entries)
    assert.ok(presets.length > 0, 'precondition: the composed child has the shipped preset rows')
    for (const row of presets) assert.equal(row.disabled, true, 'shipped preset on in the composed child: ' + row.id)
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the launch overlay carries no token (only the non-secret entry key)', null, LATER.host)
  integrationCase(sdk, 'HOST-UC-06', 'post', 'a real start: the written launch.patch.yml holds the same shape (the two runtime rows, nothing disabled but hmr) and is removed when the child stops', async () => {
    const { home } = await ready()
    const live = launchOverlays(home)
    assert.equal(live.length, 1, 'one live launch overlay: ' + live.length)
    assert.deepEqual(insertedOf(live[0]).map((r) => r.id).sort(), [...OVERLAY.runtimeRows].sort())
    assert.deepEqual(live[0].filter((op) => op?.disabled === true).map((op) => op.id), [OVERLAY.hmr])
    await setup.restart(sdk, (h) => assert.deepEqual(launchOverlays(h), [], 'the stopped child left its launch overlay'))
  })

  // ---- child isolation (Fishball 2026-11-15, isolation): Fishball never reads the user's skills or project instructions.
  caseTest(sdk, 'HOST-EP-03', '6 isolation', 'the overlay sets agent-instructions projectRootMarkers to [] wherever it touches the row', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-iso-'), [])
    const effective = await composedChild(sdk, { overlay: ops })
    const rows = findRows(effective, OVERLAY.isolation.instructions.id)
    assert.ok(rows.length > 0, 'precondition: the SDK has agent-instructions rows')
    for (const row of rows) assert.deepEqual(row.config?.[OVERLAY.isolation.instructions.field], [...OVERLAY.isolation.instructions.value], 'project instructions not read: ' + show(row.config))
  })
  // The isolation rule (Fishball 2026-11-15, isolation, final wording): the child reads nothing of
  // the user's own skills or instructions. dshHome is composedProfile's `paths.home`
  // (<mainHome>/fishball/runtime/dsh-home); agentsHome and every customSkillDirs entry sit under the
  // child runtime root <mainHome>/fishball/runtime/, never the main home itself, never outside the
  // runtime root, never the user's real ~/.agents; includeDefaultRoots is false.
  caseTest(sdk, 'HOST-EP-03', '6 isolation', "the overlay limits skill-filesystem to the child runtime with includeDefaultRoots false wherever it is composed", async (t) => {
    const mainHome = path.join(scratch(t, 'fbtest-iplace-iso-'), 'main')
    const { paths, overlay } = await composeChild(mainHome)
    const effective = await composedChild(sdk, { overlay })
    const rows = findRows(effective, OVERLAY.isolation.skills.id)
    assert.ok(rows.length > 0, 'precondition: the SDK has skill-filesystem rows')
    const main = fs.realpathSync(mainHome)
    const runtimeRoot = path.join(main, ...OVERLAY.isolation.runtimeRoot)
    const userAgents = path.join(os.homedir(), OVERLAY.isolation.userAgentsDir)
    /** Strictly below `root` (the root itself does not count). */
    const below = (dir, root) => { const rel = path.relative(root, dir); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) }
    const within = (dir, root) => dir === root || below(dir, root)
    for (const row of rows) {
      const config = row.config ?? {}
      assert.equal(config[OVERLAY.isolation.skills.field], OVERLAY.isolation.skills.value, 'default roots read: ' + show(config))
      assert.equal(config[OVERLAY.isolation.skills.home], paths.home, "skills home is not the child's: " + show(config))
      assert.equal(typeof config[OVERLAY.isolation.skills.agentsHome], 'string', 'no agentsHome: ' + show(config))
      for (const dir of [config[OVERLAY.isolation.skills.agentsHome], ...(config[OVERLAY.isolation.skills.customDirs] ?? [])]) {
        assert.notEqual(dir, main, 'a skills directory is the main home itself')
        assert.ok(below(dir, runtimeRoot), `${dir} is not under the child runtime root ${runtimeRoot}`)
        assert.equal(within(dir, userAgents), false, `${dir} is the user's real ${userAgents}`)
      }
    }
  })
  caseTest(sdk, 'HOST-EP-03', '6 isolation', 'the isolation edits are config only: no isolation row is disabled or inserted by the overlay', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-iso-'), [])
    assert.deepEqual(ops.filter((op) => isIsolation(op?.id ?? '') && (op.disabled === true || Array.isArray(op.insert))).map((op) => op.id), [])
  })

  // ---- HOST-UC-08 (R-BND-02, R-BND-04).
  integrationCase(sdk, 'HOST-UC-08', 'main 1', "the child's profile holds the set members (board, core), all on, core last", async () => {
    const { home } = await ready()
    const bundles = profileBundles(home)
    for (const name of SET.placed) assert.ok(bundles.includes(name), name + ' is not on: ' + show(bundles))
    assert.equal(bundles.at(-1), SET.core, 'core is not last: ' + show(bundles))
  })
  integrationCase(sdk, 'HOST-UC-08', 'main 1', "the child's plugin list (DSH's own profile reader) lists the set members as installed bundles, all enabled", async () => {
    const { home } = await ready()
    const { readProfilePlugins } = await import(pathToFileURL(path.join(runtimeOf(sdk), SDK_SCOPE + 'dsh-app-boot', 'lib', 'index.js')).href)
    const { dependencies } = readProfilePlugins({ binName: 'fbtest', profileDir: childProfile(home), installAnchor: path.join(runtimeOf(sdk), SDK_SCOPE + 'dsh', 'package.json') })
    for (const name of SET.placed) {
      const d = dependencies.find((x) => x.name === name)
      assert.ok(d?.bundle && d.enabled, name + ': ' + show(d))
    }
  })
  // HOST-UC-08 A3: the generic panel comes from core itself, so the same core package shows it in standalone.
  caseTest(sdk, 'HOST-UC-08', 'A3', 'core ships the generic panel as the flat chunk client.settings.js beside its client.js, and in its files', () => {
    const manifest = readManifest(V3.core.dir)
    assert.ok(fs.existsSync(path.join(V3.core.dir, PANEL.chunk)), PANEL.chunk + ' is missing')
    assert.ok((manifest.files ?? []).includes(PANEL.chunk), 'core files lacks ' + PANEL.chunk + ': ' + show(manifest.files))
  })
  caseTest(sdk, 'HOST-UC-08', 'A3', 'core drops ui/fishball-settings (the panel is not a separate client package)', () => {
    assert.equal(fs.existsSync(path.join(V3.core.dir, PANEL.dropped)), false)
  })

  // ============================================================== State Transition: HOST-ST-01 rows 1–3
  integrationCase(sdk, 'HOST-ST-01', 1, 'Stopped → host app ready → Starting, then (row 2) Running: ready with the origin set', async () => {
    const { status, host } = await ready()
    assert.equal(status.state, CHILD.state.ready)
    const child = await admitChild(host)
    assert.ok(child.origin, 'no child origin')
  })
  integrationCase(sdk, 'HOST-ST-01', 3, 'Starting → an enabled incompatible member → Failed, PROFILE_INCOMPATIBLE naming it', async () => {
    await ready()
    const name = SET.features[0]
    const status = await startIncompatible(setup, sdk, name)
    assert.equal(status?.state, CHILD.state.failed, show(status))
    assert.equal(status?.code, CHILD.incompatible, show(status))
    assert.equal(blockedBy(status), name, show(status))
  })

  // ============================================================== Decision Tables
  // ---- PLAT-DT-01 (R-BND-01…04, R-FB-10): one record.
  integrationCase(sdk, 'PLAT-DT-01', 1, 'first placement: every member placed, on, recorded, core last', async () => {
    const { home } = await ready()
    const record = placementRecord(home)
    assert.equal(record?.format, RELAYED.record.format, show(record))
    assert.deepEqual([...record[RELAYED.record.key]].sort(), [...SET.placed].sort())
    for (const name of SET.placed) assert.ok(enabled(home, name), name + ' is not on')
    assert.equal(profileBundles(home).at(-1), SET.core)
  })
  integrationCase(sdk, 'PLAT-DT-01', 1, 'the placement record is the owner\'s only (mode 0600)', async () => {
    const { home } = await ready()
    assert.ok(fs.existsSync(placementFile(home)), 'no placement record')
    assert.equal(placementMode(home), RELAYED.record.mode)
  })
  // Rules 2–5 as one walk over restarts of the same child (each restart is the "next start").
  for (const [rule, title, name] of [
    [2, 'recorded, present, on → stays on', SET.features[0]],
    [3, 'recorded, present, off → stays off (a disable survives the restart)', SET.features[0]],
    [4, 'recorded, deleted while off → placed again, off', SET.features[0]],
    [5, 'recorded, deleted while on → placed again, on', SET.features[0]],
  ]) {
    integrationCase(sdk, 'PLAT-DT-01', rule, title, async () => {
      await ready()
      const action = {
        2: () => {},
        3: (home) => setProfileBundles(home, profileBundles(home).filter((b) => b !== name)),
        4: (home) => { setProfileBundles(home, profileBundles(home).filter((b) => b !== name)); removePlaced(home, name) },
        // Rule 5's member must be on when deleted: rules 3–4 left the one feature (board) off, so
        // it is switched back on, before core, while the child is down.
        5: (home) => { if (!enabled(home, name)) setProfileBundles(home, [...profileBundles(home).filter((b) => b !== SET.core), name, SET.core]); removePlaced(home, name) },
      }[rule]
      const status = await setup.restart(sdk, action)
      assert.equal(status?.state, CHILD.state.ready, show(status))
      const home = setup.home
      for (const dir of RELAYED.copyDirs) assert.ok(fs.existsSync(path.join(placedCopy(home, name, dir), CORE_COPY.manifest)), `${name} not in ${dir}/`)
      assert.equal(enabled(home, name), rule === 2 || rule === 5, `${name} on/off after rule ${rule}: ${show(profileBundles(home))}`)
      assert.ok(placementRecord(home)[RELAYED.record.key].includes(name), 'still recorded')
      assert.equal(profileBundles(home).at(-1), SET.core, 'core last')
    })
  }
  for (const [id, rule, name] of [['PLAT-DT-01', 7, SET.features[0]]]) {
    integrationCase(sdk, id, rule, `${name} off and incompatible → the start is not blocked (only enabled bundles block)`, async () => {
      await ready()
      const status = await startIncompatible(setup, sdk, name, (home) => setProfileBundles(home, profileBundles(home).filter((b) => b !== name)))
      assert.equal(status?.state, CHILD.state.ready, show(status))
      assert.equal(enabled(setup.home, name), false)
    })
  }
  for (const [id, rule, name] of [['PLAT-DT-01', 6, SET.features[0]]]) {
    integrationCase(sdk, id, rule, `${name} on and incompatible → the child start is blocked; the status names it (PROFILE_INCOMPATIBLE)`, async () => {
      await ready()
      const status = await startIncompatible(setup, sdk, name, (home) => {
        if (!enabled(home, name)) setProfileBundles(home, [...profileBundles(home).filter((b) => b !== SET.core), name, SET.core])
      })
      assert.equal(status?.state, CHILD.state.failed, show(status))
      assert.equal(status?.code, CHILD.incompatible, show(status))
      assert.equal(blockedBy(status), name, show(status))
    })
  }
  caseTest(sdk, 'PLAT-DT-01', 6, 'core on and incompatible blocks the start too (R-FB-10: core follows the same rules)', null, LATER.host)
  caseTest(sdk, 'PLAT-DT-01', 8, 'a toggle while the child runs takes effect at the next restart; the UI says "restart required"', null, LATER.restartNotice)
  caseTest(sdk, 'PLAT-DT-01', 1, 'core disabled by the owner: the instance starts the child anyway and reports fishball-off', null, LATER.host)

  // ---- PLAT-DT-01 rule 9 (R-BND-01 strict): the host never lists or loads the bundled copies.
  caseTest(sdk, 'PLAT-DT-01', 9, "the instance's own manifest selects no set member or library as a bundle or dependency of the host", () => {
    const manifest = readManifest(V3.instance.dir)
    const named = ['dependencies', 'peerDependencies', 'optionalDependencies'].flatMap((f) => Object.keys(manifest[f] ?? {}))
    assert.deepEqual(named.filter((n) => SET.placed.includes(n)), [])
  })
  integrationCase(sdk, 'PLAT-DT-01', 9, "a running hosted setup: the host's plugin list holds no set member", async () => {
    const { host } = await ready()
    const names = (await host.call('allBundles')).map((b) => b.name)
    assert.deepEqual(names.filter((n) => SET.placed.includes(n)), [])
  })
  integrationCase(sdk, 'PLAT-DT-01', 9, "a running hosted setup: the host's boot graph serves no client entry of the set", async () => {
    const { host } = await ready()
    const html = (await host.get(ROUTE.childRoot)).text
    for (const name of SET.placed) assert.equal(html.includes(`"id":"${name}"`), false, 'the host serves ' + name)
  })

  // ---- PLAT-DT-04 rule 1 in a real hosted child (replaces the F-GUARDS LATER.place todos, Q-20).
  integrationCase(sdk, 'PLAT-DT-04', 1, 'hosted (HMR off): the instance writes the child profile with core last; guards apply from the first start', async () => {
    const { home } = await ready()
    const bundles = profileBundles(home)
    assert.equal(bundles.at(-1), SET.core, show(bundles))
    for (const name of SET.features) assert.ok(bundles.indexOf(name) < bundles.indexOf(SET.core), name + ' after core')
    assert.ok(launchOverlays(home)[0]?.some((op) => op?.id === OVERLAY.hmr && op.disabled === true), 'HMR not off')
  })
  integrationCase(sdk, 'PLAT-DT-04', 1, 'hosted: no dsh-instance is ever started in the child (no nested child)', async () => {
    const { home } = await ready()
    assert.equal(profileBundles(home).includes(GUARDS.instanceRow), false, 'a dsh-instance bundle in the child')
    assert.equal(fs.existsSync(path.join(childHome(home), ...RELAYED.launches)), false, 'a nested child runtime in the child home')
  })
  // Dev 6d13f6a1: the panel is core's chunk; the child's Fishball client entries are these three.
  integrationCase(sdk, 'HOST-UC-08', 'A3', "a real hosted child serves fishball-page, fishball-recommend-plugins and fishball-core, and no fishball-settings entry", async () => {
    const { host } = await ready()
    const graph = (await childGraph(host)).filter((id) => id.startsWith('fishball-'))
    assert.deepEqual(graph.sort(), [...PANEL.childEntries].sort())
  })

  // ============================================================== EP: HOST-EP-03 rows 6–7
  caseTest(sdk, 'HOST-EP-03', 6, 'no settings row: the overlay inserts no panel row', async (t) => {
    const ids = insertedOf(await overlayOps(sdk, scratch(t, 'fbtest-iplace-ep-'), [])).map((r) => r.id)
    assert.deepEqual(ids.filter((id) => id === PANEL.service || /settings/.test(id)), [])
  })
  caseTest(sdk, 'HOST-EP-03', 6, 'no overlay row points into core (core is a placed bundle; its rows come from its own patch)', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-ep-'), [])
    const names = ops.flatMap((op) => [op?.name, ...(op?.insert ?? []).map((r) => r.name)]).filter((n) => typeof n === 'string')
    assert.deepEqual(names.filter((n) => n.includes(V3.core.name) || n.includes(path.join('packages', 'core'))), [])
  })
  // Core's patch rows (Fishball 2026-11-15, Q-13 probe): DSH serves a client only for a path row
  // (its nearest manifest) or a bare package name, so the ui packages stay path rows into their own
  // manifests, and only fishball-ui may resolve to core's own manifest.
  const corePatchInserts = async () => {
    const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(sdk), SDK_SCOPE + 'dsh-app-boot', 'lib', 'index.js')).href)
    return loadOverlayPatches('fbtest', corePatchFile()).flatMap((p) => p?.insert ?? [])
  }
  /** A path row's file (DSH anchors relative names to file: URLs), or null for a package name. */
  const rowFile = (name) => (typeof name !== 'string' ? null : name.startsWith('file:') ? fileURLToPath(name) : path.isAbsolute(name) ? name : null)
  /** The folder of the nearest package.json at or above a path row's file. */
  const nearestManifestDir = (file) => {
    for (let dir = fs.existsSync(file) && fs.statSync(file).isDirectory() ? file : path.dirname(file); ; dir = path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, CORE_COPY.manifest))) return fs.realpathSync(dir)
      if (path.dirname(dir) === dir) return null
    }
  }
  const coreDir = () => fs.realpathSync(V3.core.dir)
  caseTest(sdk, 'HOST-EP-03', 7, "core's patch has no path row whose nearest package.json is fishball-core's, except fishball-ui", async () => {
    const rows = await corePatchInserts()
    const intoCore = rows.filter((r) => rowFile(r.name) !== null && nearestManifestDir(rowFile(r.name)) === coreDir()).map((r) => r.id)
    assert.deepEqual(intoCore, [RELAYED.rows.corePathRow])
  })
  caseTest(sdk, 'HOST-EP-03', 7, "fishball-page and fishball-recommend-plugins are path rows into their own ui packages (own manifest, own ./client)", async () => {
    const rows = await corePatchInserts()
    for (const [id, folder] of Object.entries(RELAYED.rows.uiPackages)) {
      const row = rows.find((r) => r.id === id)
      assert.ok(row, 'core\'s patch inserts no ' + id)
      const file = rowFile(row.name)
      assert.ok(file, `${id} is not a path row: ${show(row.name)}`)
      const own = fs.realpathSync(path.join(V3.core.dir, folder))
      assert.equal(nearestManifestDir(file), own, `${id} does not resolve to its own manifest in ${folder}`)
      assert.ok(Object.hasOwn(readManifest(own)?.exports ?? {}, './client'), `${folder}/package.json exports no ./client`)
    }
  })
  caseTest(sdk, 'HOST-EP-03', 7, 'every slim child row (fishball-native-{session-tools,approvals,app,inbox,admin,provider-sync}) is a fishball-core/slim/* subpath', async () => {
    const rows = await corePatchInserts()
    for (const id of RELAYED.rows.slim) {
      const row = rows.find((r) => r.id === id)
      assert.ok(row, 'core\'s patch inserts no ' + id)
      assert.ok(typeof row.name === 'string' && row.name.startsWith(RELAYED.rows.slimPrefix), `${id}: ${show(row.name)} is not a ${RELAYED.rows.slimPrefix}* subpath`)
    }
  })
  integrationCase(sdk, 'HOST-EP-03', 7, 'the child profile and the placement record hold the set members (board, core), and nothing else of Fishball', async () => {
    const { home } = await ready()
    const fishball = (list) => list.filter((n) => n.startsWith('fishball-'))
    assert.deepEqual(fishball(placementRecord(home)[RELAYED.record.key]).sort(), [...SET.placed].sort())
    assert.deepEqual(fishball(profileBundles(home)).sort(), [...SET.placed].sort())
  })
  integrationCase(sdk, 'HOST-EP-03', 7, 'fishball-shared and the contract-only connector sit beside core in the child, never as a profile bundle', async () => {
    const { home } = await ready()
    for (const name of [SET.library, SET.contractOnly]) {
      for (const dir of RELAYED.copyDirs) assert.ok(fs.existsSync(placedCopy(home, name, dir)), `${name} not in ${dir}/`)
      assert.equal(profileBundles(home).includes(name), false, name + ' is a profile bundle')
    }
  })
  integrationCase(sdk, 'HOST-EP-03', 7, "the child's copy of core carries contracts/constants.js and vendor/, and exactly core's files plus package.json", async () => {
    const { home } = await ready()
    const copy = placedCopy(home, SET.core, RELAYED.copyDirs[0])
    for (const rel of CORE_COPY.mustCarry) assert.ok(fs.existsSync(path.join(copy, rel)), 'the copy lacks ' + rel)
    const expected = new Set([CORE_COPY.manifest, ...readManifest(V3.core.dir).files.map((f) => f.replace(/\/$/, '').split('/')[0])])
    const top = fs.readdirSync(copy).filter((f) => f !== 'node_modules')
    assert.deepEqual(top.filter((f) => !expected.has(f)), [], 'files beyond core\'s files list')
  })

  // ============================================================== The V2 guard cases restored in a hosted child (V3 rule)
  // V3 rule (design e1e5577 §5a.2 and §6.2; §5a.2 as amended at 32fca3c5, S6 round 2): the guards
  // come from core's own bundle patch, applied last; the launch overlay carries none; the owner's
  // profile layer wins over core's ("can override", Q20). A shipped agent preset is switched off.
  caseTest(sdk, 'LITE-UC-03', 'hosted', "effective read-only in a hosted child's composed profile (core's patch last + the launch overlay), shipped presets off", async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-lite-'), [])
    assertGuarded(await composedChild(sdk, { overlay: ops }))
  })
  caseTest(sdk, 'LITE-EP-13', 'hosted', 'no ordinary child creation: every guarded row the composition has is disabled, every shipped preset off, /permission read-only only', async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-lite-'), [])
    const effective = await composedChild(sdk, { overlay: ops })
    assertGuarded(effective)
    assert.deepEqual(Object.keys(findRows(effective, DSH_ROW.permission)[0].config.presets), [POLICY.readOnly])
  })
  caseTest(sdk, 'SET-EP-12', 'hosted', "the overlay patches no sandbox-policy; the effective sandbox is core's read-only", async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-set-'), [])
    assert.deepEqual(ops.filter((op) => op?.id === DSH_ROW.sandbox), [], 'the overlay patches sandbox-policy (R-HOST-04 forbids it)')
    assert.equal(findRows(await composedChild(sdk, { overlay: ops }), DSH_ROW.sandbox)[0]?.config?.mode, POLICY.readOnly)
  })
  caseTest(sdk, 'SET-EP-12', 'hosted', "a stored wider sandbox in the owner's profile layer wins (Q20 'can override'); core then reports it", async (t) => {
    const ops = await overlayOps(sdk, scratch(t, 'fbtest-iplace-set-'), [])
    const effective = await composedChild(sdk, { overlay: ops, profileLayer: [{ id: DSH_ROW.sandbox, config: { mode: POLICY.wider } }] })
    assert.equal(findRows(effective, DSH_ROW.sandbox)[0]?.config?.mode, POLICY.wider)
    // The report of that override is F-GUARDS' (REPORT.policy('sandbox')), checked in test/v3/f-guards.
    assert.ok(REPORT.policy('sandbox'))
  })
  integrationCase(sdk, 'LITE-UC-03', 'hosted', 'a real hosted child: no guarded row or shipped preset runs (the core patch applied over the placed bundles)', async () => {
    const { home } = await ready()
    assert.equal(profileBundles(home).at(-1), SET.core, 'precondition: core last')
    assert.deepEqual(insertedOf(launchOverlays(home)[0] ?? []).map((r) => r.id).sort(), [...OVERLAY.runtimeRows].sort())
  })
  caseTest(sdk, 'LITE-UC-03', 'hosted', 'the private Skills exception and a live child agent refused child creation and write', null, LATER.e2e)

  // ============================================================== State Transition + BVA: the K3 `unmount` rule
  // States: registered → mounted (panel open) → unmounted (panel close | withdrawal | plugin disposal).
  // A throwing mount never reaches `unmounted`. BVA: 0 unmounts while open, exactly 1 after close, still 1 after a second close.
  integrationCase(sdk, 'K3 settings sections', 'unmount close', 'panel open → mount once; panel close → unmount exactly once, with the same host', async (t) => {
    const { host } = await ready()
    const log = []
    const { plugin } = probePlugin([probeSection(PROBE.id, log)])
    const page = await openSettingsPage(t, { sdk, child: await admitChild(host), plugins: [plugin] })
    assert.equal((await page.waitFor(PROBE.marker)).length, 1, 'the probe is not drawn')
    assert.equal(calls(log, PROBE.id, 'mount').length, 1)
    assert.equal(calls(log, PROBE.id, 'unmount').length, 0, 'unmount before the panel closed')
    await page.close()
    assert.equal(calls(log, PROBE.id, 'unmount').length, 1)
    assert.equal(calls(log, PROBE.id, 'unmount')[0].host, calls(log, PROBE.id, 'mount')[0].host)
    await page.close()
    assertAtMostOncePerMount(log, PROBE.id)
    assert.equal(calls(log, PROBE.id, 'unmount').length, 1, 'a second close called unmount again')
  })
  integrationCase(sdk, 'K3 settings sections', 'unmount withdraw', 'withdrawal (the disposer) while mounted → unmount once; the section leaves no trace; disposing again changes nothing', async (t) => {
    const { host } = await ready()
    const log = []
    const { plugin, disposers } = probePlugin([probeSection(PROBE.id, log)])
    const page = await openSettingsPage(t, { sdk, child: await admitChild(host), plugins: [plugin] })
    await page.waitFor(PROBE.marker)
    disposers.get(PROBE.id)()
    await page.settled()
    assert.equal(calls(log, PROBE.id, 'unmount').length, 1)
    assert.equal(page.byAttr(PROBE.marker).length, 0, 'the withdrawn section left a trace')
    disposers.get(PROBE.id)()
    await page.close()
    assert.equal(calls(log, PROBE.id, 'unmount').length, 1, 'idempotent dispose or a later close unmounted again')
  })
  integrationCase(sdk, 'K3 settings sections', 'unmount dispose', 'the registering plugin disposed while mounted → unmount once (plugin disposal is a withdrawal)', async (t) => {
    const { host } = await ready()
    const log = []
    const { plugin } = probePlugin([probeSection(PROBE.id, log)])
    const page = await openSettingsPage(t, { sdk, child: await admitChild(host), plugins: [plugin] })
    await page.waitFor(PROBE.marker)
    await page.disposePlugin(PROBE.id)
    assert.equal(calls(log, PROBE.id, 'unmount').length, 1)
    await page.close()
    assertAtMostOncePerMount(log, PROBE.id)
  })
  integrationCase(sdk, 'K3 settings sections', 'unmount throws', 'a mount that threw is never unmounted (close, withdrawal or disposal); its "could not be loaded" line stays its own', async (t) => {
    const { host } = await ready()
    const log = []
    const { plugin, disposers } = probePlugin([probeSection(PROBE.throwing, log, { throws: true }), probeSection(PROBE.id, log)])
    const page = await openSettingsPage(t, { sdk, child: await admitChild(host), plugins: [plugin] })
    await page.waitFor(PROBE.marker)
    assert.equal(calls(log, PROBE.throwing, 'mount').length, 1, 'precondition: the throwing mount ran')
    assert.equal(calls(log, PROBE.id, 'mount').length, 1, 'a throwing section stopped another section')
    disposers.get(PROBE.throwing)()
    await page.close()
    await page.disposePlugin(PROBE.id)
    assert.equal(calls(log, PROBE.throwing, 'unmount').length, 0, 'unmount ran for a mount that threw')
    assertAtMostOncePerMount(log, PROBE.id)
  })
  integrationCase(sdk, 'K3 settings sections', 'unmount reopen', 'close then reopen → a second mount; its own unmount at the next close (once per mount, not once per section)', async (t) => {
    const { host } = await ready()
    const log = []
    const { plugin } = probePlugin([probeSection(PROBE.id, log)])
    const page = await openSettingsPage(t, { sdk, child: await admitChild(host), plugins: [plugin] })
    await page.waitFor(PROBE.marker)
    await page.close()
    await page.reopen()
    await page.waitFor(PROBE.marker)
    await page.close()
    assert.equal(calls(log, PROBE.id, 'mount').length, 2)
    assert.equal(calls(log, PROBE.id, 'unmount').length, 2)
    assertAtMostOncePerMount(log, PROBE.id)
  })

  // ============================================================== PLAT-EP-07 row 5 (REL-PACK): stays failing, allow-listed there.
  caseTest(sdk, 'PLAT-EP-07', 5, 'every importer\'s tarball carries a real fishball-shared copy (P-1 mechanism B)', null, LATER.relPack)
  caseTest(sdk, 'HOST-ST-01', 10, 'Running → uninstall → Removed, the export offered first', null, LATER.uninstall)
}
