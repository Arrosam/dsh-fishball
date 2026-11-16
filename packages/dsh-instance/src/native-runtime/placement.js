import { mkdir, lstat, readdir, readFile, rename, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { inside } from 'dsh-connector-shared/files'
import { RUNTIME, PLACEMENT, fail } from './constants.js'
import { exists, jsonPrivate, writePrivate, writeProfileBundles, sameBundles } from './files.js'

/**
 * The child's copies of the plugin set and its libraries (I-PLACE;
 * constants.js PLACEMENT says where they go and why). Everything here reads source packages as
 * files: no module of the set is ever imported by the host (R-BND-01).
 */

/** dsh-instance's package root, the anchor of every source below. */
const INSTANCE_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const posix = (file) => file.split(path.sep).join(path.posix.sep)
const json = async (file) => JSON.parse(await readFile(file, 'utf8'))

/** An owned real directory, created private when missing. pnpm may have created it with its own mode. */
async function ownedDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: RUNTIME.privateDirectoryMode })
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid()) fail(PLACEMENT.code.unsafeDirectory)
}

/** Copy one source file, bytes unchanged; a link is refused, so nothing outside the source is read. */
async function copyFile(source, target) {
  const info = await lstat(source)
  if (info.isSymbolicLink() || !info.isFile()) fail(PLACEMENT.code.unsafe)
  await ownedDirectory(path.dirname(target))
  await writePrivate(target, await readFile(source), true)
}

/** Every regular file under `directory`, as paths relative to `root`; a link is refused. */
async function treeFiles(root, directory) {
  const info = await lstat(directory)
  if (info.isSymbolicLink()) fail(PLACEMENT.code.unsafe)
  if (!info.isDirectory()) return [path.relative(root, directory)]
  const files = []
  for (const entry of await readdir(directory)) files.push(...await treeFiles(root, path.join(directory, entry)))
  return files
}

/**
 * The files a package ships: its manifest and exactly its `files` entries (Q-21), so the child's
 * copy cannot drift from the package (core's `contracts/constants.js`, `vendor/` and
 * `client.settings.js` come with core because core lists them). A listed entry that is missing
 * means a broken source and is refused, naming the package.
 * @returns {Promise<string[]>} paths relative to `root`.
 */
export async function shippedFiles(root, manifest) {
  const files = [PLACEMENT.manifest]
  for (const entry of manifest.files ?? []) {
    const relative = entry.replace(/\/+$/, '')
    const parent = path.join(root, path.dirname(relative))
    const base = path.basename(relative)
    const names = base.includes(PLACEMENT.wildcard)
      ? (await readdir(parent)).filter((name) => wildcard(base).test(name))
      : [base]
    for (const name of names) {
      const file = path.join(parent, name)
      if (!inside(root, file) || !await exists(file)) fail(PLACEMENT.code.missing, manifest.name)
      files.push(...await treeFiles(root, file))
    }
  }
  return [...new Set(files)]
}

/** A `files` wildcard segment as a whole-name pattern. */
function wildcard(segment) {
  const escaped = segment.split(PLACEMENT.wildcard).map((part) => part.replace(PLACEMENT.regexSpecial, PLACEMENT.regexEscape))
  return new RegExp('^' + escaped.join(PLACEMENT.wildcardPattern) + '$')
}

/**
 * The relative-import closure of `entries` (paths relative to `root`): each module and every module
 * it reaches through a relative static import, so a copy holds exactly the code its rows run.
 * Bare imports are left to the child's node_modules (the placed libraries).
 * @returns {Promise<string[]>} paths relative to `root`.
 */
export async function moduleClosure(root, entries) {
  const seen = new Set()
  const queue = [...entries]
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    if (seen.has(next)) continue
    seen.add(next)
    const file = path.join(root, next)
    if (!next.endsWith(PLACEMENT.script)) continue
    const source = await readFile(file, 'utf8')
    for (const [, specifier] of source.matchAll(PLACEMENT.specifiers)) {
      const target = path.resolve(path.dirname(file), specifier)
      if (!inside(root, target) || !await exists(target)) fail(PLACEMENT.code.missing, posix(next))
      queue.push(path.relative(root, target))
    }
  }
  return [...seen]
}

/** Write `files` (relative to `sourceRoot`) and `manifest` as one package directory `target`. */
async function writePackage(sourceRoot, files, manifest, target) {
  await mkdir(target, { mode: RUNTIME.privateDirectoryMode })
  for (const file of files) if (file !== PLACEMENT.manifest) await copyFile(path.join(sourceRoot, file), path.join(target, file))
  await writePrivate(path.join(target, PLACEMENT.manifest), manifest, true)
}

/**
 * Remove what an interrupted earlier replaceSlot of `name` left beside its slot
 * (`<name>.placing-*`, `<name>.previous-*`): full copies with a set member's manifest, which pnpm
 * and the preflight would otherwise scan forever. Only this user's own entries are removed; a link
 * is removed itself, never followed.
 */
async function removeLeftovers(parent, name) {
  const prefixes = [PLACEMENT.temporaryInfix, PLACEMENT.retiredInfix].map((infix) => name + infix)
  for (const entry of await readdir(parent)) {
    if (!prefixes.some((prefix) => entry.startsWith(prefix))) continue
    const info = await lstat(path.join(parent, entry))
    if (info.uid === process.getuid()) await rm(path.join(parent, entry), { recursive: true, force: true })
  }
}

/**
 * Replace `<parent>/<name>` with a fresh copy, built beside it and swapped in by rename: the slot
 * holds the old copy or the new one, and is empty only between the two renames. A previous slot may
 * be a real directory or a pnpm link; the link itself is moved aside and removed, never what it
 * points to.
 */
async function replaceSlot(parent, name, populate) {
  await ownedDirectory(parent)
  await removeLeftovers(parent, name)
  const target = path.join(parent, name)
  const temporary = target + PLACEMENT.temporaryInfix + randomUUID()
  const retired = target + PLACEMENT.retiredInfix + randomUUID()
  try {
    await populate(temporary)
    const previous = await exists(target)
    if (previous && previous.uid !== process.getuid()) fail(PLACEMENT.code.unsafeDirectory)
    if (previous) await rename(target, retired)
    try { await rename(temporary, target) } catch (error) { if (previous) await rename(retired, target); throw error }
    if (previous) await rm(retired, { recursive: true })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

/**
 * A set member's source: the packed `bundled/<directory>` (REL-PACK output, Q-22), else the
 * checkout's sibling workspace folder, as copyChildCode read core before I-PLACE. A packed
 * `bundled/` wins, so a checkout where a pack once ran reads that output until it is removed. A
 * folder counts only when its manifest names the member: an installed instance without `bundled/`
 * sits in a node_modules whose siblings are unrelated packages (npm has `core` and `board`).
 */
async function memberSource(bundle) {
  for (const root of [path.join(INSTANCE_ROOT, PLACEMENT.packed, bundle.directory), path.join(INSTANCE_ROOT, PLACEMENT.parent, bundle.directory)]) {
    const file = path.join(root, PLACEMENT.manifest)
    if (!(await exists(file))?.isFile()) continue
    const manifest = await json(file)
    if (manifest.name === bundle.name) return { root, files: await shippedFiles(root, manifest), manifest }
  }
  fail(PLACEMENT.code.missing, bundle.name)
}

/** One library package as its shipped files (Q-21), from its folder `root`. */
async function libraryPackage(name, root) {
  const manifest = await json(path.join(root, PLACEMENT.manifest))
  return { name, root, files: await shippedFiles(root, manifest), manifest }
}

/**
 * The folder of package `name` as a module beside `anchor` (a manifest path) resolves it. Needs the
 * package to export `./package.json`, as both libraries and the connector do.
 */
const packageRoot = (anchor, name) => path.dirname(createRequire(anchor).resolve(name + '/' + PLACEMENT.manifest))

/**
 * A placed bundle's own libraries: the names in its `bundleDependencies`, each resolved from the
 * bundle's folder, as the bundle's modules resolve it (fishball-core's fishball-shared). They come
 * from the bundle's dependency graph, never the instance's, because the instance depends on no
 * Fishball-side package (requirements 1.40, design §1.0b row 5); they are copied as files only.
 * Resolution walks up past the bundle's folder, so a copy found there must be the exact version the
 * bundle pins; a missing or different one refuses the start like a missing member.
 */
async function bundledLibraries(member) {
  const anchor = path.join(member.root, PLACEMENT.manifest)
  return Promise.all((member.manifest[PLACEMENT.bundledField] ?? []).map(async (name) => {
    let library
    try { library = await libraryPackage(name, packageRoot(anchor, name)) } catch (error) {
      if (error?.code === PLACEMENT.unresolved) fail(PLACEMENT.code.missing, name)
      throw error
    }
    if (library.manifest.version !== member.manifest.dependencies?.[name]) fail(PLACEMENT.code.missing, name)
    return library
  }))
}

/**
 * The libraries the instance's own placed lifecycle code imports by name (PLACEMENT.shared,
 * PLACEMENT.contract), resolved through the instance's dependency graph.
 */
async function librarySources() {
  const anchor = path.join(INSTANCE_ROOT, PLACEMENT.manifest)
  const contract = PLACEMENT.contract
  const connectorRoot = packageRoot(anchor, contract.name)
  const connector = await json(path.join(connectorRoot, PLACEMENT.manifest))
  const entry = connector.exports[contract.export]
  return [
    await libraryPackage(PLACEMENT.shared, packageRoot(anchor, PLACEMENT.shared)),
    {
      name: contract.name,
      root: connectorRoot,
      files: await moduleClosure(connectorRoot, [path.normalize(entry)]),
      manifest: { name: connector.name, version: connector.version, private: true, type: connector.type, exports: { [contract.export]: entry } },
    },
  ]
}

/**
 * One source per library name, the first found: a library two bundles both bundle (each at the
 * version it pins) is placed once. The two sides' libraries have different names (R-ARCH-08), so
 * no bundle's library can take the slot of the instance's own.
 */
function distinctLibraries(libraries) {
  const byName = new Map()
  for (const library of libraries) if (!byName.has(library.name)) byName.set(library.name, library)
  return [...byName.values()]
}

/**
 * The placement record (3a): the names whose first placement is done. A damaged record refuses the
 * start with a typed code; deleting the file is a safe repair, because every placed name is also a
 * declared dependency of the profile, which keeps its on/off state the same way.
 */
async function readRecord(file) {
  if (!await exists(file)) return new Set()
  let record
  try { record = await jsonPrivate(file) } catch (error) { if (error instanceof SyntaxError) fail(PLACEMENT.code.record); throw error }
  if (record?.format !== PLACEMENT.recordFormat || !Array.isArray(record.placed) || record.placed.some((name) => typeof name !== 'string')) fail(PLACEMENT.code.record)
  return new Set(record.placed)
}

/**
 * Place the set and its libraries into the child profile, before it
 * loads (design §8.1). Every start refreshes each copy from the running instance's sources, then
 * writes `dsh.profile.bundles`:
 * - a bundle is switched on at its first placement only: a name the record holds, or one the
 *   profile already declares as a dependency (a V2 profile's hand-installed copy, design §10),
 *   keeps the state the owner gave it, so a disable survives and a copy deleted while off returns
 *   off (R-BND-02);
 * - every other bundle keeps its place, and the placed ones follow in PLACEMENT.bundles order:
 *   board, fishball-ui, then fishball-core last (R-FB-12; fishball-ui's guard rows hold in any
 *   order, core's need it last). fishball-ui and core both bundle fishball-shared; it is placed once.
 * Copies come first and the manifest and record after, so a failed copy changes no selection.
 * @param paths - the runtime layout (files.js pathsFor).
 * @param boot - the installation's dsh-app-boot module (readProfileManifest, writeProfileBundles).
 */
export async function placeBundles(paths, boot) {
  const members = await Promise.all(PLACEMENT.bundles.map(async (bundle) => ({ name: bundle.name, ...await memberSource(bundle) })))
  const libraries = [...(await Promise.all(members.map(bundledLibraries))).flat(), ...await librarySources()]
  const sources = [...members, ...distinctLibraries(libraries)]
  for (const source of sources) {
    for (const parent of [PLACEMENT.vendor, PLACEMENT.modules]) {
      await replaceSlot(path.join(paths.profile, parent), source.name, (target) => writePackage(source.root, source.files, source.manifest, target))
    }
  }
  const recordFile = path.join(paths.profile, PLACEMENT.record)
  const placed = await readRecord(recordFile)
  const manifest = boot.readProfileManifest(RUNTIME.profileName, paths.profile)
  const declared = manifest.dependencies ?? {}
  const current = manifest.dsh?.profile?.bundles ?? []
  const names = PLACEMENT.bundles.map((bundle) => bundle.name)
  const enabled = names.filter((name) => current.includes(name) || !(placed.has(name) || Object.hasOwn(declared, name)))
  const bundles = [...current.filter((name) => !names.includes(name)), ...enabled]
  const dependencies = { ...declared, ...Object.fromEntries(sources.map((source) => [source.name, PLACEMENT.dependency(source.name)])) }
  const unchanged = sameBundles(current, bundles) && sources.every((source) => declared[source.name] === dependencies[source.name])
  if (!unchanged) await writeProfileBundles(boot, paths.profile, { ...manifest, dependencies }, bundles)
  if (names.some((name) => !placed.has(name))) await writePrivate(recordFile, { format: PLACEMENT.recordFormat, placed: names })
}

/**
 * The instance's lifecycle code for one child, in the profile (RUNTIME.snapshot and the
 * modules they reach), as copyChildCode always wrote it: exclusive, under the instance id.
 * @returns {Promise<string>} the lifecycle row's module path.
 */
export async function snapshotLifecycle(destination) {
  const { lifecycle, entries } = RUNTIME.snapshot
  for (const file of await moduleClosure(INSTANCE_ROOT, [lifecycle, ...entries])) await copyFile(path.join(INSTANCE_ROOT, file), path.join(destination, file))
  return path.join(destination, lifecycle)
}
