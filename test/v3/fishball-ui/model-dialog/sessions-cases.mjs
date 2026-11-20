/**
 * The running managed sessions under a target's row (the lead's relay of the user's feature,
 * 2026-11-21): the frame's `sessions` from core's `TargetView.runningSessions`, and the sidebar
 * drawing them as a nested list without a press, beside the existing details disclosure.
 * Rules under test:
 * - frame: `sessions` is `[{sessionId, title}]` in core's order, `[]` when the list is unknown
 *   (`null` / absent) or the target is not connected; an empty title reads the untitled word
 *   (en "Untitled session", zh "未命名会话"); a title is passed through verbatim as text;
 * - sidebar: with a live stream and at least one session, a list
 *   `[data-fishball-target-sessions=<targetId>]` named "Running sessions" / "运行中的会话", one
 *   `[data-fishball-target-session=<sessionId>]` item each, an `ongoing` dot and the title as one
 *   text node with a `title` attribute; no button or link in it; nothing when there is no session,
 *   when the stream is not live, or in the rail; the row's `aria-expanded` and details unchanged.
 * Techniques: EP (state, list known/unknown, titles), BVA (0 / 1 / n sessions), ST (sessions start
 * and end, stream lost), DT (live × sessions × state). Levels: unit (the real `targetsView`),
 * component (fishball-ui's real client in the scripted page, targets.mjs `sidebarPage`).
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE, FRAME, SEAM_TARGETS } from './targets-constants.mjs'
import { isRow, plain, sidebarPage, snapshotOf, targetView, viewModule } from './targets.mjs'

const ST = SEAM_TARGETS.state
const zone = FIXTURE.zones[0]
const HOOK = Object.freeze({ list: 'data-fishball-target-sessions', item: 'data-fishball-target-session' })
const WORDS = Object.freeze({
  heading: Object.freeze({ en: 'Running sessions', zh: '运行中的会话' }),
  untitled: Object.freeze({ en: 'Untitled session', zh: '未命名会话' }),
})
const running = (n) => Array.from({ length: n }, (_x, i) => ({ sessionId: 'fbtest-session-' + i, title: 'Task ' + i }))
const frameOf = async (sdk, targets, lang = 'en') => (await viewModule(sdk)).targetsView(snapshotOf(targets), lang, zone)

export function registerSessionsCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)

  // ====================================================================== frame (unit)
  for (const n of [0, 1, 3]) {
    t('SES-VIEW-BVA-01', `${n} sessions`, `${n} running session(s) → sessions has ${n} entries {sessionId, title} in core's order`, async () => {
      const list = running(n)
      const [v] = plain((await frameOf(sdk, [targetView(0, { runningSessions: list })])).targets)
      assert.deepEqual(v.sessions, list)
    })
  }
  for (const [label, value] of [['null', null], ['absent', undefined], ['not an array', 'x']]) {
    t('SES-VIEW-EP-01', `unknown ${label}`, `runningSessions ${label} → sessions []`, async () => {
      const overrides = value === undefined ? {} : { runningSessions: value }
      const [v] = (await frameOf(sdk, [targetView(0, overrides)])).targets
      assert.deepEqual(plain(v.sessions), [])
    })
  }
  for (const state of [ST.connecting, ST.failed, ST.notSet, 'fbtest-unknown-state']) {
    t('SES-VIEW-EP-02', `state ${state}`, `a ${state} target with a known list → sessions [] (never a stale claim)`, async () => {
      const [v] = (await frameOf(sdk, [targetView(0, { state, runningSessions: running(2) })])).targets
      assert.deepEqual(plain(v.sessions), [])
    })
  }
  for (const lang of FRAME.langs) {
    t('SES-VIEW-EP-03', `untitled ${lang}`, `(${lang}) an empty title reads ${JSON.stringify(WORDS.untitled[lang])}; words.sessions is ${JSON.stringify(WORDS.heading[lang])}`, async () => {
      const frame = await frameOf(sdk, [targetView(0, { runningSessions: [{ sessionId: 's', title: '' }] })], lang)
      assert.deepEqual(plain(frame.targets[0].sessions), [{ sessionId: 's', title: WORDS.untitled[lang] }])
      assert.equal(frame.words.sessions, WORDS.heading[lang])
    })
  }
  t('SES-VIEW-EP-04', 'markup title verbatim', 'a markup-looking or RTL title stays the same string', async () => {
    const titles = [FIXTURE.names.markup, '\u202Eevil', FIXTURE.names.unicode]
    const [v] = (await frameOf(sdk, [targetView(0, { runningSessions: titles.map((title, i) => ({ sessionId: 's' + i, title })) })])).targets
    assert.deepEqual(v.sessions.map((s) => s.title), titles)
  })

  // ====================================================================== sidebar (component)
  const lists = (p) => p.byHook(HOOK.list, p.sidebarNodes())
  const items = (p) => p.byHook(HOOK.item, p.sidebarNodes())

  for (const lang of FRAME.langs) {
    t('SES-SB-EP-01', `shown ${lang}`, `(${lang}) a connected target with running sessions → its list under the row without a press, named ${JSON.stringify(WORDS.heading[lang])}, one item per session with an ongoing dot and the title`, async (c) => {
      const p = await sidebarPage(c, sdk, { lang })
      const list = running(2)
      const frame = await frameOf(sdk, [targetView(0, { runningSessions: list }), targetView(1)], lang)
      await p.deliver(frame)
      const [a, b] = frame.targets
      assert.equal(String(p.row(a.name).props['aria-expanded']), 'false', 'the row was opened')
      const [ul, ...more] = lists(p)
      assert.equal(more.length, 0, 'a list for a target with no session')
      assert.equal(ul.props[HOOK.list], a.targetId)
      assert.equal(ul.props['aria-label'], WORDS.heading[lang])
      assert.ok(p.item(a.name).includes(ul), 'the list is not inside its target\'s item')
      assert.ok(!p.item(b.name).some((n) => n.props?.[HOOK.list] !== undefined), 'B shows a list')
      assert.deepEqual(items(p).map((n) => n.props[HOOK.item]), list.map((s) => s.sessionId))
      for (const [i, node] of items(p).entries()) {
        const inside = [node, ...(node.children ?? []).flatMap(function all(x) { return typeof x === 'string' ? [] : [x, ...(x.children ?? []).flatMap(all)] })]
        assert.ok(inside.some((n) => n.props?.['data-state'] === 'ongoing'), 'no ongoing dot')
        const text = inside.find((n) => (n.children ?? []).includes(list[i].title))
        assert.ok(text, 'the title is not one text node')
        assert.equal(text.props.title, list[i].title)
        assert.equal(inside.some((n) => n.tag === 'button' || n.tag === 'a' || n.props?.onClick !== undefined), false, 'an item is a control')
      }
    })
  }
  t('SES-SB-EP-02', 'markup title', 'a markup-looking title is drawn as text: no element from it', async (c) => {
    const p = await sidebarPage(c, sdk)
    await p.deliver(await frameOf(sdk, [targetView(0, { runningSessions: [{ sessionId: 's', title: FIXTURE.names.markup }] })]))
    assert.ok(p.sidebarNodes().some((n) => (n.children ?? []).includes(FIXTURE.names.markup)))
    assert.deepEqual(p.sidebarNodes().filter((n) => n.tag === 'b'), [])
    assert.ok(!p.sidebarNodes().some((n) => n.props.dangerouslySetInnerHTML !== undefined))
  })
  for (const [label, overrides] of [['no session', { runningSessions: [] }], ['unknown', { runningSessions: null }], ['not connected', { state: ST.failed, runningSessions: running(1) }]]) {
    t('SES-SB-DT-01', label, `${label} → no sessions list`, async (c) => {
      const p = await sidebarPage(c, sdk)
      await p.deliver(await frameOf(sdk, [targetView(0, overrides)]))
      assert.deepEqual(lists(p), [])
      assert.deepEqual(items(p), [])
    })
  }
  t('SES-SB-ST-01', 'sessions end', 'one running → shown; the next frame with none → the list is gone', async (c) => {
    const p = await sidebarPage(c, sdk)
    await p.deliver(await frameOf(sdk, [targetView(0, { runningSessions: running(1) })]))
    assert.equal(items(p).length, 1)
    await p.deliver(await frameOf(sdk, [targetView(0, { runningSessions: [] })]))
    assert.deepEqual(lists(p), [])
  })
  t('SES-SB-ST-02', 'stream lost', 'the stream fails → the list is hidden (the rows stay); a live frame again → shown', async (c) => {
    const p = await sidebarPage(c, sdk)
    const frame = await frameOf(sdk, [targetView(0, { runningSessions: running(2) })])
    await p.deliver(frame)
    assert.equal(lists(p).length, 1)
    await p.fail(false)
    assert.deepEqual(lists(p), [], 'a stale list is still drawn')
    assert.equal(p.rows().length, 1)
    await p.deliver(frame)
    assert.equal(lists(p).length, 1)
  })
  t('SES-SB-ST-03', 'details unaffected', 'pressing the row opens and closes its details as before; the sessions list stays in both states', async (c) => {
    const p = await sidebarPage(c, sdk)
    const frame = await frameOf(sdk, [targetView(0, { runningSessions: running(1) })])
    await p.deliver(frame)
    const [a] = frame.targets
    await p.toggle(a.name)
    assert.equal(String(p.row(a.name).props['aria-expanded']), 'true')
    assert.equal(p.byHook('data-fishball-target-details', p.sidebarNodes()).length, 1)
    assert.equal(items(p).length, 1)
    await p.toggle(a.name)
    assert.equal(String(p.row(a.name).props['aria-expanded']), 'false')
    assert.equal(p.byHook('data-fishball-target-details', p.sidebarNodes()).length, 0)
    assert.equal(items(p).length, 1)
    assert.equal(p.rows().filter(isRow).length, 1, 'a session became a row')
  })
}
