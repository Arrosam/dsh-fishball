# C-WIRE-2 — interactions of managed sessions (use cases and derived cases)

Suite `dsh-connector.interactions` (`packages/dsh-connector/tests/interactions/`). It runs on a real booted
DSH (the C-WIRE world, `wire/world.mjs`, extended by `extension.mjs`) on DSH 0.2.1-rc.5 and
0.2.2-rc.1. The principal is a stock MCP SDK client of the SDK under test, paired through
`client_credentials`. The session agent is DSH's own agent with the scripted fake model
(`test/support/fixtures/fake-llm.mjs`). The user is played by two stand-ins appended as root
listeners after boot: a stock prompt (`approval/request`) and the session's own question card
(`user-questions/request`). The connector's listeners are prepended at row apply, so the stand-ins
are reached only when the connector passes a request on. No connector module is read or imported.

Sources: the parent's C-WIRE-2 brief (the user's decisions of 2026-11-16/17, quoted below), K1
`mcp-schema` (tools, codes, event types, PAYLOAD_LIMITS), the REMOVE-V2 gap check's (B) rows
(`.runtime/reports/remove-v2-gapcheck.md`), and the dev session's relayed surface (constants.mjs
RELAYED).

User decisions used here:
- "不给ask_agent工具"; "list_user_messages is deleted";
- "No cap on pending approvals. Requests from managed sessions wait in the queue indefinitely and are never refused for being too many";
- q1 an `ask` decision on a permission request: "Refuse it" (`invalid-decision`);
- q2 a managed question opens its own card too; the first answer wins;
- q3 a grant "Still covers" while the agent is disconnected (`paused` always false);
- q5 "Remove agentToken entirely"; q6 no approval or decision audit; q7 "an escalated prompt is the user's";
- "Agent不能回答不归自己管的会话，只能操作自己管的会话".

Techniques: Use Case (UC) first, then Equivalence Partitioning (EP), Boundary Value Analysis (BVA),
Decision Table (DT) and State Transition (ST). Each row's part names its technique.

## Actors

- **U** the DSH owner (the user), at the session's stock prompt and its question card.
- **P** a paired principal (MCP client) that manages the session (by `session_start` or Hand over).
- **Q** another paired principal.
- **A** the session's agent (DSH's agent with the scripted model).

## Use cases

### IX-UC-01 A managed session messages its agent (`message_agent`)
Pre: P manages S. Main: 1. A's next model request lists exactly one connector tool, `message_agent`
with a required string `message` (no `notify_when_finished`). 2. A calls it. 3. P's mailbox gets one
`message` event `{text, images: []}` with `sourceSessionId` = S (P connected or not). 4. A's result
is `{ok: true, note}`. A1: the same call (id, response, text) repeated → `{ok: true, duplicate: true,
note}`, no event. E1: '' or whitespace → `empty`. E2: more than `maxMessageBytes` UTF-8 bytes →
`too-large`, nothing queued. E3: P's mailbox is at `maxQueuedInputs` → `queue-full`. E4: S is no
longer managed when the call lands → `not-managed`. Post: unmanaged sessions and subagents have no
connector tool; after Take back / `session_release` the next request has none.

### IX-UC-02 A managed session's permission request is decided by its principal
Pre: P manages S; S's approval policy is `ask`. Main: 1. A's call asks DSH for approval. 2. P gets one
`permission` event; `offer = {offerId: <approvalId>.r1, revision: 1, decisionKind: 'approval'}`; the
payload is the K1 descriptor. 3. The stock prompt is not shown. 4. P reads `approvals_list` (only P).
5. P answers `approval_answer` allow + low + reason → `{accepted: true}`; the call runs once; one
`settlement {allowed, by principal}`. A1 grant (IX-UC-04). A2 reject + risk + reason → the call is
rejected, A reads "The managing agent rejected this call: <reason>"; `settlement {rejected, principal}`.
A3 escalate → the stock prompt shows; U's Allow once / Reject decides; `settlement {by user}`.
E1 each refusal leaves the offer listed and answerable. E2 unknown ids → `expired`; answered →
`already-settled`; Q → `forbidden`; `ask` → `invalid-decision` (q1). E3 the call is cancelled →
`retirement {withdrawn}`. E4 released / taken back → `retirement {released}`, the stock prompt shows;
P's entry disabled → `retirement {revoked}`, the stock prompt shows. Post: no timer ever settles an
offer; there is no cap on pending offers; an unmanaged session's request goes to the stock prompt only;
policy `never` rejects with no event.

### IX-UC-03 A managed session's question or plan review is answered by its principal
Pre: P manages S (a preset with `ask_user_question`, or plan mode on). Main: 1. A asks. 2. P gets one
`question` (or `plan-review`) event; S's own card also opens (q2). 3. P answers `question_answer` with
a batch → `{accepted: true}`; A's result is that batch; the card closes; `settlement {answered,
principal, answers}`. A1 plan review approve / feedback / keep planning. A2 `toUser` → the question
leaves P and stays in its card; U's later answer → `settlement {by user, answers}`. A3 U answers first
→ P's answer is refused and `settlement {by user, answers}` follows. E1 a bad batch → `bad-answer`
(the question stays open); a bound one over → `limit-exceeded`. E2 the turn is stopped, `session_stop`
or `session_redirect` → the card closes, `retirement {withdrawn}`, a late answer is refused. Post: a
timed question's own timeout does not end the wait while P holds it; after a connector restart old ids
are `expired` and nothing is re-offered; a subagent's question is refused by DSH (no event).

### IX-UC-04 The principal grants a standing permission
Main: 1. P answers `grant {kind, prefix?, expiresAt}` with allow's rules → `{accepted, grantId,
expiresAt}`. 2. Later calls of S it covers run with no offer and no prompt. 3. `grants_list` shows
uses and lastUsedAt (`paused` false). 4. `grant_revoke {grantId, reason}` ends it. A1 the grant ends at
expiresAt. E1 refusal codes (table GRT-10). Post: Take back / `session_release` end S's grants;
handing over again does not revive them; after a restart unexpired grants keep uses and cover.

### IX-UC-05 The principal answers a prompt already showing
Pre: U's stock prompt shows in S (e.g. it showed before S was handed over to P). Main: 1. P's
`prompts_list` lists it (exactly `{promptId, sessionId, title, toolName, argumentsStatus, since,
managed}`). 2. P answers `prompt_answer` allow (low risk, reason, complete arguments) or reject (reason)
→ `{promptId, decision, managed: true}`; the prompt closes. E1 refusals; E2 unmanaged → `not-managed`,
Q → `forbidden`; closed / answered / U clicked → `expired`. Post: answering never changes management;
a prompt P escalated is U's and not listed (q7).

### IX-UC-08 A delegate decides a managed session's permission request (`dshConnectorSessions`)
Pre: P manages S; a main-DSH plugin D registered a delegate that claims S (the user, 2026-11-20: a
generic connector hook for Watchdog). Main: 1. A's call asks DSH for approval. 2. After the grant
check, D gets `{sessionId, descriptor}` (the K1 descriptor). 3. D answers allow + reason → the call
runs once; no `permission` offer; P gets one `settlement {allowed, by: delegate, delegate: {name,
toolName, reason}}` ("yes send settlements"). A1 reject + reason → the call is rejected with the
managing-agent wording; `settlement {rejected, by: delegate}`. A2 pass, or D throws or answers
something invalid → P gets the offer as in IX-UC-02, carrying `delegate {name, outcome: passed |
failed, reason?}` (pass: its trimmed reason if any; throw: the error's code, else its name; invalid:
`invalid-verdict`; the user, 2026-11-21), and no delegate settlement. A3 no delegate claims S → the
offer has no `delegate`. E1 an unmanaged session never reaches D (stock prompt). Rows: DLG-01…05
(delegate-cases.mjs). A plugin's `stop({sessionId, reason})` reports `(hook: <reason>)` in the
manager's turn-finished, without a reason `(user)`: CONN-STOP-DT-01 (report-cases.mjs).

## Derived cases

Ids: the V2 gap-check ids where a row ports one (V3 wording), else `IX-*`. "→ refused" always means:
the code, the offer still listed, the call still waiting.

| Row | Technique | Partition / transition | Expected |
| --- | --- | --- | --- |
| MSG-01 / LUM-01 | EP | managed (Hand over) vs unmanaged session | managed: exactly `message_agent` added, `message` required string, no `notify_when_finished`, no `ask_agent`, no `list_user_messages`; unmanaged: none |
| MGD-07 | UC | session_start | every request has `message_agent` |
| MGD-08 / MGD-09 | ST | Managed → Take back / release → Unmanaged | next request has none; its permission request goes to the stock prompt |
| MSG-06 / MGD-14 | EP | subagent of a managed session | child lists no `message_agent`; parent does |
| DUR-01 | ST | agent disposed → resumed | the new agent's request has `message_agent` |
| MSG-03 / MSG-05 | UC | P not connected | `{ok, note}`; one `message {text, images: []}`, sourceSessionId = S even when the text names another session |
| MSG-07 ×4 | DT | call id × response × text | same/same/same → duplicate, one event; later response → new; other text → new; other id → new |
| MSG-08 ×8 | BVA | maxMessageBytes 64: '', whitespace, 1, 64, 64 (2-byte), 65, 63+2-byte, 66 | empty / delivered / too-large, nothing queued |
| MSG-08b | BVA | default 65536 / 65537 bytes | accepted / too-large |
| L60 | ST | 64 → raise to 65 | the 65-byte message is accepted live |
| MSG-09 | BVA | maxQueuedInputs 2, three calls | 2 delivered, third `queue-full` |
| MSG-10 | ST | managed at the tool list, taken back before the call lands | `not-managed` |
| APR-01 | UC | first request, P not connected | one event, offer `.r1`/1/approval, the descriptor keys, choices, title, callId, reason, quotes [], arguments, complete, no expiresAt; no stock prompt |
| APR-02 | EP | approvals_list by P / Q / unmanaged | listed / `forbidden` / `not-managed` |
| APR-04 | DT | allow + low + reason + complete | accepted, allowed once, settlement allowed/principal |
| APR-05 ×9 | DT, BVA | high; no risk; reason missing, '', whitespace; 500; 501; truncated arguments | each code; then a valid answer is accepted |
| APR-05r ×5 | DT | reject + risk + reason; reject + reason, no risk; reject with '' reason; reject with no reason; reject with whitespace reason | accepted with the rejection wording / accepted with the rejection wording / `reason-required` ×3 |
| APR-05q | EP | `ask` (q1) | `invalid-decision`, offer stays |
| APR-06 ×4 | EP | unknown approvalId, unknown offerId, already answered, Q | expired, expired, already-settled, forbidden |
| APR-07 ×2 | ST | Offered → escalate → stock prompt → Allow once / Reject | stock shows, unlisted, late answer already-settled, settlement by user allowed / rejected |
| APR-08 | ST | silence | still listed and waiting; no stock prompt |
| APR-10 / APR-11 / APR-12 / STP-02b | ST | cancel before the read, after it, while escalated; session_stop | one retirement withdrawn, unlisted, a late answer refused |
| APR-15r ×3 | ST | session_release / Take back / entry disabled while waiting | retirement released / released / revoked; the stock prompt shows |
| APR-13 ×4 | BVA | argumentExcerptBytes L, L+1, L−1, L−8 (2-byte pad) | complete whole / complete / truncated prefix, no broken character |
| APR-14 ×3 | EP | no call id; call id not in the log; call to another tool | unavailable; callId null only for the first; allow → arguments-incomplete |
| APR-17 | EP | a subagent's request | sourceSessionId = the root |
| APR-19 | EP | policy never | rejected; no event, no stock prompt |
| APR-20 | EP | escalate, the stock prompt throws | outcome unavailable |
| RTE-02 (no cap) | BVA | ten pending requests (V2's cap was 8) | all offered; none at the stock prompt |
| RTE-04 | EP | mailbox at maxQueuedInputs | the request is still offered (offers always commit) |
| PTA-01 | EP | run_code inner call | callId `<outer>:ptc:<n>`, inner arguments; allow → allowed |
| DCD-10 | ST | settled → second answer | already-settled; the call ran once |
| IX-UNM | EP | unmanaged session | stock prompt only, no event |
| FLW-01 / PLN-11 | EP | the user's session | card only, no event |
| FLW-02 | UC | managed question | one event, kind question, questions as asked, offer decisionKind question; card open |
| FLW-03 | UC | answers | accepted, result = batch, card closed, settlement answered/principal/answers |
| FLW-05 / FLW-06 | ST | user first / principal first | refused + settlement by user / card closed, user cannot answer |
| FLW-07 | ST | silence | still listed, card open |
| FLW-11 / STP-03 / RDR-02 | ST | Stop / session_stop / session_redirect | card closed, retirement withdrawn, late answer refused |
| FLW-12 ×2 | ST, DT | toUser + note; toUser + answers | accepted, unlisted, card open, user's answer → settlement by user / bad-answer |
| FLW-13 | EP | two sessions | per-session lists; one answered, the other answerable |
| HLD-01 ×2 | ST | timed question past its own timeout | still waiting; principal's / user's answer is the result |
| PLN-01 | UC | plan review | one plan-review event, one question with intent {plan-review, approve, callId} |
| PLN-02 / 03 / 04 | DT | approve true / feedback / approve false | approved, plan mode off / feedback reaches A, plan mode on / keep planning |
| PLN-12 ×2 | BVA | feedbackChars 500 / 501 | accepted / limit-exceeded, stays open |
| PLN-07 | ST | user approves first | late answer refused |
| PLN-09 ×6 | DT | answers on plan; approve on question; approve+feedback; note alone; empty; unknown id | bad-answer ×4, invalid-arguments (empty: C-TOOLS payload rule), expired; stays open |
| VAL-02 ×5 | DT | unoffered label; two labels single; unknown id; empty batch; id twice | bad-answer ×3 / limit-exceeded / invalid-arguments (C-TOOLS payload rules first); then a good batch |
| VAL-03 / VAL-04 ×10 | BVA | single: 1 label, label+custom, custom, none, 2 labels; multi: 0, 1, all, all+custom, label twice | accepted / bad-answer |
| VAL-06 ×6 | BVA | customChars, labelChars, noteChars at and one over | accepted / limit-exceeded |
| VAL-07 ×4 | BVA | questionsPerRequest 32 / 33; selectedLabelsPerAnswer 32 / 33 | accepted / limit-exceeded |
| VAL-08 ×2 | EP | another session's id; Q | refused; stays open |
| CHD-01 | EP | subagent's question | refused by DSH; no event, no card |
| GRT-01 / 02 | UC, ST | prefix grant then two covered runs | accepted, grantId, listed; uses 2, lastUsedAt |
| GRT-03 / 04 ×8 / 05 / 06 | BVA, EP | raw command vs prefix; other tool; other session | covered / offered |
| GRT-07 ×3 | DT | exact grant: same, other key order, changed | covered, covered, offered |
| GRT-08 ×3, 08s | EP | prefix on pwsh, terminal_send; trailing `*` | accepted and covers; `*` dropped |
| GRT-09 ×2, 09x | EP | prefix on fbtest_ask, terminal_open; exact on terminal_open | prefix-not-shell-tool / covers |
| GRT-10 ×18 | DT | refusals (grant-invalid ×3, expires-at-past ×2, expires-at-invalid ×2, prefix-empty ×3, prefix-not-in-call, allow rules ×5, schema ×3) | each code, nothing granted, still listed |
| GRT-10b ×4 | BVA | prefix 512 / 513; reason 500 / 501 | accepted / limit-exceeded |
| GRT-11 | BVA | a year out; three at once | accepted; all listed |
| END-01 | ST | at expiresAt | unlisted; next call offered |
| END-03 ×6 | ST, BVA | revoke; again; unknown; ''; 500; 501 | revoked / ended / unknown / reason-required / accepted / limit-exceeded |
| END-04 / END-05 | ST | Take back / release; Hand over again | grants end; not revived |
| END-07 (q3) | EP | P disconnected | still covers; paused false |
| FRZ-01 | EP | nothing showing | prompts_list [] |
| FRZ-02 | UC | prompt showing at Hand over | one entry, exact keys, managed true; Q does not see it; no event |
| APRP-01 / 02 | DT | prompt_answer allow / reject | `{promptId, decision, managed: true}`; outcome; reason reaches A; still managed |
| APRP-05 ×8 | DT, BVA | no reason; ''; whitespace; no risk; high; 501; truncated; Q | invalid-arguments / reason-required ×2 / risk-required / allow-needs-low-risk / limit-exceeded / arguments-incomplete / forbidden |
| APRP-06 / 07 / FRZ-05 | ST | answered twice; user clicked first; turn stopped | expired; unlisted |
| FRZ-q7 | EP | P escalated its offer | not in prompts_list |
| RST / DUR-06 / END-08 | ST | connector restart | managed tools again, offers again; old question id expired, not re-offered; grant keeps uses and covers |

Withdrawn here (the brief, citing the user's decisions): every `ask_agent` row (ASK-*, DIR-03/04,
QUO-*, PAS-*, PTC-ask, REG-02 ask part: "不给ask_agent工具"), `list_user_messages` (LUM-05…11,
LUS-*: "list_user_messages is deleted"), the cap (RTE-02/03 as V2 wrote them, ASK-13, DCD-08: "No cap
on pending approvals …"), the audit (APR-21, APR-23, APRP-10/11 audit, STP-08, RDR-05: q6), END-07's
pause (q3), the pile and restart-pile rows (Q-U2), MSG-01 `notify_when_finished` (R-WATCH-03).
Child-launching (hosted child) rows are not here (I-HOST / X-MATRIX).

Re-baselined by R-FIX-CONNECTOR (review F08, 2026-11-18): APR-05r "reject with no risk" expected
`risk-required`, but DESIGN.md §7a.3 (reject: "A non-empty reason") and docs/connector-contract.md
("reject needs a reason") ask only for a reason. It is now accepted with the rejection wording and
settlement `rejected`; a reject with a missing, empty or whitespace reason stays `reason-required`.

## R-FIX-CUI (cui-cases.mjs)

UI-01 of `.runtime/reports/review-x-dsh-connector-ui.md` end to end ("Agent不能回答不归自己管的会话，只能操作自己管的会话"):
a real subagent child C of root R (DSH's `subagent` tool, finished, so it resolves through its persisted header).

| Id | Technique | Rows |
|---|---|---|
| RFC-UI01 ST ×2 | ST (service, UI route) | Hand over C to P → ok; managed() lists R only; one handover naming R; Take back C → ok; nothing managed; one takeback naming R |
| RFC-UI01 DT ×2 | DT (service, UI route) | R managed by P; Hand over C to Q → `conflict`, R still P's; R taken back; Take back C → `not-managed` |
| RFC-UI01 DT reads ×2 | DT | after Hand over from C: P reads C and R (ok); Q → `forbidden` on both |
| RFC-UI01 DT routing | DT | after Hand over from C: a new child's permission request reaches P, never Q |
| RFC-UI01 EP | EP | the UI routes for C: 200, 409 `conflict`, 200, 409 `not-managed` |
| RFC-UI01 DT cold root | DT | own scenario `ix-cold-root`: R handed to P, DSH restarted (R and C cold) → P's session_read of C ok, Q's `forbidden`; P's session_message to C → `unknown-session` |

Messaging a finished (or cold) subagent child is not supported: DSH gives the connector no agent for a
subagent child, so the session tools answer `unknown-session` (the dev session's decision, 2026-11-18;
base behaviour). A LIVE child under a cold root cannot be produced through the public tools or this
harness (a restart leaves every session cold; the kept sessions have no subagent tool), so that
child's permission routing under a cold root is not checked; the DT routing row checks it under a live root.

## IX-MULTI (multi-agent-cases.mjs): one DSH, several agents

The lead's request (2026-11-21): with several Fishball instances (or other paired principals) on one
DSH, the Hand over UI names each agent correctly. Each row boots its own DSH, so the targets are that
row's agents only. Agents are stock MCP clients that `pair({name})` and `set_name`; the names are read
where the browser reads them (the UI backend's state route and event stream) and from
`dshConnectorHandover.principals()`; the Hand over goes through the owner's UI route. The browser half
over several targets is MARKS-MULTI (packages/dsh-connector/tests/marks/multi-cases.mjs).

| Row | Technique | Partition / transition | Expected |
| --- | --- | --- | --- |
| IX-MULTI EP (names) | EP, BVA | "Fishball", "Fishball Two" (listening), an Arabic-script name with an emoji, one paired without a name (so a generated one), one paired then disabled, one never paired | principals() in settings order with each pair's own {key, name, id}; disabled: paired, enabled false; never paired: entry key, null name/id; state and stream targets = the four enabled and paired, 1:1 by id, lights online only for the listening one |
| IX-MULTI ST (reorder) | ST | the first entry moved last in the settings list | targets reorder; every key keeps its name |
| IX-MULTI ST (rename) | ST | set_name on the 2nd | state, stream and principals() show the new name on the 2nd's key only |
| IX-MULTI UC (hand over to the 2nd) | UC | POST ui/handover with the 2nd target's key | answer principal, answer state mark, state mark and stream mark name the 2nd; one handover event for the 2nd, none for the others |
| IX-MULTI DT (default name ×3) | DT | three instances ask for "Fishball" (the 3rd as "FISHBALL") | 1st "Fishball" (nameAssigned); 2nd and 3rd pair with `nameAssigned: false, nameRefused: 'name-taken'` and two distinct generated names (the user's decision, 2026-11-21: no "ID: <id>"); principals(), targets and the hand-over mark read "Fishball" and those names |
| IX-MULTI ST (default name freed) | ST | the 2nd asks for "Fishball": held → 1st disabled → 1st deleted | name-taken, still name-taken (a disabled pair keeps its name), then ok once the delete's revocation removed the pair; the only target is the 2nd, "Fishball" |
