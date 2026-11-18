/**
 * F-LINK-SAVE black-box cases (USE-CASES.md beside this file): REM-UC-04 (main, alternative and
 * exception flows), REM-ST-01 (one test per transition, plus the invalid ones), and the FLS-* rows:
 * EP (Connect's configuration, the connector check, where values may go, which references core
 * writes, nothing saved before acceptance), DT (which credential core presents, pairing after a
 * save, when the link is told to reconnect) and BVA (the refused-reference retry, the CIMD URL's
 * path, R14's unbounded refresh chain).
 *
 * Level: integration. Core's `createLinkCredentials` (subject.mjs names the relayed surface) runs
 * over the real DSH local credential store and `dsh-authorization` of each SDK, with F-PAIR's real
 * pairing and records over it, against a faithful fake connector (fakes.mjs) whose approval page
 * the owner's scripted browser drives. Observation is public only: DSH's credential store and its
 * events, Connect's and the link's status, the fake's request log, the logger and the files on
 * disk. Expected values are the requirements' (constants.mjs), never the implementation's.
 */
import assert from 'node:assert/strict'
import { setTimeout as sleep } from 'node:timers/promises'
import { caseTest } from '../../contract/package-boundaries/cases.mjs'
import { CONNECT, ENDPOINT, EVENT, FIXTURE, HARNESS, HOSTED_IMPORT, IDENTITY, K1, LINK, LINK_BACKOFF, MCP, OAUTH, PKCE_METHODS, REDIRECT, SUBJECT, WEB, mcpUrl } from './constants.mjs'
import { browser } from './fakes.mjs'
import { linkSaveWorld, untilTrue } from './subject.mjs'
import { registerImportFaultCases } from './import-fault.mjs'
import { registerRfixLinkSaveCases } from './rfix.mjs'
import { registerMultiLinkSaveCases } from './multi.mjs'

const S = LINK.state
const C = CONNECT.state
const CODE_GRANTS = Object.freeze([K1.GRANT.authorizationCode, K1.GRANT.refreshToken])

// ------------------------------------------------------------------ helpers (arrange only)

/** The secrets core presented with client_credentials since index `from` (in order). */
const presentedSince = (w, from = 0) => w.f.presented().slice(from).map((p) => p.secret)
/** How often `secret` was presented since index `from` (token requests, not attempts). */
const timesPresented = (w, secret, from = 0) => presentedSince(w, from).filter((s) => s === secret).length
/**
 * The start times of connection attempts that presented `secret`: one attempt may send several
 * token requests close together (observed: two, a few ms apart), so requests nearer than
 * HARNESS.attemptGapMs to the previous one belong to the same attempt.
 */
function attemptsOf(w, secret) {
  const at = w.f.presented().filter((p) => p.secret === secret).map((p) => p.at)
  return at.filter((v, i) => i === 0 || v - at[i - 1] >= HARNESS.attemptGapMs)
}

/** A world whose hosted import (or standalone reference) holds an accepted token, saved and cleared. */
async function hostedSaved(t, sdk, options = {}) {
  const w = await linkSaveWorld(t, sdk, { ...options, start: false })
  const a = w.f.addEntry()
  await w.importToken(a.secret)
  await w.start()
  await w.untilStatus(S.connected)
  await untilSaved(w, a.secret)
  return { w, a }
}
/** Waits until the hosted copy holds `secret` and the reference is cleared. */
async function untilSaved(w, secret) {
  const ok = await untilTrue(async () => w.holdsValue(await w.hosted(), secret) && !(await w.refConfigured()))
  assert.ok(ok, `the accepted value was not saved and the reference cleared: hosted holds it ${w.holdsValue(await w.hosted(), secret)}, reference configured ${await w.refConfigured()}`)
}

/** Connect begin → the owner approves on the page with `token` and `name` → Connect authorized. */
async function authorize(w, { token, name = FIXTURE.pageName } = {}) {
  const b = await w.connect.begin()
  assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
  const followed = await browser.approve(b.url, { token, name })
  await w.untilConnect(C.authorized)
  return { b, followed }
}
/** A standalone world authorized through Connect with a fresh entry's token. */
async function connected(t, sdk, options = {}) {
  const w = await linkSaveWorld(t, sdk, options)
  const e = w.f.addEntry()
  const flow = await authorize(w, { token: e.secret, name: options.pageName ?? FIXTURE.pageName })
  await w.untilStatus(S.connected)
  return { w, e, ...flow }
}
/** Grants under core's scope whose payload holds any refresh token the fake issued. */
const liveGrants = async (w) => (await w.grants()).filter((g) => w.f.refreshIssued.some((rt) => w.holdsValue(g.record, rt)))
/** The grant the open listen stream authenticated with (client_credentials or a code-path grant). */
const lastListenVia = (w) => w.f.eventListens().at(-1)?.via

/**
 * Waits until the pending attempt ended without a grant (neither authorizing nor authorized). E4
 * and E5 alone check that it ended `failed` (connect.d.ts), so the other rows report their own
 * concern only.
 */
async function untilAttemptEnded(w) {
  const ended = await untilTrue(() => ![C.authorizing, C.authorized].includes(w.connectStatus()?.state))
  assert.ok(ended, `the attempt did not end: ${JSON.stringify(w.connectStatus())}`)
}

/** Nothing the fake issued or saw is outside the credential store (R-SEC-02). */
function assertNoLeak(w, everywhere = []) {
  assert.deepEqual(w.leaks({ everywhere }), [], 'a token, code, verifier or grant value leaked')
}

export function registerLinkSaveCases(sdk) {
  // E-FIX-3: Connect's own MCP client load logs its failure (import-fault.mjs).
  registerImportFaultCases(sdk)
  // R-FIX-CORE (F01, F10, F16): rfix.mjs.
  registerRfixLinkSaveCases(sdk)
  registerMultiLinkSaveCases(sdk)

  // ================================================================ Use Case REM-UC-04 (first)
  caseTest(sdk, 'REM-UC-04', 'main (hosted) 1–3', 'the hosted import is used as client secret with identity.id; once accepted it is saved once and the reference is cleared', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const first = w.f.presented()[0]
    assert.deepEqual({ secret: first.secret === a.secret, clientId: first.clientId }, { secret: true, clientId: FIXTURE.coreId })
    assert.equal(w.recordWrites(HOSTED_IMPORT.savedRecord.key), 1, 'the hosted copy was not written exactly once')
    assert.equal((await w.hosted()).kind, HOSTED_IMPORT.savedRecord.kind)
    assert.equal(await w.holdsCredential(), true, 'the child does not hold a credential (link.d.ts)')
    await w.untilView('paired')
    assertNoLeak(w)
  })

  caseTest(sdk, 'REM-UC-04', 'main (hosted) 4', 'Connect reports authorized once the hosted credential is saved (connect.d.ts)', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    await w.untilConnect(C.authorized)
    assert.equal(w.connectStatus().code, null)
  })

  caseTest(sdk, 'REM-UC-04', 'main (hosted) 5', 'restart after the save: the saved copy connects; no pair, no warning, no second write', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    const from = w.f.presented().length
    const events = w.events.length
    await w.restart()
    await w.untilStatus(S.connected)
    await w.untilView('paired')
    await sleep(HARNESS.quietMs)
    assert.deepEqual([...new Set(presentedSince(w, from))].map((s) => s === a.secret), [true], 'after restart core presented something other than the saved value')
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs, 'pair was called again for the same token value')
    assert.equal(w.recordWrites(HOSTED_IMPORT.savedRecord.key, events), 0, 'the hosted copy was written again')
    assert.equal(await w.refConfigured(), false)
  })

  caseTest(sdk, 'REM-UC-04', 'main (Connect) 1–2', `begin() answers the approval URL: code + PKCE S256, state, resource, ${MCP.oauth.agentIdParameter}=identity.id, the CIMD URL as client id, a loopback ${CONNECT.callback.loopbackPath}`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const b = await w.connect.begin()
    assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
    const url = new URL(b.url)
    const p = url.searchParams
    const redirect = new URL(p.get(OAUTH.redirectUri))
    assert.equal(url.pathname, K1.PATHS.authorize)
    assert.deepEqual({
      responseType: p.get(OAUTH.responseType), method: p.get(OAUTH.codeChallengeMethod), challenge: Boolean(p.get(OAUTH.codeChallenge)), state: Boolean(p.get(OAUTH.state)),
      resource: p.get(OAUTH.resource), agentId: p.get(MCP.oauth.agentIdParameter), clientId: p.get(OAUTH.clientId),
      redirect: `${redirect.protocol}//${redirect.hostname}${redirect.pathname}`, port: Number(redirect.port) > 0,
    }, {
      responseType: MCP.oauth.responseType, method: MCP.oauth.pkceMethod, challenge: true, state: true,
      resource: w.settings.get('target'), agentId: FIXTURE.coreId, clientId: FIXTURE.cimd.valid,
      redirect: `${K1.HOSTS.loopbackScheme}//${WEB.callbackHost}${CONNECT.callback.loopbackPath}`, port: true,
    })
    await w.untilConnect(C.authorizing)
    assert.deepEqual(w.f.codeRequests(), [], 'a code was exchanged before the owner approved')
  })

  caseTest(sdk, 'REM-UC-04', 'main (Connect) 3–5', 'the owner approves: the code is exchanged with no secret, one grant record is saved, Connect is authorized, the link reconnects and works', async (t) => {
    const { w, e } = await connected(t, sdk)
    const grants = await liveGrants(w)
    assert.equal(grants.length, 1, `grant records: ${JSON.stringify((await w.grants()).map((g) => g.key))}`)
    assert.equal(grants[0].kind, HOSTED_IMPORT.savedRecord.kind)
    assert.equal(w.recordWrites(grants[0].key), 1, 'the grant was not saved exactly once after the code exchange')
    assert.ok(w.reconnects >= 1, 'core did not tell the link to reconnect after the grant was saved')
    assert.ok(CODE_GRANTS.includes(lastListenVia(w)), `the link listens with ${lastListenVia(w)}, not the Connect grant`)
    assert.deepEqual(w.f.clientCredentialRequests(), [], 'Connect sent a client_credentials request')
    assert.equal(await w.refConfigured(), false, 'Connect wrote the reference')
    assertNoLeak(w, [e.secret])
  })

  caseTest(sdk, 'REM-UC-04', 'main (Connect) 6', 'pairing after Connect: already-paired with idMatches true writes the paired record, no warning; the page\'s name stands (no set_name)', async (t) => {
    const { w } = await connected(t, sdk)
    await w.untilView('paired')
    const pairs = w.f.callsOf(K1.TOOL.pair)
    assert.ok(pairs.every((c) => c.result?.code === MCP.refusal.alreadyPaired && c.result?.bound?.idMatches === true), `pair results: ${JSON.stringify(pairs.map((c) => c.result))}`)
    assert.equal(w.view().warning ?? null, null, 'the already-paired warning is shown for core\'s own Connect grant')
    assert.deepEqual(w.f.callsOf(K1.TOOL.setName), [], 'set_name was sent although the page set a name')
    assert.equal(w.f.pairs.list()[0].name, FIXTURE.pageName)
  })

  caseTest(sdk, 'REM-UC-04', 'A1', `the page left the name empty: core sends set_name once with its requested name ("${IDENTITY.defaultName}" by default)`, async (t) => {
    const { w } = await connected(t, sdk, { pageName: '' })
    await w.untilView('paired')
    assert.ok(await untilTrue(() => w.f.callsOf(K1.TOOL.setName).length > 0), 'no set_name after the page left the name empty')
    await sleep(HARNESS.quietMs)
    assert.deepEqual(w.f.callsOf(K1.TOOL.setName).map((c) => c.args?.name), [IDENTITY.defaultName])
  })

  caseTest(sdk, 'REM-UC-04', 'A2 (Q-LS1 accepted)', 'a saved credential works and a different token arrives in the reference: core tries the new one first; accepted, it replaces the saved copy once and the reference is cleared', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const b = w.f.addEntry()
    const from = w.f.presented().length
    const events = w.events.length
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    assert.equal(presentedSince(w, from)[0] === b.secret, true, 'the new reference value was not tried first')
    assert.equal(w.holdsValue(await w.hosted(), a.secret), false, 'the old value is still saved for this origin')
    assert.equal(w.recordWrites(HOSTED_IMPORT.savedRecord.key, events), 1)
    // A different value is a different credential (F-PAIR keyed on its non-secret id): core asks pair for it.
    assert.ok(await untilTrue(() => w.f.callsOf(K1.TOOL.pair).some((c) => c.entryKey === b.entryKey)), 'a different token value was not treated as a different credential (no pair on it)')
  })

  caseTest(sdk, 'REM-UC-04', 'A3', 'the hosted copy for an origin is refused; a Connect that completes for that origin replaces it', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    // While the hosted copy works Connect is authorized (connect.d.ts); once its entry is retired,
    // the owner connects with a new entry's token.
    w.f.retireEntry(a.entryKey)
    await w.untilStatus(S.refused)
    await w.untilConnect(C.needsAuthorization)
    await authorize(w, { token: w.f.addEntry().secret })
    assert.ok(await untilTrue(async () => !w.holdsValue(await w.hosted(), a.secret)), 'the hosted copy for this origin is still saved after Connect completed')
    assert.equal((await liveGrants(w)).length, 1)
    assert.ok(await untilTrue(() => CODE_GRANTS.includes(lastListenVia(w))), `the link still uses ${lastListenVia(w)}`)
  })

  caseTest(sdk, 'REM-UC-04', 'A4', 'an accepted reference token replaces the Connect grant for that origin', async (t) => {
    const { w, e } = await connected(t, sdk)
    // The instance's succession retires the old entry (design §5.4), so the new one can take core's id.
    w.f.retireEntry(e.entryKey)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    assert.ok(await untilTrue(async () => (await liveGrants(w)).length === 0), 'a Connect grant for this origin is still saved')
    await w.untilStatus(S.connected)
    await w.untilConnect(C.authorized)
  })

  caseTest(sdk, 'REM-UC-04', 'E1', `the reference token is refused with nothing saved: ${S.refused} / ${LINK.code.refused}; nothing saved; the token stays; core retries`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const x = w.f.unknownToken()
    await w.importToken(x)
    await w.start()
    const status = await w.untilStatus(S.refused)
    assert.equal(status.code, LINK.code.refused)
    assert.ok(await untilTrue(() => timesPresented(w, x) >= 2), 'the refused token was not retried (F-LINK bounded backoff)')
    assert.equal(await w.hostedConfigured(), false, 'a refused value was saved')
    assert.equal(await w.refValue() === x, true, 'the refused value left the reference')
    assert.notEqual(w.connectStatus()?.state, C.authorized)
    assertNoLeak(w)
  })

  caseTest(sdk, 'REM-UC-04', 'E2 (Q-LS1 refused)', 'a saved credential works and a different token arrives and is refused: nothing saved, the token stays, core goes back to the saved credential', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    const from = w.f.presented().length
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x, from) > 0), 'the new reference value was never tried')
    assert.ok(await untilTrue(() => presentedSince(w, from).at(-1) === a.secret && w.status()?.state === S.connected), `core did not go back to the saved credential: ${JSON.stringify(w.status())}`)
    assert.equal(w.holdsValue(await w.hosted(), a.secret), true)
    assert.equal(w.holdsValue(await w.hosted(), x), false, 'the refused value was saved')
    assert.equal(await w.refValue() === x, true, 'the refused value left the reference')
    await w.untilConnect(C.authorized)
  })

  caseTest(sdk, 'REM-UC-04', 'E3 (R12 = B)', `connect.clientMetadataUrl unset: ${C.needsConfiguration} / ${CONNECT.configuration.metadataUrlMissing}; begin() sends nothing`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { cimd: undefined })
    // R12 = B: a missing setting is known without any request, so status() says so before begin().
    await w.untilConnect(C.needsConfiguration)
    assert.deepEqual(await w.connect.begin(), { outcome: SUBJECT.outcome.needsConfiguration, code: CONNECT.configuration.metadataUrlMissing })
    assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [])
    assert.deepEqual(w.connectStatus(), { state: C.needsConfiguration, code: CONNECT.configuration.metadataUrlMissing })
  })

  caseTest(sdk, 'REM-UC-04', 'E4', `the owner cancels on the page: ${C.failed} (code ${K1.OAUTH_ERROR.accessDenied} or null); nothing saved`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const b = await w.connect.begin()
    await browser.approve(b.url, { decision: OAUTH.decision.cancel })
    await untilAttemptEnded(w)
    assert.deepEqual(await w.grants(), [])
    assert.deepEqual(w.f.codeRequests(), [])
    const status = await w.untilConnect(C.failed)
    assert.ok([K1.OAUTH_ERROR.accessDenied, null].includes(status.code), `failed code ${status.code} (connect.d.ts: the OAuth error or null)`)
  })

  caseTest(sdk, 'REM-UC-04', 'E5', `the code exchange is refused (${K1.OAUTH_ERROR.invalidGrant}): ${C.failed}; nothing saved; the link is not told to reconnect`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const e = w.f.addEntry()
    w.f.script.codeError = K1.OAUTH_ERROR.invalidGrant
    const b = await w.connect.begin()
    await browser.approve(b.url, { token: e.secret })
    await untilAttemptEnded(w)
    assert.deepEqual(await w.grants(), [])
    assert.equal(w.reconnects, 0)
    assertNoLeak(w, [e.secret])
    const status = await w.untilConnect(C.failed)
    assert.ok([K1.OAUTH_ERROR.invalidGrant, null].includes(status.code), `failed code ${status.code} (connect.d.ts: the OAuth error or null)`)
  })

  const forged = [
    ['E6 (iss)', 'a wrong iss on the callback', (location) => location.searchParams.set(OAUTH.iss, FIXTURE.wrong.otherOrigin + MCP.paths.issuer)],
    ['E7 (state)', 'a wrong state on the callback', (location) => location.searchParams.set(OAUTH.state, location.searchParams.get(OAUTH.state) + 'x')],
  ]
  for (const [row, label, mutate] of forged) {
    caseTest(sdk, 'REM-UC-04', row, `${label}: the code is not exchanged, nothing is saved, Connect is not authorized`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      const e = w.f.addEntry()
      const b = await w.connect.begin()
      await browser.approve(b.url, { token: e.secret, mutate })
      await untilTrue(() => w.connectStatus()?.state !== C.authorizing, HARNESS.quietMs)
      await sleep(HARNESS.quietMs)
      assert.notEqual(w.connectStatus()?.state, C.authorized)
      assert.deepEqual(w.f.codeRequests(), [], 'the code was exchanged')
      assert.deepEqual(await w.grants(), [])
    })
  }

  caseTest(sdk, 'REM-UC-04', 'E8 (R9 origin)', 'the target origin changes: a new first connection; the value saved for the old origin is never sent to the new one', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    w.retarget(mcpUrl(FIXTURE.host.other, w.f.port))
    await untilTrue(() => w.status()?.state !== S.connected)
    await sleep(HARNESS.quietMs)
    const otherHost = `${FIXTURE.host.other}:${w.f.port}`
    assert.deepEqual(w.f.presented().filter((p) => p.host === otherHost && p.secret === a.secret).length, 0, 'the old origin\'s value went to the new origin')
    assert.notEqual(w.status()?.state, S.connected)
    assert.ok(await untilTrue(() => w.connectStatus()?.state !== C.authorized), `Connect is still authorized for an origin with no saved credential: ${JSON.stringify(w.connectStatus())}`)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    assert.ok(w.f.presented().some((p) => p.host === otherHost && p.secret === b.secret), 'the new origin\'s accepted value was not the one saved')
  })

  caseTest(sdk, 'REM-UC-04', 'E9', `refresh answers ${K1.OAUTH_ERROR.invalidGrant}: tokens dropped, Connect shows ${C.needsAuthorization} once, no retry loop`, async (t) => {
    const { w } = await connected(t, sdk)
    w.f.script.refreshError = K1.OAUTH_ERROR.invalidGrant
    const changes = w.connectChanges.length
    w.f.dropAccess()
    await w.untilConnect(C.needsAuthorization)
    const refreshes = w.f.refreshRequests().length
    await sleep(HARNESS.quietMs * 2)
    assert.equal(w.f.refreshRequests().length, refreshes, 'core kept refreshing after invalid_grant')
    assert.equal(w.connectChanges.slice(changes).filter((s) => s.state === C.needsAuthorization).length, 1, `Connect changes: ${JSON.stringify(w.connectChanges.slice(changes))}`)
    assert.notEqual(w.status()?.state, S.connected)
    assert.deepEqual((await liveGrants(w)).map((g) => g.key), [], 'the dead refresh token is still saved')
  })

  // ================================================================ State Transition REM-ST-01
  // Saved-credential states for one target origin: None, RefPending, RefRefused, Saved,
  // SavedNewRef, SavedRefusedRef, SavedRefused; Connect states CONNECT.state.
  caseTest(sdk, 'REM-ST-01', 1, 'None → reference set → RefPending → accepted → Saved (written once, reference cleared)', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    assert.equal(await w.holdsCredential(), false)
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    await untilSaved(w, a.secret)
    assert.equal(w.recordWrites(HOSTED_IMPORT.savedRecord.key), 1)
  })

  caseTest(sdk, 'REM-ST-01', 2, `RefPending → refused → RefRefused (${S.refused}, nothing saved, the value stays)`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    await w.untilStatus(S.refused)
    assert.equal(await w.hostedConfigured(), false)
    assert.equal(await w.refValue() === x, true)
  })

  caseTest(sdk, 'REM-ST-01', 3, 'RefRefused → a different value accepted → Saved (the refused value is never saved)', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    await w.untilStatus(S.refused)
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    await untilSaved(w, a.secret)
    await w.untilStatus(S.connected)
    assert.equal(w.holdsValue(await w.hosted(), x), false)
  })

  caseTest(sdk, 'REM-ST-01', 4, 'Saved → reconnect → Saved (the saved copy, no second write)', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const events = w.events.length
    const from = w.f.presented().length
    w.f.dropAccess()
    await untilTrue(() => w.f.presented().length > from)
    await w.untilStatus(S.connected)
    assert.deepEqual([...new Set(presentedSince(w, from))].map((s) => s === a.secret), [true])
    assert.equal(w.recordWrites(HOSTED_IMPORT.savedRecord.key, events), 0)
  })

  caseTest(sdk, 'REM-ST-01', 5, 'Saved → a different value in the reference → SavedNewRef → accepted → Saved (new value)', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
  })

  caseTest(sdk, 'REM-ST-01', 6, 'SavedNewRef → refused → SavedRefusedRef (connected on the saved copy; the value stays)', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    await w.untilStatus(S.connected)
    assert.equal(w.holdsValue(await w.hosted(), a.secret), true)
    assert.equal(await w.refValue() === x, true)
  })

  caseTest(sdk, 'REM-ST-01', 7, 'SavedRefusedRef → reconnects → stays: the refused value is not sent again', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    await w.untilStatus(S.connected)
    const sent = timesPresented(w, x)
    const from = w.f.presented().length
    w.link.reconnect()
    w.f.dropAccess()
    await untilTrue(() => w.f.presented().length > from)
    await w.untilStatus(S.connected)
    await sleep(HARNESS.quietMs)
    assert.equal(timesPresented(w, x), sent, 'the refused reference value was sent again with no change')
  })

  caseTest(sdk, 'REM-ST-01', '7 (same value)', 'SavedRefusedRef → the same value written again → stays: not sent again', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    await w.untilStatus(S.connected)
    const sent = timesPresented(w, x)
    await w.importToken(x)
    await sleep(HARNESS.quietMs)
    assert.equal(timesPresented(w, x), sent, 'the refused value was sent again after the same value was written again')
  })

  caseTest(sdk, 'REM-ST-01', 8, 'SavedRefusedRef → the reference value changes → SavedNewRef: the new value is tried', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    const y = w.f.unknownToken()
    await w.importToken(y)
    assert.ok(await untilTrue(() => timesPresented(w, y) > 0), 'the changed reference value was not tried')
    await w.untilStatus(S.connected)
  })

  caseTest(sdk, 'REM-ST-01', 9, 'SavedRefusedRef → restart → SavedNewRef: the reference value is tried again once', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    const sent = timesPresented(w, x)
    await w.restart()
    assert.ok(await untilTrue(() => timesPresented(w, x) > sent), 'after a restart the reference value was not tried again')
    await w.untilStatus(S.connected)
  })

  caseTest(sdk, 'REM-ST-01', 10, `Saved → the saved copy is refused (revoked) → SavedRefused: ${S.refused} / ${LINK.code.revoked}; the copy stays; Connect not authorized`, async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    w.f.setEnabled(a.entryKey, false)
    const status = await w.untilStatus(S.refused)
    assert.equal(status.code, LINK.code.revoked)
    assert.ok(await untilTrue(() => w.connectStatus()?.state !== C.authorized), `Connect still ${JSON.stringify(w.connectStatus())}`)
    assert.equal(w.holdsValue(await w.hosted(), a.secret), true, 'R9: a refused copy is replaced only once a different value is accepted')
  })

  caseTest(sdk, 'REM-ST-01', 11, 'SavedRefused → the entry is enabled again → Saved: connected on the same copy, no pair', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    w.f.setEnabled(a.entryKey, false)
    await w.untilStatus(S.refused)
    w.f.setEnabled(a.entryKey, true)
    await w.untilStatus(S.connected)
    await w.untilConnect(C.authorized)
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs)
  })

  caseTest(sdk, 'REM-ST-01', 12, `SavedRefused → a different value accepted → Saved (the refused copy is replaced)`, async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    w.f.retireEntry(a.entryKey)
    await w.untilStatus(S.refused)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    assert.equal(w.holdsValue(await w.hosted(), a.secret), false)
    await w.untilStatus(S.connected)
    await w.untilView('paired')
  })

  caseTest(sdk, 'REM-ST-01', 13, `Connect ${C.needsConfiguration} → a valid CIMD URL is set → ${C.needsAuthorization}`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { cimd: undefined })
    assert.equal((await w.connect.begin()).outcome, SUBJECT.outcome.needsConfiguration)
    w.settings.set('cimd', FIXTURE.cimd.valid)
    const b = await w.connect.begin()
    assert.equal(b.outcome, SUBJECT.outcome.approvalUrl, `begin() after the setting answered ${JSON.stringify(b)}`)
  })

  caseTest(sdk, 'REM-ST-01', 14, `Connect ${C.needsAuthorization} → begin → ${C.authorizing}; a second begin answers the same URL`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await w.untilConnect(C.needsAuthorization)
    const first = await w.connect.begin()
    await w.untilConnect(C.authorizing)
    const second = await w.connect.begin()
    assert.deepEqual(second, first)
  })

  caseTest(sdk, 'REM-ST-01', 15, `Connect ${C.authorizing} → cancel() → not authorizing; the old URL saves nothing`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const e = w.f.addEntry()
    const b = await w.connect.begin()
    await w.untilConnect(C.authorizing)
    w.connect.cancel()
    assert.ok(await untilTrue(() => [C.needsAuthorization, C.failed].includes(w.connectStatus()?.state)), `after cancel: ${JSON.stringify(w.connectStatus())}`)
    await browser.approve(b.url, { token: e.secret }).catch(() => undefined)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(await w.grants(), [])
    assert.notEqual(w.connectStatus()?.state, C.authorized)
  })

  caseTest(sdk, 'REM-ST-01', 16, `Connect ${C.authorizing} → approved → ${C.authorized}; begin() then answers authorized and opens nothing`, async (t) => {
    const { w } = await connected(t, sdk)
    const pages = w.f.approvalRequests().length
    assert.deepEqual(await w.connect.begin(), { outcome: SUBJECT.outcome.authorized })
    assert.equal(w.f.approvalRequests().length, pages)
  })

  caseTest(sdk, 'REM-ST-01', 17, `Connect after a cancelled attempt → begin → ${C.authorizing} → approved → ${C.authorized}`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const first = await w.connect.begin()
    await browser.approve(first.url, { decision: OAUTH.decision.cancel })
    await untilAttemptEnded(w)
    const e = w.f.addEntry()
    await authorize(w, { token: e.secret })
    await w.untilStatus(S.connected)
  })

  caseTest(sdk, 'REM-ST-01', 18, `Connect ${C.authorized} → restart → ${C.authorized} with no browser, the link connects on the saved grant`, async (t) => {
    const { w } = await connected(t, sdk)
    await w.untilView('paired')
    const pages = w.f.approvalRequests().length
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    await w.restart()
    await w.untilConnect(C.authorized)
    await w.untilStatus(S.connected)
    await w.untilView('paired')
    assert.equal(w.f.approvalRequests().length, pages)
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs, 'pair was called again after a restart on the same grant')
  })

  caseTest(sdk, 'REM-ST-01', 19, `Connect ${C.authorized} → access token dies → single-flight refresh rotates the grant in place; still ${C.authorized}`, async (t) => {
    const { w } = await connected(t, sdk)
    const keys = (await w.grants()).map((g) => g.key)
    const issued = w.f.refreshIssued.length
    w.f.dropAccess()
    assert.ok(await untilTrue(() => w.f.refreshIssued.length > issued), 'no refresh after the access token died')
    await w.untilStatus(S.connected)
    const newest = w.f.refreshIssued.at(-1)
    assert.ok(await untilTrue(async () => (await w.grants()).some((g) => w.holdsValue(g.record, newest))), 'the rotated refresh token was not saved')
    assert.deepEqual((await w.grants()).map((g) => g.key), keys, 'refresh wrote another record instead of rotating in place')
    await w.untilConnect(C.authorized)
  })

  caseTest(sdk, 'REM-ST-01', 'invalid (begin while needs-configuration)', `begin() in ${C.needsConfiguration} answers the code and stays; nothing is sent`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { cimd: FIXTURE.cimd.notHttps })
    assert.equal((await w.connect.begin()).outcome, SUBJECT.outcome.needsConfiguration)
    const b = await w.connect.begin()
    assert.equal(b.outcome, SUBJECT.outcome.needsConfiguration)
    assert.equal(w.connectStatus().state, C.needsConfiguration)
    assert.deepEqual(w.f.approvalRequests(), [])
  })

  caseTest(sdk, 'REM-ST-01', 'invalid (callback replayed)', 'a callback replayed after Connect completed changes nothing (one save)', async (t) => {
    const { w, followed } = await connected(t, sdk)
    const key = (await liveGrants(w))[0].key
    const events = w.events.length
    await globalThis.fetch(followed.location, { redirect: 'manual' }).then((r) => r.arrayBuffer()).catch(() => undefined)
    await sleep(HARNESS.quietMs)
    assert.equal(w.recordWrites(key, events), 0, 'a replayed callback wrote the grant again')
    assert.equal(w.f.codeRequests().length, 1)
  })

  // ================================================================ Equivalence Partitioning
  // FLS-EP-01: connect.clientMetadataUrl classes (R12 = B; CONNECT.configuration).
  const cimdRows = [
    [1, 'absent', undefined, CONNECT.configuration.metadataUrlMissing],
    [2, 'empty', FIXTURE.cimd.empty, CONNECT.configuration.metadataUrlMissing],
    [3, 'http: with a path', FIXTURE.cimd.notHttps, CONNECT.configuration.metadataUrlNotHttps],
    [4, 'https: root path', FIXTURE.cimd.rootSlash, CONNECT.configuration.metadataUrlRootPath],
    [5, 'https: no path', FIXTURE.cimd.noPath, CONNECT.configuration.metadataUrlRootPath],
  ]
  for (const [row, label, cimd, code] of cimdRows) {
    caseTest(sdk, 'FLS-EP-01', row, `CIMD URL ${label} → ${C.needsConfiguration} / ${code}; nothing sent`, async (t) => {
      const w = await linkSaveWorld(t, sdk, { cimd })
      assert.deepEqual(await w.connect.begin(), { outcome: SUBJECT.outcome.needsConfiguration, code })
      assert.deepEqual(w.f.approvalRequests(), [])
      assert.deepEqual(w.connectStatus(), { state: C.needsConfiguration, code })
    })
  }
  caseTest(sdk, 'FLS-EP-01', 6, `a valid https CIMD URL → ${C.needsAuthorization}, begin answers an approval URL`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await w.untilConnect(C.needsAuthorization)
    assert.equal((await w.connect.begin()).outcome, SUBJECT.outcome.approvalUrl)
  })

  // FLS-BVA-02: the CIMD URL's path at its boundary (root vs the shortest non-root path).
  caseTest(sdk, 'FLS-BVA-02', 1, `path "/" (root) → ${CONNECT.configuration.metadataUrlRootPath}`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { cimd: FIXTURE.cimd.rootSlash })
    assert.deepEqual(await w.connect.begin(), { outcome: SUBJECT.outcome.needsConfiguration, code: CONNECT.configuration.metadataUrlRootPath })
  })
  caseTest(sdk, 'FLS-BVA-02', 2, 'path "/a" (one character) → accepted', async (t) => {
    const w = await linkSaveWorld(t, sdk, { cimd: FIXTURE.cimd.shortestPath })
    assert.equal((await w.connect.begin()).outcome, SUBJECT.outcome.approvalUrl)
  })

  // FLS-EP-02: the connector check (not-a-connector), before any authorization request.
  const otherOrigin = () => [FIXTURE.wrong.otherOrigin + MCP.paths.issuer]
  const connectorRows = [
    [1, 'resource path is not the MCP path', { resource: (origin) => origin + FIXTURE.wrong.resourcePath }],
    [2, 'first authorization server on another origin', { authorizationServers: otherOrigin }],
    [3, 'first authorization server on another path', { authorizationServers: (origin) => [origin + FIXTURE.wrong.issuerPath] }],
    [4, `scopes_supported without ${MCP.scope.full}`, { scopes: [FIXTURE.wrong.scope] }],
    [5, 'scopes_supported absent', { scopes: null }],
  ]
  for (const [row, label, metadata] of connectorRows) {
    caseTest(sdk, 'FLS-EP-02', row, `${label} → ${C.needsConfiguration} / ${CONNECT.configuration.notAConnector}; no authorization request`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.metadata = metadata
      const b = await w.connect.begin()
      assert.deepEqual(b, { outcome: SUBJECT.outcome.needsConfiguration, code: CONNECT.configuration.notAConnector })
      assert.deepEqual({ state: w.connectStatus().state, code: w.connectStatus().code }, { state: C.needsConfiguration, code: CONNECT.configuration.notAConnector })
      assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [])
    })
  }
  caseTest(sdk, 'FLS-EP-02', 6, `the connector's own metadata passes (resource ${MCP.paths.mcp}, issuer ${MCP.paths.issuer}, scope ${MCP.scope.full})`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    assert.equal((await w.connect.begin()).outcome, SUBJECT.outcome.approvalUrl)
  })

  // ================================================================ F-FIX security rows (audit .runtime/reports/x-sec-audit.md)
  // X-11 (design §6.3 "credentials are never forwarded on a redirect"): no OAuth request of Connect
  // or its token manager follows a redirect. EP over the four steps × BVA over the redirect
  // statuses (every 3xx that names a Location: 301, 302, 303, 307, 308). The Location is the fake's
  // trap, another origin: any request there is a followed redirect.
  const discoverySteps = [REDIRECT.step.protectedResource, REDIRECT.step.authorizationServer]
  for (const status of REDIRECT.statuses) {
    for (const step of discoverySteps) {
      caseTest(sdk, 'X-11', `${step} ${status}`, `${step} answered ${status}: not followed (the Location gets no request); no approval URL; Connect ends ${C.failed}`, async (t) => {
        const w = await linkSaveWorld(t, sdk)
        w.f.script.redirect = { step, status }
        const b = await w.connect.begin().catch((error) => ({ rejected: String(error) }))
        assert.notEqual(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
        assert.ok(w.f.stepRequests(step).length > 0, `precondition: Connect never asked for ${step}`)
        await w.untilConnect(C.failed)
        assert.deepEqual(w.f.trapRequests(), [], 'a redirect was followed')
        assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [])
      })
    }
    caseTest(sdk, 'X-11', `${REDIRECT.step.codeExchange} ${status}`, `${REDIRECT.step.codeExchange} answered ${status}: the code and code_verifier never reach the Location; nothing saved; Connect ends ${C.failed}`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      const e = w.f.addEntry()
      w.f.script.redirect = { step: REDIRECT.step.codeExchange, status }
      const b = await w.connect.begin()
      assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
      await browser.approve(b.url, { token: e.secret })
      assert.ok(await untilTrue(() => w.f.codeRequests().length > 0), 'precondition: the code was never sent to the token endpoint')
      await w.untilConnect(C.failed)
      await sleep(HARNESS.quietMs)
      assert.deepEqual(w.f.trapRequests().map((r) => `${r.method} ${r.path}`), [], 'the code exchange followed a redirect')
      assert.deepEqual(await w.grants(), [], 'a grant was saved')
      assert.equal(w.reconnects, 0, 'the link was told to reconnect')
    })
    caseTest(sdk, 'X-11', `${REDIRECT.step.refresh} ${status}`, `${REDIRECT.step.refresh} answered ${status}: the refresh_token never reaches the Location; no new token is stored`, async (t) => {
      const { w } = await connected(t, sdk)
      const before = await w.grants()
      const from = w.f.stepRequests(REDIRECT.step.refresh).length
      w.f.script.redirect = { step: REDIRECT.step.refresh, status }
      w.f.dropAccess()
      assert.ok(await untilTrue(() => w.f.stepRequests(REDIRECT.step.refresh).length > from), 'precondition: no refresh after the access token died')
      await sleep(HARNESS.quietMs)
      assert.deepEqual(w.f.trapRequests().map((r) => `${r.method} ${r.path}`), [], 'the refresh followed a redirect')
      const after = await w.grants()
      assert.deepEqual(after.map((g) => [g.key, JSON.stringify(g.record?.payload ?? null)]), before.map((g) => [g.key, JSON.stringify(g.record?.payload ?? null)]), 'the saved grant changed after a redirected refresh')
    })
  }

  // X-12 (audit X-12, X-11 "pin token_endpoint to the target origin"): after discovery and before
  // any authorization request, the authorization server's two endpoints are checked. EP over the
  // endpoint classes, BVA at the loopback-name boundary (127.0.0.1 vs 127.0.0.2, localhost vs
  // foo.localhost) and at "exactly" (another port, the other loopback name, a trailing slash).
  const refusedNotAConnector = async (w) => {
    const b = await w.connect.begin()
    assert.deepEqual(b, { outcome: SUBJECT.outcome.needsConfiguration, code: CONNECT.configuration.notAConnector })
    assert.deepEqual({ state: w.connectStatus().state, code: w.connectStatus().code }, { state: C.needsConfiguration, code: CONNECT.configuration.notAConnector })
    assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [], 'an authorization request was made')
  }
  const tokenEndpointOf = (w) => w.origin() + MCP.paths.token
  for (const [label, url] of ENDPOINT.authorizeRefused) {
    caseTest(sdk, 'X-12', `authorization_endpoint ${label}`, `authorization_endpoint ${label} (${url ?? 'absent'}) → ${C.needsConfiguration} / ${CONNECT.configuration.notAConnector}; no approval URL, no authorization request`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = () => ({ authorization_endpoint: url })
      await refusedNotAConnector(w)
    })
  }
  for (const [label, url] of ENDPOINT.authorizeAccepted) {
    caseTest(sdk, 'X-12', `authorization_endpoint ${label}`, `authorization_endpoint ${label} (${url}) is accepted: begin() answers an approval URL at that endpoint`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = () => ({ authorization_endpoint: url })
      const b = await w.connect.begin()
      assert.equal(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
      const at = new URL(b.url)
      assert.equal(at.origin + at.pathname, new URL(url).origin + new URL(url).pathname)
      await w.untilConnect(C.authorizing)
    })
  }
  for (const [label, make] of ENDPOINT.tokenRefused) {
    caseTest(sdk, 'X-12', `token_endpoint ${label}`, `token_endpoint ${label} → ${C.needsConfiguration} / ${CONNECT.configuration.notAConnector}; no approval URL, no authorization request`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = (origin) => ({ token_endpoint: make(origin) })
      await refusedNotAConnector(w)
    })
  }
  // Re-baselined (F-FIX requirement correction): a document the metadata schema refuses is a failed
  // discovery, not a connector refusal. An absent endpoint, or one that is no URL, makes the RFC 8414
  // document invalid: begin() rejects, Connect reads failed, and nothing is sent to any
  // authorization endpoint.
  for (const [label, overrides] of ENDPOINT.invalidDocument) {
    caseTest(sdk, 'X-12', label, `${label}: the authorization-server document is invalid → begin() rejects, Connect ${C.failed}; no approval URL, no authorization request`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = () => overrides
      await assert.rejects(w.connect.begin(), 'begin() did not reject on an invalid authorization-server document')
      await w.untilConnect(C.failed)
      assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [], 'an authorization request was made')
    })
  }
  caseTest(sdk, 'X-12', 'token_endpoint exactly <target origin>/api/agent/oauth/token', 'the exact token endpoint is accepted (and the exchange goes there): approval URL, then authorized', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    w.f.script.authorizationServer = () => ({ token_endpoint: tokenEndpointOf(w) })
    await authorize(w, { token: w.f.addEntry().secret })
  })

  // X-13 (audit X-13; MCP Authorization, R-OA-02 "clients MUST refuse an AS without it"): S256 is
  // required in code_challenge_methods_supported. EP: absent, empty, without S256 / with S256.
  for (const [label, methods] of PKCE_METHODS.refused) {
    caseTest(sdk, 'X-13', `code_challenge_methods_supported ${label}`, `code_challenge_methods_supported ${label} → no approval URL, no authorization request; Connect ends ${C.failed}`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = () => ({ code_challenge_methods_supported: methods })
      const b = await w.connect.begin().catch((error) => ({ rejected: String(error) }))
      assert.notEqual(b?.outcome, SUBJECT.outcome.approvalUrl, `begin() answered ${JSON.stringify(b)}`)
      await w.untilConnect(C.failed)
      assert.deepEqual([...w.f.approvalRequests(), ...w.f.codeRequests()], [], 'an authorization request was made')
    })
  }
  for (const [label, methods] of PKCE_METHODS.accepted) {
    caseTest(sdk, 'X-13', `code_challenge_methods_supported ${label}`, `code_challenge_methods_supported ${JSON.stringify(methods)} is accepted: approval URL with S256, then authorized`, async (t) => {
      const w = await linkSaveWorld(t, sdk)
      w.f.script.authorizationServer = () => ({ code_challenge_methods_supported: methods })
      const { b } = await authorize(w, { token: w.f.addEntry().secret })
      assert.equal(new URL(b.url).searchParams.get(OAUTH.codeChallengeMethod), MCP.oauth.pkceMethod)
    })
  }

  // FLS-EP-03: where secret values may be (R-SEC-02, R10).
  caseTest(sdk, 'FLS-EP-03', 1, 'hosted path: no token or access token in any log, status, setting, pairing record or home file', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    await w.restart()
    await w.untilStatus(S.connected)
    assertNoLeak(w)
  })
  caseTest(sdk, 'FLS-EP-03', 2, 'Connect path: no code, verifier, access or refresh token outside the credential store; the typed connector token is nowhere, the store included', async (t) => {
    const { w, e } = await connected(t, sdk)
    w.f.dropAccess()
    await untilTrue(() => w.f.refreshRequests().length > 0)
    await w.untilStatus(S.connected)
    assertNoLeak(w, [e.secret])
  })
  caseTest(sdk, 'FLS-EP-03', 3, 'refused paths: a refused reference token and a failed code exchange leave no value in logs or statuses', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await w.importToken(w.f.unknownToken())
    await w.untilStatus(S.refused)
    const e = w.f.addEntry()
    w.f.script.codeError = K1.OAUTH_ERROR.invalidGrant
    const b = await w.connect.begin()
    await browser.approve(b.url, { token: e.secret })
    await untilAttemptEnded(w)
    assertNoLeak(w, [e.secret])
  })

  // FLS-EP-04: which references core writes (link.d.ts: only DSH_AGENT_TOKEN, and only its unset).
  caseTest(sdk, 'FLS-EP-04', 1, `core never writes a user's reference; it only clears ${HOSTED_IMPORT.credentialRef} after a save`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const own = w.f.unknownToken()
    await w.ctx.credentials.set(w.names().userRef, own)
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    await w.start()
    await untilSaved(w, a.secret)
    await sleep(HARNESS.quietMs)
    assert.equal((await w.ctx.credentials.resolve(w.names().userRef))?.value === own, true, 'the user\'s reference changed')
    const refEvents = w.events.filter((e) => e.event === EVENT.referenceUpdated)
    assert.deepEqual(refEvents.map((e) => e.subject), [FIXTURE.userRef, HOSTED_IMPORT.credentialRef, HOSTED_IMPORT.credentialRef], 'reference writes other than ours and core\'s one unset')
  })
  caseTest(sdk, 'FLS-EP-04', 2, `core's records (a Connect grant, then a hosted copy) are only under its own scope ${CONNECT.grantRecordScope}`, async (t) => {
    const { w, e } = await connected(t, sdk)
    const outside = async () => (await w.recordKeys()).filter((k) => !k.startsWith(CONNECT.grantRecordScope + '/'))
    assert.deepEqual(await outside(), [])
    w.f.retireEntry(e.entryKey)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    assert.deepEqual(await outside(), [])
  })

  // FLS-EP-05: nothing is saved before the first acceptance.
  caseTest(sdk, 'FLS-EP-05', 1, 'target unreachable with a reference token: nothing saved, the reference keeps the value', async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    await w.f.stop()
    await w.start()
    await w.untilStatus(S.unreachable)
    await sleep(HARNESS.quietMs)
    assert.equal(await w.hostedConfigured(), false)
    assert.equal(await w.refValue() === a.secret, true)
  })
  caseTest(sdk, 'FLS-EP-05', 2, `Connect ${C.authorizing}: no grant record before the callback`, async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await w.connect.begin()
    await w.untilConnect(C.authorizing)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(await w.grants(), [])
  })

  // ================================================================ Decision Tables
  // FLS-DT-01: which credential core presents to the current origin.
  caseTest(sdk, 'FLS-DT-01', 'rule 1', 'nothing saved, no reference → nothing sent; not connected', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await sleep(HARNESS.quietMs)
    assert.deepEqual(w.f.clientCredentialRequests(), [])
    assert.notEqual(w.status()?.state, S.connected)
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 2', 'nothing saved, a reference → the reference value', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    assert.ok(await untilTrue(() => timesPresented(w, a.secret) > 0))
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 3', 'a saved copy, no reference → the saved copy', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const from = w.f.presented().length
    w.f.dropAccess()
    assert.ok(await untilTrue(() => w.f.presented().length > from))
    assert.deepEqual([...new Set(presentedSince(w, from))].map((s) => s === a.secret), [true])
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 4', 'a saved copy, the same value in the reference → that value only; no new pair', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    const from = w.f.presented().length
    await w.importToken(a.secret)
    w.f.dropAccess()
    await untilTrue(() => w.f.presented().length > from)
    await w.untilStatus(S.connected)
    await sleep(HARNESS.quietMs)
    assert.deepEqual([...new Set(presentedSince(w, from))].map((s) => s === a.secret), [true])
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs, 'the same token value was paired again')
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 5', 'a saved copy, a different never-refused reference value → the reference value first', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const b = w.f.addEntry()
    const from = w.f.presented().length
    await w.importToken(b.secret)
    assert.ok(await untilTrue(() => presentedSince(w, from).length > 0))
    assert.equal(presentedSince(w, from)[0] === b.secret, true)
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 6', 'a saved copy, a reference value refused in this run → the saved copy only', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    const x = w.f.unknownToken()
    await w.importToken(x)
    assert.ok(await untilTrue(() => timesPresented(w, x) > 0))
    await w.untilStatus(S.connected)
    const from = w.f.presented().length
    w.f.dropAccess()
    assert.ok(await untilTrue(() => w.f.presented().length > from))
    await w.untilStatus(S.connected)
    assert.deepEqual([...new Set(presentedSince(w, from))].map((s) => s === a.secret), [true])
  })
  caseTest(sdk, 'FLS-DT-01', 'rule 7', 'a copy saved for another origin only, no reference → nothing sent to this origin', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    const other = await w.otherConnector()
    w.retarget(other.url())
    await sleep(HARNESS.quietMs)
    assert.deepEqual(other.clientCredentialRequests(), [], 'a saved value went to another connector')
    assert.notEqual(w.status()?.state, S.connected)
  })

  // FLS-DT-02: pairing after a save (F-PAIR keyed on origin and the credential's non-secret id).
  caseTest(sdk, 'FLS-DT-02', 'rule 1', 'the same value, saved, after a restart → no pair, no warning', async (t) => {
    const { w } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    const pairs = w.f.callsOf(K1.TOOL.pair).length
    await w.restart()
    await w.untilView('paired')
    await sleep(HARNESS.quietMs)
    assert.equal(w.f.callsOf(K1.TOOL.pair).length, pairs)
    assert.equal(w.view().warning ?? null, null)
  })
  caseTest(sdk, 'FLS-DT-02', 'rule 2', 'a different value accepted (old entry retired) → a different credential: pair on it, then paired', async (t) => {
    const { w, a } = await hostedSaved(t, sdk)
    await w.untilView('paired')
    w.f.retireEntry(a.entryKey)
    const b = w.f.addEntry()
    await w.importToken(b.secret)
    await untilSaved(w, b.secret)
    await w.untilView('paired')
    assert.ok(w.f.callsOf(K1.TOOL.pair).some((c) => c.entryKey === b.entryKey && c.result?.ok === true))
  })
  caseTest(sdk, 'FLS-DT-02', 'rule 3', 'a Connect grant whose entry the page bound to core\'s id → already-paired (match) → paired, no warning', async (t) => {
    const { w } = await connected(t, sdk)
    await w.untilView('paired')
    assert.equal(w.view().warning ?? null, null)
  })
  caseTest(sdk, 'FLS-DT-02', 'rule 4', 'a hosted token whose entry is already bound to core\'s id (not Connect) → F-PAIR\'s warning still shows', async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const a = w.f.addEntry()
    await w.f.pairs.pair(a.entryKey, FIXTURE.coreId, undefined, FIXTURE.t0)
    await w.importToken(a.secret)
    await w.start()
    await w.untilView('warnMatch')
  })

  // FLS-DT-03: when core tells the link to reconnect (relayed onChange).
  caseTest(sdk, 'FLS-DT-03', 'rule 1', 'a new non-empty value in the reference → onChange; core\'s own unset after the save does not fire it again', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await sleep(HARNESS.quietMs)
    const before = w.reconnects
    const a = w.f.addEntry()
    await w.importToken(a.secret)
    await untilSaved(w, a.secret)
    await sleep(HARNESS.quietMs)
    assert.equal(w.reconnects - before, 1)
  })
  caseTest(sdk, 'FLS-DT-03', 'rule 2', 'a Connect attempt saved a grant → onChange once', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    await sleep(HARNESS.quietMs)
    const before = w.reconnects
    await authorize(w, { token: w.f.addEntry().secret })
    await sleep(HARNESS.quietMs)
    assert.equal(w.reconnects - before, 1)
  })
  caseTest(sdk, 'FLS-DT-03', 'rule 3', 'a failed Connect attempt → no onChange', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    const before = w.reconnects
    const b = await w.connect.begin()
    await browser.approve(b.url, { decision: OAUTH.decision.cancel })
    await untilAttemptEnded(w)
    await sleep(HARNESS.quietMs)
    assert.equal(w.reconnects, before)
  })
  caseTest(sdk, 'FLS-DT-03', 'rule 4', 'after dispose(), a new reference value fires nothing', async (t) => {
    const w = await linkSaveWorld(t, sdk)
    let fired = 0
    const dispose = w.core.onChange(() => { fired += 1 })
    await w.core.dispose()
    await w.importToken(w.f.addEntry().secret)
    await sleep(HARNESS.quietMs)
    dispose()
    assert.equal(fired, 0)
  })

  // ================================================================ Boundary Value Analysis
  // FLS-BVA-01: a refused reference token with nothing saved is retried with LINK_BACKOFF (1 s, 2 s, …).
  caseTest(sdk, 'FLS-BVA-01', 1, `refused reference, nothing saved: retries no sooner than ${LINK_BACKOFF.initialMs} ms, then at least ${LINK_BACKOFF.initialMs * LINK_BACKOFF.factor} ms apart`, async (t) => {
    const w = await linkSaveWorld(t, sdk, { start: false })
    const x = w.f.unknownToken()
    await w.importToken(x)
    await w.start()
    await sleep(HARNESS.backoffWindowMs)
    const at = attemptsOf(w, x)
    assert.ok(at.length >= 2, `retried ${at.length - 1} times in ${HARNESS.backoffWindowMs} ms`)
    const gaps = at.slice(1).map((v, i) => v - at[i])
    gaps.forEach((gap, n) => assert.ok(gap >= Math.min(LINK_BACKOFF.initialMs * LINK_BACKOFF.factor ** n, LINK_BACKOFF.maxMs) - HARNESS.backoffSlackMs, `gap ${n} was ${gap} ms (${JSON.stringify(gaps)})`))
  })

  // FLS-BVA-03 (R14): no refresh-chain age cap.
  caseTest(sdk, 'FLS-BVA-03', 1, 'a grant ten years old still refreshes: no chain-age cap; Connect stays authorized', async (t) => {
    const { w } = await connected(t, sdk)
    w.skew(FIXTURE.farFutureMs)
    const issued = w.f.refreshIssued.length
    w.f.dropAccess()
    assert.ok(await untilTrue(() => w.f.refreshIssued.length > issued), 'no refresh for an old grant')
    await w.untilStatus(S.connected)
    await w.untilConnect(C.authorized)
  })
}
