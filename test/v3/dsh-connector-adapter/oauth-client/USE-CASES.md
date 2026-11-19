# `dsh-connector-shared/oauth-client`: Use Cases and case derivation

Black-box cases for the generic browser-OAuth library of the DSH side (requirements 1.40, design
§6.3a "One copy per side"; the S7c K2 token manager). They are derived from these sources only:
R-OA-21 rules 3 and 5, R-OA-13, R-OA-14, R-OA-16, R-TOK-04, R-SEC-02, spike S7c §4 and §5
("decided per spec"), and the relayed library surface in the C-MCP-ADAPTER test brief. The library
holds no adapter code and makes no DSH-connector check, so no row here expects one.

The cases run on the real `dsh-credentials-local` (in a temp dir) and the real `dsh-authorization`
of each SDK (0.2.1-rc.5 and 0.2.2-rc.1). The MCP SDK `@modelcontextprotocol/client` 2.2.0 is
handed to the library from the SDK under test. The fake DSH connector is in [fakes.mjs](fakes.mjs).
Every test title is `[SDK <v>] <case id> <row> …`.

## Actors

- **Caller**: the adapter (or any DSH-side plugin) that owns one credential key and drives one
  token manager.
- **Owner**: the person who opens the approval URL and types a connector token. In the tests this
  is a scripted browser.
- **Connector**: the authorization server and protected resource, faked on 127.0.0.1.
- **Clock**: a fake `now()` and fake `timers`, which drive token expiry, the refresh lead and the
  attempt timeout.

## Use Cases

### OAC-UC-01: one browser authorization attempt

- **Preconditions:** a credential key with no record; a `ctx.authorization` flow registered for
  it, whose `run(session)` calls `manager.authorize({...})`; discovery done with `discoverServer`.
- **Main flow:**
  1. The caller begins the flow.
  2. The library opens a loopback listener on `http://127.0.0.1:<OS port>/callback`.
  3. It calls `session.notify({message, url})`. The URL is the connector's `authorization_endpoint`
     with `response_type=code`, `client_id` = the CIMD URL, `code_challenge` and
     `code_challenge_method=S256`, the redirect URI, `state`, `scope` (from the PRM's
     `scopes_supported`) and `resource`.
  4. The owner approves.
  5. The callback carries `code`, the same `state` and the right `iss`.
  6. The library exchanges the code: `grant_type=authorization_code`, `code`, `code_verifier`,
     `redirect_uri`, `client_id` and `resource`, with no client secret.
  7. It commits the v1 grant record through `session.commit`.
  8. `authorize` resolves.
- **Alternative and exception flows:**
  - A1: Cancel → `access_denied` with the right `iss` → `denied`.
  - E1: the callback has a wrong `state` → `rejected`; the code is not exchanged.
  - E2: the callback has a wrong or missing `iss` → `rejected`.
  - E3: `access_denied` with a wrong `iss` → `rejected`, because `iss` is checked on error
    responses too.
  - E4: another OAuth error on the callback → `failed`.
  - E5: the token endpoint errors during the exchange → `failed`; nothing is committed.
  - E6: TIMEOUT passes → `expired`.
  - E7: `session.signal` aborts → the attempt ends; nothing is committed.
- **Postconditions:** in every ending without a grant, nothing is committed and the listener is
  closed. A later redirect for the old `state` is not accepted.

### OAC-UC-02: keep the access token fresh

- **Preconditions:** a committed grant.
- **Main flow:**
  1. `refresh()` runs inside `credentials.modifyRecord`.
  2. A caller refreshes only if the stored access token is the one that failed, or is within the
     lead.
  3. The refresh sends `grant_type=refresh_token`, `refresh_token`, `client_id` and `resource`.
  4. The rotated pair and the new `expiresAt` are stored.
- **Alternative and exception flows:**
  - A1: concurrent calls in one process share one refresh.
  - A2: two processes on one store present the refresh token once in total.
  - E1: `invalid_grant` → the tokens are dropped from the record and the record stays.
  - E2: no refresh token → nothing is sent.

### OAC-UC-03: discovery and the client-id setting

- `discoverServer` reads RFC 9728, then RFC 8414. A failure of either read is `OAuthAttemptError`
  code `failed`.
- `clientMetadataUrlProblem` classifies the setting.

## Case derivation

### OAC-EP-01 / OAC-BVA-01: `clientMetadataUrlProblem(value)` (R-OA-21 settings; AUTH-EP-12)

Partitions: absent / non-string / empty → `'missing'`; not a URL, wrong scheme, root path →
`'invalid'`; `https:` with a non-root path → `undefined`. Boundaries sit at the path (`/` vs a
one-character path) and at the empty string.

| Row | Value | Expected |
| --- | --- | --- |
| 1 | `undefined` | `missing` |
| 2 | `null` | `missing` |
| 3 | `42` (non-string) | `missing` |
| 4 | `""` | `missing` |
| 5 | `"fb-adapter"` | `invalid` |
| 6 | `"http://agent.example/fb-adapter.json"` | `invalid` |
| 7 | `"https://agent.example/"` | `invalid` |
| 8 | `"https://agent.example"` | `invalid` (its path is `/`) |
| 9 | `"https://agent.example/?q=1"` | `invalid` (root path with a query) |
| 10 | `"ftp://agent.example/x"` | `invalid` |
| 11 | `" "` (one space, not empty) | `invalid` |
| BVA 1 | `"https://agent.example/a"` (shortest non-root path) | `undefined` |
| BVA 2 | `"https://agent.example/fb-adapter.json"` | `undefined` |

### OAC-EP-02: `discoverServer` (AUTH-DT-11 rule 9 at the library level)

| Row | Connector | Expected |
| --- | --- | --- |
| 1 | the DSH connector's metadata | `resourceMetadata`, `authorizationServerUrl` = `authorization_servers[0]`, `authorizationServerMetadata` (issuer); every read goes through `fetchFn` |
| 2 | a non-DSH OAuth server (other path, issuer and scope) | the same three fields; the library makes no DSH-connector check |
| 3 | PRM answers 404 | `OAuthAttemptError` `failed` |
| 4 | PRM is not JSON | `failed` |
| 5 | unreachable (closed port) | `failed` |
| 6 | AS metadata answers 500 | `failed` |

### OAC-ST-01: one attempt (AUTH-ST-07 at the library level)

States: Pending, Ended(authorized | denied | rejected | expired | failed | aborted).

| Row | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | — | `authorize` | Pending | `notify` with the message and URL; URL parameters as in UC-01 step 3; the callback port accepts connections |
| 2 | Pending | valid callback | Ended(authorized) | one code exchange (the fields of step 6, no secret, S256 verifier); record v1 `{v:1, upstream, clientInformation, discovery, resource, tokens{access_token, refresh_token, token_type, scope, expiresAt = now + 3600 s}}`; the listener is closed |
| 3 | Pending | wrong `state` | Ended(rejected) | no code exchange, no record, listener closed |
| 3b | Pending | wrong `iss` | Ended(rejected) | the same |
| 3c | Pending | no `iss` (the AS advertises it) | Ended(rejected) | the same (RFC 9207 §2.4) |
| 4 | Pending | `access_denied` with the right `iss` | Ended(denied) | no record |
| 4b | Pending | `access_denied` with a wrong `iss` | Ended(rejected) | no record |
| 5 | Pending | `server_error` callback | Ended(failed) | no record |
| 6 | Pending | the token endpoint answers `server_error` at the exchange | Ended(failed) | no record |
| 7 | Pending | the clock reaches TIMEOUT − 1 ms | Pending | no ending yet; the port still accepts |
| 8 | Pending | the clock reaches TIMEOUT | Ended(expired) | no record, listener closed |
| 9 | Pending | `session.signal` aborts | Ended | `begin` → `cancelled`; no record; listener closed |
| 10 | Ended | a redirect for the old `state` | Ended | not accepted: no code exchange |

### OAC-DT-01: `refresh({failedAccessToken})` (R-OA-21 rule 5; design §5.5b "Refresh")

Conditions:
- **F**: the failed token, which is the stored one (`=`), another token (`≠`), or not given (`–`);
- **L**: now ≥ expiresAt − lead;
- **R**: the record has a refresh token;
- **S**: the server's answer.

| Rule | F | L | R | S | Outcome | Requests | Record after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | = | no | yes | ok | `refreshed` | 1 refresh grant (`refresh_token`, `client_id`, `resource`, no secret) | rotated pair, `expiresAt` = now + 3600 s |
| 2 | ≠ | no | yes | — | `declined` | 0 | unchanged |
| 3 | – | yes | yes | ok | `refreshed` | 1 | rotated |
| 4 | – | no | yes | — | `declined` | 0 | unchanged |
| 5 | ≠ | yes | yes | ok | `refreshed` | 1 | rotated |
| 6 | = | — | no | — | `no-refresh-token` | 0 | unchanged |
| 7 | = | — | yes | `invalid_grant` | `invalid-grant` | 1 | the record stays, without `tokens` |

Single flight:
- **SF-1:** five concurrent calls in one process → one refresh grant, and every call gets the same
  result.
- **SF-2:** two processes (two credential providers on one file) both report the stored token as
  failed → one refresh grant in total; the outcomes are one `refreshed` and one `declined`; both
  then read the new token.

### OAC-BVA-02: the lead boundary (LEAD = 300 s)

| Row | now | `refreshDueInMs(grant)` | `refresh()` (no failed token) |
| --- | --- | --- | --- |
| 1 | E − LEAD − 1 ms | 1 | `declined`, 0 requests |
| 2 | E − LEAD | 0 | `refreshed`, 1 request |
| 3 | E − LEAD + 1 ms | −1 (≤ 0) | — |
| 4 | a grant without `tokens` | `undefined` | — |

### OAC-EP-03: the exports, `accessTokenOf` and `dropTokens`

| Row | Input | Expected |
| --- | --- | --- |
| 1 | `OAUTH_CLIENT` | frozen; `callbackPath '/callback'`, `loopbackHost '127.0.0.1'`, `grantVersion 1`, `attemptEnd {denied, rejected, expired, failed}`, the four refresh outcomes |
| 2 | `accessTokenOf(grant with tokens)` | its access token |
| 3 | `accessTokenOf(grant without tokens)` | `undefined` |
| 4 | `dropTokens()` | returns the grant without `tokens`; the stored record is the same and still exists |
| 5 | `OAuthAttemptError` | a class whose instances carry `.code` |
| 6 | `read()` before any commit | `undefined` |

### Leak rule (R-TOK-04, R-SEC-02)

OAC-LEAK-01:
- **Planted values:** the access, refresh and code values the fake issues, the verifier seen at the
  token endpoint, and the connector token.
- **Expected:** none is in the notice, in the logs of the host context, or in any file of the temp
  root except `.credentials.yaml`. `.credentials.yaml` is mode 0600 and never holds the connector
  token.

## Review decisions (Fishball, 2026-11-16): added rows

| Id | Row | Technique | Input | Expected |
| --- | --- | --- | --- | --- |
| OAC-REV-B1 | 1 | EP (malformed request) | raw `GET // HTTP/1.1` on the pending callback | 404; the attempt stays Pending; a later valid callback completes it |
| OAC-REV-B2 | 1–6 | EP / BVA | `isGrantFor(grant, url)`: own grant / other url / `v` missing / `v: 2` / upstream + trailing `/` / no grant | true, false, false, false, false, false |
| OAC-REV-S1 | 1–3 | BVA (lifetime vs LEAD) | `expires_in` 299 / 300 / 301 s | `refreshDueInMs` undefined / undefined / 1000 ms at issue |
| OAC-REV-S1 | 4, 5 | EP | no refresh token; no `expiresAt` | undefined |
| OAC-REV-S1 | 6 | EP | the exchange, then a refresh | `tokens.issuedAt` = `now()` at each |
| OAC-REV-S1 | 7 | BVA | `expires_in` 1e9 s | the plain difference (clamping is the timer owner's, adapter ADP-REV-S1) |
| OAC-REV-S2 | 1–4 | BVA (deadline) | `requestTimeoutMs`; a PRM, refresh or code exchange that never answers | 30000; each fails within [30 s − slack, 30 s + ceiling]; no tokens lost, no record committed |
| OAC-REV-S4 | 1–3 | DT (compare-and-drop) | `dropTokens({failedAccessToken})` with the stored token / another token / after another store's refresh | dropped / unchanged and returned / the new tokens kept |

`dropTokens()` with no argument still drops whatever is stored (the dev session's clarification), and
the OAC-EP-03 row 2–4 case uses that form. The refresh rule is: stored = failed, OR within the lead
(OAC-DT-01 rule 5 expects `refreshed`).

## Review fixes (R-FIX-ADAPTER): added rows

Source: the deep review `review-x-dsh-connector-adapter.md`, findings F1 and F3, and the fix brief
(the new `upstream` option of `createTokenManager`). Rows are in
[review-fix-cases.mjs](review-fix-cases.mjs). "Foreign" means the record under this key was
rewritten with `upstream = https://foreign.example/api/agent/mcp`. "v = 2" means it was rewritten
with another record version.

### OAC-FIX-F1: upstream binding (decision table)

Conditions: the record (own / foreign / v = 2), whether `upstream` is set, the call form, and
whether the stored grant is due.

| Row | Record | `upstream` set | Call | Due | Outcome | Token requests | Record after |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rule 1 | own | yes | `refresh({failed = stored})` | no | `refreshed` | 1 | rotated (control) |
| rule 2 | foreign | yes | `refresh({failed = stored})` | no | `no-refresh-token` | 0 | byte-identical |
| rule 3 | foreign | yes | `refresh()` | yes (E − LEAD) | `no-refresh-token` | 0 | byte-identical |
| rule 4 | v = 2 | yes | `refresh({failed = stored})` | no | `no-refresh-token` | 0 | byte-identical |
| rule 5 | v = 2 | yes | `refresh()` | yes | `no-refresh-token` | 0 | byte-identical |
| rule 6 | foreign | no | `refresh({failed = stored})` | no | `refreshed` (as before: no binding check) | 1 | rotated |
| drop 1 | own | yes | `dropTokens({failed = stored})` | — | — | — | tokens dropped (control) |
| drop 2 | foreign | yes | `dropTokens({failed = stored})` | — | — | — | byte-identical |
| drop 3 | foreign | yes | `dropTokens()` | — | — | — | byte-identical |
| drop 4 | v = 2 | yes | `dropTokens({failed = stored})` | — | — | — | byte-identical |

### OAC-FIX-F3: mixed-token single flight (state transitions, both orderings)

Setup: a grant rotated once, so A is stale and B is stored, with refresh token RB. The calls enter
the record lock together, in the order listed, because the store's `modifyRecord` is gated until all
of them are issued.

| Row | Calls (in order) | Expected |
| --- | --- | --- |
| mixed 1 | `refresh(A)`, `refresh(B)` | A: `declined`, and sees B. B: `refreshed` with a new C. 1 refresh grant; RB presented once; no reuse; the stored grant is C and still has a refresh token |
| mixed 2 | `refresh(B)`, `refresh(A)` | B as in mixed 1; A: `declined` (sees B or C) |
| same 1 | `refresh(B)`, `refresh(B)` | both `refreshed` with the same C; 1 refresh grant |
| timer 1, 2 | `refresh()` (not due) with `refresh(B)`, both orders | B's caller gets a fresh C from exactly 1 refresh grant; RB presented once |
| timer 3, 4 | `refresh()` (due, E − LEAD) with `refresh(B)`, both orders | the same. B's caller may report `refreshed` or `declined` (the timer's flight refreshed first), but it holds C |

## Not covered, and why

- `invalid_grant` at the code exchange: the contract gives no attempt-end code for it (`failed`
  explicitly excludes it), so no row expects one.
- A refresh answered by a server error other than `invalid_grant`: no outcome is specified.
- `refresh()` on a grant whose tokens were dropped: no outcome is specified.
