# NI3 composition bootstrap proposal: CB01

Status: literal source proposal only; all validation below is **NOT_RUN**. Root alone may archive, apply, refreeze, and authorize execution. This lane did not apply the patch, parse it, instantiate a host, import source, run tests, or create an executable fixture.

Apply target for a later root decision: `src/runtime-plugin.mjs` inside the isolated NI3 runtime, whose unchanged base is SHA-256 `8e1d2a2fed33545e86be76fc6b566eebde1bb9ae0b3a9abcb25593891e3b73fc` (54,803 bytes). The two-line repair retains MB01 exactly. It changes neither the shared `src/runtime-plugin.mjs` nor any frozen closure/evidence.

The current original-chain output has one failure, `RUNTIME_ADAPTER_INVALID`, in the synchronous installation catch. The source-derived inner cause is the first producer contribution registration calling `assertAlive()` while the genuine Cordis callback is `LOADING=1`. The audit registration is not reached along that path. No full bootstrap or chain pass is established.

The existing private `registrationOpen` window surrounds only the constructor and the fixed producer/audit registration loop. The proposed predicate accepts an active, unsealed original fiber with non-null UID in state 1 only inside that window. The normal `registrationOpen=false` assignment remains; the existing redacted catch also closes it. After closure, the same callback uses the unchanged `checkOwner()`, including active state 2, sealing, and original invocation checks.

Finite validation designs, each with status **NOT_RUN**:

| ID | Bounded design | Required oracle |
| --- | --- | --- |
| CB-V01 | Source review of the exact two-line patch against the pinned base and genuine Cordis lifecycle. | One target file; two added/two removed lines; no new callback/effect/store call. `alive`, `assertAlive`, `installedAlive`, `checkOwner`, MB01, original role handles, all public store methods, invocation checks, and outer stable error remain unchanged. |
| CB-V02 | Root refreezes a separate repaired closure, then runs only the changed-runtime parser and the existing original-chain test once, sequentially, stopping at the first nonzero result. | Preserve current parse PASS/chain 1 FAIL and earlier directory 7 PASS/lifecycle 1 PASS; retain original fixture bytes. The fixture must cross its existing awaited runtime installation at line 33. Any later failure remains a new bounded first failure. A full chain or bootstrap pass requires its own actual output. |
| CB-V03 | Review the fixed registration path with audit enabled and disabled. | `NativeContributions` construction calls zero supplied callbacks. Each `register` calls its owner callback once: exactly 2 planned calls with audit, 1 without audit. Its 2-contribution cap, not-started requirement, duplicate rejection, exact shapes, synchronous functions, and closure freezing remain unchanged. No task, claim, matcher, environment, tool, or native hook runs during registration. |
| CB-V04 | Review the private-window denial partitions and exceptional exit. | During registration, `active=false`, `installedSealed=true`, `uid=null`, and states 0/2/3/4/5 refuse with `SERVICE_DISPOSED`, then the outer stable `RUNTIME_ADAPTER_INVALID`. A thrown constructor/registration error closes the window and seals installation. No hidden exception payload is emitted. |
| CB-V05 | Review every later contribution route after the private window closes. | The supplied owner callback still calls `checkOwner()`; loading/disposed/sealed or missing/stale/wrong native invocation refuses through the original checks. Source-private registration readiness cannot authorize plans, grants, native composition, environment binding, claims, agent creation, execution, tools, or provider requests. |

The only possible registration callbacks are those reached by the fixed source loop; neither constructor nor registration exposes a reentrant caller or invokes the registered closures. The repair adds no loading-ready service or grant. It creates no extra receipt, listener, cleanup callback, arbitrary finalizer, backend effect, role, or memory binding. Existing effect ownership and cleanup remain original.

Only source confidence is claimed. The outer catch hides the inner exception; this lane did not instrument or reproduce it. All parser/runtime/fixture executions, broader native acceptance, original blocked CODE work, and manual QA remain outside this proposal's completed work.
