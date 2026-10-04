# Local ticket backlog

Planning IDs and approved AC are preserved. All tickets follow the newer [exact official Web baseline](../compatibility.md); Desktop/Electron are owner-excluded and old host results historical. This is local tracking; no remote issues/Project are claimed.

Current owner scheduling: [three development stages](../three-stage-development.md), unit/module tests and independent reviews throughout, consolidated cross-stage functional/visual regression after Stage3. Browser debts are [deferred](../evidence/acceptance-debt.md), not passed. Historical source AC text/IDs remain; current applicability follows the explicit [owner amendment](../owner-amendment-2026-10-04.md).

Current project is dsh-fishball (df). **DF001..DF016 are one-to-one aliases of BUB001..BUB016**; DF007A/B and DF010A preserve their historical same-suffix subtasks. Files retain BUB names so old evidence links remain valid. MIT is selected. No remote issue/Project or publication is claimed.

| ID | Scope | Wave | Status |
|---|---|---|---|
| [BUB001](BUB001.md) | Native plugin bootstrap, config and version checks | W1 bounded Web foundation; remaining product gates later | module tested; full acceptance HOLD |
| [BUB002](BUB002.md) | Main conversation, intake and interruptions | W2 | module tested; full acceptance HOLD |
| [BUB003](BUB003.md) | Durable tasks and recovery | W1 bounded; integration/retention gates later | module tested; full acceptance HOLD |
| [BUB004](BUB004.md) | Worker DSH lifecycle | W2 | module tested; full acceptance HOLD |
| [BUB005](BUB005.md) | Scoped intersession messaging | W2 | module tested; full acceptance HOLD |
| [BUB006](BUB006.md) | Authorization, identity, secrets and security | W1 bounded; live identity and destination gates later | module tested; full acceptance HOLD |
| [BUB007A](BUB007A.md) | fishball extraction, portability and license | W3 after triage/source pin; license review parallel, redistribution gated | ESM subset/provenance reviewed; packaging HOLD |
| [BUB007B](BUB007B.md) | Memory adapter, isolation and retrieval | W3 after007A; isolation contracts fromW1 | module tested; full acceptance HOLD |
| [BUB008](BUB008.md) | Context, summaries and continuity | W2 basic; W3 memory integration | module tested; full acceptance HOLD |
| [BUB009](BUB009.md) | Events, schedules and webhooks | W4 | module tested; full acceptance HOLD |
| [BUB010 / DF010](BUB010.md) | Provider-neutral chat adapter contract | W4 | contract module tested; review HOLD; live provider OUT |
| [BUB011](BUB011.md) | Host tools, environments and handoff | W2 basic; W4 live integrations | module tested; full acceptance HOLD |
| [BUB012](BUB012.md) | Model, concurrency, resource and budget controls | W1 admission only; W2/W4 full controls | module tested; full acceptance HOLD |
| [BUB013](BUB013.md) | Results, artifacts, progress and delivery | W2 local; W5 complete | module tested; full acceptance HOLD |
| [BUB014](BUB014.md) | Task UI and control | W2 control contract; W5 actual UI | native panel/UI unit frozen; final review/visual HOLD |
| [BUB015](BUB015.md) | Runtime independent audit workflow | W5 (development review required in every wave) | module tested; full acceptance HOLD |
| [BUB016](BUB016.md) | Aggregate acceptance and open-source packaging | W6, evidence collected throughout | traceability/packaging underway; full acceptance HOLD |
| [BUB010A / DF010A](BUB010A.md) | one owner-selected provider subtask under010 | future | OUT OF THIS PHASE by explicit owner decision |

[Wave dependencies and parallel ownership](../waves.md). Every applicable ticket requires independent code and ISTQB reviews plus supported validation. Full current preview MVP is W1–W6 with the explicit later chat amendment; no other approved scope is silently cut.

Current evidence levels and every retained source criterion are recorded in [acceptance traceability](../acceptance-traceability.md). Final Stage3 code review is blocked by an unresolved reviewer **session failure**, distinct from tool/sandbox approval. Tests and earlier bounded verdicts do not satisfy the final gate. No full ticket or MVP is accepted.
