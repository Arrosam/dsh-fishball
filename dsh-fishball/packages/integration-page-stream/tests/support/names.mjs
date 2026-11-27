/**
 * Fixed names of this package's DSH world (parent and child side; data only, the child imports it
 * before DSH starts). Product values come from DESIGN §34 and fishball-shared's published ui-seam
 * (SEAM_PAGE_STREAM), the taskboard's documented routes (docs/plugins/fishball-taskboard.md §4) and
 * core's published contracts (FISHBALL_MODEL); none from an implementation.
 */
export const NAMES = Object.freeze({
  core: 'fishball-core', ui: 'fishball-ui', taskboard: 'fishball-taskboard', shared: 'fishball-shared',
  /** core's settings namespace (its row id) and its K3 service (contracts GUARDS.services). */
  coreNamespace: 'fishball-core', instance: 'fishballInstance',
  /** DESIGN §34: the taskboard's topic name, registered while it is bound to the instance. */
  taskboardTopic: 'fishball-taskboard',
  /** fishball-taskboard's row id (its cordis.patch.yml inserts it under the package name). */
  taskboardRow: 'fishball-taskboard',
  imageModalities: Object.freeze(['text', 'image']),
  providerFailure: 'fbtest provider failure',
  budget: Object.freeze({ readyMs: 60000, pollMs: 100 }),
})
