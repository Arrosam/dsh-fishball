import path from 'node:path'

/**
 * Vocabulary for F-OWN-SCHEMA, the fishball-core side (moved from dsh-connector with the
 * fishball-core split, 6b7c53bf; design §1.0b row 1, R-ARCH-10). The real-connector comparisons
 * moved to dsh-connector with the connector; its K1/K2/K3 suites own them. Only core's own folder is
 * read here: the other Fishball-side packages' import rule is each package's own (or an integration
 * row), never a check one package's tests make of another's folder.
 */
export const OWN = Object.freeze({
  core: path.join(import.meta.dirname, '..', '..'),
  manifest: 'package.json',
  /** Core's runtime code (the tests folder and the nested fishball-ui package are not core's code). */
  sourceDirs: Object.freeze(['src', 'contracts', 'client.js', 'client.settings.js']),
  source: /\.(?:[cm]?js|tsx?|vue)$/,
  dsh: /^(?:dsh-agent-connector|dsh-connector(?:-ui|-adapter|-shared)?|dsh-instance)(?:\/|$)/,
  imports: /(?:\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g,
  manifestSections: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies']),
  vendor: 'vendor',
  generator: 'scripts/vendor-mcp-schema.mjs',
  /** F-OWN-SCHEMA removed the vendored copy's package export and its packed folder. */
  schemaExport: './mcp-schema',
  vendorEntry: /^\.?\/?vendor(?:\/|$)/,
})
