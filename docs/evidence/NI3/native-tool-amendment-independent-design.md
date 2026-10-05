# NI3 optional nativeToolGuard amendment: independent ISTQB design

Status: **INDEPENDENT_DESIGN_READY; SOURCE AND EXECUTION HELD**. This finite source-only review defines eight independent discriminators for the optional eighteenth private callback. No semantic contradiction was found between the bound amendment, its two additive source hunks and the original host call shape/order. This is readiness for a separately authorized isolated typed fixture phase; it is not source promotion, native acceptance, a CODE verdict or permission to execute that phase.

Only this Markdown file and [its companion checks](native-tool-amendment-independent-checks.json) are leased outputs. Both were absent at the first check. The prior [composition design](native-composition-independent-design.md) and companion are unchanged. No author amendment fixture or executable results were read. The cases below come from the held semantic API, the candidate's literal narrowing checks and original local source call sites. Root's reported author results do not enter these oracles.

## Exact bound inputs and source snapshot

| Input | SHA-256 |
| --- | --- |
| [Amendment](native-tool-source-api-amendment.md) | `a3248cc1715f96e1ff9b8e86a79e7caa96ee8f19607f52ce8dfd32971534d8ce` |
| [Amendment companion](native-tool-source-api-amendment.json) | `aa58cd0f58aab788b9265f91dd61e18d0e94a6d88a5fce2e6a04164838ba15de` |
| Isolated `.runtime/ni3-native-tools-amendment/src/installed-audit.mjs` | `24dd8048135fc61f79a719288dbc00ea93f61a6a6dcbaffdb0a49db648764f1f` |
| Archived `.runtime/ni3-native-tools-amendment/original/installed-audit.mjs` | `80ed193a8f4dc6f395ff8372b4a8045ccd834d63c84ef386c3e6988ef5a3930d` |
| Shared original `src/installed-audit.mjs` at this read snapshot | `80ed193a8f4dc6f395ff8372b4a8045ccd834d63c84ef386c3e6988ef5a3930d` |
| Original `src/native-adapter.mjs` | `caba6d841cc4db6825e5b5aebce95c7b83dab3a501a6602bfea91efb00b7c49e` |
| Original `src/worker.mjs` | `55b93114668db772c887b08928bbbb312f1a3d236524b2375791ae6da958b653` |
| Copied/shared schema5 ledger at this snapshot | `f629b14679a210e319775466a90f9afcadad75462f8a401b7939e93653da0e44` |

All seven copied local import-closure files match the amendment pins. The six unchanged dependencies equal their original pins; only the isolated installer differs. Python's literal diff reproduces both held hunks. The held old-file header names `src/installed-audit.mjs@80ed193a`; the checked archive has a different path label and identical hunk content. No other product operation, private return, permission callback, receipt or configuration code changes in that diff.

The 31 repository/lock pins, 41 original public-file pins and 12 package name/version pairs inherited from the previous independent companion were reread and matched at the source5 read snapshot. This is a historical read snapshot. Root's subsequent serial schema6 promotion is outside this lease; these records must not be relabeled as schema6 or reinterpreted as present shared-head attestations after that promotion. The isolated seven-file candidate closure remains schema5. Exact pin records are in the companion.

## Decisions and remaining boundaries

The original seventeen mandatory properties and six returned fields remain unchanged. The optional `nativeToolGuard` is an eighteenth **private installer API** field; it is not an owner option, RPC input or production default. Omission returns false. An explicit invalid value is rejected; a supplied function returning false is a real denial. Its captured function cannot be replaced later to turn false into true. Only a valid own enumerable data function, with known async/generator and Proxy functions rejected, reaches the new gate.

The new gate accepts only the original frozen ordinary record surface and a descriptor-safe frozen plain empty schemas array. Its required fields are `agent`, `taskRef`, `generationRef`, `toolsDigest`, `permissionPolicyDigest` and `schemas`; `claimRef` is syntactically optional in the shape but semantically required by `ref(record.claimRef)` at every admitted tools check. Missing and undefined claim values therefore deny. The non-Proxy object agent is an opaque WeakMap key. The new gate must not canonicalize, clone, freeze, serialize or inspect that agent; the same original record and identities go to the captured callback.

A pending module slot with `claimRef === null` is already claim-bound in the original adapter. The guard requires the exact private setup binding claim, full binding/spec/session/action/role and retained slot/plan identity, live observed grant and complete nonhistorical source/input/policy currentness. Once the slot records a claim, both that claim and the setup binding claim must match. This does not create a preclaim tools route or prove a real durable claim from matching hashes.

The callback runs at most once per guard invocation. Only synchronous literal true followed by the entire currentness recheck can allow the empty-schemas check. False, truthy values, errors, Promise/thenable and Proxy results deny without coercion, reflection, awaiting or retry. Nested entry denies and poisons its enclosing attempt. A later ordinary attempt can be evaluated again only while all original facts remain current.

The amendment creates a distinct optional seam; it does not reinterpret the original literal false. The original composition blocker NC-B01 is **not closed at the original product source** by this document or a future typed pass. Root must separately freeze the amendment, review its exact source/test/diff/closure, authorize any executable lane, and later implement/review the actual source-private callback. NC-B02 (minimal native versus full-core permission, including `taskVersion`) and NC-B03 (query observation versus read-only promise) remain unchanged independent composition prerequisites. Actual cold/native audit repair schema7 capability remains a separate prerequisite; neither the source5 candidate nor root's schema6 retention work supplies it.

## Original host order that the future callback must support

The original worker prepares asynchronously before durable claim creation; preparation invokes the minimal native permission record before any claim (`worker.mjs:55`, `native-adapter.mjs:118`). The durable original claim and submitted observation then precede `bindClaim` and every native create (`worker.mjs:59–71`). `NativeAdapter#start` requires that bound claim, builds the full private setup binding and invokes the setup hook (`native-adapter.mjs:234–254`).

The registered original factory prepares an agent and stored session, awaits setup, invokes setup's commit, appends the unstored suffix and only then publishes (`@deepseek-ai/dsh-agent-loop/lib/index.js:1851`, `1889`, `1891`). The module's setup hook retains the exact agent in its WeakMap. The adapter then checks permission/current claim and calls the first `#tools`. That first tools check comes **before** installing the original scoped `DF_TOOL_DISPATCH_UNAVAILABLE` veto. Setup commit repeats permission and `#tools`, then calls the module's commit hook (`native-adapter.mjs:243–249`). After publication, the original adapter independently checks the returned handle against the actual registry (`:259`).

Consequently, the future actual callback must authenticate the prepared original agent/context/factory ownership and durable original claim without demanding `agents.get(id) === agent` at the prepublication tools checks. Requiring a published entry there would reject the original path. It also cannot demand that the adapter's later-installed veto already exist at the first check. These are concrete future callback requirements, not a reason to return unconditional true or omit the veto. Module claim recording happens when dispatch returns (`candidate:377–381`); a timeout may return before preparation finishes, so recorded/pending is not a proxy for agent publication.

Original actual ToolRegistry class/hash validation and its actual empty scoped schemas remain mandatory (`native-adapter.mjs:101–109`). `tools.restrict({allow: []})` intersects inherited tools and does not erase local registrations (`@deepseek-ai/dsh-tools/lib/index.js:2895`, `2944`), so actual schemas must still be checked. Original guards are monotonic vetoes (`:2921–2935`), and the scoped dispatch veto remains installed. A true empty-surface decision cannot allow a real tool dispatch or override any actual permission/source denial. All native class, owner/context/child lifetime, preset and one-use request gates remain prerequisites.

## Eight independent discriminators

Each ID is one meaningful leaf discriminator, with small partitions that exercise a distinct boundary. A passing matrix must report its distinct cases rather than multiply passes by repeating equivalent rows. Every positive uses typed fixtures and earns only T evidence for this module slice.

### NTA-01 — Omission, supplied denial and captured function

Use the same valid old seventeen-property installer API; compare omission with an own ordinary function returning false. Capture the private composed worker guard through a typed compose callback.

Stimulus: Omit nativeToolGuard; use a current otherwise-valid tool record. Supply a synchronous function returning false; subsequently replace the API property with a true-returning function. With audit disabled or an invalid invocation carrier, present a true-returning function and attempt the operation through the unchanged private boundary.

Expected: Omission remains literal false and never calls an absent callback. Supplied false remains false; exactly one call to the originally captured function, zero to its later replacement. Disabled/current-carrier denial prevents enabling or composing a working audit route; no production/config/caller default is introduced.

Catches: A default true guard, false-as-unavailable reinterpretation, or mutable API replacement that overrides a captured denial. Boolean success of a typed private guard is not a native source attestation. No publication or provider-effect zero-count is inferred from an upstream dispatch failure.

### NTA-02 — Optional API descriptor and known function types

Keep all seventeen original mandatory properties valid and compare against one valid enumerable own synchronous data callback. Count subscription, composition, callback and trap invocations.

Stimulus: Present an own undefined value instead of omission; remove one old mandatory property; add an unknown property. Present a throwing accessor or a non-enumerable optional descriptor; use a Proxy installer object or Proxy callback with counted traps. Present known async, generator and async-generator functions.

Expected: Malformed presence is rejected at installer validation before subscription, composition or optional callback invocation. Accessors and Proxy traps are not evaluated. Known asynchronous/generator function classes are rejected without invocation; an ordinary function returning a Promise is instead covered by NTA-06.

Catches: Treating an explicit invalid value as absence, invoking an accessor, accepting a Proxy function, or losing the old closed seventeen-field contract. This design does not claim that arbitrary ordinary function behavior can be classified as synchronous without calling it.

### NTA-03 — Opaque exact agent and unchanged original record identity

Reach a valid module plan, observed grant, slot and setupAgent binding through typed old callbacks/operations. After setup registers the exact agent, attach cyclic/non-JSON state and a counted throwing id getter to that agent. Use the frozen ordinary record and frozen plain empty schemas shape of original NativeAdapter#tools.

Stimulus: Call the guard with the registered exact opaque object. Call with a different object carrying the same visible id and reference values. Call with a Proxy around the registered object; count traps.

Expected: The current exact agent may reach the supplied callback; callback receives the identical record, agent and schemas references. No agent getter runs and no clone, canonicalization, serialization or freeze is applied to the agent by the new gate. A lookalike or Proxy agent is denied before the supplied callback; Proxy traps remain zero.

Catches: Canonicalizing the entire record including its native agent, using id/ref equality as provenance, or wrapping/cloning the callback input. The existing setup hook reads agent.id before registration. The no-inspection assertion begins at the new gate after that setup; it is not a claim about all original host setup code.

### NTA-04 — Frozen host shape and truly empty schemas

Reuse a valid current registered agent and grant; alter only the shallow record or schemas surface. Count captured callback and getter/Proxy traps.

Stimulus: Unfreeze the record or schemas; use a nonempty schema array. Use an accessor/unknown/symbol record key or a Proxy record. Use a nominally empty array with a custom prototype, hidden extra property/accessor or a Proxy schemas array.

Expected: Every malformed record/schema surface returns literal false before the supplied callback. Accessor and Proxy traps remain zero. A frozen ordinary record with frozen plain empty schemas remains the positive control; the agent itself remains opaque.

Catches: Checking only schemas.length, accepting mutable/poisoned containers, or allowing owner-shaped extra proof fields. The original adapter rejects an actual nonempty ToolRegistry surface before invoking the private callback. Direct private-guard negatives prove the module membrane only, not the native class/hash checks.

### NTA-05 — Claim-bound pending and recorded phases

Build one review and one repair create-mode row independently. The typed native dispatch supplies an exact setup binding with a claim before invoking the captured guard; hold dispatch resolution so slot.claimRef is still null. Later return the same validated worker identity so the module records the claim.

Stimulus: Exercise the exact record before dispatch returns and repeat after its claim is recorded. Remove claimRef, set it undefined, or use a different valid 64-hex claim in either phase. Return a different valid claim from the typed dispatch, then reuse the prior setup record; substitute another generation/agent record with otherwise equal visible facts.

Expected: Both review/audit_review and repair/audit_repair current exact claim-bound phases can return true only when the supplied source callback also returns true. No preclaim interval is admitted. Missing/undefined/foreign claim and cross-generation identity deny before the supplied callback. After recording, both private setup claim and slot claim must match the record; a dishonest typed dispatch echo cannot authorize a conflicting claim.

Catches: Requiring recorded claim too early, admitting an unclaimed prepared row, or trusting whichever claim the most recent caller supplies. Setup-binding equality narrows a private map; it does not authenticate a real original durable claim. A native timeout can record the claim while preparation continues, so pending/recorded is not a publication-state oracle.

### NTA-06 — Literal synchronous decision without result inspection

Use the exact same current valid record in fresh instances, changing only the ordinary supplied callback behavior; count calls and result coercion/then getters/Proxy traps.

Stimulus: Return literal true or literal false. Return a truthy object with throwing conversion/then getters, a Proxy object, or a resolved Promise from an ordinary function. Throw from the callback.

Expected: Only literal true followed by complete currentness recheck can yield true. All other values and exceptions yield literal false. The callback runs at most once per guard invocation; results are not coerced, reflected, awaited or retried, and hostile result traps/getters remain zero.

Catches: Truthy coercion, Promise acceptance, retry/fallback on a denial, or inspecting a result before narrowing it. The original adapter may call the private guard at setup, commit and execution. Once means once per guard invocation, not once per generation.

### NTA-07 — Nested denial poisons only its enclosing attempt

A current ordinary callback recursively calls the same captured guard, using either the same valid record or another otherwise-valid registered record, then returns literal true.

Stimulus: Observe the nested result and outer result. Remove the reentering behavior and call again while the original row/grant remains current.

Expected: The nested call returns false without a second supplied-callback invocation; the enclosing call also returns false even when its callback returns true. A later non-reentering valid call is evaluated normally; the running/poison state does not become a permanent true route or permanent incidental denial.

Catches: Allowing recursive truth to override denial, poisoning only one record instead of the active installer attempt, or failing to clear running state. Later success requires unchanged current facts and original grant; this case does not restore revoked, disposed, finished or expired rows.

### NTA-08 — Before/after currentness, equality expiry and finish intent

Start from a current exact row. Use controlled typed read facts and the legitimate receipt subscriber/operation paths rather than modifying private maps. Keep each mutation in a fresh instance.

Stimulus: At or beyond grant expiresAt, with a dead/stale invocation carrier, or after a typed revoke/control/policy receipt, invoke the guard. During an ordinary true-returning callback emit a typed matching-task revoke, change the held source/policy/authenticated input association or body facts, expire the grant exactly at the postcheck, or dispose the installer. For the finish boundary, reach the typed execution/capture prerequisite through existing operations, start workerFinish without resolving its native finish closure, and invoke the guard; repeat after an observed ending finish receipt.

Expected: Already invalid currentness denies before the supplied callback (zero calls); equality expiresAt is expired. Mutation after the first successful check still denies after one callback; literal true cannot overrule revocation, source/input drift, expiration, disposal or stale carrier. Finish intent denies before the callback as soon as finishInput is retained, including unknown/in-flight finish; ended slots also deny. No grant, permission, native send, tool dispatch or receipt retry is manufactured by the guard to recover a denial. Explicit disposal still performs its existing typed disposal path.

Catches: Precheck-only authorization, greater-than instead of greater-or-equal expiration, permitting use while finish is uncertain, or stale source acceptance after the callback. The source-only design uses typed facts/events, not a real store or receipt producer. Full finish/idempotency/held-charge recovery remains in the original retained families; no private-field test hooks are authorized.

## Proposed isolated fixture lease and reporting

Proposed unique path: `.runtime/ni3-native-tools-amendment/test/native-tool-amendment-independent.test.mjs`. It was checked absent; no fixture was authored. Wait for a separate finite lease before authoring or execution. No executable command is issued or scheduled by this design.

The future fixture should import only the held isolated installer and copied invocation utility, plus narrowly needed test built-ins. Its transitive local closure is the seven pinned copies. The copied ledger defines `node:sqlite` APIs; that fact is not authorization to create or open any database. The future lease must explicitly bound any definition imports and the existing worker-configuration directory checks. No original NativeAdapter/WorkerManager/RuntimeStore instance, native package, host profile, listener, provider, model, account or credential enters this typed fixture. A typed `composeNativeAudit` double may expose the supplied worker guard and four native hooks and return the exact seven closure functions. It must use the existing module operations and valid typed private receipts to retain plans/grants/slots/finish state; no added test hook, source rewrite, private-map injection or alternative actual native route is permitted.

The positive records mirror the original adapter's frozen surface, opaque agent identity and claim/setup sequencing. Controlled read-fact mutation and legitimate typed receipt events supply negative currentness tests. Counters observe callback/trap identity, module decisions and requested typed teardown, without treating a test callback's true as actual source provenance. A tool-denial dispatch may have already prepared a native session/agent in the real host; this design does not promise that denial implies zero earlier native creation or durable observations. The guard itself must not manufacture a grant, send, tool dispatch or replay to recover from denial.

Retain all twenty N3 and twenty N3A families and all 87 acceptance criteria, with their exact prior individual contribution/residual/disposition mapping. The narrow new contribution can support the empty-tool/source/currentness slice of N3A-02/06/11/12/19 only. It never completes those families or changes their broader disposition. All 82 original BUB plus five DF010 criteria remain; accepted count is zero. The unknown/all-unexamined reviewer recipe, 119-byte factual repair proposal, full authenticated wire, real persisted usage collection, one actual manager and native cold/quit guarantees remain under their separate composition oracles. No PASS/quality/production defaults are introduced here.

No product imports, Node/syntax/tests, DB, native/profile/listener/CLI/HTTP/provider/model/tool/account/credential/network/browser/Git or CODE action occurred in this lane. Source reads, hashes, Python-stdlib documentation checks and these two leased evidence writes are the complete action scope. The twice platform-blocked CODE lane remains blocked and was not retried, substituted or given a verdict. Shared-source read lease is released when this bounded design is returned; root may continue its separately held schema6 promotion without updating these source5 pins.
