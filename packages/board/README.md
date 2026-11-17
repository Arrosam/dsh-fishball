# fishball-board

Fishball's work board, a plugin of the Fishball set (`fishball-core`, `fishball-ui`,
`fishball-board`), version `1.0.0-alpha.1`. Requires DSH `>=0.2.1-rc.5`; it uses only the
Schemastery API shared by `0.2.1-rc.5` and `0.2.2-rc.1`.

In hosted mode you do not install it: `dsh-instance` places it in Fishball's child at every start.
In a standalone Fishball DSH you install it with DSH's plugin management, before `fishball-core`
(see the [root README](<../../README.md>)).

## What it does

The bundle patch inserts one row, `fishball-board`. The row requires `tools` and looks up
fishball-core's public `fishballInstance` service at runtime through `ctx.get`; it registers its
tools only in the manager's own agent scope (`fishballInstance.manager.registerSetup`), so no other
session sees them. The package has no peer dependency on any Fishball package. Both supported Cordis
versions treat injected names literally, so `fishballInstance?` must not be in `inject`: it would
block the row. Without fishball-core the row logs one `fishball-core-missing` line at
DSH's app ready and does nothing else; the DSH boots as usual.

Tools: `board_read`, `board_write` (the complete list of open cards; `{id, clear: true}` takes a done or dropped
card off the board early) and `board_search` (literal, case-insensitive search over the whole
history, archived cards included).

## Row settings

| Setting | Default | Accepted values | Intended contribution |
| --- | --- | --- | --- |
| `inject` | `true` | boolean | Board context only; the guide and tools are independent. |
| `contextCards` | `20` | integer 0–30 | Maximum context cards; zero means only the counts line. |
| `doneWindowHours` | `24` | integer 0–168 | Recent-done count only, never a panel cutoff or retention setting. |

Constants define the six statuses, transition table, relations, refusal codes,
text/card/link budgets and context ordering.

## Visibility and the archive

A Done or Dropped card stays on the board while **less than 30 days** (a day is 86 400 s) have
passed since it closed. At exactly 30 days it leaves the board; the window
is half-open, not inclusive: `at - card.closedAt < BOARD_LIMITS.visibilityDays *
STORAGE.millisecondsPerDay` (`src/store.js`). That window is not a deletion age: no board record is
deleted while the board is installed, and `board_search` finds archived cards. The recent-done
count does not shorten the window. There is no archive export.

## Removing the board

The board keeps its data in `fishball-board/` (`board.json` and the append-only `archive.jsonl`)
inside the DSH home of the DSH that runs it.

- **Hosted mode:** that is the Fishball child's home, inside the instance's runtime tree, so the
  instance's `uninstall.js` deletes it.
- **Standalone mode:** removing `fishball-board` with DSH's plugin management leaves
  `<DSH home>/fishball-board/` on disk. DSH's remove gives a plugin no hook, and it disables the row
  first, so the board cannot tell a removal from a disable. **We recommend that you delete that
  folder yourself** after removing the plugin.

The board does not change the main DSH profile or launch a child.
