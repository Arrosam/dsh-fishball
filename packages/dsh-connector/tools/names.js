/**
 * Namespace and public-name rules (R-EXT-03, design §13.3, spike V3-S5 Q1/Q6). Pure functions:
 * how the caller's package name is found (its loader entry) is the registry's job (C-EXT); this
 * module only turns that package name into a namespace and a local name into a public one.
 */
import { NAME_GRAMMAR, NAMESPACE, REGISTER_REFUSAL } from './constants.js'
import { ToolContributionError } from './errors.js'

/**
 * The namespace of a contributor package: the package name normalised to `[a-z0-9-]`
 * (`@acme/tools` → `acme-tools`), then the one first-party alias (`dsh-connector-ui` →
 * `embed-ui`). Returns `undefined` when there is no package name or nothing of it survives
 * normalisation; the caller then refuses `contributor-unidentified`. Whether the namespace is
 * reserved or already held is the registry's check, not this function's.
 * @param {unknown} packageName the caller's loader-entry package name
 * @returns {string | undefined}
 */
export function namespaceOf(packageName) {
  if (typeof packageName !== 'string') return undefined
  const unscoped = packageName.startsWith(NAMESPACE.scopePrefix) ? packageName.slice(NAMESPACE.scopePrefix.length) : packageName
  // split/join with a frozen, non-global pattern: replaces every match without shared lastIndex.
  const normalised = unscoped
    .replace(NAMESPACE.scopeSeparator, NAMESPACE.replacement)
    .toLowerCase()
    .split(NAMESPACE.outside)
    .join(NAMESPACE.replacement)
  if (!NAMESPACE.identifying.test(normalised)) return undefined
  return NAMESPACE.aliases[normalised] ?? normalised
}

/** Whether a namespace is one no contributor may hold (`fishball`, the connector's own name). */
export const isReservedNamespace = (namespace) => NAMESPACE.reserved.includes(namespace)

/** Whether a value is a valid local tool or event name (design §13.2 grammar). */
export const isLocalName = (name) => typeof name === 'string' && NAME_GRAMMAR.local.test(name)

/**
 * The public MCP name `<namespace>.<localName>` of a tool or event, or `undefined` when the local
 * name breaks the grammar or the public name exceeds MCP's 128 characters (only a long namespace
 * can do that, as a local name has at most 48). Never throws, so `emit` can map `undefined` to
 * `event-invalid` (R-EXT-18: emit refusals are returned codes).
 * @param {string} namespace from {@link namespaceOf}
 * @param {unknown} localName
 * @returns {string | undefined}
 */
export function publicNameFor(namespace, localName) {
  if (!isLocalName(localName)) return undefined
  const publicName = namespace + NAMESPACE.separator + localName
  return publicName.length <= NAME_GRAMMAR.publicMaxChars ? publicName : undefined
}

/**
 * {@link publicNameFor} for a tool: throws `ToolContributionError('tool-invalid')` instead of
 * returning `undefined`, as `register` refuses.
 * @param {string} namespace
 * @param {unknown} localName
 * @returns {string}
 */
export function publicNameOf(namespace, localName) {
  const publicName = publicNameFor(namespace, localName)
  if (publicName === undefined) throw new ToolContributionError(REGISTER_REFUSAL.toolInvalid)
  return publicName
}
