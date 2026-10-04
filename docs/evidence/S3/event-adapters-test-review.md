# Independent event/schedule/chat test review

Reviewer `/root/istqb_review`, Sol6.1/max, independent of authors and separate correctness review. **Event adapter module checkpoint PASS; complete Stage3/AC acceptance HOLD.** The reviewed corrective commit is `72dcf517f6734f63ee9943732e98f320a398ba55`. Current source identities, payload limits and resource/authorization assertions were retained; this reviewer changed only the allocated adversarial test and evidence. The provider-neutral chat contract is applicable; live chat platforms/accounts/authentication/delivery are **OUT this phase**, not failed prerequisites or synthetic passes.

## Exact commands and scope

Environment: actual Node22.22.2, Darwin arm64, built-in SQLite and installed pinned public DSH services. All stores, keys, plaintext, identities and secret sentinels are synthetic. Event tests use actual encrypted RuntimeStore transactions and private callback fixtures; timer tests use explicitly fired bounded job maps. No network listener, browser, profile launch, account, credentials, install, daemon or external/paid model call was used. This lane did not retry the blocked separate correctness experiment.

| Executed command | Expected / actual | Evidence |
| --- | --- | --- |
| `node --test test/event-adapters-adversarial.test.mjs test/events.test.mjs test/scheduler.test.mjs test/chat.test.mjs` |113/113 PASS,0 FAIL,0 SKIP, exit0;52 independent checks and61 author checks;684.617833ms. |Final TAP `/tmp/df-istqb-event-adapters-final.tap`, SHA256 `324ab0bede9f0ef934d2603d8899d9a2f8ba20f270d95f56b2f3b59600c9e04a`; tracked copy [event-adversarial-final.tap](event-adversarial-final.tap). |
| `node --check test/event-adapters-adversarial.test.mjs` |Syntax valid, exit0. |No source mutation. |
| `node --test test/native-runtime-integration.test.mjs test/runtime-plugin.test.mjs test/operator-bridge.test.mjs` after both fixes |13/13 PASS,0 FAIL,0 SKIP, exit0;692.187125ms. |TAP `/tmp/df-istqb-native-automation-final.tap`, SHA256 `37ccb5530eb2a5305a877f986c7e949a6ad7b8f3ca6a85df7282c03260857f63`. Genuine Cordis/HostConnection/AgentLoop and encrypted core; captured HTTP streams/private BrowserAuth fixture/local deterministic provider. No visual or real-carrier claim. |

All11 selected event/source/test/API hashes were identical before/after the113-case run. Hash-list SHA256 `7990be836d92161c5e22c82798de3cd051a7f7c07de6f3d24276d9815e0903dd` (`/tmp/df-istqb-event-adapters-final-before.sha256`, matching after file). All10 selected native seam hashes were identical before/after its13-case retest; list SHA256 `1ec282e96faab531770cdea7b04bc7843326b1a2b1e8ba874ffe7e347f6213c4`. The native seam checkpoint is separate from the subsequently frozen complete UI/session manifest; its13 checks do not accept that entire feature unit.

| Reviewed file | SHA256 |
| --- | --- |
| `src/events.mjs` |`a0db19616284d7132e5e1b9e17a626fe9086adce81f08f6e7a4483a52bc9f18f` |
| `src/scheduler.mjs` |`af61bd963ad09daf588bd192436790a39b5adcfc837e05fc01f23d0ab4c4e8c2` |
| `src/chat.mjs` |`2962af9aaa94ec4d4ce8e0549352aedae5d64fe3ef547de48787e289f34dc556` |
| `src/runtime-store.mjs` |`63dbc100d4dfa4fa42db31003c84a7925de025dd66af08f5bae589a4e8e7e850` |
| `src/ledger.mjs` |`64cc42e1a834701263c260f311d05d113c6e34af67017901cfd7a95f22c9b650` |
| `src/results.mjs` |`8a44c8e3e2fb4dfcdeae1fd7f69ddc90dd8c36b4cdf7d292964ebfd5cf5af077` |
| `test/event-adapters-adversarial.test.mjs` |`0193921ffd774d4190bff6fb79c7f89f22c10635d9c712a1da0a651d711f564c` |
| `test/events.test.mjs` / `test/scheduler.test.mjs` / `test/chat.test.mjs` |`3a0ee1a7c1b60ab174f644d9713302cc5153d1643b9db151b13c544cf34c5320` / `c699f764fce6f96676cec0922b042df15e02342631535b17624021474160a557` / `5234574e4cc9ee9c0471d014bb85b3890e7e9da36bd0da669b7bb43d115c0620` |
| `docs/event-adapter-api.md` |`c0d2f10e5264096abf0657357b6a692890e813566c47df8e5da5fb3d1a80dba5` |

## Independent partitions, decisions and state transitions

The [16 independent top-level tests](../../../test/event-adapters-adversarial.test.mjs) supply52 reported checks including nested partitions. Expected outcomes are fixed independently of implementation, with task/quota/claim/read/effect oracles after refusal. Same-process concurrent promises are explicitly distinguished from earlier separate-OS-process ledger tests in [integration review](integrations-test-review.md).

| Risk family / named test phrase | Expected / actual observable oracle |
| --- | --- |
| `128 opaque entries` / `32 pending` |128 registrations accept;129 refuses; unregister frees a slot; copied token fails.31 authentication calls plus1 ingress share one32-slot pool; the33rd authenticate and ingress refuse before callback; releasing the gate permits exactly1 task and restores capacity. PASS. |
| `synchronous strict true` |Promise/string/throwing isCurrent and wrong-provider/accessor proof cannot normalize/admit.33 sequential failed calls each release the pending slot; getter traps0, stable error without secret, task/quota0. PASS. |
| `serialized UTF-8 boundary` |65535/65536 exact serialized UTF-8 bytes, including multibyte/quote/newline/backslash escaping, authenticate and ingest with a bounded normalizer.65537 invokes verifier0 and commits0. Trusted metadata does not reduce the incoming payload limit; raw payload is not substituted for normalized goal. PASS. |
| `expiry is rechecked` |Private normalizer awaits while trusted time advances99/100/101 at max100:99/100 admit;101 EVENT_EXPIRED with no task/quota. A secret returned only by normalization rejects without plaintext persistence/output. PASS. |
| `normalizer await` |Captured original survives caller mutation; source revoke/unregister/dispose/private-currentness loss before commit admit0/quota0. PASS. |
| `re-registration` |Same original provider/source/event through a newly configured source/subscription returns original task and consumes0 quota in the replacement namespace; original count1 survives reopen. PASS. |
| `simultaneous exact provider control` |Two same-event exact pause commands apply one version change. Chosen commandRef is rejected before verification; changed kind is denied by requestDigest; reusing provider ID for a fresh resume intent conflicts without state change. PASS. |
| `status/control/attachment ... 64KiB` |All three exact intent-bound APIs accept65535/65536 payload bytes and reject65537 before verifier/reader/mutation. Status returns exact task, control pauses, attachment returns exact6bytes. PASS. |
| `conflicting attachment descriptors` |Two genuine receipt-bound original/supplement records reuse one attachmentRef with changed descriptor/digest: CHAT_ATTACHMENT_CONFLICT before reader0, task count remains1. PASS. |
| `native view slots` |A Uint8Array view contains exact bytes while backing buffer contains an outside-view canary and own buffer/offset/length getters throw. Intrinsic slot reads yield only the exact view, traps0, copied return cannot mutate backing data, plaintext absent from DB. PASS. |
| `attachment expiry` |Download returning at expiresAt−1 succeeds; exact expiresAt and+1 refuse. Late private revoke/dispose or exact-digest secret bytes disclose no result; reader count1 proves the after-await check. PASS. |
| `outbound permission await` |An actually granted/claimed reviewed-artifact outbox waits for permission, then original route changes. Provider send0; already committed outbox becomes unknown and remains reserved. Reopen shows recovery_required and dispatch replay does not resend. PASS. |
| `timer cadence` |32 registrations accept,33 refuses and unregister frees.59999/86400001ms refuse;60000/86400000 accept. Register/start/stop creates0 tasks until a job is explicitly fired. Copied token fails. PASS. |
| `stop/unregister/dispose` / `already queued` |Pending timer cannot admit after stop, unregister or disposal. Restart receives a distinct lifetime: old callback commits0/publishes0/leaves exactly1 new timer, new callback may admit once. Cleared queued callback authenticates0. Explicit manual tick after stop remains independently permitted and starts0 timers. PASS after EVT01. |
| `approved plan ... revision after reopen` |Foreign owner cannot approve and original approved remainsfalse; real owner approves, reopen retains exact plan. Subscription revision invalidates the old decision, clock/pending/task/quota unchanged. PASS. |

## Source AC mapping and remaining oracles

Each original [BUB009 criterion](../../tickets/BUB009.md) and current [DF010 amendment](../../owner-amendment-2026-10-04.md) remains required. PASS below describes the named local observable, not the whole AC.

| AC | Observable evidence now | Remaining applicable acceptance oracle |
| --- | --- | --- |
| BUB009-01 |113 cases: private verified proof/no copied token/payload flags; full original identity/digest dedup through changed registration; changed material conflict; explicit same-command-only degradation and retained quotas. Earlier held169 command supplies actual OS-process duplicate/last-slot/hard4096 retention proof. |Final cross-stage retained dedup/signature/caller/queue/resource/native composition. No arbitrary-effect exactly-once claim. |
| BUB009-02 |Author actual encrypted reopen preserves receipt/goal/association; separate held core actual before-commit/post-ack exits distinguish absence from committed ingress. Unknown outbound remains held and cannot resend. |Combined final host/process cuts spanning registration, worker processing/effect and receipt reconciliation with visible state. |
| BUB009-03 |Actual store reopen retains cursor/skip/coalesce/pending exact owner approval; source/subscription changes invalidate old plan. Timer lifecycle EVT01 now fences stopped/old work. Genuine native plugin unload removes installed routes/timers; reopened tasks have no clock-created workers/actions. |Actual running isolated DSH full quit/restart and documented missed-plan/gap UI. No receiver/replay promise while host stopped. |
| BUB009-04 |Author daily-fold restart plus prior [independent pure clock review](events-test-review.md) covers exact IANA/DST/midnight/fold/gap/scan/range choices. Current registration copies exact policy and exposes timezone/cursor. |Actual owner-visible timezone/next-run rendering, timezone revision and final host recurrence tests; utility/native element mocks cannot pass visuals. |
| BUB009-05 |Author event rate refusals preserve cursor/plan/quota; actual notification quiet/emergency/merge/frequency23-case proof is recorded separately. Private owner controls and explicit timer stop do not turn a plan into an action grant. |Combined allowed background work and deferred notices under current policy, actual native notification/pause display. |
| DF010-C01 |Exact privately admitted pairing/task/CAS/requestDigest; group/new window/changed pairing/revoke/foreign identity denied; control replay applies once. |Consolidated provider-neutral native contract regression with owner carrier/lifecycle. Selected live platform auth OUT. |
| DF010-C02 |Original event identity immutable across duplicates/configuration; edits/deletes cannot replace goal/action; distinct new IDs retain repeated instructions. |Final out-of-order/thread/version/cancel/reconnect combined contract checks. Platform semantics OUT. |
| DF010-C03 |Status/control exact original task/window/thread/private association; route-changing permission await sends0; private installed callbacks stay off owner RPC. |Final native source/task/reply/forwarding isolation and displayed original route. Live carrier OUT. |
| DF010-C04 |Real authenticated event record/digest binding, conflict refusal, explicit quotas/expiry/reader access, exact copied byte view, secret rejection; path/lookalike metadata is not proof. |Final generic attachment/read/recipient evidence presentation. Platform download/upload/auth OUT. |
| DF010-C05 |Author unknown-after-send, query-before-retry, historical delivered/current access distinction; new admitted outbox route race keeps holds across reopen and never automatically resends. |Final generic/native notification/result/chat contract composition. Live provider delivery OUT. |
| Carried BUB003/006/012 and applicable BUB013 |Actual authoritative store transaction, private callback/host identity, full exact charged action/outbox claim, malformed/secret/bounded refusals and known-versus-unknown release are observed. |Full original security/resource/result criteria remain mapped in [61-row design](test-design.md), individual result/audit reviews and consolidated acceptance debt. |

## Findings, remediation and honest failure history

**S3-EVT01 — CLOSED.** Original explicit timer awaited private permission, then stop returned, but the old callback still committed1 task/quota. Stop→restart also let old work affect the new lifetime; an already queued cleared callback could begin authentication. Root added private pollEpoch binding through the immediate router currentness check, invalidates it at stop, and guards old clearing/publication/rescheduling. Independent original stop, restart, queued-callback, unregister/dispose and allowed manual-tick oracles all pass. Already committed work is not erased.

**S3-EVT02 — CLOSED.** Original authenticate captured valid65535/65536 payload bytes and invoked verifier1, then failed CONTEXT_INVALID when the assembled trusted envelope exceeded the same cap. Root now captures/freeze-validates closed metadata and payload independently, joins already captured components, and applies the same separation to ingress/chat exact requests. The incoming limit remains65536; normalized material/storage limits remain bounded. Independent positives and65537 pre-callback negatives all pass; no size assertion was removed or narrowed.

| Retained run | Actual disposition |
| --- | --- |
| `/tmp/df-istqb-event-adapters-first.tap`, SHA `6a55703fc8bd79fd243b249797d86e4efed6cf2c63d8d58508ed8cb331b95edd`; [tracked first](event-adversarial-first.tap) |28/31 PASS. Stop race plus its parent failed; one fixture expected NOT_FOUND for foreign-owner approval but actual scoped absence is STALE_SOURCE. Corrected that expected code while retaining refusal and approved=false; no production behavior was weakened. |
| `/tmp/df-istqb-event-adapters-stop-before-fix.tap`, SHA `205a0c9b9927be94bc9672e1e61e1bb1d81c070758d69a876ab074d12bd06fc9` |4/8 PASS: stop/restart/queued callback counterexamples remained; foreign-owner corrected oracle passed. |
| `/tmp/df-istqb-event-adapters-fixed.tap`, SHA `e2f58c2083ab15cf47abca323dfba24c6c142dc41bb0f239c1e506f397688d75`; [tracked boundary failure](event-adversarial-boundary-failed.tap) |100/103 PASS: timer fix passed;65535/65536 boundary positives and parent failed. Subsequent52-case independent file adds the chat boundary family, retaining both failures' original oracles. |
| Final113/113 and affected native13/13 |Both findings closed on exact stable hashes above. No author source/test was edited by this lane. |

These results support this module's **test-design development PASS**. They do not replace the currently blocked separate correctness verdict, a final coherent Stage3 manifest, or the [consolidated functional/visual gate](../acceptance-debt.md). The project remains preview/private; no full ticket, MVP, stable or release/publication acceptance is claimed. dsh-std supplies no active requirement.
