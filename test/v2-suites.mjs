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
    // Final V2 page/readiness/origin/lite/settings cases (070b88e). Unobservable seams stay TODO.
    'test/v2-page-cases/lite.test.mjs',
    'test/v2-page-cases/page.test.mjs',
    'test/v2-page-cases/pg-origin.test.mjs',
    'test/v2-page-cases/ready.test.mjs',
    // SET main-only model sync (user decision 2026-11-11): child-initiated sync is refused, the main card works.
    // RP: the child-only Fishball Recommended tab (T-RP cases 6cbe9e3), one registration per SDK.
    'test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs',
    'test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs',
  ]),
  excludedCases: Object.freeze([
    // Plan §3.3: the rewritten K1 cases describe V2 D1-D3; these five are the actual MCP server/push obligations.
    cases('packages/dsh-connector/test/instance-ext/k1.test.mjs', '^K1-MCP-(UC-01-A1|EP-05|EP-08|DT-02|ST-04) ', DISPOSITION.v3, 'MCP manager, push and server (MCP-S3/MCP-SERVER)'),
    // The user (2026-11-16, relayed by the I-HOST dev session): "现在第二版根本没有实际部署的情况，把它当作一次发布前的设计变更，
    // 第三版其实就是第一版". V2 was never deployed, so V2-only rows that I-HOST's approved changes break are
    // withdrawn here (V3 assertions are untouched). I-HOST removed the V2 connector binding
    // (src/host/binding.js: connector-missing, attachInstance, the instance-only codes) and the V2 embed
    // broker (/fishball/embed/, replaced by the instance's own Open Fishball, Q7); the instance's Config
    // gained targetUrl (R-HOST-05); its status route answers {state, code, detail, notice}; the moved
    // admin service has no currentModel hook into core (Q-G7, R-ARCH-10).
    cases('test/body-soul-i1c-status.test.mjs', '^I1c-', DISPOSITION.withdrawn, 'the V2 connector binding (contractStatus, INSTANCE_STATES/CODES) removed by I-HOST; V2 never deployed (user, 2026-11-16)'),
    cases('test/body-soul-i2-launch.test.mjs', '^I2-C-P-01 ', DISPOSITION.withdrawn, 'Config gained targetUrl (R-HOST-05, I-HOST); successor test/v3/dsh-instance/host HOST-EP-01 R-HOST-05; V2 never deployed (user, 2026-11-16)'),
    cases('test/e1-p1-connector-departure.test.mjs', '^P1-ST-0[12] ', DISPOSITION.withdrawn, 'connector-missing removed with the V2 binding (I-HOST: the instance starts with or without a connector); V2 never deployed (user, 2026-11-16)'),
    cases('test/v2-r2-start-detail.test.mjs', '^R2-UC-01/02/03 ', DISPOSITION.withdrawn, 'the status/Retry answer is {state, code, detail, notice} (I-HOST settings page routes); V2 never deployed (user, 2026-11-16)'),
    cases('test/v2-r4-exit-race.test.mjs', '^R4-EXIT-05 ', DISPOSITION.withdrawn, 'connector-missing (the connector disabled during a start) removed with the V2 binding (I-HOST); V2 never deployed (user, 2026-11-16)'),
  ]),
})

/** The pre-V3 run: root files plus the nested suites (repo-relative, sorted, unique) and the case skip patterns. */
export function selectV2Suites() {
  const files = [...new Set([...rootSuiteFiles(), ...V2_SUITES.nested])].sort()
  return { files, skipPatterns: V2_SUITES.excludedCases.map((entry) => entry.pattern) }
}
