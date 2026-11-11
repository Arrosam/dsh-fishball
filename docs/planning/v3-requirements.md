# Fishball V3: requirements (draft)

Status: **draft for alignment, 2026-11-11. Docs only.** Branch `design/v3`, cut from
`integrate/v2` at `505766e`. No product code or test cases exist for anything in this file yet.
The design that answers these requirements is [v3-design.md](<v3-design.md>). Section 7 holds the
questions that must be answered before the requirements freeze.

Inputs: [V2 final scope](<v2-final-scope.md>) (what V2 shipped and what it deferred to V3),
[instance extension points](<../plugins/instance-extension-points.md>) (U1–U22, X1–X19),
[connector MCP option](<../plugins/connector-mcp-option.md>) (decisions 1a/1b/1c), the
[connector contract 1.2](<../connector-contract.md>), and these documents on other branches:
- the bundled-placement note (`docs/v2-bundled-placement` @ `f71717e`, `docs/plugins/bundled-placement.md`);
- the Watchdog plan (`docs/v2-watchdog-plan` @ `8c883be`);
- the Watchdog T0 reconciliation (`test/v2-wd-t0-reconcile` @ `bdeb28a`);
- the MCP spikes S1 (`spike/mcp-s1` @ `0b17e6f`) and S2 (`spike/mcp-s2-recovery-cuts` @ `5f247b8`);
- the fold-notify design (`design/fold-notify` @ `7347c1f`);
- the board design (`design/recall-memory` @ `fc9bc8d`).

## 1. The user's words

### 1.1 New V3 requirements (2026-11-11), verbatim

> 第三版的范围除了我们之前讨论的那几项，还要增加一些改变。Connector就只做connect，不作UI改动，功能改为单纯的Expose一个MCP，需要传入Credentials（access token）进行握手才能访问。可以创建新的token来给外部agent连接。现在的UI改动全部挪到一个新的DSH插件，dsh-fishball-embed-UI，这个插件来负责提供那个访问子进程的会话界面。单独装一个UI插件什么都不能做，单独装一个connector只能允许agent连接，而无法在主DSH上通过UI访问到fishball。Fishball instance只会提供一个新的子进程，同时可以对接MCP来访问主进程DSH或者远程DSH。我注意到MCP协议是可以订阅事件的，就可以通过事件来允许DSH去请求Fishball。对于Watchdog，则改成安装Watchdog时由Watchdog订阅来自DSH的事件，而因为Watchdog就处在Fishball instance内，可以直接通过DSH的会话内沟通来对Fishball发出请求。先对齐需求，准备好设计文稿

What it means (Fishball's reading, to confirm through section 7):

1. **`fishball-connector`** does connect only and makes no UI changes. It exposes an MCP server.
   A client must present credentials (an access token) to get in. The user can create new tokens
   for external agents.
2. **`dsh-fishball-embed-UI`**, a new DSH plugin, takes over all of today's UI work: the session
   page that reaches the child process, the sidebar fish and dots, the managed marks, the embed
   frame, and the Plugins cards.
   - Installed on its own, the UI plugin does nothing.
   - Installed on its own, the connector only lets agents connect. The main DSH has no UI path to
     Fishball.
3. **`fishball-instance`** only provides the new child process. That child is an MCP client of
   the main DSH or of a remote DSH.
4. MCP supports subscriptions, so DSH → Fishball requests (approvals, questions, session events)
   travel as MCP events.
5. **Watchdog** subscribes to DSH's events itself once it is installed. It lives inside the
   Fishball instance, so it makes its requests to Fishball through DSH's in-session communication
   inside the child.

### 1.2 Earlier decisions carried into V3

These were decided before today and stay unless section 7 reopens them.

- **Watchdog**, a token saver and not a safety layer (U16):
  - It runs only passively, when a session triggers it, or on active patrol. A single "minimum
    supervision interval" limits the patrol: default 29 min, range 1 min to 24 h.
  - There are no approval timers and no hourly or daily caps. Model changes follow DSH's native
    session behaviour.
  - Any failure means it counts as off. Fishball is told "watchdog is down" every time (U20).
  - Watchdog decides only a well-justified reject itself: the request is beyond the task AND
    dangerous. Other high-risk items go to the user.
  - Pausing supervision of a session means stopping that session.
- **Board** (with `board_search`): the archive is kept forever and can be searched with grep;
  done items stay on the board for 30 days (U19).
- **Fold-notify.**
- **Bundled placement.** The bundled plugins ship inside the instance package and are copied into
  the child profile at boot. A plugin deleted while off stays off. An incompatible bundled plugin
  blocks the child's start.
- **MCP** becomes a standalone piece in V3. Direction so far:
  - MCP control is one-way (no reverse MCP).
  - External agents may handle approvals and questions. This is on by default, with no setting
    to turn it off (1b).
  - The first committed outcome wins (OQ-14).
  - The old custom control interface is removed in one coordinated change, with no legacy path
    (1c = B).

## 2. Terms

| Term | Meaning |
| --- | --- |
| **Main DSH** | The user's DSH whose sessions are managed. It can be local or remote. |
| **Local DSH** | The DSH where the user installs `fishball-instance` and `dsh-fishball-embed-UI`. Usually the same as the main DSH. |
| **Connector** (C) | `fishball-connector`, installed in the main DSH. |
| **Instance** (I) | `fishball-instance`: a launcher row in the local DSH plus the child DSH process it starts. |
| **Embed-UI** (U) | `dsh-fishball-embed-UI`, installed in the local DSH. |
| **Child** | The private DSH process the instance starts. Fishball, Watchdog, the board and fold-notify run inside it. |
| **Principal** | One access token's identity at the connector. Fishball (through the instance) is one principal; each external agent is another. |
| **Event** | Something that happens at the main DSH and that a principal must learn about: an approval offer, a question, a settlement, a watch notice, a session state change or a `message_fishball` message. |

## 3. Requirements

Each requirement is written to be testable. **Bold** marks the observable. "Refused" means the
operation returns a machine-readable error code, changes nothing and leaks nothing.

### 3.1 Packages and boundaries (R-ARCH)

| ID | Requirement |
| --- | --- |
| R-ARCH-01 | V3 ships three installable plugins: `fishball-connector`, `fishball-instance` and `dsh-fishball-embed-UI`. The board, fold-notify and Watchdog are not separately installable in any main DSH; they ship inside `fishball-instance` (R-BND). |
| R-ARCH-02 | `fishball-connector` registers **no browser client module**. Its package declares no `dsh.client` entry, and loading it adds no sidebar entry, slot contribution, CSS or route that serves HTML. |
| R-ARCH-03 | Every main-DSH UI change Fishball makes comes from `dsh-fishball-embed-UI`: the sidebar fish and dots, the managed-session marks, Hand over / Take back, the embedded session page, the status and Retry card, and the provider-sync trigger. With embed-UI uninstalled, **no** Fishball UI element appears in the main DSH. |
| R-ARCH-04 | `fishball-instance` provides the child process and its MCP client connection. It contributes no main-DSH UI. Its only main-DSH configuration surface is DSH's native auto-generated settings form for its row. |
| R-ARCH-05 | No V3 package patches DSH code, bundles or another plugin's files. It uses only public DSH services and slots, on both supported SDKs (R-COMPAT). |
| R-ARCH-06 | Talk between Fishball (in the child) and the main DSH goes **only** through the connector's MCP endpoint. No V3 code path reaches main-DSH sessions through `fishballConnector.attachInstance`, the envelope-v2 frames or any other private channel. |

### 3.2 Connector: an MCP server (R-CON)

| ID | Requirement |
| --- | --- |
| R-CON-01 | The connector exposes one MCP endpoint over Streamable HTTP. It conforms to MCP revision **2026-07-28** (the current revision) and also serves clients of revision **2025-11-25** (subject to Q12). A client of either revision can list and call the connector's tools. |
| R-CON-02 | The endpoint serves session control as MCP tools: list, start, message, redirect, stop, read, watch / unwatch / watches, and release. It also serves approval, question and prompt answering; grant list and revoke; attachment put and read; mailbox poll and ack; and the attention signal. These carry the domain semantics and limits of contract 1.2 §4 and §8. Each tool returns a structured domain result: refusals carry their contract code (for example `limit-exceeded`, `expired`, `queue-full`) and are never just prose. |
| R-CON-03 | Events reach a principal through a **durable mailbox**. Events stay pending until the principal acks them. A poll returns a bounded ordered page plus a cursor. A stale or foreign cursor gets an explicit resync answer, never a silent skip. |
| R-CON-04 | The mailbox is published as an MCP resource, and a subscription to it gets `notifications/resources/updated` whenever new events arrive. The notification is a **hint only**: a client that never subscribes gets the same events by polling, and losing a notification loses no event. |
| R-CON-05 | No approval, question or plan review is ever settled by a timer, by a client's silence or by a lost notification. A delegated item with no answer **waits**. |
| R-CON-06 | Settlement is atomic, and the first committed outcome wins (OQ-14). A second answer, by user or agent, gets `already-settled` or `expired` and changes nothing. |
| R-CON-07 | External principals receive and may answer delegated approvals and questions, including plan reviews. This is on by default, and **no setting turns it off** (1b). |
| R-CON-08 | The connector keeps today's main-session tools `message_fishball` and `ask_fishball` and the managed-session interception of permission requests. These are tools and approval hooks, not UI. They route to principals by the rule chosen in Q7. |
| R-CON-09 | With no principal connected, the connector behaves as contract 1.2 §9 does with no instance attached. Messages queue, up to the `maxQueuedInputs` bound. `ask_fishball` answers `unavailable` at once. A managed session's permission request goes to the user in that session. |
| R-CON-10 | The connector's settings (limits, tokens and endpoint options) live **only** in DSH's native Plugins settings form for `fishball-connector`, and the connector ships no custom settings UI. |

### 3.3 Tokens and authentication (R-TOK)

| ID | Requirement |
| --- | --- |
| R-TOK-01 | **Every** request to the MCP endpoint carries `Authorization: Bearer <token>`. That includes the first one (`server/discover` or `initialize`) and subscription and stream requests. A missing, unknown, revoked or malformed token gets **HTTP 401** with no MCP processing. An unauthenticated request never reaches tool, resource or subscription code. |
| R-TOK-02 | A token in a URL query string is refused, even when a valid header is also present. |
| R-TOK-03 | The user can create a new token for an external agent from the connector's native settings form, with no custom UI (the mechanism is Q5). |
| R-TOK-04 | Token secret values live **only** in DSH's credential store (`ctx.credentials`). They are never in settings documents, logs, lifecycle files, temp files, launch overlays, process arguments, tool results, resource contents, error messages or browser responses. |
| R-TOK-05 | Revoking a token takes effect on the **next request**. Open subscription streams of that principal close, and its pending answers to delegated items are refused. Its queued mailbox events are dropped (an approval offer returns to its user) or kept, per the item kinds in [design §5.3](<v3-design.md#53-revocation>). |
| R-TOK-06 | Token comparison is constant-time. Repeated failed attempts do not reveal which tokens exist. |
| R-TOK-07 | Each principal is identified by its token entry, never by MCP `clientInfo`, a session id or a caller-supplied field. |

### 3.4 Events: DSH → Fishball (R-EVT)

| ID | Requirement |
| --- | --- |
| R-EVT-01 | Each of these produces one mailbox event for the principal it is routed to: an approval offer or a question for a session that principal manages; a settlement or retirement of an offer the principal saw; a watch notice; a `session.state` change; a `message_fishball` message; and a hand-over note. |
| R-EVT-02 | An event carries a stable `eventId`, its kind, its source session id, its correlation id (offer id for offers) and a bounded payload. A replayed event has **the same identity**. |
| R-EVT-03 | The first-party Fishball is woken by events: an event arriving while Fishball is idle starts **exactly one** Fishball turn for it after durable acceptance, also across a lost ack and a child restart. This is still an open engineering gate from MCP-S2 (design §8.4). |
| R-EVT-04 | An external principal that subscribes gets a notification within the same event dispatch as the commit to its mailbox. One that does not subscribe sees the event on its next poll. |

### 3.5 Instance: the child process (R-INS)

| ID | Requirement |
| --- | --- |
| R-INS-01 | The instance starts one private child DSH process, with its own home and profile, under the local DSH. Starting, stopping and restarting the child never changes main-DSH settings, sessions, credentials or shortcuts. |
| R-INS-02 | The instance's settings (native form) name the **target**: the URL of a connector MCP endpoint, plus a credential reference to the token. A blank URL means the local DSH's own connector. |
| R-INS-03 | The child connects to the target over MCP with that token. When the target is unreachable or refuses the token, Fishball still runs and its status shows `target-unreachable` or `token-refused`. It retries with bounded backoff and never sends the token to any other origin. |
| R-INS-04 | The token reaches the child without being written to disk in the child or the local DSH, and without crossing a process argument or environment variable another process can read (design §5.4). |
| R-INS-05 | The instance publishes a **child locator** service in the local DSH for embed-UI: child state, status code, the child web origin, a single-use admission ticket, and Retry. It publishes nothing to browsers itself. |
| R-INS-06 | V2 child behaviours stay: the A-lite Fishball-only native page; page-open manager creation after the ready signal; effective read-only with the private Skills exception; the child-only `fishball-recommended` tab; slim settings; and the isolated child browser origin with shortcut remapping. Who ships the child-side web modules is Q2. |
| R-INS-07 | Remote targets work: an instance in DSH A whose target is DSH B's connector manages **B's** sessions with the same tool semantics as a local target. |

### 3.6 Embed-UI (R-UI)

| ID | Requirement |
| --- | --- |
| R-UI-01 | Embed-UI finds the child **only** through the instance's child locator service (R-INS-05). Without that service (instance absent, disabled or older), embed-UI registers no sidebar entry, no route and no frame. It logs one `instance-missing` diagnostic. |
| R-UI-02 | With the instance present, embed-UI shows the Fishball sidebar entry. Opening it frames the child's native page at the child's own origin, through a single-use admission ticket. No credential is placed in the frame URL. |
| R-UI-03 | Embed-UI shows the child status and Retry outside the cross-origin frame. It never shows a token. |
| R-UI-04 | Main-session marks (managed fish, dots, unread or attention latch) and Hand over / Take back appear only when the local DSH also runs the connector (Q3, Q4). They reflect connector state, and their actions run through the connector. |
| R-UI-05 | Embed-UI stores no secret. Its settings, if any, use DSH's native form. |

### 3.7 Remote DSH (R-REM)

| ID | Requirement |
| --- | --- |
| R-REM-01 | The connector's endpoint is reachable from another machine only when the user has configured that exposure. The default is loopback-only (Q9). |
| R-REM-02 | A non-loopback endpoint is served over TLS. Plain HTTP on a non-loopback address is refused at load, with a diagnostic. A user-run tunnel to a loopback endpoint is the supported alternative. |
| R-REM-03 | The endpoint validates `Origin` on every request. A present Origin outside the allowlist gets **HTTP 403** (MCP Streamable HTTP security requirement). |
| R-REM-04 | Losing the remote connection never stops managed sessions on the remote DSH. Delegated items for an unreachable principal wait, per R-CON-05. |

### 3.8 Watchdog (R-WD)

| ID | Requirement |
| --- | --- |
| R-WD-01 | Watchdog runs in the child only. No Watchdog code, settings or UI runs in the main DSH. |
| R-WD-02 | When installed and enabled, Watchdog opens **its own** subscription to the connector's events for the sessions it supervises (Q10). No Fishball turn relays those events. |
| R-WD-03 | Watchdog runs only (a) passively, on an event from a supervised session (a permission request, a finished turn), or (b) on patrol. Explicit `check_now` and active refine are manager operations. |
| R-WD-04 | Patrol checks of one session are at least `minCheckIntervalSeconds` apart: default **1740** (29 min), integer, inclusive range **60–86400**. At the bounds, 60 and 86400 are accepted and 59 and 86401 are refused. Passive triggers, `check_now` and active refine are not throttled. |
| R-WD-05 | There are no approval timers, no hourly or daily call caps, no stall, idle or paused-poll timers and no per-brief schedule overrides. The hung-check timeout and the bounded start attachment carried over from T0 are failure bounds, not pacing. |
| R-WD-06 | Watchdog's model follows DSH's native session behaviour: a model change applies at the next not-yet-prepared model step. Saving settings performs no model lookup. |
| R-WD-07 | Any Watchdog failure (load, readiness, subscription loss, model or provider error, budget, store, claim, attach, runtime) makes Watchdog **effective off** at once. Its claims are released, pending items go to Fishball, sends pass, and stale callbacks are fenced. Fishball is told **"watchdog is down"**: one notice each time Watchdog goes down, including with zero supervised sessions and when the child cannot start. A failure never stops or restarts a watched session. |
| R-WD-08 | Watchdog sends its requests to Fishball (escalations, "watchdog is down", reports) **through DSH's in-session communication inside the child**, not through the connector or MCP. |
| R-WD-09 | Decision rules: Watchdog allows in-scope low-risk requests. It rejects **only** a request that is both beyond the task and dangerous, and gives a justification. It sends every other high-risk request to the user (Q13). It sends uncertain requests to Fishball. Questions and plan reviews always go to Fishball, never to Watchdog (U21). |
| R-WD-10 | Pausing supervision of a session stops that session first. A failed stop is reported and not recorded as paused. |
| R-WD-11 | One Watchdog side session supervises one session (U8). Permission requests of a claimed session go to Watchdog only while it is healthy. Without a claim, they go to Fishball. |

### 3.9 Bundled plugins, board and fold-notify (R-BND, R-BRD, R-FN)

| ID | Requirement |
| --- | --- |
| R-BND-01 | `fishball-board`, `fishball-fold-notify` and `fishball-watchdog` ship inside the `fishball-instance` package. On every child boot they are copied into the child profile before it loads. The main DSH never resolves, lists or loads them. |
| R-BND-02 | The first placement turns each one on. A later disable survives restarts and instance upgrades. A plugin deleted while off is placed again **off**. |
| R-BND-03 | An enabled bundled plugin that is incompatible with the running DSH (or fails to load) **blocks the child's start**. The status names the plugin and the reason. For Watchdog, the "watchdog is down" notice is kept and delivered once Fishball can run. |
| R-BND-04 | Switching a bundled plugin on or off takes effect at the next child restart. The UI says "restart required", never "live". |
| R-BRD-01 | Board records are never deleted while installed. A done item stays visible for **30 days** unless cleared early, and stays archived after that. `board_search` finds archived items by keyword. |
| R-BRD-02 | Uninstall offers an archive export before deleting the runtime (Q-S = A). |
| R-FN-01 | Fold-notify batches Fishball's inbox notices as designed. It sets the main-DSH attention latch only through the connector's MCP attention tool. |

### 3.10 Migration (R-MIG)

| ID | Requirement |
| --- | --- |
| R-MIG-01 | A V2 user who upgrades the connector and the instance and installs embed-UI ends up with a working Fishball page and session list. Fishball's child history, Skills, board data (none in V2) and settings are kept. |
| R-MIG-02 | A V3 instance against a V2 connector, or a V2 instance against a V3 connector, fails visibly with `connector-upgrade-required` or `instance-upgrade-required` before any delegation. There is no compatibility shim. |
| R-MIG-03 | V2 connector settings that V3 still uses keep their values. Settings V3 dropped are ignored, never re-rendered (D2 rule). |
| R-MIG-04 | A V2 user's first V3 start leaves them a usable local token (Q8). |

### 3.11 Compatibility and security (R-COMPAT, R-SEC)

| ID | Requirement |
| --- | --- |
| R-COMPAT-01 | All three packages work on DSH **0.2.1-rc.5** and **0.2.2-rc.1**, verified separately on each, with no version-specific behaviour visible to the user. |
| R-SEC-01 | In the main DSH, the connector is the only Fishball component that reads or acts on main sessions (Q1). |
| R-SEC-02 | No component logs a token, a credential value, an admission ticket or the `Authorization` header. A test that greps every log, lifecycle file and temp directory after a full run finds none. |
| R-SEC-03 | The MCP endpoint applies body, frame, backlog and in-flight limits below the transport codec. Limit refusals are structured. |

## 4. Install matrix

C = connector, I = instance, U = embed-UI. "Local" means installed in the same DSH as the
connector. The default instance target is the local connector (R-INS-02).

| # | Installed in the local DSH | What works | What does not |
| --- | --- | --- | --- |
| 1 | none | — | — |
| 2 | **C only** | The MCP endpoint. External agents with a token can control sessions and handle delegated approvals and questions. `message_fishball` and `ask_fishball` route to a connected principal, or answer `unavailable`. | No Fishball, no UI, no fish or dots, no Hand over button. |
| 3 | **U only** | Nothing. Embed-UI is inert and logs `instance-missing` (R-UI-01). | Everything. |
| 4 | **I only**, target blank | The child starts, and Fishball runs in it. | No connector to reach: status `target-unreachable`. No UI path to Fishball. |
| 4r | **I only**, remote target | Fishball manages the remote DSH's sessions over MCP. | No local UI path to Fishball. |
| 5 | **C + I** | Fishball manages local sessions over MCP. External agents work too. Headless: Fishball's work is visible in the managed sessions. | No UI path to Fishball in the main DSH. |
| 6 | **C + U** | The same as row 2. Embed-UI is inert without the instance. | No Fishball page. |
| 7 | **I + U**, remote target | The Fishball page in the local DSH (embed frame, status, Retry). Fishball manages the remote DSH. | No local main-session marks or Hand over (no local connector); Q4. |
| 7b | **I + U**, target blank | The Fishball page works. Fishball reports `target-unreachable`. | No sessions to manage. |
| 8 | **C + I + U** | Everything: the page, marks, dots, Hand over / Take back, approvals, Watchdog, board and fold-notify. | — |
| 8r | C + I + U, plus external agents with their own tokens | The same, with several principals (routing in Q7). | — |

Watchdog, the board and fold-notify exist only where I exists. They are bundled and run in the
child.

## 5. Out of scope for V3

- Reverse MCP (the connector calling an agent's MCP server), callback URLs, agent-hosted servers.
- OAuth 2.1 authorization-server flows, dynamic client registration and client ID metadata
  documents. V3 uses connector-issued static bearer tokens (design §5).
- MCP sampling, elicitation, roots, logging, and the Tasks and Apps extensions as control or
  answer paths.
- A custom settings UI for tokens or the connector; a UI that reveals a token value.
- Per-token permission scopes, unless Q6 adds them.
- Bundled plugins installable in the main DSH; Watchdog in the main DSH.
- Desktop (Electron) shell support beyond what DSH's own web shell provides.
- Publishing any package to a registry.
- Migrating pre-V2 (alpha or legacy custom-page) child profiles.

## 6. What V3 replaces or retires from V2

| V2 element | V3 fate |
| --- | --- |
| Connector contract 1.2: the `fishballConnector.attachInstance` / `current()` service, envelope-v2 frames, handshake, `ui` paths, `status`/`retry` descriptor fields, `UI_LANG`, `BROWSER_MESSAGE`, `ContractError` attach codes | **Retired.** The domain semantics (operations, vocabularies, limits, refusal codes, timer-free D1) move into the MCP tool and event schemas. The `./contract` export is replaced by an MCP schema/profile module. |
| D1 timer-free negotiation (`interaction.timerfree`) | Becomes mandatory and implicit. Nothing is negotiated. |
| D2 inert legacy settings | Kept (R-MIG-03). |
| D3 `attention.signal` + connector latch | Kept as an MCP tool. The latch is shown by embed-UI. |
| Connector `client.js` (sidebar fish, dots, managed marks, embed frame, Plugins card, connector locale for UI) | **Moved** to embed-UI. |
| Instance `client.js` main Plugins card (status, Retry, `enabled`, provider-sync trigger) | **Moved** to embed-UI. The provider-sync engine stays in the instance's local row. |
| Instance embed broker (`src/slim/host/embed.js`), private admission (`native-web-access.js`), status/Retry routes (`src/native-web.js`) | **Moved** behind the child locator: the instance mints the ticket and embed-UI serves the frame (design §4). |
| Instance connector binding (`src/host/binding.js`, `followConnector`, `connector-missing`) | **Replaced** by the child's MCP client link and its target status. |
| Child snapshot copy of `node_modules/fishball-connector/contract` | **Retired.** The child carries the MCP schema module in its own snapshot. |
| Decision 1a = A: custom authenticated first-party push / wake channel | **Superseded** by MCP subscriptions plus the mailbox (confirm in Q11). |
| Custom 2.0 contract draft | Stays parked as history. |
| X12 `bridge(pluginId, ops)` scoped connector client in the child | Same local scoping, now over the MCP link. |
| X15 claims and X19 send gate | Kept in the child. Watchdog feeds them, and Fishball's event handler consults them. |
| V2 "ships no bundled plugins" rule; the removal of the Remove-hiding list | Reversed for the child: board, fold-notify and Watchdog ship bundled (R-BND). |

## 7. Open questions for the user

Fishball will ask these one at a time. Each one gives the background, the options and a
recommendation.

**Q1. What may run in the main DSH?**
*Background:* the earlier rule is "DSH主实例永远只运行一个connector" (the main DSH only ever runs
one connector). In V3 the instance's launcher row and embed-UI are also DSH plugins, and in the
usual setup they sit in the same DSH as the connector.
- **A (recommended):** read the rule as "the connector is the only main-DSH component that
  touches main sessions". The instance's launcher row (it starts the child and reads only its own
  settings and token) and embed-UI (UI only) may be installed in the main DSH. Neither can read or
  act on main sessions except through the connector's MCP, like any client.
- B: the main DSH runs only the connector. The instance and embed-UI must be installed in another
  DSH (a "local" DSH that is not the main one), always using a target URL.
- C: as B, but the instance becomes a standalone launcher outside DSH. That needs a new
  non-plugin delivery, and embed-UI could not reach it.

**Q2. Who ships the child-side web modules?**
*Background:* these are the A-lite `fishball-page` (it hides the sidebar and keeps only the
Fishball session), the `fishball-recommended` tab and the child settings panel. They run inside
the child's DSH web, not in the main DSH. "All UI changes move to embed-UI" could include them.
- **A (recommended):** they stay in the instance as part of the child. They enforce child
  guarantees (Fishball-only, read-only, no new sessions) that must hold however the child web is
  reached. Embed-UI owns every main-DSH UI change.
- B: they move to embed-UI, and the instance copies them into the child only when embed-UI is
  installed. The instance then depends on embed-UI's files, and an instance-only child web would
  have no Fishball-only guard.

**Q3. How does embed-UI get connector state?**
*Background:* managed marks, dots and Hand over / Take back need connector state and actions in
the main DSH.
- **A (recommended):** the connector publishes a small in-process host service, with no UI:
  marks, attention latch, Hand over / Take back and the attention clear. Embed-UI consumes it.
  It uses the same-process trust DSH plugins already share, so no token is needed.
- B: embed-UI is an ordinary MCP client of the connector with its own token. Everything then goes
  through MCP, but the user must create and keep a token for the UI.

**Q4. Embed-UI without a local connector.**
*Background:* in matrix row 7, the instance targets a remote DSH and the local DSH has no
connector.
- **A (recommended):** allowed. The Fishball page, status and Retry work. Local marks and Hand
  over are absent, because the local DSH is not managed.
- B: embed-UI requires a local connector and stays inert without one.

**Q5. How does the user create a token without a custom UI?**
*Background:* tokens must be created in DSH's native plugin settings and stored in DSH's
credential store. Native forms cannot show a generated secret once, the way a custom page would.
- **A (recommended):** each token is a list entry in the connector's settings: a label, an
  `enabled` switch, and a credential reference (an environment-variable name). If that reference
  has no value yet, the connector generates a high-entropy token and stores it with
  `ctx.credentials.set`. The user copies it for an external agent from DSH's credential store
  (`$DSH_HOME/.credentials.yaml`), or sets their own value there or through the environment.
  Turning off or deleting the entry revokes it.
- B: the user always supplies the value through DSH's credential store or environment. The
  connector never generates one.
- C: add a "show once" custom view. Not recommended: it breaks "no custom UI".

**Q6. Do tokens have scopes?**
- **A (recommended):** no. Every token has full manager rights, delegation included. Decision
  1b (on by default, no off setting) stays literally true. The only per-token control is
  revocation.
- B: scopes such as `control` and `delegate`. This would add the delegation switch that 1b ruled
  out.

**Q7. With several principals connected, who gets what?**
*Background:* V2 had one attached instance. V3 allows Fishball and any number of external agents.
- **A (recommended):**
  - Each managed session has exactly one managing principal: the one that started it or received
    the Hand over.
  - Its permission requests and questions go only to that principal.
  - `message_fishball` / `ask_fishball` from unmanaged sessions, and Hand over, go to one
    **designated Fishball principal**. That is a setting; the default is the local instance's
    token.
- B: every connected principal gets every offer, and the first committed answer wins.
- C: only one principal may be connected at a time (the V2 owner slot).

**Q8. The local token on first V3 start.**
- **A (recommended):** when the connector and the instance share one DSH, the first V3 start
  creates a "Fishball (local)" token entry. Its value goes into the credential store under a
  reference the instance's target already names. The entry is visible and can be revoked like
  any other. V2 users keep working without a manual step.
- B: the user creates the token and enters its reference in the instance's settings by hand.
  Fishball stays `token-refused` until they do.

**Q9. Where does the MCP endpoint listen?**
- **A (recommended):** a route on DSH's own web listener (`/api/fishball/mcp`). Exposure, TLS and
  remote reach follow the user's existing DSH web configuration. There is no new port.
- B: a separate connector listener with its own host, port and TLS settings. It can be exposed
  separately from DSH's web, at the cost of a second port and a second TLS setup.

**Q10. Watchdog's MCP identity.**
- **A (recommended):** Watchdog opens its own subscription stream through the instance's in-child
  MCP link, under the instance's token (the same principal). It needs no second token, and
  revoking Fishball revokes Watchdog.
- B: each Watchdog gets its own token entry and principal, so it can be revoked separately. It
  needs one more token to create, and the connector must treat it as part of Fishball's principal
  for routing.

**Q11. Retire the custom first-party push (decision 1a = A)?**
- **A (recommended):** yes. Fishball, like every client, gets events through the MCP
  subscription plus the durable mailbox. The first-party extra is only in the child: durable
  acceptance and wake.
- B: keep a custom push alongside MCP as a faster wake path. That is a second channel to secure
  and test.

**Q12. Which MCP protocol revisions does the endpoint serve?**
*Background:* the current revision is 2026-07-28. It is stateless, uses `subscriptions/listen`
and has no `initialize`. Many existing agents still speak 2025-11-25, which has `initialize`,
sessions, `resources/subscribe` and a GET stream. Both DSH SDKs' MCP client (2.2.0) negotiates
either.
- **A (recommended):** serve both (a dual-era server), so current external agents can connect.
- B: serve 2026-07-28 only. It is simpler, but it refuses legacy clients.

**Q13. Where do "other high-risk items" go?**
*Background:* the earlier chain was Watchdog → Fishball → user. Your Watchdog rule says that
high-risk items Watchdog does not reject go to the user.
- **A (recommended):** straight to a user card in the session, with no Fishball turn. Fishball
  sees the settled outcome.
- B: to Fishball first, who may escalate to the user.
