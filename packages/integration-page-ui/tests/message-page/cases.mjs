/**
 * MSG-PAGE (DESIGN §32; the MSG-USER spec items 5–7): fishball-ui's fishball-page draws each non-empty
 * `message_user` call of fishball-core's manager as its own row and folds the assistant replies behind
 * DSH's own turn control. Ported from test/v3/fishball-core/message-user/cases.mjs (its page half; the
 * tool and persona rows stay in fishball-core's own tests).
 *
 * Level: system. A real standalone DSH (fishball-test-helpers/dsh-world) with fishball-core installed as
 * a bundle, whose patch inserts fishball-ui's rows (fishball-page among them), and the scripted model;
 * DSH's real web UI in headless Chromium, logged in as the owner (../support/page.mjs). One scenario
 * collects the facts in order; each case reads them, and a failing step is every later case's error.
 *
 * | Case | Technique | Checks |
 * |---|---|---|
 * | MSG-PAGE-EP-00 | precondition | the world's DSH web UI is the Fishball page (<html data-fishball-page>) |
 * | MSG-PAGE-EP-01 | EP | 4 non-empty calls in one turn (two model steps) → 4 rows in call order; Markdown drawn |
 * | MSG-PAGE-DT-01 | DT | '', whitespace, number, missing, unparsable arguments → no row anywhere |
 * | MSG-PAGE-EP-02 | EP × ST | message rows visible, in the conversation, outside the fold, with the control closed / open / closed |
 * | MSG-PAGE-EP-03 | EP | avatar mask ::before, "Fishball" ::after, a div[data-fishball-message] bubble |
 * | MSG-PAGE-DT-02 | DT enabled + closed | the two replies hidden |
 * | MSG-PAGE-DT-03 | DT disabled, no data-open | a text-only turn's reply visible |
 * | MSG-PAGE-ST-01 / 01b / 02 | ST closed → open → closed (trusted clicks) | open: replies visible in DSH's plain look, message_user tool rows inside the fold; closed: hidden |
 * | MSG-PAGE-ST-03 | ST running (held at its 2nd request) | message row at once, outside the fold; reply hidden |
 * | MSG-PAGE-ST-04 | ST running → completed | message stays, replies hidden |
 * | MSG-PAGE-ST-05 | ST running → stopped (control open + disabled) | replies visible, message stays |
 * | MSG-PAGE-ST-06 | ST verbose ⇄ default work details | open + disabled: replies visible; back: hidden |
 * | MSG-PAGE-ST-07 | ST reload | rows rebuilt from the stored session in call order; replies hidden |
 * | MSG-PAGE-ST-08 / 09 | ST fishball-page row off / on (DSH's Plugins switch) | off: no mark, rows or folded marks, DSH's fold as DSH draws it; on: rows return |
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { chromeBinary, stopBrowser } from 'fishball-test-helpers/browser'
import { caseTest } from 'fishball-test-helpers/cases'
import { scenario } from 'fishball-test-helpers/dsh-world'
import { until } from 'fishball-test-helpers/wait'
import { EXTENSION, corePackages } from '../support/world.mjs'
import { BUDGET, HOME, PAGE, RESULT_ROWS, SKIP_NO_CHROME, TOOL, TURNS } from './constants.mjs'
import { controlOf, managerSession, messages, openFishballPage, replies, rowsOf, show, turnOf } from './facts.mjs'

const call = (n, args) => ({ tool: TOOL.name, args, id: TOOL.callPrefix + n })
const rawCall = (n, raw) => ({ tool: TOOL.name, rawArgs: raw, id: TOOL.callPrefix + n })
const sameStyle = (a, b) => show(a) === show(b)
const waitHeld = async (h, sessionId) => Boolean(await until(() => h.call('held', { sessionId }), BUDGET.heldMs, BUDGET.pollMs))
const setVerbose = (h, on) => h.call('mutate', { ns: PAGE.chat.ns, ops: [on ? { op: 'set', path: [PAGE.chat.field], value: PAGE.chat.verbose } : { op: 'unset', path: [PAGE.chat.field] }] })

export function registerMessagePageCases() {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const facts = scenario(HOME.page, [
    async (boot, f) => {
      if (!browser) return
      const h = await boot()
      const id = await managerSession(h)
      const { tab, opened } = await openFishballPage(h)
      f.pageOpen = opened
      // Items 1–2's argument partitions, one call per turn: only the shown ones may draw.
      let n = 0
      for (const row of RESULT_ROWS) await h.call('turn', { sessionId: id, scripts: [[call(++n, row.args)]] })

      // Item 6: a turn with nothing to fold besides its reply.
      await h.call('turn', { sessionId: id, scripts: [[{ text: TURNS.plain.reply }]] })
      // Items 5–6: a completed turn with a process, shown and dropped calls interleaved over two model steps.
      const c = TURNS.completed
      await h.call('turn', { sessionId: id, scripts: [
        [{ text: c.pre }, call(++n, { message: c.shown[0].message }), call(++n, { message: c.shown[1].message })],
        [call(++n, c.dropped[0].args), call(++n, { message: c.shown[2].message }), call(++n, c.dropped[1].args), call(++n, c.dropped[2].args),
          call(++n, { message: c.shown[3].message }), call(++n, c.dropped[3].args), rawCall(++n, c.dropped[4].raw)],
        [{ text: c.final }],
      ] })
      f.completed = await tab.until((s) => turnOf(s, c.final) !== null && controlOf(s, turnOf(s, c.final)) !== null)
      f.completedTurn = turnOf(f.completed, c.final)
      f.plainTurn = turnOf(f.completed, TURNS.plain.reply)
      // State transitions on DSH's control: closed → open → closed.
      const doneTurn = f.completedTurn
      f.click1 = await tab.clickControl(doneTurn)
      f.opened = await tab.until((s) => controlOf(s, doneTurn)?.open === true)
      f.click2 = await tab.clickControl(doneTurn)
      f.closed = await tab.until((s) => controlOf(s, doneTurn)?.open === false)

      // A running turn, held at its second request; then let it finish.
      const r = TURNS.running
      await h.call('startTurn', { sessionId: id, scripts: [[{ text: r.pre }, call(++n, { message: r.message })]], holdAt: TURNS.holdAt })
      f.runningHeld = await waitHeld(h, id)
      f.running = await tab.until((s) => s.rows.some((row) => row.kind === PAGE.kinds.message && row.text.includes(r.message)))
      f.runningTurn = turnOf(f.running, r.pre)
      await h.call('release', { sessionId: id })
      await h.call('idle', { sessionId: id })
      f.finished = await tab.until((s) => controlOf(s, f.runningTurn) !== null)

      // A turn the user stops while it is held.
      const st = TURNS.stopped
      await h.call('startTurn', { sessionId: id, scripts: [[{ text: st.pre }, call(++n, { message: st.message })]], holdAt: TURNS.holdAt })
      f.stopHeld = await waitHeld(h, id)
      await tab.until((s) => s.rows.some((row) => row.text.includes(st.message)))
      await h.call('stopTurn', { sessionId: id })
      f.stopped = await tab.until((s) => { const t = turnOf(s, st.pre); return t !== null && controlOf(s, t) !== null })
      f.stoppedTurn = turnOf(f.stopped, st.pre)

      // DSH's verbose work details open every control (disabled); back to the default.
      await setVerbose(h, true)
      f.verbose = await tab.until((s) => controlOf(s, doneTurn)?.open === true)
      await setVerbose(h, false)
      f.unverbose = await tab.until((s) => controlOf(s, doneTurn)?.open === false)

      // A reload rebuilds the rows from the stored session.
      await tab.reload()
      f.reloaded = await tab.until((s) => s.page && messages(s, doneTurn).length > 0 && controlOf(s, doneTurn) !== null)

      // Item 7: the page row switched off in DSH's Plugins, then on again.
      await h.call('setRowEnabled', { id: PAGE.pageRow, enabled: false })
      f.unloaded = await tab.until((s) => !s.page && s.rows.length > 0 && !s.rows.some((row) => row.kind === PAGE.kinds.message))
      f.unloadedOpen = (await tab.clickControl(doneTurn)) === true ? await tab.until((s) => controlOf(s, doneTurn)?.open === true) : null
      await h.call('setRowEnabled', { id: PAGE.pageRow, enabled: true })
      await tab.reload()
      f.reloadedOn = await tab.until((s) => s.page && messages(s, doneTurn).length > 0)
      await tab.close()
    },
  ], { packages: corePackages(), extension: EXTENSION })
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const pageTest = (id, title, fn) => caseTest(id, '', title, browser ? { timeout: BUDGET.caseMs } : { skip: SKIP_NO_CHROME }, fn)

  pageTest('MSG-PAGE-EP-00', 'precondition: the world opens as the Fishball page (<html data-fishball-page>)', async () => {
    const f = await read('pageOpen')
    assert.equal(f.pageOpen?.page, true, show(f.pageOpen))
  })
  pageTest('MSG-PAGE-EP-01', 'each non-empty message_user call is its own fishball-message row, in call order, with its Markdown drawn', async () => {
    const f = await read('completed', 'completedTurn')
    const rows = messages(f.completed, f.completedTurn)
    assert.deepEqual(rows.map((r) => r.text), TURNS.completed.shown.map((m) => m.text), 'rows: ' + show(rows.map((r) => r.text)))
    const strong = TURNS.completed.shown[0].strong
    assert.ok(rows[0].html.includes(PAGE.strongTag(strong)), 'the Markdown was not drawn: ' + rows[0].html)
    assert.equal(rows[0].html.includes(PAGE.markdownMarker), false, 'Markdown markers shown as text: ' + rows[0].html)
  })
  pageTest('MSG-PAGE-DT-01', 'empty, whitespace-only, non-string, missing and unparsable message arguments draw no row', async () => {
    const f = await read('completed', 'completedTurn')
    const all = f.completed.rows.filter((r) => r.kind === PAGE.kinds.message)
    // Only the four shown messages of the completed turn and the earlier non-empty partition rows draw.
    const allowed = [...TURNS.completed.shown.map((m) => m.text), ...RESULT_ROWS.filter((r) => r.shown).map((r) => r.args.message.trim())]
    assert.deepEqual(all.filter((r) => !allowed.includes(r.text)).map((r) => r.text), [], 'rows for dropped calls')
    assert.equal(messages(f.completed, f.completedTurn).length, TURNS.completed.shown.length)
  })
  pageTest('MSG-PAGE-EP-02', 'the message rows are visible, outside DSH\'s turn-process fold and step groups, with the control closed, open and closed again', async () => {
    const f = await read('completed', 'opened', 'closed', 'completedTurn')
    for (const [state, snap] of [['closed', f.completed], ['opened', f.opened], ['closed again', f.closed]]) {
      const rows = messages(snap, f.completedTurn)
      assert.equal(rows.length, TURNS.completed.shown.length, state + ': ' + show(rows.map((r) => r.text)))
      assert.deepEqual(rows.filter((r) => !r.visible || r.inProcess || r.folded || !r.inConversation).map((r) => r.text), [], state + ': hidden or folded message rows')
    }
  })
  pageTest('MSG-PAGE-EP-03', 'the message row looks like Fishball\'s reply: avatar ::before, "Fishball" ::after label and a bubble around the message', async () => {
    const f = await read('completed', 'completedTurn')
    const row = messages(f.completed, f.completedTurn)[0]
    assert.ok(row, 'no message row')
    assert.notEqual(row.before?.mask, PAGE.noMask, 'no avatar mask: ' + show(row.before))
    assert.equal(row.after?.content, PAGE.label, 'no name label: ' + show(row.after))
    assert.ok(row.bubble, 'no div[data-fishball-message]')
    assert.ok(row.inner.backgroundColor !== PAGE.transparent || row.inner.borderRadius !== PAGE.noRadius, 'the message has no bubble: ' + show(row.inner))
  })
  pageTest('MSG-PAGE-DT-02', 'control enabled and closed: the turn\'s assistant replies are hidden', async () => {
    const f = await read('completed', 'completedTurn')
    const control = controlOf(f.completed, f.completedTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: false, disabled: false }, 'precondition: ' + show(control))
    const rs = replies(f.completed, f.completedTurn)
    assert.equal(rs.length, TURNS.completed.replies, 'precondition: the pre and final replies: ' + show(rs.map((r) => r.text)))
    assert.deepEqual(rs.filter((r) => r.visible).map((r) => r.text), [], 'visible replies')
  })
  pageTest('MSG-PAGE-ST-01', 'clicking the control (closed -> open) shows the folded process and the replies; the message_user tool rows are normal rows inside the fold', async () => {
    const f = await read('opened', 'completedTurn', 'click1')
    assert.equal(f.click1, true, 'the control could not be clicked: ' + f.click1)
    assert.equal(controlOf(f.opened, f.completedTurn)?.open, true, 'the control did not open: ' + show(controlOf(f.opened, f.completedTurn)))
    const rs = replies(f.opened, f.completedTurn)
    assert.deepEqual(rs.map((r) => [r.text, r.visible]), [[TURNS.completed.pre, true], [TURNS.completed.final, true]])
    const tools = rowsOf(f.opened, f.completedTurn, PAGE.kinds.tool).filter((r) => r.tool === TOOL.name)
    assert.ok(tools.length >= TURNS.completed.shown.length, 'message_user tool rows: ' + tools.length)
    assert.ok(tools.every((r) => r.inProcess), 'a message_user tool row outside the fold')
  })
  pageTest('MSG-PAGE-ST-01b', 'an expanded reply has no avatar, no "Fishball" label and no bubble: the same look as with fishball-page unloaded', async () => {
    const f = await read('opened', 'unloaded', 'completedTurn')
    const shown = replies(f.opened, f.completedTurn)
    const dsh = replies(f.unloaded, f.completedTurn)
    assert.equal(shown.length, dsh.length, 'precondition')
    for (const [i, r] of shown.entries()) {
      assert.equal(r.before.mask, PAGE.noMask, r.text + ': avatar')
      assert.ok(PAGE.noContent.includes(r.after.content), r.text + ': label ' + r.after.content)
      assert.ok(sameStyle(r.inner, dsh[i].inner), r.text + ': content styled ' + show(r.inner) + ' vs DSH ' + show(dsh[i].inner))
    }
  })
  pageTest('MSG-PAGE-ST-02', 'clicking it again (open -> closed) hides the replies again', async () => {
    const f = await read('closed', 'completedTurn', 'click2')
    assert.equal(f.click2, true, 'the control could not be clicked: ' + f.click2)
    assert.equal(controlOf(f.closed, f.completedTurn)?.open, false)
    assert.deepEqual(replies(f.closed, f.completedTurn).filter((r) => r.visible).map((r) => r.text), [])
  })
  pageTest('MSG-PAGE-DT-03', 'control disabled without data-open (nothing to fold besides the reply): the reply is visible', async () => {
    const f = await read('completed', 'plainTurn')
    const control = controlOf(f.completed, f.plainTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: false, disabled: true }, 'precondition: ' + show(control))
    assert.deepEqual(replies(f.completed, f.plainTurn).map((r) => [r.text, r.visible]), [[TURNS.plain.reply, true]])
  })
  pageTest('MSG-PAGE-ST-03', 'running turn: its message row is visible at once, its reply is hidden', async () => {
    const f = await read('running', 'runningTurn', 'runningHeld')
    assert.equal(f.runningHeld, true, 'precondition: the turn is still running')
    const control = controlOf(f.running, f.runningTurn)
    assert.ok(control === null || (!control.open && !control.disabled), 'precondition: no open or disabled control while running: ' + show(control))
    assert.deepEqual(messages(f.running, f.runningTurn).map((r) => [r.text, r.visible, r.inProcess]), [[TURNS.running.message, true, false]])
    assert.deepEqual(replies(f.running, f.runningTurn).map((r) => [r.text, r.visible]), [[TURNS.running.pre, false]])
  })
  pageTest('MSG-PAGE-ST-04', 'running -> completed with a closed enabled control: the message stays visible, the replies stay hidden', async () => {
    const f = await read('finished', 'runningTurn')
    const control = controlOf(f.finished, f.runningTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: false, disabled: false }, 'precondition: ' + show(control))
    assert.deepEqual(messages(f.finished, f.runningTurn).map((r) => [r.text, r.visible]), [[TURNS.running.message, true]])
    assert.deepEqual(replies(f.finished, f.runningTurn).filter((r) => r.visible).map((r) => r.text), [])
  })
  pageTest('MSG-PAGE-ST-05', 'running -> stopped (control open and disabled): the replies show, the message row stays', async () => {
    const f = await read('stopped', 'stoppedTurn', 'stopHeld')
    assert.equal(f.stopHeld, true, 'precondition: the turn was running when stopped')
    const control = controlOf(f.stopped, f.stoppedTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: true, disabled: true }, 'precondition: ' + show(control))
    assert.deepEqual(replies(f.stopped, f.stoppedTurn).map((r) => [r.text, r.visible]), [[TURNS.stopped.pre, true]])
    assert.deepEqual(messages(f.stopped, f.stoppedTurn).map((r) => [r.text, r.visible]), [[TURNS.stopped.message, true]])
  })
  pageTest('MSG-PAGE-ST-06', 'DSH\'s verbose work details (every control open, disabled) show the replies; back to the default hides them again', async () => {
    const f = await read('verbose', 'unverbose', 'completedTurn')
    assert.deepEqual(controlOf(f.verbose, f.completedTurn), { turn: f.completedTurn, open: true, disabled: true }, 'precondition')
    assert.deepEqual(replies(f.verbose, f.completedTurn).map((r) => r.visible), Array(TURNS.completed.replies).fill(true))
    assert.equal(controlOf(f.unverbose, f.completedTurn)?.open, false, 'precondition: closed again')
    assert.deepEqual(replies(f.unverbose, f.completedTurn).filter((r) => r.visible).map((r) => r.text), [])
  })
  pageTest('MSG-PAGE-ST-07', 'after a page reload the stored turn draws the same message rows in call order and hides its replies', async () => {
    const f = await read('reloaded', 'completedTurn')
    assert.deepEqual(messages(f.reloaded, f.completedTurn).map((r) => [r.text, r.visible]), TURNS.completed.shown.map((m) => [m.text, true]))
    assert.deepEqual(replies(f.reloaded, f.completedTurn).filter((r) => r.visible).map((r) => r.text), [])
  })
  pageTest('MSG-PAGE-ST-08', 'fishball-page unloaded (its row off in DSH\'s Plugins): no message rows, no folded marks, DSH\'s own fold works as before', async () => {
    const f = await read('unloaded', 'completedTurn')
    assert.equal(f.unloaded?.page, false, 'precondition: the page mark is gone')
    assert.equal(f.unloaded.rows.filter((r) => r.kind === PAGE.kinds.message).length, 0, 'message rows left')
    assert.equal(f.unloaded.folded, 0, 'data-fishball-folded left')
    assert.equal(f.unloadedOpen === null ? null : controlOf(f.unloadedOpen, f.completedTurn)?.open, true, 'DSH\'s control no longer opens')
    assert.deepEqual(replies(f.unloadedOpen, f.completedTurn).map((r) => r.visible), Array(TURNS.completed.replies).fill(true), 'DSH\'s own open fold hides replies')
  })
  pageTest('MSG-PAGE-ST-09', 'fishball-page switched on again: the message rows return from the stored session', async () => {
    const f = await read('reloadedOn', 'completedTurn')
    assert.deepEqual(messages(f.reloadedOn, f.completedTurn).map((r) => r.text), TURNS.completed.shown.map((m) => m.text))
  })
}
