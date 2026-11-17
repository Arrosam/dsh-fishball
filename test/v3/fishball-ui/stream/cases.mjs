/**
 * R-FIX-FUI F3 (stream health: strip, ask cards, pairing card) and F9 (the ask card's time in the
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
import { stripView } from '../../fishball-core/status/subject.mjs'
import { UI_CARD } from '../../fishball-core/status/constants.mjs'
import { snapshotOf } from '../model-dialog/strip.mjs'
import { coreView, viewModule, plain } from '../pairing/subject.mjs'
import { FIXTURE as PAIR_FIXTURE, STATE } from '../pairing/constants.mjs'
import { HEALTH, HEALTH_HOOK, LANGS, NOTICE_TEXT, TIME } from './constants.mjs'
import { DOCK, dockPage } from './page.mjs'

const show = (v) => JSON.stringify(v)
const STRIP = Object.freeze({ stateHook: 'data-fishball-strip-state', badge: 'data-fishball-strip-badge', line: 'data-fishball-strip-line', control: 'data-fishball-strip-control' })
const ASK = Object.freeze({ card: 'data-fishball-ask', choice: 'data-fishball-ask-choice', time: 'fb-ask-time' })
const PAIR = Object.freeze({ choice: 'data-fishball-pairing-choice' })

export function registerStreamCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  const askCards = (n = 1) => Array.from({ length: n }, () => expectedCard(askEvent({ type: EVENT_TYPE.permission, argumentsText: '{}', argumentsStatus: ARGUMENTS_STATUS.complete }), 'open'))
  const askFrame = (cards) => ({ managerSessionId: DOCK.managerSession, cards })
  const stripFrame = (lang, kind = 'needs-authorization', control = 'connect') => stripView(sdk, snapshotOf(kind, { control }), lang)
  const pairingFrame = async (lang) => plain((await viewModule(sdk)).pairingView(coreView(STATE.warnMatch), lang, PAIR_FIXTURE.zones[0]))
  const noticeOf = (p, among) => p.byHook(HEALTH_HOOK.notice, undefined, among)
  /** Ask-card controls: the choice buttons and the reason box. */
  const askControls = (p) => [...p.byHook(ASK.choice, undefined, p.within('asks')).filter((n) => n.tag === 'button'), ...p.within('asks').filter((n) => n.tag === 'textarea')]

  // ======================================================================== HEALTH-ST-00: nothing yet
  t('HEALTH-ST-00', 'initial', 'no frame yet and no error: no notice and no stale mark anywhere', async (c) => {
    const p = await dockPage(c, sdk)
    assert.deepEqual(p.byHook(HEALTH_HOOK.notice), [])
    assert.deepEqual(p.byHook(HEALTH_HOOK.stripStale), [])
  })

  // ======================================================================== the strip (minimal: stale, closed + Reconnect, recovery)
  for (const lang of LANGS) {
    t('HEALTH-DT-01', `strip stale ${lang}`, `(${lang}) strip, error while reconnecting → [${HEALTH_HOOK.stripStale}=stale], the badge says ${show(NOTICE_TEXT.staleBadge[lang])}, no cached lines / tools / control, the stale notice`, async (c) => {
      const p = await dockPage(c, sdk, { lang })
      const frame = await stripFrame(lang)
      await p.deliver('strip', frame)
      await p.fail('strip', false)
      const root = p.root('strip')
      assert.ok(root, 'no strip card')
      assert.equal(root.props[HEALTH_HOOK.stripStale], HEALTH.stale)
      const badge = p.byHook(STRIP.badge, undefined, p.within('strip'))
      assert.equal(badge.length, 1)
      assert.equal(p.text(badge[0]).trim(), NOTICE_TEXT.staleBadge[lang])
      assert.deepEqual(p.byHook(STRIP.line, undefined, p.within('strip')).map((n) => n.props[STRIP.line]), [], 'cached lines / tools chip shown')
      assert.deepEqual(p.byHook(STRIP.control, undefined, p.within('strip')), [], 'cached control shown')
      const notices = p.byHook(HEALTH_HOOK.notice, HEALTH.stale, p.within('strip'))
      assert.equal(notices.length, 1)
      assert.ok(p.text(notices[0]).includes(NOTICE_TEXT.stale[lang]))
    })
    t('HEALTH-ST-01', `strip closed → Reconnect ${lang}`, `(${lang}) strip, error with CLOSED → [stale=closed], the closed notice and a Reconnect button (${show(NOTICE_TEXT.retry[lang])}); pressing it closes the old EventSource and opens a new one`, async (c) => {
      const p = await dockPage(c, sdk, { lang })
      await p.deliver('strip', await stripFrame(lang))
      const [old] = p.live('strip')
      await p.fail('strip', true)
      assert.equal(p.root('strip')?.props[HEALTH_HOOK.stripStale], HEALTH.closed)
      const notices = p.byHook(HEALTH_HOOK.notice, HEALTH.closed, p.within('strip'))
      assert.ok(notices.length === 1 && p.text(notices[0]).includes(NOTICE_TEXT.closed[lang]), show(notices.map((n) => p.text(n))))
      const [retry] = p.byHook(HEALTH_HOOK.retry, undefined, p.within('strip'))
      assert.ok(retry, 'no Reconnect')
      assert.equal(p.text(retry).trim(), NOTICE_TEXT.retry[lang])
      const before = p.all('strip').length
      await p.press(retry)
      assert.equal(old.closed, true, 'the old EventSource is still open')
      assert.equal(p.all('strip').length, before + 1, 'no new EventSource')
      assert.equal(p.live('strip').length, 1)
    })
  }
  t('HEALTH-ST-02', 'strip recovery', 'strip stale → a fresh valid frame: no stale mark, no notice, the state word, lines and control back', async (c) => {
    const p = await dockPage(c, sdk)
    const frame = await stripFrame('en')
    await p.deliver('strip', frame)
    await p.fail('strip', false)
    assert.equal(p.root('strip')?.props[HEALTH_HOOK.stripStale], HEALTH.stale, 'precondition')
    await p.deliver('strip', frame)
    assert.ok([undefined, false].includes(p.root('strip')?.props[HEALTH_HOOK.stripStale]), show(p.root('strip')?.props))
    assert.deepEqual(noticeOf(p, p.within('strip')), [])
    assert.equal(p.root('strip')?.props[STRIP.stateHook], UI_CARD.table['needs-authorization'][0])
    assert.ok(p.byHook(STRIP.control, undefined, p.within('strip')).length === 1, 'the control did not come back')
  })
  t('HEALTH-ST-03', 'initial closed', 'no frame ever, error with CLOSED → the strip card is drawn with the closed notice and Reconnect', async (c) => {
    const p = await dockPage(c, sdk)
    await p.fail('strip', true)
    assert.ok(p.root('strip'), 'no strip card')
    assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.closed, p.within('strip')).length, 1)
    assert.equal(p.byHook(HEALTH_HOOK.retry, undefined, p.within('strip')).length, 1)
  })

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
  t('HEALTH-ST-06', 'Reconnect reopens every stream', 'strip, asks and pairing all closed → one Reconnect press reopens every one of them (old ones closed), each stale until its frame', async (c) => {
    const p = await dockPage(c, sdk)
    await p.deliver('strip', await stripFrame('en'))
    await p.deliver('asks', askFrame(askCards(1)))
    await p.deliver('pairing', await pairingFrame('en'))
    const old = ['strip', 'asks', 'pairing'].flatMap((k) => p.live(k))
    for (const k of ['strip', 'asks', 'pairing']) await p.fail(k, true)
    await p.press(p.byHook(HEALTH_HOOK.retry, undefined, p.within('asks'))[0])
    assert.ok(old.every((s) => s.closed), 'an old EventSource stayed open')
    for (const k of ['strip', 'asks', 'pairing']) assert.equal(p.live(k).length, 1, k + ' not reopened')
    assert.equal(p.root('strip')?.props[HEALTH_HOOK.stripStale], HEALTH.stale)
    assert.equal(p.root('pairing')?.props[HEALTH_HOOK.pairingStale], HEALTH.stale)
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
