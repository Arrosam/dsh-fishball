# Local ticket backlog

Planning IDs and approved AC are preserved. All tickets follow the newer [exact official Web baseline](../compatibility.md); Desktop/Electron are owner-excluded and old host results historical. This is local tracking; no remote issues/Project are claimed.

Current owner scheduling: [three development stages](../three-stage-development.md), unit/module tests and independent reviews throughout, consolidated cross-stage functional/visual regression after Stage3. Browser debts are [deferred](../evidence/acceptance-debt.md), not passed. Historical source AC text/IDs remain; current applicability follows the explicit [owner amendment](../owner-amendment-2026-10-04.md).

Current project is dsh-fishball (df). **DF001..DF016 are one-to-one aliases of BUB001..BUB016**; DF007A/B and DF010A preserve their historical same-suffix subtasks. Files retain BUB names so old evidence links remain valid. MIT is selected. No remote issue/Project or publication is claimed.

| ID | Scope | Wave | Status |
|---|---|---|---|
| [BUB001](BUB001.md) | Native plugin bootstrap, config and version checks | W1 bounded Web foundation; remaining product gates later | implemented/tested subset; M1 browser hold |
| [BUB002](BUB002.md) | Main conversation, intake and interruptions | W2 | planned |
| [BUB003](BUB003.md) | Durable tasks and recovery | W1 bounded; integration/retention gates later | implemented/tested subset; M1 browser hold |
| [BUB004](BUB004.md) | Worker DSH lifecycle | W2 | planned |
| [BUB005](BUB005.md) | Scoped intersession messaging | W2 | planned |
| [BUB006](BUB006.md) | Authorization, identity, secrets and security | W1 bounded; live identity and destination gates later | implemented/tested subset; M1 browser hold |
| [BUB007A](BUB007A.md) | fishball extraction, portability and license | W3 after triage/source pin; license review parallel, redistribution gated | planned |
| [BUB007B](BUB007B.md) | Memory adapter, isolation and retrieval | W3 after007A; isolation contracts fromW1 | planned |
| [BUB008](BUB008.md) | Context, summaries and continuity | W2 basic; W3 memory integration | planned |
| [BUB009](BUB009.md) | Events, schedules and webhooks | W4 | planned |
| [BUB010 / DF010](BUB010.md) | Provider-neutral chat adapter contract | W4 | required; live provider out of this phase |
| [BUB011](BUB011.md) | Host tools, environments and handoff | W2 basic; W4 live integrations | planned |
| [BUB012](BUB012.md) | Model, concurrency, resource and budget controls | W1 admission only; W2/W4 full controls | implemented/tested subset; M1 browser hold |
| [BUB013](BUB013.md) | Results, artifacts, progress and delivery | W2 local; W5 complete | planned |
| [BUB014](BUB014.md) | Task UI and control | W2 control contract; W5 actual UI | planned |
| [BUB015](BUB015.md) | Runtime independent audit workflow | W5 (development review required in every wave) | planned |
| [BUB016](BUB016.md) | Aggregate acceptance and open-source packaging | W6, evidence collected throughout | planned |
| [BUB010A / DF010A](BUB010A.md) | one owner-selected provider subtask under010 | future | OUT OF THIS PHASE by explicit owner decision |

[Wave dependencies and parallel ownership](../waves.md). Every applicable ticket requires independent code and ISTQB reviews plus supported validation. Full current preview MVP is W1–W6 with the explicit later chat amendment; no other approved scope is silently cut.
