/**
 * Fixed names of this package's DSH world (data only; the child imports it before DSH starts).
 * Product values from core's published contracts and fishball-shared's ui-seam, by the names they publish.
 */
export const NAMES = Object.freeze({
  core: 'fishball-core', ui: 'fishball-ui', shared: 'fishball-shared', board: 'fishball-board',
  instance: 'fishballInstance', status: 'fishballStatus',
  profileContext: 'profileContext',
  /** Set on a boot whose profile has core switched off (the world's ready then waits for DSH alone). */
  coreOffEnv: 'FBTEST_CU_CORE_OFF', settings: 'settings',
  budget: Object.freeze({ readyMs: 60000, pollMs: 100 }),
})

/** Native model tools in the standard Fishball manager preset (excluding Fishball's own). */
export const NATIVE_MANAGER_TOOLS = Object.freeze(['read', 'read_image', 'working_directory'])
