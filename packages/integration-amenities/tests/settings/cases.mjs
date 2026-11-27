/**
 * fishball-board's settings beside the heartbeat's live settings (R2/R3 of the amenities' settings
 * pages, the lead 2026-11-22; old test/v3/fishball-amenities/heartbeat live-cases.mjs): the heartbeat's
 * fields became volatile, so DSH's settings service serves its namespace; fishball-board's Config
 * stays as it was (inject, contextCards, doneWindowHours, none volatile), so DSH serves no
 * fishball-board namespace. The heartbeat half is fishball-heartbeat's own tests; this half needs
 * fishball-board present beside it.
 *
 * Techniques: EP (HB-LC-SC-02: the schema partition "unchanged, non-volatile"; HB-LC-EP-01 row 3: the
 * served-namespace partition "no volatile field → not served").
 * Observed: fishball-board's published row module (its "." export, bound to the current DSH), read
 * through DSH's own dsh-settings SettingsForms (fishball-test-helpers/settings servedNamespace).
 */
import assert from 'node:assert/strict'
import { rowModule } from 'fishball-test-helpers/bind'
import { caseTest } from 'fishball-test-helpers/cases'
import { exportPath } from 'fishball-test-helpers/packages'
import { fieldsOf, servedNamespace } from 'fishball-test-helpers/settings'
import { PKG } from '../support/packages.mjs'

/** fishball-board's settings as the requirement keeps them (unchanged by R2/R3). */
export const BOARD_SETTINGS = Object.freeze({ fields: Object.freeze(['inject', 'contextCards', 'doneWindowHours']) })
const boardRow = () => rowModule(exportPath(PKG.board.name))

export function registerBoardSettingsCases() {
  caseTest('HB-LC-SC-02', 'board', `${PKG.board.name} Config is unchanged: ${BOARD_SETTINGS.fields.join(', ')}, none volatile`, async () => {
    const { Config } = await boardRow()
    assert.ok(Config, PKG.board.name + ' exports no Config')
    const fields = fieldsOf(Config)
    assert.deepEqual(Object.keys(fields), [...BOARD_SETTINGS.fields])
    for (const name of BOARD_SETTINGS.fields) assert.notEqual(fields[name].meta.volatile, true, name + ' is not volatile')
  })
  caseTest('HB-LC-EP-01', 3, `DSH's settings service serves no ${PKG.board.name} namespace (no volatile field)`, async () => {
    const { Config } = await boardRow()
    assert.equal(await servedNamespace({ id: PKG.board.name, Config, raw: {} }), undefined)
  })
}
