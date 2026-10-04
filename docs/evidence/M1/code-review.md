# M1 independent code review

## Reviewer and scope

- Reviewer: independent `/root/code_audit` agent, separate from both implementation authors and the ISTQB test reviewer; requested model `gpt-6.1-sol`, reasoning `max`.
- Repository: `bubbles`; feature branch supplied by root: `feat/M1-foundation`.
- Setup baseline supplied by root: `abb28b7e3962fa46c492b077c6cce5a8613a843b`.
- Owned output: this document only. No code, tests, Git mutations, host settings or external account changes.
- Reviewed requirements: `AGENTS.md`, `docs/development-workflow.md`, `docs/waves.md`, `docs/foundation-contract.md`, `docs/milestones/M1-foundation.md`, BUB001/003/006/012 source cards.
- Initial status: specification risk review complete; implementation review and acceptance **pending** an exact converged feature SHA/tree from root.

## Preliminary risk review (requirements, not implementation findings)

| Risk | Required implementation property | Required evidence |
| --- | --- | --- |
| Forged authority or scope | Approval authority comes from exact opaque object identities injected at construction; no public authority minting method. Every read and write checks owner, workspace and task. Native admission defaults deny until a real permission bridge is implemented. | Unknown/reviewer/JSON-spoofed capabilities, cross-instance capability, cross-owner/workspace/task, permission false/throw/unavailable cases. |
| Check-to-dispatch race | One synchronous database transaction validates current task CAS, approval epoch, exact action/target/data/limits/version, strict expiry and reservations before committing irreversible dispatch intent. No provider callback or `await` occurs inside the transaction. | Exact binding decision table; before/at/after expiry; grant mutation; revoke/cancel-first and claim-first interleavings; two processes racing for the last slot. |
| Double effect after interruption | Dispatch intent is durable before any fixture callback. Missing receipt, timeout, cancel request and unknown settlement retain active reservations and become recovery-required. Late results preserve cancel/revoke facts. | Real process crash cuts and reopen; actual effect-before-settlement fixture; no automatic replay; capacity held across reopen and cancellation. |
| Ledger not actually atomic/durable | SQLite uniqueness and transaction boundaries cover intake, version/history, approvals, actions and resource admission together. Acknowledgement follows successful durable commit. IO failure rejects new durable work. | Independent processes/connections; rejected stale writes; actual SQLite/file faults; durable acknowledgements after process exit/reopen. |
| Schema upgrade destroys evidence | Schema inspection and compatibility checks precede mutation. Backup captures a consistent recoverable database before upgrading; failed upgrade and future schema preserve original records. | Old/current/future/corrupt stores; backup reopen; failed migration rollback; hash/content comparison for preserved original. |
| Secret or payload retention | Durable and exported data use explicit field allowlists and bounded identifiers/digests/references; diagnostic errors use stable codes. Rejected raw payloads and thrown provider errors never reach DB, logs or exports. | Synthetic-secret scans across DB/WAL/backup, diagnostics and export; oversized or unexpected metadata, nonfinite limits and malformed digests. |
| Deleted tasks reappear | Deletion leaves scope-keyed durable task and complete ingress identity tombstones; reads/exports and re-admission honor them. | Same event after reopen, distinct scope, deliberate new event identity, live reservation deletion policy. |
| Native lifecycle only simulated | Public installed Cordis lifecycle and services are exercised without a live profile or inference; service/config probes fail before constructing an accepting foundation. Reload/disposal close resources. | Exact installed package/runtime versions; actual no-inference Cordis fixture, ten load/unload/reload cycles, one registration, no stale service; separately identify pending Desktop/CLI/UI gates. |
| Resource bypass | Queue/active/attempt/metadata limits are validated and checked in the same claim/intake transaction; cancelled/uncertain reservations stay counted until evidence permits settlement. | N−1/N/N+1, oversize bytes versus character counts, attempts exhausted, cross-process last-slot race, role-independent accounting. |

The selected scope is bounded M1 foundation. Full Desktop profile/window/quit/CLI compatibility, real identity pairing, provider reconciliation, model cost/latency and production retention remain later-ticket gates. Static APIs, current upstream sources, mock transports or a green test run cannot establish those gates.

## Implementation audit

Pending final-tree handoff. No implementation acceptance or absence-of-defects claim has been made.

## Commands and observations

2026-10-04: read the requirements listed above, listed repository source/test/evidence paths, and ran read-only `git status --short`. At that moment there was no implementation source/test file to audit, and the working tree was clean before this evidence document was created. No runtime-policy denial occurred.
