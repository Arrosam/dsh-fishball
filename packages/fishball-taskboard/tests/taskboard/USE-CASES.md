# fishball-taskboard: derived cases

Written from the user's requirements (relayed by the lead, 2026-11-21), the design document
[docs/plugins/fishball-taskboard.md](../../../../docs/plugins/fishball-taskboard.md) and the lead's answers Q1–Q24
(folded into the document). Only the public surface was used: the row module's exports, its patch
row and package manifest, the tools, the routes, the notify / inject calls and the log line. No
file of `packages/fishball-taskboard/` (`packages/fishball-amenities/taskboard/` before the amenities
split, 2026-11-21) other than `package.json` and `cordis.patch.yml` was read.

**Level.** Integration and system, in-process ([world.mjs](world.mjs)): the real row mounted as a loader
row of the current DSH, over that DSH's real `dsh-storage` + `dsh-storage-json` + `dsh-storage-domain`
in a temp root and a real `SessionStore`. Fakes only for the host services: `connection.fetch` (a
recording registry; routes are called with real `Request`s), `fishballInstance` (apiVersion 2, its own
fiber so it can arrive and leave; X2 `registerSetup` runs each setup as a fiber on the manager's agent
context with a fiber-tied `tools.register`; `notify` records and answers queued / held / rejects; the
live agent's `inject` records) and `appReady`. A restart closes the whole DSH and opens a new one over
the same root. Every case runs once, on the current DSH (`fishball-test-helpers/dsh`); the release run
repeats them over the DSH matrix (docs/testing/README.md).

**Provisional.** The four PENDING choices (statuses, memo, limits, delete) are each one constant in
[constants.mjs](constants.mjs) (`STATUS`/`UNFINISHED`, `LIMIT`, the memo forms, the delete rows); a case that
depends on one says "provisional: PENDING (…)" in its title.

**Decisions taken during the run (the lead, 2026-11-21, now in the document).** The reminder
pluralises ("1 unfinished task" / "n unfinished tasks", DOC §6). Arguments that are not a JSON object
are DOC §3's one exception to "the tools never throw": DSH's own registry rejects them
(`ToolArgsError`) before the tool runs; Q23's first answer for those two rows was withdrawn.

## Use Cases (TB-UC, 5)

| Id | Flow | Oracle |
|---|---|---|
| TB-UC-01 main | Fishball adds a goal, breaks it into subtasks under `parentId`, updates status + progress, reads | tool values, ids `t_<uuid>`, defaults (§2), revision +1 per change, task keys name no session |
| TB-UC-02 main | the user deletes a task with 2 subtasks, changes one, adds a subtask and a memo in one save | 200 `{changed:true, notified:true}`, the board, one notify with §5's exact text |
| TB-UC-03 main | tools and a POST, then a restart | GET and `taskboard_read` equal before/after; the revision continues |
| TB-UC-04 main | successful compaction with 3 unfinished | one inject on the manager live agent, user role, source, the line |
| TB-UC-05 main | no core | no tools, one warn `fishball-core-missing`, routes serve, a save stands with `notified:false` |

## Equivalence Partitioning (TB-EP, 55, incl. 2 surface rows)

| Id | Partitions |
|---|---|
| TB-EP-01 (4) | caller: the manager / another session / core names no manager / no agent → all tools run, or `not-manager` and unchanged |
| TB-EP-02 (6) | each of the 5 statuses (unfinished in/out, provisional) + an unknown status (`status` / `tasks[0].status`) |
| TB-EP-03 (7) | unknown key in update / add item / nested subtask / add top level / memo / a `sessionId` (REQ) / `delete` on update (PENDING delete) → `invalid-input` with the key's path |
| TB-EP-04 (1) | unknown `id` (update, memo replace, memo delete) / unknown `parentId` → `not-found` with field |
| TB-EP-05 (7) | argument shapes: null and a string → DSH rejects (`ToolArgsError`), unchanged; `tasks` a string, no `tasks` → `tasks`; update without `id` → `id`; update naming no field → `title\|note\|status\|progress`; memo add without text → `text` |
| TB-EP-06 (1) | padded texts stored trimmed; blank title / memo refused |
| TB-EP-07 (21) | POST bodies: unparsable JSON (no field), `baseRevision` missing / string / fraction, lists not arrays, unknown keys (top / item), missing `note` / `parentId`, progress "50" / 101, bad status, blank title, malformed / duplicate new id, dangling parent, cycle, bad memo id / blank / missing text → 400 with the path, unchanged, no notify |
| TB-EP-08 (5) | core: apiVersion 2 / absent / apiVersion 1; absent + appReady (line at ready, not at load); present + appReady (no line) |
| TB-EP-09 (1) | storage write fails → tool `board-unavailable`, POST 503 |
| TB-EP-12 (2) | surface: `name`, `inject` (storage, storageDomain, connection), `apply`; its own package's patch row (named by the package) and manifest |

## Boundary Value Analysis (TB-BVA, 46; limits provisional)

| Id | Bound | Values |
|---|---|---|
| TB-BVA-01 (7) | title 1–200 (add and update) | 0, 1, 200, 201, 200 / 201 astral code points, 200 padded |
| TB-BVA-02 (4) | note 0–2000 | 0, 1, 2000, 2001 |
| TB-BVA-03 (4) | memo text 1–4000 (add and replace) | 0, 1, 4000, 4001 |
| TB-BVA-04 (6) | progress integer 0–100 | −1, 0, 100, 101, 1.5, "50" |
| TB-BVA-05 (3) | depth ≤ 5 | chain 5 / 6; under a depth-4 task 1 / 2 levels; under depth 5; POST 5 / 6 |
| TB-BVA-06 (3) | tasks ≤ 500 | 499 + 1, the 501st; one call of 501 / 500; POST 501 / 500 |
| TB-BVA-07 (1) | memos ≤ 200 | POST 201; 199 + 1 = 200; the 201st |
| TB-BVA-08 (4) | quote cut 160 code points | 159, 160 (not cut), 161, 161 astral (first 160 + …) |
| TB-BVA-09 (4) | 40 change lines | 39, 40, 41 (+"1 more change"), 42 (+"2 more changes") |
| TB-BVA-10 (4) | deleted descendants | 0, 1 ("subtask"), 2 (a grandchild counts), 3 |
| TB-BVA-11 (4) | `baseRevision` | current, current − 1, current + 1, −1 → 200 / 409 stale |
| TB-BVA-12 (2) | reminder count wording | 1 ("task"), 2 ("tasks") |

## Decision Tables (TB-DT, 42)

- **TB-DT-01 (8) compaction reminder.** Conditions: event `compaction/end` / `compaction/start`; `error`
  absent / present; session the manager's / another; unfinished > 0 / 0 (all done or dropped) / empty board.
  Action: exactly one reminder naming n, or none. Row 7: one task of each status (n = 3, provisional);
  row 8: two compactions, the count at each.
- **TB-DT-02 (8) save and wake.** Conditions: body equal / equal after trimming / changing; notify queued /
  held / rejects; core present / removed. Actions: `changed`, `notified`, the save stands, notify called.
  Plus: two saves give two unique dedupeKeys; client `createdAt`/`updatedAt` alone are no change.
- **TB-DT-03 (14) change kind → notice line.** Add top-level / subtask; title (old title quoted); note;
  status + progress; all parts in order title, note, status, progress, move; move to top; move under a
  renamed parent (new title); reorder tasks; memo delete / change / add / reorder; every kind at once in
  §5's order.
- **TB-DT-04 (7) `taskboard_memo` forms** (provisional, PENDING memo): text → add; id + text → replace; id +
  delete:true → delete; id alone → `text`; id + text + delete → `delete`; delete without id → `delete`;
  delete:false → `delete`.
- **TB-DT-05 (5) `taskboard_add` atomicity:** a bad deep subtask, a bad second item, a second item over the
  depth, `tasks: []` → refused whole, nothing created; a valid nested call → one write, `created`
  depth-first in item order, appended at the end (Q22).

## State Transitions (TB-ST, 6)

- **TB-ST-01 (system)** one task across two restarts: todo → in_progress → blocked (Fishball) → restart →
  done (user, notice) → todo again (Fishball) → a sibling dropped (user, notice) → restart → compaction →
  reminder (2) → the goal deleted by the user (notice "and its 2 subtasks") → compaction → no reminder.
- **TB-ST-02** revision: no-op updates (same status, progress, title + note, padded title) keep it, a
  refusal keeps it, a change adds 1.
- **TB-ST-03** draft: at r, Fishball commits r+1, the draft's save is 409 stale with r+1 and unchanged;
  after a reload the save commits r+2.
- **TB-ST-04** X2 binding: core absent → arrives (tools, reminders) → leaves (tools withdrawn, no
  reminder) → arrives again; the row removed → no tools, no reminders.
- **TB-ST-05** SSE: first frame = GET body; one frame per tool change and per user save; none for a no-op
  save or a refused call.

## Totals

154 cases: UC 5, EP 55 (2 of them the package-surface rows), BVA 46, DT 42, ST 6. Baseline (old
`test/v3/fishball-taskboard`, 0377153f): 0.2.1-rc.5 154/154 pass, 0.2.2-rc.1 154/154 pass. After the
port (2026-11-22, `node scripts/test.mjs fishball-taskboard`): DSH 0.2.2-rc.5 154/154 pass.
