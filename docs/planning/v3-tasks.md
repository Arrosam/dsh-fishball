# Fishball V3: task table for parallel development

Status: **draft, 2026-11-11.** Built on [v3-requirements.md](<v3-requirements.md>) and
[v3-design.md](<v3-design.md>) at `e1e5577`, and on the requirements-only cases in
[docs/test-design/v3](<../test-design/v3/README.md>). No implementation code was read for this
plan.

## How to use this table

- **One task = one dev session + one test-code session, started together.** The test session
  writes tests for the task's cases from the case files only. The dev session implements from the
  requirements and the frozen V3-K contracts, and never reads the test code (AGENTS.md).
- **Waves run in order.** Tasks inside a wave run in parallel. A task may start only when every
  task it depends on is merged.
- **No file overlap within a wave.** Each task owns the paths in its "Owns" column. A path listed
  for one task in a wave is touched by no other task in that wave. A package's manifest
  (`package.json`) and its plugin entry/row file are owned by **at most one task per wave**; that
  task is named in the column.
- **Paths are ownership areas, proposed.** New directories follow design §9.1. The dev session
  chooses file names inside its area. When a task must change a file outside its area, it stops and
  asks; the change goes to the owning task or to the next wave.
- **Interfaces between parallel tasks** come only from the V3-K freeze (W1). A task in W2+ tests
  against fakes of the frozen interfaces, never against another in-flight task's code.
- **Provisional cases** (`P:Sn`) are re-checked against the spike report before the task starts. A
  spike that changes a requirement goes back to the design session first (AGENTS.md: DESIGN.md
  changes when a spike changes the design).
- **Common definition of done** (every task, in addition to its own):
  1. every listed case passes at its stated level, on DSH **0.2.1-rc.5 and 0.2.2-rc.1** for
     integration cases (R-COMPAT-01); unit cases on Node ≥ 22;
  2. `npm test` passes; no existing check is weakened;
  3. no bare numbers or strings in behaviour code; constants live in the feature's constant
     object or in the frozen `./mcp-schema` / `./tools` modules;
  4. an independent code review is done and its findings are fixed;
  5. one or more local commits on the task branch, hooks on, not pushed;
  6. no token value, ticket or `Authorization` header appears in any log or fixture written by
     the task (R-SEC-02).
- e2e cases are browser-only and run **after merge**, in wave W6.

## Wave overview

| Wave | Purpose | Tasks |
| --- | --- | --- |
| W0 | Spikes (gates) | S1, S2, S3, S4, S5, S6, S7 |
| W1 | Interface freeze (V3-K) and mechanical repackaging | K1, K2, K3, R-CORE, R-EMBED, R-CONN |
| W2 | Independent modules, connector and Fishball side | C-HTTP, C-OAUTH, C-TOKENS, C-PAIR, C-MAILBOX, C-EXT, F-LINK, F-INTERCEPT, F-GUARDS, I-PLACE |
| W3 | Domain behaviour built on W2 | C-ROUTE, C-TOOLS, F-PAIR, F-FACADE, WD-ROUTE, I-HOST, U-SHELL, FEAT-PEERS |
| W4 | Cross-cutting connector effects, Watchdog judgement and patrol, embed-UI features | C-REVOKE, C-SUCCEED, WD-DECIDE, WD-PATROL, F-STATUS, U-MARKS, U-ATTN |
| W4b | Connector wiring (after C-REVOKE and C-SUCCEED) | C-WIRE |
| W5 | Reinstall succession end to end, migration, acceptance suites | I-SUCCEED, X-MIG, X-SEC, X-MATRIX, X-REMOTE, DOCS |
| W5b | Compatibility matrix (after X-MATRIX and X-REMOTE) | X-COMPAT |
| W6 | Browser e2e after merge | E2E-UI, E2E-CORE |

## W0 — Spikes

Each spike lives only under `spikes/v3-sN/` and ends with a short report
(`docs/spikes/v3-sN.md`) answering the design §11 gate. No product code.

| Id | Scope | Owns | Depends | Cases it unblocks | Definition of done |
| --- | --- | --- | --- | --- | --- |
| S1 | Packaged MCP server SDK, modern-only, on a raw `webServer` route; bearer check before dispatch; Origin/header checks; resource metadata; listen streams; both hosts | `spikes/v3-s1/`, `docs/spikes/v3-s1.md` | — | AUTH-UC-08, EVT-UC-01, REM-UC-03, PLAT-UC-01 | the §11 gate demonstrated on both SDKs; a 401 path never reaches the SDK |
| S2 | Durable child acceptance ledger + `Agent.followup`: one wake after lost ack, crash and reconnect | `spikes/v3-s2/`, `docs/spikes/v3-s2.md` | — | EVT-UC-02, EVT-DT-03, EVT-ST-02 | MCP-S2 §11.5 TODO closed or a design change requested |
| S3 | Interception priority/ties/filters/fallback; `pair` races; OQ-14 answer races (user, Watchdog, Fishball); a refine starts no run | `spikes/v3-s3/`, `docs/spikes/v3-s3.md` | — | AUTH-UC-02, NAME-BVA-03, EVT-UC-02, WD-UC-01, WD-UC-04, WD-ST-01, HOST-UC-03, HOST-ST-02, PLAT-UC-02, PLAT-ST-01 | race matrix with no stale commit; one event wakes one agent |
| S4 | Embed-UI as a separate package registering sidebar/slot contributions and framing the PG-ORIGIN child | `spikes/v3-s4/`, `docs/spikes/v3-s4.md` | — | HAND-UC-01, HAND-UC-03, UIM-* | works on both hosts; main shortcuts untouched |
| S5 | Contribution service: caller fiber identity, auto-withdrawal, quarantine lift by new fiber, `tools/list_changed`, containment | `spikes/v3-s5/`, `docs/spikes/v3-s5.md` | — | EXT-* (P:S5) | decides `register(def)` vs `register(ctx, def)` for K2 |
| S6 | `fishball-core` as a plain bundle with guard rows disabling other bundles' rows; override detection through a public API; both modes | `spikes/v3-s6/`, `docs/spikes/v3-s6.md` | — | HOST-UC-01, REM-UC-01, UIM-DT-01, PLAT-UC-04, PLAT-UC-05 | names the public API for `guards-overridden` |
| S7 | Client-credentials AS on the DSH listener with the stock `ClientCredentialsProvider` and one non-DSH client; revocation; direct access | `spikes/v3-s7/`, `docs/spikes/v3-s7.md` | — | AUTH-UC-02, AUTH-UC-08, REM-UC-01 | also answers TQ-3 (is `resource` sent?) |

## W1 — Interface freeze (V3-K) and repackaging

R-CORE, R-EMBED and R-CONN need no spike and touch no spike files, so they run alongside W0
(started that way on 2026-11-11). K1–K3 wait for their spikes.

V3-K is split into three freeze tasks so each fits one session. Each is reviewed by the design
session; the case files are re-checked for every `K` flag the freeze resolves. Repackaging tasks
move code without changing behaviour.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| K1 | Freeze `fishball-connector/mcp-schema`: tool names and input/output schemas, result envelope, refusal-code vocabulary, event `type` vocabulary and payload shapes (R-EVS-02), OAuth metadata and error mapping, page limit, retention, "connected" definition, every numeric limit in the cases (`K` flags), and the internal module interfaces used by W2 (bearer verifier, token registry, pair store, mailbox commit/poll/ack, router `recipientFor`) | `packages/connector/mcp-schema/` | S1, S2, S3, S7 | resolves `K` flags in AUTH, NAME, EVT, PLAT, WATCH | design-session review recorded; every `K` value used by a case is in the module or explicitly left to a task |
| K2 | Freeze `fishball-connector/tools`: contribution types, `apiVersion`, `register` / `emit` / `mine` signatures (per S5), name grammar, limits and ceilings, quarantine N of M, `defineTool` validator contract | `packages/connector/tools/` | S5 | resolves `K` flags in EXT | as K1 |
| K3 | Freeze host-only service contracts: `fishballConnectorHandover`, `fishballConnectorTokens`, `fishballChild`, and `fishballInstance.events.intercept` (types only) | `packages/connector/host-services/` (types), `packages/core/contracts/` (types) | S3, S4, S6 | resolves `K` flags in HAND, HOST, UIM, EVT-UC-03 | as K1 |
| R-CORE | Create `packages/core` and move the child pieces into it unchanged (slim child, persona, private Skills tool, app pieces of `native-child.js`, `child-web/**` and the `LITE` rows as the `fishball-ui` component), per design §9.1 | `packages/core/**` except `contracts/`; **owns** `packages/instance/package.json` this wave; removes the moved files from `packages/instance` | — | — (behaviour-preserving; existing V2 tests still pass where they still apply) | moved code builds and loads as a bundle in an ordinary DSH; no behaviour change |
| R-EMBED | Create `packages/embed-ui` and move the connector `client.js` UI and the instance main `client.js` Plugins card into it unchanged | `packages/embed-ui/**`; removes the moved client files from `packages/connector` and `packages/instance` (files only, not manifests) | — | — | moved UI builds; nothing else changes |
| R-CONN | Connector manifest: drop `dsh.client`, `./client`, `./contract`, `./records`; add `./mcp-schema`, `./tools`; add the MCP server SDK runtime dependency; remove `fishballConnector.attachInstance`, envelope-v2 and the `control` wire use | `packages/connector/package.json`, `packages/connector/src/` files of the retired contract | — | PLAT-EP-03 rows 1, 5 (static) | the connector loads with no browser client (R-ARCH-03) |

## W2 — Independent modules

Each task builds one module behind a K1/K2/K3 interface and tests it against fakes of the others.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-HTTP | MCP route on DSH's listener; check order (405 → 403 → 401 → 413/429 → version → dispatch); listener exposure (loopback, https, insecure refusal); `server/discover` with the OAuth extension; body/in-flight limits | `packages/connector/src/mcp/http/` | K1, S1 | PLAT-UC-01, PLAT-EP-01, PLAT-BVA-02, REM-UC-03, REM-EP-02, REM-EP-03, AUTH-EP-02 (rows 1, 2, 11–14) | 401 path never reaches the SDK; both SDKs |
| C-OAUTH | Authorization server: protected-resource and AS metadata, token endpoint, access-token store by digest, audience, 3600 s lifetime, no refresh, uniform 401s, rate limits, direct-access fallback | `packages/connector/src/mcp/oauth/` | K1, S7 | AUTH-UC-08, AUTH-EP-01, AUTH-EP-02 (rows 3–10), AUTH-EP-05, AUTH-EP-07, AUTH-BVA-01, AUTH-BVA-02, AUTH-BVA-04, AUTH-DT-01, AUTH-DT-03, AUTH-ST-02, AUTH-UC-07 | stock `ClientCredentialsProvider` works on both SDKs |
| C-TOKENS | Token entries in native settings; generation into `ctx.credentials`; minimum length; revocation signal on disable/delete/value change; cleanup of generated values | `packages/connector/src/tokens/` | K1 | AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03, AUTH-DT-05, AUTH-ST-01 (rows 1, 5–10, 12) | value never in settings, logs or responses |
| C-PAIR | Pair store (token entry → id), `pair` and `set_name` tools' domain, `already-paired` result and advice, live scope evaluation, names (normalise, fold, unique index, lowest free default, case-only change), `pairedAt` / `lastSeenAt`, read-only status rows | `packages/connector/src/pairs/` | K1, S3 | AUTH-UC-02, AUTH-UC-04, AUTH-EP-03, AUTH-EP-06, AUTH-DT-02, AUTH-BVA-05, AUTH-ST-01 (rows 2–4, 11, 13, 14), NAME-UC-01, NAME-UC-03, NAME-EP-01, NAME-EP-02, NAME-EP-03, NAME-BVA-01, NAME-BVA-02, NAME-BVA-03, NAME-DT-01, NAME-DT-02, NAME-ST-01 (rows 1–7) | concurrent pairings get distinct names |
| C-MAILBOX | Per-pair durable ledger: commit, `inbox_poll` (page, cursor, resync, `forbidden`), `inbox_ack`, replay identity, capacity, `fishball-events` resource and `notifications/resources/updated` hints on listen streams | `packages/connector/src/mailbox/` | K1, S1 | EVT-UC-01, EVT-EP-02, EVT-BVA-01, EVT-BVA-02, EVT-ST-01 | a lost hint loses no event |
| C-EXT | Contribution service: registry, namespaces and alias, validation, `tools/list` order and annotations, pre/post call checks, containment, quarantine, `list_changed`, `emit` validation/limits/dedupe/fate (recipient and commit through K1 interfaces) | `packages/connector/src/contrib/` | K2, S5 | EXT-UC-01, EXT-UC-02, EXT-UC-03, EXT-EP-01, EXT-EP-02, EXT-EP-03, EXT-EP-04, EXT-BVA-01, EXT-BVA-02, EXT-BVA-03, EXT-BVA-04, EXT-DT-01, EXT-DT-02, EXT-ST-01 | a throwing contributor affects no other tool or client |
| F-LINK | `fishball-core` MCP link: packaged client pinned to 2026-07-28, `ClientCredentialsProvider` with `expectedIssuer`, https rule, no credential on redirect, listen + poll on (re)connect, bounded backoff, target status | `packages/core/src/link/` | K1, S1, S7 | REM-EP-01, REM-DT-01, REM-UC-02 (Fishball side) | never sends the token to another origin |
| F-INTERCEPT | Interception service (`intercept`, priority, ties, filters, warnings, `release`), acceptance ledger, ack after durable acceptance, one wake through `Agent.followup` | `packages/core/src/events/` | K3, S2, S3 | EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-DT-02, EVT-DT-03, EVT-ST-02 | no event lost or handled twice in the S2 crash windows |
| F-GUARDS | `fishball-ui` guard rows in core's bundle patch (including disabling `fishball-instance`), read-only preset with the Skills exception, override detection and `guards-overridden` report | `packages/core/ui/patch/`, `packages/core/src/guards/` | K3, S6, R-CORE | PLAT-UC-04 (composition), UIM-DT-01 rows 9, 10b, 14 | report set and cleared at app ready and on settings change |
| I-PLACE | Instance: placement of the four bundled plugins before profile load, placement record (first on, disable survives, deleted-while-off re-placed off), incompatible member blocks start, launch overlays with no guard rows; **owns** `packages/instance/package.json` this wave (`bundled/` in `files`) | `packages/instance/src/native-runtime/` placement and overlay modules, `packages/instance/bundled/`, `packages/instance/package.json` | R-CORE | PLAT-DT-01, HOST-ST-01 (rows 1–3), HOST-UC-06 (overlay postcondition) | host never lists or loads the bundled copies |

## W3 — Domain behaviour

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-ROUTE | Managed state and routing (one manager, designated Fishball, recipient at creation, follow-ups), watch = manage (`turn-finished` with running/queued, `state`), `message_fishball` / `ask_fishball` and no-principal rules, the host-only hand-over service | `packages/connector/src/routing/`, `packages/connector/src/handover/` | C-MAILBOX, C-PAIR | EVT-EP-01, EVT-DT-01, WATCH-UC-01, WATCH-UC-02, WATCH-EP-01, WATCH-ST-01, HAND-EP-01, HAND-DT-01, HAND-DT-02, HAND-ST-01, HAND-UC-02 (service part), PLAT-UC-03 | every event has exactly one recipient |
| C-TOOLS | Core MCP tools over the V2 domain (sessions, approvals, questions, prompts, grants, attachments), structured envelope, first-commit-wins, no timers, watch tools removed | `packages/connector/src/mcp/tools/` | C-HTTP, C-OAUTH | PLAT-UC-02, PLAT-EP-02, PLAT-ST-01, WATCH-UC-03 | no refusal is prose only |
| F-PAIR | Core identity (`identity.id` generation, `identity.name`), paired record, pairing decisions, `already-paired` warning and choices, name-clash display, `set_name` on change and reconnect | `packages/core/src/identity/`, `packages/core/ui/pairing/` | F-LINK, F-GUARDS | AUTH-UC-05 (decisions), AUTH-DT-06, AUTH-ST-03, NAME-UC-02 (core part), NAME-DT-03 | sends nothing while the warning is open |
| F-FACADE | Bridge façade: core tools and every contributed tool re-exposed unfiltered to the model, `list_changed` refresh, contributed-tool count in status; contributor events to Fishball through X9 | `packages/core/src/bridge/` | F-LINK, F-INTERCEPT | EXT-DT-03 rows E6, E8 (Fishball side), EXT-UC-02 A3 | no raw `mcp__…` tool reaches the model |
| WD-ROUTE | Watchdog as an interceptor: two registrations, filters from supervision state, failure = off, fallback of unaccepted items, "watchdog is down" per episode, in-session messages only; peer change to optional `fishballInstance?`; **owns** `packages/watchdog/package.json` and its plugin row this wave | `packages/watchdog/src/intercept/`, `packages/watchdog/src/health/`, `packages/watchdog/package.json` | F-INTERCEPT | WD-UC-02, WD-UC-04, WD-EP-01 (rows 1–11), WD-EP-03, WD-DT-02, WD-ST-01 | a failure never stops a watched session |
| I-HOST | Instance host row: `fishballChild` locator (status, origin, single-use admission, Retry, target status), lifecycle codes, `mcp-credential` wire channel, `createHosted` call when no paired credential, no replacement on disable, Retry after delete, pending "watchdog is down", host model-sync trigger kept | `packages/instance/src/host/`, `packages/instance/src/native-runtime/wire/` | I-PLACE, K3 | HOST-UC-01, HOST-UC-02, HOST-UC-04, HOST-UC-05, HOST-UC-06, HOST-UC-07 (engine), HOST-EP-01, HOST-EP-02, HOST-DT-01, HOST-ST-01 (rows 4–10), WD-UC-05 A1 | token only in memory and on the wire channel |
| U-SHELL | Embed-UI host half and client shell: service detection, `instance-missing`, sidebar entry, frame with admission, status and Retry outside the frame, Plugins card with model sync; slot registry used by U-MARKS / U-ATTN; **owns** `packages/embed-ui/package.json` and its client entry this wave | `packages/embed-ui/src/host/`, `packages/embed-ui/src/client/shell/`, `packages/embed-ui/package.json` | R-EMBED, K3, S4 | UIM-EP-01, UIM-UC-01 (integration part), UIM-DT-01 rows 3, 7, 7b | stores no secret; no token in the frame URL |
| FEAT-PEERS | Board and fold-notify: optional `fishballInstance?`, `fishball-core-missing`, board retention and `board_export`, fold-notify attention through `embed-ui.attention.signal` with `unsupported-operation` fallback | `packages/board/**`, `packages/fold-notify/**` | K3, K2 (attention tool contract via the façade fake), R-CORE | PLAT-EP-04 rows 1, 2, 4, PLAT-UC-06, PLAT-BVA-01, EXT-UC-04 A1 | boot never fails without core |

## W4 — Cross-cutting effects, Watchdog judgement and patrol, embed-UI features

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-REVOKE | Revocation effects: streams close, answers refused, offers to the user, sessions unmanaged with one note, held events for 30 days and restored on re-enable (per TQ-2 answer) | `packages/connector/src/revocation/` | C-TOKENS, C-MAILBOX, C-ROUTE | AUTH-UC-03, AUTH-UC-06, AUTH-DT-04 | takes effect on the next request |
| C-SUCCEED | `fishballConnectorTokens`: `createHosted`, `retire` as one transaction (sessions, role, name, re-issued offers with new ids, events with their ids, delete, notes, rollback) | `packages/connector/src/hosted/` | C-PAIR, C-ROUTE, C-MAILBOX | HOST-UC-03 (connector part), HOST-DT-02, HOST-ST-02, NAME-ST-01 rows 8–9 | name never held twice |
| WD-DECIDE | Permission judgement: allow / justified reject / `escalate` to the user / re-route to Fishball, settlement interception and non-waking note, first-commit races, model change timing | `packages/watchdog/src/decide/` | WD-ROUTE, K1 (answer tool contract; tested against a fake link) | WD-UC-01, WD-DT-01, WD-EP-04 rows 1–3 | no Fishball turn for allow, reject or escalate |
| WD-PATROL | Patrol timer (one per supervised session, exactly one per interval), patrol reads with watermark, `minCheckIntervalSeconds` validation, data-only `watchdog_brief` / `watchdog_refine`, pause (stop first) / resume with no run, no `watchdog_check_now`, no other timers | `packages/watchdog/src/patrol/`, `packages/watchdog/src/brief/` | WD-ROUTE | WD-UC-03, WD-UC-06, WD-UC-07, WD-EP-01 rows 12–15, WD-EP-02, WD-EP-04 row 4, WD-BVA-01, WD-BVA-02, WD-BVA-03, WD-ST-02, WD-ST-03 | a refine returns before any Watchdog work and never moves the timer |
| F-STATUS | Core status: `target-unset` / `target-unreachable` / `token-refused` / `TARGET_INCOMPATIBLE`, plugin-set completeness, standalone "watchdog is down" at app ready, `fishball-off`, status strip | `packages/core/src/status/`, `packages/core/ui/status/` | F-LINK, F-GUARDS, WD-ROUTE | REM-DT-01 (status display), PLAT-DT-02, WD-UC-05 (standalone), PLAT-EP-04 row 3 | one notice per DSH start |
| U-MARKS | Managed marks with names, Hand over / Take back buttons through the hand-over service, refresh on `onChange` | `packages/embed-ui/src/client/marks/`, `packages/embed-ui/src/host/handover/` | U-SHELL, C-ROUTE | HAND-UC-01, HAND-UC-02, HAND-UC-03, HAND-UC-04 (integration parts), UIM-DT-01 rows 6, 8 | names always match `managed()` |
| U-ATTN | Attention latch in embed-UI; `embed-ui.attention.signal` / `.state` contributed; fish and dots; clear on page open; reset on unload or loss of the designated Fishball's connection | `packages/embed-ui/src/client/attention/`, `packages/embed-ui/src/host/attention/` | U-SHELL, C-EXT | EXT-UC-04, EXT-DT-03 rows E3–E5 | absent without the connector service |

## W4b — Connector wiring

C-WIRE runs alone, after W4, because it wires in every connector module, including C-REVOKE and
C-SUCCEED from W4.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-WIRE | Connector plugin row: wire all modules, native settings schema (tokens list, `directAccess`, `routing.fishballToken`, limits; no per-contributor rows), V2 settings kept/inert, V2 intake holding queue; **owns** the connector plugin entry and settings schema | `packages/connector/src/index` (plugin row), `packages/connector/src/settings/`, `packages/connector/src/migration/` | every connector task of W2–W4: C-HTTP, C-OAUTH, C-TOKENS, C-PAIR, C-MAILBOX, C-EXT, C-ROUTE, C-TOOLS, C-REVOKE, C-SUCCEED | AUTH-UC-09 (integration part), PLAT-UC-05 step 1, PLAT-EP-03 | full connector loads on both SDKs; R-CON-10 |

## W5 — End to end, migration and acceptance

These tasks own acceptance tests and harnesses. Product fixes they find go back to the owning
task's area through a short follow-up task, serialised, so no two sessions edit one area.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| I-SUCCEED | Instance side of reinstall succession: keep the entry key, call `retire` after the new pairing, retry at next start, never for a user-made entry or a user delete | `packages/instance/src/host/succession/` | I-HOST, C-SUCCEED | HOST-UC-03, HOST-DT-01 rows 5–7, HOST-DT-02 (end to end) | succession runs only on reinstall |
| X-MIG | V2 → V3 upgrade on a real V2 child profile | `test/v3/migration/` | C-WIRE, I-HOST, F-STATUS, U-SHELL | PLAT-UC-05 | history, Skills, settings kept |
| X-SEC | Secret sweep over a full run; token-value placement checks | `test/v3/security/` | all of W4 and W4b | PLAT-EP-05, HOST-EP-02 (end to end), PLAT-EP-06 | zero hits |
| X-MATRIX | Install matrix rows and contribution matrix on a real DSH | `test/v3/matrix/` | all of W4 and W4b | UIM-DT-01 (headless columns), EXT-DT-03, PLAT-EP-03 rows 2–6 | every row except 11 checked |
| X-REMOTE | Standalone Fishball against a second DSH; hosted with a remote target | `test/v3/remote/` | C-WIRE, F-STATUS, F-PAIR, I-HOST | REM-UC-01, REM-UC-02, HOST-UC-05 (end to end) | two DSH processes, https or tunnel |
| DOCS | README notes: older MCP clients must upgrade, prompt-size note for contributors, standalone set-up and `board_export`, migration order | `README.md`, `packages/*/README.md` | W4 | — (R-CON-01, R-EXT-14, R-BRD-02 documentation parts) | reviewed |

## W5b — Compatibility matrix

X-COMPAT runs after W5, because it re-runs the X-MATRIX and X-REMOTE suites on both SDKs.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| X-COMPAT | The compatibility matrix | `test/v3/compat/` | X-MATRIX, X-REMOTE | PLAT-DT-03 | all rules pass |

## W6 — Browser e2e after merge

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| E2E-UI | Host-DSH browser flows: page, frame, status, Retry, marks, Hand over / Take back, fish and dots, native settings pair status, hosted model-sync card | `test/v3/e2e/host/` | merge of W5b | UIM-UC-01, UIM-UC-02, UIM-UC-03, HAND-UC-01…04 (UI), AUTH-UC-09, HOST-UC-04 (Retry), HOST-UC-07 (card), UIM-DT-01 (UI columns) | both SDKs |
| E2E-CORE | Fishball-page browser flows: `already-paired` warning, name clash, A-lite page and guards, `guards-overridden` strip | `test/v3/e2e/fishball/` | merge of W5b | AUTH-UC-05, AUTH-ST-03 (warning), NAME-UC-02 (page), NAME-DT-03 (page), PLAT-UC-04 (page), REM-UC-01 (page) | hosted and standalone, both SDKs |

## Dependency graph (summary)

```text
W0  S1 S2 S3 S4 S5 S6 S7
     │  │  │  │  │  │  │
W1  K1 ◄┴──┴──┴─────┴──┘   K2 ◄ S5   K3 ◄ S3 S4 S6   R-CORE  R-EMBED  R-CONN
W2  C-HTTP C-OAUTH C-TOKENS C-PAIR C-MAILBOX (K1) · C-EXT (K2) · F-LINK (K1) · F-INTERCEPT (K3) · F-GUARDS (K3, R-CORE) · I-PLACE (R-CORE)
W3  C-ROUTE (MAILBOX, PAIR) · C-TOOLS (HTTP, OAUTH) · F-PAIR · F-FACADE · WD-ROUTE · I-HOST · U-SHELL · FEAT-PEERS
W4  C-REVOKE · C-SUCCEED · WD-DECIDE · WD-PATROL · F-STATUS · U-MARKS · U-ATTN
W4b C-WIRE (all connector modules, incl. C-REVOKE, C-SUCCEED)
W5  I-SUCCEED · X-MIG · X-SEC · X-MATRIX · X-REMOTE · DOCS
W5b X-COMPAT (X-MATRIX, X-REMOTE)
W6  E2E-UI · E2E-CORE
```

## Overlap check (per wave)

| Wave | Shared hotspot | Single owner in the wave |
| --- | --- | --- |
| W1 | `packages/instance/package.json` | R-CORE |
| W1 | `packages/connector/package.json` | R-CONN |
| W2 | `packages/instance/package.json` | I-PLACE |
| W2–W4 | connector plugin row and settings schema | nobody (modules only; wired in W4b by C-WIRE) |
| W3 | `packages/watchdog/package.json` | WD-ROUTE |
| W3 | `packages/embed-ui/package.json`, client entry | U-SHELL |
| W3 | `packages/instance/src/host/` | I-HOST |
| W4b | connector plugin row and settings schema | C-WIRE (only task in the wave) |
| W4 | `packages/watchdog/` | WD-DECIDE (`decide/`), WD-PATROL (`patrol/`, `brief/`); row and manifest untouched |
| W4 | `packages/embed-ui/` | U-MARKS (`marks/`, `host/handover/`), U-ATTN (`attention/`); shell untouched |
| W5 | `packages/instance/src/host/succession/` | I-SUCCEED |
