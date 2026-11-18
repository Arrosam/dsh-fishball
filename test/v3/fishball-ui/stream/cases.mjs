/**
 * R-FIX-FUI F3 (stream health: ask cards; the strip and pairing card withdrawn by MULTI-3) and F9 (the ask card's time in the
 * DSH UI language) black-box rows. Component level: fishball-ui's real client and parts in the
 * scripted DSH page (page.mjs), one health-aware EventSource stand-in for every stream.
 *
 * Techniques (USE-CASES.md beside this file):
 * - State transition HEALTH-ST-01…: live → stale (error, CONNECTING) → live (valid frame);
 *   live → closed (error, CLOSED) → Reconnect → stale → live; initial closed (no frame ever);
 * - EP HEALTH-EP-01: frames that do / do not count as valid;
 * - Decision table HEALTH-DT-01: card (strip / asks / pairing) × health → what is drawn (the strip
 *   rows kept minimal at the user's request, 2026-11-18: the strip is being redesigned);
 * - F9 TIME-DT-01: UI language × runtime default locale → the time text.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { expectedCard, askEvent } from '../../fishball-core/asks/world.mjs'
import { EVENT_TYPE, ARGUMENTS_STATUS } from '../../fishball-core/asks/constants.mjs'
import { settle } from '../../fishball-core/settings/page.mjs'
import { HEALTH, HEALTH_HOOK, LANGS, NOTICE_TEXT, TIME } from './constants.mjs'
import { DOCK, dockPage } from './page.mjs'
import { WITHDRAWN } from '../model-dialog/targets-constants.mjs'
import { withdrawnRow } from '../model-dialog/withdrawn.mjs'
import { withSource } from '../model-dialog/targets.mjs'

const show = (v) => JSON.stringify(v)
const ASK = Object.freeze({ card: 'data-fishball-ask', choice: 'data-fishball-ask-choice', time: 'fb-ask-time' })

export function registerStreamCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  // Re-baselined (MULTI-0 ask-card.d.ts): every card carries its opaque handle and source.
  const askCards = (n = 1) => Array.from({ length: n }, () => withSource(expectedCard(askEvent({ type: EVENT_TYPE.permission, argumentsText: '{}', argumentsStatus: ARGUMENTS_STATUS.complete }), 'open')))
  const askFrame = (cards) => ({ managerSessionId: DOCK.managerSession, cards })
  const noticeOf = (p, among) => p.byHook(HEALTH_HOOK.notice, undefined, among)
  /** Ask-card controls: the choice buttons and the reason box. */
  const askControls = (p) => [...p.byHook(ASK.choice, undefined, p.within('asks')).filter((n) => n.tag === 'button'), ...p.within('asks').filter((n) => n.tag === 'textarea')]

  // ======================================================================== HEALTH-ST-00: nothing yet
  t('HEALTH-ST-00', 'initial', 'no frame yet and no error: no notice anywhere', async (c) => {
    const p = await dockPage(c, sdk)
    assert.deepEqual(p.byHook(HEALTH_HOOK.notice), [])
  })

  // ======================================================================== the strip (withdrawn)
  // Re-baselined (MULTI-3 requirement D): there is no strip card in the dock any more; the sidebar
  // target list's own health rows are model-dialog/targets-cases.mjs TGT-SB-ST-06.
  for (const lang of LANGS) {
    withdrawnRow(sdk, 'HEALTH-DT-01', `strip stale ${lang}`, `(${lang}) strip, error while reconnecting`, WITHDRAWN.strip)
    withdrawnRow(sdk, 'HEALTH-ST-01', `strip closed → Reconnect ${lang}`, `(${lang}) strip, error with CLOSED`, WITHDRAWN.strip)
  }
  withdrawnRow(sdk, 'HEALTH-ST-02', 'strip recovery', 'strip stale → a fresh valid frame', WITHDRAWN.strip)
  withdrawnRow(sdk, 'HEALTH-ST-03', 'initial closed', 'no frame ever, error with CLOSED → the strip card', WITHDRAWN.strip)

  // ======================================================================== the ask cards (depth)
  for (const lang of LANGS) {
    for (const [health, closed] of [[HEALTH.stale, false], [HEALTH.closed, true]]) {
      t('HEALTH-DT-01', `asks ${health} ${lang}`, `(${lang}) ask cards, error ${closed ? 'CLOSED' : 'reconnecting'} → the ${health} notice in the asks dock, [${HEALTH_HOOK.asksStale}=${health}], the cards still readable, every choice and the reason box disabled${closed ? ', Reconnect' : ''}`, async (c) => {
        const p = await dockPage(c, sdk, { lang })
        const cards = askCards(2)
        await p.deliver('asks', askFrame(cards))
        assert.ok(askControls(p).length > 0 && askControls(p).every((n) => n.props.disabled !== true), 'precondition: live controls enabled')
        await p.fail('asks', closed)
        const root = p.root('asks')
        assert.ok(root, 'the asks dock is gone')
        assert.equal(root.props[HEALTH_HOOK.asksStale], health)
        const notices = p.byHook(HEALTH_HOOK.notice, health, p.within('asks'))
        assert.equal(notices.length, 1, show(noticeOf(p).map((n) => n.props[HEALTH_HOOK.notice])))
        assert.ok(p.text(notices[0]).includes(NOTICE_TEXT[health][lang]))
        for (const card of cards) assert.ok(p.text(root).includes(card.question), 'a cached card is not readable')
        const controls = askControls(p)
        assert.equal(controls.length, cards.length * 3, `controls ${controls.length}`)
        assert.deepEqual(controls.filter((n) => n.props.disabled !== true).map((n) => n.tag + ':' + (n.props[ASK.choice] ?? '')), [], 'enabled while ' + health)
        assert.equal(p.byHook(HEALTH_HOOK.retry, undefined, p.within('asks')).length, closed ? 1 : 0)
      })
    }
  }
  t('HEALTH-ST-04', 'asks recovery', 'asks stale → a fresh valid frame re-enables every choice and the reason box; the notice goes', async (c) => {
    const p = await dockPage(c, sdk)
    const cards = askCards(1)
    await p.deliver('asks', askFrame(cards))
    await p.fail('asks', false)
    await p.deliver('asks', askFrame(cards))
    assert.deepEqual(noticeOf(p, p.within('asks')), [])
    assert.ok(askControls(p).length === 3 && askControls(p).every((n) => n.props.disabled !== true))
  })
  // HEALTH-EP-01: frames that are not the route's shape do not count as fresh.
  for (const [label, raw] of [['not JSON', '{oops'], ['null', 'null'], ['no cards array', JSON.stringify({ managerSessionId: DOCK.managerSession, cards: 'x' })], ['an array', '[]']]) {
    t('HEALTH-EP-01', `asks ${label}`, `asks stale → a frame that is ${label} keeps the notice and the disabled controls`, async (c) => {
      const p = await dockPage(c, sdk)
      await p.deliver('asks', askFrame(askCards(1)))
      await p.fail('asks', false)
      for (const s of p.live('asks')) s.deliverRaw(raw)
      await settle()
      assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.stale, p.within('asks')).length, 1)
      assert.ok(askControls(p).every((n) => n.props.disabled === true))
    })
  }
  t('HEALTH-ST-05', 'asks closed → Reconnect → stale → live', 'asks closed → Reconnect: the notice is stale (not closed) until a frame arrives, then gone', async (c) => {
    const p = await dockPage(c, sdk)
    const cards = askCards(1)
    await p.deliver('asks', askFrame(cards))
    await p.fail('asks', true)
    await p.press(p.byHook(HEALTH_HOOK.retry, undefined, p.within('asks'))[0])
    assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.stale, p.within('asks')).length, 1, show(noticeOf(p).map((n) => n.props[HEALTH_HOOK.notice])))
    assert.equal(p.live('asks').length, 1)
    await p.deliver('asks', askFrame(cards))
    assert.deepEqual(noticeOf(p, p.within('asks')), [])
  })
  // Re-baselined (MULTI-3 requirement D): the dock's streams are the ask cards' only (no strip, no
  // pairing card); the shared Reconnect across the sidebar and the asks is TGT-SB-ST-06 "Reconnect reopens".
  t('HEALTH-ST-06', 'Reconnect reopens the asks stream', 'asks closed → one Reconnect press closes the old EventSource and opens one new asks stream, stale until its frame', async (c) => {
    const p = await dockPage(c, sdk)
    await p.deliver('asks', askFrame(askCards(1)))
    const old = p.live('asks')
    await p.fail('asks', true)
    await p.press(p.byHook(HEALTH_HOOK.retry, undefined, p.within('asks'))[0])
    assert.ok(old.every((s) => s.closed), 'an old EventSource stayed open')
    assert.equal(p.live('asks').length, 1)
    assert.equal(p.root('asks')?.props[HEALTH_HOOK.asksStale], HEALTH.stale)
  })
  t('HEALTH-ST-07', 'remount after closed', 'a stream closed, then every card unmounted and mounted again → it reads stale (not closed) until a frame', async (c) => {
    const p = await dockPage(c, sdk)
    await p.deliver('asks', askFrame(askCards(1)))
    await p.fail('asks', true)
    await p.unmount()
    await p.remount()
    assert.equal(p.live('asks').length, 1, 'not reopened on remount')
    assert.equal(p.root('asks')?.props[HEALTH_HOOK.asksStale], HEALTH.stale)
  })
  t('HEALTH-ST-08', 'unmount closes', 'unmounting every card closes every EventSource', async (c) => {
    const p = await dockPage(c, sdk)
    await p.deliver('asks', askFrame(askCards(1)))
    const open = p.sources.opened.filter((s) => !s.closed)
    assert.ok(open.length > 0, 'precondition')
    await p.unmount()
    assert.deepEqual(open.filter((s) => !s.closed).map((s) => s.url), [])
  })

  // ======================================================================== F9: the ask card's time locale
  for (const lang of LANGS) {
    t('TIME-DT-01', `UI ${lang}`, `UI ${lang}, runtime default ${TIME.forcedDefault[lang]} → the card time is new Date(askedAt).toLocaleString('${TIME.locale[lang]}'), the browser's zone`, async (c) => {
      // The page realm's default locale is forced to the other language: Date and Intl without a
      // locale use it, so only a time written in the UI language passes.
      const forced = TIME.forcedDefault[lang]
      const onSandbox = (sandbox) => {
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
      const p = await dockPage(c, sdk, { lang, onSandbox })
      const [card] = askCards(1)
      await p.deliver('asks', askFrame([card]))
      const expected = new Date(card.askedAt).toLocaleString(TIME.locale[lang])
      const wrong = new Date(card.askedAt).toLocaleString(forced)
      assert.notEqual(expected, wrong, 'precondition: the two locales write the time differently')
      const text = p.text(p.root('asks'))
      assert.ok(text.includes(expected), `${show(expected)} not in ${show(text)}`)
      assert.equal(text.includes(wrong), false, 'the runtime default locale was used')
    })
  }
}
