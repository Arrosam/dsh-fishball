# Isolated schema6 fixture consume correction and affected lease

Root read the complete first disposition `dd95a0a1848d11dc21802192c4162d9ccf09e557e97952c3f8b30f04fa9a7561`, retained first TAP `2a9fe5d13ba821f909bb28e490cf0e6ca261890b3e91bfb10437c334fe3890a1`, and original RuntimeStore begin/consume/capture source. All95 original file rows still match. First11 nodes remain3 PASS /8 FAIL; the omitted consume call is a fixture precondition error and the observed capture refusal is correct.

Authorize only the literal insertion proposed in the first disposition after `beginAuditExecution`:

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

Keep all other assertions, helper behavior and product/dependency bytes unchanged. Preserve the first test3e7662f3 and raw first TAP; save the corrected literal source, minimal diff, exact hash and before/after dependency checks before executing. No original outcome is rewritten.

GO for the proposed affected command only:

```sh
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test --test-concurrency=1 --test-name-pattern='C6F0[4-8]' .runtime/ni4-core6/candidate/test/core6-independent-functional.test.mjs
```

The original bounded readOnly/owned-child exit73/deadline20s scope remains in force. No C6F01–03 or author20 repeat. The first child's inner output was not retained; do not assert a historically observed inner error or absence of policy denial. Any explicit runtime/sandbox-policy denial stops without fallback. Any further failure is preserved and reported before another correction/retest. Product sources, shared schema5, genuine5 capsule, native/CODE/browser/publication/acceptance boundaries remain unchanged; all87 criteria remain HOLD.
