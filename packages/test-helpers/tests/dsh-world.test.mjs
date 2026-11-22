/**
 * fishball-test-helpers ./dsh-world, system level: one boot of the current DSH with no Fishball
 * package, only the scripted model. Observed through the world ops: waitReady, one session turn
 * answered by a queued script and one by plain text, the model is DSH's default, settings and
 * credentials through DSH's services, a non-Fishball fixture bundle installed from its folder, an
 * extension's op, and the shutdown. EP: a home outside the test homes is refused.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { bootWorld, newHome, removeHome, scenario } from '../dsh-world.mjs'
import { FAKE, FAKE_LLM } from '../fake-llm.mjs'
import { EXTENSION } from './fixtures/world-extension.mjs'

const FIXTURES = path.join(import.meta.dirname, 'fixtures')
const T = Object.freeze({ label: 'fbtest-world', bundle: path.join(FIXTURES, 'world-bundle'), bundleName: 'fbtest-world-bundle', row: 'fbtest-world-row', service: 'fbtestWorldRow', extension: path.join(FIXTURES, 'world-extension.mjs'), text: 'fbtest world answer', ref: 'FBTEST_WORLD_TOKEN', value: 'fbtest-world-secret', strayPrefix: 'fbtest-stray-home-', defaultModelRow: 'agent-default-model' })

const facts = scenario(T.label, [
  async (boot, f) => {
    const h = await boot()
    f.ready = await h.call('waitReady')
    f.info = await h.call('info')
    const { sessionId } = await h.call('create')
    f.scripted = await h.call('turn', { sessionId, scripts: [[{ text: T.text }]] })
    f.plain = await h.call('turn', { sessionId })
    f.third = await h.call('turn', { sessionId })
    f.idle = await h.call('idle', { sessionId })
    f.rows = await h.call('rows', { ids: [T.row] })
    f.services = await h.call('services', { names: [T.service] })
    f.ping = await h.call(EXTENSION.op)
    f.defaultModel = await h.call('settings', { ns: T.defaultModelRow })
    await h.call('credSet', { ref: T.ref, value: T.value })
    f.cred = await h.call('credDescribe', { ref: T.ref })
    f.bundles = await h.call('bundles')
    f.shutdown = await h.call('shutdown')
    f.exited = await new Promise((resolve) => (h.exited ? resolve(h.exited) : h.child.once('exit', (code) => resolve({ code }))))
  },
], { packages: [{ dir: T.bundle }], extension: T.extension })

test('HLP-WORLD-UC-01 the current DSH boots on a test home with no Fishball package and answers waitReady', async () => {
  const f = await facts()
  assert.ifError(f.error)
  assert.equal(f.ready, true)
  assert.equal(f.info.firstStart, true)
  assert.ok(f.info.home.startsWith(f.home))
})

test('HLP-WORLD-UC-02 one session turn reaches the scripted model; a queued script answers first, then plain text', async () => {
  const f = await facts()
  assert.ifError(f.error)
  assert.equal(f.scripted.length, 1, 'one model request for a text answer')
  assert.equal(f.scripted[0].model, FAKE.model)
  assert.equal(f.plain.length, 1)
  assert.ok(f.plain[0].last.some((m) => m.role === 'assistant' && m.text === T.text), 'the second request carries the scripted answer')
  assert.ok(f.third[0].last.some((m) => m.role === 'assistant' && m.text === FAKE_LLM.plainText), 'the third carries the plain answer of the second')
  assert.equal(f.idle, true)
})

test('HLP-WORLD-EP-01 DSH\'s settings show the scripted model as the default; credentials go through DSH\'s service', async () => {
  const f = await facts()
  assert.ifError(f.error)
  assert.deepEqual({ provider: f.defaultModel?.value?.provider, model: f.defaultModel?.value?.model }, { provider: FAKE.provider, model: FAKE.model })
  assert.equal(f.cred.configured, true)
  assert.ok(!JSON.stringify(f.cred).includes(T.value))
})

test('HLP-WORLD-EP-03 a given package folder is installed as a selected bundle, and its row runs', async () => {
  const f = await facts()
  assert.ifError(f.error)
  const bundle = f.bundles.find((b) => b.name === T.bundleName)
  assert.equal(bundle?.enabled, true, JSON.stringify(f.bundles.map((b) => b.name)))
  assert.deepEqual(f.rows, [{ id: T.row, present: true, disabled: false, name: T.bundleName }])
  assert.deepEqual(f.services, { [T.service]: true })
})

test('HLP-WORLD-EP-04 an extension module adds ops that see DSH\'s context, the scripted model and the base helpers', async () => {
  const f = await facts()
  assert.ifError(f.error)
  assert.equal(f.ping.answer, EXTENSION.answer)
  assert.ok(f.ping.requests >= 3)
  assert.equal(f.ping.baseOps, 'function')
  assert.equal(f.ping.cwd, path.join(f.info.home, 'work'))
})

test('HLP-WORLD-ST-01 shutdown ends the DSH process cleanly', async () => {
  const f = await facts()
  assert.ifError(f.error)
  assert.equal(f.shutdown, true)
  assert.equal(f.exited.code, 0)
})

test('HLP-WORLD-EP-02 a home outside the test homes is refused before DSH boots', async (t) => {
  const stray = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), T.strayPrefix))
  t.after(() => fs.rmSync(stray, { recursive: true, force: true }))
  await assert.rejects(bootWorld(stray), /refuses a DSH_HOME outside the test homes/)
  assert.equal(fs.existsSync(path.join(stray, 'profiles')), false, 'nothing was written in the stray home')
  const home = newHome(T.label)
  t.after(() => removeHome(home, T.label))
  assert.ok(home.includes(path.join('.runtime', 'test-homes')))
})