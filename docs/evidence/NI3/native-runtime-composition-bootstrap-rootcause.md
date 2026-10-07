# NI3 composition bootstrap root cause: CB01

The unchanged MB01 runtime has a mandatory synchronous registration denial: its first `NativeContributions.register()` calls the supplied `assertOwnerCurrent`, whose private registration branch calls `assertAlive()` before the original Cordis plugin becomes active. Cordis runs that callback in `LOADING=1`; `assertAlive()` requires `ACTIVE=2`. This source path throws `SERVICE_DISPOSED`, which the installation catch replaces with the observed `RUNTIME_ADAPTER_INVALID`.

Confidence is **high from source**, with a material limit: the preserved output reports only the outer catch. This lane did not reproduce, instrument, instantiate, import, parse, or execute anything. The inner exception and exact point are source-derived, not a captured inner stack. No full bootstrap or chain pass is claimed.

## Preserved observed run

Root applied the exact MB01 literal proposal `89291a8074b5a95152cc510098f3ff064768e6542770b0b3e1239241454fd81a` and froze a new execution closure. The failed run used `.runtime/ni3-native-runtime/src/runtime-plugin.mjs` SHA-256 `8e1d2a2fed33545e86be76fc6b566eebde1bb9ae0b3a9abcb25593891e3b73fc` (54,803 bytes). Its closure is `.runtime/ni3-native-runtime/root-bootstrap-execution-closure.json`, SHA-256 `934da575dd2de08364b7adb3b58480506e924aac1f8ff902dcd7131daced4f66`.

Root's preserved commands are:

| Command | Observed result | Scope |
| --- | --- | --- |
| 1: changed-runtime parser | PASS, exit 0 | Root executed the existing runtime source parser. |
| 2: existing original-chain fixture | 0 PASS / 1 FAIL, exit 1 | `RUNTIME_ADAPTER_INVALID`; stopped at the first nonzero result. |

The [raw output](native-runtime-bootstrap-execution/command-02.stdout.txt) (2,146 bytes, SHA-256 `95251c99169c6cf7e76b7cd37b531097675ad7aea8d303f966570117a8d232ba`) records the catch at runtime-plugin line 265, inside runtime installation at original fixture line 33. Stderr is empty, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. The original fixture waits for installation before the first task RPC at line 36 and before the test's worker catalog at line 68. The failure therefore precedes its native worker, model, and agent operations.

Attribution pins: [freeze](native-runtime-bootstrap-execution/root-execution-freeze.json) `39f39c57b3c61589fbc00ad5a656d6b683899f61999c9e967954196cacd9aff4`; [command results](native-runtime-bootstrap-execution/command-results.json) `16c3227d7f3ad245a8e3cf671fd0cdefbf2ecf569a12a2b65f8483115be6a55b`; [root postverification](native-runtime-bootstrap-execution/root-result-verification.json) `08deaba788a2b8f41368aa53e5ad224d733fa3fb433eb47bd2fe768eae3dedd1`. Root records 102 inputs, 27,577 original public files, 12 links, and 4 stream files verified with no input or public changes. This lane checked the relevant file hashes, not the whole graph.

The earlier directory 7 PASS and disabled lifecycle 1 PASS remain their own preserved evidence. The earlier `MEMORY_UNAVAILABLE` failure remains in [the memory report](native-runtime-bootstrap-memory-rootcause.md); it is absent from the new top stack. That change in failure point establishes neither a complete memory bootstrap pass nor full native acceptance. The original directory failure and first frozen closure `fec01c4266695214f72710defcfa9d173839c9d41d471fa94a35d15cd0f6cb4f` remain historical and unchanged.

## Exact synchronous source path

| Source | Installation behavior |
| --- | --- |
| Original fixture 22/33 | `ctx.plugin(...)` then `await fiber`; only after it completes does the fixture require state 2. No early-active fixture assumption needs weakening. |
| Genuine Cordis 1335–1356/1364 | `_setEpoch` sets state 1; `_reload` calls `_execute` while loading; state updates after the callback completes. The published enum defines LOADING=1 and ACTIVE=2. |
| Genuine Cordis 1054/1066–1071 | The callback receives the authentic child from `parent.extend({fiber:this})`; the constructor path in the preserved stack is a normal public plugin invocation. |
| Runtime 75/91–95 | The original effect runs synchronously. `alive` requires state 2, and `checkOwner` adds sealing and original installed invocation currentness. These operational guards are correct after installation. |
| Worker installer 47–58 | It validates the exact API, builds an initial status, and calls `isAlive` once. Loading produces `actionsEnabled=false`; this boolean is not a thrown error. |
| Runtime 226/227 | The audit native source registers one original `ctx.on('llm/stream', ...)` callback and verifies its disposer. The phases constructor only captures its check callback; it does not invoke it. |
| Audit installer 77–88 | Exact API/function checks pass for the supplied literal source closures. It creates status and captures its check callback, without calling it at construction. |
| Runtime 246/247 | It opens the private registration window, constructs `NativeContributions`, and supplies `assertOwnerCurrent`. In that window the callback calls `assertAlive()`. |
| NativeContributions 19–23 | Constructor validates/captures three synchronous callbacks. It invokes none. Its worker/hook field initializers also create closures rather than executing them. |
| Runtime 251/254; NativeContributions 24–34 | The fixed loop first registers producer, then audit. Each `register()` begins with `#current()`, which immediately calls `assertOwnerCurrent`. First producer registration encounters state 1, so the old callback throws `SERVICE_DISPOSED`. The audit registration and preview constructor are not reached along this source path. |
| Runtime 265 | The existing catch seals installation and emits only stable `RUNTIME_ADAPTER_INVALID`; this is the preserved outer stack. |

The genuine public Cordis context distinction also matters. Its root constructor returns a proxy (1681/1690), but plugin callbacks receive `extend()`'s `Object.create(...)` child with its own fiber (1054/1704–1709). That child is an ordinary object inheriting the host context. Thus the audit installer's `types.isProxy(api.ctx)` check at line 82 does not reject this actual child; substituting a root proxy or a handmade context would not reproduce the original contract. No context validation change is proposed.

`ctx.on()` at Cordis 371–379 calls `fiber.assertActive()`, whose original contract at 1131–1133 requires a non-null UID rather than state 2. Its registration effect at 335–344 is allowed during loading by `effect()` at 1169–1171, which rejects a disposed UID or unloading state. This confirms the original host supports synchronous source composition during loading. It does not permit model requests or owner task operations while loading.

`ApprovalPreview`'s constructor at 23–28 validates its methods, callback shapes, TTL, and secrets, then captures callbacks. It does not call `isAlive`, `readAuditInput`, or a store method. Although not reached by the current registration failure, no immediate active-state requirement in that constructor justifies a broader readiness change.

## Literal repair and bounds

The separate [literal proposal](../../../.runtime/ni3-runtime-composition-bootstrap-proposal/literal-composition-bootstrap.patch) has SHA-256 `f8fe30b4059ddc8bce36adb160ba8a3284507c4944f196c1b93322dbe95a11c2`. It contains one target file, two hunks, two added/two removed lines:

1. Replace only `assertAlive()` inside the existing private `registrationOpen` branch with a check for `active`, unsealed installation, original state 1, and non-null original fiber UID. Outside that branch retain `return checkOwner()` exactly.
2. Close `registrationOpen` in the existing catch before sealing and emitting the same stable code. The normal close at line 260 remains.

There is no new callback, Cordis effect, cleanup callback, store operation, source role, memory binding, listener, or grant. The original registration loop bounds the window to one producer registration plus one audit registration when enabled. The constructor and registration validation read only source-created, getter-free function records; they invoke no registered matcher, environment, tool, native hook, task reader, or claim verifier. No untrusted caller or reentrant operational callback runs in that private interval. `NativeContributions` keeps its original maximum of two contributions, duplicate rejection, not-started guard, exact shapes, synchronous function checks, and closure freezing.

Count scope is the synchronous installation sequence before the first registration failure, plus the two-line repair's registration interval; it is not a count of every effect in the already installed host:

| Callback/effect | Existing failed source path | Proposed enabled-audit registration path |
| --- | --- | --- |
| `NativeContributions` constructor | 1 invocation; 0 supplied callbacks | 1 invocation; 0 supplied callbacks |
| `register` / supplied owner callback | 1 attempted producer register / 1 call, then throw | Exactly 2 registers / 2 calls; exactly 1 each when audit disabled |
| `readCurrentTask`, `verifyClaimBinding`, matchers, environments, tool guard, native hooks | 0 invocations during registration | 0 invocations during registration |
| Public store operations, native adapter/manager creation, agent/model/provider operations in the registration interval | 0 | 0 |
| Worker/audit installer source closures | 1 each before registration | No additional call |
| Worker initial `isAlive` status read | 1 false boolean | Unchanged; no readiness grant |
| Internal worker/audit subscription registrations / handler calls before failure | 2 registrations / 0 handler calls | Unchanged |
| Audit native-source `ctx.on` registration / stream handler calls before failure | 1 registration / 0 handler calls | Unchanged; original framework registers 1 disposer effect |
| Runtime main `ctx.effect` / yielded cleanup | 1 effect / 1 collected cleanup | Unchanged; no new effect or cleanup callback |
| Additional callbacks/effects/store calls introduced by CB01 | 0 / 0 / 0 | 0 / 0 / 0 |

All counts inside the masked path are source-derived. Later cleanup and host-wide event dispatch are outside this count. The proposal preserves `alive`, `assertAlive`, `installedAlive`, `checkOwner`, all original owner/coordinator/host handles, public store authorization, request currentness, and MB01. After window closure every contribution currentness route uses the same strict `checkOwner`; registration readiness cannot admit plans, grants, native work, or provider requests. The catch keeps its redaction and does not expose an inner diagnostic payload.

## Deliverables and remaining status

[Validation designs](../../../.runtime/ni3-runtime-composition-bootstrap-proposal/proposed-cases.md) SHA-256 `c564d3b19835a8a25f614efe1d1b45463b5e69d5f2ddf555318509b82caab1a4` provide five finite cases, all **NOT_RUN**: exact patch/source review; root-only parser and existing affected chain after a new freeze; 1/2 registration counts; loading-window denial/exception partitions; unchanged later currentness. No executable fixture or instrumentation was added.

Relevant unchanged pins are recorded in [the JSON report](native-runtime-composition-bootstrap-rootcause.json): runtime/plugin fixture; contribution dispatcher; worker/audit constructors; audit native source/phases; preview constructor; genuine Cordis implementation/enum. The shared original `src/runtime-plugin.mjs` remains `30c8e1c0aee9d495563d19eb4b71357198912ea472b6b61201168079b7885fb2`.

The two earlier reports retain exact byte attribution: first root cause Markdown/JSON `0ec89b912993d7c99d26acfeb118ff465cddcc42898c0ea9bd87f12557429553` / `cb38bfe617297ada861e1cf23649dc0d090a797df13820482915e2ca83876248`; memory root cause Markdown/JSON `1b388e2657165e91e1db53afb291c36b039445979f91f6b2ab3c1f95a68b1268` / `bb51eafee63c5b609239d6bff5089faf969fcb80ff7c940f655e53c6a9cd14c7`. Their literal proposals, executed closures, raw failures, and passing history were not changed by this lane.

Root alone may inspect, apply, refreeze, and authorize the bounded retest. CB01 is proposed, not applied or runtime-validated. This lane performed only text reads, file hashing, and writes to these new report/proposal files. No runtime/fixture execution, source edit, parser, import, instantiation, instrumentation, Git, network, profile, database/row access, provider call, iterator/listener execution, receipt/envelope investigation, original blocked CODE work, or manual QA occurred. Broader bootstrap/native acceptance remains held.
