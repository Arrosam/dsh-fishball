# Fishball V3: requirements (draft)

Status: **draft for alignment, 2026-11-11. Docs only.** Branch `design/v3`, cut from
`integrate/v2` at `505766e`. No product code or test cases exist for anything in this file yet.
The design that answers these requirements is [v3-design.md](<v3-design.md>). Section 7 holds the
questions that must be answered before the requirements freeze; Q1 is decided.

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

What it means (Fishball's reading):

1. **`fishball-connector`** does connect only and makes no UI changes. It exposes an MCP server.
   A client must present credentials (an access token) to get in. The user can create new tokens
   for external agents.
2. **`dsh-fishball-embed-UI`**, a new DSH plugin, takes over all of today's UI work, including the
   session page that reaches the child process.
   - Installed on its own, the UI plugin does nothing.
   - Installed on its own, the connector only lets agents connect. There is no UI path to
     Fishball in that DSH.
3. **`fishball-instance`** only provides the new child process. The child can reach the main DSH
   or a remote DSH over MCP.
4. MCP supports subscriptions, so DSH → Fishball requests (approvals, questions, session events)
   travel as MCP events.
5. **Watchdog** subscribes to DSH's events itself once it is installed. It lives inside the
   Fishball instance, so it makes its requests to Fishball through DSH's in-session communication
   there.

### 1.2 Added V3 requirement (2026-11-11, second message), verbatim

> V3新结构里，Connector所暴露的工具要可以被其他插件扩容，比如embed UI可以把通知类的工具交个connector来暴露给Fishball。DSH同样可以装额外的插件来暴露更多工具给connector来给Fishball用

What it means (Fishball's reading):

6. The connector's MCP tool set can be **extended by other plugins**.
   - `dsh-fishball-embed-UI` hands its notification-type tools (the attention latch behind the
     sidebar fish and dots, for example) to the connector. The connector exposes them to
     Fishball over MCP.
   - Any other plugin installed in the same DSH can contribute extra tools through the connector
     in the same way, for Fishball to use.

### 1.3 Q1 answered, reframing the architecture (2026-11-11), verbatim

> DSH主实例不是永远只运行一个connector，它是一个完整的DSH实例，可以装任何DSH可以装的插件，只是只要装一个connector就可以允许外部Agent使用这个DSH，通过暴露一个MCP的方式。instance安装后只会在当前DSH下启动一个寄宿DSH instance。instance启动后不能读写DSH的会话，embed UI也只是提供一个UI来访问instance，给Connector暴露一些额外的实用工具。instance内的Fishball功能则是做成一个插件。instance创建的子DSH本身只是一个普通的DSH instance，只是instance插件会给创造的这个子进程安装一系列instance的DSH插件，这些插件大幅度调整DSH的功能，让这个DSH instance成为Fishball。所以只要一个外部的DSH也装上这些插件，也可以变成一个Fishball instance，只是standalone了。

What it means (Fishball's reading):

7. **The old rule "the main DSH only ever runs one connector" is retired.** The main DSH is a full
   DSH and may install any plugin. Installing the connector is simply what lets external agents
   use that DSH, through MCP.
8. **`fishball-instance`** only launches a hosted child DSH under the current DSH. It cannot read
   or write that DSH's sessions; it reaches them only through the connector's MCP, like any
   client.
9. **Embed-UI** only provides a UI for reaching the instance, and contributes extra utility tools
   to the connector (6).
10. **Fishball's functionality is itself packaged as DSH plugins** (the **Fishball plugin set**).
    The child is an ordinary DSH. The instance installs the plugin set into it, and those plugins
    reshape DSH so that it becomes Fishball.
11. **Standalone Fishball:** any other DSH that installs the same plugin set becomes a standalone
    Fishball instance. It connects through MCP, with a token, to a connector on a main or remote
    DSH.

### 1.4 Earlier decisions carried into V3

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
- **Bundled placement.** The plugins ship inside the instance package and are copied into the
  child profile at boot. A plugin deleted while off stays off. An incompatible bundled plugin
  blocks the child's start. (V3: this now covers the whole Fishball plugin set, in hosted mode.)
- **MCP** becomes a standalone piece in V3:
  - MCP control is one-way (no reverse MCP).
  - External agents may handle approvals and questions. This is on by default, with no setting
    to turn it off (1b).
  - The first committed outcome wins (OQ-14).
  - The old custom control interface is removed in one coordinated change, with no legacy path
    (1c = B).

## 2. Terms

| Term | Meaning |
| --- | --- |
| **Main DSH** | A DSH whose sessions are managed through its connector. It is an ordinary, full DSH (1.3). It can be local or remote. |
| **Host DSH** | The DSH where `fishball-instance` (and usually embed-UI) is installed. Often the same as the main DSH. |
| **Fishball DSH** | A DSH running the Fishball plugin set: either a hosted child or a standalone DSH. |
| **Hosted mode** | The instance launches and owns a child Fishball DSH under the host DSH. |
| **Standalone mode** | A DSH the user runs themselves, with the Fishball plugin set installed by hand. There is no instance. |
| **Connector** (C) | `fishball-connector`, installed in a main DSH. |
| **Instance** (I) | `fishball-instance`, the launcher plugin for hosted mode. |
| **Embed-UI** (U) | `dsh-fishball-embed-UI`, installed in the host DSH. |
| **Fishball plugin set** (F) | The DSH plugins that make a DSH into Fishball (proposed packaging: Q2). |
| **Principal** | One access token's identity at a connector. Each Fishball DSH is one principal; each external agent is another. |
| **Contributor** | A plugin in a connector's DSH that contributes MCP tools through the connector (R-EXT). |
| **Event** | Something that happens at a main DSH and that a principal must learn about: an approval offer, a question, a settlement, a watch notice, a session state change or a `message_fishball` message. |

## 3. Requirements

Each requirement is written to be testable. **Bold** marks the observable. "Refused" means the
operation returns a machine-readable error code, changes nothing and leaks nothing.

### 3.1 Packages and boundaries (R-ARCH)

| ID | Requirement |
| --- | --- |
| R-ARCH-01 | V3 ships `fishball-connector`, `fishball-instance`, `dsh-fishball-embed-UI` and the **Fishball plugin set** (R-FB). Every one of them is an ordinary DSH plugin (bundle) that DSH's own plugin management can install, enable, disable and list. |
| R-ARCH-02 | A DSH with any of these packages installed stays a full DSH: **no** V3 package refuses to load, hides or disables another plugin because a Fishball package is present. The one exception is a Fishball DSH, where `fishball-lite` reshapes the DSH on purpose (R-FB-02, Q20). |
| R-ARCH-03 | `fishball-connector` registers **no browser client module**. Its package declares no `dsh.client` entry, and loading it adds no sidebar entry, slot contribution, CSS or route that serves HTML. |
| R-ARCH-04 | Every host-DSH UI change Fishball makes comes from `dsh-fishball-embed-UI`. With embed-UI uninstalled, **no** Fishball UI element appears in the host DSH. |
| R-ARCH-05 | `fishball-instance` provides only the hosted child and its lifecycle (R-HOST). It contributes no UI. Its host row's `inject` list holds **no service that reads or writes sessions, approvals, questions or prompts**; it cannot reach the host DSH's sessions except through a connector's MCP, from inside the child, like any client. |
| R-ARCH-06 | No V3 package patches DSH code, bundles or another plugin's files. It uses only public DSH services, slots and profile patch rows, on both supported SDKs (R-COMPAT). |
| R-ARCH-07 | Talk between a Fishball DSH and a main DSH goes **only** through the main DSH's connector MCP endpoint. No V3 code path reaches main-DSH sessions through `fishballConnector.attachInstance`, the envelope-v2 frames or any other private channel. |

### 3.2 Connector: an MCP server (R-CON)

| ID | Requirement |
| --- | --- |
| R-CON-01 | The connector exposes one MCP endpoint over Streamable HTTP. It conforms to MCP revision **2026-07-28** (the current revision) and also serves clients of revision **2025-11-25** (subject to Q12). A client of either revision can list and call the connector's tools. |
| R-CON-02 | The endpoint serves session control as MCP tools (the **core tools**): list, start, message, redirect, stop, read, watch / unwatch / watches, and release. It also serves approval, question and prompt answering; grant list and revoke; attachment put and read; and mailbox poll and ack. The attention signal is not a core tool; embed-UI contributes it (R-EXT-13). Core tools carry the domain semantics and limits of contract 1.2 §4 and §8. Each tool returns a structured domain result: refusals carry their contract code (for example `limit-exceeded`, `expired`, `queue-full`) and are never just prose. |
| R-CON-03 | Events reach a principal through a **durable mailbox**. Events stay pending until the principal acks them. A poll returns a bounded ordered page plus a cursor. A stale or foreign cursor gets an explicit resync answer, never a silent skip. |
| R-CON-04 | The mailbox is published as an MCP resource, and a subscription to it gets `notifications/resources/updated` whenever new events arrive. The notification is a **hint only**: a client that never subscribes gets the same events by polling, and losing a notification loses no event. |
| R-CON-05 | No approval, question or plan review is ever settled by a timer, by a client's silence or by a lost notification. A delegated item with no answer **waits**. |
| R-CON-06 | Settlement is atomic, and the first committed outcome wins (OQ-14). A second answer, by user or agent, gets `already-settled` or `expired` and changes nothing. |
| R-CON-07 | External principals receive and may answer delegated approvals and questions, including plan reviews. This is on by default, and **no setting turns it off** (1b). |
| R-CON-08 | The connector keeps today's main-session tools `message_fishball` and `ask_fishball` and the managed-session interception of permission requests. These are tools and approval hooks, not UI. They route to principals by the rule chosen in Q7. |
| R-CON-09 | With no principal connected, the connector behaves as contract 1.2 §9 does with no instance attached. Messages queue, up to the `maxQueuedInputs` bound. `ask_fishball` answers `unavailable` at once. A managed session's permission request goes to the user in that session. |
| R-CON-10 | The connector's settings (limits, tokens, contributors and endpoint options) live **only** in DSH's native Plugins settings form for `fishball-connector`, and the connector ships no custom settings UI. |

### 3.3 Tool contributions from other plugins (R-EXT)

| ID | Requirement |
| --- | --- |
| R-EXT-01 | The connector provides a public, versioned DSH service (proposed name `fishballConnectorTools`) through which a plugin in the same DSH process registers MCP tools. A contributor that injects it (optionally, so a missing connector never fails its own load) can register and unregister tools at runtime, with no connector restart. |
| R-EXT-02 | A registration names its tool's input schema, an optional output schema, a description and an execute function. A registration with an invalid name, a non-object or invalid input schema, an unsupported schema keyword set, or a missing execute function is **refused** with a code (`tool-invalid`). Nothing is registered and nothing appears in `tools/list`. |
| R-EXT-03 | Every contributed tool's public MCP name is `<namespace>.<name>`. The namespace is derived from the contributor's identity in DSH (its plugin name), never passed in by the contributor. The `fishball` namespace and the core tool names are reserved. A second registration of an existing public name is refused (`tool-exists`) and leaves the first in place. Public names satisfy MCP's tool-name rules (1–128 characters of `A–Z a–z 0–9 _ - .`). |
| R-EXT-04 | When a registration is disposed, or its contributor is disabled, unloaded, reloaded or uninstalled, its tools leave `tools/list` **before the next request is answered**. Later calls get "unknown tool". Every client whose listen stream opted into `toolsListChanged` gets `notifications/tools/list_changed`; a legacy-era client gets it on its session. Registering a tool sends the same notification. |
| R-EXT-05 | Contributed tools sit behind the same token handshake as core tools (R-TOK-01). An unauthenticated request cannot list or call them. Within a token, contributed tools follow the same visibility rule as core tools (Q6, Q15). |
| R-EXT-06 | A contributed tool's call passes through the connector's own checks **before** the contributor's code runs: authentication, request and body limits, in-flight and rate limits, input-schema validation against the registered schema, and the per-call byte limits the contributor declared within the connector's ceilings. A call that fails one of them is refused with the connector's code and never reaches the contributor. |
| R-EXT-07 | A contributed tool's result passes through the connector's checks **after** the contributor's code runs: the result-size ceiling, output-schema validation when one is declared, and the result envelope (`{ok, code?, …}` in a successful `CallToolResult`). A refusal code the contributor returns must come from its declared code list or the connector's shared vocabulary; anything else becomes `operation-failed`. |
| R-EXT-08 | A contributor's execute function that throws, rejects, returns an invalid result or exceeds the per-call time ceiling is **contained**. That call gets `{ok: false, code: 'contributor-failed'}`, with no stack, message text or internal path. The connector, every other tool and every other client are unaffected. The failure is logged once per contributor and failure kind, with no arguments or result content. |
| R-EXT-09 | A contributor that keeps failing is quarantined: its tools are withdrawn (R-EXT-04) until its plugin is reloaded or the user re-enables it (Q16). |
| R-EXT-10 | The per-call context handed to a contributor carries the calling **principal** (its stable id and label, never the token), a cancellation signal that fires when the client cancels or disconnects, and the protocol era. It carries no access to the connector's mailbox, other principals, the credential store, other tools or main-session authority beyond what the contributor's own DSH context already has. |
| R-EXT-11 | A contributed tool cannot answer approvals, questions or prompts, assign lanes, read or ack mailboxes, or settle offers **through the connector**. Those stay core tools. A contributor whose own code uses DSH services to act on sessions does so under its own DSH authority, outside the connector's guarantees (Q14). |
| R-EXT-12 | Contributed tools appear in `tools/list` sorted deterministically (core tools first, then by public name). Each carries `annotations` with the contributor's plugin name and package version. Annotations stay untrusted hints, as the MCP spec requires. |
| R-EXT-13 | Embed-UI's notification-type tools (the attention latch: set and read) are contributed through R-EXT-01, not built into the connector. With embed-UI absent, those tools are absent from `tools/list`. |
| R-EXT-14 | A Fishball DSH offers contributed tools to Fishball's model only when `fishball-core`'s allowlist of contributor namespaces admits them (Q17). An unadmitted contributed tool is never offered to Fishball's model. |
| R-EXT-15 | Registration, refusal, withdrawal and quarantine of a contributor's tools are visible to the user as a read-only list in the connector's native settings form: name, contributor, state. No custom UI. |

### 3.4 Tokens and authentication (R-TOK)

| ID | Requirement |
| --- | --- |
| R-TOK-01 | **Every** request to the MCP endpoint carries `Authorization: Bearer <token>`. That includes the first one (`server/discover` or `initialize`) and subscription and stream requests. A missing, unknown, revoked or malformed token gets **HTTP 401** with no MCP processing. An unauthenticated request never reaches tool, resource or subscription code. |
| R-TOK-02 | A token in a URL query string is refused, even when a valid header is also present. |
| R-TOK-03 | The user can create a new token for an external agent or a standalone Fishball from the connector's native settings form, with no custom UI (the mechanism is Q5). |
| R-TOK-04 | Token secret values live **only** in DSH's credential store (`ctx.credentials`) of the DSH that holds them. They are never in settings documents, logs, lifecycle files, temp files, launch overlays, process arguments, tool results, resource contents, error messages or browser responses. |
| R-TOK-05 | Revoking a token takes effect on the **next request**. Open subscription streams of that principal close, and its pending answers to delegated items are refused. Its queued mailbox events are dropped (an approval offer returns to its user) or kept, per the item kinds in [design §5.3](<v3-design.md#53-revocation>). |
| R-TOK-06 | Token comparison is constant-time. Repeated failed attempts do not reveal which tokens exist. |
| R-TOK-07 | Each principal is identified by its token entry, never by MCP `clientInfo`, a session id or a caller-supplied field. |

### 3.5 Events: DSH → Fishball (R-EVT)

| ID | Requirement |
| --- | --- |
| R-EVT-01 | Each of these produces one mailbox event for the principal it is routed to: an approval offer or a question for a session that principal manages; a settlement or retirement of an offer the principal saw; a watch notice; a `session.state` change; a `message_fishball` message; and a hand-over note. |
| R-EVT-02 | An event carries a stable `eventId`, its kind, its source session id, its correlation id (offer id for offers) and a bounded payload. A replayed event has **the same identity**. |
| R-EVT-03 | A Fishball DSH is woken by events: an event arriving while Fishball is idle starts **exactly one** Fishball turn for it after durable acceptance, also across a lost ack and a restart of the Fishball DSH. This is still an open engineering gate from MCP-S2 (design §11). |
| R-EVT-04 | An external principal that subscribes gets a notification within the same event dispatch as the commit to its mailbox. One that does not subscribe sees the event on its next poll. |

### 3.6 The Fishball plugin set (R-FB)

These hold in **both** hosted and standalone mode.

| ID | Requirement |
| --- | --- |
| R-FB-01 | The Fishball plugin set is a fixed list of DSH plugins (proposed in Q2: `fishball-core`, `fishball-lite`, `fishball-board`, `fishball-fold-notify`, `fishball-watchdog`). Each one is an ordinary bundle that DSH's native plugin management installs from its package. **The same package files** are used in hosted and standalone mode. |
| R-FB-02 | Installing the set into an ordinary DSH and restarting it makes that DSH a Fishball DSH: one Fishball manager session; the A-lite Fishball-only page (sidebar, navigation and new-session entries hidden and not focusable, shortcuts remapped or unbound); effective read-only with the private Skills exception; no new sessions; the child-only `fishball-recommended` tab; slim settings. How strictly these guards are enforced in each mode is Q20. |
| R-FB-03 | `fishball-core`'s native settings form names the **target**: the URL of a connector MCP endpoint and a credential reference for its token. In hosted mode the instance supplies both (R-HOST-05) and the fields are read-only notes. In standalone mode the user fills them in. A blank target reports `target-unset`. |
| R-FB-04 | `fishball-core` connects to the target over MCP with that token. When the target is unreachable or refuses the token, Fishball still runs, and its status shows `target-unreachable` or `token-refused`. It retries with bounded backoff and never sends the token to any origin other than the target's. A non-loopback target must be `https:`. |
| R-FB-05 | A remote target works with the same tool semantics as a local one: a Fishball DSH whose target is DSH B's connector manages **B's** sessions. |
| R-FB-06 | A feature plugin (board, fold-notify, Watchdog) installed without `fishball-core`, or `fishball-lite` without `fishball-core`, does nothing beyond logging one `fishball-core-missing` line. It never fails the DSH's boot. The combination of core without lite is Q2. |
| R-FB-07 | In standalone mode, when `fishball-watchdog` is enabled in the DSH's profile but has not registered with `fishball-core` by the time the app's ready signal fires (skipped as incompatible, or failed to load), Fishball is told **"watchdog is down"** once per DSH start. |
| R-FB-08 | The set's plugins never read, write or act on the sessions of a DSH other than their own Fishball DSH, except through the target connector's MCP. |

### 3.7 Hosted mode: what the instance adds (R-HOST)

| ID | Requirement |
| --- | --- |
| R-HOST-01 | **Launch.** The instance keeps one private child DSH under the host DSH (its own home and profile). At every child start it places the whole Fishball plugin set from its own package into the child profile, before the profile loads (R-BND). |
| R-HOST-02 | **Lifecycle.** The child starts after the host's app ready signal, and can be stopped, restarted and retried. Crashes and failed starts show a status code. When the host DSH exits, the child stops. Uninstall cleanup removes the child runtime after offering the board archive export (R-BRD-02). |
| R-HOST-03 | Starting, stopping and restarting the child never changes the host DSH's settings, sessions, credentials or shortcuts. |
| R-HOST-04 | **Enforcement.** The instance applies the Fishball guards to the child as launch overlays, which DSH applies after the child profile's own patches, so the child's own settings cannot undo them (Q20). `fishball-core` and `fishball-lite` are always on in the child. |
| R-HOST-05 | **Target and token.** The instance's native settings name the target (blank = a connector in the same host DSH) and a credential reference. In the same-DSH case the token is set up automatically (Q8). The instance hands the target and the token value to the child **in memory only**: never written to disk in the child or the host, never in a process argument or environment variable another process can read. |
| R-HOST-06 | **Child locator.** The instance publishes a host-only service for embed-UI: child state and status code, the child web's own origin, a single-use admission ticket, Retry and the target status. It publishes nothing to browsers itself. |
| R-HOST-07 | **Model sync.** The hosted-mode provider and model sync from the host DSH into the child stays, started only from embed-UI's Plugins card (the V2 decision of 2026-11-11). Standalone mode has none: a standalone DSH has its own native model settings. |
| R-HOST-08 | The "watchdog is down" notice of a child that cannot start is kept by the instance and delivered to Fishball once the child next starts. |

### 3.8 Embed-UI (R-UI)

| ID | Requirement |
| --- | --- |
| R-UI-01 | Embed-UI works only with a hosted instance in the same DSH. It finds the child **only** through the instance's child locator (R-HOST-06). Without it (instance absent, disabled or older), embed-UI registers no sidebar entry, no route, no frame and no contributed tool, and logs one `instance-missing` diagnostic (Q18). |
| R-UI-02 | With the instance present, embed-UI shows the Fishball sidebar entry. Opening it frames the child's native page at the child's own origin, through a single-use admission ticket. No credential is placed in the frame URL. |
| R-UI-03 | Embed-UI shows the child status and Retry outside the cross-origin frame. It never shows a token. |
| R-UI-04 | With a connector in the same DSH, embed-UI contributes its notification tools through the connector's contribution service (R-EXT-13) under its own namespace. It owns the attention latch (fish and dots). It registers no MCP server or HTTP endpoint of its own. |
| R-UI-05 | Managed-session marks and Hand over / Take back appear as chosen in Q3, and only with a connector in the same DSH (Q4). |
| R-UI-06 | Embed-UI stores no secret. Its settings, if any, use DSH's native form. |
| R-UI-07 | Embed-UI never frames a standalone Fishball. A standalone Fishball's own DSH web is its Fishball page. |

### 3.9 Remote DSH (R-REM)

| ID | Requirement |
| --- | --- |
| R-REM-01 | The connector's endpoint is reachable from another machine only when the user has configured that exposure. The default is loopback-only (Q9). |
| R-REM-02 | A non-loopback endpoint is served over TLS. Plain HTTP on a non-loopback address is refused at load, with a diagnostic. A user-run tunnel to a loopback endpoint is the supported alternative. |
| R-REM-03 | The endpoint validates `Origin` on every request. A present Origin outside the allowlist gets **HTTP 403** (MCP Streamable HTTP security requirement). |
| R-REM-04 | Losing the remote connection never stops managed sessions on the remote DSH. Delegated items for an unreachable principal wait, per R-CON-05. |

### 3.10 Watchdog (R-WD)

| ID | Requirement |
| --- | --- |
| R-WD-01 | Watchdog runs only in a Fishball DSH (hosted child or standalone), and only with `fishball-core` present. No Watchdog code, settings or UI runs in a host or main DSH. |
| R-WD-02 | When installed and enabled, Watchdog opens **its own** subscription to the target connector's events for the sessions it supervises (Q10). No Fishball turn relays those events. |
| R-WD-03 | Watchdog runs only (a) passively, on an event from a supervised session (a permission request, a finished turn), or (b) on patrol. Explicit `check_now` and active refine are manager operations. |
| R-WD-04 | Patrol checks of one session are at least `minCheckIntervalSeconds` apart: default **1740** (29 min), integer, inclusive range **60–86400**. At the bounds, 60 and 86400 are accepted and 59 and 86401 are refused. Passive triggers, `check_now` and active refine are not throttled. |
| R-WD-05 | There are no approval timers, no hourly or daily call caps, no stall, idle or paused-poll timers and no per-brief schedule overrides. The hung-check timeout and the bounded start attachment carried over from T0 are failure bounds, not pacing. |
| R-WD-06 | Watchdog's model follows DSH's native session behaviour: a model change applies at the next not-yet-prepared model step. Saving settings performs no model lookup. |
| R-WD-07 | Any Watchdog failure (load, readiness, subscription loss, model or provider error, budget, store, claim, attach, runtime) makes Watchdog **effective off** at once. Its claims are released, pending items go to Fishball, sends pass, and stale callbacks are fenced. Fishball is told **"watchdog is down"**: one notice each time Watchdog goes down, including with zero supervised sessions and when the Fishball DSH could not load it (R-FB-07, R-HOST-08). A failure never stops or restarts a watched session. |
| R-WD-08 | Watchdog sends its requests to Fishball (escalations, "watchdog is down", reports) **through DSH's in-session communication inside the Fishball DSH**, not through the connector or MCP. |
| R-WD-09 | Decision rules: Watchdog allows in-scope low-risk requests. It rejects **only** a request that is both beyond the task and dangerous, and gives a justification. It sends every other high-risk request to the user (Q13). It sends uncertain requests to Fishball. Questions and plan reviews always go to Fishball, never to Watchdog (U21). |
| R-WD-10 | Pausing supervision of a session stops that session first. A failed stop is reported and not recorded as paused. |
| R-WD-11 | One Watchdog side session supervises one session (U8). Permission requests of a claimed session go to Watchdog only while it is healthy. Without a claim, they go to Fishball. |

### 3.11 Placement, board and fold-notify (R-BND, R-BRD, R-FN)

| ID | Requirement |
| --- | --- |
| R-BND-01 | **Hosted mode:** the whole Fishball plugin set ships inside the `fishball-instance` package. On every child boot it is copied into the child profile before the profile loads. The host DSH never resolves, lists or loads these plugins. |
| R-BND-02 | **Hosted mode:** the first placement turns each feature plugin (board, fold-notify, Watchdog) on. A later disable survives restarts and instance upgrades. A feature plugin deleted while off is placed again **off**. `fishball-core` and `fishball-lite` are always on (R-HOST-04). |
| R-BND-03 | **Hosted mode:** an enabled set member that is incompatible with the running DSH (or fails to load) **blocks the child's start**. The status names the plugin and the reason. |
| R-BND-04 | **Hosted mode:** switching a feature plugin on or off takes effect at the next child restart. The UI says "restart required", never "live". |
| R-BND-05 | **Standalone mode:** the user installs, enables, disables and removes set members with DSH's native plugin management, and DSH's own rules apply (for example, DSH skips an incompatible bundle at boot rather than failing). `fishball-core` reports a missing or skipped member in its status. |
| R-BRD-01 | Board records are never deleted while installed. A done item stays visible for **30 days** unless cleared early, and stays archived after that. `board_search` finds archived items by keyword. |
| R-BRD-02 | Removal offers an archive export before deleting board data: the instance's uninstall in hosted mode (Q-S = A). In standalone mode DSH's native remove has no hook, so `board_export` is a manager tool and the README tells the user to run it before removing (design §8.3). |
| R-FN-01 | Fold-notify batches Fishball's inbox notices as designed. It sets the attention latch only through embed-UI's contributed attention tool, over MCP. With that tool absent (no embed-UI, no local connector, or standalone), its attention call is refused `unsupported-operation` and nothing else changes, as D3 already requires. |

### 3.12 Migration (R-MIG)

| ID | Requirement |
| --- | --- |
| R-MIG-01 | A V2 user who upgrades the connector and the instance and installs embed-UI ends up with a working Fishball page and session list. Fishball's child history, Skills and child settings are kept. |
| R-MIG-02 | The first V3 child start converts the V2 instance-owned rows into the plugin set: all set members are placed, core and lite on, the three feature plugins on at first placement. Nothing in the child's history is lost. |
| R-MIG-03 | A V3 Fishball DSH against a V2 connector, or a V2 instance against a V3 connector, fails visibly with `connector-upgrade-required` or `instance-upgrade-required` before any delegation. There is no compatibility shim. |
| R-MIG-04 | V2 connector settings that V3 still uses keep their values. Settings V3 dropped are ignored, never re-rendered (D2 rule). |
| R-MIG-05 | A V2 user's first V3 start, with the connector and the instance in one DSH, leaves them a usable token without a manual step (Q8). |

### 3.13 Compatibility and security (R-COMPAT, R-SEC)

| ID | Requirement |
| --- | --- |
| R-COMPAT-01 | All V3 packages, including every member of the Fishball plugin set, work on DSH **0.2.1-rc.5** and **0.2.2-rc.1**, verified separately on each and in both modes, with no version-specific behaviour visible to the user. |
| R-SEC-01 | In a main DSH, the connector is the only Fishball component with **Fishball authority** over its sessions. The instance and embed-UI hold none (R-ARCH-05). Other plugins keep their own ordinary DSH authority and gain none from Fishball (Q1, Q14). |
| R-SEC-02 | No component logs a token, a credential value, an admission ticket or the `Authorization` header. A test that greps every log, lifecycle file, child home and temp directory after a full run finds none. |
| R-SEC-03 | The MCP endpoint applies body, frame, backlog and in-flight limits below the transport codec. Limit refusals are structured. |
| R-SEC-04 | A contributed tool runs in the connector's DSH process with its contributor's own DSH authority. Installing a contributor is the user's decision, the same as installing any DSH plugin. The connector never widens a contributor's authority, and contributed tools never receive a token, credential or another principal's data (R-EXT-10, Q14). |

## 4. Install matrix

C = connector, I = instance, U = embed-UI, F = the Fishball plugin set (installed by hand, that is
standalone). The default instance target is a connector in the same DSH (R-HOST-05).

| # | Installed in one DSH | What works | What does not |
| --- | --- | --- | --- |
| 1 | none | An ordinary DSH. | — |
| 2 | **C** | The MCP endpoint. External agents with a token control sessions and handle delegated approvals and questions. `message_fishball` / `ask_fishball` route to a connected principal, or answer `unavailable`. | No Fishball, no UI. |
| 3 | **U** | Nothing. Embed-UI is inert and logs `instance-missing`. | Everything. |
| 4 | **I**, target blank | The hosted child starts and Fishball runs in it. | No connector to reach: `target-unreachable`. No UI path to Fishball. |
| 4r | **I**, remote target | Hosted Fishball manages the remote DSH's sessions over MCP (manual token, Q8). | No UI path to Fishball. |
| 5 | **C + I** | Hosted Fishball manages this DSH's sessions over MCP, with the token set up automatically (Q8). External agents work too. | No UI path to Fishball (headless). |
| 6 | **C + U** | Row 2. Embed-UI is inert without the instance and contributes nothing (Q18). | No Fishball page. |
| 7 | **I + U**, remote target | The Fishball page here (frame, status, Retry). Fishball manages the remote DSH. | No local dots, marks or Hand over (no local connector); Q4. |
| 7b | **I + U**, target blank | The Fishball page works. Fishball reports `target-unreachable`. | No sessions to manage. |
| 8 | **C + I + U** | Everything: page, dots, marks and Hand over (Q3), approvals, Watchdog, board, fold-notify, embed-UI's contributed tools. | — |
| 8r | row 8 plus external agents with their own tokens | The same, with several principals (Q7). | — |
| 9 | **F** (standalone), target = a connector elsewhere | This DSH **is** Fishball: its own web UI is the Fishball page, guarded per Q20. Fishball manages the target DSH's sessions over MCP (manual token, Q8). Watchdog, board and fold-notify work if installed. | No dots (no embed-UI there to own a latch), no Hand over UI in the target DSH unless that DSH has U with a hosted I (row 8). |
| 9b | **F**, target blank | Fishball runs, `target-unset`. | No sessions to manage. |
| 10 | **F + U** or **F + I** | The standalone Fishball as in row 9. U without I is inert; I inside a Fishball DSH would try to launch a nested child, which the guards forbid (lite disables the instance row). | No nested Fishball. |
| 11 | **F + C** in one DSH | Not a supported combination: the Fishball guards forbid new sessions, so the connector has nothing useful to expose. No checks are promised. | — |
| 12 | a main DSH with C, used by a hosted Fishball (row 5/8) **and** a standalone Fishball (row 9) | Two Fishball principals. Routing follows Q7 (one designated Fishball). | — |
| 13 | **F** installed partly (feature plugins without core) | Nothing; each logs `fishball-core-missing` (R-FB-06). | — |

Watchdog, the board and fold-notify exist only in a Fishball DSH.

### 4.1 Tool contributions in the matrix

X = any other DSH plugin that contributes tools through the connector (R-EXT). Contributions are
registered in **the connector's DSH**.

| # | Installed in the connector's DSH | Contributed tools in `tools/list` | Who can use them |
| --- | --- | --- | --- |
| E1 | C only | none | — |
| E2 | C + X | X's tools | every token holder; a Fishball DSH offers them to its model only if `fishball-core`'s allowlist admits X (Q17) |
| E3 | C + I + U | embed-UI's notification tools (`attention`) | Fishball's fold-notify and any admitted principal; the latch drives embed-UI's fish and dots |
| E4 | C + U, no I | none from embed-UI: it stays inert (Q18) | — |
| E5 | C + I + U + X | embed-UI's and X's tools | as E2 and E3 |
| E6 | I + U here, remote connector (row 7) | the **remote** connector's contributions only. The local embed-UI has no local connector to contribute to | the hosted Fishball, against the remote connector |
| E7 | X only, no C | none; X's optional inject never activates | — |
| E8 | a standalone Fishball DSH (row 9) | none from that DSH: it has no connector. Its Fishball sees the **target** connector's contributions | Fishball, per its allowlist |

Contributed tools disappear when their contributor goes (R-EXT-04). They never outlive it.

## 5. Out of scope for V3

- Reverse MCP (the connector calling an agent's MCP server), callback URLs, agent-hosted servers.
- OAuth 2.1 authorization-server flows, dynamic client registration and client ID metadata
  documents. V3 uses connector-issued static bearer tokens (design §5).
- MCP sampling, elicitation, roots, logging, and the Tasks and Apps extensions as control or
  answer paths.
- A custom settings UI for tokens or the connector; a UI that reveals a token value; a pairing UI.
- Per-token permission scopes, unless Q6 adds them.
- Contributed MCP **resources**, prompts or subscriptions from other plugins. V3 contributions
  are tools only (Q19).
- Contributions from outside the connector's own DSH process (a remote plugin, a proxied external
  MCP server, a plugin inside a Fishball DSH).
- Sandboxing a contributor's code beyond DSH's own plugin model. Containment is per call
  (R-EXT-08), not process isolation.
- Embed-UI framing a standalone Fishball, or any Fishball DSH it did not launch.
- A Fishball DSH that also runs a connector (matrix row 11), and nested hosted Fishballs.
- Hosted-mode model sync for standalone Fishball.
- Desktop (Electron) shell support beyond what DSH's own web shell provides.
- Publishing any package to a registry. Standalone installation uses the release tarballs with
  DSH's native "add plugin" path.
- Migrating pre-V2 (alpha or legacy custom-page) child profiles.

## 6. What V3 replaces or retires from V2

| V2 element | V3 fate |
| --- | --- |
| The rule "DSH主实例永远只运行一个connector" | **Retired** by the Q1 answer (1.3). |
| Connector contract 1.2: the `fishballConnector.attachInstance` / `current()` service, envelope-v2 frames, handshake, `ui` paths, `status`/`retry` descriptor fields, `UI_LANG`, `BROWSER_MESSAGE`, `ContractError` attach codes | **Retired.** The domain semantics (operations, vocabularies, limits, refusal codes, timer-free D1) move into the MCP tool and event schemas. The `./contract` export is replaced by an MCP schema/profile module. |
| D1 timer-free negotiation (`interaction.timerfree`) | Becomes mandatory and implicit. Nothing is negotiated. |
| D2 inert legacy settings | Kept (R-MIG-04). |
| D3 `attention.signal` + connector latch | The **behaviour** is kept: a stateless signal, a 0/1 latch with importance, cleared once on page open, no timer. The **owner** moves: the latch and its tools belong to embed-UI and are contributed to the connector (R-EXT-13). |
| Connector `client.js` (sidebar fish, dots, managed marks, embed frame, Plugins card, connector locale for UI) | **Moved** to embed-UI (marks and Hand over per Q3). |
| Instance `client.js` main Plugins card (status, Retry, `enabled`, provider-sync trigger) | **Moved** to embed-UI. The provider-sync engine stays in the instance (hosted-only). |
| Instance embed broker (`src/slim/host/embed.js`), private admission (`native-web-access.js`), status/Retry routes (`src/native-web.js`) | **Moved** behind the child locator: the instance mints the ticket and embed-UI serves the frame. |
| Instance connector binding (`src/host/binding.js`, `followConnector`, `connector-missing`) | **Replaced** by `fishball-core`'s MCP link and its target status. |
| Instance-owned child overlay rows (app, session tools, approvals, inbox, admin, provider-sync target, native web, `fishball-page`) and the child web modules (`child-web/`: page, recommended tab, settings) | **Repackaged** as the Fishball plugin set (R-FB): ordinary bundles, also installable standalone. The instance keeps only launch, lifecycle, enforcement overlays, token hand-off and the locator. |
| Child snapshot copy of `node_modules/fishball-connector/contract` | **Retired.** `fishball-core` carries the MCP schema module. |
| Decision 1a = A: custom authenticated first-party push / wake channel | **Superseded** by MCP subscriptions plus the mailbox (confirm in Q11). |
| Custom 2.0 contract draft | Stays parked as history. |
| X12 `bridge(pluginId, ops)` scoped connector client | Kept inside `fishball-core`, now over the MCP link. |
| X15 claims and X19 send gate | Kept inside `fishball-core`. Watchdog feeds them, and Fishball's event handler consults them. |
| V2 "ships no bundled plugins" rule; the removal of the Remove-hiding list | Reversed for the child: the whole set ships bundled in hosted mode (R-BND). |

## 7. Open questions for the user

Fishball asks these one at a time. Each gives the background, the options, the recommendation
and its reason. Numbers are stable across revisions; Q1 is decided and stays here as a record.

**Suggested asking order:** Q2 → Q20 → Q7 → Q5 → Q8 → Q10 → Q3 → Q4 → Q18 → Q14 → Q16 → Q6 →
Q15 → Q17 → Q19 → Q11 → Q9 → Q12 → Q13.

**Q1. What may run in the main DSH? — DECIDED 2026-11-11.**
The user's answer is quoted in 1.3. The main DSH is a full DSH and may install any plugin; the
connector is what exposes it to agents. The instance only launches a hosted child and cannot read
or write the host's sessions. Embed-UI is a UI to reach the instance plus utility tools for the
connector. Fishball itself is a set of DSH plugins, which also makes standalone Fishball possible.
The former options (A: only the connector holds session authority; B: main DSH runs only the
connector; C: standalone launcher) are closed; the answer goes beyond A.

**Q2. How is the Fishball plugin set packaged? (revised for Q1)**
*Background:* Q1 makes Fishball itself a set of ordinary DSH plugins that the instance installs
into its hosted child, and that any other DSH can install to become a standalone Fishball. V2
delivered the child-side pieces as instance-owned launch-overlay rows, which the child's Plugins
page does not show and cannot switch. Those pieces are the manager session and its session tools,
approvals, inbox, admin, the private Skills tool, the A-lite `fishball-page` (Fishball-only page,
hidden navigation, shortcut remapping), the read-only preset and the disabled session-creating
rows, the `fishball-recommended` tab and the slim settings panel. Board, fold-notify and Watchdog
were already planned as separate plugins. (The former Q2, "who ships the child-side web modules",
is answered by Q1: they belong to the plugin set.)
- **A (recommended):** five plugins.
  - `fishball-core`: Fishball itself (manager session, persona, MCP link, event router, the
    extension service for features, the private Skills tool).
  - `fishball-lite`: turns the DSH into a Fishball-only DSH (A-lite page, guards, recommended
    tab, slim settings).
  - `fishball-board`, `fishball-fold-notify`, `fishball-watchdog`: the features.
  - Core requires lite: a DSH with core but not lite shows status `lite-missing` and starts no
    Fishball session. Features require core.
- B: one plugin, `fishball-all`, holding everything, with the features as settings switches.
  There is one tarball to install, but features lose DSH's native on/off, and the placement
  rules (a disable survives; a feature deleted while off stays off) no longer apply.
- C: as A, but core also works without lite. A DSH with only core is an ordinary DSH with a
  Fishball session added: no Fishball-only page and no read-only guard, so Fishball runs with
  whatever permissions that DSH grants.

*Reason for A:* the agent (core) and the DSH reshaping (lite) are different concerns, so each can
be tested alone. Feature plugins keep DSH's native switch and the agreed placement rules.
Requiring lite keeps the earlier decision that Fishball runs read-only, in both modes.

**Q20. How strictly are Fishball's guards enforced in each mode? (new, for Q1)**
*Background:* the guards are the read-only preset with the Skills exception, the disabled
session-creating rows (subagents, schedules, terminal, open-in-app, presets), the Fishball-only
page and "core and lite always on". In hosted mode the instance controls how the child boots.
DSH applies launch overlays last, after the profile's own patch file, so the child cannot undo
them. In standalone mode there is no instance. The guards can come only from `fishball-lite`'s
own bundle patch, which DSH applies **before** the profile's own patch file, so the owner of
that DSH can override them (DSH's composition order, both SDKs; design §5a.2).
- **A (recommended):**
  - Hosted: enforced. The instance applies the guards as launch overlays, keeps core and lite
    on, and the child's Plugins page hides their switch and Remove.
  - Standalone: the same guards come from `fishball-lite`'s bundle patch. The owner of that DSH
    may override them in their own profile patch; the README says so. `fishball-core` reports
    `guards-overridden` in its status wherever it can read the effective policy (spike V3-S6),
    and keeps running.
- B: standalone also refuses. `fishball-core` starts no Fishball session while any guard is
  overridden (status `guards-overridden`).
- C: no guards in standalone. A standalone Fishball is an ordinary DSH plus Fishball, and lite
  only adds the page.

*Reason for A:* the user keeps full control of a DSH they run themselves, as Q1 describes ("an
ordinary DSH instance"). Hosted mode keeps V2's guarantees, which the user never changed.
B could lock a user out of their own DSH over a setting they changed deliberately.

**Q7. With several principals connected, who gets what?**
*Background:* V2 had one attached instance. V3 allows any number of principals per connector:
external agents, a hosted Fishball and, after Q1, standalone Fishballs too (matrix row 12).
- **A (recommended):**
  - Each managed session has exactly one managing principal: the one that started it or
    received the Hand over.
  - Its permission requests and questions go only to that principal.
  - `message_fishball` / `ask_fishball` from unmanaged sessions, and Hand over, go to one
    **designated Fishball principal**. That is a connector setting; the default is the hosted
    Fishball's token, if there is one.
- B: every connected principal gets every offer, and the first committed answer wins.
- C: only one principal may be connected at a time (the V2 owner slot).

*Reason for A:* every request gets exactly one owner, with no broadcast races. B lets agents
answer for sessions they don't manage. C makes "create new tokens for external agents"
unusable while Fishball is connected.

**Q5. How does the user create a token without a custom UI?**
*Background:* tokens are created in DSH's native plugin settings and stored in DSH's credential
store. In both SDKs, DSH's generic plugin form has no secret-entry field, and a native form
cannot show a generated secret once, the way a custom page would.
- **A (recommended):**
  - Each token is a list entry in the connector's settings: a label, an `enabled` switch, and a
    credential reference (an environment-variable name).
  - If that reference has no value yet, the connector generates a high-entropy token and stores
    it with `ctx.credentials.set`.
  - The user copies it for an external agent or a standalone Fishball from DSH's credential
    store (`$DSH_HOME/.credentials.yaml`), or sets their own value there or through the
    environment.
  - Turning off or deleting the entry revokes it.
- B: the user always supplies the value through DSH's credential store or environment. The
  connector never generates one.
- C: add a "show once" custom view. Not recommended: it breaks "no custom UI".

*Reason for A:* strong tokens with no user effort; the value never sits in a settings file; the
user can still choose their own value.

**Q8. Tokens in hosted and standalone mode. (revised for Q1)**
*Background:* in hosted mode with a connector in the same DSH, the instance can set the token up
automatically, because both share one credential store. A hosted instance with a remote target,
and every standalone Fishball, talk to a connector the instance does not share a DSH with.
- **A (recommended):**
  - Hosted, same-DSH connector: automatic.
    - The instance asks a host-only connector service to create a "Fishball (hosted)" token
      entry.
    - The connector stores the value in the shared credential store and returns only the
      reference name, never the value.
    - The instance resolves the value and hands it to the child in memory.
    - The entry is visible and can be revoked in the connector's settings.
  - Hosted with a remote target, and standalone: manual. The user creates a token in the target
    connector's settings (Q5) and stores the value in the Fishball side's credential store, under
    the reference named in the instance's or `fishball-core`'s settings.
- B: manual in every mode.
- C: as A, plus a pairing flow for remote and standalone (a one-time code shown by the
  connector). Not recommended: showing the code needs a custom UI.

*Reason for A:* V2 users and the common single-machine setup need no manual step (R-MIG-05).
Nothing secret moves between machines without the user doing it.

**Q10. Watchdog's MCP identity. (revised for standalone mode)**
*Background:* Watchdog runs inside a Fishball DSH (hosted child or standalone) and opens its own
event subscription. In standalone mode every token is created and copied by hand (Q8).
- **A (recommended):** Watchdog subscribes through `fishball-core`'s MCP link, under the Fishball
  DSH's token (the same principal), with its own lane. That is one token per Fishball DSH in both
  modes, and revoking Fishball revokes its Watchdog.
- B: Watchdog gets its own token entry and principal, so it can be revoked separately. A
  standalone user must then create and copy two tokens, and the connector must link the two
  principals for routing.

*Reason for A:* there is no second token to copy by hand in standalone mode. Watchdog only acts
on its Fishball's sessions, so a separate principal adds routing work with no safety gain. It
still gets its own subscription, as the user asked.

**Q3. Do main-session marks and Hand over / Take back stay, and how does embed-UI get them?
(revised for the tool-contribution requirement and Q1)**
*Background:* Q1 describes embed-UI as "only a UI to reach the instance, plus extra utility tools
for the connector". The attention latch (green dot) is settled: embed-UI owns it and contributes
its tools. V2 also drew two things inside the main DSH's own session list and session pages:
managed-session marks (the fish on sessions Fishball manages), and Hand over / Take back buttons
(the user gives a session to Fishball, or takes it back). Both are connector state and actions,
and the connector itself may draw no UI.
- **A (recommended):** keep them, drawn by embed-UI. The connector publishes a host-only state
  service with no UI (marks, Hand over, Take back). Embed-UI consumes it in-process, with no
  token.
- B: keep them, but embed-UI reads marks and performs Hand over through core MCP tools with its
  own token. That needs a token for the UI, and sends a user action through the agent endpoint.
- C: drop them. Sessions reach Fishball only when Fishball starts them, or through
  `message_fishball` / `ask_fishball` from the session. Embed-UI is smaller, but users lose the
  one-click hand-over.

*Reason for A:* it keeps V2's way of giving a session to Fishball. Handing a session over is a
way of reaching Fishball, so it fits embed-UI's role. The connector stays UI-free.

**Q4. Embed-UI when the instance targets a remote connector. (revised)**
*Background:* embed-UI needs a hosted instance in the same DSH. If that instance's target is a
remote DSH's connector and the local DSH has no connector, embed-UI has no connector to contribute
its attention tool to, so Fishball cannot light the local fish. (A standalone Fishball needs no
embed-UI: its own web UI is the Fishball page.)
- **A (recommended):** allowed, with reduced function. Page, status and Retry work. There are no
  dots (the attention tool is absent, and fold-notify gets `unsupported-operation`), and no
  marks or Hand over, because nothing local is managed.
- B: embed-UI stays inert without a local connector.
- C: as A, plus the instance relays Fishball's attention signal to embed-UI over its private
  lifecycle wire when there is no local connector. The dots work, at the cost of a second,
  non-MCP path.

*Reason for A:* every Fishball ↔ DSH path stays MCP, and the user can still open Fishball.

**Q18. Does embed-UI contribute its tools when the instance is absent?**
*Background:* the user's requirement says embed-UI alone does nothing. With a connector but no
instance (matrix row 6), embed-UI could still contribute its attention tools for external agents,
but no Fishball page exists to put the fish and dots on.
- **A (recommended):** no. Without the instance, embed-UI is fully inert, contributions included.
- B: yes. Embed-UI contributes its tools whenever a connector is present, and shows the sidebar
  fish and dots for external agents' attention even without Fishball.

*Reason for A:* it keeps "UI alone does nothing" literally true, and matches Q1's "a UI to reach
the instance".

**Q14. What may a contributed tool do?**
*Background:* Q1 confirmed that a main DSH may install any plugin. A contributor is an ordinary
plugin there. Its code already has whatever DSH authority its own plugin context gives it, for
example reading or messaging sessions through DSH services. When Fishball calls its tool over
MCP, that code runs. The connector can check the call's shape and limits, but cannot see what
the code does inside.
- **A (recommended):** a contributed tool runs with **its contributor's own DSH authority, and
  nothing more**.
  - The connector gives it no Fishball authority: no mailbox, lanes, offers, answers, approvals
    or tokens (R-EXT-11).
  - Installing a contributor is the user's trust decision, the same as installing any DSH
    plugin.
  - The docs and the read-only list (R-EXT-15) say so.
- B: contributed tools may only be "notification-type", with no side effects on sessions. The
  connector cannot enforce this, so it would be a documented convention only.
- C: contributors declare a capability list (for example `notify`, `read-sessions`,
  `act-on-sessions`), shown to the user. The user approves each contributor in the connector's
  settings before its tools appear.

*Reason for A:* it matches DSH's existing trust model, which Q1 reaffirmed. B can't be enforced.
C adds an approval step that the user's requirement ("can install extra plugins to expose more
tools") did not ask for.

**Q16. Can the user switch off one contributor's tools without disabling its plugin?**
*Background:* a plugin can be useful in the main DSH for its own sake, while the user doesn't
want its tools exposed over MCP.
- **A (recommended):** yes. The connector's native settings list contributor namespaces, each
  with an `exposed` switch that defaults to **on**. A quarantined contributor (R-EXT-09) is shown
  there too, and switching it off and on again lifts the quarantine. No custom UI.
- B: no switch. To hide a contributor's tools, disable the contributor plugin. Quarantine lifts
  only when that plugin reloads.
- C: as A, but the default is **off**: a new contributor's tools appear only after the user turns
  them on.

*Reason for A:* "install a plugin to expose more tools" works with no extra step, as the user
described. The switch still gives control without uninstalling anything.

**Q6. Do tokens have scopes?**
- **A (recommended):** no. Every token has full manager rights, delegation included. The only
  per-token control is revocation.
- B: scopes such as `control` and `delegate`. That would add the delegation switch that decision
  1b ruled out.

*Reason for A:* decision 1b (delegation on by default, no off setting) stays literally true, and
the native settings stay simple.

**Q15. Can the user hide a contributor's tools from some tokens?**
*Background:* under Q6 = A, every token sees every core tool. Contributed tools add a new kind of
reach: for example, a third-party plugin's tools that the user wants only Fishball to use, not
an external agent.
- **A (recommended):** no per-token filtering. Every token sees every contributed tool, as with
  core tools. The user controls exposure by installing or disabling the contributor, through the
  Q16 switch, and (for Fishball's own model) through Q17's allowlist.
- B: each token entry gets an optional list of allowed contributor namespaces (empty means all).
  That is a scope in all but name, so it reopens Q6 for contributions only.

*Reason for A:* it follows from Q6 without adding a second permission system.

**Q17. Does Fishball offer every contributed tool to its model?**
*Background:* Fishball's model sees connector tools through `fishball-core`'s façade, not as raw
MCP tools. Contributed tools come from a growing, unknown set of plugins in the target DSH.
Every offered tool costs prompt tokens on every turn, and an unknown tool may invite actions the
user never meant Fishball to take.
- **A (recommended):** `fishball-core`'s native settings hold an **allowlist of contributor
  namespaces**. Embed-UI's namespace is on by default, because it is first party. Other
  namespaces are listed (from `tools/list` annotations) but default **off** until the user turns
  them on.
- B: Fishball's model sees every contributed tool automatically.
- C: Fishball sees none. Contributions are for external agents only, and Fishball's own
  notification path stays a built-in tool.

*Reason for A:* the user's example (embed-UI's notification tools for Fishball) works with no
setup. Third-party tools reach Fishball only once the user chooses them, which protects prompt
size and behaviour.

**Q19. Contributions: tools only, or resources and events too?**
*Background:* the user's words say tools ("工具"). Some plugins might also want to publish data
(MCP resources) or push events into a principal's mailbox; for example, a CI plugin telling
Fishball that a build failed.
- **A (recommended):** tools only in V3. A plugin that wants to tell Fishball something uses the
  existing main-session path (`message_fishball`) or offers a tool that Fishball calls.
  Contributed resources and events can be added later behind the same service's `apiVersion`.
- B: also contributed resources (read-only, namespaced URIs, with subscription hints) in V3.
- C: also contributed mailbox events in V3. A plugin could then wake Fishball directly. That needs
  routing rules (Q7) and rate bounds, because a plugin could flood the mailbox.

*Reason for A:* it is exactly what the user asked for, and the service can grow later without a
break.

**Q11. Retire the custom first-party push (decision 1a = A)?**
- **A (recommended):** yes. Every Fishball DSH, like every client, gets events through the MCP
  subscription plus the durable mailbox. The first-party extra lives only inside `fishball-core`:
  durable acceptance and wake.
- B: keep a custom push alongside MCP as a faster wake path. That is a second channel to secure
  and test.

*Reason for A:* the user asked for DSH to reach Fishball through MCP events. A standalone
Fishball on another machine could not use a private push channel anyway.

**Q9. Where does the MCP endpoint listen?**
- **A (recommended):** a route on DSH's own web listener (`/api/fishball/mcp`). Exposure, TLS and
  remote reach follow the user's existing DSH web configuration. There is no new port.
- B: a separate connector listener with its own host, port and TLS settings. It can be exposed
  separately from DSH's web, at the cost of a second port and a second TLS setup.

*Reason for A:* it reuses DSH's own loopback and TLS handling on both SDKs and opens no new port.
Plain HTTP on a non-loopback listener is refused in either case.

**Q12. Which MCP protocol revisions does the endpoint serve?**
*Background:* the current revision is 2026-07-28. It is stateless, uses `subscriptions/listen`
and has no `initialize`. Many existing agents still speak 2025-11-25, which has `initialize`,
sessions, `resources/subscribe` and a GET stream. Both DSH SDKs' MCP client (2.2.0) negotiates
either.
- **A (recommended):** serve both (a dual-era server), so current external agents can connect.
- B: serve 2026-07-28 only. It is simpler, but it refuses legacy clients.

*Reason for A:* the external agents in view are unverified and likely still on 2025-era clients.
Dual-era serving is spec-defined. If spike V3-S1 shows it can't be done cleanly, the fallback is
B.

**Q13. Where do "other high-risk items" go?**
*Background:* the earlier chain was Watchdog → Fishball → user. The user's Watchdog rule says
that high-risk items Watchdog does not reject go to the user.
- **A (recommended):** straight to a user card in the session, with no Fishball turn. Fishball
  sees the settled outcome.
- B: to Fishball first, who may escalate to the user.

*Reason for A:* it follows the user's words literally, and spends no Fishball tokens on items that
end with the user anyway.
