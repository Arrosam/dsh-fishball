/** EP of persisted records: unrelated settings and incomplete model identities cannot satisfy explicit selection. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, before, describe, it } from 'node:test'
import { STORE } from './support/constants.mjs'
import { MODEL_CASE as C } from './support/dedicated-model.mjs'
import { bootHost, bootLive, newHome } from './support/host.mjs'
import { HOOK, T } from './support/expect.mjs'

describe('Dedicated Fishball model: invalid persisted settings never count as selection', () => {
  let host
  let home
  before(async () => {
    home = newHome('dedicated-model-malformed')
    host = (await bootLive(home, { env: C.env })).host
    await host.stop()
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)
  for (const [partition, record] of C.malformed) {
    it('DM-P01 EP: persisted ' + partition + ' remains unselected', T, async () => {
      const file = STORE.file(home)
      const stored = JSON.parse(fs.readFileSync(file, 'utf8'))
      stored.tables.settings ??= {}
      stored.tables.settings.model = record
      fs.writeFileSync(file, JSON.stringify(stored))
      host = await bootHost(home, { env: C.env })
      try {
        const state = await host.waitStatus(['live', 'failed'])
        assert.equal(state.modelSelection, null, 'a record without a dedicated provider+model identity is not selection')
      } finally { await host.stop() }
    })
  }
})
