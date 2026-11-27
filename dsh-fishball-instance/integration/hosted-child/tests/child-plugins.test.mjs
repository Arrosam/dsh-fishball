/**
 * The Fishball tab's routes against a real hosted child (README "Plugins for Fishball", "Settings
 * page" Restart; DESIGN §28 of dsh-fishball): CP-R1…R10. Every request goes over HTTP with the
 * owner's cookie; every observation is a route answer or a file the README names (the child and
 * main profiles' package.json). Offline: the bundles are local fixtures packed with
 * npm pack --offline; the one registry case points the host at a local socket that never answers.
 *
 * One host per SDK; the rows run in order and later rows build on the earlier ones' state. The MAIN
 * profile also links fbtest-only (installed there, not selected), a name no installation ships.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { eachSdk } from '@dsh-instance/test-helpers/cases'
import { untilValue } from '@dsh-instance/test-helpers/host-dsh'
import {
  APPLIED, CANCEL_OUTCOMES, CHILD, CODE, FIXTURE, HTTP, PROTECTED, ROUTE, STATE, STATUS_KEYS, hangingRegistry, hostedWorld, longPost, packInto, perSdk, readText, show,
} from '../support/hosted-child.mjs'

const MAIN_MANIFEST = ['profiles', 'dshi', 'package.json']
const hasStatusShape = (json) => STATUS_KEYS.every((k) => Object.hasOwn(json ?? {}, k))

eachSdk((sdk) => {
  let registry
  let tarball
  let requestCount = 0
  // The host's registry is the hanging one (npm_config_registry), set before the first boot; the
  // fixture installs are file tarballs and never ask it.
  const env = {}
  const w = hostedWorld('hc-plugins', { env, links: [{ name: FIXTURE.mainOnly.name, dir: FIXTURE.mainOnly.dir, bundle: false }] })
  const world = { close: async () => { await w.close(); registry?.close() } }
  perSdk(sdk, 'child plugins', world, (row) => {
    const requestId = (n) => 'fbtest-child-plugins-' + n + '-' + ++requestCount
    const child = () => w.child
    const mainText = () => readText(path.join(w.home, ...MAIN_MANIFEST))
    const settled = () => w.settle([STATE.ready, STATE.failed])
    const post = (route, body, options) => w.host.post(route, body, options)
    const start = async () => {
      if (!registry) { registry = await hangingRegistry(); env.npm_config_registry = registry.url }
      const s = await w.start(sdk)
      if (!tarball) tarball = packInto(FIXTURE.tarball.dir, w.home)
      return s
    }
    const r = (id, part, title, fn) => row(id, part, title, async () => { await start(); await fn() })
    const baseline = {}

    // ------------------------------------------------------------------ R10 baseline
    r('CP-R10', 'baseline', "before any child operation: DSH's own pluginManager lists the MAIN profile; the main detail-file route answers", async () => {
      const s = await settled()
      assert.equal(s?.state, STATE.ready, 'the child is not ready: ' + show(s))
      const main = await w.host.call('allBundles')
      assert.ok(main.some((b) => b.name === FIXTURE.mainOnly.name), 'main listBundles lacks the main profile fixture: ' + show(main.map((b) => b.name)))
      baseline.mainNames = main.map((b) => b.name).sort()
      baseline.detail = (await w.host.get(ROUTE.mainDetailFile)).status
    })

    // ------------------------------------------------------------------ R9 fences
    for (const [part, body] of [['not JSON', '{nope'], ['JSON array', '[]'], ['JSON string', '"x"'], ['field missing', '{}'], ['wrong type', '{"name":7}'], ['empty name', '{"name":""}']]) {
      r('CP-R9', 'malformed ' + part, `POST use with body ${body} → HTTP 400`, async () => {
        const before = readText(child().manifestFile)
        const res = await post(ROUTE.use, body, { raw: true })
        assert.equal(res.status, HTTP.badRequest, show(res))
        assert.equal(readText(child().manifestFile), before)
      })
    }
    for (const route of [ROUTE.install, ROUTE.use]) {
      r('CP-R9', 'cross-origin ' + path.basename(route), `POST ${path.basename(route)} from ${FIXTURE.foreignOrigin} → 403; nothing written`, async () => {
        const before = readText(child().manifestFile)
        const body = route === ROUTE.install ? { spec: tarball, requestId: requestId('xo') } : { name: FIXTURE.shippedOfficial }
        const res = await post(route, body, { headers: { origin: FIXTURE.foreignOrigin, 'sec-fetch-site': 'cross-site' } })
        assert.equal(res.status, HTTP.forbidden, show(res))
        assert.equal(readText(child().manifestFile), before, 'a cross-origin request changed the child profile')
      })
    }
    r('CP-R9', 'no owner', 'GET list without the owner cookie → not answered 200', async () => {
      const res = await fetch(w.host.origin + ROUTE.list)
      await res.arrayBuffer()
      assert.notEqual(res.status, HTTP.ok)
    })
    r('CP-R9', 'size big', `POST use with a ${FIXTURE.oversizedBytes}-byte body → refused (4xx)`, async () => {
      const before = readText(child().manifestFile)
      const res = await post(ROUTE.use, { name: FIXTURE.unknownName, pad: 'x'.repeat(FIXTURE.oversizedBytes) })
      assert.ok(res.status >= 400 && res.status < 500, 'status ' + res.status + ' ' + res.text.slice(0, 200))
      assert.equal(readText(child().manifestFile), before)
    })
    r('CP-R9', 'size small', `POST use with a valid body padded to ${FIXTURE.smallPadBytes} bytes → not refused for size (200)`, async () => {
      const res = await post(ROUTE.use, { name: FIXTURE.unknownName, pad: 'x'.repeat(FIXTURE.smallPadBytes) })
      assert.equal(res.status, HTTP.ok, show(res))
    })

    // ------------------------------------------------------------------ R2 list
    r('CP-R2', 'list', 'GET list → ok; none of the protected bundles is listed; protected names exactly the owned bundles (retired fishball-ui included)', async () => {
      const res = await w.host.get(ROUTE.list)
      assert.equal(res.status, HTTP.ok)
      assert.equal(res.json?.ok, true, show(res.json))
      const names = (res.json.bundles ?? []).map((b) => b.name)
      assert.deepEqual(names.filter((n) => PROTECTED.includes(n)), [], 'protected bundles listed: ' + show(names))
      assert.deepEqual([...(res.json.protected ?? [])].sort(), [...PROTECTED].sort(), 'the list does not name the protected bundles')
    })

    // ------------------------------------------------------------------ R1 install
    r('CP-R1', 'install', 'install a local tarball → child deps + bundles have it; MAIN profile untouched; applied restarting; the child restarts', async () => {
      const mainBefore = mainText()
      const launchesBefore = child().launchDirs()
      const res = await post(ROUTE.install, { spec: tarball, requestId: requestId('r1') })
      assert.equal(res.status, HTTP.ok, show(res))
      assert.equal(res.json?.ok, true, 'install refused: ' + show(res.json))
      assert.deepEqual([res.json.name, res.json.version, res.json.applied], [FIXTURE.tarball.name, FIXTURE.tarball.version, APPLIED.restarting])
      assert.ok(Object.hasOwn(child().deps(), FIXTURE.tarball.name), 'child dependencies lack it: ' + show(child().deps()))
      assert.ok(child().bundles().includes(FIXTURE.tarball.name), 'child bundles lack it: ' + show(child().bundles()))
      assert.equal(mainText(), mainBefore, 'the MAIN profile package.json changed')
      await w.readyAgain(launchesBefore)
      const list = (await w.host.get(ROUTE.list)).json
      assert.ok(list?.bundles?.some((b) => b.name === FIXTURE.tarball.name), 'not listed: ' + show(list))
    })

    // ------------------------------------------------------------------ R5 use
    r('CP-R5', 'use shipped', `use ${FIXTURE.shippedOfficial} → ok; added to the child bundles; no pnpm run (deps and lockfile unchanged)`, async () => {
      await w.readyAgain([])
      const deps = show(child().deps())
      const lock = readText(path.join(child().profile, CHILD.lockfile))
      const mainBefore = mainText()
      const res = await post(ROUTE.use, { name: FIXTURE.shippedOfficial })
      assert.equal(res.json?.ok, true, show(res.json))
      assert.ok(child().bundles().includes(FIXTURE.shippedOfficial), show(child().bundles()))
      assert.equal(show(child().deps()), deps, 'dependencies changed')
      assert.equal(readText(path.join(child().profile, CHILD.lockfile)), lock, 'lockfile changed')
      assert.equal(mainText(), mainBefore, 'the MAIN profile changed')
    })
    for (const name of [FIXTURE.unknownName, FIXTURE.mainOnly.name]) {
      r('CP-R5', 'use not shipped ' + name, `use ${name} (not shipped by the installation) → refused; child bundles unchanged`, async () => {
        await w.readyAgain([])
        const before = show(child().bundles())
        const res = await post(ROUTE.use, { name })
        assert.equal(res.json?.ok, false, show(res.json))
        assert.equal(show(child().bundles()), before)
      })
    }

    // ------------------------------------------------------------------ R2 protected
    for (const name of PROTECTED) for (const route of [ROUTE.uninstall, ROUTE.use]) {
      r('CP-R2', `protected ${path.basename(route)} ${name}`, `${path.basename(route)} {name: ${name}} → protected; child manifest unchanged`, async () => {
        await w.readyAgain([])
        const before = readText(child().manifestFile)
        const res = await post(route, { name })
        assert.deepEqual({ ok: res.json?.ok, code: res.json?.code }, { ok: false, code: CODE.protected }, show(res.json))
        assert.equal(readText(child().manifestFile), before)
      })
    }

    // ------------------------------------------------------------------ R6 uninstall
    r('CP-R6', 'uninstall', 'uninstall the installed fixture → its dependency and its bundle are both gone', async () => {
      await w.readyAgain([])
      const res = await post(ROUTE.uninstall, { name: FIXTURE.tarball.name })
      assert.equal(res.json?.ok, true, show(res.json))
      assert.ok(!Object.hasOwn(child().deps(), FIXTURE.tarball.name), 'dependency kept: ' + show(child().deps()))
      assert.ok(!child().bundles().includes(FIXTURE.tarball.name), 'bundle kept: ' + show(child().bundles()))
    })
    r('CP-R6', 'remove fails', 'pnpm remove fails (child manifest made unresolvable) → remove-failed; bundle list unchanged', async () => {
      await w.readyAgain([])
      const second = packInto(FIXTURE.second.dir, w.home)
      const before = child().launchDirs()
      const installed = await post(ROUTE.install, { spec: second, requestId: requestId('r6') })
      assert.equal(installed.json?.ok, true, 'precondition install: ' + show(installed.json))
      await w.readyAgain(before)
      const file = child().manifestFile
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
      manifest.dependencies = { ...manifest.dependencies, 'fbtest-unresolvable': 'file:./vendor/fbtest-does-not-exist.tgz' }
      fs.writeFileSync(file, JSON.stringify(manifest, null, 2))
      try {
        const bundles = show(child().bundles())
        const res = await post(ROUTE.uninstall, { name: FIXTURE.second.name })
        assert.deepEqual({ ok: res.json?.ok, code: res.json?.code }, { ok: false, code: CODE.removeFailed }, show(res.json))
        assert.equal(show(child().bundles()), bundles, 'the bundle list changed after a failed remove')
      } finally {
        const now = JSON.parse(fs.readFileSync(file, 'utf8'))
        delete now.dependencies?.['fbtest-unresolvable']
        fs.writeFileSync(file, JSON.stringify(now, null, 2))
      }
    })

    // ------------------------------------------------------------------ R8 restart
    r('CP-R8', 'ready', 'restart while ready → the status shape; the child is ready again on a new launch', async () => {
      await w.readyAgain([])
      const before = child().launchDirs()
      const res = await post(ROUTE.restart, {})
      assert.equal(res.status, HTTP.ok, show(res))
      assert.ok(hasStatusShape(res.json), 'not the status shape: ' + show(res.json))
      await w.readyAgain(before)
    })
    r('CP-R8', 'queued', 'two restarts at once → both answer the status shape; ends ready with one live launch', async () => {
      await w.readyAgain([])
      const before = child().launchDirs()
      const [a, b] = await Promise.all([post(ROUTE.restart, {}), post(ROUTE.restart, {})])
      for (const res of [a, b]) assert.ok(hasStatusShape(res.json), show(res.json))
      const again = await w.readyAgain(before)
      assert.equal(again.launches.length, 1, 'live launches: ' + show(again.launches))
    })
    r('CP-R8', 'failed', 'a failed child: restart is allowed (status shape, not instance-disabled); with the cause removed it comes back ready', async () => {
      await w.readyAgain([])
      // A child-profile patch that switches off a base service the child needs (README "Ready": the
      // base services must be mounted), so its start fails; removed again before the last restart.
      const patch = path.join(child().profile, CHILD.patch)
      const original = fs.readFileSync(patch, 'utf8')
      fs.writeFileSync(patch, JSON.stringify([{ id: 'agent', disabled: true }]))
      try {
        await post(ROUTE.restart, {})
        const failed = await w.settle([STATE.failed])
        assert.equal(failed?.state, STATE.failed, 'precondition: the start did not fail: ' + show(failed))
        const res = await post(ROUTE.restart, {})
        assert.notEqual(res.json?.refused, CODE.instanceDisabled, show(res.json))
        assert.ok(hasStatusShape(res.json), show(res.json))
      } finally { fs.writeFileSync(patch, original) }
      const before = child().launchDirs()
      await post(ROUTE.restart, {})
      await w.readyAgain(before)
    })
    // Still not observable: "stopped" with the instance on is the idle state after a stop that no
    // public route or setting causes (switching off gives "disabled"; a restart starts again at once).
    row('CP-R8', 'stopped', 'restart while stopped (instance on) is allowed', () => {}, { todo: 'no public way to bring an enabled child to "stopped": switching it off reads "disabled", and every route that stops it starts it again' })

    // ------------------------------------------------------------------ R3 one operation at a time
    let held
    r('CP-R3', 'busy', 'an install held on a registry that never answers; then install/use/uninstall → each busy', async () => {
      await w.readyAgain([])
      const id = requestId('r3')
      held = { requestId: id, settled: false }
      held.answer = longPost(w.host, ROUTE.install, { spec: FIXTURE.hangingSpec, requestId: id })
      held.answer.then(() => { held.settled = true }, () => { held.settled = true })
      // The install runs: the status says busy (README "Settings page": Restart is disabled while a
      // Fishball plugin change runs). The registry it asks never answers, so it stays running.
      await untilValue(async () => held.settled || (await w.status())?.busy === true)
      if (held.settled) assert.fail('precondition: the held install ended at once: ' + show(await held.answer.catch((e) => String(e))))
      const answers = {
        install: (await post(ROUTE.install, { spec: tarball, requestId: requestId('r3b') })).json,
        use: (await post(ROUTE.use, { name: FIXTURE.shippedOfficial })).json,
        uninstall: (await post(ROUTE.uninstall, { name: FIXTURE.second.name })).json,
      }
      assert.deepEqual(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, v?.code])), { install: CODE.busy, use: CODE.busy, uninstall: CODE.busy }, show(answers))
    })
    // DSH's own cancelInstall answers only when the stuck pnpm run ends, and that run ends only once
    // its registry connection goes away (measured 2026-11-20 on both SDKs, ~70 s after the drop). The
    // registry here drops its connections as soon as the cancel is sent; no deadline is set on the
    // answer.
    r('CP-R3', 'cancel', "cancel {requestId}, the registry drops its connection → answers with one of DSH's cancel outcomes; the held install ends refused; the next operation is not busy", async () => {
      assert.ok(held, 'precondition: no held install')
      const pending = post(ROUTE.cancel, { requestId: held.requestId })
      registry.close()
      const cancel = await pending
      assert.equal(cancel.json?.ok, true, show(cancel.json))
      assert.ok(CANCEL_OUTCOMES.includes(cancel.json.outcome), show(cancel.json))
      const first = await held.answer
      assert.equal(first.json?.ok, false, show(first.json))
      const next = (await post(ROUTE.use, { name: FIXTURE.unknownName })).json
      assert.notEqual(next?.code, CODE.busy, show(next))
    })
    row('CP-R3', 'cancel, connection open', 'cancel answers while the registry keeps its connection open', () => {}, { todo: "DSH's cancelInstall waits for the stuck pnpm run, which ends only when the registry closes its connection (measured ~70 s after the close); DSH's own dialog behaves the same" })

    // ------------------------------------------------------------------ R7 / R8 switched off
    /** Wait until no package operation runs (status busy), then switch the instance off through DSH's settings service. */
    const switchOff = async () => {
      await untilValue(async () => (await w.status())?.busy === false)
      if ((await w.status())?.state === STATE.disabled) return
      const res = await w.host.call('settingsUpdate', { ns: 'dsh-instance', patch: { enabled: false } })
      assert.equal(res?.ok, true, 'precondition: could not switch the instance off: ' + show(res))
      await w.settle([STATE.disabled])
    }
    r('CP-R7', 'off restart', 'instance switched off: restart → instance-disabled', async () => {
      await switchOff()
      const res = await post(ROUTE.restart, {})
      assert.equal(res.json?.refused, CODE.instanceDisabled, 'not refused instance-disabled: ' + show(res.json))
      assert.equal((await w.status())?.state, STATE.disabled, 'a refused restart started the child')
    })
    r('CP-R7', 'off use', 'instance switched off: use {shipped official} → ok, applied next-start; written to the child bundles', async () => {
      await switchOff()
      if (child().bundles().includes(FIXTURE.shippedOfficial)) {
        const u = await post(ROUTE.uninstall, { name: FIXTURE.shippedOfficial })
        assert.equal(u.json?.ok, true, 'precondition uninstall: ' + show(u.json))
      }
      const res = await post(ROUTE.use, { name: FIXTURE.shippedOfficial })
      assert.deepEqual({ ok: res.json?.ok, applied: res.json?.applied }, { ok: true, applied: APPLIED.nextStart }, show(res.json))
      assert.ok(child().bundles().includes(FIXTURE.shippedOfficial), show(child().bundles()))
      assert.equal((await w.status())?.state, STATE.disabled, 'a change while off started the child')
    })
    r('CP-R7', 'off uninstall', 'instance switched off: uninstall {that bundle} → ok, applied next-start; dropped from the list', async () => {
      await switchOff()
      const res = await post(ROUTE.uninstall, { name: FIXTURE.shippedOfficial })
      assert.deepEqual({ ok: res.json?.ok, applied: res.json?.applied }, { ok: true, applied: APPLIED.nextStart }, show(res.json))
      assert.ok(!child().bundles().includes(FIXTURE.shippedOfficial), show(child().bundles()))
    })

    // ------------------------------------------------------------------ R10 after
    r('CP-R10', 'after', "after child operations: DSH's own listBundles is still the MAIN profile's; detail-file answers as before", async () => {
      const main = await w.host.call('allBundles')
      assert.deepEqual(main.map((b) => b.name).sort(), baseline.mainNames, 'the main pluginManager now lists something else')
      assert.equal((await w.host.get(ROUTE.mainDetailFile)).status, baseline.detail)
    })

    // ------------------------------------------------------------------ R4 not-ready (last: removes the child runtime)
    for (const [part, route, body] of [
      ['install', ROUTE.install, () => ({ spec: tarball, requestId: requestId('r4') })],
      ['use', ROUTE.use, () => ({ name: FIXTURE.shippedOfficial })],
      ['uninstall', ROUTE.uninstall, () => ({ name: FIXTURE.second.name })],
    ]) {
      r('CP-R4', 'not-ready ' + part, `no child profile yet (runtime removed while DSH was down, instance off): ${part} → not-ready; nothing created`, async () => {
        if (fs.existsSync(child().profile)) {
          await switchOff()
          const s = await w.restart((home) => {
            const runtime = path.join(home, ...CHILD.runtime)
            assert.ok(runtime.startsWith(home + path.sep) && path.basename(runtime) === 'runtime', 'refusing to remove ' + runtime)
            fs.rmSync(runtime, { recursive: true, force: true })
          })
          assert.equal(s?.state, STATE.disabled, 'precondition: ' + show(s))
        }
        assert.ok(!fs.existsSync(child().profile), 'precondition: the child profile exists')
        const res = await post(route, body())
        assert.deepEqual({ ok: res.json?.ok, code: res.json?.code }, { ok: false, code: CODE.notReady }, show(res.json))
        assert.ok(!fs.existsSync(child().manifestFile), 'an operation created the child profile')
      })
    }
  })
})