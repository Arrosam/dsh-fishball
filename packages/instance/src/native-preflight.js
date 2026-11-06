import { lstat, realpath, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

export const PREFLIGHT = Object.freeze({
  maxEntries: 20000,
  maxManifestBytes: 1024 * 1024,
  runtimeParts: ['fishball', 'runtime'],
  nodeModules: 'node_modules',
  git: '.git',
  manifest: 'package.json',
  corePackages: ['@deepseek-ai/cordis', '@deepseek-ai/schemastery'],
  corePrefix: '@deepseek-ai/dsh-',
})

export class NativePreflightError extends Error {
  constructor(code, message) { super(message); this.name = 'NativePreflightError'; this.code = code }
}
const fail = (code, message) => { throw new NativePreflightError(code, message) }
const isCore = name => typeof name === 'string' && (name.startsWith(PREFLIGHT.corePrefix) || PREFLIGHT.corePackages.includes(name))
export const within = (root, candidate) => {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}
async function stat(file) {
  try { return await lstat(file) } catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
function absolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) fail('PREFLIGHT_PATH', 'Preflight paths must be absolute.')
  return path.resolve(value)
}
async function canonical(file) {
  absolute(file)
  const info = await stat(file)
  if (!info) fail('PREFLIGHT_PATH', 'Preflight requires initialized paths: ' + file)
  return realpath(file)
}
async function assertOwnedPath(root, candidate) {
  candidate = absolute(candidate)
  if (!within(root, candidate)) fail('PREFLIGHT_CONTAINMENT', 'Path leaves attached runtime: ' + candidate)
  let current = root
  for (const part of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const info = await stat(current)
    if (!info || info.isSymbolicLink() || !info.isDirectory()) fail('PREFLIGHT_CONTAINMENT', 'Missing, symlinked or non-directory private path: ' + current)
  }
  if (await realpath(candidate) !== candidate) fail('PREFLIGHT_CONTAINMENT', 'Private paths must be canonical.')
}
async function inspectAncestors(start, privateRoot, installRoot, scanRoots) {
  for (let current = start; ; current = path.dirname(current)) {
    const git = await stat(path.join(current, PREFLIGHT.git))
    if (git && !within(privateRoot, current)) fail('PREFLIGHT_GIT_ANCESTOR', 'External Git ancestor can redirect instruction/skill discovery: ' + current)
    const modules = path.join(current, PREFLIGHT.nodeModules)
    if (await stat(modules)) {
      const target = await realpath(modules)
      if (within(privateRoot, target)) scanRoots.add(target)
      if (!within(privateRoot, target) && !within(installRoot, target)) fail('PREFLIGHT_NODE_ANCESTOR', 'External Node fallback directory is reachable: ' + modules)
    }
    if (path.dirname(current) === current) break
  }
}

/** Pure filesystem/package metadata inspection; never imports profile plugins or follows their code. */
export async function preflight({ mainHome, runtimeRoot, workspace, mainWorkspaces = [], installRoot, profileDir, resolution }) {
  const main = await canonical(mainHome)
  const root = await canonical(runtimeRoot)
  const install = await canonical(installRoot)
  const expected = path.join(main, ...PREFLIGHT.runtimeParts)
  if (absolute(runtimeRoot) !== expected || root !== expected) fail('PREFLIGHT_CONTAINMENT', 'Runtime must be the canonical attached fishball/runtime directory.')
  await assertOwnedPath(main, expected)
  await assertOwnedPath(root, workspace)
  await assertOwnedPath(root, profileDir)
  if (within(main, install) || within(install, main)) fail('PREFLIGHT_INSTALL', 'Immutable installation and main home must not overlap.')
  const warnings = []
  for (const candidate of mainWorkspaces) {
    const opened = await canonical(candidate)
    if (within(opened, root) || within(root, opened)) warnings.push({ code: 'NESTED_WORKSPACE_VISIBLE', path: opened, message: 'This workspace exposes the attached runtime to filename discovery and explicit file access; it is not a security boundary.' })
  }
  const scanRoots = new Set()
  await inspectAncestors(workspace, root, install, scanRoots)
  await inspectAncestors(profileDir, root, install, scanRoots)
  // The installation graph is the authoritative reserved-core identity table. Physical
  // profile copies win before loader mappings, so check both inventory and disk.
  const reserved = new Map()
  for (const entry of resolution?.entries ?? []) {
    const target = await canonical(entry.packageDir)
    if (entry.scope === 'installation') {
      if (!within(install, target)) fail('PREFLIGHT_RESOLUTION', 'Installation entry escapes its selected installation: ' + entry.name)
      if (isCore(entry.name)) reserved.set(entry.name, target)
    } else {
      if (!within(root, target) && !within(install, target)) fail('PREFLIGHT_RESOLUTION', 'Profile dependency resolves outside attached home or installation: ' + entry.name)
      if (!within(install, target) && isCore(entry.name)) fail('PREFLIGHT_CORE_SHADOW', 'Private dependency shadows DSH core identity: ' + entry.name)
    }
  }
  for (const link of resolution?.linkedRoots ?? []) {
    const target = await canonical(link.realPath)
    if (!within(root, target) && !within(install, target)) fail('PREFLIGHT_LINK', 'Linked plugin has an external ancestor chain: ' + link.name)
    if (within(root, target)) {
      scanRoots.add(target)
      await inspectAncestors(target, root, install, scanRoots)
    }
  }
  const visited = new Set()
  let count = 0
  async function inspectTree(directory) {
    const target = await realpath(directory)
    const parent = path.dirname(directory)
    const slot = path.basename(parent).startsWith('@') && path.basename(path.dirname(parent)) === PREFLIGHT.nodeModules
      ? path.basename(parent) + '/' + path.basename(directory)
      : path.basename(parent) === PREFLIGHT.nodeModules ? path.basename(directory) : undefined
    // Node resolves the physical package slot even when an alias lies about manifest.name.
    if (isCore(slot) && reserved.get(slot) !== target) fail('PREFLIGHT_CORE_SHADOW', 'Private package slot shadows core identity: ' + slot)
    if (within(install, target)) return
    if (!within(root, target)) fail('PREFLIGHT_LINK', 'Private dependency link escapes its runtime: ' + directory)
    if (visited.has(target)) return
    visited.add(target)
    const entries = await readdir(target, { withFileTypes: true })
    count += entries.length
    if (count > PREFLIGHT.maxEntries) fail('PREFLIGHT_LIMIT', 'Dependency tree exceeds bounded preflight inspection; launch refused.')
    for (const entry of entries) {
      // Preserve the logical Node lookup path through symlinked scope containers.
      const file = path.join(directory, entry.name)
      if (entry.name === PREFLIGHT.manifest && entry.isSymbolicLink()) fail('PREFLIGHT_MANIFEST', 'Symlinked package identity is not supported: ' + file)
      if (entry.isDirectory() || entry.isSymbolicLink()) {
        const real = await realpath(file)
        if (!within(root, real) && !within(install, real)) fail('PREFLIGHT_LINK', 'External dependency link: ' + file)
        const info = await stat(real)
        if (info?.isDirectory()) await inspectTree(file)
      } else if (entry.name === PREFLIGHT.manifest) {
        const info = await stat(file)
        if (info.size > PREFLIGHT.maxManifestBytes) fail('PREFLIGHT_LIMIT', 'Package manifest too large: ' + file)
        let manifest
        try { manifest = JSON.parse(await readFile(file, 'utf8')) } catch { fail('PREFLIGHT_MANIFEST', 'Invalid package manifest: ' + file) }
        const selected = reserved.get(manifest.name)
        if (isCore(manifest.name) || (selected && selected !== target)) fail('PREFLIGHT_CORE_SHADOW', 'Private dependency shadows installation identity: ' + manifest.name)
      }
    }
  }
  for (const directory of scanRoots) await inspectTree(directory)
  return { warnings }
}
