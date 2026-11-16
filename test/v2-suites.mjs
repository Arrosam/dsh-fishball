/**
 * The pre-V3 suite selection: the root test/*.test.mjs files plus the nested suites below, and the
 * case skip patterns test/run-affected.mjs passes to their run. V3 suites (test/v3/**) are not in it.
 * Mixed suites keep their other clauses and skip the deferred or withdrawn ones by case ID.
 * REMOVE-V2 (V2 was never deployed; the user, 2026-11-16) removed the V2 release run (run-v2.mjs,
 * test:v2) and its release bookkeeping (the excluded-file list, which only that run printed and the
 * V2B-SUITE checks read), so a new V3 suite needs no line here.
 *
 * Skip patterns go to node --test --test-skip-pattern, which applies each one to every selected
 * file. Every pattern is anchored on a case-ID prefix that only its own file uses, so it cannot
 * hide another file's case; `file` names that owner for review.
 */
import { rootSuiteFiles } from './support/suite-runner.mjs'

export const DISPOSITION = Object.freeze({
  v3: 'v3',
  /** The row's subject was removed by an approved design change; the reason names the successor task. */
  withdrawn: 'withdrawn',
})

const cases = (path, pattern, disposition, reason) => Object.freeze({ file: path, pattern, disposition, reason })

export const V2_SUITES = Object.freeze({
  /** Non-root suites in the pre-V3 run; test/*.test.mjs come from the root runner's own rule. */
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
  excludedCases: Object.freeze([
    // Plan §3.3: the rewritten K1 cases describe V2 D1-D3; these five are the actual MCP server/push obligations.
    cases('packages/dsh-connector/test/instance-ext/k1.test.mjs', '^K1-MCP-(UC-01-A1|EP-05|EP-08|DT-02|ST-04) ', DISPOSITION.v3, 'MCP manager, push and server (MCP-S3/MCP-SERVER)'),
    // Fishball decision 3: deliverInbox array cases stay; only these board/MCP TODOs defer.
    cases('packages/dsh-instance/test/instance-ext/x0-c.test.mjs', '^XC-UC-(01-A5|05-M) ', DISPOSITION.v3, 'board context, MCP routing'),
    // Requirements 1.41 Q-G4 = A (U-DRAW): there are no inline records in main-DSH sessions, so
    // dsh-connector-ui has no `record.*` words for the child page's records to equal. These rows
    // compared the two dictionaries; the child page's own records keep their other I7 cases.
    cases('test/body-soul-i7-records.test.mjs', '^I7-ROW-EP-0[1-57] ', DISPOSITION.withdrawn, "main-DSH inline records removed (requirements 1.41 Q-G4 = A, U-DRAW): no connector record.* words to compare"),
    cases('test/body-soul-i9-lang.test.mjs', "^(I9 U6 record words equal the connector's|precondition: the connector source has record\\.\\* words|I9-U6-0[1-5] )", DISPOSITION.withdrawn, "main-DSH inline records removed (requirements 1.41 Q-G4 = A, U-DRAW): no connector record.* words to compare"),
  ]),
})

/** The pre-V3 run: root files plus the nested suites (repo-relative, sorted, unique) and the case skip patterns. */
export function selectV2Suites() {
  const files = [...new Set([...rootSuiteFiles(), ...V2_SUITES.nested])].sort()
  return { files, skipPatterns: V2_SUITES.excludedCases.map((entry) => entry.pattern) }
}
