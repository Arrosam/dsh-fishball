/**
 * Core's ask cards drawn by fishball-ui (old test/v3/fishball-core/asks ASK-UI-01 and ASK-UC-04 main 1/2):
 * core serves AskCard (packages/core/contracts/ask-card.d.ts, F-FIX "Show arguments and reason", the user
 * 2026-11-17) on its page stream's `asks` topic (`{managerSessionId, cards}`, DESIGN §34); fishball-ui's
 * real client.js and its client.asks.js part draw them in DSH's `conversation.input.dock`. Choices are Allow
 * and Reject, or Reject only when the arguments are not complete; markup in a value is text.
 *
 * Techniques: EP (arguments complete / truncated / unavailable / none; markup in a value).
 * Level: component (fishball-test-helpers/scripted-page with fishball-ui's client found by name; one
 * EventSource stand-in for the page stream), plus the chunk's registration read in a node:vm sandbox.
 * The card data is test data in the contract's shape: core's filing of it is core's own tests.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { caseTest } from 'fishball-test-helpers/cases'
import { eventSourceClass } from 'fishball-test-helpers/event-source'
import { exportPath } from 'fishball-test-helpers/packages'
import { findAll, textOf } from 'fishball-test-helpers/react-shim'
import { createWorld, loadPage } from 'fishball-test-helpers/scripted-page'
import { SEAM_PAGE_STREAM } from 'fishball-shared/ui-seam'
import { NAME, fileOf, manifestOf } from '../support/packages.mjs'
import { ASK } from './constants.mjs'

const show = (v) => JSON.stringify(v)
let n = 0
/** One AskCard (contract shape; test data). */
function card({ argumentsText = null, argumentsStatus = null, reason = ASK.fixture.reason } = {}) {
  n += 1
  const complete = argumentsStatus === null || argumentsStatus === ASK.argumentsStatus.complete
  return {
    handle: ASK.fixture.handlePrefix + n, source: { ...ASK.fixture.source }, approvalId: ASK.fixture.approvalPrefix + n, offerId: ASK.fixture.approvalPrefix + n + ASK.fixture.offerSuffix,
    sessionId: ASK.fixture.session, sessionTitle: ASK.fixture.title, question: ASK.fixture.question + n,
    arguments: argumentsText, argumentsStatus, reason: typeof reason === 'string' && reason.trim() !== '' ? reason : null,
    choices: complete ? [ASK.choice.allow, ASK.choice.reject] : [ASK.choice.reject], askedAt: ASK.fixture.askedAt + n, state: ASK.state.open,
  }
}

/** The Fishball page with fishball-ui's card dock mounted for Fishball's own conversation. */
async function cardPage(t) {
  const sources = eventSourceClass()
  const w = createWorld({ clients: [{ id: NAME.ui, file: exportPath(NAME.ui, ASK.clientExport) }] })
  w.EventSource = sources.EventSource
  w.html.setAttribute(ASK.pageMark, '')
  const page = await loadPage(t, w)
  const docks = w.entries(ASK.slot)
  assert.ok(docks.length > 0, `no entry in ${ASK.slot}: fishball-ui's card dock did not register`)
  for (const [i, entry] of docks.entries()) await page.mount(ASK.mountKey + i, () => w.renderEntry(entry, { sessionId: ASK.fixture.manager }))
  const tree = () => docks.flatMap((_e, i) => w.shim.treeOf(ASK.mountKey + i))
  const nodes = () => findAll(tree(), () => true)
  return {
    async show(cards) {
      const streams = sources.opened.filter((s) => !s.closed && new URL(s.url, w.base).pathname === SEAM_PAGE_STREAM.route)
      assert.ok(streams.length > 0, 'the page opened no page stream: ' + show(sources.opened.map((s) => s.url)))
      for (const s of streams) s.deliver({ [SEAM_PAGE_STREAM.field.topic]: SEAM_PAGE_STREAM.topic.asks, [SEAM_PAGE_STREAM.field.frame]: { managerSessionId: ASK.fixture.manager, cards } })
      await page.settled()
    },
    text: () => tree().map(textOf).join(' '),
    tags: () => nodes().map((x) => x.tag),
    buttons: () => nodes().filter((x) => x.tag === ASK.button).map((x) => textOf(x).trim()),
    strings: () => nodes().flatMap((x) => (x.children ?? []).filter((c) => typeof c === 'string')),
  }
}
const hasAllowReject = (buttons) => buttons.some((b) => ASK.label.allow.test(b)) && buttons.some((b) => ASK.label.reject.test(b))

export function registerAskCardCases() {
  caseTest('ASK-UI-01', 'complete', 'a card with complete arguments and a reason shows the question, the arguments, the reason, and Allow and Reject buttons', async (t) => {
    const p = await cardPage(t)
    const c = card({ argumentsText: ASK.fixture.argumentsText, argumentsStatus: ASK.argumentsStatus.complete })
    await p.show([c])
    for (const shown of [c.question, ASK.fixture.argumentsText, ASK.fixture.reason]) assert.ok(p.text().includes(shown), `not shown: ${show(shown)}`)
    assert.ok(hasAllowReject(p.buttons()), show(p.buttons()))
    assert.equal(ASK.incompleteNote.test(p.text()), false)
  })
  for (const status of [ASK.argumentsStatus.truncated, ASK.argumentsStatus.unavailable]) {
    caseTest('ASK-UI-01', status, `a card whose arguments are ${status} shows only the Reject button and a note that the arguments are incomplete`, async (t) => {
      const p = await cardPage(t)
      await p.show([card({ argumentsText: ASK.fixture.argumentsText, argumentsStatus: status })])
      const answers = p.buttons().filter((b) => ASK.label.allow.test(b) || ASK.label.reject.test(b))
      assert.equal(answers.length, 1, show(p.buttons()))
      assert.ok(ASK.label.reject.test(answers[0]), show(answers))
      assert.ok(ASK.incompleteNote.test(p.text()), p.text())
    })
  }
  caseTest('ASK-UI-01', 'markup is text', 'markup in the arguments and in the reason is shown as plain text: the exact strings appear, and no element they name is created', async (t) => {
    const p = await cardPage(t)
    await p.show([card({ argumentsText: ASK.fixture.argumentsText, argumentsStatus: ASK.argumentsStatus.complete, reason: ASK.fixture.markupReason })])
    const strings = p.strings().join('\n')
    assert.ok(strings.includes(ASK.fixture.argumentsText) && strings.includes(ASK.fixture.markupReason), strings)
    assert.deepEqual(p.tags().filter((tag) => ASK.markupTags.includes(tag)), [])
  })
  caseTest('ASK-UI-01', 'no detail', 'a card with no arguments and no reason (null) shows its question, no incomplete note, and Allow and Reject', async (t) => {
    const p = await cardPage(t)
    const c = card({ reason: '' })
    await p.show([c])
    assert.ok(p.text().includes(c.question))
    assert.equal(ASK.incompleteNote.test(p.text()), false)
    assert.ok(hasAllowReject(p.buttons()), show(p.buttons()))
  })
  caseTest('ASK-UC-04', 'main 1', `${ASK.chunk} exists in fishball-ui and ships in its package.json files`, () => {
    assert.ok(fs.existsSync(fileOf(NAME.ui, ASK.chunk)))
    const files = manifestOf(NAME.ui).files ?? []
    assert.ok(files.some((f) => f === ASK.chunk || path.matchesGlob(ASK.chunk, f)), show(files))
  })
  caseTest('ASK-UC-04', 'main 2', `${ASK.chunk} is a flat chunk of fishball-ui's own client (id fishball-ui, chunk ${ASK.chunk}), not a row of its own; core's patch inserts no row for it`, () => {
    const loads = []
    const sandbox = vm.createContext({ [ASK.loaderGlobal]: { load: (spec) => loads.push(spec) } })
    vm.runInContext('globalThis.window = globalThis; globalThis.self = globalThis', sandbox)
    vm.runInContext(fs.readFileSync(fileOf(NAME.ui, ASK.chunk), 'utf8'), sandbox)
    assert.equal(loads.length, 1)
    assert.equal(loads[0].id, NAME.ui)
    assert.equal(loads[0].chunk, ASK.chunk)
    assert.equal(typeof loads[0].factory, 'function')
    assert.equal(fs.readFileSync(fileOf(NAME.core, ASK.corePatch), 'utf8').includes(ASK.chunk), false)
  })
}
