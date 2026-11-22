/**
 * R-FIX-FUI F1 black-box rows: the pairing view model (R-ID-07, R-ID-10, R-NAME-03, R-NAME-08).
 * README.md beside this file lists every row with its technique. Levels:
 * - unit: the pure view model `pairingView(view, lang, timeZone)` against the oracle written out from
 *   the specified copy (subject.mjs `expectedView`);
 * - integration (one row): fishball-ui's real Node row in a real Cordis root of the current DSH
 *   registers no pairing route since MULTI-3.
 * The pairing dock card and its two routes were withdrawn by MULTI-3 (requirement D): pairing is
 * shown and posted per target from the sidebar details (TGT-SB-ST-05, TGT-SB-DT-03); their rows are
 * retired, not registered.
 */
import assert from 'node:assert/strict'
import { caseTest } from 'fishball-test-helpers/cases'
import { CHOICE, ID_PREFIX, NAME_CODE, PAIRING_FIXTURE, STATE, coreView, nameIssueOf, warningOf } from '../support/pairing.mjs'
import { FIXTURE, ROUTE, VIEW } from './constants.mjs'
import { deepFrozen, expectedView, lastSeenText, plain, rowWorld, viewModule } from './subject.mjs'

const show = (v) => JSON.stringify(v)
/** The requirement's fields, plus the review's `needsConfirm` per choice (true only for continue in warn-match). */
const withConfirmFlags = (expected) => ({ ...expected, choices: expected.choices.map((c) => ({ ...c, needsConfirm: expected.state === STATE.warnMatch && c.choice === CHOICE.continue })) })
/** The view without `key` (compared separately: it only has to change with core's view). */
const bodyOf = (v) => { const { key, ...rest } = plain(v); return rest }

export function registerPairingCases() {
  const t = caseTest
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
        const { pairingView, TEXT } = await viewModule()
        assert.deepEqual(bodyOf(pairingView(view, lang, zone)), withConfirmFlags(expectedView(TEXT, view, lang, zone)))
      })
    }
  }
  t('PAIR-EP-01', 'frozen', 'the result is deeply frozen and has exactly state, title, lines, confirm, choices, failed (and key)', async () => {
    const { pairingView } = await viewModule()
    for (const [, view] of states) {
      const v = pairingView(view, 'en', zone)
      assert.ok(deepFrozen(v), view.state)
      assert.deepEqual(Object.keys(v).filter((k) => k !== 'key').sort(), [...VIEW.keys].sort(), view.state)
    }
  })
  // PAIR-EP-02: lang partitions (en, zh, anything else → en).
  for (const lang of FIXTURE.otherLangs) {
    t('PAIR-EP-02', `lang ${show(lang)}`, `lang ${show(lang)} → the en copy`, async () => {
      const { pairingView, TEXT } = await viewModule()
      assert.deepEqual(bodyOf(pairingView(coreView(STATE.warnMatch), lang, zone)), withConfirmFlags(expectedView(TEXT, coreView(STATE.warnMatch), 'en', zone)))
    })
  }
  t('PAIR-EP-02', 'lang undefined', 'no lang → the en copy', async () => {
    const { pairingView, TEXT } = await viewModule()
    assert.deepEqual(bodyOf(pairingView(coreView(STATE.needToken))), withConfirmFlags(expectedView(TEXT, coreView(STATE.needToken), 'en')))
  })
  // PAIR-BVA-01: lastSeenAt null → neverSeen; 0 (the epoch, a number) → a formatted time.
  for (const lang of VIEW.langs) {
    for (const [label, at] of [['null', null], ['0 (epoch)', 0], ['a time', PAIRING_FIXTURE.lastSeenAt]]) {
      t('PAIR-BVA-01', `lastSeenAt ${label} ${lang}`, `(${lang}) lastSeenAt ${label} → ${at === null ? 'neverSeen' : 'Intl medium/short in the zone'}`, async () => {
        const { pairingView, TEXT } = await viewModule()
        for (const state of [STATE.warnMatch, STATE.warnMismatch]) {
          const view = coreView(state, { warning: warningOf({ idMatches: state === STATE.warnMatch, lastSeenAt: at }) })
          const [line] = pairingView(view, lang, zone).lines
          const key = state === STATE.warnMatch ? 'warnMatch' : 'warnMismatch'
          assert.equal(line.text, TEXT[lang][key](PAIRING_FIXTURE.name, lastSeenText(TEXT, lang, at, zone)), state)
          if (at === null) assert.ok(line.text.includes(TEXT[lang].neverSeen))
        }
      })
    }
  }
  // PAIR-EP-03: time zone partitions: two valid zones differ; invalid / absent → process default, never throws.
  t('PAIR-EP-03', 'zones', `the time is written in the given IANA zone (${FIXTURE.zones.join(', ')} differ)`, async () => {
    const { pairingView, TEXT } = await viewModule()
    const texts = FIXTURE.zones.map((tz) => pairingView(coreView(STATE.warnMatch), 'en', tz).lines[0].text)
    FIXTURE.zones.forEach((tz, i) => assert.ok(texts[i].includes(lastSeenText(TEXT, 'en', PAIRING_FIXTURE.lastSeenAt, tz)), tz))
    assert.notEqual(texts[0], texts[1])
  })
  for (const bad of [...FIXTURE.badZones, undefined]) {
    t('PAIR-EP-03', `zone ${show(bad) ?? 'undefined'}`, `an invalid or absent zone ${show(bad) ?? 'undefined'} → the process default zone, no throw`, async () => {
      const { pairingView, TEXT } = await viewModule()
      for (const lang of VIEW.langs) {
        const v = pairingView(coreView(STATE.warnMatch), lang, bad)
        assert.ok(v.lines[0].text.includes(lastSeenText(TEXT, lang, PAIRING_FIXTURE.lastSeenAt, undefined)), lang + ': ' + v.lines[0].text)
      }
    })
  }
  // PAIR-EP-04: the bound name: inUse.name, or `ID: <id>` when nameless.
  for (const lang of VIEW.langs) {
    t('PAIR-EP-04', `nameless ${lang}`, `(${lang}) a nameless bound pair is shown as "ID: <id>" in the warning`, async () => {
      const { pairingView, TEXT } = await viewModule()
      for (const state of [STATE.warnMatch, STATE.warnMismatch]) {
        const view = coreView(state, { warning: warningOf({ idMatches: state === STATE.warnMatch, nameless: true }) })
        assert.deepEqual(bodyOf(pairingView(view, lang, zone)), withConfirmFlags(expectedView(TEXT, view, lang, zone)))
        assert.ok(pairingView(view, lang, zone).lines[0].text.includes(ID_PREFIX + PAIRING_FIXTURE.boundId))
      }
    })
  }
  // PAIR-DT-02: nameIssue code × inUse kind × state (it adds one line in any state).
  for (const lang of VIEW.langs) {
    for (const code of Object.values(NAME_CODE)) {
      for (const nameless of [false, true]) {
        for (const state of [STATE.paired, STATE.unpaired, STATE.warnMatch, STATE.needId]) {
          t('PAIR-DT-02', `${code} ${nameless ? 'nameless' : 'named'} ${state} ${lang}`, `(${lang}) nameIssue ${code} (${nameless ? 'no name' : 'a name'}) in ${state} → one more line kind ${code}`, async () => {
            const { pairingView, TEXT } = await viewModule()
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
    const { pairingView, TEXT } = await viewModule()
    for (const lang of VIEW.langs) {
      const v = pairingView(undefined, lang, zone)
      assert.deepEqual([v.lines, v.choices, v.confirm, v.title, v.failed], [[], [], null, TEXT[lang].title, TEXT[lang].chooseFailed])
    }
  })
  t('PAIR-EP-05', 'key', 'key is a string; it is the same for equal views and differs when state, warning or nameIssue changes', async () => {
    const { pairingView } = await viewModule()
    const k = (view) => pairingView(view, 'en', zone).key
    const base = coreView(STATE.warnMatch)
    assert.equal(typeof k(base), 'string')
    assert.equal(k(base), k(coreView(STATE.warnMatch)))
    assert.notEqual(k(base), k(coreView(STATE.warnMismatch)), 'state')
    assert.notEqual(k(base), k(coreView(STATE.warnMatch, { warning: warningOf({ boundId: PAIRING_FIXTURE.otherBoundId }) })), 'warning')
    assert.notEqual(k(base), k(coreView(STATE.warnMatch, { nameIssue: nameIssueOf(NAME_CODE.taken) })), 'nameIssue')
  })

  t('PAIR-INT-00', 'routes removed', `fishball-ui's row registers neither ${ROUTE.stream} nor ${ROUTE.choose}`, async (c) => {
    const row = await rowWorld(c)
    assert.deepEqual(row.routes.map((r) => r.path).filter((at) => at === ROUTE.stream || at === ROUTE.choose), [])
  })
}
