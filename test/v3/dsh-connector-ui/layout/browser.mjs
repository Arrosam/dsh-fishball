/**
 * A real headless Chromium for the UI-FIX-D layout rows (test-owned; no product import). It is the
 * one harness here that has real CSS layout: the node:vm pages of the draw / settings-page suites
 * have no layout engine, so a bounding box can only be measured in a browser.
 *
 * - Binary: FBTEST_CHROME, else the newest Playwright headless shell under the real user's
 *   ~/Library/Caches/ms-playwright (the run's HOME is a temp folder, so os.userInfo() is used).
 * - Always a fresh temp profile with --use-mock-keychain --password-store=basic (the brief's rule:
 *   no keychain, no saved passwords), loopback DevTools only, removed on stop.
 * - DevTools over Node's global WebSocket (flat sessions).
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { CHROME } from './constants.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** The Chromium binary, or null when none is installed. */
export function chromeBinary() {
  if (process.env.FBTEST_CHROME) return existsSync(process.env.FBTEST_CHROME) ? process.env.FBTEST_CHROME : null
  const cache = path.join(os.userInfo().homedir, ...CHROME.cache)
  if (!existsSync(cache)) return null
  for (const dir of readdirSync(cache).filter((n) => n.startsWith(CHROME.shellPrefix)).sort().reverse()) {
    const binary = path.join(cache, dir, ...CHROME.shell)
    if (existsSync(binary)) return binary
  }
  return null
}

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

async function until(read, budgetMs, what) {
  const end = Date.now() + budgetMs
  for (;;) {
    const value = await read()
    if (value) return value
    if (Date.now() > end) throw new Error('timed out waiting for ' + what)
    await sleep(CHROME.pollMs)
  }
}

/**
 * Starts Chromium. Returns null when no binary exists (callers skip, saying so).
 * The handle: `open(url, {width, height})` → a tab; `stop()`.
 */
export async function launch() {
  const binary = chromeBinary()
  if (!binary) return null
  const dir = mkdtempSync(path.join(os.tmpdir(), CHROME.tempPrefix))
  const proc = spawn(binary, [...CHROME.flags, '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' })
  let socket
  const stop = async () => {
    try { socket?.close() } catch {}
    if (proc.exitCode === null && proc.signalCode === null) {
      const exited = new Promise((resolve) => proc.once('exit', resolve))
      proc.kill()
      const forced = setTimeout(() => proc.kill('SIGKILL'), CHROME.stopMs)
      await exited
      clearTimeout(forced)
    }
    // Remove only the profile this module created directly under the OS temp dir.
    if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith(CHROME.tempPrefix)) rmSync(dir, { recursive: true, force: true })
  }
  try {
    const portFile = path.join(dir, 'DevToolsActivePort')
    const [port, wsPath] = await until(() => {
      if (proc.exitCode !== null) throw new Error('Chromium exited during startup')
      const lines = existsSync(portFile) ? readFileSync(portFile, 'utf8').trim().split('\n') : []
      return lines.length === 2 ? lines : null
    }, CHROME.startMs, 'Chromium DevTools port')
    socket = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`)
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('DevTools socket failed')), { once: true }) })
    const devtools = new Devtools(socket)
    return {
      stop,
      /** Puts the logged-in owner's cookie (`name=value; …` as a login answer sets it) into the browser for `origin`. */
      async login(origin, cookie) {
        for (const pair of cookie.split(';').map((p) => p.trim()).filter(Boolean)) {
          const at = pair.indexOf('=')
          await devtools.send('Storage.setCookies', { cookies: [{ name: pair.slice(0, at), value: pair.slice(at + 1), url: origin }] })
        }
      },
      /** A new tab at `url` with a `width` × `height` CSS-pixel viewport. */
      async open(url, { width, height = CHROME.height, colorScheme } = {}) {
        const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank' })
        const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
        const tab = {
          async evaluate(expression) {
            const r = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
            if (r.exceptionDetails) throw new Error('page evaluation failed: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text))
            return r.result.value
          },
          async resize(w, h = height) { await devtools.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, sessionId) },
          async scheme(value) { await devtools.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] }, sessionId) },
          /** A trusted mouse click at viewport coordinates. */
          async click(x, y) { for (const type of ['mousePressed', 'mouseReleased']) await devtools.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }, sessionId) },
          /** Types `text` into the focused field as a keyboard's text input does (trusted input events). */
          async type(text) { await devtools.send('Input.insertText', { text }, sessionId) },
          async screenshot() { return Buffer.from((await devtools.send('Page.captureScreenshot', { format: 'png' }, sessionId)).data, 'base64') },
          close: () => devtools.send('Target.closeTarget', { targetId }).catch(() => {}),
        }
        await tab.resize(width, height)
        if (colorScheme) await tab.scheme(colorScheme)
        await devtools.send('Page.navigate', { url }, sessionId)
        return tab
      },
      /** Polls `expression` in `tab` until it is truthy (a harness wait, never an oracle). */
      waitFor: (tab, expression, budgetMs = CHROME.loadMs, what = expression) => until(() => tab.evaluate(expression).catch(() => false), budgetMs, what),
    }
  } catch (error) {
    await stop()
    throw error
  }
}
