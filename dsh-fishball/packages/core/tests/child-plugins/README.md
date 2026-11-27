# fishball-core tests: child-plugins

DESIGN.md §28, the part core's own patch decides (R1): in an instance-run child (the instance's
child-side row `dsh-instance-child` is in a launch overlay) `fishball-child-plugins` runs and
`fishball-recommend-plugins` does not; standalone, the reverse. Entry
[../child-plugins.test.mjs](<../child-plugins.test.mjs>); rows and their decision table in
[cases.mjs](<cases.mjs>).

How it is observed: the current DSH's dsh-app-boot composes its shipped bundles, core's
`cordis.patch.yml` and scratch launch overlay files; each row's `disabled` is resolved by DSH's own
loader against a real cordis Context with `profileContext.overlays`
([../support/core-static.mjs](<../support/core-static.mjs>)). Nothing of fishball-ui is loaded.

## Integration rows (moved out)

CP-R2-*, CP-R3-*, CP-R4-*, CP-R5-* run fishball-child-plugins' client (a fishball-ui file,
packages/core/ui) in the scripted DSH page and Chromium: they need fishball-ui.
