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
 * How: DSH's own pnpm runner (`dsh-plugin-manager/operations` runPluginCommand: the profile
 * write lock, scrubbed environment, captured output, the silence bound and the DSH-version
 * compatibility check of new dependencies), DSH's spec parser, and DSH's bundle-manifest reader.
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

/** An install or removal refused with a stable PACKAGE_ERROR code. */
export class PackageError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** Direct dependencies a manifest records (name -> spec). */
const dependenciesOf = (manifest) => manifest.dependencies ?? {}

export class FishballPackages {
  #ctx
  #logger
  /** Tail of the serialized package operations. */
  #operations = Promise.resolve()

  /**
   * @param ctx - fishball row context (profileContext and pluginPackages, read when used).
   * @param logger - plugin logger (codes and package names only).
   */
  constructor(ctx, logger) {
    this.#ctx = ctx
    this.#logger = logger
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
   * Install one bundle package into the folder. A package without a DSH bundle patch is removed
   * again. Ambiguity (pnpm changed more than one dependency) is refused and undone.
   * @returns { name } of the installed package.
   * @throws PackageError(invalidSpec | alreadyInstalled | notBundle | ambiguousInstall |
   *   incompatibleVersion | operationError | noProfile).
   */
  install(spec) {
    return this.#serialized(async () => {
      const argument = this.check(spec)
      this.#ensureFolder()
      const before = this.#dependencies()
      const result = await this.#run([FISHBALL_PACKAGES.add, argument])
      if (result.incompatible !== undefined) throw new PackageError(PACKAGE_ERROR.incompatibleVersion)
      if (result.exitCode !== 0 || result.timedOut === true) {
        this.#logger.warn('Fishball package install failed (exit %s, %s)', result.exitCode, result.logPath)
        throw new PackageError(PACKAGE_ERROR.operationError)
      }
      const after = this.#dependencies()
      const changed = Object.keys(after).filter((name) => before[name] !== after[name])
      if (changed.length === 0) throw new PackageError(PACKAGE_ERROR.alreadyInstalled)
      if (changed.length > 1) {
        await this.#cleanUp(changed.filter((name) => before[name] === undefined))
        throw new PackageError(PACKAGE_ERROR.ambiguousInstall)
      }
      const [name] = changed
      if (before[name] !== undefined) {
        // pnpm replaced an installed package of the same name; keep it, but do not call it new.
        throw new PackageError(PACKAGE_ERROR.alreadyInstalled)
      }
      if (!this.#isBundle(name)) {
        await this.#cleanUp([name])
        throw new PackageError(PACKAGE_ERROR.notBundle)
      }
      return { name }
    })
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

  #dependencies() {
    return dependenciesOf(readProfileManifest(PLUGIN.name, this.dir))
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

  #remove(names) {
    return names.length === 0 ? Promise.resolve({ exitCode: 0 }) : this.#run([FISHBALL_PACKAGES.remove, ...names])
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
