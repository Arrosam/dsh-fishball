# M1 independent ISTQB test-design review

Status: preliminary design only; final implementation, test execution, remediation and final-tree audit pending.

Reviewer: `/root/istqb_review`, independent of `/root/host_bootstrap` and `/root/ledger_core`; delegated by `/root`. Requested model/reasoning: gpt-6.1-sol / max. This development review is separate from BUB015 runtime product behavior. Root is the only Git writer.

Reviewed planning baseline: `abb28b7e3962fa46c492b077c6cce5a8613a843b`, branch `feat/M1-foundation`, 2026-10-04. Read `AGENTS.md`, `docs/development-workflow.md`, `docs/waves.md`, `docs/foundation-contract.md`, `docs/milestones/M1-foundation.md`, and complete retained source AC in BUB001/003/006/012. No implementation existed during the first planning read. Actual runtime read: `node --version` → `v22.22.2`; `python3 --version` → `Python 3.14.5`. No install, remote, Git mutation, inference, external provider call, credential access, settings change or fishball inspection was performed by this reviewer.

## Review scope and exit evidence

Review every bounded M1 AC against the final executable behavior. Author mocks are useful for branch/fault coverage, while actual installed public Cordis lifecycle and real local SQLite/file/process checks are needed for the supported functional subset. A fake `ctx` is not Desktop profile, UI, host permission, or provider evidence. All source full-ticket profile/UI/live-identity/model/provider criteria remain pending. Visual validation is not applicable to the M1 implementation, which has no UI; BUB014 retains that gate.

The final report must replace every pending actual result below with an exact test name/command, expected behavior, observed result, reviewed tree and any limitation. Findings return to the author of the affected module. Reviewers retest remediated changed code without weakening assertions. Passing test suites alone are not acceptance, release, or full-MVP evidence.

## Risk-based test design

| Priority | Failure risk | Technique and required observation |
| --- | --- | --- |
| Critical | Untrusted payload or stale grant causes a dispatched effect | Decision table over identity/capability, scope, current grant, exact action/target/data/limits, task version, authority epoch, expiry, host permission and resource capacity; verify no dispatch intent/reservation on every rejection. |
| Critical | Revoke/cancel loses a race or uncertainty frees a slot | State transitions and independent-process race tests around the atomic claim; verify winner, durable reservation and legal subsequent state, including late settlement and reopen. |
| Critical | Acknowledged task disappears or uncertain action replays after crash | Fault cuts before/after commit, before receipt, after synthetic effect but before settlement, plus actual reopen in another process; count fixture callbacks and preserve recovery-required evidence. |
| Critical | Secrets, raw prose or exception text enter an output/store | Synthetic canaries in unknown fields, token-shaped IDs, metadata/config/error paths; scan returned objects, thrown errors, diagnostics, exports and all created DB/WAL/SHM/backup files. |
| High | Shared owners/workspaces/tasks or incomplete ingress keys collide | Equivalence partitions and complete compound-key variation; run each public read/mutation against colliding task IDs and operator capabilities from different scopes. |
| High | Full/corrupt/future store partially initializes or destroys data | Real unavailable/non-file/corrupt store checks and supported faults; preserve byte hashes across rejected opens/migration failure, verify backup is created before mutation and is reopenable. |
| High | Limits race, accept malformed values or grow durable metadata without bound | N−1/N/N+1 for queue/active/attempt/task/action/event/metadata limits; two process contenders for final capacity; capacity downshift with held unknown work. |
| High | Reload leaks registrations, stale service authority or reservations | Ten actual public Cordis cycles, exactly one service, zero retained registrations after disposal, old service references rejected, acknowledged records and unknown slots retained across reopen. |
| Medium | Terminal/stale updates rewrite history or hide cancellation | Version and state transition tests: equal/current/stale/future version, legal/illegal transition, out-of-order progress, duplicate settlement, terminal finality and cancel-request distinction. |
| Medium | Documentation implies unexecuted Desktop/CLI/provider acceptance | Trace commands to actual environment and source criteria; distinguish fixture, actual local storage, installed public package, installed profile, UI and external provider evidence. |

### Equivalence partitions and boundaries

Identity/capability: exact injected operator reference; a newly allocated lookalike object; JSON claiming `trusted` or `owner`; missing/null/primitive/proxy/unknown capability; reviewer/external scope; capability for another owner/workspace. Colliding task IDs in two owners and two workspaces must remain independent, including read/list/export/delete/request/grant/revoke/cancel/claim/settle. A payload-supplied scope is not authentication: final native service evidence must describe its trusted host integration boundary and default denial.

Approval: absent/pending/current/expired/revoked/consumed; wrong action/task; one-field altered target/data digest/limits; stale task version/authority epoch; expiry at `t−1`, `t`, `t+1` with a fixed clock and grant expiresAt=`t`. Expected exact boundary is `now < expiresAt`. Any grant/revoke/cancel epoch change must invalidate stale authority. Unknown permission or a thrown permission error fails closed without persisting raw error text.

Input/config: reject missing, null, arrays, primitives, unknown keys and incorrect nested shapes. For bounded ASCII identifiers, probe empty, 1, 127, 128 and 129 characters, forbidden characters and token-shaped synthetic credentials. For digests, probe 63/64/65 characters and non-hex. Probe integer config at 0/1/maximum/maximum+1, negative, fraction, NaN/Infinity and numeric strings; reject weaker or unknown host/model presets. Metadata boundary is measured in the implementation's documented encoding rather than character count assumptions. Probe each configured queue, active, attempts, tasks, actions and events limit at N−1/N/N+1, including after reopen.

Storage: healthy empty/current schema; real reopen; unavailable parent; path pointing to a directory; corrupt/truncated bytes; future version; incompatible/incomplete migration; actual bounded IO fault where supported; rollback preservation. Permission-mode-only tests are insufficient when the executing user can still write. A host runtime policy denial stops that action; do not retry through a less restricted execution route.

### Dispatch decision table

Each row begins from an otherwise valid queued task and exact granted action. For every deny case, compare task/action version, status, history and active reservation count before/after and assert fixture effect count remains zero.

| Identity/boundary | Grant and exact spec | Task version/epoch/expiry | Host permission | Admission | Expected |
| --- | --- | --- | --- | --- | --- |
| Trusted integration / exact operator grant | Valid | Current and unexpired | Explicit fixture allow | Capacity | One durable claim before fixture callback; one slot. |
| Forged/unknown/reviewer operator | Otherwise valid request | Current | Allow | Capacity | Grant denied; claim cannot gain authority. |
| Cross scope or task | Otherwise valid | Current | Allow | Capacity | No authority or record in another scope. |
| Trusted | Missing, revoked, wrong action/target/data/limits | Current | Allow | Capacity | Deny with stable code, no reservation. |
| Trusted | Valid | Stale version or epoch; expiry at/after boundary | Allow | Capacity | Deny with stable code, no reservation. |
| Trusted | Valid | Current | Missing/unknown/deny/throw | Capacity | Deny with stable redacted code, no reservation. |
| Trusted | Valid | Current | Allow | Full queue/active/attempt budget | Reject the affected admission atomically; no oversubscription. |
| Trusted | Consumed or already claimed | Current | Allow | Capacity | Reject duplicate claim; never replay prior dispatch. |

### State, fault and concurrency scenarios

1. Intake before commit fault: no acknowledgment and no durable record. Intake after commit before dispatch: acknowledgment survives process reopen, action has not executed. Dispatch intent before receipt and synthetic effect before settlement: both recover to explicit uncertainty with a held slot; missing receipt never schedules replay.
2. Revoke first / cancel first prevents later claim. Claim first / later revoke or cancel retains dispatch intent and slot; revocation blocks new work while existing effect needs evidence. A late result cannot re-grant authority or erase the fact of cancellation. Cancellation request does not claim instant termination or rollback of completed effects.
3. Two processes claim the final active slot, and two processes intake the final queue slot. Exactly one admits; the loser returns a stable error; durable totals do not exceed N. Also race update versus update, revoke versus claim, cancel versus claim, and duplicate ingress versus duplicate ingress. The result is a permissible serialized history, never two winners or a lost tombstone.
4. Unknown, timeout and cancel-requested action keeps its reservation through settlement/recovery/reload. Explicit evidence-backed completion/failure/confirmed termination can release it according to the contract. Duplicate settlement or stale claimId must not alter unrelated facts. A transition/delete cannot free a held action without termination/effect evidence.
5. Complete ingress identity variations: same key deduplicates across connections/reopen; changing owner, workspace, provider, source or eventId creates a deliberate independent event within bounds. Delete retains tombstones across reopen and prevents the same intake from rescheduling; another scope remains usable.
6. Equal/stale/future task versions, terminal→progress, illegal transitions and out-of-order settlements reject rather than regressing state. History reason/evidence is bounded and allowlisted; export retains provenance/status/time/reference facts.
7. Migration backup is verified before successful mutation. Injected failure leaves original recoverable, including incomplete/future schema and backup collision/IO paths. Retry does not silently replace a prior backup or downgrade unknown schema. Export/delete scope is local; external copies are not claimed deleted.
8. All worker/action types, including prospective reviewer/repair work, use the same reservation/attempt budgets. No automatic inference, retry, session recreation or weaker model selection occurs in M1.

## Preliminary acceptance evidence matrix

| Bounded AC / source subset | Exact expected evidence | Actual evidence at planning review |
| --- | --- | --- |
| M1-01 / BUB001-01..03, partial05 | Recorded installed package/runtime versions and actual required-service capability probe; malformed/unsupported/missing capability rejects before store/intake; actual public Cordis ten lifecycle cycles show one service and no leak. | Pending implementation and commands. Desktop profile/window/quit/CLI remain separate pending gates. |
| M1-02 / BUB003-01..02 | Durable ACK after commit; full ingress-key EP table; deliberate new event IDs; exact version/state/history checks including terminal/stale rejection and parallel updates. | Pending. |
| M1-03 / BUB003-01, recovery subset | Four fault cuts; real process reopen/independent process acknowledged data; no replay of claimed unknown effects; retained reservation and recovery-required state. | Pending. |
| M1-04 / BUB003-03..05 | Real/injected unavailable/corrupt/full failures; future/incomplete schema byte preservation; backup-before-mutation and rollback; provenance export; durable tombstone/no rescheduling. | Pending. Production retention/import/DSH reconciliation remain pending. |
| M1-05 / BUB006-01..02,05 | Identity/capability/scope/spec/version/expiry matrix; runtime reviewer/forged JSON denies; host permission missing/deny/throw stops claim. | Pending. Live pairing/webhook/secret-store/destination behavior remains pending. |
| M1-06 / BUB006-02,05 | Exact durable grants plus epochs; revoke/cancel versus dispatch process races; slot retained on claim-first; late facts do not erase cancellation or re-grant. | Pending. |
| M1-07 / BUB006-03, bounded04 | Canaries in accepted/rejected fields and exceptions; scan all returned/export/diagnostic/log/database-related files; approved fixture receiver gets only allowlisted refs/digests if such dispatch exists. | Pending. No real external receiver is in M1. |
| M1-08 / BUB012-01..03,05 subsets | Queue/active/attempt/metadata/task/action/event BVA; actual process final-slot races; unknown/timeout/cancel slot retained; no inference/retry/weaker preset. | Pending. Model/runtime/cost/latency and main-conversation response remain pending. |
| M1-09 / development workflow | Exact final tree, independent code and separate test review identities, all critical findings fixed and retested; actual supported native/local process evidence; unsupported gates explicit. | Planning independence established; implementation/final audit pending. |
| M1-10 / repository workflow | Root-supplied logical commit refs, final local squash, retained granular branch, no remotes/issues/publication/copyright license selection. | Root owns this evidence; reviewer performed read-only baseline Git checks only. |

## Interface assumptions communicated before implementation

2026-10-04: author API targets documented privately to the reviewer. `Foundation` uses an explicit database path, bounded limits, injectable clock, default-deny synchronous hostPermission and reference-identity operator capabilities bound to scope. Public shape includes intake/read/list/export, versioned transitions/delete, exact action request/grant/revoke/claim, cancel, settle, recover and close. Native bootstrap omits grant/revoke authority from the public service, checks real capabilities and defaults dispatch permission to deny for M1.

Sent to authors and root: realistic token-shaped IDs are potential canary leaks even when raw payload keys are rejected; direct Foundation scope arguments require a documented trusted host integration boundary; clock/permission/IO exceptions must use stable redacted errors; old service references must fail after unload; unknown reservations must survive reload. These are preliminary risks, not final findings against code that did not yet exist.

Author design responses: core will persist/return SHA256 references for all owner/workspace/task/provider/source/event/action identifiers, with strict kind/reason enums; raw identifiers stay bounded input only. Bootstrap will use `createPlugin({identity: trustedHostCallback})` outside JSON, derive scope solely from that callback, default to `IDENTITY_UNAVAILABLE`, and reject payload identity fields. Public service will omit grant/revoke and retain default-deny dispatch. Old service references, including diagnostics, will throw `SERVICE_DISPOSED`. These resolutions need final code and adversarial execution before they count as tested behavior.

## Findings and final audit

Pending. No final acceptance or final-tree audit is claimed in this preliminary report.
