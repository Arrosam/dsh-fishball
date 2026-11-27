# fishball-taskboard

Fishball's own task board and memo pad: tasks with subtasks, status and progress, not linked to
sessions. The user views and edits it in the right sidebar's **Task board** tab, and each save wakes
Fishball with what changed. See [the design](<../../dsh-fishball/docs/plugins/fishball-taskboard.md>) and DESIGN §31.
Version `1.0.0-alpha.1`, DSH `>=0.2.1-rc.5`.

## What it does

- **Tools** (manager scope only, through `fishballInstance.manager.registerSetup`, checked again against
  the manager's session id): `taskboard_read`, `taskboard_add` (with nested `subtasks` and `parentId`),
  `taskboard_update`, `taskboard_memo`.
- **Storage**: one record in DSH's storage domain `fishball_taskboard`, one atomic write per change; it
  survives restarts.
- **Task board tab** (`client.js`): a right-sidebar tab; a draft is saved as one POST of the whole board
  to `/api/fishball-taskboard/board`, refused `stale` if Fishball changed it meanwhile. With fishball-ui
  on the page it reads the board as the `fishball-taskboard` topic of core's one page stream (DESIGN §34);
  without fishball-ui it falls back to its own `/api/fishball-taskboard/events`.
- **Wake**: a save that changes the board wakes Fishball once with what changed (`manager.notify({wake:
  true})`), outside core's event batching.
- **Compaction reminder**: the manager’s first model request after a successful compaction gets the
  current memos, newest first, and an unfinished-task count. The block is capped at 4,000 characters
  and reports any omitted memos. An empty memo pad adds no context.
- The memo form, the statuses (todo, in_progress, blocked, done, dropped), who deletes (only the user)
  and the limits are provisional values, PENDING the user's answer.

Install it on its own, or with the other amenities through the
[`fishball-amenities`](<../fishball-amenities/README.md>) umbrella. Its routes and tab work without
`fishball-core`; its tools, the wake and the compaction reminder need core in the same DSH (without it the
row logs `fishball-core-missing` once). It is the only amenity with browser code (`client.js`).

## Structure

| path | what |
|---|---|
| `package.json`, `cordis.patch.yml` | manifest (`dsh.client` web; depends on and bundles `fishball-shared`) and the patch inserting row `fishball-taskboard` |
| `index.js` | the row: opens the store, serves the routes, binds `fishballInstance` for the tools, the reminder and the page-stream topic |
| `client.js` | the Task board tab (browser half) |
| `src/board.js` | the board's pure rules: field bounds, the task tree, the four changes |
| `src/store.js` | the storage-domain record |
| `src/tools.js` | the four model tools |
| `src/routes.js` | `/api/fishball-taskboard/board` (GET, POST) and `/api/fishball-taskboard/events` (SSE) |
| `src/message.js` | the wake message after a user's save |
| `src/reminder.js` | the compaction reminder |
| `src/constants.js` | the row's values (the PENDING ones defined only here) |
| `assets/` | the plugin icon |
| `tests/` | its own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-taskboard
node scripts/test.mjs fishball-taskboard --file=view
node scripts/test.mjs fishball-taskboard --against=746a18e0^ -- --test-name-pattern=TBV-B1   # the bar-fill regression rows (8 of 10 fail)
```

| entry | what it covers |
|---|---|
| `taskboard.test.mjs` | the row: tools, routes, wake notice, compaction reminder, persistence, the package surface (154 cases) |
| `view.test.mjs` | the Task board tab, scripted and rendered in headless Chromium, light and dark (112 cases) |

Details, the regression rows and the case-id index: [tests/README.md](<tests/README.md>). Integration:
[`integration-page-stream`](<../../dsh-fishball/packages/integration-page-stream/README.md>) (the tab on fishball-ui's page carrier and the
row's topic on core's page stream), [`integration-amenities`](<../../dsh-fishball/packages/integration-amenities/README.md>) (the icon
family), [`integration-release`](<../../dsh-fishball/packages/integration-release/README.md>) (package boundaries, release folder). Rules and
runner: [docs/testing/README.md](<../../dsh-fishball/docs/testing/README.md>).
