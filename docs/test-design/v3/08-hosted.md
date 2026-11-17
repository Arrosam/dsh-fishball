# 8. Hosted launch, token per pairing and reinstall takeover (HOST)

Requirements: R-HOST-01…10, R-BND-01…04, R-ARCH-05, R-NAME-07, R-WATCH-04, R-MIG-05, §4.1
(hosted child table). Conventions: [README](<README.md>).

The token service is `fishballConnectorTokens` with `createHosted` and `retire` (D§5.4, K).

## Use Cases

### HOST-UC-01 — First hosted start with a connector in the same DSH
**Req:** R-HOST-01, R-HOST-02, R-HOST-05, R-HOST-06, R-BND-01, R-BND-02, R-ROUTE-04, R-MIG-05 · **Level:** integration · **Flags:** —

- **Actor:** the instance, in host DSH H that also runs C.
- **Preconditions:** I freshly installed; target blank; no hosted entry exists; no designated principal set.
- **Main flow:**
  1. H's app ready fires; I places the plugins (`fishball-board`, `fishball-ui`, `fishball-core`) into the child profile **before** the profile loads, all **on**, with `fishball-core` **last** in the child's `dsh.profile.bundles` (after every other bundle; R-FB-12). *(fold-notify and `fishball-hosted-settings` were in this list; both are not in V3, requirements 1.34.)*
  2. The child holds no paired credential → I asks C for a **new** "Fishball (hosted)" entry; C returns only its reference.
  3. I resolves the value and hands target and value to the child **in memory**.
  4. Core authenticates with its own `identity.id` (generated `fb-` + 16 lowercase base32) and calls `pair` with its local `identity.name` "Fishball" → paired, named "Fishball" if free, else nameless (`ID: <id>`) with the Fishball page asking for another name.
  5. The designated Fishball defaults to this hosted entry.
  6. The child locator reports state ready, the child origin and target status `connected`.
- **Alternative flows:**
  - A1. The user had already designated another entry → it stays designated; the hosted entry becomes the default only while `routing.fishballToken` is unset (TQ-15 decided).
- **Exception flows:**
  - E1. A set member is incompatible → the child's start is blocked; status names the plugin and the reason (`PROFILE_INCOMPATIBLE`, D§8.1).
  - E2. `fishball-core` disabled by the owner → the child starts anyway; status `fishball-off`.
- **Postconditions:** no token value exists in the child home, host home, overlays, argv, environment of any process, temp files or logs (grep for the planted value); H's own settings, sessions, credentials (other than the new entry's value) and shortcuts are unchanged.

### HOST-UC-02 — Child restart and reconnect create nothing
**Req:** R-HOST-05, R-ID-05, §4.1 · **Level:** integration · **Flags:** —

- **Actor:** the instance; the user pressing Retry.
- **Preconditions:** the child is paired via hosted entry Eh.
- **Main flow:** stop + start the child (or Retry, or the child crashes and restarts) → it requests a new AT with its token and id; **no** `pair` call; **no** new entry.
- **Alternative flows:** A1. C's DSH restarts (the same as H) → the child reconnects the same way.
- **Exception flows:** —
- **Postconditions:** the connector has exactly the same entries as before.

### HOST-UC-03 — Reinstall succession (Q24)
**Req:** R-HOST-09, R-NAME-07, R-WATCH-04, R-ROUTE-01, R-EVT-02 · **Level:** integration · **Flags:** —

- **Actor:** the instance; C.
- **Preconditions:** old hosted entry Eo (created by I) bound to `fb-old`, named "Navigator", designated, manages S1 and S2, holds a live permission offer O1 (S1), and has pending events e1, e2 (not acked). The user removes the child home (or reinstalls I).
- **Main flow:**
  1. The new child has no identity → I creates new entry En; the child pairs with a new id `fb-new` and its local `identity.name`, which is still held by Eo, so it pairs **nameless** (`nameRefused: name-taken`).
  2. As soon as pairing succeeds, I asks C to make En the successor of Eo.
  3. In **one atomic step** C: moves S1 and S2 to En; moves the designated role; gives En the name "Navigator"; re-issues O1 into En's mailbox with a **new** offer id; moves e1, e2 with their `eventId`s; deletes Eo and unsets its generated value.
  4. S1 and S2 each get exactly **one** `system` note naming "Navigator" (the new principal).
- **Alternative flows:**
  - A1. Eo managed no sessions and held no role → only the name moves and Eo is deleted.
- **Exception flows:**
  - E1. An agent's (any principal's) answer to O1's **old** id → `expired`.
  - E1a. The **user's** answer to O1's card in S1, given during or after the succession → settles the request; it is **never** refused `expired` because of the succession (S3 `b4dca86`; one record per request, offer id `<request>.r<n>` → `r<n+1>`, Q-S3-1 decided as implementation, K1 freezes the format).
  - E2. The step fails midway (injected storage failure) → nothing moved; Eo stays, with sessions, role and name; En stays nameless; I retries at its next start.
  - E3. The candidate old entry was created by the **user**, not by I → `retire` refuses; nothing moves.
- **Postconditions:** "Navigator" was never held by two principals; later S1/S2 events go to En only; no event is delivered twice.

### HOST-UC-04 — The user disables or deletes the hosted entry
**Req:** R-HOST-10, R-ROUTE-06, R-TOK-05 · **Level:** integration (C + I), e2e (Retry) · **Flags:** —

- **Actor:** DSH owner.
- **Main flow (disable):** the user switches the hosted entry off → the child reports `token-revoked`; I creates **no** replacement; re-enabling restores the same principal.
- **Alternative flows:**
  - A1. The user **deletes** the hosted entry → its sessions become unmanaged (one note each); I creates nothing until the user presses **Retry** in embed-UI; then I creates a new hosted entry and the child pairs.
- **Exception flows:** E1. A delete is never treated as a reinstall: no succession runs.
- **Postconditions:** the user's choice is never undone automatically.

### HOST-UC-05 — Hosted child with a remote target
**Req:** R-HOST-05, R-FB-05, R-UI-09 · **Level:** integration · **Flags:** —

- **Actor:** the user and the instance in host H (no C in H).
- **Preconditions:** remote DSH B with C_B; the user created entry Eb in C_B and stored its value in H's credential store under the instance's `target.tokenRef`; `target.url` = C_B's endpoint (https).
- **Main flow:** the child starts; I hands the target and value in memory; core authenticates against C_B and pairs; Fishball manages B's sessions.
- **Alternative flows:** A1. The reference has no value → status `token-refused` (or `target-unset`, K).
- **Exception flows:** E1. C_B is unreachable → `target-unreachable`; the child runs.
- **Postconditions:** I never creates an entry in C_B.

### HOST-UC-06 — Lifecycle with the host DSH
**Req:** R-HOST-02, R-HOST-03, R-HOST-04, R-HOST-08, R-BRD-02 · **Level:** integration · **Flags:** —

- **Actor:** the host DSH and its owner.
- **Main flow:** the child starts only after H's app ready; when H exits, the child stops.
- **Alternative flows:**
  - A1. The child crashes → status code shown; Retry restarts it.
  - A2. Uninstall → the board archive export is offered, then the child runtime is removed.
- **Exception flows:** E1. *(withdrawn: Watchdog left V3, requirements 1.37)*
- **Postconditions:** the launch overlays contain only HMR off, the child's own origin and port, the admission key and the target URL: no guard rows, no forced-on plugin, no token.

### HOST-UC-07 — Hosted model sync, started from embed-UI's Plugins card
**Req:** R-HOST-07, R-HOST-03, R-UI-06 · **Level:** e2e (card), integration (sync engine) · **Flags:** —

- **Actor:** DSH owner in H (I + U).
- **Preconditions:** H has providers and models configured; the child is running.
- **Main flow:** the owner starts model sync from embed-UI's Plugins card → the child's provider and model settings match H's.
- **Alternative flows:** A1. Nothing triggers it automatically: a child start, restart or H settings change does not sync.
- **Exception flows:** E1. A standalone Fishball DSH has no sync path at all (no card, no engine); it uses its own native model settings.
- **Postconditions:** H's own settings are unchanged; no provider secret is shown in embed-UI or written outside the credential stores.

### HOST-UC-08 — Hosted-only settings come from the instance's `fishball-hosted-settings` bundle
**Req:** R-HOST-11, R-ARCH-05, R-HOST-04, R-HOST-07, R-FB-01, R-FB-10, R-BND-02, R-BND-04 · **Level:** integration (child DSH with a scripted settings page), e2e (panel and Plugins page) · **Flags:** TQ-R4 (decided B)

- **Actor:** the owner of a hosted child, looking at its Fishball settings panel and its native Plugins page; the instance.
- **Preconditions:** C + I + U in H; the child is running after its first V3 placement.
- **Main flow:**
  1. The child's Plugins page lists the four set members **and** `fishball-hosted-settings`, all on.
  2. The child's settings panel shows the generic slim settings and, through core's settings-section extension point, the hosted-only sections (instance settings relay, hosted status line).
  3. A change in a hosted-only section travels to the host over the `instance-settings` wire channel and is saved by the instance.
- **Alternative flows:**
  - A1. The owner switches `fishball-hosted-settings` off → the UI says "restart required"; after the next child restart the hosted-only sections are absent: no error, no notice, no empty placeholder; the generic settings work unchanged; embed-UI's status, Retry and model-sync trigger in H are unaffected; core's status shows nothing about it.
  - A2. The owner switches it back on → after the next restart the sections are back.
  - A3. Standalone: the same core package shows the generic settings only; the DSH has no `fishball-hosted-settings`, and core reports nothing missing.
  - A4. The model-sync trigger appears **only** on embed-UI's Plugins card in H, never in the child panel.
- **Exception flows:**
  - E1. The owner disables `fishball-core` → the sections have nowhere to appear and do nothing; the child still starts (`fishball-off`).
  - E2. Core's guards never disable `fishball-hosted-settings`, and `guards-overridden` never names it.
- **Postconditions:** H shows no UI from the instance (all host UI is embed-UI's); the child's launch overlays carry no settings row.

## Equivalence Partitioning

### HOST-EP-03 — Who owns and loads the settings code
**Req:** R-HOST-11, R-ARCH-05, R-FB-01, R-HOST-04, R-BND-01, R-BND-02 · **Level:** unit (static import analysis), integration (rows 6–7, a started child) · **Flags:** TQ-R4 (decided B)

| # | Check | Expected |
| --- | --- | --- |
| 1 | any `fishball-core` file importing from `fishball-instance`, or the reverse | none (both import `fishball-shared` only) |
| 2 | `native-web.js`, `settings-relay.js`, `slim/host/*`, the status-line module | exist only in `fishball-instance` |
| 3 | core's settings-section extension point | names nothing hosting-specific (no hosted flag, no instance types) |
| 4 | the hosted-only sections | registered only through the extension point |
| 5 | the instance's host UI | none: no `dsh.client` in the instance manifest (after R-EMBED) |
| 6 | the child's launch overlays | no settings row and no guard row; only HMR, origin and port, admission key and target URL (R-HOST-04), plus the child isolation config patches (`agent-instructions` `projectRootMarkers: []`, `skill-filesystem` limited to the child's home with `includeDefaultRoots: false`, and the preset rows that nest them), so Fishball never reads the user's skills or project instructions (Fishball, 2026-11-15, isolation) |
| 7 | the child's profile bundles and the instance's placement record | the four set members **plus** `fishball-hosted-settings`; a standalone DSH's profile never contains it |

### HOST-EP-01 — What the instance's host row may inject
**Req:** R-ARCH-05, R-SEC-01 · **Level:** unit (manifest/static) · **Flags:** —

| # | Service class | Expected in `inject` |
| --- | --- | --- |
| 1 | lifecycle, webserver, credentials, settings, storage | allowed |
| 2 | `fishballConnectorTokens?` (optional) | allowed |
| 3 | any session, approval, question, prompt service | absent |
| 4 | browser client module | absent (no UI from I) |

### HOST-EP-02 — Where the token value may appear
**Req:** R-HOST-05, R-TOK-04, R-SEC-02 · **Level:** integration · **Flags:** —

Plant a recognisable value; run start, restart, crash, reinstall, uninstall.

| # | Place | Expected |
| --- | --- | --- |
| 1 | host credential store | present (the one allowed place) |
| 2 | child home, child profile, vendor copies | absent |
| 3 | launch overlays, lifecycle state files | absent (only the non-secret entry key) |
| 4 | child process argv and environment | absent |
| 5 | temp directories, logs of host and child | absent |
| 6 | embed-UI responses and the frame URL | absent |
| 7 | the lifecycle wire after `auth accepted` | present only on the `mcp-credential` channel (D§5.4) |

## Decision Tables

### HOST-DT-01 — Does the instance create a hosted token?
**Req:** R-HOST-05, R-HOST-09, R-HOST-10, §4.1 · **Level:** unit · **Flags:** —

| Rule | Target | Child holds paired credential | Hosted entry state | User pressed Retry | Action |
| --- | --- | --- | --- | --- | --- |
| 1 | blank, C here | no (first start) | none | — | create new entry; child pairs |
| 2 | blank, C here | yes | enabled | — | create nothing; reconnect |
| 3 | blank, C here | yes | disabled by the user | — | create nothing; `token-revoked` |
| 4 | blank, C here | yes (stale) | deleted by the user | no | create nothing |
| 5 | blank, C here | yes (stale) | deleted by the user | yes | create new entry; child pairs; no succession |
| 6 | blank, C here | no (child reinstalled) | old one enabled | — | create new entry; pair; then succession |
| 7 | blank, C here | — | `pair` answers `already-paired` | — | create another new entry |
| 8 | blank, no C here | — | — | — | nothing; `target-unreachable` |
| 9 | remote | any | — | — | never; use `target.tokenRef` |

### HOST-DT-02 — Succession eligibility
**Req:** R-HOST-09, R-HOST-10 · **Level:** unit · **Flags:** —

| Rule | Trigger | Old entry created by I | New pairing succeeded | Result |
| --- | --- | --- | --- | --- |
| 1 | reinstall / child home removed | yes | yes | succession |
| 2 | reinstall | yes | no | no succession yet (retry next start) |
| 3 | reinstall | no (user-made) | yes | refused; nothing moves |
| 4 | user delete + Retry | — | yes | no succession |
| 5 | restart | yes | (no new pairing) | nothing |

### HOST-DT-03 — `fishball-hosted-settings` at child start
**Req:** R-HOST-11, R-BND-02, R-BND-03, R-BND-04, R-FB-02, R-FB-09, R-BND-05 · **Level:** integration · **Flags:** TQ-R4 (decided B)

| Rule | Mode | In placement record | Present in child profile | Owner's last state | Compatible | Result after start | Settings panel |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | hosted | no (first placement) | no | — | yes | placed, **on** | generic + hosted sections |
| 2 | hosted | yes | yes | on | yes | on | generic + hosted |
| 3 | hosted | yes | yes | off | yes | off | generic only; no error, no placeholder |
| 4 | hosted | yes | no (deleted while off) | off | yes | re-placed **off** | generic only |
| 5 | hosted | yes | no (deleted while on) | on | yes | re-placed on | generic + hosted |
| 6 | hosted | yes | yes | on | yes | on; core's guards leave it enabled; `guards-overridden` does not name it | generic + hosted |
| 7 | hosted | yes | yes | on | **no** | child start **blocked**; status names `fishball-hosted-settings` and the reason | — |
| 8 | hosted | yes | yes | off | no | start not blocked (only enabled bundles block) | generic only |
| 9 | hosted | toggled while the child runs | | | | effect at the next restart; UI says "restart required" | |
| 10 | standalone | — | never | — | — | not present; core reports no missing member for it | generic only |

## State Transitions

### HOST-ST-01 — Child lifecycle
**Req:** R-HOST-02, R-BND-03, R-FB-10, R-HOST-06 · **Level:** integration · **Flags:** K (status codes)

| # | From | Event | To | Locator status |
| --- | --- | --- | --- | --- |
| 1 | Stopped | host app ready | Starting | starting |
| 2 | Starting | ready | Running | ready, origin set |
| 3 | Starting | incompatible member | Failed | `PROFILE_INCOMPATIBLE` naming it |
| 4 | Running | crash | Failed | crash code |
| 5 | Failed | Retry | Starting | |
| 6 | Running | restart | Starting | origin null until ready |
| 7 | Running | host exits | Stopped | |
| 8 | Running (core disabled) | — | Running | `fishball-off` |
| 9 | Stopped | Retry before host ready | Stopped | K |
| 10 | Running | uninstall | Removed | export offered first |

### HOST-ST-02 — Hosted principal across reinstall
**Req:** R-HOST-09, R-NAME-07 · **Level:** integration · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | Old(Eo) active | reinstall | Old(Eo) + New(En) provisional |
| 2 | Old + New provisional | succession ok | New(En) only, with Eo's sessions, role, name |
| 3 | Old + New provisional | succession fails | Old + New provisional (retry at next start) |
| 4 | Old + New provisional | next start, succession ok | New(En) only |
| 5 | New(En) only | answer with Eo's old offer id | `expired` |
