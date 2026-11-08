# Test design: `fishballInstance` extension points, W0 and the X0 gate files

Status: **test design and red suite aligned to `design/instance-ext` 479df59 (including 6f7412b U14–U19), 2026-11-09.**
Source: `docs/plugins/instance-extension-points.md` at 479df59, especially §0 U14–U19, §12.5.1–§12.5.2, task rows/done-when and §5.4/§5.5. Its final reconciliation overrides the incorporated plugin designs. Black-box only: expected results come from requirements, never product implementation. Historical reports below are superseded where U14–U19 changed acceptance.

## 1. Scope and conventions

- **W0 (start now, per §5.3):** `K1`, `X0-C`, `FN-1`, `WD-1`, `B1`.
- **W1/W2 gate files kept in place:** `X0-I`, `X0-G`, `X0-A` (server half), `X0-S`, `X0-W`,
  `X0-B`. They are not W0 work, but their existing gates remain in place; touched approval cases are realigned for U14/U17. This W0 revision does not claim to implement all newly added later-wave acceptance.
- **Withdrawn:** `X0-U` (U10). Its test file is removed; its page cases move to PG-1's browser
  tests (§6).
- **Techniques:** EP = Equivalence Partitioning (valid and invalid); BVA = Boundary Value Analysis; DT = Decision Table; ST = State Transition; UC = Use Case (actor-goal scenarios predicted from the design, with separately counted main, alternative and exception flows). Use Cases are defined now even when execution belongs to a later task. Positive is not a technique.
- Former W0 positive IDs become collision-free EP-V-xx. Later-wave legacy P IDs stay unchanged in files; their corrected technique is EP below.
- **Ids:** `<short task>-<technique>-<nn>`, e.g. `XS-DT-11`. Every case names the X point or the
  task's done-when in its title.
- **U14:** the old blocked WD1-BVA-02 is deleted, not skipped. Approval time budgets and window-sum validation are not requirements. Check/guard timers remain, because they do not decide approval cards.
- **U15/U18:** no X3 namespace test or member in X0-C; typed refusals, restart-durable dedupe and its 10,000-key cap, both disabled send paths and ordered array delivery are executable acceptance requirements.
- **U17/U19:** clear settled cards immediately and keep ordinary records only at reached layers; archive board records while installed and apply a 30-day inclusive visibility window, not age-based deletion.
- **Skeleton service boundary:** all three loading stubs expose public services as direct Cordis
  context properties and through `services`/`get`. FN/B absent-instance cases omit the service
  from both surfaces. No skeleton stub provides the internal `fishballChat` port; inject assertions
  require the canonical optional `fishballInstance?` (§1).
- **Homes:** every boot uses a throwaway directory under `/private/tmp` (the K1 H-STUB harness is
  run with `TMPDIR=/private/tmp`; the instance harness has an explicit `/private/tmp` guard).
  No real DSH home, credential file or port is touched.
- **Run.** One task at a time (the developer's check command):
  ```sh
  TMPDIR=/private/tmp FBTEST_DSH_RUNTIME="…/0.2.2-rc.1/node_modules" \
    node --test packages/<package>/test/instance-ext/<file>.test.mjs
  ```
  The files live outside `test/run.mjs`'s `test/*.test.mjs` glob, so the existing suite stays
  green.

## 2. W0 cases

### 2.1 K1 — connector contract 1.2 and `state.unread` (§3)

| ID | T | Expected |
| --- | --- | --- |
| K1-EP-V-01 | EP | the connector contract is still major 1, now minor 2 |
| K1-EP-V-02 | EP | `LIMITS.unreadMax` is 9999 |
| K1-EP-V-03 | EP | `instance.attention` exists, is child→main and is not session-scoped |
| K1-EP-V-04 | EP | a valid attention request and its accepted response validate and round-trip |
| K1-EP-01 | EP | a malformed attention payload is refused (missing/extra field, wrong type, important > unread, negative, float `latestAt`) |
| K1-EP-02 | EP | attention is an added capability, never one the connector requires |
| K1-UC-01-E1 | UC | an invalid attention frame is an error and the connection stays usable for the next valid one |
| K1-BVA-01 | BVA | `unread` −1, 0, 1, 9999, 10000 |
| K1-BVA-02 | BVA | `importantUnread` 0, = `unread`, `unread` + 1, −1 |
| K1-BVA-03 | BVA | `latestAt` null, 0, an epoch-ms integer, a float |
| K1-DT-01 | DT | a 1.1 instance still attaches; the common minor is the lower one |
| K1-EP-V-05 | EP | the host bridge advertises `instance.attention` and answers a valid frame accepted |
| K1-UC-01-M | UC | real connector state: none → value → newer value → detach `{0,false}` → reattach zero → report again |

### 2.2 X0-C — service, manager, chat (X1, X2, X10, X11; U18 §12.5, no X3)

| ID | T | Expected |
| --- | --- | --- |
| XC-EP-V-01 | EP | the app row provides `fishballInstance` apiVersion 1 with every member |
| XC-EP-V-02 | EP | a registration returns `dispose`; a second dispose is a no-op |
| XC-EP-V-05 | EP | `userTexts` returns only user-written texts, newest first |
| XC-EP-01 | EP | `fishballChat` stays internal; the plugin-facing service is `fishballInstance` |
| XC-EP-02 | EP | X1 reports the manager Session id, not another agent id |
| XC-UC-01-M | UC | create: a registration made before the live Session is applied after the persona, in order |
| XC-UC-01-A1 | UC | resume: the same registration is applied again on `agents.resume` |
| XC-UC-01-A2 | UC | live: a registration made while the agent is live is applied at once |
| XC-UC-01-E1 | UC | a throwing registration is logged once across create/resume and skipped; a later one still applies |
| XC-UC-02-M | UC | `wake:true` is one notice turn with the plugin source |
| XC-UC-02-A1 | UC | `wake:false` is held and joins the next turn |
| XC-UC-02-E1 | UC | a duplicate `dedupeKey` is answered duplicate and starts no second turn |
| XC-UC-02-A2 | UC | `wake:true` queues whether the manager is idle or busy |
| XC-ST-01 | ST | registered → applied → disposed → registered again |
| XC-UC-01-A3 | UC | running fixture: registration immediately appears in the live scope; real model-request behavior has a separate TODO |
| XC-BVA-02 | BVA | `limit` 0, 1, available count 3, available count + 1; not an undocumented API maximum |
| XC-BVA-03 | BVA | `maxChars` cuts at a surrogate pair without a lone surrogate |

### 2.3 FN-1 — `fishball-fold-notify` skeleton

| ID | T | Expected |
| --- | --- | --- |
| FN1-EP-V-01 | EP | package `fishball-fold-notify` 0.1.0-alpha.0, bundle patch, files, `engines.dsh`, instance peer |
| FN1-EP-V-02 | EP | row exports `name`, optional `fishballInstance?` inject, no internal `fishballChat` inject, `Config`, `apply` |
| FN1-UC-CONFIG-M | UC | config defaults: `foldDefault` true, `systemNotification` when-hidden, `batchWindowMs` 1500 |
| FN1-EP-V-04 | EP | constants: `NOTIFY.maxChars` 4000, `NOTIFY.systemChars` 140, `FOLD.previewChars` 80, `FOLD.previewTools` 3, `BATCH.maxItems` 20, `SEEN.dwellMs` 600, `SEEN.threshold` 0.5 |
| FN1-UC-LOAD-M | UC | the row loads over a stub `fishballInstance` |
| FN1-BVA-01 | BVA | `batchWindowMs` 0…10000; −1 and 10001 and a fraction refused |
| FN1-EP-02 | EP | `systemNotification` off / when-hidden; another value refused |
| FN1-UC-CONFIG-A | UC | user chooses a valid `foldDefault` boolean; invalid string is separate CONFIG-E flow |
| FN1-UC-LOAD-A | UC | the row also loads without the optional instance service |

### 2.4 WD-1 — `fishball-watchdog` skeleton

| ID | T | Expected |
| --- | --- | --- |
| WD1-EP-V-01 | EP | package `fishball-watchdog` 0.1.0-alpha.0, bundle patch, `engines.dsh >=0.2.1-rc.5`, instance peer |
| WD1-EP-V-02 | EP | row exports `name`, `inject` (agents, tools, llm, profileContext, fishballInstance?), `Config`, `apply` |
| WD1-UC-LOAD-M | UC | the row loads over a stub `fishballInstance` |
| WD1-UC-LOAD-A | UC | without optional instance service the row loads (canonical §1 older-instance compatibility) |
| WD1-UC-CONFIG-M | UC | remaining §9 defaults after U14: 20 numeric, 2 text, 1 boolean; auditEntriesKept is operational audit only |
| WD1-BVA-01 | BVA | every numeric setting accepts its bounds and refuses min−1 and max+1 |
| WD1-EP-01 | EP | no separate enabled switch or removed approval-time schema fields; only supervision/check timers remain |

### 2.5 B1 — `fishball-board` skeleton

| ID | T | Expected |
| --- | --- | --- |
| B1-EP-V-01 | EP | package `fishball-board` 0.1.0-alpha.0, bundle patch, `engines.dsh`, instance peer, README |
| B1-EP-V-02 | EP | row exports `name`, optional `fishballInstance?` inject, no internal `fishballChat` inject, `Config`, `apply` |
| B1-UC-CONFIG-M | UC | config defaults: inject=true and contextCards=20; if retained, doneWindowHours=24 is recent-done counting only |
| B1-EP-V-04 | EP | constants: namespace, six statuses, `BOARD_LIMITS` cards 300 / links 8 / context 2000 / guide 900 |
| B1-UC-LOAD-M | UC | the row loads with a stub `fishballInstance` |
| B1-BVA-01 | BVA | `contextCards` 0…30; −1, 31 and a fraction refused |
| B1-BVA-02 | BVA | optional recent-done counter doneWindowHours, if exposed: 0…168; outside values refused; never a panel visibility cutoff |
| B1-UC-CONFIG-A | UC | user chooses a valid `inject` boolean; invalid string is separate CONFIG-E flow |
| B1-UC-LOAD-A | UC | without the points the row loads and logs `instance-hooks-missing` once |

U18 added entries: XC-EP-STUB-01…16; XC-DT-01 durable-key-before-queue; XC-BVA-KEYS-9999/10000/10001; XC-UC-02-E2 restart persistence; XC-UC-03-M1/M2 disabled tool sends; XC-UC-03-A1/A2 and XC-UC-04-M executable contract flows; additional image/array EP, DT and count/byte/image-bound BVA below. XA-DT-06/07 add reached-layer settlement and once-only wake checks; XA UC continuations name K2/PANELS.

Additional flow entries are enumerated in the linked Use Case ledgers (§9): K1-UC-01-A1/E2; XC-UC-02-A3; all CONFIG-E flows and WD1-CONFIG-A; all BUNDLE flows; and XC real-model/interface-contract TODOs. These are part of the counts, not merely prose examples. Each ledger records execution status and owner.

## 3. W1/W2 gate cases (kept consistent with e002ec3)

### 3.1 X0-I — inbox pipeline (X9)

| ID | T | Expected |
| --- | --- | --- |
| XI-EP-01 | EP | an unclaimed ordinary item is delivered directly |
| XI-EP-02 | EP | every contract item kind reaches the manager when nothing claims it |
| XI-EP-03 | EP | a second batcher gets `owner-busy` |
| XI-DT-01 | DT | a claimed item goes to its claimant, is acked at once and starts no turn |
| XI-DT-02 | DT | an item whose claim does not match falls through to the batcher |
| XI-DT-03 | DT | the batcher can deliver several items as one turn |
| XI-ST-01 | ST | `release(deliver:true)` re-enters after the claims (the batcher sees it) |
| XI-ST-02 | EP | `release(deliver:false)` delivers nothing |
| XI-ST-03 | ST | a held item is dropped when its card settles |
| XI-P-01 | EP | a claimed item never reaches the batcher |
| XI-P-02 | EP | `release` prepends its prefix to the delivered text |
| XI-P-03 | EP | `PERMISSION_NOTICE` exists and matches `[permission request <id>]` |
| XI-BVA-01 | BVA | prefix at 500 delivered; 501 never delivered whole |

### 3.2 X0-G — side agents (X13)

| ID | T | Expected |
| --- | --- | --- |
| XG-P-01 | EP | `open` returns the agent, its session id and `setSection` |
| XG-P-02 | EP | the side agent is sandbox read-only and approval never |
| XG-P-03 | EP | the side agent carries no Fishball persona |
| XG-P-04 | EP | `cancel` calls the agent cancel |
| XG-P-05 | EP | a resume after a restart runs the same lock-down setup |
| XG-EP-01 | EP | the global tools are denied through the host restrict seam |
| XG-ST-01 | ST | `setSection` replaces the named section |

### 3.3 X0-A — approvals seam, server half (X15, §2.6)

| ID | T | Expected |
| --- | --- | --- |
| XA-P-01 | EP | a claim returns a release function; `card()` and `onSettled` are exposed |
| XA-EP-01 | EP | active, paused and halted are claimable |
| XA-EP-02 | EP | none, dormant and cleared are refused `not-supervised` |
| XA-EP-03 | EP | a second claim on one session gets `owner-busy` |
| XA-EP-04 | EP | two sessions are independent: each card reaches only its own claimant |
| XA-EP-05 | EP | U17 legacy labels and closed/retired cards are not restored or copied into ordinary history |
| XA-DT-01 | DT | X14 state × claim → the card goes to the watchdog or to Fishball (§2.6) |
| XA-DT-02 | DT | enabled but not registered, and disabled, route cards to Fishball |
| XA-DT-03 | DT | a `decidedBy` answer on a card of an unclaimed session is refused and reaches no connector |
| XA-DT-04 | DT | a claimed session accepts a `decidedBy` allow; a grant is `delegate-no-grant` |
| XA-DT-05 | DT | the manager grant on a claimed session is `grant-off-supervised`; on an unclaimed one it is not |
| XA-ST-01 | ST | active → paused/halted keep the claim; dormant or clear drops it; the next card goes to Fishball |
| XA-ST-02 | ST | `release()` drops the claim; the next card goes to Fishball |
| XA-ST-03 | ST | resolution clears card immediately; duplicate settlement does not restore card or retain labels |

### 3.4 X0-S — supervision, start rule, send gate (X14, X16, X19; U7, U8)

| ID | T | Expected |
| --- | --- | --- |
| XS-P-01 | EP | `register` returns `set`, `clear`, `handedOver`, `dispose` |
| XS-P-02 | EP | `endingReason()` is undefined while registered; `failure` with the name still in the bundles; `hand-over` when it was removed |
| XS-P-03 | EP | `SESSION_STARTS.attachTimeoutMs` is 30 000 ms |
| XS-ST-01 | ST | none → active → paused → active → halted; each state gates a send |
| XS-ST-02 | ST | `clear` removes the entry; `onManagedChange` reports release/take-back |
| XS-ST-03 | ST | the user disable hands over: gate off, one notice, no stop |
| XS-ST-04 | ST | re-enable makes the kept briefs dormant; sends refuse until resumed |
| XS-ST-05 | ST | per-session state machine: no brief → active → paused → active → dormant → active |
| XS-DT-01 | DT | the manifest decides a disposal: name present → `plugin-gone` and the grace guard |
| XS-DT-01b | DT | the manifest decides a disposal: name absent → hand-over, no stop, gate off |
| XS-DT-02 | DT | `start_session` gains a required `watchdog` parameter only while an owner is registered |
| XS-DT-03 | DT | missing `watchdog` → `watchdog-brief-required`; no session starts |
| XS-DT-04 | DT | invalid argument → the owner's validate code; no session starts |
| XS-DT-05 | DT | valid + start ok + attach ok → `{watchdog:{briefId}}`; sendable and claimed at once |
| XS-DT-06 | DT | attach failed → `watchdog-assign-failed`, `stopped:true`, stop sent; not sendable/claimed |
| XS-DT-07 | DT | attach failed + stop failed → `stopped:false`; not sendable/claimed |
| XS-DT-08 | DT | attach timeout at 30 s → `watchdog-assign-failed` and a stop attempt |
| XS-DT-09 | DT | start failed → the v1 failure, nothing attached |
| XS-DT-10 | DT | the gate is off when `fishball-watchdog` is not in `dsh.profile.bundles` |
| XS-DT-11 | DT | enabled × registered × brief state → the §2.5 table |
| XS-DT-11b | DT | enabled but not registered refuses `watchdog-unavailable` |
| XS-DT-12 | DT | a refused send reaches no connector request |
| XS-DT-13 | DT | the image path goes through the same gate |
| XS-DT-14 | DT | the hand-over line is on `user`/`session` items without an active brief |
| XS-DT-15 | DT | the line is absent with an active brief, gate off, and on other kinds |
| XS-EP-01 | EP | the not-gated actions pass with the gate on and no brief |
| XS-BVA-01 | BVA | re-register at 29 s cancels the guard; 30 s and 31 s fire it |
| XS-BVA-02 | BVA | send immediately after `set(active)` allowed; after `set(paused)` refused |
| XS-BVA-03 | EP | U7 source: absent = off, present = on, registered = table, corrupt = `store-unavailable`; no `gateOn` file |

### 3.5 X0-W — scoped bridge and attention (X12, X8; U9)

| ID | T | Expected |
| --- | --- | --- |
| XW-P-01 | EP | an operation in the scope list reaches the host; no new handshake |
| XW-P-02 | EP | a second attention owner gets `owner-busy` |
| XW-P-03 | EP | `instance.attention` is never in the instance's required capabilities |
| XW-EP-01 | EP | an operation outside the scope list is refused locally `forbidden`; no request |
| XW-EP-02 | EP | a list outside the instance's required set is refused; no request |
| XW-EP-03 | EP | two scoped clients are independent |
| XW-DT-01 | DT | capability present × set → sent at once |
| XW-DT-02 | DT | capability absent × set → nothing sent |
| XW-ST-01 | ST | none → value → reconnect (same value) → dispose `{0,0,null}` |

### 3.6 X0-B — bundling and admin (X17, X18; U7, U9)

| ID | T | Expected |
| --- | --- | --- |
| XB-P-01 | EP | `RUNTIME.bundledPlugins` names the three plugins in order |
| XB-P-02 | EP | the instance declares each bundled plugin as an exact-version dependency |
| XB-P-03 | EP | `admin.plugins.get` marks the three `{bundled:true, removable:false}` |
| XB-P-04 | EP | enable and disable work; a disable is not a removal |
| XB-EP-01 | EP | `admin.plugin.remove` refuses `bundled-plugin`; the package stays installed |
| XB-DT-01 | DT | disable with a non-empty set → hand-over: gate off, claims dropped, no stop |
| XB-DT-02 | DT | a failed `setBundleEnabled` changes nothing; the manifest keeps the name |
| XB-DT-03 | DT | a skipped bundled name whose placement failed this start does not fail the start |
| XB-DT-04 | DT | any other skipped bundle stays fatal, after the bundled names are placed |
| XB-DT-05 | DT | a direct `pluginManager.setBundleEnabled` disable is the same hand-over |
| XB-DT-06 | DT | an empty supervised set hands over without a notice |
| XB-ST-01 | EP | one failed placement leaves the others; each placed name is in both `vendor/` and `node_modules/` |

## 4. Counts

| Task | EP | BVA | Decision Table | State Transition | Use Case | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| K1 | 7 | 3 | 1 | 0 | 4 | **15** |
| X0-C | 41 | 22 | 8 | 1 | 19 | **91** |
| FN-1 | 4 | 1 | 0 | 0 | 8 | **13** |
| WD-1 | 3 | 1 | 0 | 0 | 11 | **15** |
| B1 | 3 | 2 | 0 | 0 | 15 | **20** |
| **W0 defined flows/cases** | **58** | **29** | **9** | **1** | **57** | **154** |
| X0-I | 7 | 1 | 3 | 2 | 0 | **13** |
| X0-G | 6 | 0 | 0 | 1 | 0 | **7** |
| X0-A | 6 | 0 | 7 | 3 | 3 | **19** |
| X0-S | 5 | 2 | 17 | 5 | 0 | **29** |
| X0-W | 6 | 0 | 2 | 1 | 0 | **9** |
| X0-B | 6 | 0 | 6 | 0 | 0 | **12** |
| **All defined cases including UC TODOs** | **94** | **32** | **44** | **13** | **60** | **243** |

Primary technique is counted once per entry. Use Case counts mean flows (main, alternative and exception), including explicit TODOs, not story definitions. No blocked/skipped approval-window case remains.

W0 has **5 story-level Use Cases**, **57 UC flows = 36 executable + 21 TODO**. With 97 non-UC executable cases: **133 executable + 21 TODO = 154 entries**. No awaiting-contract TODO remains; remaining TODOs have explicit integration/later-task owners.

| Task | Executable | TODO | UC executable | UC TODO |
| --- | ---: | ---: | ---: | ---: |
| K1 | 15 | 0 | 4 | 0 |
| X0-C | 89 | 2 | 17 | 2 |
| FN-1 | 10 | 3 | 5 | 3 |
| WD-1 | 9 | 6 | 5 | 6 |
| B1 | 10 | 10 | 5 | 10 |

Secondary DT/ST coverage in actor flows is recorded in the Use Case documents, not double-counted: service-presence loading rules, setup/notify decision rules, unread lifecycle transitions. No requirement was dropped just because its primary category changed.

### 4.1 Published callable contracts (479df59 §12.5.1–2)

- **Images:** empty and omitted attachments each produce one exact session.message payload and an unchanged delivered result; unconfirmed is returned without retries or a fabricated watch; connector refusal rejects. UC03-A1/A2, DT02, EP-IMAGE01.
- **Inbox array:** UC04-M observes one user-role followup and exact caller-framed text joined with two newline characters; receipt messageId equals queued id. UC04-E1 rejects an invalid middle item with no partial queue/fetch. EP covers duplicate text, mutation, typed metadata/options/image validation; DT covers singleton source/legacy overload, skipImages, and shape→count→text→image validation order.
- **BVA:** counts 0/1/19/20/21; joined UTF-8 bytes 65,535/65,536/65,537 including emoji and separators; per-item image counts 19/20/21, pixel/byte caps ±1 under skipImages validation. Async error name/code and unchanged input/zero queue are asserted.
- **Acknowledgement scope:** W0 proves queue receipt, not per-item wire ack or model completion. X0-I/FN-6 owns wire acknowledgements and successful actual image-fetch/order integration; XC-UC-04-A1 is a named TODO, not an unresolved API.

## 5. Test-file → task map

| Task | File | Covers |
| --- | --- | --- |
| W0 K1 | `packages/connector/test/instance-ext/k1.test.mjs` | contract 1.2, `instance.attention`, `state.unread` |
| W0 X0-C | `packages/instance/test/instance-ext/x0-c.test.mjs` | X1, X2, X10, X11, U18 durable dedupe/stubs/tool pass-through |
| W0 FN-1 | `packages/fold-notify/test/instance-ext/fn-1.test.mjs` | fold skeleton |
| W0 WD-1 | `packages/watchdog/test/instance-ext/wd-1.test.mjs` | watchdog skeleton |
| W0 B1 | `packages/board/test/instance-ext/b1.test.mjs` | board skeleton |
| W1 X0-I | `test/instance-ext/x0-i.test.mjs` | X9 |
| W1 X0-G | `test/instance-ext/x0-g.test.mjs` | X13 |
| W1 X0-A | `test/instance-ext/x0-a.test.mjs` | X15 server half |
| W1 X0-S | `test/instance-ext/x0-s.test.mjs` | X14, X16, X19 |
| W1 X0-W | `test/instance-ext/x0-w.test.mjs` | X12, X8 |
| W2 X0-B | `test/instance-ext/x0-b.test.mjs` | X17, X18, §2.2 |

## 6. Cases not written, and why

| Area | Omitted case | Why |
| --- | --- | --- |
| X0-U | all server/page cases | Withdrawn (U10). The module/list/route/signal/CSP cases have no successor; the page cases are PG-1's browser tests. |
| X0-C X3 | projection into `GET api/chat`, SSE `entry`, fallback row, `recordTextChars` | Entirely outside X0-C (U15): PG-1 owns registration-time namespace enforcement. |
| X0-A | the "代批 / Watchdog" tag, the open escalation card | UI half moves to PANELS (U12). The server `card`/`onSettled`/claim cases stay here. |
| X0-B | "Built in" tag, settings-page cases | Plugin management moves to DSH's Plugins page; Fishball's settings page is kept but slimmed (U13, §11.8). X17/X18 server cases stay. |
| X0-I | a held item expiring at `expiresAt` | The frozen `inbox.push` has no expiry; the claim's expiry comes from an approval descriptor the claim does not receive. |
| X0-G | `runTurn` result and timeout | Needs DSH's real agent loop; `open`/lock-down/`setSection`/`cancel` are covered. |
| X0-B | BVA of the `bundled` state file; successful placement of all three; survival of `admin.plugin.install` | The real plugin packages arrive with their waves; the fixture packages cover one-failed-placement and the skipped-bundle decision. SP-FN1's install/reinstall remains X-E2E. |
| K1 | a browser check of the important brand alert | The connector `client.js` DOM is a browser case (FN-A/E2E); the wire and `state.unread` are covered here. |

## 7. Final decisions and remaining execution ownership

U14–U19 at 6f7412b resolve the former four questions. There is no blocked window-sum test; X3 namespace belongs to PG-1; U18 core behavior is specified; U19 is visibility, not pruning. The old decision document is retained as explicitly superseded history.

- The two callable contracts are now resolved by 479df59 §12.5.1–§12.5.2: images.message with exact target/text/empty attachments and delivered/unconfirmed passthrough; deliverInbox local text-only items, one queue receipt, async validation, 20-item and 65,536 UTF-8-byte bounds. The earlier awaiting-contract TODOs are replaced with executable tests. Per-wire-item ack integration remains X0-I/FN-6, not a chat-method receipt.
- Real model next-request/disposal and real loader integration retain later owners X-E2E/X0-B (§12.5).
- K2 and PANELS own connector/UI timer removal and immediate card cleanup; W0 stories constrain them with TODO flows rather than asserting UI behavior from stubs.
- B2/B3/B4/B5/B10/B11 own visibility, reopen/clear transitions, archive/search and uninstall/export; B1 does not fix a visibility constant name or require doneWindowHours as a panel cutoff.

## 8. Open questions

No undecided product options are inferred here. The two former interface questions are answered by 479df59; the previous four A/B questions are closed by U14/U15/U18/U19. Any remaining integration evidence is explicitly assigned to later tasks rather than treated as an unspecified contract.

## 9. Predicted Use Cases and execution ownership

Use Cases are design constraints, not retrospective descriptions of implementation. Each main, alternative and exception flow has its own test entry; executable and TODO flows are counted separately from the number of Use Case definitions.

- [Core Use Cases](instance-ext-w0-core-use-cases.md): K1 and X0-C, actors, preconditions, success/alternative/exception flows, postconditions and task/X-id traceability.
- [Skeleton Use Cases](instance-ext-w0-skeleton-use-cases.md): FN-1, WD-1 and B1, including user enable/disable, optional service, invalid settings and watchdog profile-bundle enablement.
- Flows within W0 scope execute using existing stubs/harness. A flow needing later behavior is still specified now and has a `test.todo` naming its owning task. No W0 task has Use Case marked N/A.
- Skeleton State Transition remains N/A as an independent W0 technique: no additional observable skeleton lifecycle contract is specified. User enable/disable flows are nevertheless predicted now as Use Cases, with later-task ownership where necessary.
- FN/WD/B loading Decision Tables retain present/absent service rules. Config × raw `apply` rejection is not invented; invalid settings are exercised through the public Config schema.
- Later-wave non-UC case tables remain existing gate coverage only, not a claim that later tasks have no Use Cases. Their integrated flows can be constrained by the written W0 Use Cases and extended in their own test plans.

The former four ambiguity decisions are resolved by U14/U15/U18/U19. [Historical explanations](instance-ext-w0-decisions.md) are superseded; current acceptance is 6f7412b §12.
