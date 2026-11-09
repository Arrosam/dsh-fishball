# X0-C held-notice injection and scale investigation

## Scope and outcome

Branch `dev/v2-x0c-inject-scale` starts at `5d93891aa41bd9b716faa91306b22095d3b076c2` and merges the unchanged faithful fake host `b5a99ac4adea3f48ad4cd33039185d7db2ceed81` with no fast forward (merge `25cc5ed52c1f5d2d23de86064ac4b9219181d423`).

**Delivery under the revised scale decision.** The user subsequently chose: “Go with A, test a reasonable count with per-notification writes”. The original throughput-style KEYS cases are superseded by independently authored retention-boundary cases from `28b3dd7a711b394a34870fc6a01acbe976989b94`, merged with no fast forward. They seed 9,998 committed entries and send 1/2/3 notifications through the real durable path, retaining the actual 10,000-key cap. See [test-author report](v2-x0c-keys-scale.md). Held-notice injection is fixed. Repeated full-history acceptance and per-save notice scans and redundant durability I/O are removed, but unchanged 10k cases still exceed the 60-second budget. After measured evidence was presented, the user selected “Preserve durability; report partial result.” No storage/durability contract was weakened to manufacture a pass.

## Product changes

[Extensions](../../packages/instance/src/slim/child/extensions.js) stages held-notice injection before the owned chat followup, so the first SDK claim sees it. For external wake paths it defers held-notice injection to a microtask after synchronous Session publication. Both real SDKs forbid nested appends while publishing `turn/start`; `inject` synchronously inserts next-step context without waking another turn. The first claim may precede the microtask: delivery is SDK next-step context, not text merged into an ordinary followup. Injection deliberately does not wait behind serialized disk work, which could let the turn finish first. Stable identities, SDK flush, and durable held-release markers remain intact.

The same module seeds acceptance IDs and notification-record identities once per Session object, then folds synchronous Session events into that index. It retains consumed/discarded identities. Separate ordered held and evictable sets avoid scanning all notices on every turn and save; only accepted non-held history is eligible for the existing 10,000-key retention limit. The append handle now performs write and file sync together; directory sync occurs at initial linkage and after compaction rename, not after ordinary appends. Pending reservation sync remains before delivery; SDK flush remains before accepted-marker sync and receipt.

Both SDK sources confirm log insertion precedes contained synchronous observer notification with the actual Session object. The index assumes a live attached Session publishes its subsequent appends. Existing close behavior does not drain/cancel already queued work; graceful shutdown under timed-out producers is not newly certified. Sustained overflow still uses existing full compaction; no broader journal redesign was attempted.

## Independent evidence

A separate agent derived [six new held-context regressions](../../packages/instance/test/instance-ext/x0-c-held-context.test.mjs) from requirements and fixture contracts without reading implementation. BVA 0/1/2 holds, quiet/wake and duplicate partitions, admission outside publication, no extra wake, stable identity, restart and pre-delivery held-ledger crash-checkpoint replay were covered. The post-inject/SDK-flush-before-held-release-marker crash cut is not covered by that checkpoint test, despite its broad test name. Initial source failed 5/6; the same tests passed 6/6 after the fix on each SDK. Final-source reruns also passed 6/6 (rc.5 1.010 s; rc.1 1.080 s).

A different independent static reviewer approved the product diff including the I/O optimization after reading app/chat callers and both installed SDKs. Approval explicitly excludes a claim that the scale budget passes. A separate performance investigator reviewed the indexes and found no blocking correctness issue for attached live Sessions.

## Scale diagnosis

Exploratory full X0-C runs after indexing, and after append I/O optimization, still emitted 60-second scale timeouts. They were explicitly cancelled before final verification and are not claimed as normal exits.

Independent fixture-only rc.5 probe: 10,000 followups/admissions/flushes completed in **0.899 s** (halves 0.466/0.433 s). The public notification path took **34.373 s for 1,000** (halves 17.364/17.009 s). Instrumentation observed only three whole snapshots and 4,999 delta snapshots for the latter, confirming no growing full-history scan in that measured path. Constant per-item latency, rather than quadratic growth, dominates after indexing. Extrapolating 1,000 to 10,000 gives about 344 seconds, not a completed measurement.

Local filesystem probes measured 200 file syncs at 2.345 s, 200 data syncs at 2.284 s, and 200 synchronous fsyncs at 2.065 s during verification load. Later 100-sync probes measured 0.434 s on the workspace volume and 0.572 s under `/private/tmp`. These are environment/load-sensitive microbenchmarks, not acceptance cases. Child fixture homes are under `/private/tmp/fbtest-instance-ext-*`, independent of TMPDIR. Two serial durable barriers per sequential notification remain an important physical cost; batching sequential awaited receipts would require changing the durable-receipt contract. Neither the cases nor their timeout was changed.

## Execution and final matrix

All execution uses installed read-only SDK packages under `/Users/samuel/Library/Application Support/DSH/data/versions/<version>/node_modules`, plain Node tests in workspace-write, `env -i`, and disposable HOME/TMPDIR/DSH_HOME/DSH_AGENTS_HOME. No browser, network service outside local fixtures, real model, credentials, `.npmrc`, live profile, install or push. Root tests retain existing scripted model fixtures and generated dummy credential fixtures in disposable homes.

```sh
FBTEST_DSH_RUNTIME=".../versions/$version/node_modules" \
  node --test --test-concurrency=1 --test-timeout=60000 \
  packages/instance/test/instance-ext/x0-c.test.mjs
FBTEST_DSH_RUNTIME=".../versions/$version/node_modules" \
  node test/run.mjs --test-concurrency=1 --test-timeout=60000
```

The root runner delegates to plain `node --test` with those flags. Adjacent runs use the same Node flags with FN-1 and B1 paths. Logs are ignored under `.runtime/inject-scale/`.

Initial full root runs completed and matched the report baseline (rc.5 1088.56 s; rc.1 1139.47 s). Final-source root reruns were also launched after the owned-idle prestaging and release-set correction; their results below supersede the initial runs. Root suite counts exclude package-local X0-C/FN-1/B1. Root reported the known provider-sync HTTP classification assertion as an existing TODO, not a failure.

| SDK | Suite | Pass | Fail | Cancelled | TODO | Skip | Wall time / exit |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| rc.5 | full root | 1507 | 0 | 0 | 7 | 17 | 1372.81 s; exit 0 |
| rc.1 | full root | 1503 | 0 | 0 | 7 | 21 | 1452.83 s; exit 0 |
| rc.5 | full merged X0-C | 95 | 0 | 0 | 9 | 0 | **7.02 s; natural exit 0** |
| rc.1 | full merged X0-C | 95 | 0 | 0 | 9 | 0 | **7.54 s; natural exit 0** |
| both | FN-1 | 10 | 0 | 0 | 3 | 0 | final combined FN-1/B1 wall: rc.5 0.27 / rc.1 0.92 s; exit 0 |
| both | B1 | 10 | 0 | 0 | 10 | 0 | as above |
| rc.5 | new held-context (including running-chat boundary) | 7 | 0 | 0 | 0 | 0 | 2.249 s; exit 0 |
| rc.1 | new held-context (including running-chat boundary) | 7 | 0 | 0 | 0 | 0 | 2.290 s; exit 0 |

## Remaining gaps

- User-requested test-only commit `22550435262cd57fa3f2eb1bd43d331e3ad5255d` was merged with no fast forward as `98c063e55cd8752355b8b5e6ba84c5ab39a08be0`. Its rewritten `XC-UC-02-A1` observes actual admission and requires the first chat step. Microtask-only delivery initially failed with two steps; idle owned-chat prestaging fixes that without bypassing SDK guards. Final targeted runs pass on both SDKs (0.215 s each). Running-manager inputs are not prestaged into the current turn; the deferred turn-start path remains. Release-in-progress tracking prevents duplicate marker writes. Independent reviewer approved this final correction.
- Original throughput cases are **superseded by the merged independent KEYS rewrite**. Their old full-file runs timed out, remained alive after case output, and were stopped at the user's direction; no natural exit is claimed for them. The current bounded boundary cases preserve the true 10,000-key retention policy and per-notification durable writes. Full-file natural exit and wall times are reported for the merged cases, not the obsolete runs.
- Existing X0-C nine, FN-1 three, B1 ten TODOs remain TODOs. New tests are real-SessionStore/model-free integration, not live-model, browser or production-profile E2E acceptance.
- Existing SDK-dependent root skips and provider-sync TODO must remain distinct from unexpected regressions.
- Syntax check and `git diff --check` passed. X0-C cases match the user-requested rewritten-case merge input exactly; fixture and root runner match the fake-host merge. No case or timeout was edited by the product implementation agent.
