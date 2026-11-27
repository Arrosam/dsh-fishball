/**
 * R-FIX-FUI F3 (stream health of the ask cards) and F9 (the ask card's time in the DSH UI language)
 * black-box rows. Component level: fishball-ui's real client and parts in the scripted DSH page
 * (page.mjs), the page's one connection the stand-in for every stream.
 *
 * Techniques (README.md beside this file):
 * - State transition HEALTH-ST-…: live → stale (error, CONNECTING) → live (valid frame);
 *   live → closed (error, CLOSED) → Reconnect → stale → live; remount; unmount;
 * - EP HEALTH-EP-01: frames that do / do not count as valid;
 * - Decision table HEALTH-DT-01: health × UI language → what the ask dock draws;
 * - F9 TIME-DT-01: UI language × runtime default locale → the time text.
 * The strip card's rows (HEALTH-DT-01 strip, HEALTH-ST-01/02/03) were withdrawn by MULTI-3
 * (requirement D: no chat-top strip card); they are retired, not registered.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { ASK, askCards, askFrame } from '../support/ask-card.mjs'
import { BAD_FRAMES, CONTROLS_PER_CARD, HEALTH, HEALTH_HOOK, LANGS, NOTICE_TEXT, TIME } from './constants.mjs'
import { dockPage } from './page.mjs'

const show = (v) => JSON.stringify(v)
/** Bad frame text: a frame whose `cards` is not an array is spelled from the fixture manager. */
const badText = (raw) => (raw === 'cards-not-array' ? JSON.stringify({ ...askFrame([]), cards: 'x' }) : raw)

/** The page realm's Date and Intl with `forced` as their default locale (F9). */
function forceDefaultLocale(forced) {
  return (sandbox) => {
    const RealDate = Date
    const RealIntl = Intl
    class ForcedDate extends RealDate {
      toLocaleString(locales, options) { return super.toLocaleString(locales ?? forced, options) }
      toLocaleDateString(locales, options) { return super.toLocaleDateString(locales ?? forced, options) }
      toLocaleTimeString(locales, options) { return super.toLocaleTimeString(locales ?? forced, options) }
    }
    const DateTimeFormat = function (locales, options) { return new RealIntl.DateTimeFormat(locales ?? forced, options) }
    DateTimeFormat.supportedLocalesOf = RealIntl.DateTimeFormat.supportedLocalesOf
    sandbox.Date = ForcedDate
    sandbox.Intl = { ...Object.fromEntries(Object.getOwnPropertyNames(RealIntl).map((k) => [k, RealIntl[k]])), DateTimeFormat }
  }
}

export function registerStreamCases() {
  const noticeOf = (p, among) => p.byHook(HEALTH_HOOK.notice, undefined, among)
  const within = (p) => p.within(p.root())
  /** Ask-card controls: the choice buttons and the reason box. */
  const askControls = (p) => [...p.byHook(ASK.choice, undefined, within(p)).filter((n) => n.tag === 'button'), ...within(p).filter((n) => n.tag === 'textarea')]
  async function disclose(p, card) {
    const [root] = p.byHook(ASK.card, card.handle)
    const toggle = p.within(root).find((n) => n.props[ASK.expanded] !== undefined)
    assert.ok(toggle, 'cached card must remain readable through its disclosure')
    if (String(toggle.props[ASK.expanded]) === 'false') await p.press(toggle)
  }

  caseTest('HEALTH-ST-00', 'initial', 'no frame yet and no error: no notice anywhere', async (c) => {
    const p = await dockPage(c)
    assert.deepEqual(p.byHook(HEALTH_HOOK.notice), [])
  })

  for (const lang of LANGS) {
    for (const [health, closed] of [[HEALTH.stale, false], [HEALTH.closed, true]]) {
      caseTest('HEALTH-DT-01', `asks ${health} ${lang}`, `(${lang}) ask cards, error ${closed ? 'CLOSED' : 'reconnecting'} → the ${health} notice in the asks dock, [${HEALTH_HOOK.asksStale}=${health}], the cards still readable, every choice and the reason box disabled${closed ? ', Reconnect' : ''}`, async (c) => {
        const p = await dockPage(c, { lang })
        const cards = askCards(2)
        await p.deliverAsks(askFrame(cards))
        for (const card of cards) {
          await disclose(p, card)
          const controls = askControls(p)
          assert.equal(controls.length, CONTROLS_PER_CARD)
          assert.ok(controls.every((n) => n.props.disabled !== true), 'precondition: live controls enabled')
        }
        await p.fail(closed)
        const root = p.root()
        assert.ok(root, 'the asks dock is gone')
        assert.equal(root.props[HEALTH_HOOK.asksStale], health)
        const notices = p.byHook(HEALTH_HOOK.notice, health, within(p))
        assert.equal(notices.length, 1, show(noticeOf(p).map((n) => n.props[HEALTH_HOOK.notice])))
        assert.ok(p.text(notices[0]).includes(NOTICE_TEXT[health][lang]))
        for (const card of cards) assert.ok(p.text(root).includes(card.question), 'a cached card is not readable')
        // A multi-card dock exposes only the expanded card's controls; check each in turn.
        for (const card of cards) {
          await disclose(p, card)
          const controls = askControls(p)
          assert.equal(controls.length, CONTROLS_PER_CARD, `controls ${controls.length}`)
          assert.deepEqual(controls.filter((n) => n.props.disabled !== true).map((n) => n.tag + ':' + (n.props[ASK.choice] ?? '')), [], 'enabled while ' + health)
        }
        assert.equal(p.byHook(HEALTH_HOOK.retry, undefined, within(p)).length, closed ? 1 : 0)
      })
    }
  }
  caseTest('HEALTH-ST-04', 'asks recovery', 'asks stale → a fresh valid frame re-enables every choice and the reason box; the notice goes', async (c) => {
    const p = await dockPage(c)
    const cards = askCards(1)
    await p.deliverAsks(askFrame(cards))
    await p.fail(false)
    await p.deliverAsks(askFrame(cards))
    assert.deepEqual(noticeOf(p, within(p)), [])
    assert.ok(askControls(p).length === CONTROLS_PER_CARD && askControls(p).every((n) => n.props.disabled !== true))
  })
  for (const [label, raw] of BAD_FRAMES) {
    caseTest('HEALTH-EP-01', `asks ${label}`, `asks stale → a frame that is ${label} keeps the notice and the disabled controls`, async (c) => {
      const p = await dockPage(c)
      await p.deliverAsks(askFrame(askCards(1)))
      await p.fail(false)
      await p.deliverAsksRaw(badText(raw))
      assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.stale, within(p)).length, 1)
      assert.ok(askControls(p).every((n) => n.props.disabled === true))
    })
  }
  caseTest('HEALTH-ST-05', 'asks closed → Reconnect → stale → live', 'asks closed → Reconnect: the notice is stale (not closed) until a frame arrives, then gone', async (c) => {
    const p = await dockPage(c)
    const cards = askCards(1)
    await p.deliverAsks(askFrame(cards))
    await p.fail(true)
    await p.press(p.byHook(HEALTH_HOOK.retry, undefined, within(p))[0])
    assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.stale, within(p)).length, 1, show(noticeOf(p).map((n) => n.props[HEALTH_HOOK.notice])))
    assert.equal(p.carriers().length, 1)
    await p.deliverAsks(askFrame(cards))
    assert.deepEqual(noticeOf(p, within(p)), [])
  })
  // Re-baselined (MULTI-3 requirement D): the dock's streams are the ask cards' only; the shared
  // Reconnect across the sidebar and the asks is the sidebar's own row (TGT-SB-ST-06).
  caseTest('HEALTH-ST-06', 'Reconnect reopens the asks stream', 'asks closed → one Reconnect press closes the old EventSource and opens one new asks stream, stale until its frame', async (c) => {
    const p = await dockPage(c)
    await p.deliverAsks(askFrame(askCards(1)))
    const old = p.carriers()
    await p.fail(true)
    await p.press(p.byHook(HEALTH_HOOK.retry, undefined, within(p))[0])
    assert.ok(old.every((s) => s.closed), 'an old EventSource stayed open')
    assert.equal(p.carriers().length, 1)
    assert.equal(p.root()?.props[HEALTH_HOOK.asksStale], HEALTH.stale)
  })
  caseTest('HEALTH-ST-07', 'remount after closed', 'a stream closed, then every card unmounted and mounted again → it reads stale (not closed) until a frame', async (c) => {
    const p = await dockPage(c)
    await p.deliverAsks(askFrame(askCards(1)))
    await p.fail(true)
    await p.unmountDock()
    await p.remount()
    assert.equal(p.carriers().length, 1, 'not reopened on remount')
    assert.equal(p.root()?.props[HEALTH_HOOK.asksStale], HEALTH.stale)
  })
  caseTest('HEALTH-ST-08', 'unmount closes', 'unmounting every card closes every EventSource', async (c) => {
    const p = await dockPage(c)
    await p.deliverAsks(askFrame(askCards(1)))
    const open = p.sources.opened.filter((s) => !s.closed)
    assert.ok(open.length > 0, 'precondition')
    await p.unmountDock()
    assert.deepEqual(open.filter((s) => !s.closed).map((s) => s.url), [])
  })

  for (const lang of LANGS) {
    caseTest('TIME-DT-01', `UI ${lang}`, `UI ${lang}, runtime default ${TIME.forcedDefault[lang]} → the card time is new Date(askedAt).toLocaleString('${TIME.locale[lang]}'), the browser's zone`, async (c) => {
      // The page realm's default locale is forced to the other language: Date and Intl without a
      // locale use it, so only a time written in the UI language passes.
      const forced = TIME.forcedDefault[lang]
      const p = await dockPage(c, { lang, onSandbox: forceDefaultLocale(forced) })
      const [card] = askCards(1)
      await p.deliverAsks(askFrame([card]))
      const expected = new Date(card.askedAt).toLocaleString(TIME.locale[lang])
      const wrong = new Date(card.askedAt).toLocaleString(forced)
      assert.notEqual(expected, wrong, 'precondition: the two locales write the time differently')
      const text = p.text(p.root())
      assert.ok(text.includes(expected), `${show(expected)} not in ${show(text)}`)
      assert.equal(text.includes(wrong), false, 'the runtime default locale was used')
    })
  }
}
