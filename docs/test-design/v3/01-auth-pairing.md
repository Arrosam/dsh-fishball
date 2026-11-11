# 1. OAuth client credentials, tokens and pairing (AUTH)

Requirements: R-TOK-00…10, R-OA-01…10, R-ID-01…12, requirements §4.1. Conventions:
[README](<README.md>).

## Use Cases

### AUTH-UC-01 — The user creates a token entry for an external agent
**Req:** R-TOK-03, R-TOK-04, R-TOK-08, R-CON-10, R-ID-12 · **Level:** integration · **Flags:** D§5.2 (`fbt_` prefix), TQ-4 (decided A)

- **Actor:** DSH owner (user) of main DSH M.
- **Preconditions:** C is installed and enabled in M; the credential store is writable; no entry uses ref `FB_EXT_1`.
- **Main flow:**
  1. In DSH's native Plugins → `fishball-connector` settings form, the user adds an entry `{label: "Agent A", enabled: true, ref: FB_EXT_1}` and saves.
  2. C sees the settings change, finds `FB_EXT_1` unconfigured and writable, and generates a value.
  3. The user reads the value from their own credential store and gives it to the agent.
- **Alternative flows:**
  - A1. The user already stored a value of at least 32 characters under `FB_EXT_1` (store or environment) before enabling → C uses it unchanged; nothing is generated or overwritten.
  - A2. The entry is saved with `enabled: false` → no value is generated until it is enabled.
- **Exception flows:**
  - E1. The user-set value has fewer than 32 characters → the entry's status is `token-too-short`; the token endpoint answers `invalid_client` for it.
  - E2. The credential store cannot be written → the entry's status is `token-unconfigured`; it cannot be used (`invalid_client`), and no value is written anywhere else.
  - E3. The user saves a second entry with the same `ref` → the save is refused with `ref-duplicate`; the previous settings stay.
- **Postconditions:**
  - The generated value has ≥ 256 bits of entropy (32 random bytes, base64url, prefix `fbt_`, D§5.2) and lives only in `ctx.credentials` under `FB_EXT_1`.
  - The settings document contains `label`, `enabled`, `ref`, never the value; no DSH UI, log, browser response or settings read-back contains it (grep for the planted value).
  - The form shows the entry read-only as **unpaired**, with no bound id, no name and no `lastSeenAt` (R-ID-12). No custom settings UI exists (R-CON-10).

### AUTH-UC-02 — An external agent authenticates and pairs for the first time
**Req:** R-OA-01, R-OA-03, R-OA-04, R-OA-05, R-OA-07, R-OA-09, R-ID-01, R-ID-03, R-ID-06, R-ID-08, R-ID-12, R-EXT-05, R-TOK-01 · **Level:** integration · **Flags:** P:S7, P:S3 (race), K

- **Actor:** an external MCP agent with client credentials support.
- **Preconditions:** entry E1 enabled, value `v(E1)`, unbound; the agent is configured with the MCP URL, `client_id = "agent-a"`, `client_secret = v(E1)`.
- **Main flow:**
  1. The agent sends an MCP request with no token → 401 with `WWW-Authenticate: Bearer resource_metadata="…"` and no `error=` attribute.
  2. It reads the protected resource metadata, then the authorization server metadata (`grant_types_supported: ["client_credentials"]`).
  3. It posts `grant_type=client_credentials`, `client_id=agent-a`, `client_secret=v(E1)`, `resource=<canonical MCP URI>` → 200 `{access_token, token_type: "Bearer", expires_in: 3600, fishball_pairing: "unpaired"}` and **no** `refresh_token`.
  4. With that pair-only AT it calls `server/discover` (advertises `io.modelcontextprotocol/oauth-client-credentials`) and `tools/list` (core tools and `pair`; **no** contributed tool even when a contributor is loaded).
  5. It calls `pair({})` → `{ok: true, paired: true, id: "agent-a", name: "Fishball"}` (lowest free default, see NAME).
  6. With the **same** AT it calls `inbox_poll`, opens `subscriptions/listen` on `fishball://events` and calls `tools/list` → all succeed, and `tools/list` now includes contributed tools.
- **Alternative flows:**
  - A1. The agent passes `pair({name: "Agent A"})` with a free name → `name: "Agent A", nameAssigned: true`.
  - A2. The agent authenticates with `client_secret_post` instead of `client_secret_basic` → same results.
- **Exception flows:**
  - E1. The agent has no id (`client_id` absent or empty) → `invalid_client`; it cannot get any AT (R-ID-08).
  - E2. Two agents race `pair` on E1 with ids `a` and `b` → exactly one binds; the other gets `already-paired` with `idMatches: false` (P:S3).
  - E3. Before step 5 the agent calls `session_start` → `not-paired`, nothing started.
- **Postconditions:** E1 is bound to `agent-a` durably (survives connector restart), `pairedAt` set; the native settings show E1 paired, bound id `agent-a`, its name, `lastSeenAt`, connected = yes (R-ID-12). The connector never generated or suggested an id (R-ID-08).

### AUTH-UC-03 — A paired client reconnects, restarts or outlives its access token
**Req:** R-ID-05, R-OA-07, R-OA-04, R-OA-05, R-TOK-01 · **Level:** integration · **Flags:** TQ-5 (decided A)

- **Actor:** a paired client P(E1, `agent-a`) (external agent or Fishball DSH).
- **Preconditions:** E1 bound to `agent-a`; the client holds a full AT issued at t0.
- **Main flow:**
  1. At t0 + 3600 the client's request gets 401 (`error="invalid_token"`).
  2. It re-authenticates with `agent-a` + `v(E1)` → full AT, `fishball_pairing: "paired"`.
  3. It continues work; it does **not** call `pair`.
- **Alternative flows:**
  - A1. The client process restarts → step 2 directly; same result.
  - A2. The connector's DSH restarts → every old AT gets 401 (access tokens are held in memory only); step 2 yields a full AT with the pair intact.
- **Exception flows:**
  - E1. Between 1 and 2, E1 was disabled → step 2 gets `invalid_client`.
  - E2. The client sends `grant_type=refresh_token` → `unsupported_grant_type`.
- **Postconditions:** the pair, name and mailbox are unchanged; `pair` was never called; the re-authentication never fails because E1 is already bound to `agent-a`.

### AUTH-UC-04 — An agent tries a second handshake on a bound token
**Req:** R-ID-04, R-ID-08, R-ID-11, R-TOK-00 · **Level:** integration · **Flags:** —

- **Actor:** an external agent.
- **Preconditions:** E1 bound to `123`, name "Fishball", `pairedAt` T1, `lastSeenAt` T2.
- **Main flow (same id):**
  1. Agent B authenticates with `123` + `v(E1)` → full AT, `paired`.
  2. B calls `pair` → `{ok: false, code: "already-paired", bound: {idMatches: true, boundId: "123", name: "Fishball", pairedAt: T1, lastSeenAt: T2}, advice: "continue with this token and id only if no other agent uses this id with this token; otherwise use a new token"}`.
  3. B decides to continue → it simply uses its full AT; nothing changes at C.
- **Alternative flows:**
  - A1. Agent B uses id `999` → pair-only AT with `fishball_pairing: "id-mismatch"`; `pair` returns `already-paired`, `idMatches: false`, `advice: "use a new token"`; any other call → `id-mismatch`.
  - A2. B switches to a new token E2 (unbound) and any id → pairs normally.
- **Exception flows:**
  - E1. B presents an invalid token with id `123` → `invalid_client`; **no** `already-paired` result and no field of the bound pair is revealed.
- **Postconditions:** E1 stays bound to `123`; no re-pairing occurred; agent B with E1 + `123` is the same principal as the original (R-ID-11: same mailbox).

### AUTH-UC-05 — Fishball core pairs, or meets `already-paired`, on its Fishball page
**Req:** R-ID-07, R-ID-10, R-FB-04, R-NAME-03 · **Level:** e2e (page), integration (core decisions) · **Flags:** —

- **Actor:** the owner of a Fishball DSH (hosted or standalone), and `fishball-core`.
- **Preconditions:** core has a target and a token reference; `identity.id` set.
- **Main flow:**
  1. Core finds no local "paired" record for (target, token reference); it authenticates and calls `pair({name: identity.name})`.
  2. On success it writes the record (non-secret) and works.
  3. On every later reconnect it skips `pair`.
- **Alternative flows:**
  - A1. `pair` returns `already-paired`, `idMatches: true` → the Fishball page shows a warning with the bound pair's name and `lastSeenAt`; **Continue with this pairing** is disabled; the user ticks "No other Fishball or agent uses this id with this token" → Continue is enabled; Continue → core writes the record and works, without another `pair` call.
  - A2. Same as A1, the user chooses **Use a new token** (and optionally a new id) → core stops using the old token; once a new reference is set it pairs again.
  - A3. `idMatches: false` → only **Use a new token** is offered.
  - A4. The owner changes `identity.id` after pairing → the next token request answers `id-mismatch`; core's status says a new token is needed.
- **Exception flows:**
  - E1. While the warning is open, core sends **nothing else** to the target (no tool call, no subscription, no `set_name`).
- **Postconditions:** the paired record exists only after success or Continue; no secret is written by the record.

### AUTH-UC-06 — The user revokes a principal by disabling, deleting or changing its token
**Req:** R-TOK-05, R-TOK-09, R-OA-06, R-ID-09, R-ROUTE-06, R-ROUTE-04, R-WATCH-01 · **Level:** integration · **Flags:** D§5.3, TQ-2 (decided A), TQ-5 (decided A)

- **Actor:** DSH owner.
- **Preconditions:** P(E1, `a`) is bound and is the designated Fishball. It has an open listen stream, manages S1 (with a live permission offer O1) and S2, and has a pending `approval_answer` in flight. Its mailbox holds queued `message`, `turn-finished` and `notice` events and one `ask` event from unmanaged session S3, whose `ask_fishball` call is still waiting. E1's value was generated by C.
- **Main flow (disable):**
  1. The user switches E1 off.
  2. The **next** MCP request with any AT derived from E1 gets 401; the token endpoint answers `invalid_client`.
  3. The open listen stream closes; the answer sent after the revocation is refused; O1 is withdrawn (a `retirement` event follows) and goes to the user in S1.
  4. S1 and S2 become unmanaged, each with exactly one `system` note.
  5. Every other queued event, the `ask` included, is kept for 30 days; S3's `ask_fishball` keeps waiting (no timer).
  6. E1 stays the designated Fishball: a new `ask_fishball` from an unmanaged session answers `unavailable` at once; a new `message_fishball` queues.
  7. The user switches E1 on again → old ATs still get 401; a new token request with `a` returns a **full** AT, `paired`; the kept events, S3's `ask` included, are pollable.
- **Alternative flows:**
  - A1. The user **deletes** E1 → steps 2–4 hold; every queued event is dropped; S3's waiting `ask_fishball` returns `unavailable`; `routing.fishballToken` is cleared (R-ROUTE-04's default applies); C unsets the generated value from the credential store; the pair is gone.
  - A4. E1 stays disabled for 30 days → the kept events are dropped as on delete, and S3's `ask_fishball` returns `unavailable` then.
  - A2. E1's value was supplied by the user → after delete the value is still in the credential store.
  - A3. The user changes E1's value → all ATs derived from the old value get 401 on the next request; the new value authenticates.
- **Exception flows:**
  - E1. A request already past the token check when the revocation lands (the in-flight `approval_answer`) → it completes normally; the next request is refused.
- **Postconditions:** after a disable E1 stays bound to `a` (R-ID-09); there is no unpair operation.

### AUTH-UC-07 — A client that cannot do OAuth uses the direct-access fallback
**Req:** R-OA-10, R-TOK-00, R-TOK-04, R-TOK-06, R-REM-03, R-ID-03, R-ID-02 · **Level:** integration · **Flags:** TQ-1 (decided C)

- **Actor:** an external MCP client with static headers only.
- **Preconditions:** E1 enabled and unbound; `directAccess` of E1 off (default).
- **Main flow:**
  1. The client sends `Authorization: Bearer agent-a.<v(E1)>` → 401, identical to any invalid AT.
  2. The user turns `directAccess` on for E1.
  3. The same request reaches only discovery, `tools/list` and `pair` (pair-only); `pair` binds E1 to `agent-a`.
  4. Every later request with that header is treated as full; the token part is checked each time.
- **Alternative flows:**
  - A1. E1 is already bound to `x`; the client uses `agent-a.<v(E1)>` → pair-only of a mismatching id: `pair` → `already-paired` `idMatches: false`, other calls → `id-mismatch`.
- **Exception flows:**
  - E1. The user turns the switch off → the next such request gets 401.
  - E2. E1 is disabled → the next such request gets 401.
  - E3. The client sends the header from a disallowed `Origin` → 403 before any token check.
  - E4. The client's id contains a dot (`agent.a`) → `agent.a.<v(E1)>` splits at the first dot into id `agent` and a token part `a.<v(E1)>` that matches nothing → 401. The same id at the token endpoint gets `invalid_client` (AUTH-EP-03).
- **Postconditions:** the header value is never logged (grep); rate limits count these requests like any other.

### AUTH-UC-08 — A standard MCP client is set up with configuration only
**Req:** R-OA-01, R-OA-02, R-OA-05, R-OA-09, R-CON-01 · **Level:** integration · **Flags:** P:S1, P:S7

- **Actor:** the stock `ClientCredentialsProvider` of `@modelcontextprotocol/client` 2.2.0 on each DSH SDK, and one non-DSH client-credentials client.
- **Preconditions:** E1 enabled; the client is pinned to `2026-07-28` and configured with endpoint URL, client id, client secret and expected issuer.
- **Main flow:** discovery of protected resource metadata (at the path-inserted well-known URI and in the 401's `resource_metadata`) → authorization server metadata (issuer has the path `/api/fishball/oauth`, D§5.5) → token → `server/discover` → `tools/list` → a tool call → `subscriptions/listen`.
- **Alternative flows:** A1. The expected issuer differs from the metadata → the client refuses to send the secret (client-side pinning).
- **Exception flows:** E1. The client asks the AS metadata for an authorization endpoint or registration endpoint → none listed; requests to such paths are not served.
- **Postconditions:** the AT is audience-bound: the same AT presented to another resource URI is refused.

### AUTH-UC-09 — The user inspects pair status in the native settings
**Req:** R-ID-12, R-NAME-05, R-TOK-08, R-CON-10 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner.
- **Preconditions:** entries E1 (unpaired), E2 (paired to `b`, named "Fishball-2", connected), E3 (paired, disabled).
- **Main flow:** open Plugins → `fishball-connector` settings. Each entry shows read-only: paired/unpaired, bound id, name, `lastSeenAt`, connected now.
- **Alternative flows:** A1. E2 renames itself with `set_name` → after a refresh the form shows the new name.
- **Exception flows:** E1. The read-only fields cannot be edited and saving the form never changes them.
- **Postconditions:** no token value is visible anywhere on the page or in the page's network responses.

## Equivalence Partitioning

### AUTH-EP-01 — Token endpoint request classes
**Req:** R-OA-02, R-OA-03, R-OA-05, R-OA-07, R-OA-08, R-TOK-02 · **Level:** integration · **Flags:** TQ-3 (decided A, confirmed by S7), D§5.5

| # | Class | Input | Expected |
| --- | --- | --- | --- |
| 1 | valid basic | POST form, `client_credentials`, basic auth, valid id + enabled token, canonical `resource` | 200 AT |
| 2 | valid post | as 1 with `client_secret_post` | 200 AT |
| 3 | other grant | `refresh_token` | `unsupported_grant_type` |
| 4 | other grant | `authorization_code` / `password` | `unsupported_grant_type` |
| 5 | grant missing | no `grant_type` | `unsupported_grant_type` or `invalid_request` (K); no AT |
| 6 | wrong method | GET on the token endpoint | refused, no AT (K: 405) |
| 7 | resource foreign | `resource=https://other/mcp` | `invalid_target`, no AT |
| 8 | resource absent | no `resource` | `invalid_target`, no AT |
| 8a | stock `ClientCredentialsProvider` (2.2.0), both SDKs | default configuration | sends the canonical `resource`; 200 AT (S7) |
| 9 | secret in query | valid form plus `?client_secret=…` in the URL | refused even though the form is valid (by R-TOK-02's rule) |
| 10 | no client auth | id only | `invalid_client` |
| 11 | no refresh token | any 200 response | has no `refresh_token` field |

### AUTH-EP-02 — Bearer value classes at the MCP endpoint
**Req:** R-TOK-01, R-TOK-02, R-OA-05, R-OA-06, R-OA-10, R-TOK-00 · **Level:** integration · **Flags:** —

Every 401 row: `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"`, `error="invalid_token"` whenever a value was presented, no MCP processing (no JSON-RPC body), no hint about any pair; all 401 bodies and headers are byte-identical apart from the absent/present `error`.

| # | Class | Expected |
| --- | --- | --- |
| 1 | no `Authorization` header | 401, no `error=` |
| 2 | non-Bearer scheme (`Basic …`) | 401 |
| 3 | random unknown value | 401 `invalid_token` |
| 4 | expired AT | 401 `invalid_token` |
| 5 | AT of a disabled / deleted / value-changed entry | 401 `invalid_token` |
| 6 | AT issued for another resource (audience) | 401 `invalid_token` |
| 7 | the raw token value `v(E1)` with `directAccess` off | 401 `invalid_token` |
| 8 | `<id>.<v(E1)>` with `directAccess` off | 401 `invalid_token` |
| 9 | valid pair-only AT | processed (pair-only power) |
| 10 | valid full AT | processed |
| 11 | valid full AT in header **and** `?access_token=` in the query | refused (K: 400/401), no processing |
| 12 | valid AT in query only | refused, no processing |
| 13 | `server/discover` without a token | 401 (no unauthenticated discovery) |
| 14 | `subscriptions/listen` without a token | 401 |

### AUTH-EP-03 — Fishball id classes
**Req:** R-ID-02, R-ID-10, R-ID-11, R-OA-03 · **Level:** unit (validator), integration (endpoint, core settings) · **Flags:** TQ-1 (decided C)

| # | Class | id | Expected at the token endpoint (valid enabled token) |
| --- | --- | --- | --- |
| 1 | letters | `abc` | accepted |
| 2 | all allowed chars | `Az_09-` | accepted |
| 2a | dot inside | `fb.1` | `invalid_client`; no AT, so `pair` is never reachable |
| 2b | leading / trailing dot, dot only | `.fb`, `fb.`, `.` | `invalid_client` |
| 2c | core setting `identity.id = "fb.1"` | saving the setting | refused `id-invalid`; previous id stays; core sends nothing with `fb.1` |
| 2d | generated `identity.id` | first start | `fb-` + 16 lowercase base32, no dot; accepted |
| 3 | space | `a b` | `invalid_client` |
| 4 | slash, colon, `@` | `a/b`, `a:b`, `a@b` | `invalid_client` |
| 5 | non-ASCII | `é`, `ｆｂ` (full-width) | `invalid_client` |
| 6 | control char | `a\u0000b` | `invalid_client` |
| 7 | case-sensitive | E1 bound to `abc`; request with `ABC` | pair-only, `id-mismatch` |
| 8 | same id on two tokens | E1 bound to `x`, E2 pairs `x` | both pairs exist; two principals with separate mailboxes |
| 9 | same token + same id from two clients | two processes with E1 + `x` | one principal; both see the same mailbox |

### AUTH-EP-04 — Token value classes at creation and use
**Req:** R-TOK-08, R-TOK-04, R-TOK-09 · **Level:** integration · **Flags:** TQ-4 (decided A)

| # | Class | Expected |
| --- | --- | --- |
| 1 | enabled, ref unconfigured, store writable | generated (32 random bytes, base64url, `fbt_`), stored with `credentials.set` |
| 2 | enabled, value set in store, ≥ 32 characters | used as is, never overwritten |
| 3 | enabled, value set in environment only, ≥ 32 characters | used as is; nothing written to the store |
| 4 | enabled, value set, < 32 characters | status `token-too-short`; `invalid_client` for that value |
| 5 | disabled, ref unconfigured | nothing generated |
| 6 | enabled, ref unconfigured, store not writable | status `token-unconfigured`; entry unusable (`invalid_client`); nothing written anywhere |
| 7 | two entries sharing one `ref` | settings save refused `ref-duplicate`; previous settings stay |
| 7a | two entries, distinct `ref`s, same value set by the user | not refused by the requirements (no rule): both authenticate as their own entry (K) |
| 8 | ten generated values | all distinct; none appears in settings, logs or any response |

### AUTH-EP-05 — Leakage on authentication failure
**Req:** R-TOK-00, R-TOK-06, R-OA-03, R-ID-04 · **Level:** integration · **Flags:** —

| # | Class of secret presented (id `123`) | Expected |
| --- | --- | --- |
| 1 | unknown | `invalid_client` (401) |
| 2 | disabled entry, bound to `123` | identical response to row 1 |
| 3 | deleted entry | identical to row 1 |
| 4 | enabled, bound to `123`, but secret off by one character | identical to row 1 |
| 5 | 100 failed attempts with random secrets, then the valid one from the same client | failures stay uniform; per-client rate limiting may refuse further attempts (K) but the response never says which tokens or ids exist |
| 6 | timing: unit test of the comparator | constant-time comparison primitive used for every token check (token endpoint and direct access) |

### AUTH-EP-06 — What a pair-only access token can reach
**Req:** R-OA-04, R-ID-06, R-EXT-05, R-TOK-10 · **Level:** integration · **Flags:** —

| # | Call with pair-only AT | Unbound entry | Entry bound to another id |
| --- | --- | --- | --- |
| 1 | `server/discover` | ok | ok |
| 2 | `tools/list` | core tools + `pair`, no contributed tools | same |
| 3 | `pair` | pairs | `already-paired`, `idMatches: false` |
| 4 | `sessions_list`, `session_start`, `approval_answer`, `set_name` | `not-paired` | `id-mismatch` |
| 5 | `inbox_poll`, `inbox_ack` | `not-paired` | `id-mismatch` |
| 6 | `subscriptions/listen` | `not-paired` | `id-mismatch` |
| 7 | `resources/read fishball://events` | `not-paired` | `id-mismatch` |
| 8 | a contributed tool call | refused (unknown tool or `not-paired`, K) and never reaches the contributor | same |

### AUTH-EP-07 — Principal identity sources
**Req:** R-TOK-07, R-ID-11 · **Level:** integration · **Flags:** —

| # | Variation | Expected |
| --- | --- | --- |
| 1 | same AT, different `clientInfo` in `_meta` | same principal |
| 2 | two different full ATs of the same pair | same principal, same mailbox |
| 3 | different pairs, identical `clientInfo` | different principals |
| 4 | a request field naming another principal (e.g. a `principal` argument) | ignored; acts as the AT's pair |

## Boundary Value Analysis

### AUTH-BVA-01 — Access token lifetime (3600 s)
**Req:** R-OA-07 · **Level:** unit (fake clock), integration · **Flags:** —

Issue at t0 (fake clock). `expires_in` equals 3600 in every response.

| # | Request at | Expected |
| --- | --- | --- |
| 1 | t0 | accepted |
| 2 | t0 + 1 | accepted |
| 3 | t0 + 3599 | accepted |
| 4 | t0 + 3599.999 | accepted |
| 5 | t0 + 3600 | 401 `invalid_token` ("at or after expiry") |
| 6 | t0 + 3601 | 401 |
| 7 | re-authentication at t0 + 3600 | new AT valid until t0 + 7200; pair unchanged, no `pair` call needed |
| 8 | the AT used at t0 + 3599 | its expiry is not extended by use (no rotation mid-life) |

### AUTH-BVA-02 — Fishball id length (1–64)
**Req:** R-ID-02 · **Level:** unit, integration · **Flags:** —

Ids below use only `a`; length 64 with one `.` is row 7.

| # | Length | Expected at the token endpoint | Expected in direct access `<id>.<token>` |
| --- | --- | --- | --- |
| 1 | 0 | `invalid_client` | 401 |
| 2 | 1 | accepted | accepted |
| 3 | 2 | accepted | accepted |
| 4 | 63 | accepted | accepted |
| 5 | 64 | accepted | accepted |
| 6 | 65 | `invalid_client` | 401 |
| 7 | 64 including one `.` | `invalid_client` (dot, not length) | 401 |

### AUTH-BVA-03 — Token value length at use
**Req:** R-TOK-08 · **Level:** unit · **Flags:** TQ-4 (decided A: minimum 32 characters)

| # | User-set length | Expected |
| --- | --- | --- |
| 1 | 0 (empty) | treated as unconfigured: generated (EP-04 #1) |
| 2 | 1 | `token-too-short` |
| 3 | 31 | `token-too-short`; `invalid_client` for that value |
| 4 | 32 | accepted |
| 5 | 33 | accepted |
| 6 | 32 with a multi-byte character (31 ASCII + `€`) | accepted (K: characters, not bytes) |
| 7 | generated | ≥ 32 characters (`fbt_` + 43 base64url), ≥ 256 bits of entropy |

### AUTH-BVA-04 — Direct-access header split
**Req:** R-OA-10, R-ID-02 · **Level:** unit · **Flags:** TQ-1 (decided C)

`directAccess` on for E1. The split is **always** at the first dot (ids never contain one). `v(E1)` is generated (base64url, no dot) unless stated.

| # | Header value | Expected |
| --- | --- | --- |
| 1 | `a.<v>` | accepted for id `a` |
| 2 | `<v>` (no dot) | 401 |
| 3 | `.<v>` (empty id) | 401 |
| 4 | `a.` (empty token) | 401 |
| 5 | `a.<v>x` (one extra char) | 401 |
| 6 | `a.b.<v>` | split at the **first** dot → id `a`, token `b.<v>` → 401 |
| 7 | id `fb.1` (invalid since TQ-1), `fb.1.<v>` | split gives id `fb`, token `1.<v>` → 401 |
| 8 | 64-char id + `.` + `<v>` | accepted |
| 9 | 65-char id + `.` + `<v>` | 401 |
| 10 | user-set 40-char token containing dots, `t.u.v…`; header `a.t.u.v…` | split at the first dot → id `a`, token `t.u.v…` → accepted (the token part may contain dots) |

### AUTH-BVA-05 — `lastSeenAt` write bound
**Req:** R-ID-12 · **Level:** unit · **Flags:** D§5.8, K

| # | Authenticated request at (s after the last recorded write) | Expected `lastSeenAt` |
| --- | --- | --- |
| 1 | 0 | unchanged |
| 2 | 59 | unchanged (design: at most once a minute) |
| 3 | 60 | updated |
| 4 | first request after pairing | equals that request's time (± the bound) |
| 5 | failed request (401) | unchanged |

### AUTH-BVA-06 — Token-endpoint rate limit and the stock client's retry
**Req:** R-TOK-06, R-OA-07 · **Level:** integration (fake clock, stock `ClientCredentialsProvider`) · **Flags:** K (limit and window frozen at V3-K), P:S7

The stock client (S7 §4.4) makes **2** token requests per failed MCP call (its first try and one
re-authentication after the 401). LIMIT = the frozen per-client limit per window.

| # | Token requests from one client in one window | Expected |
| --- | --- | --- |
| 1 | 1 | served |
| 2 | 2 (one failed call of the stock client) | both served; never refused as rate-limited |
| 3 | LIMIT, LIMIT ≥ 2 | all served |
| 4 | LIMIT + 1 | the extra request refused with a rate-limit answer that reveals no token or id |
| 5 | a valid credential after row 4, next window | served |
| 6 | frozen LIMIT | ≥ 2 (assert at V3-K, so the stock client's normal recovery never trips it) |

## Decision Tables

### AUTH-DT-01 — Token endpoint outcome
**Req:** R-OA-03, R-OA-04, R-ID-02, §4.1 · **Level:** integration · **Flags:** —

| Rule | Token | Client id valid | Entry binding | Result | `fishball_pairing` | Power |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | unknown | any | — | `invalid_client` 401 | — | — |
| 2 | disabled | valid | bound to X, id X | `invalid_client` 401 | — | — |
| 3 | revoked (deleted) | valid | — | `invalid_client` 401 | — | — |
| 4 | valid | invalid | any | `invalid_client` | — | — |
| 5 | valid | valid | unbound | 200 | `unpaired` | pair-only |
| 6 | valid | valid X | bound to X | 200 | `paired` | full |
| 7 | valid | valid Y | bound to X ≠ Y | 200 | `id-mismatch` | pair-only |
| 8 | valid, too short | valid | any | `invalid_client` | — | — |

Check on rules 1–4, 8: response identical (EP-05).

### AUTH-DT-02 — MCP endpoint outcome by AT state and call
**Req:** R-ID-03, R-ID-04, R-ID-06, R-OA-04, R-TOK-01, §4.1 · **Level:** integration · **Flags:** —

| Rule | AT | Call | Result |
| --- | --- | --- | --- |
| 1 | missing / expired / revoked / foreign audience | any | 401 + `WWW-Authenticate` |
| 2 | pair-only, entry unbound | `pair` | pairs; the same AT is full on the next request |
| 3 | pair-only, entry unbound | other tool / subscription | `not-paired` |
| 4 | pair-only, bound to another id | `pair` | `already-paired`, `idMatches: false` |
| 5 | pair-only, bound to another id | other tool / subscription | `id-mismatch` |
| 6 | full | `pair` | `already-paired`, `idMatches: true` |
| 7 | full | any other call | proceeds |
| 8 | pair-only issued while unbound, entry since bound by **another** client's `pair` | other tool | `id-mismatch` (scope is evaluated live) |
| 9 | pair-only issued while unbound, entry since bound by this AT | other tool | proceeds |

### AUTH-DT-03 — Direct-access fallback
**Req:** R-OA-10, R-ID-02 · **Level:** integration · **Flags:** TQ-1 (decided C)

| Rule | `directAccess` | Header form | Token part | Id valid | Entry binding | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | off | `<id>.<token>` | correct | yes | any | 401 (same as invalid AT) |
| 2 | on | `<id>.<token>` | wrong | yes | any | 401 |
| 3 | on | `<id>.<token>` | correct | no (too long, bad character, empty) | any | 401 |
| 4 | on | `<id>.<token>` | correct | yes | unbound | pair-only |
| 5 | on | `<id>.<token>` | correct, entry disabled | yes | any | 401 |
| 6 | on | `<id>.<token>` | correct | yes = bound id | bound | full |
| 7 | on | `<id>.<token>` | correct | yes ≠ bound id | bound | pair-only (`id-mismatch` on other calls) |
| 8 | on → off between two requests | | correct | yes | bound | first ok, second 401 |
| 9 | on for E1 only | `<id>.<v(E2)>`, E2 off | correct for E2 | yes | — | 401 |
| 10 | on | an OAuth AT of E1 | — | — | bound | still accepted (both forms work) |

### AUTH-DT-04 — Revocation effect by item kind
**Req:** R-TOK-05, R-ROUTE-06, R-ROUTE-04, R-OA-06, R-CON-05 · **Level:** integration · **Flags:** D§5.3, TQ-2 (decided A), TQ-5 (decided A)

| Rule | Item of the revoked principal | Disable | Delete |
| --- | --- | --- | --- |
| 1 | open listen stream | closed (graceful completion) | closed |
| 2a | request already past the token check | completes | completes |
| 2b | answer sent after revocation | refused | refused |
| 3 | live offer (permission, question, plan review) | withdrawn (`retirement` follows); goes to the user in its session, waits there with no timer | same |
| 4 | managed session | unmanaged, one `system` note | same |
| 5 | queued `message` / `turn-finished` / `state` | kept 30 days; pollable on re-enable | dropped |
| 6 | queued `handover`, `takeback`, `notice`, `contributed:*`, `settlement`, `retirement` | kept 30 days | dropped |
| 7 | queued `ask` | kept 30 days; the asker keeps waiting | dropped; the asker's `ask_fishball` returns `unavailable` |
| 8 | kept events after 30 days disabled | dropped as on delete (the asker gets `unavailable`) | — |
| 9 | designated-Fishball role held by it | kept: new `ask_fishball` → `unavailable` at once, `message_fishball` queues | cleared: `routing.fishballToken` unset |
| 10 | ATs | all 401 | all 401 |
| 11 | re-enable | same pair; new AT full; old ATs stay invalid; kept events pollable | not possible |
| 12 | AT issued just before a **value change**, then the old value restored | still 401 (every derived AT is invalidated, never revived, S7 §4.4) | — |

### AUTH-DT-05 — Credential cleanup on delete
**Req:** R-TOK-09 · **Level:** integration · **Flags:** —

| Rule | Value origin | Action | Credential store afterwards |
| --- | --- | --- | --- |
| 1 | generated by C | delete | unset |
| 2 | generated by C | disable | kept |
| 3 | user-set in store | delete | kept |
| 4 | user-set in environment | delete | environment untouched |
| 5 | generated, then re-enabled after disable | enable | same value, principal restored |

### AUTH-DT-06 — `fishball-core`'s pairing decision
**Req:** R-ID-05, R-ID-07, R-ID-10, R-FB-04 · **Level:** unit (core with a fake link) · **Flags:** —

| Rule | Local paired record | `fishball_pairing` | `pair` result | Core action |
| --- | --- | --- | --- | --- |
| 1 | absent | `unpaired` | ok | write record; work |
| 2 | absent | `paired` | — | call `pair` → `already-paired` `idMatches: true` → warning with Continue (after tick) / New token |
| 3 | absent | `id-mismatch` | `already-paired`, `idMatches: false` | warning with New token only |
| 4 | present | `paired` | — (not called) | work |
| 5 | present | `id-mismatch` | — (not called) | status: new token needed; no `pair` |
| 6 | present | `invalid_client` | — | status `token-refused`; bounded retry |
| 7 | absent | `unpaired`, `pair` lost to a race | `already-paired` `idMatches: false` | warning with New token only |
| 8 | any, warning open | — | — | sends nothing else to the target |

## State Transitions

### AUTH-ST-01 — Token entry and pair lifecycle
**Req:** R-TOK-08, R-TOK-09, R-ID-03, R-ID-04, R-ID-09, R-OA-06 · **Level:** integration · **Flags:** —

States: **Unconfigured** (enabled, no value), **Ready** (enabled, value, unbound), **Bound(X)**, **Off-Unbound**, **Off-Bound(X)**, **Gone**.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Unconfigured | settings change, store writable | Ready | value generated |
| 2 | Ready | `pair` with id X | Bound(X) | `pairedAt` set |
| 3 | Bound(X) | `pair` with X | Bound(X) | `already-paired`, `idMatches: true` |
| 4 | Bound(X) | `pair` with Y | Bound(X) | `already-paired`, `idMatches: false` |
| 5 | Bound(X) | disable | Off-Bound(X) | 401 / `invalid_client` |
| 6 | Off-Bound(X) | enable | Bound(X) | new AT with X is full |
| 7 | Ready | disable | Off-Unbound | `invalid_client` |
| 8 | Off-Unbound | enable | Ready | pair-only AT |
| 9 | Bound(X) | delete | Gone | value unset (generated) |
| 10 | Bound(X) | change value | Bound(X) | old ATs 401; new value + X → full |
| 11 | Bound(X) | any "unpair" | — (invalid) | no such operation exists; stays Bound(X) |
| 12 | Gone | any request | Gone | `invalid_client` / 401 |
| 13 | Ready | `pair` × 2 concurrently | Bound(one id) | other gets `already-paired` (P:S3) |
| 14 | Off-Bound(X) | `pair` | — | 401 (no token check passes) |

### AUTH-ST-02 — Access token lifecycle
**Req:** R-OA-04, R-OA-06, R-OA-07, R-ID-03 · **Level:** unit · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | Pair-only | `pair` succeeds with it | Full (same AT) |
| 2 | Pair-only | the entry is bound by another id | Pair-only-mismatch (`id-mismatch`) |
| 3 | Full / Pair-only | t ≥ t0 + 3600 | Expired (401) |
| 4 | any live | entry disabled / deleted / value changed | Invalid (401) |
| 5 | Invalid | entry re-enabled | Invalid (never revived) |
| 6 | Expired | `refresh_token` grant | Expired (`unsupported_grant_type`) |
| 7 | Expired | client credentials again | (new AT) Full or Pair-only by pair state |

### AUTH-ST-03 — `fishball-core`'s link pairing state
**Req:** R-ID-05, R-ID-07, R-ID-10, R-FB-04 · **Level:** unit, e2e (warning) · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | NoRecord | auth `unpaired` → `pair` ok | Paired |
| 2 | NoRecord | `pair` → `already-paired` (match) | WarnMatch (sends nothing) |
| 3 | WarnMatch | Continue without the tick | WarnMatch (button disabled) |
| 4 | WarnMatch | tick + Continue | Paired (record written, no `pair`) |
| 5 | WarnMatch / WarnMismatch | Use a new token | NeedToken |
| 6 | NoRecord | `pair` → `already-paired` (mismatch) | WarnMismatch |
| 7 | NeedToken | new reference set | NoRecord → (1) |
| 8 | Paired | reconnect / restart | Paired (no `pair` call) |
| 9 | Paired | `identity.id` changed | IdMismatch (status: new token needed) |
| 10 | Paired | `invalid_client` (revoked) | TokenRefused (status `token-refused`) |
| 11 | TokenRefused | entry re-enabled | Paired |
