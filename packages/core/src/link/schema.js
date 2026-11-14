/**
 * The one seam through which fishball-core reads K1's frozen `./mcp-schema` (design §9.1): its
 * link, and its events module for K1's `LINK_REFUSAL`.
 *
 * It re-exports core's vendored copy, so neither a standalone install nor the repository needs the
 * connector package at runtime. `scripts/vendor-mcp-schema.mjs` regenerates `vendor/` from the
 * connector's source; never edit the copy by hand. Every core module that needs K1 imports it
 * through here.
 */
export * from '../../vendor/mcp-schema/index.js'
