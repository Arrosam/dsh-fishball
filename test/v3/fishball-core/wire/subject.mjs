import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { C, runtimeOf } from './constants.mjs'
import { until } from '../../../support/util.mjs'
export async function contracts() { return import(pathToFileURL(path.join(C.repo, 'packages/core/contracts/constants.js')).href) }
export function manifest() { return JSON.parse(fs.readFileSync(path.join(C.repo, 'packages/core/package.json'), C.encoding)) }
export async function patches(sdk) {
  const { loadOverlayPatches } = await import(pathToFileURL(path.join(runtimeOf(sdk), '@deepseek-ai/dsh-app-boot/lib/index.js')).href)
  return loadOverlayPatches(C.core, path.join(C.repo, 'packages/core/cordis.patch.yml'))
}
/** Static architecture acceptance scan; sources are opaque and only forbidden import specifiers are returned. */
export function forbiddenImports() {
  const hits = []
  function visit(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (C.skipDirs.includes(e.name)) continue
      const file = path.join(dir, e.name)
      if (e.isDirectory()) visit(file)
      else if (C.source.test(file)) for (const m of fs.readFileSync(file, C.encoding).matchAll(C.imports)) hits.push({ file: path.relative(C.repo, file), specifier: m[C.one] })
    }
  }
  for (const root of C.scanRoots) visit(path.join(C.repo, root))
  return hits
}
/**
 * A copy of the suite's fishball-board stand-in whose engines.dsh no SDK meets (SHELVE-BOARD's
 * "present and broken" board), under the test-homes root; DSH skips it as incompatible. Removed by
 * the caller's `after`. The shelved packages/board is never read.
 */
export function brokenBoardCopy() {
  fs.mkdirSync(path.join(C.temp, C.homesSuffix), { recursive: true })
  const dir = fs.mkdtempSync(path.join(C.temp, C.homesSuffix, C.shelved.brokenPrefix))
  fs.cpSync(C.shelved.standIn, dir, { recursive: true })
  const file = path.join(dir, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(file, C.encoding))
  fs.writeFileSync(file, JSON.stringify({ ...pkg, engines: { ...pkg.engines, dsh: C.shelved.impossibleEngine } }))
  return dir
}
export async function boot(sdk, members, home, dirs = {}) {
  fs.mkdirSync(path.join(C.temp, C.homesSuffix), { recursive: true })
  home ??= fs.mkdtempSync(path.join(C.temp, C.homesSuffix, C.homePrefix))
  const child = spawn(process.execPath, [C.worker], { env: { ...process.env, HOME: home, DSH_HOME: home, FBW_SDK: sdk, FBW_MEMBERS: JSON.stringify(members), FBW_DIRS: JSON.stringify(dirs), FBTEST_DSH_RUNTIME: runtimeOf(sdk), FBTEST_CHROME: C.env.chrome, npm_config_userconfig: C.env.userconfig, [C.env.testHomes]: C.testHomes }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })
  let output = C.empty; let exited = false; let ready = false; let next = C.first
  const pending = new Map()
  child.stdout.on('data', (d) => { output += d }); child.stderr.on('data', (d) => { output += d })
  child.on('exit', () => { exited = true })
  child.on('message', (m) => { if (m.type === 'ready') ready = true; if (m.type === 'reply') { const p = pending.get(m.id); if (p) { pending.delete(m.id); m.ok ? p.resolve(m.value) : p.reject(new Error(m.error.message)) } } })
  const h = { home,
    call(op, args = {}) { return new Promise((resolve, reject) => { const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Worker operation timed out: ' + op)) }, C.budget.call); pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } }); child.send({ type: 'call', id, op, args }) }) },
    async stop() { if (!exited) { child.kill('SIGTERM'); await until(() => exited, C.budget.stop, C.budget.poll); if (!exited) child.kill('SIGKILL') } child.stdin.destroy() },
  }
  try {
    await until(() => exited || (ready && /dsh web: (http\S+)/.test(output)), C.budget.boot, C.budget.poll)
    if (exited || !ready) throw new Error('Standalone boot failed: ' + output.slice(-C.logLimit))
    const url = new URL(/dsh web: (http\S+)/.exec(output)[C.one])
    h.origin = url.origin; h.token = url.searchParams.get('token')
    const login = await fetch(url.origin + '/?token=' + encodeURIComponent(url.searchParams.get('token')), { redirect: 'manual' })
    await login.arrayBuffer()
    h.cookie = login.headers.getSetCookie().map((c) => c.split(';')[C.first]).join('; ')
    if (!await h.call('ready')) throw new Error('Core services were not ready')
    return h
  } catch (e) { await h.stop(); throw e }
}
export async function request(h, route, body, headers = {}, cookie = true) {
  const r = await fetch(h.origin + route, { method: body === undefined ? C.method.get : C.method.post, headers: { ...(cookie ? { cookie: h.cookie } : {}), origin: h.origin, 'content-type': C.json, ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await r.text(); let json; try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text, cache: r.headers.get('cache-control') }
}
/** One request over the listener's socket with an explicit Host (fetch() cannot set Host). */
function raw(h, { method, route, authority, headers }) {
  const target = new URL(h.origin)
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: target.hostname, port: target.port, path: route, method, headers: { ...headers, host: authority } }, (res) => {
      let text = C.empty
      res.setEncoding(C.encoding).on('data', (d) => { text += d }).on('end', () => { let json; try { json = JSON.parse(text) } catch {} resolve({ status: res.statusCode, headers: res.headers, json, text }) })
    })
    req.on('error', reject)
    req.end(method === C.method.post ? JSON.stringify({}) : undefined)
  })
}
/**
 * An owner POST from a page at Host `authority` with Origin `origin` (omitted: no Origin header).
 * DSH's browser cookie is bound to the request authority, so the launch token signs this authority
 * in first, as a browser opening that address would; DSH's own fence (dsh-client-connection
 * isTrustedApiRequest) still judges the Host/Origin pair before core.
 */
export async function requestAs(h, route, { authority, origin }) {
  h.cookies ??= {}
  if (h.cookies[authority] === undefined) {
    const login = await raw(h, { method: C.method.get, route: '/?token=' + encodeURIComponent(h.token), authority, headers: {} })
    h.cookies[authority] = [login.headers['set-cookie'] ?? []].flat().map((c) => c.split(';')[C.first]).join('; ')
  }
  return raw(h, { method: C.method.post, route, authority, headers: { cookie: h.cookies[authority], 'content-type': C.json, ...(origin === undefined ? {} : { origin }) } })
}
