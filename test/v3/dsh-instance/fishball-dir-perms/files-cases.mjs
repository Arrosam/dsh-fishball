/**
 * Requirement 1 tests: `ensureFishballDirectory(mainHome)`, `prepareLayout(mainHome)`,
 * and `privateDirectory(dir)` in `packages/dsh-instance/src/native-runtime/files.js`.
 *
 * Designed strictly from requirements using EP, BVA, DT, and ST.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, test } from 'node:test'
import { CODES, FILES, HARNESS, MODES, NON_ABSOLUTE_HOMES } from './constants.mjs'
import {
  createDirWithMode,
  createFileWithMode,
  filesModule,
  hostedRecordModule,
  modeOf,
  octal,
  settle,
  tempHome,
} from './subject.mjs'

const T = { timeout: HARNESS.testTimeoutMs }
const fishballOf = (home) => path.join(home, FILES.fishballDir)

/** Snapshot of every entry under `dir` (recursive, without following symlinks). */
const treeSnapshot = (dir) => fs.readdirSync(dir, { recursive: true }).map(String).sort()

export function registerFilesPermCases(sdk) {
  describe(`dsh-instance native-runtime/files.js permissions (SDK ${sdk})`, () => {
    // ------------------------------------------------------------------ Canonical mainHome (EP)
    describe('canonical mainHome validation (EP)', () => {
      for (const { label, value } of NON_ABSOLUTE_HOMES) {
        test(`ensureFishballDirectory rejects non-absolute mainHome (${label}) with ${CODES.invalidMainHome}`, T, async () => {
          const { ensureFishballDirectory } = await filesModule(sdk)
          const outcome = await settle(() => ensureFishballDirectory(value))
          assert.equal(outcome.error?.code, CODES.invalidMainHome, `got: ${JSON.stringify(outcome)}`)
        })

        test(`prepareLayout rejects non-absolute mainHome (${label}) with ${CODES.invalidMainHome}`, T, async () => {
          const { prepareLayout } = await filesModule(sdk)
          const outcome = await settle(() => prepareLayout(value))
          assert.equal(outcome.error?.code, CODES.invalidMainHome, `got: ${JSON.stringify(outcome)}`)
        })
      }

      for (const kind of ['alias', 'ancestor']) {
        test(`ensureFishballDirectory rejects symlinked mainHome (${kind}) with ${CODES.invalidMainHome} and creates nothing`, T, async (t) => {
          const { ensureFishballDirectory } = await filesModule(sdk)
          const { home, base } = tempHome(t, kind)
          const before = treeSnapshot(base)
          const outcome = await settle(() => ensureFishballDirectory(home))
          assert.equal(outcome.error?.code, CODES.invalidMainHome, `got: ${JSON.stringify(outcome)}`)
          assert.deepEqual(treeSnapshot(base), before, 'must not create anything through symlinked mainHome')
        })

        test(`prepareLayout rejects symlinked mainHome (${kind}) with ${CODES.invalidMainHome} and creates nothing`, T, async (t) => {
          const { prepareLayout } = await filesModule(sdk)
          const { home, base } = tempHome(t, kind)
          const before = treeSnapshot(base)
          const outcome = await settle(() => prepareLayout(home))
          assert.equal(outcome.error?.code, CODES.invalidMainHome, `got: ${JSON.stringify(outcome)}`)
          assert.deepEqual(treeSnapshot(base), before, 'must not create anything through symlinked mainHome')
        })
      }
    })

    // ------------------------------------------------------------------ ensureFishballDirectory (EP + BVA + ST)
    describe('ensureFishballDirectory(mainHome) creation, tightening & refusal (EP + BVA + ST)', () => {
      test('ST: absent <mainHome>/fishball creates directory with 0o700 and returns its path; second call is idempotent', T, async (t) => {
        const { ensureFishballDirectory } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const expected = fishballOf(home)
        assert.equal(fs.existsSync(expected), false)

        const first = await ensureFishballDirectory(home)
        assert.equal(first, expected)
        assert.equal(fs.lstatSync(expected).isDirectory(), true)
        assert.equal(modeOf(expected), MODES.privateDir, `expected 0o700, got ${octal(modeOf(expected))}`)

        const second = await ensureFishballDirectory(home)
        assert.equal(second, expected)
        assert.equal(modeOf(expected), MODES.privateDir)
      })

      test('BVA: existing 0o700 <mainHome>/fishball succeeds unchanged at 0o700', T, async (t) => {
        const { ensureFishballDirectory } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)
        createDirWithMode(dir, MODES.privateDir)

        const result = await ensureFishballDirectory(home)
        assert.equal(result, dir)
        assert.equal(modeOf(dir), MODES.privateDir)
      })

      for (const { label, initial, expected } of MODES.tightenable) {
        test(`BVA/EP tightenable mode ${label}: succeeds and tightens to ${octal(expected)}`, T, async (t) => {
          const { ensureFishballDirectory } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, initial)

          const result = await ensureFishballDirectory(home)
          assert.equal(result, dir)
          assert.equal(
            modeOf(dir),
            expected,
            `expected ${octal(initial)} -> ${octal(expected)}, got ${octal(modeOf(dir))}`,
          )
        })
      }

      test('ST: tightening existing 0o755 <mainHome>/fishball preserves existing files inside', T, async (t) => {
        const { ensureFishballDirectory } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)
        createDirWithMode(dir, MODES.defaultDir)
        const sentinel = path.join(dir, FILES.sentinelFile)
        createFileWithMode(sentinel, FILES.sentinelBody, MODES.privateFile)

        const result = await ensureFishballDirectory(home)
        assert.equal(result, dir)
        assert.equal(modeOf(dir), MODES.privateDir)
        assert.equal(fs.readFileSync(sentinel, 'utf8'), FILES.sentinelBody)
      })

      for (const { label, mode } of MODES.refusedWritable) {
        test(`BVA/EP refused writable mode ${label}: fails with ${CODES.unsafeDirectory} and leaves mode unchanged`, T, async (t) => {
          const { ensureFishballDirectory } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, mode)

          const outcome = await settle(() => ensureFishballDirectory(home))
          assert.equal(outcome.error?.code, CODES.unsafeDirectory, `expected ${CODES.unsafeDirectory}, got ${JSON.stringify(outcome)}`)
          assert.equal(
            modeOf(dir),
            mode,
            `must not modify refused directory mode: expected ${octal(mode)}, got ${octal(modeOf(dir))}`,
          )
        })
      }

      test(`EP: <mainHome>/fishball is a symlink to a real directory -> refuses with ${CODES.unsafeDirectory} without modifying target`, T, async (t) => {
        const { ensureFishballDirectory } = await filesModule(sdk)
        const { home, base } = tempHome(t, 'canonical')
        const target = path.join(base, 'outside-target')
        createDirWithMode(target, MODES.defaultDir)
        fs.symlinkSync(target, fishballOf(home))

        const outcome = await settle(() => ensureFishballDirectory(home))
        assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
        assert.equal(modeOf(target), MODES.defaultDir, 'must not chmod symlink target')
        assert.deepEqual(fs.readdirSync(target), [], 'must not write into symlink target')
      })

      test(`EP: <mainHome>/fishball is a dangling symlink -> refuses with ${CODES.unsafeDirectory}`, T, async (t) => {
        const { ensureFishballDirectory } = await filesModule(sdk)
        const { home, base } = tempHome(t, 'canonical')
        fs.symlinkSync(path.join(base, 'nonexistent-target'), fishballOf(home))

        const outcome = await settle(() => ensureFishballDirectory(home))
        assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
      })

      for (const fileMode of [MODES.privateFile, MODES.privateDir]) {
        test(`EP: <mainHome>/fishball is a regular file (${octal(fileMode)}) -> refuses with ${CODES.unsafeDirectory} and keeps file intact`, T, async (t) => {
          const { ensureFishballDirectory } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const target = fishballOf(home)
          createFileWithMode(target, FILES.sentinelBody, fileMode)

          const outcome = await settle(() => ensureFishballDirectory(home))
          assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
          assert.equal(fs.lstatSync(target).isFile(), true)
          assert.equal(modeOf(target), fileMode)
          assert.equal(fs.readFileSync(target, 'utf8'), FILES.sentinelBody)
        })
      }
    })

    // ------------------------------------------------------------------ prepareLayout parity (DT + ST)
    describe('prepareLayout(mainHome) parity with ensureFishballDirectory & openHostedRecord (DT + ST)', () => {
      test('DT: absent <mainHome>/fishball -> prepareLayout creates <mainHome>/fishball at 0o700', T, async (t) => {
        const { prepareLayout } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)

        await prepareLayout(home)
        assert.equal(fs.lstatSync(dir).isDirectory(), true)
        assert.equal(modeOf(dir), MODES.privateDir)
      })

      test('DT: existing 0o700 <mainHome>/fishball -> prepareLayout succeeds and keeps 0o700', T, async (t) => {
        const { prepareLayout } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)
        createDirWithMode(dir, MODES.privateDir)

        await prepareLayout(home)
        assert.equal(modeOf(dir), MODES.privateDir)
      })

      for (const { label, initial, expected } of MODES.prepareLayoutTightenable) {
        test(`DT: prepareLayout tightens pre-existing ${label} <mainHome>/fishball to ${octal(expected)}`, T, async (t) => {
          const { prepareLayout } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, initial)

          await prepareLayout(home)
          assert.equal(modeOf(dir), expected, `expected ${octal(initial)} -> ${octal(expected)}, got ${octal(modeOf(dir))}`)
        })
      }

      for (const { label, mode } of MODES.refusedWritable) {
        test(`DT: prepareLayout refuses ${label} <mainHome>/fishball with ${CODES.unsafeDirectory} and leaves mode unchanged`, T, async (t) => {
          const { prepareLayout } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const dir = fishballOf(home)
          createDirWithMode(dir, mode)

          const outcome = await settle(() => prepareLayout(home))
          assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
          assert.equal(modeOf(dir), mode, `prepareLayout modified refused mode: ${octal(modeOf(dir))}`)
        })
      }

      test(`DT: prepareLayout refuses symlinked <mainHome>/fishball with ${CODES.unsafeDirectory}`, T, async (t) => {
        const { prepareLayout } = await filesModule(sdk)
        const { home, base } = tempHome(t, 'canonical')
        const outside = path.join(base, 'outside-layout')
        createDirWithMode(outside, MODES.privateDir)
        fs.symlinkSync(outside, fishballOf(home))

        const outcome = await settle(() => prepareLayout(home))
        assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
        assert.deepEqual(fs.readdirSync(outside), [], 'must not populate layout through symlink')
      })

      test(`DT: prepareLayout refuses regular file at <mainHome>/fishball with ${CODES.unsafeDirectory}`, T, async (t) => {
        const { prepareLayout } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const target = fishballOf(home)
        createFileWithMode(target, FILES.sentinelBody, MODES.privateFile)

        const outcome = await settle(() => prepareLayout(home))
        assert.equal(outcome.error?.code, CODES.unsafeDirectory, `got: ${JSON.stringify(outcome)}`)
        assert.equal(fs.lstatSync(target).isFile(), true)
      })

      test('ST parity: prepareLayout followed by openHostedRecord both succeed on pre-existing 0o755 <mainHome>/fishball', T, async (t) => {
        const { prepareLayout } = await filesModule(sdk)
        const { openHostedRecord } = await hostedRecordModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)
        createDirWithMode(dir, MODES.defaultDir)

        await prepareLayout(home)
        assert.equal(modeOf(dir), MODES.privateDir)

        const recordPath = path.join(dir, FILES.hostedRecord)
        const record = await openHostedRecord(recordPath)
        assert.deepEqual(record.entries(), [])
        assert.equal(modeOf(recordPath), MODES.privateFile)
      })

      test('ST parity: ensureFishballDirectory + openHostedRecord followed by prepareLayout both succeed on pre-existing 0o755 <mainHome>/fishball', T, async (t) => {
        const { ensureFishballDirectory, prepareLayout } = await filesModule(sdk)
        const { openHostedRecord } = await hostedRecordModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = fishballOf(home)
        createDirWithMode(dir, MODES.defaultDir)

        const ensured = await ensureFishballDirectory(home)
        assert.equal(ensured, dir)
        assert.equal(modeOf(dir), MODES.privateDir)

        const recordPath = path.join(ensured, FILES.hostedRecord)
        const record = await openHostedRecord(recordPath)
        assert.deepEqual(record.entries(), [])
        assert.equal(modeOf(recordPath), MODES.privateFile)

        await prepareLayout(home)
        assert.equal(modeOf(dir), MODES.privateDir)
      })
    })

    // ------------------------------------------------------------------ privateDirectory stays strict (EP + BVA)
    describe('privateDirectory(dir) remains strictly 0o700-only (EP + BVA)', () => {
      test('creates non-existent directory with mode 0o700', T, async (t) => {
        const { privateDirectory } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = path.join(home, 'strict-new')

        await privateDirectory(dir)
        assert.equal(fs.lstatSync(dir).isDirectory(), true)
        assert.equal(modeOf(dir), MODES.privateDir)
      })

      test('accepts existing 0o700 directory unchanged', T, async (t) => {
        const { privateDirectory } = await filesModule(sdk)
        const { home } = tempHome(t, 'canonical')
        const dir = path.join(home, 'strict-ok')
        createDirWithMode(dir, MODES.privateDir)

        await privateDirectory(dir)
        assert.equal(modeOf(dir), MODES.privateDir)
      })

      for (const { label, mode } of MODES.privateDirectoryRefused) {
        test(`refuses existing ${label} directory with ${CODES.unsafeDirectory} without loosening or tightening mode`, T, async (t) => {
          const { privateDirectory } = await filesModule(sdk)
          const { home } = tempHome(t, 'canonical')
          const dir = path.join(home, 'strict-bad')
          createDirWithMode(dir, mode)

          const outcome = await settle(() => privateDirectory(dir))
          assert.equal(outcome.error?.code, CODES.unsafeDirectory, `expected ${CODES.unsafeDirectory} for ${label}, got ${JSON.stringify(outcome)}`)
          assert.equal(modeOf(dir), mode, `privateDirectory must not alter mode ${label}, got ${octal(modeOf(dir))}`)
        })
      }

      test(`refuses symlink and regular file with ${CODES.unsafeDirectory}`, T, async (t) => {
        const { privateDirectory } = await filesModule(sdk)
        const { home, base } = tempHome(t, 'canonical')
        const outside = path.join(base, 'strict-outside')
        createDirWithMode(outside, MODES.privateDir)
        const link = path.join(home, 'strict-link')
        fs.symlinkSync(outside, link)
        const file = path.join(home, 'strict-file')
        createFileWithMode(file, FILES.sentinelBody, MODES.privateFile)

        assert.equal((await settle(() => privateDirectory(link))).error?.code, CODES.unsafeDirectory)
        assert.equal((await settle(() => privateDirectory(file))).error?.code, CODES.unsafeDirectory)
      })
    })
  })
}
