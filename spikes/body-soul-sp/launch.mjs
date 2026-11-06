/**
 * SP spike only (not production code). Boots one throwaway Option A child — profile `web`
 * (dsh-base + dsh-web-app) plus the §0.5 overlay — and serves a stand-in "main page" whose
 * iframe reaches the child through a `/fishball/embed/*` prefix proxy.
 *
 * Usage: node launch.mjs <dsh-version> [--disable row,row] [--minutes N] [--node /abs/node]
 * --node picks the Node that runs the child (SP2); default: the Node running this launcher.
 *
 * Safety rules of the SP task:
 * - the DSH home, HOME and cwd are a fresh mkdtemp directory under os.tmpdir();
 * - every port is OS-assigned (0), on 127.0.0.1;
 * - the launch token arrives over the child's IPC channel, is exchanged server-side, and is
 *   never printed or written (child output is filtered for `token=` before it is logged);
 * - stop: GET /__sp/stop (or the time limit) closes the child's stdin, which DSH treats as a
 *   graceful shutdown; only if the child is still running after STOP.graceMs does the launcher
 *   send SIGTERM to the one PID it spawned itself (checked by exitCode === null).
 */
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, appendFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SP = Object.freeze({
  versionsRoot: path.join(os.homedir(), 'Library', 'Application Support', 'DSH', 'data', 'versions'),
  host: '127.0.0.1',
  prefix: '/fishball/embed',
  control: '/__sp/',
  homePrefix: 'dsh-sp-',
  profile: 'web',
  defaultMinutes: 30,
  stopGraceMs: 15000,
  tokenPattern: /token=[^\s&"']+/g,
  redacted: 'token=<redacted>',
  fakeProvider: 'sp-fake',
  fakeModel: 'sp-model',
})

const args = process.argv.slice(2)
const version = args[0]
const option = (flag) => { const at = args.indexOf(flag); return at === -1 ? undefined : args[at + 1] }
const disabledRows = (option('--disable') ?? '').split(',').filter(Boolean)
const minutes = Number(option('--minutes') ?? SP.defaultMinutes)
// SP2 finding: under DSH.app's core/node/node wrapper, process.execPath is the Electron binary
// itself; spawned without ELECTRON_RUN_AS_NODE it boots the whole DSH-X GUI shell. The child's
// Node is therefore always explicit.
const childNode = option('--node')
if (childNode === undefined || !path.isAbsolute(childNode)) throw new Error('--node /absolute/path/to/node is required')
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) throw new Error('usage: node launch.mjs <dsh-version> [--disable rows] [--minutes N]')

const nodeModules = path.join(SP.versionsRoot, version, 'node_modules')
const bin = path.join(nodeModules, '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const home = await mkdtemp(path.join(os.tmpdir(), SP.homePrefix))
const cwd = path.join(home, 'cwd')
await mkdir(cwd)
const logFile = path.join(home, 'sp.log')
const redact = (text) => String(text).replace(SP.tokenPattern, SP.redacted)
const log = (line) => appendFile(logFile, redact(line).replace(/\n?$/, '\n'))

/** The §0.5 launch overlay, minus Fishball's own rows (the spike tests the UI shell only). */
const rows = [
  { id: 'agent-default-model', config: { provider: SP.fakeProvider, model: SP.fakeModel } },
  { id: 'web-runtime', config: { openBrowser: false, printUrl: false, surfaceContext: true } },
  { id: 'client-hmr', disabled: true },
  { id: 'ui-permission', disabled: true },
  { id: 'ui-agent-preset', disabled: true },
  ...disabledRows.map((id) => ({ id, disabled: true })),
  { insert: [
    { id: 'sp-fake-llm', name: path.join(HERE, 'fake-llm.mjs') },
    { id: 'sp-child-ui', name: path.join(HERE, 'child-ui', 'index.js') },
  ] },
]
const patch = path.join(home, 'sp.patch.yml')
// JSON is valid YAML, so the loader reads this list as a patch overlay.
await writeFile(patch, JSON.stringify(rows, null, 2))
await mkdir(path.join(home, 'tmp'))

const state = { version, home, childNode, disabledRows, startedAt: Date.now(), readyMs: undefined, childRuntime: undefined, llm: [], exit: undefined, proxyPort: undefined, childPid: undefined }
const child = spawn(childNode, [bin, '--profile', SP.profile, '--patch', patch, '--port', '0', '--no-open'], {
  cwd,
  env: { PATH: process.env.PATH, HOME: home, DSH_HOME: home, TMPDIR: path.join(home, 'tmp'), DSH_TELEMETRY_DISABLED: '1', SP_DSH_NODE_MODULES: nodeModules },
  // stdin stays an open pipe: DSH shuts down gracefully on stdin EOF (dsh-cmdline).
  stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
})
state.childPid = child.pid
child.stdout.on('data', (chunk) => log(`[child] ${chunk}`))
child.stderr.on('data', (chunk) => log(`[child:err] ${chunk}`))
child.on('exit', (code, signal) => { state.exit = { code, signal }; log(`[launcher] child exit ${code} ${signal}`) })

let childOrigin
let childCookie
const ready = new Promise((resolve, reject) => {
  child.on('exit', () => reject(new Error('child exited before handing over its URL')))
  child.on('message', async (message) => {
    if (message?.type === 'llm') { state.llm.push({ model: message.model, reasoningEffort: message.reasoningEffort }); return }
    if (message?.type !== 'auth' || childOrigin) return
    const url = new URL(message.url)
    childOrigin = url.origin
    // Server-side exchange (§0.5): the token is spent here and only the cookie is kept.
    const response = await fetch(url, { redirect: 'manual' })
    childCookie = response.headers.get('set-cookie')?.split(';')[0]
    state.readyMs = Date.now() - state.startedAt
    state.exchange = { status: response.status, cookie: childCookie ? 'kept in memory' : 'missing' }
    resolve()
  })
})

function upstreamHeaders(headers) {
  const target = new URL(childOrigin)
  const out = { ...headers, host: target.host }
  if (childCookie) out.cookie = childCookie
  else delete out.cookie
  if (out.origin) out.origin = target.origin
  delete out.referer
  return out
}

const MAIN_PAGE = `<!doctype html><html><head><title>SP main stand-in</title></head>
<body style="margin:0;font:13px system-ui"><div id="sp-bar" style="height:28px;padding:4px 8px;background:#eef">SP main page stand-in · DSH ${version} · disabled: ${disabledRows.join(',') || '(overlay only)'}</div>
<iframe id="sp-frame" src="${SP.prefix}/" style="width:100vw;height:calc(100vh - 36px);border:0"></iframe></body></html>`

async function stop(reason) {
  if (state.stopping) return
  state.stopping = reason
  await log(`[launcher] stop: ${reason}`)
  child.stdin.end()
  const deadline = setTimeout(() => {
    // PID guard: only the child this launcher spawned, and only while it is still running.
    if (child.exitCode === null && child.signalCode === null) { log(`[launcher] SIGTERM own child ${child.pid}`); child.kill('SIGTERM') }
  }, SP.stopGraceMs)
  await new Promise((resolve) => (child.exitCode !== null || child.signalCode !== null) ? resolve() : child.once('exit', resolve))
  clearTimeout(deadline)
  server.close()
  await log(`[launcher] stopped ${JSON.stringify(state.exit)}`)
  process.exit(0)
}

const server = http.createServer(async (req, res) => {
  if (req.url === `${SP.control}stop`) { res.end('stopping\n'); return stop('request') }
  if (req.url === `${SP.control}status`) {
    if (child.connected) child.send({ type: 'rss' })
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ ...state, uptimeMs: Date.now() - state.startedAt }, null, 2))
  }
  if (req.url === '/' ) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(MAIN_PAGE) }
  if (req.url === SP.prefix) { res.writeHead(308, { location: `${SP.prefix}/` }); return res.end() }
  if (!req.url.startsWith(`${SP.prefix}/`)) { res.writeHead(404); return res.end() }
  await ready
  const target = new URL(childOrigin)
  const upstream = http.request({ host: target.hostname, port: target.port, method: req.method, path: req.url.slice(SP.prefix.length), headers: upstreamHeaders(req.headers) }, (response) => {
    const headers = { ...response.headers }
    // The child's cookie never reaches the browser (§0.5).
    delete headers['set-cookie']
    if (headers.location?.startsWith('/')) headers.location = SP.prefix + headers.location
    res.writeHead(response.statusCode, headers)
    response.pipe(res)
    log(`[proxy] ${req.method} ${req.url.slice(SP.prefix.length, SP.prefix.length + 100)} ${response.statusCode}`)
  })
  upstream.on('error', (error) => { res.writeHead(502); res.end(String(error.message)) })
  req.pipe(upstream)
})
server.on('upgrade', async (req, socket, head) => {
  await ready
  if (!req.url.startsWith(`${SP.prefix}/`)) return socket.destroy()
  const target = new URL(childOrigin)
  const upstream = net.connect(Number(target.port), target.hostname, () => {
    const headers = upstreamHeaders(req.headers)
    upstream.write(`GET ${req.url.slice(SP.prefix.length)} HTTP/1.1\r\n${Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`)
    upstream.write(head)
    upstream.pipe(socket)
    socket.pipe(upstream)
    log(`[proxy] UPGRADE ${req.url.slice(SP.prefix.length)}`)
  })
  upstream.on('error', () => socket.destroy())
  socket.on('error', () => upstream.destroy())
})
child.on('message', (message) => { if (message?.type === 'rss-reply') state.childRuntime = { rssMB: Math.round(message.rss / 1048576), node: message.node, electron: message.electron } })
server.listen(0, SP.host, async () => {
  state.proxyPort = server.address().port
  console.log(JSON.stringify({ proxy: `http://${SP.host}:${state.proxyPort}/`, home, childPid: child.pid, log: logFile }))
  try { await ready; console.log(JSON.stringify({ ready: true, readyMs: state.readyMs, exchange: state.exchange })) } catch (error) { console.log(JSON.stringify({ ready: false, error: error.message })) ; stop('child failed') }
})
setTimeout(() => stop('time limit'), minutes * 60000).unref()
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))
