# fishball-amenities: package icons (PI-*)

Ported from `test/v3/fishball-amenities/icons` (2026-11-22, the test restructure). The requirement (the lead,
2026-11-21: every amenities package gets a plugin icon) and DSH's own manifest-icon rule (dsh-app-boot
`readPluginMeta`: a relative path inside the package, a regular file ≤ 256 KiB, a base64 data URL) are quoted in
[constants.mjs](<constants.mjs>); the ICON-SET base (the user, 2026-11-18) in [icon-set.mjs](<icon-set.mjs>).

Subjects: the umbrella and the members it ships (fishball-amenities, fishball-board, fishball-heartbeat,
fishball-taskboard); fishball-shared is the library (PI-DT-01 rule 2).

**Techniques.** EP per package (PI-EP-01…05), pairwise distinctness (PI-EP-06), DT package kind × icon (PI-DT-01),
the oracle's own checks (PI-DT-02 self-containment over synthetic SVGs, PI-DT-03 visibility over controls), BVA on
DSH's 256 KiB limit through its reader (PI-BVA-01), the light/dark scheme state (PI-RENDER-01), the ICON-SET base
(PI-CONSIST).

**How it is observed** ([observe.mjs](<observe.mjs>)). Manifests and icon files are read from each package's folder
(this one, and its dependencies by name); the current DSH's `readPluginMeta` reads them through a throwaway
`node_modules` of links; `npm pack --dry-run` lists what ships; the XML parser is the saxes DSH ships; a real
headless Chromium (`fishball-test-helpers/browser` `sharedBrowser`) decodes DSH's data URL in an `<img>` under
`prefers-color-scheme` light and dark, and a pixel counts as drawn at ≥ 3:1 (`fishball-test-helpers/wcag` contrast)
against the page's Canvas. Render rows skip only where no Chromium exists.

**Not here (integration rows).** fishball-core's icon as the family reference (its PI-EP-01…05 and PI-RENDER-01
rows), PI-CONSIST's "base equals fishball-core's", and PI-EP-06's distinctness against fishball-core's and
fishball-ui's icons: those packages are not dependencies of the umbrella. PI-CONSIST here checks the ICON-SET
base and badge directly (`iconMismatch`), which the old row also asserted.
