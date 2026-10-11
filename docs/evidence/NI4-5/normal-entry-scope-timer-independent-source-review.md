# NI4/NI5 normal-entry scope and timer independent source review

Disposition: **bounded source review complete; remediation required; NOT ADOPTED; NOT RUN**. All87 accepted0/HOLD remains unchanged. Two source findings remain open. This review does not close final CODE, browser, model-quality, native grant, ticket, MVP or release acceptance.

Independent English reviewer: /root/ni4_scope_timer_review. The reviewer did not implement this proposal, inspect author test/fixture/oracle bodies, execute product code or alter sources. Root retains adoption, GO, Git and command authority. Authority is [AGENTS](../../../AGENTS.md), the [owner continuation](../../owner-normal-entry-continuation-2026-10-04.md), [workflow](../../development-workflow.md), [stage mapping](../../three-stage-development.md) and [acceptance debt](../acceptance-debt.md). This ordinary scope/clock review leaves blocked final CODE and unsupported browser work untouched.

## Exact reviewed source

The subject is [.runtime/ni4-scope-timer-proposal](../../../.runtime/ni4-scope-timer-proposal), with complete47 original modules in before/src and proposed modules in src. Independent Python bytes/hash/text-diff verification confirmed that both trees have exactly the manifest's47 filenames; every pin matches; every before module equals the frozen complete47 base; only four modules differ; source modules are read-only; the combined literal diff reconstructs exactly; and source-freeze.json is byte-identical to the proposal JSON. Semantic inspection covered the four-module diff and relevant original product contracts, rather than every line of all47 modules.

| Pin | SHA256 |
| --- | --- |
| Original complete47 closure | b8230b210e7143e60fcd15f152279e002a9d7c31c54fb14659c8c85609c7a141 |
| Proposed complete47 closure | 43ddcfd6e800053cb63f7a942d62821f0c0fd99aba02ecd1819c23a89fdd0280 |
| Original runtime | 4dce579eed1d0b75ca520dc7e22975e985c0224810a4f62af27b4a8a5786cb44 |
| Proposed runtime | e88121edadcbb150ea1755587a90f66cf96d6484e1b57020d0edc6725cfc4701 |
| Original client | 8789517fd4271eff7e1531b57ee34713de24c8cbc1899938c4e60b53a0b26e74 |
| Proposed client | fd8be20df6400200579ecda4fcffca0fa4d793e146ba7a5788c325e40d7a5edc |
| Literal combined diff | a068659f1f7687d7297c33779fb997085a32e91690a619ab676bd47dfc01fe2f |
| Proposal manifest and mirrored JSON | 8a9107eaf438c01420aa8686cae47f620360d8dadbd72f386c5fd7979ca77a12 |

The closure digest is SHA256 of compact, sorted-key JSON source pins in relative-filename order. [The review JSON](normal-entry-scope-timer-independent-source-review.json) includes every independently checked before/after pin, all four changed module pins, inspected original-source pins and proposal/planning document pins.

## SC-F01 — listed task scope is not joined to status/detail

**MEDIUM; OPEN; remediation required before adoption.** This is an inherited primary-model validation gap left unresolved by the proposal.

Proposed client line65 validates and retains list ownerRef/workspaceRef. select line73 verifies only that a listed taskRef exists. It never captures that list row's scope. Line78 closes status.task with the original nine-key workerTask parser, but line79 compares only taskRef. Detail line87 compares scope to that unanchored status task. Lines91–92 replace the listed task row and publish detail/records.

The source-only trace is a genuine listed task with owner/workspace A and taskRef T followed by a closed status task with differing owner or workspace and the same T. Valid empty status.data reaches publication directly. If data exists, consistently mismatched detail tasks pass line87 and their records can also publish. Original RuntimeStore line373 computes taskRef as reference(taskId); owner/workspace are separate database keys at lines193–198. Equality of taskRef therefore does not prove equality of owner/workspace.

The original authenticated server routes remain scoped to the private owner handle. This finding proves a client response-validation gap, without proving an original server authorization bypass or treating fabricated initial feature data as authority. Normal memory's independent feature anchor rejects the conflicting parent scope; the primary task model has no such anchor.

Capture the actual listed task before changing selection/loading state, join status owner/workspace/task to it before requesting detail or publishing reply-derived state, retain the closed detail join, and recheck the current listed scope and read lifetime before final publication. Do not require a fresher status version/authEpoch to equal an older list snapshot.

Original intake line122 can temporarily select a returned taskRef that is absent from the prior list. Its immediate refresh lines67–69 then selects only an actual row in the new list or null; direct select line73 rejects an absent row. Remediation must preserve this behavior and must not manufacture a selected task.

Affected source obligations: SC-O04, SC-O05, SC-O07. Relevant retained criteria: BUB006-01, BUB014-01/05 and BUB016-01, with corresponding DF aliases. Runtime proof and retest: **NOT_RUN**.

## SC-F02 — older selection can reopen readiness during newer refresh

**MEDIUM; OPEN; remediation required before adoption.** This is an inherited parent read-lifetime race now relied on by featureScope.

An in-flight select captures detailRevision at line74. A newer refresh increments only list revision at line60 and publishes loading/stale at line61. Before that newer list read finishes, the older select can still satisfy line90's active/detailRevision/selected checks. Line92 restores ready/stale=false with no check for a pending newer list generation.

Normal featureScope lines692–695 relies on ready/non-stale parent state. Its admission fence can therefore reopen during the newer authoritative list refresh. This does not prove a foreign server read or successful stale mutation; original server identity and CAS guards remain unchanged.

Invalidate older detail reads at refresh start, and make selection readiness/publication respect the current list generation and pending refresh, including selection initiated during loading. Preserve latest-list selection and explicit empty-list clearing. Review the corrected parent and pending operation ordering on a separately frozen amendment.

Affected source obligations: SC-O04, SC-O05, SC-O07. Relevant retained criteria: BUB008-05, BUB014-01/03 and BUB016-01, with corresponding DF aliases. Runtime proof and retest: **NOT_RUN**.

## Source-supported behavior and compatibility

The genuine feature binding is source-backed. Runtime diagnostics lines474–484 checks the original live/unsealed lifetime before and after store.memoryBinding(owner), validates role=owner, and projects the same frozen namespace supplied to the original MemoryAdapter. Original memoryBinding line1368 resolves the private principal, while MemoryAdapter lines47–61 captures and rechecks binding. prepareInstalledMemory lines46–54 derives namespace only from the trusted setup identity/profile. Setup features lines59–66 and82–99 retain authenticated peer admission and repeat exact child/lifetime/setup checks after one diagnostics read. Raw identity, key, authority handles and memory body do not establish scope.

Initial normal memory operations fail before authenticated features and continuity readiness. Feature parsing closes and joins owner/workspace/namespace, pins the first original authenticated scope, and rejects subsequent rebinding until disconnect. A genuine fresh empty task list permits private memory with selected=null/detail absent. Disabled/unready feature state exposes null scope and prevents use. No memory reply establishes initial binding. This depends on the original authenticated route; mutually consistent fabricated first-feature data is not an authority test.

Pending memory replies check memoryScope before projection processing, join namespace plus projection/core owner/workspace, and repeat captured feature/current-parent checks before publication. Current loading/stale/offline or foreign owner/workspace state rejects the reply. Same-owner task switching can admit a private namespace read after a fresh completed selection because memory is owner/workspace namespace state; task-scoped/CAS runs additionally capture taskRef/version/authEpoch. SC-F02 limits the reliability of the parent ready/stale flag. Closed memory receipts and import previews also join the pinned scope. Invalid sent mutation success remains uncertain without automatic resend.

The local-delivery grant parser matches actual original output. RuntimeStore taskRecord lines24–26 returns exactly nine task keys. grantAction lines613–630 keeps task version and increments authEpoch by one; ApprovalPreview lines122–145 returns that receipt. Client lines789–794 closes the grant and nested task, requires CAS, joins owner/workspace to both feature and captured task, and joins task/action/digest/expiry/version/authEpoch before publication. No genuine current native grant positive is asserted.

Global safeTask now requires and retains owner/workspace in list/intake and shared worker/audit consumers. Original RuntimeStore list/intake/status and runtime detail forward full taskRecord; the stricter original workerTask parser on raw status/detail is compatible with that contract. Sanitized client tasks retain usable fields plus scope. Partial synthetic fixture compatibility is unverified, and no such fixture was read or amended. Global client/native regression remains NOT_RUN.

The trusted timer seam reaches the actual original ScheduleDriver. Constructor validation and createNormalAutomation forwarding preserve the exact timer object receiver for set/clear, with the original clock bounds, poll limits, timer unref, callback epochs and disposal. Original installed events still supply private source/subscription revisions and currentness closures. No import, start/register/tick, replacement driver, timer facade or RPC/config/persisted seam is added. Installed apply omits both seam options and retains original Date.now/setTimeout/clearTimeout defaults; generic automation also keeps defaults. The seam controls only ScheduleDriver, while RuntimeStore and other clocks remain real. A future finite source-composer callback exercise cannot by itself establish exact packed installed-entry S01 acceptance.

## Affected source obligations

Every row's application/execution result is **NOT_RUN**. Source-supported means only that the inspected control/data flow is consistent with the stated contract.

| Obligation | Source assessment | Retained criteria |
| --- | --- | --- |
| SC-O01 Original owner/namespace and same-child lifetime guards | Source supported | BUB006-01/03/05; BUB007-03; BUB014-05 |
| SC-O02 Initial/no-task feature pin, null/unready states, reset | Source supported | BUB006-01/05; BUB007-03/04; BUB014-04 |
| SC-O03 Foreign memory body/receipt/preview rejection before publication | Source supported | BUB006-01; BUB007-03/04/05; BUB008-04 |
| SC-O04 Genuine listed task to closed status/detail scope; absent-row denial | Remediation required | BUB006-01; BUB014-01/05 |
| SC-O05 Parent refresh/selection/owner/task changes across awaits | Remediation required | BUB008-05; BUB014-01/03; BUB006-02 |
| SC-O06 Closed original grant and all joins; genuine native positive | Source supported; native positive not fabricated | BUB006-02/05; BUB013-02/05; BUB014-03 |
| SC-O07 Global original taskRecord compatibility | Source supported with parent findings | BUB003-02; BUB006-01; BUB014-01/03 |
| SC-O08 Original driver callbacks, set/clear, stop/restart/currentness | Source supported | BUB009-01/02/03/04; BUB006-05 |
| SC-O09 Packed installed defaults and actual host/browser/model gates | HOLD | BUB009-03/04; BUB013-02; BUB014-04; BUB016-01/02/03/04 |

This mapping links [owner/task](../../tickets/BUB006.md), [memory](../../tickets/BUB007B.md), [context](../../tickets/BUB008.md), [events](../../tickets/BUB009.md), [results](../../tickets/BUB013.md), [UI](../../tickets/BUB014.md) and [aggregate](../../tickets/BUB016.md) source contracts. It closes no criterion.

## Preservation and limits

Only this review's named Markdown and JSON evidence files were written. Frozen proposal47, shared source, QA package a58c522, archive fa3fb398, profile .runtime/ui-qa-a58c522, listener3080 and existing NI4/NI5/NI3/UI/core7 assets remain untouched. Protected archives/profile content were not inspected.

No product execution, JS parse/import/build/test, DB, native, model/provider, timer/listener, network, browser, credential or Git operation occurred. No test/fixture/oracle bodies were read. Python performed only source bytes/hash/text-diff/JSON metadata verification and evidence construction. Source traces are not executed failures or passes. Root must separately freeze and review remediation and retain all87 accepted0/HOLD, finalCODE BLOCKED_HOLD_NO_RETRY, browser HOLD and model-quality HOLD.
