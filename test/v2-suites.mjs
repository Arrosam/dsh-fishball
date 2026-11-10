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
