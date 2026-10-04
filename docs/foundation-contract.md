# Foundation contracts (M1)

ESM plugin; code/dependencies must run under the exact verified official DSH Web 0.2.1-alpha.1 baseline in project-local isolation. No new model/harness runtime. Use Node built-ins and pinned public Cordis services; verify Node SQLite availability. The owner explicitly authorized the newest official Web installation and loopback acceptance, without personal profile/credential changes or live inference. See [compatibility](compatibility.md).

## Ownership of modules
Native bootstrap/config/host probe and package scripts: BUB001 implementation worker.
Durable transactional ledger, scoped authorization and admission: BUB003/006 worker (one transaction domain).
Root coordinates interface and integration, and owns Git commits. Independent reviewers have separate evidence paths and may add adversarial tests only in their assigned files.

## Data
Scope is a validated { ownerId, workspaceId }; taskId is unique only inside scope. Durable ingress key includes scope + provider + source + eventId. Store opaque bounded identifiers, timestamp, version, status, history reason enum, target/data digests, action/approval/reservation metadata. Do not persist arbitrary task prose, raw event payload, credentials or exception strings. M1 has no memory.

## Interface target
Core exports Foundation (or documented equivalent) constructed with validated config, explicit database path and clock. Public methods cover intake, read/list/export/delete task, versioned updates, request/grant/revoke exact approval, atomic action claim with limits, cancel request, settlement and startup recovery. Bootstrap invokes core only after capability/config validation; registers a native ctx.dsh-fishball service through reversible Cordis lifecycle and disposes it on unload. No model-facing tool or remote transport is registered in M1; only trusted host/operator integration may call the service.

Trust cannot be supplied by a JSON payload flag. Trusted operator context is a narrow host-injected object/capability; arbitrary external ingress/reviewer contexts cannot mint approvals. Scope checks apply to every query/mutation. Runtime authorization ledger is not a model summary.

Final M1 implementation persists SHA-256 identifier references, not raw owner/workspace/task/source/event/action identifiers. A grant requires both expectedVersion and expectedAuthEpoch from the presented consent; a stale reply cannot refresh revoked authority. The native service freezes trusted identity per activation and exposes no operator capability, grant/revoke or raw Foundation handle. Strict enumerable data fields prevent hidden configured caps from falling back to weaker defaults.

## Dispatch linearization and recovery
Before any fixture/provider callback, atomically validate exact current grant + owner/scope/task/action/target/data/limits/version + admission and commit dispatch intent/reservation. Dispatch intent is irreversible evidence that an operation may have occurred; no call outside the ledger can retroactively unclaim it. Revoke/cancel first rejects claim; claim first records in-flight and later revoke/cancel stops new dispatch while existing claim remains accountable. No awaits within transaction validation/claim. Expiry uses now < expiresAt.

A provider receipt is not task completion. Unknown dispatched/settlement outcomes keep reservations across restart and require explicit evidence-based reconciliation. Never recreate a session or replay an external side effect merely because a receipt is missing. A cancellation request is distinct from confirmed cancellation; completed effects are not rolled back. Late/stale progress cannot regress terminal task versions.

Completed/failed action settlement records action evidence and releases its reservation; task completion requires a separate explicit versioned transition. Authoritative exports read one transactional snapshot. Dispatch checks time after acquiring the actual SQLite lock. History admission reserves 2*N+3 records for outstanding actions' recovery/settlement and current-authority revoke/cancel/confirmation; repeated invalid revocation and unknown settlement are idempotent.

## Migration and storage
Use explicit schema version; backup before upgrading; reject future/incompatible/corrupt stores without overwriting. Actual local functional evidence covers reopen and independent processes. Single durable store has atomic concurrency/unique constraints and fail-closed IO handling. Tombstone deleted tasks/ingress identities to prohibit re-admission; local deletion cannot guarantee remote copies vanish. Bounded metadata storage prevents payload-driven disk growth; production retention policy remains pending.

Schema 2 is current. Only DELETE journal mode is supported, including valid hot rollback-journal recovery. Filesystem-only header/sidecar preflight rejects future/unsupported versions and WAL main/header/sidecars before SQLite opens them, preserving exact main/WAL/SHM bytes and presence. The exact task-only schema-1 fixture migrates only after source invariants and current version/journal are checked under the migration lock; target invariants are checked before commit. Runtime transactions recheck current schema under their mutation lock, so a concurrent future upgrade cannot be silently downgraded. Backup file and parent directory are fsynced before mutation. Opening a supported store conservatively reconciles dispatch intents to unknown without replay; live DSH reconciliation is a later worker-lifecycle gate.
