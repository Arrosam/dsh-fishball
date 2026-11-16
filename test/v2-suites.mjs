/**
 * The pre-V3 suite selection: the root test/*.test.mjs files plus the nested suites below, and the
 * case skip patterns test/run-affected.mjs passes to their run. V3 suites (test/v3/**) are not in it.
 * Mixed suites keep their other clauses and skip the deferred or withdrawn ones by case ID.
 * REMOVE-V2 (V2 was never deployed; the user, 2026-11-16) removed the V2 release run (run-v2.mjs,
 * test:v2) and its release bookkeeping (the excluded-file list, which only that run printed and the
 * V2B-SUITE checks read), so a new V3 suite needs no line here. REMOVE-V2b deleted the withdrawn rows
 * from their files ("第三版其实就是第一版": V2-only rows are withdrawn, not skipped), so only the K1
 * owner rows below remain. The file goes when no pre-V3 root or nested suite remains.
 *
 * Skip patterns go to node --test --test-skip-pattern, which applies each one to every selected
 * file. Every pattern is anchored on a case-ID prefix that only its own file uses, so it cannot
 * hide another file's case; `file` names that owner for review.
 */
import { rootSuiteFiles } from './support/suite-runner.mjs'

export const DISPOSITION = Object.freeze({
  v3: 'v3',
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
    // Page/origin/lite cases (070b88e) of the Fishball page fishball-ui now ships. Unobservable seams stay TODO.
    // REMOVE-V2b deleted the V2 child-web boots (child-boot*). READY's catalogue stays: core's
    // manager keeps that gate (src/manager/service.js).
    'test/v2-page-cases/lite.test.mjs',
    'test/v2-page-cases/page.test.mjs',
    'test/v2-page-cases/pg-origin.test.mjs',
    'test/v2-page-cases/ready.test.mjs',
    // RP: the child-only Fishball Recommended tab (T-RP cases 6cbe9e3), one registration per SDK.
    'test/v2-recommendation/sdk-0.2.1-rc.5.test.mjs',
    'test/v2-recommendation/sdk-0.2.2-rc.1.test.mjs',
  ]),
  excludedCases: Object.freeze([
    // Plan §3.3: the rewritten K1 cases describe V2 D1-D3; these five are the actual MCP server/push obligations.
    cases('packages/dsh-connector/test/instance-ext/k1.test.mjs', '^K1-MCP-(UC-01-A1|EP-05|EP-08|DT-02|ST-04) ', DISPOSITION.v3, 'MCP manager, push and server (MCP-S3/MCP-SERVER)'),
  ]),
})

/** The pre-V3 run: root files plus the nested suites (repo-relative, sorted, unique) and the case skip patterns. */
export function selectV2Suites() {
  const files = [...new Set([...rootSuiteFiles(), ...V2_SUITES.nested])].sort()
  return { files, skipPatterns: V2_SUITES.excludedCases.map((entry) => entry.pattern) }
}
