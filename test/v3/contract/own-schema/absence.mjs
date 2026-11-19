import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { OWN } from './constants.mjs'

/** F-OWN-SCHEMA, design §1.0b row 1: generation is forbidden, not a packing prerequisite. */
export function assertNoGeneratedSchema() {
  for (const name of [OWN.vendor, OWN.generator]) assert.equal(fs.existsSync(path.join(OWN.core, name)), false, name)
  const manifest = JSON.parse(fs.readFileSync(path.join(OWN.core, 'package.json'), 'utf8'))
  assert.equal(Object.hasOwn(manifest.exports ?? {}, './mcp-schema'), false)
  assert.deepEqual((manifest.files ?? []).filter((s) => /^\.?\/?vendor(?:\/|$)/.test(s)), [])
}
