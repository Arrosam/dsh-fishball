/**
 * CHILD-PLUGINS, fishball-core's part that core's own patch decides (DESIGN.md §28 R1): in an
 * instance-run child (the instance's child-side row `dsh-instance-child` is in a launch overlay)
 * fishball-child-plugins runs and fishball-recommend-plugins does not; standalone (no such overlay
 * row) the reverse. Level: integration, offline: the current DSH's dsh-app-boot composes its shipped
 * bundles, core's cordis.patch.yml and the launch overlay files (loadOverlayPatches, composeEntries);
 * each row's `disabled` is resolved by DSH's own loader (cordis-plugin-loader interpolate) against a
 * real cordis Context providing `profileContext` whose `overlays` are those parsed overlays.
 * Nothing of fishball-ui is loaded: only core's patch names the two rows.
 *
 * | Case | Technique | Input | Expected |
 * |---|---|---|---|
 * | CP-R1-01 | DT rule 1, EP | no launch overlay | child off, recommend on |
 * | CP-R1-02 | DT rule 2, EP | one overlay inserting dsh-instance-child | child on, recommend off |
 * | CP-R1-03 | EP | overlay inserting only an unrelated row | standalone |
 * | CP-R1-04 | EP | the child row among others (last) | instance-run |
 * | CP-R1-05 | EP | two overlay files, only the second inserts the child row | instance-run |
 * | CP-R1-06 | BVA (empty) | an overlay file with no patch | standalone |
 * | CP-R1-07 | BVA (near miss), 4 rows | dsh-instance, dsh-instance-child-extra, xdsh-instance-child, upper case | standalone |
 * | CP-R1-08 | BVA (no context) | no profileContext (not a dsh-launched profile) | standalone |
 * | CP-R1-09 | EP (exclusive) | both modes | each row composed once; exactly one of the two on |
 */
import assert from 'node:assert/strict'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { caseTest } from 'fishball-test-helpers/cases'
import { composedWith, corePatchRows, findRows, patchOf, resolvedWith } from '../support/core-static.mjs'
import { ROWS, SCRATCH } from './constants.mjs'

const json = (value) => JSON.stringify(value)
/** One launch overlay file's text: a patch inserting the given row ids. */
const overlayYaml = (ids) => SCRATCH.insertHead + ids.map((id) => '    - { id: ' + id + ', name: ' + ROWS.moduleName + ' }\n').join('')

/** A scratch folder removed when the case ends (guarded: only one this helper created). */
async function scratch(t) {
  const tmp = await realpath(os.tmpdir())
  const dir = await mkdtemp(path.join(tmp, SCRATCH.prefix))
  t.after(async () => {
    if (path.dirname(dir) !== tmp || !path.basename(dir).startsWith(SCRATCH.prefix)) throw new Error('unexpected temp dir ' + dir)
    await rm(dir, { recursive: true, force: true })
  })
  return dir
}

/**
 * The profile DSH composes for a launch with these overlay files (each a list of inserted row ids;
 * [] is an overlay file inserting nothing), and the two rows' effective state ('on' = the row runs).
 */
async function launch(t, overlayFiles, { noProfileContext = false } = {}) {
  const dir = await scratch(t)
  const overlays = []
  for (const [i, ids] of overlayFiles.entries()) {
    const file = i + '-' + SCRATCH.overlayFile
    await writeFile(path.join(dir, file), ids.length === 0 ? SCRATCH.empty : overlayYaml(ids))
    overlays.push(await patchOf(dir, file))
  }
  const rows = await composedWith(await corePatchRows(), ...overlays)
  const context = noProfileContext ? null : { startedBundles: Object.freeze([]), overlays: Object.freeze(overlays.flat()) }
  const effective = async (id) => {
    const found = findRows(rows, id)
    const on = await Promise.all(found.map(async (row) => !(await resolvedWith(row.disabled, context))))
    return { count: found.length, on: on.length === 1 ? on[0] : on }
  }
  const [child, recommend] = await Promise.all([effective(ROWS.child), effective(ROWS.recommend)])
  return { on: { child: child.on, recommend: recommend.on }, count: { child: child.count, recommend: recommend.count } }
}

export function registerChildPluginCases() {
  const mode = (on) => ({ child: on, recommend: !on })
  const INSTANCE_RUN = mode(true)
  const STANDALONE = mode(false)
  const r1 = [
    ['01', 'no launch overlay', [], STANDALONE],
    ['02', 'one overlay inserting dsh-instance-child', [[ROWS.instanceChild]], INSTANCE_RUN],
    ['03', 'an overlay inserting only an unrelated row', [[ROWS.other]], STANDALONE],
    ['04', 'the child row among other inserted rows', [[ROWS.other, ROWS.instanceChild]], INSTANCE_RUN],
    ['05', 'two overlay files, the second inserts the child row', [[ROWS.other], [ROWS.instanceChild]], INSTANCE_RUN],
    ['06', 'an overlay file with no patch', [[]], STANDALONE],
  ]
  for (const [row, title, overlays, expected] of r1) {
    caseTest('CP-R1-' + row, 'mode', title, async (t) => {
      const { on } = await launch(t, overlays)
      assert.deepEqual(on, expected, title + ': ' + json(on))
    })
  }
  for (const id of ROWS.nearMisses) {
    caseTest('CP-R1-07', id, 'an overlay row id next to dsh-instance-child is standalone', async (t) => {
      const { on } = await launch(t, [[id]])
      assert.deepEqual(on, STANDALONE, id + ': ' + json(on))
    })
  }
  caseTest('CP-R1-08', 'no profileContext', 'a context outside a dsh-launched profile is standalone', async (t) => {
    const { on } = await launch(t, [], { noProfileContext: true })
    assert.deepEqual(on, STANDALONE, json(on))
  })
  caseTest('CP-R1-09', 'exclusive', 'each row is composed once and exactly one of them runs, in both modes', async (t) => {
    for (const overlays of [[], [[ROWS.instanceChild]]]) {
      const { on, count: n } = await launch(t, overlays)
      assert.deepEqual(n, { child: 1, recommend: 1 }, 'composed rows ' + json(n))
      assert.notEqual(on.child, on.recommend, json(on))
    }
  })
}
