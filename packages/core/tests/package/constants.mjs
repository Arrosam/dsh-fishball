/**
 * Vocabulary of fishball-core's package area: HOST-EP-03 rows 1 and 4, the rows that read core's
 * own published files (manifest, bundle patch, shipped source). Ported from
 * test/v3/fishball-core/package/constants.mjs; the instance-side rows (HOST-EP-03 rows 1 "no file in two
 * packages", 1 "the instance ships nothing of the moved code", 2, 4) and HOST-UC-08 (a hosted child)
 * left with dsh-instance's repository (6b7c53bf). Values come from the R-CORE requirements
 * (R-ARCH-05, R-ARCH-08, R-ARCH-10, R-BND-01, R-FB-01) and DESIGN.md §20, never from the implementation.
 */
export const CORE = Object.freeze({
  name: 'fishball-core', shared: 'fishball-shared',
  /**
   * Package names of the DSH side core never names (R-ARCH-10, R-BND-01; requirements 1.40): the
   * connector, the instance and the DSH side's library. Re-baselined (F-WIRE): "V2 was never deployed,
   * so no V2 path needs protecting" (the user, 2026-11-16): core no longer depends on or peers dsh-connector.
   */
  dshSide: Object.freeze({ connector: 'dsh-agent-connector', instance: 'dsh-instance', dshShared: 'dsh-connector-shared' }),
  /** F-GUARDS (design §5a.2, R-FB-02): core may DISABLE the dsh-instance row, but never inserts it. */
  neverInserted: Object.freeze(['dsh-instance']),
  /** DESIGN.md §20: one main row beside the two kept rows, and none of the V2 slim rows. */
  mainRow: Object.freeze({ id: 'fishball-core', name: 'fishball-core/main' }),
  keptRows: Object.freeze(['fishball-core-guards', 'fishball-core-session']),
  retiredRows: Object.freeze(['session-tools', 'approvals', 'app', 'inbox'].map((n) => 'fishball-native-' + n)),
  /** DESIGN.md §20: `src/slim/**` is deleted. */
  retiredFolder: 'src/slim/',
  /** Manifest fields: runtime dependencies, bundled ones, every dependency field, DSH's own field. */
  fields: Object.freeze({
    runtime: 'dependencies',
    bundled: Object.freeze(['bundleDependencies', 'bundledDependencies']),
    deps: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']),
    dsh: 'dsh',
  }),
  /** Core's own settings page root (F-SETTINGS, 1.34 item 4), a marker core ships. */
  corePage: 'data-fishball-core-settings',
})

/** DSH's own path inspection (the Plugins page's add): its answers for a bundle (dsh-plugin-manager). */
export const INSPECT = Object.freeze({ refused: 'refused', tempPrefix: 'fbtest-core-inspect-', manifest: 'package.json', anchor: 'anchor.json', profileName: 'fbtest-inspect-profile' })
