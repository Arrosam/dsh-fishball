# Connector contract 2.0 — complete delta from 1.1

Status: **coherent preserved baseline, parked by the selected one-way MCP control direction in
[the MCP design](<plugins/connector-mcp-option.md>)**. The user chose breaking contract 2.0 instead
of additive 1.2 before changing the control transport to MCP; bidirectional MCP is rejected.
Do not implement this full custom control protocol. Protocol-dependent work waits for MCP feasibility
and schema freeze; first-party custom pushback **will** use a small event/ack contract (1a = A). Reuse the
timer-free lifecycle/limit requirements regardless of transport. This document preserves the 2.0 option;
it does not claim a shipped release or silently select it over MCP.

**2026-11-09: 1c = B closes migration.** Remove the old custom control endpoint and exports with
all built-in consumer upgrades; no legacy migration path. The attach/export/minor-negotiation rules
below are the **historical custom-2.0 option**, not an implementation track or a live MCP fallback.
External delegated approvals/questions are **on by default, with no setting to turn them off**
(1b = yes and subsequent clarification); no opt-in question remains. See [current decisions and task ownership](<plugins/connector-mcp-option.md>).

Within that parked option, this is a normative delta: the [1.1 contract](connector-contract.md), including its complete
operation tables, validation order and module index, is incorporated unchanged **except** for the
explicit replacements below. No unspecified wire additions or legacy exceptions are implied.
[The extension plan](plugins/instance-extension-points.md) defines instance-local behavior.

## 1. Version, attach and negotiation

- Contract: `{id: 'fishball-connector', major: 2, minor: 0}`. Envelope `version: 2` is independent
  and unchanged. Package versions are independent too (§6).
- Connector announces its implemented contract through its `./contract` export
  `CONNECTOR_CONTRACT`. Instance announces **its own implemented version**, independently pinned,
  in `fishballConnector.attachInstance({id, name, contract, transport, ui?, status?, retry?})`.
  Do not copy the installed connector's constant into the instance descriptor: today's built-in
  instance does that, which would let an old implementation falsely declare 2.0 after an upgrade.
- The built-in instance checks the installed connector export before starting its child, then
  attaches with its independently pinned descriptor. Both checks are required. Runtime checks,
  not a package-manager peer range alone, establish compatibility.
- `negotiateContract` accepts only exact `{id, major, minor}` data with nonnegative safe integers,
  matching id and major 2. It returns frozen `{id, major: 2, minor: min(peerMinor, localMinor)}`.
  Future 2.x minors remain additive and capability-negotiated. Timer-free behavior is mandatory
  in every 2.x minor, not an optional capability.
- For a 1.x instance, including third-party 1.1: **throw `ContractError` with
  `name: 'ContractError', code: 'contract-version', message: 'contract-version'`**. Wrong id,
  different major or malformed version declaration has that same refusal. Keep the exact machine
  error; separately display “Incompatible contract: requires timer-free 2.x; upgrade the
  instance/connector.” This is an attach exception, not an error frame.
- A refused attach has no side effect: no transport method called, no replacement of an existing
  instance, no delegated cards, no partial attach. Keep 1.1's validation order: descriptor shape,
  contract, transport, UI, identity/status/retry, then instance-busy. An outer descriptor that is not a plain object or has unknown keys
  still fails `instance-invalid` before version checking; a missing `contract` fails `contract-version`.
- A 2.0 instance facing a 1.x connector refuses before boot/attach when preflight is available;
  if attach is attempted, the old connector rejects the independently declared major 2. Do not
  retry with major 1. Show failed/incompatible locally and release only this attempted instance's
  resources. Do not stop managed DSH sessions or disturb another attached instance.
- A 2.0 connector **never accepts a 1.x declaration**. No legacy timer exception, translation
  adapter or downgrade. A peer lying about its implemented version is nonconformant, not a
  compatibility mode; conformance fixtures exercise behavior as well as declaration.

After attach, the existing handshake is unchanged:

| Direction | Shape | Meaning |
| --- | --- | --- |
| instance → connector, `handshake` request | `{capabilities, requiredCapabilities}` | Unique non-empty name arrays; includes served `inbox.push`; required must be a subset of capabilities |
| connector → instance, handshake response | `{capabilities, hostInstanceId}` | Served operations and fresh connector-object identity |

The handshake carries **no extra contract-version field**. Unknown optional capability names are
ignored; unmet required capabilities return `unsupported-capability`. Malformed handshake closes
the channel; a well-formed unmet handshake may be corrected. Before handshake: `handshake-required`;
second completed handshake: `conflict`. `instance.attention` must not be required.

| Instance | Connector | Result |
| --- | --- | --- |
| 2.0 | 2.0 | Attach, then capability handshake |
| any 1.x | 2.0 | `ContractError('contract-version')`, no attach |
| 2.0 | any 1.x | Preflight refusal / attach `contract-version`, no downgrade |
| 2.x, attention unsupported | 2.x | Timer-free operation, zero unread projection |
| mismatched major/id | any | `contract-version` |

## 2. Added: attention and connector projection

`instance.attention` is a session-unscoped **instance → connector request**. Envelope `sessionId`
is `null`; normal seven-key envelope, request-id dedupe and handshake rules apply.

```js
// request payload: exactly these keys
{unread, importantUnread, latestAt}
// response payload
{accepted: true}
```

- `unread` and `importantUnread`: safe integers, `0 ≤ importantUnread ≤ unread ≤ 9999`;
  add `LIMITS.unreadMax = 9999`.
- `latestAt`: nonnegative safe integer epoch milliseconds or `null`. No ordering or non-null
  requirement is inferred from the counts. Counts are snapshots, not increments.
- Missing/unknown keys, wrong types or out-of-range values are `invalid-envelope` validation
  failures and close the channel. Validate before changing stored attention. A rejected update
  never installs a partial value; channel-close then resets the projection as below.
- Advertise `instance.attention` in the connector welcome only when implemented; instance sends
  only when advertised. Unknown/unserved request remains ordinary `unsupported-operation`.
- Connector → its **own client view**, not a transport event:
  `state.unread = {count: unread, important: importantUnread > 0}`. Initial value, detach and
  transport-close value are `{count: 0, important: false}`. A new connection must publish a fresh
  snapshot; do not inherit another instance's badge. No new `latestAt` view field is required.
- FN-3/X8 supply the current counts; FN-A renders fish/brand unread and important alerts. No
  server-to-instance attention push is introduced (the direction is instance → connector).

## 3. Removed: decision deadlines, not grant expiry

The **connector → instance** `approval.request` event and each descriptor in the **connector →
instance response** to `approval.list` now use exactly:

```js
{approvalId, offerId, kind, prompt, choices, title, at, toolName, callId, reason,
 quotes, arguments?, argumentsStatus?, questions?}
```

All retained field rules come from 1.1 §5.1. `questions` is required for `kind: 'question'`
and forbidden for `kind: 'approval'`; `arguments` and `argumentsStatus` occur together or neither.
`kind` remains `approval | question`; plan reviews carry `intent.kind: 'plan-review'` inside
an individual question item, not at descriptor top level. `expiresAt` is **removed**,
not nullable, optional or silently ignored. Its presence is `invalid-envelope` under exact-key
validation, including in third-party 2.x messages. Remove expiry filters from offer selection,
`approval.list`, instance card stores and X9 held-item release/drop decisions.

Remove `approvalAnswerSeconds` from connector settings/defaults/forms/locales and countdown text;
ignore obsolete persisted settings during migration without creating a deadline. Remove all
permission, question and plan-review decision timers at connector, Fishball and watchdog layers,
including `decisionTimeoutSeconds`, `managerReserveSeconds`, `minDecisionSeconds`, deadline budget
arithmetic and technical decision fail-safe timers. These are settings/internal fields, **not**
new wire fields being removed from an operation that never contained them.

A decision turn answers or escalates. A completed/failed/cancelled decision turn without an answer
immediately escalates the still-open request: watchdog → Fishball → user. Questions/plan reviews
skip watchdog and go Fishball → user. A call that genuinely never completes and reports no failure
may remain hung; do not promise elapsed-time escalation. User cards have no deadline. Non-time
closure (settlement, requesting session end/release/take-back) remains effective. Detach retires
the instance offer and hands the unresolved request to its session's user; it is **not** terminal
resolution and must not clear that replacement user card.

**Retained and distinct:** grant `expiresAt` and its validation/error codes, attachment `hostRef`
expiry, transport request timeouts/channel closure, watchdog check/stall/health timers. Ordinary
transport RPCs remain bounded; an offered card does not occupy a waiting RPC until the model/user
answers. Transport failure ends that transport attempt and invokes the existing unavailable
routing; it is not a new card decision budget. `question.ask` still returns `{questionId}` at once.

## 4. Changed lifecycle; unchanged answer shapes

- `approval.answer` stays `{sessionId, approvalId, offerId, answer:{decision, risk?, reason?,
  question?, grant?}}` → `{accepted:true}` or `{accepted:true, grantId, expiresAt}`. Direction is
  instance → connector; the response expiry is the **grant**, not the card.
- `question.answer`, `question.answerOwn`, `question.ask` and their direction/shapes stay exactly
  as 1.1 §4.2. No new watchdog decision enum, claim token or direction-update operation is added.
- `approval.settled` remains connector → instance `{approvalId, decision, by}` with
  `by: 'user' | 'fishball'`. A watchdog answer crosses this boundary as an instance/Fishball
  answer; finer attribution remains instance-local transient metadata and ordinary transcript.
- **`decision: 'escalate'` is offer handoff, not terminal request completion.** Retire the old
  instance offer, preserve the unresolved user card and correlation/reached-layer state. Do not
  run terminal cleanup merely because the event is named `approval.settled`.
- At actual terminal resolution/closure, immediately remove open-card projections from connector
  pile, requesting-session card and instance/Fishball chat. Settle the requesting tool once. No
  closed-card retention window or separate decision-audit/attribution-label store.
- Decision history is ordinary transcript only at layers reached. Watchdog-only outcomes cause
  **no automatic** Fishball record/turn. Escalated Fishball outcomes live there; a user outcome
  produces one Fishball wake. Explicit `watchdog_decisions` retrieval is allowed and not a push.
- Existing durable `inbox.push` system markers (`QUESTION_ANSWER`, `CARD_CLOSED`, `RECORD_ITEM`,
  own-answer handling) retain their formats. Correlate with offer/terminal events by request id;
  do not indiscriminately copy decision records or produce duplicate wakes. X0-A consumes and
  routes them by reached layer; K2 must not rebuild retired card/label stores from those records.
  `approval.ran` records execution by a prior pass/grant; it is not a fresh decision or a new
  reason to recreate a card. Existing transcript entries are not deleted.
- Live pending inbox replay/ack guarantees survive: connector retains until accepted, resends
  unchanged after reconnect; instance acknowledges after durable queue acceptance and dedupes.
  Pending notification reservation is not successful delivery: retry with the same queue identity.

**Not wire changes:** X0 service members, Fishball-only question routing, X14 health/readiness,
X15 claim incarnations, X16 start assignment, X19 send gating, `watchdog_refine`, board archives,
`board_search`, namespace helpers, images/inbox convenience APIs and plugin installation. These
stay inside the instance. A failed watchdog is effectively off; Fishball owns supervision and
permissions, sends pass, no fault-induced session stop. A detached whole instance still invokes
connector no-instance/user fallback. No `session.supervise` or new user-answer operation is added.

## 5. Unchanged guarantees and boundaries

All 1.1 limits and error vocabularies remain unless explicitly removed above. In particular:

| Guarantee | Retained rule |
| --- | --- |
| Message/body size | `maxMessageBytes` default **65,536 UTF-8 bytes (64 KiB)**, a connector setting, for messages/forwarded notice body; not a 64 KiB wire-envelope cap. Generated `ask_fishball` notice must fit too |
| Caller reason | Raw `ask_fishball` `why` at most **8,192 UTF-8 bytes (8 KiB)**; reject `reason-too-large` before forwarding, no silent truncation to evade this check |
| Wire reason | Separately, approval/prompt/release/grant-revoke reason and descriptor reason ≤500 Unicode code points; required where previously required. Descriptor may truncate caller reason to fit |
| Envelope | 1 MiB; attachment put request/read response 8 MiB; exactly seven envelope keys, exact payload keys, host/direction/scope validation |
| Title/message | `session.start` title needs a visible character: empty/blank/non-visible → `limit-exceeded`, no session created. No new start-title upper bound; DSH rename failures may return `titleError` after creation. Descriptor/prompt titles keep their 200-character cap. Empty message remains allowed |
| Attachments | 4 MiB image, 4,194,304 pixels; 512 KiB decoded chunks; ≤20 hostRefs and ≤1 non-image file/message; single-use hostRef lifetime 600,000 ms; digest/base64/name checks unchanged |
| Other bounds | Questions/answers ≤32, selected labels ≤32; label/header≤200 chars; question/note/feedback/custom≤500; quote≤2048 bytes; arguments≤2000 chars; grant prefix≤512 chars; UI path≤512 chars; list≤100 |
| Read/defaults | `readSessionMessages=12`, `readSessionBytes=12288`, truncation reported; settings remain connector-owned, not remotely mutable |
| Delivery | `delivered | unconfirmed`; unconfirmed is never retried. One terminal reply/request id; settled replay returns remembered reply, running duplicate→`duplicate-request`, changed payload→`conflict` |
| Binding/UI | One instance, frozen read-only `current()`, explicit detach, same-origin validated UI paths, 1.1 `lang` framing behavior, opener/status/retry; fish/managed marks and child iframe remain |
| No instance | Notices queue durably; permission/questions go to requesting session's user, never retro-offered; `ask_fishball` returns `unavailable`; existing queue-bound and user-item exemption remain |

Keep **all** 1.1 §7 codes: attach `instance-busy`, `contract-version`, `ui-invalid`,
`transport-invalid`, `instance-invalid`; frame groups envelope/channel, attachment, session,
answer and grant unchanged. In particular `expired` still means stale/closed offer or invalid
hostRef where applicable; `expires-at-required/invalid/past` still apply to grants; `timeout`
still applies to transport. `reason-too-large`, `queue-full`, `unavailable` remain tool/intake
codes, not new frame codes. Invalid frames close; valid operation refusals stay ordinary errors;
unknown request operations return `unsupported-operation` without closing. Retain unused
`BROWSER_MESSAGE` export as an inert name; this release does not need unrelated export cleanup.

## 6. Package impact (proposal, not a release already made)

Current packages are both `0.1.0-alpha.0`; instance connector peer range is
`>=0.1.0-alpha.0 <2`. **Propose both packages `2.0.0` and instance peer
`>=2.0.0 <3.0.0`** for this incompatible coordinated release. That excludes the currently
published old instance range and old connectors, while runtime contract checks remain mandatory.
Update package comments/docs that currently conflate importing the connector constant with
implementing its contract. Package-major matching is a deliberate release choice, not a protocol
requirement. With one-way MCP and **coordinated removal without migration** now selected, the
numeric version/peer range above remains an unapproved release proposal. Choose a peer range for
the new compatible connector release that excludes old custom-control packages, upgrade built-in
imports and child snapshot composition together, and retain independent runtime semantic checks.
MCP does not make old installations compatible. No manifest is edited by this design.

## 7. Historical custom-option task ownership, freeze gate and acceptance

**Superseded for execution:** use [the revised W0/W1 tasks](<plugins/connector-mcp-option.md#8-tasks-waves-and-package-impact>)
and [extension task table](<plugins/instance-extension-points.md#5-tasks>). K1 now publishes shared
MCP/push schemas and fixtures; W1 MCP-SERVER and FB-PUSH implement the server and return adapter,
with X0-W the scoped control client. No old control endpoint/export retention task survives.
The table/sequence below preserve the parked option only; domain lifecycle requirements still apply.

| Owner | Implementation responsibility |
| --- | --- |
| K1 | Contract constants/validators/exports; independent instance declaration + preflight; exact mismatch diagnostics; 2.x matrix; attention operation and view reset; coordinated package peer/version changes |
| K2 | Remove connector decision settings/timers/descriptor expiry/filtering; terminal-versus-handoff semantics, immediate card clearing, non-time closure and durable marker correlation; timer-free behavior compulsory |
| X0-C | Existing local interfaces/send pass-through/inbox and notification durable identity; no new wire operation |
| X0-A / X0-I | Reached-layer routing/history/settlement, Fishball-only questions; no approval timers or expiry-based held-item drops; claims fenced by generation/incarnation |
| X0-S / WD tasks | Failure→Fishball handover, start fallback, healthy-only gate, dormant recovery and direction refinement; no protocol expansion |
| X0-W / FN-3 / FN-A | Local attention source → optional request → connector view and fish/dot/alert rendering |
| PANELS / PG tasks | No countdown or retained closed-card pile; preserve native DSH/plugin UI and ordinary transcript rendering |
| Board U19 tasks | Instance-local archive/search/uninstall-export; no connector contract delta |

**Sequence:** resolve MCP option → freeze this contract or its chosen replacement → K1 publishes
shared schema/fixtures → connector/core and instance/plugin tracks proceed in parallel against
that baseline. Do not let either track invent a second payload or silently ship half of 2.0.
Acceptance: both mixed-major directions fail before traffic; old auto-import declaration regression;
2.x optional attention absent; attention bounds/reset; removed expiresAt rejected; time advancement
never advances cards; non-time detach/settlement works; escalate does not erase user card;
watchdog-only outcomes never auto-wake Fishball; repeated terminal events settle/clear once;
64 KiB/8 KiB/500-char boundaries and empty-title refusal unchanged. These are design acceptance
criteria, not tests executed in this documentation-only change.
