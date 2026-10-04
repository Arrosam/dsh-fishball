# Preserved first native functional execution outcomes

First independent source SHA256:
`83c9c36aec19c39d6a3a98abe114d6a01b74a3331e6b92c5e21dc1fe41f63c29`.
The unchanged first source is saved as
`native-hooks-independent-first-source.mjs.txt`; the complete first run is
`native-hooks-independent-first.tap`:26 tests,23 pass,3 fail,0 skipped/cancelled.
All274 held inputs matched immediately before this run.

## Attempt versus result taxonomy: cases21 and23

The initial independent oracle expected `unknown` after revoke/cancel before
the delayed actual provider iterator. Observed primitive state was `committed`.
Held NativeAdapter `executeContext` accepts an original committed stream cursor
of either `assistant/message` or `assistant/attempt`; its `committedResult` is
created only for matching `assistant/message` text. Thus the primitive's state
can describe the committed native failed-attempt record, without any successful
provider output or result. This behavior predates normal installed projection
and is distinct from frozen contract section7 / N2-11/17 result eligibility.

Root instructed this lane to preserve first outcomes, inspect exact original
public persisted attempt/input/error/counter facts and keep strict no-source-
output/no-capture/charged-or-unknown checks. A normal composer must project such
work as refused/failed/unknown with no successful result. It may not cite a
primitive attempt commit as useful execution/result success. The narrowly affected
retest adds these persisted factual oracles and uses the source-bound primitive
taxonomy. It does not relax actual text/usage/durability/capture eligibility and
does not change held product source. Exact observations are emitted as bounded
JSON diagnostics in the affected TAP and summarized in the final report.

## Fixture rejection handling: case24

The expected late capture rejection occurred with stable
`WORKER_RESULT_UNAVAILABLE`, but the fixture awaited native owner disposal before
attaching its rejection assertion. Node classified it as an unhandled rejection
and recorded PromiseRejectionHandledWarning. This is an independent-fixture
mistake. The repair attaches `assert.rejects` before disposal, waits for actual
owner disposal, then releases the validator barrier and awaits the existing
assertion. This creates a deterministic removed-session flush refusal and keeps
the exact expected stable code, artifact0/reservation1/actual-unregistration
assertions. No author test, product file or original public host byte is edited.

Only these three cases are affected by the correction. The other23 passed
independent cases are unchanged; the next batch selects only the affected cases.
No unchanged passing author or independent batch is repeated.

## Additional exact-capture partitions

Five new cases subsequently covered owner-written equal result bytes, version2
advanced capture, changed execution/reference/caller mappings, false final setup
and failed post-consume binding. Their first TAP,
`native-hooks-independent-additional-first.tap`, records5 tests,4 pass,1 fail,
0 skipped/cancelled. The full first source for that batch is retained as
`native-hooks-independent-additional-source.mjs.txt`.

The one failure was the independent caller-error oracle: an unbound handle was
expected to return `INVALID_CALLER`; the actual held RuntimeStore `#ctx` requires
the original bound principal and returns stable `UNAUTHORIZED` (line132). The
fixture was corrected to this documented existing error and adds unchanged
snapshot/counter checks after that refusal. All prior changed-reference refusals
already passed. No product change is needed.

The owner-written envelope is also serialized in the exact original native
envelope field order for a literal-byte counterexample, strengthening that case.
Only the caller-oracle case and this strengthened byte-equality case are rerun.
Three unchanged additional passes and the prior26 distinct outcomes are retained
without repetition. All correction commands/results/hashes are recorded in the
independent checks/report.
