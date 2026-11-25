er_messages` excerpt (your answer) | The excerpt is cut | 1,000 |
| `pileMaxHeightVh` | rev11c | Height of your pile above Fishball's composer, as a share of the window, so the composer stays in view (S37's fixture value) | The pile scrolls | 45 |
| (existing) `maxPendingApprovals`, `approvalAnswerSeconds`, `argumentExcerptBytes`, `maxMessageBytes`, `auditEntriesKept` | rev11b-rev11g | Open requests and cards (Fishball's own included), Fishball's answer time for requests and questions and a timed question's held wait, arguments on notices and cards, one request message, every audit list including `decisions` | As above | As above |
| (existing) `auditEntriesKept`, `argumentExcerptBytes`, `rationaleChars` | rev11c, rev11f | Tag records kept; the arguments, Fishball's reason and the detail list on Fishball's own cards (your answers; the detail list is the manager's decision for you, 2026-11-02) | As above | As above |

Deliberately unbounded (your answers): active grants and grant lifetimes, question rounds in a thread, `stop_session` calls.

*Values that stay constants, with the reason:*

| Constant | Value | Why it is not a limit you set |
|---|---|---|
| `APPROVAL.maxTimerMs` | 2³¹−1 ms | Platform bound: `setTimeout`'s maximum; a longer answer time is clamped to it |
| `HOUR_MS` | one hour | A unit: the window of the hourly caps, whose sizes are config |
| `HTTP` status codes, route paths, event and source names, table names | — | Protocol values |
| `SOURCES.idPattern` (1-64 characters) | — | Protocol: the format of a source id in the `ctx.fishball` contract (§8) |
| `CONTEXT.dshDefaults` (0.8, 0.16, 65,536) | — | Mirrors of DSH's own compaction defaults, which DSH does not export; they price DSH's behaviour, not Fishball's |
| `CONTEXT.minCapTokens` | 1 | Platform bound: DSH requires a positive summary cap |
| `FISHBALL_PACKAGES.outputBytes`, `idleTimeoutMs`, `lockWaitMs`, `lookupTimeoutMs` | 16,384 bytes; 600,000, 120,000, 20,000 ms | Not Fishball's (your answer, 2026-11-01): they follow DSH's plugin-manager settings, read from DSH's live manager as the inherited manager already does (`INHERITED_SETTINGS`, `src/fishball-plugin-manager.js`). Checked in the installed DSH 0.2.1-rc.2 (`dsh-plugin-manager` `PluginManager.Config`): `outputBytes`, `idleTimeoutMs` and `lockWaitMs` are DSH settings of the same name, and `lookupTimeoutMs` is DSH's `inspectTimeoutMs` (DSH passes it as `lookupTimeoutMs` to its runner). The constants are removed; **Reading:** if DSH's manager cannot be read, DSH's own defaults (today's values) apply |
| `SOURCES.dedupeKeyBytes`, `descriptionBytes`, `sourceTitleBytes`; `AUTHOR.nameBytes` | 256, 1,024, 200; = `sourceTitleBytes` | A fixed contract of `ctx.fishball` (your answer): plugin authors rely on them; documented in `docs/plugin-author-guide.md` (rev11-limits checks it lists all three) |
| `SESSION_INFO.maxSubagentDepth` | 8 | An internal guard (your answer): bounds the walk up a subagent's parents so a malformed or cyclic header cannot loop |
| `ASSISTANT.resumeAttempts`, `resumeRetryMs` | 3, 500 ms | Internal retry timing at boot (S7) |
| `INTAKE.maxAttempts` | 3 | Internal retry: deliveries before a row is marked failed |
| `CONTEXT.modelInfoTimeoutMs` | 5,000 ms | Internal timing: bounds asking the model adapter for its window so boot never stalls |
| `audit.js SEQ_DIGITS`, `digest.js DIGEST_HEX_CHARS`, `compaction.js WORDS_PER_TOKEN`, `context-policy.js ROUNDING_GUARD`, `plugin-catalog.js FIBER_ACTIVE` | — | Formats and internal arithmetic, not bounds |
| Built-in rows' configs (`tool-result-pruner` thresholds, `tool-web` `searchTimeoutMs`) | — | Already editable: each is that built-in's own setting on its Fishball plugin page (§10d) |
| Layout and motion in `client.js` and the Messenger look (pixel sizes, `listMinRows`, the 2.2 s unread cycle, `refreshMinMs` 400 ms mirroring DSH's Refresh) | — | Presentation, not a bound on what is done or shown |

*To ask:* nothing left from this list; your answers of 2026-11-01 are in the tables above and in §16 "Revision 11". Nothing is left open: Q-r11-own-card-detail was decided by the manager for you on 2026-11-02 (§16).

## 17. V3 R-EMBED: where the main-DSH UI lives (2026-11-13)

Decided by the user on 2026-11-13 while R-EMBED ran (V3 plan `docs/planning/v3-tasks.md`):

| Point | Decision | Reason |
|---|---|---|
| Layout of `fishball-embed-ui`'s browser half | *(The instance card part is superseded by §19: `client.instance.js` moved to the instance's own settings page.)* Flat package-local chunks in `packages/embed-ui/src/client/`: `client.js` (the entry) loads `client.connector.js` (with `client.records.js`) and `client.instance.js`, each run as a sub-plugin of the row | DSH serves a package's `client.js` and only `client.<name>.js` files beside it (`CLIENT_CHUNK`, dsh-client-modules, the same in 0.2.1-rc.5 and 0.2.2-rc.1). Subfolders would need a build step, and this repository has none |
| The status line | *(Superseded by §19: since I-HOST the status line is a chunk of the instance's own settings page, and the symlink is gone.)* One instance-owned file, `packages/instance/src/child-settings/client.status.js` (HOST-EP-03 row 2). The child loads it as a chunk of `fishball-hosted-settings`. Embed-UI loads it through a committed relative symlink, `packages/embed-ui/src/client/client.status.js` | A chunk must sit beside its own package's `client.js`. `npm pack` drops symlinks (checked with npm 11.19.1), so packing `fishball-embed-ui` must dereference this one file. **Owner (user decision 2026-11-13):** the release / DOCS packing task, not I-PLACE (which owns only the instance package) |
| Embed-UI's host row | A placeholder row with an empty host half, so DSH composes the browser half. U-SHELL adds the host half | DSH composes a `dsh.client` only for a package that a profile row names |
| Start timing | Each part starts once its chunk has arrived, one request after the entry runs, while the V2 bundles started with the page's own batch. So DSH's own brand can show briefly before Fishball's | It follows from the flat chunk layout. No case pins the first frame |
| UI behaviour | Moved unchanged. The V3 decisions (sidebar entry only, no Allow once / Reject, inline records, the Hand over control) land in U-SHELL, U-MARKS and U-RECORDS | R-EMBED is a move, so its diff stays reviewable |

## 18. V3 S7c: the connector adapter `fishball-connector-adapter` (2026-11-13)

Decided by the user on 2026-11-13 after spike V3-S7c (`51e9ff1`, PASS on 0.2.1-rc.5 and 0.2.2-rc.1, no host patch). The full design is `docs/planning/v3-design.md` §5.5b; the requirement is R-OA-21 (requirements §1.25a); the build task is C-MCP-ADAPTER.

| Point | Decision | Reason |
|---|---|---|
| What it is | A new standalone, Fishball-only plugin `fishball-connector-adapter` in `packages/connector-adapter/`, installed in a DSH that uses another DSH's connector. Not part of the connector, embed-UI or the Fishball set | DSH's `dsh-mcp-client` has no OAuth (S7b F1), and no existing plugin is reusable (S7c §3.3) |
| Mechanism | c2: a loopback proxy on 127.0.0.1 with a per-start local bearer, plus a stock `dsh-mcp-client` the adapter mounts as a child row once a grant exists | The stock row cannot report a 401 (S7c F1), so only a proxy or an own client has a 401 path; c2 keeps DSH's own client and needs no `!!js` in the user's config |
| Which servers | Fishball connectors only, recognized by the metadata they already serve: the `/api/fishball/mcp` resource, the `/api/fishball/oauth` issuer and the `fishball` scope. Any other server is refused before any authorization request | Q-S7C-1 = C, Q-S7C-5 = A; needs no connector change |
| Client identity | CIMD only, hosted by the user: `clientMetadataUrl`, a required https setting with no default. Without it every server reports `needs-configuration` | Q-S7C-2 = C; a local plugin has no https origin of its own |
| Sign-in | The agent tool `fishball_connector_sign_in` returns the approval URL in the chat (`authorized`, `approval-url` or `needs-configuration`). The connector token is typed only on the approval page | Q-S7C-3 = B; no DSH Web surface lists other plugins' sign-ins |
| Tokens | The grant lives only in `ctx.credentials`; refresh is single-flight under the record lock; the connector persists refresh-token digests, so a connector restart needs no new sign-in | Q-S7C-4 = A (Q-S7B-3 A) |
| Review fixes (R-FIX-ADAPTER, 2026-11-18) | A grant stored for another URL or record version under the same name is never refreshed, dropped or sent. Refresh flights are shared per failed token. A failed timer refresh (not `invalid_grant`) is retried after 30 s, doubling to at most 5 min, while the grant is live. An upstream redirect is answered 502, never relayed. 502/503/504, 520–530, a broken body or a failed 401 refresh mark the connector down until it answers again; the next new token then remounts the child. Responses keep backpressure | The user chose the backoff and the status set (Cloudflare's 52x; not ngrok's 404, which cannot be told from a real one); review `review-x-dsh-connector-adapter` F1–F8 |

## 19. V3 I-HOST: the hosted child, its token and the instance's own page (2026-11-16)

Decided with the user while I-HOST ran (answers Q1–Q7 and the model-sync clarification; requirements
1.28 R1, 1.33 Q-D1/Q-B2, 1.39, 1.41 Q-G3/Q-G6/Q-G7):

| Point | Decision | Reason |
|---|---|---|
| Plugin placement | I-PLACE's copying stays; the set is `fishball-board`, `fishball-ui`, `fishball-core`, appended in that order (core last). *Since SHELVE-BOARD (2026-11-18): `fishball-ui`, `fishball-core`; the board is shelved* | Q1 = A: install by package name or tarball waits for REL-PACK's tarballs. Q2 = A: fishball-ui's guard rows target DSH's base rows, so they hold in any order; core's check needs core last |
| The Fishball page in a hosted child | fishball-core serves `GET/POST /api/fishball/session` itself (row `fishball-core-session`, `src/session/route.js`); the instance's native-web row no longer does | the route reads core's own `fishballInstance`, so it is Fishball-side code, and fishball-ui's page needs it in both modes |
| The hosted token | At each authenticated wire the host asks the child, on `mcp-credential`, whether it holds a credential (`DSH_AGENT_TOKEN` set, or core's `fishball-core/hosted-agent` record). Only when absent, with this DSH's connector and no remote target, it calls `createHosted` once and imports the value into `DSH_AGENT_TOKEN`; probes, creates and imports run in one serial chain. The entry key is kept in `<home>/fishball/hosted.json`, with the instance's stable id, after the child stored it; that file sits beside the runtime tree so a reset or uninstall keeps the succession candidates. An unanswered import (bounded by the credential lock wait) is settled by probing again | R1, Q-G6; DSH answers presence alone; no value is ever on the host |
| What the instance no longer reports | the pending "watchdog is down" notice (withdrawn with Watchdog, 1.37) and `fishball-off` (Q4); the uninstall board-archive export offer has no board export to offer (board dropped `board_export` and its uninstall export, W3 2026-11-15), so it is deferred until a board export exists | requirements 1.37, Q4; packages/board/src/store.js |
| Reinstall succession (I-SUCCEED, 2026-11-17) | A first start that creates an entry under a **new child runtime folder** (its owner marker's `hostId`, kept as `runtime` in `hosted.json`) while `hosted.json` lists one records that earlier entry as `succession` (pending); the successor is always the newest entry. The same runtime (a Connect in the child replaced core's hosted copy) starts none (Q3 = A; follow-up B: the probe should also see core's Connect grants, a K3a change). A record write that fails is replayed before the next attempt. The instance calls K3 `retire(old, newest)` at every start, after a Reconnect and, while it answers `successor-unpaired`, at each K3 `dshConnectorTokens.onChange` (new: forwards K1 `PairStore.onChange`). `{ok: true}`, `unknown-entry` or `not-hosted` end it; `operation-failed` waits for the next start; a closed host row calls and writes nothing more | R-HOST-09, R-NAME-07; Q1 = C (the instance cannot see core's pairing since 1.39, so the connector signals pair changes); Q2 = retarget to the newest (a Reconnect or a second reinstall while pending) |
| Retry, Reconnect | Retry never creates a token; after a deleted hosted entry it leaves the notice `hosted-entry-deleted`. Reconnect (always shown) creates one entry and imports it once; nothing is moved or deleted | R6 = B, R11, Q-B1 = B, Q-B3 = B |
| Target status | answered from the host's own state: remote target → `target-unreachable`; last hosted entry enabled → `connected`, disabled or deleted → `token-refused`/`token-revoked`; none → `target-unset` | Q3 = A: since 1.39 the instance cannot read core's link |
| `fishball-off`, `[::1]` | `fishball-off` withdrawn from the locator; `[::1]` answers `not-ready` | Q4 = A (R-FB-10 amended by 1.39); Q5 = A (the child listens on 127.0.0.1 only) |
| The frame's admission | a single-use HMAC ticket (30 s, generation, audience, view, lang) redeemed by the child-side row `dsh-instance-child` into the child's own cookie (`connection.authorizeIndex`, spike V3-S4 F1). Both ends derive the key from the lifecycle secret, so no key or token is in an overlay | design §4.1 |
| Child halves of admin and model sync | moved from core into `dsh-instance/src/child/`, mounted by `dsh-instance-child` (the admin half was then deleted by I-READY, below); fishball-shared's interim copies deleted | design §1.0b row 5; Q-G7. Model sync copies providers and model lists only: "同步只是同步model list，至于fishball用什么还要在fishball内设置"; the admin's live-session model hook into core is gone (Q6 = A) |
| The instance's page | `dsh-instance`'s own `client.js` (status, Retry and its notice, Reconnect, Open Fishball in a new tab, model sync, `enabled`, `targetUrl`); dsh-connector-ui draws no instance card and has no model routes | Q-D1 = B, R-ARCH-05, Q7 = A |
| Readiness (I-READY, 2026-11-16) | The child is `ready` when all of these hold: the base services `agents`, `sessions`, `tools`, `profileContext`, `appExit` and `appReady` are mounted; the child's `appReady` has fired; and the child-side row has registered its admission route and published `webServer.getOrigin()` (`nativeRuntime.publishWeb`). The health answer then carries `origin`, the child web's `http://127.0.0.1:<port>`, which the host checks and the locator uses. The capabilities are the six services plus `ticket-admission-v1` and `lifecycle-v1`. The wire's operations are `health`, `attach` and `stop`. `dsh-instance-child` is now `required` | F-WIRE: core offers the instance no readiness signal (R-ARCH-10; R-FB-10 as amended by 1.39: "the instance reports only generic child states"). V2 was never deployed ("第三版其实就是第一版"), so core's `fishballApp` server, its bearer probe, the native-web row's launch-token probe and every `dsh-connector/contract` import are gone. K3's `ChildState` and `LifecycleCode` are unchanged |
| First-install model sync (I-READY, 2026-11-16) | When a newly created child first becomes ready, the instance runs its own model sync once: a Check, then Add with every missing provider (`src/host/initial-sync.js`). It never runs again after that; later syncs stay manual on the instance's page. It syncs lists only and never sets Fishball's model. The marker `initial-model-sync.json` sits in the runtime folder, so a reinstall syncs again. A refused check or add leaves no marker and is retried at the next start. It never affects the start | The user: "instance初次安装时同步一次". The marker location and the retry rule were decided by Fishball under that rule. It amends R-HOST-07 and K3 `ProviderSync`, which both say "started only from the instance's own settings page" (C-WIRE amends K3, the DOCS task R-HOST-07) |
| V2 leftovers removed (I-READY) | The admin relay and both its halves, with the `admin` wire channel ("Delete it", 2026-11-16: no V3 page calls it); the settings relay and the `instance-settings` channel (R-HOST-11 withdrawn); the `control` channel; the embed broker, `native-web-access`, `fishball-native-web` and `/api/fishball/native/status`; the launch-settings migration with `storageDomain` (Q-M1); the `dsh-connector` peer and the child placement of `dsh-connector/contract`; `src/slim/` (the model-sync routes moved to `src/host/`) | remove-v2-followups D9–D13, D15 |


## 20. V3 F-WIRE: core's main row and the Fishball-side wiring (2026-11-16)

Decided with the user while F-WIRE ran (answers to the five product questions and the model rules of
2026-11-16), and by Fishball's session where noted:

| Point | Decision | Reason |
|---|---|---|
| Core's rows | One main row `fishball-core` (`fishball-core/main`, src/main/) composes the link, Connect, the interception service, the ask cards, status, the bridge façade and the one manager session; it provides `fishballInstance` (apiVersion 1) and `fishballStatus`. The V2 child rows (`fishball-native-session-tools`, `-approvals`, `-app`, `-inbox`) and `src/slim/**` are deleted, with core's `dsh-connector` peer | V2 was never deployed (the user's rule): no V2 path is kept; R-ARCH-10 |
| Reminders | `schedule_create/list/update/delete` kept, unchanged, registered in the manager's scope only; their V2 page API is gone | the user's answer 1 |
| Window style | No frame-only rule: the page in dsh-connector-ui's window is exactly the standalone page | the user's answer 2 |
| Fishball's model | Core's own setting `model` ({provider, model, reasoningEffort?}); unset, unroutable or unreadable means this DSH's default model; nothing blocks. Core's settings page uses separate native model and effort selects; on model change it keeps a supported effort, otherwise uses the catalog default or first supported effort; the effort select is hidden when none are supported. Only core's settings page and fishball-ui's model dialog write it; the composer's model picker (`ui-model-selection`) is a fishball-ui guard row | the user: "所有版本：先用DSH的默认模型"; answers 3 and 4 |
| Model dialog | fishball-ui's `client.model.js`: on opening the Fishball page with `model` unset, a dialog lists DSH's model catalog and writes the choice; dismissed, it returns at the next page open; with no model it says so and opens DSH Settings | the user, 2026-11-16 ("fishball打开的时候…弹出要求选择模型的页面") |
| Persona | V2 wording kept; tools renamed to their V3 names; sentences on features V3 lacks removed | the user's answer 5 |
| Cross-machine Connect | A press from a page whose `Origin` is https and whose authority is the request's `Host` uses core's web callback `<origin>/api/fishball/connect/callback` (a raw web route, since the cross-site redirect carries no `SameSite=Strict` cookie; it serves only the one pending attempt, whose `state`, `iss` and PKCE are checked); a loopback origin uses the loopback callback; anything else is `web-callback-insecure` | Q-A3 = B; R-OA-14 and the user's rule that only loopback may use http |
| Generated `identity.id` | Kept in core's storage domain `fishball_core_main`, not in the settings document; the user's `identity.id` wins when set | a settings save reconciles the profile at once, which would apply the moved bundle order in the first start (R-FB-12: from the next start with HMR off). Fishball's decision |
| Live core on/off | fishball-ui's rows read core's selection in the profile manifest while HMR runs, else the started bundles | so switching core in a running DSH switches fishball-ui's rows. Fishball's decision |
| Readiness of a hosted child | Core offers no readiness signal to the instance; I-READY gates on generic DSH signals | R-ARCH-10, R-FB-10 as amended by 1.39 |
| Which credential the link tries first | A new value in `DSH_AGENT_TOKEN` (import, Reconnect, paste) before the saved copy; it replaces the saved copy only once accepted; a refused value is not resent until the reference changes or core restarts (`src/link/credentials.js`) | the user's Q-LS1 = A (2026-11-16); it amends K3a `link.d.ts`'s "a saved copy for the target origin wins" (the `.d.ts` comment still says so; recorded in `packages/core/contracts/README.md` and v3-design §5.4) |

## 21. V3 C-WIRE-2: one broker, routed session → managing agent → user (2026-11-17)

Decided by the user on 2026-11-16/17 while C-WIRE-2 ran (the task brief and the answers to its seven questions). This supersedes §7a's V2 broker (Fishball's pile, `ask_fishball`, `list_user_messages`, the pass and ticket machinery, the audit) and §16's `maxPendingApprovals`.

| Point | Decision | Reason |
|---|---|---|
| Routing | A managed session's permission requests, questions and plan reviews become offers in its managing agent's mailbox, connected or not; an unmanaged session's go to the user as normal DSH. Managed questions also open the session's own card, and the first answer wins (q2) | The user: "When a session is managed by an agent, its user-interaction tools (`ask_user_question` and plan review, plus permission prompts) are forwarded to that agent. An unmanaged session's tools go to the user as normal DSH" |
| No cap | A managed session's request always becomes an offer and waits; `maxPendingApprovals` is gone | "No cap on pending approvals. Requests from managed sessions wait in the queue indefinitely and are never refused for being too many" |
| Managed-session tools | `message_agent` only, in managed sessions only; no `ask_agent`, no `list_user_messages` | "不给ask_agent工具"; "list_user_messages is deleted" |
| `approval_answer` `ask` | refused `invalid-decision`; offers list allow, grant, reject, escalate | q1 "Refuse it" (nothing carries a question back without `ask_agent`) |
| Designated agent | `routing.agentToken`, the no-recipient queue, the designated role in revocation and succession, and embed-UI's latch reset on its loss are removed. An event naming no managed session has no recipient: an offer is the user's, a contributor event `no-agent`, the rest dropped | q5 "Remove agentToken entirely"; "There is no 'designated agent' default for unmanaged sessions" |
| Prompts already showing | listed and answered only on sessions the caller manages, without its own escalations; answering never takes over management | "Agent不能回答不归自己管的会话，只能操作自己管的会话"; q7 |
| Grants | kept (exact and shell-prefix, every grant ends); never paused while the agent is disconnected; ended at Take back, release or revocation | q3 "Still covers" |
| Audit | no approval or decision audit; `auditEntriesKept`, `rationaleChars` removed | q6 "Delete it" |
| DSH name | optional `approval.dshName`; the approval page shows it, or DSH's listener origin when it is empty | the user, 2026-11-17 |
| V2 removed | `./contract`, `attachInstance`, the `dshConnector` and `fishballSessionState` services, `src/slim/**`, the V2 row path and every `/api/fishball/*` route of the connector; its vocabularies and payload bounds moved unchanged into K1 (`mcp-schema`) | "第三版其实就是第一版" (V2 was never deployed); q4 |
| R-ARCH-08 strict | dsh-connector-shared keeps `redact` and `request-host` (two DSH-side users each); `files` and `provider-sync*` moved into dsh-instance (`src/lib/`), `oauth-client` into dsh-connector-adapter | Fishball's decision, 2026-11-17 |

## 22. V3 UI-POLISH-F: the Fishball side's look (2026-11-18)

The user (verbatim): "侧边栏的按钮被收到了这里，这是可以的，但是我更乐意看到是按钮的图标，同时target的UI设计太丑了，让Opus用它自己的审美重新设计一遍，所有这个插件的UI都需要设计的美观". Visuals and markup only: no behaviour, route, settings key or contract name changed.

| Point | Decision | Reason |
|---|---|---|
| Material | DSH's own primitives (`Button`, `Tooltip`, `Tag`, `StateDot`, `Modal`, the settings fields), its icons and its `--dsw-*` tokens only; no new dependency or hard-coded colour | Light and dark themes come from DSH; the brief |
| Page navigation | A floating bar in DSH's menu material with three icon buttons (DSH's Settings gear, DSH's fish mark for Fishball, DSH's Plugins pinwheel); the name is the aria-label and DSH's Tooltip; Retry is the refresh icon beside the status | "我更乐意看到是按钮的图标" |
| Status card | The strip is a card above the composer: a heading ("Target DSH") with the state's dot and badge, the contributed-tools chip and the one control; the other lines below. `stripView` adds `card` {state, title, badge, toolsHint, openApproval}; `card.state` is one of `CARD` (connected, unset, disconnected, connecting, attention, failed, off), from the link line's kind; an unknown kind is `failed` | "target的UI设计太丑了" |
| Other parts | Ask cards take DSH's approval-card layout; the model dialog groups models under their provider; the header entries are icons; core's settings page puts the model and Connect in DSH settings cards. fishball-board is shelved from this release (the user), so it gets nothing | "所有这个插件的UI都需要设计的美观" |
| Wording changed | strip `tools` (now a chip: "N contributed tools" / "N 个贡献工具"); new `card` words; the approval link reads "Open the approval page" / "打开授权页面" instead of the raw URL (still its `title`) | Needed by the design; listed for the user's zh review |
| Package icons (ICON-SET) | fishball-core and fishball-ui get the shared fish base with their own badge, from ICON-SET's spec (copied, not imported): core a link (DSH's link glyph: the link to the target), fishball-ui a speech bubble with three dots (Fishball's conversation). Both are clearly apart from the DSH side's wrench, window, server and plug at 30 px. Nothing on the Fishball side draws the connector's wrench. fishball-board is shelved and gets none (superseded by §33: every amenity package has its own icon) | The user: "只有connector插件的设置页的图标带有这个小扳手，然后每个插件的右下角都要有个各自的图标" |
| Narrow window | Below 480 px (DSH's own chat breakpoint) the conversation is lifted by the page bar's height, so the bar never covers DSH's composer stats | Found in the 390 px screenshots |

## 23. V3 R-FIX-CORE: core review fixes (2026-11-18)

The user's answers to the three product questions of the core review (`.runtime/reports/review-x-fishball-core.md`), and the rules the fixes follow:

| Point | Decision | Reason |
|---|---|---|
| Ended reminders | A reminder whose last occurrence was delivered (or dropped by a Stop) is removed from the store at once; ended reminders in an older store are dropped on load. A change that would outgrow the 4 MiB store is refused `schedule-store-full`; a create, or an update that grows the store, is refused already when its result would pass 90% of it. The rest is kept for delivery's bookkeeping, so a due reminder normally still fires in a store the tools have filled (the extreme cases are core's README known limits; a failure there is logged and retried); a store that cannot be read whole makes the tools `schedule-unavailable` and is never written over | the user, 2026-11-18: "响过立刻删" (F07); the 90% share is Fishball's numeric decision, and an update that does not grow the store is never refused for space, the user's (R-FIX-CORE-2) |
| Reminder delivery | A due occurrence is recorded `pending` with a fixed message id, then handed to the manager under `runMaintenance` (true idle, its own turn), like Fishball events (`src/events/handover.js`). It is delivered when the session admits it. A user Stop of the claiming turn, or any removal of the queued message, drops it; owner teardown and a restart with it pending hand it over again | the user, 2026-11-18: "提醒保留在上下文，如果被停止了就丢掉"; teardown and crash keep the tool's "Delivery can repeat after a crash" (F08) |
| Manager record without a log | When the record's session has no log (`SessionPersistenceNotFoundError`), core creates it under the same id | the user, 2026-11-18 (F05); as DSH's own restore-or-create |
| Pending token origin | A value in `DSH_AGENT_TOKEN` is bound to the target origin in force when it is written (or at the first attempt), in the record `fishball-core/pending-token-origin`; it is never sent to another origin | R-FB-03 (F01) |
| Connect grant id | A grant records the `agent_id` it was approved for (`agentId`); it is usable only while `identity.id` is that id. A paired record for another id holds the link `id-mismatch` | R-ID-10 (F10) |

## 24. PLAN-MULTI: multiple DSH MCP targets (2026-11-18)

The [multi-DSH plan](<docs/planning/v3-multi-dsh.md>) records the user's decisions, measured singleton coupling, both-SDK evidence, estimates and exclusive parallel task ownership. All 12 product questions were resolved on 2026-11-18; Q04 is Fishball's choice under the user's least-work instruction and Q06 is Fishball's provisional call, subject to change. **Planning only:** this authorizes no product implementation. Release remains `1.0.0-alpha.1`, may slip, and Board remains shelved.

| Point | Decision / amendment |
|---|---|
| Architecture | One Fishball manager connects to a list of ordinary DSH MCP servers. Reuse Connector tools, OAuth, pairing and mailbox wire; no MCP `dsh` argument, remote reminder subsystem or cross-side imports. Stable local target IDs plus durable endpoint epochs scope credentials, events, approvals and calls; URL changes cannot reuse old remote records after restart. |
| Navigation | Narrow navigation is DSH's real sidebar restyled into a fixed 44px bottom bar on Fishball's page at ≤480px, with every panel and its own contributed icon, overflowing by horizontal scroll (no More menu, no tray, no icon mirroring). On 0.2.2 the closed drawer is the bar at ≤480px; opening it restores the native modal sidebar. At 481–767px only the native drawer is used. Q11 spike: no lawful owner-external icon rendering; user chose the restyle (2026-11-18). |
| Target UI | Show each target's name and connected / connecting / failed / not set in the sidebar; click to expand inline details in the sidebar, no modal (Q08). Q01 shows “Not set” / “Name unavailable” plus Connect before identity is available, with URL only in details. Q09 makes selection details-only: infer the target from context and ask when ambiguous, never set an implicit routing default. Remove the chat-top target status card, superseding §22's card placement. Keep the native sidebar owner, replace only its workspace-content occupant with target rows plus a fail-closed Empty fallback, and restore native drawer access without restoring workspace/session-management controls. |
| Connector name | Standard MCP `serverInfo.name` is `<approval.dshName, else OS device name>-DSH`. Use `node:os.hostname()`, not a special lookup or listener URL; this supersedes §21's URL fallback. Name is returned via modern `server/discover` metadata, not legacy `initialize`; do not substitute `title`. |
| Special characters | Preserve server-name characters. Render all names as plain text, never HTML; names remain untrusted data in model context too, separate from trusted local routing IDs. Derive a safe, nonreassignable target/endpoint-qualified internal key for model tool names under both MCP and DSH host constraints. |
| Duplicate names | Fishball assigns later-appearing identities ` (2)`, then ` (3)`, etc.; existing targets never renumber. A rename into an occupied name is the later appearance. Q03 selects the lowest free suffix for future arrivals; existing allocations never renumber, and display reuse cannot reassign retired model tool bindings. Keep raw metadata separately; credentials/security remain keyed by stable target identity, endpoint epoch and origin. |
| Connected rename | Q02 user: “即时推送，MCP有标准做法，就和现在的DSH向Fishball发出消息一样”. No polling. Use the existing listen stream and standard `notifications/resources/updated {uri}` for a real readable identity resource (planned `dsh-agent://identity`, content is standard Implementation data). This is an additive resource contract, not a new/custom notification or a nonexistent identity-change notification. Connector setting changes push; Fishball immediately calls `server/discover` and reads returned metadata, not stale `getServerVersion()`. Rediscover after subscription acknowledgement/reopen; coalesce hints, fence generations and preserve auth teardown. No metadata retry timer: transient failures may stay stale until next hint/reconnect. External OS hostname changes have no portable push hook in `os.hostname()`; report this technical limitation before implementation if immediate external OS rename is required, rather than inventing a watcher or polling fallback. |
| Model-facing tools | Namespace every exposed remote tool by its server-derived local identity while preserving façade gates, withheld tools and raw wire names/arguments. This explicitly supersedes the single-link/no-model-facing-`mcp__…` rule in the [canonical V3 design](<docs/planning/v3-design.md#L1299-L1326>). Local reminder tools remain once and unprefixed. |
| Hosted/fresh install | Actual parent is fixed first and non-removable/non-editable; extra targets are configured in Fishball. Remove the instance's previous remote override and its token-refusal branches, retaining child credential handoff/succession. Reserve hosted credential slots exclusively for the parent. No migration. |
| Event/ask invariants | Local target-qualified ledger, manager message and card identities; original wire receipts and remote IDs unchanged. Keep durable-before-ack and §21's permission/question/plan-review broker behavior. Local reminders/notify stay as §23 specifies. |

Updated planning estimate: **81–125 person-hours** — MULTI-0 **11–17h**, MULTI-1 **37–56h**, MULTI-2 **15–24h**, MULTI-3 **18–28h** (including the required **2–3h** icon spike). Relative to 74–114h, push/resource-contract work adds 5–8h and the icon spike adds 2–3h. Host/owner changes and platform-specific OS-name watchers are excluded and require report-back/re-estimation before building.

### Resolved configuration and lifecycle choices

- **Q04 — Duplicate endpoints:** user “哪个工作量小就怎么做”. Fishball chooses A, rejecting duplicate canonical MCP URLs within one profile because it is less work; same-origin distinct endpoints remain isolated.
- **Q05 — Parallel Connect:** one pending authorization per target, concurrently across targets, with target/epoch/generation-bound callbacks.
- **Q06 — Global CIMD URL:** the user asked what CIMD is (Client ID Metadata Document, the client metadata URL used for browser sign-in). Fishball chooses A, one global URL and no per-target overrides, as the least-work option consistent with Q04. **This is Fishball's call, subject to change**, not a direct user answer; validation and credential binding remain per target.
- **Q07 — Removal/endpoint retirement:** confirm the destructive change, void pending local cards, retain labeled read-only history and delete the retired target token material. Do not implicitly answer/revoke remote requests.
- **Q12 — No hard cap:** no new target-count limit; all targets remain reachable with scrolling/overflow and independent failure handling. Existing transport/tool/provider budgets still apply.

The [original decision record](<docs/planning/v3-multi-dsh.md#11-settled-user-decisions-not-questions>) and [resolved Q01–Q12 record](<docs/planning/v3-multi-dsh.md#9-resolved-product-decisions-q01q12>) preserve the answers and attribution; **no open product questions remain**. Freeze the technical seams before the three implementation slices begin; Q11's host/owner-change report-back gate remains mandatory.

## 25. V3 R-FIX-FUI: fishball-ui review fixes (2026-11-18)

The fixes for the fishball-ui review (`.runtime/reports/review-x-fishball-ui.md`), the user's one product answer, and the rules they follow:

| Point | Decision | Reason |
|---|---|---|
| Rows that change DSH's UI | fishball-ui's patch only inserts its own rows. The UI guard rows (`ui-*`, `entry-customization`) and the hosted child's Preview Notice acknowledgement are in **core's** patch, each conditional on `fishball-ui` being in the profile (live while HMR runs, else `startedBundles`). Core's check reports them only while fishball-ui's `fishballUiGuards` presence service is there. Accepted limit: with core but without fishball-ui these rows read DSH's stock values, so an earlier bundle's setting of one of them is not kept | the user, 2026-11-18 (option 1). The host's patch merge writes every override whatever its `!!js` value, so a row in fishball-ui's patch changed earlier composition without core (Q-G2 = A) |
| Workspace files | Disable DSH’s `ui-sidebar-files` row in the Fishball profile. This removes its Start card, the file browser tab (including the navigator in document previews), and its keyboard/palette command. Task board and individual document previews stay. | The plugin owns all the file-browser routes; ordinary DSH profiles do not apply core’s patch. |
| Pairing warning | Each target's pairing warning is drawn in that target's sidebar details (MULTI-3; the R-FIX-FUI dock card and its `/api/fishball/pairing` routes are removed with core's scalar `ui.pairing`). Its choices post `SEAM_TARGETS.route.pairing` `{targetId, choice, confirmed}`; Continue is enabled only with its box ticked, and core still refuses it unconfirmed. Last-seen times are in the page's language and the browser's time zone. The pairing words (`SEAM_PAIRING`) are fishball-shared's | R-ID-07 (import/pasted-token path), R-NAME-03 |
| A lost stream | The sidebar's DSH targets and the ask cards share one browser stream lifecycle (client.js kit): an `error` marks the cached view stale; CLOSED offers Reconnect, which reopens every stream of the row. Until a fresh valid frame: each target drops its cached state, lines and controls, its pairing warning staying readable; the ask cards keep their cached text readable under the notice; every control is disabled | a cached frame must not look authoritative or be acted on; what was asked stays readable, and core refuses a late answer anyway |
| Pairing confirmation | The box resets with each new warning (`pairingView` `key`: state, bound pair, name refusal), also between two warnings of the same state | a tick confirms one pairing only (R-ID-07) |
| Connect presses | Only the latest press opens its approval page or publishes its notice | a double press must not open a dead attempt |
| Model dialog | Every opening reads DSH's catalog again; a failed read offers Try again | the catalog may change while the dialog is closed |
| Core Connect control | Reads and presses are sequenced; only the latest read publishes, and nothing settles after unmount (no open, no read, no state). A press's notice stays until a later read's (state, code) differs from the first read after the press | review findings 5 and 6 |
| Ask-card time | Formatted in the DSH UI language's locale (`en` / `zh-CN`), in the browser's time zone | as DSH's own schedule UI |
| Same-side status words (finding 8) | Not changed: `SEAM_STATUS.link/connect/guards` still restate K3's frozen data-only file; equality coverage stays | K3 freeze; needs an approved contract change |

## 26. V3 CONN-TOOLS and ASK-NATIVE (2026-11-18)

The user removes `question_ask` and `question_answer_own`, including their exclusive own-card schemas and behaviour. The historical dotted `question.ask` / `question.answerOwn` architecture is superseded, not a compatibility requirement; the historical documents remain unchanged.

`question_answer` still answers forwarded managed-session DSH questions and plan reviews. Shared question/answer validators, generic settlement `answers`, and `QUESTION_ANSWER` / `CARD_CLOSED` semantics for forwarded questions remain. Fishball's local `ask_user` files existing permission/legacy-ask offers only. For its own clarifications, Fishball's manager uses the native DSH `ask_user_question` tool from its guarded preset; this does not add a connector MCP tool or change where managed-session questions are answered.

## 27. Hosted Frame Readiness v1

For the initial hosted navigation and each parent-initiated replacement, `dsh-connector-ui` keeps
its fresh iframe hidden and inaccessible from first paint. Loading a document is not enough: the
child might have landed on a sign-in page instead of the Fishball page. The parent reveals it only
on the [Hosted Frame Readiness v1 signal](<docs/connector-contract.md#15-hosted-frame-readiness-v1-v3-only>)
from the exact admitted origin and current frame window. After 15000 ms the parent offers recovery.
A late valid signal can still reveal that frame; “Open Fishball again” gets a fresh admission and iframe.

The framed `fishball-ui` page sends one non-secret marker per document when its page plugin is
installed. This gates presentation only, not later navigations within the same frame, chat health
or authentication. It changes no SDK, route, frozen connector value or child lifecycle state (§19).

## 28. Plugins for an embedded Fishball are managed from the main DSH (2026-11-20)

**Why.** A plugin installed inside the instance-run child ran pnpm under the child's private home, while the instance's set install had run pnpm in the main process under the user's home. pnpm links one `node_modules` from one store and refused the second (`ERR_PNPM_UNEXPECTED_STORE`). Rather than isolating the store (option A, dropped), the user moved every package operation on the child profile into the main DSH (the user, 2026-11-20).

Decided by the user on 2026-11-20:

| Point | Decision |
|---|---|
| Who runs pnpm on the child profile | Only the main DSH, through dsh-instance. The child never installs or uninstalls. |
| The child's install entries | Hidden, not refused: DSH's Add plugin and its menu, the Discover tab, Uninstall, and the bundle page's Update buttons (they run pnpm in the child too; updating is uninstall and reinstall from the main DSH), by a style rule from fishball-core while the instance runs the child. "Just hide it would be enough to keep it away from normal user path." No Host-side refusal. A DSH markup change can bring a control back; that is accepted. |
| The child's notice | At the top of the child's Plugins page, where Add plugin was: plugins for this Fishball are installed from the main DSH. |
| The Recommended tab | Removed in an instance-run child, kept in a standalone Fishball. The list moves to the instance's UI in the main DSH. |
| Where the main-DSH UI lives | dsh-instance, through DSH's own slots: a **Fishball** tab on the Plugins page (`plugins.tab`) listing the child's plugins with Uninstall, an **Install for Fishball** button at the top of the tab (DSH hides its header actions on a contributed tab and offers no header slot) and the Recommended list; an **Install for Fishball** item in DSH's Add plugin menu (`plugins.add.actions`); and on each main-DSH plugin page (`plugins.detail.actions`) a button for that plugin. |
| The per-plugin button | A plugin the main profile installed: **Install to Fishball**, the same spec into the child. An official plugin the installation ships: **Use in Fishball**, which adds it to the child's bundle list with no pnpm run. A plugin already in Fishball: **Uninstall from Fishball**. |
| The dialog | DSH does not export its install dialog, so the instance's dialog follows DSH's screens with DSH's components (as revision 10a did): package field, check, confirmation, progress with Cancel, result or Retry. |
| After a successful install | The plugin is added to the child's bundle list and the child restarts. |
| Embed UI | Unchanged, so it can later frame a remote Fishball; it gains no install feature and no slot. Only Hand over leaves it (below). |
| Hand over | The marks part (Hand over / Take back, "Managed by …", the managed-row fish) moves from dsh-connector-ui to dsh-agent-connector, so every connector install has it. It reads "Hand over to <agent>" and uses the connector's icon, not the fish. |

**Embedded or standalone.** fishball-core treats the child as instance-run while the instance's child-side row `dsh-instance-child` is present (it is inserted only by the instance's launch overlay).

**Process.** The instance mounts DSH's Host `PluginManager` for the child profile in an isolated scope, as revision 10a's `FishballPluginManager` did (spike S31): inspect, install, cancel and remove run DSH's own process unchanged; `publishAndReload` does nothing (the child is not this process's profile); installs pass `enabled: false`, then the instance writes the child's bundle list (files.js `writeProfileBundles`) and restarts the child. Because the set install and these runs share the main process's environment, every pnpm run on the child profile uses one store.

**Restart on the instance's settings page (the user, 2026-11-20).** The instance's own settings page gains **Restart** beside Retry: available while the instance is on and the child is ready, failed or stopped, disabled while it starts or stops. It asks first ("Restart Fishball? Running work in Fishball stops and the Fishball window reloads."), then runs the row's restart, queued behind other starts and stops. Retry for a failed child is unchanged.

**Implementation decisions (2026-11-20).** The Fishball tab lists the child's bundles except the protected ones (the child's base bundles, the Fishball set and dsh-instance), which the instance re-adds at every start; uninstalling them is refused (`protected`). One package operation at a time (install, use or uninstall; `busy` otherwise). Uninstall first runs `pnpm remove` through DSH's package operation when the child declares the package, then drops the bundle from the child's list, so a failed removal changes nothing (`remove-failed`); DSH's `removeBundle` would reload the main profile. Restart is refused on the Host (and disabled on the page) while a Fishball package operation runs, and an operation counts as running until the child restart it queued has settled. The per-plugin button reads the main bundle's facts from DSH's own `listBundles`. Progress reuses DSH's own forwarded install events (`plugin-manager/install-state` and `install-log`), which the dialog filters by its own request id. The child manager's scope isolates `connection` as well as `pluginManager`, because DSH's manager registers the fixed detail-file Fetch route that DSH's own manager already holds.


## 29. Waking Fishball in batches (2026-11-21)

**Why.** Each Fishball turn re-reads its whole context, so handing every event over as its own turn cost tokens for each one. The user approved batching on 2026-11-21.

| Point | Decision |
|---|---|
| Classes | Every event type is **wake** (delivered as part of a turn) or **silent** (recorded; it never wakes Fishball by itself and rides along with the next wake delivery as one summary line). Wake: permission, question, plan-review, turn-finished, handover, takeback, message, notice, ask and the watchdog's `contributed:dsh-connector-watchdog.drift`. Silent: state, settlement, retirement. Any other type wakes. |
| Quiet window | Wake events are buffered; each restarts a quiet window (default 10 s). When it passes with no new wake event, everything buffered (wake and silent) goes to Fishball as one message, one turn. Silent events never start or restart it. 0 delivers at the next idle. |
| Max batch | A buffer of the max batch of wake events (default 20) is delivered at once, with a notice naming the limit and saying more may follow. |
| Settings | `wake.quietWindowSeconds` (whole, ≥ 0), `wake.maxBatch` (whole, ≥ 1), `wake.classes` (type → class), volatile fields of core's row, on core's settings page. Read at each event: a save applies to the next one. |
| The user's message | Never waits: the model step that carries it (`agent/pre-step`) takes every waiting event in front of it, so the events and the user's words are one step. Only a message whose source kind is the user's counts, not a plugin notice or the runtime context (the lead, 2026-11-21). |
| Unchanged | The ledger's exactly-once accounting per record (one batch message settles every record it carries: admitted, discarded or redelivered together), recovery at startup (recovered records are due at once), retired epochs never presented, interceptors first, the ask cards see every polled event. |
| turn-finished | Carries the session's final message, so the persona no longer sends Fishball to `session_read` for it. |
| Connector changes | `workspaces_list` and `models_list` join core's tool copy after `sessions_list`; no `settlement` comes for Fishball's own answers, so a successful `approval_answer` through the façade closes (deletes) its open unfiled ask record; `state` events are no longer sent. |

**Implementation.** `src/events/delivery.js` holds the open buffer, the sealed batches and the window timer (injectable, unref'd, cleared by `close()`); `src/events/wake.js` checks the settings. A batch message's id is its first record's own message id and its source lists every record (`{kind: 'fishball-event', events: [{key, eventId, type, targetId}]}`), so a copy an earlier process left pending is recognised and settled for every record at recovery.

## 30. fishball-heartbeat: keep Fishball's cache warm with useful turns (2026-11-21)

**Why.** Fishball's provider prompt cache expires while it is idle, and the next real turn then pays a cold write over its whole context. A heartbeat turn re-reads the cached prefix before it expires and gives Fishball something worth doing in that turn (the user, 2026-11-21). Unlike dsh-cache-retainer's invisible replay, a heartbeat is a real turn in Fishball's session.

Decided by the user: off until the user sets an interval and a maximum of consecutive heartbeats, which Fishball cannot change; every Fishball turn resets the timer, heartbeat turns included; heartbeats sent with no real turn between them are counted and stop at the limit, a real turn resets the count; Fishball's one tool edits only the next heartbeat's focus; every heartbeat tells Fishball to update that focus at the end of the turn from the current state.

**Where.** A row of fishball-amenities (`./heartbeat/index.js`, id `fishball-heartbeat`; its own package `fishball-heartbeat` since §33), bound to `fishballInstance` (apiVersion 2) the way the board row is (`followInstance`, `reportCoreMissing`): X2 `registerSetup` for the tool and the per-manager timer, X10 `manager.notify({wake: true})` for the turn. No core change.

**Implementation decisions (Fishball, 2026-11-21).**
- Settings: `intervalSeconds` (1 … 2147483, the setTimeout limit) and `maxConsecutive` (≥ 1), no defaults; either unset means off: no tool, no timer.
- The timer is armed at each `turn/end` for the interval after that event's time and cleared at `turn/start`.
- A heartbeat turn is a turn that admitted the heartbeat notice and no work message (the user's, a core event batch `fishball-event`, a reminder `schedule`, another plugin's `fishball-notice`); any other turn that entered a step is real. A turn that entered no step sent no request and changes neither the count nor the anchor.
- With wake batching (§29) each batch is one turn and resets like any real turn; events in the quiet window are not a turn. A heartbeat claimed with a batch in one turn makes that turn real.
- Each manager setup (when core opens the session after a restart, a resume, or a row reload) rebuilds the count and the anchor from the session log; an overdue heartbeat is not caught up (the cache is presumed cold), and a timer firing more than 5 s late (machine sleep) is dropped by the same rule. The delay is capped at the interval (a wall clock set back).
- A failed send is logged and not retried; the next turn re-arms it. Known race: core's `notify` cannot be withdrawn, so a turn started between the timer and core's followup is followed by the heartbeat.
- `heartbeat_focus` declares `focus` as an untyped, optional `json` field (as the board does) so that every malformed call gets the tool's own `invalid-input`; dsh-tools still refuses non-object arguments itself.
- One dedupe key per idle gap: session id plus the seq of the `turn/end` that opened it.
- The focus is `<home>/fishball-heartbeat/focus.json`, ≤ 2000 code points, written by rename; an empty focus clears it.

**Compaction on cooling (the user's requirement, 2026-11-21).** When the heartbeat gives up warming the cache, it first compacts Fishball's context once if it is longer than a threshold. The next real turn pays a cold write over the whole context anyway, so a shorter context costs least at that moment.
- Setting `compactThresholdTokens` (natural number, default 256000) sits next to the other two in the row config, which Fishball's tools cannot write. It has a default, so the on/off rule is unchanged (both timer settings set). 256K is read as 256 × 1000, as DSH reads it: its model settings parse `256K` with `CAPACITY_SCALE.k = 1000` (dsh-client-ui-settings-models `DeepSeekModelsEditor.tsx`), and model windows are quoted in decimal.
- Cooling points: the limit is reached (live, or found at setup from the log), an overdue gap at setup, a late timer dropped, a failed send. No cooling happens before any turn has ended.
- Length: `tokenMeter.measure(session).totalTokens` (dsh-token-meter, host plane), the request size DSH's own compaction compares against. Above the threshold only; at or below it nothing happens.
- Compaction: the engine's `compactNow(agent, signal)`, DSH's idle compaction (what `/compact` runs). It is read as `agentPresets.serviceFor(agent, 'compaction')`, falling back to a host-plane `compaction`. The heartbeat first awaits `agent.whenIdle()`; a turn that starts meanwhile supersedes the cooling. compactNow holds the agent's maintenance phase, so a message arriving meanwhile waits for it, as during `/compact`.
- The compaction is no activity (the user's requirement, 2026-11-22): it resets neither the timer nor the count, and neither does what it makes other plugins queue. The messages of the first `agent/inbox/spliced` into `next-step` (an `agent.inject`, never the user's own) that directly follows the `compaction/end` of an idle compaction with no `sourceCommandId` (the heartbeat's compactNow; `/compact` records its command), with the same compactionId, are a consequence of the cooling: the turn that admits them is judged as if they were absent, and the rest of the turn is judged as above. Any other event closes that window. The ids are read from the log (a restart keeps them) and forgotten at the next turn that entered a step. fishball-taskboard's compaction reminder is the case reported: it made the next turn real and the heartbeats started over.
- Once per cooling: the turn fold records `compacted` on a `compaction/start` outside any turn, and the heartbeat sets it on its own attempt. Only a real turn clears it, so a heartbeat turn or a restart does not compact again. An attempt that wrote nothing to the log (nothing compactable, `busy`) is not remembered across a restart.
- Failure: one warning with the error's code, no retry, no timer; the heartbeat state is untouched. A disposal aborts the compaction without a warning. A missing token meter or compaction service is logged once per setup.
- **Composition (fishball-core, 2026-11-21, the lead's decision).** Fishball's live session had no compaction service at all. dsh-web-app's patch switches the host-plane `compaction-basic` off and gives each shipped preset its own isolated group; core switches those presets off, and `preset-fishball` carried only `tool-fs` and `tool-ask-user`. Core's preset now carries DSH's `compaction-basic` in an isolated `compaction` group, as the shipped presets do, with `auto: false`. In all three SDKs (0.2.1-rc.5, 0.2.2-rc.1, 0.2.2-rc.3) that flag skips the engine's whole automatic registration: the pre-step pressure check, the model-switch check and overflow recovery. So Fishball's turns behave as before, and only an explicit `compactNow` compacts. Spike (throwaway DSH 0.2.2-rc.3 home, fake model with a 100K window, six large turns): `auto: true` compacted 3 times inside turns, `auto: false` none; `compactNow` then reduced 62184 → 1250 tokens, and `serviceFor` returned the engine. No `command-compact` row is added. A standalone install whose composition lacks the engine keeps the logged no-op.

## 31. `fishball-taskboard`: Fishball's own task board and memo pad (2026-11-21)

The user's request: Fishball gets tools to create tasks, break goals into subtasks, update status and progress, and read the board; tasks are not linked to sessions; the user can view and edit the board in the UI at any time, and a save wakes Fishball with what the user changed; the data persists; after every compaction, if the board has unfinished tasks, one short reminder line is injected. The full contract is [docs/plugins/fishball-taskboard.md](<docs/plugins/fishball-taskboard.md>).

| Point | Decision |
|---|---|
| Package | A component of `fishball-amenities` (`taskboard/`, its own sub-package for its browser half; its own package `fishball-taskboard` since §33), a sibling of `fishball-board`, not built on it: the board is session-linked, read-only for the user and shelved with a frozen contract; the taskboard needs none of that. It reuses the board's `followInstance` / `reportCoreMissing`. |
| Storage | One record in DSH's storage domain `fishball_taskboard` (one atomic write per change). |
| Tools | `taskboard_read`, `taskboard_add` (with nested `subtasks` and `parentId`), `taskboard_update`, `taskboard_memo`; manager-only through X2 and checked against X1. |
| UI | A right-sidebar tab "Task board" (page type of `sidebarRightTabs`), opened from a conversation header action and the sidebar guide; a draft is saved as one POST of the whole board, refused `stale` if Fishball changed it meanwhile. |
| Wake | A changing save calls `manager.notify({wake: true})`: X10 queues it as its own turn at once. It is not a link event, so §29's quiet window and batching never hold it. |
| Reminder | On a successful `compaction/end` of the manager's session, one `agent.inject` line if any task is unfinished. |
| PENDING | Memo form (list), statuses (todo, in_progress, blocked, done, dropped), who deletes (only the user), limits: provisional recommended values, asked 2026-11-21. |

## 32. Fishball speaks only through `message_user` (2026-11-21)

**Why.** The user decided that Fishball's assistant output is collapsed by default and that only messages explicitly sent to the user are shown, through a dedicated tool. The prompt tells Fishball that the user sees only what it surfaces, that anything needing the user's attention or action must be sent proactively, that routine events are never sent, and that what it sends is batched.

| Point | Decision |
|---|---|
| Tool | Core's `message_user` (`src/manager/message-tools.js` `MESSAGE_TOOL`, `message-user.js`), in the manager's scope only, through X2 (setup `fishball-core-message-user`), and listed in `GUARDS.coreTools`. One required `message` (Markdown). Returns `{shown: true}`, or `{shown: false, code: 'message-empty'}` when blank after trimming. Nothing is stored: the recorded call is the message. |
| Notify | The persona names embed-UI's `notify` (dsh-connector `UI_TOOL.notify`, model base name `embed-ui__notify`) as offered only when the target DSH runs embed-UI (Q-N3). Core adds no notify tool of its own. |
| Drawing | fishball-page registers a Conversation Definition on `tool/call` and `tool/ptc-dispatch-start` for `message_user`, and a `conversation.chat.node` renderer for its kind `fishball-message`, at group-tree position `turn`, so DSH's turn fold never hides it. The call's own tool row stays in the fold. Fishball's bubble, name and avatar (§22, and the avatar theme) move from assistant replies to this row. |
| Quoting | The `message_user` bubble opts into DSH's native text interactions on hosts that ship the Quote text action (verified in the Web bundle from 0.2.2-rc.1). DSH inserts a quote in the manager's composer and sends it as a Markdown blockquote. Native user and settled assistant rows keep DSH's existing behavior; raw tool rows remain ineligible even when expanded. |
| Refused calls | The row is drawn from the start of the dispatched call, not from its result, so a `message_user` call whose turn is stopped before the tool answers, or that the runtime refuses after dispatch, is still drawn. A blank message is never drawn. |
| Folding | On the Fishball page, assistant reply rows are hidden unless their Turn's own DSH control (`button[data-turn-process]`) is open or disabled. A disabled control without `aria-expanded` has no whole-Turn disclosure (e.g. after steering); it does not reveal replies if the Turn has a `message_user` bubble. Without a bubble the existing fallback still applies. Expanding an operable control shows the folded process and the replies, in DSH's plain look. No new disclosure. A folded seat gets DSH's own `hidden` attribute, which DSH's flow gaps, paging and scroll anchoring skip. |

## 33. Every amenity is its own package; `fishball-amenities` is an umbrella (2026-11-21)

**Why.** The user decided that every amenities component is an independent package with its own package.json, name and version, installable on its own, and that `fishball-amenities` only pulls them in so they install together. Only a package with browser code declares `dsh.client`, so no package resolves from two loader sources. dsh-connector made the same split for `dsh-connector-amenities` (its d85037d).

| Point | Decision |
|---|---|
| Packages | `packages/fishball-board`, `packages/fishball-heartbeat`, `packages/fishball-taskboard` (were `board/`, `heartbeat/`, `taskboard/` inside `fishball-amenities`), each a DSH bundle with its own `cordis.patch.yml` inserting its own row by package name. Row ids, tools, settings namespaces, storage and routes are unchanged. |
| Umbrella | `fishball-amenities` depends on and bundles the three members (and `fishball-shared`), and its own patch inserts their rows by package name, because DSH makes only a profile's direct dependencies bundles (as DSH's `dsh-cua-bundle` carries its members' rows). Installing the umbrella and a member as direct dependencies together would insert the same rows twice. |
| Browser code | `dsh.client` only on `fishball-taskboard` (its Task board tab) and the umbrella (its settings-page hint). Board and heartbeat have none. |
| Shared helper | `followInstance` / `reportCoreMissing` (was the board's `src/instance.js`, imported by the other two by relative path) moved unchanged to `fishball-shared/instance-follower`, which now has three users; each member lists `fishball-shared` in `dependencies` and `bundleDependencies`. |
| Release | Decided by the user (2026-11-21): all three amenities ship in the release, together with Fishball, through the umbrella; each is also released on its own, before the umbrella. Every component is separate code: no component imports another component or any core module; their one shared module is the generic `fishball-shared/instance-follower`. The shelving rule that core and fishball-ui name the board nowhere (SHELVE-BOARD) still holds. Known limit: fishball-board binds `fishballInstance` apiVersion 1 (its frozen contract) while core is at 2 (MULTI-0), so beside today's core it loads, logs `fishball-core-missing` once and stays idle. |
| Icons | Each package declares its own manifest `icon` (`assets/<package>-icon.svg`, listed in `files`), in ICON-SET's look (the fish on the ink tile, a paper badge with the package's own glyph): fishball-amenities a two-layer stack, fishball-board three columns (a work board), fishball-heartbeat a pulse line, fishball-taskboard a checklist with ticks. They are apart from core's link and fishball-ui's bubble at 30 px, and from dsh-connector-amenities' tiles-and-plus. The Plugins page shows the package root's manifest icon as a data-URL `<img>` (cards 36 px, component rows 30 px), so the colours are fixed in the asset |

## 34. The Fishball page holds one live connection (2026-11-21)

**Why.** Every message sent to Fishball, text or image, stayed "sending" until the user left the page; leaving and coming back showed it had arrived. A browser opens at most 6 HTTP/1.1 connections per host (Chrome, Firefox by default), shared by every tab of the profile, and a loopback DSH serves no HTTP/2. Each open EventSource holds one connection, and DSH's own calls (session prompt, history pages, uploads) are ordinary fetches that queue behind the held ones. The page held DSH's `/plugins/events`, fishball-ui's strip view twice (targets list and brand), core's ask cards twice (ask dock and brand), and, since fishball-taskboard, its board feed: 6 of 6. The user decided (2026-11-21): "那就合并数据流，全部都走一个链接" (merge the data streams so they all go over one connection). The count must stay constant however many panels or amenities exist.

| Point | Decision |
|---|---|
| Carrier | One owner-only SSE route of core's main row, `/api/fishball/page/events?lang=&tz=` (`fishball-shared` `SEAM_PAGE_STREAM`, core `src/page/stream.js`). Each message is `{topic, frame}`. Every topic's frame is sent at open, then one per change, never an unchanged one twice. The URL names no topics: the stream always carries every registered topic, so mounting a panel never reopens it. Only the page's language (the strip is drawn in it) or Reconnect replaces it. |
| Topics | `fishballInstance.page.register(topic, {frame(url), onChange})`, additive in apiVersion 2. Core registers `asks`, the fishball-ui row registers `strip`, and fishball-taskboard registers `fishball-taskboard` while it is bound to the instance (`followInstance`). A new amenity adds a topic, never a connection. |
| Browser | fishball-ui's client opens the one EventSource while any reader is mounted and demultiplexes by topic. A late reader gets the last frame. Health (live/stale/closed) and Reconnect are the carrier's. The kit's `topicStream` replaces `liveStream`/`langStream`, and the client service `fishballPageStream` (`subscribe(topic, {frame, health})`) is the amenities' way in. fishball-taskboard falls back to its own `/api/fishball-taskboard/events` only where that service is absent (standalone, no fishball-ui). |
| Count | On the Fishball page: one Fishball connection, plus DSH's own `/plugins/events`. That is 2 of the 6, whatever the page draws. The older per-view routes (`/api/fishball/strip`, `/api/fishball/asks/events`) stay for other readers; the page no longer opens them. |
| Rejected | A DSH stream Remote on DSH's own WebSocket, which would not count against the limit at all: `ctx.remote.$mount` accepts only contributions with the strict descriptors `dsh-typert-generator` writes at build time, and the Fishball packages are plain JS with no build step. HTTP/2 over TLS on loopback: it needs a certificate the browser trusts and DSH's webserver in https mode, which changes the user's DSH setup. Spreading streams over a second host name (127.0.0.1 and localhost): DSH's admission and session cookies are per host, and it only doubles the ceiling. Opening streams lazily or rationing them: the count would still grow with every amenity. |

## 35. Running sessions are re-read while a Fishball page watches (2026-11-22)

**Why.** The sidebar lists each connected target's running managed sessions (core `targets/sessions.js`, from `sessions_list`). That list was refreshed only on connect, on the mailbox events that can change it, and right after Fishball's own session tool call. Since WAKE-REDUCE the connector sends no event when a session starts running, only `turn-finished` when it stops. So a session that starts by itself never appeared: the user typing in it, a handed-over session already running, or a queued message whose turn starts just after `session_message` answered (that read itself comes too early). The user's choice (2026-11-22): poll, but only while someone watches.

| Point | Decision |
|---|---|
| Poll | Every `TARGET_SESSIONS.watchIntervalMs` (15 s, the implementer's choice: the user asked for a modest interval and gave no number), one `sessions_list` per connected target, only while a Fishball page holds core's page stream (§34). Core's `page.watching()` / `onWatch` says so. When the first page starts watching, one refresh runs at once. With no page open there is no timer and no call. |
| Kept | The existing refreshes (connect, `refreshOn` events, the `called` hook) stay. No new connection and no new event type. |

## Fishball-only programmatic tool calling

Fishball uses DSH 0.2.2's built-in PTC executor by default, not the shipped coding preset. Core
mounts the executor on the Agent identified by its manager record, keeping the preset, permissions,
and other sessions unchanged. The child profile's `fishball-core.config.ptc` can select native
execution at the next process start; placement does not own that setting. On the Fishball page,
`message_user` keeps its visible message bubble for both native calls and nested PTC dispatches.
On resume DSH restores the same journal and compaction surface, and assembles the current executor’s
tool list for new work. Fishball does not rewrite tool-call history, force compaction, or fork the
session as part of this change.
