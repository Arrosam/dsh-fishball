/** MULTI-2 name/getter system cases, independent of the pending identity-resource seam. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { caseName } from '../../contract/package-boundaries/cases.mjs'
import { BUDGET, FIXTURE, HTTP, K1 } from './constants.mjs'
import { sdkClient } from './world.mjs'
import { MULTI as M } from './multi-constants.mjs'
import { multiWorld as world, saveName, info, expectedInfo, observer, discovered, identity, clientInfo, freshClientId } from './multi-subject.mjs'
const row = (sdk, part, title, fn) => test(caseName(sdk, M.id, part, title), { timeout: BUDGET.testMs }, fn)

export function registerMultiNameCases(sdk) {
  for (const data of M.nameRows) {
    row(sdk, `EP/BVA name ${data.id}`, 'modern metadata preserves base verbatim and appends literal -DSH', async (t) => {
      const w = await world(sdk)
      await w.call('multiHostname', { value: M.hostname })
      await saveName(w, data.value)
      const o = await observer(t, w)
      const base = data.hostname ? M.hostname : data.value
      assert.deepEqual(info(o.client.getDiscoverResult()), expectedInfo(base))
      assert.deepEqual(await discovered(o.client), expectedInfo(base))
      assert.deepEqual(await identity(o.client), expectedInfo(base), 'resource and discovery must preserve the identical unrestricted name')
      assert.equal(o.requests.some((r) => r.method === 'initialize'), false, 'modern client must not negotiate legacy initialize')
    })
  }

  row(sdk, 'EP host independence', 'trusted tunnel and loopback advertise the same name, never URL/Host identity', async (t) => {
    const w = await world(sdk)
    await saveName(w, '')
    await w.call('multiHostname', { value: M.nextHostname })
    const o = await observer(t, w)
    const wire = await sdkClient(sdk)
    const request = { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: { [wire.PROTOCOL_VERSION_META_KEY]: K1.PROTOCOL.version, [wire.CLIENT_INFO_META_KEY]: clientInfo, [wire.CLIENT_CAPABILITIES_META_KEY]: {} } } }
    const host = `${FIXTURE.tunnelHost}:${FIXTURE.tunnelPort}`
    const urls = K1.oauthUrls(`https://${host}`)
    const id = freshClientId(M.idPrefix + '-tunnel')
    const auth = Buffer.from(`${encodeURIComponent(id)}:${encodeURIComponent(o.made.value)}`).toString('base64')
    const granted = await w.raw('POST', K1.PATHS.token, { hostHeader: host, headers: { authorization: `${HTTP.basic} ${auth}`, 'content-type': HTTP.formType }, body: new URLSearchParams({ grant_type: K1.GRANT.clientCredentials, resource: urls.resource }).toString() })
    assert.equal(granted.status, HTTP.ok, granted.text)
    const tunnel = await w.raw('POST', K1.PATHS.mcp, { hostHeader: host, headers: { authorization: `Bearer ${granted.json.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': K1.PROTOCOL.version, 'mcp-method': request.method }, body: JSON.stringify(request) })
    assert.equal(tunnel.status, HTTP.ok, tunnel.text)
    const reply = tunnel.json ?? tunnel.text.split('\n').filter((line) => line.startsWith('data:')).map((line) => JSON.parse(line.slice('data:'.length))).find((message) => message.id === request.id)
    assert.deepEqual(info(reply.result), expectedInfo(M.nextHostname))
    assert.deepEqual(await discovered(o.client), expectedInfo(M.nextHostname))
  })

}
