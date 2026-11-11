# Fishball V3: requirements (draft)

Status: **draft for alignment, 2026-11-11. Docs only.** Branch `design/v3`, cut from
`integrate/v2` at `505766e`. No product code or test cases exist for anything in this file yet.
The design that answers these requirements is [v3-design.md](<v3-design.md>). Section 7 records
every question and its answer. **All are decided**; the last, Q30, was answered with the
user's own design of one typed event stream and an interception registry (1.11).

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
   there. *(The subscription part is superseded by 1.8 item 4: fishball-core subscribes and its
   interception service feeds Watchdog, R-INT.)*

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

### 1.4 Q2 answered (2026-11-11), verbatim

> A，lite改名fishball-ui，变成core的一个组件，既然必须一起装，那就没有分开的必要，也就是4个插件

What it means: option A, with **four** plugins. The former `fishball-lite` is renamed
**`fishball-ui`** and becomes a component **inside `fishball-core`**, because the two must always
be installed together. The Fishball plugin set is `fishball-core` (including its `fishball-ui`
component), `fishball-board`, `fishball-fold-notify` and `fishball-watchdog`. The features
require core.

### 1.5 Q20 answered (2026-11-11), verbatim

> 寄宿版不能和独立版实际上是一样的插件吗？可以接受独立版上出现的这些可以被改动的状况。

On whether to report overrides, the user chose **A**.

What it means:
- **One plugin set, one guard mechanism, in both modes.** The hosted child and a standalone DSH run
  exactly the same four plugins, and the guards come from `fishball-core`'s `fishball-ui`
  component through its plugin patch in both. Hosted mode adds **no** enforcement overlays. The
  owner of a Fishball DSH may override the guards in either mode; this is accepted.
- **Overrides are reported, not blocked.** `fishball-core` detects an overridden guard and reports
  `guards-overridden`, the same in both modes, and keeps running.
- **The instance** only launches the child, places the four plugins, handles the lifecycle
  (start, stop, Retry), sets up the token automatically, provides the child locator and runs
  model sync. *(Later decisions add one hosted-only bundle, `fishball-hosted-settings`, that the
  instance places beside the four plugins: TQ-R2, TQ-R4, R-HOST-11. It carries settings sections,
  not guards.)*

### 1.6 Q7, Q5 and Q8 answered (2026-11-11)

The user chose **"A"** for all three:
- **Q7 (routing).** Each managed session has exactly one managing principal, the one that
  started it or received the Hand over. Its permission requests and questions go only to that
  principal. `message_fishball` / `ask_fishball` from unmanaged sessions, and Hand over, go to
  one **designated Fishball principal**. That is a connector setting, whose default is the hosted
  Fishball.
- **Q5 (token creation).** A token is a connector settings entry with a label, an `enabled`
  switch and a credential reference. When the reference has no value, the connector generates a
  high-entropy value into DSH's credential store. The user copies it from there, or sets their
  own value. Disabling or deleting the entry revokes it.
- **Q8 (tokens per mode).** When the instance and the connector share a DSH, set-up is
  automatic: the connector creates a "Fishball (hosted)" entry and returns only its reference,
  and the instance hands the value to the child in memory. The entry is visible and revocable
  like any other. For a remote target and for standalone, set-up is manual. *(Revised by 1.9: a
  new hosted entry per pairing, not one entry for good.)*

### 1.7 Q10 answered (2026-11-11), verbatim

The user chose **"A"**, and framed Watchdog this way:

> watchdog只是fishball的“小帮手”，类似于fishball的子代理的存在

What it means: **Watchdog is Fishball's little helper, something like Fishball's subagent.** It
is not a separate party at the connector. It uses its Fishball DSH's token and is part of
Fishball's principal. Revoking Fishball's token revokes its Watchdog. *(Superseded in part by
1.8 item 4: Watchdog no longer has its own subscription or lane; it intercepts in core, R-INT.)*

### 1.8 Q3 answered, with naming, one token per agent and Watchdog routing (2026-11-11), verbatim

> Connector只保留交接的事件和工具，用于联系Fishball。而embed-UI提供这些按钮，点击按钮，embed-UI控制Connector来发出事件给fishball来实现这些功能。同时还要考虑因为fishball不止一个了，还要允许用户给不同的外部agent命名（在fishball instance内命名，连接后回传给DSH告知自己的名字更新)。默认叫fishball，第二个开始默认叫Fishball-2。以此类推。还要注意一个细节，一个token理应只给一个agent用。对于Watchdog，也是由Fishball订阅事件，但是收到事件后不触发LLM，而是经由插件分流（我知道这和之前说的不一样）给Watchdog。

What it means:
1. **Q3, decided: marks and Hand over / Take back stay.** The connector keeps only the
   hand-over events and tools used to contact Fishball, with no UI. Embed-UI provides the
   buttons and marks. Clicking a button makes embed-UI drive the connector, which emits the
   hand-over or take-back event to the target Fishball.
2. **Names.** There can be several Fishballs and agents, so each has a user-visible name. The
   name is set inside the Fishball DSH (the client side) and reported to the connector on
   connect and whenever it changes. Default names: "Fishball", then "Fishball-2", "Fishball-3"
   and so on.
3. **One token, one agent.**
4. **Watchdog routing changes (the user knows this differs from before).** Fishball
   (`fishball-core`) holds the one event subscription. Events meant for Watchdog are dispatched
   to it by a plugin-level router inside core (realised by 1.11 as core's interception service,
   R-INT), **without** triggering Fishball's LLM. This
   replaces the earlier "Watchdog subscribes to DSH's events itself" (1.1 item 5) and the
   subscription part of the Q10 record (1.7). Watchdog stays Fishball's helper under the same
   token and principal.

### 1.9 Identity and pairing (2026-11-11), verbatim

The one-token-one-agent rule:

> 一个token用于握手，握手后就不能再次使用这个token握手了，握手时让对方传入自己的fishball id（默认随机生成，用户也可以在启动时自命名）来保存。形成一个token-id对，之后通过这个token连接上的fishball来找dsh时都会自动贴上fishball id用于校验身份。这只是一个防呆设计，防止用户自己傻傻的拿一个token给一堆agent，所以不考虑其他agent冒用已配对agent的身份的情况。但是如果fishball发起握手申请，并传入了一个相同的ID，这次握手就要失败，提示用户要用一个新的token来握手。如果是同一个DSH内安装的instance插件中的fishball，则自动生成新token握手。

External agents:

> 对于没有fishball id的外部agent，也需要对方自己起个id才能连接上。之后这个id+token就是访问这个MCP必须的credential了。

What "a same ID" means:

> 不是，比如token“aaa”，id“123”，这时候已经配对完成了，token “aaa”已经绑定了ID ”123“的fishball。这时候如果又有一个ID ”123“的fishball来用token”aaa“握手，就要返回错误，就算id相同也不能二次握手。只有没有绑定ID的token才能握手

On keeping the id and the display name separate, the user said **"同意"** (agreed).

What it means (now R-ID and R-NAME):
- **Pairing.** A token can be used for exactly one handshake. In it, the client gives its id,
  which is random by default; the user may choose their own. The connector stores the token–id
  pair. **Only a token with no bound id can handshake.** Any further handshake with a bound
  token fails, even with the same id, and tells the user to use a new token.
- **The credential is token + id.** A paired client never handshakes again, including after a
  restart or reconnect. *(How it is presented is refined by 1.10: token + id go to the token
  endpoint, and MCP requests carry the access token, or `<id>.<token>` under the direct-access
  fallback.)*
- **External agents** must also choose an id; without one the connection is refused.
- **Foolproofing only.** The rule stops a user handing one token to many agents. It does not
  defend against an agent impersonating a paired one; that is out of scope.
- **Hosted Fishball** in the same DSH automatically gets a new token for each handshake (this
  revises the Q8 record of 1.6).
- **Id and name are separate (agreed).** The id is fixed and part of the credential. The name is
  user-facing, can change at any time, and is reported on connect and on every change.
- No rule makes ids unique across tokens. The token is the primary key.

Why a second handshake fails even with the same id, and what clients do then:

> 这么设计的理由是，用户可能给两个相同的fishball都起了一样的id，或者两个外部agent机缘巧合下给自己起了一个相同的id。这时候虽然握手失败，但是fishball内要提示已经已经配对过了，弹出警告，提示已经配对过了，可以跳过配对继续使用，但是需要确认是否存在同id的其他外部fishball（外部agent）已经配对，确认没有的话可以跳过配对继续使用。外部agent也要通过配对的MCP工具返回的信息来判断是否直接使用这一对credential继续工作，还是换一个id和token继续。

The purpose of the whole pairing scheme:

> 这一整套配对并非安全措施，而是防呆措施，目的只是防止同一个token指向了多个agent，到时候一个session完成了唤醒了一堆agent就不好了

The security principle:

> token本身才是安全限制，这个很重要。

What it means (now R-ID, R-TOK-00):
- **Why the second handshake fails.** Two Fishballs, or two external agents, may by accident
  have chosen the same id. The connector cannot tell whether "token aaa + id 123" is the
  original client or a lookalike, so it refuses the second handshake and lets the client decide.
- **The pairing tool answers `already-paired`**, a distinct, informative result rather than an
  authentication error. It says the token is bound, whether the presented id equals the bound
  id, and the bound pair's name and last-seen time (the user agreed to show these).
- **Fishball side.** `fishball-core` shows a warning that the token is already paired. The user
  may skip pairing and keep using the pair, but only after confirming that no other Fishball or
  agent with the same id is paired with this token. Otherwise they use a new token and/or id.
- **External agents** make the same choice from the tool's result: continue with this
  token + id, or switch to a new id and token.
- **The connector never re-pairs.** "Skip pairing and continue" only means the client goes on
  using token + id as an ordinary credential.
- **Purpose: foolproofing, not security.** Pairing exists only so that one token maps to one
  agent. Otherwise one session event (a session finishing, say) would wake a crowd of agents.
  Event delivery is keyed on the (token, id) pair, so one event wakes exactly one agent. The
  pairing and id layer stays minimal, with no anti-impersonation hardening.
- **The token is the security boundary. This is important.** "Minimal" applies only to the
  pairing and id layer, never to token security. Token strength and hygiene stay in full, and
  every request needs a valid, enabled token whatever its id or pairing state.

### 1.10 Session credentials: OAuth (2026-11-11), verbatim

Of three options (A: token + id on every request; B: a custom session credential; C: standard
MCP OAuth with short-lived access tokens), the user chose C, changed:

> C，但是oauth在fishball那里握手后靠id和token完成

What it means (now R-OA):
- The MCP endpoint uses the MCP authorization spec's machine-to-machine form: the **OAuth
  Client Credentials extension** (`io.modelcontextprotocol/oauth-client-credentials`, RFC 6749
  §4.4), with no browser, consent page or interactive step.
- The client authenticates to the connector's token endpoint with **client_id = its fishball id**
  and **client_secret = its paired token**, and gets a short-lived access token. Ordinary MCP
  requests carry only that access token.
- Disabling or deleting the token entry invalidates every access token derived from it at once.
- The pairing rule stays: a token binds to one id through the pairing tool; re-authenticating at
  the token endpoint is not a handshake.
- **Q27, decided (A):** access tokens last **1 hour** and there are **no refresh tokens**. On
  expiry, or on any 401, the client logs in again with id + token.
- **Q28, decided (A):** the user answered "行，就A，我也想不到更好的主意了". OAuth is required by
  default. Each token entry has a direct-access fallback switch, off by default; with it on,
  `Bearer <id>.<token>` is accepted on the MCP endpoint and checked on every request.
- **Q24, decided (A):** after a child reinstall, the new hosted principal takes over
  automatically. The old entry's managed sessions, designated role and name move to it, its live
  offers are re-issued with new ids, then the old entry is deleted and each managed session gets
  one note.
- **Q22, decided (A):** default names are numbered per connector, in pairing order, taking the
  lowest free name ("Fishball", "Fishball-2", …); freed numbers are reused.
- **Q23, decided (B):** names must be unique per connector; a clash is refused with
  `name-taken`. Defaults skip taken names; a clashing name at `pair` still pairs, with a default
  name instead; a successor inherits the old name.
- **Q25, decided (A), superseded by 1.14:** for sessions a healthy Watchdog supervises, permission requests and
  turn-finished and state events go only to Watchdog. Everything else wakes Fishball, as do all
  events of unsupervised sessions and everything while Watchdog is off or down. Escalations go
  back to Fishball (narrowed by Q13: only items that are not high-risk; high-risk ones go to the
  user).
- **Q18, decided (A):** with a connector in the same DSH but no instance, embed-UI still provides
  the marks, Hand over / Take back, the fish and its dots, and its contributed tools, with no
  Fishball page. With neither a connector nor an instance, it does nothing.
- **Q4, decided (A):** embed-UI is allowed when the instance targets a remote connector: the page,
  status and Retry work, but there are no dots, marks or Hand over in this DSH, and there is no
  private relay.
- **Q14, decided (A), with a precise scope.** The user's words:

  > A，只活跃于DSH上，只能给Fishball发出事件，暴露工具，接受来自Fishball的使用

  A contributor lives and runs only on the DSH side, under its own DSH authority, and gets no
  Fishball authority. Toward Fishball it can do exactly three things: **emit events** to
  Fishball, **expose tools**, and **accept calls** to those tools from Fishball. Nothing else: no
  reading mailboxes, no offers or answers, no hand-over, no tokens, nothing running inside a
  Fishball DSH. This also answers **Q19**: contributions are tools **plus events** (no resources).
- **Q16, decided (B):** there is no per-contributor switch in the connector. To stop a
  contributor's tools and events, the user disables the contributor plugin. A quarantine lifts
  when the contributor plugin is disabled and re-enabled, or reloaded. The connector's settings
  have no per-contributor rows.
- **Q6, decided (A):** there are no token scopes. Every token has full manager rights, and
  revocation is the only per-token control.
- **Q15, decided (A):** there is no per-token filtering of contributed tools.
- **Q17, decided (B):** there is no allowlist. Fishball's model sees every contributed tool, and
  contributor events reach Fishball too. The only control is installing or enabling the
  contributor plugin (Q16 B, Q15 A). This also closes Q29: no allowlist covers events either.
- **Q11, decided (A):** the custom first-party push channel (decision 1a = A) is retired. Every
  Fishball DSH, like every client, gets events through the MCP subscription plus the durable
  mailbox.
- **Q9, decided (A):** the MCP endpoint and the OAuth endpoints are routes on DSH's own web
  listener. There is no separate port.
- **Q12, decided (B):** the endpoint serves **only** MCP revision 2026-07-28. There is no
  dual-era support for 2025-11-25. **Clients on older revisions must upgrade.**
- **Q13, decided (A):** Watchdog's "other high-risk" items (every high-risk item except a
  well-founded rejection, which Watchdog makes itself) go straight to a user card in the session,
  with no Fishball turn. Q25's "escalations go back to Fishball" covers only items that are not
  high-risk and that Watchdog can't decide, plus everything while Watchdog is down.

### 1.11 Q30 answered: one event stream, delivered to one agent, then intercepted (2026-11-11), verbatim

The user's design:

> For fishball's official agent: fishball-core plugin in fishball instance. Then core plugin dispense event to other plugins that requested to intercept this event, otherwise goes to Fishball agent. For other agent: because they don't have this fishball-core plugin split feature, so always go to whoever subscribed to fishball-events(don't differentiate event, just have an arg in event to declare event type, so a single subscription on fishball-events can receive all events)

Asked whether "whoever subscribed" means one agent per event or every subscriber, the user said:

> So, yes, exactly one agent

What it means (now R-EVS, R-INT; Q30 decided):
- **One typed stream.** The connector has one subscription, `fishball-events`. Every event
  carries a `type` argument (hand-over, take-back, permission request, question, turn, state,
  message, contributor event, …), so one subscription receives every kind. There are no
  per-kind streams.
- **Exactly one agent per event.** The connector delivers each event to exactly one pair: the
  managing agent of the session it names, else the designated Fishball, and the designated
  Fishball when it names no session. Only that pair's `fishball-events` subscription gets it.
- **Official Fishball:** `fishball-core` holds the subscription and dispatches each event to the
  plugins that registered to intercept that event type. Events nobody intercepts go to the
  Fishball agent and may wake its LLM. Watchdog is one such interceptor.
- **External agents** have no such split: their subscription receives the events as they are.

### 1.12 Q31 answered: watching is managing (2026-11-11), verbatim

> C，自动盯所有自己管的session，不是自己管的就不盯。盯=管，管=盯

What it means (now R-WATCH): an agent **automatically** watches every session it manages, from
start or Hand over until release or Take back, and never watches a session it does not manage.
Watching and managing are the same relationship, so there are no separate watch tools or watch
lifecycle. Every session event goes to the session's managing pair.

### 1.13 Q32 answered (2026-11-11), superseded by 1.14

The user chose **A**: when a supervised session stops idle, with nothing running and nothing
queued, Watchdog hands that one `turn-finished` event back to Fishball, which is woken once.
Turns in the middle of the work stay Watchdog-only. (This refines Q25: of a supervised session's
`turn-finished` events, only the idle stop also reaches Fishball.)

**Revised by the user (2026-11-11), verbatim:**

> 会话停下来就绕过Watchdog直接转向Fishball

What it means: the idle stop **bypasses Watchdog entirely** and goes straight to Fishball.
Watchdog does not check that turn first and does not intercept it. Only turns after which the
session is still running or has something queued stay Watchdog-only.

### 1.14 When Watchdog runs, redefined (2026-11-11), verbatim

> 只有出现需要判定权限，或者Watchdog的内置轮次计时到了才会激活一次watchdog，其余情况都会转给Fishball

What it means (now R-WD-03, R-WD-12, R-INT-07):
- Watchdog is activated in **exactly two** cases: (1) a permission request of a session it
  supervises that needs judging; (2) its own built-in patrol timer firing (the minimum
  supervision interval, default 29 min).
- **Everything else goes to Fishball**: every `turn-finished` (mid-work or idle), `state`
  events, questions and plan reviews, messages, asks, Hand over / Take back, notices and
  contributor events.
- Q13 stays: high-risk items Watchdog can't reject on firm grounds go straight to a user card.
  The `settlement` / `retirement` follow-ups of requests Watchdog held still go to Watchdog.
- **History:** this replaces Q25's split (permission, `turn-finished` and `state` to Watchdog)
  and makes Q32 and its revision (R-WD-13, the idle-stop bypass) unnecessary, since no turn
  event reaches Watchdog any more.

### 1.15 Q33 answered (2026-11-11), verbatim

> Watchdog是被动assign上去的，所以不能

What it means: Watchdog is attached to a session **passively**, so Fishball cannot call it on
demand. `check_now` and refine-triggered checks are removed as ways to activate it. Watchdog runs
only on a supervised session's permission request or when its own patrol timer fires.
**Refine survives as a data change only:** Fishball may still update a supervised session's
brief (`watchdog_refine`), but that starts no run; the new brief applies at Watchdog's next
patrol or permission judgement (R-WD-15).

### 1.16 Earlier decisions carried into V3

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
| **Hosted mode** | The instance launches a child Fishball DSH under the host DSH and manages its lifecycle. The child runs the same plugins, with the same guards, as a standalone DSH (Q20, decided). |
| **Standalone mode** | A DSH the user runs themselves, with the Fishball plugin set installed by hand. There is no instance. |
| **Connector** (C) | `fishball-connector`, installed in a main DSH. |
| **Instance** (I) | `fishball-instance`, the launcher plugin for hosted mode. |
| **Embed-UI** (U) | `dsh-fishball-embed-UI`, installed in the host DSH. |
| **Fishball plugin set** (F) | The four DSH plugins that make a DSH into Fishball (Q2, decided): `fishball-core` (with its `fishball-ui` component), `fishball-board`, `fishball-fold-notify`, `fishball-watchdog`. |
| **Shared library** | `fishball-shared`, the one library package for modules more than one V3 package uses; any V3 package may depend on it (R-ARCH-08, TQ-R5). Not a plugin, not a set member, imports no other V3 package. |
| **Hosted settings bundle** | `fishball-hosted-settings`, the instance's hosted-only settings sections as one placed bundle (TQ-R4, decided B). Only in a hosted child, placed by the instance; **not** a member of the Fishball plugin set and never in a standalone DSH (R-HOST-11). |
| **Principal** | One paired token at a connector: the token entry plus the fishball id bound to it (R-ID). Each Fishball DSH is one principal; each external agent is another. |
| **Fishball id** | A client's fixed, non-secret identifier, bound to its token at pairing. Part of the credential. |
| **Name** | A principal's user-facing display name. Changeable at any time, reported by the client (R-NAME). |
| **Contributor** | A plugin in a connector's DSH that contributes MCP tools and events through the connector (R-EXT). |
| **Event** | Something that happens at a main DSH and that a principal must learn about. Each event carries a `type` from R-EVS-02 (permission, question, plan review, settlement, retirement, turn finished, state, message, ask, Hand over, Take back, notice, or a contributor's event) and goes to exactly one pair (R-EVS-03). |

## 3. Requirements

Each requirement is written to be testable. **Bold** marks the observable. "Refused" means the
operation returns a machine-readable error code, changes nothing and leaks nothing.

### 3.1 Packages and boundaries (R-ARCH)

| ID | Requirement |
| --- | --- |
| R-ARCH-01 | V3 ships `fishball-connector`, `fishball-instance`, `dsh-fishball-embed-UI` and the **Fishball plugin set** (R-FB). Every one of them is an ordinary DSH plugin (bundle) that DSH's own plugin management can install, enable, disable and list. V3 also has one library package, `fishball-shared` (R-ARCH-08), which is not a plugin. |
| R-ARCH-02 | A DSH with any of these packages installed stays a full DSH: **no** V3 package refuses to load, hides or disables another plugin because a Fishball package is present. The one exception is a Fishball DSH, where `fishball-core`'s `fishball-ui` component reshapes the DSH on purpose (R-FB-02, Q20). |
| R-ARCH-03 | `fishball-connector` registers **no browser client module**. Its package declares no `dsh.client` entry, and loading it adds no sidebar entry, slot contribution, CSS or route that serves HTML. |
| R-ARCH-04 | Every host-DSH UI change Fishball makes comes from `dsh-fishball-embed-UI`. With embed-UI uninstalled, **no** Fishball UI element appears in the host DSH. |
| R-ARCH-05 | `fishball-instance` provides only the hosted child and its lifecycle (R-HOST). It contributes no UI **to the host DSH** (all host UI is embed-UI's, R-ARCH-04). Inside a hosted child it injects only the hosted-only settings sections, into `fishball-core`'s generic settings extension point (R-HOST-11). Its host row's `inject` list holds **no service that reads or writes sessions, approvals, questions or prompts**; it cannot reach the host DSH's sessions except through a connector's MCP, from inside the child, like any client. |
| R-ARCH-06 | No V3 package patches DSH code, bundles or another plugin's files. It uses only public DSH services, slots and profile patch rows, on both supported SDKs (R-COMPAT). |
| R-ARCH-07 | Talk between a Fishball DSH and a main DSH goes **only** through the main DSH's connector MCP endpoint. No V3 code path reaches main-DSH sessions through `fishballConnector.attachInstance`, the envelope-v2 frames or any other private channel. |
| R-ARCH-08 | **Shared library (TQ-R3 and TQ-R5, decided).** The user's words: "建立公共包" (create a shared package). `fishball-shared` (folder `packages/shared`) holds **only** modules that **more than one** V3 package actually uses; first contents: the child `admin` service constants, the provider-sync wire format (codec), and the file helpers core and the instance both need. Fishball-only logic stays in core; DSH-only logic stays in the instance. Rules: (1) **any** V3 package may depend on it: the connector, embed-UI, `fishball-core`, `fishball-instance`, the feature plugins and `fishball-hosted-settings` (TQ-R5, decided B); (2) `fishball-shared` imports nothing from any other V3 package, and core and the instance never import each other; (3) it has no DSH plugin entry (no `dsh` bundle, row, `dsh.client` or service) and never appears in any Plugins page; (4) importing it loads only the library: a connector or embed-UI that depends on it loads no module of the Fishball set or of `fishball-hosted-settings`, so R-BND-01 still holds in the host DSH; (5) a module that only one package uses does not belong in it; (6) it is versioned with the other V3 packages and, because V3 publishes nothing (§5), ships **inside** the release tarball of every package that depends on it, as a bundled dependency, so no install needs a registry. |

### 3.2 Connector: an MCP server (R-CON)

| ID | Requirement |
| --- | --- |
| R-CON-01 | **Protocol (Q12, decided).** The connector exposes one MCP endpoint over Streamable HTTP that serves **only** MCP revision **2026-07-28** (stateless requests, `server/discover`, `subscriptions/listen`). It implements no `initialize` handshake, no `Mcp-Session-Id` sessions, no GET stream and no `resources/subscribe`. A request for another revision is refused with `UnsupportedProtocolVersion` (-32022), listing `2026-07-28`; an `initialize` request gets an error that names the supported revision; GET or DELETE on the endpoint gets 405. **Clients on 2025-11-25 or older must upgrade** to a 2026-07-28 client. A 2026-07-28 client can discover, list and call the connector's tools. |
| R-CON-02 | The endpoint serves session control as MCP tools (the **core tools**): list, start, message, redirect, stop, read, and release. There are no watch tools (R-WATCH-03). It also serves approval, question and prompt answering; grant list and revoke; attachment put and read; and mailbox poll and ack. The attention signal is not a core tool; embed-UI contributes it (R-EXT-13). Core tools carry the domain semantics and limits of contract 1.2 §4 and §8. Each tool returns a structured domain result: refusals carry their contract code (for example `limit-exceeded`, `expired`, `queue-full`) and are never just prose. |
| R-CON-03 | Events reach a principal through a **durable mailbox** per pair (R-ID-06). Events stay pending until the principal acks them. A poll returns a bounded ordered page plus a cursor. A stale or foreign cursor gets an explicit resync answer, never a silent skip. |
| R-CON-04 | **One typed event stream (Q30, decided; R-EVS).** The mailbox is published as one MCP resource, `fishball-events` (URI `fishball://events`). A subscription to it gets `notifications/resources/updated` whenever new events arrive for that pair. The notification is a **hint only**: a client that never subscribes gets the same events by polling, and losing a notification loses no event. |
| R-CON-05 | No approval, question or plan review is ever settled by a timer, by a client's silence or by a lost notification. A delegated item with no answer **waits**. |
| R-CON-06 | Settlement is atomic, and the first committed outcome wins (OQ-14). A second answer, by user or agent, gets `already-settled` or `expired` and changes nothing. |
| R-CON-07 | External principals receive and may answer delegated approvals and questions, including plan reviews. This is on by default, and **no setting turns it off** (1b). |
| R-CON-08 | The connector keeps today's main-session tools `message_fishball` and `ask_fishball` and the managed-session interception of permission requests. These are tools and approval hooks, not UI. They route to principals by the rule of R-ROUTE (Q7, decided). |
| R-CON-09 | With no principal connected, the connector behaves as contract 1.2 §9 does with no instance attached. Messages queue, up to the `maxQueuedInputs` bound. `ask_fishball` answers `unavailable` at once. A managed session's permission request goes to the user in that session. |
| R-CON-10 | The connector's settings (limits, tokens and endpoint options; no per-contributor rows, Q16) live **only** in DSH's native Plugins settings form for `fishball-connector`, and the connector ships no custom settings UI. |
| R-CON-11 | **Hand-over only (Q3, decided).** The connector keeps only the hand-over events and tools needed to contact Fishball: the `handover` and `takeback` events in the target principal's mailbox, the managed-session state they change, and a host-only service through which a plugin in the same DSH (embed-UI) performs Hand over / Take back and reads which sessions are managed by whom. It has no UI and no other UI state. |

### 3.3 Tool and event contributions from other plugins (R-EXT)

| ID | Requirement |
| --- | --- |
| R-EXT-01 | The connector provides a public, versioned DSH service (proposed name `fishballConnectorTools`) through which a plugin in the same DSH process registers MCP tools. A contributor that injects it (optionally, so a missing connector never fails its own load) can register and unregister tools at runtime, with no connector restart. |
| R-EXT-02 | A registration names its tool's input schema, an optional output schema, a description and an execute function. A registration with an invalid name, a non-object or invalid input schema, an unsupported schema keyword set, or a missing execute function is **refused** with a code (`tool-invalid`). Nothing is registered and nothing appears in `tools/list`. |
| R-EXT-03 | Every contributed tool's public MCP name is `<namespace>.<name>`. The namespace is derived from the contributor's identity in DSH (its plugin name), never passed in by the contributor. The `fishball` namespace and the core tool names are reserved. One fixed exception: embed-UI's namespace is the short alias `embed-ui`. A second registration of an existing public name is refused (`tool-exists`) and leaves the first in place. Public names satisfy MCP's tool-name rules (1–128 characters of `A–Z a–z 0–9 _ - .`). |
| R-EXT-04 | When a registration is disposed, or its contributor is disabled, unloaded, reloaded or uninstalled, its tools leave `tools/list` **before the next request is answered**. Later calls get "unknown tool". Every client whose listen stream opted into `toolsListChanged` gets `notifications/tools/list_changed`. Registering a tool sends the same notification. |
| R-EXT-05 | Contributed tools sit behind the same access-token check as core tools (R-TOK-01, R-OA). An unauthenticated request cannot list or call them. A pair-only access token sees no contributed tools in `tools/list` (only discovery, `tools/list` of core tools and `pair`). **Every authenticated, paired token sees and may call every contributed tool**, exactly as with core tools: there is no per-token filtering (Q15, decided; no scopes, Q6). The only control is installing or enabling the contributor plugin (Q16, Q17 decided). |
| R-EXT-06 | A contributed tool's call passes through the connector's own checks **before** the contributor's code runs: authentication, request and body limits, in-flight and rate limits, input-schema validation against the registered schema, and the per-call byte limits the contributor declared within the connector's ceilings. A call that fails one of them is refused with the connector's code and never reaches the contributor. |
| R-EXT-07 | A contributed tool's result passes through the connector's checks **after** the contributor's code runs: the result-size ceiling, output-schema validation when one is declared, and the result envelope (`{ok, code?, …}` in a successful `CallToolResult`). A refusal code the contributor returns must come from its declared code list or the connector's shared vocabulary; anything else becomes `operation-failed`. |
| R-EXT-08 | A contributor's execute function that throws, rejects, returns an invalid result or exceeds the per-call time ceiling is **contained**. That call gets `{ok: false, code: 'contributor-failed'}`, with no stack, message text or internal path. The connector, every other tool and every other client are unaffected. The failure is logged once per contributor and failure kind, with no arguments or result content. |
| R-EXT-09 | A contributor that keeps failing is **quarantined**: its tools are withdrawn (R-EXT-04) and its events stop (R-EXT-19). The quarantine lifts only when that contributor's plugin is **disabled and re-enabled, or reloaded** (a new plugin fiber). There is no connector-side control for it (Q16, decided). |
| R-EXT-10 | The per-call context handed to a contributor carries the calling **principal** (an opaque principal key and its current name, never the token or the token entry's label), a cancellation signal that fires when the client cancels or disconnects, and the protocol revision (always 2026-07-28). It carries no access to the connector's mailbox, other principals, the credential store, other tools or main-session authority beyond what the contributor's own DSH context already has. |
| R-EXT-11 | **The contributor's whole scope (Q14, decided).** A contributor runs only in the connector's DSH, under its own DSH authority. Toward Fishball it can do exactly three things through the connector: emit events (R-EXT-16), expose tools (R-EXT-01) and accept calls to them (R-EXT-06). It cannot read or ack mailboxes, see or answer approvals, questions or prompts, settle offers, perform Hand over / Take back, obtain or see any token, or run anything inside a Fishball DSH. The contribution service offers no member for any of these. |
| R-EXT-12 | Contributed tools appear in `tools/list` sorted deterministically (core tools first, then by public name). Each carries `annotations` with the contributor's plugin name and package version. Annotations stay untrusted hints, as the MCP spec requires. |
| R-EXT-13 | Embed-UI's notification-type tools (the attention latch: set and read) are contributed through R-EXT-01, not built into the connector. With embed-UI absent, those tools are absent from `tools/list`. |
| R-EXT-14 | **No allowlist (Q17, decided).** A Fishball DSH offers **every** contributed tool of its target connector to Fishball's model, through `fishball-core`'s façade, and passes every contributor event to Fishball unless a plugin in the Fishball DSH intercepts its type (R-EXT-20). `fishball-core` has no allowlist setting. The only control is installing or enabling the contributor plugin in the connector's DSH. *Note, not a setting:* each contributed tool adds its name, description and schema to every Fishball turn, so many contributors grow Fishball's prompt; the README says so, and core's status shows how many contributed tools are offered. |
| R-EXT-15 | **No per-contributor settings (Q16, decided).** The connector's settings contain no rows or switches per contributor. To stop a contributor's tools and events, the user disables that plugin in DSH's native Plugins page. Visibility: each registration, refusal, withdrawal and quarantine writes one log line naming the namespace (never arguments, payloads or tokens), and every contributed tool carries its contributor's plugin name in `tools/list` annotations (R-EXT-12). |
| R-EXT-16 | **Contributor events (Q14, decided).** A contributor emits an event through the same service: `emit({event, payload, summary?, sessionId?, dedupeKey?})`. The public event name is `<namespace>.<event>`, with the same namespace rule as tools (R-EXT-03): derived from the contributor, never chosen by it, and reserved names refused. The event becomes one mailbox event of type `contributed:<namespace>.<event>` for its one **recipient** pair (R-EXT-17, R-EVS-03), delivered on that pair's `fishball-events` subscription and keyed by the recipient's (token, id) pair (R-ID-06), so one emit wakes at most one agent. |
| R-EXT-17 | **Recipient (Q30, decided).** A contributor event goes to exactly one pair, by the rule of R-EVS-03: with `sessionId`, that session's managing pair, or the designated Fishball pair if the session is unmanaged; without it, the designated Fishball pair. With no recipient, `emit` returns `no-fishball` and nothing is queued. |
| R-EXT-18 | **Event limits.** `payload` is JSON of at most **8 KiB** UTF-8. `summary` is plain text of at most **500** characters. `event` follows the tool-name grammar. Per contributor and recipient, at most **30 events per minute** with a burst of **10**; beyond that `emit` returns `rate-limited`. The event counts toward the recipient's `maxQueuedInputs` (`queue-full` when it is full). A pending event with the same `dedupeKey` from the same contributor makes `emit` return `duplicate` and queue nothing. All limits are frozen connector constants, not settings (freeze at V3-K). Every refusal is a returned code, never an exception into the connector. |
| R-EXT-19 | **Events share the tools' fate.** When a contributor is quarantined (R-EXT-09) or withdrawn (disabled, unloaded, uninstalled), its `emit` returns `contributor-unavailable` and queues nothing, and its events still **pending** (not yet acked) in any mailbox are retired. Events a client has already acked stay with that client. A contributor whose emits keep failing validation counts toward quarantine like failing tool calls. |
| R-EXT-20 | **Contributor events reach Fishball unless intercepted** (Q30, decided). In a Fishball DSH, contributor events are dispatched like every event (R-INT-02): to a plugin that registered for their `contributed:…` type, else to the Fishball agent, through the X9 pipeline (fold-notify may batch them), possibly waking its LLM. Watchdog never registers for them (R-INT-07). No allowlist filters them (Q17, decided). |

### 3.4 Tokens and authentication (R-TOK)

| ID | Requirement |
| --- | --- |
| R-TOK-00 | **The token is the security boundary (verbatim principle, 1.9).** Ids and pairing are foolproofing only and never relax a token rule. Every request needs a valid, enabled token first; nothing about ids, pairs, names or last-seen times is processed or revealed before the token is verified. |
| R-TOK-01 | **Every** MCP request carries `Authorization: Bearer <access token>` issued by the connector's token endpoint (R-OA), on every request including `server/discover` and subscription streams. A missing, expired, revoked or foreign access token gets **HTTP 401** with `WWW-Authenticate: Bearer resource_metadata="…"` (and `error="invalid_token"` when one was presented), no MCP processing and no hint about any pair. The **token** (the long-lived secret of a token entry) is presented only to the token endpoint, as the client secret, never to the MCP endpoint, except under the direct-access fallback (R-OA-10). |
| R-TOK-02 | A token in a URL query string is refused, even when a valid header is also present. |
| R-TOK-03 | The user can create a new token for an external agent or a standalone Fishball from the connector's native settings form, with no custom UI, by the mechanism of R-TOK-08 (Q5, decided). |
| R-TOK-04 | Token secret values live **only** in DSH's credential store (`ctx.credentials`) of the DSH that holds them. They are never in settings documents, logs, lifecycle files, temp files, launch overlays, process arguments, tool results, resource contents, error messages or browser responses. |
| R-TOK-05 | Revoking a token takes effect on the **next request**. A request that has already passed the token check when the revocation lands completes normally; the next request is refused (TQ-5, decided A). Open subscription streams of that principal close, and its pending answers to delegated items are refused. What happens to its items depends on the action (TQ-2, decided A; [design §5.3](<v3-design.md#53-revocation>)). **Disable:** its live offers are withdrawn and go to the user in their sessions; **every other** queued event, `ask` included, is kept for **30 days** and is pollable again on re-enable; the designated-Fishball role stays with the entry. **Delete:** all its queued events are dropped and the designated role is cleared (`routing.fishballToken` unset, so R-ROUTE-04's default applies). An `ask_fishball` whose `ask` event is dropped (delete, or the end of the 30 days) answers `unavailable` to the asking session, so it never waits for an answer that cannot come; while the entry is only disabled, the asker keeps waiting (R-CON-05). |
| R-TOK-06 | Token comparison is constant-time, at the token endpoint and wherever else a token is checked. Repeated failed attempts do not reveal which tokens or ids exist. Per-client rate limits apply at the token endpoint; per-principal rate and in-flight limits and the Origin check (R-REM-03) apply to every MCP request, paired or not. |
| R-TOK-07 | Each principal is identified by its token entry plus the bound fishball id, never by MCP `clientInfo`, a session id or any other caller-supplied field. The token entry is the primary key (R-ID-11). |
| R-TOK-08 | **Creation (Q5, decided).** A token is a list entry in the connector's native settings: `label` (shown, not secret), `enabled` (switch) and `ref` (a credential reference, an environment-variable name). When an enabled entry's `ref` has no configured value and the credential store can write it, the connector generates a high-entropy value (at least 256 bits) and stores it with `ctx.credentials.set`. When the user has already set a value (in the store or the environment), the connector uses it as is, provided it has at least **32 characters**; a shorter one is refused, status `token-too-short` (TQ-4, decided A). When an enabled entry's `ref` has no value and the credential store cannot write it, the entry's status is `token-unconfigured` and it cannot be used (the token endpoint answers `invalid_client` for it). Two entries may not share a `ref`: saving such settings is refused with `ref-duplicate`, and the previous settings stay. The value is never shown in any DSH UI. |
| R-TOK-09 | **Revocation (Q5, decided).** Switching an entry off, or deleting it, revokes that principal (R-TOK-05). Deleting an entry whose value the connector generated also removes that value from the credential store. A value the user supplied is never removed. Switching an entry back on with the same `ref` restores the principal. |
| R-TOK-10 | **No scopes (Q6, decided).** Every paired token has full manager rights, delegated approvals and questions included (1b). There is no per-token permission setting; disabling or deleting the entry (revocation) is the only per-token control. The `fishball:pair` access-token scope of R-OA-04 is not a permission scope: it exists only until pairing (R-ID). |

### 3.4a OAuth: the connector as its own authorization server (R-OA)

| ID | Requirement |
| --- | --- |
| R-OA-01 | The connector is its own OAuth 2.1 **authorization server** and the MCP endpoint its **protected resource**, both on the same DSH web listener as the endpoint, with no UI. It serves: the protected resource metadata (RFC 9728) at the MCP endpoint's path-inserted well-known URI and in every 401's `resource_metadata`; the authorization server metadata (RFC 8414) at its issuer's well-known URI; and a token endpoint. Standard MCP clients that support the client credentials extension work with configuration only (endpoint URL, client id, client secret, expected issuer). |
| R-OA-02 | The authorization server supports **only** the `client_credentials` grant, with client authentication `client_secret_basic` and `client_secret_post`. It offers no authorization endpoint, no dynamic client registration and no Client ID Metadata Documents. Its metadata says so (`grant_types_supported: ["client_credentials"]`). |
| R-OA-03 | **Client identity.** `client_id` is the client's fishball id (R-ID-02) and `client_secret` is the token value of a token entry. The connector first verifies the token in constant time against the enabled entries (R-TOK-00): an unknown, disabled or revoked token gets `invalid_client` (HTTP 401) and nothing about any pair is revealed. |
| R-OA-04 | **Pair state decides the scope** (R-ID). On an unbound token, or on a bound token with another id, the token endpoint issues an access token whose only power is the `pair` tool (and discovery and `tools/list`). On a bound token with its bound id, it issues a full access token. The token response carries the extension field `fishball_pairing`: `unpaired`, `paired` or `id-mismatch`. |
| R-OA-05 | **Access tokens** are opaque random strings, stored server-side by digest only, bound to (token entry, fishball id) and to the MCP endpoint's canonical URI as audience (RFC 8707 `resource`, which the client must send). **A token request without `resource` is refused with `invalid_target`** (TQ-3, decided A; confirmed by spike V3-S7 `8e92b84`: the stock `ClientCredentialsProvider` of `@modelcontextprotocol/client` 2.2.0 sends `resource` on both SDKs), as is one naming another resource. Access tokens and their digests are held **in memory only** and are lost when the connector restarts (TQ-5, decided A); a client then gets 401 and re-authenticates (R-OA-07). Each MCP request looks its token up; an access token presented for another resource is refused. |
| R-OA-06 | **Revocation is immediate.** Disabling or deleting a token entry, or changing its value, invalidates every access token derived from it on the next request. Re-enabling an entry does not revive old access tokens; the client simply requests a new one. |
| R-OA-07 | **Lifetime (Q27, decided).** An access token is valid for exactly **3600 seconds** from issue (`expires_in: 3600`); a request at or after expiry gets 401. The token endpoint issues **no refresh token** and supports no `refresh_token` grant (`unsupported_grant_type`). On expiry, or on any 401, the client re-authenticates at the token endpoint with id + token. That is never a pairing and never fails because the token is already bound to that same id. Access tokens are not rotated mid-life; revocation still cuts them off at once (R-OA-06). |
| R-OA-08 | The token endpoint and metadata are served under the same exposure rules as the MCP endpoint: loopback by default, TLS for any non-loopback listener (MCP: authorization server endpoints must be HTTPS; loopback is the accepted local exception). The Origin check, body limits and rate limits apply. |
| R-OA-09 | The `server/discover` result advertises the extension `io.modelcontextprotocol/oauth-client-credentials`. |
| R-OA-10 | **Direct-access fallback (Q28, decided).** Each token entry has a switch `directAccess`, default **off**, in the connector's native settings. Off: the MCP endpoint accepts only access tokens from the token endpoint, and a `Bearer <id>.<token>` value gets the same 401 as any invalid access token. On: the MCP endpoint also accepts `Authorization: Bearer <id>.<token>` (the fishball id, a dot, the token value) for that entry. It is split at the **first** dot (ids contain no dot, R-ID-02; the token part may), the token part is checked in constant time against that entry on **every** request, and the id must be valid (R-ID-02). It then counts exactly as an access token of that (token, id): full if the entry is bound to that id, pair-only otherwise, so pairing still goes through `pair`. Switching it off, or revoking the entry, refuses the next such request. All token-hygiene rules apply (R-TOK-00/04/06): the value is never logged, and limits and the Origin check apply. |

### 3.4b Identity and pairing (R-ID)

Foolproofing only (1.9): one token maps to one agent so one event wakes one agent. It never
replaces or weakens the token check (R-TOK-00).

| ID | Requirement |
| --- | --- |
| R-ID-01 | **The credential is token + fishball id**, presented at the token endpoint as OAuth client secret + client id (R-OA-03). The same mechanism applies to Fishball DSHs and to external agents. MCP requests then carry only the access token, which is bound to the pair (R-OA-05). |
| R-ID-02 | A fishball id is 1–64 characters of `A–Z a–z 0–9 _ -`, case-sensitive and not secret. **An id never contains a dot** (TQ-1, decided C), so the first dot of a direct-access value always ends the id (R-OA-10). An invalid id gets `invalid_client` at the token endpoint, so it can never reach `pair`. `fishball-core` refuses an invalid `identity.id` (a dot included) when the setting is saved, with `id-invalid`, and never sends it. Names are not ids: a name may contain dots (R-NAME-02). |
| R-ID-03 | **Pairing is one explicit MCP tool call, `pair`**, made with an access token from R-OA-04. It binds that access token's id to its token entry, durably and atomically, and returns `{ok: true, paired: true, id, name}`. After it, the same access token gains full power at once (scope is evaluated live). **Only a token with no bound id can pair.** When two `pair` calls race on one unbound token, exactly one binds; the other gets `already-paired`. |
| R-ID-04 | **A second `pair` on a bound token always fails**, even with the bound id. It returns the distinct result `{ok: false, code: 'already-paired', bound: {idMatches, boundId, name, pairedAt, lastSeenAt}, advice}`. `idMatches` says whether the caller's id equals the bound id. `advice` is a fixed text: with `idMatches: true`, "continue with this token and id only if no other agent uses this id with this token; otherwise use a new token"; with `idMatches: false`, "use a new token". It is returned only to a caller whose token was verified (R-TOK-00). |
| R-ID-05 | **Normal use and reconnects never pair.** A client whose token is bound to its id just requests access tokens and works, including after a restart or reconnect of either side. "Skip pairing and continue" (R-ID-07) is just this. |
| R-ID-06 | **Delivery keys on (token, id).** Mailbox events, subscription notifications and offers belong to the pair. Only a full access token of that pair may subscribe, poll, ack or answer. One event goes to one pair, and so wakes one agent. A call needing full power with a pair-only access token gets `not-paired` (unbound) or `id-mismatch` (bound to another id). |
| R-ID-07 | **Fishball side (`fishball-core`).** Core calls `pair` only for a token it has not paired before (a local, non-secret "paired" record per target and token reference), never on reconnect. On `already-paired` with `idMatches: true`, the Fishball page shows a warning naming the bound pair's name and last-seen time, with two choices: **Continue with this pairing**, enabled only after the user ticks "No other Fishball or agent uses this id with this token"; or **Use a new token** (and optionally a new id). Until the user chooses, core sends nothing else to the target. On `idMatches: false`, only **Use a new token** is offered. |
| R-ID-08 | **External agents** choose their own id (their OAuth client id); without one they cannot authenticate. They call `pair` once, and decide from its result whether to continue with the pair or switch to a new id and token. The connector never generates or suggests an id. |
| R-ID-09 | A bound token stays bound for the life of its entry. Disabling the entry revokes it (R-TOK-09, R-OA-06) and keeps the pair, so re-enabling restores the same principal. There is no unpair: a new agent needs a new token. |
| R-ID-10 | **Ids in a Fishball DSH.** `fishball-core`'s setting `identity.id` is generated at first start: `fb-` followed by 16 random lowercase base32 characters. The user may set their own instead, within R-ID-02 (else `id-invalid`, and the previous id stays). Changing it after pairing makes core's next token request answer `fishball_pairing: id-mismatch`; core's status says a new token is needed. |
| R-ID-11 | **Scope: no anti-impersonation hardening.** Two clients presenting the same token and the same id are the one paired principal. The token entry is the primary key; the same id on two different tokens is allowed and means two principals. |
| R-ID-12 | The connector records `pairedAt` and `lastSeenAt` (the last authenticated request of the pair) per pair. Its native settings show, per token entry, read-only: paired or unpaired, the bound id, the name, `lastSeenAt` and whether it is connected now. No custom UI. |

### 3.4c Names (R-NAME)

| ID | Requirement |
| --- | --- |
| R-NAME-01 | Each principal has a **name**, separate from its id (agreed). The id is fixed; the name can change at any time. Names are **unique per connector** (Q23, decided). |
| R-NAME-02 | A client reports its name with the MCP tool `set_name({name})`, callable any time with a full access token, or as the optional `name` argument of `pair`. **Normalisation:** surrounding whitespace is trimmed, inner runs of whitespace are collapsed to one space, and the result is Unicode NFC; that is the stored and displayed name. It must then be 1–64 characters with no control characters, else `name-invalid`. **Uniqueness** compares names case-insensitively (Unicode case folding of the normalised name), so "fishball-2" and "Fishball-2" clash. A `set_name` whose name is held by **another** principal is refused `name-taken`, and the caller keeps its current name. Setting a principal's own current name again, in any letter case, succeeds and changes nothing else (a case-only change is stored). The connector updates every place a name is shown before answering. |
| R-NAME-03 | `fishball-core`'s setting `identity.name` is the Fishball's name. Core passes it to `pair`, and calls `set_name` on every later change and after a reconnect whose stored name might be stale. On `name-taken` (from `set_name`, or `nameAssigned: false` from `pair`), the Fishball page shows that the name is used by another agent on that DSH, shows the name actually in use, and asks the user to choose another; core keeps working under the name the connector holds. |
| R-NAME-04 | **Default names (Q22, decided; Q23).** A principal that pairs without a usable name gets a default name at pairing, per connector: the **lowest free** name in the series "Fishball", "Fishball-2", "Fishball-3", … (there is no "Fishball-1"). "Free" means no current principal holds that name in the case-insensitive comparison of R-NAME-02, whether it was assigned as a default or chosen by hand; the series simply **skips** taken names. Numbers freed by deleted entries or by renames are reused. Concurrent pairings get distinct names. A principal keeps its default until it sets a name, and another principal's rename never renames it. A successor (R-HOST-09) takes the old principal's name instead of a new default. |
| R-NAME-05 | Names are shown wherever a principal is shown: managed-session marks, the Hand over button, the token entry status, the designated-Fishball setting, and connector notes in sessions ("managed by …"). Name collisions are refused (R-NAME-02). |
| R-NAME-06 | **A name clash at pairing never fails the pairing (Q23).** If the `name` given to `pair` is invalid or held by another principal, the pairing still succeeds (token and id are bound), the principal gets a default name (R-NAME-04), and the result says so: `{ok: true, paired: true, id, name: <default>, nameAssigned: false, nameRefused: 'name-taken' | 'name-invalid'}`. With a usable name, `nameAssigned: true`. |
| R-NAME-07 | **Successor names (Q24, Q23).** In the takeover of R-HOST-09 the old entry is deleted and its name moves to the new principal in the same atomic step, so the name is never held twice and never refused. The new principal's provisional default from its pairing is released by the same step. |

### 3.4d Routing between principals (R-ROUTE, Q7 decided)

| ID | Requirement |
| --- | --- |
| R-ROUTE-01 | Each managed session has **exactly one** managing principal: the principal that started it with `session_start`, or the designated Fishball principal for a user Hand over. `session_release` and Take back clear it. |
| R-ROUTE-02 | A managed session's permission requests, questions and plan reviews become offers **only** in its managing principal's mailbox. No other principal sees or can answer them; an attempt gets `forbidden`. |
| R-ROUTE-03 | `message_fishball` and `ask_fishball` from a managed session go to its managing principal. From an unmanaged session they go to the **designated Fishball principal**. |
| R-ROUTE-04 | The designated Fishball principal is a connector setting (`routing.fishballToken`, one of the token entries). Its default is the hosted Fishball's token entry when one exists (R-HOST-05). With no designated principal set or connected, `ask_fishball` answers `unavailable` at once and `message_fishball` queues (R-CON-09). |
| R-ROUTE-05 | A Hand over from the user makes the **designated Fishball principal** the session's managing principal (Q7, decided) and emits one `handover` event to that principal's mailbox (R-CON-11). Embed-UI's button names it ("Hand over to Fishball-2"). With none designated, the Hand over is refused with `no-fishball` and the session stays unmanaged. Take back clears the managing principal and emits one `takeback` event to it. |
| R-ROUTE-06 | When a managing principal is revoked or deleted, its managed sessions become unmanaged, each with one `system` note, and their live offers go to the user in their sessions (R-TOK-05). Changing the designated principal does not move already-managed sessions. |

### 3.4e The `fishball-events` stream (R-EVS; Q30 decided)

| ID | Requirement |
| --- | --- |
| R-EVS-01 | The connector exposes **one** event resource, `fishball-events` (URI `fishball://events`), which resolves to the caller's own pair's mailbox. There is no other event resource, and there are no per-kind streams or subscriptions. |
| R-EVS-02 | Every event carries a `type` from a fixed vocabulary: `permission`, `question`, `plan-review` (offers); `settlement`, `retirement` (the outcome or withdrawal of an offer); `turn-finished`, `state` (sent for **managed** sessions only, to their managing pair, R-WATCH; a `turn-finished` payload says whether the session is still running and whether anything is queued for it, so Fishball can tell finished work from a pause); `message` (`message_fishball`); `ask` (`ask_fishball`); `handover`, `takeback`; `notice` (connector notices); and `contributed:<namespace>.<event>` for contributor events (R-EXT-16). A client distinguishes kinds only by `type`. |
| R-EVS-03 | **Exactly one recipient per event; never broadcast.** The recipient is decided when the event is created: an event naming a managed session goes to that session's managing pair **as of that moment**; an event naming an unmanaged session, or no session, goes to the designated Fishball pair (R-ROUTE-04). Unmanaged sessions produce no `turn-finished` or `state` events at all (R-WATCH-02). Events that follow an earlier one go to the pair that received it: `settlement` and `retirement` to the pair that held the offer; `takeback` to the pair that managed the session until then. There is no watch exception (Q31, decided). With no recipient, the event follows the no-principal rules (R-CON-09), and a contributor `emit` returns `no-fishball`. |
| R-EVS-04 | An external agent's subscription receives its events unchanged, in order, with their `type`. The connector does no interception for it. |

### 3.4f Watching is managing (R-WATCH; Q31 decided)

| ID | Requirement |
| --- | --- |
| R-WATCH-01 | A pair **watches exactly the sessions it manages**. Watching starts when the pair becomes the managing pair (`session_start`, a Hand over to it, or a Q24 succession) and ends when it stops being it (`session_release`, Take back, revocation or deletion of its entry, R-ROUTE-06). Nothing else starts or ends a watch. |
| R-WATCH-02 | For every session it manages, the managing pair receives a `turn-finished` event at the end of every turn and a `state` event on every change of running or pending-interaction state, with no set-up. Unmanaged sessions produce neither event, for anyone. |
| R-WATCH-03 | There are **no** watch tools: `session_watch`, `session_unwatch` and `watches_list` are removed, and `session_start` / `session_message` have no `notifyWhenFinished` argument. A client that calls a removed tool gets the MCP "unknown tool" error. Watch notices of V2 are covered by `turn-finished`. |
| R-WATCH-04 | On a Q24 succession the watch moves with management: the successor receives the sessions' later events, and none is sent twice. On release or Take back, events already queued for the old pair stay with it; later ones are not produced for it. |
| R-WATCH-05 | **Watchdog and watching:** Watchdog supervises only sessions its Fishball manages, but it receives none of their `turn-finished` or `state` events: those all go to Fishball (R-WD-12). Watchdog gets session information only when its patrol reads the session itself (R-WD-14). |

### 3.4g Interception inside a Fishball DSH (R-INT; Q30 decided)

| ID | Requirement |
| --- | --- |
| R-INT-01 | `fishball-core` holds its pair's single `fishball-events` subscription and provides an **interception service** to plugins in the same Fishball DSH: `intercept({pluginId, types, filter?, priority?}, onEvent) → dispose`, with `priority` defaulting to 0. `types` lists the event types it wants; `filter` is an optional synchronous predicate over the event (for example "only sessions this plugin supervises"). |
| R-INT-02 | For each accepted event, core finds the registrations whose `types` include the event's type and whose `filter` returns true. If there is one, core hands the event to it and starts **no** Fishball LLM turn. If there is none, the event goes to the Fishball agent and may wake its LLM. |
| R-INT-03 | **Conflicts.** When more than one registration matches, exactly one gets the event: the highest `priority`; with equal priority, the earliest registration. The others don't see it. A plugin that registers with the same `types` and `priority` as an existing registration is accepted, but core logs one warning naming both plugins. |
| R-INT-04 | **Failure falls back to Fishball.** If the chosen interceptor's handler throws or rejects, or its plugin is off, down or not ready, or its registration is disposed while the event is in flight, the event goes to the Fishball agent, which is woken. An event is never lost and never handled twice. A filter that throws counts as "no match" for that registration. |
| R-INT-05 | An interceptor that cannot finish an event may hand it back with `release(event, {toFishball: true})`; Fishball is then woken for it (Watchdog's escalation to Fishball, R-WD-09). |
| R-INT-06 | Interceptors are local to the Fishball DSH and gain no authority at the connector: whatever they answer goes out through core's link as the Fishball principal, and the connector's first-commit rule (OQ-14) still applies. |
| R-INT-07 | **Watchdog's registration (Q13 decided; redefined by 1.14).** Watchdog registers exactly two filters: (1) `types: [permission]`, for permission requests of sessions this Watchdog supervises while it is healthy (X14); (2) `types: [settlement, retirement]`, for offers this Watchdog held or escalated to the user. For (2), Fishball gets the outcome only as a **non-waking** note at its next turn (R-WD-09). Watchdog registers for nothing else: `turn-finished`, `state`, questions, plan reviews, messages, asks, Hand over / Take back, notices and contributor events all reach Fishball. Its patrol is internal, driven by its own timer, and is not an interception (R-WD-14). When Watchdog is off or down, its registrations are gone or their filters are false, so everything reaches Fishball. |
| R-INT-08 | Core acks an event at the connector only after the receiving side (interceptor or Fishball) has durably accepted it (R-EVT-03). |

### 3.5 Events: DSH → Fishball (R-EVT)

| ID | Requirement |
| --- | --- |
| R-EVT-01 | Each event of R-EVS-02 is produced once, as one mailbox entry for its one recipient pair (R-EVS-03). |
| R-EVT-02 | An event carries a stable `eventId`, its `type` (R-EVS-02), its source session id, its correlation id (offer id for offers) and a bounded payload. A replayed event has **the same identity**. |
| R-EVT-03 | A Fishball DSH is woken by events: an event that `fishball-core` delivers to the Fishball agent (no interceptor, R-INT-02) while it is idle starts **exactly one** Fishball turn for it after durable acceptance, also across a lost ack and a restart of the Fishball DSH. Events an interceptor accepts (Watchdog included) start **no** Fishball turn (R-INT-02, R-WD-12). The once-only wake is still an open engineering gate from MCP-S2 (design §11). |
| R-EVT-04 | An external principal that subscribes gets a notification within the same event dispatch as the commit to its mailbox. One that does not subscribe sees the event on its next poll. |

### 3.6 The Fishball plugin set (R-FB)

These hold in **both** hosted and standalone mode.

| ID | Requirement |
| --- | --- |
| R-FB-01 | The Fishball plugin set is exactly four DSH plugins (Q2, decided): `fishball-core`, `fishball-board`, `fishball-fold-notify` and `fishball-watchdog`. A hosted child also has the instance's hosted-only bundle `fishball-hosted-settings` (R-HOST-11), which is not a set member. The library `fishball-shared` (R-ARCH-08) is a dependency of core, not a plugin and not a set member. Each is an ordinary bundle that DSH's native plugin management installs from its package. **The same package files** are used in hosted and standalone mode. `fishball-ui` is a component of `fishball-core`: it ships in core's package, loads with core and has **no** separate entry in DSH's plugin list, so it cannot be installed, enabled or removed apart from core. |
| R-FB-02 | Installing the set into an ordinary DSH and restarting it makes that DSH a Fishball DSH: one Fishball manager session; the A-lite Fishball-only page (sidebar, navigation and new-session entries hidden and not focusable, shortcuts remapped or unbound); effective read-only with the private Skills exception; no new sessions; the child-only `fishball-recommended` tab; slim settings. These guards come only from `fishball-core`'s plugin patch, in both modes (Q20, decided). |
| R-FB-03 | `fishball-core`'s native settings form names the **target** (standalone set-up is manual, Q8 decided): the URL of a connector MCP endpoint and a credential reference for its token. In hosted mode the instance supplies both (R-HOST-05) and the fields are read-only notes. In standalone mode the user fills them in. A blank target reports `target-unset`. |
| R-FB-04 | `fishball-core` connects to the target over MCP with OAuth client credentials (its fishball id and that token, R-OA, R-ID), and reports its name (R-NAME). When the target is unreachable or refuses the token, Fishball still runs, and its status shows `target-unreachable` or `token-refused`. It retries with bounded backoff and never sends the token to any origin other than the target's. A non-loopback target must be `https:`. |
| R-FB-05 | A remote target works with the same tool semantics as a local one: a Fishball DSH whose target is DSH B's connector manages **B's** sessions. |
| R-FB-06 | A feature plugin (board, fold-notify, Watchdog) installed without `fishball-core` does nothing beyond logging one `fishball-core-missing` line. It never fails the DSH's boot. |
| R-FB-07 | In standalone mode, when `fishball-watchdog` is enabled in the DSH's profile but has not registered with `fishball-core` by the time the app's ready signal fires (skipped as incompatible, or failed to load), Fishball is told **"watchdog is down"** once per DSH start. |
| R-FB-08 | The set's plugins never read, write or act on the sessions of a DSH other than their own Fishball DSH, except through the target connector's MCP. |
| R-FB-09 | The owner of a Fishball DSH may override any guard in their own profile (hosted or standalone alike). `fishball-core` then **keeps running** and reports `guards-overridden` in its status, naming each overridden guard. Restoring the guard clears the report at the next check (app ready or any settings change). No guard is re-applied, blocked or hidden by any other component. |
| R-FB-10 | Disabling `fishball-core` turns Fishball off in that DSH, with its guards. That is the owner's choice in both modes; in hosted mode the instance reports `fishball-off` and starts the child anyway. |

### 3.7 Hosted mode: what the instance adds (R-HOST)

| ID | Requirement |
| --- | --- |
| R-HOST-01 | **Launch.** The instance keeps one private child DSH under the host DSH (its own home and profile). At every child start it places the four plugins and the hosted settings bundle `fishball-hosted-settings` (R-HOST-11) from its own package into the child profile, before the profile loads (R-BND). Hosted mode adds only launch, placement, lifecycle, automatic token set-up, the child locator, model sync and the hosted-only settings sections (R-HOST-11); it adds **no guard** of its own (Q20, decided). |
| R-HOST-02 | **Lifecycle.** The child starts after the host's app ready signal, and can be stopped, restarted and retried. Crashes and failed starts show a status code. When the host DSH exits, the child stops. Uninstall cleanup removes the child runtime after offering the board archive export (R-BRD-02). |
| R-HOST-03 | Starting, stopping and restarting the child never changes the host DSH's settings, sessions, credentials or shortcuts. |
| R-HOST-04 | **Launch configuration only.** The instance's launch overlays carry only what a hosted child needs to run under its host: HMR off, the child's own web origin and port, the admission key for embed-UI's tickets, and the target URL. They carry **no** guard rows, force no plugin on, and do **not** carry the hosted-only settings sections, which are a placed bundle (R-HOST-11; TQ-R4, decided B). |
| R-HOST-05 | **Target and token (Q8, revised by 1.9).** The instance's native settings name the target (blank = a connector in the same host DSH) and a credential reference. **Same-DSH connector:** whenever the child needs to pair (it holds no paired credential), the instance asks the connector for a **new** token entry, "Fishball (hosted)", and the connector returns **only** its reference, never the value; the child authenticates with its own id and calls `pair`. A hosted child therefore never meets `already-paired`; if it does, the instance creates another new token. A child restart or reconnect reuses the paired token and id and creates nothing. Each such entry is visible and revocable like any other. **Remote target:** the user creates the token in that connector's settings and stores its value under the instance's reference. In every case the instance hands the target and the token value to the child **in memory only**: never written to disk in the child or the host, never in a process argument or environment variable another process can read. |
| R-HOST-06 | **Child locator.** The instance publishes a host-only service for embed-UI: child state and status code, the child web's own origin, a single-use admission ticket, Retry and the target status. It publishes nothing to browsers itself. |
| R-HOST-07 | **Model sync.** The hosted-mode provider and model sync from the host DSH into the child stays, started only from embed-UI's Plugins card (the V2 decision of 2026-11-11). Standalone mode has none: a standalone DSH has its own native model settings. |
| R-HOST-11 | **Hosted-only settings (TQ-R2, decided).** The user's words: "Core放通用设置，寄宿专用的由instance注入" (core holds the generic settings; the hosted-only ones are injected by the instance). `fishball-core`'s settings panel holds only the generic slim settings and offers a generic **settings-section extension point** that knows nothing about hosting. In a hosted child, the instance injects its hosted-only sections into that point as **one placed bundle**, `fishball-hosted-settings` (row id `fishball-hosted-settings`; TQ-R4, decided B). Its code is owned by the instance and ships inside the instance package; core never imports it. Rules: (1) **only the instance places it, only in a hosted child**; a standalone DSH never has it, and a standalone core looks and behaves exactly the same apart from its absence; (2) it is listed on the child's native Plugins page and the owner switches it on and off like a set member; it follows the placement rules of R-BND-02 (on at first placement, a disable survives restarts and upgrades, deleted while off is re-placed off) and R-BND-04 (effect at the next child restart, "restart required"), recorded in the same placement record as the set; (3) switched off, the hosted-only sections are simply absent from the settings panel: no error, no notice, no empty placeholder, and the generic settings work unchanged; the host side (embed-UI's status, Retry, model-sync trigger) is unaffected; (4) enabled but incompatible or failing to load, it **blocks the child's start** like an enabled set member (R-BND-03), with the status naming it; (5) `fishball-core`'s guards never disable it: it creates no sessions and is not on the guard list (R-FB-02, design §5a.2), and its id is not `fishball-instance`; core's `guards-overridden` check ignores it, and it is not reported as a missing or skipped set member (R-BND-05). With `fishball-core` disabled the sections have nowhere to appear and do nothing. The model-sync **trigger** is not among them: it stays on embed-UI's Plugins card in the host (R-HOST-07). |
| R-HOST-08 | The "watchdog is down" notice of a child that cannot start is kept by the instance and delivered to Fishball once the child next starts. |
| R-HOST-09 | **Reinstall succession (Q24, decided).** When the child loses its identity (child home removed or reinstalled), the instance creates a new hosted token and the new child pairs with a new id. As soon as that pairing succeeds, the instance asks the connector to make the new principal the **successor** of the previous hosted entry it created (only an entry the instance itself created, never a user-made one). In one atomic step the connector: moves every session the old principal managed to the new one; moves the designated-Fishball role if the old one held it; gives the new principal the old one's name; re-issues the old principal's live offers into the new principal's mailbox with **new offer ids**, so an answer to an old id fails `expired`; moves its pending events, keeping their `eventId`s; then deletes the old entry (and its generated credential value). Each moved session gets exactly **one** `system` note naming the new principal. If the step fails, nothing moves, the old entry stays, and the instance retries at its next start. |
| R-HOST-10 | **User revocation.** When the user disables a hosted entry, the instance never creates a replacement on its own: the child reports `token-revoked`, and re-enabling restores it. When the user **deletes** the hosted entry, its sessions become unmanaged (R-ROUTE-06), and the instance creates a new hosted token only after the user presses Retry in embed-UI. Succession (R-HOST-09) applies only to a reinstall, never to a user's delete. |

### 3.8 Embed-UI (R-UI)

| ID | Requirement |
| --- | --- |
| R-UI-01 | Embed-UI's **Fishball page** works only with a hosted instance in the same DSH. It finds the child **only** through the instance's child locator (R-HOST-06). Without it (instance absent, disabled or older), embed-UI registers no frame and logs one `instance-missing` diagnostic. With a connector but no instance it still provides marks, Hand over / Take back, the fish and its dots, and its contributed tools (R-UI-08). With neither, it does nothing. |
| R-UI-02 | With the instance present, embed-UI shows the Fishball sidebar entry. Opening it frames the child's native page at the child's own origin, through a single-use admission ticket. No credential is placed in the frame URL. |
| R-UI-03 | Embed-UI shows the child status and Retry outside the cross-origin frame. It never shows a token. |
| R-UI-04 | With a connector in the same DSH, embed-UI contributes its notification tools through the connector's contribution service (R-EXT-13) under its own namespace. It owns the attention latch (fish and dots). It registers no MCP server or HTTP endpoint of its own. |
| R-UI-05 | **Marks and Hand over (Q3, decided).** With a connector in the same DSH, embed-UI draws managed-session marks (each showing its managing principal's **name**) and the Hand over / Take back buttons. Clicking one makes embed-UI call the connector's host-only hand-over service in-process; the connector then emits the event to the target principal (R-CON-11, R-ROUTE-05). Embed-UI learns marks and names from the same service and refreshes when it reports a change. This works with or without an instance (R-UI-08). |
| R-UI-06 | Embed-UI stores no secret. Its settings, if any, use DSH's native form. |
| R-UI-07 | Embed-UI never frames a standalone Fishball. A standalone Fishball's own DSH web is its Fishball page. |
| R-UI-08 | **Connector without instance (Q18, decided).** In a DSH with a connector but no hosted instance, embed-UI shows the managed marks with principal names, the Hand over / Take back buttons (naming the designated Fishball), and the sidebar fish with its attention dots, and it contributes its attention tools (R-EXT-13). It shows **no** Fishball page and no frame, and its fish has no page to open. With neither a connector nor an instance in the DSH, embed-UI registers nothing and does nothing. |
| R-UI-09 | **Instance with a remote target, no connector here (Q4, decided).** Embed-UI shows the Fishball page, status and Retry as usual. It shows **no** attention dots, managed marks or Hand over / Take back in this DSH, and contributes no tools here. Fishball's attention signal lights no fish in **this** DSH. Fold-notify's call goes to the remote connector: it lights the remote DSH's fish if that DSH runs embed-UI, else it gets `unsupported-operation` (D3). There is **no** private relay over the instance's lifecycle wire; every Fishball ↔ DSH path stays MCP. Hand over for the remote DSH's sessions happens in the remote DSH (R-UI-08). |

### 3.9 Remote DSH (R-REM)

| ID | Requirement |
| --- | --- |
| R-REM-01 | **Listener (Q9, decided).** The MCP endpoint (`/api/fishball/mcp`), the OAuth metadata and the token endpoint are routes on **DSH's own web listener**. There is no separate port, listener or TLS setting. Their reach follows the user's existing DSH web configuration, so they are loopback-only unless the user has exposed DSH's web listener. |
| R-REM-02 | A non-loopback endpoint is served over TLS. Plain HTTP on a non-loopback address is refused at load, with a diagnostic. A user-run tunnel to a loopback endpoint is the supported alternative. |
| R-REM-03 | The endpoint validates `Origin` on every request. A present Origin outside the allowlist gets **HTTP 403** (MCP Streamable HTTP security requirement). |
| R-REM-04 | Losing the remote connection never stops managed sessions on the remote DSH. Delegated items for an unreachable principal wait, per R-CON-05. |

### 3.10 Watchdog (R-WD)

| ID | Requirement |
| --- | --- |
| R-WD-00 | **Watchdog is Fishball's helper, like a subagent of Fishball (Q10, decided).** It acts only on sessions its Fishball manages, only on Fishball's behalf, and never as a principal of its own. Everything Watchdog does at the connector is done as Fishball. |
| R-WD-01 | Watchdog runs only in a Fishball DSH (hosted child or standalone), and only with `fishball-core` present. No Watchdog code, settings or UI runs in a host or main DSH. |
| R-WD-02 | **Revised by 1.8 item 4 and Q30.** Watchdog opens **no** subscription of its own. `fishball-core` holds the one `fishball-events` subscription of its principal, and Watchdog receives its events as an **interceptor** (R-INT-07), without a Fishball LLM turn. Watchdog has no token, principal or lane of its own. Revoking Fishball's token cuts Watchdog off with it. |
| R-WD-03 | **Watchdog is activated in exactly two cases (1.14; Q33 decided):** (1) a permission request of a session it supervises that needs judging (R-INT-07); (2) its own patrol timer firing for a supervised session (R-WD-04, R-WD-14). Nothing else activates it: no session event, question, message, contributor event, or request from Fishball. There is no `check_now` tool, and no Fishball operation starts a Watchdog run (Q33: Watchdog is assigned passively). |
| R-WD-04 | Patrol checks of one session are exactly one per `minCheckIntervalSeconds`, at least that far apart: default **1740** (29 min), integer, inclusive range **60–86400**. At the bounds, 60 and 86400 are accepted and 59 and 86401 are refused. A patrol fires once per interval per supervised session, whether or not the session produced anything new. Permission requests are never delayed or throttled by the interval. |
| R-WD-05 | There are no approval timers, no hourly or daily call caps, no stall, idle or paused-poll timers and no per-brief schedule overrides. The hung-check timeout and the bounded start attachment carried over from T0 are failure bounds, not pacing. |
| R-WD-06 | Watchdog's model follows DSH's native session behaviour: a model change applies at the next not-yet-prepared model step. Saving settings performs no model lookup. |
| R-WD-07 | Any Watchdog failure (load, readiness, loss of its interception registration, model or provider error, budget, store, claim, attach, runtime) makes Watchdog **effective off** at once. Its claims are released, pending items go to Fishball, sends pass, and stale callbacks are fenced. Fishball is told **"watchdog is down"**: one notice each time Watchdog goes down, including with zero supervised sessions and when the Fishball DSH could not load it (R-FB-07, R-HOST-08). A failure never stops or restarts a watched session. |
| R-WD-08 | Watchdog sends its requests to Fishball (escalations, "watchdog is down", reports) **through DSH's in-session communication inside the Fishball DSH**, not through the connector or MCP. |
| R-WD-09 | **Decision rules (Q13, decided).** For a permission request of a session it supervises, Watchdog decides exactly one of: (1) **allow**: in scope and low risk; (2) **reject**, with a justification: beyond the task **and** dangerous; (3) **to the user**: any other high-risk request; it is committed as `escalate`, so the connector shows a user card in that session with no time limit, and **no Fishball turn** starts; (4) **to Fishball**: a request that is not high-risk but that Watchdog cannot decide; it is re-routed to Fishball, which is woken. When the user settles a card from (3), Fishball gets the outcome as a non-waking note in its context at its next turn; Watchdog gets it at once. Questions and plan reviews always go to Fishball, never to Watchdog (U21). While Watchdog is off or down, everything goes to Fishball (R-WD-07). |
| R-WD-10 | Pausing supervision of a session stops that session first. A failed stop is reported and not recorded as paused. |
| R-WD-11 | One Watchdog side session supervises one session (U8). Permission requests of a claimed session go to Watchdog only while it is healthy. Without a claim, they go to Fishball. |
| R-WD-12 | **Routing (redefined by 1.14; replaces Q25's split).** For a session supervised by a healthy Watchdog, **only its permission requests** go to Watchdog (R-INT-07), and they start no Fishball LLM turn. Every other event of that session (every `turn-finished`, mid-work or idle; `state`; questions and plan reviews; `message_fishball`, `ask_fishball`; Hand over / Take back) goes to Fishball, as do all events of unsupervised sessions and everything while Watchdog is off or down. A Watchdog **escalation to Fishball** (only for a request that is not high-risk and that Watchdog cannot decide, R-WD-09) sends the request back to Fishball, which is woken for it. A high-risk request goes to the **user** instead, with no Fishball turn (Q13). |
| R-WD-13 | *Withdrawn (1.14).* The idle-stop bypass is no longer needed: no `turn-finished` event reaches Watchdog. The ID stays reserved so earlier references remain traceable. |
| R-WD-14 | **Patrol reads the session itself (1.14).** When the patrol timer fires for a supervised session, Watchdog reads what it needs through `fishball-core`'s link with its own operation list: `sessions_list` for that session's running and pending-interaction state, and `session_read` for the messages since its last patrol watermark, bounded by its read limits. It needs no `turn-finished` or `state` events. A patrol that finds a problem reaches Fishball only through Watchdog's usual escalation or report (R-WD-08, R-WD-09); a patrol that finds nothing wakes nobody. A failed read is a Watchdog failure (R-WD-07). |
| R-WD-15 | **Brief changes start no run (Q33 decided).** Fishball keeps `watchdog_brief` (the brief given at start or hand-over, U2) and `watchdog_refine` (update a supervised session's brief or criteria), as data operations only. A refine is stored at once and returns immediately; it starts no check, side-session turn or model call. Watchdog uses the latest brief at its next activation (the next permission judgement or patrol of that session). A refine never moves the patrol timer. There is no `watchdog_check_now`. `watchdog_pause` and `watchdog_resume` keep their existing meaning (pause stops the session first, R-WD-10) and also start no Watchdog run. |

### 3.11 Placement, board and fold-notify (R-BND, R-BRD, R-FN)

| ID | Requirement |
| --- | --- |
| R-BND-01 | **Hosted mode:** the whole Fishball plugin set, and the hosted settings bundle `fishball-hosted-settings` (R-HOST-11), ship inside the `fishball-instance` package. On every child boot they are copied into the child profile before the profile loads, with `fishball-shared` beside them as core's dependency. **Strict (TQ-R3, decided B):** the host DSH never resolves, lists or loads these plugins, **nor any module from them**: no host file imports or requires a module of the set or of `fishball-hosted-settings`; the instance only copies their files as data. What the instance host shares with the child comes from `fishball-shared` (R-ARCH-08). |
| R-BND-02 | **Hosted mode:** the first placement turns each of the four plugins, and `fishball-hosted-settings`, on. A later disable survives restarts and instance upgrades. A plugin deleted while off is placed again **off**. This applies to `fishball-core` as to the features (R-FB-10). |
| R-BND-03 | **Hosted mode:** an enabled set member, or an enabled `fishball-hosted-settings`, that is incompatible with the running DSH (or fails to load) **blocks the child's start**. The status names the plugin and the reason. |
| R-BND-04 | **Hosted mode:** switching a feature plugin or `fishball-hosted-settings` on or off takes effect at the next child restart. The UI says "restart required", never "live". |
| R-BND-05 | **Standalone mode:** the user installs, enables, disables and removes set members with DSH's native plugin management, and DSH's own rules apply (for example, DSH skips an incompatible bundle at boot rather than failing). `fishball-core` reports a missing or skipped member in its status. |
| R-BRD-01 | Board records are never deleted while installed. A done item stays visible for **30 days** unless cleared early, and stays archived after that. `board_search` finds archived items by keyword. |
| R-BRD-02 | Removal offers an archive export before deleting board data: the instance's uninstall in hosted mode (Q-S = A). In standalone mode DSH's native remove has no hook, so `board_export` is a manager tool and the README tells the user to run it before removing (design §8.3). |
| R-FN-01 | Fold-notify batches Fishball's inbox notices as designed. It sets the attention latch only through embed-UI's contributed attention tool, over MCP. With that tool absent (the target connector's DSH runs no embed-UI), its attention call is refused `unsupported-operation` and nothing else changes, as D3 already requires. |

### 3.12 Migration (R-MIG)

| ID | Requirement |
| --- | --- |
| R-MIG-01 | A V2 user who upgrades the connector and the instance and installs embed-UI ends up with a working Fishball page and session list. Fishball's child history, Skills and child settings are kept. |
| R-MIG-02 | The first V3 child start converts the V2 instance-owned rows into the plugin set: all four set members and `fishball-hosted-settings` are placed, core on, the three feature plugins and the hosted settings bundle on at first placement. Nothing in the child's history is lost. |
| R-MIG-03 | Mixed versions fail visibly before any delegation, with no compatibility shim: a V3 `fishball-core` against a V2 connector gets 404 on the MCP route and reports `TARGET_INCOMPATIBLE`; a V2 instance against a V3 connector finds no `fishballConnector` service and reports `connector-upgrade-required`. |
| R-MIG-04 | V2 connector settings that V3 still uses keep their values. Settings V3 dropped are ignored, never re-rendered (D2 rule). |
| R-MIG-05 | A V2 user's first V3 start, with the connector and the instance in one DSH, leaves them a usable token without a manual step (R-HOST-05). |

### 3.13 Compatibility and security (R-COMPAT, R-SEC)

| ID | Requirement |
| --- | --- |
| R-COMPAT-01 | All V3 packages, including every member of the Fishball plugin set, work on DSH **0.2.1-rc.5** and **0.2.2-rc.1**, verified separately on each and in both modes, with no version-specific behaviour visible to the user. |
| R-SEC-01 | In a main DSH, the connector is the only Fishball component with **Fishball authority** over its sessions. The instance and embed-UI hold none (R-ARCH-05). Other plugins keep their own ordinary DSH authority and gain none from Fishball (Q1, Q14). |
| R-SEC-02 | No component logs a token, a credential value, an admission ticket or the `Authorization` header. A test that greps every log, lifecycle file, child home and temp directory after a full run finds none. |
| R-SEC-03 | The MCP endpoint applies body, frame, backlog and in-flight limits below the transport codec. Limit refusals are structured. |
| R-SEC-04 | A contributor runs in the connector's DSH process with its own DSH authority and can only emit events, expose tools and accept their calls (R-EXT-11). Installing a contributor is the user's decision, the same as installing any DSH plugin. The connector never widens a contributor's authority, and contributors never receive a token, credential, mailbox, offer or another principal's data (R-EXT-10, Q14 decided). |

## 4. Install matrix

C = connector, I = instance, U = embed-UI, F = the Fishball plugin set (installed by hand, that is
standalone). The default instance target is a connector in the same DSH (R-HOST-05).

| # | Installed in one DSH | What works | What does not |
| --- | --- | --- | --- |
| 1 | none | An ordinary DSH. | — |
| 2 | **C** | The MCP endpoint. External agents with a token control sessions and handle delegated approvals and questions. `message_fishball` / `ask_fishball` route to a connected principal, or answer `unavailable`. | No Fishball, no UI. |
| 3 | **U** | Nothing. Embed-UI is inert and logs `instance-missing`. | Everything. |
| 4 | **I**, target blank | The hosted child starts and Fishball runs in it. | No connector to reach: `target-unreachable`. No UI path to Fishball. |
| 4r | **I**, remote target | Hosted Fishball manages the remote DSH's sessions over MCP (manual token, R-HOST-05). | No UI path to Fishball. |
| 5 | **C + I** | Hosted Fishball manages this DSH's sessions over MCP, with the token set up automatically (R-HOST-05). External agents work too. | No UI path to Fishball (headless). |
| 6 | **C + U** | Row 2. No Fishball page (no instance). Embed-UI still shows (R-UI-08) managed marks and Hand over / Take back for the principals connected to this connector, by name, plus the fish with its attention dots, and it contributes its attention tools. | No Fishball page. |
| 7 | **I + U**, remote target | The Fishball page here (frame, status, Retry). Fishball manages the remote DSH. | No local dots, marks or Hand over (no local connector), and no relay (R-UI-09). |
| 7b | **I + U**, target blank | The Fishball page works. Fishball reports `target-unreachable`. | No sessions to manage. |
| 8 | **C + I + U** | Everything: page, dots, marks and Hand over (Q3), approvals, Watchdog, board, fold-notify, embed-UI's contributed tools. | — |
| 8r | row 8 plus external agents with their own tokens | The same, with several principals: each managed session has one managing principal; unmanaged-session calls and Hand over go to the designated Fishball (R-ROUTE). | — |
| 9 | **F** (standalone), target = a connector elsewhere | This DSH **is** Fishball: its own web UI is the Fishball page, with the same guards as a hosted child (overridable and reported, R-FB-09). Fishball manages the target DSH's sessions over MCP (manual token, R-FB-03). Watchdog, board and fold-notify work if installed. | No dots in this DSH. Hand over to it from the target DSH needs embed-UI there (row 6 or 8). |
| 9b | **F**, target blank | Fishball runs, `target-unset`. | No sessions to manage. |
| 10 | **F + U** or **F + I** | The standalone Fishball as in row 9. U without I is inert; I inside a Fishball DSH would try to launch a nested child, which the guards forbid (core's `fishball-ui` component disables the `fishball-instance` row in a Fishball DSH, design §5a.2). | No nested Fishball. |
| 11 | **F + C** in one DSH | Not a supported combination: the Fishball guards forbid new sessions, so the connector has nothing useful to expose. No checks are promised. | — |
| 12 | a main DSH with C, used by a hosted Fishball (row 5/8) **and** a standalone Fishball (row 9) | Two Fishball principals, shown as "Fishball" and "Fishball-2" unless renamed; names are unique, so a clashing rename is refused (R-NAME-02). Routing follows R-ROUTE: each manages the sessions it started; one is the designated Fishball for unmanaged sessions and Hand over (R-ROUTE). | — |
| 13 | **F** installed partly (feature plugins without core) | Nothing; each logs `fishball-core-missing` (R-FB-06). | — |
| 13b | `fishball-core` alone (no feature plugins) | A full Fishball DSH: manager, page and guards, MCP link. Board, fold-notify and Watchdog are simply absent. | — |
| 14 | any Fishball DSH (hosted or standalone) whose owner overrode a guard | Fishball keeps running with status `guards-overridden`, naming the guard (R-FB-09). | The overridden guard's protection. |
| 15 | hosted child with `fishball-core` disabled by the owner | The child starts; the instance and embed-UI show `fishball-off`. | Fishball. |

Watchdog, the board and fold-notify exist only in a Fishball DSH.

### 4.1 Authentication and pairing outcomes (R-OA, R-ID)

| At the token endpoint: token | client id | Result |
| --- | --- | --- |
| unknown, disabled, revoked | any | `invalid_client` (401); nothing about pairs revealed |
| valid | invalid | `invalid_client` |
| valid, unbound | valid | pair-only access token, `fishball_pairing: unpaired` |
| valid, bound to X | X | full access token, `fishball_pairing: paired` (normal use, reconnect, "skip pairing") |
| valid, bound to X | Y ≠ X | pair-only access token, `fishball_pairing: id-mismatch` |

| At the MCP endpoint: access token | Call | Result |
| --- | --- | --- |
| missing, expired, revoked, foreign audience | any | HTTP 401 with `WWW-Authenticate` |
| pair-only, unbound | `pair` | **pairs**; the same access token is now full |
| pair-only, unbound | other tool, subscription | `not-paired` |
| pair-only, bound to another id | `pair` | `already-paired`, `idMatches: false` |
| pair-only, bound to another id | other tool, subscription | `id-mismatch` |
| full (bound, same id) | `pair` | `already-paired`, `idMatches: true` |
| full | any other call | proceeds |

| Hosted child | Result |
| --- | --- |
| no paired credential | the instance creates a **new** hosted token; the child authenticates and calls `pair` (R-HOST-05) |
| restart or reconnect | requests a new access token with its token and id; no `pair` call |
| entry disabled by the user | `token-revoked`; no automatic replacement (R-HOST-10) |

### 4.2 Tool and event contributions in the matrix

X = any other DSH plugin that contributes tools through the connector (R-EXT). Contributions are
registered in **the connector's DSH**.

| # | Installed in the connector's DSH | Contributed tools in `tools/list` | Who can use them |
| --- | --- | --- | --- |
| E1 | C only | none | — |
| E2 | C + X | X's tools; X's events reach their recipient's mailbox | every token holder; every Fishball's model sees them (R-EXT-14) |
| E3 | C + I + U | embed-UI's notification tools (`attention`) | Fishball's fold-notify and any principal; the latch drives embed-UI's fish and dots |
| E4 | C + U, no I | embed-UI's attention tools (R-UI-08) | connected principals |
| E5 | C + I + U + X | embed-UI's and X's tools | as E2 and E3 |
| E6 | I + U here, remote connector (row 7) | the **remote** connector's contributions only. The local embed-UI has no local connector to contribute to | the hosted Fishball, against the remote connector |
| E7 | X only, no C | none; X's optional inject never activates | — |
| E8 | a standalone Fishball DSH (row 9) | none from that DSH: it has no connector. Its Fishball sees the **target** connector's contributions | Fishball (all of them, R-EXT-14) |

Contributed tools disappear when their contributor goes (R-EXT-04). They never outlive it.

## 5. Out of scope for V3

- Reverse MCP (the connector calling an agent's MCP server), callback URLs, agent-hosted servers.
- Interactive OAuth flows (authorization code, consent pages), dynamic client registration,
  Client ID Metadata Documents and external authorization servers. V3's connector is its own
  client-credentials-only authorization server (R-OA).
- MCP sampling, elicitation, roots, logging, and the Tasks and Apps extensions as control or
  answer paths.
- A custom settings UI for tokens or the connector; a UI that reveals a token value; a pairing UI in the connector or host DSH (the
  Fishball page's `already-paired` warning, R-ID-07, is in scope).
- Per-token permission scopes (Q6, decided: none).
- Contributed MCP **resources** or prompts from other plugins. V3 contributions are tools and
  events only (Q14 and Q19, decided).
- Contributions from outside the connector's own DSH process (a remote plugin, a proxied external
  MCP server, a plugin inside a Fishball DSH).
- Sandboxing a contributor's code beyond DSH's own plugin model. Containment is per call
  (R-EXT-08), not process isolation.
- Embed-UI framing a standalone Fishball, or any Fishball DSH it did not launch.
- Detecting an agent that impersonates a paired agent with the same token and id (R-ID-11).
- Unpairing a token; a new agent always needs a new token (R-ID-09).
- A Fishball DSH that also runs a connector (matrix row 11), and nested hosted Fishballs.
- Hosted-mode model sync for standalone Fishball.
- Serving MCP clients of revision 2025-11-25 or older (Q12, decided): they must upgrade.
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
| Instance-owned child overlay rows (app, session tools, approvals, inbox, admin, provider-sync target, native web, `fishball-page`), the `LITE` guard overlays, and the child web modules (`child-web/`: page, recommended tab, settings) | **Repackaged** into `fishball-core` (guards in its plugin patch, Q20). The instance keeps only launch configuration, placement, lifecycle, token hand-off, the locator and model sync. |
| Child snapshot copy of `node_modules/fishball-connector/contract` | **Retired.** `fishball-core` carries the MCP schema module. |
| Decision 1a = A: custom authenticated first-party push / wake channel | **Retired** (Q11, decided): MCP subscriptions plus the durable mailbox, for every client. |
| Custom 2.0 contract draft | Stays parked as history. |
| X12 `bridge(pluginId, ops)` scoped connector client | Kept inside `fishball-core`, now over the MCP link. |
| X15 claims and X19 send gate | Kept inside `fishball-core`. Watchdog feeds them, and its interception filter consults them. |
| X9 `inbox.claim` (V2 extension point) | **Generalised** into the interception service (R-INT). |
| V2 watches (`session.watch` / `watches` / `unwatch`, `notifyWhenFinished`, `watch.status`, `WATCH_*` vocabularies) | **Retired** (Q31): a pair watches exactly the sessions it manages (R-WATCH). |
| Connector lanes, Watchdog's own subscription, per-kind resources (earlier V3 drafts) | **Dropped** (1.8 item 4, Q30): one `fishball-events` subscription per pair; Watchdog is an interceptor in core. |
| V2 "one attached instance" identity | **Replaced** by token + fishball id pairs, OAuth access tokens and user-visible names (R-OA, R-ID, R-NAME). |
| The earlier V3 draft's "static bearer tokens, no OAuth" (§5.6 of the design) | **Replaced** by the connector as its own client-credentials authorization server (1.10). |
| V2 "ships no bundled plugins" rule; the removal of the Remove-hiding list | Reversed for the child: the whole set ships bundled in hosted mode (R-BND). The Remove-hiding of Q-K = B is **not** revived: hosted and standalone show the same native Plugins page (Q20); a removed plugin is re-placed at the next start, off if it was off. |

## 7. Open questions for the user

Fishball asks these one at a time. Each gives the background, the options, the recommendation
and its reason. Numbers are stable across revisions; decided questions stay here as a record.

**Remaining:** none. All questions are decided. Test-planning questions found later are recorded in `docs/test-design/v3/questions.md`; decided ones are folded into this file (TQ-1: R-ID-02, R-OA-10, R-ID-10; TQ-2: R-TOK-05; TQ-3: R-OA-05; TQ-4: R-TOK-08; TQ-5: R-OA-05, R-TOK-05).

**Q1. What may run in the main DSH? — DECIDED 2026-11-11.**
The user's answer is quoted in 1.3. The main DSH is a full DSH and may install any plugin; the
connector is what exposes it to agents. The instance only launches a hosted child and cannot read
or write the host's sessions. Embed-UI is a UI to reach the instance plus utility tools for the
connector. Fishball itself is a set of DSH plugins, which also makes standalone Fishball possible.
The former options (A: only the connector holds session authority; B: main DSH runs only the
connector; C: standalone launcher) are closed; the answer goes beyond A.

**Q2. How is the Fishball plugin set packaged? — DECIDED 2026-11-11.**
The user's answer is quoted in 1.4: option A, with `fishball-lite` renamed `fishball-ui` and
folded into `fishball-core` as a component, so the set is **four** plugins: core (with ui),
board, fold-notify and Watchdog. The features require core. The former options B (one plugin)
and C (core without lite) are closed. `lite-missing` no longer exists.

**Q20. How strictly are Fishball's guards enforced in each mode? — DECIDED 2026-11-11.**
The user's answer is quoted in 1.5. Hosted and standalone are the same plugins with the same
guard mechanism: the guards come only from `fishball-core`'s plugin patch, and the owner may
override them in either mode. That is accepted. On reporting, the user chose A: `fishball-core`
detects an override and reports `guards-overridden`, the same in both modes, and keeps running.
The hosted-only enforcement overlays of the former option A are withdrawn. The former B (refuse
to run) and C (no guards in standalone) are closed.

**Q7. With several principals connected, who gets what? — DECIDED 2026-11-11: A.**
Each managed session has exactly one managing principal (the one that started it or received the
Hand over), and its requests and questions go only there. Unmanaged sessions'
`message_fishball` / `ask_fishball` and Hand over go to one designated Fishball principal, a
connector setting that defaults to the hosted Fishball. Now R-ROUTE-01–06. Options B (broadcast)
and C (one principal at a time) are closed.

**Q5. How does the user create a token without a custom UI? — DECIDED 2026-11-11: A.**
A token is a settings entry with a label, an `enabled` switch and a credential reference. The
connector generates a high-entropy value into DSH's credential store when the reference has no
value. The user copies it from there, or sets their own value. Disabling or deleting the entry
revokes it. Now R-TOK-08/09. Options B (user always supplies) and C (show-once view) are closed.

**Q8. Tokens in hosted and standalone mode — DECIDED 2026-11-11: A.**
When the instance and the connector share a DSH, set-up is automatic: the connector creates a
"Fishball (hosted)" entry and returns only its reference, and the instance hands the value to
the child in memory. The entry is visible and revocable. (Revised by 1.9: a new hosted entry per
pairing.) For a remote target and for standalone,
set-up is manual. Now R-HOST-05 and R-FB-03. Options B (manual everywhere) and C (pairing code)
are closed.

**Q10. Watchdog's MCP identity — DECIDED 2026-11-11: A; revised by 1.8 item 4.**
The user's words are quoted in 1.7: Watchdog is Fishball's little helper, like Fishball's
subagent, part of Fishball's principal under the Fishball DSH's token (R-WD-00). The later
answer in 1.8 changes the delivery: Watchdog opens **no** subscription or lane of its own.
`fishball-core` holds the one subscription, and Watchdog intercepts its events (R-INT-07)
without a Fishball LLM turn (R-WD-02, R-WD-12). Option B (its own token and principal) is
closed.

**Q3. Do main-session marks and Hand over / Take back stay? — DECIDED 2026-11-11.**
The user's answer is quoted in 1.8: they stay. The connector keeps only the hand-over events and
tools used to contact Fishball, with no UI. Embed-UI provides the buttons and marks; clicking
one makes embed-UI drive the connector (in-process, same DSH), which emits the event to the
target Fishball (R-CON-11, R-UI-05, R-ROUTE-05). Options B (through MCP with a UI token) and C
(drop them) are closed.

**Q4. Embed-UI when the instance targets a remote connector — DECIDED 2026-11-11: A.**
Allowed: the page, status and Retry work, but there are no dots, marks or Hand over in this DSH,
and there is no private relay. Now R-UI-09. Options B (inert without a local connector) and C
(dots relayed over the private wire) are closed.

**Q18. What does embed-UI do in a DSH with a connector but no instance? — DECIDED 2026-11-11: A.**
Embed-UI still provides the marks, Hand over / Take back, the fish and its dots, and its
contributed tools, with no Fishball page. With neither a connector nor an instance, it does
nothing. Now R-UI-08. Option B (needs the instance for everything) is closed.

**Q14. What may a contributed tool do? — DECIDED 2026-11-11: A, with a precise scope.**
The user's words are quoted in 1.10: a contributor lives only on the DSH side and can only emit
events to Fishball, expose tools, and accept calls to them from Fishball. Now R-EXT-11 and
R-EXT-16–20. Options B (notification-type tools only) and C (declared capabilities) are closed.

**Q16. Can the user switch off one contributor's tools and events without disabling its plugin? — DECIDED 2026-11-11: B.**
No. There is no per-contributor switch, and the connector's settings have no per-contributor
rows. To stop a contributor's tools and events, the user disables the contributor plugin. A
quarantine lifts when the plugin is disabled and re-enabled, or reloaded. Now R-EXT-09, R-EXT-15,
R-EXT-19. Options A (switch, default on) and C (switch, default off) are closed.

**Q6. Do tokens have scopes? — DECIDED 2026-11-11: A.**
No. Every token has full manager rights, and revocation is the only per-token control. Now
R-TOK-10. Option B (scopes such as `control` and `delegate`) is closed.

**Q15. Can the user hide a contributor's tools from some tokens? — DECIDED 2026-11-11: A.**
No per-token filtering. Exposure is controlled by installing or enabling the contributor plugin,
with no allowlist for Fishball's model either (Q17, decided). Now R-EXT-05. Option B (an allowed-namespaces list
per token) is closed.

**Q17. Does Fishball offer every contributed tool to its model? — DECIDED 2026-11-11: B.**
Yes. There is no allowlist: Fishball's model sees every contributed tool, and contributor events
reach Fishball too (unless a plugin in the Fishball DSH intercepts their type, R-EXT-20). The only control is installing or enabling the contributor plugin. The
prompt-size cost is a documented note, not a setting. Now R-EXT-14. Options A (allowlist) and C
(none offered) are closed.

**Q19. Contributions: tools only, or resources and events too? — DECIDED 2026-11-11 by Q14.**
Contributions are tools **and events** (the user's Q14 answer). Resources are not part of V3.

**Q11. Retire the custom first-party push (decision 1a = A)? — DECIDED 2026-11-11: A.**
Yes. Every Fishball DSH, like every client, gets events through the MCP subscription plus the
durable mailbox; the first-party extra lives only inside `fishball-core` (durable acceptance and
wake). Option B (keep a custom push) is closed.

**Q9. Where does the MCP endpoint listen? — DECIDED 2026-11-11: A.**
A route on DSH's own web listener (`/api/fishball/mcp`), with the OAuth endpoints on the same
listener, and no separate port. Exposure, TLS and remote reach follow the user's DSH web
configuration. Now R-REM-01. Option B (a separate connector listener) is closed.

**Q12. Which MCP protocol revisions does the endpoint serve? — DECIDED 2026-11-11: B.**
Only MCP 2026-07-28; no dual-era 2025-11-25 support. Clients on older revisions must upgrade.
Now R-CON-01. Option A (dual-era) is closed.

**Q13. Where do "other high-risk items" go? — DECIDED 2026-11-11: A.**
Straight to a user card in the session, with no Fishball turn; Fishball sees the settled outcome
as a non-waking note. Q25's "escalations go back to Fishball" applies only to items that are not
high-risk and that Watchdog can't decide, and to everything while Watchdog is down. Now R-WD-09,
R-WD-12. Option B (to Fishball first) is closed.

**Q27. Access-token lifetime, refresh tokens and rotation — DECIDED 2026-11-11: A.**
Access tokens last 1 hour; there are no refresh tokens. On expiry or a 401 the client logs in
again with id + token. Now R-OA-07. Options B (15-minute tokens with rotating refresh tokens)
and C (another lifetime) are closed.

**Q28. Clients that cannot do OAuth at all — DECIDED 2026-11-11: A.**
The user's answer: "行，就A，我也想不到更好的主意了". OAuth is required by default; each token entry
has a direct-access fallback switch, off by default, and with it on `Bearer <id>.<token>` is
accepted and checked on every request. Now R-OA-10. Options B (no fallback) and C (always
accept) are closed.

**Q24. What happens to an old hosted pair when the child is reinstalled? — DECIDED 2026-11-11: A.**
The new hosted principal takes over automatically: the old entry's managed sessions,
designated role and name move to it, its live offers are re-issued with new ids, then the old
entry is deleted and each managed session gets one note. Now R-HOST-09. Options B (keep the
old entry) and C (ask first) are closed.

**Q22. How are default names numbered? — DECIDED 2026-11-11: A.**
Per connector, in pairing order, taking the lowest free name ("Fishball", "Fishball-2", …);
freed numbers are reused. Now R-NAME-04. Options B (token-creation order) and C (counter
without reuse) are closed.

**Q23. Name collisions and external agents' names — DECIDED 2026-11-11: B.**
Names must be unique per connector; a clash is refused with `name-taken`. Consequences: defaults
skip taken names (R-NAME-04); a clashing name at `pair` still pairs, with a default name and the
refusal reported (R-NAME-06); `set_name` clashes return `name-taken`, which Fishball's UI shows
(R-NAME-02/03); a successor inherits the old name (R-NAME-07). Uniqueness is case-insensitive
after trimming and whitespace collapsing. External agents follow the same rules and the same
default series. Options A (non-unique, disambiguated labels) and C (a separate "Agent" series)
are closed.

**Q21 and Q26: not asked.** Q21 (how the id is carried) is answered by the OAuth decision: the id
is the OAuth client id. Q26 (whom Hand over targets) was withdrawn before it was asked, because
Q7's designated Fishball already decides it (R-ROUTE-05).

**Q25. Which events wake Fishball's LLM, and which go only to Watchdog? — DECIDED 2026-11-11: A; superseded by 1.14.**
For sessions a healthy Watchdog supervises, permission requests and turn-finished and state
events go only to Watchdog. Everything else wakes Fishball, as do all events of unsupervised
sessions and everything while Watchdog is off or down. Escalations go back to Fishball (only
items that are not high-risk; high-risk items go to the user, Q13). Now R-WD-12. Options B (turn-finished to both) and C (everything queued for Fishball) are closed.

**Q29. Does Fishball's allowlist (Q17) also cover contributor events? — CLOSED by Q17 (B).**
There is no allowlist, so every contributor event reaches Fishball unless a plugin in the Fishball
DSH intercepts its type (R-EXT-14, R-EXT-20).

**Q30. Who receives a contributor's event? — DECIDED 2026-11-11 with the user's own design.**
The user's two messages are quoted in 1.11: one typed `fishball-events` stream; each event goes
to exactly one pair (the session's manager, else the designated Fishball); inside the official
Fishball, `fishball-core` dispatches to plugins that intercept that event type, else to the
Fishball agent; external agents receive the events as they are. Now R-EVS, R-INT, R-EXT-17,
R-EXT-20. Options B (always the designated Fishball) and C (broadcast) are closed.

**Q31. Who gets a watch notice when the watcher doesn't manage the session? — DECIDED 2026-11-11: C, extended.**
The user's words are quoted in 1.12: watching is managing. An agent automatically watches every
session it manages and never one it doesn't, so the watch tools and `notifyWhenFinished` are
removed. Now R-WATCH-01..05. Options A (to the watcher) and B (strict routing) are closed.

**Q32. Does a supervised session's finished work ever reach Fishball? — DECIDED 2026-11-11: A, revised; superseded by 1.14** (every `turn-finished` now goes to Fishball).
Yes: when a supervised session stops idle, with nothing running and nothing queued, that one
event bypasses Watchdog and goes straight to Fishball, which is woken once (the user's revision,
quoted in 1.13). Turns in the middle of the work stay
Watchdog-only. Now R-WD-13. Options B (strict Q25) and C (every `turn-finished` to both) are
closed.

**Q33. May Fishball still ask Watchdog for a check explicitly? — DECIDED 2026-11-11: B.**
No. The user's words are quoted in 1.15: Watchdog is assigned passively, so Fishball cannot call
it. `check_now` and refine-triggered checks are removed; refine survives only as a brief update
that applies at the next patrol or permission judgement. Now R-WD-03, R-WD-15. Option A is
closed.
