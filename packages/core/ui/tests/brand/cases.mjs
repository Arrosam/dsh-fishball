/**
 * LOGO-BUTTON black-box rows: Fishball's brand at the top-left of DSH's sidebar on the Fishball page.
 * The Use Cases, equivalence partitions, boundary values, decision tables and state transitions are
 * in README.md beside this file; every expected word, hook and value is the requirement's.
 *
 * Levels:
 * - component (../support/brand-shell.mjs): fishball-ui's real client and chunks in the scripted page with
 *   `<html data-fishball-page>`, a scripted shell that renders the two brand slots as DSH's sidebar
 *   does (wide brand button / collapsed rail toggle / the real New Session button), real attribute
 *   mutation notifications for the label observer, and the page's one connection
 *   (../support/page-stream.mjs);
 * - fishball-page's New Session hiding over a scripted shell document (hide.mjs, modified navPage);
 * - the working animation and reduced motion in a headless Chromium (motion.mjs; skipped where no
 *   Chromium exists, as the contrast rows are).
 *
 * No implementation file is read: expectations come from the requirement only.
 */
import assert from 'node:assert/strict'
import { after } from 'node:test'
import { caseTest } from 'fishball-test-helpers/cases'
import { DSH_VERSION } from 'fishball-test-helpers/dsh'
import { findAll } from 'fishball-test-helpers/react-shim'
import { ACCENT, BADGE, BRAND_FIXTURE as FIXTURE, CARD_STATE, DSH_MARK, HOOK, LABEL, PRIORITY, ROUTE, SHELL, SLOT, STATUS, THEME, WORDMARK } from '../support/brand.mjs'
import { brandPage } from '../support/brand-shell.mjs'
import { THEME as DSH_THEME, WCAG, contrast, parseColour, shown } from '../support/contrast.mjs'
import { registerFaults } from './faults.mjs'
import { registerNative } from './native.mjs'
import { hidePage } from './hide.mjs'
import { registerAvatar } from './avatar-cases.mjs'
import { hasChrome, measureAccent, measureMotion, measureWords, stopMotionBrowser } from './motion.mjs'

const show = (v) => JSON.stringify(v)
/** The DSH versions whose sidebar becomes a drawer below 768px. */
const DRAWER = Object.freeze({ versions: Object.freeze(['0.2.2-rc.1']) })
/** How much of a left-over style's text a failure shows. */
const BRAND_STYLE_PREVIEW = 20
const cards = (n, state = CARD_STATE.open) => Array.from({ length: n }, () => ({ state }))
const THEMES = [THEME.fishball, THEME.deepseek]
/** Every rendered host node with its parent, for ancestor questions. */
function* walkAll(nodes, parent = null) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    yield { node, parent }
    yield* walkAll(node.children ?? [], node)
  }
}

/** A magenta-family colour: the requirement's eye colour, in hex or rgb. */
function isMagenta(value) {
  const text = String(value).trim().toLowerCase()
  if (text === 'magenta' || text === '#f0f' || text === '#ff00ff') return true
  const hex = /^#([0-9a-f]{6})$/.exec(text)
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(text)
  const parts = hex ? [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16)) : rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
  if (!parts) return false
  const [r, g, b] = parts
  return r >= 180 && g <= 100 && b >= 80 && b <= 220
}

export function registerBrandCases() {
  const t = caseTest
  registerFaults(t)
  registerNative(t)
  registerAvatar(t)
  const status = (p) => p.byHook(HOOK.status)[0]
  const statusText = (p) => (status(p) ? p.text(status(p)) : undefined)
  const badge = (p) => p.byHook(HOOK.badge)[0]
  const badgeText = (p) => (badge(p) ? p.text(badge(p)) : undefined)
  const descOf = (p) => p.button()?.getAttribute('aria-description') ?? p.button()?.getAttribute('title') ?? null
  const titleOf = (p) => p.button()?.getAttribute('title') ?? null
  const shortcutOf = (p) => p.button()?.getAttribute('aria-keyshortcuts') ?? null
  const postFetches = (p) => p.world.fetches.filter((f) => String(f.method).toUpperCase() === 'POST')
  const stateOf = (p) => p.markRoot()?.props[HOOK.state]
  const themeOf = (p) => p.markRoot()?.props[HOOK.theme]
  const dotOf = (p) => p.stateDot(p.markRoot())?.props['data-state']
  const markText = (p) => (p.markRoot() ? p.text(p.markRoot()) : '')
  /** Whether `node` or one of its rendered ancestors is aria-hidden (the shell's decorative rail wrapper). */
  const hiddenAncestor = (p, node) => {
    const tree = p.tree()
    const parent = new Map()
    for (const { node: at, parent: up } of walkAll(tree)) parent.set(at, up)
    for (let at = node; at; at = parent.get(at)) if (at.props?.['aria-hidden'] === 'true') return true
    return false
  }
  const art = (p) => (p.markRoot() ? p.art(p.markRoot()) : [])
  const svgSizes = (p) => findAll(p.markRoot() ? [p.markRoot()] : [], (n) => n.tag === 'svg').map((n) => [String(n.props.width), String(n.props.height)])
  /** DSH's FishLogo elements drawn in the mark (the primitives stand-in's marker). */
  const dshMarks = (p) => findAll(p.markRoot() ? [p.markRoot()] : [], (n) => n.props['data-primitive'] === DSH_MARK.primitive)
  /** The mark is 24px: Fishball's own 24×24 svg, or DSH's FishLogo given the mark's size (as the official brand plugin passes it). */
  const assertMarkSize = (p, theme) => {
    if (theme === THEME.fishball) assert.ok(svgSizes(p).some(([w, h]) => w === '24' && h === '24'), `no 24px icon: ${show(svgSizes(p))}`)
    else assert.deepEqual(dshMarks(p).map((n) => String(n.props[DSH_MARK.sizeHandle])), [String(FIXTURE.ownerSize)], `DSH's FishLogo is not drawn once at size ${FIXTURE.ownerSize}`)
  }

  /** Both streams live, core on, a manager frame and a sessions snapshot. */
  async function connected(p, { theme = THEME.fishball, running = false, cardCount = 0, cardState = CARD_STATE.open, manager = FIXTURE.manager } = {}) {
    await p.deliver('asks', { managerSessionId: manager, cards: cards(cardCount, cardState) })
    await p.deliver('strip', { on: true, brandStyle: theme })
    await p.setRunning(running)
  }
  const assertState = (p, expected, theme) => {
    assert.equal(stateOf(p), expected.state, 'state hook')
    assert.equal(statusText(p), expected.text, 'status text')
    assert.equal(descOf(p), expected.text, 'aria-description')
    assert.equal(dotOf(p), expected.dot, 'status light')
    assert.equal(themeOf(p), theme, 'theme hook')
    assert.equal(p.button()?.getAttribute('aria-label'), LABEL.brand, 'accessible name')
  }
  const assertNoBadge = (p) => assert.equal(badge(p), undefined, 'a badge is drawn')

  // ================================================================ EP-01: the surfaces
  for (const theme of THEMES) {
    t('BRAND-EP-01', `wide ${theme}`, `the wide brand row (${theme} theme): a 24px mark, the wordmark ${show(WORDMARK.text)}, the tag ${show(WORDMARK.tag)} beneath it, a status text and light, no badge`, async (c) => {
      const p = await brandPage(c)
      await connected(p, { theme, cardCount: 0 })
      assert.equal(themeOf(p), theme)
      assert.ok(p.markRoot(), 'no mark root')
      assert.ok(p.nameRoot(), 'no name root')
      const words = findAll(p.nameRoot() ? [p.nameRoot()] : [], (n) => n.tag === 'span' || n.tag === 'div')
      const wordmark = words.filter((n) => p.text(n).trim() === WORDMARK.text)
      const tag = words.filter((n) => p.text(n).trim() === WORDMARK.tag)
      assert.equal(wordmark.length >= 1, true, `no ${WORDMARK.text} wordmark in ${show(p.text(p.nameRoot()))}`)
      assert.equal(tag.length >= 1, true, `no ${WORDMARK.tag} tag in ${show(p.text(p.nameRoot()))}`)
      const all = findAll([p.nameRoot()], () => true)
      assert.ok(all.indexOf(wordmark[0]) < all.indexOf(tag[0]), 'the tag is not beneath the wordmark')
      assert.equal(p.text(wordmark[0]).trim(), WORDMARK.text)
      assert.equal(p.text(tag[0]).trim(), WORDMARK.tag)
      assertMarkSize(p, theme)
      assert.ok(status(p), 'no status text node')
      assert.equal(findAll([p.nameRoot()], (n) => n.props[HOOK.status] !== undefined).length > 0, true, 'the status text is not in the brand name occupant')
      assert.ok(p.stateDot(p.markRoot()), 'no status light')
      assertNoBadge(p)
      assert.equal(descOf(p), statusText(p), 'description is not the status')
    })
  }
  const SHAPES = ['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline']
  const paintsOf = (nodes) => nodes.flatMap((n) => [n.props.fill, n.props.stroke]).filter((v) => v !== undefined)
  t('BRAND-EP-02', `art ${THEME.fishball}`, 'the fishball theme draws V1\'s fish (Fishball\'s own drawing, not DSH\'s FishLogo), with a magenta eye', async (c) => {
    const p = await brandPage(c)
    await connected(p, { theme: THEME.fishball })
    const drawing = p.descendants(p.markRoot()).filter((n) => SHAPES.includes(n.tag))
    assert.ok(drawing.length > 0, 'no drawing in the mark')
    assert.deepEqual(dshMarks(p), [], 'the fishball theme draws DSH\'s FishLogo')
    assert.ok(paintsOf(drawing).some(isMagenta), `no magenta eye among ${show(paintsOf(drawing))}`)
  })
  t('BRAND-EP-02', `art ${THEME.deepseek}`, 'the deepseek theme renders DSH\'s own FishLogo primitive (the mark DSH\'s official brand plugin slots), not a Fishball-drawn whale: no drawing of Fishball\'s own beside it and no magenta eye', async (c) => {
    const p = await brandPage(c)
    await connected(p, { theme: THEME.deepseek })
    const logos = dshMarks(p)
    assert.equal(logos.length, 1, `DSH's FishLogo is not rendered once in the mark: ${logos.length}`)
    const inLogo = new Set(p.descendants(logos[0]))
    const own = p.descendants(p.markRoot()).filter((n) => (SHAPES.includes(n.tag) || n.tag === 'svg') && !inLogo.has(n) && n.props['data-primitive'] === undefined)
    assert.deepEqual(own.map((n) => n.tag), [], 'the mark draws Fishball\'s own art beside FishLogo')
    const paints = paintsOf(p.descendants(p.markRoot()))
    assert.equal(paints.some(isMagenta), false, `a magenta eye among ${show(paints)}`)
  })
  t('BRAND-EP-03', 'two drawings', 'the two themes draw different art (Fishball\'s fish vs DSH\'s FishLogo, not one reused drawing)', async (c) => {
    const fish = await brandPage(c)
    await connected(fish, { theme: THEME.fishball })
    const whale = await brandPage(c)
    await connected(whale, { theme: THEME.deepseek })
    assert.notEqual(JSON.stringify(art(fish)), JSON.stringify(art(whale)), 'the same drawing serves both themes')
  })
  t('BRAND-EP-04', 'priority', `fishball-ui fills both brand slots at priority ${PRIORITY}, below the shell's 0`, async (c) => {
    const p = await brandPage(c)
    for (const slot of [SLOT.mark, SLOT.name]) {
      const priorities = p.world.entries(slot).map((e) => e.options.priority)
      assert.deepEqual(priorities, [PRIORITY], `${slot}: ${show(priorities)}`)
    }
  })
  // Re-baselined (the image-loop fix, 2026-11-22): the two views arrive on the page's one connection,
  // so the one source opened is it (it was /api/fishball/asks/events and /api/fishball/strip).
  t('BRAND-EP-05', 'no ensure', 'the logo sends no request of its own: no POST (no ensure), only the one page connection (server-sent)', async (c) => {
    const p = await brandPage(c)
    await connected(p, { cardCount: 1 })
    await p.click(p.button())
    assert.deepEqual(p.world.fetches.filter((f) => String(f.method).toUpperCase() === 'POST').map((f) => f.url), [], 'the logo posted')
    assert.deepEqual(p.sources.opened.map((s) => new URL(s.url, p.world.base).pathname), [ROUTE.path])
  })

  // ================================================================ EP-02: the collapsed rail
  t('BRAND-EP-06', 'rail', 'in the collapsed rail the mark is inside the shell\'s own toggle button; the mark is decorative, the toggle keeps its name, and pressing it toggles the sidebar instead of opening the session', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    await p.setCollapsed(true)
    const mark = p.markRoot()
    assert.ok(mark, 'no mark in the rail')
    const toggle = p.ancestorButton(mark)
    assert.ok(toggle, 'the rail mark is not inside a button')
    assert.equal(toggle.props['data-sidebar-toggle'], '', 'the containing button is not the shell toggle')
    assert.equal(toggle.props['aria-label'], LABEL.toggle.en, 'the toggle lost its accessible name')
    assert.equal(hiddenAncestor(p, mark), true, 'the rail mark is not decorative')
    assert.ok(svgSizes(p).some(([w, h]) => w === '24' && h === '24'), 'the rail mark is not 24px')
    const opens = p.opens.length
    await p.click(p.toggle())
    assert.equal(p.shell.toggle, 1, 'the rail toggle did not toggle')
    assert.equal(p.opens.length, opens, 'the rail toggle opened the manager session')
  })

  // ================================================================ DT-01: state × theme
  for (const theme of THEMES) {
    for (const [name, expected, setup] of [
      ['idle', STATUS.connected, async (p) => connected(p, { theme })],
      ['working', STATUS.working, async (p) => connected(p, { theme, running: true })],
      ['attention', { ...STATUS.attention, text: `${STATUS.attention.text} (2)` }, async (p) => connected(p, { theme, cardCount: 2 })],
      ['offline', STATUS.offline, async (p) => { await connected(p, { theme }); await p.fail('asks', false) }],
    ]) {
      t('BRAND-DT-01', `${name} ${theme}`, `${name} (${theme}): state ${expected.state}, text ${show(expected.text)}, light ${expected.dot}, theme ${theme}, description = the status text, name stays ${show(LABEL.brand)}`, async (c) => {
        const p = await brandPage(c)
        await setup(p)
        assertState(p, expected, theme)
        if (name === 'attention') assert.equal(badgeText(p), '2')
        else assertNoBadge(p)
      })
    }
  }

  // ================================================================ BVA-01: the badge count
  for (const [count, expectedText] of [[BADGE.none, undefined], [BADGE.first, '1'], [BADGE.last, '99'], [BADGE.over, BADGE.overText]]) {
    t('BRAND-BVA-01', String(count), `${count} open cards → badge ${show(expectedText)} (0: no badge; 1..99: the number; 100: ${BADGE.overText}) and the matching status text`, async (c) => {
      const p = await brandPage(c)
      await connected(p, { cardCount: count })
      if (expectedText === undefined) {
        assertNoBadge(p)
        assert.equal(statusText(p), STATUS.connected.text)
        assert.equal(stateOf(p), STATUS.connected.state)
      } else {
        assert.equal(badgeText(p), expectedText)
        assert.equal(statusText(p), `${STATUS.attention.text} (${expectedText})`)
        assert.equal(stateOf(p), STATUS.attention.state)
      }
    })
  }

  // ================================================================ EP-03: only `open` is pending
  for (const cardState of Object.values(CARD_STATE)) {
    t('BRAND-EP-07', cardState, `one ${cardState} card → ${cardState === CARD_STATE.open ? 'needs attention with badge 1' : 'connected, no badge'}`, async (c) => {
      const p = await brandPage(c)
      await connected(p, { cardCount: 1, cardState })
      if (cardState === CARD_STATE.open) {
        assert.equal(stateOf(p), STATUS.attention.state)
        assert.equal(badgeText(p), '1')
      } else {
        assert.equal(stateOf(p), STATUS.connected.state)
        assertNoBadge(p)
      }
    })
  }

  // ================================================================ ST-01: stream health and core on/off
  // Re-baselined (the image-loop fix; the lead's decision of 2026-11-22): both views arrive on the
  // page's ONE connection, so a stale or closed strip STREAM alone no longer exists. The row keeps its
  // intent where a strip-only fault still exists, the strip TOPIC: while the connection is live, a strip
  // frame that is not a strip frame, or no strip frame at all (Host side: its frame() threw and the topic
  // was skipped), leaves the brand connected with its last good strip (the theme it drew). The
  // connection's own health is BRAND-ST-10.
  for (const [label, raw] of [['skipped', undefined], ['null', 'null'], ['an array', '[]'], ['a string', '"fbtest-not-a-strip"'], ['a number', '7']]) {
    t('BRAND-ST-01', `strip topic ${label}`, `the page connection live, the strip topic ${raw === undefined ? 'skipped (no strip frame; an asks frame still arrives)' : `sends a frame that is ${label}`} → the brand stays connected and keeps its last good strip (theme ${THEME.deepseek})`, async (c) => {
      const p = await brandPage(c)
      await connected(p, { theme: THEME.deepseek })
      assert.equal(stateOf(p), STATUS.connected.state, 'precondition: connected')
      if (raw === undefined) await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
      else await p.deliverRaw('strip', raw)
      assert.equal(stateOf(p), STATUS.connected.state, 'a strip-only fault made the session unreachable')
      assert.equal(themeOf(p), THEME.deepseek, 'the last good strip was not kept')
    })
  }
  // Added with the rewrite above (the lead, 2026-11-22): the brand follows the one connection's health.
  for (const [word, closed] of [['stale', false], ['closed', true]]) {
    t('BRAND-ST-10', `connection ${word}`, `connected → the one page connection errors ${closed ? 'with CLOSED' : 'while retrying (CONNECTING)'} → offline (error light); a fresh asks frame → connected`, async (c) => {
      const p = await brandPage(c)
      await connected(p, {})
      await p.failConnection(closed)
      assert.equal(stateOf(p), STATUS.offline.state)
      assert.equal(dotOf(p), STATUS.offline.dot)
      await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
      assert.equal(stateOf(p), STATUS.connected.state)
    })
  }
  t('BRAND-ST-02', 'asks closed', 'connected → asks error with CLOSED → offline (the status light turns error-like); a frame reconnects it', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    await p.fail('asks', true)
    assert.equal(stateOf(p), STATUS.offline.state)
    assert.equal(dotOf(p), STATUS.offline.dot)
    await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
    assert.equal(stateOf(p), STATUS.connected.state)
  })
  t('BRAND-ST-03', 'core off', 'strip frame on:false with the asks stream live → offline; on:true again → connected', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    await p.deliver('strip', { on: false, brandStyle: THEME.fishball })
    assert.equal(stateOf(p), STATUS.offline.state)
    await p.deliver('strip', { on: true, brandStyle: THEME.fishball })
    assert.equal(stateOf(p), STATUS.connected.state)
  })
  t('BRAND-ST-04', 'manager absent', 'an asks frame without a manager id is offline although both streams live and core on; a frame with the id is connected again', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    await p.deliver('asks', { cards: [] })
    assert.equal(stateOf(p), STATUS.offline.state, 'absent manager id')
    await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
    assert.equal(stateOf(p), STATUS.connected.state)
  })
  t('BRAND-ST-05', 'manager empty', 'an asks frame whose manager id is the empty string is "no manager id" → offline (reported ambiguity: the implementation reads it as present)', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    await p.deliver('asks', { managerSessionId: '', cards: [] })
    assert.equal(stateOf(p), STATUS.offline.state, 'empty manager id')
  })
  t('BRAND-ST-06', 'working follows sessions', 'the sessions list running flag drives working ↔ idle without touching the streams', async (c) => {
    const p = await brandPage(c)
    await connected(p, { running: false })
    assert.equal(stateOf(p), STATUS.connected.state)
    await p.setRunning(true)
    assert.equal(stateOf(p), STATUS.working.state)
    await p.setRunning(false)
    assert.equal(stateOf(p), STATUS.connected.state)
  })

  // ================================================================ ST-02: theme changes live
  t('BRAND-ST-07', 'live theme', 'the strip frame changes the art live: fishball → deepseek → fishball, with no reload and no new stream', async (c) => {
    const p = await brandPage(c)
    await connected(p, { theme: THEME.fishball })
    const fish = JSON.stringify(art(p))
    const streams = p.sources.opened.length
    await p.deliver('strip', { on: true, brandStyle: THEME.deepseek })
    assert.equal(themeOf(p), THEME.deepseek)
    const whale = JSON.stringify(art(p))
    assert.notEqual(whale, fish)
    await p.deliver('strip', { on: true, brandStyle: THEME.fishball })
    assert.equal(themeOf(p), THEME.fishball)
    assert.equal(JSON.stringify(art(p)), fish)
    assert.equal(p.sources.opened.length, streams, 'a theme change reopened a stream')
  })
  for (const [label, frame] of [
    ['unknown', { on: true, brandStyle: 'orca' }],
    ['empty', { on: true, brandStyle: '' }],
    ['null', { on: true, brandStyle: null }],
    ['number', { on: true, brandStyle: 7 }],
    ['absent', { on: true }],
  ]) {
    t('BRAND-DT-02', label, `while deepseek, a strip frame with brandStyle ${label} reads ${THEME.fishball} (the default) and draws the fish again`, async (c) => {
      const p = await brandPage(c)
      await connected(p, { theme: THEME.deepseek })
      const whale = JSON.stringify(art(p))
      await p.deliver('strip', frame)
      assert.equal(themeOf(p), THEME.fishball)
      assert.notEqual(JSON.stringify(art(p)), whale)
    })
  }

  // ================================================================ DT-03: activation
  for (const [how, fire] of [
    ['mouse', (p) => p.click(p.button())],
    ['Enter', (p) => p.pressKey(p.button(), 'Enter')],
    ['Space', (p) => p.pressKey(p.button(), ' ')],
  ]) {
    t('BRAND-DT-03', `${how} manager`, `${how} on the brand button with a manager known → uiWorkspace.openSession(managerId) once; the shell's New Session handler never runs`, async (c) => {
      const p = await brandPage(c)
      await connected(p, {})
      const event = await fire(p)
      assert.deepEqual(p.opens, [FIXTURE.manager])
      assert.equal(p.shell.newSession, 0, "the shell's New Session handler ran")
      assert.equal(event.defaultPrevented, true, 'the native activation was not prevented')
    })
    t('BRAND-DT-03', `${how} no manager`, `${how} on the brand button with no manager id known → nothing happens (no openSession, no new session)`, async (c) => {
      const p = await brandPage(c)
      assert.equal(p.opens.length, 0)
      await fire(p)
      assert.deepEqual(p.opens, [])
      assert.equal(p.shell.newSession, 0, 'a session was created')
    })
  }

  // ================================================================ DT-04: manager known but not listed yet
  t('BRAND-DT-04', 'manager retry', 'the manager id is known but not yet in the sessions list; the first openSession rejects "unknown session" (the click is consumed, no session is created and no POST is sent); when the list later carries the id the brand retries exactly once and opens it', async (c) => {
    const p = await brandPage(c, { openFails: 1 })
    // Both streams live and core on, but the sessions list has no entry for the manager yet.
    await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
    await p.deliver('strip', { on: true, brandStyle: THEME.fishball })
    const event = await p.click(p.button())
    assert.equal(event.defaultPrevented, true, 'the click was not consumed')
    assert.deepEqual(p.attempts, [{ id: FIXTURE.manager, ok: false, error: 'unknown session' }], 'the first attempt')
    assert.equal(p.shell.newSession, 0, 'a session was created')
    assert.deepEqual(postFetches(p), [], 'the logo posted')
    await p.setSessions({ byId: { [FIXTURE.manager]: { id: FIXTURE.manager, running: false } } })
    assert.deepEqual(p.attempts, [{ id: FIXTURE.manager, ok: false, error: 'unknown session' }, { id: FIXTURE.manager, ok: true }], 'the retry')
    assert.deepEqual(p.opens, [FIXTURE.manager, FIXTURE.manager], 'exactly the first attempt and one retry')
    assert.equal(p.shell.newSession, 0, 'the retry created a session')
    assert.deepEqual(postFetches(p), [], 'the retry posted')
  })

  // ================================================================ DT-05: already shown with a panel open
  for (const [how, fire] of [
    ['mouse', (p) => p.click(p.button())],
    ['Space', (p) => p.pressKey(p.button(), ' ')],
  ]) {
    t('BRAND-DT-05', `shown panel ${how}`, `${how}: the manager is the current uiSession key and a panel is open → layout.selectPanel(null), no openSession`, async (c) => {
      const p = await brandPage(c)
      await connected(p, {})
      await p.setCurrent(FIXTURE.manager)
      await p.setPanel('plugins')
      p.clearPanels()
      const opens = p.opens.length
      const event = await fire(p)
      assert.deepEqual(p.panels(), [null], 'the open panel was not closed')
      assert.equal(p.opens.length, opens, 'the already-shown session was opened again')
      assert.equal(p.shell.newSession, 0, 'a session was created')
      assert.equal(event.defaultPrevented, true, 'the activation was not consumed')
    })
  }

  // ================================================================ DT-06: a held Space repeats
  t('BRAND-DT-06', 'keyboard repeat', 'a held Space (keydown repeat:true) is prevented and consumed but calls openSession only once; Enter and Space still work from the normal (not shown) state', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    const first = await p.pressKey(p.button(), ' ')
    const repeat1 = await p.pressKey(p.button(), ' ', { repeat: true })
    const repeat2 = await p.pressKey(p.button(), ' ', { repeat: true })
    assert.deepEqual(p.opens, [FIXTURE.manager], 'repeats opened the session again')
    for (const event of [first, repeat1, repeat2]) assert.equal(event.defaultPrevented, true, 'a repeat was not consumed')
    assert.equal(p.shell.newSession, 0, 'a repeat created a session')
    await p.setCurrent(null)
    await p.pressKey(p.button(), 'Enter')
    assert.deepEqual(p.opens, [FIXTURE.manager, FIXTURE.manager], 'Enter no longer works')
    await p.setCurrent(null)
    await p.pressKey(p.button(), ' ')
    assert.deepEqual(p.opens, [FIXTURE.manager, FIXTURE.manager, FIXTURE.manager], 'Space no longer works')
  })

  // ================================================================ ST-03: the shell's label
  for (const lang of ['en', 'zh']) {
    t('BRAND-ST-08', `rerender ${lang}`, `the shell's own ${show(LABEL.newSession[lang])} label is written over the brand button on every rerender; a MutationObserver scoped to the button restores ${show(LABEL.brand)} each time, without a loop`, async (c) => {
      const p = await brandPage(c, { lang })
      await connected(p, {})
      assert.equal(p.button()?.getAttribute('aria-label'), LABEL.brand)
      for (let i = 0; i < 3; i++) {
        await p.overwriteLabel(LABEL.newSession[lang])
        assert.equal(p.button()?.getAttribute('aria-label'), LABEL.brand, 'overwrite ' + (i + 1))
      }
      assert.ok(p.shim.renders() < 200, 'the label observer looped')
    })
  }

  // ================================================================ ST-09: the shell button's title and shortcut
  t('BRAND-ST-09', 'title', "while mounted the shell button's title is the current status text (and follows every status change); the shell's aria-keyshortcuts is removed", async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    assert.equal(titleOf(p), STATUS.connected.text)
    assert.equal(shortcutOf(p), null, 'the shell shortcut was not removed')
    await p.setRunning(true)
    assert.equal(titleOf(p), STATUS.working.text)
    await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: cards(2) })
    assert.equal(titleOf(p), `${STATUS.attention.text} (2)`)
    await p.fail('asks', false)
    assert.equal(titleOf(p), STATUS.offline.text)
    await p.deliver('asks', { managerSessionId: FIXTURE.manager, cards: [] })
    await p.setRunning(false)
    assert.equal(titleOf(p), STATUS.connected.text)
    assert.equal(shortcutOf(p), null, 'the shell shortcut came back while mounted')
  })

  // ================================================================ the New Session button stays hidden
  for (const lang of ['en', 'zh']) {
    t('BRAND-NS-01', lang, `(${lang}) hide both native New Session actions until the wide brand is owned, including after shell replacement`, async (c) => {
      const h = await hidePage(c, { lang })
      assert.equal(h.hidden(h.brand), true, 'unowned wide button still exposes native New Session')
      assert.equal(h.hidden(h.newSession), true, 'the actual New Session button is not hidden')
      assert.equal(h.hidden(h.other), false, 'an unrelated control was hidden')
      h.mountLogo()
      h.brand.setAttribute(HOOK.control, '')
      h.brand.setAttribute('aria-label', LABEL.brand)
      await h.flush()
      assert.equal(h.hidden(h.brand), false, 'the brand row was hidden after the logo mounted')
      assert.equal(h.hidden(h.newSession), true, 'the actual New Session button is not hidden after mount')
      h.brand.setAttribute('aria-label', LABEL.newSession[lang])
      await h.flush()
      assert.equal(h.hidden(h.brand), false, 'restoring the native label must not hide the captured button')
      assert.equal(h.hidden(h.newSession), true, 'the separate New Session launcher must remain hidden')
      const next = h.rerender()
      await h.flush()
      assert.equal(h.hidden(next.brand), true, 'fresh shell button has its native label and no brand owner yet')
      assert.equal(h.hidden(next.newSession), true, 'the actual New Session button is not hidden after a rerender')
    })
  }

  t('BRAND-NS-02', 'slot anchors', 'preserve the mark-only Open sidebar rail toggle, but a name outlet alone does not make a New Session action safe', async (c) => {
    const h = await hidePage(c, { lang: 'en' })
    assert.equal(h.hidden(h.markOnly), false, 'a mark-slot button was hidden')
    assert.equal(h.hidden(h.nameOnly), true, 'partial brand without capture exposes New Session')
    assert.equal(h.hidden(h.newSession), true, 'the actual New Session button is not hidden')
  })

  // ================================================================ teardown
  t('BRAND-TEAR-01', 'brand part', 'unmounting the brand part unregisters both slots, closes both streams, removes its styles, restores the shell button\'s previous aria-label and aria-description, and disconnects its observers', async (c) => {
    const p = await brandPage(c)
    await connected(p, { cardCount: 1 })
    assert.equal(p.button()?.getAttribute('aria-label'), LABEL.brand)
    assert.ok((p.button()?.getAttribute('aria-description') ?? '').length > 0)
    const previous = { label: LABEL.newSession.en, description: null, title: null, shortcut: SHELL.shortcut }
    assert.equal(titleOf(p), `${STATUS.attention.text} (1)`)
    assert.equal(shortcutOf(p), null)
    await p.unmountBrand()
    assert.deepEqual(p.world.entries(SLOT.mark).length + p.world.entries(SLOT.name).length, 0, 'slots are still registered')
    assert.deepEqual(p.sources.opened.filter((s) => !s.closed).map((s) => s.url), [], 'a stream is still open')
    assert.deepEqual(p.styles().map((text) => text.slice(0, BRAND_STYLE_PREVIEW)), [], 'a brand style is still mounted')
    assert.equal(p.button()?.getAttribute('aria-label'), previous.label, 'the previous label was not restored')
    assert.equal(p.button()?.getAttribute('aria-description'), previous.description, 'the previous description was not restored')
    assert.equal(titleOf(p), previous.title, 'the previous title was not restored (removed)')
    assert.equal(shortcutOf(p), previous.shortcut, 'the previous aria-keyshortcuts was not restored')
    // The observer went with the part: writing the shell label again stays written.
    p.button().setAttribute('aria-label', previous.label)
    await p.settle()
    assert.equal(p.button()?.getAttribute('aria-label'), previous.label, 'the observer still rewrites the label')
  })
  t('BRAND-TEAR-02', 'page root', 'removing <html data-fishball-page> unregisters the brand slots, closes its streams, restores the label/description, and disconnects the observers (the shell stays)', async (c) => {
    const p = await brandPage(c)
    await connected(p, {})
    assert.equal(p.button()?.getAttribute('aria-label'), LABEL.brand)
    await p.setPageMark(false)
    assert.equal(p.world.entries(SLOT.mark).length, 0, 'the mark slot is still registered')
    assert.equal(p.world.entries(SLOT.name).length, 0, 'the name slot is still registered')
    assert.deepEqual(p.sources.opened.filter((s) => !s.closed).map((s) => s.url), [], 'a stream is still open')
    assert.equal(p.button()?.getAttribute('aria-label'), LABEL.newSession.en, 'the previous label was not restored')
    assert.equal(p.button()?.getAttribute('aria-description'), null, 'the description was not removed')
    assert.equal(titleOf(p), SHELL.title, 'the title was not removed')
    assert.equal(shortcutOf(p), SHELL.shortcut, 'aria-keyshortcuts was not restored')
    assert.ok(p.button(), 'the shell button was removed')
    p.button().setAttribute('aria-label', LABEL.newSession.en)
    await p.settle()
    assert.equal(p.button()?.getAttribute('aria-label'), LABEL.newSession.en, 'the observer still rewrites the label')
  })

  // ================================================================ the wordmark's typography (browser)
  const browserRow = (id, row, title, fn) => caseTest(id, row, title, async (c) => {
    if (!hasChrome()) { c.skip('no Chromium binary (the contrast rows skip so too)'); return }
    await fn(c)
  })
  browserRow('BRAND-EP-09', 'wordmark', 'the wordmark FISHBALL is drawn bold (>= 700) and larger than the Deepseek Harness tag beneath it, in both themes', async (c) => {
    for (const theme of THEMES) {
      const p = await brandPage(c)
      await connected(p, { theme })
      const words = await measureWords(p.nameRoot(), p.styleText())
      assert.ok(words.word, 'no wordmark element')
      assert.equal(words.word.text, WORDMARK.text)
      assert.equal(Number(words.word.weight) >= 700, true, `wordmark weight ${words.word.weight}`)
      assert.ok(words.tag, 'no tag element')
      assert.equal(words.tag.text, WORDMARK.tag)
      assert.ok(words.tag.size < words.word.size, `tag size ${words.tag.size} is not smaller than the wordmark ${words.word.size}`)
    }
  })

  // ================================================================ the theme's accent (browser)
  const COLOURS = /rgba?\([^)]*\)/g
  /** Every colour a computed shadow list paints, as rgb channels (a translucent layer keeps its accent's channels). */
  const shadowColours = (text) => (String(text).match(COLOURS) ?? []).map((c) => { const { r, g, b } = parseColour(c); return [r, g, b] })
  const sameChannels = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-6)
  const accentRow = (dshTheme) => browserRow('BRAND-EP-10', `accent ${dshTheme.id}`, `(DSH ${dshTheme.id}) the accent: fishball keeps magenta (a magenta tag shadow, count pill ${ACCENT.fishballPill}); deepseek is DeepSeek blue (a tag shadow in ${ACCENT.deepseek}, no magenta) with a darkened blue count pill whose fill reaches ${WCAG.text}:1 against its white text`, async (c) => {
    const drawn = {}
    for (const theme of THEMES) {
      const p = await brandPage(c)
      await connected(p, { theme, cardCount: ACCENT.cards })
      drawn[theme] = await measureAccent(p.brandButton(), p.styleText(), dshTheme)
      assert.equal(drawn[theme].missing, undefined, `${theme}: no tag or count pill drawn: ${show(drawn[theme].missing)}`)
    }
    const { fishball, deepseek } = drawn
    const magentaIn = (shadow) => shadowColours(shadow).some(([r, g, b]) => isMagenta(`rgb(${r * 255}, ${g * 255}, ${b * 255})`))
    assert.ok(magentaIn(fishball.shadow), `fishball tag shadow has no magenta: ${show(fishball.shadow)}`)
    assert.equal(fishball.fill, ACCENT.fishballPill, 'the fishball count pill changed')
    const blue = shadowColours(ACCENT.deepseek)[0]
    assert.ok(shadowColours(deepseek.shadow).some((c) => sameChannels(c, blue)), `deepseek tag shadow is not DeepSeek blue: ${show(deepseek.shadow)}`)
    assert.equal(magentaIn(deepseek.shadow), false, `deepseek tag shadow is still magenta: ${show(deepseek.shadow)}`)
    assert.equal(deepseek.text, ACCENT.pillText, 'the deepseek count pill text is not white')
    const fill = parseColour(deepseek.fill)
    assert.equal(fill.a, 1, `the deepseek count pill fill is not opaque: ${deepseek.fill}`)
    assert.ok(fill.b > fill.r && fill.b > fill.g, `the deepseek count pill is not blue: ${deepseek.fill}`)
    const ratio = contrast(fill, parseColour(deepseek.text))
    assert.ok(ratio >= WCAG.text, `deepseek count pill ${deepseek.fill} under ${deepseek.text}: ${shown(ratio)}:1 < ${WCAG.text}:1`)
  })
  for (const dshTheme of DSH_THEME.all()) accentRow(dshTheme)

  // ================================================================ the working animation and reduced motion
  // The drawer below 768px is DSH 0.2.2-rc.1's layout only (dsh-client-ui-layout AppFrame): the row
  // is registered on that DSH (the release matrix), not on one without a drawer.
  if (DRAWER.versions.includes(DSH_VERSION)) {
    t('BRAND-EP-08', 'drawer row', 'rc.1 below 768px draws the same wide brand row in the drawer: the mark, wordmark and tag are the same occupants, and the manager button still opens the one session', async (c) => {
      const p = await brandPage(c)
      await connected(p, {})
      assert.ok(p.nameRoot(), 'the drawer brand row has no name occupant')
      assert.equal(p.text(p.nameRoot()).includes(WORDMARK.text), true)
      assert.equal(p.text(p.nameRoot()).includes(WORDMARK.tag), true)
      await p.click(p.button())
      assert.deepEqual(p.opens, [FIXTURE.manager])
    })
  }
  browserRow('BRAND-MOTION-01', 'fish', 'working, Fishball theme, no reduced-motion preference → the fish wags (a running CSS animation); with (prefers-reduced-motion: reduce) → no animation', async (c) => {
    const moving = await brandPage(c, { reducedMotion: false })
    await connected(moving, { theme: THEME.fishball, running: true })
    const on = await measureMotion(moving.markRoot(), moving.styleText(), false)
    assert.ok(on.animated.length > 0, 'the fish does not animate while working')
    const still = await brandPage(c, { reducedMotion: true })
    await connected(still, { theme: THEME.fishball, running: true })
    const off = await measureMotion(still.markRoot(), still.styleText(), true)
    assert.deepEqual(off.animated, [], 'the fish still animates under prefers-reduced-motion: reduce')
  })
  browserRow('BRAND-MOTION-02', 'whale', 'working, DeepSeek theme, no reduced-motion preference → the whale swims (its own animation, different from the fish); with reduce → static', async (c) => {
    const moving = await brandPage(c, { reducedMotion: false })
    await connected(moving, { theme: THEME.deepseek, running: true })
    const whale = await measureMotion(moving.markRoot(), moving.styleText(), false)
    assert.ok(whale.animated.length > 0, 'the whale does not animate while working')
    const fishMoving = await brandPage(c, { reducedMotion: false })
    await connected(fishMoving, { theme: THEME.fishball, running: true })
    const fish = await measureMotion(fishMoving.markRoot(), fishMoving.styleText(), false)
    assert.notDeepEqual(whale.animated.map((a) => a.name), fish.animated.map((a) => a.name), 'the fish and whale share one animation')
    const still = await brandPage(c, { reducedMotion: true })
    await connected(still, { theme: THEME.deepseek, running: true })
    const off = await measureMotion(still.markRoot(), still.styleText(), true)
    assert.deepEqual(off.animated, [], 'the whale still animates under prefers-reduced-motion: reduce')
  })
  browserRow('BRAND-MOTION-03', 'idle', 'connected-idle → no animation in either theme', async (c) => {
    for (const theme of THEMES) {
      const p = await brandPage(c, { reducedMotion: false })
      await connected(p, { theme, running: false })
      const r = await measureMotion(p.markRoot(), p.styleText(), false)
      assert.deepEqual(r.animated, [], `idle ${theme} animates`)
    }
  })
  after(stopMotionBrowser)
}