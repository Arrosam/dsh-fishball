/**
 * Requirement 2 tests (host side):
 * - `HOSTED.notice.recordUnreadable === 'hosted-record-unreadable'` (`src/native-runtime/constants.js`)
 * - Boot with pre-existing `0o755` `<mainHome>/fishball` and no `hosted.json` -> tightens to `0o700`,
 *   creates `hosted.json` at `0o600`, `GET /api/dsh-instance/status` reports `notice: null`
 * - Unreadable `hosted.json` (`INVALID_HOSTED_RECORD`, `UNSAFE_METADATA`, `UNSAFE_DIRECTORY`) in
 *   non-failed states (`waiting`, `disabled`, `ready`) -> `GET /api/dsh-instance/status` reports
 *   `notice: 'hosted-record-unreadable'`
 * - When instance state is `failed` (e.g. `INVALID_MAIN_HOME` or start failure), `GET /api/dsh-instance/status`
 *   does NOT emit the redundant `hosted-record-unreadable` notice (`notice: null`).
 *
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe } from 'node:test'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups, modeOf } from '@dsh-instance/test-helpers/scratch'
import { settled } from '@dsh-instance/test-helpers/wait'
import { CODES, FILES, HARNESS, MODES, NON_FAILED_STATES, NOTICE, STATES } from './constants.mjs'
import {
  constantsModule,
  createDirWithMode,
  createFileWithMode,
  hostRowWorld,
  octal,
  tempHome,
} from './subject.mjs'

const fishballOf = (home) => path.join(home, FILES.fishballDir)
const recordOf = (home) => path.join(home, FILES.fishballDir, FILES.hostedRecord)
const codedError = (code) => Object.assign(new Error(code), { code })

/** Boots a host row into one of the three non-failed states (`waiting`, `disabled`, `ready`). */
async function bootIntoState(scope, sdk, home, targetState) {
  const enabled = targetState !== STATES.disabled
  const w = await hostRowWorld(scope, sdk, { home, enabled })
  await w.apply()
  if (targetState === STATES.ready) {
    w.fireReady()
    assert.ok(
      await w.until(async () => (await w.getStatus()).json?.state === STATES.ready),
      `expected state ${STATES.ready}`,
    )
  } else {
    assert.ok(
      await w.until(async () => (await w.getStatus()).json?.state === targetState),
      `expected state ${targetState}`,
    )
  }
  return w
}

eachSdk((sdk) => {
  describe(`dsh-instance host hosted-record handling & status notice (SDK ${sdk})`, () => {
    // ------------------------------------------------------------------ Constant contract
    caseTest(sdk, 'DIR-HOST-EP-01', 'main', `EP: HOSTED.notice.recordUnreadable equals "${NOTICE.recordUnreadable}"`, async () => {
      const { HOSTED } = await constantsModule(sdk)
      assert.equal(HOSTED?.notice?.recordUnreadable, NOTICE.recordUnreadable)
    })

    // ------------------------------------------------------------------ Boot with pre-existing 0o755 fishball dir
    describe('boot with pre-existing tightenable <mainHome>/fishball and no hosted.json (EP + ST)', () => {
      for (const state of NON_FAILED_STATES) {
        caseTest(sdk, 'DIR-HOST-ST-02', state, `ST (${state}): pre-existing 0o755 <mainHome>/fishball tightened to 0o700, hosted.json created at 0o600, status notice is null`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, MODES.defaultDir)
          assert.equal(fs.existsSync(recordOf(home)), false)

          const w = await bootIntoState(scope, sdk, home, state)

          assert.ok(
            await w.until(() => fs.existsSync(recordOf(home))),
            'hosted.json was not created during boot',
          )
          assert.equal(modeOf(dir), MODES.privateDir, `expected <mainHome>/fishball 0o700, got ${octal(modeOf(dir))}`)
          assert.equal(modeOf(recordOf(home)), MODES.privateFile, `expected hosted.json 0o600, got ${octal(modeOf(recordOf(home)))}`)

          const res = await w.getStatus()
          assert.equal(res.status, HARNESS.httpOk)
          assert.equal(res.json.state, state)
          assert.equal(res.json.notice, null, `expected notice: null, got ${JSON.stringify(res.json)}`)
          assert.deepEqual(
            w.warns().filter((l) => l.args[0] === HARNESS.recordWarn),
            [],
            'unexpected hosted record unreadable warning',
          )
        })
      }

      for (const { label, initial } of [
        { label: '0o750', initial: 0o750 },
        { label: '0o711', initial: 0o711 },
      ]) {
        caseTest(sdk, 'DIR-HOST-EP-03', label, `EP: pre-existing ${label} <mainHome>/fishball tightens to 0o700, creates 0o600 hosted.json, status notice is null`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, initial)

          const w = await bootIntoState(scope, sdk, home, STATES.ready)
          assert.ok(await w.until(() => fs.existsSync(recordOf(home))), 'hosted.json not created')
          assert.equal(modeOf(dir), MODES.privateDir)
          assert.equal(modeOf(recordOf(home)), MODES.privateFile)
          const res = await w.getStatus()
          assert.equal(res.status, HARNESS.httpOk)
          assert.equal(res.json.notice, null)
        })
      }
    })

    // ------------------------------------------------------------------ Unreadable hosted.json in non-failed states (DT)
    describe('unreadable hosted.json surfaces hosted-record-unreadable notice when not failed (DT + EP)', () => {
      for (const state of NON_FAILED_STATES) {
        caseTest(sdk, 'DIR-HOST-DT-04', state, `DT (${state} × corrupt JSON): INVALID_HOSTED_RECORD -> GET /api/dsh-instance/status reports notice "${NOTICE.recordUnreadable}"`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          createDirWithMode(fishballOf(home), MODES.privateDir)
          createFileWithMode(recordOf(home), HARNESS.corruptJsonPayloads[0].content, MODES.privateFile)

          const w = await bootIntoState(scope, sdk, home, state)
          assert.ok(
            await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
            `expected notice "${NOTICE.recordUnreadable}" in state ${state}, last: ${JSON.stringify((await w.getStatus()).json)}`,
          )
          const res = await w.getStatus()
          assert.equal(res.status, HARNESS.httpOk)
          assert.equal(res.json.state, state)
          assert.equal(res.json.notice, NOTICE.recordUnreadable)
          assert.ok(
            w.warns().some((l) => l.args[0] === HARNESS.recordWarn && l.args[1] === CODES.invalidHostedRecord),
            `expected warn ${CODES.invalidHostedRecord}, got ${JSON.stringify(w.warns())}`,
          )
        })

        caseTest(sdk, 'DIR-HOST-DT-05', state, `DT (${state} × 0o644 hosted.json): UNSAFE_METADATA -> GET /api/dsh-instance/status reports notice "${NOTICE.recordUnreadable}"`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          createDirWithMode(fishballOf(home), MODES.privateDir)
          createFileWithMode(recordOf(home), HARNESS.validRecordJson, MODES.unsafeRecordFiles[0].mode)

          const w = await bootIntoState(scope, sdk, home, state)
          assert.ok(
            await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
            `expected notice "${NOTICE.recordUnreadable}" for 0o644 hosted.json in state ${state}`,
          )
          const res = await w.getStatus()
          assert.equal(res.status, HARNESS.httpOk)
          assert.equal(res.json.state, state)
          assert.equal(res.json.notice, NOTICE.recordUnreadable)
          assert.ok(
            w.warns().some((l) => l.args[0] === HARNESS.recordWarn && l.args[1] === CODES.unsafeMetadata),
            `expected warn ${CODES.unsafeMetadata}, got ${JSON.stringify(w.warns())}`,
          )
        })
      }

      for (const { label, content } of HARNESS.corruptJsonPayloads.slice(1)) {
        caseTest(sdk, 'DIR-HOST-EP-06', label, `EP corrupt payload (${label}): reports notice "${NOTICE.recordUnreadable}"`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          createDirWithMode(fishballOf(home), MODES.privateDir)
          createFileWithMode(recordOf(home), content, MODES.privateFile)

          const w = await bootIntoState(scope, sdk, home, STATES.waiting)
          assert.ok(
            await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
            `expected notice "${NOTICE.recordUnreadable}" for ${label}`,
          )
        })
      }

      for (const { label, mode } of MODES.unsafeRecordFiles.slice(1)) {
        caseTest(sdk, 'DIR-HOST-BVA-07', label, `BVA non-private hosted.json mode (${label}): UNSAFE_METADATA reports notice "${NOTICE.recordUnreadable}"`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          createDirWithMode(fishballOf(home), MODES.privateDir)
          createFileWithMode(recordOf(home), HARNESS.validRecordJson, mode)

          const w = await bootIntoState(scope, sdk, home, STATES.waiting)
          assert.ok(
            await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
            `expected notice "${NOTICE.recordUnreadable}" for ${label} hosted.json`,
          )
        })
      }

      for (const { label, mode } of [
        { label: '0o720', mode: 0o720 },
        { label: '0o702', mode: 0o702 },
        { label: '0o775', mode: 0o775 },
      ]) {
        caseTest(sdk, 'DIR-HOST-DT-08', label, `DT (disabled × ${label} fishball dir): UNSAFE_DIRECTORY reports notice "${NOTICE.recordUnreadable}" and leaves dir mode unchanged`, async (t) => {
          const scope = cleanups(t)
          const { home } = tempHome(scope, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, mode)

          const w = await bootIntoState(scope, sdk, home, STATES.disabled)
          assert.ok(
            await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
            `expected notice "${NOTICE.recordUnreadable}" for ${label} fishball dir`,
          )
          assert.equal(modeOf(dir), mode, `refused dir mode must remain ${octal(mode)}`)
        })
      }
    })

    // ------------------------------------------------------------------ Failed state suppresses redundant notice (DT + ST)
    describe('failed state suppresses redundant hosted-record-unreadable notice (DT + ST)', () => {
      caseTest(sdk, 'DIR-HOST-DT-09', 'main', `DT: failed with ${CODES.invalidMainHome} (symlinked mainHome) -> GET /api/dsh-instance/status reports state "failed" and notice: null`, async (t) => {
        const scope = cleanups(t)
        const { home } = tempHome(scope, 'alias')
        const w = await hostRowWorld(scope, sdk, {
          home,
          enabled: true,
          startError: codedError(CODES.invalidMainHome),
        })
        await w.apply()
        w.fireReady()

        assert.ok(
          await w.until(async () => {
            const res = await w.getStatus()
            const warned = w.warns().some((l) => l.args[0] === HARNESS.recordWarn)
            return res.json?.state === STATES.failed && warned
          }),
          'expected instance to reach failed state and record open to settle',
        )
        const res = await w.getStatus()
        assert.equal(res.status, HARNESS.httpOk)
        assert.equal(res.json.state, STATES.failed)
        assert.equal(res.json.code, CODES.invalidMainHome)
        assert.equal(res.json.notice, null, `failed state must suppress hosted-record-unreadable, got ${JSON.stringify(res.json)}`)
      })

      caseTest(sdk, 'DIR-HOST-DT-10', 'main', `DT: failed with ${CODES.nativeChildExited} while hosted.json is 0o644 -> notice is null`, async (t) => {
        const scope = cleanups(t)
        const { home } = tempHome(scope, 'canonical')
        createDirWithMode(fishballOf(home), MODES.privateDir)
        createFileWithMode(recordOf(home), HARNESS.validRecordJson, MODES.unsafeRecordFiles[0].mode)

        const w = await hostRowWorld(scope, sdk, {
          home,
          enabled: true,
          startError: codedError(CODES.nativeChildExited),
        })
        await w.apply()
        // Wait for hosted record failure to register in waiting state first.
        assert.ok(
          await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
          'expected notice in waiting state before failed start',
        )

        // Transition waiting -> failed: redundant notice must disappear.
        w.fireReady()
        assert.ok(
          await w.until(async () => (await w.getStatus()).json?.state === STATES.failed),
          'expected transition to failed state',
        )
        const failedRes = await w.getStatus()
        assert.equal(failedRes.json.state, STATES.failed)
        assert.equal(failedRes.json.notice, null, `expected notice: null while failed, got ${JSON.stringify(failedRes.json)}`)
      })

      caseTest(sdk, 'DIR-HOST-ST-11', 'main', 'ST: waiting (notice shown) -> failed (notice suppressed to null) -> retry to ready (notice restored)', async (t) => {
        const scope = cleanups(t)
        const { home } = tempHome(scope, 'canonical')
        createDirWithMode(fishballOf(home), MODES.privateDir)
        createFileWithMode(recordOf(home), HARNESS.corruptJsonPayloads[0].content, MODES.privateFile)

        const w = await hostRowWorld(scope, sdk, {
          home,
          enabled: true,
          startError: codedError(CODES.nativeChildExited),
        })
        await w.apply()

        // 1. waiting: notice is active
        assert.ok(
          await w.until(async () => {
            const j = (await w.getStatus()).json
            return j?.state === STATES.waiting && j?.notice === NOTICE.recordUnreadable
          }),
          'step 1 (waiting): expected hosted-record-unreadable notice',
        )

        // 2. failed: notice is suppressed
        w.fireReady()
        assert.ok(
          await w.until(async () => (await w.getStatus()).json?.state === STATES.failed),
          'step 2 (failed): expected failed state',
        )
        assert.equal((await w.getStatus()).json.notice, null, 'step 2 (failed): notice must be null')

        // 3. retry succeeds -> ready: hosted.json is still corrupt, so notice resurfaces
        w.setStartError(null)
        const retryRes = await w.postRetry()
        assert.equal(retryRes.status, HARNESS.httpOk)
        assert.ok(
          await w.until(async () => (await w.getStatus()).json?.state === STATES.ready),
          'step 3 (ready): expected retry to reach ready state',
        )
        assert.equal(
          (await w.getStatus()).json.notice,
          NOTICE.recordUnreadable,
          'step 3 (ready): notice should resurface once no longer failed',
        )
      })

      caseTest(sdk, 'DIR-HOST-ST-12', 'main', 'ST recovery: fixing 0o644 hosted.json to 0o600 and reloading clears notice to null', async (t) => {
        const scope = cleanups(t)
        const { home } = tempHome(scope, 'canonical')
        createDirWithMode(fishballOf(home), MODES.privateDir)
        createFileWithMode(recordOf(home), HARNESS.validRecordJson, MODES.unsafeRecordFiles[0].mode)

        const w = await hostRowWorld(scope, sdk, { home, enabled: false })
        await w.apply()
        assert.ok(
          await w.until(async () => (await w.getStatus()).json?.notice === NOTICE.recordUnreadable),
          'expected notice before fixing hosted.json permissions',
        )

        await w.dispose()
        fs.chmodSync(recordOf(home), MODES.privateFile)

        await w.apply()
        // Wait for the record I/O before checking that the repaired record has no notice.
        await settled()
        const res = await w.getStatus()
        assert.equal(res.status, HARNESS.httpOk)
        assert.equal(res.json.notice, null, `expected notice: null after fixing permissions, got ${JSON.stringify(res.json)}`)
      })
    })
  })
})
