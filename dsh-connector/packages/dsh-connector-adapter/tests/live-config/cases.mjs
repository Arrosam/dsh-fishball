/**
 * dsh-connector-adapter live settings (R2, R3), black-box (constants.mjs names the sources;
 * index.js was not read).
 *
 * Techniques: EP (ADP-LC-SC-*: the schema's fields; ADP-LC-EP-01: clientMetadataUrl set / unset),
 * BVA (ADP-LC-BVA-*: serverName 32 / 33 characters, the empty list), ST (ADP-LC-ST-01: [m] → [m, n2]
 * → [n2] → [], each without a remount), DT (ADP-LC-DT-01: schema-invalid change → refused, schema-valid
 * but refused at apply (duplicate name) → the row's own failure).
 *
 * Level: integration: the real adapter as a loader row of an in-process DSH host of each SDK
 * (world.mjs), DSH's own dsh-settings for the served namespace.
 */
import assert from 'node:assert/strict'
import { assertField, fieldsOf, servedNamespace } from 'dsh-connector-test-helpers/dsh/settings-schema'
import { caseTest } from '../oauth-client/cases.mjs'
import { adapterModule } from '../adapter/subject.mjs'
import { ADAPTER_ROW, FIELDS, SERVERS } from './constants.mjs'
import { adapterRowWorld, configOf } from './world.mjs'

const show = (v) => JSON.stringify(v)
const { first: M, second: N2, third: O3 } = SERVERS

/** Asserts a live change kept the row: same fiber, active, apply not run again. */
function assertNotRemounted(w, fiber, label) {
  assert.equal(w.fiber(), fiber, label + ': the row fiber is the same')
  assert.ok(w.active(), label + ': the row is active')
  assert.equal(w.applies(), 1, label + ': the row was not remounted (apply ran once)')
}

export function registerAdapterLiveConfigCases(sdk) {
  // ============================================================================================
  // R2: the schema

  caseTest(sdk, 'ADP-LC-SC-01', 'order', 'Config has clientMetadataUrl then servers', async () => {
    assert.deepEqual(Object.keys(fieldsOf((await adapterModule(sdk)).Config)), [...FIELDS.order])
  })
  caseTest(sdk, 'ADP-LC-SC-01', 'clientMetadataUrl', 'clientMetadataUrl: a volatile string with no default, description kept', async () => {
    assertField(fieldsOf((await adapterModule(sdk)).Config).clientMetadataUrl, { ...FIELDS.clientMetadataUrl, volatile: true }, 'clientMetadataUrl')
  })
  caseTest(sdk, 'ADP-LC-SC-01', 'servers', 'servers: a volatile array of {serverName (pattern, required), url (required)}, default [], descriptions kept', async () => {
    const servers = fieldsOf((await adapterModule(sdk)).Config).servers
    assertField(servers, { ...FIELDS.servers, volatile: true }, 'servers')
    assert.equal(servers.inner?.type, 'object', 'servers holds objects')
    assert.deepEqual(Object.keys(servers.inner.dict), ['serverName', 'url'])
    assertField(servers.inner.dict.serverName, { ...FIELDS.serverName, pattern: ADAPTER_ROW.serverPattern, volatile: false }, 'serverName')
    assertField(servers.inner.dict.url, { ...FIELDS.url, volatile: false }, 'url')
  })
  caseTest(sdk, 'ADP-LC-BVA-01', 1, 'serverName of 32 characters is accepted, 33 and a space are refused; a missing url is refused', async () => {
    const { Config } = await adapterModule(sdk)
    const one = (serverName, url = SERVERS.url(M)) => Config({ servers: [{ serverName, url }] })
    assert.equal(one(SERVERS.name32).servers.get()[0].serverName, SERVERS.name32)
    assert.throws(() => one(SERVERS.name33), undefined, '33 characters')
    assert.throws(() => one(SERVERS.badName), undefined, 'a space and !')
    assert.throws(() => Config({ servers: [{ serverName: M }] }), undefined, 'no url')
    assert.deepEqual(Config({}).servers.get(), [], 'unset → []')
    assert.equal(Config({}).clientMetadataUrl.get(), undefined, 'clientMetadataUrl has no default')
  })
  caseTest(sdk, 'ADP-LC-SC-02', 1, "DSH's settings service serves the dsh-connector-adapter namespace with both fields", async () => {
    const { Config } = await adapterModule(sdk)
    const view = await servedNamespace(sdk, { id: ADAPTER_ROW.name, Config, raw: configOf([M]) })
    assert.ok(view, 'served')
    assert.deepEqual(view.value, configOf([M]))
    assert.deepEqual(view.base, { servers: [] }, 'the base layer: servers [] and no clientMetadataUrl')
  })

  // ============================================================================================
  // R3: a live change of servers re-runs apply

  caseTest(sdk, 'ADP-LC-ST-01', 1, '[m] → [m, n2] live: status() lists both, each needs-authorization; no remount; the sign-in tool stays', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    assert.deepEqual(w.names(), [M], 'started with m: ' + show(w.status()))
    const fiber = w.fiber()
    await w.configure(configOf([M, N2]))
    assert.deepEqual(w.names(), [M, N2], show(w.status()))
    for (const s of w.status().servers) {
      assert.equal(s.state, ADAPTER_ROW.needsAuthorization, s.serverName)
      assert.equal(s.url, SERVERS.url(s.serverName), s.serverName + ' url')
    }
    assertNotRemounted(w, fiber, '[m, n2]')
    assert.ok(w.signInTool(), 'the sign-in tool is registered after the re-run')
  })
  caseTest(sdk, 'ADP-LC-ST-01', 2, '[m, n2] → [n2] → [n2, o3] → []: each change is listed at once, without a remount', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M, N2]))
    const fiber = w.fiber()
    for (const names of [[N2], [N2, O3], []]) {
      await w.configure(configOf(names))
      assert.deepEqual(w.names(), names, show(names) + ': ' + show(w.status()))
    }
    assertNotRemounted(w, fiber, 'the sequence')
  })
  caseTest(sdk, 'ADP-LC-ST-01', 3, 'a changed url of the same server is what status() reports', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    const moved = 'https://moved.fbtest.example/api/agent/mcp'
    await w.configure({ ...configOf([]), servers: [{ serverName: M, url: moved }] })
    assert.deepEqual(w.status().servers.map((s) => [s.serverName, s.url]), [[M, moved]])
  })
  caseTest(sdk, 'ADP-LC-EP-01', 1, 'clientMetadataUrl unset live: every server needs-configuration; set again: needs-authorization', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    const fiber = w.fiber()
    const { clientMetadataUrl, ...noCimd } = configOf([M])
    assert.ok(clientMetadataUrl)
    await w.configure(noCimd)
    assert.equal(w.status().servers[0].state, ADAPTER_ROW.needsConfiguration, show(w.status()))
    await w.configure(configOf([M]))
    assert.equal(w.status().servers[0].state, ADAPTER_ROW.needsAuthorization, show(w.status()))
    assertNotRemounted(w, fiber, 'clientMetadataUrl')
  })
  caseTest(sdk, 'ADP-LC-EP-01', 2, 'a changed clientMetadataUrl alone re-runs without a remount; the servers stay listed', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    const fiber = w.fiber()
    await w.configure(configOf([M], { clientMetadataUrl: SERVERS.otherCimd }))
    assert.deepEqual(w.names(), [M])
    assertNotRemounted(w, fiber, 'other CIMD')
  })

  // ============================================================================================
  // DT: a refused change

  caseTest(sdk, 'ADP-LC-DT-01', 1, 'a schema-invalid live list (serverName of 33 characters) is refused by the Loader: the old list stays, the row stays', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    const fiber = w.fiber()
    await w.configure(configOf([SERVERS.name33]))
    assert.deepEqual(w.names(), [M], show(w.status()))
    assertNotRemounted(w, fiber, 'refused')
  })
  caseTest(sdk, 'ADP-LC-DT-01', 2, 'a schema-valid list the adapter refuses (a duplicate serverName) fails the row itself, as at start', async (t) => {
    const w = await adapterRowWorld(t, sdk, configOf([M]))
    await w.configure(configOf([M, M]))
    assert.equal(w.active(), false, 'the row is not active with a duplicate server')
    assert.ok(w.applies() >= 2, 'the row was restarted (apply ran again): ' + w.applies())
    assert.equal(w.status(), undefined, 'no adapter service while the row is failed')
  })
}
