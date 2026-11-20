# C-PAGE-ID: the page id, reconnect and no chain cap: Use Cases and test design

Requirements 1.32 R13 / R14, 1.33 Q-A1 B, Q-A2 A, Q-A3 B; R-OA-11, R-OA-12, R-OA-16, R-OA-22,
R-OA-23, R-ID-01…13; design §5.5a, §5.8 (`9a531192`); K1d-4, K1d-5 in
`packages/dsh-connector/mcp-schema/README.md`; K1 `PairStore.bindFromPage` / `reconnectFromPage`,
`OAuthTokenStore` (no `chainsOf`), `RefreshRecord` (no `chainStartedAt`), `AUTHORIZE_EXTENSION`,
`DERIVED_AGENT_ID`.

Derived from the requirements only (black box). Case ids stay the AUTH-* ids of
`docs/test-design/v3/01-auth-pairing.md` where the meaning is the same; a row whose meaning changed
says so; superseded rows are marked **withdrawn**. New ids continue the AUTH numbering
(AUTH-UC-15…19, AUTH-EP-15, AUTH-BVA-10, AUTH-BVA-11, AUTH-ST-08).

Fixture: entry E5 (value `v(E5)`), client `https://agent.example/cimd.json` ("Agent W", redirect
`http://127.0.0.1:7777/cb`), another client `https://other.example/cimd.json` ("Agent V").
`cid(U)` = `cid-` + the first 16 characters of the lowercase, unpadded RFC 4648 base32 of
SHA-256(UTF-8 `U` as received), computed by the test from K1 `DERIVED_AGENT_ID`.

Clarification relayed by the dev session (a reading of the requirements, 2026-11-16): R-OA-22
(1.33 Q-A2 A) supersedes the older "re-entering a bound token stays already-paired" sentences of
R-OA-12 (end), R-OA-16 (3)/(6) and AUTH-ST-05 row 7; so after disable → re-enable, the same token
with the same id reconnects (the old refresh and access tokens stay revoked). A reconnect of an
entry bound by machine `pair` records the page client's client id URL, so that entry is page-bound
from then on and refuses `client_credentials` (one token, one client type; the newest wins).

## Use Cases

### AUTH-UC-10 (rewritten) — Someone authorizes a browser agent that passes its id
- **Actor:** whoever holds a token; a Fishball-like browser client that adds `agent_id=agent-w-1`
  to its authorization request.
- **Preconditions:** E5 enabled and unpaired; no entry holds `agent-w-1`; the approval listener is open.
- **Main flow:**
  1. The client opens `/authorize` with its CIMD `client_id`, redirect, S256 challenge, `state`,
     `resource` and `agent_id=agent-w-1`.
  2. The page shows the client (unverified), redirect host, client-id host, this DSH, "full manager
     rights", "one token, one agent", a masked **token** field, an optional **name** field,
     Authorize and Cancel. There is **no id field** (R-OA-11 as amended by 1.32 R13).
  3. The user enters `v(E5)`, leaves the name empty, presses Authorize.
  4. In one step E5 is bound to `agent-w-1` with full rights, client id URL and redirect recorded,
     no name, `pairedAt` set; 303 to the redirect with `code`, `state`, `iss`.
  5. The code redeems to `scope: "agent"` (`SCOPE.full`), 3600 s and a refresh token, with no
     `pair` call; the access token is the pair's (`clientId` = `agent-w-1`).
- **Alternative flows:** A4 a free name typed → named; A9 the token page reached through the
  user's tunnel (`https://fb.example`, Q-A3 B) binds the same way.
- **Exception flows:** E2a `agent_id` invalid (dot, 65 characters, a space) → the page is still
  shown at `/authorize`; Authorize with a valid unpaired token shows `id-invalid`, binds nothing,
  the request stays pending (another token or Cancel still work). E2b `agent_id` held by another
  entry (machine, browser, disabled) → `id-taken`. E2c a held name → `name-taken`; an invalid one →
  `name-invalid`. E2d `agent_id` repeated in the request → redirect `invalid_request` with `iss`
  and `state` (R-OA-14, RFC 6749 §3.1). E2e an `id` (or `agent_id`) field posted in the form
  anyway is ignored: the id comes from the authorization request only.
- **Postconditions:** E5 is page-bound (`clientIdUrl`, `redirectUri` present); `v(E5)` appears in
  no URL, redirect, code, page, response or log.

### AUTH-UC-15 — A generic client that passes no id gets the derived id
- **Actor:** a generic MCP browser client (no `agent_id`).
- **Preconditions:** E5 enabled, unpaired; no entry holds `cid(U)`.
- **Main flow:** `/authorize` without `agent_id` → page → Authorize with `v(E5)` → E5 bound to
  `cid(U)` with full rights at once (Q-A1 B); the code redeems to `SCOPE.full`.
- **Alternative flows:** A1 `agent_id=` (no value) is the same as no parameter (RFC 6749 §3.1) →
  `cid(U)`. A2 two clients with different client id URLs derive different ids.
- **Exception flows:** E1 another entry already holds `cid(U)` → `id-taken` on the page; nothing bound.
- **Postconditions:** the pair's id is exactly `cid(U)`: 20 characters, within R-ID-02.

### AUTH-UC-16 — A bound client reconnects with its token and id
- **Actor:** the client bound in AUTH-UC-10 or AUTH-UC-15, at any later time.
- **Preconditions:** E5 bound to id X (on the page, or by a machine client's `pair` with X).
- **Main flow:** the client opens `/authorize` again passing the same X (or, unbound to an
  `agent_id`, from the same client id URL so that `cid(U)` = X) → Authorize with `v(E5)` → 303 with
  a new code → it redeems to a **new chain** for the **same** principal: same principal key, id,
  name and `pairedAt` (so its managed sessions and queued events, keyed by the principal, stay).
- **Alternative flows:** A1 the client comes back from another redirect URI or another client id
  URL with the same `agent_id` → reconnect; the newest client id URL and redirect URI are
  recorded. A2 a name typed on reconnect does not change the stored name. A3 no age condition: a
  year or ten after the bind, with or without a live chain, reconnect works the same (R14). A4
  after disable → re-enable (clarification) → reconnect works; the old refresh token stays
  `invalid_grant`. A5 E5 bound by machine `pair` with X → reconnect; E5 is page-bound from then on.
- **Exception flows:** E1 `reconnectFromPage` on an unpaired entry is a caller bug → `TypeError`
  (K1d-5).
- **Postconditions:** no new token entry; no `pair` call; no second principal.

### AUTH-UC-17 — A bound token is entered with another id
- **Preconditions:** E5 bound to X.
- **Main flow:** a client passes `agent_id` Y ≠ X (or no id, from a client id URL whose `cid` ≠ X)
  → Authorize with `v(E5)` → `already-paired` on the page: "create a new token", with the bound
  pair's name and last-seen time. Nothing changes; the request stays pending.
- **Exception flows:** E1 Y is invalid → still `already-paired` (already-paired is checked first).

### AUTH-UC-18 — A page-bound entry at the token endpoint's `client_credentials`
- **Preconditions:** E5 bound on the page to X.
- **Main flow:** a machine client posts `client_credentials` with client id X and secret `v(E5)` →
  401 `invalid_client`, uniform with every other credential refusal, counted toward the failure
  limit (README K1d: one token never serves two client types).
- **Alternative flows:** A1 with another client id Y → the same `invalid_client`. A2 an entry bound
  by `pair` (machine) still gets its full token.

### AUTH-UC-19 — A browser chain has no age limit
- **Preconditions:** a browser chain started at T.
- **Main flow:** a refresh at T + 365 days − 1 ms, at T + 365 days and at T + 10 years (fake clock,
  each a valid rotation) → new access token and new refresh token each time (R-OA-23).
- **Exception flows:** the chain ends only by reuse (R-OA-16 (2)), a replayed code, or a disable or
  delete of its entry (R-OA-16 (3)).
- **Postconditions:** refresh records carry no `chainStartedAt`; `OAuthTokenStore` has no
  `chainsOf`; persisted refresh digests still survive a restart.

## Equivalence Partitioning

### AUTH-EP-15 — The `agent_id` request parameter
| # | Class | Example | At `/authorize` | On Authorize with a valid unpaired token |
| --- | --- | --- | --- | --- |
| 1 | absent | — | page | bound to `cid(U)` |
| 2 | present, no value | `agent_id=` | page | bound to `cid(U)` (omitted, RFC 6749 §3.1) |
| 3 | valid | `agent-w-1`, `Az_09-` | page | bound to it |
| 4 | invalid: dot | `agent.w` | page | `id-invalid`, nothing bound |
| 5 | invalid: other characters | `a b`, `a@b`, `é` | page | `id-invalid` |
| 6 | invalid: too long | 65 × `a` | page | `id-invalid` |
| 7 | repeated | `agent_id=a&agent_id=b` | redirect `invalid_request` + `iss`, `state` | — |
| 8 | posted in the form instead | form field `id` / `agent_id` | — | ignored: the request's id (or `cid(U)`) is bound |

## Boundary Value Analysis

### AUTH-BVA-10 — `agent_id` length (R-ID-02: 1–64)
| # | Length | Expected |
| --- | --- | --- |
| 1 | 0 (`agent_id=`) | treated as absent: `cid(U)` |
| 2 | 1 | bound |
| 3 | 64 | bound |
| 4 | 65 | page shown; Authorize → `id-invalid` |

### AUTH-BVA-11 — Refresh age (R-OA-23; replaces AUTH-ST-05 rows 10–11)
| # | Refresh at | Expected |
| --- | --- | --- |
| 1 | T + 365 days − 1 ms | rotates |
| 2 | T + 365 days (the withdrawn cap) | rotates |
| 3 | T + 10 years | rotates |

## Decision Table

### AUTH-DT-08 (rewritten) — What entering a token on the page does
Conditions are evaluated in this order: token, binding, id, name.

| Rule | Token | Entry | Id from the request | Name | Result | Changes |
| --- | --- | --- | --- | --- | --- | --- |
| 1–4 | not valid (unknown, disabled, deleted; rule 4 is C-TOKENS-REVEAL's) | — | any | any | "this token is not valid" | none; counted |
| 5 | valid | unpaired | valid, free | empty | code | bound to it, no name, full rights |
| 5a | valid | unpaired | valid, free | valid, free | code | bound, named |
| 5b | valid | unpaired | **`agent_id` invalid** (was: typed id invalid) | any | `id-invalid` | none; pending |
| 5c | valid | unpaired | held by another entry (machine, browser, disabled) | any | `id-taken` | none |
| 5d | valid | unpaired | differs from a held id only in case | — | code | bound |
| 5e | valid | unpaired | valid, free | held | `name-taken` | none |
| 5f | valid | unpaired | valid, free | whitespace only | code | bound, no name |
| 5g | valid | unpaired | held by a since-deleted entry | — | code | bound |
| 5h | valid | unpaired | none passed | empty | code | bound to `cid(U)` |
| 5i | valid | unpaired | none passed, `cid(U)` held by another entry | — | `id-taken` | none |
| 5j | valid | unpaired | invalid | held | `id-invalid` (id before name) | none |
| 5k | valid | unpaired | held | invalid | `id-taken` (id before name) | none |
| 5l | valid | unpaired | valid, free | invalid (65 characters) | `name-invalid` | none |
| 6 | valid | bound by a machine client to another id | any other id | — | `already-paired`, name and last-seen | none |
| 6a | valid | bound by a machine client to X | X | — | code (reconnect) | same principal; now page-bound |
| 7 | valid | bound on the page to X by this client | X (passed or derived) | any | **code (reconnect)** (was: `already-paired`) | same principal; newest client recorded |
| 7a | — | — | — | — | **withdrawn** (renewal of an ended chain; no chain end by age, R-OA-23) | — |
| 7b | — | — | — | — | **withdrawn** (folded into rule 8) | — |
| 7c | valid | bound to X | X | another name typed | code (reconnect) | name unchanged |
| 8 | valid | bound to X | Y ≠ X (passed, or a `cid` of another client) | — | `already-paired` | none |
| 8a | valid | bound to X by another client id URL | X | — | code (reconnect) | newest client id URL and redirect URI recorded |
| 8b | valid | bound to X | invalid | — | `already-paired` (binding before id) | none |
| 9 | valid | unpaired | valid | empty, `client_name` held | code | bound, no name (`client_name` only a hint) |
| 10 | empty | — | — | — | "enter a token" | none; not counted |
| 11 | any | — | — | — | the value in no URL, redirect, code, log or response; pages `no-store` | — |
| 12 | valid | unpaired | X in the request; an `id` / `agent_id` field in the form | — | code | bound to X |

## State Transitions

### AUTH-ST-08 — A token entry on the page
| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Unpaired | Authorize, id X valid and free | Bound(page, X) | code; full rights |
| 2 | Bound(page, X) | Authorize, id X | Bound(page, X) | code; same principal (reconnect) |
| 3 | Bound(page, X) | Authorize, id Y | Bound(page, X) | `already-paired`; nothing changes |
| 4 | Bound(page, X) | `client_credentials` with X | Bound(page, X) | `invalid_client`, counted |
| 5 | Bound(page, X) | entry disabled | Off | Authorize → "not valid"; refresh `invalid_grant` |
| 6 | Off | entry re-enabled, Authorize with X | Bound(page, X) | code (reconnect); the old refresh token stays `invalid_grant` |
| 7 | Bound(page, X) | entry deleted | (gone) | X is free: another entry binds X |
| 8 | Bound(machine, X) | Authorize with X | Bound(page, X) | code; then `client_credentials` → `invalid_client` |
| 9 | Unpaired | `reconnectFromPage` | Unpaired | `TypeError` (K1d-5) |
| 10 | Bound(page, X) | connector restart | Bound(page, X) | the pair and its newest client survive (durable store) |

### AUTH-ST-05 (rows 7, 10–12e rewritten) — A browser chain without age
| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Chain(RT1) | refresh | Chain(RT2) | the refresh record has exactly `chainId, entryKey, clientId, audience, generation` (no `chainStartedAt`) |
| 7 | Revoked (entry disabled) | re-enabled | Revoked | no refresh token revived; re-entering the token with the bound id **reconnects** (was: `already-paired`) |
| 10 | Chain started at T | refresh at T + 365 d − 1 ms | Chain(RTn+1) | rotates (was: rotates, start kept) |
| 11 | Chain started at T | refresh at T + 365 d, at T + 10 y | Chain(RTn+1) | rotates (was: Ended, `invalid_grant`) |
| 12 | any chain state, any age | reconnect from the page with the bound id | + Chain(RT1′) | new chain, same principal |
| 12a | Chain | re-entry with another id | unchanged | `already-paired` |
| 12b | Revoked (by reuse, disable / re-enable, value change) | reconnect with the bound id | + Chain(RT1′) | code; the revoked chain stays revoked (was: `already-paired`) |
| 12c | — | — | — | **withdrawn** (no chain condition on reconnect) |
| 12d | — | — | — | **withdrawn** (folded into 12b) |
| 12e | Chain | reconnect with another redirect URI the document lists | + Chain(RT1′) | accepted; the redirect URI recorded |
| 10–11 (store), 11 (restart), 12b–12d (store), "none", "chains of another entry" | — | `chainsOf` | — | **withdrawn** with `chainsOf` (R-OA-23) |

## Where the rows run
- Page, grants and fakes: `packages/dsh-connector/tests/oauth-web/page-id-cases.mjs` (+ rewrites in `cases.mjs`).
- Real `PairStore`: `packages/dsh-connector/tests/pairs/reconnect-cases.mjs`.
- Real `OAuthTokenStore` and the token endpoint: `packages/dsh-connector/tests/oauth/chain-cases.mjs`.
- Stock SDK / Python authorization-code client passing `agent_id` end to end: `todo` naming
  C-WIRE (the oauth-web world has no metadata or wired token endpoint for a stock client).

## UI-POLISH-D — the page's look and its CSP (polish-cases.mjs)

From the UI-POLISH-D requirements relayed 2026-11-18 and the CSP change the user approved that day.

| Id | Technique | Rows |
|---|---|---|
| UIPD-WEB-CSP | EP (response kind), DT (hash) | K1's header, the form page, the error page, a re-render with an alert, an empty 413 and the 303 after Cancel each carry exactly `default-src 'none'; style-src 'sha256-X'; frame-ancestors 'none'` (no `'unsafe-inline'`) with `cache-control: no-store` and `referrer-policy: same-origin`; on the form and error pages X = base64(SHA-256(UTF-8 `<style>` text)), one `<style>`, the same block on both; no `style=`, `<script>` or `<link>` |
| UIPD-WEB-MARKUP | EP | head: viewport and color-scheme metas; `<main class="card">`; `<p class="eyebrow">` "Fishball connector" above the `<h1>`, beside an `aria-hidden` mark holding an `<svg>`; `<div class="facts">` Client, Redirect host, DSH in that order, then the localhost `role="note"`, then `<div class="terms">`; a client with a non-loopback redirect → no note; labels `class="field"`; in `<div class="actions">` Authorize first (`primary`), Cancel (`secondary`, `formnovalidate`); `<p class="alert" role="alert">` on the error page and on a refused token; a client name with markup escaped in the title, the `<h1>`, the Client fact and the placeholder |
