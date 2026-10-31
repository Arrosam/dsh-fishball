/**
 * Fishball's own package folder (DESIGN §4 "Installed in Fishball only"): plugins Fishball
 * installs for itself alone, separate from the DSH profile. The profile's package.json,
 * lockfile and patch never change, so DSH and other sessions do not see these packages.
 *
 * Where: `<DSH profiles directory>/.fishball-plugins`, a pnpm project laid out like a profile
 * (DSH's own `initProfile`, with no bundles; nothing ever boots it). Inside the profiles
 * directory, DSH's runtime resolution gives these packages the host installation's packages as
 * peers, as it does for a profile's own plugins, but not the active profile's packages (spike S22).
 *
 * How: installs run DSH's own install process, inherited (src/fishball-plugin-manager.js,
 * revision 10a): its registry plan, progress, cancel, build-script approval and checks.
 * Removal runs DSH's own pnpm runner (`dsh-plugin-manager/operations` runPluginCommand).
 * DSH's spec parser checks every spec first.
 * A local directory is installed as a COPY (`file:`): a link would leave the package outside
 * the profiles directory, where DSH's resolution does not give it the host's peers.
 *
 * Operations are serialized; each ends with the folder's manifest as pnpm left it.
 * Limitation: Node keeps a loaded module cached, so a package removed and installed again at a
 * different version runs the code first loaded until DSH restarts (DSH's own manager documents
 * the same for packages it replaces in place).
 */
import fs from 'node:fs'
import path from 'node:path'
import { initProfile, readProfileManifest } from '@deepseek-ai/dsh-app-boot'
import { InvalidInstallSpecError, parseInstallSpec } from '@deepseek-ai/dsh-plugin-manager'
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations'
import { FISHBALL_PACKAGES, OPTIONAL_SERVICE, PACKAGE_ERROR, PLUGIN } from './constants.js'
import { diagnosticOf } from './errors.js'

/** dsh-plugin-manager's spec kinds for a local directory and a registry name. */
const PATH_SPEC = 'path'
const REGISTRY_SPEC = 'registry'

/** An install or removal refused with a stable PACKAGE_ERROR code (and, for build-blocked, the pending packages). */
export class PackageError extends Error {
  constructor(code, details) {
    super(code)
    this.code = code
    if (details !== undefined) this.details = details
  }
}

/** DSH's install outcomes that installed the package (`application`). */
const INSTALLED = new Set(['applied', 'restart-required'])
const CANCELLED = 'cancelled'
/** DSH's classification of a run pnpm stopped for script approval (`packageResult.kind`). */
const BUILD_BLOCKED_KIND = 'build-blocked'
/** DSH's cancelInstall answer for a request it never saw; Fishball answers `cancelled` for one still queued. */
const CANCEL_STATUS = Object.freeze({ cancelled: 'cancelled', notRunning: 'not-running' })
/** DSH's refusal codes Fishball reports as they are; any other failure is an operation error. */
const KNOWN_REFUSALS = new Set([PACKAGE_ERROR.invalidSpec, PACKAGE_ERROR.alreadyInstalled, PACKAGE_ERROR.notBundle, PACKAGE_ERROR.ambiguousInstall, PACKAGE_ERROR.incompatibleVersion])

/** Direct dependencies a manifest records (name -> spec). */
const dependenciesOf = (manifest) => manifest.dependencies ?? {}

export class FishballPackages {
  #ctx
  #logger
  /** Tail of the serialized package operations. */
  #operations = Promise.resolve()
  /** (facts) => Promise of a FishballPluginManager for this folder (attachManager), and its one mounting. */
  #mountManager
  #manager
  /**
   * Installs asked for but not yet handed to DSH (queued, or waiting for the manager), and those
   * cancelled meanwhile: DSH only knows a request id once installBundle runs (review M1).
   */
  #queued = new Set()
  #cancelled = new Set()

  /**
   * @param ctx - fishball row context (profileContext and pluginPackages, read when used).
   * @param logger - plugin logger (codes and package names only).
   */
  constructor(ctx, logger) {
    this.#ctx = ctx
    this.#logger = logger
  }

  /**
   * Use DSH's install process, inherited for this folder (src/fishball-plugin-manager.js). It is
   * mounted on first use, so a Fishball that never installs anything never creates the folder.
   * @param mount - (facts) => Promise<FishballPluginManager>.
   */
  attachManager(mount) {
    this.#mountManager = mount
  }

  /**
   * The folder as a profile DSH's manager can work in (created when missing), or undefined
   * outside a profile.
   */
  profileFacts() {
    const profile = this.#profile()
    if (profile === undefined) return undefined
    this.#ensureFolder()
    // DSH-only facts point into the folder or are cleared, so nothing can reach DSH's own profile files (review L3).
    return { ...profile, name: FISHBALL_PACKAGES.folder, dir: this.dir, startedBundles: [], patchPath: path.join(this.dir, FISHBALL_PACKAGES.patchFile), overlays: [] }
  }

  /** What a spec names, read by DSH's inspect, after Fishball's own checks. @throws PackageError(invalidSpec | alreadyInstalled | noProfile). */
  async inspect(spec) {
    this.check(spec)
    const manager = await this.#requireManager()
    return manager.inspect(spec)
  }

  /**
   * Cancel an install by its request id. One not yet handed to DSH is dropped before it starts;
   * otherwise DSH's answer.
   * @returns `cancelled`, `too-late` or `not-running`.
   */
  async cancel(requestId) {
    if (this.#queued.has(requestId)) {
      this.#cancelled.add(requestId)
      return CANCEL_STATUS.cancelled
    }
    const manager = await this.#requireManager()
    return (await manager.cancelInstall(requestId)).status
  }

  /** The inherited manager, mounted on first use; a failed mount is forgotten so the next use tries again (review M4). */
  #requireManager() {
    if (this.#manager === undefined) {
      const facts = this.profileFacts()
      if (facts === undefined || this.#mountManager === undefined) return Promise.reject(new PackageError(PACKAGE_ERROR.noProfile))
      this.#manager = this.#mountManager(facts).catch((error) => {
        this.#manager = undefined
        this.#logger.warn('Fishball package manager did not start (%s)', diagnosticOf(error))
        throw new PackageError(PACKAGE_ERROR.operationError)
      })
    }
    return this.#manager
  }

  /** The profile facts, or undefined outside a profile DSH launched. */
  #profile() {
    return this.#ctx.get(OPTIONAL_SERVICE.profileContext)
  }

  /** Absolute path of the folder, or undefined outside a profile. */
  get dir() {
    const profile = this.#profile()
    if (profile === undefined) return undefined
    // Profiles live at <profilesDir>/<name> (dsh-app-boot resolveProfileDir).
    const profilesDir = this.#ctx.get(OPTIONAL_SERVICE.pluginPackages)?.resolution?.profilesDir ?? path.dirname(profile.dir)
    return path.join(profilesDir, FISHBALL_PACKAGES.folder)
  }

  /**
   * The installed packages: every dependency the folder's manifest records.
   * @returns [{ name, dir }] (empty when the folder does not exist yet), or undefined when its
   *   manifest cannot be read, so callers never mistake a read failure for "nothing installed".
   */
  list() {
    const dir = this.dir
    if (dir === undefined || !fs.existsSync(path.join(dir, FISHBALL_PACKAGES.manifest))) return []
    try {
      return Object.keys(dependenciesOf(readProfileManifest(PLUGIN.name, dir))).map((name) => ({ name, dir: this.packageDir(name) }))
    } catch (error) {
      this.#logger.warn('Fishball package folder unreadable (%s)', diagnosticOf(error))
      return undefined
    }
  }

  /** Where an installed package's files are. */
  packageDir(name) {
    return path.join(this.dir, FISHBALL_PACKAGES.nodeModules, name)
  }

  /**
   * Check a spec before anything asks the user (DSH's own parser: a relative path, a blank spec
   * or a name the registry refuses is invalid).
   * @returns the spec pnpm is given. @throws PackageError(invalidSpec).
   */
  check(spec) {
    let parsed
    try {
      parsed = parseInstallSpec(spec)
    } catch (error) {
      if (error instanceof InvalidInstallSpecError) throw new PackageError(PACKAGE_ERROR.invalidSpec)
      throw error
    }
    // pnpm add replaces an installed package in place, without a bundle check, while its code may
    // run: refuse a name already installed before anyone is asked (review M1). A git or tarball
    // spec names its package only after the fetch; install() refuses that case afterwards.
    const known = this.#specName(parsed)
    if (known !== undefined && this.list()?.some((pkg) => pkg.name === known)) throw new PackageError(PACKAGE_ERROR.alreadyInstalled)
    return parsed.kind === PATH_SPEC ? FISHBALL_PACKAGES.fileProtocol + parsed.path : parsed.spec
  }

  /** The package name a parsed spec installs, when it can be known before installing. */
  #specName(parsed) {
    if (parsed.kind === REGISTRY_SPEC) return parsed.name
    if (parsed.kind !== PATH_SPEC) return undefined
    try {
      return readProfileManifest(PLUGIN.name, parsed.path).name
    } catch {
      return undefined
    }
  }

  /**
   * Install one bundle package into the folder through DSH's install process (revision 10a).
   * Fishball's own checks stay around it: the spec is checked first (a local directory becomes a
   * `file:` copy, a name already here is refused), and afterwards the package must declare a
   * bundle in Fishball's own copy (S23: DSH's lookup prefers the installation's copy of a name
   * it ships); otherwise it is removed again.
   * @param options - { requestId, approvedBuilds } passed to DSH's installBundle (progress events, script approval).
   * @returns { name, version } of the installed package.
   * @throws PackageError(invalidSpec | alreadyInstalled | notBundle | ambiguousInstall |
   *   incompatibleVersion | cancelled | buildBlocked (details: pendingBuilds) | operationError | noProfile).
   */
  install(spec, { requestId, approvedBuilds } = {}) {
    if (requestId !== undefined) this.#queued.add(requestId)
    const run = this.#serialized(async () => {
      if (requestId !== undefined && this.#cancelled.has(requestId)) throw new PackageError(PACKAGE_ERROR.cancelled)
      const argument = this.check(spec)
      const manager = await this.#requireManager()
      if (requestId !== undefined && this.#cancelled.has(requestId)) throw new PackageError(PACKAGE_ERROR.cancelled)
      // Re-created if it was deleted while DSH runs (review L5).
      this.#ensureFolder()
      // Read before: DSH's own already-installed guard needs HMR and cannot name a git or tarball
      // spec, so pnpm may replace a package already here in place (review H1).
      const before = dependenciesOf(readProfileManifest(PLUGIN.name, this.dir))
      // Handed to DSH now: from here a cancel goes to DSH, which knows the request id.
      if (requestId !== undefined) this.#queued.delete(requestId)
      // enabled: false: DSH's bundle selection never runs for a folder nothing boots.
      const result = await manager.installBundle(argument, { enabled: false, ...(requestId === undefined ? {} : { requestId }), ...(approvedBuilds === undefined ? {} : { approvedBuilds }) })
      // DSH restored the folder's files but not node_modules: a refused package is removed again (§4).
      if (!INSTALLED.has(result.application)) await this.#prune()
      if (result.application === CANCELLED) throw new PackageError(PACKAGE_ERROR.cancelled)
      if (!INSTALLED.has(result.application)) {
        // Only a run pnpm stopped for scripts is build-blocked; DSH lists every undecided build in the folder (review M2).
        if (result.packageResult?.kind === BUILD_BLOCKED_KIND) throw new PackageError(PACKAGE_ERROR.buildBlocked, { pendingBuilds: result.pendingBuilds ?? [] })
        const code = result.error?.code
        if (KNOWN_REFUSALS.has(code)) throw new PackageError(code)
        this.#logger.warn('Fishball package install failed (%s)', code ?? result.application)
        throw new PackageError(PACKAGE_ERROR.operationError)
      }
      const name = result.bundle
      // pnpm replaced a package already here: keep it, but do not call it new, and never clean it up.
      if (Object.hasOwn(before, name)) throw new PackageError(PACKAGE_ERROR.alreadyInstalled)
      if (!this.#isBundle(name)) {
        await this.#cleanUp([name])
        throw new PackageError(PACKAGE_ERROR.notBundle)
      }
      return { name, version: result.version ?? null }
    })
    // Settled either way: the id is no longer queued or cancelled.
    return run.finally(() => { this.#queued.delete(requestId); this.#cancelled.delete(requestId) })
  }

  /** Uninstall one package. @throws PackageError(operationError | noProfile). */
  remove(name) {
    return this.#serialized(async () => {
      const result = await this.#remove([name])
      if (result.exitCode !== 0 || result.timedOut === true) {
        this.#logger.warn('Fishball package removal failed (exit %s, %s)', result.exitCode, result.logPath)
        throw new PackageError(PACKAGE_ERROR.operationError)
      }
    })
  }

  /**
   * Whether the installed package declares a DSH bundle, read from Fishball's own copy. DSH's
   * bundleManifest looks in the installation first, so a name DSH also ships would be judged
   * by DSH's copy (review H3, spike S23). An unreadable manifest is not a bundle.
   */
  #isBundle(name) {
    try {
      return readProfileManifest(PLUGIN.name, this.packageDir(name))?.dsh?.bundle !== undefined
    } catch {
      return false
    }
  }

  /**
   * Undo a refused install. A failed clean-up leaves a package that is not a valid plugin in
   * the folder, so it is reported as an operation error rather than ignored (review M2).
   */
  async #cleanUp(names) {
    const result = await this.#remove(names)
    if (result.exitCode !== 0 || result.timedOut === true) {
      this.#logger.warn('Fishball package clean-up failed (exit %s, %s)', result.exitCode, result.logPath)
      throw new PackageError(PACKAGE_ERROR.operationError)
    }
  }

  /**
   * pnpm remove, naming the registry the package came from as DSH's own removal does: pnpm checks
   * lockfile tarball URLs against its default registry, and installs may come from DSH's fallback
   * registries now (review M3). Without the manager, pnpm's own registry is used.
   */
  async #remove(names) {
    if (names.length === 0) return { exitCode: 0 }
    const manager = await this.#requireManager().catch(() => undefined)
    const [name] = names
    const registry = manager === undefined ? null : manager.installedFrom.has(name) ? manager.installedFrom.get(name) : manager.configuredRegistries.registry
    return this.#run([FISHBALL_PACKAGES.remove, ...names, ...(typeof registry === 'string' ? [FISHBALL_PACKAGES.registryOption + registry] : [])])
  }

  /** Remove what a refused install left in node_modules. Best effort: the refusal is reported either way. */
  async #prune() {
    const result = await this.#run([...FISHBALL_PACKAGES.prune]).catch((error) => ({ exitCode: null, error }))
    if (result.exitCode !== 0) this.#logger.warn('Fishball package folder not tidied after a refused install (%s)', result.error === undefined ? result.exitCode : diagnosticOf(result.error))
  }

  /** Create the folder as a pnpm project if it is missing (initProfile never overwrites). @throws PackageError(noProfile). */
  #ensureFolder() {
    const dir = this.dir
    if (dir === undefined) throw new PackageError(PACKAGE_ERROR.noProfile)
    initProfile(dir, [])
  }

  /** Run one pnpm command in the folder. */
  async #run(args) {
    this.#ensureFolder()
    const profile = this.#profile()
    const dir = this.dir
    const manager = profile.packageManager
    return runPluginCommand(
      { profile: FISHBALL_PACKAGES.folder, dir, installAnchor: profile.installAnchor, cwd: profile.cwd, home: profile.home },
      args,
      {
        execution: FISHBALL_PACKAGES.execution,
        command: manager?.command ?? FISHBALL_PACKAGES.pnpmCommand,
        ...(manager?.args === undefined ? {} : { args: manager.args }),
        ...(manager?.env === undefined ? {} : { env: manager.env }),
        outputBytes: FISHBALL_PACKAGES.outputBytes,
        idleTimeoutMs: FISHBALL_PACKAGES.idleTimeoutMs,
        lockWaitMs: FISHBALL_PACKAGES.lockWaitMs,
        lookupTimeoutMs: FISHBALL_PACKAGES.lookupTimeoutMs,
        // Nothing boots this folder, so there is no bundle selection to reconcile.
        activateNewBundles: false,
      },
    )
  }

  #serialized(task) {
    const run = this.#operations.then(task)
    this.#operations = run.catch(() => {})
    return run
  }
}
