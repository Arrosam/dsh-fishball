/** Shared external OS boundary and metadata oracles for MULTI-2 HTTP tests. */
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { syncBuiltinESMExports } from 'node:module'
import { REPO } from '../../../../test/support/constants.mjs'
import { MULTI as M } from '../wire/multi-constants.mjs'

const manifest = path.join(REPO, 'packages', 'dsh-connector', 'package.json')
export const implementation = (client) => {
  const result = client.getDiscoverResult()
  assert.equal(result.serverInfo, undefined, 'serverInfo must be in standard _meta, not legacy top-level result')
  return result._meta?.[M.infoKey]
}
export const expected = (base) => ({ name: base + M.suffix, version: JSON.parse(fs.readFileSync(manifest, 'utf8')).version })
export function mockHostname(t, getter) {
  const original = os.hostname
  // Named ESM imports of builtins require synchronization after boundary substitution/restoration.
  t.mock.method(os, 'hostname', getter)
  syncBuiltinESMExports()
  t.after(() => { os.hostname = original; syncBuiltinESMExports() })
}
