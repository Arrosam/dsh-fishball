/**
 * TEST-SPEED step 1, from test-speed-measure.md's CONN-TOOLS and MULTI-2 selections.
 * Decision table: one changed path per row (package prose, contract prose, handler implementation,
 * or shared schema data). Assert only audited edges, not the complete suite list or a timing target.
 */
const SUITE = Object.freeze({
  packageBoundaries: 'contract.package-boundaries',
  releasePack: 'release.pack',
  k1: 'contract.k1-mcp-schema',
  coreDrift: 'contract.own-schema',
  toolDispatch: 'dsh-connector.mcp-tools',
  uiDraw: 'dsh-connector-ui.draw',
  uiWire: 'dsh-connector-ui.wire',
})

const PACKED_DOC_CHECKS = Object.freeze([SUITE.packageBoundaries, SUITE.releasePack])
const DRAW_RUNTIME = Object.freeze([SUITE.uiDraw, SUITE.uiWire])
const row = (path, includes, excludes = []) => Object.freeze({ path, includes: Object.freeze(includes), excludes: Object.freeze(excludes) })

export const AFFECTED_CASES = Object.freeze([
  // Packed README checks still matter; the layout browser and legacy client rows don't read it.
  row('packages/dsh-connector/README.md', PACKED_DOC_CHECKS, ['dsh-connector-ui.layout', 'v2.connector-ui']),
  // K3a asserts the README's contract rows; host and placement use runtime files, not this prose.
  row('packages/core/contracts/README.md', ['contract.k3a-core-seams'], ['dsh-instance.host', 'dsh-instance.placement', 'dsh-instance.placement-install']),
  // The actual Markdown readers remain selected without starting UI worlds on contract prose.
  row('packages/dsh-connector/mcp-schema/README.md', [SUITE.k1, 'contract.k1d-amendments', ...PACKED_DOC_CHECKS], DRAW_RUNTIME),
  row('packages/dsh-connector/tools/README.md', ['contract.k2-tools', ...PACKED_DOC_CHECKS], DRAW_RUNTIME),
  // The handler change must still reach real listing/dispatch, cross-package drift and booted MCP.
  row('packages/dsh-connector/src/mcp/tools/handlers.js', [SUITE.toolDispatch, SUITE.coreDrift, 'dsh-connector.wire', 'dsh-connector.interactions']),
  // Schema constants aren't merely tool descriptors: real runtime modules and fixtures use them.
  row('packages/dsh-connector/mcp-schema/constants.js', [SUITE.k1, SUITE.toolDispatch, SUITE.coreDrift,
    'dsh-connector.tokens', 'dsh-connector.routing', 'dsh-connector.revocation', 'fishball-core.events']),
])
