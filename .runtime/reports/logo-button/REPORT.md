# LOGO-BUTTON (take 2): Fishball's brand at the top-left of Fishball's page

Worktree `.agents/worktrees/dev-v3-logo-button`, branch `dev/v3-logo-button`. Original delivery:
`a4dc341e`; LOGO-FIX revises the activation, configuration and teardown guarantees below. Base
`origin/integrate/v3-w2` (`f2525fea`). Supported SDKs tested: DSH `0.2.1-rc.5` and `0.2.2-rc.1`.

## What was built

- `fishball-ui` fills DSH's `sidebar.brand.mark` and `sidebar.brand.name` at priority `-1` (the
  shell's own brand is `0`), on Fishball's page only (`data-fishball-page`, through the shared
  `kit.whilePage`). The brand draws Fishball's fish or Fishball's own whale, the `FISHBALL`
  wordmark and the small magenta-outlined `Deepseek Harness` tag, plus the status light and the
  V1 count badge.
- The enclosing shell brand button's activation is captured (mouse click, Enter, Space) and opens
  or focuses the one manager session through `uiWorkspace.openSession`; it never creates a session
  and never falls back to New Session. Panels are closed first, so an already-shown manager is
  brought forward rather than ignored.
- A MutationObserver scoped to that button keeps `aria-label="Fishball"`, the status description
  and the absence of the shell's New Session shortcut hint after each shell re-render. It is
  disconnected on teardown and the previous attributes are restored. The previous label is
  captured once; equal values are left alone, so it cannot loop.
- Status (no new server state): the asks stream is the connection and names the manager and its
  open cards; the sessions list's manager row says working; the strip stream says core on/off and
  carries the saved logo theme. Offline = asks not live, core `on:false`, or no manager id
  (empty ids included); attention = one or more open cards; working = the manager's turn runs;
  otherwise connected-idle. A closed/stale strip alone does not disconnect: it only carries
  presentation.
- Animation: the fish wags and the whale swims while working; no animation under
  `prefers-reduced-motion: reduce`; the DSH status dot/spinner is `StateDot` (done/ongoing/warning/error).
  The working screenshots pause the CSS animation at a wag/swim frame, so the still shows the
  animation rather than the rest position.
- Two themes, both with Fishball's logo top-left. Default **Fishball**. **DeepSeek** keeps the
  `FISHBALL` wordmark/tag and uses Fishball's own whale drawing (closed angular polygons on the
  same 24-unit grid, same square magenta eye; not DeepSeek's official orca path or SMIL shapes).
  The theme is applied live from core's status through the strip stream.
- Core owns the choice: `fishball-core` config field `brandStyle` (volatile, top-level), normalized
  to `fishball`/`deepseek`; core's settings page (`plugins.bundle.config`, the `fishball-core`
  namespace) gains a plain two-option **Fishball / DeepSeek** select below the model control. It
  writes `form.set('brandStyle', …)` at once, shows a refusal/transport failure as an alert, and
  reflects the form snapshot. Absent/unknown stored values read Fishball. Constants live in
  `SEAM_BRAND` (shared) and core's/page's restated copies.
- On Fishball's page, the wide button (identified by the name slot) is hidden until the brand
  has installed both capture listeners. Teardown withdraws the exemption first. A page-owned
  capture guard normalizes Text targets to their parent element and consumes pointer, click and
  Enter/Space activation on an unowned wide button, including keyboard-generated clicks.
  The separate New Session launcher stays hidden; the mark-only rail toggle still expands.
- The brand draws the tag itself: DSH's SDKs draw no such tag in the brand row, and V1 drew it; the
  text stays the shell's product name (`Deepseek Harness`).
- Status contract: `StatusSnapshot`'s `on` branch is
  `{fishball, targets, guards, set, brand: BrandStatus}`, `BrandStatus.style: 'fishball' | 'deepseek'`;
  the off branch stays exactly `{fishball: 'fishball-off'}` and the strip view defaults the theme.
  `contracts/README.md`, `contracts/targets.d.ts` and `contracts/index.d.ts` are updated.
- `DESIGN.md` has a short LOGO-BUTTON amendment recording the decisions above.

## What was reused from V1, and what was fixed

Reused: the two slot fills at priority -1; the click capture on the enclosing button; the
MutationObserver that rewrites the shell's label after re-renders (V1 `524aa33a`); the count pill
and 99+ cap; the fish wag and the 2.2 s cycle; the clip release for the shell's 24px brand box;
the idea of the theme as a stored preference with a fish/whale choice.

Fixed/adapted: the state now comes from V3's page (asks stream, sessions list, strip) rather than
V1's `/api/fishball/events`; the click opens/focuses the one manager session and never creates one;
the observer is limited to the button, is disconnected on teardown, restores the previous label,
description and shortcut hint, and cannot loop; the label is exactly "Fishball" with the status as
the description (V1 put unread state in the label); the rail mark is deliberately left inside the
shell's collapse/expand control; the page's New Session hide rule is taught not to hide the logo;
the theme is read live from core's settings rather than being a V1-only preference.

## New Session

The hosted child page keeps its existing behaviour: New Session stays hidden and the user cannot
start extra sessions there. The logo is the only Fishball-brand control in the child sidebar; its
click consumes the shell's New Session activation entirely and opens the known manager id, or does
nothing if no manager is known. V1's visible New Session button is not revived.

## Accessibility

The wide brand button (the shell's own button, wrapping the `aria-hidden` identity) gets
`aria-label="Fishball"`; the status is its `aria-description` and a visually hidden text node
(`Connected`, `Working`, `Offline`, `Waiting for you (N)` in en/zh). Enter and Space are handled on
keydown in the capture phase and the native click is consumed, so keyboard and assistive activation
go to the manager, not new-session. The rail's mark is decorative inside the toggle (the toggle
keeps its own name and action), so the rail is reachable as the sidebar control it already is; the
logo's accessible control exists in the expanded brand row.

## Widths, SDKs, drawer and rail

- 1440: the expanded sidebar's top-left brand row, both SDKs.
- 390: the sidebar is opened for the shot. rc.5 shows its expanded sheet; rc.1 shows its drawer;
  both use the same wide brand row and the same control. At ≤480px, rc.1's closed drawer becomes
  a 44px bar: panel actions remain reachable, but its still-mounted wide brand is hidden. See the
  [480px closed-bar fixture capture](closed-bar-480-rc1.png); the open-state matrix is unchanged.
- Rail (collapsed wide sidebar): the mark renders inside the shell's toggle; clicking it still
  collapses/expands. It does not open the manager (the toggle is not the brand control).
- rc.5's 44px narrow bar (collapsed below 480px): `fishball-page`'s own bar restyle hides the rail
  mark and shows DSH's open-sidebar glyph; there is no brand row in that 44px bar, so the logo
  appears when the sidebar is expanded as the sheet. This is the page's existing narrow layout, not
  a logo regression.
- On macOS Desktop the shell renders the brand row as a drag region/span, not a button (V1's known
  host boundary); the artwork still renders, but there is no Fishball button to capture there.
  Web is the tested target.

## Screenshots

Folder: `.runtime/reports/logo-button/` (the rig is in `rig/`, read-only copy of MULTI-3's rig,
adapted to this worktree and seam stand-in). The matrix is every combination of:

- state: `connected-idle`, `working`, `offline`, `needs-attention`
- theme: `fishball`, `deepseek`
- SDK: `0.2.1-rc.5`, `0.2.2-rc.1`
- language: `en`, `zh`
- width: `1440`, `390`
- mode: `light`, `dark`

= 128 files named `<state>-<theme>-<sdk>-<lang>-<width>-<mode>.png`, e.g.
`needs-attention-deepseek-0.2.2-rc.1-zh-390-dark.png`.

Realistic data: three DSH targets (one connected, one connecting, one failed); for attention, two
open approval cards plus one voided card, as core sends them; for working, a real manager turn held
at the model request and released after the shot; for offline, the asks route stopped while the
page stays up; idle with no cards and no turn.

LOGO-FIX did not reshoot the matrix: the mounted logo's artwork, layout, states and themes are unchanged. Only the unowned native button is now hidden.

Original checks: every image passed a Playwright check of label `Fishball`, brand not hidden, expected state
and theme, `FISHBALL` + `Deepseek Harness` text, badge only in attention (`2`), tag not clipped and
inside the viewport, and contrast. `checks.json` has 128/128 with no problem; the per-file table is
`SHOTS.md` (all 128 rows). Tag text contrast: 5.55–11.43:1; wordmark/background contrast: at least
16.47:1. The badge uses `#D40063`, 5.28:1 with white (V1's `#EC0A6E` is 4.34:1, below AA).
`sheet-brand-*.png` are four 32-cell contact sheets of all brand rows at 2x for a visual pass; the
full-page shots are also in the folder. I opened all four contact sheets plus the full-page idle,
working, offline and attention shots at 1440 and 390, light and dark, and the individual
drawer/sheet crops; the brand row is in the top-left, complete, at 2x device pixels, with the
contrasts above.

What the images show, by state:

- **connected-idle**: 24px fish or whale, `FISHBALL` (bold, larger than the tag), the magenta-outlined
  `Deepseek Harness` tag beneath, green status dot, no badge. Light: black wordmark on the white
  sidebar; dark: near-white on `#1b1b1c`.
- **working**: same row; the art is frozen mid-wag/mid-swim; the DSH `ongoing` spinner sits at the
  mark's corner; no badge. The still is a phase of the real animation, not a different drawing.
- **offline**: same row with a red status dot; no animation, no badge.
- **needs-attention**: same row with an amber status dot and the count pill (`2`) at the mark's
  top-right; no animation in this state unless a turn also runs.
- **Fishball theme**: the fish mark (V1's FishMark) with the square magenta eye.
- **DeepSeek theme**: the same wordmark/tag with Fishball's whale (body, tail and spout, square
  magenta eye).
- **light / dark**: both use DSH tokens for the wordmark, tag ink and ring; the tag is legible on both;
  1440 shows the normal sidebar, 390 the opened sheet/drawer over the dimmed page.

## LOGO-FIX regression evidence

- On `a4dc341e`, trusted pointer, Enter and Space could run the host New Session action while the brand chunk was pending, after it failed, and after brand teardown. With the fix, a Chromium fixture using the real page and brand modules verifies zero starts/creates in all three states. It first proves the native input works on an unguarded button; once the manager is ready, each input opens only that manager. Shell outlets and session services are modeled, not a full DSH GUI.
- On both installed SDKs, the real persisted core schema rejected numbers, arrays and objects before normalization on startup. Independent cold-start and live-edit tests now check the public status snapshot and demonstrate recovery to a valid theme.
- Injected setup and disposer failures used to leave a root observer or a slot registration behind. Independent tests count live subscriptions/registrations on failure and on part teardown, separately from removing the page mark, where one watcher must remain for reentry.
- The old README check accepted all four mutated documents on each SDK. The corrected check matches the full intended Markdown cell, including its literal escaped pipe; every mutation is rejected.
- Independent final diff review approved all four fixes after checking the guarded `:has()` fallback and strengthening the English/Chinese test for a host label rewrite on the same owned button.

### LOGO-FIX matrix results

Counts are **passed / failed / skipped / TODO**. The explicit selection included contrast, along with all `fishball-ui`, `fishball-core` and `contract` suites (28 suites, 55 files). `npm run test:map` reported zero in all five categories.

| Run | `0.2.1-rc.5` | `0.2.2-rc.1` |
| --- | ---: | ---: |
| Default parallel, first run | 2673 / 1 / 376 / 223 | 2642 / 0 / 375 / 223 |
| Serial | 2674 / 0 / 376 / 223 | 2641 / 1 / 375 / 223 |
| Default parallel, final rerun | 2674 / 0 / 376 / 223 | 2642 / 0 / 375 / 223 |
| Affected against `origin/integrate/v3-w2` | 6684 / 2 / 755 / 384 | 6277 / 2 / 755 / 384 |

The first rc.5 parallel run timed out in `MULTI-NAME-ST-01`; rc.1 serial timed out in `MULTI-NAME-EP-01`. In each case the target reported `TOKEN_REFUSED` before acquiring its remote name. Both passed on the final parallel run. The wider affected run failed two OAuth adapter tests on **each** SDK: `AUTH-UC-12` (refresh across lifetimes) and `AUTH-EP-13` (grant not present in the test credential file). These are not logo tests or the known `dsh-instance.host`/`.succession` intermittent failure. No corresponding assertion, adapter code or instance suite was changed to make the matrix pass.

## Original LOGO-BUTTON test evidence (`a4dc341e`)

Written by a separate black-box test author from the requirements alone (no implementation edits):
`test/v3/fishball-ui/brand/` (`USE-CASES.md` with use cases first, then equivalence partitions,
boundary values, decision tables and state transitions), `test/v3/fishball-core/settings/brand.mjs`,
plus the expected-shape updates in the existing core settings/status/wire, fishball-ui package/
model-dialog and K3/K3a contract rows; `test/suites.mjs` owns the new suite.

- `fishball-ui.brand`, both SDKs: **58/58** on `0.2.1-rc.5`, **59/59** on `0.2.2-rc.1` (the extra rc.1
  drawer row), 0 fail. The five robustness rows cover the manager-open retry, already-shown+panel
  focus, held Space/repeat, the title fallback and the previous title/aria-keyshortcuts restore.
- Settings `BRAND-*` rows: 25/25 on each SDK. `F-STATUS-01` and `MULTI-SVC-EP-01` pass on each SDK.
- `fishball-ui.model-dialog`: 258 tests, 224 pass, 0 fail, 32 skipped, 2 todo on each SDK.
- Contract `k3a-core-seams`/`package-boundaries`/`k3-host-services`: 453 tests, 375 pass, 0 fail,
  6 skipped, 72 todo on each SDK.
- Required wider run (`fishball-ui.*`, `core.settings`, `core.status`, `core.wire`): summaries
  945 pass / 0 fail / 322 skipped (`0.2.1-rc.5`) and 941 / 0 / 322 (`0.2.2-rc.1`), the difference being
  the rc.1-only drawer row; the one `⚠` row in the log is a pre-existing MULTI-1 todo row, counted
  skipped, not a failure.
- `node test/run-affected.mjs --check`: missing 0, twice 0, v3Unowned 0, rootUnowned 0, selection 0.
- Full `node test/run-affected.mjs origin/integrate/v3-w2` (the whole affected selection): **0 fail**.
  `0.2.1-rc.5`: 7802 tests, 6663 pass, 755 skipped, 384 todo. `0.2.2-rc.1`: 7395 tests, 6256 pass,
  755 skipped, 384 todo. The run started before the last interaction/accessibility-only review
  fixes; after those and the five added rows, the brand suite was rerun (**58/58** and **59/59**),
  and the contract (453/375), model-dialog (258/224), settings/status/wire targeted runs are green.

## Independent review

An independent subagent reviewed the diff against the requirements in both SDK shells, without
editing files and without using test results as evidence. **Blocking: none.** Non-blocking findings
and what was done:

- Manager-open race before the session list carries the manager: added a pending open; the first
  attempt is consumed, and a refused `openSession` is retried once the sessions list carries the id
  (no new session, no POST). A test row was requested from the test author.
- The initial review recorded a failed brand mount exposing New Session as a residual risk. The
  integration review rejected that behavior; LOGO-FIX keeps the native button hidden instead.
- No-manager-yet reads Offline: kept, because the one session is not yet reachable/known; the
  connection test remains the asks stream and the tests codify this. It is not a target-link state.
- Clip release: the comment now says it opens the nearest clipping ancestor (the shell brand box,
  or the logo row after the mark opened it) and that the inline overflow shorthand is restored as a
  whole; the current shell rules are class-based. Restored on unmount.
- Platform cases: macOS Desktop and rc.1 `!canStartSession` render the brand as a span, so there is
  no button to capture or label; the Windows titlebar rail renders no mark. Documented under
  Limitations (web is the tested target).
- Status accessibility robustness: added the native `title` as a fallback alongside
  `aria-description` and the hidden text; `title` is kept/replaced/restored with the same observer.
- Duplicate SSE connections: the brand has its own strip and asks streams beside the parts'
  streams. Functional (Reconnect is shared); noted as a small cost, not a blocker. Sharing would
  couple the parts and is not worth the churn.
- Activation nits: a held Space is now prevented/consumed but opens only once; an in-flight guard
  prevents a keydown plus synthesized click from opening twice; the shown-key read is null-safe.
- Reduced-motion test gap: implementation has both the JS hook and the CSS media rule; the
  browser test measures computed CSS only. The behavior is correct; the gap is noted.
- Coverage: the test author added five focused rows for the unlisted/rejected open retry,
  already-shown/panel focus, held Space, the `title` fallback and the `title`/`aria-keyshortcuts`
  restore; `fishball-ui.brand` is 58/58 (rc.5) and 59/59 (rc.1). The rest of the reviewer's gaps are
  UI-shell modelling gaps (the scripted shell is not aria-hidden), noted rather than hidden.
- Hygiene: `client.brand.js` is added to the package `files` and the `//exports`/README text; the
  model-dialog constant fix was needed to make a pre-existing MULTI-1 row run (test-only).

## Limitations and residual risks

- If the brand chunk is slow, fails, or unmounts, the wide button is unavailable. The page's
  separate Fishball footer entry remains the way back to the manager.
- macOS Desktop (`darwinDesktop`) and rc.1's `!canStartSession` render the brand row as a `<span>`,
  not a button: the artwork and theme render, but there is no button to capture, set the name on,
  or focus; the hidden status is inside the shell's `aria-hidden` wrapper there. Web is the tested
  target. The Windows titlebar's collapsed rail renders no mark at all.
- The rail mark is decorative inside the shell's toggle; it cannot carry the Fishball accessible
  name or activation without breaking collapse/expand. The expanded brand row is the control.
- rc.5's 44px collapsed narrow bar has no brand row (the page's existing bar restyle hides the rail
  mark); the 390 shots use the expanded sheet. rc.1's 390 drawer shows the brand row.
- The status is the page→core ask link and the manager, not any single DSH target's link; per-target
  states stay in the DSH targets card. A live asks stream with no manager yet reads Offline.
- Two SSE streams are opened for the brand (strip and asks) in addition to the existing parts; they
  close with the slots and Reconnect is shared. Not shared to avoid coupling the chunks.
- The working stills pause the CSS animation at a wag/swim frame; the live app animates. Reduced
  motion removes the animation class and the CSS rule also disables it; the browser test checks the
  computed CSS under emulated media, not a live `matchMedia` change.

## Anything that could not be done, and why

- The rail's mark is not Fishball's clickable control: it lives inside DSH's collapse/expand button,
  and hijacking that would break the rail. It still shows the artwork and status; expanding reaches
  the real brand control.
- rc.5's 44px collapsed narrow bar has no brand row: `fishball-page`'s existing narrow restyle hides
  the rail mark and uses DSH's open-sidebar glyph; the logo is shown when the sidebar is expanded as
  the sheet. 390 shots use that expanded state.
- No manager activation from the logo on macOS Desktop (both SDKs), or on rc.1 when `session/create`
  is denied. The host draws a span: it displays the selected artwork and status but cannot be focused
  or activated as the manager button. Use the Fishball footer entry instead.
- No native rc.1 drawer activation test: the `brand/cases.mjs` “drawer” row repeats the scripted
  wide shell. It does not exercise opening the real drawer or its focus and event handling.
- The status count is the number of open ask cards core sends; answered/closed/voided cards do not
  count. The connection is the page→core asks stream, not any one DSH target's link; target states
  stay in the DSH targets card.
- Screenshot table: `SHOTS.md` lists all 128 files and their checks; `checks.json` is the same data.
