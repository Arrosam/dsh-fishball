# NI3 native plan digest: literal source correction proposal

Status: **SOURCE-ONLY PROPOSAL; no candidate source or test authored, no executable lease.** Root must approve the literal diff below before source authoring under `.runtime/ni3-native-plan-digest-amendment/`, then separately approve exact authored source/test/closure before execution. The historical native-tools candidate24dd, author test0546, execution evidence and independently owned fixture remain unchanged. This proposal grants no product, engine/runtime candidate or Git write authority.

## Ordinary public planning mismatch

Pinned optional18 installed-audit source `24dd8048135fc61f79a719288dbc00ea93f61a6a6dcbaffdb0a49db648764f1f`, planAuditAction lines344–355, currently requires `receipt.actionDigest === canonicalDigest(spec)`. Its author fixture line81 returned that same spec-only digest, masking compatibility with the actual original public API. No prior author result is rewritten or promoted to actual core/native proof.

Pinned actual schema6 RuntimeStore `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`, public planAction lines583–610, derives its digest from `{ownerRef,workspaceRef,taskRef,taskVersion,authEpoch,spec}` using trusted scope/current planning state. Its unchanged original public result is `{actionRef,actionDigest,taskVersion,authEpoch}`. Scoped public snapshot lines1288–1302 exposes actions with original actionRef/actionDigest/fullspec and planning metadata. Therefore ordinary actual plan succeeds in core yet the current module's spec-only comparison refuses it. This finding concerns API consistency only; no protected row, ciphertext, receipt-envelope, legacy/quarantine or tamper investigation is performed or proposed.

The existing module `snapshot(taskRef)` enters the same current invocation carrier, calls root's original bound `snapshotOwner({taskRef})`, safely detaches it and verifies exact owner/workspace/task scope. Root's original bound `planOwnerAction` remains the actual public `RuntimeStore.planAction(owner,input)`. No API field, caller-selected proof, digest rewrite or alternate authority is added.

## Exact smallest proposed source diff

Apply only this change to a **new isolated copy** of the exact24dd source after root's source GO:

```diff
@@
         check(); const receipt = immutable(api.planOwnerAction({ ...core, spec }));
-        if (receipt.actionDigest !== canonicalDigest(spec)) fail('AUDIT_RECEIPT_INVALID');
+        ref(receipt.actionDigest);
+        const planned = snapshot(v.taskRef).actions.find(item => item.actionRef === actionRef);
+        if (receipt.actionRef !== actionRef || !planned || planned.actionDigest !== receipt.actionDigest || !SAME(planned.spec, spec)) fail('AUDIT_RECEIPT_INVALID');
         if (existing) { if (!SAME(existing.spec, spec) || !SAME(existing.input, p)) fail('IDEMPOTENCY_CONFLICT'); }
```

Retain the actual original planOwnerAction digest unchanged in the module private plan and returned result. Require exact derived action identity, matching current scoped actual snapshot actionDigest, and full normalized derived spec equality before private admission. Scope and carrier checks come from the existing snapshot helper. Do not reconstruct a second module digest, assume current snapshot task version equals planning version, convert the old spec-only digest into the scoped value, accept either form, or add a generic result normalizer/fallback. Root bound original snapshot/plan implementations supply actual source; matching typed doubles never establish it.

This introduces one synchronous scoped snapshot read after the existing original planning call, before the module records its private plan. That read creates no grant/claim/session/request. If it refuses after original planning committed, preserve that committed action and refuse local admission; no rollback, hidden retry or optimistic success is introduced. All derived full spec/input/role/policy/grant/permission/tool callbacks and receipt/fixed-target/collection/lifetime semantics outside this literal line replacement remain untouched. Original17+optional18 API and six-field contribution remain unchanged.

## Future source and focused executable proposal

After separate source approval, create only `.runtime/ni3-native-plan-digest-amendment/`: a copied original24dd baseline, the proposed patched src/installed-audit plus its exact six existing dependencies, an exact five-module original schema6 core capsule copied from `docs/evidence/NI4/core6-author-execution/final/src/`, and one newly written focused author test. The original seven-module tools candidate remains byte-identical, including its historical ledger5 definition dependency; the test's actual RuntimeStore6 imports the separate pinned core6 capsule. No package/download/dependency change is needed. Companion records every source origin, target and import/builtin dependency plus the computed proposed candidate hash; those future source/test files do not yet exist.

Planned test: `PD01 actual core scoped plan digest reaches normal audit plan`. Write a fresh narrow fixture using actual original RuntimeStore6 with synthetic scoped data and an independent sorted-key SHA256 oracle. Root-bound planOwnerAction and snapshotOwner must call actual public methods without modifying returned digests or wrapping their shape. Prepare synthetic task/policy/material/context/artifact/audit input through public APIs. The other mandatory installer source projections are explicit typed doubles over those synthetic facts and provide no native-origin proof. Module planning derives its own full audit spec; core really accepts and records it. Assert original public result shape, same original actionRef/digest returned through the module, exact actual snapshot spec/action comparison, independently computed scoped planning digest using actual snapshot planning metadata, and inequality with spec-only digest. Assert one actual planned action and zero compose/preview/grant/claim/provider/tool effects. Dispose/close/cleanup afterward. This is an ordinary positive public planning compatibility discriminator, not adversarial receipt/storage exploration.

Proposed command after source/test review and separate executable GO (NOT RUN):

```sh
/opt/homebrew/bin/node --test --test-name-pattern='^PD01 actual core scoped plan digest reaches normal audit plan$' .runtime/ni3-native-plan-digest-amendment/test/native-plan-digest.test.mjs
```

Only this new single group is proposed; no existing six-group author/native-tool independent fixture, full49, canonical20 or stress/race suite is rerun. No child process is needed. Expected effects are one synthetic temporary core6 SQLite store, public setup/preparation/plan mutations, scoped public snapshot reads and cleanup. Read-only existing owned directory checks from worker config are retained. No native host/profile/session/original DSH service/provider/model/tool/network/account/credential/browser/Git action is proposed. Simulated source/model labels are fixture facts only; no live or paid model is selected.

Exact executable source/test pins remain a later author hold, because root has not approved writing them. Stop denied runtime policy without fallback; any failure after a future lease must retain first output and await narrow remediation authority. No independent CODE retry follows this proposal.

All20 original NI3 families, additive20 families and all87 acceptance criteria remain retained/unaccepted. Actual native composition/source/usage, independent CODE platform hold, supported browser/accessibility, useful model quality, full MVP and publication remain HOLD. Root alone reconciles integration and performs Git writes. Earlier source-only histories remain their original bytes and meanings.
