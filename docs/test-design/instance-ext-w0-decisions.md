# W0 review decisions — approved B, A and A

The user approved the W0 cases and selected **B / A / A**. These are closed decisions, not open questions. This follow-up changes tests and their evidence only; no product implementation, plugin install, live DSH instance or restart is authorized by it.

## 1. B — MCP callable contracts freeze with their owning tasks

Keep exact callable spike/report/profile/schema/result/error/tool/event/ack interfaces as explicit owner-named acceptance TODOs until MCP-S1/S2 → MCP-S3 → K1 produces the reviewed shared baseline. Typed X0-C control/intake ports align before W1. Do not invent imports, require parked custom-control exports to survive, or use false reds to manufacture executable evidence.

This is not a weaker definition of done: all reviewed acceptance remains required. MCP architecture, default-on external delegation without an off setting, first-committed settlement and coordinated old-control removal were already decided.

## 2. A — deterministic watchdog growth and runtime budget

The approved exact oracle is now [§2.8](<../../../design-wd-budget/docs/plugins/instance-extension-points.md#L404-L456>) at **`design/wd-budget` `9cafd921be8a8e67f828ab225bf5fe636887c5c5`**:

- `T(bytes) = ceil(bytes / 3)`, `T(0)=0`, measuring RFC 8785 canonical provider-neutral JSON encoded as UTF-8, without Unicode normalization. Count whole context once; provider-reported usage is telemetry, not the oracle.
- Shared card/non-read-input allowance: **768 tokens / 2,304 bytes inclusive**, including wrappers and all card fields. Above 2,304 bytes, route the intact permission request to Fishball without a model call or silent truncation; this individual-card fallback is not a plugin fault.
- After integer field validation, require `turnGrowthTokens >= 3 * ceil(readMaxBytes / 3) + 768 + maxOutputTokens`. Round each bounded read upward. Equality passes; refusal retains the previous config atomically.
- Default companion minimum: **9,985**, not 9,984; 9,985/9,986 pass. Output 2,048 requires growth **11,009**. Individually valid read/output fields may make every allowed whole-config growth value invalid.
- `R = min(contextRolloverTokens, contextWindow - turnGrowthTokens - maxOutputTokens)`, default rollover **64,000**, not 65,536. Save requires `R >= 16000`. At `C >= R`, finish the turn and rotate before the next; preflight newly added input and remeasure one fresh epoch.
- Within a turn, `C <= R + turnGrowthTokens`, measured growth `<= turnGrowthTokens`, and the sum of rounded canonical-response estimates `<= maxOutputTokens`. Equality fits. Never rotate mid-decision to hide an exceeded budget.
- Fresh context still reaching `R`, measurement/model-window failure or provider rejection means **effective off / Fishball hand-over**, releasing claims and passing sends. No halt, watched-session stop, approval timer or rollover loop.

The former WD1 aggregate-budget TODO is replaced by concrete save-time Config cases. Fully specified runtime/card/canonical-measurement/rotation scenarios remain actual owner-named TODOs under WD-8/WD-10/WD-12 and hand-over owners; their values and expected outcomes are no longer awaiting a budget decision. They must not become self-confirming tests of a test-owned estimator or invented public API.

## 3. A — await asynchronous manager setup readiness

Await asynchronous setup before publishing the created/resumed manager. Late registration is usable after its callback completes. Explicit disposal/generation fencing prevents an old completion from restoring a disposed contribution; rejected callbacks are isolated and logged once, without breaking healthy registrations or producing unhandled rejection.

The X0-C async scenario records this approved policy. Any remaining TODO is an execution/fixture obligation, **not** a renewed A/B question about await timing. Dynamic-context lifecycle/disposal remains separately assigned to X0-C/X-E2E.

## 4. Host-compatible optional service resolution

The user reports that **both DSH hosts interpret `inject: ['fishballInstance?']` as a literal required service**, preventing activation. Optionality is behavioral, not that string syntax.

FN-1 and B1 declare `tools` and resolve `fishballInstance` at runtime. Their export assertions accept this form and continue to prohibit internal `fishballChat` dependence; service-present and service-absent load cases remain. The equivalent literal-name requirement in WD-1 is corrected without dropping its required host services. No implementation is read or copied from the development branches to make these assertions.

## 5. Unchanged decisions and provenance

- One-way MCP controls for everyone; authenticated first-party push carries events/acks only. No reverse MCP or legacy dual-control/migration path.
- External delegated permissions/questions/plan reviews are default-on with no disable setting, subject to authorization/intake/answer capability; idle non-polling offers wait.
- First **committed** outcome wins; old attempts/acks cannot overwrite it.
- Watchdog faults are effective off and never halt work. Questions/plan reviews never enter watchdog claims, queues or context. Recovery retains dormant briefs until explicit resume/rebrief.
- Pending notify reservation is not acceptance; stable identity permits retry without losing or duplicating delivery.
- U14 timer removal, U15 namespace ownership outside X0-C, U17 reached-layer transcript history and U19 archive/30-day visibility remain unchanged.

Original requirements: **`15d6f1f214144db3575f9bc0ba15238b1450c2a7`**, supplemented for budget by **`9cafd921be8a8e67f828ab225bf5fe636887c5c5` §2.8**, plus the user's host-injection correction. See the [review guide](<instance-ext-w0.md>) and [audit](<instance-ext-w0-audit.md>) for current cases, counts and actual safe-harness evidence. No question in this note remains open.
