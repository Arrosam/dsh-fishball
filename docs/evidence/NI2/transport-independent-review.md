# NI2 independent private-invocation functional checkpoint

**PASS for the bounded typed transport module; normal wrapper propagation, durable/native/package evidence, final CODE, browser and full NI2/source-AC acceptance remain HOLD.** The new independently authored [test](../../../test/operator-invocation-adversarial.test.mjs) passed75/75 TAP nodes on its first and only execution (15 top-level families+60 nested nodes;67 leaf tests),0 failures/skips/cancelled/TODO. The unchanged author+legacy files separately passed12/12. Syntax passed. No product counterexample or fixture correction was needed; first source and first raw TAP are retained unchanged.

This uses root's functional lease and frozen [source clarification](transport-invocation-addendum.md) SHA256 `f89d492baf618945210474ef0cfbe709dde9aaf488fd078bce7cfad379a97f44`, [independent design addendum](transport-invocation-test-addendum.md) `d1dadbaf9c20039123a46bbe046c5fff6309be2cfb07792000057053ccbf4e71`, and [root GO freeze](transport-invocation-root-freeze.md) `543b48f91245f887e6d85195b6b18571323ea1063c709ac3f1cd877ccef32e07`, committed by root at76b1aaa. The held [NI2 design](test-design.md), preview/provider/foundation histories and all old executable assertions remain unchanged. This checkpoint is the independent functional lane, separate from onboarding_ui's implementation/tests and the unavailable final CODE lane.

## Tested boundary and exact source closure

The carrier is deliberately typed: a synthetic `connection.operator`, typed `rpc.handle` callback and real local AbortController/AbortSignal. It does not instantiate native HostConnectionService, OperatorPeer, Cordis, a host profile or SQLite. The operations, effect counters and retained Map receipts are explicit doubles. No provider, listener, HTTP, browser, credential, tool or external effect was exercised. These double identities demonstrate bridge equality and closure isolation, not authenticated native provenance. In particular I10's retained Map/fresh read is an in-process response-order oracle, not durable storage/restart/idempotency acceptance.

The complete JavaScript module closure is one held file, `src/operator-bridge.mjs`, importing only Node's builtin `node:util`. It imports no helper, peer package, relative/dynamic module or native service. The approved Node22.22.2 executable and its actual linked `libnode.127.dylib` engine were hashed before/after; [linkage metadata](transport-independent-node-linkage.txt) distinguishes the engine from the small Homebrew executable. Existing OS/framework and other Homebrew dependencies are the established platform baseline; this is not a new whole-system audit. All10 recorded source/design/manifest files and2 runtime binaries stayed identical; all8 author-manifest entries match. Full facts are [before](transport-independent-before.json) and [after](transport-independent-after.json).

| Exact held input | SHA256 |
| --- | --- |
| `src/operator-bridge.mjs` | `2150c4dae7db35f3cd66110c5526a9a0758dcc0d24e37f5c72f6ea1b74ca0f11` |
| Authored `test/operator-invocation.test.mjs` | `643d278256de96097fd16e811469a937de7158eb48944d3b3bdd9279a5691132` |
| Unchanged legacy `test/operator-bridge.test.mjs` | `dd131ed2c325b683dc749ca54cb65072a787e9d797b9fee2646563437297ad04` |
| Author8-entry manifest | `e4ceaa4b836909a5580bcd861f602a9dab7cd7442e71f85d5435d3397a423399` |
| New independent `test/operator-invocation-adversarial.test.mjs` | `b91bcaddea72bdd35e1c061a7c2ccd9e277cdd8b818e99e5f95eb90f149d51d9` |
| Node executable `/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node` | `463b47d6e984e4f84cd2421dabf5081414e40ab9d967e828b2db7858e707f6de` |
| Linked Node engine `/opt/homebrew/Cellar/node@22/22.22.2_1/lib/libnode.127.dylib` | `81cf1016801a1cd9f41cff171a703d3f392b0ce888add8aef66e012b3c0f64d5` |

## Independently selected expected and actual oracles

All Ixx family names are selectors in the checked-in independent test. Each row passed. The new cases use decision tables, exact boundaries, separate overlap barriers and replacement/response-loss transitions; the unchanged authored12 are reported separately rather than called independently designed.

| Family / frozen design rows | Exact independently expected oracle | Actual |
| --- | --- | --- |
| I01 / N2T-01/09 | Second argument is ordinary immutable exact `{assertCurrent}`; callable private guard unavailable through JSON. Nested first input is detached/frozen before await; post-call caller edits cannot replace it. Deactivate denies borrowed guard. | PASS; exact key/prototype/function shape, attempted replacement throws, original nested result preserved. |
| I02 / N2T-01/10 | Callable/nested callable, accessor/hidden, Proxy/revoked Proxy, symbol, inherited/null-prototype and sparse payload cannot carry authority or invoke a getter/trap. | PASS for10 partitions;0 operations and0 traps. |
| I03 / N2T-02 | Eight alive×admitted-peer-match×abort decisions deny before reading hostile payload: closed lifetime, then wrong admitted identity, then abort; exact current positive enters once. | PASS for all8 decisions;0 payload getter executions. |
| I04 / N2T-02/10 | isAlive requires literal synchronoustrue, excluding false/number/string/object/Promise/thenable/throw. | PASS for7 partitions;0 admitted operations and0 then calls; bounded disposed projection. |
| I05 / N2T-03/04/06 | Guard is carried beyond an await to the immediate typed effect boundary. Abort, current-peer replacement, deactivate, dispose with unregister still pending, or false/Promise/throwing lifetime refuse before the effect. | PASS for7 partitions;0 effects. Pending async unregister does not reopen a captured handler. Real manager/core callback propagation is not exercised. |
| I06 / N2T-06/07 | Only trusted guard use selects final checking. Legacy ignored-context operations—including both special fractional command names—preserve already-admitted response despite abort and caller opt-in flags. Guarded operation denies final response on abort/peer/lifetime loss even if caller flags arefalse. | PASS for6 partitions. Ignored-context admitted response remains original; no extra initial admission after abort. |
| I07 / N2T-05 | Two simultaneous A/B invocations have distinct private guards and native signals. AbortA and completeB first; B still proceeds, A cannot borrow its authority. Closing bridge then denies B's borrowed guard. | PASS; effects exactly`['b']`, A bounded abort, no shared latest guard. Concurrent here means overlapping typed asynchronous calls, not independent-process ledger concurrency. |
| I08 / N2T-05/09 | Retire old bridge, install replacement on the same connection/peer, resume old await: old captured guard staysdisposed while replacement guard remainslive. | PASS; old effects0, replacement effect1; old captured handler cannot resurrect. Native Loader reload is pending. |
| I09 / N2T-02/11 | Semantic peer clones, missing peer, connection-as-peer and current peer replacement cannot equal the captured/admitted identity. Near/unknown/nonstring endpoints deny before payload evaluation. | PASS;0 operations/descriptor reads. Exact native peer provenance remains N/P. |
| I10 / N2T-08 | Commit-first typed counter/receipt is retained when final response islost. Aborted old invocation cannot enter again; fresh admitted read observes the same receipt without automatic replay. | PASS; commits1, Map entries1, fresh reads1, no automatic additional commit. Real authoritative receipt/claim/reservation persistence remains D/N/P. |
| I11 / N2T-10 | Thrown error code getter/Proxy/revoked Proxy/inherited prototype/coercion/string/symbol/null/unknown data cannot expose canary or execute traps. Allowed own data code projects only bounded code/message/details. | PASS for10 partitions;0 reflection/coercion/accessor traps; exact stable known/unknown projections. |
| I12 / N2T-01/09 | Full captured JSON input including escaped UTF-8 is allowed at65535/65536 bytes and refused at65537, without a rejected effect. | PASS for all3 reachable serialized boundaries; individual body remains<=65536 bytes. |
| I13 / N2T-01/09 | Object fields63/64/65, array elements127/128/129 and value depth11/12/13 preserve their exact inclusive parser bounds. | PASS for9 partitions; out-of-bound input0 new effect and stable INPUT_TOO_LARGE. |
| I14 / N2T-01/07 | Finite fractions remain permitted only for exact registered memoryRemember/prepareContext; NaN/Infinity/unsafe integer and near/other operation fractions deny. Integer positive remains; guard opt-in does not alter numeric capture. | PASS; exact0.9 transport positives, unsupported/domain-invalid numeric forms refuse. Memory confidence/vector/revision domains are not retested here. |
| I15 / N2T-06/09 | Registration/read-status/disposal cause0 typed domain effects; own bridge closes handler and borrowed guard immediately before async unregister completes. | PASS;1 route registration,1 unregister,0 mutation effects; captured handler remainsclosed after await. |

The private guard performs a synchronous bridge/peer/signal/lifetime check; I05 and I07 show its captured invocation survives an await. These tests do **not** inspect or execute the continuing normal composer, a real locked core permission callback, source/catalog/persistence await chain or native effect. They establish the module primitive only. Every real wrapper must still use this exact invocation closure, original CAS/auth/grant/current-source predicates and the established effect linearization. JSON flags, successful shape parsing, native ID labels and transport success never replace those facts.

The late guard intentionally narrows the success response after a committed typed effect. A rejected response is not rollback, zero-effect proof or permission to retry. Conversely, I05 loss-first produces0 typed effects. The unchanged legacy test still returns `{ok:true,value:'original'}` after an admitted abort; there is no unconditional final fence applied to all existing operations.

## Exact commands, first evidence and source preservation

Commands ran once each under the established sanitized environment and Node22.22.2 on macOS27.0 arm64:

```text
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/operator-invocation-adversarial.test.mjs > docs/evidence/NI2/transport-independent-first.tap 2>&1
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --test test/operator-invocation.test.mjs test/operator-bridge.test.mjs > docs/evidence/NI2/transport-independent-authored-legacy.tap 2>&1
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin /opt/homebrew/bin/node --check test/operator-invocation-adversarial.test.mjs > docs/evidence/NI2/transport-independent-syntax.txt 2>&1
```

| Raw evidence | Result | SHA256 |
| --- | --- | --- |
| [First and final independent TAP](transport-independent-first.tap) | 75/75 PASS;15 top-level+60 nested;0fail/skip/cancel/TODO;136.72025ms;exit0. No repaired source or repeated independent run. | `115e543e1b688b78b78fa7b4a12e26d0d1e2f189f590c110a6c098e0786d909c` |
| [Unchanged author+legacy TAP](transport-independent-authored-legacy.tap) | 12/12 PASS;0fail/skip/cancel/TODO;108.354166ms;exit0. Author8+legacy4; both original file bytes unchanged. | `8fe0f79384998aefd7a7d81309a3098a795d40394a6d190467983b78e701b7b2` |
| [Syntax output](transport-independent-syntax.txt) | exit0, empty output. | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The complete independent source before execution is [first-test.mjs.txt](transport-independent-first-test.mjs.txt); [first-source.json](transport-independent-first-source.json) records its exact hash. It is byte-identical to the held executable. Source before/after metadata and raw evidence distinguish this functional execution from the frozen docs' NOT-RUN status and author-first12. No old test/design/source/helper/schema/client/package/profile was edited. No failed CODE/core-corruption or browser experiment was attempted. There was no denied runtime-policy action to bypass.

## Individual retained AC contribution and residual gates

All28 source criteria in the [frozen transport design](transport-invocation-test-addendum.md) remain individually retained. Observed T contributions below do not accept a whole criterion, substitute counter doubles for real D/N/P facts, or change the root82 original+5 current-chat register. The base NI2's45 retained rows and resumed-work obligations remain unchanged.

| Retained source criterion | Observed typed contribution | Remaining actual oracle |
| --- | --- | --- |
| BUB002-02 | I01/I05 captured input and late authority closure. | Actual task/source/CAS after native/source await. |
| BUB002-03 | I05 loss-first0 typed effect; I10 commit-first retained typed receipt. | Durable cancel/stop/unknown linearization. |
| BUB004-04 | I10 response loss does not undo typed commit. | Actual committed output/effect, stopped/drained settlement. |
| BUB004-05 | I07/I08 old invocation cannot borrow replacement lifetime. | Native event/feed reconnect and durable reconciliation. |
| BUB005-02 | I05 final captured guard narrows typed effect. | Original exact worker/message permission and grant. |
| BUB005-03 | I10 no automatic transport replay. | Durable dedup/outbox/unknown outcomes. |
| BUB005-05 | I06/I10 response and typed effect facts remain distinct. | Actual accepted/claimed/committed/consumed native facts. |
| BUB006-01 | I01–I04/I07–I09 exact private shape/peer and isolated guard closures. | Original authenticated native OperatorPeer/admission/owner scope. |
| BUB006-02 | I05/I06 current bridge authority checked after await/before typed effect/response. | Exact task/auth/CAS/data/expiry/revoke and real native predicates. |
| BUB006-03 | I02/I11 0 hostile callable/trap execution and bounded secret-safe failures. | Full native log/export/memory/recipient registered-secret scans. |
| BUB006-04 | I01 immutable original typed input; payload proof cannot replace context. | Necessary actual provider/recipient input and full source binding. |
| BUB006-05 | I03–I05 authority denial stops typed effect; I10 fresh guarded read. | Host permission/unknown/role-bound actual reads and effects. |
| BUB008-05 | I05 synchronous captured guard survives typed await. | Latest source/catalog/context/ledger at native effect. |
| BUB011-04 | I02/I03/I06 caller authority flags have no bridge privilege. | Actual environment/handoff/login currentness, not JSON proof. |
| BUB011-05 | I05/I08 drift/disposal refuses old typed invocation. | Environment/native disconnect and durable unknown holds. |
| BUB012-03 | I10 rejected reply creates0 automatic extra typed commit. | Real cumulative attempts/charges/held reservations. |
| BUB012-05 | I12–I14 unchanged input bounds and numeric separation; I15 no typed boot mutation. | Global resource/cache/queue/native load/growth oracles. |
| BUB003-01 | I10 typed retained receipt and explicit fresh read order. | Encrypted durable retained result/restart. |
| BUB003-02 | I01/I05 immutable capture and final typed guard. | Real atomic CAS/auth permission and signed receipt. |
| BUB003-03 | I10/I11 typed retention/redaction after response loss/error. | Real IO/crypto/storage failure and preservation. |
| BUB014-02 | I06/I10 explicit response loss/readback distinction. | Rendered controls/current state and native UI. |
| BUB014-03 | I07 separate simultaneous guarded invocations. | Real client late replies/double clicks/uncertain operations. |
| BUB001-02 | I08/I15 old typed handler/guard closes immediately. | Exact native owned Loader reload cycles. |
| BUB001-04 | I08/I10 typed replacement/unknown response distinction. | Original full host quit/restart; no instant ancestor cancellation promise. |
| BUB016-01 | Exact source/test/design/runtime hashes and raw first run retained. | Overall independent CODE/complete agreed evidence. |
| BUB016-02 | Isolated tested guard primitive; no normal-installed claim. | Real normal user execution and full product acceptance. |
| BUB016-03 | Typed loss/concurrency/replacement orders explicitly distinguished. | Actual crash/race/native/restart matrix. |
| BUB016-04 | No package or release action in this lease. | Physical packaged original native installation, final gates and release authorization. |

N2T-04's actual final core callback, N2T-08's durable committed facts and N2T-11's native authenticated carrier/package/lifecycle are **NOT RUN in this unit**. The continuing NI2 normal wrappers must be tested after their own source hold; their correct use is not implied by these primitive passes. Resume, physical CLI/profile/native lifecycle, provider/account/model usefulness, final CODE, supported browser/rendering and full MVP/release remain HOLD. Live chat platforms/accounts remain out of this phase, neither passed nor failed.

The new independent source/evidence are now **HELD** under [transport-independent.sha256](transport-independent.sha256). Root may commit this bounded functional unit and release the held bridge dependencies for later normal integration. Later source changes require a new scoped evidence checkpoint. This report supplies no replacement final CODE verdict.
