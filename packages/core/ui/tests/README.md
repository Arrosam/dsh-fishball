# fishball-ui's tests

fishball-ui's own tests ([docs/testing/README.md](<../../../../docs/testing/README.md>)). fishball-ui is a
separate package nested in fishball-core's folder (`packages/core/ui`, its own manifest) and shipped
inside fishball-core's tarball, which excludes `ui/tests/`. Its tests and fishball-core's never run
each other: these reach only fishball-ui's own files and `fishball-test-helpers/*` (its manifest declares
no dependency, so the seam's values are copied in [support/seam.mjs](<support/seam.mjs>)). Nothing of
core runs: what core would serve (page-stream frames, routes, its settings namespace) is scripted.
Shared page and browser support for several areas is in [support/](<support/>).

```bash
node scripts/test.mjs fishball-ui                  # all 9 entry files
node scripts/test.mjs fishball-ui --list           # the entry files, nothing run
node scripts/test.mjs fishball-ui --file=pairing   # one entry file
node scripts/test.mjs fishball-ui --against=<ref> -- --test-name-pattern=<ID>
```

## Areas

Counts are the cases each entry registers on DSH 0.2.2-rc.3 (`node scripts/test.mjs fishball-ui
--file=<area>`, 2026-11-27): 687 in all, every one passing. Browser rows skip (never fail) where no
Chromium exists.

| entry | area README | what it covers | case-id prefixes | cases |
|---|---|---|---|---|
| `brand.test.mjs` | [brand/](<brand/README.md>) | the sidebar brand row: mark, wordmark, states, the manager-session button, accessible names, slot faults, the reply avatar | BRAND-*, LOGO-FIX, AVATAR-* | 103 |
| `connections.test.mjs` | [connections/](<connections/README.md>) | the page's one live connection, whatever readers are mounted; demultiplexing, health, Reconnect | CONN-* | 31 |
| `contrast.test.mjs` | [contrast/](<contrast/README.md>) | WCAG contrast of the ask card's reason placeholder and open badge, light and dark; DSH tokens only | UIFF-*, RESHOOT-ASKBADGE-* | 25 |
| `model-dialog.test.mjs` | [model-dialog/](<model-dialog/README.md>) | the model dialog and catalog, the sidebar DSH targets and their actions, ask-card sources, running sessions | MODEL-*, UIPF-MODEL-*, CAT-*, TGT-VIEW/SB/DOCK/ASK-*, SES-VIEW/SB-* | 242 |
| `package.test.mjs` | [package/](<package/README.md>) | manifests and shipped specifiers, the part loader, fishball-page's navigation, the narrow bar and sheet | UI-*, EFIX3-UI-GUARD-01, FRAME-READY, UIPF-NAV-*, MULTI-NAV/BAR/SHEET/DRAWER-*, R3B-07, NARROW-*, LOGO-FIX, SHOT-TARGET-URL-* | 101 |
| `page.test.mjs` | [page/](<page/README.md>) | fishball-page's LITE guards in a real browser: shortcut remapping, launchers kept out of reach, the return to the manager | LITE-*, B3-* | 36 |
| `pairing.test.mjs` | [pairing/](<pairing/README.md>) | the pure pairing view model; the Node row registers no pairing route | PAIR-* | 68 |
| `recommended.test.mjs` | [recommended/](<recommended/README.md>) | the Fishball Recommended tab: data, the `plugins.tab` seam, Install, presence | TC-20…34, RV-01…10 | 65 |
| `stream.test.mjs` | [stream/](<stream/README.md>) | stream health of the ask cards; the ask-card time in the UI language | HEALTH-*, TIME-DT-01 | 16 |

[guards/](<guards/README.md>) has no entry file: its old rows observe fishball-core's guard report with
fishball-ui present, so they are integration rows.

## Regression rows

The contrast fixes (UI-FIX-F, RESHOOT fix 1) predate fishball-ui's move under `packages/core/ui`
(117cb2a2), so `--against` cannot reach them; the base-commit measurement is in
[contrast/](<contrast/README.md>).

## Not here

Rows that need fishball-core (or fishball-taskboard) beside fishball-ui are listed in each area README
and run in the integration packages: [`integration-page-stream`](<../../../integration-page-stream/>),
[`integration-release`](<../../../integration-release/>) and
[`integration-amenities`](<../../../integration-amenities/README.md>). What the old `test/` tree covered
is in [docs/testing/inventory/fishball-ui.md](<../../../../docs/testing/inventory/fishball-ui.md>).
