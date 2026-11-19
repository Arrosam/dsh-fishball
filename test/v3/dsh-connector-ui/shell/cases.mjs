/**
 * U-SHELL black-box cases (v3-tasks.md W3 U-SHELL; .runtime/reports/v3-w3-briefs.md "U-SHELL test
 * brief"): UIM-UC-01 (integration part), UIM-UC-04 (U-SHELL's parts: one Fishball sidebar entry, no
 * `sidebar.brand.*` slot, no answer control), UIM-EP-01, UIM-EP-02, UIM-DT-01 rows 3, 7, 7b, and
 * R-EMBED's U-SHELL row. Requirements R-UI-01/02/03/04/06/08/09/11/12, R-ARCH-02/04, R-HOST-06,
 * S4-Q1 A; design §4.1–§4.2; the K3 freeze of `dshInstanceChild` and `dshConnectorHandover`.
 *
 * Techniques, Use Cases first: UC (UIM-UC-01, UIM-UC-04: each flow is a test), EP (UIM-EP-01 by
 * service availability, UIM-EP-02 by main-page hostname), BVA (the hostname set's edges: the case
 * variant `LOCALHOST` and the 127/8 neighbour `127.0.0.2`; exactly one `instance-missing` line),
 * decision table (UIM-DT-01 rows 3, 7, 7b: each column of a row is an assertion) and state
 * transition (UIM-UC-01 E1: failed → Retry → ready, framed again; A1: language change → a new
 * admission).
 *
 * Levels: unit (the split's file layout, the status-line link, the shipped code's slot names) and
 * integration (a real host DSH per scenario with embed-UI linked and the K3 services faked,
 * world.mjs; a scripted main page, ../embed/page.mjs). Integration rows run at integration only
 * (FBTEST_V3_INTEGRATION=1). The real locator is I-HOST's (W4): rows that need a real child and its
 * cookie redemption are `todo` for X-MATRIX / E2E-UI; marks, the latch and the records are U-MARKS',
 * U-ATTN's and U-RECORDS'. Amended for U-DRAW (requirements 1.34, 1.38 Q-U1, 1.41 Q-G3 / Q-G4, #77):
 * no records, the Retry link instead of the Retry button and route, connector-missing without a
 * local connector, and the services answer's connector / page flags; each changed row names its
 * requirement in a comment.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { until } from '../../../support/host.mjs'
import { findAll, textOf } from '../../../support/rp-recommend.mjs'
import { ownFiles, tokensOf, unitOf } from '../../fishball-core/package/static.mjs'
import { assertParams, contracts, member, serviceMembers, vocabulary } from '../../contract/k3-host-services/contracts.mjs'
import { FOLDER } from '../../contract/k3-host-services/constants.mjs'
import { caseTest, integrationCase as gatedCase } from '../../contract/package-boundaries/cases.mjs'
import { WITHDRAWN_BY, withdrawnRow } from '../../dsh-instance/host/withdrawn.mjs'
import { JS_FILE, V3 } from '../../contract/package-boundaries/constants.mjs'
import {
  API_VERSION, BUDGET, CHILD, CONNECTOR_DIAGNOSTIC, DIAGNOSTIC, FAKE, HOST_CONSTANTS, HOST_TRICK, HTTP_OK, INTEGRATION, LATER, LOOPBACK, PAGE_NAME,
  REFUSAL_TEXT, RETRY, RETRY_LABEL, ROUTE, ROUTE_REFUSAL, SCENARIO, SERVICE, SLOT, SPLIT, V2_ANSWER_ROUTE,
} from './constants.mjs'
import {
  bySlot, frameTarget, homeFilesHolding, hostFor, launchToken, logLines, logMessages, openFishball, openPage, pageEntries, press, recordsOf,
  refusalCode, registerCleanup, routeCall,
} from './world.mjs'

const integrationCase = (sdk, id, row, title, fn) => gatedCase(sdk, id, row, title, fn, INTEGRATION)
const clientDir = () => path.join(V3.embed.dir, ...SPLIT.clientDir)
const FISHBALL_OWNER = (owner) => owner.startsWith('fishball-')

/** Embed-UI's shipped JS files with their tokens. */
async function embedTokens() {
  const unit = await unitOf(V3.embed.name)
  assert.ok(unit, V3.embed.name + ' is not packed')
  return tokensOf(fs.realpathSync(V3.embed.dir), ownFiles(unit).filter((f) => JS_FILE.test(f)))
}

/** Lines of the host's log that carry the diagnostic. */
const diagnostics = (setup) => logMessages(setup).filter((text) => text.includes(DIAGNOSTIC))
/** Q-U1: lines of the host's log that carry connector-missing. */
const connectorDiagnostics = (setup) => logMessages(setup).filter((text) => text.includes(CONNECTOR_DIAGNOSTIC))
const admissions = (setup) => recordsOf(setup, FAKE.kind.admit)
const registeredTools = (setup) => recordsOf(setup, FAKE.kind.register)

/** #77: the Retry link (labelled Retry) of a not-ready window, and embed-UI's former Retry button, which must be gone. */
const retryLinkOf = (opened) => findAll(opened.view.tree(), (n) => n.props[RETRY.link] !== undefined && textOf(n).includes(RETRY_LABEL))[0]
const frameRetries = (opened) => findAll(opened.view.tree(), (n) => n.props[RETRY.button] !== undefined)

/** UIM-EP-02 rows 1, 2, 3, 5: the frame host is the page's lower-cased loopback name, with the child's port. */
async function assertFramedUnder(t, sdk, name) {
  const setup = await hostFor(sdk, SCENARIO.all)
  const before = admissions(setup).length
  const page = await openPage(t, sdk, setup, name)
  const opened = await openFishball(page)
  assert.ok(opened.iframe(), 'no frame under ' + name.display + '; the page shows ' + JSON.stringify(opened.text()))
  const asked = admissions(setup).slice(before)
  assert.ok(asked.length >= 1, 'embed-UI asked the locator for no admission')
  assert.deepEqual([...new Set(asked.map((a) => a.hostname))], [name.expected], 'admissions asked for another hostname')
  const target = await frameTarget(page, opened.iframe())
  assert.equal(target.hostname, name.expected, 'frame host ' + target.host)
  assert.equal(Number(target.port), CHILD.port, 'the frame keeps the child\'s own port')
  return { setup, page, opened, target, asked }
}

/** UIM-EP-02 row 4 and its BVA neighbour: no frame, the refusal text, and the locator never asked for that name. */
async function assertRefusedUnder(t, sdk, name) {
  const setup = await hostFor(sdk, SCENARIO.all)
  const before = admissions(setup).length
  const page = await openPage(t, sdk, setup, name)
  const opened = await openFishball(page, { done: (text) => text.includes(REFUSAL_TEXT) })
  assert.equal(opened.iframe(), null, 'a frame was produced under ' + name.display)
  assert.ok(opened.text().includes(REFUSAL_TEXT), 'no refusal text; the page shows ' + JSON.stringify(opened.text()))
  assert.deepEqual(admissions(setup).slice(before).filter((a) => !a.refused), [], 'a ticket was minted for ' + name.display)
}

/** The partition's registrations: what embed-UI drew, and that no client plugin failed (R-ARCH-02). */
async function shellOf(t, sdk, scenario) {
  const setup = await hostFor(sdk, scenario)
  const page = await openPage(t, sdk, setup)
  assert.deepEqual(page.failed(), [], 'failed client plugins (R-ARCH-02)')
  return { setup, page, regs: page.embed() }
}
// Q-G3: with a connector but no usable instance the Fishball page is the hint, never a frame.
const HINT_TEXT = "No Fishball child instance is running here. Open your Fishball instance's own page."
async function assertHintPage(page) {
  const opened = await openFishball(page, { done: (text) => text.includes(HINT_TEXT) })
  assert.equal(opened.iframe(), null, 'a frame without a usable instance')
  assert.ok(opened.text().includes(HINT_TEXT), 'no hint; the page shows ' + JSON.stringify(opened.text()))
}
/** Q-U1: without a local connector embed-UI draws nothing and contributes nothing. */
const assertNothingDrawn = (setup, regs) => {
  assert.deepEqual(regs.map((r) => r.slot), [], 'embed-UI drew something without a local connector')
  assert.deepEqual(registeredTools(setup), [], 'tools contributed without a local connector')
}
const assertOneEntry = (regs) => assert.equal(bySlot(regs, SLOT.entry).length, 1, 'embed-UI\'s sidebar entries: ' + JSON.stringify(bySlot(regs, SLOT.entry).map((r) => r.id ?? r.key)))
const assertNoBrand = (regs) => assert.deepEqual(regs.filter((r) => SLOT.brand.includes(r.slot)), [], 'a sidebar.brand.* slot was used')
// V2 never deployed (U-WIRE): settings belong inside the child; embed-UI has no card.
const assertNoCard = (regs) => assert.equal(regs.some((r) => SLOT.card.includes(r.slot)), false, 'embed-UI registered a Plugins card')
/** K3's literal vocabulary of a type, by a member path from a service (`dshInstanceChild.admit` → request → field). */
const k3 = () => contracts(FOLDER.hostServices)
const admitField = (field) => {
  const [request] = assertParams(member(serviceMembers(k3(), SERVICE.child), 'admit'), { params: 1 })
  return [...vocabulary(k3(), k3().m.members(request.type).get(field).type).literals].sort()
}
const admitErrorCodes = () => [...vocabulary(k3(), 'AdmitErrorCode').literals].sort()
/** A refusal's status and code (relayed route contract). */
const assertRefusal = (answer, refusal) => {
  assert.equal(answer.status, refusal.status, 'status ' + answer.status + ' ' + answer.text)
  assert.equal(refusalCode(answer), refusal.code, 'code in ' + answer.text)
}
const assertDiagnostics = (setup, n) => assert.equal(diagnostics(setup).length, n, DIAGNOSTIC + ' lines: ' + JSON.stringify(diagnostics(setup)))
/** Q-U1: exactly `n` connector-missing lines, and then no instance-missing line. */
const assertConnectorMissing = (setup, n) => {
  assert.equal(connectorDiagnostics(setup).length, n, CONNECTOR_DIAGNOSTIC + ' lines: ' + JSON.stringify(connectorDiagnostics(setup)))
  assertDiagnostics(setup, 0)
}

export function registerUShellCases(sdk) {
  registerCleanup()

  // ============================================================ UIM-UC-01: the user opens the hosted Fishball page
  integrationCase(sdk, 'UIM-UC-01', 'main 1', 'C + I + U: the sidebar shows the Fishball entry, from embed-UI', async (t) => {
    const { regs } = await shellOf(t, sdk, SCENARIO.all)
    assertOneEntry(regs)
  })
  integrationCase(sdk, 'UIM-UC-01', 'main 2', "opening the entry asks the locator for one admission and frames the child at the child's own origin", async (t) => {
    const { setup, asked, target } = await assertFramedUnder(t, sdk, PAGE_NAME.ipv4)
    const last = asked.at(-1)
    assert.ok(CHILD.views.includes(last.view), 'admit view ' + last.view)
    assert.equal(last.lang, CHILD.langs.en, 'admit lang')
    assert.equal(target.origin, `http://${PAGE_NAME.ipv4.expected}:${CHILD.port}`, 'the frame is not at the child origin the locator names')
    assert.ok(target.href.includes(last.ticket), 'the frame does not navigate to the URL admit returned')
    assert.ok(admissions(setup).length >= asked.length)
  })
  // #77, R-UI-03 amended: the window carries the child's state outside the frame; Retry is on the instance's own settings page.
  integrationCase(sdk, 'UIM-UC-01', 'main 3', 'the child state is drawn outside the frame; embed-UI draws no Retry button of its own (#77)', async (t) => {
    const page = await openPage(t, sdk, await hostFor(sdk, SCENARIO.all))
    const opened = await openFishball(page)
    const frame = opened.iframe()
    assert.ok(frame, 'no frame')
    const state = findAll(opened.view.tree(), (n) => n.props[RETRY.state] === CHILD.ready)[0]
    assert.ok(state, 'no state tag outside the frame')
    assert.ok(!findAll(frame.children, () => true).includes(state), 'the state sits inside the frame')
    assert.deepEqual(frameRetries(opened), [], 'a Retry button on the window')
  })
  integrationCase(sdk, 'UIM-UC-01', 'A1', 'the user changes the UI language → embed-UI asks for a new admission in that language', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.all)
    const page = await openPage(t, sdk, setup)
    await openFishball(page)
    const before = admissions(setup).length
    await page.setLang(CHILD.langs.zh)
    await until(() => admissions(setup).length > before, BUDGET.readyMs, BUDGET.pollMs)
    const after = admissions(setup).slice(before)
    assert.ok(after.length >= 1, 'no new admission after the language change')
    assert.equal(after.at(-1).lang, CHILD.langs.zh)
  })
  caseTest(sdk, 'UIM-UC-01', 'A2', 'the frame reloads → a new ticket is used; the old one is rejected by the child', null, LATER.child)
  // #77, R-UI-03 amended: the Retry link opens the instance's settings page (pluginNavigation.openBundle); embed-UI never retries the child itself.
  integrationCase(sdk, 'UIM-UC-01', 'E1', 'the child is down → the status shows its code; the Retry link opens the instance settings page; embed-UI does not retry', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.down)
    const page = await openPage(t, sdk, setup)
    const opened = await openFishball(page, { done: (text) => text.includes(CHILD.exited) })
    assert.ok(opened.text().includes(CHILD.exited), 'the status does not show ' + CHILD.exited + '; it shows ' + JSON.stringify(opened.text()))
    assert.equal(opened.iframe(), null, 'a frame while the child is down')
    assert.deepEqual(frameRetries(opened), [], 'a Retry button on the window')
    const link = retryLinkOf(opened)
    assert.ok(link, 'no Retry link while the child is down')
    await press(link)
    assert.deepEqual(page.navigations, [{ openBundle: RETRY.bundle }], 'the Retry link did not open the instance settings page')
    assert.deepEqual(recordsOf(setup, FAKE.kind.retry), [], 'embed-UI retried the child itself')
  })
  caseTest(sdk, 'UIM-UC-01', 'E2', 'replaying a used admission URL is rejected by the child', null, LATER.child)
  integrationCase(sdk, 'UIM-UC-01', 'E3', 'the host DSH opened as localhost → the frame is under localhost with the child\'s port', async (t) => {
    await assertFramedUnder(t, sdk, PAGE_NAME.localhost)
  })
  integrationCase(sdk, 'UIM-UC-01', 'E4', 'the host DSH reached under a non-loopback name → no frame; "Open DSH at 127.0.0.1 to use Fishball"', async (t) => {
    await assertRefusedUnder(t, sdk, PAGE_NAME.tunnel)
  })
  caseTest(sdk, 'UIM-UC-01', 'E5', 'a ticket minted for localhost is redeemed at 127.0.0.1 → refused by the child', null, LATER.child)
  integrationCase(sdk, 'UIM-UC-01', 'post', 'no credential in the frame URL: neither the host\'s launch token nor its session cookie, and no token parameter', async (t) => {
    const { setup, page, target } = await assertFramedUnder(t, sdk, PAGE_NAME.ipv4)
    const cookieValues = page.cookie.split('; ').map((c) => c.slice(c.indexOf('=') + 1)).filter(Boolean)
    for (const secret of [launchToken(setup), ...cookieValues]) assert.ok(!decodeURIComponent(target.href).includes(secret), 'the frame URL carries a host credential')
    assert.equal(target.searchParams.has('token'), false, 'the frame URL has a token parameter')
  })
  integrationCase(sdk, 'UIM-UC-01', 'post', 'no ticket in any log line of the host DSH', async (t) => {
    const { setup, asked } = await assertFramedUnder(t, sdk, PAGE_NAME.ipv4)
    const tickets = asked.map((a) => a.ticket).filter(Boolean)
    assert.deepEqual(logLines(setup).filter((line) => tickets.some((ticket) => line.includes(ticket))), [], 'log lines carry a ticket')
  })
  integrationCase(sdk, 'UIM-UC-01', 'post', 'embed-UI stores no secret: nothing it writes to page storage or cookies, and no file of the DSH home, holds a ticket or a host credential (R-UI-06)', async (t) => {
    const { setup, page, asked } = await assertFramedUnder(t, sdk, PAGE_NAME.ipv4)
    const secrets = [launchToken(setup), ...asked.map((a) => a.ticket).filter(Boolean)]
    assert.deepEqual(page.storage.writes.filter((w) => secrets.some((s) => w.value.includes(s) || w.key.includes(s))), [], 'page storage writes')
    assert.deepEqual(page.storage.writes.filter((w) => w.area === 'cookie'), [], 'embed-UI set a cookie from the page')
    assert.deepEqual(homeFilesHolding(setup.home, asked.map((a) => a.ticket).filter(Boolean)), [], 'home files holding a ticket')
  })
  caseTest(sdk, 'UIM-UC-01', 'post', 'the child turns the ticket into its own login cookie; the page, its network responses and the child never see the launch token', null, LATER.child)

  // ============================================================ UIM-UC-04 (U-SHELL's parts): the one Fishball entry, no answer control
  integrationCase(sdk, 'UIM-UC-04', 'main 1', "C + I + U: the sidebar shows exactly one Fishball entry; DSH's brand mark and name are untouched (no sidebar.brand.* slot)", async (t) => {
    const { regs } = await shellOf(t, sdk, SCENARIO.all)
    assertOneEntry(regs)
    assertNoBrand(regs)
  })
  // Q-G4 = A (R-UI-12 amended, R-UI-13 withdrawn): embed-UI registers no ask_agent view and no record at all, so no answer control can exist.
  integrationCase(sdk, 'UIM-UC-04', 'main 2', 'embed-UI registers no tool.call.toolview and no conversation.chat.node entry (no records, no answer control; Q-G4)', async (t) => {
    const { regs } = await shellOf(t, sdk, SCENARIO.all)
    assert.deepEqual(regs.filter((r) => SLOT.records.includes(r.slot)).map((r) => r.slot), [])
  })
  caseTest(sdk, 'UIM-UC-04', 'main 2', "embed-UI's shipped code names no ask_agent answer route (the V2 Allow once / Reject path is gone; R-UI-12)", async () => {
    const hits = [...await embedTokens()].filter(([, t]) => t.strings.some((s) => s.includes(V2_ANSWER_ROUTE))).map(([file]) => file)
    assert.deepEqual(hits, [])
  })
  // Q-G4 = A: the former records rows (main 2 record row, main 3 answer, A1 records in C + U) are withdrawn; the row above covers their absence.
  integrationCase(sdk, 'UIM-UC-04', 'A1', 'C + U (no instance): the sidebar entry is still the one fish entry; the brand is unchanged', async (t) => {
    const { regs } = await shellOf(t, sdk, SCENARIO.connector)
    assertOneEntry(regs)
    assertNoBrand(regs)
  })
  integrationCase(sdk, 'UIM-UC-04', 'A2', 'without embed-UI: no Fishball package registers anything in the host page, so S1 shows DSH\'s generic tool-call row', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.noEmbed)
    const page = await openPage(t, sdk, setup)
    assert.deepEqual(page.registrations.filter((r) => FISHBALL_OWNER(r.owner)), [])
  })
  // UIM-UC-04 E1 (Fishball cannot decide → the card is in Fishball's own page only) is F-ASKCARD's: test/v3/fishball-core/asks/cases.mjs.
  caseTest(sdk, 'UIM-UC-04', 'post', "embed-UI's shipped code names no sidebar.brand.* slot", async () => {
    const hits = [...await embedTokens()].filter(([, t]) => t.strings.some((s) => SLOT.brand.includes(s))).map(([file]) => file)
    assert.deepEqual(hits, [])
  })
  for (const scenario of [SCENARIO.none, SCENARIO.child, SCENARIO.connector]) {
    integrationCase(sdk, 'UIM-UC-04', 'post', `no sidebar.brand.* registration with services "${scenario.label}"`, async (t) => {
      assertNoBrand((await shellOf(t, sdk, scenario)).regs)
    })
  }

  // ============================================================ UIM-EP-01: what embed-UI registers by service availability
  // Q-U1 (requirements 1.38): with no service there is no local connector: one connector-missing error replaces instance-missing.
  integrationCase(sdk, 'UIM-EP-01', 1, 'no service → embed-UI registers nothing and logs exactly one connector-missing line, no instance-missing (Q-U1)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.none)
    assertNothingDrawn(setup, regs)
    assertConnectorMissing(setup, 1)
  })
  // Q-U1, R-UI-09 amended: an instance with no local connector → one error, nothing shown (the page, frame and card included).
  integrationCase(sdk, 'UIM-EP-01', 2, 'dshInstanceChild only → nothing drawn, no tools; one connector-missing line (Q-U1, R-UI-09)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.child)
    assertNothingDrawn(setup, regs)
    assertConnectorMissing(setup, 1)
  })
  // Q-G3 (requirements 1.41): with the connector but no instance the Fishball page is the hint, not absent.
  integrationCase(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → the Fishball page is the hint, no frame; one instance-missing line (Q-G3)', async (t) => {
    const { setup, page } = await shellOf(t, sdk, SCENARIO.connector)
    await assertHintPage(page)
    assertDiagnostics(setup, 1)
  })
  // Requirements 1.34: marks, Hand over, the fish light and the tools are covered by U-DRAW against the real UI backend.
  caseTest(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → marks and Hand over', null, LATER.marks)
  caseTest(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → fish light and the contributed tools', null, LATER.attn)
  // #77: the ready window has no Retry button; Retry is on the instance's settings page.
  integrationCase(sdk, 'UIM-EP-01', 4, 'all services → the child frame, no Plugins card (V2 never deployed (U-WIRE)); no Retry button; no diagnostic', async (t) => {
    const { setup, page, regs } = await shellOf(t, sdk, SCENARIO.all)
    assert.equal(pageEntries(page).length, 1, 'Fishball page entries')
    assertNoCard(regs)
    const opened = await openFishball(page)
    assert.ok(opened.iframe(), 'no frame')
    assert.deepEqual(frameRetries(opened), [], 'a Retry button on the window')
    assertDiagnostics(setup, 0)
    assertConnectorMissing(setup, 0)
  })
  caseTest(sdk, 'UIM-EP-01', 4, 'all services → marks, Hand over, fish light and the contributed tools too', null, LATER.marks)
  // Q-G3: an older locator with the connector is "no instance": the hint.
  integrationCase(sdk, 'UIM-EP-01', 5, 'an older locator (apiVersion 2) is treated as absent: the hint, no frame, exactly one instance-missing line (K, Q-G3)', async (t) => {
    const { setup, page } = await shellOf(t, sdk, SCENARIO.older)
    await assertHintPage(page)
    assert.deepEqual(recordsOf(setup, FAKE.kind.admit), [], 'the older locator was asked for an admission')
    assertDiagnostics(setup, 1)
  })
  // Q-G3: as #3, the hint instead of no page.
  integrationCase(sdk, 'UIM-EP-01', 6, 'the instance row disabled (no dshInstanceChild) with the connector services → as #3: the hint, one instance-missing line', async (t) => {
    const { setup, page } = await shellOf(t, sdk, SCENARIO.disabled)
    await assertHintPage(page)
    assertDiagnostics(setup, 1)
  })
  caseTest(sdk, 'UIM-EP-01', 6, 'the instance disabled → marks, Hand over, fish light and the tools, as #3', null, LATER.marks)
  // Q-U1: the once-per-activation diagnostic is now connector-missing.
  integrationCase(sdk, 'UIM-EP-01', '1 (BVA)', 'opening the page twice in one process adds no second connector-missing line', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.none)
    await openPage(t, sdk, setup)
    await openPage(t, sdk, setup)
    assertConnectorMissing(setup, 1)
  })

  // ============================================================ UIM-EP-02: main page hostname and the child frame
  for (const name of [PAGE_NAME.ipv4, PAGE_NAME.localhost, PAGE_NAME.ipv6, PAGE_NAME.upper]) {
    integrationCase(sdk, 'UIM-EP-02', name.row, `page opened as ${name.display} → the frame and its ticket use ${name.expected} with the child's port`, async (t) => {
      await assertFramedUnder(t, sdk, name)
    })
  }
  for (const name of [PAGE_NAME.tunnel, PAGE_NAME.edge]) {
    integrationCase(sdk, 'UIM-EP-02', name.row, `page opened as ${name.display} → no frame; "${REFUSAL_TEXT}"; no ticket minted`, async (t) => {
      await assertRefusedUnder(t, sdk, name)
    })
  }
  caseTest(sdk, 'UIM-EP-02', '1–3, 5', 'the framed child page loads under each loopback name (a real child and its cookie redemption)', null, LATER.child)
  caseTest(sdk, 'UIM-EP-02', 6, 'a ticket replayed under another loopback name is refused (bound to its hostname)', null, LATER.child)

  // ============================================================ UIM-DT-01 rows 3, 7, 7b
  // Q-U1: U alone has no local connector: one connector-missing error replaces instance-missing.
  integrationCase(sdk, 'UIM-DT-01', 3, 'U alone: no page, marks, light or tools; connector-missing once (Q-U1)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.none)
    assertNothingDrawn(setup, regs)
    assertConnectorMissing(setup, 1)
  })
  // Q-U1, R-UI-09 amended: an instance with no local connector → one error and nothing shown; the child's page opens from the instance's settings page.
  integrationCase(sdk, 'UIM-DT-01', 7, 'I + U, remote target (no local connector): nothing drawn, no tools; connector-missing once (Q-U1, R-UI-09)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.child)
    assertNothingDrawn(setup, regs)
    assertConnectorMissing(setup, 1)
  })
  caseTest(sdk, 'UIM-DT-01', 7, 'I + U: no relay over the lifecycle wire', null, LATER.relay)
  // Q-U1: a blank target means no local connector either, so embed-UI draws nothing; the target status is the instance's settings page's (R-UI-03 amended).
  integrationCase(sdk, 'UIM-DT-01', '7b', 'I + U, target blank (no local connector): nothing drawn; connector-missing once (Q-U1)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.blank)
    assertNothingDrawn(setup, regs)
    assertConnectorMissing(setup, 1)
  })

  // ============================================================ R-EMBED's U-SHELL row, and the split's definition of done
  // Q-U1: with none it logs connector-missing; the one sidebar entry needs the connector (with the locator).
  integrationCase(sdk, 'R-EMBED', 'U-SHELL', 'the host row follows the services at runtime: with none it loads, draws nothing and logs one connector-missing; with the connector and the locator it draws the one sidebar entry, no brand override', async (t) => {
    const none = await shellOf(t, sdk, SCENARIO.none)
    assert.deepEqual(none.regs, [])
    assertConnectorMissing(none.setup, 1)
    const all = await shellOf(t, sdk, SCENARIO.all)
    assertOneEntry(all.regs)
    assertNoBrand(all.regs)
  })
  // Q-G4 = A: client.records.js is gone from the split.
  caseTest(sdk, 'U-SHELL', 'split', 'the client is split into the flat parts client.shell.js, client.marks.js, client.attention.js beside client.js (no folders); client.records.js is gone (Q-G4)', () => {
    const entries = fs.readdirSync(clientDir(), { withFileTypes: true })
    assert.deepEqual(entries.filter((e) => e.isDirectory()).map((e) => e.name), [], 'folders in ' + SPLIT.clientDir.join('/'))
    const names = entries.map((e) => e.name)
    for (const file of [SPLIT.entry, ...SPLIT.parts]) assert.ok(names.includes(file), 'missing ' + file)
    assert.ok(!names.includes(SPLIT.withdrawn), SPLIT.withdrawn + ' still exists')
  })
  caseTest(sdk, 'U-SHELL', 'split', "every file beside embed-UI's client entry is a chunk DSH serves (client.<name>.js)", () => {
    assert.deepEqual(fs.readdirSync(clientDir()).filter((f) => f !== SPLIT.entry && !SPLIT.chunk.test(f)), [])
  })
  caseTest(sdk, 'U-SHELL', 'split', 'every part is shipped in the embed-UI package', async () => {
    const files = ownFiles(await unitOf(V3.embed.name))
    for (const file of SPLIT.parts) assert.ok(files.includes([...SPLIT.clientDir, file].join('/')), 'not shipped: ' + file)
  })
  withdrawnRow(sdk, 'U-SHELL', 'O6', 'the status-line symlink keeps its name and target and still resolves to the instance\'s file', WITHDRAWN_BY.page)
  // V2 never deployed (U-WIRE): embed-UI has no Plugins card; model sync belongs to the instance.

  // ============================================================ the host half's constants equal the frozen contracts
  // Requirements 1.34: embed-UI follows dshConnectorUi (C-UI-BACKEND's UI_SERVICE), no longer dshConnectorHandover. Values are compared,
  // not member names, because the host half's own key names are not part of the contract.
  caseTest(sdk, 'U-SHELL', 'K3/K2', "the host half's restated service names and apiVersion equal K3's dshInstanceChild, C-UI-BACKEND's dshConnectorUi and K2's TOOLS_API; it names no dshConnectorHandover", async () => {
    const { SERVICE: own } = await import(pathToFileURL(HOST_CONSTANTS.file).href)
    const { TOOLS_API } = await import(pathToFileURL(HOST_CONSTANTS.tools).href)
    const { UI_SERVICE } = await import(pathToFileURL(HOST_CONSTANTS.ui).href)
    assert.ok(serviceMembers(k3(), SERVICE.child).get('apiVersion'), 'K3 declares ' + SERVICE.child)
    assert.equal(UI_SERVICE.name, SERVICE.ui)
    const names = Object.values(own)
    for (const name of [SERVICE.child, SERVICE.ui, TOOLS_API.service]) assert.ok(names.includes(name), 'the host half does not name ' + name)
    assert.ok(!names.includes(HOST_CONSTANTS.handoverService), 'the host half still names ' + HOST_CONSTANTS.handoverService)
    assert.equal(own.apiVersion, TOOLS_API.version)
    assert.deepEqual([...vocabulary(k3(), serviceMembers(k3(), SERVICE.child).get('apiVersion').type).literals], [String(own.apiVersion)], 'K3 apiVersion')
  })
  caseTest(sdk, 'U-SHELL', 'K3', "the host half's loopback names, admit views, langs and refusal codes equal K3's LoopbackHostname, AdmitView, AdmitLang and AdmitErrorCode", async () => {
    const { LOOPBACK: hostnames, ADMIT } = await import(pathToFileURL(HOST_CONSTANTS.file).href)
    assert.deepEqual([...hostnames.hostnames].sort(), admitField('hostname'))
    assert.deepEqual([...hostnames.hostnames].sort(), [...LOOPBACK].sort())
    assert.deepEqual([...ADMIT.views].sort(), admitField('view'))
    assert.deepEqual([...ADMIT.langs].sort(), admitField('lang'))
    assert.deepEqual(Object.values(ADMIT.code).sort(), admitErrorCodes())
  })

  // ============================================================ the host routes (relayed surface; design §4.2)
  // U-DRAW: availability is {connector, page} (no legacy flag: V2 never deployed (U-WIRE)); the handover and tools flags are gone; ui is {} without the connector.
  integrationCase(sdk, 'U-SHELL', 'routes', 'GET services answers which services are usable now, per UIM-EP-01 partition (connector ⇔ a v1 dshConnectorUi; page ⇔ a v1 locator; no handover or tools flag)', async () => {
    for (const [scenario, expected] of [[SCENARIO.none, [false, false]], [SCENARIO.child, [false, true]], [SCENARIO.connector, [true, false]], [SCENARIO.all, [true, true]], [SCENARIO.older, [true, false]], [SCENARIO.disabled, [true, false]]]) {
      const answer = await routeCall(await hostFor(sdk, scenario), PAGE_NAME.ipv4, 'GET', ROUTE.services)
      assert.equal(answer.status, HTTP_OK, scenario.label + ': ' + answer.text)
      assert.deepEqual(ROUTE.servicesKeys.filter((k) => !(k in answer.json)), [], scenario.label + ' keys')
      assert.deepEqual(ROUTE.removedKeys.filter((k) => k in answer.json), [], scenario.label + ' still has V2 flags')
      assert.deepEqual([answer.json.connector, answer.json.page], expected, scenario.label)
      if (!answer.json.connector) assert.deepEqual(answer.json.ui, {}, scenario.label + ' ui without a connector')
    }
  })
  integrationCase(sdk, 'U-SHELL', 'routes', 'GET child/status re-serves the locator: {ok, status, target} with its state and code', async () => {
    const answer = await routeCall(await hostFor(sdk, SCENARIO.downRead), PAGE_NAME.ipv4, 'GET', ROUTE.status)
    assert.equal(answer.status, HTTP_OK, answer.text)
    assert.deepEqual(ROUTE.statusKeys.filter((k) => !(k in answer.json)), [])
    assert.deepEqual([answer.json.status.state, answer.json.status.code], [CHILD.failed, CHILD.exited])
  })
  // Q-U1: without a usable connector the child/* routes answer connector-missing; instance-missing is left for a connector without a usable locator.
  for (const [scenario, refusal] of [[SCENARIO.none, ROUTE_REFUSAL.connectorMissing], [SCENARIO.child, ROUTE_REFUSAL.connectorMissing], [SCENARIO.connector, ROUTE_REFUSAL.missing], [SCENARIO.older, ROUTE_REFUSAL.missing]]) {
    integrationCase(sdk, 'U-SHELL', 'routes', `${scenario.label}: every child/* route answers ${refusal.status} ${refusal.code}`, async () => {
      const setup = await hostFor(sdk, scenario)
      for (const key of ROUTE.child) {
        const method = key === 'status' ? 'GET' : 'POST'
        assertRefusal(await routeCall(setup, PAGE_NAME.ipv4, method, ROUTE[key], method === 'POST' ? { view: CHILD.views[0], lang: CHILD.langs.en } : undefined), refusal)
      }
    })
  }
  for (const name of [PAGE_NAME.ipv4, PAGE_NAME.localhost, PAGE_NAME.ipv6, PAGE_NAME.upper]) {
    integrationCase(sdk, 'UIM-EP-02', name.row, `POST child/admit under ${name.display} → {ok, url} at ${name.expected} with the child's port; the locator got that hostname`, async () => {
      const setup = await hostFor(sdk, SCENARIO.all)
      const answer = await routeCall(setup, name, 'POST', ROUTE.admit, { view: CHILD.views[0], lang: CHILD.langs.en })
      assert.equal(answer.status, HTTP_OK, answer.text)
      assert.equal(new URL(answer.json.url).hostname, name.expected)
      assert.equal(Number(new URL(answer.json.url).port), CHILD.port)
      assert.equal(admissions(setup).at(-1).hostname, name.expected)
    })
  }
  for (const name of [PAGE_NAME.tunnel, PAGE_NAME.edge]) {
    integrationCase(sdk, 'UIM-EP-02', name.row, `POST child/admit under ${name.display} → 409 hostname-refused; the locator is not asked`, async () => {
      const setup = await hostFor(sdk, SCENARIO.all)
      const before = admissions(setup).length
      assertRefusal(await routeCall(setup, name, 'POST', ROUTE.admit, { view: CHILD.views[0], lang: CHILD.langs.en }), ROUTE_REFUSAL.hostname)
      assert.equal(admissions(setup).length, before)
    })
  }
  for (const [label, hostHeader] of Object.entries(HOST_TRICK)) {
    integrationCase(sdk, 'UIM-EP-02', '4 (EP)', `a Host that names localhost only after parsing (${label}) → refused (409 hostname-refused, or DSH's own fence first); no ticket`, async () => {
      const setup = await hostFor(sdk, SCENARIO.all)
      const before = admissions(setup).length
      const answer = await routeCall(setup, PAGE_NAME.tunnel, 'POST', ROUTE.admit, { view: CHILD.views[0], lang: CHILD.langs.en }, { hostHeader })
      // DSH's browser-trust fence (dsh-client-connection, both SDKs) runs before any route handler and
      // may refuse such a Host itself; when the request does reach embed-UI, the relayed code applies.
      assert.notEqual(answer.status, HTTP_OK, answer.text)
      if (answer.status === ROUTE_REFUSAL.hostname.status) assert.equal(refusalCode(answer), ROUTE_REFUSAL.hostname.code)
      assert.equal(admissions(setup).length, before, 'a ticket was minted')
    })
  }
  for (const [label, body] of [['an extra hostname key', { view: CHILD.views[0], lang: CHILD.langs.en, hostname: PAGE_NAME.tunnel.header }], ['a missing lang', { view: CHILD.views[0] }], ['an unknown view', { view: 'fbtest-view', lang: CHILD.langs.en }], ['an unknown lang', { view: CHILD.views[0], lang: 'fr' }]]) {
    integrationCase(sdk, 'U-SHELL', 'routes', `POST child/admit with ${label} → 400 invalid-request; no ticket`, async () => {
      const setup = await hostFor(sdk, SCENARIO.all)
      const before = admissions(setup).length
      assertRefusal(await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.admit, body), ROUTE_REFUSAL.invalid)
      assert.equal(admissions(setup).length, before)
    })
  }
  // #77, R-UI-03 amended: there is no child/retry route; the child stays failed until the instance's own Retry.
  integrationCase(sdk, 'UIM-UC-01', 'E1', 'POST child/admit while the child is down → 409 not-ready; there is no child/retry route; the locator is not retried', async () => {
    const setup = await hostFor(sdk, SCENARIO.down)
    assertRefusal(await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.admit, { view: CHILD.views[0], lang: CHILD.langs.en }), ROUTE_REFUSAL.notReady)
    const retry = await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.retry, {})
    assert.notEqual(retry.status, HTTP_OK, 'child/retry answered: ' + retry.text)
    assert.deepEqual(recordsOf(setup, FAKE.kind.retry), [], 'the locator was retried')
  })
  integrationCase(sdk, 'U-SHELL', 'routes', 'the routes are owner-only: without the owner\'s cookie, services and admit mint nothing', async () => {
    const setup = await hostFor(sdk, SCENARIO.all)
    const before = admissions(setup).length
    for (const [method, route] of [['GET', ROUTE.services], ['POST', ROUTE.admit]]) {
      const response = await fetch(setup.host.origin + route, { method, headers: { 'content-type': 'application/json' }, body: method === 'POST' ? JSON.stringify({ view: CHILD.views[0], lang: CHILD.langs.en }) : undefined })
      const text = await response.text()
      assert.notEqual(response.status, HTTP_OK, route + ' answered a stranger: ' + text)
    }
    assert.equal(admissions(setup).length, before, 'a ticket was minted for a stranger')
  })
  // Unchanged oracle; the scenario gained the connector (Q-U1) so the older locator is the only absent service.
  integrationCase(sdk, 'UIM-EP-01', 5, 'GET services with an older locator: page false, so the client registers no frame (apiVersion 2 is absent)', async () => {
    const answer = await routeCall(await hostFor(sdk, SCENARIO.older), PAGE_NAME.ipv4, 'GET', ROUTE.services)
    assert.equal(answer.json?.page, false, answer.text)
    assert.ok(API_VERSION.older !== API_VERSION.current)
  })
}
