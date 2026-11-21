/**
 * MSG-USER (USE-CASES.md): Fishball's manager-only `message_user` tool (spec items 1–3), its persona
 * (item 4), and the Fishball page's message rows and hidden replies (items 5–7), on the SDK the entry
 * file names. Black box: the tool table, the guard contract and PERSONA_ROLE are imported as published;
 * everything else runs core as an installed bundle in a real standalone DSH (the manager suite's world,
 * ../manager/world.mjs) and reads DSH's real web UI in a headless Chromium (page.mjs).
 *
 * One scenario per SDK collects the facts in order; each case reads them. A failing step is kept as
 * the scenario's error and every case that needs a later fact reports it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { chromeBinary } from '../../../v2-page-cases/lite-browser.mjs'
import { sleep, until } from '../../../support/util.mjs'
import { scenario } from '../manager/subject.mjs'
import { FISHBALL_MODEL, MODEL } from '../manager/constants.mjs'
import { BUDGET, PAGE, PERSONA, RESULT_ROWS, TOOL, TURNS } from './constants.mjs'
import { openDsh, stopBrowser } from './page.mjs'
import { registerPagingCases } from './paging.mjs'

const show = (v) => JSON.stringify(v)
const call = (n, args) => ({ tool: TOOL.name, args, id: TOOL.callPrefix + n })
const rawCall = (n, raw) => ({ tool: TOOL.name, rawArgs: raw, id: TOOL.callPrefix + n })
const parse = (text) => { try { return JSON.parse(text) } catch { return undefined } }

/** The data-chat-turn of the row whose text holds `marker`. */
const turnOf = (snap, marker) => snap?.rows.find((r) => r.text.includes(marker))?.turn ?? null
const rowsOf = (snap, turn, kind) => (snap?.rows ?? []).filter((r) => r.turn === turn && (kind === undefined || r.kind === kind))
const replies = (snap, turn) => rowsOf(snap, turn, PAGE.kinds.reply).filter((r) => r.part === PAGE.response)
const messages = (snap, turn) => rowsOf(snap, turn, PAGE.kinds.message)
const controlOf = (snap, turn) => snap?.controls.find((c) => c.turn === turn) ?? null
const sameStyle = (a, b) => show(a) === show(b)

/** Waits until the manager's live turn is held at its scripted request. */
async function waitHeld(h, sessionId) {
  return Boolean(await until(() => h.call('held', { sessionId }), BUDGET.heldMs, BUDGET.pollMs))
}

export function registerMessageUserCases(sdk) {
  const browser = Boolean(chromeBinary())
  after(stopBrowser)
  const facts = scenario('fbmsg-' + sdk.replace(/\W/g, '-'), sdk, [
    async (boot, f) => {
      const h = await boot()
      const id = (await h.request('/api/fishball/session', { method: 'POST', body: {} })).json?.sessionId
      if (typeof id !== 'string') throw new Error('no manager session')
      f.manager = id
      // With Fishball's model unset the page opens its model dialog (fishball-ui.model-dialog), a modal
      // over the chat; a routable model keeps the chat clickable. The scripted model serves both routes.
      await h.call('mutate', { ops: [{ op: 'set', path: [...FISHBALL_MODEL.path], value: MODEL.routable }] })
      const tab = browser ? await openDsh(h) : null
      f.pageOpen = tab ? await tab.until((s) => s.page) : null

      // Items 1–2: the result table, one call per turn.
      let n = 0
      f.results = []
      for (const row of RESULT_ROWS) {
        const requests = await h.call('turn', { sessionId: id, scripts: [[call(++n, row.args)]] })
        const result = requests[1]?.last.filter((m) => m.role === 'tool').at(-1) ?? null
        f.results.push({ row: row.row, offered: requests[0]?.tools.includes(TOOL.name) ?? false, result })
      }
      f.spec = await h.call('toolSpec', { sessionId: id, name: TOOL.name })
      f.ordinary = await h.call('newSession')
      f.guards = await h.call('guards')
      if (!tab) return

      // Item 6: a turn with nothing to fold besides its reply.
      await h.call('turn', { sessionId: id, scripts: [[{ text: TURNS.plain.reply }]] })
      // Items 5–6: a completed turn with a process, shown and dropped calls interleaved.
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
      await h.call('startTurn', { sessionId: id, scripts: [[{ text: r.pre }, call(++n, { message: r.message })]], holdAt: 2 })
      f.runningHeld = await waitHeld(h, id)
      f.running = await tab.until((s) => s.rows.some((row) => row.kind === PAGE.kinds.message && row.text.includes(r.message)))
      f.runningTurn = turnOf(f.running, r.pre)
      await h.call('release', { sessionId: id })
      await h.call('idle', { sessionId: id })
      f.finished = await tab.until((s) => controlOf(s, f.runningTurn) !== null)

      // A turn the user stops while it is held.
      const st = TURNS.stopped
      await h.call('startTurn', { sessionId: id, scripts: [[{ text: st.pre }, call(++n, { message: st.message })]], holdAt: 2 })
      f.stopHeld = await waitHeld(h, id)
      await tab.until((s) => s.rows.some((row) => row.text.includes(st.message)))
      await h.call('stopTurn', { sessionId: id })
      f.stopped = await tab.until((s) => { const t = turnOf(s, st.pre); return t !== null && controlOf(s, t) !== null })
      f.stoppedTurn = turnOf(f.stopped, st.pre)

      // DSH's verbose work details open every control (disabled); back to the default.
      await h.call('mutate', { ns: PAGE.chat.ns, ops: [{ op: 'set', path: [PAGE.chat.field], value: PAGE.chat.verbose }] })
      f.verbose = await tab.until((s) => controlOf(s, doneTurn)?.open === true)
      await h.call('mutate', { ns: PAGE.chat.ns, ops: [{ op: 'unset', path: [PAGE.chat.field] }] })
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
  ])
  const read = async (...keys) => {
    const f = await facts()
    for (const key of keys) if (f[key] === undefined) throw f.error ?? new Error('fact ' + key + ' was not collected')
    return f
  }
  const name = (id, text) => `${sdk} ${id} ${text}`
  const pageTest = (id, text, fn) => test(name(id, text), browser ? {} : { skip: 'no Chromium binary (the LITE rows skip so too)' }, fn)

  // ------------------------------------------------------------------ items 1, 3: the tool table and the guard entry (unit)
  test(name('MSG-TOOL-EP-01', 'message-tools.js is import-free and exports MESSAGE_TOOL = {send: "message_user"}'), async () => {
    const text = fs.readFileSync(TOOL.module, 'utf8')
    assert.deepEqual(TOOL.importForms.filter((re) => re.test(text)).map(String), [], 'the module imports something')
    const mod = await import(pathToFileURL(TOOL.module).href)
    assert.deepEqual({ ...mod[TOOL.table] }, TOOL.tableValue)
  })
  test(name('MSG-TOOL-EP-02', 'GUARDS.coreTools lists {module: "../manager/message-tools.js", table: "MESSAGE_TOOL"}'), async () => {
    const { GUARDS } = await import(pathToFileURL(TOOL.contracts).href)
    assert.ok(GUARDS.coreTools.some((e) => e.module === TOOL.guardEntry.module && e.table === TOOL.guardEntry.table), show(GUARDS.coreTools))
  })

  // ------------------------------------------------------------------ items 1–3: scope and guard report (system)
  test(name('MSG-TOOL-EP-03', 'the manager is offered message_user: a required string parameter "message", described as Markdown'), async () => {
    const f = await read('results', 'spec')
    assert.ok(f.results.every((r) => r.offered), 'not offered in every manager turn: ' + show(f.results.map((r) => [r.row, r.offered])))
    assert.ok(f.spec, 'no message_user in the manager request')
    const p = f.spec.parameters
    assert.equal(p?.properties?.[TOOL.parameter]?.type, 'string', show(p))
    assert.ok(p.required?.includes(TOOL.parameter), 'message is not required: ' + show(p))
    assert.match(show(f.spec), /markdown/i, 'neither the tool nor its parameter mentions Markdown')
  })
  test(name('MSG-TOOL-EP-04', 'an ordinary new session is not offered message_user (manager only)'), async () => {
    const f = await read('ordinary')
    const tools = f.ordinary.requests[0]?.tools
    assert.ok(tools, 'the ordinary session made no model request')
    assert.equal(tools.includes(TOOL.name), false, tools.join(', '))
  })
  test(name('MSG-TOOL-EP-05', 'R-FB-13: the guard report does not count message_user as an extra or overriding manager tool'), async () => {
    const f = await read('guards')
    assert.ok(f.guards, 'no guard report')
    assert.equal((f.guards.extraManagerTools ?? []).includes(TOOL.name), false, show(f.guards))
    assert.equal(show(f.guards.overridden ?? []).includes(TOOL.name), false, show(f.guards))
  })
  // ------------------------------------------------------------------ item 2: decision table of the model-facing result
  RESULT_ROWS.forEach((row, i) => {
    const want = row.want === 'shown' ? show(TOOL.shown) : row.want === 'empty' ? show(TOOL.empty) : "DSH's argument validation error"
    test(name('MSG-TOOL-DT-01', `${row.row} ${show(row.args)} -> ${want}`), async () => {
      const f = await read('results')
      const got = f.results[i]
      assert.ok(got.result, 'no tool result reached the model: ' + show(got))
      if (row.want === 'refused') {
        assert.equal(got.result.isError, true, 'not an error result: ' + show(got.result))
        assert.equal(parse(got.result.text)?.shown, undefined, 'the tool itself answered: ' + got.result.text)
        return
      }
      assert.notEqual(got.result.isError, true, 'an error result: ' + show(got.result))
      assert.deepEqual(parse(got.result.text), row.want === 'shown' ? TOOL.shown : TOOL.empty, got.result.text)
    })
  })

  // ------------------------------------------------------------------ item 4: the persona (unit)
  const persona = async () => {
    const mod = await import(pathToFileURL(PERSONA.entry).href)
    const role = mod[PERSONA.export]
    assert.equal(typeof role, 'string', PERSONA.export + ' is not a string')
    return role
  }
  const sentences = (text) => text.split(PERSONA.sentence).map((s) => s.trim()).filter(Boolean)
  /** Sentence i with its neighbours: a statement may name the tool in the next sentence. */
  const near = (list, i) => list.slice(Math.max(0, i - 1), i + 2).join(' ')
  const nearTool = (list, re) => list.some((s, i) => re.test(s) && near(list, i).includes(TOOL.name))
  test(name('MSG-PERSONA-EP-01', 'the persona names message_user and embed-ui__notify'), async () => {
    const text = await persona()
    assert.ok(text.includes(TOOL.name), 'message_user missing')
    assert.ok(text.includes(PERSONA.notify), PERSONA.notify + ' missing')
  })
  test(name('MSG-PERSONA-EP-02', 'the persona says ordinary replies, reasoning and tool calls are hidden from the user'), async () => {
    const list = sentences(await persona())
    const missing = PERSONA.hiddenSubjects.filter((subject) => !list.some((s, i) => subject.test(s) && PERSONA.hidden.test(near(list, i))))
    assert.deepEqual(missing.map(String), [], 'no "hidden" statement for these')
  })
  test(name('MSG-PERSONA-EP-03', 'the persona says the user sees only what message_user (and notify, when offered) surfaces'), async () => {
    const list = sentences(await persona())
    assert.ok(list.some((s, i) => PERSONA.only.test(s) && near(list, i).includes(TOOL.name)), 'no "only … message_user" statement')
  })
  test(name('MSG-PERSONA-EP-04', 'the persona says what needs attention or action must be sent proactively with message_user, plus a notify notice'), async () => {
    const text = await persona()
    const list = sentences(text)
    assert.ok(nearTool(list, PERSONA.attention) || nearTool(list, PERSONA.action), 'no attention/action statement beside message_user')
    assert.ok(PERSONA.proactive.test(text), 'no "proactively"')
    assert.ok(list.some((s, i) => (PERSONA.attention.test(s) || PERSONA.action.test(s) || PERSONA.proactive.test(s)) && near(list, i).includes(PERSONA.notify)), 'no notify notice beside the attention statement')
  })
  test(name('MSG-PERSONA-EP-05', 'the persona says no messages or notices for routine events, and to batch them'), async () => {
    const text = await persona()
    assert.ok(sentences(text).some((s) => PERSONA.routine.test(s) && /\b(?:no|not|never|don't|do not|avoid|without)\b/i.test(s)), 'no "not for routine events" statement')
    assert.ok(PERSONA.batch.test(text), 'no batching statement')
  })
  test(name('MSG-PERSONA-EP-06', 'the persona says every reply to the user goes through message_user, including the setup greeting and the report after a stop/redirect'), async () => {
    const list = sentences(await persona())
    assert.ok(nearTool(list, PERSONA.everyReply), 'no "every reply … message_user" statement')
    assert.ok(nearTool(list, PERSONA.greeting), 'the setup greeting is not tied to message_user')
    assert.ok(nearTool(list, PERSONA.stop), 'the report after a stop is not tied to message_user')
    assert.ok(nearTool(list, PERSONA.redirect), 'the report after a redirect is not tied to message_user')
  })
  test(name('MSG-PERSONA-EP-07', 'no sentence tells Fishball to tell the user "in this chat" without message_user'), async () => {
    const list = sentences(await persona())
    assert.deepEqual(list.filter((s) => PERSONA.chatSaying.test(s) && !s.includes(TOOL.name)), [])
  })

  // ------------------------------------------------------------------ items 5–7: the Fishball page (system, real DSH web UI)
  pageTest('MSG-PAGE-EP-00', 'precondition: the manager world opens as the Fishball page (<html data-fishball-page>)', async () => {
    const f = await read('pageOpen')
    assert.equal(f.pageOpen?.page, true, show(f.pageOpen))
  })
  pageTest('MSG-PAGE-EP-01', 'each non-empty message_user call is its own fishball-message row, in call order, with its Markdown drawn', async () => {
    const f = await read('completed', 'completedTurn')
    const rows = messages(f.completed, f.completedTurn)
    assert.deepEqual(rows.map((r) => r.text), TURNS.completed.shown.map((m) => m.text), 'rows: ' + show(rows.map((r) => r.text)))
    const strong = TURNS.completed.shown[0].strong
    assert.ok(rows[0].html.includes('<strong>' + strong + '</strong>'), 'the Markdown was not drawn: ' + rows[0].html)
    assert.equal(rows[0].html.includes('**'), false, 'Markdown markers shown as text: ' + rows[0].html)
  })
  pageTest('MSG-PAGE-DT-01', 'empty, whitespace-only, non-string, missing and unparsable message arguments draw no row', async () => {
    const f = await read('completed', 'completedTurn')
    const all = f.completed.rows.filter((r) => r.kind === PAGE.kinds.message)
    // Only the four shown messages of the completed turn and the earlier non-empty result-table rows draw.
    const allowed = [...TURNS.completed.shown.map((m) => m.text), ...RESULT_ROWS.filter((r) => r.want === 'shown').map((r) => r.args.message.trim())]
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
    assert.notEqual(row.before?.mask, 'none', 'no avatar mask: ' + show(row.before))
    assert.equal(row.after?.content, PAGE.label, 'no name label: ' + show(row.after))
    assert.ok(row.bubble, 'no div[data-fishball-message]')
    assert.ok(row.inner.backgroundColor !== PAGE.transparent || row.inner.borderRadius !== '0px', 'the message has no bubble: ' + show(row.inner))
  })
  pageTest('MSG-PAGE-DT-02', 'control enabled and closed: the turn\'s assistant replies are hidden', async () => {
    const f = await read('completed', 'completedTurn')
    const control = controlOf(f.completed, f.completedTurn)
    assert.deepEqual({ open: control?.open, disabled: control?.disabled }, { open: false, disabled: false }, 'precondition: ' + show(control))
    const rs = replies(f.completed, f.completedTurn)
    assert.equal(rs.length, 2, 'precondition: the pre and final replies: ' + show(rs.map((r) => r.text)))
    assert.deepEqual(rs.filter((r) => r.visible).map((r) => r.text), [], 'visible replies')
  })
  pageTest('MSG-PAGE-ST-01', 'clicking the control (closed -> open) shows the folded process and the replies, in DSH\'s plain look; the message_user tool rows are normal rows inside the fold', async () => {
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
      assert.equal(r.before.mask, 'none', r.text + ': avatar')
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
    assert.deepEqual(replies(f.verbose, f.completedTurn).map((r) => r.visible), [true, true])
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
    assert.deepEqual(replies(f.unloadedOpen, f.completedTurn).map((r) => r.visible), [true, true], 'DSH\'s own open fold hides replies')
  })
  pageTest('MSG-PAGE-ST-09', 'fishball-page switched on again: the message rows return from the stored session', async () => {
    const f = await read('reloadedOn', 'completedTurn')
    assert.deepEqual(messages(f.reloadedOn, f.completedTurn).map((r) => r.text), TURNS.completed.shown.map((m) => m.text))
  })
  // The lead (2026-11-21): folded replies must not break DSH's chat scrolling or paging; a long stream (paging.mjs).
  registerPagingCases(sdk, browser)
  test(name('MSG-PAGE-EP-04', 'outside the Fishball page (another session in the same DSH) nothing changes'), { todo: 'no public way found to show a non-manager session in the Fishball page\'s DSH from a test; the unload rows (ST-08) cover "nothing left"' }, () => {})
}