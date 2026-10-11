# NI4/NI5 scope and timer selection SOURCE amendment2

Disposition: **FROZEN SOURCE AMENDMENT; NOT ADOPTED; NOT RUN**. This implements a bounded proposed correction for SC-F01/SC-F02 from the [independent source review](normal-entry-scope-timer-independent-source-review.md). Root requires fresh independent affected source review before fixtures or GO. All87 accepted0/HOLD and finalCODE BLOCKED_HOLD_NO_RETRY/browser HOLD/model-quality HOLD remain unchanged.

The new capsule is `.runtime/ni4-scope-timer-selection-amendment/`. Its complete47 `before/src` is byte-identical to the prior frozen `.runtime/ni4-scope-timer-proposal/src`. Complete47 `src` changes only `client-entry.cjs`. Both source trees are read-only. Runtime `e88121edadcbb150ea1755587a90f66cf96d6484e1b57020d0edc6725cfc4701` remains exact; prior client `fd8be20df6400200579ecda4fcffca0fa4d793e146ba7a5788c325e40d7a5edc` and prior47 closure `43ddcfd6e800053cb63f7a942d62821f0c0fd99aba02ecd1819c23a89fdd0280` remain preserved in the old capsule and new complete before source.

| Frozen deliverable | Pin |
| --- | --- |
| Amended complete47 closure | `2e3b5191bad8dbac9c5bc201a33dfa10684605199ba5cfb80ad6d29ed96dc70f` |
| Amended client | `e9b5d17f50b61d0841917667b2f0bf26853e23e503325b89f16aa0fb10ca9e56` |
| `.runtime/ni4-scope-timer-selection-amendment/selection-source.diff` | `6e8bc909c0f1b3a6b68c136df27f80b26d57366b988911be50413544971dc6bd` |

The closure method is unchanged: SHA256 of compact sorted-key JSON source pins in filename order. [JSON evidence](normal-entry-scope-timer-selection-amendment.json), mirrored as the capsule's `source-freeze.json`, records every before/after source pin, actual inherited import edges, review-document pins, source causes, effects, composition impact and affected must-test obligations. No JavaScript was parsed or executed to generate it.

## SC-F01 proposed correction

Original selected taskRef membership did not anchor status owner/workspace. Original taskRef is `reference(taskId)`; owner/workspace remain independent database scope keys. A closed consistently foreign status/detail could therefore replace the genuine list row while preserving the same taskRef.

`select` now captures the actual existing immutable listed row before publishing selected/loading state. An absent row returns immediately. The returned raw status task still uses the existing exact nine-key `workerTask` parser; owner/workspace/taskRef must match that genuine listed row before any detail request. Every returned detail task joins both the captured listed scope and selected status scope, retaining exact status version/authEpoch and record checks. The current genuine list row's owner/workspace is rechecked before the request, after status/detail awaits, and before final row replacement/detail publication.

No first response establishes owner identity, no list row is invented, and same taskRef grants no scope equivalence. The genuine authenticated server/store route is unchanged. Status version/authEpoch may advance from the older list snapshot; scope joining deliberately does not require equality to old list version/authEpoch. Detail CAS still joins the fresh selected status. Source runtime proof: **NOT_RUN**.

Original intake remains byte-identical: it can temporarily select the admitted taskRef, then refresh supplies the genuine new list and selects an actual row or clears to null. Direct selection cannot substitute the intake reply for a list row.

## SC-F02 proposed correction and publication ordering

Refresh now increments both list revision and detailRevision at its start. Older pending status/detail lifetimes are invalidated immediately. A private listedRevision tags only a successfully received current list. `select` requires listedRevision equal the current list generation; an explicit selection while a newer list is pending returns without reopening readiness.

Selection captures list and detail generations, active lifetime and selected taskRef. It repeats those conditions after status/detail awaits and before each further detail request, final publication and error publication. Old successful or malformed replies cannot repaint ready or error after a newer refresh/selection/disconnect. A fresh list read also checks its generation before validation/publication and after synchronous publication, so a listener-started newer refresh or selection is not overridden by the older continuation.

A refresh's loading/stale publication retains prior detail solely as stale display. When a fresh selected list arrives, phase is ready but stale remains true until the selected status/details validate. The existing select immediately clears detail/records while that phase is ready. There is no fresh-list selected ready/nonstale publication before validation. A genuine empty list clears selected/detail/records atomically to ready/nonstale; this retains the valid no-task memory path. Failed lists stay stale and do not authorize selecting from an older list generation.

The normal featureScope implementation is exact and unchanged: loading/stale/offline parent state denies memory/local scoped admission. The new parent lifetime makes that existing guard meaningful throughout the refresh race. Runtime ordering proof: **NOT_RUN**.

## Reviewed UIa281 composition impact

Root identified that the separately reviewed UIa281 audit own-refresh guard skips its own transient null detail only when phase is ready. Clearing detail at loading would discard retained audit mapping/execution during its own refresh. This amendment therefore retains old detail at loading/stale refresh start, publishes the fresh selected list ready/stale, then uses the original select's ready-phase null clearing. That preserves the guard's reviewed phase/null-detail sequence while stale still fences normal admission.

No audit guard is broadened and no audit/worker source is changed. A byte comparison confirmed the entire client suffix starting at `async function control(kind)` is unchanged from the prior frozen client, which includes intake, all worker/audit code, authenticated feature/namespace pins, nested grant parser, normal/UI controls and lifecycle. All46 other modules, including the genuine original store, host binding, installed features and trusted original ScheduleDriver forwarding, are byte-identical.

Root should compose this literal primary-model amendment and the separately reviewed UIa281 own-refresh guard literal only after affected source review. An unreviewed full client tree must not replace the frozen proposal. Their retained audit mapping/execution interaction and ordinary external invalidation remain an affected runtime obligation, not an inferred pass.

## Affected must-test obligations

Each obligation is **NOT_RUN**; these are source-derived coverage requirements, with no fixture, oracle body or executable test authored.

- SC-O04: genuine listed owner/workspace joined against equal-taskRef foreign owner/workspace status, with empty and nonempty data; detail scope mismatch; absent-row denial; genuine intake→fresh list→select; no invented initial list identity. Retained BUB006-01 and BUB014-01/05 apply.
- SC-O05: old pending status/detail success or error during newer list refresh; explicit select during pending list; overlapping list success/error/empty responses; latest selection; changed current listed scope; disconnect/dispose. Retained BUB008-05, BUB014-01/03 and BUB006-02 apply.
- SC-O07: original complete taskRecord compatibility across parent/worker/audit; status CAS advancing past genuine list snapshot while detail stays joined to fresh status; no scope identity by taskRef alone. Retained BUB003-02, BUB006-01 and BUB014-01/03 apply.
- Composition: reviewed UIa281 own-refresh preserves audit mapping/execution across loading/stale retained detail and ready-phase null detail, while external changes still invalidate. Root's affected RM23/global runtime lane remains NOT_RUN.
- Scope regression: unchanged authentic initial feature/namespace binding; fresh no-task/after-disappearance memory; no old parent ready reopening during list refresh; unchanged closed grant/CAS and original driver seams/defaults. Genuine native positives are not fabricated.

## Effects, preserved assets and execution limits

The amendment adds only local read-generation metadata and scope/currentness checks within existing explicit parent refresh/select. It adds no imports, constructors, RPC endpoints, services, timers, listener registrations, authority or UI controls. Original status/detail RPC calls retain their receiver/shape. Global selected/read-state effects on worker/audit/normal consumers are disclosed; ready status alone still does not confer a grant.

Only this new capsule and these two named evidence files were written. Full47 before/base equality and exact unchanged client suffix were checked with Python bytes/text/hash operations. Prior43dd/e881/fd8 proposal, older NI4/NI5/NI3/UI/core7 capsules, shared source, installed assets and QAa58 package/profile/listener received no writes. No protected profile/package bodies were inspected. Broader preservation follows these exclusive write paths rather than an invented archive test.

No author fixture/assertion/oracle/testtable body was read or written. No JS parse/import/tests/build, DB, runtime/native/provider/inference, timer/listener/profile/browser, network/credentials, Git, shared-source adoption or blocked finalCODE experiment occurred. Source reasoning is not execution evidence. Fresh independent affected source review, separate design/application/execution and root composition/adoption are still required.
