# W0 review question — freeze callable contracts before executable MCP tests

## A/B question

The pinned design approves the architecture and behavior, but intentionally assigns the exact tool/capability/result/error/event/ack schemas to MCP-S3 (after MCP-S1/MCP-S2), K1 publication, and X0-C typed transport-port alignment. It does not define a callable spike-report interface or public names/shapes for those ports. The old custom-control exports cannot stand in for the new MCP semantic contract.

**A — Freeze proposed names and schemas as part of this test review.** Supply/approve the chosen server/spike interface, shared profile and conformance-fixture exports, result/error mapping, minimal push event/ack schema and typed local control/intake ports. The affected acceptance TODOs can then become executable contract cases. This would add specification work to the current test-only task; test authors must not silently choose it.

**B — Keep these as explicit owner-named acceptance TODOs until MCP-S1/S2 → MCP-S3 → K1 produce the reviewed callable baseline (recommended).** Review the human stories, partitions, boundaries and required observable behavior now. Activate these cases against that approved boundary before the dependent W1 tasks. Existing specified local/skeleton contracts execute red now. This avoids false reds from invented imports or testing the parked custom control protocol.

**Recommendation: B.** It follows the revised task dependencies and preserves this delivery as cases for review before development. TODO counts remain visible; they are not passes, completed spikes or a narrower definition of done. A future owner must not skip the acceptance merely because execution was deferred here.

## A/B question — retained watchdog growth-budget validation

The incorporated watchdog settings requirements retain save-time validation of `turnGrowthTokens` against `readMaxBytes × (1 + readsPerTurn) / 3 + card + maxOutputTokens`. U14 removes the **approval-window** sum, not this separate growth-budget rule. The source fixes `readsPerTurn` to 2 but does not make the card-token term and rounding a deterministic config-validation oracle; its largest read bound also cannot necessarily fit the largest growth bound.

**A — Specify a deterministic card-budget/rounding calculation and coherent aggregate vectors before WD-1 implementation (recommended).** Then exercise budget−1/budget/budget+1 with fixed read/output companions, and reject individually in-range combinations whose aggregate cannot fit. This preserves the retained save-time rule without inventing token estimates.

**B — Review the explicit owner-named WD-1 aggregate-validation TODO now and freeze that calculation before activating it.** Per-field bounds are tested through each public schema field, not by falsely expecting every endpoint to pass the whole Config with incompatible defaults. This defers the missing exact oracle, not the validation requirement.

**Recommendation: A before WD-1 development; no calculation is assumed in this test-only delivery.** The aggregate case remains TODO pending the answer. It does not restore approval timers or the retired approval-window sum.

## A/B question — asynchronous manager setup readiness

The pinned X2 test outline includes asynchronous callbacks, while its synchronous setup description does not define whether manager creation/resume must await them or how a late callback completion races disposal. Log-once/skip/isolate and scoped disposal remain required either way; returned promise rejection must not become an unhandled failure.

**A — Await asynchronous setup before publishing the created/resumed manager; late registration becomes available after its callback completes (recommended).** Define the completion/disposal fence explicitly so an old completion cannot restore disposed contributions. This gives a clear readiness boundary but may delay activation for a slow callback.

**B — Permit non-blocking async setup with an explicitly observable pending/ready boundary.** Callers must not assume the contribution is usable before readiness; rejection is isolated/logged and disposal still fences completion. This avoids activation delay but needs a specified readiness signal.

**Recommendation: A, subject to the approved DSH setup contract.** `XC-UC-01-E2` remains an X0-C-owned TODO until scheduling/completion policy is explicit; `XC-UC-01-A5` separately records dynamic-context lifecycle/disposal acceptance. No await timing or callback signature is silently invented by the cases.

## Already decided — not reopened

- First-party authenticated push; MCP is the only control plane, with no reverse MCP.
- External delegated approvals/questions default on, with **no off setting**, subject to authorization and intake/answer capabilities.
- Idle never-polling delegated items wait; first **committed** outcome wins.
- Coordinated old control endpoint/export removal and built-in peer/snapshot/binding upgrades, with no migration/dual-control release or downgrade.
- Watchdog failure means effective off and Fishball hand-over, never halting. Questions/plan reviews never reach the watchdog. Recovery is dormant until explicit resume/rebrief.
- Every notify dedupe key is pending until durable acceptance; a reservation is not delivered and cannot suppress retry. This is specified in §12.5, not an A/B choice between old suppression and retry behavior.
- U14 approval timer removal, U15 namespace enforcement outside X0-C, U17 reached-layer transcript history and U19 archive/30-day board visibility.

Exact npm release numbers remain release bookkeeping, not an unresolved compatibility decision. Engineering choice of server dependency/transport packaging belongs to the feasibility spike and must prove the acceptance on both hosts; this test rewrite does not require an arbitrary package choice.

## Provenance

Pinned requirement commit: **`15d6f1f214144db3575f9bc0ba15238b1450c2a7`**. See [extension task table](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L506-L524>), [mailbox proposal](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L149-L172>), [schema/versioning boundary](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L272-L290>) and [revised task dependencies](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L301-L342>).

This note replaces historical questions inherited from the old suite, which were already resolved by U14/U15/U18/U19. It changes neither requirements nor implementation.
