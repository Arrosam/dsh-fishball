/**
 * Parent side of the F-GUARDS worker (worker.mjs): one throwaway standalone DSH home per scenario,
 * booted as many times as the scenario needs (each boot is a new DSH process on the same home), on
 * the SDK the test file names. The handle offers the worker's operations (`call`) and the page login
 * (`origin`, `cookie`), the way support/host.mjs does for the V2 worker; that helper is bound to the
 * V2 worker file, so this one starts ours.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after } from 'node:test'
import { NODE, TEST_HOMES } from '../../support/constants.mjs'
import { newHome, until } from '../../support/host.mjs'
import { runtimeOf } from '../core/constants.mjs'
import { BUDGET, ENV, WORKER_FILE } from './constants.mjs'

const URL_LINE = /dsh web: (http\S+)/

/** Start one DSH process on `home`; `env` carries the FBG_* variables (worker.mjs). */
export async function bootWorker(home, sdk, env = {}) {
  const child = spawn(NODE, [WORKER_FILE], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1', FBTEST_DSH_RUNTIME: runtimeOf(sdk), ...env },
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
    if (msg?.type === 'ready') ready = true
    if (msg?.type !== 'reply') return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(new Error('worker op failed: ' + msg.error?.message))
  })
  const tail = () => output.slice(-3000)
  const line = await until(() => exited || (ready && URL_LINE.exec(output)), BUDGET.bootMs, BUDGET.pollMs)
  if (!line || exited) {
    child.kill('SIGKILL')
    throw new Error('DSH did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
  }
  const url = new URL(line[1])
  const login = await fetch(url.origin + '/?token=' + encodeURIComponent(url.searchParams.get('token')), { redirect: 'manual' })
  await login.arrayBuffer()
  const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  const handle = {
    home, origin: url.origin, cookie, pid: child.pid,
    get output() { return output },
    call(op, args = {}, timeout = BUDGET.bootMs) {
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
  return handle
}

/** The FBG_* environment of one boot. */
export function bootEnv({ members = [], deselected = [], add = [], hmr = true } = {}) {
  return { FBG_MEMBERS: JSON.stringify(members), FBG_DESELECTED: JSON.stringify(deselected), FBG_ADD: JSON.stringify(add), [ENV.hmr]: hmr ? ENV.on : ENV.off }
}

/**
 * A scenario: a list of steps over one home, run once per test file and shared by its cases. Each
 * step is `async (boot, facts) => void`: `boot(env)` starts a DSH process (stopped when the step
 * ends), `facts` collects what the cases read. The first failing step fails every case that reads it.
 */
export function scenario(label, sdk, steps) {
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
        const boot = async (env) => { const h = await bootWorker(home, sdk, env); live.push(h); return h }
        try { await step(boot, collected) } finally { for (const h of live) await h.stop().catch(() => {}) }
      }
      return collected
    })()
    return run
  }
}
