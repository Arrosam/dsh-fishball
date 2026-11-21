/**
 * R-EMBED black-box cases (v3-tasks.md W1 step 3, spec `test/v3-cases` at `b1295de`; S4 `b9809b7`):
 * PLAT-EP-03 rows 1, 3 and 5, HOST-EP-03 row 5, HOST-UC-08's postcondition "H shows no UI from the
 * instance", and the task's definition of done (the main DSH boots with C + I + U and with C + I
 * alone with no client-loader error; the same UI renders from embed-UI on both SDKs; the hosted
 * child starts and still shows its status line). Requirements R-ARCH-01, R-ARCH-03, R-ARCH-04,
 * R-ARCH-05, R-ARCH-06, R-HOST-11, R-FB-01, R-COMPAT-01; design §4.2, §9.1.
 *
 * Techniques: EP (PLAT-EP-03 and HOST-EP-03 rows; each test names its row and partition) and a
 * decision table over the installed set for the boots (C + I + U → Fishball UI only from embed-UI;
 * C + I → no Fishball UI and no client-loader error).
 *
 * Levels: unit (manifests, packed listings, import specifiers and source tokens; DSH's own bundle
 * inspection; the instance's child-code copy into a throwaway profile, which launches nothing) and
 * integration (a real host DSH, its child, and a scripted main page fed by the host's served
 * bundles; page.mjs). Integration rows are written here and run at integration only
 * (FBTEST_V3_INTEGRATION=1). No browser. Rows a later task owns are `todo` and name it.
 */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { after } from 'node:test'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { REPO, TEST_HOMES } from '../../../../../../test/support/constants.mjs'
import { bootHost, newHome, until } from '../../../../../../test/support/host.mjs'
import { BUDGET, ROUTE, STATE, runtimeOf } from '../../../../../../test/v3/fishball-core/package/constants.mjs'
import { withdrawnCase } from '../../../../../../test/support/withdrawn.mjs'
import { WITHDRAWN_BY, withdrawnRow } from '../../../../../../test/v3/dsh-instance/host/withdrawn.mjs'
import { describeRef, has, ownFiles, tokensOf, unitOf } from '../../../../../../test/v3/fishball-core/package/static.mjs'
import { caseTest, dshInspect, integrationCase as gatedCase } from '../../../../../../test/v3/contract/package-boundaries/cases.mjs'
import { DSH_FIELD, JS_FILE, NPM, SDK, V3 } from '../../../../../../test/v3/contract/package-boundaries/constants.mjs'
import { npmTempRoot, observe, readManifest } from '../../../../../../test/v3/contract/package-boundaries/packages.mjs'
import {
  BASE, CARD_SLOTS, CHILD_COPY, CONNECTOR_CLIENT, GIT, CLIENT_LOADER_ERROR, EMBED, EMBED_WORDS, EXPECTED_MARKS, EXPECTED_UI, FIELD, FISHBALL_PREFIX, HOST_SLOTS,
  INTEGRATION, LATER, WINDOW_UI, matchesExpected,
} from './constants.mjs'
import { hostGraph, openMainPage } from './page.mjs'

const run = promisify(execFile)
const FISHBALL_ENTRY = (id) => id.startsWith(FISHBALL_PREFIX)

const needEmbed = () => { const m = readManifest(V3.embed.dir); assert.ok(m, EMBED.workspace + '/package.json is missing (R-EMBED (1))'); return m }
const manifestOf = (pkg) => { const m = readManifest(pkg.dir); assert.ok(m, path.relative(REPO, pkg.dir) + '/package.json is missing'); return m }
const exportKeys = (manifest) => (manifest.exports && typeof manifest.exports === 'object' ? Object.keys(manifest.exports) : [])

/** The V2 main clients' inject lists at the task's base commit (design §9.1: embed-UI combines them). */
async function baseInjects() {
  const lists = []
  for (const file of BASE.manifests) {
    const { stdout } = await run('git', ['show', BASE.commit + ':' + file], { cwd: REPO })
    lists.push(...(JSON.parse(stdout)[DSH_FIELD]?.client?.inject ?? []))
  }
  return [...new Set(lists)]
}

/** Shipped own JS files of one unit with their tokens. */
async function unitTokens(pkg) {
  const unit = await unitOf(pkg.name)
  assert.ok(unit, pkg.name + ' is not packed')
  // A package's own tests/ folder is not shipped code: since the packages moved under their parent
  // (df9d83d) the nested package packs its tests too, and the forbidden words occur in the cases.
  return tokensOf(fs.realpathSync(pkg.dir), ownFiles(unit).filter((f) => JS_FILE.test(f) && !f.split('/').includes('tests')))
}

/** Run `fn` only at integration: it boots a host DSH and launches a child (see INTEGRATION). */
const integrationCase = (sdk, id, row, title, fn) => gatedCase(sdk, id, row, title, fn, INTEGRATION)

// ---------------------------------------------------------------------------------------------
// Real hosts, one per installed set and SDK process (integration rows only).
// ---------------------------------------------------------------------------------------------

const SETS = Object.freeze({
  /** C + I + U: embed-UI linked into the profile beside the connector and the instance the harness always links. */
  full: Object.freeze({ label: 'cIU', link: Object.freeze([{ name: V3.embed.name, dir: V3.embed.dir, enabled: true }]) }),
  /** C + I alone. */
  noEmbed: Object.freeze({ label: 'cI', link: Object.freeze([]) }),
})
const hosts = new Map()
function hostWith(sdk, set) {
  if (!hosts.has(set)) {
    hosts.set(set, (async () => {
      // Canonical and outside the checkout: the child refuses a non-canonical main home and a Git ancestor.
      const home = fs.realpathSync(newHome(INTEGRATION.homeLabel + '-' + set.label))
      const host = await bootHost(home, { env: { FBTEST_DSH_RUNTIME: runtimeOf(sdk), FBTEST_LINK: JSON.stringify(set.link) } })
      let status
      await until(async () => { status = (await host.get(ROUTE.status)).json; return status?.state === STATE.ready || status?.state === STATE.failed }, BUDGET.readyMs, BUDGET.pollMs)
      return { home, host, status }
    })())
  }
  return hosts.get(set)
}
const loaderErrors = (host) => host.output.split('\n').filter((line) => line.includes(CLIENT_LOADER_ERROR))

export function registerEmbedCases(sdk) {
  after(async () => {
    for (const pending of hosts.values()) {
      const setup = await pending.catch(() => undefined)
      await setup?.host.stop().catch(() => {})
      // Guard the one recursive delete: a home this file created directly under the test-homes root.
      if (setup && path.dirname(setup.home) === fs.realpathSync(TEST_HOMES) && path.basename(setup.home).startsWith(INTEGRATION.homeLabel)) fs.rmSync(setup.home, { recursive: true, force: true })
    }
  })

  // ================================================================ R-EMBED (1): the minimal package
  caseTest(sdk, 'R-EMBED', '(1)', `dsh-connector-ui exists in ${EMBED.workspace} (lowercase name, S4-Q3) inside the connector's root workspace`, () => {
    const manifest = needEmbed()
    assert.equal(manifest.name, V3.embed.name)
    assert.ok(readManifest(REPO).workspaces?.includes(EMBED.workspaceRoot), 'root workspaces lack ' + EMBED.workspaceRoot)
  })
  caseTest(sdk, 'R-EMBED', '(1)', 'the embed-UI manifest has a version, engines.dsh and a web dsh.client entry with a ./client export', () => {
    const manifest = needEmbed()
    assert.equal(typeof manifest.version, 'string', 'no version')
    assert.equal(typeof manifest[FIELD.engines]?.dsh, 'string', 'no engines.dsh')
    assert.equal(manifest[DSH_FIELD]?.client?.platform, EMBED.platform, 'no dsh.client with platform web')
    assert.ok(exportKeys(manifest).includes(EMBED.clientExport), 'no ' + EMBED.clientExport + ' export')
  })
  caseTest(sdk, 'R-EMBED', '(1)', "embed-UI declares no dsh-instance peer (the instance split into the dsh-fishball-instance repository, 6b7c53bf), and every Fishball peer it names is optional", () => {
    const manifest = needEmbed()
    const peers = Object.keys(manifest[FIELD.peers] ?? {})
    assert.ok(!peers.includes(V3.instance.name), 'dsh-instance is still a peer')
    const required = peers.filter((p) => p.startsWith(FISHBALL_PREFIX) && manifest[FIELD.peersMeta]?.[p]?.optional !== true)
    assert.deepEqual(required, [], 'Fishball peers not marked optional in ' + FIELD.peersMeta)
  })
  // V2 never deployed (U-WIRE): V2 injection union is not a V3 requirement.
  withdrawnRow(sdk, 'R-EMBED', '(1)', 'V2 client injection union', 'V2 never deployed (U-WIRE)')

  // ================================================================ R-EMBED (2): the moved client
  // Q-G4 = A: client.records.js is no longer one of the shipped parts.
  // I-HOST (QD1 = B): client.instance.js left embed-UI (it is the instance's client.models.js), so the shipped parts are the three U-SHELL ones.
  // DESIGN.md §28 (2026-11-20, R2): client.marks.js left embed-UI; it is the connector's chunk now.
  caseTest(sdk, 'R-EMBED', '(2)', "embed-UI ships the moved client as flat chunks beside its entry: src/client/client.js and U-SHELL's parts client.shell.js, client.attention.js; no client.marks.js (DESIGN.md §28)", async () => {
    needEmbed()
    const files = ownFiles(await unitOf(V3.embed.name))
    for (const file of [EMBED.clientEntry, ...Object.values(EMBED.clientChunks)]) assert.ok(files.includes(file), 'not shipped: ' + file)
    assert.deepEqual(files.filter((f) => path.posix.basename(f) === CONNECTOR_CLIENT.marksChunk), [], 'embed-UI still ships ' + CONNECTOR_CLIENT.marksChunk)
  })
  caseTest(sdk, 'R-EMBED', '(2) marks', "the connector packs the marks part (client.marks.js beside client.js) and its shipped code names every marks slot (DESIGN.md §28, R1)", async () => {
    const { packed } = await observe()
    assert.ok(packed[V3.connector.name].includes(CONNECTOR_CLIENT.marksChunk), CONNECTOR_CLIENT.marksChunk + ' is not packed')
    const strings = new Set([...(await unitTokens(V3.connector)).values()].flatMap((t) => t.strings))
    assert.deepEqual(EXPECTED_MARKS.flatMap((e) => [e.slot, e.id]).filter((s) => !strings.has(s)), [], 'marks slots or ids missing from the connector')
  })
  caseTest(sdk, 'R-EMBED', '(2)', "the moved connector UI (U-SHELL's client parts) carries the V2 contributions' slots", async () => {
    needEmbed()
    const tokens = await unitTokens(V3.embed)
    const connector = new Set(Object.values(EMBED.clientChunks).flatMap((file) => tokens.get(file)?.strings ?? []))
    assert.deepEqual([...EXPECTED_UI, ...WINDOW_UI].map((e) => e.slot).filter((slot) => !connector.has(slot)), [], 'slots missing from the moved connector UI')
  })
  withdrawnRow(sdk, 'R-EMBED', '(2)', 'the moved instance card (client.instance.js) names a Plugins card slot', WITHDRAWN_BY.page)
  withdrawnRow(sdk, 'R-EMBED', '(2)', 'the instance exports its status-line module from src/child-settings/ (its one owner)', WITHDRAWN_BY.page)
  withdrawnRow(sdk, 'R-EMBED', '(2)', 'embed-UI reaches the status line through a committed relative symlink to the file a dsh-instance export names (src/child-settings/)', WITHDRAWN_BY.page)
  caseTest(sdk, 'R-EMBED', '(2)', 'no shipped JS file of embed-UI is a byte copy of a file the instance or the connector ships (moved, one owner)', async () => {
    needEmbed()
    const { units } = await observe()
    const own = units.get(V3.embed.name).digests
    const copies = []
    for (const name of [V3.connector.name]) {
      const other = new Map([...units.get(name).digests].map(([f, d]) => [d, f]))
      for (const [f, d] of own) if (other.has(d)) copies.push(`embed-ui/${f} = ${name}/${other.get(d)}`)
    }
    assert.deepEqual(copies, [])
  })

  // ================================================================ R-EMBED (3) = PLAT-EP-03 row 1, HOST-EP-03 row 5
  // Repointed at C-WIRE-2: by design §5.9 (requirements 1.28 R2, R-ARCH-03 amended) the connector has its
  // own settings page, client.js registering only plugins.bundle.config. The rows now say that is its only
  // client registration, and that the V2 records part (./records, client.records.js) stays gone.
  caseTest(sdk, 'PLAT-EP-03', 1, "the connector manifest's only dsh.client is its settings page (platform web, ./client = client.js); no ./records export", () => {
    const manifest = manifestOf(V3.connector)
    assert.equal(manifest[DSH_FIELD]?.client?.platform, CONNECTOR_CLIENT.platform, 'dsh.client: ' + JSON.stringify(manifest[DSH_FIELD]?.client))
    const target = manifest.exports?.[CONNECTOR_CLIENT.exportKey]
    assert.equal(path.posix.basename(String(typeof target === 'string' ? target : target?.default)), CONNECTOR_CLIENT.entry)
    assert.deepEqual(exportKeys(manifest).filter((k) => CONNECTOR_CLIENT.goneExports.includes(k)), [])
  })
  caseTest(sdk, 'PLAT-EP-03', 1, 'the connector packs its settings page client.js and no client.records.js', async () => {
    const { packed } = await observe()
    assert.ok(packed[V3.connector.name].includes(CONNECTOR_CLIENT.entry), 'client.js is not packed')
    assert.deepEqual(packed[V3.connector.name].filter((f) => CONNECTOR_CLIENT.goneFiles.includes(f)), [])
  })
  // DESIGN.md §28 (R1): the marks part is the connector's too, so its slots join the settings page's.
  caseTest(sdk, 'PLAT-EP-03', 1, `the connector's shipped code names no host-DSH slot but ${CONNECTOR_CLIENT.slot} (its settings page) and the marks part's slots`, async () => {
    const allowed = new Set([CONNECTOR_CLIENT.slot, ...EXPECTED_MARKS.map((e) => e.slot), 'sidebar.session.row.trailing'])
    const slots = []
    for (const [file, t] of await unitTokens(V3.connector)) for (const s of t.strings) if (HOST_SLOTS.includes(s) && !allowed.has(s)) slots.push(file + ': ' + s)
    assert.deepEqual(slots, [])
  })
  // R-ARCH-05 amended by 1.33 / QD1 = B: the instance's only browser code is its own settings page, so these rows are withdrawn.
  withdrawnRow(sdk, 'HOST-EP-03', 5, 'the instance manifest has no dsh.client and no ./client export', WITHDRAWN_BY.page)
  withdrawnRow(sdk, 'HOST-EP-03', 5, 'the instance packs no main client.js', WITHDRAWN_BY.page)

  // ================================================================ PLAT-EP-03 row 3: embed-UI is the only host-UI package
  // The host side's library is dsh-connector-shared since SPLIT-SHARED (requirements 1.40); fishball-shared is the Fishball side's.
  // I-HOST (QD1 = B): the instance declares dsh.client for its own settings page; the row's partition is the connector and the library.
  // C-WIRE-2: the connector's own settings page (design §5.9) declares dsh.client too; only the library has none.
  caseTest(sdk, 'PLAT-EP-03', 3, "of the host-side packages, only dsh-connector-shared declares no dsh.client (embed-UI and the connector's own settings page do)", () => {
    needEmbed()
    const withClient = [V3.connector, V3.dshShared, V3.embed].filter((p) => readManifest(p.dir)?.[DSH_FIELD]?.client !== undefined).map((p) => p.name)
    assert.deepEqual(withClient.sort(), [V3.connector.name, V3.embed.name].sort())
  })
  withdrawnRow(sdk, 'PLAT-EP-03', 3, "the instance's own shipped code (not its status-line chunk) registers no browser module and names no host-DSH slot", WITHDRAWN_BY.page)

  // ================================================================ PLAT-EP-03 row 5: each remains a native DSH bundle
  // Since df9d83d embed-UI is a component inside the connector's bundle (packages/dsh-connector/ui,
  // served by the connector's patch), not a bundle of its own; the connector is inspected here.
  for (const pkg of [V3.connector]) {
    caseTest(sdk, 'PLAT-EP-03', 5, `DSH's own bundle inspection accepts ${pkg.name} as a bundle`, async () => {
      manifestOf(pkg)
      const answer = await dshInspect(sdk, pkg.dir)
      assert.notEqual(answer.status, SDK.inspect.refused, JSON.stringify(answer))
      assert.equal(answer.bundle, true, JSON.stringify(answer))
      assert.equal(answer.name, pkg.name, JSON.stringify(answer))
    })
  }

  // ================================================================ R-EMBED (4): the child copy and the instance's reach
  caseTest(sdk, 'R-EMBED', '(4)', "the instance's code names no embed-UI package or folder (it never reads a file inside embed-UI)", async (t) => {
    // dsh-instance split into the dsh-fishball-instance repository (6b7c53bf): the row can only run
    // in a checkout that still carries the instance.
    if (!fs.existsSync(V3.instance.dir)) { t.skip('dsh-instance is not in this repository (split 6b7c53bf)'); return }
    const { units } = await observe()
    const refs = units.get(V3.instance.name).refs.filter((r) => r.target === V3.embed.name).map(describeRef)
    const strings = []
    for (const [file, t] of await unitTokens(V3.instance)) for (const s of t.strings) if (EMBED_WORDS.some((w) => s.includes(w))) strings.push(file + ': ' + JSON.stringify(s))
    assert.deepEqual([...refs, ...strings], [])
  })
  caseTest(sdk, 'R-EMBED', '(4)', "the instance's child-code copy carries no main client: no Plugins card slot, no copy of the V2 instance client.js or of an embed-UI file", async (t) => {
    if (!fs.existsSync(V3.instance.dir)) { t.skip('dsh-instance is not in this repository (split 6b7c53bf)'); return }
    const { copyChildCode } = await import(pathToFileURL(path.join(V3.instance.dir, ...CHILD_COPY.module)).href)
    const root = await mkdtemp(path.join(npmTempRoot(), CHILD_COPY.tempPrefix))
    t.after(async () => {
      // Guard the one recursive delete: a directory this test created under the run's .runtime folder.
      if (path.dirname(root) === path.resolve(NPM.tempRoot) && path.basename(root).startsWith(CHILD_COPY.tempPrefix)) await rm(root, { recursive: true, force: true })
    })
    const profile = path.join(root, CHILD_COPY.profileDir)
    await mkdir(profile, { mode: CHILD_COPY.profileMode })
    const snapshot = path.dirname(await copyChildCode({ profile }, { instanceId: randomUUID(), hostId: CHILD_COPY.hostId }))
    const files = (await readdir(snapshot, { recursive: true })).map((f) => path.join(snapshot, f)).filter((f) => fs.statSync(f).isFile())
    const { stdout: v2Client } = await run('git', ['show', BASE.commit + ':' + BASE.instanceClient], { cwd: REPO, maxBuffer: NPM.maxStdoutBytes })
    const embedFiles = has(V3.embed) ? ownFiles(await unitOf(V3.embed.name)).filter((f) => JS_FILE.test(f)).map((f) => fs.readFileSync(path.join(V3.embed.dir, f), 'utf8')) : []
    const found = []
    for (const file of files.filter((f) => JS_FILE.test(f))) {
      const text = await readFile(file, 'utf8')
      const rel = path.relative(snapshot, file)
      if (text === v2Client) found.push(rel + ': the V2 instance client.js')
      if (embedFiles.includes(text)) found.push(rel + ': a copy of an embed-UI file')
      for (const slot of CARD_SLOTS) if (text.includes("'" + slot + "'") || text.includes('"' + slot + '"')) found.push(rel + ': names ' + slot)
    }
    assert.deepEqual(found, [])
  })

  // ================================================================ definition of done, integration
  integrationCase(sdk, 'R-EMBED', 'done', 'C + I + U: the main DSH boots with no client-loader error and its only Fishball client entry is dsh-connector-ui', async () => {
    const { host } = await hostWith(sdk, SETS.full)
    assert.deepEqual(loaderErrors(host), [], 'client-loader errors')
    assert.deepEqual((await hostGraph(host)).map((e) => e.id).filter(FISHBALL_ENTRY), [V3.embed.name])
  })
  integrationCase(sdk, 'R-EMBED', 'done', 'C + I + U: contributions render without a Plugins card (V2 never deployed (U-WIRE))', async (t) => {
    const { host } = await hostWith(sdk, SETS.full)
    const page = await openMainPage(t, { sdk, host })
    // Attribution is by serving package: a registration belongs to the graph entry whose served
    // bundle (or package-local chunk) made it. The moved parts may keep their V2 plugin names
    // inside embed-UI (a pure move); no design section ties the slots to embed-UI's own name.
    const fromEmbed = () => page.registrations.filter((r) => r.owner === V3.embed.name)
    const missingOf = () => EXPECTED_UI.filter((e) => !fromEmbed().some((r) => matchesExpected(e, r)))
    await page.waitFor(() => missingOf().length === 0)
    assert.deepEqual(page.failed(), [], 'failed plugins')
    assert.deepEqual(page.errors, [], 'page errors')
    const missing = missingOf()
    assert.deepEqual(missing, [], 'contributions not registered by embed-UI; it registered ' + JSON.stringify(fromEmbed()))
    assert.equal(fromEmbed().some((r) => CARD_SLOTS.includes(r.slot)), false, 'embed-UI must have no Plugins card')
    // DESIGN.md §28 (R1, R2): the marks come from the connector, never from embed-UI.
    const fromConnector = () => page.registrations.filter((r) => r.owner === V3.connector.name)
    await page.waitFor(() => EXPECTED_MARKS.every((e) => fromConnector().some((r) => r.slot === e.slot && r.id === e.id)))
    assert.deepEqual(EXPECTED_MARKS.filter((e) => !fromConnector().some((r) => r.slot === e.slot && r.id === e.id)), [], 'marks not registered by the connector')
    assert.deepEqual(fromEmbed().filter((r) => EXPECTED_MARKS.some((e) => e.slot === r.slot)).map((r) => r.slot + '#' + r.id), [], 'embed-UI still registers in the marks seats')
  })
  integrationCase(sdk, 'HOST-UC-08', 'post', 'C + I + U: the host shows no UI from the instance or the connector (no registration by another Fishball entry)', async (t) => {
    const { host } = await hostWith(sdk, SETS.full)
    const page = await openMainPage(t, { sdk, host })
    // The served chunks register after their fetches; wait for embed-UI's first contribution.
    await page.waitFor((regs) => regs.some((r) => r.owner === V3.embed.name))
    assert.deepEqual(page.registrations.filter((r) => FISHBALL_ENTRY(r.owner) && r.owner !== V3.embed.name), [])
  })
  // The child's slim settings panel is removed (requirements 1.34 item 4, R-HOST-11 withdrawn; F-SETTINGS).
  withdrawnCase(sdk, 'R-EMBED', 'done', 'C + I + U: the hosted child starts and its settings panel still shows the status line (ready)')
  integrationCase(sdk, 'R-EMBED', 'done', 'C + I alone: the main DSH boots with no client-loader error, no Fishball client entry, and the child still starts', async () => {
    const { host, status } = await hostWith(sdk, SETS.noEmbed)
    assert.deepEqual(loaderErrors(host), [], 'client-loader errors')
    assert.deepEqual((await hostGraph(host)).map((e) => e.id).filter(FISHBALL_ENTRY), [])
    assert.equal(status?.state, STATE.ready, 'the hosted child is ready; status ' + JSON.stringify(status))
  })
  // DESIGN.md §28 (R1): the connector's client entry (settings page and the marks part) shows with or without embed-UI.
  integrationCase(sdk, 'PLAT-EP-03', 1, 'C + I alone: the connector\'s client entry is in the graph and registers the marks part; no Fishball sidebar entry', async (t) => {
    const { host } = await hostWith(sdk, SETS.noEmbed)
    assert.equal((await hostGraph(host)).some((e) => e.id === V3.connector.name), true, 'no connector client entry')
    const page = await openMainPage(t, { sdk, host })
    await page.waitFor((regs) => EXPECTED_MARKS.every((e) => regs.some((r) => r.slot === e.slot && r.id === e.id)))
    assert.deepEqual(EXPECTED_MARKS.filter((e) => !page.registrations.some((r) => r.owner === V3.connector.name && r.slot === e.slot && r.id === e.id)), [], 'marks without embed-UI')
    assert.deepEqual(page.registrations.filter((r) => WINDOW_UI.some((e) => matchesExpected(e, r))), [], 'a Fishball window entry without embed-UI')
  })

  // ================================================================ later tasks
  caseTest(sdk, 'PLAT-EP-03', 1, 'loading the connector serves no HTML route in the host (the approval page lives on its own listener)', null, LATER.matrix)
  caseTest(sdk, 'PLAT-EP-03', 2, 'the instance has no browser client and no session service injected', null, LATER.matrix)
  caseTest(sdk, 'PLAT-EP-03', 4, 'fishball-ui ships inside core with no separate plugin entry', null, LATER.matrix)
  caseTest(sdk, 'PLAT-EP-03', 5, "each package installs, enables, disables and lists on DSH's own Plugins page", null, LATER.matrix)
  caseTest(sdk, 'PLAT-EP-03', 6, 'no file writes outside their own folders or profile rows; no host patch', null, LATER.matrix)
  caseTest(sdk, 'R-EMBED', 'e2e', 'the moved UI in a browser on both SDKs', null, LATER.e2e)
}

