# NI6 bootstrap diagnostic r1 — independent test-design review

Date: 2026-10-07. Reviewer: `/root/bootstrap_diagnostic_r1_test_review`, independent of source author `/root/ni6_request_validation_rootcause`. Supplied branch context: `feat/S3-integrations`; this review performed no Git action.

**Decision: no source-only test-design blocker for the exact sealed, once-only, zero-model diagnostic, with the qualifications below.** This completes an independent ISTQB test-design review. It is not a runtime PASS, preparation acceptance, proof of the original failing call, or approval to execute. Both selected Node commands and every prospective runtime/fault family remain **NOT_RUN**. Root execution GO remains false; no actual root execution plan, invocation marker, application diagnostic, private runtime/capture directory, or execution evidence directory was present at the final inert input readback.

`accepted=0`, `all87=HOLD`, `CODE=BLOCKED_UNCHANGED`. The final CODE security investigation remains permanently blocked; this bootstrap scope cannot close it. The original preparation-r3 functional attempt remains `FAILED_HOLD`, and the Mac UI gate remains paused. No prior acceptance assertion or cleanup obligation is weakened.

## Basis and independence

The applicable root `AGENTS.md`, both owner amendments, development workflow, complete root freeze, complete lifecycle clarification, immutable original r3 bootstrap, relevant original Cordis/Loader/plugin contracts, and genuinely built r3 package sources were read. The complete final diagnostic, executor, proposed false-GO plan, README, manifest, literal source delta, and both author report narratives were reviewed after the final source seal. No partial author draft was used to seal this report.

The review used source inspection, state-transition reasoning, decision tables, equivalence partitions, boundary values, and failure-path analysis. Trusted, isolated stdlib readers inspected inert JSON metadata, file bytes, hashes, inventories, and literal text differences. They did not parse, import, compile, or execute either candidate program. No listener, profile, application, network request, test worker, fault probe, model/provider/browser/tool/session/agent work, private authentication/key/database/raw-stream inspection, historical R01 inspection, CODE receipt/envelope investigation, source modification, rebuild, or Git operation occurred in this review. Only this report pair is authored by this reviewer.

The manifest inventory establishes byte identity; it does not claim a fresh semantic audit of every inherited application file or resolve the separately blocked CODE boundary. Semantic inspection followed the actual bootstrap and original public host lifecycle contracts. Existing predecessor evidence is preserved and attributed to its own attempt.

## Exact reviewed source seal

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/README.md` | 5227 | `5f9c16d8bd0b37f8477dbc672fdfde87f27f869e3e9062590fa6c28bf387324a` |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/diagnostic.mjs` | 18973 | `1f8123a742aeff56abb14e674f7493ed7d3090d775d002a0f1433a0d43b3e8dc` |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/execution-plan.proposed.json` | 5636 | `0b8eb8702860fd9366d9f8b0f596a356bea79f2ec3eb05a51b05984e40b165ed` |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/run-once.py` | 31438 | `91addca4c96124727801bf985747c1d863369f5a7e9ba5f12618e68cdc02ebef` |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/source-delta.diff` | 81744 | `f89dd70579ac2adf110ecaa8fa2f4a9a86f818713115e87c91eef0e4878a31ba` |
| `docs/evidence/NI6/bootstrap-diagnostic-r1-source.md` | 7683 | `1eaf52b4472a7412b46c8174f9ed9e8a1e77bb4432e94d71ac5b4e5488bc5a96` |
| `docs/evidence/NI6/bootstrap-diagnostic-r1-source.json` | 23460 | `20bd3757df8cb54c6ffcf63e6c02bc5b015637fe01533a2b2cc260186a512686` |
| `.runtime/ni6-public-preparation-bootstrap-diagnostic-r1/source-manifest.json` | 103870 | `2b7b3afb67296e8a7709d272cf32c7048aca08a95f29ba4030f16bf8dc8bfdb1` |
| `docs/ni6-bootstrap-diagnostic-r1-freeze-2026-10-07.md` | 8555 | `3b3f9cd28317c5b94b3c8f1564d1b53483efc5088753c18a69027b3a1a9f9d40` |
| `docs/ni6-bootstrap-diagnostic-r1-lifecycle-clarification-2026-10-07.md` | 2845 | `37d5a51c8fb5d1ccbec5727a7de998c33a7f951564caef4aa5e898430c3b9826` |

The JSON companion records the complete 425 verified owned/input records, manifest self-pin, and supplemental reviewed source hashes, including both author narrative files. This pair must itself be hashed by root after final readback and included as two of the four actual independent report pins; this report does not invent self-referential hashes.

The independent inert checks observed seven owned files plus 418 immutable inputs totaling 16,421,471 input bytes, with all 395 predecessor records preserved exactly and no digest/size drift. Including the manifest and four actual final independent reports yields the required 430-pin union. The two literal diffs, including their separating blank line, reconstruct the exact 81,744-byte delta. Six executable-alias/product-peer links match. The complete official host graph matches 27,577 regular files, 479,383,316 bytes, and 12 links, without extra/missing files. The product matches 64 descriptor entries and 65 physical regular files, including the descriptor; the normal peer points to the original official host node_modules. The final inert metadata/delta/graph/product/absence check returned zero in 2.405041 seconds. This elapsed time is for that read-only review helper, not the diagnostic or once-only driver.

The actual built r3 client and generated descriptor are immutable inputs, respectively SHA-256 `2df9592a085c65f01f104e552f52128d8a4657bb57ef4ba3592e2fdb89748d41` and `6c2c17b1a751a9ca07880661f8a14eb732344c0ff086e663293ce9ceec2f0382`. The separately pinned public actual build return, `docs/evidence/NI6/public-preparation-r3-root-readback/root-ni6-prep01-r3-observed-build-return.json`, is 759 bytes, SHA-256 `71769b976186b302fd455a2728c904b7d02cb5cf5d5f63ad2d69e9751b2d4c14`; it records actual driver exit 0 and four actual build-command exits 0. A persisted build PASS alone is insufficient. No rebuild or copying into a replacement package was performed. The original bounded safe error code `PREP01_ORIGINAL_BOOTSTRAP_FAILED` identifies the original outer failure path; it does not identify a failing plugin or call.

## Source-supported behavior and oracles

The diagnostic preserves the original thirteen public host imports and eleven real plugin invocations, in order: Loader, Projections, Sessions, Approval, Agents, Llm, SystemPrompt, Tools, LocalCredentialProvider, WebServer, Connection. Original public configuration remains literal, including Approval `never`, Tools native/maxParallelSubCalls 1, fresh explicit credential path with watch false/debounce 100, WebServer `127.0.0.1:0` with compression none, and Connection trustedHosts empty/cookie age 1/max body 65536/recovery empty. The launch snapshot selects only fresh DSH_HOME/XDG_CONFIG_HOME. Completed-plugin count increments only after public readiness and active state/UID checks; imports alone do not prove plugin success.

The selected prospective effects are one original Context, those host plugins, one ephemeral loopback listener, the original fresh synthetic credential/signing-secret write and ordinary credential lock, and the built entry's original in-memory SQLite capability probe. Registering the route causes no dispatched HTTP request. There is no selected setup preview/confirmation, task/domain operation, DF runtime-child activation, provider registration, model/cloud request, tool invocation, session/agent creation, or durable ledger. These are source/effect bounds, not newly observed runtime counters. The original atomic-write library contains a stale-lock holder-record/PID-probe branch; an absolute transitive “no PID probing” claim is unwarranted. No predecessor lock path is selected, and neither candidate directly inspects authentication/lock records or unrelated PIDs.

Loader settling is distinct from entry existence and startup. Its allSettled behavior does not make a failed import an active fiber. The diagnostic resolves the entry, checks that its raw fiber exists, explicitly calls public `entry.fiber.await()`, and checks active state/UID. Removal calls the original public remove at most once, awaits the saved raw fiber and Loader settlement, then checks absence and terminal plugin-fiber state. A startup failure can rethrow from raw Fiber.await during cleanup; removal is then conservatively incomplete. On work failure after an entry ID is obtained, the same once-only cleanup path is available within the shared cleanup deadline. There is no replacement plugin, wrapper scope, private `_unload`, or fake lifecycle assertion.

The original public root fiber has runtime null and UID 0. Its public dispose restarts the root; the plugin-fiber terminal disposer that sets UID null is a different path. The diagnostic deliberately retains the original strict root UID-null/state-4 observation. If earlier startup and removal succeed, the source-supported expected outcome is **FAILED_HOLD / ROOT_CLEANUP / INVARIANT / rootClosed=false**, not a newly observed result. Root restart is not terminal closure. If an earlier phase failed, its first phase/category remains the primary result even when root cleanup also fails. This diagnostic may locate a new attempt's earliest instrumented failure boundary; it cannot prove that the original r3 bounded outer-catch failure occurred at that boundary.

The natural-event counters and public agent/session/tool/provider inventories are checked before entry, after entry readiness, and after removal. Each guard resets `zeroNative` false before inspection; a completed good guard sets it true. The final value combines the latest successful covered inventory with retained zero event-counter history. It is not a conjunction of every historical inventory guard: an earlier inventory-only failure can coexist with a later true value while its first failure remains latched. Root-owned observer disposers can disappear during root unload, so retained counter values do not establish continuous final root-cleanup observation or post-root registry emptiness.

The first failure is a frozen own phase/category record. No caught error message, object property, stack, URL, header, credential, or arbitrary payload is serialized. The closed result has exactly ten fields: `contractVersion`, `result`, `phase`, `category`, `completedPlugins`, `entryRemoved`, `rootClosed`, `zeroNative`, `all87`, `CODE`. Phase is one of the thirty sealed tokens; category is NONE, REJECTION, INVARIANT, or DEADLINE; plugin count is an integer 0–11, not boolean; the three observation flags are booleans. PASS requires COMPLETE/NONE, eleven plugins, and all three true flags. Failure observations may remain partial. The exclusive owned mode-600 regular result, including newline, is at most 512 bytes. The executor reads at most 513 bytes and validates exact fields, types, enums, duplicates/nonfinite values, and the PASS combination. A schema-valid child record is an observation, not command, driver, or acceptance authority.

The executor validates the exact plan keys and immutable proposed values, three true root gates, complete actual pin union including the four final reviews, interpreter bytes/links, environment exclusions, actual build-return proof, and fresh namespaces. The proposal remains false-GO with empty pins. Root's prospective selected invocation uses `/opt/homebrew/bin/python3 -I`; Python isolation leaves the script/plan two-argument contract and the same two Node commands unchanged. The README's example omits `-I`; this report records root's explicit selected invocation without silently changing the sealed source. Before root selection this is only a prospective command.

A correct-location invocation consumes the exclusive fresh marker before later plan/GO/environment gates; a false-GO attempt would therefore consume the single opportunity and refuse work. Wrong arguments/location refuse before marker consumption. Existing marker/result/runtime/capture/evidence paths, symlinks, ownership/mode/identity mismatches, and uncertain destinations are not reset or overwritten. Fresh directory ownership and original path/device/inode identity are latched before writes. Rewriting the owned marker checks the original identity before truncation. Result and capture checks also bind opened descriptors to original path identities, with bounded reads.

Only two sequential Node starts are admitted, stdin DEVNULL, shell false, each in its own fresh process group. No helper process, extra Python, test worker, retry, or reroute is selected. Cleanup observes/signals only those groups; denied or unknown signaling refuses further signaling, with no unrelated PID/group targeting. Group absence and capture EOF are separate obligations. SIGTERM/SIGINT latch a stop request; observed stop checks prevent later admission and final PASS, without claiming an atomic interruption-free interval between instructions.

Private stdout/stderr storage is bounded to 131,072 bytes per stream and 262,144 aggregate. Captured bytes are hashed/stored without decoding or copying into public evidence. Prefix length, overflow, EOF, capture completeness, exit status, and owned-group absence remain separate metadata. Public evidence contains only the reviewed plan, finite source readback, command metadata, closed diagnostic, frozen source copies, and finite executor result. A child PASS with a nonzero command exit remains executor FAILED_HOLD through FIRST_REASON; process-group/EOF/capture/deadline failure likewise cannot be repaired by the child record. Persisted public PASS is not proof of actual successful driver return.

## Shared time and completion obligations

| Allocation | Prospective bound | Relationship |
| --- | ---: | --- |
| Whole Python driver | 60 s absolute | Starts at the early monotonic sample; final actual return must remain inside it. |
| Setup/preflight | 8 s | Within the same driver timeline. |
| Syntax command | 5 s total | Work 3, owned-group cleanup 1, bookkeeping reserve 1. |
| Diagnostic command | 35 s total | Node work allowance 30, owned-group cleanup 4, bookkeeping reserve 1. |
| Node diagnostic | 30 s absolute | Work through 24 s; shared cleanup at most 5 s, bounded by final end minus 0.5 s. |
| Post-command immutable readback | At most 7 s | Bounded again by primary absolute end at driver start +55 s. |
| Terminal conservative reserve | 5 s inside 60 s | Not an additional 5 seconds after 60. |

The nominal allocation 8+5+35+7+5 is nonadditive within 60 seconds; actual remaining time controls each admission. Guards surround synchronous reads/writes and enforce deadline/stop failure on return; synchronous OS filesystem work cannot be guaranteed to stop instantaneously. Executor `observedSeconds` and `conservativeActiveSeconds` are sampled before terminal copies/marker bookkeeping. They are respectively a preterminal observation and that observation plus a five-second reserve, not final observed driver duration. Terminal operations are checked against the absolute end; they are not a separately measured five-second stopwatch. Root must record the actual supported invocation interval and actual driver exit separately. Late/uncertain finalization stays held even if a persisted record was written earlier.

## Designed runtime families — all NOT_RUN

Only D01 and D02 are selected by the inert proposed plan. D03–D32 are prospective design families used to assess source obligations; they authorize no added commands or fault injection. A family may cover several input partitions without claiming that any partition was executed.

| ID | Selection | Design and required oracle |
| --- | --- | --- |
| D01 | Selected | Exact Node `--check` of the sealed diagnostic; actual zero exit, complete private capture, and owned-group absence are all required. NOT_RUN. |
| D02 | Selected | Natural original bootstrap only; record earliest phase/category and cleanup flags. Nominal strict original root observation is expected to hold as ROOT_CLEANUP/INVARIANT with false rootClosed. NOT_RUN. |
| D03 | Unselected | Correct-location false-GO/empty-pin plan: marker consumed once, work refused, no later Node admission. |
| D04 | Unselected | Wrong argv/cwd and existing/replaced marker: refuse at the relevant pre-marker or identity boundary; never reset/retry. |
| D05 | Unselected | True root gates, complete four-review union, exact plan, and Python `-I`: only reviewed inputs admit the same two commands. |
| D06 | Unselected | Changed pin bytes, size, or digest before/between/after commands: hold with no later admission or acceptance. |
| D07 | Unselected | Missing/extra host/product file, symlink or executable alias/peer drift: closed inventory/topology refuses. |
| D08 | Unselected | Persisted build PASS with missing/nonzero/mismatched actual build return: refuse; genuine pinned build is the eligible input. |
| D09 | Unselected | Existing namespace/result/capture/evidence, including dangling symlink: refuse without overwrite or deletion. |
| D10 | Unselected | Fresh mkdir, canonical path, UID, mode 700, or original inode failure: never write an unowned destination. |
| D11 | Unselected | Rejection/deadline at each of eleven original plugin phases: preserve the earliest token and already completed plugin count. |
| D12 | Unselected | Public state/UID and completed-count partitions -1/0/10/11/12/boolean: only real active plugins count and only integer 0–11 is schema-valid. |
| D13 | Unselected | Listener host/port boundaries: only actual loopback integer port 1–65535 excluding 3080; no dispatched HTTP request. |
| D14 | Unselected | Nonzero natural events or nonempty agent/session/tool/provider inventory/native session directory: latch invariant; no native work is accepted. |
| D15 | Unselected | Loader allSettled after failed import, absent entry/fiber: settlement alone does not establish readiness. |
| D16 | Unselected | Explicit raw Fiber.await rejection, deadline, or inactive state: ENTRY_START/ENTRY_STATE evidence remains distinct. |
| D17 | Unselected | Once remove, saved-fiber await, Loader settle, entry absence and UID/state: require joined observed removal; no second remove. |
| D18 | Unselected | Work failure after entry ID but before completed removal: original once-only cleanup shares the bounded cleanup window. |
| D19 | Unselected | Original root restart with UID 0 active: false rootClosed and FAILED_HOLD; no fake scope or restart-as-closure reinterpretation. |
| D20 | Unselected | Earlier work failure plus later removal/root/deadline failure: first phase/category remains authoritative. |
| D21 | Unselected | Earlier inventory-only failure followed by good removal inventory: later true zeroNative is allowed only with retained first failure and limited coverage meaning. |
| D22 | Unselected | Arbitrary caught error payload, hostile properties/messages/stacks: output remains own fixed category/phase only. |
| D23 | Unselected | Result length 0/511/512/513, nonfile, symlink, non-600 mode, FD/path replacement: accept only bounded owned regular data and valid closed schema. |
| D24 | Unselected | Extra/missing/duplicate keys, NaN/Infinity, wrong types, bad enums: strict JSON/schema refuses; boolean never substitutes for integer. |
| D25 | Unselected | PASS versus all partial FAILED_HOLD combinations: PASS requires COMPLETE/NONE/11/three true flags; schema validity alone is not acceptance. |
| D26 | Unselected | Per-stream 0/131071/131072/131073 and aggregate 262143/262144/262145 boundaries: storage cap, truncation/overflow, prefix hash, and hold remain distinct. |
| D27 | Unselected | Exit/EOF/capture/group decision table: every required clean observation is independently present; uncertainty cannot be replaced by the child result. |
| D28 | Unselected | Schema-valid child PASS with nonzero command exit: child may be selected but FIRST_REASON forces executor hold and actual return 1. |
| D29 | Unselected | SIGTERM/SIGINT and stop at admission/finalization boundaries: later observed admission/PASS refused; only owned fresh groups eligible for cleanup. |
| D30 | Unselected | Denied/unknown TERM/KILL/observation: stop signaling without retry, PID retarget, unrelated inspection, or cleanup-success claim. |
| D31 | Unselected | Nested 8/5/35/7 allocations and absolute 55/60 ends, including slow I/O/final writes: hold on observed overrun; actual final driver return and whole interval required. |
| D32 | Unselected | Capture/evidence/marker identity replacement, copy drift, finalization failure, and consumed-once state: preserve uncertainty, predecessor evidence, HOLD/CODE/UI boundaries. |

Runtime decision table: a validated child PASS plus zero command exits, complete captures, observed group absence, unchanged final sources, no stop/deadline/finalization failure, and actual driver exit zero could satisfy the executor's success predicate. Any nonzero command exit, incomplete/overflowed capture, unknown/present group, invalid/missing child result, source drift, stop, overrun, or uncertain finalization requires FAILED_HOLD. The strict original root observation makes natural nominal startup a source-supported failed diagnostic expectation; this table does not create a different root-success definition. A valid child FAILED_HOLD can still be useful bounded evidence, while the actual driver remains failed.

## Findings and residual limits

**Q01 — original root closure limitation, material but intentionally preserved.** Cordis root dispose restarts UID 0; the original terminal cleanup assertion is unsupported by that public root path. The immutable lifecycle clarification explicitly requires honest false/FAILED_HOLD. This is no blocker to the selected held diagnostic, and remains a blocker to claiming original cleanup/preparation success. Root-owned event teardown also prevents continuous final natural-event coverage. The source-supported expectation is not evidence of the original r3 failure location.

**N01 — minor comment/reporting discrepancy, nonblocking.** Executor lines 565–566 say a failed Node invocation can supply only FAILED_HOLD. Lines 570–573 instead select any fully schema-valid record when capture and group conditions permit, including child PASS after nonzero. FIRST_REASON and the final candidate predicate still force executor FAILED_HOLD. Report child diagnostic, command observations, actual driver result, and acceptance separately; do not quote that comment as an enforced child-result restriction. No stronger overall-success bypass was found. Changing this sealed source would require preserving r1 and reviewing a successor.

**N02 — minor observation meaning, nonblocking with explicit qualification.** Diagnostic lines 147–151 and 262 make zeroNative the latest completed covered inventory plus retained zero event-counter history. An earlier inventory-only failure can remain firstFailure while a later guard restores true. Do not describe true as “all historical guards passed,” continuous root cleanup observation, or post-root registry evidence. The held first failure remains authoritative.

**N03 — timing evidence limit, informational.** Executor lines 584–586 sample duration before terminal copies and marker completion. The stored scalar and added reserve do not prove final duration/return. Root must record supported-tool actual exit and whole observed invocation interval; the final absolute deadline guard is a separate source obligation.

No remaining material source-only test-design blocker was identified for the exact frozen held-diagnostic scope. Root still must read the final independent report pairs, resolve any separate source-review gate, select and pin the actual true-GO plan, obtain supported execution approval, and own any actual once-only invocation and its observed return. This report grants none of those gates. All selected runtime evidence and every fault family remain NOT_RUN; preparation, all87, CODE, and paused UI obligations remain open.

