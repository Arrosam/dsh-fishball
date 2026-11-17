/**
 * I-HOST black-box cases (.runtime/reports/v3-w4-briefs.md "I-HOST"; v3-remaining-plan §4–§6;
 * docs/test-design/v3/08-hosted.md as amended by the requirements at `design/v3-token-reveal`).
 * Requirements R-HOST-01…10, R-BND-01…04, R-ARCH-05, R-ARCH-10, R-FB-10 (1.39), R-FB-12, R-FB-14;
 * design §1.0, §1.0b, §1.0c, §4.1, §5.4, §6.1, §6.2; the user's I-HOST decisions (R1, R6 = B, R8/R11,
 * Q-B2, Q-G3, Q-G7, QD1 = B, Q1…Q7).
 *
 * Techniques:
 * - Use Case: HOST-UC-01 (first start, import once), HOST-UC-02 (restart, retry, reconnect of the
 *   link create nothing), HOST-UC-04 (disable / delete), HOST-UC-05 (remote target), HOST-UC-06
 *   (lifecycle, launch overlay, uninstall);
 * - EP: HOST-EP-01 (what the host row may inject), HOST-EP-02 (where the hosted value may appear,
 *   reworded by R1), UIM-EP-02 (hostnames), the transport frame classes, the settings-page routes;
 * - BVA: the ticket's 30 000 ms life (29 999 / 30 000 / 30 001), replay (use 1 / use 2), the
 *   audience port (±1), the targetUrl blank boundary ('' / '   ' / one character);
 * - Decision Table: HOST-DT-01 (does the instance create a hosted token?), targetStatus (Q3 A),
 *   reconnect's refusals, childTargetUrl;
 * - State Transition: HOST-ST-01 rows 4–10 (row 8 amended: no fishball-off), HOST-ST-03 (new: the
 *   hosted value's lifecycle; delete then Retry → notice, no token).
 *
 * Levels: unit (manifests, contracts, static import scans, pure exports) and integration (the real
 * modules wired over in-process fakes: fake K3 `dshConnectorTokens`, fake child credential store,
 * in-memory transports, a fake lifecycle). No child process and no hosted child is launched: a row
 * that needs one is registered as skipped and names it.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { caseName, caseTest, describeRef, unitOf } from '../../contract/package-boundaries/cases.mjs'
import { V3 } from '../../contract/package-boundaries/constants.mjs'
import { observe, readManifest } from '../../contract/package-boundaries/packages.mjs'
import { contracts, member, serviceMembers, vocabulary } from '../../contract/k3-host-services/contracts.mjs'
import { FOLDER } from '../../contract/k3-host-services/constants.mjs'
import { requireModule } from '../../dsh-connector-adapter/oauth-client/subject.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { shelvedTraces } from '../../release/pack/release.mjs'
import {
  ADMISSION_KEY_FIELD, CONNECTOR_MCP, FIXTURE, FISHBALL_SIDE, HEX64, HOSTNAME, IMPORT, K3, MOVED, PAGE, PLACEMENT, RELAYED, ROUTE, SECRET_LIKE,
  SESSION_LIKE, SKIP, SYNC_HOST, UI_FREEZE,
} from './constants.mjs'
import { fakeChildCredentials, fakeProviderSync, memoryWire, routeContext } from './fakes.mjs'
import {
  admissionWorld, codeOf, constantsModule, credentialModule, hostedModule, hostedWorld, instanceModule, parseFrame, recordFile, recordModule,
  routesWorld, runtimeModule, scratch, settle, textOf, tick, ticketModule,
} from './subject.mjs'

const show = (v) => JSON.stringify(v)
const skipped = (sdk, id, row, title, reason) => test(caseName(sdk, id, row, title), { skip: reason }, () => {})

export function registerIHostCases(sdk) {
  // ===================================================================== HOST-UC-01: first hosted start
  caseTest(sdk, 'HOST-UC-01', 'main 2–3', 'no credential in the child (blank target, connector usable) → exactly one createHosted(instanceId), its value imported once on the wire', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.tokens.calls.created, [FIXTURE.instanceId])
    assert.equal(w.imports().length, 1, 'import frames: ' + show(w.imports()))
    assert.equal(w.imports()[0].value, w.tokens.values()[0])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 3', "the child-side receiver writes exactly ctx.credentials.set('DSH_AGENT_TOKEN', value) and nothing else", async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.credentials.calls.set, [[IMPORT.credentialRef, w.tokens.values()[0]]])
    assert.deepEqual([w.credentials.calls.unset, w.credentials.calls.other], [[], []], 'other credential writes')
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'the presence question is DSH\'s own: describe(DSH_AGENT_TOKEN) and/or describeRecord(fishball-core/hosted-agent); no value is resolved', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.ok(w.credentials.calls.describe.includes(IMPORT.credentialRef), 'describe calls ' + show(w.credentials.calls.describe))
    assert.deepEqual(w.credentials.calls.resolve, [], 'a value was resolved')
    for (const key of w.credentials.calls.describeRecord) assert.equal(key, IMPORT.savedRecord)
  })
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'the entry key is recorded only after the child answered saved (store write before the record add)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1])
    assert.deepEqual(w.order, ['child-set', 'record-add'])
  })
  caseTest(sdk, 'HOST-UC-01', 'main 6', 'after the first start the locator reports target status connected (blank target, last entry enabled)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.connected, code: null })
  })
  // Re-baselined by I-SUCCEED (the user's Q3 = A, 2026-11-17): hosted.json gains `runtime`, the child runtime id the newest entry was created under.
  caseTest(sdk, 'HOST-UC-01', 'main 2', 'the hosted record file is <mainHome>/fishball/hosted.json, mode 0600, {format: 1, instanceId, entries: [entryKey], runtime}, and holds no token value', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    const file = recordFile(w.mainHome)
    assert.ok(fs.existsSync(file), 'no ' + file)
    assert.equal(fs.statSync(file).mode & 0o777, RELAYED.record.mode)
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(typeof json[RELAYED.record.idKey], 'string')
    assert.deepEqual(json, { format: RELAYED.record.format, [RELAYED.record.idKey]: json[RELAYED.record.idKey], entries: [FIXTURE.entryPrefix + 1], [RELAYED.record.runtimeKey]: FIXTURE.runtimeId })
    for (const v of w.tokens.values()) assert.equal(fs.readFileSync(file, 'utf8').includes(v), false, 'token value in the record')
  })
  // Re-baselined (SHELVE-BOARD): the blocking bundle was fishball-board, which a child no longer holds
  // ("不要预留在子实例的Fishball内", the user, 2026-11-18); fishball-ui is a member the child does hold.
  caseTest(sdk, 'HOST-UC-01', 'E1', 'a blocked start reports {state: failed, code: PROFILE_INCOMPATIBLE, plugin: <the bundle>} through the locator', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.failed, code: K3.code.incompatible, plugin: V3.ui.name } })
    const status = w.locator.status()
    assert.deepEqual([status.state, status.code, status.plugin], [K3.state.failed, K3.code.incompatible, V3.ui.name])
  })
  skipped(sdk, 'HOST-UC-01', 'main 4–5', 'core authenticates with its own identity.id, pairs, and the hosted entry becomes the default designated agent', SKIP.hosted('HOST-UC-01 main 4–5'))
  skipped(sdk, 'HOST-UC-01', 'E2', 'fishball-core disabled: the child starts anyway (no fishball-off from the instance, Q4)', SKIP.hosted('HOST-UC-01 E2'))

  // ===================================================================== HOST-UC-02: restarts and reconnects create nothing
  for (const [row, title, act] of [
    ['main', 'a child restart (new wire, credential present)', (w) => w.restart()],
    ['main', 'a crash and restart after core saved its copy (reference unset, record present)', async (w) => { w.credentials.coreSaves(); await w.restart() }],
    ['A1', 'a host DSH restart (a new wire again)', (w) => w.restart()],
    ['main', 'a reconnect of the link (the wire drops and comes back, credential present)', async (w) => { w.wire.lose(); await w.restart() }],
    ['main', 'Retry while the child is ready', (w) => w.locator.retry()],
  ]) {
    caseTest(sdk, 'HOST-UC-02', row, `${title} → no createHosted, no import frame`, async (t) => {
      const w = await hostedWorld(t, sdk)
      await w.hosted.firstStart()
      await act(w)
      assert.equal(w.tokens.calls.created.length, 1, 'createHosted calls ' + show(w.tokens.calls.created))
      assert.equal(w.imports().length, 1, 'import frames after ' + title)
    })
  }
  caseTest(sdk, 'HOST-UC-02', 'post', 'the connector has exactly the entries it had before the restarts (one)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    for (let i = 0; i < 3; i++) await w.restart()
    assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1])
  })

  // ===================================================================== HOST-UC-04: the user disables or deletes the hosted entry
  caseTest(sdk, 'HOST-UC-04', 'main', 'disabled → targetStatus token-refused / token-revoked; a restart and a Retry create no replacement', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.disabled)
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.refused, code: K3.code.revoked })
    await w.restart()
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1)
  })
  caseTest(sdk, 'HOST-UC-04', 'main', 'disabled then re-enabled → connected again, with the same entry (no replacement)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.disabled)
    await w.locator.retry()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.enabled)
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.connected, code: null })
    assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1])
  })
  caseTest(sdk, 'HOST-UC-04', 'A1', 'deleted → no automatic createHosted; Retry creates none either (R6 = B) and records the notice hosted-entry-deleted', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1, 'created after the delete')
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1, 'Retry created a token')
    assert.equal(w.hosted.notice(), RELAYED.notice)
  })
  caseTest(sdk, 'HOST-UC-04', 'A1', 'after a delete, Reconnect (one click) creates exactly one new entry and imports it once; the notice clears', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    await w.locator.retry()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.equal(w.hosted.notice(), null)
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.connected, code: null })
  })
  caseTest(sdk, 'HOST-UC-04', 'E1', 'a delete is never a reinstall: Retry and Reconnect call no retire (no succession)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    assert.deepEqual(w.tokens.calls.retired, [])
  })

  // ===================================================================== HOST-UC-05: remote target
  caseTest(sdk, 'HOST-UC-05', 'post', 'a remote targetUrl: the first start calls no createHosted and sends no import, even with no credential and a connector present', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    await w.hosted.firstStart()
    assert.deepEqual(w.tokens.calls.created, [])
    assert.deepEqual(w.imports(), [])
  })
  caseTest(sdk, 'HOST-UC-05', 'E1', 'a remote targetUrl: targetStatus is {target-unreachable, TARGET_UNREACHABLE} (Q3 A: the DSH side cannot see it)', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.unreachable, code: K3.code.unreachable })
  })
  caseTest(sdk, 'HOST-UC-05', 'main', 'a remote targetUrl: Reconnect refuses target-remote and creates nothing', async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.remote })
    assert.deepEqual(await w.locator.reconnect(), { ok: false, code: K3.reconnect.remote })
    assert.deepEqual(w.tokens.calls.created, [])
  })
  skipped(sdk, 'HOST-UC-05', 'main', 'core authenticates against the remote connector after the user presses Connect in Fishball', SKIP.hosted('HOST-UC-05 main'))

  // ===================================================================== HOST-UC-06: lifecycle with the host DSH
  caseTest(sdk, 'HOST-UC-06', 'A1', 'a crashed child reports its code; Retry restarts it (failed → starting)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.failed, code: K3.code.exited } })
    assert.deepEqual([w.locator.status().state, w.locator.status().code], [K3.state.failed, K3.code.exited])
    await w.locator.retry()
    assert.equal(w.lifecycle.calls.retry, 1)
    assert.equal(w.locator.status().state, K3.state.starting)
  })
  skipped(sdk, 'HOST-UC-06', 'main', 'the child starts only after the host app ready; when the host exits, the child stops', SKIP.hosted('HOST-UC-06 main'))
  skipped(sdk, 'HOST-UC-06', 'A2', 'uninstall removes the child runtime and never touches the connector\'s hosted entries (Q-B3 B)', SKIP.uninstall)
  skipped(sdk, 'HOST-UC-06', 'A2', 'uninstall offers the board archive export first', SKIP.exportOffer)
  // Postcondition (R-HOST-04, design §6.2; the dev's correction: no admission key in any overlay row).
  const overlayFor = async (t, child) => {
    const { launchOverlay, composedProfile } = await runtimeModule(sdk)
    const mainHome = fs.realpathSync(scratch(t))
    const anchor = path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json')
    const composed = await composedProfile({ mainHome, installAnchor: anchor })
    const control = { secret: FIXTURE.secret.repeat(1), endpoint: 'fbtest-endpoint' }
    return launchOverlay(composed.paths, { hostId: 'fbtest-host', instanceId: FIXTURE.instanceId }, path.join(V3.instance.dir, 'native-child.js'), {}, control, composed.entries, child)
  }
  const insertedOf = (ops) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
  const childRowOf = (ops) => insertedOf(ops).find((r) => r.id === IMPORT.childRow) ?? ops.find((op) => op?.id === IMPORT.childRow)
  for (const [title, targetUrl] of [['a blank target', FIXTURE.blank], ['the host connector URL', FIXTURE.hostOrigin + CONNECTOR_MCP], ['a remote target', FIXTURE.remote]]) {
    caseTest(sdk, 'HOST-UC-06', 'post', `the overlay inserts dsh-instance-child with config exactly {targetUrl} for ${title}`, async (t) => {
      const ops = await overlayFor(t, { targetUrl })
      const row = childRowOf(ops)
      assert.ok(row, 'no dsh-instance-child row in the overlay: ' + show(insertedOf(ops).map((r) => r.id)))
      assert.deepEqual(row.config, { [IMPORT.targetField]: targetUrl })
    })
  }
  caseTest(sdk, 'HOST-UC-06', 'post', 'no overlay row config holds admissionKey or any 64-hex secret (the key derives from the lifecycle secret)', async (t) => {
    const ops = await overlayFor(t, { targetUrl: FIXTURE.blank })
    const configs = [...ops, ...insertedOf(ops)].map((op) => op?.config).filter((c) => c !== undefined)
    for (const config of configs) {
      assert.equal(textOf(config).includes('"' + ADMISSION_KEY_FIELD + '"'), false, 'admissionKey in ' + show(config).slice(0, 200))
      assert.equal(HEX64.test(textOf(config)), false, '64-hex value in ' + show(config).slice(0, 200))
    }
  })
  caseTest(sdk, 'HOST-UC-06', 'post', 'the overlay carries no planted token value, whatever the child row is given', async (t) => {
    const ops = await overlayFor(t, { targetUrl: FIXTURE.remote })
    assert.equal(textOf(ops).includes(FIXTURE.planted), false)
  })

  // ===================================================================== HOST-EP-01: what the host row may inject (R-ARCH-05)
  caseTest(sdk, 'HOST-EP-01', 3, 'the host row\'s inject list names no session, approval, question or prompt service', async () => {
    const host = await instanceModule(sdk, 'host')
    assert.ok(Array.isArray(host.inject), 'host.js exports no inject list')
    assert.deepEqual(host.inject.filter((n) => SESSION_LIKE.test(n)), [])
  })
  caseTest(sdk, 'HOST-EP-01', 2, 'dshConnectorTokens is looked up at runtime, not listed in inject (an optional service must not gate the row)', async () => {
    const host = await instanceModule(sdk, 'host')
    assert.equal(host.inject.some((n) => n.replace(/\?$/, '') === 'dshConnectorTokens'), false)
  })
  caseTest(sdk, 'HOST-EP-01', 'R-HOST-05', 'the host Config has a targetUrl string field, default \'\', volatile, and no token or credential-reference field', async () => {
    const { Config } = await instanceModule(sdk, 'host')
    assert.ok(Config?.dict?.targetUrl, 'no targetUrl field: ' + show(Object.keys(Config?.dict ?? {})))
    assert.equal(Config.dict.targetUrl.type, 'string')
    assert.equal(Config.dict.targetUrl.meta?.default, '')
    assert.equal(Config.dict.targetUrl.meta?.volatile, true)
    assert.deepEqual(Object.keys(Config.dict).filter((k) => SECRET_LIKE.test(k)), [])
  })
  caseTest(sdk, 'HOST-EP-01', 4, 'the instance\'s browser code is its own settings page only (QD1 = B): dsh.client web, ./client export, client.js + its two chunks shipped', async () => {
    const manifest = readManifest(V3.instance.dir)
    assert.equal(manifest.dsh?.client?.platform, PAGE.platform)
    assert.equal(manifest.exports?.[PAGE.clientExport], './' + PAGE.entry)
    for (const f of [PAGE.entry, ...PAGE.chunks, PAGE.childRow]) {
      assert.ok(fs.existsSync(path.join(V3.instance.dir, f)), f + ' missing')
      assert.ok(manifest.files.includes(f), f + ' not in files')
    }
  })
  caseTest(sdk, 'HOST-EP-01', 4, 'the settings page registers at plugins.row.config only (no other host-DSH slot)', async () => {
    const text = [PAGE.entry, ...PAGE.chunks].map((f) => fs.readFileSync(path.join(V3.instance.dir, f), 'utf8')).join('\n')
    assert.ok(text.includes(PAGE.slot), 'no ' + PAGE.slot)
    const otherSlots = ['sidebar.panellist', 'sidebar.brand.mark', 'conversation.session.header.actions', 'conversation.chat.node', 'tool.call.toolview', 'plugins.bundle.config', 'sidebar.session.row.leading']
    assert.deepEqual(otherSlots.filter((s) => text.includes("'" + s + "'") || text.includes('"' + s + '"')), [])
  })
  caseTest(sdk, 'HOST-EP-01', 4, 'the settings page shows no token field: its code sends no token or credential reference', async () => {
    const text = [PAGE.entry, ...PAGE.chunks].map((f) => fs.readFileSync(path.join(V3.instance.dir, f), 'utf8')).join('\n')
    assert.equal(text.includes(IMPORT.credentialRef), false, 'the page names ' + IMPORT.credentialRef)
    assert.equal(/type\s*[:=]\s*['"]password['"]/.test(text), false, 'a password input on the instance page')
  })

  // ===================================================================== HOST-EP-02 (reworded by R1): where the hosted value may appear
  caseTest(sdk, 'HOST-EP-02', '1, 7', 'the planted value is in the child credential store and on the mcp-credential channel (one import frame) only', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    const value = w.tokens.values()[0]
    assert.equal(w.credentials.refs.get(IMPORT.credentialRef), value)
    const carrying = w.frames().filter((f) => f.text.includes(value))
    assert.equal(carrying.length, 1, 'frames carrying the value: ' + show(carrying))
    assert.equal(parseFrame(carrying[0].text)?.op, IMPORT.ops.import)
  })
  caseTest(sdk, 'HOST-EP-02', 3, 'never in the hosted record, the host\'s files, the locator\'s answers, the notice or the replies', async (t) => {
    const w = await hostedWorld(t, sdk, { record: 'file' })
    await w.hosted.firstStart()
    await w.restart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    const places = {
      status: textOf(w.locator.status()), target: textOf(w.locator.targetStatus()), notice: textOf(w.hosted.notice()),
      replies: w.wires.flatMap((x) => x.frames.toHost).join('\n'),
      files: fs.readdirSync(w.mainHome, { recursive: true }).map((f) => path.join(w.mainHome, String(f))).filter((f) => fs.statSync(f).isFile()).map((f) => fs.readFileSync(f, 'latin1')).join('\n'),
    }
    for (const v of w.tokens.values()) for (const [place, text] of Object.entries(places)) assert.equal(text.includes(v), false, `value in ${place}`)
  })
  caseTest(sdk, 'HOST-EP-02', 5, 'never in a log line or an error the credential client or receiver produces', async (t) => {
    const { createCredentialClient, createCredentialReceiver } = await credentialModule(sdk)
    const wire = memoryWire()
    const credentials = fakeChildCredentials({ failSet: true })
    const receiver = createCredentialReceiver({ credentials })
    receiver.attach(wire.child)
    const client = createCredentialClient(wire.host, { timeoutMs: FIXTURE.longTimeoutMs, importTimeoutMs: FIXTURE.longTimeoutMs })
    t.after(() => { client.close(); receiver.close() })
    const value = FIXTURE.planted + 'log'
    const out = await settle(() => client.importToken(value))
    assert.equal(textOf([out.value, out.error?.message, out.error?.stack]).includes(value), false)
    assert.equal(wire.frames.toHost.join('').includes(value), false, 'the value echoed in a reply')
  })
  skipped(sdk, 'HOST-EP-02', '2, 4, 5', 'child home files other than its credential store, child argv and environment, temp dirs and logs of a running child', SKIP.hosted('HOST-EP-02 rows 2, 4, 5'))

  // ===================================================================== HOST-ST-03 (new): the hosted value's lifecycle (R1, R6 = B)
  caseTest(sdk, 'HOST-ST-03', 1, 'none → first start → imported once; the child store holds it', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.equal(w.credentials.refs.get(IMPORT.credentialRef), w.tokens.values()[0])
  })
  caseTest(sdk, 'HOST-ST-03', 2, 'imported → core saves its copy (reference unset, record present) → restart: present by describeRecord, nothing created', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.restart()
    assert.equal(w.tokens.calls.created.length, 1)
  })
  caseTest(sdk, 'HOST-ST-03', 3, 'saved → reinstall (child home gone) → a first start again: one new createHosted, imported once', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    await w.reinstall()
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1, FIXTURE.entryPrefix + 2], 'newest last')
  })
  caseTest(sdk, 'HOST-ST-03', 4, 'saved → the user deletes the entry → Retry: no token, notice hosted-entry-deleted; targetStatus token-refused/token-revoked', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.credentials.coreSaves()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.refused, code: K3.code.revoked })
    await w.locator.retry()
    assert.equal(w.tokens.calls.created.length, 1)
    assert.equal(w.hosted.notice(), RELAYED.notice)
  })
  caseTest(sdk, 'HOST-ST-03', 5, 'notice → Reconnect → a new entry imported once, recorded last; the notice clears; nothing retired', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.deleted)
    await w.locator.retry()
    await w.locator.reconnect()
    assert.deepEqual(w.record.entries().at(-1), FIXTURE.entryPrefix + 2)
    assert.equal(w.hosted.notice(), null)
    assert.deepEqual(w.tokens.calls.retired, [])
  })
  caseTest(sdk, 'HOST-ST-03', 6, 'a working entry → Reconnect (rotate in one click): one createHosted, one import; the old entry stays recorded (replacing moves nothing)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    assert.deepEqual(await w.locator.reconnect(), { ok: true })
    assert.equal(w.tokens.calls.created.length, 2)
    assert.equal(w.imports().length, 2)
    assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1, FIXTURE.entryPrefix + 2])
  })
  caseTest(sdk, 'HOST-ST-03', 7, 'disabled → Retry → nothing (no notice, no token)', async (t) => {
    const w = await hostedWorld(t, sdk)
    await w.hosted.firstStart()
    w.tokens.setState(FIXTURE.entryPrefix + 1, K3.entry.disabled)
    await w.locator.retry()
    assert.equal(w.hosted.notice(), null)
    assert.equal(w.tokens.calls.created.length, 1)
  })

  // ===================================================================== HOST-DT-01 (as amended): does the instance create a hosted token?
  // Columns: target, connector, credential present, last entry state, trigger → createHosted count.
  for (const [rule, title, setup, trigger, expected] of [
    [1, 'blank, connector, no credential, no entry, first start → create one', {}, 'start', 1],
    [2, 'blank, connector, credential present (reference), entry enabled, start → nothing', { credentials: { ref: true }, record: ['k-old'] }, 'start', 0],
    ['2b', 'blank, connector, credential present (saved record only), start → nothing', { credentials: { record: true } }, 'start', 0],
    [3, 'blank, connector, credential present, entry disabled, start → nothing', { credentials: { ref: true }, disable: true }, 'start', 0],
    [4, 'blank, connector, stale credential, entry deleted, no Retry (start) → nothing', { credentials: { record: true }, remove: true }, 'start', 0],
    [5, 'blank, connector, stale credential, entry deleted, Retry → nothing, a notice (R6 = B)', { credentials: { record: true }, remove: true }, 'retry', 0],
    [8, 'blank, no connector, no credential, start → nothing', { tokens: false }, 'start', 0],
    ['8b', 'blank, a connector with another apiVersion (unusable), no credential, start → nothing', { tokens: 2 }, 'start', 0],
    [9, 'remote, connector, no credential, start → never', { remote: FIXTURE.remote }, 'start', 0],
    ['9b', 'remote, connector, credential present, Retry → never', { remote: FIXTURE.remote, credentials: { ref: true } }, 'retry', 0],
  ]) {
    caseTest(sdk, 'HOST-DT-01', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, { tokens: setup.tokens, remote: setup.remote, credentials: setup.credentials })
      if (setup.disable || setup.remove) {
        // The world's entry from an earlier pairing: create it, record it, then the user's action.
        const entry = await w.tokens.createHosted(FIXTURE.instanceId)
        await w.record.add(entry.entryKey)
        w.tokens.calls.created.length = 0
        w.tokens.setState(entry.entryKey, setup.disable ? K3.entry.disabled : K3.entry.deleted)
      }
      await w.hosted.firstStart()
      if (trigger === 'retry') await w.locator.retry()
      assert.equal(w.tokens?.calls.created.length ?? 0, expected, 'createHosted calls')
      if (expected === 0) assert.deepEqual(w.imports(), [], 'an import frame was sent')
      if (rule === 5) assert.equal(w.hosted.notice(), RELAYED.notice)
    })
  }
  skipped(sdk, 'HOST-DT-01', 6, 'child reinstalled with the old entry enabled → create, pair, then succession (I-SUCCEED, W5)', 'moved to test/v3/dsh-instance/succession (I-SUCCEED: ISUCC-DT-01 rules 2–3); the create part is HOST-ST-03 row 3')
  skipped(sdk, 'HOST-DT-01', 7, 'pair answers already-paired → create another new entry', SKIP.hosted('HOST-DT-01 rule 7: the pair answer comes from core in a running child'))
  caseTest(sdk, 'HOST-DT-01', 'probe', 'a probe with no answer (the channel is unavailable) is not "absent": nothing is created', async (t) => {
    const w = await hostedWorld(t, sdk, { receiver: false, timeoutMs: FIXTURE.shortTimeoutMs })
    await settle(() => w.hosted.firstStart())
    assert.deepEqual(w.tokens.calls.created, [])
  })
  caseTest(sdk, 'HOST-DT-01', 'store', 'the child cannot store the value → the entry key is not recorded', async (t) => {
    const w = await hostedWorld(t, sdk, { credentials: { failSet: true } })
    await settle(() => w.hosted.firstStart())
    assert.equal(w.tokens.calls.created.length, 1)
    assert.deepEqual(w.record.entries(), [])
  })

  // ===================================================================== targetStatus (Q3 A) decision table
  for (const [rule, title, setup, expected] of [
    [1, 'targetUrl non-blank → target-unreachable / TARGET_UNREACHABLE', { remote: FIXTURE.remote }, { state: K3.target.unreachable, code: K3.code.unreachable }],
    ['1b', 'targetUrl one character → still remote (BVA: non-blank)', { remote: 'x' }, { state: K3.target.unreachable, code: K3.code.unreachable }],
    [2, 'blank, no usable dshConnectorTokens → target-unset / null', { tokens: false }, { state: K3.target.unset, code: null }],
    ['2b', 'blank, dshConnectorTokens apiVersion 2 (unusable) → target-unset / null', { tokens: 2 }, { state: K3.target.unset, code: null }],
    [3, 'blank, connector, no recorded entry → target-unset / null', {}, { state: K3.target.unset, code: null }],
    [4, 'last entry deleted → token-refused / token-revoked', { last: K3.entry.deleted }, { state: K3.target.refused, code: K3.code.revoked }],
    [5, 'last entry disabled → token-refused / token-revoked', { last: K3.entry.disabled }, { state: K3.target.refused, code: K3.code.revoked }],
    [6, 'last entry enabled → connected / null', { last: K3.entry.enabled }, { state: K3.target.connected, code: null }],
    [7, 'an older entry deleted, the newest enabled → connected (the LAST entry decides)', { last: K3.entry.enabled, older: K3.entry.deleted }, { state: K3.target.connected, code: null }],
  ]) {
    caseTest(sdk, 'HOST-DT-targetStatus', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, { tokens: setup.tokens, remote: setup.remote })
      if (setup.older) { const e = await w.tokens.createHosted(FIXTURE.instanceId); await w.record.add(e.entryKey); w.tokens.setState(e.entryKey, setup.older) }
      if (setup.last) { const e = await w.tokens.createHosted(FIXTURE.instanceId); await w.record.add(e.entryKey); w.tokens.setState(e.entryKey, setup.last) }
      assert.deepEqual(w.locator.targetStatus(), expected)
      assert.deepEqual(w.hosted.targetStatus(), expected, 'the hosted module and the locator disagree')
    })
  }
  caseTest(sdk, 'HOST-DT-targetStatus', 'BVA', "targetUrl of spaces only ('   ') counts as blank (→ target-unset, not remote)", async (t) => {
    const w = await hostedWorld(t, sdk, { remote: FIXTURE.spaces })
    assert.deepEqual(w.locator.targetStatus(), { state: K3.target.unset, code: null })
  })

  // ===================================================================== reconnect() refusals (decision table)
  for (const [rule, title, setup, expected, created] of [
    [1, 'child not ready → not-ready, nothing created', { lifecycle: { state: K3.state.stopped, code: null } }, { ok: false, code: K3.reconnect.notReady }, 0],
    [2, 'no usable dshConnectorTokens → connector-missing', { tokens: false }, { ok: false, code: K3.reconnect.connectorMissing }, 0],
    ['2b', 'dshConnectorTokens apiVersion 2 → connector-missing', { tokens: 2 }, { ok: false, code: K3.reconnect.connectorMissing }, 0],
    [3, 'remote targetUrl → target-remote', { remote: FIXTURE.remote }, { ok: false, code: K3.reconnect.remote }, 0],
    [4, 'createHosted rejects → operation-failed; nothing imported or recorded', { failCreate: true }, { ok: false, code: K3.reconnect.failed }, 1],
    [5, 'the child cannot store it → credentials-unwritable; not recorded', { credentials: { failSet: true } }, { ok: false, code: K3.reconnect.unwritable }, 1],
    [6, 'no answer on the channel → credentials-unwritable', { receiver: false, timeoutMs: FIXTURE.shortTimeoutMs }, { ok: false, code: K3.reconnect.unwritable }, 1],
    [7, 'ready, blank, connector, writable → ok, one createHosted', {}, { ok: true }, 1],
  ]) {
    caseTest(sdk, 'HOST-DT-reconnect', rule, title, async (t) => {
      const w = await hostedWorld(t, sdk, setup)
      if (setup.failCreate) w.tokens.failNextCreate()
      assert.deepEqual(await w.locator.reconnect(), expected)
      assert.equal(w.tokens?.calls.created.length ?? 0, created, 'createHosted calls')
      if (!expected.ok) assert.deepEqual(w.record.entries(), [], 'an entry was recorded on a refusal')
      if (expected.ok) assert.deepEqual(w.record.entries(), [FIXTURE.entryPrefix + 1])
    })
  }

  // ===================================================================== HOST-ST-01 rows 4–10 (row 8 amended: no fishball-off)
  caseTest(sdk, 'HOST-ST-01', 4, 'Running → crash → Failed with the crash code; origin null', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.failed, code: K3.code.exited })
    assert.deepEqual([w.locator.status().state, w.locator.status().code], [K3.state.failed, K3.code.exited])
    assert.equal(w.locator.origin(HOSTNAME.ipv4), null)
  })
  caseTest(sdk, 'HOST-ST-01', 5, 'Failed → Retry → Starting', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.failed, code: K3.code.exited } })
    await w.locator.retry()
    assert.equal(w.locator.status().state, K3.state.starting)
  })
  caseTest(sdk, 'HOST-ST-01', 6, 'Running → restart → Starting: origin null and admit not-ready until ready again', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.starting, code: null })
    assert.equal(w.locator.origin(HOSTNAME.ipv4), null)
    assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv4 }))), K3.admitError.notReady)
    w.lifecycle.set({ state: K3.state.ready, code: null })
    assert.equal(w.locator.origin(HOSTNAME.ipv4), `http://${HOSTNAME.ipv4}:${FIXTURE.port}`)
  })
  caseTest(sdk, 'HOST-ST-01', 6, 'onChange fires on a lifecycle change and its dispose stops it (idempotent)', async (t) => {
    const w = await hostedWorld(t, sdk)
    let calls = 0
    const dispose = w.locator.onChange(() => { calls += 1 })
    w.lifecycle.set({ state: K3.state.starting, code: null })
    await tick()
    assert.ok(calls >= 1, 'onChange did not fire')
    dispose(); dispose()
    const before = calls
    w.lifecycle.set({ state: K3.state.ready, code: null })
    await tick()
    assert.equal(calls, before)
  })
  caseTest(sdk, 'HOST-ST-01', 7, 'Running → host exits → Stopped: origin null, admit not-ready', async (t) => {
    const w = await hostedWorld(t, sdk)
    w.lifecycle.set({ state: K3.state.stopped, code: null })
    assert.equal(w.locator.status().state, K3.state.stopped)
    assert.equal(w.locator.origin(HOSTNAME.localhost), null)
    assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.localhost }))), K3.admitError.notReady)
  })
  caseTest(sdk, 'HOST-ST-01', 8, 'Running (core disabled is not visible to the instance): the locator never reports fishball-off (Q4)', async () => {
    const c = contracts(FOLDER.hostServices)
    const code = c.m.members(member(serviceMembers(c, K3.service), 'status').returns).get('code')
    assert.equal(vocabulary(c, code.type).literals.has(K3.withdrawnCode), false, 'K3 still lists fishball-off')
    const text = fs.readdirSync(V3.instance.dir, { recursive: true }).map(String).filter((f) => f.endsWith('.js') && !f.split(path.sep).includes('node_modules') && !f.split(path.sep).includes('test'))
      .filter((f) => fs.readFileSync(path.join(V3.instance.dir, f), 'utf8').includes("'" + K3.withdrawnCode + "'"))
    assert.deepEqual(text, [], 'instance files naming fishball-off as a value')
  })
  caseTest(sdk, 'HOST-ST-01', 9, 'Stopped → Retry before host ready → Stopped (nothing restarts, nothing created)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.stopped, code: null } })
    await w.locator.retry()
    assert.equal(w.locator.status().state, K3.state.stopped)
    assert.deepEqual(w.tokens.calls.created, [])
  })
  skipped(sdk, 'HOST-ST-01', 10, 'Running → uninstall → Removed', SKIP.uninstall)
  skipped(sdk, 'HOST-ST-01', 10, 'the export is offered first', SKIP.exportOffer)
  caseTest(sdk, 'HOST-ST-01', 'K', `the K3 locator declares ${K3.members.join(', ')}; reconnect() is asynchronous with the five refusal codes`, async () => {
    const c = contracts(FOLDER.hostServices)
    const members = serviceMembers(c, K3.service)
    assert.deepEqual(K3.members.filter((m) => !members.has(m)), [])
    const reconnect = member(members, 'reconnect')
    assert.match(reconnect.returns, /Promise/)
    const codes = new Set()
    for (const text of c.texts.values()) for (const m of text.matchAll(/ReconnectRefusalCode\s*=([^\n]*)/g)) for (const lit of m[1].matchAll(/'([^']+)'/g)) codes.add(lit[1])
    assert.deepEqual([...codes].sort(), Object.values(K3.reconnect).sort())
  })
  caseTest(sdk, 'HOST-ST-01', 'K', 'the real locator object is the K3 service: apiVersion 1 and every member', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.apiVersion, K3.apiVersion)
    for (const m of K3.members.filter((n) => n !== 'apiVersion' && n !== 'providerSync')) assert.equal(typeof w.locator[m], 'function', m)
    assert.equal(w.locator.providerSync, w.providerSync, 'providerSync is not passed through')
  })

  // ===================================================================== UIM-EP-02 locator rows (no browser); Q5
  for (const [row, hostname] of [[1, HOSTNAME.ipv4], [2, HOSTNAME.localhost]]) {
    caseTest(sdk, 'UIM-EP-02', row, `origin(${hostname}) is http://${hostname}:<child port> while ready`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(w.locator.origin(hostname), `http://${hostname}:${FIXTURE.port}`)
    })
    caseTest(sdk, 'UIM-EP-02', row, `admit under ${hostname} resolves {url} = http://${hostname}:<port>/api/dsh-instance/admit?ticket=… and nothing else`, async (t) => {
      const w = await hostedWorld(t, sdk)
      const out = await w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname })
      assert.deepEqual(Object.keys(out), ['url'])
      const url = new URL(out.url)
      assert.equal(url.origin, `http://${hostname}:${FIXTURE.port}`)
      assert.equal(url.pathname, RELAYED.ticket.path)
      assert.deepEqual([...url.searchParams.keys()], [RELAYED.ticket.param])
      assert.ok(url.searchParams.get(RELAYED.ticket.param).length > 0)
    })
    caseTest(sdk, 'UIM-EP-02', row, `admit under ${hostname} asks for a ticket with audience ${hostname}:<port>, the view and the lang`, async (t) => {
      const w = await hostedWorld(t, sdk)
      await w.locator.admit({ view: K3.views[1], lang: K3.langs[0], hostname })
      assert.deepEqual(w.issued.at(-1), { audience: `${hostname}:${FIXTURE.port}`, view: K3.views[1], lang: K3.langs[0] })
    })
  }
  caseTest(sdk, 'UIM-EP-02', 3, '[::1] (Q5 = A): origin null and admit rejects not-ready, even while ready', async (t) => {
    const w = await hostedWorld(t, sdk)
    assert.equal(w.locator.origin(HOSTNAME.ipv6), null)
    assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv6 }))), K3.admitError.notReady)
  })
  for (const name of HOSTNAME.refused) {
    caseTest(sdk, 'UIM-EP-02', 4, `a non-loopback name ${show(name)} → admit rejects hostname-refused; origin null`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: name }))), K3.admitError.hostname)
      assert.equal(w.locator.origin(name), null)
    })
  }
  caseTest(sdk, 'UIM-EP-02', 4, 'a non-loopback name is refused even while the child is not ready (hostname is checked first: hostname-refused)', async (t) => {
    const w = await hostedWorld(t, sdk, { lifecycle: { state: K3.state.stopped, code: null } })
    assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.refused[0] }))), K3.admitError.hostname)
  })
  for (const [title, request] of [['a view outside K3', { view: 'board', lang: K3.langs[1] }], ['a lang outside K3', { view: K3.views[0], lang: 'fr' }]]) {
    caseTest(sdk, 'UIM-EP-02', 'input', `${title} under a served hostname → admit rejects invalid-request (child.d.ts)`, async (t) => {
      const w = await hostedWorld(t, sdk)
      assert.equal(codeOf(await settle(() => w.locator.admit({ ...request, hostname: HOSTNAME.ipv4 }))), RELAYED.invalidRequest)
    })
  }
  caseTest(sdk, 'UIM-EP-02', 'mint', 'a ticket that cannot be minted (the child left) → admit rejects not-ready', async (t) => {
    const w = await hostedWorld(t, sdk, { ticket: async () => { throw new Error('fbtest child gone') } })
    assert.equal(codeOf(await settle(() => w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv4 }))), K3.admitError.notReady)
  })
  caseTest(sdk, 'UIM-EP-02', 'one-time', 'two admits give two different tickets (one per frame navigation)', async (t) => {
    const w = await hostedWorld(t, sdk)
    const a = await w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv4 })
    const b = await w.locator.admit({ view: K3.views[0], lang: K3.langs[1], hostname: HOSTNAME.ipv4 })
    assert.notEqual(a.url, b.url)
  })

  // ===================================================================== the ticket (BVA: ttl 30 000 ms; audience; generation; replay)
  const claims = (over = {}) => ({ generation: FIXTURE.generation, audience: `${HOSTNAME.ipv4}:${FIXTURE.port}`, view: K3.views[0], lang: K3.langs[1], ...over })
  caseTest(sdk, 'TICKET', 'constants', 'TICKET = {ttlMs: 30000, param: ticket, path: /api/dsh-instance/admit}', async () => {
    const { TICKET } = await constantsModule(sdk)
    assert.deepEqual({ ttlMs: TICKET.ttlMs, param: TICKET.param, path: TICKET.path }, { ...RELAYED.ticket })
  })
  for (const [row, offset, valid] of [['BVA-0', 0, true], ['BVA-29999', 29999, true], ['BVA-30000', 30000, false], ['BVA-30001', 30001, false]]) {
    caseTest(sdk, 'TICKET', row, `verify at mint + ${offset} ms → ${valid ? 'claims' : 'null (expired)'}`, async () => {
      const { admissionKey, mintTicket, verifyTicket } = await ticketModule(sdk)
      const key = admissionKey(FIXTURE.secret)
      const ticket = mintTicket(key, claims(), FIXTURE.t0)
      const out = verifyTicket(key, ticket, { generation: FIXTURE.generation, audience: claims().audience }, FIXTURE.t0 + offset)
      if (valid) {
        assert.equal(out?.view, K3.views[0])
        assert.equal(out?.lang, K3.langs[1])
        assert.equal(typeof out?.nonce, 'string')
      } else assert.equal(out, null)
    })
  }
  for (const [row, title, check] of [
    ['audience', 'another hostname (localhost vs 127.0.0.1)', { audience: `${HOSTNAME.localhost}:${FIXTURE.port}` }],
    ['audience', 'the port + 1', { audience: `${HOSTNAME.ipv4}:${FIXTURE.port + 1}` }],
    ['audience', 'the port - 1', { audience: `${HOSTNAME.ipv4}:${FIXTURE.port - 1}` }],
    ['generation', 'another child generation (a restart)', { generation: FIXTURE.otherGeneration }],
  ]) {
    caseTest(sdk, 'TICKET', row, `verify with ${title} → null`, async () => {
      const { admissionKey, mintTicket, verifyTicket } = await ticketModule(sdk)
      const key = admissionKey(FIXTURE.secret)
      const ticket = mintTicket(key, claims(), FIXTURE.t0)
      assert.equal(verifyTicket(key, ticket, { generation: FIXTURE.generation, audience: claims().audience, ...check }, FIXTURE.t0 + 1), null)
    })
  }
  caseTest(sdk, 'TICKET', 'key', 'a ticket minted under another lifecycle secret does not verify; a tampered ticket does not verify', async () => {
    const { admissionKey, mintTicket, verifyTicket } = await ticketModule(sdk)
    const ticket = mintTicket(admissionKey(FIXTURE.otherSecret), claims(), FIXTURE.t0)
    const ok = { generation: FIXTURE.generation, audience: claims().audience }
    assert.equal(verifyTicket(admissionKey(FIXTURE.secret), ticket, ok, FIXTURE.t0 + 1), null)
    const good = mintTicket(admissionKey(FIXTURE.secret), claims(), FIXTURE.t0)
    const flipped = good.slice(0, -1) + (good.at(-1) === 'A' ? 'B' : 'A')
    assert.equal(verifyTicket(admissionKey(FIXTURE.secret), flipped, ok, FIXTURE.t0 + 1), null)
    for (const junk of ['', 'x', 'a.b.c']) assert.equal(verifyTicket(admissionKey(FIXTURE.secret), junk, ok, FIXTURE.t0 + 1), null, show(junk))
  })
  caseTest(sdk, 'TICKET', 'key', 'admissionKey(secret) is deterministic, 32 bytes, differs per secret and is not the secret itself', async () => {
    const { admissionKey } = await ticketModule(sdk)
    const a = admissionKey(FIXTURE.secret)
    assert.ok(Buffer.isBuffer(a))
    assert.equal(a.length, RELAYED.keyBytes)
    assert.deepEqual(admissionKey(FIXTURE.secret), a)
    assert.notDeepEqual(admissionKey(FIXTURE.otherSecret), a)
    assert.notEqual(a.toString('hex'), Buffer.from(FIXTURE.secret).toString('hex'))
  })
  caseTest(sdk, 'TICKET', 'secret', 'the ticket text carries neither the lifecycle secret nor the key', async () => {
    const { admissionKey, mintTicket } = await ticketModule(sdk)
    const key = admissionKey(FIXTURE.secret)
    const ticket = mintTicket(key, claims(), FIXTURE.t0)
    assert.equal(ticket.includes(FIXTURE.secret), false)
    assert.equal(ticket.includes(key.toString('hex')), false)
    assert.equal(ticket.includes(key.toString('base64url')), false)
  })
  caseTest(sdk, 'TICKET', 'replay', 'the redeemer answers the claims once; a second redemption of the same ticket is null (use 1 / use 2)', async () => {
    const { admissionKey, mintTicket, createTicketRedeemer } = await ticketModule(sdk)
    const key = admissionKey(FIXTURE.secret)
    const redeemer = createTicketRedeemer(key, FIXTURE.generation, () => FIXTURE.t0 + 1)
    const ticket = mintTicket(key, claims(), FIXTURE.t0)
    assert.deepEqual(redeemer.redeem(ticket, claims().audience), { view: K3.views[0], lang: K3.langs[1] })
    assert.equal(redeemer.redeem(ticket, claims().audience), null)
  })
  caseTest(sdk, 'TICKET', 'replay', 'a ticket replayed under another loopback hostname is refused (UIM-EP-02 row 6)', async () => {
    const { admissionKey, mintTicket, createTicketRedeemer } = await ticketModule(sdk)
    const key = admissionKey(FIXTURE.secret)
    const redeemer = createTicketRedeemer(key, FIXTURE.generation, () => FIXTURE.t0 + 1)
    const ticket = mintTicket(key, claims(), FIXTURE.t0)
    assert.equal(redeemer.redeem(ticket, `${HOSTNAME.localhost}:${FIXTURE.port}`), null)
  })
  caseTest(sdk, 'TICKET', 'BVA-30000', 'the redeemer refuses at mint + 30000 ms and accepts at 29999', async () => {
    const { admissionKey, mintTicket, createTicketRedeemer } = await ticketModule(sdk)
    const key = admissionKey(FIXTURE.secret)
    let now = FIXTURE.t0 + RELAYED.ticket.ttlMs
    const redeemer = createTicketRedeemer(key, FIXTURE.generation, () => now)
    assert.equal(redeemer.redeem(mintTicket(key, claims(), FIXTURE.t0), claims().audience), null)
    now = FIXTURE.t0 + RELAYED.ticket.ttlMs - 1
    assert.ok(redeemer.redeem(mintTicket(key, claims(), FIXTURE.t0), claims().audience))
  })

  // ===================================================================== the child-side admission route (303 / 403)
  const mint = async (over = {}, at = Date.now()) => {
    const { admissionKey, mintTicket } = await ticketModule(sdk)
    return mintTicket(admissionKey(FIXTURE.secret), claims(over), at)
  }
  for (const hostname of HOSTNAME.served) {
    caseTest(sdk, 'ADMIT-ROUTE', 'ok', `GET under ${hostname}:<port> with a fresh ticket → 303 to /#view=<v>&lang=<l>, the child's own Set-Cookie, no-store, no-referrer`, async () => {
      const a = await admissionWorld(sdk)
      const out = await a.get(await mint({ audience: `${hostname}:${FIXTURE.port}`, view: K3.views[1], lang: K3.langs[0] }), `${hostname}:${FIXTURE.port}`)
      assert.equal(out.status, RELAYED.admit.seeOther, show(out))
      assert.equal(out.headers.location, RELAYED.admit.landing(K3.views[1], K3.langs[0]))
      assert.equal([out.headers['set-cookie']].flat().join(), FIXTURE.cookie)
      assert.equal(out.headers['cache-control'], ROUTE.noStore)
      assert.equal(out.headers['referrer-policy'], 'no-referrer')
    })
  }
  caseTest(sdk, 'ADMIT-ROUTE', 'route', 'the admission is a raw exact web route at /api/dsh-instance/admit', async () => {
    const a = await admissionWorld(sdk)
    const route = a.routes.find((r) => r.path === RELAYED.ticket.path)
    assert.ok(route)
    assert.equal(route.kind, RELAYED.admit.kind)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'replay', 'the same ticket a second time → 403 (single use)', async () => {
    const a = await admissionWorld(sdk)
    const ticket = await mint()
    assert.equal((await a.get(ticket, claims().audience)).status, RELAYED.admit.seeOther)
    assert.equal((await a.get(ticket, claims().audience)).status, RELAYED.admit.forbidden)
  })
  for (const [title, host, over] of [
    ['a ticket for 127.0.0.1 presented under localhost', `${HOSTNAME.localhost}:${FIXTURE.port}`, {}],
    ['a Host header with the port + 1', `${HOSTNAME.ipv4}:${FIXTURE.port + 1}`, { audience: `${HOSTNAME.ipv4}:${FIXTURE.port + 1}` }],
    ['a Host header [::1]:<port> (not served)', `${HOSTNAME.ipv6}:${FIXTURE.port}`, { audience: `${HOSTNAME.ipv6}:${FIXTURE.port}` }],
    ['a non-loopback Host header', `${HOSTNAME.refused[0]}:${FIXTURE.port}`, { audience: `${HOSTNAME.refused[0]}:${FIXTURE.port}` }],
    ['a ticket of another child generation', `${HOSTNAME.ipv4}:${FIXTURE.port}`, { generation: FIXTURE.otherGeneration }],
  ]) {
    caseTest(sdk, 'ADMIT-ROUTE', 'refused', `${title} → 403, no cookie`, async () => {
      const a = await admissionWorld(sdk)
      const out = await a.get(await mint(over), host)
      assert.equal(out.status, RELAYED.admit.forbidden, show(out))
      assert.equal(out.headers['set-cookie'], undefined)
    })
  }
  caseTest(sdk, 'ADMIT-ROUTE', 'expired', 'a ticket minted 30001 ms ago → 403; 1 ms ago → 303', async () => {
    const a = await admissionWorld(sdk)
    assert.equal((await a.get(await mint({}, Date.now() - RELAYED.ticket.ttlMs - 1), claims().audience)).status, RELAYED.admit.forbidden)
    assert.equal((await a.get(await mint({}, Date.now() - 1), claims().audience)).status, RELAYED.admit.seeOther)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'refused', 'no ticket parameter → 403; a POST → 405', async () => {
    const a = await admissionWorld(sdk)
    assert.equal((await a.get(undefined, claims().audience)).status, RELAYED.admit.forbidden)
    assert.equal((await a.get(await mint(), claims().audience, 'POST')).status, RELAYED.admit.notAllowed)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'login', 'DSH\'s login issues no cookie → 403 (never a 303 without the child\'s own cookie)', async () => {
    const a = await admissionWorld(sdk, { cookie: null })
    assert.equal((await a.get(await mint(), claims().audience)).status, RELAYED.admit.forbidden)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'secret', 'the launch token never reaches the browser: not in Location, the body or any header', async () => {
    const a = await admissionWorld(sdk)
    const out = await a.get(await mint(), claims().audience)
    assert.equal(textOf(out).includes(FIXTURE.launchToken), false)
  })
  caseTest(sdk, 'ADMIT-ROUTE', 'refused', 'every refusal answers no-store with no Location', async () => {
    const a = await admissionWorld(sdk)
    const out = await a.get('not-a-ticket', claims().audience)
    assert.equal(out.status, RELAYED.admit.forbidden)
    assert.equal(out.headers['cache-control'], ROUTE.noStore)
    assert.equal(out.headers.location, undefined)
  })

  // ===================================================================== the mcp-credential wire (EP of frames, BVA of the wait)
  const credentialPair = async (t, { credentials = fakeChildCredentials(), receiver = true, timeoutMs = FIXTURE.longTimeoutMs } = {}) => {
    const { createCredentialClient, createCredentialReceiver } = await credentialModule(sdk)
    const wire = memoryWire()
    const r = receiver ? createCredentialReceiver({ credentials }) : undefined
    r?.attach(wire.child)
    const client = createCredentialClient(wire.host, { timeoutMs, importTimeoutMs: timeoutMs })
    t.after(() => { client.close(); r?.close() })
    return { client, wire, credentials, receiver: r }
  }
  for (const [title, opts, expected] of [
    ['nothing stored', {}, false],
    ['DSH_AGENT_TOKEN configured', { ref: true }, true],
    ['only fishball-core/hosted-agent configured', { record: true }, true],
    ['both configured', { ref: true, record: true }, true],
  ]) {
    caseTest(sdk, 'WIRE', 'probe', `probe() with ${title} → ${expected}`, async (t) => {
      const p = await credentialPair(t, { credentials: fakeChildCredentials(opts) })
      assert.equal(await p.client.probe(), expected)
    })
  }
  caseTest(sdk, 'WIRE', 'frames', 'frames are JSON {id, op} / {id, op: import, value}; replies {id, ok: true, present?} — the probe frame carries no value', async (t) => {
    const p = await credentialPair(t)
    await p.client.probe()
    await p.client.importToken(FIXTURE.planted + 'f')
    const sent = p.wire.frames.toChild.map(parseFrame)
    assert.deepEqual(sent.map((f) => f.op), [IMPORT.ops.probe, IMPORT.ops.import])
    assert.equal('value' in sent[0], false)
    assert.equal(sent[1].value, FIXTURE.planted + 'f')
    const replies = p.wire.frames.toHost.map(parseFrame)
    assert.deepEqual(replies.map((r) => [r.id, r.ok]), sent.map((f) => [f.id, true]))
    assert.equal(replies[0].present, false)
  })
  caseTest(sdk, 'WIRE', 'import', 'importToken(value) → {ok: true}; the child store holds it under DSH_AGENT_TOKEN', async (t) => {
    const p = await credentialPair(t)
    assert.deepEqual(await p.client.importToken(FIXTURE.planted + 'i'), { ok: true })
    assert.equal(p.credentials.refs.get(IMPORT.credentialRef), FIXTURE.planted + 'i')
  })
  caseTest(sdk, 'WIRE', 'import', 'a store that cannot write → {ok: false, code: credentials-unwritable}', async (t) => {
    const p = await credentialPair(t, { credentials: fakeChildCredentials({ failSet: true }) })
    assert.deepEqual(await p.client.importToken(FIXTURE.planted + 'u'), { ok: false, code: RELAYED.receiver.unwritable })
  })
  for (const [title, frame] of [
    ['an import with an empty value', { id: 'fb-1', op: IMPORT.ops.import, value: '' }],
    ['an import with a non-string value', { id: 'fb-2', op: IMPORT.ops.import, value: 42 }],
    ['an import with no value', { id: 'fb-3', op: IMPORT.ops.import }],
    ['an unknown op', { id: 'fb-4', op: 'unset' }],
  ]) {
    caseTest(sdk, 'WIRE', 'invalid', `the receiver answers ${title} with {ok: false, code: invalid-request} and writes nothing`, async (t) => {
      const p = await credentialPair(t)
      const replies = []
      p.wire.host.onMessage((text) => replies.push(parseFrame(text)))
      p.wire.host.send(JSON.stringify(frame))
      await tick()
      assert.deepEqual(replies, [{ id: frame.id, ok: false, code: RELAYED.receiver.invalid }])
      assert.deepEqual(p.credentials.calls.set, [])
    })
  }
  caseTest(sdk, 'WIRE', 'invalid', 'malformed JSON is ignored: no reply, no write', async (t) => {
    const p = await credentialPair(t)
    const replies = []
    p.wire.host.onMessage((text) => replies.push(text))
    p.wire.host.send('{not json')
    await tick()
    assert.deepEqual([replies, p.credentials.calls.set], [[], []])
  })
  for (const [title, act] of [['probe()', (c) => c.probe()], ['importToken()', (c) => c.importToken(FIXTURE.planted + 't')]]) {
    caseTest(sdk, 'WIRE', 'timeout', `${title} with no reply within timeoutMs rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      const p = await credentialPair(t, { receiver: false, timeoutMs: FIXTURE.shortTimeoutMs })
      const out = await settle(() => act(p.client))
      assert.equal(out.error?.code, RELAYED.channelUnavailable, show(out.value))
    })
    caseTest(sdk, 'WIRE', 'close', `${title} pending when the transport closes rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      const p = await credentialPair(t, { receiver: false })
      const pending = settle(() => act(p.client))
      await tick()
      p.wire.lose()
      assert.equal((await pending).error?.code, RELAYED.channelUnavailable)
    })
    caseTest(sdk, 'WIRE', 'closed', `${title} after close() rejects CREDENTIAL_CHANNEL_UNAVAILABLE`, async (t) => {
      const p = await credentialPair(t)
      p.client.close()
      assert.equal((await settle(() => act(p.client))).error?.code, RELAYED.channelUnavailable)
    })
  }
  caseTest(sdk, 'WIRE', 'timeout', 'a reply just inside timeoutMs resolves (BVA: the wait is not shorter than asked)', async (t) => {
    const { createCredentialClient } = await credentialModule(sdk)
    const wire = memoryWire()
    const timeoutMs = 200
    wire.child.onMessage((text) => { const f = parseFrame(text); setTimeout(() => wire.child.send(JSON.stringify({ id: f.id, ok: true, present: true })), timeoutMs / 4) })
    const client = createCredentialClient(wire.host, { timeoutMs })
    t.after(() => client.close())
    assert.equal(await client.probe(), true)
  })

  // ===================================================================== childTargetUrl (decision table + BVA)
  for (const [rule, input, expected] of [
    [1, { instanceTargetUrl: '', hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, FIXTURE.hostOrigin + CONNECTOR_MCP],
    [2, { instanceTargetUrl: '', hostOrigin: FIXTURE.hostOrigin, connectorUsable: false }, ''],
    [3, { instanceTargetUrl: FIXTURE.remote, hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, FIXTURE.remote],
    [4, { instanceTargetUrl: FIXTURE.remote, hostOrigin: FIXTURE.hostOrigin, connectorUsable: false }, FIXTURE.remote],
    [5, { instanceTargetUrl: FIXTURE.spaces, hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, FIXTURE.hostOrigin + CONNECTOR_MCP],
    [6, { instanceTargetUrl: '', hostOrigin: undefined, connectorUsable: true }, ''],
    [7, { instanceTargetUrl: 'x', hostOrigin: FIXTURE.hostOrigin, connectorUsable: true }, 'x'],
  ]) {
    caseTest(sdk, 'TARGET-URL', rule, `childTargetUrl(${show(input)}) → ${show(expected)}`, async () => {
      const { childTargetUrl } = await hostedModule(sdk)
      assert.equal(childTargetUrl(input), expected)
    })
  }

  // ===================================================================== the hosted record file
  caseTest(sdk, 'RECORD', 'missing', 'a missing file is no entries and is written at once with a new instanceId; add() keeps {format: 1, instanceId, entries} mode 0600, newest last', async (t) => {
    const { openHostedRecord } = await recordModule(sdk)
    const file = recordFile(scratch(t))
    const record = await openHostedRecord(file)
    assert.deepEqual(record.entries(), [])
    assert.ok(fs.existsSync(file), 'the record is not written when it was missing')
    const id = record[RELAYED.record.idKey]
    assert.equal(typeof id, 'string')
    await record.add('a'); await record.add('b')
    assert.deepEqual(record.entries(), ['a', 'b'])
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { format: 1, [RELAYED.record.idKey]: id, entries: ['a', 'b'] })
    assert.equal(fs.statSync(file).mode & 0o777, RELAYED.record.mode)
    const again = await openHostedRecord(file)
    assert.deepEqual(again.entries(), ['a', 'b'], 'not durable across a reopen')
    assert.equal(again[RELAYED.record.idKey], id, 'the instance id changed across a reopen')
  })
  for (const [title, text] of [['not JSON', '{'], ['another format', JSON.stringify({ format: 2, entries: [] })], ['entries not an array', JSON.stringify({ format: 1, entries: 'a' })]]) {
    caseTest(sdk, 'RECORD', 'damaged', `a damaged record (${title}) rejects INVALID_HOSTED_RECORD`, async (t) => {
      const { openHostedRecord } = await recordModule(sdk)
      const file = recordFile(scratch(t))
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text, { mode: 0o600 })
      assert.equal((await settle(() => openHostedRecord(file))).error?.code, RELAYED.record.damaged)
    })
  }

  // ===================================================================== the instance's settings page routes (QD1 = B)
  const routeService = (over = {}) => {
    const calls = { retry: 0, reconnect: 0, open: [] }
    let state = K3.state.ready
    const service = {
      status: () => ({ state, code: null, detail: FIXTURE.detail }),
      notice: () => null,
      async retry() { calls.retry += 1; state = K3.state.starting; return service.status() },
      async reconnect() { calls.reconnect += 1; return { ok: false, code: K3.reconnect.connectorMissing } },
      // As the K3 locator's admit answers: a served loopback name gets a URL, any other is refused.
      async open(request) {
        calls.open.push(request)
        if (!HOSTNAME.served.includes(request.hostname)) return { ok: false, code: K3.admitError.hostname }
        return { ok: true, url: `http://${request.hostname}:${FIXTURE.port}${RELAYED.ticket.path}?ticket=t` }
      },
      providerSync: fakeProviderSync(),
      ...over,
    }
    return { service, calls }
  }
  caseTest(sdk, 'ROUTES', 'status', 'GET /api/dsh-instance/status → 200 JSON no-store {state, code, detail, notice}', async () => {
    const { service } = routeService({ notice: () => RELAYED.notice })
    const r = await routesWorld(sdk, service, routeContext())
    const out = await r.call('GET', ROUTE.status)
    assert.equal(out.status, ROUTE.ok)
    assert.match(out.headers.get('content-type'), ROUTE.json)
    assert.equal(out.headers.get('cache-control'), ROUTE.noStore)
    assert.deepEqual(out.json, { state: K3.state.ready, code: null, detail: FIXTURE.detail, notice: RELAYED.notice })
  })
  caseTest(sdk, 'ROUTES', 'retry', 'POST /api/dsh-instance/retry runs one retry and answers the status shape after it', async () => {
    const { service, calls } = routeService()
    const r = await routesWorld(sdk, service, routeContext())
    const out = await r.call('POST', ROUTE.retry, { body: {} })
    assert.equal(calls.retry, 1)
    assert.deepEqual(Object.keys(out.json).sort(), [...ROUTE.statusKeys].sort())
    assert.equal(out.json.state, K3.state.starting)
  })
  caseTest(sdk, 'ROUTES', 'reconnect', "POST /api/dsh-instance/reconnect answers reconnect()'s result as it is", async () => {
    const { service, calls } = routeService()
    const r = await routesWorld(sdk, service, routeContext())
    const out = await r.call('POST', ROUTE.reconnect, { body: {} })
    assert.equal(calls.reconnect, 1)
    assert.deepEqual(out.json, { ok: false, code: K3.reconnect.connectorMissing })
  })
  for (const [hostHeader, hostname] of [[`${HOSTNAME.ipv4}:${FIXTURE.port}`, HOSTNAME.ipv4], [`${HOSTNAME.localhost}:${FIXTURE.port}`, HOSTNAME.localhost], [`${HOSTNAME.upper}:${FIXTURE.port}`, HOSTNAME.localhost]]) {
    caseTest(sdk, 'ROUTES', 'open', `POST open {lang: zh} under Host ${hostHeader} → {ok: true, url}; open was asked for hostname ${hostname} and lang zh`, async () => {
      const { service, calls } = routeService()
      const r = await routesWorld(sdk, service, routeContext())
      const out = await r.call('POST', ROUTE.open, { body: { lang: K3.langs[0] }, host: hostHeader })
      assert.equal(out.json?.ok, true, out.text)
      assert.equal(typeof out.json.url, 'string')
      assert.deepEqual(calls.open.map((o) => [o.hostname, o.lang]), [[hostname, K3.langs[0]]])
    })
  }
  for (const name of [HOSTNAME.refused[0], HOSTNAME.refused[1]]) {
    caseTest(sdk, 'ROUTES', 'open', `POST open under a non-loopback Host ${name} → {ok: false, code: hostname-refused}; no URL`, async () => {
      const { service, calls } = routeService()
      const r = await routesWorld(sdk, service, routeContext())
      const out = await r.call('POST', ROUTE.open, { body: { lang: K3.langs[1] }, host: `${name}:${FIXTURE.port}` })
      assert.deepEqual(out.json, { ok: false, code: K3.admitError.hostname })
      // Whoever refuses (the route or the service it asks), no admission is issued for that name.
      assert.deepEqual(calls.open.filter((o) => HOSTNAME.served.includes(o.hostname)), [])
    })
  }
  for (const body of [{ lang: 'fr' }, {}, { lang: K3.langs[0], view: 'settings' }, 'not json']) {
    caseTest(sdk, 'ROUTES', 'open', `POST open with body ${show(body)} → refused, no admission asked`, async () => {
      const { service, calls } = routeService()
      const r = await routesWorld(sdk, service, routeContext())
      const out = await r.call('POST', ROUTE.open, { body })
      assert.notEqual(out.json?.ok, true, out.text)
      assert.deepEqual(calls.open, [])
    })
  }
  caseTest(sdk, 'ROUTES', 'open', 'the locator behind Open uses view chat (Q7: Fishball\'s page) through one admission', async () => {
    const { LOOPBACK } = await constantsModule(sdk)
    assert.equal(LOOPBACK.openView, RELAYED.openView)
  })
  caseTest(sdk, 'ROUTES', 'models', 'the models/check and models/add routes keep their V2 paths under /api/dsh-instance/', async () => {
    const { PROVIDER_SYNC_ROUTE } = await instanceModule(sdk, 'syncRoutes', 'PROVIDER_SYNC_ROUTE')
    assert.deepEqual({ ...PROVIDER_SYNC_ROUTE }, { ...ROUTE.models })
  })
  caseTest(sdk, 'ROUTES', 'secret', 'no route answer carries a token: status, retry, reconnect, open', async () => {
    const { service } = routeService()
    const r = await routesWorld(sdk, service, routeContext())
    const answers = [await r.call('GET', ROUTE.status), await r.call('POST', ROUTE.retry, { body: {} }), await r.call('POST', ROUTE.reconnect, { body: {} }), await r.call('POST', ROUTE.open, { body: { lang: K3.langs[1] } })]
    assert.equal(textOf(answers.map((a) => a.text)).includes(FIXTURE.planted), false)
  })
  caseTest(sdk, 'ROUTES', 'connector-ui', 'dsh-connector-ui no longer registers child/models/* routes nor draws the instance card (no client.instance.js)', () => {
    const files = fs.readdirSync(V3.embed.dir, { recursive: true }).map(String).filter((f) => f.endsWith('.js') && !f.split(path.sep).includes('node_modules'))
    const hits = files.filter((f) => fs.readFileSync(path.join(V3.embed.dir, f), 'utf8').includes('child/models'))
    assert.deepEqual(hits, [])
    assert.equal(fs.existsSync(path.join(V3.embed.dir, 'src', 'client', 'client.instance.js')), false)
  })

  // ===================================================================== placement (Q1, Q2)
  // Re-baselined (SHELVE-BOARD, was fishball-board, fishball-ui, fishball-core): the board is shelved, not
  // in 1.0.0-alpha.1 (the user, 2026-11-18: "先封存，留到下一批再说。所以不要预留在子实例的Fishball内。").
  caseTest(sdk, 'PLACE', 'Q2', 'PLACEMENT.bundles is fishball-ui, fishball-core (core last), with no fishball-board entry; fishball-ui\'s directory is fishball-ui', async () => {
    const { PLACEMENT: placement } = await constantsModule(sdk)
    assert.deepEqual(placement.bundles.map((b) => b.name), [...PLACEMENT.bundles])
    assert.equal(placement.bundles.find((b) => b.name === V3.ui.name)?.directory, PLACEMENT.uiDirectory)
    assert.equal(JSON.stringify(placement).includes(PLACEMENT.shelved), false, 'PLACEMENT names ' + PLACEMENT.shelved + ': ' + show(placement))
  })
  caseTest(sdk, 'PLACE', 'Q2', 'the composed child profile\'s Fishball bundles are exactly fishball-ui, fishball-core, and they end the list', async (t) => {
    const { composedProfile } = await runtimeModule(sdk)
    const mainHome = fs.realpathSync(scratch(t))
    const { paths } = await composedProfile({ mainHome, installAnchor: path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json') })
    const bundles = JSON.parse(fs.readFileSync(path.join(paths.profile, PLACEMENT.manifest), 'utf8')).dsh.profile.bundles
    assert.deepEqual(bundles.slice(-PLACEMENT.bundles.length), [...PLACEMENT.bundles])
    assert.deepEqual(bundles.filter((b) => b.startsWith('fishball-')), [...PLACEMENT.bundles], show(bundles))
  })
  // SHELVE-BOARD (state transition: fresh → first start → second start on the same home): after each,
  // nothing of fishball-board is in the child profile, not even a disabled or reserved entry.
  caseTest(sdk, 'PLACE', 'SHELVE', 'first start and a second start on the same home: no fishball-board in vendor/, node_modules/, dependencies, bundles, the placement record or an install spec', async (t) => {
    const { composedProfile } = await runtimeModule(sdk)
    const mainHome = fs.realpathSync(scratch(t))
    const installAnchor = path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json')
    for (const start of ['first', 'second']) {
      const { paths } = await composedProfile({ mainHome, installAnchor })
      assert.deepEqual(shelvedTraces(paths.profile), [], `after the ${start} start`)
    }
  })
  caseTest(sdk, 'PLACE', 'Q1', 'fishball-ui is placed (a copy in vendor/), and its fishball-shared is placed once', async (t) => {
    const { composedProfile } = await runtimeModule(sdk)
    const mainHome = fs.realpathSync(scratch(t))
    const { paths } = await composedProfile({ mainHome, installAnchor: path.join(runtimeOf(sdk), '@deepseek-ai', 'dsh', 'package.json') })
    assert.ok(fs.existsSync(path.join(paths.profile, PLACEMENT.vendor, V3.ui.name, PLACEMENT.manifest)), 'fishball-ui not placed')
    const shared = fs.readdirSync(paths.profile, { recursive: true }).map(String).filter((f) => f.endsWith(path.join(PLACEMENT.library, PLACEMENT.manifest)) && !f.split(path.sep).slice(0, -2).includes(PLACEMENT.library))
    const vendorCopies = shared.filter((f) => f.startsWith(PLACEMENT.vendor + path.sep))
    assert.equal(vendorCopies.length, 1, 'fishball-shared vendor copies: ' + show(vendorCopies))
  })

  // ===================================================================== the moved modules and the no-dependency boundary (R-ARCH-10)
  for (const [pkg, rel] of MOVED.present) caseTest(sdk, 'MOVED', 'present', `${pkg.name}/${rel} exists`, () => assert.ok(fs.existsSync(path.join(pkg.dir, rel))))
  for (const [pkg, rel] of MOVED.absent) caseTest(sdk, 'MOVED', 'absent', `${pkg.name}/${rel} is gone`, () => assert.equal(fs.existsSync(path.join(pkg.dir, rel)), false))
  caseTest(sdk, 'MOVED', 'core', "core's patch has no fishball-native-admin / fishball-native-provider-sync rows and core exports neither ./slim/admin nor ./slim/provider-sync-target", () => {
    const patch = fs.readFileSync(path.join(V3.core.dir, 'cordis.patch.yml'), 'utf8')
    for (const id of MOVED.coreRowsGone) assert.equal(patch.includes(id), false, id)
    const exports = Object.keys(readManifest(V3.core.dir).exports ?? {})
    assert.deepEqual(exports.filter((e) => MOVED.coreExportsGone.includes(e)), [])
  })
  caseTest(sdk, 'MOVED', 'session', 'fishball-core publishes the manager-session route itself: row fishball-core-session → fishball-core/session-route → src/session/route.js (registerSessionRoute)', async () => {
    const patch = fs.readFileSync(path.join(V3.core.dir, 'cordis.patch.yml'), 'utf8')
    assert.match(patch, new RegExp(`id:\\s*${MOVED.sessionRow.id}\\b[^}\\n]*name:\\s*${MOVED.sessionRow.name.replace('/', '\\/')}`))
    assert.equal(readManifest(V3.core.dir).exports?.[MOVED.sessionRow.export], MOVED.sessionRow.file)
    const text = fs.readFileSync(path.join(V3.core.dir, MOVED.sessionRow.file), 'utf8')
    assert.match(text, new RegExp('export function ' + MOVED.sessionRow.register + '\\b'))
  })
  caseTest(sdk, 'MOVED', 'session', "the instance's native-web row no longer serves /api/fishball/session", () => {
    const files = ['native-web.js', path.join('src', 'native-web.js')].map((f) => path.join(V3.instance.dir, f)).filter((f) => fs.existsSync(f))
    for (const f of files) assert.equal(/session-route|registerSessionRoute/.test(fs.readFileSync(f, 'utf8')), false, f)
  })
  test.skip('MOVED admin [SDK '+sdk+'] — withdrawn by I-READY: admin relay deleted', () => {})
  caseTest(sdk, 'MOVED', 'sync-target', 'the moved provider-sync target keeps its exports (createProviderSyncTarget, createProviderSyncTargetEndpoint, PROVIDER_SYNC_TARGET, ProviderSyncTargetError, createProviderSyncCodec, providerSyncIdentity)', async () => {
    await instanceModule(sdk, 'syncTarget', ['createProviderSyncTarget', 'createProviderSyncTargetEndpoint', 'PROVIDER_SYNC_TARGET', 'ProviderSyncTargetError', 'createProviderSyncCodec', 'providerSyncIdentity'])
  })
  caseTest(sdk, 'MOVED', 'child-row', 'child-row.js is row dsh-instance-child (id and name), with config targetUrl', async () => {
    const row = await instanceModule(sdk, 'childRow', ['name', 'apply'])
    assert.equal(row.name, IMPORT.childRow)
    assert.ok(row.Config?.dict?.[IMPORT.targetField], 'no targetUrl in the child row config')
    assert.deepEqual(Object.keys(row.Config.dict).filter((k) => SECRET_LIKE.test(k)), [], 'a secret-like child config field')
  })
  caseTest(sdk, 'BOUNDARY', 'R-ARCH-10', 'no packages/dsh-instance file imports fishball-core, fishball-ui, fishball-board or fishball-shared', async () => {
    const unit = await unitOf(V3.instance.name)
    assert.ok(unit, 'dsh-instance is not packed')
    assert.deepEqual(unit.refs.filter((r) => FISHBALL_SIDE.includes(r.target)).map(describeRef), [])
  })
  caseTest(sdk, 'BOUNDARY', 'R-ARCH-10', "the instance's manifest names no Fishball-side package in any dependency field", () => {
    const manifest = readManifest(V3.instance.dir)
    const named = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies', 'bundleDependencies', 'bundledDependencies'].flatMap((f) => (Array.isArray(manifest[f]) ? manifest[f] : Object.keys(manifest[f] ?? {})))
    assert.deepEqual(named.filter((n) => FISHBALL_SIDE.includes(n)), [])
  })
  caseTest(sdk, 'BOUNDARY', 'R-ARCH-10', 'fishball-shared no longer holds admin-protocol, provider-sync, provider-sync-codec, provider-sync-host or redact (no export, no file)', () => {
    const exports = Object.keys(readManifest(V3.shared.dir).exports ?? {})
    assert.deepEqual(exports.filter((e) => ['./admin-protocol', './provider-sync', './provider-sync-codec', './provider-sync-host', './redact'].includes(e)), [])
  })
  caseTest(sdk, 'BOUNDARY', 'packed', 'the packed instance ships child-row.js and the settings page, and no Fishball-side package copy', async () => {
    const { packed } = await observe()
    const files = packed[V3.instance.name] ?? []
    for (const f of [PAGE.childRow, PAGE.entry, ...PAGE.chunks]) assert.ok(files.includes(f), 'not packed: ' + f)
    assert.deepEqual(files.filter((f) => FISHBALL_SIDE.some((n) => f.startsWith('node_modules/' + n + '/'))), [])
  })

  // ===================================================================== model sync sets no default model (Q-G7 clarification)
  caseTest(sdk, 'SYNC', 'names', 'provider-sync-host uses the neutral names dsh-sync-default, dsh-sync-default-model and logger dsh-provider-sync', async () => {
    const c = (await requireModule(sdk, { entry: SYNC_HOST.file, exports: [SYNC_HOST.constant], task: 'I-HOST' }))[SYNC_HOST.constant]
    assert.deepEqual([c.defaultRoute, c.defaultModel, c.diagnostic?.logger], [SYNC_HOST.defaultRoute, SYNC_HOST.defaultModel, SYNC_HOST.logger])
  })
  caseTest(sdk, 'SYNC', 'Q-G7', 'the provider-sync target writes no default model and switches no session model (it names neither agent-default-model nor applyModel)', () => {
    for (const rel of [RELAYED.modules.syncTarget, path.relative(V3.instance.dir, SYNC_HOST.file)]) {
      const file = rel.startsWith('..') ? SYNC_HOST.file : path.join(V3.instance.dir, rel)
      const text = fs.readFileSync(file, 'utf8')
      assert.equal(text.includes(SYNC_HOST.defaultModelNs), false, file + ' names ' + SYNC_HOST.defaultModelNs)
      assert.equal(/applyModel|setDefaultModel|modelSet/.test(text), false, file + ' changes a model')
    }
  })
  caseTest(sdk, 'SYNC', 'Q-G7', 'K3 documents that model sync copies the provider and model lists only, never a default or session model', () => {
    const text = fs.readFileSync(UI_FREEZE.child, 'utf8')
    assert.match(text, /model list|model lists/i)
  })
  skipped(sdk, 'SYNC', 'Q-G7', 'a check and add from the instance\'s page leave the child\'s default model and the running session\'s model unchanged', SKIP.hosted('HOST-UC-07 engine with a running child'))

  // ===================================================================== K3 freeze added: dshConnectorUi
  caseTest(sdk, 'K3-UI', 'freeze', 'host-services/ui.d.ts declares dshConnectorUi with apiVersion 1, its six routes and the snapshot {marks, targets, attention, notice, light}', () => {
    const text = fs.readFileSync(UI_FREEZE.file, 'utf8')
    assert.ok(text.includes(UI_FREEZE.service))
    assert.match(text, /apiVersion\s*:\s*1/)
    for (const r of UI_FREEZE.routes) assert.ok(text.includes(r) || text.includes(r.split('/').pop()), 'route ' + r)
    for (const f of UI_FREEZE.snapshot) assert.match(text, new RegExp('\\b' + f + '\\b'), 'snapshot field ' + f)
  })
  caseTest(sdk, 'K3-UI', 'freeze', 'README and index.d.ts list dshConnectorUi', () => {
    assert.ok(fs.readFileSync(UI_FREEZE.readme, 'utf8').includes(UI_FREEZE.service))
    assert.ok(fs.readFileSync(UI_FREEZE.index, 'utf8').includes(UI_FREEZE.service))
  })
  caseTest(sdk, 'K3-UI', 'freeze', 'child.d.ts retry() text says Retry never creates a token (R6 = B)', () => {
    assert.match(fs.readFileSync(UI_FREEZE.child, 'utf8'), /never creates a token/i)
  })

  // ===================================================================== host row wiring rows that need a running host and child
  skipped(sdk, 'HOST-UC-01', 'wire', 'the host asks over mcp-credential after each start\'s authenticated wire (host.js apply in a host DSH)', SKIP.hostRow('HOST-UC-01 wire'))
  skipped(sdk, 'HOST-UC-01', 'overlay', 'a real start writes dsh-instance-child {targetUrl: <host origin>/api/agent/mcp} with a same-DSH connector', SKIP.hostRow('HOST-UC-01 overlay'))
}
