/** MULTI-2 §3.3: hosted parent owns only its reserved credential names; extras cannot suppress it. */
import assert from 'node:assert/strict'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { FIXTURE, IMPORT } from './constants.mjs'
import { hostedWorld, credentialModule, parseFrame } from './subject.mjs'
import { fakeChildCredentials, memoryWire } from './fakes.mjs'
import { MULTI as M } from '../../dsh-connector/wire/multi-constants.mjs'

import { EXTRA_CREDENTIALS, seedExtraCredentials as seedExtra, assertExtraCredentials as assertExtra } from './multi-fixtures.mjs'

export function registerMultiHostCases(sdk) {
  for (const reserved of ['absent', 'reference', 'record']) {
    caseTest(sdk, M.id, `host DT H2/H3/H4 ${reserved}`, 'extra remote credentials neither satisfy hosted probe nor alter actual-parent import policy', async (t) => {
      const w = await hostedWorld(t, sdk, { credentials: { ref: reserved === 'reference', record: reserved === 'record' } })
      seedExtra(w.credentials)
      await w.hosted.firstStart()
      const made = reserved === 'absent' ? 1 : 0
      assert.equal(w.tokens.calls.created.length, made)
      assert.equal(w.imports().length, made)
      assertExtra(w.credentials)
      assert.ok(w.credentials.calls.describe.every((key) => key === IMPORT.credentialRef), 'host probed an added target reference')
      assert.ok(w.credentials.calls.describeRecord.every((key) => key === IMPORT.savedRecord), 'host probed an added target record')
      if (made) assert.deepEqual(w.credentials.calls.set, [[IMPORT.credentialRef, w.tokens.values()[0]]])
      assert.deepEqual(w.credentials.calls.resolve, [], 'host resolved a secret during presence probe')
    })
  }
  caseTest(sdk, M.id, 'host ST import/core-save/restart/reconnect', 'extra credentials survive first import, core save, restart and explicit reconnect', async (t) => {
    const w = await hostedWorld(t, sdk)
    seedExtra(w.credentials)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1, 'core-saved reserved parent credential was ignored')
    assert.equal(w.imports().length, 1)
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assertExtra(w.credentials)
  })
  caseTest(sdk, M.id, 'host wire EP reserved-only probe', 'real credential receiver answers absent for extra target references/records and writes import only to reserved parent', async (t) => {
    const { createCredentialClient, createCredentialReceiver } = await credentialModule(sdk)
    const credentials = fakeChildCredentials()
    seedExtra(credentials)
    const wire = memoryWire()
    const receiver = createCredentialReceiver({ credentials })
    receiver.attach(wire.child)
    const client = createCredentialClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs })
    t.after(() => { client.close(); receiver.close() })
    assert.equal(await client.probe(), false, 'extra remote credential satisfied reserved hosted presence')
    assert.deepEqual(await client.importToken(FIXTURE.planted), { ok: true })
    assert.equal(await client.probe(), true)
    assert.deepEqual(credentials.calls.set, [[IMPORT.credentialRef, FIXTURE.planted]])
    assertExtra(credentials)
    assert.ok(wire.frames.toChild.map(parseFrame).every((frame) => EXTRA_CREDENTIALS.every((entry) => !JSON.stringify(frame).includes(entry.value))), 'extra secret crossed parent import wire')
  })
}
