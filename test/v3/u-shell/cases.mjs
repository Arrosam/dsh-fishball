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
 * U-ATTN's and U-RECORDS'.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { until } from '../../support/host.mjs'
import { findAll, textOf } from '../../support/rp-recommend.mjs'
import { ownFiles, tokensOf, unitOf } from '../core/static.mjs'
import { assertParams, contracts, member, serviceMembers, vocabulary } from '../k3/contracts.mjs'
import { FOLDER } from '../k3/constants.mjs'
import { caseTest, integrationCase as gatedCase } from '../shared/cases.mjs'
import { JS_FILE, V3 } from '../shared/constants.mjs'
import {
  API_VERSION, ASK_TOOL, BUDGET, CHILD, CONTROL, DIAGNOSTIC, FAKE, HOST_CONSTANTS, HOST_TRICK, HTTP_OK, INTEGRATION, LATER, LOOPBACK, PAGE_NAME,
  REFUSAL_TEXT, RETRY_LABEL, ROUTE, ROUTE_REFUSAL, SCENARIO, SERVICE, SLOT, SPLIT, V2_ANSWER_ROUTE,
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
const admissions = (setup) => recordsOf(setup, FAKE.kind.admit)
const registeredTools = (setup) => recordsOf(setup, FAKE.kind.register)

/** Every node of a tree a user could answer through (R-UI-12). */
const controls = (tree) => findAll(tree, (n) => CONTROL.tags.includes(n.tag) || CONTROL.roles.includes(n.props.role) || typeof n.props[CONTROL.handler] === 'function')
/** A pressable whose text is the Retry label, outside every frame (R-UI-03). */
const retryOf = (opened) => opened.pressables().find((n) => textOf(n).includes(RETRY_LABEL))

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
const assertNoPage = (regs) => assert.deepEqual(regs.filter((r) => r.slot === SLOT.main && r.key === SLOT.pageKey), [], 'a Fishball page was registered')
const assertNoMarks = (regs) => assert.deepEqual(regs.filter((r) => SLOT.marks.includes(r.slot)), [], 'marks or Hand over were registered without the hand-over service')
const assertOneEntry = (regs) => assert.equal(bySlot(regs, SLOT.entry).length, 1, 'embed-UI\'s sidebar entries: ' + JSON.stringify(bySlot(regs, SLOT.entry).map((r) => r.id ?? r.key)))
const assertNoBrand = (regs) => assert.deepEqual(regs.filter((r) => SLOT.brand.includes(r.slot)), [], 'a sidebar.brand.* slot was used')
const assertCard = (regs) => assert.ok(regs.some((r) => SLOT.card.includes(r.slot)), 'no Plugins card (' + SLOT.card.join(', ') + ')')
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
  integrationCase(sdk, 'UIM-UC-01', 'main 3', 'the child status and Retry are drawn outside the frame', async (t) => {
    const page = await openPage(t, sdk, await hostFor(sdk, SCENARIO.all))
    const opened = await openFishball(page)
    const retry = retryOf(opened)
    assert.ok(retry, 'no Retry control on the Fishball page')
    const frame = opened.iframe()
    assert.ok(frame, 'no frame')
    assert.ok(!findAll(frame.children, () => true).includes(retry), 'Retry sits inside the frame')
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
  integrationCase(sdk, 'UIM-UC-01', 'E1', 'the child is down → the status shows its code; Retry restarts it and the page is framed again', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.down)
    const page = await openPage(t, sdk, setup)
    const opened = await openFishball(page, { done: (text) => text.includes(CHILD.exited) })
    assert.ok(opened.text().includes(CHILD.exited), 'the status does not show ' + CHILD.exited + '; it shows ' + JSON.stringify(opened.text()))
    assert.equal(opened.iframe(), null, 'a frame while the child is down')
    const retry = retryOf(opened)
    assert.ok(retry, 'no Retry control while the child is down')
    await press(retry)
    await until(() => recordsOf(setup, FAKE.kind.retry).length > 0, BUDGET.readyMs, BUDGET.pollMs)
    assert.deepEqual(recordsOf(setup, FAKE.kind.retry).map((r) => r.from), [CHILD.failed], 'Retry reached the locator once, from failed')
    await until(() => opened.iframe() !== null, BUDGET.readyMs, BUDGET.pollMs)
    assert.ok(opened.iframe(), 'the page was not framed again after Retry made the child ready')
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
  integrationCase(sdk, 'UIM-UC-04', 'main 2', 'an ask_agent view embed-UI registers, if any, renders no answer control at the call and at its result (R-UI-12)', async (t) => {
    const { page } = await shellOf(t, sdk, SCENARIO.all)
    const views = page.entries(SLOT.toolview).filter((e) => e.options.key === ASK_TOOL && page.embed().some((r) => r.options === e.options))
    for (const entry of views) {
      for (const phase of ['start', 'result']) {
        const rendered = await page.mount(entry, { phase, toolName: ASK_TOOL, callId: 'fbtest-call', block: { name: ASK_TOOL, args: {}, input: {}, output: {} }, useDisclosure: () => [false, () => {}], openFile() {}, loadImage: async () => null })
        assert.deepEqual(controls(rendered.tree()).map((n) => n.tag + (n.props.role ? '[' + n.props.role + ']' : '')), [], 'controls in the ask_agent view at ' + phase)
        rendered.unmount()
      }
    }
  })
  caseTest(sdk, 'UIM-UC-04', 'main 2', "embed-UI's shipped code names no ask_agent answer route (the V2 Allow once / Reject path is gone; R-UI-12)", async () => {
    const hits = [...await embedTokens()].filter(([, t]) => t.strings.some((s) => s.includes(V2_ANSWER_ROUTE))).map(([file]) => file)
    assert.deepEqual(hits, [])
  })
  caseTest(sdk, 'UIM-UC-04', 'main 2', "S1's conversation shows a read-only record row for its ask_agent call; S1 waits", null, LATER.records)
  caseTest(sdk, 'UIM-UC-04', 'main 3', 'Fishball answers → the same record shows the answer', null, LATER.records)
  integrationCase(sdk, 'UIM-UC-04', 'A1', 'C + U (no instance): the sidebar entry is still the one fish entry; the brand is unchanged', async (t) => {
    const { regs } = await shellOf(t, sdk, SCENARIO.connector)
    assertOneEntry(regs)
    assertNoBrand(regs)
  })
  caseTest(sdk, 'UIM-UC-04', 'A1', 'C + U: records are drawn as in the main flow', null, LATER.records)
  integrationCase(sdk, 'UIM-UC-04', 'A2', 'without embed-UI: no Fishball package registers anything in the host page, so S1 shows DSH\'s generic tool-call row', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.noEmbed)
    const page = await openPage(t, sdk, setup)
    assert.deepEqual(page.registrations.filter((r) => FISHBALL_OWNER(r.owner)), [])
  })
  caseTest(sdk, 'UIM-UC-04', 'E1', "Fishball cannot decide → nothing appears in H's session for the user to press; the ask shows in Fishball's own page", null, LATER.askCard)
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
  integrationCase(sdk, 'UIM-EP-01', 1, 'no service → embed-UI registers nothing and logs exactly one instance-missing line', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.none)
    assert.deepEqual(regs.map((r) => r.slot), [])
    assert.deepEqual(registeredTools(setup), [])
    assertDiagnostics(setup, 1)
  })
  integrationCase(sdk, 'UIM-EP-01', 2, 'dshInstanceChild only → page, frame, status, Retry and the Plugins card; no marks or Hand over; no instance-missing', async (t) => {
    const { setup, page, regs } = await shellOf(t, sdk, SCENARIO.child)
    assert.equal(pageEntries(page).length, 1, 'Fishball page entries')
    assertCard(regs)
    assertNoMarks(regs)
    const opened = await openFishball(page)
    assert.ok(opened.iframe(), 'no frame')
    assert.ok(retryOf(opened), 'no Retry')
    assert.deepEqual(registeredTools(setup), [], 'tools contributed with no connector')
    assertDiagnostics(setup, 0)
  })
  integrationCase(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → no page and no frame; one instance-missing line', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.connector)
    assertNoPage(regs)
    assertDiagnostics(setup, 1)
  })
  caseTest(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → marks and Hand over', null, LATER.marks)
  caseTest(sdk, 'UIM-EP-01', 3, 'connector services, no dshInstanceChild → fish with dots and the attention tools contributed', null, LATER.attn)
  integrationCase(sdk, 'UIM-EP-01', 4, 'all three services → the page with its frame, status and Retry, and the Plugins card; no instance-missing', async (t) => {
    const { setup, page, regs } = await shellOf(t, sdk, SCENARIO.all)
    assert.equal(pageEntries(page).length, 1, 'Fishball page entries')
    assertCard(regs)
    const opened = await openFishball(page)
    assert.ok(opened.iframe(), 'no frame')
    assert.ok(retryOf(opened), 'no Retry')
    assertDiagnostics(setup, 0)
  })
  caseTest(sdk, 'UIM-EP-01', 4, 'all three services → marks, Hand over, fish with dots and the attention tools too', null, LATER.marks)
  integrationCase(sdk, 'UIM-EP-01', 5, 'an older locator (apiVersion 2) is treated as absent: no page, no frame, exactly one instance-missing line (K)', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.older)
    assertNoPage(regs)
    assert.deepEqual(recordsOf(setup, FAKE.kind.admit), [], 'the older locator was asked for an admission')
    assertDiagnostics(setup, 1)
  })
  integrationCase(sdk, 'UIM-EP-01', 6, 'the instance row disabled (no dshInstanceChild) with the connector services → as #3: no page, one instance-missing line', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.disabled)
    assertNoPage(regs)
    assertDiagnostics(setup, 1)
  })
  caseTest(sdk, 'UIM-EP-01', 6, 'the instance disabled → marks, Hand over, fish with dots and the tools, as #3', null, LATER.marks)
  integrationCase(sdk, 'UIM-EP-01', '1 (BVA)', 'opening the page twice in one process adds no second instance-missing line', async (t) => {
    const setup = await hostFor(sdk, SCENARIO.none)
    await openPage(t, sdk, setup)
    await openPage(t, sdk, setup)
    assertDiagnostics(setup, 1)
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
  integrationCase(sdk, 'UIM-DT-01', 3, 'U alone: no page, marks, dots or tools; instance-missing once', async (t) => {
    const { setup, regs } = await shellOf(t, sdk, SCENARIO.none)
    assertNoPage(regs)
    assertNoMarks(regs)
    assert.deepEqual(regs.map((r) => r.slot), [], 'U alone drew something')
    assert.deepEqual(registeredTools(setup), [], 'tools contributed')
    assertDiagnostics(setup, 1)
  })
  integrationCase(sdk, 'UIM-DT-01', 7, 'I + U, remote target (no local connector): the page with status and Retry; no marks, no tools here', async (t) => {
    const { setup, page, regs } = await shellOf(t, sdk, SCENARIO.child)
    assert.equal(pageEntries(page).length, 1, 'Fishball page entries')
    assertNoMarks(regs)
    assert.deepEqual(registeredTools(setup), [], 'tools contributed with no connector')
    const opened = await openFishball(page)
    assert.ok(opened.iframe(), 'the frame is the local child')
    assert.ok(retryOf(opened), 'no Retry')
  })
  caseTest(sdk, 'UIM-DT-01', 7, 'I + U: the sidebar fish is unlit and never lights (no dots, no latch here)', null, LATER.attn)
  caseTest(sdk, 'UIM-DT-01', 7, 'I + U: no relay over the lifecycle wire', null, LATER.relay)
  integrationCase(sdk, 'UIM-DT-01', '7b', 'I + U, target blank: the page works and the status reports target-unreachable', async (t) => {
    const { page, regs } = await shellOf(t, sdk, SCENARIO.blank)
    assert.equal(pageEntries(page).length, 1, 'Fishball page entries')
    assertNoMarks(regs)
    const opened = await openFishball(page, { done: (text) => text.includes(CHILD.unreachable.code) || text.includes(CHILD.unreachable.state) })
    assert.ok(opened.text().includes(CHILD.unreachable.code) || opened.text().includes(CHILD.unreachable.state), 'no target-unreachable in ' + JSON.stringify(opened.text()))
  })

  // ============================================================ R-EMBED's U-SHELL row, and the split's definition of done
  integrationCase(sdk, 'R-EMBED', 'U-SHELL', 'the host row follows the services at runtime: with none it loads, draws nothing and logs one instance-missing; with the locator it draws the one sidebar entry, no brand override', async (t) => {
    const none = await shellOf(t, sdk, SCENARIO.none)
    assert.deepEqual(none.regs, [])
    assertDiagnostics(none.setup, 1)
    const child = await shellOf(t, sdk, SCENARIO.child)
    assertOneEntry(child.regs)
    assertNoBrand(child.regs)
  })
  caseTest(sdk, 'U-SHELL', 'split', 'the client is split into the flat parts client.shell.js, client.marks.js, client.attention.js, client.records.js beside client.js (no folders)', () => {
    const entries = fs.readdirSync(clientDir(), { withFileTypes: true })
    assert.deepEqual(entries.filter((e) => e.isDirectory()).map((e) => e.name), [], 'folders in ' + SPLIT.clientDir.join('/'))
    const names = entries.map((e) => e.name)
    for (const file of [SPLIT.entry, ...SPLIT.parts]) assert.ok(names.includes(file), 'missing ' + file)
  })
  caseTest(sdk, 'U-SHELL', 'split', "every file beside embed-UI's client entry is a chunk DSH serves (client.<name>.js)", () => {
    assert.deepEqual(fs.readdirSync(clientDir()).filter((f) => f !== SPLIT.entry && !SPLIT.chunk.test(f)), [])
  })
  caseTest(sdk, 'U-SHELL', 'split', 'every part is shipped in the embed-UI package', async () => {
    const files = ownFiles(await unitOf(V3.embed.name))
    for (const file of SPLIT.parts) assert.ok(files.includes([...SPLIT.clientDir, file].join('/')), 'not shipped: ' + file)
  })
  caseTest(sdk, 'U-SHELL', 'O6', 'the status-line symlink keeps its name and target and still resolves to the instance\'s file', () => {
    const link = path.join(clientDir(), SPLIT.statusLink)
    assert.ok(fs.lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink(), SPLIT.statusLink + ' is not a symlink')
    assert.equal(fs.readlinkSync(link), SPLIT.statusTarget)
    assert.equal(fs.realpathSync(link), fs.realpathSync(path.join(V3.instance.dir, 'src', 'child-settings', SPLIT.statusLink)))
  })
  caseTest(sdk, 'U-SHELL', 'done', 'the Plugins card starts model sync on the Plugins page (R-HOST-07) in a browser', null, LATER.e2e)

  // ============================================================ the host half's constants equal the frozen contracts
  caseTest(sdk, 'U-SHELL', 'K3/K2', "the host half's restated service names and apiVersion equal K3's Context members and K2's TOOLS_API", async () => {
    const { SERVICE: own } = await import(pathToFileURL(HOST_CONSTANTS.file).href)
    const { TOOLS_API } = await import(pathToFileURL(HOST_CONSTANTS.tools).href)
    for (const service of [SERVICE.child, SERVICE.handover]) assert.ok(serviceMembers(k3(), service).get('apiVersion'), 'K3 declares ' + service)
    assert.deepEqual({ child: own.child, handover: own.handover, tools: own.tools, apiVersion: own.apiVersion }, { child: SERVICE.child, handover: SERVICE.handover, tools: TOOLS_API.service, apiVersion: TOOLS_API.version })
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
  integrationCase(sdk, 'U-SHELL', 'routes', 'GET services answers which services are usable now, per UIM-EP-01 partition (page ⇔ a v1 locator; handover and tools ⇔ the connector services)', async () => {
    for (const [scenario, expected] of [[SCENARIO.none, [false, false, false]], [SCENARIO.child, [true, false, false]], [SCENARIO.connector, [false, true, true]], [SCENARIO.all, [true, true, true]], [SCENARIO.older, [false, false, false]], [SCENARIO.disabled, [false, true, true]]]) {
      const answer = await routeCall(await hostFor(sdk, scenario), PAGE_NAME.ipv4, 'GET', ROUTE.services)
      assert.equal(answer.status, HTTP_OK, scenario.label + ': ' + answer.text)
      assert.deepEqual(ROUTE.servicesKeys.filter((k) => !(k in answer.json)), [], scenario.label + ' keys')
      assert.deepEqual([answer.json.page, answer.json.handover, answer.json.tools], expected, scenario.label)
    }
  })
  integrationCase(sdk, 'U-SHELL', 'routes', 'GET child/status re-serves the locator: {ok, status, target} with its state and code', async () => {
    const answer = await routeCall(await hostFor(sdk, SCENARIO.downRead), PAGE_NAME.ipv4, 'GET', ROUTE.status)
    assert.equal(answer.status, HTTP_OK, answer.text)
    assert.deepEqual(ROUTE.statusKeys.filter((k) => !(k in answer.json)), [])
    assert.deepEqual([answer.json.status.state, answer.json.status.code], [CHILD.failed, CHILD.exited])
  })
  for (const scenario of [SCENARIO.none, SCENARIO.older]) {
    integrationCase(sdk, 'U-SHELL', 'routes', `without a usable locator (${scenario.label}) every child/* route answers 503 instance-missing`, async () => {
      const setup = await hostFor(sdk, scenario)
      for (const key of ROUTE.child) {
        const method = key === 'status' ? 'GET' : 'POST'
        assertRefusal(await routeCall(setup, PAGE_NAME.ipv4, method, ROUTE[key], method === 'POST' ? { view: CHILD.views[0], lang: CHILD.langs.en } : undefined), ROUTE_REFUSAL.missing)
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
  integrationCase(sdk, 'UIM-UC-01', 'E1', 'POST child/admit while the child is down → 409 not-ready; POST child/retry restarts it; admit then answers a URL', async () => {
    const setup = await hostFor(sdk, SCENARIO.down)
    const body = { view: CHILD.views[0], lang: CHILD.langs.en }
    // The page row of E1 may have retried already; only a still-failed child must refuse.
    const first = await routeCall(setup, PAGE_NAME.ipv4, 'GET', ROUTE.status)
    if (first.json?.status?.state === CHILD.failed) assertRefusal(await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.admit, body), ROUTE_REFUSAL.notReady)
    assert.equal((await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.retry, {})).status, HTTP_OK)
    const admitted = await routeCall(setup, PAGE_NAME.ipv4, 'POST', ROUTE.admit, body)
    assert.equal(admitted.status, HTTP_OK, admitted.text)
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
  integrationCase(sdk, 'UIM-EP-01', 5, 'GET services with an older locator: page false, so the client registers no frame (apiVersion 2 is absent)', async () => {
    const answer = await routeCall(await hostFor(sdk, SCENARIO.older), PAGE_NAME.ipv4, 'GET', ROUTE.services)
    assert.equal(answer.json?.page, false, answer.text)
    assert.ok(API_VERSION.older !== API_VERSION.current)
  })
}
