/**
 * A booted standalone DSH for system tests: one child process (./dsh-world-child.mjs) that runs the
 * current DSH's own `runProfile` on a throwaway home under the test homes (FBTEST_TEST_HOMES), with the
 * scripted model (./fake-llm) as DSH's default model and the caller's package folders installed as
 * DSH's native add installs them. No Fishball package is assumed: a caller passes its own folders.
 *
 * - `newHome(label)`: a fresh home folder directly under the test homes.
 * - `bootWorld(home, {packages, env, extension, overlay})`: start one DSH process on `home`; answers a
 *   handle with `call(op, args)` (the world ops, BASE_OPS plus the extension's), `request(route, …)`
 *   (an owner request to DSH's web origin with the login cookie), `origin`, `cookie`, `token`,
 *   `output`, `stop()` and `kill()`.
 * - `scenario(label, steps, options)`: steps over one home, run once per test file and shared by its
 *   cases; the home is removed after the file (a guarded delete).
 *
 * Packages: `[{dir, name?, selected?}]`, in install order. Each becomes a `link:` dependency of the
 * profile and a `node_modules` link; a `selected` one (the default) is appended to
 * `dsh.profile.bundles` the first time the profile gets it (a library such as fishball-shared is
 * `selected: false`). Every boot re-points the links, so a package added to a later boot is installed
 * as if added while DSH was down, and the owner's own later bundle edits are kept.
 *
 * Extension: an absolute module path whose optional exports are
 * `prepare({model, profileDir, firstStart})` (after profile initialization, before DSH boots: seed
 * the test profile or change the scripted model, e.g. its input modalities),
 * `ready({ctx})` (truthy once the extension's services are up; waitReady waits for it too) and
 * `ops({ctx, model, world})` (more ops; `world` holds the base helpers, see the child).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after } from 'node:test'
import { DSH_ENV } from './dsh.mjs'
import { RUNTIME } from './runtime.mjs'
import { RUN } from './runner.mjs'
import { until } from './wait.mjs'

/** The parent–child protocol and the world's fixed names. */
export const WORLD = Object.freeze({
  child: path.join(import.meta.dirname, 'dsh-world-child.mjs'),
  profile: 'fbtest', workDir: 'work', overlay: 'fbtest-world.overlay.yml',
  /** The fragment every test-homes root keeps (the runner's layout); a home outside it is refused. */
  homesMarker: RUN.dirs.homes,
  env: Object.freeze({ packages: 'FBTEST_WORLD_PACKAGES', extension: 'FBTEST_WORLD_EXTENSION', overlay: 'FBTEST_WORLD_OVERLAY', homes: RUN.homesEnv }),
  message: Object.freeze({ ready: 'ready', reply: 'reply', call: 'call' }),
  shutdownOp: 'shutdown', waitReadyOp: 'waitReady',
  urlLine: /dsh web: (http\S+)/,
  tokenParam: 'token', cookieSeparator: '; ', cookieEnd: ';',
  /** Environment of the child beyond the caller's: no telemetry, no colour, no user npm config. */
  childEnv: Object.freeze({ DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1' }),
  noUserConfig: '/dev/null', defaultPath: '/usr/bin:/bin', missingChrome: 'missing-chrome',
  /** Variables handed down from the test process when set (FBTEST_* and the runner's isolation). */
  inherited: Object.freeze(['PATH', 'HOME', 'TMPDIR', 'TMP', 'TEMP', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'npm_config_cache', 'npm_config_userconfig', 'FBTEST_CHROME']),
  inheritedPrefix: 'FBTEST_',
  homeSeparator: '-', outputTail: 3000,
})

/** Harness waits only; none is a product oracle. */
export const WORLD_BUDGET = Object.freeze({ bootMs: 180000, readyMs: 90000, callMs: 120000, stopMs: 20000, killMs: 5000, pollMs: 100, turnMs: 60000 })

/** The root of the throwaway homes: the runner's FBTEST_TEST_HOMES, else a private folder under the OS temp folder. */
export const TEST_HOMES = process.env[WORLD.env.homes] ?? path.join(os.tmpdir(), 'fbtest-' + process.pid, WORLD.homesMarker)

let homeCounter = 0
/** A fresh home directly under TEST_HOMES, named `<label>-<time>-<pid>-<n>` (real path). */
export function newHome(label) {
  const home = path.join(TEST_HOMES, [label, Date.now(), process.pid, ++homeCounter].join(WORLD.homeSeparator))
  fs.mkdirSync(home, { recursive: true })
  return fs.realpathSync(home)
}

/** Remove `home` only when it is a `label` home directly under TEST_HOMES (the one recursive delete). */
export function removeHome(home, label) {
  if (home && fs.existsSync(TEST_HOMES) && path.dirname(home) === fs.realpathSync(TEST_HOMES) && path.basename(home).startsWith(label)) fs.rmSync(home, { recursive: true, force: true })
}

const readManifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
/** `{name, dir, selected}` of each package (the name from its own manifest when not given). */
const normalisePackages = (packages) => packages.map((p) => {
  const entry = typeof p === 'string' ? { dir: p } : p
  const dir = path.resolve(entry.dir)
  return { name: entry.name ?? readManifest(dir).name, dir, selected: entry.selected ?? true }
})

function childEnv(home, { packages, extension, overlay, env }) {
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([k]) => WORLD.inherited.includes(k) || k.startsWith(WORLD.inheritedPrefix)))
  return {
    PATH: WORLD.defaultPath, npm_config_userconfig: WORLD.noUserConfig, FBTEST_CHROME: path.join(TEST_HOMES, WORLD.missingChrome),
    ...inherited, ...WORLD.childEnv,
    DSH_HOME: home,
    [WORLD.env.homes]: TEST_HOMES,
    [DSH_ENV.runtime]: RUNTIME,
    [WORLD.env.packages]: JSON.stringify(normalisePackages(packages)),
    [WORLD.env.overlay]: JSON.stringify(overlay),
    ...(extension ? { [WORLD.env.extension]: extension } : {}),
    ...env,
  }
}

/**
 * Start one DSH process on `home` and wait until its web listener is up and `waitReady` holds.
 * @param {string} home - a home from newHome (the child refuses any other).
 * @param {{packages?: Array<string | {dir: string, name?: string, selected?: boolean}>, env?: object, extension?: string, overlay?: object[]}} [options]
 *   `env` more child variables (fake-llm's FAKE_LLM_ENV switches, a package's own); `overlay` more patch
 *   entries after the world's own (e.g. `{id: 'hmr', disabled: true}`).
 */
export async function bootWorld(home, { packages = [], env = {}, extension, overlay = [] } = {}) {
  const child = spawn(process.execPath, [WORLD.child], {
    env: childEnv(home, { packages, extension, overlay, env }),
    // stdin stays an open pipe: DSH's launcher shuts down on stdin EOF.
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  let exited = null
  let ready = false
  let nextId = 0
  const pending = new Map()
  child.stdout.setEncoding('utf8').on('data', (d) => { output += d })
  child.stderr.setEncoding('utf8').on('data', (d) => { output += d })
  child.on('exit', (code, signal) => { exited = { code, signal } })
  child.on('message', (msg) => {
    if (msg?.type === WORLD.message.ready) ready = true
    if (msg?.type !== WORLD.message.reply) return
    const p = pending.get(msg.id)
    if (!p) return
    pending.delete(msg.id)
    if (msg.ok) p.resolve(msg.value)
    else p.reject(Object.assign(new Error('world op failed: ' + msg.error?.message), { info: msg.error }))
  })
  const tail = () => output.slice(-WORLD.outputTail)
  const h = {
    home, pid: child.pid, child,
    get output() { return output },
    get exited() { return exited },
    call(op, args = {}, timeout = WORLD_BUDGET.callMs) {
      if (exited) return Promise.reject(new Error('world exited ' + JSON.stringify(exited) + '\n' + tail()))
      const id = ++nextId
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('world op ' + op + ' timed out')) }, timeout)
        pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
        child.send({ type: WORLD.message.call, id, op, args })
      })
    },
    /** An owner request to DSH's web origin (login cookie, same-origin Origin), JSON both ways. */
    async request(route, { method = 'GET', body, headers = {}, cookie: withCookie = true } = {}) {
      const res = await fetch(h.origin + route, {
        method,
        headers: { ...(withCookie ? { cookie: h.cookie } : {}), origin: h.origin, ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch { json = undefined }
      return { status: res.status, contentType: res.headers.get('content-type') ?? '', cache: res.headers.get('cache-control'), json, text }
    },
    /** DSH's own shutdown, then a kill if it does not exit. */
    async stop() {
      if (exited) return
      try { await h.call(WORLD.shutdownOp, {}, WORLD_BUDGET.stopMs) } catch { /* fall through to kill */ }
      await until(() => exited, WORLD_BUDGET.stopMs, WORLD_BUDGET.pollMs)
      if (!exited) { child.kill('SIGKILL'); await until(() => exited, WORLD_BUDGET.stopMs, WORLD_BUDGET.pollMs) }
      child.stdin.destroy()
    },
    /** A crash: the process is killed without a shutdown. */
    async kill() {
      if (exited) return
      child.kill('SIGKILL')
      await until(() => exited, WORLD_BUDGET.killMs, WORLD_BUDGET.pollMs)
      child.stdin.destroy()
    },
  }
  try {
    const line = await until(() => exited || (ready && WORLD.urlLine.exec(output)), WORLD_BUDGET.bootMs, WORLD_BUDGET.pollMs)
    if (!line || exited) throw new Error('DSH did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
    const url = new URL(line[1])
    h.origin = url.origin
    h.token = url.searchParams.get(WORLD.tokenParam)
    const login = await fetch(url.origin + '/?' + WORLD.tokenParam + '=' + encodeURIComponent(h.token), { redirect: 'manual' })
    await login.arrayBuffer()
    h.cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(WORLD.cookieEnd)[0]).join(WORLD.cookieSeparator)
    if (!(await h.call(WORLD.waitReadyOp, {}, WORLD_BUDGET.bootMs))) throw new Error('DSH never became ready:\n' + tail())
    return h
  } catch (error) {
    if (!exited) { child.kill('SIGKILL'); await until(() => exited, WORLD_BUDGET.killMs, WORLD_BUDGET.pollMs) }
    child.stdin.destroy()
    throw error
  }
}

/**
 * Steps over one home, run once per test file (on the first `facts()` call) and shared by its cases.
 * Each step is `async (boot, facts) => void`: `boot(more?)` starts a DSH process with `options` merged
 * with `more` (packages appended, env and overlay merged), stopped when the step ends. A failing step
 * is kept as `facts.error` and the later steps do not run, so each case reports that error rather than
 * a misleading assertion. The home is removed after the file.
 */
export function scenario(label, steps, options = {}) {
  let run
  let home
  after(() => removeHome(home, label))
  const merged = (more = {}) => ({
    packages: [...(options.packages ?? []), ...(more.packages ?? [])],
    env: { ...options.env, ...more.env },
    overlay: [...(options.overlay ?? []), ...(more.overlay ?? [])],
    extension: more.extension ?? options.extension,
  })
  return function facts() {
    run ??= (async () => {
      home = newHome(label)
      const collected = { home }
      for (const step of steps) {
        const live = []
        const boot = async (more) => { const h = await bootWorld(home, merged(more)); live.push(h); return h }
        try { await step(boot, collected) } catch (error) { collected.error ??= error; break } finally { for (const h of live) await h.stop().catch(() => {}) }
      }
      return collected
    })()
    return run
  }
}
