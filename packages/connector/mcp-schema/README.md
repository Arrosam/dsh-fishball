# `fishball-connector/mcp-schema`: the K1 freeze

The contract of the connector's MCP surface and of the internal seams W2 builds against. Sources:
[v3-requirements.md](<../../../docs/planning/v3-requirements.md>) and
[v3-design.md](<../../../docs/planning/v3-design.md>) at `test/v3-cases` `b1295de`; spikes V3-S1
`9499ec6`, S2 `a499141`, S3 `b4dca86`, S7 `8e92b84`, S7b `141ac3b`; K2 `d1d0b25` (`../tools`).

This module holds data, pure builders and pure rules only. It imports no DSH package and loads in
plain Node, because `fishball-core` vendors a copy (design §9.1). Every name below is frozen:
changing one is a K1 amendment. A value marked **PROPOSED** is one the requirements do not fix; it
is frozen as written unless the user changes it at review. **[spec]** marks a point decided per MCP
2026-07-28 and the RFCs it cites (requirements 1.18).

One owner per value: the protocol version, the `contributed:` prefix and the shared refusal words
are K2's (`../tools/constants.js`), and the V2 domain's operation codes and payload vocabularies are
`./contract`'s until C-WIRE retires it. This module imports them; it never restates them.

## Protocol

- **Revision:** `2026-07-28` only (`PROTOCOL.version`, Q12). The SDK's
  `createMcpHandler(..., {legacy: 'reject'})` answers other revisions with -32022 and header
  mismatches with -32020 (S1). `Mcp-Session-Id` is ignored [spec: no protocol sessions].
- **SDK pins (`SDK_PINS`):** `@modelcontextprotocol/server` 2.2.0, `@modelcontextprotocol/node`
  2.1.0 (2.1.1+ needs server ^2.3.0).
- **`server/discover`** advertises `io.modelcontextprotocol/oauth-client-credentials` (R-OA-09) and
  `tools.listChanged: true`.
- **Routes (`PATHS`):** `/api/fishball/mcp`, issuer `/api/fishball/oauth`, token
  `/api/fishball/oauth/token`, both well-known documents path-inserted (RFC 9728 / 8414 §3.1); the
  approval listener serves only `/authorize` and `/authorize/decision`.

## Tools (`TOOLS`, in `tools/list` order)

`sessions_list`, `session_start`, `session_message`, `session_redirect`, `session_stop`,
`session_read`, `session_release`, `approvals_list`, `approval_answer`, `question_answer`,
`question_ask`, `question_answer_own`, `prompts_list`, `prompt_answer`, `grants_list`,
`grant_revoke`, `attachment_put`, `attachment_read`, `inbox_poll`, `inbox_ack`, `pair`, `set_name`.
No watch tools (R-WATCH-03), no attention tool (R-EXT-13). Core tools come before every contributed
tool (R-EXT-12).

- **Schemas** use only DSH's enforced subset (K2's `SCHEMA_SUBSET`). Reason: `dsh-mcp-client`
  registers each `inputSchema` in DSH's tool registry, and one refused tool makes it register none
  (`syncTools`, both SDKs). Every `inputSchema` passes `assertObjectJsonSchema` and every
  `outputSchema` passes `assertSupportedJsonSchema` (the check `dsh-mcp-client` applies to output
  schemas) on both SDKs. Length, count and byte bounds are therefore domain
  checks (design §3.2), with V2's `LIMITS` and codes (`limit-exceeded`, …).
- **Objects are closed:** an undeclared argument (`notifyWhenFinished` included) is
  `invalid-arguments` with `isError: true` [spec: tools § Security Considerations; TQ-12].
- **Payloads are V2's** (contract 1.2 §4), timer-free, with these V3 changes: no
  `notifyWhenFinished` / `watchId` / `watchError`; `question_ask` takes no `sessionId` (the caller is
  the principal, not a child session); `question_answer` names the `offerId` it answers, like
  `approval_answer` (S3: authority is the live offer id and the pair, design §3.4).
- **An `ask` event** (`ask_fishball`) is answered with `approval_answer` on its `offer.offerId`, as
  V2's asked request was.
- **`question_ask`'s answer** arrives as a `settlement` event with `answers` (V2 sent it through the
  inbox).

### Result envelope (R-CON-02, decided per spec)

`structuredContent` is `{ok: true, …}` or `{ok: false, code, message?}`; one text block holds the
same JSON; `isError` is `true` exactly when `ok` is `false` (`okResult`, `refusalResult`). Each
`outputSchema` is an exact-one `oneOf` of the success shape(s) and the refusal envelope, so every
output schema admits the refusal. The output root is therefore that `oneOf`, not `type: "object"`
[spec: MCP 2026-07-28 tools.md § Output Schema allows any JSON Schema for `outputSchema`, an array
root included, as the page's own `list_users` example shows; confirmed by Fishball 2026-11-13].
K2's `isObjectRootSchema` is the rule for contributed tools only. The builders write `ok`, `code`
and `message` last, so no extra field can change them. JSON-RPC errors stay for protocol faults
(unknown tool: -32602).

### Refusal codes (`REFUSAL`)

K2's shared words (`limit-exceeded`, `forbidden`, `unknown-session`, `expired`, `conflict`,
`unavailable`, `unsupported-operation`, `operation-failed`, `invalid-arguments`, `queue-full`,
`rate-limited`); V2's operation codes, unchanged (`not-referenced`, `too-large`,
`images-unsupported`, `not-managed`, `feature-off`, `session-not-live`, `invalid-decision`,
`risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete`,
`question-required`, `mode-user`, `bad-answer`, `already-settled`, `grant-invalid`,
`prefix-not-shell-tool`, `prefix-empty`, `prefix-not-in-call`, `expires-at-required`,
`expires-at-invalid`, `expires-at-past`, `unknown`, `ended`); new: `already-paired`, `id-taken`,
`name-invalid`, `name-taken`, and for `inbox_ack` (PROPOSED) `unknown-event` and
`digest-mismatch`. V2's wire-only codes (envelope, handshake, capability, host, duplicate, timeout)
do not exist over MCP. `id-invalid` (`ID_REFUSAL`) is a settings and page word only: at the token
endpoint an invalid id is `invalid_client` (R-ID-02).

### `pair` and `set_name` (R-ID-03/04, R-NAME-02/06)

- `pair({name?})` → `{ok: true, paired: true, id, name, nameAssigned?, nameRefused?}`;
  `{ok: false, code: 'already-paired', bound: {idMatches, boundId, name, pairedAt, lastSeenAt},
  advice}` (`PAIR_ADVICE`); `{ok: false, code: 'id-taken'}`. Without `name`, `nameAssigned` is
  absent (NAME-DT-01 rule 1).
- `set_name({name})` with a string or `null` (clear) → `{ok: true, name}` or `name-taken` /
  `name-invalid`. A non-string, non-null `name` is `invalid-arguments` (schema).

## Events

- **Types (`EVENT_TYPE`):** `permission`, `question`, `plan-review`, `settlement`, `retirement`,
  `turn-finished`, `state`, `message`, `ask`, `handover`, `takeback`, `notice`, and
  `contributed:<namespace>.<event>` (`isEventType`).
- **Event shape (`MAILBOX_EVENT_SCHEMA`):** `{eventId, mailboxGeneration, sequence, type, at,
  sourceSessionId, correlationId, offer?, payload, payloadDigest}`; `offer = {offerId, revision,
  decisionKind}` on the answerable types (`ANSWERABLE_TYPES`).
- **Payloads (`EVENT_PAYLOAD_SCHEMA`):** offers and `ask` carry the V2 descriptor; `settlement`
  `{approvalId, outcome, by, answers?}`; `retirement` `{retiredEventId, reason}`;
  `turn-finished` `{sessionId, running, queued}`; `state` `{sessionId, running,
  pendingInteraction}`; `message` `{text, images}`; `handover` / `takeback` `{sessionId, note}`;
  `notice` `{code, text}` (no notice code is frozen yet: `NOTICE.codes` is empty, and each task that
  produces one adds it as a K1 amendment); contributor events `{namespace, event, data, summary?}`
  (design §13.5a).
- **Offer ids (`OFFER_ID`):** `<requestId>.r<revision>`, revision from 1 (Q-S3-1).
- **Resource:** `fishball-events`, `fishball://events`, `application/json`; `resources/read`
  returns `{pending, headSequence, mailboxGeneration}`, never bodies.
- **Connected (`CONNECTED`):** a principal is connected exactly while it holds an open listen
  stream subscribed to `fishball://events`. One definition for embed-UI's lights,
  `ask_fishball`'s `unavailable` and the native status. This is design §3.6's definition (R-UI-10
  "an open `fishball-events` listen stream now"); design §3.5's earlier wording ("an authenticated
  request or a listen stream within the current connector life") is superseded and needs the
  design session's amendment.
- **Settlement (`SETTLEMENT_OUTCOME`, `SETTLED_BY`, PROPOSED):** `allow` / `grant` → `allowed`,
  `reject` → `rejected`, an answered question or plan review → `answered`; `ask` and `escalate`
  settle nothing (the user's later answer does). `by` is `user` or `principal`.

### Mailbox (`MAILBOX`, `QUEUE`)

| Name | Value | Meaning |
| --- | --- | --- |
| `pageDefault` | 50 | PROPOSED: `inbox_poll` without `limit` |
| `pageMax` | 100 | PROPOSED: `limit` is 1–100; 0 or 101 is `limit-exceeded`, never clamped |
| `heldMs` | 30 days | [req] events kept for a disabled entry |
| `ackedReceiptMs` | 1 day | PROPOSED: a repeated ack of an acked event is a no-op success |
| `QUEUE.refusedTypes` | `message`, `turn-finished`, `state`, `notice`, contributor events | PROPOSED: refused `queue-full` past `maxQueuedInputs`; offers, `ask`, `settlement`, `retirement`, `handover`, `takeback` always commit |

- A pending event never expires. A stale cursor is `{resync: {reason: 'stale-cursor',
  headSequence}}`; a foreign cursor is `forbidden`.
- A settled offer's own event is **not** retired: it stays pending until acked, and the
  `settlement` that follows it is the signal (PROPOSED, EVT-ST-01 row 5). A withdrawn one is
  replaced by a `retirement` (design §5.3).
- `inbox_ack` is all or nothing (PROPOSED): a receipt naming no event of the caller's mailbox is
  `unknown-event` (it never says "another pair's"), a wrong digest is `digest-mismatch`.

## OAuth

- **Scopes:** `fishball`, `fishball:pair`; never `offline_access` [spec].
- **Grants:** `client_credentials` (`client_secret_basic`, `client_secret_post`),
  `authorization_code` with PKCE `S256`, `refresh_token`; public clients use `none`.
- **Token responses** carry `Cache-Control: no-store` and `Pragma: no-cache`
  (`TOKEN_RESPONSE_HEADERS`) [spec: RFC 6749 §5.1].
- **Documents:** `protectedResourceMetadata(origin)`, `authorizationServerMetadata(origin,
  approvalOrigin)` (design §5.5 table; `authorization_endpoint` kept even while the port is in use),
  `tokenResponse` (standard fields only, `expires_in` 3600).
- **Challenges** (`bearerChallenge`): parameters in the fixed order `error`, `error_description`,
  `scope`, `resource_metadata`, so equal cases are byte-identical. No token: no `error`. Invalid:
  `error="invalid_token"`. Pair-only on a full-power call: 403 `error="insufficient_scope"`,
  `error_description` `not-paired` / `id-mismatch`, `scope="fishball"` [spec].
- **Pair-only power (`PAIR_ONLY`):** `server/discover`, `tools/list` (listing `pair` only), `pair`.
- **Errors (`OAUTH_ERROR`, `OAUTH_ERROR_STATUS`):**

| Case | Answer |
| --- | --- |
| no `grant_type` | 400 `invalid_request` [spec: RFC 6749 §5.2, a required parameter is missing] |
| unknown grant (`password`, …) | 400 `unsupported_grant_type` |
| GET on the token endpoint | 405, `Allow: POST`, no body semantics (PROPOSED: S7 T7's behaviour) |
| `refresh_token` from a machine client, or any refresh token not issued to a browser client | 400 `invalid_grant` |
| unknown / disabled / deleted / short token, invalid or missing client id | 401 `invalid_client` (`WWW-Authenticate: Basic` when Basic was used) |
| missing or foreign `resource` | 400 `invalid_target` |
| a client secret on a public grant | 401 `invalid_client` |
| `client_secret` or `access_token` in the URL query | 400 `invalid_request`, even with a valid header or form [spec: RFC 6750 §2.3, a client MUST NOT use two methods] |
| wrong `code_verifier` or `redirect_uri` | 400 `invalid_grant`; the code is **not** consumed and stays bound by its 60 s life (PROPOSED: S7b's behaviour) |
| rate limit | 429, `Retry-After`, `{error: "temporarily_unavailable"}` (PROPOSED: RFC 6749 §5.2 has no rate-limit code; this one is from §4.1.2.1) |
| unexpected failure | 500 `server_error` |

### Lifetimes and limits

| Name | Value | Source |
| --- | --- | --- |
| `LIFETIME.accessTokenMs` | 3600 s; expired at `now >= issuedAt + 3600 s` | [req] Q27 |
| `LIFETIME.codeMs` | 60 s | [req] R-OA-14 |
| `LIFETIME.pendingRequestMs` | 10 min | [req] R-OA-15 |
| `LIFETIME.refreshGraceMs` | 10 s; reuse at exactly 10 s revokes | [req] Q-S7B-1 B |
| `LIFETIME.refreshChainMaxMs` | 30 days from the code redemption | PROPOSED (R-OA-16 (5) asks for one) |
| `TOKEN_VALUE.minChars` | 32 code points | [req] TQ-4 A |
| `TOKEN_VALUE` generated | `fbt_` + 32 random bytes base64url | [design] §5.2 |
| `RATE_LIMITS` | per (address, client id), 1-min window: 10 credential failures, 30 token requests; plus 50 failures per address | PROPOSED |
| `ENDPOINT_LIMITS.bodyBytes` | 8 MiB | PROPOSED (V2's attachment frame) |
| `ENDPOINT_LIMITS.inFlightPerPrincipal` | 32 | PROPOSED |
| `ENDPOINT_LIMITS.listenStreamsPerPrincipal` | 8 | PROPOSED |
| `ENDPOINT_LIMITS` rate | 600 per minute, burst 120, per principal | PROPOSED |
| `APPROVAL_LISTENER.defaultPort` | 47615 | PROPOSED |
| `APPROVAL_LISTENER.retryMs` | 30 s rebind retry after a clash | PROPOSED |
| `CIMD_LIMITS` | 5 KiB [spec]; 3 s; cache ≤ 1 day | 5 KiB per CIMD §6.6; the rest PROPOSED |
| `PAIR_TIMING.lastSeenWriteIntervalMs` | 60 s: a request 60 s or more after the last write updates it | [design] §5.8 |

- Rate limits count every refused credential (secret, page token, bearer). An empty page field is
  not counted (PROPOSED). While limited, a valid credential is refused too (S7b P2).
- **Settings save refusals (`SETTINGS_REFUSAL`):** `ref-duplicate` (two entries, one `ref`) and
  `value-duplicate` (two entries whose refs hold the same value; the user's decision 2026-11-13,
  AUTH-EP-04 7a). Either refusal keeps the previous settings, and names only entry labels.
- Limit refusals at the endpoint are a JSON-RPC error body, code -32000, message `limit-exceeded`
  (413) or `rate-limited` (429), id `null`.
- A non-loopback listener over plain http answers 503 `insecure-listener` on every route.

### Hosts and Origin (`HOSTS`)

Allowed hosts: `localhost`, `127.0.0.1`, `[::1]`, the bind address and DSH's `--trusted-host`
list; anything else is 403 before authentication. Loopback is `http`, every other allowed host
`https`; forwarded headers are never read. Any present `Origin` on DSH's listener routes is 403
(design §3.1: the allowlist is empty); the approval form accepts only its own origin.

### Names and ids (`ID_GRAMMAR`, `NAME_RULES`, `rules.js`)

- Id: `^[A-Za-z0-9_-]{1,64}$`, case-sensitive (`isFishballId`).
- Name: White_Space runs → one space, trimmed, NFC; then 1–64 code points with no `Cc` control
  character and no `Cf` format character (bidi overrides, zero-width and other invisible
  characters; the user's decision, 2026-11-13), else `name-invalid`. U+200D (zero-width joiner)
  is `Cf` too, so an emoji ZWJ sequence such as a family emoji is refused; single emoji are fine
  (`checkName`). The uniqueness key is `nameKey`: lower, upper, then lower case, then NFC (so `Straße` and
  `STRASSE` and `Straẞe` clash). A nameless principal shows as `ID: <id>` with the prefix bold
  (`principalLabel`).

## Internal module interfaces (`index.d.ts`, types only)

`BearerVerifier` (C-OAUTH → C-HTTP), `TokenRegistry` (C-TOKENS), `PairStore` (C-PAIR), `Mailbox`
(C-MAILBOX: commit, poll, ack, summary, retire, hold, release, drop), `HintSink` (C-HTTP's listen
streams), `OAuthTokenStore` (C-OAUTH and C-OAUTH-WEB), `Router.recipientFor` (C-ROUTE), `Presence`
(the connected definition). The runtime exports are declared there too. Keys are opaque: `EntryKey`, `PrincipalKey`; no interface carries a token
value.

## Left to a task (not frozen here)

| What (case rows flagged `K`) | Task |
| --- | --- |
| which `notice` codes exist (EVT-EP-01 15) | the producing task (C-ROUTE, C-WIRE), as a K1 amendment |
| card fields of the ask card and of `question_ask` (PLAT-UC-07) | K3 |
| `fishballConnectorHandover` codes, dropdown order, release emits nothing? (HAND rows 1-E1, 5, 7a, 8, 9, 144, 160, 164) | K3 / C-ROUTE |
| `fishballConnectorTokens`, hosted status codes (08-hosted) | K3 / I-HOST |
| interceptor priority range (EVT-DT-02 7) and core's interception (EVT) | K3 / F-INTERCEPT |
| core's target status codes, URL refusals (09 rows 8, 74, 103) | F-LINK / F-STATUS |
| `plugin-set-incomplete`, board 30 d edge (11-platform) | F-STATUS / FEAT-PEERS |
| Watchdog rows (05-watchdog) | WD-ROUTE / WD-PATROL |
| embed-UI rows (10-embed-ui-matrix) | U-SHELL / U-MARKS / U-RECORDS |
| the `dsh-mcp-client` adapter | C-MCP-ADAPTER (S7c) |

## Departure from the specification

Exactly one (Q-SPEC-1 A): the authorization server and the approval page are plain HTTP on
loopback. Every non-loopback host is HTTPS, directly or through the user's tunnel (R-OA-08).
