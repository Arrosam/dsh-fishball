/**
 * Installing for Fishball through DSH's own install process (DESIGN §10d "Install for
 * Fishball", revision 10a, spike S31).
 *
 * `FishballPluginManager` extends DSH's Host `PluginManager`, so inspect and installBundle run
 * DSH's whole process unchanged: registry plan and fallbacks, progress events with a request id,
 * cancel, build-script approval, the version check, not-a-bundle refused and undone. It differs
 * in only these ways:
 * - it is mounted in a scope where the `pluginManager` service is isolated and `profileContext`
 *   names Fishball's package folder, so it works there and DSH's own service is untouched;
 * - `publishAndReload` does nothing: DSH would reload its running profile there, and nothing
 *   boots Fishball's folder (Fishball's catalog mounts the plugin in its private tree);
 * - it is hidden from the browser gateway, so the browser's `pluginManager` stays DSH's;
 * - its package-operation bounds are read live from DSH's own manager (packageBounds).
 * Callers pass `enabled: false`, so DSH's bundle selection step never runs.
 */
import PluginManager from '@deepseek-ai/dsh-plugin-manager'
import { OPTIONAL_SERVICE, SERVICE } from './constants.js'

/** The diagnostic code of a manager that did not start in time. */
const MANAGER_START_TIMEOUT = 'manager-start-timeout'

/**
 * The settings DSH's running manager resolved from the profile (its registries, pnpm command and
 * connection timeout), copied onto Fishball's so both install the same way (review L2). They are
 * read from the live service, so `!!js` values in its loader entry are already evaluated.
 */
const INHERITED_SETTINGS = Object.freeze(['configuredRegistries', 'pnpmCommand', 'githubConnectionTimeoutMs'])

/**
 * The bounds of one package operation (DESIGN §16): DSH's own plugin-manager settings, not
 * Fishball's limits. They are read from DSH's live manager each time they are used, so a change
 * on DSH's page reaches Fishball's next install or removal without remounting Fishball's manager.
 */
const PACKAGE_BOUNDS = Object.freeze(['outputBytes', 'idleTimeoutMs', 'lockWaitMs', 'inspectTimeoutMs'])

/** DSH's defaults for its manager's settings, from its own schema (it exports no constants). */
const DSH_DEFAULTS = PluginManager.Config({})

/**
 * DSH's current package-operation bounds; each one DSH's manager does not offer as a number
 * (no manager running, or a value it cannot give) is DSH's default.
 * @param ctx - the fishball row's context.
 * @returns { outputBytes, idleTimeoutMs, lockWaitMs, inspectTimeoutMs }.
 */
export function packageBounds(ctx) {
  const dsh = ctx.get(SERVICE.pluginManager)
  return Object.fromEntries(PACKAGE_BOUNDS.map((key) => [key, Number.isFinite(dsh?.[key]) ? dsh[key] : DSH_DEFAULTS[key]]))
}

export class FishballPluginManager extends PluginManager {
  constructor(ctx, config) {
    super(ctx, config)
    // DSH's gateway serves every service that carries this binding; Fishball has its own routes.
    this.typertRemote = undefined
  }

  /** Nothing to reload: Fishball's folder is never a running profile (S31). */
  async publishAndReload() {
    return { warnings: [] }
  }
}

/**
 * Mount the subclass for Fishball's folder. Side effects it shares with DSH's own manager, both
 * harmless (review L4): every install emits `plugin-manager/changed`, so DSH's Plugins page
 * reads its list again, and DSH runs the apply step inside its HMR queue.
 * @param ctx - the fishball row's context (DSH's pluginManager is read for its settings).
 * @param facts - profile facts naming Fishball's folder (FishballPackages.profileFacts()).
 * @param startMs - how long it may take to start (the pluginManagerStartMs limit).
 * @returns Promise of the mounted manager (a cordis service proxy); rejects when it does not
 *   start within startMs or its plugin fails (review M4).
 */
export function mountFishballPluginManager(ctx, facts, startMs) {
  const dsh = ctx.get(SERVICE.pluginManager)
  class Inheriting extends FishballPluginManager {
    constructor(scope, config) {
      super(scope, config)
      for (const key of INHERITED_SETTINGS) if (dsh?.[key] !== undefined) this[key] = dsh[key]
      // DSH's class declares these as fields, so they are own properties: replaced by live reads.
      for (const key of PACKAGE_BOUNDS) Object.defineProperty(this, key, { get: () => packageBounds(ctx)[key], configurable: true })
    }
  }
  const scope = ctx.isolate(SERVICE.pluginManager).extend({ [OPTIONAL_SERVICE.profileContext]: facts })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(MANAGER_START_TIMEOUT), { code: MANAGER_START_TIMEOUT })), startMs)
    const settle = (finish) => (value) => { clearTimeout(timer); finish(value) }
    Promise.resolve(scope.plugin(Inheriting, DSH_DEFAULTS)).catch(settle(reject))
    scope.inject([SERVICE.pluginManager], (inner) => settle(resolve)(inner[SERVICE.pluginManager]))
  })
}
