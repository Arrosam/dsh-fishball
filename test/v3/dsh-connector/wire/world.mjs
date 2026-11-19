/**
 * The C-WIRE world: one real DSH per scenario and SDK process (worker.mjs), with the connector row
 * wired and nothing faked inside it. The handle offers:
 * - `call(op, args)`: the worker's operations (root services, DSH's settings service, sessions);
 * - `owner(method, path, body)`: DSH's listener as the logged-in owner's page sends it (cookie,
 *   same-origin markers, its own Origin): the owner-only Fetch routes (connection.fetch);
 * - `raw(method, url, {headers, body})`: any request without the owner's login (the OAuth and MCP
 *   routes, the approval listener), with `Host` as dialled;
 * - `mcp(...)`: the installed SDK's stock `@modelcontextprotocol/client` on the MCP endpoint.
 *
 * Scenarios share one boot per file and SDK (booting DSH is slow); each case uses its own entries,
 * ids and sessions, so cases do not depend on each other's state.
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { after } from 'node:test'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { NODE } from '../../../support/constants.mjs'
import { until } from '../../../support/util.mjs'
import { runtimeOf } from '../../fishball-core/package/constants.mjs'
import { BUDGET, DSH, ENV, FIXTURE, HOMES, HTTP, K1, SURFACE } from './constants.mjs'

const WORKER_FILE = path.join(import.meta.dirname, 'worker.mjs')
const LOOPBACK = K1.HOSTS.loopbackNames[1]
const EPHEMERAL = 0
let homeCounter = 0

/** A free loopback port (bound and released). */
export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, LOOPBACK, () => { const { port } = s.address(); s.close(() => resolve(port)) })
  })
}

/** A process-local listener that holds `port` until closed (R6: a clash). */
export function holdPort(port = EPHEMERAL) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((_q, r) => r.end('held'))
    s.once('error', reject)
    s.listen(port, LOOPBACK, () => resolve({ port: s.address().port, close: () => new Promise((done) => { s.closeAllConnections?.(); s.close(() => done()) }) }))
  })
}

/** Starts one DSH process on `home` for `sdk`. */
async function bootWorker(home, sdk, env) {
  const child = spawn(NODE, [WORKER_FILE], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FBTEST_DSH_RUNTIME: runtimeOf(sdk), ...env },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  let exited = null
  let ready = false
  const pending = new Map()
  let nextId = 0
  child.stdout.setEncoding('utf8').on('data', (d) => { output += d })
  child.stderr.setEncoding('utf8').on('data', (d) => { output += d })
  child.on('exit', (code, signal) => { exited = { code, signal } })
  child.on('message', (msg) => {
    if (msg?.type === 'ready') ready = true
    if (msg?.type !== 'reply') return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(new Error('worker op failed: ' + msg.error?.message))
  })
  const tail = () => output.slice(-4000)
  try {
    const noWeb = env[ENV.noWebApp] === ENV.on
    const line = await until(() => exited || (ready && (noWeb || DSH.urlLine.exec(output))), BUDGET.bootMs, BUDGET.pollMs)
    if (!line || exited) {
      child.kill('SIGKILL')
      throw new Error('DSH did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
    }
    const url = noWeb ? null : new URL(line[1])
    let cookie = ''
    if (url) {
      const login = await fetch(url.origin + '/?' + DSH.tokenParam + '=' + encodeURIComponent(url.searchParams.get(DSH.tokenParam)), { redirect: 'manual' })
      await login.arrayBuffer()
      cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
    }
    const handle = {
      home, origin: url?.origin ?? null, port: url ? Number(url.port) : null, cookie, launchToken: url?.searchParams.get(DSH.tokenParam) ?? null,
      get output() { return output },
      get exited() { return exited },
      call(op, args = {}, timeout = BUDGET.testMs) {
        if (exited) return Promise.reject(new Error('worker exited ' + JSON.stringify(exited) + '\n' + tail()))
        const id = ++nextId
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(id); reject(new Error('worker op ' + op + ' timed out')) }, timeout)
          pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
          child.send({ type: 'call', id, op, args })
        })
      },
      async stop() {
        if (exited) return
        try { await handle.call('shutdown', {}, BUDGET.stopMs) } catch { /* fall through to kill */ }
        await until(() => exited, BUDGET.stopMs, BUDGET.pollMs)
        if (!exited) { child.kill('SIGKILL'); await until(() => exited, BUDGET.stopMs, BUDGET.pollMs) }
        child.stdin.destroy()
      },
    }
    if (!(await handle.call('waitReady'))) throw new Error('DSH never signalled app ready:\n' + tail())
    // Service availability is captured inside the app-ready callback, before any harness wait.
    // The route status remains a post-ready HTTP check, not an app-ready-time route measurement.
    handle.atReady = {
      services: await handle.call('atReadyServices'),
      createStatus: url ? (await fetch(url.origin + SURFACE.route.notice, { headers: { cookie, origin: url.origin, ...HTTP.sameOrigin } })).status : null,
    }
    // Harness guard only (not an oracle): cases start once the row's services are there.
    if (!noWeb && env[ENV.noConnector] !== ENV.on) {
      const names = [SURFACE.service.handover, SURFACE.service.ui]
      const up = await until(async () => Object.values(await handle.call('services', { names })).every((s) => s.present), BUDGET.readyMs, BUDGET.pollMs)
      if (!up) throw new Error('the connector row provided no services after app ready:\n' + tail())
    }
    return handle
  } catch (error) {
    // A rejected scenario never enters the map as a world, so its boot must release the worker here.
    if (!exited) child.kill('SIGKILL')
    child.stdin.destroy()
    await until(() => exited, BUDGET.stopMs, BUDGET.pollMs)
    throw error
  }
}

/** A raw HTTP exchange on loopback `port` with `Host` exactly `host` (node's fetch would rewrite it). */
export function rawRequest({ port, host, method = 'GET', path: pathname, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: LOOPBACK, port, method, path: pathname, headers: { host, ...headers } }, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        let json
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: res.statusCode, headers: res.headers, text, json })
      })
    })
    req.on('error', reject)
    if (body !== undefined) req.write(body)
    req.end()
  })
}

const scenarios = new Map()
// node:test binds after() to the current test context. Register at module scope: lazy registration
// in the first scenario's test cleans only that worker, then leaks every later scenario's IPC pipe.
after(async () => {
  for (const pending of scenarios.values()) {
    const w = await pending.catch(() => undefined)
    await w?.dsh.stop().catch(() => {})
    // Guard the recursive delete: a home this file created directly under the test-homes root.
    if (w && path.dirname(w.home) === fs.realpathSync(HOMES.root) && path.basename(w.home).startsWith(FIXTURE.homeLabel)) fs.rmSync(w.home, { recursive: true, force: true })
  }
  scenarios.clear()
})
/**
 * One booted DSH per `(sdk, label)` in this process; `options.env` adds worker environment
 * (ENV.link, ENV.contributors), `options.rowConfig()` the connector row's starting config.
 * Default approval sockets bind port zero directly, avoiding a probe/release race.
 */
export function scenario(sdk, label, options = {}) {
  const key = sdk + '/' + label
  if (!scenarios.has(key)) {
    scenarios.set(key, (async () => {
      fs.mkdirSync(HOMES.root, { recursive: true })
      const home = path.join(fs.realpathSync(HOMES.root), `${FIXTURE.homeLabel}-${label}-${Date.now()}-${process.pid}-${++homeCounter}`)
      fs.mkdirSync(home, { recursive: true })
      const rowConfig = options.rowConfig?.() ?? { approval: { port: EPHEMERAL } }
      const env = { [ENV.rowConfig]: JSON.stringify(rowConfig), ...(options.env ?? {}) }
      const dsh = await bootWorker(home, sdk, env)
      return worldOf({ sdk, home, dsh, env })
    })())
  }
  return scenarios.get(key)
}

/** A real base profile with the connector, deliberately without dsh-web-app or an HTTP listener. */
export const nonWebScenario = (sdk, label) => scenario(sdk, label, { env: { [ENV.noWebApp]: ENV.on } })

/** The case-facing face of one booted DSH. */
function worldOf({ sdk, home, dsh: first, env }) {
  let dsh = first
  const hostOf = () => new URL(dsh.origin).host
  const w = {
    sdk, home,
    get dsh() { return dsh },
    get origin() { return dsh.origin },
    get port() { return dsh.port },
    call: (op, args) => dsh.call(op, args),
    /** An owner-only route as the logged-in owner's own page sends it. */
    async owner(method, pathname, body) {
      const headers = { cookie: dsh.cookie, origin: dsh.origin, ...HTTP.sameOrigin, ...(body === undefined ? {} : { [HTTP.contentType]: 'application/json' }) }
      const res = await fetch(dsh.origin + pathname, { method, headers, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)) })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: res.status, headers: res.headers, text, json }
    },
    /** A request to DSH's own port with no login, `Host` as given (default DSH's own). */
    raw: (method, pathname, { headers, body, hostHeader = hostOf() } = {}) => rawRequest({ port: dsh.port, host: hostHeader, method, path: pathname, headers, body }),
    /** A request to the approval listener on `port`, `Host` as given. */
    approval: (method, pathname, { port, headers, body, hostHeader } = {}) => rawRequest({ port, host: hostHeader ?? `${LOOPBACK}:${port}`, method, path: pathname, headers, body }),
    urls: () => K1.oauthUrls(dsh.origin),
    settings: () => dsh.call('settings'),
    service: (service, method, ...args) => dsh.call('call', { service, method, args }),
    /**
     * A connector restart (DSH stopped and started again on the same home). `edit(config)`, when
     * given, changes the row's saved config in the profile patch while DSH is down (the user's hand
     * edit), and returns the new config.
     */
    async restart(edit) {
      await dsh.stop()
      if (edit) editRowConfig(home, sdk, edit)
      dsh = await bootWorker(home, sdk, env)
    },
  }
  return w
}

/** The profile patch (the user's layer, where DSH's settings service saves) with the connector row's config edited. */
function editRowConfig(home, sdk, edit) {
  const file = path.join(home, 'profiles', DSH.profile, DSH.homePatch)
  const YAML = createRequire(path.join(runtimeOf(sdk), 'noop.js'))('yaml')
  const doc = YAML.parse(fs.readFileSync(file, 'utf8')) ?? []
  const row = doc.find((r) => r?.id === SURFACE.rowId)
  if (!row) throw new Error('harness: the profile patch has no ' + SURFACE.rowId + ' row')
  row.config = edit(structuredClone(row.config ?? {}))
  fs.writeFileSync(file, JSON.stringify(doc, null, 2))
}

/** The installed SDK's MCP client module. */
export const sdkClient = (sdk) => import(pathToFileURL(path.join(runtimeOf(sdk), '@modelcontextprotocol', 'client', 'dist', 'index.mjs')).href)
