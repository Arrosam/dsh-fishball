/**
 * Install-level smoke for the slim isolated Fishball on DSH 0.2.2-rc.1 (test session, 7713 round).
 *
 * Black-box: it installs the two packed tarballs of the M1 split (FBTEST_CONNECTOR_TGZ, then
 * FBTEST_INSTANCE_TGZ) into a throwaway DSH_HOME with DSH's own `dsh plugin add`, boots
 * `dsh <profile>` on a loopback port, signs in with the printed token and calls only the HTTP
 * surface a browser uses. Requirements come from docs/slim-native-design.md (§7 entries, §9
 * settings, §10 Refresh models, §6.6 uploads, T09 approvals), docs/package-layout.md and the task
 * brief.
 *
 * Opt-in: set FBTEST_CONNECTOR_TGZ and FBTEST_INSTANCE_TGZ (absolute .tgz) and FBTEST_DSH_BIN
 * (DSH-X's 0.2.2-rc.1 `dsh` wrapper). FBTEST_NODE22 is the plain Node put first on DSH's PATH (the
 * native host's default pick since 0ee4d9e; the test no longer edits the profile). Without them
 * every case is skipped. Run it outside a file sandbox: the native runtime spawns /bin/ps, and a
 * denial fails the child.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ENV = Object.freeze({
  connectorTgz: process.env.FBTEST_CONNECTOR_TGZ,
  instanceTgz: process.env.FBTEST_INSTANCE_TGZ,
  dsh: process.env.FBTEST_DSH_BIN,
  node: process.env.FBTEST_NODE22 ?? '/opt/homebrew/Cellar/node@22/22.22.2_1/bin/node',
})
const CFG = Object.freeze({
  profile: 'fbtest022',
  port: 7798,
  bootMs: 90_000,
  pollMs: 500,
  stopMs: 8_000,
  // A 1x1 PNG: the smallest valid image the upload route must admit (§6.2: png accepted).
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
})
const ROUTE = Object.freeze({
  state: '/api/fishball/state',
  native: '/api/fishball/native/status',
  // I6 (6a19e44): the one-step sync route became Check for new models / Add selected on the
  // instance's own prefix; INST-06 drives the check, which writes nothing.
  modelsCheck: '/api/fishball-instance/models/check',
  // C2 (474b876): the sidebar-entry switch is retired with the brand setting (D22); its route answers 404.
  sidebar: '/api/fishball/sidebar-entry',
  embedDoc: '/fishball/embed/',
  upload: '/fishball/embed/api/upload',
  approvals: '/fishball/embed/api/approvals',
  // N3 (option A, 535a807): the pile question form and its answer path are gone; the main row
  // never served this route (docs/slim-native-design.md §12).
  questionsAnswer: '/api/fishball/questions/answer',
})
const PACKAGE = Object.freeze({ connector: 'fishball-connector', instance: 'fishball-instance' })
const installed = (name) => path.join(home, 'profiles', CFG.profile, 'node_modules', name)
/**
 * Where a session's question is answered, as the model reads it. Since a6e0841 (N9-a port) the words sit
 * once in the shipped contract (`ANSWER_PLACE`, packages/connector/contract/pile-note.js) and every copy
 * (connector questions.js, the child's approvals.js, the persona) reads them, so the cases import the
 * installed contract instead of matching a `const IN_SESSION = '…'` literal in each source file.
 */
const answerPlace = async () => (await import(path.join(installed(PACKAGE.connector), 'contract', 'index.js'))).ANSWER_PLACE
/** A shipped source file reads its answer place from the contract (no private copy of the words). */
const readsContractPlace = (src) => /^const IN_SESSION = ANSWER_PLACE\.sessionQuestion$/m.test(src)
const skip = !ENV.connectorTgz || !ENV.instanceTgz || !ENV.dsh ? 'set FBTEST_CONNECTOR_TGZ, FBTEST_INSTANCE_TGZ and FBTEST_DSH_BIN to run' : false

let home, proc, cookie, origin, composed

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const req = (p, init = {}) => fetch(origin + p, { redirect: 'manual', ...init, headers: { cookie, ...init.headers } })
const sameOrigin = { 'sec-fetch-site': 'same-origin', origin: '' }

before(async () => {
  if (skip) return
  // realpath: the native runtime refuses a non-canonical home (macOS /tmp is a symlink).
  home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fb022-')))
  const profileDir = path.join(home, 'profiles', CFG.profile)
  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-' + CFG.profile, private: true, dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } },
  }))
  // As DSH-X creates a profile: without autoInstallPeers:false pnpm tries to fetch DSH's own
  // @deepseek-ai peers from the registry (prerelease-only) and the add fails.
  fs.writeFileSync(path.join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  // Connector first, then instance: the instance imports fishball-connector/contract and resolves
  // it as a sibling in this one profile (docs/package-layout.md §5, "Packing").
  for (const tgz of [ENV.connectorTgz, ENV.instanceTgz]) {
    const add = spawnSync(ENV.dsh, ['plugin', '--profile', CFG.profile, 'add', tgz, '--ignore-scripts'],
      { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8' })
    assert.equal(add.status, 0, `dsh plugin add ${path.basename(tgz)} failed\n${add.stderr}`)
  }
  // No profile edit (B2, 0ee4d9e): the package's own patch inserts the native-host row and picks
  // the first plain `node` on DSH's PATH, so the boot gets ENV.node's folder first on PATH.
  // The composed tree is read now, before the boot, from DSH's own --dump-config.
  const env = { ...process.env, DSH_HOME: home, PATH: `${path.dirname(ENV.node)}:${process.env.PATH}` }
  composed = spawnSync(ENV.dsh, ['--profile', CFG.profile, '--dump-config'], { env, encoding: 'utf8' }).stdout ?? ''
  origin = `http://127.0.0.1:${CFG.port}`
  sameOrigin.origin = origin
  proc = spawn(ENV.dsh, [CFG.profile, '--host', '127.0.0.1', '--port', String(CFG.port), '--no-open'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  proc.stdout.on('data', (b) => { out += b })
  proc.stderr.on('data', (b) => { out += b })
  const deadline = Date.now() + CFG.bootMs
  let token
  while (!token && Date.now() < deadline) { token = /token=([A-Za-z0-9_-]+)/.exec(out)?.[1]; await sleep(CFG.pollMs) }
  assert.ok(token, 'dsh did not print its URL')
  const signIn = await fetch(`${origin}/?token=${token}`, { redirect: 'manual' })
  cookie = (signIn.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  // Wait for the child: the native status leaves waiting/starting.
  while (Date.now() < deadline) {
    const s = await (await req(ROUTE.native)).json().catch(() => ({}))
    if (s.state === 'ready' || s.state === 'failed') break
    await sleep(CFG.pollMs)
  }
})

after(async () => {
  if (!proc) return
  proc.kill('SIGTERM')
  const t = Date.now()
  while (proc.exitCode === null && Date.now() - t < CFG.stopMs) await sleep(CFG.pollMs)
  if (proc.exitCode === null) proc.kill('SIGKILL')
  if (home && path.basename(home).startsWith('fb022-')) fs.rmSync(home, { recursive: true, force: true })
})

test('INST-01 the main Fishball row composes on 0.2.2-rc.1 (no compose-failed)', { skip }, async () => {
  const state = await (await req(ROUTE.state)).json()
  assert.notEqual(state.error?.code, 'compose-failed')
  assert.notEqual(state.status, 'failed')
})

test('INST-02 the native host status route answers and the child is ready', { skip }, async () => {
  const res = await req(ROUTE.native)
  assert.equal(res.status, 200)
  const body = await res.json()
  // Name the code: under a file sandbox that denies /bin/ps the child's PID check fails and the
  // state is failed/NATIVE_START_FAILED, an environment problem rather than a product one.
  assert.equal(body.state, 'ready', `native ${body.state}/${body.code}`)
})

test('INST-03 the embed document is served same-origin', { skip }, async () => {
  const res = await req(ROUTE.embedDoc, { headers: { 'sec-fetch-site': 'same-origin' } })
  assert.equal(res.status, 200)
})

test('INST-04 a PNG upload to the embed is admitted (not 404)', { skip }, async () => {
  const res = await req(ROUTE.upload, { method: 'POST', headers: { ...sameOrigin, 'content-type': 'application/json' },
    body: JSON.stringify({ mediaType: 'image/png', data: CFG.png, name: 'dot.png' }) })
  assert.notEqual(res.status, 404, 'upload route not mounted in the child')
  assert.equal(res.status, 200)
})

test('INST-05 the child serves /api/approvals (approval bridge mounted)', { skip }, async () => {
  const res = await req(ROUTE.approvals, { headers: { 'sec-fetch-site': 'same-origin' } })
  assert.notEqual(res.status, 404)
})

test('INST-06 Check for new models from the page (same-origin Origin header) is not refused (I6)', { skip }, async () => {
  // A browser fetch POST always carries Origin; the page's own call must pass the fence.
  const res = await req(ROUTE.modelsCheck, { method: 'POST', headers: sameOrigin })
  const body = await res.json()
  assert.notEqual(body?.error?.code, 'provider-sync-refused')
  assert.equal(res.status, 200)
  // The main side must be able to list its own providers (§10): a keyless home still has DSH's
  // built-in routes, so the check answers instead of failing the inventory (B9).
  assert.notEqual(body?.error?.code, 'provider-sync-inventory-failed', 'main-side provider inventory failed (B9)')
  // I6: the check succeeds with a one-use check id and the missing / not-offered lists.
  assert.equal(body?.ok, true, `check refused: ${JSON.stringify(body?.error ?? null)}`)
  assert.equal(typeof body?.result?.checkId, 'string', 'check result has no checkId')
  assert.ok(Array.isArray(body?.result?.missing), 'check result has no missing list')
  assert.ok(Array.isArray(body?.result?.notOffered), 'check result has no notOffered list')
})

test('INST-09 a plain install composes one row per package, and no row named fishball (M1)', { skip }, () => {
  const count = (id) => composed.split('\n').filter((line) => new RegExp('^\\s*-?\\s*id:\\s*' + id + '\\s*$').test(line)).length
  for (const id of [PACKAGE.connector, PACKAGE.instance]) assert.equal(count(id), 1, `${id} rows: ${count(id)}`)
  // The old single-package ids are gone: no row may still be called fishball or fishball-native-host.
  for (const gone of ['fishball', 'fishball-native-host']) assert.equal(count(gone), 0, `old row still composed: ${gone}`)
})

test('INST-15 both packages install side by side and the instance resolves the connector contract (M1)', { skip }, async () => {
  const connector = installed(PACKAGE.connector)
  const instance = installed(PACKAGE.instance)
  assert.ok(fs.existsSync(path.join(connector, 'contract', 'index.js')), 'connector ships contract/')
  assert.ok(fs.existsSync(path.join(instance, 'host.js')), 'instance ships host.js')
  // Neither tarball carries the other package (docs/package-layout.md, "Packing").
  assert.ok(!fs.existsSync(path.join(instance, 'contract')), 'instance tarball carries the contract')
  assert.ok(!fs.existsSync(path.join(connector, 'native-child.js')), 'connector tarball carries the instance')
  // The instance reaches the contract only through the package export, resolved as a sibling here.
  const { CONNECTOR_CONTRACT } = await import(path.join(instance, 'src', 'slim', 'contract.js'))
  assert.equal(CONNECTOR_CONTRACT.major, 1)
})

test('INST-10 no in-process Fishball session is created in the main home (§12)', { skip }, () => {
  const sessions = path.join(home, 'sessions')
  const found = fs.existsSync(sessions)
    ? fs.readdirSync(sessions, { recursive: true }).filter((name) => /(^|\/)session-fishball-/.test(String(name)))
    : []
  assert.deepEqual(found, [])
})

test('INST-11 the removed pile question-answer path stays absent, and the page no longer calls it (N3)', { skip }, async () => {
  const res = await req(ROUTE.questionsAnswer, { method: 'POST', headers: { ...sameOrigin, 'content-type': 'application/json' }, body: '{}' })
  assert.equal(res.status, 404)
  // The page's client module is the installed client.js; a leftover call would 404 in the browser.
  const client = fs.readFileSync(path.join(installed(PACKAGE.connector), 'client.js'), 'utf8')
  assert.ok(!client.includes(ROUTE.questionsAnswer.slice(1)), 'client.js still names the removed route')
})

test('INST-12 notify_when_finished rides only start/message, and question wording keeps the user in the session (N5, N6)', { skip }, async () => {
  const connector = installed(PACKAGE.connector)
  const instance = installed(PACKAGE.instance)
  // N5 (DESIGN §5b, §5c): the bridge contract admits the flag on session.start/session.message only,
  // and a delivery result carries a watchId or a watchError, never both, and never on redirect.
  const { VALIDATORS, OPERATION } = await import(path.join(connector, 'src', 'slim', 'contract.js'))
  const accepts = (fn, payload) => { try { fn(payload); return true } catch { return false } }
  const delivery = { sessionId: 's', message: 'm', attachments: [] }
  const NOTIFY = { notifyWhenFinished: true }
  assert.ok(accepts(VALIDATORS.request[OPERATION.sessionMessage], { ...delivery, ...NOTIFY }), 'message refuses notify')
  assert.ok(accepts(VALIDATORS.request[OPERATION.sessionStart], { folder: '/x', title: 't', message: 'm', attachments: [], ...NOTIFY }), 'start refuses notify')
  assert.ok(!accepts(VALIDATORS.request[OPERATION.sessionRedirect], { ...delivery, ...NOTIFY }), 'redirect admits notify')
  assert.ok(!accepts(VALIDATORS.request[OPERATION.sessionMessage], { ...delivery, notifyWhenFinished: 'yes' }), 'non-boolean notify admitted')
  assert.ok(accepts(VALIDATORS.response[OPERATION.sessionMessage], { status: 'delivered', watchError: 'limit-reached' }), 'watchError refused')
  assert.ok(!accepts(VALIDATORS.response[OPERATION.sessionMessage], { status: 'delivered', watchId: 'w', watchError: 'limit-reached' }), 'both admitted')
  assert.ok(!accepts(VALIDATORS.response[OPERATION.sessionRedirect], { status: 'delivered', watchId: 'w' }), 'redirect result admits a watch')
  // N6: the settings hints (en + zh) and the child's question texts no longer send the user to the pile.
  const client = fs.readFileSync(path.join(connector, 'client.js'), 'utf8')
  for (const gone of ['otherwise the question comes to your pile', 'Every question comes to your pile', '否则问题会进入你的待处理区', '每个问题都进入你的待处理区']) {
    assert.ok(!client.includes(gone), `old hint still shipped: ${gone}`)
  }
  for (const now of ['answer on its own question card', '该会话自己的问题卡片上回答']) assert.ok(client.includes(now), `new hint missing: ${now}`)
  // Source text of the child's model-facing strings (single-quoted JS, so the apostrophe is escaped).
  const childTexts = fs.readFileSync(path.join(instance, 'src', 'slim', 'child', 'approvals.js'), 'utf8')
  assert.ok(!childTexts.includes("send it to the user\\'s pile"), 'child to_user text still names the pile')
  assert.ok(readsContractPlace(childTexts), 'child to_user text does not read the contract answer place')
  assert.ok((await answerPlace()).sessionQuestion.includes("on that session's own question card"), 'the answer place does not name the session card')
})

test('INST-13 a question left to the user is answered only on its own session card, in every shipped copy (N7)', { skip }, async () => {
  const connector = installed(PACKAGE.connector)
  const instance = installed(PACKAGE.instance)
  const read = (root, ...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8')
  // The words must say where the answer is NOT (this chat, the pile), because Fishball told the
  // user to answer "in this chat (and in your pile)" (7713 N7). Single-quoted JS: \' in source.
  const NOT_HERE = "not in this chat or the user's pile"
  const main = read(connector, 'src', 'questions.js')
  const child = read(instance, 'src', 'slim', 'child', 'approvals.js')
  assert.ok((await answerPlace()).sessionQuestion.includes(NOT_HERE), 'the answer place does not exclude chat and pile')
  // One text, not two copies: both shipped files read the contract's words.
  assert.ok(readsContractPlace(main), 'main IN_SESSION is not the contract answer place')
  assert.ok(readsContractPlace(child), 'child IN_SESSION is not the contract answer place')
  // The to_user result itself names the place, and the old "shown on that decision in your chat" is gone.
  for (const [name, src] of [['main', main], ['child', child]]) {
    assert.ok(/toUserResult: `Left to the user: \$\{IN_SESSION\}/.test(src), `${name} has no to_user result note`)
    assert.ok(/toUser: true, note: TEXT\.toUserResult/.test(src), `${name} to_user result omits the note`)
    assert.ok(!src.includes('it is shown on that decision in your chat'), `${name} noteArg still points to the chat`)
  }
  // ask_user is for Fishball's own questions only; the persona tells Fishball to send the user there.
  assert.ok(/askDescription: `[^`]*\$\{OWN_ONLY\}/.test(child), 'ask_user does not say it is for own questions only')
  // The persona as the model reads it (since bf911d7 it is composed from pile-note.js, so the source
  // file alone no longer holds the sentence): the rendered PERSONA_ROLE string.
  const { PERSONA_ROLE } = await import(path.join(instance, 'src', 'persona.js'))
  assert.ok(String(PERSONA_ROLE).includes("not in this chat or the user's pile, so tell the user to answer it there"), 'persona does not send the user to the session card')
})

test('INST-14 the state reports whether the child can answer, and the persona names the session card before a question arrives (N10, N9-a)', { skip }, async () => {
  // N10: with the child up, /api/fishball/state carries bridge.connected true beside the store's
  // own lifecycle status (7713: a child exit showed nothing in the state).
  const state = await (await req(ROUTE.state)).json()
  assert.equal(state.bridge?.connected, true, 'state.bridge.connected is not true while the child is ready')
  assert.equal(state.status, 'live', 'state.status is not the store lifecycle')
  // N9-a: Fishball read only the to_user wording after the question came, so before it came it
  // guessed "a card in this chat (and in your pile)". The persona must say where, up front.
  const instance = installed(PACKAGE.instance)
  const { PERSONA_ROLE } = await import(path.join(instance, 'src', 'persona.js'))
  // PERSONA_ROLE is the joined persona text (the system prompt prefix).
  const persona = String(PERSONA_ROLE)
  const inSession = (await answerPlace()).sessionQuestion
  assert.ok(inSession, 'ANSWER_PLACE.sessionQuestion not found in the shipped contract')
  assert.ok(persona.includes(`a question or plan review from a session you manage is never in either, ${inSession}`), 'persona answer places do not use the IN_SESSION words')
  assert.ok(persona.includes('even before it arrives, say on that session\'s own question card'), 'persona does not cover the time before the question arrives')
  assert.ok(persona.includes('a session\'s question never does'), 'ask_user paragraph still lets a session question show in this chat')
})

test('INST-07 the retired Sidebar entry route answers 404 (C2, D22)', { skip }, async () => {
  for (const entry of ['brand', 'panel']) {
    const res = await req(ROUTE.sidebar, { method: 'POST', headers: { ...sameOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ entry }) })
    assert.equal(res.status, 404, `sidebar-entry ${entry}`)
  }
})

test('INST-08 stopping DSH stops the child (no orphan)', { skip }, async () => {
  const runtime = path.join(home, 'fishball', 'runtime')
  const list = spawnSync('pgrep', ['-f', runtime], { encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)
  assert.ok(list.length > 0, 'child not running before stop')
  proc.kill('SIGTERM')
  const t = Date.now()
  while (proc.exitCode === null && Date.now() - t < CFG.stopMs) await sleep(CFG.pollMs)
  await sleep(2000)
  const left = spawnSync('pgrep', ['-f', runtime], { encoding: 'utf8' }).stdout.trim()
  assert.equal(left, '', 'child survived DSH stop')
})
