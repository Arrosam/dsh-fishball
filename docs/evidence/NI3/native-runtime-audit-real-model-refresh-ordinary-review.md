# NR-UI05 ordinary source review: actual-model refresh preservation

**Status:** affected source-only ordinary code/interface/test-coverage review completed for the exact UI05 candidate and authored actual-model fixture. No source defect was identified in the narrow same-selected owned-refresh predicate. This is not an execution result, native observation, UI acceptance, ISTQB review, or closure of the blocked final CODE gap. All 87 AC remain HOLD.

## Reviewed pins

Capsule: `.runtime/ni3-native-execution-recovery-proposal/`.

- Candidate actual client factory: `proposed/client-entry.cjs`, SHA-256 `a281011d3a9aac1071fbe7be081a5645a67619d78b2dfae4912989d75590adf2`.
- Preserved baseline actual client factory: `proposals/NR-UI05-real-model-refresh/before/client-entry.cjs`, SHA-256 `0909a3effda67f0c1780b5ca9fc090650920d15ce0fe9f3acb137df122cb85b0`.
- Literal client patch: `proposals/NR-UI05-real-model-refresh/literal-client.patch`, SHA-256 `d8990e358032417c0b0153b55493f9e134215a8685c09837768965b2066fea17`.
- Actual-model fixture: `test/native-runtime-real-model-refresh.test.mjs`, SHA-256 `9166fdeaa1594abc70975e5a44f8f6416d828adf0dbd7374f871ccd5380665f7`.
- Fixture inventory: `actual-model-fixture-status.json`, SHA-256 `7c1a04bf94239142ac5ceba9f4bcf59ea0793501c19fafe53e20439293ad47c4`.
- Source closure: `source-closure.json`, SHA-256 `dc0222244b7acfaa6fd5843157c97d4823b2f8e25d0c87282ff1e782e482245f`.
- Applied source-and-test amendment: `real-model-refresh-source-and-tests.patch`, SHA-256 `ef0c73b0945c6fb4cafa6335d3cd6a24978931b72d41721bc526fa6e661818a7`.
- Historical ER client fixture and status are unchanged at SHA-256 `be73e92cf993f9bb2d0c99b77764d825aff5bc5dd908188b1e65e3293a75ad1a` and `09b15b47209a630ce9b0ae2f59b96d2f14cc40c2e3373773054d80ef02883d36`.

## Source review

The proposed source is the actual `createModel` and `createAuditModel` factory. Its only candidate delta inserts the predicate before existing selected-key invalidation: while `ownRefresh` is active, preserve facts only for a non-null prior selected key and the same selected task with `detail === null`, `stale === true`, and `phase === 'ready'`. The candidate keeps the original invalidation path for foreign or empty selection, external refresh/select outside the audit-owned refresh window, and offline/error transitions. The existing `task()` check rejects stale or missing detail; audit operations remain busy during their owned refresh; preview and acceptance are cleared before mutations. The source does not add an RPC, retry, authority, reference, collection, or finish inference.

The exact predicate addresses the stated baseline composition failure: actual `createModel.refresh()` publishes the selected task with missing detail during its own `select()`, and the original audit subscription treated that transient as a task switch. RM01 correctly uses the preserved baseline actual pair and stops at the first lost configure requirement; it does not claim to reach execute. The fixture invokes the genuine current and baseline model factories and does not replace task `refresh`, `select`, `getSnapshot`, or `subscribe`, nor inject private model state.

The authored finite fixture has twelve named groups expanded to **23 distinct leaves**. Its strongest coverage includes the baseline discriminator; a real public two-model configure-through-execute sequence; lost dispatch and execute acknowledgements; stale/busy gates and no mutation replay; foreign and empty selection; read errors and a superseding task-selection race; disconnect abort/late response fencing; external version/authEpoch drift; six changed identity mappings; recovery and direct finish boundaries; and observations of the actual null-detail publication. Per-leaf RPC budgets are asserted in the source, with zero native/provider calls in the status inventory.

The fixture's doubles are explicit: RPC endpoint replies/counters, a minimal React interface, and a producer capture interface. The lost-response cases first commit synthetic world facts and then lose the acknowledgement. These are valid finite wire scenarios for client behavior. They do not simulate DSH-native execution, a database, service lifecycle, React DOM rendering, or a provider. The task-model gates are checked through real model methods and snapshots; the fixture does not render `Panel` or prove visual/button behavior. No claim should be made that the mock producer or RPC wire establishes a native receipt, task completion, or reservation release.

The 23 leaves improve coverage substantially but leave manual/external/offline/error missing-detail reset behavior explicitly unresolved. The status correctly records that as a recovery gap. Version/authEpoch drift tests occur while an execute response is delayed before an audit-owned refresh; they do not establish broader currentness or retention across arbitrary external changes. The source and fixture also do not establish native execution, React DOM behavior, or all 87 AC.

## Findings and disposition

No additional literal source change is recommended for this review. The narrow predicate matches the documented behavior and its refusal cases are represented in the authored source fixture. No mock substitution or assertion weakening was found that would falsely prove the actual task-model refresh path. The primary case-count clarification is retained: this is twelve groups and twenty-three leaves, not twelve cases.

All actual-model leaves remain `NOT_RUN`. The ER fixture also remains `NOT_RUN`; the blocked final CODE receipt/envelope/SQLite experiment was not rerun, rerouted, or investigated. Source review cannot convert the author's fixture into a pass.

## Scope and method

This review used source reads, SHA-256 pin checks, and a read-only diff of the exact candidate against its preserved baseline. No Git operation, source/product edit, import, parse, test, build, database, native, provider, service, timer, network, install, browser, or listener execution occurred. No Astra review was used.

The owner's exception permits Luna for unaffected ordinary code-quality/interface/test-coverage review; that is the only delegated reviewer basis used here. Protected receipt/envelope investigation is excluded. All 87 AC, CODE, UI, and semantic quality remain HOLD. This does not close the blocked final CODE gap, does not provide independent design/ISTQB review, does not establish native behavior, and does not accept or release the MVP.
