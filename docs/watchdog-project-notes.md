# dsh-fishball-watchdog: handoff notes for a separate future project

> **Status (2026-11-20):** being implemented as the `dsh-connector-watchdog` component of
> `dsh-connector-amenities` (`packages/dsh-connector-amenities/watchdog/`). Decisions made since these
> notes:
> - **Name:** `dsh-connector-watchdog`.
> - **Interception (§4):** a generic connector feature, `dshConnectorSessions`
>   (`packages/dsh-connector/host-services/sessions.d.ts`). Its permission delegates decide a managed
>   session's request after the grant check and before any offer. The manager receives
>   `settlement {by: delegate}`.
> - **Planned extension:** session backends, so the connector can host a Claude Code or Codex
>   subagent as a managed-only session (read-only in the sidebar) that goes through the same
>   pipeline.
> - **Judging:** a side session on the `watchdog` preset, one per supervised session.
> - **Drift:** a contributed `drift` event, and the session's turn is stopped. The manager can still
>   message the session.
> - **Escalating to the user:** deferred; such requests pass to the manager.
> - **Briefs:** persisted.

Moved here from dsh-fishball's untracked `.runtime/reports/watchdog-project-notes.md` on 2026-11-20 (Watchdog is a DSH-side plugin, §4). Originally written 2026-11-16. Fishball V3 builds **none** of this. Watchdog is a DSH-side plugin: it depends on nothing of the Fishball side (requirements 1.39). The user's words
are quoted verbatim. Everything here was taken out of Fishball V3's requirements (R-WD-*, R-INT-07,
R-WATCH-05) and design (§7) on `design/v3-token-reveal` `5f784e2c`; the full history is still in
those files, marked withdrawn.

## 1. The user's rules for this project

**Separate project** (2026-11-16):
> 把watchdog对fishball的影响全部摘除，当作一个独立项目开发

**Projects are independent and may share a package** (2026-11-16):
> 每个项目间彼此独立，但是可以弄一个shared package

**Name** (2026-11-16):
> 叫dsh-fishball-watchdog

**An ordinary DSH plugin with no failure design** (2026-11-16):
> 出故障的情况不去考虑，因为这只是一个普通的dsh插件，把watchdog从fishball里面拆出来当独立插件

**Where it runs** (2026-11-16, part of the plugin-role message):
> watchdog我改主意了，移动到dsh内，而不是fishball内。

**What it is for** (2026-11-16):
> watchdog的定位是用来接收fishball的目标和约束，定时监督避免监督的session跑偏，并替fishball批示和通过permission request。fishball可以把可批示的范围提交给watchdog。范围是一段可以通过的请求的描述。总之watchdog接受两个来自fishball的指示，一个是必需的，就是这个session的目的，一个是非必需的，就是可以批示的请求。而watchdog通过定时的监督和每次批注请求时也进行监督来避免session跑偏。通过减少走到fishball的permission approval请求次数来节约fishball的token并reinforce session的behavior

**Older words, still informative** (from Fishball's V3 requirements):
- 1.7 (Q10): "watchdog只是fishball的“小帮手”，类似于fishball的子代理的存在"
- 1.14: "只有出现需要判定权限，或者Watchdog的内置轮次计时到了才会激活一次watchdog，其余情况都会转给Fishball"
- 1.15 (Q33 = B): Watchdog is assigned passively ("Watchdog是被动assign上去的…"), so Fishball cannot call it on demand.
- 1.24: "Watchdog也是一个预设" (Watchdog is a preset too).
- U16 (V2): a token saver, not a safety layer; it decides only a well-justified reject itself (beyond the task **and** dangerous); other high-risk items go to the user; pausing supervision means stopping the session.

## 2. What follows from those words

1. **Package and plugin:** `dsh-fishball-watchdog`, an ordinary DSH plugin installed in the
   **main DSH**, beside `fishball-connector`. It is not part of Fishball V3 and Fishball V3 does
   not depend on it. It does not depend on any Fishball package; it may depend on a shared
   library (see §4).
2. **Two instructions from Fishball per supervised session:**
   - the session's **purpose** (required);
   - an optional **approvable scope**: a text description of the requests it may pass.
3. **Supervision against drift:** on its own patrol timer, and again at every permission request
   it handles. Both compare what the session does with its purpose.
4. **Approval on Fishball's behalf:** it approves (answers) permission requests that fall within
   the scope.
5. **Goal:** fewer permission approvals reach Fishball, which saves Fishball's tokens and
   reinforces the session's behaviour.
6. **No failure handling:** no "failure = off", no health state, no "watchdog is down" notice. If
   it throws or is disabled, DSH's ordinary plugin behaviour applies.

## 3. Carried design ideas (from Fishball V3's withdrawn §7 and R-WD; to be re-decided in the new project)

- **Activation:** only a supervised session's permission request, and its own patrol timer
  (`minCheckIntervalSeconds`, default 1740, inclusive 60–86400; one timer per supervised session;
  a refine never moves it). No `check_now`.
- **Decision table (as last revised, R-WD-09 per 1.35):** within the approvable scope → allow;
  beyond the purpose **and** dangerous → reject with a justification; other high risk → escalate
  to the user's card with no time limit; anything else, or no scope → to Fishball. Questions and
  plan reviews never reach it. Each allow answers one request; no standing grant ("no always
  allow").
- **Fishball's tools:** `watchdog_brief({sessionId, purpose, scope?})`, `watchdog_refine`,
  `watchdog_pause`, `watchdog_resume`, all data operations that start no run. Pause stops the
  session first.
- **Patrol:** reads the session's messages since its last watermark, within read limits.
- **Its own agent preset** `watchdog` for side sessions (1.24), one side session per supervised
  session (U8).

## 4. How it could integrate later (Fishball adds nothing for it)

Fishball V3 reserves **no** hook for Watchdog. Only these existing, generic V3 extension points
exist:
- **Connector tool contribution** (`fishballConnectorTools`, R-EXT-01…19): a main-DSH plugin can
  contribute tools (for example `dsh-fishball-watchdog.brief`) that Fishball sees over MCP, and
  emit contributor events to the managing principal.
- **The connector's MCP endpoint** like any client, with its own token (R-OA), if it wants to act
  on sessions; it would then be an ordinary principal.
- **DSH's own approval and session services** in the main DSH, used directly as any plugin may.

How Watchdog would get a session's permission request **before** its Fishball (the core of its
role) is not offered by any V3 extension point today: the connector routes a managed session's
requests only to its managing principal. The new project has to solve that with DSH's own
services or ask for a generic connector feature in a later Fishball release.

**Shared code.** The user first said "每个项目间彼此独立，但是可以弄一个shared package", then
(2026-11-16): "dsh的connector侧的插件间可以share一个包，fishball侧的插件间也可以share一个包". So
there is one shared library per side, and none across the sides. Watchdog is a **DSH-side** plugin,
so it may depend on **`dsh-connector-shared`** (the admin protocol, provider-sync, redaction, file
helpers and the adapter's OAuth client), never on `fishball-shared`. The earlier answer Q-P1 = B
("watchdog depends on fishball-shared as it is") is superseded.

## 5. Merged Fishball code that belonged to Watchdog (deleted from V3, reusable as a starting point)

- `packages/watchdog/**` (WD-ROUTE, W3): about 756 lines in 12 files — the interception routing,
  supervision claims, health state and config. Interception and health do not fit the new role
  (main DSH, no failure design); the config's `minCheckIntervalSeconds` row and the supervision
  claim logic may be reused.
- `test/v3/wd-route/**`: about 1,080 lines; black-box cases for the old routing.
- The Watchdog test design: `docs/test-design/v3/05-watchdog.md` (WD-UC/EP/BVA/DT/ST cases) and
  the Watchdog rows of 04, 06, 08, 09, 10, 11.
- V2 history: `docs/v2-watchdog-plan` @ `8c883be`, the T0 reconciliation @ `bdeb28a`.
