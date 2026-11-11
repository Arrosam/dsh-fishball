# 7. Contributor tools and events (EXT)

Requirements: R-EXT-01…20, R-SEC-04, requirements §4.2. Conventions: [README](<README.md>).

The service is `fishballConnectorTools` with `register`, `emit`, `mine` (D§13.2, K). The
caller-identity mechanism is provisional on V3-S5; every EXT case is **P:S5** unless stated.

## Use Cases

### EXT-UC-01 — A plugin contributes a tool and a principal calls it
**Req:** R-EXT-01, R-EXT-02, R-EXT-03, R-EXT-04, R-EXT-05, R-EXT-06, R-EXT-07, R-EXT-10, R-EXT-12, R-EXT-15 · **Level:** integration · **Flags:** P:S5

- **Actor:** contributor plugin `board-helper` in C's DSH; a paired principal P with a listen stream opted into `toolsListChanged`.
- **Preconditions:** C loaded; `board-helper` injects `fishballConnectorTools?`.
- **Main flow:**
  1. `board-helper` registers `{name: "lookup", description, inputSchema: {type: "object", …}, execute}` at runtime, with no connector restart.
  2. P's stream gets `notifications/tools/list_changed`.
  3. P's `tools/list` shows `board-helper.lookup` after the core tools, sorted by public name, with `annotations` naming plugin `board-helper` and its package version.
  4. P calls it with valid arguments → C authenticates, checks body/size/in-flight/rate limits and validates the input schema **before** `execute` runs.
  5. `execute` receives `call.principal = {key, name}` (opaque key, current name; no token, id or entry label), a signal and `protocolVersion: "2026-07-28"`.
  6. It returns `{ok: true, data}` → P gets `structuredContent {ok: true, …}`, the same JSON as text, and `isError: false`.
  7. One log line names the namespace on registration; no arguments or results are logged.
- **Alternative flows:**
  - A1. The contributor disposes the registration → before the next request is answered the tool is gone; a call gets "unknown tool"; `list_changed` sent.
  - A2. The contributor plugin is disabled / unloaded / reloaded / uninstalled → as A1, without calling the disposer.
  - A3. P cancels the call / disconnects → `call.signal` fires.
- **Exception flows:**
  - E1. Invalid arguments → refused with the connector's code; `execute` never runs.
  - E2. An unauthenticated request → 401; a pair-only AT does not see the tool.
- **Postconditions:** `board-helper` gained no Fishball authority.

### EXT-UC-02 — A contributor emits an event
**Req:** R-EXT-16, R-EXT-17, R-EXT-18, R-EVS-02, R-ID-06, R-EXT-20 · **Level:** integration · **Flags:** P:S5

- **Actor:** contributor `ci-watch`.
- **Preconditions:** D = HF; S1 managed by P(E2).
- **Main flow:**
  1. `emit({event: "build.failed", payload: {…}, summary: "Build 42 failed", sessionId: S1})` → `{ok: true, eventId}`.
  2. One mailbox event of type `contributed:ci-watch.build.failed` is committed to P(E2) only, and a hint is sent on P(E2)'s stream.
- **Alternative flows:**
  - A1. No `sessionId` → the event goes to D.
  - A2. `sessionId` of an unmanaged session → to D.
  - A3. In HF's Fishball DSH, no plugin intercepts `contributed:ci-watch.build.failed` → it reaches the Fishball agent through the X9 pipeline (fold-notify may batch it); Watchdog never sees it.
- **Exception flows:**
  - E1. No recipient (no D, no session manager) → `no-fishball`, nothing queued.
  - E2. Limits: see EXT-BVA-02/03.
- **Postconditions:** one emit woke at most one agent.

### EXT-UC-03 — A failing contributor is contained, then quarantined, then restored
**Req:** R-EXT-08, R-EXT-09, R-EXT-19, R-EXT-04, R-EXT-15 · **Level:** integration · **Flags:** P:S5, K (N of M)

- **Actor:** contributor `flaky` with tool `flaky.go` and two pending events in P's mailbox (one already acked).
- **Main flow:**
  1. `execute` throws → that call gets `{ok: false, code: "contributor-failed"}` with no stack, message or path. Another contributor's tool and another client's calls are unaffected. One log line per (contributor, failure kind).
  2. Failures continue past the frozen threshold → `flaky` is **quarantined**: its tools leave `tools/list` (`list_changed` sent; calls get "unknown tool", never "quarantined"); `emit` returns `contributor-unavailable`; its **pending** events are retired from every mailbox; the acked one stays.
  3. The user disables and re-enables `flaky` (or reloads it) → its new registrations are accepted and listed again.
- **Alternative flows:** A1. Emits that keep failing validation count toward the same quarantine.
- **Exception flows:** E1. There is no connector setting to lift the quarantine; the connector settings form has no per-contributor rows.
- **Postconditions:** the connector and all other clients kept working throughout.

### EXT-UC-04 — Embed-UI contributes the attention tools
**Req:** R-EXT-13, R-UI-04, R-FN-01, R-EXT-03 · **Level:** integration · **Flags:** P:S5, D§13.6

- **Actor:** embed-UI; Fishball's fold-notify.
- **Preconditions:** C + U in one DSH.
- **Main flow:**
  1. `tools/list` shows `embed-ui.attention.signal` and `embed-ui.attention.state` (namespace alias `embed-ui`).
  2. Fold-notify calls `embed-ui.attention.signal({important: true})` over MCP → `{ok: true, accepted: true}`; the latch is `count 1, important true`; the fish shows the important dot.
  3. The user opens the Fishball page → the latch clears once.
- **Alternative flows:** A1. Without U, the tools are absent; fold-notify's call gets `unsupported-operation` and nothing else changes.
- **Exception flows:** —
- **Postconditions:** the connector has no attention tool or state of its own.

## Equivalence Partitioning

### EXT-EP-01 — Registration validity
**Req:** R-EXT-02, R-EXT-03 · **Level:** unit · **Flags:** K (grammar `[a-z0-9][a-z0-9_.-]{0,47}`, D§13.2; keyword subset)

| # | Class | Expected |
| --- | --- | --- |
| 1 | valid name, object schema, execute | registered |
| 2 | name with an upper-case letter / space / `/` | `tool-invalid` |
| 3 | name with leading or trailing `.` | `tool-invalid` |
| 4 | input schema root `type: "array"` | `tool-invalid` |
| 5 | input schema not an object (string, null) | `tool-invalid` |
| 6 | unsupported keyword (`$ref` to a remote URL, `patternProperties` if outside the subset) | `tool-invalid` |
| 7 | missing `execute` / not a function | `tool-invalid` |
| 8 | empty description / over 2 KiB | `tool-invalid` |
| 9 | `limits.timeoutMs` over the ceiling | `tool-invalid` |
| 10 | a `codes` entry breaking the grammar | `tool-invalid` |
| 11 | same public name twice | `tool-exists`; the first stays |
| 12 | contributor whose derived namespace is `fishball` or the connector's plugin name | `namespace-reserved` |
| 13 | the connector unloading | `registry-closed` |
| 14 | any refusal | nothing registered, nothing in `tools/list`, one log line |
| 15 | the same name after dispose | registered again |
| 16 | the disposer called twice | no-op |

### EXT-EP-02 — Namespace derivation
**Req:** R-EXT-03, R-EXT-16 · **Level:** unit · **Flags:** P:S5, D§13.3, TQ-13

| # | Contributor plugin name | Namespace | Public name of `lookup` |
| --- | --- | --- | --- |
| 1 | `board-helper` | `board-helper` | `board-helper.lookup` |
| 2 | `@acme/tools` | `acme-tools` | `acme-tools.lookup` |
| 3 | `fishball-embed-ui` | `embed-ui` (the only alias) | `embed-ui.lookup` |
| 4 | a contributor passing `namespace: "other"` in its definition | ignored; derived namespace used | |
| 5 | a contributor calling `register` from inside another plugin's scope | the **caller's** namespace (spike S5) | |
| 6 | two plugins whose names normalise to the same namespace | TQ-13 (unique plugin names ≠ unique normalised names) | |

### EXT-EP-03 — Result handling
**Req:** R-EXT-07, R-EXT-08 · **Level:** unit · **Flags:** —

| # | `execute` returns | Client gets |
| --- | --- | --- |
| 1 | `{ok: true, data}` valid | `{ok: true, …}` |
| 2 | `{ok: false, code: <declared>}` | that code, `isError: true` |
| 3 | `{ok: false, code: "forbidden"}` (shared vocabulary) | `forbidden` |
| 4 | `{ok: false, code: "weird"}` (undeclared) | `operation-failed` |
| 5 | data failing `outputSchema` | `contributor-failed` |
| 6 | not the result shape (a string, its own `isError` flag, raw content blocks) | `contributor-failed`, with `isError: true` set by the connector; the contributor's own flags and blocks never reach the client |
| 7 | throws / rejects | `contributor-failed` (no stack, message, path) |
| 8 | `message` of 600 chars containing an `fbt_…` value | cut to 500 and scrubbed (D§13.5) |

### EXT-EP-04 — Contributor scope (what it cannot do)
**Req:** R-EXT-10, R-EXT-11, R-SEC-04 · **Level:** unit (service surface), integration · **Flags:** —

| # | Attempt | Expected |
| --- | --- | --- |
| 1 | read or ack a mailbox | no such member on the service |
| 2 | list / answer approvals, questions, prompts | no such member |
| 3 | settle an offer, Hand over / Take back | no such member |
| 4 | obtain a token, entry label, fishball id | absent from `call` and the service |
| 5 | call another contributed or core tool through the connector | no handle provided |
| 6 | run anything in a Fishball DSH | no path exists |
| 7 | `call.principal.key` across two calls of the same pair | stable; differs between pairs; reveals no token or id |

## Boundary Value Analysis

### EXT-BVA-01 — Public tool name length (MCP 1–128)
**Req:** R-EXT-03 · **Level:** unit · **Flags:** K

With namespace `ns` (2 chars) the public name is `ns.` + local name.

| # | Public name length | Expected |
| --- | --- | --- |
| 1 | 128 | registered (if the local-name grammar allows) |
| 2 | 129 | `tool-invalid` |
| 3 | local name length 1 (`ns.a`) | registered |
| 4 | local name length 0 | `tool-invalid` |
| 5 | local name 48 (grammar max, D§13.2) | registered |
| 6 | local name 49 | `tool-invalid` |

### EXT-BVA-02 — Event payload and summary size
**Req:** R-EXT-18 · **Level:** unit · **Flags:** K (refusal codes `payload-too-large`, `event-invalid` from D§13.2)

| # | Field | Size | Expected |
| --- | --- | --- | --- |
| 1 | payload (UTF-8 JSON bytes) | 8191 | ok |
| 2 | payload | 8192 (8 KiB) | ok |
| 3 | payload | 8193 | `payload-too-large`, nothing queued |
| 4 | payload with multi-byte chars: 2731 × `€` (3 bytes) + quotes = 8195 bytes | `payload-too-large` |
| 5 | payload not JSON-serialisable (cycle, BigInt) | `event-invalid` |
| 6 | summary | 499 chars | ok |
| 7 | summary | 500 | ok |
| 8 | summary | 501 | refused (K code) |
| 9 | summary with HTML/markdown | stored as plain text (K: escaped or rejected) |
| 10 | `event` name | grammar as tool names; `""`, `A B` → `event-invalid` |

### EXT-BVA-03 — Event rate (30 / minute, burst 10) per contributor and recipient
**Req:** R-EXT-18 · **Level:** unit (fake clock) · **Flags:** K (token-bucket semantics assumed: capacity 10, refill 0.5/s)

| # | Sequence (same contributor, same recipient) | Expected |
| --- | --- | --- |
| 1 | 10 emits at t = 0 | all ok |
| 2 | 11th at t = 0 | `rate-limited` |
| 3 | after #1, one emit at t = 2 s | ok (one token refilled) |
| 4 | after #1, one emit at t = 1.9 s | `rate-limited` |
| 5 | steady 1 emit every 2 s for 2 minutes | all ok (30/min) |
| 6 | 31 emits spread evenly in 60 s after the burst is spent | the 31st refused |
| 7 | 10 at t = 0 to recipient A, 10 at t = 0 to recipient B | all 20 ok (separate buckets) |
| 8 | two contributors, 10 each to A at t = 0 | all 20 ok |
| 9 | a refused emit | does not consume budget (K) |

### EXT-BVA-04 — Per-call limits
**Req:** R-EXT-06, R-EXT-07, R-EXT-08 · **Level:** unit · **Flags:** K (ceilings)

| # | Limit | Value | Expected |
| --- | --- | --- | --- |
| 1 | argument bytes, declared 1000 | 1000 | runs |
| 2 | | 1001 | `limit-exceeded`, `execute` not called |
| 3 | declared above the ceiling | at registration | `tool-invalid` |
| 4 | result bytes, declared R | R | ok |
| 5 | | R + 1 | `contributor-failed` |
| 6 | timeout, declared T | returns at T − ε | ok |
| 7 | | still running at T | `contributor-failed`; signal fired |

## Decision Tables

### EXT-DT-01 — `emit` outcome
**Req:** R-EXT-16, R-EXT-17, R-EXT-18, R-EXT-19 · **Level:** unit · **Flags:** K (precedence order of checks)

| Rule | Contributor active | Name valid | Size ok | Recipient exists | Rate ok | Duplicate pending | Queue has room | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | no (quarantined/withdrawn) | — | — | — | — | — | — | `contributor-unavailable` |
| 2 | yes | no | — | — | — | — | — | `event-invalid` |
| 3 | yes | yes | no | — | — | — | — | `payload-too-large` |
| 4 | yes | yes | yes | no | — | — | — | `no-fishball` |
| 5 | yes | yes | yes | yes | no | — | — | `rate-limited` |
| 6 | yes | yes | yes | yes | yes | yes | — | `duplicate` |
| 7 | yes | yes | yes | yes | yes | no | no | `queue-full` |
| 8 | yes | yes | yes | yes | yes | no | yes | `{ok: true, eventId}` |
| 9 | same `dedupeKey`, earlier one already **acked** | | | | | | yes | ok (not pending, so not a duplicate) |
| 10 | same `dedupeKey` from a **different** contributor | | | | | | yes | ok |
| 11 | connector unloading | | | | | | | `registry-closed` |

Every rule: a returned code, never a throw into the connector or the contributor.

### EXT-DT-02 — Contributor event recipient
**Req:** R-EXT-17, R-EVS-03 · **Level:** unit · **Flags:** TQ-14

| Rule | `sessionId` | Session managed | Designated | Recipient |
| --- | --- | --- | --- | --- |
| 1 | given | yes, by M | any | M |
| 2 | given | no | D | D |
| 3 | given | no | none | `no-fishball` |
| 4 | absent | — | D | D |
| 5 | absent | — | none | `no-fishball` |
| 6 | given, unknown session | — | D | TQ-14 (treat as unmanaged → D, or refuse) |

### EXT-DT-03 — Contributed tools in `tools/list` (matrix §4.2)
**Req:** R-EXT-05, R-EXT-13, R-EXT-14, R-UI-08, R-UI-09, §4.2 · **Level:** integration · **Flags:** P:S5

| Rule | In the connector's DSH | AT | Contributed tools listed |
| --- | --- | --- | --- |
| E1 | C | full | none |
| E2 | C + X | full | X's |
| E2p | C + X | pair-only | none |
| E3 | C + I + U | full | `embed-ui.attention.*` |
| E4 | C + U | full | `embed-ui.attention.*` |
| E5 | C + I + U + X | full | both, core tools first, then sorted by public name |
| E6 | I + U, remote C' | (hosted Fishball's model) | C''s contributions only |
| E7 | X, no C | — | none; X loads normally |
| E8 | standalone F → C | (Fishball's model) | all of C's |
| E9 | C + X, X disabled | full | none |

## State Transitions

### EXT-ST-01 — A contributor's registration
**Req:** R-EXT-01, R-EXT-04, R-EXT-09, R-EXT-19 · **Level:** integration · **Flags:** P:S5

| # | From | Event | To | Observable |
| --- | --- | --- | --- | --- |
| 1 | Absent | register | Active | listed; `list_changed` |
| 2 | Active | dispose | Absent | unlisted before the next answer; `list_changed` |
| 3 | Active | plugin disabled / unloaded / reloaded / uninstalled | Absent | as 2; pending events retired |
| 4 | Active | in-flight call when withdrawn | Absent | that call gets `tool-withdrawn` (D§13.4), signal fired |
| 5 | Active | failures beyond the threshold | Quarantined | unlisted; `emit` → `contributor-unavailable`; pending events retired |
| 6 | Quarantined | register again in the same fiber | Quarantined | refused or not listed (K) |
| 7 | Quarantined | plugin disabled + re-enabled | Absent → (register) Active | |
| 8 | Quarantined | plugin reloaded (new fiber) | Absent → Active | |
| 9 | Quarantined | any connector setting change | Quarantined | no lift |
| 10 | Active | connector unloads | Closed | service gone; later register → `registry-closed` / service absent |
| 11 | Absent (C missing) | contributor loads | Absent | optional inject never activates; contributor loads fine |
