/**
 * UI-POLISH-D rows of embed-UI's window and prompt (USE-CASES.md "UI-POLISH-D"; constants.mjs
 * POLISH). The restyle keeps every hook, role and route; these rows pin what it added:
 * - UIPD-DRAW-HINT (EP over the language): the no-instance view leads with `noInstanceTitle`
 *   above the unchanged hint, under a decorative fish glyph (no `data-fishball-mark`);
 * - UIPD-DRAW-NOTREADY (EP over the K3 not-ready states disabled, waiting, starting, stopping,
 *   stopped, failed; en and zh): the lead line "Fishball isn't ready (<state words>)." above the
 *   unchanged "State <code>" (and "Code <code>") lines; the state tag holds a StateDot;
 * - UIPD-DRAW-CHROME: the header's decorative fish before "Fishball", Refresh with its icon;
 * - UIPD-DRAW-PLACE (state transition): the bubble's `data-fishball-notice-place` is `mark` beside
 *   a visible sidebar fish (left = fish right + 8, top = fish top) and `corner` (left = bottom = 16)
 *   once the fish is hidden, and back; role=status and the notice hooks unchanged.
 *
 * Level: integration, the world of cases.mjs (world.mjs). The page's document answers where the
 * sidebar fish is (a scripted bounding box): the scripted page has no layout of its own.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { assertHint, assertNotReady, mountMain, mountOverlay, noticeNode, world } from './cases.mjs'
import { ATTR, CHILD, FIXTURE, POLISH, TAG, TEXT, TOOL, WAIT } from './constants.mjs'
import { attrOf, byTag, subtreeOf, textIn, withAttr } from './world.mjs'

const draw = (sdk, id, part, title, fn) => test(caseName(sdk, id, part, title), { timeout: WAIT.testMs }, fn)
const paragraphs = (nodes) => byTag(nodes, 'p')
const primitive = (node) => String(node.props[POLISH.primitiveAttr] ?? '')
/**
 * The primitive an element prop (a Button's `icon`) names: the page's fake primitives render each
 * export as a host element marked with its export name, so the element is rendered once to read it.
 */
const iconName = (element) => (typeof element?.type === 'function' ? String(element.type(element.props ?? {})?.props?.[POLISH.primitiveAttr] ?? '') : '')
/** The window's header (its first `header` element). */
const headerOf = (view) => byTag(view.tree(), POLISH.header)[0]

/** Answers the page's queries for the sidebar fish with `rect()` (null: no fish on the page). */
export function scriptFish(page, rect) {
  const isFish = (selector) => POLISH.fishSelectors.some((hook) => String(selector).includes(hook))
  const element = () => ({ getBoundingClientRect: () => ({ ...rect() }) })
  page.document.querySelector = (selector) => (isFish(selector) && rect() !== null ? element() : null)
  page.document.querySelectorAll = (selector) => (isFish(selector) && rect() !== null ? [element()] : [])
}
/** The bubble's place and inline position. */
export const placeOf = (page) => { const n = noticeNode(page); return { place: attrOf(n, POLISH.placeAttr), style: { ...(n?.props.style ?? {}) } } }

export function registerUDrawPolishCases(sdk) {
  // ---------------------------------------------------------------- the no-instance view
  for (const lang of TEXT.langs) {
    draw(sdk, POLISH.id.hint, lang, `no instance (${lang}) → "${POLISH.noInstanceTitle[lang]}" above the hint [data-fishball-no-instance]; a decorative fish glyph, no data-fishball-mark in the window`, async (t) => {
      const { page } = await world(t, sdk, { host: { child: null }, page: { lang } })
      const view = await mountMain(page)
      assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.noInstance).length > 0), 'no hint')
      if (lang === TEXT.langs[0]) assertHint(view)
      const hint = withAttr(view.tree(), ATTR.noInstance)[0]
      assert.equal(textIn(hint), POLISH.noInstance[lang])
      const lines = paragraphs(view.tree())
      const lead = lines.findIndex((p) => textIn(p) === POLISH.noInstanceTitle[lang])
      assert.ok(lead >= 0, 'no lead line: ' + JSON.stringify(lines.map(textIn)))
      assert.ok(lead < lines.indexOf(hint), 'the lead line is not above the hint')
      const svgs = byTag(view.tree(), TAG.svg)
      assert.ok(svgs.length > 0, 'no fish glyph')
      assert.deepEqual(withAttr(view.tree(), ATTR.fishMark), [], 'a window fish carries data-fishball-mark')
      assert.ok(svgs.every((s) => String(s.props[POLISH.ariaHidden]) === 'true' || subtreeOf(s).length > 0), 'a glyph is not decorative')
      assert.ok(!withAttr(view.tree(), POLISH.primitiveAttr).some((n) => POLISH.warningIcon.test(primitive(n))), 'the warning icon is still the hint glyph')
    })
  }

  // ---------------------------------------------------------------- the not-ready view (EP over K3 states, en / zh)
  for (const lang of TEXT.langs) {
    for (const status of CHILD.notReady) {
      const words = POLISH.frameState[lang][status.state]
      draw(sdk, POLISH.id.notReady, `${status.state} (${lang})`, `child ${status.state} → lead "${POLISH.notReady[lang](words)}" above "${POLISH.details[lang].state} ${status.state}"${status.code ? ` and "${POLISH.details[lang].code} ${status.code}"` : ''}; the state tag holds a StateDot before "${words}"`, async (t) => {
        const { w, page } = await world(t, sdk, { host: { child: { status } }, page: { lang } })
        const view = await mountMain(page)
        if (lang === TEXT.langs[0]) await assertNotReady(page, view, w, status)
        else assert.ok(await page.waitFor(() => withAttr(view.tree(), ATTR.embedState, status.state).length > 0), 'no state tag')
        const lines = paragraphs(view.tree()).map(textIn)
        const lead = lines.indexOf(POLISH.notReady[lang](words))
        assert.ok(lead >= 0, 'no lead line: ' + JSON.stringify(lines))
        const stateLine = lines.indexOf(`${POLISH.details[lang].state} ${status.state}`)
        assert.ok(stateLine > lead, 'the State line is not below the lead: ' + JSON.stringify(lines))
        const codeLine = lines.indexOf(`${POLISH.details[lang].code} ${status.code}`)
        assert.equal(codeLine > lead, status.code !== null, 'the Code line: ' + JSON.stringify(lines))
        const stateCodes = byTag(view.tree(), POLISH.code).map(textIn)
        assert.ok(stateCodes.includes(status.state), 'the state is not in <code>')
        const tag = withAttr(view.tree(), ATTR.embedState, status.state)[0]
        const dot = withAttr([tag], POLISH.primitiveAttr).find((n) => primitive(n) === POLISH.stateDot)
        assert.ok(dot, 'no StateDot in the state tag')
        assert.ok(textIn(tag).includes(words), 'the tag lost its words: ' + textIn(tag))
      })
    }
  }

  // ---------------------------------------------------------------- the window's chrome
  draw(sdk, POLISH.id.chrome, 'header', 'the ready window: a decorative fish (no data-fishball-mark) before "Fishball"; the state tag holds a StateDot before "running"; Refresh keeps its word and has an icon', async (t) => {
    const { page } = await world(t, sdk)
    const view = await mountMain(page)
    assert.ok(await page.waitFor(() => byTag(view.tree(), TAG.iframe).length > 0), 'no frame')
    const header = headerOf(view)
    assert.ok(header, 'no header')
    const [fish] = byTag([header], TAG.svg)
    assert.ok(fish, 'no fish in the header')
    assert.equal(attrOf(fish, ATTR.fishMark), undefined, 'the header fish carries data-fishball-mark')
    assert.ok(textIn(header).startsWith(POLISH.viewTitle), 'the title does not follow the fish: ' + textIn(header))
    const tag = withAttr([header], ATTR.embedState, CHILD.ready.state)[0]
    assert.ok(withAttr([tag], POLISH.primitiveAttr).some((n) => primitive(n) === POLISH.stateDot), 'no StateDot in the ready tag')
    assert.ok(textIn(tag).includes(POLISH.frameState.en.ready))
    const refresh = byTag([header], TAG.button).find((b) => textIn(b) === POLISH.refresh.en)
    assert.ok(refresh, 'no Refresh button')
    assert.match(iconName(refresh.props.icon), POLISH.refreshIcon, 'Refresh has no refresh icon')
  })

  // ---------------------------------------------------------------- the bubble's place (state transition)
  draw(sdk, POLISH.id.place, 'mark → corner → mark', `the fish visible → notify → place mark (left = fish right + ${POLISH.gapPx}, top = fish top); the fish hidden → the next render is place corner (left = bottom = ${POLISH.edgePx}); visible again → mark`, async (t) => {
    const { w, page } = await world(t, sdk)
    let rect = POLISH.fishRect
    scriptFish(page, () => rect)
    await mountOverlay(page)
    await w.call(TOOL.notify, { message: FIXTURE.message })
    assert.ok(await page.waitFor(() => noticeNode(page)), 'no bubble')
    assert.deepEqual(placeOf(page), { place: POLISH.place.mark, style: { left: POLISH.fishRect.right + POLISH.gapPx, top: POLISH.fishRect.top } })
    rect = POLISH.hiddenRect
    await w.call(TOOL.notify, { message: FIXTURE.message2 })
    assert.ok(await page.waitFor(() => placeOf(page).place === POLISH.place.corner), 'the bubble did not move to the corner: ' + JSON.stringify(placeOf(page)))
    assert.deepEqual(placeOf(page).style, { left: POLISH.edgePx, bottom: POLISH.edgePx })
    rect = POLISH.fishRect
    await w.call(TOOL.notify, { message: FIXTURE.message })
    assert.ok(await page.waitFor(() => placeOf(page).place === POLISH.place.mark), 'the bubble did not come back beside the fish')
  })
  draw(sdk, POLISH.id.place, 'no fish', 'no sidebar fish on the page → place corner (left = bottom = 16); the bubble is still a button in a role=status region with its hooks and aria-label', async (t) => {
    const { w, page } = await world(t, sdk)
    scriptFish(page, () => null)
    const overlay = await mountOverlay(page)
    await w.call(TOOL.notify, { message: FIXTURE.message })
    assert.ok(await page.waitFor(() => noticeNode(page)), 'no bubble')
    assert.deepEqual(placeOf(page), { place: POLISH.place.corner, style: { left: POLISH.edgePx, bottom: POLISH.edgePx } })
    const notice = noticeNode(page)
    assert.equal(notice.tag, TAG.button)
    assert.ok(String(notice.props[ATTR.ariaLabel] ?? '').includes(FIXTURE.message), 'aria-label lost the message')
    assert.equal(textIn(withAttr([notice], ATTR.noticeCount)[0]), '1')
    const region = withAttr(overlay.tree(), ATTR.role, 'status').find((r) => subtreeOf(r).includes(notice))
    assert.ok(region, 'the bubble is not inside a role=status region')
  })
}
