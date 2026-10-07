# NI6-PREP01 executor r2 affected independent test review

Status: **SOURCE_BLOCKED / NOT_RUN / HOLD**. Reviewer `/root/ni5_r3_affected_review`, Sol6.1 max. The complete754-line r2 runner supports the selected eight corrections, but a concrete destination-ownership failure remains: finalization can touch a preexisting evidence directory after its creation was refused. A new immutable successor is required. This report grants no source/build/functional/adoption GO.

The immutable36-family design remains MD `72152ce0f59b08f458bda8a1d86e3c3278c87e457bddf1f246b6ac9fb3cf923b` and JSON `f6fbf477c652c2d8e12f406ed8af5129d98a42a59fc4161265c11979a8e14067`. Root's additive freeze, fully read before r2 source, is `docs/ni6-executor-r2-remediation-freeze-2026-10-07.md`,6149B SHA256 `5549cc59491cdf053d98b81b41a63bf01bcd607677463242f2229c3ded00f40c`. It selects eight corrections and new report paths; no family, command, probe or acceptance expansion follows.

## Exact evidence

| File | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-prep01-executor-r2/source-manifest.json` |6318|`f3a308d98b2c7976af405b5e23e5c16862f5a28fc077bffcd33be5de39e76be2`|
| `.runtime/ni6-prep01-executor-r2/runner.py` |40432|`3505cefb90104ec82133c72c240e7e8912bb47a599295616b767366c6d35624b`|
| `.runtime/ni6-prep01-executor-r2/runner.before-r1.py` |25578|`78c81f04a75130fc47e110aef29ecc0853821bb55caf3896783a2e2c6967e626`|
| `.runtime/ni6-prep01-executor-r2/source-delta.diff` |49992|`29cb4909aef5cab03ef31b36446a1ba59b2015825ba6f3e8ccf79d19482641ae`|

All18 records (three owned plus15 inputs) independently match bytes/hashes and are canonical regular nonsymlink files. The directory is0700; its physical inventory is exactly these four files, each0600. The beforecopy equals the preserved r1 source. Independent ordinary-text unified-diff reconstruction matches all49992 delta bytes and nine hunks. The manifest itself is separately pinned. Original designs, rejected source/test reports and r1 source/manifest match their declared immutable inputs.

No application parsing/import/execution, build, test, fault fixture/probe, OS process query/signal, listener/profile/database/browser/provider/model/network/Git action or private-content read occurred. Only public source/hash/metadata helpers and this new evidence pair were used. One helper initially failed before process creation due to a disconnected exec transport; the later read-only reconstruction succeeded. It was not a runner invocation, phase retry or policy denial.

## Open blocker ER2-01

**A refused evidence-directory creation does not revoke the finalizer's write target.** `main()` assigns the fixed evidence Path at510, then calls `private_directory(evidence)` at512. If the directory already exists, mkdir raises before this invocation has created or verified it. The caught ordinary exception enters finally with evidence still non-None. At695–699 finalization can create an after-check or phase-result record in that existing directory. If root-phase-result.json already exists, fresh creation fails, then invalidation at740–741 can call the overwrite form of terminal_save on that existing file. For a canonical owner0600 file, save() at162–173 permits overwriting it. No evidence-owned latch proves the current invocation created and checked the directory before any of those writes.

This is an independently derived source path, not a produced directory or executed response. It violates EX05/EX25/EX30/EX32/EX33 preservation/containment and additive item3's newly owned destination requirement. It also defeats item2's safe failure-default finalization at that refusal boundary. A finite rejection does not authorize writing into a previous evidence namespace. Private/evidence root directories and files being checked elsewhere do not establish this directory's ownership for the current invocation.

The exact correction is an ownership latch, set only after successful fresh creation and canonical type/owner/mode verification, gating **every** evidence write in normal work, finalization and invalidation. Before ownership is established, keep only the already consumed valid invocation marker and safe failure/unknown return; preserve the existing evidence directory/results without reads of their contents, chmod, overwrite or alternate destination. The independent source lane corroborates this as **F-EXE-R2-S01**. Current r2 remains immutable/unexecuted and ER2-01 remains open.

## Selected corrections: expected versus source

| Freeze item | Actual source support and disposition |
| --- | --- |
|1 early once consumption| Exclusive0600 phase invocation marker at494–499 precedes environment, plan, proposal and pin selection. It is never deleted/reset; existing marker refusal cannot select a second phase attempt. The old ET01 ordering defect is source-remediated. |
|2 failure-default completion| complete/finalized start false at503; broad ordinary exceptions and supported interruption are caught; complete requires every exact command, complete capture, group absence and after verification at659–674. Result/ledger/marker remain nonfinal through the staged commits711–720. Test requires finalized PASS marker/ledger/result528–537. Old ET02 false-finally-PASS logic is source-remediated, subject to ER2-01 and the actual driver-return boundary. |
|3 directory/file modes| Each copied parent is freshly made and checked through copy_parents128–137; private_directory122–125 only chmods its newly created component; exclusive140–151 fchmods/verifies regular owner0600 files. Overwrite save checks inode/device identity. Recursive default parent modes are removed. These mechanisms are source-supported; **ER2-01 leaves destination refusal preservation blocked**. |
|4 EOF/prefix truth| EOF flags226/325–327, prefix readback361–378 and captureComplete379–384 require both streams' factual EOF and retained bytes without overflow. Missing EOF records UNKNOWN truncation; observed discarded tail records true. Prefix hash/length do not claim full output. Source-supported; no runtime capture proof. |
|5 catchable stop| SIGTERM/SIGINT latch one flag63–65/506–507, guards observe it, repeated signals do not raise during the sole cleanup path, and no ordinary work follows an observed stop. Source-supported at the explicit observed-check boundaries described below; no instant cancellation claim. |
|6 complete/conservative time| Child work reserves4s cleanup+1s metadata212–217. Prefix hashing, schema/TAP parsing and metadata are guarded; observed command work plus1s charge is separate637–652. Full phase observed work plus5s terminal charge670–705 is checked through terminal writes689–691, commits and invalidation. Old ET03 omissions are source-remediated under the selected conservative charge, subject to genuine root observations and OS limits. |
|7 denied/unknown signals| Every new signal has an absolute deadline check; unknown group observation permanently blocks signalling230–243. Denied signal277–281 blocks any KILL/retry/finalizer escalation. Observed absence stays latched, preventing later reinterpretation of that number. Old ET04 is source-remediated; actual owned-group/descendant observations remain unproved. |
|8 strict diagnostic| strict_json73–82 rejects duplicate members at every object depth and nonfinite constants. safe_functional parses JSON comment frames independent of key order/spacing/escaping, finds nested selected identity, rejects malformed selected hints, requires exactly one closed14-field/nested-domain success406–462. Old ET05 duplicate-member loss and fixed contractVersion-first parsing are source-remediated. No output was decoded from an actual run. |

The exact four build, six syntax, pure1 then functional1 argv remain at465–483; shell=False/fixed cwd/new session remain305–306. Two drivers plus four build interpreters/six syntax Nodes/two test parents/two ordinary test workers remain the prospective maximum16 starts. No actual process count was observed. The full27577-file/12-link and required source/review/generated/root-pin mechanisms are source-read at176–199/563–605/656–659; this review hashes the18 executor records, not the pending fixture/full-host union.

## Qualified interruption, accounting and publication boundaries

The observed-stop guard at304 is the admission fence immediately before Popen305; a signal delivered after that check is a post-fence interruption handled by capture/cleanup. Python signal delivery and OS spawn are separate operations. No source claim of an atomic real-time signal-arrival/spawn guarantee is accepted. Root has selected precise observed-check admission/completion semantics for the successor freeze, without instant cancellation or new probes.

After all required work and terminal writes, the last postwrite interruption check is721, followed by finalized=True722 and return745. A later flag can arrive after the check. Treat that as a declared post-completion boundary, not a proof that every possible signal until OS process disappearance produces a failed phase. **The root must observe an actual successful driver return before test GO.** The persisted finalized records alone do not establish that return, absence of an uncatchable termination or a timely OS outcome. This is the expressly retained boundary, not a separate universal signal-race test or source waiver for earlier observed stops.

Conservative command charges are metadata upper windows, not exact measured wall times; observedWorkSeconds is retained separately. Phase observed work already contains actual command bookkeeping; add only the single5s terminal charge to shared spend. Test subtracts prior conserved spend and excludes only the stopped human-review interval. Late observed operations and incomplete capture/checks remain failure/HOLD. Terminal invalidation selects no late I/O after its reserved deadline; an uninterruptible operation may still leave prior bytes. A failed/unknown/overrun driver return forbids advancement even if persisted records appear finalized. No process record substitutes for actual original entry removal, HTTP404, root/listener/native/remote termination or reservation release.

Numeric TAP mapping remains exact pure31/functional1,0suites/fail/cancel/skip/todo; raw names/errors/AssertionError actual/expected stay private. Successful diagnostics remain closed14 with exact requests1/18/1/20, refs64hex, safe nonbool integers, sourceVersion>=1/taskVersion=source+1, memory0,44 inspection windows, seven zero event counters, actual original entry/root assertion flags, typedCurrentness OUTSIDE_SELECTED_PUBLIC_RPC_SLICE and acceptance HOLD. Reordered JSON comment diagnostics and escaped keys/values are decoded before identity/schema checks; nested identity in an invalid wrapper cannot provide success. Unknown ordinary text remains private; the parser may conservatively reject malformed JSON-looking comments. None of these source checks establishes genuine producer provenance by itself.

## All36 families conserved

The companion JSON retains each original expectation verbatim, adds actual source locations/dispositions and authorizes zero additional probes. Every family remains **NOT_RUN/HOLD**.

| Families | Source disposition |
| --- | --- |
| EX01–EX04 | Fixed GO/provenance/pin/argv mechanisms supported; whole accepted phase remains blocked by ER2-01. |
| EX05–EX07 | Canonical containment/environment/root-GO mechanisms supported; EX05 destination refusal blocked by ER2-01. |
| EX08–EX11 | Early consumed marker, no reset, explicit complete/finalized handoff supported; actual successful build driver return is mandatory. |
| EX12–EX16 | Shared180s/command60s/conservative reserves, postoperation guards and incomplete failure supported; actual timing and uninterruptible outcome not proved. |
| EX17–EX21 | Fresh owned session, leader/pipe/group distinctions, deadline and denied/unknown latches supported; actual ownership/drain/signal results not observed. |
| EX22–EX24 | Concurrent bounded prefix capture and explicit per-stream EOF/incomplete metadata supported; no boundary probe. |
| EX25 |0700/0600 creation mechanisms supported; **preexisting evidence preservation blocked ER2-01**. |
| EX26–EX29 | Strict nested diagnostic/actual numeric TAP and finite codes supported; no actual success diagnostic/TAP observed. |
| EX30–EX34 | Required/public copy/full-check/firstfailure/command evidence mechanisms supported; EX30/32/33 preservation at refused destination blocked ER2-01. |
| EX35–EX36 | Prospective31 UNIT_ONLY cells remain separate from nine genuine public functional cases; process outcome confers no original closure/release/currentness acceptance. |

## Next obligations

Root should freeze ER2-01's exact ownership gate and the observed-check signal/completion qualification in a new immutable successor; preserve this r2, r1, both rejected reports and the unchanged36-family design. The successor needs separate affected source/test review before any build. The newly sealed preparation-r2 fixture requires its own affected review against the unchanged nine-case design and frozen31-cell subset; it has not been source-read in this executor review. No extra general verification layer, bad-state fixture, timeout/overflow/denial probe or retry is selected here.

Concrete root plans must pin fresh reports, both freezes, all complete inputs and generated/readback evidence. Only root's later supported finite operation can supply actual time/counter/TAP/HTTP/Loader/disposal facts. All87 accepted0/HOLD, typed raw-currentness/native/cold/browser gaps and permanent final CODE blocked remain unchanged.
