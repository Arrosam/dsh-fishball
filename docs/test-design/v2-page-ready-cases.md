# V2 PAGE and READY — independent requirements-only cases

**Design fragment; all cases Not Run.** Owned tasks: **PAGE and READY only**. Baseline: `cd87106f3bc761d68c6e919e83ffd40ac8e86262`, branch `test/v2-page-cases`. This fragment can be linked from the [final catalogue](<v2-page-cases.md>). It does not claim product, UI, fixture, SDK or acceptance success.

Only **Use Case, Equivalence Partitioning (EP), Boundary Value Analysis (BVA), Decision Table and State Transition** are used. Use Cases precede supporting cases for each task. No arbitrary request maximum, identity length/grammar, delay, polling interval or readiness timeout is introduced.

## 1. Source authority and independence

| Ref | Requirements source | Application and precedence |
|---|---|---|
| S1 | [Final scope §2.1:72–74](<../planning/v2-final-scope.md#L72-L74>) | Frozen decision 7.A: page-open identity GET; null → authenticated POST → `manager.ensureSession()` → singleton `chat.activate()`; no turn. Focus/list refresh GET-only; failures wait for explicit Retry. |
| S2 | [Final scope §4 PAGE/READY:148–149](<../planning/v2-final-scope.md#L148-L149>) | PAGE singleton/read-only GET/no duplicate/no model turn; READY actual child `appReady.onReady`, before/after signal, concurrent join, cancellation/refusal and no stale activation. |
| S3 | [Final scope §4.2:169–173](<../planning/v2-final-scope.md#L169-L173>) | No deadlocking apply/boot await, no eager install creation, no startup timer or deferred-plugin dependency; readiness applies to page-open creation, not a new global manager-work policy. |
| S4 | [Final scope §4.3:267](<../planning/v2-final-scope.md#L267>) and [scope contract:9–20](<../planning/v2-final-scope.md#L9-L20>) | Actual app readiness is not iframe `load`; fresh/V2-only child; no migration, bundles, MCP or Watchdog prerequisite. PG-ORIGIN/LITE, not PAGE/READY, own admission remount, origin isolation, shortcuts and navigation security. |
| S5 | [d41b4e3 extension design X1a](<https://github.com/Arrosam/dsh-fishball/blob/d41b4e34631658d76c464bdb87421c7bae721399/docs/plugins/instance-extension-points.md#L84-L88>) | `manager.ensureSession() → Promise<string>` creates/resumes the same manager via single activation without turn/model call; authorized notice/handover remains lazy and joins activation. Parent confirmed documented POST 200 `{sessionId}` and `Allow: GET, POST`. |
| S6 | [Wave-2 documented route contract:24–33](<../integration-v2-nov9-wave2.md#L24-L33>) | Route `api/fishball/session`, 200 `{sessionId:string\|null}`, GET same-origin/no-store; 405 `METHOD_NOT_ALLOWED`, 503 `MANAGER_UNAVAILABLE`; native page rejects malformed/blank identity. **Only public observation contracts retained.** Its prohibition on creation and GET-only Retry are superseded by S1/S5; no inferred error nesting or exclusive response-key schema. |
| S7 | [DESIGN:90](<../../DESIGN.md#L90>) and [historical eager singleton wording:118](<../../DESIGN.md#L118>); [extension design native page rules:1307–1328](<../plugins/instance-extension-points.md#L1307-L1328>) | Retain singleton/private native-session/ecosystem intent. Eager-install/resume wording is superseded for page-open by S1–S3. Old corrective-navigation/archive or bundle requirements are not acceptance oracles here. |

The author read applicable instructions and design documentation, the supplied documentation copies, and the parent's [old ID/title-only reconciliation](<v2-page-cases.md#L46-L98>). **No repository implementation or old test source was read.** No SDK source was required. Reading the newly supplied shared [TODO registrar](<../../test/v2-page-cases/support.mjs>) only establishes the parent's test-author coordination interface, not a product adapter or oracle. Parent owns the old-case keep/revise/retire ledger; old one-character-ID and “10 concurrent requests” titles do not establish a grammar or new numeric limit. The historical 74-case result is not final acceptance.

## 2. Common fixture data and observation limits

**Every case applies separately to DSH `0.2.1-rc.5` and DSH `0.2.2-rc.1`.** These names appear in every registered test title through the parent's SDK matrix; one configured SDK never supplies evidence for the other.

- **F-FRESH:** fresh disposable V2-only child, no persisted manager, pending notices, handover or unrelated writers; actual child ready already signalled unless a READY case says otherwise.
- **F-EXISTING:** ready disposable child with one known manager, represented in task descriptions by `fishball-manager-existing`; the HTTP fixture supplies its actual known ID in `expectedSessionId`. The representative string is not an ID grammar/default.
- **F-UNAVAILABLE:** authenticated disposable child with this route registered, but manager/ensure capability unavailable. This is an explicit lifecycle configuration, not a fresh-but-not-ready substitute: before-ready POST must wait, not immediately 503 merely because a signal is delayed.
- **F-LIFECYCLE (missing):** an independently documented driver must control the **real** child `appReady.onReady`, boot/apply settlement, generation replacement, disposal/failure and activation-completion barriers; observe pending/resolved/refused requests, real session identities/creations, ensure/activation and model-turn/request provenance. It must not implement a fake readiness gate or desired singleton algorithm.
- **F-PAGE (missing):** independent native-page driver must dispatch page-open, explicit Retry, focus and sessions-list events separately and observe actual GET/POST, selection and unavailable/Retry state. Error response representatives are specified in cases; these are inputs, not a test-authored product implementation.
- **Checkpoint/barrier:** event-driven ordering acknowledged by the independent fixture. No sleep, elapsed-time guess, timer advancement or repeated polling proves “still pending,” “immediate” or readiness. “Immediately after ready” means no new readiness event or timer is necessary, not zero milliseconds.

HTTP alone can assert returned identities, status/Allow/error tokens and GET cache policy. It **cannot** establish internal ensure/activation count, zero model calls, no transient duplicate session, actual readiness gating, cancellation, client-trigger policy or UI availability. Stable IDs after concurrent requests are not falsely equated with singleton activation proof.

### 2.1 Opt-in HTTP fixture contract (test-owned, not a new product API)

The [PAGE module](<../../test/v2-page-cases/page.test.mjs>) and [shared fixture transport](<../../test/v2-page-cases/http-fixtures.mjs>) use only standard HTTP against documented `api/fishball/session`. `FBTEST_V2_PAGE_HTTP_FIXTURES` is JSON with independent exact SDK keys. Each SDK optionally supplies `freshReady`, `existingReady`, `managerUnavailable`. Each configured scenario supplies:

| Field | Explicit obligation |
|---|---|
| `baseUrl` | Disposable fixture origin only, `http:` numeric `127.0.0.1` or IPv6 loopback, explicit separately allocated port; path `/`, no userinfo/query/fragment. No default URL. Known live ports `7713`, `3081`, `54679` are refused. These are deployment safety exclusions, not product numeric boundaries. |
| `disposable` | Exactly `true`; supplier guarantees isolation from all user/live homes and services. |
| `syntheticAuth` | Exactly `true`; supplier guarantees a synthetic disposable native-admission fixture, never real credentials. |
| `cookie` | Nonblank printable-ASCII synthetic fixture cookie, supplied explicitly; tests never acquire, print or persist credentials. |
| `expectedSessionId` | Required for the existing-identity GET case; independently seeded manager ID, not observed then recycled as its own expected result. |

The supplier must establish actual readiness/freshness/unavailability externally, record the exact SDK/build, and avoid unrelated mutations. A URL label alone does not attest a binary version. Missing per-SDK/per-scenario configuration registers an explicit **PAGE TODO** with owner, prerequisites and expected behavior; supplied malformed/unsafe configuration fails rather than silently becoming TODO. Redirects are not followed. URL parse diagnostics omit raw configuration. No implicit fixture bootstrap, SDK imports, process start, install, live-browser access or model calls are performed by these modules. A later authorized HTTP run is integration evidence only, never browser E2E.

## 3. PAGE Use Cases — first

All PAGE UCs have the **user opening/returning to Fishball** as primary actor; child native page/session route and manager are supporting actors. Passive events are not creation authorizations.

### PAGE-UC-01 — Observe fresh ready HTTP identity and idempotent ensure

- **Actor:** independently authorized HTTP verifier, representing page-open requests; not an integrated browser.
- **Preconditions:** F-FRESH, synthetic admission, exact configured SDK, no other writers.
- **Main flow:** GET → null; repeat GET → null; POST ensure → nonblank ID; GET → same ID; repeat POST → same ID; send two overlapping POSTs → both same ID. Successful GETs are no-store.
- **Alternative flow:** existing identity is covered by PAGE-EP-01; unavailable operations by PAGE-EP-02/03.
- **Exception flow:** missing fixture remains TODO; unsafe config fails; redirect/non-success/malformed identity fails assertions, not an automatic retry.
- **Postconditions:** observed stable HTTP identity only. PAGE-UC-03/07 and PAGE-ST-04 retain the unproven activation/no-turn/client obligations.

### PAGE-UC-02 — Open an already identified manager

- **Actor:** user opens native Fishball page.
- **Preconditions:** F-EXISTING; actual child ready; page not selected yet.
- **Main flow:** open → identity GET returns known manager → select exactly that manager.
- **Alternative flow:** null identity invokes PAGE-UC-03.
- **Exception flow:** failed/malformed GET invokes unavailable/Retry, never POST as though it were null.
- **Postconditions:** no POST/creation/model turn caused by lookup; one intended manager selection.

### PAGE-UC-03 — Open an unidentified manager after ready

- **Actor:** user opens native Fishball page.
- **Preconditions:** F-FRESH and F-PAGE/F-LIFECYCLE; real readiness occurred.
- **Main flow:** opening GET → null → one authenticated POST → `manager.ensureSession()` joins singleton `chat.activate()` → return real manager ID → native selection.
- **Alternative flow:** pre-ready POST waits under READY-UC-01; existing manager follows PAGE-UC-02.
- **Exception flow:** failed POST → unavailable and explicit Retry; no identity guessing, timer-success, model turn or auto-POST retry.
- **Postconditions:** one manager created/resumed, no page-caused model turn; correct manager selected.

### PAGE-UC-04 — Explicit Retry after POST failure

- **Actor:** user explicitly presses Retry.
- **Preconditions:** page-open GET null then failed POST; manager absent; repair available.
- **Main flow:** show unavailable/Retry → focus/list events only re-GET → user Retry → fresh GET null → one authenticated POST → select successful ID.
- **Alternative flow:** Retry GET now returns ID → no POST (PAGE-UC-05 existing-ID branch).
- **Exception flow:** GET/POST fails again → unavailable/Retry remains, no automatic retry or model turn.
- **Postconditions:** only explicit Retry reauthorizes null-identity creation; passive events cannot.

### PAGE-UC-05 — Retry GET failure after identity appears

- **Actor:** user explicitly presses Retry.
- **Preconditions:** initial GET failed; another already authorized path now owns the known manager.
- **Main flow:** Retry → fresh GET → existing manager ID → select ID without POST.
- **Alternative flow:** retry GET null → PAGE-DT-02 single ensure path.
- **Exception flow:** GET malformed/fails → unavailable/Retry, no speculative ensure.
- **Postconditions:** existing manager reused, no page-created activation or turn.

### PAGE-UC-06 — Passive identity refresh is read-only

- **Actor:** focus/list-notification source; user has not pressed Retry or opened a fresh page.
- **Preconditions:** no manager, including after failed GET or POST; child lifecycle otherwise live.
- **Main flow:** separately dispatch focus and sessions-list notification → GET null each.
- **Alternative flow:** GET finds existing ID → GET-only identity observation, no POST; does not invent extra passive-navigation UX.
- **Exception flow:** failed GET → unavailable/Retry, no creation permission or automatic POST.
- **Postconditions:** no passive ensure/activation/model turn; null is not selected as a session.

### PAGE-UC-07 — Concurrent page opens share manager

- **Actor:** two user-owned native Fishball views.
- **Preconditions:** F-FRESH, actual ready; activation completion can be held independently.
- **Main flow:** open both before activation completes → each performs permitted lookup/ensure → release completion → both select same identity.
- **Alternative flow:** notice and page race in either order → PAGE-ST-02; before-ready waiters → READY-UC-03.
- **Exception flow:** activation fails → truthful unavailable/Retry for waiting views, no duplicate manager fallback.
- **Postconditions:** one activation/session, both waiters settle consistently, zero page-caused model turns.

### 3.1 PAGE partitions and boundaries

| Domain | EP representatives | Boundary coverage |
|---|---|---|
| Initial GET result | Known nonblank string; null; 503; successful malformed/missing/blank/whitespace/numeric ID; invalid JSON | Null/real identity is an EP distinction, not an invented string-length BVA. No maximum/one-character grammar asserted. |
| POST result | Nonblank ID; 503/failure; malformed success/null/blank/whitespace/numeric/missing ID; invalid JSON | Same no-invented-length rule. |
| Trigger | Fresh page-open; explicit Retry; focus; sessions-list; install/attach | Only first two permit GET-null→POST. Trigger ordering is State Transition, not elapsed-time BVA. |
| HTTP method/admission | GET, POST; unsupported PUT/HEAD; missing native admission | Method 405/Allow covered; refusal status delegated to native admission, not guessed. |
| Cardinality | Zero managers before GET-null; one existing manager; first request; first concurrent pair | PAGE-UC-01/07 cover zero→one manager and one→two requests; PAGE-ST-04 observes singleton internally. **Two is the first concurrency boundary, not a maximum or stress threshold.** |

### 3.2 PAGE Decision Table

`—` means the condition does not affect this rule. Method handling precedes interpreting manager identity; malformed is never null. Child-ready gating is delegated to the READY table.

| Rule | Trigger/method | GET result | Ensure result/other condition | Required action | Cases |
|---|---|---|---|---|---|
| P1 | page-open or explicit Retry | existing ID | — | GET only, select returned manager, no page turn | UC-02, UC-05 |
| P2 | page-open | null | success | authenticated POST, singleton ensure, select ID; no turn | UC-03 |
| P3 | page-open or explicit Retry | failed/503 | — | unavailable + Retry; no speculative POST | EP-02, EP-06 |
| P4 | page-open or explicit Retry | null | failed/503 | unavailable + Retry; no auto-repeat/selection | EP-03, EP-07, UC-04 |
| P5 | focus or sessions-list | null, existing ID or failure | previous page success/failure — | GET-only; never creation/POST | UC-06, DT-01, DT-03, ST-01 |
| P6 | explicit Retry after failure | existing ID | — | fresh GET, no POST, intended selection | UC-05 |
| P7 | explicit Retry after failure | null | success | fresh GET then one authenticated POST | UC-04, DT-02 |
| P8 | page ensure overlaps authorized notice | — | same activation in flight, either order | join one manager; no **extra page-caused** turn | ST-02 |
| P9 | PUT or HEAD to route | — | authenticated | 405; `Allow` exactly GET, POST; PUT error token; no HEAD body oracle | EP-04, EP-05 |

Infeasible/irrelevant combinations removed: failed GET plus POST result (POST must not occur); passive trigger plus ensure result (creation forbidden); unsupported method plus identity result. Missing authentication is its own EP-10, avoiding an invented admission precedence matrix. Malformed success is isolated in EP-08/09, not silently collapsed into P2.

### 3.3 PAGE State Transition model

These are **test-design states**, not claimed product enum values: `IdentityUnknown`, `Ensuring`, `Selected`, `Unavailable`; lifecycle invalidation is governed by READY.

| Transition | Current state / event / guard | Next state and observable action | Cases |
|---|---|---|---|
| P-H1 | fresh HTTP fixture / GET null→POST ID→repeat/concurrent POST | stable externally observed identity; does not expose native-page state | UC-01 |
| P-T1 | IdentityUnknown / allowed page-open GET null | Ensuring; authenticated ensure begins only with READY permission | UC-03, ST-04 |
| P-T2 | Ensuring / current successful activation | Selected; one manager, no page turn | UC-03, ST-04 |
| P-T3 | IdentityUnknown or Ensuring / GET or POST failure | Unavailable + explicit Retry; no guess/auto-retry | UC-04/05, EP-06/07 |
| P-T4 | Unavailable / focus or sessions-list | GET-only re-read; no creation transition even if null | UC-06, DT-01/03 |
| P-T5 | Unavailable / explicit Retry GET existing ID | Selected; no POST | UC-05 |
| P-T6 | Unavailable / explicit Retry GET null then successful ensure | Ensuring → Selected; one new authorized ensure path | UC-04, DT-02 |
| P-T7 | Ensuring / concurrent page/notice ensure joins | same in-flight activation; settle one manager | UC-07, ST-02 |
| P-T8 | Selected / new page, focus or list | reuse identity; passive refresh never POST | ST-01 |
| P-T9 | persisted manager / authorized same-home restart→ready→page-open | reuse/resume singleton identity, not second manager | ST-03 |
| Invalid | failed/malformed GET treated as null | refuse selection/creation; Unavailable + Retry | EP-06, EP-08 |
| Invalid | malformed POST treated as successful ID | remain Unavailable + Retry; never select invalid ID | EP-09 |
| Invalid | identity read or passive event treated as ensure | no ensure/activation; no creation state transition | UC-06, DT-01/03, ST-04 |

Critical two-transition sequences: null→ensure→selected; failed ensure→passive GET-only→explicit Retry ensure; GET failure→Retry existing-ID select; restart→ready→resume; overlap→one activation→both selected.

### 3.4 PAGE case catalogue (24 logical cases)

**SDK applicability for every row: `0.2.1-rc.5` and `0.2.2-rc.1`.** `HTTP` means executable assertions exist if its explicit fixture is supplied; `TODO` means the missing observation prerequisite is named in the module. Neither label is a result. Detailed concrete inputs/steps/expected observations are exported in [PAGE data and executable cases](<../../test/v2-page-cases/page.test.mjs>).

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| PAGE-UC-01 | Fresh HTTP identity/ensure | HTTP F-FRESH; GET twice, POST, GET, repeat POST, two concurrent POSTs | Use Case, EP, BVA, State Transition | S1,S2,S5,S6 | null twice, one stable nonblank ID thereafter; GET no-store; internal claims explicitly unproven | Not Run |
| PAGE-UC-02 | Native existing manager open | TODO F-EXISTING + F-PAGE; initial open | Use Case, EP, Decision Table P1 | S1,S2 | GET/selection only; no POST/activation/turn | Not Run |
| PAGE-UC-03 | Native null identity open | TODO F-FRESH + real journals; GET null→POST | Use Case, EP, Decision Table P2, State Transition | S1,S2,S5 | one authenticated ensure/singleton activation, intended selection, no turn | Not Run |
| PAGE-UC-04 | Explicit Retry POST failure | TODO failed POST; focus/list then user Retry with GET null | Use Case, Decision Table P4/P7, State Transition | S1,S2 | visible failure; passive GET-only; Retry GET→one POST→select | Not Run |
| PAGE-UC-05 | Retry finds existing ID | TODO failed initial GET; existing manager now available | Use Case, Decision Table P3/P6, State Transition | S1,S2 | fresh GET finds ID; select without POST/turn | Not Run |
| PAGE-UC-06 | Passive refresh cannot create | TODO no manager; focus and list separately | Use Case, EP, Decision Table P5, State Transition | S1,S2 | GET-only, no ensure/POST/turn; null never selected | Not Run |
| PAGE-UC-07 | Concurrent page opens | TODO two views; hold activation then release | Use Case, BVA, State Transition | S2,S5 | same ID, one activation/session, no turn | Not Run |
| PAGE-EP-01 | Existing HTTP identity | HTTP F-EXISTING; known ID; GET twice | EP | S1,S6 | exact seeded ID; 200/no-store | Not Run |
| PAGE-EP-02 | Unavailable GET HTTP | HTTP F-UNAVAILABLE; GET | EP, Decision Table P3 | S6 | 503 MANAGER_UNAVAILABLE; nesting not invented | Not Run |
| PAGE-EP-03 | Unavailable POST HTTP | HTTP F-UNAVAILABLE; POST | EP, Decision Table P4 | S5,S6 | 503 MANAGER_UNAVAILABLE; no success ID | Not Run |
| PAGE-EP-04 | Unsupported PUT HTTP | HTTP authenticated F-EXISTING; PUT | EP, Decision Table P9 | S5,S6 | 405 METHOD_NOT_ALLOWED; Allow GET, POST | Not Run |
| PAGE-EP-05 | Unsupported HEAD HTTP | HTTP authenticated F-EXISTING; HEAD | EP, Decision Table P9 | S5,S6 | 405; Allow GET, POST; no body assertion | Not Run |
| PAGE-EP-06 | GET failure forbids speculative POST | TODO GET503 on initial open | EP, Decision Table P3 | S1,S6 | unavailable/Retry; no POST/selection/auto-retry | Not Run |
| PAGE-EP-07 | POST failure forbids false selection | TODO GET null→POST503 | EP, Decision Table P4 | S1,S6 | unavailable/Retry; no guessed ID/auto-repeat | Not Run |
| PAGE-EP-08 | Malformed GET success | TODO each: missing/blank/whitespace/numeric ID or invalid JSON | EP | S6 | not null branch; unavailable/Retry; no speculative POST/selection | Not Run |
| PAGE-EP-09 | Malformed POST success | TODO each: null/missing/blank/whitespace/numeric ID or invalid JSON | EP | S5,S6 | no success/selection; unavailable/Retry, no auto-repeat | Not Run |
| PAGE-EP-10 | Unauthenticated ensure | TODO fresh child, no valid native admission; POST | EP | S1,S4 | refused with zero activation/creation/turn; PG-ORIGIN owns exact status | Not Run |
| PAGE-DT-01 | Passive failed-page null re-read | TODO failed GET and failed POST separately; focus/list → null | Decision Table P5, State Transition | S1,S2 | GET-only; no hidden creation | Not Run |
| PAGE-DT-02 | Retry failed GET into null branch | TODO initial GET failed, Retry GET null→POST success | Decision Table P7, State Transition | S1,S2 | GET before one authenticated ensure and selection | Not Run |
| PAGE-DT-03 | Passive recovery existing ID | TODO both failure origins; focus/list finds known ID | Decision Table P5, State Transition | S1,S2 | only GET; no POST/activation; extra navigation UX unspecified | Not Run |
| PAGE-ST-01 | Reopen and refresh selected manager | TODO successful manager; new page then focus/list | State Transition | S1,S2 | stable manager; passive GET-only; no extra turn | Not Run |
| PAGE-ST-02 | Notice/page activation overlap | TODO page-first and notice-first; held activation | State Transition, Decision Table P8 | S2,S3,S5 | one singleton; authorized notice turn distinguished from no extra page turn | Not Run |
| PAGE-ST-03 | Same-home restart resume | TODO persisted manager; authorized restart→actual readiness→open | State Transition | S2,S3,S5 | reuse/resume identity; not second manager; no page turn | Not Run |
| PAGE-ST-04 | Read never ensures; ensure never turns | TODO read absent→ensure→read live→ensure; independent journals | State Transition, EP | S1,S2,S5 | reads side-effect-free; singleton ensure; zero page model requests/turns | Not Run |

## 4. READY Use Cases — first

Primary actors are the **page-open caller** and the **child lifecycle**, not the main host ready service. Generation names `alpha`/`beta` are concrete test labels for successive ownership generations, not product config values.

### READY-UC-01 — Wait before ready without deadlocking boot

- **Actor:** page-open caller; child boot/appReady is supporting actor.
- **Preconditions:** fresh alpha, actual child signal withheld, one pending page ensure, no unrelated work.
- **Main flow:** submit before-ready ensure → observe pending/no activation → independently finish plugin apply and boot settlement → still pending → fire actual child `appReady.onReady` → one activation → ID.
- **Alternative flow:** signal already fired → READY-UC-02; second waiter → READY-UC-03.
- **Exception flow:** disposal/failure releases/refuses; signal never fires remains pending, not timer-success.
- **Postconditions:** boot can reach readiness; request proceeds only after actual signal; no page turn.

### READY-UC-02 — Request after ready proceeds without delay

- **Actor:** page-open caller.
- **Preconditions:** actual alpha ready callback already completed; no manager or unrelated wake.
- **Main flow:** submit ensure → activation is dispatchable without second signal/clock advancement → return ID.
- **Alternative flow:** in-flight current activation is joined; existing manager reused.
- **Exception flow:** owner invalidated before dispatch → refuse/cancel rather than use stale readiness.
- **Postconditions:** one current singleton, no extra readiness wait or model turn.

### READY-UC-03 — Concurrent before-ready callers join

- **Actor:** two independent page-open callers.
- **Preconditions:** alpha not ready; activation completion controllable through independent barrier.
- **Main flow:** submit two ensures → both pending → one actual signal → one activation → both same ID.
- **Alternative flow:** second caller just after signal but before activation completion still joins (BVA-04).
- **Exception flow:** invalidation/failure releases all pending waiters; no orphan promise or stale success.
- **Postconditions:** one activation/session, consistent waiter settlement, no page turn.

### READY-UC-04 — Dispose before readiness

- **Actor:** child lifecycle disposer.
- **Preconditions:** alpha not ready; page request pending.
- **Main flow:** dispose owner → pending request cancelled/refused/unavailable → deliver captured alpha callback.
- **Alternative flow:** disposal after signal/before dispatch or in activation is DT-02/ST-03.
- **Exception flow:** late readiness/completion is stale; cannot republish manager or turn success.
- **Postconditions:** no pending ownerless work/stale activation; no model turn.

### READY-UC-05 — Restart has its own readiness gate

- **Actor:** authorized lifecycle restart requester, then new page caller.
- **Preconditions:** alpha request pending; restart replaces alpha with beta.
- **Main flow:** old work released/refused → new beta request waits → old alpha signal inert → actual beta signal → one beta activation/ID.
- **Alternative flow:** alpha previously ready still cannot confer readiness on beta (DT-03).
- **Exception flow:** alpha late completion cannot fulfill/cancel/overwrite beta; beta failure truthfully refuses.
- **Postconditions:** generation-fenced readiness/publication and no stale turn.

### READY-UC-06 — Failure before readiness releases pending work

- **Actor:** child lifecycle failure source.
- **Preconditions:** alpha signal withheld; page ensure pending.
- **Main flow:** report actual failure → release/cancel/refuse pending request → later alpha callback inert.
- **Alternative flow:** in-flight activation failure → ST-04; explicit repair/Retry→new readiness → ST-05.
- **Exception flow:** no reported failure/signal/dispose means honestly pending (EP-01), not an invented deadline.
- **Postconditions:** no false-ready identity, timer-success or stale activation.

### 4.1 READY partitions and BVA

| Domain | EP classes | Boundaries and cases |
|---|---|---|
| Signal/owner | Current before-ready; current ready; signal never fired; retired/disposed/failed/replaced | Event-order boundary before callback / after callback / before activation settlement; UC-01/02, BVA-02/04, DT-02. Not wall-clock BVA. |
| Waiter count | Zero; first waiter; first concurrent pair | **2-value cardinal boundaries 0↔1 and 1↔2**: BVA-01/02/03; cross-signal second caller BVA-04. No request cap or arbitrary “many” value. |
| Lifecycle progress | apply/boot settlement; actual child appReady; main ready; iframe load; transport listening | Only actual child signal releases current page-open readiness gate; EP-04. |
| Invalidation point | Before signal; signal delivered before dispatch; activation in flight; stale completion after beta ready | UC-04/05/06, DT-01/02/03, ST-01/03/04/06. Cancellation/refusal/unavailable is the documented outcome family; no invented error enum. |
| Activation cause | Page-open ensure; install completion; attach; existing separately authorized notice | Gate page-open only; zero eager install/attach activation, no global notice policy invented. |

### 4.2 READY Decision Table

| Rule | Current owner valid? | Page ensure exists? | Actual child signal? | Other progress/event | Required action | Cases |
|---|---|---|---|---|---|---|
| R1 | yes | yes | not yet, later fires | — | pending/no activation until signal; then singleton join | UC-01/03, BVA-02/03/04 |
| R2 | yes | yes | already fired | — | proceed without new signal/timer; join active singleton | UC-02 |
| R3 | no: dispose/fail/restart | pending or captured old continuation | any | stale ready/completion | release/refuse work; no old activation/publication or effect on new generation | UC-04/05/06, DT-01/02/03, ST-01/03/04/05/06 |
| R4 | yes | yes | never fires | apply settled, main ready, iframe load, transport/list/focus | remain pending; no substitute/timer-success | EP-01/04/05 |
| R5 | yes | no | before or after | install/attach/ready | no manager activation/turn merely from lifecycle success | EP-02/03, BVA-01 |

Infeasible/redundant combinations: retired owner cannot become current by stale signal; a current ready request does not also require a not-yet-fired signal; no-request activation with unrelated authorized manager work is outside R5's no-unrelated-work precondition. A failed owner plus no waiter still has no authority to publish a stale manager; stale-continuation tests cover that condition.

### 4.3 READY State Transition model

Design states: `Booting`, `Waiting`, `Ready`, `Activating`, `Available`, `Retired`. These labels are not claimed implementation fields.

| Transition | Current state / event / guard | Next state and observation | Cases |
|---|---|---|---|
| R-T0 | Booting or Ready / install/attach/ready with no request | Ready if actual ready; **no activation** merely from lifecycle | EP-02/03, BVA-01 |
| R-T1 | Booting / permitted page ensure | Waiting; apply/boot can still settle; request pending | UC-01/03, BVA-02/03 |
| R-T2 | Waiting / current actual ready callback | Activating→Available; joined current singleton | UC-01/03, BVA-02/03/04 |
| R-T3 | Ready or Activating / new page ensure | Activating/Available; immediate dispatch/join without another ready event | UC-02, BVA-04 |
| R-T4 | Waiting or Activating / dispose | Retired; pending work released/refused | UC-04, DT-02, ST-03 |
| R-T5 | Waiting, Ready or Activating / restart | alpha Retired; beta Booting with independent gate; no sticky old-ready latch | UC-05, DT-03, ST-01/06 |
| R-T6 | Waiting or Activating / actual lifecycle failure | Retired/unavailable; pending work released/refused | UC-06, DT-01, ST-04/05 |
| R-X1 invalid | Retired / stale ready, dispatch, completion or cleanup | inert; cannot activate, publish into beta or cancel beta | UC-04/05/06, DT-01/02, ST-01/03/04/06 |
| R-X2 invalid | Waiting / elapsed time, main ready, iframe load or unrelated event | remain pending without actual child signal; no ready success | EP-01/04/05 |
| R-X3 invalid | Activating or Available / already-observed ready reconciliation | no duplicate activation, waiter resolution or page turn | ST-02 |

Critical two-transition sequences: ensure-before-ready→boot settles→actual ready; pending→dispose→stale callback; alpha ready→restart→beta waits; ready→activation→failure→late completion; beta success→alpha late completion/cleanup. Captured callback replay is a driver technique for stale continuations, not a claim that SDK emits repeated readiness events.

### 4.4 READY case catalogue (24 logical cases)

**Every row: DSH `0.2.1-rc.5` and `0.2.2-rc.1`; all need F-LIFECYCLE and are explicit task-owned TODOs.** The [READY module](<../../test/v2-page-cases/ready.test.mjs>) exports full preconditions/steps/expectations and names the absent lifecycle control/observation prerequisite.

| TC No. | TC Name | Details | Techniques Used | AC Covered | Expected Behaviour | Status |
|---|---|---|---|---|---|---|
| READY-UC-01 | Before-ready wait without boot deadlock | Alpha signal held; submit ensure; settle apply/boot; then signal | Use Case, EP, Decision Table R1, State Transition | S2,S3 | pending/no activation before real signal; boot settles; one activation after; no page turn | Not Run |
| READY-UC-02 | After-ready request | Alpha actual signal already fired; submit ensure, no clock advancement | Use Case, EP, Decision Table R2, State Transition | S2,S3 | no second signal/delay needed; singleton no-turn success | Not Run |
| READY-UC-03 | Concurrent waiters | Two ensures before signal; one signal; hold then release activation | Use Case, BVA, Decision Table R1, State Transition | S2 | both pending then same ID; one activation/session; no orphan/turn | Not Run |
| READY-UC-04 | Dispose pending wait | Waiting alpha disposed; later old callback | Use Case, State Transition | S2 | work released/refused; old callback inert/no activation | Not Run |
| READY-UC-05 | Restart creates new gate | Alpha pending→restart beta; old signal then beta signal | Use Case, Decision Table R3, State Transition | S2,S3 | alpha refused, beta independently waits then current activation | Not Run |
| READY-UC-06 | Failure releases pending wait | Waiting alpha fails; deliver old signal | Use Case, EP, State Transition | S2 | cancellation/refusal/unavailable; no ready success/stale activation | Not Run |
| READY-EP-01 | Missing signal remains pending | No signal/failure/dispose; event-driven checkpoints only | EP, Decision Table R4, State Transition | S2,S3 | live pending remains pending; no timer-success/identity | Not Run |
| READY-EP-02 | No eager install activation | No page/wake; complete install/apply/boot and real ready | EP, State Transition | S2,S3 | no manager/session/model turn merely from install/readiness | Not Run |
| READY-EP-03 | No eager attach activation | Attach before and after ready separately; no request/wake | EP, State Transition | S2,S3 | no manager/session/turn merely from attach | Not Run |
| READY-EP-04 | Other signals are not child readiness | Main-ready, iframe-load, server/transport availability independently | EP, Decision Table R4 | S2,S4 | page ensure still gated; none substitutes for child appReady | Not Run |
| READY-EP-05 | No readiness timer substitution | Observe feature-owned wait scheduling across wait/failure/Retry | EP, State Transition | S2,S3,S4 | actual appReady gate, no sleep/poll/heartbeat timer-success | Not Run |
| READY-BVA-01 | Zero waiters | Real ready with no requests/wakes | BVA, Decision Table R5 | S2,S3 | zero activation; later request can reuse remembered readiness | Not Run |
| READY-BVA-02 | First waiter before ready | Register one pending waiter, then signal | BVA, State Transition | S2 | no missed event; one current activation and settlement | Not Run |
| READY-BVA-03 | Second concurrent waiter | First pending; add second; signal and complete | BVA, State Transition | S2 | same activation/ID, not duplicate manager | Not Run |
| READY-BVA-04 | Callers across ready boundary | First before signal, second after signal/before activation resolves | BVA, State Transition | S2 | both join, no second ready wait or activation | Not Run |
| READY-DT-01 | Failure before ready dispatch | Failure invalidates alpha; old signal delivered later | Decision Table R3, State Transition | S2 | no stale dispatch/manager; request released/refused | Not Run |
| READY-DT-02 | Dispose after signal/before dispatch | Pause dispatch barrier; dispose; release continuation | Decision Table R3, State Transition | S2 | zero activation by disposed generation, no stale success | Not Run |
| READY-DT-03 | Restart does not inherit readiness | Alpha ready; beta not ready; beta request; old then new signal | Decision Table R3/R1, State Transition | S2 | beta waits for own actual signal, then one activation | Not Run |
| READY-ST-01 | Old callback after beta success | Beta ensured; replay alpha ready/cleanup continuation | State Transition | S2 | beta ownership/ID intact; no duplicate or stale cancellation | Not Run |
| READY-ST-02 | Repeated readiness reconciliation | Reconcile captured ready before/after activation completion | State Transition | S2 | no duplicate activation/settlement/page turn | Not Run |
| READY-ST-03 | Dispose in-flight activation | Activation started/held; dispose; release late completion | State Transition | S2 | pending request released/refused; no stale current publication | Not Run |
| READY-ST-04 | Failure in-flight activation | Activation held; actual failure; late completion | State Transition | S2 | released/refused; no false success or automatic retry/turn | Not Run |
| READY-ST-05 | Explicit repair/Retry gate | Failed alpha; explicit Retry beta; old signal then beta readiness | State Transition | S1,S2 | Retry not fake-ready; beta signal required; old callbacks inert | Not Run |
| READY-ST-06 | Old activation after restart | Alpha activation held; beta ready/ensure succeeds; alpha completes | State Transition | S2 | alpha cannot fulfill/overwrite beta or publish stale success | Not Run |

## 5. Counts, coverage and remaining gaps

| Task | Use Cases | Supporting cases | Logical total | Opt-in HTTP assertions | Lifecycle/client TODO | SDK-expanded slots |
|---|---:|---:|---:|---:|---:|---:|
| PAGE | 7 | 17 (10 EP, 3 DT, 4 ST) | 24 | 6 | 18 | 48 |
| READY | 6 | 18 (5 EP, 4 BVA, 3 DT, 6 ST) | 24 | 0 | 24 | 48 |
| **Total** | **13** | **35** | **48** | **6 logical / 12 SDK slots** | **42 logical / 84 SDK slots** | **96** |

Technique labels can overlap within one logical case; do not add technique counts as if they were independent executions. PAGE BVA is covered by cardinality in UCs; there is no invented ID-length/numeric-timer family. Each DT rule and listed valid/invalid transition maps to at least one case; exact signal/disposal races use controlled event order, not probabilistic sleeps.

**Explicit gaps and ownership:**

1. **PAGE:** no documented independently controllable native-page/manager/session/model journal adapter. Consequently 18 PAGE lifecycle/client cases remain TODO; the six HTTP cases do not discharge their stronger assertions. F-PAGE/F-LIFECYCLE prerequisites and exact expected behavior appear in each exported record.
2. **READY:** no documented lifecycle adapter controlling actual child appReady, apply/boot completion, invalidation and activation completion; all 24 remain TODO. Authoring a fake gate, importing private implementation or checking source/metadata would manufacture acceptance and is intentionally not done.
3. **PAGE + PG-ORIGIN:** unauthenticated POST zero-side-effect proof needs native disposable admission plus activation observer; exact refusal status/error envelope is not invented. Origin remount, cookie/CSP/redirect security and host/child generation authority remain PG-ORIGIN tasks, not newly claimed coverage here.
4. **BROWSER (last):** actual deployed dual-SDK native UI page-open/readiness/singleton/no-turn observations are still required, separately authorized, after integration. HTTP/fixture labels cannot be represented as browser proof.
5. **SCOPE/parent ledger:** old eager activation, GET-only Retry, corrective navigation/archive, one-character-ID or arbitrary ten-request “boundary” assertions are not silently carried into current acceptance; exact old title dispositions live in the parent catalogue.

No product/browser/model/network/install/credentials/test execution was performed. No local commit was created. Only design and executable test definitions are delivered; any later syntax checks are reported separately and never called behavioral passes.
