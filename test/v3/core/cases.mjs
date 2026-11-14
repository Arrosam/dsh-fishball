/**
 * R-CORE black-box cases (v3-tasks.md W1 step 2, spec `test/v3-cases` at `fb1cbd2`):
 * HOST-UC-08 (the V2-mechanism part: a hosted child shows the generic and the hosted sections; the
 * generic panel works with none) and HOST-EP-03 rows 1–4, with the task's definition of done
 * ("hosted child behaves as before; no file exists in two packages; core and the instance never
 * import each other", PLAT-EP-07). Requirements R-HOST-11, R-ARCH-05, R-ARCH-08, R-HOST-04,
 * R-HOST-07, R-FB-01, R-BND-01.
 *
 * Techniques (the cases' own): Use Case for HOST-UC-08 (each test names its flow), EP for
 * HOST-EP-03 (each test names its row and partition), State Transition for the Restart round trip
 * (ready → restart requested → stopped → ready). PLAT-EP-07 rows 1, 2, 5, 6 and 7c and HOST-EP-03
 * rows 1–2 for the instance side are registered by test/v3/shared/cases.mjs; they become active by
 * themselves once `packages/core` exists. Only what that file does not check is here.
 *
 * Levels: unit (static analysis of manifests, packed listings and source tokens; no product module
 * is loaded) and integration (a real host DSH with this checkout's instance, its real child, and a
 * scripted settings page fed by the child's own served bundles; page.mjs). No browser.
 *
 * "Behaves as before" is the V2 panel's public behaviour (docs/planning/v2-set.md): the panel, its
 * header entry, the Read Only line and the DSH Settings / Plugins links (generic), the status line
 * and Restart (hosted-only), and no model-sync control (R-HOST-07). Rows that need a later task are
 * `todo` and name it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { until } from '../../support/host.mjs'
import { lifecycleLines } from '../../support/v2-r2.mjs'
import { caseTest, dshInspect } from '../shared/cases.mjs'
import { BUNDLED_FIELDS, DEP_FIELDS, DSH_FIELD, RUNTIME_DEP_FIELD, SDK, V3 } from '../shared/constants.mjs'
import { manifestNames, observe, readManifest } from '../shared/packages.mjs'
import {
  BUDGET, CHILD_SETTINGS, CORE, HTTP, LATER, LIFECYCLE, MARK, MOVED, ROUTE, SLOT, STATE,
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
// One real hosted setup per SDK process (the integration rows share it; Restart runs last).
// ---------------------------------------------------------------------------------------------

let readyChild

/**
 * The graph entries the instance owns: entries whose own served script is a file of its
 * src/child-settings/. A chunk is never counted: leaving out its owner would leave out that
 * owner's own code too.
 */
async function hostedSectionEntries(page) {
  const owned = []
  for (const script of page.scripts.filter((s) => s.entry)) {
    const files = await shippedFileWith(V3.instance.name, script.source)
    if (files.some((f) => f.startsWith(CHILD_SETTINGS.folder))) owned.push(script.id)
  }
  return owned
}

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
  caseTest(sdk, 'HOST-EP-03', 1, "core's cordis.patch.yml carries the F-GUARDS rows and inserts no row or module of the instance or fishball-hosted-settings", async () => {
    needCore()
    assert.ok(fs.existsSync(corePatchFile()), 'packages/core/' + CORE.patchFile + ' is missing')
    const patches = await corePatchRows(sdk)
    assert.ok(Array.isArray(patches) && patches.length > 0, 'the patch is not a non-empty list (F-GUARDS adds the guard rows)')
    const inserted = insertedRows(patches)
    assert.deepEqual(inserted.filter((row) => CORE.neverInserted.includes(row?.id)).map((row) => row.id), [], 'core inserts these rows')
    assert.deepEqual(inserted.filter((row) => isModuleOf(row?.name, V3.instance)).map((row) => `${row.id}: ${row.name}`), [], 'core inserts modules of fishball-instance')
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'core depends on fishball-shared (dependencies and bundleDependencies) and on the connector; never on the instance', () => {
    const manifest = coreManifest()
    assert.ok(Object.hasOwn(manifest[RUNTIME_DEP_FIELD] ?? {}, V3.shared.name), 'fishball-shared not in ' + RUNTIME_DEP_FIELD)
    assert.ok(BUNDLED_FIELDS.some((f) => (manifest[f] ?? []).includes(V3.shared.name)), 'fishball-shared not in ' + BUNDLED_FIELDS.join('/'))
    const named = manifestNames(manifest, DEP_FIELDS).map((e) => e.name)
    assert.ok(named.includes(V3.connector.name), 'fishball-connector is named in no dependency field')
    assert.equal(named.includes(V3.instance.name), false, 'core names fishball-instance')
  })
  caseTest(sdk, 'HOST-EP-03', 1, 'core reaches the connector only through fishball-connector/contract', async () => {
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
  caseTest(sdk, 'HOST-EP-03', 2, 'the status-line module is shipped only by fishball-instance, under src/child-settings/', async () => {
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
  caseTest(sdk, 'HOST-EP-03', 4, 'hosted child: the main slot holds one settings panel and only it renders the hosted sections', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    assert.ok(page.panel, 'no main entry renders the settings panel; plugins ' + describePlugins(page))
    await page.waitFor(MARK.status)
    const elsewhere = []
    for (const name of [SLOT.main, SLOT.header]) {
      for (const entry of page.entriesOf(name)) {
        if (entry === page.panel) continue
        const tree = JSON.stringify(await page.renderAlone(entry))
        if (tree.includes(MARK.panel + '"') || tree.includes(MARK.status) || tree.includes(MARK.restart)) elsewhere.push(name + ': ' + JSON.stringify(entry.options))
      }
    }
    assert.deepEqual(elsewhere, [], 'a slot entry other than the panel renders the panel or a hosted section')
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
  caseTest(sdk, 'HOST-UC-08', 'main 2', 'hosted child: the panel shows the hosted sections inside it (status line with the child state, Restart)', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    assert.ok(page.panel, 'no settings panel; plugins ' + describePlugins(page))
    const status = await page.waitFor(MARK.status)
    assert.ok(status.length > 0, 'no status line in the panel')
    await until(() => page.byAttr(MARK.status).some((n) => n.props[MARK.status] === STATE.ready), BUDGET.readyMs, BUDGET.pollMs)
    assert.ok(page.byAttr(MARK.status).some((n) => n.props[MARK.status] === STATE.ready), 'the status line shows ready; saw ' + page.byAttr(MARK.status).map((n) => n.props[MARK.status]))
    assert.equal(page.byAttr(MARK.restart).length, 1, 'one Restart')
    assert.deepEqual(page.byAttr('role', MARK.roles.alert).map((n) => JSON.stringify(n.props)), [], 'no error shown')
  })
  caseTest(sdk, 'HOST-UC-08', 'main 2', "hosted child: the panel is core's code and the hosted sections are the instance's (served files)", async (t) => {
    needCore()
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    await page.waitFor(MARK.status)
    const panelScripts = page.scripts.filter((s) => s.source.includes(MARK.panel + "'") || s.source.includes(MARK.panel + '"'))
    assert.ok(panelScripts.length > 0, 'no served script renders the panel')
    for (const s of panelScripts) assert.ok((await shippedFileWith(V3.core.name, s.source)).length > 0, s.url + ' (' + s.id + ') is not a file of fishball-core')
    const statusScripts = page.scripts.filter((s) => s.source.includes(MARK.status))
    assert.ok(statusScripts.length > 0, 'no served script renders the status line')
    for (const s of statusScripts) {
      const files = await shippedFileWith(V3.instance.name, s.source)
      assert.ok(files.some((f) => f.startsWith(CHILD_SETTINGS.folder)), s.url + ' (' + s.id + ') is not a file of the instance under ' + CHILD_SETTINGS.folder + ': ' + files.join(', '))
    }
  })
  caseTest(sdk, 'HOST-UC-08', 'A4', 'hosted child: the panel has no model-sync trigger, makes no sync request, and the child has no sync route (R-HOST-07)', async (t) => {
    const { child } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    assert.ok(page.panel, 'no settings panel; plugins ' + describePlugins(page))
    await page.waitFor(MARK.status)
    assert.deepEqual(syncMarkers(page.tree()), [], 'model-sync markers in the panel')
    for (const target of MARK.openTargets) for (const node of page.byAttr(MARK.open, target)) await page.press(node)
    assert.deepEqual(syncMarkers(page.tree()), [], 'model-sync markers after using the links')
    assert.deepEqual(page.requests.filter((r) => ROUTE.sync.includes(r.pathname)), [], 'the panel requested a sync route')
    for (const route of ROUTE.sync) assert.equal((await childRequest(child, 'POST', route, '{}')).status, HTTP.notFound, 'the child answers ' + route)
  })
  caseTest(sdk, 'HOST-UC-08', 'generic, no section', 'the generic panel works with no hosted section registered: generic settings only, no error, no placeholder, no hosted request', async (t) => {
    const { child } = await readyChild(sdk)
    const probe = await openSettingsPage(t, { sdk, child })
    const hosted = await hostedSectionEntries(probe)
    assert.ok(hosted.length > 0, 'no served client entry is a file of the instance under ' + CHILD_SETTINGS.folder + '; entries: ' + probe.graph.map((e) => e.id).join(', '))
    const page = await openSettingsPage(t, { sdk, child, exclude: (entry) => hosted.includes(entry.id) })
    assert.ok(page.panel, 'no settings panel without the hosted sections; plugins ' + describePlugins(page))
    assert.equal(page.byAttr(MARK.readOnly).length, 1, 'the Read Only line is shown')
    assert.deepEqual(page.byAttr(MARK.open).map((n) => n.props[MARK.open]).sort(), [...MARK.openTargets].sort())
    assert.deepEqual([...page.byAttr(MARK.status), ...page.byAttr(MARK.restart)].map((n) => n.tag), [], 'a hosted section is shown')
    assert.deepEqual(page.byAttr('role').map((n) => n.props.role + ': ' + JSON.stringify(n.children)), [], 'a notice, status or error placeholder is shown')
    assert.deepEqual(page.requests.filter((r) => r.pathname.startsWith(ROUTE.instancePrefix)).map((r) => r.method + ' ' + r.pathname), [], 'the generic panel called a hosted route')
    assert.deepEqual(page.failed(), [], 'failed plugins')
    assert.deepEqual(page.errors, [], 'page console errors')
  })
  caseTest(sdk, 'HOST-UC-08', 'main 3', 'hosted child (ST ready → Restart → stopped → ready): Restart in the hosted section travels to the host, which restarts the child', async (t) => {
    const { child, home, host } = await readyChild(sdk)
    const page = await openSettingsPage(t, { sdk, child })
    await page.waitFor(MARK.status)
    const [restart] = page.byAttr(MARK.restart)
    assert.ok(restart, 'no Restart in the panel')
    const before = lifecycleLines(home).length
    await page.press(restart)
    let codes = []
    const stoppedThenReady = () => {
      codes = lifecycleLines(home).slice(before).map((l) => l.json.code)
      const stop = codes.indexOf(LIFECYCLE.stop)
      return stop >= 0 && codes.indexOf(LIFECYCLE.ready, stop) > stop
    }
    await until(stoppedThenReady, BUDGET.restartMs, BUDGET.pollMs)
    assert.ok(stoppedThenReady(), 'the host did not stop and start the child again; lifecycle after the press: ' + codes.join(', '))
    let status
    await until(async () => { status = (await host.get(ROUTE.status)).json; return status?.state === STATE.ready }, BUDGET.restartMs, BUDGET.pollMs)
    assert.equal(status?.state, STATE.ready, 'the host reports the child ready again')
  })
  caseTest(sdk, 'HOST-UC-08', 'main 3', 'a change in a hosted-only section is saved by the instance', null, LATER.saved)

  // HOST-EP-03 row 5 and the HOST-UC-08 postcondition "H shows no UI from the instance" are R-EMBED's: test/v3/embed/cases.mjs.
  // ================================================================ later tasks
  caseTest(sdk, 'HOST-UC-08', 'A3', 'standalone: the same core package shows the generic settings only and reports nothing missing', null, LATER.standalone)
  caseTest(sdk, 'HOST-UC-08', 'E1', 'fishball-core disabled: the sections do nothing and the child still starts (fishball-off)', null, LATER.host)
  caseTest(sdk, 'HOST-UC-08', 'E2', "core's guards never disable fishball-hosted-settings; guards-overridden never names it", null, LATER.guards)
  caseTest(sdk, 'HOST-UC-08', 'e2e', 'the panel and the Plugins page in a browser', null, LATER.e2e)
}
