# C-WIRE review regressions — requirements-only test design

## Use Cases FIRST

These rows are derived from the direct review brief (B1, B2, S1, S5, S12), root DESIGN §7a.12,
V3 design §3.1 / §3.2 / §5.5a, and frozen K1 W4b-2 / tools / SettingsWriter / SETTINGS_REFUSAL.
No connector implementation was inspected. Existing wire TEST fixtures establish API conventions.
Product values come from those contracts or the existing requirement-owned wire constants; other
values are named test fixtures. Both SDK entry files register the same rows.

| ID | Actor / flow | Observable expected result |
| --- | --- | --- |
| B1 | Owner disables and re-enables the real connector bundle, then creates and pairs a new token and attempts a duplicate save | A genuinely new active row fiber; V3 services and owner/raw routes return; protected-resource metadata describing the MCP resource is HTTP 200; new token works; duplicate notice and exact previous-list write-back |
| B2 | Owner repeats the remount flow and attempts a duplicate save | Previous tokens list appears in settings `describe().value.tokens`, not merely in an internal registry or a page snapshot |
| ACCESS-UC | Caller reads and lists a session handed over to it | Read returns the real user message; list includes that session |
| ACTIVITY-MESSAGE / ACTIVITY-REDIRECT | Caller sends or redirects a managed session after its real user turn | Delivered relay text reaches the session; a later native `api-session/activity` event targets that session, as the user's message does |

The review brief's “GET /api/agent/mcp metadata 200” means the GET **protected-resource metadata**
whose `resource` is `/api/agent/mcp`, not a GET MCP stream: K1 `REQUEST_GATE.routes` and design §3.1
explicitly require POST-only MCP and GET → 405. Confirmed with the parent before writing assertions.

## Equivalence Partitioning

| ID | Partition | Expected |
| --- | --- | --- |
| S1 | Profile has no `dsh-web-app` | User decision A (2026-11-17), superseding the first "loads and warns once" wording: the connector requires dsh-web-app. The row stays pending (DSH's missing-dependency state: present and enabled, not active) and no connector service, V2 `dshConnector` or V3, is provided |
| K1-READ / K1-LIST | Frozen public tool descriptions | Exact user-approved sentences, without weakening “you manage” |
| ACCESS-UNMANAGED | Existing session nobody manages | `session_read` → `forbidden`; `sessions_list` omits it; management unchanged |
| ACCESS-OTHER | Existing session another principal manages | `session_read` → `forbidden`; caller list omits it; management unchanged |

## Boundary Value Analysis

| ID | Boundary | Expected |
| --- | --- | --- |
| S12 | `approval.port` lower boundary 0 (OS-selected port), then a positive explicit-port representative selected by the fixture | Settings retain configured 0, while AS `authorization_endpoint` advertises a positive real bound port, with the caller's loopback hostname; `/authorize` answers there. A live change to an explicit available port updates metadata and listener |

The positive advertised port is verified by a real socket request, not a guessed port or configured
zero. The existing suite already covers the schema's invalid −1 / valid 0 / valid 1 partitions;
this amendment specifically covers the runtime meaning of zero, not another schema-only check.

## Decision Table

| Rule | Caller manages session? | User save duplicates key? | Own createHosted overlaps? | Action |
| --- | --- | --- | --- | --- |
| R1 / S5 | — | Yes | Yes | Refuse duplicate, show tokenDuplicate notice, do not ingest duplicate; retain valid hosted creation and every earlier item |
| R2 / PROMPT | No | — | — | `prompt_answer` → `not-managed`; acquire no management, change no session events |

R1 starts createHosted and holds its first native settings-save acknowledgement **after the real
durable edit**, then performs and awaits the user's real duplicate save before releasing that
acknowledgement. The row asserts the fixture's `held: true` observation. This proves overlap at the
actual own-settings boundary; starting two calls in one tick could otherwise hit an earlier record
write and miss this race. The fixture never toggles connector flags, replaces registry outcomes, or
skips DSH's real write. DSH may accept the settings document before asynchronous refusal/write-back;
the oracle is the connector notice and restored list, not an invented requirement that DSH's save
receipt itself must reject. Both the native settings list and the live public entries must retain
`{key,label,enabled}`, not just the same keys. The previous entry is paired before the race; its pair
must survive and its value must support a fresh OAuth exchange. The returned hosted token must also
authenticate and pair after refusal. A later valid user disable must still work, proving the refusal
did not leave own-write state stuck.

Harness choice (accepted by the parent, 2026-11-17): the hold wraps DSH's own settings service
(`ctx.settings.update/replace/mutate`) in the worker for this one call and restores it after. It
delays only the host's acknowledgement; the connector and DSH's real write are not replaced.

The prompt authorization row uses a non-empty fixture prompt id: unmanaged authority must be
refused before prompt lookup. It does not claim to exercise a real pending approval settlement,
which is C-WIRE-2's domain. User wording: “Agent不能回答不归自己管的会话，只能操作自己管的会话”.

## State Transition

| ID | Start | Trigger | Next / oracle |
| --- | --- | --- | --- |
| ACCESS-RELEASE | Managed by caller, readable and listed | `session_release` | Unmanaged; read forbidden, list omitted, management absent |
| ACCESS-HANDOVER | Unmanaged, read forbidden, omitted | Owner Hand over to caller | Managed; readable and listed |

B1/B2 also cover the lifecycle pair Mounted → Disabled → Remounted; they are kept first as complete
owner Use Cases rather than hiding the user journey inside implementation-shaped edge tests.

## Explicit future rows

Two `test.todo('C-WIRE-2')` rows are separately labelled by their enclosing suite:

1. No cap on pending approvals.
2. `list_user_messages` deleted.

These are deliberately not passing tests or an implementation exemption.

**C-WIRE-2 (2026-11-17):** both are real rows now, on the interactions world (`../../interactions/`):
1. BVA — ten pending permission requests of managed sessions (V2's cap was 8) are all offered and
   listed, none reaches the stock prompt, and `maxPendingApprovals` is no setting (the user: "No cap
   on pending approvals. Requests from managed sessions wait in the queue indefinitely and are never
   refused for being too many").
2. EP — a managed session's next model request lists `message_agent` and neither
   `list_user_messages` nor `ask_agent`; neither is an MCP tool or in K1 (the user: "list_user_messages
   is deleted"; "不给ask_agent工具"). The `LATER_ROWS` of added-cases.mjs are skipped rows pointing here.

## Execution ownership

Parent coordinates every run and the environment. This writer launches **no DSH host or hosted
child** and runs **no suite**; the parent runs and reports the suites. Syntax-only checks do not
execute imports or tests.
Only new files below `test/v3/dsh-connector/wire/` and the two requested suite manifests are owned
by this writer; the parent owns `world.mjs` and `worker.mjs`. No product code or existing assertions
are changed. No commit is made.

## Rows added after the review (added-cases.mjs)

These rows are added as new tests; the rows above are unchanged, except S1, which the user's
decision A rewrote.

| ID | Technique | Expected |
| --- | --- | --- |
| B1 (added) | UC / ST Mounted → Disabled → Remounted | New token answers exactly `{ok, entryKey, label, value}`; no `already open` or `duplicate route` line is logged during or after the remount |
| UIM-DT-01 (connector half) | DT: connector yes × UI yes × instance no | `dshConnectorUi` present at app ready at apiVersion 1 (sampled in the app-ready callback by ready-probe.mjs); embed-UI logs no `connector-missing` line; `GET /api/dsh-connector-ui/services` → `connector: true`; the other three V3 services are present at app ready at apiVersion 1 too |
| HARNESS exit | ST: Started → Ready → file end; Started → Failed boot (services guard) → file end | `exit-fixture.mjs` under plain `node --test`, without `--test-force-exit`, exits 0 by itself in both cases |
| C-WIRE-2 todos | — | `no maxPendingApprovals cap — C-WIRE-2`, `list_user_messages deleted — C-WIRE-2` |

`ready-probe.mjs` is a harness fixture row (a plain DSH plugin the worker inserts), not a test file:
it records which services exist inside the app-ready callback itself, so a later IPC round trip
cannot hide a late start. `exit-fixture.mjs` is a fixture too; only the HARNESS rows run it.
