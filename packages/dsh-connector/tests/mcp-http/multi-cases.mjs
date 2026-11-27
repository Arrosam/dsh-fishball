/** MULTI-2 lightweight HTTP integration: standard metadata and live OS getter, no product inspection. */
import assert from 'node:assert/strict'
import { caseTest } from 'dsh-connector-test-helpers/cases'
import { httpWorld } from './subject.mjs'
import { FIXTURE, PROTOCOL } from './constants.mjs'
import { MULTI as M } from 'dsh-connector-test-helpers/connector-world/multi-constants'

import { expected, mockHostname, implementation } from './multi-subject.mjs'

export function registerMultiHttpCases(sdk) {
  caseTest(sdk, M.id, 'HTTP EP standard metadata', 'default no-name connector advertises node:os.hostname() plus -DSH in modern server/discover _meta', async (t) => {
    mockHostname(t, () => M.hostname)
    const w = await httpWorld(t, sdk)
    const client = await w.connect(w.principal(FIXTURE.idP).token, PROTOCOL.version)
    assert.deepEqual(implementation(client), expected(M.hostname))
  })
  caseTest(sdk, M.id, 'HTTP ST getter', 'OS hostname changes between live getter reads without endpoint remount/reconnect', async (t) => {
    let hostname = M.hostname
    mockHostname(t, () => hostname)
    const w = await httpWorld(t, sdk)
    const client = await w.connect(w.principal(FIXTURE.idP).token, PROTOCOL.version)
    assert.deepEqual(implementation(client), expected(hostname))
    hostname = M.nextHostname
    const result = await client.discover()
    assert.deepEqual(result._meta?.[M.infoKey], expected(hostname))
    assert.deepEqual(implementation(client), expected(hostname), 'fresh discover replaces stale connect-time metadata')
  })
}
