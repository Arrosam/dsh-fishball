# `dsh-connector-adapter`: Use Cases and case derivation

Black-box cases for task C-MCP-ADAPTER. The sources, read through the renames of requirements 1.41
and design §1.0c (`/api/fishball/*` → `/api/agent/*`, scope `fishball` → `agent`,
`fishball_connector_sign_in` → `dsh_connector_sign_in`), are:

- R-OA-21 (rules 1–11), R-OA-11…16, R-TOK-01, R-TOK-04 and R-SEC-02;
- requirements §1.25 and §1.25a;
- design §5.5a and §5.5b;
- spike S7c §4 and §5;
- the case rows in docs/test-design/v3/01-auth-pairing.md, section "Connector adapter";
- the K values and decisions the dev session froze (S7c plan step K1, relayed in the test brief).

The expected values come from these sources and from nothing else. The real connector's published
values (`packages/dsh-connector/mcp-schema`) give the paths and the scope.

## World

- **N** is an in-process cordis `Context` of the SDK under test (0.2.1-rc.5 and 0.2.2-rc.1). It runs:
  - the real `dsh-credentials-local` (a temp dir, `.credentials.yaml` mode 0600);
  - `dsh-authorization`, `dsh-system-prompt` and `dsh-tools`;
  - the adapter, from `createAdapterPlugin({now, timers, fetch})`. A fake clock drives `now` and
    `timers`. `fetch` records every request and is the only route to other hosts.
- A restart of N disposes the context and builds a new one on the same credentials file.
- **C** is a fake DSH connector on 127.0.0.1 ([fakes.mjs](../../dsh-connector-adapter/oauth-client/fakes.mjs)):
  - it serves PRM, AS metadata, an approval listener on its own port, the token endpoint with
    rotation and reuse detection, and an MCP 2026-07-28 endpoint;
  - it can restart (access tokens lost, refresh tokens kept), drop access tokens early, and disable
    the entry (→ `invalid_grant`);
  - it records every request.
- `U = http://127.0.0.1:<C>/api/agent/mcp` and the configured server is `{serverName: "m", url: U}`.
  `CIMD = https://agent.example/fb-adapter.json`.
- **X** is the non-DSH OAuth MCP server at `https://other.example/mcp`. It exists only behind the
  injected `fetch` and records every request.
- **The owner's browser** is a script: it opens the approval URL, posts the page's form (connector
  token, id `dsh-n`, no name, Authorize or Cancel) and follows the 303 to the adapter's loopback
  callback.
- **The child row** is observed through cordis' public registry: the fibers of the stock
  `dsh-mcp-client` plugin and their config (`transport`, `serverName`, `url`, `headers`). This is
  also how the tests learn the proxy URL and the local bearer.
- A tool call is the registered definition's `execute(args, {signal})`. The **transcript** of a
  sign-in is its result value plus what `output.render` makes of it (no DSH session is booted).

K values used:

| Name | Value |
| --- | --- |
| LEAD | 300 s |
| TIMEOUT | 600 s |
| body cap | 8 388 608 bytes |
| minimum refresh delay | 1 s |
| local bearer | 32 random bytes, base64url (43 characters) |
| END | `needs-authorization` |
| unknown server | `unknown-server` |

## Use Cases (from AUTH-UC-12/13/14)

### AUTH-UC-12: N signs in to a DSH connector through the adapter and stays connected

- **Actors:** the owner, and the agent of a session in N.
- **Main flow** (one test per step that has its own observable):
  1. `m` is `needs-authorization`. No child row is mounted and no `mcp__m__…` tool exists.
  2. The agent calls `dsh_connector_sign_in({server: "m"})`. The adapter reads the PRM, then the AS
     metadata, and the check passes.
  3. The tool returns `approval-url` at once, and `m` is `authorizing`.
     - The URL is on C's approval listener, with `client_id = CIMD`,
       `redirect_uri = http://127.0.0.1:<port>/callback`, `code_challenge_method = S256`, `state`,
       `scope = agent` and `resource = U`.
     - The message tells the owner to open the URL in a browser and enter a token from the
       connector's settings.
     - No registration request was sent.
  4. and 5. The owner approves. The callback carries `code`, `state` and `iss`. The exchange sends
     `code_verifier`, `redirect_uri`, `client_id` and `resource`, with no client secret. The grant is
     committed under `dsh-connector-adapter/server-6d`.
  6. `m` is `authorized`. A stock child row is mounted (`streamable-http`, serverName `m`, pointed
     at the proxy). `mcp__m__pair` and `mcp__m__whoami` exist, and `whoami` shows the id `dsh-n`.
  7. A tool call and a `subscriptions/listen` stream go through the proxy, which sends
     `Authorization: Bearer <access token>` upstream.
  8. Across three 3600 s lifetimes (fake clock) there is one refresh per lifetime, LEAD before
     expiry. The child row is never restarted (same fiber, no second `server/discover`) and keeps
     working.
  9. A later sign-in returns `authorized` and changes nothing.
- **Alternative flows:**
  - A1: C restarts. The next call gets 401, the proxy refreshes once, retries once, and the call
    succeeds.
  - A2: N restarts. `m` is `authorized` again from the stored grant, with no discovery, token or
    authorization request at start, and the child row is mounted again.
  - A3: C drops the access token early. One refresh and one retry, and the call succeeds.
  - A4: eight concurrent calls on a dropped token all succeed, with exactly one refresh grant and
    no reuse at C.
  - A5: two N contexts on one credentials file both reach E − LEAD. There is one refresh grant in
    total, and both proxies then send the new token.
- **Exception flows:**
  - E1: the entry is disabled, so the refresh gets `invalid_grant`. The result is
    `needs-authorization`, one warning, the tokens dropped (the record stays) and the child row
    disposed. No further refresh follows, even hours later.
  - E2: Cancel, then `access_denied` with `iss`. The state is END and no child row is mounted.
  - E3: a wrong `state`, or a wrong `iss`, on the callback. The code is not exchanged, no grant is
    committed, and the attempt ends (K: Ended(rejected), END).
  - E4: two 401s. The call fails, the state is `needs-authorization`, and there is no third upstream
    request and no second refresh.
  - E5: the adapter is disabled (its fiber disposed). The child row and its tools are gone, and no
    refresh follows.
- **Postconditions** (AUTH-EP-13):
  - every token request carries only standard fields and no client secret;
  - no request carries a non-standard header;
  - no request was a registration;
  - no planted secret appears outside `.credentials.yaml`.

### AUTH-UC-13: the adapter is installed without its client-id setting

1. `m` is `needs-configuration` (reason `client-metadata-url-missing`). There is no child row and no
   tool.
2. A sign-in returns `needs-configuration`, the same reason, and no URL.
3. The owner saves `clientMetadataUrl = CIMD` (the fiber's config is updated). `m` becomes
   `needs-authorization`, and the next sign-in proceeds.

- A1: the value is not an https URL with a non-root path → reason `client-metadata-url-invalid`.
- E1: an invalid value is saved after a valid one, with no grant → `needs-configuration` again.
- Postcondition: until step 3, C received no request at all, and the CIMD value is the only
  `client_id` ever used.

### AUTH-UC-14: a configured server that is not a DSH connector is refused

1. `x` (`https://other.example/mcp`) has PRM `authorization_servers: [https://other.example/oauth]`
   and `scopes_supported: ["read"]`.
2. A sign-in returns `needs-configuration` (reason `not-a-dsh-connector`), and `x` is
   `needs-configuration`.

- A1: only one of the three checks fails (AUTH-DT-11 rules 2–8) → the same result.
- E1: a second call → the same result, still with no authorization, registration or token request.
- Postconditions: no URL was returned, no grant record exists for `x`, and no child row is mounted.

## Case derivation

### AUTH-EP-12: `clientMetadataUrl` (equivalence partitions)

| Row | Class | Value | State | Sign-in |
| --- | --- | --- | --- | --- |
| 1 | absent | — | `needs-configuration`, `client-metadata-url-missing` | `needs-configuration`; no request |
| 2 | empty | `""` | `needs-configuration`, `missing` | as 1 |
| 3 | not a URL | `fb-adapter` | `needs-configuration`, `client-metadata-url-invalid` | as 1, with reason invalid |
| 4 | `http:` | `http://agent.example/fb-adapter.json` | invalid | as 3 |
| 5 | root path | `https://agent.example/` | invalid | as 3 |
| 6 | no path | `https://agent.example` | invalid | as 3 |
| 7 | valid | CIMD | `needs-authorization` | `approval-url` whose `client_id` is exactly CIMD |
| 8 | valid, then removed | CIMD → absent | `needs-configuration` again | as 1 |
| 8b (K) | a stored grant, then an invalid setting, then valid again | — | `needs-configuration`; no child row, no refresh at E − LEAD, no request; the record is byte-identical; when the setting is valid again, `authorized` with no browser step | — |

### AUTH-EP-13: the leak check

- **Planted values:** the connector token, every access, refresh and code value (C marks them),
  the PKCE verifier C sees, and the local bearer.
- **Places checked:**
  - Row 1: the adapter's config (the config object of its fiber and of the child fiber, except the
    bearer header itself, which is a per-start value never on disk).
  - Row 2: the captured logger output and the console.
  - Row 3: every sign-in result; the URL carries only `response_type`, `client_id`, `redirect_uri`,
    `state`, `code_challenge`, `code_challenge_method`, `scope` and `resource`.
  - Row 4: the transcript (the result value plus `output.render`).
  - Row 5: every other file under the temp root and the temp HOME.
  - Row 6: `.credentials.yaml` is mode 0600, holds the grant (access and refresh tokens), and never
    holds the connector token or the bearer.
  - Row 7: upstream requests carry the access token only in `Authorization`, never in a URL, and
    never the bearer.
  - Row 8: `status()`.

### AUTH-EP-14: requests to the proxy (one test per row)

| Row | Request | Expected |
| --- | --- | --- |
| 1 | correct bearer | forwarded with the access token; the response body comes back |
| 2 | no `Authorization` | refused with 4xx; nothing forwarded |
| 3 | a wrong bearer of the same length | refused; nothing forwarded |
| 4 | a wrong bearer of another length | refused; nothing forwarded |
| 5 | the bearer from before a restart | refused |
| 6 | the child's own `Authorization` | never forwarded |
| 7 | the listed hop-by-hop headers (`keep-alive`, `upgrade`, `te`, `trailer`, `proxy-authorization`; `connection: keep-alive`; `transfer-encoding` by sending a chunked body) | none forwarded; the chunked body arrives whole; the end-to-end `mcp-protocol-version` arrives |
| 7b | a custom header that the `Connection` header names | not forwarded: RFC 9110 §7.6.1 makes every header named in `Connection` hop-by-hop. This row is derived from the spec, beyond the list in row 7 |
| 8 | the listening address | the child URL's host is `127.0.0.1`; the socket listens on `127.0.0.1` only (read with `lsof`; no non-loopback connection is attempted, by the test rules) |
| 9 | `subscriptions/listen` | the acknowledgement arrives, the stream stays open, and a later event arrives through it |
| 10 | body of exactly 8 388 608 bytes, and one byte more | the first is forwarded; the second is refused with 4xx and nothing is forwarded |

### AUTH-BVA-09: timing (fake clock; t0 = the code exchange, E = t0 + 3600 s)

| Row | Input | Expected |
| --- | --- | --- |
| 1 | E − LEAD − 1 ms | no refresh grant |
| 2 | E − LEAD | exactly one refresh grant |
| 3 | E − LEAD + 1 ms after row 2 | no second grant |
| 4 | one 401 | one refresh, one retry; the call succeeds |
| 5 | two 401s | the call fails; `needs-authorization`; two upstream requests and one refresh |
| 6 | pending at TIMEOUT − 1 ms | a sign-in returns the same URL |
| 7 | pending at TIMEOUT | END; a sign-in returns a new URL |
| 8 | the frozen TIMEOUT | 600 s ≤ 600 s; the attempt is still pending 1 ms before 600 s and ends at 600 s (rows 6–7) |
| 9 (K) | start with a stored grant already within LEAD | no refresh at start + 999 ms; one refresh at start + 1000 ms (minimum delay) |
| 10 (K) | start with a stored grant before E − LEAD | no request at start |

### AUTH-DT-11: the DSH-connector check (the setting is valid in every rule; O = C's origin)

| Rule | Path of `url` | PRM `resource` | `authorization_servers[0]` | `scopes_supported` | Expected | Requests after the reads |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `/api/agent/mcp` | `url` | O + `/api/agent/oauth` | has `agent` | `approval-url` | none to the token or registration endpoints, and none to `/authorize` |
| 2 | ″ | O + `/api/agent/other` | ″ | ″ | `needs-configuration` / `not-a-dsh-connector` | none |
| 3 | ″ | `url` | `https://other.example/api/agent/oauth` | ″ | ″ | none, on either host |
| 4 | ″ | ″ | O + `/api/agent/other-oauth` | ″ | ″ | none |
| 5 | ″ | ″ | O + `/api/agent/oauth` | `["read"]` | ″ | none |
| 6 | ″ | ″ | ″ | absent | ″ | none |
| 7 | `/mcp` | ″ | ″ | has `agent` | ″ | none |
| 8 | `/api/agent/mcp` | ″ | [`https://other.example/oauth`, O + `/api/agent/oauth`] | ″ | ″ | none |
| 9a | unreachable (a closed port) | — | — | — | `failed` / `discovery-failed` | none |
| 9b | PRM answers 500 | — | — | — | ″ | none |
| 9c | PRM is not JSON | — | — | — | ″ | none |

The check runs at sign-in, every time a sign-in is made without live tokens (K). A start sends no
discovery request (ST-06 row 3).

### AUTH-DT-12: the sign-in tool

| Rule | Conditions | Result | Side effect |
| --- | --- | --- | --- |
| 1 | the setting is missing | `needs-configuration` (`client-metadata-url-missing`) | no request |
| 2 | X, not a DSH connector | `needs-configuration` (`not-a-dsh-connector`) | no token, registration or authorization request |
| 3 | live tokens | `authorized` | no request, no new attempt |
| 4 | no tokens, nothing pending | `approval-url` with a new URL; state `authorizing` | one attempt |
| 5 | pending | the same URL, byte-identical | no second attempt (no second callback listener) |
| 6a | the last attempt was cancelled | a new URL, with a new `state` | the old URL stays dead |
| 6b | the tokens were dropped by `invalid_grant` | a new URL | — |
| 7 | any | returns before any approval | — |
| 8 | unknown `server` | `{status: "unknown-server", server}` | no request; nothing changes |

### AUTH-ST-06: the server state (one test per row)

| Row | Transition |
| --- | --- |
| 1 | start, setting missing → `needs-configuration`; no child row; no request |
| 1b (K) | start, setting invalid, a stored grant → `needs-configuration`; no child row; no request |
| 2 | `needs-configuration`, a valid setting saved → `needs-authorization`; no request |
| 3 | start, valid, no grant → `needs-authorization`; no child row; no request |
| 4 | start, valid, a stored grant → `authorized`; child row mounted; no browser and no token request |
| 5 | `needs-authorization`, the check fails at sign-in → `needs-configuration` |
| 6 | the check passes → `authorizing`; `approval-url` |
| 7 | `authorizing`, sign-in → `authorizing`; the same URL |
| 8 | a valid callback → `authorized`; one exchange; the grant committed; child row mounted |
| 9 | a wrong `state` or `iss` → END (K: Ended(rejected)); no exchange, no grant |
| 10 | `access_denied` → END; no child row |
| 11 | TIMEOUT → END; the URL is dead (its callback port refuses) |
| 12a | `server_error` at the exchange → `failed` / `authorization-failed` |
| 12b | `server_error` on the callback → `failed` / `authorization-failed` |
| 13 | LEAD → still `authorized`; one refresh; no child restart |
| 14 | 401 after a C restart → still `authorized`; one refresh and one retry |
| 15 | `invalid_grant` → `needs-authorization`; tokens dropped; one warning; no loop |
| 16 | two 401s → `needs-authorization`; no third request |
| 17 | the grant record is deleted → `needs-authorization`; child row disposed |
| 18 | sign-in while authorized → `authorized`; nothing changes |
| 19 | the adapter is disposed → no refresh, no child row, no file written except the credentials file |

### AUTH-ST-07: one attempt and its URL

| Row | Transition |
| --- | --- |
| 1 | sign-in → Pending(u1); the callback port is fresh and accepts connections |
| 2 | again → u1, byte-identical; the set of listening sockets is unchanged (`lsof`) |
| 3 | a valid callback → Ended(authorized); a later redirect for u1 is not accepted |
| 3a | a wrong `state` → Ended(rejected) (K); no exchange |
| 4 | `access_denied` → Ended(denied); a later redirect is not accepted |
| 5 | TIMEOUT → Ended(expired); a later redirect is not accepted |
| 6 | the adapter restarts while pending → Ended; the callback refuses; a new sign-in gives u2 ≠ u1 |
| 7 | (in rows 3–5) a redirect for the ended u1 → no exchange, no grant |
| 8 | Ended(denied or expired), then a sign-in → u2 ≠ u1, with a new `state` and a new `code_challenge` |
| 9 | Ended(authorized), then a sign-in → `authorized`; no URL |

### ADP-EP-01 / ADP-BVA-01: config and keys (derived from the relayed contract)

| Row | Input | Expected |
| --- | --- | --- |
| EP 1 | `servers` omitted | `status().servers` is `[]` |
| EP 2 | two entries with the same `serverName` | the plugin refuses to start (its fiber's `await` rejects) |
| EP 3 | the grant of `m` | stored under `dsh-connector-adapter/server-6d`, kind `grant`, payload `v: 1`, with `upstream`, `clientInformation`, `discovery`, `resource` and `tokens` (`access_token`, `refresh_token`, `token_type`, `scope`, `expiresAt = t0 + 3600 s`) |
| BVA 1 | a `serverName` of 32 characters | accepted; key `server-<64 hex>` |
| BVA 2 | a `serverName` of 33 characters | refused (pattern `^[A-Za-z0-9_-]{1,32}$`) |
| EP 4 | the sign-in tool | registered globally, as `dsh_connector_sign_in`, with `server` required |

## Review decisions (Fishball, 2026-11-16): added rows

| Id | Row | Technique | Input | Expected |
| --- | --- | --- | --- | --- |
| ADP-REV-B1 | 1 | EP (malformed request) | raw `GET // HTTP/1.1` on the pending attempt's callback | 404; still `authorizing`; a later valid callback leads to `authorized` |
| ADP-REV-B2 | 1–3 | DT (does the grant count?) | the stored grant has another `upstream` (same name, a new URL) / `v` missing / `v: 2` | `needs-authorization`; no child, no request to either URL up to E; record byte-identical; the next sign-in overwrites it (`v: 1`, `upstream` = the configured url) |
| ADP-REV-S1 | 1–3 | BVA (lifetime vs LEAD) | `expires_in` 299 / 300 / 301 s | no timer and a refresh only on a 401 (one refresh, one retry) / the same / one refresh 1 s after issue, none before |
| ADP-REV-S1 | 4 | BVA (timer bound) | `expires_in` 1e9 s | every pending timer ≤ 2^31 − 1 ms; no refresh over 2^31 − 2 ms; no tight loop (fewer than 200 timer callbacks) |
| ADP-REV-S3 | 1 | EP | the attempt is cancelled at once (begin wrapped through the public `ctx.authorization` object) | `{status: "needs-authorization", server}` |
| ADP-REV-S4 | 1 | ST (race) | N sees a 401; while N refreshes, N2 (same store) refreshes first; N's retry with the old token gets a second 401 | N2's new token stays stored and keeps working |
| ADP-REV-S8 | EP ok ×4, refused ×3 | EP | `servers[].url`: https; http on 127.0.0.1, localhost, [::1] / http on a public host, ftp, not a URL | starts / `apply` rejects with `.code` `insecure-server-url` |
| ADP-EP-01 | 2 (amended) | EP | duplicate `serverName` | refused with `.code` `duplicate-server` |

S6 (remount after the stock row gave up reconnecting) is not covered. The row is optional, and the
stock row gives up only after ten failed reconnects, whose timers run on the real clock (500 ms
doubling up to 30 s), so it is impractical in-process.

## Not covered, and why

- AUTH-UC-12 against the S7b connector prototype: it needs a booted DSH (`spikes/v3-s7b`
  launches DSH processes) and installed spike dependencies. The test rules forbid spawning a DSH,
  so the fake connector stands in.
- The real approval page in a browser (E2E-AUTH) and the real connector with persisted refresh
  digests (X-REMOTE): owned by other tasks.
- EP-14 row 8 on a non-loopback interface: the rules allow network on 127.0.0.1 only. The bound
  address is read from `lsof` instead.
- "Reported once" for END (ST-06 row 10): only the `invalid_grant` and second-401 transitions have a
  specified report (one warning).
