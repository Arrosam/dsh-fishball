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
| S1 | Profile has no `dsh-web-app` | Connector row loads, exactly one warning containing the exact `V3 connector stays off` phrase, V2 `dshConnector` remains provided; no V3 host service is provided |
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

## Execution ownership

Parent coordinates every run and the environment. This writer launches **no DSH host or hosted
child** and runs **no suite**; the parent runs and reports the suites. Syntax-only checks do not
execute imports or tests.
Only new files below `test/v3/dsh-connector/wire/` and the two requested suite manifests are owned
by this writer; the parent owns `world.mjs` and `worker.mjs`. No product code or existing assertions
are changed. No commit is made.
