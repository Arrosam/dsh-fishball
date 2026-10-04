# M1 transactional core contract and implementation evidence

Author: delegated `ledger_core`, gpt-6.1-sol high-or-above; independent reviewers are separate sessions. Bounded BUB003/006/minimum012 only. No inference, credential access, external effect or provider runtime is used.

## Public API (stable for W1 integration)

`Foundation` and `FoundationError` are ESM exports from `src/foundation.mjs`.

```js
const core = new Foundation({
  databasePath, // absolute file path, existing parent directory
  limits: { queueCapacity:32, maxActive:2, maxAttempts:3, maxTasks:1000,
            maxActionsPerTask:16, maxEventsPerTask:128, maxMetadataBytes:1024 },
  clock: Date.now,
  hostPermission: () => false, // synchronous host DI, fail-closed default
  trustedOperators: [{ scope: {ownerId, workspaceId}, capability: privateObject }],
});
core.intake(scope, {taskId, provider, source, eventId}); // {deduplicated, task}
core.getTask(scope, taskId); core.listTasks(scope); core.exportTask(scope, taskId);
core.transition(scope, taskId, {expectedVersion, status, reason});
core.deleteTask(privateObject, scope, taskId, {expectedVersion});
core.requestAction(scope, taskId, {actionId, kind, targetDigest, dataDigest,
                                 limits:{units}, expectedVersion});
core.grant(privateObject, scope, taskId, actionId, {expectedVersion, expectedAuthEpoch, expiresAt});
core.revoke(privateObject, scope, taskId, actionId);
core.claim(scope, taskId, actionId, {expectedVersion}); // {claimId, task, action}
core.cancel(scope, taskId, {expectedVersion});
core.settle(scope, taskId, actionId, {claimId, outcome, evidenceDigest});
core.recover(); core.diagnostics(); core.close();
```

Identifiers match `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/`. Every owner/workspace/task/provider/source/event/action identifier is SHA-256 encoded before persistence. Returned records expose `ownerRef`, `workspaceRef`, `taskRef`, `actionRef`, not raw identifiers. Target/data/evidence digests are lower-case 64-character hexadecimal. Kind is `fixture|read|write|review|repair`; transition reason is `progress|operator|recovery|fixture`. Outcome is `completed|failed|unknown|terminated`. Unknown keys and arbitrary payload/prose are rejected with stable codes; no exception causes are exposed.

## Trust and linearization

Foundation is a trusted in-process integration API. Scope values must be injected from trusted host context; JSON scope is not an authentication protocol. Native M1 service binds scope from host DI and exposes no operator mint/grant/revoke. Capability creation happens in trusted bootstrap, outside the core. Private WeakMap identity checks bind exact operator objects to owner/workspace; a deserialized lookalike has no authority. Native permission callback defaults to deny pending the future live permission bridge.

Tasks, ingress, actions, grants, events and reservations share one SQLite file and `BEGIN IMMEDIATE` transaction. No await occurs in a transaction. Grant binds action reference, target/data digest, kind, units, task version, task authority epoch and expiry (`now < expiresAt`). Grant/revoke/cancel advance authority epoch. Grant requires the caller’s exact current `expectedAuthEpoch` as well as task `expectedVersion`; revoked or superseded consent cannot be replayed by reusing an old owner reply. Claim checks current grant and host permission under the transaction lock, then commits a unique dispatch intent/reservation and increments task version before any fixture callback. Revoke/cancel first prevents claim; claim first preserves accountable in-flight work. A claim is not proof of an effect or exactly-once execution.

`settle` validates claim identity. Unknown outcomes retain their reservation; repeated/stale settlement cannot replace a newer claim. Newer cancellation stays cancellation-requested after a completed effect; only explicit termination evidence can confirm cancellation. A changed authority epoch prevents late settlement from changing the task. Completed/failed action settlement records the action outcome and releases the reservation while the task remains running; an explicit versioned task transition is required for overall completion or failure. A provider receipt or one completed action cannot complete a task that has additional requested actions. Evidence records the action outcome without undoing previously completed effects.

## Storage, recovery and bounds

SQLite schema 2 uses built-in `node:sqlite`, synchronous FULL commits and foreign keys; no downloaded package. New stores initialize transactionally with file mode 0600. Future/unsupported/corrupt stores are rejected before new ledger mutation. A filesystem-only preflight reads the SQLite header and checks sidecar presence before any SQLite connection is opened: future or unknown header versions, malformed/truncated headers, persistent WAL header modes, and any `-wal`/`-shm` entry are rejected without SQLite checkpoint or SHM-reader changes. M1 supports rollback/DELETE journal stores only, including valid supported hot rollback journals that SQLite must recover. Schema 1 is the exact task-only base schema exported as `legacySchemaSql` solely for compatibility fixtures; only DELETE journal mode is supported for that migration. WAL stores are rejected before any SQLite open, backup or mutation. After acquiring each migration/validation transaction, the code rechecks the schema version and DELETE journal mode before backup, DDL or other work; every runtime transaction repeats that check. A concurrent future-version upgrade cannot be overwritten by a cached earlier version. Migration acquires an exclusive lock, validates source foreign keys and allowed row/history invariants before backup, preserves an exclusive exact `.schema-1.backup` and fsyncs the backup plus parent directory before mutation, creates action tables transactionally, verifies target schema/foreign keys/invariants before commit and rolls back on failure. Version 2 opening also validates reference, enum, safe-integer, history and action/reservation consistency under one transaction before recovery. A rejected corrupt legacy file is preserved byte for byte and never receives a backup or schema write. Existing backups are never overwritten. Full migration import/retention policy is a later gate.

On opening a store, all dispatch intents become unknown/recovery-required while reservation rows remain. Recovery never calls a provider or replays an action. Opening the same store while workers may still exist conservatively treats those intents as uncertain; future real DSH reconciliation is required. Acknowledged intake means the commit completed. Fixture fault after commit deliberately withholds acknowledgment without losing the record.

Queue bound counts queued tasks globally across scopes; active bound sums held reservation units globally. Known settlement releases units; unknown/timeout/cancel-requested retains them. Attempts count successful dispatch claims cumulatively per task/action kind, including reviewer and repair kinds. No automatic retry exists. Total tasks (including tombstones), actions per task and history events per task are capped. Grants overwrite one exact action record, ingress has at most one original identity per task, and no append-only raw log exists. History capacity is reserved before a dispatch can commit: while N actions have held reservations, ordinary events must leave `2*N+3` records for each action’s unknown/recovery and known settlement, plus one current-authority revocation, cancellation and confirmation. Revoke/cancel/recovery/settlement use this reserved capacity; already revoked/superseded authorization and repeated unknown settlement are idempotent and consume no event. Insufficient headroom rejects dispatch and rolls back its reservation. Other record bounds eventually fail closed; no production garbage collection or retention guarantee is claimed. Delete records a tombstone, revokes grants and retains hashed dedup/provenance/history locally; third-party copies are outside this scope.

Fixture-only options `{fixtureMode:true, fixtureFaults(point), migrationFault()}` are constructor DI and are refused unless fixture mode is explicit. `fixtureMaxPageCount` is also allowed only in explicit fixture mode and sets the real connection’s SQLite page ceiling to test actual SQLITE_FULL. `dispatchFixture(..., fixture)` is unavailable by default. Fault points are bounded names `before_intake_commit`, `after_intake`, `pre_receipt`, `post_effect`; fixtures contain synthetic data and mock effects only.

## Runtime provenance

System Node v22.22.2: SQLite 3.53.2, experimental built-in warning; no installation. The active core validation is host neutral on this installed system runtime. Earlier bundled Desktop tests were historical evidence for a superseded host target; they do not establish compatibility with the owner’s latest official DSH Web requirement. Current host qualification and native integration remain the host lane’s separate evidence. No old Desktop runtime or dependency was used for CR-10 remediation.

## Author functional verification

- `node --check src/ledger.mjs` and `node --check src/foundation.mjs`: pass on system Node 22.22.2.
- `node --test test/core.test.mjs`: **17 tests pass, 0 fail**, latest run about 1.33 seconds (2026-10-04). Initial smoke implemented10 coherent cases; subsequent independent findings added corruption/migration preservation, history headroom and stale-consent regression cases rather than weakening checks.
- Actual SQLite operations: full ingress provenance, CAS/history/tombstone reopen, independent-process acknowledged-record read, supported migration backup exact bytes, thrown migration rollback exact bytes, unsupported WAL/future/corrupt/unavailable files, actual read-denied file, and actual SQLITE_FULL using the fixture connection’s page limit with rollback/restricted diagnostics.
- Actual separate Node processes abruptly exit at all four bounded cuts; committed intake survives, precommit intake rolls back, pre-receipt/post-effect intents recover as unknown with held reservations, and a synthetic filesystem effect marker remains one without replay. Last queue and active reservation slot races use two barrier-synchronized independent processes and the same validated admission limits.
- Security verification includes exact object/scope/capability checks, expired-at-boundary grants, altered persisted grant fields, stale task/authority CAS, cancellation/revoke ordering, late effect evidence, idempotent unknown, and synthetic secret scanning of DB/artifacts/exports/diagnostics/errors. All owner/workspace/task/ingress/action identifier sentinels are hashed, and getter/proxy payloads are rejected before invocation.
- Independent reviewer tests and root integrated host/runtime checks are recorded separately; author pass is implementation evidence, not acceptance or full MVP release. Native operator/permission bridges, actual DSH worker reconciliation, production retention/import and provider cost/time policies remain later milestone gates.

## CR-10 preservation remediation (2026-10-04)

The independent audit found that opening a rejected WAL database read-write and then closing it checkpointed main-file bytes and removed WAL/SHM sidecars. A read-only SQLite probe was also unsuitable for literal all-file preservation because it changes transient SHM reader marks. The core now uses filesystem reads only before SQLite is allowed to open a supported store. It checks the 100-byte SQLite header, supported user version, rollback read/write format, valid page geometry and any WAL/SHM directory entry. Rejection preserves exact original main/WAL/SHM bytes and sidecar presence; no migration backup is created. There is no WAL import, conversion or recovery in this bounded M1.

Added author regressions use separate Node processes that commit a populated future-schema 99, exact legacy-schema 1 or current-schema 2 WAL store, disable automatic checkpoints and exit 73 without closing SQLite. For every rejection, main/WAL/SHM bytes and directory entries remain exactly equal. Additional cases cover persistent WAL headers without sidecars, future DELETE, unsupported zero/negative versions, unknown header read versions, invalid page size, truncated headers, preserved unsupported journal bytes and an orphan WAL beside a missing main file.

Supported DELETE crash recovery remains tested at all four original fault cuts. A supplemental real cache-spill fixture exits74 with a nonzero hot rollback-journal header; reopening restores all 16 acknowledged task/history facts and removes the recovered journal. Such supported recovery is deliberate reconciliation of incomplete writes, distinct from touching an unsupported store.

A separate real SQLite connection commits schema 99 immediately before migration acquires its exclusive lock, while the legacy table topology still matches. The post-lock version check rejects `SCHEMA_FUTURE`, preserves the concurrently committed version99, creates no backup and does not add schema 2 tables. Existing runtime transactions also reject a future upgrade before intake or task changes.

Commands: `node --check src/ledger.mjs` and `node --test test/core.test.mjs`; system Node v22.22.2, 17/17 pass, 0 fail, about 1.33 seconds. These are local synthetic file/SQLite/process operations only; no provider inference, old Desktop dependency, credentials, account or settings access occurred. Independent adversarial retests and final exact-tree review are separate gates.
