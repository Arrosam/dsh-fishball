/**
 * R-CORE black-box cases (v3-tasks.md W1 step 2, spec `test/v3-cases` at `fb1cbd2`):
 * HOST-UC-08 (the V2-mechanism part: a hosted child shows the generic panel; the hosted-only
 * sections left with fishball-hosted-settings, REMOVE-WD, design §1.0) and HOST-EP-03 rows 1–4, with the task's definition of done
 * ("hosted child behaves as before; no file exists in two packages; core and the instance never
 * import each other", PLAT-EP-07). Requirements R-HOST-11, R-ARCH-05, R-ARCH-08, R-HOST-04,
 * R-HOST-07, R-FB-01, R-BND-01.
 *
 * Techniques (the cases' own): Use Case for HOST-UC-08 (each test names its flow), EP for
 * HOST-EP-03 (each test names its row and partition), State Transition for the Restart round trip
 * (ready → restart requested → stopped → ready). PLAT-EP-07 rows 1, 2, 5, 6 and 7c and HOST-EP-03
 * rows 1–2 for the instance side are registered by test/v3/contract/package-boundaries/cases.mjs; they become active by
 * themselves once `packages/core` exists. Only what that file does not check is here.
 *
 * Levels: unit (static analysis of manifests, packed listings and source tokens; no product module
 * is loaded) and integration (a real host DSH with this checkout's instance, its real child, and a
 * scripted settings page fed by the child's own served bundles; page.mjs). No browser.
 *
 * "Behaves as before" was the V2 panel's public behaviour (docs/planning/v2-set.md). Requirements
 * 1.34 item 4 removed that panel, its Read Only line, its links and the settings-section point
 * (R-HOST-11 withdrawn): the rows that asserted them are registered as skipped with that reason
 * (../settings/withdrawn.mjs), and the rows whose requirement still holds point at core's own
 * settings page (F-SETTINGS, test/v3/fishball-core/settings). Rows that need a later task are
 * `todo` and name it.
 */
import assert from 'node:assert/strict'
import { WITHDRAWN_BY, withdrawnRow } from '../../dsh-instance/host/withdrawn.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, dshInspect } from '../../contract/package-boundaries/cases.mjs'
import { BUNDLED_FIELDS, DEP_FIELDS, DSH_FIELD, RUNTIME_DEP_FIELD, SDK, V3 } from '../../contract/package-boundaries/constants.mjs'
import { manifestNames, observe, readManifest } from '../../contract/package-boundaries/packages.mjs'
import {
  CHILD_SETTINGS, CORE, HTTP, LATER, MARK, MOVED, ROUTE, SLOT,
} from './constants.mjs'
import { hostedChildFor } from './hosted.mjs'
import { childRequest, openSettingsPage } from './page.mjs'
import { withdrawnCase } from '../settings/withdrawn.mjs'
import { corePatchFile, corePatchRows, describeRef, has, insertedRows, isModuleOf, ownFiles, tokensOf, unitOf } from './static.mjs'

const JS = /\.(?:c|m)?js$/
const HOME_LABEL = 'v3-r-core'

const needCore = () => assert.ok(has(V3.core), 'packages/core/package.json is missing (R-CORE (1))')
const coreManifest = () => { needCore(); return readManifest(V3.core.dir) }

const packageNamed = (name) => Object.values(V3).find((p) => p.name === name)

/** Shipped files of one package whose text is `source` (a served script is a shipped file as it is). */
async function shippedFileWith(name, source) {
  const { dir } = packageNamed(name)
  return ownFiles(await unitOf(name)).filter((f) => JS.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').trimEnd() === source)
}

/** Every shipped own JS file of every present V3 package that holds the exact string `value`. */
async function filesHolding(value) {
  const { units } = await observe()
  const found = []
  for (const unit of units.values()) {
    const pkg = packageNamed(unit.name)
    if (!unit.own || pkg === undefined) continue
    const tokens = await tokensOf(fs.realpathSync(pkg.dir), ownFiles(unit).filter((f) => JS.test(f)))
    for (const [file, t] of tokens) if (t.strings.includes(value)) found.push({ name: unit.name, file })
  }
  return found
}

// ---------------------------------------------------------------------------------------------
// One real hosted setup per SDK process (the integration rows share it).
// ---------------------------------------------------------------------------------------------

let readyChild

const describePlugins = (page) => JSON.stringify(page.plugins) + (page.errors.length ? ' errors: ' + page.errors.join(' | ') : '')

export function registerCoreCases(sdk) {
  readyChild = hostedChildFor(HOME_LABEL)

  // ================================================================ R-CORE (1): the package exists
  caseTest(sdk, 'HOST-EP-03', 1, 'fishball-core exists in packages/core and is a root workspace', () => {
    const manifest = coreManifest()
    assert.equal(manifest.name, V3.core.name)
    assert.ok(readManifest(path.dirname(path.dirname(V3.core.dir))).workspaces?.includes(CORE.workspace), 'root workspaces lack ' + CORE.workspace)
  })
  caseTest(sdk, 'HOST-EP-03', 1, "core manifest has a dsh bundle and a dsh.client entry (core's own settings page; fishball-ui is its own bundle since F-UI)", () => {
    const manifest = coreManifest()
    assert.ok(manifest[DSH_FIELD]?.bundle, 'no dsh.bundle')
    assert.ok(manifest[DSH_FIELD]?.client && typeof manifest[DSH_FIELD].client === 'object', 'no dsh.client entry')
  })
  caseTest(sdk, 'HOST-EP-03', 1, "DSH's own bundle inspection accepts fishball-core as a bundle", async () => {
    needCore()
    const answer = await dshInspect(sdk, V3.core.dir)
    assert.notEqual(answer.status, SDK.inspect.refused, JSON.stringify(answer))
    assert.equal(answer.bundle, true, JSON.stringify(answer))
    assert.equal(answer.name, V3.core.name, JSON.stringify(answer))
  })
  // The R-CORE snapshot "empty patch" ended with F-GUARDS, which adds the guard rows (design §5a.2,
  // R-FB-02, R-FB-12). What stays true for this row: the patch never brings the instance into core.
  caseTest(sdk, 'HOST-EP-03', 1, "core's cordis.patch.yml carries the F-GUARDS rows and inserts no row or module of the instance", async () => {
    needCore()
    assert.ok(fs.existsSync(corePatchFile()), 'packages/core/' + CORE.patchFile + ' is missing')
    const patches = await corePatchRows(sdk)
    assert.ok(Array.isArray(patches) && patches.length > 0, 'the patch is not a non-empty list (F-GUARDS adds the guard rows)')
    const inserted = insertedRows(patches)
    assert.deepEqual(inserted.filter((row) => CORE.neverInserted.includes(row?.id)).map((row) => row.id), [], 'core inserts these rows')
    assert.deepEqual(inserted.filter((row) => isModuleOf(row?.name, V3.instance)).map((row) => `${row.id}: ${row.name}`), [], 'core inserts modules of dsh-instance')
  })
  // SPLIT-SHARED (requirements 1.40): core's library is its own side's fishball-shared, never dsh-connector-shared.
  // Re-baselined (F-WIRE): "V2 was never deployed, so no V2 path needs protecting" (the user,
  // 2026-11-16; R-ARCH-10): core no longer depends on or peers dsh-connector.
  caseTest(sdk, 'HOST-EP-03', 1, 'core depends on fishball-shared (dependencies and bundleDependencies); never on the connector, the instance or dsh-connector-shared', () => {
    const manifest = coreManifest()
    assert.ok(Object.hasOwn(manifest[RUNTIME_DEP_FIELD] ?? {}, V3.shared.name), 'fishball-shared not in ' + RUNTIME_DEP_FIELD)
    assert.ok(BUNDLED_FIELDS.some((f) => (manifest[f] ?? []).includes(V3.shared.name)), 'fishball-shared not in ' + BUNDLED_FIELDS.join('/'))
    const named = manifestNames(manifest, DEP_FIELDS).map((e) => e.name)
    assert.equal(named.includes(V3.connector.name), false, 'core still names dsh-connector')
    assert.equal(named.includes(V3.instance.name), false, 'core names dsh-instance')
    assert.equal(manifestNames(manifest, [...DEP_FIELDS, ...BUNDLED_FIELDS]).some((e) => e.name === V3.dshShared.name), false, 'core names dsh-connector-shared')
  })
  // Re-baselined (F-WIRE, same decision): no module of core imports dsh-connector, ./contract included.
  caseTest(sdk, 'HOST-EP-03', 1, 'core imports nothing of dsh-connector (no ./contract either)', async () => {
    needCore()
    const unit = await unitOf(V3.core.name)
    assert.deepEqual(unit.parseErrors, [], 'unparsed shipped files')
    const other = unit.refs.filter((r) => r.target === V3.connector.name && !CORE.connectorAllowed.includes(r.specifier)).map(describeRef)
    assert.deepEqual(other, [])
  })

  // ================================================================ R-CORE (2): moved, not copied
  caseTest(sdk, 'HOST-EP-03', 1, 'the instance ships nothing of the moved code: child-web/**, src/slim/child/**, src/persona.js', async () => {
    const shipped = ownFiles(await unitOf(V3.instance.name))
    assert.deepEqual(shipped.filter((f) => MOVED.prefixes.some((p) => f.startsWith(p)) || MOVED.files.includes(f)), [])
  })
  // Re-baselined (F-WIRE): DESIGN.md §20 deletes `src/slim/**` and the V2 child rows ("V2 was never
  // deployed", the user, 2026-11-16), so the V2 slim child is no longer shipped by core; core ships no
  // file under src/slim/ and its patch inserts the main row beside the kept rows, and no slim row.
  caseTest(sdk, 'HOST-EP-03', 1, 'core ships no file under src/slim/ (DESIGN §20 deletes it)', async () => {
    needCore()
    assert.deepEqual(ownFiles(await unitOf(V3.core.name)).filter((f) => f.startsWith(CORE.retiredFolder)), [])
  })
  caseTest(sdk, 'HOST-EP-03', 1, `core's patch inserts ${CORE.mainRow.id} (${CORE.mainRow.name}) once beside ${CORE.keptRows.join(', ')}, and none of ${CORE.retiredRows.join(', ')}`, async () => {
    needCore()
    const inserted = insertedRows(await corePatchRows(sdk))
    const main = inserted.filter((row) => row?.id === CORE.mainRow.id)
    assert.equal(main.length, 1, 'main rows: ' + JSON.stringify(main))
    assert.equal(main[0].name, CORE.mainRow.name)
    for (const id of CORE.keptRows) assert.equal(inserted.filter((row) => row?.id === id).length, 1, id)
    assert.deepEqual(inserted.filter((row) => CORE.retiredRows.includes(row?.id)).map((row) => row.id), [])
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'no file exists in two packages: no shipped JS file of core is also shipped by the instance', async () => {
    needCore()
    const { units } = await observe()
    const instance = new Map([...units.get(V3.instance.name).digests].map(([f, digest]) => [digest, f]))
    const both = [...units.get(V3.core.name).digests].filter(([, digest]) => instance.has(digest)).map(([f, digest]) => `core/${f} = instance/${instance.get(digest)}`)
    assert.deepEqual(both, [])
  })

  // ================================================================ HOST-EP-03 row 2: the status line stays in the instance
  caseTest(sdk, 'HOST-EP-03', 2, 'the status-line module is shipped only by dsh-instance, as its settings page chunk client.status.js', async () => {
    const holders = await filesHolding(MARK.status)
    assert.ok(holders.length > 0, 'no V3 package ships the status line (' + MARK.status + ')')
    assert.deepEqual(holders.filter((h) => h.name !== V3.instance.name).map((h) => h.name + '/' + h.file), [], 'shipped outside the instance')
    // I-HOST (QD1 = B): the status line is the instance's settings page chunk at its root.
    assert.ok(holders.some((h) => h.file === CHILD_SETTINGS.statusFile), 'no ' + CHILD_SETTINGS.statusFile + ': ' + holders.map((h) => h.file).join(', '))
  })

  // ================================================================ HOST-EP-03 row 3: the extension point knows nothing about hosting
  // The generic slim panel and its settings-section point are removed (1.34 item 4, R-HOST-11
  // withdrawn); core's own settings page is F-SETTINGS' (test/v3/fishball-core/settings), and it
  // names the instance's child-side namespace on purpose (the hosted target line, its requirement 6).
  withdrawnCase(sdk, 'HOST-EP-03', 3, "core's generic settings panel exists (found by its page marker)")
  withdrawnCase(sdk, 'HOST-EP-03', 3, 'the generic panel and its extension point name nothing hosting-specific (no hosted flag, no instance names or types)')

  // ================================================================ HOST-EP-03 row 4: core's settings stay in core
  // Re-pointed from the slim panel's marker to core's own settings page marker (1.34 item 4: Fishball's
  // settings are on fishball-core's own page, so the instance ships none of it).
  caseTest(sdk, 'HOST-EP-03', 4, "the instance ships no settings page of core's (no file renders core's settings page marker)", async () => {
    const holders = await filesHolding(MARK.corePage)
    assert.deepEqual(holders.filter((h) => h.name === V3.instance.name).map((h) => h.file), [])
  })
  caseTest(sdk, 'HOST-EP-03', 4, 'the instance registers nothing in the panel header slot itself', async () => {
    const holders = await filesHolding(SLOT.header)
    assert.deepEqual(holders.filter((h) => h.name === V3.instance.name).map((h) => h.file), [])
  })
  // ================================================================ HOST-UC-08 (V2-mechanism part), integration
  // The slim panel with its Read Only line, Settings / Plugins links and header entry is removed
  // (1.34 item 4); core's own page and the two Fishball-page entries are F-SETTINGS' rows.
  withdrawnCase(sdk, 'HOST-UC-08', 'main 2', 'hosted child: the panel shows the generic settings (Read Only line, DSH Settings and Plugins links, header entry)')
  // Re-pointed from the slim panel's marker to core's own settings page marker: a hosted child's
  // settings page is still core's code (1.34 item 4; the same page in both modes, Q-B2).
  caseTest(sdk, 'HOST-UC-08', 'main 2', "hosted child: core's settings page is core's code (served files)", async (t) => {
    needCore()
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    await page.settled()
    const pageScripts = page.scripts.filter((s) => s.source.includes(MARK.corePage + "'") || s.source.includes(MARK.corePage + '"'))
    assert.ok(pageScripts.length > 0, "no served script renders core's settings page")
    for (const s of pageScripts) assert.ok((await shippedFileWith(V3.core.name, s.source)).length > 0, s.url + ' (' + s.id + ') is not a file of fishball-core')
  })
  // Re-pointed (R-HOST-07 still holds; the slim panel and its links are removed, 1.34 item 4): no
  // script the child serves carries a model-sync marker, the page makes no sync request, and the
  // child has no sync route.
  caseTest(sdk, 'HOST-UC-08', 'A4', 'hosted child: no served script carries a model-sync trigger, the page makes no sync request, and the child has no sync route (R-HOST-07)', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    await page.settled()
    assert.deepEqual(page.scripts.filter((s) => s.source.includes(MARK.modelPrefix)).map((s) => s.url), [], 'model-sync markers in served scripts')
    assert.deepEqual(page.requests.filter((r) => ROUTE.sync.includes(r.pathname)), [], 'the page requested a sync route')
    for (const route of ROUTE.sync) assert.equal((await childRequest(child, 'POST', route, '{}')).status, HTTP.notFound, 'the child answers ' + route)
    assert.deepEqual(page.failed(), [], 'failed plugins; plugins ' + describePlugins(page))
  })

  // HOST-EP-03 row 5 and the HOST-UC-08 postcondition "H shows no UI from the instance" are R-EMBED's: test/v3/contract/embed/cases.mjs.
  // ================================================================ later tasks
  caseTest(sdk, 'HOST-UC-08', 'A3', 'standalone: the same core package shows the generic settings only and reports nothing missing', null, LATER.standalone)
  withdrawnRow(sdk, 'HOST-UC-08', 'E1', 'fishball-core disabled: the sections do nothing and the child still starts (fishball-off)', WITHDRAWN_BY.offCode)
  caseTest(sdk, 'HOST-UC-08', 'e2e', 'the panel and the Plugins page in a browser', null, LATER.e2e)
}
