/**
 * Fixed names of this package's DSH world (data only; the child imports it before DSH starts).
 * Product values from core's published contracts (GUARDS.services: the K3 service name).
 */
export const NAMES = Object.freeze({
  core: 'fishball-core', ui: 'fishball-ui', shared: 'fishball-shared',
  /** core's K3 service: the world is ready once core's main row provides it. */
  instance: 'fishballInstance',
})
