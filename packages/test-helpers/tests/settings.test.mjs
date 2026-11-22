/** fishball-test-helpers ./settings: DSH's settings service serves a row's volatile fields (EP: served, absent row). */
import assert from 'node:assert/strict'
import test from 'node:test'
import { importDsh } from '../dsh.mjs'
import { assertField, fieldsOf, servedNamespace } from '../settings.mjs'

const ROW = Object.freeze({ id: 'fbtest-row', field: 'everySeconds', fallback: 30 })

test('HLP-SET-EP-01 a volatile number field is read back from the Config and served by DSH under the row id', async () => {
  const { default: Schema } = await importDsh('schemastery')
  const Config = Schema.object({ [ROW.field]: Schema.natural().default(ROW.fallback).description('fbtest').volatile() })
  assertField(fieldsOf(Config)[ROW.field], { type: 'number', volatile: true, default: ROW.fallback, description: 'fbtest' }, ROW.field)
  const served = await servedNamespace({ id: ROW.id, Config })
  assert.equal(served?.ns, ROW.id)
})
