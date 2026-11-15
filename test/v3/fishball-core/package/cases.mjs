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
 * "Behaves as before" is the V2 panel's public behaviour (docs/planning/v2-set.md): the panel, its
 * header entry, the Read Only line and the DSH Settings / Plugins links (generic), and no
 * model-sync control (R-HOST-07). Rows that need a later task are
 * `todo` and name it.
 */
import assert from 'node:assert/strict'
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
import { corePatchFile, corePatchRows, describeRef, has, hostingTokens, insertedRows, isModuleOf, ownFiles, panelFiles, tokensOf, unitOf } from './static.mjs'

const JS = /\.(?:c|m)?js$/
const HOME_LABEL = 'v3-r-core'
/** The V2 slim child at the R-SHARED commit this task starts from (the module list R-CORE moves). */
const BASE = Object.freeze({ commit: '5c8dbdb', slimChild: 'packages/instance/src/slim/child/' })

const needCore = () => assert.ok(has(V3.core), 'packages/core/package.json is missing (R-CORE (1))')
const coreManifest = () => { needCore(); return readManifest(V3.core.dir) }

const packageNamed = (name) => Object.values(V3).find((p) => p.name === name)

/** Shipped files of one package whose text is `source` (a served script is a shipped file as it is). */
async function shippedFileWith(name, source) {
  const { dir } = packageNamed(name)
  return ownFiles(await unitOf(name)).filter((f) => JS.test(f) && fs.readFileSync(path.join(dir, f), 'utf8').trimEnd() === source)
}

/** Every model-sync marker (R-HOST-07: data-fishball-model-*) in a rendered tree. */
const syncMarkers = (tree) => JSON.stringify(tree).match(new RegExp('"' + MARK.modelPrefix + '[\\w-]*"', 'g')) ?? []

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

/** The V2 slim child's module names, from Git at the task's base commit (the input R-CORE moves). */
async function slimChildModules() {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout } = await promisify(execFile)('git', ['ls-tree', '--name-only', BASE.commit, BASE.slimChild], { cwd: V3.instance.dir })
  return stdout.split('\n').filter((f) => JS.test(f)).map((f) => path.posix.basename(f))
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
  caseTest(sdk, 'HOST-EP-03', 1, 'core manifest has a dsh bundle and a dsh.client entry (fishball-ui ships with core, R-FB-01)', () => {
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
  caseTest(sdk, 'HOST-EP-03', 1, 'core depends on fishball-shared (dependencies and bundleDependencies) and on the connector; never on the instance or dsh-connector-shared', () => {
    const manifest = coreManifest()
    assert.ok(Object.hasOwn(manifest[RUNTIME_DEP_FIELD] ?? {}, V3.shared.name), 'fishball-shared not in ' + RUNTIME_DEP_FIELD)
    assert.ok(BUNDLED_FIELDS.some((f) => (manifest[f] ?? []).includes(V3.shared.name)), 'fishball-shared not in ' + BUNDLED_FIELDS.join('/'))
    const named = manifestNames(manifest, DEP_FIELDS).map((e) => e.name)
    assert.ok(named.includes(V3.connector.name), 'dsh-connector is named in no dependency field')
    assert.equal(named.includes(V3.instance.name), false, 'core names dsh-instance')
    assert.equal(manifestNames(manifest, [...DEP_FIELDS, ...BUNDLED_FIELDS]).some((e) => e.name === V3.dshShared.name), false, 'core names dsh-connector-shared')
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'core reaches the connector only through dsh-connector/contract', async () => {
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
  caseTest(sdk, 'HOST-EP-03', 1, 'core ships every module of the V2 slim child (by name) and the persona', async () => {
    needCore()
    const names = new Set(ownFiles(await unitOf(V3.core.name)).map((f) => path.posix.basename(f)))
    const expected = [...await slimChildModules(), ...MOVED.files.map((f) => path.posix.basename(f))]
    assert.deepEqual(expected.filter((n) => !names.has(n)), [], 'core does not ship these moved modules')
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'no file exists in two packages: no shipped JS file of core is also shipped by the instance', async () => {
    needCore()
    const { units } = await observe()
    const instance = new Map([...units.get(V3.instance.name).digests].map(([f, digest]) => [digest, f]))
    const both = [...units.get(V3.core.name).digests].filter(([, digest]) => instance.has(digest)).map(([f, digest]) => `core/${f} = instance/${instance.get(digest)}`)
    assert.deepEqual(both, [])
  })

  // ================================================================ HOST-EP-03 row 2: the status line stays in the instance
  caseTest(sdk, 'HOST-EP-03', 2, 'the status-line module is shipped only by dsh-instance, under src/child-settings/', async () => {
    const holders = await filesHolding(MARK.status)
    assert.ok(holders.length > 0, 'no V3 package ships the status line (' + MARK.status + ')')
    assert.deepEqual(holders.filter((h) => h.name !== V3.instance.name).map((h) => h.name + '/' + h.file), [], 'shipped outside the instance')
    assert.ok(holders.some((h) => h.file.startsWith(CHILD_SETTINGS.folder)), 'no status-line file under ' + CHILD_SETTINGS.folder + ': ' + holders.map((h) => h.file).join(', '))
  })

  // ================================================================ HOST-EP-03 row 3: the extension point knows nothing about hosting
  caseTest(sdk, 'HOST-EP-03', 3, "core's generic settings panel exists (found by its page marker)", async () => {
    needCore()
    assert.ok((await panelFiles()).length > 0, 'no shipped core file renders ' + MARK.panel)
  })
  caseTest(sdk, 'HOST-EP-03', 3, 'the generic panel and its extension point name nothing hosting-specific (no hosted flag, no instance names or types)', async () => {
    needCore()
    const files = await panelFiles()
    assert.ok(files.length > 0, 'no shipped core file renders ' + MARK.panel)
    assert.deepEqual(files.filter((f) => f.error).map((f) => f.file + ': ' + f.error), [], 'unparsed panel files')
    assert.deepEqual(files.flatMap((f) => hostingTokens(f).map((hit) => f.file + ': ' + hit)), [])
  })

  // ================================================================ HOST-EP-03 row 4: sections only through the extension point
  caseTest(sdk, 'HOST-EP-03', 4, 'the instance ships no settings panel of its own (no file renders the generic panel marker)', async () => {
    const holders = await filesHolding(MARK.panel)
    assert.deepEqual(holders.filter((h) => h.name === V3.instance.name).map((h) => h.file), [])
  })
  caseTest(sdk, 'HOST-EP-03', 4, 'the instance registers nothing in the panel header slot itself', async () => {
    const holders = await filesHolding(SLOT.header)
    assert.deepEqual(holders.filter((h) => h.name === V3.instance.name).map((h) => h.file), [])
  })
  // ================================================================ HOST-UC-08 (V2-mechanism part), integration
  caseTest(sdk, 'HOST-UC-08', 'main 2', 'hosted child: the panel shows the generic settings (Read Only line, DSH Settings and Plugins links, header entry)', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    assert.ok(page.panel, 'no settings panel; plugins ' + describePlugins(page))
    assert.equal(page.byAttr(MARK.readOnly).length, 1, 'one Read Only line')
    assert.deepEqual(page.byAttr(MARK.open).map((n) => n.props[MARK.open]).sort(), [...MARK.openTargets].sort())
    const headers = []
    for (const entry of page.header) headers.push(JSON.stringify(await page.renderAlone(entry)))
    assert.ok(headers.some((h) => h.includes(MARK.entry)), 'no header entry opens the panel')
    assert.deepEqual(page.failed(), [], 'failed plugins')
  })
  // The hosted-only sections (status line, Restart) left with fishball-hosted-settings (REMOVE-WD,
  // design §1.0); a hosted child's panel is core's generic panel alone.
  caseTest(sdk, 'HOST-UC-08', 'main 2', "hosted child: the panel is core's code (served files)", async (t) => {
    needCore()
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    await page.settled()
    const panelScripts = page.scripts.filter((s) => s.source.includes(MARK.panel + "'") || s.source.includes(MARK.panel + '"'))
    assert.ok(panelScripts.length > 0, 'no served script renders the panel')
    for (const s of panelScripts) assert.ok((await shippedFileWith(V3.core.name, s.source)).length > 0, s.url + ' (' + s.id + ') is not a file of fishball-core')
  })
  caseTest(sdk, 'HOST-UC-08', 'A4', 'hosted child: the panel has no model-sync trigger, makes no sync request, and the child has no sync route (R-HOST-07)', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    assert.ok(page.panel, 'no settings panel; plugins ' + describePlugins(page))
    await page.settled()
    assert.deepEqual(syncMarkers(page.tree()), [], 'model-sync markers in the panel')
    for (const target of MARK.openTargets) for (const node of page.byAttr(MARK.open, target)) await page.press(node)
    assert.deepEqual(syncMarkers(page.tree()), [], 'model-sync markers after using the links')
    assert.deepEqual(page.requests.filter((r) => ROUTE.sync.includes(r.pathname)), [], 'the panel requested a sync route')
    for (const route of ROUTE.sync) assert.equal((await childRequest(child, 'POST', route, '{}')).status, HTTP.notFound, 'the child answers ' + route)
  })

  // HOST-EP-03 row 5 and the HOST-UC-08 postcondition "H shows no UI from the instance" are R-EMBED's: test/v3/contract/embed/cases.mjs.
  // ================================================================ later tasks
  caseTest(sdk, 'HOST-UC-08', 'A3', 'standalone: the same core package shows the generic settings only and reports nothing missing', null, LATER.standalone)
  caseTest(sdk, 'HOST-UC-08', 'E1', 'fishball-core disabled: the sections do nothing and the child still starts (fishball-off)', null, LATER.host)
  caseTest(sdk, 'HOST-UC-08', 'e2e', 'the panel and the Plugins page in a browser', null, LATER.e2e)
}
