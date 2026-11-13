/**
 * The one seam through which core's link reads K1's frozen `./mcp-schema` (design §9.1).
 *
 * It re-exports core's vendored copy, so neither a standalone install nor the repository needs the
 * connector package at runtime. `scripts/vendor-mcp-schema.mjs` regenerates `vendor/` from the
 * connector's source; never edit the copy by hand. Every link module imports K1 through here.
 */
export * from '../../vendor/mcp-schema/index.js'
