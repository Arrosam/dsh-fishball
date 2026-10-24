/**
 * Private-tree row ids (DESIGN §4 "The private tree"). Every row a catalog plugin mounts in
 * Fishball's private tree gets the id prefix of its plugin, so rows of different plugins
 * never collide, and the row that registered a tool names its plugin (src/plugin-catalog.js).
 *
 * The prefix ends in a double separator; a slug never contains one, so no plugin's prefix
 * is a prefix of another plugin's row ids.
 */
const PREFIX = Object.freeze({ builtin: 'fb-', fishballOnly: 'fbo-' })
const SEPARATOR = '-'
const BOUNDARY = '--'
/** The end of a private-tree row-id prefix (ctx.fishball strips it for a stable source identity). */
export const ROW_PREFIX_BOUNDARY = BOUNDARY

/** Two rows of one plugin map to the same private-tree id (review M9). */
export class RowIdConflictError extends Error {}

/** Lowercase letters and digits joined by single separators. */
export const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, SEPARATOR).replace(/^-+|-+$/g, '')

/** Row-id prefix of one catalog plugin's rows. */
export const builtinPrefix = (name) => PREFIX.builtin + slug(name) + BOUNDARY
export const fishballOnlyPrefix = (bundleName) => PREFIX.fishballOnly + slug(bundleName) + BOUNDARY

/**
 * Detached rows with every id (group children included) under `prefix`.
 * @throws RowIdConflictError when two rows map to the same id (e.g. two id-less rows of one
 *   module, or ids that differ only in punctuation), so only that plugin is refused instead
 *   of the whole tree update failing.
 */
export function prefixRows(rows, prefix, seen = new Set()) {
  return rows.map((row) => {
    const id = prefix + slug(row.id ?? row.name)
    if (seen.has(id)) throw new RowIdConflictError(id)
    seen.add(id)
    return {
      ...structuredClone(row),
      id,
      ...(row.group && Array.isArray(row.config) ? { config: prefixRows(row.config, prefix, seen) } : {}),
    }
  })
}
