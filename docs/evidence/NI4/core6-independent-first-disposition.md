# First isolated-core6 run: exact fixture disposition

Status: **FIRST FAILURE PRESERVED; CORRECTION/RETEST NOT AUTHORIZED YET**. No product source or test has changed after the run. The live test and first snapshot remain `3e7662f3f3e34d8ad9e0ebef77a9dc4370667fab5bde889a60b18f6e4b2279e0`. Candidate RuntimeStore is still `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`, Ledger `c42893e85399836ad2bb41f96627104455c5bc31de576a4c993e41d487c0a258`; all95 held rows match before and after.

The exact authorized first command exited1. [core6-independent-first.tap](core6-independent-first.tap), SHA256 `2a9fe5d13ba821f909bb28e490cf0e6ca261890b3e91bfb10437c334fe3890a1`, retains the full parent stdout/stderr:11 TAP nodes,3 pass,8 fail,0 skip/cancelled,710.751417ms. This is10 leaf cases (3 pass,7 fail) and one failed C6F04 wrapper. C6F01/02/03 passed; C6F04's three leaves and C6F05/06/07 failed at their shared review setup; C6F08 observed owned child exit1 rather than the requested committed exit73. [core6-independent-first-result.json](core6-independent-first-result.json) and [core6-independent-first-after.json](core6-independent-first-after.json) retain counts, raw-output binding and all95 row checks. These failures must not become a fictitious passing first command.

## Untouched public execution/capture gate

The source read is restricted to the already authorized public API fixture state machine, not a protected-row/cipher experiment or CODE retry.

1. `beginAuditExecution` (RuntimeStore lines2460–2476) checks the current claim, exact action/spec/input and live created worker/session, then saves and returns an `audit_input` execution with `state:'intent_committed'`. Its successful acknowledgement does **not** consume execution authority.
2. `assertExecutionCurrent` (lines2478–2501) checks the exact task/claim/generation/action/execution refs, fresh grant/permission/material and original execution binding under the transaction. Only an `intent_committed` record changes to `dispatch_intent` and returns literal `admitted:true`; an already consumed record returns `admitted:false`. It uses the original precommit fault boundary.
3. `captureAuditResult` (lines2546–2548) accepts only that exact associated execution/worker/session and `state` in `dispatch_intent|unknown`. It correctly returns SPEC_MISMATCH for an unconsumed `intent_committed` execution. Unknown is an existing recovery state, not permission to invent a new execution.

The independent `reviewed()` helper calls begin at lines168–169, builds its bounded synthetic response, then immediately calls capture at lines175–178. It omitted step2 entirely. No intervening call can consume the record. The successful begin acknowledgement already checks the requested immutable action/input/session association; the response uses the same returned executionRef and held task/claim/generation/session. The missing state transition alone suffices to explain every retained direct SPEC_MISMATCH at line2548. Capture refusal is a **correct gate observation**; these failures did not reach byte admission, notification/currentness, severity, permission/expiry or temporal assertions and cannot establish those intended outcomes.

The original author fixture includes this public consume call. Its source was read only to compare the required public API boundary; no author helper or20-case suite was imported/executed. The independent fixture must satisfy the same real API precondition rather than relaxing production capture.

## Exact proposed fixture-only correction

Insert the following after the existing `beginAuditExecution` acknowledgement and before response construction/capture:

```js
const consumed = x.store.assertExecutionCurrent(x.host, {
  taskRef: x.task.taskRef,
  claimRef: held.claimRef,
  generationRef,
  actionDigest: held.actionDigest,
  executionRef: execution.executionRef,
});
assert.equal(consumed.admitted, true);
```

This is exactly one original synchronous consume call with public returned/captured refs and one literal-true assertion. It adds no source hook, role, grant, callback override, record mutation, new native effect or source acceptance. Keep every existing closed-input, source/provenance, byte/receipt/operation, report/notification/coverage, expiry/revoke/access, hold/recovery and child-exit assertion unchanged.

The helper is used by C6F04's three boundary leaves, C6F05/06/07 and C6F08's private child branch. The proposed affected selection is only C6F04–C6F08:

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test --test-concurrency=1 --test-name-pattern='C6F0[4-8]' .runtime/ni4-core6/candidate/test/core6-independent-functional.test.mjs
```

This command is proposed, **NOT RUN**. C6F01/02/03 and author20 must not be repeated. Preserve the amended literal test, diff, source hashes and affected FIRST retest TAP separately after root GO. Any later real counterexample requires another preserved disposition; this proposal predicts no pass and changes no intended oracle.

## Child-output and policy limits

C6F08's parent preserved a completed spawn with status1 and no requested exit73; it did not observe a successful committed publication. The child invokes the same `reviewed()` before reaching its acknowledgement/exit path, so the same missing consume is a source-supported explanation. The separately captured child stdout/stderr was transient in `spawnSync` and was not saved by the original test; no full raw child log or independently observed child inner SPEC_MISMATCH is claimed. That limitation cannot be repaired by inventing historical output or repeating an unchanged passing family.

No runtime-policy denial appeared in the retained command/parent TAP. Child status1 is not by itself proof of a denied action or of a committed effect. The observed direct parent-family failures are stable product gate errors. If the authorized affected child retest produces an explicit sandbox/runtime-policy denial, stop and report it; do not change the process path, permissions, source or environment to bypass it.

Product findings established:0. Intended later-family oracles remain not reached. All87 full criteria, actual native/profile/provider/accounting/UI, final CODE, browser, MVP and publication remain HOLD. Root's bounded affected GO is required before this fixture correction or another execution.
