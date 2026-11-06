# Test design: `fishball-instance` (I1–I9) and end to end (E1)

Status: **test design, written before development (TDD).** Black-box only: no production code was
read. Source: `docs/slim-native-design.md` at commit `3509859` (branch `design/body-soul`), §0
(connector and instance), §18.1 (task table), §18.2 (R / T / AC per task), §18.4 (E2E-B1..B8),
with §2.3–§3.6, §5.2, §7, §10, §11 for the details §18.2 points to. K1, M1 and C1–C3 are designed by
another session; this document refers to them only where an instance case needs their behaviour.

## 0. The user's decisions that change §18.2 (2026-11-06, 22:31)

These come after commit `3509859` and win over it. The cases below already apply them.

| # | Decision | Effect on this design |
| --- | --- | --- |
| UD1 | With only the instance enabled (no connector), the instance shows `connector-missing` and does **not** install the connector. Confirmed. | I1 and E1 cases assert it; no case carries `[PENDING-USER]`. |
| UD2 | Every instance setting lives in the instance's own DSH profile and its settings page. The instance exposes to the main DSH only the sync options it needs (model/provider sync). | I6 asserts storage in the child profile and checks the main DSH's form for `fishball-instance`. This conflicts with §0.7's last row (launch settings in the main row config): OQ-04. |
| UD3 | An instance can **not** change connector limits. They are edited only in DSH's own plugin settings form for `fishball-connector`. I6 offers no editing of them and at most shows them read-only. | §18.2 I6's "connector settings … saved with `settings.update`", its EP "valid/invalid/stale" connector values, its BVA on connector fields and its first AC are **replaced** by read-only and no-write cases. §18.4 E2E-B5 is rewritten (E1-B5). |
| UD4 | No plugin is called "Fishball" any more; the only plugins are `fishball-connector` and `fishball-instance`. | I1-P-02 and E1-B1 check the Plugins page. The row id `fishball` and the brand wording are OQ-06. |

## 1. Conventions

- **Techniques.** P = positive; EP = negative cases by equivalence partitioning; ST = state
  transition (state table plus invalid transitions); DT = decision table (every rule written out);
  BVA = boundary value analysis (min − 1, min, max, max + 1; "n/a" where a value cannot exist).
- **Ids.** `<task>-<technique>-<nn>`, e.g. `I3-BVA-02`; security cases of I3 are `I3-SEC-nn`.
- **R refs.** `I3-R4` means the fourth requirement in that task's R list below. `UDn` refers to §0.
- **Versions (V column).** `both` = DSH **0.2.1-rc.5** and **0.2.2-rc.1** (the default). Each
  case runs once per version. A case that applies to one version names it.
- **Black box.** Observations only through HTTP, the browser DOM and network log, files and
  processes in the disposable homes, the fake model's request journal, and DSH's public services
  read by test fixture plugins (§2). No test reads `packages/**` production code.
- **Disposable only (D21, §17).** Fresh `DSH_HOME`s and free ports for every run; never the
  user's homes, never ports 7713 or 3081, never a real API key or a real provider.

## 2. Shared fixtures and observation points

| Id | What | Notes |
| --- | --- | --- |
| F1 | Disposable main home, free port, DSH started from the installed version directory (read-only); both packages installed from local packs with `dsh plugin add fishball-connector fishball-instance` unless a case says otherwise. | The child home is wherever the instance puts it under the main home; the tests discover it, they do not create it, except where a case pre-seeds it. |
| F2 | Browser: a real Chromium driving the main page at `http://127.0.0.1:<mainPort>`, with a full network log (HAR including WebSocket frames) and storage dumps of the main page and the iframe. | |
| F3 | Fake models, no network: a local fake OpenAI-compatible server and two catalog entries, `fake-effort` (declares reasoning efforts `low`, `medium`, `high`) and `fake-plain` (declares none). The server journals every request (model, effort, messages, tools, system text). The main home has an API-key provider for it with a fake key `FAKEKEY-<random>`. | The fake key is a secret in the I3/E1 scans too. |
| F4 | Child probe: a test bundle pre-seeded as an owner-installed bundle in the child profile. (a) A route `/__fbtest/echo` in the handler form `handler(req,res)` (R3) that journals each hit (method, path, Host, Origin, Cookie, Authorization, body length and sha256) and echoes them. (b) A token probe that reads `connection.authenticatedUrl(origin)` once per child process and writes the token only into the test's own memory channel, never to disk. (c) Read-only reads of DSH services: `pluginManager.listPlugins`, `settings`, `agentPresets`, `sessionController`, `workspaceRegistry`, `sandboxPolicy`. | Whether a test fixture may be installed in the child profile, and the token probe itself: OQ-10. |
| F5 | Secret scan: a byte search of the main home, the child home, the run's temp directories, every captured stdout/stderr, `child-stderr.log*`, `lifecycle.log`, DSH's log directories of both homes, the HAR (URLs, headers, bodies, WebSocket frames), the browser storage dumps (cookies, localStorage, sessionStorage, IndexedDB, Cache Storage) and `ps eww` output of every process. Secrets: every launch token seen by F4b, every child cookie value seen by F4a, the main cookie value (for the child side only), the F3 fake key. | Zero hits is the pass condition. The main DSH's own printed `dsh web:` token in the main process's own stdout is out of scope. |
| F6 | Process check: list processes whose arguments or environment name the child home; "no orphan" means none within 5000 ms of the event (the 4000 ms bounded stop of §2.4 plus 1000 ms margin). | |
| F7 | Stub instance (E1-B8 only): see §12.1. | |
| O1 | **Instance status:** the state and safe code the instance shows (`connector-missing`, waiting, starting, attached/ready, restarting, failed with code, stopped). | Where it is shown when the connector is missing: OQ-01. |
| O2 | **Attach state and attach/detach count of the connector.** | The observation point K1/C1 provides: OQ-01. Until then, the connector view (framed vs "No Fishball instance is attached") is the fallback. |
| O3 | **Connector settings:** the values in DSH's own settings form for `fishball-connector` and in that row's config (read by a main-profile fixture through DSH's `settings` service), plus its revision. | |
| O4 | **Session log:** the child's session log of Fishball's session and the main sessions' logs (records, request headers including the reasoning effort, sandbox and approval entries). | |

---

## 3. I1 — the instance binds to the connector

**R** (from §18.2 I1 and §0.6):
- I1-R1: with both plugins enabled, the instance attaches after main `appReady`, with
  `ui = {chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings'}`, and with no profile edit.
- I1-R2: each child restart detaches, then re-attaches exactly once.
- I1-R3: without the connector, the status is `connector-missing`, the child does not start, the
  main boot succeeds and the view states the reason; the connector is not installed (UD1).
- I1-R4: disabling or uninstalling the instance detaches and stops the child.
- I1-R5: disabling or uninstalling the connector stops the child.
- I1-R6: launch defaults come from `node-default.js`; explicit config wins (§0.6). Where that
  config lives is OQ-04.
- I1-R7 (UD4): the only plugins are `fishball-connector` and `fishball-instance`.

**T:** P, ST, EP, DT. §18.2 names no BVA for I1.

**State table** (rows are states; ✓ = valid transition, case id; ✗ = invalid, must not happen):

| From \ event | main `appReady` | wire authenticated | restart (Restart, Retry, `instance.restart`) | child exits on its own | disable/uninstall instance | disable/uninstall connector | enable connector | enable instance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| connector-missing | ✗ stays, no child (ST-X1) | — | ✗ stays, no child (ST-X2) | — | → stopped, no child (DT-05) | stays | → waiting → starting → attached (ST-08) | — |
| waiting (enabled, before `appReady`) | → starting (P-03) | ✗ no attach before `appReady` (ST-X4) | — | — | → stopped (ST-10) | → connector-missing | — | — |
| starting | — | → attached, attach count +1 (P-01) | ✗ still one child (I2-ST-X1) | → failed | → stopped, never attaches (ST-10) | → connector-missing, never attaches (ST-11) | — | — |
| attached | — | ✗ no second attach without a detach (ST-03) | → restarting, detach (ST-01) | → failed, detach (ST-02) | → stopped, detach (ST-04, ST-05) | → connector-missing, detach, child stopped (ST-06, ST-07) | — | — |
| restarting | — | → attached, attach count +1 exactly (ST-01) | ✗ no second child (I6-ST-X1) | → failed | → stopped, never re-attaches (ST-11) | → connector-missing (ST-11) | — | — |
| failed (code) | — | — | → starting → attached (ST-02) | — | → stopped, no child (ST-12) | → connector-missing | — | — |
| stopped (instance disabled) | ✗ stays, no child (ST-X3) | — | ✗ stays (ST-X3) | — | — | — | — | → waiting/starting → attached (ST-09) |

The status after the connector is disabled at runtime is assumed `connector-missing` from §18.2's
ST line; OQ-02.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I1-P-01 | P | R1 | F1, F2, F3 | Boot the main DSH. Wait for main `appReady` (the main page loads). Open the Fishball view from the sidebar row. Open the connector's Plugins-page entry for the settings page. | O1 shows attached. O2 shows one attach. The view's iframe `src` is exactly `/fishball/embed/`. The settings entry opens exactly `/fishball/embed/?view=settings`. The iframe shows DSH's session view. | both |
| I1-P-02 | P | R1, R7 | F1; a byte copy of the profile manifest taken right after `dsh plugin add` | Boot and wait for attached. Compare the profile manifest with the copy. Open DSH's Plugins page. | The manifest is byte-identical: no row was appended or edited by hand or by the plugins. Each package inserted exactly its own row. The Plugins page lists `fishball-connector` and `fishball-instance`, and no plugin named "Fishball" (UD4). | both |
| I1-P-03 | P | R1 | F1, F6; main stdout timestamps | Boot. Record the time of main `appReady` and the start time of the child process (F6). | The child process starts after `appReady`. O2 shows no attach before `appReady`. | both |
| I1-ST-01 | ST | R2 | I1-P-01 state (attached) | Click Restart on the instance settings page (I6). Watch O1 and O2. | O1: restarting, then attached. O2: exactly one detach, then exactly one attach. The child PID changes; at most one child process exists at any moment. | both |
| I1-ST-02 | ST | R2 | Attached | Kill the child process alone (SIGKILL to its PID). Watch O1 and O2, and the Fishball view. Click Retry. | After the kill: O1 failed with `NATIVE_CHILD_EXITED`, O2 detached, and the view shows the error and Retry. After Retry: starting, then attached, with attach count +1 exactly. | both |
| I1-ST-03 | ST | R2 | Attached | Restart three times in a row, each after the previous attach. | Three detaches and three attaches, alternating. O2 never reports two attached instances. Never more than one child process (F6). | both |
| I1-ST-04 | ST | R4 | Attached | Disable `fishball-instance` in DSH's Plugins page. | O2 detached; the connector shows "No Fishball instance is attached". No child process within 5000 ms (F6). The main DSH stays up and serves its page. | both |
| I1-ST-05 | ST | R4 | Attached | Uninstall `fishball-instance`. | As I1-ST-04. | both |
| I1-ST-06 | ST | R5 | Attached | Disable `fishball-connector`. | The child stops: no process within 5000 ms. O1 shows `connector-missing` (OQ-02). The main DSH stays up. | both |
| I1-ST-07 | ST | R5 | Attached | Uninstall `fishball-connector`. | As I1-ST-06. The connector is not installed again (UD1). | both |
| I1-ST-08 | ST | R3, R1 | Instance only, status `connector-missing` | Install and enable `fishball-connector`. Restart the main DSH if DSH requires it to compose the new row (OQ-02). | O1 goes waiting, then starting, then attached. O2: one attach. | both |
| I1-ST-09 | ST | R4, R1 | Both installed; instance disabled (stopped) | Enable `fishball-instance`. | Child starts; O1 attached; O2 one attach. | both |
| I1-ST-10 | ST | R4 | Both installed; a child probe (F4) that holds readiness for 10 s, so the instance stays starting | While O1 shows starting, disable `fishball-instance`. | O2 never records an attach. No child process within 5000 ms. | both |
| I1-ST-11 | ST | R4, R5 | As I1-ST-10 | (a) During starting, disable the connector. (b) During restarting (after I1-ST-01's Restart), disable the instance. | (a) No attach; child stopped; O1 `connector-missing`. (b) No re-attach; child stopped; O1 stopped. No orphan in either. | both |
| I1-ST-12 | ST | R4 | O1 failed (after I1-ST-02's kill, before Retry) | Disable `fishball-instance`. | O1 stopped; no child process; no attach. | both |
| I1-ST-X1 | ST (invalid) | R3 | Instance only (connector absent) | Boot; wait 30 s after main `appReady`. | O1 stays `connector-missing`. No child process starts at any time (F6 polled every second). | both |
| I1-ST-X2 | ST (invalid) | R3 | As I1-ST-X1 | Trigger every restart entry the instance exposes in this state (Retry/Restart, if shown). | O1 stays `connector-missing`; no child process. If no entry is shown, record "not offered" (pass). | both |
| I1-ST-X3 | ST (invalid) | R4 | Both installed; instance disabled | Restart the main DSH; wait 30 s after `appReady`. | No child process; O2 no attach; O1 stopped. | both |
| I1-ST-X4 | ST (invalid) | R1 | F1; a main-profile fixture that delays main `appReady` by 5 s | Boot and watch O2 and F6 before `appReady`. | No child process and no attach before `appReady`. | both |
| I1-ST-X5 | ST (invalid) | R2 | Attached; a managed main session | Restart. While O1 is restarting, the managed session calls `message_fishball` once. | The call is accepted as queued (not refused). After the new attach, Fishball's chat shows it exactly once. O2 never shows attached while the child is restarting. | both |
| I1-EP-01 | EP (connector absent) | R3, UD1 | F1 with only `fishball-instance` installed | Boot. Load the main page. Open DSH's Plugins page. Inspect the profile manifest and the installed packages. Watch the plugin manager's operations. | Main boot succeeds; the main page and other plugins work. O1 `connector-missing`, with the reason stated (OQ-01). No child process. `fishball-connector` is not installed: it is not in the manifest or in the installed packages, and the plugin manager ran no install. | both |
| I1-EP-02 | EP (connector installed, disabled at boot) | R3, R5 | Both installed; connector disabled | Boot. | As I1-EP-01, except that the connector package stays installed and disabled. | both |
| I1-EP-03 | EP (incompatible connector present) | R3 | F1 with a fake `fishball-connector` test package whose `fishballConnector` refuses `contract-version` (major 2) | Boot. | Main boot succeeds; O2 shows no attach. The O1 status, and whether the child runs: OQ-03. | both |
| I1-EP-04 | EP (explicit launch config) | R6 | Both installed; `nodeExecutable` set to a test copy of Node at a known path, in the place OQ-04 settles | Boot. Read the child process's executable (F6). | The child runs the configured executable, not the default. | both |
| I1-EP-05 | EP (invalid launch config) | R6 | As I1-EP-04 with `nodeExecutable` pointing at a missing file | Boot. | O1 failed with `NATIVE_START_FAILED`; no child process; main boot succeeds; no attach. | both |

**Decision table** (connector × instance enabled × child healthy → status):

| Rule | Connector | Instance enabled | Child healthy | Instance status (O1) | Attach (O2) | Child process | Case |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | enabled | yes | yes | attached | 1 | running | I1-DT-01 |
| 2 | enabled | yes | no (exits after ready) | failed, code `NATIVE_CHILD_EXITED` | 0 (detached) | none | I1-DT-02 |
| 3 | enabled | no | — | stopped | 0 | none | I1-DT-03 |
| 4 | absent | yes | — | `connector-missing` | — | none | I1-DT-04 |
| 5 | absent | no | — | (no instance row) | — | none | I1-DT-05 |
| 6 | disabled | yes | — | `connector-missing` (OQ-02) | — | none | I1-DT-06 |
| 7 | disabled | no | — | stopped | — | none | I1-DT-07 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I1-DT-01 | DT r1 | R1 | Both enabled, F3 | Boot; wait 60 s. | Rule 1 row. | both |
| I1-DT-02 | DT r2 | R2 | Both enabled; a child probe (F4) that makes the child exit 5 s after ready | Boot; wait 15 s. | Rule 2 row; the main boot is unaffected. | both |
| I1-DT-03 | DT r3 | R4 | Connector enabled, instance installed but disabled | Boot. | Rule 3 row; the connector view shows the no-instance state. | both |
| I1-DT-04 | DT r4 | R3 | Instance only | Boot. | Rule 4 row (same run as I1-EP-01). | both |
| I1-DT-05 | DT r5 | R3 | Instance installed and disabled; connector absent | Boot. | Rule 5 row; the main boot succeeds; nothing about Fishball is installed. | both |
| I1-DT-06 | DT r6 | R5 | Connector installed and disabled; instance enabled | Boot. | Rule 6 row (same run as I1-EP-02). | both |
| I1-DT-07 | DT r7 | R4 | Both installed and both disabled | Boot. | Rule 7 row; the main boot succeeds. | both |

---

## 4. I2 — the child profile to Option A

**R** (from §18.2 I2 and §0.5):
- I2-R1: a new child home gets the bundles `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]`.
- I2-R2: an existing base-only manifest gets `dsh-web-app` back. The replaced manifest is backed up
  once, and a backup is never overwritten.
- I2-R3: owner-installed bundles are kept, in their order.
- I2-R4: the overlay disables `ui-permission`, `ui-agent-preset` and `client-hmr`. It sets
  `web-runtime` `printUrl: false` and `openBrowser: false`, and inserts the child UI row. It
  keeps today's rows: lifecycle, app, admin, provider-sync target, time-context, the read-only
  sandbox and approval ask.
- I2-R5: readiness also requires `webServer`, `connection` and `sessionController`.
- I2-R6: the launch token reaches the main half over the wire, and is never written to disk or logs.
- I2-R7: the preview notice is pre-acknowledged; it never appears in the iframe.
- I2-R8: lifecycle: starting → ready → stopping → stopped; a crash → failed → Retry.
- I2-R9: a startup timeout bounds readiness (the value is OQ-07).

**T:** P, EP, ST, BVA, DT.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I2-P-01 | P | R1 | F1; no child home | Boot; wait for ready. Read the child profile manifest. | Bundles are exactly `[@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]`. The child reaches ready. No backup file exists. | both |
| I2-P-02 | P | R2 | Child home pre-seeded with a base-only manifest (`[@deepseek-ai/dsh-base]`), saved byte copy B0 | Boot; wait for ready. | Bundles `[base, web-app]`. Exactly one backup file, byte-equal to B0. The child reaches ready. | both |
| I2-P-03 | P | R4 | Ready; F4c | Read the child's composed rows through `pluginManager.listPlugins`/`inspect` and `settings`. | `ui-permission`, `ui-agent-preset` and `client-hmr` are disabled. `web-runtime` has `printUrl: false` and `openBrowser: false`. The instance's child UI row is present and enabled. Lifecycle, app, admin, provider-sync target and time-context rows are present. Sandbox mode is `read-only`; the approval policy is `ask`. | both |
| I2-P-04 | P | R4 | F1; `BROWSER` env of the main process set to a recorder script | Boot; wait for ready. | The child's stdout/stderr and `child-stderr.log` hold no `dsh web:` URL line. The recorder script was never invoked. | both |
| I2-P-05 | P | R6 | Ready; F4b learns token T1; then Restart → token T2 | Run F5 over both homes, all logs and process lists after boot, after the restart and after the main shutdown. | Zero hits for T1 and T2 anywhere: not in any file under either home, not in `child-stderr.log*` or `lifecycle.log`, and not in any argv or environment. T2 ≠ T1. | both |
| I2-P-06 | P | R7 | Fresh child home (first start) | Open the Fishball view; wait 5 s. Restart the child; open again. | No DSH preview/welcome notice in the iframe either time (DOM has no notice element; screenshot). Whether rc.5 has the notice: OQ-23. | both |
| I2-EP-01 | EP (a required service missing: `webServer`) | R5 | Child home pre-seeded with an owner bundle whose patch disables the child's web-server row | Boot; wait for the startup timeout + 5 s. | The child never reports ready. O1 is failed with a safe code (OQ-07). No attach. No orphan process (F6). | both |
| I2-EP-02 | EP (`connection` missing) | R5 | As I2-EP-01, disabling the row that provides `connection` | As I2-EP-01. | As I2-EP-01. | both |
| I2-EP-03 | EP (`sessionController` missing) | R5 | As I2-EP-01, disabling the row that provides `sessionController` | As I2-EP-01. | As I2-EP-01. | both |
| I2-ST-01 | ST | R8 | F1 | Boot; record O1. | Starting, then ready, in that order; no other state in between. | both |
| I2-ST-02 | ST | R8 | Ready | Disable the instance. Measure from the click until the child process is gone. | Stopping, then stopped. The child is gone within 4000 ms (§2.4 bound). | both |
| I2-ST-03 | ST | R8, R6 | Ready, token T1 | SIGKILL the child. Click Retry. | Failed (`NATIVE_CHILD_EXITED`), then starting, then ready. The new token T2 ≠ T1. | both |
| I2-ST-04 | ST | R8 | Ready | End the main DSH (stdin EOF, as DSH's launcher expects). | The child stops; no orphan within 5000 ms after the main process exits. | both |
| I2-ST-X1 | ST (invalid) | R8 | Starting (F4 holds readiness 10 s) | Click Retry/Restart twice while starting. | Never more than one child process for the home (one writer). It reaches ready once. | both |
| I2-ST-X2 | ST (invalid) | R8 | Failed after a SIGKILL | Do nothing for 30 s. | It stays failed with no new child: no automatic restart (OQ-09). | both |
| I2-ST-X3 | ST (invalid) | R8 | Stopping (F4 slows shutdown to 3 s) | Click Retry during stopping. | No second child while the first process is alive. | both |
| I2-BVA-01 | BVA (timeout − 1 s) | R9 | F4 delays readiness to T − 1 s (T from OQ-07) | Boot. | Ready. | both |
| I2-BVA-02 | BVA (timeout, exact) | R9 | F4 delays readiness to T | Boot. | One defined outcome, either ready or failed with the timeout code; no orphan; the state stays consistent with O2. The outcome is recorded, not asserted (an exact boundary races). | both |
| I2-BVA-03 | BVA (timeout + 1 s) | R9 | F4 delays readiness to T + 1 s | Boot. | Failed with the timeout code (OQ-07); the child is stopped; no attach. | both |
| I2-BVA-04 | BVA (migrations: 0) | R2 | Fresh home | Boot twice. | Zero backups. | both |
| I2-BVA-05 | BVA (migrations: 1) | R2 | Base-only seed | Boot, then boot again. | Exactly one backup after both boots, and its bytes are unchanged by the second boot. | both |
| I2-BVA-06 | BVA (migrations: 2) | R2 | After I2-BVA-05, overwrite the manifest with base-only again | Boot. | The first backup's bytes are unchanged (never overwritten). Whether a second backup file is created: OQ-08. | both |

**Decision table** (manifest form → resulting bundles and backup); the rules also cover the EP partitions of §18.2:

| Rule | Manifest before | Bundles after | Backup | Case |
| --- | --- | --- | --- | --- |
| 1 | absent | `[base, web-app]` | none | I2-DT-01 |
| 2 | `[base]` | `[base, web-app]` | one, equal to the old bytes | I2-DT-02 |
| 3 | `[base, web-app]` | unchanged | none | I2-DT-03 |
| 4 | `[base, web-app, ownerA, ownerB]` | unchanged, order kept | none | I2-DT-04 |
| 5 | `[base, ownerA, ownerB]` | `web-app` added; `ownerA` before `ownerB`; position of `web-app` OQ-08 | one | I2-DT-05 |
| 6 | malformed (invalid JSON; `bundles` not an array; non-string entry) | OQ-08 | OQ-08 | I2-DT-06 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I2-DT-01 | DT r1 / EP absent | R1 | No child home | Boot. | Rule 1 (same run as I2-P-01). | both |
| I2-DT-02 | DT r2 / EP base-only | R2 | Seed `[base]` | Boot. | Rule 2 (same run as I2-P-02). | both |
| I2-DT-03 | DT r3 / EP base+web | R2 | Seed `[base, web-app]`, byte copy | Boot. | Manifest byte-identical; no backup; ready. | both |
| I2-DT-04 | DT r4 / EP base+web+owner | R3 | Seed `[base, web-app, fbtest-owner-a, fbtest-owner-b]` (two local test bundles that journal their `apply`) | Boot. | Manifest byte-identical; no backup; both owner rows applied, `a` before `b`; ready. | both |
| I2-DT-05 | DT r5 | R2, R3 | Seed `[base, fbtest-owner-a, fbtest-owner-b]` | Boot. | Rule 5; both owner rows applied; ready. | both |
| I2-DT-06 | DT r6 / EP malformed | R2 | Seed each malformed variant in turn | Boot each time. | OQ-08. Pass conditions that hold whatever OQ-08 says: the main boot succeeds; no orphan; the malformed file is not lost without a backup. | both |

---

## 5. I3 — proxy v2: token exchange on the server, WebSocket passthrough

**R** (from §18.2 I3, §0.5, §3.1–§3.6, §11):
- I3-R1: every `/fishball/embed/*` GET, HEAD and POST is forwarded with Host and Origin set to the
  child's authority and the child cookie attached.
- I3-R2: `Set-Cookie` from the child never reaches the browser.
- I3-R3: `api/remote.mux` upgrades pass through.
- I3-R4: requests that fail the main DSH's admission (not same-origin; not authenticated) get
  403/401 and never reach the child.
- I3-R5: the main DSH's cookie never reaches the child.
- I3-R6: no token in any URL or page storage. The launch token and the child cookie never reach
  the browser, the disk or the logs (task brief).
- I3-R7: a child that is not ready answers 503 with the static error page (state, safe code,
  Retry); never a redirect.
- I3-R8: the limits hold: 1 MiB JSON body, 8 MiB upload, 32 concurrent streams, 30 s idle timeout.
- I3-R9: across a restart, the proxy exchanges the new token itself.
- I3-R10: only GET, HEAD and POST; no traversal, no encoded `..`, no absolute URL (§3.6).

**T:** P, EP, BVA, ST, DT, plus security (SEC).

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I3-P-01 | P (page) | R1 | Attached; F2 | Open the Fishball view. | `GET /fishball/embed/` gives 200 `text/html`; DSH's app shell renders in the iframe; every request under `/fishball/embed/` in the HAR is 2xx or 304. | both |
| I3-P-02 | P (assets) | R1 | As I3-P-01 | Inspect the HAR for `plugins/??…` combo requests and static assets. | 200 with the right content types; the page has no failed module load in its console. | both |
| I3-P-03 | P (RPC) | R1 | As I3-P-01 | Inspect `POST /fishball/embed/api/*` RPC requests made by the page. | 2xx with JSON results from the child (the session view gets its data). | both |
| I3-P-04 | P (WebSocket) | R3 | As I3-P-01; F3 | In the HAR, find the upgrade to `/fishball/embed/api/remote.mux`. Send a message in Fishball's chat. | 101 Switching Protocols; frames flow both ways; the fake model's reply streams into the iframe. | both |
| I3-P-05 | P (header rewrite) | R1, R5 | F4a | From the main page, `fetch('/fishball/embed/__fbtest/echo', {method:'POST', body})`. | The probe sees Host = `127.0.0.1:<childPort>`, Origin = `http://127.0.0.1:<childPort>`, a Cookie with the child's cookie only, and no Authorization of the main DSH. The body sha256 equals the sent one. | both |
| I3-P-06 | P (HEAD) | R1 | F4a | `HEAD /fishball/embed/__fbtest/echo`. | 200; no body; the probe journals method HEAD. | both |
| I3-P-07 | P (iframe URL) | R6 | Attached | Read the iframe's `src` and the iframe document's `location.href`. | Both are `http://127.0.0.1:<mainPort>/fishball/embed/` with no query and no fragment. | both |
| I3-P-08 | P (CSP/framing headers) | R6 | Attached | Read the response headers of `GET /fishball/embed/`. | The §3.3 headers: `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Whether §3.3 still applies under Option A: OQ-12. | both |
| I3-EP-01 | EP (method PUT) | R10 | Valid main cookie, same-origin | `PUT /fishball/embed/__fbtest/echo`. | Refused (405 expected, OQ-11); the probe journals nothing. | both |
| I3-EP-02 | EP (method DELETE) | R10 | As I3-EP-01 | `DELETE …/echo`. | As I3-EP-01. | both |
| I3-EP-03 | EP (other methods: PATCH, OPTIONS) | R10 | As I3-EP-01 | Send each. | As I3-EP-01. | both |
| I3-EP-04 | EP (site: cross-site) | R4 | Valid cookie | `GET …/echo` with `Sec-Fetch-Site: cross-site` and `Origin: http://evil.test`. | 403; probe journals nothing. | both |
| I3-EP-05 | EP (site: same-site, other port) | R4 | Valid cookie | `Sec-Fetch-Site: same-site`, `Origin: http://127.0.0.1:<otherPort>`. | 403; nothing reaches the child. | both |
| I3-EP-06 | EP (site: `none`) | R4 | Valid cookie | `Sec-Fetch-Site: none` (a typed URL or "Open in a tab"). | 403 by the §3.1 rule (OQ-11); nothing reaches the child. | both |
| I3-EP-07 | EP (site header absent) | R4 | Valid cookie | No `Sec-Fetch-Site` header (a non-browser client). | Refused (OQ-11); nothing reaches the child. | both |
| I3-EP-08 | EP (auth: none) | R4 | Same-origin headers, no cookie | `GET /fishball/embed/`. | 401; nothing reaches the child. | both |
| I3-EP-09 | EP (auth: expired or forged) | R4 | A cookie value from an earlier, ended main process; then a tampered value | `GET /fishball/embed/` with each. | 401; nothing reaches the child. | both |
| I3-EP-10 | EP (auth: the child's cookie instead of the main cookie) | R4, R6 | The child cookie name and value seen by F4a | Send it as the only cookie to `/fishball/embed/`. | 401; the child cookie is no way past the main admission. | both |
| I3-EP-11 | EP (path: raw `..`) | R10 | Valid cookie; raw socket so no client normalizes the path | `GET /fishball/embed/../api/…` and `GET /fishball/embed/ui/../../x`. | Refused (400 or 404, OQ-11); the probe and the child journal nothing; no main route outside the prefix is reached. | both |
| I3-EP-12 | EP (path: encoded `..`) | R10 | As I3-EP-11 | `%2e%2e/`, `%2E%2E%2F`, `..%2f`, `%252e%252e%252f`, `..%5c`. | As I3-EP-11. | both |
| I3-EP-13 | EP (absolute URL in the request target) | R10 | As I3-EP-11 | `GET http://127.0.0.1:<childPort>/ HTTP/1.1` and `GET http://evil.test/fishball/embed/`. | Refused; nothing reaches the child. | both |
| I3-EP-14 | EP (prefix look-alike) | R10 | Valid cookie | `GET /fishball/embedx/` and `GET /fishball/embe`. | Not proxied (the main DSH's 404); nothing reaches the child. | both |
| I3-EP-15 | EP (no trailing slash) | R1 | Valid cookie | `GET /fishball/embed`. | OQ-12 (served or redirected to `/fishball/embed/`); if redirected, the `Location` carries no token. | both |
| I3-EP-16 | EP (WebSocket from a foreign origin) | R3, R4 | Valid cookie | Upgrade `/fishball/embed/api/remote.mux` with `Origin: http://evil.test`. | Refused before any upgrade (no 101); nothing reaches the child. | both |
| I3-EP-17 | EP (WebSocket without auth) | R3, R4 | No cookie | Upgrade with same-origin Origin. | Refused (401); nothing reaches the child. | both |
| I3-EP-18 | EP (browser-supplied `token` query) | R6 | Valid cookie | `GET /fishball/embed/?token=AAAA`. | No authentication path opens and no child cookie reaches the browser. Strip, refuse or forward: OQ-12. | both |
| I3-BVA-01 | BVA (JSON body min − 1) | R8 | — | n/a: a body cannot be shorter than 0 bytes. | — | — |
| I3-BVA-02 | BVA (JSON body min = 0) | R8 | F4a | POST an empty JSON body to `…/echo`. | Forwarded; the probe sees length 0. | both |
| I3-BVA-03 | BVA (JSON body max − 1 = 1 048 575 B) | R8 | F4a | POST. | Forwarded intact (sha256 matches). | both |
| I3-BVA-04 | BVA (JSON body max = 1 048 576 B) | R8 | F4a | POST. | Forwarded intact. | both |
| I3-BVA-05 | BVA (JSON body max + 1 = 1 048 577 B) | R8 | F4a | POST. | Refused (413 expected, OQ-11); the probe journals no request and no partial body. | both |
| I3-BVA-06 | BVA (upload min = 0) | R8 | The upload route (OQ-12) | Upload 0 bytes. | Passed to the child, which answers with its own result (no proxy refusal). | both |
| I3-BVA-07 | BVA (upload max = 8 388 608 B) | R8 | As I3-BVA-06 | Upload exactly 8 MiB. | Forwarded intact. | both |
| I3-BVA-08 | BVA (upload max + 1) | R8 | As I3-BVA-06 | Upload 8 MiB + 1 B. | Refused (OQ-11); nothing reaches the child. | both |
| I3-BVA-09 | BVA (streams min = 1) | R8 | Attached | Open one stream through the proxy. | Accepted. | both |
| I3-BVA-10 | BVA (streams max = 32) | R8 | Attached; streams per OQ-12 (mux WebSockets or SSE) | Hold 32 streams open. | All 32 work. | both |
| I3-BVA-11 | BVA (streams max + 1 = 33) | R8 | 32 open | Open a 33rd. Then close one and open another. | The 33rd is refused (code OQ-11); the 32 keep working. After one closes, a new one is accepted. | both |
| I3-BVA-12 | BVA (idle 29 s / 30 s / 31 s) | R8 | One stream through the proxy; a child probe that sends nothing for the stated time with heartbeats suppressed (if the stream type allows) | Measure when the proxy closes the stream. | Open at 29 s; closed at or after 30 s and by 31 s. Whether it applies to `remote.mux`: OQ-12. | both |
| I3-ST-01 | ST (not ready) | R7 | F4 holds readiness for 20 s | During starting, `GET /fishball/embed/`. | 503 with the static error page (state, safe code, Retry); no `Location`; no token, child port or path in the body. | both |
| I3-ST-02 | ST (ready → restarting → ready) | R9 | Attached; F4a cookie value C1 | Restart. During restarting, GET; after ready, GET `…/echo`. | 503 during restarting. After ready: 200; the probe sees a new cookie C2 ≠ C1; the browser did nothing to log in again. | both |
| I3-ST-03 | ST (WebSocket across a restart) | R3, R9 | Page open with mux connected | Restart. | The mux closes; the page reconnects through the proxy to the new child; Fishball's session is shown again with its history. | both |
| I3-ST-04 | ST (instance disabled) | R7 | Attached | Disable the instance; `GET /fishball/embed/`. | 503 or 404 (OQ-13); nothing is proxied; no redirect. | both |
| I3-ST-X1 | ST (invalid: stale cookie after a restart) | R9 | As I3-ST-02 | Over 20 requests after ready, journal the Cookie seen by the probe. | C1 never appears after the restart. | both |

**Decision table** (method × site × auth → status). "—" = any value.

| Rule | Method | `Sec-Fetch-Site` | Main auth | Status | Reaches child | Case |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | GET, HEAD or POST | same-origin | valid | proxied (child's status) | yes | I3-DT-01 |
| 2 | — | cross-site | — | 403 | no | I3-DT-02 |
| 3 | — | `none` or absent | — | 403 (OQ-11) | no | I3-DT-03 |
| 4 | GET, HEAD or POST | same-origin | none | 401 | no | I3-DT-04 |
| 5 | GET, HEAD or POST | same-origin | expired or forged | 401 | no | I3-DT-05 |
| 6 | PUT, DELETE or other | same-origin | valid | 405 (OQ-11) | no | I3-DT-06 |
| 7 | PUT, DELETE or other | same-origin | none or expired | 401 or 405 (precedence OQ-11) | no | I3-DT-07 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I3-DT-01 | DT r1 | R1 | F4a | Send each of GET, HEAD and POST. | Rule 1 for each. | both |
| I3-DT-02 | DT r2 | R4 | F4a | Cross-site × {GET, POST, PUT} × {valid, none}. | Rule 2 for all six. | both |
| I3-DT-03 | DT r3 | R4 | F4a | {`none`, absent} × {GET, POST} × valid. | Rule 3 for all four. | both |
| I3-DT-04 | DT r4 | R4 | F4a | Same-origin × {GET, HEAD, POST} × no cookie. | Rule 4. | both |
| I3-DT-05 | DT r5 | R4 | F4a | Same-origin × {GET, POST} × {expired, forged}. | Rule 5. | both |
| I3-DT-06 | DT r6 | R10 | F4a | Same-origin × {PUT, DELETE, PATCH} × valid. | Rule 6. | both |
| I3-DT-07 | DT r7 | R4, R10 | F4a | Same-origin × {PUT, DELETE} × {none, expired}. | Never 2xx; never reaches the child; record the status for OQ-11. | both |

**Security** (the launch token and the child cookie never reach the disk, the logs or the browser):

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I3-SEC-01 | EP (browser URLs) | R6 | F2, F4b, F4a; a scripted run: open the view, chat, open `?view=settings`, Restart, crash + Retry | Search every URL, `Location` and `Referer` in the HAR. | No launch token of any generation; no `token=` query parameter anywhere. | both |
| I3-SEC-02 | EP (`Set-Cookie`) | R2 | As I3-SEC-01 | Check every response to the browser under `/fishball/embed/` (including those around the exchange and after the restart) and the browser cookie jar for `127.0.0.1`. | No `Set-Cookie` from the child in any response. The jar holds only the main DSH's cookie(s); no cookie with the child's name or value. | both |
| I3-SEC-03 | EP (bodies and frames) | R6 | As I3-SEC-01 | Search every response body and every WebSocket frame sent to the browser for the token and the child cookie value. | Zero hits. | both |
| I3-SEC-04 | EP (browser storage) | R6 | As I3-SEC-01 | Dump `document.cookie`, localStorage, sessionStorage, IndexedDB and Cache Storage of the main page and the iframe. | Zero hits for the token and the child cookie. | both |
| I3-SEC-05 | EP (disk) | R6 | As I3-SEC-01, then main shutdown | F5 over the main home, the child home and temp directories. | Zero hits for every token generation and every child cookie value. | both |
| I3-SEC-06 | EP (logs, including after a crash) | R6 | As I3-SEC-01, with a SIGKILL during a proxied request | F5 over main stdout/stderr, `child-stderr.log`, `child-stderr.log.1`, `lifecycle.log` and DSH's log directories. | Zero hits; no `Authorization`/`Cookie` value with a secret in any line. | both |
| I3-SEC-07 | EP (process list) | R6 | Attached | `ps eww` for the main and child processes. | No token or child cookie in any argv or environment. | both |
| I3-SEC-08 | EP (main cookie to the child) | R5 | F4a; main cookie value M | Through the proxy: the page load, an RPC POST, and the mux upgrade (an echo route for upgrades in F4a). | The probe never sees M or the main cookie's name, in Cookie or any other header. | both |
| I3-SEC-09 | EP (error and refusal bodies) | R7, R6 | I3-ST-01, I3-EP-04, I3-EP-08, I3-BVA-05 bodies | Search the bodies. | No token, no child port, no file path, no URL with credentials (§11). | both |
| I3-SEC-10 | EP (Referer to the child) | R5 | F4a | Load the iframe, then navigate within it. | Any `Referer` the probe sees names no main-page path with a query or secret (`Referrer-Policy`, OQ-12). | both |

---

## 6. I4 — the child UI plugin: session-only frame, effort selector and the Settings button

**R** (from §18.2 I4 and §0.5):
- I4-R1: the page shows only Fishball's session: no sidebar session list, no New Session, no
  workspace picker, no permission picker (and no agent-preset picker, since `ui-agent-preset` is
  disabled).
- I4-R2: the rail of about 56 px is allowed (D19).
- I4-R3: DSH's model picker is present. For a model with reasoning efforts it offers the effort
  pane, and the chosen effort is used by the next request.
- I4-R4: the session header has a Settings action that opens the settings panel; the panel has a
  back action to the chat.
- I4-R5: loading `?view=settings` opens the panel directly; an unknown `view` shows the chat.
- I4-R6: reload keeps the view of the URL.
- I4-R7: the session opens even when the session list arrives late.

**T:** P, EP, ST, DT. rc.5: the session-only frame is unproven there until SP1 (OQ-22).

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I4-P-01 | P | R1 | Attached; F2 | Open the Fishball view. | The iframe shows DSH's conversation view of one session whose id starts with `session-fishball-`. | both |
| I4-P-02 | P | R1 | As I4-P-01 | Query the iframe DOM by role and accessible name for: the sidebar session list, "New session", the workspace picker, the permission picker, the agent-preset picker. | None is in the DOM (absent, not just hidden). | both |
| I4-P-03 | P | R2 | As I4-P-01; viewport 1280 × 800 | Measure the left rail's width; list its interactive elements. | Width about 56 px (tolerance OQ-14); no session list or New Session inside it. | both |
| I4-P-04 | P | R3 | Child catalog has `fake-effort` and `fake-plain` (F3, via Refresh models) | Open the composer's model picker. | DSH's model picker is present and lists both models. | both |
| I4-P-05 | P | R3 | As I4-P-04 | Select `fake-effort`; open the effort pane. | The pane offers exactly `low`, `medium` and `high`. | both |
| I4-P-06 | P | R3 | As I4-P-05 | Choose `high`; send a message. | The next request in the session log (O4) and the fake model's journal both carry effort `high`. | both |
| I4-P-07 | P | R4 | As I4-P-01 | Find the Settings action in the session header; click it. Then click the panel's back action. | The settings panel replaces the conversation in the main area; back returns to the same session's conversation, with its history. | both |
| I4-P-08 | P | R5 | Attached | Load `/fishball/embed/?view=settings` (the `ui.settings` path). | The settings panel shows directly, without the chat shown first. | both |
| I4-P-09 | P | R7 | F2 with request interception delaying the session-list data by 3 s (the RPC or mux frames that carry it) | Open the Fishball view. | After the delay, Fishball's session opens; no empty, "choose a session" or New Session state remains. | both |
| I4-EP-01 | EP (model without efforts) | R3 | As I4-P-04 | Select `fake-plain`; send a message. | No effort pane is offered; the request carries no reasoning effort. | both |
| I4-EP-02 | EP (unknown `view`) | R5 | Attached | Load `?view=foo`. | The chat. | both |
| I4-EP-03 | EP (empty `view`) | R5 | Attached | Load `?view=`. | The chat, treating it as unknown (OQ-14). | both |
| I4-EP-04 | EP (case and repeats) | R5 | Attached | Load `?view=SETTINGS`, then `?view=settings&view=chat`. | OQ-14; record the result. | both |
| I4-EP-05 | EP (hidden features by keyboard) | R1 | As I4-P-01 | Press DSH's shortcuts for New Session, generic settings and the permission mode inside the iframe. | No new session is created; no permission change. Generic settings: OQ-15 (SP3). | both |
| I4-ST-01 | ST chat → settings → chat | R4 | Chat | Header Settings, then Back. | Settings, then Chat; one panel at a time. | both |
| I4-ST-02 | ST settings (URL) → chat | R4, R5 | Loaded with `?view=settings` | Back. | Chat. The URL afterwards: OQ-14. | both |
| I4-ST-03 | ST reload in chat | R6 | Chat at `/fishball/embed/` | Reload the iframe. | Chat, same session. | both |
| I4-ST-04 | ST reload in settings (URL) | R6 | At `?view=settings` | Reload. | Settings. | both |
| I4-ST-05 | ST reload after the header action | R6 | Opened settings with the header action | Reload. | The view the URL names (OQ-14: whether the action changes the URL). | both |
| I4-ST-X1 | ST (invalid: a second settings panel) | R4 | Settings open | Look for the header Settings action; trigger the settings opening again if reachable. | At most one settings panel; no stacked panels. | both |
| I4-ST-X2 | ST (invalid: back in chat) | R4 | Chat | Look for the panel's back action. | None in the chat view. | both |

**Decision table** (model has efforts × effort chosen → the request's effort):

| Rule | Model declares efforts | Effort chosen | Effort in the next request | Case |
| --- | --- | --- | --- | --- |
| 1 | yes | yes (`high`) | `high` | I4-DT-01 |
| 2 | yes | no | the model default (meaning: OQ-14) | I4-DT-02 |
| 3 | no | — (no pane) | none | I4-DT-03 |
| 4 | no, after `high` was chosen on an effort model | — | none | I4-DT-04 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I4-DT-01 | DT r1 | R3 | `fake-effort` | Choose `high`; send. | Rule 1 (same check as I4-P-06). | both |
| I4-DT-02 | DT r2 | R3 | `fake-effort`, no effort ever chosen in this session | Send. | Rule 2; record the effort sent for OQ-14. | both |
| I4-DT-03 | DT r3 | R3 | `fake-plain` | Send. | Rule 3. | both |
| I4-DT-04 | DT r4 | R3 | `fake-effort` with `high`, then switch to `fake-plain` | Send. | Rule 4. | both |

---

## 7. I5 — Fishball's session from an agent preset

**R** (from §18.2 I5, §0.5 and §8.4):
- I5-R1: the session is created once, with id `session-fishball-<uuid>`.
- I5-R2: preset `fishball`, registered with `agentPresetRegistry.register` (persona, Fishball's
  tools, read-only, approval ask).
- I5-R3: sandbox read-only and approval ask; a write tool fails at the sandbox.
- I5-R4: it is inside the instance's private workspace (registered with
  `workspaceRegistry.create(realpath)` and attached), and never shows "Choose workspace".
- I5-R5: after a child restart, a resume by DSH's session controller, or a page reload, the
  persona, Fishball's tools and read-only mode are present.
- I5-R6: no permission change is possible from the UI, and the child refuses any request that
  would change the preset (§8.4).
- I5-R7: exactly one Fishball session exists after any number of restarts.

**T:** P, ST, EP, DT.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I5-P-01 | P | R1, R2, R3, R4 | Fresh child home; F4c | Boot; wait for ready. List the child's sessions. Read the session's header and log (O4), `workspaceRegistry` and the workspace's sessions. | Exactly one session. Its id matches `session-fishball-` followed by a canonical lowercase UUID. Preset `fishball`; the log holds sandbox `read-only` and approval `ask`. Its cwd is a folder in the child home whose realpath is a registered workspace, and the session is attached to it. | both |
| I5-P-02 | P | R2 | Ready; F4c | `agentPresets.list()` in the child. | Contains `fishball`. | both |
| I5-P-03 | P | R2, R5 | Ready; F3 | Send one message; read the fake model's journal for that request. | The system text has Fishball's persona (its documented sections, e.g. "Asking the user"). The tool list equals Fishball's documented tool set and has no file-write or permission tool. | both |
| I5-P-04 | P | R3 | Ready; F3 scripts a call to a file-write tool (one available to the session, e.g. DSH's write tool) in the private workspace | Send a message. | The tool result is a sandbox refusal; no file is created. | both |
| I5-P-05 | P | R6 | Ready | Through the proxy, call the DSH RPC that sets the session's sandbox mode or permission preset (found from DSH's public API). | Refused; the log still shows `read-only`/`ask`; the next request still has the read-only tools. | both |
| I5-P-06 | P | R4 | Fresh and after a restart | Look in the iframe DOM for "Choose workspace" or the workspace hero. | Never present. | both |
| I5-P-07 | P | R1 | Main home with three main sessions | Compare ids. | No main session id starts with `session-fishball-`; the Fishball session id appears in no main session list. | both |
| I5-ST-01 | ST none → created → live | R1 | Fresh child home | Boot. | Created once and live (same run as I5-P-01). | both |
| I5-ST-02 | ST live → child restart → resumed | R5, R7 | Live, id S | Restart; send a message. | The same id S; persona and tools in the request equal those of I5-P-03; still one session. | both |
| I5-ST-03 | ST restart × 5 | R7 | Live | Restart five times; then kill and Retry twice. | Exactly one session with the prefix; same id throughout. | both |
| I5-ST-04 | ST live → archived | R7 | Live | Archive the session through the child's DSH RPC. | OQ-16 (allowed or refused). If refused: still live. | both |
| I5-ST-05 | ST archived → next start | R7 | After I5-ST-04, if archive is allowed | Restart. | OQ-16 (unarchived and reused, or a new session); in every case exactly one non-archived Fishball session. | both |
| I5-ST-X1 | ST (invalid: double create) | R1, R7 | Fresh child home | Restart twice within 1 s of the first ready. | Still exactly one session. | both |

**Decision table** (resume path × preset registered → tools and persona); the rules also cover the EP partitions of §18.2:

| Rule | Resume path | Preset `fishball` registered | Tools and persona | Read-only | Case |
| --- | --- | --- | --- | --- | --- |
| 1 | Fishball's own (child restart) | yes | present, same as first start | yes | I5-DT-01 |
| 2 | DSH's session controller | yes | present, same | yes | I5-DT-02 |
| 3 | page reload | yes | present, same | yes | I5-DT-03 |
| 4 | any | no | OQ-16 | must stay read-only | I5-DT-04 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I5-DT-01 | DT r1 / EP own path | R5 | Live | Restart; send. | Rule 1: the tool set and persona sections equal I5-P-03's. | both |
| I5-DT-02 | DT r2 / EP controller path | R5 | Live; the session unloaded (F4c asks the controller to dispose it, or it idles out) | F4c calls `sessionController.resolveAgent(id)`; send through the UI. | Rule 2. | both |
| I5-DT-03 | DT r3 / EP reload path | R5 | Live | Reload the iframe; send. | Rule 3. | both |
| I5-DT-04 | DT r4 | R2, R3 | A way to resume before the preset exists (if any) | — | OQ-16; whatever happens, the sandbox stays `read-only`. | both |

---

## 8. I6 — the instance settings page (revised by UD2 and UD3)

**R** (§18.2 I6 and §0.7, revised by UD2 and UD3):
- I6-R1: the page shows the instance status and Restart; Restart restarts the child and the page
  reconnects.
- I6-R2: the model block has Refresh models and the synced result line (§10); Refresh fills the
  composer's model list; Details lists the skipped and failed items; the button is disabled while
  the child is not running; concurrent clicks share one run; a second run writes nothing.
- I6-R3: the instance's plugins: list, install, enable, disable, remove, settings and
  recommended. All of it targets the child profile.
- I6-R4 (UD3): connector settings are **not editable** on the page; at most they show read-only,
  equal to DSH's own form for `fishball-connector`. The page never changes them.
- I6-R5 (UD2): every instance setting is stored in the instance's own profile and shown on this
  page; the main DSH gets only the sync options (OQ-04).
- I6-R6: a refusal shows its code inline.
- I6-R7: nothing on the page writes to the main DSH except the two upward wire requests
  (`instance.restart`, `providerSync.request`).
- I6-R8: light and dark.

**T:** P, EP, BVA, ST, DT. Removed by UD3: §18.2's connector-value EP (valid/invalid/stale), the
BVA at min − 1 on connector fields, and the save states idle → saving → saved/refused for
connector values.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I6-P-01 | P | R1–R4 | Attached | Open `?view=settings`, and separately the header Settings action. | Status block (ready) with Restart; model block with Refresh models; plugins block. Connector settings either absent or read-only (OQ-05), with no input, select, switch or Save bound to a connector key. | both |
| I6-P-02 | P | R1 | Settings open | Click Restart. | Status shows restarting, then ready. The child PID changes. The page reconnects by itself and works (its next action succeeds). Fishball's session keeps its id. | both |
| I6-P-03 | P | R2 | F3 fake API-key provider in the main home; child has none | Click Refresh models. | The result line reads per §10 ("Synced from DSH: 1 new · 0 already in Fishball"). The composer's model picker lists the fake models. The F3 key never appears in the HAR or browser storage (F5). | both |
| I6-P-04 | P | R2 | After I6-P-03 | Click Refresh models again. | Nothing new is written (the child's credential records are unchanged); the line reports 0 new and the count already present. | both |
| I6-P-05 | P | R2 | Main home with, besides F3: one OAuth (grant) provider, one with unset `apiKeyEnv`, one with a custom header | Refresh models; open Details. | Collapsed Details lists `oauth-login`, `api-key-env-unset` and `unsupported-provider` with their reasons; the main line counts only the API-key additions. | both |
| I6-P-06 | P | R3 | A local test plugin package; main manifest byte copy | Install it by spec from the page. | It appears in the page's list and in the child profile; the main manifest is byte-identical. | both |
| I6-P-07 | P | R3 | After I6-P-06 | Disable, enable, then remove it from the page. | Each change shows in the list and in the child profile; the main profile is unchanged. | both |
| I6-P-08 | P | R3, R5 | A test plugin with one setting | Change the setting on the page. | Stored in the child profile; nothing changes in the main home. | both |
| I6-P-09 | P | R3 | Offline recommended source (OQ-17) | Open the recommended section. | It shows its entries or a defined empty/error state, without a network call outside the test. | both |
| I6-P-10 | P | R4 | Connector settings shown read-only (if OQ-05 keeps them) | Change a connector limit in DSH's own form for `fishball-connector`; reload the settings page. | The page shows the new value read-only and offers no way to change it. If OQ-05 drops the block: no connector values on the page at all. | both |
| I6-P-11 | P | R7 | Byte copies of the main manifest, the `fishball-connector` row config with its revision (O3), and the main credential store | Run every page action: Restart, Refresh ×2, the plugin install/enable/disable/remove, a plugin setting change. | The main manifest, the connector config and revision, and the main credential store are unchanged. | both |
| I6-P-12 | P | R5 | Attached | Open DSH's Plugins page → `fishball-instance` settings form in the main DSH. | It shows only sync options (UD2; exact set OQ-04); no instance setting from the instance page is duplicated there. | both |
| I6-P-13 | P | R8 | Main theme light, then dark (I9 if delivered; otherwise the child's own) | Screenshot the settings page in each. | All blocks legible in both; no hard-coded colour clash; focus rings visible. | both |
| I6-EP-01 | EP (connector edit attempt) | R4 | Attached | Search the page's DOM for editable controls of any `settings.describe` key; try keyboard focus on each connector value. | None is editable. O3's revision is unchanged after the whole I6 run. | both |
| I6-EP-02 | EP (no keys to sync) | R2 | Main home without API-key providers | Refresh models. | No failure; the line shows 0 new (wording OQ-17); the composer list is unchanged. | both |
| I6-EP-03 | EP (sync refused or failed) | R2, R6 | A Restart started during the sync (the child identity changes) | Refresh models; restart mid-run. | A whole-run failure shows inline with its code and Retry; after ready, Retry completes. | both |
| I6-EP-04 | EP (unknown plugin spec) | R3, R6 | Offline | Install `fbtest-does-not-exist`. | Refused inline with its code; the child profile is unchanged. | both |
| I6-EP-05 | EP (malformed spec: empty, only spaces) | R3, R6 | — | Try to install each. | Refused before or by the child, with a code; no change. | both |
| I6-BVA-01 | BVA (connector field at min, display) | R4 | DSH's form sets one connector numeric limit to its min | Open the page. | Shown read-only and equal to the form, or not shown (OQ-05). min − 1 and max + 1 are DSH's form's refusals (C2 scope): n/a here. | both |
| I6-BVA-02 | BVA (connector field at its default/max) | R4 | DSH's form at the default | Open the page. | As I6-BVA-01. | both |
| I6-BVA-03 | BVA (providers to sync: 0) | R2 | — | Same run as I6-EP-02. | — | both |
| I6-BVA-04 | BVA (providers to sync: 1) | R2 | — | Same run as I6-P-03. | — | both |
| I6-BVA-05 | BVA (providers to sync: many = 5) | R2 | Five fake API-key providers | Refresh. | "5 new · 0 already"; all five models in the composer. | both |
| I6-ST-01 | ST ready → restarting → ready (page open) | R1 | Settings open | Restart; watch the controls. | While restarting: actions disabled or unavailable (presentation OQ-17); after ready: enabled. | both |
| I6-ST-02 | ST Refresh idle → running → done, with a concurrent click | R2 | F3 | Click Refresh twice within 100 ms. | The button is disabled while running; one run (one record per provider in the child); one result line. | both |
| I6-ST-03 | ST Refresh → failed → Retry → done | R2 | As I6-EP-03 | — | Same run as I6-EP-03. | both |
| I6-ST-04 | ST plugin idle → busy → done / refused → idle | R3, R6 | — | Install a valid one, then an unknown one, then a valid one again. | Done, refused (with code), done; the control is usable again after each. | both |
| I6-ST-X1 | ST (invalid: Restart while restarting) | R1 | Restarting | Click Restart again. | No second restart: exactly one new child PID. | both |
| I6-ST-X2 | ST (invalid: Refresh while the child is not running) | R2 | Restarting | Try Refresh. | Disabled with a hint (§10); no sync starts. | both |

**Decision table** (action × instance state → control and result):

| Rule | Action | Instance state (page open) | Control | Result | Case |
| --- | --- | --- | --- | --- | --- |
| 1 | Restart | ready | enabled | new child; page reconnects | I6-DT-01 |
| 2 | Refresh models | ready | enabled | sync runs (§10) | I6-DT-02 |
| 3 | plugin install/enable/disable/remove/settings | ready | enabled | applied in the child profile | I6-DT-03 |
| 4 | any of the above | restarting | disabled or not available (OQ-17) | no effect | I6-DT-04 |
| 5 | connector setting edit | any | not offered (UD3) | nothing changes (O3 unchanged) | I6-DT-05 |

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I6-DT-01 | DT r1 | R1 | Ready | Restart. | Rule 1 (with I6-P-02). | both |
| I6-DT-02 | DT r2 | R2 | Ready | Refresh. | Rule 2 (with I6-P-03). | both |
| I6-DT-03 | DT r3 | R3 | Ready | Each plugin action. | Rule 3 (with I6-P-06..08). | both |
| I6-DT-04 | DT r4 | R1–R3 | Restarting | Try each action. | Rule 4. | both |
| I6-DT-05 | DT r5 | R4 | Ready and restarting | Look for connector edits. | Rule 5 (with I6-EP-01). | both |

---

## 9. I7 — card records and notices in DSH's chat view

**R** (from §18.2 I7 and §15 wave 5, card records):
- I7-R1: card records (`plugin:fishball/card-record`) and inbox notices in Fishball's session
  render as one compact row each, in order, naming the asking session, and expand to the full card.
- I7-R2: the same records still render in main sessions through the connector.
- I7-R3: both renderers come from one shared module: the same record gives the same row on both
  sides.
- I7-R4: records survive a child restart and a page reload; there are no duplicates after a reconnect.
- I7-R5: records never enter a model request.
- I7-R6: placement: an answer given in the asking session itself gets no session copy; Fishball's
  own `ask_user` card has only Fishball's copy; a session not loaded when its card closes gets no
  session copy.
- I7-R7: a text over its cap is cut by the writer, and the row shows the cut marker.

**T:** P, EP, BVA, ST.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I7-P-01 | P | R1, R2 | A managed main session S asks a permission; Fishball (scripted) allows it once with a low risk and a reason | Look at Fishball's chat and at S. | One compact row in each, with the fixed wording for "Fishball allowed it once", naming S in Fishball's chat. | both |
| I7-P-02 | P | R1 | Three records A, B, C in that order (from three managed sessions) | Open Fishball's chat. | Three rows, in the order A, B, C, each naming its session. | both |
| I7-P-03 | P | R1 | After I7-P-01 | Expand the row on both sides. | The full card: tool, session, arguments where known, and the decision with its reason. | both |
| I7-P-04 | P | R3 | After I7-P-01 | Compare the row's text, icon and expanded content on the two sides. | Identical. | both |
| I7-P-05 | P | R5 | After I7-P-01 and I7-P-02 | Send one more turn in Fishball's chat and one in S; read the fake model's journal. | No record text (wording, reason, labels) in either request. | both |
| I7-EP-01 | EP (permission answered by the user in S) | R6 | S asks; the user answers in S | — | Fishball's copy only; no record row in S (DSH already shows the answer there). | both |
| I7-EP-02 | EP (question answered by Fishball) | R1, R2 | S asks a question; Fishball answers | — | A row on both sides with the question wording and the chosen labels. | both |
| I7-EP-03 | EP (question answered by the user in S) | R6 | — | — | Fishball's copy only, with the user's labels or custom text. | both |
| I7-EP-04 | EP (plan review) | R1, R2 | S raises a plan review; Fishball approves with feedback | — | The plan-review wording on both sides. | both |
| I7-EP-05 | EP (own question, `ask_user`) | R6 | Fishball's `ask_user` card; the user answers it | — | A row in Fishball's chat only; no main session gets one. | both |
| I7-EP-06 | EP (closure) | R1, R2 | S's card closed by stopping S | — | A closure row with the closure reason on both sides. | both |
| I7-EP-07 | EP (skipped) | R1 | A question card skipped | — | A skipped row with its wording. | both |
| I7-EP-08 | EP (optional fields absent) | R1 | A permission answer with no note; a question with no custom text | Expand the rows. | No "undefined", "null" or empty label; the missing parts are simply not shown. | both |
| I7-EP-09 | EP (optional fields present) | R1 | Note and custom text present | Expand. | Both shown. | both |
| I7-EP-10 | EP (asking session not loaded at closure) | R6 | S not loaded; its card closed at a main restart | — | Fishball's copy only (the closure reason "DSH restarted…"). | both |
| I7-BVA-01 | BVA (reason/note: min − 1) | R7 | — | n/a (length < 0). | — | — |
| I7-BVA-02 | BVA (reason/note: min = 0, absent) | R7 | — | Same run as I7-EP-08. | — | both |
| I7-BVA-03 | BVA (reason/note: 499 characters) | R7 | Cap 500 (§5.2; which cap applies to records: OQ-18) | Fishball answers with a 499-character reason. | Shown in full, with no cut marker. | both |
| I7-BVA-04 | BVA (reason/note: max = 500) | R7 | — | 500 characters. | Shown in full, with no cut marker. | both |
| I7-BVA-05 | BVA (reason/note: max + 1 = 501) | R7 | A writer that receives 501 (if the bridge itself refuses 501 — §5.2 cap — this case moves to the record's own longer texts, OQ-18) | — | The row shows the writer's cut text with the cut marker. | both |
| I7-BVA-06 | BVA (session title 199 / 200 / 201 characters) | R7 | S's title of each length | — | 199 and 200 shown in full; 201 cut, with the marker. | both |
| I7-ST-01 | ST written → shown → child restart → shown | R4 | After I7-P-02 | Restart the child; reopen. | The same three rows, once each. | both |
| I7-ST-02 | ST shown → page reload | R4 | — | Reload the main page and the iframe. | Same rows, once each, on both sides. | both |
| I7-ST-03 | ST written while the child is off the wire | R4 | Instance disabled (or restarting) | S's card ends; then enable the instance. | After attach, Fishball's chat shows the row exactly once. | both |
| I7-ST-04 | ST two reconnects | R4 | After I7-ST-03 | Restart twice. | The row count is unchanged. | both |
| I7-ST-X1 | ST (invalid: a record before the card ends) | R1 | S's permission request still pending | Look at both chats. | No record row yet. | both |

---

## 10. I8 — retire the custom chat

**R** (from §18.2 I8 and the §18.1 owns column):
- I8-R1: removed: `src/slim/ui/**`, `child/{server,auth}.js`, the custom HTTP parts of
  `child/{chat,images,reminders,approvals}.js`, `child/decisions.js`,
  `src/slim/host/{admin,settings-routes}.js`, `src/native-control/**` and `packages/messenger/`.
  No reference to them is left.
- I8-R2: the old routes answer 404.
- I8-R3: every remaining feature works through Option A: the full suite and the E1 smoke pass on
  both versions.

**T:** P, EP.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I8-P-01 | P | R1 | The I8 branch | Static scan: list the removed paths; search every remaining file of both packages for imports or requires of them. | None of the paths exists; no import of any of them. | n/a (static) |
| I8-P-02 | P | R1 | — | `npm pack --dry-run` for both packages. | No removed path in either pack listing. | n/a (static) |
| I8-P-03 | P | R1 | — | Read the root `package.json` workspaces. | `packages/messenger` is not listed and does not exist. | n/a (static) |
| I8-P-04 | P | R3 | — | Run the full suite. | Green. | both |
| I8-P-05 | P | R3 | — | Run E1-B1, E1-B2 and E1-B6 as a smoke run. | Green. | both |
| I8-EP-01 | EP (old admin relay) | R2 | Valid main cookie, same-origin | GET and POST `/api/fishball/native/admin/status` (and any other subpath from OQ-19). | 404 for each. | both |
| I8-EP-02 | EP (old open route) | R2 | As I8-EP-01 | `POST /api/fishball/native/open`. | 404. | both |
| I8-EP-03 | EP (custom child endpoints through the proxy) | R2 | As I8-EP-01 | GET the old custom endpoints under `/fishball/embed/` (e.g. its SSE `api/events` and the custom `ui/*` modules; exact list OQ-19). | 404 from the child (or the proxy); never the old custom content. | both |
| I8-EP-04 | EP (old main settings routes) | R2 | As I8-EP-01 | Each route of the retired `settings-routes.js` (list OQ-19). | 404. | both |
| I8-EP-05 | EP (negative control: Option A routes still live) | R3 | As I8-EP-01 | `GET /fishball/embed/`, the mux upgrade, one RPC. | 200, 101, 2xx: retirement did not cut the live paths. | both |

---

## 11. I9 (optional) — theme and language follow the main DSH

**R:**
- I9-R1: the iframe uses the main page's light/dark choice and language when it opens.
- I9-R2: it follows after a change in the main page.

**T:** P, EP, ST. The EP partitions (theme light / dark / system; language zh / en) are written
as a decision table so that every combination is a rule.

| ID | T | R | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| I9-P-01 | P | R1 | Main DSH at its defaults | Open the Fishball view. | The iframe's theme and language equal the main page's (computed root colour scheme, `lang` attribute, a known UI string). | both |
| I9-DT-01 | DT / EP | R1 | Main light + en | Open. | Iframe light + en. | both |
| I9-DT-02 | DT / EP | R1 | Main light + zh | Open. | Iframe light + zh. | both |
| I9-DT-03 | DT / EP | R1 | Main dark + en | Open. | Iframe dark + en. | both |
| I9-DT-04 | DT / EP | R1 | Main dark + zh | Open. | Iframe dark + zh. | both |
| I9-DT-05 | DT / EP | R1 | Main system, OS emulated dark, en | Open. | Iframe dark + en. | both |
| I9-DT-06 | DT / EP | R1 | Main system, OS emulated light, zh | Open. | Iframe light + zh. | both |
| I9-ST-01 | ST light → dark | R2 | Iframe open | Change the main theme. | The iframe follows without being reopened (timing OQ-20). | both |
| I9-ST-02 | ST en → zh | R2 | Iframe open | Change the main language. | The iframe follows (OQ-20). | both |
| I9-ST-03 | ST system + OS flip | R2 | Main system | Flip the emulated OS scheme. | Both pages flip. | both |

---

## 12. E1 — end to end (E2E-B1..B8)

Every case runs in a fresh disposable main home (F1), once on each version, with the fake models
(F3) and no real key. E1-B5 is rewritten for UD3; E1-B1 adds UD4; E1-B1b is UD1.

| ID | T | Scenario | Preconditions | Steps | Expected | V |
| --- | --- | --- | --- | --- | --- | --- |
| E1-B1 | P | B1 | Clean profile; local packs | `dsh plugin add fishball-connector fishball-instance`; restart the main DSH; open the Fishball view. | DSH's session view with Fishball's session in the iframe. The profile manifest has no hand edit. The Plugins page lists `fishball-connector` and `fishball-instance` and no "Fishball" plugin (UD4). | both |
| E1-B1b | EP | B1 variant (UD1) | Clean profile | `dsh plugin add fishball-instance` only; restart; open the Plugins page. | Main boots; the instance shows `connector-missing` with its reason; no child process; `fishball-connector` is not installed. | both |
| E1-B2 | P | B2 | After B1; F3 provider in the main home | Settings page → Refresh models; choose `fake-effort` and `high`; send a message. | The result line shows the fake provider added; the reply streams into the iframe; the request carries `fake-effort` and `high`. | both |
| E1-B3 | P | B3 | After B2; a main session M | Hand over M with the note "tell me when the build passes"; script Fishball to call `message_session` to M. | The note reaches Fishball's chat as the user's words. M receives Fishball's message once. M shows the managed mark. | both |
| E1-B4 | P | B4 | After B3 | Script M to ask a permission; script Fishball to allow it once (low risk, reason). | M's tool runs. A card record row appears in M and in Fishball's chat, with the same wording (I7). | both |
| E1-B5 | P (rewritten, UD3) | B5 | After B1 | In DSH's own settings form for `fishball-connector`, change one limit, e.g. `maxQueuedInputs` from its default to 3. Open the instance settings page. Disable the instance; have M call `message_fishball` four times. | The form keeps the new value (O3). The instance page shows it read-only or not at all (OQ-05) and offers no edit. The new limit takes effect: the 4th queued input is refused with the connector's refusal (§0.4). | both |
| E1-B6 | P/ST | B6 | After B2 | SIGKILL the child. Look at the Fishball view. Click Retry. | The view shows the error state with the safe code and Retry; after Retry, the same Fishball session id comes back with its history. | both |
| E1-B7 | ST | B7 | After B3 | Disable `fishball-instance`. Script M to call `message_fishball` once. Re-enable the instance. | While disabled: the connector view shows "No Fishball instance is attached" with the Plugins link, and the call is accepted as queued. After re-enabling: Fishball's chat shows the message exactly once, and the fake model journal has exactly one request carrying it. | both |
| E1-B8 | P | B8 | Clean profile with `fishball-connector` and the stub instance F7 (§12.1) only | Boot. The stub attaches. Hand over M. Through the stub: `session.list`, `session.read` on M, `session.message` to M. M calls `message_fishball`. | The stub's journal shows: attach accepted; M listed; M's messages read; the message delivered to M once; one `inbox.push` with M's text, acked by the stub and not pushed again after a stub reconnect. The connector view shows what C3 defines for an instance without `ui`. | both |
| E1-B8b | EP | B8 variant | After B8 (stub attached) | Install and enable `fishball-instance`. | The built-in instance's attach is refused `instance-busy`; the stub stays attached and working. The built-in instance's status and child: OQ-03. | both |
| E1-B8c | ST | B8 variant | Stub not attached (stub disabled) | M calls `message_fishball` twice and `ask_fishball` once; enable the stub. | On attach, the stub receives the three items once each, in arrival order. | both |
| E1-SEC | EP | All | At the end of each version's E1 run | F5 over everything the run produced. | Zero hits for every launch token, every child cookie, the main cookie on the child side, and the F3 fake key. | both |

### 12.1 The stub instance (F7)

A minimal third-party instance in the test tree, used only by E1-B8, B8b and B8c:

- A DSH plugin package `fbtest-stub-instance` whose bundle patch inserts exactly one row of its own.
- It depends only on the connector's public `./contract` export and `docs/connector-contract.md`.
  It imports nothing from `packages/instance` (checked by a static scan in the test).
- At apply, it injects `fishballConnector` and calls `attachInstance({id: 'fbtest-stub', name:
  'Stub', contract: {id: 'fishball-connector', major: 1, minor: 0}, transport})`, with no `ui`.
- `transport` is in-process and has the four methods `send`, `onMessage`, `onClose` and `close`.
  It does the envelope-v2 handshake (§5), sends the session operations (`session.list`,
  `session.read`, `session.message`), and acks every `inbox.push`.
- It journals every frame in and out to a JSON-lines file in its own folder of the disposable home,
  and exposes the operations it should send through a test-only control (a file it watches or a
  test route), so a test drives it without touching the connector.
- `detach()` and a simulated transport close are test-controllable, for B8's reconnect check.

---

## 13. Traceability: acceptance criteria → cases

ACs are §18.2's, split one per line; UD rows are the user's decisions in §0.

| AC | Text | Cases |
| --- | --- | --- |
| I1-AC1 | Each transition observable through the instance status and the connector's attach count | I1-P-01, I1-P-03, I1-ST-01..12, I1-ST-X1..X5, I1-DT-01..07 |
| I1-AC2 | No orphan child after any disable | I1-ST-04..07, I1-ST-10..12, I1-ST-X3, I1-DT-03, I1-DT-05..07 |
| I1-AC3 | Attach after `appReady` with the two `ui` paths, no profile edit | I1-P-01..03, I1-ST-X4 |
| I1-AC4 (UD1) | `connector-missing`, no child, main boots, no auto-install | I1-EP-01, I1-EP-02, I1-EP-03, I1-ST-X1, I1-ST-X2, I1-DT-04, I1-DT-06, E1-B1b |
| I1-AC5 | Explicit launch config wins; a bad one fails safely | I1-EP-04, I1-EP-05 |
| UD4 | Only `fishball-connector` and `fishball-instance` | I1-P-02, E1-B1 |
| I2-AC1 | Both versions reach ready | I2-P-01, I2-P-02, I2-ST-01, I2-DT-01..05 |
| I2-AC2 | Owner bundles kept, in order | I2-DT-04, I2-DT-05 |
| I2-AC3 | One backup per migration, never overwritten | I2-P-02, I2-BVA-04..06, I2-DT-02, I2-DT-03, I2-DT-05, I2-DT-06 |
| I2-AC4 | No token in any file or log under the child home | I2-P-05, I3-SEC-05, I3-SEC-06 |
| I2-AC5 | The preview notice never appears | I2-P-06 |
| I2-AC6 | Overlay rows and readiness services (R4, R5) | I2-P-03, I2-P-04, I2-EP-01..03 |
| I2-AC7 | Lifecycle and startup timeout (R8, R9) | I2-ST-01..04, I2-ST-X1..X3, I2-BVA-01..03 |
| I3-AC1 | The page loads and the WebSocket connects through the proxy on both versions | I3-P-01..04, I3-P-06, I3-DT-01, I3-P-07, I3-ST-03 |
| I3-AC2 | Each refusal row has its status, and the child logs no request for it | I3-EP-01..17, I3-DT-02..07, I3-BVA-05, I3-BVA-08, I3-BVA-11 |
| I3-AC3 | No response to the browser carries the child's `Set-Cookie` or the launch token | I3-SEC-01..04, I3-SEC-09, I3-EP-18 |
| I3-AC4 (brief) | Tokens never reach the disk, the logs or the browser; the main cookie never reaches the child | I3-SEC-01..10, I3-P-05, I3-EP-10, E1-SEC |
| I3-AC5 | Limits (body, upload, streams, idle) | I3-BVA-01..12 |
| I3-AC6 | Re-exchange across a restart; 503 when not ready | I3-ST-01, I3-ST-02, I3-ST-04, I3-ST-X1, I3-P-08 |
| I4-AC1 | Hidden controls absent from the DOM | I4-P-02, I4-P-03, I4-EP-05 |
| I4-AC2 | The next request records the chosen effort | I4-P-04..06, I4-EP-01, I4-DT-01..04 |
| I4-AC3 | Settings ⇄ chat works both ways | I4-P-07, I4-P-08, I4-ST-01..05, I4-ST-X1, I4-ST-X2 |
| I4-AC4 | An unknown `view` shows the chat | I4-EP-02..04 |
| I4-AC5 | Both versions; the session opens with a late list | I4-P-01, I4-P-09 (all cases run on both) |
| I5-AC1 | Every resume path: same tool list and persona | I5-P-03, I5-P-02, I5-ST-02, I5-DT-01..04 |
| I5-AC2 | A write tool fails at the sandbox; no permission change | I5-P-04, I5-P-05 |
| I5-AC3 | The id prefix holds | I5-P-01, I5-P-07 |
| I5-AC4 | Exactly one Fishball session after any restarts | I5-ST-01, I5-ST-03..05, I5-ST-X1 |
| I5-AC5 | Private workspace; never "Choose workspace" | I5-P-01, I5-P-06 |
| I6-AC1 (UD3, replaces §18.2's first I6 AC) | Connector values not editable; at most read-only and equal to DSH's form | I6-P-01, I6-P-10, I6-EP-01, I6-BVA-01, I6-BVA-02, I6-DT-05, E1-B5 |
| I6-AC2 | Restart gives a new child and the page reconnects | I6-P-02, I6-ST-01, I6-ST-X1, I6-DT-01 |
| I6-AC3 | Refresh models fills the composer's model list | I6-P-03..05, I6-EP-02, I6-BVA-03..05, I6-ST-02, I6-ST-X2, I6-DT-02 |
| I6-AC4 | Refusals show their codes | I6-EP-03..05, I6-ST-03, I6-ST-04 |
| I6-AC5 | Light and dark | I6-P-13 |
| I6-AC6 (UD2) | Instance settings live in the instance profile; the main DSH sees only sync options | I6-P-06..09, I6-P-12, I6-DT-03 |
| I6-AC7 | Nothing writes to the main DSH except the upward requests | I6-P-11, I6-DT-04 |
| I7-AC1 | Each kind renders its fixed wording in both places | I7-P-01, I7-P-03, I7-P-04, I7-EP-01..10, I7-BVA-01..06 |
| I7-AC2 | No duplicate rows after a reconnect | I7-ST-01..04 |
| I7-AC3 | The next turn's request has no record text | I7-P-05 |
| I7-AC4 | In order, with the asking session named; nothing before the card ends | I7-P-02, I7-ST-X1 |
| I8-AC1 | No import of a removed module | I8-P-01..03 |
| I8-AC2 | Old routes answer 404 | I8-EP-01..04 |
| I8-AC3 | Full suite green on both versions | I8-P-04, I8-P-05, I8-EP-05 |
| I9-AC1 | The four (and system) theme × language combinations match | I9-P-01, I9-DT-01..06 |
| I9-AC2 | Follows a change in the main page | I9-ST-01..03 |
| E1-AC | §18.4 scenarios pass on both versions | E1-B1..B8, E1-B1b, E1-B8b, E1-B8c, E1-SEC |

## 14. Case count

| Task | Cases |
| --- | --- |
| I1 | 32 |
| I2 | 28 |
| I3 | 60 |
| I4 | 25 |
| I5 | 17 |
| I6 | 34 |
| I7 | 26 |
| I8 | 10 |
| I9 | 10 |
| E1 | 12 |
| **Total** | **254** |

The n/a boundary rows (I3-BVA-01, I7-BVA-01) and the rows that only point at another case's run
(I6-BVA-03, I6-BVA-04, I6-ST-03, I7-BVA-02) are counted; they keep each boundary visible.

## 15. Open questions

Where §18.2, §0 or the user's decisions leave the expected result open, the case states what holds
anyway and points here.

- **OQ-01 Observation points.** What does K1/C1 expose for the connector's attach state and attach
  count (§18.2 I1 AC)? Where does the instance show its status, and "the reason", when the
  connector is missing? The Fishball view belongs to the connector client, which is not there in
  that case (§0.6: "its view states the reason").
- **OQ-02 Connector disabled at runtime.** Does the instance go to `connector-missing` (implied by
  §18.2's ST line), and does enabling the connector again need a main restart before the instance
  can inject it?
- **OQ-03 Attach refused.** When an attach is refused (`instance-busy` because a third-party
  instance is attached, or `contract-version` with an incompatible connector), what is the
  instance's status, and does its child start or keep running?
- **OQ-04 UD2 vs §0.7 and SP2.** §0.7 keeps launch settings (`nodeExecutable`,
  `executableSearchPath`, limits) in the `fishball-instance` row config, edited in DSH's own form;
  R8/SP2 rely on `nodeExecutable`. UD2 says every instance setting lives in the instance profile and
  the main DSH sees only sync options. Launch settings are needed before the child exists. Where do
  they live, and what exactly are the "necessary sync options" in the main DSH?
- **OQ-05 UD3 outside this scope.** Does `settings.update` stay in contract v1 (K1, C2)? Does I6
  show connector values read-only at all ("at most")? §18.2 I6 (R, EP, BVA, first AC) and §18.4
  E2E-B5 need the design text updated; the cases here follow UD3.
- **OQ-06 UD4 naming.** Does the connector's row keep the id `fishball` (§0.2, which keeps the
  settings namespace and the stored limits)? What display names does the Plugins page show? Is
  "Fishball" still used as the product name in the view, sidebar row, preset id `fishball` and the
  `session-fishball-` prefix?
- **OQ-07 Startup timeout.** Its value, and the safe code at timeout. Which code when a required
  service (`webServer`, `connection`, `sessionController`) is missing?
- **OQ-08 Manifest migration.** The outcome for a malformed manifest. Where `dsh-web-app` goes
  when re-added among owner bundles. The backup's name, and whether a second migration makes a
  second backup.
- **OQ-09 Crash.** After a crash, does the child stay failed until Retry (§11), or is there an
  automatic restart?
- **OQ-10 Test fixtures in the child profile.** May tests pre-seed an owner bundle in the child
  home (F4: echo route, token probe, service reads)? Is the launch token from
  `connection.authenticatedUrl` constant within one child process, so that the probe sees the
  value the proxy exchanges?
- **OQ-11 Proxy status codes.** For a disallowed method (405?), traversal, encoded `..` or an
  absolute URL (400 or 404?), a body over the limit (413?), the 33rd stream (429 or 503?). Which
  wins when site and auth both fail (403 or 401)? Is `Sec-Fetch-Site: none` (a typed URL, a reload
  of "Open in a tab") or an absent header refused, as §3.1's literal rule says?
- **OQ-12 §3.3/§3.6 under Option A.** Do the §3.3 headers (CSP, `X-Frame-Options`,
  `Referrer-Policy`, `no-store`) still apply, now that the child serves DSH's own app (which needs
  WebSocket `connect-src` and may need other sources)? Do the 32-stream limit and the 30 s idle
  timeout apply to `api/remote.mux`? Which route is "the one upload route" (8 MiB)? Is
  `/fishball/embed` without a slash served or redirected? Is a browser-supplied `token` query
  stripped, refused or forwarded?
- **OQ-13 Disabled instance.** Does `/fishball/embed/*` answer 503 (route kept) or 404 (route
  removed)?
- **OQ-14 I4 details.** Which effort is "the model default" (the catalog's or DSH's)? Does a
  chosen effort carry over when switching to another effort model? Does the header Settings action
  change the URL to `?view=settings`, and does Back restore it? How are `?view=`, case variants and
  repeated `view` parameters read? What tolerance does "about 56 px" allow?
- **OQ-15 Keyboard shortcuts.** Inside the iframe, must DSH's shortcuts for New Session, generic
  settings and the permission mode be blocked (R6, SP3 pending)?
- **OQ-16 Archive and preset timing.** May Fishball's session be archived? If it is archived, does
  the next start unarchive it or create a new one? What happens if a resume runs before the preset
  is registered (§18.2 I5's DT has this input but no outcome)?
- **OQ-17 I6 details.** How do disposable tests get recommended plugins offline (the market
  index)? What does the result line say for "nothing to sync"? How does the page present its
  controls while the child restarts?
- **OQ-18 Records.** Which "inbox notices" are plugin records (never in a model request) and which
  are follow-up turns that the model does see? Which cap applies to the record's texts, and what is
  the cut marker?
- **OQ-19 Retired routes.** What is the exact list of old routes to check for 404: the custom
  child endpoints (distinct from DSH's own `api/*`, which now pass through the same prefix), the
  `settings-routes.js` paths and the `native-control` endpoints? Is
  `/api/fishball/native/provider-sync/sync` retired now that Refresh goes through a child route and
  the upward `providerSync.request`?
- **OQ-20 I9 timing.** Does the iframe follow a theme or language change live (without a reload),
  and within what time?
- **OQ-21 Stub instance.** May the stub live in the test tree as a package installed into the
  disposable profile? The connector's view for an instance without `ui` is C3's to define; E1-B8
  expects C3's documented outcome.
- **OQ-22 rc.5 and SP1.** The session-only frame is unproven on 0.2.1-rc.5 until SP1 is answered.
  Are I4/I5/E1 failures on rc.5 there blockers or recorded gaps?
- **OQ-23 Preview notice on rc.5.** R7 cites 0.2.2 only. Does rc.5 have an equivalent notice that
  the instance must also pre-acknowledge?
