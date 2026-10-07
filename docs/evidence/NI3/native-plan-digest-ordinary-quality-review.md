# NI3 native plan digest: ordinary quality review

Status: independent static review of the ordinary planning API amendment, its narrowly changed candidate source, and its focused test. This is not a runtime result, CODE verdict, source/native proof, or acceptance decision.

## Pins and scope

All reviewed source/test and evidence-document hashes matched the values in the author hold or proposal records.

| File | SHA-256 | Scope |
|---|---|---|
| `docs/evidence/NI3/native-plan-digest-amendment-proposal.md` | `1cc96de8a786a553f20d006fe8f36c87c80ba6bf0d70d7880a2300793e7eddb1` | Full proposal |
| `docs/evidence/NI3/native-plan-digest-amendment-proposal.json` | `24471a4da5d7f8e8312b8a66f0e5dada49a99f8a3bcce15135fd65266b8b3cfa` | Full proposal record |
| `docs/evidence/NI3/native-plan-digest-author-source-hold.md` | `023b61c925ac0c02772ee16c8e9291e321af49c8fde32d4e972931118eb3a987` | Full author hold |
| `docs/evidence/NI3/native-plan-digest-author-source-hold.json` | `160a52efb95a6b67950b5e1a39b8a78eef9de8fa85f4ae968ffa5628684464d2` | Full source/test hold record |
| `.runtime/ni3-native-plan-digest-amendment/src/installed-audit.mjs` | `066f55c30d0044d2cab2a2823d6e3d90af504889ab6afc50efdf1f65692c637c` | Snapshot helper 92–98 and plan digest patch 344–361 only |
| `.runtime/ni3-native-plan-digest-amendment/test/native-plan-digest.test.mjs` | `4121d3eac932b3dc42d33735cf7189cd9ec4a593f67260d81093c28290a731e6` | Full 130-line focused fixture |

The core/store implementation was not opened. Its schema6 provenance and API roles below are drawn from the proposal/hold and the test's public API calls only.

## Static API review

The original planning callback in the focused fixture calls `store.planAction(owner, input)` and returns that exact public result object; `snapshotOwner` similarly calls `store.snapshot(owner, input)` and returns its public result. The candidate retains the existing immutable receipt handling, validates that the returned `actionDigest` is a reference, and then reads the existing scoped snapshot through `snapshot(taskRef)`. That helper checks owner, workspace, and task scope under the existing invocation wrapper (`installed-audit.mjs:92–97`). The amendment requires the derived `actionRef` to match the original result, locates that action in the scoped snapshot, and compares the snapshot's unchanged digest and full spec before storing a private plan (`:351–357`). It does not compute a replacement module digest, normalize either API result into an alternate shape, or assume the current task version equals the planning version.

The actual public planning behavior described in the proposal is consistent with the correction: the core digest is scoped to owner, workspace, task, planning task version, auth epoch, and full spec, while the public result contains action reference, digest, task version, and auth epoch. The module now checks the action identity and full spec association using a current scoped snapshot and retains the actual returned digest unchanged. The plan-result fields are returned through the module without an added wrapper; the test checks the public result keys and deep equality with the original result (`native-plan-digest.test.mjs:78–83, 106–117`).

## Focused test oracle and effect accounting

The test creates a synthetic schema6 store in a temporary directory and prepares a valid advanced producer action, grant, claim, artifact, context, and audit input so the actual public snapshot can expose a valid producer-associated audit input. This is setup for the measured ordinary audit plan. The fixture keeps that producer claim held: the worker snapshot is identical before and after the audit plan, its claim reference remains the producer claim, and its release evidence remains null (`native-plan-digest.test.mjs:48–68, 104–127`).

The measured audit step asserts one actual public plan call, no audit grant or claim, no preview/composition/native request, and no provider or tool effect counters. It also checks the actual snapshot action's digest and complete spec against the module-returned result and the independently implemented sorted-key SHA-256 oracle using the snapshot's planning version and auth epoch. The oracle is distinct from the product's digest helper and confirms the scoped digest differs from a spec-only digest (`:106–127`).

Cleanup is registered with `t.after`: dispose the installed module, close the synthetic store, and recursively remove the temporary directory. The test also explicitly disposes the module before asserting one subscription and one unsubscription (`:33, 128–130`). The author hold says this test is `NOT_RUN`; these assertions are inspected coverage, not an observed result.

## Finding

**Focused coverage omits the specified post-commit refusal path.** The new source calls the original public `planAction` before the follow-up snapshot. The proposal explicitly says that if the scoped snapshot refuses or no longer agrees, the committed core action must remain while local module admission fails, without rollback, hidden retry, or optimistic success. The single positive fixture verifies successful matching but does not make the snapshot callback fail or return a missing, mismatched-action, mismatched-digest, or mismatched-spec snapshot after the public plan commits. This is a coverage gap, not evidence of a source defect: the candidate visibly fails the comparison before inserting its private plan, and no executable result was collected.

The measured test separates `setupPlan/setupGrant/setupClaim` from `auditPlan/auditGrant/auditClaim`, and checks the intended one-setup-claim/held-reservation versus one-audit-plan/no-audit-grant-or-claim counts. The positive oracle, identity/spec checks, and cleanup are otherwise appropriate for the bounded public API discriminator. The real core test remains held until separately authorized execution.

## Scope counters and disposition

Scope: four amendment/hold documents, one source candidate read only at the scoped snapshot helper and plan patch, and one full focused test file. All six hashes above matched. No core or ledger body, receipt/envelope, protected row, cipher/header, tampering, legacy, quarantine, or recovery surface was reviewed.

No Node command, product import, syntax check, test, database, native, provider, model, tool, network, Git, or source edit was performed in this review. The original final CODE gap remains blocked; this ordinary planning API review does not replace it. All87, ticket/MVP, native, and browser acceptance remain unaccepted.
