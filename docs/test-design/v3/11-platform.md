# 11. Protocol, core tools, plugin set, placement, board, fold-notify, migration, compatibility, security (PLAT)

Requirements: R-ARCH-01…07, R-CON-01, 02, 05…10, R-EVT-01, R-FB-01, 02, 06, 08, 09, 10, R-BND-01…05,
R-BRD-01, 02, R-FN-01, R-MIG-01…05, R-COMPAT-01, R-SEC-01…04. Conventions: [README](<README.md>).

## Use Cases

### PLAT-UC-01 — A 2026-07-28 client uses the endpoint; an older one is told to upgrade
**Req:** R-CON-01, R-CON-02, R-OA-09 · **Level:** integration · **Flags:** P:S1

- **Actor:** an MCP client.
- **Preconditions:** full AT.
- **Main flow:** `server/discover` → `tools/list` → `tools/call sessions_list` → `subscriptions/listen` all work with `MCP-Protocol-Version: 2026-07-28`.
- **Alternative flows:** —
- **Exception flows:**
  - E1. `initialize` (2025-11-25 client) → a JSON-RPC error naming `2026-07-28`.
  - E2. Version header `2025-11-25` → `UnsupportedProtocolVersion` (-32022) listing `2026-07-28`.
  - E3. GET or DELETE on the endpoint → 405.
  - E4. `resources/subscribe` → not implemented (method not found).
  - E5. An `Mcp-Session-Id` header → ignored; no session is created (K).
  - E6. Mirrored headers mismatching the body → 400 `HeaderMismatch` (-32020, D§2).
- **Postconditions:** no protocol session state exists on the server.

### PLAT-UC-02 — A principal answers a delegated approval; the user races it
**Req:** R-CON-05, R-CON-06, R-CON-07, R-CON-02 · **Level:** integration · **Flags:** P:S3

- **Actor:** external principal P managing S1; the user in S1.
- **Main flow:** S1 asks permission → offer O1 in P's mailbox; P answers `approval_answer(O1, allow)` → settled; P gets a `settlement`.
- **Alternative flows:**
  - A1. Questions and plan reviews: P answers with `question_answer` → settled the same way.
  - A2. The user answers in S1 first → P's answer gets `already-settled` or `expired`, nothing changes.
- **Exception flows:**
  - E1. Nobody answers for 48 h (fake clock) → O1 still **waits**; no timer, silence or lost notification settles it.
  - E2. P answers twice → the second gets `already-settled`.
- **Postconditions:** exactly one committed outcome; no setting exists to stop external principals receiving delegated items.

### PLAT-UC-03 — A main-DSH session calls `message_fishball` / `ask_fishball`
**Req:** R-CON-08, R-CON-09, R-ROUTE-03, R-ROUTE-04 · **Level:** integration · **Flags:** TQ-16

- **Actor:** an agent session S1 in main DSH M.
- **Main flow:** unmanaged S1 calls `message_fishball` → a `message` event for D; `ask_fishball` → an `ask` event for D, and S1 waits for the answer.
- **Alternative flows:** A1. S1 managed by P → both go to P.
- **Exception flows:**
  - E1. No D set, or D not connected → `ask_fishball` answers `unavailable` at once; `message_fishball` queues up to `maxQueuedInputs`, then `queue-full`.
  - E2. No principal connected and S1 managed → S1's permission request goes to the user in S1. *(Which principal's connection counts for a managed session is TQ-16.)*
- **Postconditions:** "connected" is not a timer on the answer.

### PLAT-UC-04 — Installing the plugin set makes an ordinary DSH Fishball
**Req:** R-FB-01, R-FB-02, R-FB-09, R-FB-10, R-ARCH-01, R-ARCH-06 · **Level:** integration (composition), e2e (page) · **Flags:** P:S6

- **Actor:** owner of an ordinary DSH.
- **Main flow:** install the four tarballs natively and restart → one Fishball manager session; the A-lite page (sidebar, navigation, new-session entries hidden and not focusable; shortcuts remapped or unbound); effective read-only with the private Skills exception; no new sessions can be created; the `fishball-recommended` tab; slim settings. DSH's plugin list shows four Fishball entries and **no** separate `fishball-ui`.
- **Alternative flows:**
  - A1. The owner overrides a guard row (e.g. re-enables `ui-subagent`) in their profile → core keeps running, status `guards-overridden` naming that guard, one line on the page's status strip and one notice to Fishball; restoring it clears the report at the next check (app ready or any settings change).
  - A2. The owner disables `fishball-core` → Fishball and its guards are off.
- **Exception flows:** E1. Nothing re-applies, blocks or hides an overridden guard.
- **Postconditions:** no DSH code, bundle or other plugin's files were patched.

### PLAT-UC-05 — V2 user upgrades to V3
**Req:** R-MIG-01, R-MIG-02, R-MIG-03, R-MIG-04, R-MIG-05 · **Level:** integration (+ e2e for the page) · **Flags:** P:S6

- **Actor:** a V2 user with C + I in one DSH and a V2 child profile.
- **Main flow:**
  1. Upgrade the connector → V2 settings V3 still uses keep their values; dropped ones are ignored and not rendered; one log line points at embed-UI.
  2. Upgrade the instance → first V3 child start places all four set members and `fishball-hosted-settings` (core on, features and the hosted settings bundle on at first placement); a new hosted token is created and paired with no manual step.
  3. Install embed-UI → the Fishball page and session list work; child history, Skills and child settings are intact.
- **Alternative flows:** A1. The V2 child had a manually installed board in state off → placement replaces the copy and keeps it off (D§10).
- **Exception flows:**
  - E1. V3 core against a V2 connector → 404 on the MCP route; status `TARGET_INCOMPATIBLE`; no delegation happens.
  - E2. V2 instance against a V3 connector → `connector-upgrade-required`.
- **Postconditions:** nothing in the child's history is lost; no compatibility shim exists.

### PLAT-UC-06 — The board keeps records and offers export on removal
**Req:** R-BRD-01, R-BRD-02, R-HOST-02 · **Level:** integration · **Flags:** —

- **Actor:** Fishball; the owner.
- **Main flow:** an item marked done stays visible for 30 days, then is archived; `board_search` finds it by keyword.
- **Alternative flows:** A1. Cleared early → archived at once, still searchable.
- **Exception flows:** E1. Hosted uninstall → the export is offered before deletion. E2. Standalone: `board_export` manager tool exists; the README tells the user to run it.
- **Postconditions:** no record is ever deleted while installed.

## Equivalence Partitioning

### PLAT-EP-01 — Request check order at the MCP endpoint
**Req:** R-CON-01, R-REM-03, R-TOK-01, R-SEC-03 · **Level:** integration · **Flags:** D§3.1

Each row fails exactly one check (and later checks would also fail); the expected status proves the order.

| # | Request | Expected |
| --- | --- | --- |
| 1 | GET, bad Origin, no token | 405 |
| 2 | POST, bad Origin, no token | 403 |
| 3 | POST, good Origin, no token, oversize body | 401 |
| 4 | POST, valid AT, oversize body, wrong version | 413 |
| 5 | POST, valid AT, ok body, wrong version | 400 -32022 |
| 6 | all good | dispatched |

### PLAT-EP-02 — Core tool set
**Req:** R-CON-02, R-WATCH-03, R-EXT-13 · **Level:** integration · **Flags:** K (names D§3.2)

| # | Class | Expected in `tools/list` (full AT) |
| --- | --- | --- |
| 1 | session control: list, start, message, redirect, stop, read, release | present |
| 2 | approvals / questions / prompts answering; grants list, revoke; attachments put, read; inbox poll, ack; `pair`, `set_name` | present |
| 3 | watch tools | absent |
| 4 | attention signal | absent from core (only `embed-ui.attention.*` when U is present) |
| 5 | any refusal | structured `{ok: false, code, message}` in a successful `CallToolResult` (e.g. `limit-exceeded`, `expired`, `queue-full`), never prose only |

### PLAT-EP-03 — Packaging rules
**Req:** R-ARCH-01, R-ARCH-03, R-ARCH-05, R-ARCH-06, R-FB-01 · **Level:** unit (manifest/static analysis) · **Flags:** —

| # | Package | Check |
| --- | --- | --- |
| 1 | connector | no `dsh.client`; loading adds no sidebar, slot, CSS or HTML route |
| 2 | instance | no browser client; no session service injected |
| 3 | embed-UI | only package with host-DSH UI |
| 4 | core | `fishball-ui` ships inside core; no separate plugin entry |
| 5 | all | each is a DSH bundle installable, enable-able, disable-able and listable natively |
| 6 | all | no file writes outside their own folders/profile rows; no host patch |

### PLAT-EP-04 — Feature plugins without core
**Req:** R-FB-06 · **Level:** integration · **Flags:** —

| # | Installed | Expected |
| --- | --- | --- |
| 1 | board only | one `fishball-core-missing` line; boot ok |
| 2 | fold-notify only | same |
| 3 | Watchdog only | same; no Watchdog code runs (R-WD-01) |
| 4 | all three, no core | three lines; boot ok |

### PLAT-EP-05 — Secret leakage sweep
**Req:** R-SEC-02, R-TOK-04 · **Level:** integration (full-run acceptance) · **Flags:** —

Plant recognisable token values, admission tickets and `Authorization` headers; run every UC in this suite; grep every log, lifecycle file, child home, temp directory, settings document, tool result and browser response.

| # | Artefact class | Expected hits |
| --- | --- | --- |
| 1 | logs (host, child, connector) | 0 |
| 2 | lifecycle files, overlays | 0 |
| 3 | child home, profile | 0 |
| 4 | temp dirs | 0 |
| 5 | settings documents | 0 |
| 6 | MCP responses and resource contents | 0 |
| 7 | the credential store of the owning DSH | present (allowed) |
| 8 | DSH's own browser login token on stdout at startup | allowed, exactly once per DSH start, and only there (S7 §4.4); the same value anywhere else is a hit |

### PLAT-EP-06 — No private channel between a Fishball DSH and a main DSH
**Req:** R-ARCH-07, R-FB-08, R-UI-09 · **Level:** integration (traffic trace plus static check) · **Flags:** —

| # | Path | Expected |
| --- | --- | --- |
| 1 | `fishballConnector.attachInstance`, `current()` | the service does not exist in V3 |
| 2 | envelope-v2 frames / the `control` wire channel | absent; the lifecycle wire carries only lifecycle, `admin`, `instance-settings`, `provider-sync` and `mcp-credential` (D§6.1) |
| 3 | every session read, start, answer by a Fishball DSH | seen at C's MCP endpoint (trace) |
| 4 | a Fishball DSH plugin acting on its own Fishball DSH's sessions | allowed (its own sessions) |
| 5 | a Fishball DSH plugin acting on another DSH's sessions without MCP | no such path |

### PLAT-EP-07 — Package dependency boundaries and the shared library
**Req:** R-ARCH-08, R-ARCH-01, R-BND-01, R-FB-01 · **Level:** unit (static analysis of manifests and imports), integration (row 8: a started host with a child) · **Flags:** TQ-R5 (A assumed)

| # | Check | Expected |
| --- | --- | --- |
| 1 | `fishball-instance` imports or depends on `fishball-core` | never |
| 2 | `fishball-core` imports or depends on `fishball-instance` | never |
| 3 | `fishball-shared` imports any other V3 package | never |
| 4 | `fishball-shared` manifest | no `dsh` field: no bundle, row, `dsh.client` or service; not listed on any Plugins page |
| 5 | `fishball-core` and `fishball-instance` | each has `fishball-shared` in `dependencies` and `bundleDependencies`; their packed tarballs contain it |
| 6 | contents of `fishball-shared` | only modules imported by both core and the instance; a module imported by only one side fails the check |
| 7 | `fishball-connector`, `dsh-fishball-embed-UI` | do not depend on `fishball-shared` (TQ-R5 = A) |
| 8 | host DSH process of a running hosted setup | no module from `fishball-core`, the feature plugins or `fishball-hosted-settings` is loaded (module-load trace); `fishball-shared` modules may be |
| 9 | standalone install of the core tarball in a DSH with no instance | installs and starts with no registry access |

## Boundary Value Analysis

### PLAT-BVA-01 — Board done-item visibility (30 days)
**Req:** R-BRD-01 · **Level:** unit (fake clock) · **Flags:** K (day = 86400 s)

| # | Time since done | Expected |
| --- | --- | --- |
| 1 | 29 d 23:59:59 | visible |
| 2 | 30 d | archived (K: inclusive edge) |
| 3 | 30 d + 1 s | archived; searchable |

### PLAT-BVA-02 — Endpoint body limits
**Req:** R-SEC-03 · **Level:** integration · **Flags:** K (limits frozen at V3-K)

| # | Body size | Expected |
| --- | --- | --- |
| 1 | limit − 1 | processed |
| 2 | limit | processed |
| 3 | limit + 1 | 413 structured |
| 4 | in-flight = max, one more | 429 structured |

## Decision Tables

### PLAT-DT-01 — Placement of a set member at child start (hosted)
**Req:** R-BND-01, R-BND-02, R-BND-03, R-BND-04, R-FB-10 · **Level:** integration · **Flags:** —

| Rule | In the instance's placement record | Present in child profile | User's last state | Compatible | Result after start |
| --- | --- | --- | --- | --- | --- |
| 1 | no (first placement) | no | — | yes | placed, **on** |
| 2 | yes | yes | on | yes | on |
| 3 | yes | yes | off | yes | off (disable survives restart and upgrade) |
| 4 | yes | no (deleted while off) | off | yes | placed again **off** |
| 5 | yes | no (deleted while on) | on | yes | placed again on |
| 6 | yes | yes | on | no | child start **blocked**; status names plugin + reason |
| 7 | yes | yes | off | no | start not blocked (only enabled members block) |
| 8 | toggled on/off while the child runs | | | | effect at the next restart; UI says "restart required" |
| 9 | any | | | | the host DSH never lists or loads the bundled copies |

Applies equally to core (R-FB-10). `fishball-hosted-settings` follows the same rules (HOST-DT-03).

### PLAT-DT-02 — Standalone set completeness
**Req:** R-BND-05, R-FB-07 · **Level:** integration · **Flags:** K (`plugin-set-incomplete`, D§8.2), TQ-17

| Rule | core | board | fold-notify | Watchdog | Core status | "watchdog is down" |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | on | on | on | on, loaded | ok | no |
| 2 | on | — | — | — | ok (features optional), TQ-17 (does "missing" mean "not installed"?) | no |
| 3 | on | on | on | on, incompatible (skipped) | reports Watchdog skipped | once per start |
| 4 | on | on | on | off (owner) | reports nothing missing (K) | no |

### PLAT-DT-03 — Compatibility matrix
**Req:** R-COMPAT-01, R-ARCH-06 · **Level:** integration (each row is a full suite run), e2e (UI rows) · **Flags:** —

Each rule runs the integration suite of every file of this directory that applies to the mode.

| Rule | DSH SDK | Mode | Expected |
| --- | --- | --- | --- |
| 1 | 0.2.1-rc.5 | hosted (C + I + U, row 8) | all pass |
| 2 | 0.2.1-rc.5 | standalone F → C on rc.5 (row 9) | all pass |
| 3 | 0.2.2-rc.1 | hosted | all pass |
| 4 | 0.2.2-rc.1 | standalone F → C on rc.1 | all pass |
| 5 | mixed: F on rc.5 → C on rc.1 | standalone | all pass (K: whether mixed hosts are in scope; R-COMPAT-01 says "separately on each") |
| 6 | any | any | no user-visible behaviour differs between SDKs (compare UI snapshots and tool results of rules 1/3 and 2/4) |

## State Transitions

### PLAT-ST-01 — One offer (approval / question / plan review)
**Req:** R-CON-05, R-CON-06, R-TOK-05, R-HOST-09, R-WD-09 · **Level:** unit · **Flags:** P:S3

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | (none) | managed session asks | Live(P) |
| 2 | Live(P) | P answers | Settled; `settlement` to P |
| 3 | Live(P) | user answers | Settled; `settlement` to P |
| 4 | Settled | any answer | Settled (`already-settled` / `expired`) |
| 5 | Live(P) | time passes / silence | Live(P) (no timer) |
| 6 | Live(P) | P revoked | Live(user) (card in session) |
| 7 | Live(P) | succession | Live(P', new id); old id → `expired` |
| 8 | Live(P) | Watchdog commits `escalate` | Live(user card), Watchdog notified on settlement |
| 9 | Live(P) | session ends / offer withdrawn | Retired; `retirement` to P |
