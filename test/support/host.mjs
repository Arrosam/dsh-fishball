/**
 * Parent-side handle on one booted DSH test process (support/worker.mjs).
 * - newHome(): a fresh throwaway DSH_HOME under .runtime/test-homes.
 * - bootHost(home): spawn the worker with stdin held open, wait for the
 *   printed "dsh web:" URL, and log in with its token like a browser does.
 * The handle exposes worker operations (call) and the HTTP API (get, post, sse).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { API, MS, NODE, STATUS, TEST_HOMES, WORKER } from './constants.mjs'
import { sleep, until } from './util.mjs'

let homeCounter = 0
export function newHome(label) {
  const home = path.join(TEST_HOMES, label + '-' + Date.now() + '-' + process.pid + '-' + ++homeCounter)
  fs.mkdirSync(home, { recursive: true })
  return home
}

export async function bootHost(home, { timeoutMs = MS.boot, env = {} } = {}) {
  const child = spawn(NODE, [WORKER], {
    // FBTEST_PLUGIN_DIR from the runner's environment boots another checkout of the plugin (a baseline run of a file).
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', ...(process.env.FBTEST_PLUGIN_DIR ? { FBTEST_PLUGIN_DIR: process.env.FBTEST_PLUGIN_DIR } : {}), ...env },
    // stdin is a pipe that is never ended: the DSH launcher shuts down on stdin EOF.
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  let exited = null
  child.stdout.setEncoding('utf8').on('data', (d) => { output += d })
  child.stderr.setEncoding('utf8').on('data', (d) => { output += d })
  child.on('exit', (code, signal) => { exited = { code, signal } })
  const pending = new Map()
  let nextId = 0
  let ready = false
  child.on('message', (msg) => {
    if (msg?.type === 'ready') ready = true
    if (msg?.type !== 'reply') return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(Object.assign(new Error('worker op failed: ' + msg.error?.message), { info: msg.error }))
  })
  const tail = () => output.slice(-3000)
  const urlLine = await until(() => exited || (ready && /dsh web: (http\S+)/.exec(output)), timeoutMs, 50)
  if (!urlLine || exited) {
    child.kill('SIGKILL')
    throw new Error('DSH test host did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
  }
  const url = new URL(urlLine[1])
  const origin = url.origin
  const login = await fetch(origin + '/?token=' + encodeURIComponent(url.searchParams.get('token')), { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('login returned no cookie (status ' + login.status + ')')

  const handle = {
    home, origin, cookie, child,
    get output() { return output },
    get exited() { return exited },
    call(op, args = {}, timeout = 40000) {
      if (exited) return Promise.reject(new Error('worker exited ' + JSON.stringify(exited) + '\n' + tail()))
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('worker op ' + op + ' timed out')) }, timeout)
        pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
        child.send({ type: 'call', id, op, args })
      })
    },
    async get(pathname) {
      const res = await fetch(origin + pathname, { headers: { cookie } })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: res.status, contentType: res.headers.get('content-type') ?? '', json, text }
    },
    async post(pathname, body, { raw = false, headers = {} } = {}) {
      const res = await fetch(origin + pathname, {
        method: 'POST',
        headers: { cookie, origin, 'content-type': 'application/json', ...headers },
        body: raw ? body : JSON.stringify(body),
      })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: res.status, contentType: res.headers.get('content-type') ?? '', json, text }
    },
    async state() { return (await handle.get(API.state)).json },
    /** Wait for the state endpoint to report one of the given statuses; returns the last snapshot. */
    async waitStatus(statuses, timeoutMs = MS.live) {
      const want = [].concat(statuses)
      let last
      await until(async () => {
        try { last = await handle.state() } catch { last = undefined }
        return last && want.includes(last.status)
      }, timeoutMs, MS.poll)
      return last
    },
    /** Open the SSE stream; frames are parsed JSON snapshots, in order. */
    async sse(pathname = API.events) {
      const controller = new AbortController()
      const res = await fetch(origin + pathname, { headers: { cookie, accept: 'text/event-stream' }, signal: controller.signal })
      const frames = []
      const stream = { status: res.status, contentType: res.headers.get('content-type') ?? '', frames, close: () => controller.abort() }
      if (!res.body) return stream
      ;(async () => {
        const decoder = new TextDecoder()
        let buffer = ''
        try {
          for await (const chunk of res.body) {
            buffer += decoder.decode(chunk, { stream: true })
            let cut
            while ((cut = buffer.indexOf('\n\n')) >= 0) {
              const block = buffer.slice(0, cut)
              buffer = buffer.slice(cut + 2)
              const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n')
              if (data) { try { frames.push(JSON.parse(data)) } catch { frames.push({ unparsable: data }) } }
            }
          }
        } catch { /* aborted */ }
      })()
      return stream
    },
    /** P6: kill the DSH process without a shutdown (a crash). */
    async kill() {
      if (exited) return
      child.kill('SIGKILL')
      await until(() => exited, 5000, 50)
      child.stdin.destroy()
    },
    async stop() {
      if (exited) return
      try { await handle.call('shutdown', {}, MS.stop) } catch { /* fall through to kill */ }
      await until(() => exited, 5000, 50)
      if (!exited) { child.kill('SIGKILL'); await until(() => exited, 3000, 50) }
      child.stdin.destroy()
    },
  }
  return handle
}

/** Boot and wait until Fishball reports "live" (its first-creation setup turn has ended). */
export async function bootLive(home) {
  const host = await bootHost(home)
  const state = await host.waitStatus(STATUS.live)
  return { host, state }
}

export { sleep, until }
