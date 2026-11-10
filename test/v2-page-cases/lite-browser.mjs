/**
 * LITE black-box browser environment (test-owned, no product import).
 *
 * - A headless Chromium (FBTEST_CHROME, else the local Playwright headless shell) is driven over
 *   the DevTools protocol on loopback only. No network, profile or credential is used.
 * - Two throwaway loopback HTTP origins: the "child" origin serves the harness page, the product
 *   page client (child-web/fishball-page/client.js, executed unread) and the selected SDK's real
 *   dsh-client-shortcuts browser bundle; the "main" origin only holds main-DSH storage sentinels.
 *   Distinct ports are distinct browser origins, so localStorage is really partitioned.
 * - Each case opens a fresh tab, so page state never leaks between cases.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..')

export const LITE_ENV = Object.freeze({
  pageClient: path.join(REPO, 'packages', 'instance', 'child-web', 'fishball-page', 'client.js'),
  harness: path.join(HERE, 'lite-harness.js'),
  shortcutsBundle: path.join('@deepseek-ai', 'dsh-client-shortcuts', 'lib', 'client.js'),
  routes: Object.freeze({ harness: '/', harnessScript: '/harness.js', page: '/page/client.js', sdkPrefix: '/sdk/', main: '/main' }),
  chromeCache: path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
  chromeShell: Object.freeze(['chrome-headless-shell-mac-arm64', 'chrome-headless-shell']),
  tempPrefix: 'fbtest-lite-chrome-',
  startBudgetMs: 15000,
  stopBudgetMs: 3000,
  pollMs: 20,
  loadBudgetMs: 15000,
  linuxPlatform: 'Linux x86_64',
})

/** DevTools key input vocabulary (Input.dispatchKeyEvent modifier bit mask). */
export const LITE_KEYS = Object.freeze({
  modifierBits: Object.freeze({ alt: 1, control: 2, meta: 4, shift: 8 }),
  named: Object.freeze({
    Enter: Object.freeze({ key: 'Enter', keyCode: 13 }),
    Escape: Object.freeze({ key: 'Escape', keyCode: 27 }),
    Tab: Object.freeze({ key: 'Tab', keyCode: 9 }),
    Space: Object.freeze({ key: ' ', keyCode: 32 }),
    Comma: Object.freeze({ key: ',', keyCode: 188 }),
    Slash: Object.freeze({ key: '/', keyCode: 191 }),
    ContextMenu: Object.freeze({ key: 'ContextMenu', keyCode: 93 }),
    F10: Object.freeze({ key: 'F10', keyCode: 121 }),
  }),
})

/** Key description for a physical code (Key[A-Z] or a named key) plus modifiers. */
export function keyFor(code, modifiers = []) {
  const letter = /^Key([A-Z])$/.exec(code)
  const base = letter ? { key: letter[1].toLowerCase(), keyCode: letter[1].charCodeAt(0) } : LITE_KEYS.named[code]
  if (!base) throw new Error('no key description for ' + code)
  return { ...base, code, modifiers }
}

/** DSH versions root: FBTEST_DSH_RUNTIME is `<versions>/<sdk>/node_modules`. */
export function sdkRuntime(sdk) {
  const selected = process.env.FBTEST_DSH_RUNTIME
  if (!selected) return null
  const runtime = path.join(path.dirname(path.dirname(selected)), sdk, 'node_modules')
  return existsSync(path.join(runtime, LITE_ENV.shortcutsBundle)) ? runtime : null
}

export function chromeBinary() {
  if (process.env.FBTEST_CHROME) return existsSync(process.env.FBTEST_CHROME) ? process.env.FBTEST_CHROME : null
  if (!existsSync(LITE_ENV.chromeCache)) return null
  const shells = readdirSync(LITE_ENV.chromeCache).filter((name) => name.startsWith('chromium_headless_shell-')).sort().reverse()
  for (const dir of shells) {
    const binary = path.join(LITE_ENV.chromeCache, dir, ...LITE_ENV.chromeShell)
    if (existsSync(binary)) return binary
  }
  return null
}

function serve(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler)
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function send(res, type, body) {
  res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

const HARNESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>lite</title></head><body><script src="${LITE_ENV.routes.harnessScript}"></script></body></html>`

/** Minimal flat-session DevTools client over Node's global WebSocket. */
class Devtools {
  constructor(socket) {
    this.socket = socket
    this.next = 0
    this.pending = new Map()
    socket.addEventListener('message', (message) => {
      const data = JSON.parse(String(message.data))
      if (data.id === undefined) return
      const waiter = this.pending.get(data.id)
      this.pending.delete(data.id)
      if (data.error) waiter?.reject(new Error(data.error.message))
      else waiter?.resolve(data.result)
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.next
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
    })
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(read, budgetMs, what) {
  const start = Date.now()
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() - start > budgetMs) throw new Error('timed out waiting for ' + what)
    await sleep(LITE_ENV.pollMs)
  }
}

/** Stop Chromium, both servers and the temp profile; safe when any part never started or already exited. */
async function teardown({ socket, proc, servers, dir }) {
  try { socket?.close() } catch {}
  if (proc && proc.exitCode === null && proc.signalCode === null) {
    const exited = new Promise((resolve) => proc.once('exit', resolve))
    proc.kill()
    // Bounded: a Chromium that ignores SIGTERM is killed hard instead of hanging the run.
    const forced = setTimeout(() => { if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL') }, LITE_ENV.stopBudgetMs)
    await exited
    clearTimeout(forced)
  }
  await Promise.all(servers.filter(Boolean).map((server) => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve()) })))
  // Remove only the profile directory this module created under the OS temp dir.
  if (dir && path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith(LITE_ENV.tempPrefix)) rmSync(dir, { recursive: true, force: true })
}

/**
 * Start the browser and both origins. Returns null when no Chromium binary exists. A Chromium that
 * exists but cannot start rejects after every started part is cleaned up; callers skip with that
 * reason.
 */
export async function startEnvironment() {
  const binary = chromeBinary()
  if (!binary) return null
  const parts = { servers: [] }
  try {
    const files = { [LITE_ENV.routes.harnessScript]: () => readFileSync(LITE_ENV.harness, 'utf8'), [LITE_ENV.routes.page]: () => readFileSync(LITE_ENV.pageClient, 'utf8') }
    const child = await serve((req, res) => {
      const url = new URL(req.url, 'http://child.invalid')
      if (url.pathname === LITE_ENV.routes.harness) return send(res, 'text/html', HARNESS_HTML)
      if (files[url.pathname]) return send(res, 'text/javascript', files[url.pathname]())
      if (url.pathname.startsWith(LITE_ENV.routes.sdkPrefix)) {
        const runtime = sdkRuntime(decodeURIComponent(url.pathname.slice(LITE_ENV.routes.sdkPrefix.length)))
        if (runtime) return send(res, 'text/javascript', readFileSync(path.join(runtime, LITE_ENV.shortcutsBundle), 'utf8'))
      }
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
    })
    parts.servers.push(child)
    const main = await serve((req, res) => send(res, 'text/html', '<!doctype html><title>main</title>'))
    parts.servers.push(main)
    parts.dir = mkdtempSync(path.join(os.tmpdir(), LITE_ENV.tempPrefix))
    parts.proc = spawn(binary, ['--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', '--remote-allow-origins=*', '--remote-debugging-port=0', '--user-data-dir=' + parts.dir, 'about:blank'], { stdio: 'ignore' })
    let spawnError = null
    parts.proc.once('error', (error) => { spawnError = error })
    const portFile = path.join(parts.dir, 'DevToolsActivePort')
    const [port, wsPath] = await until(() => {
      if (spawnError) throw spawnError
      if (parts.proc.exitCode !== null || parts.proc.signalCode !== null) throw new Error('Chromium exited during startup (' + (parts.proc.exitCode ?? parts.proc.signalCode) + ')')
      const lines = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : []
      return lines.length === 2 ? lines : null
    }, LITE_ENV.startBudgetMs, 'Chromium DevTools port')
    const socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`)
    parts.socket = socket
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), { once: true }) })
    const devtools = new Devtools(socket)
    const { userAgent } = await devtools.send('Browser.getVersion')
    const origin = (server) => `http://127.0.0.1:${server.address().port}`
    // A port that was just free and is closed again: a navigation there can never load content.
    const closed = await serve(() => {})
    const closedOrigin = origin(closed)
    await new Promise((resolve) => closed.close(resolve))

    async function openTab(url, { platform } = {}) {
      const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' })
      const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
      if (platform) await devtools.send('Emulation.setUserAgentOverride', { userAgent, platform }, sessionId)
      await devtools.send('Page.navigate', { url }, sessionId)
      return {
        sessionId,
        async evaluate(expression) {
          const result = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
          if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
          return result.result.value
        },
        /** A real (trusted, user-activating) mouse click at viewport coordinates. */
        async click(x, y, button = 'left') {
          for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x, y, button, clickCount: 1 }, sessionId)
        },
        /** A trusted key press (keydown + keyup) delivered by the browser input pipeline. */
        async press({ key, code, keyCode, modifiers = [] }) {
          const mask = modifiers.reduce((bits, name) => bits | LITE_KEYS.modifierBits[name], 0)
          for (const type of ['rawKeyDown', 'keyUp']) await devtools.send('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode, modifiers: mask }, sessionId)
        },
        close: () => devtools.send('Target.closeTarget', { targetId }).catch(() => {}),
      }
    }

    async function openChild({ sdk, hash = '', platform } = {}) {
      const tab = await openTab(origin(child) + LITE_ENV.routes.harness + '?sdk=' + encodeURIComponent(sdk) + hash, { platform })
      await until(() => tab.evaluate('document.readyState === "complete" && typeof window.__lite === "object"').catch(() => false), LITE_ENV.loadBudgetMs, 'harness page')
      return tab
    }

    async function openMain() {
      const tab = await openTab(origin(main) + LITE_ENV.routes.main)
      await until(() => tab.evaluate('document.readyState === "complete"').catch(() => false), LITE_ENV.loadBudgetMs, 'main page')
      return tab
    }

    return { childOrigin: origin(child), mainOrigin: origin(main), closedOrigin, openChild, openMain, stop: () => teardown(parts) }
  } catch (error) {
    await teardown(parts)
    throw error
  }
}
