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
- **Moving files and tests.** When a task moves or renames files, its **test-code session**
  updates the paths in existing tests in the same branch (paths only, assertions unchanged), so the
  move and the path fixes merge together. The dev session never reads or edits tests.
- e2e cases are browser-only and run **after merge**, in wave W6.

## Wave overview

| Wave | Purpose | Tasks |
| --- | --- | --- |
| W0 | Spikes (gates) | S1, S2, S3, S4, S5, S6, S7, S7b |
| W1 | Interface freeze (V3-K) and repackaging, in steps: (R-CONN ∥ R-SHARED, which creates `fishball-shared`) → R-CORE → R-EMBED | K1, K2, K3, R-CONN, R-SHARED, R-CORE, R-EMBED |
| W2 | Independent modules, connector and Fishball side | C-HTTP, C-OAUTH, C-OAUTH-WEB, C-TOKENS, C-PAIR, C-MAILBOX, C-EXT, F-LINK, F-INTERCEPT, F-GUARDS |
| W3 | Domain behaviour built on W2 | C-ROUTE, C-TOOLS, F-PAIR, F-FACADE, WD-ROUTE, I-PLACE, U-SHELL, FEAT-PEERS |
| W4 | Cross-cutting connector effects, Watchdog judgement and patrol, embed-UI features, instance host | C-REVOKE, C-SUCCEED, WD-DECIDE, WD-PATROL, F-STATUS, F-ASKCARD, U-MARKS, U-ATTN, U-RECORDS, I-HOST |
| W4b | Connector wiring (after C-REVOKE and C-SUCCEED) | C-WIRE |
| W5 | Reinstall succession end to end, migration, acceptance suites | I-SUCCEED, X-MIG, X-SEC, X-MATRIX, X-REMOTE, DOCS |
| W5b | Compatibility matrix (after X-MATRIX and X-REMOTE) | X-COMPAT |
| W6 | Browser e2e after merge | E2E-UI, E2E-CORE |

## W0 — Spikes

Each spike lives only under `spikes/v3-sN/` and ends with a short report
(`docs/spikes/v3-sN.md`) answering the design §11 gate. No product code.

| Id | Scope | Owns | Depends | Cases it unblocks | Definition of done |
| --- | --- | --- | --- | --- | --- |
| S1 | Packaged MCP server SDK, modern-only, on a raw `webServer` route; bearer check before dispatch; Origin/header checks; resource metadata; listen streams; both hosts | `spikes/v3-s1/`, `docs/spikes/v3-s1.md` | — | AUTH-UC-08, EVT-UC-01, REM-UC-03, PLAT-UC-01 — **done** `9499ec6` (PARTIAL 31/32); settles PLAT-UC-01, EVT-UC-01; REM-UC-03 settled with the Host amendment | the §11 gate demonstrated on both SDKs; a 401 path never reaches the SDK |
| S2 | Durable child acceptance ledger + `Agent.followup`: one wake after lost ack, crash and reconnect | `spikes/v3-s2/`, `docs/spikes/v3-s2.md` | — | EVT-UC-02, EVT-DT-03, EVT-ST-02 | MCP-S2 §11.5 TODO closed or a design change requested |
| S3 | Interception priority/ties/filters/fallback; `pair` races; OQ-14 answer races (user, Watchdog, Fishball); a refine starts no run | `spikes/v3-s3/`, `docs/spikes/v3-s3.md` | — | AUTH-UC-02, NAME-BVA-03, EVT-UC-02, WD-UC-01, WD-UC-04, WD-ST-01, HOST-UC-03, HOST-ST-02, PLAT-UC-02, PLAT-ST-01 — **done** `b4dca86` (PASS); Q-S3-1 decided (implementation: one record per request, revisioned offer ids), Q-S3-2 decided B with S2-Q1; Q-S3-3 decided (0.2.2-rc.1 baseline) | race matrix with no stale commit; one event wakes one agent |
| S4 | Embed-UI as a separate package registering sidebar/slot contributions and framing the PG-ORIGIN child | `spikes/v3-s4/`, `docs/spikes/v3-s4.md` | — | HAND-UC-01, HAND-UC-03, UIM-* — **done** `b9809b7` (PASS); child cookie login, `SameSite=Strict` host mismatch → 401; S4-Q1 decided A (frame follows the main page's loopback hostname), S4-Q2 decided (sidebar entry, no answer controls, inline records), S4-Q3 decided B (`fishball-embed-ui`) | works on both hosts; main shortcuts untouched |
| S5 | Contribution service: caller fiber identity, auto-withdrawal, quarantine lift by new fiber, `tools/list_changed`, containment | `spikes/v3-s5/`, `docs/spikes/v3-s5.md` | — | EXT-* (P:S5) | **done** `8f2788e` (PASS): `register(def)` kept; Q1–Q6 decided (Q5 = A: namespace is attribution only) |
| S6 | `fishball-core` as a plain bundle with guard rows disabling other bundles' rows; override detection through a public API; both modes | `spikes/v3-s6/`, `docs/spikes/v3-s6.md` | — | HOST-UC-01, REM-UC-01, UIM-DT-01, PLAT-UC-04, PLAT-UC-05 | names the public API for `guards-overridden` |
| S7 | Client-credentials AS on the DSH listener with the stock `ClientCredentialsProvider` and one non-DSH client; revocation; direct access | `spikes/v3-s7/`, `docs/spikes/v3-s7.md` | — | AUTH-UC-02, AUTH-UC-08, REM-UC-01 — **done** `8e92b84`; TQ-3 confirmed; Q-S7-1 led to the browser flow (S7b), Q-S7-2/3 settled by the MCP-spec rule | also answers TQ-3 (is `resource` sent?) |
| S7b | Browser authorization on the connector's own approval listener with the stock DSH client (both SDKs) and the Python MCP SDK: CIMD `client_id`, PKCE S256, loopback redirect, `iss`, issuer and page on different origins; refresh-token needs; plain-http loopback AS acceptance (Q-SPEC-1 decided A); the token-only page (POST entry, uniform refusal, `already-paired`); second-listener bind and clash (metadata keeps `authorization_endpoint`) | `spikes/v3-s7b/`, `docs/spikes/v3-s7b.md` | — | AUTH-UC-10, AUTH-DT-07 | design §11 V3-S7b gate; confirms the Q-SPEC-1 departure and the Q-OA-7 clash behaviour |

## W1 — Interface freeze (V3-K) and repackaging

K1–K3 wait for their spikes. The repackaging tasks run in **steps** inside W1, because the
R-CORE session (884eb6c5) found that the code to move is entangled across packages:
- **Step 1, parallel:** R-CONN (done, `368e848`) and R-SHARED (creates `fishball-shared`; TQ-R1, TQ-R2,
  TQ-R3 are decided, so it may start).
- **Step 2:** R-CORE, after R-SHARED.
- **Step 3:** R-EMBED, after R-CORE, R-CONN and spike S4.

Rules for the repackaging steps:
- **One owner per module, imports elsewhere; never two live copies**, not even for one wave.
- **Side rule (TQ-R1 decided A, revised by TQ-R3 decided B).** The instance is a DSH-side plugin;
  `fishball-core` is a Fishball-side plugin. A module used by **both** goes to the shared library
  `fishball-shared` (`packages/shared`, R-ARCH-08: "建立公共包"); Fishball-only logic goes to core;
  DSH-only logic stays in the instance. Core and the instance never import each other, and the host
  DSH never loads any module of the set (R-BND-01 strict). `fishball-shared` imports nothing from
  any other V3 package; any V3 package may depend on it (TQ-R5 decided B), but it holds only
  modules more than one package actually uses.
- **The V2 contract keeps one owner, the connector,** until nothing imports it. `fishball-core`
  imports `fishball-connector/contract` as a package dependency in the meantime. It gets **no**
  copy of its own. The vendored copy of design §9.1 is of the V3 `./mcp-schema`, generated from
  the connector's source when the package is packed, and arrives with F-LINK.
- **Behaviour-preserving:** at the end of every step the V2 hosted path still works as before.
  Nothing is removed before its replacement exists: the connector UI and the V2 control path stay
  until their V3 owners are merged.
- The `LITE` guard rows stay in `overlay.js` unchanged during W1. They are conditional JS (applied
  only when the row exists, with merged permission config and preset plugins disabled inside the
  agent-preset row), and whether a bundle patch can express them is spike S6's question. They move
  in F-GUARDS (W2, after S6), which adds them to core's patch and removes them from `overlay.js`
  in the same change, so the guards are defined exactly once at every merge.

V3-K is split into three freeze tasks so each fits one session. Each is reviewed by the design
session; the case files are re-checked for every `K` flag the freeze resolves. Repackaging tasks
move code without changing behaviour.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| K1 | Freeze `fishball-connector/mcp-schema`: tool names and input/output schemas, result envelope, refusal-code vocabulary, event `type` vocabulary and payload shapes (R-EVS-02), OAuth metadata and error mapping, page limit, retention, "connected" definition, every numeric limit in the cases (`K` flags), and the internal module interfaces used by W2 (bearer verifier, token registry, pair store, mailbox commit/poll/ack, router `recipientFor`). **Pinned SDK versions** (from R-CONN `368e848`): `@modelcontextprotocol/node` exactly **2.1.0**, because 2.1.1 and later need `@modelcontextprotocol/server` 2.3.0 or newer; the server SDK stays on the 2.2.x line of the hosts' client. A change of either pin is a K1 amendment | `packages/connector/mcp-schema/` | S1, S2, S3, S7, S7b (OAuth metadata part only) | resolves `K` flags in AUTH, NAME, EVT, PLAT, WATCH | design-session review recorded; every `K` value used by a case is in the module or explicitly left to a task |
| K2 | Freeze `fishball-connector/tools`: contribution types, `apiVersion`, `register(def)` / `emit` / `mine` signatures (S5: no `ctx` argument), the `contributor-unidentified` code, the `_meta["io.github.dsh-fishball/contributor"] = {plugin, version}` field (annotations: spec hints only), name grammar, limits and ceilings, quarantine N of M, `defineTool` validator contract | `packages/connector/tools/` | S5 | resolves `K` flags in EXT | as K1 |
| K3 | Freeze host-only service contracts: `fishballConnectorHandover`, `fishballConnectorTokens`, `fishballChild`, `fishballInstance.events.intercept` with `ctl.accept()`, `ctl.commit(send)` and `ctl.release` (S2-Q1 / Q-S3-2 decided B), and core's **settings-section extension point** (R-HOST-11; R-CORE creates a minimal version, K3 freezes it as created; a change K3 asks for becomes one serialised follow-up task after W1) (types only) | `packages/connector/host-services/` (types), `packages/core/contracts/` (types) | S3, S4, S6, R-CORE | resolves `K` flags in HAND, HOST, UIM, EVT-UC-03 | as K1 |
| R-SHARED | **Step 1.** Create the library **`fishball-shared`** in `packages/shared` (manifest with no `dsh` field: no bundle, row, client or service; add it to the root `workspaces`; `fishball-instance` depends on it and lists it in `bundleDependencies`). **Move** into it, unchanged, only the modules both sides use: (1) the `src/slim/child/admin.js` constants (vocabulary of the child's `admin` service, read by the instance host and served by core); (2) the provider-sync **wire codec** (message format, and only helpers both ends call), split by export: the host-end engine in `src/provider-sync-service.js` stays in the instance, the child-side apply goes to core with R-CORE; (3) the `native-runtime/files.js` helpers both sides use (`skills-store.js` and the instance runtime); the rest of `files.js` stays. Update every import to `fishball-shared`. **Stay in the instance** (DSH side): `src/native-web.js`, `settings-relay.js`, `src/slim/host/*`, the instance `client.js` (used only by the hosted-only settings, TQ-R2/R-CORE). Any other module is classified by the side rule; one that fits none is a stop-and-ask | `packages/shared/**` (created); the moved modules' old paths; their import lines in `packages/instance/**`; `packages/instance/package.json` and root `workspaces` (step 1) | TQ-R1, TQ-R2, TQ-R3 (all decided) | PLAT-EP-07 (static), HOST-EP-03 rows 1–2 | `fishball-shared` imports no other V3 package; every moved module has one owner; V2 tests that still apply pass |
| R-CORE | **Step 2.** (1) Create `packages/core` (manifest with bundle and `dsh.client` entries, an empty `cordis.patch.yml` for F-GUARDS) and add it to the root `workspaces`. (2) **Move** into it, unchanged: the slim child, persona, private Skills tool, app pieces of `native-child.js`, and `child-web/**` as the `fishball-ui` component, **except** the hosted-only settings sections. (3) Add the generic **settings-section extension point** to core's slim settings panel (register a section: id, title, order, mount and unmount; nothing about hosting), and make the generic panel use it for every section. (4) **Re-home** the hosted-only sections unchanged into `packages/instance/src/child-settings/` (instance-owned, with `native-web.js`, `settings-relay.js`, `src/slim/host/*` and the status-line module they use; this folder becomes the `fishball-hosted-settings` bundle's source in I-PLACE) and register them through the extension point, loaded for now by the instance's existing V2 child-row insertion, so the hosted child behaves as before. Any model-sync **trigger** in the child panel is not carried over (R-HOST-07: host side only). (5) At the instance files that stay, change only import paths: `host.js`, `settings-routes.js`, `src/provider-sync-service.js`, `copyChildCode` in `src/native-runtime/installation.js` (copies `packages/core`, `packages/shared` and `src/child-settings/` **as files**, resolved by path, never by `import`/`require`, so R-BND-01 holds; I-PLACE later replaces it) and the child-row source in `overlay.js`. The `LITE` rows stay in `overlay.js`. Core depends on `fishball-shared` (also in its `bundleDependencies`) and on `fishball-connector` for `./contract`; it never depends on `fishball-instance`, and the instance never depends on core | `packages/core/**` except `contracts/`; `packages/instance/src/child-settings/**` (created); the import lines of the five instance files; `packages/instance/package.json` (step 2: `files` only; **no** `fishball-core` dependency, TQ-R3); root `package.json` `workspaces` | R-SHARED | HOST-UC-08 (V2-mechanism part: hosted shows generic + hosted sections; generic panel works with none), HOST-EP-03 rows 1–4 | hosted child behaves as before; no file exists in two packages; core imports nothing from the instance and the instance nothing from core (PLAT-EP-07); Standalone loading of core is **not** required here (S6, F-GUARDS) |
| R-EMBED | **Step 3.** (1) Create a **minimal** `packages/embed-ui/package.json` (name **`fishball-embed-ui`**, lowercase, S4-Q3 decided B; version, `engines.dsh`, the `dsh.client` entry, optional peers incl. `fishball-instance`) and add it to the root `workspaces`. (2) Move the connector `client.js` UI and the instance main `client.js` **Plugins card** into `packages/embed-ui/src/client/{connector,instance}/` (layout of the parked `53de4a0`, not merged as is). The **status-line module** stays in the instance (`packages/instance/src/child-settings/`, from R-CORE) as its one owner: embed-UI's card imports it through the optional `fishball-instance` peer, and the injected child section already uses it. (3) In the **same change** remove `dsh.client`, `./client` and `./records` from the connector manifest and `dsh.client` from the instance manifest. (4) In `src/native-runtime/installation.js`, stop copying the instance `client.js` into the child: the status line now arrives with the injected hosted section (R-HOST-11). The instance never reads a file inside embed-UI's package | `packages/embed-ui/**` (incl. its first `package.json`); the moved client files; the client entries of both manifests; the client-copy line of `installation.js`; the instance's export of the status-line module; root `workspaces` (step 3) | R-CORE, R-CONN, **S4** | PLAT-EP-03 rows 1, 3, 5 (static: the connector has no `dsh.client`; embed-UI is the only host-UI package; each package remains a native DSH bundle). Test session: updates the 21 tests that open the old client paths and the 3 that look for `fishball-connector/client.js` in the served page (paths only, assertions unchanged) | the main DSH boots with C + I + U and with C + I alone, with no client-loader error; the same UI renders from embed-UI on both SDKs; the hosted child starts and still shows its status line |
| R-CONN | **Step 1. Additive only.** Connector manifest: add the `./mcp-schema` and `./tools` export entries pointing at the folders K1 and K2 fill; add the MCP server SDK and its Node adapter as runtime dependencies. **Keeps** `dsh.client`, `./client`, `./records`, `./contract`, `fishballConnector.attachInstance`, envelope-v2 and the `control` wire use: the UI leaves with R-EMBED (step 3), and the V2 control path and `./contract` leave with C-WIRE (W4b) once nothing uses them | `packages/connector/package.json` (W1 steps 1–2) | — (no spike) | — (PLAT-EP-03 rows 1, 5 belong to R-EMBED, which drops `dsh.client`) | existing tests pass; nothing removed |

## W2 — Independent modules

Each task builds one module behind a K1/K2/K3 interface and tests it against fakes of the others.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-HTTP | MCP route on DSH's listener; pair-only tokens get HTTP 403 `insufficient_scope` (decided per spec, R-ID-06); **Host and Origin checks done by the connector itself**, since DSH's `/api` protection does not cover these routes (S1 (a)); allowed hosts per S1 (b); check order (405 → 403 → 401 → 413/429 → version → dispatch); listener exposure (loopback, https, insecure refusal); `server/discover` with the OAuth extension; body/in-flight limits. **Per-principal isolation** (spike V3-S7 `8e92b84`, report §4.4): one MCP handler per principal, or per-pair filtering of every notification, so a pair's event never wakes another agent (R-ID-06), and a revocation closes only that principal's listen streams (R-TOK-05). **Dependency check:** on a real install into a throwaway `DSH_HOME` (both SDKs), confirm that DSH's pnpm install neither fails nor warns because of `@hono/node-server`'s `hono` peer (R-CONN left `hono` out; the Node adapter lists it as optional); if it does, add `hono@^4` to the connector's dependencies (C-HTTP owns that one manifest line in W2) | `packages/connector/src/mcp/http/` | K1, S1 | PLAT-UC-01, PLAT-EP-01, EVT-EP-04, PLAT-BVA-02, REM-UC-03, REM-EP-02, REM-EP-03, AUTH-EP-02 (rows 1, 2, 11–14) | 401 path never reaches the SDK; both SDKs |
| C-OAUTH | Authorization server: protected-resource and AS metadata, token endpoint, access-token store by digest, audience, 3600 s lifetime, no refresh token for machine exchange (a `refresh_token` grant from a `client_credentials` client gets `invalid_grant`), uniform 401s, rate limits; standard token-response fields only (`scope: fishball` / `fishball:pair`, no `fishball_pairing`), issuer and audience per checked host; **no direct access** (requirements 1.16). (spike V3-S7 `8e92b84`, report §4.4): disable, delete or value change invalidates **every** access token derived from the entry, so a re-enable never revives an old one (R-OA-06); the token-endpoint rate limit allows the stock client's **2 token requests per failed call** without refusing (R-TOK-06) | `packages/connector/src/mcp/oauth/` | K1, S7 | AUTH-UC-08, AUTH-EP-01, AUTH-EP-02 (rows 3–10), AUTH-EP-05, AUTH-EP-07, AUTH-BVA-01, AUTH-BVA-02, AUTH-DT-01, AUTH-ST-02, AUTH-UC-07, AUTH-BVA-06, AUTH-EP-09 | stock `ClientCredentialsProvider` works on both SDKs |
| C-OAUTH-WEB | Browser authorization: the approval listener (R-OA-20) on its configurable port with the `approval-port-in-use` status on a clash (Q-OA-7 decided A), `/authorize` validation, the token page with its **token**, required **id** and optional **name** fields (R-OA-11, Q-OA-5 and Q-OA-3 decided), `id-invalid` / `id-taken` / `name-*` refusals (R-ID-13), loopback redirects with any port, CIMD fetch with SSRF limits and caching (R-OA-13), entering a token **pairs** an existing unpaired entry, with uniform refusal and `already-paired` on the page (R-OA-12; never creates an entry), the `authorization_code` grant with PKCE and `iss` (R-OA-14), **rotating refresh tokens** with reuse detection and revocation with the entry (R-OA-16; Q-OA-2 decided A), cancel and expiry (R-OA-15), failure limit shared with the token endpoint (R-OA-17); works behind the user's tunnel (R-REM-05, no tunnel feature); metadata additions agreed through K1 | `packages/connector/src/mcp/oauth-web/` | K1, S7b, the Q-OA answers | AUTH-UC-10, AUTH-DT-07, AUTH-DT-08, AUTH-ST-04, AUTH-ST-05, AUTH-BVA-07, AUTH-EP-08, AUTH-EP-10, AUTH-DT-09 | both SDKs and the Python client authorize and cancel end to end; no token value in any URL, page or log |
| C-TOKENS | Token entries in native settings; generation into `ctx.credentials`; minimum length; revocation signal on disable/delete/value change; cleanup of generated values | `packages/connector/src/tokens/` | K1 | AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03, AUTH-DT-05, AUTH-ST-01 (rows 1, 5–10, 12) | value never in settings, logs or responses |
| C-PAIR | Pair store (token entry → id), `pair` and `set_name` tools' domain, `already-paired` result and advice, live scope evaluation, names (normalise, fold, unique index, no default names (Q-NAME-1 B; a clash or invalid name at `pair` leaves it empty), case-only change, nameless principals shown as `ID: <id>`, R-NAME-08), the id uniqueness index used by `pair` and the browser page alike, `id-taken` (R-ID-13, Q-ID-1 decided A), `pairedAt` / `lastSeenAt`, read-only status rows | `packages/connector/src/pairs/` | K1, S3 (`pair` / `set_name` as one serial transaction over a single pair-and-name registry: DSH storage has no secondary index) | AUTH-UC-02, AUTH-UC-04, AUTH-EP-03, AUTH-EP-06, AUTH-DT-02, AUTH-BVA-05, AUTH-ST-01 (rows 2–4, 11, 13, 14), NAME-UC-01, NAME-UC-03, NAME-EP-01, NAME-EP-02, NAME-EP-03, NAME-BVA-01, NAME-BVA-03, NAME-EP-04, NAME-DT-01, NAME-DT-02, NAME-ST-01 (rows 1–7) | concurrent pairings never hold one name |
| C-MAILBOX | Per-pair durable ledger: commit, `inbox_poll` (page, cursor, resync, `forbidden`), `inbox_ack`, replay identity, capacity, `fishball-events` resource and `notifications/resources/updated` hints on listen streams, sent only on the streams of the event's own pair (S7 §4.4) | `packages/connector/src/mailbox/` | K1, S1 | EVT-UC-01, EVT-EP-02, EVT-EP-04, EVT-BVA-01, EVT-BVA-02, EVT-ST-01 | a lost hint loses no event |
| C-EXT | Contribution service: registry, namespaces from the caller's loader-entry package (`contributor-unidentified`) and the alias, owner-fiber check on `tools/list` / `tools/call`, quarantine on the contributor's activation, validation, `tools/list` order and the `_meta` contributor field, pre/post call checks, containment, quarantine, `list_changed`, `isError: true` on contributor refusals, `emit` validation/limits/dedupe/fate (recipient and commit through K1 interfaces) | `packages/connector/src/contrib/` | K2, S5 | EXT-UC-01, EXT-UC-02, EXT-UC-03, EXT-EP-01, EXT-EP-02, EXT-EP-03, EXT-EP-04, EXT-BVA-01, EXT-BVA-02, EXT-BVA-03, EXT-BVA-04, EXT-DT-01, EXT-DT-02, EXT-ST-01 | a throwing contributor affects no other tool or client |
| F-LINK | `fishball-core` MCP link: packaged client pinned to 2026-07-28, `ClientCredentialsProvider` with `expectedIssuer`, https rule (core refuses plain `http:` to a non-loopback target **itself**, before any request, because the SDK does not; (spike V3-S7 `8e92b84`, report §4.4)), no credential on redirect, listen + poll on (re)connect, bounded backoff, target status; core's link uses the vendored `./mcp-schema` copy (generated at pack time from the connector's source, design §9.1) instead of `./contract`; **owns** `packages/core/package.json` this wave | `packages/core/src/link/`, `packages/core/package.json` | K1, S1, S7 | REM-EP-01, REM-DT-01, REM-UC-02 (Fishball side) | never sends the token to another origin |
| F-INTERCEPT | Interception service (`intercept`, priority, ties, filters, warnings, `ctl.accept()`, `ctl.commit(send)`, `release`), **core-owned** acceptance ledger with open records re-offered after restart, ack after `accept` resolves, interceptor-only events logged and kept out of every agent's context (R-INT-09), one wake through `Agent.followup` | `packages/core/src/events/` | K3, S2, S3 | EVT-UC-02, EVT-UC-03, EVT-EP-03, EVT-EP-05, EVT-DT-02, EVT-DT-03, EVT-DT-04, EVT-ST-02 | no event lost or handled twice in the S2 crash windows |
| F-GUARDS | `fishball-ui` guard rows in core's bundle patch (including disabling `fishball-instance`), read-only preset with the Skills exception, override detection and `guards-overridden` report (never targets or reports `fishball-hosted-settings`, R-HOST-11 (5)) | `packages/core/cordis.patch.yml`, `packages/core/ui/patch/`, `packages/core/src/guards/`; the `LITE` rows of `packages/instance/src/native-runtime/overlay.js` (W2: it removes them in the same change that adds them to core's patch) | K3, S6, R-CORE | PLAT-UC-04 (composition), UIM-DT-01 rows 9, 10b, 14, HOST-DT-03 rule 6 | report set and cleared at app ready and on settings change |

## W3 — Domain behaviour

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-ROUTE | Managed state and routing (one manager, designated Fishball, recipient at creation, follow-ups), watch = manage (`turn-finished` with running/queued, `state`), `message_fishball` / `ask_fishball` and no-principal rules, the host-only hand-over service with a **chosen target** (`handOver(sessionId, principalKey)`, R-ROUTE-05: offline targets queue, `no-fishball` for disabled or deleted, `conflict` for managed) and `principals()` with `id`, `online`, `enabled`, `paired`, with `onChange` on every online change | `packages/connector/src/routing/`, `packages/connector/src/handover/` | C-MAILBOX, C-PAIR | EVT-EP-01, EVT-DT-01, WATCH-UC-01, WATCH-UC-02, WATCH-EP-01, WATCH-ST-01, HAND-EP-01, HAND-DT-01, HAND-DT-02, HAND-ST-01, HAND-UC-02 (service part), PLAT-UC-03 | every event has exactly one recipient |
| C-TOOLS | Core MCP tools over the V2 domain (sessions, approvals, questions, prompts, grants, attachments), structured envelope with `isError: true` on refusals and the JSON also as text (decided per spec), first-commit-wins, no timers, watch tools removed | `packages/connector/src/mcp/tools/` | C-HTTP, C-OAUTH | PLAT-UC-02, PLAT-EP-02, PLAT-ST-01, WATCH-UC-03 | no refusal is prose only |
| F-PAIR | Core identity (`identity.id` generation, `identity.name` defaulting to "Fishball" locally), paired record, pairing decisions, `already-paired` warning and choices, name-clash display, `set_name` on change and reconnect | `packages/core/src/identity/`, `packages/core/ui/pairing/` | F-LINK, F-GUARDS | AUTH-UC-05 (decisions), AUTH-DT-06, AUTH-ST-03, NAME-UC-02 (core part), NAME-DT-03 | sends nothing while the warning is open |
| F-FACADE | Bridge façade: core tools and every contributed tool re-exposed unfiltered to the model, `list_changed` refresh, contributed-tool count in status; contributor events to Fishball through X9 | `packages/core/src/bridge/` | F-LINK, F-INTERCEPT | EXT-DT-03 rows E6, E8 (Fishball side), EXT-UC-02 A3 | no raw `mcp__…` tool reaches the model |
| WD-ROUTE | Watchdog as an interceptor: `await ctl.accept()` first, answers through `ctl.commit(send)`, two registrations, filters from supervision state, failure = off, fallback of unaccepted items, "watchdog is down" per episode, in-session messages only; peer change to optional `fishballInstance?`; **owns** `packages/watchdog/package.json` and its plugin row this wave | `packages/watchdog/src/intercept/`, `packages/watchdog/src/health/`, `packages/watchdog/package.json` | F-INTERCEPT | WD-UC-02, WD-UC-04, WD-EP-01 (rows 1–11), WD-EP-03, WD-DT-02, WD-ST-01 | a failure never stops a watched session |
| U-SHELL | Embed-UI host half and client shell: service detection, `instance-missing`, the sidebar Fishball entry as the one entry (no brand override, no answer controls for `ask_fishball`; R-UI-11/12), frame with admission under the main page's loopback hostname, refusing other names with "Open DSH at 127.0.0.1 to use Fishball" (S4-Q1), status and Retry outside the frame, Plugins card with model sync; slot registry used by U-MARKS / U-ATTN. **First** splits the V2 client moved by R-EMBED into `shell/`, `marks/`, `attention/` and `records/` modules with no behaviour change, so U-MARKS and U-ATTN own separate files in W4; adds the host row and injects to the minimal manifest R-EMBED created; **owns** `packages/embed-ui/package.json` and its client entry this wave | `packages/embed-ui/src/host/`, `packages/embed-ui/src/client/**` (W3; after it, `client/marks/` and `client/attention/` pass to U-MARKS and U-ATTN), `packages/embed-ui/package.json` | R-EMBED, K3, S4 | UIM-EP-01, UIM-EP-02, UIM-UC-04, UIM-UC-01 (integration part), UIM-DT-01 rows 3, 7, 7b | stores no secret; no token in the frame URL |
| I-PLACE | Instance: placement of the four bundled plugins and `fishball-hosted-settings` before profile load, placement record (first on, disable survives, deleted-while-off re-placed off), incompatible member blocks start, launch overlays with no guard rows (F-GUARDS already moved the `LITE` rows); replaces `copyChildCode`; turns `src/child-settings/` into the placed bundle **`fishball-hosted-settings`** (`bundled/hosted-settings/`, row id `fishball-hosted-settings`; TQ-R4 decided B), replacing the V2 child-row insertion: placed with the set by the same code and in the same placement record (on at first placement, disable survives, deleted-while-off re-placed off, enabled-incompatible blocks start), listed on the child's Plugins page; places `fishball-shared` beside core in the child (`vendor/` + `node_modules/`) as core's dependency, never as a profile bundle; **owns** `packages/instance/package.json` this wave (`bundled/` in `files`) | `packages/instance/src/native-runtime/` placement and overlay modules, `packages/instance/bundled/`, `packages/instance/package.json` | R-CORE, F-GUARDS | PLAT-DT-01, HOST-ST-01 (rows 1–3), HOST-UC-06 (overlay postcondition), HOST-UC-08, HOST-EP-03 rows 6–7, HOST-DT-03 | host never lists or loads the bundled copies |
| FEAT-PEERS | Board and fold-notify: optional `fishballInstance?`, `fishball-core-missing`, board retention and `board_export`, fold-notify attention through `embed-ui.attention.signal` with `unsupported-operation` fallback | `packages/board/**`, `packages/fold-notify/**` | K3, K2 (attention tool contract via the façade fake), R-CORE | PLAT-EP-04 rows 1, 2, 4, PLAT-UC-06, PLAT-BVA-01, EXT-UC-04 A1 | boot never fails without core |

## W4 — Cross-cutting effects, Watchdog judgement and patrol, embed-UI features

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-REVOKE | Revocation effects: streams close, answers refused, offers to the user, sessions unmanaged with one note, held events for 30 days and restored on re-enable (per TQ-2 answer) | `packages/connector/src/revocation/` | C-TOKENS, C-MAILBOX, C-ROUTE | AUTH-UC-03, AUTH-UC-06, AUTH-DT-04 | takes effect on the next request |
| C-SUCCEED | `fishballConnectorTokens`: `createHosted`, `retire` as one transaction (sessions, role, name, re-issued offers with new ids, events with their ids, delete, notes, rollback) | `packages/connector/src/hosted/` | C-PAIR, C-ROUTE, C-MAILBOX | HOST-UC-03 (connector part), HOST-DT-02, HOST-ST-02, NAME-ST-01 rows 8–9 | name never held twice |
| WD-DECIDE | Permission judgement: allow / justified reject / `escalate` to the user / re-route to Fishball, settlement interception and non-waking note, first-commit races, model change timing | `packages/watchdog/src/decide/` | WD-ROUTE, K1 (answer tool contract; tested against a fake link) | WD-UC-01, WD-DT-01, WD-EP-04 rows 1–3 | no Fishball turn for allow, reject or escalate |
| WD-PATROL | Patrol timer (one per supervised session, exactly one per interval), patrol reads with watermark, `minCheckIntervalSeconds` validation, data-only `watchdog_brief` / `watchdog_refine`, pause (stop first) / resume with no run, no `watchdog_check_now`, no other timers | `packages/watchdog/src/patrol/`, `packages/watchdog/src/brief/` | WD-ROUTE | WD-UC-03, WD-UC-06, WD-UC-07, WD-EP-01 rows 12–15, WD-EP-02, WD-EP-04 row 4, WD-BVA-01, WD-BVA-02, WD-BVA-03, WD-ST-02, WD-ST-03 | a refine returns before any Watchdog work and never moves the timer |
| F-STATUS | Core status: `target-unset` / `target-unreachable` / `token-refused` / `TARGET_INCOMPATIBLE`, plugin-set completeness (four set members only; `fishball-hosted-settings` is never reported missing), standalone "watchdog is down" at app ready, `fishball-off`, status strip | `packages/core/src/status/`, `packages/core/ui/status/`, `packages/core/package.json` (W4: drops the `fishball-connector` dependency once no core file imports `./contract`) | F-LINK, F-GUARDS, WD-ROUTE | REM-DT-01 (status display), PLAT-DT-02, WD-UC-05 (standalone), PLAT-EP-04 row 3 | one notice per DSH start |
| F-ASKCARD | The ask card in Fishball's own page for asks Fishball cannot decide (R-FB-11): shown in its conversation, answered there, committed through core's link, no time limit | `packages/core/ui/asks/`, `packages/core/src/asks/` | F-LINK, F-FACADE, K3 | PLAT-UC-07 | the main DSH shows no card; the answer is committed once (first commit wins) |
| U-MARKS | Managed marks with names or `ID: <id>` with a **bold** `ID:` prefix (R-NAME-08), the **Hand over control** (none / one "Hand over to <name or ID: id>" button / a "Handover to…" dropdown of every enabled, paired agent, each with a live green/red online light, R-UI-10) and Take back through the hand-over service, labels from the locale files, refresh on `onChange` | `packages/embed-ui/src/client/marks/`, `packages/embed-ui/src/host/handover/` | U-SHELL, C-ROUTE | HAND-UC-01, HAND-UC-02, HAND-UC-03, HAND-UC-04 (integration parts), HAND-EP-02, HAND-ST-02, UIM-DT-01 rows 6, 8 | names always match `managed()` |
| I-HOST | Instance host row: `fishballChild` locator (status, origin and single-use admission for the caller's loopback hostname `127.0.0.1` / `localhost` / `[::1]`, child reachable under all three (S4-Q1 decided A), Retry, target status), lifecycle codes, `mcp-credential` wire channel, `createHosted` call when no paired credential, no replacement on disable, Retry after delete, pending "watchdog is down", host model-sync trigger kept; removes `src/host/binding.js` (the V2 connector binding) | `packages/instance/src/host/`, `packages/instance/src/native-runtime/wire/` | I-PLACE, K3 | HOST-UC-01, HOST-UC-02, HOST-UC-04, HOST-UC-05, HOST-UC-06, HOST-UC-07 (engine), HOST-EP-01, HOST-EP-02, HOST-DT-01, HOST-ST-01 (rows 4–10), WD-UC-05 A1 | token only in memory and on the wire channel |
| U-ATTN | Attention latch in embed-UI; `embed-ui.attention.signal` / `.state` contributed; fish and dots; clear on page open; reset on unload or loss of the designated Fishball's connection | `packages/embed-ui/src/client/attention/`, `packages/embed-ui/src/host/attention/` | U-SHELL, C-EXT | EXT-UC-04, EXT-DT-03 rows E3–E5 | absent without the connector service |
| U-RECORDS | Inline read-only records in the managed session (R-UI-13): an `ask_fishball` record (question, then answer) through a read-only `tool.call.toolview`, and a permission record (request, then decision or the user's card answer) through `conversation.chat.node`, built only from the session's own DSH events, principal name from the existing `managed()`; no new service member, no connector read API. If an SDK does not expose a received decision in the session's own events: stop and raise one question | `packages/embed-ui/src/client/records/` | U-SHELL, C-ROUTE (via the K3 contract) | UIM-UC-05, UIM-DT-02 | both SDKs; no answer control anywhere in the main DSH |

## W4b — Connector wiring

C-WIRE runs alone, after W4, because it wires in every connector module, including C-REVOKE and
C-SUCCEED from W4.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| C-WIRE | Connector plugin row: wire all modules, native settings schema (tokens list, `routing.fishballToken`, limits, the approval-listener port setting (Q-OA-7); no `directAccess`, no per-contributor rows), V2 settings kept/inert, V2 intake holding queue; removes `./contract`, `fishballConnector.attachInstance`, envelope-v2 and the `control` wire use, i.e. the V2 control path (nothing imports them any more); raises the connector's `engines.dsh` from `>=0.2.1-rc.2` to `>=0.2.1-rc.5` (design §9.1); **owns** the connector plugin entry and settings schema | `packages/connector/src/index` (plugin row), `packages/connector/package.json`, `packages/connector/src/settings/`, `packages/connector/src/migration/` | every connector task of W2–W4: C-HTTP, C-OAUTH, C-OAUTH-WEB, C-TOKENS, C-PAIR, C-MAILBOX, C-EXT, C-ROUTE, C-TOOLS, C-REVOKE, C-SUCCEED; plus I-HOST (binding gone) and F-STATUS (core off `./contract`) | AUTH-UC-09 (integration part), PLAT-UC-05 step 1, PLAT-EP-03 | full connector loads on both SDKs; R-CON-10 |

## W5 — End to end, migration and acceptance

These tasks own acceptance tests and harnesses. Product fixes they find go back to the owning
task's area through a short follow-up task, serialised, so no two sessions edit one area.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| I-SUCCEED | Instance side of reinstall succession: keep the entry key, call `retire` after the new pairing, retry at next start, never for a user-made entry or a user delete | `packages/instance/src/host/succession/` | I-HOST, C-SUCCEED | HOST-UC-03, HOST-DT-01 rows 5–7, HOST-DT-02 (end to end) | succession runs only on reinstall |
| X-MIG | V2 → V3 upgrade on a real V2 child profile | `test/v3/migration/` | C-WIRE, I-HOST, F-STATUS, U-SHELL | PLAT-UC-05 | history, Skills, settings kept |
| X-SEC | Secret sweep over a full run; token-value placement checks. The scan allow-lists exactly one known hit: DSH's own browser login token printed on stdout at startup (spike V3-S7 `8e92b84`, report §4.4); any other hit, or that token anywhere else, fails | `test/v3/security/` | all of W4 and W4b | PLAT-EP-05, HOST-EP-02 (end to end), PLAT-EP-06, PLAT-EP-07 (runtime part) | zero hits |
| X-MATRIX | Install matrix rows and contribution matrix on a real DSH | `test/v3/matrix/` | all of W4 and W4b | UIM-DT-01 (headless columns), EXT-DT-03, PLAT-EP-03 rows 2–6 | every row except 11 checked |
| X-REMOTE | Standalone Fishball against a second DSH; hosted with a remote target | `test/v3/remote/` | C-WIRE, F-STATUS, F-PAIR, I-HOST | REM-UC-01, REM-UC-02, HOST-UC-05 (end to end) | two DSH processes, https or tunnel |
| DOCS | README notes: older MCP clients must upgrade, prompt-size note for contributors, standalone set-up and `board_export`, migration order; the one departure from the MCP specification (plain HTTP for the authorization server on loopback, Q-SPEC-1); contributor namespaces are attribution only, and a plugin the user installed is the user's responsibility (S5-Q5); public exposure through the user's own tunnel (both listeners, `--trusted-host`; hosted clients such as Claude's hosted connectors call from Anthropic's servers and need it; no tunnel feature, R-REM-05); packaging: five npm packages plus embed-UI versioned together, `fishball-shared` a library carried inside the tarball of every package that depends on it (not installed by hand, not a plugin) | `README.md`, `packages/*/README.md`, `docs/package-layout.md` | W4 | — (R-CON-01, R-EXT-14, R-BRD-02 documentation parts) | reviewed |

## W5b — Compatibility matrix

X-COMPAT runs after W5, because it re-runs the X-MATRIX and X-REMOTE suites on both SDKs.

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| X-COMPAT | The compatibility matrix | `test/v3/compat/` | X-MATRIX, X-REMOTE | PLAT-DT-03 (rules 1–4, 6; no mixed pairs, decided B) | all rules pass |

## W6 — Browser e2e after merge

| Id | Scope | Owns | Depends | Cases | Definition of done |
| --- | --- | --- | --- | --- | --- |
| E2E-UI | Host-DSH browser flows: page, frame, status, Retry, marks, Hand over / Take back, fish and dots, native settings pair status, hosted model-sync card | `test/v3/e2e/host/` | merge of W5b | UIM-UC-01, UIM-UC-02, UIM-UC-03, HAND-UC-01…04 (UI), AUTH-UC-09, HOST-UC-04 (Retry), HOST-UC-07 (card), UIM-DT-01 (UI columns) | both SDKs |
| E2E-CORE | Fishball-page browser flows: `already-paired` warning, name clash, A-lite page and guards, `guards-overridden` strip | `test/v3/e2e/fishball/` | merge of W5b | AUTH-UC-05, AUTH-ST-03 (warning), NAME-UC-02 (page), NAME-DT-03 (page), PLAT-UC-04 (page), REM-UC-01 (page) | hosted and standalone, both SDKs |

## Dependency graph (summary)

```text
W0  S1 S2 S3 S4 S5 S6 S7
     │  │  │  │  │  │  │
W1  K1 ◄┴──┴──┴─────┴──┘   K2 ◄ S5   K3 ◄ S3 S4 S6   (R-CONN ∥ R-SHARED) → R-CORE → R-EMBED (+S4)
W2  C-HTTP C-OAUTH C-TOKENS C-PAIR C-MAILBOX (K1) · C-EXT (K2) · F-LINK (K1) · F-INTERCEPT (K3) · F-GUARDS (K3, S6, R-CORE)
W3  C-ROUTE (MAILBOX, PAIR) · C-TOOLS (HTTP, OAUTH) · F-PAIR · F-FACADE · WD-ROUTE · I-PLACE (R-CORE, F-GUARDS) · U-SHELL · FEAT-PEERS
W4  C-REVOKE · C-SUCCEED · WD-DECIDE · WD-PATROL · F-STATUS · U-MARKS · U-ATTN · I-HOST (I-PLACE)
W4b C-WIRE (all connector modules, incl. C-REVOKE, C-SUCCEED)
W5  I-SUCCEED · X-MIG · X-SEC · X-MATRIX · X-REMOTE · DOCS
W5b X-COMPAT (X-MATRIX, X-REMOTE)
W6  E2E-UI · E2E-CORE
```

## Overlap check (per wave)

| Wave | Shared hotspot | Single owner in the wave |
| --- | --- | --- |
| W1 step 1 | `packages/shared/**`, `packages/instance/package.json`, shared modules' import sites, root `workspaces` | R-SHARED |
| W1 steps 1–2 | `packages/connector/package.json` | R-CONN |
| W1 step 2 | `packages/instance/package.json`; `packages/instance/src/child-settings/**`; import lines of `host.js`, `settings-routes.js`, `provider-sync-service.js`, `installation.js`, `overlay.js` | R-CORE |
| W1 step 2 | root `package.json` `workspaces` | R-CORE |
| W1 step 3 | client entries of both manifests; `packages/embed-ui/package.json` (created); client-copy line of `installation.js`; the status-line export in `src/child-settings/`; root `workspaces` | R-EMBED |
| W1 after step 2 | `packages/core/contracts/` (settings-section types) | K3 (starts after R-CORE; touches no file R-EMBED owns) |
| W2 | `packages/core/package.json` | F-LINK (F-GUARDS owns only `cordis.patch.yml`) |
| W2 | `packages/connector/package.json` (`hono` line only, if needed) | C-HTTP |
| W2 | `overlay.js` (`LITE` rows only) | F-GUARDS |
| W3 | `packages/instance/package.json`, `overlay.js`, `installation.js` | I-PLACE |
| W2–W4 | connector plugin row and settings schema | nobody (modules only; wired in W4b by C-WIRE) |
| W3 | `packages/watchdog/package.json` | WD-ROUTE |
| W3 | `packages/embed-ui/package.json`, client entry, all of `packages/embed-ui/src/client/**` | U-SHELL |
| W4 | `packages/instance/src/host/` | I-HOST |
| W4 | `packages/core/package.json` | F-STATUS |
| W4b | connector plugin row, settings schema, `packages/connector/package.json` | C-WIRE (only task in the wave) |
| W4 | `packages/watchdog/` | WD-DECIDE (`decide/`), WD-PATROL (`patrol/`, `brief/`); row and manifest untouched |
| W4 | `packages/embed-ui/` | U-MARKS (`marks/`, `host/handover/`), U-ATTN (`attention/`), U-RECORDS (`records/`); shell untouched |
| W5 | `packages/instance/src/host/succession/` | I-SUCCEED |
