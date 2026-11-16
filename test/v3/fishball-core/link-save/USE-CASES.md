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
