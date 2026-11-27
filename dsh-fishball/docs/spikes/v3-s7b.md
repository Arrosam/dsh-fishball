# Spike V3-S7b: browser authorization on the connector's own approval listener

- **Date:** 2026-11-12
- **Branch:** `spike/v3-s7b`, from `b7c396c` (`test/v3-cases`)
- **Inputs:** [v3-tasks.md](../planning/v3-tasks.md) S7b row; [v3-requirements.md](../planning/v3-requirements.md) R-OA-01…20, R-REM-03/05, R-ID-02/13, R-NAME-01…08, R-TOK-00/06/08; [v3-design.md](../planning/v3-design.md) §5.5, §5.5a, §11 (V3-S7b gate); spike reports `docs/spikes/v3-s1.md` (`9499ec6`) and `docs/spikes/v3-s7.md` (`8e92b84`); cases [01-auth-pairing.md](../history/test-design/v3/01-auth-pairing.md) and [09-standalone-remote.md](../history/test-design/v3/09-standalone-remote.md).
- **Specification read (2026-11-12):** MCP 2026-07-28 [Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization.md), [Client Registration](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/client-registration.md), [Security Considerations](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization/security-considerations.md); [draft-ietf-oauth-client-id-metadata-document-00](https://www.ietf.org/archive/id/draft-ietf-oauth-client-id-metadata-document-00.txt).
- **Prototype:** [spikes/v3-s7b/](../../spikes/v3-s7b/README.md) (throwaway). Evidence: `spikes/v3-s7b/evidence-{ts,tunnel,clash}-<version>.json`.

## 1. Question

Does the decided browser-OAuth design work with the stock clients, on DSH 0.2.1-rc.5 and 0.2.2-rc.1? The pieces of the design are:
- one issuer, with the metadata and token endpoint on DSH's listener and the approval page on a separate loopback port;
- CIMD client ids, PKCE S256, `iss` in responses, and loopback redirects on any port;
- the token-only page, which pairs an unpaired entry;
- rotating refresh tokens for browser clients;
- plain HTTP on loopback;
- working behind a tunnel;
- the approval-port clash;
- pair-only tokens.

The stock clients are DSH's MCP client (`dsh-mcp-client`, which runs `@modelcontextprotocol/client` 2.2.0) and the Python MCP SDK.

The gate in design §11 has two parts. First, both clients reach `scope: fishball` after one approval, and deny returns `access_denied`. Second, no token value appears in any page, URL or log.

## 2. What I tried

**Hosts.** I used two installed DSH versions, read-only:
- **0.2.1-rc.5**;
- **0.2.2-rc.1**.

Both versions ship `@modelcontextprotocol/client` 2.2.0. Its `dist/index.mjs` is byte-identical between the two (`cmp`), and so is `dsh-mcp-client`'s transport code: `lib/index.js:46` in both. Node was v24.22.2.

**Clients:**
1. **The stock DSH MCP client, `@deepseek-ai/dsh-mcp-client`**, as an ordinary `streamable-http` row in a second disposable DSH (M1).
2. **The DSH SDK's own OAuth client.** This is the stock `@modelcontextprotocol/client` 2.2.0 from each DSH install:
   - `Client` and `StreamableHTTPClientTransport`, with an app-side `OAuthClientProvider` (CIMD URL, loopback `redirectUrl`, in-memory state);
   - its built-in `auth()`, `finishAuth()`, refresh and step-up paths;
   - the stock `ClientCredentialsProvider`.

   I wrote no OAuth logic on the client side. The provider only stores what the SDK hands it.
3. **The Python MCP SDK 2.3.0:**
   - the stock `OAuthClientProvider`, with `client_metadata_url`, a redirect handler and a callback handler;
   - `ClientCredentialsOAuthProvider`.

   It ran in a venv under `.runtime/`, installed with `PIP_CONFIG_FILE=/dev/null`.

**Prototype** ([as-plugin.mjs](../../spikes/v3-s7b/as-plugin.mjs)). It is one DSH plugin, injecting `webServer`, `credentials` and `webStartup`, inserted by a patch row.

- **DSH's listener** gets these `exact` routes:
  - the RFC 9728 and RFC 8414 path-inserted metadata;
  - `/api/fishball/oauth/token`, which handles `client_credentials`, `authorization_code` and `refresh_token`;
  - `/api/fishball/mcp`, which uses `createMcpHandler(..., {legacy: 'reject'})` from the packaged `@modelcontextprotocol/server` 2.2.0, with one handler per principal (S1 F2).
- **The approval listener** is its own `http.createServer` on a configurable loopback port. It serves only `GET /authorize` and `POST /authorize/decision`; every other path gets 404.
- **Token values** live only in `ctx.credentials`. The plugin keeps SHA-256 digests and compares them in constant time.
- **Access tokens, refresh tokens and codes** are opaque, stored by digest, and held in memory only.
- **Revocation** works by entry generation. Disable, delete and a value change each bump it, so re-enabling an entry revives nothing.
- **Host checks** use loopback, the bind address and `webStartup.trustedHosts`. No forwarded header is ever read.
- **CIMD fetch** ([cimd-fetch.mjs](../../spikes/v3-s7b/cimd-fetch.mjs)) has these limits:
  - https only;
  - every resolved address must be public, or the fetch is refused before connecting, and the socket goes to that validated address;
  - redirects are refused;
  - 5 KiB, the draft's §6.6 figure;
  - a 3 s timeout (K);
  - the cache follows `max-age`, and errors are never cached.
- **A control route** stands in for the native settings form. It handles disable, delete, value change, the clock, a simulated restart, rebinding the port and an `iss` fault.

**Simulated world** ([world.mjs](../../spikes/v3-s7b/world.mjs), [fixtures.mjs](../../spikes/v3-s7b/fixtures.mjs)). Everything is on 127.0.0.1, on OS-assigned ports.
- A throwaway CA and certificates, made with openssl.
- A stand-in public client host, `agent.example`, which serves CIMD documents over https. Its name resolves through the plugin's injected resolver to a documentation-range address. The SSRF check still runs on that address.
- **The tunnel** is a local TLS-terminating proxy for `https://fb.example:<port>`.
  - DSH is started with `--trusted-host fb.example`.
  - The proxy path-routes `/authorize*` to the approval listener and everything else to DSH's listener.
  - It injects `X-Forwarded-Proto: http`, `X-Forwarded-Host: evil.example` and `Forwarded: proto=http;host=evil.example` on every request.
- **The clash:** a separate `node` process holds the configured approval port before DSH starts.
- **The browser** ([browser.mjs](../../spikes/v3-s7b/browser.mjs)) is a scripted top-level navigation and a same-origin form POST.

**Disposable DSH.**
- Command: `bin.js --profile web --host 127.0.0.1 --port 0 --no-open`.
- Environment: `HOME=DSH_HOME=TMPDIR=<worktree>/.runtime/s7b-*`, with telemetry off.
- The npm cache was temporary, with an empty user config and an empty global config.
- Every DSH run exited with code 0, and `pgrep` showed nothing left afterwards.
- I did not touch `~/.dsh`, `/Volumes/SSD2/.dsh`, the DSH data under `~/Library/Application Support` (read-only SDK files only), `~/.npmrc`, credentials, SSH or keychains.
- Nothing was pushed.

**Runs.** There are 45 checks per version (22 ts + 15 tunnel + 8 clash), run on both versions: **90/90 pass**. Each run's leak check is run L1 and covers:
- every file of the throwaway home except `.credentials.yaml` (the designed store);
- the probe console;
- Python's output.

Each run planted 63 secrets (ts) or 29 (tunnel). There were 0 hits.

## 3. Result: **PARTIAL**

The server side of the design works as decided on both versions, and the SDK's OAuth client and the Python SDK complete it without changes. The **DSH MCP client itself (`dsh-mcp-client`) does no OAuth at all** (F1). That part of the goal can only be reached with a static `Authorization` header holding a full access token obtained elsewhere. There are two smaller findings: the stock clients race on refresh (F2), and the Python SDK re-authorizes on a 401 instead of refreshing (F3).

### 3.1 Per item and per client

| # | Item | DSH MCP client (`dsh-mcp-client` row) | DSH SDK client (`@modelcontextprotocol/client` 2.2.0) | Python MCP SDK 2.3.0 |
| --- | --- | --- | --- | --- |
| 1 | Discovery | **FAIL**: no discovery (F1) | **PASS** (D1, B1) | **PASS** (Y1) |
| 2 | Authorization code + PKCE S256, CIMD, redirects, `resource`, `iss`, `state` | **FAIL** (F1) | **PASS** (B1, B5, V1, V2, C1) | **PASS** (Y1, Y2, Y3) |
| 3 | The approval page | n/a | **PASS** (B3, P1–P4; the server's page is client-independent) | **PASS** (Y4) |
| 4 | Refresh tokens for browser clients | **FAIL** (F1) | **PASS** server side (B2, B4, C1, R1); **PARTIAL** client side (F2) | **PASS** (Y2); **PARTIAL** (F3) |
| 5 | Plain HTTP on loopback | n/a (no OAuth); a static bearer over http works | **PASS** (B1, H1) | **PASS** (Y1) |
| 6 | Behind a tunnel | not run (no OAuth) | **PASS** (T1–T6) | **PASS** (Y5) |
| 7 | Approval-port clash | n/a | **PASS** (K3–K6, machine exchange) | **PASS** (K3, machine exchange) |
| 8 | Pair-only tokens | n/a | **PASS** (S1, S2) | **PASS** (Y6) |

Every row holds on **both** 0.2.1-rc.5 and 0.2.2-rc.1, and the evidence is identical between them apart from ports.

### 3.2 Detail

**1. Discovery (D1, T1).**
- **Protected resource metadata:** `{resource: <canonical MCP URI>, authorization_servers: [<issuer>], bearer_methods_supported: ["header"], scopes_supported: ["fishball"]}`.
- **AS metadata:**
  - one `issuer`, which is `<origin>/api/fishball/oauth`;
  - `token_endpoint` on DSH's listener;
  - `authorization_endpoint: http://<same loopback hostname>:<approval port>/authorize`;
  - `grant_types_supported: [client_credentials, authorization_code, refresh_token]`;
  - `response_types_supported: [code]`;
  - `code_challenge_methods_supported: [S256]`;
  - `token_endpoint_auth_methods_supported: [client_secret_basic, client_secret_post, none]`;
  - `client_id_metadata_document_supported: true`;
  - `authorization_response_iss_parameter_supported: true`;
  - `scopes_supported: [fishball, fishball:pair]`;
  - no `registration_endpoint`.
- Both SDK clients accepted an issuer whose `authorization_endpoint` is on another origin. Neither compares the two origins.

**2. Code flow (B1, V1, V2, C1, Y1–Y3).**
- **What the stock TS client does:**
  - It sends `client_id = https://agent.example/cimd.json` (the CIMD URL, because `client_id_metadata_document_supported` is true, at `index.mjs:745–753`). It sends no registration request.
  - It sends `code_challenge_method=S256`, `state`, `resource = canonical URI` and `scope=fishball` (taken from the protected resource metadata, `:666`).
  - Its redirect `http://127.0.0.1:<OS port>/cb` is accepted against the registered `:7777/cb`.
  - On the code leg it checks `iss` (`:770–774`) and sends `grant_type, code, code_verifier, redirect_uri, client_id, resource` with auth method `none`.
- **What the server returned:** `scope: fishball`, `expires_in: 3600` and a `refresh_token`. `whoami` showed id `agent-w-1` with no name, and the binding records the client-id URL and the redirect separately.
- **Python** did the same flow. Its exchange form keys were `client_id, code, code_verifier, grant_type, redirect_uri, resource`. It checks `state` (`oauth2.py:433`) and `iss` (`:437`).
- **A wrong `iss`** is refused by both SDKs before any token request: `IssuerMismatchError` in TS, `OAuthFlowError … iss mismatch` in Python. There were 0 code redemptions.
- **Request validation (AUTH-DT-07), all rows as the case table says:**
  - These invalid `client_id` cases get an error on the page and no redirect:
    - an `http:` URL, a URL with no path, or a bare id;
    - a document that is not JSON, or whose `client_id` differs from the URL;
    - a document with no `client_name`;
    - a 404;
    - a document whose `token_endpoint_auth_method` uses a secret.
  - A `redirect_uri` that is not registered also gets an error on the page. That covers a trailing slash, another host, `localhost` vs `127.0.0.1`, an https redirect on another port, and a registered `http://` non-localhost URI.
  - A loopback redirect on another port is accepted; so is an exact https redirect.
  - These are redirected with an error and `iss` (and `state` when sent): `response_type=token` → `unsupported_response_type`; missing or `plain` PKCE → `invalid_request`; missing or foreign `resource` → `invalid_target`.
- **CIMD limits (AUTH-EP-08).** These were all refused:
  - `127.0.0.1` and `[::1]` literals;
  - names resolving to `127.0.0.1`, `10.0.0.7`, `169.254.10.10` or `fd00::1` (refused before connecting: `refusedBeforeConnect` 6);
  - a public name that redirects;
  - a body over 5 KiB;
  - a response slower than the bound.

  With `max-age=60`, the second request was served from cache: the client host saw one fetch.
- **Codes (C1):**
  - These return `invalid_grant`: a wrong verifier, a wrong redirect, a wrong client, and a code at 60 s.
  - A client secret on the code grant gets `invalid_client`.
  - A missing `resource` gets `invalid_target`.
  - A replayed code gets `invalid_grant`. The access token from that code is then 401, and its refresh token `invalid_grant`.

**3. The page (P1–P4, B3, Y4).**
- **Rules 1–4 give byte-identical bodies**, apart from the per-render form nonce: an unknown value, a disabled entry, a deleted entry's old value, and a user-set value under 32 characters. All four say "This token is not valid." and are counted as failures.
- **Other outcomes:**
  - An empty field gets "Enter a token." and is not counted.
  - A token paired to a machine client gets `already-paired`, with the bound name ("Fishball") and last-seen time.
  - Re-entering the bound token on the stock client's next page gets `already-paired`, shown as "ID: agent-w-1".
  - An id with a dot, or of 65 characters, gets `id-invalid`.
  - An id held by another entry, a disabled one included, gets `id-taken`.
  - A name held in another letter case gets `name-taken`, and 65 characters gets `name-invalid`.
  - An id that differs only in case is accepted, and a whitespace-only name binds with no name.
- **Every refusal leaves the request pending**, and the next submit on the same page works.
- **The failure limit is shared:** 3 wrong page entries plus 2 wrong token-endpoint secrets lead to 429 on both the page and the token endpoint, and a *valid* token is not accepted while limited (P2).
- **The value travels only in the POST body:**
  - a GET of the decision path gets 404;
  - a cross-origin `Origin`, `Sec-Fetch-Site: cross-site`, or a forged form nonce gets 403;
  - a replayed form gets the expiry page;
  - the redirect is a `303` and carries no value.
- **Page headers:** `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, and CSP `default-src 'none'; frame-ancestors 'none'`.
- **Host checks:** a foreign Host gets 403 on the approval listener and on DSH's routes.
- **Expiry:** a pending request expires at 600 s, and a simulated restart loses pending requests. Cancel redirects with `error=access_denied`, `state` and `iss`, and binds nothing.

**4. Refresh tokens (B2, B4, R1, C1, Y2).**
- **The server behaves as R-OA-16 says:**
  - every refresh rotates the refresh token;
  - reusing a spent one gets `invalid_grant` and revokes the whole chain, including the live access token;
  - another `client_id` gets `invalid_grant`;
  - a foreign or missing `resource` gets `invalid_target`;
  - disable, re-enable, delete and a value change all kill both access and refresh tokens, and re-enabling revives neither;
  - a restart loses them.
- **Machine exchange** gets no refresh token: its response keys are `access_token, expires_in, scope, token_type`. A `refresh_token` grant with any value gets `invalid_grant`.
- **Both SDKs refresh unaided:**
  - TS sends `client_id, grant_type, refresh_token, resource` on an expired access token's 401.
  - Python sends the same keys before the request, when its own `expires_in` clock runs out.
- **Neither client needs `offline_access`.** They add it only if the AS lists it in `scopes_supported` (TS `index.mjs:667`, Python `get_client_metadata_scopes`). The prototype does not list it, and both received refresh tokens anyway.

**5. Plain HTTP on loopback (B1, H1, Y1).**
- All of the stock TS client's checks above ran against `http://127.0.0.1` for both listeners. `assertSecureTokenEndpoint` (`index.mjs:544`) exempts loopback, and the same call against `http://dsh.example` throws `InsecureTokenEndpointError` (H1).
- Python has no https check on AS endpoints. Only `client_metadata_url` must be https.
- So the Q-SPEC-1 departure is accepted by both, and REM-UC-03 E5 holds.

**6. Behind the tunnel (T1–T6, Y5).** All of this happened with `X-Forwarded-Proto: http`, `X-Forwarded-Host: evil.example` and `Forwarded` injected on every request.
- **Metadata:** under `https://fb.example:<port>`, the issuer, the canonical URI, `token_endpoint` and `authorization_endpoint` are all `https://fb.example:<port>/…` (T1).
- **The same Host over a plain-http socket** is still advertised as `https`. Loopback with `X-Forwarded-Proto: https` stays `http` (T2).
- **A Host not in `--trusted-host`** gets 403 on all four DSH routes, on the approval listener, and through the proxy with SNI `evil.example`. An `Origin: https://evil.example` gets 403 (T3).
- **Machine exchange through the tunnel** with `expectedIssuer: https://fb.example…` works. The tunnel's access token is 401 on loopback, and the reverse (T4).
- **The stock TS browser flow through the tunnel** works: the page is at `https://fb.example:<port>/authorize`, `iss` is `https://fb.example:<port>/api/fishball/oauth`, and the result is `scope: fishball` (T5). Python works the same way (Y5).
- **With only DSH's listener forwarded**, the token endpoint works and the page gets 502 (T6). This is the README case.

**7. Approval-port clash (K3–K6).**
- **Port held by another process:**
  - status `approval-port-in-use`, with exactly one diagnostic;
  - the metadata still lists `authorization_endpoint` on that port, and the holder answers it (the page is unreachable);
  - the stock TS `ClientCredentialsProvider` and Python `ClientCredentialsOAuthProvider` both connect, `pair` and call `whoami`;
  - DSH's own UI answers as usual: its login gate, served by DSH, not by the holder.
- **Port equal to DSH's own web port:** `approval-port-in-use`, and machine exchange and DSH's UI are unaffected.
- **Rebinding:** a change to a free port rebinds, the metadata follows, and other paths get 404. After the holder exits, rebinding the old port works. When the product retries the bind (on the next start or by retrying) stays K.

**8. Pair-only tokens (S1, S2, Y6).**
- **Narrowing:**
  - `scope=fishball` from an unpaired client is narrowed to `scope: fishball:pair`;
  - so is `fishball offline_access`;
  - an id mismatch is also pair-only.
- **What a pair-only token can do:** `tools/list` lists only `pair`. `whoami` gets **403** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="fishball", resource_metadata="…", error_description="not-paired"`, or `"id-mismatch"`. After `pair`, the same access token is full.
- **Step-up:** the stock TS and Python client-credentials providers react to the 403 with **one** step-up token request, scope `fishball fishball:pair` (the union, `index.mjs:5380`). They get pair-only again and surface the 403 (`retry limit 1 reached`; `DEFAULT_MAX_STEP_UP_RETRIES = 1`, `:5241`). So the 403 costs one extra token request and never loops.

### 3.3 Findings

**F1. `dsh-mcp-client` has no OAuth.**
- `createTransport` builds `new StreamableHTTPClientTransport(new URL(config.url), { requestInit: { headers: config.headers } })` with no `authProvider` (`dsh-mcp-client/lib/index.js:46`, identical in both versions).
- Its config schema is `transport, serverName, url, headers, toolCallTimeoutMs, failOnStartupError, maxInstructionBytes, reconnect` (`:792–801`), so it has no OAuth option.
- No `@deepseek-ai` package in either DSH install passes an `authProvider` or implements `redirectToAuthorization`.
- **Observed (M1, both versions):**
  - without a header, the row makes one POST, gets 401, fetches no metadata, sends no token request and registers no tools;
  - with `headers: {Authorization: "Bearer <full access token>"}`, the row works: `server/discover`, `tools/list`, `tools/call` and `subscriptions/listen` all succeed;
  - but the access token then sits in the patch file (`accessTokenStoredInRowConfig: true`), and it dies after 3600 s or on any restart of the connector (TQ-5), with nothing to refresh it.
- **Effect:** "the stock DSH client completes browser authorization" is true of the SDK DSH bundles, not of DSH's MCP client. A DSH user cannot point a plain `dsh-mcp-client` row at another DSH's connector. Fishball's own DSHs are not affected: `fishball-core` uses `ClientCredentialsProvider` directly (R-OA-19). This is **Q-S7B-2**.

**F2. Concurrent refreshes in the stock TS client trip reuse detection (B7).**
- Three concurrent calls after expiry each send a `refresh_token` grant with the same refresh token, because the TS SDK has no single-flight around `auth()`.
- Under R-OA-16 as written, the first rotates and the other two count as reuse. That revokes the chain (`refresh-reuse: 2`). All three calls fail, and so does every later call. The client then has to be authorized again, and since its entry is still bound, that is impossible without a new token (B3).
- The Python SDK serialises its auth flow (`async with self.context.lock`, `oauth2.py:606`) and is not affected.
- **B7b:** with a short idempotent window (a used refresh token presented again within 10 s by the same client for the same resource gets the identical successor response), all three calls succeed, and reuse after the window still revokes. This is **Q-S7B-1**.

**F3. Python re-authorizes on a server-side 401 instead of refreshing (Y2b).**
- When the server drops the access token early but the client's own clock says it is still valid, Python's 401 path runs discovery and a **full authorization**: a new page. It does not refresh first (`oauth2.py:631` onward, with no refresh attempt).
- On our page the bound token is then `already-paired`, so the client is stuck.
- Revocation (disable, delete, value change) makes this right anyway, since a refresh would also fail. But the same happens after a connector **restart**, because access tokens live in memory (TQ-5). Refresh tokens are lost on restart too, so a refresh could not have helped either.
- TS refreshes on a 401 (`index.mjs:797`).
- **Effect on R-OA-16 (5):** "a connector restart means authorizing again" is not reachable for a browser client, because its entry stays bound and re-entering the token is `already-paired`. This is **Q-S7B-3**.

**F4. The approval origin on loopback and behind a tunnel (decided per spec, recorded).**
- On loopback, `authorization_endpoint` uses the hostname the client used (`127.0.0.1`, `localhost`, …) with the approval port. Behind a tunnel it is the same `https://<tunnel host>` with path routing, so a tunnel needs only one public hostname.
- The approval listener rebuilds the issuer from its own `Host`: for a loopback host, that hostname plus DSH's port; for a tunnel host, the host itself. So `iss` matches the issuer the client recorded.
- Design §5.5a's "both listeners need forwarding" is satisfied by the path rule. A tunnel with two hostnames would need a second trusted name and its own mapping, which is not designed (K).

## 4. Decided per spec (rule 1.18)

| Decision | Source |
| --- | --- |
| The authorization response, error responses included, carries `iss`; the metadata says `authorization_response_iss_parameter_supported: true` | MCP Authorization § Authorization Response Validation; RFC 9207 §2, §2.3 |
| An invalid `client_id` or `redirect_uri` is shown on the page, never redirected; other errors redirect with `error`, `iss` and `state` | OAuth 2.1 §4.1.2.1; RFC 9700 §4.11.2 |
| Exact redirect match; loopback `http` redirects may differ in port only; `localhost` and `127.0.0.1` are distinct | OAuth 2.1 §2.3.1, §8.4.2; MCP Security § Open Redirection; CIMD draft §4.5 |
| A CIMD document is refused if it names `client_secret`, `client_secret_expires_at` or a secret-based `token_endpoint_auth_method`; browser clients are public (`none`), and a client secret on the code grant is `invalid_client` | CIMD draft §4.1 |
| CIMD fetch: https only, no private, loopback, link-local or unique-local addresses (checked after resolution), no redirects, a 5 KiB bound, errors not cached, `max-age` respected | CIMD draft §3, §4.4, §6.5, §6.6; MCP Security § Authorization Server Abuse Protection |
| The client-id URL must survive WHATWG parsing unchanged (no dot segments, fragment or userinfo), and `client_id` in the document must equal it by simple string comparison | CIMD draft §3, §4.1 |
| The redirect after the POST form is `303`, never `307` | RFC 9700 §4.12 |
| `offline_access` is **not** listed in `scopes_supported` and not required; refresh tokens are issued to browser clients anyway | MCP Authorization § Refresh Tokens (server SHOULD NOT advertise `offline_access`; AS discretion); confirmed: neither SDK needs it |
| The refresh grant needs the same `client_id`; `resource` is required on it (TQ-3 A extended) | OAuth 2.1 §4.3.1; MCP Authorization § Resource Parameter Implementation ("both authorization requests and token requests") |
| Pair-only 403 carries `scope="fishball"` and `resource_metadata` (the full scope needed), never `fishball:pair` | MCP Authorization § Runtime Insufficient Scope Errors |
| The page ignores the request's `scope`; a requested `offline_access` or unknown scope is ignored, and the token response states the granted scope | RFC 6749 §3.3; OAuth 2.1 §1.4.1 |

## 5. Effect on the design and the provisional cases

| Case | After S7b |
| --- | --- |
| **AUTH-UC-10** | **Drop P:S7b** for the server flow: main flow 1–7, A1, A2, A4, A5, E1, E2, E2a, E3, E4, E5 and the postconditions are observed with the SDK client and Python (A3 is the same as the main flow by construction). One amendment comes from F2/F3: step 7 ("an hour later … refresh") holds for one in-flight request, and Q-S7B-1 decides concurrency. The "stock DSH client" wording must become "the DSH SDK client"; see Q-S7B-2. |
| **AUTH-DT-07** | **Drop P:S7b.** Every rule observed, both SDK versions (V1). |
| **AUTH-DT-09** | **Drop P:S7b (rules 3–4)**: rule 3 and rule 6 are observed; rule 4 is observed with a rebind, and its timing stays K. Rules 2 and 5 are also observed. |
| **REM-UC-03** | **Drop P:S7b (E5).** Both SDK clients accept plain-http loopback (B1, H1, Y1). |
| AUTH-ST-04, AUTH-ST-05, AUTH-DT-08, AUTH-EP-08, AUTH-EP-09, AUTH-EP-10, AUTH-BVA-07 (not flagged) | Observed as written (C1, R1, P1–P4, V2, T1–T6), except AUTH-ST-05 row 8, which depends on Q-S7B-3. |

Implementation note, not a decision: a code redemption with a wrong verifier or redirect leaves the code unconsumed in the prototype. Its 60 s lifetime bounds it. AUTH-ST-04 row 9 leaves this to K.

Design text to change once the questions are answered:
- **§5.5 table:** the AS-metadata row already matches; add `refresh_token` to `grant_types_supported`, as R-OA-02 says and the design row omits.
- **§5.5 token endpoint** steps 2–5: three grants, a public client for `authorization_code` and `refresh_token`, and `resource` required on both.
- **§5.5a:** the approval origin rule of F4; the 303; CSP and `Referrer-Policy` on the page.
- **R-OA-16 (5) and AUTH-ST-05 row 8:** per Q-S7B-3.

I did not change the design or the cases in this spike.

## 6. Questions

### Q-S7B-1. Refresh races in the stock TS client

**Background.** R-OA-16 (2) says a reused refresh token revokes the whole chain. The stock `@modelcontextprotocol/client` 2.2.0 has no single-flight around `auth()`. When an agent has several MCP calls in flight as its access token expires, each one refreshes with the same refresh token. The first rotates, and the rest are reuse, so the chain is revoked (B7, both versions). That is a normal hourly event for a busy agent. Its entry stays bound, so recovery needs a new token from the owner. OAuth 2.1 §4.3.1 requires rotation *or* sender-constraint for public clients, and leaves the reuse response to the AS. MCP Security § Token Theft requires rotation. Neither text forbids a grace window.

**Options:**
- **A.** Keep R-OA-16 as written. Busy TS clients lose their pairing about once an hour.
- **B.** An idempotent grace window: a spent refresh token presented again within N seconds (K, for example 10 s), by the same `client_id` for the same `resource`, gets the **same** successor response. After the window, reuse revokes the chain as now. This is tested in B7b.
- **C.** Rotate only when the current access token has expired or is nearly expired. That does not fix the race.

**Recommendation: B.** It keeps reuse detection for theft, which happens outside the window, and makes the stock client work. The successor is held in memory for N seconds only.

### Q-S7B-2. The DSH MCP client (`dsh-mcp-client`) cannot authorize at all

**Background.** The S7b goal and AUTH-UC-10 name "the stock DSH client". DSH 0.2.1-rc.5 and 0.2.2-rc.1's `dsh-mcp-client` builds its transport with static `headers` only, with no `authProvider` and no OAuth setting (F1). The OAuth-capable client is the SDK it bundles, which a host or plugin must wire up. A static `Authorization: Bearer <access token>` header works, but it expires in 3600 s and is lost on a connector restart, with no refresh.

**Options:**
- **A.** Accept it, and reword: browser authorization is for OAuth-capable MCP clients (the SDK, Python, hosted connectors). A DSH that wants to use another DSH's connector runs Fishball-style machine exchange: a token entry plus `fishball-core`, or a small plugin using `ClientCredentialsProvider`. Document that a plain `dsh-mcp-client` row is not supported.
- **B.** Document the static-header workaround for `dsh-mcp-client`. R-OA-10 allows it, because the header holds a real access token. But it puts a bearer in the row config, and it breaks every hour and on every connector restart.
- **C.** Ask DSH upstream for OAuth in `dsh-mcp-client` (an `authProvider` with CIMD and a browser redirect, or client credentials from `ctx.credentials`), and keep the case provisional until then.

**Recommendation: A**, with C filed as a wish (I did not open any upstream issue). Cases: change AUTH-UC-10's actor wording; REM-UC-03 E5 is unaffected.

### Q-S7B-3. A browser client after a connector restart

**Background.** TQ-5 (A) and R-OA-16 (5) keep access and refresh tokens in memory, so a restart loses them, and "the browser client must be authorized again". The client does start a new authorization, both SDKs (B3, Y2b). But its entry is still bound, and re-entering the token is `already-paired` (R-OA-12, 1.9). So after every DSH or connector restart, every browser agent needs a **new token entry from the owner**, and the old entry stays bound with nothing using it.

**Options:**
- **A.** Persist refresh tokens: digests only, in the connector's storage, with the chain id and entry generation. Access tokens stay in memory, and after a restart the client refreshes. This needs the K decision R-OA-16 (5) already reserves, and a maximum chain lifetime (K).
- **B.** Let the same browser client re-pair its own bound entry. When the entered token is bound to a browser pair whose recorded client-id URL equals this request's `client_id`, and whose id equals the typed id, the page re-issues a code instead of `already-paired`. This changes 1.9 ("re-entering a bound token stays `already-paired`"), so it is the user's call.
- **C.** Keep it as written, and document that a restart costs every browser agent a new token.

**Recommendation: A.** It changes no pairing rule and keeps the page strict. Python's 401 path (F3) still re-authorizes rather than refreshing when its own clock says the access token is valid. With A, the TS client recovers after a restart, and Python recovers once its access token's local expiry passes, which is at most 3600 s. Persisting access-token digests as well would close that gap too. That is a K detail.
