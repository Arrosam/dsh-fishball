# `fishball-connector` contract, version 1.0

Status: **frozen v1 (K1, 2026-11-06)**. Source of the decisions: `docs/slim-native-design.md` §0.2,
§0.4, §0.7, §5 and §18 (K1). Items marked **pending user confirmation** may still change before
the connector ships.

This contract is what a Fishball **instance** implements to drive DSH sessions through the
**connector** (`fishball-connector`, the plugin row `fishball` in the main DSH profile). The
built-in instance (`fishball-instance`) is one implementation. A third-party instance needs only
this document and the connector's `./contract` export (today `src/connector/contract.js`).

Contents: 1 binding · 2 versions · 3 frames (envelope v2) · 4 operations · 5 events ·
6 vocabularies · 7 errors · 8 limits · 9 no-instance behaviour · 10 module index · 11 open points.

## 1. Binding: the `fishballConnector` service

The connector row provides the DSH service **`fishballConnector`** (`CONNECTOR_SERVICE`) when it
is applied, whether or not an instance exists. An instance is any plugin in the **same main
profile** that injects the service (an optional `ctx.inject` sub-scope, so a missing connector
never fails the boot) and calls:

```js
const handle = fishballConnector.attachInstance({
  id,                                        // non-empty string; stable instance id
  name,                                      // non-empty string; display name
  contract: { id: 'fishball-connector', major: 1, minor },   // minor: whole number
  transport: { send(string), onMessage(fn), onClose(fn), close() },
  ui?: { chat?: path, settings?: path },     // same-origin absolute paths (§1.2)
  status?: () => ({ state, code }),          // shown by the connector's opener
  retry?: () => Promise<void>,               // the opener's Retry action
})
handle.detach()                              // back to no-instance mode
```

### 1.1 Descriptor fields

| Field | Required | Rule | Refusal |
| --- | --- | --- | --- |
| `id` | yes | non-empty string | `instance-invalid` (pending, §11) |
| `name` | yes | non-empty string | `instance-invalid` (pending) |
| `contract` | yes | exactly `{id, major, minor}`; `id` is `fishball-connector`; `major` is `1`; `major` and `minor` are whole numbers | `contract-version` |
| `transport` | yes | an object with the four functions `send`, `onMessage`, `onClose`, `close` (`TRANSPORT_METHODS`) | `transport-invalid` |
| `ui` | no | exactly the optional keys `chat` and `settings`; each value obeys §1.2 | `ui-invalid` |
| `status` | no | a function; returns `{state, code}`, where `state` is a `STATUS` value and `code` a `STATUS_CODES` value or `null` | `instance-invalid` (pending) |
| `retry` | no | a function returning a promise | `instance-invalid` (pending) |
| any other key | — | refused | `instance-invalid` (pending) |

`transport` is the instance's end of one message channel. `send(string)` sends one encoded frame
to the connector's peer, `onMessage(fn)` delivers each frame the instance sends, `onClose(fn)`
reports the channel's end, and `close()` ends it. `onMessage` and `onClose` may return a
disposer, which the connector calls when the channel ends. The connector never sends before the
instance's handshake (§3.2).

### 1.2 `ui` paths

A `ui.chat` or `ui.settings` value is accepted only when all of these hold:

- it is a string of at most **512 characters** (`LIMITS.uiPathChars`, counted in Unicode code
  points): 512 is accepted, 513 is refused;
- it starts with **exactly one** `/` (`/x` yes; `x`, `./x` and `//host` no);
- it carries no scheme and resolves to the main DSH's own origin. `http://…`, `/\host`, and a path
  that a URL parser reads as another host after dropping a tab or newline are refused;
- its query has no `token` parameter (`?token=…` anywhere in the query). `token` is DSH's own
  launch-token parameter, and a credential must never be in an iframe's address.

A fragment (`/fishball/embed/#x`) is accepted (pending, §11). The built-in instance registers
`{chat: '/fishball/embed/', settings: '/fishball/embed/?view=settings'}`.

### 1.3 Attach outcomes

The connector checks in this fixed order, so one descriptor has one answer:

1. the descriptor is a plain object with only the keys of §1.1 (`instance-invalid`);
2. `contract`, by the version rules of §2 (`contract-version`);
3. `transport` (`transport-invalid`);
4. `ui` (`ui-invalid`);
5. `id`, `name`, `status` and `retry` (`instance-invalid`);
6. the connector already has an instance (`instance-busy`).

| Has an instance | Major matches | `ui` valid | Transport complete | Outcome |
| --- | --- | --- | --- | --- |
| no | yes | yes (or absent) | yes | attached; returns `{detach()}` |
| any | no | any | any | `contract-version` |
| any | yes | any | no | `transport-invalid` |
| any | yes | no | yes | `ui-invalid` |
| yes | yes | yes | yes | `instance-busy` |

A refused attach throws a `ContractError` whose `code` is the refusal. It has **no side effect**:
no transport method is called, nothing is stored, and an attached instance stays attached.

**One instance at a time.** `detach()` and the transport's `onClose` both return the connector to
no-instance mode (§9). A restart of an instance is a detach followed by a new attach.

## 2. Versions

- The contract id is `fishball-connector`. This document is **1.0**: `CONNECTOR_CONTRACT =
  {id: 'fishball-connector', major: 1, minor: 0}`.
- **A different major is refused** (`contract-version`), lower or higher. A different id is refused
  the same way.
- **A minor only adds.** A new minor may add operations, events or optional payload fields, and
  each addition is advertised as a capability in the handshake (§3.2). It never removes or renames
  a name, changes a field's type, or makes an optional field required. So any minor of major 1 is
  accepted, lower, equal or higher.
- `negotiateContract(contract)` performs the check `attachInstance` uses. It returns the common
  version `{id, major: 1, minor: min(instance minor, connector minor)}` or throws
  `contract-version`. The minor is informational: the handshake decides which operations each side
  uses.
- **Capabilities.** A capability that the receiver does not know, in a peer's `capabilities`
  list, is ignored (a newer minor's optional addition). An unknown **required** capability is
  refused with `unsupported-capability`.
- A breaking change needs major 2, and both sides keep the version check.

## 3. Frames: envelope v2

### 3.1 Envelope

Every frame over `transport` is one JSON text of exactly seven keys (`ENVELOPE.keys`):

| Key | Value |
| --- | --- |
| `version` | `2` (`ENVELOPE.version`); any other value is `unsupported-version` |
| `hostId` | the main host's id; a frame from another host is `wrong-host` |
| `sessionId` | the target session for a session-scoped operation (§4), equal to the payload's `sessionId`; otherwise `null`. Events carry the session they are about. Errors carry `null` or the request's session. |
| `requestId` | non-empty string, unique per request on one connection. A response or error echoes it. |
| `type` | `request`, `response`, `error` or `event` (`ENVELOPE.type`) |
| `operation` | `handshake`, an operation name (§4) or an event name (§5) |
| `payload` | the operation's payload; an error's payload is exactly `{code}` (§7) |

The rules for every payload:

- Every payload is validated with **exact keys**: a missing required key or an unknown key
  rejects the frame.
- Objects are plain data objects; accessors, symbol keys and array holes are refused.
- A text field marked "non-empty" refuses `''`. Character caps count Unicode code points; byte caps
  count UTF-8 bytes.
- Times (`at`, `since`, `expiresAt`, `lastUsedAt`) are epoch milliseconds, whole numbers ≥ 0.
- Frame size: at most `LIMITS.envelopeBytes` (1 MiB). An `attachment.put` request and an
  `attachment.read` response may be up to `LIMITS.attachmentEnvelopeBytes` (8 MiB).
- Direction is enforced: an instance sends instance-to-connector requests and receives
  connector-to-instance requests and events. A frame in the wrong direction is `forbidden`.
- A frame that fails validation closes the channel; the receiver does not guess what it meant.
  An operation's refusal is an ordinary `error` frame.

Envelope helpers: `makeEnvelope`, `encodeEnvelope` (validates and bounds), `decodeEnvelope`
(bounds before parsing, then validates) and `validateEnvelope`. The payload validators are
`validateRequest`, `validateResponse` and `validateEvent`; `VALIDATORS` indexes them by type and
name. The roles are `SIDE` (`child` = the instance, `main` = the connector) and `DIRECTION`
(`child-to-main`, `main-to-child`). Every event takes `EVENT_DIRECTION` (`main-to-child`).

### 3.2 Handshake

The instance opens the channel with one request with `operation: 'handshake'` and
`sessionId: null`:

| Payload | Rule |
| --- | --- |
| request `{capabilities, requiredCapabilities}` | unique non-empty names; `requiredCapabilities` ⊆ `capabilities`; each required name is a §4 operation the receiver knows |
| response `{capabilities, hostInstanceId}` | the operations the connector serves now; `hostInstanceId` is a non-empty string, new for each connector object |

`capabilities` lists the operations the instance **serves** (at least `inbox.push`) and the ones
it **requires**. If the connector cannot serve every required one, it answers
`unsupported-capability`. Before the handshake, any other request is answered
`handshake-required`, and a second handshake on one channel is `conflict`. The connector's
welcome lists only operations it serves; a request for an operation outside the welcome is
`unsupported-operation`. `requireCapabilities(available, required)` is the shared check.

### 3.3 Requests and replies

- One `requestId` has one terminal reply. A repeat of a request whose reply is already settled
  gets the remembered reply, never a second delivery. A repeat while the first is still running is
  `duplicate-request`. The same id reused for a different operation, session or payload is
  `conflict`.
- Nothing is retried. A request that times out is answered `timeout` and the channel closes, so a
  late success cannot be mistaken for a retryable failure.
- After a reconnect, the instance starts again with a fresh handshake. Unacknowledged
  `inbox.push` items are delivered again, unchanged (§4.6).

## 4. Operations

"Scoped" means the envelope's `sessionId` equals the payload's `sessionId`; "–" means the
envelope's `sessionId` is `null`. `?` marks an optional key.

### 4.1 Sessions (instance → connector)

| Op | Scoped | Request | Response | Refusals and notes |
| --- | --- | --- | --- | --- |
| `session.list` | – | `{limit, workspaceId?}`; `limit` 0–100 (`LIMITS.sessionsListed`) | `{sessions:[{sessionId, title, workspaceId (string or null), running, pendingInteraction}]}`, at most 100 | related sessions only (managed, watched, messaged by, forwarded) |
| `session.start` | – | `{folder, title, message, attachments[], model?, reasoningEffort?, notifyWhenFinished?}` | `{sessionId, managed, titleError?, workspaceError?, watchId? or watchError?}` | the folder must exist as a workspace or an absolute directory; never creates folders |
| `session.message` | yes | `{sessionId, message, attachments[], notifyWhenFinished?}` | `{status, watchId? or watchError?}`; `status` is `delivered` or `unconfirmed` (`DELIVERY`) | managed session; an `unconfirmed` delivery is never retried |
| `session.redirect` | yes | `{sessionId, message, attachments[]}` | `{status}` | managed session; runs after a cancel; sets no watch |
| `session.stop` | yes | `{sessionId, reason?}` | `{stopped: true}` | managed session |
| `session.read` | yes | `{sessionId, maxMessages, maxBytes}` (whole numbers) | `{messages:[{seq, role, author, text, images[]}], truncated}` | related session; the connector cuts the reply to fit and reports `truncated` |
| `session.watch` | yes | `{sessionId, mode}`; `mode` from `WATCH_MODE` | `{watchId}` or `{watchError}` (`WATCH_ERROR`) | related session |
| `session.watches` | – | `{}` | `{watches:[{watchId, sessionId, mode, status}]}`; `status` from `WATCH_STATUS` | — |
| `session.unwatch` | – | `{watchId}` | `{ok: true}` | — |
| `session.release` | yes | `{sessionId, reason}`; `reason` ≤ 500 chars | `{sessionId, managed: false}` | `unknown-session`, `is-fishball`, `not-managed`, `feature-off` |

`notifyWhenFinished: true` makes the connector set up the watch itself, with the target's
watermark read **before** the delivery, so a turn that ends at once is still reported. The result
then carries `watchId` or `watchError`, never both. A refused watch never undoes the message.

`attachments` holds the `hostRef`s from `attachment.put` (§4.5): at most 20
(`LIMITS.attachmentsPerMessage`), unique, each consumed once. `title` and `message` may be empty
strings. `folder`, `model` and `reasoningEffort` are non-empty.

### 4.2 Approvals and questions (instance → connector)

| Op | Scoped | Request | Response | Refusals |
| --- | --- | --- | --- | --- |
| `approval.list` | yes | `{sessionId}` | `{approvals:[descriptor]}` (§5.1), unique `approvalId` | managed session |
| `approval.answer` | yes | `{sessionId, approvalId, offerId, answer:{decision, risk?, reason?, question?, grant?}}` | `{accepted: true}` or `{accepted: true, grantId, expiresAt}` | `expired`, `conflict`, `risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete`, `question-required`, `grant-invalid`, `prefix-not-shell-tool`, `prefix-empty`, `prefix-not-in-call`, `expires-at-required`, `expires-at-invalid`, `expires-at-past` |
| `question.answer` | yes | `{sessionId, questionId, answers?, approve?, feedback?, toUser?, note?}`, with at least one of the five | `{accepted: true}` | `expired`, `mode-user`, `bad-answer`, `already-settled`, `session-not-live` |
| `question.ask` | – | `{sessionId, questions[]}`; `sessionId` is the instance's own session (the card's author) | `{questionId}` at once; the card has no deadline | — |
| `question.answerOwn` | – | `{questionId, answers[]}` | `{accepted: true}` | `expired`, `bad-answer` |

The **`answer` of `approval.answer`** has these fields:

- `decision` is a `DECISION` value: `allow`, `grant`, `reject`, `ask` or `escalate`.
- `risk` is a `RISK` value (`low` or `high`). `reason` is at most 500 characters.
- `question` is allowed only with `ask`, at most 500 characters.
- `grant` is allowed only with `grant`, as `{kind, prefix?, expiresAt}`:
  - `kind` is a `GRANT_KIND` value (`exact` or `prefix`);
  - `prefix` is present only for `prefix`, non-blank, at most 512 characters;
  - `expiresAt` must lie in the future.

The connector applies its decision rules: allow and grant need low risk and a reason, reject
needs a reason, and ask needs a question.

The **`answers`** of `question.answer` and `question.answerOwn` are `[{id, selected[], custom?}]`:

- 1–32 items (`LIMITS.questionsPerRequest`), with unique `id`s;
- `selected` holds unique labels, at most 32 (`LIMITS.selectedLabelsPerAnswer`), each at most 200
  characters, copied from that question's options;
- `custom` is at most 500 characters.

A plan review answers with `approve` (boolean) and `feedback` (at most 500 characters) instead.
`answers` cannot be combined with `approve` or `feedback`. `toUser: true` sends the question to
the user, and `note` (at most 500 characters) adds the instance's note.

The **`questions[]`** of `question.ask` and of a question descriptor hold 1–32 items, each
`{id, question, detail?, header?, options?, multiSelect?, intent?}`:

- `id` is unique; `question` is at most 500 characters; `header` at most 200;
- `options` are `[{label, description?}]`, with each `label` at most 200 characters;
- `intent` is `{kind: 'plan-review' (PLAN_REVIEW), approve, callId?}`, where `approve` is the
  label that approves.

### 4.3 Frozen prompts and grants (instance → connector)

| Op | Scoped | Request | Response | Refusals |
| --- | --- | --- | --- | --- |
| `prompt.list` | – | `{}` | `{prompts:[{promptId, sessionId, title, toolName, argumentsStatus, since, managed}]}` | — |
| `prompt.answer` | yes | `{sessionId, promptId, decision, reason, risk?}`; `decision` is `allow` or `reject` (`PROMPT_DECISIONS`) | `{promptId, decision, managed}` | `expired`, `invalid-decision`, `risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete` |
| `grant.list` | – | `{}` | `{grants:[{grantId, sessionId, toolName, kind, prefix?, expiresAt, uses, lastUsedAt?, paused}]}` | — |
| `grant.revoke` | – | `{grantId, reason}` | `{grantId, revoked: true}` | `reason-required`, `unknown`, `ended` |

### 4.4 Settings (instance → connector), new in connector v1

| Op | Scoped | Request | Response | Refusals |
| --- | --- | --- | --- | --- |
| `settings.describe` | – | `{}` | `{revision, fields:[field]}` | — |
| `settings.update` | – | `{revision, values:{key: value}}` | `{revision}` | `settings-conflict`, `settings-invalid` |

**`settings.update` is pending user confirmation:** whether *any* attached instance may change the
connector's limits through it. The operation is defined and validated in v1; the connector may
withhold it from its welcome until the user decides (it then answers `unsupported-operation`).

`settings.describe` returns every connector setting: each limit in the connector's config, the
question mode, the brand icon and the sidebar entry (design §0.7). `revision` is a whole number,
the connector's counter for optimistic concurrency. Each field has this shape:

| `kind` (`SETTING_KIND`) | Field keys | Admitted values |
| --- | --- | --- |
| `number` | `{key, kind, value, default, min?}` | a whole number, at least `min` if present |
| `enum` | `{key, kind, value, default, options}` | one of `options` (a non-empty list of unique strings) |

Keys are unique and non-empty. `value` and `default` are always admitted by the field itself. A
number field carrying `options`, or an enum field carrying `min`, is refused.

`settings.update` is **all-or-nothing**. The connector refuses the whole update, and writes
nothing, when:

- `revision` is not the current revision: `settings-conflict`. This is checked first, so values
  edited against an old description are never judged against a new one;
- any key is unknown, or any value has the wrong kind, is below `min` or is not an option:
  `settings-invalid`.

The frame check is shape only (`revision` is a whole number and `values` a plain object), so a bad
value is an `error` reply and never closes the channel. `checkSettingsUpdate(description,
payload)` is the shared semantic check. On success the response carries the new revision.

### 4.5 Attachments (instance → connector)

| Op | Scoped | Request | Response | Refusals |
| --- | --- | --- | --- | --- |
| `attachment.read` | yes | `{sessionId, attachmentId}` | `{attachmentId, mediaType, total, sha256, chunks[]}` | `not-referenced` (the session's log does not reference the image), `too-large` |
| `attachment.put` | – | `{transferId, total, sha256, mediaType, chunks[], name?}` | `{hostRef, expiresAt}` | `too-large` |

The transfer rules:

- `chunks` are canonical padded base64 strings, each decoding to at most 512 KiB
  (`LIMITS.chunkBytes`); their decoded sizes sum to `total`.
- `sha256` is 64 lowercase hex characters (`DIGEST`), and the receiver recomputes it.
- An image `mediaType` must be one of `IMAGE_TYPES` (`MEDIA`: `image/png`, `image/jpeg`,
  `image/webp`, `image/gif`) and at most 4 MiB (`LIMITS.imageBytes`). Any other media type
  travels as a file inside the 8 MiB frame.
- `name` is a display name with no NUL, no `/` or `\` and no `://`.
- One transfer per message (`LIMITS.transfersPerMessage`).
- A `hostRef` is single-use and expires 10 minutes after the put (`LIMITS.hostRefTtlMs`).

### 4.6 Inbox (connector → instance)

| Op | Scoped | Request | Response |
| --- | --- | --- | --- |
| `inbox.push` | – | `{messageId, kind, sourceSessionId, text, images[], dedupeKey, at}`; `kind` from `INBOX_KIND` | `{acked: true}` |

`inbox.push` carries what reaches the instance:

- a message a managed session sent to Fishball (`session`);
- a hand-over note (`user`: the user's own words);
- a managed-session change (`system`);
- a watch notice (`watch`);
- a request waiting for Fishball (`approval`);
- a plugin event (`plugin`).

The connector's intake ledger is the durable queue. An item stays pending until acknowledged, and
after a reconnect it is pushed again unchanged with the same `dedupeKey`. The instance acks only
after it has queued the turn, and drops a `dedupeKey` it has already delivered. An instance that
cannot take an item answers with an error, and the item stays queued.

Some `system` items carry a marker in `text` (`inbox-markers.js`, §10):

| Item | Text |
| --- | --- |
| `QUESTION_ANSWER` | `[question answer <id>] <words>` |
| `CARD_CLOSED` | `[card closed <id>] <reason>` |
| `RECORD_ITEM` | `[card record] <JSON>`; the JSON is the `CARD_RECORD` v1 record, type `plugin:fishball/card-record` (`card-record.js`, §10) |

`images[]` items are `{attachmentId, mediaType, width, height, bytes}` (metadata only):

- at most 20 per message (`LIMITS.imagesPerMessage`);
- `width × height` ≤ 4,194,304 (`LIMITS.imagePixels`);
- `bytes` ≤ 4 MiB.

The bytes are fetched with `attachment.read`.

## 5. Events (connector → instance)

| Event | Payload |
| --- | --- |
| `approval.request` | the descriptor below |
| `approval.settled` | `{approvalId, decision, by}`; `by` from `SETTLED_BY` (`user` or `fishball`) |
| `approval.ran` | `{approvalId, via, by, toolName, reason, at, argumentsStatus, arguments?}`; `via` from `RAN_VIA` (`pass` or `grant`) |
| `watch.status` | `{watchId, status:{state, lastSequence}}`; `state` from `WATCH_STATE` |
| `session.state` | `{sessionId, running, pendingInteraction}` |

### 5.1 Approval descriptor

The descriptor is used by `approval.list` and `approval.request`:

`{approvalId, offerId, kind, prompt, choices[], expiresAt, title, at, toolName, callId, reason,
quotes[], arguments?, argumentsStatus?, questions?}`

- `kind` is a `APPROVAL_KIND` value: `approval` or `question`. A `question` must carry
  `questions[]` (§4.2) and answers with `question.answer`; an `approval` answers with
  `approval.answer`.
- `choices` are unique non-empty strings.
- `title` is at most 200 characters, `reason` at most 500.
- Each of `quotes` is at most 2,048 bytes (`LIMITS.quoteBytes`).
- `callId` is a string, or `null` when the request names no tool call.
- `arguments` (at most 2,000 characters, `LIMITS.argumentChars`) and `argumentsStatus`
  (`ARGUMENTS_STATUS`: `complete`, `truncated`, `unavailable`) come both or neither.

A reconnect is a clean slate for offers: after each ready handshake the connector offers the live
requests again with a current `offerId`.

## 6. Vocabularies

| Name | Values |
| --- | --- |
| `DELIVERY` | `delivered`, `unconfirmed` |
| `ROLE` | `user`, `assistant`, `fishball`, `agent`, `context` |
| `DECISION` | `allow`, `grant`, `reject`, `ask`, `escalate` |
| `PROMPT_DECISIONS` | `allow`, `reject` |
| `RISK` | `low`, `high` |
| `GRANT_KIND` | `exact`, `prefix` |
| `APPROVAL_KIND` | `approval`, `question` |
| `PLAN_REVIEW` | `plan-review` |
| `ARGUMENTS_STATUS` | `complete`, `truncated`, `unavailable` |
| `WATCH_MODE` | `once`, `repeat` |
| `WATCH_STATUS` | `active`, `closed`, `target-missing` |
| `WATCH_STATE` | `idle`, `running`, `waiting`, `closed` |
| `WATCH_ERROR` | `unknown-session`, `archived`, `is-fishball`, `limit-reached`, `unknown-watch`, `not-related`, `feature-off` |
| `SETTLED_BY` | `user`, `fishball` |
| `RAN_VIA` | `pass`, `grant` |
| `INBOX_KIND` | `session`, `user`, `system`, `watch`, `approval`, `plugin` |
| `SETTING_KIND` | `number`, `enum` |
| `MEDIA` / `IMAGE_TYPES` | `image/png`, `image/jpeg`, `image/webp`, `image/gif` |
| `STATUS` (the `status()` state) | `disabled`, `waiting`, `starting`, `ready`, `stopping`, `stopped`, `failed` |
| `STATUS_CODES` (the `status()` code) | `NATIVE_START_FAILED`, `NATIVE_STOP_FAILED`, `NATIVE_CHILD_EXITED`, `NATIVE_UNAVAILABLE`, `NATIVE_TIMEOUT`, `NATIVE_DISABLED` |

## 7. Errors

**Attach refusals** (`ATTACH_ERROR`; thrown by `attachInstance` as `ContractError.code`):
`instance-busy`, `contract-version`, `ui-invalid`, `transport-invalid`, `instance-invalid`
(pending, §11).

**Frame error codes** (`ERROR`; the only values an `error` frame's `{code}` may carry). Any other
code is invalid, and an unexpected failure is always `operation-failed`.

| Group | Codes |
| --- | --- |
| envelope and channel | `invalid-envelope`, `unsupported-version`, `wrong-host`, `unsupported-operation`, `unsupported-capability`, `handshake-required`, `forbidden`, `limit-exceeded`, `disconnected`, `timeout`, `conflict`, `duplicate-request`, `operation-failed` |
| attachments | `not-referenced`, `too-large`, `images-unsupported` |
| sessions | `unknown-session`, `is-fishball`, `not-managed`, `feature-off`, `session-not-live` |
| answers | `expired`, `invalid-decision`, `risk-required`, `reason-required`, `allow-needs-low-risk`, `arguments-incomplete`, `question-required`, `mode-user`, `bad-answer`, `already-settled` |
| grants | `grant-invalid`, `prefix-not-shell-tool`, `prefix-empty`, `prefix-not-in-call`, `expires-at-required`, `expires-at-invalid`, `expires-at-past`, `unknown`, `ended` |
| settings | `settings-conflict`, `settings-invalid` |

## 8. Limits

All limits are `LIMITS` in the connector's `./contract` (today `src/connector/limits.js`). A value
at the limit is accepted; one above it is refused (`limit-exceeded`, or the code named).

| Limit | Value | Applies to |
| --- | --- | --- |
| `uiPathChars` | 512 characters | each `ui` path (`ui-invalid`) |
| `envelopeBytes` | 1 MiB | one frame |
| `attachmentEnvelopeBytes` | 8 MiB | an `attachment.put` request or `attachment.read` response frame |
| `sessionsListed` | 100 | `session.list` `limit` and result |
| `imageBytes` | 4 MiB | one image (`too-large` on a transfer) |
| `imagePixels` | 4,194,304 | width × height of one image reference |
| `normalizedImageBytes` | 4,194,304 | DSH's own normalized-image byte budget; informational, no frame field is checked against it |
| `imagesPerMessage` | 20 | `images[]` |
| `attachmentsPerMessage` | 20 | `attachments[]` |
| `chunkBytes` | 512 KiB | one decoded chunk |
| `transfersPerMessage` | 1 | transfers per message |
| `hostRefTtlMs` | 600,000 ms | `hostRef` lifetime |
| `reasonChars` | 500 | approval, prompt, grant-revoke and release `reason`; descriptor `reason` |
| `questionChars` | 500 | `question` text, `answer.question` |
| `noteChars` | 500 | `question.answer` `note` |
| `feedbackChars` | 500 | plan-review `feedback` |
| `customChars` | 500 | an answer's `custom` |
| `labelChars` | 200 | option label, header, selected label, plan `approve` |
| `titleChars` | 200 | descriptor and prompt `title` |
| `quoteBytes` | 2,048 bytes | each descriptor quote |
| `argumentChars` | 2,000 | `arguments` |
| `grantPrefixChars` | 512 | a grant's `prefix` |
| `questionsPerRequest` | 32 | `questions[]`, `answers[]` |
| `selectedLabelsPerAnswer` | 32 | `selected[]` |
| `embedJsonBodyBytes`, `embedUploadBodyBytes`, `embedConcurrentStreams`, `embedStreamIdleTimeoutMs`, `embedSseHeartbeatMs` | 1 MiB, 8 MiB, 32, 30,000 ms, 15,000 ms | the built-in instance's embed proxy only; not part of the binding |

The connector's own queue bound, `maxQueuedInputs` (default 200, a connector setting), caps the
intake items waiting for an instance (§9).

## 9. No instance attached

The connector works alone. With no instance attached (never attached, after `detach()`, or after
`transport.onClose`):

| Input | Behaviour |
| --- | --- |
| `message_fishball`, `ask_fishball`, a finished-session notice, a hand-over note | queued in the intake ledger, bounded by `maxQueuedInputs` (the existing refusal past it); delivered once each, in order, with `inbox.push` on the next attach |
| a permission request or question from a managed session | not offered to Fishball; the user answers in that session, as with Fishball off |
| Hand over / Take back | work; the session becomes managed or unmanaged |
| Fishball view (sidebar row, brand) | an empty state, "No Fishball instance is attached", with a link to the Plugins page; no iframe |
| managed-row marks | shown from the connector's own state |
| connector settings | DSH's own Plugins → settings form for the `fishball` row |

## 10. Module index

Everything the `./contract` module exports (`src/connector/contract.js`, re-exported unchanged
from `src/slim/contract.js`):

- binding: `CONNECTOR_SERVICE`, `CONNECTOR_CONTRACT`, `ATTACH_ERROR`, `TRANSPORT_METHODS`,
  `validateAttachment`, `negotiateContract`;
- frames: `ENVELOPE`, `SIDE`, `DIRECTION`, `OPERATION`, `OPERATIONS` (direction and scope per
  operation), `EVENT`, `EVENTS`, `EVENT_DIRECTION`, `VALIDATORS`, `validateRequest`,
  `validateResponse`, `validateEvent`, `validateEnvelope`, `makeEnvelope`, `encodeEnvelope`,
  `decodeEnvelope`, `requireCapabilities`, `checkSettingsUpdate`;
- vocabularies: those of §6, plus `DIGEST`;
- errors: `ERROR`, `ContractError` (`.code`) and `fail(code)`;
- limits: `LIMITS`;
- built-in instance only, not needed by a third party: `ROUTES`, `ADMISSION`, `BEARER`.

The sibling modules `card-record.js` (`CARD_RECORD`), `inbox-markers.js` (`QUESTION_ANSWER`,
`OWN_ANSWER`, `RECORD_ITEM`, `CARD_CLOSED`) and `attachment-transfer.js` (`TRANSFER`,
`isImageMediaType`, `sha256Hex`, `maxChunkedBytes`, `fromBase64`, `toBase64`, `chunksOf`,
`verifyTransfer`) are part of the contract as well.

## 11. Open points

1. **`settings.update` permission (pending user confirmation):** may any attached instance change
   the connector's limits, or only the built-in one, or only after the user agrees?
2. **`instance-invalid` (pending):** design §0.4 names no code for a malformed `id`, `name`,
   `status`, `retry` or an unknown descriptor key. v1 uses `instance-invalid` until the user
   decides.
3. **A fragment in a `ui` path (pending):** §18.2 lists "with fragment" as a test partition without
   stating the outcome. v1 accepts it, because a fragment never reaches the server and carries no
   host.
4. **An empty `settings.update` (`values: {}`):** valid in v1. Whether it bumps the revision is
   C2's to define with the user.
