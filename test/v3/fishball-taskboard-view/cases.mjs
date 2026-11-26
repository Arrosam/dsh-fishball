/**
 * fishball-taskboard.view black-box rows (USE-CASES.md beside this file): the "Task board" tab's
 * view and edit modes, from the view requirements alone (.runtime/repro/VIEW-SPEC.md, relayed by
 * the lead 2026-11-22, with the lead's two refinements: V6's toggle only with details, and the
 * title hook [data-fishball-title]). page.mjs says how the tab is drawn and measured.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from '../contract/package-boundaries/cases.mjs'
import { chromeBinary } from '../../v2-page-cases/lite-browser.mjs'
import { stopBrowser } from '../fishball-ui/contrast/page.mjs'
import { THEME } from '../fishball-ui/contrast/constants.mjs'
import { parseColour } from '../fishball-ui/contrast/wcag.mjs'
import { contains, textOf } from '../../support/rp-recommend.mjs'
import { BOUND, COLOUR, COPY, FIXTURE, HARNESS, HOOK, STATUS, TASKBOARD } from './constants.mjs'
import { BAR_PROBE, STYLE_PROBE, board, boardTab, memo, own, ownText, rendered, task } from './page.mjs'

const show = (v) => JSON.stringify(v)
const near = (a, b, tolerance) => Math.abs(a - b) <= tolerance
const sameRgb = (a, b) => ['r', 'g', 'b'].every((c) => Math.abs(a[c] - b[c]) <= BOUND.channel)
const sameColour = (a, b) => sameRgb(a, b) && Math.abs(a.a - b.a) <= BOUND.channel
const id = FIXTURE.id
/** React writes an attribute for any value but undefined / null (a false data-* is written "false"). */
const present = (node, name) => node?.props?.[name] !== undefined && node?.props?.[name] !== null
const isTrue = (v) => v === true || v === 'true'
const isFalse = (v) => v === false || v === 'false'
const PERCENT = /\d+\s*%/
/** Press a control a row needs, failing with what was missing (a behaviour message, not "nothing to press"). */
async function press(tab, node, what) {
  assert.ok(node, 'no ' + what + ' to press')
  await tab.press(node)
}

export function registerViewCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  /** A rendered row: skipped where no Chromium exists (as the contrast and LITE rows are). */
  const tr = (id, row, title, fn) => caseTest(sdk, id, row, title, async (c) => {
    if (!chromeBinary()) { c.skip(HARNESS.skipNoChrome); return }
    await fn(c)
  })
  after(stopBrowser)
  registerBugRows(sdk, tr)
  registerSummaryRows(sdk, t, tr)
  registerRowFormRows(sdk, t, tr)
  registerCondensedToggleRows(sdk, t)
  registerCompletedRows(sdk, t)
  registerCollapseRows(sdk, t)
  registerNoteRows(sdk, t, tr)
  registerEmptyAndMemoRows(sdk, t)
  registerNarrowRows(sdk, tr)
  registerEditRows(sdk, t)
  registerAutoRows(sdk, t)
}

// ============================================================================ B1: the bar's fill

/** B1's clauses for one measured bar at progress `p`: the list of those it breaks (empty = all hold). */
function fillViolations({ track, fill }, p) {
  const out = []
  if (!(track.width > 0)) out.push(`the track has no width (${track.width} px)`)
  const want = (track.width * p) / 100
  if (!near(fill.width, want, BOUND.widthPx)) out.push(`fill width ${fill.width} px, want ${want.toFixed(2)} px (${p}% of the ${track.width} px track, ±${BOUND.widthPx})`)
  if (p > 0 && !(fill.height > 0)) out.push(`fill height ${fill.height} px (must be > 0)`)
  if (p > 0 && !near(fill.height, track.height, BOUND.heightPx)) out.push(`fill height ${fill.height} px, track ${track.height} px (±${BOUND.heightPx})`)
  const ink = parseColour(fill.bg)
  if (!(ink.a > 0)) out.push('the fill colour is transparent: ' + fill.bg)
  if (sameColour(ink, parseColour(track.bg))) out.push(`the fill colour ${fill.bg} equals the track's ${track.bg}`)
  const inside = fill.left >= track.left - BOUND.widthPx && fill.right <= track.right + BOUND.widthPx && fill.top >= track.top - BOUND.heightPx && fill.bottom <= track.bottom + BOUND.heightPx
  if (!inside) out.push('the fill leaves the track')
  return out
}
function registerBugRows(sdk, tr) {
  for (const theme of THEME.all()) {
    for (const p of BOUND.progress) {
      tr('TBV-B1-BVA-01', theme.id + ' ' + p + '%', `an open task at progress ${p} in the ${theme.id} theme: fill width = ${p}% of the track (±${BOUND.widthPx} px), height = track's when p > 0, width 0 at 0, colour visible and unlike the track, inside the track`, async (c) => {
        const tab = await boardTab(c, sdk)
        await tab.deliver(board([task(1, { status: STATUS.inProgress, progress: p })]))
        const { rows } = await rendered(tab, sdk, { theme, probe: BAR_PROBE })
        const [row] = rows
        assert.ok(row && row.bars === 1, 'precondition: the open row has one progress bar: ' + show(rows))
        assert.equal(row.now, String(p), 'aria-valuenow')
        assert.ok(row.fill, 'the bar has no element child (its fill): ' + show(row))
        // Every clause of B1 is checked and all violations are reported together.
        assert.deepEqual(fillViolations(row, p), [], 'track ' + show(row.track) + ' fill ' + show(row.fill))
      })
    }
  }
}

// ============================================================================ shared readers

const rowSelector = (n) => `li[${HOOK.task}="${id(n)}"]`
const ownBy = (row, name, value) => own(row).filter((n) => present(n, name) && (value === undefined || String(n.props[name]) === String(value)))
const ownBars = (row) => own(row).filter((n) => n.props.role === HOOK.progressbar)
const ownTitle = (row) => ownBy(row, HOOK.title)[0]
const ownChip = (row) => ownBy(row, HOOK.chip)[0]
const ownNote = (row) => ownBy(row, HOOK.note)[0]
const ownToggles = (row) => own(row).filter((n) => n.tag === 'button' && present(n, 'aria-expanded'))
const ownCollapse = (row) => own(row).find((n) => n.tag === 'button' && [COPY.collapse, COPY.expand].includes(n.props['aria-label']))
const ownMore = (row) => own(row).find((n) => n.tag === 'button' && [COPY.more, COPY.less].includes(textOf(n).trim()))
const isCondensed = (row) => present(row, HOOK.condensed)
const group = (tab) => tab.byAttr(HOOK.completed)[0]
const groupToggle = (tab) => { const g = group(tab); return g && tab.buttons([g]).find((b) => present(b, 'aria-expanded')) }
/** Every rendering of task n in the tab (a row id should appear once). */
const renderings = (tab, n) => tab.rows().filter((r) => r.props[HOOK.task] === id(n))

/** Whole-tab text and every field value (a draft's typed values live in props, not in text). */
function shownValues(tab) {
  const values = tab.all().flatMap((n) => [n.props.value, n.props.defaultValue].filter((v) => typeof v === 'string'))
  return [tab.text(), ...values].join(' ')
}

/** The decision-table expectation of one task in view mode (V2–V5, V7). */
function assertForm(tab, n, form, { status, note, progress }) {
  const rows = renderings(tab, n)
  const g = group(tab)
  if (form === 'absent' || form === 'grouped') { assert.equal(rows.length, 0, `task ${n} (${form}) is rendered as a row`); return }
  assert.equal(rows.length, 1, `task ${n} (${form}) rendered ${rows.length} times`)
  const [row] = rows
  assert.equal(row.props[HOOK.status], status, `task ${n}: data-status`)
  assert.ok(!(g && contains(g, row)), `task ${n} (${form}) is in the Completed group, not in place`)
  assert.equal(textOf(ownTitle(row) ?? '').trim(), FIXTURE.title(n), `task ${n}: no [${HOOK.title}] with its title`)
  assert.equal(textOf(ownChip(row) ?? '').trim(), STATUS.label[status], `task ${n}: status chip`)
  const open = STATUS.open.includes(status)
  if (form === 'condensed') {
    assert.ok(isCondensed(row), `task ${n} should be condensed (data-condensed)`)
    assert.equal(ownNote(row), undefined, `condensed task ${n} shows its note`)
  } else {
    assert.ok(!isCondensed(row), `task ${n} should be a full row, it has data-condensed`)
    if (note) assert.ok(textOf(ownNote(row) ?? '').includes(note), `full task ${n}: note not shown`)
  }
  assert.equal(ownBars(row).length, open ? 1 : 0, `task ${n} (${status}, ${form}): progress bars`)
  if (open) assert.ok(ownText(row).includes(COPY.percent(progress)), `open task ${n}: no "${COPY.percent(progress)}" text`)
  else assert.doesNotMatch(ownText(row), PERCENT, `closed task ${n} shows a percentage`)
}

// ============================================================================ V1: the summary
function registerSummaryRows(sdk, t, tr) {
  // Every status, at several depths: todo 2 (one at depth 3), in_progress 1, blocked 0, done 2 (one nested), dropped 1.
  const mixed = [
    task(1, { status: STATUS.inProgress, progress: 10 }),
    task(2, { parent: 1, status: STATUS.todo }),
    task(3, { parent: 2, status: STATUS.done, progress: 100 }),
    task(4, { parent: 3, status: STATUS.todo }),
    task(5, { status: STATUS.dropped }),
    task(6, { status: STATUS.done }),
  ]
  const counts = (tasks) => Object.fromEntries(STATUS.order.map((s) => [s, tasks.filter((x) => x.status === s).length]))
  const number = (n) => new RegExp('(^|\\D)' + n + '(\\D|$)')
  const cases = [
    ['mixed depths, one status at 0', mixed],
    ['exactly one of each status', STATUS.order.map((status, i) => task(i + 1, { status }))],
    ['one task', [task(1)]],
  ]
  for (const [label, tasks] of cases) {
    t('TBV-V1-EP-01', label, 'summary: heading "Tasks · n unfinished" (open tasks, every depth); one count chip per status with count > 0, in the order todo, in_progress, blocked, done, dropped, holding the number and the label', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      const summary = tab.byAttr(HOOK.summary)[0]
      assert.ok(summary, 'no summary')
      const open = tasks.filter((x) => STATUS.open.includes(x.status)).length
      const headings = tab.all().filter((n) => n.tag === 'h2').map((n) => textOf(n).trim())
      assert.ok(headings.includes(COPY.heading(open)), 'h2 headings ' + show(headings))
      const want = counts(tasks)
      const chips = tab.byAttr(HOOK.count, undefined, [summary])
      assert.deepEqual(chips.map((ch) => ch.props[HOOK.count]), STATUS.order.filter((s) => want[s] > 0), 'chip statuses in order')
      for (const ch of chips) {
        const s = ch.props[HOOK.count]
        assert.match(textOf(ch), number(want[s]), `chip ${s}: number ${want[s]}`)
        assert.ok(textOf(ch).includes(STATUS.label[s]), `chip ${s}: label`)
      }
    })
  }
  // Overall bar: E = not dropped, D = done (every depth). BVA: E 0 (absent), D 0, 0 < D < E, D = E.
  const overall = [
    ['E = 0 (every task dropped)', [task(1, { status: STATUS.dropped }), task(2, { parent: 1, status: STATUS.dropped })], null],
    ['D = 0 < E', [task(1), task(2, { parent: 1, status: STATUS.dropped }), task(3, { parent: 1, status: STATUS.blocked })], [0, 2]],
    ['0 < D < E, a nested done', [task(1, { status: STATUS.inProgress }), task(2, { parent: 1, status: STATUS.done }), task(3, { status: STATUS.dropped }), task(4, { status: STATUS.todo })], [1, 3]],
    ['D = E', [task(1, { status: STATUS.done }), task(2, { parent: 1, status: STATUS.done }), task(3, { status: STATUS.dropped })], [2, 2]],
  ]
  for (const [label, tasks, de] of overall) {
    t('TBV-V1-BVA-01', label, 'overall bar: absent when E = 0; else aria-valuemin 0, aria-valuemax E, aria-valuenow D, text "D of E done"', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      const bars = tab.all().filter((n) => n.props.role === HOOK.progressbar && present(n, HOOK.overall))
      if (de === null) { assert.equal(bars.length, 0, 'an overall bar is drawn with E = 0'); return }
      assert.equal(bars.length, 1, 'overall bars')
      const [d, e] = de
      assert.deepEqual([bars[0].props['aria-valuemin'], bars[0].props['aria-valuemax'], bars[0].props['aria-valuenow']].map(String), ['0', String(e), String(d)])
      assert.ok(textOf(tab.byAttr(HOOK.summary)[0]).includes(COPY.overall(d, e)), 'summary text lacks "' + COPY.overall(d, e) + '"')
    })
    if (de === null) continue
    for (const theme of THEME.all()) {
      tr('TBV-V1-BVA-02', label + ' ' + theme.id, 'the overall bar\'s fill (first element child) is D/E of the track\'s rendered width (±1 px)', async (c) => {
        const tab = await boardTab(c, sdk)
        await tab.deliver(board(tasks))
        const { targets } = await rendered(tab, sdk, { theme, probe: STYLE_PROBE, arg: { targets: { bar: { selector: `[role=progressbar][${HOOK.overall}]` } } } })
        const bar = targets.bar
        assert.ok(bar && bar.child, 'no overall bar or no fill: ' + show(bar))
        const want = (bar.box.width * de[0]) / de[1]
        assert.ok(near(bar.child.box.width, want, BOUND.widthPx), `overall fill ${bar.child.box.width} px, want ${want.toFixed(2)} px of ${bar.box.width}`)
        if (de[0] > 0) assert.ok(bar.child.box.height > 0, 'overall fill height 0')
      })
    }
  }
}

// ============================================================================ V2–V5, V7 decision table: status × subtree × depth → form
function registerRowFormRows(sdk, t, tr) {
  const note = (n) => 'fbtest-view note ' + n
  const mk = (n, o = {}) => task(n, { note: note(n), progress: 37, ...o })
  /** [label, tasks, {n: form}] — every task's form: full, condensed, grouped (in the Completed group), absent (not a row). */
  const TABLE = [
    ['open leaf, depth 1', [mk(1, { status: STATUS.todo })], { 1: 'full' }],
    ['open parent, done leaf child', [mk(1, { status: STATUS.inProgress }), mk(2, { parent: 1, status: STATUS.done })], { 1: 'full', 2: 'condensed' }],
    ['open parent, dropped child with a done grandchild', [mk(1, { status: STATUS.blocked }), mk(2, { parent: 1, status: STATUS.dropped }), mk(3, { parent: 2, status: STATUS.done })], { 1: 'full', 2: 'condensed', 3: 'absent' }],
    ['open parent whose subtree is all closed', [mk(1, { status: STATUS.inProgress }), mk(2, { parent: 1, status: STATUS.done }), mk(3, { parent: 1, status: STATUS.dropped })], { 1: 'full', 2: 'condensed', 3: 'condensed' }],
    ['done top-level leaf', [mk(1, { status: STATUS.done }), mk(2)], { 1: 'grouped', 2: 'full' }],
    ['dropped top-level with a done child', [mk(1, { status: STATUS.dropped }), mk(2, { parent: 1, status: STATUS.done }), mk(3)], { 1: 'grouped', 2: 'absent', 3: 'full' }],
    ['done top-level with a todo child (V5)', [mk(1, { status: STATUS.done }), mk(2, { parent: 1, status: STATUS.todo })], { 1: 'full', 2: 'full' }],
    ['dropped depth 2 with a todo depth 3 (V5)', [mk(1), mk(2, { parent: 1, status: STATUS.dropped }), mk(3, { parent: 2, status: STATUS.todo })], { 1: 'full', 2: 'full', 3: 'full' }],
    ['done, done, blocked chain (V5 twice)', [mk(1, { status: STATUS.done }), mk(2, { parent: 1, status: STATUS.done }), mk(3, { parent: 2, status: STATUS.blocked })], { 1: 'full', 2: 'full', 3: 'full' }],
    ['done at depth 5 under an open chain', [mk(1), mk(2, { parent: 1 }), mk(3, { parent: 2 }), mk(4, { parent: 3, status: STATUS.inProgress }), mk(5, { parent: 4, status: STATUS.done })], { 1: 'full', 2: 'full', 3: 'full', 4: 'full', 5: 'condensed' }],
    ['open parent: a done leaf and a dropped child with an open child, in place', [mk(1), mk(2, { parent: 1, status: STATUS.done }), mk(3, { parent: 1, status: STATUS.dropped }), mk(4, { parent: 3, status: STATUS.blocked })], { 1: 'full', 2: 'condensed', 3: 'full', 4: 'full' }],
  ]
  for (const [label, tasks, forms] of TABLE) {
    t('TBV-FORM-DT-01', label, 'view mode: open → full row with bar and "p%"; closed with an open descendant → full row, note, no bar; closed subtree → condensed (title + chip, data-condensed, no note, no bar), its descendants not rows; top-level closed subtree → Completed group only', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      assert.equal(tab.mode(), HOOK.mode.view)
      for (const x of tasks) {
        const n = Number(x.id.slice(-12))
        assertForm(tab, n, forms[n], { status: x.status, note: note(n), progress: 37 })
      }
      // Full rows keep the tree order (V5: subtasks listed under their parent).
      const shown = tab.rowIds()
      const order = tasks.map((x) => x.id).filter((x) => shown.includes(x))
      assert.deepEqual(shown, order, 'rows not in tree order')
    })
  }
  // V2: an open row per open status, note empty / non-empty, progress boundaries.
  for (const status of STATUS.open) {
    for (const [noteLabel, text] of [['no note', ''], ['a note', 'fbtest-view open note']]) {
      for (const progress of [0, 100]) {
        t('TBV-V2-EP-01', `${status}, ${noteLabel}, ${progress}%`, 'an open row: title, status chip with the label, one progressbar (aria 0..100, valuenow p), "p%" text, the note only when non-empty', async (c) => {
          const tab = await boardTab(c, sdk)
          await tab.deliver(board([task(1, { status, progress, note: text })]))
          const row = tab.row(1)
          assert.ok(row, 'no row')
          assert.equal(textOf(ownTitle(row) ?? '').trim(), FIXTURE.title(1), 'no [data-fishball-title] with the title')
          assert.equal(textOf(ownChip(row) ?? '').trim(), STATUS.label[status], 'no [data-fishball-status] chip with the label')
          const bars = ownBars(row)
          assert.equal(bars.length, 1, 'progress bars')
          assert.deepEqual([bars[0].props['aria-valuemin'], bars[0].props['aria-valuemax'], bars[0].props['aria-valuenow']].map(String), ['0', '100', String(progress)])
          assert.ok(ownText(row).includes(COPY.percent(progress)), 'no "' + COPY.percent(progress) + '"')
          if (text) assert.equal(textOf(ownNote(row) ?? '').trim(), text, 'no [data-fishball-note] with the note')
          else assert.equal(ownNote(row), undefined, 'an empty note is drawn')
        })
      }
    }
  }
  // V2 rendered: fill colour by status × page brand × theme.
  for (const theme of THEME.all()) {
    for (const brand of [null, HOOK.brandDeepseek]) {
      for (const status of STATUS.open) {
        const want = status === STATUS.blocked ? 'warn' : brand ? 'business' : 'accent'
        tr('TBV-V2-DT-01', `${status}, brand ${brand ?? 'default'}, ${theme.id}`, `the bar fill colour is ${want === 'accent' ? 'the Fishball accent #EC0A6E' : 'DSH ' + COLOUR[want]}`, async (c) => {
          const tab = await boardTab(c, sdk)
          if (brand) tab.setBrand(brand)
          await tab.deliver(board([task(1, { status, progress: 50 })]))
          const { rows, tokens } = await rendered(tab, sdk, { theme, probe: BAR_PROBE, arg: { htmlAttrs: brand ? { [HOOK.brandAttr]: brand } : {}, tokens: [COLOUR.business, COLOUR.warn] } })
          const fill = rows[0]?.fill
          assert.ok(fill, 'no fill: ' + show(rows))
          const ink = parseColour(fill.bg)
          assert.ok(ink.a > 0, 'transparent fill ' + fill.bg)
          const expected = want === 'accent' ? { r: COLOUR.accent.r / 255, g: COLOUR.accent.g / 255, b: COLOUR.accent.b / 255 } : parseColour(tokens[COLOUR[want]])
          assert.ok(sameRgb(ink, expected), `fill ${fill.bg}, want ${want === 'accent' ? '#EC0A6E' : COLOUR[want] + ' = ' + tokens[COLOUR[want]]}`)
        })
      }
    }
  }
  // V4 rendered: done condensed glows green, dropped condensed is grey; in place and in the Completed group.
  for (const theme of THEME.all()) {
    for (const status of STATUS.closed) {
      for (const placement of ['in place', 'Completed group']) {
        tr('TBV-V4-DT-01', `${status}, ${placement}, ${theme.id}`, status === STATUS.done
          ? 'a done condensed row: border colour RGB = --dsw-alias-state-success-primary, box-shadow not none'
          : 'a dropped condensed row: title colour = --dsw-alias-label-tertiary, border not green', async (c) => {
          const tab = await boardTab(c, sdk)
          const tasks = placement === 'in place' ? [task(1), task(2, { parent: 1, status })] : [task(1), task(2, { status })]
          await tab.deliver(board(tasks))
          if (placement !== 'in place') await press(tab, groupToggle(tab), 'Completed group toggle')
          assert.ok(tab.row(2) && isCondensed(tab.row(2)), 'precondition: task 2 is drawn condensed')
          const { targets, tokens } = await rendered(tab, sdk, { theme, probe: STYLE_PROBE, arg: { targets: { row: { selector: rowSelector(2) }, title: { selector: `[${HOOK.title}]`, row: id(2) } }, tokens: [COLOUR.success, COLOUR.tertiary] } })
          const drawn = targets.row.sides.filter((s) => s.width > 0 && s.style !== 'none')
          const success = parseColour(tokens[COLOUR.success])
          const green = drawn.filter((s) => sameRgb(parseColour(s.colour), success))
          if (status === STATUS.done) {
            assert.ok(drawn.length > 0 && green.length === drawn.length, `border sides ${show(drawn)}, want RGB of ${tokens[COLOUR.success]}`)
            assert.notEqual(targets.row.boxShadow, 'none', 'no glow (box-shadow none)')
          } else {
            assert.ok(targets.title, 'no [data-fishball-title] in the row')
            assert.ok(sameColour(parseColour(targets.title.color), parseColour(tokens[COLOUR.tertiary])), `title colour ${targets.title.color}, want ${tokens[COLOUR.tertiary]}`)
            assert.equal(green.length, 0, 'a dropped row has a green border: ' + show(drawn))
          }
        })
      }
    }
  }
}

// ============================================================================ V6: the condensed row's toggle
function registerCondensedToggleRows(sdk, t) {
  const NOTE = 'fbtest-view condensed note'
  // 1 open root; 2 done (in place) with note and children 3 (done, note, child 5) and 4 (dropped, nothing).
  const tree = () => board([
    task(1),
    task(2, { parent: 1, status: STATUS.done, note: NOTE }),
    task(3, { parent: 2, status: STATUS.done, note: NOTE + ' 3' }),
    task(4, { parent: 2, status: STATUS.dropped }),
    task(5, { parent: 3, status: STATUS.dropped }),
  ])
  const details = (row) => ownBy(row, HOOK.details)[0]
  t('TBV-V6-ST-01', 'collapsed → expanded → collapsed', 'a condensed row with a note and children: toggle aria-expanded false, no details; press → true, details with the note and the direct children as condensed rows, no bar; press → hidden; no request', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(tree())
    const row = () => tab.row(2)
    assert.ok(row() && isCondensed(row()), 'task 2 (done, closed subtree under an open parent) is not a condensed row')
    assert.equal(ownToggles(row()).length, 1, 'toggles of row 2')
    assert.ok(isFalse(ownToggles(row())[0].props['aria-expanded']))
    assert.equal(details(row()), undefined, 'details shown before expanding')
    assert.equal(tab.row(3), undefined)
    await press(tab, ownToggles(row())[0], 'condensed row toggle')
    assert.ok(isTrue(ownToggles(row())[0].props['aria-expanded']), 'aria-expanded after the press')
    const d = details(row())
    assert.ok(d, 'no [data-fishball-task-details]')
    assert.ok(textOf(d).includes(NOTE), 'the note is not in the details')
    for (const n of [3, 4]) {
      const child = tab.row(n, [d])
      assert.ok(child && isCondensed(child), `child ${n} not a condensed row in the details`)
      assert.equal(ownBars(child).length, 0, `child ${n} has a bar`)
      assert.doesNotMatch(ownText(child), PERCENT)
    }
    assert.equal(ownBars(row()).length, 0, 'the expanded row has a bar')
    assert.doesNotMatch(ownText(row()), PERCENT)
    await press(tab, ownToggles(row())[0], 'condensed row toggle')
    assert.ok(isFalse(ownToggles(row())[0].props['aria-expanded']))
    assert.equal(details(row()), undefined, 'details still shown')
    for (const n of [3, 4, 5]) assert.equal(tab.row(n), undefined, `task ${n} still rendered`)
    assert.deepEqual(tab.requests(), [], 'the toggle sent a request')
  })
  t('TBV-V6-ST-02', 'direct children only, each its own toggle', 'expanding reveals the direct children only (a grandchild only when its parent is expanded); a revealed child with details is its own toggle, one without details is a plain line', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(tree())
    await press(tab, tab.row(2) && ownToggles(tab.row(2))[0], 'condensed row 2 toggle')
    assert.equal(tab.row(5), undefined, 'a grandchild revealed with the children')
    assert.equal(ownToggles(tab.row(3)).length, 1, 'child 3 (note + child) has no toggle')
    assert.equal(ownToggles(tab.row(4)).length, 0, 'child 4 (no note, no child) is a toggle')
    await press(tab, ownToggles(tab.row(3))[0], 'condensed child 3 toggle')
    const grandchild = tab.row(5, [details(tab.row(3))])
    assert.ok(grandchild && isCondensed(grandchild), 'grandchild 5 not revealed as a condensed row')
    assert.deepEqual(tab.requests(), [])
  })
  const kinds = [
    ['note only', [task(1), task(2, { parent: 1, status: STATUS.done, note: NOTE })], true],
    ['descendants only', [task(1), task(2, { parent: 1, status: STATUS.dropped }), task(3, { parent: 2, status: STATUS.done })], true],
    ['neither note nor descendants', [task(1), task(2, { parent: 1, status: STATUS.done })], false],
  ]
  for (const [label, tasks, toggles] of kinds) {
    t('TBV-V6-EP-01', label, toggles ? 'a condensed row with details is a button with aria-expanded="false"' : 'a condensed row with no details is a plain line: no button with aria-expanded', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      const row = tab.row(2)
      assert.ok(row && isCondensed(row), 'task 2 (closed subtree under an open parent) is not a condensed row: ' + show(row?.props ?? null))
      const own = ownToggles(row)
      assert.equal(own.length, toggles ? 1 : 0, 'toggles')
      if (toggles) assert.ok(isFalse(own[0].props['aria-expanded']))
      assert.equal(details(row), undefined)
    })
  }
}

// ============================================================================ V7: the Completed group
function registerCompletedRows(sdk, t) {
  const cases = [
    ['n = 0: no top-level closed subtree (a closed subtree under an open parent, a V5 top-level)', [task(1), task(2, { parent: 1, status: STATUS.done }), task(3, { status: STATUS.done }), task(4, { parent: 3 })], []],
    ['n = 1', [task(1, { status: STATUS.done }), task(2)], [1]],
    ['n = 2, one with closed descendants', [task(1, { status: STATUS.dropped }), task(2, { parent: 1, status: STATUS.done }), task(3), task(4, { status: STATUS.done })], [1, 4]],
    ['every task closed', [task(1, { status: STATUS.done }), task(2, { status: STATUS.dropped })], [1, 2]],
  ]
  for (const [label, tasks, grouped] of cases) {
    t('TBV-V7-BVA-01', label, 'the Completed group holds the top-level closed subtrees: absent at n = 0, else its button reads "Completed (n)", aria-expanded false, their rows not rendered', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      const g = group(tab)
      if (grouped.length === 0) { assert.equal(g, undefined, 'a Completed group with n = 0'); return }
      assert.ok(g, 'no Completed group')
      const button = groupToggle(tab)
      assert.ok(button, 'no button with aria-expanded in the group')
      assert.equal(textOf(button).trim(), COPY.completed(grouped.length))
      assert.ok(isFalse(button.props['aria-expanded']), 'not collapsed by default')
      for (const n of grouped) assert.equal(renderings(tab, n).length, 0, `task ${n} rendered while the group is collapsed`)
    })
  }
  t('TBV-V7-ST-01', 'collapsed → expanded → collapsed', 'expanding shows the grouped tasks as condensed rows inside the group (not in the main list), their descendants not rows; collapsing hides them again; no request', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(board([task(1, { status: STATUS.dropped }), task(2, { parent: 1, status: STATUS.done }), task(3), task(4, { status: STATUS.done })]))
    await press(tab, groupToggle(tab), 'Completed group toggle')
    assert.ok(isTrue(groupToggle(tab).props['aria-expanded']))
    for (const n of [1, 4]) {
      const rows = renderings(tab, n)
      assert.equal(rows.length, 1, `task ${n} renderings`)
      assert.ok(contains(group(tab), rows[0]), `task ${n} not inside the group`)
      assert.ok(isCondensed(rows[0]), `task ${n} not condensed`)
      assert.equal(ownBars(rows[0]).length, 0)
    }
    assert.equal(tab.row(2), undefined, 'a grouped task\'s descendant is a row')
    assert.ok(!contains(group(tab), tab.row(3)), 'an open task is in the group')
    await press(tab, groupToggle(tab), 'Completed group toggle')
    assert.ok(isFalse(groupToggle(tab).props['aria-expanded']))
    for (const n of [1, 4]) assert.equal(renderings(tab, n).length, 0)
    assert.deepEqual(tab.requests(), [])
  })
}

// ============================================================================ V8: collapse a parent's subtasks
function registerCollapseRows(sdk, t) {
  const chain = [task(1), task(2, { parent: 1 }), task(3, { parent: 2, status: STATUS.inProgress }), task(4, { parent: 3 }), task(5, { parent: 4, status: STATUS.blocked }), task(6)]
  const cases = [
    ['open row, 0 children', [task(1)], 1, false],
    ['open row, 1 child', [task(1), task(2, { parent: 1 })], 1, true],
    ['V5 row (done with an open child)', [task(1, { status: STATUS.done }), task(2, { parent: 1 })], 1, true],
    ['open row whose only child is condensed', [task(1), task(2, { parent: 1, status: STATUS.done })], 1, true],
    ['condensed row with children', [task(1), task(2, { parent: 1, status: STATUS.done }), task(3, { parent: 2, status: STATUS.done })], 2, false],
  ]
  for (const [label, tasks, n, has] of cases) {
    t('TBV-V8-EP-01', label, has ? 'a full row with >= 1 child has a "Collapse subtasks" button, aria-expanded true' : 'no "Collapse subtasks" button (no child, or not a full row)', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks))
      const button = ownCollapse(tab.row(n))
      if (!has) { assert.equal(button, undefined); return }
      assert.ok(button, 'no Collapse subtasks button')
      assert.equal(button.props['aria-label'], COPY.collapse)
      assert.ok(isTrue(button.props['aria-expanded']))
    })
  }
  t('TBV-V8-ST-01', 'expanded → collapsed → expanded', 'collapsing the top of a depth-5 chain hides every descendant row (label "Expand subtasks", aria-expanded false), a sibling stays; expanding shows them again; no request', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(board(chain))
    await press(tab, ownCollapse(tab.row(1)), 'Collapse subtasks button')
    const button = ownCollapse(tab.row(1))
    assert.equal(button.props['aria-label'], COPY.expand)
    assert.ok(isFalse(button.props['aria-expanded']))
    assert.deepEqual(tab.rowIds(), [id(1), id(6)], 'rows while collapsed')
    await press(tab, ownCollapse(tab.row(1)), 'Expand subtasks button')
    assert.equal(ownCollapse(tab.row(1)).props['aria-label'], COPY.collapse)
    assert.deepEqual(tab.rowIds(), chain.map((x) => x.id))
    assert.deepEqual(tab.requests(), [], 'collapsing sent a request')
  })
  t('TBV-V8-ST-02', 'reset on remount', 'a collapsed parent is expanded again after the tab remounts', async (c) => {
    const tab = await boardTab(c, sdk)
    const frame = board(chain)
    await tab.deliver(frame)
    await press(tab, ownCollapse(tab.row(2)), 'Collapse subtasks button')
    assert.equal(tab.row(3), undefined, 'precondition: collapsed')
    await tab.remount()
    await tab.deliver(frame)
    assert.equal(ownCollapse(tab.row(2))?.props['aria-label'], COPY.collapse)
    assert.deepEqual(tab.rowIds(), chain.map((x) => x.id))
  })
}

// ============================================================================ V9: notes
function registerNoteRows(sdk, t, tr) {
  const ASTRAL = '\u{1F41F}'
  const cases = [
    ['empty', '', null],
    ['120 code points', 'a'.repeat(BOUND.noteCodePoints), false],
    ['121 code points', 'a'.repeat(BOUND.noteCodePoints + 1), true],
    ['120 astral code points (240 UTF-16 units)', ASTRAL.repeat(BOUND.noteCodePoints), false],
    ['121 astral code points', ASTRAL.repeat(BOUND.noteCodePoints + 1), true],
    ['short, with a line break', 'fbtest line one\nline two', true],
  ]
  for (const [label, text, clamped] of cases) {
    t('TBV-V9-BVA-01', label, clamped === null ? 'an empty note draws no [data-fishball-note]' : clamped ? 'longer than 120 code points or with a line break: a "Show more" button, aria-expanded false' : 'up to 120 code points, one line: no Show more button', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board([task(1, { note: text })]))
      const row = tab.row(1)
      if (clamped === null) { assert.equal(ownNote(row), undefined); return }
      assert.ok(ownNote(row), 'no note')
      const more = ownMore(row)
      if (!clamped) { assert.equal(more, undefined, 'a Show more button on a short note'); return }
      assert.ok(more, 'no Show more button')
      assert.equal(textOf(more).trim(), COPY.more)
      assert.ok(isFalse(more.props['aria-expanded']))
    })
  }
  t('TBV-V9-ST-01', 'more → less → more', 'pressing Show more makes it "Show less" (aria-expanded true); again → "Show more" (false); no request', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(board([task(1, { note: 'b'.repeat(BOUND.noteCodePoints + 1) })]))
    await press(tab, ownMore(tab.row(1)), 'Show more button')
    assert.equal(textOf(ownMore(tab.row(1))).trim(), COPY.less)
    assert.ok(isTrue(ownMore(tab.row(1)).props['aria-expanded']))
    await press(tab, ownMore(tab.row(1)), 'Show less button')
    assert.equal(textOf(ownMore(tab.row(1))).trim(), COPY.more)
    assert.ok(isFalse(ownMore(tab.row(1)).props['aria-expanded']))
    assert.deepEqual(tab.requests(), [])
  })
  const LONG = Array.from({ length: 80 }, (_, i) => 'fbtest word ' + i).join(' ')
  tr('TBV-V9-ST-02', 'clamped is shorter', 'rendered: a long note is drawn shorter while clamped than after Show more', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(board([task(1, { note: LONG })]))
    const probe = { theme: THEME.light, probe: STYLE_PROBE, arg: { targets: { note: { selector: `[${HOOK.note}]`, row: id(1) } } } }
    const clamped = (await rendered(tab, sdk, probe)).targets.note
    await press(tab, ownMore(tab.row(1)), 'Show more button')
    const open = (await rendered(tab, sdk, probe)).targets.note
    assert.ok(clamped && open, 'no note drawn')
    assert.ok(clamped.box.height < open.box.height, `clamped ${clamped.box.height} px, expanded ${open.box.height} px`)
  })
  for (const theme of THEME.all()) {
    tr('TBV-V9-EP-02', 'muted ' + theme.id, 'rendered: the note is muted — its colour is not the title\'s colour', async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board([task(1, { note: 'fbtest-view muted note' })]))
      const { targets } = await rendered(tab, sdk, { theme, probe: STYLE_PROBE, arg: { targets: { note: { selector: `[${HOOK.note}]`, row: id(1) }, title: { selector: `[${HOOK.title}]`, row: id(1) } } } })
      assert.ok(targets.note && targets.title, 'note or title missing: ' + show(targets))
      assert.ok(!sameColour(parseColour(targets.note.color), parseColour(targets.title.color)), `note ${targets.note.color} = title ${targets.title.color}`)
    })
  }
}

// ============================================================================ V10, V11: empty states and memos
function registerEmptyAndMemoRows(sdk, t) {
  for (const tasks of [0, 1]) {
    for (const memos of [0, 1]) {
      t('TBV-V10-DT-01', `${tasks} task(s), ${memos} memo(s)`, 'one [data-fishball-empty] "Nothing yet." per empty section (tasks, memos); no summary without tasks', async (c) => {
        const tab = await boardTab(c, sdk)
        await tab.deliver(board(tasks ? [task(1)] : [], memos ? [memo(1, 'fbtest-view memo')] : []))
        const empty = tab.byAttr(HOOK.empty)
        assert.equal(empty.length, (tasks ? 0 : 1) + (memos ? 0 : 1), 'empty markers: ' + show(empty.map(textOf)))
        for (const e of empty) assert.equal(textOf(e).trim(), COPY.empty)
        assert.equal(tab.byAttr(HOOK.summary).length, tasks ? 1 : 0, 'summary')
      })
    }
  }
  for (const count of [1, 3]) {
    t('TBV-V11-EP-01', count + ' memo(s)', 'view mode: each memo is li[data-fishball-memo=<id>] showing its text, in board order, not an editable field', async (c) => {
      const tab = await boardTab(c, sdk)
      const memos = Array.from({ length: count }, (_, i) => memo(i + 1, 'fbtest-view memo ' + (i + 1)))
      await tab.deliver(board([task(1)], memos))
      const items = tab.all().filter((n) => n.tag === 'li' && present(n, HOOK.memo))
      assert.deepEqual(items.map((m) => m.props[HOOK.memo]), memos.map((m) => m.id))
      items.forEach((item, i) => {
        assert.ok(textOf(item).includes(memos[i].text), 'memo text')
        assert.equal(tab.all().filter((n) => contains(item, n) && ['textarea', 'input'].includes(n.tag)).length, 0, 'an editable memo in view mode')
      })
    })
  }
}

// ============================================================================ V12: narrow sidebar
function registerNarrowRows(sdk, tr) {
  const word = FIXTURE.longWord(200)
  const tasks = [
    task(1, { title: word, note: FIXTURE.longWord(2000) }),
    task(2, { parent: 1, title: word, note: 'fbtest ' + word, status: STATUS.inProgress, progress: 55 }),
    task(3, { parent: 2, title: word, status: STATUS.blocked }),
    task(4, { parent: 3, title: word }),
    task(5, { parent: 4, title: word, status: STATUS.done, note: word }),
    task(6, { title: word, status: STATUS.dropped }),
    task(7, { title: word, status: STATUS.done }),
  ]
  for (const theme of THEME.all()) {
    tr('TBV-V12-BVA-01', `${BOUND.narrowPx} px ${theme.id}`, `at a ${BOUND.narrowPx} px tab with 200-character unbreakable titles, a 2000-character note, a depth-5 chain, condensed rows and the Completed group open, the root has no horizontal overflow`, async (c) => {
      const tab = await boardTab(c, sdk)
      await tab.deliver(board(tasks, [memo(1, FIXTURE.longWord(4000))]))
      if (groupToggle(tab)) await tab.press(groupToggle(tab))
      const condensed = tab.row(5)
      if (condensed && ownToggles(condensed)[0]) await tab.press(ownToggles(condensed)[0])
      const { targets } = await rendered(tab, sdk, { theme, width: BOUND.narrowPx, probe: STYLE_PROBE, arg: { targets: { root: { selector: `[${HOOK.root}]` } } } })
      assert.ok(targets.root, 'no root')
      assert.ok(targets.root.scrollWidth <= targets.root.clientWidth, `scrollWidth ${targets.root.scrollWidth} > clientWidth ${targets.root.clientWidth}`)
    })
  }
}

// ============================================================================ E1, E2: edit mode
function registerEditRows(sdk, t) {
  // Board order differs from tree order: 3 is 1's child but listed after 2.
  const tasks = [
    task(1, { status: STATUS.inProgress, progress: 30, note: 'fbtest-edit note' }),
    task(2, { status: STATUS.done }),
    task(3, { parent: 1, status: STATUS.done }),
    task(4, { parent: 2, status: STATUS.dropped }),
    task(5, { parent: 3, status: STATUS.done }),
  ]
  const treeOrder = [1, 3, 5, 2, 4].map(id)
  const memos = [memo(1, 'fbtest-edit memo')]
  const frame = (revision = 1) => board(tasks, memos, revision)
  const field = (node, name) => own(node).find((n) => n.props['aria-label'] === name || (n.tag === 'label' && textOf(n).trim() === name))
  const control = (node, name) => own(node).find((n) => n.tag === 'button' && (n.props['aria-label'] === name || textOf(n).trim() === name))
  async function editing(c, answer) {
    const tab = await boardTab(c, sdk, { answer })
    await tab.deliver(frame())
    await tab.press(tab.button(COPY.edit))
    return tab
  }
  t('TBV-E1-UC-01', 'every task, every field', 'Edit → [data-fishball-taskboard="edit"]: every task in tree order (no condensing, no Completed group, no collapse) with Title, Status, Progress (%), Add subtask, Delete task and its subtasks, Note; memos with Delete memo; Add task, Add memo, Save, Cancel', async (c) => {
    const tab = await editing(c)
    assert.equal(tab.mode(), HOOK.mode.edit)
    assert.deepEqual(tab.rowIds(), treeOrder, 'rows in edit mode')
    for (const row of tab.rows()) {
      assert.ok(!isCondensed(row), 'a condensed row in edit mode')
      assert.equal(ownCollapse(row), undefined, 'a collapse button in edit mode')
      for (const name of COPY.fields) assert.ok(field(row, name), `row ${row.props[HOOK.task]}: no ${name}`)
      for (const name of [COPY.addSubtask, COPY.deleteTask]) assert.ok(control(row, name), `row ${row.props[HOOK.task]}: no ${name}`)
    }
    assert.equal(group(tab), undefined, 'a Completed group in edit mode')
    const memoRow = tab.all().find((n) => n.tag === 'li' && present(n, HOOK.memo))
    assert.ok(memoRow && control(memoRow, COPY.deleteMemo), 'memo without Delete memo')
    for (const name of [COPY.addTask, COPY.addMemo, COPY.save, COPY.cancel]) assert.ok(tab.button(name), 'no ' + name)
  })
  t('TBV-E1-ST-01', 'collapsed view → edit → cancel', 'a collapsed parent in view mode does not hide rows in edit mode; Cancel returns to view mode with no request', async (c) => {
    const tab = await boardTab(c, sdk)
    await tab.deliver(board([task(1), task(2, { parent: 1 })]))
    await press(tab, ownCollapse(tab.row(1)), 'Collapse subtasks button')
    await tab.press(tab.button(COPY.edit))
    assert.deepEqual(tab.rowIds(), [id(1), id(2)])
    await tab.press(tab.button(COPY.cancel))
    assert.equal(tab.mode(), HOOK.mode.view)
    assert.deepEqual(tab.requests(), [])
  })
  const EDITED = 'fbtest-edit renamed'
  async function editAndSave(c, answer) {
    const tab = await editing(c, answer)
    await tab.change(field(tab.row(3), 'Title'), EDITED)
    await tab.press(tab.button(COPY.save))
    return tab
  }
  t('TBV-E2-UC-01', 'the whole draft', 'Save posts {baseRevision, tasks, memos} — every task {id, parentId, title, note, status, progress} with the edit, every memo {id, text} — to api/fishball-taskboard/board', async (c) => {
    const tab = await editAndSave(c, () => ({ status: 200, json: { ok: true, revision: 2, changed: true, notified: true } }))
    const posts = tab.requests().filter((r) => r.method === 'POST')
    assert.equal(posts.length, 1, show(tab.requests()))
    assert.equal(new URL(posts[0].url).pathname, TASKBOARD.board)
    const body = JSON.parse(posts[0].body)
    assert.equal(body.baseRevision, 1)
    const pick = (x, keys) => Object.fromEntries(keys.map((k) => [k, x[k]]))
    const TASK_KEYS = ['id', 'parentId', 'title', 'note', 'status', 'progress']
    const byId = (a, b) => a.id.localeCompare(b.id)
    const want = tasks.map((x) => pick(x.id === id(3) ? { ...x, title: EDITED } : x, TASK_KEYS)).sort(byId)
    assert.deepEqual(body.tasks.map((x) => pick(x, TASK_KEYS)).sort(byId), want)
    assert.deepEqual(body.memos.map((m) => pick(m, ['id', 'text'])), memos.map((m) => pick(m, ['id', 'text'])))
  })
  const OUTCOMES = [
    ['changed, told', { status: 200, json: { ok: true, revision: 2, changed: true, notified: true } }, COPY.saved],
    ['changed, not told', { status: 200, json: { ok: true, revision: 2, changed: true, notified: false } }, COPY.savedUntold],
    ['nothing changed', { status: 200, json: { ok: true, revision: 1, changed: false, notified: false } }, COPY.unchanged],
  ]
  for (const [label, answer, line] of OUTCOMES) {
    t('TBV-E2-DT-01', label, `a save answered ${label} → view mode and "${line}"`, async (c) => {
      const tab = await editAndSave(c, () => answer)
      assert.equal(tab.mode(), HOOK.mode.view)
      assert.ok(tab.text().includes(line), 'outcome line missing: ' + tab.text().slice(0, 300))
    })
  }
  t('TBV-E2-DT-01', 'stale', 'a 409 stale → edit mode, the exact stale message, the draft (the edited title) kept', async (c) => {
    const tab = await editAndSave(c, () => ({ status: 409, json: { ok: false, code: 'stale', revision: 2 } }))
    assert.equal(tab.mode(), HOOK.mode.edit)
    assert.ok(tab.text().includes(COPY.stale), 'stale text missing: ' + tab.text().slice(0, 300))
    assert.equal(field(tab.row(3), 'Title').props.value, EDITED, 'the draft was not kept')
  })
  for (const code of ['invalid-input', 'limit-reached']) {
    t('TBV-E2-DT-01', code + ' on a task', `a 400 ${code} naming tasks[1] → that row (tree position 2) marked aria-invalid, no other, and its title named`, async (c) => {
      // The draft is sent in tree order (TBV-E2-UC-01 does not fix the order); the refused index is read from the posted body.
      let refused
      const tab = await editAndSave(c, (call) => { refused = JSON.parse(call.body).tasks[1]; return { status: 400, json: { ok: false, code, field: 'tasks[1].title' } } })
      assert.equal(tab.mode(), HOOK.mode.edit)
      for (const row of tab.rows()) {
        const marked = present(row, 'aria-invalid') && !isFalse(row.props['aria-invalid'])
        assert.equal(marked, row.props[HOOK.task] === refused.id, `row ${row.props[HOOK.task]} aria-invalid`)
      }
      assert.ok(tab.text().includes(refused.title), `the refused task "${refused.title}" is not named: ` + tab.text().slice(0, 300))
    })
  }
  t('TBV-E2-DT-01', 'invalid-input on a memo', 'a 400 invalid-input naming memos[0].text → that memo row marked aria-invalid', async (c) => {
    const tab = await editAndSave(c, () => ({ status: 400, json: { ok: false, code: 'invalid-input', field: 'memos[0].text' } }))
    const memoRow = tab.all().find((n) => n.tag === 'li' && present(n, HOOK.memo))
    assert.ok(memoRow && present(memoRow, 'aria-invalid') && !isFalse(memoRow.props['aria-invalid']), 'the memo row is not marked')
  })
  t('TBV-E2-ST-01', 'board changes while editing → Reload', 'a new board frame during edit shows the "changed while you were editing" notice with Reload and does not touch the draft; Reload drops the draft for the new board', async (c) => {
    const tab = await editing(c)
    await tab.change(field(tab.row(3), 'Title'), EDITED)
    const changed = board(tasks.map((x) => (x.id === id(1) ? { ...x, title: 'fbtest-edit by Fishball' } : x)), memos, 2)
    await tab.deliver(changed)
    assert.ok(tab.text().includes(COPY.changedMeanwhile), 'no notice: ' + tab.text().slice(0, 300))
    assert.equal(field(tab.row(3), 'Title').props.value, EDITED, 'the draft was changed by the frame')
    assert.ok(!shownValues(tab).includes('fbtest-edit by Fishball'), "Fishball's change was mixed into the draft")
    await tab.press(tab.button(COPY.reload))
    assert.ok(shownValues(tab).includes('fbtest-edit by Fishball'), 'the new board is not shown after Reload')
    assert.ok(!shownValues(tab).includes(EDITED), 'the draft survived Reload')
  })
}

const AUTO = Object.freeze({
  audit: '/api/fishball-taskboard/auto', undo: '/api/fishball-taskboard/auto/undo',
  settingsButton: 'Auto-update settings', historyButton: 'Update history', undoButton: 'Undo this batch', undoConfirm: 'Confirm batch undo',
  model: Object.freeze({ provider: 'fixture-provider', model: 'fixture-model' }),
  batchId: 'fixture-batch', batchVersion: 3, oldProgress: 30, newProgress: 70, retentionDays: 30,
})

function auditSnapshot(revision, extra) {
  return { ok: true, revision, model: null, available: true, reason: 'off', batches: [], reviews: [], diagnostics: {}, retentionDays: AUTO.retentionDays, ...extra }
}

function registerAutoRows(sdk, t) {
  const revision = 2
  const taskRow = task(1, { status: STATUS.inProgress, progress: AUTO.newProgress })
  const initialBoard = board([taskRow], [], revision)
  t('TBV-AUTO-01', 'off; before enabling', 'settings discloses the full task projection and excluded data, and viewing it cannot save a setting', async (c) => {
    const tab = await boardTab(c, sdk, { answer: () => ({ status: 200, json: auditSnapshot(revision) }) })
    await tab.deliver(initialBoard)
    await press(tab, tab.button(AUTO.settingsButton), AUTO.settingsButton)
    assert.match(tab.text(), /no calls, automatic writes, or notifications/i)
    assert.match(tab.text(), /entire task tree, including unrelated and closed tasks/i)
    assert.match(tab.text(), /Memos, conversation history, tool results, attachments, permissions, and credentials are not included/i)
    assert.ok(tab.requests().some(({ method, url }) => method === 'GET' && new URL(url).pathname === AUTO.audit))
    assert.ok(tab.requests().every(({ method }) => method !== 'POST'))
  })
  t('TBV-AUTO-02', 'history; confirm; stale', 'undo requires explicit confirmation, sends only the batch version and board revision, and a 409 tells the owner to edit manually', async (c) => {
    const batch = {
      batchId: AUTO.batchId, batchVersion: AUTO.batchVersion, baseRevision: revision - 1, revision, createdAt: Date.UTC(2026, 0, 1),
      model: AUTO.model, source: { sessionId: 'fixture-worker', targetId: 'fixture-target', turnId: 'fixture-turn' },
      changes: [{ taskId: taskRow.id, title: taskRow.title, progress: AUTO.newProgress, parent: null,
        fields: { progress: { before: AUTO.oldProgress, after: AUTO.newProgress } }, evidence: taskRow.title + ' is at ' + AUTO.newProgress + '% progress.' }],
      reviewIds: [], notification: 'accepted', undoable: true,
    }
    const answer = ({ method }) => method === 'POST'
      ? { status: 409, json: { ok: false, code: 'stale', revision: revision + 1 } }
      : { status: 200, json: auditSnapshot(revision, { batches: [batch] }) }
    const tab = await boardTab(c, sdk, { answer })
    const posts = () => tab.requests().filter(({ method }) => method === 'POST')
    await tab.deliver(initialBoard)
    await press(tab, tab.button(AUTO.historyButton), AUTO.historyButton)
    assert.ok(tab.text().includes(AUTO.batchId))
    await press(tab, tab.button('Batch details'), 'the retained batch details')
    assert.match(tab.text(), /no parent/i)
    assert.match(tab.text(), /Fishball queue \(not read\)/i)
    await press(tab, tab.button(AUTO.undoButton), AUTO.undoButton)
    assert.deepEqual(posts(), [])
    await press(tab, tab.button(AUTO.undoConfirm), AUTO.undoConfirm)
    const [post] = posts()
    assert.equal(posts().length, 1)
    assert.equal(new URL(post.url).pathname, AUTO.undo)
    assert.deepEqual(JSON.parse(post.body), { batchId: AUTO.batchId, expectedBatchVersion: AUTO.batchVersion, baseRevision: revision })
    assert.match(tab.text(), /board or batch has changed.*edit manually/i)
  })
}
