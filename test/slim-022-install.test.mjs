/**
 * Install-level smoke for the slim isolated Fishball on DSH 0.2.2-rc.1 (test session, 7713 round).
 *
 * Black-box: it installs a packed tarball (FBTEST_TGZ) into a throwaway DSH_HOME with DSH's own
 * `dsh plugin add`, boots `dsh <profile>` on a loopback port, signs in with the printed token and
 * calls only the HTTP surface a browser uses. Requirements come from docs/slim-native-design.md
 * (§7 entries, §9 settings, §10 Refresh models, §6.6 uploads, T09 approvals) and the task brief.
 *
 * Opt-in: set FBTEST_TGZ (absolute .tgz) and FBTEST_DSH_BIN (DSH-X's 0.2.2-rc.1 `dsh` wrapper).
 * FBTEST_NODE22 is the plain Node put first on DSH's PATH (the native host's default pick since
 * 0ee4d9e; the test no longer edits the profile). Without them every case is skipped.
 * Run it outside a file sandbox: the native runtime spawns /bin/ps, and a denial fails the child.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ENV = Object.freeze({
  tgz: process.env.FBTEST_TGZ,
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
  sync: '/api/fishball/native/provider-sync/sync',
  sidebar: '/api/fishball/sidebar-entry',
  embedDoc: '/fishball/embed/',
  upload: '/fishball/embed/api/upload',
  approvals: '/fishball/embed/api/approvals',
})
const skip = !ENV.tgz || !ENV.dsh ? 'set FBTEST_TGZ and FBTEST_DSH_BIN to run' : false

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
  const add = spawnSync(ENV.dsh, ['plugin', '--profile', CFG.profile, 'add', ENV.tgz, '--ignore-scripts'],
    { env: { ...process.env, DSH_HOME: home }, encoding: 'utf8' })
  assert.equal(add.status, 0, 'dsh plugin add failed')
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

test('INST-06 Refresh models from the page (same-origin Origin header) is not refused', { skip }, async () => {
  // A browser fetch POST always carries Origin; the page's own call must pass the fence.
  const res = await req(ROUTE.sync, { method: 'POST', headers: sameOrigin })
  const body = await res.json()
  assert.notEqual(body?.error?.code, 'provider-sync-refused')
  assert.equal(res.status, 200)
  // The main side must be able to list its own providers (§10): a keyless home still has DSH's
  // built-in routes, so the answer names them (skipped: no key) instead of failing the inventory.
  assert.notEqual(body?.error?.code, 'provider-sync-inventory-failed', 'main-side provider inventory failed (B9)')
})

test('INST-09 a plain install composes exactly one native-host row (B2)', { skip }, () => {
  const rows = composed.split('\n').filter((line) => /^\s*-?\s*id:\s*fishball-native-host\s*$/.test(line))
  assert.equal(rows.length, 1, `native-host rows: ${rows.length}`)
})

test('INST-10 no in-process Fishball session is created in the main home (§12)', { skip }, () => {
  const sessions = path.join(home, 'sessions')
  const found = fs.existsSync(sessions)
    ? fs.readdirSync(sessions, { recursive: true }).filter((name) => /(^|\/)session-fishball-/.test(String(name)))
    : []
  assert.deepEqual(found, [])
})

test('INST-07 the Sidebar entry switch saves', { skip }, async () => {
  for (const entry of ['brand', 'panel']) {
    const res = await req(ROUTE.sidebar, { method: 'POST', headers: { ...sameOrigin, 'content-type': 'application/json' }, body: JSON.stringify({ entry }) })
    assert.equal(res.status, 200, `sidebar-entry ${entry}`)
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
