# `fishball-taskboard`: Fishball's own task board and memo pad

Status: built 2026-11-21 on `feat/fishball-taskboard` (base `plugins-from-main-dsh` `165b734c`). Four
choices the user has not answered yet are marked **PENDING**; their provisional values are the
recommended answers, each one constant in `taskboard/src/constants.js`.

## 1. What it is

A component of the `fishball-amenities` bundle, beside the shelved `fishball-board`:
- Fishball gets manager-only tools to create tasks, break a goal into subtasks, update a task's
  status and progress, keep memos and read the board.
- Tasks are **not linked to sessions**: no field names a session, an event or a turn.
- The user views and edits the board in the UI at any time. Each save that changes the board wakes
  Fishball with one message describing what the user changed.
- The board lives in DSH's storage domain (`fishball_taskboard`), so it survives restarts.
- After every successful compaction of Fishball's context, if the board has unfinished tasks, one
  short reminder line is queued into Fishball's context.

### Why a sibling of `fishball-board`, not built on it

`fishball-board` (shelved, `board/`) is session-centred: a card waits on `ses:<id>`, links to
`ses:`/`ev:`/`bd_` references and keeps an append-only archive. Its panel is read-only by the
user's decision (board Q3 A) and its cards are flat, with no subtasks or progress. The taskboard
needs the opposite on each point: no session links, user editing, a task tree, progress, memos and a
compaction reminder. Building on the board would change a shelved package's frozen contract, and a
later unshelving of the board would then carry taskboard behaviour. So the taskboard is its own
component with its own sub-package (`taskboard/package.json`, as `core/ui/fishball-page` has one),
which makes its browser half its own `dsh.client` package. It reuses only the board's generic
`followInstance` / `reportCoreMissing` (`board/src/instance.js`, unchanged).

## 2. Data

One document, the domain's global value, so every change is one atomic write:

```
{ revision: number,      // +1 per committed change; 0 for a new board
  tasks: Task[],         // display order
  memos: Memo[] }
Task = { id: 't_<uuid>', parentId: string | null, title, note,
         status: 'todo' | 'in_progress' | 'blocked' | 'done' | 'dropped',
         progress: integer 0–100, createdAt, updatedAt }       // times: epoch ms
Memo = { id: 'm_<uuid>', text, createdAt, updatedAt }
```

- **Unfinished** = `todo`, `in_progress` or `blocked`. **PENDING (statuses)**: the user may prefer
  `todo`, `in_progress`, `done`.
- **Memo pad** = a list of memos. **PENDING (memo)**: the user may prefer one free-text pad.
- Progress is independent of status, and a parent's status or progress is never derived from its
  subtasks: no such rule was given.
- A new task is `todo`, progress 0, note `''`, unless the caller gives them.

**Limits** (**PENDING (limits)**), in Unicode code points after trimming; every check refuses,
nothing is clamped or cut. The limits bound writes only: loading checks the stored board's
structure (types, unique ids, existing parents, no cycle), so a later, smaller limit never makes an
existing board unreadable:

| Field | Bound |
|---|---|
| task title | 1–200 |
| task note | 0–2000 |
| memo text | 1–4000 |
| tasks | ≤ 500 |
| memos | ≤ 200 |
| depth (top level = 1) | ≤ 5 |
| progress | integer 0–100 |

## 3. Fishball's tools

Registered only in the manager's scope (X2 `manager.registerSetup('fishball-taskboard', …)`), and
checked again at run time: the caller's `exec.agent.session.id` must be `manager.sessionId()`,
else `{ok: false, code: 'not-manager'}`. A refusal is always the returned value
`{ok: false, code, field?}`; the tools never throw. One exception is DSH's: arguments that are not
a JSON object at all are refused by DSH's own tool registry (`ToolArgsError`) before the tool runs.
No field is marked required in the schema (each description says "Required."), so a missing
`tasks` or `id` gets the typed `invalid-input` refusal with that field.

| Tool | Parameters | Success value |
|---|---|---|
| `taskboard_read` | none | `{ok: true, revision, unfinished, tasks, memos}` |
| `taskboard_add` | `tasks` (required, 1+ items): `{title, note?, status?, progress?, subtasks?}`, `subtasks` the same shape, recursively; `parentId?` an existing task to add under | `{ok: true, revision, created: [{id, parentId, title}]}`, depth-first in item order |
| `taskboard_update` | `id` (required) and at least one of `title`, `note`, `status`, `progress` | `{ok: true, revision, task}` |
| `taskboard_memo` | no `id`: add (`text` required); `id` + `text`: replace the text; `id` + `delete: true`: delete | `{ok: true, revision, memo}` or `{ok: true, revision, deleted: id}` |

- `taskboard_add` is how Fishball breaks a goal down: `parentId` = the goal, `tasks` = its
  subtasks. One call is one write: one invalid item refuses the whole call and changes nothing.
- An update that changes nothing commits nothing and keeps the revision.
- **PENDING (delete)**: Fishball cannot delete a task (it can set `dropped`); only the user deletes,
  in the UI, and deleting a task deletes its subtasks.
- Codes: `not-manager`; `invalid-input`; `not-found`; `limit-reached`; `board-unavailable`
  (storage failed). `field` is the path of what failed: `tasks[0].subtasks[1].progress`, an unknown
  key such as `colour` or `tasks[0].colour`, `parentId` / `id` for `not-found`, `depth`, `tasks` or
  `memos` for `limit-reached`, and `title|note|status|progress` for an update naming no field.
- Titles, notes and memo texts are stored trimmed.

## 4. The UI

A **right sidebar tab** "Task board" (kind `fishball-taskboard`), opened from a checklist header
action in the conversation header and from the right sidebar's guide page.

The tab follows the board live (SSE) and shows the task tree (status, title, progress bar, note;
done and dropped dimmed), the memos, and the unfinished count. The tab stays mounted while hidden (`keepMounted`), so a draft
survives hiding the column, switching sessions or docking. **Edit** opens a draft: every field is
editable; the user can add tasks, add a subtask under any task, delete a task (with its subtasks),
and add, edit or delete memos. **Save** commits the draft, **Cancel** drops it; a refused save names the item and marks its row. While a draft is open,
Fishball's changes are not mixed into it: a banner says the board changed meanwhile, and a save is
refused as stale with the draft kept, so nothing typed is lost; **Reload** drops the draft.

### Routes (DSH `connection.fetch`: owner-only, same-origin)

| Route | Answer |
|---|---|
| `GET /api/fishball-taskboard/board` | 200 the document plus `unfinished`; 503 `{ok: false, code: 'board-unavailable'}` |
| `GET /api/fishball-taskboard/events` | SSE; each frame is the GET body: one at once, then one per committed change |
| `POST /api/fishball-taskboard/board` | body `{baseRevision, tasks, memos}`, the complete wanted board. 200 `{ok: true, revision, changed, notified}`; 400 `{ok: false, code: 'invalid-input', field?}`; 409 `{ok: false, code: 'stale', revision}`; 503 `{ok: false, code: 'board-unavailable'}` |

POST: items are complete (tasks `{id, parentId, title, note, status, progress}`, memos `{id, text}`;
`createdAt`/`updatedAt` may be sent and are ignored). An id the board has is an edit of that item; an unknown id is a new item and must match
`t_<uuid>` / `m_<uuid>`; a current id the body leaves out is deleted. The tool bounds apply, and a
task's `parentId` must name a task of the body (or be `null`), with no cycle. Client
`createdAt`/`updatedAt` are ignored. A change of order alone is a change. Errors: 400 `invalid-input` or `limit-reached` with the same
`field` paths as the tools (`tasks[2].title`, `tasks[1].id` for a duplicate or malformed new id,
`memos[0].text`, `baseRevision`); unparsable JSON is 400 `invalid-input` with no field. A body equal to the board commits nothing: `changed: false`,
`notified: false`, and Fishball is not woken.

## 5. Waking Fishball after a user save

After a committed save the row calls `manager.notify({pluginId: 'fishball-taskboard', dedupeKey:
'fishball-taskboard:user-edit:<uuid>', text, wake: true})`. The text is one heading line, then one
line per change:

```
The user edited your task board in the UI (revision 7):
- deleted task "Old idea" and its 2 subtasks
- changed task "Plan trip": status todo → in_progress; progress 0% → 30%
- added task "Book flights" under "Plan trip"
- added memo "Passport expires in May"
Call taskboard_read for the whole board.
```

Line forms, in this order: deleted tasks (`- deleted task "X"`, or `… and its 1 subtask` / `and its N
subtasks`, N counting every descendant deleted in the same save), then added and changed tasks in
the new board order (`- added task "X"` with ` under "P"` for a subtask; `- changed task "<old
title>": ` and the parts `title "a" → "b"`, `note "a" → "b"`, `status a → b`, `progress a% → b%`,
`moved under "P"` / `moved to the top level`, joined by `; `), then `- reordered the tasks` when the
kept tasks changed order; then memos the same way (`- deleted memo "x"`, `- added memo "x"`,
`- changed memo "a" → "b"`, `- reordered the memos`). A quoted text is JSON-quoted; longer than 160
code points it is its first 160 followed by `…`. After 40 change lines the rest is one
`- …and 1 more change` / `- …and N more changes` line. `notified` is true when `notify` resolves
(any status).

**Delivery and the wake batching (DESIGN §29).** `manager.notify` is core's X10 notice path: a
`wake: true` notice is queued with `Agent.followup` at once, as its own turn (after the running
one, if Fishball is busy). It is not one of the link events core's delivery list batches, so a
user's save is never held for the quiet window or merged into an event batch; and its source kind
is `fishball-notice`, not `user`, so the delivery list's pre-step rule does not pull waiting events
into it either. The notice is durable (core's notify-keys ledger), so a restart before acceptance
delivers it then. **Known gap (core's, not the taskboard's):** while Fishball is running a turn the
notice waits in DSH's inbox as a followup; if the user then presses Stop, DSH clears the inbox and
core, which already counted the notice accepted, does not deliver it again (the limit
`core/src/events/delivery.js` describes for queued followups). The board keeps the change. If `notify` refuses (core missing, closed), the save still stands and the route
answers `notified: false`; the tab then says Fishball was not told.

## 6. The compaction reminder

The row's X2 setup listens to `session/event` of the manager's live session. On `compaction/end`
without `error` (a successful compaction), if the board has unfinished tasks, it queues one message
with `agent.inject` (context for the next model step; it never wakes Fishball by itself). The inject
runs on the next microtask, with the count read then, because dsh-session refuses an append while
it is still publishing `compaction/end`:

```
Reminder: your task board still has 1 unfinished task; call taskboard_read to see them.
Reminder: your task board still has 3 unfinished tasks; call taskboard_read to see them.
```

User role, source `{kind: 'fishball-notice', form: 'plugin', pluginId: 'fishball-taskboard'}`.
Nothing is queued for a failed compaction, for another session, or when no task is unfinished.

## 7. Without core

As the board (R-FB-06): with no compatible `fishballInstance` (`apiVersion` 2) the row registers no
tools and logs one `fishball-core-missing` line at app ready. Its routes still serve the board, so
the user can see and edit it; a save then answers `notified: false`.
