# M1 bounded foundation

Status: triaged before implementation. Owner authorized staged local development on 2026-10-04. Baseline: new local repository with no predecessor code; starting commit recorded in evidence after setup.

## Selected scope
Native plugin loading/config/diagnostics on a concrete public installed host baseline (BUB001); authoritative owner/workspace/task/action/approval store with recovery and migration (BUB003/006); minimal bounded admission (BUB012). All provider/model behavior is mocked. No worker inference or external effect is executed. A queued mock action is a fixture, not the first user-facing vertical slice.

## Frozen executable acceptance criteria
- M1-01 (001): exact host/plugin versions and required services verified; missing/unsupported services or malformed config fail before intake. Native Cordis load/unload/reload10 times produces one service/handler and no leaked fixture registrations. Actual profile/window/quit tests are separately pending unless supported safely without settings changes.
- M1-02 (003): durable intake is acknowledged only after commit; complete owner/workspace/provider/source/event identity deduplicates, deliberate new event IDs do not. Versioned task transition/history reject stale/illegal/terminal regressions.
- M1-03 (003): crash cuts before intake commit, after intake before dispatch, dispatch intent before receipt and effect before durable settlement recover correctly. Unknown effects remain reconcile-required, never silently re-executed. Acknowledged records survive real reopen/separate-process tests.
- M1-04 (003): storage unavailable/corrupt/full and incompatible schema fail closed. Supported migration creates a recoverable backup before mutation; injected migration failure and future schema preserve original. Export contains provenance/status/time/reference metadata, no secrets. Delete leaves a durable tombstone and prevents rescheduling; controlled local scope is explicit.
- M1-05 (006): untrusted/unknown/spoofed identity, cross-owner/workspace/task, expired/revoked/mismatched approval, altered target/data digest/limits/version and runtime reviewer grant attempts are rejected. Host permission denial stops the action; model data cannot self-authorize.
- M1-06 (006): durable approval is bound to exact task/action and authority epoch; dispatch/revoke/cancel use an atomic ordering point. Earlier revoke/cancel prevents dispatch; already-claimed work remains in flight/uncertain until evidence. Late results do not erase cancellation or re-grant authority.
- M1-07 (006): synthetic secrets in inputs/errors do not appear in log/diagnostic/export/DB files. Only allowlisted references/digests and bounded metadata persist. No personal data or credential access.
- M1-08 (012): queue and active reservations bounded; N−1/N/N+1 and last-slot races tested. Unknown/timeout/cancel-requested work keeps its slot; attempts bounded, no automatic inference or retry. All limits/config checked, no silently weaker model preset.
- M1-09: independent code reviewer and separate ISTQB test reviewer cover each selected ticket and final remedied tree; actual local functional validation has expected/actual evidence. UI is not implemented, so visual validation is not applicable here and remains mandatory for014. Mock/public-service fixture evidence is never claimed as real Desktop/provider/inference acceptance.
- M1-10: logical feature commits and final local squash commit; granular feature branch retained; no remotes/issues/publication or selected copyright license.

## Test design
Equivalence classes: trusted owner / unknown / spoofed / cross scope; storage healthy / unavailable / corrupt / future schema; current / expired / revoked / stale approval. Boundaries: input sizes, queue capacity, active slots, max attempts, expiry before/at/after. Decision table combines identity, current approval, task version and capacity. State transitions and fault cuts cover cancel/revoke/late settlement/reopen/uncertain outcomes. Synthetic injected faults must be supplemented by actual local SQLite/file/process operations where supported.

## Risk and rollback
The host API is pre-stable: pin versions and probe capabilities rather than assume master compatibility. Dispatch claiming is not arbitrary-effect exactly once. M1 performs no real effects. Back up before schema changes; do not overwrite unsupported/corrupt state. Revert code via new commits; preserve ledger/recovery backup and feature history.

## Full-ticket gates left open
BUB001 actual installed-profile/UI lifetime and CLI compatibility; BUB003 production retention/import policies and real DSH reconciliation; BUB006 live identity pairing/secret-store/destination behavior; BUB012 actual model cost/time/latency behavior. Later milestones retain these criteria.
