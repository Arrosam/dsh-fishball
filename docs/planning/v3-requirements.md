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
2. **`fishball-embed-ui`**, a new DSH plugin, takes over all of today's UI work, including the
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
   - `fishball-embed-ui` hands its notification-type tools (the attention latch behind the
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
  own value. Disabling or deleting the entry revokes it. *(Superseded by 1.27: the value is
  generated only, shown once in a modal, and never viewed or edited afterwards.)*
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
   connect and whenever it changes. *(Connector-side default names were later dropped by Q-NAME-1 = B, §1.20: a
   principal without a name is shown as `ID: <id>`; core's local `identity.name` still defaults to
   "Fishball".)* Default names: "Fishball", then "Fishball-2", "Fishball-3"
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
  endpoint, and MCP requests carry the access token. The direct-access fallback of Q28 was
  removed by 1.16.)*
- **External agents** must also choose an id; without one the connection is refused.
- **Foolproofing only.** The rule stops a user handing one token to many agents. It does not
  defend against an agent impersonating a paired one; that is out of scope.
- **Hosted Fishball** in the same DSH automatically gets a new token for each handshake (this
  revises the Q8 record of 1.6).
- **Id and name are separate (agreed).** The id is fixed and part of the credential. The name is
  user-facing, can change at any time, and is reported on connect and on every change.
- No rule makes ids unique across tokens. The token is the primary key. *(Superseded by Q-ID-1 = A,
  §1.20: ids are unique per connector, and `pair` refuses an id another entry holds with `id-taken`,
  matching the user's "如果fishball发起握手申请，并传入了一个相同的ID，这次握手就要失败" above.)*

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
- **Q27, decided (A); narrowed by Q-OA-2 (A) to machine exchange:** access tokens last **1 hour** and there are **no refresh tokens** for `client_credentials` clients (browser clients get rotating refresh tokens, R-OA-16). On
  expiry, or on any 401, the client logs in again with id + token.
- **Q28, decided (A), superseded by 1.16:** the user first answered "行，就A，我也想不到更好的主意了"
  (a per-entry direct-access fallback, `Bearer <id>.<token>`). The later answer in 1.16 removes it:
  "不允许直接访问". Every MCP request carries an access token from the token endpoint.
- **Q24, decided (A):** after a child reinstall, the new hosted principal takes over
  automatically. The old entry's managed sessions, designated role and name move to it, its live
  offers are re-issued with new ids, then the old entry is deleted and each managed session gets
  one note.
- **Q22, decided (A); superseded by Q-NAME-1 = B (§1.20):** default names were numbered per
  connector, lowest free first ("Fishball", "Fishball-2", …). The connector now assigns no default
  name to anyone.
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

### 1.16 Q-S7-1 and Q-OA-1 answered: browser authorization on its own port (2026-11-11), verbatim

First answer:

> 也做一个OAuth认证网页吧不对，应该是这个OAuth网页也支持认证，同时兼顾网页认证和机器换码的方式

Second answer, which decides the flow:

> 支持网页授权，不允许直接访问，授权的网页单开一个，改成单独一个端口暴露，不然会被DSH的token要求卡住

*Background:* spike V3-S7 (`8e92b84`) found that the stock `ClientCredentialsProvider` and the
Python MCP SDK both reject authorization server metadata without an `authorization_endpoint`.

What it means (now R-OA-01/02, R-OA-11…R-OA-20):
1. **Browser authorization is in scope.** The connector supports two ways in: machine exchange
   (`client_credentials`, unchanged) and browser authorization (an approval page, then
   `authorization_code` with PKCE). Q-S7-1 is settled: the metadata lists a real
   `authorization_endpoint`.
2. **No direct access.** "不允许直接访问": the per-entry direct-access fallback of Q28 is removed.
   There is no `directAccess` switch and no static bearer form; every MCP request carries an
   access token from the token endpoint (R-TOK-01). R-OA-10 is withdrawn.
3. **The approval page has its own port.** "授权的网页单开一个，改成单独一个端口暴露，不然会被DSH的token要求卡住":
   the connector serves the authorization page on **its own listener and port**, not on DSH's
   web listener, because DSH's own web-login token requirement would block it there. It is one
   minimal server-rendered page with no client module, a documented exception to R-ARCH-03.
4. Both ways end in the same thing: a full access token of one (token entry, fishball id) pair.
   The token stays the security boundary (R-TOK-00).

Third answer (Q-OA-5, how the page knows who approves):

> 那就做成这个网页永久只能输入一个Token用于认证，不管输入Token的人是谁。这样就解决了你问的“怎么确定是我点的”的问题了。其他Agent会打开一个网页，然后我在网页里把Token输进去认证。至于公网暴露的问题，交给用户自己去搭Tunnel

5. **The page only ever asks for a token.** It has no owner login, ticket, code or password.
   The owner creates a token entry by hand in the connector's settings (R-TOK-03/08) and types
   its value into the page; whoever enters a valid token authorizes, whoever they are. The token
   is the proof.
6. **Entering the token is the pairing.** A valid, enabled, **unpaired** token is bound to the
   browser client, exactly once (one token, one agent, 1.9). An already-paired token is refused;
   the page says to create a new token.
7. **Public exposure is the user's tunnel.** The connector builds no tunnel or public-exposure
   feature. It only has to work correctly behind a tunnel the user runs (R-REM-05).
- Items marked **[rule]** follow from an existing user decision; items marked **[open Q-OA-n]**
  need the user (§7).

### 1.17 Follow the MCP specification on the external surface (2026-11-11), verbatim

> 尽量遵循MCP的规范，对外的沟通不要用MCP规范不推荐的形式

What it means: everything an external agent sees follows MCP 2026-07-28 and its authorization
specification as closely as possible, and uses nothing the specification discourages (SHOULD NOT,
NOT RECOMMENDED, deprecated or legacy forms). **Documented departures:** two: plain HTTP for the
authorization server on loopback (Q-SPEC-1, decided A; R-OA-08), and static token + id headers for
clients without OAuth (Q-S7B-2, decided; R-OA-10, 1.25). Requirements settled by the specification are marked
**[spec: page § section]**, citing the official text at modelcontextprotocol.io. Departures that
remain are open questions (§7, Q-SPEC-n).

### 1.18 Standing rule: decide by the specification (2026-11-11), verbatim

> 但凡按照规范的你可以自己去做决策，你做完决策告诉你决定了什么就行

What it means: an open question that MCP 2026-07-28, or an RFC it requires, settles or clearly
recommends is decided by following that text, without asking. Each such decision is marked
**[spec: page § section]** and reported as "decided per spec". Questions the specification leaves
open, and product choices (naming, UX, Fishball's ids and pairing), still go to the user. A
specification rule that would reverse an earlier user decision is not applied silently: it is
asked.

### 1.19 Q-OA-3 answered: the browser client's id is typed on the page (2026-11-11), verbatim

> 这个用户自己填一个编号，必须编号没有重复，且Token正确才能配对成功

What it means (now R-OA-11, R-OA-12, R-ID-13): the approval page also asks for a **fishball id**,
typed by the user. Pairing succeeds only if the token is valid, enabled and unpaired **and** the id
is valid (R-ID-02) and used by no other entry. The connector never generates an id (R-ID-08 holds
for browser clients too). The client's OAuth `client_id` (its metadata-document URL) is recorded
separately on the entry.

### 1.20 Optional name on the page, and the Hand over control (2026-11-11), verbatim

> 然后还可以选填一个名字，方便记忆，名字因为随时可以改，不填也行。UI中handover to fishball的按钮，如果有多个agent连接了这个DSH，就会变成一个下拉菜单：Handover to... ，下拉菜单中选择连接了的Agent名称，没有名称就显示ID，显示ID时前面会加上一个ID:

Correction for one connected agent:

> 只连了一个也不是原来那个按钮，而是 Hand over to {agent_name}\{"ID: "+agent_id}

What it means (now R-OA-11/12, R-NAME-01/08, R-ROUTE-01/05, R-UI-05/10):
1. **The page has an optional name field.** A name is an aid to memory and can be changed at any
   time, so it may be left empty. A non-empty name follows the name rules (R-NAME-02: trimming,
   NFC, 1–64 characters, case-insensitive uniqueness, `name-taken`). A browser client that leaves
   it empty has **no name**.

Q-NAME-1 answered **B** (2026-11-11): the connector assigns **no default name to anyone**, machine,
hosted or browser client. A principal without a name is shown as `ID: <id>` (R-NAME-08). A name
refused at `pair` leaves the name empty. `fishball-core`'s local setting `identity.name` still
defaults to "Fishball", so a Fishball DSH normally pairs with that name. This supersedes Q22 A
and R-NAME-04's numbering.
2. **The Hand over control names its target.** With exactly one currently connected agent it is
   one button, "Hand over to <agent name>", or "Hand over to ID: <fishball id>" when that agent has
   no name. With more than one it becomes a dropdown, "Handover to…", listing each connected agent
   by name, or as "ID: <fishball id>". The fixed label "Hand over to Fishball" is gone. Choosing an
   agent hands the session to **that** agent. Labels come from embed-UI's locale files.
Q-HO-1 answered (which agents are listed, and their state):

> C，再给Dropdown每一行一个图标，如果掉线了就显示红灯，在线就显示绿灯

3. **Every enabled, paired agent is listed**, connected or not. A Hand over to a disconnected
   agent succeeds; its `handover` event waits in that agent's mailbox until it connects, under
   the usual queue and retention rules (R-CON-03, R-TOK-05). Each listed agent shows a **status
   light**: green when it is **online** (it holds an open `fishball-events` listen stream right
   now), red when it is not.
4. This replaces Q7's "Hand over goes to the designated Fishball" (1.6) for Hand over only.

Q-ID-1 answered **A** (2026-11-11): one id rule for every kind of pairing. Ids are **unique per
connector**: machine `pair`, like the browser page, refuses an id that another entry already holds,
with `id-taken` (R-ID-13). R-ID-11's "same id on two tokens" case is removed. The
   designated Fishball still receives `message_fishball` / `ask_fishball` from unmanaged sessions
   and contributor events with no managed session (R-ROUTE-03/04, R-EXT-17).

### 1.21 Interceptor acceptance and what stays out of context (2026-11-11), verbatim

S2-Q1 and Q-S3-2 answered together: **B**, core owns acceptance, with an explicit commit fence.
And the user's rule:

> 如果插件接手了一件事，且没有传导给Agent，那就没有记录，记录只留在后台的log里，不会进上下文

What it means (now R-INT-01, R-INT-04, R-INT-08, R-INT-09, R-WD-07):
1. **Core owns acceptance.** An interceptor's handler must `await ctl.accept()` before it acts.
   Core holds the acceptance record open until the handler settles. After a restart an open
   record is offered again to the **same** plugin, which dedupes by `eventId`; if that plugin is
   off, the event goes to Fishball once.
2. **A commit fence** (`ctl.commit(send)`, frozen in K3) wraps an interceptor's answer: if the
   interceptor throws or fails, items it accepted but has not decided go to Fishball; an answer
   that is already being sent stays with the interceptor, so there is no stale commit.
3. **Nothing an interceptor handles alone enters an agent's context.** An event that a plugin
   handles without passing it to an agent leaves no record in any agent's context: no message,
   no notice, no summary. Its traces go only to the background log. Core's acceptance record is
   internal state and never appears in context.

### 1.22 S4-Q2 answered: what of the V2 connector client moves (2026-11-11), verbatim

> 侧边栏的Fishball按钮入口 或者 override 右上角标志；待批按钮去掉，如果Fishball无法决断才在Fishball里面显示。交给Fishball了可以接受一些行为的改变；决策/卡片记录留在对话内inline显示，就和一个工具使用记录一样。

What it means (now R-UI-11, R-UI-12, R-UI-13, R-FB-11):
1. **One Fishball entry on the main DSH, in embed-UI.** The user accepts either the sidebar
   Fishball entry or an override of the top-right brand mark. **Chosen: the sidebar entry**
   (R-UI-11), because spike V3-S4 proved the sidebar slots on both SDKs and embed-UI already owns
   that entry (R-UI-02, R-UI-08), while the brand slots were not exercised and overriding DSH's own
   brand changes the whole host UI for every user of that DSH (against R-ARCH-02's spirit).
2. **No pending-approval row.** The V2 `ask_fishball` row with Allow once / Reject is removed from
   the main DSH; DSH's generic tool row shows the call. An ask that Fishball **cannot decide** is
   shown to the user **inside Fishball** (its own page), and answered there (R-FB-11). The user
   accepts this change of behaviour for work handed to Fishball. Q13's user card for a high-risk
   **permission** request in the managed session is not changed by this answer.
3. **Decision and card records stay in the conversation, inline**, shown like a tool-use record.
   Q-S4-2b answered **B**, without a read interface:

> B，不需要开一个只读的读取接口，只要这个session向Fishball发出请求和收到请求的时候自己在会话内绘制一个就行了。我不知道为什么要加读取接口。这完全是在DSH内发生的事，完全可以在DSH内自己判断，自己绘制。

   The records are drawn **in the managed session itself** (R-UI-13), from what that session
   already sees inside DSH: its own request to Fishball (the `ask_fishball` call, or its permission
   request that went to Fishball) and the answer or decision it receives back. There is no new
   member on the hand-over service and no connector read API.

### 1.23 The last open questions, answered in one line (2026-11-11), verbatim

> 1A 2A 3B，页面内显示的ID:加粗显示来区分 4A 5已经通过MCP连接了，中间不应该出现交叉依赖的问题，B

1. **TQ-6 = A:** every Unicode whitespace character (including `\n`, `\t`) collapses to one space
   before the control-character check; `name-invalid` is shown like `name-taken`, with the reason
   (R-NAME-02, R-NAME-03).
2. **Clearing a name = A:** `set_name(null)` clears the name; the principal is then shown as
   `ID: <id>` (R-NAME-02).
3. **Names starting with `ID:` = B:** allowed. To tell them apart, the UI renders the `ID:` prefix
   of a **nameless** principal in **bold**; a chosen name is plain text even if it starts with
   "ID:" (R-NAME-08, R-UI-10).
4. **Reading another principal's managed session = A:** `forbidden` (R-ROUTE-02).
5. **Mixed SDK versions = B:** checked separately only. The user's reason: the two sides talk only
   over MCP, so no cross-version dependency should exist (R-COMPAT-01).

### 1.24 Spike S6 questions answered (2026-11-11), verbatim

> 1B，2B并且删除掉自带的所有预设，Watchdog也是一个预设。不会有旧会话，根本没人下载过第二版，直接丢弃之前的会话。

Correction:

> DSH自带的预设关掉，不要删掉

What it means (spike V3-S6 `86800d2`, PARTIAL; now R-FB-02, R-FB-09, R-FB-12, R-WD-16, R-MIG-01/02):
1. **Bundle order = B.** DSH applies bundle patches in `dsh.profile.bundles` order and silently
   skips a patch on a row that is not inserted yet, so core's guards only work when core comes
   **last**. The instance writes core last in a hosted child; in standalone mode core moves itself
   last and the guard holds at once with HMR or after one restart (R-FB-12; spike V3-S6 round 2 `7c2230e`).
2. **Presets = B, amended.** Core contributes its own agent preset `fishball` for the manager and
   makes it the default. Every **DSH-shipped** agent preset is **switched off, not deleted** (the
   correction). Watchdog is a preset too: its side sessions run the `watchdog` agent preset that
   `fishball-watchdog` contributes (R-WD-16). Proved by spike V3-S6 round 2 `7c2230e`.
3. **No V2 sessions.** Nobody installed V2, so there are no old sessions to resume: earlier manager
   sessions are **discarded**, not migrated or resumed (R-MIG-01, R-MIG-02). [impl] Discard means
   **archive** (DSH has no public session delete).
4. **Approval read [impl]:** `ctx.approval.config.policy` is read directly, with one test per SDK.
5. **Version:** 0.2.2-rc.1 counts as 0.2.2 (R-COMPAT-01).

### 1.25 Q-S7B-2 answered: static token + id headers too (2026-11-12), verbatim

> 那就也接受直接贴token+id的请求头

*Background:* spike V3-S7b found that DSH's own `dsh-mcp-client` has no OAuth at all: it can only
send fixed headers. The user accepts a static header form so such clients work.

What it means (now R-OA-10, R-TOK-01, R-OA-02, R-OA-17):
1. Besides OAuth, the connector accepts the **owner-created token** in the standard
   `Authorization: Bearer <token value>` header together with the agent's fishball id in `Fishball-Agent-Id`,
   on every request. No token endpoint, no access token, no expiry.
2. This is the **second documented departure** from the MCP authorization specification (after
   Q-SPEC-1): a long-lived credential presented directly to the protected resource. It partly
   reverses "no direct access" (1.16) for this one form.
3. `dsh-mcp-client` is supported through it.

### 1.27 Tokens are revealed once and never edited (2026-11-15), verbatim

The user's answer to W4 question 1 (what releases the held mailbox after a changed or unset value):

> 不允许改token值，一旦生成确定了连看都不能看，只有生成的时候弹出modal显示token并允许复制

What it means (now R-TOK-03, R-TOK-04, R-TOK-08, R-TOK-09, R-TOK-11, R-OA-06, R-HOST-05; design §5.1–§5.4, §5.9):
1. Only the system generates a token value. A value the user chooses or types is never accepted.
2. The value is shown **exactly once**, in a modal at generation time, with a **Copy** button.
3. From then on nobody can view or edit it: not in settings, not anywhere. Because no value can
   change, "a changed or unset value" no longer exists as an event, so W4 question 1 has nothing
   left to decide.
4. This supersedes Q5's "the user copies it from there, or sets their own value" (1.6). It is
   Q5's option C, the show-once view, which the user now chooses.

### 1.28 R1–R4 answered: where the hosted token lives, who owns the reveal, duplicates (2026-11-15), verbatim

> R1: 存在fishball子实例内，第一次启动的时候由instance插件传入
>
> R2: 生成入口放在插件设置页内，这个不算UI，不带UI的意思是不影响dsh本身的UI
>
> R3: 发现有重复的就拒绝服务并提示
>
> R4: delete, then New token (the recommended option)

What it means (now R-ARCH-03, R-ARCH-04, R-CON-10, R-TOK-03, R-TOK-04, R-TOK-08, R-TOK-09, R-TOK-11, R-HOST-05, R-HOST-09; design §5.1, §5.4, §5.9):
1. **R1.** A hosted token's value is stored **inside the Fishball child**, in the child's own
   credential store. The instance passes it in once, at the child's first start. The host DSH keeps
   no copy, so nothing is re-sent after a host or child restart.
2. **R2.** The generate entry (New token and the one-time reveal) lives in the **connector's own
   plugin settings page**. A plugin's own settings page does not count as UI: "no UI" means the
   connector does not change DSH's own UI. So the connector owns the page and the modal, not
   embed-UI.
3. **R3.** When the connector finds a duplicate, it refuses service and shows a notice. A duplicate
   means two items with the same identity: the same entry key, or the same value digest.
4. **R4.** A lost or leaked value is replaced by delete, then New token. There is no Replace control.

### 1.29 R5–R7 answered (2026-11-15), verbatim

> R5: recommended
>
> R6: B
>
> R7: 在第一次连接远程dsh的时候保存一次到fishball本地，这也apply to standalone fishball

What it means (now R-TOK-08, R-HOST-05, R-HOST-10, R-FB-03; design §5.4, §5.9, §6.3):
1. **R5.** A hand-added item with no digest (never created by New token) is treated like a
   duplicate: a save that adds one is refused with a notice; one found at start is listed with the
   notice and can never authenticate.
2. **R6 = B.** Retry after the hosted entry was deleted does **not** create a token. It shows a
   notice telling the user to create a new token themselves.
3. **R7.** A remote target's token is saved **once** into Fishball's local credential store, at
   the first connection to that remote DSH. The same holds for a standalone Fishball.

### 1.30 R8 and R9 answered (2026-11-15), verbatim

> R8: 2，因为我想要子实例和standalone用的是同一套插件，但是多一个子实例插件来实现一些便利的功能。所以在填入一个额外的token时，应该还是和standalone一样在fishball内填，走正常流程。但是instance插件允许便利的为子实例导入主dsh的token完成这些步骤
>
> R9: recommended

What it means (now R-FB-03, R-HOST-05, R-HOST-10; design §5.4, §6.3):
1. **One path for hosted and standalone.** A hosted child runs the same plugins as a standalone
   Fishball. A new or extra token is always entered **inside Fishball**, in core's own settings,
   through the same normal flow as standalone. *(Superseded by 1.31: no token is entered by hand
   anywhere; standalone uses Connect, hosted uses only the instance's import.)*
2. **The instance is an optional helper.** It adds conveniences only: it may import the main DSH's
   token into the child, by running those same steps for the user. It has no token path of its own.
3. **R9.** Fishball saves its copy of a token only after the target first accepts it; a changed
   target origin counts as a new first connection; a copy the target refuses is replaced once a
   different value is supplied.

### 1.31 R10 answered: nobody sets a token by hand (2026-11-15), verbatim

> 不允许主动设置token，只能依靠生成

Asked how Fishball then gets its token, the user confirmed this flow:
- **Hosted child:** the token arrives **only** through the instance plugin's automatic import.
- **Standalone and remote targets:** the user clicks **Connect** in Fishball. That opens the
  connector's browser authorization page (the existing approval page on its own port, R-OA-11), and
  the user pastes the freshly generated token there. Fishball receives only the OAuth credentials,
  never the raw token.
- **Fishball's settings:** there is no token input field anywhere.

What it means (now R-FB-03, R-FB-04, R-OA-19, R-HOST-05, R-HOST-10, R-ID-07; design §5.4, §5.5a, §6.3):
1. Supersedes 1.30's "the user enters a token in core's settings" (R8). The plugins are still the
   same in hosted and standalone mode; what differs is only who supplies the credential: the
   instance's import (hosted) or the user's Connect (standalone, remote target).
2. A standalone or remote-target Fishball is a **browser OAuth client** of the target connector
   (authorization code with PKCE, R-OA-11…18). It never holds a token value.
3. R9's saving rule now applies to what each path holds: the imported token (hosted) and the OAuth
   grant (Connect).

### 1.32 R11–R14 answered (2026-11-16), verbatim

> R11: 通过UI插件打开子实例，把新生成的token输入到子实例内的设置中。或者在instance插件中点击重新连接
>
> R12: B
>
> R13: 授权页上填的是名字，ID是被连接的dsh接受来自fishball的id传入。fishball-ish的agent连接时必须提供一个id
>
> R14: 取消一次连接365天的限制，只要有token和id就能连接

What it means (now R-HOST-05, R-HOST-10, R-FB-03, R-OA-11, R-OA-22, R-OA-23, R-ID-01, R-ID-03, R-ID-07, R-ID-08, R-ID-13; design §5.4, §5.9, §6.3a):
1. **R11.** To replace a hosted Fishball's token, the user either opens the child through
   embed-UI and enters a newly generated token in the **child's own settings**, or clicks
   **Reconnect** in the instance plugin. This narrows 1.31's "no token input field anywhere": a
   hosted child's settings get **one write-only token field** for this case (never displayed). It
   lives in the instance's hosted settings bundle, so the instance stays the hosted child's only
   token source (1.31), and a standalone Fishball still has no token field.
2. **R12 = B.** The OAuth client metadata document core uses for Connect is **hosted by the user**,
   as the adapter's is: a required setting with no default.
3. **R13.** The approval page asks for a **name**, not an id. The id is **passed in by the
   connecting agent** and accepted by the target DSH. A Fishball-like agent must supply an id when
   it connects.
4. **R14.** The 365-day limit on one connection (`LIFETIME.refreshChainMaxMs`) is removed: a
   client holding a valid token and id can connect. The renewal rule that existed only because of
   that limit (R-OA-16 (7)) goes with it.

### 1.33 The open-questions sweep answered (2026-11-16)

The user's answers to `.runtime/reports/v3-open-questions.md`. Where the user wrote words, they are
quoted verbatim; a letter is the option the user chose.

- **Q-A1 = B.** A client that brings no id gets a fixed id the connector derives from its client
  id URL, and full rights at once.
- **Q-A2 = A.** A client that comes back with its token and id reconnects as the same principal,
  keeping its name, sessions and queued events.
- **Q-A3 = B.** Connect also works from a browser on another machine, completed through Fishball's
  https web address.
- **Q-B1 = B.** Replacing the hosted token moves nothing; the user deletes the old entry by hand.
- **Q-B2.**
  > 一直显示，可以顺手换新，子实例内的界面和独立版本一样，只是套在框里，子实例内这个token框本意是用于连接新的dsh实例。而子实例的主dsh只是被视作一个普通的dsh，只是有一个instance插件可以方便启用和连接
- **Q-B3 = B.** A dead hosted entry stays until the user deletes it; uninstall does not touch it.
- **Q-C1 = A** (decided earlier by Fishball, S-Q6). **Q-C2 = A.** A failed Watchdog does not
  retry on its own.
- **Q-D1 = B.** Reconnect is on the instance plugin's own settings page.
- **Q-D2.**
  > embed UI什么都不管，只是显示一个可以打开dsh页面的按钮
- **Q-D3 = B.** Close on the reveal modal works at any time; a lost value means delete and create
  again.
- **Q-D4.**
  > 侧栏的小鱼是embed UI的组件，如果只装了连接插件和embed UI，没装instance，embed UI会显示提示。而只装connector不会改变任何UI，也就没有小鱼图标
- **Q-E1.**
  > 1.0.0-alpha1

  Written `1.0.0-alpha.1` (semver); Fishball confirms the spelling with the user.
- **Q-E2 = A** (the user's 5A, 2026-11-13: "同意删不再用的V2代码，审查时给出清单").
- **Q-E3 = A** (the user's 6A: "tunnel可选").

What it means (now R-ARCH-04, R-ARCH-05, R-FB-03, R-HOST-02, R-HOST-05, R-HOST-07, R-HOST-10, R-OA-12, R-OA-22, R-ID-01, R-ID-03, R-ID-07, R-ID-08, R-TOK-11, R-UI-03, R-UI-06, R-UI-08, R-WD-07; design §4.2, §5.4, §5.5a, §6.3a):
1. **One Fishball UI in both modes (Q-B2).** The hosted child's UI is the standalone UI, framed.
   Its token field is for connecting to a DSH, and the host DSH is an ordinary DSH. So core's own
   settings hold one **write-only token field** (paste a freshly generated token), in standalone
   and hosted alike, always shown, beside **Connect**. The instance is a convenience: its automatic
   import and its **Reconnect** fill that same path. This supersedes 1.31's "no token input field
   anywhere" and 1.32's "the field is in the instance's bundle"; R10's rule stands (every token is
   generated; a pasted value is a generated one).
2. **Ids (Q-A1, R13).** A Fishball-like agent passes its id in the authorization request; a client
   that passes none gets the derived id. Either way the page binds at once, with full rights.
3. **Settings pages, not embed-UI (Q-D1, Q-D2).** Every settings card embed-UI drew moves to its
   owner's own plugin settings page: the connector's limits to the connector's page (R2), and the
   instance's status, Retry, Reconnect and model-sync trigger to the instance's own page. The rest
   of Q-D2 (marks, Hand over, attention, inline records) is the open question Q-F1 in
   `.runtime/reports/v3-open-questions.md`.

### 1.34 Each plugin's role, restated (2026-11-16), verbatim

> embed UI只是connector的附属，负责帮connector显示出和fishball交互的UI。所有的操作的功能实现都由connector完成，也就是connector当后端，embed UI当前端。fold-notify去掉，这个应该是embed UI给connector提供的注入的额外工具，可以由fishball调用。watchdog我改主意了，移动到dsh内，而不是fishball内。hosted setting去掉，fishball的setting留在fishball里的fishball core插件的设置页内。可以在fishball对外暴露的UI中打开dsh的自带设置，或者直接跳转到fishball core的设置。

This supersedes the Q-D2 wording of 1.33 ("embed UI什么都不管…") and closes the question Q-F1 it raised.

What it means (now R-ARCH-01…05, R-FB-01, R-FB-06, R-FB-07, R-WD-00…02, R-WD-08, R-WD-16, R-INT-07, R-HOST-01, R-HOST-11, R-BND-01…04, R-FN-01, R-UI-03…13, R-EXT-13; design §1, §4.2, §7, §8):
1. **The connector is the backend, embed-UI its frontend.** Embed-UI only draws the main-DSH UI
   for working with Fishball: the fish entry, Hand over, the lights, marks, attention, records and
   cards. Every operation and all logic and state are the connector's. Embed-UI keeps no logic or
   state of its own.
2. **`fishball-fold-notify` is removed.** Its function becomes an extra tool that embed-UI injects
   into the connector (the contribution mechanism, R-EXT) and that Fishball calls, for example to
   notify the user in the main DSH UI.
3. **`fishball-watchdog` moves into the main DSH.** It is a main-DSH plugin, no longer part of
   the Fishball plugin set.
4. **`fishball-hosted-settings` is removed.** Fishball's settings are on `fishball-core`'s own
   plugin settings page inside Fishball. Fishball's own UI can open DSH's built-in Settings, or go
   straight to `fishball-core`'s settings.

### 1.35 What Watchdog is for (2026-11-16), verbatim

> watchdog的定位是用来接收fishball的目标和约束，定时监督避免监督的session跑偏，并替fishball批示和通过permission request。fishball可以把可批示的范围提交给watchdog。范围是一段可以通过的请求的描述。总之watchdog接受两个来自fishball的指示，一个是必需的，就是这个session的目的，一个是非必需的，就是可以批示的请求。而watchdog通过定时的监督和每次批注请求时也进行监督来避免session跑偏。通过减少走到fishball的permission approval请求次数来节约fishball的token并reinforce session的behavior

What it means (now R-WD-00, R-WD-03, R-WD-09, R-WD-14, R-WD-15; design §7.A; Watchdog runs in the
main DSH, 1.34):
1. **Two instructions from Fishball per supervised session:** the session's **purpose**
   (required) and an optional **approvable scope**, a text description of the requests Watchdog may
   pass. They replace the free-form brief and criteria.
2. **Supervision against drift** happens on Watchdog's patrol timer **and** at every permission
   request it handles; both compare what the session does with its purpose.
3. **Approval on Fishball's behalf:** Watchdog approves (answers) permission requests that fall
   within the scope.
4. **The goal:** fewer permission approvals reach Fishball, which saves Fishball's tokens and
   reinforces the session's behaviour. This keeps U16's "a token saver, not a safety layer".

### 1.26 Earlier decisions carried into V3

- **Watchdog**, a token saver and not a safety layer (U16; its role restated by 1.35, and moved to the main DSH by 1.34):
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
| **Embed-UI** (U) | `fishball-embed-ui` (S4-Q3, decided B: lowercase, as npm and DSH's plugin manager require; the user's earlier messages call it `dsh-fishball-embed-UI`), installed in the host DSH. |
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
| R-ARCH-01 | **Packages (amended by 1.34).** V3 ships, as ordinary DSH plugins (bundles) that DSH's own plugin management installs, enables, disables and lists: in a **main DSH** `fishball-connector` (the backend), `fishball-embed-ui` (its frontend) and `fishball-watchdog`; in a **host DSH** `fishball-instance`; in a **Fishball DSH** the **Fishball plugin set** (R-FB-01: `fishball-core` and `fishball-board`); in a DSH that uses another DSH's connector `fishball-connector-adapter`. V3 also has one library package, `fishball-shared` (R-ARCH-08), which is not a plugin. `fishball-fold-notify` and `fishball-hosted-settings` no longer exist. |
| R-ARCH-02 | A DSH with any of these packages installed stays a full DSH: **no** V3 package refuses to load, hides or disables another plugin because a Fishball package is present. The one exception is a Fishball DSH, where `fishball-core`'s `fishball-ui` component reshapes the DSH on purpose (R-FB-02, Q20). |
| R-ARCH-03 | `fishball-connector` changes **nothing in DSH's own UI** (amended by 1.28: "不带UI的意思是不影响dsh本身的UI"). Its only browser code is **its own plugin settings page**: one `dsh.client` entry that registers only into the Plugins page's configuration slot for its own row (design §5.9), plus the owner-only Fetch route that page calls. Loading it adds no sidebar entry, other slot contribution, global CSS or route that serves HTML. **One other exception (1.16):** the browser-authorization approval page (R-OA-11) is served by the connector on its own approval listener (R-OA-20), as one minimal server-rendered HTML page with no client module, no slot, no CSS asset file and no script beyond what the form needs; it never appears in DSH's own web UI. |
| R-ARCH-04 | **The connector is the backend, embed-UI its frontend (1.34).** Every host-DSH UI change Fishball makes comes from `fishball-embed-ui`, and embed-UI draws only: the sidebar fish entry and its lights, the Fishball page frame, the hint when there is no instance (1.33 Q-D4), the Hand over / Take back controls, the managed marks, the attention signal and notices, the inline records and the cards. Every operation, all logic and all state behind them are `fishball-connector`'s (its host-only services and owner-only routes); embed-UI keeps no logic or state of its own and holds no session power. Embed-UI is the connector's companion: it draws nothing without the connector (open question Q-U1 for the Fishball page). A plugin's own settings page on DSH's Plugins page is not a UI change (1.28): the connector's, the instance's and Watchdog's own settings pages stay when embed-UI is uninstalled. With embed-UI uninstalled, **no** Fishball UI element appears in the host DSH; with the connector alone there is no fish (1.33 Q-D4). |
| R-ARCH-05 | `fishball-instance` provides only the hosted child and its lifecycle (R-HOST). It changes nothing in the host DSH's own UI. Its only browser code on the host is **its own plugin settings page** (1.33 Q-D1, Q-D2): the child's status, Retry, Reconnect, the model-sync trigger and **Open Fishball**, served by its own owner-only routes, which also mint the frame admission embed-UI uses (1.34: embed-UI keeps no logic). Inside a hosted child it adds nothing: no settings bundle (1.34, `fishball-hosted-settings` removed). Its host row's `inject` list holds **no service that reads or writes sessions, approvals, questions or prompts**; it cannot reach the host DSH's sessions except through a connector's MCP, from inside the child, like any client. |
| R-ARCH-09 | **Watchdog is a main-DSH plugin (1.34).** `fishball-watchdog` runs in the DSH whose sessions it supervises, beside the connector. It acts on sessions only through the connector's host-only supervision service, so the connector stays the only Fishball component with Fishball authority over that DSH's sessions (R-SEC-01). Its settings are on its own plugin settings page. Its tools reach Fishball by the contribution mechanism (R-EXT). |
| R-ARCH-06 | No V3 package patches DSH code, bundles or another plugin's files. It uses only public DSH services, slots and profile patch rows, on both supported SDKs (R-COMPAT). |
| R-ARCH-07 | Talk between a Fishball DSH and a main DSH goes **only** through the main DSH's connector MCP endpoint. No V3 code path reaches main-DSH sessions through `fishballConnector.attachInstance`, the envelope-v2 frames or any other private channel. |
| R-ARCH-08 | **Shared library (TQ-R3 and TQ-R5, decided).** The user's words: "建立公共包" (create a shared package). `fishball-shared` (folder `packages/shared`) holds **only** modules that **more than one** V3 package actually uses; first contents: the child `admin` service constants, the provider-sync wire format (codec), and the file helpers core and the instance both need. Fishball-only logic stays in core; DSH-only logic stays in the instance. Rules: (1) **any** V3 package may depend on it: the connector, embed-UI, `fishball-core`, `fishball-instance`, the feature plugins and `fishball-hosted-settings` (TQ-R5, decided B); (2) `fishball-shared` imports nothing from any other V3 package, and core and the instance never import each other; (3) it has no DSH plugin entry (no `dsh` bundle, row, `dsh.client` or service) and never appears in any Plugins page; (4) importing it loads only the library: a connector or embed-UI that depends on it loads no module of the Fishball set or of `fishball-hosted-settings`, so R-BND-01 still holds in the host DSH; (5) a module that only one package uses does not belong in it; (6) it is versioned with the other V3 packages and, because V3 publishes nothing (§5), ships **inside** the release tarball of every package that depends on it, as a bundled dependency, so no install needs a registry. |

### 3.2 Connector: an MCP server (R-CON)

| ID | Requirement |
| --- | --- |
| R-CON-01 | **Protocol (Q12, decided).** The connector exposes one MCP endpoint over Streamable HTTP that serves **only** MCP revision **2026-07-28** (stateless requests, `server/discover`, `subscriptions/listen`). It implements no `initialize` handshake, no `Mcp-Session-Id` sessions, no GET stream and no `resources/subscribe`. A request for another revision is refused with `UnsupportedProtocolVersion` (-32022), listing `2026-07-28`; an `initialize` request gets an error that names the supported revision; GET or DELETE on the endpoint gets 405. **Clients on 2025-11-25 or older must upgrade** to a 2026-07-28 client. A 2026-07-28 client can discover, list and call the connector's tools. |
| R-CON-02 | The endpoint serves session control as MCP tools (the **core tools**): list, start, message, redirect, stop, read, and release. There are no watch tools (R-WATCH-03). It also serves approval, question and prompt answering; grant list and revoke; attachment put and read; and mailbox poll and ack. The attention signal is not a core tool; embed-UI contributes it (R-EXT-13). Core tools carry the domain semantics and limits of contract 1.2 §4 and §8. Each tool returns a structured domain result in `structuredContent`, plus the same JSON serialised in a text content block [spec: Tools § Structured Content]: refusals carry their contract code (for example `limit-exceeded`, `expired`, `queue-full`) and are never just prose. A refusal is a tool execution error and sets **`isError: true`** [spec: Tools § Error Handling, decided per 1.18]; the code stays in `structuredContent` and in the JSON text block, so a client that drops `structuredContent` on errors still sees it. Success sets `isError: false`. Every output schema admits the refusal envelope (K1). |
| R-CON-03 | Events reach a principal through a **durable mailbox** per pair (R-ID-06). Events stay pending until the principal acks them. A poll returns a bounded ordered page plus a cursor. A stale or foreign cursor gets an explicit resync answer, never a silent skip. |
| R-CON-04 | **One typed event stream (Q30, decided; R-EVS).** The mailbox is published as one MCP resource, `fishball-events` (URI `fishball://events`). A subscription to it gets `notifications/resources/updated` whenever new events arrive for that pair. The notification is a **hint only**: a client that never subscribes gets the same events by polling, and losing a notification loses no event. |
| R-CON-05 | No approval, question or plan review is ever settled by a timer, by a client's silence or by a lost notification. A delegated item with no answer **waits**. |
| R-CON-06 | Settlement is atomic, and the first committed outcome wins (OQ-14). A second answer, by user or agent, gets `already-settled` or `expired` and changes nothing. |
| R-CON-07 | External principals receive and may answer delegated approvals and questions, including plan reviews. This is on by default, and **no setting turns it off** (1b). |
| R-CON-08 | The connector keeps today's main-session tools `message_fishball` and `ask_fishball` and the managed-session interception of permission requests. These are tools and approval hooks, not UI. They route to principals by the rule of R-ROUTE (Q7, decided). |
| R-CON-09 | With no principal connected, the connector behaves as contract 1.2 §9 does with no instance attached. Messages queue, up to the `maxQueuedInputs` bound. `ask_fishball` answers `unavailable` at once. A managed session's permission request goes to the user in that session. "No principal connected" applies only to a session with **no managing principal**. A managed session's permission request, question or plan review always becomes an offer in its managing pair's mailbox and waits there, connected or not (TQ-16, decided by R-CON-05, R-REM-04 and Q-HO-1 C). |
| R-CON-10 | The connector's settings (limits, tokens and endpoint options; no per-contributor rows, Q16) live **only** on DSH's Plugins page for `fishball-connector`. **Amended by 1.28:** the connector's own settings page there (R-ARCH-03) holds the token list, **New token** and the one-time reveal modal (R-TOK-03, R-TOK-11). |
| R-CON-11 | **Hand-over only (Q3, decided).** The connector keeps only the hand-over events and tools needed to contact Fishball: the `handover` and `takeback` events in the target principal's mailbox, the managed-session state they change, and a host-only service through which a plugin in the same DSH (embed-UI) performs Hand over / Take back and reads which sessions are managed by whom. It has no UI and no other UI state. |

### 3.3 Tool and event contributions from other plugins (R-EXT)

| ID | Requirement |
| --- | --- |
| R-EXT-01 | The connector provides a public, versioned DSH service (proposed name `fishballConnectorTools`) through which a plugin in the same DSH process registers MCP tools. A contributor that injects it (optionally, so a missing connector never fails its own load) can register and unregister tools at runtime, with no connector restart. |
| R-EXT-02 | A registration names its tool's input schema, an optional output schema, a description and an execute function. A registration with an invalid name, a non-object or invalid input schema, an unsupported schema keyword set, or a missing execute function is **refused** with a code (`tool-invalid`; a caller with no traceable package gets `contributor-unidentified`, R-EXT-03). Nothing is registered and nothing appears in `tools/list`. |
| R-EXT-03 | Every contributed tool's public MCP name is `<namespace>.<name>`. The namespace is derived from the contributor's identity in DSH: the **normalised package name of the caller's loader entry** (spike V3-S5 `8f2788e`, Q1), never passed in by the contributor; `register(def)` keeps its signature. A caller that cannot be traced to a package is refused **`contributor-unidentified`** and registers nothing. The `fishball` namespace and the core tool names are reserved. One fixed exception: embed-UI's namespace is the short alias `embed-ui`. A second registration of an existing public name is refused (`tool-exists`) and leaves the first in place. Public names satisfy MCP's tool-name rules (1–128 characters of `A–Z a–z 0–9 _ - .`) and keep the `.` separator [spec: server/tools § Tool Names, decided per 1.18]. A client that rewrites names (DSH's own MCP client hashes and shortens them for DSH-hosted agents) does so as the specification's client-side disambiguation allows. **Two contributors whose package names normalise to the same namespace** (TQ-13, implementation): the first to register keeps it; the second is refused `namespace-reserved` and logged once. The namespace is attribution only (R-SEC-04). |
| R-EXT-04 | When a registration is disposed, or its contributor is disabled, unloaded, reloaded or uninstalled, its tools leave `tools/list` **before the next request is answered**. Later calls get "unknown tool". `tools/list` and `tools/call` also check that the registration's **owner fiber is loading or active** at the time of the request (spike V3-S5 `8f2788e`, Q4): a tool whose owner is being disposed is neither listed nor callable, even before its disposer has run. Every client whose listen stream opted into `toolsListChanged` gets `notifications/tools/list_changed`. Registering a tool sends the same notification. |
| R-EXT-05 | Contributed tools sit behind the same access-token check as core tools (R-TOK-01, R-OA). An unauthenticated request cannot list or call them. A pair-only access token sees no contributed tools in `tools/list` (only discovery, `tools/list` of core tools and `pair`). **Every authenticated, paired token sees and may call every contributed tool**, exactly as with core tools: there is no per-token filtering (Q15, decided; no scopes, Q6). The only control is installing or enabling the contributor plugin (Q16, Q17 decided). |
| R-EXT-06 | A contributed tool's call passes through the connector's own checks **before** the contributor's code runs: authentication, request and body limits, in-flight and rate limits, input-schema validation against the registered schema, and the per-call byte limits the contributor declared within the connector's ceilings. A call that fails one of them is refused with the connector's code and never reaches the contributor. |
| R-EXT-07 | A contributed tool's result passes through the connector's checks **after** the contributor's code runs: the result-size ceiling, output-schema validation when one is declared, and the result envelope (`{ok, code?, …}` in `structuredContent` and as JSON text, with `isError: true` exactly when `ok` is false, R-CON-02). A refusal code the contributor returns must come from its declared code list or the connector's shared vocabulary; anything else becomes `operation-failed`. |
| R-EXT-08 | A contributor's execute function that throws, rejects, returns an invalid result or exceeds the per-call time ceiling is **contained**. That call gets `{ok: false, code: 'contributor-failed'}`, with no stack, message text or internal path. The connector, every other tool and every other client are unaffected. The failure is logged once per contributor and failure kind, with no arguments or result content. *(Limits and codes frozen by K2: `TOOL_LIMITS`, `QUARANTINE`, `SHARED_CODES`, `CALL_CODE`, `ABORT_REASON` in `fishball-connector/tools`.)* |
| R-EXT-09 | A contributor that keeps failing is **quarantined**: its tools are withdrawn (R-EXT-04) and its events stop (R-EXT-19). The quarantine is kept on the **contributor's activation** (an effect on its root fiber, spike V3-S5 `8f2788e`, Q2) and lifts only with **a new activation of the contributor**: disabling and re-enabling its plugin, reloading it, or hot-reloading it. A reload of the **connector** does not lift it. There is no connector-side control for it (Q16, decided). |
| R-EXT-10 | The per-call context handed to a contributor carries the calling **principal** (an opaque principal key and its current name, never the token or the token entry's label), a cancellation signal that fires when the client cancels or disconnects, and the protocol revision (always 2026-07-28). It carries no access to the connector's mailbox, other principals, the credential store, other tools or main-session authority beyond what the contributor's own DSH context already has. |
| R-EXT-11 | **The contributor's whole scope (Q14, decided).** A contributor runs only in the connector's DSH, under its own DSH authority. Toward Fishball it can do exactly three things through the connector: emit events (R-EXT-16), expose tools (R-EXT-01) and accept calls to them (R-EXT-06). It cannot read or ack mailboxes, see or answer approvals, questions or prompts, settle offers, perform Hand over / Take back, obtain or see any token, or run anything inside a Fishball DSH. The contribution service offers no member for any of these. |
| R-EXT-12 | Contributed tools appear in `tools/list` sorted deterministically (core tools first, then by public name). Each carries its contributor's plugin name and package version in `_meta["io.github.dsh-fishball/contributor"] = {plugin, version}` [spec: basic § General fields › `_meta`; server/tools § Tool, decided per 1.18]. `annotations` carries **only** the specification's behaviour hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, …) as the contributor declared them; they stay untrusted hints, as the specification requires. |
| R-EXT-13 | Embed-UI's notification tools (notify and the attention signal, R-FN-01) are contributed through R-EXT-01, not built into the connector's core tool set. With embed-UI absent, those tools are absent from `tools/list`. **Amended by 1.34:** embed-UI only declares them; their handlers and their state (the latch, the notices) are the connector's. |
| R-EXT-14 | **No allowlist (Q17, decided).** A Fishball DSH offers **every** contributed tool of its target connector to Fishball's model, through `fishball-core`'s façade, and passes every contributor event to Fishball unless a plugin in the Fishball DSH intercepts its type (R-EXT-20). `fishball-core` has no allowlist setting. The only control is installing or enabling the contributor plugin in the connector's DSH. *Note, not a setting:* each contributed tool adds its name, description and schema to every Fishball turn, so many contributors grow Fishball's prompt; the README says so, and core's status shows how many contributed tools are offered. |
| R-EXT-15 | **No per-contributor settings (Q16, decided).** The connector's settings contain no rows or switches per contributor. To stop a contributor's tools and events, the user disables that plugin in DSH's native Plugins page. Visibility: each registration, refusal, withdrawal and quarantine writes one log line naming the namespace (never arguments, payloads or tokens), and every contributed tool carries its contributor's plugin name and version in `_meta["io.github.dsh-fishball/contributor"] = {plugin, version}` in `tools/list` (R-EXT-12). |
| R-EXT-16 | **Contributor events (Q14, decided).** A contributor emits an event through the same service: `emit({event, payload, summary?, sessionId?, dedupeKey?})`. The public event name is `<namespace>.<event>`, with the same namespace rule as tools (R-EXT-03): derived from the contributor, never chosen by it, and reserved names refused. The event becomes one mailbox event of type `contributed:<namespace>.<event>` for its one **recipient** pair (R-EXT-17, R-EVS-03), delivered on that pair's `fishball-events` subscription and keyed by the recipient's (token, id) pair (R-ID-06), so one emit wakes at most one agent. |
| R-EXT-17 | **Recipient (Q30, decided).** A contributor event goes to exactly one pair, by the rule of R-EVS-03: with `sessionId`, that session's managing pair, or the designated Fishball pair if the session is unmanaged; without it, the designated Fishball pair. With no recipient, `emit` returns `no-fishball` and nothing is queued. An `emit` whose `sessionId` names no session of this DSH is refused **`event-invalid`** and queues nothing (TQ-14, implementation: routing an unknown session to the designated Fishball would hide contributor bugs). |
| R-EXT-18 | **Event limits.** `payload` is JSON of at most **8 KiB** UTF-8. `summary` is plain text of at most **500** characters. `event` follows the tool-name grammar. Per contributor and recipient, at most **30 events per minute** with a burst of **10**; beyond that `emit` returns `rate-limited`. The event counts toward the recipient's `maxQueuedInputs` (`queue-full` when it is full). A pending event with the same `dedupeKey` from the same contributor makes `emit` return `duplicate` and queue nothing. All limits are frozen connector constants, not settings (freeze at V3-K). Every refusal is a returned code, never an exception into the connector. |
| R-EXT-19 | **Events share the tools' fate.** When a contributor is quarantined (R-EXT-09) or withdrawn (disabled, unloaded, uninstalled), its `emit` returns `contributor-unavailable` and queues nothing, and its events still **pending** (not yet acked) in any mailbox are retired. Events a client has already acked stay with that client. A contributor whose emits keep failing validation counts toward quarantine like failing tool calls. |
| R-EXT-20 | **Contributor events reach Fishball unless intercepted** (Q30, decided). In a Fishball DSH, contributor events are dispatched like every event (R-INT-02): to a plugin that registered for their `contributed:…` type, else to the Fishball agent, through the X9 pipeline (fold-notify may batch them), possibly waking its LLM. Watchdog never registers for them (R-INT-07). No allowlist filters them (Q17, decided). |

### 3.4 Tokens and authentication (R-TOK)

| ID | Requirement |
| --- | --- |
| R-TOK-00 | **The token is the security boundary (verbatim principle, 1.9).** Ids and pairing are foolproofing only and never relax a token rule. Every request needs a valid, enabled token first; nothing about ids, pairs, names or last-seen times is processed or revealed before the token is verified. |
| R-TOK-01 | **Every** MCP request carries `Authorization: Bearer <access token>` issued by the connector's token endpoint (R-OA), **or** the static header pair of R-OA-10 (token value plus `Fishball-Agent-Id`), on every request including `server/discover` and subscription streams. A missing, expired, revoked or foreign access token gets **HTTP 401** with `WWW-Authenticate: Bearer resource_metadata="…", scope="fishball"` (and `error="invalid_token"` when one was presented) [spec: Authorization § Scope Selection Strategy], no MCP processing and no hint about any pair. The **token** (the long-lived secret of a token entry) is presented to the token endpoint as the client secret, or to the MCP endpoint only in the static header form of R-OA-10. |
| R-TOK-02 | A token in a URL query string is refused, even when a valid header is also present. |
| R-TOK-03 | **Creation (amended by 1.27, 1.28).** The user creates a new token for an external agent or a standalone Fishball with **New token** on the connector's own plugin settings page (R-ARCH-03; design §5.9), giving only a label. The value is generated and revealed once (R-TOK-11). Hosted entries are created for the instance with no control and no reveal (R-HOST-05). |
| R-TOK-04 | Token secret values are never in settings documents, logs, lifecycle files, temp files, launch overlays, process arguments, tool results, resource contents, error messages or browser responses, with **one** exception: the single creation response that carries a new value to the reveal modal (R-TOK-11). **Amended by 1.27, 1.28:** the connector keeps only a SHA-256 digest of each value (design §5.1) and no value at all, hosted ones included. A hosted value is stored only in the Fishball child's own credential store (R-HOST-05). |
| R-TOK-05 | Revoking a token takes effect on the **next request**. A request that has already passed the token check when the revocation lands completes normally; the next request is refused (TQ-5, decided A). Open subscription streams of that principal close, and its pending answers to delegated items are refused. What happens to its items depends on the action (TQ-2, decided A; [design §5.3](<v3-design.md#53-revocation>)). **Disable:** its live offers are withdrawn and go to the user in their sessions; **every other** queued event, `ask` included, is kept for **30 days** and is pollable again on re-enable; the designated-Fishball role stays with the entry. **Delete:** all its queued events are dropped and the designated role is cleared (`routing.fishballToken` unset, so R-ROUTE-04's default applies). An `ask_fishball` whose `ask` event is dropped (delete, or the end of the 30 days) answers `unavailable` to the asking session, so it never waits for an answer that cannot come; while the entry is only disabled, the asker keeps waiting (R-CON-05). |
| R-TOK-06 | Token comparison is constant-time, at the token endpoint and wherever else a token is checked. Repeated failed attempts do not reveal which tokens or ids exist. Per-client rate limits apply at the token endpoint; per-principal rate and in-flight limits and the Origin check (R-REM-03) apply to every MCP request, paired or not. |
| R-TOK-07 | Each principal is identified by its token entry plus the bound fishball id, never by MCP `clientInfo`, a session id or any other caller-supplied field. The token entry is the primary key (R-ID-11). |
| R-TOK-08 | **Entries (Q5, amended by 1.27, 1.28).** A token is a list entry in the connector's settings: `label` (shown, not secret), `enabled` (switch) and `key` (the opaque, non-secret entry key the connector wrote when it created the entry). Every value is generated by the connector (at least 256 bits, `fbt_` prefix); there is no user-supplied value, no minimum-length rule and no unconfigured entry. Only `label` and `enabled` can be edited; entries can be removed and reordered. **Duplicates (1.28, R3):** two items with the same `key`, or two entries with the same value digest, are refused: a save that makes one is refused, the previous settings stay, and the settings page shows a notice; one found outside a save (at start, or in a document edited by hand) makes the items involved refuse service (no token request, approval or MCP request succeeds for them) until it is fixed, with the same notice. **An item with no record** (added by hand, never created by New token; 1.29, R5) is treated the same way: a save that adds one is refused with the notice; one found at start is listed with the notice and never authenticates. *Withdrawn by 1.27:* `token-too-short`, `token-unconfigured`, `ref-duplicate`. The value is never shown again after the reveal (R-TOK-11). |
| R-TOK-09 | **Revocation (Q5, amended by 1.27, 1.28).** Switching an entry off, or deleting it, revokes that principal (R-TOK-05). A value never changes, so a changed or unset value is no longer a revocation. Deleting an entry drops its digest; there is no stored value to remove. Switching an entry back on restores the principal. There is no regenerate and no Replace control (1.28, R4): a lost or leaked value is replaced by deleting the entry and creating a new one, which is a new principal (design §5.9). |
| R-TOK-11 | **One-time reveal (1.27, 1.28).** Creating a token opens a modal on the connector's own settings page that shows the new value **once**, with a **Copy** button. The modal is the only place a value is ever shown. Closing it discards the value from the page; no screen, setting, route, log or service can show, return or edit it afterwards. The value reaches the page in a single owner-only response sent `Cache-Control: no-store`, and is never in a URL. **Amended by 1.33 (Q-D3 B):** Close works at any time; a value lost that way is replaced by deleting the entry and creating a new one. |
| R-TOK-10 | **No scopes (Q6, decided).** Every paired token has full manager rights, delegated approvals and questions included (1b). There is no per-token permission setting; disabling or deleting the entry (revocation) is the only per-token control. The `fishball:pair` access-token scope of R-OA-04 is not a permission scope: it exists only until pairing (R-ID). |

### 3.4a OAuth: the connector as its own authorization server (R-OA)

| ID | Requirement |
| --- | --- |
| R-OA-01 | The connector is its own OAuth 2.1 **authorization server** and the MCP endpoint its **protected resource**. On DSH's web listener (R-REM-01) it serves: the protected resource metadata (RFC 9728) at the MCP endpoint's path-inserted well-known URI and in every 401's `resource_metadata`, with `scopes_supported: ["fishball"]`; the authorization server metadata (RFC 8414) at its issuer's path-inserted well-known URI; and the token endpoint. On its own **approval listener** (R-OA-20) it serves only the authorization endpoint (the approval page) and its decision form (R-OA-11); the metadata's `authorization_endpoint` points there. One issuer covers both listeners [spec: Authorization Server Discovery — the AS's endpoints are found through its metadata; 1.16: only the page moves]. The **issuer** and the **canonical MCP URI** follow the checked request host (R-REM-03): for a request that arrived under an allowed host H, the issuer is `<scheme>://H/api/fishball/oauth` and the canonical MCP URI is `<scheme>://H/api/fishball/mcp` [spec: Authorization Server Discovery — the `issuer` in the metadata MUST be identical to the issuer used to build the well-known URL; Authorization § Canonical Server URI; spike V3-S1 Q2]. An access token is valid only for the canonical MCP URI it was issued for. Standard MCP clients work with configuration only (client credentials: URL, client id, secret, expected issuer) or with the endpoint URL only (authorization code, R-OA-13). |
| R-OA-02 | **Grants (1.16, decided).** Exactly two: `client_credentials` (client authentication `client_secret_basic` and `client_secret_post`; the `io.modelcontextprotocol/oauth-client-credentials` extension) and `authorization_code` with **PKCE S256** (R-OA-14). Metadata: `grant_types_supported: ["client_credentials", "authorization_code", "refresh_token"]` (`refresh_token` only for browser clients, R-OA-16); `scopes_supported` never lists `offline_access`, and refresh tokens are issued without it [spec: Authorization § Refresh Tokens, decided per 1.18; spike V3-S7b `141ac3b`: neither SDK needs it], `response_types_supported: ["code"]`, `code_challenge_methods_supported: ["S256"]` [spec: Security Considerations § Authorization Code Protection — clients MUST refuse an AS without it], a real `authorization_endpoint`, `authorization_response_iss_parameter_supported: true` (R-OA-14), `client_id_metadata_document_supported: true` and **no** `registration_endpoint` (R-OA-13), `token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"]`. No implicit, password or device grant, no external authorization server, and no static bearer credential other than the documented token + id header pair of R-OA-10. |
| R-OA-03 | **Client identity.** `client_id` is the client's fishball id (R-ID-02) and `client_secret` is the token value of a token entry. The connector first verifies the token in constant time against the enabled entries (R-TOK-00): an unknown, disabled or revoked token gets `invalid_client` (HTTP 401) and nothing about any pair is revealed. |
| R-OA-04 | **Pair state decides the scope (R-ID; Q-S7-3 settled by 1.17).** There is one scope, `fishball`, and the token response uses only standard fields [spec: 1.17 — no custom field a compliant client must read; S7 found the stock client drops custom ones]. On an unbound token, or a bound token with another id, the token endpoint issues an access token with `scope: "fishball:pair"`, whose only power is discovery, `tools/list` (which then lists `pair` only, as the specification allows: tools/list MAY vary by authorization, [spec: Tools § Capabilities]) and `pair`. On a bound token with its bound id it issues `scope: "fishball"`, full power. A client that requests `scope=fishball` (as a client following the 401 challenge does) while unbound or mismatched is **not** refused: it gets the pair-only token and the response's `scope` says so [spec: OAuth 2.1 §1.4.1, the AS MAY narrow the requested scope and MUST then return the granted scope]. Unknown requested scopes (for example `offline_access`) are ignored the same way. The former `fishball_pairing` field is removed; a client learns `unpaired` versus `id-mismatch` from `pair`'s result (R-ID-03/04). A pair-only token is refused elsewhere with HTTP 403 `insufficient_scope` (R-ID-06). |
| R-OA-05 | **Access tokens** are opaque random strings, stored server-side by digest only, bound to (token entry, fishball id) and to the MCP endpoint's canonical URI as audience (RFC 8707 `resource`, which the client must send). **A token request without `resource` is refused with `invalid_target`** (TQ-3, decided A; confirmed by spike V3-S7 `8e92b84`: the stock `ClientCredentialsProvider` of `@modelcontextprotocol/client` 2.2.0 sends `resource` on both SDKs), as is one naming another resource. Access tokens and their digests are held **in memory only** and are lost when the connector restarts (TQ-5, decided A; refresh tokens of browser clients persist as digests, R-OA-16 (5)); a client then gets 401 and re-authenticates (R-OA-07). Each MCP request looks its token up; an access token presented for another resource is refused. |
| R-OA-06 | **Revocation is immediate.** Disabling or deleting a token entry invalidates every access token derived from it on the next request. Re-enabling an entry does not revive old access tokens; the client simply requests a new one. *(Amended by 1.27: a value can no longer change, so "or changing its value" is withdrawn.)* |
| R-OA-07 | **Lifetime (Q27, decided).** An access token is valid for exactly **3600 seconds** from issue (`expires_in: 3600`); a request at or after expiry gets 401. For `client_credentials` the token endpoint issues **no refresh token**, and a `refresh_token` grant from such a client gets `invalid_grant` (browser clients: R-OA-16). On expiry, or on any 401, the client re-authenticates at the token endpoint with id + token. That is never a pairing and never fails because the token is already bound to that same id. Access tokens are not rotated mid-life; revocation still cuts them off at once (R-OA-06). |
| R-OA-08 | The token endpoint, the metadata and the approval listener follow the exposure rules of R-REM-01/02: loopback by default, TLS for any non-loopback listener. **Plain HTTP on loopback is the one documented departure from the specification (Q-SPEC-1, decided A):** the specification says every authorization-server URL MUST be HTTPS [spec: Security Considerations § Communication Security; OAuth 2.1 §1.5], but DSH's own listener (Q9) and the approval listener are plain HTTP on loopback, so on loopback the connector serves them over HTTP. Every non-loopback host is HTTPS, either directly or through the user's tunnel (R-REM-05). The README states this departure. Spike V3-S7b verifies that the stock DSH client (both SDKs) and the Python MCP SDK keep accepting an HTTP loopback authorization server. The Host and Origin checks (R-REM-03), body limits and rate limits apply. |
| R-OA-09 | The `server/discover` result advertises the extension `io.modelcontextprotocol/oauth-client-credentials`. |
| R-OA-10 | **Static header access (Q-S7B-2, decided 1.25; replaces the withdrawn direct-access form).** A request may carry, instead of an OAuth access token, the **owner-created token value** in `Authorization: Bearer <token value>` together with **`Fishball-Agent-Id`: <fishball id>**. Rules: (1) **detection:** a request with `Fishball-Agent-Id` takes this path, and only this path; without it the bearer is looked up as an access token (R-TOK-01); the old `Bearer <id>.<token>` form and a raw token without `Fishball-Agent-Id` stay invalid (401); (2) **verification on every request:** the value is compared in constant time against the **enabled** token entries (R-TOK-00/06) and the id must be valid (R-ID-02); an unknown, disabled, deleted or too-short value gets the same 401 `invalid_token` as any invalid access token, with no detail; (3) **pairing on first use:** if the entry is **unbound** and the id is held by no other entry, the first such request binds the entry to that id atomically (`pairedAt` set, **no name**, shown as **ID:** <id>), exactly as the approval page does (R-OA-12) — no `pair` call is needed; the request then proceeds with full power; (4) **same pair:** an entry already bound to this id → full power, like a full access token of that pair (R-ID-11); (5) **refusals** after the token was verified, as 401 `invalid_token` with `error_description` **`already-paired`** (the entry is bound to another id) or **`id-taken`** (unbound entry, id held by another entry) or **`id-invalid`**; nothing binds; (6) **no expiry:** the credential is valid until the entry is disabled, deleted or its value changed, which refuses the **next** request and closes its open streams (R-TOK-05); (7) the Host and Origin checks, TLS rule, body limits, rate limits and the shared per-client failure limit apply (R-TOK-06, R-REM-02/03); the value is never logged; (8) a client on this path may still call `set_name` and every other tool exactly as an OAuth client of that pair; there is no refresh and no token endpoint call. `dsh-mcp-client` is supported through this path. This is a documented departure from the MCP authorization specification (1.17). *(Whether an entry must opt in to this path: Q-HDR-1.)* |
| R-OA-11 | **Browser authorization: the page (1.16, Q-OA-5 decided).** `GET <approval origin>/authorize` with a valid request (R-OA-14) shows a page on the approval listener (R-OA-20) that asks for **one thing only: a token** (the value of a token entry the owner created in the connector's settings, R-TOK-03/08). There is no owner login, ticket, code or password: whoever enters a valid token authorizes, whoever they are; the token is the proof [rule: R-TOK-00, the token is the security boundary]. The page shows: the client's `client_name` from its metadata document, marked **unverified**; the **redirect URI's host name**, with an extra warning when every redirect URI is `localhost` [spec: Security Considerations § Client ID Metadata Document Security]; the client id URL's host; this DSH's name and canonical MCP URI; that authorizing gives **full manager rights** over this DSH's sessions, delegated approvals and questions included (no scopes, R-TOK-10); that a token can be used for **one** agent only. Controls: a **token** field (masked, no autofill, never echoed back), an optional **name** field (1.20), **Authorize** and **Cancel**. **Amended by 1.32 (R13):** there is no id field; the agent supplies its id itself after the page (R-OA-22). No secret, token or other principal's data is shown. The page is sent with a restrictive `Content-Security-Policy` and `Referrer-Policy: no-referrer` (spike V3-S7b `141ac3b`). **Approval origin (spike V3-S7b `141ac3b` F4, decided per spec):** on loopback, `authorization_endpoint` uses the hostname the client used with the approval port, and the approval listener rebuilds the issuer from its own `Host` (that hostname plus DSH's port), so `iss` matches what the client recorded; behind a tunnel both are the one tunnel hostname with path routing, so a tunnel needs one public hostname. |
| R-OA-12 | **What entering a token does (Q-OA-5 decided) [rule: one token, one agent (1.8, 1.9); R-ID-03/04; R-OA-03].** On **Authorize**, the connector checks the entered value in constant time against the **enabled** token entries (R-TOK-06), exactly as the token endpoint checks a client secret. Outcomes, all shown **on the page** (never as a redirect carrying the reason): (1) **unknown, disabled, deleted or too-short value** → one uniform message, "this token is not valid", revealing nothing about entries, ids or pairs (R-TOK-00); (2) **valid but already paired** (to a machine or a browser client) **with another id** (R-OA-22: the same id reconnects, 1.33 Q-A2 A) → refused `already-paired`: "this token is already used by an agent; create a new token in the connector's settings", with the bound pair's name and last-seen time (as R-ID-04 allows a caller whose token was verified), and nothing changes; (3) **valid, enabled and unpaired**, then the typed **id** is checked: invalid → `id-invalid`; held by another entry → `id-taken` (R-ID-13); then a non-empty **name** is checked by R-NAME-02: invalid → `name-invalid`, held → `name-taken`; each refusal is shown on the page, binds nothing and leaves the request pending. (4) all checks pass → in one atomic step the entry is **bound** to the typed id, the client id URL and redirect URI are recorded against it, its name is the typed one or **none** if the field was empty (no default, 1.20; the client's `client_name` is only shown as a hint), `pairedAt` is set, and the browser is redirected with a code (R-OA-14). No token entry is ever created by the page. The bound entry is an ordinary principal: listed in native settings with its pair state (R-ID-12), disabled, re-enabled and deleted like any other. The entered value travels only in the form's POST body over the approval listener: never in a URL, redirect, `state`, code, log, page or response, and the page is sent `Cache-Control: no-store`. Re-entering a bound token with the same id reconnects the same principal (R-OA-22, 1.33); with another id it stays `already-paired` (1.9). |
| R-OA-13 | **Client registration (settled by 1.17).** Browser clients register only through **Client ID Metadata Documents**: the `client_id` is an `https:` URL with a path whose document lists `client_id` (identical to the URL), `client_name` and `redirect_uris`; the connector fetches it, validates it and caches it by its HTTP cache headers, with SSRF limits [spec: CIMD draft §3, §4.4, §6.5, §6.6; Security Considerations § Authorization Server Abuse Protection; decided per 1.18]: https only; no private, loopback, link-local or unique-local address, checked **after** DNS resolution; **no redirects** followed; a body over **5 KiB** refused; errors not cached; `max-age` respected. The client-id URL must survive WHATWG parsing unchanged (no dot segments, fragment or userinfo), and the document's `client_id` must equal it by simple string comparison. A document that names `client_secret`, `client_secret_expires_at` or a secret-based `token_endpoint_auth_method` is refused: browser clients are public (`none`) [spec: CIMD draft §4.1] [spec: Client Registration § Client ID Metadata Documents; Security Considerations § Authorization Server Abuse Protection]. **No dynamic client registration** (RFC 7591): the specification marks it deprecated [spec: Client Registration § Dynamic Client Registration]. Machine-exchange clients are pre-registered by their token entry (R-TOK-08) [spec: Client Registration § Pre-registration]. Fetching a document grants nothing; only the owner's approval (R-OA-12) creates a principal. *(That both stock clients support CIMD is spike V3-S7b.)* |
| R-OA-14 | **Authorization request and code rules [spec: Security Considerations § Authorization Code Protection, § Open Redirection, § Communication Security; Authorization § Resource Parameter Implementation, § Authorization Response Validation].** A request is valid only with: `response_type=code`; a `client_id` that is a valid metadata-document URL (R-OA-13); a `redirect_uri` equal to one of the document's `redirect_uris`: an **exact** match, except that a loopback `http` redirect may differ **in port only**; `localhost` and `127.0.0.1` are **distinct** hosts [spec: OAuth 2.1 §2.3.1, §8.4.2; CIMD draft §4.5; decided per 1.18]; each registered redirect is loopback or `https:` [spec: Security Considerations § Communication Security]; `code_challenge` with `code_challenge_method=S256` (plain or missing is refused); and `resource` equal to a canonical MCP URI of this connector (TQ-3 = A applies to both grants). `state` is optional and, when present, echoed unchanged. An invalid `client_id` or `redirect_uri` is shown as an error **on the page** and **never** redirected; any other invalid parameter is redirected with the OAuth error (`invalid_request`, `unsupported_response_type`, `invalid_target`, …), `iss` and `state` [spec: OAuth 2.1 §4.1.2.1; RFC 9700 §4.11.2]. **Every** authorization response, error responses included, carries `iss` [spec: Authorization § Authorization Response Validation; RFC 9207]. The redirect after the form POST is **`303`**, never `307` [spec: RFC 9700 §4.12]. A client secret on the code grant gets `invalid_client`. The authorization code is single-use, bound to (client, redirect URI, code challenge, resource, the approved entry), and expires after **60 s** (K). A second use fails `invalid_grant` and revokes every token issued from it. The token request must repeat the same `redirect_uri`, the `code_verifier` and `resource`. |
| R-OA-15 | **Cancel and expiry.** **Cancel** redirects with `error=access_denied`, `iss` and `state` (if sent), and binds nothing. Leaving the page open past **10 minutes** (K) lets the pending request expire: nothing is bound, and a later Authorize shows "this request has expired, start again from your agent". A pending request survives no connector restart. A refused token (R-OA-12 (1), (2)) leaves the request pending, so the owner can enter another token. |
| R-OA-16 | **Token lifetime for browser clients (Q-OA-2 decided A) [spec: Security Considerations § Token Theft].** Access tokens from the authorization code grant are the same opaque, audience-bound, in-memory, 3600 s tokens as R-OA-05/07, and revocation of the entry cuts them off on the next request (R-OA-06). Each code redemption also returns a **refresh token**: opaque, high-entropy, stored by digest only, bound to (entry, client id, canonical MCP URI). Rules: (1) **rotation:** every `refresh_token` grant returns a new access token and a **new** refresh token and invalidates the old one; (2) **reuse detection:** presenting an already-used refresh token revokes the **whole chain** (every refresh and access token descending from that code) and returns `invalid_grant`; (3) **revocation with the entry:** disabling, deleting or changing the value of the entry invalidates every refresh token derived from it (R-OA-06); re-enabling revives none (the browser client must be authorized again with a new token, since its bound entry stays bound); (4) the refresh grant must come from the same `client_id` and **must carry `resource`** (the same canonical URI), else `invalid_grant` / `invalid_target` [spec: OAuth 2.1 §4.3.1; Authorization § Resource Parameter Implementation, decided per 1.18]; (4a) **refresh race (Q-S7B-1, [impl], decided by Fishball, option B):** a spent refresh token presented again **within 10 s** (K) by the same `client_id` for the same `resource` gets the **identical** successor response instead of counting as reuse, so the stock TS client's concurrent refreshes succeed; after the window, reuse revokes the chain as in (2); the successor is held in memory for the window only (spike V3-S7b `141ac3b` B7b); (5) **refresh tokens survive a connector restart (Q-S7B-3, decided A; the user: "2.A"):** the connector persists each live refresh token as its **digest only**, never the raw value, with its chain id and its entry's generation, in its own storage; access tokens stay in memory (TQ-5). After a restart a browser client refreshes with its refresh token and keeps working; disable, delete or value change of the entry still invalidates the persisted chain (R-OA-06), and the grace window of (4a) does not survive a restart. A maximum chain lifetime is frozen at V3-K (K). *(Python re-authorizes on a 401 while its own clock says the access token is still valid, S7b F3; it recovers once that local expiry passes, at most 3600 s.)* (6) **machine exchange keeps no refresh tokens** (Q27): a `refresh_token` grant presented by a `client_credentials` client, or any refresh token not issued to a browser client, gets `invalid_grant`. Re-entering an already bound token on the page stays `already-paired` (1.9); refresh is the way a browser client keeps working. |
| R-OA-17 | **Shared rules for both grants [rule].** The rate limits, Host and Origin checks and TLS rule (R-TOK-06, R-OA-08, R-REM-02/03) apply to the approval listener as to DSH's listener. Wrong tokens entered on the page count toward the **same per-client failure limit** as the token endpoint, with the same uniform answer. The form is protected against cross-site requests: same-origin only, and a single-use form value bound to the pending request. The token-endpoint rate limit counts `authorization_code` and `refresh_token` grants like `client_credentials`, and still allows the stock client's two token requests per failed call (S7 §4.4). The static header path (R-OA-10) shares the same failure limit and checks. |
| R-OA-18 | **Q-S7-3 settled (1.17).** The stock client drops custom token-response fields, so the connector sends none: pairing state is the standard `scope` (R-OA-04) and `pair`'s result. A browser client's approval binds its pair, so its first access token already has `scope: "fishball"`. |
| R-OA-22 | **The page binds at once; the agent supplies its id (1.32 R13, 1.33 Q-A1 B, Q-A2 A).** On **Authorize** with a valid, enabled token (R-OA-12 (1)), the page binds the entry in one atomic step, with **full rights at once**, to: (a) the id the agent passed in its authorization request as the extension parameter `fishball_id` [spec: RFC 6749 §3.1 lets an authorization server define request parameters; one it does not know is ignored], checked as R-ID-02 (`id-invalid`) and R-ID-13 (`id-taken`) and shown on the page; or (b) when none was passed, a **fixed id derived from the client id URL** (deterministic; design §5.5a), so a generic MCP client works with no extra step. A non-empty **name** is checked by R-NAME-02 (`name-invalid`, `name-taken`). The client id URL and redirect URI are recorded; `pairedAt` is set. **Reconnect (Q-A2 A, R14):** a token bound to an id, entered again with the **same** id (passed, or derived from the same client id URL), gets a new code for the **same** principal: its name, managed sessions and queued events are kept, and the newest client id URL and redirect URI are recorded. Any other id gets `already-paired`. Machine clients are unchanged: their id is their OAuth `client_id`, and they pair with `pair` (R-ID-03). |
| R-OA-23 | **No chain cap (1.32, R14; supersedes R-OA-16 (5)'s maximum chain lifetime and R-OA-16 (7)).** A refresh chain has no maximum lifetime: it lives until reuse revokes it (R-OA-16 (2)) or the entry is disabled or deleted (R-OA-16 (3)). `LIFETIME.refreshChainMaxMs`, the renewal of an ended chain and its `chainsOf` / `renewFromPage` checks are withdrawn. |
| R-OA-19 | **Which grant `fishball-core` uses (amended by 1.31) [rule: R-HOST-05, R-FB-03].** A hosted child uses only `client_credentials`, with the token the instance imported. A standalone or remote-target Fishball uses only the browser authorization of R-OA-11…18 (Connect), as an ordinary public client: it holds no token value and is refused nothing an external browser client may do. The instance never uses either grant itself. |
| R-OA-20 | **The approval listener (1.16, decided: its own port).** The connector opens one HTTP listener of its own for browser authorization, separate from DSH's web listener, so DSH's web-login requirement does not apply to it. It serves only what R-OA-01 places there, and nothing else answers on it (any other path gets 404). It follows the same exposure rule as DSH's listener: loopback-only by default; a non-loopback bind needs TLS (R-REM-02); public reach is through the user's own tunnel (R-REM-05). **Port (Q-OA-7, decided A):** a setting in the connector's native settings form, with a fixed default port frozen at V3-K; the listener is open whenever the connector runs. **On a port clash** the connector logs one diagnostic and reports status **`approval-port-in-use`** (in its native settings status); the MCP endpoint, machine exchange and DSH's UI keep working, and the metadata **keeps** its `authorization_endpoint` (stock clients reject metadata without one, S1/S7), so only the approval page is unreachable until the port is free or changed. Changing the setting rebinds the listener; the metadata follows. Closing or failing the listener never affects the MCP endpoint, machine exchange or DSH's own web UI. It checks `Host` and `Origin` itself, as DSH's listener routes must (R-REM-03). |

### 3.4b Identity and pairing (R-ID)

Foolproofing only (1.9): one token maps to one agent so one event wakes one agent. It never
replaces or weakens the token check (R-TOK-00).

| ID | Requirement |
| --- | --- |
| R-ID-01 | **The credential is token + fishball id** (1.32 R13, 1.33 Q-A1). A machine client presents them at the token endpoint as OAuth client secret + client id (R-OA-03). A browser client presents the token on the approval page and its id as the `fishball_id` authorization parameter, or gets the id derived from its client id URL (R-OA-22). MCP requests then carry only the access token, which is bound to the pair (R-OA-05). |
| R-ID-02 | A fishball id is 1–64 characters of `A–Z a–z 0–9 _ -`, case-sensitive and not secret. **An id never contains a dot** (TQ-1, decided C). An invalid id gets `invalid_client` at the token endpoint, so it can never reach `pair`. `fishball-core` refuses an invalid `identity.id` (a dot included) when the setting is saved, with `id-invalid`, and never sends it. Names are not ids: a name may contain dots (R-NAME-02). |
| R-ID-03 | **Pairing is one explicit MCP tool call, `pair`**, made with an access token from R-OA-04. It binds the caller's id to its token entry, durably and atomically, and returns `{ok: true, paired: true, id, name}`. **The id (1.33):** `pair` is for machine clients; their id is their OAuth client id. A browser client is bound on the approval page (R-OA-22) and never needs `pair`. After it, the same access token gains full power at once (scope is evaluated live). **Only a token with no bound id can pair, and only with an id no other entry holds** (R-ID-13). When two `pair` calls race on one unbound token, exactly one binds; the other gets `already-paired`. When two `pair` calls race on two unbound tokens with the same id, exactly one binds; the other gets `id-taken`. |
| R-ID-04 | **A second `pair` on a bound token always fails**, even with the bound id. It returns the distinct result `{ok: false, code: 'already-paired', bound: {idMatches, boundId, name, pairedAt, lastSeenAt}, advice}`. `idMatches` says whether the caller's id equals the bound id. `advice` is a fixed text: with `idMatches: true`, "continue with this token and id only if no other agent uses this id with this token; otherwise use a new token and a new id" (the id stays held by this entry, R-ID-13); with `idMatches: false`, "use a new token". It is returned only to a caller whose token was verified (R-TOK-00). |
| R-ID-05 | **Normal use and reconnects never pair.** A client whose token is bound to its id just requests access tokens and works, including after a restart or reconnect of either side. "Skip pairing and continue" (R-ID-07) is just this. |
| R-ID-06 | **Delivery keys on (token, id).** Mailbox events, subscription notifications and offers belong to the pair. Only a full access token of that pair may subscribe, poll, ack or answer. One event goes to one pair, and so wakes one agent. **A request needing full power with a pair-only access token gets HTTP 403** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="fishball", resource_metadata="…"` [spec: Authorization § Runtime Insufficient Scope Errors, decided per 1.18]; `error_description` says `not-paired` (unbound) or `id-mismatch` (bound to another id), as a human-readable hint only. A client learns its exact state from `pair` (R-ID-03/04). |
| R-ID-07 | **Fishball side (`fishball-core`; 1.33: after **Connect** the page has bound core's `identity.id`, passed as `fishball_id`, so `already-paired` and `id-taken` are shown on the page; the rules below apply to the token-field and import paths, which use `pair`).** Core calls `pair` only for a token it has not paired before (a local, non-secret "paired" record per target and token reference), never on reconnect. On `already-paired` with `idMatches: true`, the Fishball page shows a warning naming the bound pair's name and last-seen time, with two choices: **Continue with this pairing**, enabled only after the user ticks "No other Fishball or agent uses this id with this token"; or **Use a new token and a new id** (both are needed, because the id stays held by the bound entry, R-ID-13). Until the user chooses, core sends nothing else to the target. On `idMatches: false`, only **Use a new token** is offered. On **`id-taken`** (another entry holds core's `identity.id`), the page says the id is used by another agent on that DSH and asks for a new `identity.id`; the token stays unpaired, so core pairs again with the same token once the id changes. |
| R-ID-08 | **External agents** choose their own id (their OAuth client id); without one they cannot authenticate. They call `pair` once, and decide from its result whether to continue with the pair or switch to a new id and token. The connector never generates or suggests an id. **Browser clients (1.33, R-OA-22):** a Fishball-like agent passes its id as `fishball_id` in the authorization request; any other client gets the id derived from its client id URL. The page asks only for a token and a name. |
| R-ID-09 | A bound token stays bound for the life of its entry. Disabling the entry revokes it (R-TOK-09, R-OA-06) and keeps the pair, so re-enabling restores the same principal. There is no unpair: a new agent needs a new token. |
| R-ID-10 | **Ids in a Fishball DSH.** `fishball-core`'s setting `identity.id` is generated at first start: `fb-` followed by 16 random lowercase base32 characters. The user may set their own instead, within R-ID-02 (else `id-invalid`, and the previous id stays). Changing it after pairing makes core's next token request return `scope: "fishball:pair"` while core holds a paired record; core does not call `pair` again, and its status says a new token is needed. |
| R-ID-11 | **Scope: no anti-impersonation hardening.** Two clients presenting the same token and the same id are the one paired principal. The token entry is the primary key, and ids are also unique per connector (R-ID-13, Q-ID-1 decided A): one id never names two principals. |
| R-ID-12 | The connector records `pairedAt` and `lastSeenAt` (the last authenticated request of the pair) per pair. Its native settings show, per token entry, read-only: paired or unpaired, the bound id, the name, `lastSeenAt` and whether it is connected now. No custom UI. |
| R-ID-13 | **Ids are unique per connector (1.19 for the browser page; Q-ID-1 decided A for `pair`).** An id may be bound to at most one token entry. Pairing with an id that another entry already holds is refused with **`id-taken`** and binds nothing, in `pair` (the approval page takes no id since 1.32) (`{ok: false, code: 'id-taken'}`); the token stays unpaired and can pair again with another id. Ids are compared exactly (case-sensitive, R-ID-02). A disabled entry still holds its id; a deleted entry frees it. Precedence in `pair`: a bound token gets `already-paired` first; an unbound token with a held id gets `id-taken`. `id-taken` is returned only to a caller whose token was verified (R-TOK-00) and says nothing else about the other entry. On the page, the entry also records the client's OAuth `client_id` (metadata-document URL) separately from the fishball id. |

### 3.4c Names (R-NAME)

| ID | Requirement |
| --- | --- |
| R-NAME-01 | Each principal may have a **name**, separate from its id (agreed); a browser client that leaves the page's name field empty has none (1.20). The id is fixed; the name can change at any time. Names are **unique per connector** (Q23, decided). |
| R-NAME-02 | A client reports its name with the MCP tool `set_name({name})`, callable any time with a full access token, or as the optional `name` argument of `pair`. **Normalisation (TQ-6, decided A):** surrounding whitespace is trimmed, every inner run of Unicode whitespace (including `\n` and `\t`) is collapsed to one space **before** the control-character check, and the result is Unicode NFC; that is the stored and displayed name. It must then be 1–64 characters with no control characters, else `name-invalid`. **Uniqueness** compares names case-insensitively (Unicode case folding of the normalised name), so "fishball-2" and "Fishball-2" clash. A `set_name` whose name is held by **another** principal is refused `name-taken`, and the caller keeps its current name. Setting a principal's own current name again, in any letter case, succeeds and changes nothing else (a case-only change is stored). The connector updates every place a name is shown before answering. **A disabled entry's principal still holds its name** (TQ-7, decided by R-ID-09: re-enabling restores the same principal), so another principal's `set_name` or pairing cannot take it; a deleted entry frees it. **Clearing (decided A, 1.23):** `set_name({name: null})` clears the principal's name; it is then shown as `ID: <id>` (R-NAME-08). Clearing an absent name succeeds and changes nothing. |
| R-NAME-03 | `fishball-core`'s setting `identity.name` is the Fishball's name; it defaults to "Fishball" locally (Q-NAME-1 B). Core passes it to `pair`, and calls `set_name` on every later change and after a reconnect whose stored name might be stale. On `name-taken` or `name-invalid` (from `set_name`, or `nameAssigned: false` from `pair`; TQ-6 decided A: both shown the same way, with the reason), the Fishball page shows that the name is used by another agent on that DSH, shows the name actually in use (or that it is shown as `ID: <id>` because it has none), and asks the user to choose another; core keeps working under what the connector holds. |
| R-NAME-04 | **No default names (Q-NAME-1 decided B; supersedes Q22 A).** The connector never assigns a name. A principal that pairs without a usable name, from any client kind, has **no name** until it sets one with `set_name`, and is shown as `ID: <id>` (R-NAME-08). There is no "Fishball", "Fishball-2", … series and no number reuse. `fishball-core`'s local `identity.name` defaults to "Fishball" (R-NAME-03), so a Fishball DSH normally pairs with a name; if that name is held, it pairs nameless (R-NAME-06). A successor (R-HOST-09) takes the old principal's name. |
| R-NAME-05 | Names are shown wherever a principal is shown: managed-session marks, the Hand over control (R-UI-10), the token entry status, the designated-Fishball setting, and connector notes in sessions ("managed by …"). Name collisions are refused (R-NAME-02). |
| R-NAME-06 | **A name clash at pairing never fails the pairing (Q23; Q-NAME-1 B).** If the `name` given to `pair` is invalid or held by another principal, the pairing still succeeds (token and id are bound), the principal has **no name**, and the result says so: `{ok: true, paired: true, id, name: null, nameAssigned: false, nameRefused: 'name-taken' \| 'name-invalid'}`. With a usable name, `nameAssigned: true`. With no `name` given, `name: null` and no `nameRefused`. |
| R-NAME-07 | **Successor names (Q24, Q23).** In the takeover of R-HOST-09 the old entry is deleted and its name (or its lack of one) moves to the new principal in the same atomic step, so the name is never held twice and never refused. The new child usually paired nameless (its `identity.name` was still held by the old entry), and takes the old name in the same step. |
| R-NAME-08 | **Showing a principal with no name (1.20; bold prefix 1.23).** Wherever a name is shown (R-NAME-05) and the principal has none, its id is shown instead, prefixed `ID: ` with the **prefix rendered in bold** (for example **ID:** agent-w-1), so it cannot be mistaken for a chosen name. A chosen name is always shown as plain text, even if it starts with "ID:", which is allowed (1.23, item 3). A nameless principal may set a name later with `set_name`. Names that are absent never clash with each other or with a name. |

### 3.4d Routing between principals (R-ROUTE, Q7 decided)

| ID | Requirement |
| --- | --- |
| R-ROUTE-01 | Each managed session has **exactly one** managing principal: the principal that started it with `session_start`, or the agent the user picked for a Hand over (1.20). `session_release` and Take back clear it. |
| R-ROUTE-02 | A managed session's permission requests, questions and plan reviews become offers **only** in its managing principal's mailbox. No other principal sees or can answer them; an attempt gets `forbidden`. **Reading (decided A, 1.23):** `session_read` and `sessions_list` likewise never show a session another principal manages: reading one by id is refused `forbidden`, and listing omits it. |
| R-ROUTE-03 | `message_fishball` and `ask_fishball` from a managed session go to its managing principal. From an unmanaged session they go to the **designated Fishball principal**. |
| R-ROUTE-04 | The designated Fishball principal is a connector setting (`routing.fishballToken`, one of the token entries). Its default is the hosted Fishball's token entry when one exists (R-HOST-05). With no designated principal set or connected, `ask_fishball` answers `unavailable` at once and `message_fishball` queues (R-CON-09). The default applies **only while `routing.fishballToken` is unset**: creating a hosted entry never replaces a principal the user already designated (TQ-15, decided by the meaning of a default). |
| R-ROUTE-05 | **Hand over (1.20, decided; replaces Q7's designated target for Hand over).** A Hand over from the user names its target: one of the **enabled, paired** principals listed in embed-UI's Hand over control (R-UI-10), connected or not (Q-HO-1 decided C). It makes **that** principal the session's managing principal and emits one `handover` event to its mailbox (R-CON-11); for a disconnected principal the event waits there until it connects, under R-CON-03 and R-TOK-05. Refusals, checked when the request arrives: a target that is **disabled or deleted** by then → `no-fishball`, and the control refreshes; a session that is **already managed** → `conflict`, and its manager is unchanged; no enabled, paired principal at all → no control, and a service call gets `no-fishball`. Take back clears the managing principal and emits one `takeback` event to it. |
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
| R-WATCH-03 | There are **no** watch tools: `session_watch`, `session_unwatch` and `watches_list` are removed, and `session_start` / `session_message` have no `notifyWhenFinished` argument. A client that calls a removed tool gets the MCP "unknown tool" error. Watch notices of V2 are covered by `turn-finished`. A call that still passes `notifyWhenFinished` (or any argument a tool does not declare) is refused as an input-validation error: `isError: true`, code `invalid-arguments` [spec: server/tools § Security Considerations, servers MUST validate all tool inputs; § Error Handling; TQ-12 decided per 1.18]. |
| R-WATCH-04 | On a Q24 succession the watch moves with management: the successor receives the sessions' later events, and none is sent twice. On release or Take back, events already queued for the old pair stay with it; later ones are not produced for it. |
| R-WATCH-05 | **Watchdog and watching:** Watchdog supervises only sessions its Fishball manages, but it receives none of their `turn-finished` or `state` events: those all go to Fishball (R-WD-12). Watchdog gets session information only when its patrol reads the session itself (R-WD-14). |

### 3.4g Interception inside a Fishball DSH (R-INT; Q30 decided)

| ID | Requirement |
| --- | --- |
| R-INT-01 | `fishball-core` holds its pair's single `fishball-events` subscription and provides an **interception service** to plugins in the same Fishball DSH: `intercept({pluginId, types, filter?, priority?}, onEvent) → dispose`, with `priority` defaulting to 0. `types` lists the event types it wants; `filter` is an optional synchronous predicate over the event (for example "only sessions this plugin supervises"). The handler `onEvent(e, ctl)` gets a controller with exactly: **`ctl.accept()`**, which the handler must await before any effect and which makes core's acceptance record durable (1.21); **`ctl.commit(send)`**, the fence around any answer the interceptor sends through core's link; and **`ctl.release(e, {toFishball: true})`** (R-INT-05). A handler that acts before `accept` resolves is a programming error: core treats its effects as not accepted (R-INT-04). The API is frozen in K3. |
| R-INT-02 | For each accepted event, core finds the registrations whose `types` include the event's type and whose `filter` returns true. If there is one, core hands the event to it and starts **no** Fishball LLM turn. If there is none, the event goes to the Fishball agent and may wake its LLM. |
| R-INT-03 | **Conflicts.** When more than one registration matches, exactly one gets the event: the highest `priority`; with equal priority, the earliest registration. The others don't see it. A plugin that registers with the same `types` and `priority` as an existing registration is accepted, but core logs one warning naming both plugins. |
| R-INT-04 | **Failure falls back to Fishball (1.21, S2-Q1/Q-S3-2 decided B).** Core holds each accepted event's record **open** until its handler settles. If the chosen interceptor's handler throws or rejects, or its plugin is off, down or not ready, or its registration is disposed: an event **offered but not accepted**, and an event **accepted but not decided** (no `commit` begun), goes to the Fishball agent, which is woken once; an event whose `commit` has **begun** stays with the interceptor, and only an answer that never reached the connector falls back. After a restart, an open record is offered again to the same plugin, which must dedupe by `eventId`; if that plugin is off or down, the event goes to Fishball once. An event is never lost and never committed twice. The one remaining window (the plugin finished its effect and was then removed before the restart) is harmless for Watchdog, whose effect is an `approval_answer` the connector settles once (OQ-14), and is documented for other interceptors. A filter that throws counts as "no match" for that registration. |
| R-INT-05 | An interceptor that cannot finish an event may hand it back with `release(event, {toFishball: true})`; Fishball is then woken for it (Watchdog's escalation to Fishball, R-WD-09). |
| R-INT-06 | Interceptors are local to the Fishball DSH and gain no authority at the connector: whatever they answer goes out through core's link as the Fishball principal, and the connector's first-commit rule (OQ-14) still applies. |
| R-INT-07 | **Watchdog's interception (amended by 1.34).** Watchdog no longer intercepts in `fishball-core`. The **connector** offers Watchdog, in process and before the managing principal's mailbox, the permission requests of sessions Watchdog supervises while it is healthy, and the `settlement` / `retirement` of offers it held or escalated (open question Q-W1 for what Fishball then sees). Core's interception service (R-INT-01…06, R-INT-08…09) stays, generic, for any plugin in a Fishball DSH (R-EXT-20). |
| R-INT-08 | Core acks an event at the connector only after the receiving side has durably accepted it: for an interceptor, when its `ctl.accept()` has resolved (core's own record); for Fishball, when it is in core's delivery list (R-EVT-03). |
| R-INT-09 | **Interceptor-only events stay out of context (1.21, the user's rule).** An event that an interceptor handles without passing it to an agent leaves **no record in any agent's context**: no message, no notice, no summary, no tool result and no item in Fishball's next turn. Its traces (acceptance, commit, outcome) go only to the background log, with no token or payload secret (R-SEC-02). Core's acceptance and delivery records are internal state and never appear in context. Only what an interceptor deliberately passes on reaches an agent: `release(e, {toFishball: true})`, a waking `manager.notify` (R-WD-08), or the non-waking settlement note of R-WD-09 (3). |

### 3.5 Events: DSH → Fishball (R-EVT)

| ID | Requirement |
| --- | --- |
| R-EVT-01 | Each event of R-EVS-02 is produced once, as one mailbox entry for its one recipient pair (R-EVS-03). |
| R-EVT-02 | An event carries a stable `eventId`, its `type` (R-EVS-02), its source session id, its correlation id (offer id for offers) and a bounded payload. A replayed event has **the same identity**. |
| R-EVT-03 | A Fishball DSH is woken by events: an event that `fishball-core` delivers to the Fishball agent (no interceptor, R-INT-02) starts **exactly one** Fishball turn for it after durable acceptance, also across a lost ack and a restart of the Fishball DSH. If the agent is idle, that turn starts at once; if it is **busy**, the event becomes its **next** turn, never part of the running one (spike V3-S2 `a499141`). Events an interceptor accepts (Watchdog included) start **no** Fishball turn (R-INT-02, R-WD-12). **A crash after admission (S2-Q2, decided A):** if the Fishball DSH crashes after the event was admitted by `Agent.followup` and its turn had started, that interrupted turn **is** the one wake: core does not wake Fishball again, re-deliver the event or add a notice turn; the user sees DSH's own crash notice for the interrupted turn. **The user's Stop wins (S2-Q3, decided A):** if the user stops a Fishball turn, or removes a queued Fishball event from DSH's inbox, **before** the event was admitted, the event is **discarded**: it is acked and never retried or re-woken. Any approval, question or plan review it carried stays live at the connector and waits (R-CON-05); nothing is settled by the discard. |
| R-EVT-04 | An external principal that subscribes gets a notification within the same event dispatch as the commit to its mailbox. One that does not subscribe sees the event on its next poll. |

### 3.6 The Fishball plugin set (R-FB)

These hold in **both** hosted and standalone mode.

| ID | Requirement |
| --- | --- |
| R-FB-01 | **The Fishball plugin set is exactly two DSH plugins (amended by 1.34):** `fishball-core` and `fishball-board`. `fishball-fold-notify` is removed (its function is embed-UI's notify tool, R-FN-01) and `fishball-watchdog` is a main-DSH plugin (R-ARCH-09). A hosted child has nothing else from the instance (no `fishball-hosted-settings`). The library `fishball-shared` (R-ARCH-08) ships inside core, as its bundled dependency. |
| R-FB-02 | Installing the set into an ordinary DSH and restarting it makes that DSH a Fishball DSH: one Fishball manager session; the A-lite Fishball-only page (sidebar, navigation and new-session entries hidden and not focusable, shortcuts remapped or unbound); effective read-only with the private Skills exception; no new sessions (the four DSH-shipped agent presets are **switched off, not deleted**, and only `fishball` and `watchdog` are offered, `fishball` the default; the manager session sees only `read`, `read_image` and `working_directory`, stays read-only, and resumes the same in a new process; 1.24, spike V3-S6 round 2 `7c2230e`); core's patch applied **after** the bundles it guards (R-FB-12); the child-only `fishball-recommended` tab; slim settings. These guards come only from `fishball-core`'s plugin patch, in both modes (Q20, decided). **Amended by 1.34:** Fishball's page has a **Settings** entry that opens `fishball-core`'s own plugin settings page, with DSH's built-in Settings one step away (open question Q-S1 for the exact controls). |
| R-FB-03 | `fishball-core`'s settings name the **target** (the URL of a connector MCP endpoint). Every token is generated (1.31: "不允许主动设置token，只能依靠生成"); the only place one is pasted in Fishball is the write-only field below (1.33). In hosted mode the instance supplies the target URL and imports the token (R-HOST-05). A blank target reports `target-unset`. **The credential (1.29 R7, 1.30 R9, 1.31):** (1) **token field and hosted import:** core holds the imported value in memory until the target first accepts it in a token request, then saves it **once** into its own local credential record for that target origin, and connects with that copy only; (2) **standalone and remote targets:** the user presses **Connect**; core runs the browser authorization of R-OA-11…18 as a public client (authorization code, PKCE S256, `resource`, `iss` checked), the user pastes a freshly generated token on the connector's approval page, and core receives only the OAuth grant (access and refresh token), which it saves **once** after the code exchange succeeds. Either way, a changed target origin is a new first connection (nothing applies to it until a new import or Connect succeeds), and a refused copy (`token-refused`, `token-revoked`, or `invalid_grant` on refresh) stays until a **different** credential is accepted, and then it is replaced. Core never writes or deletes a credential reference the user owns. **Amended by 1.32 and 1.33 (Q-B2):** core's own settings, identical in standalone and hosted mode, always show (a) **Connect** and (b) one **write-only token field** for connecting to a DSH: a freshly generated token pasted there is used with `client_credentials` and core's `identity.id`, saved by R9, cleared from the field and never displayed. In a hosted child the instance's import and Reconnect use the same path (R-HOST-05). (Q-A3 B) Connect also completes from a browser on another machine, through a callback on Fishball's own https web address (design §6.3a). (R12 = B) Connect needs `connect.clientMetadataUrl`, the user-hosted client metadata document: required, no default; without it Connect reports `needs-configuration` and sends nothing. (R13, Q-A1) Connect passes core's `identity.id` as `fishball_id` (R-OA-22). **Amended by 1.34:** core's settings, with the write-only token field and Connect, are on `fishball-core`'s own plugin settings page (no slim settings panel, no settings-section extension point). |
| R-FB-04 | `fishball-core` connects to the target over MCP with OAuth: client credentials with its fishball id and the imported token in hosted mode, or the browser grant from Connect in standalone and remote-target mode (R-FB-03, R-OA, R-ID; 1.31). It reports its name (R-NAME). When the target is unreachable or refuses the credential, Fishball still runs, and its status shows `target-unreachable` or `token-refused` (a Connect grant that is refused or expired shows **Connect** again). It retries with bounded backoff and never sends a credential to any origin other than the target's. A non-loopback target must be `https:`. |
| R-FB-05 | A remote target works with the same tool semantics as a local one: a Fishball DSH whose target is DSH B's connector manages **B's** sessions. |
| R-FB-06 | `fishball-board` installed without `fishball-core` does nothing beyond logging one `fishball-core-missing` line. It never fails the DSH's boot. (Amended by 1.34: board is the only feature plugin left in the set.) |
| R-FB-07 | *Withdrawn (1.34).* Watchdog no longer runs in a Fishball DSH, so a standalone Fishball has no Watchdog to check. Whether a target DSH runs Watchdog shows only as the presence of its contributed tools (R-ARCH-09). |
| R-FB-08 | The set's plugins never read, write or act on the sessions of a DSH other than their own Fishball DSH, except through the target connector's MCP. |
| R-FB-09 | The owner of a Fishball DSH may override any guard in their own profile (hosted or standalone alike). `fishball-core` then **keeps running** and reports `guards-overridden` in its status, naming each overridden guard. Restoring the guard clears the report at the next check. Checks run at app ready, on every `settings/document-updated` and on every `plugin-manager/changed` (spike V3-S6); nothing is published before app ready. Core reads the effective state through public services only: loader entries, `sandboxPolicy`, `ctx.approval.config.policy` (read directly, one test per SDK, 1.24 item 4), `permissionPresets` and `agentPresets`. A DSH-shipped agent preset switched back on, or a default other than `fishball`, is reported like any overridden guard. No guard is re-applied, blocked or hidden by any other component. |
| R-FB-10 | Disabling `fishball-core` turns Fishball off in that DSH, with its guards. That is the owner's choice in both modes; in hosted mode the instance reports `fishball-off` and starts the child anyway. |
| R-FB-11 | **Asks Fishball cannot decide (S4-Q2, decided).** An `ask` event (`ask_fishball`) is Fishball's to answer. When Fishball cannot decide it, it shows the ask to the user **inside its own Fishball page** (hosted frame or standalone web UI) as a card in its conversation: the asking session, the question, and the answer choices or a free answer. The user's answer is committed through core's link as Fishball's answer; the card waits with **no time limit** (R-CON-05). The main DSH shows no card for it (R-UI-12). Approvals and questions that Q13 sends to the user's card in the managed session are unchanged. *(Exact card fields: K3.)* |
| R-FB-13 | **The manager's preset is checked by its tools (spike V3-S6 round 2 `7c2230e`, [impl]).** On resume, core verifies the manager session by its **tool list** (exactly the read-only manager tools, no session-creating tool), not by its recorded preset name, because 0.2.1-rc.5 cannot report a session's preset. A mismatch is reported as `guards-overridden`. |
| R-FB-12 | **Core's patch order (Q-S6-1, decided B; spike V3-S6 round 2 `7c2230e`).** Core's guards take effect only when its bundle is **last** in `dsh.profile.bundles` (a patch only reaches rows that earlier layers inserted). **Hosted:** the instance writes core last when it builds the child profile (R-BND-01), so the child starts guarded. **Standalone:** at its first start core moves itself to the end of the list, using only DSH's public profile functions under the plugin manager's file lock. With HMR on, DSH recomposes live within seconds; with HMR off, the guard holds from the next start; either way core reports `guards-overridden` (naming e.g. `fishball-instance`) **until** the guard holds, then clears it. Core reorders **once**, at its first start in that DSH (recorded locally; later starts that find it last write nothing). If the owner later moves core earlier again, core does **not** move it back, because no guard is re-applied against the owner (R-FB-09, Q20); it reports `guards-overridden` for the guards that no longer apply. |

### 3.7 Hosted mode: what the instance adds (R-HOST)

| ID | Requirement |
| --- | --- |
| R-HOST-01 | **Launch.** The instance keeps one private child DSH under the host DSH (its own home and profile). At every child start it places the Fishball plugin set (`fishball-core`, `fishball-board`; 1.34) from its own package into the child profile, before the profile loads (R-BND), and removes any `fishball-fold-notify`, `fishball-watchdog` or `fishball-hosted-settings` row an earlier version placed. Hosted mode adds only launch, placement, lifecycle, automatic token set-up, the child locator, model sync and the hosted-only settings sections (R-HOST-11); it adds **no guard** of its own (Q20, decided). |
| R-HOST-02 | **Lifecycle.** The child starts after the host's app ready signal, and can be stopped, restarted and retried. Crashes and failed starts show a status code. When the host DSH exits, the child stops. Uninstall cleanup removes the child runtime after offering the board archive export (R-BRD-02). **Amended by 1.33 (Q-B3 B):** uninstall never touches the connector's hosted token entries; a dead one stays until the user deletes it. |
| R-HOST-03 | Starting, stopping and restarting the child never changes the host DSH's settings, sessions, credentials or shortcuts. |
| R-HOST-04 | **Launch configuration only.** The instance's launch overlays carry only what a hosted child needs to run under its host: HMR off, the child's own web origin and port, the admission key for embed-UI's tickets, and the target URL. They carry **no** guard rows, force no plugin on, and do **not** carry the hosted-only settings sections, which are a placed bundle (R-HOST-11; TQ-R4, decided B). |
| R-HOST-05 | **Target and token (Q8, revised by 1.9 and 1.30).** The instance's native settings name the target (blank = a connector in the same host DSH); they hold no token or credential reference (1.31: nobody sets a token by hand; R-FB-03). **Same-DSH connector (the instance's import, a convenience):** whenever the child needs to pair (core holds no saved copy for the target), the instance asks the connector for a **new** token entry, "Fishball (hosted)"; the connector returns its entry key and its value **once, to the instance only** (an in-process host-only service, never to a UI) and keeps only the digest (1.28); the child authenticates with its own id and calls `pair`. A hosted child therefore never meets `already-paired`; if it does, the instance creates another new token. A child restart or reconnect reuses the paired token and id and creates nothing. Each such entry is visible and revocable like any other. **Remote target (1.31):** the user creates the token in that connector's DSH (R-TOK-03), copies it from the reveal modal (R-TOK-11), presses **Connect** in Fishball and pastes it on that connector's approval page, exactly as in standalone mode (R-FB-03); the instance imports nothing. **Where a hosted value lives (1.28 R1, 1.33 Q-B2):** the child is an ordinary Fishball and its host an ordinary DSH; the instance is a convenience that enables it and connects it. Its automatic import and its **Reconnect** (on the instance's own settings page, Q-D1 B; always shown) feed core's ordinary token path, and the user may also paste a token in core's own field or use Connect. The automatic import it passes the main DSH's token to the child **once**, at the child's first start, over the authenticated lifecycle wire, into core's import entry point inside the child; core saves it in the child's **own** credential store after the first accepted token request (R-FB-03). The host DSH keeps no copy, so a host or child restart re-sends nothing. The value is never in a process argument, environment variable, launch overlay, lifecycle file or log, in the host or the child. |
| R-HOST-06 | **Child locator.** The instance publishes a host-only service for embed-UI: child state and status code, the child web's own origin for the loopback hostname the caller names (R-UI-02), a single-use admission ticket bound to that hostname, Retry and the target status. It publishes nothing to browsers itself. |
| R-HOST-07 | **Model sync.** The hosted-mode provider and model sync from the host DSH into the child stays, started only from the **instance's own plugin settings page** (amended by 1.33 Q-D2: embed-UI manages nothing; the V2 decision of 2026-11-11 placed it on embed-UI's Plugins card). Standalone mode has none: a standalone DSH has its own native model settings. |
| R-HOST-11 | *Withdrawn (1.34: "hosted setting去掉").* There is no `fishball-hosted-settings` bundle and no settings-section extension point in `fishball-core`. A hosted child's settings are `fishball-core`'s own plugin settings page, the same as in standalone mode; the instance's status, Retry, Reconnect and model sync are on the instance's own settings page on the host (R-ARCH-05). |
| R-HOST-08 | The "watchdog is down" notice of a child that cannot start is kept by the instance and delivered to Fishball once the child next starts. |
| R-HOST-09 | **Reinstall succession (Q24, decided).** When the child loses its identity (child home removed or reinstalled), the instance creates a new hosted token and the new child pairs with a new id. As soon as that pairing succeeds, the instance asks the connector to make the new principal the **successor** of the previous hosted entry it created (only an entry the instance itself created, never a user-made one). In one atomic step the connector: moves every session the old principal managed to the new one; moves the designated-Fishball role if the old one held it; gives the new principal the old one's name; re-issues the old principal's live offers into the new principal's mailbox with **new offer ids**, so an answer to an old id fails `expired`; moves its pending events, keeping their `eventId`s; then deletes the old entry (its digest; no value is stored on the host, 1.28). Each moved session gets exactly **one** `system` note naming the new principal. If the step fails, nothing moves, the old entry stays, and the instance retries at its next start. The **user's** own answer to such an offer's card is never refused `expired` because of a succession (spike V3-S3); only an agent answering the old id is. **Implementation (Q-S3-1, decided as an implementation detail of Q24 A + OQ-14):** each request has **one** settlement record; its offer id carries a revision (`<request>.r<n>`), and succession issues `r<n+1>` to the new principal in the same registry write (spike V3-S3). The user answers the request's card, not an offer id, so a succession never refuses the user. *(K1 freezes the offer-id format.)* |
| R-HOST-10 | **User revocation.** When the user disables a hosted entry, the instance never creates a replacement on its own: the child reports `token-revoked`, and re-enabling restores it. When the user **deletes** the hosted entry, its sessions become unmanaged (R-ROUTE-06). **Amended by 1.29 (R6 = B), 1.32 (R11) and 1.33:** the instance never creates a new hosted token automatically, Retry included. Retry shows a notice with the ways to replace it: **Reconnect** on the instance's own settings page (a new hosted entry, its value imported once), or a newly generated token pasted in core's token field in the child (opened through embed-UI's frame), or Connect. **Replacing moves nothing (Q-B1 B):** the old entry keeps its name, role and sessions until the user deletes it by hand. Succession (R-HOST-09) applies only to a reinstall, never to a user's delete or a replace. |

### 3.8 Embed-UI (R-UI)

| ID | Requirement |
| --- | --- |
| R-UI-01 | Embed-UI's **Fishball page** works only with a hosted instance in the same DSH. It finds the child **only** through the instance's child locator (R-HOST-06). Without it (instance absent, disabled or older), embed-UI registers no frame and logs one `instance-missing` diagnostic. With a connector but no instance it still provides marks, Hand over / Take back, the fish and its dots, and its contributed tools (R-UI-08). With neither, it does nothing. |
| R-UI-02 | With the instance present, embed-UI shows the Fishball sidebar entry. Opening it frames the child's native page at the child's own origin, through a single-use admission ticket. No credential is placed in the frame URL. **Hostname (S4-Q1, decided A; spike V3-S4 `b9809b7`):** the child's login cookie is `SameSite=Strict`, so the frame URL uses the **same loopback hostname as the main page's request** (`127.0.0.1`, `localhost` or `[::1]`) with the child's own port, and the admission ticket is bound to that hostname. The child is reachable under all three names. If the main page was reached under any other name (or the child is not reachable under the one used), embed-UI's admit route refuses and shows "Open DSH at 127.0.0.1 to use Fishball" instead of a frame. Opening the Fishball page through a tunnel or a non-loopback name is out of scope. |
| R-UI-03 | Embed-UI never shows a token. **Amended by 1.33 (Q-D2):** the child's status and Retry are on the instance's own settings page (R-ARCH-05), not around embed-UI's frame. |
| R-UI-04 | With a connector in the same DSH, embed-UI declares its notification tools through the connector's contribution service (R-EXT-13) under its own namespace, and draws the fish's lights and the notices from the connector's state (1.34: the latch is the connector's). It registers no MCP server or HTTP endpoint of its own. |
| R-UI-05 | **Marks and Hand over (Q3, decided).** With a connector in the same DSH, embed-UI draws managed-session marks (each showing its managing principal's **name**) the Hand over control (R-UI-10) and the Take back button. Clicking one makes embed-UI call the connector's host-only hand-over service in-process; the connector then emits the event to the target principal (R-CON-11, R-ROUTE-05). Embed-UI learns marks and names from the same service and refreshes when it reports a change. This works with or without an instance (R-UI-08). **Amended by 1.34:** embed-UI only draws; every Hand over, Take back and mark state is the connector's, read and changed through the connector's owner-only routes. |
| R-UI-06 | Embed-UI stores no secret and has no settings card (1.33 Q-D2). |
| R-UI-07 | Embed-UI never frames a standalone Fishball. A standalone Fishball's own DSH web is its Fishball page. |
| R-UI-08 | **Connector without instance (Q18, decided).** In a DSH with a connector but no hosted instance, embed-UI shows the managed marks with principal names, the Hand over control (naming its target agents, R-UI-10) and Take back, and the sidebar fish with its attention dots, and it contributes its attention tools (R-EXT-13). It shows **no** Fishball page and no frame, and its fish has no page to open. With neither a connector nor an instance in the DSH, embed-UI registers nothing and does nothing. **Amended by 1.33 (Q-D4):** with a connector and embed-UI but no instance, the fish shows a hint that the Fishball page needs the instance plugin; with the connector alone there is no fish and no UI change. Whether the marks, Hand over, attention and records stay is the open question Q-F1. **Amended by 1.34:** the marks, Hand over, attention and records stay (they are the connector's UI); embed-UI's own role is drawing them. |
| R-UI-09 | **Instance with a remote target, no connector here (Q4, decided).** Embed-UI shows the Fishball page, status and Retry as usual. It shows **no** attention dots, managed marks or Hand over / Take back in this DSH, and contributes no tools here. Fishball's attention signal lights no fish in **this** DSH. Fold-notify's call goes to the remote connector: it lights the remote DSH's fish if that DSH runs embed-UI, else it gets `unsupported-operation` (D3). There is **no** private relay over the instance's lifecycle wire; every Fishball ↔ DSH path stays MCP. Hand over for the remote DSH's sessions happens in the remote DSH (R-UI-08). With an instance but no local connector (row 7), the sidebar entry shows the fish **unlit** (it opens the page, and there is no latch here); it never lights (S4 F3, implementation). **Amended by 1.34:** with no connector in this DSH, what embed-UI shows is open question Q-U1. |
| R-UI-10 | **The Hand over control (1.20, decided).** On an unmanaged session, embed-UI lists every **enabled, paired** principal, online or not (Q-HO-1 decided C). With none it shows no control; with **exactly one**, one button "Hand over to <name>", or "Hand over to ID: <fishball id>" when that principal has no name; with **more than one**, a dropdown "Handover to…" whose rows are those principals, each by name or as "ID: <fishball id>" with the `ID:` prefix in bold (R-NAME-08), in a stable order (K). **Status light:** every dropdown row, and the single button, carries an icon that is **green** when the principal is online (an open `fishball-events` listen stream now) and **red** when it is not, with a text alternative ("online" / "offline") for accessibility. Lights, names and the list refresh **live** when the connector reports a change of connection, name, entry state or managed state (R-UI-05), with no page reload. Choosing a row, or pressing the single button, hands the session to that principal (R-ROUTE-05). The fixed label "Hand over to Fishball" no longer exists. All label text comes from embed-UI's locale files. A managed session shows Take back instead. |
| R-UI-11 | **The Fishball entry (S4-Q2, decided: sidebar entry).** Embed-UI's one Fishball entry on the main DSH is the **sidebar Fishball entry** with the fish (R-UI-02 with an instance; R-UI-08 without one). It does **not** override DSH's top-right brand mark: the `sidebar.brand.mark` / `sidebar.brand.name` slots are not used. Reason: spike V3-S4 proved the sidebar slots on both SDKs, the brand slots were not exercised, and a brand override would change the host UI for every user of that DSH. |
| R-UI-12 | **No pending-approval controls for `ask_fishball` (S4-Q2, decided).** The main DSH shows **no** Allow once / Reject (or any other answer) control for an `ask_fishball` call; nobody answers an ask from the main DSH's session, and the asking session waits for the answer (R-CON-08). The call is shown as a read-only record (R-UI-13). |
| R-UI-13 | **Inline records in the managed session (Q-S4-2b, decided B).** In a session that sends something to Fishball, embed-UI draws a **read-only record**, inline like a tool-use row, when the session **sends** the request and when it **receives** the answer: (1) an `ask_fishball` call: the question, then the answer that came back; (2) a permission request of a managed session that went to its managing principal: the request, then the decision (allowed, rejected, or sent to the user's card, with the user's later answer). Each record names the principal it went to, by name or `ID: <id>` (R-NAME-08), from the hand-over service's existing `managed()` data. The records are built only from the session's **own** DSH events (its tool call and result, its approval request and resolution): there is **no** new hand-over-service member and **no** connector read API (the user: "这完全是在DSH内发生的事，完全可以在DSH内自己判断，自己绘制"). Records carry no answer control. Embed-UI draws them only with a connector in the same DSH (rows 6, 8); without embed-UI the session shows DSH's generic rows. *(If either SDK does not expose a received decision in the session's own events, that is one question to the user, raised by the task that builds it.)* **Amended by 1.34:** the record content comes from the connector's read service, which builds it from the session's own events; embed-UI only draws it. |

### 3.9 Remote DSH (R-REM)

| ID | Requirement |
| --- | --- |
| R-REM-01 | **Listener (Q9, decided).** The MCP endpoint (`/api/fishball/mcp`), the OAuth metadata and the token endpoint are routes on **DSH's own web listener**. There is no separate port, listener or TLS setting for them. The one exception is the browser-authorization approval listener (R-OA-20, 1.16). Their reach follows the user's existing DSH web configuration, so they are loopback-only unless the user has exposed DSH's web listener. |
| R-REM-02 | A non-loopback endpoint is served over TLS. Plain HTTP on a non-loopback address is refused at load, with a diagnostic. A user-run tunnel to a loopback endpoint is the supported alternative. |
| R-REM-03 | The connector itself validates **`Host`** and **`Origin`** on every request to its routes and its approval listener, because DSH's own `/api` protection does not cover these routes (spike V3-S1 (a)). Allowed hosts: the loopback names, the listener's bind address and the hosts in DSH's `--trusted-host` list (S1 (b)); any other `Host` is refused before authentication. A present `Origin` outside the allowlist gets **HTTP 403** [spec: Streamable HTTP security requirement]. |
| R-REM-04 | Losing the remote connection never stops managed sessions on the remote DSH. Delegated items for an unreachable principal wait, per R-CON-05. |
| R-REM-05 | **Public exposure through the user's tunnel (Q-OA-5 decided: "至于公网暴露的问题，交给用户自己去搭Tunnel").** The connector builds no tunnel, relay or public-exposure feature. It must work correctly **behind** a tunnel the user runs that forwards to the loopback listeners: (1) `Host` and `Origin` are checked against DSH's `--trusted-host` list (R-REM-03); (2) the issuer, the canonical MCP URI and the `authorization_endpoint` follow the checked `Host` (R-OA-01); (3) the scheme in them is `http` for a loopback `Host` and `https` for any other allowed `Host`, because a non-loopback name can only be reached through TLS (R-REM-02, the user's tunnel terminating it) [rule: R-REM-02 + spec Security Considerations § Communication Security]; no forwarded-scheme header is trusted. The README documents the set-up: both the DSH listener and the approval listener need forwarding, and clients that run on someone else's servers (for example Claude's hosted connectors, which call from Anthropic's servers) can only reach a connector through such a tunnel. |

### 3.10 Watchdog (R-WD)

| ID | Requirement |
| --- | --- |
| R-WD-00 | **Watchdog is Fishball's helper in the main DSH (Q10, decided; moved by 1.34: "watchdog我改主意了，移动到dsh内，而不是fishball内").** It acts only on sessions a principal manages, only on that principal's behalf (open question Q-W3 for which principals), and never as a principal of its own. What it decides is committed through the connector as that principal's helper (R-ARCH-09). |
| R-WD-01 | **Where Watchdog runs (amended by 1.34).** Watchdog runs in a **main DSH**, beside `fishball-connector`, and only with the connector present; without it, it logs one `fishball-connector-missing` line and does nothing. No Watchdog code, settings or UI runs in a Fishball DSH. |
| R-WD-02 | **How Watchdog sees requests (amended by 1.34).** Watchdog opens no MCP subscription. The connector offers it, in process, the permission requests of the sessions it supervises (R-INT-07 as amended), and Watchdog answers through the connector's host-only supervision service. Watchdog has no token, principal or mailbox of its own. Revoking the managing principal ends its supervision of that principal's sessions (R-WD-11). |
| R-WD-03 | **Watchdog is activated in exactly two cases (1.14; Q33 decided):** (1) a permission request of a session it supervises that needs judging (R-INT-07); (2) its own patrol timer firing for a supervised session (R-WD-04, R-WD-14). Nothing else activates it: no session event, question, message, contributor event, or request from Fishball. There is no `check_now` tool, and no Fishball operation starts a Watchdog run (Q33: Watchdog is assigned passively). **Amended by 1.35:** both activations also check the session against its purpose (drift): the patrol on its timer, and the judgement at every permission request. |
| R-WD-04 | Patrol checks of one session are exactly one per `minCheckIntervalSeconds`, at least that far apart: default **1740** (29 min), integer, inclusive range **60–86400**. At the bounds, 60 and 86400 are accepted and 59 and 86401 are refused. A patrol fires once per interval per supervised session, whether or not the session produced anything new. Permission requests are never delayed or throttled by the interval. **First patrol (TQ-9, decided by R-WD-03/R-WD-15: no Fishball operation starts a Watchdog run):** a session's first patrol is one interval after its claim begins, and after `watchdog_resume` one interval after the resume; neither starts a run at once. |
| R-WD-05 | There are no approval timers, no hourly or daily call caps, no stall, idle or paused-poll timers and no per-brief schedule overrides. The hung-check timeout and the bounded start attachment carried over from T0 are failure bounds, not pacing. |
| R-WD-06 | Watchdog's model follows DSH's native session behaviour: a model change applies at the next not-yet-prepared model step. Saving settings performs no model lookup. |
| R-WD-07 | Any Watchdog failure (load, readiness, loss of its interception registration, model or provider error, budget, store, claim, attach, runtime) makes Watchdog **effective off** at once. Its claims are released; items it was offered or accepted but had not decided go to Fishball; an answer whose `commit` had begun stays its own (committed or fenced, never both, R-INT-04); stale callbacks are fenced. Fishball is told **"watchdog is down"**: one notice each time Watchdog goes down, including with zero supervised sessions and when the Fishball DSH could not load it (R-FB-07, R-HOST-08). A failure never stops or restarts a watched session. **Amended by 1.33 (Q-C2 A):** a failed Watchdog does not retry on its own; it comes back at the next DSH start, or when the owner switches it off and on, and Fishball is told "watchdog is down" once per failure. |
| R-WD-08 | **Watchdog to Fishball (amended by 1.34).** Watchdog's escalations, "watchdog is down" and reports reach Fishball as connector `notice` events in the managing principal's mailbox (R-CON-02), never through a Fishball DSH's in-session communication. |
| R-WD-09 | **Decision rules (Q13, revised by 1.35).** For a permission request of a session it supervises, Watchdog first checks the session against its **purpose** (drift, R-WD-03), then decides exactly one of: (1) **allow**: the request falls within the **approvable scope**; (2) **reject**, with a justification: beyond the purpose **and** dangerous (U16, kept); (3) **to the user**: any other high-risk request, committed as `escalate`, so the connector shows a user card in that session with no time limit and **no Fishball turn** starts; (4) **to Fishball**: everything else, including every request when no scope was given; it is re-routed to Fishball, which is woken. The open questions Q-W5 (a high-risk request inside the scope) and Q-W6 (what drift found at a request does) refine (1) and the drift step. When the user settles a card from (3), Fishball gets the outcome as a non-waking note at its next turn; Watchdog gets it at once. Questions and plan reviews never reach Watchdog (U21). While Watchdog is off or down, everything goes to Fishball (R-WD-07). Each allow is one answer to one request: the scope is judged per request and never becomes a standing grant at the connector (DESIGN.md "no always allow"). |
| R-WD-10 | Pausing supervision of a session stops that session first. A failed stop is reported and not recorded as paused. |
| R-WD-11 | One Watchdog side session supervises one session (U8). Permission requests of a claimed session go to Watchdog only while it is healthy. Without a claim, they go to Fishball. **When Fishball stops managing a supervised session** (`session_release`, Take back, revocation or succession away from it; TQ-11, decided by R-WD-00): Watchdog's claim on it ends at once and its patrol timer is cancelled, with no stop of the session and no extra notice to Fishball (it already gets the `takeback`, or made the release itself; R-INT-09). |
| R-WD-12 | **Routing (redefined by 1.14; replaces Q25's split).** For a session supervised by a healthy Watchdog, **only its permission requests** go to Watchdog (R-INT-07), and they start no Fishball LLM turn. Every other event of that session (every `turn-finished`, mid-work or idle; `state`; questions and plan reviews; `message_fishball`, `ask_fishball`; Hand over / Take back) goes to Fishball, as do all events of unsupervised sessions and everything while Watchdog is off or down. A Watchdog **escalation to Fishball** (only for a request that is not high-risk and that Watchdog cannot decide, R-WD-09) sends the request back to Fishball, which is woken for it. A high-risk request goes to the **user** instead, with no Fishball turn (Q13). |
| R-WD-13 | *Withdrawn (1.14).* The idle-stop bypass is no longer needed: no `turn-finished` event reaches Watchdog. The ID stays reserved so earlier references remain traceable. |
| R-WD-14 | **Patrol reads the session itself (1.14).** When the patrol timer fires for a supervised session, Watchdog reads what it needs through `fishball-core`'s link with its own operation list: `sessions_list` for that session's running and pending-interaction state, and `session_read` for the messages since its last patrol watermark, bounded by its read limits. It needs no `turn-finished` or `state` events. A patrol that finds a problem reaches Fishball only through Watchdog's usual escalation or report (R-WD-08, R-WD-09); a patrol that finds nothing wakes nobody. A failed read is a Watchdog failure (R-WD-07). **Amended by 1.34:** the patrol reads through the connector's supervision service in process, not through `fishball-core`'s link. **Amended by 1.35:** the patrol compares what the session did since the watermark with its purpose; what a found drift does is open question Q-W6. |
| R-WD-15 | **Fishball's two instructions (1.35; replaces the brief and criteria of Q33/U2).** For each session it hands to Watchdog, Fishball gives the session's **purpose** (required; `watchdog_brief({sessionId, purpose, scope?})` without a purpose is refused `invalid-arguments`) and optionally an **approvable scope**: plain text describing the requests Watchdog may pass. `watchdog_refine({sessionId, purpose?, scope?})` replaces either (a `scope` of `null` clears it); it is stored at once, returns immediately and starts no check, side-session turn or model call; Watchdog uses the latest values at its next activation. A refine never moves the patrol timer. There is no `watchdog_check_now`. `watchdog_pause` and `watchdog_resume` keep their meaning (pause stops the session first, R-WD-10) and start no run. All four are tools Watchdog contributes to the connector (1.34), called by Fishball over MCP. Purpose and scope are capped at 4000 code points each (K). |
| R-WD-16 | **Watchdog's own agent preset (1.24).** Watchdog's side sessions run the agent preset `watchdog`, which `fishball-watchdog` contributes; it is not a DSH-shipped preset, so core never switches it off. It holds only what Watchdog's judgements and patrols need through core's link (R-WD-14), and no session-creating tool. With Watchdog disabled the preset is absent. (spike V3-S6 round 2 `7c2230e`: offered, read-only tools.) **Amended by 1.34:** whether Watchdog still runs side sessions with an agent preset in the main DSH is open question Q-W4. |

### 3.11 Placement, board and fold-notify (R-BND, R-BRD, R-FN)

| ID | Requirement |
| --- | --- |
| R-BND-01 | **Hosted mode:** the whole Fishball plugin set, and the hosted settings bundle `fishball-hosted-settings` (R-HOST-11), ship inside the `fishball-instance` package. On every child boot they are copied into the child profile before the profile loads, with `fishball-shared` beside them as core's dependency. **Strict (TQ-R3, decided B):** the host DSH never resolves, lists or loads these plugins, **nor any module from them**: no host file imports or requires a module of the set or of `fishball-hosted-settings`; the instance only copies their files as data. What the instance host shares with the child comes from `fishball-shared` (R-ARCH-08). **Amended by 1.34:** the set is `fishball-core` and `fishball-board`; `fishball-hosted-settings`, `fishball-fold-notify` and `fishball-watchdog` are no longer placed. |
| R-BND-02 | **Hosted mode:** the first placement turns each of the four plugins, and `fishball-hosted-settings`, on. A later disable survives restarts and instance upgrades. A plugin deleted while off is placed again **off**. This applies to `fishball-core` as to the features (R-FB-10). **Amended by 1.34:** the set is `fishball-core` and `fishball-board`; `fishball-hosted-settings`, `fishball-fold-notify` and `fishball-watchdog` are no longer placed. |
| R-BND-03 | **Hosted mode:** an enabled set member, or an enabled `fishball-hosted-settings`, that is incompatible with the running DSH (or fails to load) **blocks the child's start**. The status names the plugin and the reason. **Amended by 1.34:** the set is `fishball-core` and `fishball-board`; `fishball-hosted-settings`, `fishball-fold-notify` and `fishball-watchdog` are no longer placed. |
| R-BND-04 | **Hosted mode:** switching a feature plugin or `fishball-hosted-settings` on or off takes effect at the next child restart. The UI says "restart required", never "live". **Amended by 1.34:** the set is `fishball-core` and `fishball-board`; `fishball-hosted-settings`, `fishball-fold-notify` and `fishball-watchdog` are no longer placed. |
| R-BND-05 | **Standalone mode:** the user installs, enables, disables and removes set members with DSH's native plugin management, and DSH's own rules apply (for example, DSH skips an incompatible bundle at boot rather than failing). `fishball-core` reports a missing or skipped member in its status. "Missing" means **enabled but skipped or failed to load**; a feature plugin that is simply not installed is not reported (TQ-17, decided by install-matrix row 13b: core alone is a full Fishball DSH). |
| R-BRD-01 | Board records are never deleted while installed. A done item stays visible for **30 days** unless cleared early, and stays archived after that. `board_search` finds archived items by keyword. |
| R-BRD-02 | Removal offers an archive export before deleting board data: the instance's uninstall in hosted mode (Q-S = A). In standalone mode DSH's native remove has no hook, so `board_export` is a manager tool and the README tells the user to run it before removing (design §8.3). |
| R-FN-01 | **Notify (1.34: "fold-notify去掉，这个应该是embed UI给connector提供的注入的额外工具，可以由fishball调用").** `fishball-fold-notify` is removed. Its function is a tool that `fishball-embed-ui` contributes to the connector (R-EXT-01), which Fishball calls to notify the user in the main DSH UI: the connector holds the notice and the attention state, and embed-UI draws them (what exactly it shows: open question Q-N1). With embed-UI absent the tool is absent from `tools/list`. Folding Fishball's own replies in its page goes with fold-notify (open question Q-N2). |

### 3.12 Migration (R-MIG)

| ID | Requirement |
| --- | --- |
| R-MIG-01 | A V2 user who upgrades the connector and the instance and installs embed-UI ends up with a working Fishball page and session list. There is **no migration** of earlier sessions (1.24: nobody installed V2): each leftover session is **archived**, which is DSH's public "discard" (spike V3-S6 round 2 `7c2230e`: DSH has no public session delete), with no crash, and stays archived after a restart; it is not resumed. Skills and child settings are kept. |
| R-MIG-02 | The first V3 child start converts the V2 instance-owned rows into the plugin set: all four set members and `fishball-hosted-settings` are placed, core on, the three feature plugins and the hosted settings bundle on at first placement. The V2 manager session is archived, not resumed: the first V3 start begins a new manager session under the `fishball` preset (1.24, R-MIG-01). |
| R-MIG-03 | Mixed versions fail visibly before any delegation, with no compatibility shim: a V3 `fishball-core` against a V2 connector gets 404 on the MCP route and reports `TARGET_INCOMPATIBLE`; a V2 instance against a V3 connector finds no `fishballConnector` service and reports `connector-upgrade-required`. |
| R-MIG-04 | V2 connector settings that V3 still uses keep their values. Settings V3 dropped are ignored, never re-rendered (D2 rule). |
| R-MIG-05 | A V2 user's first V3 start, with the connector and the instance in one DSH, leaves them a usable token without a manual step (R-HOST-05). |

### 3.13 Compatibility and security (R-COMPAT, R-SEC)

| ID | Requirement |
| --- | --- |
| R-COMPAT-01 | All V3 packages, including every member of the Fishball plugin set, work on DSH **0.2.1-rc.5** and **0.2.2-rc.1**, verified separately on each and in both modes, with no version-specific behaviour visible to the user. **Baseline (Q-S3-3, decided by Fishball under the user's standing rule "盯着DSH最新的0.2.2版本"):** 0.2.2-rc.1 is the 0.2.2 baseline (npm's `latest`); the spike probes are re-run when 0.2.2 final ships. **No cross-version matrix (decided B, 1.23):** a Fishball DSH and its connector's DSH are checked on each SDK separately; mixed pairs (rc.5 ↔ rc.1) are not a separate check, because the two sides talk only over MCP and no cross-version dependency should exist (the user's reason). |
| R-SEC-01 | In a main DSH, the connector is the only Fishball component with **Fishball authority** over its sessions. The instance and embed-UI hold none (R-ARCH-05). Other plugins keep their own ordinary DSH authority and gain none from Fishball (Q1, Q14). |
| R-SEC-02 | No component logs a token, a credential value, an admission ticket or the `Authorization` header. A test that greps every log, lifecycle file, child home and temp directory after a full run finds none. |
| R-SEC-03 | The MCP endpoint applies body, frame, backlog and in-flight limits below the transport codec. Limit refusals are structured. |
| R-SEC-04 | A contributor runs in the connector's DSH process with its own DSH authority and can only emit events, expose tools and accept their calls (R-EXT-11). Installing a contributor is the user's decision, the same as installing any DSH plugin. The connector never widens a contributor's authority, and contributors never receive a token, credential, mailbox, offer or another principal's data (R-EXT-10, Q14 decided). **The namespace is attribution, not a security boundary (S5-Q5, decided A; the user: "选A，自己安装的插件自己负责"):** any in-process plugin can reach another plugin's context and register under its namespace, so the namespace identifies honest contributors only; it gives no isolation from hostile in-process code (process isolation is out of scope, §5). A plugin the user installed is the user's responsibility. The README says so. |

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
| 8r | row 8 plus external agents with their own tokens | The same, with several principals: each managed session has one managing principal; unmanaged-session calls go to the designated Fishball; Hand over goes to the agent the user picks (R-ROUTE-05, R-UI-10). | — |
| 9 | **F** (standalone), target = a connector elsewhere | This DSH **is** Fishball: its own web UI is the Fishball page, with the same guards as a hosted child (overridable and reported, R-FB-09). Fishball manages the target DSH's sessions over MCP (manual token, R-FB-03). Watchdog, board and fold-notify work if installed. | No dots in this DSH. Hand over to it from the target DSH needs embed-UI there (row 6 or 8). |
| 9b | **F**, target blank | Fishball runs, `target-unset`. | No sessions to manage. |
| 10 | **F + U** or **F + I** | The standalone Fishball as in row 9. U without I is inert; I inside a Fishball DSH would try to launch a nested child, which the guards forbid (core's `fishball-ui` component disables the `fishball-instance` row in a Fishball DSH, design §5a.2). | No nested Fishball. |
| 11 | **F + C** in one DSH | Not a supported combination: the Fishball guards forbid new sessions, so the connector has nothing useful to expose. No checks are promised. | — |
| 12 | a main DSH with C, used by a hosted Fishball (row 5/8) **and** a standalone Fishball (row 9) | Two Fishball principals. Both default locally to "Fishball": the first to pair holds it, the second pairs nameless (shown as `ID: <id>`) and its Fishball page asks for another name (R-NAME-03/06); a clashing rename is refused (R-NAME-02). Routing follows R-ROUTE: each manages the sessions it started; one is the designated Fishball for unmanaged sessions; the Hand over dropdown lists both (R-UI-10). | — |
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
| valid, unbound | valid | pair-only access token, `scope: fishball:pair` |
| valid, bound to X | X | full access token, `scope: fishball` (normal use, reconnect, "skip pairing") |
| valid, bound to X | Y ≠ X | pair-only access token, `scope: fishball:pair` (`pair` then answers `already-paired`, `idMatches: false`) |

| At the MCP endpoint: access token | Call | Result |
| --- | --- | --- |
| missing, expired, revoked, foreign audience | any | HTTP 401 with `WWW-Authenticate` |
| pair-only, unbound | `pair` | **pairs**; the same access token is now full |
| pair-only, unbound | other tool, subscription | HTTP 403 `insufficient_scope` (`error_description`: `not-paired`) |
| pair-only, bound to another id | `pair` | `already-paired`, `idMatches: false` |
| pair-only, bound to another id | other tool, subscription | HTTP 403 `insufficient_scope` (`error_description`: `id-mismatch`) |
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
- External authorization servers, and OAuth grants other than `client_credentials` and
  `authorization_code` with PKCE (§1.16; the browser approval page and the registration
  methods of R-OA-13 are in scope).
- Building, managing or bundling a tunnel or any other public-exposure feature (R-REM-05).
- Opening the hosted Fishball page (embed-UI's frame) through a tunnel or any non-loopback
  hostname (R-UI-02, S4-Q1).
- MCP sampling, elicitation, roots, logging, and the Tasks and Apps extensions as control or
  answer paths.
- Any change to DSH's own UI by the connector (its own plugin settings page, with New token and the one-time reveal modal, is not one, 1.28); any view, read-back or edit of an existing token value; a pairing UI in the connector or host DSH (the
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

**Remaining:** none from the spikes (the others are settled; list at the end of this section). All earlier questions are decided. Test-planning questions found later are recorded in `docs/test-design/v3/questions.md`; decided ones are folded into this file (TQ-1: R-ID-02, R-OA-10, R-ID-10; TQ-2: R-TOK-05; TQ-3: R-OA-05; TQ-4: R-TOK-08; TQ-5: R-OA-05, R-TOK-05).

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
*Reopened and superseded 2026-11-15 by 1.27: option C, a show-once modal, with system-generated values only (R-TOK-03, R-TOK-08, R-TOK-11).*

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

**Q27. Access-token lifetime, refresh tokens and rotation — DECIDED 2026-11-11: A; narrowed to machine exchange by Q-OA-2 (A).**
Access tokens last 1 hour; there are no refresh tokens. On expiry or a 401 the client logs in
again with id + token. Now R-OA-07. Options B (15-minute tokens with rotating refresh tokens)
and C (another lifetime) are closed.

**Q28. Clients that cannot do OAuth at all — DECIDED 2026-11-11: A; superseded by 1.16 (no direct access).**
The user's answer: "行，就A，我也想不到更好的主意了". OAuth is required by default; each token entry
has a direct-access fallback switch, off by default, and with it on `Bearer <id>.<token>` is
accepted and checked on every request. Now R-OA-10. Options B (no fallback) and C (always
accept) are closed.

**Q24. What happens to an old hosted pair when the child is reinstalled? — DECIDED 2026-11-11: A.**
The new hosted principal takes over automatically: the old entry's managed sessions,
designated role and name move to it, its live offers are re-issued with new ids, then the old
entry is deleted and each managed session gets one note. Now R-HOST-09. Options B (keep the
old entry) and C (ask first) are closed.

**Q22. How are default names numbered? — DECIDED 2026-11-11: A; superseded by Q-NAME-1 = B (no default names).**
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

**Q-OA and Q-SPEC questions (from 1.16 and 1.17).** Recorded in full in the replies to Fishball of
2026-11-11 and folded in here once answered:
- Q-OA-1: where the approval page is served — **DECIDED: its own port** (1.16, R-OA-20);
- Q-OA-2: refresh tokens for browser clients — **DECIDED A:** rotating refresh tokens, reuse revokes
  the chain, revoked with the entry; machine exchange keeps none (R-OA-16);
- Q-OA-3: the fishball id of a browser client — **DECIDED (1.19):** typed on the page, unique,
  checked with the token;
- Q-OA-4: registration — **SETTLED [spec]:** Client ID Metadata Documents only (R-OA-13);
- Q-OA-5: how the approval page knows who approves — **DECIDED: it only asks for a token; entering an unpaired token pairs it** (1.16, R-OA-11/12);
- Q-OA-6: which endpoints move — **SETTLED [1.16 + spec]:** only the page and its form (R-OA-01);
- Q-OA-7: the approval listener's port — **DECIDED A:** configurable, fixed default (V3-K), always
  open; a clash reports `approval-port-in-use` and keeps `authorization_endpoint` in the metadata;
- Q-S7-2: issuer and resource origin — **SETTLED [spec + S1]:** they follow the checked host (R-OA-01);
- Q-S4-2b: where records are shown inline — **DECIDED B:** in the managed session, drawn by embed-UI
  from the session's own DSH events; no read interface (R-UI-13);
- Q-S7-3: `fishball_pairing` — **SETTLED [spec]:** removed; standard `scope` (R-OA-04, R-OA-18);
- Q-SPEC-1: plain HTTP on loopback — **DECIDED A:** kept as the one documented departure from the
  specification; non-loopback is HTTPS or the user's tunnel (R-OA-08);
- Q-SPEC-2: how a pair-only token is refused — **DECIDED per spec:** HTTP 403 `insufficient_scope`;
- Q-S7B-1: refresh races — **DECIDED [impl] B:** a 10 s idempotent window (R-OA-16 (4a));
- Q-S7B-2: `dsh-mcp-client` — **DECIDED (1.25):** supported through static token + id headers (R-OA-10);
- Q-HDR-1: whether an entry must opt in to the static header path;
- Q-S7B-3: a browser client after a connector restart — **DECIDED A:** refresh-token digests persist (R-OA-16 (5));
- Q-SPEC-3: `isError` on tool refusals — **DECIDED per spec:** `isError: true`;
- Q-ID-1: unique ids — **DECIDED A:** `pair` refuses a held id with `id-taken`, as the page does;
- Q-HO-1: which agents Hand over lists — **DECIDED C:** every enabled, paired agent, with a green
  (online) or red (offline) light; refusals `no-fishball` (disabled or deleted) and `conflict`
  (managed);
- Q-NAME-1: default names — **DECIDED B:** none for anyone; nameless shows `ID: <id>`;
