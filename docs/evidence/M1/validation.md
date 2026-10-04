# M1 / W1 current Web foundation validation

Implementation, native backend functionality and independent safety/test reviews pass on the frozen snapshot below. **Aggregate M1 acceptance remains HOLD**: both supported browser surfaces reject loopback, leaving rendered Web/visual and browser-close checks unrun. The dependent local squash merge remains pending. Full source tickets, the complete MVP and release are not accepted.

## Local repository and immutable snapshot

- New standalone repository: `/Users/samuel/Documents/Codex/2026-10-04/task-6/bubbles`; separate from Hydrogen and fishball.
- Setup/workflow/tickets/AC committed before implementation delegation: `abb28b7e3962fa46c492b077c6cce5a8613a843b` on local main.
- Feature branch: `feat/M1-foundation`; main still names the setup commit. Granular logical-unit history is retained.
- Final executable snapshot: `10723812a1f3a85425a5428212ee5febffa62e3d`.
- Source tree: `5757faf909ca9bde505f16b0f2e0627a6c15c894`.
- Test tree: `48f09c19266bc7bbc8921f92ce6c11a377db4af5`.
- Script tree: `cd5f924625ab4ea44fe2f7addeca96273d6cee50`.
- Package blob: `c03a776bdc6c98525a23044dd9574b65eea301e9`.
- Later evidence/status commits leave these code/test/script/package objects unchanged. Independent [snapshot linkage](web/final-snapshot-linkage.json) reports zero runtime mismatches.
- No remote/remote issue/Project, push, public repository/upload, OAuth expansion, tag, publication or owner copyright license selection occurred.

## Exact host and runtime

Official `@deepseek-ai/dsh@0.2.1-alpha.1`, published October 3; registry alpha tag. Registry latest/next still names the older September 29 `0.2.0-rc.2`; the newest official published preview was selected deliberately and pinned throughout this wave. Web, session and approval packages are 0.2.1-alpha.1; Cordis is 4.0.5-alpha.1. macOS 27.0 (26A428), arm64; Node22.22.2 / SQLite3.53.2. Node SQLite emits its experimental warning.

[Host evidence](host-interface.md), [provenance](host-runtime-provenance.json), [engine check](host-engine-check.json), [tracked manifest](../../../scripts/dsh-web-runtime-package.json) and [complete dependency lock](../../../scripts/dsh-web-runtime-lock.json) record canonical source/integrity/API hashes. There are 629 lock entries / 560 installed packages, 183 declared engine ranges and zero Node engine failures. All five lifecycle-bearing dependency scripts were inspected and stayed disabled. Reproducible locked setup completed successfully; launch and tests do not download code. Other DSH installations are untouched. [Old Desktop evidence](historical-desktop-de1097e.md) is historical only; no shim or Electron/native-shell acceptance is provided.

The actual official Web profile uses clean project working state, separate project-local DSH_HOME and DSH_AGENTS_HOME, sanitized child environment, disabled accounts/automatic LLM titles and an inference-denying trusted local observer. It binds only 127.0.0.1:3080 and exposes no fixture/operator HTTP endpoint. Synthetic browser access stays in an ephemeral mode600 runtime file, removed on disposal. No personal memory/profile/credential or paid model/provider call was used.

## Root verification on the frozen executable tree

| Command/check | Expected | Actual | Evidence |
|---|---|---|---|
| npm run check | All project ESM parses | Exit0; 14 files | [raw check](runs/web-1072381/check.txt) |
| npm test | Full synthetic/native suite passes | Exit0; 109 passed, 0 failed/cancelled/skipped/todo; 2028.951ms | [raw tests](runs/web-1072381/test.txt) |
| npm run host:smoke | Real public pinned Cordis/session/approval lifecycle, denial and provenance | Exit0; 11 loads / 10 reloads / 11 entries; all probe checks true; permission rejected; inference0; profileAccessfalse | [raw native fixture](runs/web-1072381/host-smoke.txt) |
| Actual Web profile HMR | One retained entry and no duplicate/orphan work after10 reloads | Passed on the pinned native source; one server PID, entries1, sessions/inference0, stale references disposed | [profile snapshots](web-profile-smoke.json) |
| Full stop/restart and corrected final environment | Durable dedup retained; project-only roots; full stop removes listener and private access | Independent final corrected-environment active/stopped readbacks; disposed15/15, entries1, sessions/inference0, no listener/access file | [active](web/final-environment-active.json), [stopped](web/final-environment-stopped.json), [author checks](host-final-checks.json) |
| Rendered host browser/visual | Real loopback DSH shell and applicable controls observed | BLOCKED before rendering: IAB and Chrome return net::ERR_BLOCKED_BY_CLIENT; no auth token read | [independent report](web-validation.md), [unaltered blocker image](web/chrome-blocked-loopback.jpg) |
| Final source and rollback invariants | No executable drift or active standard dependency | Zero executable diff; exact objects match; no std dependency/import/gate/scratch files | [rollback](rollback-dsh-std.md) |

109 includes Node's nested cases: bootstrap11 + core17 + independent adversarial81. test:host is the same Node22 suite alias, not a second host/runtime matrix. Authors and both independent reviewers also ran the full current suite; these are separate sessions, not substituted results. No failing tests were removed or weakened.

## Bounded acceptance traceability

| M1 AC / ticket subset | Current evidence and disposition | Remaining boundary |
|---|---|---|
| M1-01 / BUB001 | Exact official distribution/source/runtime/lock/class/method checks, strict config and missing/late/disappearing-service denial; actual public and Web-profile reload10; stale-reference rejection; full process stop/restart | Native checks PASS; browser-close/rendered UI rows BLOCKED. Default principal/operator interfaces unavailable; no interactive CLI acceptance inferred |
| M1-02 / BUB003 | Durable compound-source dedup including two processes, deliberate new identities, version CAS/history, illegal/stale/terminal rejection and reopen | PASS; later real ingress integration remains |
| M1-03 / BUB003 | Actual abrupt subprocess cuts before commit, after intake, pre-receipt and post-mock-effect; unknown claims retain reservations, no automatic replay; acknowledged state reopens | PASS; actual worker reconciliation and arbitrary effects are not exactly-once guarantees |
| M1-04 / BUB003 | Exact supported schema1 migration/durable fsynced backup; source/target FK/semantic checks; corruption/full/unavailable/future/incomplete schema; nonmutating WAL header/sidecar rejection; hot DELETE recovery; schema recheck after lock; snapshot export and scoped tombstone | PASS; only DELETE journal supported; production retention/import/secure erasure/remote copies remain later gates |
| M1-05..06 / BUB006 | Exact private injected capabilities and immutable scoped native identity; spoof/reviewer/cross-scope/mismatched digest/units/version/epoch/expiry/host-deny rejection; stale-consent replay denied; atomic revoke/cancel/claim races and truthful late results | PASS; live pairing/operator/secret-store/destination bridge pending. Native dispatch denies, action settlement is separate from task completion, no instant cancellation/effect rollback |
| M1-07 / BUB006 | Hashed identifiers/allowlisted bounded data and stable errors; synthetic-secret scans; getter/proxy/hidden/symbol rejection; bounded stream log redaction across chunks/EOF/overflow; project-only public-provider roots without personal listings | PASS; no memory implementation/personal data import |
| M1-08 / BUB012 minimum | Queue/active/attempt/task/action/history/metadata boundaries, real last-slot races; held unknown/cancel reservations; protected2*N+3 recovery history; no reviewer/repair exemption | PASS; actual model cost/time/latency/usage controls remain full-ticket gates |
| M1-09 / development gates | Independent code safety PASS and separate ISTQB backend/native design/execution PASS; all12 reproduced findings remediated and final tree retested | Actual rendered Web/visual gate HOLD; BUB014 task UI unimplemented |
| M1-10 / workflow | Setup before delegation, English high/max/xhigh agent roles, nonconflicting ownership, logical commits and local-only retained branch | Squash to main pending aggregate acceptance; no publication |

## Independent provenance and remediation

Host author `/root/host_bootstrap` and ledger author `/root/ledger_core`: gpt-6.1-sol/high. Independent code auditor `/root/code_audit` and ISTQB reviewer `/root/istqb_review`: max; separate actual Web validator `/root/web_validation`: xhigh. Root independently reran commands and controls Git. Review reports name the exact frozen source trees: [code](code-review.md), [tests](test-review.md), [Web](web-validation.md).

CR01–09 fixed native operator mismatch, unload admission race, inconsistent exports, premature task completion, Proxy error leakage, destructive corrupt migration, history starvation, stale consent replay and hidden-cap defaulting. CR10 fixed rejected WAL checkpoint mutation plus locked schema races. CR11 fixed chunk-split authentication-log leakage. CR12 isolated the skill provider's independent agents-home root. Independent final retests closed every reproduced code finding. The final root and reviewer checks did not invoke a model, list personal skills or read their bodies.

The owner cancelled dsh-std before implementation and explicitly requested rollback. No production/dependency/test requirement was introduced; six ignored metadata helper/response files were removed and audit discovery wording cancelled. Normal local commit `5a9618c` records exact scope. Existing native Cordis Standard Schema validation/general security tests were preserved. No active interoperability-conformance gate remains.

## Remaining blocker and next proposed slice

Required rendered Web/visual and browser-window-close checks cannot run through the permitted tools: both browser surfaces return ERR_BLOCKED_BY_CLIENT. The Chrome blocker screenshot shows that client failure, not the DSH UI. No proxy, alternate port or security bypass was attempted. Root requested a permitted loopback testing surface; no answer/approval is inferred from elapsed time. Acceptance/squash waits for actual evidence or an explicit owner change to the gate.

[Exact browser-blocker report](browser-blocker.md) records the surface operations, literal errors, policy-versus-reachability limits, affected AC and smallest missing capability requested by the parent.

Once W1 convergence is accepted, proposed W2/M2 is coordinator → durable task → one native DSH worker → local artifact/result → independent check → native report/control. Freeze shared contracts before parallel002/008,004/011,005,012 and local013/014 work. Actual model inference needs separate bounded authorization; no model/profile-provider call is proposed as implicitly authorized here. Source-inspected agent/loop/sessionController APIs are candidates, not tested worker capability.

All original001–016/007A/B/010A scope and Chinese source AC remain. Proposed W3 memory, W4 events/first chosen chat channel, W5 UI/results/runtime audit and W6 full preview MVP are mapped in [waves](../../waves.md). Provider selection, pinned fishball source/redistribution and main licenses, live identity/handoff, retention/event/UI/delivery and measured resource policies remain grouped in [decisions](../../decisions.md). No later scope is silently removed or called MVP.

Supported Library DOCX materialization returned exactly `library file transfer failed: download failed`, with no further cause. PDF transfer was not attempted afterward; no local DOCX/PDF bytes or guessed URLs/cloud paths are claimed. Complete approved DOCX text was read through Library (529 lines), preserving ticket IDs/AC; this did not block implementation.

## Local integration disposition

Feature logical history and clean tracked evidence are retained; no destructive rewrite/reset/rebase was used. Local main remains `abb28b7` while the blocked acceptance row is open. After closure, the workflow requires a reviewed squash commit preserving feat/M1-foundation and identical accepted executable trees. There is no full-MVP acceptance or release/publication.
