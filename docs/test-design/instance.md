# Test design: `fishball-instance` (I1–I10, K2, U3) and end to end (E1)

Status: **test design, revised 2026-11-07 for D26–D30 (TDD).** Black-box only. Source:
`docs/slim-native-design.md` at product commit `859250f` (branch `feat/body-soul`): §0 (above all
§0.5 child launch, chat page, settings view, languages and theme; §0.7 settings; §0.9 U1–U7), §10
(model sync), §18.1 (task table), §18.2 (R / T / AC per task), §18.4 (E2E-B1..B9), §18.5 (resolved
questions) and §18.7 (the checklist this revision applies). K2's framed address is in
`docs/connector-contract.md` 1.1 §1.2. The first version (`test-design/instance` c481dbe) was
written against `3509859`; its case ids are kept, so a case that is gone stays as a
**Withdrawn** row and traceability holds. Production code was read only for public export names,
route paths and error codes (observation points), never for an expected result. K1, M1 and C1–C3
are in `connector.md`; this document refers to them only where an instance case needs them.

> **Release state (v0.1.0-alpha.0).** Where a case below contradicts the released code, the code
> wins. Notable drift: a startup timeout reports `NATIVE_START_FAILED` (`NATIVE_TIMEOUT` is
> reserved and unused); the 33rd concurrent embed stream answers **429** (no `Retry-After`), not
> 503; the embed broker's "not ready" 503 runs before the body-size 413; the child env also sets
> `USERPROFILE`, `DSH_AGENTS_HOME`, `APPDATA`, `LOCALAPPDATA`, `TMP` and `TEMP`;
> `INVALID_MAIN_HOME` is an additional reported status code; and Disable reports `stopping` then
> `disabled` (not `stopped`).
>
> **Integrated fixes.** The embed broker answers 404 when the instance is disabled, rather than
> the 503 used when it is otherwise unavailable. The instance HTTP status and retry responses
> include `detail`: `null` when absent, or a diagnostic bounded to 2,000 Unicode code points.
> Typed child exit-code/signal facts are preserved; arbitrary diagnostic text uses only its
> first line, with credential/home-path masking and control-character removal. The connector
> attachment's `status()` still returns only `{state, code}`.

## 0. The user's decisions of 2026-11-06 (22:31), and what supersedes them

These came after `3509859`. The "Now" column says what later decisions changed; the cases below
apply the "Now" text.

| # | Decision (2026-11-06) | Effect on the first version | Now (2026-11-07) |
| --- | --- | --- | --- |
| UD1 | With only the instance enabled (no connector), the instance shows `connector-missing` and does **not** install the connector. | I1 and E1 cases assert it. | Stands: D25, §0.6. |
| UD2 | Every instance setting lives in the instance's own DSH profile and its settings page. The main DSH gets only the sync options it needs. | I6 checked the main form for "sync options" (OQ-04). | **Superseded in part.** D23 keeps the first sentence. There are no sync options: model sync is a button on the instance's Plugins card (D26, §10), and the `fishball-instance` form has exactly `enabled` (U1, §0.7). |
| UD3 | An instance can not change connector limits; I6 shows them at most read-only. | I6 had read-only cases; E1-B5 was rewritten. | **Superseded in form** by D24 and inst-OQ-05: the settings view shows no connector value at all, not even read-only, and has no link to them; the frame's **Connector settings** button opens DSH's form (D27). |
| UD4 | No plugin is called "Fishball"; only `fishball-connector` and `fishball-instance`. | I1-P-02 and E1-B1 check the Plugins page (OQ-06). | Stands: D22. Display names "Fishball connector" and "Fishball instance"; the assistant keeps the name Fishball (inst-OQ-06). |

### 0.1 Later decisions applied in this revision

| Decision | Effect on this document |
| --- | --- |
| D26 (model sync is a Check → choose → Add button on the instance card) | Every "Refresh models" case of I6 and E1-B2 is rewritten (§10). |
| D27 (the connector draws the frame) | No connector value or link on the settings view; the frame's state tag appears in I1c and E1. |
| D28 (no DSH Web UI in the child; launched like the main DSH) | I2's `[base, web-app]` cases, I3's token exchange and WebSocket, all of I4 and I5's preset and workspace are withdrawn. New I2 launch cases. |
| D29 (keep and restyle the custom chat) | Old I8's deletion cases are withdrawn; new I8 restyle cases; I10 keeps only the truly dead code. |
| D30, U4, U7 (two languages, chosen by the connector through `lang`) | Old I9 is withdrawn; new I9 language cases; new K2 cases. |
| U1 (no `nodeExecutable` / `executableSearchPath`) | I1-EP-04/05 withdrawn; new I2 "old stored values" and form cases. |
| U2 (Electron host: always a background Node child) | New I2 decision table on `ELECTRON_RUN_AS_NODE`. |
| U3 (theme mirrors the parent's `data-ds-dark-theme`, live) | New U3 cases (§11a). |
| U5, U6 (labels and records both show; share words, not the renderer) | I7 rewritten; no de-duplication case. |
| §18.5 | Most of the first version's open questions are answered there; §15 marks each one. |

## 1. Conventions

- **Techniques.** P = positive; EP = negative cases by equivalence partitioning; ST = state
  transition (state table plus invalid transitions); DT = decision table (every rule written out);
  BVA = boundary value analysis (min − 1, min, max, max + 1; "n/a" where a value cannot exist).
- **Ids.** `<task>-<technique>-<nn>`, e.g. `I6-EP-07`; security cases of I3 are `I3-SEC-nn`. New
  cases take the numbers after the existing ones. U3 cases are `U3-…` (they are I9's R6).
- **Markers in a row.** **Withdrawn (reason, ref)**: the requirement is gone; the row stays, its
  old text is struck. **Rewritten (ref)**: the case keeps its idea against the new design.
  **Moved → id**: the case now lives under another task. A row with no marker is unchanged, or new.
- **R refs.** `I6-R4` is the fourth requirement in that task's R list below. `UDn` refers to §0.
- **Versions (V column).** `both` = DSH **0.2.1-rc.5** and **0.2.2-rc.1** (the default). Each
  case runs once per version. E1 also runs under plain Node and under the DSH-X wrapper (§18.2 E1).
- **Runs column.** `node`: runs under `node --test` with in-process stubs, or with a disposable
  DSH boot on a free port, with HTTP, files and processes only. `browser`: needs a real browser
  (DOM, iframe, theme, screenshots). `static`: a source or pack scan. "—" for withdrawn rows.
- **Black box.** Observations only through HTTP, the browser DOM and network log, files and
  processes in the disposable homes, the fake model's request journal, public module exports
  (named in the case), and DSH's public services read by test fixture plugins (§2). `static` cases
  scan sources and pack listings for a stated property (no import, no literal, equal keys); they
  never derive an expected result from the code.
- **Disposable only (D21, §17).** Fresh `DSH_HOME`s and free ports for every run; never the
  user's homes, never ports 7713, 3081 or 54679, never a real API key or a real provider. The
  Phase-2 list (§16) is the only exception, and it is a separate, user-approved run.

## 2. Shared fixtures and observation points

| Id | What | Notes |
| --- | --- | --- |
| F1 | Disposable main home, free port, DSH started from the installed version directory (read-only); both packages installed from local packs with `dsh plugin add fishball-connector fishball-instance` unless a case says otherwise. | The child home is wherever the instance puts it under the main home; the tests discover it, they do not create it, except where a case pre-seeds it. |
| F2 | Browser: a real Chromium driving the main page at `http://127.0.0.1:<mainPort>`, with a full network log (HAR including the SSE `api/events` stream) and storage dumps of the main page and the iframe. | Rewritten (D28): no WebSocket frames; the child page streams over SSE (§3.1). |
| F3 | Fake models, no network: a local fake OpenAI-compatible server and two catalog entries, `fake-effort` (declares reasoning efforts `low`, `medium`, `high`) and `fake-plain` (declares none). The server journals every request (model, effort, messages, tools, system text). The main home has API-key providers for it: `fake-a` with a stored fake key `FAKEKEY-A-<random>`, and, where a case says so, `fake-env` whose key comes from `apiKeyEnv: FBTEST_ENV_<random>` set to `FAKEKEY-B-<random>` in the main process, plus up to five more `fake-1..5`. Variants used by I6: an OAuth (grant) provider, an `apiKeyEnv` provider with the variable unset, a provider with a custom header, a built-in route with a key in the main home. | Every fake key and the `apiKeyEnv` variable's name are secrets in F5 for the browser side. |
| F4 | Child probe: a test bundle pre-seeded as an owner-installed bundle in the child profile (allowed, inst-OQ-10). (a) An echo route `/__fbtest/echo` on the child's loopback server that journals each hit (method, path, Authorization, Cookie, body length and sha256). (b) A launch report: once per child process it writes the child's `process.execPath`, `process.execArgv`, `process.argv`, `process.pid`, `process.ppid`, its stdin type and its full environment to the test's results folder (outside F5's scan). (c) Read-only reads of the child's DSH services: `pluginManager.listPlugins`, `settings` (with revisions), the credential store's record ids and values, `sessions`. (d) A switch that makes the next child start fail. (e) A switch that holds the answer of the next provider-sync `import` request until released. | (a) and the bearer that F5 needs: OQ-24 (the child's HTTP surface is its own server, §0.5 "Child routes"). |
| F5 | Secret scan: a byte search of the main home, the child home, the run's temp directories, every captured stdout/stderr, `child-stderr.log*`, `lifecycle.log`, DSH's log directories of both homes, the HAR (URLs, headers, bodies, SSE events), the browser storage dumps (cookies, localStorage, sessionStorage, IndexedDB, Cache Storage) and `ps eww` output of every process. Secrets: every bridge bearer generation, the main cookie value (for the child side only), every F3 fake key, and (browser side only) the `apiKeyEnv` variable names and the fake server's URL. | Rewritten (D28): there is no launch token and no child cookie. Zero hits is the pass condition. The main DSH's own printed `dsh web:` token in the main process's own stdout is out of scope. |
| F6 | Process check: list processes whose arguments or environment name the child home; "no orphan" means none within 5000 ms of the event (the 4000 ms bounded stop of §2.4 plus 1000 ms margin). | |
| F7 | Stub instance (E1-B8, I1c, K2): see §12.1. | |
| F8 | Main-runtime harness for I2: (a) plain Node, the version's supported Node; (b) the DSH-X wrapper (`DSH.app/…/core/node/node`, Electron as Node, SP2) started with `ELECTRON_RUN_AS_NODE=1` and DSH-X's flags (`--use-system-ca`, `--max-http-header-size=131072`, its two `--import` hooks) and its `NODE_OPTIONS`; (c) as (b), with a main-profile fixture row that deletes `process.env.ELECTRON_RUN_AS_NODE` (or sets it to `0`) before `appReady`, which stands in for an Electron main process without the variable; (d) any of these with extra `execArgv`, `NODE_OPTIONS`, `PATH` and environment values set by the case. | (c) is a stand-in: an Electron main process really started without the variable opens a GUI, which a disposable test must not do. |
| F9 | Local fixture packs for I6's Plugins block: `fbtest-plugin-a` (one setting), and the recommended entry pointed at a local pack (inst-OQ-17: the list is Fishball's own `src/recommended.js`, no network). | |
| F10 | A spy connector: a test package that provides `fishballConnector` with the contract's two members, journals every descriptor it receives (keys, `contract`, `ui`, `typeof status`, `typeof retry`), calls `status()` and `retry()` on the test's request, and can be told to refuse the next attach with a given code. It replaces the real connector in the boots that use it. | For node cases of I1c that need the descriptor itself. |
| O1 | **Instance status:** the state and safe code on its Plugins card in the main DSH and from `GET /api/fishball-instance/status` (`{state, code}`, owner-only; inst-OQ-01). States: the contract's `STATUS` (`disabled`, `waiting`, `starting`, `ready`, `stopping`, `stopped`, `failed`) plus `connector-missing`; codes: `STATUS_CODES` plus `NATIVE_INSTANCE_BUSY` and `NATIVE_CONTRACT_VERSION` (§0.6). | Rewritten: answered by inst-OQ-01. |
| O2 | **Attach state and count:** `fishballConnector.current()` read by a main-profile fixture: `null`, or `{id, name, attachedAt, attachCount}` (conn-OQ-08). | Rewritten: answered. |
| O3 | **Connector settings:** the values in DSH's own settings form for `fishball-connector` and in that row's config (read by a main-profile fixture through DSH's `settings` service), plus its revision. | |
| O4 | **Session log:** the child's session log of Fishball's session and the main sessions' logs (records, request headers including the reasoning effort, sandbox and approval entries). | |
| O5 | **Frame:** the connector's frame around the Fishball view: its state tag, Retry, unread count, Connector settings, Refresh, "Open in a tab", and the iframe's `src` (C3, D27). | New. |
| O6 | **Model sync:** the answers of `POST /api/fishball-instance/models/check` (`{checkId, missing:[{id, name, models}], notOffered:[{id, name, reason}], present}`) and `POST /api/fishball-instance/models/add` (`{checkId, ids}` → per-entry `added` / `skipped` / `failed` with reason), the card's DOM, and the child's provider settings and credential records (F4c). | New (§10). |
| O7 | **Admin routes:** the settings view's calls to the owner-only `/api/fishball/native/admin/*` routes (`status`, `restart`, `model/get`, `model/set`, `plugins/get`, `plugin/install`, `plugin/remove`, `plugin/enable`, `plugin/disable`, `settings/get`, `settings/mutate`), each answering `{ok:true, result}` or `{ok:false, error:{code}}` (§0.7 "Admin routes"). | New. Path names from `settings-routes.js` `ADMIN_ROUTE`. |

---

## 3. I1 — the instance binds to the connector

**R** (from §18.2 I1 and §0.6):
- I1-R1: with both plugins enabled, the instance attaches after main `appReady`, with
  `ui = {chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings'}` (`settings` since
  I6, §0.6), and with no profile edit.
- I1-R2: each child restart detaches, then re-attaches exactly once.
- I1-R3: without the connector, the status is `connector-missing`, the child does not start, the
  main boot succeeds and the instance's own Plugins card states the reason (§0.6, inst-OQ-01);
  the connector is not installed (D25).
- I1-R4: disabling or uninstalling the instance detaches and stops the child.
- I1-R5: disabling or uninstalling the connector stops the child and gives `connector-missing`;
  enabling it again starts the instance without a main restart (inst-OQ-02).
- I1-R6: ~~launch defaults come from `node-default.js`; explicit config wins.~~ **Withdrawn (U1,
  D28: `node-default.js` is deleted and there is no launch setting; the child follows the host,
  §0.5 "Child launch", I2).**
- I1-R7 (D22): the only plugins are `fishball-connector` and `fishball-instance`, shown as
  "Fishball connector" and "Fishball instance" (inst-OQ-06).

**T:** P, ST, EP, DT. §18.2 names no BVA for I1.

**State table** (rows are states; ✓ = valid transition, case id; ✗ = invalid, must not happen).
"attached" is O1 `ready` with O2 not `null`; "restarting" is the `stopping` → `starting` pass of a
restart.

| From \ event | main `appReady` | wire authenticated | restart (Restart, Retry, `admin.restart`) | child exits on its own | disable/uninstall instance | disable/uninstall connector | enable connector | enable instance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| connector-missing | ✗ stays, no child (ST-X1) | — | ✗ stays, no child (ST-X2) | — | → stopped, no child (DT-05) | stays | → waiting → starting → attached, no main restart (ST-08) | — |
| waiting (enabled, before `appReady`) | → starting (P-03) | ✗ no attach before `appReady` (ST-X4) | — | — | → stopped (ST-10) | → connector-missing | — | — |
| starting | — | → attached, attach count +1 (P-01) | ✗ still one child (I2-ST-X1) | → failed | → stopped, never attaches (ST-10) | → connector-missing, never attaches (ST-11) | — | — |
| attached | — | ✗ no second attach without a detach (ST-03) | → restarting, detach (ST-01) | → failed, detach (ST-02) | → stopped, detach (ST-04, ST-05) | → connector-missing, detach, child stopped (ST-06, ST-07) | — | — |
| restarting | — | → attached, attach count +1 exactly (ST-01) | ✗ no second child (I6-ST-X1) | → failed | → stopped, never re-attaches (ST-11) | → connector-missing (ST-11) | — | — |
| failed (code) | — | — | → starting → attached (ST-02) | — | → stopped, no child (ST-12) | → connector-missing | — | — |
| stopped (instance disabled) | ✗ stays, no child (ST-X3) | — | ✗ stays (ST-X3) | — | — | — | — | → waiting/starting → attached (ST-09) |

The status after the connector is disabled at runtime is `connector-missing` (inst-OQ-02).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1-P-01 | P | R1 | F1, F2, F3 | Boot the main DSH. Wait for main `appReady`. Open the Fishball view from the sidebar row. On the connector's Plugins card, press "Open instance settings". | **Rewritten (D28, D29, K2, I1c).** O1 `ready`; O2 `attachCount` 1. The iframe `src` is `/fishball/embed/` plus exactly K2's `lang` (§11b). "Open instance settings" frames `/fishball/embed/?view=settings` plus `lang`. The iframe shows Fishball's own chat page (D29), and the frame's tag reads "running" (I1c R1). | both | browser |
| I1-P-02 | P | R1, R7 | F1; a byte copy of the profile manifest taken right after `dsh plugin add` | Boot and wait for attached. Compare the profile manifest with the copy. Open DSH's Plugins page. | *Rewritten (inst-OQ-06: display names).* The manifest is byte-identical: no row was appended or edited by hand or by the plugins. Each package inserted exactly its own row. The Plugins page lists "Fishball connector" and "Fishball instance", and no plugin named "Fishball" (D22, inst-OQ-06). | both | browser |
| I1-P-03 | P | R1 | F1, F6; main stdout timestamps | Boot. Record the time of main `appReady` and the start time of the child process (F6). | The child process starts after `appReady`. O2 shows no attach before `appReady`. | both | node |
| I1-ST-01 | ST | R2 | I1-P-01 state (attached) | Restart through the settings view's route `POST /api/fishball/native/admin/restart` (§0.7). Watch O1 and O2. | **Rewritten (§0.7: the view's Restart is `admin.restart`).** O1 leaves `ready` and returns to `ready`. O2: exactly one detach, then exactly one attach (`attachCount` +1). The child PID changes; at most one child process exists at any moment. | both | node |
| I1-ST-02 | ST | R2 | Attached | Kill the child process alone (SIGKILL to its PID). Watch O1 and O2. `POST /api/fishball-instance/retry`. | **Rewritten (I1c delivered).** After the kill: O1 `failed` / `NATIVE_CHILD_EXITED`, O2 `null`. After Retry: `starting`, then `ready`, with `attachCount` +1 exactly. The card's and the frame's view of the same run: I1c-P-09, I1c-P-10. | both | node |
| I1-ST-03 | ST | R2 | Attached | Restart three times in a row, each after the previous attach. | Three detaches and three attaches, alternating. O2 never reports two attached instances. Never more than one child process (F6). | both | node |
| I1-ST-04 | ST | R4 | Attached | Disable `fishball-instance` in DSH's Plugins page. | O2 `null`; the connector's view shows "No Fishball instance is attached". No child process within 5000 ms (F6). The main DSH stays up and serves its page. | both | browser |
| I1-ST-05 | ST | R4 | Attached | Uninstall `fishball-instance`. | As I1-ST-04. | both | browser |
| I1-ST-06 | ST | R5 | Attached | Disable `fishball-connector`. | The child stops: no process within 5000 ms. O1 `connector-missing` (inst-OQ-02). The main DSH stays up. | both | node |
| I1-ST-07 | ST | R5 | Attached | Uninstall `fishball-connector`. | As I1-ST-06. The connector is not installed again (D25). | both | node |
| I1-ST-08 | ST | R3, R5 | Instance only, status `connector-missing` | Install and enable `fishball-connector`, with no main restart. | **Rewritten (inst-OQ-02).** O1 goes `waiting`, then `starting`, then `ready`, without a main restart. O2: one attach. | both | node |
| I1-ST-09 | ST | R4, R1 | Both installed; instance disabled (stopped) | Enable `fishball-instance`. | Child starts; O1 `ready`; O2 one attach. | both | node |
| I1-ST-10 | ST | R4 | Both installed; a child probe (F4) that holds readiness for 10 s, so the instance stays starting | While O1 shows `starting`, disable `fishball-instance`. | O2 never records an attach. No child process within 5000 ms. | both | node |
| I1-ST-11 | ST | R4, R5 | As I1-ST-10 | (a) During starting, disable the connector. (b) During a restart (after I1-ST-01's Restart), disable the instance. | (a) No attach; child stopped; O1 `connector-missing`. (b) No re-attach; child stopped; O1 `stopped` or the card gone with the row (§10 "The instance disabled"). No orphan in either. | both | node |
| I1-ST-12 | ST | R4 | O1 `failed` (after I1-ST-02's kill, before Retry) | Disable `fishball-instance`. | No child process; no attach. | both | node |
| I1-ST-X1 | ST (invalid) | R3 | Instance only (connector absent) | Boot; wait 30 s after main `appReady`. | O1 stays `connector-missing`. No child process starts at any time (F6 polled every second). | both | node |
| I1-ST-X2 | ST (invalid) | R3 | As I1-ST-X1 | Look for Retry on the instance's card; `POST /api/fishball-instance/retry` once. | **Rewritten (I1c R5).** The card shows no Retry (Retry only while `failed`). O1 stays `connector-missing`; no child process. The route's answer in this state: OQ-25. | both | node |
| I1-ST-X3 | ST (invalid) | R4 | Both installed; instance disabled | Restart the main DSH; wait 30 s after `appReady`. | No child process; O2 no attach. | both | node |
| I1-ST-X4 | ST (invalid) | R1 | F1; a main-profile fixture that delays main `appReady` by 5 s | Boot and watch O2 and F6 before `appReady`. | No child process and no attach before `appReady`. | both | node |
| I1-ST-X5 | ST (invalid) | R2 | Attached; a managed main session | Restart. While the child restarts, the managed session calls `message_fishball` once. | The call is accepted as queued (not refused, §0.4). After the new attach, Fishball's chat shows it exactly once. O2 is `null` while the child restarts. | both | node |
| I1-EP-01 | EP (connector absent) | R3, UD1 | F1 with only `fishball-instance` installed | Boot. Load the main page. Open DSH's Plugins page. Inspect the profile manifest and the installed packages. Watch the plugin manager's operations. | *Rewritten (inst-OQ-01).* Main boot succeeds; the main page and other plugins work. O1 `connector-missing`, with the reason on the instance's card. No child process. `fishball-connector` is not installed: not in the manifest or the installed packages, and the plugin manager ran no install. | both | browser |
| I1-EP-02 | EP (connector installed, disabled at boot) | R3, R5 | Both installed; connector disabled | Boot. | As I1-EP-01, except that the connector package stays installed and disabled. | both | node |
| I1-EP-03 | EP (incompatible connector present) | R3 | F10 told to refuse `contract-version` | Boot. | **Rewritten (inst-OQ-03, I1c).** Main boot succeeds; no attach. O1 `failed` / `NATIVE_CONTRACT_VERSION`; no child process within 5000 ms; no new child in 30 s (no self-restart). | both | node |
| I1-EP-04 | EP | ~~R6~~ | — | ~~`nodeExecutable` set to a test copy of Node~~ | **Withdrawn (U1: the field is removed, §0.5, §18.7). Moved → I2-EP-15.** | — | — |
| I1-EP-05 | EP | ~~R6~~ | — | ~~`nodeExecutable` pointing at a missing file~~ | **Withdrawn (U1, §18.7). Moved → I2-EP-16.** | — | — |

**Decision table** (connector × instance enabled × child healthy → status):

| Rule | Connector | Instance enabled | Child healthy | Instance status (O1) | Attach (O2) | Child process | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | enabled | yes | yes | `ready` | 1 | running | I1-DT-01 |
| 2 | enabled | yes | no (exits after ready) | `failed`, `NATIVE_CHILD_EXITED` | `null` (detached) | none | I1-DT-02 |
| 3 | enabled | no | — | no card (row disabled) | `null` | none | I1-DT-03 |
| 4 | absent | yes | — | `connector-missing` | — | none | I1-DT-04 |
| 5 | absent | no | — | (no instance row) | — | none | I1-DT-05 |
| 6 | disabled | yes | — | `connector-missing` (inst-OQ-02) | — | none | I1-DT-06 |
| 7 | disabled | no | — | no card | — | none | I1-DT-07 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1-DT-01 | DT r1 | R1 | Both enabled, F3 | Boot; wait 60 s. | Rule 1 row. | both | node |
| I1-DT-02 | DT r2 | R2 | Both enabled; a child probe (F4) that makes the child exit 5 s after ready | Boot; wait 15 s. | Rule 2 row; the main boot is unaffected. | both | node |
| I1-DT-03 | DT r3 | R4 | Connector enabled, instance installed but disabled | Boot. | Rule 3 row; the connector view shows the no-instance state. | both | node |
| I1-DT-04 | DT r4 | R3 | Instance only | Boot. | Rule 4 row (same run as I1-EP-01). | both | node |
| I1-DT-05 | DT r5 | R3 | Instance installed and disabled; connector absent | Boot. | Rule 5 row; the main boot succeeds; nothing about Fishball is installed. | both | node |
| I1-DT-06 | DT r6 | R5 | Connector installed and disabled; instance enabled | Boot. | Rule 6 row (same run as I1-EP-02). | both | node |
| I1-DT-07 | DT r7 | R4 | Both installed and both disabled | Boot. | Rule 7 row; the main boot succeeds. | both | node |

---

## 3a. I1c — attach with `ui`, `status` and `retry`; refused attaches; the card's status and Retry

**R** (from §18.2 I1c R1–R7, §0.6, §0.7):
- I1c-R1: every attach passes `ui`, `status` and `retry`; the frame then shows the instance's
  state (`ready` reads "running") instead of "attached", and its Retry appears when the state is
  `failed`.
- I1c-R2: `status()` returns `{state, code}` with `state` in `STATUS` and `code` in
  `STATUS_CODES` or `null`; it never throws.
- I1c-R3: `retry()` restarts the child and resolves when it is `ready`; it rejects when the restart
  ends `failed`.
- I1c-R4: an attach refused `instance-busy` gives `failed` / `NATIVE_INSTANCE_BUSY`, one refused
  `contract-version` gives `failed` / `NATIVE_CONTRACT_VERSION`; the child is stopped in both and
  not restarted by itself; Retry on the card tries again. These two codes appear only on the card
  and the status route, never in `status()`.
- I1c-R5: the card shows the state and the safe code (and the launch-failure detail when there is
  one), live within 1 s, and a Retry button while the state is `failed`.
- I1c-R6: `GET /api/fishball-instance/status` (owner-only Fetch route) answers `{state, code, detail}`;
  `POST /api/fishball-instance/retry` retries and answers the new status.
- I1c-R7: the admin relay's `admin.status` answers `connector-missing` as itself, not as `failed`.
- I1c-AC: the frame's tag equals the card's state within the 1 s poll; the stub-busy run ends
  `failed` / `NATIVE_INSTANCE_BUSY` with no child process; both routes answer as stated; no token,
  path or key in any status answer.

**T:** P, EP, ST, DT.

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1c-P-01 | P | R1 | F10; both enabled | Boot; wait for ready. Read F10's journal of the descriptor. | Keys exactly `id`, `name`, `contract`, `transport`, `ui`, `status`, `retry`. `contract.id` `fishball-connector`, `contract.major` 1. `ui` is `{chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings'}` (§0.6, I6-R0). `status` and `retry` are functions. | both | node |
| I1c-P-02 | P | R2 | F10; F4 holds readiness for 10 s once | Ask F10 to call `status()` while starting, ready, during a restart, and after a SIGKILL. | Each attachment `status()` answer is an object with exactly the keys `state` and `code` (not the HTTP response, which also includes `detail`); `state` is a `STATUS` value; `code` is a `STATUS_CODES` value or `null`. After the kill: `failed` / `NATIVE_CHILD_EXITED`. | both | node |
| I1c-P-03 | P | R2 | As I1c-P-02 | Call `status()` 100 times spread over a restart, a kill and a Retry. | No call throws. | both | node |
| I1c-P-04 | P | R2, R4 | As I1c-P-02, plus the runs of I1c-EP-02 and I1c-EP-03 | Collect every `status()` answer of all runs. | None has `state` `connector-missing`, or `code` `NATIVE_INSTANCE_BUSY` or `NATIVE_CONTRACT_VERSION`. | both | node |
| I1c-P-05 | P | R3 | F10; attached; then SIGKILL the child | Ask F10 to call `retry()`; await it. | The promise resolves; when it resolves, O1 is `ready`. | both | node |
| I1c-P-06 | P | R6 | Attached; then the same in `failed` and in `connector-missing` (instance-only boot) | `GET /api/fishball-instance/status` with the main cookie, same-origin. | Each answer is `{state, code, detail}` with the state of that run; `detail` is a bounded diagnostic string or `null`. The body holds no bearer, no file path under either home, no port of the child, no F3 key (F5 over the bodies). | both | node |
| I1c-P-07 | P | R6 | O1 `failed` after a SIGKILL | `POST /api/fishball-instance/retry`. | It answers the new status (`{state, code, detail}`, not `failed` / `NATIVE_CHILD_EXITED` any more); then O1 reaches `ready` and O2 `attachCount` +1. | both | node |
| I1c-P-08 | P | R7 | Instance only (`connector-missing`) | `POST /api/fishball/native/admin/status` (O7). | `{ok:true}` with the state `connector-missing`, not `failed`. | both | node |
| I1c-P-09 | P | R5 | Attached; F2 on DSH's Plugins page, the instance's card open | SIGKILL the child; watch the card without reloading. Then make a start fail with F4d and press the card's Retry. | Within 1 s of the kill the card shows `failed` and `NATIVE_CHILD_EXITED`, and a Retry button. After the failed start: `failed`, `NATIVE_START_FAILED` and the launch-failure detail. | both | browser |
| I1c-P-10 | P | R1, AC | F2: the Fishball view and the instance's card in two tabs | Go through ready → SIGKILL → Retry → ready. Every 250 ms compare the frame's tag with the card's state. | In `ready` the frame reads "running"; in `failed` it shows `failed` with the code and its Retry. The two agree within 1 s after each change (the frame's 1 s poll, C3). | both | browser |
| I1c-EP-01 | EP (retry ends failed) | R3 | F10; attached; F4d set | Ask F10 to call `retry()`. | The promise rejects; O1 `failed` with a safe code. | both | node |
| I1c-EP-02 | EP (attach refused `instance-busy`) | R4, AC | Real connector; the stub instance F7 attached; then install and enable `fishball-instance` | Watch O1 and F6 for 30 s. | O1 `failed` / `NATIVE_INSTANCE_BUSY`. No child process within 5000 ms, and none in 30 s (no self-restart). O2 still names the stub. | both | node |
| I1c-EP-03 | EP (attach refused `contract-version`) | R4 | F10 told to refuse `contract-version` | Boot; watch 30 s. | O1 `failed` / `NATIVE_CONTRACT_VERSION`; no child process; no self-restart. (Same run as I1-EP-03.) | both | node |
| I1c-EP-04 | EP (Retry route when not `failed`) | R6 | Ready | `POST /api/fishball-instance/retry`. | Recorded for OQ-25 (restart, no-op or refusal). Whatever it does: never two child processes (F6), and the answer is `{state, code}` or a typed refusal. | both | node |
| I1c-EP-05 | EP (Retry offered per state) | R5 | Card open in F2 | Bring the instance to `starting` (F4 hold), `ready`, `failed` (kill), `connector-missing` (disable the connector). | The card shows Retry only in `failed`. | both | browser |
| I1c-EP-06 | EP (status route without the owner) | R6 | Ready | `GET /api/fishball-instance/status` with no cookie; then with `Sec-Fetch-Site: cross-site`. | No `{state, code}` body in either answer (owner-only). The status code: OQ-25. | both | node |
| I1c-ST-01 | ST busy-refused → other instance detaches → Retry → attached | R4 | After I1c-EP-02 | Detach the stub (F7 `detach()`). Press the card's Retry (`POST /api/fishball-instance/retry`). | O1 `starting`, then `ready`; O2 names `fishball-instance`'s id; one child process. | both | node |
| I1c-ST-02 | ST failed → Retry → starting → ready | R3, R6 | After a SIGKILL | Retry from the card. | O1 `failed` → `starting` → `ready`, in that order. (Card view: I1c-P-09.) | both | node |

**Decision table** (connector present × attach outcome × child healthy → card state, frame state, Retry offered):

| Rule | Connector | Attach outcome | Child healthy | Card state (O1) | Frame (O5) | Card Retry | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | present | accepted | yes | `ready` | "running" | no | I1c-DT-01 |
| 2 | present | accepted | no (killed) | `failed` / `NATIVE_CHILD_EXITED` | `failed` with the code, and Retry | yes | I1c-DT-02 |
| 3 | present | `instance-busy` | — (stopped) | `failed` / `NATIVE_INSTANCE_BUSY` | the attached stub's frame, not ours | yes | I1c-DT-03 |
| 4 | present (F10, which refuses) | `contract-version` | — (stopped) | `failed` / `NATIVE_CONTRACT_VERSION` | n/a (F10 draws no frame; the real connector would show `unattached`, §0.4) | yes | I1c-DT-04 |
| 5 | absent | — | — (not started) | `connector-missing` | no frame (no connector) | no | I1c-DT-05 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I1c-DT-01 | DT r1 | R1, R5 | Both enabled | Boot; open the view and the card. | Rule 1. | both | browser |
| I1c-DT-02 | DT r2 | R1, R5 | Rule 1 state | SIGKILL the child. | Rule 2. | both | browser |
| I1c-DT-03 | DT r3 | R4, R5 | As I1c-EP-02 | Open the view and the card. | Rule 3. | both | browser |
| I1c-DT-04 | DT r4 | R4, R5 | F10 told to refuse `contract-version` (the real connector never refuses the built-in instance's major) | Boot; open the instance's card. | Rule 4 (card part). | both | browser |
| I1c-DT-05 | DT r5 | R3, R5 | Instance only | Open DSH's Plugins page. | Rule 5. | both | browser |

---

## 4. I2 — the child launched like the host DSH (rewritten for D28, U1, U2)

The first version tested the child profile's move to Option A. D28 withdrew it (§0.5 "Child
profile (unchanged from today)", §18.1 "Withdrawn"). The existing slim-migration tests
(`dsh-web-app` dropped, `.pre-slim-` backup) stay the coverage for the manifest (§18.7).

**R** (old ids kept; new ones from §18.2 I2 R1–R7):
- I2-R1: ~~new child home gets `[dsh-base, dsh-web-app]`~~ **Withdrawn (D28: bundles `[dsh-base]`
  only, §0.5).**
- I2-R2: ~~base-only manifest gets `dsh-web-app` back, one backup~~ **Withdrawn (D28, §18.7).**
- I2-R3: owner-installed bundles are kept, in their order. **Stands, covered by the existing
  slim-migration tests (§0.5); no case here** (I2-DT-04/05 are withdrawn with their table).
- I2-R4: ~~overlay disables `ui-*`, `client-hmr`; `web-runtime` row; child UI row~~ **Withdrawn
  (D28: no `ui-*` rows, no `web-runtime` row, no child UI row, §0.5).**
- I2-R5: ~~readiness also requires `webServer`, `connection`, `sessionController`~~ **Withdrawn
  (D28: readiness is the base core services plus the app's loopback server, §0.5 "Readiness").**
- I2-R6: **Rewritten (§18.7, §3.2):** the bridge bearer reaches the main half over the wire only,
  and never reaches the disk or the logs. There is no launch token.
- I2-R7: ~~the preview notice is pre-acknowledged~~ **Withdrawn (D28: no DSH Web UI in the child).**
- I2-R8: lifecycle: starting → ready → stopping → stopped; a crash → failed → Retry (no automatic
  restart, inst-OQ-09).
- I2-R9: a startup timeout bounds readiness: 60 s, reported as `NATIVE_START_FAILED` (`NATIVE_TIMEOUT` is reserved and unused; §0.5, inst-OQ-07).
- I2-R10: the child's executable is the main process's `process.execPath` (§18.2 I2 R1).
- I2-R11: the child's arguments start with the main's `process.execArgv`, in order, without
  `--inspect*` and `--debug-port` flags, then the child's own
  `--import <parent-watch preload> <dsh bin> --profile fishball --patch <overlay> --host 127.0.0.1
  --port 0 --no-open`; no other flag is touched (R2, §0.5). The filter is Fishball's own call,
  pending the user (U2): OQ-26.
- I2-R12: the child's environment is the isolated set (`HOME`, `DSH_HOME`, `XDG_*`, `TMPDIR`,
  `DSH_TELEMETRY_DISABLED`) plus `NODE_OPTIONS` exactly as the main has it (when set), plus
  `ELECTRON_RUN_AS_NODE=1` under an Electron main, and nothing else of the main environment (no
  API key, no token, no `DSH_X_*`); `PATH` is the main's absolute entries in order (R3, §0.5).
- I2-R13: no `node` is looked up and no version probe runs (R4).
- I2-R14: under an Electron main (`process.versions.electron` set) the child always starts, as a
  background Node process with `ELECTRON_RUN_AS_NODE=1`, detached, with no window and no stdin,
  whether or not the main has the variable (R5, U2).
- I2-R15: the `fishball-instance` form has exactly the field `enabled`; a stored
  `nodeExecutable` or `executableSearchPath` changes nothing and logs nothing; the one-time
  migration copies only `enabled` and drops the two old values silently (R6, U1, §0.7).
- I2-R16: the child profile, its slim migration and the readiness rules stay as they are (R7).

**T:** P (plain Node; DSH-X wrapper; both versions), EP (main runtime; `execArgv`; `NODE_OPTIONS`;
a fake key outside `RUNTIME_ENV`; PATH; old stored launch values), ST (lifecycle), BVA (60 s
bound), DT (main runtime × `ELECTRON_RUN_AS_NODE` in the main).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I2-P-01 | P | ~~R1~~ | — | ~~Read the child manifest: `[base, web-app]`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-P-02 | P | ~~R2~~ | — | ~~Base-only seed gets `web-app` and one backup~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-P-03 | P | ~~R4~~ | — | ~~`ui-*` rows disabled, `web-runtime` options~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-P-04 | P | ~~R4~~ | — | ~~No `dsh web:` URL line; `BROWSER` recorder unused~~ | **Withdrawn (D28, §18.7: no `web-runtime` row).** | — | — |
| I2-P-05 | P | R6 | Ready; F4a records the bearer B1 it receives; Restart → B2 | Run F5 over both homes, all logs and process lists after boot, after the restart and after the main shutdown. | **Rewritten (§18.7: the bearer, not a launch token).** Zero hits for B1 and B2: not in any file under either home, not in `child-stderr.log*` or `lifecycle.log`, not in any argv or environment. B2 ≠ B1 (§3.2: tokens rotate on restart). | both | node |
| I2-P-06 | P | ~~R7~~ | — | ~~No preview notice in the iframe~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-P-07 | P (plain Node) | R10, R11, R16 | F8a; F4b | Boot; wait for ready. Compare F4b's report with the main process's own `process.execPath` and `process.execArgv` (read by a main-profile fixture). | Child `execPath` equals the main's. Child `execArgv` equals the main's (in order). The child's `argv` after the script carries, in order, `--profile fishball --patch <overlay> --host 127.0.0.1 --port 0 --no-open`, and its `--import` preload precedes the `dsh` bin. The child's profile bundles are `[@deepseek-ai/dsh-base]` (R16). O1 `ready`. | both | node |
| I2-P-08 | P (DSH-X wrapper) | R10, R11, R12, R14 | F8b; F4b; DSH.app installed (else record "skipped: no DSH-X" with the reason) | Boot; wait for ready. | Child `execPath` equals the main's wrapper path. Child `execArgv` equals the main's: DSH-X's `--use-system-ca`, `--max-http-header-size=131072` and its two `--import` hooks, in order. Child `NODE_OPTIONS` byte-equal to the main's. Child `ELECTRON_RUN_AS_NODE` is `1`. O1 `ready`. | both | node |
| I2-P-09 | P (environment) | R12 | F8a; the main environment has `HOME`, `TMPDIR`, `XDG_CONFIG_HOME` set to main values | Boot; read F4b's environment. | `HOME`, `DSH_HOME`, `TMPDIR` and every `XDG_*` present point inside the child home, not at the main values. `DSH_TELEMETRY_DISABLED` is set. Every other variable is one of: `PATH`, `NODE_OPTIONS` (only when the main has it), `ELECTRON_RUN_AS_NODE` (only under Electron). | both | node |
| I2-P-10 | P (no lookup) | R13 | F8d: a directory first on the main's `PATH` holds an executable `node` script that journals every call | Boot; wait for ready. Read the journal and F6. | The journal is empty. The only process spawned for the child home is the child itself, with the main's `execPath`; no short-lived probe process (F6 polled every 50 ms from boot to ready). | both | node |
| I2-P-11 | P (background child) | R14 | F8b; F4b | Boot; wait for ready. List all processes started from the wrapper binary during the run; read F4b's stdin type, `pid`, `ppid` and process group. | No new GUI/window process (every process of the wrapper binary other than the main has `ELECTRON_RUN_AS_NODE=1` in its environment). The child has no stdin (not a TTY, not a pipe from the main). Its process group differs from the main's (detached). | both | node |
| I2-P-12 | P (form schema) | R15 | F1 | Through a main-profile fixture, read `settings.describe()` for the `fishball-instance` namespace. | The schema's fields are exactly `enabled`. No `nodeExecutable`, `executableSearchPath`, `providerSync`, `limits` or `controlLimits` (§0.7). | both | node |
| I2-P-13 | P (card and form) | R15 | F2 on DSH's Plugins page | Open the `fishball-instance` card and its settings form. | One editable field, `enabled`. No input, label or help text for `nodeExecutable` / `executableSearchPath` (or their display words). The card's other parts are the status block and the "Model for Fishball" block (§0.7). | both | browser |
| I2-EP-01 | EP | ~~R5~~ | — | ~~`webServer` missing~~ | **Withdrawn (D28, §18.7).** A missing core service or app server now fails with `NATIVE_START_FAILED` (inst-OQ-07); see I2-EP-17. | — | — |
| I2-EP-02 | EP | ~~R5~~ | — | ~~`connection` missing~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-EP-03 | EP | ~~R5~~ | — | ~~`sessionController` missing~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-EP-04 | EP (`execArgv` empty) | R11 | F8a with no flags | Boot; F4b. | Child `execArgv` is empty; the child's own arguments follow directly. | both | node |
| I2-EP-05 | EP (`--inspect` forms) | R11 | F8a started in turn with `--inspect=0`, `--inspect`, `--inspect=127.0.0.1:0`, `--inspect-brk=0`, `--inspect-port=0`, `--inspect-wait=0` (each where the Node version knows it), each between `--no-warnings` before and `--max-old-space-size=512` after | Boot each; F4b. | Child `execArgv` is exactly `--no-warnings --max-old-space-size=512`: the `--inspect*` flag is gone, the others keep their order. The child reaches ready (no port clash). | both | node |
| I2-EP-06 | EP (`--debug-port`) | R11 | F8a with `--debug-port=9229` between the same two flags | Boot; F4b. | As I2-EP-05. The two-token form `--debug-port 9229` / `--inspect-port 0`: OQ-26. | both | node |
| I2-EP-07 | EP (other flags untouched) | R11 | F8a with `--no-warnings --enable-source-maps --import <a test hook that writes one line to a results file>` | Boot; F4b and the results file. | Child `execArgv` equals the main's exactly; the test hook ran once in the child too. | both | node |
| I2-EP-08 | EP (`NODE_OPTIONS` unset) | R12 | F8a, `NODE_OPTIONS` not set | Boot; F4b. | No `NODE_OPTIONS` in the child. | both | node |
| I2-EP-09 | EP (`NODE_OPTIONS` set) | R12 | F8a, `NODE_OPTIONS='--max-old-space-size=600 --no-deprecation'` | Boot; F4b. | Child `NODE_OPTIONS` byte-equal to the main's. | both | node |
| I2-EP-10 | EP (a fake key outside `RUNTIME_ENV`) | R12 | F8a with `FBTEST_SECRET=FAKEKEY-C-<random>`, `OPENAI_API_KEY=FAKEKEY-D-<random>`, `DSH_X_INSTANCE_LINK=fbtest-link`, `DSH_X_FBTEST=1` in the main environment | Boot; F4b; F5 over the child home, the child's logs and `ps eww` of the child. | None of the four variables is in the child environment. Zero hits for both fake keys and for `fbtest-link` on the child side. | both | node |
| I2-EP-11 | EP (PATH entries) | R12 | F8a with `PATH=/usr/bin:relative/bin::.:/opt/fbtest/bin:./x:/bin` | Boot; F4b. | Child `PATH` is `/usr/bin:/opt/fbtest/bin:/bin`: absolute entries only, in order. A PATH with no absolute entry: OQ-32. | both | node |
| I2-EP-12 | EP (one-time migration) | R15 | Main profile with the old `fishball-native-host` row config `{enabled: false, nodeExecutable: '/tmp/fbtest-node', executableSearchPath: '/tmp/fbtest-bin'}`; no `fishball-instance` user value; no `migrated` marker | Boot; read the `fishball-instance` namespace (O3-style fixture) and all main logs. | The namespace holds exactly `{enabled: false}`; the instance stays disabled. No key `nodeExecutable` or `executableSearchPath` in it. No log line names either key or value (silent drop, §0.7). The old row's config is unchanged (§0.2). | both | node |
| I2-EP-13 | EP (old stored values, invalid types) | R15 | `fishball-instance` row config with `nodeExecutable: 42` and `executableSearchPath: ''` written into the profile patch | Boot; F4b; main logs. | Main boot succeeds; the child starts with the main's `execPath`; O1 `ready`; nothing logged about the two keys. | both | node |
| I2-EP-14 | EP (no old values) | R15 | Fresh main home | Boot. | O1 `ready`; the namespace has only `enabled` (baseline for I2-EP-12, -13, -15, -16). | both | node |
| I2-EP-15 | EP (old `nodeExecutable` naming another Node) | R15 | Moved from I1-EP-04. `fishball-instance` row config with `nodeExecutable` set to a test copy of Node at a known path that journals each start | Boot; F4b; read the journal. | No effect: the child's `execPath` is the main's; the copy's journal is empty; nothing logged. | both | node |
| I2-EP-16 | EP (old `nodeExecutable` naming a missing file) | R15 | Moved from I1-EP-05. `nodeExecutable: '/nonexistent/fbtest-node'`, `executableSearchPath: '/nonexistent'` | Boot. | No effect: O1 `ready`, not `NATIVE_START_FAILED`; nothing logged about the keys. | both | node |
| I2-EP-17 | EP (a required core service missing) | R9, R16 | Child home pre-seeded with an owner bundle that disables the child's app row (inst-OQ-10) | Boot; wait 10 s. | O1 `failed` / `NATIVE_START_FAILED` at once, not after 60 s (inst-OQ-07). No attach; no orphan (F6). | both | node |
| I2-ST-01 | ST | R8 | F1 | Boot; record O1. | `starting`, then `ready`, in that order; no other state in between. | both | node |
| I2-ST-02 | ST | R8 | Ready | Disable the instance. Measure from the click until the child process is gone. | Stopping, then stopped. The child is gone within 4000 ms (§2.4 bound). | both | node |
| I2-ST-03 | ST | R8, R6 | Ready, bearer B1 (F4a) | SIGKILL the child. `POST /api/fishball-instance/retry`. | `failed` (`NATIVE_CHILD_EXITED`), then `starting`, then `ready`. The new bearer B2 ≠ B1. | both | node |
| I2-ST-04 | ST | R8 | Ready | End the main DSH (stdin EOF, as DSH's launcher expects). | The child stops; no orphan within 5000 ms after the main process exits. | both | node |
| I2-ST-X1 | ST (invalid) | R8 | Starting (F4 holds readiness 10 s) | Press Retry/Restart twice while starting. | Never more than one child process for the home (one writer). It reaches `ready` once. | both | node |
| I2-ST-X2 | ST (invalid) | R8 | Failed after a SIGKILL | Do nothing for 30 s. | It stays `failed` with no new child: no automatic restart (inst-OQ-09). | both | node |
| I2-ST-X3 | ST (invalid) | R8 | Stopping (F4 slows shutdown to 3 s) | Press Retry during stopping. | No second child while the first process is alive. | both | node |
| I2-BVA-01 | BVA (timeout − 1 s = 59 s) | R9 | F4 delays readiness to 59 s | Boot. | `ready`. | both | node |
| I2-BVA-02 | BVA (timeout, exact = 60 s) | R9 | F4 delays readiness to 60 s | Boot. | One defined outcome, either `ready` or `failed` / `NATIVE_START_FAILED`; no orphan; the state stays consistent with O2. Recorded, not asserted (an exact boundary races). | both | node |
| I2-BVA-03 | BVA (timeout + 1 s = 61 s) | R9 | F4 delays readiness to 61 s | Boot. | `failed` / `NATIVE_START_FAILED` (inst-OQ-07); the child is stopped; no attach. | both | node |
| I2-BVA-04 | BVA | ~~R2~~ | — | ~~migrations: 0~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-BVA-05 | BVA | ~~R2~~ | — | ~~migrations: 1~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-BVA-06 | BVA | ~~R2~~ | — | ~~migrations: 2~~ | **Withdrawn (D28, §18.7).** | — | — |

~~**Decision table** (manifest form → resulting bundles and backup), rules 1–6.~~ **Withdrawn with
I2-DT-01..06 (D28, §18.7).**

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I2-DT-01 | DT r1 | ~~R1~~ | — | ~~manifest absent~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-DT-02 | DT r2 | ~~R2~~ | — | ~~`[base]`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-DT-03 | DT r3 | ~~R2~~ | — | ~~`[base, web-app]`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-DT-04 | DT r4 | ~~R3~~ | — | ~~`[base, web-app, ownerA, ownerB]`~~ | **Withdrawn (D28, §18.7); owner order is the slim-migration tests'.** | — | — |
| I2-DT-05 | DT r5 | ~~R2, R3~~ | — | ~~`[base, ownerA, ownerB]`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I2-DT-06 | DT r6 | ~~R2~~ | — | ~~malformed manifest~~ | **Withdrawn (D28, §18.7).** | — | — |

**Decision table** (main runtime × `ELECTRON_RUN_AS_NODE` in the main → the child's variable and
the outcome; §0.5 "Electron host", U2). Every rule: always spawned.

| Rule | Main runtime | `ELECTRON_RUN_AS_NODE` in the main | Child's `ELECTRON_RUN_AS_NODE` | Outcome | Case |
| --- | --- | --- | --- | --- | --- |
| 7 | plain Node | unset | absent (not in `RUNTIME_ENV`) | spawned, `ready` | I2-DT-07 |
| 8 | plain Node | `1` | absent (the main is not Electron; not in `RUNTIME_ENV`) | spawned, `ready` | I2-DT-08 |
| 9 | Electron (DSH-X wrapper) | `1` | `1` | spawned, `ready`, no window | I2-DT-09 |
| 10 | Electron | unset (F8c) | `1` | spawned, `ready`, no window | I2-DT-10 |
| 11 | Electron | `0` (F8c) | `1` | spawned, `ready`, no window | I2-DT-11 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I2-DT-07 | DT r7 | R12, R14 | F8a, variable unset | Boot; F4b. | Rule 7. | both | node |
| I2-DT-08 | DT r8 | R12 | F8a with `ELECTRON_RUN_AS_NODE=1` | Boot; F4b. | Rule 8. | both | node |
| I2-DT-09 | DT r9 | R14 | F8b | Boot; F4b; process list. | Rule 9 (same run as I2-P-08, I2-P-11). | both | node |
| I2-DT-10 | DT r10 | R14 | F8c (variable deleted in the main before `appReady`) | Boot; F4b; process list. | Rule 10: no GUI process appears (I2-P-11's check). | both | node |
| I2-DT-11 | DT r11 | R14 | F8c (variable set to `0` in the main) | Boot; F4b; process list. | Rule 11. | both | node |

---

## 5. I3 — the main proxy (withdrawn as a task; kept as regression of the bearer proxy)

D28 withdrew I3 (proxy v2: token exchange, Host/Origin rewrite, `api/remote.mux`). The proxy is
the bearer proxy of §3 (`src/slim/host/embed.js`). No task owns new work here; the kept cases are
regression, read with "the bridge bearer" for "the launch token and the child cookie", the SSE
`api/events` stream for "streams", and `api/upload` for the 8 MiB route (§18.7). Expected codes
now follow inst-OQ-11's order (first failure wins: method 405 → path 400 → DSH admission 403/401
→ `token` query 400 → body 413 → 33rd stream 503 → not ready 503) and inst-OQ-13.

**R:**
- I3-R1: every `/fishball/embed/*` GET, HEAD and POST is forwarded to the child with the bearer
  (§3.2) and without the browser's credentials (§3.1, §3.5). *Rewritten (D28: no Host/Origin
  rewrite and no child cookie).*
- I3-R2: ~~`Set-Cookie` from the child never reaches the browser~~ kept only as "the child's
  bearer never reaches the browser" (I3-R6). **Withdrawn as stated (D28: no child cookie).**
- I3-R3: ~~`api/remote.mux` upgrades pass through~~ **Withdrawn (D28, §18.7).**
- I3-R4: requests the main DSH's admission refuses get its status and never reach the child; a
  `cross-site` fetch is 403; `same-origin`, `same-site`, `none` and an absent `Sec-Fetch-Site` are
  accepted (inst-OQ-11 (3)). *Rewritten.*
- I3-R5: the main DSH's cookie never reaches the child (D6).
- I3-R6: no bearer in any URL, page storage, disk or log; a browser `token` query is refused 400
  (inst-OQ-11 (4)). *Rewritten.*
- I3-R7: a child that is not ready answers 503 with the static error page (state, safe code,
  Retry); never a redirect (§3.6, inst-OQ-13). A disabled instance: 404 (inst-OQ-13).
- I3-R8: limits: 1 MiB JSON body, 8 MiB on `api/upload` (§3.6, §18.7).
- I3-R9: ~~across a restart, the proxy exchanges the new token itself~~ **Withdrawn (D28, §18.7).**
- I3-R10: only GET, HEAD and POST (405 with `Allow: GET, HEAD, POST`); no traversal, no encoded
  `..`, no backslash, no absolute URL (400) (§3.6, inst-OQ-11).

**T:** P, EP, BVA, ST, DT, SEC (regression only).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I3-P-01 | P (page) | R1 | Attached; F2 | Open the Fishball view. | `GET /fishball/embed/` gives 200 `text/html`; Fishball's chat page renders in the iframe; every request under `/fishball/embed/` in the HAR is 2xx or 304. *Rewritten (D29: the custom page).* | both | browser |
| I3-P-02 | P (assets) | R1 | As I3-P-01 | Inspect the HAR for `ui/*` modules and styles. | 200 with the right content types; no failed module load in the console. *Rewritten (no `plugins/??…` combos).* | both | browser |
| I3-P-03 | P (API and SSE) | R1 | As I3-P-01 | Inspect the page's `api/*` requests and its `api/events` stream. | 2xx JSON from the child; the SSE stream stays open and delivers events. *Rewritten (D28: SSE, not RPC).* | both | browser |
| I3-P-04 | P | ~~R3~~ | — | ~~WebSocket 101 to `api/remote.mux`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I3-P-05 | P (forwarded headers) | R1, R5 | F4a (OQ-24) | From the main page, `fetch('/fishball/embed/__fbtest/echo', {method:'POST', body})`. | The probe sees `Authorization: Bearer` with the bridge bearer, no Cookie of the main DSH, and the body sha256 equals the sent one. *Rewritten (§3.2; no Host/Origin assertion).* | both | node |
| I3-P-06 | P (HEAD) | R1 | F4a | `HEAD /fishball/embed/__fbtest/echo`. | 200; no body; the probe journals method HEAD. | both | node |
| I3-P-07 | P (iframe URL) | R6 | Attached | Read the iframe's `src` and the iframe document's `location.href`. | *Rewritten (K2).* `http://127.0.0.1:<mainPort>/fishball/embed/` with exactly the K2 `lang` parameter and nothing else: no `token`, no fragment (§3.2, K2-P-01). | both | browser |
| I3-P-08 | P (document headers) | R6 | Attached | Read the response headers of `GET /fishball/embed/`. | `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and a CSP with `frame-ancestors 'self'`. Whether the CSP also keeps `default-src 'self'` (§0.5, §3.3) or only `frame-ancestors` (inst-OQ-12): OQ-27. | both | node |
| I3-EP-01 | EP (method PUT) | R10 | Valid main cookie, same-origin | `PUT /fishball/embed/__fbtest/echo`. | 405 with `Allow: GET, HEAD, POST` (inst-OQ-11 (1)); the probe journals nothing. | both | node |
| I3-EP-02 | EP (method DELETE) | R10 | As I3-EP-01 | `DELETE …/echo`. | As I3-EP-01. | both | node |
| I3-EP-03 | EP (other methods: PATCH, OPTIONS) | R10 | As I3-EP-01 | Send each. | As I3-EP-01. | both | node |
| I3-EP-04 | EP (site: cross-site) | R4 | Valid cookie | `GET …/echo` with `Sec-Fetch-Site: cross-site` and `Origin: http://evil.test`. | 403; probe journals nothing. | both | node |
| I3-EP-05 | EP (same-site, other port) | R4 | Valid cookie | `Sec-Fetch-Site: same-site`, `Origin: http://127.0.0.1:<otherPort>`. | 403 (a foreign Origin, inst-OQ-11 (3)); nothing reaches the child. | both | node |
| I3-EP-06 | EP (site: `none`) | R4 | Valid cookie, same Host | `Sec-Fetch-Site: none` (a typed URL or "Open in a tab"). | *Rewritten (inst-OQ-11 (3)).* Accepted and proxied (200 from the child). | both | node |
| I3-EP-07 | EP (site header absent) | R4 | Valid cookie, same Host | No `Sec-Fetch-Site` header. | *Rewritten (inst-OQ-11 (3)).* Accepted and proxied. | both | node |
| I3-EP-08 | EP (auth: none) | R4 | Same-origin headers, no cookie | `GET /fishball/embed/`. | 401; nothing reaches the child. | both | node |
| I3-EP-09 | EP (auth: expired or forged) | R4 | A cookie value from an earlier, ended main process; then a tampered value | `GET /fishball/embed/` with each. | 401; nothing reaches the child. | both | node |
| I3-EP-10 | EP (the bearer offered by the browser) | R4, R6 | The bearer B (F4a) | Send `Authorization: Bearer B` with no main cookie; then as a cookie value. | *Rewritten (D28: no child cookie).* 401 both times; the bearer is no way past the main admission. | both | node |
| I3-EP-11 | EP (path: raw `..`) | R10 | Valid cookie; raw socket | `GET /fishball/embed/../api/…` and `GET /fishball/embed/ui/../../x`. | 400 (inst-OQ-11 (2)); nothing reaches the child; no main route outside the prefix is reached. | both | node |
| I3-EP-12 | EP (path: encoded `..`, backslash) | R10 | As I3-EP-11 | `%2e%2e/`, `%2E%2E%2F`, `..%2f`, `%252e%252e%252f`, `..%5c`, a raw `\`. | 400 for each (a double-encoded form that does not decode to `..` once: record). | both | node |
| I3-EP-13 | EP (absolute URL in the request target) | R10 | As I3-EP-11 | `GET http://127.0.0.1:<childPort>/ HTTP/1.1` and `GET http://evil.test/fishball/embed/`. | 400; nothing reaches the child. | both | node |
| I3-EP-14 | EP (prefix look-alike) | R10 | Valid cookie | `GET /fishball/embedx/` and `GET /fishball/embe`. | Not proxied (the main DSH's 404); nothing reaches the child. | both | node |
| I3-EP-15 | EP (no trailing slash) | R1 | Valid cookie | `GET /fishball/embed`. | 308 to `/fishball/embed/` (inst-OQ-12); the `Location` carries no secret. | both | node |
| I3-EP-16 | EP | ~~R3, R4~~ | — | ~~WebSocket from a foreign origin~~ | **Withdrawn (D28, §18.7).** | — | — |
| I3-EP-17 | EP | ~~R3, R4~~ | — | ~~WebSocket without auth~~ | **Withdrawn (D28, §18.7).** | — | — |
| I3-EP-18 | EP (browser `token` query) | R6 | Valid cookie | `GET /fishball/embed/?token=AAAA`. | 400 (inst-OQ-11 (4), §18.5 note); nothing reaches the child. | both | node |
| I3-BVA-01 | BVA (JSON body min − 1) | R8 | — | n/a: a body cannot be shorter than 0 bytes. | — | — | — |
| I3-BVA-02 | BVA (JSON body min = 0) | R8 | F4a | POST an empty body to `…/echo`. | Forwarded; the probe sees length 0. | both | node |
| I3-BVA-03 | BVA (JSON body max − 1 = 1 048 575 B) | R8 | F4a | POST. | Forwarded intact (sha256 matches). | both | node |
| I3-BVA-04 | BVA (JSON body max = 1 048 576 B) | R8 | F4a | POST. | Forwarded intact. | both | node |
| I3-BVA-05 | BVA (JSON body max + 1 = 1 048 577 B) | R8 | F4a | POST. | 413 (inst-OQ-11 (5)); the probe journals no request and no partial body. | both | node |
| I3-BVA-06 | BVA (upload min = 0) | R8 | `api/upload` (§18.7) | Upload 0 bytes. | Passed to the child, which answers with its own result (no proxy refusal). | both | node |
| I3-BVA-07 | BVA (upload max = 8 388 608 B) | R8 | As I3-BVA-06 | Upload exactly 8 MiB. | Forwarded intact (no 413). | both | node |
| I3-BVA-08 | BVA (upload max + 1) | R8 | As I3-BVA-06 | Upload 8 MiB + 1 B. | 413; nothing reaches the child. | both | node |
| I3-BVA-09 | BVA (streams min = 1) | R8 | Attached | Open one `api/events` stream through the proxy. | Accepted. | both | node |
| I3-BVA-10 | BVA | ~~R8~~ | — | ~~32 `remote.mux` streams~~ | **Withdrawn (§18.7, written for `remote.mux`).** The 32-stream limit for SSE: OQ-28. | — | — |
| I3-BVA-11 | BVA | ~~R8~~ | — | ~~33rd stream~~ | **Withdrawn (§18.7).** OQ-28. | — | — |
| I3-BVA-12 | BVA | ~~R8~~ | — | ~~idle 29 / 30 / 31 s~~ | **Withdrawn (§18.7).** OQ-28. | — | — |
| I3-ST-01 | ST (not ready) | R7 | F4 holds readiness for 20 s | During starting, `GET /fishball/embed/`. | 503 with the static error page (state, safe code, Retry); no `Location`; no bearer, child port or path in the body. Its language: I9-P-05. | both | node |
| I3-ST-02 | ST | ~~R9~~ | — | ~~re-exchange across a restart~~ | **Withdrawn (D28, §18.7).** | — | — |
| I3-ST-03 | ST | ~~R3, R9~~ | — | ~~WebSocket across a restart~~ | **Withdrawn (D28, §18.7).** | — | — |
| I3-ST-04 | ST (instance disabled) | R7 | Attached | Disable the instance; `GET /fishball/embed/`. | 404 (inst-OQ-13); nothing is proxied; no redirect. | both | node |
| I3-ST-X1 | ST | ~~R9~~ | — | ~~stale child cookie after a restart~~ | **Withdrawn (D28, §18.7).** | — | — |

**Decision table** (method × site × auth → status), rewritten for inst-OQ-11's order. "—" = any.

| Rule | Method | `Sec-Fetch-Site` | Main auth | Status | Reaches child | Case |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET, HEAD or POST | same-origin | valid | proxied (child's status) | yes | I3-DT-01 |
| 2 | GET, HEAD or POST | cross-site | — | 403 | no | I3-DT-02 |
| 3 | GET, HEAD or POST | `none` or absent | valid | proxied | yes | I3-DT-03 |
| 4 | GET, HEAD or POST | same-origin | none | 401 | no | I3-DT-04 |
| 5 | GET, HEAD or POST | same-origin | expired or forged | 401 | no | I3-DT-05 |
| 6 | PUT, DELETE or other | same-origin | valid | 405 | no | I3-DT-06 |
| 7 | PUT, DELETE or other | — | none or expired | 405 (method first) | no | I3-DT-07 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I3-DT-01 | DT r1 | R1 | F4a | Send each of GET, HEAD and POST. | Rule 1 for each. | both | node |
| I3-DT-02 | DT r2 | R4 | F4a | Cross-site × {GET, POST} × {valid, none}. | Rule 2 for all four. (PUT cross-site is rule 7.) | both | node |
| I3-DT-03 | DT r3 | R4 | F4a | {`none`, absent} × {GET, POST} × valid. | *Rewritten (inst-OQ-11).* Rule 3 for all four. | both | node |
| I3-DT-04 | DT r4 | R4 | F4a | Same-origin × {GET, HEAD, POST} × no cookie. | Rule 4. | both | node |
| I3-DT-05 | DT r5 | R4 | F4a | Same-origin × {GET, POST} × {expired, forged}. | Rule 5. | both | node |
| I3-DT-06 | DT r6 | R10 | F4a | Same-origin × {PUT, DELETE, PATCH} × valid. | Rule 6. | both | node |
| I3-DT-07 | DT r7 | R4, R10 | F4a | {same-origin, cross-site} × {PUT, DELETE} × {none, expired}. | *Rewritten (inst-OQ-11 (1)).* Rule 7: 405 in all eight; never reaches the child. | both | node |

**Security** (the bearer never reaches the browser, the disk or the logs; the main cookie never
reaches the child):

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I3-SEC-01 | EP (browser URLs) | R6 | F2, F4a; a scripted run: open the view, chat, open `?view=settings`, Restart, crash + Retry | Search every URL, `Location` and `Referer` in the HAR. | No bearer of any generation; no `token=` parameter anywhere. | both | browser |
| I3-SEC-02 | EP | ~~R2~~ | — | ~~child `Set-Cookie`~~ | **Withdrawn (D28, §18.7: no child cookie).** | — | — |
| I3-SEC-03 | EP (bodies and SSE events) | R6 | As I3-SEC-01 | Search every response body and every SSE event sent to the browser for the bearer. | Zero hits. | both | browser |
| I3-SEC-04 | EP (browser storage) | R6 | As I3-SEC-01 | Dump `document.cookie`, localStorage, sessionStorage, IndexedDB and Cache Storage of the main page and the iframe. | Zero hits for the bearer. *Rewritten: the child-cookie part withdrawn (§18.7).* | both | browser |
| I3-SEC-05 | EP (disk) | R6 | As I3-SEC-01, then main shutdown | F5 over the main home, the child home and temp directories. | Zero hits for every bearer generation. | both | node |
| I3-SEC-06 | EP (logs, including after a crash) | R6 | As I3-SEC-01, with a SIGKILL during a proxied request | F5 over main stdout/stderr, `child-stderr.log`, `child-stderr.log.1`, `lifecycle.log` and DSH's log directories. | Zero hits; no `Authorization` value with a secret in any line (§11 redaction). | both | node |
| I3-SEC-07 | EP (process list) | R6 | Attached | `ps eww` for the main and child processes. | No bearer in any argv or environment. | both | node |
| I3-SEC-08 | EP (main cookie to the child) | R5 | F4a; main cookie value M | Through the proxy: the page load and an `api/*` POST. | The probe never sees M or the main cookie's name. *Rewritten: the upgrade part withdrawn (§18.7).* | both | node |
| I3-SEC-09 | EP (error and refusal bodies) | R7, R6 | I3-ST-01, I3-EP-04, I3-EP-08, I3-BVA-05 bodies | Search the bodies. | No bearer, no child port, no file path, no URL with credentials (§11). | both | node |
| I3-SEC-10 | EP (Referer to the child) | R5 | F4a | Load the iframe, then navigate within it. | Any `Referer` the probe sees names no main-page path with a query or secret (`Referrer-Policy: no-referrer`). | both | node |

---

## 6. I4 — withdrawn (D28)

D28 withdrew the child UI plugin (session-only frame, slot shadows, `toggleSidebar`, DSH's model
picker). I4-R1..R7 and every I4 case are withdrawn (§18.1 "Withdrawn", §18.7). The `view` cases
move to I6 (R9), the effort cases to I8's regression, and §18.7's "no frame chrome, no
`postMessage`" cases (written as new I4 cases) to I8-P-08..10.

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I4-P-01 | P | ~~R1~~ | — | ~~DSH's conversation view of one session in the iframe~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** The chat page itself: I3-P-01, I8. | — | — |
| I4-P-02 | P | ~~R1~~ | — | ~~sidebar list, New session, pickers absent from the DOM~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** | — | — |
| I4-P-03 | P | ~~R2~~ | — | ~~rail about 56 px~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** (D19 no longer applies, §0.1.) | — | — |
| I4-P-04 | P | ~~R3~~ | — | ~~model picker lists both models (via Refresh models)~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-P-16** (via Check and Add on the card). | — | — |
| I4-P-05 | P | ~~R3~~ | — | ~~effort pane offers low, medium, high~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-P-17.** | — | — |
| I4-P-06 | P | ~~R3~~ | — | ~~chosen effort reaches the request~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-P-18.** | — | — |
| I4-P-07 | P | ~~R4~~ | — | ~~header Settings and Back~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-P-14.** | — | — |
| I4-P-08 | P | ~~R5~~ | — | ~~`?view=settings` opens directly~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-P-15.** | — | — |
| I4-P-09 | P | ~~R7~~ | — | ~~session opens with a late session list~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** | — | — |
| I4-EP-01 | EP | ~~R3~~ | — | ~~model without efforts~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-EP-07.** | — | — |
| I4-EP-02 | EP | ~~R5~~ | — | ~~`?view=foo`~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-EP-08.** | — | — |
| I4-EP-03 | EP | ~~R5~~ | — | ~~`?view=`~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-EP-07.** | — | — |
| I4-EP-04 | EP | ~~R5~~ | — | ~~`SETTINGS`, repeats~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-EP-06, I6-EP-09, I6-EP-10.** | — | — |
| I4-EP-05 | EP | ~~R1~~ | — | ~~DSH shortcuts inside the iframe~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** (inst-OQ-15 moot.) | — | — |
| I4-ST-01 | ST | ~~R4~~ | — | ~~chat → settings → chat~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-05.** | — | — |
| I4-ST-02 | ST | ~~R4, R5~~ | — | ~~settings (URL) → chat~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-05.** | — | — |
| I4-ST-03 | ST | ~~R6~~ | — | ~~reload in chat~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-06.** | — | — |
| I4-ST-04 | ST | ~~R6~~ | — | ~~reload in settings (URL)~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-07.** | — | — |
| I4-ST-05 | ST | ~~R6~~ | — | ~~reload after the header action~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-08.** | — | — |
| I4-ST-X1 | ST | ~~R4~~ | — | ~~a second settings panel~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-X3.** | — | — |
| I4-ST-X2 | ST | ~~R4~~ | — | ~~back in chat~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I6-ST-X4.** | — | — |
| I4-DT-01 | DT | ~~R3~~ | — | ~~effort model, `high` chosen~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-DT-01.** | — | — |
| I4-DT-02 | DT | ~~R3~~ | — | ~~effort model, none chosen~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-DT-02.** | — | — |
| I4-DT-03 | DT | ~~R3~~ | — | ~~model without efforts~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-DT-03.** | — | — |
| I4-DT-04 | DT | ~~R3~~ | — | ~~switch to a model without efforts~~ | **Withdrawn (D28: no DSH Web UI in the child, §18.7).** **Moved → I8-DT-04.** | — | — |

---

## 7. I5 — Fishball's session (partly withdrawn; the rest is task-free regression)

D28 withdrew the agent preset and the workspace registration: the custom chat creates and resumes
its one session itself (`src/slim/child/chat.js`), and nothing else resumes it (§0.5
"Fishball's session"). The kept cases are regression (§18.7).

**R:**
- I5-R1: the session is created once, with id `session-fishball-<uuid>`.
- I5-R2: ~~preset `fishball` registered with `agentPresetRegistry.register`~~ **Withdrawn (D28,
  §18.7).** The persona is registered in the agent's own scope on create and resume (§0.5).
- I5-R3: sandbox read-only and approval ask; a write tool fails at the sandbox.
- I5-R4: ~~private workspace; never "Choose workspace"~~ **Withdrawn (D28, §18.7).**
- I5-R5: after a child restart or a page reload, the persona, Fishball's tools and read-only mode
  are present. *Rewritten: DSH's session-controller path withdrawn.*
- I5-R6: no permission change is possible from the custom page: it has no permission control (D8,
  §18.7). *Rewritten.*
- I5-R7: exactly one Fishball session exists after any number of restarts.

**T:** P, ST, DT.

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-P-01 | P | R1, R3 | Fresh child home; F4c | Boot; wait for ready. List the child's sessions; read the session's header and log (O4). | *Rewritten (§18.7: no preset or workspace part).* Exactly one session. Its id matches `session-fishball-` followed by a canonical lowercase UUID. The log holds sandbox `read-only` and approval `ask`. | both | node |
| I5-P-02 | P | ~~R2~~ | — | ~~`agentPresets.list()` contains `fishball`~~ | **Withdrawn (D28, §18.7).** | — | — |
| I5-P-03 | P | R5 | Ready; F3 | Send one message; read the fake model's journal for that request. | The system text has Fishball's persona (its sections, e.g. "Asking the user"). The tool list equals Fishball's tool set and has no file-write or permission tool. | both | node |
| I5-P-04 | P | R3 | Ready; F3 scripts a call to a file-write tool available to the session | Send a message. | The tool result is a sandbox refusal; no file is created. | both | node |
| I5-P-05 | P | R6 | Ready; F2 | Search the custom page's DOM (chat and settings view) for a permission, sandbox or approval-mode control. | *Rewritten (§18.7: no DSH RPC exists to change the preset).* None exists; the log still shows `read-only` / `ask` after the whole I6 run. | both | browser |
| I5-P-06 | P | ~~R4~~ | — | ~~never "Choose workspace"~~ | **Withdrawn (D28, §18.7).** | — | — |
| I5-P-07 | P | R1 | Main home with three main sessions | Compare ids. | No main session id starts with `session-fishball-`; the Fishball session id appears in no main session list. | both | node |
| I5-ST-01 | ST none → created → live | R1 | Fresh child home | Boot. | Created once and live (same run as I5-P-01). | both | node |
| I5-ST-02 | ST live → child restart → resumed | R5, R7 | Live, id S | Restart; send a message. | The same id S; persona and tools in the request equal those of I5-P-03; still one session. | both | node |
| I5-ST-03 | ST restart × 5 | R7 | Live | Restart five times; then kill and Retry twice. | Exactly one session with the prefix; same id throughout. | both | node |
| I5-ST-04 | ST live → archived | R7 | Live | Archive the session through F4c (the child's `sessions` service). | Recorded: OQ-29 (inst-OQ-16's answer is declared moot by §18.5, but §18.7 keeps this case). If refused: still live. | both | node |
| I5-ST-05 | ST archived → next start | R7 | After I5-ST-04, if archive is allowed | Restart. | OQ-29; in every case exactly one non-archived Fishball session. | both | node |
| I5-ST-X1 | ST (invalid: double create) | R1, R7 | Fresh child home | Restart twice within 1 s of the first ready. | Still exactly one session. | both | node |

**Decision table** (resume path → tools and persona), rewritten: rules 2 and 4 withdrawn.

| Rule | Resume path | Tools and persona | Read-only | Case |
| --- | --- | --- | --- | --- |
| 1 | Fishball's own (child restart) | present, same as first start | yes | I5-DT-01 |
| 2 | ~~DSH's session controller~~ | **Withdrawn (D28)** | — | I5-DT-02 |
| 3 | page reload | present, same | yes | I5-DT-03 |
| 4 | ~~before the preset exists~~ | **Withdrawn (D28)** | — | I5-DT-04 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I5-DT-01 | DT r1 | R5 | Live | Restart; send. | Rule 1: the tool set and persona sections equal I5-P-03's. | both | node |
| I5-DT-02 | DT r2 | ~~R5~~ | — | — | **Withdrawn (D28, §18.7).** | — | — |
| I5-DT-03 | DT r3 | R5 | Live; F2 | Reload the iframe; send. | Rule 3. | both | browser |
| I5-DT-04 | DT r4 | ~~R2, R3~~ | — | — | **Withdrawn (D28, §18.7).** | — | — |

---

## 8. I6 — the settings view (custom page) and the model-sync button (rewritten for D26–D29)

**R** (§18.2 I6, §0.5 "Settings view", §0.7, §10; old ids kept, rewritten as §18.7 says):
- I6-R0: the instance registers `ui.settings = '/fishball/embed/?view=settings'` (§18.2 I6 (0)).
- I6-R1: a status block with the state and Restart; Restart is `admin.restart` and the page
  reconnects (§18.2 I6 (2), §0.7). *Rewritten.*
- I6-R2: a model block: the child's default model and reasoning effort (`admin.model.get` /
  `admin.model.set`), with the line "New models from DSH are added from Fishball instance → Model
  for Fishball in DSH's Plugins", plain text, no link and no sync button (§18.2 I6 (3), D26).
  *Rewritten (§18.7: no Refresh models on the page).*
- I6-R3: a plugins block in the custom view over the admin routes: list with enable, disable and
  remove, install by spec, the recommended list with Install, and each plugin's settings
  (`admin.plugins.*`, `admin.settings.*`); all of it targets the child profile (§18.2 I6 (4),
  §0.7). *Rewritten (§18.7: not DSH's Plugins page).*
- I6-R4: no connector value, no control that changes one, and no link to the connector's form
  (§18.2 I6 (5), inst-OQ-05, D27). *Rewritten.*
- I6-R5: every instance setting is stored in the child profile; the main DSH's `fishball-instance`
  form has exactly `enabled` (D23, U1, §0.7). *Rewritten (§18.7).*
- I6-R6: a refusal shows its code inline (§18.2 I6 (7)).
- I6-R7: the only page write to the main DSH is `admin.restart`; there is no upward
  `instance.restart` and no `providerSync.request` (§18.7, §10 "Removed"). *Rewritten.*
- I6-R8: light and dark (§18.2 I6 AC).
- I6-R9: the view switch: the header Settings action opens it and writes `view=settings` with
  `history.replaceState`; Back removes the parameter; loading `?view=settings` opens it directly;
  only the first `view` parameter with the exact lowercase value `settings` selects it; anything
  else shows the chat; reload keeps the URL's view (§0.5, §18.2 I6 (1), inst-OQ-14). Moved from I4.
- I6-R10: while the child restarts, "Restarting…" and every control disabled until it reconnects
  (§18.2 I6 (6), inst-OQ-17).
- I6-R11: model mutations are revision-checked, and so are plugin mutations; a stale one is
  refused with a typed code and writes nothing (§15 T11 "every mutation is revision-checked;
  refusals are typed"; §0.7 keeps those admin routes, D29). Code and re-read: OQ-34.
- I6-R12 (Check, §10 step 1–2): **Check for new models** on the `fishball-instance` card posts
  `models/check` once and lists only the providers the instance lacks, each with its name, its
  model ids and a checkbox, all ticked; `notOffered` in a collapsed "Not offered (k)" list with
  reasons; `present` as one line ("3 already in Fishball"); with none missing, "Nothing new to add"
  and no list. Concurrent presses share the check in flight.
- I6-R13 (Add, §10 step 3): **Add selected** posts `models/add {checkId, ids}` and writes exactly
  the ticked entries; it is disabled with none ticked; **Cancel** clears the list and writes
  nothing; the result line ("Added 2 · 1 failed") and a collapsed Details list name each chosen
  entry `added`, `skipped` or `failed` with its reason; a partial success is never rolled back;
  unchosen entries are neither written nor reported; an id outside the check's list is refused
  `invalid-selection` before any key is read; an Add while another runs is refused `sync-busy`.
- I6-R14 (mid-flow, §10): a check that loses the wire fails with its code (`child-sync-disconnected`,
  `sync-closed`) inline. An Add after a child restart, Retry, stop or detach, or with a list older
  than the 5-minute preview life, or after the main providers changed, is refused before any key
  is read (`repreview-required`, `preview-expired`, `sync-closed`); nothing is written; the card
  clears the list and says "Fishball restarted. Check again." A wire lost during Add reports every
  entry of that request `failed` `result-unknown`, not retried; committed writes stay; the card
  says "Check again".
- I6-R15 (§10): the button is disabled with the hint "Fishball is not running" unless the instance
  is `ready`.
- I6-R16 (§10): only API-key providers with a stored key or a set `apiKeyEnv` are offered; a login
  is `oauth-login`, a custom header `unsupported-provider`, an unset `apiKeyEnv`
  `api-key-env-unset`; a conflicting child profile `provider-conflict`; an `apiKeyEnv` provider is
  copied with its key value as a plain API-key record, never as the reference. The browser gets
  only `{id, name, models?, outcome?, reason?}` and the `checkId`: never a key, a mask, an
  endpoint, a protocol or a variable name; nothing is logged.

**T:** P, EP, BVA, ST, DT (§18.2 I6 T line). Local fixture packs and fake keys only (AC).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I6-P-01 | P | R1–R4 | Attached; F2 | Open `?view=settings`, and separately the header Settings action. | *Rewritten (§18.7, inst-OQ-05).* A status block (state, Restart); a model block (default model and effort, the plain line, no sync button); a plugins block. No connector value, no connector link, no Save bound to a connector key. | both | browser |
| I6-P-02 | P | R1, R10 | Settings open | Press Restart. | *Rewritten (§0.7: `admin.restart`).* The HAR shows one `POST /api/fishball/native/admin/restart`. The status shows "Restarting…", then the ready state. The child PID changes. The page reconnects by itself and its next action succeeds. Fishball's session keeps its id. | both | browser |
| I6-P-03 | P | R12, R13 | F3 `fake-a` in the main home; the child has none; F2 on the instance's card | Press Check for new models; then Add selected. | *Rewritten (§18.7).* The list shows one entry, `fake-a`, with its model ids (`fake-effort`, `fake-plain`), ticked. After Add: the result line counts 1 added; F4c shows `fake-a` and its key record in the child. The composer's model picker in the iframe lists both fake models (§10). | both | browser |
| I6-P-04 | P | R12 | After I6-P-03 | Press Check again. | *Rewritten.* "Nothing new to add", no list, and the line "1 already in Fishball" (§10 "Incremental"). F4c: the child's credential records are unchanged. | both | browser |
| I6-P-05 | P | R12, R16 | Main home with `fake-a`, an OAuth (grant) provider, an `apiKeyEnv` provider with the variable unset, and one with a custom header | Press Check; open "Not offered". | *Rewritten.* `missing` lists only `fake-a`. "Not offered (3)" lists the other three with `oauth-login`, `api-key-env-unset` and `unsupported-provider`. | both | browser |
| I6-P-06 | P | R3 | F9; main manifest byte copy | Install `fbtest-plugin-a` by spec from the settings view's Plugins block. | *Rewritten (§18.7: the custom view over `plugin/install`).* It appears in the block's list and in the child profile (F4c); the main manifest is byte-identical. | both | browser |
| I6-P-07 | P | R3 | After I6-P-06 | Disable, enable, then remove it from the block. | *Rewritten.* Each change shows in the list and in the child profile; the main profile is unchanged. | both | browser |
| I6-P-08 | P | R3, R5 | `fbtest-plugin-a` installed (one setting) | Change the setting in the block's plugin settings. | *Rewritten.* Stored in the child profile (F4c `settings`); nothing changes in the main home. | both | browser |
| I6-P-09 | P | R3 | F9 (recommended entry pointed at a local pack, inst-OQ-17) | Open the recommended list; press Install on the entry. | *Rewritten.* The entry is listed; Install installs it into the child profile; no network call outside the test. | both | browser |
| I6-P-10 | P | R4 | Attached | Change `maxQueuedInputs` in DSH's own form for `fishball-connector`; reload the settings view; search its DOM text for the old and new values and the key name. | *Rewritten (§18.7).* No connector value and no connector link on the view: neither value, the key, nor any link or button to the connector's form. | both | browser |
| I6-P-11 | P | R7 | Byte copies of the main manifest, the `fishball-connector` row config with its revision (O3), and the main credential store; F2 HAR | Run every view action (Restart, model change, plugin install/enable/disable/remove, a plugin setting) and Check and Add ×2 on the main card. | *Rewritten (§18.7).* The main manifest, the connector config and revision, and the main credential store are unchanged. The view's requests to the main DSH are only `/fishball/embed/*` and `/api/fishball/native/admin/*`; the only one that writes on the main side is `restart`, which the main half runs itself (§0.7: the relay answers `status` and `restart` itself and sends the rest to the child). | both | browser |
| I6-P-12 | P | R5 | Attached | Open DSH's Plugins page → `fishball-instance` settings form. | *Rewritten (§18.7, U1).* The form has exactly `enabled`; the card also has the "Model for Fishball" block (same check as I2-P-12, I2-P-13). | both | browser |
| I6-P-13 | P | R8 | Main theme light, then dark | Screenshot the settings view in each. | Rewritten (U3): the view follows the parent's theme (U3-P-01). All blocks legible in both; colours from the tokens (I8-P-07); focus rings visible. | both | browser |
| I6-P-14 | P (header Settings) | R9 | Moved from I4-P-07. Chat at `/fishball/embed/?lang=en`; read `history.length` | Press the header's Settings action. Then press the view's Back action. | The settings view replaces the chat; the URL has `view=settings` and still `lang=en`; `history.length` is unchanged (`replaceState`). Back: the chat of the same session with its history; the URL has no `view` parameter and still `lang=en`; `history.length` still unchanged. | both | browser |
| I6-P-15 | P (direct load) | R9, R0 | Moved from I4-P-08. Attached | Load `/fishball/embed/?view=settings` (the registered `ui.settings`), and open it with the connector card's "Open instance settings". | The settings view shows at once, without the chat shown first; never the chat (§0.6). | both | browser |
| I6-P-16 | P (model block) | R2 | F3 synced (`fake-effort`, `fake-plain`) | Read the block; set `fake-effort` with `high`; send a message in the chat. | The block shows the child's current default model and effort. After the change, the next request in the fake model's journal uses `fake-effort` with effort `high` (§9: "takes effect on the next request"). | both | browser |
| I6-P-17 | P (the plain line) | R2 | Settings open | Read the model block; search the whole view for links and buttons. | The line reads exactly "New models from DSH are added from Fishball instance → Model for Fishball in DSH's Plugins" (en). It contains no `a` element and is not focusable. The view has no sync, Check or Add button (D26). | both | browser |
| I6-P-18 | P (check → untick one → add) | R12, R13 | F3 `fake-a` and `fake-env` (variable set); the child has none | Check; untick `fake-env`; Add selected; Check again. | Both are listed, ticked. After Add: the result counts 1 added; F4c shows `fake-a` only; `fake-env` is not written and not in the result (§10: unchosen entries are not reported). The second check lists only `fake-env` (E2E-B2). | both | browser |
| I6-P-19 | P (list contents) | R12 | `fake-a` missing; the child already has `fake-1` (same profile); an OAuth provider | Check. | One checkbox entry per missing provider with its name and model ids; "Not offered (1)" collapsed by default, with `oauth-login`; one line "1 already in Fishball". | both | browser |
| I6-P-20 | P (secret round-trip) | R16 | F3 `fake-a` (stored key `FAKEKEY-A-…`) and `fake-env` (`apiKeyEnv: FBTEST_ENV_…` = `FAKEKEY-B-…`); F2 with HAR; F5 | Check; Add both. Then F5 over the browser side (HAR, storage), the check and add answer bodies, the card's DOM, and the logs of both homes (`child-stderr.log*`, `lifecycle.log`, DSH's logs). Read F4c. | Browser side and logs: zero hits for both keys, for any 4+ character prefix or suffix of them (no mask), for `FBTEST_ENV_…`, and for the fake server's URL. The answers carry only ids, names, model ids, outcomes, reasons and the `checkId` (§10). Child side (F4c): both providers exist; `fake-env`'s key value is stored as a plain API-key record, and the child's provider profile has no `apiKeyEnv` (§10 "Env keys"). | both | browser |
| I6-P-21 | P (partial success) | R13 | `fake-a` and `fake-1` missing; after Check, a test fixture creates `fake-1` in the child with a different key (a race) | Add both. | Each chosen entry has its own outcome: `fake-a` `added`; `fake-1` `skipped` with a reason (§10: "lost a race to an entry created meanwhile"). `fake-a` stays in the child (never rolled back); `fake-1` keeps the fixture's key (create-only). | both | node |
| I6-P-22 | P (all ticked) | R13 | `fake-a`, `fake-env` missing | Check; Add selected with both ticked; Check. | Both `added`; the second check reads "Nothing new to add" (§10 "Incremental"). | both | browser |
| I6-EP-01 | EP (connector edit attempt) | R4 | Attached | Search the view's DOM for editable controls of any `fishball-connector` key; tab through every focusable element. | *Rewritten.* None exists, and no element links to the connector's form. O3's revision is unchanged after the whole I6 run. | both | browser |
| I6-EP-02 | EP (no providers to offer) | R12 | Main home without API-key providers | Check. | *Rewritten.* No failure; "Nothing new to add" (inst-OQ-17), no list, no Add button enabled; the composer list is unchanged. | both | browser |
| I6-EP-03 | EP (check loses the wire) | R14, R15, R6 | F3 `fake-a`; F4 delays the child's preview answer by 3 s | Press Check; restart the child (`admin.restart`) while it runs. | *Rewritten.* The check fails inline with its code (`child-sync-disconnected` or `sync-closed`). The button is disabled with "Fishball is not running" until `ready`; then Check works and lists `fake-a`. Nothing is written. | both | browser |
| I6-EP-04 | EP (unknown plugin spec) | R3, R6 | Offline | Install `fbtest-does-not-exist` from the view. | *Rewritten.* Refused inline with its typed code (§15 T11); the child profile is unchanged. | both | browser |
| I6-EP-05 | EP (malformed spec: empty, only spaces) | R3, R6 | — | Try to install each from the view. | *Rewritten.* Refused before or by the child, with a code; no change. | both | browser |
| I6-EP-06 | EP (`view=Settings`) | R9 | Moved from I4-EP-04 | Load `?view=Settings`. | The chat (exact lowercase only). | both | browser |
| I6-EP-07 | EP (`view=` empty) | R9 | Moved from I4-EP-03 | Load `?view=`. | The chat. | both | browser |
| I6-EP-08 | EP (`view=x`) | R9 | Moved from I4-EP-02 | Load `?view=x`; also no `view` at all. | The chat both times. | both | browser |
| I6-EP-09 | EP (`view=settings&view=x`) | R9 | Moved from I4-EP-04 | Load it. | The settings view (the first `view` is `settings`). | both | browser |
| I6-EP-10 | EP (`view=x&view=settings`) | R9 | Moved from I4-EP-04 | Load it. | The chat (only the first `view` counts). | both | browser |
| I6-EP-11 | EP (none ticked) | R13 | `fake-a`, `fake-env` listed | Untick both. | Add selected is disabled; pressing it does nothing; no `models/add` request in the HAR. (The route with `ids: []`: OQ-33.) | both | browser |
| I6-EP-12 | EP (Cancel) | R13 | `fake-a` listed | Press Cancel. Then Check again. | The list is cleared; no `models/add` request; F4c unchanged. The new check lists `fake-a` again with a new `checkId`. (An Add with the cancelled `checkId` within its 5-minute life: OQ-31.) | both | browser |
| I6-EP-13 | EP (stale `checkId`) | R13, R14 | Check C1 → `checkId` K1; Add with K1 succeeds for `fake-a`; a second Check C2 → K2 | `POST models/add {checkId: K1, ids:['fake-env']}` (used once); then `{checkId: 'fbtest-forged', ids:['fake-env']}`; then K2 with `fake-env`. | The first two are refused (`preview-expired` or `repreview-required`) and write nothing (F4c unchanged). The third adds `fake-env`. | both | node |
| I6-EP-14 | EP (an id not in the list) | R13 | Check lists `fake-a` only; the child already has `fake-1`; the main home also has OAuth `fbtest-oauth` | `models/add` with ids `['fake-a', 'fbtest-not-there']`; then `['fake-1']` (present); then `['fbtest-oauth']` (not offered). | Each is refused `invalid-selection`; nothing is written, `fake-a` included (the refusal comes before any key is read, §10 step 3). | both | node |
| I6-EP-15 | EP (restart between Check and Add) | R14 | `fake-a` listed on the card (F2) | Restart the child (each run one of: the view's Restart; Retry after a SIGKILL; disable then enable the connector; disable then enable the instance). Then press Add selected, or post the old `checkId` to the route if the button is gone. | Refused before any key is read (`repreview-required`, `preview-expired` or `sync-closed`); F4c unchanged. The card clears the list and says "Fishball restarted. Check again." After `ready`, Check lists `fake-a` again. | both | browser |
| I6-EP-16 | EP (main providers changed in between) | R14 | `fake-a` listed | Add `fake-2` to the main home's providers; press Add selected. | Refused `repreview-required`; nothing written; the card asks to check again. | both | node |
| I6-EP-17 | EP (`result-unknown`: wire lost during Add) | R14 | `fake-a`, `fake-env` listed and ticked; F4e holds the child's `import` answer | Press Add selected; while F4e holds, SIGKILL the child. Retry; Check. | Both entries `failed` `result-unknown`, not retried (no second `import` in F4e's journal). The card says "Check again". After `ready`, the check lists only what is still missing per F4c (writes that committed stay). | both | node |
| I6-EP-18 | EP (`sync-busy`: second Add during an Add) | R13 | `fake-a` listed; F4e holds the `import` answer | Post `models/add` with that check; while it is held, post a second `models/add` (same and a new `checkId`). In F2, look at the button during the hold. | The second request is refused `sync-busy` and writes nothing; the first completes after the release. The card's Add button is disabled while the first runs. | both | node |
| I6-EP-19 | EP (concurrent Check presses) | R12 | `fake-a` missing; F4 delays the preview answer by 2 s | Post `models/check` three times within 100 ms; also double-click the card's button. | All answers carry the same `checkId` and lists; the child received one preview request (F4 journal). | both | node |
| I6-EP-20 | EP (provider kinds) | R16 | Main home: stored key (`fake-a`); `apiKeyEnv` set (`fake-env`); `apiKeyEnv` unset; OAuth; custom header; a built-in route with a key, which the child has with no override and no key | Check. | `missing`: `fake-a`, `fake-env`, the built-in route. `notOffered`: `api-key-env-unset`, `oauth-login`, `unsupported-provider` (§10). | both | node |
| I6-EP-21 | EP (child side) | R12, R16 | Child has: none of `fake-1`; `fake-2` with the same profile; `fake-3` with a different profile under the same id; `fake-4` with its key already set | Check. | `fake-1` in `missing`; `fake-2` and `fake-4` counted in `present`, not listed; `fake-3` in `notOffered` `provider-conflict`. After Add of all `missing`, `fake-3` is unchanged in the child (§10: kept, never overwritten). | both | node |
| I6-EP-22 | EP (stale model revision) | R11, R6 | Two tabs of the settings view, A and B, both loaded | In A set the default model to `fake-plain`. In B (not reloaded) set it to `fake-effort`/`high`. | B's change is refused with a typed code shown inline in B's model block; the child's default stays `fake-plain` (F4c). After B re-reads (reload), its change succeeds. | both | browser |
| I6-EP-23 | EP (stale plugin inventory) | R11, R6 | Two tabs A and B; `fbtest-plugin-a` installed | In A remove `fbtest-plugin-a`. In B (not reloaded) disable it. | B's action is refused with a typed code inline; the child profile is as A left it. | both | browser |
| I6-EP-24 | EP (stale plugin setting revision) | R11 | Two tabs A and B on `fbtest-plugin-a`'s settings | Save a value in A; then a different value in B without reload. | B refused with a typed code; the stored value is A's. | both | browser |
| I6-EP-25 | EP (sync routes without the owner) | R16 | Ready | `POST models/check` and `models/add` with no cookie; then with `Sec-Fetch-Site: cross-site`. | Neither answers a `checkId` or a list; nothing written (owner-only, §10). | both | node |
| I6-BVA-01 | BVA (connector field at min) | R4 | DSH's form sets one connector limit to its min (conn-OQ-19) | Open the view; search its text. | *Rewritten (§18.7).* No connector value and no connector link. | both | browser |
| I6-BVA-02 | BVA (connector field at its default) | R4 | DSH's form at the default | As I6-BVA-01. | *Rewritten.* As I6-BVA-01. | both | browser |
| I6-BVA-03 | BVA (missing entries: 0) | R12 | — | Same run as I6-EP-02. | *Rewritten.* "Nothing new to add", no list. | both | browser |
| I6-BVA-04 | BVA (missing entries: 1) | R12 | — | Same run as I6-P-03. | *Rewritten.* One entry, ticked. | both | browser |
| I6-BVA-05 | BVA (missing entries: 5) | R12 | Five fake API-key providers `fake-1..5`; the child has none | Check. | *Rewritten.* Five entries, all ticked, each with its model ids; "0 already in Fishball" or no present line (wording of 0: recorded). Missing − 1 n/a (a count below 0 cannot exist). | both | browser |
| I6-BVA-06 | BVA (ticked: 0) | R13 | Five listed | Untick all. | Add disabled (same rule as I6-EP-11). | both | browser |
| I6-BVA-07 | BVA (ticked: 1) | R13 | Five listed | Tick only `fake-3`; Add; Check. | Only `fake-3` is `added` and in the child; the result names only it; the next check lists the other four. | both | browser |
| I6-BVA-08 | BVA (ticked: all = 5) | R13 | Five listed | Add with all ticked; Check. | Five `added`; "Nothing new to add". | both | browser |
| I6-BVA-09 | BVA (list age: preview life − 1 s = 4 min 59 s) | R14 | `fake-a` listed; a fake clock or a wait | Add at 4:59 after the check. | `fake-a` `added`. | both | node |
| I6-BVA-10 | BVA (list age: preview life + 1 s = 5 min 1 s) | R14 | As I6-BVA-09 | Add at 5:01. | Refused (`preview-expired`); nothing written; the card clears the list and asks to check again (§10). | both | node |
| I6-BVA-11 | BVA (list age: exactly 5 min) | R14 | As I6-BVA-09 | Add at 5:00. | One defined outcome, added or refused, with nothing half-written. Recorded, not asserted (an exact boundary races). | both | node |
| I6-ST-01 | ST page ready → restarting → ready | R10 | Settings open | Restart; watch every control. | *Rewritten (inst-OQ-17).* While restarting: "Restarting…" and every control disabled; after it reconnects: enabled. | both | browser |
| I6-ST-02 | ST concurrent presses | R12, R13 | F3 | Double-click Check; then press Add twice within 100 ms. | *Rewritten (§18.7).* One check (I6-EP-19); one Add runs: the button is disabled while it runs, and a second request at the route is `sync-busy` (I6-EP-18). | both | browser |
| I6-ST-03 | ST check failed → Check again → listed | R14 | As I6-EP-03 | — | *Rewritten.* Same run as I6-EP-03. | both | browser |
| I6-ST-04 | ST plugin idle → busy → done / refused → idle | R3, R6 | F9 | In the view, install a valid pack, then an unknown spec, then a valid one again. | *Rewritten (custom view).* Done, refused (with code), done; the control is usable again after each. | both | browser |
| I6-ST-05 | ST chat → settings → chat | R9 | Moved from I4-ST-01, -02 | Header Settings, then Back; then load `?view=settings` and Back. | Settings, then chat; one view at a time; after Back the URL has no `view`. | both | browser |
| I6-ST-06 | ST reload in chat | R9 | Moved from I4-ST-03. Chat | Reload the iframe. | Chat, same session. | both | browser |
| I6-ST-07 | ST reload in settings (URL) | R9 | Moved from I4-ST-04. At `?view=settings` | Reload. | Settings. | both | browser |
| I6-ST-08 | ST reload after the header action | R9 | Moved from I4-ST-05. Settings opened with the header action | Reload. | Settings (the action wrote `view=settings`, inst-OQ-14). | both | browser |
| I6-ST-09 | ST card: idle → checking → listed → adding → result | R12, R13 | `fake-a` missing | Check; Add selected; Check. | The card passes idle → checking → listed → adding → result line → (Check) "Nothing new to add". | both | browser |
| I6-ST-10 | ST listed → Cancel → idle | R13 | — | Same run as I6-EP-12. | — | both | browser |
| I6-ST-11 | ST listed → child restart → "check again" | R14 | — | Same run as I6-EP-15. | — | both | browser |
| I6-ST-12 | ST adding → wire lost → result with `result-unknown` | R14 | — | Same run as I6-EP-17. | — | both | node |
| I6-ST-X1 | ST (invalid: Restart while restarting) | R1, R10 | Restarting | Press Restart (disabled); post `admin/restart` a second time. | No second restart: exactly one new child PID. | both | node |
| I6-ST-X2 | ST (invalid: Check while not ready) | R15 | Each of `starting` (F4 hold), `failed`, `connector-missing` | Look at the card; try Check. | *Rewritten.* Disabled with "Fishball is not running"; no check starts. | both | browser |
| I6-ST-X3 | ST (invalid: a second settings view) | R9 | Moved from I4-ST-X1. Settings open | Look for the header Settings action; trigger it if reachable. | At most one settings view; no stacked views; the URL still has one `view=settings`. | both | browser |
| I6-ST-X4 | ST (invalid: Back in chat) | R9 | Moved from I4-ST-X2. Chat | Look for the view's Back action. | None in the chat. | both | browser |

**Decision table** (view action × instance state → control and result), rewritten:

| Rule | Action | Instance state (view open) | Control | Result | Case |
| --- | --- | --- | --- | --- | --- |
| 1 | Restart | ready | enabled | new child; page reconnects | I6-DT-01 |
| 2 | model change (`admin.model.set`) | ready | enabled | the next request uses it | I6-DT-02 |
| 3 | plugin install/enable/disable/remove/settings | ready | enabled | applied in the child profile | I6-DT-03 |
| 4 | any of the above | restarting | disabled, "Restarting…" | no effect | I6-DT-04 |
| 5 | connector setting edit | any | not offered, no link | nothing changes (O3 unchanged) | I6-DT-05 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I6-DT-01 | DT r1 | R1 | Ready | Restart. | Rule 1 (with I6-P-02). | both | browser |
| I6-DT-02 | DT r2 | R2 | Ready | Change the default model. | *Rewritten (§18.7: rule 2 was Refresh models).* Rule 2 (with I6-P-16). | both | browser |
| I6-DT-03 | DT r3 | R3 | Ready | Each plugin action. | Rule 3 (with I6-P-06..08). | both | browser |
| I6-DT-04 | DT r4 | R1–R3, R10 | Restarting | Try each action. | Rule 4. | both | browser |
| I6-DT-05 | DT r5 | R4 | Ready and restarting | Look for connector edits and links. | Rule 5 (with I6-EP-01). | both | browser |

**Decision table** (instance state × list fresh × ticked count → Check and Add enabled), new (§18.2
I6 DT, §10):

| Rule | Instance state | List | Ticked | Check | Add selected | Case |
| --- | --- | --- | --- | --- | --- | --- |
| 6 | `ready` | none shown | — | enabled | not shown | I6-DT-06 |
| 7 | `ready` | fresh | 0 | enabled (OQ-30) | disabled | I6-DT-07 |
| 8 | `ready` | fresh | ≥ 1 | enabled (OQ-30) | enabled; writes the ticked ones | I6-DT-08 |
| 9 | `ready` again after a restart | shown from before the restart | ≥ 1 | enabled | list cleared, "Fishball restarted. Check again."; an Add of the old list is refused | I6-DT-09 |
| 10 | `ready` | older than 5 min | ≥ 1 | enabled | refused `preview-expired`, list cleared (§10 "the same happens") | I6-DT-10 |
| 11 | not `ready` (`starting`, `stopping`, `failed`, `connector-missing`) | any | any | disabled, "Fishball is not running" | refused if posted | I6-DT-11 |
| 12 | `ready` | an Add running | any | OQ-30 | disabled; a second Add is `sync-busy` | I6-DT-12 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I6-DT-06 | DT r6 | R12 | Ready, card fresh | Open the card. | Rule 6. | both | browser |
| I6-DT-07 | DT r7 | R13 | Listed | Untick all. | Rule 7. | both | browser |
| I6-DT-08 | DT r8 | R13 | Listed | Keep one ticked; Add. | Rule 8. | both | browser |
| I6-DT-09 | DT r9 | R14 | Listed; restart | — | Rule 9 (with I6-EP-15). | both | browser |
| I6-DT-10 | DT r10 | R14 | Listed; 5 min 1 s | — | Rule 10 (with I6-BVA-10). | both | node |
| I6-DT-11 | DT r11 | R15 | Each state | Open the card; post `models/add` with an earlier `checkId`. | Rule 11 (with I6-ST-X2). | both | browser |
| I6-DT-12 | DT r12 | R13 | F4e hold | — | Rule 12 (with I6-EP-18). | both | browser |

---

## 9. I7 — card records in the custom chat (rewritten for D29, U5, U6)

**R** (§18.2 I7 R1–R6, §0.5 "Records", §0.9 U5, U6, inst-OQ-18):
- I7-R1: a card record (`plugin:fishball/card-record`) in Fishball's session shows in the custom
  chat as one compact row at its place in the timeline: kind, outcome, who and where, the asking
  session's title, the time; expanded: the questions or the call, the answer, the note, the
  closure reason. *Rewritten (D29: the custom chat, not DSH's chat view).*
- I7-R2: the same records still render in main sessions through the connector (C3), unchanged.
- I7-R3: the row's words equal the connector's `record.*` words in the same language, and it shows
  the same fields as the connector's row (U6). *Rewritten (§18.7: no shared module).*
- I7-R4: rows survive a child restart and a page reload, with no duplicate after a reconnect.
- I7-R5: records never enter a model request; a user answer's notice still wakes Fishball
  (§18.2 I7 R6, 7713 N9-b).
- I7-R6: placement: an answer given in the asking session gets no session copy; Fishball's own
  `ask_user` card has only Fishball's copy; a session not loaded when its card closes gets no
  session copy. (Kept from the first version; these are the writer's rules, §8.1.)
- I7-R7: a text over its cap is cut by the writer, with `…` as the last character; the row shows
  the cut text (inst-OQ-18: caps 500, 200, 2,000 by field).
- I7-R8: Fishball's decision labels are unchanged: a label and a record for the same card may both
  show, with no merge, replacement or de-duplication (U5). Inbox notices keep their row (R4 of
  §18.2).

**T:** P, EP (kind; optional fields), BVA (caps), ST (written → shown → restart → shown once).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I7-P-01 | P | R1, R2 | A managed main session S asks a permission; Fishball (scripted) allows it once with a low risk and a reason | Look at Fishball's chat and at S. | *Rewritten (D29: the custom chat).* One compact row in each, with the words for "Allowed once"; in Fishball's chat the collapsed row names S's title (§18.2 I7 R1). | both | browser |
| I7-P-02 | P | R1 | Three records A, B, C in that order (from three managed sessions) | Open Fishball's chat. | Three rows, at their places in the timeline, in the order A, B, C, each naming its session. | both | browser |
| I7-P-03 | P | R1 | After I7-P-01 | Expand the row on both sides. | The full card: tool, session, arguments where known, and the decision with its reason. | both | browser |
| I7-P-04 | P | R3 | After I7-P-01, in `?lang=en` and `?lang=zh` with DSH in the same language | Compare the row's words and its fields (names and order) on the two sides, collapsed and expanded. | *Rewritten (U6, §18.7).* The same words and the same fields. (Fishball's collapsed row also names the asking session, §18.2 I7 R1.) | both | browser |
| I7-P-05 | P | R5 | After I7-P-01 and I7-P-02 | Send one more turn in Fishball's chat and one in S; read the fake model's journal. | No record text (wording, reason, labels) in either request. | both | node |
| I7-P-06 | P (words equal, static) | R3 | — | Load the instance page's dictionaries (`i18n.js` `DICTIONARIES`) and the connector client's `en` and `zh` dictionaries; compare every `record.*` key. | The two sides have the same `record.*` keys, and each key has the same text, in `en` and in `zh` (U6). | both | static |
| I7-P-07 | P (label and record both show) | R8 | Fishball decides a permission of S (it writes a decision label and a card record) | Look at Fishball's chat. | Both the decision label and the record row are shown, each once; neither replaces the other (U5). | both | browser |
| I7-P-08 | P (notice still wakes) | R5 | Fishball idle; S's card answered by the user in S | Watch the fake model's journal. | A new request starts without any user message to Fishball (the notice woke it, 7713 N9-b); the request has no record text. | both | node |
| I7-P-09 | P (time) | R1 | One record | Read the row's time. | It equals the record's time, formatted in the page's language (I9-P-07). | both | browser |
| I7-EP-01 | EP (permission answered by the user in S) | R6 | S asks; the user answers in S | — | Fishball's copy only; no record row in S. | both | browser |
| I7-EP-02 | EP (question answered by Fishball) | R1, R2 | S asks a question; Fishball answers | — | A row on both sides with the question wording and the chosen labels. | both | browser |
| I7-EP-03 | EP (question answered by the user in S) | R6 | — | — | Fishball's copy only, with the user's labels or custom text. | both | browser |
| I7-EP-04 | EP (plan review) | R1, R2 | S raises a plan review; Fishball approves with feedback | — | The plan-review wording on both sides. | both | browser |
| I7-EP-05 | EP (own question, `ask_user`) | R6 | Fishball's `ask_user` card; the user answers it | — | A row in Fishball's chat only, with the "Fishball asked you" words; no main session gets one. | both | browser |
| I7-EP-06 | EP (closure) | R1, R2 | S's card closed by stopping S | — | A closure row with the closure reason on both sides. | both | browser |
| I7-EP-07 | EP (skipped) | R1 | A question card skipped | — | A skipped row with its wording. | both | browser |
| I7-EP-08 | EP (optional fields absent) | R1 | A permission answer with no note; a question with no custom text; a record without arguments | Expand the rows. | No "undefined", "null", empty label or empty heading; the missing parts are not shown. | both | browser |
| I7-EP-09 | EP (optional fields present) | R1 | Note, custom text and arguments present | Expand. | Each shown under its heading. | both | browser |
| I7-EP-10 | EP (asking session not loaded at closure) | R6 | S not loaded; its card closed at a main restart | — | Fishball's copy only, with its closure reason. | both | browser |
| I7-EP-11 | EP (inbox notice kept) | R8 | An inbox notice (`plugin:fishball/inbox-notice`, e.g. a refused inbox item) next to a record | Open the chat. | The notice keeps its own row, unchanged; the record has its row. | both | browser |
| I7-BVA-01 | BVA (reason/note: min − 1) | R7 | — | n/a (length < 0). | — | — | — |
| I7-BVA-02 | BVA (reason/note: min = 0, absent) | R7 | — | Same run as I7-EP-08. | — | both | browser |
| I7-BVA-03 | BVA (reason: 499 characters) | R7 | Cap 500 (inst-OQ-18) | Fishball answers with a 499-character reason. | *Rewritten (inst-OQ-18: marker `…`).* Shown in full (expanded), no `…` at the end. | both | browser |
| I7-BVA-04 | BVA (reason: max = 500) | R7 | — | 500 characters. | *Rewritten (inst-OQ-18).* Shown in full, no added `…`. | both | browser |
| I7-BVA-05 | BVA (reason: max + 1 = 501) | R7 | The bridge refuses a 501-character `reason` (contract §8), so use a record text the writer cuts: a 2,001-character `arguments` (cap 2,000, inst-OQ-18) | — | *Rewritten (inst-OQ-18).* The row shows 2,000 characters ending in `…`. | both | browser |
| I7-BVA-06 | BVA (session title 199 / 200 / 201 characters) | R7 | S's title of each length | — | *Rewritten (inst-OQ-18).* 199 and 200 shown in full; 201 is cut by the writer to 200 ending in `…` (inst-OQ-18). | both | browser |
| I7-ST-01 | ST written → shown → child restart → shown | R4 | After I7-P-02 | Restart the child; reopen. | The same three rows, once each, in the same places. | both | browser |
| I7-ST-02 | ST shown → page reload | R4 | — | Reload the main page and the iframe. | Same rows, once each, on both sides. | both | browser |
| I7-ST-03 | ST written while the child is off the wire | R4 | Instance disabled (or restarting) | S's card ends; then enable the instance. | After attach, Fishball's chat shows the row exactly once. | both | browser |
| I7-ST-04 | ST two reconnects | R4, AC | After I7-ST-03 | Restart twice. | The row count is unchanged (§18.2 I7 AC: "no duplicate after two restarts"). | both | browser |
| I7-ST-05 | ST re-delivered record after a restart | R4 | Record R (id X) shown between messages M1 and M2; restart the child so the connector re-delivers R (same id X) | Read the timeline through the chat's API (`api/chat` entries) and in the DOM. | One row for X (R4: no duplicate after a reconnect), still between M1 and M2: its place in the timeline (R1) is taken as its first place, not moved to the end (OQ-35). Whether the connector can re-deliver an acked record at all: OQ-35. | both | node |
| I7-ST-X1 | ST (invalid: a record before the card ends) | R1 | S's permission request still pending | Look at both chats. | No record row yet. | both | browser |

---

## 10. I8 — restyle the custom chat to DSH's look (rewritten for D29)

The first version's I8 deleted the custom chat. D29 keeps it (§18.7); its deletion cases are
withdrawn, its static-scan idea moves to I10 (§10a), and I8 is now the restyle (§18.2 I8, §0.5
"Chat page").

**R:**
- I8-R1: ~~removed: `src/slim/ui/**`, `child/{server,auth}.js`, … `packages/messenger/`~~
  **Withdrawn (D29, §18.7).**
- I8-R2: ~~the old routes answer 404~~ **Withdrawn (D29: the custom chat's routes and the admin
  routes stay, §18.5 note).**
- I8-R3: every behaviour of the chat, the approvals rows, the reminders list, the pickers and the
  uploads is unchanged; the existing chat suite passes unchanged (§18.2 I8 R5, AC). *Rewritten.*
- I8-R4: the page loads `dsh-tokens.css` and draws every colour, radius, font and shadow from
  `--dsw-*` / `--dsh-*` tokens; no colour literal in `shell.css` except the Fishball accent ring
  (D12) (R1).
- I8-R5: light on `body`, dark on `body[data-ds-dark-theme]` (R2; I9 sets the attribute, U3).
- I8-R6: the header, conversation, user bubble, composer and buttons use DSH's measures (R3): the
  header row 52 px, padding 10 px 28 px, title 14/20 (`DSH_SESSION_HEADER`); the user bubble
  `--dsw-specific-bubble`; the composer `--dsw-specific-input-major`, `--dsw-radius-*`; the font
  `--dsh-font-family-text-default` (§0.5).
- I8-R7: no permanent "Fishball" title and no connection status tag; a lost connection shows only
  the "Reconnecting…" banner while it lasts (R4, D27). The page has no unread count, no connector
  link and posts no `parent.postMessage` (§18.7 moves this from I4).
- I8-R8: the page loads no remote and no DSH-served file; the CSP is unchanged (R6).
- I8-R9: the copied token names are checked against the installed `dsh-client-ui-theme`: every
  name in 0.2.2-rc.1, and any missing in rc.5 is listed (AC, §0.8 R1).
- I8-R10: the composer's model and effort pickers work (D20; moved from I4).

**T:** P (screenshot comparison, light and dark), EP (scheme; connection up / lost / back), ST
(SSE lost → banner → reconnected → no banner), static scans.

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I8-P-01 | P | ~~R1~~ | — | ~~static scan for removed paths~~ | **Withdrawn (D29, §18.7). Moved → I10-P-01 for `native-control` and `messenger` only.** | — | — |
| I8-P-02 | P | ~~R1~~ | — | ~~`npm pack` without removed paths~~ | **Withdrawn (D29). Moved → I10-P-02.** | — | — |
| I8-P-03 | P | ~~R1~~ | — | ~~`packages/messenger` not in workspaces~~ | **Withdrawn (D29). Moved → I10-P-03.** | — | — |
| I8-P-04 | P | R3 | — | Run the full suite, the existing chat suite included. | Green, with the chat suite unchanged (§18.2 I8 AC). | both | node |
| I8-P-05 | P | R3 | — | Run E1-B1, E1-B2 and E1-B6 as a smoke run. | Green. | both | browser |
| I8-P-06 | P (token names) | R9 | Installed 0.2.2-rc.1 and 0.2.1-rc.5 (read-only) | Collect every `--dsw-*` / `--dsh-font-*` custom property defined in `src/slim/ui/dsh-tokens.css`; collect those the installed `dsh-client-ui-theme` (`lib/client.js`) defines, per version. | Every copied name exists in 0.2.2-rc.1. For rc.5 the case lists the missing names (a report, not a failure, §18.2 I8 AC). The copy names its source version (§0.5). | both | static |
| I8-P-07 | P (no colour literal) | R4 | — | Scan `shell.css` (and every other `src/slim/ui/*.css` except `dsh-tokens.css`) for colour literals: `#rgb`, `#rrggbb(aa)`, `rgb(`, `rgba(`, `hsl(`, `hsla(`, named colours other than `transparent`, `currentColor`, `inherit`. | The only hits are the Fishball accent ring's declarations (D12). | both | static |
| I8-P-08 | P (no title or status tag) | R7 | Attached; F2 | Read the iframe DOM: the header, every element's text, and roles `status` / `banner`. | No element whose text is "Fishball" as a title, and no connection status tag (D27). The header holds the model and effort pickers and one actions area with Settings. | both | browser |
| I8-P-09 | P (no frame chrome) | R7 | Attached; F2 | Search the iframe DOM for an unread count, a connector link (any `a` or button opening a connector page) and a state tag. | None (D27, §18.6 item 14). | both | browser |
| I8-P-10 | P (no `postMessage`) | R7 | F2; before the page loads, wrap the main window's `postMessage` and add a `message` listener on the main window | Use the chat, open settings, Restart, a theme switch. | No message reached the main window from the iframe (D27). | both | browser |
| I8-P-11 | P (tokens loaded) | R4, R8 | Attached; F2 | Read the HAR for the iframe's requests and its stylesheets. | `ui/dsh-tokens.css` is loaded from `/fishball/embed/`; every request of the page is under `/fishball/embed/`; none is remote or a DSH-served path (§0.5). | both | browser |
| I8-P-12 | P (measures) | R6 | Attached; viewport 1280 × 800 | Measure the header row's height, its padding, the title's font size and line height; read the computed font family of the body. | 52 px; 10 px 28 px; 14 px / 20 px; the font family equals the value of `--dsh-font-family-text-default` (§0.5). | both | browser |
| I8-P-13 | P (screenshot, light) | R5, R6 | A main DSH session and Fishball's chat with comparable content, same size, light | Screenshot both; compare the header, user bubble, composer and buttons. | The same colours (token values) and measures; differences are listed for review. Pass threshold: OQ-36. | both | browser |
| I8-P-14 | P (screenshot, dark) | R5, R6 | As I8-P-13, dark | As I8-P-13. | As I8-P-13, in dark; the page's `body` has `data-ds-dark-theme`. | both | browser |
| I8-P-15 | P (CSP unchanged) | R8 | Attached | Read the document response's CSP; load the page and watch the console for CSP reports. | CSP has `default-src 'self'` (§0.5 "the CSP stays `default-src 'self'`"); no violation in the console. (See OQ-27 for inst-OQ-12's text.) | both | node |
| I8-P-16 | P (model picker) | R10 | Moved from I4-P-04. Child has `fake-effort` and `fake-plain` via Check for new models and Add selected on the instance's card (§18.7) | Open the composer's model picker. | It lists both models. | both | browser |
| I8-P-17 | P (effort pane) | R10 | Moved from I4-P-05 | Select `fake-effort`; open the effort picker. | It offers exactly `low`, `medium` and `high`. | both | browser |
| I8-P-18 | P (chosen effort used) | R10 | Moved from I4-P-06 | Choose `high`; send. | The next request in the session log (O4) and the fake model's journal both carry effort `high`. | both | browser |
| I8-EP-01 | EP | ~~R2~~ | — | ~~old admin relay 404~~ | **Withdrawn (D29: the admin routes stay, §0.7).** | — | — |
| I8-EP-02 | EP | ~~R2~~ | — | ~~old open route 404~~ | **Withdrawn (§18.7).** | — | — |
| I8-EP-03 | EP | ~~R2~~ | — | ~~custom child endpoints 404~~ | **Withdrawn (D29: the custom chat's routes stay).** | — | — |
| I8-EP-04 | EP | ~~R2~~ | — | ~~old main settings routes 404~~ | **Withdrawn (D29).** | — | — |
| I8-EP-05 | EP (live paths still live) | R3 | Valid main cookie, same-origin | `GET /fishball/embed/`, the SSE `api/events`, one `api/*` POST, one `POST /api/fishball/native/admin/status`. | *Rewritten (D28: no mux).* 200, an open stream, 2xx, `{ok:true}`. | both | node |
| I8-EP-06 | EP (scheme) | R5 | Standalone tab (no parent) with the OS scheme emulated light, then dark | Load; read `body[data-ds-dark-theme]` and a token's computed value. | Light: no attribute, light values; dark: attribute set, dark values (U3 fallback, U3-P-05). | both | browser |
| I8-EP-07 | EP (model without efforts) | R10 | Moved from I4-EP-01 | Select `fake-plain`; send. | No effort picker is offered; the request carries no reasoning effort. | both | browser |
| I8-ST-01 | ST SSE up → lost → banner → back → no banner | R7 | Attached; F2 can block and unblock `api/events` | Block the stream; wait; unblock. | While up: no banner and no status tag. While lost: the "Reconnecting…" banner. After it reconnects: the banner is gone. Nothing else changes in the header. | both | browser |
| I8-ST-02 | ST banner across a child restart | R7 | Attached | Restart the child. | The banner shows while the stream is lost and goes when it is back; the session reappears with its history. | both | browser |

**Decision table** (model has efforts × effort chosen → the request's effort), moved from I4:

| Rule | Model declares efforts | Effort chosen | Effort in the next request | Case |
| --- | --- | --- | --- | --- |
| 1 | yes | yes (`high`) | `high` | I8-DT-01 |
| 2 | yes | no | the catalog entry's default effort, or none sent without one (inst-OQ-14) | I8-DT-02 |
| 3 | no | — (no picker) | none | I8-DT-03 |
| 4 | no, after `high` was chosen on an effort model | — | none | I8-DT-04 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I8-DT-01 | DT r1 | R10 | Moved from I4-DT-01. `fake-effort` | Choose `high`; send. | Rule 1 (with I8-P-18). | both | browser |
| I8-DT-02 | DT r2 | R10 | Moved from I4-DT-02. `fake-effort` declares a default `medium`; no effort chosen | Send. | Rule 2: `medium`. (inst-OQ-14 was written for DSH's picker and §18.5 calls it moot; whether it binds the custom picker: OQ-37.) | both | browser |
| I8-DT-03 | DT r3 | R10 | Moved from I4-DT-03. `fake-plain` | Send. | Rule 3. | both | browser |
| I8-DT-04 | DT r4 | R10 | Moved from I4-DT-04. `fake-effort` with `high`, then `fake-plain` | Send. | Rule 4. | both | browser |

---

## 10a. I10 — remove the truly dead code

**R** (§18.2 I10): `inst/src/native-control/**` and its `./native-control` export, its snapshot
copy in `installation.js` `copyChildCode` and its `host.js` import, and `packages/messenger/` are
gone with their tests; nothing else is deleted. Moved here from old I8-P-01..03 (§18.7).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I10-P-01 | P | R | The I10 branch | Static scan: the paths `packages/instance/src/native-control/` and `packages/messenger/` exist? Search every remaining file of both packages for an import, require or export of `native-control` or `messenger`. | Neither path exists; no reference (§18.2 I10 AC). | n/a | static |
| I10-P-02 | P | R | — | `npm pack --dry-run` for both packages; read `packages/instance/package.json` `exports`. | No `native-control` or `messenger` file in either listing; no `./native-control` export; both pack. | n/a | static |
| I10-P-03 | P | R | — | Read the root `package.json` workspaces. | `packages/messenger` is not listed and does not exist. | n/a | static |
| I10-P-04 | P (nothing else deleted) | R | The I10 diff against its base | List the deleted files. | Only files under the two paths and their tests, plus the stated lines in `installation.js` and `host.js`. The custom chat (`src/slim/ui/**`, `src/slim/child/server.js`, `auth.js`, `decisions.js`) and the admin relay (`src/slim/host/admin.js`, `settings-routes.js`) remain (D29). | n/a | static |
| I10-P-05 | P | R | — | Run the full suite. | Green on both versions (AC). | both | node |
| I10-EP-01 | EP (child snapshot) | R | Ready | List the child's copied code folder (the snapshot under the child home). | No `native-control` folder. | both | node |

---

## 11. I9 — two language variants (rewritten for D30, U4, U7)

The first version's I9 (the iframe follows DSH's theme and language live) is withdrawn (§18.7):
the language comes from the framed URL (K2) and the theme from U3 (§11a).

**R** (§18.2 I9, §0.5 "Languages"):
- I9-R1: ~~the iframe uses the main page's theme and language when it opens~~ **Withdrawn (D30,
  U3, §18.7).** Replaced by I9-R3 and U3-R1.
- I9-R2: ~~it follows a change in the main page~~ **Withdrawn (§18.7: the language follow is K2's
  reload, K2-ST-01; the theme follow is U3).**
- I9-R3: the first `lang` parameter of the page URL, exact value `zh`, shows every string of the
  chat, the settings view, the approvals and reminders rows, the record rows and the main proxy's
  503 page in Chinese; anything else, or no `lang`, English (R1, §0.5).
- I9-R4: `<html lang>` is `zh-CN` or `en` (R2).
- I9-R5: the two dictionaries have the same keys; no user-visible string is outside them (R3, AC).
- I9-R6: dates and numbers use the page's language (R4).
- I9-R7: switching the view (chat ⇄ settings) keeps `lang`; reload keeps it (R5, ST).
- I9-R8: a failure the child refuses shows the page's own words with the refusal code, never the
  child's English message (R7).
- I9-R9: a user row's author is the child's `authorKind` (`user`, `schedule` or `other`), worded
  by the page; the child sends no English author text (R7, §18.1 I9).
- I9-R10: the record rows' words equal the connector's `record.*` words in both languages (U6;
  checked by I7-P-06).
- Theme (R6): §11a.

**T:** P, EP (`lang`), ST, DT (lang × view).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I9-P-01 | P | ~~R1~~ | — | ~~iframe theme and language equal the main page's~~ | **Withdrawn (D30, U3, §18.7).** | — | — |
| I9-DT-01 | DT / EP | ~~R1~~ | — | ~~light + en~~ | **Withdrawn (§18.7).** Replaced by I9-DT-07..10 and U3. | — | — |
| I9-DT-02 | DT / EP | ~~R1~~ | — | ~~light + zh~~ | **Withdrawn (§18.7).** | — | — |
| I9-DT-03 | DT / EP | ~~R1~~ | — | ~~dark + en~~ | **Withdrawn (§18.7).** | — | — |
| I9-DT-04 | DT / EP | ~~R1~~ | — | ~~dark + zh~~ | **Withdrawn (§18.7).** | — | — |
| I9-DT-05 | DT / EP | ~~R1~~ | — | ~~system dark + en~~ | **Withdrawn (§18.7).** | — | — |
| I9-DT-06 | DT / EP | ~~R1~~ | — | ~~system light + zh~~ | **Withdrawn (§18.7).** | — | — |
| I9-ST-01 | ST | ~~R2~~ | — | ~~light → dark follows~~ | **Withdrawn (§18.7). Moved → U3-ST-01.** | — | — |
| I9-ST-02 | ST | ~~R2~~ | — | ~~en → zh follows~~ | **Withdrawn (§18.7). Moved → K2-ST-01 (reload).** | — | — |
| I9-ST-03 | ST | ~~R2~~ | — | ~~system + OS flip~~ | **Withdrawn (§18.7). Moved → U3-P-04.** | — | — |
| I9-P-02 | P (`lang=zh`) | R3, R4 | Attached; F2 | Load `/fishball/embed/?lang=zh`; open the settings view; show an approval row, a reminder row and a record row. | Every visible string equals the `zh` dictionary's value for its key; no `en` value is shown (strings equal in both, such as model ids and codes, aside). `<html lang="zh-CN">`. | both | browser |
| I9-P-03 | P (`lang=en`) | R3, R4 | As I9-P-02 | Load `?lang=en`; the same views. | Every string from the `en` dictionary. `<html lang="en">`. | both | browser |
| I9-P-04 | P (key sets) | R5 | — | Import `DICTIONARIES` from `src/slim/ui/i18n.js`; compare the key sets of `en` and `zh`. | Equal: no key in one and not the other (AC). Every value is a non-empty string; every `{name}` placeholder in one is also in the other (OQ-41). | n/a | static |
| I9-P-05 | P (503 page, both languages) | R3 | F4 holds readiness 20 s | During starting, `GET /fishball/embed/?lang=zh`, then `?lang=en`, then no `lang`. | 503 each time (inst-OQ-13). The page's words are the `zh` dictionary's 503 strings, then `en`, then `en` (§0.5: the 503 page follows the same parameter). Each shows the state, the safe code and Retry; no bearer, port or path (I3-SEC-09). | both | node |
| I9-P-06 | P (503 Retry keeps `lang` and `view`) | R3, R7 | As I9-P-05, in F2, at `/fishball/embed/?view=settings&lang=zh` | Press the 503 page's Retry; let the child become ready. | From the test brief, not stated by the design (OQ-38): the page then shown is the settings view in Chinese, and the address still has `view=settings` and `lang=zh`. | both | browser |
| I9-P-07 | P (dates and numbers) | R6 | A reminder at a known instant; a record with a known time; a result line with a count ≥ 1000 if one exists (else the count shown) | Load `?lang=zh` and `?lang=en`; read the shown date, time and number. | Each equals what the browser's `Intl` formats for that instant or number with locale `zh-CN` or `en` respectively (§0.5: DSH's mapping). The exact format options: OQ-41. | both | browser |
| I9-P-08 | P (refusal in the page's words) | R8 | `?lang=zh`; F2 rewrites the next admin refusal to add `"message": "FBTEST English message"` | In the settings view, set the model to an id the child does not have (a refusal `unknown-model`, O7). | The block shows the `zh` words for the refusal and the code `unknown-model`. The text `FBTEST English message` is nowhere in the DOM. Same in `?lang=en` (the page's own English words, not the child's message). | both | browser |
| I9-P-09 | P (`authorKind` in the child's answer) | R9 | Fishball's session with a typed user message, a delivered reminder (§15 T10), and a user row from another source (OQ-39) | Read the chat entries the child serves (`api/chat`, through the proxy). | Each user row carries `authorKind` `user`, `schedule` or `other` respectively, and no English author text. | both | node |
| I9-P-10 | P (`authorKind` worded) | R9 | As I9-P-09, in F2 | Load `?lang=zh` and `?lang=en`; read each user row's author. | Each author is the dictionary's word for its `authorKind` in that language. | both | browser |
| I9-P-11 | P (no string outside the dictionaries) | R5 | — | Scan `src/slim/ui/*.js` and `shell.html` for user-visible text literals (text nodes, `textContent`, `title`, `aria-label`, `placeholder` values) that do not come from the dictionaries. | None (AC). Allowed: codes, ids, class names, parameter names. | n/a | static |
| I9-P-12 | P (both variants, both versions) | R3 | — | Run I9-P-02 and I9-P-03 on rc.5 and 0.2.2-rc.1. | Both render on both versions (AC). | both | browser |
| I9-EP-01 | EP (`lang` absent) | R3, R4 | — | Load `/fishball/embed/`. | English; `<html lang="en">`. | both | browser |
| I9-EP-02 | EP (`lang=` empty) | R3 | — | Load `?lang=`. | English. | both | browser |
| I9-EP-03 | EP (`lang=ZH`) | R3 | — | Load `?lang=ZH`. | English (exact `zh` only). | both | browser |
| I9-EP-04 | EP (`lang=zh-CN`) | R3 | — | Load `?lang=zh-CN`. | English (exact `zh` only). | both | browser |
| I9-EP-05 | EP (two values, `zh` first) | R3 | — | Load `?lang=zh&lang=en`. | Chinese (the first `lang` counts). | both | browser |
| I9-EP-06 | EP (two values, `en` first) | R3 | — | Load `?lang=en&lang=zh`. | English. | both | browser |
| I9-EP-07 | EP (unknown value) | R3 | — | Load `?lang=fr`. | English. | both | browser |
| I9-EP-08 | EP (`lang` rule, in-process) | R3 | — | Call `languageOf(search)` from `i18n.js` with each search string of I9-EP-01..07 and `?lang=zh`. | `zh` only for `?lang=zh` and `?lang=zh&lang=en`; `en` for every other. | n/a | node |
| I9-ST-04 | ST chat → settings → chat keeps `lang` | R7 | `?lang=zh` chat | Header Settings; Back. | `lang=zh` stays in the URL at each step; every view is Chinese. | both | browser |
| I9-ST-05 | ST reload keeps `lang` | R7 | `?view=settings&lang=zh` | Reload. | Settings, Chinese. | both | browser |

**Decision table** (lang × view → language and view shown):

| Rule | `lang` (first) | `view` (first) | Shown | Case |
| --- | --- | --- | --- | --- |
| 7 | `zh` | `settings` | settings, Chinese | I9-DT-07 |
| 8 | `zh` | none / other | chat, Chinese | I9-DT-08 |
| 9 | not `zh` (none, `en`, other) | `settings` | settings, English | I9-DT-09 |
| 10 | not `zh` | none / other | chat, English | I9-DT-10 |

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I9-DT-07 | DT r7 | R3, I6-R9 | — | Load `?view=settings&lang=zh` and `?lang=zh&view=settings`. | Rule 7 both times (parameter order does not matter between names). | both | browser |
| I9-DT-08 | DT r8 | R3 | — | Load `?lang=zh` and `?lang=zh&view=x`. | Rule 8. | both | browser |
| I9-DT-09 | DT r9 | R3 | — | Load `?view=settings` and `?view=settings&lang=ZH`. | Rule 9. | both | browser |
| I9-DT-10 | DT r10 | R3 | — | Load `?lang=en&view=Settings`. | Rule 10. | both | browser |

---

## 11a. U3 — the theme follows the parent (I9 R6)

**R** (§0.5 "Theme", §0.9 U3, §18.2 I9 R6, §0.8 R1, R7):
- U3-R1: framed, the page's `body` carries `data-ds-dark-theme` exactly while the parent page's
  `body` does, and follows every change live with no reload; an unsent draft stays.
- U3-R2: with no reachable parent (own tab, cross-origin), it follows `prefers-color-scheme`, live.
- U3-R3: no access to the parent throws; nothing is posted to the parent (D27).
- U3-R4: there is no `theme` URL parameter and no contract change.
- U3-R5: a test watches the attribute name in the installed DSH (§0.8 R1, R7).

**T:** P, EP (parent: same-origin / none / cross-origin), ST (parent light → dark → light).

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| U3-P-01 | P (framed mirror) | R1 | Attached; F2; DSH set to dark before the view opens | Open the Fishball view; read both `body` attributes. | The iframe's `body` has `data-ds-dark-theme` (same value as the parent's). With DSH light: neither has it. | both | browser |
| U3-P-02 | P (live, no reload) | R1 | Framed, light; set a marker `window.__fbtest = 1` in the iframe | Switch DSH to dark in its own settings; wait up to 2 s (bound: OQ-43). | The iframe's `body` gains the attribute; `window.__fbtest` is still 1 and no new document request appears in the HAR (no reload). | both | browser |
| U3-P-03 | P (draft kept) | R1 | Framed; type "fbtest draft ü 中" into the composer, do not send | Switch DSH dark, then light. | The composer still holds the exact text; the caret's input still has focus if it had it; nothing was sent (fake model journal empty). | both | browser |
| U3-P-04 | P (standalone tab, OS live) | R2 | Open `/fishball/embed/` alone ("Open in a tab" or a typed URL); emulate `prefers-color-scheme: light` | Read the attribute; flip the emulation to dark, then light, without reload. | Light: no attribute; dark: attribute set; back to light: gone. Each within 2 s (OQ-43), no reload (marker kept). | both | browser |
| U3-P-05 | P (attribute name watch) | R5 | Installed 0.2.1-rc.5 and 0.2.2-rc.1 (read-only) | Search each version's `dsh-client-ui-layout` `lib/client.js` for `data-ds-dark-theme`; and in F2, read the main page's `body` attribute in DSH dark. | The name is present in both versions, and the live main page sets it in dark (§0.5 cites `:505,553` / `:571,619`). | both | static |
| U3-P-06 | P (no `theme` parameter) | R4 | Framed; F2 | Read the iframe's `src` in light and dark. | No `theme` parameter either time; the `src` is the same in both. | both | browser |
| U3-EP-01 | EP (parent same-origin, no attribute, then attribute added by a script) | R1 | Framed; DSH light | Set `data-ds-dark-theme` on the parent's `body` from the test (not through DSH), then remove it. | The iframe mirrors each change (the rule is the attribute, not DSH's setting). | both | browser |
| U3-EP-02 | EP (cross-origin parent) | R2, R3 | `followTheme(view)` from `src/slim/ui/theme.js` with a stub view whose `parent.document` getter throws a `SecurityError`, and a stub `matchMedia` | Call it; flip the stub media query. | No exception. The stub `body`'s attribute follows the media query. (A real cross-origin frame is refused by `frame-ancestors 'self'` / `X-Frame-Options`, so only the stub reaches this branch.) | n/a | node |
| U3-EP-03 | EP (no parent: `parent === window`, `parent` null, parent `body` null) | R2, R3 | As U3-EP-02, three stubs | Call `followTheme(view)` for each. | No exception; each follows the stub media query. | n/a | node |
| U3-EP-04 | EP (parent access throws later) | R3 | Stub whose parent is readable at first, then its `document` getter throws | Call; change the stub's state. | No exception escapes (also none in the browser console in U3-P-02). The state after the throw: OQ-40. | n/a | node |
| U3-EP-05 | EP (nothing posted) | R3 | As I8-P-10 | Switch the theme twice. | No `message` reaches the main window. | both | browser |
| U3-ST-01 | ST parent light → dark → light | R1 | Moved from I9-ST-01. Framed, light | Switch DSH dark, then light. | The iframe's attribute: absent → present → absent, each within 2 s (OQ-43), no reload. | both | browser |

---

## 11b. K2 — contract 1.1: `lang` on the framed path

**R** (§18.2 K2, U4, `docs/connector-contract.md` §1.2 and §2):
- K2-R1: the connector frames `ui.chat` or `ui.settings` with one `lang` search parameter equal to
  DSH's active locale id (`zh` or `en`): every `lang` already in the path is removed and the new
  one is appended last in the query; the other parameters keep their order and spelling; the
  fragment is kept after the query; no `theme` parameter.
- K2-R2: a locale change in the main DSH reloads the framed page with the new value.
- K2-R3: "Open in a tab" opens the same URL.
- K2-R4: the descriptor and its validation are unchanged; `CONNECTOR_CONTRACT.minor` is 1; a 1.0
  instance still attaches (and is framed with `lang` added, contract §2).
- K2-AC: the iframe `src` equals the registered path with exactly the stated parameter; no other
  change to C3's behaviour.

**T:** P, EP (path: no query / a query / `lang` already / a fragment; locale `zh` / `en`), ST
(locale change while framed → reload). F7 gains a `ui` option for these cases.

| ID | T | R | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| K2-P-01 | P (built-in chat, `zh`) | R1 | Both plugins; DSH locale `zh` | Open the Fishball view; read the iframe `src`. | `/fishball/embed/?lang=zh` exactly. | both | browser |
| K2-P-02 | P (built-in settings, `en`) | R1 | DSH locale `en` | "Open instance settings"; read the `src`. | `/fishball/embed/?view=settings&lang=en` exactly (contract §1.2 example). The page shows the settings view in English. | both | browser |
| K2-P-03 | P (Open in a tab) | R3 | As K2-P-01, then K2-P-02 | Press "Open in a tab" in each. | The new tab's address equals the iframe `src` (path and query; same origin). | both | browser |
| K2-P-04 | P (contract minor) | R4 | — | Import `CONNECTOR_CONTRACT` and `UI_LANG` from `fishball-connector/contract`. | `CONNECTOR_CONTRACT` is `{id: 'fishball-connector', major: 1, minor: 1}`; `UI_LANG.parameter` is `lang`, values `zh` and `en`. | n/a | node |
| K2-P-05 | P (1.0 instance attaches) | R4 | F7 with `contract: {id:'fishball-connector', major:1, minor:0}` and `ui: {chat: '/fbtest/stub/'}` (served by the stub) | Attach; open the view (locale `zh`). | Accepted (O2 names the stub). The iframe `src` is `/fbtest/stub/?lang=zh` (contract §2: "its page is framed with `lang` added"). | both | browser |
| K2-P-06 | P (descriptor validation unchanged) | R4 | F7 registering `ui: {chat: '/fbtest/stub/?lang=en'}` | Attach. | Accepted (a path may carry `lang`); framed with `lang` replaced (K2-EP-03). The K1/K1b `ui-invalid` cases still pass (connector.md). | both | node |
| K2-EP-01 | EP (no query) | R1 | F7 `ui.chat = '/fbtest/stub/'`, locale `en` | Read the `src`. | `/fbtest/stub/?lang=en`. | both | browser |
| K2-EP-02 | EP (a query) | R1 | `ui.chat = '/fbtest/stub/?a=1&b=%20x'` | Read the `src`. | `/fbtest/stub/?a=1&b=%20x&lang=en` (order and spelling kept). | both | browser |
| K2-EP-03 | EP (`lang` already, once and twice) | R1 | `ui.chat = '/fbtest/stub/?lang=zh&a=1'`, then `'/fbtest/stub/?lang=zh&a=1&lang=fr'`, then `'/fbtest/stub/?%6Cang=zh&a=1'` | Read the `src` (locale `en`). | `/fbtest/stub/?a=1&lang=en` each time: every old `lang` removed (names compared URL-decoded), one new `lang` last. | both | browser |
| K2-EP-04 | EP (a fragment) | R1 | `ui.chat = '/fbtest/stub/#x'`, then `'/fbtest/stub/?view=settings#x'` | Read the `src` (locale `zh`). | `/fbtest/stub/?lang=zh#x` and `/fbtest/stub/?view=settings&lang=zh#x` (the parameter before the fragment). | both | browser |
| K2-EP-05 | EP (empty `&` segments) | R1 | `ui.chat = '/fbtest/stub/?a=1&&b=2&'` | Read the `src`. | `/fbtest/stub/?a=1&b=2&lang=en` (contract §1.2: only empty segments are dropped). | both | browser |
| K2-EP-06 | EP (locale `zh` / `en`) | R1 | Built-in instance | Set DSH to `zh`, open; set to `en`, open. | `lang=zh` then `lang=en`; never a value other than `zh` or `en`. | both | browser |
| K2-EP-07 | EP (no `theme`) | R1 | Built-in, DSH dark | Read the `src`. | No `theme` parameter (U3). | both | browser |
| K2-ST-01 | ST locale change while framed → reload | R2 | Moved from I9-ST-02. Framed chat at `lang=en`; marker `window.__fbtest = 1` in the iframe | Switch DSH's language to `zh`. | The framed page reloads (a new document request; the marker is gone) at `/fishball/embed/?lang=zh`, and it is Chinese. Switching back reloads with `lang=en`. | both | browser |
| K2-ST-02 | ST theme change while framed → no reload | R1, U3 | Framed; marker set | Switch DSH dark. | No reload (marker kept, `src` unchanged); U3 mirrors the theme. (§18.1's K2 row says "reload on a locale or theme change": OQ-42.) | both | browser |
| K2-ST-03 | ST locale change with settings framed | R2 | Settings framed at `?view=settings&lang=en` | Switch DSH to `zh`. | Reloads at `/fishball/embed/?view=settings&lang=zh`; the settings view stays. | both | browser |

---

## 12. E1 — end to end (E2E-B1..B9)

Every case runs in a fresh disposable main home (F1), once on each version, and under plain Node
and under the DSH-X wrapper (F8a, F8b; §18.2 E1), with the fake models (F3) and no real key.
Rewritten for §18.7: B1, B2, B5, B6, B8b, B8c, SEC; new: B9.

| ID | T | Scenario | Preconditions | Steps | Expected | V | Runs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| E1-B1 | P | B1 | Clean profile; local packs | `dsh plugin add fishball-connector fishball-instance`; restart the main DSH; open the Fishball view. | *Rewritten (§18.7, §18.4).* Fishball's own chat page in DSH's look (D29) in the iframe, inside the connector's frame whose tag reads `running`, with the Connector settings button. The profile manifest has no hand edit. The child runs on the main process's executable (D28; F4b). The Plugins page lists "Fishball connector" and "Fishball instance" and no "Fishball" plugin (D22). | both | browser |
| E1-B1b | EP | B1 variant (D25) | Clean profile | `dsh plugin add fishball-instance` only; restart; open the Plugins page. | Main boots; the instance's card shows `connector-missing` with its reason; no child process; `fishball-connector` is not installed. | both | browser |
| E1-B2 | P | B2 | After B1; `fake-a` and `fake-env` in the main home | On the `fishball-instance` card: Check for new models; untick `fake-env`; Add selected; Check again. Then in the iframe choose `fake-effort` and `high` in the custom pickers and send. | *Rewritten (§18.7, §18.4).* Both are listed; only `fake-a` is in the child after Add; the second check lists only `fake-env`. The reply streams into the iframe; the request carries `fake-effort` and `high`. | both | browser |
| E1-B3 | P | B3 | After B2; a main session M | Hand over M with the note "tell me when the build passes"; script Fishball to call `message_session` to M. | The note reaches Fishball's chat as the user's words. M receives Fishball's message once. M shows the managed mark. | both | browser |
| E1-B4 | P | B4 | After B3 | Script M to ask a permission; script Fishball to allow it once (low risk, reason). | M's tool runs. A card record row appears in M and in Fishball's chat, with the same words (I7). | both | browser |
| E1-B5 | P | B5 | After B1 | Press the frame's **Connector settings**; in DSH's form for `fishball-connector`, change `maxQueuedInputs` from its default to 3. Open the instance settings view. Disable the instance; have M call `message_fishball` four times. | *Rewritten (§18.7).* The button opens DSH's form; the form keeps the new value (O3). The settings view shows no connector value and no link of its own. The 4th queued input is refused `queue-full` (§0.4). | both | browser |
| E1-B6 | P/ST | B6 | After B2 | SIGKILL the child. Look at the frame and at the instance's card. Press Retry (in the frame). | *Rewritten (§18.7, §18.4).* The frame shows `failed` with `NATIVE_CHILD_EXITED` and Retry; the card shows the same state and its own Retry (I1c). After Retry the frame reads `running`, and the same Fishball session id comes back with its history. | both | browser |
| E1-B7 | ST | B7 | After B3 | Disable `fishball-instance`. Script M to call `message_fishball` once. Re-enable the instance. | While disabled: the view shows "No Fishball instance is attached" with the Plugins link, and the call is accepted as queued. After re-enabling: Fishball's chat shows the message exactly once, and the fake model journal has exactly one request carrying it. | both | browser |
| E1-B8 | P | B8 | Clean profile with `fishball-connector` and the stub instance F7 (§12.1) only | Boot. The stub attaches. Hand over M. Through the stub: `session.list`, `session.read` on M, `session.message` to M. M calls `message_fishball`. | The stub's journal shows: attach accepted; M listed; M's messages read; the message delivered to M once; one `inbox.push` with M's text, acked by the stub and not pushed again after a stub reconnect. The view shows conn-OQ-23's outcome for an instance without `ui`. | both | node |
| E1-B8b | EP | B8 variant | After B8 (stub attached) | Install and enable `fishball-instance`. | *Rewritten (inst-OQ-03).* The built-in instance's attach is refused `instance-busy`; the stub stays attached and working. The instance's card shows `failed` / `NATIVE_INSTANCE_BUSY`, and no child process runs (I1c AC). | both | node |
| E1-B8c | ST | B8 variant | Stub not attached (stub disabled) | M calls `message_fishball` twice; enable the stub. | *Rewritten (§18.7, conn-OQ-01: `ask_fishball` is never queued).* On attach, the stub receives the two items once each, in arrival order. (An `ask_fishball` while detached answers `unavailable` at once: connector.md C1.) | both | node |
| E1-B9 | P | B9 (D30) | After B1 | Set DSH's language to `zh`; open the Fishball view and the instance settings view. Then set `en`. | The framed chat and settings view are Chinese with `zh` and English with `en` (K2's `lang`; K2-ST-01's reload). `<html lang>` follows (I9-R4). | both | browser |
| E1-SEC | EP | All | At the end of each version's E1 run | F5 over everything the run produced. | *Rewritten (§18.7).* Zero hits for every bridge bearer, the main cookie on the child side, and every F3 fake key (and, browser side, the `apiKeyEnv` variable name). | both | browser |

### 12.1 The stub instance (F7)

A minimal third-party instance in the test tree (inst-OQ-21), used by E1-B8/B8b/B8c, I1c and K2:

- A DSH plugin package `fbtest-stub-instance` whose bundle patch inserts exactly one row of its own.
- It depends only on the connector's public `./contract` export and `docs/connector-contract.md`.
  It imports nothing from `packages/instance` (checked by a static scan in the test).
- At apply, it injects `fishballConnector` and calls `attachInstance({id: 'fbtest-stub', name:
  'Stub', contract: {id: 'fishball-connector', major: 1, minor}, transport})` with `minor` 0 by
  default, and with no `ui` unless a case gives one (K2 cases serve a page at `/fbtest/stub/`).
- `transport` is in-process and has the four methods `send`, `onMessage`, `onClose` and `close`.
  It does the envelope-v2 handshake, sends the session operations (`session.list`,
  `session.read`, `session.message`), and acks every `inbox.push`.
- It journals every frame in and out to a JSON-lines file in its own folder of the disposable home,
  and exposes the operations it should send through a test-only control (a file it watches or a
  test route), so a test drives it without touching the connector.
- `detach()` and a simulated transport close are test-controllable, for B8's reconnect check and
  I1c-ST-01.

---

## 13. Traceability: acceptance criteria → cases

ACs are §18.2's, split one per line. Withdrawn ACs keep their row.

| AC | Text | Cases |
| --- | --- | --- |
| I1-AC1 | Each transition observable through the instance's card / status route and `current()` | I1-P-01, I1-P-03, I1-ST-01..12, I1-ST-X1..X5, I1-DT-01..07 |
| I1-AC2 | No orphan child after any disable | I1-ST-04..07, I1-ST-10..12, I1-ST-X3, I1-DT-03, I1-DT-05..07 |
| I1-AC3 | Attach after `appReady` with the `ui` paths, no profile edit | I1-P-01..03, I1-ST-X4, I1c-P-01 |
| I1-AC4 (D25) | `connector-missing`, no child, main boots, no auto-install | I1-EP-01, I1-EP-02, I1-ST-X1, I1-ST-X2, I1-DT-04, I1-DT-06, E1-B1b |
| I1-AC5 | ~~Explicit launch config wins; a bad one fails safely~~ **Withdrawn (U1).** Its idea: I2-AC9 | — |
| D22 | Only "Fishball connector" and "Fishball instance" | I1-P-02, E1-B1 |
| I1c-AC1 | The frame's tag equals the card's state within the 1 s poll | I1c-P-10, I1c-DT-01..05 |
| I1c-AC2 | The stub-busy run ends `failed` / `NATIVE_INSTANCE_BUSY` with no child process | I1c-EP-02, I1c-ST-01, I1c-DT-03, E1-B8b |
| I1c-AC3 | Both routes answer as stated | I1c-P-06, I1c-P-07, I1c-EP-04, I1c-EP-06, I1-ST-02, I1-ST-X2 |
| I1c-AC4 | No token, path or key in any status answer | I1c-P-06 |
| I1c-R (R1–R7) | descriptor, `status()`, `retry()`, refused attaches, card live, `admin.status` | I1c-P-01..05, I1c-P-08, I1c-P-09, I1c-EP-01, I1c-EP-03, I1c-EP-05, I1c-ST-02, I1-EP-03 |
| I2-AC1 | ~~Both versions reach ready (Option A profile)~~ **Withdrawn (D28)** | — |
| I2-AC2 | ~~Owner bundles kept, in order~~ **Withdrawn here (D28; the slim-migration tests cover it)** | — |
| I2-AC3 | ~~One backup per migration~~ **Withdrawn (D28)** | — |
| I2-AC4 | *Rewritten:* no bearer in any file or log | I2-P-05, I3-SEC-05, I3-SEC-06 |
| I2-AC5 | ~~The preview notice never appears~~ **Withdrawn (D28)** | — |
| I2-AC6 | ~~Overlay rows and Web readiness services~~ **Withdrawn (D28)** | — |
| I2-AC7 | Lifecycle and the 60 s startup bound | I2-ST-01..04, I2-ST-X1..X3, I2-BVA-01..03, I2-EP-17 |
| I2-AC8 | The child's `execPath`, `execArgv` and listed variables equal the main's, minus the filtered flags, with `ELECTRON_RUN_AS_NODE=1` under every Electron host | I2-P-07..09, I2-EP-04..09, I2-EP-11, I2-DT-07..11 |
| I2-AC9 | The fake key is absent from the child's environment and logs; old launch values have no effect; the form has only `enabled` | I2-EP-10, I2-EP-12..16, I2-P-12, I2-P-13 |
| I2-AC10 | No second DSH-X window or GUI process ever starts; no `node` lookup or probe | I2-P-10, I2-P-11, I2-DT-09..11 |
| I2-AC11 | Both versions reach ready under both runtimes | I2-P-07, I2-P-08 (each on both versions) |
| I3-AC1 | The page and its SSE stream load through the proxy (*rewritten*: no WebSocket) | I3-P-01..03, I3-P-06, I3-P-07, I3-DT-01 |
| I3-AC2 | Each refusal row has its status, and the child logs no request for it | I3-EP-01..15, I3-EP-18, I3-DT-02..07, I3-BVA-05, I3-BVA-08 |
| I3-AC3 | *Rewritten:* no response to the browser carries the bearer | I3-SEC-01, I3-SEC-03, I3-SEC-04, I3-SEC-09, I3-EP-18 |
| I3-AC4 | The bearer never reaches the disk, the logs or the browser; the main cookie never reaches the child | I3-SEC-01, -03..10, I3-P-05, I3-EP-10, E1-SEC |
| I3-AC5 | Limits (body, upload; streams: OQ-28) | I3-BVA-01..09 |
| I3-AC6 | *Rewritten:* 503 when not ready, 404 when disabled (re-exchange withdrawn) | I3-ST-01, I3-ST-04, I3-P-08 |
| I4-AC1..AC5 | **Withdrawn (D28).** Moved ideas: I6-AC8, I8-AC6 | — |
| I5-AC1 | Every remaining resume path: same tool list and persona | I5-P-03, I5-ST-02, I5-DT-01, I5-DT-03 |
| I5-AC2 | A write tool fails at the sandbox; no permission control | I5-P-04, I5-P-05 |
| I5-AC3 | The id prefix holds | I5-P-01, I5-P-07 |
| I5-AC4 | Exactly one Fishball session after any restarts | I5-ST-01, I5-ST-03..05, I5-ST-X1 |
| I5-AC5 | ~~Private workspace; never "Choose workspace"~~ **Withdrawn (D28)** | — |
| I6-AC1 | *Rewritten (inst-OQ-05):* no connector value and no connector link on the view | I6-P-01, I6-P-10, I6-EP-01, I6-BVA-01, I6-BVA-02, I6-DT-05, E1-B5 |
| I6-AC2 | Restart gives a new child and the page reconnects; "Restarting…" with controls disabled | I6-P-02, I6-ST-01, I6-ST-X1, I6-DT-01, I6-DT-04 |
| I6-AC3 | *Rewritten (D26):* after Add exactly the ticked providers exist in the child; their models are in the composer; a second check lists nothing | I6-P-03, I6-P-04, I6-P-18, I6-P-22, I6-BVA-03..08, I6-ST-09, E1-B2 |
| I6-AC4 | Refusals show their codes | I6-EP-03..05, I6-EP-22..24, I6-ST-03, I6-ST-04 |
| I6-AC5 | Light and dark | I6-P-13 |
| I6-AC6 | *Rewritten (U1):* instance settings live in the child profile; the main form has only `enabled` | I6-P-06..09, I6-P-12, I6-DT-03 |
| I6-AC7 | *Rewritten:* the main manifest, credential store and connector config are unchanged by every action; the only page write to the main DSH is `admin.restart` | I6-P-11, I6-DT-04 |
| I6-AC8 | The `view` switch (moved from I4) | I6-P-14, I6-P-15, I6-EP-06..10, I6-ST-05..08, I6-ST-X3, I6-ST-X4, I9-DT-07..10 |
| I6-AC9 | A stale or foreign `checkId`, or an id outside the list, writes nothing; restart, expiry and provider change between Check and Add write nothing | I6-EP-12..16, I6-BVA-09..11, I6-DT-09, I6-DT-10, I6-ST-10, I6-ST-11 |
| I6-AC10 | `result-unknown`, `sync-busy`, shared checks, partial success | I6-EP-17..19, I6-P-21, I6-ST-02, I6-ST-12, I6-DT-12 |
| I6-AC11 | Disabled unless `ready`; only API-key and `apiKeyEnv` providers; no key, mask, endpoint or variable name in the browser, the HAR or a log | I6-ST-X2, I6-DT-06..08, I6-DT-11, I6-P-05, I6-P-19, I6-P-20, I6-EP-02, I6-EP-20, I6-EP-21, I6-EP-25 |
| I6-AC12 | Model block and its plain line | I6-P-16, I6-P-17, I6-DT-02 |
| I7-AC1 | Each kind's row matches the connector's row for the same record (same words, same fields) | I7-P-01, I7-P-03, I7-P-04, I7-P-06, I7-P-09, I7-EP-01..11, I7-BVA-01..06 |
| I7-AC2 | No duplicate after two restarts | I7-ST-01..05 |
| I7-AC3 | The next request's log has no record text; a notice still wakes Fishball | I7-P-05, I7-P-08 |
| I7-AC4 | In order, with the asking session named; nothing before the card ends | I7-P-02, I7-ST-X1 |
| I7-AC5 (U5) | Labels unchanged; a label and a record both show | I7-P-07 |
| I8-AC1 | ~~No import of a removed module~~ **Withdrawn (D29).** Moved: I10-AC1 | — |
| I8-AC2 | ~~Old routes answer 404~~ **Withdrawn (D29)** | — |
| I8-AC3 | The existing chat suite passes unchanged; full suite green | I8-P-04, I8-P-05, I8-EP-05 |
| I8-AC4 | Every copied token name is in 0.2.2-rc.1's `dsh-client-ui-theme`; rc.5 gaps listed | I8-P-06 |
| I8-AC5 | No colour literal outside the accent; tokens loaded; no remote file; CSP unchanged | I8-P-07, I8-P-11, I8-P-15 |
| I8-AC6 | No "Fishball" title or status tag; no unread count, connector link or `postMessage`; the "Reconnecting…" banner only while lost | I8-P-08..10, I8-ST-01, I8-ST-02 |
| I8-AC7 | DSH's measures and look, light and dark | I8-P-12..14, I8-EP-06 |
| I8-AC8 | Model and effort pickers (moved from I4) | I8-P-16..18, I8-EP-07, I8-DT-01..04 |
| I9-AC1 | ~~Theme × language combinations match the main page~~ **Withdrawn (D30, U3)** | — |
| I9-AC2 | ~~Follows a change in the main page~~ **Withdrawn**; now K2-AC2 and U3-AC1 | — |
| I9-AC3 | The two dictionaries have the same keys; no user-visible string outside them | I9-P-04, I9-P-11 |
| I9-AC4 | Both variants render on both versions; the `lang` rule | I9-P-02, I9-P-03, I9-P-12, I9-EP-01..08, I9-DT-07..10 |
| I9-AC5 | `<html lang>`, dates and numbers, the 503 page, view switch and reload keep `lang` | I9-P-02, I9-P-03, I9-P-05..07, I9-ST-04, I9-ST-05 |
| I9-AC6 | Refusals in the page's words; `authorKind` worded; record words equal | I9-P-08..10, I7-P-06 |
| U3-AC1 | Framed mirror live, draft kept; standalone OS fallback live; no throw; no `theme` parameter; name watched | U3-P-01..06, U3-EP-01..05, U3-ST-01, I8-EP-06 |
| K2-AC1 | The iframe `src` equals the registered path with exactly the stated parameter | K2-P-01, K2-P-02, K2-EP-01..07, I1-P-01, I3-P-07 |
| K2-AC2 | Locale change reloads; Open in a tab the same URL; no other change to C3 | K2-P-03, K2-ST-01..03 |
| K2-AC3 | `minor` 1; a 1.0 instance attaches; descriptor validation unchanged | K2-P-04..06 |
| I10-AC1 | No reference to a removed path; both packages pack; full suite green | I10-P-01..05, I10-EP-01 |
| E1-AC | §18.4 scenarios pass on both versions, both runtimes | E1-B1..B9, E1-B1b, E1-B8b, E1-B8c, E1-SEC |

## 14. Case count

Rows per task. "Withdrawn" rows keep their ids and are not run. "Moved in" are cases that came
from another task's old ids (they are new rows here; the old row is withdrawn where it was).

| Task | Rows | Withdrawn | Active | of which rewritten | of which new | of which moved in |
| --- | --- | --- | --- | --- | --- | --- |
| I1 | 32 | 2 | 30 | 8 | 0 | 0 |
| I1c | 23 | 0 | 23 | 0 | 23 | 0 |
| I2 | 54 | 17 | 37 | 1 | 24 | 2 |
| I3 | 60 | 10 | 50 | 12 | 0 | 0 |
| I4 | 25 | 25 | 0 | 0 | 0 | 0 |
| I5 | 17 | 4 | 13 | 2 | 0 | 0 |
| I6 | 86 | 0 | 86 | 29 | 39 | 13 |
| I7 | 32 | 0 | 32 | 6 | 6 | 0 |
| I8 | 31 | 7 | 24 | 1 | 13 | 8 |
| I9 | 35 | 10 | 25 | 0 | 25 | 0 |
| I10 | 6 | 0 | 6 | 0 | 6 | 0 |
| U3 | 12 | 0 | 12 | 0 | 11 | 1 |
| K2 | 16 | 0 | 16 | 0 | 15 | 1 |
| E1 | 13 | 0 | 13 | 7 | 1 | 0 |
| **Total** | **442** | **75** | **367** | **66** | **163** | **25** |

Active rows by the Runs column: `node` 164, `browser` 191, `static` 10, plus the two n/a boundary
rows (I3-BVA-01, I7-BVA-01). Rows that only point at another case's run (I6-BVA-03, I6-BVA-04,
I6-ST-03, I6-ST-10..12, I7-BVA-02) are counted; they keep each boundary and transition visible.

## 15. Open questions

Where the design leaves an expected result open, the case states what holds anyway and points
here. OQ-01..23 are the first version's; their state is from §18.5 and §18.7.

**First version (state after §18.5 / §18.7):**

- **OQ-01** Observation points. **Answered** (inst-OQ-01): O1, O2 above.
- **OQ-02** Connector disabled at runtime. **Answered** (inst-OQ-02).
- **OQ-03** Attach refused. **Answered** (inst-OQ-03); cases I1c-EP-02, -03.
- **OQ-04** UD2 vs §0.7. **Replaced** (§18.5 note): §0.7 and U1, the form has only `enabled`.
- **OQ-05** Connector values on I6. **Answered** (inst-OQ-05): none, and no link.
- **OQ-06** Naming. **Answered** (inst-OQ-06).
- **OQ-07** Startup timeout. **Answered** (inst-OQ-07): 60 s, reported as `NATIVE_START_FAILED`
  (as is a missing core service or app server); `NATIVE_TIMEOUT` is reserved and unused.
- **OQ-08** Manifest migration. **Moot** (D28, §18.7).
- **OQ-09** Crash. **Answered** (inst-OQ-09): failed until Retry.
- **OQ-10** Test fixtures in the child profile. **Answered** for owner bundles (inst-OQ-10); the
  launch-token part is **moot** (D28). The bearer and the child route probe: OQ-24.
- **OQ-11** Proxy status codes. **Answered** (inst-OQ-11), without the token-exchange rule.
- **OQ-12** §3.3/§3.6 under Option A. **Moot** for `remote.mux`, `plugins/events` and
  `uploadFileBinary` (§18.5 note). The CSP part: OQ-27. The 308 and the `token` 400 stand.
- **OQ-13** Disabled instance. **Answered** (inst-OQ-13): 404; not ready 503.
- **OQ-14** I4 details. **Moot** (D28, §18.7). The `view` rule is decided in §0.5; the effort
  default for the custom picker: OQ-37.
- **OQ-15** Keyboard shortcuts. **Moot** (D28).
- **OQ-16** Archive and preset timing. **Moot** (§18.7); but I5-ST-04/05 are kept: OQ-29.
- **OQ-17** I6 details. **Answered** (inst-OQ-17): curated list, "Nothing new to add",
  "Restarting…".
- **OQ-18** Records. **Answered** (inst-OQ-18).
- **OQ-19** Retired routes. **Replaced** (§18.5 note, §18.7): the custom chat's routes and the
  admin routes stay; `/api/fishball/native/provider-sync/sync` is retired and replaced by the
  main-side `/api/fishball-instance/models/check` and `/models/add`; `/api/fishball/native/status`
  is replaced by `/api/fishball-instance/status` (and kept for its readers, §18.1 I1c).
- **OQ-20** I9 timing. **Replaced** (§18.5 note): the language follows by K2's reload. The theme
  timing: OQ-43.
- **OQ-21** Stub instance. **Answered** (inst-OQ-21).
- **OQ-22** rc.5 and SP1. **Moot** (D28).
- **OQ-23** Preview notice on rc.5. **Moot** (D28).

**New (2026-11-07):**

- **OQ-24 Child probe and bearer.** The child's HTTP surface is its own loopback server (§0.5
  "Child routes"). May a test owner bundle add a route such as `/__fbtest/echo` to it, and how
  does a test learn each bridge bearer generation for F5 without the product writing it anywhere?
  (I2-P-05, I3-P-05, I3-SEC-*.)
- **OQ-25 Retry and status routes outside `failed`.** What does `POST /api/fishball-instance/retry`
  do in `ready`, `starting` or `connector-missing` (restart, no-op, or a refusal, and with which
  answer)? Which HTTP status do both routes give a request without the owner cookie, or a
  cross-site one (I1c-EP-04, -06, I1-ST-X2)?
- **OQ-26 `execArgv` filter.** The drop of `--inspect*` / `--debug-port` still waits for the
  user's confirmation (§0.5, U2). Are the two-token forms (`--inspect-port 0`,
  `--debug-port 9229`) also dropped, value included (I2-EP-05, -06)?
- **OQ-27 Document CSP.** §0.5 says the CSP stays `default-src 'self'` (§3.3); inst-OQ-12 says the
  document gets only `frame-ancestors 'self'` and drops the other directives because "DSH's own app
  sets its needs" (an Option A reason). Which is right for the custom page (I3-P-08, I8-P-15)?
- **OQ-28 Stream limits for SSE.** §18.7 withdraws I3-BVA-10..12 as `remote.mux` cases. Do the
  32-stream limit (33rd → 503 `Retry-After: 1`, inst-OQ-11 (6)) and the 30 s idle timeout of §3.6
  apply to the SSE `api/events` stream, so that the three cases come back for SSE?
- **OQ-29 Archive of Fishball's session.** §18.5 declares inst-OQ-16 moot, but §18.7 keeps
  I5-ST-04/05. May the session be archived, and what does the next start do?
- **OQ-30 Check while listed or adding.** Is **Check for new models** enabled while a list is
  shown (a new check replacing the list) and while an Add runs (§10 says only that Add is
  disabled while it runs)?
- **OQ-31 A cancelled check.** After Cancel, "the host lets the preview expire". Is an Add with
  that `checkId` within its 5-minute life still accepted at the route?
- **OQ-32 PATH with no absolute entry.** What is the child's `PATH` when the main's has none?
- **OQ-33 `ids` edge cases.** `models/add` with `ids: []`, or with a duplicate id: refused (which
  code) or a no-op? (The 2026-11-06 T line listed both partitions; §10 states neither.)
- **OQ-34 Stale revision in I6.** §15 T11 says every admin mutation is revision-checked and refusals
  are typed, and §0.7 keeps those routes (D29); §18.2 I6 does not mention it. Which refusal code
  does the view show for a stale model, setting or plugin-inventory write, and must the view
  re-read the block after it (I6-EP-22..24)?
- **OQ-35 A re-delivered record.** §18.2 I7 R5 says no duplicate after a reconnect, and R1 says
  "at its place in the timeline". Can the connector re-deliver an already acked card record after a
  child restart, and if it does, does the row keep its first place (I7-ST-05)?
- **OQ-36 Screenshot threshold.** What difference between DSH's session and Fishball's page passes
  I8-P-13/-14 (exact token values and measures only, or a pixel tolerance)?
- **OQ-37 Default effort in the custom picker.** inst-OQ-14's rule (the catalog's
  `reasoning.defaultEffort`, else none sent; no carry-over to another model) was written for DSH's
  picker and is moot. Does it bind the custom composer (I8-DT-02, -04)?
- **OQ-38 503 page Retry.** The design says the 503 page follows `lang`. Which address does its
  Retry load: the same address with `view` and `lang` kept? (The test brief asks for that;
  I9-P-06.)
- **OQ-39 `authorKind` `other`.** Which user-row sources give `other` (not a typed message and not
  a reminder), so a test can produce one (I9-P-09)?
- **OQ-40 Parent lost mid-life.** When the parent becomes unreachable after the page followed it,
  does the page keep the last mirrored theme or switch to `prefers-color-scheme` (U3-EP-04)?
- **OQ-41 Language details.** Must every `{name}` placeholder appear in both dictionaries, and
  which `Intl` options (date style, time style, number grouping) are the expected format
  (I9-P-04, -07)?
- **OQ-42 Theme reload in K2.** §18.1's K2 row says the frame reloads "on a locale or theme
  change", but §18.2 K2 R2, U3 and U4 say only a locale change reloads, and a theme reload would
  lose a draft (§0.5). K2-ST-02 follows §18.2; please confirm.
- **OQ-43 Theme follow time.** inst-OQ-20's "within 2 s" was written for the old I9. Is 2 s the
  bound for U3's live mirror and the OS fallback (U3-P-02, -04, U3-ST-01)?

## 16. Phase-2 live checks on :7713

The cases above run in disposable homes. A later, user-approved Phase-2 run on the user's real
DSH at `:7713` (after the user installs both packages there) re-checks the browser-only behaviour
by hand or with a real browser. It reads and clicks only: no destructive step (no uninstall, no
SIGKILL of the user's child unless the user agrees), no real key leaves the user's own homes, and
nothing on `:3081` or `:54679` is touched. Cover at least:

| Area | Cases to re-check on :7713 |
| --- | --- |
| Frame and binding | I1-P-01, I1-P-02, I1c-P-09, I1c-P-10, I1c-EP-05, I1c-DT-01, I1c-DT-02 |
| Launch under DSH-X (the real Electron host) | I2-P-08's and I2-P-11's observations, read from the process list only (`ps`), and I2-P-13 (the card has only `enabled`) |
| The page itself | I3-P-01..03, I3-P-07, I3-SEC-01, I3-SEC-03, I3-SEC-04 |
| Settings view and `view` | I6-P-01, I6-P-02, I6-P-14, I6-P-15, I6-P-17, I6-EP-06..10, I6-ST-01, I6-ST-05..08, I6-ST-X3, I6-ST-X4 |
| Model sync on the card | I6-P-03, I6-P-18, I6-P-19, I6-EP-11, I6-EP-12, I6-EP-15, I6-ST-09, I6-ST-X2, I6-DT-06..08, and I6-P-20's browser-side scan (HAR and storage) for the user's real keys and variable names |
| Plugins block | I6-P-06..09 with a harmless local pack, then removed again |
| Records | I7-P-01, I7-P-04, I7-P-07, I7-ST-01, I7-ST-02 |
| Restyle | I8-P-08..14, I8-P-16..18, I8-ST-01, I8-EP-07 |
| Language | I9-P-02, I9-P-03, I9-P-06, I9-P-07, I9-P-08, I9-P-10, I9-ST-04, I9-ST-05, E1-B9 |
| Theme | U3-P-01..04, U3-P-06, U3-EP-05, U3-ST-01 |
| K2 | K2-P-01..03, K2-EP-06, K2-EP-07, K2-ST-01..03 |
| E2E | E1-B1, E1-B2 (with the user's consent to add a provider), E1-B4, E1-B5 (read-only: open the form through the frame, change nothing), E1-B6 only if the user agrees to a child kill |
