/** Boot with an owner's manager-tool override and observe the real manager conversation. */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { caseTest } from 'fishball-test-helpers/cases'
import { until } from 'fishball-test-helpers/wait'
import { NATIVE_MANAGER } from '../support/core-world.mjs'
import { C } from './constants.mjs'
import { bootWire, wireHome } from './world.mjs'

const PRESET = Object.freeze({ row: 'preset-fishball', id: 'fishball', fileToolsRow: 'tool-fs', fileToolsPlugin: '@deepseek-ai/dsh-tool-fs' })
const NOTICE = Object.freeze({ source: 'fishball-notice', guard: /guards are overridden|tools available beyond its defaults/i })
const OBSERVE_MS = 1000
const TEST = Object.freeze({ timeout: C.budget.boot + C.budget.call * 4 })
const CASES = Object.freeze([
  { label: 'one extra tool', readImage: true, write: true, offered: [...C.baseTools, 'write'] },
  { label: 'one missing tool', readImage: false, write: false, offered: C.baseTools.filter((name) => name !== 'read_image') },
])

for (const { label, readImage, write, offered } of CASES) {
  caseTest('GUARD-SILENT', label, 'Fishball loads and its manager conversation receives no guard-override notice', TEST, async (t) => {
    const homePatch = [{ id: PRESET.row, config: { id: PRESET.id, plugins: [{
      id: PRESET.fileToolsRow, name: PRESET.fileToolsPlugin, config: { read: true, readImage, write, edit: false },
    }] } }]
    const h = await bootWire({ profileConfig: NATIVE_MANAGER, homePatch })
    t.after(() => h.stop())
    const { id: sessionId } = await h.call('ensure')
    assert.ok(sessionId, 'Fishball did not open its manager session')
    // Saving settings after opening the manager exercises the running profile as well as boot.
    assert.deepEqual(await h.call('mutate', { ns: C.core, ops: [{ op: 'set', path: C.modelSeam.path, value: C.selection }] }), { ok: true })
    const probe = async () => {
      const [request] = await h.call('turn', { sessionId })
      assert.ok(request, 'the manager did not complete a scripted turn')
      const native = request.tools.filter((name) => !C.coreTools.includes(name) && !C.privateSkill.test(name))
      assert.deepEqual(native.sort(), [...offered].sort(), 'the owner override must actually take effect')
      const { messages } = await h.call('userMessages', { sessionId, kind: NOTICE.source })
      return messages.filter(({ text }) => NOTICE.guard.test(text)).map(({ text }) => text)
    }
    // Notices queued at activation can surface on a subsequent turn, not the first one.
    let notices
    await until(async () => (notices = await probe()).length, OBSERVE_MS, C.budget.poll)
    assert.deepEqual(notices, [], 'a guard override reached the manager conversation')
  })
}

const LEGACY = Object.freeze({
  guardKey: 'fishball-status:guards:', toolsKey: 'fishball-status:manager-tools:', hash: 'sha256', encoding: 'hex', held: 'held',
  guardText: "Fishball notice: some of Fishball's guards are overridden in this DSH (manager-tools). Its guarantees are weaker until the owner restores them.",
  toolsText: 'Fishball notice: the manager now has tools available beyond its defaults: write. This is for information; nothing needs to be done.',
  historicalText: "Fishball notice: some of Fishball's guards are overridden in this DSH (bundle-order). Its guarantees are weaker until the owner restores them.",
  foreign: 'fbtest-other-plugin', unrelated: 'A regular plugin notification.',
})

caseTest('GUARD-UPGRADE', 'held notices', 'on restart skip unconsumed legacy guard notices, but preserve delivered history and unrelated notices', TEST, async () => {
  const home = wireHome()
  const open = () => bootWire({ home, profileConfig: NATIVE_MANAGER })
  const older = await open()
  const { id: sessionId } = await older.call('ensure')
  const messages = async (h) => (await h.call('userMessages', { sessionId, kind: NOTICE.source })).messages
  const turn = async (h) => assert.ok((await h.call('turn', { sessionId })).length, 'the manager turn did not run')
  const queue = async (dedupeKey, text, pluginId = C.core) => {
    assert.deepEqual(await older.call('managerNotify', { pluginId, dedupeKey, text }), { status: LEGACY.held })
  }
  // Build the older version's durable state via the public API, without depending on its JSONL layout.
  await queue(LEGACY.guardKey + randomUUID(), LEGACY.historicalText)
  await turn(older)
  const history = await messages(older)
  assert.deepEqual(history.map(({ text }) => text), [LEGACY.historicalText])
  await queue(LEGACY.guardKey + randomUUID(), LEGACY.guardText)
  const digest = createHash(LEGACY.hash).update(JSON.stringify(['write'])).digest(LEGACY.encoding)
  await queue(LEGACY.toolsKey + digest, LEGACY.toolsText)
  await queue(LEGACY.guardKey + randomUUID(), LEGACY.unrelated, LEGACY.foreign)
  assert.deepEqual(await messages(older), history, 'held notices made it into the session before restart')
  await older.stop()

  const current = await open()
  assert.equal((await current.call('ensure')).id, sessionId)
  await turn(current)
  const after = await messages(current)
  assert.deepEqual(after.slice(0, history.length), history, 'delivered history was rewritten')
  assert.deepEqual(after.slice(history.length).map(({ text }) => text), [LEGACY.unrelated], 'only the unrelated notice should be delivered')
})
