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
 * - it is hidden from the browser gateway, so the browser's `pluginManager` stays DSH's.
 * Callers pass `enabled: false`, so DSH's bundle selection step never runs.
 */
import PluginManager from '@deepseek-ai/dsh-plugin-manager'
import { FISHBALL_PACKAGES, OPTIONAL_SERVICE, SERVICE } from './constants.js'

/** The diagnostic code of a manager that did not start in time. */
const MANAGER_START_TIMEOUT = 'manager-start-timeout'

/**
 * The settings DSH's running manager resolved from the profile (its registries, pnpm command and
 * time limits), copied onto Fishball's so both install the same way (review L2). They are read
 * from the live service, so `!!js` values in its loader entry are already evaluated.
 */
const INHERITED_SETTINGS = Object.freeze(['configuredRegistries', 'pnpmCommand', 'outputBytes', 'lockWaitMs', 'inspectTimeoutMs', 'githubConnectionTimeoutMs', 'idleTimeoutMs'])

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
 * @returns Promise of the mounted manager (a cordis service proxy); rejects when it does not
 *   start within FISHBALL_PACKAGES.managerStartMs or its plugin fails (review M4).
 */
export function mountFishballPluginManager(ctx, facts) {
  const dsh = ctx.get(SERVICE.pluginManager)
  class Inheriting extends FishballPluginManager {
    constructor(scope, config) {
      super(scope, config)
      for (const key of INHERITED_SETTINGS) if (dsh?.[key] !== undefined) this[key] = dsh[key]
    }
  }
  const scope = ctx.isolate(SERVICE.pluginManager).extend({ [OPTIONAL_SERVICE.profileContext]: facts })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error(MANAGER_START_TIMEOUT), { code: MANAGER_START_TIMEOUT })), FISHBALL_PACKAGES.managerStartMs)
    const settle = (finish) => (value) => { clearTimeout(timer); finish(value) }
    Promise.resolve(scope.plugin(Inheriting, PluginManager.Config({}))).catch(settle(reject))
    scope.inject([SERVICE.pluginManager], (inner) => settle(resolve)(inner[SERVICE.pluginManager]))
  })
}
