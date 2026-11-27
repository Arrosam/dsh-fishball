/**
 * Placement of the Fishball set in a real hosted child (README "The child", "Placement"; the I-PLACE
 * rows PLAT-DT-01, PLAT-DT-04, HOST-ST-01 rows 1 and 3, HOST-UC-06 post, HOST-UC-08 main 1 and A3,
 * HOST-EP-03 rows 7 and SHELVE, LITE-UC-03 hosted; HOST-UC-01 E2).
 *
 * The placed set is fishball-core only since 8fdd0ef ("place unified fishball-core bundle";
 * fishball-ui is PLACEMENT.retiredBundle), so every rule the old suite walked with fishball-ui as
 * the one feature is walked with core, the set's only member. The README's "Placement" line still
 * names fishball-ui and is stale in that respect.
 *
 * One hosted setup per SDK; the cases run in order and later ones restart the same home. Changes to
 * the child profile are made while the host (and so the child) is down, as an owner's switch would be.
 * An incompatible member is a scratch copy of the sibling's core with an impossible engines.dsh,
 * reached through FISHBALL_REPO for one boot: placement copies the source again at every start, so
 * editing the placed copy itself would be undone before the profile loads.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { eachSdk } from '@dsh-instance/test-helpers/cases'
import { modeOf } from '@dsh-instance/test-helpers/scratch'
import { importSdk, runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { siblingPackage, siblingRepo } from '@dsh-instance/test-helpers/siblings'
import {
  CHILD, HTTP, INCOMPATIBLE, OVERLAY, SET, STATE, admitChild, blockedBy, disabledIds, graphIds, hostedWorld, incompatibleCoreRepo, insertedIds, perSdk, readJson, show,
} from '../support/hosted-child.mjs'

/** Every trace of the shelved board in a child profile (SHELVE-BOARD: not placed, installed, enabled or recorded, not even off). */
function shelvedTraces(child) {
  const traces = []
  for (const dir of CHILD.copyDirs) if (fs.existsSync(child.copy(SET.shelved, dir))) traces.push(dir + '/' + SET.shelved)
  if (Object.hasOwn(child.deps(), SET.shelved)) traces.push('dependency')
  if (Object.values(child.deps()).some((spec) => String(spec).includes(SET.shelved))) traces.push('install spec')
  if (child.bundles().includes(SET.shelved)) traces.push('bundle')
  if ((child.record()?.[CHILD.record.key] ?? []).includes(SET.shelved)) traces.push('placement record')
  return traces
}

/** The top-level entries a copy of a package must hold: its manifest and the first segment of each `files` entry ('!' entries exclude). */
function shippedTop(manifest) {
  return new Set([CHILD.manifest, ...(manifest.files ?? []).filter((f) => !f.startsWith('!')).map((f) => f.replace(/\/$/, '').split('/')[0])])
}

eachSdk((sdk) => {
  const w = hostedWorld('hc-place')
  perSdk(sdk, 'placement', w, (row) => {
    const ready = async () => {
      const s = await w.start(sdk)
      assert.equal(s?.state, STATE.ready, 'precondition: the hosted child is ready; status ' + show(s))
      return w.child
    }
    const on = (name) => w.child.bundles().includes(name)
    /** Switch `name` on again (before core's place, core last) while the child is down. */
    const switchOn = (child, name) => { if (!child.bundles().includes(name)) child.setBundles([...child.bundles().filter((b) => b !== SET.core), name, ...(name === SET.core ? [] : [SET.core])]) }

    // ============================================================== HOST-ST-01 rows 1-2, HOST-UC-08 main 1
    row('HOST-ST-01', 1, 'Stopped → host app ready → Starting, then (row 2) Running: ready with the origin set (Open Fishball admits to the child)', async () => {
      await ready()
      const child = await admitChild(w.host)
      assert.equal(child.status, HTTP.seeOther, 'the child refused the admission')
      assert.ok(child.cookie, 'the admission set no cookie')
      assert.notEqual(child.origin, w.host.origin, 'the admission URL is not the child\'s own origin')
    })
    row('HOST-UC-08', 'main 1', "the child's profile holds the set member fishball-core, on, last (8fdd0ef: the set is core only)", async () => {
      const child = await ready()
      const bundles = child.bundles()
      for (const name of SET.placed) assert.ok(bundles.includes(name), name + ' is not on: ' + show(bundles))
      assert.equal(bundles.at(-1), SET.core, 'core is not last: ' + show(bundles))
      assert.equal(bundles.includes(SET.retired), false, 'the retired fishball-ui is placed: ' + show(bundles))
    })
    row('HOST-UC-08', 'main 1', "the child's plugin list (DSH's own profile reader) lists the set member as an installed bundle, enabled", async () => {
      const child = await ready()
      const { readProfilePlugins } = await importSdk(sdk, '@deepseek-ai/dsh-app-boot')
      const { dependencies } = readProfilePlugins({ binName: 'dsh', profileDir: child.profile, installAnchor: path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json') })
      for (const name of SET.placed) {
        const d = dependencies.find((x) => x.name === name)
        assert.ok(d?.bundle && d.enabled, name + ': ' + show(d))
      }
    })

    // ============================================================== PLAT-DT-01 rule 1
    row('PLAT-DT-01', 1, 'first placement: every member placed, on, recorded, core last', async () => {
      const child = await ready()
      const record = child.record()
      assert.equal(record?.format, CHILD.record.format, show(record))
      assert.deepEqual([...record[CHILD.record.key]].sort(), [...SET.placed].sort())
      for (const name of SET.placed) {
        assert.ok(on(name), name + ' is not on')
        for (const dir of CHILD.copyDirs) assert.ok(fs.existsSync(path.join(child.copy(name, dir), CHILD.manifest)), name + ' not in ' + dir + '/')
      }
      assert.equal(child.bundles().at(-1), SET.core)
    })
    row('PLAT-DT-01', 1, "the placement record is the owner's only (mode 0600)", async () => {
      const child = await ready()
      assert.ok(fs.existsSync(child.recordFile), 'no placement record')
      assert.equal(modeOf(child.recordFile), CHILD.record.mode)
    })

    // ============================================================== HOST-UC-06 postcondition on a real start
    row('HOST-UC-06', 'post', 'a real start: the written launch.patch.yml holds the same shape (the two runtime rows, nothing disabled but hmr) and is removed when the child stops', async () => {
      const child = await ready()
      const live = child.overlays()
      assert.equal(live.length, 1, 'one live launch overlay: ' + live.length)
      assert.deepEqual(insertedIds(live[0]).sort(), [...OVERLAY.runtimeRows].sort())
      assert.deepEqual(disabledIds(live[0]), [OVERLAY.hmr])
      let down
      const s = await w.restart(() => { down = w.child.overlays() })
      assert.deepEqual(down, [], 'the stopped child left its launch overlay')
      assert.equal(s?.state, STATE.ready, show(s))
    })

    // ============================================================== HOST-EP-03 row 7, SHELVE
    row('HOST-EP-03', 7, 'the child profile and the placement record hold the set member (core), and nothing else of Fishball as a bundle or record', async () => {
      const child = await ready()
      const fishball = (list) => list.filter((n) => n.startsWith('fishball-'))
      assert.deepEqual(fishball(child.record()[CHILD.record.key]).sort(), [...SET.placed].sort())
      assert.deepEqual(fishball(child.bundles()).sort(), [...SET.placed].sort())
    })
    row('HOST-EP-03', 7, "core's own library fishball-shared sits beside core in the child, never as a profile bundle; the connector is not placed (I-READY)", async () => {
      const child = await ready()
      for (const dir of CHILD.copyDirs) assert.ok(fs.existsSync(path.join(child.copy(SET.library, dir), CHILD.manifest)), SET.library + ' not in ' + dir + '/')
      assert.equal(child.bundles().includes(SET.library), false, SET.library + ' is a profile bundle')
      for (const dir of CHILD.copyDirs) assert.equal(fs.existsSync(child.copy('dsh-agent-connector', dir)), false, 'the connector is placed in ' + dir + '/')
      for (const name of fs.readdirSync(path.join(child.profile, CHILD.copyDirs[0]))) {
        if (!SET.placed.includes(name)) assert.equal(child.bundles().includes(name), false, 'the placed library ' + name + ' is a bundle')
      }
    })
    row('HOST-EP-03', 7, "the child's copy of core carries contracts/constants.js without a generated schema (F-OWN-SCHEMA), and exactly core's files plus package.json", async () => {
      const child = await ready()
      const source = siblingPackage('fishball', 'core')
      const manifest = readJson(path.join(source, CHILD.manifest))
      for (const dir of CHILD.copyDirs) {
        const copy = child.copy(SET.core, dir)
        assert.ok(fs.existsSync(path.join(copy, 'contracts', 'constants.js')), dir + ': the copy lacks contracts/constants.js')
        assert.equal(fs.existsSync(path.join(copy, 'mcp-schema')), false, dir + ': the copy carries a generated schema')
        const expected = shippedTop(manifest)
        const top = fs.readdirSync(copy).filter((f) => f !== CHILD.nodeModules)
        assert.deepEqual(top.filter((f) => !expected.has(f)), [], dir + ": files beyond core's files list")
        // fab3837: a '!' files entry excludes, as npm pack does.
        for (const excluded of (manifest.files ?? []).filter((f) => f.startsWith('!'))) assert.equal(fs.existsSync(path.join(copy, excluded.slice(1))), false, dir + ': ' + excluded + ' was copied')
      }
    })
    row('HOST-EP-03', 'SHELVE first', `after the first start: no ${SET.shelved} in vendor/ or node_modules/, the profile's dependencies or bundles, the placement record (not even disabled) or an install spec`, async () => {
      assert.deepEqual(shelvedTraces(await ready()), [])
    })

    // ============================================================== PLAT-DT-01 rule 9, PLAT-DT-04 rule 1, LITE-UC-03
    row('PLAT-DT-01', 9, "a running hosted setup: the host's plugin list holds no set member", async () => {
      await ready()
      const names = (await w.host.call('allBundles')).map((b) => b.name)
      assert.deepEqual(names.filter((n) => [...SET.placed, SET.retired, SET.library].includes(n)), [], show(names))
    })
    row('PLAT-DT-01', 9, "a running hosted setup: the host's boot graph serves no client entry of the set", async () => {
      await ready()
      const ids = await graphIds(w.host.origin, w.host.cookie)
      assert.deepEqual(ids.filter((id) => id.startsWith('fishball-')), [], 'the host serves ' + show(ids))
    })
    row('PLAT-DT-04', 1, 'hosted (HMR off): the instance writes the child profile with core last; guards apply from the first start', async () => {
      const child = await ready()
      assert.equal(child.bundles().at(-1), SET.core, show(child.bundles()))
      assert.deepEqual(child.overlays()[0]?.filter((op) => op?.id === OVERLAY.hmr).map((op) => op.disabled), [true], 'HMR not off')
    })
    row('PLAT-DT-04', 1, 'hosted: no dsh-instance is ever started in the child (no nested child)', async () => {
      const child = await ready()
      assert.equal(child.bundles().includes(SET.instance), false, 'a dsh-instance bundle in the child')
      assert.equal(fs.existsSync(path.join(child.dshHome, ...CHILD.runtime)), false, 'a nested child runtime in the child home')
    })
    row('LITE-UC-03', 'hosted', 'a real hosted child: the guards are core\'s own patch over the placed bundles (core last; the overlay carries only the two runtime rows and disables nothing but hmr)', async () => {
      const child = await ready()
      assert.equal(child.bundles().at(-1), SET.core, 'precondition: core last')
      const overlay = child.overlays()[0] ?? []
      assert.deepEqual(insertedIds(overlay).sort(), [...OVERLAY.runtimeRows].sort())
      assert.deepEqual(disabledIds(overlay), [OVERLAY.hmr])
    })
    // Rewritten (OUTDATED): fishball-ui is a row of the unified fishball-core bundle (8fdd0ef), and the
    // Recommended tab is off in an instance-run child (dsh-fishball 4bef45a3, DESIGN §28: "Removed in an
    // instance-run child"), with fishball-child-plugins in its place.
    row('HOST-UC-08', 'A3', 'a real hosted child serves fishball-page, fishball-ui, fishball-core and fishball-child-plugins, and neither fishball-recommend-plugins nor a fishball-settings entry', async () => {
      await ready()
      const child = await admitChild(w.host)
      const ids = await graphIds(child.origin, child.cookie)
      for (const id of ['fishball-page', 'fishball-ui', SET.core, 'fishball-child-plugins']) assert.ok(ids.includes(id), id + ' is not served: ' + show(ids))
      assert.deepEqual(ids.filter((id) => id === 'fishball-recommend-plugins' || /settings/.test(id)), [], show(ids))
    })

    // ============================================================== PLAT-DT-01 rules 2-5 (a walk over restarts), HOST-UC-01 E2
    for (const [rule, title, action, expectOn] of [
      [2, 'recorded, present, on → stays on', () => {}, true],
      [3, 'recorded, present, off → stays off (a disable survives the restart)', (child) => child.setBundles(child.bundles().filter((b) => b !== SET.core)), false],
      [4, 'recorded, deleted while off → placed again, off', (child) => { child.setBundles(child.bundles().filter((b) => b !== SET.core)); child.removePlaced(SET.core) }, false],
      // "Deleted while on": the copies and the dependency are gone while the owner's switch (the bundle
      // list, which holds on/off; the record holds names only, README "Placement") still says on.
      [5, 'recorded, deleted while on → placed again, on', (child) => { switchOn(child, SET.core); child.removePlaced(SET.core, { keepSelected: true }) }, true],
    ]) {
      row('PLAT-DT-01', rule, title + ' (the member is core, 8fdd0ef)', async () => {
        await ready()
        const status = await w.restart(() => action(w.child))
        assert.equal(status?.state, STATE.ready, show(status))
        const child = w.child
        for (const dir of CHILD.copyDirs) assert.ok(fs.existsSync(path.join(child.copy(SET.core, dir), CHILD.manifest)), SET.core + ' not in ' + dir + '/')
        assert.equal(on(SET.core), expectOn, `on/off after rule ${rule}: ${show(child.bundles())}`)
        assert.ok(child.record()[CHILD.record.key].includes(SET.core), 'still recorded')
        if (expectOn) assert.equal(child.bundles().at(-1), SET.core, 'core last')
      })
      if (rule === 3) {
        // R-FB-10 as amended by 1.39: the instance reports only generic child states; no fishball-off.
        row('HOST-UC-01', 'E2', 'fishball-core disabled: the child starts anyway (no fishball-off from the instance, Q4)', async () => {
          assert.equal(on(SET.core), false, 'precondition: core is off')
          const s = await w.status()
          assert.deepEqual({ state: s?.state, code: s?.code }, { state: STATE.ready, code: null }, show(s))
        })
      }
    }
    row('HOST-EP-03', 'SHELVE restart', `after a restart: no ${SET.shelved} in vendor/ or node_modules/, the profile's dependencies or bundles, the placement record (not even disabled) or an install spec`, async () => {
      await ready()
      assert.equal((await w.restart())?.state, STATE.ready, 'the child did not start again')
      assert.deepEqual(shelvedTraces(w.child), [])
    })

    // ============================================================== PLAT-DT-01 rules 6-7, HOST-ST-01 row 3 (an incompatible member)
    /** One boot with an incompatible core source (after `prep`), then a boot from the real source with core switched back on; answers the first status. */
    const startIncompatible = async (prep) => {
      const scratch = incompatibleCoreRepo(siblingRepo('fishball'))
      let status
      let bundlesThen
      try {
        status = await w.restart(() => prep(w.child), { env: { FISHBALL_REPO: scratch.repo } })
        bundlesThen = w.child.bundles()
      } finally { scratch.remove() }
      const back = await w.restart(() => switchOn(w.child, SET.core))
      assert.equal(back?.state, STATE.ready, 'the child did not start again from the real source: ' + show(back))
      return { status, bundlesThen }
    }
    row('PLAT-DT-01', 7, 'core off and incompatible → the start is not blocked (only enabled bundles block)', async () => {
      await ready()
      const { status, bundlesThen } = await startIncompatible((child) => child.setBundles(child.bundles().filter((b) => b !== SET.core)))
      assert.equal(status?.state, STATE.ready, show(status))
      assert.equal(bundlesThen.includes(SET.core), false, 'core was switched on: ' + show(bundlesThen))
    })
    row('PLAT-DT-01', 6, 'core on and incompatible → the child start is blocked; the status names it (PROFILE_INCOMPATIBLE)', async () => {
      await ready()
      const { status } = await startIncompatible((child) => switchOn(child, SET.core))
      assert.equal(status?.state, STATE.failed, show(status))
      assert.equal(status?.code, INCOMPATIBLE.code, show(status))
      assert.equal(blockedBy(status), SET.core, show(status))
    })
    row('HOST-ST-01', 3, 'Starting → an enabled incompatible member → Failed, PROFILE_INCOMPATIBLE naming it', async () => {
      await ready()
      const { status } = await startIncompatible((child) => switchOn(child, SET.core))
      assert.deepEqual([status?.state, status?.code, blockedBy(status)], [STATE.failed, INCOMPATIBLE.code, SET.core], show(status))
    })
  })
})