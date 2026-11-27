# Staging test delta: 0377153f → f8bcb158

This supplement covers the tests added or changed on staging after the baseline inventory was taken.
Paths below are relative to the repository. Existing case IDs continue to refer to the original
inventory; suites without baseline IDs are identified by entry and behavior.

| Staging source | Destination / disposition | Coverage |
|---|---|---|
| `test/v3/fishball-core/{asks,events,link,manager,settings,status,wire}/` | `packages/core/tests/`, matching areas and entry files | Updated fixtures and expectations for native question filtering, runtime settings, link/status and manager/wire behavior; `TURN-OBSERVER` (4), `LINK-PROBE` (3) and `EFIX3-SET-UC-01` (updated in both languages). |
| `packages/core/test/manager-ptc.test.mjs` | `packages/core/tests/manager.test.mjs` | `MGR-PTC`: scoped executor, nested reads, sandbox refusal, persistence and native/PTC history replay. |
| `packages/core/test/manager-question-cards.test.mjs` | `packages/core/tests/manager.test.mjs` | `MGR-QUESTION`: own vs native question tool, non-blocking PTC, persistence, one-shot follow-up after restart. The UI and backend share the staging question data fixture in `packages/test-helpers/manager-question-cards.mjs`. |
| `packages/core/test/permission-handoff.test.mjs` | `packages/core/tests/wire.test.mjs` | `PERMISSION-HANDOFF`: manual and auto escalation, answer path, stale and non-permission offers. |
| `packages/core/test/model-picker.test.mjs` | `packages/core/tests/settings.test.mjs` | `SET-MODEL-PICKER`: split model and effort controls, valid and stale values, default reset. |
| `packages/core/test/start-panels.test.mjs` | `packages/core/tests/start-panels.test.mjs` | `START-PANELS-DT-01`: which Start entries and workspace-files affordances survive in Fishball vs ordinary DSH. |
| `packages/core/test/question-cards-ui.test.mjs` | `packages/core/ui/tests/question-cards.test.mjs` | `ASK-QUESTIONS-ST-01/02`: card summaries and expansion; free text, single choice and multi-choice payloads. |
| `packages/core/test/{message-user-fold,message-user-ptc,selection-quote}.test.mjs` | `packages/integration-page-ui/tests/` | `MSG-FOLD` (11), `MSG-PTC` (7), `SELECTION-QUOTE` (3 subtests): steering and assistant folding; accepted/rejected sends and native/nested bubble counts; selection-to-quote on real Fishball page. |
| `test/v3/fishball-ui/guards/` | `packages/integration-core-ui/tests/guards.test.mjs` | `PLAT-UC-04`: current guard composition and controller-native ask tools vs the Fishball singleton. |
| `test/v3/fishball-ui/{model-dialog,package}/` | `packages/core/ui/tests/` | `MODEL-REMOVED-01/02`: removed page picker stays absent in configured/unset and empty-catalog states; preserves sidebar/session/strip checks. `UI-UC-04` covers surviving chunk order and absence of the retired chunk. The removed dialog behavior itself is retired, not skipped. |
| `test/v3/fishball-taskboard/{cases.mjs,auto-update.test.mjs,auto-world.mjs}` | `packages/fishball-taskboard/tests/{taskboard,auto-update}.test.mjs` | `TB-PG-01–03`, `TB-ST-06`: manager-only guide, order and lifecycle; `TB-AUTO`: 47 opt-in auto-update acceptance cases gated to 0.2.2-rc.3. |
| `test/v3/fishball-taskboard-view/cases.mjs` | `packages/fishball-taskboard/tests/view.test.mjs` | `TBV-AUTO-01/02`: scope disclosure, review history and confirmed, version-fenced undo. |
| `test/v3/fishball-amenities/packages/` | `packages/fishball-amenities/tests/`, `packages/integration-amenities/tests/` and `packages/integration-release/tests/` | `AM-COLLECTION` (2), `AM-EP-07` (workspace), `REL-CONSULTANT` (release order/install set); SDK loader assertions now run on the selected SDK. |
| `packages/fishball-consultant/tests/{consultant,host}.test.js` | `packages/fishball-consultant/tests/{consultant,host}.test.mjs` | Capability and model preflight, disclosure, replay/reconciliation, quotas, lifecycle; registration, routes, discovery, storage and production fail-closed behavior. |

## Follow-up from staging `7fd1d093`

The one-task-per-managed-session assembled-prompt regression from `packages/core/test/manager-ptc.test.mjs` now runs in `packages/core/tests/manager.test.mjs`. It checks release after completion with no rework, no reuse after release, and a new session for each new task.

The existing `packages/integration-page-stream/tests/` suite also accounts for the Taskboard audit topic on the same connection. The existing `TGT-ASK-EP-03`, `HEALTH-DT-01` and `RESHOOT-ASKBADGE-DT-01` cases now check the permission cards via the accordion and keep the contrast checks on its count badge.
