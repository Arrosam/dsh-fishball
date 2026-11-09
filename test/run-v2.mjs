/**
 * The V2 release suite: npm run test:v2, or
 *   /opt/homebrew/bin/node test/run-v2.mjs [extra node --test args]
 * Runs test/v2-suites.mjs's selection; V3 suites stay in the repository but out of this run.
 */
import { runSuites } from './support/suite-runner.mjs'
import { V2_SUITES, selectV2Suites } from './v2-suites.mjs'

// node --test omits --test-skip-pattern matches from its report (they are not counted as skipped),
// so the run states every deferral itself; a release report must not read them as absent or passed.
for (const { file, disposition, reason } of V2_SUITES.excludedFiles) console.log(`V2 excluded file [${disposition}] ${file}: ${reason}`)
for (const { file, pattern, disposition, reason } of V2_SUITES.excludedCases) console.log(`V2 excluded cases [${disposition}] ${file} /${pattern}/: ${reason}`)
const { files, skipPatterns } = selectV2Suites()
process.exit(runSuites(files, [...skipPatterns.map((pattern) => '--test-skip-pattern=' + pattern), ...process.argv.slice(2)]))
