# Independent onboarding client test review

**PASS for the held typed client/module boundary; native setup/storage, actual installed profile and visual acceptance remain pending.** Reviewer `/root/istqb_review`, Sol6.1/max, independent from `/root/onboarding_ui`. This is mandatory ISTQB testing under the separately authorized normal-install continuation. It does not replace or reroute final CODE, which remains blocked.

The design was [published before author implementation](installation-test-design.md), SHA256 `5321fdc7898780972ba3b9d1a5f59fd4b2819b98aec30b8155c7084fa0f1b127`, committed by root at `334fabc`. Read contract SHA256 `f61ea745b6ae9080f9d9f12bdbbcf27ff5235d5278fcfce41827e40af7aa6fcd`. Author held five-entry [manifest](onboarding-client-author.sha256) matched before/after execution. Source `53ddcb8490c8c4c41d30fdd0c9fadd5aeb5debaba6e0bb2d1e3e8b8d639dca7c`; emitted bundle `689431cdc0415e1201377968b13feac6a66d581e427d3bb12ceb46afffbc178f`; author test `efcf8860ca9caf2571137124ded830c887b765f5d62a62e02e8d177056bc53e0`. Root committed this held UI at `6d648e9`. No production or author file was edited by this reviewer.

The new [independent test](../../../test/onboarding-client-adversarial.test.mjs), SHA256 `43f08520d714f3058d77ce10072a127cd0e919e569f65fe20ef533d0564946d7`, evaluates13scenario families against both the source factory and its actual generated lazy-module factory. It uses typed RPC facades and synthetic React trees in the same JavaScript realm. No native HostConnection/authentication, DOM/browser, filesystem setup, encrypted store, listener/HTTP, provider/model/tool/recipient or persistent user configuration is exercised. A fake `ready` acknowledgement is a client-state vector only and does not establish a real initialized database.

## Exact commands and results

```sh
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test test/onboarding-client-adversarial.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node --test test/onboarding-client.test.mjs test/onboarding-client-adversarial.test.mjs
env -i PATH=/opt/homebrew/bin:/usr/bin:/bin node scripts/build-client.mjs --check
node --check test/onboarding-client-adversarial.test.mjs
```

First independent run: **26/26 PASS,0fail/skip/cancelled,148.748125ms,exit0**. [Original raw output](onboarding-client-istqb-first.tap), SHA256 `923540810d77d43098b95060c7fa2813fda3ff8600352e7c2067fb38f2b736cd`. The combined46case run reruns the author's20setup tests plus these26independent source/bundle cases; exit0, all46PASS. [Exact results JSON](onboarding-client-istqb-results.json) and [combined raw TAP](onboarding-client-istqb-final.tap) provide duration/hash/counters. Build `--check` and independent test syntax both exit0. The author83case affected client batch is [author-reported evidence](onboarding-client-author.md), not newly independent design or an independently rerun83suite here. There was no failing first independent assertion or remediation on this held UI unit.

## Expected versus actual

| Design contribution | Expected oracle | Actual independent observation |
| --- | --- | --- |
| UISET-01/07/08 closed location output | Bounded well-formed absolute public location; no unchecked action |4095/4096UTF8-byte locations accepted,4097rejected; relative/empty/control/DEL/unpaired surrogate variants rejected; valid emoji/Chinese roundtrip accepted. Confirmation calls0 for every location vector. This4096display bound is not the server's1024path contract. |
| UISET-01/06/07 closed RPC envelope | Invalid shapes/errors cannot render raw fields or supply route fallback |13malformed envelope shapes (including accessor/nonenumerable/symbol/prototype/unknown-field) rejected, getter calls0. Three structured error vectors retained only allowlisted code; secret message/details/code not published; embedded404-shaped error code cannot establish transport route absence. |
| UISET-02/07 immutable displayed decision | Raw reply mutation cannot change the accepted outgoing exact plan | Status/preview/description copied to frozen primitive snapshots; changing original objects or attempted snapshot mutation left displayed plan unchanged; exact outgoing preview/digest/accepttrue retained. |
| UISET-02/04/08 delayed preparation clock | Freshness checked after await, within response-time60000ms bound | Response expiry deltas-1/0/60001refused;1/60000accepted without automatic confirm. Invalid negative/fraction/NaN/infinity/unsafe-number/string clock partitions disabled local consent. Server remains expiry authority. |
| UISET-05 committed fact after local expiry | A known accepted server acknowledgement remains fact even when the local preview expires during transport | One dispatched confirm; delayed ready receipt after local expiry published ready/executionfalse. No repeated confirmation or unnecessary status read inferred from local expiry. This establishes response semantics, not native commit. |
| UISET-03/05/08 known nonready receipt | Recovery/unavailable/setup-required must not infer success or replay | Each acknowledged nonready phase returnedfalse, cleared preview/acceptance, and subsequent confirm sent0extra calls. |
| UISET-04/05 uncertain readback then disconnect | Status-only reconciliation; delayed ready must not overwrite disconnected generation | One confirm plus status readback, disconnect aborts/stales it, late ready ignored; final offline/no checked plan/no retry. Secret exception absent from snapshot/typed render. |
| UISET-02/04 changed generation/target | Previously checked plan and late prior prepare cannot enter the current generation | Disconnect/new status invalidated current plan; late different-target prepare discarded by reference/revision fence; confirmation calls0. |
| UISET-04/08 previous ready then operator failure | Original task UI cannot remain usable on stale setup authority | Auth-like setup failure after ready removed usable task UI; old task model stale; no confirmation. Read state and authority remain distinct. |
| UISET-04/06 delayed advanced list vs newer setup-required | An old successful task list cannot bypass the current setup phase | Exact route404 caused one advanced read; new setup-required status superseded it; late list completion left current setup unchanged and task UI blocked. |
| UISET-06 advanced fallback second gate | Exact pinned404 plus a structurally successful fresh original list required | Null/object/invalid-task/error list outputs each blocked normal task view, while the route-missing fact stayed identified; one readonly list, no setup confirmation. Author separately tested near-match/auth/network/403/500 status errors and positive empty list. |
| UISET-03/04 own synchronous fence | Closing/resetting/refreshing during pending-publication cannot dispatch a stale confirm | Synchronous dispose/disconnect/refresh listener variants each confirmation calls0. No unsupported parent instant-cancellation premise. |
| UISET-07 stable callback errors/reason output | No arbitrary callback prose/getter/private token in UI state | Thrown canary Error/plain-message/accessor-error and malformed reason/hidden/symbol status vectors projected safe errors; error getter calls0, no canary in snapshot or typed render. |

Every family above executes identically for source and generated bundle. Node's26count represents13families twice; loop vectors within each family are not mislabeled as26new AC. The lazy bundle registers one expected `dsh-fishball` module and imports only supplied host React when materialized. Mock `useEffect` does not install a timer or validate visual behavior.

The author's rerun20cases supplement mount/reconnect status-only behavior, explicit checkbox/separate button, one pending confirm, exact expiry/supersession/rollback, unload/abort, direct old-handler rejection, uncertain reconciliation, closed reply fields and exact404signature. Original `createModel`/Panel compatibility and63existing client/build/feature tests remain author evidence; the independent26file adds no implementation edits or weakened original assertion.

## Source AC and remaining oracles

| Retained AC | This unit's contribution | Required remaining level |
| --- | --- | --- |
| BUB001-01/02/03/04/05 | Packaged lazy native client metadata/source compatibility and own client-disposal fencing | Actual installed original native carrier/load/ten reloads/full CLI quit/restart are root/server gates. No browser/window-close/other platform inheritance. |
| BUB003-01/02/03/04/05 | Unknown confirmation/readback semantics, stale snapshot isolation and no automatic replay | Real private namespace/key/metadata/SQLite publication, two-process/crash/IO/sidecar preservation and encrypted reopen remain server tests. No export/deletion/retention acceptance from UI facades. |
| BUB006-01 | UI cannot acquire authority from output labels/structured errors | Actual native admitted owner/profile/origin/role/foreign-peer rejection required server-side; a disabled button is not an authorization check. |
| BUB006-02 | Exact displayed refs/digest/literal acceptance, fresh local clock, pending/reconnect/late-result fences | Actual one-use native preview with peer/profile/expiry/current-state commit CAS remains required. Setup consent grants no model/tool/event/recipient authority. |
| BUB006-03 | Closed safe projection of synthetic canary fields/errors and immutable snapshots | Scan actual RPC/log/key/setup/database/export surfaces using private synthetic files; owner/native real credentials not inspected. |
| BUB006-04/05 | Outgoing confirmation contains only exact refs/digest/acceptance, default executionfalse displayed | No actual external send, policy adapter, provider, key custody or native action admission tested; server default-deny composition required. |
| BUB014-01/02/03/05 | Accurate phase/control/readback, no double/stale dispatch/inferred success, credential-free exact plan | Native real service/source freshness and navigation remain existing/server integration gates. |
| BUB014-04 | None; typed elements only | **Actual official UI resize/Chinese/keyboard/focus/render/accessibility NOT RUN/HOLD.** No browser workaround or owner QA substitution. |
| BUB016-01..06 | Exact design/source/bundle/commands/results traceability and private preview/MIT unchanged | Full independent CODE still blocked, whole useful model/product functional/browser/install/retention gates pending; no MVP/publication/stable claim. Live chat platforms OUT by amendment, provider-neutral tests retained. |

The original frozen installation matrix remains unchanged. The [separate API/boundary addendum](installation-test-design-addendum.md) records later server path/ownership/lifetime clarifications without rewriting its issuance/hash. The client review is held for this exact5entry source manifest; further finding-driven fixes require preserved first evidence and fresh retest. The [independent evidence manifest](onboarding-client-istqb.sha256) records this new test/raw/results/review. No unresolved client-module finding remains, and no final CODE/browser/server-initialization acceptance is supplied.
