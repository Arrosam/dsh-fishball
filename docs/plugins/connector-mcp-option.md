# Connector MCP option: one-way control, capability-based delivery

Status: **user-selected direction: one-way MCP only**. Every manager (Fishball or external agent)
is an MCP **client** of the connector's MCP **server**. The connector never calls an agent's MCP
server, and agents need not host one. Capability degradation for external agents is accepted.
This is a documentation-only design and source investigation, not a tested implementation.

The previous bidirectional proposal is **rejected: the user said no two-way MCP**. No MCP pair,
second-leg readiness, callback MCP server or watchdog-specific MCP pairing remains in this plan.
The [custom contract 2.0 baseline](<../connector-contract-2.0.md>) is preserved but parked; reuse
its domain guarantees, not its full custom control framing. [Watchdog decisions](<instance-extension-points.md>)
remain: questions/plan reviews always Fishball; watchdog failure means effective off.

## 1. Recommendation and scope

Use **one-way MCP for all control and answer tools**, with a durable connector mailbox available
through bounded pull tools. Optional notification/subscription support is a hint to fetch, never
required for attachment or correctness. A polling-capable external integration can fetch and
acknowledge offers; an ordinary tool-only agent that runs only when prompted cannot be assumed to
wake itself or poll while idle.

For first-party Fishball, recommend **an authenticated custom pushback adapter** reusing the
existing transport/intake infrastructure. It commits incoming items durably, routes before manager
queueing and explicitly wakes the right agent. This is not reverse MCP and does not carry a second
session-control API. MCP remains the control plane for everyone. Lack of first-party push support
does not prevent a plain external MCP client from attaching with its declared limited capabilities.

The architecture is source-level feasible on DSH **0.2.1-rc.5 and 0.2.2-rc.1**. Server packaging,
auth, exact tool/event schemas and crash-safe delivery integration remain unimplemented/unverified.
No runtime tests, dependency installs, product edits or credential reads were performed.

```text
Fishball / external MCP client -- tools/call --> connector MCP server --> scoped DSH operations
                              <-- tool result --
                              -- inbox_poll / ack --> durable connector mailbox
                              <-- bounded event page --
Optional supported MCP hints  <-- notification/resource change (not durable delivery)
First-party Fishball only     <-- custom authenticated push adapter --> delivery ack
                                  local router --> watchdog OR Fishball queue/wake
```

## 2. Shipped DSH reality: both versions

| Area | Verified shipped behavior | Design consequence |
| --- | --- | --- |
| MCP client transports | `stdio` and `streamable-http` | HTTP fits an already-running connector; stdio requires a spawned bridge/proxy to it |
| Legacy HTTP+SSE | Not selectable by DSH config; SDK contains a client | Do not claim DSH config supports it; Streamable HTTP can itself use SSE |
| Tools | Lists and registers server-qualified tools; calls with cancellation and configured timeout | A child profile can consume connector tools; manager scope/gates must still be enforced |
| Tool-list notification | Refreshes registrations only | Does not queue input or wake Fishball |
| Resources | Pull list/templates/read only | No wired subscribe→agent-wake path |
| Sampling / elicitation | DSH client declares `capabilities: {}`; no corresponding handlers | Not a usable return channel here; elicitation is user input, not Fishball routing |
| Long tasks/calls | Required task execution rejected; ordinary default call timeout 60,000 ms | No indefinite wait tool; long-poll must return within caller budget |
| MCP hosting | No shipped automatic server or per-session MCP endpoint found | Connector server is new adapter code, not a config switch |
| Programmatic wake | Agent `followup` queues next-turn input and requests driver wake | First-party receiving adapter can wake idle Fishball explicitly; tool result alone cannot |

Client evidence on both installed releases:
- [rc.5 transport factory](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L38-L47>) / [rc.1 factory](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L38-L47>).
- [rc.5 tool registration/call](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L127-L153>) / [rc.1](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L127-L153>).
- [rc.5 capabilities/notification handlers](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L596-L637>) / [rc.1](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L596-L637>).
- [rc.5 resource dispatch](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L685-L696>) / [rc.1](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L685-L696>).
- [Required-task refusal](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L226-L231>) and [timeout/config](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L765-L801>); relevant behavior matches rc.5.

Both installations ship MCP client/core; server/node packages are only client-package devDependencies,
not installed server runtime support. Package an explicit chosen server/transport dependency.
[rc.5 declarations](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-mcp-client/package.json#L40-L59>),
[rc.1 declarations](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/package.json#L42-L63>).
This is bounded source inspection, not proof against every differently named implementation.

A plugin can host a new server through `webServer.register`'s node:http request/response ownership,
including streaming, but raw routes have no automatic authentication. The existing listener may
be non-loopback; reuse only if the endpoint can actually remain local-only, otherwise use a dedicated
loopback listener. `getOrigin()` supplies the selected address/port. The authenticated Fetch registry
allows GET/HEAD/POST only and does not pass admitted peer identity, so is not a transparent full
stateful Streamable HTTP endpoint (DELETE/principal handling needs an adapter).
[Host route/bind API](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts#L36-L81>),
[origin/register](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-host-webserver/lib/types/index.d.ts#L151-L174>),
[raw dispatcher](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-host-webserver/lib/index.js#L457-L472>),
[Fetch API](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-connection/lib/types/rpc.d.ts#L114-L140>).

A custom receiver can reuse Fishball activation/intake and `Agent.followup`, independent of a model
turn: [activation](<../../packages/instance/src/slim/child/chat.js#L516-L567>),
[delivery](<../../packages/instance/src/slim/child/chat.js#L598-L654>),
[rc.5 followup](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.5/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L800-L813>),
[rc.1 followup](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L564-L577>).
A normal MCP tool result returns to the active caller; it does not create an unrelated future turn.
Current [bridge dedupe](<../../packages/instance/src/slim/child/bridge.js#L307-L322>) is in memory;
DSH's [durable inbox splice](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js#L159-L200>)
rejects duplicate pending ids, not every historically consumed id. Exactly-once user-visible wake
requires a durable acceptance/dedupe/reconciliation design; MCP/`followup` alone does not supply it.

## 3. Capability matrix: loss of functionality is explicit

“Notifications client” below means a client with the **specific applicable** event/resource handler,
not merely support for standard tools/list_changed. SDK capability does not prove autonomous wake.
“Opt-in poll adapter” means deterministic scheduling/durable acceptance outside an idle model.

| Capability | MCP-only external agent | MCP + supported notifications/subscriptions | First-party Fishball: MCP + custom push |
| --- | --- | --- | --- |
| Scoped session control/read/attachments | Yes, while authenticated/attached | Yes | Yes, through existing manager façade |
| Tool results during current call | Yes | Yes | Yes |
| Durable inbox retrieval | Bounded poll/cursor tools | Same; hints prompt fetch | Custom push + same ledger/recovery semantics |
| Real-time idle-agent wake | **No guarantee**; needs external poll scheduler/wake API | **No guarantee**; handler must enqueue/wake; hints alone insufficient | Required adapter behavior via instance intake/followup |
| Permission/question/plan offers | Off by default; main-user fallback. Opt-in only with declared polling/intake/answer capability | Same opt-in; notification support alone insufficient | Full delivery; question/plan bypass watchdog |
| Settlement/user-answer notification | Available at next fetch; no guaranteed wake | Fetch after hint; wake client-dependent | Correlated exactly-once wake where required |
| Attention/unread publication | Optional attention tool; absent means zero UI projection | Same | Supported from instance unread source |
| Watchdog routing/refinement | Not supplied to arbitrary external agent | Not supplied just by notifications | Local session-id routing + healthy claims; failure→Fishball |
| Embedded Fishball chat/settings | Not supplied by MCP; connector status/control surface only | Same | Existing trusted UI/embed lifecycle |
| Disconnected/idle behavior | Notices retained within bounds; nondelegated cards to user | Same; notifications can be missed | Push loss disables delegation; fallback/recovery below |

External agents can control sessions without receiving offers. Do not attach them as full approval
managers merely because they list/call tools. Claims, local watchdog services, specialized UI and
autonomous wake are additional capabilities. Compatibility of Dots, Grokbot and Claude Duet with
transports/auth, polling, event handlers and wake APIs is **unverified**; no callback server is required.

## 4. Return-path options and recommendation

| Option | What works | Limitation / decision |
| --- | --- | --- |
| Tool results | Immediate operation result and bounded pending-event hint/page | Only when client calls; never consume durable inbox implicitly; no future wake |
| `inbox_poll(cursor, limit)` | Common denominator over ordinary tools/call | Requires future calls; idle model does not schedule itself |
| `wait_for_events(cursor, waitMs, limit)` | Optional bounded long-poll reduces empty requests | Return before caller/server timeout, including empty page. Needs external loop; no perpetual call/agent turn |
| MCP notifications/resource subscriptions | Optional change hint, then fetch ledger | Client-specific handling, subscriptions/replay and wake required; stock DSH lacks mapping |
| First-party custom push | Reliable targeted delivery plus explicit enqueue/wake | Small maintained event/ack contract; implement durable acceptance and reconnect safety |

**Recommend:** bounded poll for every client; bounded long-poll optional; notifications/subscriptions
optional bonus; first-party custom push for Fishball's timely intake. Do not require sampling,
elicitation, resources or reverse MCP. A companion may provide an external polling/wake adapter,
but that is agent-specific and not assumed installed.

### 4.1 Proposed mailbox semantics (names/shapes to freeze, not existing APIs)

- Connector owns a durable per-attached-principal event ledger. Each item carries stable `messageId`,
  typed kind, source `sessionId` (null only for approved unscoped notices), current offer/correlation
  identity and payload. A cursor is opaque and bound to principal/ownership generation.
- Poll returns bounded ordered items, `nextCursor` and explicit gap/truncation state. Reading or
  advancing a cursor is **not ack**. `inbox_ack(messageIds)` follows the client's durable acceptance;
  replay yields the same identities until ack. Forged/foreign cursor/ack is refused.
- Stale cursor must return an explicit resync requirement; do not silently skip undelivered work.
  Preserve queue bounds/backpressure and existing user-item exemptions; terminally cancel stale
  offer items without deleting live ordinary notices. Exact retention/error schemas are freeze work.
- Per-client delivery mode is pull or first-party push, with atomic handover and the same ledger;
  do not deliver through both concurrently as independent consumers. Old channel incarnations
  cannot ack or claim work for a replacement owner. Ack means accepted, not model answered.
- A lost ack can replay an accepted item: receiving adapter needs durable stable-identity dedupe,
  pending→accepted reconciliation with queue storage, and startup reactivation. Never treat a
  pending reservation as delivered or promise history-wide dedupe from DSH pending IDs alone.
- Poll/long-poll timers govern retrieval only, not approval decisions. No timeout-induced approve,
  reject or model escalation. Opt-in delegated offers may wait if a client remains attached but
  stops polling; document that tradeoff rather than inventing an approval deadline. User take-back
  and explicit detach remain available.

## 5. Attachment, failure and session routing

A link is usable when its **single logical MCP control session** authenticates, initializes, satisfies
required control-tool/capability checks and obtains the connector's one logical owner slot.
Separate booleans describe control readiness and `canReceiveOffers`; no second-leg “established”
condition. A first-party push outage does not make an ordinary external MCP connection invalid.
The authorized logical instance and transport connection/session are distinct; MCP `clientInfo`
or session id is not identity proof.

```text
DETACHED -- approved auth + initialize + required controls --> CONTROL_READY
CONTROL_READY -- declared supported intake becomes ready --> OFFER_CAPABLE
OFFER_CAPABLE -- intake unavailable / capability withdrawn --> CONTROL_READY + user fallback
CONTROL_READY / OFFER_CAPABLE -- MCP loss --> DISCONNECTED
DISCONNECTED -- same owner reauth + capability check --> CONTROL_READY [then opt-in intake]
ANY -- detach/revoke/owner replacement --> DETACHED (old generation invalid)
```

Control remains available through valid MCP when first-party push fails; stop new delegated offers,
withdraw old instance offers to main-session user fallback and suspend accepted-but-unprocessed
child decisions. Ordinary notices wait. Recovered push cannot retro-offer those user-owned cards;
late answers to retired offers fail even on a fresh connection. Loss of MCP control also withdraws
delegation: an alive push channel cannot grant authority to answer through a stale connection.
Do not stop managed DSH sessions because intake/watchdog/transport failed.

Here “MCP loss” means invalidation of the logical authenticated session, not an ordinary HTTP/TCP
close or absent/closed optional GET/SSE stream. Streamable HTTP can use short separate requests.
Explicit detach/revocation, actual MCP-session termination, a failed authenticated request proving
session loss, or declared capability loss may withdraw authority; idle time or simply not polling
must not. An isolated request timeout may leave its outcome unconfirmed without proving session loss.

Connector authorizes every approval/question answer against the current live offer id, attached
owner/generation and offer-capable state. Discoverable answer tools, a guessed session/request id,
control-only access or mailbox ack never confer decision authority. Intake loss rejects late answers
even while ordinary controls remain usable. Self-authored question-answer flows retain their separate
existing ownership checks; they are not a bypass for delegated cards.

Preserve existing identity/fencing intent; implement ownership generation and server-bound MCP/push
incarnations. Bind each authenticated transport to its current server-side incarnation, not
caller-declared metadata. Detach/replacement revokes all
credentials/claims for that owner. Reconnect preserves notice identities but not authority of old
offers. Mutating calls with unknown outcome remain `unconfirmed`: current bridge result memory
is per connection, not durable cross-reconnect idempotency; never automatically retry sends.

**Watchdog routing is entirely inside Fishball**, in X0-I/X0-A/X15 before Fishball queueing:
- Validate authenticated source-session/offer scope; never trust arbitrary session id as authority.
- Permission + current healthy watchdog claim → that claim incarnation/decision agent, no Fishball
  turn. Fault/disabled/absent watchdog → release claim and Fishball handles it; no send block/halt.
- Questions and plan reviews **always Fishball**, never watchdog context/claim (OQ-04 = B).
- Ordinary notices follow existing X9 filtering, not blanket watchdog forwarding.
- Watchdog-only terminal results do not automatically wake/copy to Fishball. A user terminal answer
  wakes reached Fishball once where required; Fishball's own answer causes no duplicate wake.
  Offer escalation is handoff, not terminal closure; preserve the user's live card.
- Recovery retains dormant briefs and requires explicit resume/rebrief. No per-watchdog endpoint,
  MCP pairing, external session-route mutation or automatic reclaim.

Raw MCP tools must not bypass X12/X13 scope or X19 send gates: register/wrap controls in the
manager façade, not globally for side agents. Preserve image-send gates and healthy-only X16 start
validation. Reuse the [bridge domain guards](<../../packages/connector/src/slim/host/bridge.js#L4-L41>),
not only the [low-level session port](<../../packages/connector/src/slim/host/session-port.js#L1-L35>).

## 6. Security, discovery and limits

- Local-only concrete loopback binding by default; explicit Host/Origin checks, no wildcard CORS.
  Locality does not authenticate another local process. Do not expose a raw handler on an existing
  LAN/public DSH listener and call it local-only. Remote access needs a separate TLS/auth/tunnel design.
- Connector mints high-entropy **connector-scoped per-manager credentials** during trusted launcher
  provisioning or user-approved external enrollment; only one logical attached owner controls
  sessions. Check credential/owner/scope on every MCP request/stream. Never share main DSH owner
  cookies/tokens; [DSH admission](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js#L736-L790>)
  is broader than the required connector authority.
- Publish actual endpoint privately through launcher/configuration, not model prompts. No secrets
  in URLs, tool arguments/results, logs, UI or exported plugin/admin config. Ordinary MCP `headers`
  config is not a verified secret store: test projection/export redaction or use private provisioning.
  Stdio bridge credentials use private environment/IPC, not command-line arguments.
- First-party push reuses private authenticated transport patterns; issue a separate scoped channel
  capability bound to the same owner/generation, not a public callback URL. No arbitrary agent URL
  dialing or reverse MCP. Exact reused transport binding is a spike item.
  [Private publication](<../../packages/instance/src/native-runtime/child.js#L124-L181>),
  [endpoint checks](<../../packages/instance/src/native-runtime/index.js#L178-L186>),
  [HMAC pattern](<../../packages/instance/src/native-runtime/wire.js#L21-L25>).
- Revoke on detach/uninstall/ownership replacement, invalidate stale streams/acks, and clean failed
  enrollment reservations. Rate/in-flight/body/backlog limits enforced below transport codecs.
- Keep **64 KiB default UTF-8 message/forwarded-body cap**, **8 KiB raw caller reason cap**, separate
  500-character decision/descriptor reason bound, attachment/read limits and visible start-title
  requirement. JSON Schema character lengths do not enforce UTF-8 byte limits; validate in domain
  code. No invented 200-character `session.start` upper bound; descriptor/prompt title cap remains.
  Bound MCP frames/SSE separately; do not mislabel message cap as envelope cap.
- Preserve machine domain codes in structured tool results: `limit-exceeded`, `reason-too-large`,
  `expired`, `unavailable`, `queue-full`, etc., at their proper layers. `not-supervised` stays local
  to instance claims unless deliberately mapped. MCP JSON-RPC failures are distinct from domain
  refusal; `isError` and prose alone are insufficient for retry logic. Stock DSH throws on
  `isError: true` before retaining `structuredContent` ([client conversion](</Users/samuel/Library/Application Support/DSH/data/versions/0.2.2-rc.1/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js#L231-L239>),
  also present in rc.5). Prefer a tagged domain-result envelope in a successful MCP CallToolResult,
  with structured content and text fallback; alternatively a first-party wrapper must consume raw
  results before conversion. Freeze that choice and error mapping; never lose refusal codes.
  Grants/hostRefs retain expiry; transport timeouts remain; decision timers do not return.

## 7. What happens to versioning, contract 2.0 and UI

MCP initialization supplies its protocol/version/capability negotiation. Tool discovery supplies
structural input/output schemas, **not** behavioral proof. Stable capabilities/tool identifiers
must declare timer-free approval semantics, durable mailbox/ack and optional intake/attention;
required control capability incompatibility refuses attachment, optional missing capabilities
reduce the matrix. Breaking semantics require distinct identifiers or an explicit compatibility
profile; copying server declarations is not implementing them. Exact naming remains schema-freeze work.

The custom [2.0 draft](<../connector-contract-2.0.md>) is **parked as a complete delta/reference**.
Do not implement its custom control envelope/attach negotiation in parallel with MCP. Reuse timer
removal, limits, errors, no closed-card retention and reached-layer history requirements. The
first-party event/ack channel needs a **small explicit contract**, not the full custom control API.
If legacy custom attach remains during migration, reject 1.x as specified; if removed, fail old
consumers before delegation. No downgrade or legacy timer exception. MCP does not make old 1.x
packages compatible automatically.

UI is orthogonal: fish, managed marks, dots and unread projections remain connector UI; optional
attention is client→connector, not a pushback requirement. No publication means zero counts;
detach/close resets them. External MCP clients need not provide a chat/settings iframe. First-party
secure embed, status/retry, locale, child lifecycle/admin/provider-sync remain separate services.
[Existing iframe](<../../packages/connector/client.js#L994-L1044>),
[embed broker](<../../packages/instance/src/slim/host/embed.js#L1-L12>),
[lifecycle channels](<../../packages/instance/src/native-runtime/wire.js#L6-L19>).
No arbitrary remote-agent HTML is implicitly trusted as a Fishball embedded page.

## 8. Tasks, waves and package impact

| Wave / owner | Revised work | Gate |
| --- | --- | --- |
| MCP-S1 feasibility | New connector MCP server SDK/transport packaging on both hosts; one-way list/call, private auth/discovery, manager scopes, limits/errors | No reverse MCP server; verified controls and secret isolation |
| MCP-S2 delivery | Durable poll/cursor/ack ledger; optional bounded wait; first-party push/intake/wake with reconnect/dedupe; capability downgrade/user fallback | Idle Fishball wakes once; external plain client works without callbacks; no lost/duplicate notices |
| MCP-S3 freeze | Required control and optional offer/attention/hint capabilities; result/error/tool/event schemas; ownership/migration rules | Reviewed shared baseline before parallel implementation |
| K1 | Replace custom control framing with MCP server/profile, attachment and optional attention; independent capability checks | Shared conformance fixtures |
| K2 | Keep timer/settings/descriptor-expiry removal, terminal vs handoff, live-card clearing/history and non-time fallback | No timer or closed-card-store regression |
| X0-W/C/I/A | MCP control adapter, first-party push lifecycle, durable intake, per-session routing and approval delivery | One ledger, no duplicate control API |
| X0-G/X12/X13, X0-S | Tool isolation/gates, healthy-only start/fault handover, claim generation/incarnation | Side agents cannot invoke raw controls; questions bypass watchdog |
| WD / FN-3 / X8 / FN-A | Existing watchdog policy/refine/dormancy; attention producer and connector fish/dots | No dependency on external client watchdog or callback server |
| UI / CHILD-WEB / PG | Keep first-party trusted lifecycle/embed; remove countdown/retained-card UI | MCP-only clients do not promise embedded UI |

After MCP-S3, connector/core and instance/plugin work can proceed in parallel against shared schemas.
Acceptance includes both host versions, no notification support, no polling while idle, wait cancellation,
cursor gaps/replay/lost ack, push outage with MCP alive, retired offers, second-owner refusal, revoked
auth, exact byte boundaries, no time-advanced decisions, question bypass and no watchdog-only wake.
These are planned acceptance tests, not tests executed here.

Both packages currently `0.1.0-alpha.0`, instance peer `>=0.1.0-alpha.0 <2`.
The earlier proposed both-`2.0.0`/peer-`>=2.0.0 <3.0.0` remains **unapproved release numbering**.
MCP dictates neither npm versions nor removal of built-in lifecycle coupling. A breaking public
binding needs coordinated release/old-export migration. Explicitly package server dependencies and
update [child snapshot composition](<../../packages/instance/src/native-runtime/installation.js#L186-L203>),
which currently copies the contract export; do not rely on host development dependencies.
[Connector manifest](<../../packages/connector/package.json>),
[instance manifest](<../../packages/instance/package.json>). No manifests changed.

## 9. Remaining A/B choices

| Open question | A | B | Recommendation |
| --- | --- | --- | --- |
| OQ-M1: first-party return path | Custom authenticated push + durable ledger, MCP controls | Poll scheduler only, using same ledger and explicit enqueue | **A** for timely wake and reuse; B can work but adds polling/liveness machinery |
| OQ-M2: external delegated offers | Off by default; explicit intake/answer capability opt-in | Always user-owned; external agents receive ordinary notices only | **A** preserves optional richer integrations; B is simpler and cannot strand offers in an idle external client |
| OQ-M3: migration | Retain old exports for a bounded migration with one shared owner; never accept 1.x timer semantics | Coordinated breaking release removes old custom control endpoint/exports | **B** if built-in consumers upgrade together; A only for an identified external consumer |

The single-direction architecture is decided; these recommendations are not implementation approval.
External agent transport/auth/wake support, exact server SDK wiring and durable enqueue reconciliation
remain unverified. No agent is required to host an MCP server, and optional notifications never become
an implicit prerequisite for the basic control toolset.
