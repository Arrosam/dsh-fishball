/**
 * Restart on the settings page and on the Fishball tab (README "Settings page": "Restart: restarts
 * Fishball after a confirmation (\"Running work in Fishball stops and the Fishball window
 * reloads.\"). Shown while the instance is on and the child is ready, failed or stopped; disabled
 * while it starts or stops and while a Fishball plugin change runs. Route POST restart … refused
 * with instance-disabled … and busy"; "Plugins for Fishball": the tab's Restart is "the settings
 * page's, same rules and confirmation", at the top of the tab beside Install for Fishball).
 *
 * | Case | Technique | Input | Expected |
 * |---|---|---|---|
 * | CPB-RESTART ×7 | EP over the state (settings page) | ready/failed/stopped/starting/stopping/disabled; ready+busy | enabled ×3, disabled ×2, hidden, disabled |
 * | CPB-CONFIRM ×2 | EP over the language | en / zh | asks first, nothing posted; en words exact, zh translated; confirm posts once |
 * | TR-PLACE | use case | tab, ready | one Restart in the tab's top row beside Install for Fishball |
 * | TR-STATE ×9 | EP over the state (tab) | shown / moving / any other state | enabled / disabled / hidden |
 * | TR-NOANSWER | BVA (before the first answer) | status never answered | no Restart |
 * | TR-DT ×12 | decision table state × busy | 6 states × busy false/true | rule above |
 * | TR-BUSY ×5 | BVA / EP on busy | absent, false, true, "true", 1 | only true disables |
 * | TR-LIVE | state transition | answers ready → starting → disabled → failed → ready+busy → ready | Restart follows each |
 * | TR-POLL | EP over visibility (page clock) | visible / hidden / visible / unmounted, 2.5 s each | ≥ 2 reads / none / ≥ 2 / none |
 * | TR-FLOW ×2 | state transition (en / zh) | click → Cancel → click → confirm → held answer → answer | nothing until confirmed; one POST '{}'; Restarting… disabled; back to Restart |
 * | TR-REFUSE ×4 | EP over refused | instance-disabled, busy, another code, none | its words in role=alert / none |
 * | TR-SAME | EP | disabled vs ready | the tab without Restart is the same |
 */
import assert from 'node:assert/strict'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { wordsOf } from '@dsh-instance/test-helpers/page'
import { findAll } from '@dsh-instance/test-helpers/react-shim'
import { HOOK, PAGE_UI, POLL, RESTART, ROUTE, STATE } from './constants.mjs'
import { alerts, confirmButton, deferred, expectedRestart, openDialogs, requestsTo, restartButton, restartView, scriptedInstance, show, statusOf } from './fakes.mjs'
import { openSettings, openTab } from './open.mjs'

const statusReads = (page) => requestsTo(page, 'GET', ROUTE.status).length
const restartPosts = (page) => requestsTo(page, 'POST', ROUTE.restart)
const zhText = /[\u4e00-\u9fff]/

/** Open the tab with `status` answered and wait for the first answer to render. */
async function tabWith(t, sdk, status, options = {}) {
  const world = scriptedInstance({ status, ...options })
  const opened = await openTab(t, sdk, { world, lang: options.lang })
  await opened.page.until(() => statusReads(opened.page) > 0)
  return opened
}

/** The tab as data without Restart, its dialog and any alert (TR-SAME). */
function withoutRestart(nodes) {
  const isRestart = (n) => n.props[RESTART.attr] !== undefined || n.props.role === 'alert' || n.props.role === 'dialog'
  const strip = (n) => (typeof n === 'string' ? n : {
    tag: n.tag,
    props: Object.fromEntries(Object.entries(n.props).filter(([, v]) => v !== undefined && typeof v !== 'function' && (typeof v !== 'object' || v === null)).sort(([a], [b]) => (a < b ? -1 : 1))),
    children: (n.children ?? []).filter((c) => typeof c === 'string' || !isRestart(c)).map(strip),
  })
  return nodes.filter((n) => typeof n === 'string' || !isRestart(n)).map(strip)
}

eachSdk((sdk) => {
  // ------------------------------------------------------------------ settings page: EP over the state
  for (const [part, status] of [
    ['ready', statusOf(STATE.ready)], ['failed', statusOf(STATE.failed)], ['stopped', statusOf(STATE.stopped)],
    ['starting', statusOf(STATE.starting)], ['stopping', statusOf(STATE.stopping)], ['disabled', statusOf(STATE.disabled)],
    ['ready, plugin change running', statusOf(STATE.ready, { busy: true })],
  ]) {
    const expected = expectedRestart(status)
    caseTest(sdk, 'CPB-RESTART', part, `settings page, status ${show({ state: status.state, busy: status.busy })} → Restart ${expected}`, async (t) => {
      const { page, tree } = await openSettings(t, sdk, { world: scriptedInstance({ status }) })
      await page.until(() => findAll(tree(), (n) => n.props[HOOK.state] === status.state).length > 0)
      assert.equal(restartView(tree()), expected)
    })
  }

  // ------------------------------------------------------------------ settings page: the confirmation (EP over the language)
  for (const lang of PAGE_UI.langs) {
    caseTest(sdk, 'CPB-CONFIRM', lang, `${lang}: Restart asks first (${lang === 'en' ? show(RESTART.en.title + ' ' + RESTART.en.body) : 'translated'}), posts nothing until confirmed, then posts restart once`, async (t) => {
      const { page, tree } = await openSettings(t, sdk, { lang })
      await page.until(() => restartView(tree()) === 'enabled')
      assert.deepEqual(openDialogs(tree()), [], 'a dialog is open before Restart was pressed')
      await page.press(restartButton(tree()))
      assert.equal(restartPosts(page).length, 0, 'Restart posted before any confirmation')
      const [dialog] = openDialogs(tree())
      assert.ok(dialog, 'no confirmation opened')
      const shown = wordsOf(dialog)
      if (lang === 'en') {
        assert.ok(shown.includes(RESTART.en.title), 'no title in: ' + shown)
        assert.ok(shown.includes(RESTART.en.body), 'no body in: ' + shown)
      } else {
        assert.ok(!shown.includes(RESTART.en.title) && !shown.includes(RESTART.en.body), 'the zh page shows the English confirmation: ' + shown)
        assert.ok(/Fishball/.test(shown) && zhText.test(shown), 'the confirmation is not in Chinese: ' + shown)
      }
      await page.press(confirmButton([dialog]))
      await page.until(() => restartPosts(page).length > 0)
      assert.equal(restartPosts(page).length, 1)
    })
  }

  // ------------------------------------------------------------------ the tab: placement
  caseTest(sdk, 'TR-PLACE', 'top row', 'ready: one Restart in the tab top row beside Install for Fishball', async (t) => {
    const { page, tree } = await tabWith(t, sdk, statusOf(STATE.ready, { busy: false }))
    await page.until(() => restartView(tree()) === 'enabled')
    const [root] = findAll(tree(), (n) => n.props[HOOK.tab] !== undefined)
    assert.ok(root, 'no Fishball tab root')
    const install = findAll([root], (n) => n.props[HOOK.installOpen] !== undefined)
    assert.equal(install.length, 1, 'Install for Fishball buttons: ' + install.length)
    const restart = restartButton([root])
    assert.ok(restart, 'Restart is not inside the tab')
    assert.equal(wordsOf(restart), RESTART.en.restart)
    const holds = (n, target) => findAll([n], (c) => c === target).length > 0
    // The closest element holding both, below the tab root and outside any list section.
    const row = findAll([root], (n) => holds(n, install[0]) && holds(n, restart)).at(-1)
    assert.ok(row && row !== root, 'Restart and Install for Fishball share no row below the tab root')
    assert.deepEqual(findAll([root], (n) => n.tag === 'section' && holds(n, row)), [], 'the shared row sits in a list section, not the top row')
  })

  // ------------------------------------------------------------------ the tab: EP over the state, decision table, busy BVA
  const viewCase = (id, part, status, title) => caseTest(sdk, id, part, title, async (t) => {
    const { tree } = await tabWith(t, sdk, status)
    assert.equal(restartView(tree()), expectedRestart(status), 'status ' + show(status))
  })
  for (const state of [STATE.ready, STATE.failed, STATE.stopped, STATE.starting, STATE.stopping, STATE.disabled, STATE.waiting, STATE.unavailable, 'fbtest-unknown-state']) {
    const status = statusOf(state, { busy: false })
    viewCase('TR-STATE', state, status, `state ${state}, not busy → Restart ${expectedRestart(status)}`)
  }
  for (const state of [STATE.ready, STATE.failed, STATE.stopped, STATE.starting, STATE.stopping, STATE.disabled]) for (const busy of [false, true]) {
    const status = statusOf(state, { busy })
    viewCase('TR-DT', `${state} busy ${busy}`, status, `state ${state} × busy ${busy} → Restart ${expectedRestart(status)}`)
  }
  for (const [part, busy] of [['absent', undefined], ['false', false], ['true', true], ['string true', 'true'], ['number 1', 1]]) {
    const status = statusOf(STATE.ready, busy === undefined ? {} : { busy })
    viewCase('TR-BUSY', part, status, `ready, busy ${part} → Restart ${expectedRestart(status)} (only busy === true disables)`)
  }

  caseTest(sdk, 'TR-NOANSWER', 'held', 'before any status answer (status request never answered) → no Restart', async (t) => {
    const { page, tree } = await openTab(t, sdk, { world: scriptedInstance({ status: null }) })
    await page.until(() => statusReads(page) > 0)
    assert.equal(restartView(tree()), 'hidden')
  })

  // ------------------------------------------------------------------ the tab: state transition by the polled answer alone
  caseTest(sdk, 'TR-LIVE', 'polled states', 'the status answer alone moves Restart: ready → starting → disabled → failed → ready+busy → ready', async (t) => {
    const { page, world, tree } = await tabWith(t, sdk, statusOf(STATE.ready, { busy: false }))
    assert.equal(restartView(tree()), 'enabled')
    for (const status of [statusOf(STATE.starting), statusOf(STATE.disabled), statusOf(STATE.failed), statusOf(STATE.ready, { busy: true }), statusOf(STATE.ready, { busy: false })]) {
      world.status = status
      await page.tick(POLL.everyMs)
      assert.equal(restartView(tree()), expectedRestart(status), 'after the status became ' + show(status))
    }
  })

  caseTest(sdk, 'TR-POLL', 'visibility', `status read while mounted and visible (≥ ${POLL.minReads} reads in ${POLL.windowMs} ms of the page clock); none while hidden or unmounted`, async (t) => {
    const { page } = await tabWith(t, sdk, statusOf(STATE.ready, { busy: false }))
    const span = async () => { const before = statusReads(page); await page.tick(POLL.windowMs); return statusReads(page) - before }
    assert.ok((await span()) >= POLL.minReads, 'too few reads while visible')
    page.setHidden(true)
    assert.equal(await span(), 0, 'read while the page was hidden')
    page.setHidden(false)
    assert.ok((await span()) >= POLL.minReads, 'reading did not resume when the page became visible')
    await page.unmount('tab')
    assert.equal(await span(), 0, 'read after the tab was unmounted')
  })

  // ------------------------------------------------------------------ the tab: the flow (state transition, EP over the language)
  for (const lang of PAGE_UI.langs) {
    caseTest(sdk, 'TR-FLOW', lang, `${lang}: click → confirm dialog (nothing posted) → Cancel (nothing) → click → confirm → "Restarting…" disabled until answered → Restart`, async (t) => {
      const held = []
      const world = scriptedInstance({ handlers: { ['POST ' + ROUTE.restart]: () => { const d = deferred(); held.push(d); return d.promise } } })
      const { page, tree } = await openTab(t, sdk, { lang, world })
      const words = page.services.locale.bind(PAGE_UI.id)
      await page.until(() => restartView(tree()) === 'enabled')
      assert.deepEqual(openDialogs(tree()), [], 'a dialog is open before Restart was pressed')
      await page.press(restartButton(tree()))
      assert.equal(restartPosts(page).length, 0, 'Restart posted before confirmation')
      const [dialog] = openDialogs(tree())
      assert.ok(dialog, 'no dialog opened')
      const shown = wordsOf(dialog)
      if (lang === 'en') assert.ok(shown.includes(RESTART.en.title) && shown.includes(RESTART.en.body), shown)
      else assert.ok(zhText.test(shown) && !shown.includes(RESTART.en.body), 'not translated: ' + shown)
      const cancelWord = lang === 'en' ? RESTART.en.cancel : words('restartCancel')
      const cancel = findAll([dialog], (n) => n.tag === 'button' && wordsOf(n) === cancelWord)[0]
      assert.ok(cancel, 'no ' + show(cancelWord) + ' in the dialog')
      await page.press(cancel)
      assert.deepEqual(openDialogs(tree()), [], 'Cancel left the dialog open')
      assert.equal(restartPosts(page).length, 0, 'Cancel posted a restart')
      assert.equal(restartView(tree()), 'enabled', 'Restart not enabled after Cancel')
      await page.press(restartButton(tree()))
      await page.press(confirmButton(openDialogs(tree())))
      await page.until(() => restartPosts(page).length > 0)
      assert.equal(restartPosts(page).length, 1)
      assert.equal(restartPosts(page)[0].body, RESTART.body, 'restart body')
      const restarting = lang === 'en' ? RESTART.en.restarting : words('restarting')
      assert.equal(wordsOf(restartButton(tree())), restarting, 'not ' + show(restarting) + ' while in flight')
      assert.equal(restartView(tree()), 'disabled', 'Restart not disabled while its request is in flight')
      await page.press(restartButton(tree()))
      assert.deepEqual(openDialogs(tree()), [], 'a disabled Restart opened the dialog')
      assert.equal(restartPosts(page).length, 1, 'a second restart was posted while one was in flight')
      held[0].resolve(statusOf(STATE.ready, { busy: false }))
      await page.until(() => restartView(tree()) === 'enabled')
      assert.equal(wordsOf(restartButton(tree())), lang === 'en' ? RESTART.en.restart : words('restart'))
      assert.deepEqual(alerts(tree()).map(wordsOf), [], 'an alert after a plain answer')
    })
  }

  // ------------------------------------------------------------------ the tab: refusals (EP)
  for (const [part, refused, shows] of [['instance-disabled', 'instance-disabled', true], ['busy', 'busy', true], ['other code', RESTART.otherRefusal, false], ['none', undefined, false]]) {
    caseTest(sdk, 'TR-REFUSE', part, `restart answers ${refused === undefined ? 'without refused' : 'refused ' + refused} → ${shows ? 'its refusal text in role=alert' : 'no refusal text'}`, async (t) => {
      const answer = statusOf(STATE.ready, { busy: false, ...(refused === undefined ? {} : { refused }) })
      const world = scriptedInstance({ handlers: { ['POST ' + ROUTE.restart]: () => answer } })
      const { page, tree } = await openTab(t, sdk, { world })
      const words = page.services.locale.bind(PAGE_UI.id)
      await page.until(() => restartView(tree()) === 'enabled')
      await page.press(restartButton(tree()))
      await page.press(confirmButton(openDialogs(tree())))
      await page.until(() => restartPosts(page).length === 1 && restartView(tree()) === 'enabled')
      const refusalWords = RESTART.refusals.map((code) => words('restartRefused.' + code))
      const shown = alerts(tree()).map(wordsOf)
      if (shows) {
        const want = words('restartRefused.' + refused)
        assert.notEqual(want, 'restartRefused.' + refused, 'the page has no words for ' + refused)
        assert.deepEqual(shown, [want])
      } else {
        assert.deepEqual(shown, [], 'an alert shows')
        const text = wordsOf(tree())
        for (const w of [...refusalWords, RESTART.otherRefusal]) assert.ok(!text.includes(w), 'shows ' + w)
      }
    })
  }

  caseTest(sdk, 'TR-SAME', 'rest of tab', 'the tab without Restart renders the same whether Restart is hidden (disabled) or shown (ready)', async (t) => {
    const off = await tabWith(t, sdk, statusOf(STATE.disabled))
    const on = await tabWith(t, sdk, statusOf(STATE.ready, { busy: false }))
    await on.page.until(() => restartView(on.tree()) === 'enabled')
    assert.equal(restartView(off.tree()), 'hidden')
    assert.equal(show(withoutRestart(on.tree())), show(withoutRestart(off.tree())))
  })
})
