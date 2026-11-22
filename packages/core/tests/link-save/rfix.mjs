/**
 * R-FIX-CORE black-box rows for core's credentials and Connect (review findings F01, F10, F16;
 * acceptance criteria in the task's requirements, .rfix-requirements.md):
 * - F01: a value in `DSH_AGENT_TOKEN` is bound to the effective target origin when core first sees
 *   it (the reference event, or the first attempt with a usable target); another origin never gets
 *   it; a new write while another target is in force rebinds it; the binding is the durable record
 *   `fishball-core/pending-token-origin`, payload `{v: 1, ref, origin}`, `ref` never the value;
 * - F10: Connect's grant payload holds the `agent_id` it passed as `agentId`; a grant whose
 *   `agentId` is not the current `identity.id` is no credential (link `target-unset`, nothing sent
 *   with it; Connect `needs-authorization`); the id set back makes it usable again; a paired record
 *   whose id differs from the attempt's is held `id-mismatch` even with full scope;
 * - F16: a change of the target, `identity.id` or `connect.clientMetadataUrl` while `begin()` awaits
 *   discovery makes that begin reject with no authorization attempt; a change while an attempt is
 *   pending cancels it; after `dispose()` no begin starts an attempt.
 *
 * Level: integration, in F-LINK-SAVE's world (subject.mjs: the real DSH credential store and
 * authorization, F-PAIR's pairing, the helpers' Connect fake with its approval page).
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from 'fishball-test-helpers/cases'
import { CONNECT, FIXTURE, HARNESS, IDENTITY, K1, LINK, MCP, REDIRECT, RFIX, SUBJECT, WEB } from './constants.mjs'
import { approvalBrowser } from 'fishball-test-helpers/fake-connector'
import { PARENT_SOURCE, linkSaveWorld, untilTrue } from './subject.mjs'
import { TARGETS } from '../support/targets-oracle.mjs'

const S = LINK.state
const C = CONNECT.state

/** The pending binding record's payload, or undefined (DSH's public record read). */
const pendingBinding = async (w) => (await w.ctx.credentials.readRecord(w.names().pendingOrigin))?.payload
/** client_credentials requests that presented `secret` to the listener under `host`. */
const presentedTo = (w, host, secret) => w.f.presented().filter((p) => p.host === `${host}:${w.f.port}` && p.secret === secret)

/**
 * A world whose target is origin A (`FIXTURE.host.other` on another fake that is down, so A never
 * accepts), with a token T of the world's fake (origin B = `FIXTURE.host.first`) to import.
 * `importFirst`: T is in the reference before core starts (bound by the first attempt), else core
 * is running when T arrives (bound by the reference event).
 */
async function pendingForA(t, { importFirst }) {
  const w = await linkSaveWorld(t, { start: false })
  const a = await w.otherConnector()
  const aUrl = a.url(FIXTURE.host.other)
  await a.stop()
  w.settings.set('target', aUrl)
  const token = w.f.addEntry()
  if (importFirst) await w.importToken(token.secret)
  await w.start()
  if (!importFirst) await w.importToken(token.secret)
  await w.untilStatus(S.unreachable)
  return { w, token, aOrigin: new URL(aUrl).origin, bUrl: w.f.url(FIXTURE.host.first) }
}

/** A world authorized through Connect, its grant saved and the link connected. */
async function connectedViaConnect(t) {
  const w = await linkSaveWorld(t)
  const e = w.f.addEntry()
  const b = await w.connect.begin()
  assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
  await approvalBrowser.approve(b.url, { token: e.secret, name: FIXTURE.pageName })
  await w.untilConnect(C.authorized)
  await w.untilStatus(S.connected)
  return { w, e }
}
/** The user saves `identity.id`; F-WIRE tells the link (F-PAIR: `link.reconnect()`). */
const setId = (w, id) => { w.settings.set(IDENTITY.idKey, id); w.link.reconnect() }
/** Whether a recorded MCP body is a JSON-RPC notification (no `id`): the old connection's own teardown. */
const isNotification = (r) => { try { return JSON.parse(r.body).id === undefined } catch { return false } }
/**
 * Requests carrying a credential sent since index `from`: token requests, and MCP requests with an
 * Authorization header. Closing the previous connection (its `notifications/cancelled`) is a
 * teardown, not a use of the grant for the new id, so notifications are not counted.
 */
const credentialedSince = (w, from) => w.f.requests.slice(from).filter((r) => r.listener === WEB.webListener && (r.path === MCP.paths.token || (r.headers.authorization !== undefined && !isNotification(r))))

export function registerRfixLinkSaveCases() {
  // ================================================================ F01: the pending token's origin
  for (const [row, importFirst, how] of [['event', false, 'the reference event'], ['first attempt', true, 'the first attempt']]) {
    caseTest('RFIX-F01-ST-01', `bound by ${row}`, `T bound to origin A by ${how}; the target becomes B → T is never sent to B; B is ${S.unset}`, async (t) => {
      const { w, token, bUrl } = await pendingForA(t, { importFirst })
      w.retarget(bUrl)
      await w.untilStatus(S.unset)
      await sleep(HARNESS.quietMs)
      assert.deepEqual(presentedTo(w, FIXTURE.host.first, token.secret), [], 'the value bound to A was sent to B')
    })
  }
  // MULTI-0 security amendment: the pending record's origin binding moved into
  // TARGETS.credentials.bindingField as the full TargetCredentialBinding {targetId, endpointEpoch, origin, agentId}.
  caseTest('RFIX-F01-EP-01', 'record', `the binding is durable: record ${RFIX.pendingTokenOrigin} holds {v: ${RFIX.pendingVersion}, ref, binding: {targetId: parent, endpointEpoch, origin: A, agentId: identity.id}}; ref is not the value and the value is nowhere in it`, async (t) => {
    const { w, token, aOrigin } = await pendingForA(t, { importFirst: false })
    const payload = await pendingBinding(w)
    assert.ok(payload !== undefined, `no ${RFIX.pendingTokenOrigin} record`)
    assert.deepEqual({ v: payload.v, binding: payload[TARGETS.credentials.bindingField], refType: typeof payload.ref }, { v: RFIX.pendingVersion, binding: { ...PARENT_SOURCE, origin: aOrigin, agentId: FIXTURE.coreId }, refType: 'string' })
    assert.notEqual(payload.ref, token.secret)
    assert.equal(JSON.stringify(payload).includes(token.secret), false, 'the binding record holds the token value')
  })
  caseTest('RFIX-F01-ST-01', 'restart', 'bound to A, then a DSH restart with the target B → the binding holds: T is not sent to B', async (t) => {
    const { w, token, bUrl } = await pendingForA(t, { importFirst: false })
    await w.stop()
    w.settings.set('target', bUrl)
    await w.restart()
    await w.untilStatus(S.unset)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(presentedTo(w, FIXTURE.host.first, token.secret), [])
  })
  caseTest('RFIX-F01-ST-01', 'rebind (same value)', 'bound to A, target B in force, the same value written again → rebound to B: the next attempt for B uses it and connects', async (t) => {
    const { w, token, bUrl } = await pendingForA(t, { importFirst: false })
    w.retarget(bUrl)
    await w.untilStatus(S.unset)
    await w.importToken(token.secret)
    await w.untilStatus(S.connected)
    assert.ok(presentedTo(w, FIXTURE.host.first, token.secret).length > 0, 'B never got the rewritten value')
  })
  caseTest('RFIX-F01-ST-01', 'rebind (new value)', 'bound to A, target B in force, a different value written → bound to B and used; the first value never reaches B', async (t) => {
    const { w, token, bUrl } = await pendingForA(t, { importFirst: false })
    w.retarget(bUrl)
    await w.untilStatus(S.unset)
    const other = w.f.addEntry()
    await w.importToken(other.secret)
    await w.untilStatus(S.connected)
    assert.ok(presentedTo(w, FIXTURE.host.first, other.secret).length > 0)
    assert.deepEqual(presentedTo(w, FIXTURE.host.first, token.secret), [])
  })
  caseTest('RFIX-F01-ST-01', 'back to A', 'bound to A, target B, then A again → A is offered T again (a B attempt in between used nothing)', async (t) => {
    const { w, token, aOrigin, bUrl } = await pendingForA(t, { importFirst: false })
    w.retarget(bUrl)
    await w.untilStatus(S.unset)
    w.retarget(aOrigin + MCP.paths.mcp)
    // A is down, so "offered" is the link trying A (unreachable) rather than target-unset.
    await w.untilStatus(S.unreachable)
    assert.equal((await pendingBinding(w))?.[TARGETS.credentials.bindingField]?.origin, aOrigin, 'the binding moved off A')
    assert.deepEqual(presentedTo(w, FIXTURE.host.first, token.secret), [])
  })

  // ================================================================ F10: the grant's principal
  caseTest('RFIX-F10-EP-01', 'agentId stored', `Connect's grant payload holds agentId = the ${MCP.oauth.agentIdParameter} it passed (identity.id)`, async (t) => {
    const { w } = await connectedViaConnect(t)
    const grants = await w.grants()
    assert.equal(grants.length, 1, 'grant records')
    assert.equal(grants[0].record?.payload?.agentId, FIXTURE.coreId, 'payload.agentId: ' + JSON.stringify(Object.keys(grants[0].record?.payload ?? {})))
  })
  caseTest('RFIX-F10-ST-01', 'id changed', `identity.id changes after Connect → the grant is no credential: link ${S.unset}, nothing sent with it; Connect ${C.needsAuthorization}`, async (t) => {
    const { w } = await connectedViaConnect(t)
    // Harness: the connection's own connect-time poll is over before the change is made.
    await sleep(HARNESS.quietMs)
    const from = w.f.requests.length
    setId(w, RFIX.otherId)
    await w.untilStatus(S.unset)
    await w.untilConnect(C.needsAuthorization)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(credentialedSince(w, from).map((r) => `${r.method} ${r.path} ${r.body.slice(0, 80)}`), [], 'a request carried the grant after the id changed')
  })
  caseTest('RFIX-F10-ST-01', 'id set back', `identity.id changed, then set back to the grant's agentId → the grant is usable again: connected, Connect ${C.authorized}`, async (t) => {
    const { w } = await connectedViaConnect(t)
    setId(w, RFIX.otherId)
    await w.untilStatus(S.unset)
    setId(w, FIXTURE.coreId)
    await w.untilStatus(S.connected)
    await w.untilConnect(C.authorized)
  })
  caseTest('RFIX-F10-ST-01', 'restart with another id', `identity.id edited while core is down → after restart the grant is no credential (${S.unset}, Connect ${C.needsAuthorization})`, async (t) => {
    const { w } = await connectedViaConnect(t)
    await w.stop()
    w.settings.set(IDENTITY.idKey, RFIX.otherId)
    await w.start()
    await w.untilStatus(S.unset)
    await w.untilConnect(C.needsAuthorization)
  })
  // MULTI-0 security amendment ("All four binding members must match before use"): a grant whose
  // binding names another agentId is no credential at all, so the old "use it, then hold
  // id-mismatch" outcome is withdrawn; the row now checks the grant is not used.
  caseTest('RFIX-F10-DT-01', 'record id ≠ attempt id, full scope', 'a grant saved for another id and a paired record of that id → the grant is not used: no pair, no listen, not connected', async (t) => {
    const { w } = await connectedViaConnect(t)
    await w.untilView('paired')
    const [grant] = await w.grants()
    assert.equal(typeof grant?.record?.payload, 'object', 'harness: the grant payload is not an object: ' + typeof grant?.record?.payload)
    await w.stop()
    // A grant from before agentId was stored: the same record without it.
    const entry = (await w.ctx.credentials.listRecords()).find((e) => String(e.key) === grant.key)
    await w.ctx.credentials.modifyRecord(entry.key, async (current) => {
      const { agentId: _dropped, ...payload } = current.payload
      return { ...current, payload }
    })
    w.settings.set(IDENTITY.idKey, RFIX.otherId)
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    const listens = w.f.listens.length
    await w.start()
    await sleep(HARNESS.quietMs)
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs, 'pair was called for a mismatched record')
    assert.equal(w.f.listens.length, listens, 'the link listened while held id-mismatch')
    assert.notEqual(w.status()?.state, S.connected)
  })

  // ================================================================ F16: settings change during begin()
  /** The three settings whose change fences an attempt, and a valid other value for each. */
  const CHANGES = [
    ['target', (w) => w.settings.set('target', w.f.url(FIXTURE.host.other))],
    ['identity.id', (w) => w.settings.set(IDENTITY.idKey, RFIX.otherId)],
    ['connect.clientMetadataUrl', (w) => w.settings.set('cimd', RFIX.otherCimd)],
  ]
  for (const [setting, change] of CHANGES) {
    caseTest('RFIX-F16-DT-01', `${setting} during discovery`, `${setting} changes while begin() awaits discovery → begin rejects; no approval URL, no authorization request; Connect not ${C.authorizing}`, async (t) => {
      const w = await linkSaveWorld(t)
      const release = Promise.withResolvers()
      w.f.script.discoveryHold = release.promise
      const begun = w.connect.begin()
      assert.ok(await untilTrue(() => w.f.stepRequests(REDIRECT.step.protectedResource).length > 0), 'harness: begin() never reached discovery')
      change(w)
      w.f.script.discoveryHold = undefined
      release.resolve()
      await assert.rejects(begun, 'begin() resolved after a settings change during discovery')
      await sleep(HARNESS.quietMs)
      assert.deepEqual(w.f.approvalRequests(), [], 'an authorization request reached the approval page')
      assert.notEqual(w.connectStatus()?.state, C.authorizing)
    })
    caseTest('RFIX-F16-DT-01', `${setting} while pending`, `${setting} changes while the attempt is ${C.authorizing} → the next status() is not ${C.authorizing}; the old URL saves nothing`, async (t) => {
      const w = await linkSaveWorld(t)
      const e = w.f.addEntry()
      const b = await w.connect.begin()
      await w.untilConnect(C.authorizing)
      change(w)
      assert.ok(await untilTrue(() => w.connectStatus()?.state !== C.authorizing), `still authorizing after ${setting} changed: ${JSON.stringify(w.connectStatus())}`)
      await approvalBrowser.approve(b.url, { token: e.secret }).catch(() => undefined)
      await sleep(HARNESS.quietMs)
      assert.deepEqual(await w.grants(), [], 'a grant was saved for an overtaken attempt')
      assert.notEqual(w.connectStatus()?.state, C.authorized)
    })
  }
  caseTest('RFIX-F16-DT-01', 'no change during discovery', `nothing changes while begin() awaits discovery → begin answers the approval URL with ${MCP.oauth.agentIdParameter} = identity.id at begin`, async (t) => {
    const w = await linkSaveWorld(t)
    const release = Promise.withResolvers()
    w.f.script.discoveryHold = release.promise
    const begun = w.connect.begin()
    assert.ok(await untilTrue(() => w.f.stepRequests(REDIRECT.step.protectedResource).length > 0), 'harness: begin() never reached discovery')
    w.f.script.discoveryHold = undefined
    release.resolve()
    const b = await begun
    assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, JSON.stringify(b))
    assert.equal(new URL(b.url).searchParams.get(MCP.oauth.agentIdParameter), FIXTURE.coreId)
  })
  caseTest('RFIX-F16-ST-01', 'dispose during discovery', 'dispose() while begin() awaits discovery → no authorization attempt starts', async (t) => {
    const w = await linkSaveWorld(t)
    const release = Promise.withResolvers()
    w.f.script.discoveryHold = release.promise
    const begun = w.connect.begin().then((v) => ({ v }), (e) => ({ e }))
    assert.ok(await untilTrue(() => w.f.stepRequests(REDIRECT.step.protectedResource).length > 0), 'harness: begin() never reached discovery')
    await w.core.dispose()
    w.f.script.discoveryHold = undefined
    release.resolve()
    const outcome = await begun
    await sleep(HARNESS.quietMs)
    assert.notEqual(outcome.v?.outcome, SUBJECT.outcome.approvalUrl, 'a disposed Connect answered an approval URL')
    assert.deepEqual(w.f.approvalRequests(), [])
  })
  caseTest('RFIX-F16-ST-01', 'begin after dispose', 'after dispose(), begin() starts no attempt: no discovery request, no approval URL', async (t) => {
    const w = await linkSaveWorld(t)
    await w.core.dispose()
    const from = w.f.requests.length
    const outcome = await w.connect.begin().then((v) => ({ v }), (e) => ({ e }))
    await sleep(HARNESS.quietMs)
    assert.notEqual(outcome.v?.outcome, SUBJECT.outcome.approvalUrl, 'a disposed Connect answered an approval URL')
    assert.deepEqual(w.f.requests.slice(from).map((r) => `${r.method} ${r.path}`), [], 'a disposed Connect sent requests')
  })
}
