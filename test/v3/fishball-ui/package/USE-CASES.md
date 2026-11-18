# F-UI — use cases and test design (`fishball-ui.package`)

Source of truth (and only these): the user's words (requirements 1.38 Q-N2) "分离出一个fishball UI，core只负责做后端，
管理那个fishball session和preset，处理UI外的工作。让这个fishball UI插件来负责fishball中的UI改变，包括给embed UI暴露的那个会话窗口样式。";
v3-requirements R-FB-14, R-FB-01, R-FB-02, R-FB-09, R-FB-11, R-ARCH-08, R-ARCH-10; Q-G1 (core
without fishball-ui shows no hint), Q-G2 = A (fishball-ui without core logs `fishball-core-missing`
and changes nothing); design `design/v3` 9a531192 §1.0; and the interface the F-UI developer relayed
(2026-11-16, items 1–11, with two amendments: the browser chunks export part factories
`entriesPart(kit)` / `asksPart(kit)`, and the core-missing row writes its one line when it starts).
The implementation under `packages/fishball-ui/**` and the edited core files were not read.

Actors: the **owner** (installs, enables and disables bundles; may re-enable a guarded row); **DSH**
(composes bundle patches, evaluates a row's `!!js` `disabled` against the process's
`profileContext.startedBundles`, serves client entries, keeps a log); **fishball-core** (backend:
guards report, routes); **fishball-ui** (the UI bundle); **DSH's page** (loads `client.js` and its
package-local chunks).

## Use cases

| UC | Use case | Main flow | Alternatives / exceptions |
| --- | --- | --- | --- |
| UI-UC-01 | A Fishball DSH with core and fishball-ui | 1. Both bundles start. 2. fishball-ui's seven UI guard rows are disabled; the `fishball-ui`, `fishball-page` and `fishball-recommend-plugins` rows run; the core-missing row is off. 3. `fishballUiGuards.rows` is the seven ids, frozen, in patch order. 4. Core's guard report is `ok` and covers the UI rows. 5. The page serves fishball-ui's client entry, the page and the tab; the tab's route answers. | A1 the owner re-enables a UI row → `guards-overridden` naming `row:<id>`; restoring it → `ok`. A2 a core row and a UI row both re-enabled → core's row is named first. E1 no `fishball-core-missing` line anywhere. |
| UI-UC-02 | fishball-ui without core (Q-G2 = A) | 1. fishball-ui alone starts. 2. Exactly one warn line `fishball-core-missing` under logger `fishball-ui`. 3. No DSH row is disabled by fishball-ui (the seven UI rows stay on). 4. No fishball row runs (no `fishball-ui`, page or tab), no `fishballUiGuards`, no Fishball client entry, the tab's route is absent. | A1 the next start: again exactly one line in that process (once per start). |
| UI-UC-03 | core without fishball-ui (Q-G1) | 1. core alone starts. 2. It boots, the report is `ok`. 3. No row of fishball-ui's is reported even when such a DSH row is on; no `fishballUiGuards`. 4. No log line names fishball-ui or `fishball-core-missing`. | A1 fishball-ui is enabled later while DSH runs: `fishballUiGuards` appears and core re-checks: a UI row the owner keeps on is then reported. |
| UI-UC-04 | The page starts fishball-ui's browser half | 1. `client.js` registers module `fishball-ui` (no chunk). 2. Its plugin loads `./client.entries.js` and `./client.asks.js` and starts each `part(kit)`. 3. `kit.mountStyle(id, css)` adds one `<style id>`; its disposer removes it. | E1 one chunk fails to load: only its part is lost; the other starts; nothing fails. E2 both fail: nothing starts; the entry plugin itself does not fail. |
| UI-UC-05 | The two chunks on their own | Each chunk registers `{id: 'fishball-ui', chunk: <file>}` and exports its part factory; the factory returns a client plugin named `fishball-ui: entries` / `fishball-ui: asks` with an `inject` list and `apply`; it requires only the page's platform modules. | — |
| UI-UC-06 | The package and its boundary | fishball-ui is a root workspace and a DSH bundle (`dsh.bundle.patch`, `dsh.client.platform: web`), exports exactly `.`, `./client`, `./core-missing`, `./package.json`, depends on and bundles fishball-shared, ships every file its rows load. | E1 it names no DSH-side package (connector, connector-ui, instance, adapter, dsh-connector-shared) and never fishball-core, in any manifest field or import; core never names fishball-ui. |
| UI-UC-07 | The shared seam | `fishball-shared/ui-seam` exports `UI_SEAM`, `UI_GUARDS` and `SEAM_STATUS`, deeply frozen data; core's constants no longer export `UI_SEAM`. | E1 drift: `SEAM_STATUS.link/connect/guards` equal core's `LINK.state`, `CONNECT.state`, `GUARDS.status`. |
| UI-UC-08 | Core's patch after the split | core's patch keeps its own guard rows, shipped presets off, `preset-fishball` and its guards row `fishball-core-guards` (`./src/guards/row.js`); it holds none of the UI rows; core has no `ui/`, `client.asks.js` or `src/recommended.js`. | — |

## Techniques and case ids (cases.mjs)

- **Use Case**: UI-UC-01 … UI-UC-08, each test naming its flow step.
- **Decision table UI-DT-01** (interface item 2): row kind × core in `startedBundles` → `disabled`.

  | Row kind | core started | core not started |
  | --- | --- | --- |
  | UI guard row (7) | disabled | on (DSH's row runs) |
  | `fishball-ui`, `fishball-page`, `fishball-recommend-plugins` | on | disabled |
  | `fishball-ui-core-missing` | disabled | on |

  Evaluated with the SDK's own loader evaluator (one test per rule and row), and observed in real
  DSH processes (UI-UC-01, UI-UC-02).
- **EP / BVA UI-EP-01** over `startedBundles` (constants.mjs STARTED): empty (BVA 0 bundles), core
  alone (BVA 1), ui alone, core not first, core first, near names (`fishball-core-x`, a prefix,
  another case, a scoped name): only an exact `fishball-core` entry counts.
- **EP UI-EP-02** manifest fields: dependency fields × forbidden names; export map exactly.
- **EP UI-EP-03** the client chunk outcomes: real / failing / stand-in.
- **BVA UI-BVA-01** counts: exactly seven guard rows, exactly four inserted rows, exactly one
  core-missing line per start (0 with core), exactly one module registration per script, one style
  element per `mountStyle`, none after its disposer.
- **State transition UI-ST-01** the core-missing line per start (start → one line; next start → one
  more line in that process, never two). **UI-ST-02** fishball-ui enabled while core runs
  (absent → present → core re-checks). **UI-ST-03** `mountStyle` (none → mounted → disposed; dispose
  twice changes nothing).

Rows a later task owns are `todo` and name it: a hosted child does not place fishball-ui until I-HOST;
browser rendering is E2E-UI's; there is no frame-only window-style rule yet (interface item 11).

## E-FIX-3 (B7): no DSH Preview Notice in a hosted Fishball child

Requirement (relayed by Fishball, 2026-11-17): DSH's welcome step (dsh-client-ui-settings-models,
`settings.onboarding`) shows until the public setting `ui-settings-general.welcomeNoticeVersion`
equals DSH's copy version `2026-09-28.1`. fishball-ui's patch sets it only in a hosted child, and
changes nothing elsewhere. The value is resolved as DSH's Loader resolves a row's config: the SDK's
own `interpolate` (`evaluate` = `new Function('ctx','expr','with (ctx) { return eval(expr) }')`)
against a real Cordis Context of that SDK that provides `profileContext`.

**Amendment of UI-BVA-01 `guards` and UI-DT-01 `shape` (E-FIX-3, Fishball 2026-11-17).** The patch
now has a third kind of op besides the bare `{id, disabled}` guard rows and the `insert`: the
config row `{id: 'ui-settings-general', config: {welcomeNoticeVersion: !!js …}}`, with no
`disabled`. Re-baselined:
- UI-BVA-01 `guards`: the bare `{id, disabled}` ops are exactly the eight guard rows, in order,
  and the only other non-insert op is that config row (keys `id`, `config`).
- UI-DT-01 `shape`: every `disabled` condition is still a `!!js` expression. Only that config row
  has none.

**EFIX3-UI-DT-01** (the requirement's decision table; rows are rules 1–5):

| Rule | fishball-core in `startedBundles` | an overlay inserts `dsh-instance-child` | resolved `welcomeNoticeVersion` |
| --- | --- | --- | --- |
| 1 | yes | yes | `'2026-09-28.1'` |
| 2 | yes | no (standalone) | `undefined` |
| 3 | no | yes | `undefined` |
| 4 | no | no | `undefined` |
| 5 | no `profileContext` at all | — | `undefined` |

| Id | Technique | Case |
| --- | --- | --- |
| EFIX3-UI-SHAPE-01 row | EP | One op `{id, config}` whose config has only `welcomeNoticeVersion`. |
| EFIX3-UI-SHAPE-01 version drift | drift | The SDK's welcome step still compares with `2026-09-28.1`. |
| EFIX3-UI-SHAPE-01 composed | integration | Composed with DSH's layers and core's patch: the row exists and carries the config. |
| EFIX3-UI-EP-01 (6 rows) | EP / BVA | With core started, over `overlays`: none (BVA 0), the child insert alone, the child insert after other patches beside another row, other inserted rows only, a near id `dsh-instance-child-x`, and a non-insert patch of that id. Only an inserted row with exactly that id counts. |
| EFIX3-UI-EP-02 (9 rows) | EP / BVA | With the child insert, over UI-EP-01's `startedBundles` partitions: only an exact `fishball-core` counts. |
| EFIX3-UI-GUARD-01 | EP | `readUiGuardRows()` reads exactly the eight guard rows. The config row is not a guard row. |
| EFIX3-UI-OWNER-01 | integration | The owner's profile layer value wins over fishball-ui's. |
| EFIX3-UI-SYS-01 standalone | system | A real standalone DSH with core and fishball-ui (scenario BOTH): DSH's settings service describes `ui-settings-general` with no `welcomeNoticeVersion`, so the notice behaves as before. |
| EFIX3-UI-SYS-01 hosted | todo | Out of scope: rows that launch a hosted child. Rule 1 covers it with DSH's own evaluator. |

## UI-POLISH-F §1: the Fishball page's icon navigation (`nav-cases.mjs`, `nav-page.mjs`)

Requirement: `.runtime/reports/ui-polish-f/SPEC.md` §1 (the user, 2026-11-17: "我更乐意看到是按钮的图标").
Component level, offline: the real `fishball-page/client.js` in the node:vm page over the SDK's real
dsh-client-shortcuts service and the LITE harness's fakes; DSH's Button, Tooltip, StateDot and icons
are the F-SETTINGS stand-ins (`../../fishball-core/settings/primitives.mjs`, render shapes read from
both SDKs' dsh-web-frontend bundle). The LITE browser rows cover the same page in Chromium (they
skip with no Chromium).

| Id | Technique | Case |
| --- | --- | --- |
| UIPF-NAV-EP-01 order en / zh | EP | No status: exactly settings, fishball, plugins, in that order. |
| UIPF-NAV-EP-01 `<control>` en / zh (settings, fishball, plugins, retry) | EP | One `<svg aria-hidden="true">`, no text node, aria-label en/zh, Tooltip label = aria-label. |
| UIPF-NAV-EP-01 settings hooks | EP | `button.fishball-settings-launcher[aria-haspopup=dialog]` inside the nav. |
| UIPF-NAV-BVA-01 settingsOpen false / true / false → true | BVA, ST | `aria-expanded` follows the launcher owner prop. |
| UIPF-NAV-BVA-01 shortcut none / two keys | BVA | The Settings tooltip shows DSH's shortcut keys only when given. |
| UIPF-NAV-ST-01 `<control>` hover / focus | ST | No tooltip → one portalled `role=tooltip` with the label → none on leave / blur. |
| UIPF-NAV-DT-01 unavailable / failed / pending × en / zh | DT | `span[role=status][data-fishball-nav-status]`, unchanged text, StateDot error / error / spinner `ongoing`; order settings, fishball, plugins, status, retry. |
| UIPF-NAV-ST-02 | ST | Pending → config read: status and Retry go. |
| UIPF-NAV-UC-01 settings / fishball from plugins / fishball after drift / plugins / retry | UC | Clicks behave as before. |

## R-FIX-FUI F2 (Q-G2 = A, the user 2026-11-18): without core, fishball-ui changes nothing

The UI guard rows and the Preview Notice row moved from fishball-ui's patch into core's, each guard a
bare `{id, disabled: !!js}` row true exactly when `fishball-ui` is in the profile (live with HMR,
else `startedBundles`). Re-baselined rows: UI-BVA-01 (fishball-ui has no id-override row), UI-DT-01
(only insert rows), UI-EP-01 (insert rows only; UI-EP-03 is the guards' EP over `fishball-ui`),
EFIX3-UI-SHAPE-01 / DT-01 / EP-01 / EP-02 (the notice row is core's; its condition is fishball-ui
started), EFIX3-UI-GUARD-01 (core's `readIntendedGuards()` `{rows, uiRows, policy}`; no
`src/guards.js`, no dsh-app-boot peer), UI-UC-08 (core's patch holds the 8 rows), UI-UC-01 main 3
(`fishballUiGuards` is a marker without `rows`), UI-UC-06 moved (PAIRING_TEXT added title,
chooseFailed, locale), UI-UC-04 (five parts, client.pairing.js before client.model.js; the entry
requires react and the primitives).

`no-core-cases.mjs` (DSH's own composition over dsh-base, dsh-web-app and an earlier bundle layer):

| Id | Technique | Expected outcome |
| --- | --- | --- |
| NOCORE-DT-01 (a) | DT | fishball-ui only: the earlier `ui-permission` disable and welcome ack stay |
| NOCORE-EP-01 (a) | EP | fishball-ui only: every guard / notice value equals the DSH without Fishball; only core-missing on |
| NOCORE-DT-01 (b) | DT | core + fishball-ui: all 8 UI rows and core's guards disabled |
| NOCORE-DT-01 (c) | DT | core only: the 8 UI rows enabled (documented limit), core's guards disabled |
| NOCORE-DT-02 1–6 | DT (HMR × manifest × started) | With HMR the manifest decides, unreadable → startedBundles; without HMR startedBundles |
| NOCORE-DT-03 | DT | Hosted child with both → '2026-09-28.1'; standalone or core only → undefined |
| F7-EP-01 | static | guards.d.ts `GuardedRow` = core's guard rows (no presets) ∪ uiRows |

## MULTI-3 requirement F: the restyled real sidebar (`nav-cases.mjs`, `frame-layout-cases.mjs`, `frame-layout.mjs`)

Requirement F (lead, 2026-11-18) and PLAN-MULTI §6.4 (the user's decision: "那一排按钮实际上就是侧边栏，
只是被重度修改了样式"; rc.1 below 768px uses the native drawer; overflow scrolls horizontally, no More).
**Re-baselined:** fishball-page's own tray (`nav.fishball-page-navigation`, Fishball / Plugins) is
removed. The UIPF-NAV rows of the Fishball and Plugins buttons stay listed, withdrawn. The Settings
launcher (`button.fishball-settings-launcher`), the status (`[data-fishball-nav-status]`) and Retry
(`[data-fishball-nav=retry]`) are looked up page-wide. The status reads its text or, as a small
control, its accessible name. UI-UC-04 / UI-UC-06: four client parts, because `client.pairing.js` is
removed, and `src/status/index.js` exports `targetsView`, `TARGET_LINE` and `STATUS_TEXT`.

| Id | Technique | Expected outcome |
| --- | --- | --- |
| MULTI-NAV-EP-01 no tray | EP | No `nav.fishball-page-navigation`, no page-owned `nav`, no page Plugins button |
| MULTI-NAV-EP-02 status visible 390 / 1280px | EP | The unavailable status and Retry are drawn, outside every hidden subtree |
| MULTI-NAV-EP-03 empty shadow | EP (requirement A) | fishball-page registers `sidebar.workspaces` at -1 and draws no workspace / session control there |
| MULTI-NAV-ST-01 no forced close 390 / 1280px | ST | Loading the page calls `layout.toggleSidebar()` zero times |
| MULTI-NAV-DT-01 shortcut remaps | DT | The gate edits no `sidebar.left.toggle`; session.new, session.search, workspace.add, session.rename, session.fork and session.archive stay remapped |

Frame-layout rows run in a real headless Chromium (the contrast rows' browser). They skip with no Chromium. The
document uses DSH's own AppFrame and SidebarRoot sheets and class names, cut from each SDK's
bundle, plus DSH's page stylesheets. It adds fishball-page's rules as its real client mounted them, and a
frame written from both SDKs' render code (slot anchors, `data-sidebar-collapsed` /
`data-sidebar-drawer`, the panel rows with their own icons, the workspaces region and the Settings
seat). The layout state is DSH's own: collapsed below 1024px; on rc.1 a closed drawer below 768px.

| Id | Technique | Expected outcome |
| --- | --- | --- |
| MULTI-BAR-DT-01 page 390 / 480px | DT, BVA | rc.5: the sidebar column is `position: fixed`, 44px high, at the bottom, full width. rc.1 (< 768px, drawer): no bar, the native drawer opener visible |
| MULTI-BAR-BVA-01 page 481px | BVA | DSH's sidebar exactly as without Fishball's rules |
| MULTI-BAR-DT-01 page 1280px; not the page 390 / 1280px | DT | DSH unchanged (same geometry as without Fishball's rules) |
| MULTI-BAR-EP-01 entries and settings; one row (rc.5) | EP | Every entry, DSH's own and a third-party one, inside the bar with its own icon; the Settings seat in the bar; the workspaces region not shown; one row, in order |
| MULTI-BAR-BVA-02 24 entries / one entry (rc.5) | BVA | 24 long entries: still 44px, one row, horizontal scroll moves them; one entry: no scroller |
| MULTI-DRAWER-DT-01 open drawer; mid width (rc.1) | DT | Open drawer at 390px: no bar; panels with icons, Settings and the target list shown. 600px: DSH's drawer unchanged |
| MULTI-BAR-CTRL-01 | Control | The same frame without Fishball's rules has no bar |
| SHOT-TARGET-URL-EP-01 | EP, ST | At 1440px with two Office-DSH names, expand the markup-named Night-Build target. Names remain literal text. The expanded address has its full URL as text and hover title; it may fit, ellipsize, or wrap without splitting the last `mcp` segment. |
