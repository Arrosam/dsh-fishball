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
core.grant(privateObject, scope, taskId, actionId, {expectedVersion, expiresAt});
core.revoke(privateObject, scope, taskId, actionId);
core.claim(scope, taskId, actionId, {expectedVersion}); // {claimId, task, action}
core.cancel(scope, taskId, {expectedVersion});
core.settle(scope, taskId, actionId, {claimId, outcome, evidenceDigest});
core.recover(); core.diagnostics(); core.close();
```

Identifiers match `/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/`. Every owner/workspace/task/provider/source/event/action identifier is SHA-256 encoded before persistence. Returned records expose `ownerRef`, `workspaceRef`, `taskRef`, `actionRef`, not raw identifiers. Target/data/evidence digests are lower-case 64-character hexadecimal. Kind is `fixture|read|write|review|repair`; transition reason is `progress|operator|recovery|fixture`. Outcome is `completed|failed|unknown|terminated`. Unknown keys and arbitrary payload/prose are rejected with stable codes; no exception causes are exposed.

## Trust and linearization

Foundation is a trusted in-process integration API. Scope values must be injected from trusted host context; JSON scope is not an authentication protocol. Native M1 service binds scope from host DI and exposes no operator mint/grant/revoke. Capability creation happens in trusted bootstrap, outside the core. Private WeakMap identity checks bind exact operator objects to owner/workspace; a deserialized lookalike has no authority. Native permission callback defaults to deny pending the future live permission bridge.

Tasks, ingress, actions, grants, events and reservations share one SQLite file and `BEGIN IMMEDIATE` transaction. No await occurs in a transaction. Grant binds action reference, target/data digest, kind, units, task version, task authority epoch and expiry (`now < expiresAt`). Grant/revoke/cancel advance authority epoch. Claim checks current grant and host permission under the transaction lock, then commits a unique dispatch intent/reservation and increments task version before any fixture callback. Revoke/cancel first prevents claim; claim first preserves accountable in-flight work. A claim is not proof of an effect or exactly-once execution.

`settle` validates claim identity. Unknown outcomes retain their reservation; repeated/stale settlement cannot replace a newer claim. Newer cancellation stays cancellation-requested after a completed effect; only explicit termination evidence can confirm cancellation. A changed authority epoch prevents late settlement from finalizing the task. Evidence records the action outcome without undoing previously completed effects.

## Storage, recovery and bounds

SQLite schema 2 uses built-in `node:sqlite`, synchronous FULL commits and foreign keys; no downloaded package. New stores initialize transactionally. Future/unsupported/corrupt stores are rejected before mutation. Schema 1 is the exact task-only base schema exported as `legacySchemaSql` solely for compatibility fixtures; migration acquires an exclusive lock, preserves an exclusive exact `.schema-1.backup`, creates action tables transactionally and rolls back on failure. Existing backups are never overwritten. Full migration import/retention policy is a later gate.

On opening a store, all dispatch intents become unknown/recovery-required while reservation rows remain. Recovery never calls a provider or replays an action. Opening the same store while workers may still exist conservatively treats those intents as uncertain; future real DSH reconciliation is required. Acknowledged intake means the commit completed. Fixture fault after commit deliberately withholds acknowledgment without losing the record.

Queue bound counts queued tasks globally across scopes; active bound sums held reservation units globally. Known settlement releases units; unknown/timeout/cancel-requested retains them. Attempts count successful dispatch claims cumulatively per task/action kind, including reviewer and repair kinds. No automatic retry exists. Total tasks (including tombstones), actions per task and history events per task are capped. Grants overwrite one exact action record, ingress has at most one original identity per task, and no append-only raw log exists. Bounds eventually fail closed; no production garbage collection or retention guarantee is claimed. Delete records a tombstone, revokes grants and retains hashed dedup/provenance/history locally; third-party copies are outside this scope.

Fixture-only options `{fixtureMode:true, fixtureFaults(point), migrationFault()}` are constructor DI and are refused unless fixture mode is explicit. `dispatchFixture(..., fixture)` is unavailable by default. Fault points are bounded names `before_intake_commit`, `after_intake`, `pre_receipt`, `post_effect`; fixtures contain synthetic data and mock effects only.

## Runtime provenance

System Node v22.22.2: SQLite 3.53.2, experimental built-in warning; no installation. Host author independently verified bundled Desktop Node24.9.0: SQLite3.50.4. The two runtimes are intentionally distinguished. Core verification commands/results and limitations are recorded below after final tests.
