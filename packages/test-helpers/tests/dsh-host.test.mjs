/**
 * fishball-test-helpers ./dsh-host: an in-process host with DSH's real credential store. EP over a
 * reference: unset (not configured), set (configured, stored in the host's own file, value never
 * described), unset again. The extra plugin option loads a caller-chosen DSH plugin.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { canonicalTmp, cleanups, openHost, tempRoot } from '../dsh-host.mjs'

const T = Object.freeze({ ref: 'FBTEST_HOST_TOKEN', value: 'fbtest-host-secret-value', prefix: 'fbtest-host-case-' })

async function host(t, options) {
  const scope = cleanups(t)
  const root = tempRoot(scope, T.prefix)
  const h = await openHost(root, options)
  scope.defer(() => h.close())
  return { h, root }
}

test('HLP-HOST-EP-01 credentials: describe → unconfigured; set → configured from the host\'s own file, value not described; unset → unconfigured', async (t) => {
  const { h, root } = await host(t)
  assert.equal(path.dirname(h.credentialsFile), root)
  assert.equal((await h.ctx.credentials.describe(T.ref)).configured, false)
  await h.ctx.credentials.set(T.ref, T.value)
  const described = await h.ctx.credentials.describe(T.ref)
  assert.equal(described.configured, true)
  assert.equal(described.writable, true)
  assert.ok(!JSON.stringify(described).includes(T.value), 'describe never carries the value')
  assert.equal((await h.ctx.credentials.resolve(T.ref)).value, T.value)
  assert.ok(fs.readFileSync(h.credentialsFile, 'utf8').includes(T.ref), 'the reference is stored in the host\'s file')
  await h.ctx.credentials.unset(T.ref)
  assert.equal((await h.ctx.credentials.describe(T.ref)).configured, false)
})

test('HLP-HOST-EP-02 the authorization service is provided, and a caller-chosen DSH plugin loads after it', async (t) => {
  const { h } = await host(t, { plugins: [{ name: 'dsh-system-prompt', export: 'SystemPrompt' }] })
  assert.ok(h.ctx.get('authorization'), 'dsh-authorization')
  assert.ok(h.ctx.get('systemPrompt'), 'dsh-system-prompt')
  assert.equal(typeof h.credentialKey, 'function')
})

test('HLP-HOST-EP-03 tempRoot is a fresh folder under the canonical temp folder, removed by its cleanup', async (t) => {
  let seen
  await t.test('inner', (inner) => { seen = tempRoot(cleanups(inner), T.prefix); assert.equal(path.dirname(seen), canonicalTmp()) })
  assert.equal(fs.existsSync(seen), false)
})
