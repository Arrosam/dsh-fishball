/**
 * R-FIX-FUI F1 black-box rows: the pairing warning UI (R-ID-07, R-ID-10, R-NAME-03, R-NAME-08).
 * USE-CASES.md beside this file lists every row with its technique. Levels:
 * - unit: the pure view model `pairingView(view, lang, timeZone)` against the oracle written out from
 *   the specified copy (subject.mjs `expectedView`);
 * - integration: fishball-ui's real Node row in a real Cordis root of the SDK, its stream and choose
 *   routes, core's `fishballInstance` provided / replaced / removed by its own fibers;
 * - component: the drawn card (page.mjs) in the scripted DSH page, with the real `pairingView` frames.
 */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { settle } from '../../fishball-core/settings/page.mjs'
import { HEALTH, HEALTH_HOOK, NOTICE_TEXT } from '../stream/constants.mjs'
import { CHOICE, FIXTURE, HOOK, NAME_CODE, REFUSAL, ROUTE, STATE, VIEW } from './constants.mjs'
import { pairingPage } from './page.mjs'
import { WITHDRAWN } from '../model-dialog/targets-constants.mjs'
import { withdrawnRow } from '../model-dialog/withdrawn.mjs'
import { coreView, deepFrozen, expectedView, fakeInstance, lastSeenText, nameIssueOf, plain, rowWorld, viewModule, warningOf } from './subject.mjs'

const show = (v) => JSON.stringify(v)
/** The requirement's fields, plus the review's `needsConfirm` per choice (true only for continue in warn-match). */
const withConfirmFlags = (expected) => ({ ...expected, choices: expected.choices.map((c) => ({ ...c, needsConfirm: expected.state === STATE.warnMatch && c.choice === CHOICE.continue })) })
/** The view without `key` (compared separately: it only has to change with core's view). */
const bodyOf = (v) => { const { key, ...rest } = plain(v); return rest }

export function registerPairingCases(sdk) {
  const t = (id, row, title, fn) => caseTest(sdk, id, row, title, fn)
  const zone = FIXTURE.zones[0]

  // ======================================================================== view model (unit)
  // PAIR-DT-01: state × lang → lines, confirm, choices (decision table, one row per state × lang).
  const states = [
    ['warn-match', coreView(STATE.warnMatch)],
    ['warn-mismatch', coreView(STATE.warnMismatch)],
    ['need-token', coreView(STATE.needToken)],
    ['need-id', coreView(STATE.needId)],
    ['id-mismatch', coreView(STATE.idMismatch)],
    ['unpaired', coreView(STATE.unpaired)],
    ['paired', coreView(STATE.paired)],
  ]
  for (const lang of VIEW.langs) {
    for (const [label, view] of states) {
      t('PAIR-DT-01', `${label} ${lang}`, `(${lang}) ${label}: title, lines, confirm, choices and failed as the requirement's table`, async () => {
        const { pairingView, TEXT } = await viewModule(sdk)
        assert.deepEqual(bodyOf(pairingView(view, lang, zone)), withConfirmFlags(expectedView(TEXT, view, lang, zone)))
      })
    }
  }
  t('PAIR-EP-01', 'frozen', 'the result is deeply frozen and has exactly state, title, lines, confirm, choices, failed (and key)', async () => {
    const { pairingView } = await viewModule(sdk)
    for (const [, view] of states) {
      const v = pairingView(view, 'en', zone)
      assert.ok(deepFrozen(v), view.state)
      assert.deepEqual(Object.keys(v).filter((k) => k !== 'key').sort(), [...VIEW.keys].sort(), view.state)
    }
  })
  // PAIR-EP-02: lang partitions (en, zh, anything else → en).
  for (const lang of FIXTURE.otherLangs) {
    t('PAIR-EP-02', `lang ${show(lang)}`, `lang ${show(lang)} → the en copy`, async () => {
      const { pairingView, TEXT } = await viewModule(sdk)
      assert.deepEqual(bodyOf(pairingView(coreView(STATE.warnMatch), lang, zone)), withConfirmFlags(expectedView(TEXT, coreView(STATE.warnMatch), 'en', zone)))
    })
  }
  t('PAIR-EP-02', 'lang undefined', 'no lang → the en copy', async () => {
    const { pairingView, TEXT } = await viewModule(sdk)
    assert.deepEqual(bodyOf(pairingView(coreView(STATE.needToken))), withConfirmFlags(expectedView(TEXT, coreView(STATE.needToken), 'en')))
  })
  // PAIR-BVA-01: lastSeenAt null → neverSeen; 0 (the epoch, a number) → a formatted time.
  for (const lang of VIEW.langs) {
    for (const [label, at] of [['null', null], ['0 (epoch)', 0], ['a time', FIXTURE.lastSeenAt]]) {
      t('PAIR-BVA-01', `lastSeenAt ${label} ${lang}`, `(${lang}) lastSeenAt ${label} → ${at === null ? 'neverSeen' : 'Intl medium/short in the zone'}`, async () => {
        const { pairingView, TEXT } = await viewModule(sdk)
        for (const state of [STATE.warnMatch, STATE.warnMismatch]) {
          const view = coreView(state, { warning: warningOf({ idMatches: state === STATE.warnMatch, lastSeenAt: at }) })
          const [line] = pairingView(view, lang, zone).lines
          const key = state === STATE.warnMatch ? 'warnMatch' : 'warnMismatch'
          assert.equal(line.text, TEXT[lang][key](FIXTURE.name, lastSeenText(TEXT, lang, at, zone)), state)
          if (at === null) assert.ok(line.text.includes(TEXT[lang].neverSeen))
        }
      })
    }
  }
  // PAIR-EP-03: time zone partitions: two valid zones differ; invalid / absent → process default, never throws.
  t('PAIR-EP-03', 'zones', `the time is written in the given IANA zone (${FIXTURE.zones.join(', ')} differ)`, async () => {
    const { pairingView, TEXT } = await viewModule(sdk)
    const texts = FIXTURE.zones.map((tz) => pairingView(coreView(STATE.warnMatch), 'en', tz).lines[0].text)
    FIXTURE.zones.forEach((tz, i) => assert.ok(texts[i].includes(lastSeenText(TEXT, 'en', FIXTURE.lastSeenAt, tz)), tz))
    assert.notEqual(texts[0], texts[1])
  })
  for (const bad of [...FIXTURE.badZones, undefined]) {
    t('PAIR-EP-03', `zone ${show(bad) ?? 'undefined'}`, `an invalid or absent zone ${show(bad) ?? 'undefined'} → the process default zone, no throw`, async () => {
      const { pairingView, TEXT } = await viewModule(sdk)
      for (const lang of VIEW.langs) {
        const v = pairingView(coreView(STATE.warnMatch), lang, bad)
        assert.ok(v.lines[0].text.includes(lastSeenText(TEXT, lang, FIXTURE.lastSeenAt, undefined)), lang + ': ' + v.lines[0].text)
      }
    })
  }
  // PAIR-EP-04: the bound name: inUse.name, or `ID: <id>` when nameless.
  for (const lang of VIEW.langs) {
    t('PAIR-EP-04', `nameless ${lang}`, `(${lang}) a nameless bound pair is shown as "ID: <id>" in the warning`, async () => {
      const { pairingView, TEXT } = await viewModule(sdk)
      for (const state of [STATE.warnMatch, STATE.warnMismatch]) {
        const view = coreView(state, { warning: warningOf({ idMatches: state === STATE.warnMatch, nameless: true }) })
        assert.deepEqual(bodyOf(pairingView(view, lang, zone)), withConfirmFlags(expectedView(TEXT, view, lang, zone)))
        assert.ok(pairingView(view, lang, zone).lines[0].text.includes(VIEW.idPrefix + FIXTURE.boundId))
      }
    })
  }
  // PAIR-DT-02: nameIssue code × inUse kind × state (it adds one line in any state).
  for (const lang of VIEW.langs) {
    for (const code of Object.values(NAME_CODE)) {
      for (const nameless of [false, true]) {
        for (const state of [STATE.paired, STATE.unpaired, STATE.warnMatch, STATE.needId]) {
          t('PAIR-DT-02', `${code} ${nameless ? 'nameless' : 'named'} ${state} ${lang}`, `(${lang}) nameIssue ${code} (${nameless ? 'no name' : 'a name'}) in ${state} → one more line kind ${code}`, async () => {
            const { pairingView, TEXT } = await viewModule(sdk)
            const view = coreView(state, { nameIssue: nameIssueOf(code, { nameless }) })
            const v = pairingView(view, lang, zone)
            assert.deepEqual(bodyOf(v), withConfirmFlags(expectedView(TEXT, view, lang, zone)))
            assert.equal(v.lines.at(-1).kind, code)
          })
        }
      }
    }
  }
  t('PAIR-BVA-02', 'core absent', 'view undefined (core absent) → no lines, no choices, no confirm', async () => {
    const { pairingView, TEXT } = await viewModule(sdk)
    for (const lang of VIEW.langs) {
      const v = pairingView(undefined, lang, zone)
      assert.deepEqual([v.lines, v.choices, v.confirm, v.title, v.failed], [[], [], null, TEXT[lang].title, TEXT[lang].chooseFailed])
    }
  })
  t('PAIR-EP-05', 'key', 'key is a string; it is the same for equal views and differs when state, warning or nameIssue changes', async () => {
    const { pairingView } = await viewModule(sdk)
    const k = (view) => pairingView(view, 'en', zone).key
    const base = coreView(STATE.warnMatch)
    assert.equal(typeof k(base), 'string')
    assert.equal(k(base), k(coreView(STATE.warnMatch)))
    assert.notEqual(k(base), k(coreView(STATE.warnMismatch)), 'state')
    assert.notEqual(k(base), k(coreView(STATE.warnMatch, { warning: { ...warningOf(), boundId: 'fbtest-other-bound' } })), 'warning')
    assert.notEqual(k(base), k(coreView(STATE.warnMatch, { nameIssue: nameIssueOf(NAME_CODE.taken) })), 'nameIssue')
  })

  // ======================================================================== the Node row (integration)
  // Re-baselined (MULTI-3 requirement D, the lead 2026-11-18): the pairing dock card and its routes
  // /api/fishball/pairing and /api/fishball/pairing/choose are removed; pairing is posted per target
  // to SEAM_TARGETS.route.pairing from the sidebar details. The route rows stay listed, withdrawn.
  const tRoute = (id, row, title) => withdrawnRow(sdk, id, row, title, WITHDRAWN.pairingRoute)
  t('PAIR-INT-00', 'routes removed', `fishball-ui's row registers neither ${ROUTE.stream} nor ${ROUTE.choose}`, async (c) => {
    const row = await rowWorld(c, sdk)
    assert.deepEqual(row.routes.map((r) => r.path).filter((at) => at === ROUTE.stream || at === ROUTE.choose), [])
  })
  tRoute('PAIR-INT-01', 'routes', 'the row registers GET /api/fishball/pairing and POST /api/fishball/pairing/choose on ctx.connection.fetch', async (c) => {
    const w = await rowWorld(c, sdk)
    const stream = w.routes.find((r) => r.path === ROUTE.stream)
    const choose = w.routes.find((r) => r.path === ROUTE.choose)
    assert.ok(stream && choose, show(w.routes.map((r) => r.path)))
    assert.ok(stream.methods.includes(ROUTE.get), show(stream.methods))
    assert.ok(choose.methods.includes(ROUTE.post), show(choose.methods))
  })
  for (const lang of VIEW.langs) {
    tRoute('PAIR-INT-02', `first frame ${lang}`, `(${lang}) GET ?lang=${lang}&tz=<zone>: 200 text/event-stream, one frame at once = pairingView(core's view, ${lang}, zone)`, async (c) => {
      const { pairingView } = await viewModule(sdk)
      const w = await rowWorld(c, sdk)
      const core = fakeInstance({ view: coreView(STATE.warnMatch) })
      await w.provide(core)
      const r = await w.open(`?lang=${lang}&tz=${encodeURIComponent(zone)}`)
      assert.equal(r.response.status, ROUTE.ok)
      assert.ok((r.response.headers.get('content-type') ?? '').includes(ROUTE.sse))
      assert.equal(await r.count(1), 1)
      assert.deepEqual(r.frames[0], plain(pairingView(coreView(STATE.warnMatch), lang, zone)))
      r.abort()
    })
  }
  tRoute('PAIR-INT-02', 'lang/tz other', 'GET with lang=fr and an invalid tz → the en frame, the default zone', async (c) => {
    const { pairingView } = await viewModule(sdk)
    const w = await rowWorld(c, sdk)
    await w.provide(fakeInstance({ view: coreView(STATE.warnMatch) }))
    const r = await w.open('?lang=fr&tz=Mars%2FOlympus')
    await r.count(1)
    assert.deepEqual(r.frames[0], plain(pairingView(coreView(STATE.warnMatch), 'en', undefined)))
    r.abort()
  })
  tRoute('PAIR-ST-01', 'change', 'core view changes → one new frame per change; an identical consecutive view sends no frame', async (c) => {
    const { pairingView } = await viewModule(sdk)
    const w = await rowWorld(c, sdk)
    const core = fakeInstance({ view: coreView(STATE.unpaired) })
    await w.provide(core)
    const r = await w.open('?lang=en&tz=' + encodeURIComponent(zone))
    await r.count(1)
    core.set(coreView(STATE.warnMatch))
    assert.equal(await r.count(2), 2)
    assert.deepEqual(r.frames[1], plain(pairingView(coreView(STATE.warnMatch), 'en', zone)))
    core.set(coreView(STATE.warnMatch))
    assert.equal(await r.quiet(), 2, 'an identical frame was re-sent')
    core.set(coreView(STATE.needToken))
    assert.equal(await r.count(3), 3)
    r.abort()
  })
  tRoute('PAIR-ST-02', 'absent → provided → replaced → removed', 'no core: a frame with no lines; core provided: its frame; replaced: the new one\'s frame and the old listener dropped; removed: a frame with no lines', async (c) => {
    const w = await rowWorld(c, sdk)
    const r = await w.open('?lang=en&tz=' + encodeURIComponent(zone))
    await r.count(1)
    assert.deepEqual(r.frames[0].lines, [], 'no core: lines')
    const a = fakeInstance({ view: coreView(STATE.warnMatch) })
    const disposeA = await w.provide(a)
    await r.count(2)
    assert.equal(r.frames.at(-1).state, STATE.warnMatch)
    await disposeA()
    const b = fakeInstance({ view: coreView(STATE.needId) })
    const disposeB = await w.provide(b)
    await r.count(4, undefined)
    assert.equal(r.frames.at(-1).state, STATE.needId, show(r.frames.map((f) => f.state)))
    assert.equal(a.listeners.size, 0, 'the old service\'s listener stayed')
    const before = r.frames.length
    a.set(coreView(STATE.idMismatch))
    assert.equal(await r.quiet(), before, 'a frame from the replaced service')
    await disposeB()
    await r.count(before + 1)
    assert.deepEqual(r.frames.at(-1).lines, [], 'removed: lines')
    assert.equal(b.listeners.size, 0)
    r.abort()
  })
  for (const [label, options] of [['apiVersion 2', { apiVersion: 2 }], ['no ui.pairing', { pairing: false }]]) {
    tRoute('PAIR-EP-06', label, `a fishballInstance with ${label} counts as absent: a frame with no lines; choose → 503 pairing-unavailable`, async (c) => {
      const w = await rowWorld(c, sdk)
      const core = fakeInstance({ view: coreView(STATE.warnMatch), ...options })
      await w.provide(core)
      const r = await w.open('?lang=en')
      await r.count(1)
      assert.deepEqual(r.frames.at(-1).lines, [])
      const answer = await w.choose({ choice: CHOICE.continue, confirmed: true })
      assert.deepEqual([answer.status, answer.json], [ROUTE.unavailable, ROUTE.noService])
      assert.deepEqual(core.calls, [])
      r.abort()
    })
  }
  tRoute('PAIR-ST-03', 'abort', 'a request abort closes that stream and drops its listener on core', async (c) => {
    const w = await rowWorld(c, sdk)
    const core = fakeInstance({ view: coreView(STATE.warnMatch) })
    await w.provide(core)
    const r = await w.open('?lang=en')
    await r.count(1)
    assert.ok(core.listeners.size >= 1, 'precondition: the stream follows core')
    r.abort()
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(core.listeners.size, 0)
  })
  tRoute('PAIR-ST-03', 'disposal', 'disposing the row withdraws both routes, closes open streams and drops their listeners', async (c) => {
    const w = await rowWorld(c, sdk)
    const core = fakeInstance({ view: coreView(STATE.warnMatch) })
    await w.provide(core)
    const r = await w.open('?lang=en')
    await r.count(1)
    await w.stop()
    assert.ok(await r.closed(), 'the stream stayed open')
    assert.ok([ROUTE.stream, ROUTE.choose].every((p) => w.withdrawn.includes(p)), show(w.withdrawn))
    assert.equal(core.listeners.size, 0)
  })
  // PAIR-DT-03: the choose route (body × service × answer).
  const answers = [
    ['ok', { ok: true }], ['not-confirmed', { ok: false, code: REFUSAL.notConfirmed }],
    ['not-offered', { ok: false, code: REFUSAL.notOffered }], ['not-saved', { ok: false, code: REFUSAL.notSaved }],
  ]
  for (const [label, result] of answers) {
    tRoute('PAIR-DT-03', `answer ${label}`, `POST {choice, confirmed: true} → choose(choice, {confirmed: true}) once; 200 with its result ${show(result)}`, async (c) => {
      const w = await rowWorld(c, sdk)
      const core = fakeInstance({ view: coreView(STATE.warnMatch), choose: () => result })
      await w.provide(core)
      const answer = await w.choose({ choice: CHOICE.continue, confirmed: true })
      assert.deepEqual([answer.status, answer.json], [ROUTE.ok, result])
      assert.deepEqual(core.calls, [[CHOICE.continue, { confirmed: true }]])
    })
  }
  // EP over `confirmed`: only the boolean true counts as confirmed.
  for (const [label, confirmed] of [['false', false], ['absent', undefined], ['"true"', 'true'], ['1', 1], ['null', null]]) {
    tRoute('PAIR-EP-07', `confirmed ${label}`, `POST confirmed ${label} → choose(choice, {confirmed: false})`, async (c) => {
      const w = await rowWorld(c, sdk)
      const core = fakeInstance({ view: coreView(STATE.warnMatch), choose: (_ch, o) => (o.confirmed ? { ok: true } : { ok: false, code: REFUSAL.notConfirmed }) })
      await w.provide(core)
      const body = confirmed === undefined ? { choice: CHOICE.continue } : { choice: CHOICE.continue, confirmed }
      const answer = await w.choose(body)
      assert.deepEqual(core.calls, [[CHOICE.continue, { confirmed: false }]])
      assert.deepEqual([answer.status, answer.json], [ROUTE.ok, { ok: false, code: REFUSAL.notConfirmed }])
    })
  }
  // EP over bad bodies → 400 invalid-arguments, core not called.
  for (const [label, body] of [['not JSON', '{not json'], ['an array', '[]'], ['null', 'null'], ['a string', '"continue"'], ['choice missing', '{"confirmed":true}'], ['choice a number', '{"choice":1}'], ['choice null', '{"choice":null}'], ['empty body', '']]) {
    tRoute('PAIR-EP-08', label, `POST body ${label} → 400 {ok:false, code:'invalid-arguments'}; core's choose not called`, async (c) => {
      const w = await rowWorld(c, sdk)
      const core = fakeInstance({ view: coreView(STATE.warnMatch) })
      await w.provide(core)
      const answer = await w.choose(body, true)
      assert.deepEqual([answer.status, answer.json], [ROUTE.bad, ROUTE.invalid])
      assert.deepEqual(core.calls, [])
    })
  }
  tRoute('PAIR-EP-08', 'unknown choice string', 'POST {choice: "fbtest-other"} (a string) → passed to core, its refusal answered with 200', async (c) => {
    const w = await rowWorld(c, sdk)
    const core = fakeInstance({ view: coreView(STATE.warnMatch), choose: () => ({ ok: false, code: REFUSAL.notOffered }) })
    await w.provide(core)
    const answer = await w.choose({ choice: 'fbtest-other' })
    assert.deepEqual([answer.status, answer.json], [ROUTE.ok, { ok: false, code: REFUSAL.notOffered }])
    assert.deepEqual(core.calls, [['fbtest-other', { confirmed: false }]])
  })
  for (const [label, choose] of [['throws', () => { throw new Error('fbtest choose throws') }], ['rejects', () => Promise.reject(new Error('fbtest choose rejects'))]]) {
    tRoute('PAIR-DT-03', `choose ${label}`, `core's choose ${label} → 503 {ok:false, code:'pairing-unavailable'}`, async (c) => {
      const w = await rowWorld(c, sdk)
      await w.provide(fakeInstance({ view: coreView(STATE.warnMatch), choose }))
      const answer = await w.choose({ choice: CHOICE.continue, confirmed: true })
      assert.deepEqual([answer.status, answer.json], [ROUTE.unavailable, ROUTE.noService])
    })
  }
  tRoute('PAIR-DT-03', 'no core', 'no fishballInstance at all → 503 pairing-unavailable', async (c) => {
    const w = await rowWorld(c, sdk)
    const answer = await w.choose({ choice: CHOICE.newToken, confirmed: false })
    assert.deepEqual([answer.status, answer.json], [ROUTE.unavailable, ROUTE.noService])
  })

  // ======================================================================== the drawn card (withdrawn)
  // Re-baselined (MULTI-3 requirement D): the pairing dock card is replaced by pairing inside the
  // sidebar target details (model-dialog/targets-cases.mjs TGT-SB-ST-05, TGT-SB-DT-03); these rows
  // stay listed, withdrawn, and their bodies no longer run.
  const gone = (id, row, title) => withdrawnRow(sdk, id, row, title, WITHDRAWN.pairingCard)
  const frameOf = async (view, lang = 'en') => plain((await viewModule(sdk)).pairingView(view, lang, zone))
  gone('PAIR-UI-01', 'stream url', 'the card opens the pairing stream with lang (UI locale) and tz (the browser zone)', async (c) => {
    for (const [uiLang, lang] of [['en', 'en'], ['zh', 'zh'], ['zh-CN', 'zh'], ['fr', 'en']]) {
      const p = await pairingPage(c, sdk, { lang: uiLang })
      const url = new URL(p.stream().url, FIXTURE.base)
      assert.equal(url.searchParams.get('lang'), lang, uiLang)
      assert.equal(url.searchParams.get('tz'), Intl.DateTimeFormat().resolvedOptions().timeZone, uiLang)
    }
  })
  for (const lang of VIEW.langs) {
    gone('PAIR-UI-02', `warn-match ${lang}`, `(${lang}) warn-match: root [state], one line per frame line, the confirm checkbox with the confirm text, continue and new-token-and-id buttons; continue disabled until ticked`, async (c) => {
      const p = await pairingPage(c, sdk, { lang })
      const frame = await frameOf(coreView(STATE.warnMatch), lang)
      await p.show(frame)
      const root = p.root()
      assert.ok(root, 'no card')
      assert.equal(root.props[HOOK.state], STATE.warnMatch)
      for (const line of frame.lines) assert.equal(p.textOf(p.byHook(HOOK.line, line.kind)[0] ?? { children: [] }).trim(), line.text)
      assert.ok(p.confirmBox(), 'no confirm checkbox')
      assert.ok(p.textOf(p.byHook(HOOK.confirm)[0]).includes(frame.confirm), 'confirm text')
      assert.equal(p.confirmBox().props.checked, false)
      for (const ch of frame.choices) assert.equal(p.textOf(p.choice(ch.choice)).trim(), ch.label)
      assert.equal(p.choice(CHOICE.continue).props.disabled, true, 'continue enabled before the tick')
      assert.notEqual(p.choice(CHOICE.newTokenAndId).props.disabled, true)
      await p.tick(true)
      assert.notEqual(p.choice(CHOICE.continue).props.disabled, true, 'continue still disabled after the tick')
      await p.tick(false)
      assert.equal(p.choice(CHOICE.continue).props.disabled, true, 'continue enabled after unticking')
    })
  }
  for (const [state, choices] of [[STATE.warnMismatch, [CHOICE.newToken]], [STATE.needToken, []], [STATE.needId, []], [STATE.idMismatch, []]]) {
    gone('PAIR-UI-03', state, `${state}: the line, no confirm checkbox, choices ${show(choices)}`, async (c) => {
      const p = await pairingPage(c, sdk)
      await p.show(await frameOf(coreView(state)))
      assert.equal(p.root()?.props[HOOK.state], state)
      assert.equal(p.byHook(HOOK.line, state).length, 1)
      assert.equal(p.byHook(HOOK.confirm).length, 0)
      assert.deepEqual(p.byHook(HOOK.choice).filter((n) => n.tag === 'button').map((n) => n.props[HOOK.choice]), choices)
    })
  }
  for (const [label, view] of [['unpaired', coreView(STATE.unpaired)], ['paired', coreView(STATE.paired)], ['core absent', undefined]]) {
    gone('PAIR-UI-04', label, `${label}: a frame with no lines draws nothing`, async (c) => {
      const p = await pairingPage(c, sdk)
      await p.show(await frameOf(view))
      assert.equal(p.root(), undefined)
      assert.deepEqual(p.nodes().filter((n) => n.props[HOOK.root] !== undefined), [])
    })
  }
  gone('PAIR-UI-04', 'name issue only', 'paired with a name issue: a card with that one line kind', async (c) => {
    const p = await pairingPage(c, sdk)
    await p.show(await frameOf(coreView(STATE.paired, { nameIssue: nameIssueOf(NAME_CODE.taken) })))
    assert.equal(p.byHook(HOOK.line, NAME_CODE.taken).length, 1)
  })
  // PAIR-DT-04: press × answer → posted body, failed alert.
  for (const [label, choice, tick, answer, failed] of [
    ['continue ticked, ok', CHOICE.continue, true, () => ({ status: 200, json: { ok: true } }), false],
    ['new-token-and-id, ok', CHOICE.newTokenAndId, false, () => ({ status: 200, json: { ok: true } }), false],
    ['continue ticked, not-saved', CHOICE.continue, true, () => ({ status: 200, json: { ok: false, code: REFUSAL.notSaved } }), true],
    ['new-token-and-id, 503', CHOICE.newTokenAndId, false, () => ({ status: 503, json: ROUTE.noService }), true],
    ['new-token-and-id, network failure', CHOICE.newTokenAndId, false, () => 'reject', true],
    ['new-token-and-id, non-JSON', CHOICE.newTokenAndId, false, () => ({ status: 200, text: '<html>' }), true],
  ]) {
    for (const lang of VIEW.langs) {
      gone('PAIR-DT-04', `${label} ${lang}`, `(${lang}) press ${choice}${tick ? ' (ticked)' : ''} → POST {choice, confirmed: ${tick}}; ${failed ? 'the failed alert with the frame\'s failed text' : 'no error'}`, async (c) => {
        const p = await pairingPage(c, sdk, { lang, choose: answer })
        const frame = await frameOf(coreView(STATE.warnMatch), lang)
        await p.show(frame)
        if (tick) await p.tick(true)
        await p.press(p.choice(choice))
        assert.equal(p.posts.length, 1)
        assert.equal(p.posts[0].method, ROUTE.post)
        assert.deepEqual(JSON.parse(p.posts[0].body), { choice, confirmed: tick })
        const alerts = p.byHook(HOOK.failed)
        if (!failed) { assert.deepEqual(alerts, []); return }
        assert.equal(alerts.length, 1)
        assert.equal(alerts[0].props.role, HOOK.alertRole)
        assert.equal(p.textOf(alerts[0]).trim(), frame.failed)
      })
    }
  }
  gone('PAIR-DT-04', 'mismatch new-token', 'warn-mismatch: new-token press posts {choice: new-token, confirmed: false}', async (c) => {
    const p = await pairingPage(c, sdk)
    await p.show(await frameOf(coreView(STATE.warnMismatch)))
    await p.press(p.choice(CHOICE.newToken))
    assert.deepEqual(p.posts.map((x) => JSON.parse(x.body)), [{ choice: CHOICE.newToken, confirmed: false }])
  })
  // The requirement's mechanism is the disabled button ("can never be sent (button disabled)"), and the
  // backend refusal (PAIR-EP-07): a browser fires no click on a disabled button, so this row checks the
  // button through tick / untick / a new frame, not a click the harness could force on it.
  gone('PAIR-ST-04', 'unticked continue', 'continue is disabled whenever the box is not ticked: before, after untick, after a new warning', async (c) => {
    const p = await pairingPage(c, sdk)
    await p.show(await frameOf(coreView(STATE.warnMatch)))
    assert.equal(p.choice(CHOICE.continue).props.disabled, true, 'before')
    await p.tick(true)
    await p.tick(false)
    assert.equal(p.choice(CHOICE.continue).props.disabled, true, 'after untick')
    assert.deepEqual(p.posts, [])
  })
  gone('PAIR-ST-04', 'failed → ok clears', 'failed alert shown → a later ok answer shows no error', async (c) => {
    let answer = { status: 200, json: { ok: false, code: REFUSAL.notSaved } }
    const p = await pairingPage(c, sdk, { choose: () => answer })
    await p.show(await frameOf(coreView(STATE.warnMatch)))
    await p.press(p.choice(CHOICE.newTokenAndId))
    assert.equal(p.byHook(HOOK.failed).length, 1)
    answer = { status: 200, json: { ok: true } }
    await p.press(p.choice(CHOICE.newTokenAndId))
    assert.deepEqual(p.byHook(HOOK.failed), [])
  })
  gone('PAIR-ST-05', 'new warning resets', 'ticked and failed → a new warn-match for another bound pair: the box unticked, continue disabled, the alert gone', async (c) => {
    const p = await pairingPage(c, sdk, { choose: () => ({ status: 200, json: { ok: false, code: REFUSAL.notSaved } }) })
    await p.show(await frameOf(coreView(STATE.warnMatch)))
    await p.tick(true)
    await p.press(p.choice(CHOICE.continue))
    assert.equal(p.byHook(HOOK.failed).length, 1, 'precondition: failed')
    await p.show(await frameOf(coreView(STATE.warnMatch, { warning: { ...warningOf(), boundId: 'fbtest-other-bound', inUse: { name: 'Fbtest Other' } } })))
    assert.equal(p.confirmBox()?.props.checked, false)
    assert.equal(p.choice(CHOICE.continue).props.disabled, true)
    assert.deepEqual(p.byHook(HOOK.failed), [])
  })
  gone('PAIR-ST-05', 'same warning keeps', 'ticked → the same warning frame again: the box stays ticked', async (c) => {
    const p = await pairingPage(c, sdk)
    const frame = await frameOf(coreView(STATE.warnMatch))
    await p.show(frame)
    await p.tick(true)
    await p.show(frame)
    assert.equal(p.confirmBox()?.props.checked, true)
  })

  // ======================================================================== F3 on the pairing card (component)
  for (const lang of VIEW.langs) {
    for (const [health, closed] of [[HEALTH.stale, false], [HEALTH.closed, true]]) {
      gone('PAIR-HEALTH-01', `${health} ${lang}`, `(${lang}) error with readyState ${closed ? 'CLOSED' : 'CONNECTING'} → the ${health} notice, the cached lines still readable, the checkbox and every choice disabled${closed ? ', a Reconnect button' : ''}`, async (c) => {
        const p = await pairingPage(c, sdk, { lang })
        const frame = await frameOf(coreView(STATE.warnMatch), lang)
        await p.show(frame)
        await p.tick(true)
        p.stream().fail({ closed })
        await settle()
        const notices = p.byHook(HEALTH_HOOK.notice, health)
        assert.equal(notices.length, 1, `notices ${show(p.byHook(HEALTH_HOOK.notice).map((n) => n.props[HEALTH_HOOK.notice]))}`)
        assert.ok(p.textOf(notices[0]).includes(NOTICE_TEXT[health][lang]), p.textOf(notices[0]))
        assert.equal(p.root()?.props[HEALTH_HOOK.pairingStale], health)
        for (const line of frame.lines) assert.ok(p.text().includes(line.text), 'cached line not readable')
        assert.equal(p.confirmBox()?.props.disabled, true, 'checkbox enabled')
        for (const ch of frame.choices) assert.equal(p.choice(ch.choice)?.props.disabled, true, ch.choice + ' enabled')
        const retry = p.byHook(HEALTH_HOOK.retry)
        if (closed) assert.ok(retry.length === 1 && p.textOf(retry[0]).trim() === NOTICE_TEXT.retry[lang], show(retry.map(p.textOf)))
        else assert.equal(retry.length, 0)
      })
    }
  }
  gone('PAIR-HEALTH-02', 'fresh frame', 'stale → a fresh valid frame: no notice, choices enabled again (continue per its tick)', async (c) => {
    const p = await pairingPage(c, sdk)
    const frame = await frameOf(coreView(STATE.warnMatch))
    await p.show(frame)
    p.stream().fail({ closed: false })
    await settle()
    assert.equal(p.byHook(HEALTH_HOOK.notice).length, 1, 'precondition: stale')
    await p.show(frame)
    assert.deepEqual(p.byHook(HEALTH_HOOK.notice), [])
    assert.notEqual(p.choice(CHOICE.newTokenAndId).props.disabled, true)
    assert.notEqual(p.confirmBox().props.disabled, true)
  })
  gone('PAIR-HEALTH-02', 'invalid frame', 'stale → an invalid frame (not JSON, no lines) does not clear the notice', async (c) => {
    const p = await pairingPage(c, sdk)
    await p.show(await frameOf(coreView(STATE.warnMatch)))
    p.stream().fail({ closed: false })
    await settle()
    for (const raw of ['{not json', JSON.stringify({ lines: 'x' }), 'null']) { p.stream().deliverRaw(raw); await settle() }
    assert.equal(p.byHook(HEALTH_HOOK.notice, HEALTH.stale).length, 1)
  })
  gone('PAIR-HEALTH-03', 'unmount', 'unmounting the card closes its EventSource', async (c) => {
    const p = await pairingPage(c, sdk)
    const s = p.stream()
    await p.unmount()
    assert.equal(s.closed, true)
  })
}
