# NI6-PREP01 r3 failure: narrow source-only assessment

Disposition: **NO CONCRETE CAUSE ESTABLISHED; FAILED_HOLD unchanged.** This is an author source/public-metadata assessment after the consumed root run, not another execution or an acceptance review.

The actual public command records show all four build commands passed and the build phase finalized PASS. Six syntax commands and the 31-cell pure suite passed. Functional command 8 used the exact frozen Node test argv and exited 1 after 2.606292124837637 observed work seconds. Its failure category is `EXECUTOR_COMMAND_NONZERO`; timeout, interruption and overflow are false, capture is complete with EOF observed, and its owned process group is `ABSENT_OBSERVED`. The test phase finalized false with `FAILED_HOLD` and actual driver exit 1 as reported by root. The public record contains no functional result diagnostic.

The finite metadata comparison found no selected-command or namespace discrepancy: all actual build/test argv vectors equal their sealed proposals, the consumed plan selects `.runtime/ni6-prep01-executor-r3/runner.py`, and every manifest-required affected-review and root-GO pin is present. The build readback contract and source-manifest seal match the preflight literals, with 63 product inputs, 64 descriptor files, 25 host modules and 77 host source files. Public before/after verification records report all selected pins unchanged: build input count 427, test input count 432, and 27,577 host files plus 12 links at both boundaries. These recorded comparisons do not prove that the functional preflight itself returned successfully.

`public-preparation.test.mjs:22` calls preflight before bootstrap; line 45 awaits the original-module import. Its sole 14-field result diagnostic is at line 140, after setup, intake, preparation, repeat/stale checks and disposal all succeed. The catch at lines 145–149 throws a finite stable fixture reason. The preflight catch likewise throws a finite reason, and bootstrap normalizes failure to `PREP01_ORIGINAL_BOOTSTRAP_FAILED`. The public command record supplies none of those reasons. An absent success-only diagnostic therefore does not identify a failing stage. Syntax and pure oracle PASS do not execute that preflight or original host composition.

**Unknowns remain:** actual failing assertion/module/API, whether preflight completed, whether original composition or authentication was reached, actual request count, partial preparation/disposal progress, transient native effects and storage effects. Duration alone does not establish any of these facts. This assessment does not infer zero requests/effects, a product defect, an unsupported oracle, or a remediation.

The assessment stops here. No source was changed; no successor, retry, marker/ledger reset, candidate parse/import/build/test, private stream/profile/auth/DB read, process/signal/network probe or Git action occurred. All 87 remain accepted 0/HOLD; protected final CODE remains permanently blocked and untouched. Root continues its separately authorized LIVE02 work.

Selected exact input pins (SHA256):

- Source manifest: `1af86a03bdacec92a93648d7f082551ac90839100532533bb07bc2370552b3f2`.
- Functional source: `fbdc1addc3f2d095a1663f562c5ff0ec6bdddd4032763132a469a890a45e6173`.
- Preflight source: `65a4e7bc72747fe0480a58ef630d2c3de30511af903b194c00376f557111bca2`.
- Bootstrap source: `6f66cbd564448be228621cdc7d30d6d3b871fa6fd30fd1c25e51485839083421`.
- Public build command results: `1ddf07983aed85f306df1cbe3b4ba7bf684e818009bcc27b600b608e6a808826`.
- Public test command results: `9a8b0dbb939643924793cf10c83efef5f9b7ba2d5866cd495184e7d88e2aaa06`.
- Public test phase result: `aebe846cde9fcd2fbbaa75639f43ff0c65edb67b788cc4a7f0998f9c670cefd0`.
- Built package readback: `007b657e8d7f07d36cfa279acb8a27dfd0415f8876f2597eb68e2e319f6a67ce`.
