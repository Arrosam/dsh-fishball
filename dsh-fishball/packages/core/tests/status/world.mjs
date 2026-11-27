/**
 * One world per case: a real Cordis `Context` of the current DSH (its event bus, service
 * registry and logger), with DSH's host services provided as the fakes in fakes.mjs, and core's
 * status created over the fake ports (subject.mjs). Every warning the status logs is captured
 * through the SDK's own logger exporter. `t.after` closes the status and disposes the context.
 */
import { importDsh } from 'fishball-test-helpers/dsh'
import { until } from 'fishball-test-helpers/wait'
import { HOST, TARGETS_SNAPSHOT, WAIT } from './constants.mjs'
import { FakeAppReady, FakeLoader, FakePluginManager, FakeTargets } from './fakes.mjs'
import { makeStatus, openStatus, statusModule } from './subject.mjs'

const CORDIS = 'cordis'
const PLUGIN_NAME = 'fbtest-status-row'
let cordisModule
const cordis = () => (cordisModule ??= importDsh(CORDIS))

/** Mark for an absent port or service in the options below. */
export const ABSENT = Symbol('absent')

/**
 * MULTI-1 (relayed seam 2026-11-18): `createStatus(ctx, {targets: {list, onChange}, brand})`;
 * the snapshot is `{fishball, set, targets, brand}`. The scalar link / target / connect / bridge
 * ports are withdrawn: per-target words live in each TargetView (core's `stripLine`, pure).
 * @param {object} o
 *   targets     a TargetsSnapshot (default {version: 1, targets: []}), or ABSENT
 *   ready       app ready already (default false)
 *   bundles     BundleInfo[] for the plugin manager, or ABSENT (no pluginManager service)
 *   entries     loader entries, or ABSENT (no loader service)
 *   plugin      create the status inside a Cordis plugin's apply, on that plugin's context, as a
 *               row does (default false: on the root context); `w.fiber` is that plugin's fiber
 *   brand       LOGO-BUTTON: core's stored logo theme getter (`() => value`), or ABSENT to model a
 *               stored field that is absent (the status reads the default)
 */
export async function worldFor(t, o = {}) {
  const { Context } = await cordis()
  const ctx = new Context()
  const logs = []
  ctx.logger.exporter({ levels: { default: HOST.allLevels }, export: (m) => logs.push({ name: m.name, type: m.type, text: m.args.map(String).join(' ') }) })

  const appReady = new FakeAppReady(o.ready ?? false)
  const pluginManager = o.bundles === ABSENT ? undefined : new FakePluginManager(o.bundles ?? [])
  const loader = o.entries === ABSENT ? undefined : new FakeLoader(o.entries ?? [])
  ctx.provide(HOST.appReady, appReady)
  if (pluginManager) ctx.provide(HOST.pluginManager, pluginManager)
  if (loader) ctx.provide(HOST.loader, loader)

  const present = (value) => value !== ABSENT
  const targets = present(o.targets ?? null) ? new FakeTargets(o.targets ?? TARGETS_SNAPSHOT.empty) : undefined
  const brand = present('brand' in o ? o.brand : ABSENT) ? (typeof o.brand === 'function' ? o.brand : () => o.brand) : undefined
  const ports = {
    ...(targets ? { targets } : {}),
    ...(brand ? { brand } : {}),
  }

  let status
  let fiber
  if (o.plugin) {
    const mod = await statusModule()
    fiber = ctx.plugin({ name: PLUGIN_NAME, apply(own) { status = makeStatus(mod, own, ports) } })
    await fiber.await()
  } else {
    status = await openStatus(ctx, ports)
  }
  const emitted = []
  status.onChange((snapshot) => { emitted.push(snapshot) })
  let closed = false
  const close = () => { if (!closed) { closed = true; status.close() } }
  t.after(() => { close(); ctx.fiber.dispose() })

  return {
    ctx, status, ports, targets, appReady, pluginManager, loader, logs, emitted, fiber,
    close,
    /** Another status over the same ports models a recompose after the stored brand changes. */
    async recompose() {
      const again = await openStatus(ctx, ports)
      t.after(() => again.close())
      return again
    },
    snapshot: () => status.snapshot(),
    ready() { appReady.fire() },
    changed() { ctx.emit(HOST.changed, { reason: HOST.changeReason }) },
    /** Waits until `predicate(snapshot)` holds; returns the last snapshot. */
    async until(predicate) {
      await until(() => predicate(status.snapshot()), WAIT.untilMs, WAIT.pollMs)
      return status.snapshot()
    },
  }
}

/** Lets pending promise jobs and timers of the status run (a bounded number of macrotask turns). */
export async function settle() {
  for (let i = 0; i < WAIT.settleTicks; i++) await new Promise((resolve) => setImmediate(resolve))
}
