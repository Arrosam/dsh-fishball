# Test design: `fishballInstance` extension points, W0 and the X0 gate files

Status: **test design and red suite, 2026-11-08, against `design/instance-ext` e002ec3.**
Source: `docs/plugins/instance-extension-points.md` at e002ec3 (§1, §2, §2.6, §3, §5.1, §5.3,
§5.5, §6), plus the three plugin designs at their §9/§13/§14 and §15 (fold-notify, watchdog,
board). Black-box only: every expected result comes from those documents, never from product code.

## 1. Scope and conventions

- **W0 (start now, per §5.3):** `K1`, `X0-C`, `FN-1`, `WD-1`, `B1`.
- **W1/W2 gate files kept in place:** `X0-I`, `X0-G`, `X0-A` (server half), `X0-S`, `X0-W`,
  `X0-B`. They are not W0 work, but their design changed in e002ec3 (U7, U8, §2.6, U10–U12), so
  their cases below match the final design.
- **Withdrawn:** `X0-U` (U10). Its test file is removed; its page cases move to PG-1's browser
  tests (§6).
- **Techniques:** EP = Equivalence Partitioning (valid and invalid); BVA = Boundary Value Analysis; DT = Decision Table; ST = State Transition; UC = Use Case (true e2e). Positive is not a technique.
- Former W0 positive IDs become collision-free EP-V-xx. Later-wave legacy P IDs stay unchanged in files; their corrected technique is EP below.
- **Ids:** `<short task>-<technique>-<nn>`, e.g. `XS-DT-11`. Every case names the X point or the
  task's done-when in its title.
- **Historical red baseline:** the original suite targeted missing services/packages/contracts.
  This test-only correction was not executed; no current pass/fail claim is made.
  WD1-BVA-02 is explicitly skipped as blocked, not counted as executable coverage.
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
| K1-EP-03 | EP | an invalid attention frame is an error and the connection stays usable for the next valid one |
| K1-BVA-01 | BVA | `unread` −1, 0, 1, 9999, 10000 |
| K1-BVA-02 | BVA | `importantUnread` 0, = `unread`, `unread` + 1, −1 |
| K1-BVA-03 | BVA | `latestAt` null, 0, an epoch-ms integer, a float |
| K1-DT-01 | DT | a 1.1 instance still attaches; the common minor is the lower one |
| K1-EP-V-05 | EP | the host bridge advertises `instance.attention` and answers a valid frame accepted |
| K1-ST-01 | ST | real connector state: none → value → newer value → detach `{0,false}` → reattach zero → report again |

### 2.2 X0-C — service, manager, chat (X1, X2, X10, X11; X3 type rule only)

| ID | T | Expected |
| --- | --- | --- |
| XC-EP-V-01 | EP | the app row provides `fishballInstance` apiVersion 1 with every member |
| XC-EP-V-02 | EP | a registration returns `dispose`; a second dispose is a no-op |
| XC-EP-V-06 | EP | a type in the plugin's own prefix is accepted; dispose removes the registration |
| XC-EP-V-05 | EP | `userTexts` returns only user-written texts, newest first |
| XC-EP-01 | EP | `fishballChat` stays internal; the plugin-facing service is `fishballInstance` |
| XC-EP-02 | EP | X1 reports the manager Session id, not another agent id |
| XC-EP-03 | EP | a type with a foreign plugin prefix is refused |
| XC-DT-01 | DT | create: a registration made before the live Session is applied after the persona, in order |
| XC-DT-02 | DT | resume: the same registration is applied again on `agents.resume` |
| XC-DT-03 | DT | live: a registration made while the agent is live is applied at once |
| XC-DT-04 | DT | a throwing registration is logged once across create/resume and skipped; a later one still applies |
| XC-DT-05 | DT | `wake:true` is one notice turn with the plugin source |
| XC-DT-06 | DT | `wake:false` is held and joins the next turn |
| XC-DT-07 | DT | a duplicate `dedupeKey` is answered duplicate and starts no second turn |
| XC-DT-08 | DT | `wake:true` queues whether the manager is idle or busy |
| XC-ST-01 | ST | registered → applied → disposed → registered again |
| XC-EP-V-07 | EP | a registration made during a turn is on the live agent before the next step |
| XC-BVA-02 | BVA | `limit` 0, 1, available count 3, available count + 1; not an undocumented API maximum |
| XC-BVA-03 | BVA | `maxChars` cuts at a surrogate pair without a lone surrogate |

### 2.3 FN-1 — `fishball-fold-notify` skeleton

| ID | T | Expected |
| --- | --- | --- |
| FN1-EP-V-01 | EP | package `fishball-fold-notify` 0.1.0-alpha.0, bundle patch, files, `engines.dsh`, instance peer |
| FN1-EP-V-02 | EP | row exports `name`, optional `fishballInstance?` inject, no internal `fishballChat` inject, `Config`, `apply` |
| FN1-EP-V-03 | EP | config defaults: `foldDefault` true, `systemNotification` when-hidden, `batchWindowMs` 1500 |
| FN1-EP-V-04 | EP | constants: `NOTIFY.maxChars` 4000, `NOTIFY.systemChars` 140, `FOLD.previewChars` 80, `FOLD.previewTools` 3, `BATCH.maxItems` 20, `SEEN.dwellMs` 600, `SEEN.threshold` 0.5 |
| FN1-DT-01 | DT | the row loads over a stub `fishballInstance` |
| FN1-BVA-01 | BVA | `batchWindowMs` 0…10000; −1 and 10001 and a fraction refused |
| FN1-EP-02 | EP | `systemNotification` off / when-hidden; another value refused |
| FN1-EP-03 | EP | `foldDefault` boolean; a string refused |
| FN1-DT-02 | DT | the row also loads without the optional instance service |

### 2.4 WD-1 — `fishball-watchdog` skeleton

| ID | T | Expected |
| --- | --- | --- |
| WD1-EP-V-01 | EP | package `fishball-watchdog` 0.1.0-alpha.0, bundle patch, `engines.dsh >=0.2.1-rc.5`, instance peer |
| WD1-EP-V-02 | EP | row exports `name`, `inject` (agents, tools, llm, profileContext, fishballInstance?), `Config`, `apply` |
| WD1-DT-01 | DT | the row loads over a stub `fishballInstance` |
| WD1-DT-02 | DT | without optional instance service the row loads (canonical §1 older-instance compatibility) |
| WD1-EP-V-04 | EP | every §9 default is the designed value (23 numeric, 2 text, 1 boolean) |
| WD1-BVA-01 | BVA | every numeric setting accepts its bounds and refuses min−1 and max+1 |
| WD1-EP-01 | EP | there is no `enabled` setting (U7: DSH's bundle switch is the off switch) |
| WD1-BVA-02 | BVA (blocked) | skipped: exact public Config window-sum relation, limits and invalid-input outcome need an authoritative specification; arithmetic over test defaults is not coverage |

### 2.5 B1 — `fishball-board` skeleton

| ID | T | Expected |
| --- | --- | --- |
| B1-EP-V-01 | EP | package `fishball-board` 0.1.0-alpha.0, bundle patch, `engines.dsh`, instance peer, README |
| B1-EP-V-02 | EP | row exports `name`, optional `fishballInstance?` inject, no internal `fishballChat` inject, `Config`, `apply` |
| B1-EP-V-03 | EP | config defaults: `inject` true, `contextCards` 20, `doneWindowHours` 24 |
| B1-EP-V-04 | EP | constants: namespace, six statuses, `BOARD_LIMITS` cards 300 / links 8 / context 2000 / guide 900 |
| B1-DT-01 | DT | the row loads with a stub `fishballInstance` |
| B1-BVA-01 | BVA | `contextCards` 0…30; −1, 31 and a fraction refused |
| B1-BVA-02 | BVA | `doneWindowHours` 0…168; −1 and 169 refused |
| B1-EP-01 | EP | `inject` boolean; a string refused |
| B1-DT-02 | DT | without the points the row loads and logs `instance-hooks-missing` once |

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
| XA-EP-05 | EP | an old label without `decidedBy` loads as manager-decided |
| XA-DT-01 | DT | X14 state × claim → the card goes to the watchdog or to Fishball (§2.6) |
| XA-DT-02 | DT | enabled but not registered, and disabled, route cards to Fishball |
| XA-DT-03 | DT | a `decidedBy` answer on a card of an unclaimed session is refused and reaches no connector |
| XA-DT-04 | DT | a claimed session accepts a `decidedBy` allow; a grant is `delegate-no-grant` |
| XA-DT-05 | DT | the manager grant on a claimed session is `grant-off-supervised`; on an unclaimed one it is not |
| XA-ST-01 | ST | active → paused/halted keep the claim; dormant or clear drops it; the next card goes to Fishball |
| XA-ST-02 | ST | `release()` drops the claim; the next card goes to Fishball |
| XA-ST-03 | ST | an open card is settled or closed |

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
| K1 | 8 | 3 | 1 | 1 | 0 | **13** |
| X0-C | 8 | 2 | 8 | 1 | 0 | **19** |
| FN-1 | 6 | 1 | 2 | 0 | 0 | **9** |
| WD-1 | 4 | 1 | 2 | 0 | 0 | **7** |
| B1 | 5 | 2 | 2 | 0 | 0 | **9** |
| X0-I | 7 | 1 | 3 | 2 | 0 | **13** |
| X0-G | 6 | 0 | 0 | 1 | 0 | **7** |
| X0-A | 6 | 0 | 5 | 3 | 0 | **14** |
| X0-S | 5 | 2 | 17 | 5 | 0 | **29** |
| X0-W | 6 | 0 | 2 | 1 | 0 | **9** |
| X0-B | 6 | 0 | 6 | 0 | 0 | **12** |
| **All executable cases** | 67 | 12 | 48 | 14 | 0 | **141** |

W0: **57 executable** (13 + 19 + 9 + 7 + 9); **1 blocked/skipped** WD1-BVA-02 is excluded. Counts are declared coverage, not verified passes.

## 5. Test-file → task map

| Task | File | Covers |
| --- | --- | --- |
| W0 K1 | `packages/connector/test/instance-ext/k1.test.mjs` | contract 1.2, `instance.attention`, `state.unread` |
| W0 X0-C | `packages/instance/test/instance-ext/x0-c.test.mjs` | X1, X2, X10, X11, X3 type rule |
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
| X0-C X3 | projection into `GET api/chat`, SSE `entry`, fallback row, `recordTextChars` | Withdrawn (U10, §5.5). Only the record-type rule stays. |
| X0-A | the "代批 / Watchdog" tag, the open escalation card | UI half moves to PANELS (U12). The server `card`/`onSettled`/claim cases stay here. |
| X0-B | "Built in" tag, settings-page cases | Plugin management moves to DSH's Plugins page; Fishball's settings page is kept but slimmed (U13, §11.8). X17/X18 server cases stay. |
| X0-I | a held item expiring at `expiresAt` | The frozen `inbox.push` has no expiry; the claim's expiry comes from an approval descriptor the claim does not receive. |
| X0-G | `runTurn` result and timeout | Needs DSH's real agent loop; `open`/lock-down/`setSection`/`cancel` are covered. |
| X0-B | BVA of the `bundled` state file; successful placement of all three; survival of `admin.plugin.install` | The real plugin packages arrive with their waves; the fixture packages cover one-failed-placement and the skipped-bundle decision. SP-FN1's install/reinstall remains X-E2E. |
| K1 | a browser check of the important brand alert | The connector `client.js` DOM is a browser case (FN-A/E2E); the wire and `state.unread` are covered here. |

## 7. Remaining coverage limitations (not acceptance sign-off)

Independent review identified gaps that remain despite the expected red results:
- X10 duplicate coverage is same-process only; restart-durable dedupe is not demonstrated by this fake-session harness.
- X0-C checks member presence, not every later-wave stub's `not-implemented` refusal. Explicit watchdog-off send-path pass-through and array delivery coverage still need dedicated W0 cases.
- The running-agent registration case checks immediate public tool visibility with a running status; it does not drive a real model's next request. SP-X1 is prior spike evidence, not this case's execution.
- Package skeleton `apply` is exercised with public-service stubs, not a real Cordis bundle-loader smoke test. Bundle patch contents are not yet validated.
- X3 retains a namespace rule, but the precise public validation seam after projector withdrawal is unclear; the current two cases still use the old registration signature and require owner confirmation.

These limitations mean the current files must not yet be advertised as a complete definition of done for all W0 acceptance criteria.

## 8. Open design questions

1. **K1 `state.unread` reset on close — coverage added.** The H-STUB case covers detach and reattach, reports attention again, then calls `stub.fireClose()` and observes `host.state` reset to `{count: 0, important: false}`. Transport close is exercised directly rather than inferred from detach; no detach-proxy ambiguity remains. This describes the declared coverage, not an execution result.
2. **WD-1 "window-sum check" — blocked ambiguity.** The task mentions a check without an authoritative exact Config relation, fixed/model-dependent window limit, or invalid-input outcome. The previously asserted sums over test-owned defaults exercised no product behavior and are removed. The authoritative watchdog design §9 says the approval sum fits 120 seconds “at the defaults” and uses each card’s `expiresAt`; §15 lists sums 120/121 but does not specify Config rejection. Its context threshold is model-dependent `min(config, contextWindow − growth − output)`, not a fixed 200k sum. Source designs were read from local design branches via temporary document extracts. WD1-BVA-02 remains explicitly skipped until the requirement owner specifies valid/invalid Config inputs and expected outcomes; neither a 120-second sum nor a fixed 200k model window is invented as a rule.
3. **Skeleton inject form — resolved by canonical §1.** Require `fishballInstance?` in FN-1, B1 and WD-1. `fishballChat` is internal and must not be injected by FN/B; it is not stubbed. Missing-instance load cases use a genuinely absent public service, not a hidden direct-property copy.
4. **B1 prune-age constant — uncovered naming ambiguity.** The design does not specify the public export key for the 30-day prune age. The invented `BOARD_LIMITS.pruneAgeDays` assertion is removed; no prune-age constant coverage is claimed pending a documented public name.
5. **K1 host bridge attention port.** The design says the validated payload "goes to the attachment"; it does not name the host-side callback (`onAttention`, the session port, or the connector-service binding). The K1 case observes only the wire answer and the real `state.unread`; it does not assert an internal callback. **A.** leave the seam internal; **B.** name it in K1's done-when. Recommendation: **A**.

## 9. Technique N/A and e2e owners

- K1: Use Case N/A — the real host/stub child lifecycle is State Transition, not a true user journey; X-E2E owns real child → connector → unread/important browser alert.
- X0-C: Use Case N/A — fake manager sessions are point-contract coverage; X-E2E owns real plugin registration → model turn → visible delivery. XC-EP-V-07 is classified EP: setting a fake running status checks a valid partition, not a real state transition.
- FN-1: State Transition N/A — no specified skeleton state machine/observable disposal contract; Use Case N/A — X-E2E/FN-A owns notify → folded timeline → seen → attention.
- WD-1: State Transition N/A — supervision transitions belong to later WD tasks; Use Case N/A — X-E2E/WD-12 owns start → assign → supervise → approvals/hand-over.
- B1: State Transition N/A — card transitions belong to B2; Use Case N/A — X-E2E/B8 owns write → compaction → context/panel → disable/restart.
- FN/WD/B loading Decision Tables each have one condition (service present/absent) and two rules (load; B absent also logs once). No extra apiVersion branch is inferred.
- FN/WD/B config × loading Decision Table N/A — independent schema checks are EP/BVA; no raw apply invalid-config contract defines a combined decision or refusal.
- Later-wave absent techniques: X0-I Use Case; X0-G BVA/Decision Table/Use Case; X0-A BVA/Use Case; X0-S Use Case; X0-W BVA/Use Case; X0-B BVA/State Transition/Use Case. No additional specified boundaries/transitions/decisions justify those techniques in these fixtures; X-E2E owns integrated real runtime/browser journeys (side-agent loop, approvals, supervision, attention, bundled reinstall).

Added: WD1-DT-02 — absent optional instance service loads per canonical §1 older-instance compatibility. No invented config or lifecycle behavior. Window-sum, X3, prune-age and remaining core gaps remain unchanged.
