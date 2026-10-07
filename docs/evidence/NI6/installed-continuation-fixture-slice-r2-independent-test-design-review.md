# Final affected r2 test-design and oracle review

Date: 2026-10-07 UTC. Reviewer: /root/ni5_lifetime_independent_design, gpt-6.1-sol max, English. Status: SOURCE_ONLY_AFFECTED_REVIEW_SEALED_PURE_VALIDATION_NOT_RUN. Exact r2 manifest: c2ea5a0ffe0d046626297a84817eaa3ae87a19d1203c15a37d98e76057affb58,19964 bytes. Literal: 8ec19635ebea93f324f1d20138b161a67a5f942218ccfa4cdc1195cc8fd048ce. All11 owned-file pins and5 distinct relative-import targets match; the source text delta is exactly +151/-15 across two helpers and one new93-line test.

There are no new test-design blockers to root's proposed finite syntax/pure-test scope. The13 descriptor cases and12 event-window cases are meaningful affected coverage for F01/TD-R1-01 and F02/TD-R1-02. F03/TD-R1-03 has an inspected source guard; original observer lifecycle/runtime proof remains IH03/HOLD. This is source acceptance for a bounded oracle development unit. No pure test, syntax check, genuine donor/native/cold/transport/UI result or final product criterion is passed by this review.

## Scope, independence and completed work

The review read only final r2 helpers, the pure test and its declared bounds/prerequisites/status/README/manifest, and compared the affected text with the exact immutable r1 unit and independent r1 findings/public-contract expectations. Author assertions were review subjects rather than new expectation sources. The final public-instance fixture is byte-identical to r1. No application implementation body, new native setup, authority, harness, fake Context or protected final CODE investigation was inspected or constructed. Archival draft receipts were hash-only and did not supply a verdict.

Performed work was text inspection, evidence JSON parsing, lexical case/import counting, text delta counting and SHA256 checks. No JavaScript parser/import/evaluation/test/build, application/runtime/DB/native/model/browser/network/service/profile/listener/Git action occurred. Only the two new review evidence files were written. Root's separate source review and final execution decision remain required. r1 reports stay immutable findings against r1; this report is the new affected r2 disposition.

## Three r1 findings in r2

| Finding | Affected source and review disposition | Functional limits |
| --- | --- | --- |
| F01 / TD-R1-01 | `keys` uses Reflect.ownKeys, requires string-key membership/required fields and ordinary enumerable data descriptors with no get/set keys. It reads descriptors before values. The13 cases exercise positive/frozen DTOs and the omitted-key/hidden-key/accessor/plain-object partitions. SOURCE CHANGE AND TEST DESIGN ADEQUATE. | Execution0. This helper checks structural keys/descriptors; existing unasserted TaskStatus/PreparedCheck/source/value domains remain CG01. |
| F02 / TD-R1-02 | `resumeEventWindow` validates exact prefix copies and isolates the selected suffix. One new matching session announcement must precede one matching source=resume agent publication inside the pre-execute prefix; streams are0 before that prefix and1 afterward. `assertSameIdResumeObservation` uses this helper. The12 cases cover a donor-inclusive positive and stale/late/premature/extra/identity/prefix/source failures. SOURCE CHANGE AND TEST DESIGN ADEQUATE. | Array consistency is data evidence. Root must capture genuine pre-resume and post-publication/pre-execute prefixes from the same live original observer at the actual boundaries; synthetic arrays do not prove native origin, currentness or timing. |
| F03 / TD-R1-03 | Original observer counts now asserts active before returning; the same-ID live helper calls trace.counts before using historical rows, and noNativeDelta continues to obtain live counts. Events/requests retained after close are explicitly historical. SOURCE CONDITION ADDRESSED. | The pure test imports no observer/Context and supplies no lifecycle runtime test. Actual registration/disposal/liveness across an operation remains IH03/HOLD; no fake Context/shape cast supplies proof. |

The public observer still uses original Context.on and forwards the original llm/stream waterfall; no events/callbacks are manually emitted/invoked. A live counter is useful only when its observer is actually attached to the root-frozen genuine original context through the selected boundary. Prototype, metadata, prefix and callback-count shapes do not establish admitted host authority. This prerequisite remains explicit in r2.

## Twenty-five affected pure cases

Every case is SOURCE_REVIEWED_NOT_RUN. Cases use ordinary labelled synthetic data, not a native subject. Rejections specifically require assert.AssertionError; an unrelated TypeError does not satisfy them. Accessor cases additionally require the counters remain0, so a helper that invokes an accessor before rejecting would fail. Positive plain/frozen DTOs prevent overrestricting original immutable results. Event negatives preserve otherwise well-formed rows/prefixes where possible so the chosen defect controls rejection.

| Review ID / test line | Partition and intended observation | Why it covers the affected oracle |
| --- | --- | --- |
| D01 /8 | Ordinary required-only and required+optional data fields accepted | Exercises both legitimate optional-field partitions. |
| D02 /12 | Frozen ordinary DTO accepted | Ordinary readonly data descriptors remain supported. |
| D03 /15 | Required key absent rejected | Preserves required-field check. |
| D04 /16 | Extra enumerable key rejected | Preserves exact allowed-key domain. |
| D05 /17 | Extra nonenumerable key rejected | Directly catches Object.keys omission defect. |
| D06 /20 | Own symbol key rejected | Directly catches symbol omission defect. |
| D07 /23 | Getter rejected with reads0 | Requires descriptor rejection without invoking data access. |
| D08 /28 | Setter-only rejected with writes0 | Directly catches old get===undefined allowance. |
| D09 /33 | Combined accessor rejected with reads0/writes0 | Keeps both accessor directions excluded without invocation. |
| D10 /38 | Nonplain inherited prototype rejected | Preserves original plain-object requirement. |
| D11 /39 | Null prototype rejected | Does not broaden the accepted DTO domain. |
| D12 /40 | Null rejected as AssertionError | New early object guard yields intentional refusal. |
| D13 /41 | Array carrying required field rejected | Shape resemblance does not satisfy plain DTO. |
| E01 /57 | Donor-inclusive rows with2 total streams but1 successor accepted | Establishes correct current-window count, preserving genuine historical prefix. |
| E02 /61 | Old donor announcement and new resume without new announcement rejected | Old announcement cannot satisfy selected resume. |
| E03 /64 | New announcement after resumed agent publication rejected | Well-formed IDs/source do not replace ordering. |
| E04 /67 | One stream before pre-execute snapshot plus one afterward rejected | The after-stream count alone cannot establish idle0. |
| E05 /70 | Two successor streams rejected | Enforces explicit successor1. |
| E06 /73 | Pre-resume copy changed while final rows unchanged rejected | Requires exact genuine retained prefix equality. |
| E07 /76 | Pre-execute copy changed while final rows unchanged rejected | Requires exact post-publication prefix equality. |
| E08 /79 | Reversed snapshot order rejected | Both exact prefixes are insufficient without temporal window order. |
| E09 /82 | New session announcement has wrong session ID rejected | Current announced session must match selected predecessor. |
| E10 /85 | Resumed agent has wrong agent ID rejected | Current publication must match selected predecessor. |
| E11 /88 | Pre-execute snapshot taken before agent publication rejected | Publication must lie inside the idle/pre-execute prefix. |
| E12 /91 | Successor source startup rather than resume rejected | Same IDs are insufficient to prove the chosen resume observation. |

The25 cases are25 distinct top-level tests:13 descriptor and12 window. All synthetic histories are finite (the largest declared scenario has9 rows), far below the observer's32-row bound, with one selected synthetic current successor and at most2 current stream markers in a negative. No retry, elapsed-time loop, external input, process or authority setup is present. The test's93 lines import only node:test, node:assert/strict and ./public-oracles.mjs; that pure helper imports only node:assert/strict. Original Context/Cordis/WorkerManager/RuntimeStore/MemoryAdapter are outside the executed pure-test import closure.

The cases address the selected defects; they do not claim exhaustive value/schema/lifecycle coverage. Source explicitly guards additional adjacent cases such as list overflow, missing/duplicate announcement/publication, no successor stream and publication session ID; those branches are not all separately tested in this25-case unit. This does not create a blocker for the affected scope and does not promote them as functional passes. Native origin and F03 runtime behavior remain outside the pure suite.

## Preserved partial fixture scope and bounds

The unchanged direct-instance fixture SHA256 is89bd223f637d3c3fa729e1146ab2fbea1dc75aa7972171d0a028319f3a2b67b3 (12726 bytes). Its exact pending selection remains40 reads +2 prepare +4 record +1 cancel =47 direct calls, with4 expected refusals. Those caps exclude transitive/setup/donor/cleanup effects. One held-audit invocation is selected; invoking both review/repair roles adds6 reads. The unselected committed cold branch adds1 read and belongs to separate IC-C04 scope.

Mapped coverage remains0COMPLETE /8PARTIAL /2HELD_OBSERVATION_ONLY over10 substeps. The pure regressions add no native design cell or donor. Standalone functional host/native runnable cells remain0. IH01 complete original signed-plan provenance, IH02 missing-role/revoke facts, IH03 admitted original setup/full observations, and IH05 actual A exit/all-fresh B/cold/package/UI scope stay held. Actual original donor/capture/current task/Q, released own cancellation donor and genuine held-role writer remain prerequisites, not supplied subjects.

CG01 retains full task/check/source/value-domain and ordered-provenance gaps; CG02 retains missing pre-first-intent index baseline and unobserved commit counts; CG03 retains incomplete claim/reservation/grant/stop/capture/settlement/history/usage conservation; CG04 retains disjunctive held-role read, missing resumed-denial boundary and insufficient different-PID cold proof. Q05's positive intent prefix cannot be relabelled as Q08 zero-new-intent scope. No extra read, task attempt, donor, fake handle, new runtime, policy expansion or whole historical rerun is authorized by the helper fixes.

## Root's finite validation scope and current transport state

This review finds no affected test-design blocker to the already proposed root-only scope: once each Node --check on public-instance-fixtures.mjs, original-observers.mjs, public-oracles.mjs and fixture-oracles.test.mjs, then once the25-case Node --test of fixture-oracles.test.mjs. Node --check establishes syntax only and does not import the native modules; the pure test executes only its labelled data/oracle closure. Root must also receive the separate final affected source review and use the exact pinned files before issuing its decision. No native/authority setup, original observer import/runtime test or broader application execution is admitted by this review.

Root reported three readonly exec_command requests rejected at CreateProcess with “exec-server transport disconnected”; processes were not created. Root cannot freshly read final reports, run these five commands or commit while that connection is unavailable. All four syntax checks, the25 pure cases and commit are NOT_RUN; they were not delegated elsewhere. This independent lane's authorized source metadata checks/evidence writes succeeded, and it ran none of root's commands or service/reconnection actions. Any actual transport failure in this lane would stop its attempts without alternate-route execution or invented seal.

All87 accepted0/HOLD, permanent protected final CODE, installation/native/cold/transport/browser/model-quality and release/publication holds remain unchanged. Source/oracle review acceptance is separate from future successful pure evidence and all original runtime/acceptance criteria.

## Exact seals and conservation

| Item | SHA256 |
| --- | --- |
| r2 source-manifest.json | c2ea5a0ffe0d046626297a84817eaa3ae87a19d1203c15a37d98e76057affb58 |
| r2 literal-r1-to-r2.patch | 8ec19635ebea93f324f1d20138b161a67a5f942218ccfa4cdc1195cc8fd048ce |
| r2 public-oracles.mjs | 8ec97df4c4646e935716f8a9abfe666dbb9c22e2291c8197e4037f47c7551198 |
| r2 original-observers.mjs | d265c26d01a97e489ebaab084e0641ce697c1521e40cadb9d119a9a31afff320 |
| r2 fixture-oracles.test.mjs | 00e2f0549c1c4765a5d4d0ba1f3a69bd535021e5e7f21423edb0317c7792a67e |
| unchanged public-instance-fixtures.mjs | 89bd223f637d3c3fa729e1146ab2fbea1dc75aa7972171d0a028319f3a2b67b3 |
| immutable r1 manifest | 581625ffd92367839c8a35f2bdb10dfae6e2131173f2a3bb3d7b3480f9eb0e62 |
| immutable r1 test-design review MD | b0dbdfcaecf6e6839cf5d821b5b13c10795d9cc37273ce9e519aabcb613b0a2a |
| immutable r1 test-design review JSON | 72578a2ec66eea615f2027a0ff8c2b5bf23b1fdd3cd80bb4dbcf56fe34006d89 |

The JSON records all11 owned-file pins, five direct relative-target checks, original independent design/public expectation pins and finite coverage/validation disposition. The inherited full host graph and broad historical input list were not freshly reviewed/rehashed. Only the current narrowly selected source/evidence checks are completed.

Evidence-only seal validation: own JSON syntax is valid, all25 review case IDs are unique and match this Markdown grid order, all11 owned pins,8 basis/conserved pins and5 relative-target pins match with0 mismatches. Source text delta/count/import checks match the declared finite scope. Syntax checks/pure tests/application evaluation remain0; root final decision and runtime evidence remain pending.
