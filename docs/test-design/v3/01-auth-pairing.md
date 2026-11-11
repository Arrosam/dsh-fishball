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
  1. The client sends `Authorization: Bearer agent-a.<v(E1)>` with no `Fishball-Agent-Id` → 401 `invalid_token`, identical to any invalid access token.
  2. It sends `Authorization: Bearer <v(E1)>` with no `Fishball-Agent-Id` → the same 401.
  3. The connector's settings have no `directAccess` switch.
- **Alternative flows:**
  - A1. The client obtains an access token at the token endpoint with `agent-a` + `v(E1)` → MCP requests then succeed.
  - A2. The client adds `Fishball-Agent-Id: agent-a` to request 2 → it succeeds as E1's pair (AUTH-UC-11).
- **Exception flows:** E1. The header from a disallowed `Origin` → 403 before any token check.
- **Postconditions:** the bearer value is never logged (grep); these requests count toward the per-client failure limit like any other.

### AUTH-UC-11 — A `dsh-mcp-client` row connects with static token + id headers
**Req:** R-OA-10, R-ID-13, R-ID-12, R-NAME-08, R-TOK-01, R-TOK-05, R-TOK-06 · **Level:** integration (a second DSH with a `dsh-mcp-client` row, both SDKs) · **Flags:** —

- **Actor:** the owner of DSH M (connector) and of DSH N, where a `dsh-mcp-client` row points at M's connector.
- **Preconditions:** the owner created E7 by hand in M's connector settings; E7 is enabled and unpaired.
- **Main flow:**
  1. The owner configures N's row with `headers: {Authorization: "Bearer <v(E7)>", "Fishball-Agent-Id": "dsh-n"}`.
  2. The row's first request (`server/discover`) → M binds E7 to `dsh-n` atomically, with **no name**; the request succeeds.
  3. `tools/list`, `tools/call` and `subscriptions/listen` succeed at full power; M's settings show E7 paired to **ID:** dsh-n.
  4. Hours later (beyond 3600 s, fake clock) the same headers still work: no expiry, no refresh.
- **Alternative flows:**
  - A1. The agent calls `set_name("Mirror")` → it is shown as "Mirror".
  - A2. M's connector restarts → the next request works with no new pairing.
- **Exception flows:**
  - E1. The owner disables E7 → the next request gets 401 and N's listen stream closes; re-enabling restores the same pair.
  - E2. N's row is changed to `Fishball-Agent-Id: other` → 401 `invalid_token`, `error_description` `already-paired`; nothing changes.
  - E3. A fresh entry E8 with `Fishball-Agent-Id: dsh-n` (already held by E7) → 401, `id-taken`; E8 stays unpaired.
  - E4. A wrong token value with any id → 401 `invalid_token` with no detail.
- **Postconditions:** the value appears in N's row config (the owner's choice) but in no log, response or page of M (grep).

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
| 7 | the raw token value `v(E1)`, no `Fishball-Agent-Id` | 401 `invalid_token` |
| 8 | `<id>.<v(E1)>` (with or without the id header) | 401 `invalid_token` |
| 8b | `v(E1)` with `Fishball-Agent-Id` of its bound id | processed, full power (R-OA-10; AUTH-DT-10) |
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

### AUTH-EP-11 — Static header request classes
**Req:** R-OA-10, R-TOK-01, R-ID-02 · **Level:** integration · **Flags:** —

| # | Headers | Expected |
| --- | --- | --- |
| 1 | `Authorization: Bearer <access token>` only | the OAuth path |
| 2 | `Authorization: Bearer <token value>` + `Fishball-Agent-Id: a` | the static path |
| 3 | `Fishball-Agent-Id: a` with an **access token** as the bearer | 401 `invalid_token` (a static request needs the token value) |
| 4 | `Fishball-Agent-Id` present but empty, or with a dot, or 65 characters | 401, `id-invalid` |
| 5 | `Fishball-Agent-Id` sent twice with different values | 401, `id-invalid` |
| 6 | `Fishball-Agent-Id` without `Authorization` | 401, no `error=` attribute |
| 7 | header name in another case (`fishball-agent-id`) | treated the same (HTTP header names are case-insensitive) |
| 8 | the token value in a query parameter | refused, never processed (R-TOK-02) |

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

### AUTH-DT-10 — Static header access outcome
**Req:** R-OA-10, R-ID-13, R-TOK-00, R-TOK-05 · **Level:** integration · **Flags:** —

| Rule | Token value | Entry state | Id in `Fishball-Agent-Id` | Result | Changes |
| --- | --- | --- | --- | --- | --- |
| 1 | matches no entry | — | any | 401 `invalid_token`, no detail | none; failure counted |
| 2 | matches a disabled / deleted entry, or a too-short value | — | any | same as rule 1 | none |
| 3 | valid | enabled, unbound | valid, free | processed, full power | entry bound to the id, no name |
| 4 | valid | enabled, unbound | valid, held by another entry | 401, `id-taken` | none |
| 5 | valid | enabled, unbound | invalid | 401, `id-invalid` | none |
| 6 | valid | enabled, bound to this id | same | processed, full power | `lastSeenAt` only |
| 7 | valid | enabled, bound to another id | other | 401, `already-paired` | none |
| 8 | valid | bound by the OAuth `pair` or the approval page, same id | same | processed (one pair, whichever path bound it) | none |
| 9 | valid | enabled, bound; then disabled | same | the next request 401; open streams closed | — |
| 10 | valid, 2 concurrent first requests on one unbound entry with different ids | unbound | a / b | exactly one binds; the other gets `already-paired` | one binding |

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

- **Actor:** whoever holds a token (normally the DSH owner); an external MCP client with the authorization code flow (the DSH SDK client `@modelcontextprotocol/client` 2.2.0 on both SDKs, or the Python MCP SDK; DSH's own `dsh-mcp-client` has no OAuth and uses static header access instead, AUTH-UC-11) and a Client ID Metadata Document at `https://agent.example/cimd.json` (`client_name: "Agent W"`, `redirect_uris: ["http://127.0.0.1:7777/cb"]`).
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
**Req:** R-OA-12, R-OA-14, R-OA-15 · **Level:** unit (fake clock) · **Flags:** —

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | (none) | valid `/authorize` | Pending | page with one token field |
| 2 | Pending | Authorize with a valid, enabled, unpaired token, a valid free id and a usable or empty name | CodeIssued | entry bound; redirect with `code`, `iss` |
| 2a | Pending | Authorize with a good token but `id-invalid`, `id-taken`, `name-invalid` or `name-taken` | Pending | refusal on the page; nothing bound |
| 3 | Pending | Authorize with an invalid token | Pending | uniform "not valid"; failure counted |
| 4 | Pending | Authorize with a valid but paired token | Pending | `already-paired` on the page; nothing changes |
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
**Req:** R-OA-16, R-OA-06, R-OA-07, R-TOK-05 · **Level:** unit (fake clock), integration · **Flags:** K (maximum chain lifetime)

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

### AUTH-DT-08 — What entering a token on the page does
**Req:** R-OA-12, R-OA-11, R-ID-02, R-ID-03, R-ID-04, R-ID-13, R-TOK-00, R-TOK-06, R-TOK-08, R-NAME-02, R-NAME-08 · **Level:** integration · **Flags:** —

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
