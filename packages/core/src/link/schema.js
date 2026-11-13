/**
 * The one seam through which core's link reads K1's frozen `./mcp-schema` (design §9.1).
 *
 * In the repository it re-exports the connector's own module, reached through core's
 * `fishball-connector` peer. A standalone install must need nothing from the connector at runtime,
 * so the pack-time generator of the vendored copy (design §9.1; REL-PACK runs it) rewrites only
 * this file to point at the copy it writes into core. Every link module imports K1 through here,
 * never by the package name, so that switch touches one line.
 */
export * from 'fishball-connector/mcp-schema'
