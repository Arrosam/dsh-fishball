/**
 * Parent side of the F-WIRE manager world (world.mjs): one throwaway standalone DSH home per SDK
 * under the repo's TEST_HOMES, booted as many times as the scenario needs (each boot is a new DSH
 * process on the same home), plus a fake target that answers only the connector's public OAuth
 * metadata (K1 builders), so core's Connect reaches an approval URL whose `agent_id` parameter is
 * the id core uses (R-OA-22; the one outside observation of a generated `identity.id`).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { after } from 'node:test'
import { NODE, TEST_HOMES } from '../../../support/constants.mjs'
import { newHome } from '../../../support/host.mjs'
import { until } from '../../../support/util.mjs'
import { BUDGET, CONNECT_INPUT, HTTP, K1, MCP, WORLD, runtimeOf } from './constants.mjs'

/** Start one DSH process on `home`; `env` adds variables (a world extension, FBTEST_WORLD_EXTENSION). */
export async function bootWorld(home, sdk, { env = {} } = {}) {
  const child = spawn(NODE, [WORLD.file], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FBTEST_DSH_RUNTIME: runtimeOf(sdk), FBTEST_CHROME: process.env.FBTEST_CHROME ?? path.join(TEST_HOMES, 'missing-chrome'), npm_config_userconfig: process.env.npm_config_userconfig ?? '/dev/null', ...env },
    // stdin stays an open pipe: DSH's launcher shuts down on stdin EOF.
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
    if (msg?.type === WORLD.ready) ready = true
    if (msg?.type !== WORLD.reply) return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(new Error('world op failed: ' + msg.error?.message))
  })
  const tail = () => output.slice(-3000)
  const line = await until(() => exited || (ready && WORLD.urlLine.exec(output)), BUDGET.bootMs, BUDGET.pollMs)
  if (!line || exited) {
    child.kill('SIGKILL')
    throw new Error('DSH did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
  }
  const url = new URL(line[1])
  const login = await fetch(url.origin + '/?token=' + encodeURIComponent(url.searchParams.get('token')), { redirect: 'manual' })
  await login.arrayBuffer()
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const h = {
    home, origin: url.origin, cookie,
    get output() { return output },
    call(op, args = {}, timeout = BUDGET.callMs) {
      if (exited) return Promise.reject(new Error('world exited ' + JSON.stringify(exited) + '\n' + tail()))
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('world op ' + op + ' timed out')) }, timeout)
        pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
        child.send({ type: WORLD.call, id, op, args })
      })
    },
    /** An owner request to DSH's web origin (cookie, same-origin `Origin`), JSON both ways. */
    async request(route, { method = HTTP.get, body, headers = {}, cookie: withCookie = true } = {}) {
      const res = await fetch(url.origin + route, {
        method,
        headers: { ...(withCookie ? { cookie } : {}), origin: url.origin, ...(body === undefined ? {} : { 'content-type': HTTP.json }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: res.status, json, text }
    },
    async stop() {
      if (exited) return
      try { await h.call('shutdown', {}, BUDGET.stopMs) } catch { /* fall through to kill */ }
      await until(() => exited, BUDGET.stopMs, BUDGET.pollMs)
      if (!exited) { child.kill('SIGKILL'); await until(() => exited, BUDGET.stopMs, BUDGET.pollMs) }
      child.stdin.destroy()
    },
  }
  if (!(await h.call('waitReady'))) throw new Error('DSH or core never became ready:\n' + tail())
  return h
}

/**
 * A scenario: steps over one home, run once per test file and shared by its cases. Each step is
 * `async (boot, facts) => void`; `boot()` starts a DSH process, stopped when the step ends. A
 * failing step is kept as `facts.error` and every later fact stays absent, so each case reports
 * the step's error instead of a misleading assertion.
 */
export function scenario(label, sdk, steps, { env } = {}) {
  let run
  let home
  after(async () => {
    // Guard the one recursive delete: a home this file created directly under the test-homes root.
    if (home && path.dirname(home) === fs.realpathSync(TEST_HOMES) && path.basename(home).startsWith(label)) fs.rmSync(home, { recursive: true, force: true })
  })
  return function facts() {
    run ??= (async () => {
      home = fs.realpathSync(newHome(label))
      const collected = {}
      for (const step of steps) {
        const live = []
        const boot = async () => { const h = await bootWorld(home, sdk, { env }); live.push(h); return h }
        try { await step(boot, collected) } catch (error) { collected.error ??= error; break } finally { for (const h of live) await h.stop().catch(() => {}) }
      }
      return collected
    })()
    return run
  }
}

/**
 * The fake target: the connector's RFC 9728 / RFC 8414 metadata from K1's builders, an MCP
 * endpoint that answers only the Bearer challenge, and a token endpoint that refuses every client.
 * Enough for core's Connect connector check; nothing is ever authorized.
 */
export async function startFakeTarget() {
  const requests = []
  const server = http.createServer((req, res) => {
    const origin = `${CONNECT_INPUT.scheme}//${req.headers.host}`
    const url = new URL(req.url, origin)
    requests.push({ method: req.method, path: url.pathname })
    req.resume()
    const json = (status, body, headers = {}) => { res.writeHead(status, { 'content-type': HTTP.json, ...headers }); res.end(JSON.stringify(body)) }
    if (url.pathname.startsWith(MCP.paths.protectedResourcePrefix)) return json(K1.HTTP_STATUS.ok, K1.protectedResourceMetadata(origin))
    if (url.pathname.startsWith(MCP.paths.authorizationServerPrefix)) return json(K1.HTTP_STATUS.ok, K1.authorizationServerMetadata(origin, origin))
    if (url.pathname === MCP.paths.token) return json(K1.OAUTH_ERROR_STATUS[K1.OAUTH_ERROR.invalidClient], K1.oauthErrorBody(K1.OAUTH_ERROR.invalidClient), K1.TOKEN_RESPONSE_HEADERS)
    if (url.pathname === MCP.paths.mcp) return json(K1.HTTP_STATUS.unauthorized, {}, { 'www-authenticate': K1.bearerChallenge(origin) })
    return json(K1.HTTP_STATUS.notFound, {})
  })
  await new Promise((resolve) => server.listen(0, CONNECT_INPUT.bindHost, resolve))
  const { port } = server.address()
  return {
    url: `${CONNECT_INPUT.scheme}//${CONNECT_INPUT.bindHost}:${port}${MCP.paths.mcp}`,
    requests,
    stop: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) }),
  }
}
