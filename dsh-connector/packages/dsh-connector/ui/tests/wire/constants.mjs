export { ATTR, BACKEND, EMBED, EXPECT, FIXTURE, HTTP, ROUTE, SERVICE, SLOT, TAG, TEXT, TOOL, WAIT, WINDOW } from '../draw/constants.mjs'
// Decision table: C = real UI backend stand-in, U = embed row, I = K3 fake child.
export const MATRIX = Object.freeze([
  { id: 'none', c: false, u: false, i: false },
  { id: 'C', c: true, u: false, i: false },
  { id: 'C+U', c: true, u: true, i: false },
  { id: 'C+U+I', c: true, u: true, i: true },
  { id: 'U', c: false, u: true, i: false },
  { id: 'U+I', c: false, u: true, i: true },
  { id: 'U+V2', c: false, u: true, i: false, legacy: true },
])
export const WIRE = Object.freeze({ configSlot: 'plugins.bundle.config', forbidden: /^\/api\/fishball\/(events(?:$|\/)|connector(?:$|\/))/, settings: /settings/i, versions: [0, 1, 2], usableVersion: 1, error: 'error', missingPrefix: 'connector-missing:', legacyKey: 'legacy' })
