/**
 * Vocabulary of fishball-core's child-plugins area: DESIGN.md §28, core's part that core's own patch
 * decides (R1: which of fishball-child-plugins / fishball-recommend-plugins runs, by mode). Ported from
 * test/v3/fishball-core/child-plugins/constants.mjs; the R2–R5 rows (the rows' client in DSH's Plugins
 * page) run fishball-ui's files and are integration rows. Row ids are the ones core's patch inserts and
 * the instance's child-side row id (§28: inserted only by the instance's launch overlay).
 */
export const ROWS = Object.freeze({
  child: 'fishball-child-plugins',
  recommend: 'fishball-recommend-plugins',
  /** The instance's child-side row: inserted only by the instance's launch overlay (§28). */
  instanceChild: 'dsh-instance-child',
  /** An unrelated row an overlay may insert. */
  other: 'fbtest-overlay-row',
  /** Ids next to the child-side id that are not it (BVA near misses). */
  nearMisses: Object.freeze(['dsh-instance', 'dsh-instance-child-extra', 'xdsh-instance-child', 'DSH-INSTANCE-CHILD']),
  /** A module name for overlay rows (never loaded: the rows only compose). */
  moduleName: 'fbtest-overlay-module',
})

/** Scratch overlay files under the OS temp folder (removed after each case). */
export const SCRATCH = Object.freeze({ prefix: 'fbtest-child-plugins-', overlayFile: 'launch-overlay.yml', empty: '[]\n', insertHead: '- insert:\n' })
