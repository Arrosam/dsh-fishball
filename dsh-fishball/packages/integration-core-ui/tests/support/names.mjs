/**
 * Fixed names of this package's DSH world (data only; the child imports it before DSH starts).
 * Product values from core's published contracts and fishball-shared's ui-seam, by the names they publish.
 */
export const NAMES = Object.freeze({
  core: 'fishball-core', ui: 'fishball-ui', shared: 'fishball-shared', board: 'fishball-board',
  instance: 'fishballInstance', status: 'fishballStatus', uiGuards: 'fishballUiGuards',
  profileContext: 'profileContext',
  /** Set on a boot whose profile has core switched off (the world's ready then waits for DSH alone). */
  coreOffEnv: 'FBTEST_CU_CORE_OFF', settings: 'settings',
  budget: Object.freeze({ readyMs: 60000, pollMs: 100 }),
})
