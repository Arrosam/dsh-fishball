# Stage2 local development integration

Reviewed executable commit: `88a25f0a6f12cf1371a40f1860052231b9fe2687` on retained `feat/S2-runtime`. Baseline local main: `3e12f0f060ad6f8020862e40cbffda7136240910`. Exact source/test/package/script identity is the34-file [freeze manifest](freeze.json), SHA256 `81af3d967131fb6243ed4e0d87e9d111720bf1a655542146ecd395727de09990`.

This is a bounded **development integration**, not full ticket/MVP acceptance or a release. The three-stage implementation continues. Original BUB criteria and DF aliases remain traceable; applicable native/provider/model/visual/policy debts are retained under the latest explicit owner chat amendment.

## Implemented and independently tested

- One schema3 task/action/approval/resource authority, private principals and AES-GCM data records; current cryptoVersion2 authenticates immutable source/generation metadata before read/recovery.
- Coordinator intake/revisions/clarifications/interruptions and source/version-bound protected context; immutable input capture and final asynchronous CAS checks.
- Public DSH native worker create/query/cancel/ownership/environment/handoff mapping, with exact installed code/capability provenance and conservative unknown recovery.
- Scoped outbox messaging with fresh action authority independent of exact recipient ownership; atomic artifact/progress associations, independent verification and historical delivery versus current access.
- Native operator admission through public DSH `/bubbles-rpc` (renamed in the following unit), scoped details and current controls without exposing owner/key/store handles.

Root's final selected S2 command ran166 tests: **166 PASS,0 FAIL,0 SKIP**, Node22.22.2. [Actual TAP](root-final-retest.tap). Independent code review repeated166/166 and the retained migration/WAL subset17/17. Independent ISTQB cases include real separate-process races, abrupt exits, SQLite FULL, exact-byte rejection, crypto/Unicode and hot rollback-journal recovery. Counts overlap and are not summed. [Code review](code-review.md), [test design](test-design.md), [test review](test-review.md).

The genuine installed AgentLoop fixture uses one local deterministic mock provider stream and no tools/network/external inference. The combined actual store→WorkerManager→broker→native inject→explicit public wakeup test observes the exact scoped body once in provider input and actual session feed. Native injection establishes sent; consumption needs its separate trusted observation. Idle alone completes neither task nor effects; reservations remain held. This does not establish real external model/provider acceptance.

## Findings, preservation and remaining gates

Code findings CR01–CR12 and ISTQB RT-T01–04 were corrected and independently retested before this replacement freeze. The first genuine stream mismatch155/156 failure remains [retained](root-first-failed.tap). The later157/157 freeze was invalidated by CR11/12 and remains [historical](freeze-before-crypto-v2.json) with [its TAP](root-before-crypto-v2.tap); it is not the final reviewed security claim.

Nonempty initial encrypted format cannot prove original authorization metadata and rejects `CRYPTO_LEGACY_UNVERIFIED` before business recovery/writes. Rejected original database+journal bytes stay preserved. No automatic reseal or provenance fabrication; separately authorized provenance recovery is a documented future gate. Supported empty/W1-only schemas still migrate, and valid current-format crash recovery remains tested. The private journal validation copy is capped256MiB and is not a second authority; outside file-copy races are not claimed atomically immune.

Actual authenticated browser/task UI/visuals, persistent native resume, external selected-model work, concrete production approval/policy/key provisioning and agreed retention/performance/product policies remain unaccepted. Live chat software/provider-specific cases are OUT OF THIS PHASE by owner decision; required DF010 contract validation remains Stage3. No daemon, personal fishball data, mobile/Hydrogen integration, remote repository, push or publication is introduced.

Root will squash this reviewed branch into local main, retain every feature commit and then begin the traceable code/workspace rename and Stage3 integration. Evidence-only integration commit does not alter the frozen executable source.
