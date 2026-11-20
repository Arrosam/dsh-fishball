/**
 * CHILD-PLUGINS black-box cases: plugins for an embedded Fishball are managed from the main DSH
 * (DESIGN.md §28 of 2026-11-20, with its "Restart" and "Implementation decisions" paragraphs; the
 * instance README "Settings page" and "Plugins for Fishball"). Written from those requirements only;
 * the implementation was not read (only its public surface: manifest, README, route paths, the
 * DSH SDK's slot contracts and BundleInfo type).
 *
 * Levels
 * - integration [CP-*]: a real host DSH per SDK (support/host.mjs) with this checkout's instance, which
 *   lays out and starts the real child; every request goes over HTTP with the owner's cookie, every
 *   observation is a file the requirements name (the child and main profiles' package.json) or a
 *   route answer. Offline: the bundles are local fixtures (a packed tarball and a folder, file
 *   paths), the one registry case points the host at a local socket that never answers. One host per
 *   file; the rows run in order and later rows build on the earlier ones' state. Gated by
 *   FBTEST_V3_INTEGRATION=1 as the other instance integration suites are; skipped by name otherwise.
 * - system-like page [CPB-*]: the real client scripts in a scripted Plugins page (page.mjs).
 *
 * | Case | Req | Technique | Input / state | Expected |
 * |---|---|---|---|---|
 * | CP-R10 baseline | R10 | EP | before any child operation | DSH's own listBundles lists the MAIN profile (fbtest-tools); /api/plugin-manager/detail-file answers some status S |
 * | CP-R9 malformed ×6 | R9 | EP (body classes) | not JSON; JSON array; JSON string; {} (field missing); field of wrong type (number); empty string | HTTP 400 |
 * | CP-R9 cross-origin ×2 | R9 | EP | install/use with Origin https://evil.example + sec-fetch-site cross-site | HTTP 403; child manifest unchanged |
 * | CP-R9 no owner | R9 | EP | GET list without the owner cookie | not 200 |
 * | CP-R9 size | R9 | BVA | body of 1 MiB (well over any spec bound) vs a valid body padded to 512 B | big → refused (4xx), small → not refused for size (200) |
 * | CP-R2 list | R2 | EP | GET list on a fresh child | 200 ok; no protected name in bundles; `protected` names exactly the 5 owned bundles |
 * | CP-R1 install | R1 | Use case | install {spec: packed tarball path, requestId} | ok, name/version; child deps has it; child bundles has it; MAIN package.json byte-identical; applied restarting; the child restarts (new launch) and is ready again; list shows it |
 * | CP-R5 use shipped | R5 | Decision table | use {official shipped bundle} | ok; added to child bundles; child deps and lockfile unchanged (no pnpm run) |
 * | CP-R5 use not shipped ×2 | R5 | EP | unknown name; a name only the main profile has | ok:false; child bundle list unchanged |
 * | CP-R2 protected ×10 | R2 | Decision table (5 names × uninstall/use) | each protected name | ok:false code protected; child manifest unchanged |
 * | CP-R6 uninstall | R6 | State transition | uninstall {installed fixture} | ok; dependency gone AND bundle gone |
 * | CP-R6 remove fails | R6 | State transition (failure branch) | a second fixture installed, then the child manifest made uninstallable for pnpm (an unresolvable file: dependency) | ok:false remove-failed; bundle list unchanged |
 * | CP-R8 ready | R8 | State transition | restart while ready | answers the status shape {state, code, detail, notice}; child back to ready on a new launch |
 * | CP-R8 queued | R8 | State transition | two restarts at once | both answer the status shape; ends ready with one live launch |
 * | CP-R8 failed | R8 | State transition | the child made to fail (an external link planted in its node_modules), then restart | restart allowed (status shape, not instance-disabled); after the link is removed a restart brings it to ready |
 * | CP-R8 stopped | R8 | State transition | stopped | todo: no public way to reach "stopped" while on |
 * | CP-R3 busy ×3 | R3 | State transition | install held on a registry that never answers; then install/use/uninstall | each ok:false busy |
 * | CP-R3 cancel | R3 | Use case | cancel {that requestId}; the registry drops its connection 5 s later | answers within 150 s (measured ~70 s after the drop); outcome is one of DSH's cancel outcomes; the held install ends ok:false; a next use is not busy |
 * | CP-R3 cancel, connection open | R3 | Use case | cancel while the registry keeps its connection open | todo: DSH's cancelInstall waits for the stuck pnpm run (answer ~70 s after the registry closes) |
 * | CP-R7 off: restart | R8 | EP | instance switched off (after any running operation ends); restart | the answer carries instance-disabled; the child stays disabled |
 * | CP-R7 off: use | R7 | EP | switched off; use {shipped official} | ok, applied next-start; written to the child bundle list |
 * | CP-R7 off: uninstall | R7 | EP | switched off; uninstall {that bundle} | ok, applied next-start; dropped from the list |
 * | CP-R4 not-ready ×3 | R4 | EP | runtime folder removed while DSH is down, instance off; install/use/uninstall | each ok:false not-ready; nothing created |
 * | CP-R10 after | R10 | EP | after child operations | DSH's own listBundles still the MAIN profile's; detail-file still answers S |
 * | CPB-RESTART ×7 | Restart | EP over states | ready/failed/stopped/starting/stopping/disabled; ready+busy | ready/failed/stopped enabled; starting/stopping disabled; disabled hidden; busy disabled |
 * | CPB-CONFIRM ×2 | Restart | EP (lang) | en / zh: press Restart | a confirmation first, nothing posted; en texts exactly as §28; zh translated; confirming posts restart once |
 * | TR-* | Fishball tab Restart | see tab-restart-cases.mjs | |
 * | CPB-DETAIL ×10 | per-plugin button | Decision table | in Fishball × official shipped × has source × name in the list's `protected` | see the table in registerDetailCases |
 *
 * Expected outcomes come from the requirements; where §28 leaves a value open (e.g. the exact HTTP
 * status of an oversized body) the case asserts only what is stated ("refused").
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { after, test } from 'node:test'
import { TEST_HOMES } from '../../../support/constants.mjs'
import { bootHost, newHome, until } from '../../../support/host.mjs'
import { caseName, caseTest } from '../../contract/package-boundaries/cases.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { APPLIED, BUDGET, CANCEL_OUTCOMES, CHILD, CODE, FIXTURE, HTTP, INTEGRATION, MAIN, PAGE, PROTECTED, ROUTE, STATE } from './constants.mjs'
import { detailEntry, openPage, settingsEntry, wordsOf } from './page.mjs'
import { registerTabRestartCases } from './tab-restart-cases.mjs'

const show = (v) => JSON.stringify(v)
const T = { timeout: BUDGET.testMs }
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)
const STATUS_KEYS = ['state', 'code', 'detail', 'notice']

// =============================================================================================
// Integration world: one host per SDK file.
// =============================================================================================

function integrationRow(sdk, id, part, title, fn) {
  const name = caseName(sdk, id, part, title) + ' [integration]'
  if (process.env[INTEGRATION.env] === INTEGRATION.on) test(name, T, fn)
  else test(name, { skip: INTEGRATION.skip }, () => {})
}

/** A registry that accepts connections and never answers (R3's held install). */
async function hangingRegistry() {
  const sockets = new Set()
  const server = net.createServer((s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: 'http://127.0.0.1:' + server.address().port + '/',
    connections: () => sockets.size,
    close: () => { for (const s of sockets) s.destroy(); server.close() },
  }
}

function world(sdk) {
  let home
  let host
  let registry
  let tarball
  const w = {
    get home() { return home },
    get host() { return host },
    childProfile: () => path.join(home, ...CHILD.profile),
    childManifestFile: () => path.join(w.childProfile(), CHILD.manifest),
    childManifest: () => JSON.parse(fs.readFileSync(w.childManifestFile(), 'utf8')),
    childBundles: () => w.childManifest().dsh?.profile?.bundles ?? [],
    childDeps: () => w.childManifest().dependencies ?? {},
    mainManifestText: () => readText(path.join(home, ...MAIN.profile, MAIN.manifest)),
    launches: () => { const d = path.join(home, ...CHILD.launches); return fs.existsSync(d) ? fs.readdirSync(d).sort() : [] },
    status: async () => (await host.get(ROUTE.status)).json,
    async settled(states = [STATE.ready, STATE.failed]) {
      let s
      await until(async () => { s = await w.status().catch(() => undefined); return states.includes(s?.state) }, BUDGET.readyMs, BUDGET.pollMs)
      return s
    },
    /** Wait until the child is ready on a launch other than `previous`. */
    async readyAgain(previous) {
      let s
      const ok = await until(async () => {
        s = await w.status().catch(() => undefined)
        const now = w.launches()
        return s?.state === STATE.ready && now.length > 0 && show(now) !== show(previous)
      }, BUDGET.readyMs, BUDGET.pollMs)
      return { ok: Boolean(ok), status: s, launches: w.launches() }
    },
    post: (route, body, options) => host.post(route, body, options),
    requestId: (n) => FIXTURE.requestPrefix + n + '-' + Date.now(),
    tarball: () => tarball,
    registry: () => registry,
    async start() {
      if (host) return
      registry = await hangingRegistry()
      // Canonical and outside the checkout: the child refuses a non-canonical main home and a Git ancestor.
      home = fs.realpathSync(newHome(FIXTURE.homeLabel))
      // The packed fixture: a tarball is copied into the child's store (a folder spec would be a link out of the profile).
      const pack = spawnSync('npm', ['pack', FIXTURE.tarballSource.dir, '--offline', '--silent', '--pack-destination', home], { encoding: 'utf8' })
      assert.equal(pack.status, 0, 'npm pack failed: ' + pack.stderr)
      tarball = path.join(home, pack.stdout.trim().split('\n').at(-1))
      assert.ok(fs.existsSync(tarball), 'no tarball at ' + tarball)
      await w.boot()
    },
    async boot() {
      host = await bootHost(home, { env: { FBTEST_DSH_RUNTIME: runtimeOf(sdk), npm_config_registry: registry.url } })
      return w.settled([STATE.ready, STATE.failed, STATE.disabled])
    },
    async stop() { await host?.stop().catch(() => {}); host = undefined },
  }
  after(async () => {
    await w.stop()
    registry?.close()
    if (home && path.dirname(home) === fs.realpathSync(TEST_HOMES) && path.basename(home).startsWith(FIXTURE.homeLabel)) fs.rmSync(home, { recursive: true, force: true })
  })
  return w
}

/** Pack another fixture folder into `dir` (offline) and return the tarball path. */
function packInto(source, dir) {
  const pack = spawnSync('npm', ['pack', source, '--offline', '--silent', '--pack-destination', dir], { encoding: 'utf8' })
  assert.equal(pack.status, 0, 'npm pack failed: ' + pack.stderr)
  return path.join(dir, pack.stdout.trim().split('\n').at(-1))
}

export function registerChildPluginIntegrationCases(sdk) {
  const w = world(sdk)
  const row = (id, part, title, fn) => integrationRow(sdk, id, part, title, async () => { await w.start(); await fn() })
  const baseline = {}

  // ------------------------------------------------------------------ R10 baseline
  row('CP-R10', 'baseline', "before any child operation: DSH's own pluginManager lists the MAIN profile; the main detail-file route answers", async () => {
    const s = await w.settled()
    assert.equal(s?.state, STATE.ready, 'the child is not ready: ' + show(s))
    const main = await w.host.call('allBundles')
    assert.ok(main.some((b) => b.name === 'fbtest-tools'), 'main listBundles lacks the main profile fixture: ' + show(main.map((b) => b.name)))
    baseline.mainNames = main.map((b) => b.name).sort()
    baseline.detail = (await w.host.get(ROUTE.mainDetailFile)).status
  })

  // ------------------------------------------------------------------ R9 fences
  for (const [part, body] of [
    ['not JSON', '{nope'], ['JSON array', '[]'], ['JSON string', '"x"'], ['field missing', '{}'], ['wrong type', '{"name":7}'], ['empty name', '{"name":""}'],
  ]) {
    row('CP-R9', 'malformed ' + part, `POST use with body ${body} → HTTP 400`, async () => {
      const before = readText(w.childManifestFile())
      const r = await w.post(ROUTE.use, body, { raw: true })
      assert.equal(r.status, HTTP.badRequest, show(r))
      assert.equal(readText(w.childManifestFile()), before)
    })
  }
  for (const route of [ROUTE.install, ROUTE.use]) {
    row('CP-R9', 'cross-origin ' + path.basename(route), `POST ${path.basename(route)} from ${FIXTURE.foreignOrigin} → 403; nothing written`, async () => {
      const before = readText(w.childManifestFile())
      const body = route === ROUTE.install ? { spec: w.tarball(), requestId: w.requestId('xo') } : { name: FIXTURE.shippedOfficial }
      const r = await w.post(route, body, { headers: { origin: FIXTURE.foreignOrigin, 'sec-fetch-site': 'cross-site' } })
      assert.equal(r.status, HTTP.forbidden, show(r))
      assert.equal(readText(w.childManifestFile()), before, 'a cross-origin request changed the child profile')
    })
  }
  row('CP-R9', 'no owner', 'GET list without the owner cookie → not answered 200', async () => {
    const r = await fetch(w.host.origin + ROUTE.list)
    await r.arrayBuffer()
    assert.notEqual(r.status, HTTP.ok)
  })
  row('CP-R9', 'size big', `POST use with a ${FIXTURE.oversizedBytes}-byte body → refused (4xx)`, async () => {
    const before = readText(w.childManifestFile())
    const r = await w.post(ROUTE.use, { name: FIXTURE.notShipped[0], pad: 'x'.repeat(FIXTURE.oversizedBytes) })
    assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status + ' ' + r.text.slice(0, 200))
    assert.equal(readText(w.childManifestFile()), before)
  })
  row('CP-R9', 'size small', `POST use with a valid body padded to ${FIXTURE.smallPadBytes} bytes → not refused for size (200)`, async () => {
    const r = await w.post(ROUTE.use, { name: FIXTURE.notShipped[0], pad: 'x'.repeat(FIXTURE.smallPadBytes) })
    assert.equal(r.status, HTTP.ok, show(r))
  })

  // ------------------------------------------------------------------ R2 list
  row('CP-R2', 'list', 'GET list → ok; none of the protected bundles is listed', async () => {
    const r = await w.host.get(ROUTE.list)
    assert.equal(r.status, HTTP.ok)
    assert.equal(r.json?.ok, true, show(r.json))
    const names = (r.json.bundles ?? []).map((b) => b.name)
    assert.deepEqual(names.filter((n) => PROTECTED.includes(n)), [], 'protected bundles listed: ' + show(names))
    assert.deepEqual([...(r.json.protected ?? [])].sort(), [...PROTECTED].sort(), 'the list does not name the protected bundles')
  })

  // ------------------------------------------------------------------ R1 install
  row('CP-R1', 'install', 'install a local tarball → child deps + bundles have it; MAIN profile untouched; applied restarting; the child restarts', async () => {
    const mainBefore = w.mainManifestText()
    const launchesBefore = w.launches()
    const r = await w.post(ROUTE.install, { spec: w.tarball(), requestId: w.requestId('r1') })
    assert.equal(r.status, HTTP.ok, show(r))
    assert.equal(r.json?.ok, true, 'install refused: ' + show(r.json))
    assert.equal(r.json.name, FIXTURE.tarballSource.name)
    assert.equal(r.json.version, FIXTURE.tarballSource.version)
    assert.equal(r.json.applied, APPLIED.restarting)
    assert.ok(Object.hasOwn(w.childDeps(), FIXTURE.tarballSource.name), 'child dependencies lack it: ' + show(w.childDeps()))
    assert.ok(w.childBundles().includes(FIXTURE.tarballSource.name), 'child bundles lack it: ' + show(w.childBundles()))
    assert.equal(w.mainManifestText(), mainBefore, 'the MAIN profile package.json changed')
    const again = await w.readyAgain(launchesBefore)
    assert.ok(again.ok, 'the child did not restart to ready: ' + show(again))
    const list = (await w.host.get(ROUTE.list)).json
    assert.ok(list?.bundles?.some((b) => b.name === FIXTURE.tarballSource.name), 'not listed: ' + show(list))
  })

  // ------------------------------------------------------------------ R5 use
  row('CP-R5', 'use shipped', `use ${FIXTURE.shippedOfficial} → ok; added to the child bundles; no pnpm run (deps and lockfile unchanged)`, async () => {
    await w.settled()
    const deps = show(w.childDeps())
    const lock = readText(path.join(w.childProfile(), CHILD.lockfile))
    const mainBefore = w.mainManifestText()
    const r = await w.post(ROUTE.use, { name: FIXTURE.shippedOfficial })
    assert.equal(r.json?.ok, true, show(r.json))
    assert.ok(w.childBundles().includes(FIXTURE.shippedOfficial), show(w.childBundles()))
    assert.equal(show(w.childDeps()), deps, 'dependencies changed')
    assert.equal(readText(path.join(w.childProfile(), CHILD.lockfile)), lock, 'lockfile changed')
    assert.equal(w.mainManifestText(), mainBefore, 'the MAIN profile changed')
  })
  for (const name of FIXTURE.notShipped) {
    row('CP-R5', 'use not shipped ' + name, `use ${name} (not shipped by the installation) → refused; child bundles unchanged`, async () => {
      await w.settled()
      const before = show(w.childBundles())
      const r = await w.post(ROUTE.use, { name })
      assert.equal(r.json?.ok, false, show(r.json))
      assert.equal(show(w.childBundles()), before)
    })
  }

  // ------------------------------------------------------------------ R2 protected
  for (const name of PROTECTED) for (const route of [ROUTE.uninstall, ROUTE.use]) {
    row('CP-R2', `protected ${path.basename(route)} ${name}`, `${path.basename(route)} {name: ${name}} → protected; child manifest unchanged`, async () => {
      await w.settled()
      const before = readText(w.childManifestFile())
      const r = await w.post(route, { name })
      assert.deepEqual({ ok: r.json?.ok, code: r.json?.code }, { ok: false, code: CODE.protected }, show(r.json))
      assert.equal(readText(w.childManifestFile()), before)
    })
  }

  // ------------------------------------------------------------------ R6 uninstall
  row('CP-R6', 'uninstall', 'uninstall the installed fixture → its dependency and its bundle are both gone', async () => {
    await w.settled()
    const r = await w.post(ROUTE.uninstall, { name: FIXTURE.tarballSource.name })
    assert.equal(r.json?.ok, true, show(r.json))
    assert.ok(!Object.hasOwn(w.childDeps(), FIXTURE.tarballSource.name), 'dependency kept: ' + show(w.childDeps()))
    assert.ok(!w.childBundles().includes(FIXTURE.tarballSource.name), 'bundle kept: ' + show(w.childBundles()))
  })
  row('CP-R6', 'remove fails', 'pnpm remove fails (child manifest made unresolvable) → remove-failed; bundle list unchanged', async () => {
    await w.settled()
    const second = packInto(FIXTURE.directorySource.dir, w.home)
    const before = w.launches()
    const installed = await w.post(ROUTE.install, { spec: second, requestId: w.requestId('r6') })
    assert.equal(installed.json?.ok, true, 'precondition install: ' + show(installed.json))
    await w.readyAgain(before)
    const file = w.childManifestFile()
    const original = fs.readFileSync(file, 'utf8')
    const manifest = JSON.parse(original)
    manifest.dependencies = { ...manifest.dependencies, 'fbtest-unresolvable': 'file:./vendor/fbtest-does-not-exist.tgz' }
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
    try {
      const bundles = show(w.childBundles())
      const r = await w.post(ROUTE.uninstall, { name: FIXTURE.directorySource.name })
      assert.deepEqual({ ok: r.json?.ok, code: r.json?.code }, { ok: false, code: CODE.removeFailed }, show(r.json))
      assert.equal(show(w.childBundles()), bundles, 'the bundle list changed after a failed remove')
    } finally {
      const now = JSON.parse(fs.readFileSync(file, 'utf8'))
      delete now.dependencies?.['fbtest-unresolvable']
      fs.writeFileSync(file, JSON.stringify(now, null, 2))
    }
  })

  // ------------------------------------------------------------------ R8 restart
  row('CP-R8', 'ready', 'restart while ready → the status shape; the child is ready again on a new launch', async () => {
    assert.equal((await w.settled())?.state, STATE.ready)
    const before = w.launches()
    const r = await w.post(ROUTE.restart, {})
    assert.equal(r.status, HTTP.ok, show(r))
    assert.deepEqual(Object.keys(r.json ?? {}).filter((k) => STATUS_KEYS.includes(k)).sort(), [...STATUS_KEYS].sort(), 'not the status shape: ' + show(r.json))
    const again = await w.readyAgain(before)
    assert.ok(again.ok, show(again))
  })
  row('CP-R8', 'queued', 'two restarts at once → both answer the status shape; ends ready with one live launch', async () => {
    assert.equal((await w.settled())?.state, STATE.ready)
    const before = w.launches()
    const [a, b] = await Promise.all([w.post(ROUTE.restart, {}), w.post(ROUTE.restart, {})])
    for (const r of [a, b]) assert.ok(STATUS_KEYS.every((k) => Object.hasOwn(r.json ?? {}, k)), show(r.json))
    const again = await w.readyAgain(before)
    assert.ok(again.ok, show(again))
    assert.equal(again.launches.length, 1, 'live launches: ' + show(again.launches))
  })
  row('CP-R8', 'failed', 'a failed child: restart is allowed (status shape, not instance-disabled); with the cause removed it comes back ready', async () => {
    assert.equal((await w.settled())?.state, STATE.ready)
    const link = path.join(w.childProfile(), CHILD.nodeModules, FIXTURE.brokenLink)
    fs.symlinkSync(w.home, link)
    try {
      await w.post(ROUTE.restart, {})
      const failed = await w.settled([STATE.failed])
      assert.equal(failed?.state, STATE.failed, 'precondition: the planted link did not fail the start: ' + show(failed))
      const r = await w.post(ROUTE.restart, {})
      assert.notEqual(r.json?.code, CODE.instanceDisabled, show(r.json))
      assert.ok(STATUS_KEYS.every((k) => Object.hasOwn(r.json ?? {}, k)), show(r.json))
    } finally { fs.rmSync(link, { force: true }) }
    const before = w.launches()
    await w.post(ROUTE.restart, {})
    const again = await w.readyAgain(before)
    assert.ok(again.ok, 'not ready after a restart from failed: ' + show(again))
  })
  test.todo(caseName(sdk, 'CP-R8', 'stopped', 'restart while stopped (instance on) is allowed') + ' [integration] — TODO no public way to bring an enabled child to "stopped" without implementation details')

  // ------------------------------------------------------------------ R3 one operation at a time
  let held
  row('CP-R3', 'busy', 'an install held on a registry that never answers; then install/use/uninstall → each busy', async () => {
    assert.equal((await w.settled())?.state, STATE.ready)
    const requestId = w.requestId('r3')
    held = { requestId, answer: w.post(ROUTE.install, { spec: FIXTURE.hangingSpec, requestId }) }
    const reached = await until(() => w.registry().connections() > 0, BUDGET.cancelMs, BUDGET.pollMs)
    assert.ok(reached, 'precondition: the held install never reached the registry')
    const answers = {
      install: (await w.post(ROUTE.install, { spec: w.tarball(), requestId: w.requestId('r3b') })).json,
      use: (await w.post(ROUTE.use, { name: FIXTURE.shippedOfficial })).json,
      uninstall: (await w.post(ROUTE.uninstall, { name: FIXTURE.directorySource.name })).json,
    }
    assert.deepEqual(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v?.code])), { install: CODE.busy, use: CODE.busy, uninstall: CODE.busy }, show(answers))
  })
  // DSH's own cancelInstall answers only when the stuck pnpm run ends, and that run ends only once
  // its registry connection goes away (measured 2026-11-20 on 0.2.2-rc.1 and 0.2.1-rc.5: the answer
  // came ~70 s after the registry dropped its connection, never while it stayed open). That is
  // DSH's behaviour, shared with its own dialog (lead's decision, pending the user), so the fake
  // registry drops its connection shortly after the cancel is sent; the open-connection case is the
  // todo below.
  row('CP-R3', 'cancel', `cancel {requestId}, registry drops its connection after ${BUDGET.registryDropMs} ms → answers within ${BUDGET.cancelAnswerMs} ms (measured ~70 s after the drop) with one of DSH's cancel outcomes; the held install ends refused; the next operation is not busy`, async () => {
    assert.ok(held, 'precondition: no held install')
    const sent = Date.now()
    const pending = w.post(ROUTE.cancel, { requestId: held.requestId }).then((r) => ({ r, ms: Date.now() - sent }))
    const drop = setTimeout(() => w.registry().close(), BUDGET.registryDropMs)
    let cancel
    try {
      cancel = await Promise.race([pending, new Promise((r) => setTimeout(() => r('timeout'), BUDGET.cancelAnswerMs))])
    } finally { clearTimeout(drop); w.registry().close() }
    assert.notEqual(cancel, 'timeout', 'cancel did not answer within ' + BUDGET.cancelAnswerMs + ' ms of being sent (registry dropped at ' + BUDGET.registryDropMs + ' ms)')
    console.log('# CP-R3 cancel answered ' + cancel.ms + ' ms after it was sent (registry dropped at ' + BUDGET.registryDropMs + ' ms)')
    cancel = cancel.r
    assert.equal(cancel.json?.ok, true, show(cancel.json))
    assert.ok(CANCEL_OUTCOMES.includes(cancel.json.outcome), show(cancel.json))
    const first = await Promise.race([held.answer, new Promise((r) => setTimeout(() => r('timeout'), BUDGET.opMs))])
    assert.notEqual(first, 'timeout', 'the held install never ended')
    assert.equal(first.json?.ok, false, show(first.json))
    const next = (await w.post(ROUTE.use, { name: FIXTURE.notShipped[0] })).json
    assert.notEqual(next?.code, CODE.busy, show(next))
  })
  test.todo(caseName(sdk, 'CP-R3', 'cancel, connection open', 'cancel answers while the registry keeps its connection open') + " [integration] — TODO DSH's cancelInstall waits for the stuck pnpm run (measured: answer ~70 s after the registry closes)")

  // ------------------------------------------------------------------ R7 / R8 switched off
  /** Wait until no package operation runs (status `busy`, README: Restart is disabled while a plugin change runs), so these rows do not inherit R3's held run. */
  const idle = async () => {
    const ok = await until(async () => (await w.status())?.busy !== true, BUDGET.opMs, BUDGET.pollMs)
    assert.ok(ok, 'precondition: a package operation is still running after ' + BUDGET.opMs + ' ms')
  }
  const switchOff = async () => {
    await idle()
    const s = await w.status()
    if (s?.state === STATE.disabled) return
    const r = await w.host.call('settingsUpdateNs', { ns: MAIN.settingsNs, patch: { [MAIN.enabledField]: false } })
    assert.equal(r?.ok, true, 'precondition: could not switch the instance off: ' + show(r))
    assert.equal((await w.settled([STATE.disabled]))?.state, STATE.disabled, 'precondition: not disabled')
  }
  row('CP-R7', 'off restart', 'instance switched off: restart → instance-disabled', async () => {
    await switchOff()
    const r = await w.post(ROUTE.restart, {})
    // §28 names the refusal, not its field: the answer is the status shape and carries the refusal in some field.
    assert.ok(Object.values(r.json ?? {}).includes(CODE.instanceDisabled), 'not refused instance-disabled: ' + show(r.json))
    assert.equal((await w.status())?.state, STATE.disabled, 'a refused restart started the child')
  })
  row('CP-R7', 'off use', 'instance switched off: use {shipped official} → ok, applied next-start; written to the child bundles', async () => {
    await switchOff()
    if (w.childBundles().includes(FIXTURE.shippedOfficial)) {
      const u = await w.post(ROUTE.uninstall, { name: FIXTURE.shippedOfficial })
      assert.equal(u.json?.ok, true, 'precondition uninstall: ' + show(u.json))
    }
    const r = await w.post(ROUTE.use, { name: FIXTURE.shippedOfficial })
    assert.deepEqual({ ok: r.json?.ok, applied: r.json?.applied }, { ok: true, applied: APPLIED.nextStart }, show(r.json))
    assert.ok(w.childBundles().includes(FIXTURE.shippedOfficial), show(w.childBundles()))
    assert.equal((await w.status())?.state, STATE.disabled, 'a change while off started the child')
  })
  row('CP-R7', 'off uninstall', 'instance switched off: uninstall {that bundle} → ok, applied next-start; dropped from the list', async () => {
    await switchOff()
    const r = await w.post(ROUTE.uninstall, { name: FIXTURE.shippedOfficial })
    assert.deepEqual({ ok: r.json?.ok, applied: r.json?.applied }, { ok: true, applied: APPLIED.nextStart }, show(r.json))
    assert.ok(!w.childBundles().includes(FIXTURE.shippedOfficial), show(w.childBundles()))
  })

  // ------------------------------------------------------------------ R10 after
  row('CP-R10', 'after', "after child operations: DSH's own listBundles is still the MAIN profile's; detail-file answers as before", async () => {
    const main = await w.host.call('allBundles')
    assert.deepEqual(main.map((b) => b.name).sort(), baseline.mainNames, 'the main pluginManager now lists something else')
    assert.ok(!main.some((b) => b.name === FIXTURE.directorySource.name && b.installed && b.availability === 'profile' && !baseline.mainNames.includes(b.name)), 'a child install leaked into the main list')
    assert.equal((await w.host.get(ROUTE.mainDetailFile)).status, baseline.detail)
  })

  // ------------------------------------------------------------------ R4 not-ready (last: removes the child runtime)
  for (const [part, route, body] of [
    ['install', ROUTE.install, () => ({ spec: w.tarball(), requestId: w.requestId('r4') })],
    ['use', ROUTE.use, () => ({ name: FIXTURE.shippedOfficial })],
    ['uninstall', ROUTE.uninstall, () => ({ name: FIXTURE.directorySource.name })],
  ]) {
    row('CP-R4', 'not-ready ' + part, `no child profile yet (runtime removed while DSH was down, instance off): ${part} → not-ready; nothing created`, async () => {
      if (fs.existsSync(w.childProfile())) {
        await switchOff()
        await w.stop()
        const runtime = path.join(w.home, CHILD.profile[0], CHILD.profile[1])
        assert.ok(runtime.startsWith(w.home + path.sep) && path.basename(runtime) === 'runtime', 'refusing to remove ' + runtime)
        fs.rmSync(runtime, { recursive: true, force: true })
        const s = await w.boot()
        assert.equal(s?.state, STATE.disabled, 'precondition: ' + show(s))
      }
      assert.ok(!fs.existsSync(w.childProfile()), 'precondition: the child profile exists')
      const r = await w.post(route, body())
      assert.deepEqual({ ok: r.json?.ok, code: r.json?.code }, { ok: false, code: CODE.notReady }, show(r.json))
      assert.ok(!fs.existsSync(w.childManifestFile()), 'an operation created the child profile')
    })
  }
}

// =============================================================================================
// Browser half
// =============================================================================================

const restartButtons = (page, key) => page.byAttr(key, PAGE.restart.attr).filter((n) => n.tag === 'button')

export function registerChildPluginPageCases(sdk) {
  // ------------------------------------------------------------------ Restart visibility (EP over states)
  const rows = [
    ...Object.entries(PAGE.restartByState).map(([state, expected]) => [state, { state, code: state === STATE.failed ? 'NATIVE_CHILD_EXITED' : null }, expected]),
    ['ready, plugin change running', { state: STATE.ready, code: null, busy: true }, 'disabled'],
  ]
  for (const [part, status, expected] of rows) {
    caseTest(sdk, 'CPB-RESTART', part, `status ${show(status)} → Restart ${expected}`, async (t) => {
      const page = await openPage(t, sdk, { status })
      await page.mount('settings', settingsEntry(page).Component, { view: 'page' })
      await page.until(() => page.byAttr('settings', 'data-fishball-instance-state')[0]?.props['data-fishball-instance-state'] === status.state)
      const buttons = restartButtons(page, 'settings')
      if (expected === 'hidden') { assert.equal(buttons.length, 0, 'Restart shown while the instance is off'); return }
      assert.equal(buttons.length, 1, 'Restart buttons: ' + buttons.length + '; page text: ' + page.text('settings'))
      assert.equal(Boolean(buttons[0].props.disabled), expected === 'disabled', 'disabled = ' + Boolean(buttons[0].props.disabled))
    })
  }

  // ------------------------------------------------------------------ Restart confirmation (EP over the language)
  for (const lang of PAGE.langs) {
    caseTest(sdk, 'CPB-CONFIRM', lang, `${lang}: Restart asks first (${lang === 'en' ? show(PAGE.restart.title.en + ' ' + PAGE.restart.body.en) : 'translated'}), posts nothing until confirmed, then posts restart once`, async (t) => {
      const page = await openPage(t, sdk, { lang, status: { state: STATE.ready, code: null } })
      await page.mount('settings', settingsEntry(page).Component, { view: 'page' })
      const [button] = await page.until(() => { const b = restartButtons(page, 'settings'); return b.length && !b[0].props.disabled ? b : null })
      assert.ok(button, 'no enabled Restart')
      const posts = () => page.world.requests.filter((r) => r.method === 'POST' && r.path === ROUTE.restart).length
      // A dialog primitive may be rendered closed; what the user sees is an element with open: true.
      const openDialogs = () => page.find('settings', (n) => n.props.open === true).map((n) => wordsOf(n))
      assert.deepEqual(openDialogs(), [], 'a dialog is open before Restart was pressed')
      await page.press(button)
      assert.equal(posts(), 0, 'Restart posted before any confirmation')
      const [shown = ''] = openDialogs()
      assert.ok(shown.length > 0, 'no confirmation opened')
      if (lang === 'en') {
        assert.ok(shown.includes(PAGE.restart.title.en), 'no title ' + show(PAGE.restart.title.en) + ' in: ' + shown)
        assert.ok(shown.includes(PAGE.restart.body.en), 'no body ' + show(PAGE.restart.body.en) + ' in: ' + shown)
      } else {
        assert.ok(!shown.includes(PAGE.restart.title.en) && !shown.includes(PAGE.restart.body.en), 'zh page shows the English confirmation: ' + shown)
        assert.ok(/Fishball/.test(shown) && /[\u4e00-\u9fff]/.test(shown), 'the confirmation is not in Chinese: ' + shown)
      }
      const [confirm] = page.byAttr('settings', PAGE.restart.confirmAttr)
      assert.ok(confirm, 'no confirm control')
      await page.press(confirm)
      assert.ok(await page.until(() => posts() === 1), 'confirming did not post restart once (posts ' + posts() + ')')
    })
  }

  registerDetailCases(sdk)
  registerTabRestartCases(sdk)
}

/**
 * Decision table for the per-plugin button on a main bundle page (README / §28):
 *   conditions: C1 in Fishball's list · C2 official AND shipped (availability installation) · C3 has an install source · C4 name is dsh-instance / fishball-core / fishball-ui
 *   actions: Uninstall from Fishball | Use in Fishball | Install to Fishball | nothing
 */
const DETAIL_ROWS = Object.freeze([
  // [part, name, C1, C2, C3, expected]
  ['1 in Fishball, has source', 'fbtest-dt-one', true, false, true, PAGE.button.uninstall],
  ['2 in Fishball, official shipped', '@deepseek-ai/dsh-experimental-session-search', true, true, false, PAGE.button.uninstall],
  ['3 official shipped', '@deepseek-ai/dsh-experimental-session-search', false, true, false, PAGE.button.use],
  ['4 has install source', 'fbtest-dt-four', false, false, true, PAGE.button.install],
  ['5 official shipped and has source', '@deepseek-ai/dsh-experimental-tool-worktree', false, true, true, PAGE.button.use],
  ['6 none', 'fbtest-dt-six', false, false, false, null],
  ['7 dsh-instance', 'dsh-instance', false, false, true, null],
  ['8 fishball-core in Fishball', 'fishball-core', true, false, true, null],
  ['9 fishball-ui', 'fishball-ui', false, false, true, null],
])

function registerDetailCases(sdk) {
  for (const [part, name, inFishball, official, source, expected] of DETAIL_ROWS) {
    caseTest(sdk, 'CPB-DETAIL', part, `${name}: in Fishball ${inFishball}, official shipped ${official}, source ${source} → ${expected ?? 'nothing'}`, async (t) => {
      const info = {
        name, version: '1.0.0', official, availability: official ? 'installation' : 'profile', installed: !official, enabled: true,
        optional: official, removable: !official, rows: [], overrides: [], ...(source ? { source: '/fbtest/source/' + name.replace(/\W/g, '-') + '.tgz' } : {}),
      }
      const page = await openPage(t, sdk, { mainBundles: [info], fishball: inFishball ? [{ name, version: '1.0.0', enabled: true }] : [] })
      const subject = { kind: 'bundle', pkg: { name, version: info.version, installed: info.installed, availability: info.availability, official, enabled: true, rows: [] } }
      await page.mount('detail', detailEntry(page).Component, { subject })
      const words = () => page.find('detail', (n) => n.tag === 'button').map((b) => wordsOf(b))
      if (expected === null) {
        await page.until(() => false, PAGE.pollMs * 10)
        assert.deepEqual(words(), [], 'a control for ' + name)
        return
      }
      assert.ok(await page.until(() => words().includes(expected)), `expected ${show(expected)}, got ${show(words())}; requests ${show(page.world.requests.map((r) => r.path))}`)
      assert.deepEqual(words().filter((w) => Object.values(PAGE.button).includes(w)), [expected], 'more than one per-plugin action')
      if (expected === PAGE.button.use) {
        const [button] = page.find('detail', (n) => n.tag === 'button' && wordsOf(n) === expected)
        await page.press(button)
        assert.ok(await page.until(() => page.world.requests.some((r) => r.method === 'POST' && r.path === ROUTE.use)), 'Use in Fishball posted nothing')
        assert.deepEqual(JSON.parse(page.world.requests.find((r) => r.path === ROUTE.use).body), { name })
      }
    })
  }
  caseTest(sdk, 'CPB-DETAIL', '10 item subject', 'an official-plugin (item) page → nothing', async (t) => {
    const page = await openPage(t, sdk)
    await page.mount('detail', detailEntry(page).Component, { subject: { kind: 'item', id: 'fbtest-item' } })
    await page.until(() => false, PAGE.pollMs * 10)
    assert.deepEqual(page.find('detail', (n) => n.tag === 'button').map((b) => wordsOf(b)), [])
  })
}

export function registerChildPluginCases(sdk) {
  registerChildPluginPageCases(sdk)
  registerChildPluginIntegrationCases(sdk)
}