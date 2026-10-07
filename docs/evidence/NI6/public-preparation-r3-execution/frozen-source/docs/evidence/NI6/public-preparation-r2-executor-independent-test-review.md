# NI6-PREP01 executor r1 affected independent test-design review

Status: **SOURCE_BLOCKED / NOT_RUN / HOLD**. Reviewer `/root/ni5_r3_affected_review`, Sol 6.1 max. Five concrete source findings require a new immutable executor successor before root GO. This review does not amend the sealed executor, the independent 36-family design, the nine-case public preparation design, the rejected r1 fixture or any prior evidence.

The review followed the independently sealed design: MD SHA256 `72152ce0f59b08f458bda8a1d86e3c3278c87e457bddf1f246b6ac9fb3cf923b`, JSON SHA256 `f6fbf477c652c2d8e12f406ed8af5129d98a42a59fc4161265c11979a8e14067`. Those bytes existed before any executor source read and remain unchanged. Root froze the implementation-free AC, finite r2 delta and successful diagnostic declaration first. The complete 478-line runner and its manifest were then read as text. The pending r2 fixture assertion bodies were not read in this task.

No application was parsed, imported or run. There were no fault probes, tests, builds, process queries, signals, listener/profile/database/browser/provider/model/network/Git actions or private-content reads. Separate source/hash/metadata helpers were used only to review public files and write this new evidence pair. Root alone owns future execution and adoption. All87 remain accepted0/HOLD; typed raw-currentness, native/cold/browser acceptance and the permanently blocked final CODE investigation remain untouched.

## Exact source and design binding

| Input | Bytes | SHA256 |
| --- | ---: | --- |
| `.runtime/ni6-prep01-executor-r1/source-manifest.json` |1815|`26d777f4064c5b26c2229baa133ca70ff5d9fafd82976a8affd6b97ceeca18e0`|
| `.runtime/ni6-prep01-executor-r1/runner.py` |25578|`78c81f04a75130fc47e110aef29ecc0853821bb55caf3896783a2e2c6967e626`|
| `docs/ni6-preparation-r2-executor-freeze-2026-10-07.md` |6430|`63197b73ef53b8b40e2185cb88b225474db347311e85edffbef20c08db43a9bb`|
| `docs/ni6-preparation-r2-delta-2026-10-07.md` |4528|`69d640925d3d0292d5eee875707439c69a254fe393954e02117292aefca185d5`|
| `docs/contracts/ni6-public-preparation-diagnostic-v1.md` |2079|`c68c943a72438940f19196d2f12e8d1f862231af9b9496562d93beebdcc66bf2`|

All seven manifest records (one owned file and six inputs) independently match their declared sizes and hashes. Each is canonical and a regular nonsymlink file; the two external inputs are the exact frozen Node/Python binaries. The executor directory is0700; runner.py is0600. Its inventory is exactly runner.py and source-manifest.json. No phase ledger, raw capture, generated output or functional observation was authored by this reviewer. The companion JSON records all seven pins, the manifest itself, public original contract-source hashes and preserved designs/reviews.

## Blocking source findings

**ET01 — Once consumption follows command selection and manifest validation.** `main()` reads the r2 manifest and proposal at347–349, selects exact commands at350 and validates manifest/required/root pins at354–373. Only afterward does it create the build ledger at374–379 or mark test IN_PROGRESS at390–391; phase evidence/private destinations are created at398–399. The frozen AC and EX08 require consumption before command selection. An approved phase refused during these earlier selection/validation operations leaves the once record unconsumed. The existing argv restriction is real; it does not establish the required once boundary. Consume the authorized phase and fresh destinations before selection, then preserve refused/interrupted/uncertain consumption without retry, reset or advancement. Invalid or unapproved CLI inputs need no application admission.

**ET02 — An uncaught exception can persist PASS without complete work.** At401 the phase starts with `failed=False`. The phase handler at449 catches only Stop/OSError/ValueError/KeyError/KeyboardInterrupt. TypeError and other unforeseen failures can escape the protected phase body. The finally at456–469 nevertheless chooses PASS whenever `failed` remains false and sampled spend is below180seconds. For example, the unguarded iteration of `plan['sourceCopies']` at414 can raise TypeError after preverification and before any command; this is a source control-flow deduction, not an executed malformed plan. No positive completion condition requires all selected commands, schema checks, capture and after verification to have finished before writing PASS. The outer handler at476 also excludes such failures. Start from failure/unknown, record finite safe failure metadata, and authorize PASS only after explicit complete success of every required stage. An exception or interrupted final persistence must leave a consumed phase failed/unknown/HOLD. Do not widen public error text.

**ET03 — Charged elapsed time and observed deadline guards do not cover all included work.** At457 active elapsed is sampled before final ledger and phase-result writes at464–469; those costs are absent from the persisted shared180second spend, and no postwrite overrun refusal follows. At251 command duration is sampled before private captured-byte hash readback at252–255; there is no final observed overrun check before a command with failureCode=None is returned. In addition, primary cleanup at192–208 has no `hard_end` check before each newly submitted signal, unlike the final cleanup at226–227. If earlier synchronous work returns after the bound, this primary path may select a new signal after the command deadline. The4second TERM/KILL reserve, deadline clipping and monotonic loop checks are present, but do not repair these omissions. Conservatively charge the complete verification/copy/capture/hash/parser/bookkeeping/persistence costs across both phases, include complete command accounting, refuse further bounded work after observed exhaustion, and record any observed overrun/incomplete operation as HOLD. The AC explicitly retains the uninterruptible-OS limit; it does not permit a false timing pass after an overrun becomes observable. Exclude only the fully stopped human-review gap.

**ET04 — Denied/unknown ownership permits cleanup signals.** The PermissionError handlers at201–202 and234–235 append DENIED_UNKNOWN but neither breaks/latches denial nor disables the later SIGKILL step. The ordinary cleanup loop and finally may therefore select another signal after the denial. Separately, `group_exists()` returns None on PermissionError at136–137; the `is not False` conditions at191/222 and only-False exclusions at193/224 treat that unknown boundary as permission to select signals. EX21 and the design MD line39 require stopping at a denied/unknown ownership boundary; AGENTS.md line11 requires stopping on a denied runtime-policy action. This is a source failure-boundary defect, with no actual denial or signal exercised. Latch denial/unknown ownership, stop further signal selection, retain unknown/HOLD and preserve the existing prohibition on alternate targets, retries and remote/native release claims. At most one TERM and one conditional KILL remain the permitted non-denied selected path.

**ET05 — Duplicate diagnostic member names are discarded before the closed-shape checks.** `safe_functional()` calls plain `json.loads` at284, then checks the resulting14-key dictionary and nested domains at285–301. The original Python JSON source has a default decoder with object_pairs_hook=None (`json/__init__.py:245`) and converts object pairs to dict (`json/decoder.py:216`), so repeated names are lost before these checks. A recognized diagnostic containing a repeated top-level or nested member whose final value is valid is not rejected for ambiguity. The source already rejects multiple recognized diagnostic lines at303, unknown surviving fields, malformed values, booleans in integer slots and incorrect enums/joins. Those checks do not detect duplicate members within a line. EX26/EX27 require strict, unambiguous successful diagnostic publication. Reject duplicate members at every object level before schema/domain validation; retain raw rejected text privately and publish only a finite rejection code. This finding neither claims a raw error is currently exported nor proposes broad logging or extra runtime probes.

ET01/ET02 are independently corroborated by the separate source-review lane. ET03/ET04 were relayed to that lane and root. ET05 is owned here as the precise affected diagnostic-integrity obligation. All five are open source blockers in this immutable r1. None has been executed or remediated in this report.

## Selected source boundaries and limitations

`exact_commands()` at307–325 closes the prospective selection to four build commands, six syntax checks in the frozen order, then the pure suite and public functional suite once each with test-concurrency1. It compares the proposal and root-plan command vectors. `Popen` uses fixed repository cwd, shell=False, DEVNULL stdin and start_new_session=True at156–157. Interpreter aliases resolve to the frozen canonical binaries; environment override names are rejected without printing their values. The prospective inventory remains12 child commands and at most16 interpreter starts: two Python drivers; four build interpreters (three Python, one Node); six syntax Nodes; two Node test parents and two ordinary test workers. Exact descendant/builder behavior and their actual counts still require the separate r2 fixture review and genuine selected root evidence. No actual process count was observed here.

Selectors capture the two nonblocking pipes concurrently. The retained-byte calculation at176 caps each stream at1MiB and combined capture at2MiB, stores only a prefix, and the first excess observation sets OUTPUT_BOUND. Raw files are exclusive0600 inside a checked0700 private directory; raw bytes are not copied into public command records. Numeric TAP totals have duplicate-count rejection and must match pure31/functional1 with0fail/cancel/skip/todo and0suites. These are source-compatible selected mechanisms, not observed timing, overflow, drain or cleanup results.

Captured length/hash describe retained bytes. `receivedAtLeastBytes` is only an observed lower bound; `truncated` compares bytes received with bytes retained. A false truncated value does not prove EOF or complete producer output on timeout/interruption. Failure/unknown rows remain HOLD; neither leader exit nor a captured prefix proves original entry removal, root closure, listener closure or release. The runner explicitly records remoteTermination/reservationRelease and nativeTermination as NOT_CLAIMED.

The diagnostic parser selects the fixed compact prefix with contractVersion first. An absent or differently formatted sole diagnostic fails required-once; unknown ordinary text stays private. The declared14 fields and exact4 request totals/seven zero event counters are enforced for the decoded recognized line, subject to ET05. The exact refs are lowercase64hex; integer domains exclude bool and floats; taskVersion=sourceTaskVersion+1, memoryRevision0, inspections44, closure flags true, typedCurrentness OUTSIDE_SELECTED_PUBLIC_RPC_SLICE and acceptance HOLD. Such flags are selected fixture assertions and require genuine original observations; the runner cannot turn process exit into them.

Full pin/graph loops cover prospective required manifests/rules/designs/reviews/root plan/runner/generated outputs and all27577 original files/12 links. These loops were source-read only; this review independently hashed the executor's seven records, not the pending r2/full host union. Source copies are constrained to required owned/public evidence members and exclude private-runtime/private- names; the exact future root selection must still be finite and public. Recursive mkdir at419 does not independently enforce0700 on each intermediate source-copy directory: original pathlib recursively uses the default mode for parents. The checked0700 evidence ancestor preserves the reviewed enclosing boundary; this is not an observed disclosure or proof that every nested directory has0700. The source lane owns any exact storage-mode correction before GO.

## Conservation of all36 independent expectation families

Every row remains **NOT_RUN/HOLD**, with zero additional effectful probes authorized. “Source compatible” below means only the inspected selected mechanism; it is not a test pass or GO.

| Family | Affected source disposition |
| --- | --- |
| EX01 valid selected admission | Fixed identity/GO checks present; ET01/ET02 prevent accepted phase outcome. |
| EX02 source pin completeness | Size/hash/membership checks present; complete future union still required; ET01/ET02 apply. |
| EX03 canonical interpreter | Exact paths, resolution and required hashes present; execution bootstrap remains root-owned. |
| EX04 closed argv/phase | Four build plus six syntax/pure/functional exact order; no arbitrary shell. |
| EX05 cwd/containment | Canonical regular public inputs, two exact external binaries; future copy subset must be reviewed. |
| EX06 environment | Finite injection-name refusal; values are not logged. |
| EX07 root GO | Separate true root GO required; proposal is not authority; actual build evidence required for test. |
| EX08 once consumption | **Blocked ET01**. |
| EX09 no retry/reset | Existing latches are refused, but early failures leave no consumption and ET02 can write PASS. |
| EX10 build/review/test | Shared ledger path exists; **blocked ET02/ET03** for factual handoff/budget. |
| EX11 invalid handoff | Build PASS/test UNCONSUMED guards present; **blocked ET02** for trustworthy PASS. |
| EX12 shared accounting | **Blocked ET03**. |
| EX13 aggregate boundary | Monotonic checks present; **blocked ET03** for all included costs. |
| EX14 command boundary |60s clipped window/4s cleanup reserve present; **blocked ET03**. |
| EX15 reserved time | Precommand aggregate reserve present; **blocked ET03** for final accounting. |
| EX16 invalid/incomplete time | Failed/incomplete checks exist; **blocked ET02/ET03**. OS termination remains unproved. |
| EX17 owned group identity | Fresh Popen/session binding present; actual ownership/descendant lifetime remains unobserved. |
| EX18 normal completion | Leader/pipes/group checks present; factual selected completion unobserved. |
| EX19 leader-only completion | Pipes or surviving group cannot silently produce ordinary success; actual drain remains unproved. |
| EX20 conditional cleanup | Once-per-signal tracking present; **blocked ET03/ET04**. |
| EX21 denied/unknown cleanup | **Blocked ET04**; no alternate target or release proof allowed. |
| EX22 byte boundaries | Finite retained-prefix calculation/overflow stop present; no fault observation. |
| EX23 concurrent pipes | Nonblocking selectors present; no runtime deadlock or drain proof. |
| EX24 incomplete capture | Retained hash/size and lower bound only; no false full-stream interpretation permitted. |
| EX25 private storage | Exclusive files and0700 raw ancestors present; nested source-copy modes require separate qualification. |
| EX26 exact diagnostic | Closed decoded schema/domains present; **blocked ET05** for duplicate members. |
| EX27 ambiguous diagnostic | Multiple recognized lines rejected; **blocked ET05** within a line; fixed-prefix limitation retained. |
| EX28 actual TAP | Exact numeric pure31/functional1 mapping present; no actual TAP totals observed. |
| EX29 public codes | Finite ordinary failure codes/public metadata; **blocked ET02** for unforeseen-exception containment. |
| EX30 public source copies | Owned/required membership and private-name exclusions present; exact future public subset required. |
| EX31 full verification | Required/graph loops present; future complete union and actual checkpoints unobserved. |
| EX32 first failure/drift stop | Detected command failures stop iteration; **blocked ET02/ET04** for all failure paths. |
| EX33 incomplete after-check | Caught failures write incomplete/UNKNOWN; **blocked ET02/ET03** for unforeseen/late outcomes. |
| EX34 genuine command evidence | Public metadata is derived from returned rows; **blocked ET02/ET03** for outcome/time completeness. |
| EX35 UNIT_ONLY | Pure31 counts remain three positive/28 negative prospective cells; assertions/source not reviewed here. |
| EX36 no closure/release promotion | NOT_CLAIMED plus acceptance HOLD retained; process outcome supplies no original closure/native proof. |

## Required next disposition

Preserve this r1 and all original designs/reviews. Root should freeze the exact five remediations and any necessary storage-mode/path refinement before a new executor source is authored. A new affected source/test review must reconstruct that successor against the unchanged36-family expectations. No extra failure probe, rerun, group, listener or general verification layer is authorized by this report.

The r2 fixture itself, its exact immutable manifest/31-cell body and genuine original Loader/public HTTP/disposal oracles remain a separate pending review. Concrete root build/test plans must pin both executor reviews, the diagnostic declaration, the original designs, all required fixture reports and generated/readback evidence. Future timing/accounting/process/TAP/HTTP facts must come only from root's separately approved finite invocation. A failed/denied/interrupted/unknown result cannot advance or rerun. All87 accepted0/HOLD and final CODE blocked remain unchanged.
