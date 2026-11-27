/**
 * MULTI-3 black-box rows: the per-target frame `targetsView`, the sidebar target list that replaces
 * DSH's workspace browser on Fishball's page, the ask card's source / handle / voided state, and the
 * absence of the withdrawn chat-top card and pairing dock card. Requirements A–E and the lead's
 * follow-up (2026-11-18); ../support/b-targets.mjs names every source. README.md beside this file
 * lists every row with its technique.
 *
 * Levels: unit (the pure frame, bound to the current DSH), component (fishball-ui's real client alone
 * in the scripted DSH page, ../support/b-sidebar.mjs `sidebarPage`, frames from the real `targetsView`;
 * what core would serve is scripted: the page connection's frames and the target routes' answers).
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { ASK as ASK_CARD, askCard, askFrame } from '../support/ask-card.mjs'
import { HEALTH_HOOK } from '../support/page-stream.mjs'
import { CHOICE, STATE as PAIR_STATE, coreView } from '../support/pairing.mjs'
import { isRow, sidebarPage } from '../support/b-sidebar.mjs'
import { ANSWERS, ASK_SOURCE, DOCK_GONE, FIXTURE, FRAME, KNOWN_LINE, SEAM_STATUS, SEAM_TARGETS, SIDEBAR, answerOf, plain, snapshotOf, targetView, viewModule } from '../support/b-targets.mjs'
import { browserZone } from '../support/page-stream.mjs'

const [EN, ZH] = FRAME.langs
const show = (v) => JSON.stringify(v)
const ST = SEAM_TARGETS.state
const STATES = Object.freeze(Object.values(ST))
const zone = FIXTURE.zones[0]
const lineOf = (view, kind) => view.lines.filter((l) => l.kind === kind)
const LEGACY_GUARD = Object.freeze({
  report: Object.freeze({ status: 'guards-overridden', overridden: Object.freeze(['manager-tools']) }),
  hook: 'data-fishball-targets-notice',
})
const enabled = (n) => n.props.disabled !== true && n.props['aria-disabled'] !== true && n.props['aria-disabled'] !== 'true'
/** One target's frame from the real view, in `lang`. */
const oneFrame = async (overrides, lang = EN) => (await viewModule()).targetsView(snapshotOf([targetView(0, overrides)]), lang, zone)

export function registerTargetsCases() {
  const t = (id, row, title, fn) => caseTest(id, row, title, fn)

  // ====================================================================== targetsView: the frame (unit)
  t('TGT-VIEW-EP-01', 'shape', `the frame has exactly ${FRAME.keys.join(', ')}; each target exactly ${FRAME.targetKeys.join(', ')}`, async () => {
    const { targetsView } = await viewModule()
    const v = plain(targetsView(snapshotOf([targetView(0), targetView(1)]), EN, zone))
    assert.deepEqual(Object.keys(v).sort(), [...FRAME.keys].sort())
    assert.equal(v.on, true)
    assert.equal(v.brandStyle, 'fishball', 'an absent brand reads the default')
    assert.ok(Array.isArray(v.notices) && Array.isArray(v.targets))
    assert.equal(v.targets.length, 2)
    for (const target of v.targets) assert.deepEqual(Object.keys(target).sort(), [...FRAME.targetKeys].sort())
  })
  t('TGT-VIEW-EP-01', 'order and identity', 'targets keep the snapshot order; targetId, kind and url are the TargetView\'s', async () => {
    const { targetsView } = await viewModule()
    const list = [targetView(0), targetView(1, { kind: SEAM_TARGETS.kind.parent }), targetView(2)]
    const v = targetsView(snapshotOf(list), EN, zone)
    assert.deepEqual(v.targets.map((x) => [x.targetId, x.kind, x.url]), list.map((x) => [x.targetId, x.kind, x.url]))
  })
  // LOGO-BUTTON: the same frame carries the normalized logo theme; absent/unknown reads fishball.
  for (const [label, brand, expected] of [
    ['absent', undefined, 'fishball'],
    ['fishball', { style: 'fishball' }, 'fishball'],
    ['deepseek', { style: 'deepseek' }, 'deepseek'],
    ['unknown', { style: 'orca' }, 'fishball'],
    ['another case', { style: 'DeepSeek' }, 'fishball'],
  ]) {
    t('TGT-VIEW-EP-03', label, `brandStyle ${label} → ${expected}`, async () => {
      const { targetsView } = await viewModule()
      const v = plain(targetsView(snapshotOf([targetView(0)], { brand }), EN, zone))
      assert.equal(v.brandStyle, expected)
    })
  }
  t('TGT-VIEW-EP-03', 'off', 'core off with a stored deepseek theme → brandStyle fishball (off reads the default)', async () => {
    const { targetsView } = await viewModule()
    const v = plain(targetsView(snapshotOf([targetView(0)], { fishball: SEAM_STATUS.fishball.off, brand: { style: 'deepseek' } }), EN, zone))
    assert.equal(v.brandStyle, 'fishball')
  })
  // Requirement B + follow-up (1): no service (core absent) is exactly {fishball: 'fishball-off'}; fishball off.
  for (const [label, snapshot] of [['core absent', { fishball: SEAM_STATUS.fishball.off }], ['fishball off with targets', snapshotOf([targetView(0)], { fishball: SEAM_STATUS.fishball.off })], ['undefined snapshot', undefined]]) {
    for (const lang of FRAME.langs) {
      t('TGT-VIEW-DT-01', `${label} ${lang}`, `(${lang}) ${label} → on false, notices [{kind: fishball-off}], targets [], empty null`, async () => {
        const { targetsView } = await viewModule()
        const v = plain(targetsView(snapshot, lang, zone))
        assert.equal(v.on, false)
        assert.deepEqual(v.notices.map((n) => n.kind), [FRAME.notice.off])
        assert.deepEqual(v.targets, [])
        assert.equal(v.empty, null)
        assert.equal(v.brandStyle, 'fishball', 'off/absent reads the default')
      })
    }
  }
  // Decision table: set → notices (fishball on).
  const setIncomplete = { status: SEAM_STATUS.set.incomplete, missing: [{ name: 'fbtest-member', reason: SEAM_STATUS.reason.failed, code: null }] }
  for (const [label, set, kinds] of [
    ['ok', { status: SEAM_STATUS.set.ok, missing: [] }, []],
    ['incomplete', setIncomplete, [FRAME.notice.set]],
  ]) {
    t('TGT-VIEW-DT-02', label, `set ${label} → notice kinds ${show(kinds)}, each with a non-empty text`, async () => {
      const { targetsView } = await viewModule()
      const v = plain(targetsView(snapshotOf([targetView(0)], { set }), EN, zone))
      assert.deepEqual(v.notices.map((n) => n.kind).sort(), [...kinds].sort())
      for (const n of v.notices) assert.ok(Object.values(n).some((x) => typeof x === 'string' && x.length > 0 && x !== n.kind), show(n))
    })
  }
  // BVA on the list length: 0 (empty text) / 1 / many (no cap, Q12).
  for (const lang of FRAME.langs) {
    t('TGT-VIEW-BVA-01', `0 targets ${lang}`, `(${lang}) fishball on, zero targets → empty is a non-empty text${lang === EN ? ` starting "${FRAME.emptyStart.en}"` : ' (not the en one)'}; targets []`, async () => {
      const { targetsView } = await viewModule()
      const v = targetsView(snapshotOf([]), lang, zone)
      assert.equal(typeof v.empty, 'string')
      if (lang === EN) assert.ok(v.empty.startsWith(FRAME.emptyStart.en), show(v.empty))
      else assert.notEqual(v.empty, targetsView(snapshotOf([]), EN, zone).empty)
      assert.deepEqual(plain(v.targets), [])
    })
  }
  for (const n of [1, FIXTURE.many]) {
    t('TGT-VIEW-BVA-01', `${n} targets`, `${n} target(s) → ${n} views, empty null (no cap)`, async () => {
      const { targetsView } = await viewModule()
      const v = targetsView(snapshotOf(Array.from({ length: n }, (_x, i) => targetView(i))), EN, zone)
      assert.equal(v.targets.length, n)
      assert.equal(v.empty, null)
    })
  }
  // EP over state: the four words, and any other word → failed (never success).
  for (const state of [...STATES, FIXTURE.unknownState, '', null, undefined]) {
    const expected = STATES.includes(state) ? state : ST.failed
    t('TGT-VIEW-EP-02', `state ${show(state) ?? 'undefined'}`, `TargetView.state ${show(state) ?? 'undefined'} → state ${expected}; the badge is a non-empty word${STATES.includes(state) ? '' : ', the failed badge'}`, async () => {
      const v = (await oneFrame({ state })).targets[0]
      assert.equal(v.state, expected)
      assert.ok(typeof v.badge === 'string' && v.badge.length > 0)
      if (!STATES.includes(state)) assert.equal(v.badge, (await oneFrame({ state: ST.failed })).targets[0].badge)
    })
  }
  for (const lang of FRAME.langs) {
    t('TGT-VIEW-EP-02', `badges ${lang}`, `(${lang}) the four states have four different badges; en and zh differ`, async () => {
      const badges = await Promise.all(STATES.map(async (state) => (await oneFrame({ state }, lang)).targets[0].badge))
      assert.equal(new Set(badges).size, STATES.length, show(badges))
      const other = await Promise.all(STATES.map(async (state) => (await oneFrame({ state }, lang === EN ? ZH : EN)).targets[0].badge))
      assert.ok(badges.every((b, i) => b !== other[i]), show([badges, other]))
    })
  }
  // Decision table Q01 (review amendment (a)): name × url → name, placeholder, whatever the state.
  for (const lang of FRAME.langs) {
    for (const state of STATES) {
      for (const [label, url, key] of [['url set', FIXTURE.url(0), 'unnamed'], ['url empty', '', 'unset'], ['url absent', undefined, 'unset']]) {
        t('TGT-VIEW-DT-03', `${state} name null ${label} ${lang}`, `(${lang}) ${state}, name null, ${label} → name null, placeholder ${show(FRAME.placeholder[key][lang])}; nothing URL-derived`, async () => {
          const view = targetView(0, { state, name: null, serverName: null, url })
          if (url === undefined) delete view.url
          const v = (await (await viewModule()).targetsView(snapshotOf([view]), lang, zone)).targets[0]
          assert.equal(v.name, null)
          assert.equal(v.placeholder, FRAME.placeholder[key][lang])
          assert.ok(!String(v.placeholder).includes(new URL(FIXTURE.url(0)).hostname), 'a URL-derived placeholder')
        })
      }
    }
    for (const [label, name] of Object.entries(FIXTURE.names).filter(([k]) => k !== 'empty')) {
      t('TGT-VIEW-DT-03', `name ${label} ${lang}`, `(${lang}) name ${label} → name is the TargetView's name verbatim (${name.length} chars)`, async () => {
        const v = (await oneFrame({ name, serverName: name }, lang)).targets[0]
        assert.equal(v.name, name)
      })
    }
  }
  t('TGT-VIEW-DT-03', 'name empty string', 'name "" (not null): the frame does not invent a URL-derived name', async () => {
    const v = (await oneFrame({ name: '', serverName: '' })).targets[0]
    assert.ok(![v.name, v.placeholder].some((x) => String(x ?? '').includes(new URL(FIXTURE.url(0)).hostname)), show(v))
  })
  // Lines: order, why (known / unknown / code), url, tools BVA (null / 0 / 1 / n), identity (4).
  t('TGT-VIEW-EP-03', 'line order', `lines are why, contributed-tools, identity in that order (no url line)`, async () => {
    const v = (await oneFrame({})).targets[0]
    assert.deepEqual(v.lines.map((l) => l.kind), [...FRAME.lineOrder])
    for (const l of v.lines) assert.ok(typeof l.text === 'string' && l.text.length > 0, show(l))
  })
  t('TGT-VIEW-EP-03', 'url field', 'url is the TargetView\'s URL; no line carries the URL', async () => {
    const v = (await oneFrame({})).targets[0]
    assert.equal(v.url, FIXTURE.url(0))
    assert.deepEqual(v.lines.filter((l) => l.kind === 'url' || l.text.includes(FIXTURE.url(0))), [])
  })
  for (const lang of FRAME.langs) {
    for (const kind of KNOWN_LINE) {
      t('TGT-VIEW-EP-04', `why ${kind} ${lang}`, `(${lang}) why line kind ${kind} (known) → translated: not the raw word, en ≠ zh`, async () => {
        const v = (await oneFrame({ line: { kind, code: null } }, lang)).targets[0]
        const other = (await oneFrame({ line: { kind, code: null } }, lang === EN ? ZH : EN)).targets[0]
        const [why] = lineOf(v, 'why')
        assert.ok(why && why.text.length > 0, show(v.lines))
        assert.notEqual(why.text.trim(), kind)
        assert.notEqual(why.text, lineOf(other, 'why')[0]?.text)
      })
    }
  }
  t('TGT-VIEW-EP-04', 'why unknown', `why line kind ${FIXTURE.unknownLine} (unknown) → shown verbatim`, async () => {
    const v = (await oneFrame({ line: { kind: FIXTURE.unknownLine, code: null } })).targets[0]
    assert.ok(lineOf(v, 'why')[0]?.text.includes(FIXTURE.unknownLine), show(v.lines))
  })
  for (const kind of [SEAM_STATUS.link.unreachable, FIXTURE.unknownLine]) {
    t('TGT-VIEW-EP-04', `why code ${kind}`, `why line ${kind} with code ${FIXTURE.code} → the code is appended`, async () => {
      const v = (await oneFrame({ state: ST.failed, line: { kind, code: FIXTURE.code } })).targets[0]
      assert.ok(lineOf(v, 'why')[0]?.text.includes(FIXTURE.code), show(v.lines))
    })
  }
  for (const [label, count] of [['null', null], ['0', 0], ['1', 1], ['7', 7]]) {
    t('TGT-VIEW-BVA-02', `tools ${label}`, `contributedTools ${label} → ${count === null ? 'no contributed-tools line' : 'one contributed-tools line showing ' + count}`, async () => {
      const v = (await oneFrame({ contributedTools: count })).targets[0]
      const lines = lineOf(v, 'contributed-tools')
      if (count === null) { assert.deepEqual(lines, []); return }
      assert.equal(lines.length, 1, show(v.lines))
      assert.ok(lines[0].text.includes(String(count)), show(lines[0]))
    })
  }
  t('TGT-VIEW-BVA-02', 'tools 1 vs 7 en', 'en: 1 and 7 tools read differently beside the number (singular / plural)', async () => {
    const one = lineOf((await oneFrame({ contributedTools: 1 })).targets[0], 'contributed-tools')[0].text.replace('1', '#')
    const many = lineOf((await oneFrame({ contributedTools: 7 })).targets[0], 'contributed-tools')[0].text.replace('7', '#')
    assert.notEqual(one, many)
  })
  for (const lang of FRAME.langs) {
    t('TGT-VIEW-EP-05', `identity ${lang}`, `(${lang}) identity pending / live / unsupported / stale → one identity line each, four different texts`, async () => {
      const texts = await Promise.all(Object.values(SEAM_TARGETS.identity).map(async (identity) => lineOf((await oneFrame({ identity }, lang)).targets[0], 'identity')))
      assert.ok(texts.every((l) => l.length === 1), show(texts))
      assert.equal(new Set(texts.map((l) => l[0].text)).size, texts.length, show(texts))
    })
  }
  // Decision table: control × state → control {action, label} | null; retry only when failed.
  for (const lang of FRAME.langs) {
    for (const [control, state] of [['connect', ST.notSet], ['cancel', ST.connecting], [null, ST.connected], ['connect', ST.failed]]) {
      t('TGT-VIEW-DT-04', `control ${control} ${state} ${lang}`, `(${lang}) control ${control} in ${state} → ${control ? `{action: ${control}, label ${show(FRAME.control[control][lang])}}` : 'null'}; retry ${state === ST.failed ? 'a label' : 'none'}`, async () => {
        const v = (await oneFrame({ control, state }, lang)).targets[0]
        if (control === null) assert.equal(v.control, null)
        else assert.deepEqual(plain(v.control), { action: control, label: FRAME.control[control][lang] })
        if (state === ST.failed) assert.ok(typeof v.retry === 'string' && v.retry.length > 0, show(v.retry))
        else assert.ok(v.retry === null || v.retry === undefined, show(v.retry))
      })
    }
  }
  for (const state of [ST.connected, ST.connecting, ST.notSet]) {
    t('TGT-VIEW-DT-04', `no retry ${state}`, `state ${state} → no retry`, async () => {
      assert.ok([null, undefined].includes((await oneFrame({ state })).targets[0].retry))
    })
  }
  for (const pair of [PAIR_STATE.paired, PAIR_STATE.warnMatch, PAIR_STATE.warnMismatch, PAIR_STATE.needToken]) {
    for (const lang of FRAME.langs) {
      t('TGT-VIEW-EP-06', `pairing ${pair} ${lang}`, `(${lang}) pairing ${pair} → exactly pairingView(target.pairing, ${lang}, tz)`, async () => {
        const { targetsView, pairingView } = await viewModule()
        const view = coreView(pair)
        const v = targetsView(snapshotOf([targetView(0, { pairing: view })]), lang, zone)
        assert.deepEqual(plain(v.targets[0].pairing), plain(pairingView(view, lang, zone)))
      })
    }
  }
  t('TGT-VIEW-EP-07', 'title and words en/zh', 'title and words are non-empty and differ between en and zh', async () => {
    const { targetsView } = await viewModule()
    const [en, zh] = FRAME.langs.map((lang) => plain(targetsView(snapshotOf([targetView(0)]), lang, zone)))
    assert.ok(en.title && zh.title && en.title !== zh.title)
    assert.notDeepEqual(en.words, zh.words)
  })

  // ====================================================================== the sidebar (component)
  t('TGT-SB-EP-01', 'priority', `fishball-ui registers ${SIDEBAR.slot} at a priority below fishball-page's Empty (${SIDEBAR.emptyShadowPriority}) and DSH's (${SIDEBAR.dshPriority})`, async (c) => {
    const p = await sidebarPage(c)
    const entries = p.entries()
    assert.ok(entries.length >= 1, `no ${SIDEBAR.slot} entry`)
    const priorities = entries.map((e) => e.options.priority)
    assert.ok(priorities.some((x) => Number.isFinite(x) && x < SIDEBAR.emptyShadowPriority), show(priorities))
    assert.deepEqual(p.world.errors, []); assert.deepEqual(p.world.failedFibers, [])
  })
  t('TGT-SB-ST-01', 'not the Fishball page', `without <html ${SIDEBAR.pageMark}> the sidebar shows no target list (DSH's own browser stays)`, async (c) => {
    const p = await sidebarPage(c, { mark: false })
    if (p.streams().length > 0) await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0)]), EN, zone))
    assert.deepEqual(p.rows().map((r) => p.textOf(r)), [])
  })
  t('TGT-SB-ST-01', 'mark set later', `<html ${SIDEBAR.pageMark}> set after load → the target list appears; removed → it goes`, async (c) => {
    const p = await sidebarPage(c, { mark: false })
    await p.setMark(true)
    await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0)]), EN, zone))
    assert.equal(p.rows().length, 1, 'no target row after the mark was set')
    await p.setMark(false)
    assert.deepEqual(p.rows().map((r) => p.textOf(r)), [], 'a target row outside the Fishball page')
  })
  // Re-baselined (the image-loop fix, 2026-11-22): the sidebar's frames arrive on the page's one
  // connection, so the one source the page opens is /api/fishball/page/events?lang&tz (it was
  // /api/fishball/strip?lang&tz).
  for (const lang of FRAME.langs) {
    t('TGT-SB-EP-02', `stream url ${lang}`, `(${lang}) the sidebar opens one source, ${SIDEBAR.streamPath}?lang=${lang}&tz=<the browser zone>`, async (c) => {
      const p = await sidebarPage(c, { lang })
      const open = p.sources.opened.filter((x) => !x.closed)
      assert.deepEqual(open.map((x) => new URL(x.url, p.world.base).pathname), [SIDEBAR.streamPath], show(open.map((x) => x.url)))
      const [s] = p.streams()
      const url = new URL(s.url, p.world.base)
      assert.equal(url.searchParams.get('lang'), lang)
      assert.equal(url.searchParams.get('tz'), browserZone())
    })
  }
  for (const n of [1, 3, FIXTURE.many]) {
    t('TGT-SB-BVA-01', `${n} rows`, `${n} target(s) → ${n} row buttons with aria-expanded=false, each showing its name and badge; no URL in a closed row`, async (c) => {
      const p = await sidebarPage(c)
      const list = Array.from({ length: n }, (_x, i) => targetView(i, { state: STATES[i % STATES.length] }))
      const frame = (await viewModule()).targetsView(snapshotOf(list), EN, zone)
      await p.deliver(frame)
      assert.equal(p.rows().length, n)
      for (const [i, v] of frame.targets.entries()) {
        const row = p.row(v.name)
        assert.equal(String(row.props['aria-expanded']), 'false')
        const own = p.item(v.name)
        assert.ok(p.text(own).includes(v.badge) || p.textOf(row).includes(v.badge), `row ${i}: no badge ${v.badge}`)
        assert.ok(!p.strings(own).some((s) => s.includes(list[i].url)), `row ${i} shows its URL while closed`)
      }
    })
  }
  for (const lang of FRAME.langs) {
    t('TGT-SB-EP-03', `placeholders ${lang}`, `(${lang}) name null: a row with no URL shows ${show(FRAME.placeholder.unset[lang])}, a row with a URL ${show(FRAME.placeholder.unnamed[lang])}`, async (c) => {
      const p = await sidebarPage(c, { lang })
      await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0, { name: null, serverName: null, state: ST.notSet, url: '' }), targetView(1, { name: null, serverName: null, state: ST.failed })]), lang, zone))
      p.row(FRAME.placeholder.unset[lang])
      p.row(FRAME.placeholder.unnamed[lang])
    })
  }
  for (const [label, name] of [['markup', FIXTURE.names.markup], ['unicode', FIXTURE.names.unicode], ['long', FIXTURE.names.long]]) {
    t('TGT-SB-EP-04', `name ${label}`, `a ${label} name is drawn as plain text, verbatim; no element from it`, async (c) => {
      const p = await sidebarPage(c)
      await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0, { name, serverName: name })]), EN, zone))
      assert.ok(p.sidebarNodes().some((n) => (n.children ?? []).some((ch) => typeof ch === 'string' && ch.includes(name))), 'the name is not one text node')
      assert.deepEqual(p.sidebarNodes().filter((n) => n.tag === 'b').map((n) => p.textOf(n)), [], 'a <b> element from the name')
      assert.ok(!p.sidebarNodes().some((n) => n.props.dangerouslySetInnerHTML !== undefined), 'dangerouslySetInnerHTML')
    })
  }
  t('TGT-SB-EP-05', 'empty', `zero targets → the empty text and a Fishball settings button [${SIDEBAR.settingsHook}] that opens core's settings`, async (c) => {
    const p = await sidebarPage(c)
    const frame = (await viewModule()).targetsView(snapshotOf([]), EN, zone)
    await p.deliver(frame)
    assert.ok(p.text(p.sidebarNodes()).includes(frame.empty), 'no empty text')
    const [button] = p.byHook(SIDEBAR.settingsHook, p.sidebarNodes())
    assert.ok(button, 'no settings button')
    await p.press(button)
    assert.deepEqual(p.world.openBundle, [SIDEBAR.coreBundle])
  })
  t('TGT-SB-EP-05', 'off', 'fishball off → no target rows, the off notice shown', async (c) => {
    const p = await sidebarPage(c)
    const frame = (await viewModule()).targetsView({ fishball: SEAM_STATUS.fishball.off }, EN, zone)
    await p.deliver(frame)
    assert.deepEqual(p.rows().map((r) => p.textOf(r)), [])
    const notice = frame.notices[0]
    assert.ok(Object.values(notice).filter((x) => typeof x === 'string' && x !== notice.kind).some((x) => p.text(p.sidebarNodes()).includes(x)), 'the off notice is not shown')
  })
  t('GUARD-SILENT', 'sidebar', 'ignoring a legacy manager-tools guard field leaves the Fishball sidebar running without a guard notice', async (c) => {
    const p = await sidebarPage(c)
    const { targetsView } = await viewModule()
    const targets = [targetView(0)]
    await p.deliver(targetsView(snapshotOf(targets), EN, zone))
    const before = p.text(p.sidebarNodes())
    assert.ok(p.row(targets[0].name), 'the default sidebar did not render')

    const { report, hook } = LEGACY_GUARD
    await p.deliver(targetsView({ ...snapshotOf(targets), guards: report }, EN, zone))
    assert.ok(p.row(targets[0].name), 'the overridden sidebar did not render')
    assert.deepEqual(p.byHook(hook, p.sidebarNodes()).map((node) => p.textOf(node)), [], 'the guard override rendered a notice')
    assert.equal(p.text(p.sidebarNodes()), before, 'the guard override changed the visible sidebar text')
  })
  // State transition: closed → open → closed; inline, not modal; others stay; no request.
  t('TGT-SB-ST-02', 'expand/collapse', `row A: aria-expanded false → press → true with why, Address and the URL in [${SIDEBAR.urlHook}], tools and identity inline → press → false, the URL gone`, async (c) => {
    const p = await sidebarPage(c)
    const frame = (await viewModule()).targetsView(snapshotOf([targetView(0, { contributedTools: 0 }), targetView(1)]), EN, zone)
    await p.deliver(frame)
    const [a] = frame.targets
    await p.toggle(a.name)
    assert.equal(String(p.row(a.name).props['aria-expanded']), 'true')
    const shown = p.text(p.item(a.name))
    for (const line of a.lines) assert.ok(shown.includes(line.text) || p.strings(p.item(a.name)).some((s) => s.includes(line.text)), `details lack ${line.kind}: ${line.text}`)
    assert.ok(shown.includes(frame.words.address), 'no Address label')
    const urls = p.byHook(SIDEBAR.urlHook, p.item(a.name))
    assert.equal(urls.length, 1, `[${SIDEBAR.urlHook}] elements: ${urls.length}`)
    assert.equal(p.textOf(urls[0]).trim(), a.url)
    await p.toggle(a.name)
    assert.equal(String(p.row(a.name).props['aria-expanded']), 'false')
    assert.ok(!p.strings(p.item(a.name)).some((s) => s.includes(a.url)), 'the URL stayed after collapsing')
  })
  t('TGT-SB-ST-02', 'inline, others stay', 'an open row: no dialog role anywhere, no overlay entry; every other row still drawn', async (c) => {
    const p = await sidebarPage(c)
    const overlays = p.world.entries(SIDEBAR.overlaySlot).length
    const frame = (await viewModule()).targetsView(snapshotOf([targetView(0), targetView(1), targetView(2)]), EN, zone)
    await p.deliver(frame)
    await p.toggle(frame.targets[1].name)
    assert.deepEqual(p.nodes().filter((n) => SIDEBAR.dialogRoles.includes(n.props.role) || n.props['aria-modal'] !== undefined).map((n) => n.tag), [])
    assert.equal(p.world.entries(SIDEBAR.overlaySlot).length, overlays, 'an overlay was registered')
    assert.equal(p.rows().length, 3)
  })
  t('TGT-SB-ST-03', 'select sends nothing', 'opening and closing rows sends no request and writes no setting (Q09)', async (c) => {
    const p = await sidebarPage(c)
    const frame = (await viewModule()).targetsView(snapshotOf([targetView(0), targetView(1)]), EN, zone)
    await p.deliver(frame)
    const fetches = p.world.fetches.length
    for (const v of frame.targets) { await p.toggle(v.name); await p.toggle(v.name) }
    await p.toggle(frame.targets[0].name)
    assert.equal(p.world.fetches.length, fetches, show(p.world.fetches.slice(fetches)))
    assert.deepEqual(p.world.mutations, [])
    assert.deepEqual(p.world.credentialSets, [])
  })
  t('TGT-SB-ST-03', 'selection survives a frame', 'an open row stays open when a new frame for the same target arrives', async (c) => {
    const p = await sidebarPage(c)
    const { targetsView } = await viewModule()
    await p.deliver(targetsView(snapshotOf([targetView(0), targetView(1)]), EN, zone))
    await p.toggle(targetView(0).name)
    await p.deliver(targetsView(snapshotOf([targetView(0, { contributedTools: 9 }), targetView(1)]), EN, zone))
    assert.equal(String(p.row(targetView(0).name).props['aria-expanded']), 'true')
  })
  // Actions post {targetId} to the per-target routes only.
  for (const lang of FRAME.langs) {
    for (const [action, state] of [['connect', ST.notSet], ['cancel', ST.connecting]]) {
      t('TGT-SB-DT-01', `${action} ${lang}`, `(${lang}) ${action} in the details → POST ${SIDEBAR.routePath[action]} {targetId}; never the withdrawn K3a routes`, async (c) => {
        const p = await sidebarPage(c, { lang })
        const v = targetView(1, { control: action, state })
        await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0), v]), lang, zone))
        await p.toggle(v.name)
        const [button] = p.control(p.item(v.name), FRAME.control[action][lang])
        assert.ok(button, `no ${action} button in the details`)
        await p.press(button)
        const posts = p.posts.filter((x) => x.method === SEAM_TARGETS.route.method)
        assert.deepEqual(posts.map((x) => [x.path, x.json]), [[SIDEBAR.routePath[action], { [SEAM_TARGETS.route.targetIdField]: v.targetId }]])
        assert.ok(!p.world.fetches.some((f) => SIDEBAR.withdrawn.includes(new URL(f.url).pathname)), 'a withdrawn route was called')
      })
    }
  }
  t('TGT-SB-DT-01', 'retry failed', `a failed target's Retry → POST ${SIDEBAR.routePath.retry} {targetId}`, async (c) => {
    const p = await sidebarPage(c)
    const v = targetView(0, { state: ST.failed, line: { kind: SEAM_STATUS.link.unreachable, code: null } })
    const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
    await p.deliver(frame)
    await p.toggle(v.name)
    const [retry] = p.control(p.item(v.name), frame.targets[0].retry)
    assert.ok(retry, 'no Retry in a failed target\'s details')
    await p.press(retry)
    assert.deepEqual(p.posts.map((x) => [x.path, x.json]), [[SIDEBAR.routePath.retry, { targetId: v.targetId }]])
  })
  t('TGT-SB-DT-01', 'no retry connected', 'a connected target with no control: no Retry, Connect or Cancel in its details', async (c) => {
    const p = await sidebarPage(c)
    const v = targetView(0)
    await p.deliver((await viewModule()).targetsView(snapshotOf([v]), EN, zone))
    await p.toggle(v.name)
    const labels = [FRAME.control.connect.en, FRAME.control.cancel.en, FRAME.retryWord]
    assert.deepEqual(p.item(v.name).filter((n) => n.tag === 'button' && labels.includes(p.textOf(n).trim())).map((n) => p.textOf(n)), [])
  })
  for (const lang of FRAME.langs) {
    t('TGT-SB-ST-04', `approval ${lang}`, `(${lang}) Connect answers {outcome: approval-url, url} → window.open(url) in a new tab and a link ${show(SIDEBAR.approvalLabel[lang])} to it`, async (c) => {
      const p = await sidebarPage(c, { lang, answer: () => ({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.approvalOutcome, url: FIXTURE.approvalUrl } }) })
      const v = targetView(0, { control: 'connect', state: ST.notSet })
      await p.deliver((await viewModule()).targetsView(snapshotOf([v]), lang, zone))
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), FRAME.control.connect[lang])[0])
      assert.ok(p.world.opened.some((args) => args[0] === FIXTURE.approvalUrl && args[1] === SIDEBAR.newTab), show(p.world.opened))
      // The attempt is then pending: core's next frame has the target connecting with Cancel (UIPF-STRIP-ST-01's flow).
      await p.deliver((await viewModule()).targetsView(snapshotOf([{ ...v, state: ST.connecting, control: 'cancel', line: { kind: SEAM_STATUS.connect.authorizing, code: null } }]), lang, zone))
      const links = p.sidebarNodes().filter((n) => n.tag === 'a' && n.props.href === FIXTURE.approvalUrl)
      assert.equal(links.length, 1, 'no approval link')
      assert.equal(p.textOf(links[0]).trim(), SIDEBAR.approvalLabel[lang])
    })
  }
  t('TGT-SB-ST-04', 'approval not http', 'Connect answers a javascript: URL → no link to it and nothing opened with it', async (c) => {
    const p = await sidebarPage(c, { answer: () => ({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.approvalOutcome, url: FIXTURE.unsafeApprovalUrl } }) })
    const v = targetView(0, { control: 'connect', state: ST.notSet })
    await p.deliver((await viewModule()).targetsView(snapshotOf([v]), EN, zone))
    await p.toggle(v.name)
    await p.press(p.control(p.item(v.name), FRAME.control.connect.en)[0])
    assert.deepEqual(p.sidebarNodes().filter((n) => n.tag === 'a' && String(n.props.href).startsWith(FIXTURE.unsafeScheme)).length, 0)
    assert.ok(!p.world.opened.some((args) => String(args[0]).startsWith(FIXTURE.unsafeScheme)), show(p.world.opened))
  })
  // Pairing inside the details.
  t('TGT-SB-ST-05', 'pairing warn-match', 'warn-match: lines and a confirmation box in the details; Continue disabled until ticked; pressed → POST pairing {targetId, choice: continue, confirmed: true}', async (c) => {
    const p = await sidebarPage(c)
    const v = targetView(0, { pairing: coreView(PAIR_STATE.warnMatch) })
    const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
    await p.deliver(frame)
    await p.toggle(v.name)
    const pairing = frame.targets[0].pairing
    for (const line of pairing.lines) assert.ok(p.text(p.item(v.name)).includes(line.text), 'pairing line missing')
    const label = pairing.choices.find((x) => x.choice === CHOICE.continue).label
    const cont = () => p.control(p.item(v.name), label)[0]
    assert.ok(cont(), 'no Continue')
    assert.equal(enabled(cont()), false, 'Continue enabled before the box is ticked')
    await p.tick(p.item(v.name))
    assert.equal(enabled(cont()), true, 'Continue still disabled after ticking')
    await p.press(cont())
    assert.deepEqual(p.posts.map((x) => [x.path, x.json]), [[SIDEBAR.routePath.pairing, { targetId: v.targetId, choice: CHOICE.continue, confirmed: true }]])
  })
  t('TGT-SB-ST-05', 'pairing other choice', 'warn-match: new-token-and-id unticked → POST pairing {targetId, choice: new-token-and-id, confirmed: false}', async (c) => {
    const p = await sidebarPage(c)
    const v = targetView(0, { pairing: coreView(PAIR_STATE.warnMatch) })
    const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
    await p.deliver(frame)
    await p.toggle(v.name)
    const label = frame.targets[0].pairing.choices.find((x) => x.choice === CHOICE.newTokenAndId).label
    await p.press(p.control(p.item(v.name), label)[0])
    assert.deepEqual(p.posts.map((x) => [x.path, x.json]), [[SIDEBAR.routePath.pairing, { targetId: v.targetId, choice: CHOICE.newTokenAndId, confirmed: false }]])
  })
  // Fishball settings link: openBundle, else the Plugins panel.
  for (const [label, navigation] of [['pluginNavigation', true], ['no pluginNavigation', false]]) {
    t('TGT-SB-EP-06', label, `the details' Fishball settings link → ${navigation ? `pluginNavigation.openBundle('${SIDEBAR.coreBundle}')` : `layout.selectPanel('${SIDEBAR.pluginsPanel}')`}`, async (c) => {
      const p = await sidebarPage(c, { navigation })
      const v = targetView(0)
      const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
      await p.deliver(frame)
      await p.toggle(v.name)
      const [link] = p.control(p.item(v.name), frame.words.settings)
      assert.ok(link, `no ${show(frame.words.settings)} control in the details`)
      await p.press(link)
      if (navigation) assert.deepEqual(p.world.openBundle, [SIDEBAR.coreBundle])
      else assert.deepEqual(p.world.selectPanel, [SIDEBAR.pluginsPanel])
    })
  }
  // Follow-up (2): refusals × answer → the refused alert.
  for (const [label, answer, refused, code] of ANSWERS) {
    t('TGT-SB-DT-02', `connect ${label}`, `Connect answered ${label} → ${refused ? `one role=alert [${SIDEBAR.refusedHook}] with a sentence${code ? ` and ${code}` : ''}` : 'no refused alert'}`, async (c) => {
      const p = await sidebarPage(c, { answer: () => answer })
      const v = targetView(0, { control: 'connect', state: ST.notSet })
      await p.deliver((await viewModule()).targetsView(snapshotOf([v]), EN, zone))
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), FRAME.control.connect.en)[0])
      const alerts = p.byHook(SIDEBAR.refusedHook, p.sidebarNodes())
      if (!refused) { assert.deepEqual(alerts.map((n) => p.textOf(n)), []); return }
      assert.equal(alerts.length, 1, `refused alerts: ${alerts.length}`)
      assert.equal(alerts[0].props.role, SIDEBAR.alertRole)
      const text = p.textOf(alerts[0]).trim()
      assert.ok(text.length > (code?.length ?? 0) + 10, `not a sentence: ${show(text)}`)
      if (code) assert.ok(text.includes(code), `the code ${code} is not appended: ${show(text)}`)
    })
  }
  t('TGT-SB-DT-02', 'statuses differ', 'the 400, 404, 409, 503 and network sentences are each different', async (c) => {
    const texts = []
    for (const [label, answer] of ANSWERS.filter(([l]) => ['400', '404', '409 no code', '503', 'network'].includes(l))) {
      const p = await sidebarPage(c, { answer: () => (answer === 'reject' ? 'reject' : { ...answer, json: answer.json && { ...answer.json, code: undefined } }) })
      const v = targetView(0, { control: 'connect', state: ST.notSet })
      await p.deliver((await viewModule()).targetsView(snapshotOf([v]), EN, zone))
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), FRAME.control.connect.en)[0])
      texts.push([label, p.byHook(SIDEBAR.refusedHook, p.sidebarNodes()).map((n) => p.textOf(n).trim()).join('|')])
    }
    assert.equal(new Set(texts.map(([, x]) => x)).size, texts.length, show(texts))
  })
  t('TGT-SB-DT-02', ZH, '(zh) a 409 refusal → a zh sentence, not the en one', async (c) => {
    const sentence = async (lang) => {
      const p = await sidebarPage(c, { lang, answer: () => answerOf('409')[1] })
      const v = targetView(0, { control: 'connect', state: ST.notSet })
      await p.deliver((await viewModule()).targetsView(snapshotOf([v]), lang, zone))
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), FRAME.control.connect[lang])[0])
      return p.byHook(SIDEBAR.refusedHook, p.sidebarNodes()).map((n) => p.textOf(n)).join('')
    }
    const [en, zh] = [await sentence(EN), await sentence(ZH)]
    assert.ok(zh.length > 0 && zh !== en, show([en, zh]))
  })
  t('TGT-SB-DT-02', 'refused then ok', 'a refused Retry then an ok Retry → the alert goes', async (c) => {
    let next = answerOf('409')[1]
    const p = await sidebarPage(c, { answer: () => next })
    const v = targetView(0, { state: ST.failed })
    const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
    await p.deliver(frame)
    await p.toggle(v.name)
    await p.press(p.control(p.item(v.name), frame.targets[0].retry)[0])
    assert.equal(p.byHook(SIDEBAR.refusedHook, p.sidebarNodes()).length, 1, 'precondition')
    next = ANSWERS[0][1]
    await p.press(p.control(p.item(v.name), frame.targets[0].retry)[0])
    assert.deepEqual(p.byHook(SIDEBAR.refusedHook, p.sidebarNodes()).map((n) => p.textOf(n)), [])
  })
  // Review amendment (d): Connect answering needs-configuration is a refusal with its sentence and code.
  for (const lang of FRAME.langs) {
    t('TGT-SB-DT-04', `needs-configuration ${lang}`, `(${lang}) Connect answers 200 {outcome: needs-configuration, code} → the refused alert reads ${show(SIDEBAR.needsConfiguration[lang])} with the code`, async (c) => {
      const p = await sidebarPage(c, { lang, answer: () => ({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.needsConfiguration.outcome, code: FIXTURE.code } }) })
      const v = targetView(0, { control: 'connect', state: ST.notSet })
      await p.deliver((await viewModule()).targetsView(snapshotOf([v]), lang, zone))
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), FRAME.control.connect[lang])[0])
      const alerts = p.byHook(SIDEBAR.refusedHook, p.sidebarNodes())
      assert.equal(alerts.length, 1)
      assert.ok(p.textOf(alerts[0]).includes(SIDEBAR.needsConfiguration[lang]), p.textOf(alerts[0]))
      assert.ok(p.textOf(alerts[0]).includes(FIXTURE.code), p.textOf(alerts[0]))
    })
  }
  // Review amendment (c): press state is per target and survives collapse / reopen and remount.
  const refusedOf = (p, name) => p.byHook(SIDEBAR.refusedHook, p.item(name)).map((n) => p.textOf(n).trim()).filter(Boolean)
  for (const [label, act] of [['collapse and reopen', async (p, name) => { await p.toggle(name); await p.toggle(name) }], ['remount', async (p, name) => { await p.remount(); if (String(p.row(name).props['aria-expanded']) !== 'true') await p.toggle(name) }]]) {
    t('TGT-SB-ST-07', `refusal survives ${label}`, `A's Connect refused (409) → ${label} → A's refused alert still shown; B shows none`, async (c) => {
      const p = await sidebarPage(c, { answer: () => answerOf('409')[1] })
      const a = targetView(0, { control: 'connect', state: ST.notSet })
      const b = targetView(1, { control: 'connect', state: ST.notSet })
      const frame = (await viewModule()).targetsView(snapshotOf([a, b]), EN, zone)
      await p.deliver(frame)
      await p.toggle(a.name)
      await p.press(p.control(p.item(a.name), FRAME.control.connect.en)[0])
      assert.equal(refusedOf(p, a.name).length, 1, 'precondition: A refused')
      await act(p, a.name)
      if (p.streams().length > 0 && label === 'remount') await p.deliver(frame)
      assert.equal(refusedOf(p, a.name).length, 1, `A's refusal was lost after ${label}`)
      if (String(p.row(b.name).props['aria-expanded']) !== 'true') await p.toggle(b.name)
      assert.deepEqual(refusedOf(p, b.name), [], 'B shows A\'s refusal')
    })
  }
  t('TGT-SB-ST-07', 'sending lock per target', 'A\'s Connect pending → A\'s Connect disabled; B\'s Connect enabled; A reopened still locked', async (c) => {
    let release
    const pending = new Promise((resolve) => { release = resolve })
    const p = await sidebarPage(c, { answer: async (call) => { if (JSON.parse(call.body).targetId === FIXTURE.ids[0]) await pending; return { status: SEAM_TARGETS.http.ok, json: { ok: true } } } })
    const a = targetView(0, { control: 'connect', state: ST.notSet })
    const b = targetView(1, { control: 'connect', state: ST.notSet })
    await p.deliver((await viewModule()).targetsView(snapshotOf([a, b]), EN, zone))
    // Rows may open one at a time (an accordion keeps every other row visible), so each is opened in turn.
    const open = async (name) => { if (String(p.row(name).props['aria-expanded']) !== 'true') await p.toggle(name) }
    await open(a.name)
    await p.press(p.control(p.item(a.name), FRAME.control.connect.en)[0])
    assert.equal(enabled(p.control(p.item(a.name), FRAME.control.connect.en)[0]), false, 'A\'s Connect not locked while sending')
    await open(b.name)
    assert.equal(enabled(p.control(p.item(b.name), FRAME.control.connect.en)[0]), true, 'B\'s Connect locked by A\'s press')
    await open(a.name)
    assert.equal(enabled(p.control(p.item(a.name), FRAME.control.connect.en)[0]), false, 'A\'s lock was lost by closing and reopening it')
    release()
    await p.settle()
  })
  t('TGT-SB-ST-07', 'latest press opens', 'two Connect presses on A, the first answering after the second → only the second\'s approval URL is opened', async (c) => {
    const gates = []
    const p = await sidebarPage(c, { answer: () => new Promise((resolve) => { gates.push(resolve) }) })
    const a = targetView(0, { control: 'connect', state: ST.notSet })
    await p.deliver((await viewModule()).targetsView(snapshotOf([a]), EN, zone))
    await p.toggle(a.name)
    const connect = () => p.control(p.item(a.name), FRAME.control.connect.en)[0]
    await p.press(connect())
    // The first press may lock the button; a second press is then made after the first settles only if allowed.
    if (enabled(connect())) {
      await p.press(connect())
      gates[1]?.({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.approvalOutcome, url: FIXTURE.approvalUrl + '-second' } })
      await p.settle()
      gates[0]({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.approvalOutcome, url: FIXTURE.approvalUrl + '-first' } })
      await p.settle()
      assert.deepEqual(p.world.opened.map((args) => args[0]), [FIXTURE.approvalUrl + '-second'])
    } else {
      gates[0]({ status: SEAM_TARGETS.http.ok, json: { outcome: SIDEBAR.approvalOutcome, url: FIXTURE.approvalUrl } })
      await p.settle()
      assert.deepEqual(p.world.opened.map((args) => args[0]), [FIXTURE.approvalUrl], 'the one press did not open its page once')
    }
  })
  // Follow-up (2): a pairing choice's refusal shows in the details as [data-fishball-pairing-failed].
  for (const [label, answer, refused, code] of ANSWERS.filter(([l]) => ['200 ok', '409', 'network'].includes(l))) {
    t('TGT-SB-DT-03', `pairing ${label}`, `a pairing choice answered ${label} → ${refused ? `a role=alert [${SIDEBAR.pairingFailedHook}] in the details${code ? ` with ${code}` : ''}` : 'no pairing alert'}`, async (c) => {
      const p = await sidebarPage(c, { answer: () => answer })
      const v = targetView(0, { pairing: coreView(PAIR_STATE.warnMismatch) })
      const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
      await p.deliver(frame)
      await p.toggle(v.name)
      await p.press(p.control(p.item(v.name), frame.targets[0].pairing.choices[0].label)[0])
      const alerts = p.byHook(SIDEBAR.pairingFailedHook, p.item(v.name)).filter((n) => p.textOf(n).trim() !== '')
      if (!refused) { assert.deepEqual(alerts.map((n) => p.textOf(n)), []); return }
      assert.equal(alerts.length, 1, show(alerts.map((n) => p.textOf(n))))
      assert.equal(alerts[0].props.role, SIDEBAR.alertRole)
      if (code) assert.ok(p.textOf(alerts[0]).includes(code), p.textOf(alerts[0]))
    })
  }
  // Stream health: stale / closed lock every control; one Reconnect reopens the sidebar and ask streams.
  for (const [health, closed] of [['stale', false], ['closed', true]]) {
    t('TGT-SB-ST-06', health, `stream ${health} → the list marked stale, every action control disabled, the pairing warning still readable${closed ? ', the shared Reconnect' : ''}`, async (c) => {
      const p = await sidebarPage(c)
      const v = targetView(0, { state: ST.failed, control: 'connect', pairing: coreView(PAIR_STATE.warnMatch) })
      const frame = (await viewModule()).targetsView(snapshotOf([v]), EN, zone)
      await p.deliver(frame)
      await p.toggle(v.name)
      const actions = () => p.item(v.name).filter((n) => (n.tag === 'button' || n.tag === 'input') && !isRow(n) && n.props[HEALTH_HOOK.retry] === undefined && p.textOf(n).trim() !== frame.words.settings)
      assert.ok(actions().some(enabled), 'precondition: an enabled action')
      await p.fail(closed)
      assert.ok(p.byHook(HEALTH_HOOK.notice, p.sidebarNodes()).length >= 1, 'no stream notice in the sidebar')
      assert.deepEqual(actions().filter(enabled).map((n) => n.tag + ':' + p.textOf(n)), [], 'an action stayed enabled')
      // Review amendment (e): the pairing warning stays readable, locked.
      for (const line of frame.targets[0].pairing.lines) assert.ok(p.text(p.item(v.name)).includes(line.text), 'the pairing warning was hidden while ' + health)
      assert.equal(p.byHook(HEALTH_HOOK.retry, p.sidebarNodes()).length, closed ? 1 : 0)
    })
  }
  t('TGT-SB-ST-06', 'Reconnect reopens', 'sidebar and asks streams closed → one Reconnect press reopens both (old ones closed)', async (c) => {
    const p = await sidebarPage(c, { dock: true })
    await p.deliver((await viewModule()).targetsView(snapshotOf([targetView(0)]), EN, zone))
    const old = p.sources.opened.filter((s) => !s.closed)
    for (const s of old) s.fail({ closed: true })
    await p.settle()
    const [retry] = p.byHook(HEALTH_HOOK.retry, p.sidebarNodes())
    assert.ok(retry, 'no Reconnect in the sidebar')
    await p.press(retry)
    assert.ok(old.every((s) => s.closed))
    assert.equal(p.streams().length, 1)
    assert.equal(p.askStreams().length, 1)
  })

  // ====================================================================== the dock (requirement D)
  t('TGT-DOCK-EP-01', 'no strip', `no ${ASK_SOURCE.slot} entry has id ${DOCK_GONE.stripId}; no dock draws a status card`, async (c) => {
    const p = await sidebarPage(c, { dock: true })
    assert.deepEqual(p.world.entries(ASK_SOURCE.slot).filter((e) => (e.options.id ?? e.options.key) === DOCK_GONE.stripId).map((e) => e.options), [])
  })
  t('TGT-DOCK-EP-01', 'no pairing card', `no dock entry draws [${DOCK_GONE.pairingHook}] or opens the pairing stream`, async (c) => {
    const p = await sidebarPage(c, { dock: true })
    // A pairing frame as every open view's frame (the sidebar's and the ask cards', both on the page connection).
    for (const s of [...p.streams(), ...p.askStreams()]) s.deliver({ state: PAIR_STATE.warnMatch, title: 'x', lines: [{ kind: 'warn-match', text: 'fbtest' }], confirm: 'x', choices: [], failed: 'x' })
    await p.settle()
    assert.deepEqual(p.byHook(DOCK_GONE.pairingHook).map((n) => n.tag), [])
    assert.deepEqual(p.sources.opened.filter((s) => new URL(s.url, p.world.base).pathname.endsWith('/' + DOCK_GONE.pairingStream)).map((s) => s.url), [])
  })

  // ====================================================================== the ask card (requirement E)
  const card = (overrides = {}) => {
    const base = askCard()
    return { ...base, handle: FIXTURE.handles[0], source: { targetId: FIXTURE.ids[0], endpointEpoch: FIXTURE.epoch, serverName: FIXTURE.names.plain, name: FIXTURE.names.plain }, ...overrides }
  }
  const askPage = async (c, cards, { lang = EN, answer } = {}) => {
    const p = await sidebarPage(c, { lang, dock: true })
    p.world.fetchOther = async (call) => { const at = new URL(call.url).pathname; p.posts.push({ ...call, path: at, json: JSON.parse(call.body ?? 'null') }); return answer ? answer(call) : { status: SEAM_TARGETS.http.ok, json: { ok: true } } }
    for (const s of p.askStreams()) s.deliver(askFrame(cards, FIXTURE.managerSession))
    await p.settle()
    const cardsDrawn = () => p.nodes().filter((n) => n.props[ASK_CARD.card] !== undefined && n.props[ASK_CARD.card] !== false)
    return { ...p, cardsDrawn, within: (handle) => { const root = cardsDrawn().find((n) => n.props[ASK_CARD.card] === handle); return root ? [root, ...p.nodes().filter((n) => isBelow(root, n))] : [] } }
  }
  const isBelow = (root, node) => (root.children ?? []).some((c) => c === node || (typeof c !== 'string' && isBelow(c, node)))
  for (const lang of FRAME.langs) {
    t('TGT-ASK-EP-01', `source ${lang}`, `(${lang}) the card shows the hidden prefix ${show(ASK_SOURCE.sourcePrefix[lang])} and card.source.name as text; ${ASK_CARD.card} = handle`, async (c) => {
      const p = await askPage(c, [card({ source: { ...card().source, name: FIXTURE.names.markup } })], { lang })
      const [root] = p.cardsDrawn()
      assert.ok(root, 'no card')
      assert.equal(root.props[ASK_CARD.card], FIXTURE.handles[0])
      const own = p.within(FIXTURE.handles[0])
      const holder = own.find((n) => (n.children ?? []).some((ch) => typeof ch === 'string' && ch.includes(FIXTURE.names.markup)))
      assert.ok(holder, 'the source name is not shown as text')
      assert.equal(own.filter((n) => n.tag === 'b').length, 0)
      assert.ok(p.text(own).includes(ASK_SOURCE.sourcePrefix[lang]), `no ${show(ASK_SOURCE.sourcePrefix[lang])} prefix`)
      assert.equal(holder.props['aria-label'], undefined, 'an aria-label on the source span')
    })
    t('TGT-ASK-EP-01', `source null ${lang}`, `(${lang}) source.name null → ${show(ASK_SOURCE.unnamed[lang])}`, async (c) => {
      const p = await askPage(c, [card({ source: { ...card().source, name: null, serverName: null } })], { lang })
      assert.ok(p.text(p.within(FIXTURE.handles[0])).includes(ASK_SOURCE.unnamed[lang]), p.text(p.within(FIXTURE.handles[0])))
    })
  }
  t('TGT-ASK-EP-02', 'post by handle', `Reject → POST ${ASK_SOURCE.answerPath} with exactly {handle, choice, text}; no approvalId`, async (c) => {
    const p = await askPage(c, [card()])
    const reject = p.within(FIXTURE.handles[0]).find((n) => n.tag === 'button' && String(n.props[ASK_CARD.choice]) === ASK_CARD.choices.reject)
    assert.ok(reject, 'no Reject')
    await p.press(reject)
    const posts = p.posts.filter((x) => x.path === ASK_SOURCE.answerPath)
    assert.equal(posts.length, 1, show(p.posts.map((x) => x.path)))
    assert.deepEqual(Object.keys(posts[0].json).sort(), [...ASK_SOURCE.bodyKeys].sort())
    assert.equal(posts[0].json.handle, FIXTURE.handles[0])
    assert.equal(posts[0].json.choice, ASK_CARD.choices.reject)
  })
  t('TGT-ASK-EP-03', 'equal approvalId', 'two cards with the same approvalId from two targets → two cards, each posting its own handle', async (c) => {
    const a = card({ approvalId: FIXTURE.approvalId })
    const b = card({ approvalId: FIXTURE.approvalId, handle: FIXTURE.handles[1], source: { ...card().source, targetId: FIXTURE.ids[1], name: FIXTURE.names.suffixed } })
    const p = await askPage(c, [a, b])
    assert.deepEqual(p.cardsDrawn().map((n) => n.props[ASK_CARD.card]).sort(), [...FIXTURE.handles].sort())
    // With two pending cards, disclose the chosen card before using its actions.
    await p.press(p.within(FIXTURE.handles[1]).find((n) => String(n.props[ASK_CARD.expanded]) === 'false'))
    const reject = p.within(FIXTURE.handles[1]).find((n) => n.tag === 'button' && String(n.props[ASK_CARD.choice]) === ASK_CARD.choices.reject)
    await p.press(reject)
    assert.deepEqual(p.posts.filter((x) => x.path === ASK_SOURCE.answerPath).map((x) => x.json.handle), [FIXTURE.handles[1]])
  })
  for (const lang of FRAME.langs) {
    // Finished cards (answered, closed, voided) are core's history and dismiss from the composer
    // dock: client.asks.js draws only open cards.
    t('TGT-ASK-ST-01', `voided ${lang}`, `(${lang}) a voided card dismisses from the composer dock (finished cards do not render)`, async (c) => {
      const v = card({ state: SEAM_TARGETS.ask.voided })
      const p = await askPage(c, [v], { lang })
      assert.equal(p.within(FIXTURE.handles[0]).length, 0, 'the voided card is still drawn')
    })
  }
  for (const [label, answer, refused, code] of ANSWERS.filter(([l]) => ['200 ok', '404', '409', 'network'].includes(l))) {
    t('TGT-ASK-DT-01', label, `an answer answered ${label} → ${refused ? `a role=alert in the card${code ? ` with ${code}` : ''}` : 'no alert'}`, async (c) => {
      const p = await askPage(c, [card()], { answer: () => (label === '409' ? { status: SEAM_TARGETS.http.conflict, json: { ok: false, code: ASK_SOURCE.expired } } : answer) })
      await p.press(p.within(FIXTURE.handles[0]).find((n) => n.tag === 'button' && String(n.props[ASK_CARD.choice]) === ASK_CARD.choices.reject))
      const alerts = p.within(FIXTURE.handles[0]).filter((n) => n.props.role === SIDEBAR.alertRole && p.textOf(n).trim() !== '')
      if (!refused) { assert.deepEqual(alerts.map((n) => p.textOf(n)), []); return }
      assert.equal(alerts.length, 1, show(alerts.map((n) => p.textOf(n))))
      const want = label === '409' ? ASK_SOURCE.expired : code
      if (want) assert.ok(p.textOf(alerts[0]).includes(want), p.textOf(alerts[0]))
    })
  }
}
