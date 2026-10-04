# Historical Desktop foundation checks — de1097e

Historical only: the owner superseded this Desktop baseline with latest official DSH Web. This snapshot was never accepted or merged as M1; CR10 was subsequently found and Web revalidation is required. See [current validation](validation.md) and [compatibility](../../compatibility.md).

Status: implemented and tested on the frozen code snapshot below. Final independent code/ISTQB verdicts and local squash integration are pending; full source-ticket/MVP acceptance and release are not claimed.

## Repository and reviewed snapshot

- New standalone repository: `/Users/samuel/Documents/Codex/2026-10-04/task-6/bubbles`.
- Setup on local main before delegation: `abb28b7e3962fa46c492b077c6cce5a8613a843b`.
- Feature branch: `feat/M1-foundation`.
- Final runtime/test snapshot: `de1097e42fe08a34484c50bd34a240804e4ca52e`.
- Source tree: `b3fb7de84d5cf6bccb8ed828770a2f56fe90e3ad`.
- Test tree: `d9bcb582663d6bb73579de8e33828dfd13c65cc2`.
- Script tree: `3810b2f612b8822556717850363d86fc45e98277`.
- Later report/evidence commits must leave these runtime/test/script trees and package.json unchanged. Review reports name this exact code snapshot.
- No remote, remote issue, GitHub Project, push, public upload, OAuth change, tag, publication or license selection occurred.

## Environment and commands

macOS 27.0 (26A428), arm64. Existing system Node v22.22.2 / SQLite 3.53.2 and Desktop-bundled Node v24.9.0 / SQLite 3.50.4 were tested separately. Built-in SQLite emits its experimental warning. No dependencies or install scripts were downloaded/executed. ESM needs no transpilation; syntax checking is the local build gate.

| Final root command | Actual result | Raw evidence |
|---|---|---|
| `npm run check` | exit 0; 10 ESM files checked | [check](runs/desktop-de1097e/check.txt) |
| `npm test` | exit 0; 93 passed, 0 failed/skipped; 1.635s; development Node | [Node22 tests](runs/desktop-de1097e/test-node22.txt) |
| `npm run test:host` | exit 0; 93 passed, 0 failed/skipped; 1.407s; bundled Node | [Node24 tests](runs/desktop-de1097e/test-node24.txt) |
| `npm run host:smoke` | exit 0; 11 loads, 10 reloads, 11 entries; permission rejected; 0 inference calls; no profile access | [native fixture](runs/desktop-de1097e/host-smoke.txt) |

93 is Node's reported test count, including nested cases: bootstrap 9 + core 13 + independent adversarial 71. All commands ran on the immutable code/test snapshot. Earlier diagnostic runs are not substituted for these final results.

## Frozen bounded AC to evidence

| M1 AC / ticket | Evidence and actual outcome | Scope limits |
|---|---|---|
| M1-01 / BUB001 | Real installed public Cordis Context + SessionStore + ApprovalService; exact package/runtime/source hashes and method/class provenance; config, missing/late/disappearing services; unload-before-await and stale-reference rejection; 10 reloads produce one entry per input with clean registries | Installed-library fixture only. Desktop profile/UI/window/quit and CLI acceptance pending |
| M1-02 / BUB003 | Compound intake dedup, deliberate new source/event identity, two-process duplicate race; task CAS winner, terminal/stale transition rejection, scoped history/tombstone reopen | Complete source005/009 ingress integration later |
| M1-03 / BUB003 | Real abrupt subprocess cuts before commit, after intake, pre-receipt and post-mock-effect/pre-settlement; acknowledged records reopen; no replay; unknown claims retain reservations; 10 native reloads preserve uncertainty | Arbitrary external-effect exactly-once and live DSH reconciliation are not guaranteed |
| M1-04 / BUB003 | Supported populated schema1 migration with durable backup; source/target schema/FK/semantic validation; injected migration failure, corruption/future/incomplete schema and backup collision byte preservation; actual SQLite FULL fail-closed; export one snapshot; scoped tombstone prevents rescheduling | Supported schema1 migration uses DELETE journal mode only; production retention/import/secure erasure/remote-copy deletion later |
| M1-05 / BUB006 | Exact constructor-injected private object capability; JSON/reviewer/lookalike and cross-scope denial; task+auth-epoch CAS; exact target/data/kind/units; strict expiry including actual lock contention; host deny/throw; stale consent cannot regrant | Actual native identity/operator/permission bridge is unavailable; native task calls/dispatch default deny |
| M1-06 / BUB006 | Real two-process revoke/cancel versus claim orderings; claims commit intent before fixture callback; stale claims/late results preserve cancellation and epochs; action settlement is separate from explicit task completion | No instant-stop or effect rollback claim |
| M1-07 / BUB006 | Synthetic token identifiers hashed before DB; payload/hidden/getter/proxy/symbol denial; zero untrusted trap calls; stable clock/provider/IO errors; DB/export/diagnostic scans and least-data fixture callback evidence | No personal memory or live credential data accessed; memory is unimplemented |
| M1-08 / BUB012 subset | Queue/active/attempt/unit/metadata/task/action/history boundaries; real last-slot races; reviewer/repair share caps; unknown/cancel-requested work retains slots; protected 2*N+3 history reserve allows revoke/cancel/recover/settle/confirm; repeated revoke/unknown idempotent | Model spending/time/latency, provider usage and production retention remain full012 gates |
| M1-09 / each selected ticket | Separate code-audit and ISTQB agent sessions; concrete reproductions/fixes/final retests; real local process/file/public-host-library operations | No UI exists in M1, so visual validation is not applicable; real native UI validation remains014 |
| M1-10 / workflow | Setup precedes delegation; parallel file ownership, logical-unit commits, no Git remote; reviewed source/test trees frozen | Final local squash and clean-main verification pending below |

## Independent review provenance

- Authors: `/root/host_bootstrap` and `/root/ledger_core`, requested gpt-6.1-sol/high.
- Independent code audit: `/root/code_audit`, gpt-6.1-sol/max; [report](code-review.md).
- Independent ISTQB test-design review: `/root/istqb_review`, gpt-6.1-sol/max; [report](test-review.md). Added isolated adversarial tests; did not edit implementation or author tests.
- Root independently reran final commands, inspected outcomes and controls Git. Reviewers remain distinct from both implementation authors; no author self-signature satisfies these gates.
- Preliminary independent reviews identified lifecycle unload admission, argument/authority mismatch, inconsistent export, premature task completion, Proxy error leakage, corrupt migration mutation, history starvation, stale consent replay and hidden-cap defaulting. Findings were returned to the correct author and tested, not deferred to BUB015.

## Release and next wave

Implemented: native foundation/config/diagnostics plus authoritative scoped task/action/approval state, migration/recovery and bounded admission.
Tested: synthetic no-inference public-host fixtures, real local SQLite/process/fault/concurrency paths.
Accepted: pending final independent verdicts and local integration of this bounded subset; full BUB001/003/006/012 remain incomplete.
Released: no.

Next proposed W2/M2 slice is coordinator → durable task → one native DSH worker → local artifact/result → independent check → native report/control. Freeze shared contracts first, then parallelize002/008,004/011,005,012 and local013/014 lanes. Actual model invocation/profile activation needs a separately bounded authorized request; none is executed here.

All original tickets001–016, including007A/B and010A, remain in the local backlog. Later W3 memory, W4 events/chat, W5 delivery/UI/runtime audit and W6 full preview MVP are proposed gates in [waves](../../waves.md). The first chat provider, pinned fishball source/redistribution and main licenses, access/approval interfaces, retention/event/UI/delivery/resource policies remain together in [decisions](../../decisions.md).

Supported Library DOCX materialization returned exactly `library file transfer failed: download failed` with no further cause; PDF transfer was not attempted after that failure. No DOCX/PDF local bytes are claimed. Complete approved DOCX text was read through Library (529 lines) and source AC preserved. This did not block M1; no guessed URL or cloud path was used.

## Local integration

Pending final reports; root will record feature evidence tip, local main squash SHA, retained granular branch, identical reviewed source/test/script/package content and clean status here or in integration.md after the actual merge.
