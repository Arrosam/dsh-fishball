# fishball-ui: guards (F-GUARDS) — no own rows

The old suite `test/v3/fishball-ui/guards/` (PLAT-UC-04, PLAT-DT-04, UIM-DT-01; 62 behaviours) boots a real
standalone DSH with **fishball-core installed** (fishball-ui is core's ./ui/ component since 117cb2a2) and
observes core's guard report, the guard rows of core's patch, core's self-reorder in `dsh.profile.bundles`,
the manager session's tools and presets. Every row's subject is fishball-core's (its patch, its
`src/guards` report, its preset and manager), observed in a process where fishball-ui is present beside it.

None of it is fishball-ui's own behaviour, and none of it can run in fishball-ui's world (fishball-ui alone
in a scripted page, no fishball-core): every row needs fishball-core's Node rows booted, and the UI-only guard
rows (`ui-subagent` … `ui-model-selection`) are rows of **core's** patch. So the suite is ported as
**integration rows** (see `.runtime/port/port-ui-b-mapping.tsv`, `integration:` lines): a booted standalone
DSH (fishball-test-helpers/dsh-world) with fishball-core and its ./ui component, the stand-in bundles the old
worker generated (a probe row, a stand-in dsh-instance, an ordinary other bundle, an extra-preset bundle, a
deselected bundle), and the scripted model.

This folder has no test entry (`guards.test.mjs` is intentionally absent); it stays as the pointer for the
lead. Retired: the old `todo` rows of later tasks (F-WIRE, E2E-CORE, REL-PACK/X-MATRIX, F-LINK, X-MATRIX — the
last two name dsh-instance and the manual token, subjects of other repositories) and the withdrawn skip
`PLAT-UC-04 main` "the instance's launch code no longer holds the guard rows" (dsh-instance moved out,
6b7c53bf).
