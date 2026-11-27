/** fishball-test-helpers ./temp-path: containment below a temp root (EP: inside, the root itself, outside, an escaping symlink, a dangling one). */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { tempPath } from '../temp-path.mjs'

const T = Object.freeze({ prefix: 'fbtest-temp-path-', missing: 'missing-leaf', escape: 'escape', dangling: 'dangling' })

test('HLP-TMP-EP-01 inside the root is answered as a real path; the root needs allowRoot; outside, escaping and dangling links are refused', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), T.prefix)))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  assert.equal(tempPath(path.join(root, T.missing), { root }), path.join(root, T.missing))
  assert.throws(() => tempPath(root, { root }))
  assert.equal(tempPath(root, { root, allowRoot: true }), root)
  assert.throws(() => tempPath(path.dirname(root), { root }))
  fs.symlinkSync(os.homedir(), path.join(root, T.escape))
  assert.throws(() => tempPath(path.join(root, T.escape, T.missing), { root }))
  fs.symlinkSync(path.join(root, T.missing), path.join(root, T.dangling))
  assert.throws(() => tempPath(path.join(root, T.dangling), { root }), /dangling/)
})
