# F-LINK-SAVE: Use Cases and case derivation

Black-box cases for core's saved credentials and Connect (`createLinkCredentials`,
`packages/core/src/link/`). The only sources are the requirements relayed in the test brief (R7,
R9, R10, R12 = B, R14, the user's answer Q-LS1 = A of 2026-11-16), the frozen K3a contract
(`packages/core/contracts/link.d.ts`, `connect.d.ts`, `constants.js`), and F-PAIR's relayed words.
The implementation was not read.

The cases run on each SDK (0.2.1-rc.5, 0.2.2-rc.1), using that SDK's real `dsh-credentials-local`
(in a temp root) and real `dsh-authorization`. F-PAIR's real pairing and records sit on top, in
real DSH storage. The other side is the fake connector in [fakes.mjs](fakes.mjs), which is built
from K1's own builders. Every title is `<case id> <row> [SDK <v>] …`.

## Actors

- **Instance**: writes the hosted import or its Reconnect into `DSH_AGENT_TOKEN`. In the tests this
  is `ctx.credentials.set`.
- **User**: pastes a token into core's write-only field (the same reference), sets
  `connect.clientMetadataUrl`, and changes the target URL.
- **Owner**: approves on the connector's approval page in the browser, typing a connector token and
  optionally a name.
- **Connector**: the target. It accepts, refuses, binds and rotates.

## REM-UC-04: core saves the connection once, on first acceptance (R7, R9, R10)

- **Preconditions:** one target URL. Core has its `identity.id`.
- **Main flow (hosted, or standalone with a pasted token):**
  1. The token is in `DSH_AGENT_TOKEN`.
  2. Core sends it as the client secret with `client_credentials`, using client id `identity.id`.
  3. The target accepts it. Core writes `fishball-core/hosted-agent` (kind `grant`; the value is
     keyed by origin inside the payload) exactly once, then unsets the reference.
  4. Connect reports `authorized`.
  5. After a restart the saved copy connects. There is no new `pair`, no warning and no new write.
- **Main flow (Connect):**
  1. `begin()` returns the approval URL. It uses authorization code with PKCE S256, `state`,
     `resource` and `agent_id=<identity.id>`, has the CIMD URL as client id, and sets the loopback
     `/callback` as `redirect_uri`.
  2. Connect is `authorizing`. Nothing has been exchanged yet.
  3. The owner approves. The page binds the entry to core's id and sets the name.
  4. The code is exchanged with no secret. One grant record is saved under `fishball-core`.
  5. Connect is `authorized`. `onChange` fires and the link reconnects using the grant.
  6. `pair` answers `already-paired` with `idMatches: true`. The paired record is written with no
     warning, and `set_name` is not sent.
- **Alternative flows:**
  - A1: the page left the name empty, so core sends `set_name` once with its requested name.
  - A2 (Q-LS1 accepted): a saved copy works and a different value arrives in the reference. Core
    tries the new value first. It is accepted, replaces the saved copy once, and the reference is
    cleared.
  - A3: a Connect that completes for an origin replaces the hosted copy for that origin.
  - A4: an accepted reference token replaces the Connect grant for that origin.
- **Exception flows:**
  - E1: the reference token is refused and nothing is saved. The link reports `token-refused` /
    `TOKEN_REFUSED` and core retries with bounded backoff. Nothing is saved and the value stays in
    the reference.
  - E2 (Q-LS1 refused): a saved copy works and a different value is refused. Nothing is saved, the
    value stays, and core goes back to the saved copy.
  - E3 (R12 = B): no CIMD URL. Connect reports `needs-configuration` / `metadata-url-missing` and
    sends nothing.
  - E4: the owner cancels. Connect reports `failed` / `access_denied` and nothing is saved.
  - E5: the code exchange is refused. Connect reports `failed` / `invalid_grant`, nothing is saved,
    and there is no reconnect.
  - E6 and E7: the callback has a wrong `iss` or `state`. The code is not exchanged and nothing is
    saved.
  - E8 (R9): the target origin changes. This is a new first connection, and the old origin's value
    is never sent to the new one.
  - E9: refresh answers `invalid_grant`. The tokens are dropped and Connect reports
    `needs-authorization` once, with no retry loop.
- **Postconditions:** no token, code, verifier, access token or refresh token appears in any log,
  status, setting, pairing record or home file. Core writes no reference except its own unset of
  `DSH_AGENT_TOKEN`.

## REM-ST-01: one origin's saved credential, and Connect

States of the saved credential:

| State | Meaning |
| --- | --- |
| None | nothing saved, reference empty |
| RefPending | nothing saved, a reference value not yet answered |
| RefRefused | nothing saved, the reference value refused |
| Saved | a working saved copy (hosted or Connect grant), reference empty |
| SavedNewRef | saved, plus a different reference value not yet tried |
| SavedRefusedRef | saved and connected, plus a reference value refused in this run |
| SavedRefused | a saved copy the target refuses now |

Connect states are `CONNECT.state`.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | None | reference set, accepted | Saved | one write, reference cleared |
| 2 | RefPending | refused | RefRefused | `token-refused`, nothing saved, value stays |
| 3 | RefRefused | different value accepted | Saved | the refused value is never saved |
| 4 | Saved | reconnect | Saved | the saved value is sent, no write |
| 5 | Saved | different value, accepted | Saved | new value saved |
| 6 | SavedNewRef | refused | SavedRefusedRef | connected on the saved copy, value stays |
| 7 | SavedRefusedRef | reconnects | SavedRefusedRef | the refused value is not sent again |
| 7 (same value) | SavedRefusedRef | the same value written again | SavedRefusedRef | not sent again |
| 8 | SavedRefusedRef | reference value changes | SavedNewRef | the new value is tried |
| 9 | SavedRefusedRef | restart | SavedNewRef | the value is tried again |
| 10 | Saved | the copy is refused (entry off) | SavedRefused | `token-refused` / `token-revoked`, copy kept, Connect not `authorized` |
| 11 | SavedRefused | entry on again | Saved | connected, no `pair` |
| 12 | SavedRefused | different value accepted | Saved | copy replaced |
| 13 | needs-configuration | valid CIMD URL set | needs-authorization | `begin()` answers a URL |
| 14 | needs-authorization | `begin()` | authorizing | a second `begin()` answers the same URL |
| 15 | authorizing | `cancel()` | needs-authorization / failed | the old URL saves nothing |
| 16 | authorizing | approved | authorized | `begin()` answers `authorized` |
| 17 | failed | `begin()`, approved | authorized | link connects |
| 18 | authorized | restart | authorized | no browser, no `pair` |
| 19 | authorized | access token dies | authorized | single-flight refresh rotates the record in place |
| invalid | needs-configuration | `begin()` | needs-configuration | nothing sent |
| invalid | authorized | callback replayed | authorized | no second write or exchange |

## Equivalence Partitioning

- **FLS-EP-01 `connect.clientMetadataUrl`:**

  | # | Value | Outcome |
  | --- | --- | --- |
  | 1 | absent | `metadata-url-missing` |
  | 2 | empty | `metadata-url-missing` |
  | 3 | `http:` | `metadata-url-not-https` |
  | 4 | `https:` with `/` | `metadata-url-root-path` |
  | 5 | `https:` with no path | `metadata-url-root-path` |
  | 6 | valid | an approval URL |

- **FLS-EP-02, the connector check:** each failing class answers `not-a-connector` before any
  authorization request.

  | # | Metadata | Outcome |
  | --- | --- | --- |
  | 1 | resource path is not `/api/agent/mcp` | `not-a-connector` |
  | 2 | first authorization server on another origin | `not-a-connector` |
  | 3 | first authorization server on another path | `not-a-connector` |
  | 4 | scopes without `agent` | `not-a-connector` |
  | 5 | scopes absent | `not-a-connector` |
  | 6 | the connector's own metadata | passes |

- **FLS-EP-03, where values may be:**
  1. On the hosted path, no value is found outside the credential store.
  2. On the Connect path, no code, verifier, access or refresh token is found outside the store,
     and the typed connector token is found nowhere, the store included.
  3. On the refused and failed paths, no value appears.
- **FLS-EP-04, which credential keys core writes:**
  1. References: only its own unset of `DSH_AGENT_TOKEN`. The user's reference is untouched.
  2. Records: only under `fishball-core/`.
- **FLS-EP-05, nothing saved before acceptance:**
  1. An unreachable target.
  2. Connect still `authorizing`.

## Decision Tables

**FLS-DT-01: what core presents to the current origin.**

| Rule | Saved for this origin | Reference | Refused this run | Presented |
| --- | --- | --- | --- | --- |
| 1 | no | empty | — | nothing |
| 2 | no | value | — | the reference |
| 3 | yes | empty | — | the saved copy |
| 4 | yes | the same value | — | that value; no new `pair` |
| 5 | yes | a different value | no | the reference first |
| 6 | yes | a different value | yes | the saved copy only |
| 7 | for another origin only | empty | — | nothing to this origin |

**FLS-DT-02: pairing after a save.**

| Rule | Credential | Outcome |
| --- | --- | --- |
| 1 | the same value, after a restart | no `pair`, no warning |
| 2 | a different value | `pair` on it |
| 3 | a Connect grant bound by the page | `already-paired` match, paired, no warning |
| 4 | a hosted token already bound to core's id (not Connect) | F-PAIR's warning still shows |

**FLS-DT-03: when `onChange` fires.**

| Rule | Event | `onChange` |
| --- | --- | --- |
| 1 | a new value in the reference | once (core's own unset adds none) |
| 2 | a Connect grant saved | once |
| 3 | a failed Connect | none |
| 4 | after `dispose()` | none |

## Boundary Value Analysis

- **FLS-BVA-01, the refused-reference retry with nothing saved:** the first retry comes no sooner
  than `LINK_BACKOFF.initialMs`, and each later gap is at least `initialMs × factor^n`.
- **FLS-BVA-02, the CIMD URL path:**
  1. `/` is refused as a root path.
  2. `/a` is accepted.
- **FLS-BVA-03 (R14):** a grant ten years old still refreshes, because there is no chain-age cap.

## FLS-FIXTURE row 1: discovery stays on the fixture

Both advertised names (`localhost`, `127.0.0.1`) reach this fake's protected-resource metadata. Observe
its exact loopback listeners before requesting either name: another listener cannot shadow those
bindings, and the test never needs to contact an unowned port or depend on a port collision.

## F-FIX security rows (audit `.runtime/reports/x-sec-audit.md` X-11, X-12, X-13)

- **X-11 (design §6.3: credentials are never forwarded on a redirect):** EP over four steps
  (protected-resource discovery, authorization-server discovery, the code exchange, refresh) × BVA
  over 301, 302, 303, 307 and 308. The answer points at a trap on another origin, and the trap
  gets no request.
  - Discovery or exchange: Connect ends `failed`, and no grant is saved.
  - Refresh: the saved grant is unchanged.
- **X-12 (endpoint pinning, before any authorization request):**
  - `token_endpoint` must be exactly `<target origin>/api/agent/oauth/token`. Another origin,
    another port, another path, the https twin, the other loopback name or a trailing slash →
    `needs-configuration` / `not-a-connector`.
  - `authorization_endpoint` is accepted when it is https on any host, or http on exactly
    `localhost`, `127.0.0.1` or `[::1]`. http on another host, on `foo.localhost` or on
    `127.0.0.2` → `not-a-connector`.
  - A document the metadata schema refuses (an endpoint absent, `not a url`, `javascript:`) is a
    failed discovery, not a connector refusal (F-FIX requirement correction). begin() rejects and
    Connect reads `failed`.
- **X-13 (R-OA-02: refuse an authorization server without S256):** `code_challenge_methods_supported`
  absent, `[]` or `['plain']` → no approval URL, Connect `failed`. `['S256']` and `['plain','S256']`
  → authorized, with S256 in the URL.

## E-FIX-3: Connect's MCP client load logs its failure (`import-fault.mjs`)

Requirement (relayed by Fishball, 2026-11-17, the F-FIX-3 leftover): `createLinkCredentials`
without an `sdk` option loads `@modelcontextprotocol/client` itself, for Connect and for the
saved-grant token manager. When that load fails it logs ONE
`warn(LINK_SAVE.text.failed, LINK_MCP.clientImport, codeOf(error))` on
`ctx.logger(LINK_SAVE.logger)` per failed load attempt, and rethrows. Connect still reports no
approval URL and is neither `authorizing` nor `authorized`. No secret is logged (no token, client
secret, URL query or error message). A successful load logs nothing. A supplied `sdk` is never
imported.

The world (subject.mjs) gains `noSdk` (core gets no `sdk` option) and `logger` (a recorder). The
fault and the secret-free oracle are the link suite's (`../link/import-fault.mjs`,
`../link/log-privacy.mjs`). "One per failed load attempt" is checked as: the import warnings equal
the loads the hook refused, and there is at least one per `begin()`.

| Id | Technique | Case |
| --- | --- | --- |
| EFIX3-LS-EP-01 rows 1–11 | EP / BVA | The thrown-value partitions of log-privacy.mjs (`code` set, `0`, `''`, `null`; name only; a plain Error; a string, `undefined`, `null`, an object, a number) give that code, and no secret. |
| EFIX3-LS-DT-01 rule 1 | Decision Table | No sdk and a failing import: Connect unavailable or failed, warnings as above. |
| EFIX3-LS-DT-01 rule 2 | Decision Table | No sdk and a working import: an approval URL, no import warning. |
| EFIX3-LS-DT-01 rule 3 | Decision Table | An sdk supplied: never imported, an approval URL, no warning. |
| EFIX3-LS-BVA-01 1 / 2 / 3 begins | BVA | Warnings equal the failed loads, at least one per begin. |
| EFIX3-LS-ST-01 1 | State Transition | Failing, then loads again: the next begin gives the URL and adds no warning. |
| EFIX3-LS-ST-01 2 | State Transition | A grant saved with no sdk (no warning), then a restart while the import fails: the token manager warns once per failed load, the link is not connected, no secret. |

## MULTI-1 (per-target credentials; contracts README "Added credentials", "Hosted reservation", security amendment)

Seam (relayed 2026-11-18): `createLinkCredentials(ctx, {names: credentialNames({targetId, endpointEpoch}), …})`,
`createRecords(table, {targetId, endpointEpoch})`. The F-LINK-SAVE rows run as the parent on one fixed
epoch (`PARENT_SOURCE`); identity rows likewise.

Re-baselined: RFIX-F01-EP-01 and F01-ST-01 "back to A" read the pending binding at
`payload.binding = {targetId: parent, endpointEpoch, origin, agentId}` (was `payload.origin`);
RFIX-F10-DT-01: a grant whose binding names another agentId is not used at all (was "held id-mismatch"),
per "All four binding members must match before use".

| Row | Technique | Oracle |
| --- | --- | --- |
| MULTI-CRED-EP-01 names | EP (parent / added) | core's credentialNames equal the frozen names; an added target has no pending record |
| MULTI-CRED-EP-02 added target | EP (added target accepted) | saved only as `fishball-core/token-<id>-<epoch>`, binding = `{targetId, endpointEpoch, origin, agentId}`; parent names untouched |
| MULTI-CRED-DT-01 binding mismatch | DT (epoch differs / agentId differs) | the saved copy is not presented; not connected |
| MULTI-CRED-ST-01 parent epoch retired | ST (E1 bound → same-origin E2 → restart) | the E1 hosted copy is not used for E2 |
