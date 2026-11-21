/**
 * R-FIX-FUI F2, re-baselined by 117cb2a2: fishball-ui is core's ./ui/ component, not a bundle of
 * its own. There is no fishball-ui patch and no composition without core, so the old NOCORE-*
 * decision tables ("fishball-ui alone", "core alone", "UI selected/started", HMR switching UI
 * rows) describe a DSH that can no longer exist.
 *
 * These rows replace them with the component model:
 * - core's patch is the one definition: it inserts the UI rows and disables the UI guard rows;
 * - the Preview Notice row is core's and depends only on the hosted child overlay;
 * - readIntendedGuards().uiRows is empty; the UI guard ids are plain rows in `rows`.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { GUARDS } from '../guards/constants.mjs'
import { NOTICE, ROWS, UI_PACKAGE } from './constants.mjs'
import { composedWith, coreIntendedReader, corePatch, findRows, resolvedWith, rowOps } from './subject.mjs'

const show = (v) => JSON.stringify(v)
const CORE = V3.core.name
const UI = V3.ui.name
const INSERTED = Object.freeze([...Object.keys(ROWS.withCore), ROWS.coreMissing.id])
const CHILD_OVERLAY = Object.freeze([Object.freeze({ insert: Object.freeze([Object.freeze({ id: NOTICE.childRow, name: 'fbtest-child-row', config: Object.freeze({}) })]) })])

/** The notice row op, as DSH's loadOverlayPatches parsed it. */
const noticeOp = async (sdk) => rowOps(await corePatch(sdk)).find((op) => op.id === NOTICE.row)

export function registerNoCoreCases(sdk) {
  const t = (id, row, title, fn, todo) => caseTest(sdk, id, row, title, fn, todo)

  t('NOCORE-ARCH', 'no UI patch', 'fishball-ui has no bundle patch since 117cb2a2; its rows live in core\'s patch', () => {
    assert.equal(fs.existsSync(path.join(UI_PACKAGE.dir, UI_PACKAGE.patchFile)), false, 'fishball-ui still has a patch')
    const manifest = JSON.parse(fs.readFileSync(path.join(UI_PACKAGE.dir, 'package.json'), 'utf8'))
    assert.equal(manifest.dsh?.bundle, undefined, 'fishball-ui still declares dsh.bundle')
  })
  t('NOCORE-ARCH', 'core composition', "core's patch with DSH's own layers: the UI rows are inserted and the UI guard rows are plain disabled:true", async () => {
    const patch = await corePatch(sdk)
    for (const id of ROWS.guards) {
      const op = rowOps(patch).find((r) => r.id === id)
      assert.ok(op, 'core patch has no ' + id)
      assert.equal(op.disabled, true, id + ': ' + show(op))
    }
    const effective = await composedWith(sdk, patch)
    for (const id of INSERTED.filter((id) => id !== ROWS.coreMissing.id)) assert.ok(findRows(effective, id).length > 0, 'core patch inserts no ' + id)
    assert.deepEqual(findRows(effective, ROWS.coreMissing.id), [], 'the old core-missing row is still inserted')
  })
  t('NOCORE-NOTICE', 'hosted', `core's notice row resolves ${NOTICE.field} to ${NOTICE.version} when the hosted child row is inserted`, async () => {
    const op = await noticeOp(sdk)
    assert.ok(op, 'core patch has no ' + NOTICE.row)
    assert.equal((await resolvedWith(sdk, op.config, { overlays: CHILD_OVERLAY }))?.[NOTICE.field], NOTICE.version)
  })
  t('NOCORE-NOTICE', 'standalone', `core's notice row resolves ${NOTICE.field} to undefined in a standalone DSH`, async () => {
    const op = await noticeOp(sdk)
    assert.ok(op, 'core patch has no ' + NOTICE.row)
    assert.equal((await resolvedWith(sdk, op.config, { overlays: [] }))?.[NOTICE.field], undefined)
  })
  t('NOCORE-GUARDS', 'intended', 'readIntendedGuards(): uiRows is empty and rows holds the UI guard ids as plain rows', async () => {
    const intended = (await coreIntendedReader(sdk))()
    assert.deepEqual(intended.uiRows, [])
    for (const id of ROWS.guards) assert.ok(intended.rows.includes(id), id + ' not in rows')
    assert.equal([...intended.rows].includes(NOTICE.row), false, 'the notice row is not a guard')
  })
  t('NOCORE-OLD', '(a)-(d)', 'the old "fishball-ui alone / core alone / UI selected or started" rows are gone', null,
    'fishball-ui is core\'s ./ui/ component since 117cb2a2: there is no DSH with fishball-ui but no core, and the UI rows are core\'s guards; the component rows above replace those decision tables')
}
