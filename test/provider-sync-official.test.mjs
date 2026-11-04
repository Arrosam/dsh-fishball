/** SDK fixture contract: official persistence only, 0600, and locked non-overwrite under concurrency. */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { test } from 'node:test'
import { officialCredentials } from './support/provider-sync-official.mjs'

const C = Object.freeze({ route: 'fixture-route', existing: 'fixture-existing', race: 'fixture-race', sourceFiles: ['provider-sync-official.test.mjs', 'support/provider-sync-official.mjs'] })

test('PS-F01 official disposable provider round-trip uses owner-only persistence without exporting a key', async (t) => {
  const fixture = await officialCredentials()
  t.after(() => fixture.close())
  const record = fixture.record()
  await fixture.seed(C.route, record)
  await fixture.assertSame(C.route, record)
  await fixture.assertOwnerOnly()
  const metadata = await fixture.describe(C.route)
  assert.equal(metadata.configured, true)
  assert.equal(metadata.kind, 'api-key')
  fixture.assertNoLeak(metadata)
  for (const file of C.sourceFiles) fixture.assertNoLeak(await fs.readFile(new URL(file, import.meta.url), 'utf8'))
})

test('PS-F02 official locked modifyRecord preserves existing records and admits only one concurrent insertion', async (t) => {
  const fixture = await officialCredentials()
  t.after(() => fixture.close())
  const original = fixture.record()
  await fixture.seed(C.existing, original)
  const refused = await fixture.import(C.existing, fixture.record())
  assert.equal(refused.status, 'exists')
  await fixture.assertSame(C.existing, original)
  const contenders = [fixture.record(), fixture.record()]
  const outcomes = await Promise.all(contenders.map((record) => fixture.import(C.race, record)))
  assert.equal(outcomes.filter((outcome) => outcome.status === 'imported').length, 1)
  assert.equal(outcomes.filter((outcome) => outcome.status === 'exists').length, 1)
  const winner = contenders[outcomes.findIndex((outcome) => outcome.status === 'imported')]
  await fixture.assertSame(C.race, winner)
  await fixture.assertOwnerOnly()
  fixture.assertNoLeak(outcomes)
})
