# fishball-board

Fishball's session-linked work board. It ships in the release inside the
[`fishball-amenities`](<../fishball-amenities/README.md>) umbrella, and can be installed on its own. It has
no browser code. Version `1.0.0-alpha.1`, DSH `>=0.2.1-rc.5`.

## What it does

It gives Fishball's manager session the tools `board_write`, `board_read` and `board_search` (manager
scope only, through `fishballInstance.manager.registerSetup`), over a board kept in
`<profile home>/fishball-board/` (`board.json` and an append-only `archive.jsonl`: a card closed 30 days
ago or more is no longer on the board, and no archived record is deleted).

It needs `fishball-core` in the same DSH; without it the row loads, logs `fishball-core-missing` once
and stays idle. Known limit: it binds `fishballInstance` apiVersion 1 (its frozen contract), and
fishball-core is at apiVersion 2 since MULTI-0, so beside today's core it also stays idle until the
board is updated to core's current contract (DESIGN §33). Core and fishball-ui name the board nowhere
(SHELVE-BOARD). Its settings (`inject`, `contextCards`, `doneWindowHours`) are read by nothing yet, so
no settings page offers them.

## Structure

| path | what |
|---|---|
| `package.json`, `cordis.patch.yml` | manifest (depends on and bundles `fishball-shared`) and the patch inserting row `fishball-board` |
| `index.js` | the row: binds `fishballInstance` (`fishball-shared/instance-follower`), registers the tools in the manager's scope |
| `src/board.js` | `board_write` / `board_read` and the manager-only guard |
| `src/search.js` | `board_search` |
| `src/store.js`, `src/archive.js` | the board file and the append-only archive |
| `src/transitions.js`, `src/ids.js` | card status transitions and ids |
| `src/config.js`, `src/constants.js` | the row's `Config` and values |
| `assets/` | the plugin icon |
| `tests/` | its own tests (not shipped) |

## Testing

```bash
node scripts/test.mjs fishball-board
node scripts/test.mjs fishball-board --file=peers
node scripts/test.mjs fishball-board --against=<git-ref>
```

| entry | what it covers |
|---|---|
| `peers.test.mjs` | the board without core (`fishball-core-missing`, boot ok, does nothing), with a fake core (its manager setup), the 30-day visibility window and the append-only archive (7 cases) |

Details and the case-id index: [tests/README.md](<tests/README.md>). Integration:
[`integration-amenities`](<../integration-amenities/README.md>) checks the board's `Config` through DSH's
settings service and its icon in the family; [`integration-release`](<../integration-release/>) the
package boundaries and release folder. Rules and runner: [docs/testing/README.md](<../../docs/testing/README.md>).
