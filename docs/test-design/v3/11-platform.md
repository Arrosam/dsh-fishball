# 11. Protocol, core tools, plugin set, placement, board, migration, compatibility, security (PLAT)

Requirements: R-ARCH-01…07, R-CON-01, 02, 05…10, R-EVT-01, R-FB-01, 02, 06, 08, 09, 10, R-BND-01…05,
R-BRD-01, 02, R-FN-01, R-MIG-01…05, R-COMPAT-01, R-SEC-01…04. Conventions: [README](<README.md>).

## Use Cases

### PLAT-UC-01 — A 2026-07-28 client uses the endpoint; an older one is told to upgrade
**Req:** R-CON-01, R-CON-02, R-OA-09 · **Level:** integration · **Flags:** —

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
**Req:** R-CON-05, R-CON-06, R-CON-07, R-CON-02 · **Level:** integration · **Flags:** —

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
**Req:** R-CON-08, R-CON-09, R-ROUTE-03, R-ROUTE-04 · **Level:** integration · **Flags:** —

- **Actor:** an agent session S1 in main DSH M.
- **Main flow:** unmanaged S1 calls `message_fishball` → a `message` event for D; `ask_fishball` → an `ask` event for D, and S1 waits for the answer.
- **Alternative flows:** A1. S1 managed by P → both go to P.
- **Exception flows:**
  - E1. No D set, or D not connected → `ask_fishball` answers `unavailable` at once; `message_fishball` queues up to `maxQueuedInputs`, then `queue-full`.
  - E2. S1 is managed by P, and P is not connected → S1's permission request still becomes an offer in P's mailbox and waits; it does **not** go to the user (TQ-16 decided: R-CON-09 applies only to unmanaged sessions).
- **Postconditions:** "connected" is not a timer on the answer.

### PLAT-UC-04 — Installing the plugin set makes an ordinary DSH Fishball
**Req:** R-FB-01, R-FB-02, R-FB-09, R-FB-10, R-FB-12, R-FB-13, R-ARCH-01, R-ARCH-06 · **Level:** integration (composition), e2e (page) · **Flags:** —

- **Actor:** owner of an ordinary DSH.
- **Main flow:** install the four tarballs natively and restart → one Fishball manager session; the A-lite page (sidebar, navigation, new-session entries hidden and not focusable; shortcuts remapped or unbound); effective read-only with the private Skills exception; no new sessions can be created; the `fishball-recommended` tab; slim settings. DSH's plugin list shows four Fishball entries and **no** separate `fishball-ui`. `agentPresets.list()` is `[fishball]`, default `fishball`; the four DSH-shipped presets (`standard`, `ptc`, `cordis`, `minimal`) are **switched off but still present** (not deleted); a new manager session runs `fishball` with exactly `read`, `read_image` and `working_directory`, read-only, and resumes the same in a new process (core checks its tool list, R-FB-13).
- **Alternative flows:**
  - A1. The owner overrides a guard row (e.g. re-enables `ui-subagent`, or switches a DSH-shipped agent preset back on) in their profile or the Plugins page → core keeps running, status `guards-overridden` naming that guard, one line on the page's status strip and one notice to Fishball; restoring it clears the report at the next check (app ready, `settings/document-updated` or `plugin-manager/changed`), with nothing published before app ready.
  - A2. The owner disables `fishball-core` → Fishball and its guards are off.
  - A3. The owner installed core **first** (DSH's native install order) → at its first start core moves itself to the end of `dsh.profile.bundles`. With HMR on, DSH recomposes within seconds and `fishball-instance` (if installed) turns off; with HMR off, it is off from the next start. Until then core reports `guards-overridden` naming it. If the owner later moves core first again, core does not move it back and keeps reporting (R-FB-12).
- **Exception flows:** E1. Nothing re-applies, blocks or hides an overridden guard.
- **Postconditions:** no DSH code, bundle or other plugin's files were patched.

### PLAT-UC-05 — Upgrading to V3: no migration, leftover sessions archived
**Req:** R-MIG-01, R-MIG-02, R-MIG-03, R-MIG-04, R-MIG-05, R-FB-13 · **Level:** integration (+ e2e for the page) · **Flags:** —

- **Actor:** a user with C + I in one DSH and an earlier child profile holding a leftover manager session (recorded on a now switched-off preset such as `standard`).
- **Main flow:**
  1. Upgrade the connector → V2 settings V3 still uses keep their values; dropped ones are ignored and not rendered; one log line points at embed-UI.
  2. Upgrade the instance → the first V3 child start places all four set members and `fishball-hosted-settings` with core last (core on, features and the hosted settings bundle on at first placement); a new hosted token is created and paired with no manual step.
  3. The leftover session is **archived** (`workspaceController.archiveSession`), not migrated or resumed; the process does not crash, and the Fishball route keeps answering.
  4. A new manager session is created on `fishball`: tools exactly `read`, `read_image`, `working_directory`; read-only.
  5. Install embed-UI → the Fishball page and session list work; Skills and child settings are intact.
- **Alternative flows:**
  - A1. The child restarts → the leftover is still archived; the manager session resumes in a new process with the same three tools, read-only (checked by tool list, R-FB-13).
  - A2. The V2 child had a manually installed board in state off → placement replaces the copy and keeps it off (D§10).
- **Exception flows:**
  - E1. V3 core against a V2 connector → 404 on the MCP route; status `TARGET_INCOMPATIBLE`; no delegation happens.
  - E2. V2 instance against a V3 connector → `connector-upgrade-required`.
  - E3. Resolving the leftover directly → refused (`gateway/internal`), no throw escapes, nothing crashes.
- **Postconditions:** no earlier session is resumed or migrated; the leftover's log stays on disk as an archived session (DSH has no public delete); no compatibility shim exists.

### PLAT-UC-06 — The board keeps records and offers export on removal
**Req:** R-BRD-01, R-BRD-02, R-HOST-02 · **Level:** integration · **Flags:** —

- **Actor:** Fishball; the owner.
- **Main flow:** an item marked done stays visible for 30 days, then is archived; `board_search` finds it by keyword.
- **Alternative flows:** A1. Cleared early → archived at once, still searchable.
- **Exception flows:** E1. Hosted uninstall → the export is offered before deletion. E2. Standalone: `board_export` manager tool exists; the README tells the user to run it.
- **Postconditions:** no record is ever deleted while installed.

### PLAT-UC-07 — Fishball shows an ask it cannot decide inside its own page
**Req:** R-FB-11, R-UI-12, R-CON-05, R-CON-06, R-CON-08 · **Level:** integration (core with a scripted model), e2e (Fishball page) · **Flags:** K (card fields, K3)

- **Actor:** an agent session S1 in main DSH M; Fishball (the principal the ask goes to); the user at the Fishball page.
- **Main flow:**
  1. S1 calls `ask_fishball("Use the staging database?")`; Fishball receives the `ask` event.
  2. Fishball's model cannot decide → the Fishball page shows a card in Fishball's conversation: the asking session S1, the question, and the answer field or choices.
  3. The user answers on the card → core commits the answer through its link as Fishball's answer; S1's `ask_fishball` returns it.
- **Alternative flows:** A1. Fishball decides itself → no card; S1 gets Fishball's answer.
- **Exception flows:**
  - E1. Nobody answers for 48 h (fake clock) → the card and S1 keep waiting; no timer answers.
  - E2. The ask is settled elsewhere first (for example S1 is stopped) → the card shows it as closed; a late answer gets `already-settled` / `expired` and changes nothing.
- **Postconditions:** the main DSH never showed an answer control for the ask; exactly one answer was committed.

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
| 4a | `session_read` / `sessions_list` for a session another principal manages | `forbidden` / omitted (1.23) |
| 5 | any refusal | `isError: true`; `structuredContent` `{ok: false, code, message}` and the same JSON as a text block (e.g. `limit-exceeded`, `expired`, `queue-full`); never prose only |
| 6 | any success | `isError: false`; `structuredContent` plus the same JSON as text; the output schema admits the refusal envelope |

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
| 2 | *(withdrawn (fold-notify is not in V3; requirements 1.34))* | — |
| 3 | *(withdrawn: Watchdog left V3, requirements 1.37)* | — |
| 4 | *(withdrawn (fold-notify is not in V3; requirements 1.34): "both" was board and fold-notify)* | — |

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
**Req:** R-ARCH-08, R-ARCH-01, R-BND-01, R-FB-01, R-SEC-01 · **Level:** unit (static analysis of manifests and imports), integration (row 8: a started host with a child) · **Flags:** TQ-R5 (decided B)

| # | Check | Expected |
| --- | --- | --- |
| 1 | `fishball-instance` imports or depends on `fishball-core` | never |
| 2 | `fishball-core` imports or depends on `fishball-instance` | never |
| 3 | `fishball-shared` imports any other V3 package | never |
| 4 | `fishball-shared` manifest | no `dsh` field: no bundle, row, `dsh.client` or service; not listed on any Plugins page |
| 5 | every V3 package that imports `fishball-shared` | has it in `dependencies` and `bundleDependencies`; its packed tarball contains it |
| 6 | contents of `fishball-shared` | every module in it is imported by **at least two** V3 packages; a module imported by only one package fails the check |
| 7a | allowed edges **into** `fishball-shared` (TQ-R5 = B) | from `fishball-connector`, `fishball-embed-ui`, `fishball-core`, `fishball-instance`, `fishball-board`, `fishball-hosted-settings`: all allowed (`fishball-fold-notify`: withdrawn (fold-notify is not in V3; requirements 1.34)) |
| 7b | edges **out of** `fishball-shared` | none to any V3 package |
| 7c | other cross-package edges | unchanged: the feature plugins reach core only through the optional `fishballInstance?` inject; embed-UI imports no connector code (types from `./tools` only); the connector imports no Fishball-set package |
| 8 | host DSH process of a running hosted setup (C + I + U, with the connector or embed-UI importing `fishball-shared`) | no module from `fishball-core`, the feature plugins or `fishball-hosted-settings` is loaded (module-load trace); `fishball-shared` modules may be |
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
| 1 | no (first placement) | no | — | yes | placed, **on**, in the fixed order (core last) |
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
**Req:** R-BND-05, R-FB-07 · **Level:** integration · **Flags:** K (`plugin-set-incomplete`, D§8.2)

| Rule | core | board | fold-notify *(withdrawn (fold-notify is not in V3; requirements 1.34))* | Core status |
| --- | --- | --- | --- | --- |
| 1 | on | on | — | ok |
| 2 | on | — | — | ok; nothing reported (a feature that is not installed is not "missing", TQ-17 decided) |
| 3 | *(withdrawn: Watchdog left V3, requirements 1.37)* | | | |
| 4 | *(withdrawn: Watchdog left V3, requirements 1.37)* | | | |

### PLAT-DT-04 — Core's bundle order and whether its guards apply
**Req:** R-FB-12, R-FB-09, R-FB-02 · **Level:** integration (a real DSH per SDK) · **Flags:** —

| Rule | Mode | `dsh.profile.bundles` before start | Core's first start in this DSH | Result after the start (and restart, if asked) | Report |
| --- | --- | --- | --- | --- | --- |
| 1 | hosted (HMR off) | written by the instance, core last | — | guards apply from the child's first start; `fishball-instance` never started in the child | ok |
| 2 | standalone | core after every guarded bundle | yes | nothing moved, no restart prompt | ok |
| 3a | standalone, HMR on | core first (native install order) | yes | core moves itself last; DSH recomposes live within seconds; `fishball-instance` (already started once) is then off | `guards-overridden` until the recompose, then ok |
| 3b | standalone, HMR off | core first | yes | core moves itself last; the instance stays on until the next start; from then on it is never started | `guards-overridden` until the restart, then ok |
| 3c | any | core already last | later starts | nothing written (`unchanged`) | ok |
| 4 | standalone | the owner moved core first again later | no | not moved back | `guards-overridden` naming the guards that no longer apply |
| 5 | standalone | a guarded bundle installed after core's first start | no | not moved | `guards-overridden` for that bundle's guarded rows |
| 6 | any | — | — | core never changes another bundle's own on/off state | — |

### PLAT-DT-03 — Compatibility matrix
**Req:** R-COMPAT-01, R-ARCH-06 · **Level:** integration (each row is a full suite run), e2e (UI rows) · **Flags:** —

Each rule runs the integration suite of every file of this directory that applies to the mode.

| Rule | DSH SDK | Mode | Expected |
| --- | --- | --- | --- |
| 1 | 0.2.1-rc.5 | hosted (C + I + U, row 8) | all pass |
| 2 | 0.2.1-rc.5 | standalone F → C on rc.5 (row 9) | all pass |
| 3 | 0.2.2-rc.1 | hosted | all pass |
| 4 | 0.2.2-rc.1 | standalone F → C on rc.1 | all pass |
| 5 | mixed: F on rc.5 → C on rc.1 | standalone | **not checked** (decided B: both sides talk only over MCP, so no cross-version dependency should exist) |
| 6 | any | any | no user-visible behaviour differs between SDKs (compare UI snapshots and tool results of rules 1/3 and 2/4) |

## State Transitions

### PLAT-ST-01 — One offer (approval / question / plan review)
**Req:** R-CON-05, R-CON-06, R-TOK-05, R-HOST-09 · **Level:** unit · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | (none) | managed session asks | Live(P) |
| 2 | Live(P) | P answers | Settled; `settlement` to P |
| 3 | Live(P) | user answers | Settled; `settlement` to P |
| 4 | Settled | any answer | Settled (`already-settled` / `expired`) |
| 5 | Live(P) | time passes / silence | Live(P) (no timer) |
| 6 | Live(P) | P revoked | Live(user) (card in session) |
| 7 | Live(P) | succession | Live(P'): the same request, offer revision + 1; the old id answers `expired` to any principal; a user answer during the succession settles the one request (S3 `b4dca86`) |
| 8 | *(withdrawn: Watchdog left V3, requirements 1.37)* | | |
| 9 | Live(P) | session ends / offer withdrawn | Retired; `retirement` to P |
