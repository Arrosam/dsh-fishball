/**
 * Who is calling the contribution service (R-EXT-03; spike V3-S5 `8f2788e` I1–I7, Q1).
 *
 * - The caller is the context the service was reached through (the traced `this.ctx`, I1).
 * - The contributor is that context's **loader entry**. Its package name gives the namespace.
 *   `fiber.name` is never used, because a plugin declares it itself (I2).
 * - The entry's root fiber is the contributor's lifetime: the fiber that disable, uninstall,
 *   restart and HMR end. An inject sub-scope or `ctx.plugin` child carries the same `fiber.entry`,
 *   so it resolves to the same contributor (I3).
 *
 * The namespace is attribution only, not a security boundary (S5-Q5 decided A).
 */
import fs from 'node:fs'
import { findPackageJSON } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NAMESPACE, namespaceOf } from '../../tools/index.js'
import { HOST, SPECIFIER } from './constants.js'

/** Whether a fiber is loading or active (S5 Q4); a disposed fiber has no uid. */
export const isLive = (fiber) => fiber !== undefined && fiber !== null && fiber.uid !== null && HOST.liveFiberStates.includes(fiber.state)

/** `name` or `@scope/name` of a bare specifier, dropping any subpath. */
function bareName(specifier) {
  const parts = specifier.split(NAMESPACE.scopeSeparator)
  const segments = specifier.startsWith(NAMESPACE.scopePrefix) ? SPECIFIER.scopedSegments : SPECIFIER.plainSegments
  return parts.slice(0, segments).join(NAMESPACE.scopeSeparator)
}

const isPathSpecifier = (specifier) => specifier.startsWith(SPECIFIER.relativePrefix) || specifier.startsWith(SPECIFIER.absolutePrefix) || specifier.startsWith(SPECIFIER.fileScheme)

/** A parsed manifest object, or undefined. */
function readManifest(file) {
  const manifest = JSON.parse(fs.readFileSync(file, SPECIFIER.manifestEncoding))
  return manifest !== null && typeof manifest === 'object' ? manifest : undefined
}

/**
 * The nearest manifest at or above `file` that has a `name`, and is named `expected` when that is
 * given. A dual build often ships a nested, nameless `dist/package.json` (`{"type": "module"}`)
 * that is not the package's own manifest, so the walk goes on past it.
 */
function namedManifestFrom(file, expected) {
  let current = file
  while (current !== undefined) {
    const manifest = readManifest(current)
    if (typeof manifest?.name === 'string' && (expected === undefined || manifest.name === expected)) return manifest
    const parentDir = path.dirname(path.dirname(current))
    if (parentDir === path.dirname(current)) return undefined
    current = findPackageJSON(pathToFileURL(path.join(parentDir, SPECIFIER.probeFile)).href)
  }
  return undefined
}

/** The URL of a path specifier: absolute paths as file URLs, others against the tree's base. */
const pathUrl = (specifier, baseUrl) => (specifier.startsWith(SPECIFIER.absolutePrefix) ? pathToFileURL(specifier) : new URL(specifier, baseUrl ?? undefined)).href

/**
 * The manifest Node resolves for `specifier` from `baseUrl`, or undefined. For a bare specifier it
 * must carry that package's name (`expected`).
 */
function manifestOf(specifier, baseUrl, expected) {
  try {
    const file = isPathSpecifier(specifier) ? findPackageJSON(pathUrl(specifier, baseUrl)) : findPackageJSON(specifier, baseUrl)
    return file === undefined ? undefined : namedManifestFrom(file, expected)
  } catch {
    // Unresolvable from here (a package the loader found by its own means, or a missing file).
    return undefined
  }
}

/**
 * The package `{name, version}` of a loader entry's module specifier:
 * - a `cordis:` builtin has none;
 * - a bare specifier is its own package name (S5 I3), and its version comes from the manifest it
 *   resolves to, if one is found;
 * - a path row's package is the nearest `package.json`, resolved against the entry tree's
 *   `baseUrl` as the loader does.
 */
function packageOf(specifier, baseUrl) {
  if (typeof specifier !== 'string' || specifier.startsWith(SPECIFIER.builtinPrefix)) return undefined
  const bare = isPathSpecifier(specifier) ? undefined : bareName(specifier)
  const manifest = manifestOf(specifier, baseUrl, bare)
  const name = bare ?? manifest?.name
  if (typeof name !== 'string') return undefined
  const version = typeof manifest?.version === 'string' ? manifest.version : SPECIFIER.noVersion
  return { name, version }
}

/** The entry's root fiber: walk up while the parent fiber belongs to the same loader entry. */
function rootFiberOf(fiber, entry) {
  let root = fiber
  while (root.parent?.fiber !== undefined && root.parent.fiber !== root && root.parent.fiber.entry === entry) root = root.parent.fiber
  return root
}

/**
 * The contributor behind a caller context, or undefined when it cannot be traced to a package
 * (no loader entry, a `cordis:` builtin, a package-less file, or a name with nothing left after
 * normalisation): the caller is then `contributor-unidentified`.
 * @param {object | undefined} ctx the traced use-site context
 * @returns {{pkg: string, version: string, namespace: string, ctx: object, fiber: object, root: object} | undefined}
 */
export function contributorOf(ctx) {
  try {
    const fiber = ctx?.fiber
    const entry = fiber?.entry
    if (entry === undefined || entry === null) return undefined
    const found = packageOf(entry.options?.name, entry.parent?.tree?.ctx?.baseUrl)
    const namespace = namespaceOf(found?.name)
    if (namespace === undefined) return undefined
    return { pkg: found.name, version: found.version, namespace, ctx, fiber, root: rootFiberOf(fiber, entry) }
  } catch {
    // A context that is not a Cordis context is no contributor.
    return undefined
  }
}
