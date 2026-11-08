# W0 core use cases — local X0-C seams

## Authority and scope

Requirements-only authoring against pinned design **`15d6f1f214144db3575f9bc0ba15238b1450c2a7`**: [extension points](<../../../design-instance-ext/docs/plugins/instance-extension-points.md>) §1, §2.1/§2.4–§2.7, §5.4/§5.5, §6 and **all of §12.5–§12.5.2**; [one-way MCP decisions](<../../../design-instance-ext/docs/plugins/connector-mcp-option.md>) §0/§4.1/§5/§8; [approved design](<../../../design-instance-ext/DESIGN.md>) one-way MCP amendment. The pinned sibling design worktree is authoritative even when this checkout's linked documents are older.

X0-C owns the local extension service, manager/chat, durable notification/intake seams, X19 pass-through call sites and typed ports for W1 adapters. It does **not** implement MCP hosting, a second control API, authenticated push, wire acknowledgements or real-loader/model integration. Those continuations below are owner-named `it.todo`. Existing safe child-row fixtures are reused; no product implementation or shared helpers are read/changed to derive expected behavior. No real DSH/server/restart is run.

## Human story — Samuel continues work without lost or repeated plugin updates (X0-C)

**Everyday trigger:** Samuel returns to his ongoing Fishball conversation while plugins join it and a helper supplies updates. Sometimes the helper is unavailable and Fishball must supervise directly. Samuel wants to carry on once, with the right capability and every update intact, rather than restart work or chase duplicate notices.

**Outcome / never happens:** A plugin's scoped capability appears on create/resume or live registration without a failing neighbor breaking the conversation. Waking updates queue once; quiet ones join the next turn. A durable reservation is not delivery: after queue failure or same-home child-row rebuild, the same key retries **the same message identity**, and only an accepted key returns `duplicate`. Neither watchdog faults nor absence block ordinary sends or stop sessions. W0 proves supplied agent/service/connector boundaries, not rendered chat, actual model completion, full durable DSH queue recovery or MCP/push delivery.

### Use Case flows FIRST

| Flow/test ID | Preconditions and actor action | Expected observable outcome / owner |
| --- | --- | --- |
| XC-UC-01-M | Before activation, plugins register manager tools/sections; Samuel opens chat. | Persona precedes registrations in registration order. Executable X0-C. |
| XC-UC-01-A1 | Existing manager session is resumed through the fixture agent service. | Registration reapplies in the resumed scope; not a process-restart claim. Executable X0-C. |
| XC-UC-01-A2 / A3 | A plugin joins a live idle / running fixture manager. | Same scope immediately gains its capability. Executable X0-C. |
| XC-UC-01-E1 | One setup callback throws; another healthy plugin registers; resume repeats the failing callback. | Log once per plugin/point, skip failure, retain healthy capability. Executable X0-C. |
| XC-UC-01-A4 | Register/dispose during a real running model turn. | Next request includes then omits tool/section. TODO **X-E2E**. |
| XC-UC-01-A5 | Board-like plugin registers dynamic `systemPrompt.context` on the live manager, then disposes. | Dynamic context is available then removed together with its setup fiber; no extra turn. TODO **X0-C/X-E2E** with approved DSH context callback fixture (current generic map stub does not evaluate a real dynamic context). |
| XC-UC-01-E2 | Async setup callback fulfills after registration, or rejects while a healthy neighbor registers; exercise create/resume/live. | Complete/failed callback effects and failure isolation follow one declared async policy, log once, never leak disposed contributions. TODO **X0-C**: §6 lists async but does not freeze whether registration awaits completion or how rejected partial setup is unwound; clarify before asserting timing. |
| XC-UC-02-M | Plugin sends a fresh-key waking notice. | One queued turn with exact plugin source. Executable X0-C. |
| XC-UC-02-A1 | Plugin sends a fresh-key quiet notice; Samuel later submits a turn. | No independent wake; held text joins that turn. Executable X0-C. |
| XC-UC-02-A2 / A3 | Plugin sends waking notice while manager is idle / busy. | One supplied-agent followup in either state. Executable X0-C. |
| XC-UC-02-E1 | Sender retries an accepted key with different text. | `duplicate`, no second followup or replacement text. Executable X0-C. |
| XC-UC-02-E2 | Accepted update survives rebuilt child rows on the same home, with retained fixture DSH history. | Rebuilt service returns `duplicate`, queues nothing, retains user history. Executable X0-C; not real process recovery. |
| XC-UC-02-E3 | Durable queue accepted a notice but its acceptance receipt/accepted-store write was lost; rebuild and retry. | Reconcile same identity, never lose notice or queue a second turn. TODO **X0-C + FB-PUSH/X-E2E**: current fake followup has no durable queue-acceptance ledger. |
| XC-UC-02-E4 | Reservation persistence itself fails, then storage recovers. | Never claim accepted delivery without reservation; recover and deliver one stable identity. TODO **X0-C**: freeze safe persistence-fault fixture, not an invented storage port. |
| XC-UC-02-A4 | Quiet pending/accepted notice survives same-home recovery before Samuel's next turn. | One held notice, no independent wake or duplicate inclusion. TODO **X0-C/X-E2E**: durable hold acceptance/recovery observation is not supplied by the current fake agent. |
| XC-UC-03-M1 / M2 | Watchdog disabled; Fishball messages / redirects a managed target without a brief. | Exact unchanged connector operation/payload, successful result. Executable X0-C. |
| XC-UC-03-A1 / A2 | Same effective-off condition; Fishball uses `fishballImages.message` with empty / omitted attachments. | One exact `session.message`, unchanged target/text, `attachments:[]`, delivered result unchanged; no upload/watch. Executable X0-C. |
| XC-UC-03-F | Watchdog was healthy, fails, and hands supervision/permission routing to Fishball. | Both send paths pass, claims release, no managed session stops, one retryable cause/session notice. TODO **X0-S/X0-A/X0-I/WD-13**; X0-C's enabled-but-unregistered cases prove only local effective-off pass-through. |
| XC-UC-04-M | Three already sender-framed inbox texts arrive at local chat in order. | One user-role followup, exactly joined by `\n\n`, one text block and queued id equal to `{messageId}` receipt. Executable X0-C. |
| XC-UC-04-E1 | A middle item is invalid, with an image present on an earlier item. | Whole attempt rejects before image fetch/partial queueing. Executable X0-C. |
| XC-UC-04-A1 | Valid image-bearing items are prepared, or image preparation fails. | Item/image order preserved; failure queues no partial turn. TODO **X0-I/FN-6 image integration** with valid attachment/model fixture. |
| XC-UC-05-M | W1 control adapter binds through the local typed port while first-party intake supplies durable events. | One control plane; no raw-tool bypass of X12/X13/X19, intake routes before queue/wake and acks only after durable acceptance. TODO **MCP-S3/K1/X0-C + X0-W/FB-PUSH** until exact local port names/shapes are frozen. |

### State Transition oracle — notification reservation is not delivery

| Current state | Trigger | Required next state / action | Cases |
| --- | --- | --- | --- |
| unseen | notify starts | Persist pending key and stable nonempty message identity before queue/hold | XC-DT-01 |
| pending | queue rejects | Remain retryable, zero accepted turns; never answer delivered duplicate | XC-DT-01 |
| pending | retry in same child | Reuse reserved message id; acceptance queues once | XC-DT-01 |
| pending | rebuilt service retries handover / recovery | Same reserved id survives disk recovery; one accepted followup | XC-ST-NOTIFY-HANDOVER / RECOVERY |
| accepted | retry in process / after rebuild | `duplicate`, no new queue call | XC-UC-02-E1 / E2; XC-ST-NOTIFY-* |
| pending plus newest accepted history | accepted history reaches 9,999 / 10,000 / 10,001 keys | Trim accepted history only; pending key/id survives and retries | XC-BVA-KEYS-9999/10000/10001 |
| queue accepted, receipt not committed | crash/retry | Reconcile against durable queue by the same identity, no second turn | XC-UC-02-E3 TODO |

These semantics apply to **every `manager.notify` caller**, explicitly handover and recovery, not a special invented handover API. Retired old XC-DT-01 expected queue failure → `duplicate`; that expectation lost an undelivered notice. No serialized field names or one-line-per-key format is specified: observe valid JSONL, key/id values at queue time and public reloaded behavior instead.

### Decision Table rules

| Rule | Relevant conditions | Action / evidence |
| --- | --- | --- |
| N1 | fresh/pending; wake true; idle or busy; queue accepts | Queue once, accept key; XC-UC-02-M/A2/A3 and XC-ST-NOTIFY-* |
| N2 | fresh; wake false | Hold, no independent turn; XC-UC-02-A1 |
| N3 | accepted key; any replacement text | Duplicate, no requeue; XC-UC-02-E1/E2 |
| N4 | pending key; queue failed | Retry same identity, not duplicate; XC-DT-01 |
| G1 | watchdog disabled; send tool/image path | Exact connector pass-through; XC-UC-03-* |
| G2 | watchdog configured enabled but no ready owner | Effective off, same pass-through, never `watchdog-unavailable`; XC-DT-OFF-* |
| I1 | one-item session array / singleton | Relay source mapping; XC-DT-03 |
| I2 | multi-item mixed source | Notice source; attribution stays in text; XC-UC-04-M |
| I3 | skipImages true with valid descriptors | Text only, no fetch/model check; XC-DT-04 |
| I4 | shape invalid / count too high / joined text too large / malformed image | Validate in that order; whole-attempt refusal with specified codes; XC-DT-05…08 |

Healthy active/paused/dormant send gating, faults/generation races and routing belong to X0-S/X0-A/X0-I, not X0-C's pass-through stub. An intentional pause may stop work; watchdog **failure never does**. Questions and plan reviews always bypass watchdog claims/context (U21), including after recovery.

## EP and BVA acceptance accompanying the story

- EP: public `fishballInstance` v1 members; `fishballChat` remains internal; X3 has no member/validation API; registrations return idempotent disposal. X11 returns user-authored texts only, newest first.
- EP: 15 surviving public stub members reject/throw `ExtensionError/not-implemented` with the exact documented `<area.member>`; top-level `bridge` has the code/name but no invented member spelling. X14's eventual `ready/fail` handle belongs to X0-S, not successful X0-C stub behavior.
- BVA: accepted dedupe history 9,999/10,000/10,001 while retaining one pending key/id. X11 `limit` 0/1/available/available+1 and `maxChars` at a surrogate pair. Do not invent an unspecified maximum userTexts limit.
- Images send EP/Decision Table: delivered/unconfirmed/refused; exact unchanged request/result, no retry or watch synthesis. Empty/omitted attachments need no attachment-store fixture.
- Batch EP: local text-only/metadata/option partitions, duplicates preserved, no caller mutation, omitted/empty images, invalid middle item, source mapping and skipImages. Local optional fields do not relax the stricter seven-field wire envelope.
- Batch BVA: item count 0/1/19/20/21; joined UTF-8 bytes 65,535/65,536/65,537 including separators/multibyte text; per-item images 19/20/21; image pixels and bytes limit−1/limit/limit+1. Empty arrays reject asynchronously `ChatApiError/invalid-input`; count/text excess `ChatApiError/too-large`; image descriptor/excess errors retain `ContractError/invalid-envelope` or `too-large`. No extra serialized-object or array-wide image cap.
- The local receipt proves queue acceptance, not a model reply or wire ack. X0-I/FN-6 owns acknowledgement of each original item only after shared queue promise fulfillment; rejection means no ack for that attempt.

## One-way MCP continuations and unresolved freeze

First-party Fishball gets authenticated pushback/wake; MCP is the **only** control plane for every client. External approvals/questions/plan reviews are **default-on with no off setting**, subject to authorization/intake capability. Idle non-polling clients leave offers waiting; silence is not timeout/fallback. **First committed outcome wins**, not first fetch/ack/attempt. W1 **MCP-SERVER** removes old custom control endpoint/exports with built-in upgrades, no migration or legacy adapter. None of these is replaced with a fake local implementation test.

The prior core document's contract-1.1 legacy attachment journey is **retired**, not a compatibility requirement. K1/MCP-SERVER own incompatible-peer rejection and optional attention schemas/projection. The connector attention human story is outside this owned file's executable inventory; no old custom attention frame or attach/minor negotiation is asserted here.

**Port freeze A/B (unresolved, owner MCP-S3/K1/X0-C):** A — freeze explicit local typed control and intake registration interfaces in the shared profile now; B — keep those exact signatures deferred to the schema freeze before W1. Both must preserve the approved domain guarantees. Requirements specify purpose/ownership but not callable names, so XC-UC-05-M stays TODO; neither choice licenses invented ports or a second transport implementation.

## Inventory and retired cases

Primary categories are exactly **EP / BVA / Decision Table / State Transition / Use Case**; no Positive or Error Guessing category. Cases count top-level executable/TODO bodies, not assertions, loop parameter values inside a body or passes. Generated boundary rows are independent cases; secondary coverage is not counted twice. Counts below come from dry registration only (callbacks and product imports never executed); parent owns the main inventory, independent review and both-runtime runs.

| Task | EP executable / TODO | BVA executable / TODO | Decision Table executable / TODO | State Transition executable / TODO | Use Case executable / TODO | Total executable / TODO |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| X0-C | 41 / 0 | 22 / 0 | 12 / 0 | 3 / 0 | 17 / 9 | **95 / 9** |

`node --check` passes all four owned test files. No product/runtime tests were run by this author.

Retained IDs preserve previous UC aliases. X3 namespace cases XC-EP-V-06/XC-EP-03 remain retired (PG-1). XC-DT-01 retains its ID but replaces the obsolete queue-failure→duplicate oracle. Physical JSONL line-count/field-layout assumptions are retired in favor of accepted-history behavior plus pending preservation. No old-control implementation TODO is introduced. See [skeleton use cases](<instance-ext-w0-skeleton-use-cases.md>) for the FN-1/WD-1/B1 stories. Syntax/whitespace checks are not runtime passes.
