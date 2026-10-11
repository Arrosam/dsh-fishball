# NI6 independent owner finish capture-order r1 SOURCE review

The exact r1 source amendment supports the bounded source remediation for **OI-F01**. New intent admission now requires an already committed authentic output capture; a caller cannot use the previous first-intent-before-first-output-capture sequence on a new command. The amendment preserves the original exact-Q history paths, original current CAS, and the original optional-role held branch. **No new literal/core source blocker was identified.**

This is **SOURCE_REMEDIATION_SUPPORTED_ONLY; functional HOLD**. The original OI-F01 HIGH finding remains **FUNCTIONAL_OPEN**, and the initial proposal's independent report is unchanged. No functional PASS, adoption, command GO, accepted criterion or release is established. All **87 criteria remain accepted 0/HOLD**; **finalCODE=BLOCKED_UNCHANGED**. Root alone controls disposition, execution, source adoption and Git.

Reviewer: `/root/ni6_owner_capture_order_review`; independent ordinary source reviewer; English; 2026-10-07. The author and reviewer are separate. The current [AGENTS](../../../AGENTS.md), [October 7 owner amendment](../../owner-amendment-2026-10-07-ollama.md), [owner scope amendment](../../owner-amendment-2026-10-04.md) and [development workflow](../../development-workflow.md) were read. The [prior independent OI-F01 review](schema7-core-independent-owner-finish-intent-source-review.md) was read only as ordinary public product-source review evidence. The blocked receipt/envelope/cipher/SQL investigation was not accessed, retried, rerouted or reopened.

## Exact reviewed source and preservation

Subject: `.runtime/ni6-owner-finish-intent-capture-order-r1/`, including the README, complete required diff, full added helper and affected surrounding methods, capture-order refinement, complete amended protocol, before/after metadata, import closure, effects, source windows and both manifests. The [machine report](schema7-owner-finish-capture-order-r1-independent-source-review.json) records independently computed pins for all 57 entries, all 32 preserved original entries and history pairs, before/after modules, the original r2 source/provenance entries and the limited runtime coupling sources.

| Artifact | Independently verified SHA256 |
| --- | --- |
| Exact57 freeze digest | `5aa3fd6009b533ac7f85b28277de8d7db26491736021fb2d5a2fa761b3994a88` |
| source-manifest.json | `28009f53ee74defc4dfc91f348d253db74431a464678315cb78fb50816274e6f` |
| Before runtime-store.mjs | `cfc30b5bec526606f6b4075145f8b77e7701aafd2577d251c594640f7b51db28` |
| Proposed runtime-store.mjs | `4fb893614b30d22c5ad5b904aa585605bc74a2e2a38aa05cbaea38aeb52a23c7` |
| Actual required.diff | `53cbdd8183333fee2191c7be3706e3ddf8626fcf4434b93dfcb699c4b3b0813d` |
| Complete amended protocol | `06a91ea6dcb8f22ec6a43a5730f1f6681f31484a5562adc70ed5c553dff3c97d` |
| Capture-order refinement | `6ff5f4295ae126a5d6e5a7ac832096ebbe48cee473ec64d00c358719c740b267` |
| preservation-manifest.json | `a58467900f239b8212f8d8d3566326ecee86ee61628a57569652a547b1780099` |
| before-after.json | `2fdade229bbe59b8637cda1c55d560c49ab687c33aca726feb0f261d08ee1d3e` |
| import-closure.json | `be39d5ac65a9df48bc6594f6eef0aab4bcdbc2142379f23a80ddf2bdb595e6e9` |
| effects.json | `cbbbe440c3885347504e6d8fd82ceabea331537c1c37d588c69b3e47ef3f0dfc` |
| source-windows.json | `29ce7cc472f218d4fa33efd9cddea9203801300558a970c94a65534d22027347` |

All 57 declared sizes and SHA256 values match. All declared paths are unique, and there are no undeclared files in the capsule apart from its excluded source manifest. Hashing the manifest's **stored file-list order** with `json.dumps(files,sort_keys=True,separators=(',',':'))` reproduces its exact freeze pin. The list follows path-component ordering, rather than lexical sorting of complete path strings; independently resorting strings is not part of that pinned recipe.

A Python stdlib unified diff rebuilt directly from all seven legitimate before/after modules is byte-identical to `required.diff`. Only `runtime-store.mjs` changes, adding the readonly helper and its first-admission call. The six sibling modules are byte-identical; the inherited exact Q parser and digest remain unchanged.

The original32 freeze `70fe5c97133429cbe4cca2bffd9494d05189e32cc98f1682047307860ce91d6e` is independently reproduced. All 32 original entries still match their old pins, and all 32 copied history entries are byte-identical to their originals. The original manifest and author evidence also match their history copies. Their SHA256 values are respectively `86404ee955af4372aa6c1551c9ae7d77537338ca31948c1243c433efd8357889` and `29cd54956c8381459fdeea3571442e9f413c633c3dbdb9fe154400a0e9cfd334`.

The original r2 manifest remains `48973af274fab3c82ef4edce1a0129ece321b6ffc2daa46319b3e0e48cd931d0`, and its declared28 freeze recipe still produces `72927f81a3d08f5c9888a742c1d74b491a87da3605884c2b338174a427dfd91a`. All 24 non-test original r2 source/provenance entries were independently hashed and remain unchanged. The four original test bodies were not read, decoded, printed, reviewed or executed in this review; their bytes were not rehashed here. This report therefore claims current independent preservation of the 24 source/provenance entries, not a new all28 test-file verification.

The prior independent review files remain pinned as observed: Markdown `83350299c687a46379a5c2e1a1e07ed451553eaf8ce803cc49f5f84448392f4d`; JSON `aede98c0b8e84a963f1aa15b9eb300c8e1e84836404e011b77c06c437955c2d7`. This reviewer did not change them.

## OI-F01 before and after

In the initial source, first `recordOwnerNativeFinishIntent(Q)` admitted Q at task version V without requiring a durable output capture. First producer capture or repair artifact write then called original `#artifactEffect` at line1112 and `#update` at lines228–233, incrementing task version. The original final finish CAS consequently refused the same immutable Q. The initial HIGH finding remains true for that initial freeze.

The amended [protocol](../../../.runtime/ni6-owner-finish-intent-capture-order-r1/contracts/amended-owner-command-core-protocol.d.ts.txt) lines75–110 requires separate output capture and any chosen report/repair-artifact effects before constructing new Q. It retains actual task refresh by the caller after those effects; neither core nor runtime predicts a future version or changes a persisted Q.

The amended [store](../../../.runtime/ni6-owner-finish-intent-capture-order-r1/proposed/src/runtime-store.mjs) lines3190–3225 enforces the required output-capture prerequisite during new intent admission:

1. Original current task/auth CAS, unfinished claim, authentic owner/action/worker/execution identity, marked create/resume graph and reservation admission remain at3191–3198. The helper receives the actual action, execution and original claim graph.
2. The exact original output capture ID is derived from actual owner/workspace and Q's task/claim/execution tuple. The original native record and exactly one supported committed command are required. The command operation is producer `captureNormalNativeResult` or audit `captureNormalNativeAuditResult`, with matching command task, phase `output`, task/action/actionDigest/claim/generation/execution/purpose/origin.
3. Original `#validateCapture` at3163–3167 authenticates the unchanged result/artifact/history/context/resume/native graph inverse. `#nativeCommand` at3110 obtains the supported command through original command receipt validation and refuses nonunique associations. The new helper reads and validates these facts; it performs no capture or task update.
4. The original new intent transaction then persists exact Q. The final writer still requires that same authentic Q and performs original CAS. With the prescribed capture-before-Q sequence, the capture's version increment is already included in Q's actual V, so it cannot be the later first-capture increment that caused OI-F01.

This is a bounded source remediation. It does not guarantee eventual finish under a later competing writer, unknown stop, task/auth drift, storage failure or quota exhaustion. A repair artifact written after Q can still advance task version and correctly make that Q stale. The protocol prohibits that ordering for a chosen finish sequence; the new helper does not freeze future original writers or grant a refreshed-Q retry.

## Optional role evidence and original settlement

Present audit-review evidence is checked only when the actual execution has `reportRef`. Original `#roleFinished` at3170 binds the report to the exact capture result and claim; original `#validateNativeReport` at2927–2945 checks the captured native response, input/material/binding, report fields, exact original execution association, review record and artifact.

For audit repair, the helper finds original `repair_artifact` captures that reference this exact output. More than one refuses. A present capture must have a genuine unique `writeNormalNativeRepairArtifact` command and exact task/action/digest/claim/generation/execution/purpose joins; original `#validateCapture` checks artifact/result/target/output inverses, and `#roleFinished` checks the output association. These are existing readonly validators.

When an optional report or repair artifact is absent, the new helper does not invent it and does not require role completion. The original final writer at3171 still computes `roleComplete`, catches only original `AUDIT_RESULT_REQUIRED`, and passes false to original settlement when that evidence is absent. The original release calculation at927–956 and strict `releaseEvidenceRef` equality at3169 are byte-unchanged. This preserves the source branch; it is **not** functional proof that a held finish commits, serializes or restores correctly. The withdrawn F03 change is not adopted or reopened.

## Preserved history, authority and storage boundaries

The diff does not change record/read/list inputs, the eight-field Q parser, original finish digest, encrypted Q body, refs-only signed intent result, hard16 limit, wire/data/metadata caps, capacity equation or current claim/reservation checks.

`recordOwnerNativeFinishIntent` at3307–3315 performs command-specific exact-Q historical lookup and authentic same-Q intent projection before entering a new transaction. `#mut` at255–269 returns an existing private intent before terminal classification. The new helper is reached only by first-admission `#ownerFinishActive`, including its typed terminal classifier at355–359; it is not called from readonly intent decoding, read/list, historical finish lookup or cold restoration. Those historical paths do not acquire a fresh current CAS/capture/reservation requirement.

Typed intent inverse decoding at3226–3239 still checks immutable stored Q and actual original identity without current CAS. Read/list at3335–3349 retain original owner handles, task scope and guarded readonly queries. Pending Q after another command finishes the claim stays pending; legacy history stays null-Q without backfill. The original claim-wide missing-command finish guard is unchanged.

The amendment does not add owner/native capabilities, imports, durable tables, private kinds, data encryption, schema migration, receipt rewriting, origin assertions or replay authority. It does not weaken source/profile/backend/lifetime ownership or grant native/model/tool permission. Exact producer, review and repair capture methods remain the original public writers. Original global `count+2+12*held+maxControlCommands <= maxCommands`, complete wrapper checks, encrypted-data limits and original transaction rollback structure are preserved by byte comparison. Admission headroom remains distinct from durable future capacity allocation.

All seven lexical import lists and their 28 edges match `import-closure.json`; every relative dependency pin matches, only node built-ins are external, and lexical dynamic-import counts are zero. The inherited context/store cycle and genuine private-brand/descriptors remain unexecuted. The helper adds no top-level call and invokes no native/source/model/permission callback. Existing database queries were inspected as source text only.

## Limited runtime coupling and remaining obligations

The separate `.runtime/ni6-runtime-composition-r2/src/runtime-store.mjs` still matches prior `cfc30b5bec526606f6b4075145f8b77e7701aafd2577d251c594640f7b51db28`. This is the expected pending dependency state. No patched runtime, build or runtime functional PASS is demanded by this source review.

The limited source comparison confirms the intended coupling: `normal-native-operations.mjs`70–75 implements separate explicit capture;77–102 rereads genuine capture and present role projections before first intent. `owner-native-command-controls.mjs`19–27 returns original historical finish first, then checks readiness and persists intent before normal finish. `normal-native-operations.mjs`112–124 repeats history/readiness, requests original owned stop, observes a factual stopped worker and invokes the original final native writer with unchanged Q. There is no first durable capture/report/artifact write in that finish path.

The prospective readonly history/usage reobservation obligation in the amended literal162–171 remains **HOLD**. In the currently inspected r2 `NativeAdapter.finishExecution`366–375, usage comes from the cached pre-stop `validatedResult`; after awaiting disposal it is returned without a new collector or usage observation. The narrow core amendment neither implements nor proves this separate integration obligation. Final runtime source disposition must explicitly bind the authorized observation order and exact original source/profile/backend/lifetime guards; functional validation must establish actual currentness and accounting. This is an integration hold, not a newly identified defect in the r1 core helper.

| Affected obligation | Source disposition | Functional disposition |
| --- | --- | --- |
| Required genuine committed output capture before first intent | Remediation supported at exact4fb store | NOT_RUN/HOLD |
| Present review report / unique repair artifact inverse | Source supported; optional absence preserved | NOT_RUN/HOLD |
| Exact-Q historical finish/intent before fresh current admission | Byte-unchanged history behavior supported | NOT_RUN/HOLD |
| Original Q/owner/claim/origin/CAS/quotas/encryption/ref-only journal | Preserved by exact diff and affected reads | NOT_RUN/HOLD |
| Source/runtime ordering, genuine brands and installed descriptors | Limited coupling observed; coherent dependency pending | NOT_RUN/HOLD |
| Exact57/original32/history/import/diff provenance | Independent filesystem/lexical verification complete | JS parse/import/execution NOT_RUN |

The retained OI-S03/S06/S07/S08 implications and BUB/DF003,004,006,012,016 acceptance mappings remain open. Necessary later evidence includes genuine producer and audit capture-before-Q; chosen report/artifact-before-Q; absent-role held output; readonly same-Q history after task/auth/recovery drift; changed-Q denial; stopped-versus-unknown behavior; post-intent source/history/usage currentness; no effects after failed intent; original rollback and lost-reply/cold persistence; hard15/16/17 and quota/control/terminal boundaries; complete original encrypted/sealed/public transport byte limits; coherent prospective old/future compatibility; and the separate independent ISTQB review/results. All require a separately bounded root GO and supported authentic public carriers.

## Execution boundary and seal

Performed: ordinary source/contract/evidence reads; `rg` file and symbol search; line-window reads; Python stdlib manifest decoding, SHA256, source byte comparison, unified diff reconstruction and lexical import inventory. A harmless multi-file `nl` read was rejected by the macOS utility syntax and corrected to independent one-file reads; no product command was involved.

Not performed: tests or test-body review, JavaScript parsing/import/execution, build, database open/access, SQL operations, encrypted row/receipt/envelope negative carrier, migration, model inference, network, host/browser/profile/listener/service operation, timer execution, package installation, shared source changes, capsule changes, Git or subdelegation. Protected package QAa58c522, archive fa3fb398, `.runtime/ui-qa-a58c522`, listener3080, locked/unsupported browser state and all personal profiles/data/keys remain untouched.

Only this new Markdown evidence and its new JSON companion are authored by this reviewer. **All87=HOLD; accepted=0; finalCODE=BLOCKED_UNCHANGED.** Root adoption and separately authorized functional proof remain outstanding. The initial review remains immutable and its OI-F01 finding is not retroactively closed.
