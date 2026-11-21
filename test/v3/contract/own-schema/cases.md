# F-OWN-SCHEMA use cases

Sources: design 9a531192 §1.0/§1.0b rows 1–2/§1.0c, R-ARCH-10; K3a core-owned MCP and LINK. The direct task supersedes the historical shared-library location: these values belong to core/contracts/constants.js.

The suite moved here from dsh-connector with fishball-core (split 6b7c53bf). The rows that compare
against the real connector moved to dsh-connector with it; its K1/K2/K3 suites own them.

## Use cases
- OWN-UC-01: install core independently: neither generated vendor tree, generator, export nor packed vendor entry remains.
- OWN-UC-02: load non-V2 Fishball modules without any DSH-side package; V2 imports remain only the connector's contract until REMOVE-V2.
- OWN-UC-03..05 (targets, ids, names, tools and event headers through the connector oracle; the real
  connector over HTTP; both metadata documents): dsh-connector's K1/K2/K3 suites.

## Derived cases
| ID | Technique | Partitions/boundaries / expected result |
|---|---|---|
| OWN-ARCH | Decision table, EP | vendor directory, generator, package export, packed files absent; non-V2 import edges to DSH side or another package folder forbidden; V2 only dsh-connector/contract; peer removal TODO REMOVE-V2 |
| OWN-LINK | — | the real-connector comparisons moved to dsh-connector (split 6b7c53bf), recorded as a TODO row here |

No child DSH or browser is launched.
