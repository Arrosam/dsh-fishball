/**
 * E-FIX-3 (F-FIX-3 leftover) black-box rows: `createLinkCredentials` loads its MCP client itself
 * when no `sdk` option is given (Connect's discovery and the saved-grant token manager). When that
 * load fails it logs ONE `warn(LINK_SAVE.text.failed, LINK_MCP.clientImport, codeOf(error))` on
 * `ctx.logger(LINK_SAVE.logger)` per failed load attempt and rethrows (Connect reports
 * unavailable / failed as before); no secret is logged; a successful load logs nothing; a supplied
 * `sdk` is never imported (requirement relayed by Fishball, 2026-11-17).
 *
 * Level: integration, the F-LINK-SAVE world (subject.mjs) with `noSdk` and a recording logger, over
 * the real DSH credential store and dsh-authorization of each SDK. The fault is the link suite's
 * in-process resolve hook (../link/import-fault.mjs: every import of the client from core's package
 * throws the chosen value while armed, and counts the attempts), and the oracle for one warning is
 * the link suite's (../link/log-privacy.mjs). "One per failed load attempt" is checked as: the
 * import warnings equal the attempts the hook saw while armed, and that is at least one per begin.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { countClientImport, failClientImport } from '../link/import-fault.mjs'
import { LINK_MCP, LINK_SAVE } from '../link/constants.mjs'
import { CODE_THROW, THROWN, assertNoSecret, logRecorder } from '../link/log-privacy.mjs'
import { CONNECT, LINK, SUBJECT } from './constants.mjs'
import { browser } from './fakes.mjs'
import { linkSaveWorld, untilTrue } from './subject.mjs'

const C = CONNECT.state
const show = (v) => JSON.stringify(v)
const importWarning = (code) => [LINK_SAVE.text.failed, LINK_MCP.clientImport, code]
/** The import warnings among everything logged (any logger name, any level, for the count). */
const importLines = (logs) => logs.filter((l) => l.args[1] === LINK_MCP.clientImport)

/** One begin() while the import may fail: its answer, or the value it rejected with. */
async function beginOnce(w) {
  try { return { answer: await w.connect.begin() } } catch (error) { return { rejected: true, error } }
}
/** "Connect reports unavailable / failed as before": no approval URL, and not authorizing or authorized. */
function assertNoConnect(w, outcome, label) {
  assert.notEqual(outcome.answer?.outcome, SUBJECT.outcome.approvalUrl, `${label}: begin() gave an approval URL: ${show(outcome.answer)}`)
  assert.ok(![C.authorizing, C.authorized].includes(w.connectStatus()?.state), `${label}: Connect is ${show(w.connectStatus())}`)
}
/** Exactly the import warnings `attempts` long, each on `fishball-link` with `code`, and no secret anywhere. */
function assertImportWarnings(w, log, attempts, code, label) {
  const lines = importLines(log.logs)
  assert.ok(attempts >= 1, `${label}: core never asked for its client`)
  assert.deepEqual(lines.map((l) => ({ name: l.name, level: l.level, args: l.args })), Array.from({ length: attempts }, () => ({ name: LINK_SAVE.logger, level: 'warn', args: importWarning(code) })), `${label}: import warnings for ${attempts} failed attempts; all logged ${show(log.logs.map((l) => [l.name, l.level, l.args.map(String)]))}`)
  assertNoSecret(log.logs, [...w.f.planted], label)
}

export function registerImportFaultCases(sdk) {
  // ---------------------------------------------------------------- EFIX3-LS-EP-01: the thrown value → the code logged (Connect's discovery)
  for (const [row, title, make, code] of THROWN) {
    caseTest(sdk, 'EFIX3-LS-EP-01', row, `no sdk option, the client import fails with ${title}: begin() gives no approval URL, one warning (reason LINK_MCP.clientImport, code ${show(code)}) per failed load, no secret`, async (t) => {
      const log = logRecorder()
      const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
      const fault = failClientImport(t, make)
      const outcome = await beginOnce(w)
      assertNoConnect(w, outcome, row)
      assertImportWarnings(w, log, fault.resolves(), code, row)
    })
  }

  // ---------------------------------------------------------------- EFIX3-LS-DT-01: sdk option × import outcome
  caseTest(sdk, 'EFIX3-LS-DT-01', 'rule 1', 'no sdk, the import fails → Connect unavailable / failed as before, one warning per failed load', async (t) => {
    const log = logRecorder()
    const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
    const fault = failClientImport(t, CODE_THROW.make)
    assertNoConnect(w, await beginOnce(w), 'rule 1')
    assertImportWarnings(w, log, fault.resolves(), CODE_THROW.code, 'rule 1')
  })
  caseTest(sdk, 'EFIX3-LS-DT-01', 'rule 2', 'no sdk, the import succeeds → begin() gives the approval URL; no import warning', async (t) => {
    const log = logRecorder()
    const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
    const count = countClientImport(t)
    const outcome = await beginOnce(w)
    assert.equal(outcome.answer?.outcome, SUBJECT.outcome.approvalUrl, show(outcome))
    assert.ok(count.resolves() >= 1, 'core never loaded its client although no sdk was given')
    assert.deepEqual(importLines(log.logs), [], 'a successful load logged')
  })
  caseTest(sdk, 'EFIX3-LS-DT-01', 'rule 3', 'an sdk supplied, the import would fail → never imported, begin() gives the approval URL, no import warning', async (t) => {
    const log = logRecorder()
    const w = await linkSaveWorld(t, sdk, { logger: log.of })
    const fault = failClientImport(t, CODE_THROW.make)
    const outcome = await beginOnce(w)
    assert.equal(outcome.answer?.outcome, SUBJECT.outcome.approvalUrl, show(outcome))
    assert.equal(fault.resolves(), 0, 'core imported its client although one was supplied')
    assert.deepEqual(importLines(log.logs), [], 'a supplied sdk logged')
  })

  // ---------------------------------------------------------------- EFIX3-LS-BVA-01: 1, 2, 3 failing begins
  for (const begins of [1, 2, 3]) {
    caseTest(sdk, 'EFIX3-LS-BVA-01', `${begins} begins`, `${begins} begin()${begins === 1 ? '' : 's'} while the import fails → as many import warnings as failed loads (at least ${begins}); each begin gives no approval URL`, async (t) => {
      const log = logRecorder()
      const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
      const fault = failClientImport(t, CODE_THROW.make)
      for (let i = 0; i < begins; i++) assertNoConnect(w, await beginOnce(w), `begin ${i + 1}`)
      assert.ok(fault.resolves() >= begins, `${begins} begins asked for the client ${fault.resolves()} times`)
      assertImportWarnings(w, log, fault.resolves(), CODE_THROW.code, `${begins} begins`)
    })
  }

  // ---------------------------------------------------------------- EFIX3-LS-ST-01: failing → recovered (Connect) / saved grant → failing (token manager)
  caseTest(sdk, 'EFIX3-LS-ST-01', '1', 'import failing (one begin, its warnings) → the package loads again: the next begin gives the approval URL and adds no warning', async (t) => {
    const log = logRecorder()
    const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
    const fault = failClientImport(t, CODE_THROW.make)
    assertNoConnect(w, await beginOnce(w), 'failing')
    const failed = fault.resolves()
    assertImportWarnings(w, log, failed, CODE_THROW.code, 'failing')
    countClientImport(t)
    const outcome = await beginOnce(w)
    assert.equal(outcome.answer?.outcome, SUBJECT.outcome.approvalUrl, 'after recovery: ' + show(outcome))
    assert.equal(importLines(log.logs).length, failed, 'a successful load after recovery logged')
  })
  caseTest(sdk, 'EFIX3-LS-ST-01', '2', 'a Connect grant saved with no sdk (no warning) → restart while the import fails: the saved-grant token manager warns once per failed load, the link is not connected, no secret', async (t) => {
    const log = logRecorder()
    const w = await linkSaveWorld(t, sdk, { noSdk: true, logger: log.of })
    const e = w.f.addEntry()
    const b = await w.connect.begin()
    assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, show(b))
    await browser.approve(b.url, { token: e.secret })
    await w.untilConnect(C.authorized)
    await w.untilStatus(LINK.state.connected)
    assert.deepEqual(importLines(log.logs), [], 'a successful load logged')
    const fault = failClientImport(t, CODE_THROW.make)
    await w.restart()
    // The restarted core needs its client for the saved grant's access token.
    await untilTrue(() => fault.resolves() > 0)
    assert.ok(fault.resolves() >= 1, 'the restarted core never loaded its client for the saved grant')
    assert.notEqual(w.status()?.state, LINK.state.connected, 'connected without the client: ' + show(w.status()))
    // Stop core first so no backoff retry lands between counting the loads and the warnings.
    await w.stop()
    assertImportWarnings(w, log, fault.resolves(), CODE_THROW.code, 'token manager')
  })
}
