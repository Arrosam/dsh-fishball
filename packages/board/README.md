# fishball-board

W0 B1 skeleton for the Fishball work board, version `0.1.0-alpha.0`.
Requires DSH `>=0.2.1-rc.5`; uses the Schemastery API shared by
`0.2.1-rc.5` and `0.2.2-rc.1`, with no version-dependent behavior.

The bundle patch inserts only the `fishball-board` row. The row requires
`tools` and looks up fishball-core's public `fishballInstance` service at runtime
through `ctx.get`; the package has no peer dependency on any Fishball package. Both
supported Cordis versions treat injected names literally, so `fishballInstance?` must
not be included in `inject`: it would block row activation. Without fishball-core
(R-FB-06) the row logs one `fishball-core-missing` line at DSH's app ready and does
nothing else; the DSH boots as usual. It does not import private instance modules or
require an MCP transport.

## Row settings

| Setting | Default | Accepted values | Intended contribution |
| --- | --- | --- | --- |
| `inject` | `true` | boolean | Board context only; the guide and tools are independent. |
| `contextCards` | `20` | integer 0–30 | Maximum context cards; zero means only the counts line. |
| `doneWindowHours` | `24` | integer 0–168 | Recent-done count only, never a panel cutoff or retention setting. |

Constants define the six statuses, transition table, relations, refusal codes,
text/card/link budgets and context ordering. A Done or Dropped card stays visible
for **30 days** (a day is 86 400 s) after it closes and is archived at exactly
30 days (R-BRD-01, PLAT-BVA-01); that window is not a deletion age. No board record
is deleted while the board is installed, and `board_search` finds archived cards.
The recent-done count does not shorten that visibility window. There is no archive
export (the user's decision, 2026-11-15).

## Removing the board

The board keeps its data in `fishball-board/` inside the DSH home of the DSH that
runs it.

- **Hosted mode:** that is the Fishball child's home, inside the instance's runtime
  tree, so the instance's uninstall deletes it.
- **Standalone mode:** removing `fishball-board` with DSH's plugin management leaves
  `<DSH home>/fishball-board/` on disk. DSH's remove gives a plugin no hook, and it
  disables the row first, so the board cannot tell a removal from a disable. To remove
  the board's data, delete that folder yourself after removing the plugin.

Child placement and enable/disable persistence belong to X0-B. Storage and tools
belong to B2–B4; context and the native DSH panel to B5; archive search to B11.
This package does not change the main DSH profile or launch a child.
