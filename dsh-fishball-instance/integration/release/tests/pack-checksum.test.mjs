/** REL-ST-01 (BUG-1): --check needs no SDK, sibling release or package build. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { INSTANCE, PACK, check, flipByte, isolatedEnv, sha256, tail } from './support/release.mjs'

const FIXTURE = Object.freeze({
  out: 'release',
  archiveInput: 'archive-input',
  manifest: 'package.json',
  placeholder: '// Checksum regression fixture\n',
  sumSeparator: '  ',
  // The first gzip MTIME byte is outside the compressed payload and its CRC.
  gzipTimestamp: Object.freeze({ name: 'gzip timestamp', offset: () => 4 }),
  mismatch: /\bchecksum mismatch\b/i,
})

function makeRelease(scratch) {
  const out = path.join(scratch, FIXTURE.out)
  for (const dir of PACK.dirs) fs.mkdirSync(path.join(out, dir), { recursive: true })
  for (const file of [...PACK.docs, PACK.helper]) fs.writeFileSync(path.join(out, file), FIXTURE.placeholder)

  const input = path.join(scratch, FIXTURE.archiveInput)
  const pkg = path.join(input, PACK.prefix)
  fs.mkdirSync(pkg, { recursive: true })
  fs.copyFileSync(INSTANCE.manifestFile, path.join(pkg, FIXTURE.manifest))
  const archive = execFileSync('tar', ['-cf', '-', '-C', input, PACK.prefix], { cwd: scratch, env: isolatedEnv(scratch) })
  const pristine = gzipSync(archive)
  const tarball = path.join(out, INSTANCE.tarball)
  fs.writeFileSync(tarball, pristine)
  fs.writeFileSync(path.join(out, PACK.sums), sha256(pristine) + FIXTURE.sumSeparator + INSTANCE.tarball + '\n')
  return { out, tarball, pristine, archive }
}

test('REL-ST-01 tamper: --check verifies tarball bytes offline', async (t) => {
  const scratch = tempRoot(cleanups(t))
  const { out, tarball, pristine, archive } = makeRelease(scratch)
  const valid = await check(scratch, out)
  assert.equal(valid.code, PACK.okExit, 'pristine release: ' + tail(valid.output))

  const offsets = { [FIXTURE.gzipTimestamp.name]: FIXTURE.gzipTimestamp.offset, ...PACK.offsets }
  for (const [where, at] of Object.entries(offsets)) {
    await t.test('valid → altered → restored: ' + where, async () => {
      flipByte(tarball, at(pristine.length))
      // Prove this byte change leaves the archive readable; tar validation alone cannot catch it.
      if (where === FIXTURE.gzipTimestamp.name) assert.deepEqual(gunzipSync(fs.readFileSync(tarball)), archive)
      const altered = await check(scratch, out)
      fs.writeFileSync(tarball, pristine)
      const restored = await check(scratch, out)
      assert.equal(restored.code, PACK.okExit, 'restored release: ' + tail(restored.output))
      assert.ok(typeof altered.code === 'number' && altered.code !== PACK.okExit,
        'expected a nonzero exit for the altered release: ' + tail(altered.output))
      assert.ok(altered.output.split('\n').some((line) => FIXTURE.mismatch.test(line) && line.includes(INSTANCE.tarball)),
        'expected a checksum mismatch naming ' + INSTANCE.tarball + ': ' + tail(altered.output))
    })
  }
})
