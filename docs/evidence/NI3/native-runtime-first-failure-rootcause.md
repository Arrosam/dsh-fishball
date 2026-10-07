# NI3 native runtime: first-failure source review

Date: 2026-10-07. Author: `/root/ni3_runtime_failure_rootcause`. Status: **SOURCE_ONLY_COMPLETE; ROOT_APPLIED_REPAIRS_SEPARATELY; NO_EXECUTION_BY_THIS_LANE**. Root owns archival, application, source refreeze, and exact bounded execution GO. This review used static source/evidence reads, file SHA-256 calculation, and writes of four new report/proposal files only. It ran no Node parser, import, test, build, database, profile, provider, agent, iterator, listener, Git, or network operation.

The two directory failures are fixture mismatches. Case 5 already refused a disabled provider using a legitimate code excluded by that assertion. Case 6 aliased its expected approved profile to the live mutable profile, unlike the real installed worker. Separately, two runtime-plugin audit input reads still pass an owner principal to an unchanged host-only store method. Those are genuine composition defects left outside the earlier direct-callback repair.

## Exact first outcome

The original reviewed capsule is `.runtime/ni3-native-runtime`, with execution closure SHA-256 `fec01c4266695214f72710defcfa9d173839c9d41d471fa94a35d15cd0f6cb4f`. At the initial static digest check, its relevant files matched both that closure's pins and root's preserved frozen candidate bytes. Findings and line numbers below refer to those original bytes. The original command evidence and preserved frozen candidate have not been altered.

| Existing root evidence | Recorded outcome |
| --- | --- |
| Commands 1–23 in `native-runtime-author-execution/command-results.json` | Exit 0. Client suite: 15 PASS; source suite: 5 PASS; build and build check: exit 0. |
| Command 24: `node --test test/native-runtime-directory.test.mjs` | Exit 1; 7 tests, 5 PASS, 2 FAIL. Root stopped at this command. |
| Case 5 | Assertion failure at fixture line 137: `BootstrapError: WORKER_REQUEST_DENIED`; the supplied `denied` validation predicate returned false. |
| Case 6 | Assertion failure at fixture line 147: missing expected rejection. |
| Commands 25 and 26 | Original lifecycle and original chain suites **NOT_RUN**. The completed syntax checks for those files do not constitute execution of either suite. |

`command-24.stdout.txt` is 3,527 bytes, SHA-256 `94a3d0d264473bd1663653b8d0e813eefe9dc024d561e56c875c0f49f7f63181`; stderr is empty, SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. The command-results digest is `f882631b93ddbd0210b2ecf42c7e930c3a5e3d3d7a83cf15dbbf1f236c9f2f52`; the root execution freeze digest is `dbbdc56100da180698df1a1ff5b77569e9ec28654ec87b90b7d30b9e3a19b62a`.

## Separately applied root repair during report finalization

After the literal proposal was written, a final static check observed two changed capsule files. Root confirmed it had approved and applied this exact `c6e917...` diff after its own 85-input/27,577-public-graph verification and archive (root-reported archive digest prefix `cfba069`). This lane performed none of those mutations or verifications. The original `fec01...` closure remains historical unchanged; its failed first outcome is preserved.

| Source file | Original reviewed/frozen SHA-256 | Separately root-repaired SHA-256 observed by static read |
| --- | --- | --- |
| `src/runtime-plugin.mjs` | `36aab1b8683b97c32d8db72889b06c8c88f7239ea313d2a8f8022c767fd6eae3` | `4bb9aea5130e420cdcb30ae05e555e1dbfdb664543eed9069ef3c52fa973e71d` |
| `test/native-runtime-directory.test.mjs` | `240cc8b8df280076863bcff4a65b2e4f379458072514c02a8b904ce147471ef3` | `a9965e0d45c96da3ccd8fb2e87ded9df08dae05876f23aae8279f182fea2b302` |

Root's new `.runtime/ni3-native-runtime/root-repaired-execution-closure.json` is SHA-256 `eb66e4cda383a05e723269b699e0a826bc68fd47f1c1b7f1f8272db2eb487cd1`, confirmed by a static hash in this lane. It pins the repaired files and records `SOURCE_REPAIRED_PENDING_ROOT_BOUNDED_RETEST_AND_UNRUN_CHAIN`. Root stated its five-command execution had not started at that confirmation. This report contains no repaired-run result; any later execution evidence is separately owned by root and cannot replace the original failed evidence. The companion JSON's `inputPins` attribute the original initially reviewed snapshot; `rootRepairDuringFinalization` records the distinct repaired bytes.

## DIR5: the disabled-provider refusal is the first failing subcase

Fixture lines 131–140 combine backend disposal, provider disposal, and owner revocation. The recorded stack points to **line 137**, after `source.providerEntry.update({ disabled: true })` and Loader settlement at line 136. It does not point to owner revocation. The first backend-rejection assertion at line 134 completed before that failure; its exact accepted error code is not recorded in stdout. The owner fixture creation, revocation, claim refusal, absent-leaf check, and its no-execution oracle at lines 138–140 were **never reached**.

The shared `denied` predicate at line 28 accepts only `WORKER_SOURCE_UNAVAILABLE`, `WORKER_PERSISTENCE_UNSUPPORTED`, and `SERVICE_DISPOSED`. The retained repair facts call `providerBinding.assertCurrent()` at `installed-worker-facts.mjs:211`. The actual provider binding's `boundCurrent()` checks active/invalidated state, original entry/fiber/namespace identity, disabled state, epochs, and pinned source bytes at `testing-provider.mjs:56–63`. Its denial code is deliberately `WORKER_REQUEST_DENIED` (line 12); original disposal invalidates that binding at lines 125–128. Loader's genuine `Entry.update()` merges the option and disposes a disabled entry's fiber at public-source lines 367–375.

`installed-invocation.mjs:42–57` preserves that callback error when the original owner guard remains current: it rechecks the carrier and rethrows, without replaying the callback. The resolver's catch-and-map at facts line 219 applies during resolution, not to a later call of the returned `assertCurrent` closure. There is therefore no source defect requiring the legitimate provider denial to be remapped or bypassed.

The proposed repair changes **only line 137's predicate** to require `error instanceof BootstrapError && error.code === 'WORKER_REQUEST_DENIED'`. The shared predicate and owner-revocation subcase remain byte-for-byte unchanged. A successful call, a different code, or an unauthentic plain error still fails the assertion.

## DIR6: actual and expected profile names share one object

The fixture provides `profile` to original `ctx.profileContext` at line 39, passes the same object as `resolveInstalledWorkerFacts({ profile })` at line 56, and returns it for mutation at line 60. Line 146 mutates that object's `name`. The retained currentness closure compares `activeProfile.name` with `profile.name` at facts line 210; both names now come from the same mutated value. Filesystem facts are unchanged. That explains the missing refusal at line 147.

The source had already frozen a directory identity snapshot at facts line 192. A subsequent resolve using the retained token would compare the freshly observed identity with that original snapshot at line 197. But case 6 stops at line 147, so its refresh refusal assertion at line 148, environment-mode subcase at lines 150–154, and backend-config subcase at lines 155–160 were **never reached**. The first run gives no runtime outcome for those subcases.

The real caller does not alias the expected profile this way. `installed-plugin.mjs:35` passes a new `{ dir, name }` value into `createInstalledWorker`. Current `installed-worker.mjs:43–45` validates and freezes a copied `verifiedProfile`; producer and audit-role refreshes pass that snapshot at lines 64 and 70. The preserved genuine original caller does the same at `original/installed-worker.mjs:40–42,61`. A live profile name change then differs from the approved name at facts lines 158 and 210. No change to the facts resolver, directory token, worker source, or invocation carrier is required for the installed path.

The proposed fixture repair adds `const verifiedProfile = Object.freeze({ ...profile });` and passes that copy as the expected `profile` at line 56. The live `ctx.profileContext` and returned fixture `profile` remain mutable actual host facts; the existing mutation and refusal assertions remain intact. It neither freezes the live host object nor updates/restores the approved value after a refusal.

## Original public contracts checked

These are local, pinned original sources, read as text only. Full SHA-256 values are in the companion JSON.

| Source | Contract and consequence |
| --- | --- |
| DSH `lib/profile-boot-BZ2ZjNWi.js:259–274` | The launcher creates a plain profile context with `name`, `dir`, and other launch facts, and provides it to the original host context. The proposed fixture keeps that actual source value mutable. |
| `dsh-shell-env/lib/index.js:84–104` | Its original per-execution collection reads current `profileContext.name/dir` and returns a frozen environment overlay. Current host facts and an approved snapshot have distinct purposes. This fixture does not call collection or launch a shell tool. |
| `dsh-launch-environment/lib/index.js:30–53,55–67` | Launch environment resolution copies layer values into process/project/user source maps. This is not an alternate identity or profile approval source for the directory fixture. No ambient variables were read in this review. |
| `cordis/lib/index.js:123–142` | Context-traceable public service proxies expose `symbols.original`; comparing public wrappers must preserve the underlying original service identity. |
| `cordis-plugin-loader/lib/index.js:335–375` | Effective disabled state belongs to the actual Entry/parent chain; original update disposes a disabled fiber. No fake Entry or lifecycle signal is needed. |
| `dsh-session-persistence/lib/index.js:261–266` | Original backend `identity` is process-local, stable through Context proxies, and distinct after replacement. |
| `dsh-session-persistence-jsonl/lib/index.js:2372–2409` | Original JSONL backend stores its config, resolves the configured root, selects compression, checks the root, and installs its tracker. Directory tokens must remain tied to that backend/configuration. |
| Frozen facts source:149–159,187–211 | Original class/Entry/service/fiber/namespace and source pins are checked; directory state binds actual context, original backend, source reference, immutable identity, and approved or allocated leaf. Root/cwd/profile/parent/leaf stat facts and backend root/compression are rechecked. |

The original public-source hashes inspected match the corresponding frozen public-graph pin entries. The facts code's pin checks, exact original public class/Entry resolution, original backend association, and filesystem guards are preserved in the literal proposal. Synthetic payload fields cannot manufacture a source-issued token or a registered runtime principal.

## Two remaining audit principal defects

The exact unchanged RuntimeStore is SHA-256 `1742b0f3ffb190f285ac0a915e8efd0fde2fde42d62ecd22a4e75a86930ad27f`. It defines `HOST=['host']` at line 23. `readAuditInput()` validates exact task/input-record fields and calls `#ctx(handle,input.taskRef,HOST)` at line 2278; `#ctx` rejects a wrong role with `UNAUTHORIZED` at line 142. The original owner, coordinator, and host handles are registered with their distinct roles at `runtime-plugin.mjs:76,84–86`.

| Call site | Frozen binding and consequence | Literal correction |
| --- | --- | --- |
| `runtime-plugin.mjs:106`, `observe('plan', ..., 'audit')` publication | Passes `owner`; original store denies the audit-pair read before the `originalPlans` entry and listeners are reached. `observe` calls the original invocation first at line 117. The original plan mutation is under owner authority at store lines 583–611, so source control flow can return a denial after the plan mutation has committed. This is a source-level consequence, not an observed lifecycle run. | Pass the already registered `hostHandle` for that read only. Retain capture/freezing, owner-carrier checks, exact original plan/pair binding, and publication order. |
| `runtime-plugin.mjs:250`, ApprovalPreview callback | Passes `owner`; the original store denies. `ApprovalPreview.#material` calls that callback and converts a failed pair read/validation to `PREVIEW_UNAVAILABLE` at lines 61–62. The callback is used for before/after prepare material checks and grant rechecks. | Pass `hostHandle` for that read only. Retain both callback `checkOwner()` calls and the original owner handle for preview snapshot/readData/grant. |

The earlier `NR-API01.patch` corrected the **direct installed audit callback** at current line 209 to `readAuditInput(hostHandle,input)` and restored the artifact mutation's original owner binding at line 213. It did not change the two reads above. All three audit read sites must use the original host principal; the direct callback is already correct and is excluded from this patch.

The store remains host-only. No principal is re-registered, no role list is widened, no permission callback is replaced, no wire field supplies the host handle, and no owner/currentness guard is removed. The plan mutation remains an original owner operation; `ApprovalPreview` still requires authoritative task/action/policy/material checks and original owner grant CAS. No failed run establishes that either repair passes at runtime.

## Callback, effect, and bound inventory

| Boundary | Existing source calls/effects and bounds | This proposal |
| --- | --- | --- |
| This review turn | Static `rg`, `cat`/`sed`/`nl`/`tail`, `shasum`, and four new documentation/proposal file writes. | Zero runtime/parser/test/build/DB/profile/provider/agent/session/iterator/listener/Git/network calls; zero existing-source edits. |
| Directory fixture setup | Original `Context`, original `ctx.plugin` fibers, original Loader `create`/`await`, one empty preset registration, and original synthetic provider registration. All filesystem targets are each fixture's `df-ni3-directory-*` temporary tree. Existing `t.after` disposes the original fiber and removes that tree. | Copy/freeze one approved-profile value in the factory. Existing seven case bodies and teardown remain; no new test hook, lifecycle substitute, or finalizer. Source has at most 13 fixture contexts if all seven existing cases complete; the first failure prevented three later contexts. This is a static bound, not an executed effect counter. |
| Facts resolution | Original metadata calls only: `llm.listProviders`, `listModels`, `resolveModelInfo`, `resolveCallConfig`; preset `resolve`, `readDocument`, `compositionInventory`, `inspectCompositions`; exact source/class/Entry and stat checks. Checkpoints follow awaited calls. | No change. Provider list <=32, model list <=64, reasoning efforts <=16; native empty preset composition remains required. No LLM stream request or agent/session creation is performed by these calls in the fixture path. |
| Directory claim | Original `runInstalledWorkerInvocation` guard brackets each call. `claimDirectory` requires exact four 64-hex references and original `assertCurrent` before/after its one possible `mkdirSync` of the configured transcript leaf with mode 0700. It retains the original allocated leaf identity. | No change. It cannot adopt copied/foreign tokens or recreate a stale retained allocation. Recognizing provider denial does not authorize another claim. |
| Fixture choice | `df-testing-local`; producer/review/repair source-owned deterministic models; empty native preset; request 131,072 bytes; result 2,048 bytes; producer tokens 128; audit-role tokens 2,048; runtime policy 60,000 ms; usage policy 600,000 units; zero estimated cost; charges 1,000 ms/135,168 units; preview/grant TTL 60,000 ms; compression `none`. | No selections, charges, capacities, paths, permissions, or limits change. The `llm/stream` fail-on-use handler and existing empty agent/session/tool oracles stay intact. |
| Audit plan pair publication | One synchronous read of the original authenticated input pair after the original plan call; exact frozen task/record input; the original store transaction validates historical associations and read permission. | Substitute only the existing host principal; no added mutation, admission, replay, or alternative provenance. |
| Preview audit pair callback | One synchronous read per original material check, with owner-current checks before/after. Prepare calls material before/after resolver; grant calls it during current/final checks. Pair validator, task CAS, policy, latest artifact/material, resolver-label refresh, expiry and original grant CAS remain in `ApprovalPreview`. | Substitute only the existing host principal. Existing cache capacity 64, TTL <=60,000 ms, complete audit-preview envelope <=65,536 bytes, byte/schema constraints and readData/association equality remain authoritative. |

The source inventory explains the permitted boundaries for a later exact root GO. It is not authorization to instantiate any of these effects now and is not a claim that unreached no-execution assertions passed. No restoration sequence or arbitrary late finalizer is introduced to revive a grant after a refusal.

## Deliverables and remaining hold

The new sibling [literal proposal](../../../.runtime/ni3-runtime-failure-proposal/literal-repairs.patch) is a text-only unified diff against the original frozen capsule, relative to its root: **two target files, five hunks, five added lines and four removed lines, four conceptual repairs**. This lane did not apply or execute it; root separately applied these exact bytes as recorded above. SHA-256: `c6e917b5826f3bb0d8e239a5df3177d80c375c71850b9a176e63c8f15ffe3524`. The [finite case design](../../../.runtime/ni3-runtime-failure-proposal/proposed-cases.md) is non-runnable and not run, SHA-256 `5bb139541dba28dcab928084642da08dc60784e0fb4655de80b184e0d746e853`. It retains its pre-application source-proposal status as originally written. The companion `native-runtime-first-failure-rootcause.json` records the exact original input pins, root's separately repaired bytes, findings, scope, inventory, and status.

Root separately archived/applied/refroze its approved repairs; independent review and exact bounded retest evidence remain its responsibility. The original source closure and command 24 remain failed evidence. Original-run commands 25/26 and the unreached case 5/6 subcases remain NOT_RUN in that run; this lane claims no subsequent acceptance or test result. Original blocked CODE and the receipt/envelope investigation remain outside this lane and were not rerun, rerouted, inspected, or assigned. QA's original port-3080 profile and frozen installation were untouched by this lane.
