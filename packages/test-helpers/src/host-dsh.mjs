/**
 * A real host DSH for integration tests (host-worker.mjs in a child process), and the HTTP calls a
 * browser on its pages would make.
 *
 * - `newHome(label)`: a fresh DSH_HOME below the run's test-homes folder (FBTEST_TEST_HOMES, which the
 *   runner puts in its throwaway temp folder: a hosted child refuses a main home with a Git ancestor).
 * - `bootHost(home, {sdk, links, env})`: boot, wait for the printed "dsh web:" URL, log in with its
 *   token as a browser does. No deadline: a boot that never prints waits until the worker exits.
 * - `untilValue(fn, pollMs)`: poll until `fn()` answers a truthy value, with no deadline.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runtimeOf } from './sdk.mjs'

const HOST = Object.freeze({
  worker: path.join(import.meta.dirname, 'host-worker.mjs'),
  homes: path.join('.runtime', 'test-homes'),
  profile: 'dshi',
  urlLine: /dsh web: (http\S+)/,
  pollMs: 100,
  tailChars: 3000,
})

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
/** Poll `fn` until it answers a truthy value; there is no deadline. */
export async function untilValue(fn, pollMs = HOST.pollMs) {
  for (;;) {
    const value = await fn()
    if (value) return value
    await sleep(pollMs)
  }
}

let counter = 0
/** A fresh, canonical DSH home for one host. */
export function newHome(label) {
  const root = process.env.FBTEST_TEST_HOMES ?? path.join(fs.realpathSync(os.tmpdir()), HOST.homes)
  const home = path.join(root, label + '-' + process.pid + '-' + ++counter)
  fs.mkdirSync(home, { recursive: true })
  return fs.realpathSync(home)
}

/** Remove a home `newHome` made (guarded: only a folder directly under the test-homes root with that label). */
export function removeHome(home, label) {
  const root = fs.realpathSync(path.dirname(home))
  if (!root.endsWith(HOST.homes) || !path.basename(home).startsWith(label + '-')) throw new Error('refusing to remove ' + home)
  fs.rmSync(home, { recursive: true, force: true })
}

/**
 * Boot one host DSH on `home` with the installed SDK `sdk`.
 * @param options.links - [{name, dir, bundle}] linked into the profile (bundle false: a library).
 * @param options.env - extra environment for the DSH process (FISHBALL_REPO, npm_config_registry …).
 */
export async function bootHost(home, { sdk, links = [], env = {} }) {
  const child = spawn(process.execPath, [HOST.worker], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', TMPDIR: process.env.TMPDIR ?? '',
      DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1',
      DSHI_RUNTIME: runtimeOf(sdk), DSHI_PROFILE: HOST.profile, DSHI_LINKS: JSON.stringify(links),
      ...(process.env.npm_config_cache ? { npm_config_cache: process.env.npm_config_cache } : {}),
      npm_config_userconfig: process.env.npm_config_userconfig ?? '/dev/null',
      ...env,
    },
    // stdin is held open: the DSH launcher shuts down on stdin EOF.
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  let exited = null
  let ready = false
  child.stdout.setEncoding('utf8').on('data', (d) => { output += d })
  child.stderr.setEncoding('utf8').on('data', (d) => { output += d })
  const exit = new Promise((resolve) => child.on('exit', (code, signal) => { exited = { code, signal }; resolve(exited) }))
  const pending = new Map()
  let nextId = 0
  child.on('message', (msg) => {
    if (msg?.type === 'ready') ready = true
    if (msg?.type !== 'reply') return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(Object.assign(new Error('host op failed: ' + msg.error?.message), { info: msg.error }))
  })
  const tail = () => output.slice(-HOST.tailChars)
  const line = await untilValue(() => exited || (ready && HOST.urlLine.exec(output)))
  if (exited) throw new Error('the host DSH did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
  const url = new URL(line[1])
  const origin = url.origin
  const login = await fetch(origin + '/?token=' + encodeURIComponent(url.searchParams.get('token')), { redirect: 'manual' })
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  if (!cookie) throw new Error('login returned no cookie (status ' + login.status + ')')
  const parse = async (res) => {
    const text = await res.text()
    let json
    try { json = JSON.parse(text) } catch { json = undefined }
    return { status: res.status, contentType: res.headers.get('content-type') ?? '', json, text }
  }
  const handle = {
    home, origin, cookie, child,
    get output() { return output },
    get exited() { return exited },
    /** One host-worker operation (info, allBundles, settingsUpdate). */
    call(op, args = {}) {
      if (exited) return Promise.reject(new Error('host exited ' + JSON.stringify(exited) + '\n' + tail()))
      const id = ++nextId
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.send({ type: 'call', id, op, args }) })
    },
    /** GET as the logged-in browser. */
    get: async (pathname, { headers = {} } = {}) => parse(await fetch(origin + pathname, { headers: { cookie, ...headers } })),
    /** POST JSON (or a raw body) as a same-origin page of this DSH. */
    async post(pathname, body, { raw = false, headers = {} } = {}) {
      return parse(await fetch(origin + pathname, { method: 'POST', headers: { cookie, origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...headers }, body: raw ? body : JSON.stringify(body) }))
    },
    /** Shut DSH down as its own shutdown does, and wait for the process to exit. */
    async stop() {
      if (exited) return
      try { await handle.call('shutdown') } catch { child.kill('SIGKILL') }
      await exit
      child.stdin.destroy()
    },
    /** Kill DSH without a shutdown (a crash), and wait for the process to exit. */
    async kill() { if (exited) return; child.kill('SIGKILL'); await exit; child.stdin.destroy() },
  }
  return handle
}
