# dsh-fishball rebuild: always-on personal assistant on DSH

**V3 is the current design (2026-11-17).** Fishball is now two sides that never import each other:
the DSH side (`dsh-connector`, `dsh-connector-ui`, `dsh-instance`, `dsh-connector-adapter`,
`dsh-connector-shared`) and the Fishball side (`fishball-core`, `fishball-ui`, `fishball-shared`),
release `1.0.0-alpha.1`, a fresh install. `fishball-board` is **shelved, not in 1.0.0-alpha.1** (the
user, 2026-11-18: "fishball-board先从这次release中移除…先封存，留到下一批再说。所以不要预留在子实例的Fishball内"):
`packages/board` stays unchanged for a later release; the release is eight tarballs and the hosted
child places only `fishball-ui` and `fishball-core` (v3-requirements 1.42). *Superseded for the release
by §33 (the user, 2026-11-21): the board ships again, with fishball-heartbeat and fishball-taskboard,
inside the `fishball-amenities` umbrella; core and fishball-ui still name it nowhere, and the hosted child
still places only fishball-core.* Read
[v3-design.md](<docs/planning/v3-design.md>) §1.0 and §17–§20 below first. Everything above §17 is
the V1/V2 decision history: V2 was never deployed, fold-notify, the hosted settings bundle and
Watchdog are gone, and the V2 history documents it links to were deleted by the DOCS task (the
user's choice, 2026-11-13); they remain in git history at `e5a8450c`.

**LOGO-BUTTON amendment (user, 2026-11-19; verbatim decisions in the task brief).** Fishball's page
(the hosted child DSH) gets Fishball's brand at the sidebar's top-left the way built-in V1 had it,
accepting dependence on DSH's shell. `fishball-ui` fills DSH's `sidebar.brand.mark` and
`sidebar.brand.name` at priority -1 and captures the enclosing shell button's activation: it opens
or focuses the one manager session and never creates one or triggers New Session, which
`fishball-page` keeps hidden on this page. The label and status description are restored after
DSH's re-renders by a MutationObserver scoped to that button. State reuses the page's facts: the
asks stream (connection, manager id, open approval/question cards with V1's 99+ badge), the session
list (working), and the strip view (core on/off). Working animates (fish wag / whale swim); reduced
motion is static. Two themes, Fishball's fish or DSH's own whale mark (`FishLogo`), default Fishball;
both keep the FISHBALL wordmark and tag; the DeepSeek theme's accent (tag shadow, count pill) is
DeepSeek blue instead of magenta (user, 2026-11-20);
core's settings page owns `brandStyle` (`SEAM_BRAND`), applied live through core's status and the
strip stream. The rail mark stays inside DSH's collapse control (which keeps expand/collapse); the
expanded brand row is Fishball's control. `fishball-page`'s 44px narrow bar has no brand row on either SDK;
rc.5's expanded sheet and rc.1's open drawer show the brand row.

**V2 private Skills amendment (S1–S8, user rules; SK, 2026-11-10):** the only exception to §7's "never writes local files". Fishball keeps its own skills (lessons about the user's preferences and ways of working) in `<child DSH home>/skills/<name>/SKILL.md`, and writes them, new or updated, on its own or when asked, with no approval. Six manager-only tools (`private_skill_list/read/create/update/remove/reload`) and one native skill provider are registered through `fishballInstance.manager.registerSetup` in the manager's own agent scope, so no worker, preset or main DSH sees them; workers get skill text in Fishball's messages. The provider is the public native `FileSystemSkillProvider` over that single root, with the host watcher off and a confined reader that refuses links (and multiply linked files) before reading; writes go through a trusted storage service (name grammar first, native-format validation, serialized, complete publication by same-directory rename, typed `committed` outcomes including committed-but-refresh-failed). Ordinary write/edit/shell stay read-only, and the standard child skill provider no longer lists `<child home>/skills`. Refresh affects later loads and the next model catalog only; no slash-menu refresh is claimed. See [SK-SEAM](<docs/planning/v2-sk-seam.md>), [T-SK cases](<docs/test-design/private-skills.md>) and `packages/instance/src/slim/child/skills.js`.

**X0-C verification amendment (owner decision, 2026-11-09):** retain per-notification durable reservation and acceptance writes and the 10,000-key product retention policy. The owner chose “test a reasonable count with per-notification writes”; the three 9,999/10,000/10,001 throughput cases are superseded by independently authored cases that seed 9,998 committed entries then exercise 1/2/3 real durable notifications, rather than weakening receipt durability to meet the former throughput budget. Keep the repeated-history/notice-scan optimizations. See [verification and limitations](<docs/verification/v2-x0c-inject-scale.md>).

**2026-11-09 V2 COMPAT amendment (D1–D3, approved):** retain the connector's public
contract/export names and envelope v2; contract **1.2** negotiates `interaction.timerfree`
explicitly, with `{interactionTimerfree: true}` validation context and no `expiresAt` in negotiated
interaction descriptors. Default validation remains legacy. Legacy peers retain controls but receive
no delegated interactions; the built-in requires timer-free support, reports an upgrade instruction
and detaches from old connectors. Eligible questions/plans go directly to Fishball; source-user
race and explicit escalation remain. Stored `questionMode`/`approvalAnswerSeconds` are kept inert,
with controls/copy removed and no replacement switch. Optional `attention.signal({important})`
is stateless: no counts, timestamps, unset or replay. Only the connector owns the unread 0/1 latch
and accumulated important bit, reset on page open and detach, never fed back to the instance.
Sidebar attention reuses the green dot and existing important animation, not timers. X8 is async
`attention.signal(pluginId, {important})`, with truthful unsupported/disconnected refusal and no
producer unread ownership. This supersedes contrary historical MCP/attention/timer proposals below;
see [contract 1.2](<docs/connector-contract.md#321-negotiated-timer-free-interactions-d1>) and
[extension points](<docs/plugins/instance-extension-points.md#3-v2-retained-connector-compatibility-d1d3>).


**Status: approved 2026-10-24; revision 9 approved 2026-10-31; revision 10 approved 2026-10-31; revision 10a (Install for Fishball) decided and delivered 2026-10-31; revision 10b (private services) 2026-10-31; revision 10c (Fishball's own plugins) decided 2026-10-31 and delivered 2026-11-01; revision 11 (Fishball-managed sessions) requirements approved 2026-11-01, design folded in the same day, and delivered 2026-11-02 on `rebuild/managed-sessions`, then merged into `rebuild/assistant` with your OK and pushed the same day; revision 12 (recommended plugins and the one-time welcome card) designed 2026-11-02, your answers recorded and built the same day (§16).** P0 (archive and clean-up) is done and the P1 spikes have run. Host baseline: the installed official DSH Web **0.2.1-rc.2**.

**2026-11-04 provider-sync amendment (owner-approved v1):** manual two-page pairing, metadata preview and explicit selected-provider/API-key-record transfer use a dedicated short-lived loopback capability channel and official settings/credential APIs. Existing target profiles/records are preserved, unsupported auth is refused, and partial/unknown outcomes are reported without rollback or automatic retry. No new session-tool authority or default-model change; see [approved design](<docs/model-provider-sync-design.md>). Development uses only disposable SDK fixtures; real sync requires separate approval. **2026-11-06 slim amendment:** in the slim build the pairing channel is removed; the Model block's **Refresh models** syncs API-key providers from the main DSH into the isolated Fishball in one step, with the same add-only rules (see [slim design §10](<docs/slim-native-design.md>)). *Superseded by D26 and the user's decision of 2026-11-11:* a sync starts only from the main DSH's "Model for Fishball" block on the `fishball-instance` Plugins card (check, choose, add); the child has no sync entry point.

**Native host-bound lifecycle amendment (owner request, 2026-11-04; manual verification pending):** install the separate `dsh-fishball/native-host` profile entry with `enabled: true`. Once main DSH is ready it starts the isolated child asynchronously; native failure must never replace or block legacy Fishball. The single `enabled` switch controls the feature. Disable/dispose and host shutdown stop the child, with bounded graceful shutdown and escalation restricted to the exact live child handle this host spawned. HMR uses stop-confirmed-before-restart, not detach-and-survive. Crash recovery authenticates ownership and must never start a second writer; uncertainty fails closed. The owner-only Fishball panel entry fetches a click-time capability URL and passes it straight to `window.open` (not a `target=_blank` form redirect, which the desktop shell turns into a GET), without putting a token into UI state, logs, or stored links. This supersedes the earlier detach-on-dispose design. Exact installation, shutdown boundaries and remaining gaps are recorded in [native manual handoff](<docs/native-manual-handoff.md>); this is not production acceptance.

**2026-11-06 connector/instance amendment (the user's decision):** Fishball becomes two plugins in this repository, `fishball-connector` (the body in the main DSH: session tools, hand-over, approvals and questions intake, row marks, its own settings) and `fishball-instance` (the soul: an attached DSH profile that runs the DSH core only and serves Fishball's own chat and settings pages, restyled to DSH's look, in English and Chinese; the connector picks the language. The child is launched the way the host DSH runs: its executable, its arguments and its PATH. Revised 2026-11-07, D28–D30; the earlier Option A, DSH's own Web UI in the child, is withdrawn). The connector exposes a documented, versioned contract so another instance can replace ours, and the two bind automatically when both are installed. Testing for this revision is TDD: each task carries its test design. The user's own main DSH keeps the old in-process Fishball until release; all installs and tests use disposable environments. There is no plugin called Fishball any more (row ids `fishball-connector` and `fishball-instance`); the connector has a fixed icon (the fish with a wrench badge); its limits change only in DSH's own form of `fishball-connector`, and no instance can change them; every instance setting lives in the instance's own profile, and the main DSH exposes only `enabled`. Model sync is a button on the instance's card in the main DSH, not a switch: one press fetches the providers the instance lacks, and the user ticks which ones to add. The frame around the instance's pages is the connector's: it shows Fishball's state and unread count, and its button opens the connector's own DSH settings form, with no browser message crossing the frame. **Release (Q3, the user's decision of 2026-11-07):** there is no migration from the old `dsh-fishball`; the user removes it first, then installs both packages. Uninstalling `fishball-instance` cleans up the child's directory `<DSH_HOME>/fishball/runtime` throu... (line truncated to 2000 chars)

**2026-11-03 model-settings amendment (owner's request, with scope/migration confirmed):** model selection moves out of Fishball's composer and into its settings; an explicit dedicated choice is required before the composer accepts messages, separate from DSH defaults and ordinary sessions (§6).

Revision 12 (2026-11-02, owner's request before the v0.1.0 release) rebuilds P10's recommended plugins and one-time welcome card on today's design. P10 (2026-10-25, branch `p10-recommended-plugins`, commit `6555e88`) was never merged: revision 8 replaced its plugin list, and revision 10a made your click in the "Install for Fishball" dialog the approval. So the recommended list is a section on Fishball's settings page whose Install opens that dialog, and the welcome card sits in Fishball's chat above your pile (§10f, §9, phase rev12 in §14, decisions in §16 "Revision 12").

Revision 11 (2026-11-01, owner's request; requirements approved the same day in [docs/revision-11-requirements.md](docs/revision-11-requirements.md), items 1-29) splits sessions into yours and Fishball-managed ones. Only managed sessions have Fishball's tools and send it their permission requests and questions; yours keep their own prompts and cost Fishball nothing. Managed agents ask Fishball first with `ask_fishball`, quoting your messages; Fishball can allow once, grant for a while, reject, ask back or send the request to your pile above its composer; its own requests become non-blocking cards; it can stop or redirect a managed session (§5e, §7a rewritten, §9, §10e, §11, spikes S33-S37 in §13, phases rev11a-rev11h in §14, decisions in §16 "Revision 11"). Mechanisms that wait on a spike are marked "pending S3x".

Revision 10 (2026-10-31, owner's request, approved the same day) adds a plugin manager: a Fishball tab on DSH's Plugins page that lists every plugin with its DSH and Fishball state, a page per plugin, and settings per plugin for the plugins that run only in Fishball, which you change, or Fishball changes after you allow it. DSH's own page for each plugin gains a Fishball tag and switch. The manager changes Fishball's side only (§10d, spikes S28–S30 run and recorded in §13c, phase P12 delivered, Q-manager).

Revision 9 (2026-10-31, owner's request, approved the same day) adds the Messenger look: a built-in plugin, shipped and installed with dsh-fishball and on by default, that makes Fishball's own session look like a messenger chat, with every sender shown as its own author. Other sessions keep DSH's stock chat (§10c, spikes S24–S27, phase P11, Q-look).

Revision 7 records the spike results (§13a) and the four amendments they forced: the brand registers at a lower slot priority (§10), `start_session` checks that the folder exists before DSH sees it and does not register a workspace (§5d), tools are attributed to plugins by a registration hook (§4), and Fishball sets its own session read-only (§7).

Revision 8 (2026-10-25, owner's request) gives every plugin one of three statuses with its own actions, lets Fishball install and uninstall plugins in its own package folder instead of the DSH profile, and turns DSH plugins off in Fishball by default (§4, §7a, §9, §10, Q-plugin-status).

Earlier revisions:
- Revision 7 recorded the spike results (§13a).
- Revision 6 put every safety limit into this plugin's config (§16).
- Revision 5 kept tools nobody has checked hidden until you allow them (§7), and moved the tool mask into Fishball's agent scope (§4).
- Revision 4 added starting new sessions (§5d), the fixed list of hidden file-writing tools and the role prompt (§7), and plugin adds as normal permission requests (§7a).
- Revision 3 let Fishball act through tools and plugins, added messaging in both directions, sent every permission request to Fishball, and let it manage its own plugins.
- Revision 2 added the permission-request exception, the Fishball brand button and your answers to Q1–Q3.

The product's name in the UI is **Fishball**; "the assistant" below means the same thing.

Evidence markers:
- **[V]**: verified by reading the installed package files under `~/Library/Application Support/DSH/data/versions/0.2.1-rc.2/node_modules/@deepseek-ai/`. Paths below are relative to that directory.
- **[I]**: inferred, not yet run. Every [I] that the design depends on is listed as a spike in §13 and must pass before the dependent phase is built.

**One-way MCP direction (user-selected, not implemented):** connector hosts the MCP server;
Fishball/external managers are plain clients controlling DSH. No agent callback MCP server is
required. **2026-11-09 decisions, verbatim “1aA，1b能，1cB”:** use a custom authenticated
first-party Fishball pushback/wake channel while MCP remains every client's control plane; external
MCP agents **can** handle delegated approvals and questions; remove the old custom control endpoint
and exports in a coordinated built-in upgrade, **no legacy migration path**. Durable poll tools and
optional notification hints remain available. An idle client that never polls leaves delegated items
waiting; **first committed outcome wins (OQ-14)**. The user's clarification, **“1b那条默认开启，设置也没有关闭的选项”**,
sets external delegation **on by default, with no setting to turn it off**; the opt-in question is
closed. No A/B choice remains from these decisions. See the
[decisions, capability matrix and revised waves](<docs/plugins/connector-mcp-option.md>).
The [custom contract 2.0 baseline](<docs/connector-contract-2.0.md>) is preserved but parked;
protocol-dependent core/plugin tracks wait for MCP feasibility and schema freeze. The earlier
bidirectional idea is rejected. Watchdog failure means effective off/Fishball fallback; questions/
plan reviews always reach Fishball (OQ-04 = B). These [routing decisions](<docs/plugins/instance-extension-points.md>)
remain local to the Fishball instance, not a callback-MCP topology.
**W0 watchdog budget question 2 = A (2026-11-09):** freeze provider-independent UTF-8 byte
accounting, upward rounding, aggregate config validation and the 64,000-token rollover boundary
before WD-1; [canonical budget rule](<docs/plugins/instance-extension-points.md#28-deterministic-watchdog-token-budget-w0-question-2--a>).

**2026-11-09 board-search acceptance clarification:** R1 counts query and board text field bounds
in Unicode code points. R3 selects each card's newest matching snapshot by highest `updatedAt`,
then highest archive line (also the result ordering). First search may use existing legacy migration
or corrupt-board repair; healthy-board searches remain read-only. The single-session Fishball
instance needs no additional caller-identity checks; existing guards stay. See the
[archive-search contract](<docs/plugins/instance-extension-points.md#127-archive-search-contract-q-r--b>).

## 0. Summary

- **One package, one profile row.** `dsh-fishball` is a single DSH plugin bundle. It is installed like any other plugin, into whichever profile you choose (Q1), and serves the sessions in the same DSH process.
  - Its patch inserts one host row, `fishball`, and the same package ships a Web client half.
  - This row is the only change the product makes to that profile, apart from the limits you set in its config (§16). Plugins Fishball installs go to its own package folder, not the profile (§4).
- **Private composition, not a preset.** Fishball is a normal DSH agent and session. Our row creates and resumes it with a private `setup` instead of through an agent preset. It therefore never appears in the new-session picker, and nobody can open a second session with it.
- **Plugins chosen by Fishball, for Fishball.** Every plugin shows one of three statuses (§4): installed in Fishball only (enable, disable, uninstall), installed in DSH and enabled in Fishball (disable), installed in DSH and disabled in Fishball (enable). Fishball never uninstalls a DSH plugin.
  - Installing a plugin for Fishball raises a normal DSH permission request that you answer, and puts it in Fishball's own package folder, never the DSH profile.
  - DSH plugins start off in Fishball. On a Fishball install that existed before revision 8, the DSH plugins present then keep their state.
  - These choices are stored in our own storage domain and never change what other sessions see.
- **One durable intake path; every input wakes Fishball.** Messages from other sessions, session-finish notices, permission requests and plugin events all reach Fishball's inbox with `steer`. Each carries its sender, duplicates are dropped, and nothing is lost across a restart.
  - "Tell me when session X finishes" is a durable watch table over DSH's `turn/end` and `agent/status` events.
- **Messages in both directions, and new sessions.** Every managed session's agent can message Fishball (revision 11; before it, every session's). Fishball can message any existing session, which makes it managed, and start a new one for work it hands off.
- **Yours or managed (revision 11, §5e).** Every session is either yours or managed by Fishball. A session becomes managed when Fishball starts it, messages it or answers a prompt in it, or when you hand it over or send it to Fishball; it stops when you take it back or Fishball releases it. Your sessions have no Fishball tools, nothing in them mentions Fishball, and their prompts and questions stay with you at no cost to Fishball.
- **Context window.** By default Fishball uses its model's full window. You can set a smaller one, enforced by Fishball's own private instance of DSH's compaction stack, so only Fishball's session is affected.
- **Processes information, does no work, never writes files.** Its prompt states its role: it gathers, checks, sorts and routes information, and hands work to other sessions. It can search, open web pages, and use the browser and computer-use plugins. It never writes local files (§7):
  - DSH's file tools, and plugin tools that write files, are never exposed to it;
  - tools that start agents inside its own session are not exposed either;
  - tools from plugins added later stay hidden until you allow them in a normal permission prompt;
  - its shell, if turned on, runs read-only and cannot ask for more.
- **Answers managed sessions' permission requests and questions (revision 11, §7a).** Only managed sessions' requests go to Fishball.
  - Their agents ask first with `ask_fishball`, quoting your messages (verified by code). Fishball allows the exact call once, creates a standing grant that must expire, rejects with a reason, asks the agent a question, or sends the request to your pile, a stack above its composer with Allow once / Reject that also shows in the session.
  - It approves only what you have allowed in your chat with it and judges low-risk. The allowance check and the risk rubric live in its prompt, not in code.
  - Its own requests, such as adding a plugin, become cards in your pile and never freeze it.
  - Questions and plan reviews from managed sessions go to Fishball too, under a mode you choose (Auto, Fishball, User). Fishball can stop or redirect a managed session.
- **Fishball brand button.** The sidebar's DeepSeek Harness brand is replaced by a Fishball mark, and clicking it opens Fishball's session (§10).
- **Safety limits in the plugin's config.** Every cap is a field in the `fishball` row's config: queue size, watches, wake-ups, messages and sessions per hour, permission-request timeout, and so on. You change them on DSH's Plugins page, the change applies without restarting Fishball, and Fishball cannot change them (§16).

## 1. Requirement map

| # | Requirement | Mechanism (detail in §) |
|---|---|---|
| 1 | Runs inside DSH without fully adopting its global profile; enables and disables plugins for itself only | Host row, private scope **P** and a private plugin tree, persisted in our domain. Fishball turns plugins on and off for itself: profile-wide plugins are masked for Fishball only, and Fishball-only plugins are mounted in P. Adding a plugin is a normal permission request to you. The global persona and runtime context are shadowed (§4) |
| 2 | Exactly one session; receives messages from other sessions; hooks fire when a watched session finishes | A singleton record, created once and resumed eagerly. Every session's agent has `message_fishball`, and you have "Send to Fishball". Every input arrives with `steer`. A durable watch table drives finish hooks. Fishball can also message other sessions (`message_session`) and start new ordinary sessions (`start_session`) (§5) |
| 3 | User sets the context window of that session | Default: the model's full window. A smaller value becomes an effective window, enforced by a private compaction instance with a derived policy and an output cap (§6) |
| 4 | Information-processing centre that does no work itself. As amended by you: it may use tools and plugins to find and check information, coordinate other sessions, and answer their permission requests when you allow it, but never writes local files | The role is stated in its prompt. File-writing and delegation tools are never exposed, and unchecked tools stay hidden until you allow them; the shell runs read-only; all non-user content is framed as untrusted (§7). Permission requests reach it through an `approval/request` listener. `answer_approval` grants one pending request or hands it to you. Its own requests always go to you (§7a) |
| 5 | Exposes a hook that user plugins can extend | The `ctx.fishball.registerSource()` service, usable by any standard DSH plugin, whether it runs for everyone or for Fishball only (§8) |
| 6 | (Revision 11) Only sessions Fishball manages talk to it; yours keep their prompts and cost Fishball nothing | A durable managed registry; Fishball's tools shown per session (S34); Hand over / Take back and `release_session`, each with a note to Fishball (§5e). Managed-only routing, `ask_fishball` with verified quotes, Fishball's five answers, one-time passes, standing grants, your pile with buttons in both places, prompts already showing, Fishball's own non-blocking cards, questions and plan reviews under a mode, stop and redirect (§7a). Data in §9, UI in §10e, phases rev11a-rev11h (§14) |

Revision 11 also amends rows 2 and 4: `message_fishball` exists in managed sessions only (§5b), and the `approval/request` listener sends Fishball managed sessions' requests only (§7a.1).

## 2. DSH mechanisms the design relies on

**Profiles and plugins [V].**
- **Composition:** a profile is an ordered stack of bundle patches plus the user's `cordis.patch.yml` (`dsh/README.md`).
- **Plugin manager:** it writes only profile files, and its changes "affect every session using the profile". It "cannot … edit an agent preset's composition" (`dsh-plugin-manager/README.md:14,143`).
- **Global vs per-agent rows:** in the Web bundle, coding tools are disabled as host rows and re-mounted per agent inside presets. Host rows from installed bundles, for example `mover_*` and `bsk_*` tools, are global and reach every agent (`dsh-web-app/cordis.patch.yml:460-589`).

**Per-agent isolation [V].**
- **Scoped registration:** `dsh-scope` gives each scope its own registrations. Child scopes inherit their ancestors, and disposing a scope removes everything it registered. This isolation covers only scope-aware registries: tools, system prompt, skills and MCP server names. Ordinary Cordis services stay process-global (`dsh-scope/README.md`).
- **Restricting tools:** `ctx.tools.restrict({allow|deny})` masks inherited global and ancestor tools for one scope, while that scope's own registrations stay visible. `ctx.tools.guard()` adds a deny-only check (`dsh-tools/lib/types/index.d.ts:508-513,639-656`).
- **Shadowing tools:** a tool registered in a scope replaces a global tool of the same name for that scope only (`dsh-tools/lib/types/index.d.ts:631-637`).
- **Persona:** the `dsh-persona` row shadows the global persona for one scope. Its `includeRuntimeContext:false` option would suppress all optional context (`dsh-persona/README.md`); Fishball keeps it on (§4).
- **How presets work, and why we don't use one:**
  - A preset is a registry-owned scope holding an in-memory `EntryTree`. Agents join it with `bindScopeParent`, and rows are audited with `auditRows` and `leakedServices` (`dsh-agent-preset-registry/lib/index.js:219-237,654-695`).
  - Preset revisions are immutable. Once a session has started, its preset is locked (`agent-preset/locked`, same file `:750-770`).
  - Presets have no hidden flag, so every preset appears in the new-session picker (`lib/types/definition.d.ts:4-13`).

**Agents and sessions [V].**
- **Create and resume:** `ctx.agents.create({sessionId, meta:{cwd, agentPreset?}, agentOptions, setup})` and `resume({resumeSessionId, setup})`. `setup(agentCtx, agent)` composes the agent before it is published. The handle is owned by the caller's plugin (`dsh-agent/lib/types/index.d.ts:40-128`).
- **Inbox:** `followup` (next turn, wakes the agent), `steer` (next step, wakes) and `inject` (no wake). Every change is written durably as `agent/inbox/spliced`, and `runMaintenance()` runs a task while the agent is idle (`runtime-types.d.ts:138-211`).
- **Message sources:** `MessageSourceMap` can be extended by plugins; one source per message. It includes `agent-message{form:'relay', senderSessionId}` (`dsh-llm/lib/types/message.d.ts:94-122`; `dsh-subagent/lib/types/continuation-messages.d.ts`).
- **Web resume:** `sessionController.resolveAgent(id)` reuses a live agent, or cold-resumes with the session's recorded preset (`dsh-api-session-controller/lib/types/agent.js:198-250`).
- **Creating sessions:** `sessionController.create({workspaceId | cwd, agentPreset?})` creates an ordinary session. With no preset named, it runs the configured default preset (`dsh-api-session-controller/lib/types/types.d.ts:284-300`, `index.d.ts:96-101`).

**Completion signals [V].**
- `session/event` carrying `turn/end {reason}`: reasons are completed, aborted, blocked, error, max-tokens, interrupted and forked.
- `agent/status` (`idle`/`running`), `agent/created` and `agent/disposed`.
- `sessionQuery.observeSession()` reads a session without activating it.
- No durable "notify when X finishes" mechanism exists. All existing completion notices are in-process only (subagent settlement, tool-jobs).
- `dsh-schedule` is the reference pattern for durable delivery into a session: it resolves the agent, calls `followup`, flushes, then writes a receipt (`dsh-schedule/README.md`).

**Context [V].**
- **Source of the window:** it is adapter metadata only (`ctx.llm.resolveModelInfo().context.contextWindow`). The agent loop never enforces it.
- **No per-session override exists.** Compaction policy belongs to the `dsh-compaction-basic` instance. In the Web profile, that instance is mounted inside each preset as an isolated group, not globally (`dsh-compaction-basic/lib/index.js:914-961`; `dsh-web-app/presets/standard.patch.yml:66-82`).

**UI [V].**
- **Transport:** authenticated `/api/*` routes through `ctx.connection.fetch.register`, plus a hand-written `window.__ModuleLoader__` client. This is the pattern your own `dsh-idle-compact` uses on rc.2, and it avoids the Typert code generator, which is not installed.
- **UI seats:** `sidebar.panellist` with `main`, `sidebar.workspaces.session.menu.item`, `conversation.session.header.actions`, `conversation.session.header.utilities`, `plugins.bundle.config`.
- **Brand row:**
  - `sidebar.brand.mark` and `sidebar.brand.name` are single slots declared by `dsh-client-ui-sidebar`. `dsh-client-ui-brand-official` fills them with the DeepSeek art.
  - A single slot shows only one occupant, and one registered at runtime outranks the shipped one (`dsh-client-ui-renderer/lib/types/client/registry.d.ts:18-31`).
  - The click action is not a slot. On Web the shell wraps the brand in a button whose click starts a new session. On macOS Desktop the row is a window-drag area with no click (`dsh-client-ui-sidebar/lib/client.js:309-346`).

**Approvals [V].**
- **Who asks.** When a tool call needs approval, the tool layer calls `ctx.approval.request({agent, toolName, callId?, reason?, displayReason?, signal?})`. There are two callers (`dsh-tools/lib/index.js:3535-3587`; `dsh-sandbox/lib/index.js:99-124`):
  - the tools pipeline, when a `tools/pre-execute` listener returns `ask` (permission hooks, Auto review denials);
  - sandbox escalation, when bash or `run_code` retries with `sandbox_permissions`.
- **Other listeners can allow first.** A `tools/pre-execute` listener can allow a call before a later listener returns `ask`. Auto review, an experimental bundle installed in your profile, is such a listener: when its reviewer allows a call, the call runs without asking (`dsh-experimental-auto-review/README.md`). A request made inside the tool body, as sandbox escalation does, is not affected by these listeners.
- **Policy first.** The service reads the asking session's policy. Under `never` it returns `rejected` without asking anyone; under `ask` it dispatches the `approval/request` **waterfall** (`dsh-user-approval/lib/index.js`, `decide()`).
- **Answerers are waterfall listeners.** A listener either returns an outcome, which answers the request, or calls `next()` to pass it on.
  - Host-level listeners see every agent's requests. `dsh-acp` and `dsh-api-remotes` each register one with `ctx.on` and pick out their own agents (`dsh-acp/lib/index.js:1158-1181`; `dsh-api-remotes/lib/index.js:146-176`).
  - `ctx.on(…, {prepend: true})` places a listener before the existing ones (`cordis/lib/types/events.d.ts:100-104`).
- **The browser prompt is just the last listener.** `dsh-api-remotes` forwards the waterfall to connected browsers, where `dsh-client-ui-approval` shows Allow once / Reject in that session's composer.
- **Limits** (`dsh-user-approval/README.md`, Known Limitations):
  - Outcomes are `allowed-once`, `rejected`, `cancelled` or `unavailable`. There is no "always allow".
  - The request carries no tool arguments, only the tool name, the reason and the call id.
  - A request must be made inside an open turn of the asking session, so pending requests do not survive a restart.
  - Every request and its outcome are audited in the asking session's log as `approval/asked` and `approval/decided`.
- **No browser.** With no browser open, an `ask` approval is held pending, which blocks the turn indefinitely (`dsh-api-gateway/lib/index.js:1062-1105`).

**Per-agent tools, stopping and questions [V] (revision 11, S34, S36).**
- **A plugin's tools for one agent.** `createScope(rowCtx, scopeOf(agent.ctx))` (`dsh-scope`) gives a context owned by the calling plugin's fiber but keyed by that agent's scope, so `scope.ctx.tools.register(tool)` lands in that agent's own layer (`ScopedLayers` keys layers by scope key) and no other agent sees it. The tool view is recomputed on every `schemas()`, `get()` and dispatch, so a change reaches the agent's next model request, even the next step of a running turn. A call to a tool the agent cannot see fails with DSH's `UNKNOWN_TOOL` before any body runs. Each `register()` returns a synchronous disposer; `scope.dispose()` is asynchronous. Registering through `agent.ctx` instead belongs to the agent's fiber and outlives the plugin. The system-prompt registry is scope-aware in the same way (§2 "Scoped registration").
- **New agents.** DSH creates a new agent for a session on resume, clear and compaction; scoped registrations end with the old one. `agent/created` and `agent/disposed` announce them.
- **Stop.** The browser's Stop button calls `session.cancel`, which on the Host is `ApiSessionController.cancel({sessionId})`: `agent.cancel({kind: 'user'}, {keepInbox: true})`. A plugin calls the same `ctx.sessionController.cancel({sessionId})`. It aborts the turn's pending approval and question requests (`req.signal`, reason kind `user`), ends the turn `aborted`, and keeps messages you queued (`keepInbox`) parked until the next wake. It refuses a subagent's session and a session with no live agent; on an idle session it is a no-op. After it, `agent.followup(msg)` starts one new turn.
- **Questions.** `ctx.userQuestions.ask()` dispatches the `user-questions/request` waterfall on the asking agent, and a prepended host-level listener runs before `dsh-api-remotes`' browser forwarder, as for approvals. The request is a fresh `{...request, agent}` that must stay plain JSON apart from `agent` and `signal`. The shipped presets use the blocking ("legacy") `ask_user_question`, whose request carries no call id; the opt-in timed tool carries `wait.callId`, and a plan review carries `intent: {kind: 'plan-review', approve, callId}`. A timed question whose wait ended becomes `continued` and is answered later with `ctx.userQuestions.answer(agent, callId, batch)`, the method the browser's RPC calls, which steers a `user-question-reply` message. A child agent owned by a live parent cannot ask (`DELEGATED_CALLER`). Plan mode is mounted per agent preset.

**Plugin manager [V].**
- **Installing without enabling.** `ctx.pluginManager.installBundle(spec, {enabled})` installs a package into the profile. With `enabled: false` the dependency is added but the bundle is not selected, so its rows load for no session (`dsh-plugin-manager/lib/types/index.d.ts:123`, `types.d.ts:147-157`, `README.md`).
- **Listing and profile changes.** `listBundles()` lists every installed bundle with the rows its patch declares. `setBundleEnabled()` and `setPluginEnabled()` change the profile, and so every session.
- **Authority.** Installed plugin code runs in-process with host authority, outside the workspace sandbox (`README.md`).

**File sandbox [V].**
- **Modes.** Each session has a sandbox mode: `read-only`, `workspace-write` or `danger-full-access` (`dsh-sandbox/lib/types/index.d.ts:14-19`).
- **`read-only`.** DSH's file tools reject every change, and shell processes are confined so they can write nothing except required sinks such as `/dev/null`. Network access is not covered (`dsh-fs-sandbox/README.md`; same `index.d.ts`).
- **Widening.** A shell or code tool call can ask to widen the mode for one call with `sandbox_permissions`, which needs approval (`dsh-sandbox/lib/index.js:99-124`).
- **Who sets it.** The mode is stored per session (`setSandboxMode`, `dsh-sandbox-policy/lib/types/session-mode.d.ts:49`). The permission picker in a session's chat changes it together with the approval policy (`dsh-permission-presets/README.md`).

## 3. Architecture

```
DSH Web process  (the profile you installed the plugin into; Q1)
└─ Host Loader tree (profile)
   ├─ DSH host plane: llm + credentials, sessions + persistence, storage, web provider,
   │  schedule, approval, tokenMeter, sessionController, workspaceRegistry, connection …
   ├─ other bundles' rows (unchanged)
   └─ row `fishball`  (package dsh-fishball: host half + dsh.client half)   ← only profile footprint
        ├─ Store             storage domains `fishball` (settings and state) and `fishball_intake` (ledger)
        ├─ Config            row config: the safety limits (§16); edited on the Plugins page, applied live
        ├─ AssistantLifecycle  singleton session: create once, resume every start, recovery state
        ├─ IntakeLedger      every non-user input → durable row → assistant inbox
        ├─ WatchRegistry     durable session-finish hooks
        ├─ SourceRegistry    = `ctx.fishball` service (extension API, §8)
        ├─ ApprovalBroker    prepended `approval/request` listener: managed sessions → Fishball → allow,
        │                    grant, reject, ask, or your pile; yours → next() (§7a)
        ├─ ManagedRegistry   (revision 11) which sessions Fishball manages; tools per session (§5e)
        ├─ RequestDesk       (revision 11) passes, grants, your pile, Fishball's own cards, questions (§7a)
        ├─ Outbox            `message_session`, `start_session`, stop and redirect → other sessions (§5d, §7a.12)
        ├─ tools `message_fishball`, `ask_fishball`, `list_user_messages`  managed sessions only (§5b, §5e)
        ├─ HttpApi           /api/fishball/* (JSON + SSE state stream) for the settings view
        └─ private scope P  "fishball:assistant"   (minted from this row; no preset)
             ├─ core: persona, prompt shadows, tools.restrict / guard (file-write rule), presentAs, Fishball's tools
             └─ private plugin tree (in-memory EntryTree; rows persisted in `fishball`)
                  ├─ group isolate{compaction, toolResultPruner}: compaction stack + derived policy
                  ├─ built-ins: dsh-tool-web (search + fetch), time, reminders, read-only shell …  (toggleable)
                  └─ Fishball-only plugins: standard bundles left off in the profile      (toggleable)
                        ▲ scope parent
             agent scope A  ← ctx.agents.create/resume({ setup }) → the one assistant session S
```

One component per responsibility; each is a module with an explicit contract:

| Component | Owns | Depends on |
|---|---|---|
| `Store` | Domain specs (zod), open/close, fail-closed on version mismatch | `storageDomain` |
| `Config` | The row's `static Config` schema of safety limits: defaults, validation and live updates. Every component reads limits from this one object | Cordis config, `settings` (volatile fields) |
| `AssistantLifecycle` | Session identity, workspace and pin, create/resume, archive guard, recovery state | `agents`, `sessions`, `workspaceRegistry`, `sessionPersistence`, Store |
| `AssistantComposition` | Scope P, persona and shadows, hidden tools and the `bsk_inspect` copy without save options (§7), the file-write guard, private tree, plugin catalog; the tools `list_plugins`, `set_plugin_enabled` and `add_plugin` | `tools`, `systemPrompt`, `pluginManager`, `sandboxPolicy`, `approval`, `agentPresets` exports (`auditRows`, `leakedServices`), app-boot `prepareProfileEntries` |
| `IntakeLedger` | Validate, bound, store, deliver, reconcile; wake guard and wake-up cap; the `message_fishball` tool | Store, AssistantLifecycle |
| `Outbox` | The `message_session` and `start_session` tools: target and folder checks, delivery, hourly caps, audit, naming a started session | `sessionController`, `sessions`, `workspaceRegistry`, Store; optional `sessionTitle` |
| `WatchRegistry` | Watch rows, live detection, restart catch-up, firing through the ledger | `sessionQuery`, session and agent events, IntakeLedger |
| `SourceRegistry` | `ctx.fishball` service; source identity and bounds | IntakeLedger, AssistantComposition (scope check) |
| `ApprovalBroker` | Pending requests, argument and provenance lookup, timeout, outcome audit; the `answer_approval` tool; the prompts already showing (§7a.9) | `approval/request` event, `sessions`, AssistantLifecycle, ManagedRegistry, RequestDesk, Store |
| `ManagedRegistry` (revision 11) | Which sessions are managed, how each became so, the notes to Fishball, which sessions see Fishball's tools; `release_session` | Store, IntakeLedger, `tools` (S34) |
| `RequestDesk` (revision 11) | `ask_fishball` and `list_user_messages`, quote checks, threads, passes and to-you tickets, grants, your pile, Fishball's own cards, questions and the question mode | ApprovalBroker, ManagedRegistry, IntakeLedger, `sessions`, Store; `userQuestions` (S36) |
| `HttpApi` and client | Settings view, actions, and the limits page on DSH's Plugins page | `connection`; all of the above through narrow interfaces |

## 4. Requirement 1: runtime and profile isolation

**2026-11-03 isolation correction (investigation, not delivered):** the composition described below is a child-scope overlay and still shares main-profile services and global plugin hooks. The owner now requires an independent Fishball runtime using the same DSH installation, with existing model-account access through an explicit bridge. [Runtime isolation investigation](<docs/runtime-isolation.md>) records the verified gaps, proposed child-process boundary, pending model API decision, and supported private-client composition seams (audited 2026-11-04; browser integration remains unproved). The existing shared-runtime implementation remains in place until that migration is tested and delivered; tool switches must not be described as full plugin isolation.

**What the current implementation takes from the profile, and what it chooses for itself.**

| Inherited (host plane; needed) | Fishball's own choice (agent plane) |
|---|---|
| Model adapters and credentials, model settings (§6), session store and persistence, storage | Agent presets: none bound |
| Web search provider and credentials (`ctx.web`) | Tools from profile-wide plugins: visible unless Fishball turns that plugin off for itself, except the tools hidden in §7 |
| Schedule, approval, token meter, session controller, plugin manager | Global persona prefix/suffix, `harness:*` sections, optional runtime context (shadowed or suppressed) |
| Global policy and arbitrary plugin listeners cannot be hidden by this scope [V]; their effects are not necessarily harmless (2026-11-03 correction above) | Plugins that run for Fishball only (private tree; not a separate event bus) |

**Plugin states.** Fishball's catalog lists every DSH plugin (a bundle installed in the profile or offered by the installation, `pluginManager.listBundles()` [V]), the plugins installed in Fishball only (its own package folder, below), and DSH built-in capability packages: compaction, web, time, reminders, ask-user, skills and the read-only shell. Revision 9 adds one Fishball built-in, the Messenger look, which changes only how Fishball's session is drawn and mounts nothing in the private tree (§10c). Each has a Fishball-only on/off state:

| Where the plugin is | Fishball "on" | Fishball "off" | Effect on other sessions |
|---|---|---|---|
| DSH plugin, enabled in the profile (runs for every session) | Its tools are visible to Fishball, except those hidden or unchecked (§7), and its `ctx.fishball` sources are accepted | Its tools are masked for Fishball and its sources are refused. Its code keeps running for other sessions | None |
| DSH plugin, installed but off in the profile ("Fishball-only") | Its rows are mounted in Fishball's private tree, so its code runs for Fishball alone. Hidden tools stay hidden, and unchecked ones wait for your approval (§7) | Not running anywhere | None |
| Installed in Fishball only (Fishball's package folder) | Mounted in the private tree, as above | Not running anywhere | None: DSH does not know the package |
| DSH built-in capability package | Mounted in the private tree | Not mounted | None |

**Plugin statuses (revision 8).** Each catalog entry shows one status and offers only its actions. The state snapshot and `list_plugins` carry `status`, `actions` and `removing`:

| Status | Which plugins | Actions |
|---|---|---|
| `installed-in-fishball` | Installed in Fishball's own package folder (key `fishball:<package>`). A package of the same name may also be a DSH plugin; they are separate entries | enable or disable, uninstall |
| `dsh-enabled` | DSH plugin (enabled or off in the DSH profile), on in Fishball | disable |
| `dsh-disabled` | DSH plugin, off in Fishball | enable |
| `builtin` | DSH built-in capability package (unchanged) | enable or disable |

- **No uninstall of DSH plugins.** Fishball offers no action, route or tool that removes a DSH plugin; installing and removing DSH plugins stays on DSH's Plugins page.
- **While uninstalling** an entry offers no actions (`removing: true`) until it is gone.

**Installed in Fishball only: Fishball's package folder.**
- **Where.** `<DSH profiles directory>/.fishball-plugins`, a pnpm project laid out like a profile (DSH's `initProfile` with no bundles); nothing boots it. Inside the profiles directory, DSH's runtime resolution gives its packages the host installation's packages as peers, and not the active profile's packages (S22). The DSH profile's `package.json`, lockfile and `cordis.patch.yml` never change.
- **How.** DSH's own pnpm runner (`dsh-plugin-manager/operations` `runPluginCommand`: lock, scrubbed environment, captured output, silence bound, DSH-version check of new dependencies) and DSH's spec parser. A local folder is installed as a copy (`file:`), because a link would leave it outside the profiles directory. A package without a DSH bundle patch is removed again (`not-bundle`).
- **Mounting.** Its rows are read from its patch with the same rules as a Fishball-only bundle, and bare module names are resolved from the package's own folder, so the private tree imports this package and not a DSH plugin of the same name.
- **Uninstall.** Marked `removing` and turned off at once (durable); the next idle-phase apply unmounts it, then `pnpm remove` runs, so its code has stopped before its files go. A restart in between finishes the uninstall at the next start. A failed removal leaves it installed and off with `remove-failed`.
- **Limitations.** Node keeps a loaded module cached, so a package removed and installed again at another version runs the first-loaded code until DSH restarts (DSH's plugin manager has the same limit).
  - Mounting resolves module names through Node's internal module loader, as DSH's own loader does. Where it is unavailable, every plugin installed in Fishball only fails to mount with `row-failed`.
  - Installing a package name already in Fishball's folder is refused before the prompt (`already-installed`); a git or tarball spec names its package only after the fetch, so that case is refused after it.
  - `.fishball-plugins` is a valid name for `dsh --profile`; nothing in DSH scans the profiles directory, so the folder is never booted unless someone names it.

**On at first start:**
- compaction, web search and page opening, time awareness and reminders;
- no DSH plugin (revision 8). Fishball turns one on when you ask or when it judges it useful; its file-writing tools stay hidden (§7).
- **Existing installs keep their state.** "Existing" means Fishball's session already existed when revision 8 first started; this is decided once and stored (`plugin_defaults`, §9). On such an install the DSH plugins enabled in the DSH profile at that start keep their old default, on; every other DSH plugin is off, and a stored choice still wins. A plugin that was installed but off in the DSH profile then stays off in Fishball even if you later enable it in DSH. Nothing is migrated or turned off.
  - **When the baseline is taken.** From the first bundle listing that works, which boot runs at that first start. If that listing fails, the next working one is used, so a DSH plugin enabled in between would keep the old default.
  - **What counts as reinstalled.** A plugin that a listing sees missing from the DSH profile loses its choice and its place in the baseline. A removal and reinstall that no listing sees (both while DSH is stopped, or an in-place upgrade) keeps both.
- **DSH plugins installed later start off**, on every install. One removed from the DSH profile and installed again counts as new: its earlier choice is forgotten and it starts off.
- **Installed in Fishball only:** off when installed; `add_plugin` turns it on right after.

