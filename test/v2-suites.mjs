/**
 * The V2 release suite selection (docs/planning/v2-final-scope.md §1, §3.3). V3 features (Watchdog,
 * board incl. board_search, fold-notify, bundled placement, MCP) keep their source, suites and
 * history; this manifest only keeps them out of the V2 run. Selection is by requirement clause, not
 * filename: mixed suites keep their V2 clauses and skip the deferred ones by case ID.
 *
 * Skip patterns go to node --test --test-skip-pattern, which applies each one to every selected
 * file. Every pattern is anchored on a case-ID prefix that only its own file uses, so it cannot
 * hide another file's case; `file` names that owner for review.
 */
import { rootSuiteFiles } from './support/suite-runner.mjs'

export const DISPOSITION = Object.freeze({
  v3: 'v3',
  ownRunner: 'own-runner',
  /** Plan §0/§3.3: no migration acceptance in V2; the code ships, the cases are not a V2 gate. */
  nonGatingMigration: 'non-gating-migration',
  /** The row's subject was removed by an approved design change; the reason names the successor task. */
  withdrawn: 'withdrawn',
})

const file = (path, disposition, reason) => Object.freeze({ file: path, disposition, reason })
const cases = (path, pattern, disposition, reason) => Object.freeze({ file: path, pattern, disposition, reason })

export const V2_SUITES = Object.freeze({
  /** Non-root suites in the V2 run; test/*.test.mjs come from the root runner's own rule. */
  nested: Object.freeze([
    'packages/dsh-connector/test/instance-ext/k1.test.mjs',
    // Manager workspace attach (7.A blank composer) and its background-activation policy
    // (review-opus/v2-manager-ws-2).
    'packages/dsh-instance/test/instance-ext/manager-attach-background.test.mjs',
    'packages/dsh-instance/test/instance-ext/manager-workspace.test.mjs',
    // PB/PBS: page setup unwinding and teardown (R-A1–R-A3), settings shared-card mount ownership (R-B1/R-B2);
    // review-opus/v2-page-boot findings F1/F2.
    'packages/dsh-instance/test/instance-ext/page-boot-unwind.test.mjs',
    // PAGE (7.A page-open ensure) and READY (appReady gate) implementation suites, plan §3 owners.
    'packages/dsh-instance/test/instance-ext/page-open-session.test.mjs',
    // PAGE: the first selection waits for DSH's session list to carry the manager (black-box, from requirements).
    'packages/dsh-instance/test/instance-ext/page-open-listed.test.mjs',
    'packages/dsh-instance/test/instance-ext/ready-gate.test.mjs',
    'packages/dsh-instance/test/instance-ext/x0-c-held-context.test.mjs',
    'packages/dsh-instance/test/instance-ext/x0-c.test.mjs',
    'test/instance-ext/x0-i.test.mjs',
    'test/instance-ext/x0-w.test.mjs',
    // T-SK private Skills (UC-25–28, EP-19–22, BVA-12, DT-09, ST-09/10). They live under
    // test/private-skills/, which the root rule does not discover; each suite loops over both SDKs.
    'test/private-skills/sk-bva.test.mjs',
    'test/private-skills/sk-dt.test.mjs',
    'test/private-skills/sk-ep.test.mjs',
    'test/private-skills/sk-st.test.mjs',
    'test/private-skills/sk-uc.test.mjs',
    // CHILD-BOOT: the child page rows in the real SDK web boot and headless Chromium, both SDKs.
    'test/v2-page-cases/child-boot.test.mjs',
    // Round-2 B4: the Fishball/Plugins way back over the Plugins page and Fishball's settings panel, real SDK web boot.
    'test/v2-page-cases/child-boot-nav.test.mjs',
    // CHILD-BOOT-REOPEN: every open of the child page lands on the manager (fresh origin, reload, view=settings), both SDKs.
    'test/v2-page-cases/child-boot-reopen.test.mjs',
    // Final V2 page/readiness/origin/lite/settings cases (070b88e). Unobservable seams stay TODO.
    'test/v2-page-cases/lite.test.mjs',
    'test/v2-page-cases/page.test.mjs',
    'test/v2-page-cases/pg-origin.test.mjs',
    'test/v2-page-cases/ready.test.mjs',
    'test/v2-page-cases/set.test.mjs',
    // SET main-only model sync (user decision 2026-11-11): child-initiated sync is refused, the main card works.
    'test/v2-page-cases/set-main-only-sync.test.mjs',
    // RP: the child-only Fishball Recommended tab (T-RP cases 6cbe9e3), one registration per SDK.
    'test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs',
    'test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs',
    'test/verification/w0-host-session.test.mjs',
  ]),
  excludedFiles: Object.freeze([
    file('test/v3/contract/own-schema/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'F-OWN-SCHEMA core-owned MCP surface'),
    file('test/v3/contract/own-schema/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'F-OWN-SCHEMA core-owned MCP surface'),
    file('packages/board/test/instance-ext/b1.test.mjs', DISPOSITION.v3, 'board skeleton (B1)'),
    file('packages/board/test/instance-ext/b11-search.test.mjs', DISPOSITION.v3, 'board_search (B11)'),
    file('docs/verification/v2-board-search-accept/supplemental.test.mjs', DISPOSITION.v3, 'board_search acceptance supplement'),
    file('test/verification/w0-cordis.test.mjs', DISPOSITION.v3, 'FN-1/B1 plugin activation supplement'),
    file('packages/dsh-connector/test/instance-ext/mcp-feasibility.test.mjs', DISPOSITION.v3, 'MCP-S1/S2/S3 feasibility'),
    file('test/native-production-preflight.test.mjs', DISPOSITION.ownRunner, 'fails closed outside test/native-production-runner.mjs'),
    // V3 R-SHARED (PLAT-EP-07 static rows, HOST-EP-03 rows 1–2); run with test/run-v3.mjs.
    file('test/v3/contract/package-boundaries/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-shared package boundaries (R-SHARED)'),
    file('test/v3/contract/package-boundaries/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-shared package boundaries (R-SHARED)'),
    // V3 SPLIT-SHARED (one library per side, requirements 1.40: dsh-connector-shared and fishball-shared); run with test/run-v3.mjs.
    file('test/v3/contract/split-shared/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 one shared library per side (SPLIT-SHARED)'),
    file('test/v3/contract/split-shared/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 one shared library per side (SPLIT-SHARED)'),
    // V3 K1d (token reveal, page id, Mailbox.transfer, SettingsWriter, SessionNotes amendments); run with test/run-v3.mjs.
    file('test/v3/contract/k1d-amendments/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 K1d contract amendments (K1d)'),
    file('test/v3/contract/k1d-amendments/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 K1d contract amendments (K1d)'),
    // V3 K3a (core-side seams: own MCP-surface copy, hosted import names, Connect, fishball-ui seam); run with test/run-v3.mjs.
    file('test/v3/contract/k3a-core-seams/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 K3a core-side seams (K3a)'),
    file('test/v3/contract/k3a-core-seams/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 K3a core-side seams (K3a)'),
    // V3 K2 (freeze of dsh-connector/tools, K-flagged EXT cases); run with test/run-v3.mjs.
    file('test/v3/contract/k2-tools/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 contribution contract freeze (K2)'),
    file('test/v3/contract/k2-tools/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 contribution contract freeze (K2)'),
    // V3 R-CORE (HOST-UC-08 V2-mechanism part, HOST-EP-03 rows 1–4); run with test/run-v3.mjs.
    file('test/v3/fishball-core/package/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core package and slim child move (R-CORE)'),
    file('test/v3/fishball-core/package/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core package and slim child move (R-CORE)'),
    // V3 K1 (freeze of dsh-connector/mcp-schema, K-flagged AUTH/NAME/EVT/PLAT/WATCH cases); run with test/run-v3.mjs.
    file('test/v3/contract/k1-mcp-schema/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 MCP schema freeze (K1)'),
    file('test/v3/contract/k1-mcp-schema/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 MCP schema freeze (K1)'),
    // V3 K3 (host-only service contracts, core's settings-section point; HAND/HOST/UIM K flags); run with test/run-v3.mjs.
    file('test/v3/contract/k3-host-services/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 host-only service and core contract freeze (K3)'),
    file('test/v3/contract/k3-host-services/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 host-only service and core contract freeze (K3)'),
    // V3 R-EMBED (PLAT-EP-03 rows 1, 3, 5, HOST-EP-03 row 5); run with test/run-v3.mjs.
    file('test/v3/contract/embed/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 dsh-connector-ui package (R-EMBED)'),
    file('test/v3/contract/embed/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 dsh-connector-ui package (R-EMBED)'),
    // V3 F-LINK (REM-UC-02 Fishball side, REM-EP-01, REM-DT-01); run with test/run-v3.mjs.
    file('test/v3/fishball-core/link/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core MCP link (F-LINK)'),
    file('test/v3/fishball-core/link/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core MCP link (F-LINK)'),
    // V3 F-INTERCEPT (EVT-UC-02/03, EVT-EP-03/05, EVT-DT-02/03/04, EVT-ST-02); run with test/run-v3.mjs.
    file('test/v3/fishball-core/events/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core interception, acceptance ledger and wake (F-INTERCEPT)'),
    file('test/v3/fishball-core/events/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core interception, acceptance ledger and wake (F-INTERCEPT)'),
    // V3 F-GUARDS (PLAT-UC-04 composition, PLAT-DT-04, UIM-DT-01 rows 9/10b/14, HOST-DT-03 rule 6, HOST-UC-08 A3/E2); run with test/run-v3.mjs.
    file('test/v3/fishball-ui/guards/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core guard rows, override report and self-reorder (F-GUARDS)'),
    file('test/v3/fishball-ui/guards/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core guard rows, override report and self-reorder (F-GUARDS)'),
    // V3 C-UI-BACKEND (UIB-UC-01…07, UIB-EP-01…07, UIB-BVA-01…04, UIB-DT-01…04, UIB-ST-01…04; R-UI-05/10, R-ROUTE-05, R-FN-01, R-EXT-13); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/ui/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector UI backend: marks, Hand over targets and lights, attention latch, notify, routes and stream (C-UI-BACKEND)'),
    file('test/v3/dsh-connector/ui/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector UI backend: marks, Hand over targets and lights, attention latch, notify, routes and stream (C-UI-BACKEND)'),
    // V3 C-MCP-ADAPTER (AUTH-UC-12/13/14, AUTH-EP-12/13/14, AUTH-BVA-09, AUTH-DT-11/12, AUTH-ST-06/07, ADP-EP-01, ADP-BVA-01, ADP-REV-*; R-OA-21, design §5.5b); run with test/run-v3.mjs.
    file('test/v3/dsh-connector-adapter/adapter/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector adapter: check, sign-in tool, proxy, child row, refresh (C-MCP-ADAPTER)'),
    file('test/v3/dsh-connector-adapter/adapter/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector adapter: check, sign-in tool, proxy, child row, refresh (C-MCP-ADAPTER)'),
    // V3 C-MCP-ADAPTER's library (OAC-EP-01…03, OAC-BVA-01/02, OAC-ST-01, OAC-DT-01, OAC-LEAK-01); run with test/run-v3.mjs.
    file('test/v3/dsh-connector-shared/oauth-client/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, "V3 dsh-connector-shared OAuth browser client and token manager (C-MCP-ADAPTER)"),
    file('test/v3/dsh-connector-shared/oauth-client/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, "V3 dsh-connector-shared OAuth browser client and token manager (C-MCP-ADAPTER)"),
    // V3 C-EXT (EXT-UC-01…03, EXT-EP-01…04, EXT-BVA-01…04, EXT-DT-01/02, EXT-ST-01, K2's C-EXT rows); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/contrib/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector contribution service (C-EXT)'),
    file('test/v3/dsh-connector/contrib/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector contribution service (C-EXT)'),
    // V3 C-PAIR (AUTH-UC-02/04, AUTH-EP-03/06, AUTH-DT-02, AUTH-BVA-05, AUTH-ST-01 rows 2–4/11/13/14, NAME-UC-01/03, NAME-EP-01…04, NAME-BVA-01/03, NAME-DT-01/02, NAME-ST-01 rows 1–7); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/pairs/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector pair store, pair / set_name and names (C-PAIR)'),
    file('test/v3/dsh-connector/pairs/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector pair store, pair / set_name and names (C-PAIR)'),
    // V3 C-HTTP (PLAT-UC-01, PLAT-EP-01, PLAT-BVA-02, REM-UC-03, REM-EP-02/03, EVT-EP-04 rows 3–4, AUTH-EP-02 rows 1, 2, 11–14, K1b-UC-01/DT-05/BVA-02/ST-02); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/mcp-http/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector MCP route, request gate and limits (C-HTTP)'),
    file('test/v3/dsh-connector/mcp-http/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector MCP route, request gate and limits (C-HTTP)'),
    // V3 C-TOOLS (PLAT-UC-02, PLAT-EP-02 rows 1–6/4a, PLAT-ST-01, WATCH-UC-03, WATCH-UC-01 E1, WATCH-ST-01 rows 7–8); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/mcp-tools/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector core MCP tools and result envelope (C-TOOLS)'),
    file('test/v3/dsh-connector/mcp-tools/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector core MCP tools and result envelope (C-TOOLS)'),
    // V3 C-MAILBOX (EVT-UC-01, EVT-EP-02, EVT-EP-04 rows 1/2/5/6, EVT-BVA-01/02, EVT-ST-01); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/mailbox/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector per-pair mailbox, poll/ack and hints (C-MAILBOX)'),
    file('test/v3/dsh-connector/mailbox/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector per-pair mailbox, poll/ack and hints (C-MAILBOX)'),
    file('test/v3/dsh-connector/schema-value/index.test.mjs', DISPOSITION.v3, 'V3 connector schema-value validateValue wrapper (C-MAILBOX, shared with C-EXT)'),
    // V3 C-TOKENS (AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03, AUTH-DT-05, AUTH-ST-01 rows 1, 5–10, 12); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/tokens/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector token entries, generation, minimum length, revocation signal and cleanup (C-TOKENS)'),
    file('test/v3/dsh-connector/tokens/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector token entries, generation, minimum length, revocation signal and cleanup (C-TOKENS)'),
    // V3 C-TOKENS-REVEAL settings page (AUTH-UC-01 main 2/4–6/E1/E2 at the route, AUTH-UC-15, AUTH-ST-08, PLAT-EP-03 row 1, HAND-EP-01 row 3); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/settings-page/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector settings page: create / notice routes, client.js, reveal modal (C-TOKENS-REVEAL)'),
    file('test/v3/dsh-connector/settings-page/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector settings page: create / notice routes, client.js, reveal modal (C-TOKENS-REVEAL)'),
    // V3 C-OAUTH (AUTH-UC-03/06/07/08, AUTH-EP-01/02/05/07/09, AUTH-BVA-01/02/06, AUTH-DT-01, AUTH-ST-02, store/limiter rows of AUTH-ST-04/05, K1b-UC-02/DT-06, C-PAIR's token-endpoint rows); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/oauth/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector authorization server: token store, failure limiter, bearer verifier, token endpoint (C-OAUTH)'),
    file('test/v3/dsh-connector/oauth/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector authorization server: token store, failure limiter, bearer verifier, token endpoint (C-OAUTH)'),
    // V3 C-OAUTH-WEB (AUTH-UC-10, AUTH-DT-07/08/09, AUTH-ST-04/05, AUTH-BVA-07/08, AUTH-EP-08/10, K1b-DT-07); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/oauth-web/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector browser authorization: approval listener, CIMD, code and refresh grants (C-OAUTH-WEB)'),
    file('test/v3/dsh-connector/oauth-web/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector browser authorization: approval listener, CIMD, code and refresh grants (C-OAUTH-WEB)'),
    // V3 C-ROUTE (EVT-EP-01, EVT-EP-04 end to end, EVT-DT-01, WATCH-UC-01/02, WATCH-EP-01, WATCH-ST-01 rows 1–6, HAND-EP-01, HAND-DT-01/02, HAND-ST-01, HAND-UC-02 service part, PLAT-UC-03); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/routing/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector managed state, routing, watch = manage and hand-over service (C-ROUTE)'),
    file('test/v3/dsh-connector/routing/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector managed state, routing, watch = manage and hand-over service (C-ROUTE)'),
    // V3 C-REVOKE steps 1–2 (routing endPrincipal, askDropped, K1d Mailbox.retire misuse; the revocation module: AUTH-UC-06, AUTH-DT-04, AUTH-UC-03 E1; R-TOK-05, R-ROUTE-06, R-WATCH-01, R-CON-05); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/revocation/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector revocation: endPrincipal, askDropped, Mailbox.retire misuse, the revocation module (C-REVOKE)'),
    file('test/v3/dsh-connector/revocation/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector revocation: endPrincipal, askDropped, Mailbox.retire misuse, the revocation module (C-REVOKE)'),
    // V3 C-SUCCEED (HOST-UC-03, HOST-DT-02, HOST-ST-02, NAME-ST-01 rows 8–9, HAND-ST-01 row 7, WATCH-EP-01 row 6, WATCH-ST-01 row 6, PLAT-ST-01 row 7, K1d Mailbox.transfer); run with test/run-v3.mjs.
    file('test/v3/dsh-connector/hosted/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector hosted tokens and reinstall succession (C-SUCCEED)'),
    file('test/v3/dsh-connector/hosted/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector hosted tokens and reinstall succession (C-SUCCEED)'),
    // V3 F-FACADE (EXT-DT-03 E6/E8 Fishball side, EXT-UC-02 A3, EXT-UC-04 A1 core side); run with test/run-v3.mjs.
    file('test/v3/fishball-core/bridge/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core bridge façade, list_changed refresh, contributed count and X8 attention (F-FACADE)'),
    file('test/v3/fishball-core/bridge/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core bridge façade, list_changed refresh, contributed count and X8 attention (F-FACADE)'),
    // V3 FEAT-PEERS (PLAT-EP-04 rows 1, 2, 4, PLAT-UC-06 main and A1, PLAT-BVA-01, EXT-UC-04 A1; the board export was dropped by the user, 2026-11-15); run with test/run-v3.mjs.
    file('test/v3/fishball-board/peers/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 board and fold-notify without core, board retention and fold-notify attention fallback (FEAT-PEERS)'),
    file('test/v3/fishball-board/peers/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 board and fold-notify without core, board retention and fold-notify attention fallback (FEAT-PEERS)'),
    // V3 F-PAIR (AUTH-UC-05 decisions, AUTH-DT-06, AUTH-ST-03 non-warning-UI rows, NAME-UC-02 core part, NAME-DT-03 core reaction, token-revoked: AUTH-ST-03 row 10, HOST-UC-04 main); run with test/run-v3.mjs.
    file('test/v3/fishball-core/identity/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core identity, pairing decisions and token-revoked (F-PAIR)'),
    file('test/v3/fishball-core/identity/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core identity, pairing decisions and token-revoked (F-PAIR)'),
    // V3 F-LINK-SAVE (REM-UC-04, REM-ST-01, FLS-EP-01…05, FLS-DT-01…03, FLS-BVA-01…03; R7, R9, R10, R12 = B, R14, Q-LS1 = A); run with test/run-v3.mjs.
    file('test/v3/fishball-core/link-save/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core saved credentials and Connect (F-LINK-SAVE)'),
    file('test/v3/fishball-core/link-save/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core saved credentials and Connect (F-LINK-SAVE)'),
    // V3 F-SETTINGS (SET3-UC-01…10 and their EP/BVA/DT/ST rows; requirements 1.34 item 4); run with test/run-v3.mjs.
    file('test/v3/fishball-core/settings/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, "V3 fishball-core's own settings page, token field, Connect and Fishball-page entries (F-SETTINGS)"),
    file('test/v3/fishball-core/settings/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, "V3 fishball-core's own settings page, token field, Connect and Fishball-page entries (F-SETTINGS)"),
    // V3 U-SHELL (UIM-UC-01 integration part, UIM-UC-04 U-SHELL's parts, UIM-EP-01/02, UIM-DT-01 rows 3, 7, 7b, R-EMBED's U-SHELL row); run with test/run-v3.mjs.
    file('test/v3/dsh-connector-ui/shell/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 embed-UI host half and client shell (U-SHELL)'),
    file('test/v3/dsh-connector-ui/shell/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 embed-UI host half and client shell (U-SHELL)'),
    // V3 U-DRAW (the fish, window, hint, Retry link, marks, Hand over / Take back, light, notify prompt, tool declaration; Q-U1, Q-G3, Q-G4, Q-G5, R-FN-01, R-UI-04/05/10); run with test/run-v3.mjs.
    file('test/v3/dsh-connector-ui/draw/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 embed-UI draw-only frontend over the connector UI backend (U-DRAW)'),
    file('test/v3/dsh-connector-ui/draw/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 embed-UI draw-only frontend over the connector UI backend (U-DRAW)'),
    // V3 I-PLACE (PLAT-DT-01, HOST-ST-01 rows 1–3, HOST-UC-06 post, HOST-UC-08 main 1/A1–A3, HOST-EP-03 rows 6–7, HOST-DT-03, PLAT-DT-04 rule 1 hosted, LITE-UC-03/LITE-EP-13/SET-EP-12 hosted, K3 unmount); run with test/run-v3.mjs.
    file('test/v3/dsh-instance/placement/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 instance placement of the set and fishball-hosted-settings, launch overlay and hosted-child guards (I-PLACE)'),
    file('test/v3/dsh-instance/placement/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 instance placement of the set and fishball-hosted-settings, launch overlay and hosted-child guards (I-PLACE)'),
    // V3 F-STATUS (R-FB-03/04 REM-DT-01, PLAT-DT-02 board only, HOST-DT-03 rule 10, Q-G1, R-FB-09, R-EXT-14, R-FB-10); run with test/run-v3.mjs.
    file('test/v3/fishball-core/status/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core status, strip view, set completeness and guards notice (F-STATUS)'),
    file('test/v3/fishball-core/status/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core status, strip view, set completeness and guards notice (F-STATUS)'),
    // V3 F-UI (UI-UC-01…08, UI-DT-01, UI-EP-01/02, UI-BVA-01, UI-ST-01…03; R-FB-14, Q-G1, Q-G2 = A); run with test/run-v3.mjs.
    file('test/v3/fishball-ui/package/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-ui package, patch rows, ui-seam, browser half and core/ui system rows (F-UI)'),
    file('test/v3/fishball-ui/package/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-ui package, patch rows, ui-seam, browser half and core/ui system rows (F-UI)'),
    // V3 F-ASKCARD (PLAT-UC-07, ASK-UC/EP/BVA/DT/ST; R-FB-11, R-UI-12, R-CON-05/06/08, Q3 = A); run with test/run-v3.mjs.
    file('test/v3/fishball-core/asks/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core ask cards: ask_user, the asks service and routes (F-ASKCARD)'),
    file('test/v3/fishball-core/asks/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core ask cards: ask_user, the asks service and routes (F-ASKCARD)'),
  ]),
  excludedCases: Object.freeze([
    // Plan §3.3: the rewritten K1 cases describe V2 D1-D3; these five are the actual MCP server/push obligations.
    cases('packages/dsh-connector/test/instance-ext/k1.test.mjs', '^K1-MCP-(UC-01-A1|EP-05|EP-08|DT-02|ST-04) ', DISPOSITION.v3, 'MCP manager, push and server (MCP-S3/MCP-SERVER)'),
    // Fishball decision 3: deliverInbox array cases stay; only these board/MCP TODOs defer.
    cases('packages/dsh-instance/test/instance-ext/x0-c.test.mjs', '^XC-UC-(01-A5|05-M) ', DISPOSITION.v3, 'board context, MCP routing'),
    // Fishball decision 1.
    cases('test/body-soul-i2-launch.test.mjs', '^I2-M-(DT-0[1-5]|EP-01) ', DISPOSITION.nonGatingMigration, 'launch-settings migration; V2 assumes a fresh or V2-only child profile'),
    // Design §1.0 / REMOVE-WD (2bf3769c): fishball-hosted-settings, which served the child's
    // /api/dsh-instance/restart route, is removed. Restart and Retry move to dsh-instance's own
    // settings page, built and tested by I-HOST. The other R3 rows (incl. R3-UC-01 Retry) still run.
    cases('test/v2-r3-native-access.test.mjs', '^R3-UC-02 row: restart from the child settings view ', DISPOSITION.withdrawn, 'child-settings Restart route removed with fishball-hosted-settings (design §1.0, REMOVE-WD); successor I-HOST'),
    // Requirements 1.41 Q-G4 = A (U-DRAW): there are no inline records in main-DSH sessions, so
    // dsh-connector-ui has no `record.*` words for the child page's records to equal. These rows
    // compared the two dictionaries; the child page's own records keep their other I7 cases.
    cases('test/body-soul-i7-records.test.mjs', '^I7-ROW-EP-0[1-57] ', DISPOSITION.withdrawn, "main-DSH inline records removed (requirements 1.41 Q-G4 = A, U-DRAW): no connector record.* words to compare"),
    // R-UI-10 (1.20) and Q-G4 = A (1.41), drawn by U-DRAW: the fixed "Hand over to Fishball" /
    // "Take back from Fishball" / "Managed by Fishball" labels no longer exist (Hand over names its
    // principal) and the records chunk is gone, so these served-bundle label rows describe removed
    // UI. U-DRAW's suite checks the new labels; the rest of each file still runs.
    cases('test/managed-marks.test.mjs', '^MKS-09 ', DISPOSITION.withdrawn, 'fixed Hand over labels and the records chunk removed (R-UI-10, requirements 1.41 Q-G4 = A); successor U-DRAW'),
    cases('test/managed-ways.test.mjs', '^MGD-16 ', DISPOSITION.withdrawn, 'fixed Hand over labels and the records chunk removed (R-UI-10, requirements 1.41 Q-G4 = A); successor U-DRAW'),
    cases('test/messaging-inbound.test.mjs', '^MSG-13 ', DISPOSITION.withdrawn, 'fixed Hand over labels and the records chunk removed (R-UI-10, requirements 1.41 Q-G4 = A); successor U-DRAW'),
    cases('test/body-soul-i9-lang.test.mjs', "^(I9 U6 record words equal the connector's|precondition: the connector source has record\\.\\* words|I9-U6-0[1-5] )", DISPOSITION.withdrawn, "main-DSH inline records removed (requirements 1.41 Q-G4 = A, U-DRAW): no connector record.* words to compare"),
  ]),
})

/** The V2 run: root files plus nested V2 suites (repo-relative, sorted, unique) and the case skip patterns. */
export function selectV2Suites() {
  const files = [...new Set([...rootSuiteFiles(), ...V2_SUITES.nested])].sort()
  return { files, skipPatterns: V2_SUITES.excludedCases.map((entry) => entry.pattern) }
}
