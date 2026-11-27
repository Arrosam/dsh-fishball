/**
 * UI-FIX-D black-box layout rows (narrow-width fixes; requirements R1–R4 relayed 2026-11-18, with the
 * implementer's corrections of the same day: the hand-over control sits in DSH's
 * `conversation.session.header.utilities`; a setting row's `<label data-dsh-connector-setting>` holds
 * the title and a wrapper with the input, the hint and errors are its siblings in the row).
 *
 * Level: system. Real DSH processes (world.mjs) drawn by a real headless Chromium (browser.mjs), so
 * every box is real CSS layout; nothing of the implementation is read or stubbed.
 *
 * Techniques:
 * - BVA over the viewport width (320, 390, 768, 1440) and over the header title row's content-box
 *   width at the "Managed by" boundary (540 px: display:none; 541 px: shown; DSH's container query);
 * - EP over the session's control state (managed → Take back + Managed by; unmanaged with one target
 *   → Hand over to <name>; with several → Handover to…) and over the theme (light, dark);
 * - decision table of R2's row layout: wide enough (1440) → side by side (hint under the title);
 *   not (390) → stacked in DSH's settings-field order: title, full-width input, hint, error;
 * - state transition: Managed –Take back (a real click at 390 / 1440)→ Unmanaged (Hand over back);
 *   Unmanaged –Hand over (a real click)→ the note dialog opens.
 *
 * What this suite does not check, and why: R1's "session row menu entries are unchanged" is behaviour
 * the draw suite's row-menu rows (UDRAW-DT-03, UDRAW-UC-02 A2, UDRAW-UC-03 A1) already pin; R4 (the
 * adapter's Plugins card) has no requirement change — its own suite is the regression check.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from 'dsh-connector-test-helpers/cases'
import { SURFACE } from 'dsh-connector-test-helpers/connector-world/constants'
import { withdrawnRow } from 'dsh-connector-test-helpers/withdrawn'
import { CHROME, FIXTURE, HEADER, NAV, PX, SETTINGS, WIDTH, WINDOW } from './constants.mjs'
import { apart, gap, measure, near, overlaps, sameLine, show } from './geometry.mjs'
import { at, connectorWorld, noBrowser, openConnectorPage, openSession, sessionIn } from './world.mjs'

/** Why the hosted rename row is not run here (its world needs fishball-core, which lives in dsh-fishball since the repo split). */
const RENAME_WITHDRAWN = 'moved out: needs a live fishball-core child (dsh-fishball repository); the connector half (the DSH name saved and the identity hint) runs in the connector suites (DSH-NAME, IX-MULTI)'
const ID = Object.freeze({ header: 'UIFD-HEADER', settings: 'UIFD-SETTINGS', window: 'UIFD-WINDOW' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One row: skipped (saying why) when no Chromium is installed, since only a browser has layout. */
function row(sdk, id, part, title, fn) {
  test(caseName(sdk, id, part, title), { timeout: CHROME.testMs }, async (t) => {
    const reason = await noBrowser()
    if (reason) { t.skip(reason); return }
    await fn(t)
  })
}

/** The two connector worlds: one paired target (with the long name and label), several targets. */
const oneTarget = (sdk) => connectorWorld(sdk, 'one', [FIXTURE.longName], [SETTINGS.longLabel])
const manyTargets = (sdk) => connectorWorld(sdk, 'many', [FIXTURE.oneName, FIXTURE.otherName])

// ============================================================================================ R1

/** Page-side: the session header's controls and DSH's own header buttons, measured. */
const HEADER_STATE = `(() => {
  const slot = document.querySelector(${JSON.stringify(NAV.headerSlot)})
  const header = slot?.closest('header')
  if (!header) return null
  const patterns = [${HEADER.dshButtons.map(String).join(', ')}]
  const dsh = [...header.querySelectorAll('button')].filter((b) => patterns.some((p) => p.test(b.getAttribute('aria-label') ?? ''))).filter(U.shown)
    .map((b) => ({ name: b.getAttribute('aria-label'), box: U.box(b), utility: Boolean(b.closest(${JSON.stringify(NAV.utilitiesSlot)})) }))
  const control = (attr) => { const el = header.querySelector('[' + attr + ']'); return el ? { ...U.info(el), slot: el.closest('[data-slot]')?.getAttribute('data-slot') ?? null } : null }
  return {
    viewport: document.documentElement.clientWidth,
    // A container query measures the container's content box (the title row minus its padding).
    titleRow: slot.firstElementChild ? U.contentBox(slot.firstElementChild).width : null,
    // DSH's own entries of the actions seat (its agent-preset label): direct children with no Fishball hook.
    dshActions: [...(header.querySelector(${JSON.stringify(NAV.actionsSlot)})?.children ?? [])].filter((c) => ![...c.attributes].some((a) => a.name.startsWith('data-fishball-'))).map((c) => ({ text: U.text(c), display: getComputedStyle(c).display })),
    dsh,
    takeBack: control(${JSON.stringify(HEADER.takeBack)}),
    managedBy: control(${JSON.stringify(HEADER.managedBy)}),
    handOver: control(${JSON.stringify(HEADER.handOver)}),
    many: control(${JSON.stringify(HEADER.handOverMany)}),
  }
})()`
const headerState = async (tab) => {
  const state = await measure(tab, HEADER_STATE)
  assert.ok(state, 'harness: no session header on the page')
  assert.ok(state.dsh.length > 0, 'harness: none of DSH\'s own header buttons was found (their names changed?)')
  return state
}

/** A control is in DSH's utilities seat, never overlapping DSH's header buttons, and left of DSH's own utilities on its line. */
function assertBeside(state, control, what) {
  assert.ok(control, what + ' is not in the header')
  assert.equal(control.slot, SLOT_UTILITIES, what + ' is not in ' + SLOT_UTILITIES)
  for (const b of state.dsh) assert.ok(!overlaps(control.painted, b.box), `${what} ${show(control.painted)} overlaps DSH's "${b.name}" ${show(b.box)} at ${state.viewport}px`)
  if (!control.painted) return
  for (const b of state.dsh.filter((d) => d.utility && sameLine(d.box, control.painted))) assert.ok(control.painted.right <= b.box.left + PX.epsilon, `${what} is not left of DSH's "${b.name}" at ${state.viewport}px`)
}
const SLOT_UTILITIES = 'conversation.session.header.utilities'
const SLOT_ACTIONS = 'conversation.session.header.actions'

/** Visible (non-zero size, inside the viewport horizontally) and on top at its centre. */
function assertReachable(state, control, what) {
  assert.ok(control?.shown, what + ' is not shown at ' + state.viewport + 'px')
  const v = control.painted
  assert.ok(v && v.width > 0 && v.height > 0, what + ' has no visible area')
  assert.ok(v.left >= -PX.epsilon && v.right <= state.viewport + PX.epsilon, `${what} ${show(v)} is outside the viewport (0..${state.viewport})`)
  assert.ok(control.hit, what + ' is covered at its centre (a click would not reach it)')
}

/**
 * "Managed by <principal>": its full text is its title; shown when the title row's content box is
 * wider than 540 px, display:none at 540 or narrower (DSH's container-query rule, the one its own
 * agent-preset label in that row follows: when DSH's label is there, both switch together); never
 * over DSH's buttons.
 */
function assertManagedBy(state, name) {
  const m = state.managedBy
  assert.ok(m, 'no Managed by in the header')
  assert.equal(m.slot, SLOT_ACTIONS, 'Managed by is not title-adjacent in ' + SLOT_ACTIONS)
  assert.equal(m.title, HEADER.managedByPrefix + name, 'Managed by\'s title is not its full text')
  if (state.titleRow > HEADER.titleRowPx) assert.ok(m.shown && m.painted, `Managed by is hidden with a ${state.titleRow}px title row content box (> ${HEADER.titleRowPx})`)
  else assert.equal(m.display, 'none', `Managed by is not display:none with a ${state.titleRow}px title row content box (<= ${HEADER.titleRowPx})`)
  if (state.dshActions.length === 1) {
    const [preset] = state.dshActions
    assert.equal(m.display === 'none', preset.display === 'none', `Managed by (${m.display}) and DSH's own "${preset.text}" (${preset.display}) did not switch together at a ${state.titleRow}px title row`)
  }
  for (const b of state.dsh) assert.ok(!overlaps(m.painted, b.box), `Managed by ${show(m.painted)} overlaps DSH's "${b.name}" ${show(b.box)} at ${state.viewport}px`)
  if (m.painted && state.takeBack?.painted) assert.ok(!overlaps(m.painted, state.takeBack.painted), 'Managed by overlaps Take back')
}

/** One line; an overflowing label ends in an ellipsis (it is not cut or spilled); the title holds the full text. */
function assertOneLine(control, full, what) {
  assert.equal(control.title, full, what + '\'s title is not the full text')
  assert.ok(control.text.includes(full), what + ' lost words: ' + control.text)
  assert.equal(control.lines, 1, what + ' wraps onto ' + control.lines + ' lines')
  if (control.overflowing.length > 0) assert.ok(control.overflowing.some((o) => o.clips && o.textOverflow === 'ellipsis'), what + ' overflows without an ellipsis: ' + JSON.stringify(control.overflowing))
}

/**
 * Sizes the viewport until the header's title row content box is `target` px wide (±0.5 px; BVA).
 * DSH may change its sidebar at some widths, so the search re-measures each step.
 */
async function titleRowAt(tab, target) {
  const onTarget = (s) => s.titleRow > target - 1 + PX.epsilon && s.titleRow <= target + PX.epsilon
  let state = await headerState(tab)
  for (let i = 0; i < PX.search && !onTarget(state); i++) {
    await at(tab, Math.round(state.viewport + target - state.titleRow))
    state = await headerState(tab)
  }
  assert.ok(onTarget(state), `harness: could not size the title row content box to ${target}px (got ${state.titleRow}px at ${state.viewport}px)`)
  return state
}

function headerRows(sdk) {
  row(sdk, ID.header, 'managed (EP, BVA width)', `a managed session at ${WIDTH.all.join(' / ')} px: Take back in header.utilities left of DSH's utilities, never over "Open in…", "More ways to open", "More actions" or the right-sidebar toggle; Managed by title-adjacent, its title the full text`, async (t) => {
    const { w, principals: [p] } = await oneTarget(sdk)
    const { tab } = await openSession(t, w, await sessionIn(w, p.key), `[${HEADER.takeBack}]`)
    for (const width of WIDTH.all) {
      await t.test(width + 'px', async () => {
        await at(tab, width)
        const state = await headerState(tab)
        assert.equal(state.takeBack.text, HEADER.takeBackWords)
        assertBeside(state, state.takeBack, 'Take back')
        assertManagedBy(state, p.name)
        if (WIDTH.clickable.includes(width)) assertReachable(state, state.takeBack, 'Take back')
      })
    }
  })

  for (const [part, target] of [['540 (hidden)', HEADER.titleRowPx], ['541 (shown)', HEADER.titleRowPx + 1]]) {
    row(sdk, ID.header, `managed-by title row ${part} (BVA)`, `title row content box ${target}px → Managed by ${target > HEADER.titleRowPx ? 'shown' : 'display:none'}, switching with DSH's own agent-preset label; its title is "Managed by <principal>"; it overlaps none of DSH's header buttons`, async (t) => {
      const { w, principals: [p] } = await oneTarget(sdk)
      const { tab } = await openSession(t, w, await sessionIn(w, p.key), `[${HEADER.takeBack}]`)
      const state = await titleRowAt(tab, target)
      assertManagedBy(state, p.name)
      assertBeside(state, state.takeBack, 'Take back')
    })
  }

  for (const width of WIDTH.clickable) {
    row(sdk, ID.header, `take back click ${width} (ST)`, `${width}px: a real click on Take back → the session is unmanaged (the connector's managed() drops it) and Hand over comes back in header.utilities`, async (t) => {
      const { w, principals: [p] } = await oneTarget(sdk)
      const sessionId = await sessionIn(w, p.key)
      const { tab, b } = await openSession(t, w, sessionId, `[${HEADER.takeBack}]`)
      await at(tab, width)
      const before = await headerState(tab)
      assertReachable(before, before.takeBack, 'Take back')
      const { x, y } = await measure(tab, `U.centre(document.querySelector('[${HEADER.takeBack}]'))`)
      await tab.click(x, y)
      await b.waitFor(tab, `!!document.querySelector('${NAV.headerSlot} [${HEADER.handOver}]')`, CHROME.loadMs, 'Hand over after Take back')
      const managed = (await w.service(SURFACE.service.handover, 'managed')).value
      assert.equal(managed.some((m) => m.sessionId === sessionId), false, 'still managed after the click')
      const after = await headerState(tab)
      assert.equal(after.takeBack, null, 'Take back stayed')
      assertBeside(after, after.handOver, 'Hand over')
    })
  }

  row(sdk, ID.header, 'one target, long name (EP, BVA width)', `an unmanaged session with one target named with ${FIXTURE.longName.length} characters, at ${WIDTH.all.join(' / ')} px: "Hand over to <name>" in header.utilities on one line (an ellipsis if it overflows), its title the full text, never over DSH's buttons; reachable at ${WIDTH.clickable.join(' and ')}`, async (t) => {
    const { w, principals: [p] } = await oneTarget(sdk)
    const { tab } = await openSession(t, w, await sessionIn(w), `[${HEADER.handOver}]`)
    for (const width of WIDTH.all) {
      await t.test(width + 'px', async () => {
        await at(tab, width)
        const state = await headerState(tab)
        assertBeside(state, state.handOver, 'Hand over')
        assertOneLine(state.handOver, HEADER.handOverPrefix + p.name, 'Hand over')
        assert.equal(state.takeBack, null)
        assert.equal(state.many, null, 'Handover to… with one target')
        if (WIDTH.clickable.includes(width)) assertReachable(state, state.handOver, 'Hand over')
      })
    }
  })

  row(sdk, ID.header, `hand over click ${WIDTH.narrow} (ST)`, `${WIDTH.narrow}px: a real click on "Hand over to <long name>" opens the note dialog (role=dialog)`, async (t) => {
    const { w } = await oneTarget(sdk)
    const { tab, b } = await openSession(t, w, await sessionIn(w), `[${HEADER.handOver}]`)
    await at(tab, WIDTH.narrow)
    const state = await headerState(tab)
    assertReachable(state, state.handOver, 'Hand over')
    const { x, y } = await measure(tab, `U.centre(document.querySelector('${NAV.headerSlot} [${HEADER.handOver}]'))`)
    await tab.click(x, y)
    await b.waitFor(tab, `!!document.querySelector('[role=dialog]')`, CHROME.loadMs, 'the hand-over note dialog')
  })

  row(sdk, ID.header, 'several targets (EP, BVA width)', `an unmanaged session with two targets, at ${WIDTH.all.join(' / ')} px: "${HEADER.handOverManyWords}" in header.utilities, one line, never over DSH's buttons; reachable at ${WIDTH.clickable.join(' and ')}`, async (t) => {
    const { w } = await manyTargets(sdk)
    const { tab } = await openSession(t, w, await sessionIn(w), `[${HEADER.handOverMany}]`)
    for (const width of WIDTH.all) {
      await t.test(width + 'px', async () => {
        await at(tab, width)
        const state = await headerState(tab)
        assertBeside(state, state.many, HEADER.handOverManyWords)
        assert.ok(state.many.text.includes(HEADER.handOverManyWords), 'words: ' + state.many.text)
        assert.equal(state.many.lines, 1, HEADER.handOverManyWords + ' wraps')
        assert.equal(state.handOver, null, 'a single Hand over beside ' + HEADER.handOverManyWords)
        if (WIDTH.clickable.includes(width)) assertReachable(state, state.many, HEADER.handOverManyWords)
      })
    }
  })
}

// ============================================================================================ R2

/** Page-side: every setting row, measured (title, hint, input field, alerts, the row's content box). */
const SETTING_ROWS = `(() => [...document.querySelectorAll('[${SETTINGS.setting}]')].map((label) => {
  const path = label.getAttribute('${SETTINGS.setting}')
  // DSH's request settings render a switch rather than an input. Measure its layout column the same way.
  const selector = ${JSON.stringify(SETTINGS.requestSwitchPaths)}.includes(path) ? '[role=${SETTINGS.switchRole}]' : 'input'
  const control = label.querySelector(selector)
  const row = label.parentElement
  const title = control ? [...label.children].find((c) => !c.contains(control)) : null
  // The control and its wrappers up to the first wrapper holding anything else.
  let field = control
  while (field && field.parentElement !== label && field.parentElement.children.length === 1) field = field.parentElement
  const isAlert = (n) => Boolean(n.parentElement?.closest('[role=${SETTINGS.alert}]'))
  const runs = (root, keep) => { const out = []; const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n = walk.nextNode(); n; n = walk.nextNode()) { if (!n.textContent.trim() || !keep(n)) continue; const r = document.createRange(); r.selectNodeContents(n); for (const b of r.getClientRects()) if (b.width > 0 && b.height > 0) out.push(U.box({ getBoundingClientRect: () => b })) } return out }
  const hintRuns = [...row.children].filter((c) => c !== label).flatMap((c) => runs(c, (n) => !isAlert(n) && !field?.contains(n)))
  return {
    path,
    tag: label.tagName,
    name: control ? U.nameOf(control) : null,
    titleText: title ? U.text(title) : null,
    titleRuns: title ? runs(title, () => true) : [],
    titleColumn: title ? U.column(title) : null,
    hintRuns,
    field: field ? U.box(field) : null,
    row: U.contentBox(row),
    alerts: [...row.querySelectorAll('[role=${SETTINGS.alert}]')].filter(U.shown).map((a) => ({ text: U.text(a), box: U.painted(a) })),
  }
}))()`

/** R2's invariants for one setting row (every width and theme). */
function assertSettingRow(r, width) {
  const where = `${r.path} at ${width}px`
  assert.ok(r.field, where + ': no setting control')
  assert.ok(r.titleText, where + ': no title')
  assert.equal(r.name, r.titleText, where + ': the input is not named by its title (getByLabel(title))')
  for (const run of [...r.titleRuns, ...r.hintRuns]) assert.ok(!overlaps(run, r.field), `${where}: words ${show(run)} overlap the input ${show(r.field)}`)
  assert.ok(r.titleColumn.width >= r.field.width - PX.epsilon, `${where}: the title's column (${Math.round(r.titleColumn.width)}px) is narrower than the input (${Math.round(r.field.width)}px)`)
}
const top = (runs) => Math.min(...runs.map((b) => b.top))
const bottom = (runs) => Math.max(...runs.map((b) => b.bottom))

/** Side by side (wide enough): the words left (the hint under the title), the input ≈ 240 px at the right, on the title's line. */
function assertSideBySide(r) {
  const where = r.path + ' (side by side)'
  assert.ok(near(r.field.width, SETTINGS.columnPx, SETTINGS.columnSlackPx), `${where}: input ${Math.round(r.field.width)}px wide, not ≈ ${SETTINGS.columnPx}`)
  assert.ok(near(r.field.right, r.row.right, PX.edge), `${where}: the input ends at ${Math.round(r.field.right)}, the row at ${Math.round(r.row.right)}`)
  for (const run of [...r.titleRuns, ...r.hintRuns]) assert.ok(run.right <= r.field.left + PX.epsilon, `${where}: words ${show(run)} are not left of the input ${show(r.field)}`)
  assert.ok(sameLine(r.titleRuns[0], r.field), `${where}: the title ${show(r.titleRuns[0])} and the input ${show(r.field)} are not side by side`)
  if (r.hintRuns.length > 0) assert.ok(top(r.hintRuns) >= bottom(r.titleRuns) - PX.epsilon, `${where}: the hint is not under the title`)
}
/**
 * Stacked (too narrow), DSH's own settings-field order (dsh-client-ui-primitives SettingsValueField):
 * the title, then the input across the row, then the hint (with the approval status line), then the
 * error line, each on its own lines.
 */
function assertStacked(r) {
  const where = r.path + ' (stacked)'
  assert.ok(bottom(r.titleRuns) <= r.field.top + PX.epsilon, `${where}: the input is not under the title`)
  assert.ok(r.field.width >= r.row.width - PX.edge, `${where}: the input is ${Math.round(r.field.width)}px of a ${Math.round(r.row.width)}px row`)
  if (r.hintRuns.length > 0) assert.ok(top(r.hintRuns) >= r.field.bottom - PX.epsilon, `${where}: the hint is not under the input`)
  const below = r.hintRuns.length > 0 ? bottom(r.hintRuns) : r.field.bottom
  for (const a of r.alerts.filter((x) => x.box)) assert.ok(a.box.top >= below - PX.epsilon, `${where}: the error line ${show(a.box)} is not under the ${r.hintRuns.length > 0 ? 'hint' : 'input'}`)
}

/** Page-side: the token rows and the new-token row, measured. */
const TOKEN_ROWS = `(() => ({
  rows: [...document.querySelectorAll('[${SETTINGS.row}]')].map((row) => {
    const input = row.querySelector('input')
    let field = input
    while (field && field.parentElement !== row && field.parentElement.children.length === 1) field = field.parentElement
    const sw = row.querySelector('[role=${SETTINGS.switchRole}]')
    const buttons = [...row.querySelectorAll('button')].filter((b) => b !== sw && !sw?.contains(b))
    return {
      value: input?.value ?? null, scrollWidth: input?.scrollWidth ?? null, clientWidth: input?.clientWidth ?? null,
      field: input ? U.box(field) : null, row: U.contentBox(row),
      pair: U.painted(row.querySelector('[${SETTINGS.pair}]')), pairText: U.text(row.querySelector('[${SETTINGS.pair}]')),
      controls: [sw, ...buttons].filter(Boolean).map((c) => ({ name: c.getAttribute('aria-label'), box: U.box(c) })),
    }
  }),
  newLabel: U.box(document.querySelector('[${SETTINGS.newLabel}]')),
  newToken: U.box(document.querySelector('[${SETTINGS.newToken}]')),
}))()`

function settingsRows(sdk) {
  for (const theme of SETTINGS.themes) {
    row(sdk, ID.settings, `setting rows (${theme}; DT, BVA width)`, `${theme}: every setting row at ${WIDTH.all.join(' / ')} px — no title/hint text over the input, the title never in a column narrower than the input, the input named by its title; ${WIDTH.wide}px side by side (input ≈ ${SETTINGS.columnPx}px at the right, hint under the title), ${WIDTH.narrow}px stacked (title, full-width input, hint, error)`, async (t) => {
      const { w } = await oneTarget(sdk)
      const { tab } = await openConnectorPage(t, w, theme)
      for (const width of WIDTH.all) {
        await t.test(width + 'px', async () => {
          await at(tab, width)
          const rows = await measure(tab, SETTING_ROWS)
          assert.ok(rows.length >= SETTINGS.minRows, 'setting rows: ' + rows.length)
          for (const path of SETTINGS.requestSwitchPaths) assert.ok(rows.some((r) => r.path === path), path + ': no setting row')
          for (const r of rows) {
            assert.equal(r.tag, 'LABEL', r.path + ': the setting hook is not on a <label>')
            assertSettingRow(r, width)
            if (width === WIDTH.wide) assertSideBySide(r)
            if (width === WIDTH.narrow) assertStacked(r)
          }
        })
      }
    })

    row(sdk, ID.settings, `token rows (${theme}; BVA width)`, `${theme}: the token row labelled "${SETTINGS.longLabel}" — ${WIDTH.narrow}px: the label input spans the row and shows the whole label, the pair line touches neither the switch nor the buttons, which sit on their own line, end-aligned; ${WIDTH.wide}px: one line (label + pair left, switch and buttons right); the new-label field and New token never overlap`, async (t) => {
      const { w } = await oneTarget(sdk)
      const { tab } = await openConnectorPage(t, w, theme)
      for (const width of WIDTH.all) {
        await t.test(width + 'px', async () => {
          await at(tab, width)
          // DSH 0.2.2-rc.3 shows the package README above the settings, so the token row can start
          // below the viewport, where it has no painted box. Scroll it into view as a user would.
          await tab.evaluate(`[...document.querySelectorAll('[${SETTINGS.row}]')].find((row) => [...row.querySelectorAll('input')].some((i) => i.value === ${JSON.stringify(SETTINGS.longLabel)}))?.scrollIntoView({ block: 'center' })`)
          await at(tab, width)
          const { rows, newLabel, newToken } = await measure(tab, TOKEN_ROWS)
          assert.ok(!overlaps(newLabel, newToken), `the new-label field ${show(newLabel)} overlaps New token ${show(newToken)}`)
          const r = rows.find((x) => x.value === SETTINGS.longLabel)
          assert.ok(r, 'no token row labelled ' + SETTINGS.longLabel + ': ' + JSON.stringify(rows.map((x) => x.value)))
          assert.ok(r.pairText.startsWith(SETTINGS.pairedPrefix), 'pair line: ' + r.pairText)
          for (const c of r.controls) {
            assert.ok(apart(r.pair, c.box), `the pair line ${show(r.pair)} touches "${c.name}" ${show(c.box)} (gap ${gap(r.pair, c.box)})`)
            assert.ok(!overlaps(r.field, c.box), `the label input overlaps "${c.name}"`)
          }
          const controlsTop = Math.min(...r.controls.map((c) => c.box.top))
          const controlsRight = Math.max(...r.controls.map((c) => c.box.right))
          if (width === WIDTH.narrow) {
            assert.ok(r.scrollWidth <= r.clientWidth, `the label is cut: scrollWidth ${r.scrollWidth} > clientWidth ${r.clientWidth}`)
            assert.ok(r.field.width >= r.row.width - PX.edge, `the label input is ${Math.round(r.field.width)}px of a ${Math.round(r.row.width)}px row`)
            assert.ok(controlsTop >= Math.max(r.field.bottom, r.pair.bottom) - PX.epsilon, 'the switch and buttons are not on their own line under the label and pair')
            assert.ok(near(controlsRight, r.row.right, PX.edge), `the controls end at ${Math.round(controlsRight)}, the row at ${Math.round(r.row.right)} (not end-aligned)`)
          }
          if (width === WIDTH.wide) {
            for (const c of r.controls) {
              assert.ok(sameLine(c.box, r.field), `"${c.name}" is not on the label's line`)
              assert.ok(c.box.left >= Math.max(r.field.right, r.pair.right) - PX.epsilon, `"${c.name}" is not right of the label and pair`)
            }
          }
        })
      }
    })
  }

  for (const width of WIDTH.clickable) {
    row(sdk, ID.settings, `error line ${width} (EP invalid)`, `${width}px: typing "${SETTINGS.invalidValue}" into ${SETTINGS.limitPath} → "${SETTINGS.errorText}" in the row, under the input (and, stacked, under the hint), over nothing`, async (t) => {
      const { w } = await oneTarget(sdk)
      const { tab, b } = await openConnectorPage(t, w)
      await at(tab, width)
      const field = `document.querySelector('[${SETTINGS.setting}="${SETTINGS.limitPath}"] input')`
      await tab.evaluate(`(() => { const i = ${field}; i.focus(); i.select(); return true })()`)
      await tab.type(SETTINGS.invalidValue)
      await b.waitFor(tab, `[...${field}.closest('[${SETTINGS.setting}]').parentElement.querySelectorAll('[role=${SETTINGS.alert}]')].some((a) => a.textContent.includes(${JSON.stringify(SETTINGS.errorText)}))`, CHROME.loadMs, 'the error line')
      await sleep(CHROME.settleMs)
      const r = (await measure(tab, SETTING_ROWS)).find((x) => x.path === SETTINGS.limitPath)
      const alert = r.alerts.find((a) => a.text.includes(SETTINGS.errorText))
      assert.ok(alert?.box, 'the error line is not shown')
      assert.ok(alert.box.top >= r.field.bottom - PX.epsilon, `the error line ${show(alert.box)} is not under the input ${show(r.field)}`)
      for (const run of [...r.titleRuns, ...r.hintRuns]) assert.ok(!overlaps(run, alert.box), `the error line ${show(alert.box)} overlaps words ${show(run)}`)
      assertSettingRow(r, width)
      if (width === WIDTH.narrow) assertStacked(r)
    })
  }
}

// ============================================================================================ R3


/** Why the failed-child window row is not run here: its host DSH must run the dsh-instance package (another repository). */
const WINDOW_WITHDRAWN = 'moved out: needs the dsh-instance package (dsh-fishball-instance repository) as the host that reports failed / INVALID_MAIN_HOME; the window header drawing of a failed child runs in-process in the draw suite (WIN-DRAW, UDRAW-UC-01 A2)'

function windowRows(sdk) {
  withdrawnRow(sdk, ID.window, 'failed child code (BVA width)', `child failed / ${WINDOW.code}, at ${WIDTH.all.join(' / ')} px: the header's code is one line, its title the full code, never over Refresh or "Fishball"; ${WIDTH.narrow}px may end in an ellipsis; ${WIDTH.wide}px shows it whole; the body still reads "${WINDOW.stateLine}" and "${WINDOW.codeLine}"`, WINDOW_WITHDRAWN)
}

export function registerLayoutCases(sdk) {
  headerRows(sdk)
  settingsRows(sdk)
  // RFC-DSHNAME R1B hosted needs a running fishball-core (the dsh-fishball repository) as the hosted
  // child that reads the DSH name: it is a cross-repository row and cannot run in this repository.
  withdrawnRow(sdk, 'RFC-DSHNAME', 'R1B hosted', 'empty → Enter then move focus → cleared on blur; persisted settings and live identity agree, duplicate resolved only in Fishball', RENAME_WITHDRAWN)
  windowRows(sdk)
}