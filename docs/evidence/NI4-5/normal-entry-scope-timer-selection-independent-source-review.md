# NI4/NI5 selection amendment independent affected source review

Disposition: **affected source review complete; SC-F01 and SC-F02 source-remediated only; NOT ADOPTED; NOT RUN**. No new affected blocking source finding was identified. All87 accepted0/HOLD and finalCODE BLOCKED_HOLD_NO_RETRY, browser HOLD and model-quality HOLD remain unchanged.

Reviewer: /root/ni4_scope_timer_review, independent English functional source review under root's max delegation. This reviewer did not author the amendment, inspect author tests/fixtures/oracles, execute product code or edit sources. Root retains composition, adoption, GO, Git and command authority. The prior [independent review](normal-entry-scope-timer-independent-source-review.md) remains unchanged and continues to describe its original frozen proposal.

## Exact affected source

The reviewed capsule is [.runtime/ni4-scope-timer-selection-amendment](../../../.runtime/ni4-scope-timer-selection-amendment), including its client-only literal selection-source.diff and complete47 before/proposed sources. Independent byte/hash/text verification confirms that before47 equals the actual prior proposed47, both manifests match every file, only client-entry.cjs changes, all46 other modules are byte-identical, and the entire client suffix beginning at async function control(kind) is unchanged. The literal diff independently reconstructs exactly. Source trees are read-only; the new manifest and proposal JSON are byte-identical.

| Pin | SHA256 |
| --- | --- |
| Before47 / original scope-timer proposal47 | 43ddcfd6e800053cb63f7a942d62821f0c0fd99aba02ecd1819c23a89fdd0280 |
| Amended complete47 | 2e3b5191bad8dbac9c5bc201a33dfa10684605199ba5cfb80ad6d29ed96dc70f |
| Original client | fd8be20df6400200579ecda4fcffca0fa4d793e146ba7a5788c325e40d7a5edc |
| Amended client | e9b5d17f50b61d0841917667b2f0bf26853e23e503325b89f16aa0fb10ca9e56 |
| Unchanged runtime | e88121edadcbb150ea1755587a90f66cf96d6484e1b57020d0edc6725cfc4701 |
| Exact selection literal diff | 6e8bc909c0f1b3a6b68c136df27f80b26d57366b988911be50413544971dc6bd |
| Amendment manifest / mirrored JSON | ba7da78c759a1f331d2c63acad1073cb0a18083458c6ecdd3dd4ac3308ff412c |

Prior review Markdown99113572 and JSONd3fa032a pins independently still match. Prior proposal manifest8a9107ea also matches. Closure digest uses compact sorted-key JSON source pins in filename order. [Review JSON](normal-entry-scope-timer-selection-independent-source-review.json) contains complete before/after pins and exact prior/amendment document hashes.

## SC-F01 disposition

**SOURCE_REMEDIATED_ONLY; runtime retest NOT_RUN.**

Amended select lines80–92 denies unavailable list generations and absent rows, then captures the genuine immutable listed row before selection/loading publication. The scope is not inferred from taskRef or fabricated from a status reply.

After status returns, lines97–100 require current list/detail generation and selection, recheck the actual current listed row, close the original nine-key returned task, and join its owner/workspace/taskRef to the captured genuine listed scope before any detail request. Lines106–112 repeat currentness/current-list joins around each detail await, then join the closed detail task to both captured list scope and returned status scope, retaining the selected status version/authEpoch and record checks. Lines115–118 repeat those fences before final task replacement/detail/record publication.

Status version/authEpoch can legitimately advance beyond the older list snapshot: the amendment compares scope to the list, while detail CAS joins the fresh status. Original full taskRecord output remains compatible.

Intake remains byte-identical. It can temporarily select an actual admitted taskRef before listing; unchanged intake's immediate refresh obtains genuine list rows and selects an actual matching/first row or null. A direct absent-row select still returns. No selected task is manufactured.

This closes the bounded source cause identified by SC-F01 on this amended freeze, without asserting an original server authorization test or runtime pass. BUB006-01 and BUB014-01/05 obligations remain NOT_RUN.

## SC-F02 disposition and source ordering

**SOURCE_REMEDIATED_ONLY; runtime retest NOT_RUN.**

Refresh lines59–64 advances list revision and detailRevision immediately and publishes loading/stale with old detail retained only for stale display. Thus an older status/detail read is invalidated when the newer list starts.

Only a successful current list read can reach lines67–75 and tag listedRevision. While a newer list is pending, select line81 rejects the older listed generation. A first genuine list sets the tag before auto-select, so this gate does not block the first select.

Selected fresh lists publish phase=ready with stale=true. The immediate select clears detail/records while phase remains ready and stale=true. No selected ready/non-stale state appears before the complete status/detail validation. A genuine empty list atomically clears selected/detail/records and publishes ready/non-stale in the same update, preserving valid no-task memory.

Selection current() line87 includes active lifetime, list/detail generations, successful-list generation and selected taskRef. It is checked after synchronous publication, after status/detail awaits, before further requests and before final publication. Its error handler line119 uses the same predicate. Superseded successes and errors therefore cannot restore readiness or paint a late error. Refresh success and error also use active/current list revision; an older empty-list reply cannot clear a newer selected task.

Original disconnect/dispose lines303–304 advance the relevant generations, abort reads and/or deactivate the model. Post-list publication line76 stops the older refresh continuation after a listener starts a newer refresh or chooses a different task. Same-task repeated selection request deduplication is not asserted; the reviewed guarantee is generation fencing and stale/readiness ordering.

These source fences address SC-F02's old-selection-during-new-refresh cause. BUB008-05, BUB014-01/03 and BUB006-02 runtime obligations remain NOT_RUN.

## UIa281 and unchanged scope/grant/timer composition

Root selected the interoperability sequence: retain old detail at refresh's loading/stale start, publish a fresh selected list as ready/stale, then let select clear detail while phase stays ready. The amendment follows that sequence without broadening any audit guard. It preserves the root-specified precondition for the separately reviewed a281 own-refresh guard's ready-phase transient-null handling.

This capsule does not compose that separate guard literal. Its combined retained mapping/execution behavior and ordinary external invalidation still require root's affected composition/source check and runtime lane. No audit/worker suffix edit or runtime proof is inferred from the sequencing review.

The full client suffix starting at control is byte-identical, including intake, worker/audit, authenticated feature/namespace pins, normal memory reply guards, nested local-delivery grant parser, UI controls and lifecycle. All46 other modules, including actual RuntimeStore, installed owner feature route and original ScheduleDriver forwarding/default omission, remain byte-identical. The earlier source-supported conclusions are preserved; native grants, installed timer/default integration and global runtime regression remain NOT_RUN.

## Affected obligations

Every application/execution result remains NOT_RUN; the a281 composition is additionally NOT_COMPOSED here.

| Obligation | Required affected evidence | Retained criteria |
| --- | --- | --- |
| SC-O04 | Genuine list scope versus equal-taskRef foreign status/detail; empty/nonempty data; current-list rejoin; absent-row denial; actual intake | BUB006-01; BUB014-01/05 |
| SC-O05 | Old status/detail success/error during newer refresh; select during pending list; overlapping list success/error/empty; latest different selection; disconnect/dispose; no readiness gap | BUB008-05; BUB014-01/03; BUB006-02 |
| SC-O07 | Actual nine-key taskRecord; first selection/intake; status version/auth advancement; detail CAS; global worker/audit/normal compatibility | BUB003-02; BUB006-01; BUB014-01/03 |
| SC-COMP-A281 | Literal a281 composition; retained audit mapping/execution across own refresh; ordinary external invalidation; unchanged guard bounds | BUB014-01/03; BUB016-01 |
| SC-SCOPE-REGRESSION | Authentic owner/namespace pin; no-task/disappearance memory; scoped post-await parent admission; nested original grant; original timer/default path | BUB006-01/02; BUB007-03; BUB008-04; BUB009-03; BUB013-02; BUB016-01 |

The original [owner/task](../../tickets/BUB006.md), [memory](../../tickets/BUB007B.md), [context](../../tickets/BUB008.md), [events](../../tickets/BUB009.md), [results](../../tickets/BUB013.md), [UI](../../tickets/BUB014.md), [aggregate](../../tickets/BUB016.md) and [acceptance debt](../acceptance-debt.md) contracts retain their meaning. No source criterion or final gate is newly accepted.

## Execution, preservation and limits

Only this new review's named Markdown and JSON files were written. Prior47 source/proposal and prior independent review pins, new frozen amendment47, shared source, QAa58c522, archivefa3fb398, profile .runtime/ui-qa-a58c522, listener3080 and existing NI4/NI5/NI3/UI/core7 assets were not changed. Protected profile/package/archive contents were not inspected.

No product execution, JS parse/import/test/build, author test/fixture/oracle body or test-directory/archive read, DB, native/model/provider/inference, timer/listener/profile/browser, network/credentials, Git, source edit/adoption or blocked final CODE experiment occurred. Python only verified source bytes/hashes/text diff/JSON metadata and constructed evidence.

This is an affected symbolic source verdict on exact amended pins. Root must independently compose approved literals and obtain separate design/application/execution evidence. All87 accepted0/HOLD, finalCODE BLOCKED_HOLD_NO_RETRY, browser HOLD and model-quality HOLD remain unchanged.
