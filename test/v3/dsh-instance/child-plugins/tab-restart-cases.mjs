/**
 * TAB-RESTART black-box cases: a Restart on the Fishball tab of DSH's Plugins page (user, 2026-11-20:
 * "Add a restart fishball button in the plugin -> fishball tab, so after user installed something,
 * they can restart fishball easily"; behaviour as decided by lead the same day). Written from that
 * requirement only; the implementation was not read (only its public surface: the slot
 * `plugins.tab`, the data attributes [data-fishball-tab], [data-fishball-install-open],
 * [data-fishball-instance-restart], [data-fishball-instance-restart-confirm], the 'dsh-instance'
 * locale keys the requirement names, and the routes GET status / POST restart).
 *
 * Level: system-like page (page.mjs): the real client scripts in a scripted Plugins page; the tab is
 * the plugins.tab entry, mounted with DSH's owner props; status and restart are answered per case.
 *
 * | Case | Technique | Input / state | Expected |
 * |---|---|---|---|
 * | TR-PLACE | EP | ready | one Restart in the tab's top row, the same row as Install for Fishball; Install for Fishball still there |
 * | TR-STATE ×9 | EP over state | ready/failed/stopped · starting/stopping · disabled/waiting/unavailable/unknown (busy false) | enabled · disabled · hidden |
 * | TR-NOANSWER | BVA (before the first answer) | status request never answered | no Restart |
 * | TR-DT ×12 | Decision table state × busy | 6 states × busy false/true | shown & !busy → enabled; shown & busy → disabled; starting/stopping → disabled; disabled → hidden |
 * | TR-BUSY ×5 | BVA / EP on busy (=== true) | busy absent, false, true, "true", 1 (state ready) | only true disables |
 * | TR-LIVE | State transition (polling) | ready → starting → disabled → failed → ready+busy → ready, by the status answer alone | enabled → disabled → hidden → enabled → disabled → enabled |
 * | TR-POLL | EP (visible / hidden / unmounted) | 2.5 s windows | visible: ≥ 2 status GETs; hidden: none; visible again: resumes; unmounted: none |
 * | TR-FLOW ×2 | State transition (en / zh) | click → Cancel; click → confirm → in flight → answer | confirm dialog with the namespace's title/description, nothing posted; Cancel closes, nothing posted; confirm posts restart once with body '{}'; "Restarting…" and disabled until the answer; then Restart again, no alert |
 * | TR-REFUSE ×4 | EP over refused | instance-disabled, busy, another code, none | the matching refusal text in role=alert; another code / none → no alert |
 * | TR-SAME | EP | state disabled vs ready | the tab without the Restart (and its dialog) renders exactly the same |
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { PAGE, ROUTE, STATE } from './constants.mjs'
import { openPage, tabEntries, wordsOf } from './page.mjs'

const show = (v) => JSON.stringify(v)
const TAB = PAGE.tab
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const statusOf = (state, extra = {}) => ({ state, code: state === STATE.failed ? 'NATIVE_CHILD_EXITED' : null, detail: null, notice: null, ...extra })

/**
 * Open the page and mount the Fishball tab.
 * @param options.status - the status answer (mutable through the returned `status`); `null` holds every status request.
 * @param options.restart - `(body) => answer | Promise<answer>` for POST restart (default: the status answer).
 */
async function openTab(t, sdk, { lang = 'en', status = statusOf(STATE.ready, { busy: false }), restart } = {}) {
  const world = { status, answered: 0 }
  const respond = (method, pathname, body) => {
    if (pathname === ROUTE.status && method === 'GET') {
      if (world.status === null) return new Promise(() => {})
      world.answered++
      return structuredClone(world.status)
    }
    if (pathname === ROUTE.restart && method === 'POST') return restart ? restart(body) : structuredClone(world.status ?? {})
    return undefined
  }
  const page = await openPage(t, sdk, { lang, respond })
  const entries = tabEntries(page)
  assert.ok(entries.length > 0, 'no ' + TAB.slot + ' entry; errors: ' + page.world.errors.join('; '))
  const t9n = page.services.locale.bind(TAB.ns)
  const words = Object.fromEntries(Object.entries(TAB.key).map(([k, key]) => [k, t9n(key)]))
  let mounted
  for (const entry of entries) {
    const key = 'tab:' + entry.options.id
    await page.mount(key, entry.Component, { t: page.services.locale.bind(entry.options.locale), install() {}, update() {}, openPackage() {} })
    if (page.byAttr(key, TAB.rootAttr).length > 0) { mounted = key; break }
    await page.unmount(key)
  }
  assert.ok(mounted, 'no plugins.tab entry renders [' + TAB.rootAttr + ']')
  const key = mounted
  const api = {
    page, world, key, words,
    t9n,
    restartButtons: () => page.byAttr(key, PAGE.restart.attr).filter((n) => n.tag === 'button'),
    restart: () => api.restartButtons()[0],
    confirm: () => page.byAttr(key, PAGE.restart.confirmAttr)[0],
    openDialogs: () => page.find(key, (n) => n.props.open === true),
    alerts: () => page.find(key, (n) => n.props.role === TAB.alertRole),
    posts: () => page.world.requests.filter((r) => r.method === 'POST' && r.path === ROUTE.restart),
    statusGets: () => page.world.requests.filter((r) => r.method === 'GET' && r.path === ROUTE.status).length,
    text: () => wordsOf(page.tree(key)),
    /** Wait until the page has rendered at least one status answer after `since` answers. */
    async answeredAfter(since = 0) {
      assert.ok(await page.until(() => world.answered > since), 'no status answer reached the page')
      await page.settle()
    },
    /** 'hidden' | 'disabled' | 'enabled' — and exactly one Restart when shown. */
    restartView() {
      const b = api.restartButtons()
      if (b.length === 0) return 'hidden'
      assert.equal(b.length, 1, 'Restart buttons: ' + b.length)
      return b[0].props.disabled ? 'disabled' : 'enabled'
    },
    async viewBecomes(expected, ms = TAB.transitionMs) {
      await page.until(() => api.restartView() === expected, ms)
      return api.restartView()
    },
  }
  return api
}

function findIn(node, predicate) {
  for (const c of node.children ?? []) {
    if (typeof c === 'string') continue
    if (predicate(c) || findIn(c, predicate)) return true
  }
  return false
}

/** Expected Restart for a status (the requirement's rule). */
function expectedView(status) {
  if (TAB.disabled.includes(status.state)) return 'disabled'
  if (!TAB.shown.includes(status.state)) return 'hidden'
  return status.busy === true ? 'disabled' : 'enabled'
}

async function assertView(t, sdk, status) {
  const tab = await openTab(t, sdk, { status })
  await tab.answeredAfter()
  const expected = expectedView(status)
  // A hidden Restart might still be on its way; give it the same budget a shown one gets.
  const seen = expected === 'hidden' ? (await tab.page.until(() => tab.restartView() !== 'hidden', PAGE.pollMs * 20), tab.restartView()) : await tab.viewBecomes(expected)
  assert.equal(seen, expected, 'status ' + show(status) + ': Restart ' + seen + '; tab text: ' + tab.text())
}

/** The tab tree as data without Restart, its dialog and any alert (TR-SAME). */
function withoutRestart(nodes) {
  const isRestart = (n) => n.props[PAGE.restart.attr] !== undefined || n.props.role === TAB.alertRole || findIn(n, (c) => c.props?.[PAGE.restart.confirmAttr] !== undefined) && n.props.open !== undefined
  const strip = (n) => typeof n === 'string' ? n : { tag: n.tag, props: Object.fromEntries(Object.entries(n.props).filter(([, v]) => v !== undefined && typeof v !== 'function' && (typeof v !== 'object' || v === null)).sort(([x], [y]) => (x < y ? -1 : 1))), children: (n.children ?? []).filter((c) => typeof c === 'string' || !isRestart(c)).map(strip) }
  return nodes.filter((n) => typeof n === 'string' || !isRestart(n)).map(strip)
}

export function registerTabRestartCases(sdk) {
  caseTest(sdk, 'TR-PLACE', 'top row', 'ready: one Restart in the tab top row beside Install for Fishball', async (t) => {
    const tab = await openTab(t, sdk)
    assert.equal(await tab.viewBecomes('enabled'), 'enabled')
    const [root] = tab.page.byAttr(tab.key, TAB.rootAttr)
    const install = tab.page.byAttr(tab.key, TAB.installAttr)
    assert.equal(install.length, 1, 'Install for Fishball: ' + install.length)
    assert.equal(wordsOf(tab.restart()), tab.words.restart)
    assert.ok(findIn(root, (n) => n === tab.restart()), 'Restart is outside [' + TAB.rootAttr + ']')
    // The top row: the closest element holding Install for Fishball also holds Restart (beside it), and it is not inside any list section.
    const rows = tab.page.find(tab.key, (n) => findIn(n, (c) => c === install[0]) && findIn(n, (c) => c === tab.restart()))
    const row = rows.at(-1)
    assert.ok(row && row !== root, 'Restart and Install for Fishball share no row below the tab root')
    assert.ok(row.tag !== 'section' && !tab.page.find(tab.key, (n) => n.tag === 'section' && findIn(n, (c) => c === row)).length, 'the shared row sits in a list section, not the top row')
  })

  for (const state of [...TAB.shown, ...TAB.disabled, ...TAB.hidden]) {
    const status = statusOf(state, { busy: false })
    caseTest(sdk, 'TR-STATE', state, `state ${state}, not busy → Restart ${expectedView(status)}`, (t) => assertView(t, sdk, status))
  }

  caseTest(sdk, 'TR-NOANSWER', 'held', 'before any status answer (status request never answered) → no Restart', async (t) => {
    const tab = await openTab(t, sdk, { status: null })
    assert.ok(tab.statusGets() > 0, 'the tab never asked for the status')
    await tab.page.until(() => tab.restartView() !== 'hidden', PAGE.pollMs * 20)
    assert.equal(tab.restartView(), 'hidden')
  })

  for (const state of [STATE.ready, STATE.failed, STATE.stopped, STATE.starting, STATE.stopping, STATE.disabled]) for (const busy of [false, true]) {
    const status = statusOf(state, { busy })
    caseTest(sdk, 'TR-DT', `${state} busy ${busy}`, `state ${state} × busy ${busy} → Restart ${expectedView(status)}`, (t) => assertView(t, sdk, status))
  }

  for (const [part, busy] of [['absent', undefined], ['false', false], ['true', true], ['string true', 'true'], ['number 1', 1]]) {
    const status = statusOf(STATE.ready, busy === undefined ? {} : { busy })
    caseTest(sdk, 'TR-BUSY', part, `ready, busy ${part} → Restart ${expectedView(status)} (only busy === true disables)`, (t) => assertView(t, sdk, status))
  }

  caseTest(sdk, 'TR-LIVE', 'polled states', 'the status answer alone moves Restart: ready → starting → disabled → failed → ready+busy → ready', async (t) => {
    const tab = await openTab(t, sdk)
    for (const status of [statusOf(STATE.ready, { busy: false }), statusOf(STATE.starting), statusOf(STATE.disabled), statusOf(STATE.failed), statusOf(STATE.ready, { busy: true }), statusOf(STATE.ready, { busy: false })]) {
      tab.world.status = status
      const expected = expectedView(status)
      assert.equal(await tab.viewBecomes(expected), expected, 'after the status became ' + show(status))
    }
  })

  caseTest(sdk, 'TR-POLL', 'visibility', `status polled while mounted and visible (≥ ${TAB.minPolls} GETs in ${TAB.pollWindowMs} ms); none while hidden or unmounted`, async (t) => {
    const tab = await openTab(t, sdk)
    const windowCount = async () => { await tab.page.settle(); const before = tab.statusGets(); await sleep(TAB.pollWindowMs); await tab.page.settle(); return tab.statusGets() - before }
    assert.ok((await windowCount()) >= TAB.minPolls, 'too few polls while visible')
    await tab.page.setHidden(true)
    await sleep(PAGE.pollMs * 5)
    assert.equal(await windowCount(), 0, 'polled while the page was hidden')
    await tab.page.setHidden(false)
    assert.ok((await windowCount()) >= TAB.minPolls, 'polling did not resume when the page became visible')
    await tab.page.unmount(tab.key)
    assert.equal(await windowCount(), 0, 'polled after the tab was unmounted')
  })

  for (const lang of PAGE.langs) {
    caseTest(sdk, 'TR-FLOW', lang, `${lang}: click → confirm dialog (nothing posted) → Cancel (nothing) → click → confirm → "Restarting…" disabled until answered → Restart`, async (t) => {
      const held = []
      const tab = await openTab(t, sdk, { lang, restart: () => { const d = deferred(); held.push(d); return d.promise } })
      assert.equal(await tab.viewBecomes('enabled'), 'enabled')
      assert.deepEqual(tab.openDialogs(), [], 'a dialog is open before Restart was pressed')
      await tab.page.press(tab.restart())
      assert.equal(tab.posts().length, 0, 'Restart posted before confirmation')
      const [dialog] = tab.openDialogs()
      assert.ok(dialog, 'no dialog opened')
      const shown = wordsOf(dialog)
      for (const k of ['title', 'body']) assert.ok(shown.includes(tab.words[k]), 'dialog lacks ' + k + ' ' + show(tab.words[k]) + ': ' + shown)
      if (lang === 'en') assert.ok(shown.includes(PAGE.restart.title.en) && shown.includes(PAGE.restart.body.en), shown)
      // Cancel: closes, no request.
      const cancel = findAllIn(dialog, (n) => n.tag === 'button' && wordsOf(n) === tab.words.cancel)[0]
      assert.ok(cancel, 'no ' + show(tab.words.cancel) + ' in the dialog')
      await tab.page.press(cancel)
      assert.deepEqual(tab.openDialogs(), [], 'Cancel left the dialog open')
      await sleep(PAGE.pollMs * 5); await tab.page.settle()
      assert.equal(tab.posts().length, 0, 'Cancel posted a restart')
      assert.equal(tab.restartView(), 'enabled', 'Restart not enabled after Cancel')
      // Confirm: one POST with body '{}', Restarting… and disabled while in flight.
      await tab.page.press(tab.restart())
      assert.ok(tab.openDialogs().length > 0, 'the dialog did not reopen')
      await tab.page.press(tab.confirm())
      assert.ok(await tab.page.until(() => tab.posts().length === 1), 'confirming did not post restart (posts ' + tab.posts().length + ')')
      assert.equal(tab.posts()[0].body, TAB.restartBody, 'restart body')
      assert.ok(await tab.page.until(() => tab.text().includes(tab.words.restarting)), 'no ' + show(tab.words.restarting) + ' while in flight: ' + tab.text())
      assert.equal(tab.restartView(), 'disabled', 'Restart not disabled while its request is in flight')
      // A user reaches the confirm control only in an open dialog (the fake Modal also renders a closed one's footer).
      await tab.page.press(tab.restart())
      const confirm = tab.openDialogs().length > 0 ? tab.confirm() : undefined
      if (confirm) await tab.page.press(confirm)
      await sleep(PAGE.pollMs * 5); await tab.page.settle()
      assert.equal(tab.posts().length, 1, 'a second restart was posted while one was in flight')
      // Answer: back to Restart.
      held[0].resolve(statusOf(STATE.ready, { busy: false }))
      assert.ok(await tab.page.until(() => !tab.text().includes(tab.words.restarting)), '"Restarting…" stayed after the answer')
      assert.equal(await tab.viewBecomes('enabled'), 'enabled')
      assert.equal(wordsOf(tab.restart()), tab.words.restart)
      assert.deepEqual(tab.alerts().map(wordsOf), [], 'an alert after a plain answer')
    })
  }

  for (const [part, refused, expectText] of [['instance-disabled', 'instance-disabled', true], ['busy', 'busy', true], ['other code', TAB.otherRefusal, false], ['none', undefined, false]]) {
    caseTest(sdk, 'TR-REFUSE', part, `restart answers ${refused === undefined ? 'without refused' : 'refused ' + refused} → ${expectText ? 'its refusal text in role=alert' : 'no refusal text'}`, async (t) => {
      const answer = statusOf(STATE.ready, { busy: false, ...(refused === undefined ? {} : { refused }) })
      const tab = await openTab(t, sdk, { restart: () => answer })
      assert.equal(await tab.viewBecomes('enabled'), 'enabled')
      await tab.page.press(tab.restart())
      await tab.page.press(tab.confirm())
      assert.ok(await tab.page.until(() => tab.posts().length === 1 && !tab.text().includes(tab.words.restarting)), 'the restart did not complete')
      const refusalTexts = TAB.refusals.map((code) => tab.t9n(TAB.key.refused + code))
      if (expectText) {
        const want = tab.t9n(TAB.key.refused + refused)
        assert.notEqual(want, TAB.key.refused + refused, 'precondition: the namespace has no text for ' + refused)
        assert.ok(await tab.page.until(() => tab.alerts().some((a) => wordsOf(a).includes(want))), 'no role=alert with ' + show(want) + '; alerts ' + show(tab.alerts().map(wordsOf)) + '; text ' + tab.text())
        for (const other of refusalTexts.filter((x) => x !== want)) assert.ok(!tab.text().includes(other), 'the other refusal text shows too: ' + other)
      } else {
        await tab.page.until(() => tab.alerts().length > 0, PAGE.pollMs * 20)
        assert.deepEqual(tab.alerts().map(wordsOf), [], 'an alert shows')
        for (const text of refusalTexts) assert.ok(!tab.text().includes(text), 'a refusal text shows: ' + text)
        assert.ok(!tab.text().includes(TAB.otherRefusal), 'the raw code shows')
      }
    })
  }

  caseTest(sdk, 'TR-SAME', 'rest of tab', 'the tab without Restart renders the same whether Restart is hidden (disabled) or shown (ready)', async (t) => {
    const off = await openTab(t, sdk, { status: statusOf(STATE.disabled) })
    await off.answeredAfter()
    const on = await openTab(t, sdk, { status: statusOf(STATE.ready, { busy: false }) })
    assert.equal(await on.viewBecomes('enabled'), 'enabled')
    assert.equal(off.restartView(), 'hidden')
    const a = withoutRestart(on.page.tree(on.key)), b = withoutRestart(off.page.tree(off.key))
    const firstDiff = (x, y, at = '') => { if (show(x) === show(y)) return null; if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null) return at + ': ' + show(x) + ' vs ' + show(y); for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) { const d = firstDiff(x[k], y[k], at + '/' + k); if (d) return d } return at }
    // Compared as rendered data: a prop set to undefined renders nothing, so it is not a difference.
    assert.equal(show(a), show(b), 'first difference (shown vs hidden) at ' + firstDiff(a, b))
  })
}

function findAllIn(node, predicate, out = []) {
  for (const c of node.children ?? []) {
    if (typeof c === 'string') continue
    if (predicate(c)) out.push(c)
    findAllIn(c, predicate, out)
  }
  return out
}
