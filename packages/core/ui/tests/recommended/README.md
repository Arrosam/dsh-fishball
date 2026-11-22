# fishball-ui.recommended: the Fishball Recommended tab (T-RP)

fishball-ui's `fishball-recommend-plugins` (the child Plugins page's `plugins.tab` entry and its Node half's
`GET /api/fishball/recommended`), with its data `src/recommended.js`. Requirements:
docs/test-design/v2-recommendation-tab.md (AC1–AC11, §3 EP, §4 BVA, §5 decision table, §6 state transitions)
and the review requirements RV-A…RV-E.

Level: component. The browser half runs unread in a node:vm page over fishball-test-helpers' React shim with
fakes of DSH's public client surfaces (`../support/recommend-world.mjs`: the `plugins.tab` list slot and its
owner props `{t, install, openPackage}`, locale, the `pluginManager` remote's `listBundles` / `inspect` and
`$on`); each activation is its own plugin generation. The data module and the Node half are imported bound
to the current DSH. TC-21 also reads the current DSH's plugin-manager slot contract. Entry file:
`../recommended.test.mjs`.

| Rows | What |
| --- | --- |
| TC-20 | the shipped curated data: four categories in order, ten ids, highlights, empty Pet, en/zh notes; the route answers it |
| TC-21, TC-25, TC-26, TC-34 | the `plugins.tab` seam: registration through `slots.inject`, one live contribution across re-entry, disposal exactly once, native tabs untouched |
| TC-22, TC-28, TC-29, RV-01…05 | Install: inspection then a confirmed target to `owner.install`; failures shown, never retried or optimistic |
| TC-23, TC-24, RV-06…10 | presence: Installed exactly when the child inventory has the bundle installed with its files available; loading and refresh |
| TC-27, TC-30, TC-33 | generation fencing, curated rows only, the localized notes |
| TC-31, TC-32 | fishball-ui ships the tab's files; neither manifest depends on a recommended or feature package; activation installs nothing |

Retired: the post-merge e2e catalogue rows (TC-01…19, owners BROWSER / INTEGRATE) never had a check and name
no planned task; TC-23 R1 and the TC-31 / TC-32 halves that scanned dsh-connector / dsh-connector-ui or
composed dsh-instance's hosted child left with those packages (6b7c53bf).
