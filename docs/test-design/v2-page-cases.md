# V2 PAGE, READY, PG-ORIGIN, LITE and SET — requirements-only catalogue

## 1. Scope, authority and execution status

Base: `cd87106f3bc761d68c6e919e83ffd40ac8e86262` (`docs/v2-final-scope`); delivery branch: `test/v2-page-cases`. This is **test design, not a product acceptance report**. Every behavioral case starts **Not Run**. Only `node --check` is authorized in this delivery; no product, browser, model, network, install, credential command or push.

Authority order:

1. The user's current task and settled decisions.
2. [Final V2 scope, §4–§5](<../planning/v2-final-scope.md#L138-L296>): PAGE, READY, PG-ORIGIN, LITE and SET ownership, signal readiness, isolated origin, prevention rather than correction.
3. [DESIGN amendments](<../../DESIGN.md#L3-L30>) and retained [native A-lite requirements](<../plugins/instance-extension-points.md#L1302-L1478>).
4. Retained [selected-provider, add-only sync semantics](<../slim-native-design.md#L1263-L1382>), including its placement: the sync control is only on the main DSH's `fishball-instance` card. The child settings panel has no sync button (the user's decision of 2026-11-11, "不允许子实例发起模型同步，只能主实例主动同步给子实例"); that allocation is the oracle again, superseding SET 8e9a658's child sync.
5. The documentation and **test IDs/titles only** at `d41b4e34631658d76c464bdb87421c7bae721399`. Historical implementation, test bodies, reported pass counts and stale fallback oracles are not sources of expected behavior.

No repository product implementation was read. Independent authors derive cases from these documents; immutable SDK contract/source inspection is permitted for `0.2.1-rc.5` and `0.2.2-rc.1`, not execution. Both versions are separate obligations, not aliases for one tested deployment.

## 2. Use Cases first; detailed case catalogues

For **each task**, the linked task section begins with Use Cases containing actor, preconditions, main flow, alternative flow, exception flow and postconditions. Supporting EP, BVA, Decision Table and State Transition cases follow, with concrete setup/actions/expected observations, traces and named missing seams. Only those five techniques are used; no Error Guessing or invented numerical product limits.

- [PAGE and READY Use Cases and detailed cases](<v2-page-ready-cases.md>).
- [PG-ORIGIN, LITE and SET Use Cases and detailed cases](<v2-origin-lite-set-cases.md>).

Each logical ID counts once in the summary, regardless of how many fixtures/boundary values it contains. Test titles expand each ID separately for each SDK. A parameterized value is not silently counted as an independently observed pass. All tables in this catalogue and its detailed sections are **Not Run** unless explicitly described as syntax verification.

## 3. Task summary and module ownership

**137 logical cases / 274 SDK-specific registrations.** Seven logical cases have opt-in HTTP assertion bodies (six PAGE, one SET); 130 require task-owned component/browser seams. With no HTTP fixtures configured, all 272 registrations remain TODO. With both SDKs' complete fixtures, 14 registrations can execute HTTP assertions and 258 remain TODO. Runnable does **not** mean executed.

| Task | What it tests | Logical cases | Key scenarios | Module |
|---|---|---:|---|---|
| PAGE | Page-open identity and ensure contract | 24 | GET-only refresh, POST only on open/Retry with null identity, singleton/no turn, honest failure | [PAGE module](<../../test/v2-page-cases/page.test.mjs>) |
| READY | Child readiness and lifecycle generation | 24 | Actual `appReady.onReady`, no timer, boot not blocked, concurrent waiters, disposal/restart/failure | [READY module](<../../test/v2-page-cases/ready.test.mjs>) |
| PG-ORIGIN | Isolated native admission and recovery | 28 | Exact owned origin, auth delivery, no main localStorage sharing, credential-safe status/Retry | [PG-ORIGIN module](<../../test/v2-page-cases/pg-origin.test.mjs>) |
| LITE | Prevention and effective read-only | 32 | Child-only distinct complex binding/unbind, unreachable sidebar/lineage/catalog, no correction/archive | [LITE module](<../../test/v2-page-cases/lite.test.mjs>) |
| SET | Slim native settings surface | 29 | Status/restart, read-only sync note (selected add-only sync only from the main card; child-initiated sync refused), native links/return, Read Only notice, no duplicate editors | [SET module](<../../test/v2-page-cases/set.test.mjs>) |

[Shared registration helper](<../../test/v2-page-cases/support.mjs>) registers task-named `test.todo` entries when no documented independently controllable component/browser seam exists. It never runs a pretend implementation, validates the catalogue as a substitute for the feature, or reports TODOs as acceptance. Task owners must bind their real component fixtures and assertions before claiming those obligations passed. The final browser-only verifier remains last; cases runnable at a component boundary must not be deferred merely because the integrated UI is unfinished.

### Executable PAGE boundary

The standard authenticated HTTP route `api/fishball/session` is documented by [the identity contract](<../integration-v2-nov9-wave2.md#L24-L33>), amended by decision 7.A at `d41b4e3` and [the final plan](<../planning/v2-final-scope.md#L72-L74>). It supports request/response assertions without importing product internals. Opt-in PAGE HTTP fixtures use explicitly provisioned disposable, synthetic-auth, SDK-specific loopback endpoints only. They do not bootstrap a child, read credentials or target a default/live URL. Missing fixture configuration registers a named PAGE TODO; unsafe/invalid supplied configuration is an error, not a skip. No fixture or HTTP call is made during syntax checking.

HTTP identity stability alone cannot prove zero model calls, one internal activation, boot progress, client-triggered POST restrictions or correct readiness generation; those retain separately named owner TODOs until real event/authority observers exist. No optional invented product-adapter API is prescribed.

## 4. Exact reconciliation with `d41b4e3`

Inventory source: titles extracted only from [the historical PAGE suite](<https://github.com/Arrosam/dsh-fishball/blob/d41b4e34631658d76c464bdb87421c7bae721399/packages/instance/test/instance-ext/page-open-session.test.mjs>) at that immutable commit. The companion page harness has no literal `test`/`describe`/`it` titles. There are **43 named case IDs**: A-01–18, B-01–13 and C-01–12. The documented historical **74** is not reconstructable from these titles alone; no old test bodies or parameter data were read, so this catalogue does not invent a 74-row mapping. Template fragments below are preserved exactly. The seven suite titles were also extracted: `A. route registration`, `A. GET (read-only)`, `A. POST (ensure)`, `A. other methods and paths (waterfall)`, `B. ensureSession through the chat activation`, `B. ensureSession over a fake chat port (createExtensions().bind)`, and `C. fishball page opens the manager session`.

**Keep** preserves the documented observable oracle, not proof that an old test body remains executable or sufficient. **Revise** retains relevant intent with the new oracle below. **Retire** preserves the historical ID here but adds no final-scope acceptance requirement for an undocumented implementation detail. New case IDs and detailed traces in the task catalogues replace implementation-coupled IDs rather than pretending these titles are current results.

| Prior ID and exact title | Disposition | Final oracle / owner |
|---|---|---|
| A-01 EP: path is /api/fishball/session and methods are exactly GET and POST | Revise | Observe documented GET/POST/405 contract, not route-registration internals; PAGE, READY signal applies before activation. |
| A-02 EP: a live string id -> 200 {sessionId} | Keep | PAGE returns assigned existing identity without a creation side effect. |
| A-03 BVA: undefined manager id -> 200 {sessionId:null} | Revise | Public missing identity is null; JavaScript `undefined` is not an ordered product boundary. PAGE EP. |
| A-04 ST: GET never calls ensureSession (null and live ids) | Keep | PAGE read-only lookup, including refresh; READY no eager activation. |
| A-05 BVA: a query string is ignored for GET | Retire | No blanket query-ignore rule in final requirements; PG-ORIGIN tests validated, non-secret continuation instead. |
| A-06 DT/EP: GET with ${label} -> 503 MANAGER_UNAVAILABLE | Revise | PAGE documented unavailable/error partitions only; unknown parameter expansion is not assumed. |
| A-07 BVA: a one-character id is valid | Revise | PAGE accepts the valid assigned nonblank identity; no invented minimum-length boundary. |
| A-08 EP: POST calls ensureSession once and returns 200 {sessionId} | Revise | PAGE ensure through existing singleton; READY activation cannot occur before actual ready signal. |
| A-09 ST: repeated POST returns the same id each time (idempotent through the manager) | Keep | PAGE externally stable identity and singleton activation observation separately. |
| A-10 BVA: POST with a query string still ensures | Retire | No new blanket query grammar or ignored-query requirement. Standard documented POST remains PAGE. |
| A-11 BVA: POST resolving a one-character id -> 200 | Revise | Same valid assigned-identity EP as A-07; no made-up length limit. |
| A-12 DT/EP: POST with ${label} -> 503 MANAGER_UNAVAILABLE | Revise | PAGE truthful failure/Retry; READY pending is not falsely timed-success or immediate failure. Unknown labels not inferred. |
| A-13 DT: POST does not succeed from sessionId() alone when ensureSession is missing | Revise | PAGE unavailable ensure capability must not report successful activation from cached identity alone; avoid private function-shape oracle. |
| A-14 EP: ${method} on the route -> 405 METHOD_NOT_ALLOWED, Allow: GET, POST | Keep | PAGE unsupported-method partition; documented `Allow` retained. Unknown old method values not inferred. |
| A-15 EP: HEAD on the route -> 405 with Allow: GET, POST | Keep | PAGE explicit unsupported HEAD; do not require a response body for HEAD. |
| A-16 BVA: PUT with a query string is still the route -> 405 | Revise | PAGE unsupported PUT => 405; query string is not a numerical BVA domain. |
| A-17 DT: ${method} on the route is not answered by the waterfall (next) | Retire | Framework waterfall dispatch is not an observable V2 requirement. |
| A-18 EP/BVA: other path ${url} -> next() | Retire | Private `next()` behavior and unspecified paths are not final PAGE requirements; PG-ORIGIN owns exact admission authority/path refusal. |
| B-01 ST: fresh child -> ensureSession creates one session and resolves its live id | Revise | PAGE only page-open/Retry demand; READY actual ready signal precedes activation, not install/attach. |
| B-02 ST: no turn and no model call when the session is ensured | Keep | PAGE no-turn/no-model observer obligation, not inferred from an HTTP success. |
| B-03 ST: a turn starts only when a message is sent after ensure | Keep | PAGE explicit intended user send works after readiness; retained authorized background work is not globally forbidden. |
| B-04 ST: repeated ensure after creation returns the same id and creates nothing | Keep | PAGE idempotence and no duplicate session. |
| B-05 BVA: two concurrent ensure calls share one activation | Revise | PAGE/READY join one activation; test before, across and after actual ready event. |
| B-06 BVA: many (10) concurrent ensure calls share one activation | Revise | PAGE/READY zero/one/two concurrent-request boundary plus multiple-waiter stress representative; 10 is not a product boundary. |
| B-07 DT: concurrent ensure + notify(wake) share one activation | Keep | PAGE existing authorized work joins singleton; do not add a new global readiness/delivery policy. |
| B-08 DT: notify first then ensure (reverse order) share one activation | Keep | PAGE same invariant in reverse event order. |
| B-09 ST: ensure after the chat page already activated returns the existing id | Keep | PAGE existing-session branch, no second activation. |
| B-10 ST: reading sessionId alone never creates (lazy creation unchanged) | Keep | PAGE nonactivating lookup, READY no install/attach creation. |
| B-11 ST: after ensure on a fresh child, a restart (same home and logs) resumes instead of creating a second id | Revise | PAGE durable identity; READY new generation must become ready, stale completion cannot activate it. |
| B-12 EP: ensureSession is a function on the apiVersion 1 manager | Revise | Retain documented X1a capability and current API compatibility; PAGE external ensure behavior rather than introspection as acceptance. |
| B-13 EP: ensureSession resolves the id the bound port activated | Retire | Fake-port wiring is not the product oracle; PAGE requires real assigned manager identity and observers. |
| C-01 ST: GET null -> one POST -> openSession(id); route is api/fishball/session | Revise | PAGE order retained; READY real child signal before activation and LITE protection before usable input. |
| C-02 EP: GET returns an id -> no POST, opens that id | Keep | PAGE opens assigned manager only. |
| C-03 DT: GET 503 -> unavailable + Retry, no POST | Keep | PAGE user-reachable failure handled, not silently ignored. |
| C-04 DT: GET null -> POST 503 -> unavailable + Retry | Keep | PAGE no false open/hidden failure. |
| C-05 ST: after POST 503, sessions.list notifications and focus never POST again | Keep | PAGE refresh stays GET-only, explicit Retry owns another ensure attempt. |
| C-06 ST: after GET 503, later notifications/focus re-read but never POST | Keep | PAGE no automatic create-on-refresh. |
| C-07 ST: Retry after POST 503 repeats GET and (null) POSTs once, then opens | Revise | PAGE flow retained; READY/PG-ORIGIN re-evaluate current generation and actual readiness. |
| C-08 ST: Retry after GET 503 with GET now returning an id -> no POST, opens | Keep | PAGE explicit Retry still respects existing identity. |
| C-09 ST: Retry after GET 503 with GET now null -> exactly one POST | Revise | PAGE one joined attempt; READY waits signal, no elapsed-time activation. |
| C-10 ST: once opened, later notifications and focus never POST | Keep | PAGE GET-only refresh, no repeated creation. |
| C-11 EP: no polling timers (setTimeout/setInterval) across apply, failure and Retry | Revise | READY proves actual `appReady.onReady` dependence and no boot deadlock, not merely absence of timer calls in one client; PAGE no automatic retry loop. |
| C-12 BVA: two Retry presses while unavailable POST at most once each | Revise | PAGE/READY concurrent attempts must join a singleton, not treat “one per press” as permission for duplicate activation. |

Additional superseded inherited oracles: [old guard “bounce within one frame”, hidden-only components and archive-after-RPC creation](<../plugins/instance-extension-points.md#L972-L1000>) are **rejected**, not deferred fallbacks. The historical [shared-origin content proxy and token-never-in-browser assertion](<../plugins/instance-extension-points.md#L968-L971>) are replaced by native cross-origin admission: token may necessarily occur in sensitive native redirect traces; final clean URL and redaction of public status/descriptors/errors/logging remain required. Bundled Remove hiding, Watchdog/board/MCP and profile migration are not these five tasks' gates.

## 5. Settled limits and edge-case classification

- **Accepted trusted-host scope:** same-host cookies can be sent to sibling ports. Distinct browser origins isolate localStorage, not malicious local servers. Audience/signature/expiry validation stays required. No test demands port-isolated cookies or separate hosts.
- **Remote/tunnel unsupported:** direct child loopback is for a trusted local browser/host. Document this limitation; do not open listeners, add a proxy, or fail local V2 acceptance for lack of remote-main-only tunnel support.
- **Native framing defaults accepted:** no exact-main `frame-ancestors` enforcement, same as native DSH. Do not test absence as a defect or reintroduce a response proxy. Deployment-added blocking headers produce honest unavailable/status behavior, not a new product security promise.
- **No correction, no archive fallback:** one-time assigned-manager selection and explicit user return are allowed; continuous drift correction, bouncing an activated forbidden view, and automatic cleanup/archive are not.
- **Only bypass-UI/unreachable races may be “it is what it is”.** Raw unsupported RPC/controller access does not imply a nonexistent SDK precreation veto. A reachable sidebar/catalog/lineage/reference/contributed command, first-input gap, storage failure, stale generation or failed sync is not exempt: prevent activation or hold the UI unavailable with status/Retry. No silent recovery or pretend protection interval.
- **Read-only is not shortcut authorization.** Remapping does not secure RPC/menu/tool authority. Private Skills is the sole narrow manager-agent-write exception; these suites assert the boundary, not all SK operations. User-native Settings/Plugins and add-only model sync remain allowed user operations. Detailed recommendation/Skills/V3 acceptance stays with its named owner.

## 6. Verification ledger

| Check | Actual result |
|---|---|
| `node --check` on all seven new `.mjs` files | Passed: five task modules plus shared registration and HTTP-fixture helpers. Syntax only; no imports, test registration or HTTP requests executed. |
| Static logical-ID inventory | 136 unique IDs: PAGE 24, READY 24, PG-ORIGIN 28, LITE 32, SET 28; 272 separately labelled SDK registrations. Primary technique totals: Use Case 22, EP 56, BVA 10, Decision Table 26, State Transition 22. |
| Catalogue file links | All local file destinations exist; immutable remote source links were not fetched. |
| Exact old-title reconciliation | 43 named IDs, 19 Keep / 19 Revise / 5 Retire; no old test bodies read. |
| Independent requirements-only review | Completed by a separate reviewer; no remaining blocking requirements/oracle finding. Corrected expiry fixtures, malformed diagnostics, Cancel semantics, single-fault DTs, overlapping lifetime-zero BVA, transcript reachability and deployment-blocked framing behavior. |
| Product/component/HTTP/browser tests on either SDK | **Not Run**. No fixtures provisioned, HTTP requests, model calls, installations or credential commands. No behavioral passes claimed; TODOs are future task-owned obligations. |

The HTTP helper's named 30-second transport abort is a test-harness execution budget only, **not** readiness, retry or preview expiry logic; it is inactive during syntax checks. Product behavior, both SDK deployments, browser evidence and historical 74-case execution remain unverified here. Final local commit SHA is reported in the delivery response; no push.
