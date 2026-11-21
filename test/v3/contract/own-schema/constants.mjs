import path from 'node:path'
import { REPO } from '../../../support/constants.mjs'

/**
 * Vocabulary for F-OWN-SCHEMA, the fishball-core side (moved here from dsh-connector with the
 * fishball-core split, 6b7c53bf). The real-connector comparisons moved to dsh-connector with the
 * connector; its K1/K2/K3 suites own them.
 */
export const OWN = Object.freeze({
  core: path.join(REPO, 'packages/core'),
  /**
   * The Fishball-side packages that must not import a DSH-side package. Since the amenities split
   * (the user, 2026-11-21) every amenity is its own package with its own manifest, and
   * fishball-amenities is their umbrella.
   */
  packages: Object.freeze([
    Object.freeze({ dir: 'core', manifest: true }),
    Object.freeze({ dir: 'fishball-board', manifest: true }),
    Object.freeze({ dir: 'fishball-heartbeat', manifest: true }),
    Object.freeze({ dir: 'fishball-taskboard', manifest: true }),
    Object.freeze({ dir: 'fishball-amenities', manifest: true }),
    Object.freeze({ dir: 'shared', manifest: true }),
  ]),
  source: /\.(?:[cm]?js|tsx?|vue)$/,
  dsh: /^(?:dsh-agent-connector|dsh-connector(?:-ui|-adapter|-shared)?|dsh-instance)(?:\/|$)/,
  imports: /(?:\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g,
  v2: /^(?:src\/slim\/|src\/persona\.js$)/,
  contract: 'dsh-connector/contract',
  vendor: 'vendor',
  generator: 'scripts/vendor-mcp-schema.mjs',
})
