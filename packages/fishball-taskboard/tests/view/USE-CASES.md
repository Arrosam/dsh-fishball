# fishball-taskboard view: derived cases (the Task board tab)

Written from the view requirements only (relayed by the lead, 2026-11-22: `.runtime/repro/VIEW-SPEC.md`,
B1, V1–V12, E1–E2), and the lead's answers given during the run:
- **V6 refinement:** a condensed row is a toggle (a `<button>` with `aria-expanded`) only when it has details (a
  non-empty note and/or descendants). Expanding reveals only the **direct children**, each condensed (V4), and
  each one with details is its own toggle.
- **Title hook:** a task row's title element carries `[data-fishball-title]`.
- **E2:** after a save that ends in `Saved…` or `Nothing changed.`, the tab returns to view mode and shows the
  line. The stale text is exactly `Not saved: the board changed meanwhile. Your draft is kept; Reload to start
  again from the current board.`, and the draft is kept in edit mode.

No implementation file was read. The hooks are the spec's public markup.

Ported from `test/v3/fishball-taskboard-view` (2026-11-22, the test restructure): the same 27 ids and 112 cases,
registered once on the current DSH (`fishball-test-helpers/cases` `caseName`: `<ID> <row> [DSH <v>] <title>`).

**Levels** ([page.mjs](<page.mjs>)):
- **Scripted (structure and interaction).** fishball-taskboard's real `client.js` runs ALONE in
  `fishball-test-helpers/scripted-page` (`clients: [{id: 'fishball-taskboard', file}]`) with its React shim, the right
  sidebar's two services recorded, and a `fishball-test-helpers/event-source` stand-in answering the tab's own
  stream `/api/fishball-taskboard/events` (no fishball-ui on the page, so no page carrier). Board frames are
  delivered on that stream. Presses call the rendered element's handlers. Requests are the page's recorded fetches.
- **Rendered (layout and colour).** The same drawn tree is written as HTML into `fishball-test-helpers/browser`
  `documentOf`: DSH's page styles, DSH's real theme sheets, then the `<style>` sheets the tab mounted in the page's
  document. It is laid out in a real headless Chromium (`measure`) inside a tab wrapper 360 px wide (280 px for V12).
  Light is `body`; dark is `body[data-ds-dark-theme]`. Rendered rows are skipped where no Chromium exists.
  The scripted page's Icon stand-in draws a bare `<svg>`, which Chromium lays out at its 300×150 default. Each
  icon is therefore written with DSH's own default width and height, read from the current DSH's shipped frontend
  bundle (page.mjs `dshIconSize`). Without this, V12 measured an overflow that real DSH does not have.

Every case runs on the current DSH (day to day) and on each DSH of the release matrix.

## B1: the progress bar's fill (rendered)

| Id | Technique | Rows |
|---|---|---|
| TBV-B1-BVA-01 (10) | BVA × themes | p ∈ {0, 1, 40, 99, 100} × light / dark. Fill = the bar's first element child. Width = p% of the track (±1 px). Height = the track's (±0.5) and > 0 when p > 0. Width 0 at 0. Background alpha > 0 and ≠ the track's. Inside the track. All broken clauses are reported together. |

## V1: summary

| Id | Technique | Rows |
|---|---|---|
| TBV-V1-EP-01 (3) | EP | Mixed depths with one status at 0; exactly one of each status; one task. Checks the h2 `Tasks · n unfinished` (open tasks, every depth) and the chips `[data-fishball-count]` (only statuses with count > 0, in order, each with its number and label). |
| TBV-V1-BVA-01 (4) | BVA on E, D | E = 0 (all dropped) → no overall bar; D = 0 < E; 0 < D < E with a nested done; D = E. Checks aria min 0, max E, now D and the text `D of E done`. |
| TBV-V1-BVA-02 (6, rendered) | BVA × themes | The three E > 0 rows × light / dark: overall fill width = D/E of the track (±1 px). |

## V2–V5, V7: row form (decision table)

Conditions: status (open / done / dropped) × subtree (every descendant closed / ≥ 1 open descendant / none) ×
depth (top level / nested, up to 5) × parent (open / closed). Actions: **full** (title, chip, note; bar and `p%`
only when open), **condensed** (`data-condensed`, title + chip, no note, no bar, no %, descendants not rows),
**grouped** (top level, in the Completed group only), **absent** (not a row). Also checks tree order, no
duplicate rendering, and that a task in place is not in the group.

| Id | Rows |
|---|---|
| TBV-FORM-DT-01 (11) | Open leaf; open parent + done leaf; open parent + dropped child + done grandchild (absent); open parent whose subtree is all closed; done top-level leaf (grouped); dropped top-level + done child (grouped / absent); done top-level + todo child (V5 full, both); dropped depth 2 + todo depth 3 (V5); done → done → blocked (V5 twice); done at depth 5 under an open chain; open parent with a done leaf and a dropped child that has an open child (in place) |
| TBV-V2-EP-01 (12) | Open status × note empty / non-empty × progress 0 / 100. Checks the title hook, the chip label, one progressbar (0..100, valuenow p), `p%`, and a note only when non-empty. |
| TBV-V2-DT-01 (12, rendered) | todo / in_progress / blocked × page brand default / `deepseek` × theme. Fill colour: #EC0A6E (default, todo / in_progress); `--dsw-alias-state-business-primary` (deepseek, todo / in_progress); `--dsw-alias-state-warn-primary` (blocked, any brand). |
| TBV-V4-DT-01 (8, rendered) | done / dropped × in place / in the Completed group × theme. Done: every drawn border side has the RGB of `--dsw-alias-state-success-primary` and box-shadow ≠ none. Dropped: the `[data-fishball-title]` colour = `--dsw-alias-label-tertiary`, and no green border side. |

## V6: the condensed row's toggle

| Id | Technique | Rows |
|---|---|---|
| TBV-V6-EP-01 (3) | EP | Note only / descendants only → one toggle, `aria-expanded="false"`. Neither → a plain line with no toggle. |
| TBV-V6-ST-01 (1) | ST | Collapsed → expanded → collapsed. Expanding gives `[data-fishball-task-details]` with the note and the direct children as condensed rows, and no bar or % anywhere. Collapsing hides them. No request. |
| TBV-V6-ST-02 (1) | ST | Only the direct children are revealed (no grandchild). A child with details is its own toggle; one without is a plain line. Expanding the child reveals the grandchild. No request. |

## V7: Completed group

| Id | Technique | Rows |
|---|---|---|
| TBV-V7-BVA-01 (4) | BVA on n | n = 0 (closed subtrees only under an open or V5 parent) → no group; n = 1; n = 2, one with closed descendants; every task closed. Checks the button `Completed (n)`, `aria-expanded="false"`, and that grouped rows are not rendered. |
| TBV-V7-ST-01 (1) | ST | Collapsed → expanded → collapsed. Grouped tasks show as condensed rows inside the group, their descendants are not rows, and open tasks stay outside. No request. |

## V8: collapse subtasks

| Id | Technique | Rows |
|---|---|---|
| TBV-V8-EP-01 (5) | EP | Open row with 0 children (no button); 1 child; V5 row; open row whose only child is condensed; a condensed row with children (no Collapse button: it is not a full row). The button is `aria-label="Collapse subtasks"` with `aria-expanded="true"`. |
| TBV-V8-ST-01 (1) | ST | Depth-5 chain plus a sibling: collapse hides every descendant (`Expand subtasks`, false) and keeps the sibling; expand restores them. No request. |
| TBV-V8-ST-02 (1) | ST | Collapsed, then remount → expanded again. |

## V9: notes

| Id | Technique | Rows |
|---|---|---|
| TBV-V9-BVA-01 (6) | BVA (code points) | Empty (no note element); 120 (no Show more); 121; 120 astral (240 UTF-16 units, no Show more); 121 astral; short with a line break. Show more has `aria-expanded="false"`. |
| TBV-V9-ST-01 (1) | ST | More → less → more, `aria-expanded` false / true / false. No request. |
| TBV-V9-ST-02 (1, rendered) | ST | A clamped long note is drawn shorter than after Show more. |
| TBV-V9-EP-02 (2, rendered) | EP × themes | "Muted": the note's colour ≠ the title's colour. This is the weakest reading the requirement allows. |

## V10, V11: empty states, memos

| Id | Technique | Rows |
|---|---|---|
| TBV-V10-DT-01 (4) | DT | Tasks 0 / 1 × memos 0 / 1. One `[data-fishball-empty]` `Nothing yet.` per empty section, and no summary without tasks. |
| TBV-V11-EP-01 (2) | EP | 1 and 3 memos: `li[data-fishball-memo=<id>]` in board order, each showing its text, with no editable field in view mode. |

## V12: narrow sidebar (rendered)

| Id | Rows |
|---|---|
| TBV-V12-BVA-01 (2) | At 280 px, light and dark: 200-character unbreakable titles, a 2000-character note, a 4000-character memo, a depth-5 chain, condensed rows, and the Completed group and a condensed row opened. Checks the root's `scrollWidth ≤ clientWidth`. |

## E1, E2: edit mode (behaviour unchanged)

| Id | Technique | Rows |
|---|---|---|
| TBV-E1-UC-01 (1) | UC | Edit → `edit`: every task in tree order (board order differs), with no condensing, Completed group or collapse. Each task has Title, Status, Progress (%), Note, Add subtask and Delete task and its subtasks; each memo has Delete memo; the tab has Add task, Add memo, Save and Cancel. |
| TBV-E1-ST-01 (1) | ST | View (collapsed) → edit (every row) → Cancel → view. No request. |
| TBV-E2-UC-01 (1) | UC | Save posts `{baseRevision, tasks, memos}` with every task's six fields (including the edit) and every memo's `{id, text}` to `api/fishball-taskboard/board`. |
| TBV-E2-DT-01 (7) | DT | Changed and told / changed and not told / nothing changed → view mode plus the line. Stale → edit mode, the exact text, the draft kept. `invalid-input` / `limit-reached` on `tasks[1]` → only that row `aria-invalid`, and its title named. `invalid-input` on `memos[0]` → that memo row marked. |
| TBV-E2-ST-01 (1) | ST | A board frame arrives during edit → the "changed while you were editing" notice, the draft untouched and not mixed with the frame; Reload → the new board, draft dropped. |

## Automatic updates

| Row | Technique | What it covers |
|---|---|---|
| TBV-AUTO-01 (1) | EP | Settings before enabling: discloses the entire task tree and excluded data; opening settings does not write. |
| TBV-AUTO-02 (1) | ST | Batch details and explicit undo confirmation; POST carries only the batch ID/version and board revision; a stale response directs the user to edit manually. |

## Totals

114 cases: B1 10, V1 13, form and colour 43, V6 5, V7 5, V8 7, V9 10, V10–V11 6, V12 2, E 11, AUTO 2.

## Regression

TBV-B1-BVA-01 is the regression row of 746a18e0 ("progress bar fill is display:block (an inline span laid out
0x0 at every value)"):
`node scripts/test.mjs fishball-taskboard --against=746a18e0^ -- --test-name-pattern=TBV-B1` fails 8 of 10 (every
p > 0; at p = 0 a 0×0 fill is the right width), and `--against=746a18e0` passes 10 of 10.

## Not here

- Rows that need fishball-ui's page carrier (the `fishballPageStream` service, one connection for every Fishball view):
  none of these 114. The old harness's `boardOnlyPage` already loaded the board without fishball-ui. The board
  on the carrier (fishball-ui.connections CONN-TB-*) is an integration concern.
- The page-stream topic registration port-taskboard-board noted (the row registering its board as core's topic
  `fishball-taskboard`) is a server-side seam with fishball-core, not a component case of the tab: left to integration.
