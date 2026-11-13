# 1. OAuth client credentials, tokens and pairing (AUTH)

Requirements: R-TOK-00…10, R-OA-01…21, R-ID-01…13, requirements §4.1. Conventions:
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
**Req:** R-OA-01, R-OA-03, R-OA-04, R-OA-05, R-OA-07, R-OA-09, R-ID-01, R-ID-03, R-ID-06, R-ID-08, R-ID-12, R-EXT-05, R-TOK-01 · **Level:** integration · **Flags:** P:S7, K

- **Actor:** an external MCP agent with client credentials support.
- **Preconditions:** entry E1 enabled, value `v(E1)`, unbound; the agent is configured with the MCP URL, `client_id = "agent-a"`, `client_secret = v(E1)`.
- **Main flow:**
  1. The agent sends an MCP request with no token → 401 with `WWW-Authenticate: Bearer resource_metadata="…", scope="fishball"` and no `error=` attribute.
  2. It reads the protected resource metadata, then the authorization server metadata at the issuer's path-inserted well-known URI; its `issuer` equals the issuer used to build that URL.
  3. It posts `grant_type=client_credentials`, `client_id=agent-a`, `client_secret=v(E1)`, `resource=<canonical MCP URI>` → 200 `{access_token, token_type: "Bearer", expires_in: 3600, scope: "fishball:pair"}`, standard fields only: **no** `refresh_token` and no custom field.
  4. With that pair-only AT it calls `server/discover` (advertises `io.modelcontextprotocol/oauth-client-credentials`) and `tools/list` (lists `pair` only; **no** core or contributed tool).
  5. It calls `pair({})` → `{ok: true, paired: true, id: "agent-a", name: null}` (no default names; shown as `ID: agent-a`, see NAME).
  6. With the **same** AT it calls `inbox_poll`, opens `subscriptions/listen` on `fishball://events` and calls `tools/list` → all succeed, and `tools/list` now lists the core and contributed tools. (A new token request now returns `scope: "fishball"`.)
- **Alternative flows:**
  - A1. The agent passes `pair({name: "Agent A"})` with a free name → `name: "Agent A", nameAssigned: true`.
  - A2. The agent authenticates with `client_secret_post` instead of `client_secret_basic` → same results.
- **Exception flows:**
  - E1. The agent has no id (`client_id` absent or empty) → `invalid_client`; it cannot get any AT (R-ID-08).
  - E2. Two agents race `pair` on E1 with ids `a` and `b` → exactly one binds; the other gets `already-paired` with `idMatches: false` (settled by S3 `b4dca86`).
  - E3. Before step 5 the agent calls `session_start` → HTTP 403 `insufficient_scope` with `scope="fishball"` and `error_description` `not-paired`; nothing started.
- **Postconditions:** E1 is bound to `agent-a` durably (survives connector restart), `pairedAt` set; the native settings show E1 paired, bound id `agent-a`, its name, `lastSeenAt`, connected = yes (R-ID-12). The connector never generated or suggested an id (R-ID-08).

### AUTH-UC-03 — A paired client reconnects, restarts or outlives its access token
**Req:** R-ID-05, R-OA-07, R-OA-04, R-OA-05, R-TOK-01 · **Level:** integration · **Flags:** TQ-5 (decided A)

- **Actor:** a paired client P(E1, `agent-a`) (external agent or Fishball DSH).
- **Preconditions:** E1 bound to `agent-a`; the client holds a full AT issued at t0.
- **Main flow:**
  1. At t0 + 3600 the client's request gets 401 (`error="invalid_token"`).
  2. It re-authenticates with `agent-a` + `v(E1)` → full AT, `scope: "fishball"`.
  3. It continues work; it does **not** call `pair`.
- **Alternative flows:**
  - A1. The client process restarts → step 2 directly; same result.
  - A2. The connector's DSH restarts → every old AT gets 401 (access tokens are held in memory only); step 2 yields a full AT with the pair intact.
- **Exception flows:**
  - E1. Between 1 and 2, E1 was disabled → step 2 gets `invalid_client`.
  - E2. The client sends `grant_type=refresh_token` → `invalid_grant` (machine exchange has no refresh tokens; the grant exists only for browser clients, R-OA-16).
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
  - A1. Agent B uses id `999` → pair-only AT (`scope: "fishball:pair"`); `pair` returns `already-paired`, `idMatches: false`, `advice: "use a new token"`; any other call → HTTP 403 `insufficient_scope` (`error_description` `id-mismatch`).
  - A2. B switches to a new token E2 (unbound) and a **new** id → pairs normally.
  - A3. B switches to E2 but keeps id `123` → `pair` answers `id-taken` (ids are unique per connector); E2 stays unpaired.
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
  - A2. Same as A1, the user chooses **Use a new token and a new id** → core stops using the old token; once a new reference and a new `identity.id` are set it pairs again.
  - A5. `pair` answers `id-taken` → the page says the id is used by another agent on that DSH and asks for a new `identity.id`; once changed, core pairs again with the **same** token.
  - A3. `idMatches: false` → only **Use a new token** is offered.
  - A4. The owner changes `identity.id` after pairing → the next token request returns `scope: "fishball:pair"` while core holds a paired record; core does not call `pair`, and its status says a new token is needed.
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
  7. The user switches E1 on again → old ATs still get 401; a new token request with `a` returns a **full** AT (`scope: "fishball"`); the kept events, S3's `ask` included, are pollable.
- **Alternative flows:**
  - A1. The user **deletes** E1 → steps 2–4 hold; every queued event is dropped; S3's waiting `ask_fishball` returns `unavailable`; `routing.fishballToken` is cleared (R-ROUTE-04's default applies); C unsets the generated value from the credential store; the pair is gone.
  - A4. E1 stays disabled for 30 days → the kept events are dropped as on delete, and S3's `ask_fishball` returns `unavailable` then.
  - A2. E1's value was supplied by the user → after delete the value is still in the credential store.
  - A3. The user changes E1's value → all ATs derived from the old value get 401 on the next request; the new value authenticates.
- **Exception flows:**
  - E1. A request already past the token check when the revocation lands (the in-flight `approval_answer`) → it completes normally; the next request is refused.
- **Postconditions:** after a disable E1 stays bound to `a` (R-ID-09); there is no unpair operation.

### AUTH-UC-07 — Static credentials without the id header are refused
**Req:** R-OA-10, R-TOK-01, R-TOK-00, R-TOK-04, R-TOK-06, R-REM-03 · **Level:** integration · **Flags:** —

- **Actor:** an external MCP client with static headers only.
- **Preconditions:** E1 enabled and bound to `agent-a`.
- **Main flow:**
  1. The client sends `Authorization: Bearer agent-a.<v(E1)>` → 401 `invalid_token`, identical to any invalid access token.
  2. It sends `Authorization: Bearer <v(E1)>` (with or without any id header, e.g. `Fishball-Agent-Id: agent-a`) → the same 401.
  3. The connector's settings have no `directAccess` switch.
- **Alternative flows:**
  - A1. The client obtains an access token at the token endpoint with `agent-a` + `v(E1)` → MCP requests then succeed.
  - A2. The client is DSH's `dsh-mcp-client` → it connects through `fishball-connector-adapter` with ordinary OAuth (AUTH-UC-12).
- **Exception flows:** E1. The header from a disallowed `Origin` → 403 before any token check.
- **Postconditions:** the bearer value is never logged (grep); these requests count toward the per-client failure limit like any other.

### AUTH-UC-11 — *Withdrawn* (the static token + id header form, requirements 1.25, was replaced by `fishball-connector-adapter`)
**Req:** R-OA-10 · **Level:** integration · **Flags:** —

The id stays reserved. Its negative is covered by AUTH-UC-07 and AUTH-EP-02 rows 7–8b; the replacement is AUTH-UC-12.

### AUTH-UC-08 — A standard MCP client is set up with configuration only
**Req:** R-OA-01, R-OA-02, R-OA-05, R-OA-09, R-CON-01, R-REM-03 · **Level:** integration · **Flags:** —

- **Actor:** the stock `ClientCredentialsProvider` of `@modelcontextprotocol/client` 2.2.0 on each DSH SDK, and one non-DSH client-credentials client.
- **Preconditions:** E1 enabled; the client is pinned to `2026-07-28` and configured with endpoint URL, client id, client secret and expected issuer.
- **Main flow:** discovery of protected resource metadata (at the path-inserted well-known URI and in the 401's `resource_metadata`) → authorization server metadata (issuer has the path `/api/fishball/oauth`, D§5.5) → token → `server/discover` → `tools/list` → a tool call → `subscriptions/listen`.
- **Alternative flows:** A1. The expected issuer differs from the metadata → the client refuses to send the secret (client-side pinning).
- **Exception flows:** E1. The client asks the AS metadata for an authorization endpoint or registration endpoint → none listed; requests to such paths are not served.
  - A2. The same client reaches the connector under another allowed host (e.g. `localhost` vs `127.0.0.1`) → the metadata it reads names that host's issuer and canonical URI; an AT from the first host is refused under the second (S1 (b)).
- **Postconditions:** the AT is audience-bound: the same AT presented to another resource URI is refused.

### AUTH-UC-09 — The user inspects pair status in the native settings
**Req:** R-ID-12, R-NAME-05, R-TOK-08, R-CON-10 · **Level:** e2e · **Flags:** —

- **Actor:** DSH owner.
- **Preconditions:** entries E1 (unpaired), E2 (paired to `b`, named "Navigator", connected), E3 (paired to `c`, no name, disabled).
- **Main flow:** open Plugins → `fishball-connector` settings. Each entry shows read-only: paired/unpaired, bound id, name (or `ID: <id>` when it has none, as for E3), `lastSeenAt`, connected now.
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
| 3 | `refresh_token` from a `client_credentials` client, or with a token not issued to a browser client | `refresh_token` | `invalid_grant` |
| 4 | other grant | `authorization_code` / `password` | `unsupported_grant_type` |
| 5 | grant missing | no `grant_type` | `unsupported_grant_type` or `invalid_request` (K); no AT |
| 6 | wrong method | GET on the token endpoint | refused, no AT (K: 405) |
| 7 | resource foreign | `resource=https://other/mcp` | `invalid_target`, no AT |
| 8 | resource absent | no `resource` | `invalid_target`, no AT |
| 8a | stock `ClientCredentialsProvider` (2.2.0), both SDKs | default configuration | sends the canonical `resource`; 200 AT (S7) |
| 9 | secret in query | valid form plus `?client_secret=…` in the URL | refused even though the form is valid (by R-TOK-02's rule) |
| 10 | no client auth | id only | `invalid_client` |
| 11 | no refresh token for machine exchange | any 200 `client_credentials` response | has no `refresh_token` field |

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
| 7 | the raw token value `v(E1)` | 401 `invalid_token` |
| 8 | `<id>.<v(E1)>` (with or without the id header) | 401 `invalid_token` |
| 8b | `v(E1)` with `Fishball-Agent-Id` of its bound id | 401 `invalid_token` (no static credential, R-OA-10 withdrawn) |
| 8a | an AT issued for this connector under another allowed host (other canonical URI) | 401 `invalid_token` (audience) |
| 9 | valid pair-only AT | processed (pair-only power) |
| 10 | valid full AT | processed |
| 11 | valid full AT in header **and** `?access_token=` in the query | refused (K: 400/401), no processing |
| 12 | valid AT in query only | refused, no processing |
| 13 | `server/discover` without a token | 401 (no unauthenticated discovery) |
| 14 | `subscriptions/listen` without a token | 401 |

### AUTH-EP-03 — Fishball id classes
**Req:** R-ID-02, R-ID-10, R-ID-11, R-ID-13, R-OA-03 · **Level:** unit (validator), integration (endpoint, core settings) · **Flags:** TQ-1 (decided C)

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
| 7 | case-sensitive | E1 bound to `abc`; request with `ABC` | pair-only (`scope: fishball:pair`); other calls 403 `insufficient_scope` |
| 8 | same id on two tokens | E1 bound to `x`, E2 (unbound) calls `pair` with `x` | `id-taken`; E2 stays unpaired; E2 then pairs with `y` |
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

### AUTH-EP-11 — *Withdrawn* (the static token + id header form, requirements 1.25, was replaced by the `dsh-mcp-client` adapter)
**Req:** R-OA-10 · **Level:** integration · **Flags:** —

The id stays reserved. Its negative is covered by AUTH-UC-07 and AUTH-EP-02 rows 7–8b; the replacement is AUTH-UC-12.

### AUTH-EP-05 — Leakage on authentication failure
**Req:** R-TOK-00, R-TOK-06, R-OA-03, R-ID-04 · **Level:** integration · **Flags:** —

| # | Class of secret presented (id `123`) | Expected |
| --- | --- | --- |
| 1 | unknown | `invalid_client` (401) |
| 2 | disabled entry, bound to `123` | identical response to row 1 |
| 3 | deleted entry | identical to row 1 |
| 4 | enabled, bound to `123`, but secret off by one character | identical to row 1 |
| 5 | 100 failed attempts with random secrets, then the valid one from the same client | failures stay uniform; per-client rate limiting may refuse further attempts (K) but the response never says which tokens or ids exist |
| 6 | timing: unit test of the comparator | constant-time comparison primitive used for every token check |

### AUTH-EP-06 — What a pair-only access token can reach
**Req:** R-OA-04, R-ID-06, R-EXT-05, R-TOK-10 · **Level:** integration · **Flags:** —

| # | Call with pair-only AT | Unbound entry | Entry bound to another id |
| --- | --- | --- | --- |
| 1 | `server/discover` | ok | ok |
| 2 | `tools/list` | `pair` only (no core, no contributed tool) | same |
| 3 | `pair` | pairs | `already-paired`, `idMatches: false` |
| 4 | `sessions_list`, `session_start`, `approval_answer`, `set_name` | 403 `insufficient_scope`, `scope="fishball"`, description `not-paired` | 403 `insufficient_scope`, description `id-mismatch` |
| 5 | `inbox_poll`, `inbox_ack` | 403 (as row 4) | 403 (as row 4) |
| 6 | `subscriptions/listen` | 403 (as row 4) | 403 (as row 4) |
| 7 | `resources/read fishball://events` | 403 (as row 4) | 403 (as row 4) |
| 8 | a contributed tool call | 403 (as row 4); never reaches the contributor | same |
| 9 | token request with `scope=fishball` while unpaired | 200, narrowed: `scope: fishball:pair` (not `invalid_scope`) | same |

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

| # | Length | Expected at the token endpoint |
| --- | --- | --- |
| 1 | 0 | `invalid_client` |
| 2 | 1 | accepted |
| 3 | 2 | accepted |
| 4 | 63 | accepted |
| 5 | 64 | accepted |
| 6 | 65 | `invalid_client` |
| 7 | 64 including one `.` | `invalid_client` (dot, not length) |

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

### AUTH-BVA-04 — *Withdrawn* (direct access removed, requirements 1.16)
**Req:** R-OA-10 · **Level:** unit · **Flags:** —

The direct-access header split no longer exists. Its negative is covered by AUTH-UC-07 and AUTH-EP-02 rows 7–8. The id stays reserved.

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
**Req:** R-TOK-06, R-OA-07, R-OA-17 · **Level:** integration (fake clock, stock `ClientCredentialsProvider`) · **Flags:** K (limit and window frozen at V3-K), P:S7

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
| 7 | `authorization_code` token requests from one client | counted in the same limit as `client_credentials` (R-OA-17) |

## Decision Tables

### AUTH-DT-01 — Token endpoint outcome
**Req:** R-OA-03, R-OA-04, R-ID-02, §4.1 · **Level:** integration · **Flags:** —

| Rule | Token | Client id valid | Entry binding | Result | `scope` | Power |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | unknown | any | — | `invalid_client` 401 | — | — |
| 2 | disabled | valid | bound to X, id X | `invalid_client` 401 | — | — |
| 3 | revoked (deleted) | valid | — | `invalid_client` 401 | — | — |
| 4 | valid | invalid | any | `invalid_client` | — | — |
| 5 | valid | valid | unbound | 200 | `fishball:pair` | pair-only |
| 6 | valid | valid X | bound to X | 200 | `fishball` | full |
| 7 | valid | valid Y | bound to X ≠ Y | 200 | `fishball:pair` | pair-only |
| 9 | valid | valid, unbound, request asks `scope=fishball` | unbound | 200 | `fishball:pair` (narrowed, OAuth 2.1 §1.4.1) | pair-only |
| 10 | any 200 | — | — | — | — | response has only standard fields (`access_token`, `token_type`, `expires_in`, `scope`); no `fishball_pairing`; no `refresh_token` for `client_credentials` |
| 8 | valid, too short | valid | any | `invalid_client` | — | — |

Check on rules 1–4, 8: response identical (EP-05).

### AUTH-DT-02 — MCP endpoint outcome by AT state and call
**Req:** R-ID-03, R-ID-04, R-ID-06, R-ID-13, R-OA-04, R-TOK-01, §4.1 · **Level:** integration · **Flags:** —

| Rule | AT | Call | Result |
| --- | --- | --- | --- |
| 1 | missing / expired / revoked / foreign audience | any | 401 + `WWW-Authenticate` |
| 2 | pair-only, entry unbound | `pair` | pairs; the same AT is full on the next request |
| 3 | pair-only, entry unbound | other tool / subscription | HTTP 403 `insufficient_scope` (`not-paired`) |
| 4 | pair-only, bound to another id | `pair` | `already-paired`, `idMatches: false` |
| 5 | pair-only, bound to another id | other tool / subscription | HTTP 403 `insufficient_scope` (`id-mismatch`) |
| 6 | full | `pair` | `already-paired`, `idMatches: true` |
| 7 | full | any other call | proceeds |
| 8 | pair-only issued while unbound, entry since bound by **another** client's `pair` | other tool | HTTP 403 `insufficient_scope` (`id-mismatch`; scope is evaluated live) |
| 9 | pair-only issued while unbound, entry since bound by this AT | other tool | proceeds |
| 10 | pair-only, entry unbound, id held by another entry | `pair` | `id-taken`; the token stays unpaired |

### AUTH-DT-03 — *Withdrawn* (direct access removed, requirements 1.16)
**Req:** R-OA-10 · **Level:** integration · **Flags:** —

See AUTH-UC-07. The id stays reserved.

### AUTH-DT-10 — *Withdrawn* (the static token + id header form, requirements 1.25, was replaced by the `dsh-mcp-client` adapter)
**Req:** R-OA-10 · **Level:** integration · **Flags:** —

The id stays reserved. Its negative is covered by AUTH-UC-07 and AUTH-EP-02 rows 7–8b; the replacement is AUTH-UC-12.

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
**Req:** R-ID-05, R-ID-07, R-ID-10, R-ID-13, R-FB-04, R-OA-19, R-OA-18 · **Level:** unit (core with a fake link) · **Flags:** —

| Rule | Local paired record | token `scope` | `pair` result | Core action |
| --- | --- | --- | --- | --- |
| 1 | absent | `fishball:pair` | ok | write record; work |
| 2 | absent | `fishball` | — | call `pair` → `already-paired` `idMatches: true` → warning with Continue (after tick) / New token |
| 3 | absent | `fishball:pair`, bound to another id | `already-paired`, `idMatches: false` | warning with New token only |
| 4 | present | `fishball` | — (not called) | work |
| 5 | present | `fishball:pair` | — (not called) | status: new token needed; no `pair` |
| 6 | present | `invalid_client` | — | status `token-refused`; bounded retry |
| 7 | absent | `fishball:pair`, `pair` lost to a race | `already-paired` `idMatches: false` | warning with New token only |
| 10 | absent | `fishball:pair` | `id-taken` | page: id used by another agent; ask for a new `identity.id`; then `pair` again with the same token |
| 8 | any, warning open | — | — | sends nothing else to the target |
| 9 | any | — | — | core only ever uses `client_credentials`, never the browser flow (R-OA-19), and reads pairing state from `scope` and `pair`, never a custom field (R-OA-18) |

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
| 13 | Ready | `pair` × 2 concurrently | Bound(one id) | other gets `already-paired` (settled by S3 `b4dca86`) |
| 15 | Ready | `pair` with an id another entry holds | Ready | `id-taken`; nothing binds |
| 16 | Ready (E2) and Ready (E3) | `pair` on both with the same id concurrently | one Bound(id), one Ready | the other gets `id-taken` (same serial pair registry as S3's race; not probed by S3, K) |
| 14 | Off-Bound(X) | `pair` | — | 401 (no token check passes) |

### AUTH-ST-02 — Access token lifecycle
**Req:** R-OA-04, R-OA-06, R-OA-07, R-ID-03 · **Level:** unit · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | Pair-only | `pair` succeeds with it | Full (same AT) |
| 2 | Pair-only | the entry is bound by another id | Pair-only-mismatch (403 `insufficient_scope`, `id-mismatch`) |
| 3 | Full / Pair-only | t ≥ t0 + 3600 | Expired (401) |
| 4 | any live | entry disabled / deleted / value changed | Invalid (401) |
| 5 | Invalid | entry re-enabled | Invalid (never revived) |
| 6 | Expired (machine exchange) | `refresh_token` grant | Expired (`invalid_grant`) |
| 7 | Expired | client credentials again | (new AT) Full or Pair-only by pair state |

### AUTH-ST-03 — `fishball-core`'s link pairing state
**Req:** R-ID-05, R-ID-07, R-ID-10, R-FB-04 · **Level:** unit, e2e (warning) · **Flags:** —

| # | From | Event | To |
| --- | --- | --- | --- |
| 1 | NoRecord | auth `unpaired` → `pair` ok | Paired |
| 2 | NoRecord | `pair` → `already-paired` (match) | WarnMatch (sends nothing) |
| 3 | WarnMatch | Continue without the tick | WarnMatch (button disabled) |
| 4 | WarnMatch | tick + Continue | Paired (record written, no `pair`) |
| 5 | WarnMatch / WarnMismatch | Use a new token and a new id | NeedToken |
| 12 | NoRecord | `pair` → `id-taken` | NeedId (asks for a new `identity.id`; the token stays) |
| 13 | NeedId | new `identity.id` set | NoRecord → (1) |
| 6 | NoRecord | `pair` → `already-paired` (mismatch) | WarnMismatch |
| 7 | NeedToken | new reference set | NoRecord → (1) |
| 8 | Paired | reconnect / restart | Paired (no `pair` call) |
| 9 | Paired | `identity.id` changed | IdMismatch (status: new token needed) |
| 10 | Paired | `invalid_client` (revoked) | TokenRefused (status `token-refused`) |
| 11 | TokenRefused | entry re-enabled | Paired |

## Browser authorization (requirements 1.16, 1.17, R-OA-11…20)

### AUTH-UC-10 — Someone authorizes a browser agent by entering a token
**Req:** R-OA-11, R-OA-12, R-OA-13, R-OA-14, R-OA-16, R-OA-17, R-OA-18, R-OA-20, R-ID-03, R-ID-04, R-ID-12, R-NAME-06, R-TOK-00, R-TOK-04 · **Level:** e2e (page), integration (flow with a scripted browser) · **Flags:** —

- **Actor:** whoever holds a token (normally the DSH owner); an external MCP client with the authorization code flow (the DSH SDK client `@modelcontextprotocol/client` 2.2.0 on both SDKs, or the Python MCP SDK; DSH's own `dsh-mcp-client` has no OAuth and reaches a Fishball connector through `fishball-connector-adapter`, AUTH-UC-12) and a Client ID Metadata Document at `https://agent.example/cimd.json` (`client_name: "Agent W"`, `redirect_uris: ["http://127.0.0.1:7777/cb"]`).
- **Preconditions:** the owner created entry E5 by hand in the connector's settings; E5 is enabled and unpaired; the approval listener is open.
- **Main flow:**
  1. The client gets 401 at the MCP endpoint, reads both metadata documents, and sees `client_id_metadata_document_supported: true`, `code_challenge_methods_supported: ["S256"]` and `authorization_endpoint` on the approval listener.
  2. It opens `/authorize` with its CIMD `client_id`, the exact redirect, an S256 challenge, `state` and `resource`; the connector fetches and validates the document.
  3. The page shows "Agent W (unverified)", the redirect host `127.0.0.1`, a localhost-only warning, the client-id host `agent.example`, this DSH and its canonical MCP URI, "full manager rights", "one token, one agent", a masked **token** field, a required **id** field, an optional **name** field (with `client_name` "Agent W" only as a hint), Authorize and Cancel. There is no login, ticket or password.
  4. The user types `v(E5)`, the id `agent-w-1`, leaves the name empty, and presses Authorize.
  5. E5 is bound to the id `agent-w-1` (client-id URL and redirect recorded separately), with **no name**, `pairedAt` set; the browser is redirected with `code`, `state` and `iss`. Wherever E5's principal is shown it reads `ID: agent-w-1` (R-NAME-08).
  6. The client exchanges the code with `code_verifier`, `redirect_uri`, `client_id` and `resource` → `scope: "fishball"`, `expires_in: 3600` and a refresh token; MCP calls succeed at full power, with no `pair` call.
  7. An hour later the client uses the refresh token → a new access token and a **new** refresh token; nobody re-enters a token. With the DSH SDK client's several calls in flight, each refreshes with the same token within 10 s → all get the identical successor (Q-S7B-1 B).
- **Alternative flows:**
  - A1. **Cancel** → redirect with `error=access_denied`, `iss`, `state`; E5 stays unpaired.
  - A2. No `state` in the request → still valid; the response carries no `state`.
  - A6. Every response to the client's redirect, success or error, carries `iss`; the redirect after Authorize or Cancel is a `303` and carries no token value.
  - A3. Someone other than the owner holds `v(E5)` and enters it → it authorizes the same way (the token is the proof).
  - A4. The user also types the name "Watcher" (free) → E5's principal is named "Watcher".
  - A5. The client's redirect is `http://127.0.0.1:7777/cb` but it now listens on port 50123 → `redirect_uri=http://127.0.0.1:50123/cb` is accepted (loopback, any port).
  - A7. **Renewal (R-OA-16 (7)):** E5's every chain has reached its 365-day maximum lifetime; the same client (the client id recorded at the bind) opens the page again and the owner enters `v(E5)` with the bound id `agent-w-1` → redirect with a code; the new chain belongs to the **same** principal (same id, name, managed sessions and pending events); nothing is re-bound and no new token is needed; any redirect URI of the client's document is accepted and recorded.
- **Exception flows:**
  - E1. A wrong, disabled or deleted token value → one uniform "this token is not valid" message; the request stays pending; the attempt counts toward the per-client failure limit.
  - E2. `v(E5)` after E5 is already paired (by a machine client or another browser client) → `already-paired` on the page: "create a new token", with the bound pair's name and last-seen time; nothing changes.
  - E2a. The id `agent-w-1` is already used by another entry → `id-taken`; the id `agent.w` → `id-invalid`; the name "Fishball" when held → `name-taken`; each leaves E5 unpaired and the request pending.
  - E3. The request waits 10 min → expired; Authorize shows "this request has expired, start again from your agent".
  - E4. A cross-site POST to the form (other origin, or a replayed form value) → refused; nothing bound.
  - E5. The connector restarts with a request pending → the request is gone.
- **Postconditions:** E5 shows in native settings as paired, with its client-id URL; disable, re-enable and delete work as for any entry; no entry was created by the page; `v(E5)` appears in no URL, redirect, code, page, response or log (grep), and the page response is `Cache-Control: no-store`.

### AUTH-DT-07 — Authorization request validation
**Req:** R-OA-14, R-OA-13, R-OA-05 · **Level:** integration · **Flags:** —

| Rule | `client_id` | `redirect_uri` | `response_type` | PKCE | `resource` | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | valid CIMD URL | exact match | `code` | S256 | canonical | page shown |
| 2 | not an `https:` URL with a path (`http://…`, `https://host` with no path, `agent-a`) | — | — | — | — | error **on the page**, no redirect |
| 3 | document unreachable, not JSON, missing `client_name`/`redirect_uris`, or its `client_id` ≠ URL | — | — | — | — | error on the page, no redirect |
| 4 | valid | not in the document, or differs in path, host or scheme (`http://127.0.0.1:7777/cb/`, `https://other.example/cb`) | — | — | — | error on the page, no redirect |
| 4a | valid | a **loopback** redirect differing only in port (`http://127.0.0.1:50123/cb` for registered `:7777/cb`) | `code` | S256 | canonical | page shown (port only, OAuth 2.1 §2.3.1) |
| 4c | valid | `http://localhost:7777/cb` when only `http://127.0.0.1:7777/cb` is registered | — | — | — | error on the page (distinct hosts) |
| 4b | valid | an `https:` redirect differing only in port | — | — | — | error on the page (exact match) |
| 5 | valid | exact | `token` | S256 | canonical | redirect `unsupported_response_type` + `iss` |
| 6 | valid | exact | `code` | missing | canonical | redirect `invalid_request` + `iss` |
| 7 | valid | exact | `code` | `plain` | canonical | redirect `invalid_request` + `iss` |
| 8 | valid | exact | `code` | S256 | missing or foreign | redirect `invalid_target` + `iss` |
| 9 | document's `redirect_uris` contains an `http://` non-localhost URI | — | — | — | — | error on the page (the specification allows only localhost or https) |
| 10 | document names `client_secret` or a secret-based `token_endpoint_auth_method` | — | — | — | — | error on the page (public clients only, CIMD §4.1) |
| 11 | any redirected error (rules 5–8) | | | | | carries `error`, `iss` and `state` (if sent) |

### AUTH-ST-04 — A pending browser authorization and its code
**Req:** R-OA-12, R-OA-14, R-OA-15, R-OA-16 · **Level:** unit (fake clock) · **Flags:** —

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (none) | valid `/authorize` | Pending | page with one token field |
| 2 | Pending | Authorize with a valid, enabled, unpaired token, a valid free id and a usable or empty name | CodeIssued | entry bound; redirect with `code`, `iss` |
| 2a | Pending | Authorize with a good token but `id-invalid`, `id-taken`, `name-invalid` or `name-taken` | Pending | refusal on the page; nothing bound |
| 3 | Pending | Authorize with an invalid token | Pending | uniform "not valid"; failure counted |
| 4 | Pending | Authorize with a valid but paired token | Pending | `already-paired` on the page; nothing changes |
| 4a | Pending | Authorize with a browser-bound token whose every chain ended by lifetime, from the recorded client id, with the bound id | CodeIssued | redirect with `code`, `iss`; the pair is unchanged (renewal, R-OA-16 (7)) |
| 5 | Pending | Cancel | Closed | `access_denied`; nothing bound |
| 6 | Pending | 10 min pass | Expired | Authorize shows the expiry message; nothing bound |
| 7 | Pending | per-client failure limit reached | Pending | further attempts refused with the rate-limit answer; nothing revealed |
| 8 | CodeIssued | token request with correct verifier, redirect, resource within 60 s | Redeemed | `scope: fishball` AT |
| 9 | CodeIssued | wrong `code_verifier` | CodeIssued | `invalid_grant` (K: code not consumed?) |
| 10 | CodeIssued | 60 s pass | Expired | `invalid_grant` |
| 11 | Redeemed | the same code again | Redeemed | `invalid_grant`; every AT issued from it revoked |
| 12 | any | connector restart | (gone) | pending requests and codes lost; bindings stay |

### AUTH-DT-09 — The approval listener's port
**Req:** R-OA-20, R-OA-01, R-OA-02 · **Level:** integration (a second process holding the port) · **Flags:** K (default port; rule 4's rebind timing)

| Rule | Port setting | Port free | Listener | Status | Metadata `authorization_endpoint` | MCP + machine exchange | Approval page |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | default | yes | open | ok | the default port | work | reachable |
| 2 | user-set P | yes | open on P | ok | port P | work | reachable |
| 3 | default | **no** | not open | `approval-port-in-use`, one diagnostic | **kept** (still the default port) | work; stock clients accept the metadata | unreachable |
| 4 | default, clash, then the other process frees the port | — | open (K: on the next start, or retried) | ok | unchanged | work | reachable |
| 5 | changed from a clashing port to a free one | yes | rebinds to the new port | ok | follows the new port | work | reachable at the new port |
| 6 | P equal to DSH's own web port | no | not open | `approval-port-in-use` | kept | work (DSH's UI unaffected) | unreachable |
| 7 | connector running | — | open the whole time; never closed between requests | — | — | — | — |

### AUTH-ST-05 — A browser client's refresh-token chain
**Req:** R-OA-16, R-OA-12, R-OA-06, R-OA-07, R-TOK-05 · **Level:** unit (fake clock), integration · **Flags:** K (maximum chain lifetime: 365 days, decided by the user 2026-11-13)

RT1 is the refresh token from the code redemption; each refresh returns the next (RT2, RT3, …).

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Chain(RT1 live) | `refresh_token` grant with RT1, same `client_id` and `resource` | Chain(RT2 live) | new AT + RT2; RT1 now used |
| 2 | Chain(RT2 live) | grant with RT2 | Chain(RT3 live) | new AT + RT3 |
| 3 | Chain(RT3 live) | grant with **RT1** (reuse, outside the 10 s window) | Revoked | `invalid_grant`; RT3 and every AT of the chain now 401 / `invalid_grant` |
| 3a | Chain(RT2 live, RT1 spent < 10 s ago) | grant with RT1 again, same `client_id` and `resource` | Chain(RT2 live) | the **identical** response that issued RT2; nothing revoked (Q-S7B-1 B) |
| 3b | Chain(RT2 live, RT1 spent < 10 s ago) | grant with RT1 from another `client_id` or for another `resource` | Revoked | reuse: chain revoked |
| 3c | Chain(RT1 live) | grant with RT1, no `resource` | Chain(RT1 live) | `invalid_target`; nothing rotated |
| 4 | Chain(RTn live) | grant with another `client_id` | Chain(RTn live) | `invalid_grant`; nothing rotated |
| 5 | Chain(RTn live) | grant with a foreign `resource` | Chain(RTn live) | `invalid_target` |
| 6 | Chain(RTn live) | the entry is disabled, deleted or its value changed | Revoked | next refresh `invalid_grant`; ATs 401 |
| 7 | Revoked (entry disabled) | entry re-enabled | Revoked | no refresh token revived; the bound entry stays bound, so re-entering it on the page is `already-paired`: the owner needs a new token |
| 8 | Chain(RTn live) | connector restart | Chain(RTn live) | access tokens are gone (401); the client refreshes with RTn and gets RTn+1; the connector's storage holds RTn's **digest**, never its value (Q-S7B-3 decided A) |
| 8a | Chain(RTn live, RTn−1 spent < 10 s before the restart) | RTn−1 presented after the restart | Revoked | reuse (the grace window is not persisted) |
| 8b | Chain(RTn live) | entry disabled while the connector is down, then restart | Revoked | refresh `invalid_grant` |
| 9 | (machine client) | `refresh_token` grant with any value | — | `invalid_grant` |
| 10 | Chain(RTn live), started at T | refresh at T + 365 days − 1 ms | Chain(RTn+1 live) | new AT + RTn+1; the chain's start stays T |
| 11 | Chain(RTn live), started at T | refresh at T + 365 days, or later | Ended | `invalid_grant`; the pair, its name and its pending events stay |
| 12 | Ended (every chain of the entry) | the same client (recorded client id) re-enters the bound token on the page with the bound id | Chain(RT1′ live) | a code, then a new chain started at the redemption, for the **same** principal (same id, name, managed sessions, pending events); no new token, no re-pair (R-OA-16 (7)) |
| 12a | Ended | re-entry from another client id, or with another id | Ended | `already-paired` on the page; nothing changes |
| 12b | Revoked (by reuse, or by disable, delete or value change) | the same client re-enters the bound token with the bound id | Revoked | `already-paired`: only an ended lifetime renews |
| 12c | Ended, while another chain of the entry is still live | re-entry from the recorded client id with the bound id | unchanged | `already-paired` |
| 12d | Ended, then the entry disabled and re-enabled, or its value changed | re-entry (the current value) from the recorded client id with the bound id | Ended | `already-paired`: a change since the end blocks renewal (user decision 2026-11-13) |
| 12e | Ended | renewal with another redirect URI the client's document lists | Chain(RT1′ live) | accepted; the new redirect URI is recorded |

### AUTH-DT-08 — What entering a token on the page does
**Req:** R-OA-12, R-OA-11, R-OA-16, R-ID-02, R-ID-03, R-ID-04, R-ID-13, R-TOK-00, R-TOK-06, R-TOK-08, R-NAME-02, R-NAME-08 · **Level:** integration · **Flags:** —

| Rule | Entered value | Entry state | Binding | Result on the page | Changes |
| --- | --- | --- | --- | --- | --- |
| 1 | matches no entry | — | — | "this token is not valid" | none; failure counted |
| 2 | matches a **disabled** entry | disabled | any | same text as rule 1 | none |
| 3 | matches a deleted entry's old value | gone | — | same text as rule 1 | none |
| 4 | user-set value under 32 characters | `token-too-short` | — | same text as rule 1 | none |
| 5 | valid; id valid and free; name empty | enabled | unpaired | redirect with `code`, `iss` | entry bound to the typed id, **no name**, `pairedAt` set |
| 5a | valid; id valid and free; name valid and free | enabled | unpaired | redirect | bound, named |
| 5b | valid; id with a dot or over 64 characters | enabled | unpaired | `id-invalid` | none |
| 5c | valid; id used by another entry, browser or machine (also a disabled one) | enabled | unpaired | `id-taken` | none |
| 5g | valid; id used by an entry that was since **deleted** | enabled | unpaired | accepted (a deleted entry frees its id) | bound |
| 5d | valid; id differs from another entry's only in case (`Agent-W` vs `agent-w`) | enabled | unpaired | accepted (ids are case-sensitive) | bound |
| 5e | valid; id free; name held by another principal | enabled | unpaired | `name-taken` | none |
| 5f | valid; id free; name only whitespace | enabled | unpaired | treated as empty: bound with no name | bound |
| 6 | valid | enabled | paired to a machine client | `already-paired`, "create a new token", bound name and last-seen | none |
| 7 | valid | enabled | paired to **this same** browser client | `already-paired` (handshake rule 1.9; the client keeps working through refresh tokens, R-OA-16) | none |
| 7a | valid | enabled | paired to **this same** browser client (recorded client id), every chain ended by its 365-day lifetime, typed id = bound id | redirect with `code`, `iss` (renewal, R-OA-16 (7)) | none to the pair; a new chain at redemption |
| 7b | valid | enabled | as 7a, typed id ≠ bound id | `already-paired` | none |
| 8 | valid | enabled | paired to another browser client | `already-paired` | none |
| 9 | valid, unpaired, name field empty, `client_name` held by another principal | enabled | unpaired | redirect | bound with no name (`client_name` is only a hint) |
| 10 | empty field | — | — | "enter a token" | none; not counted as a failure (K) |
| 11 | any | — | — | — | the value never appears in a URL, redirect, code, log or response; the page is `no-store` |

Rules 1–4 return byte-identical page bodies.

### AUTH-EP-10 — The connector behind the user's tunnel
**Req:** R-REM-05, R-REM-03, R-OA-01, R-OA-20, R-REM-02 · **Level:** integration (a local TLS-terminating proxy as the tunnel) · **Flags:** —

| # | Setup | Expected |
| --- | --- | --- |
| 1 | tunnel host `fb.example` in DSH's `--trusted-host`, both listeners forwarded | PRM, AS metadata, token endpoint and approval page work under `https://fb.example`; issuer, canonical MCP URI and `authorization_endpoint` all use `https://fb.example` |
| 2 | tunnel host **not** in `--trusted-host` | refused before authentication on both listeners |
| 3 | an AT issued under `https://fb.example`, used under `http://127.0.0.1` | 401 (other canonical URI) |
| 4 | a forwarded-scheme header (`X-Forwarded-Proto: http`) from the tunnel | ignored; a non-loopback host is always `https` |
| 5 | only DSH's listener forwarded, not the approval listener | machine exchange works; the browser flow cannot reach the page (documented in the README) |
| 6 | the connector's own features | no tunnel, relay or exposure setting exists |

### AUTH-BVA-08 — The refresh grace window (10 s)
**Req:** R-OA-16 · **Level:** unit (fake clock) · **Flags:** K (10 s)

RT1 spent at t = 0, producing RT2. Same `client_id` and `resource` unless stated.

| # | RT1 presented again at | Expected |
| --- | --- | --- |
| 1 | 0.001 s | identical successor (RT2 and its AT) |
| 2 | 9.999 s | identical successor |
| 3 | 10 s | reuse: chain revoked, `invalid_grant` |
| 4 | 10.001 s | reuse: chain revoked |
| 5 | 5 s, by another `client_id` | reuse: chain revoked |
| 6 | 3 concurrent at 0.1–0.3 s (the DSH SDK client's in-flight calls) | all three get the identical successor; chain intact |

### AUTH-BVA-07 — Code and request lifetimes
**Req:** R-OA-14, R-OA-15 · **Level:** unit (fake clock) · **Flags:** K (60 s and 10 min frozen at V3-K)

| # | Event at (s after issue) | Expected |
| --- | --- | --- |
| 1 | code redeemed at 59 | AT |
| 2 | code redeemed at 60 | `invalid_grant` |
| 3 | code redeemed at 61 | `invalid_grant` |
| 4 | Authorize at 599 after `/authorize` | code issued |
| 5 | Authorize at 600 | expired |
| 6 | Authorize at 601 | expired |

### AUTH-EP-08 — Client ID Metadata Document fetch limits (SSRF)
**Req:** R-OA-13 · **Level:** integration (stub HTTP servers) · **Flags:** K (time bound; size 5 KiB decided per spec)

| # | `client_id` URL resolves to | Expected |
| --- | --- | --- |
| 1 | a public https host | fetched |
| 2 | `127.0.0.1`, `::1`, `localhost` | refused before connecting |
| 3 | RFC 1918, link-local (`169.254.0.0/16`, `fe80::/10`), unique-local addresses | refused |
| 4 | a public name that redirects to a private address | refused |
| 5 | `http:` scheme | refused |
| 6 | body over 5 KiB / slower than the time bound | refused |
| 6a | the document's host answers with a redirect | refused (no redirects followed) |
| 6b | a client-id URL with a dot segment, fragment or userinfo | refused (must survive WHATWG parsing unchanged) |
| 6c | a fetch that failed | not cached; the next request fetches again |
| 7 | cache headers `max-age=60`, second request at 30 s | served from cache, no fetch |

### AUTH-EP-09 — Host header and issuer selection (spike S1)
**Req:** R-REM-03, R-OA-01, R-OA-20 · **Level:** integration · **Flags:** —

| # | `Host` of the request | Expected |
| --- | --- | --- |
| 1 | `127.0.0.1:<port>` | served; issuer and canonical URI use `127.0.0.1:<port>` |
| 2 | `localhost:<port>` | served; issuer and canonical URI use `localhost:<port>` |
| 3 | the bind address | served |
| 4 | a host in DSH's `--trusted-host` list | served; issuer under that host |
| 5 | any other host (DNS rebinding, `evil.example`) | refused before authentication, on DSH's listener and on the approval listener |
| 6 | AT issued under host 1, used under host 2 | 401 (different canonical URI) |
| 7 | the AS metadata fetched under host H | its `issuer` equals the issuer built from H |

## Connector adapter `fishball-connector-adapter` (requirements 1.25, 1.25a, R-OA-21; spike S7c `51e9ff1`)

Fixtures for this section: **N** is the DSH with the adapter installed, M is the DSH with connector C.
`U = <origin of M>/api/fishball/mcp` is a configured server `{serverName: "m", url: U}`. `CIMD =
https://agent.example/fb-adapter.json` is the user-hosted document (`client_id` = its URL,
`client_name`, `redirect_uris: ["http://127.0.0.1:7777/callback"]`, `token_endpoint_auth_method:
"none"`). A **fake connector** is a stub HTTP server that serves the metadata, the approval page and
the token endpoint as scripted per row, and records every request. LEAD (refresh lead) and TIMEOUT
(attempt timeout, at most 600 s) are the adapter's K values (S7c plan step K1). **END** is the state an
attempt that ends without a grant leaves behind (Cancel, a rejected callback, TIMEOUT): the sources
leave what enters `failed` to the adapter contract, so END is `needs-authorization` or `failed` (K),
and the rows only require that it is not `authorized`. The **probe console** is the stdout and
stderr of the test process that drives N and M. Integration rows run
on 0.2.1-rc.5 and 0.2.2-rc.1 (R-COMPAT-01). **Owner** names the task in v3-remaining-plan.md that
writes the test.

### AUTH-UC-12 — A DSH signs in to a Fishball connector through the adapter and stays connected
**Req:** R-OA-21, R-OA-11, R-OA-12, R-OA-13, R-OA-14, R-OA-16, R-TOK-01, R-TOK-04 · **Level:** integration (N on both SDKs against a fake connector and the S7b connector prototype; end to end against the real connector), e2e (the approval page in a real browser) · **Flags:** K (LEAD; END) · **Owner:** C-MCP-ADAPTER (integration, fake connector and S7b prototype); X-REMOTE (end to end, the real connector with persisted refresh digests); E2E-AUTH (e2e)

- **Actor:** the owner of N and M, and the agent of a session in N.
- **Preconditions:** the adapter is enabled in N with `clientMetadataUrl = CIMD` and `servers: [{serverName: "m", url: U}]`; N's configuration holds no `dsh-mcp-client` row and no `!!js`; the owner created E7 by hand in C's settings; E7 is enabled and unpaired; no grant for `m` exists.
- **Main flow:**
  1. The adapter reports `m` as `needs-authorization`; no child row is mounted and no `mcp__m__…` tool exists.
  2. The agent calls `fishball_connector_sign_in({server: "m"})`. The adapter reads M's protected-resource metadata, then its authorization-server metadata, and the Fishball-connector check passes (AUTH-DT-11 rule 1).
  3. The tool returns at once with `approval-url`: an URL on M's approval listener with `client_id = CIMD`, `redirect_uri = http://127.0.0.1:<port>/callback`, `code_challenge_method = S256`, `state`, `scope = fishball` and `resource = U`, plus the text "open it in your browser and enter a token from the connector's settings". The state is `authorizing`. No registration request was sent.
  4. The owner opens the URL, types `v(E7)`, the id `dsh-n` and no name, and presses Authorize.
  5. The adapter's callback receives `code`, `state` and `iss`, checks `state` and `iss`, and exchanges the code with `code_verifier`, `redirect_uri`, `client_id` and `resource`, with no client secret → an access token (`scope: fishball`) and a refresh token. The grant is committed to N's credential store.
  6. The state is `authorized`; the adapter mounts a stock `dsh-mcp-client` child row pointed at its loopback proxy; `mcp__m__pair`, `mcp__m__whoami` and the other tools appear; `whoami` shows a browser pair with id `dsh-n`.
  7. Tool calls and `subscriptions/listen` succeed through the proxy, which sends `Authorization: Bearer <access token>` upstream.
  8. Across several 3600 s lifetimes (fake clock), the adapter refreshes once per lifetime, LEAD before expiry; the child row is never restarted and keeps working.
  9. A later `fishball_connector_sign_in({server: "m"})` returns `authorized` and changes nothing.
- **Alternative flows:**
  - A1. M's connector restarts → access tokens are gone; the row's next call gets 401 at the proxy, which refreshes once with the refresh token whose digest C persisted (R-OA-16 (5)) and retries once → the call succeeds; no browser step, no new sign-in.
  - A2. N restarts → `m` comes back `authorized` from the stored grant; no browser and no token request at start; the child row is mounted again.
  - A3. C drops the access token early while the adapter's clock says it is valid → the call that hits the 401 succeeds after one refresh and one retry.
  - A4. Eight calls hit an expired access token at once → all eight succeed with exactly **one** refresh grant; C records no refresh-token reuse.
  - A5. Two N processes share the credential store and both see the token near expiry → one refresh grant in total (the record lock), and both use the new token.
- **Exception flows:**
  - E1. The owner disables E7 → the next refresh gets `invalid_grant`; `m` becomes `needs-authorization`, reported once; no further refresh is attempted.
  - E2. The owner presses Cancel on the approval page → `access_denied` with `iss`; the attempt ends; `m` is END; no child row.
  - E3. The callback carries a wrong `state` or `iss` → the code is not exchanged and no grant is committed (whether the attempt ends or keeps waiting for a good callback is K).
  - E4. The 401 persists after the one refresh and retry → the call fails; `m` is `needs-authorization`; no third request.
  - E5. The adapter is disabled → refreshing stops and the child row is gone.
- **Postconditions:** C saw only standard OAuth requests (no non-standard header, field or grant, and no `registration_endpoint` use); no token value, refresh token, verifier or `v(E7)` is in N's configuration, logs, the tool's results or the session transcript (AUTH-EP-13); no host file of N was patched.

### AUTH-UC-13 — The adapter is installed without its client-id setting
**Req:** R-OA-21 · **Level:** integration (both SDKs, fake connector) · **Flags:** — · **Owner:** C-MCP-ADAPTER

- **Actor:** the owner of N, and the agent of a session in N.
- **Preconditions:** the adapter is enabled with `servers: [{serverName: "m", url: U}]` and **no** `clientMetadataUrl` (the setting has no default); the fake connector records every request.
- **Main flow:**
  1. The adapter starts; `m` is `needs-configuration`; no child row and no `mcp__m__…` tool exist.
  2. The agent calls `fishball_connector_sign_in({server: "m"})` → `needs-configuration`, saying the client-id setting is missing; no URL is returned.
  3. The owner sets `clientMetadataUrl = CIMD` → `m` becomes `needs-authorization`; the next sign-in proceeds as in AUTH-UC-12 step 2.
- **Alternative flows:**
  - A1. The setting holds a value that is not an https URL with a non-root path (AUTH-EP-12) → the same as step 2.
- **Exception flows:**
  - E1. The owner saves an invalid value after a valid one, while `m` has no grant → `m` is `needs-configuration` again (AUTH-EP-12 row 8).
- **Postconditions:** until step 3, the fake connector received no authorization, registration or token request, and the approval page was never opened; the adapter never substituted a built-in or hard-coded client id.

### AUTH-UC-14 — A configured server that is not a Fishball connector is refused
**Req:** R-OA-21 · **Level:** integration (both SDKs, a non-Fishball OAuth-protected MCP server stub) · **Flags:** K (when the check runs and which metadata it reads) · **Owner:** C-MCP-ADAPTER

- **Actor:** the agent of a session in N.
- **Preconditions:** `clientMetadataUrl = CIMD`; `servers: [{serverName: "x", url: "https://other.example/mcp"}]`; the server at that URL is a stock OAuth-protected MCP server whose metadata names `https://other.example/oauth` as its authorization server and `scopes_supported: ["read"]`, and records every request.
- **Main flow:**
  1. The agent calls `fishball_connector_sign_in({server: "x"})`.
  2. The adapter reads the server's discovery metadata, and the Fishball-connector check fails (AUTH-DT-11).
  3. The tool returns `needs-configuration`, saying the server is not a Fishball connector; `x` is `needs-configuration`.
- **Alternative flows:**
  - A1. Only one of the three checks fails (AUTH-DT-11 rules 2–7) → the same result.
- **Exception flows:**
  - E1. A second call → the same result; still no authorization, registration or token request.
- **Postconditions:** the server received no authorization, registration or token request, and no URL was returned; no grant record for `x` exists; no child row is mounted.

### AUTH-EP-12 — The `clientMetadataUrl` setting
**Req:** R-OA-21, R-OA-13 · **Level:** integration (both SDKs, fake connector) · **Flags:** — · **Owner:** C-MCP-ADAPTER

| # | Class | Value | State of every server | Sign-in result |
| --- | --- | --- | --- | --- |
| 1 | absent | (no setting) | `needs-configuration` | `needs-configuration`; no authorization request |
| 2 | empty | `""` | `needs-configuration` | as row 1 |
| 3 | not a URL | `fb-adapter` | `needs-configuration` | as row 1 |
| 4 | `http:` with a path | `http://agent.example/fb-adapter.json` | `needs-configuration` | as row 1 |
| 5 | `https:`, root path | `https://agent.example/` | `needs-configuration` | as row 1 |
| 6 | `https:`, no path | `https://agent.example` | `needs-configuration` | as row 1 |
| 7 | `https:` with a non-root path | `CIMD` | `needs-authorization` | `approval-url` whose `client_id` is exactly this value |
| 8 | valid, then removed | row 7, then absent | `needs-configuration` again for a server with no grant | as row 1 |

### AUTH-EP-13 — Where the adapter's secrets may appear (leak check)
**Req:** R-OA-21, R-TOK-04, R-SEC-02 · **Level:** integration (a full AUTH-UC-12 run on both SDKs with planted, recognisable values) · **Flags:** — · **Owner:** C-MCP-ADAPTER (adapter suite); X-SEC (full-run sweep)

Planted values: `v(E7)`, every access token, every refresh token, every authorization code, every PKCE verifier and the proxy's local bearer. Each cell is a grep for every planted value.

| # | Place | Expected hits |
| --- | --- | --- |
| 1 | N's configuration (profile and home patches, settings documents) | 0 |
| 2 | every log of N and M, and the probe console | 0 |
| 3 | every result of `fishball_connector_sign_in` (the `approval-url` URL carries only `client_id`, `redirect_uri`, `state`, the PKCE challenge, `scope`, `resource`) | 0 |
| 4 | the **session transcript** of the session that called the tool (stored history and what the client renders) | 0 |
| 5 | every other file of N's and M's homes, temp dirs and lifecycle files, except row 6 | 0 |
| 6 | N's `.credentials.yaml` | the grant record of each server (its access and refresh token); never `v(E7)` or the local bearer; whether an attempt's verifier or code is held there while the attempt runs is K; file mode 0600 |
| 7 | requests the proxy sends upstream | the access token only in `Authorization`; never in a URL; never the local bearer |
| 8 | anything the adapter's status reports | no value of any planted class |

### AUTH-EP-14 — Requests to the adapter's loopback proxy
**Req:** R-OA-21 · **Level:** integration (both SDKs, fake connector) · **Flags:** K (row 10's cap) · **Owner:** C-MCP-ADAPTER

| # | Class | Expected |
| --- | --- | --- |
| 1 | from the child row, correct local bearer | forwarded with the real access token; the response streams back |
| 2 | no `Authorization` header | refused at the proxy; nothing forwarded |
| 3 | a wrong local bearer, same length | refused; nothing forwarded (constant-time comparison) |
| 4 | a wrong local bearer, other length | refused; nothing forwarded |
| 5 | a local bearer from before an adapter restart | refused (the bearer is per start and never on disk) |
| 6 | the caller's own `Authorization` value | never forwarded upstream (no token passthrough) |
| 7 | hop-by-hop headers (`connection`, `keep-alive`, `transfer-encoding`, `upgrade`, `te`, `trailer`, `proxy-authorization`) | not forwarded |
| 8 | the proxy's listening address | 127.0.0.1 only; not reachable on any other interface |
| 9 | a `subscriptions/listen` stream | stays open and streams events |
| 10 | a request body at the proxy body cap, and one byte over it (K: the cap) | at the cap: forwarded; over it: refused at the proxy, nothing forwarded |

### AUTH-BVA-09 — Refresh timing, the 401 retry and the attempt timeout
**Req:** R-OA-21, R-OA-16 · **Level:** integration (fake clock, fake connector, both SDKs) · **Flags:** K (LEAD, TIMEOUT ≤ 600 s; END) · **Owner:** C-MCP-ADAPTER

The access token is issued at t0 with `expires_in: 3600`; E = t0 + 3600.

| # | Input | Expected |
| --- | --- | --- |
| 1 | time reaches E − LEAD − 1 | no refresh grant |
| 2 | time reaches E − LEAD | exactly one refresh grant |
| 3 | time reaches E − LEAD + 1 after row 2 | no second grant |
| 4 | a call gets 1 × 401 | one refresh, one retry; the call succeeds |
| 5 | a call gets 2 × 401 (the retry is refused too) | the call fails; `needs-authorization`; no third upstream request and no second refresh |
| 6 | a sign-in attempt is pending at TIMEOUT − 1 | still pending; a sign-in call returns the same URL |
| 7 | a sign-in attempt is pending at TIMEOUT | ended; END; a sign-in call returns a new URL |
| 8 | the frozen TIMEOUT | ≤ 600 s (the connector's pending lifetime, R-OA-15) |

### AUTH-DT-11 — The Fishball-connector check (Q-S7C-5 = A)
**Req:** R-OA-21 · **Level:** integration (stub metadata servers, both SDKs) · **Flags:** K (rule 9's state; when the check runs) · **Owner:** C-MCP-ADAPTER

The configured URL is `url`; O is its origin. `clientMetadataUrl` is valid in every rule. "Requests" are
authorization, registration and token requests; which discovery reads happen, and whether the check
runs at start or at sign-in, is K.

| Rule | Path of `url` | PRM `resource` | `authorization_servers[0]` | `scopes_supported` | Result | Requests after the metadata reads |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/api/fishball/mcp` | equals `url` | O + `/api/fishball/oauth` | includes `fishball` | Fishball connector: sign-in proceeds | none yet; `approval-url` returned (the browser then sends the authorization request) |
| 2 | `/api/fishball/mcp` | another URL | O + `/api/fishball/oauth` | includes `fishball` | refused: `needs-configuration` | none |
| 3 | `/api/fishball/mcp` | equals `url` | another origin + `/api/fishball/oauth` | includes `fishball` | refused | none |
| 4 | `/api/fishball/mcp` | equals `url` | O + another path | includes `fishball` | refused | none |
| 5 | `/api/fishball/mcp` | equals `url` | O + `/api/fishball/oauth` | lacks `fishball` | refused | none |
| 6 | `/api/fishball/mcp` | equals `url` | O + `/api/fishball/oauth` | absent | refused | none |
| 7 | another path (`/mcp`) | equals `url` | O + `/api/fishball/oauth` | includes `fishball` | refused | none |
| 8 | `/api/fishball/mcp` | equals `url` | only the second entry is O + `/api/fishball/oauth` | includes `fishball` | refused (the first entry decides) | none |
| 9 | any | the metadata cannot be read (unreachable, not JSON) | — | — | no sign-in (K: `failed` or `needs-configuration`, frozen by the adapter contract) | none |

### AUTH-DT-12 — What `fishball_connector_sign_in` returns
**Req:** R-OA-21 · **Level:** integration (both SDKs, fake connector) · **Flags:** K (rule 8's code) · **Owner:** C-MCP-ADAPTER

| Rule | `server` configured | `clientMetadataUrl` valid | Fishball connector (DT-11) | Grant with live tokens | Attempt pending | Result | Side effect |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | yes | no | — | — | — | `needs-configuration` (client-id setting missing) | no request to the server |
| 2 | yes | yes | no | — | — | `needs-configuration` (not a Fishball connector) | no authorization, registration or token request |
| 3 | yes | yes | yes | yes | — | `authorized` | none; no new attempt |
| 4 | yes | yes | yes | no | no | `approval-url` with a new URL | a new attempt starts; state `authorizing` |
| 5 | yes | yes | yes | no | yes | `approval-url` with the **same** URL as the pending attempt | no second attempt |
| 6 | yes | yes | yes | no (the last attempt ended without a grant: Cancel, a rejected callback, TIMEOUT; or a later `invalid_grant` dropped the tokens) | no | `approval-url` with a new URL (new `state`) | the old URL stays dead (AUTH-ST-07) |
| 7 | any | any | any | any | any | the result returns at once, never waits for the approval | — |
| 8 | **no** (unknown `server`) | any | — | — | — | refused (K: code frozen by the adapter contract) | nothing changes; no request |

### AUTH-ST-06 — The adapter's state for one configured server
**Req:** R-OA-21, R-OA-16 · **Level:** integration (fake connector and fake clock, both SDKs) · **Flags:** K (what enters `failed`, END; when the Fishball-connector check runs) · **Owner:** C-MCP-ADAPTER

States: `needs-configuration`, `needs-authorization`, `authorizing`, `authorized`, `failed`.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (start) | adapter starts, `clientMetadataUrl` missing or invalid | `needs-configuration` | no child row; no authorization request |
| 2 | `needs-configuration` | a valid `clientMetadataUrl` is saved | `needs-authorization` | no request yet |
| 3 | (start) | adapter starts, valid setting, no grant | `needs-authorization` | no child row |
| 4 | (start) | adapter starts, valid setting, a stored grant | `authorized` | child row mounted; no browser, no token request at start |
| 5 | `needs-authorization` | the Fishball-connector check fails (at start or at sign-in, K) | `needs-configuration` | no authorization, registration or token request |
| 6 | `needs-authorization` | sign-in, the check passes | `authorizing` | `approval-url` returned |
| 7 | `authorizing` | sign-in again | `authorizing` | the same URL |
| 8 | `authorizing` | callback with `code`, valid `state` and `iss` | `authorized` | code exchanged; grant committed; child row mounted |
| 9 | `authorizing` | callback with a wrong `state` or `iss` | `authorizing` or END (K) | code not exchanged; no grant |
| 10 | `authorizing` | `access_denied` (Cancel) | END | reported once |
| 11 | `authorizing` | TIMEOUT passes | END | the URL is dead |
| 12 | `authorizing` | the attempt fails for any other reason | `failed` | reported (K) |
| 13 | `authorized` | LEAD before expiry | `authorized` | one refresh grant; no row restart |
| 14 | `authorized` | 401 at the proxy, refresh succeeds (connector restarted, A1) | `authorized` | one refresh, one retry; the call succeeds |
| 15 | `authorized` | `invalid_grant` on refresh (entry disabled, deleted or value changed) | `needs-authorization` | tokens dropped; reported once; no retry loop |
| 16 | `authorized` | 401 again after the retry | `needs-authorization` | no third request |
| 17 | `authorized` | the grant record is removed | `needs-authorization` | child row disposed of |
| 18 | `authorized` | sign-in | `authorized` | result `authorized`; nothing changes |
| 19 | any | adapter disabled | (stopped) | no refresh; nothing written to any configuration |

### AUTH-ST-07 — One sign-in attempt and its approval URL
**Req:** R-OA-21, R-OA-14, R-OA-15 · **Level:** integration (fake connector and fake clock, both SDKs) · **Flags:** K (TIMEOUT; row 3a's state) · **Owner:** C-MCP-ADAPTER

The attempt's URL is u1; its loopback callback is the one the attempt listens on.

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (none) | sign-in | Pending(u1) | `approval-url` u1; callback listening on a fresh OS port |
| 2 | Pending(u1) | sign-in again, before TIMEOUT | Pending(u1) | `approval-url` u1 again, byte-identical; no second attempt, no second listener |
| 3 | Pending(u1) | callback with `code`, valid `state` and `iss` | Ended(authorized) | grant committed; a later redirect for u1 is not accepted (row 7) |
| 3a | Pending(u1) | callback with a wrong `state` or `iss` | Pending(u1) or Ended(rejected) (K) | code not exchanged; no grant |
| 4 | Pending(u1) | `access_denied` | Ended(denied) | no grant; a later redirect for u1 is not accepted (row 7) |
| 5 | Pending(u1) | TIMEOUT | Ended(expired) | no grant; a later redirect for u1 is not accepted (row 7) |
| 6 | Pending(u1) | the adapter is disabled or restarts | Ended | no grant; nothing of the attempt survives |
| 7 | Ended(any) | a redirect for u1 (its `state`) arrives | Ended | not accepted: no code exchange and no grant |
| 8 | Ended(denied / expired / rejected) | sign-in | Pending(u2) | a new URL u2 ≠ u1 (new `state`, new PKCE challenge) |
| 9 | Ended(authorized) | sign-in | Ended(authorized) | result `authorized`; no URL |
