/**
 * Port of R4-EP-01 and R4-ST-01 (85ad758): a real hosted child boots and restarts while a
 * compatible private SDK copy is present at the hoisted slot. This exercises preflight
 * without running a package manager or asserting which copy DSH resolves or loads.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { eachSdk } from '@dsh-instance/test-helpers/cases'
import { runtimeOf } from '@dsh-instance/test-helpers/sdk'
import { CHILD, STATE, hostedWorld, perSdk, readJson, readText, show } from '../support/hosted-child.mjs'

const COPY = Object.freeze({
  name: '@deepseek-ai/schemastery',
  retiredCode: 'PREFLIGHT_CORE_SHADOW',
  log: 'lifecycle.log',
  markerFile: '.fbtest-planted-sdk-copy',
  markerText: 'R4 private SDK copy fixture',
  startsWithCopy: 3, // The first boot after planting, then the two later starts in R4-ST-01.
})
const READY = Object.freeze({ state: STATE.ready, code: null, detail: null })

function assertReady(status, phase) {
  const { state, code, detail } = status ?? {}
  assert.deepEqual({ state, code, detail }, READY, phase + ': ' + show(status))
}

function launchId(child) {
  const launches = child.launchDirs()
  assert.equal(launches.length, 1, 'expected one live child launch: ' + show(launches))
  return launches[0]
}

eachSdk((sdk) => {
  const w = hostedWorld('hc-private-sdk-copy')
  perSdk(sdk, 'private SDK copy', w, (row) => {
    row('R4-EP-01 + R4-ST-01', 'compatible copy', `a real child reaches ready on each host restart while a private ${COPY.name} copy is present`, async () => {
      assertReady(await w.start(sdk), 'before planting the copy')
      let previous = launchId(w.child)
      const source = path.join(runtimeOf(sdk), COPY.name)
      const manifest = readJson(path.join(source, CHILD.manifest))
      assert.equal(manifest?.name, COPY.name, 'fixture must come from the selected SDK')
      const modules = path.join(w.child.profile, CHILD.nodeModules)
      const slot = w.child.copy(COPY.name, CHILD.nodeModules)
      const scope = path.dirname(slot)
      const marker = path.join(slot, COPY.markerFile)

      const plant = () => {
        // The world stops the host and child before this write. Never traverse links out of the test profile.
        assert.equal(fs.realpathSync(modules), modules, 'fixture requires a private node_modules')
        fs.mkdirSync(scope, { recursive: true })
        assert.equal(fs.realpathSync(scope), scope, 'fixture requires a private scope directory')
        assert.equal(fs.lstatSync(slot, { throwIfNoEntry: false }), undefined, 'fixture must not overwrite an existing SDK package')
        fs.cpSync(source, slot, { recursive: true, dereference: true })
        // Distinguish the planted copy from a same-version replacement without changing its code or manifest.
        fs.writeFileSync(marker, COPY.markerText, { flag: 'wx' })
      }

      for (let start = 0; start < COPY.startsWithCopy; start++) {
        const phase = `boot ${start + 1} with the private copy`
        assertReady(await w.restart(start === 0 ? plant : undefined), phase)
        const current = launchId(w.child)
        assert.notEqual(current, previous, phase + ': expected a fresh child launch')
        previous = current
        assert.ok(fs.lstatSync(slot).isDirectory(), phase + ': SDK copy is not a real directory')
        assert.equal(fs.realpathSync(slot), slot, phase + ': SDK copy left the private profile')
        assert.equal(readText(marker), COPY.markerText, phase + ': the planted copy marker did not survive startup')
        assert.deepEqual(readJson(path.join(slot, CHILD.manifest)), manifest, phase + ': SDK copy manifest changed')
        const log = readText(path.join(w.home, ...CHILD.runtime, COPY.log))
        assert.ok(log && !log.includes(COPY.retiredCode), phase + ': lifecycle log missing or named the retired refusal')
      }
    })
  })
})
