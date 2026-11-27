# fishball-ui: the package, its browser half, fishball-page's navigation and the narrow sidebar

Entry: [`../package.test.mjs`](<../package.test.mjs>). Ported from `test/v3/fishball-ui/package/` (F-UI,
E-FIX-3, UI-POLISH-F §1, R-FIX-FUI F2, MULTI-3 F, R3B-07, LOGO-FIX, SHOT).

Requirements: 1.38 Q-N2; R-FB-14, R-ARCH-08, R-ARCH-10; Q-G2; design §1.0; the F-UI interface (2026-11-16,
items 1–11 with its amendments); 117cb2a2 (fishball-ui is core's ./ui/ component: no patch of its own, its
rows live in core's `cordis.patch.yml`); UI-POLISH-F SPEC §1; PLAN-MULTI §6.4.

## How it is observed

- **Static** ([`subject.mjs`](<subject.mjs>)): fishball-ui's own manifests (its own and the nested
  `fishball-page` / `fishball-recommend-plugins`) and the specifiers its shipped files name (its `files` list,
  a literal scan of import / export-from / import() / require() / require.async()). Moved files are compared
  with their copy at the base commit e3cf8d5b (`git show`).
- **Component**: fishball-ui's `client.js` and its chunks run unread in a node:vm page whose module loader is
  DSH's face, applied by the current DSH's own Cordis; chunk loads can be the real file, a stand-in or a
  failure. fishball-page's client runs over the current DSH's real dsh-client-shortcuts service
  (../support/nav-page.mjs). R3B-07 adds the current DSH's real `LocaleRuntime` (dsh-client-locale).
- **Browser** ([`frame-layout.mjs`](<frame-layout.mjs>), [`narrow-frame.mjs`](<narrow-frame.mjs>),
  [`target-address.mjs`](<target-address.mjs>)): a frame written from the current DSH's AppFrame and
  SidebarRoot (their own CSS modules and class maps), fishball-page's mounted rules, in headless Chromium;
  the live rows run fishball-page's client in LITE's environment (../support/lite-env.mjs). Rows skip without
  Chromium. The old suite ran these per SDK (`rc.1` = the drawer layout, `rc.5` = the rail layout); now the
  current DSH's layout decides (`DRAWER_LAYOUT`: its AppFrame writes `data-sidebar-drawer`, 0.2.2-rc.1 and later).

## Rows

| Id | Technique | Expected outcome |
| --- | --- | --- |
| UI-UC-06 main 1 / main 2 / main 3 | UC | Its own manifest named fishball-ui; `dsh.client.platform` web, no `dsh.bundle`; no runtime or bundled dependency |
| UI-EP-02 exports | EP | The export map is exactly `.`, `./client`, `./core-missing`, `./package.json`, each shipped |
| UI-EP-02 manifest (2) | EP | No DSH-side package (dsh-agent-connector, dsh-connector-ui, dsh-instance, dsh-connector-adapter, dsh-connector-shared) or fishball-core in any field; others are fishball-shared or `@deepseek-ai/*` |
| UI-EP-02 imports (2) | EP | No shipped file imports those or leaves the package; it imports fishball-shared |
| UI-UC-06 rows (2) | UC | `fishball-page/` and `fishball-recommend-plugins/` are their own packages with `./client` and `dsh.client` |
| UI-BVA-01 no UI patch | BVA | No `cordis.patch.yml` in fishball-ui |
| EFIX3-UI-GUARD-01 gone | EP | No `src/guards.js`, no dsh-app-boot peer |
| UI-UC-06 moved (3) | UC | PAIRING_TEXT answers as at e3cf8d5b for every old key and adds title, chooseFailed, locale; `src/status/index.js` and `src/recommended.js` exports |
| UI-UC-04 main 1 / main 2 / E1 (5) / E2 | UC, EP | One module registration; the five parts load in order and start; one failing chunk loses only its part; all failing → nothing starts, nothing fails |
| UI-ST-03 mountStyle | ST, BVA | none → one `<style id>` → disposed → disposing again changes nothing |
| UI-UC-05 `<part>` (5) | UC | Each chunk registers `{id: fishball-ui, chunk}` and exports its part factory → a named plugin `{inject, apply}` requiring only the page's modules |
| FRAME-READY child/known-parent / no-ancestor-origin / standalone | EP | One `fishball:frame-ready` marker per framed document to the direct parent only |
| UIPF-NAV-EP-01 settings / retry × en/zh, settings hooks, no status | EP | Icon-only launcher and Retry, aria-label = Tooltip label; `button.fishball-settings-launcher[aria-haspopup=dialog]` |
| UIPF-NAV-BVA-01 settingsOpen false / true / false → true, shortcut none / two keys | BVA, ST | `aria-expanded` follows the owner prop; the tooltip shows DSH's keys only when given |
| UIPF-NAV-ST-01 settings onMouseEnter / onFocus | ST | No tooltip → one portalled `role=tooltip` → none |
| UIPF-NAV-DT-01 unavailable / failed / pending × en/zh | DT | `[data-fishball-nav-status]` with the status text and StateDot, then Retry |
| UIPF-NAV-ST-02, UIPF-NAV-UC-01 settings / retry | ST, UC | The config read clears the status; Settings opens DSH Settings; Retry reopens the manager |
| MULTI-NAV-EP-01 / -EP-02 (390, 1280) / -EP-03 / -ST-01 (390, 1280) / -DT-01 | EP, ST, DT | No tray; the status and Retry visible; the Empty `sidebar.workspaces` shadow at -1; no forced `toggleSidebar`; `sidebar.left.toggle` not remapped, the six session/workspace shortcuts are |
| R3B-07 late child / ready match / pending replacement / reload | ST | The embed landing's `#lang` and the native Language choice survive a replacement page and a reload |
| MULTI-BAR-DT-01 `page <w>px <stock\|plugin>` (14), page 1280px, not the page 390 / 1280px | DT, BVA | ≤480px the original sidebar is the fixed 44px bottom bar; above, DSH's layout exactly as without Fishball's rules |
| MULTI-BAR-BVA-01 481px; MULTI-BAR-CTRL-01 | BVA, control | Just outside the query DSH is unchanged; without the rules there is no bar |
| MULTI-BAR-EP-01 entries and settings / one row; MULTI-BAR-BVA-02 24 entries / one entry | EP, BVA | Every entry and the Settings seat in one row; overflow scrolls horizontally |
| NARROW-KEY-01 Enter / Space; NARROW-RESIZE-01; NARROW-TOGGLE-01 | EP, ST | Tab reaches every original action unobscured; resizing across the breakpoints and toggling return the bar |
| LOGO-FIX-3 wide sidebar (+ interrupt fade, retained collapse on the rail layout); LOGO-FIX 480px narrow bar | ST | The wide brand is visible and on the Tab path when open, never a bar action or a Tab stop when closed |
| MULTI-SHEET-EP-01 / -EP-02 bar, sheet (rail layout); MULTI-DRAWER-DT-01 open drawer / mid width (drawer layout) | EP, DT | The expanded sheet leaves a 48px gutter; the rightbar stays in column 3; the drawer replaces the bar |
| SHOT-TARGET-URL-EP-01 / -EP-02 | EP | The expanded target address keeps its full URL as text and title, wraps or ellipsizes without an orphan |

## Not here

- **Integration** (they need fishball-core's patch, its modules or a booted DSH with core):
  UI-BVA-01 inserted, UI-UC-06 rows (3 path rows), UI-DT-01 rows / composed, UI-EP-03, EFIX3-UI-SHAPE-01 (3),
  EFIX3-UI-DT-01 (3), EFIX3-UI-EP-01 (6), EFIX3-UI-EP-02, EFIX3-UI-GUARD-01 uiRows / rows, EFIX3-UI-OWNER-01,
  UI-UC-08 (7), UI-UC-07 E1 drift (3, core's contracts), NOCORE-ARCH core composition, NOCORE-NOTICE (2),
  NOCORE-GUARDS, UI-EP-02 reverse (core's files), UI-UC-01 (9), EFIX3-UI-SYS-01 standalone. UI-UC-07 main /
  UI_SEAM / UI_GUARDS / SEAM_STATUS / data only are fishball-shared's own (its package tests).
- **Retired**: the withdrawn tray rows (UIPF-NAV-EP-01 order / fishball / plugins, UIPF-NAV-ST-01 fishball /
  plugins, UIPF-NAV-UC-01 fishball / plugins; MULTI-3 F); every `todo` of a subject that is gone (117cb2a2: no
  UI bundle, no core-missing row — UI-UC-02, UI-UC-03, UI-ST-01, UI-ST-02, UI-EP-01, UI-UC-06 main 2 inspection,
  UI-UC-06 rows core-missing, NOCORE-OLD) or never landed / owned elsewhere (UI-UC-06 main 3 npm pack and
  tarball → REL-PACK, UI-UC-06 window style, UI-UC-01 hosted, UI-UC-04 e2e, EFIX3-UI-SYS-01 hosted,
  MULTI-SHEET-ST-01 → E2E-UI). NOCORE-ARCH no UI patch duplicates UI-BVA-01 and is merged into it.
