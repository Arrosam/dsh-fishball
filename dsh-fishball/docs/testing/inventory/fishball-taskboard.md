# Old-test behaviour inventory: fishball-taskboard

Generated from the baseline run of `integrate/2026-11-22-fixes` (0377153f) on DSH 0.2.1-rc.5 and 0.2.2-rc.1, before the restructure.
One row per case id of an old suite: the number of distinct behaviours (test names, SDK folded) it registered,
their baseline results, and one sample title. **Where now** is filled in by the port: the new test file, or
`retired: <reason>` (withdrawn, todo placeholder, subject moved to another repository), or `bug: <report id>`.

## test/v3/fishball-taskboard

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| TB-BVA-01 | 7 | pass 7 | TB-BVA-01 row 1 title 0: invalid-input tasks[0].title / title (provisional: PENDING (limits)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-02 | 4 | pass 4 | TB-BVA-02 row 1 note 0 code points: accepted (provisional: PENDING (limits)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-03 | 4 | pass 4 | TB-BVA-03 row 1 memo text 0 code points: invalid-input field text (provisional: PENDING (limits), provisional: PENDING (memo)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-04 | 6 | pass 6 | TB-BVA-04 row 1 progress -1: invalid-input progress / tasks[0].progress (DOC §2) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-05 | 3 | pass 3 | TB-BVA-05 row 1 taskboard_add of a chain of depth 5 is accepted; depth 6 is limit-reached, field depth, nothing created (provisional: PENDING (limits)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-06 | 3 | pass 3 | TB-BVA-06 row 1 tasks: 499 then 1 = 500 accepted; the 501st is limit-reached, field tasks (provisional: PENDING (limits)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-07 | 1 | pass 1 | TB-BVA-07 row 1 memos: POST with 201 is 400 limit-reached, field memos; 199 by POST then 1 by the tool = 200 accepted; the 201st is limit-reached, field memos ( | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-08 | 4 | pass 4 | TB-BVA-08 row 1 a quoted title of 159 ASCII code points in the notice: not cut | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-09 | 4 | pass 4 | TB-BVA-09 row 1 39 change lines: all shown | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-10 | 4 | pass 4 | TB-BVA-10 row 1 the user deletes a task with 0 descendant(s): one line, - deleted task "Old idea"; all are gone (provisional: PENDING (delete)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-11 | 4 | pass 4 | TB-BVA-11 row 1 baseRevision current: 200, committed at current + 1 | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-BVA-12 | 2 | pass 2 | TB-BVA-12 row 1 a successful compaction with 1 unfinished task(s): the line reads "Reminder: your task board still has 1 unfinished task; call taskboard_read to | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-DT-01 | 8 | pass 8 | TB-DT-01 row 1 compaction/end, no error, the manager session, 3 unfinished: one reminder naming 3 | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-DT-02 | 8 | pass 8 | TB-DT-02 row 1 an equal body: changed false, notified false, nothing committed, Fishball not woken | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-DT-03 | 14 | pass 14 | TB-DT-03 row 1 the user saves: add a top-level task; the notice lists exactly that | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-DT-04 | 7 | pass 7 | TB-DT-04 row 1 taskboard_memo with no id and a text: add (provisional: PENDING (memo)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-DT-05 | 5 | pass 5 | TB-DT-05 row 1 taskboard_add with a deep subtask with progress 101: invalid-input tasks[0].subtasks[1].progress; no task is created, the revision is kept | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-01 | 4 | pass 4 | TB-EP-01 row 1 the manager's agent: every tool runs | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-02 | 6 | pass 6 | TB-EP-02 blocked taskboard_update to blocked is accepted; unfinished counts it in (provisional: PENDING (statuses)) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-03 | 7 | pass 7 | TB-EP-03 row 1 taskboard_update with an unknown key: invalid-input, field colour; nothing changes | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-04 | 1 | pass 1 | TB-EP-04 row 1 unknown id for update or memo: not-found, field id; unknown parentId for add: not-found, field parentId; nothing changes | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-05 | 7 | pass 7 | TB-EP-05 row 1 taskboard_add with null as arguments: DSH rejects the call (ToolArgsError, DOC §3 exception); nothing changes | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-06 | 1 | pass 1 | TB-EP-06 row 1 a padded title, note and memo text are stored trimmed; a blank title or memo is refused (empty after trimming) | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-07 | 21 | pass 21 | TB-EP-07 row 1 POST with unparsable JSON: 400 invalid-input with no field; the board is unchanged; no notify | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-08 | 5 | pass 5 | TB-EP-08 row 1 fishballInstance apiVersion 2: registers its X2 setup and the tools, no core-missing line | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-09 | 1 | pass 1 | TB-EP-09 row 1 when the storage write fails: a tool answers board-unavailable and POST answers 503 board-unavailable | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-EP-12 | 2 | pass 2 | TB-EP-12 row 1 the row module exports name fishball-taskboard, inject storage + storageDomain + connection, and apply | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-ST-01 | 1 | pass 1 | TB-ST-01 system todo, in_progress, blocked (Fishball); restart; done (user); reopened todo (Fishball); a sibling dropped (user); restart; reminder; goal deleted | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-ST-02 | 1 | pass 1 | TB-ST-02 row 1 an update that changes nothing (same status, same progress, same title and note, the title padded) keeps the revision; a refusal keeps it; a chan | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-ST-03 | 1 | pass 1 | TB-ST-03 row 1 a draft at revision r; Fishball commits r+1; saving the draft is 409 stale (revision r+1), the board unchanged; after a reload the save commits r | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-ST-04 | 2 | pass 2 | TB-ST-04 row 1 core absent: no tools; core arrives: tools and reminders; core leaves: tools withdrawn, no reminder; core again: both back | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-ST-05 | 1 | pass 1 | TB-ST-05 row 1 events: the first frame is the GET body; a tool change and a user save each send one frame; a no-op save and a refused call send none | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-UC-01 | 1 | pass 1 | TB-UC-01 main Fishball creates a goal, breaks it into subtasks, updates status and progress, and reads the tree | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-UC-02 | 1 | pass 1 | TB-UC-02 main a user save that deletes, changes and adds tasks and adds a memo commits once and wakes Fishball with the DOC §5 text | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-UC-03 | 1 | pass 1 | TB-UC-03 main tool and POST results survive a restart: the reopened board is the same document | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-UC-04 | 1 | pass 1 | TB-UC-04 main after a successful compaction of the manager session with unfinished tasks, one reminder line naming the count is injected | packages/fishball-taskboard/tests/taskboard.test.mjs |
| TB-UC-05 | 1 | pass 1 | TB-UC-05 main without fishballInstance: no tools, one fishball-core-missing warn line, the routes still serve and edit the board, a save answers notified: false | packages/fishball-taskboard/tests/taskboard.test.mjs |

## test/v3/fishball-taskboard-view

| case id | behaviours | baseline | sample | where now |
|---|---|---|---|---|
| 0, | 13 | pass 13 | TBV-B1-BVA-01 dark 0% an open task at progress 0 in the dark theme: fill width = 0% of the track (±1 px), height = track's when p > 0, width 0 at 0, colour visi | packages/fishball-taskboard/tests/view.test.mjs (not an id: the inventory's parser split "0, 1, 40, 99, 100"-style names; its 13 behaviours are TBV-B1-BVA-01 (10) and TBV-V1-EP-01 (3), both ported) |
| TBV-E1-ST-01 | 1 | pass 1 | TBV-E1-ST-01 collapsed view → edit → cancel a collapsed parent in view mode does not hide rows in edit mode; Cancel returns to view mode with no request | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-E1-UC-01 | 1 | pass 1 | TBV-E1-UC-01 every task, every field Edit → [data-fishball-taskboard="edit"]: every task in tree order (no condensing, no Completed group, no collapse) with Tit | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-E2-DT-01 | 7 | pass 7 | TBV-E2-DT-01 changed, not told a save answered changed, not told → view mode and "Saved, but Fishball could not be told right now." | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-E2-ST-01 | 1 | pass 1 | TBV-E2-ST-01 board changes while editing → Reload a new board frame during edit shows the "changed while you were editing" notice with Reload and does not touch | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-E2-UC-01 | 1 | pass 1 | TBV-E2-UC-01 the whole draft Save posts {baseRevision, tasks, memos} — every task {id, parentId, title, note, status, progress} with the edit, every memo {id, t | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-FORM-DT-01 | 11 | pass 11 | TBV-FORM-DT-01 done at depth 5 under an open chain view mode: open → full row with bar and "p%"; closed with an open descendant → full row, note, no bar; closed | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V1-BVA-01 | 4 | pass 4 | TBV-V1-BVA-01 D = 0 < E overall bar: absent when E = 0; else aria-valuemin 0, aria-valuemax E, aria-valuenow D, text "D of E done" | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V1-BVA-02 | 6 | pass 6 | TBV-V1-BVA-02 D = 0 < E dark the overall bar's fill (first element child) is D/E of the track's rendered width (±1 px) | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V10-DT-01 | 4 | pass 4 | TBV-V10-DT-01 row 0 task(s), 0 memo(s) one [data-fishball-empty] "Nothing yet." per empty section (tasks, memos); no summary without tasks | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V11-EP-01 | 2 | pass 2 | TBV-V11-EP-01 row 1 memo(s) view mode: each memo is li[data-fishball-memo=<id>] showing its text, in board order, not an editable field | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V12-BVA-01 | 2 | pass 2 | TBV-V12-BVA-01 row 280 px dark at a 280 px tab with 200-character unbreakable titles, a 2000-character note, a depth-5 chain, condensed rows and the Completed g | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V2-DT-01 | 12 | pass 12 | TBV-V2-DT-01 blocked, brand deepseek, dark the bar fill colour is DSH --dsw-alias-state-warn-primary | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V2-EP-01 | 12 | pass 12 | TBV-V2-EP-01 blocked, a note, 0% an open row: title, status chip with the label, one progressbar (aria 0..100, valuenow p), "p%" text, the note only when non-em | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V4-DT-01 | 8 | pass 8 | TBV-V4-DT-01 done, Completed group, dark a done condensed row: border colour RGB = --dsw-alias-state-success-primary, box-shadow not none | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V6-EP-01 | 3 | pass 3 | TBV-V6-EP-01 descendants only a condensed row with details is a button with aria-expanded="false" | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V6-ST-01 | 1 | pass 1 | TBV-V6-ST-01 collapsed → expanded → collapsed a condensed row with a note and children: toggle aria-expanded false, no details; press → true, details with the n | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V6-ST-02 | 1 | pass 1 | TBV-V6-ST-02 direct children only, each its own toggle expanding reveals the direct children only (a grandchild only when its parent is expanded); a revealed ch | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V7-BVA-01 | 4 | pass 4 | TBV-V7-BVA-01 every task closed the Completed group holds the top-level closed subtrees: absent at n = 0, else its button reads "Completed (n)", aria-expanded f | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V7-ST-01 | 1 | pass 1 | TBV-V7-ST-01 collapsed → expanded → collapsed expanding shows the grouped tasks as condensed rows inside the group (not in the main list), their descendants not | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V8-EP-01 | 5 | pass 5 | TBV-V8-EP-01 condensed row with children no "Collapse subtasks" button (no child, or not a full row) | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V8-ST-01 | 1 | pass 1 | TBV-V8-ST-01 expanded → collapsed → expanded collapsing the top of a depth-5 chain hides every descendant row (label "Expand subtasks", aria-expanded false), a  | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V8-ST-02 | 1 | pass 1 | TBV-V8-ST-02 reset on remount a collapsed parent is expanded again after the tab remounts | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V9-BVA-01 | 6 | pass 6 | TBV-V9-BVA-01 empty an empty note draws no [data-fishball-note] | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V9-EP-02 | 2 | pass 2 | TBV-V9-EP-02 muted dark rendered: the note is muted — its colour is not the title's colour | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V9-ST-01 | 1 | pass 1 | TBV-V9-ST-01 more → less → more pressing Show more makes it "Show less" (aria-expanded true); again → "Show more" (false); no request | packages/fishball-taskboard/tests/view.test.mjs |
| TBV-V9-ST-02 | 1 | pass 1 | TBV-V9-ST-02 clamped is shorter rendered: a long note is drawn shorter while clamped than after Show more | packages/fishball-taskboard/tests/view.test.mjs |
