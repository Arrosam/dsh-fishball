# Test design: connector tasks K1, M1, C1, C2, C3

Status: black-box test cases written **before** development (TDD, §18 of the design).

> **Release state (v0.1.0-alpha.0).** The released code is contract 1.1
> (`CONNECTOR_CONTRACT.minor` is `1`, not `0`) and the connector row/service are fully
> implemented. The cases below were written against the frozen contract at `bb0f756` (minor 0)
> and the pre-split design; where a case contradicts the released code, the code and
> `docs/connector-contract.md` 1.1 win. Notable drift: `minor` is `1`; the `ui` path's `token`
> check folds ASCII case and also scans the fragment; `ask_fishball` with no instance answers
> `unavailable` at once (never queued); a `user`-kind hand-over note is never refused by the
> queue bound; the connector form no longer has hourly caps (`messagesPerHour`,
> `sessionsPerHour`, `wakeupsPerHour`); the C2 migration leaves the old settings record in place;
> the frame adds the 1.1 `lang` parameter; the limits form and question-mode renderer remain in
> DSH's form; the bundle-patch row id is `fishball-connector`; and `dsh.client` is an object with
> six `exports` entries.

Sources, in order of precedence:
1. The user's decisions U1–U4 below (2026-11-06).
2. **The frozen contract** `docs/connector-contract.md` at `bb0f756` (branch `feat/k1-contract`),
   cited as "contract §n". It is the source of every K1 case.
3. `docs/slim-native-design.md` at `3509859` (branch `design/body-soul`): §0 (connector and
   instance, §0.4, §0.7) and §18 (task table §18.1; per-task R / T / AC in §18.2), cited as
   "design §n". Where it refers on to design §5.2 and §7 and to DESIGN.md (§7a.5, §16 limits),
   those sections are used as written at the same commit.

No production code was read, including the contract module itself. Only its documentation was.

Scope: **K1** contract v1, **M1** the two-package split, **C1** the connector service and
no-instance mode, **C2** the connector settings, **C3** the connector client (opener view, empty
state). I1–I9 and E1 are designed in another session.

## User decisions applied (2026-11-06)

| # | Decision | Effect on this document |
| --- | --- | --- |
| U1 | **Branding.** The branding and sidebar-entry settings do not move into the connector row. The connector icon is fixed: the Fishball fish logo with a wrench badge. No plugin is named "Fishball"; there are only `fishball-connector` and `fishball-instance`. | No brand-icon or sidebar-entry setting anywhere (C2-EP-09, C2-EP-10). A fixed-icon check (C3-P-13, C3-EP-07). No plugin labelled "Fishball" (M1-P-11). Contract §0 still lists the brand icon and the sidebar entry as connector settings (OQ-42). |
| U2 | **Connector limits (option B).** They change only in DSH's own plugin settings form. An attached instance must not be able to change them. | Limits are tested only through DSH's form (C1-BVA, C2-P, C2-BVA). |
| U3 | **Instance without connector:** `connector-missing`, and the connector is **not** installed automatically. | M1-EP-02, M1-EP-04, M1-EP-07. |
| U4 | **K1 as frozen at `bb0f756`.** Contract v1 has **no settings operations at all**: no `settings.describe` and no `settings.update`. A malformed `id`, `name`, `status` or `retry`, or an unknown descriptor key, gives `instance-invalid`. A `ui` path with a `#fragment` is accepted. A `ui` path is at most 512 characters. An unknown optional capability is ignored, and an unknown required capability is refused. | Every settings-over-contract case is negative: the operation is unknown or refused (K1-EP-55..58, C2-EP-01..06). K1 follows the contract doc, including its fixed check order (contract §1.3), so the K1 decision table has exact outcomes. |

## How to read this document

- **Techniques** (ISTQB, as design §18.2 names them): **P** positive; **EP** negative tests by
  equivalence partitioning; **ST** state transition; **DT** decision table; **BVA** boundary value
  analysis (min − 1, min, max, max + 1).
- **Case id**: `<task>-<technique>-<nn>`, for example `K1-EP-03`.
- **R** is the requirement the case checks. Requirements are numbered per task (`K1-R1` …), and
  each cites its source.
- **Ver** (DSH versions):
  - `both` means 0.2.1-rc.5 **and** 0.2.2-rc.1, the default.
  - `static` means a check on the repository, the packed tarballs or the plain contract module in
    Node; it does not boot DSH, so it runs once. (Contract §10 says the module imports no DSH
    package.)
- **K1 levels.**
  - `static` K1 cases need only K1's module.
  - `both` K1 cases go through the running connector service. They need C1's service, and they
    run as soon as C1 lands.
- **`[OQ-nn]`**: the expected result depends on an open question (at the end of this document).
  The expected result written is the most literal reading of the sources; re-check the case once
  the question is answered.
- **Terms**
  - **The connector row** is the row that `fishball-connector`'s bundle patch inserts (id
    `fishball` per design §0.2, `[OQ-36]`).
  - **DSH's form** is DSH's own Plugins → settings form for that row.
  - **Row config** is that row's config, as DSH's settings service returns it and as the
    profile's `cordis.patch.yml` stores it.
- Every case runs in a disposable main home on a free port. Never the user's homes, never
  `:7713` / `:3081`, and never a real API key (D21, design §17).

## Common preconditions and fixtures

Cases cite these by name instead of repeating them.

| Name | Precondition |
| --- | --- |
| **H-MOD** | The connector's `./contract` module is imported in plain Node, with no DSH. Before M1 it is the module at K1's commit; after M1 it is `fishball-connector/contract` from the installed package. The export names are those of contract §10. Call signatures follow the module's public documentation `[OQ-47]`. |
| **H-BOOT** | A disposable `DSH_HOME` initialised from DSH's `web` template, on a free port, with the scripted fake model as the default model (no network). The browser cookie is minted from the printed `dsh web:` token. |
| **H-CONN** | `fishball-connector` packed from `packages/connector` (before M1: the repository package at K1's commit) and installed with `dsh plugin add <tarball>`; the connector row is enabled. No instance plugin is installed. |
| **H-INST** | `fishball-instance` packed from `packages/instance` and installed the same way (used by M1 only; the built-in instance's behaviour is I1). |
| **H-STUB** | Test fixture plugin `fbtest-stub-instance`, installed in the main profile. See the H-STUB details below the table. |
| **H-PROBE** | Test fixture plugin `fbtest-connector-probe`. It declares `fishballConnector` as a **required** injection and records `apply` and `dispose`, the type of `fishballConnector.attachInstance`, and the service's own and inherited member names. |
| **H-SESS** | An ordinary main session `S1` in a registered disposable workspace, driven by the scripted fake model. The model can be scripted to call `message_fishball`, `ask_fishball`, a tool that needs approval under `approval: ask` (fixture tool `fbtest_needs_ok`), or DSH's `ask_user_question`. |
| **H-MANAGED** | H-SESS, and `S1` has been handed over to Fishball (header "Hand over to Fishball", empty note, confirmed), so `S1` is managed. |
| **H-UI** | A browser page on the main origin (headless, with a disposable browser profile), in the light theme unless the case says dark. |
| **H-OLD** | A disposable home prepared with the pre-split build (`535a807`, package `dsh-fishball`). Through that build's own settings UI: the brand icon is set to the DeepSeek icon (`POST /api/fishball/brand`), the sidebar entry to `brand` (`POST /api/fishball/sidebar-entry {entry:'brand'}`), and the question mode to User. Then that package is replaced with the connector tarball. |

**H-STUB details.** The stub injects `fishballConnector` and **does not attach by itself**. The
test drives it through these worker ops:

| Op | What it does |
| --- | --- |
| `attach(descriptor)` | Calls `attachInstance` with a descriptor built from the test's arguments, so any field can be omitted or malformed. It returns the handle, or the thrown `ContractError.code`. |
| `detach()` | Calls `detach()` on the handle it got. |
| `fireClose()` | Calls every handler the connector registered through `transport.onClose`. |
| `send(frame)` | Delivers a raw frame, valid or not, to the handler registered through `transport.onMessage`. |
| `handshake(capabilities, requiredCapabilities)` | Sends the handshake request. |
| `received()` | Returns every string the connector passed to `transport.send`, in order, parsed. |
| `ackPolicy(n)` | Acks only the first *n* `inbox.push` items. |
| `errorPolicy(code)` | Answers the next `inbox.push` with an error frame carrying `code`. |
| `setStatus({state, code})` | Sets what `status()` returns. |
| `retryCalls()` | Counts the calls of `retry()`. |
| `transportCalls()` | Lists which transport methods the connector called, in order. |

Unless a case says otherwise, the stub sends the handshake `{capabilities:['inbox.push'],
requiredCapabilities:[]}` right after a successful attach, and answers each `inbox.push` with
`{acked:true}`. It also serves two same-origin fixture pages, `/fbtest/chat/` and
`/fbtest/settings/`, with handler-form routes (design R3, rc.5); each page records the request
URL it received.

**Black-box paths only.** Inputs are produced through:
- the managed session's own tool calls (scripted model);
- the session header's Hand over and Take back actions;
- DSH's Plugins page;
- the stub's transport.

Delivery is observed in `stub.received()`. The queue is observed through the documented tool
results and through delivery after an attach.

**"Nothing changed"** (used by the refusal cases) means all of these hold:
- the row config file is byte-identical to before the step;
- DSH's form shows the same values after a reload;
- the queue bound in force is unchanged (checked as in C1-BVA-02).

---

## K1 — contract v1 freeze

Owner: `contract/` (at K1, `src/connector/{contract,limits,card-record,inbox-markers,attachment-transfer}.js`)
and `docs/connector-contract.md`. Source: contract §0–§11 at `bb0f756`.

### Requirements

| R | Requirement (source) |
| --- | --- |
| K1-R1 | The connector row provides the service `fishballConnector` (`CONNECTOR_SERVICE`) whether or not an instance exists. `attachInstance(descriptor)` accepts a well-formed descriptor and returns `{detach()}` (contract §1; design §18.2 K1 R1). |
| K1-R2 | Descriptor fields (contract §1.1): `id` and `name` are non-empty strings; `status` and `retry`, if present, are functions; any other key is refused. Each violation gives `instance-invalid` (U4). |
| K1-R3 | `contract` is exactly `{id, major, minor}`, with `id` `fishball-connector`, `major` `1`, and both `major` and `minor` whole numbers; otherwise `contract-version`. Any minor of major 1 is accepted. `negotiateContract` returns `{id, major:1, minor: min(instance minor, connector minor)}`. `CONNECTOR_CONTRACT` is `{id:'fishball-connector', major:1, minor:1}` (contract §1.1, §2). |
| K1-R4 | `transport` is an object with the four functions `send`, `onMessage`, `onClose`, `close` (`TRANSPORT_METHODS`); otherwise `transport-invalid` (contract §1.1). |
| K1-R5 | `ui` holds exactly the optional keys `chat` and `settings`. Each value is a string of at most 512 code points (`LIMITS.uiPathChars`) that starts with exactly one `/`. It carries no scheme, resolves to the main origin (no `/\host`, and no host revealed after a tab or newline is dropped), and has no `token` parameter (any ASCII case) in its query or fragment. Any other fragment is accepted. A violation gives `ui-invalid` (contract §1.2, U4). |
| K1-R6 | The checks run in a fixed order, so one descriptor has one answer: (1) shape and keys → `instance-invalid`; (2) contract → `contract-version`; (3) transport → `transport-invalid`; (4) ui → `ui-invalid`; (5) `id`, `name`, `status`, `retry` → `instance-invalid`; (6) the connector already has an instance → `instance-busy`. A refusal throws a `ContractError` whose `code` is the refusal, and it has no side effect: no transport method is called, nothing is stored, and an attached instance stays attached (contract §1.3). |
| K1-R7 | One instance at a time. `detach()` and the transport's `onClose` both return the connector to no-instance mode (contract §1.3, §9). |
| K1-R8 | Handshake and capabilities (contract §2, §3.2): the instance opens with `handshake` `{capabilities, requiredCapabilities}`. The connector answers `{capabilities, hostInstanceId}`, where `hostInstanceId` is new for each connector object. An unknown optional capability is ignored; an unknown required one is refused `unsupported-capability`. Before the handshake, any other request gets `handshake-required`; a second handshake gets `conflict`; a request outside the welcome gets `unsupported-operation`. The connector never sends before the instance's handshake. |
| K1-R9 | Envelope v2 (contract §3.1): exactly seven keys; `version` 2, else `unsupported-version`; another host is `wrong-host`; `type` is one of four; scoped operations match the envelope and payload `sessionId`; payloads have exact keys and plain data; a frame in the wrong direction is `forbidden`; a frame that fails validation closes the channel. |
| K1-R10 | Requests (contract §3.3): a repeated settled request gets the remembered reply and is never delivered twice; a repeat while the first runs is `duplicate-request`; the same id reused for another operation, session or payload is `conflict`. |
| K1-R11 | The operation and event allowlist is exactly contract §4 and §5. There is **no settings operation**: no `settings.describe`, no `settings.update`, and no operation that reads or changes connector settings (contract §0, U4). |
| K1-R12 | Error vocabularies (contract §7): `ATTACH_ERROR` is the five attach codes. An `error` frame's `{code}` must be in `ERROR`, and nothing else is valid. Neither set has a settings code. |
| K1-R13 | Limits (contract §8): a value at the limit is accepted and one above it refused (`limit-exceeded` or the named code). Character caps count code points; byte caps count UTF-8 bytes (contract §3.1). |
| K1-R14 | `docs/connector-contract.md` lists every name the module exports (contract §10), and the module exports every name the doc lists (design §18.2 K1 R5). |

### P — positive

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| K1-P-01 | P | K1-R1 | H-BOOT, H-CONN, H-STUB, H-MANAGED; no instance | `stub.attach({id:'stub-a', name:'Stub A', contract:{id:'fishball-connector', major:1, minor:0}, transport:<the four functions>})`; handshake; `S1` calls `message_fishball('m1')` | `attach` returns an object whose `detach` is a function; nothing is thrown. `stub.received()` gets the handshake response and then an `inbox.push` with `m1`. | both |
| K1-P-02 | P | K1-R1 | as K1-P-01 | Attach with every optional field: `ui:{chat:'/fbtest/chat/', settings:'/fbtest/settings/?view=settings'}`, `status:()=>({state:'ready', code:null})`, `retry:async()=>{}` | Accepted; a handle with `detach`. | both |
| K1-P-03 | P | K1-R2..R5 | H-MOD | `validateAttachment` on the minimal descriptor of K1-P-01 and on the maximal one of K1-P-02 | Neither throws `[OQ-47]`. | static |
| K1-P-04 | P | K1-R1, K1-R3, K1-R4, K1-R12 | H-MOD | Read the binding constants | `CONNECTOR_SERVICE` = `'fishballConnector'`; `CONNECTOR_CONTRACT` deep-equals `{id:'fishball-connector', major:1, minor:1}`; `TRANSPORT_METHODS` holds exactly `send`, `onMessage`, `onClose`, `close`; `ATTACH_ERROR` holds exactly `instance-busy`, `contract-version`, `ui-invalid`, `transport-invalid`, `instance-invalid`. | static |
| K1-P-05 | P | K1-R3 | H-MOD | `negotiateContract({id:'fishball-connector', major:1, minor:0})`; then with `minor:3` | Both return `{id:'fishball-connector', major:1, minor:0}` for a `minor:0` instance and `{id:'fishball-connector', major:1, minor:1}` for `minor:3` (the minimum of 0 and 1, and of 3 and 1). | static |
| K1-P-06 | P | K1-R7 | K1-P-01 done (stub-a attached) | `stub.detach()`; then attach `id:'stub-b'` | The second attach is accepted (no `instance-busy`). | both |
| K1-P-07 | P | K1-R7 | K1-P-01 done | `stub.fireClose()`; then attach `id:'stub-b'` | Accepted. | both |
| K1-P-08 | P | K1-R8, K1-R11 | H-STUB attached | `handshake(['inbox.push'], [])` | One `response` frame with the same `requestId`. Its payload is exactly `{capabilities, hostInstanceId}`: `hostInstanceId` is a non-empty string, and `capabilities` is a list of unique names, each an instance → connector operation of contract §4, none starting with `settings.`. Then a `session.list` `{limit:10}` request gets a `response`. | both |
| K1-P-09 | P | K1-R8 | H-STUB (handshake off); H-MANAGED; `S1` has sent `m1` while no instance was attached | Attach; wait 2 s; check `transportCalls()`; then handshake | Before the handshake the connector called no `send` (contract §1.1: "never sends before the instance's handshake"). After the handshake, `inbox.push` `m1` arrives. | both |
| K1-P-10 | P | K1-R8 | K1-P-08 done; `hostInstanceId` = h1 | Disable and re-enable the connector row on the Plugins page; attach again; handshake | The new `hostInstanceId` ≠ h1 (a new connector object). | both |
| K1-P-11 | P | K1-R9 | H-MOD | `makeEnvelope` a `session.list` request → `encodeEnvelope` → `decodeEnvelope` | The decoded frame deep-equals the original, and it has exactly the seven keys `version`, `hostId`, `sessionId`, `requestId`, `type`, `operation`, `payload`, with `version` 2. | static |
| K1-P-12 | P | K1-R11 | H-MOD | Read `OPERATIONS` and `EVENTS` | `OPERATIONS` names exactly the operations of contract §4. Instance → connector: `session.list`, `session.start`, `session.message`, `session.redirect`, `session.stop`, `session.read`, `session.watch`, `session.watches`, `session.unwatch`, `session.release`, `approval.list`, `approval.answer`, `question.answer`, `question.ask`, `question.answerOwn`, `prompt.list`, `prompt.answer`, `grant.list`, `grant.revoke`, `attachment.read`, `attachment.put`. Connector → instance: `inbox.push`. Each has the direction and scope ("Scoped" column) of §4. `EVENTS` names exactly `approval.request`, `approval.settled`, `approval.ran`, `watch.status`, `session.state`, and `EVENT_DIRECTION` is `main-to-child`. | static |
| K1-P-13 | P | K1-R8 | H-MOD | `requireCapabilities(['inbox.push','session.list'], ['session.list'])`, then `requireCapabilities(['inbox.push'], [])` | Both pass (required ⊆ available) `[OQ-47]`. | static |
| K1-P-14 | P | K1-R10 | H-STUB attached; H-MANAGED | Send `session.message` `{sessionId:S1, message:'once', attachments:[]}` with `requestId` r1; wait for its reply; send the identical frame again | The second reply equals the first, and `S1`'s log has exactly one user message `once`. | both |
| K1-P-15 | P | K1-R14 | repository at K1's commit | Doc-vs-module scan. Collect every name exported by the contract modules (`contract.js`, `limits.js`, `card-record.js`, `inbox-markers.js`, `attachment-transfer.js`), every operation, event, vocabulary value, error code and `LIMITS` key; collect the same from `docs/connector-contract.md` (§1–§10). | The sets are equal: no name is in one and not the other. | static |
| K1-P-16 | P | K1-R8 | H-STUB attached; H-MANAGED | `S1` calls `fbtest_needs_ok`; the stub receives `approval.request` with offer `o1`; detach; attach; handshake | `[OQ-05]` After the new handshake, the same `approvalId` is offered again with a current `offerId` (contract §5.1), and `approval.answer` with that `offerId` is accepted. This holds only if a request that went to the user's prompt at the detach still counts as live. | both |

### EP — negative (equivalence partitions)

Partitions:
- the descriptor shape and its keys;
- `id` / `name` / `status` / `retry` valid or malformed;
- contract id right or wrong; major equal, lower or higher; minor equal or higher (contract
  minor 0, so the only "lower" value is −1, which is also not whole); contract shape;
- transport complete, missing a method, or a method that is not a function;
- `ui` absent / valid / relative / scheme / `//host` / `/\host` / tab or newline / `token=` /
  fragment / unknown key / not a string;
- the instance slot free or busy;
- the handshake valid, before any handshake, repeated, or with an unknown optional or required
  capability;
- the envelope valid or malformed;
- a settings operation, which does not exist (U4).

**No side effect** for every attach refusal (K1-R6), checked at service level:
- `stub.transportCalls()` shows no method called on the refused transport;
- `status` and `retry` were not called;
- the prior state is unchanged: a following valid attach behaves as in that prior state, and a
  queued item is still delivered to the right instance.

Module-level (`static`) attach cases call `validateAttachment` and read the thrown `code`. The
same descriptor through the service gives the same code and no side effect.

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| K1-EP-01 | EP | K1-R2, K1-R6 | H-MOD; then H-STUB, no instance | The descriptor is `null`, `[]`, `'x'`, then an instance of a class (not a plain object) | Each `instance-invalid`; no side effect. | static + both |
| K1-EP-02 | EP | K1-R2 | as K1-EP-01 | A valid descriptor plus the key `extra: 1` | `instance-invalid`; no side effect. | static + both |
| K1-EP-03 | EP | K1-R2 | as K1-EP-01 | `id` missing, `''`, `42` | Each `instance-invalid`. | static + both |
| K1-EP-04 | EP | K1-R2 | as K1-EP-01 | `name` missing, `''`, `{}` | Each `instance-invalid`. | static + both |
| K1-EP-05 | EP | K1-R2 | as K1-EP-01 | `status` = `'ready'`, `{}`, `null` | Each `instance-invalid`. | static + both |
| K1-EP-06 | EP | K1-R2 | as K1-EP-01 | `retry` = `true`, `{}`, `null` | Each `instance-invalid`. | static + both |
| K1-EP-07 | EP | K1-R2 | as K1-EP-01 | A descriptor with neither `status` nor `retry` | Accepted (both optional). | static + both |
| K1-EP-08 | EP | K1-R3 | as K1-EP-01 | `contract.id` = `'fishball'`, `'Fishball-Connector'`, `''` | Each `contract-version`; no side effect. | static + both |
| K1-EP-09 | EP | K1-R3 | as K1-EP-01 | `contract.major: 0` (lower) | `contract-version`. | static + both |
| K1-EP-10 | EP | K1-R3 | as K1-EP-01 | `contract.major: 2` (higher) | `contract-version`. | static + both |
| K1-EP-11 | EP | K1-R3 | as K1-EP-01 | `contract.minor: 0` (equal) | Accepted. | static + both |
| K1-EP-12 | EP | K1-R3 | as K1-EP-01 | `contract.minor` = `1`, then `99` (higher) | Each accepted; `negotiateContract` returns minor 0. | static + both |
| K1-EP-13 | EP | K1-R3 | as K1-EP-01 | `contract.minor: -1` (lower, and not a whole number) | `contract-version`. | static + both |
| K1-EP-14 | EP | K1-R3 | as K1-EP-01 | `contract` missing; `null`; without `minor`; without `major`; with an extra key `patch:0`; `major:'1'`; `minor:1.5` | Each `contract-version`. | static + both |
| K1-EP-15 | EP | K1-R4 | as K1-EP-01 | A transport without `send` | `transport-invalid`; no side effect. | static + both |
| K1-EP-16 | EP | K1-R4 | as K1-EP-01 | A transport without `onMessage` | `transport-invalid`. | static + both |
| K1-EP-17 | EP | K1-R4 | as K1-EP-01 | A transport without `onClose` | `transport-invalid`. | static + both |
| K1-EP-18 | EP | K1-R4 | as K1-EP-01 | A transport without `close` | `transport-invalid`. | static + both |
| K1-EP-19 | EP | K1-R4 | as K1-EP-01 | `transport` missing; `null`; with `send:'x'` (present, not a function) | Each `transport-invalid`. | static + both |
| K1-EP-20 | EP | K1-R5 | as K1-EP-01 | `ui` absent; then `ui: {}` | Absent: accepted. `{}`: accepted, since both keys are optional `[OQ-52]`. | static + both |
| K1-EP-21 | EP | K1-R5 | as K1-EP-01 | `ui:{chat:'/x/', help:'/y/'}` | `ui-invalid`. | static + both |
| K1-EP-22 | EP | K1-R5 | as K1-EP-01 | `ui` = `'/x/'`, `[]`, `null` | Each `ui-invalid` (`null` is `[OQ-52]`). | static + both |
| K1-EP-23 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'fishball/embed/'`, `'./x'` | Each `ui-invalid`. | static + both |
| K1-EP-24 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'http://127.0.0.1:1/x'`, `'javascript:alert(1)'`, `'data:text/html,x'` | Each `ui-invalid`. | static + both |
| K1-EP-25 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'//evil.example/x'`, `'///x'` | Each `ui-invalid`. | static + both |
| K1-EP-26 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'/\\evil.example/x'` (a slash then a backslash) | `ui-invalid`. | static + both |
| K1-EP-27 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'/\t/evil.example/'`, `'/\n/evil.example/'`, `'/\r/evil.example/'` (JS escapes: a real tab, newline or CR) | Each `ui-invalid`. | static + both |
| K1-EP-28 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'/x/?token=abc'`, `'/x/?a=1&token=b'`, `'/x/?token'`, `'/x/?token='` | Each `ui-invalid`. | static + both |
| K1-EP-29 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `'/x/?Token=a'`, `'/x/?%74oken=a'`, `'/x/?access_token=a'`, `'/x/#token=a'` | `[OQ-50]` Literal reading of contract §1.2: `%74oken` is refused (it decodes to `token`); `Token` and `access_token` are accepted (other parameter names); `#token=a` is accepted (a fragment, not the query). | static + both |
| K1-EP-30 | EP | K1-R5 | as K1-EP-01 | `ui.chat: '/x/?view=settings&lang=en'` | Accepted. | static + both |
| K1-EP-31 | EP | K1-R5 | as K1-EP-01 | `ui.chat: '/fishball/embed/#x'` | Accepted (U4). | static + both |
| K1-EP-32 | EP | K1-R5 | as K1-EP-01 | A valid `ui.chat` with `ui.settings: '//evil.example/'` | `ui-invalid`; no side effect. | static + both |
| K1-EP-33 | EP | K1-R5 | as K1-EP-01 | `ui.chat` = `42`, `['/x/']`, `{}` | Each `ui-invalid`. | static + both |
| K1-EP-34 | EP | K1-R6, K1-R7 | stub-a attached; queue empty | Attach `id:'stub-b'` (valid) | `instance-busy`. stub-a stays attached: `S1`'s next `m1` reaches stub-a. stub-b's transport is never called. | both |
| K1-EP-35 | EP | K1-R7 | stub-a attached | Attach again with `id:'stub-a'` and a new transport, without detaching | `instance-busy`; the original transport keeps receiving frames. | both |
| K1-EP-36 | EP | K1-R8 | H-STUB attached | `handshake(['inbox.push','fbtest.extra'], [])` | The handshake succeeds; `fbtest.extra` is ignored (it is absent from the welcome); a `message_fishball` is still delivered. | both |
| K1-EP-37 | EP | K1-R8 | H-STUB attached | `handshake(['inbox.push','fbtest.must'], ['fbtest.must'])` | Refused `unsupported-capability` `[OQ-43]`. No `inbox.push` is sent on that transport. The connector's state afterwards is `[OQ-48]`. | both |
| K1-EP-38 | EP | K1-R8 | H-MOD | `requireCapabilities(['inbox.push'], ['session.list'])` | Fails with `unsupported-capability` `[OQ-47]`. | static |
| K1-EP-39 | EP | K1-R8 | H-STUB attached, one fresh attach per variant | Handshake variants: `requiredCapabilities` not a subset of `capabilities` (`(['inbox.push'], ['session.list'])`); `capabilities` without `inbox.push` (`(['session.list'], [])`); duplicate names (`(['inbox.push','inbox.push'], [])`); an empty name (`(['inbox.push',''], [])`) | Each refused. Whether it is a validation failure that closes the channel or an `unsupported-capability` error frame is `[OQ-43]`. In no variant does `inbox.push` arrive. | both |
| K1-EP-40 | EP | K1-R8 | H-STUB attached, handshake off | Send a `session.list` request before any handshake | `error` frame `{code:'handshake-required'}`, echoing the `requestId`. | both |
| K1-EP-41 | EP | K1-R8 | K1-P-08 done | Send a second `handshake` | `error` frame `{code:'conflict'}`; the first welcome still holds (a following `session.list` succeeds). | both |
| K1-EP-42 | EP | K1-R9 | H-MOD | `validateEnvelope` on a valid frame with an eighth key `extra`, and on one without `requestId` | Both invalid. | static |
| K1-EP-43 | EP | K1-R9 | H-MOD; then H-STUB attached | A frame with `version` 1, then 3 | Module: `unsupported-version`. Service: refused `unsupported-version`; the channel closes `[OQ-48]`. | static + both |
| K1-EP-44 | EP | K1-R9 | H-STUB attached | A valid request whose `hostId` is not the main host's | Refused `wrong-host`. | both |
| K1-EP-45 | EP | K1-R9 | H-MOD | `type` = `'notify'` | Invalid. | static |
| K1-EP-46 | EP | K1-R9 | H-STUB attached | The instance sends a `request` for `inbox.push` (a connector → instance operation), then an `event` `session.state` | Each refused `forbidden`. | both |
| K1-EP-47 | EP | K1-R9 | H-MOD | A `session.stop` request whose envelope `sessionId` differs from the payload's; then a `session.list` with a non-null envelope `sessionId` | Both invalid. | static |
| K1-EP-48 | EP | K1-R9, K1-R12 | H-MOD | `error` frames with payload `{code:'settings-invalid'}`, `{code:'nope'}`, and `{code:'timeout', detail:'x'}` | All invalid (the code is not in `ERROR`, or there is an extra key). | static |
| K1-EP-49 | EP | K1-R9 | H-MOD | `requestId: ''` | Invalid. | static |
| K1-EP-50 | EP | K1-R9 | H-MOD | Payload objects with a getter property, with a symbol key, and with an array hole (`[ , 'a']`) | Each invalid. | static |
| K1-EP-51 | EP | K1-R9 | H-STUB attached | Send `session.list` `{limit:10, extra:1}` | The frame fails validation, and the connector closes the channel (`transport.close` called, or the channel ends) `[OQ-48]`. No `response` is sent for it. | both |
| K1-EP-52 | EP | K1-R10 | H-STUB attached; H-MANAGED; a request the test holds open (`session.start` while the H-SESS fixture delays the session's creation) | Send the same frame again while the first is still running | The second gets `error` `{code:'duplicate-request'}`; only one session is created. | both |
| K1-EP-53 | EP | K1-R10 | K1-P-14 done (r1 settled) | Reuse `requestId` r1 for `session.stop` `{sessionId:S1}`; then for `session.message` with another text | Each gets `error` `{code:'conflict'}`; `S1` is not stopped and gets no second message. | both |
| K1-EP-54 | EP | K1-R12 | H-MOD | Read `ERROR` | It equals the union of the five groups of contract §7, and nothing else. | static |
| K1-EP-55 | EP | K1-R11, K1-R12 | H-MOD | Read `OPERATIONS`, `EVENTS`, `VALIDATORS`, `ERROR` and `ATTACH_ERROR` | No name starts with `settings.`, and none is `settings-conflict` or `settings-invalid`. | static |
| K1-EP-56 | EP | K1-R11 | H-STUB attached (handshake done) | Send a well-formed envelope-v2 `request` with `operation: 'settings.describe'`, `payload: {}` | Not served `[OQ-44]`: either an `error` frame `{code:'unsupported-operation'}`, or a validation failure that closes the channel. Never a `response`. Nothing changed. | both |
| K1-EP-57 | EP | K1-R11 | as K1-EP-56 | `operation: 'settings.update'`, `payload: {revision:1, values:{maxQueuedInputs:150}}` | Not served, as K1-EP-56. Nothing changed: DSH's form still shows 200, and the 201st queued input is still refused (C1-BVA-02). | both |
| K1-EP-58 | EP | K1-R11, K1-R14 | `docs/connector-contract.md` | Read the doc | It names no `settings.*` operation and no settings error code. §0 states that the contract gives an instance no operation that reads or changes connector settings, attached or not. | static |

### BVA — boundaries

Code points are counted as the contract defines (contract §3.1). "n/a" means the design gives no
lower bound that can be built.

| ID | T | R | Limit and field | min − 1 | min | max | max + 1 | Ver |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| K1-BVA-01 | BVA (min − 1) | K1-R5 | `ui.chat` length | `''` → `ui-invalid` | — | — | — | static + both |
| K1-BVA-02 | BVA (min) | K1-R5 | `ui.chat` length | — | `'/'` accepted | — | — | static + both |
| K1-BVA-03 | BVA (max) | K1-R5 | `ui.chat`: `'/'` + 511 × `a` | — | — | 512 accepted | — | static + both |
| K1-BVA-04 | BVA (max + 1) | K1-R5 | `ui.chat`: `'/'` + 512 × `a` | — | — | — | 513 → `ui-invalid`; no side effect | static + both |
| K1-BVA-05 | BVA (max, astral) | K1-R5 | `ui.chat`: `'/'` + 511 × `😀` (512 code points, 1023 UTF-16 units) | — | — | accepted | — | static + both |
| K1-BVA-06 | BVA (max + 1, astral) | K1-R5 | `ui.chat`: `'/'` + 512 × `😀` (513 code points) | — | — | — | `ui-invalid` | static + both |
| K1-BVA-07 | BVA | K1-R5 | K1-BVA-01..06 repeated on `ui.settings`, with a valid `ui.chat` | as 01 | as 02 | as 03, 05 | as 04, 06 | static + both |
| K1-BVA-08 | BVA | K1-R13 | `envelopeBytes`: a `session.message` frame padded through `message` to exactly 1 048 576 encoded bytes, then 1 048 577 | n/a | n/a | accepted by `encodeEnvelope` / `decodeEnvelope` | `limit-exceeded` | static |
| K1-BVA-09 | BVA | K1-R13 | `attachmentEnvelopeBytes`: an `attachment.put` frame of exactly 8 388 608 bytes, then 8 388 609; and a `session.message` frame of 1 048 577 bytes (under 8 MiB, but not an attachment frame) | n/a | n/a | accepted | `limit-exceeded`, both | static |
| K1-BVA-10 | BVA | K1-R13 | `sessionsListed`: `session.list` `limit` −1, 0, 100, 101; a response with 100 and with 101 sessions | −1 invalid | 0 valid | 100 valid; 100-session response valid | 101 invalid; 101-session response invalid | static |
| K1-BVA-11 | BVA | K1-R13 | `imageBytes`: `attachment.put` image `total` 4 194 304, then 4 194 305 | n/a `[OQ-19]` | — | accepted | `too-large` | static + both |
| K1-BVA-12 | BVA | K1-R13 | `imagePixels`: an `inbox.push` image of 2048 × 2048 (4 194 304), then 5 × 838 861 (4 194 305) | n/a | — | valid | invalid | static |
| K1-BVA-13 | BVA | K1-R13 | `imagesPerMessage`: `inbox.push` `images[]` 0, 20, 21 | n/a | 0 valid | 20 valid | 21 invalid | static |
| K1-BVA-14 | BVA | K1-R13 | `attachmentsPerMessage`: `session.message` `attachments[]` with 0, 20, 21 unique refs; and 2 equal refs | n/a | 0 valid | 20 valid | 21 invalid; 2 equal refs invalid (unique) | static |
| K1-BVA-15 | BVA | K1-R13 | `chunkBytes`: one chunk decoding to 524 288, then 524 289 bytes | n/a | — | valid | invalid | static |
| K1-BVA-16 | BVA | K1-R13 | `transfersPerMessage` = 1: one message using the refs of 1, then 2 transfers | n/a | — | 1 accepted | 2 `[OQ-45]` | both |
| K1-BVA-17 | BVA | K1-R13 | `hostRefTtlMs` 600 000: use a fresh `hostRef` in `session.message` at 590 s, and another at 610 s after its put (a slow case) | n/a | — | 590 s accepted | 610 s refused (code `[OQ-46]`); a reused ref is refused as well | both |
| K1-BVA-18 | BVA | K1-R13 | `reasonChars` 500, on `approval.answer` `answer.reason`, `session.release` `reason`, `grant.revoke` `reason`, `prompt.answer` `reason` and the descriptor `reason`; also 500 × `😀` | n/a `[OQ-19]` | — | 500 valid; 500 astral valid | 501 invalid | static |
| K1-BVA-19 | BVA | K1-R13 | `questionChars` 500: `answer.question` (with `ask`), `questions[].question` | n/a | — | 500 valid | 501 invalid | static |
| K1-BVA-20 | BVA | K1-R13 | `noteChars` 500: `question.answer` `note` | n/a | 0 valid | 500 valid | 501 invalid | static |
| K1-BVA-21 | BVA | K1-R13 | `feedbackChars` 500: plan-review `feedback` | n/a | 0 valid | 500 valid | 501 invalid | static |
| K1-BVA-22 | BVA | K1-R13 | `customChars` 500: `answers[].custom` | n/a | 0 valid | 500 valid | 501 invalid | static |
| K1-BVA-23 | BVA | K1-R13 | `labelChars` 200: option `label`, `header`, a `selected` label, plan `approve` | n/a `[OQ-19]` | — | 200 valid | 201 invalid | static |
| K1-BVA-24 | BVA | K1-R13 | `titleChars` 200: descriptor `title`, prompt `title` | n/a | — | 200 valid | 201 invalid | static |
| K1-BVA-25 | BVA | K1-R13 | `quoteBytes` 2048: a descriptor quote of 2048 ASCII bytes, then 2049; and 1024 × `é` (2048 bytes), then 1024 × `é` + `a` | n/a | — | valid | invalid | static |
| K1-BVA-26 | BVA | K1-R13 | `argumentChars` 2000: descriptor `arguments` (with `argumentsStatus`) | n/a | — | 2000 valid | 2001 invalid | static |
| K1-BVA-27 | BVA | K1-R13 | `grantPrefixChars` 512 (`kind:'prefix'`): `''`, `'   '`, `'x'`, 512, 513 | `''` and `'   '` invalid (non-blank) | `'x'` valid | 512 valid | 513 invalid | static |
| K1-BVA-28 | BVA | K1-R13 | `questionsPerRequest` 32: `question.ask` `questions[]` 0, 1, 32, 33; `question.answer` `answers[]` 0, 1, 32, 33 | 0 invalid | 1 valid | 32 valid | 33 invalid | static |
| K1-BVA-29 | BVA | K1-R13 | `selectedLabelsPerAnswer` 32: `selected[]` 0, 32, 33 | n/a | 0 `[OQ-19]` | 32 valid | 33 invalid | static |
| K1-BVA-30 | BVA | K1-R13 | `sha256` (`DIGEST`, 64 lowercase hex): 63, 64 and 65 hex characters; 64 uppercase | — | — | 64 lowercase valid | 63, 65 and uppercase invalid | static |
| K1-BVA-31 | BVA | K1-R9 | epoch-ms times (`at`, `expiresAt`): −1, 0, 1.5 | −1 invalid | 0 valid (shape; `expires-at-past` is a connector rule) | — | 1.5 invalid (not whole) | static |

### DT — attach outcome

Conditions (design §18.2 K1 DT):
- **C1**: the connector already has an instance;
- **C2**: the contract id and major match;
- **C3**: `ui` is valid (absent counts as valid);
- **C4**: the transport is complete.

The expected results follow contract §1.3's fixed order: contract, then transport, then ui, then
busy. Every refused rule also requires **no side effect**, and the existing instance stays
attached.

| Rule / ID | C1 has instance | C2 version ok | C3 ui ok | C4 transport ok | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| K1-DT-01 | N | Y | Y | Y | attached; `{detach()}` | both |
| K1-DT-02 | N | Y | Y | N | `transport-invalid` | both |
| K1-DT-03 | N | Y | N | Y | `ui-invalid` | both |
| K1-DT-04 | N | Y | N | N | `transport-invalid` (transport is checked before ui) | both |
| K1-DT-05 | N | N | Y | Y | `contract-version` | both |
| K1-DT-06 | N | N | Y | N | `contract-version` | both |
| K1-DT-07 | N | N | N | Y | `contract-version` | both |
| K1-DT-08 | N | N | N | N | `contract-version` | both |
| K1-DT-09 | Y | Y | Y | Y | `instance-busy` | both |
| K1-DT-10 | Y | Y | Y | N | `transport-invalid` | both |
| K1-DT-11 | Y | Y | N | Y | `ui-invalid` | both |
| K1-DT-12 | Y | Y | N | N | `transport-invalid` | both |
| K1-DT-13 | Y | N | Y | Y | `contract-version` | both |
| K1-DT-14 | Y | N | Y | N | `contract-version` | both |
| K1-DT-15 | Y | N | N | Y | `contract-version` | both |
| K1-DT-16 | Y | N | N | N | `contract-version` | both |

Precedence of the two `instance-invalid` steps (contract §1.3 steps 1 and 5) over the others:

| Rule / ID | Descriptor | Has instance | Expected | Ver |
| --- | --- | --- | --- | --- |
| K1-DT-17 | unknown key `extra` + `major: 2` | N | `instance-invalid` (step 1 before step 2) | both |
| K1-DT-18 | `id: ''` + `major: 2` | N | `contract-version` (step 2 before step 5) | both |
| K1-DT-19 | `id: ''` + transport without `close` | N | `transport-invalid` (step 3 before step 5) | both |
| K1-DT-20 | `id: ''` + `ui.chat: '//evil.example/'` | N | `ui-invalid` (step 4 before step 5) | both |
| K1-DT-21 | `status: 'x'`, otherwise valid | Y | `instance-invalid` (step 5 before step 6) | both |
| K1-DT-22 | unknown key `extra`, otherwise valid | Y | `instance-invalid` (step 1 before step 6) | both |

Steps for every rule:
1. H-BOOT, H-CONN, H-STUB. When "has instance" is Y, first attach stub-a with a valid
   descriptor.
2. Attach the rule's descriptor. Unless the rule says otherwise, a failing condition uses
   `major: 2`, `ui.chat: '//evil.example/'` or a transport without `close`.
3. Check the code; then check no side effect.

Rules with "has instance" N are also run through `validateAttachment` (static), which must throw
the same code.

---

## M1 — repository split into two packages

Owner: `packages/connector/**`, `packages/instance/**` (moves only), the root `package.json`
workspaces, and both `cordis.patch.yml`.

### Requirements

| R | Requirement (source) |
| --- | --- |
| M1-R1 | Two packages pack separately, named `fishball-connector` and `fishball-instance`; no plugin is named "Fishball" (design §18.2 M1 R1, §0.2; contract §0; U1). |
| M1-R2 | Each bundle patch inserts exactly its own row: the connector row (id `fishball` `[OQ-36]`, name `fishball-connector`) and `fishball-instance` (name `fishball-instance`) (design §18.2 M1 R2, §0.2, §0.6). |
| M1-R3 | The instance declares the connector as a peer dependency, and the connector depends on nothing of the instance. Installing the instance alone does not install the connector; the instance then reports `connector-missing` (design §18.2 M1 R3, §0.2, §0.6; U3). |
| M1-R4 | Behaviour is unchanged: the existing suite passes on the moved files, both packages pass `node --check`, and the connector's `./contract` export exposes the same names as K1's module (design §18.2 M1 R4, §18.1; contract §10). |
| M1-R5 | The connector's `package.json` declares `dsh.bundle.patch ./cordis.patch.yml` and `dsh.client ./client.js`, and exports `"."`, `"./client"`, `"./contract"`, `"./package.json"`. The instance's declares `dsh.bundle.patch ./cordis.patch.yml`. The root `package.json` lists both as workspaces (design §0.2, §18.1). |

### P — positive

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| M1-P-01 | P | M1-R1 | repository at M1's commit | `npm pack` in `packages/connector` and in `packages/instance` | Two tarballs, with `package.json` names `fishball-connector` and `fishball-instance`. Neither tarball contains the other package's files. | static |
| M1-P-02 | P | M1-R5 | M1-P-01 | Read the connector tarball's `package.json` | `dsh.bundle.patch` = `./cordis.patch.yml`; `dsh.client` = `./client.js`; `exports` has exactly `"."`, `"./client"`, `"./contract"`, `"./package.json"`, and each target exists in the tarball. | static |
| M1-P-03 | P | M1-R5 | M1-P-01 | Read the instance tarball's `package.json` | `dsh.bundle.patch` = `./cordis.patch.yml`, and the file exists in the tarball. | static |
| M1-P-04 | P | M1-R3 | M1-P-01 | Read both `package.json` files | The instance has `fishball-connector` in `peerDependencies`. The connector names `fishball-instance` in none of `dependencies`, `peerDependencies`, `optionalDependencies`, `devDependencies`, `bundledDependencies`. | static |
| M1-P-05 | P | M1-R4 | repository | `node --check` every `.js` / `.mjs` file in both tarballs | Every file passes. | static |
| M1-P-06 | P | M1-R5 | repository | Read the root `package.json` | `workspaces` contains `packages/connector` and `packages/instance`. | static |
| M1-P-07 | P | M1-R2 | M1-P-01 | Parse each tarball's `cordis.patch.yml` | The connector's has exactly one row insertion: id `fishball` `[OQ-36]`, name `fishball-connector`. The instance's has exactly one: id `fishball-instance`, name `fishball-instance`. Neither edits another row. | static |
| M1-P-08 | P | M1-R1, M1-R2 | H-BOOT; both tarballs | `dsh plugin add <connector.tgz> <instance.tgz>`; restart DSH; list the profile's rows | Both rows are present and enabled, the profile file was not edited by hand, and the boot has no error. | both |
| M1-P-09 | P | M1-R4 | repository at M1's commit; the existing suite re-pointed to the moved files `[OQ-28]` | Run the existing suite | Every case that passed at `535a807` passes; the counts are reported. | both |
| M1-P-10 | P | M1-R3 | repository | Static import scan: every `import`, `require` and dynamic `import()` specifier in `packages/connector/**` | None resolves into `packages/instance/**`, and none names `fishball-instance`. | static |
| M1-P-11 | P | M1-R1 | M1-P-08 done; H-UI | Open DSH's Plugins page (Installed) | It lists `fishball-connector` and `fishball-instance`. No installed plugin is named or labelled "Fishball" `[OQ-36]`. | both |
| M1-P-12 | P | M1-R4 | M1-P-01; K1's module at `bb0f756` as the baseline | Import `fishball-connector/contract` from the installed tarball; list its export names | They equal contract §10's list and the names of the module at `bb0f756`; K1-P-15 passes on the moved files. | static |

### EP — install set (negative and alternative classes)

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| M1-EP-01 | EP | M1-R2 | H-BOOT | Install the connector tarball only; restart | The boot succeeds; the connector row is present and enabled; there is no `fishball-instance` row; DSH's log has no error from either package. | both |
| M1-EP-02 | EP | M1-R2, M1-R3 | H-BOOT | Install the instance tarball only (peer missing); restart | The boot succeeds; the `fishball-instance` row is present and there is no connector row. The instance reports `connector-missing` and starts no child (U3; the owning task is `[OQ-27]`). | both |
| M1-EP-03 | EP | M1-R2 | H-BOOT | Install the instance and restart; then install the connector and restart | After the second restart both rows are present, with no duplicates. | both |
| M1-EP-04 | EP | M1-R2, M1-R3 | M1-P-08 done | `dsh plugin remove fishball-connector`; restart | The boot succeeds. The connector row is gone and is not reinstalled; `fishball-instance` stays, in `connector-missing` (U3). | both |
| M1-EP-05 | EP | M1-R2 | M1-P-08 done | Remove the instance package; restart | The boot succeeds; `fishball-instance` is gone; the connector row stays and behaves as connector-only (C1). | both |
| M1-EP-06 | EP | M1-R3 | repository | Static import scan of `packages/instance/**` | Every reference to the connector goes through the package name `fishball-connector` (its exports), never through a relative path into `packages/connector/` `[OQ-29]`. | static |
| M1-EP-07 | EP | M1-R3 | H-BOOT, offline (no registry reachable); no connector tarball available | `dsh plugin add <instance.tgz>` alone; restart twice | Nothing auto-installs (U3). The install does not try to fetch `fishball-connector`, and pnpm's peer auto-install must not pull it in. After each restart there is no `fishball-connector` package or row, and the instance is `connector-missing`. | both |

### DT — installed set × rows mounted × errors

| Rule / ID | connector installed | instance installed | Expected rows | Expected status / errors | Executed by | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| M1-DT-01 | N | N | neither | the boot succeeds; no Fishball row | this case: H-BOOT only, list the rows | both |
| M1-DT-02 | Y | N | connector row | the boot succeeds; the connector is in no-instance mode (C1) | M1-EP-01 | both |
| M1-DT-03 | N | Y | `fishball-instance` | the boot succeeds; `connector-missing`; no child; the connector is not auto-installed (U3) | M1-EP-02, M1-EP-07 | both |
| M1-DT-04 | Y | Y | both | the boot succeeds; no error | M1-P-08 | both |

---

## C1 — connector service and no-instance mode

Owner: `packages/connector/index.js`, `src/connector-service.js` (new), and the `src/intake.js`
delivery hook.

### Requirements

| R | Requirement (source) |
| --- | --- |
| C1-R1 | The `fishballConnector` service exists from apply, without any instance (design §18.2 C1 R; contract §1). |
| C1-R2a | No instance: `message_fishball`, `ask_fishball`, a finished-session notice and a hand-over note are queued in the intake ledger, bounded by `maxQueuedInputs` (the existing refusal past it) (design §0.4; contract §9). |
| C1-R2b | No instance: a permission request or question from a managed session is not offered to any instance; the user answers in that session (design §0.4, DESIGN.md §7a.5; contract §9). |
| C1-R2c | No instance: Hand over and Take back work; the session becomes managed or unmanaged (contract §9). |
| C1-R2d | No instance: managed-row marks are shown from the connector's own state (contract §9). |
| C1-R2e | Connector settings are edited in DSH's own form, with or without an instance (contract §0, §9; U2). The view's empty state is C3. |
| C1-R3 | Queued inputs are delivered with `inbox.push` once each, in arrival order, on the next attach, after the instance's handshake (design §18.2 C1 R; contract §1.1, §9). |
| C1-R4 | Unacknowledged items are delivered again after a reconnect, unchanged and with the same `dedupeKey`; acknowledged ones are not. An item the instance answers with an error stays queued, and nothing is retried on the same connection (design §18.2 C1 R; contract §3.3, §4.5). |
| C1-R5 | `detach()`, `transport.onClose` and disabling the connector row return the connector to no-instance mode; attaching while attached is illegal (design §18.2 C1 ST; contract §1.3). |
| C1-R6 | With the default limit 200, the 201st open input is refused `queue-full` (design §18.2 C1 AC; contract §8). |
| C1-R7 | No approval waits on an absent instance (design §18.2 C1 AC; DESIGN.md §7a.5). |

### P — positive

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C1-P-01 | P | C1-R1 | H-BOOT, H-CONN, H-PROBE; no instance plugin | Boot; read the probe's record | The probe applied (its required `fishballConnector` injection was satisfied), and `attachInstance` is a function. | both |
| C1-P-02 | P | C1-R3, C1-R4 | H-BOOT, H-CONN, H-STUB attached, H-MANAGED | `S1` calls `message_fishball({message:'m1'})` | The tool result reports success. One `inbox.push` arrives with `kind:'session'`, `sourceSessionId` = `S1`, text containing `m1`, and a `dedupeKey` and `messageId`. It is acked. After a detach and a new attach, `m1` is not delivered again. | both |
| C1-P-03 | P | C1-R2a, C1-R3 | H-STUB not attached, H-MANAGED | `S1` sends `m1`, `m2`, `m3` with `message_fishball` (three turns); then attach | Each tool result reports success (not `unavailable`, not refused). After the attach, exactly three `inbox.push` items arrive, `m1`, `m2`, `m3` in order, each once. Once all are acked, a detach and a new attach re-deliver nothing. | both |
| C1-P-04 | P | C1-R2c, C1-R2d | H-SESS, H-UI; no instance | Hand over `S1` (empty note); let it go idle; Take back | After Hand over, the header offers "Take back from Fishball", and the idle row of `S1` shows the Fishball mark. After Take back, the header offers "Hand over to Fishball" and the mark is gone. No error mentions a missing instance. | both |
| C1-P-05 | P | C1-R2e | H-UI; no instance | DSH's Plugins page → `fishball-connector` → settings; set `maxQueuedInputs` to 3; save | DSH's form shows the connector limits; the save is accepted; the row config holds 3. The new limit applies without a restart (C1-BVA-03). | both |
| C1-P-06 | P | C1-R3 | H-STUB not attached, H-SESS | Hand over `S1` with note `n1`; `S1` calls `message_fishball('m1', notify_when_finished:true)`; `S1`'s turn ends; attach | The items arrive in arrival order, each once `[OQ-33, OQ-34]`: first the note (`kind:'user'`, with `n1` outside the untrusted block), then `m1` (`kind:'session'`), then the finished notice (`kind:'watch'`). | both |

### EP — input kinds with no instance

Partitions (design §18.2 C1 EP): `message_fishball`, `ask_fishball`, finished notice, hand-over
note, permission request, question. Each case runs with H-STUB **not attached** and H-MANAGED
(except C1-EP-04, which hands over itself). These cases make up the "no instance" column of
C1-DT.

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C1-EP-01 | EP | C1-R2a | as above | `S1` calls `message_fishball('m1')`; attach | The tool result reports success (queued), never `unavailable`. `m1` is delivered once as `kind:'session'`. | both |
| C1-EP-02 | EP | C1-R2a, C1-R7 | as above | `S1` calls `ask_fishball` with a valid request; observe the call; attach | `[OQ-01]` Design §0.4 and contract §9 say queued and delivered on the next attach, while DESIGN.md §7a.5 says `unavailable` at once. On the literal contract reading, it is queued and delivered on attach, and the tool call does not wait for an instance. | both |
| C1-EP-03 | EP | C1-R2a | as above | `S1` calls `message_fishball('m1', notify_when_finished:true)`; its turn ends; attach | The finished notice is queued and then delivered once (`kind:'watch'`), after `m1`. | both |
| C1-EP-04 | EP | C1-R2a, C1-R2c | H-SESS (unmanaged), H-UI | Hand over `S1` with the note `please watch`; attach | Hand over succeeds (no 409; the session is managed). The note is delivered once as `kind:'user'`, outside the untrusted block. | both |
| C1-EP-05 | EP | C1-R2b, C1-R7 | as above | `S1` calls `fbtest_needs_ok`; time how long the stock prompt takes to appear in `S1`; Allow it in `S1`; then attach | The stock prompt shows in under 5 s (far below `approvalAnswerSeconds`, 120 s), and the call runs after Allow. After the attach, no `approval.request` and no `approval` inbox item arrive for it `[OQ-05]`. | both |
| C1-EP-06 | EP | C1-R2b, C1-R7 | as above | `S1` calls `ask_user_question`; answer it in `S1`'s own card; attach | The card shows at once, and the answer reaches `S1`. Nothing arrives for it after the attach. | both |

### ST — connector instance state

States:
- **N**: no instance.
- **H**: attached, waiting for the instance's handshake.
- **A**: attached and handshaken (ready).
- **D**: connector row disabled (the service is gone).

Events:

| Event | What happens |
| --- | --- |
| `e1` | a valid attach |
| `e2` | a refused attach |
| `e3` | `detach()` |
| `e4` | `transport.onClose` |
| `e5` | the connector row is disabled |
| `e6` | the connector row is enabled |
| `e7` | a valid handshake |
| `e8` | a refused handshake (`unsupported-capability`) |

| From \ Event | e1 | e2 | e3 | e4 | e5 | e6 | e7 | e8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **N** | H | N | N, no effect `[OQ-14]` | N, no effect `[OQ-14]` | D | — | — (no channel) | — |
| **H** | invalid: `instance-busy`, H | H | N | N | D `[OQ-15]` | — | A; queued items delivered | `[OQ-48]` |
| **A** | invalid: `instance-busy`, A | A | N | N | D `[OQ-15]` | — | invalid: `conflict`, A | — |
| **D** | invalid: the service cannot be injected | — | — | — | — | N (queued rows kept) | — | — |

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C1-ST-01 | ST N→H→A→N→H→A | C1-R3, C1-R5 | H-STUB, H-MANAGED | In N, `S1` sends `m1`; attach and handshake; `S1` sends `m2`; detach; in N, `S1` sends `m3`; attach and handshake | The first ready delivers `m1`; `m2` is delivered at once; `m3` is delivered after the second ready. Each arrives once and is acked. | both |
| C1-ST-02 | ST A→N (onClose) | C1-R5 | H-STUB ready, H-MANAGED | `stub.fireClose()`; `S1` sends `m1`; attach and handshake | `m1` is queued: no `send` follows the close in `transportCalls()`. It is delivered once after the new ready. | both |
| C1-ST-03 | ST A + e1 (invalid) | C1-R5 | stub-a ready | Attach stub-b (valid) | `instance-busy`; `S1`'s next `m1` reaches stub-a only. | both |
| C1-ST-04 | ST A→D→N | C1-R5 | stub-a ready, H-PROBE, H-MANAGED; one item unacked (`ackPolicy(0)`) | Disable the connector row; enable it; attach a new stub descriptor and handshake | At the disable, the probe is disposed and the stub sees its attachment end `[OQ-15]`. At the enable, the probe applies again, the connector is in N, and the old handle's `detach()` has no effect. After the new ready, the unacked item is delivered once with its original `dedupeKey`. | both |
| C1-ST-05 | ST N + stale e3 | C1-R5 | attach stub-a, then detach it | Call the old handle's `detach()` again | No error and no change: the next attach is accepted `[OQ-14]`. | both |
| C1-ST-06 | ST A(b) + stale e3/e4 of a | C1-R5 | attach stub-a; detach; attach stub-b and handshake | Call stub-a's old `detach()`; fire stub-a's old `onClose` handlers | stub-b stays attached: `S1`'s next `m1` reaches stub-b `[OQ-14]`. | both |
| C1-ST-07 | ST detach mid-delivery | C1-R4 | H-STUB not attached, H-MANAGED; `m1`..`m5` queued | `ackPolicy(2)`; attach and handshake; wait for five pushes; detach; `ackPolicy(all)`; attach and handshake | The second ready delivers exactly `m3`, `m4`, `m5`, in order, each with its first push's `dedupeKey`; `m1` and `m2` are not sent again. | both |
| C1-ST-08 | ST A→N while a request waits | C1-R7 | stub ready (it never answers), H-MANAGED | `S1` calls `fbtest_needs_ok`; the stub receives `approval.request`; detach | Right after the detach, `S1` shows DSH's stock prompt; it does not wait out `approvalAnswerSeconds`. Repeat with `fireClose()`: the same result. | both |
| C1-ST-09 | ST N across a DSH restart | C1-R3 | H-STUB not attached, H-MANAGED | `S1` sends `m1`, `m2`; stop and start DSH on the same home; attach and handshake | `m1` and `m2` are delivered once each, in order (the ledger is durable). | both |
| C1-ST-10 | ST A, the instance refuses an item | C1-R4 | H-STUB ready, H-MANAGED | `errorPolicy('operation-failed')` for the next push; `S1` sends `m1`, then `m2`; wait 5 s; detach; attach and handshake (default policy) | `m1` is pushed once and answered with the error; it is not pushed again on that connection (nothing is retried). `m2` is acked. After the new ready, `m1` arrives again with the same `dedupeKey`, and `m2` does not. | both |
| C1-ST-11 | ST H + e8 | C1-R3 | H-STUB (handshake off), H-MANAGED; `m1` queued | Attach; handshake with an unknown required capability; then try a valid attach of a second descriptor | No `inbox.push` arrives on the refused channel, and `m1` stays queued. Whether the second attach is accepted (the connector is back in N) or refused `instance-busy` is `[OQ-48]`. Either way `m1` is delivered once after the next successful ready. | both |

### BVA — queue bound `maxQueuedInputs`

The default is 200 and the minimum 1 (DESIGN.md §16: whole numbers ≥ 1; it counts open rows,
`pending` and `accepted`). The limit is set only in DSH's form (U2, contract §8). Inputs are
`message_fishball` calls with no instance attached, unless a case says otherwise.

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C1-BVA-01 | BVA (max − 1 → max) | C1-R2a, C1-R6 | H-STUB not attached, H-MANAGED; default limit | Queue 199 inputs; send the 200th | The 200th is accepted. | both |
| C1-BVA-02 | BVA (max + 1) | C1-R6 | C1-BVA-01 done | Send the 201st; attach, handshake and count | The 201st is refused `queue-full` ("Fishball's queue is full") at once `[OQ-02]`. Exactly 200 items arrive, in order, and the 201st never does. | both |
| C1-BVA-03 | BVA (min) | C1-R2a | limit 1 (set in DSH's form) | Send `m1`, then `m2` | `m1` is accepted; `m2` is refused `queue-full`. | both |
| C1-BVA-04 | BVA (min − 1) | C1-R2e | H-UI | In DSH's form set `maxQueuedInputs` = 0; save | DSH refuses it and keeps the old value. | both |
| C1-BVA-05 | BVA (back below max) | C1-R6 | limit 3; three open; the fourth was refused | Attach with `ackPolicy(1)` and handshake; after the ack, `S1` sends one input, then another | The first is accepted (2 + 1 = 3); the second is refused `queue-full` `[OQ-32]`. | both |
| C1-BVA-06 | BVA (kinds at the bound) | C1-R2a | limit 2; two `message_fishball` open | Hand over `S2` with a note; let a watched `S1` finish | `[OQ-03]` On the literal reading, both are refused as queue-full, and Hand over still makes `S2` managed (it must not answer 409, design §5.2). | both |

### DT — input kind × instance attached

C1-EP executes the "N" column. C1-DT-01..06 execute the "Y" column, with H-STUB ready (after the
handshake) and H-MANAGED.

| Kind | Instance N → outcome (case) | Instance Y → outcome (case) |
| --- | --- | --- |
| `message_fishball` | queued; delivered on attach (C1-EP-01) | delivered at once: `inbox.push` `kind:'session'` (**C1-DT-01**) |
| `ask_fishball` | queued `[OQ-01]` (C1-EP-02) | offered to the instance: `approval.request` and an `approval`-kind inbox notice; the stub's `approval.answer` (allow, low risk, a reason) lets the call run (**C1-DT-02**) |
| finished-session notice | queued (C1-EP-03) | delivered at once: `kind:'watch'` (**C1-DT-03**) |
| hand-over note | queued (C1-EP-04) | delivered at once: `kind:'user'` `[OQ-34]` (**C1-DT-04**) |
| permission request | offered to the user in `S1` at once (C1-EP-05) | offered to the instance: `approval.request` reaches the stub and `S1` waits; the stub's `approval.answer` decides it (**C1-DT-05**) |
| question | offered to the user in `S1` at once (C1-EP-06) | offered to the instance: `approval.request` with `kind:'question'` and `questions[]`; the stub's `question.answer` reaches `S1` under the default question mode, Auto (**C1-DT-06**) |

All DT cases: Ver both.

---

## C2 — connector settings: DSH's own form only

Owner: `src/connector-settings.js` (new), the `src/preferences.js` migration, and the bridge
handlers in `src/slim/host/bridge.js`.

Superseded: design §18.2 C2's `settings.describe/update` behaviour (all-or-nothing updates,
`settings-conflict`, the revision) and its brand and sidebar migration. Under U1, U2 and U4,
contract v1 has no settings operations, so C2 covers two things:
- the connector's settings are edited only in DSH's form and take effect there;
- an instance cannot reach them over the contract (negative cases only).

### Requirements

| R | Requirement (source) |
| --- | --- |
| C2-R1 | Connector settings (every limit in `src/config.js` `[OQ-20]` and the question mode) are edited only in DSH's form for `fishball-connector`. They persist in the row config and apply without a restart, with or without an instance (contract §0, §8, §9; design §0.7 as amended by U2; DESIGN.md §16). |
| C2-R2 | An instance can neither read nor change any connector setting over the contract: v1 has no `settings.*` operation, and a frame naming one is not served (contract §0; U4). |
| C2-R3 | DSH's form refuses a value below its minimum or not a whole number and keeps the old value; the hourly caps accept 0 (cap off) (DESIGN.md §16; design §18.2 C2 BVA). |
| C2-R4 | No brand-icon or sidebar-entry setting exists, and an old stored brand or sidebar preference has no effect (U1; contract §0 conflicts, `[OQ-42]`). |
| C2-R5 | The store's preference table migrates into the row config once (design §0.7). Under U1 the only connector preference left to migrate is the question mode `[OQ-22]`. |

### P — positive

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C2-P-01 | P | C2-R1 | H-BOOT, H-CONN, H-UI; fresh profile | Open DSH's form | It shows every connector limit with its DESIGN.md §16 default `[OQ-20]` (for example `maxQueuedInputs` 200, `maxActiveWatches` 50, `maxPendingApprovals` 8), and the question mode with Auto, Fishball and User, defaulting to Auto. | both |
| C2-P-02 | P | C2-R1 | H-UI | Set `maxQueuedInputs` 200 → 150; save; reload | Accepted; the row config holds 150, and the form shows 150 after the reload. | both |
| C2-P-03 | P | C2-R1 | H-UI | Set `maxQueuedInputs` 150 and `maxActiveWatches` 40 in one save | Both are stored and shown after a reload. | both |
| C2-P-04 | P | C2-R1 | C2-P-03 done | Restart DSH; open the form | 150 and 40 are still stored and shown. | both |
| C2-P-05 | P | C2-R1 | no instance; H-MANAGED; H-UI | Set `maxQueuedInputs` 2; with no restart, `S1` sends three `message_fishball` | The first two are accepted; the third is refused `queue-full` (the change applied live). | both |
| C2-P-06 | P | C2-R1, C2-R2 | H-STUB ready; H-MANAGED; H-UI | Set `maxQueuedInputs` 2 in the form while attached; send `m1` and check delivery; detach; `S1` sends three messages | The save is accepted while attached. The stub stays attached (`m1` is delivered), and nothing in `stub.received()` carries a setting value: only the handshake response, `inbox.push`, `approval.*`, `watch.status` and `session.state` frames. After the detach, the third message is refused `queue-full`. | both |
| C2-P-07 | P | C2-R1 | H-STUB ready; H-MANAGED; H-UI | Set the question mode to User in DSH's form; `S1` calls `ask_user_question`; when the stub gets `approval.request` with `kind:'question'`, it sends `question.answer` with `answers` | The answer is refused `mode-user` (contract §4.2), and the question stays with the user in `S1`. The mode applied without a restart. | both |
| C2-P-08 | P | C2-R5 | H-OLD (question mode User stored by the old build) | Boot the connector build; open DSH's form; inspect the disposable home's store | `[OQ-22]` Expected if the question mode migrates: the form shows User, the row config holds it, and the store no longer holds the preference record. | both |

### EP — negative (equivalence partitions)

Partitions:
- **Edit path**: DSH's form (allowed) / the contract (does not exist, U4) / the injected
  service.
- **Contract frame**: a `settings.*` operation / another settings-like name / a setting
  smuggled into a valid operation / a capability.
- **Form value**: whole ≥ min / fraction / non-number.
- **Brand and sidebar setting**: exists / does not exist.

Every case checks "nothing changed".

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C2-EP-01 | EP | C2-R2 | H-STUB ready | Send `request` `settings.update` `{revision:1, values:{maxQueuedInputs:150}}` | Not served (as K1-EP-57, `[OQ-44]`): never a `response`. Nothing changed: the form shows 200, and with no instance the 201st input is still refused. | both |
| C2-EP-02 | EP | C2-R2 | H-STUB ready | Send `request` `settings.describe` `{}` | Not served; no frame the stub receives contains a connector setting value. | both |
| C2-EP-03 | EP | C2-R2 | H-STUB ready, a fresh attach per name | Send requests named `settings.set`, `settings.patch`, `config.update`, `limits.update`, `plugin.settings`, each with `{values:{maxQueuedInputs:150}}` | Each is not served; nothing changed. | both |
| C2-EP-04 | EP | C2-R2 | H-STUB ready | Send `session.list` `{limit:10, maxQueuedInputs:1}` (a setting smuggled into a valid operation) | Refused as invalid (exact keys; K1-EP-51); nothing changed. | both |
| C2-EP-05 | EP | C2-R2 | H-STUB attached, a fresh attach per variant | `handshake(['inbox.push','settings.update'], [])`; then `handshake(['inbox.push','settings.update'], ['settings.update'])` | The first succeeds and its welcome lists no `settings.*`. The second is refused `[OQ-43]`. Nothing changed. | both |
| C2-EP-06 | EP | C2-R2 | H-PROBE | Read the injected service's own and inherited member names | Only `attachInstance` is a documented member, and no member reads or writes settings `[OQ-49]`. | both |
| C2-EP-07 | EP | C2-R3 | H-UI | Enter `maxQueuedInputs` = `2.5`; save | DSH refuses it; the old value stays. | both |
| C2-EP-08 | EP | C2-R3 | H-UI | Enter `maxQueuedInputs` = `abc`, then an empty field; save | DSH refuses both; the old value stays. | both |
| C2-EP-09 | EP | C2-R4 | fresh profile; H-UI | Read DSH's form and the row config | Neither has a brand-icon or sidebar-entry field (no key containing `brand`, `icon`, `sidebar` or `entry`, and no field labelled like "Use the DeepSeek icon" or "Sidebar entry") `[OQ-42]`. | both |
| C2-EP-10 | EP | C2-R4 | H-OLD; H-UI | Boot the connector build; read the form and the row config; look at the sidebar; call `POST /api/fishball/brand` and `POST /api/fishball/sidebar-entry {entry:'brand'}` | No brand or sidebar field appears. The icon is the fixed fish with the wrench badge (C3-EP-07), and the panel-list row is shown `[OQ-39]`. The old routes have no effect on either `[OQ-22]`. There is no migration error at boot. | both |

### BVA — numeric limits in DSH's form

Data-driven over every `number` limit `F` in DSH's form, with its schema minimum.

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C2-BVA-01 | BVA (min − 1) | C2-R3 | H-UI; for each `F` | Set `F` = `min − 1`; save | Refused; the old value stays. | both |
| C2-BVA-02 | BVA (min) | C2-R1, C2-R3 | as above | Set `F` = `min`; save | Stored and shown. | both |
| C2-BVA-03 | BVA (min + 1) | C2-R1, C2-R3 | as above | Set `F` = `min + 1`; save | Stored. | both |
| C2-BVA-04 | BVA (hourly cap 0) | C2-R3 | each hourly cap in the form (`messagesPerHour`, `sessionsPerHour`; `wakeupsPerHour` only if it still exists `[OQ-20]`) | Set −1, then 0, then 1 | −1 is refused; 0 is stored (the cap is off); 1 is stored. | both |
| C2-BVA-05 | BVA (max, max + 1) | C2-R3 | — | Upper boundaries | `[OQ-19]` No maximum is stated, so no case can be derived. | both |

### ST — a stored connector setting

| From \ Event | DSH form, valid | DSH form, invalid | instance sends a settings frame | detach + attach | DSH restart | boot with an old store record |
| --- | --- | --- | --- | --- | --- | --- |
| v | v′ (stored, live) | v (refused) | v (not served) | v | v | migrated once `[OQ-22]` |

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C2-ST-01 | ST | C2-R1, C2-R2 | H-STUB ready; `maxQueuedInputs` 200 | Instance `settings.update` to 150 → form edit to 150 → instance `settings.update` to 200 → detach and test the bound | Not served (200) → stored (150) → not served (150) → the 151st input is refused `queue-full`. | both |
| C2-ST-02 | ST | C2-R3 | H-UI; 200 | Form 0 → form 1 | Refused (200) → stored (1). | both |
| C2-ST-03 | ST | C2-R1 | 150 stored; H-STUB ready | Detach and attach; restart DSH; attach | 150 throughout (the form shows it, and the bound holds at 150). | both |
| C2-ST-04 | ST (migration once) | C2-R5 | H-OLD | Boot (migrates); set the question mode to Auto in the form; restart; open the form | `[OQ-22]` After the second boot the mode is Auto: the migration ran once and did not overwrite the row config. | both |

### DT — edit source × value valid × instance attached

| Rule / ID | Edit source | Value valid | Instance attached | Expected | Ver |
| --- | --- | --- | --- | --- | --- |
| C2-DT-01 | DSH form | Y | N | stored and applied live | both |
| C2-DT-02 | DSH form | Y | Y | stored and applied; the instance stays attached and receives no settings frame | both |
| C2-DT-03 | DSH form | N | N | refused by DSH; the old value stays | both |
| C2-DT-04 | DSH form | N | Y | refused by DSH; the old value stays | both |
| C2-DT-05 | contract frame | Y | Y | not served; nothing changed | both |
| C2-DT-06 | contract frame | N | Y | not served; nothing changed | both |
| — | contract frame | any | N | not executable: with no instance there is no transport | — |

Values used: valid = `maxQueuedInputs` 150; invalid = `maxQueuedInputs` 0.

---

## C3 — connector client: opener and no-instance view

Owner: `packages/connector/client.js` (the opener view, the Plugins-page link, and removal of the
settings renderers). UI cases use H-BOOT + H-CONN + H-UI; "attached" uses H-STUB, after its
handshake. The view is the Fishball view in DSH's main area (design §7). The iframe `src` is read
with `getAttribute('src')`.

### Requirements

| R | Requirement (source) |
| --- | --- |
| C3-R1 | The sidebar row and the brand button open the view. The row is id `fishball` in `sidebar.panellist`, above Plugins, with DSH's selected highlight and `aria-current`, and it is always shown, since the switch is gone (design §18.2 C3 R, §7; contract §9; U1; `[OQ-39]`). |
| C3-R2 | With an instance whose `ui.chat` is set, the view frames exactly that path, with no query, fragment or token added (design §18.2 C3; contract §1.2). |
| C3-R3 | With no instance, the view shows an empty state saying that no instance is attached ("No Fishball instance is attached", design §0.4) and a link to the Plugins page, and never an iframe (contract §9). |
| C3-R4 | The connector's Plugins-page entry opens the instance's `ui.settings` when present, else DSH's form. DSH's form stays reachable while an instance is attached, because the connector settings are edited only there (design §18.2 C3, §0.7; contract §0, §1.2; U2; `[OQ-24]`). |
| C3-R5 | Managed-row marks and Hand over keep their current behaviour (design §18.2 C3). |
| C3-R6 | No settings renderer is left in `client.js`, including any brand or sidebar control (design §18.2 C3; U1). |
| C3-R7 | The opener shows the instance's `status()` — a `STATUS` state and a `STATUS_CODES` code, or `null` — and Retry calls `retry()` (contract §1, §1.1, §6; design §7). |
| C3-R8 | The light and dark themes both work (design §18.2 C3 AC). |
| C3-R9 | The connector icon is fixed: the Fishball fish logo with a wrench badge (U1; `[OQ-37]`). |

### P — positive

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C3-P-01 | P | C3-R1 | no instance | Click the sidebar panel-list row "Fishball" | The view opens in the main area; the row is selected (DSH's highlight and `aria-current`) and sits above Plugins. | both |
| C3-P-02 | P | C3-R1 | no instance; a session open | Click the top-left brand button | The same view opens, and the row shows as selected. | both |
| C3-P-03 | P | C3-R2 | stub attached with `ui.chat:'/fbtest/chat/'` | Open the view | Exactly one `iframe`, with `src` === `'/fbtest/chat/'`, a `title`, `allow="clipboard-write"` and no `sandbox` attribute (design §7). The fixture page loads. | both |
| C3-P-04 | P | C3-R2 | `ui.chat:'/fbtest/chat/?a=1#top'` | Open the view | `src` === `'/fbtest/chat/?a=1#top'` exactly. The fixture records the path and query `/fbtest/chat/?a=1`, with nothing appended. | both |
| C3-P-05 | P | C3-R4 | `ui.chat` and `ui.settings:'/fbtest/settings/?view=settings'` | Use the connector's Plugins-page settings entry `[OQ-24]` | The instance's settings page opens at exactly `ui.settings` (the fixture records it). | both |
| C3-P-06 | P | C3-R4, C3-R6 | no instance | Use the same entry | DSH's own form for the connector row opens, with the connector settings. No custom Fishball settings page appears. | both |
| C3-P-07 | P | C3-R3 | no instance | Open the view; click the link | "No Fishball instance is attached" and a link; no `iframe` in the view's DOM. The link opens DSH's Plugins page `[OQ-31]`. | both |
| C3-P-08 | P | C3-R7 | `ui.chat`; `status` → `{state:'ready', code:null}` | Open the view | It frames `ui.chat` and shows the state as a tag in the one-line header `[OQ-25]`. | both |
| C3-P-09 | P | C3-R7 | `ui.chat`; `status` → `{state:'failed', code:'NATIVE_CHILD_EXITED'}`; `retry` recorded | Open the view; click Retry | Centred, in DSH's empty/error style: the state, the code `NATIVE_CHILD_EXITED` and Retry (the accent button), with no URL, token or path in the text (design §11). One click → `retryCalls()` = 1. | both |
| C3-P-10 | P | C3-R5 | H-SESS; first with no instance, then attached | Hand over `S1`; let it go idle; Take back | Both instance states behave the same: one "Hand over to Fishball" action with the optional note dialog (design §8.3), the idle mark with its dots, and "Take back from Fishball" while managed. | both |
| C3-P-11 | P | C3-R6 | repository at C3's commit | Static scan of `packages/connector/client.js` | None of design §15 T15's settings renderers remain (`makeNativeSettings`, `makeModelSettings`, `makeChildPlugins`, `makeChildSettings`, `makeBrandStyle`, the question-mode renderer, the limits form), nor a sidebar-entry switch, nor the paths `/api/fishball/native/admin/`, `/api/fishball/brand`, `/api/fishball/sidebar-entry`. | static |
| C3-P-12 | P | C3-R8 | dark, then light | Repeat C3-P-07, C3-P-03 and C3-P-09 in each theme | Screenshots in both themes. Text, link and Retry are legible on DSH's surface colours (no white panel in dark, no dark panel in light). | both |
| C3-P-13 | P | C3-R9, C3-R8 | no instance, then attached; light and dark | Screenshot the row's icon and the brand button's icon | Both show the fish logo with a wrench badge, the same in every instance state and theme `[OQ-37]`; no DeepSeek-icon variant. | both |
| C3-P-14 | P | C3-R4 | `ui.chat` and `ui.settings` | From the Plugins page, reach DSH's own form for the connector row; change `maxActiveWatches`; save | The form is reachable while attached `[OQ-24]`, and the value is stored (as C2-P-06). | both |
| C3-P-15 | P | C3-R2 | `ui.chat:'/fbtest/chat/'` | Use "Open in a tab" | `[OQ-25]` If kept: a new tab on the main origin at exactly `ui.chat`. | both |

### EP — instance classes

Partitions:
- design §18.2 C3: no instance / attached without `ui` / chat only / chat and settings;
- settings only, which the DT needs;
- a refused attach;
- an upgraded home (U1);
- the `status()` states of contract §6.

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C3-EP-01 | EP | C3-R3, C3-R4 | no instance | Open the view; then the Plugins entry | View: the empty state, no iframe. Entry: DSH's form. | both |
| C3-EP-02 | EP | C3-R3, C3-R4 | attached without `ui` | as above | View: `[OQ-23]`, at least no iframe. Entry: DSH's form. | both |
| C3-EP-03 | EP | C3-R2, C3-R4 | `ui.chat` only | as above | The view frames `ui.chat`. Entry: DSH's form. | both |
| C3-EP-04 | EP | C3-R2, C3-R4 | `ui.chat` and `ui.settings` | as above | The view frames `ui.chat`. The entry opens `ui.settings` `[OQ-24]`. | both |
| C3-EP-05 | EP | C3-R4 | `ui.settings` only | as above | View: `[OQ-23]`, with no iframe of `ui.settings` in the chat view. The entry opens `ui.settings`. | both |
| C3-EP-06 | EP | C3-R3 | the stub's attach was refused (`ui.chat:'//evil.example/'`) | Open the view | The empty state, no iframe, and nothing requested from `evil.example`. | both |
| C3-EP-07 | EP | C3-R9, C3-R1 | H-OLD (DeepSeek-icon preference and sidebar entry `brand`) | Boot the connector build; look at the sidebar and the brand button | The icon is the fish with the wrench badge; the panel-list row is shown `[OQ-39]`; the brand opens the view. | both |
| C3-EP-08 | EP | C3-R7 | `ui.chat`, one fresh view per value | `status()` returns, in turn, `{state:'disabled', code:'NATIVE_DISABLED'}`, `{state:'waiting', code:null}`, `{state:'starting', code:null}`, `{state:'stopping', code:null}`, `{state:'stopped', code:null}` and `{state:'failed', code:'NATIVE_START_FAILED'}`; then the stub has no `status` at all; then `status` throws, and returns `{state:'odd', code:'X'}` | Each non-ready state shows the state screen with the state and the code (if any), and no iframe (design §7). With no `status`: `[OQ-25]`. A throwing or out-of-vocabulary `status`: `[OQ-53]`. In every case the view shows no stack trace, URL or token. | both |

### ST — the view

States: **E** the empty state; **F(p)** framing the path p; **X** a state screen (status not
ready).

| From \ Event | attach p | detach / onClose | re-attach q | status → not ready | status → ready | leave + re-open |
| --- | --- | --- | --- | --- | --- | --- |
| E | F(p) | E | — | E | E | E |
| F(p) | invalid (`instance-busy`), F(p) | E | — (needs a detach first) | X | F(p) | F(p) |
| X | invalid, X | E | — | X | F(p) `[OQ-25]` | X |

| ID | T | R | Preconditions | Steps | Expected | Ver |
| --- | --- | --- | --- | --- | --- | --- |
| C3-ST-01 | ST E→F→E | C3-R2, C3-R3 | no instance; view open | Attach with `ui.chat:'/fbtest/chat/'` (no reload); then detach | The open view switches to the frame (the exact `src`) without a reload `[OQ-26]`. After the detach, the iframe is removed and the empty state shows. | both |
| C3-ST-02 | ST F→E (onClose) | C3-R3 | attached; view open | `stub.fireClose()` | The empty state; no iframe. | both |
| C3-ST-03 | ST F(p)→E→F(q) | C3-R2 | p = `/fbtest/chat/`; view open | Detach; attach with q = `/fbtest/chat/?v=2` | The final `src` === q. | both |
| C3-ST-04 | ST F + invalid attach | C3-R2 | attached with p; view open | A second descriptor with q tries to attach (`instance-busy`) | Still p; no second iframe. | both |
| C3-ST-05 | ST E (view closed) → F | C3-R2 | view closed; attach with p | Open the view | It frames p. | both |
| C3-ST-06 | ST leave + re-open | C3-R1 | F(p) | Open session `S1`; click the Fishball row again | `S1` replaces the view (`selectPanel(null)`); then the view mounts again in F(p). | both |
| C3-ST-07 | ST F→X→F | C3-R7 | attached with p; ready | `setStatus({state:'failed', code:'NATIVE_TIMEOUT'})`; click Retry; `setStatus({state:'ready', code:null})` | The state screen shows `NATIVE_TIMEOUT` and Retry; `retry()` is called once; then the frame returns `[OQ-25]`. | both |

### DT — instance × ui.chat × ui.settings

| Rule / ID | Instance | `ui.chat` | `ui.settings` | View | Plugins entry opens | DSH's form reachable | Executed by | Ver |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C3-DT-01 | N | — | — | empty state, link, no iframe | DSH's form | yes | C3-EP-01 | both |
| C3-DT-02 | Y | N | N | `[OQ-23]`, no iframe | DSH's form | yes | C3-EP-02 | both |
| C3-DT-03 | Y | Y | N | iframe `src` = `ui.chat` | DSH's form | yes | C3-EP-03 | both |
| C3-DT-04 | Y | N | Y | `[OQ-23]`, no iframe | `ui.settings` `[OQ-24]` | yes `[OQ-24]` | C3-EP-05 | both |
| C3-DT-05 | Y | Y | Y | iframe `src` = `ui.chat` | `ui.settings` `[OQ-24]` | yes `[OQ-24]` | C3-EP-04, C3-P-14 | both |

---

## Traceability: acceptance criteria → cases

AC rows marked (U1), (U2) or (U4) restate design §18.2's criteria as the user's decisions and the
frozen contract amend them.

| Task | AC (source) | Cases |
| --- | --- | --- |
| K1 | AC1: every case returns the documented result or code (§18.2; contract §1–§8) | K1-P-01..16, K1-EP-01..58, K1-BVA-01..31, K1-DT-01..22 |
| K1 | AC2: a refused attach leaves the connector in its prior state (§18.2; contract §1.3) | K1-EP-01..06, K1-EP-08..10, K1-EP-13..19, K1-EP-21..29, K1-EP-32..35, K1-BVA-01, K1-BVA-04, K1-BVA-06, K1-DT-02..22, C1-ST-03, C3-EP-06, C3-ST-04 |
| K1 | AC3: the doc-vs-module check finds no name in one and not the other (§18.2 R5; contract §10) | K1-P-04, K1-P-12, K1-P-15, K1-EP-54, K1-EP-58, M1-P-12 |
| K1 | (U4) no settings operation and no settings code in v1 | K1-EP-48, K1-EP-55..58, C2-EP-01..05 |
| K1 | Done when: the binding API, the `fishballConnector` service and the version rules are defined and validated (§18.1) | K1-P-01..05, K1-EP-08..14, K1-EP-36..41, C1-P-01 |
| M1 | AC1: a connector-only install boots with the connector row and no instance row | M1-EP-01, M1-EP-05, M1-DT-02 |
| M1 | AC2 (U3): an instance-only install boots in `connector-missing`, with no auto-install | M1-EP-02, M1-EP-04, M1-EP-07, M1-DT-03 |
| M1 | AC3: both boot with both rows | M1-P-08, M1-EP-03, M1-DT-04 |
| M1 | AC4: no import from `packages/connector` reaches into `packages/instance` | M1-P-10 (reverse: M1-EP-06) |
| M1 | Done when: `node --check` passes, both pack, the old tests pass, the contract export is unchanged; no plugin "Fishball" (U1) | M1-P-01..07, M1-P-09, M1-P-11, M1-P-12, M1-DT-01 |
| C1 | AC1: with no instance, every input row of §0.4 / contract §9 behaves as listed | C1-EP-01..06, C1-P-03..06, C1-BVA-03..04 |
| C1 | AC2: after attach, the queued items arrive exactly once, in order | C1-P-02, C1-P-03, C1-P-06, C1-ST-01, C1-ST-02, C1-ST-04, C1-ST-07, C1-ST-09..11, C1-DT-01..06, K1-P-09 |
| C1 | AC3: the 201st input with the default limit 200 is refused `queue-full` | C1-BVA-01, C1-BVA-02, C1-BVA-05, C1-BVA-06 |
| C1 | AC4: no approval waits on an absent instance | C1-EP-02, C1-EP-05, C1-EP-06, C1-ST-08 |
| C1 | Done when: the binding and no-instance table hold (§18.1) | C1-P-01, C1-ST-01..06, C1-ST-11 |
| C2 | AC1 (U2): a valid change in DSH's form is stored, shown again, and applied live with or without an instance | C2-P-01..07, C2-BVA-02..04, C2-ST-01..03, C2-DT-01..02 |
| C2 | AC2 (U2, U4): an instance cannot read or change connector settings over the contract; every attempt is not served and changes nothing | C2-EP-01..06, C2-P-06, C2-ST-01, C2-DT-05..06, K1-EP-55..58 |
| C2 | AC3: an invalid value in DSH's form is refused and the old one kept | C2-EP-07..08, C2-BVA-01, C2-BVA-04, C2-ST-02, C2-DT-03..04, C1-BVA-04 |
| C2 | AC4 (U1, replacing the brand and sidebar migration): no brand or sidebar setting exists; old preferences have no effect; the remaining migration runs once | C2-EP-09, C2-EP-10, C2-P-08, C2-ST-04, C3-EP-07 |
| C3 | AC1: the four instance cases show exactly the table's outcome | C3-EP-01..05, C3-DT-01..05, C3-P-05, C3-P-06 |
| C3 | AC2: the iframe `src` equals `ui.chat` | C3-P-03, C3-P-04, C3-ST-01, C3-ST-03, C3-ST-05 |
| C3 | AC3: the empty state never renders an iframe | C3-P-07, C3-EP-01, C3-EP-06, C3-ST-01, C3-ST-02 |
| C3 | AC4: light and dark themes both checked | C3-P-12, C3-P-13 |
| C3 | R: the entries open the view; marks and Hand over unchanged; no settings renderer left; `status()` and Retry; DSH's form reachable while attached (U2); a fixed icon (U1) | C3-P-01, C3-P-02, C3-P-08..11, C3-P-13..15, C3-EP-07, C3-EP-08, C3-ST-06, C3-ST-07 |

## Case counts

| Task | P | EP | ST | DT | BVA | Total |
| --- | --- | --- | --- | --- | --- | --- |
| K1 | 16 | 58 | 0 | 22 | 31 | 127 |
| M1 | 12 | 7 | 0 | 4 | 0 | 23 |
| C1 | 6 | 6 | 11 | 6 | 6 | 35 |
| C2 | 8 | 10 | 4 | 6 | 5 | 33 |
| C3 | 15 | 8 | 7 | 5 | 0 | 35 |
| **All** | 57 | 89 | 22 | 43 | 42 | **253** |

Notes on the counts:
- M1 has no BVA and K1 no ST because design §18.2 names none for them.
- DT rules executed by other cases (M1-DT, C3-DT) are counted once, as DT rules.
- C2's non-executable DT rule is not counted.

## Open questions

Each entry is a gap or a conflict in design §0 / §18.2 at `3509859`, in the contract at
`bb0f756`, or in U1–U4. Re-check the cases tagged with its id once it is answered.
**Closed** entries keep their numbers so the tags stay stable.

| # | Question | Cases |
| --- | --- | --- |
| OQ-01 | **`ask_fishball` with no instance: the sources conflict.** Design §0.4 and contract §9 queue it and deliver it on the next attach; DESIGN.md §7a.5 answers `unavailable` at once; design §18.2 C1 AC says "no approval waits on an absent instance". Which holds? If it is queued, does the tool call return at once, and with what result? | C1-EP-02, C1-DT-02 |
| OQ-02 | Past `maxQueuedInputs`: design §18.2 names `queue-full`, while contract §9 says "the existing refusal" (DESIGN.md §16: "Fishball's queue is full"). Is the code `queue-full` for every producer? | C1-BVA-02..06 |
| OQ-03 | Which inputs count toward `maxQueuedInputs`, and what does a full queue do to a hand-over note, a Take back `system` row and a finished notice (Hand over must not answer 409)? | C1-BVA-06 |
| OQ-04 | **Closed** (contract §1.1): the connector never sends before the instance's handshake; delivery starts after it. | — |
| OQ-05 | Contract §5.1: "after each ready handshake the connector offers the live requests again". Is a request that went to the user's stock prompt when no instance was attached, or at a detach, still "live" and offered again? If so, does the instance's answer close the user's prompt? | C1-EP-05, K1-P-16 |
| OQ-06 | **Closed** (contract §1.3): a refusal throws `ContractError` with `.code`. | — |
| OQ-07 | **Closed** (contract §1.3): a fixed check order. | — |
| OQ-08 | Is there a read-only observation surface on `fishballConnector` (the current instance, its state, the attach count in I1's AC)? | C1-ST-* |
| OQ-09 | **Closed** (contract §2, §3.2; U4): any minor is accepted; the connector's minor is 0; the instance advertises capabilities; the handshake decides the operations. | — |
| OQ-10 | **Closed** (contract §1.1): `contract` has exact keys and whole numbers, else `contract-version`. | — |
| OQ-11 | **Closed** (U4): `instance-invalid`. | — |
| OQ-12 | **Closed** (contract §1.2; U4): fragments are accepted; code points are counted; `/\host` and tab or newline tricks are refused. The remaining variants are OQ-50 and OQ-52. | — |
| OQ-13 | **Closed** (contract §1.1): "four functions", so a non-function method is `transport-invalid`. | — |
| OQ-14 | Is a second `detach()`, a stale handle's `detach()`, or a stale transport's `onClose` after a newer attach a no-op (expected) or an error? | C1-ST-05, C1-ST-06 |
| OQ-15 | When the connector row is disabled while attached, how is the instance told (`transport.close()`, `onClose`, or only through its own disposal)? | C1-ST-04 |
| OQ-16 | **Closed** (U4): no `describe` and no revision. | — |
| OQ-17 | **Closed** (U2, U4). | — |
| OQ-18 | **Closed** (U2, U4). | — |
| OQ-19 | Bounds not stated: no maximum for any connector limit; no lower bound for several contract texts and lists (`reason`, `label`, `selected[]`, image `total`). | K1-BVA-11, K1-BVA-18, K1-BVA-23, K1-BVA-29, C2-BVA-05 |
| OQ-20 | The exact connector setting set after the split. Design §5.2 says `wakeupsPerHour` went with the in-process agent, and the context-window fields (`replyCapShare`, `minWindowTokens`, …) belonged to it. Which fields stay in the form? | C2-P-01, C2-BVA-04 |
| OQ-21 | **Closed** (U1): the icon is fixed. | — |
| OQ-22 | With U1, what does the one-time preference migration (design §0.7) still carry? Only the question mode, which today is `fishball.settings['questions']`? What happens to the old brand and sidebar record (deleted, or left and ignored), and to the routes `POST /api/fishball/brand` and `/api/fishball/sidebar-entry` (404, or present without effect)? | C2-P-08, C2-EP-10, C2-ST-04, C3-EP-07 |
| OQ-23 | What does the view show for an attached instance without `ui.chat` (no `ui`, or settings only)? | C3-EP-02, C3-EP-05, C3-DT-02, C3-DT-04 |
| OQ-24 | What is "the connector's Plugins-page entry" (a button on its card, DSH's settings gear, …)? Where does `ui.settings` open (framed in the view, framed on the Plugins page, a dialog, a tab)? And since the limits are edited only in DSH's form, how is that form reached while the entry opens `ui.settings`? | C3-P-05, C3-P-14, C3-EP-04, C3-EP-05, C3-DT-04, C3-DT-05 |
| OQ-25 | Do design §7's header (title, state tag, Refresh, "Open in a tab" — now to `ui.chat`?) and its state screen stay? Does the opener poll `status()` or get notified? What does it show when the instance gives no `status`? Is Retry hidden without `retry`? | C3-P-08, C3-P-15, C3-EP-08, C3-ST-07 |
| OQ-26 | Does an attach or a detach update an open view without a reload? (Assumed yes.) | C3-ST-01 |
| OQ-27 | `connector-missing` is confirmed (U3). Which task makes it pass: M1 ("moves only") or I1 (design §0.6)? | M1-EP-02, M1-EP-04, M1-EP-07, M1-DT-03 |
| OQ-28 | Does the test session re-point the existing suite (it links the repository root as `dsh-fishball`) to the moved files, and which cases retire with the retired modules (design §0.2)? | M1-P-09 |
| OQ-29 | May the instance import anything from the connector besides `./contract` (D15, "no private coupling")? | M1-EP-06 |
| OQ-30 | Must both packages carry the same version, and must the instance's peer range pin the connector's contract major? | none written (gap) |
| OQ-31 | Does the empty state's link open the Plugins panel itself, or a specific plugin or tab? | C3-P-07 |
| OQ-32 | Does a pushed but unacked item count toward the bound until it is acked? | C1-BVA-05 |
| OQ-33 | Is the delivery order the global arrival order across all kinds (assumed), or per kind or per source? | C1-P-06 |
| OQ-34 | Does a hand-over with a note give one inbox item (`user`), or two (`system` plus `user`), and in which order? | C1-P-06, C1-DT-04 |
| OQ-35 | **Closed** (contract §0): the question mode is a connector setting, so it is edited only in DSH's form. | — |
| OQ-36 | "No plugin is called Fishball": does the connector row keep the id `fishball` (design §0.2: the settings namespace and stored limits survive)? What label does DSH's Plugins page show for it? | M1-R2, M1-P-07, M1-P-11 |
| OQ-37 | The fixed icon (the fish with a wrench badge): where does it appear (the sidebar row, the brand button, the Plugins card)? Is it built from DSH's `FISH_LOGO_PATH` plus a badge? Does it keep the unread count and Fishball's dots (design §7, §8.2)? Do light and dark differ? | C3-P-13, C3-EP-07 |
| OQ-38 | **Closed** (U4): there is no `settings.describe`. | — |
| OQ-39 | With the "Sidebar entry" switch gone, is the panel-list row always shown (design §7's default), with the brand as a second way in? | C3-R1, C2-EP-10, C3-EP-07 |
| OQ-40 | The instance settings page (I6) and E1's `E2E-B5` ("change a connector limit in the instance settings page") assume settings over the contract. Under U2 and U4 neither is possible. Flagged for the I6/E1 session. | outside this scope |
| OQ-41 | The design document at `3509859` still describes the superseded behaviour: design §0.4's `settings.*` rows, §0.7 "edited from the instance settings page", §7's brand and "Sidebar entry" switch, §18.2 K1 R3 and C2. Who updates it, and when? | all C2, K1-R11 |
| OQ-42 | **New. Conflict between contract §0 and U1.** Contract §0 at `bb0f756` lists the connector settings as "its limits, question mode, **brand icon and sidebar entry**", edited in DSH's form; U1 says the icon is fixed and no branding or sidebar setting exists. These cases follow U1. Should contract §0 be corrected? | C2-EP-09, C2-EP-10, C3-P-13, C3-EP-07 |
| OQ-43 | **New.** Contract §3.2 lists "each required name is a §4 operation the receiver knows" as a handshake payload rule, which would make it a validation failure that closes the channel. It also says "if the connector cannot serve every required one, it answers `unsupported-capability`". Which applies to an unknown required name, and which to the other payload-rule breaks (required ⊄ capabilities, no `inbox.push`, duplicates)? | K1-EP-37, K1-EP-39, C2-EP-05 |
| OQ-44 | **New.** A request for an operation name that does not exist in v1 (for example `settings.update`): is it an `error` frame `unsupported-operation` (contract §3.2, "outside the welcome") or an envelope validation failure that closes the channel (contract §3.1, `operation` must be a known name)? | K1-EP-56, K1-EP-57, C2-EP-01..03, C2-ST-01 |
| OQ-45 | **New.** `transfersPerMessage` is 1 (contract §4.4, §8), but `attachmentsPerMessage` allows 20 `hostRef`s, each from its own `attachment.put`. How can a message carry more than one attachment? | K1-BVA-14, K1-BVA-16 |
| OQ-46 | **New.** Which code refuses an expired or already-consumed `hostRef`? Contract §7 lists none for it. | K1-BVA-17 |
| OQ-47 | **New.** Contract §10 names `validateAttachment`, `negotiateContract`, `validateRequest`/`Response`/`Event`, `requireCapabilities`, `encodeEnvelope`, `decodeEnvelope` and `makeEnvelope`, but the doc gives no signatures or failure forms (throw vs result). The module-level cases need them; otherwise they move to the service level. | K1-P-03, K1-P-05, K1-P-11, K1-P-13, K1-EP-38, all `static` K1 cases |
| OQ-48 | **New.** After a refused handshake, or a channel the connector closes because a frame failed validation: is the instance detached (no-instance mode, so a new attach is accepted), and does the connector call `transport.close()`? | K1-EP-37, K1-EP-43, K1-EP-51, C1-ST-11 |
| OQ-49 | **New.** Does `fishballConnector` expose any member besides `attachInstance`? | C2-EP-06 |
| OQ-50 | **New.** `token` variants in a `ui` path: `?Token=`, `?%74oken=`, `?access_token=`, and `#token=` in the fragment. The literal rule (query only) accepts `#token=`. Is that intended, given contract §1.2's "a credential must never be in an iframe's address"? | K1-EP-29 |
| OQ-51 | (unused) | — |
| OQ-52 | **New.** Is `ui: {}` accepted (both keys optional), and is `ui: null` refused or treated as absent? | K1-EP-20, K1-EP-22 |
| OQ-53 | **New.** What does the opener show when `status()` throws, or returns a state outside `STATUS` or a code outside `STATUS_CODES`? | C3-EP-08 |
