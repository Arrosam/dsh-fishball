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
})

const file = (path, disposition, reason) => Object.freeze({ file: path, disposition, reason })
const cases = (path, pattern, disposition, reason) => Object.freeze({ file: path, pattern, disposition, reason })

export const V2_SUITES = Object.freeze({
  /** Non-root suites in the V2 run; test/*.test.mjs come from the root runner's own rule. */
  nested: Object.freeze([
    'packages/connector/test/instance-ext/k1.test.mjs',
    // Manager workspace attach (7.A blank composer) and its background-activation policy
    // (review-opus/v2-manager-ws-2).
    'packages/instance/test/instance-ext/manager-attach-background.test.mjs',
    'packages/instance/test/instance-ext/manager-workspace.test.mjs',
    // PB/PBS: page setup unwinding and teardown (R-A1–R-A3), settings shared-card mount ownership (R-B1/R-B2);
    // review-opus/v2-page-boot findings F1/F2.
    'packages/instance/test/instance-ext/page-boot-unwind.test.mjs',
    // PAGE (7.A page-open ensure) and READY (appReady gate) implementation suites, plan §3 owners.
    'packages/instance/test/instance-ext/page-open-session.test.mjs',
    // PAGE: the first selection waits for DSH's session list to carry the manager (black-box, from requirements).
    'packages/instance/test/instance-ext/page-open-listed.test.mjs',
    'packages/instance/test/instance-ext/ready-gate.test.mjs',
    // PBS: the settings half of the PB pair (shared main-card mounts, R-B1/R-B2).
    'packages/instance/test/instance-ext/settings-shared-mount.test.mjs',
    'packages/instance/test/instance-ext/x0-c-held-context.test.mjs',
    'packages/instance/test/instance-ext/x0-c.test.mjs',
    'test/instance-ext/x0-i.test.mjs',
    'test/instance-ext/x0-s.test.mjs',
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
    file('packages/watchdog/test/instance-ext/wd-1.test.mjs', DISPOSITION.v3, 'Watchdog skeleton (WD-1)'),
    file('test/verification/wd1-native.test.mjs', DISPOSITION.v3, 'Watchdog WD-1 native schema/activation supplement'),
    file('packages/board/test/instance-ext/b1.test.mjs', DISPOSITION.v3, 'board skeleton (B1)'),
    file('packages/board/test/instance-ext/b11-search.test.mjs', DISPOSITION.v3, 'board_search (B11)'),
    file('docs/verification/v2-board-search-accept/supplemental.test.mjs', DISPOSITION.v3, 'board_search acceptance supplement'),
    file('packages/fold-notify/test/instance-ext/fn-1.test.mjs', DISPOSITION.v3, 'fold-notify skeleton (FN-1)'),
    file('test/verification/w0-cordis.test.mjs', DISPOSITION.v3, 'FN-1/B1 plugin activation supplement'),
    file('test/instance-ext/x0-b.test.mjs', DISPOSITION.v3, 'bundled placement and bundled admin switch (X17/X18, Q2-Q4)'),
    // Fishball decision 4: whole file, not a clause split. Its runnable cases need the X15 claim API
    // (approvals.claim/card, supervision.register). XA-DT-02's V2 behaviour (no watchdog → the request
    // reaches Fishball) is covered by root APR-01 (approvals-broker), RTE-02/RTE-07 (approvals-routing)
    // and XI-EP-02 (approval inbox item to the manager). For V3: on baseline b5b1475 this file never
    // exits (>10 min seen by PAGE; killed at 181 s here after all 16 failures + 3 TODOs were reported),
    // so an open handle outlives its tests.
    file('test/instance-ext/x0-a.test.mjs', DISPOSITION.v3, 'Watchdog per-session approval claims (X15); V2 approval routing is covered by root approvals-* suites'),
    file('test/instance-ext/x0-g.test.mjs', DISPOSITION.v3, 'Watchdog supervision side agents (X13)'),
    file('packages/connector/test/instance-ext/mcp-feasibility.test.mjs', DISPOSITION.v3, 'MCP-S1/S2/S3 feasibility'),
    file('test/native-production-preflight.test.mjs', DISPOSITION.ownRunner, 'fails closed outside test/native-production-runner.mjs'),
    // V3 R-SHARED (PLAT-EP-07 static rows, HOST-EP-03 rows 1–2); run with test/run-v3.mjs.
    file('test/v3/shared/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-shared package boundaries (R-SHARED)'),
    file('test/v3/shared/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-shared package boundaries (R-SHARED)'),
    // V3 K2 (freeze of fishball-connector/tools, K-flagged EXT cases); run with test/run-v3.mjs.
    file('test/v3/k2/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 contribution contract freeze (K2)'),
    file('test/v3/k2/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 contribution contract freeze (K2)'),
    // V3 R-CORE (HOST-UC-08 V2-mechanism part, HOST-EP-03 rows 1–4); run with test/run-v3.mjs.
    file('test/v3/core/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core package and settings-section extension point (R-CORE)'),
    file('test/v3/core/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core package and settings-section extension point (R-CORE)'),
    // V3 K1 (freeze of fishball-connector/mcp-schema, K-flagged AUTH/NAME/EVT/PLAT/WATCH cases); run with test/run-v3.mjs.
    file('test/v3/k1/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 MCP schema freeze (K1)'),
    file('test/v3/k1/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 MCP schema freeze (K1)'),
    // V3 K3 (host-only service contracts, core's settings-section point; HAND/HOST/UIM K flags); run with test/run-v3.mjs.
    file('test/v3/k3/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 host-only service and core contract freeze (K3)'),
    file('test/v3/k3/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 host-only service and core contract freeze (K3)'),
    // V3 R-EMBED (PLAT-EP-03 rows 1, 3, 5, HOST-EP-03 row 5); run with test/run-v3.mjs.
    file('test/v3/embed/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-embed-ui package (R-EMBED)'),
    file('test/v3/embed/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-embed-ui package (R-EMBED)'),
    // V3 F-LINK (REM-UC-02 Fishball side, REM-EP-01, REM-DT-01); run with test/run-v3.mjs.
    file('test/v3/f-link/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core MCP link (F-LINK)'),
    file('test/v3/f-link/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core MCP link (F-LINK)'),
    // V3 F-INTERCEPT (EVT-UC-02/03, EVT-EP-03/05, EVT-DT-02/03/04, EVT-ST-02); run with test/run-v3.mjs.
    file('test/v3/f-intercept/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core interception, acceptance ledger and wake (F-INTERCEPT)'),
    file('test/v3/f-intercept/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core interception, acceptance ledger and wake (F-INTERCEPT)'),
    // V3 F-GUARDS (PLAT-UC-04 composition, PLAT-DT-04, UIM-DT-01 rows 9/10b/14, HOST-DT-03 rule 6, HOST-UC-08 A3/E2); run with test/run-v3.mjs.
    file('test/v3/f-guards/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core guard rows, override report and self-reorder (F-GUARDS)'),
    file('test/v3/f-guards/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core guard rows, override report and self-reorder (F-GUARDS)'),
    // V3 C-EXT (EXT-UC-01…03, EXT-EP-01…04, EXT-BVA-01…04, EXT-DT-01/02, EXT-ST-01, K2's C-EXT rows); run with test/run-v3.mjs.
    file('test/v3/c-ext/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector contribution service (C-EXT)'),
    file('test/v3/c-ext/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector contribution service (C-EXT)'),
    // V3 C-PAIR (AUTH-UC-02/04, AUTH-EP-03/06, AUTH-DT-02, AUTH-BVA-05, AUTH-ST-01 rows 2–4/11/13/14, NAME-UC-01/03, NAME-EP-01…04, NAME-BVA-01/03, NAME-DT-01/02, NAME-ST-01 rows 1–7); run with test/run-v3.mjs.
    file('test/v3/c-pair/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector pair store, pair / set_name and names (C-PAIR)'),
    file('test/v3/c-pair/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector pair store, pair / set_name and names (C-PAIR)'),
    // V3 C-HTTP (PLAT-UC-01, PLAT-EP-01, PLAT-BVA-02, REM-UC-03, REM-EP-02/03, EVT-EP-04 rows 3–4, AUTH-EP-02 rows 1, 2, 11–14, K1b-UC-01/DT-05/BVA-02/ST-02); run with test/run-v3.mjs.
    file('test/v3/c-http/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector MCP route, request gate and limits (C-HTTP)'),
    file('test/v3/c-http/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector MCP route, request gate and limits (C-HTTP)'),
    // V3 C-TOOLS (PLAT-UC-02, PLAT-EP-02 rows 1–6/4a, PLAT-ST-01, WATCH-UC-03, WATCH-UC-01 E1, WATCH-ST-01 rows 7–8); run with test/run-v3.mjs.
    file('test/v3/c-tools/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector core MCP tools and result envelope (C-TOOLS)'),
    file('test/v3/c-tools/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector core MCP tools and result envelope (C-TOOLS)'),
    // V3 C-MAILBOX (EVT-UC-01, EVT-EP-02, EVT-EP-04 rows 1/2/5/6, EVT-BVA-01/02, EVT-ST-01); run with test/run-v3.mjs.
    file('test/v3/c-mailbox/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector per-pair mailbox, poll/ack and hints (C-MAILBOX)'),
    file('test/v3/c-mailbox/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector per-pair mailbox, poll/ack and hints (C-MAILBOX)'),
    file('test/v3/schema-value/index.test.mjs', DISPOSITION.v3, 'V3 connector schema-value validateValue wrapper (C-MAILBOX, shared with C-EXT)'),
    // V3 C-TOKENS (AUTH-UC-01, AUTH-EP-04, AUTH-BVA-03, AUTH-DT-05, AUTH-ST-01 rows 1, 5–10, 12); run with test/run-v3.mjs.
    file('test/v3/c-tokens/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector token entries, generation, minimum length, revocation signal and cleanup (C-TOKENS)'),
    file('test/v3/c-tokens/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector token entries, generation, minimum length, revocation signal and cleanup (C-TOKENS)'),
    // V3 C-OAUTH (AUTH-UC-03/06/07/08, AUTH-EP-01/02/05/07/09, AUTH-BVA-01/02/06, AUTH-DT-01, AUTH-ST-02, store/limiter rows of AUTH-ST-04/05, K1b-UC-02/DT-06, C-PAIR's token-endpoint rows); run with test/run-v3.mjs.
    file('test/v3/c-oauth/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector authorization server: token store, failure limiter, bearer verifier, token endpoint (C-OAUTH)'),
    file('test/v3/c-oauth/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector authorization server: token store, failure limiter, bearer verifier, token endpoint (C-OAUTH)'),
    // V3 C-OAUTH-WEB (AUTH-UC-10, AUTH-DT-07/08/09, AUTH-ST-04/05, AUTH-BVA-07/08, AUTH-EP-08/10, K1b-DT-07); run with test/run-v3.mjs.
    file('test/v3/c-oauth-web/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector browser authorization: approval listener, CIMD, code and refresh grants (C-OAUTH-WEB)'),
    file('test/v3/c-oauth-web/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector browser authorization: approval listener, CIMD, code and refresh grants (C-OAUTH-WEB)'),
    // V3 C-ROUTE (EVT-EP-01, EVT-EP-04 end to end, EVT-DT-01, WATCH-UC-01/02, WATCH-EP-01, WATCH-ST-01 rows 1–6, HAND-EP-01, HAND-DT-01/02, HAND-ST-01, HAND-UC-02 service part, PLAT-UC-03); run with test/run-v3.mjs.
    file('test/v3/c-route/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 connector managed state, routing, watch = manage and hand-over service (C-ROUTE)'),
    file('test/v3/c-route/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 connector managed state, routing, watch = manage and hand-over service (C-ROUTE)'),
    // V3 F-FACADE (EXT-DT-03 E6/E8 Fishball side, EXT-UC-02 A3, EXT-UC-04 A1 core side); run with test/run-v3.mjs.
    file('test/v3/f-facade/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 fishball-core bridge façade, list_changed refresh, contributed count and X8 attention (F-FACADE)'),
    file('test/v3/f-facade/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 fishball-core bridge façade, list_changed refresh, contributed count and X8 attention (F-FACADE)'),
    // V3 FEAT-PEERS (PLAT-EP-04 rows 1, 2, 4, PLAT-UC-06 main and A1, PLAT-BVA-01, EXT-UC-04 A1; the board export was dropped by the user, 2026-11-15); run with test/run-v3.mjs.
    file('test/v3/feat-peers/sdk-0.2.1-rc.5.test.mjs', DISPOSITION.v3, 'V3 board and fold-notify without core, board retention and fold-notify attention fallback (FEAT-PEERS)'),
    file('test/v3/feat-peers/sdk-0.2.2-rc.1.test.mjs', DISPOSITION.v3, 'V3 board and fold-notify without core, board retention and fold-notify attention fallback (FEAT-PEERS)'),
  ]),
  excludedCases: Object.freeze([
    // Fishball decision 2: XS-DT-10 states the V2 behaviour (no Watchdog bundle → gate off).
    cases('test/instance-ext/x0-s.test.mjs', '^XS-(?!DT-10 )', DISPOSITION.v3, 'Watchdog supervision, start rule and send gate (X14/X16/X19)'),
    // Plan §3.3: XI-EP-01/02 are core delivery; claims, batcher and the permission marker are Watchdog/fold consumers.
    cases('test/instance-ext/x0-i.test.mjs', '^XI-(?!EP-0[12] )', DISPOSITION.v3, 'Watchdog claim/hold and fold batching (X9)'),
    // Plan §3.3: the rewritten K1 cases describe V2 D1-D3; these five are the actual MCP server/push obligations.
    cases('packages/connector/test/instance-ext/k1.test.mjs', '^K1-MCP-(UC-01-A1|EP-05|EP-08|DT-02|ST-04) ', DISPOSITION.v3, 'MCP manager, push and server (MCP-S3/MCP-SERVER)'),
    // Fishball decision 3: deliverInbox array cases stay; only these board/Watchdog/fold-image/MCP TODOs defer.
    cases('packages/instance/test/instance-ext/x0-c.test.mjs', '^XC-UC-(01-A5|03-F|04-A1|05-M) ', DISPOSITION.v3, 'board context, Watchdog failure, fold image integration, MCP routing'),
    // Fishball decision 1.
    cases('test/body-soul-i2-launch.test.mjs', '^I2-M-(DT-0[1-5]|EP-01) ', DISPOSITION.nonGatingMigration, 'launch-settings migration; V2 assumes a fresh or V2-only child profile'),
  ]),
})

/** The V2 run: root files plus nested V2 suites (repo-relative, sorted, unique) and the case skip patterns. */
export function selectV2Suites() {
  const files = [...new Set([...rootSuiteFiles(), ...V2_SUITES.nested])].sort()
  return { files, skipPatterns: V2_SUITES.excludedCases.map((entry) => entry.pattern) }
}
