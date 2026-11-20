/**
 * K3a-TARGET (E-FIX-1 B1, P0): the hosted child's target is visible through DSH's `settings`
 * service, which is the only way core reads it.
 *
 * Level: integration. Each case builds, in-process and on the SDK of its test file, a real cordis
 * Context with the real Loader, the real root Include (dsh-app-boot `mountRootInclude`, as DSH's
 * boot mounts the profile), the real `configEditor` and the real `settings` (SettingsForms) over a
 * scratch profile. The instance's child-side row is a row of that profile's root config, loaded by
 * the Loader from `packages/dsh-instance/child-row.js` bound to the same SDK (`?fbsdk=`). Only the
 * services the row injects and a bare composition lacks are faked, and only so its fiber activates
 * (settings-target-constants.mjs FAKE_SERVICES). No DSH process, child or port is started.
 *
 * Cases (each names its row and partition):
 * - row 1, EP over the configured target: typical URL / blank. describe() lists the row's entry
 *   and core's read gives the URL, or "no target" for the blank one.
 * - row 2, static: the row's Config declares `targetUrl` volatile (DSH lists only volatile forms).
 * - row 3, state transition: a reader that reads once at its own start (before the row is active)
 *   and re-reads on `settings/document-updated` sees undefined first, then the URL once the row is
 *   active, with nobody else calling describe(). Two ways in: a late service, a later enable.
 * B1 row 4 (autoGenerate) was withdrawn by the implementer (2026-11-17): not asserted either way.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { importInstance, importSdk } from '../../../private-skills/support/sdk.mjs'
import { HARNESS, SKILL_SDK } from '../../../private-skills/support/constants.mjs'
import { REPO } from '../../../support/constants.mjs'
import { until } from '../../../support/util.mjs'
import { canonicalTmp, cleanups } from '../../shared/dsh-host/subject.mjs'
import { caseTest } from '../package-boundaries/cases.mjs'
import { HOSTED } from './constants.mjs'
import { ACTIVATION, CHILD_ROW_FILE, FAKE_SERVICES, NO_TARGET, PROFILE, SETTINGS_DSH as DSH, SETTLE, TARGETS, TRANSITION_TARGET } from './settings-target-constants.mjs'

const { row: ROW, field: FIELD } = HOSTED.targetSetting
const INSTANCE_DIR = path.join(REPO, 'packages', 'dsh-instance')

/** Core's own read of the target, exactly as the requirement states it. */
const coreRead = (settings) => settings.describe().find((e) => e.ns === ROW)?.value?.[FIELD]
const entryOf = (settings) => settings.describe().find((e) => e.ns === ROW)

/** The child row's module URL, tagged so its `@deepseek-ai/*` imports bind to `sdk`. */
function childRowUrl(sdk) {
  const url = new URL(pathToFileURL(path.join(INSTANCE_DIR, CHILD_ROW_FILE)).href)
  url.searchParams.set(HARNESS.versionTag, sdk)
  return url.href
}

/**
 * A service that accepts any member call and answers a no-op disposer: the child row's parts
 * subscribe (`onCredentialTransport`), register (`webServer.register`) and publish
 * (`nativeRuntime.publishWeb`), and each must merely return. `then` stays undefined so the fake
 * is never mistaken for a promise.
 */
function fakeService(members = {}) {
  const disposer = () => () => {}
  return new Proxy(members, { get: (target, key) => (key in target ? target[key] : key === 'then' ? undefined : disposer) })
}

/** A scratch profile directory under the canonical temp dir: empty bundles, empty patch, the row in its root config. */
function scratchProfile(scope, rowOptions) {
  const base = canonicalTmp()
  const dir = fs.mkdtempSync(path.join(base, PROFILE.tempPrefix))
  scope.defer(() => {
    assert.ok(path.dirname(dir) === base && path.basename(dir).startsWith(PROFILE.tempPrefix), 'refusing to remove ' + dir)
    fs.rmSync(dir, { recursive: true, force: true })
  })
  fs.writeFileSync(path.join(dir, PROFILE.manifest), JSON.stringify({ name: PROFILE.name, dsh: { profile: { bundles: [] } } }))
  fs.writeFileSync(path.join(dir, PROFILE.patch), PROFILE.emptyPatch)
  fs.writeFileSync(path.join(dir, PROFILE.root), JSON.stringify([{ id: ROW, ...rowOptions }]))
  return dir
}

/**
 * One composition on `sdk`. Options:
 * - `targetUrl`: the row's configured target (the launch overlay's `{targetUrl}`);
 * - `disabled`: the row starts disabled (ACTIVATION.enabledLater);
 * - `nativeRuntime: false`: that service is provided only by `provideNativeRuntime()` (ACTIVATION.lateService);
 * - `reader`: a reader row is mounted before the profile: it reads core's way once at its own
 *   start and on every `settings/document-updated`, recording each value in `seen`.
 * Nothing but the reader (when present) calls describe() until the case asserts.
 */
async function compose(t, sdk, { targetUrl, disabled = false, nativeRuntime = true, reader = false }) {
  const scope = cleanups(t)
  const [{ Context }, { Loader }, { ConfigEditor }, { SettingsForms }, { mountRootInclude }] = await Promise.all(
    [DSH.cordis, DSH.loader, DSH.configEditor, DSH.settings, DSH.appBoot].map((name) => importSdk(sdk, name)))
  // Bind the row's module graph to this SDK before the Loader imports it by its tagged URL.
  await importInstance(sdk, CHILD_ROW_FILE)
  const dir = scratchProfile(scope, { name: childRowUrl(sdk), config: { [FIELD]: targetUrl }, ...(disabled ? { disabled: true } : {}) })
  const ctx = new Context()
  scope.defer(() => ctx.fiber.dispose())
  const logs = []
  ctx.logger.exporter({ levels: { default: DSH.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map(String).join(' ') }) })
  await ctx.plugin(Loader)
  ctx.provide('profileContext', {
    name: PROFILE.name, dir, patchPath: path.join(dir, PROFILE.patch),
    installAnchor: path.join(SKILL_SDK.versionsDir, sdk, DSH.installAnchor), home: dir, startedBundles: [], overlays: [],
  })
  for (const name of FAKE_SERVICES.plain) ctx.provide(name, fakeService())
  ctx.provide(FAKE_SERVICES.webServer, fakeService({ getOrigin: () => FAKE_SERVICES.origin }))
  if (nativeRuntime) ctx.provide(FAKE_SERVICES.nativeRuntime, fakeService())
  ctx.plugin(ConfigEditor)
  ctx.plugin(SettingsForms)
  const seen = []
  if (reader) {
    // Core's shape: one read at its own start, then one per settings/document-updated.
    ctx.plugin({ name: 'fbtest-target-reader', inject: ['settings'], apply(c) {
      const read = () => seen.push(coreRead(c.settings))
      read()
      c.on(DSH.documentUpdated, read)
    } })
  }
  await ctx.loader.await()
  await mountRootInclude(ctx, path.join(dir, PROFILE.root))
  await ctx.loader.await()
  const entry = () => [...ctx.loader.entries()].find((e) => e.options.id === ROW)
  return {
    ctx, logs, seen, entry,
    active: () => entry()?.fiber?.state === DSH.activeState,
    settings: () => ctx.get('settings'),
    /** ACTIVATION.lateService: the missing service arrives from another plugin. */
    async provideNativeRuntime() { ctx.plugin({ name: 'fbtest-late-native-runtime', apply: (c) => c.provide(FAKE_SERVICES.nativeRuntime, fakeService()) }); await ctx.loader.await() },
    /** ACTIVATION.enabledLater: the Loader switches the row on, as the Plugins page does. */
    async enable() { await ctx.loader.update(entry().id, { disabled: null }); await ctx.loader.await() },
  }
}

/** The row's fiber is active; otherwise the case fails with the logs that say why (a fake missing, say). */
function assertActive(w) {
  assert.ok(w.active(), `${ROW} did not become active (fiber state ${w.entry()?.fiber?.state}); logs: ${JSON.stringify(w.logs.filter((l) => l.type !== 'debug').slice(-10))}`)
}

export function registerSettingsTargetCases(sdk) {
  // ================================================================ row 1: describe() lists the target (EP)
  for (const p of TARGETS) {
    caseTest(sdk, 'K3a-TARGET', `1 ${p.partition}`, `the child row configured {${FIELD}: ${JSON.stringify(p.targetUrl)}} is listed by the real settings.describe() under ns ${ROW}, and core's read gives ${p.blank ? 'no target' : 'that URL'}`, async (t) => {
      const w = await compose(t, sdk, { targetUrl: p.targetUrl })
      assertActive(w)
      const entry = entryOf(w.settings())
      assert.ok(entry, `describe() lists no ${ROW}; it lists ${JSON.stringify(w.settings().describe().map((e) => e.ns))}`)
      if (p.blank) assert.ok(NO_TARGET.includes(entry.value?.[FIELD]), `blank target read as ${JSON.stringify(entry.value?.[FIELD])}`)
      else assert.equal(coreRead(w.settings()), p.targetUrl)
    })
  }

  // ================================================================ row 2: the schema makes the field listable (static)
  caseTest(sdk, 'K3a-TARGET', '2 static', `the child row's Config declares ${FIELD} volatile (DSH lists only volatile fields)`, async () => {
    const row = await importInstance(sdk, CHILD_ROW_FILE)
    assert.equal(row.name, ROW, 'row name')
    assert.equal(row.Config?.dict?.[FIELD]?.meta?.volatile, true, 'Config.dict.' + FIELD + '.meta: ' + JSON.stringify(row.Config?.dict?.[FIELD]?.meta))
  })

  // ================================================================ row 3: activation order (state transition)
  for (const [way, act, start] of [
    // The row waits for a service a hosted child provides later than core's row starts.
    [ACTIVATION.lateService, (w) => w.provideNativeRuntime(), { nativeRuntime: false }],
    // The row is off when the reader starts and is switched on through the Loader.
    [ACTIVATION.enabledLater, (w) => w.enable(), { disabled: true }],
  ]) {
    caseTest(sdk, 'K3a-TARGET', `3 ST ${way}`, `a reader started before ${ROW} is active sees no target, then the URL once the row is active, re-reading only on ${DSH.documentUpdated} (nobody else calls describe())`, async (t) => {
      const w = await compose(t, sdk, { targetUrl: TRANSITION_TARGET, reader: true, ...start })
      // Inactive state: the row is not active, and the reader's start-time read found no target.
      assert.equal(w.active(), false, 'the row is already active before the transition')
      assert.deepEqual(w.seen, [undefined], 'reads before the transition')
      await act(w)
      // A late service refreshes the row's fiber after loader.await() returns (cordis notify), so
      // the row is waited for, within the settle budget, before the active state is asserted.
      await until(w.active, SETTLE.budgetMs, SETTLE.pollMs)
      assertActive(w)
      // Active, settled state: the reader's latest read is the URL, with no describe() from the test.
      const settled = await until(() => w.seen.at(-1) === TRANSITION_TARGET, SETTLE.budgetMs, SETTLE.pollMs)
      assert.ok(settled, `the reader never saw the target; it read ${JSON.stringify(w.seen)}`)
      assert.equal(w.seen[0], undefined, 'the first read precedes the row')
    })
  }
}
