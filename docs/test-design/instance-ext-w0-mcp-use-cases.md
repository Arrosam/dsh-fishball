# W0 MCP requirements-only use cases and acceptance design

## 1. Human use cases FIRST

These stories are the source of the lower-level cases, not names pasted onto API tests. Samuel is the human actor. The connector and his selected Fishball/external manager are supporting actors. A fixture result is **not** evidence of a rendered badge, real model turn, autonomous third-party wake, deployed MCP server or production acceptance.

### UC-S1 — Samuel delegates work without operating an agent server (MCP-S1)

**Context/trigger:** Samuel wants his chosen assistant to inspect and coordinate one of his managed work sessions. He does not want to install a callback server in that assistant or expose his main DSH credentials. **Goal:** authorized one-way session controls with private provisioning. **Preconditions:** disposable isolated host/manager identities and a related session `mcp-work-17`; unrelated session `mcp-private-88`; test-only generated authentication material. No actual user profile is opened.

| Flow | Human story and supporting-system steps | Acceptance trace / evidence |
| --- | --- | --- |
| Main `MS1-UC-01-M` | Samuel chooses the manager; trusted provisioning gives it its own connector authority. It initializes, discovers and calls a read control for the related work session. No callback MCP server is present. | S1-1/2/3; one-way list/call and explicit packaged dependency observed on **both** host versions; one scoped read with fixture data. MCP-S1 spike acceptance TODO. |
| Alternative `MS1-UC-01-A1` | Samuel chooses a plain tool-only manager with no attention, push, notifications/resources or offer intake. It still inspects his work. | S1-1/3; controls available, no fictitious approval-manager/idle-wake capability. MCP-S1 TODO. |
| Exception `MS1-UC-01-E1` | Another local process copies public client/session metadata and tries to use Samuel’s controls with invalid authentication. | S1-2; refused before scoped work, no credential disclosure. MCP-S1 TODO. |

**Postcondition:** only the authorized scoped manager may act; no main DSH owner secret, callback requirement, global side-agent tool or extra authority is introduced. Bounds/errors/security partitions below refine this goal rather than create a new topology.

### UC-S2 — Samuel’s update is handled once, even when delivery is interrupted (MCP-S2)

**Context/trigger:** a managed session needs Samuel’s assistant while he is away. The assistant may be idle, or a receipt may be lost. **Goal:** recoverable notice/offer delivery and the correct owner of the decision, not duplicate work or a timer-decided permission. **Preconditions:** one durable disposable ledger, stable message `msg-17`, permission offer `offer-17` for `mcp-work-17`, authorized logical owner/generation; first-party push has its own scoped channel authority.

| Flow | Human story and supporting-system steps | Acceptance trace / evidence |
| --- | --- | --- |
| Main `MS2-UC-01-M` | Samuel’s idle Fishball receives an update; its receiver commits acceptance and queueing. Delivery ack is lost. The receiver is reconstructed against the same durable store, and the update is replayed. | S2-1/2/3; same identity reconciles to one routed entry/wake, on both hosts. Pending reservation alone is not delivered. MCP-S2 spike TODO, not a model/UI pass. |
| Alternative `MS2-UC-01-A1` | Samuel chose an authorized external manager that is not currently running or polling. Its delegated permission/question/plan-review waits until it returns; he may take back the card explicitly. | S2-1/4; delegation default-on with **no off setting**; time alone never moves or decides the offer. MCP-S2 TODO. |
| Exception `MS2-UC-01-E1` | First-party push fails while MCP still works. Samuel can still use controls and answer the user fallback card. Push later recovers. | S2-3/4; retire old instance offers, reject late answers, suspend accepted-but-unprocessed child decisions, no retro-offer after recovery, no managed-session stop. MCP-S2 TODO. |

**Postcondition:** ack means durable acceptance, not a decision; fetching/advancing a cursor is not ack. Only the first **COMMITTED** outcome settles a card. Healthy permission claims route locally before Fishball queueing; failed watchdog means Fishball ownership (U20), questions/reviews always Fishball (U21). Runtime integrations remain with MCP-SERVER/FB-PUSH/X0-I/X0-A/K2.

### UC-S3 — Samuel upgrades clients that agree on what they promise (MCP-S3)

**Context/trigger:** Samuel wants to replace/update his manager without accidentally restoring expiry-based approvals or splitting controls across old and new channels. **Goal:** one reviewed interoperable contract, after feasibility evidence, with honest optional degradation. **Preconditions:** S1/S2 reviewed against both supported hosts; no identifier/shape has been invented by the tester.

| Flow | Human story and supporting-system steps | Acceptance trace / evidence |
| --- | --- | --- |
| Main `MS3-UC-01-M` | After feasibility is demonstrated, reviewers agree the controls, structured domain results/errors, capabilities and small event/ack contract that both built-in and external clients must implement. | S3-1/2/3; exact shared baseline, independent behavioral conformance, fencing and first-committed rules. MCP-S3 TODO. |
| Alternative `MS3-UC-01-A1` | Samuel uses a compatible control-only client without optional attention/intake/hints/push. Its limitations are explicit instead of blocking basic controls. | S3-2; zero unread and user-owned nondelegated cards; no idle-wake promise or timer relaxation. MCP-S3 TODO. |
| Exception `MS3-UC-01-E1` | A feasibility question is unresolved on one host. Reviewers do not declare an API frozen just to make a test fail or to satisfy a dependency checkbox. | S3-1; exact naming/mapping stays owner-named TODO until evidence/review, no synthetic red/import failure. MCP-S1/S2/S3 TODO. |

**Postcondition:** removal inventory, peer requirements and snapshot replacement are explicit; actual old endpoint/export removals and built-in upgrades land together in **W1 MCP-SERVER**. Numeric release versions are not approved by these cases. No legacy migration/adapter/dual-control period exists.

### UC-K1 — Samuel returns to current attention and trustworthy client behavior (K1)

**Context/trigger:** Samuel returns after updates or a reconnect and uses attention to decide what needs him. He also expects a compatible manager never to auto-decide because it went idle. **Goal:** shared semantic/rejection fixtures preserve current attention and timer-free behavior. **Preconditions:** MCP-S3 has reviewed exact tool/schema/result/error interfaces; K1 publishes shared conformance fixtures. Until then the domain data are approved but callable bindings are not.

| Flow | Human story and supporting-system steps | Acceptance trace / evidence |
| --- | --- | --- |
| Main `K1-MCP-UC-01-M` | Samuel has no unread report. Fishball reports `{3,1,1700000000123}`, then `{5,0,1700000000999}`; malformed `unread=10000` is refused. He detaches, reauthenticates and gets a fresh `{7,2,1700000001000}` report. | K1-1/2; shared vector zero → `{3,true}` → `{5,false}` → unchanged → zero → zero → `{7,true}`. S3/K1 TODO for frozen conformance binding. |
| Alternative `K1-MCP-UC-01-A1` | Samuel chooses a valid plain manager without optional attention or intake, or an authorized external manager whose offers wait while it is idle. | K1-1/2; first profile has zero/un-delegated cards, second default-on waiting offers; no callback or timer exception. S3/K1 TODO. |
| Exception `K1-MCP-UC-01-E1` | A malformed report arrives after a good one, then a corrected report arrives. | K1-1/2; exact frozen domain refusal, prior value unchanged, next valid update accepted; malformed data does not poison the session. S3/K1 TODO. |
| Later integration `K1-MCP-UC-02-M` | Samuel sees the actual connector projection supplying his mark/frame after the shared report/reset journey. | K1-2/3; real `state.unread`, not authored fixture output. **MCP-SERVER + X0-W + FN-A W1 TODO**. Browser rendering/alert remains FN-A, not W0 evidence. |

**Postcondition:** optional attention never becomes required compatibility or permission for timers. Ordinary HTTP/TCP/optional SSE close preserves the last report. Only explicit detach/logical authenticated-session loss resets it. Reauth starts zero until a report; source may re-report through X0-W/X8. No custom envelope/attach/minor negotiation survives.

## 2. Authority, scope and safety

### Pinned sources

The source worktree `../design-instance-ext` was verified at **15d6f1f214144db3575f9bc0ba15238b1450c2a7**, exact user-pinned revision. Local test starting point was **aad37b27df0f02160f96570e5124d94e9dfb9f5b**. Checked-in old test-design prose is historical, **not** an alternative authority.

- [Extension points, task table](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L506-L524>), [U20/U21 and one-way compatibility](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L204-L449>), [test outline](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L655-L686>), [waves](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L568-L610>), [timer-free scope](<../../../design-instance-ext/docs/plugins/instance-extension-points.md#L1433-L1502>).
- [MCP direction/decisions](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L1-L56>), [capability matrix/mailbox](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L107-L172>), [attachment/routing/security/results](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L174-L269>), [freeze/removal/waves](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md#L272-L342>).
- [Approved design’s superseding MCP amendment](<../../../design-instance-ext/DESIGN.md#L39-L54>). Earlier timer/legacy text is superseded, not a reason to retain old tests.

### Test-only boundary

Owned changes: [K1 cases](<../../packages/dsh-connector/tests/instance-ext/k1.test.mjs>), [new MCP acceptance registration](<../../packages/dsh-connector/tests/instance-ext/mcp-feasibility.test.mjs>), [requirements-only case specification](<../../packages/dsh-connector/tests/instance-ext/mcp-w0-cases.spec.mjs>) and this document. No product implementation was read. Prior tests and [resolver-only safe loader](<../../test/support/body-soul-env.mjs#L30-L48>) were read only to assess usable observation boundaries. No credential store, `.npmrc`, real DSH profile, server launch, restart, dependency installation or full test run is used by this deliverable.

A `.spec.mjs` here is **test-owned acceptance data**, not a proposed application module/export schema. Registering a `test.todo` does not assert the expected behavior and cannot establish a pass. No product behavior is mocked and then asserted. No unconditional failure or import/type failure is used as a missing-feature oracle. The parent runs safe tests separately on **0.2.1-rc.5** and **0.2.2-rc.1**; this author only performs syntax/whitespace/inventory checks.

## 3. Concrete acceptance criteria and completion gates

| AC | Owner / stage | Observable acceptance |
| --- | --- | --- |
| S1-1 | MCP-S1 W0 feasibility | On both hosts, the explicitly selected packaged server dependency supports one-way initialization/list/call from a plain client; no callback server or borrowed devDependency. Record chosen dependency/transport and actual observations. |
| S1-2 | MCP-S1 W0 feasibility | Private connector-scoped per-manager provisioning/discovery; concrete loopback + Host/Origin checks/no wildcard CORS; credentials never reach prompts/tools/logs/UI/export/URL/argv; every request/stream checks admitted identity/scope; second owner/revocation fencing distinguishes logical auth from request lifetime. |
| S1-3 | MCP-S1 W0 feasibility | Required scoped manager controls work; raw MCP cannot bypass X12/X13/X19/image paths; optional features absent do not block control; stock clients on both hosts retain machine domain refusal codes distinctly from MCP protocol failure. |
| S1-4 | MCP-S1 W0 feasibility | Default UTF-8 message/forwarded-body 65,536 bytes, raw reason 8,192 bytes, independent descriptor/decision reason 500 characters and existing attachment/read limits remain; visible start title, no invented 200-character start upper bound; frame/SSE limits separate. |
| S2-1 | MCP-S2 W0 feasibility | Durable per-owner ledger, stable identities, bounded ordered poll, opaque principal/generation cursor, explicit gap/resync, read ≠ ack, ack only after durable acceptance, foreign/stale cursor/ack refused, retained notices not silently lost. Proposed sizes/errors require S3 review. |
| S2-2 | MCP-S2 W0 feasibility | Authenticated first-party event/ack push explicitly wakes the locally routed idle recipient on both hosts, with no control API/arbitrary callback URL; U20 effective-off Fishball handover/no halt, U21 question/review bypass, no automatic Fishball wake for watchdog-only result. |
| S2-3 | MCP-S2 W0 feasibility | Crash/lost-ack reconstruction reconciles reservation/queue storage to one acceptance/wake; atomic pull/push ownership and old-incarnation fencing; intake loss withdraws authority but MCP controls remain; retired offers never revive; unknown mutation stays unconfirmed, no automatic resend. |
| S2-4 | MCP-S2 W0 feasibility | External delegation default-on/no off switch after auth/intake/answer checks; idle never-polling waits; optional retrieval waits bounded/cancellable but never decision deadlines; first COMMITTED outcome wins once, not first fetch/ack/attempt. |
| S3-1 | MCP-S3 W0 freeze | S1/S2 actual reviewed evidence for both hosts precedes exact tool/interface/schema/error freeze. Missing observation contract remains named owner TODO, not invented red API. |
| S3-2 | MCP-S3 W0 freeze | Exact shared controls/results/errors/capabilities, optional attention, event/ack/cursor/gap shapes, ownership/incarnations and timer-free first-committed behavior reviewed, with domain machine-code preservation through both clients and independent conformance. |
| S3-3 | MCP-S3 W0 inventory | Complete removal/consumer/binding/peer/snapshot inventory assigns actual coordinated breaking upgrade to MCP-SERVER/K2/X0-W/FB-PUSH; no legacy migration/adapter/downgrade or unapproved numeric release. |
| K1-1 | K1 W0 publication after S3 | Shared semantic/capability/rejection fixtures independently verify mandatory timer-free semantics and optional degradation, live-offer authority and first commit. No old custom envelope/handshake/minor implementation. |
| K1-2 | K1 W0 fixtures after S3 | Optional payload `{unread,importantUnread,latestAt}` → `{accepted:true}`; integer `0 ≤ importantUnread ≤ unread ≤ 9999`, epoch-ms integer/null; malformed/extra fields refuse with frozen mapping; latest valid retained; projection/reset transitions explicit. |
| K1-3 | MCP-SERVER and adapters W1 | Real runtime projection/auth/fencing/compatibility/removal tests use the reviewed K1 baseline; matching built-ins/peer/snapshot upgrades ship together. K1 defines requirements, does not implement transport/removal/UI. |

### What each TODO is waiting for

- **S1/S2:** an owner-provided executable probe/report observation boundary and actual disposable evidence on both hosts; acceptance is defined now, chosen SDK/harness implementation is ordinary spike engineering, **not a new user business choice**.
- **S3:** S1/S2 review and approved exact names/shapes/mapping. Proposed poll maximum `N`, wait budget `W`, frame/backlog/retention policy are identified unknown data, not secretly fixed test constants.
- **K1:** approved shared profile/schema/validator/conformance binding. W1 cases additionally name runtime owners; there is no W0 server requirement hidden in a schema test.

## 4. Technique partitions (one primary technique per case)

Only **EP, BVA, Decision Table, State Transition and Use Case** are used. Primary categories are mutually exclusive; flow narratives may cross-reference another technique without a second count. Cases are counted by registered case, not assertion, data value, scenario table row or host-version run.

### EP domains and representatives

| Domain | Valid partition / concrete representative | Invalid or degraded partitions / representatives | Case trace |
| --- | --- | --- | --- |
| Runtime packaging | explicit packaged server/transport dependency against each supported runtime | relying only on MCP-client package/devDependency/checkout resolution | MS1-EP-01 |
| Private authority/publication | generated manager A credential, private launcher/config/IPC; admitted origin | copied clientInfo is not auth; public/wildcard bind, foreign Host/Origin, canary in exports/tool output/URL/argv | MS1-UC-01-E1, MS1-EP-02/03 |
| Machine result | successful MCP CallToolResult carrying distinguishable domain outcome | lost `structuredContent` under stock `isError:true`; protocol error confused with `limit-exceeded` | MS1-EP-04, MS3-EP-02 |
| Mailbox ownership | own stable `msg-17`/current cursor, durable acceptance | foreign cursor, foreign ack, authentic stale cursor with gap: **separate cases** | MS2-EP-01/02/03/04 |
| Push scope | first-party authenticated event/ack only | session-control call on push; arbitrary remote callback URL | MS2-EP-05 |
| Semantic profile | compatible timer-free required controls | missing required behavior, malformed declaration, copied declaration without behavior; optional attention/intake absence is degradation not incompatibility | MS3-EP-01, K1-MCP-EP-05 |
| Attention shape | `{0,0,null}` and `{3,1,1700000000123}` / accepted result | missing each field; string count/time; null record; independent unknown `extra:true` | K1-MCP-EP-01/02/03/04 |
| Descriptor expiry | `expiresAt` absent | present past/future/null, independently for permission/question/plan-review; not a grant/hostRef rule | K1-MCP-EP-06 |
| Shared push event/ack | stable msg-17, scoped offer-17, approved unscoped notice, durable-acceptance ack | malformed scope, foreign/replaced-incarnation ack, control payload on push; separate rejection vectors | K1-MCP-EP-08 |
| Shared limit | unread maximum 9999 | missing/wrong shared maximum | K1-MCP-EP-07 |
| Removal inventory | complete old controls + built-in/peer/snapshot references with assigned owner | undocumented compatibility shim, omitted snapshot consumer or numeric-release assumption | MS3-EP-04 |

An inventory case may require several independently reported observations; it does not allow one rejection to mask another. For attention required-field/type vectors and security Host/Origin rejection probes the owner must report **each** result separately when the TODO becomes executable. No authored validator/model is accepted as evidence.

### BVA tables and units

Three-value boundaries are used for high-risk fixed numeric/byte domains. Null/type classes are EP companions within timestamp coverage, not an invented timestamp range.

| Domain / boundary | Concrete values | Expected / trace |
| --- | --- | --- |
| UTF-8 message/forwarded body max 65,536 bytes | 65,535 / 65,536 / 65,537, ASCII and `界` + ASCII tail | first two admitted unchanged; last `limit-exceeded`, no partial delivery; MS1-BVA-01 |
| UTF-8 raw caller reason max 8,192 bytes | 8,191 / 8,192 / 8,193, including multibyte | first two admitted; last `reason-too-large`; MS1-BVA-02 |
| Visible start title (content boundary, not 200 max) | empty; invisible/whitespace-only; `修`; 201 visible ASCII characters | reject no visible content before creation; no invented 200-character refusal; MS1-BVA-03 |
| Poll page bound **proposed `N`, unapproved value** | ledger N−1 / N / N+1 items; empty/over-limit requests | bounded ordered page, explicit remainder/gap, no silent consume; invalid request policy freezes in S3; MS2-BVA-01 |
| Retrieval wait **proposed `W` below caller/server budgets** | no event; event W−1; expiry W; cancellation | finite empty/page/cancel, no card decision/ack; optional long-poll omission explicitly N/A, bounded poll mandatory; MS2-BVA-02 |
| Independent units/schema review | 64 KiB body; 8 KiB raw reason; 500-character descriptor reason; 9999 unread; inherited read/attachment bounds | defaults/bounds/errors documented separately from MCP frame/backlog bounds; MS3-BVA-01 |
| Unread minimum 0 | −1 / 0 / 1, `importantUnread=0` | refuse / conform / conform; K1-MCP-BVA-01 |
| Unread maximum 9999 | 9998 / 9999 / 10000 | conform / conform / refuse; K1-MCP-BVA-02 |
| Important unread minimum 0 and dependent max `unread=5` | −1 / 0 / 1; 4 / 5 / 6; independent 0.5 | −1/6/0.5 refuse; others conform; K1-MCP-BVA-03 |
| Timestamp domain | null / 0 / 1700000000123 / 1.5; independent unread 0.5 | null/integers conform, fractions refuse; K1-MCP-BVA-04. No invented negative/safe-integer/max bound. |

## 5. Decision Tables with concrete rules

`—` means outcome-independent. Infeasible combinations (e.g. simultaneously control-ready and logically revoked) are excluded; optional feature absence never implies revoked identity. Table subrules are explicitly enumerated data under one registered acceptance obligation when they share a review boundary; they are not claimed as separately executable test counts.

### S1 scoped-control rules

| Rule / case | Admitted manager? | Session related? | Caller / gate state | Input | Expected |
| --- | --- | --- | --- | --- | --- |
| S1-R1 / MS1-DT-01 | yes | yes | manager read | read `mcp-work-17` | one scoped read |
| S1-R2 / MS1-DT-02 | yes | no | manager read | read `mcp-private-88` | refusal before read |
| S1-R3 / MS1-DT-03 | — | yes | read-only side agent, raw mutator | session mutation | refused, X12/X13 cannot be bypassed |
| S1-R4a / MS1-DT-04 | yes | yes | healthy watchdog, no active brief | text/image message | X19 refuses, nothing leaves child |
| S1-R4b / MS1-DT-04 | yes | yes | watchdog failed/off, retained brief irrelevant | same message | Fishball owns, send passes, no halt |

### S2 delivery/authority/routing rules

| Rule / case | Valid logical MCP? | Intake/answer authority | Event and additional condition | Expected |
| --- | --- | --- | --- | --- |
| S2-R1 / MS2-DT-01 | yes | supported authorized external | no hints/push, idle, no poll | default-on delegation; item waits; no off setting |
| S2-R2 / MS2-DT-02 | yes | absent/control-only | discoverable answer/guessed id | controls yes; user card stays nondelegated; answer denied |
| S2-R3 / MS2-DT-03 | **no** | push still alive | logical auth lost | withdraw offers/fallback, no stale answer or session stop |
| S2-R4 / MS2-DT-04 | yes | first-party ready | permission + healthy current session claim | watchdog claim-incarnation queue/wake only; no automatic Fishball result wake |
| S2-R5 / MS2-DT-05 | yes | first-party ready | permission + watchdog failed/off/not ready | release claim; Fishball once; gate passes/no halt |
| S2-R6a / MS2-DT-06 | yes | first-party ready | question + any active/paused/dormant/failed claim | Fishball, never watchdog queue/context |
| S2-R6b / MS2-DT-06 | yes | first-party ready | plan review + same claim classes | Fishball, optional refinement independent |

Ordinary notices follow existing X9 filters, not a blanket permission-claim route. Lack of polling, optional SSE close and an isolated unknown request timeout are **not** S2-R3.

### S3/K1 compatibility and answer-authority rules

| Rule/data | Client → connector | Required semantic behavior | Optional / live offer state | Expected / cases |
| --- | --- | --- | --- | --- |
| C1 | new MCP → new MCP | conforming | attention/intake present | scoped control, authorized offers; MS3-DT-01, K1-MCP-DT-01 |
| C2 | new MCP → new MCP | conforming | attention/intake absent | controls yes, zero unread, user-owned nondelegated cards; same cases |
| C3 | new MCP → new MCP | missing required timer-free behavior | — | incompatibility before delegation; same cases |
| C4 | old custom (including 1.1 timer contract) → new MCP | incompatible | — | refuse before delegation, no legacy adapter; same cases |
| C5 | new built-in → old custom | incompatible peer/preflight | — | refuse before delegation, no downgrade; same cases |
| D1 | external owner A → new MCP | control-ready + supported intake/answer | live offer-17/current generation | default-on/no opt-in/off setting; MS3-DT-02, K1-MCP-DT-02 |
| D2 | external owner A → new MCP | control-only | live or guessed id | no decision authority; same cases |
| D3 | external owner A → new MCP | offer-capable | retired offer-17, foreign offer or old generation | no terminal change; same cases |
| D4 | external owner A → new MCP | acked item only | no live offer decision authority | ack grants no answer right; same cases |

The schema review cases define shared fixture requirements; **K1-MCP-DT-03** owns later MCP-SERVER/X0-W/K2 runtime proof of compatibility, second owner and revoked auth. **K1-MCP-DT-04** owns later coordinated removal/built-in/peer/snapshot proof (MCP-SERVER/X0-W/FB-PUSH/K2), not W0 actual deletion.

## 6. State Transition tables with concrete event data

### ST-A — logical attachment/authority

| Current state | Event / guard | Next state and action | Invalid/preserving behavior | Trace |
| --- | --- | --- | --- | --- |
| DETACHED | approved auth + initialize + required controls, owner A | CONTROL_READY, server-bound generation | copied metadata/invalid auth cannot enter | MS1-UC-01-E1, MS1-ST-02, MS3-ST-01 |
| CONTROL_READY | authorized supported intake/answer becomes ready | OFFER_CAPABLE | discovered tools/ack alone insufficient | MS2-DT-01/02, MS3-ST-01 |
| OFFER_CAPABLE | first-party intake fails, MCP valid | CONTROL_READY + user fallback; suspend unprocessed child decisions | old offer answers fail; no control loss/stop | MS2-UC-01-E1, MS2-ST-05 |
| CONTROL_READY / OFFER_CAPABLE | short HTTP/TCP close, optional SSE close or idle no-poll | same logical state | never manufacture detach/timeout decision | MS1-ST-01, MS2-ST-06 |
| CONTROL_READY / OFFER_CAPABLE | actual logical MCP termination/revocation/proven authenticated-session loss | DISCONNECTED / DETACHED as applicable; withdraw authority | alive push cannot answer | MS1-ST-02, MS2-DT-03 |
| DISCONNECTED | same owner reauth + required checks | CONTROL_READY, then fresh authorized intake may enable offers | old retired offers never revive | MS2-ST-05, MS3-ST-01 |
| ANY | detach/revoke/owner replacement | DETACHED; old credentials/generation/incarnation invalid | old cursor/ack/claim/answer cannot mutate replacement | MS1-ST-02, MS2-EP-02/03, MS2-ST-03 |

An isolated timeout leaves a mutation **unconfirmed**, without automatically proving logical MCP loss; no automatic resend. Runtime no-off/default-on and first-committed/card clearing are later **K1-MCP-ST-04**, owners MCP-SERVER/K2/FB-PUSH/X0-I/X0-A.

### ST-B — durable acceptance, ack, routing and decision

| Current state | Event / concrete data | Next state / required action | Invalid transition or invariant | Trace |
| --- | --- | --- | --- | --- |
| ledger pending | bounded poll of msg-17 / cursor advance | ledger pending, same stable identity | read is not ack | MS2-EP-01 |
| reservation pending | fail before queue commit, reconstruct receiver | reconcile/retry, then accepted once | reservation is never delivered/acked | MS2-ST-01 |
| queue durably accepted | fail before ack, replay msg-17 | reconcile existing acceptance; retry ack; startup wake once | replay cannot append a second queue entry/wake | MS2-UC-01-M, MS2-ST-02 |
| pull owner | atomic transfer to push owner incarnation | same ledger identity, exactly one delivery mode | old pull ack/claim rejected | MS2-ST-03 |
| offered and authorized | ack/durable acceptance only | accepted, undecided | ack is not answer/first winner | MS2-ST-04, MS3-ST-02 |
| offered/accepted | time advances, no poll | unchanged, waiting | no timeout approve/reject/escalation | MS2-UC-01-A1, MS2-ST-06 |
| live offer | user rejects and commits while earlier agent attempt paused | terminal user rejection; one result/clear/eligible notification | late agent commit cannot overwrite | MS2-ST-04 |
| live offer | agent commits allow before later user rejection | terminal agent result; once-only side effects | late user attempt cannot replace | MS2-ST-04 |
| live offer | explicit escalation/handoff | user-owned live card | handoff is not terminal closure | MS3-ST-02 |
| retired/user-owned offer-17 | push recovers/replays/late decision | unchanged; old answer refused, fresh offer-18 may delegate | no retro-offer | MS2-ST-05 |

Crash/reconstruction is **a proposed disposable spike observation**, not permission for this test author to restart DSH. “One wake” requires evidence of durable queue reconciliation, not an in-memory Set, pending-ID assumption or an own mock proving itself.

### ST-C — optional attention and latest-valid/reset projection

Projection is `state.unread = {count: unread, important: importantUnread > 0}`. “Latest valid” is the last admitted report, **not** maximum count or timestamp. All table values are approved domain data, not invented MCP method names.

| Current | Event | Next projection / behavior | Trace |
| --- | --- | --- | --- |
| no value | attention absent | `{count:0,important:false}` | K1-MCP-UC-01-A1 |
| none | `{unread:3,importantUnread:1,latestAt:1700000000123}` accepted | `{3,true}` | K1-MCP-UC-01-M |
| `{3,true}` | `{5,0,1700000000999}` accepted | `{5,false}` | K1-MCP-UC-01-M |
| `{5,false}` | invalid unread=10000 / missing/type/extra vector | unchanged; frozen refusal | K1-MCP-UC-01-E1, EP/BVA fixtures |
| `{7,true}` | later admitted report `{1,0,1700000000123}` with older payload timestamp | `{1,false}` | K1-MCP-ST-01 |
| `{5,false}` | ordinary HTTP/TCP close, optional GET/SSE close | unchanged | K1-MCP-ST-02 |
| `{5,false}` | detach OR actual logical authenticated-session loss | `{0,false}` | K1-MCP-ST-02 |
| `{0,false}` after loss | fresh reauth, no report yet | remains `{0,false}` | K1-MCP-ST-02 |
| reauthenticated zero | current valid report `{7,2,1700000001000}` | `{7,true}` | K1-MCP-UC-01-M |
| any current owner value | revoked/old-owner report | refused, current state unchanged | K1-MCP-ST-03 runtime |

Shared conformance ST-01/02 waits for S3/K1 validator/profile binding. Real projection **ST-03/UC-02-M** waits for MCP-SERVER/X0-W; do not substitute old custom frames. UI remains FN-A.

## 7. Case inventory and execution status

Full concrete preconditions/data/outcomes and exact owner/stage for every case are in [test-owned specification](<../../packages/dsh-connector/tests/instance-ext/mcp-w0-cases.spec.mjs>); its records are registered as real `it.todo` entries by [feasibility tests](<../../packages/dsh-connector/tests/instance-ext/mcp-feasibility.test.mjs>) and [K1 tests](<../../packages/dsh-connector/tests/instance-ext/k1.test.mjs>). Every TODO title names its owner and required acceptance rather than a vague “integration later”.

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
| --- | --- | --- | --- | --- | --- | --- |
| MS1-UC-01-M | Delegate without agent server | Both hosts, provision/list/call related session | Use Case | S1-1/2/3 | scoped one-way read; private evidence | Not Run |
| MS1-UC-01-A1 | Use limited client | no optional channels/intake | Use Case | S1-1/3 | controls yes, no wake/offer promise | Not Run |
| MS1-UC-01-E1 | Reject copied metadata | invalid auth + copied clientInfo | Use Case | S1-2 | no domain read/secrets | Not Run |
| MS1-EP-01 | Package server explicitly | disposable package, both hosts | EP | S1-1 | no devDependency fallback | Not Run |
| MS1-EP-02 | Keep provisioning private | test canaries in all output/config surfaces | EP | S1-2 | zero public canary leakage | Not Run |
| MS1-EP-03 | Enforce local binding | loopback vs wildcard/foreign Host/Origin | EP | S1-2 | only authenticated local policy admits | Not Run |
| MS1-EP-04 | Preserve refusal codes | stock clients, domain vs RPC failure | EP | S1-3 | machine codes distinguishable | Not Run |
| MS1-BVA-01 | Bound message bytes | 65535/65536/65537 UTF-8 | BVA | S1-4 | admit/admit/limit-exceeded | Not Run |
| MS1-BVA-02 | Bound raw reason bytes | 8191/8192/8193 UTF-8 | BVA | S1-4 | admit/admit/reason-too-large | Not Run |
| MS1-BVA-03 | Require visible title | empty/invisible/修/201 visible chars | BVA | S1-4 | visible required, no invented 200 cap | Not Run |
| MS1-DT-01 | Scope related read | S1-R1 | Decision Table | S1-3 | one read | Not Run |
| MS1-DT-02 | Refuse unrelated read | S1-R2 | Decision Table | S1-3 | no read | Not Run |
| MS1-DT-03 | Fence side agent | S1-R3 | Decision Table | S1-3 | no raw mutator bypass | Not Run |
| MS1-DT-04 | Apply healthy-only gate | S1-R4a/b, text/image sends | Decision Table | S1-3 | healthy refusal, failed/off passes/no halt | Not Run |
| MS1-ST-01 | Preserve logical session | ordinary HTTP/SSE close then request | State Transition | S1-2 | authority remains | Not Run |
| MS1-ST-02 | Revoke old owner | A revoke, stale call, enroll B | State Transition | S1-2 | no stale authority/second owner | Not Run |
| MS2-UC-01-M | Handle update once | accept, lost ack, reconstruct/replay | Use Case | S2-1/2/3 | one routed queue/wake | Not Run |
| MS2-UC-01-A1 | Leave idle offers waiting | no polls, advance clock | Use Case | S2-1/4 | default-on waits, no off switch/timer | Not Run |
| MS2-UC-01-E1 | Recover push loss | MCP alive, retire/recover push | Use Case | S2-3/4 | controls yes; fallback, no retro-offer/stop | Not Run |
| MS2-EP-01 | Read without consuming | cursor advance without ack | EP | S2-1 | item replayable | Not Run |
| MS2-EP-02 | Refuse foreign cursor | B reads A cursor | EP | S2-1/3 | no page/consume | Not Run |
| MS2-EP-03 | Refuse foreign ack | B acks A msg-17 | EP | S2-1/3 | item remains pending | Not Run |
| MS2-EP-04 | Signal stale gap | authentic stale cursor/live msg-18 | EP | S2-1 | explicit resync, no silent loss | Not Run |
| MS2-EP-05 | Limit push to events/acks | mutator/arbitrary callback attempts | EP | S2-2/3 | no second control/reverse MCP | Not Run |
| MS2-BVA-01 | Bound pages | proposed N−1/N/N+1 | BVA | S2-1 | bounded/remainder explicit | Not Run |
| MS2-BVA-02 | Bound retrieval wait | proposed W−1/W/cancel | BVA | S2-1/4 | bounded/cancel, no decision effect | Not Run |
| MS2-DT-01 | Delegate by default | S2-R1 | Decision Table | S2-4 | no opt-in/off setting | Not Run |
| MS2-DT-02 | Separate control/intake | S2-R2 | Decision Table | S2-4 | no unauthorized offers | Not Run |
| MS2-DT-03 | Require MCP authority | S2-R3 | Decision Table | S2-3/4 | alive push insufficient | Not Run |
| MS2-DT-04 | Route healthy permission | S2-R4 | Decision Table | S2-2 | claimant only, no Fishball-only wake | Not Run |
| MS2-DT-05 | Hand over faulty watchdog | S2-R5 | Decision Table | S2-2 | Fishball once/no halt | Not Run |
| MS2-DT-06 | Bypass questions/reviews | S2-R6a/b | Decision Table | S2-2 | Fishball always | Not Run |
| MS2-ST-01 | Recover reservation | fail before queue commit | State Transition | S2-1/3 | no false ack/delivery | Not Run |
| MS2-ST-02 | Recover accepted queue | commit then fail before ack | State Transition | S2-1/3 | one wake, reconcile/ack | Not Run |
| MS2-ST-03 | Transfer pull/push ownership | old ack after atomic handover | State Transition | S2-1/3 | same ledger/one consumer | Not Run |
| MS2-ST-04 | Race commits, not attempts | pause earlier attempt, reverse commit orders | State Transition | S2-3/4 | first committed wins once | Not Run |
| MS2-ST-05 | Keep retired offer retired | outage/recovery/replay then fresh offer | State Transition | S2-3/4 | no retro-offer | Not Run |
| MS2-ST-06 | Preserve idle authority | no polling/SSE close/isolated timeout | State Transition | S2-4 | wait/unconfirmed, no retry | Not Run |
| MS3-UC-01-M | Agree shared upgrade | after both spikes, two clients review | Use Case | S3-1/2/3 | reviewed exact baseline | Not Run |
| MS3-UC-01-A1 | Retain limited controls | optional capabilities absent | Use Case | S3-2 | zero/nondelegated, no callback | Not Run |
| MS3-UC-01-E1 | Withhold premature freeze | one-host spike unresolved | Use Case | S3-1 | named gap, no invented API | Not Run |
| MS3-EP-01 | Freeze independent conformance | compatible/missing/malformed/degraded | EP | S3-2 | semantic, not declaration echo | Not Run |
| MS3-EP-02 | Freeze code mapping | limit/reason/expired/unavailable/queue-full | EP | S3-2 | exact machine-readable domain mapping | Not Run |
| MS3-EP-03 | Freeze minimal event/ack | identity/scope/cursor/incarnation/gap fields | EP | S3-2 | explicit names/shapes after S2 | Not Run |
| MS3-BVA-01 | Freeze independent units | body/raw reason/descriptor/unread/page/frame | BVA | S3-2 | exact bounds, no approval deadline | Not Run |
| MS3-DT-01 | Freeze mixed peers | C1–C5 | Decision Table | S3-2/3 | required mismatch refuses/degraded optional | Not Run |
| MS3-DT-02 | Freeze default-on delegation | D1–D4/settings review | Decision Table | S3-2 | no opt-in/off switch | Not Run |
| MS3-ST-01 | Freeze logical authority | ST-A | State Transition | S3-2 | loss distinct from request close | Not Run |
| MS3-ST-02 | Freeze settlement/history | ST-B | State Transition | S3-2 | no timers, first commit/reached layers | Not Run |
| MS3-EP-04 | Inventory breaking removal | endpoints/exports/consumers/peer/snapshot | EP | S3-3 | W1 owner assigned/no migration | Not Run |
| K1-MCP-UC-01-M | Return to current attention | ST-C shared main vector | Use Case | K1-1/2 | latest valid/reset/re-report | Not Run |
| K1-MCP-UC-01-A1 | Use optional degradation | limited external vs idle offer-capable | Use Case | K1-1/2 | zero/nondelegated vs waiting | Not Run |
| K1-MCP-UC-01-E1 | Recover malformed update | good/bad/corrected report | Use Case | K1-1/2 | refuse unchanged, next valid works | Not Run |
| K1-MCP-EP-01 | Validate shared domain | zero/null and epoch-ms payload/result | EP | K1-2 | conforming shared vectors | Not Run |
| K1-MCP-EP-02 | Refuse missing fields | one omitted field per vector | EP | K1-2 | exact frozen mapping/no update | Not Run |
| K1-MCP-EP-03 | Refuse wrong types | string primitives/null payload separately | EP | K1-2 | no coercion/no update | Not Run |
| K1-MCP-EP-04 | Refuse extra field | extra:true | EP | K1-2 | frozen rejection/no update | Not Run |
| K1-MCP-EP-05 | Reject declaration shortcut | same declaration, wrong timed behavior | EP | K1-1 | independent conformance | Not Run |
| K1-MCP-EP-06 | Reject removed expiry | absent vs past/future/null in each descriptor | EP | K1-1 | no legacy exception | Not Run |
| K1-MCP-BVA-01 | Bound unread minimum | −1/0/1 | BVA | K1-2 | refuse/conform/conform | Not Run |
| K1-MCP-BVA-02 | Bound unread maximum | 9998/9999/10000 | BVA | K1-2 | conform/conform/refuse | Not Run |
| K1-MCP-BVA-03 | Bound important count | −1/0/1/4/5/6 at unread 5; 0.5 | BVA | K1-2 | relationship/integer enforcement | Not Run |
| K1-MCP-BVA-04 | Distinguish timestamp class | null/0/epoch/1.5; fractional count | BVA | K1-2 | integers/null only | Not Run |
| K1-MCP-DT-01 | Publish peer fixtures | C1–C5 | Decision Table | K1-1 | required semantics/optional degradation | Not Run |
| K1-MCP-DT-02 | Publish answer-authority fixtures | D1–D4 | Decision Table | K1-1 | live authorized offer only | Not Run |
| K1-MCP-ST-01 | Keep latest admitted report | later report with older latestAt | State Transition | K1-2 | replace, not max timestamp/count | Not Run |
| K1-MCP-ST-02 | Publish logical reset table | ordinary close vs logical loss/reauth | State Transition | K1-1/2 | preserve vs zero | Not Run |
| K1-MCP-UC-02-M | Observe runtime projection | W1 real connector state journey | Use Case | K1-2/3 | shared vector observed, no UI claim | Not Run |
| K1-MCP-ST-03 | Observe real logical reset | W1 ordinary close then auth loss | State Transition | K1-2/3 | preserve then zero/no old owner | Not Run |
| K1-MCP-DT-03 | Observe runtime peer/fence checks | W1 mismatches/second owner/revocation | Decision Table | K1-1/3 | no traffic/delegation before compatibility | Not Run |
| K1-MCP-DT-04 | Observe coordinated removal | W1 built artifacts/bindings/peers/snapshot | Decision Table | K1-3 | one control plane, unrelated services stay | Not Run |
| K1-MCP-ST-04 | Observe real waiting/commit races | W1 idle/time/user-agent race | State Transition | K1-1/3 | wait, first COMMITTED wins/clear once | Not Run |
| K1-MCP-EP-08 | Publish shared push fixtures | scoped/unscoped event, durable ack vs foreign/incarnation/control payload | EP | K1-1 | valid classes conform, invalid mapped, no second control | Not Run |
| K1-MCP-EP-07 | Preserve shared domain limit | reviewed shared schema/limit binding, no old loader | EP | K1-2 | maximum 9999, no framing assertion | Not Run |

### Counts (executable / TODO, primary technique)

| Task | EP | BVA | Decision Table | State Transition | Use Case | Total |
| --- | --- | --- | --- | --- | --- | --- |
| MCP-S1 | 0 / 4 | 0 / 3 | 0 / 4 | 0 / 2 | 0 / 3 | **0 / 16** |
| MCP-S2 | 0 / 5 | 0 / 2 | 0 / 6 | 0 / 6 | 0 / 3 | **0 / 22** |
| MCP-S3 | 0 / 4 | 0 / 1 | 0 / 2 | 0 / 2 | 0 / 3 | **0 / 12** |
| K1 | 0 / 8 | 0 / 4 | 0 / 4 | 0 / 4 | 0 / 4 | **0 / 24** |
| **Total** | **0 / 21** | **0 / 10** | **0 / 16** | **0 / 14** | **0 / 13** | **0 / 74** |

K1 TODO split: **19 W0 shared acceptance**, **5 W1 integration**. S1/S2/S3 remain 50 W0 acceptance TODOs pending an approved observation boundary/evidence. **No executable MCP case is claimed.** The old contract loader was removed: retaining it would accidentally require an obsolete control export to survive W1 removal. The meaningful unread maximum and all payload fixtures remain concrete K1 acceptance obligations awaiting the reviewed shared binding. This is honest unresolved execution scope, not a fabricated red API/import gate; TODO registration cannot make W0 complete.

## 8. Obsolete IDs retired, not silently reused

All **15 prior K1 registered IDs** retire because their asserted contract/transport/ownership is superseded, even when some payload values survive. New IDs deliberately include `K1-MCP` to avoid claiming old passes apply to the new architecture.

| Old IDs | Retirement reason / surviving acceptance |
| --- | --- |
| K1-EP-V-01 | old major=1/minor=2 gate dropped; no replacement numeric version assertion |
| K1-EP-V-02 | only domain maximum survives as K1-MCP-EP-07 TODO; no old loader/export binding |
| K1-EP-V-03 | historical operation id/direction export is not an approved MCP tool binding |
| K1-EP-V-04 | custom envelope round-trip retired; payload/result fixtures survive in K1-MCP-EP-01 |
| K1-EP-V-05 | custom host bridge capability/welcome/request framing retired; runtime belongs MCP-SERVER |
| K1-EP-01 | data partitions survive as separate shared missing/type/extra fixtures, no old validateRequest binding |
| K1-EP-02 | custom checkHandshake/required old capabilities retired; semantic optionality lives in new fixtures |
| K1-BVA-01/02/03 | domain boundaries survive in new BVA cases, not old custom-operation validator calls |
| K1-DT-01 | lower-minor custom negotiation retired entirely; no legacy peer compatibility |
| K1-UC-01-M | real DSH boot/custom control journey retired; shared story + later runtime TODO replaces it |
| K1-UC-01-A1 | **ordinary transport-close reset expectation is wrong for MCP**; logical auth reset vs preserving HTTP/SSE close now distinct |
| K1-UC-01-E1 | custom error/response frame recovery retired; shared domain refusal + later runtime observation replaces it |
| K1-UC-01-E2 | legacy 1.1 attachment success forbidden; old custom/timer consumer incompatible before delegation |

The table’s slash-grouped BVA entry expands to three cases; prior K1 had EP-V=5, EP=2, BVA=3, DT=1, UC=4, for **15 registered cases**. Historical aliases mentioned by earlier design docs are not additional registered cases. This ledger records the precise count to prevent alias or table-row inflation.

## 9. One actual freeze question, not reopened product decisions

**Question for MCP-S3/K1 owner:** no exact callable tool/profile/validator/probe/report names, shared file/export path, result/error mapping or event/ack schema has been approved at this revision. How should these test bindings be finalized?

- **A:** review and approve a concrete schema/binding proposal now, but only after MCP-S1/S2 evidence on both hosts; then bind these cases to it.
- **B (recommended):** retain owner-named acceptance TODOs and review the concrete acceptance criteria first; MCP-S3/K1 subsequently freezes exact identifiers/shapes/error mapping, then the test author binds cases to that reviewed contract.

No question remains about push vs polling-only Fishball, one-way vs callback MCP, external delegation permission/default/off switch, idle waiting, first-committed outcome, U20 no-halt or U21 bypass. SDK/fixture implementation choice is engineering owned by the spike, not a new business-policy ambiguity. Numeric release versions remain release bookkeeping, not a license for a broad old-compatible peer range. Timestamp negative/safe-integer bounds, proposed retention/page/frame values and exact rejection representation remain within schema-freeze review; this test author does not silently invent them.

## 10. Verification log

- Requirements and prior tests/support only read; no product implementation/credential files inspected.
- Syntax checks and whitespace/inventory results are recorded with the handoff; **no safe suite or runtime/product test result is claimed by this author**.
- Parent executes the full safe suite independently against both supported runtimes. W0 cannot be called complete from TODO registration, documentation, a single limit assertion or self-validating fixture data.
