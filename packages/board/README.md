# fishball-board

W0 B1 skeleton for the Fishball work board, version `0.1.0-alpha.0`.
Requires DSH `>=0.2.1-rc.5`; uses the Schemastery API shared by
`0.2.1-rc.5` and `0.2.2-rc.1`, with no version-dependent behavior.

The bundle patch inserts only the `fishball-board` row. The row requires
`tools` and optionally consumes the public `fishballInstance` service through
`ctx.get`. Both supported Cordis versions treat injected names literally, so
`fishballInstance?` must not be included in `inject`: it would block row activation.
Without that service it logs `instance-hooks-missing` once per application and remains
inert. This skeleton does not register tools, context, routes or UI even when
the service is available; those contributions belong to subsequent board tasks.
It does not import private instance modules or require an MCP transport.

## Row settings

| Setting | Default | Accepted values | Intended contribution |
| --- | --- | --- | --- |
| `inject` | `true` | boolean | Board context only; the guide and tools are independent. |
| `contextCards` | `20` | integer 0–30 | Maximum context cards; zero means only the counts line. |
| `doneWindowHours` | `24` | integer 0–168 | Recent-done count only, never a panel cutoff or retention setting. |

Constants define the six statuses, transition table, relations, refusal codes,
text/card/link budgets and context ordering. U19 defines an inclusive **30-day
visibility window** for Done and Dropped cards, not a deletion age. The archive
remains while installed. Early clear, reopening, archive search and export before
uninstall are later tasks; none of those behaviors is implemented by this skeleton.
The recent-done count does not shorten that visibility window.

Child placement and enable/disable persistence belong to X0-B. Storage and tools
belong to B2–B4; context and the native DSH panel to B5; archive export and search
to B10/B11. This package does not change the main DSH profile or launch a child.
