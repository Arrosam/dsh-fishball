# child-plugins: DSH's Plugins page in an instance-run child

DESIGN §28 R2–R5: while the instance's launch overlay inserts `dsh-instance-child`, fishball-core's patch runs
fishball-ui's `fishball-child-plugins` row. Its browser half hides DSH's install entries (Add plugin and its menu
anchor, Discover, Uninstall, every Update) by DSH's own words in the active language, and shows the notice. Ported from
`test/v3/fishball-core/child-plugins/` (cases.mjs R2–R5, subject.mjs, constants.mjs). R1 (which row runs) is
fishball-core's own (`packages/core/tests/child-plugins`).

| file | what |
|---|---|
| [cases.mjs](<cases.mjs>) (entry `../child-plugins.test.mjs`) | CP-R2-01…09, CP-R3-01…10, CP-R4-01…04, CP-R5-01…04 and their table |
| [subject.mjs](<subject.mjs>) | the launch (DSH's composition of core's patch with overlay files, the row resolved by DSH's loader), the scripted child page, the drawn PluginManagerPage markup, the Chromium probe |
| [constants.mjs](<constants.mjs>) | row ids, modes, the notice, DSH's package and word keys, tabs, bundles, versions |

**Techniques.** EP (states, bundle titles, languages), DT (R3's tab rules 1–7; R2-07's mode × page × busy, 12 rows),
BVA (look-alike tab id and action text, three extra tabs, version strings), ST (Installed → Discover → Installed,
en → zh → en, zh → en).

**How it is observed.** A case first launches its mode. The current DSH's dsh-app-boot composes its shipped bundles,
core's `cordis.patch.yml` and the overlay files. DSH's loader resolves the composed row's `disabled` against a
`profileContext` with those overlays, and the case asserts it runs exactly in instance-run. The row's sub-package
(the composed row's `name`, entries from its own manifest) then runs in the scripted page only when it runs. DSH's
real locale runtime and Plugins / Discover dictionaries come first. Every sheet lies over PluginManagerPage-like
markup in headless Chromium, which reports each control's `checkVisibility()` and the toolbar's text and generated
content. The standalone rows (CP-R2-05, R2-07 standalone) are the controls: the same DOM without the row shows
everything.
