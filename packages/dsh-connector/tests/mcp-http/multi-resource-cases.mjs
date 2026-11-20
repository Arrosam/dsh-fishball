/** MULTI-2 lightweight HTTP integration: standard metadata and live OS getter, no product inspection. */
import assert from 'node:assert/strict'
import { caseTest } from '../../../../test/v3/contract/package-boundaries/cases.mjs'
import { httpWorld } from './subject.mjs'
import { FIXTURE, PROTOCOL } from './constants.mjs'
import { modernRpc, post, wireOf } from './cases.mjs'
import { MULTI as M } from '../wire/multi-constants.mjs'

import { expected, mockHostname } from './multi-subject.mjs'

export function registerMultiHttpResourceCases(sdk) {
  for (const method of ['resources/list', 'resources/read', 'subscriptions/listen']) {
    caseTest(sdk, M.id, `HTTP DT R6 ${method}`, 'identity does not bypass missing/invalid bearer authentication', async (t) => {
      const w = await httpWorld(t, sdk)
      const wire = await wireOf(sdk)
      const params = method === 'resources/read' ? { uri: M.identityUri } : method === 'subscriptions/listen' ? { notifications: { resourceSubscriptions: [M.identityUri] } } : {}
      for (const token of [undefined, 'multi-invalid-bearer']) {
        const response = await post(w, wire, modernRpc(wire, method, { params }), { token })
        assert.equal(response.status, 401, 'identity request was dispatched without an accepted bearer')
        assert.ok(!response.text.includes(M.identityUri), 'authentication refusal leaked identity resource contents')
      }
    })
  }
  caseTest(sdk, M.id, 'HTTP EP identity resource', 'resources/list and real read return the same standard Implementation as discovery', async (t) => {
    mockHostname(t, () => M.hostname)
    const w = await httpWorld(t, sdk)
    const client = await w.connect(w.principal(FIXTURE.idP).token, PROTOCOL.version)
    const listed = await client.listResources()
    assert.equal(listed.resources.filter((r) => r.uri === M.identityUri).length, 1, 'identity must exist, not merely be an honored filter')
    const read = await client.readResource({ uri: M.identityUri })
    assert.equal(read.contents.length, 1)
    assert.equal(read.contents[0].uri, M.identityUri)
    assert.equal(read.contents[0].mimeType, M.mimeType)
    assert.deepEqual(JSON.parse(read.contents[0].text), expected(M.hostname))
  })
}
