# `dsh-connector/mcp-schema`: the K1 freeze

The contract of the connector's MCP surface and of the internal seams W2 builds against. Sources:
[v3-requirements.md](<../../../docs/planning/v3-requirements.md>) and
[v3-design.md](<../../../docs/planning/v3-design.md>) at `test/v3-cases` `b1295de`; spikes V3-S1
`9499ec6`, S2 `a499141`, S3 `b4dca86`, S7 `8e92b84`, S7b `141ac3b`; K2 `d1d0b25` (`../tools`).
The K1d gate (W4) amends it from `design/v3` `9a531192`: the token-reveal amendment (design §5.1,
§5.9; requirements 1.27–1.32), the page id and no chain cap (R-OA-22, R-OA-23), the neutral names
(§1.0c), `Mailbox.transfer` and the `SettingsWriter` / `SessionNotes` ports (W4 briefs G3).

This module holds data, pure builders and pure rules only. It imports no DSH package and loads in
plain Node, because `fishball-core` vendors a copy (design §9.1; until F-OWN-SCHEMA ends it). Every name below is frozen:
changing one is a K1 amendment. A value marked **PROPOSED** is one the requirements do not fix; it
is frozen as written unless the user changes it at review. **DECIDED** marks a value the user
decided at review (relayed by Fishball); `#n` is its row in [User decisions](#user-decisions). **[spec]** marks a point decided per MCP 2026-07-28 and
the RFCs it cites (requirements 1.18).

One owner per value: the protocol version, the `contributed:` prefix and the shared refusal words
are K2's (`../tools/constants.js`); this module imports them and never restates them. The
domain's operation codes, payload vocabularies and payload bounds are this module's own
(`REFUSAL`, `DELIVERY`, `APPROVAL_DECISION`, `RISK`, `GRANT_KIND`, `PROMPT_DECISIONS`,
`APPROVAL_KIND`, `PLAN_REVIEW`, `ARGUMENTS_STATUS`, `IMAGE_MEDIA`, `IMAGE_TYPES`,
`PAYLOAD_LIMITS`).

## Protocol

- **Revision:** `2026-07-28` only (`PROTOCOL.version`, Q12). The SDK's
  `createMcpHandler(..., {legacy: 'reject'})` answers other revisions with -32022 and header
  mismatches with -32020 (S1). `Mcp-Session-Id` is ignored [spec: no protocol sessions].
- **SDK pins (`SDK_PINS`):** the connector pins `@modelcontextprotocol/server` 2.4.0 and
  `@modelcontextprotocol/node` 2.1.2 (server peer `^2.4.0`). Core and the adapter pin their own
  `@modelcontextprotocol/client` 2.4.0. DSH 0.2.1-rc.5 and 0.2.2-rc.1 still ship client 2.2.0;
  they interoperate over the same `2026-07-28` wire revision without a host upgrade.
- **Per-request factory:** `createMcpHandler` uses the verified caller to build a fresh
  `McpServer` with only that caller's tools and resources. Listen streams stay on the pair's own
  handler; no server instance is shared across callers.
- **`server/discover`** advertises `io.modelcontextprotocol/oauth-client-credentials` (R-OA-09) and
  `tools.listChanged: true`.
- **Routes (`PATHS`):** `/api/agent/mcp`, issuer `/api/agent/oauth`, token
  `/api/agent/oauth/token`, both well-known documents path-inserted (RFC 9728 / 8414 §3.1); the
  approval listener serves only `/authorize` and `/authorize/decision`.

## Tools (`TOOLS`, in `tools/list` order)

`sessions_list`, `workspaces_list`, `models_list`, `session_start`, `session_message`,
`session_redirect`, `session_stop`, `session_read`, `session_release`, `approvals_list`, `approval_answer`, `question_answer`,
`prompts_list`, `prompt_answer`, `grants_list`, `grant_revoke`, `attachment_put`, `attachment_read`,
`inbox_poll`, `inbox_ack`, `pair`, `set_name`.
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
- **Payloads are V2's** (contract 1.2 §4; bounds `PAYLOAD_LIMITS`), timer-free, with these V3 changes: no
  `notifyWhenFinished` / `watchId` / `watchError`; `question_answer` names the `offerId` it answers,
  like `approval_answer` (S3: authority is the live offer id and the pair, design §3.4).
- **Incomplete permission arguments.** With `requests.autoRejectIncompleteArguments` enabled
  (the default), a new managed request with `truncated` or `unavailable` arguments that is not
  already covered by a standing grant is rejected before an offer is created. No mailbox event is
  emitted for the rejection itself. Turning it off restores manual review, where `allow` and
  `grant` still refuse such arguments with `arguments-incomplete`.
- **Automatic permission handoff.** A permission offer may carry `autoEscalatePermissions: true`
  when the target enables automatic cards. If a manager completes its deciding turn without a
  final answer, Fishball can escalate using the same offer id. On successful escalation the
  connector emits a `notice` with code `permission-escalated` and the current offer id as its
  correlation id. This does not settle the request. Fishball files the existing permission card
  and sends its action notice; do not call `ask_user` or send a duplicate notice. Question and
  plan-review handoff is unchanged.
- **An `ask` event** (`ask_agent`) is answered with `approval_answer` on its `offer.offerId`, as
  V2's asked request was. *Withdrawn by C-WIRE-2:* there is no `ask_agent` (the user, 2026-11-17:
  "不给ask_agent工具"), so nothing produces an `ask`; the type and the `ask` decision stay frozen
  words. A permission offer refuses `approval_answer` with `ask` as `invalid-decision` (the user's
  answer, 2026-11-17: "Refuse it"), and its `choices` are `allow`, `grant`, `reject`, `escalate`.

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
`name-invalid`, `name-taken`, and for `inbox_ack` (DECIDED #5, #6) `unknown-event` and
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
- **Generated names (K1 amendment; the user's decision, 2026-11-21, superseding R-NAME-04's "the
  connector never assigns a name"):** a pair the connector would leave nameless gets a readable
  generated name, "<Adjective> <Noun>" with a " 2", " 3", … suffix only when random draws keep
  colliding, unique among the connector's pairs under `nameKey`. The connector assigns it in
  `PairStore` (`src/pairs/store.js`): `pair` without a usable name answers the generated name
  (`name` is a string; `nameAssigned: false` and `nameRefused` still report a refused name);
  `set_name(null)` answers a fresh generated name in place of the cleared one; a refused `set_name`
  keeps a held name, and names a still nameless pair with a generated one while answering the
  refusal. The approval page's bind with an empty name field still binds nameless, so a page-bound
  pair reads `ID: <id>` until its agent's first name call. Pairs stored nameless before the decision
  are named when the store opens (except a page-bound one that has made no request yet). `name`
  stays `string | null` in the schemas and types, for those cases and for `already-paired`'s
  `bound.name`; `principalLabel` (R-NAME-08) stays the fallback for a nameless principal.

## Events

- **Types (`EVENT_TYPE`):** `permission`, `question`, `plan-review`, `settlement`, `retirement`,
  `turn-finished`, `state` (no producer since WAKE-REDUCE), `message`, `ask` (no producer since C-WIRE-2), `handover`, `takeback`,
  `notice`, and `contributed:<namespace>.<event>` (`isEventType`).
- **Event shape (`MAILBOX_EVENT_SCHEMA`):** `{eventId, mailboxGeneration, sequence, type, at,
  sourceSessionId, correlationId, offer?, payload, payloadDigest}`; `offer = {offerId, revision,
  decisionKind}` on the answerable types (`ANSWERABLE_TYPES`).
- **Payloads (`EVENT_PAYLOAD_SCHEMA`):** offers and `ask` carry the V2 descriptor (a permission a
  `dshConnectorSessions` delegate claimed but did not decide adds `delegate: {name, outcome, reason?}`,
  `DELEGATE_OUTCOME` `passed` (its reason, when it gave one) or `failed` (reason: the failure's code),
  so a judged pass is told apart from a failed delegate; the user, 2026-11-21); `settlement`
  `{approvalId, outcome, by, answers?}`; `retirement` `{retiredEventId, reason}`;
  `turn-finished` `{sessionId, outcome, finalMessage?, stop?}` (WAKE-REDUCE below); `state` `{sessionId, running,
  pendingInteraction}` (frozen, no producer); `message` `{text, images}`; `handover` / `takeback` `{sessionId, note}`;
  `notice` `{code, text}` (`NOTICE.codes`: each task that produces one adds it as a K1 amendment;
  C-ROUTE produces none, K1c-4; `question-call-ended`, the managed-request fix of 2026-11-21:
  a managed session's question call ended but its turn went on, and the question stays open with its
  manager, correlation id its offer id); contributor events `{namespace, event, data, summary?}`
  (design §13.5a).
- **Offer ids (`OFFER_ID`):** `<requestId>.r<revision>`, revision from 1 (Q-S3-1).
- **Resource:** `agent-events`, `dsh-agent://events`, `application/json`; `resources/read`
  returns `{pending, headSequence, mailboxGeneration}`, never bodies.
- **Connected (`CONNECTED`):** a principal is connected exactly while it holds an open listen
  stream subscribed to `dsh-agent://events`. One definition for embed-UI's lights and the native
  status (`ask_agent`'s `unavailable` went with `ask_agent`, C-WIRE-2). This is design §3.6's definition (R-UI-10
  "an open `agent-events` listen stream now"); design §3.5's earlier wording ("an authenticated
  request or a listen stream within the current connector life") is superseded and needs the
  design session's amendment.
- **Settlement (`SETTLEMENT_OUTCOME`, `SETTLED_BY`, PROPOSED):** `allow` / `grant` → `allowed`,
  `reject` → `rejected`, an answered question or plan review → `answered`; `ask` and `escalate`
  settle nothing (the user's later answer does). `by` is `user`, `principal` or `delegate` (a
  main-DSH plugin registered through `dshConnectorSessions.delegates` decided it before any offer;
  the settlement then carries `delegate: {name, toolName, reason}`; the user, 2026-11-20). An escalated offer
  (or a question sent `toUser`) is the user's: it leaves `approvals_list`, an agent's answer to it
  is refused, and the user's answer in the session is its settlement, to the same pair
  (C-WIRE-2). If its session leaves the pair's management first, it ends with no event.

### Managed state (`ManagedState`, `MANAGED_REFUSAL`; task K1c)

C-ROUTE owns the one `ManagedState` implementation; C-TOOLS calls it. It records at most one
manager per **root** session id (R-ROUTE-01). The caller resolves the root and answers
`unknown-session` itself (C-TOOLS reads DSH). Hand over and Take back stay K3's
`dshConnectorHandover`; revocation and succession are C-REVOKE's and C-SUCCEED's. All decided
by Fishball (K1c-1), including these rules:

- **Durable:** a change resolves only once it is stored, and survives a connector restart.
- **Serial:** changes run one after another; of two overlapping calls the first wins and the second
  sees its result.
- **Visible on resolve:** `managerOf` and `managed()` show a change once its promise has resolved.
- **Listeners:** a throwing `onChange` listener does not stop the others.

| Method | Caller | Answer |
| --- | --- | --- |
| `managerOf(sessionId)` | C-TOOLS: every tool that names a session ("a session you manage"); `sessions_list` omits and `session_read` refuses `forbidden` a session another principal manages (1.23); `approval_answer` authority | the `PrincipalKey`, or `undefined` |
| `managed()` | C-ROUTE, K3's `managed()`, C-TOOLS lists over managed sessions | `[{sessionId, principalKey}]` |
| `manage(sessionId, principalKey)` | `session_start` | `{ok: true}`; `conflict` (`MANAGED_REFUSAL.alreadyManaged`) when the session has a manager, the caller included |
| `release(sessionId, principalKey)` | `session_release` | `{ok: true}`; `not-managed` when nobody manages it; `forbidden` (`MANAGED_REFUSAL.otherManager`) when another principal does (HAND-ST-01 row 9) |
| `onChange(fn)` | C-ROUTE, K3 | `fn()` after every change, by any path; returns the disposer |

- A refusal changes nothing; no method throws for one.
- **`session_release` sends no release event or notification** (W3 Q-16, K1c-2): there is no
  counterpart of `takeback`. Its only events are the retirements of the session's live offers, as
  frozen: one `retirement` with reason `released` per live offer, to the releasing pair. C-ROUTE's
  `release` performs them once the change is stored; C-TOOLS calls nothing else. The offers then go
  to the user in the session.
- **No-recipient `message` queue** (W3 Q-17, K1c-3): *withdrawn by C-WIRE-2* with the designated
  agent (the user's answer q5, 2026-11-17: "Remove agentToken entirely"; "There is no 'designated
  agent' default for unmanaged sessions"). It said: "while no **paired** entry is designated …, a
  `message_agent` from an unmanaged session (or none) is held in a durable connector queue
  (`NoRecipient.fallback` `queue`)". Now `message_agent` exists only in managed sessions (the user:
  "When a session is managed by an agent, its user-interaction tools … are forwarded to that
  agent. An unmanaged session's tools go to the user as normal DSH") and goes to its manager; a
  call that races a release answers `not-managed`. An event that names no managed session has no
  recipient: an offer is the user's (`to-user`), a contributor `emit` is `no-agent`, anything else
  is `dropped` (`NoRecipient`, index.d.ts).

### Core's link to its target (`TARGET_STATE`, `TARGET_CODE`, `LINK_REFUSAL`)

K1 is the one runtime owner of these words (DECIDED D7): they cross the connector–core boundary,
and core reads them from its vendored K1. K3 types them (`host-services/child.d.ts` `TargetState`,
`TargetCode`; `core/contracts/events.d.ts` `CommitSendResult`), so a K3 amendment of those types
changes this object in the same change.

| Constant | Values |
| --- | --- |
| `TARGET_STATE` | `connected`, `target-unreachable`, `token-refused`, `target-unset` (design §4.1) |
| `TARGET_CODE` | `TARGET_UNREACHABLE`, `TOKEN_REFUSED`, `TARGET_INCOMPATIBLE`, `token-revoked` (design §6.1); `target-insecure`, `target-invalid`: core's own refusals of a target URL before any request, with state `target-unset` (DECIDED D5; R-FB-04, REM-EP-01 rows 6–8) |
| `LINK_REFUSAL.disconnected` | the answer of a call made while the link is down: it never reached the connector (design §6.3, R-REM-04) |

### Mailbox (`MAILBOX`, `QUEUE`)

| Name | Value | Meaning |
| --- | --- | --- |
| `pageDefault` | 50 | PROPOSED: `inbox_poll` without `limit` |
| `pageMax` | 100 | PROPOSED: `limit` is 1–100; 0 or 101 is `limit-exceeded`, never clamped |
| `disabledRetentionMs` | 30 days | [req] events kept for a disabled entry |
| `ackedReceiptMs` | 1 day | DECIDED (#36: kept): a repeated ack of an acked event is a no-op success |
| `QUEUE.maxQueuedInputs` | 200 | [design §3.4] the default of the connector setting; frozen by K1 |
| `QUEUE.refusedTypes` | `message`, `turn-finished`, `state`, `notice`, contributor events | PROPOSED: refused `queue-full` past `maxQueuedInputs`; offers, `ask`, `settlement`, `retirement`, `handover`, `takeback` always commit |

- **`mailboxGeneration`** (DECIDED #W2-1) is set when a pair's mailbox storage is first made
  and changes only when that storage is lost or reset. Delete (`drop`), the end of a hold
  (`expireHolds`) and re-enable (`release`) keep it. Only a new generation makes a cursor stale.
- A pending event never expires. A stale cursor is `{resync: {reason: 'stale-cursor',
  headSequence}}`; a foreign cursor is `forbidden`.
- A settled offer's own event is **not** retired: it stays pending until acked, and the
  `settlement` that follows it is the signal (PROPOSED, EVT-ST-01 row 5). A withdrawn one is
  replaced by a `retirement` (design §5.3).
- `Mailbox.transfer(from, to)` (K1d-1, R-HOST-09 step 5): every pending event of `from`, held
  ones included, moves to `to` in order, keeping its `eventId`, payload and `payloadDigest`; its
  `sequence` and `mailboxGeneration` become the new box's. Nothing is committed, no hold changes,
  and `maxQueuedInputs` never refuses a moved event. Misuse (a bad key, or `from === to`) is a
  synchronous `TypeError`, as `retire`'s (K1d-2).
- `Mailbox.retire` resolves `{retired: boolean}` (DECIDED #W3-1): `true` when it replaced a
  pending event, `false` when the event was not pending in that pair's mailbox (acked, already
  retired, unknown, another pair's), which commits and changes nothing. On `false` C-ROUTE sends
  a fresh `retirement` naming the offer, as it does for an offer it knows is acked, so an
  `inbox_ack` that lands just before the retire no longer loses the retirement (W2 finding SF3).
- `inbox_ack` is all or nothing (DECIDED #61; the codes DECIDED #5, #6): a receipt naming no
  event of the caller's mailbox is `unknown-event` (it never says "another pair's"), a wrong digest is `digest-mismatch`.

## OAuth

- **Scopes:** `agent`, `agent:pair`; never `offline_access` [spec].
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
  `error_description` `not-paired` / `id-mismatch`, `scope="agent"` [spec].
- **Pair-only power (`PAIR_ONLY`):** `server/discover`, `tools/list` (listing `pair` only), `pair`.
- **Errors (`OAUTH_ERROR`, `OAUTH_ERROR_STATUS`):**

| Case | Answer |
| --- | --- |
| no `grant_type` | 400 `invalid_request` [spec: RFC 6749 §5.2, a required parameter is missing] |
| unknown grant (`password`, …) | 400 `unsupported_grant_type` |
| GET on the token endpoint | 405, `Allow: POST`, no body semantics (PROPOSED: S7 T7's behaviour) |
| `refresh_token` from a machine client, or any refresh token not issued to a browser client | 400 `invalid_grant` |
| unknown / disabled / deleted / duplicated token, invalid or missing client id | 401 `invalid_client` (`WWW-Authenticate: Basic` when Basic was used) |
| missing or foreign `resource` | 400 `invalid_target` |
| a client secret on a public grant | 401 `invalid_client` |
| `client_secret` or `access_token` in the URL query | 400 `invalid_request`, even with a valid header or form [spec: RFC 6750 §2.3, a client MUST NOT use two methods] |
| wrong `code_verifier` or `redirect_uri` | 400 `invalid_grant`; the code is **not** consumed and stays bound by its 60 s life (PROPOSED: S7b's behaviour) |
| rate limit | 429, `Retry-After`, `{error: "temporarily_unavailable"}` (DECIDED #1: RFC 6749 §5.2 has no rate-limit code; this one is from §4.1.2.1) |
| unexpected failure | 500 `server_error` |

### Lifetimes and limits

| Name | Value | Source |
| --- | --- | --- |
| `LIFETIME.accessTokenMs` | 3600 s; expired at `now >= issuedAt + 3600 s` | [req] Q27 |
| `LIFETIME.codeMs` | 60 s | [req] R-OA-14 |
| `LIFETIME.pendingRequestMs` | 10 min | [req] R-OA-15 |
| `LIFETIME.refreshGraceMs` | 10 s; reuse at exactly 10 s revokes | [req] Q-S7B-1 B |
| refresh chain lifetime | none: a chain ends only by reuse or by a disable or delete of its entry (`refreshChainMaxMs` withdrawn, K1d) | [req] R-OA-23 (1.32 R14; DECIDED #18 reversed) |
| `TOKEN_VALUE` generated | `dsht_` + 32 random bytes base64url; the only kind of token value (no length rule: `minChars` and `isTokenLongEnough` withdrawn, K1d) | [design] §5.2, §1.0c; [req] 1.27 |
| `TOKEN_VALUE.digestAlgorithm` | SHA-256: the connector stores only the digest of a token value (K1d) | [design] §5.1 |
| `RATE_LIMITS.tokenRequestsPerWindow` | 30 token requests per (address, client id) per minute | PROPOSED |
| `RATE_LIMITS.tokenRequestsPerAddressPerWindow` | 150 token requests per address per minute, any client id, counted before the body is read | PROPOSED (K1 amendment after W2; was C-OAUTH's local value) |
| `TOKEN_ENDPOINT_LIMITS.formBodyBytes` | 8 KiB token-request form; over it 400 `invalid_request` | PROPOSED (K1 amendment after W2; was C-OAUTH's `TOKEN_FORM.maxBodyBytes`) |
| `FAILURE_LIMIT` | the one failure limit (K1a): per (address, client id; an MCP bearer by address alone), 1-min window: 10 refused credentials; plus 50 per address | key and 10: DECIDED (#19, #21: kept); 50: PROPOSED; one shared constant and `FailureLimiter`: PROPOSED (K1a) |
| `ENDPOINT_LIMITS.bodyBytes` | 8 MiB for the whole MCP request body; larger bodies get HTTP 413 | PROPOSED (V2's attachment frame) |
| `ENDPOINT_LIMITS.maxToolInputElements` | 4096 per `tools/call`: count every object key and array element in `arguments`, including nested ones. Above 4096 the tool returns `limit-exceeded`, even if the body fits in 8 MiB. | K1 amendment; applies to core and contributed tools |
| `ENDPOINT_LIMITS.inFlightPerPrincipal` | 32 | PROPOSED |
| `ENDPOINT_LIMITS.listenStreamsPerPrincipal` | 8 | PROPOSED |
| `ENDPOINT_LIMITS` rate | 600 per minute, burst 120, per principal | PROPOSED |
| `APPROVAL_LISTENER.defaultPort` | 47615 | PROPOSED |
| `APPROVAL_LISTENER.retryMs` | 30 s rebind retry after a clash | PROPOSED |
| `APPROVAL_LISTENER.decisionBodyBytes` | 8 KiB decision-form body; over it 413, no body | PROPOSED (K1 amendment after W2; was C-OAUTH-WEB's local value) |
| `APPROVAL_LISTENER.pendingRequestsMax` | 256 pending authorization requests; the oldest is evicted first and then reads as expired | PROPOSED (K1 amendment after W2; was C-OAUTH-WEB's local value) |
| `CIMD_LIMITS` | 5 KiB [spec]; 3 s; cache ≤ 1 day | 5 KiB per CIMD §6.6; the rest PROPOSED |
| `CIMD_LIMITS.cacheEntriesMax` | 256 cached documents; the oldest is evicted first | PROPOSED (K1 amendment after W2; was C-OAUTH-WEB's local value) |
| `PAIR_TIMING.lastSeenWriteIntervalMs` | 60 s: a request 60 s or more after the last write updates it | [design] §5.8 |

- `FAILURE_LIMIT` counts every refused credential (secret, page token, bearer) in one
  `FailureLimiter` that the token endpoint, the approval page and the MCP endpoint share
  (R-OA-17; K1a, PROPOSED). An empty page field is not counted (PROPOSED). The credential is
  verified first: a valid one always passes, and while limited a failing one is answered 429 and
  not counted again (X-SEC X-03, C-WIRE-2, amending S7b P2).
- **Settings save refusal (`SETTINGS_REFUSAL`, K1d):** `token-duplicate` (PROPOSED, R3; decided
  item 9) for two items with one entry `key`, two entries with one value digest, or an item with no
  record (R5). The previous list is written back and the notice names only entry labels; found
  outside a save, the entries involved refuse service. It replaces `ref-duplicate` and
  `value-duplicate`. `ENTRY_STATUS` is `ok` only (`token-too-short`, `token-unconfigured`
  withdrawn), and `REVOCATION_KIND` is `disabled` or `deleted` (`value-changed` withdrawn).
  `TokenEntry` drops `ref` and `generated` and gains `hosted: boolean` (made by `createHosted`);
  it never carries the value or its digest. A settings item is `{label, enabled, key}`
  (`TokenSettingsItem`).
- **Browser client ids (`AUTHORIZE_EXTENSION`, `DERIVED_AGENT_ID`, K1d):** the approval page asks
  for no id. The agent passes its id as the authorization-request parameter `agent_id`; a client
  that passes none gets `cid-` + the first 16 lowercase base32 characters of SHA-256(client id URL)
  (design §5.5a, R-OA-22). The page binds at once (`PairStore.bindFromPage`); a bound entry entered
  again with the same id reconnects the same principal (`PairStore.reconnectFromPage`), any other
  id is `already-paired`. A reconnect revokes every earlier refresh chain of the entry, from any
  client id URL, with its access tokens and unredeemed codes (`OAuthTokenStore.revokeEntryChains`,
  K1d-6), so only the reconnect's new chain lives. A chain keeps only its newest spent refresh
  record besides its live one (K1d-7): an older spent token is unknown (`invalid_grant`), not reuse. An entry bound on the page refuses `client_credentials` (`invalid_client`),
  so one token never serves two client types (decided item 4). Machine clients and `pair` are
  unchanged: their id is their OAuth `client_id`.
- Limit refusals at the endpoint are a JSON-RPC error body, code -31000 (`ENDPOINT_LIMITS.jsonRpcCode`,
  DECIDED #4: MCP 2026-07-28 makes -32000…-32019 a legacy range new implementations SHOULD NOT
  use), message `limit-exceeded` (413) or `rate-limited` (429), and **no `id` member** [spec: MCP
  2026-07-28 `JSONRPCErrorResponse` has `id` optional, string or integer only, so the JSON-RPC 2.0
  §5 `id: null` is refused by both hosts' clients (`@modelcontextprotocol/core` 2.2.0
  `JSONRPCErrorResponseSchema`); the user's decision 2026-11-14, K1b-EP-13].
- A non-loopback listener over plain http answers 503 `insecure-listener` on every route, after
  the 405 and 403 steps (`REQUEST_GATE.checkOrder`).
- "Per principal" in `ENDPOINT_LIMITS` (the `…PerPrincipal` names stay) is counted per token
  entry (`Caller.entryKey`), so a pair-only caller is limited too (the user's decision,
  2026-11-14, K1b).

### Request gate (`REQUEST_GATE`, `RequestGate`; task K1b)

C-HTTP owns the only `RequestGate` implementation. C-HTTP's MCP route, C-OAUTH (the token
endpoint and both metadata documents) and C-OAUTH-WEB (the approval listener) call it, on the
surfaces `mcp`, `token` and `approval` (`GATE_SURFACE`). It has two methods, so that one MCP request
runs `check` → bearer (401) → `admit` → version → dispatch (design §3.1, PLAT-EP-01; the user's
decision, 2026-11-14):

| Method | When, where | Order | Refusal |
| --- | --- | --- | --- |
| `check(req, surface)` | before authentication, every surface | 405 → 403 → 503 | 405: a listed path with a method it does not serve, `Allow` with its methods, no body; 403: `Host` not allowed or an `Origin` refused by the surface's `ORIGIN_RULE`, no body; 503: `{error: "insecure-listener"}` |
| `admit(req, surface, caller)` | after the bearer check and before the body is read, `mcp` only | 413 → 429 | `ENDPOINT_LIMITS`' JSON-RPC body; a 429 with `Retry-After` |

The user's decisions (2026-11-14) cover: the empty 405/403 bodies; the 503 body; the per-path 405
on the approval listener; the approval listener binding DSH's listener host on its own port, so
both surfaces share host, TLS and `--trusted-host`; and an open listen stream holding no in-flight
slot. A path the surface does not list passes the 405 step only; the 403 and 503 steps still apply,
and its route answers 404. C-WIRE builds the one gate with the listener facts and a clock
(`GateListenerFacts`). An `admit` pass takes one bucket token and one in-flight slot, which `done()`
frees. A 429 for the bucket says when it next holds a token; a 429 for in-flight says
`REQUEST_GATE.inFlightRetryAfterMs` (1 s, PROPOSED). C-HTTP's 429 for the listen-stream cap
(`ENDPOINT_LIMITS.listenStreamsPerPrincipal`) reuses `inFlightRetryAfterMs` and has no value of
its own (K1 amendment after W2, PROPOSED): a stream slot frees as soon as any of the pair's
streams ends. **`admit` runs before the MCP body is read** (K1 amendment after W2), so the
in-flight slot also bounds one entry's concurrent uploads: its 413 judges the declared
`Content-Length` (`AdmitRequest.bodyBytes`); a body with no declared length is read under the
slot, and past `ENDPOINT_LIMITS.bodyBytes` C-HTTP answers the same 413 and frees the slot. The
token endpoint keeps C-OAUTH's own
`RATE_LIMITS` and `FAILURE_LIMIT`, and the approval listener has no `admit`.

### Token-endpoint grants (`GRANT_DISPATCH`, `GrantHandler`; task K1b)

C-OAUTH owns the token endpoint, the dispatch on `grant_type`, `unsupported_grant_type`, the
shared `FailureLimiter` and the `client_credentials` handler. C-OAUTH-WEB supplies
`authorization_code` and `refresh_token` as `GrantHandler {grantType, handle(form, ctx)}` objects,
which C-WIRE registers with C-OAUTH's `GrantRegistry`. A handler returns a token response or an
OAuth error (`invalid_request`, `invalid_client`, `invalid_grant` or `invalid_target`) with
`countedFailure`. C-OAUTH writes the response and records counted failures. The
endpoint answers these itself, before any handler runs: a limited key (429), a secret in the URL, a
repeated parameter, a missing `grant_type`, and a `grant_type` with no handler. Registering a
built-in, duplicate or unsupported grant type throws `TypeError` (PROPOSED).

### Hosts and Origin (`HOSTS`)

Allowed hosts: `localhost`, `127.0.0.1`, `[::1]`, the bind address and DSH's `--trusted-host`
list; anything else is 403 before authentication. Loopback is `http`, every other allowed host
`https`; forwarded headers are never read. Any present `Origin` on DSH's listener routes is 403
(design §3.1: the allowlist is empty); the approval form accepts only its own origin. There is no
Origin setting (DECIDED #60: kept).

### Names and ids (`ID_GRAMMAR`, `NAME_RULES`, `rules.js`)

- Id: `^[A-Za-z0-9_-]{1,64}$`, case-sensitive (`isAgentId`).
- Name: White_Space runs → one space, trimmed, NFC; then 1–64 code points with no `Cc` control
  character and no `Cf` format character (bidi overrides, zero-width and other invisible
  characters; the user's decision, 2026-11-13), else `name-invalid`. U+200D (zero-width joiner)
  is `Cf` too, so an emoji ZWJ sequence such as a family emoji is refused; single emoji are fine
  (`checkName`). The uniqueness key is `nameKey`: lower, upper, then lower case, then NFC (so `Straße` and
  `STRASSE` and `Straẞe` clash). A nameless principal shows as `ID: <id>` with the prefix bold
  (`principalLabel`).

## Naming of durations

A duration's unit is the end of its key name: `…Ms` milliseconds, `…Seconds` seconds, `…Days`
days. Every duration in this module is `…Ms`; the wire's whole-second fields (`expires_in`,
`Retry-After`) are derived from them with `TIME_UNIT.msPerSecond`. Tasks that add durations keep
this rule.

## K decisions with no constant value

Each `K`-flagged case row whose answer is a behaviour rather than a value, keyed by case id.

| Case | Decision |
| --- | --- |
| AUTH-EP-01 row 5 | A token request with no `grant_type` is 400 `invalid_request` [spec: RFC 6749 §5.2, a required parameter is missing], not `unsupported_grant_type`. No access token. |
| AUTH-EP-01 row 6 | A GET on the token endpoint is 405 with `Allow: POST` and no access token (PROPOSED: S7 T7's behaviour). |
| AUTH-ST-04 row 9 | A wrong `code_verifier` (or `redirect_uri`) is 400 `invalid_grant` and does **not** consume the code; the code stays bound by its 60 s life (PROPOSED: S7b's behaviour). A replay of a code already redeemed revokes its chain (R-OA-14). |
| AUTH-DT-08 row 10 | An empty token field on the approval page shows "enter a token" and is **not** counted as a failure toward the rate limit (PROPOSED: S7b's behaviour). |
| AUTH-DT-09 row 4 | After a clash the approval listener retries the bind every `APPROVAL_LISTENER.retryMs` (30 s) while the connector runs, so a freed port is bound again without a restart; a change of the port setting rebinds at once (PROPOSED). |
| NAME-EP-01 rows 11–12 | Name characters are Unicode code points (an emoji is one or more code points as encoded; a ZWJ sequence is refused, `Cf`). A non-string, non-null `name` is refused by the input schema as `invalid-arguments` before `checkName`; `checkName` itself answers `name-invalid` for any non-string. |
| NAME-BVA-01 (K) | Name length counts Unicode code points **after** whitespace collapse, trim and NFC (`checkName`). |
| EVT-EP-02 rows 4–5 | `inbox_ack` with an `eventId` that is not in the caller's mailbox (another pair's included) is `unknown-event`; a wrong `payloadDigest` is `digest-mismatch` (DECIDED #5, #6). All or nothing: one bad receipt acks nothing (DECIDED #61: kept). |
| EVT-ST-01 row 8 | A second ack of an acked event is a no-op success while its receipt is remembered (`MAILBOX.ackedReceiptMs`, 1 day, DECIDED #36: kept), counted in `acked` as 0 (PROPOSED). |
| AUTH-ST-05 rows 10–12c | Withdrawn by K1d (R-OA-23): no chain ends by age, so there is no renewal, no `chainsOf` and no `renewFromPage`. Re-entering a bound token with the same id on the page is a reconnect (`PairStore.reconnectFromPage`, R-OA-22). |
| EVT-UC-01 E2 | A stale cursor names an older `mailboxGeneration`, which only lost or reset mailbox storage starts (DECIDED #W2-1); it gets `{resync: {reason: 'stale-cursor', headSequence}}`, never a silent skip. |
| NAME-ST-01 rows 8–9 | `PairStore.succeed(old, successor)`: in one registry write the old pair is removed and the successor takes its name (a nameless old pair moves none since the 2026-11-21 generated-names decision: the successor keeps its own); `successor-unpaired` and any failure change nothing (R-NAME-07). An unpaired old entry succeeds with nothing changed (DECIDED #W2-2). |
| EVT-ST-01 row 5 | An offer settled by the user keeps its own event pending until acked; the `settlement` that follows is the signal; the offer event is not retired (PROPOSED). |
| EVT-BVA-01 rows 5–6 | `inbox_poll` `limit` must be 1–`MAILBOX.pageMax` (100); 0 and 101 are `limit-exceeded`, never clamped (V2 contract §8: a value outside a limit is `limit-exceeded`). |
| EVT-BVA-02 rows 1–4 | `maxQueuedInputs` = 200 (`QUEUE.maxQueuedInputs`); past it only `QUEUE.refusedTypes` and contributor events are `queue-full`. |
| PLAT-UC-03 (connected) | Connected = an open `subscriptions/listen` stream on `dsh-agent://events` now (`CONNECTED`; design §3.5 amended to match §3.6). |
| AUTH-EP-01 (token form) | A token request that repeats a parameter is 400 `invalid_request` before any grant handler runs [spec: RFC 6749 §3.2, request parameters MUST NOT be included more than once; §5.2 `invalid_request`] (K1b). |
| K1b `GrantRegistry` | Registering a built-in, already-registered or unsupported `grant_type` throws `TypeError`, a wiring bug, as K3's `intercept` (DECIDED #17) (PROPOSED: open for the user's review). |
| PLAT-UC-01 E5 | An `Mcp-Session-Id` header is ignored: the request is served statelessly and no session is created [spec: 2026-07-28 has no protocol sessions; S1 C21]. |
| PLAT-BVA-02 | Body limit `ENDPOINT_LIMITS.bodyBytes` = 8 MiB: at the limit processed, one byte over 413; in-flight one over `inFlightPerPrincipal` 429 (PROPOSED values). |
| PLAT-BVA-01 (K) | Left to FEAT-PEERS: the board's day length and whether 30 d is inclusive are board rules, not part of the MCP surface (the board is shelved, not in 1.0.0-alpha.1). |
| PLAT-DT-02 (K) | Left to F-STATUS: `plugin-set-incomplete` and "rule 4 reports nothing missing" are core's status rules, not part of the MCP surface. |

## Internal module interfaces (`index.d.ts`, types only)

`BearerVerifier` (C-OAUTH → C-HTTP), `TokenRegistry` (C-TOKENS), `PairStore` (C-PAIR; `succeed`, the
atomic succession step of C-SUCCEED's `retire`, R-NAME-07), `Mailbox`
(C-MAILBOX: commit, poll, ack, summary, retire, `retireContributor` for C-EXT, hold, release,
drop, `transfer` for C-SUCCEED, K1d), `SettingsWriter` and `SessionNotes` (C-WIRE binds them for
C-TOKENS-REVEAL, C-REVOKE and C-SUCCEED, K1d), `HintSink` (C-HTTP's listen
streams), `OAuthTokenStore` (C-OAUTH and C-OAUTH-WEB),
`FailureLimiter` (K1a: the token endpoint, the approval page and C-HTTP's bearer check share it),
`Router.recipientFor` (C-ROUTE), `ManagedState` (C-ROUTE, called by C-TOOLS; K1c), `Presence`
(the connected definition), `RequestGate` (C-HTTP;
K1b), `GrantHandler` and `GrantRegistry` (C-OAUTH's seam for C-OAUTH-WEB's grants, wired by
C-WIRE; K1b). The one `OAuthTokenStore` implementation and the one `FailureLimiter`
implementation are C-OAUTH's, durable `putRefresh` included (K1a). C-OAUTH-WEB builds against fakes
of both; C-HTTP against a fake `FailureLimiter`. The one `RequestGate` is C-HTTP's; C-OAUTH and
C-OAUTH-WEB build against fakes of it. The runtime exports are declared there too. Keys are
opaque: `EntryKey`, `PrincipalKey`; no interface carries a token value.

## C-WIRE-2 amendments (2026-11-17)

The user's decisions of 2026-11-16/17, relayed with the task, change these frozen texts. Each row
quotes the K1 text it replaces.

| K1 text (as frozen) | Now | Decision |
| --- | --- | --- |
| tools.js `approval_answer`: "Answer a permission request (or an ask_agent request) by its current offer id." | "Answer a permission request by its current offer id." | "不给ask_agent工具" (no `ask_agent`) |
| README Events: "**An `ask` event** (`ask_agent`) is answered with `approval_answer`" | no producer; `ask` on a permission offer is `invalid-decision`; `choices` omit `ask` | no `ask_agent`; q1 "Refuse it" |
| README Managed state: "**No-recipient `message` queue** (W3 Q-17, K1c-3) …" | withdrawn; NoRecipient is `to-user` / `no-agent` / `dropped` | q5 "Remove agentToken entirely"; no designated default |
| index.d.ts `SettingsWriter.setDesignated(entryKey)`: "Sets `routing.agentToken` (the designated agent)" | withdrawn; the setting `routing.agentToken` is gone | q5 |
| index.d.ts `Router`: "an unmanaged session's (or no session's) `message`, `ask`, `notice` or contributor event to the designated agent" | an event naming no managed session has no recipient | q5 |
| README Connected: "One definition for embed-UI's lights, `ask_agent`'s `unavailable` and the native status" | `ask_agent`'s `unavailable` withdrawn | no `ask_agent` |
| K3 handover.d.ts `HandoverPrincipal.designated` | withdrawn | q5 |
| K3 tokens.d.ts `retire`: succession moves "the designated role" | moves sessions, name, offers and events only | q5 |
| `APPROVAL_LISTENER.headers` `referrer-policy: no-referrer` (S7b; R-OA-11) | `same-origin`: a browser's form POST then carries the page's Origin; `no-referrer` made it `Origin: null`, refused by the gate (X-SEC X-01). No Referer leaves the origin either way | X-SEC X-01 (security audit), the R-OA-11 text needs the same amendment |
| `APPROVAL_LISTENER.headers` `content-security-policy: default-src 'none'; frame-ancestors 'none'` (S7b) | `default-src 'none'; style-src 'sha256-wkX+PGd3j5mohFYHazp5lMQO5mPsM8loy17wNal+3SA='; frame-ancestors 'none'`: the page's one inline `<style>` (src/mcp/oauth-web/page-theme.js `PAGE_STYLE`) is admitted by its hash alone; no `'unsafe-inline'`, no style attribute, no stylesheet route; every other directive is unchanged. The hash moves with every edit of `PAGE_STYLE` | UI-POLISH-D, the user's choice of 2026-11-18 ("hash-pinned inline style") |
| `FAILURE_LIMIT`: "While limited, even a valid credential is refused (S7b P2)" | a valid credential always passes; only a failing one is answered 429 while limited (MCP bearer, token endpoint, approval page). Values and counting unchanged | X-SEC X-03; the user's rule: keep the FAILURE_LIMIT values |
| `shapes.js` `approvalAnswer`: `decision` any APPROVAL_DECISION, optional `question` | `decision` is ANSWER_DECISIONS (no `ask`), no `question` field: an `ask` is `invalid-arguments` at the schema (X-SEC X-02) | q1 "Refuse it" |
| `REFUSAL.empty` (new) | `message_agent`'s empty message, the one DSH-side tool's refusal code (V2's `empty`) | no `ask_agent`; R-CON-08 |
| `QUEUE` comment: "an `ask` waits for an answer like an offer" | `ask` keeps its frozen place in the list, with no producer | no `ask_agent` |
| `prompts_list` (README §Tools, design §4.3): V2 listed "the prompts already showing in other sessions" | only sessions the caller manages, without its own escalations; answering never takes over management | "Agent不能回答不归自己管的会话，只能操作自己管的会话"; q7 |
| V2 `maxPendingApprovals` (DESIGN §16: "Extra requests go straight to you") | no cap: a managed session's request always becomes an offer and waits | "No cap on pending approvals … never refused for being too many" |
| V2 `list_user_messages` (DESIGN §7a.2) | deleted | "list_user_messages is deleted" |
| `grants_list` `paused` (V2: paused while the instance is off) | always `false`: a grant covers while its agent is disconnected | q3 "Still covers" |

Rows that change with them (the case catalogues' owners re-baselined them in this task; the list is
`.runtime/reports/c-wire-2-gap-ports.md`): routing ROUTE-* designated/held/ask rows, PLAT-UC-03
"E1 no D", "E2 ask"; revocation's `askDropped` and clear-designated steps; hosted's designated-role
step; UI's latch reset on the designated agent's loss; contrib's designated recipient; K1d
`setDesignated`; the C-TOOLS approval, question, prompt and grant todos (now real).

## R-FIX-CONNECTOR amendments (2026-11-18, review `review-x-dsh-connector`)

Implementation decisions taken to fix the review's findings. No K1 constant, shape or code changes;
the rows below are behaviour and internal-port contracts the frozen texts left open.

| Text (as built before) | Now | Finding |
| --- | --- | --- |
| grants: an ended grant's failed delete is logged; `grant_revoke` answers `revoked: true` | the grant stops covering and listing at once and is durably marked `ended` before its delete; a failed delete makes `grant_revoke` `operation-failed`, and a repeat by its principal retries it (`revoked: true` once stored); the start sweep deletes a marked record, so it never revives | F01 |
| C-TOOLS session table: checked once, before the DSH lookup | applied again after every DSH await and right before each side effect / before read data is returned; no admitted-call exception (R-TOK-05 is token-only) | F02 |
| grants: a `grant` answer's grant is active once written | written `pending` (covers and lists nothing; `grant_revoke` answers `unknown`) and made active only once its settlement is stored; a pending record is deleted at start | F04 (code review) |
| routing `settle(offerId, settlement)` | `settle(offerId, settlement, {principalKey?})`: a principal's answer settles only while it holds the offer; the offer leaves the ledger only after its settlement is stored (a rejected commit keeps it live and answerable) | F02, F04 |
| hosted `succeededBy`: set just before `PairStore.succeed`, read at start as "committed" | a prepared mark set before anything moves; the old pair's removal is the commit record; at start a committed mark finishes the delete and a prepared one is cleared, for the instance's next `retire` (which completes a half-moved step); a prepared mark never reads as `not-hosted`, which the instance would take as final | F03 |
| routing `onSucceeded(fn)`: fired listener | awaited participant `(from, to) → {undo}`; the grant sweep runs on the managed chain after the step | F05 |
| approval page: a code is minted after the bind's await | only while the entry still stands at the generation the token matched; otherwise the form shows again (`CodeRecord` unchanged) | F06 |
| MCP endpoint: one bearer check before the body | a `subscriptions/listen` is verified again, synchronously with its reservation; a revoked one is 401 `invalid_token` | F07 |
| `approval_answer` reject: needed `risk` (`risk-required`) | needs a non-empty reason only, as §7a.3 and the contract say; one rule shared with `prompt_answer` | F08 |

## CONN-TOOLS amendment (2026-11-18): remove connector-owned questions

The user removes `question_ask` and `question_answer_own` and their exclusive own-card contracts.
`question_answer` remains for forwarded managed-session DSH questions and plan reviews; shared
question/answer validators and generic `settlement.answers` remain. The historical dotted
`question.ask` / `question.answerOwn` design is superseded, not a compatibility surface. This
amendment adds no Fishball arbitrary-question facility ([DESIGN §26](<../../../DESIGN.md#26-v3-conn-tools-remove-connector-owned-questions-2026-11-18>)).
Authorization precedence is unchanged (R-OA-04/R-ID-06): removed-tool calls with pair-only tokens
receive HTTP 403 `insufficient_scope` without effects; full-scope tokens receive unknown-tool -32602.

## MULTI-0 amendment (2026-11-18): server identity

Additive only ([PLAN-MULTI](<../../../docs/planning/v3-multi-dsh.md>) D04–D08, §4.1, §4.3, Q02); no
tool, schema, OAuth, receipt or event changes.

- **`RESOURCE.identity`**: `dsh-identity`, `dsh-agent://identity`, `application/json`; listed by
  `resources/list`, read-only; `resources/read` returns one JSON text content, exactly the MCP
  `Implementation` `{name, version}` (`ServerIdentity`) that `server/discover` advertises, from the
  same live getter.
- **`SERVER_IDENTITY`**: `serverInfo.name` = (`approval.dshName` verbatim if it holds a
  non-white-space character, else `node:os.hostname()`) + `-DSH`, appended once even if the base
  already ends with it; no title, version from the manifest. Carried at
  `result._meta['io.modelcontextprotocol/serverInfo']` ([spec]). No Host/Origin/URL-derived name.
- **Push**: when the effective name changes, `notifications/resources/updated` with
  `{uri: 'dsh-agent://identity'}` and no param beyond the SDK's own `_meta` (its listen subscription id) to every authenticated listen stream subscribed to that URI; an
  unchanged name sends nothing; the events resource is not touched. A listen stream may subscribe
  to both URIs; `CONNECTED` still means the events URI.

## DISCOVERY-TOOLS amendment (2026-11-21): workspaces_list and models_list

Additive. Two full-scope core tools, after `sessions_list`, so an agent can find what
`session_start` accepts instead of guessing. Both take no argument (closed empty input; any argument
is `invalid-arguments`), read DSH at call time, keep no state and send no event.

- **`workspaces_list`** → `{workspaces: [{workspaceId, title, path, available}]}`: every workspace of
  DSH's registry, in its order. `path` is the registry's canonical absolute directory; `available`
  is the same directory check `session_start`'s placement applies (false: that id is refused
  `unknown-session`). Not scoped to managed sessions: a workspace is DSH's, not a session's.
- **`models_list`** → `{models: [{model, provider, providerName, name, reasoningEfforts,
  defaultReasoningEffort?}], defaultModel: {model, reasoningEffort?}, unavailableProviders:
  [{provider, providerName}]}` from `sessionController.modelCatalog()`, the catalog `session_start`
  validates against: `model` is the exact `provider/model` string, `reasoningEfforts` the ids its
  `reasoningEffort` accepts (empty: none). A provider failure's message is not passed on. A catalog
  DSH cannot read is `feature-off`, as for `session_start`.
- `sessions_list` is unchanged: it already gives each managed session's id, title, `workspaceId`,
  `running` and `pendingInteraction`; `workspaces_list` resolves that id to a title and path.

## WAKE-REDUCE amendment (2026-11-21): fewer events, turn-finished carries the report

The user's decisions (2026-11-21): every event a principal receives may wake its agent, so the
connector sends only what no tool result already said. Fishball core batches what remains
(quiet window, max batch, wake/silent classes: fishball-core's own settings).

| Event | Before | Now | Why |
| --- | --- | --- | --- |
| `state` | on every agent status change of a managed session | **not produced** (type kept, no producer) | "running" is the `running` field of `session_start` / `session_message` / `session_redirect`; "idle" is `turn-finished`; `pendingInteraction` duplicates the offers (`permission` / `question` / `plan-review`) |
| `settlement` `by: principal` | after the managing agent's own `approval_answer` / `question_answer` | **not produced** | the tool's result (`accepted`, `grantId`) is that outcome; `by: user` and `by: delegate` settlements are unchanged |
| `turn-finished` | after every `turn/end`, `{sessionId, running, queued}` | once per standstill, `{sessionId, outcome, finalMessage?, stop?}` | it is the end signal and the report in one, so no `session_read` follows it; `running`/`queued` are always false at a standstill |

- **Standstill:** the root session's agent, every subagent of its tree and every background job
  (`ctx.jobs`, `running` / `stopping`) of the tree are idle, with nothing queued. A turn that ends
  while anything still moves reports nothing; the next quiet edge checks again.
- **`outcome: completed`** (last root turn `completed` or `max-tokens`): `finalMessage` is the root's
  last assistant text, at most `TURN_FINISHED.finalMessageBytes` (4096) UTF-8 bytes including the
  `TURN_FINISHED.truncationMarker` when cut (`truncated: true`).
- **`outcome: stopped`**: any other end (an error, the user's Stop, a hook, an interruption, a
  plugin's stop such as the watchdog's); `stop = {kind, message}` says why.
- **The manager's own stop** (`session_stop`, the cancel of `session_redirect`) reports nothing.
  Since the user's decision of 2026-11-21 it stops the whole session tree: the root's running turn,
  every running subagent (cancelled as DSH cancels a subagent with its parent) and every running
  background job of the tree (killed), so the session truly stands still. That standstill, the
  short no-op turns the stopped work's own settlement notices would start, and a root turn end that
  was still held behind the running tree all report nothing; the next real turn reports as usual.
  A plugin's stop (`dshConnectorSessions.stop`, e.g. the watchdog's) keeps DSH's Stop-button
  meaning (the root's turn only) and is reported.
- `session_start.running`, `session_message.running`, `session_redirect.running` (required): whether
  the session runs right after the delivery.

## Left to a task (not frozen here)

| What (case rows flagged `K`) | Task |
| --- | --- |
| which `notice` codes exist (EVT-EP-01 15) | C-WIRE, as a K1 amendment; C-ROUTE produces none (K1c-4) |
| card fields of the ask card (PLAT-UC-07) | K3 |
| `dshConnectorHandover` codes, dropdown order (HAND rows 1-E1, 7a, 8, 144); release emits nothing (HAND-ST-01 row 5) is K1c-2; release by another principal is `forbidden` (HAND-ST-01 row 9) is K1c-1 | K3 / C-ROUTE |
| `dshConnectorTokens`, hosted status codes (08-hosted) | K3 / I-HOST |
| interceptor priority range (EVT-DT-02 7) and core's interception (EVT) | K3 / F-INTERCEPT |
| core's target status reporting (09 rows 74, 103); the codes are frozen above | F-LINK / F-STATUS |
| `plugin-set-incomplete`, board 30 d edge (11-platform; the board is shelved, not in 1.0.0-alpha.1) | F-STATUS / FEAT-PEERS |
| embed-UI rows (10-embed-ui-matrix) | U-SHELL / U-MARKS / U-RECORDS |
| the `dsh-mcp-client` adapter | C-MCP-ADAPTER (S7c) |

## User decisions

The user's decisions on the PROPOSED values of K1, K2 and K3 (relayed by Fishball), by item number.
This is the one record: `DECIDED #n` (or `DECIDED Dn`) in any of the three contracts points here.
Every other value marked PROPOSED is still open. Rows D1–D6 are values the W2 tasks proposed
locally, and D7 is where those values live; they moved into their contracts unchanged (the
constants migration, 2026-11-14).

| # | Value | Decision |
| --- | --- | --- |
| 1 | `OAUTH_ERROR.temporarilyUnavailable` with 429 at the token endpoint | kept (2026-11-14) |
| 4 | `ENDPOINT_LIMITS.jsonRpcCode` | changed from -32000 to -31000: MCP 2026-07-28 makes -32000…-32019 a legacy range (2026-11-13) |
| 5, 6 | `REFUSAL.unknownEvent`, `REFUSAL.digestMismatch` | kept (2026-11-14) |
| 18 | `LIFETIME.refreshChainMaxMs` | changed from 30 to 365 days (2026-11-13); **reversed** by requirements 1.32 R14 (2026-11-16): no chain cap, the value and the renewal withdrawn (K1d) |
| 19 | the failure key: (address, client id), an MCP bearer by address alone | kept, no relaxing (2026-11-13) |
| 21 | 10 failures per key per minute (`FAILURE_LIMIT.perKeyPerWindow`) | kept, no relaxing (2026-11-13) |
| 36 | `MAILBOX.ackedReceiptMs` 1 day | kept (2026-11-13) |
| 60 | no Origin setting (`HOSTS`) | kept (2026-11-13) |
| 61 | `inbox_ack` all or nothing | kept (2026-11-13) |
| 7 | K2 `EMIT_REFUSAL.contributorUnidentified`, `.namespaceReserved` | kept (2026-11-14) |
| 8 | K2 `SHARED_CODES` as a closed list | kept (2026-11-14) |
| 9 | K2: declared `limits` must be integers | kept (2026-11-14) |
| 10 | K2: a non-boolean annotation hint is `tool-invalid` | kept (2026-11-14) |
| 44, 45 | K2 `QUARANTINE` | changed from more than 2 of the last 5 to more than 4 of the last 10, because recovery is manual (2026-11-13) |
| 11 | K3 `handOver`: an unknown, deleted, disabled or unpaired principal is `no-agent` | kept (2026-11-14) |
| 12 | K3 `takeBack` drops V2's `is-fishball` and `feature-off` | kept (2026-11-14) |
| 13 | K3 `RetireRefusalCode` | kept (2026-11-14) |
| 14 | K3 `CreateHostedErrorCode` | kept (2026-11-14) |
| 15, 16 | K3 `AdmitErrorCode` `hostname-refused`, `not-ready` | kept (2026-11-14) |
| 17 | K3 core contracts: an invalid `intercept` registration throws `TypeError` | kept (2026-11-14) |
| W2-1 | `mailboxGeneration` (`MAILBOX`) | changes only when mailbox storage is lost or reset; delete, hold expiry and re-enable keep it (2026-11-14, K1 amendment after W2) |
| W2-2 | `PairStore.succeed` with an unpaired old entry | succeeds and changes nothing: there is no principal and no name to move (2026-11-14, K1 amendment after W2) |
| W3-1 | `Mailbox.retire` | resolves `{retired: boolean}` instead of `void`; C-ROUTE sends a fresh `retirement` on `false` (fixes W2 finding SF3, the ack/retire race) (2026-11-15, K1 amendment at the W3 merge) |
| W3-2 | K2 `EXTERNAL_NAME` | a contributed tool's external (model-facing) name replaces every `.` of its public name by `__` (`ns.tool` → `ns__tool`); defined once in K2 and imported (2026-11-15, K2 amendment at the W3 merge) |
| W3-3 | K3 `PrincipalRef.key` / `HandoverPrincipal.key` | "stable for the life of the token entry" holds from pairing onward; an unpaired entry's key changes once, when it pairs (2026-11-15, K3 note at the W3 merge) |
| D1 | K3 `PRESENT_RETRY` (core contracts): 3 attempts, 1000 ms, factor 2 (waits 1 s, then 2 s) | kept (numeric; delegated to Fishball, 2026-11-14) |
| D2 | K3 `LEDGER.finishedRetentionMs`: 30 days | kept (numeric; delegated to Fishball, 2026-11-14) |
| D3 | K3 `INTERCEPT.defaultPriority`: 0 | kept (numeric; delegated to Fishball, 2026-11-14) |
| D4 | K3 `LINK_BACKOFF`: 1 s, factor 2, at most 60 s | kept (numeric; delegated to Fishball, 2026-11-14) |
| D5 | K1 `TARGET_CODE.insecure` / `.invalid` (`target-insecure`, `target-invalid`), also in K3 `TargetCode` | kept; decided by Fishball under the user's rule 0mwexcc0, not the user's own choice (2026-11-14) |
| D6 | K3 `TEXT.presentGivenUp`: the notice for an event core could not present | kept; decided by Fishball under the user's rule 0mwexcc0, not the user's own choice (2026-11-14) |
| D7 | Runtime owners: K1 for `TARGET_STATE`, `TARGET_CODE`, `LINK_REFUSAL`; K3 core `contracts/constants.js` for the interception, link-backoff and guard values | decided by Fishball under the user's rule 0mwexcc0, not the user's own choice (2026-11-14) |
| K1c-1 | `ManagedState` (`managerOf`, `managed`, `manage`, `release`, `onChange`) and `MANAGED_REFUSAL`: root session ids as keys; `unknown-session` stays the caller's (C-TOOLS); Hand over and Take back stay K3's; durable, serial (first wins), visible to `managerOf` once a change resolves, a throwing listener does not stop the others | decided by Fishball, not the user (2026-11-14) |
| K1c-2 | W3 Q-16: `session_release` commits no event of its own (no release event); its only events are the retirements of its live offers (`released`, to the releasing pair), which C-ROUTE's `release` performs; the offers then go to the user | decided by Fishball, not the user (2026-11-14) |
| K1c-3 | W3 Q-17: the no-recipient `message` queue: held while no paired entry is designated; durable, bounded by `maxQueuedInputs` with `queue-full`, flushed in order once a paired entry is designated (connected or not); what does not fit stays queued in order; while it is not empty a new message joins its end; never dropped once accepted | decided by Fishball, not the user (2026-11-14); **withdrawn** by the user's q5 (2026-11-17, C-WIRE-2) |
| K1c-4 | No `notice` code is frozen: `NOTICE.codes` stays empty, and C-ROUTE produces none | decided by Fishball, not the user (2026-11-14); **amended** 2026-11-21 by the user's decision "Keep it open, send the answer later": `NOTICE.codes.questionCallEnded` (`question-call-ended`), produced by the question domain; C-ROUTE still produces none |
| K1d-1 | `Mailbox.transfer(from, to) → {moved}`: every pending event (held ones included) moves in order with its `eventId` and payload digest, renumbered in the new box; nothing committed; misuse is a synchronous `TypeError`. PROPOSED details: moved events follow the destination's own, `maxQueuedInputs` never refuses one, the destination's streams get the hint when `moved > 0` | decided by Fishball, not the user (2026-11-16; W4 briefs G3) |
| K1d-2 | `Mailbox.retire` misuse (bad principal key, event id or reason) stays a synchronous `TypeError` before the call is queued | decided by Fishball (open-questions decided item 45, 2026-11-16) |
| K1d-3 | `SettingsWriter` (`addToken`, `removeToken`, `setDesignated`) and `SessionNotes.system`: connector-internal ports C-WIRE binds; a write resolves after the save and the registry's sync. PROPOSED details: writes run in call order; `removeToken` of an absent key is a no-op; `system` rejects for an unknown session | decided by Fishball, not the user (2026-11-16; W4 briefs G3) |
| K1d-4 | The page id follows design §5.5a and R-OA-22 (1.33 Q-A1 B, Q-A2 A): the page binds at once with the passed `agent_id` or the derived `cid-` id (`bindFromPage`), and a same-id return reconnects (`reconnectFromPage`). This supersedes W4 briefs G3 item 6's earlier model (`pair` with an id for a browser client, `claimFromPage`, a claimed entry pair-only until `pair`) and open-questions decided items 2, 3 and 5. G3 item 6's K3a `importToken` is void (plan §5) and the locator `reconnect()` is not K1's (Reconnect is on the instance's page, Q-D1) | decided by Fishball from the design (2026-11-16) |
| K1d-5 | `reconnectFromPage` of an unpaired entry throws `TypeError` (a caller bug); `RefreshRecord.chainStartedAt` is withdrawn with the chain cap (no V3 store has shipped, decided item 44); `DERIVED_AGENT_ID` hashes the UTF-8 `client_id` as received and base32-encodes the raw digest, unpadded | decided by Fishball, PROPOSED (2026-11-16) |
| K1d-6 | A page reconnect revokes the principal's older refresh chains, from the same client id URL and from others, with their access tokens and unredeemed codes, before its new code is minted (`OAuthTokenStore.revokeEntryChains`); a first bind and an `already-paired` revoke nothing; chainless (machine) access tokens are kept | decided by Fishball, not the user (2026-11-16; C-PAGE-ID review) |
| K1d-7 | Refresh records stay bounded with no chain cap: per chain the store keeps only the newest spent record and the live one, pruning older spent records at each rotation. The newest spent token is still reuse (it revokes the chain after the grace window); an older one is unknown (`invalid_grant`, the chain lives) | decided by Fishball, not the user (2026-11-16; C-PAGE-ID review) |
| W4b-2 | `sessions_list` and `session_read` describe what they already enforce (C-TOOLS, Fishball's Q4): only sessions the caller manages; an unmanaged session and another principal's are `forbidden` to read. The user's answer (2026-11-16, REMOVE-V2 gap check item 4, the stricter option) confirms it | the user (2026-11-16) |
| W4b-1 | `READ_ROLE`: `session_read`'s message roles are V2's ROLE with `fishball` renamed `principal` (requirements 1.41 Q-G8 = B); `Mailbox.stage` / `StagedTransfer`, C-MAILBOX's staged transfer that C-SUCCEED's succession uses, is frozen as built (index.d.ts) | the user (Q-G8); `stage` decided by Fishball (2026-11-16, C-WIRE) |

## Departure from the specification

Exactly one (Q-SPEC-1 A): the authorization server and the approval page are plain HTTP on
loopback. Every non-loopback host is HTTPS, directly or through the user's tunnel (R-OA-08).
