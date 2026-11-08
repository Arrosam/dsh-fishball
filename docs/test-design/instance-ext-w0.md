# Test design: `fishballInstance` extension points, W0 / X0-*

Status: **test design and red suite, 2026-11-08.** Source: `docs/plugins/instance-extension-points.md` at
`design/instance-ext` 24d978e (§1, §2, §5.1, §6) and the spike report `docs/spikes/instance-ext.md`
(SP-X1, SP-FN1, S1). Black-box: every expected result below comes from the design, never from the
child implementation. The suite is written before the X0 code exists and is expected to be red.

Scope: the X0 task group only — **X0-C, X0-I, X0-U, X0-W, X0-G, X0-A, X0-S, X0-B** and the hooks they
own, **X1–X19**, plus the X17/X18 bundling rules of §2.2. Plugin waves (FN-*, WD-*, B*) and K1's
contract-1.2 wire additions are out of scope. X0-W's X8 cases still need K1 at implementation time;
they fail today for the same reason.

## 1. Conventions

- **Techniques.** P = positive; EP = negative/equivalence partitioning; DT = decision table;
  ST = state transition; BVA = boundary values (min − 1 / min / max / max + 1 where a range exists).
- **Ids.** `<task letter><technique>-<nn>`, e.g. `XS-DT-10`. Every row names its X point.
- **Red.** "Red" means the case fails now because the service, export or behaviour does not exist
  yet. A missing `fishballInstance` (X0-C) fails every service case with one message:
  *"fishballInstance is not provided by the child app row (X0-C)"*. Static cases fail on the missing
  export or constant.
- **Run.**
  ```sh
  FBTEST_DSH_RUNTIME="…/0.2.2-rc.1/node_modules" \
    node --test test/instance-ext/*.test.mjs
  ```
  The files live in `test/instance-ext/`, outside `test/run.mjs`'s `test/*.test.mjs` glob, so the
  existing suite stays green and each task can be selected by file (`node --test
  test/instance-ext/x0-s.test.mjs`).
- **Homes.** Every boot uses a fresh `mkdtemp(os.tmpdir())` home, removed after the test. No real
  DSH home, credential file or port is read or written. The existing-suite run uses
  `FBTEST_TEST_HOMES` and `FBTEST_PROVIDER_SYNC_HOMES` under `/private/tmp`.

## 2. Harness and observation points

`test/support/instance-ext.mjs` boots the child rows in the launch overlay's order
(`session-tools` → `approvals` → `app` → `inbox` → `admin`) over a Cordis-like fake context, then
attaches a fake main host to the child's real bridge (handshake + contract-validated frames). This
makes only public surfaces observable:

| Point | What it is |
| --- | --- |
| S | `ctx.get('fishballInstance')` — the service the app row provides (X1–X16) |
| T | the child's registered tools (`start_session`, `message_session`, `redirect_session`, `answer_approval`, …) and their real typed results |
| H | the fake connector's frame log: a refused send must produce **no** request; a scoped bridge must reuse the one handshake |
| HTTP | `fishballApp`'s loopback surface: `GET/POST /api/chat`, `/api/ui-extensions`, `/ui/ext/*`, `/api/ext/*`, `GET /` CSP, `GET /api/events` SSE |
| I | inbox items the host pushes and the child's ack/refusal frame; the manager agent's queued turns |
| F | the child home's documented files (the decision record, the supervision file) |

The fake DSH boot `test/fixtures/fake-dsh-boot.mjs` and the two fixture packages
(`test/fixtures/bundled/fishball-{fold-notify,board}`) exist only for X0-B's `initializeProfile`
start-up cases; the real plugin packages arrive with their waves.

## 3. Cases

### 3.1 X0-C — service, manager, chat (X1, X2, X3, X10, X11)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XC-P-01 | P | X1–X16 | app row provides `fishballInstance` with `apiVersion` 1 and all ten members (`manager`, `chat`, `inbox`, `ui`, `attention`, `bridge`, `sideAgents`, `approvals`, `supervision`, `sessionStarts`) |
| XC-P-02 | P | X2 | a registration returns `dispose`; a second dispose is a no-op and queues no turn |
| XC-P-03 | P | X3 | a throwing projector is logged once per `(pluginId, point)` and the chat page still answers 200 |
| XC-P-04 | P | X3 | a projected record becomes exactly `{id, kind:'plugin', plugin, at, data}` |
| XC-P-05 | P | X11 | `userTexts` returns only user-written texts, newest first |
| XC-EP-01 | EP | X1 | `fishballChat` stays internal; `fishballInstance.chat` is the extension point, not the internal port |
| XC-EP-02 | EP | X1 | `manager.sessionId()` is the manager Session id, never another agent's |
| XC-EP-03 | EP | X3 | a type with a foreign `plugin:` prefix is refused and projected by nobody |
| XC-EP-04 | EP | X3 | a projector returning `undefined` drops the record |
| XC-EP-05 | EP | X3 | `text` is optional on the projected entry; present when the projector gives it |
| XC-DT-01 | DT | X2 | create × registered before live × fn ok → applied after the persona, in registration order |
| XC-DT-02 | DT | X2 | resume × registered before live × fn ok → applied again on `agents.resume` |
| XC-DT-03 | DT | X2 | registered after live → applied at once (SP-X1: next step) |
| XC-DT-04 | DT | X2 | fn throws → logged and skipped; a later registration still applies |
| XC-DT-05 | DT | X10 | `wake:true` → one notice turn, source `{kind:'fishball-notice', form:'plugin', pluginId}` |
| XC-DT-06 | DT | X10 | `wake:false` → `held`, starts no turn, joins the next turn |
| XC-DT-07 | DT | X10 | duplicate `dedupeKey` → `duplicate`, no second turn |
| XC-DT-08 | DT | X10 | `wake:true` queues whether the manager is idle or busy |
| XC-ST-01 | ST | X2 | registered → applied → disposed (tool and section gone) → registered again |
| XC-ST-02 | ST | X2 | a registration during a turn is on the live agent before the next step |
| XC-ST-03 | ST | X3 | a disposed projector projects no later record |
| XC-BVA-01 | BVA | X3 | `EXT_LIMITS.recordTextChars` is 8000; text at 8000 and 8001 is at most the cap |
| XC-BVA-02 | BVA | X11 | `limit` 0, 1, max, max+1 (max+1 returns what exists) |
| XC-BVA-03 | BVA | X11 | `maxChars` cuts at a surrogate pair without a lone surrogate |

### 3.2 X0-I — inbox pipeline (X9)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XI-EP-01 | EP | X9 | an unclaimed ordinary item is delivered directly and acked |
| XI-EP-02 | EP | X9 | all six contract kinds (`session`, `user`, `system`, `watch`, `approval`, `plugin`) reach the manager unclaimed |
| XI-EP-03 | EP | X9 | a second batcher gets `{code:'owner-busy'}` |
| XI-DT-01 | DT | X9 | claimed × match → only the claimant sees it, acked at once, no turn |
| XI-DT-02 | DT | X9 | no claim match × batcher present → the batcher sees it, then delivery |
| XI-DT-03 | DT | X9 | the batcher delivers two items as one turn |
| XI-ST-01 | ST | X9 | claim held → `release(deliver:true)` re-enters after the claims (the batcher sees it) |
| XI-ST-02 | ST | X9 | claim held → `release(deliver:false)` delivers nothing |
| XI-ST-03 | ST | X9 | a held item is dropped when its card settles |
| XI-P-01 | P | X9 | a claimed item never reaches the batcher |
| XI-P-02 | P | X9 | `release` prepends its `prefix` to the delivered text |
| XI-P-03 | P | X9 | `PERMISSION_NOTICE` exists and matches `[permission request <id>]` |
| XI-BVA-01 | BVA | X9 | prefix at 500 is delivered; 501 is never delivered whole |

### 3.3 X0-U — page modules, routes, signals (X4–X7)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XU-P-01 | P | X4 | no module → `GET /api/ui-extensions` is `[]`, the shell still answers 200 |
| XU-P-02 | P | X4 | one module is listed with `pluginId`, `module`, `style` |
| XU-P-03 | P | X4 | two modules are listed in registration order |
| XU-P-04 | P | X5 | a route answers its status and JSON body; the handler runs |
| XU-P-05 | P | X4 | the shell CSP still has `default-src 'self'` and no `http(s):` source |
| XU-P-06 | P | X7/X3 | the X3 `text` fallback row is drawn as a plugin entry when no module renders it |
| XU-EP-01 | EP | X4 | the module and style are served under `/ui/ext/<pluginId>/` with their bytes |
| XU-EP-02 | EP | X4 | a missing module file is 404 |
| XU-EP-03 | EP | X4 | a path escape is 404 |
| XU-EP-04 | EP | X5 | a wrong method for a registered route is 405; the right method is 200 |
| XU-EP-05 | EP | X5 | a body over the api limit is 4xx and the handler is not called |
| XU-EP-06 | EP | X6 | two signals for one `(pluginId,type)` in one tick coalesce to one SSE `ext`; a second type is a second event |
| XU-ST-01 | ST | X4 | dispose removes the list entry and stops serving the file |

### 3.4 X0-W — scoped bridge and attention (X12, X8)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XW-P-01 | P | X12 | an operation in the scope list reaches the host; no new handshake |
| XW-P-02 | P | X8 | a second attention owner gets `{code:'owner-busy'}` |
| XW-P-03 | P | X8 | `instance.attention` is never in the instance's required capabilities |
| XW-EP-01 | EP | X12 | an operation outside the scope list is refused locally `forbidden`; nothing reaches the connector |
| XW-EP-02 | EP | X12 | a list outside the instance's required set is refused; no request |
| XW-EP-03 | EP | X12 | two scoped clients are independent (one cannot use the other's operations) |
| XW-DT-01 | DT | X8 | capability present × set → the value is sent at once |
| XW-DT-02 | DT | X8 | capability absent × set → nothing is sent |
| XW-ST-01 | ST | X8 | none → value → reconnect (same value again) → dispose `{0,0,null}` |

### 3.5 X0-G — side agents (X13)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XG-P-01 | P | X13 | `open` returns `{agent, sessionId, setSection}` and creates a second agent |
| XG-P-02 | P | X13 | the side session logs `sandbox/mode = read-only` and `approval/policy = never` |
| XG-P-03 | P | X13 | the side scope carries no Fishball persona section |
| XG-P-04 | P | X13 | `cancel(agent)` calls the agent's cancel |
| XG-P-05 | P | X13 | a later resume still runs the lock-down setup |
| XG-EP-01 | EP | X13 | the global tools are denied through the host `tools.restrict` seam |
| XG-ST-01 | ST | X13 | `setSection(name, text)` replaces that section |

### 3.6 X0-A — approvals seam and the escalation card (X15)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XA-DT-01 | DT | X15 | a second delegate gets `{code:'owner-busy'}` |
| XA-DT-02 | DT | X15 | the delegate's `onCard` sees every offered approval |
| XA-DT-03 | DT | X15 | delegate × decision `grant` → `delegate-no-grant`; no connector request |
| XA-DT-04 | DT | X15 | manager `grant` on a supervised session → `grant-off-supervised` |
| XA-DT-05 | DT | X15 | manager `grant` on an unsupervised session is not refused |
| XA-EP-01 | EP | X15 | an old label without `decidedBy` loads as manager-decided (never watchdog) |
| XA-P-01 | P | X15 | `card(approvalId)` returns the live descriptor; `onSettled` fires; the card is gone after settlement |

### 3.7 X0-S — supervision, start rule and send gate (X14, X16, X19)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XS-P-01 | P | X14 | `register` returns `set`, `clear`, `handedOver`, `dispose` |
| XS-P-02 | P | X14 | `endingReason()` is undefined while registered; `failure` after a disposal without intent |
| XS-P-03 | P | X16 | `SESSION_STARTS.attachTimeoutMs` is 30 000 ms (the bridge's request timeout) |
| XS-ST-01 | ST | X14/X19 | none → active → paused → active → halted; each state's send result |
| XS-ST-02 | ST | X14 | `clear` removes the entry; `onManagedChange` reports the release/take-back |
| XS-ST-03 | ST | X14 | user disable → hand-over: gate off, one notice listing session and state, no stop, `handedOver` non-empty |
| XS-ST-04 | ST | X14 | re-enable → the kept brief is `dormant`; send refuses `watchdog-brief-required` with `briefId`; notice names `watchdog_resume`; nothing is stopped; resume unlocks |
| XS-ST-05 | ST | X19 | per session: no brief → active → paused → active → dormant → active; one send at each state |
| XS-DT-01 | DT | X14 | disposal with intent → hand-over; without intent → `watchdog-unavailable`, then the grace guard stops running managed sessions |
| XS-DT-02 | DT | X16 | `start_session` gains a required `watchdog` parameter only while an owner is registered |
| XS-DT-03 | DT | X16 | missing `watchdog` → `watchdog-brief-required`; no session starts |
| XS-DT-04 | DT | X16 | invalid argument → the owner's validate code; no session starts |
| XS-DT-05 | DT | X16 | valid + start ok + attach ok → `{watchdog:{briefId}}`; `supervision.set(active)` already ran (send allowed) |
| XS-DT-06 | DT | X16 | attach failed → `watchdog-assign-failed`, `stopped:true`, `session.stop` sent |
| XS-DT-07 | DT | X16 | attach failed + stop failed → `watchdog-assign-failed`, `stopped:false` |
| XS-DT-08 | DT | X16 | attach timeout at 30 s → `watchdog-assign-failed` and a stop attempt |
| XS-DT-09 | DT | X16 | start failed → the v1 failure, nothing attached, no stop |
| XS-DT-10 | DT | X19 | gate table: off → allowed; on + none/dormant → `watchdog-brief-required`; on + active → allowed; on + paused/halted → `supervision-paused`; redirect too |
| XS-DT-11 | DT | X19 | gateOn true with no registrant → `watchdog-unavailable` |
| XS-DT-12 | DT | X19 | a refused send (tool, redirect, image path) reaches no connector request |
| XS-DT-13 | DT | X19 | the image path (`fishballBridge.request(session.message)`) goes through the same gate |
| XS-DT-14 | DT | X19 | the hand-over line is on `user` and `session` items from a session without an active brief; the item still queues its turn and is acked |
| XS-DT-15 | DT | X19 | the line is absent with an active brief, with the gate off, and on `watch`, `system`, `approval` items |
| XS-EP-01 | EP | X19 | the not-gated actions pass with the gate on and no brief (list, read, watch, approvals/questions/prompts/grants, release, stop) |
| XS-BVA-01 | BVA | X14 | re-register at 29 s cancels the guard; at 30 s and 31 s the guard fires |
| XS-BVA-02 | BVA | X19 | a send immediately after `set(active)` is allowed; immediately after `set(paused)` is refused |
| XS-BVA-03 | BVA | X19 | `gateOn` absent = off; true = on; false = hand-over (allowed); corrupt = `store-unavailable` and sends refused |

### 3.8 X0-B — bundling and admin (X17, X18, §2.2)

| ID | T | X | Case → expected |
| --- | --- | --- | --- |
| XB-P-01 | P | X17 | `RUNTIME.bundledPlugins` is exactly the three names, in order |
| XB-P-02 | P | X17 | `packages/instance/package.json` declares each name as an exact-version dependency |
| XB-P-03 | P | X18 | `admin.plugins.get` marks all three `{bundled:true, removable:false}` |
| XB-P-04 | P | X18 | disable and enable work on a bundled plugin; a disable is not a removal |
| XB-EP-01 | EP | X18 | `admin.plugin.remove` refuses a bundled name with `bundled-plugin`; the package stays installed |
| XB-DT-01 | DT | X18 | disable with a non-empty supervised set → hand-over: gate off, no stop |
| XB-DT-02 | DT | X18 | `setBundleEnabled` fails → nothing changes; the paused send stays refused |
| XB-DT-03 | DT | §2.2 step 6 | a skipped bundled name whose placement failed this start does not fail the start |
| XB-DT-04 | DT | §2.2 step 6 | any other skipped bundle stays fatal (`PROFILE_INCOMPATIBLE`) |
| XB-ST-01 | ST | §2.2 step 2 | one failed placement leaves the others; each placed name is in both `vendor/<name>` and `node_modules/<name>` |

## 4. Counts

| Task | P | EP | DT | ST | BVA | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| X0-C | 5 | 5 | 8 | 3 | 3 | **24** |
| X0-I | 3 | 3 | 3 | 3 | 1 | **13** |
| X0-U | 6 | 6 | 0 | 1 | 0 | **13** |
| X0-W | 3 | 3 | 2 | 1 | 0 | **9** |
| X0-G | 5 | 1 | 0 | 1 | 0 | **7** |
| X0-A | 1 | 1 | 5 | 0 | 0 | **7** |
| X0-S | 3 | 1 | 15 | 5 | 3 | **27** |
| X0-B | 4 | 1 | 4 | 1 | 0 | **10** |
| **All** | **30** | **21** | **37** | **14** | **7** | **110** |

## 5. Test-file → task map (the definition of done)

| File | Gates | Cases |
| --- | --- | --- |
| `test/instance-ext/x0-c.test.mjs` | X0-C (X1–X3, X10, X11) | XC-* |
| `test/instance-ext/x0-i.test.mjs` | X0-I (X9) | XI-* |
| `test/instance-ext/x0-u.test.mjs` | X0-U (X4–X7) and the X3 fallback row | XU-* |
| `test/instance-ext/x0-w.test.mjs` | X0-W (X12, X8) | XW-* |
| `test/instance-ext/x0-g.test.mjs` | X0-G (X13) | XG-* |
| `test/instance-ext/x0-a.test.mjs` | X0-A (X15) | XA-* |
| `test/instance-ext/x0-s.test.mjs` | X0-S (X14, X16, X19) | XS-* |
| `test/instance-ext/x0-b.test.mjs` | X0-B (X17, X18, §2.2) | XB-* |

Each file is runnable alone and fails only its own task's cases. A task is done when its file is
green on both DSH versions (X0-C also with the existing suite unchanged and green).

## 6. Cases not written, and why

| Area | Omitted case | Why |
| --- | --- | --- |
| X0-U X7 | sidebar order (equal and negative orders), `onSignal` filtering, a second `setTimelinePresenter` → `owner-busy`, dictionaries | These run inside the browser shell's page hook, which the design does not expose as a Node-callable seam. The server/list/signal half is covered. A browser phase or an exported hook factory is needed. |
| X0-I X9 | a held item expiring at `expiresAt` | The frozen `inbox.push` payload has no expiry; the claim's expiry comes from an approval descriptor the claim does not receive. The design states the rule but names no observation point. |
| X0-G X13 | `runTurn` result (`{toolCalls, usage, endReason}`) and its timeout | Needs DSH's real agent loop (model request, turn end); not observable on the in-process fake. `open`/lock-down/`setSection`/`cancel` are covered. |
| X0-B §2.2 | BVA of the `bundled` state file (absent, empty, unknown name); successful placement of all three; survival of `admin.plugin.install` | The three real plugin packages are plugin-wave work (FN-1/WD-1/B1). The fixture packages cover one-failed-placement and the skipped-bundle decision; the full SP-FN1 install/reinstall run stays in the X-E2E suite. |
| K1 | contract 1.2 `instance.attention` validation, 1.1/1.2 mixed peers, connector `state.unread` | K1 is a separate W0 task (connector contract), not an X0-* hook. X8's send/dispose/rehandshake side is covered; the wire validators are K1's file. |

## 7. Open design questions

1. **The page-hook seam (X7).** `sidebar`, `onSignal`, `setTimelinePresenter` and the dictionaries
   are described only as members of the object passed to a page module's default export. There is
   no named factory or server route, so a Node test cannot drive them.
   **A.** Add an exported `createPageHook(...)` (or a `GET /api/ui-hook` debug route) and test it in
   Node as part of X0-U. **B.** Leave them to a real-browser phase (the current choice).
   Recommendation: **B** for W0, then **A** if the browser phase is deferred.
2. **The X2 registration factory name.** The design says only "new `child/extensions.js`"; it does
   not name the export that builds the service. These tests avoid the question by booting the app
   row and reading `fishballInstance` from the context. If a direct unit factory is wanted,
   **A.** give it a documented name (`createInstanceExtensions`) in X0-C's done-when; **B.** keep
   the app-row boot as the only construction path. Recommendation: **B** (already black-box).
3. **Refusal codes the design does not name.** Foreign X3 type, a scoped bridge list outside the
   required set, a 501-character release prefix: the design says "refused" but not the code. The
   cases assert the observable consequence (no projection, no request, no 501-char delivery) and
   not a specific code. **A.** Name the codes (`invalid-type`, `forbidden`, `limit`); **B.** keep
   the consequence-only assertions. Recommendation: **A** for `bridge` (`forbidden` is already
   named in X12) and **B** for the other two.
4. **`supervision.supervised(sessionIds)` shape (X15).** The name and the argument are given, but
   not whether it sets the supervised set or returns a filtered list. The X0-A case passes the list
   and then checks the manager's `grant`; it never inspects a return value. **A.** define it as a
   setter (single owner) in X15; **B.** define it as a predicate/getter. Recommendation: **A** —
   it matches `setDelegate`/`setBatcher`'s "set then read the effect".
5. **`gateOn` file location and shape.** §2.5 says "persisted in the instance's supervision file"
   and names `gateOn`; it does not name the file or the document key path. The corrupt-store BVA
   case locates the file by searching the child home for `"gateOn"`. **A.** name the file and shape
   in X0-S's done-when; **B.** keep the search (works but couples the test to the key). Recommendation:
   **A**.
6. **X0-B placement seam.** §2.2 says "at every child start" and names `installation.js` and
   `files.js`; it does not say whether placement runs in `initializeProfile` (before the skipped
   check) or in `copyChildCode` (after it). The X0-B cases call `initializeProfile`; if placement
   moves to `copyChildCode`, the start check cannot honour "failed this start". **A.** state
   "placement runs inside `initializeProfile`, before `loadProfileDirectory`"; **B.** add a
   placement port argument to both. Recommendation: **A** — it is the only order in which step 6
   is implementable.
