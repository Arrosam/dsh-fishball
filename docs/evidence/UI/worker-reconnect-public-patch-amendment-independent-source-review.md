# Public patch pin amendment — independent affected SOURCE review

Date: 2026-10-07 UTC. Independent Sol 6.1 max source reviewer, separate from root executor and amendment author.

Disposition: **ACCEPTED_WITH_BOUNDARIES at SOURCE level; no concrete affected blocker.** This is the exact public pin amendment to the new root maintenance plan. No full historical review was repeated, no new general verification layer was added, and this lane makes no maintenance/runtime/UI acceptance claim.

The amendment is5611B SHA256 `5c24e655221af7c2d477553caa6b3f753ff9715c4c178edab0e1b9d7c159e924`. New operator-r2 is12906B SHA256 `1360e8b555d7b4b0524a202f800c0022667b2175e89e71dbc570213b7f4d1225`; new owner plan-r2 is5470B SHA256 `c481ea0c6061ff7b64d04d3851f31c5c6b34ec93a08e233336a6330f5cc19b5e`.

## Exact amendment and binding

Each lifecycle template changes exactly one publicInputs row, preserving its actual active profile path. Only bytes5809->6091, SHA eaa33->3f67 and publicSource pointing to the sealed current public snapshot change. Replacing that one row in each entire old JSON document exactly reproduces its new document; every other field,1114-row installed inventory, generation, profile, endpoint, generated-root contract and public dependency remains equal.

Successor template SHA256 is `4d89f7d9004c5e7823ff11ed1b863d9420c8073a2efba7335276587ec1e619d9`; rollback template is `aac72c03074059f61205abc550b42dbf6c841219a3c304bc6b93af5eb2737ac6`. Launcher8457B SHA256 `06769626b327dc4bfe9c726f0cf4e2ec6c2db792dfb76149df657487bb8871dd` is exactly the old launcher with only those two template digest literals substituted. Its runtime instructions, original CLI/Node route, shared stop latch, pre-spawn guard, logs/access handoff and failure handling are unchanged.

The entire operator-r2 is exactly reconstructed from the original by adding one fixed AMENDMENT path, four fixed amendment/template/launcher pins, loading those two pinned lifecycle templates and changing the two copy/compare references to choose AMENDMENT only for lifecycle-pins names. The literal four-name list still chooses unchanged r3 sources for both restart overlays. Original r3 manifest/closure guards remain in place. The stop/activate suffix is byte-identical; ownership, private metadata, exact inventories, absences, no-retry boundaries, one parent SIGINT and reversible directory renames are untouched.

The new plan changes only operator/launcher provenance and current-public-pin amendment/history/status metadata. All other fields, effects, failure semantics, readiness and Mac/UI holds are equal. New operator, copied templates and selected amended launcher have consistent fixed hashes and paths; the amendment does not leave the launcher expecting the old template digests.

## Public configuration semantics and historical failure

The sealed public snapshot is6091B SHA256 `3f67b95920158694e9b5af41a3856db11941a43d18756da61c1cd0c15c50c1f5`. Root's1015B semantic observation SHA256 `cf364f12c0545dcf5ad925e299341c91b89232ee36407a9b74f148cc06601b18` records actual original yaml2.9.1 parsing and Node deep equality: all38 old rows unchanged, with only a39th @deepseek-ai/dsh-client-ui-settings-general row whose config is welcomeNoticeVersion2026-09-28.1. Root reports no permission/model/storage option change or settings write. This lane read that public evidence and checked its snapshot pin; it did not parse YAML, import the YAML library or repeat root's semantic test.

The original341d operator,5b90 plan and fdf30/26c68 historical review remain unchanged. Its one prepare attempt failed the live public size guard before maintenance outputs, signals, renames or starts. The new exact pin plan preserves the welcome acknowledgement instead of editing/restoring the active public configuration. It is a reviewed successor, not a same-plan retry, weakened guard or policy-denial workaround.

Root separately reports one amended-launcher --check PASS and17 unchanged pins. These remain root-attributed checks, not execution performed by this reviewer.

## Retained boundaries

Root owns the new once-only prepare/stop/activate and later original CLI start. Runtime guards still must match the actual public configuration, package and owner metadata; any failure/unconfirmed stop/denial remains HOLD without repeated signals, force, alternate entrypoint or automatic launch rollback. The directory restoration boundary remains the previously reviewed inverse rename before any start.

No active settings/profile file, original capsule, package/backend, runtime overlay, access/opener code, private auth/key/state/DB or source was changed by this lane. No private or live-profile content, process/listener state, browser or provider was accessed. Only public amendment/source/evidence bytes and JSON metadata were checked, and new independent evidence/temporary metadata were written. No application/operator parsing/import/runtime, tests/builds, browser/model/network/Git action occurred.

Mac LOCKED leaves browser handoff, corrected client load, frontend connection, native worker connected and enabled controls HOLD. All87 accepted0/HOLD and the permanent final CODE block remain unchanged.

