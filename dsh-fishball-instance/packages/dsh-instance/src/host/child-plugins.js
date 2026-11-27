/**
 * The child's plugins, managed from the main DSH (design §28, 2026-11-20; revision 10a's
 * FishballPluginManager, spike S31). Only the main DSH runs pnpm on the child profile, so the
 * child's installs share the main process's pnpm store with the set install (placement.js
 * installPackedSet) and pnpm no longer refuses a second store (`ERR_PNPM_UNEXPECTED_STORE`).
 *
 * DSH's Host `PluginManager` is mounted, on first use, for the CHILD profile in an isolated
 * scope, so inspect, install and cancel run DSH's own process unchanged there (registry plan and
 * fallbacks, progress events with a request id, build-script approval, the version and
 * not-a-bundle checks). The subclass differs only in this:
 * - `publishAndReload` does nothing: DSH would reload its running profile; the child is not this
 *   process's profile and is restarted instead;
 * - it is hidden from the browser gateway (`typertRemote`), so the browser's `pluginManager` stays
 *   DSH's own; the instance serves its own routes (child-plugin-routes.js);
 * - it takes the main manager's registries and pnpm command, and reads its package-operation
 *   bounds live, so a change on DSH's page reaches the next child install.
 * Installs pass `enabled: false`; this module then writes the child's bundle list (files.js
 * writeProfileBundles, which keeps a backup) and restarts the child.
 *
 * Uninstall does not call DSH's `removeBundle`: in this scope it would reconcile the MAIN
 * profile through the main HMR and refuse `bundle-in-use` while the main DSH runs the same rows
 * (lead, 2026-11-20, Q3). For a package the child profile declares it first runs `pnpm remove`
 * with DSH's own runner, naming the registry the package came from as DSH's removal does, and only
 * then drops the name from the child's bundle list, so a failed removal changes nothing.
 *
 * A change made while the instance is switched off is still written, but the child is not
 * restarted; the answer then says `applied: 'next-start'` (else `'restarting'`).
 *
 * Not kept from revision 10a's folder installer (the child profile is a real DSH profile, so
 * DSH's own checks apply as they are): its `file:` copy of local folders, its own-copy bundle
 * check and its prune of a refused install's node_modules (DSH restores package.json and the
 * lockfile only; downloaded files can stay, as for DSH's own installs).
 */
import path from 'node:path'
import { existsSync } from 'node:fs'
import { CHILD_OWN_BUNDLES, REFUSAL, RUNTIME } from '../native-runtime/constants.js'
import { pathsFor, writeProfileBundles } from '../native-runtime/files.js'
import { hostModule } from '../native-runtime/placement.js'

export const CHILD_PLUGINS = Object.freeze({
  module: Object.freeze({ manager: '@deepseek-ai/dsh-plugin-manager', operations: '@deepseek-ai/dsh-plugin-manager/operations', boot: '@deepseek-ai/dsh-app-boot', atomicWrite: '@deepseek-ai/dsh-atomic-write' }),
  service: Object.freeze({ pluginManager: 'pluginManager', profileContext: 'profileContext', connection: 'connection' }),
  /**
   * The settings DSH's running manager resolved from the profile, copied onto the child's so both
   * install the same way; read from the live service, so `!!js` loader values are evaluated.
   */
  inherited: Object.freeze(['configuredRegistries', 'pnpmCommand', 'githubConnectionTimeoutMs']),
  /** One package operation's bounds: DSH's own manager settings, read live at each use. */
  bounds: Object.freeze(['outputBytes', 'idleTimeoutMs', 'lockWaitMs', 'inspectTimeoutMs']),
  /** Revision 10a's start bound: a manager that does not start within it is an operation error, tried again next time. */
  startMs: 30000,
  /** DSH's install outcomes that installed the package (ChangeResult.application). */
  installed: Object.freeze(['applied', 'restart-required']),
  cancelled: 'cancelled',
  /** DSH's classification of a run pnpm stopped for script approval (packageResult.kind). */
  buildBlocked: 'build-blocked',
  /** BundleInfo.availability of a copy the installation ships. */
  shipped: 'installation',
  /** DSH's cancelInstall answer; an install still waiting for the manager is dropped before it reaches DSH. */
  cancel: Object.freeze({ cancelled: 'cancelled' }),
  remove: 'remove',
  registryOption: '--config.registry=',
  execution: 'service',
  /** When a successful change takes effect: the child restarts now, or at its next start (instance off). */
  applied: Object.freeze({ restarting: 'restarting', nextStart: 'next-start' }),
  /** Refusal codes of this module; DSH's own ManagementError codes pass through as they are. */
  code: Object.freeze({
    busy: 'busy', notReady: REFUSAL.notReady, protected: 'protected', unknown: 'unknown-bundle',
    notOfficial: 'not-official', alreadyInFishball: 'already-in-fishball', operation: 'operation-error',
    removeFailed: 'remove-failed', startTimeout: 'manager-start-timeout',
  }),
  log: Object.freeze({ mount: 'child plugin manager did not start (%s)', failed: 'child plugin %s failed (%s)' }),
})
const C = CHILD_PLUGINS
const OWN = new Set(CHILD_OWN_BUNDLES)

const refusal = (code, extra = {}) => ({ ok: false, code, ...extra })
const codeOf = (error) => (typeof error?.code === 'string' ? error.code : C.code.operation)

/**
 * The child profile as DSH's manager sees a profile. Facts only DSH's own profile has are cleared
 * or point into the child (`startedBundles`, `overlays`, `patchPath`), so nothing reaches the main
 * profile's files; the installation and its pnpm are the main DSH's.
 * @param main - the main row's profileContext.
 */
export function childProfileFacts(main) {
  const paths = pathsFor(main.home)
  return Object.freeze({
    name: RUNTIME.profileName, dir: paths.profile, patchPath: path.join(paths.profile, 'cordis.patch.yml'),
    installAnchor: main.installAnchor, cwd: paths.profile, home: paths.home,
    ...(main.packageManager === undefined ? {} : { packageManager: main.packageManager }),
    startedBundles: Object.freeze([]), overlays: Object.freeze([]), telemetryDisabledEnv: undefined,
  })
}

/**
 * Mount DSH's manager for the child profile.
 * @param ctx - the dsh-instance row's context (DSH's pluginManager is read for its settings).
 * @param facts - childProfileFacts().
 * @returns Promise of the mounted manager; rejects when it does not start within C.startMs.
 */
async function mountManager(ctx, facts) {
  const { PluginManager } = await hostModule(facts, C.module.manager)
  const dsh = () => ctx.get(C.service.pluginManager)
  const defaults = PluginManager.Config({})
  /** DSH's current bound, or its default when DSH's manager offers no number. */
  const bound = (key) => (Number.isFinite(dsh()?.[key]) ? dsh()[key] : defaults[key])
  class ChildPluginManager extends PluginManager {
    constructor(scope, config) {
      super(scope, config)
      // DSH's gateway serves every service carrying this binding; the instance has its own routes.
      this.typertRemote = undefined
      for (const key of C.inherited) if (dsh()?.[key] !== undefined) this[key] = dsh()[key]
      // DSH's class declares these as fields, so they are own properties: replaced by live reads.
      for (const key of C.bounds) Object.defineProperty(this, key, { get: () => bound(key), configurable: true })
    }

    /** Nothing to reload: the child profile is never this process's profile; the child restarts instead. */
    async publishAndReload() {
      return { warnings: [] }
    }
  }
  // `connection` is isolated too: DSH's manager registers the exact Fetch route
  // /api/plugin-manager/detail-file in its constructor, which DSH's own manager already holds, and
  // a second register throws "already registered". Without it the child manager serves no detail
  // images; nothing else it runs reads `connection`.
  const scope = ctx.isolate(C.service.pluginManager).isolate(C.service.connection).extend({ [C.service.profileContext]: facts })
  return new Promise((resolve, reject) => {
    // The fiber is kept so a manager that did not start in time, or whose plugin failed, is
    // disposed rather than left running beside the next attempt's.
    const fiber = scope.plugin(ChildPluginManager, defaults)
    const fail = (error) => { clearTimeout(timer); void Promise.resolve(fiber.dispose()).catch(() => {}); reject(error) }
    const timer = setTimeout(() => fail(Object.assign(new Error(C.code.startTimeout), { code: C.code.startTimeout })), C.startMs)
    Promise.resolve(fiber).catch(fail)
    scope.inject([C.service.pluginManager], (inner) => { clearTimeout(timer); resolve(inner[C.service.pluginManager]) })
  })
}

/**
 * The child's plugin operations for the Fishball tab's routes.
 * @param options.ctx - the dsh-instance row's context.
 * @param options.restart - () => Promise: restart the child (queued behind the row's starts and
 *   stops); not awaited by the operations, so an answer never waits for the child's start.
 * @param options.enabled - () => boolean: whether the instance is switched on, read synchronously
 *   so an answer can say when the change applies without awaiting the restart.
 * @param options.warn - (format, value...) logger.
 */
export function createChildPlugins({ ctx, restart, enabled, warn }) {
  const facts = childProfileFacts(ctx.profileContext)
  let manager
  /**
   * The one package operation allowed at a time (Q2): install, use or uninstall. It stays set
   * until the child's restart that operation queued has settled, so no second pnpm run overlaps
   * the child's start and Restart on the settings page is refused meanwhile.
   */
  let running = false
  /** The restart the current operation queued (applyChange), or undefined. */
  let restarting
  /** Install request ids waiting for the manager to mount, and those cancelled meanwhile. */
  const waiting = new Set()
  const cancelled = new Set()

  /** Whether the child profile exists yet (the child's first start creates it). */
  const profileReady = () => existsSync(path.join(facts.dir, RUNTIME.profile.manifest))

  /** The manager, mounted on first use; a failed mount is forgotten so the next use tries again. */
  function requireManager() {
    manager ??= mountManager(ctx, facts).catch((error) => {
      manager = undefined
      warn(C.log.mount, codeOf(error))
      throw Object.assign(new Error(C.code.operation), { code: C.code.operation })
    })
    return manager
  }

  /** Run one package operation, refusing while another runs or before the child profile exists. */
  async function exclusive(task) {
    if (running) return refusal(C.code.busy)
    if (!profileReady()) return refusal(C.code.notReady)
    running = true
    try { return await task() } catch (error) { return refusal(codeOf(error)) } finally {
      const queued = restarting
      restarting = undefined
      if (queued === undefined) running = false
      else void queued.finally(() => { running = false })
    }
  }

  /**
   * The child's bundle list with `change` applied, written with a backup; unchanged lists are not
   * written. Under DSH's own profile lock (dsh-atomic-write `withFileLock` on the profile's
   * package.json, the lock runPluginCommand and the manager's changes take), so it never
   * interleaves with a pnpm run on the child profile; it waits as long as those do (lockWaitMs).
   */
  async function writeBundles(change) {
    const [boot, { withFileLock }, live] = await Promise.all([hostModule(facts, C.module.boot), hostModule(facts, C.module.atomicWrite), requireManager()])
    await withFileLock(path.join(facts.dir, RUNTIME.profile.manifest), async () => {
      const manifest = boot.readProfileManifest(RUNTIME.profileName, facts.dir)
      const current = manifest.dsh?.profile?.bundles ?? []
      const next = change(current)
      if (next.length !== current.length || next.some((name, index) => name !== current[index])) await writeProfileBundles(boot, facts.dir, manifest, next)
    }, { waitMs: live.lockWaitMs })
  }
  // Appended: placement.js puts the Fishball set back last at the start the restart runs (R-FB-12).
  const addBundle = (name) => writeBundles((current) => (current.includes(name) ? current : [...current, name]))
  const dropBundle = (name) => writeBundles((current) => current.filter((other) => other !== name))
  /**
   * Apply a written change: restart the child when the instance is on; otherwise it is read at the
   * next start (a restart would be refused with instance-disabled).
   * @returns the answer's `applied` value.
   */
  const applyChange = () => {
    if (!enabled()) return C.applied.nextStart
    restarting = Promise.resolve().then(restart).catch(() => {})
    return C.applied.restarting
  }

  /** The child's bundles as DSH's manager lists them. */
  async function bundles() {
    return (await requireManager()).listBundles()
  }

  /** The bundle named `name` in the child's list, or undefined. */
  const bundleNamed = async (name) => (await bundles()).find((bundle) => bundle.name === name)

  /** pnpm remove in the child profile, with DSH's runner and the main manager's bounds. */
  async function removePackage(name) {
    const live = await requireManager()
    const { runPluginCommand } = await hostModule(facts, C.module.operations)
    const registry = live.installedFrom.has(name) ? live.installedFrom.get(name) : live.configuredRegistries.registry
    const pnpm = facts.packageManager ?? { command: live.pnpmCommand }
    const result = await runPluginCommand(
      { profile: facts.name, dir: facts.dir, installAnchor: facts.installAnchor, cwd: facts.cwd, home: facts.home },
      [C.remove, name, ...(typeof registry === 'string' ? [C.registryOption + registry] : [])],
      {
        ...pnpm, execution: C.execution, activateNewBundles: false,
        // DSH's own manager passes inspectTimeoutMs to its runner as lookupTimeoutMs.
        outputBytes: live.outputBytes, idleTimeoutMs: live.idleTimeoutMs, lockWaitMs: live.lockWaitMs, lookupTimeoutMs: live.inspectTimeoutMs,
        // The manager's own lifetime signal (a private field of DSH's class, aborted when its
        // scope is disposed), as its own pnpm runs take it: the row stopping ends this run too.
        ...(live.abort?.signal === undefined ? {} : { signal: live.abort.signal }),
      },
    )
    if (result.exitCode !== 0 || result.timedOut === true) {
      warn(C.log.failed, C.remove, result.exitCode)
      throw Object.assign(new Error(C.code.removeFailed), { code: C.code.removeFailed })
    }
    live.installedFrom.delete(name)
  }

  return Object.freeze({
    /** Whether a package operation, or the restart it queued, runs (the settings page's Restart is refused then). */
    busy: () => running,

    /**
     * The child's own plugins: every bundle it installed or switched on, without the bundles the
     * instance owns (CHILD_OWN_BUNDLES), which come as `protected` so the browser keeps no copy.
     * @returns {{ok: true, bundles: {name, version?, description?, enabled, installed, official, availability}[], protected: string[]} | {ok: false, code}}
     */
    async list() {
      if (!profileReady()) return refusal(C.code.notReady)
      try {
        const listed = (await bundles()).filter((bundle) => !OWN.has(bundle.name) && (bundle.installed || bundle.enabled))
        return {
          ok: true,
          bundles: listed.map(({ name, version, description, enabled, installed, official, availability }) => ({ name, version, description, enabled, installed, official, availability })),
          protected: [...CHILD_OWN_BUNDLES],
        }
      } catch (error) { return refusal(codeOf(error)) }
    },

    /** DSH's inspection of a spec in the child's scope. @returns {{ok: true, inspection} | {ok: false, code}} */
    async inspect(spec) {
      if (!profileReady()) return refusal(C.code.notReady)
      try { return { ok: true, inspection: await (await requireManager()).inspect(spec) } } catch (error) { return refusal(codeOf(error)) }
    },

    /**
     * Install one bundle into the child profile, add it to the child's bundle list and apply the change (applyChange).
     * @returns {{ok: true, name, version, applied: 'restarting' | 'next-start'} | {ok: false, code, pendingBuilds?}}
     */
    install({ spec, requestId, approvedBuilds }) {
      return exclusive(async () => {
        waiting.add(requestId)
        let live
        let dropped
        try {
          live = await requireManager()
        } finally {
          // Settled either way (a failed mount included): the id is neither waiting nor cancelled any more.
          waiting.delete(requestId)
          dropped = cancelled.delete(requestId)
        }
        if (dropped) return refusal(C.cancelled)
        const result = await live.installBundle(spec, { enabled: false, requestId, ...(approvedBuilds === undefined ? {} : { approvedBuilds }) })
        if (result.application === C.cancelled) return refusal(C.cancelled)
        if (!C.installed.includes(result.application)) {
          // Only a run pnpm stopped for scripts is build-blocked; DSH lists every undecided build in the profile.
          if (result.packageResult?.kind === C.buildBlocked) return refusal(C.buildBlocked, { pendingBuilds: result.pendingBuilds ?? [] })
          warn(C.log.failed, C.module.manager, result.error?.code ?? result.application)
          return refusal(result.error?.code ?? C.code.operation)
        }
        await addBundle(result.bundle)
        return { ok: true, name: result.bundle, version: result.version ?? null, applied: applyChange() }
      })
    },

    /** Cancel an install. @returns {{ok: true, outcome: 'cancelled' | 'too-late' | 'not-running'} | {ok: false, code}} */
    async cancel(requestId) {
      if (waiting.has(requestId)) { cancelled.add(requestId); return { ok: true, outcome: C.cancel.cancelled } }
      try { return { ok: true, outcome: (await (await requireManager()).cancelInstall(requestId)).status } } catch (error) { return refusal(codeOf(error)) }
    },

    /**
     * Use an official bundle the installation ships: add it to the child's bundle list, no pnpm run.
     * @returns {{ok: true, name, applied: 'restarting' | 'next-start'} | {ok: false, code}}
     */
    use(name) {
      return exclusive(async () => {
        if (OWN.has(name)) return refusal(C.code.protected)
        const bundle = await bundleNamed(name)
        if (bundle === undefined || bundle.availability !== C.shipped || !(bundle.official || bundle.optional)) return refusal(C.code.notOfficial)
        if (bundle.enabled) return refusal(C.code.alreadyInFishball)
        await addBundle(name)
        return { ok: true, name, applied: applyChange() }
      })
    },

    /**
     * Enable or disable an installed bundle in the child profile (toggling its presence in
     * `dsh.profile.bundles` without running pnpm), then apply the change (applyChange).
     * Note: for a shipped optional bundle (`installed: false, availability: 'installation'`),
     * disabling removes it from `dsh.profile.bundles` so it is no longer listed as enabled.
     * @returns {{ok: true, name, enabled: boolean, applied: 'restarting' | 'next-start'} | {ok: false, code}}
     */
    setEnabled(name, nextEnabled) {
      return exclusive(async () => {
        if (OWN.has(name)) return refusal(C.code.protected)
        const bundle = await bundleNamed(name)
        if (bundle === undefined || !(bundle.installed || bundle.enabled)) return refusal(C.code.unknown)
        if (Boolean(bundle.enabled) === nextEnabled) return { ok: true, name, enabled: nextEnabled, applied: C.applied.nextStart }
        if (nextEnabled) await addBundle(name)
        else await dropBundle(name)
        return { ok: true, name, enabled: nextEnabled, applied: applyChange() }
      })
    },

    /**
     * Remove a bundle from the child: `pnpm remove` first for a package the child profile declares
     * itself, then off its bundle list; then apply the change (applyChange).
     * @returns {{ok: true, name, applied: 'restarting' | 'next-start'} | {ok: false, code}}
     */
    uninstall(name) {
      return exclusive(async () => {
        if (OWN.has(name)) return refusal(C.code.protected)
        const bundle = await bundleNamed(name)
        if (bundle === undefined || !(bundle.installed || bundle.enabled)) return refusal(C.code.unknown)
        // pnpm first: a failed removal answers remove-failed and leaves the list as it was. An
        // installation-owned copy is never removed by pnpm; dropping it from the list is all.
        if (bundle.installed && bundle.availability !== C.shipped) await removePackage(name)
        await dropBundle(name)
        return { ok: true, name, applied: applyChange() }
      })
    },
  })
}
