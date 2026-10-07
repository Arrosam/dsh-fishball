# NI3 runtime memory bootstrap: source-only root cause

Date: 2026-10-07. Author: `/root/ni3_runtime_failure_rootcause`. Status: **SOURCE_REVIEW_COMPLETE; NO_REPAIR_OR_EXECUTION_BY_THIS_LANE**. Root alone owns source application, refreeze, and exact bounded execution GO. This report attributes the failure to the preserved `eb66e4...` run, not to any later source or result. The preceding first-failure report, its proposal, all frozen sources, and all original execution evidence are untouched by this lane.

The failure is an installation-phase currentness mismatch. The actual MemoryAdapter constructor requests authentic principal metadata through a facade that requires the plugin to be fully active. Original Cordis calls the constructor while the plugin is still loading. The coordinator role is valid for this metadata method; it is not the cause of the failure. The proposed repair admits one authentic constructor metadata read within a private synchronous loading window and retains all existing runtime guards.

## Preserved affected-run outcome

The affected source closure is `.runtime/ni3-native-runtime/root-repaired-execution-closure.json`, SHA-256 `eb66e4cda383a05e723269b699e0a826bc68fd47f1c1b7f1f8272db2eb487cd1`. Root's execution freeze is `c8d1b04946f4e805c63551a24b3e4ae3aa27540c307860de30e540fa036bcbfa`. Relevant current source bytes at the initial review matched the preserved affected-run source: runtime-plugin `4bb9aea5130e420cdcb30ae05e555e1dbfdb664543eed9069ef3c52fa973e71d`, directory fixture `a9965e0d45c96da3ccd8fb2e87ded9df08dae05876f23aae8279f182fea2b302`. Findings use those original-run line numbers.

| Root command | Recorded outcome |
| --- | --- |
| 1–2: runtime-plugin and directory fixture parse checks | Both exit 0. |
| 3: original seven-case directory suite | 7 PASS, 0 FAIL. Preserve this outcome. |
| 4: original disabled-audit lifecycle suite | 1 PASS, 0 FAIL. Preserve this outcome. |
| 5: original native chain suite | 1 FAIL, 0 PASS; `MemoryAdapterError`, code/message `MEMORY_UNAVAILABLE`; root stopped at this command. |

The failure is at `MemoryAdapter` construction (`memory.mjs:47`) from `runtime-plugin.mjs:146`, during the runtime install at original fixture line 33. The recorded stack reaches Cordis callback/effect execution and never returns successfully from that install. Worker/audit runtime installation, operator bridge publication, explicit worker/audit operations, and later native chain assertions are not reached. The fixture had already registered its original public host services and local synthetic provider before installing the runtime; that setup is distinct from executing a native/model stream. This report makes no claims about later chain behavior or the planned four streams.

Raw command-05 stdout is 2,539 bytes, SHA-256 `7df659031380e5840d04419d71f9ee3c0d1d1f28ca70548bb42443dc628d8ed9`; stderr is empty, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Command-results SHA-256 is `5900f43b033558562c03b21dedfd9c868c332d8f9728c14f8a2ee9e9a3349ca4`. No repro or retry occurred in this lane.

## Exact causal path

1. `createRuntimePlugin.apply` registers its original effect at runtime-plugin line 75. It creates and registers the actual owner/coordinator/host principals at lines 76 and 84–86. The `active` flag starts true at line 89.
2. Its general `alive()` at line 91 requires **active=true, fiber state 2, and non-null UID**. `assertAlive()` at line 92 throws `BootstrapError('SERVICE_DISPOSED')` otherwise. `checkOwner()` at line 95 retains that active gate and the original invocation-carrier check.
3. The persistent `projectionStore` wrapper at lines 141–145 forwards methods to the one original RuntimeStore. Outside context preparation, line 143 calls `assertAlive()` before forwarding; in preparation it calls `checkOwner()` before and after the original method. No method is forwarded before the appropriate guard.
4. The actual `ContextAssembler` constructor is evaluated at line 147. Its source (`context.mjs:133–139`) validates method/function availability and limits and stores references. It does not call those store methods. The raw stack instead identifies the subsequent MemoryAdapter binding read at line 47.
5. `MemoryAdapter` validates options and method availability at lines 43–46, then immediately executes `guarded(() => store.memoryBinding(handle))` at line 47. Its handle is the actual registered coordinator handle. It has no `isAlive` constructor option; the currentness gate comes from the supplied facade.
6. The facade sees no context-preparation carrier during installation, calls `assertAlive()`, and throws before the original `memoryBinding` method is reached. The plugin fiber is **LOADING=1**, not ACTIVE=2, during this original callback/effect.
7. `MemoryAdapter.guarded` at line 38 preserves known safe codes but has no `SERVICE_DISPOSED` entry in `SAFE_CODES` (line 37). The bootstrap guard's error therefore becomes `MemoryAdapterError('MEMORY_UNAVAILABLE')`, matching raw output. This error mapping explains the visible code; changing that mapping alone would not make installation succeed.

This is a source-confirmed composition defect, not a need to loosen runtime owner currentness. The preserved genuine original runtime (`original/runtime-plugin.mjs:123–124`, SHA-256 `30c8e1c0aee9d495563d19eb4b71357198912ea472b6b61201168079b7885fb2`) handed the actual original store to both constructors. The new projection facade added an active-only precondition to a constructor-time principal metadata read. The original MemoryAdapter constructor and store metadata contract are unchanged.

## Genuine Cordis lifecycle and public role contracts

Original Cordis source is SHA-256 `6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e`; its fiber declarations are `eec0d229849c8a293ede90cc2b107c54262db28acfdcdf9181cfec5cd1d0a7d4`.

| Original contract | Source consequence |
| --- | --- |
| `fiber.d.ts:60–73` | LOADING=1 means the plugin callback is running; ACTIVE=2 means loaded/providing. PENDING=0, FAILED=3, DISPOSED=4, UNLOADING=5 are separate states. |
| `cordis/lib/index.js:1335–1356` | `_setEpoch` starts `_reload()` and sets state 1. After an asynchronous boundary, `_reload` invokes the original callback while that state remains loading. |
| `cordis/lib/index.js:1066–1071,1142–1153` | Original callback invocation and synchronous effect iterator execution run the plugin body and its yielded effect registration before loading completes. |
| `cordis/lib/index.js:1364–1370,1288–1292` | The state is updated after callback execution; a successful active epoch resolves to state 2. Requiring that state inside the callback is circular. |
| `cordis/lib/index.js:1012,1078,1131–1133` | UID is a lifetime marker and becomes null on original disposal. Original `assertActive` admits a live non-null-UID fiber during installation; this does not mean product operations should use loading as ready. |
| `runtime-store.mjs:1368–1372` (exact `1742b0...` store) | `memoryBinding` calls original `#ctx` with allowed roles `['owner','coordinator','host']` and returns authenticated owner/workspace/role metadata. Coordinator is valid. The method and role check remain unchanged. |
| `MemoryAdapter:48–54,59–61` | The adapter validates the returned metadata, permits those same three roles, freezes its original binding, and later re-reads metadata through the persistent facade to check scope/role currentness. No synthetic binding is needed. |

`UNAUTHORIZED` is already a safe code at memory line 37. A role rejection would therefore remain `UNAUTHORIZED` through `guarded`, rather than explaining this `MEMORY_UNAVAILABLE`. The loading-state facade failure is consistent with both the raw stack and exact original role contract. This review does not extend to other memory methods' data/row/receipt semantics.

## Literal constructor-only proposal

The new sibling [literal diff](../../../.runtime/ni3-runtime-memory-bootstrap-proposal/literal-memory-bootstrap.patch) targets only the affected-run `src/runtime-plugin.mjs`: **two hunks, 16 added lines and two removed lines**. SHA-256 `89291a8074b5a95152cc510098f3ff064768e6542770b0b3e1239241454fd81a`. This lane did not apply it, instantiate the adapter, or execute the diff. [Finite validation designs](../../../.runtime/ni3-runtime-memory-bootstrap-proposal/proposed-cases.md) are non-runnable, SHA-256 `c06ffd7c10e758fe53ca65367ec527c798e690891b434417694b89cc85fcf6d6`.

The proposal adds two private lexical flags. A construction window is open only around the existing synchronous MemoryAdapter/ContextAssembler initialization and closes in `finally`. In that window, the facade may forward **one `memoryBinding` call only**, in original state 1 with active=true/non-null UID, exactly one argument, and the exact internal coordinator handle. It consumes that read before forwarding, calls the actual original method with its original receiver, and rechecks lifecycle after it returns. Original store principal/scope checks and MemoryAdapter binding validation remain authoritative. A failed original read is not retried; the window closes after success or throw.

All other facade methods, all later `memoryBinding` calls, and ordinary active-state construction follow the existing forwarding path. `alive`, `assertAlive`, `checkOwner`, `preparing.run`, original invocation code, principal registration/role lists, error-code mapping, public inputs, original constructors, and store authority are unchanged. The instance retains the guarded facade; no original raw store is exposed to runtime memory operations. There is no cached/synthetic binding, broad `state===1` readiness, initialization flag on a service/RPC payload, restoration, retry, or late finalizer.

## Bounded callback/effect inventory

| Boundary | Existing/proposed source behavior | Limit |
| --- | --- | --- |
| This source-review lane | Static source/evidence reads and SHA-256 calculations; four new report/proposal files only. | Zero executable runtime/parser/test/build/database/profile/provider/agent/iterator/listener/Git/network calls; zero edits to existing source or first-failure files. |
| Original constructor | ContextAssembler validates availability/configuration without calling store; MemoryAdapter performs one original principal metadata read and validates/freezes it. | Namespace remains a 64-hex ref. Existing adapter limits remain bytes <=262,144 and tokens <=131,072; the original chain fixture selects bytes 65,536/tokens 131,072. No memory data read/mutation is initiated by these constructors. |
| Proposed loading exception | Original `memoryBinding` method only, exact coordinator principal argument, actual non-null-UID LOADING fiber, private synchronous construction window; one-use consumption before call; lifecycle recheck after; `finally` closes window. | At most one original metadata invocation per configured adapter construction. No additional store, profile, task/data method, mutation, stream, agent/session, provider registration, iterator, or cleanup effect is introduced. |
| Runtime currentness | Persistent original facade, fresh MemoryAdapter binding comparison; preparation retains owner-carrier checks before/after forwarding; other methods retain strict active check. | No change. Pending/failed/disposed/unloading states still refuse. A second loading metadata read cannot obtain another bootstrap allowance. |
| Memory absent | The constructor/window block is skipped; existing unavailable behavior and original disabled-lifecycle installation continue. | No new call or effect; recorded directory 7 PASS and lifecycle 1 PASS remain preserved. |

The proposed allowance is limited to trusted installation metadata, not action admission or memory access authority. It does not change any worker/audit selection, source provenance, resource limit, dispatch, inference, grant, or permission contract. Any materialized validation needs independently reviewed sources, a new exact root closure, and separate bounded root GO. A constructor repair can expose a later independent failure; this report does not predict or accept the rest of the chain.

Root must preserve raw affected command 05 and the 7 PASS/1 PASS outcomes and separately own any application/refreeze/retest. No acceptance or repaired-chain success is claimed. This lane did not investigate memory contents, database rows, receipts, result envelopes, CODE, or later chain semantics, and did not rerun/reroute a blocked action. Original port-3080 QA and its installation were untouched by this lane.
