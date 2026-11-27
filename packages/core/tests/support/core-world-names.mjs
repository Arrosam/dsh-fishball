/**
 * The fixed names of fishball-core's DSH world (./core-world.mjs parent, ./core-world-ext.mjs child):
 * core's published service names (K3 contracts/constants.js GUARDS.services, fishball-shared
 * ui-seam UI_STATUS), its row ids (cordis.patch.yml), DSH's names the ops use, harness waits.
 * Data only: the child imports it too, before DSH starts.
 * Owned by the wire area (packages/core/tests/support/ is port-core-wire's).
 */
export const CORE_WORLD = Object.freeze({
  core: 'fishball-core', shared: 'fishball-shared',
  /** core's main row module (its `./main` export) and the hosted child's row (K3a HOSTED_IMPORT.targetSetting). */
  main: 'fishball-core/main', childRow: 'dsh-instance-child', childField: 'targetUrl',
  services: Object.freeze({ instance: 'fishballInstance', status: 'fishballStatus' }),
  env: Object.freeze({ homePatch: 'FBTEST_CORE_HOME_PATCH', profileConfig: 'FBTEST_CORE_PROFILE_CONFIG', handoff: 'FBTEST_HANDOFF_TOKEN' }),
  /** DSH's names: the launcher (dsh-app-boot's profile functions take it), its home patch file. */
  dshName: 'dsh', appBoot: 'dsh-app-boot', patchFile: 'cordis.patch.yml', yaml: 'yaml/dist/index.js', encoding: 'utf8',
  toolRole: 'tool', eventSource: 'fishball-event', userMessage: 'user/message', functionWord: 'function', shapeDepth: 3,
  budget: Object.freeze({ readyMs: 60000, pollMs: 100 }),
})