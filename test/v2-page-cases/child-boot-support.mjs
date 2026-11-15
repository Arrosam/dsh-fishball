/**
 * CHILD-BOOT shared harness (test-owned): the staged instance files and one real DSH web host per
 * call, used by child-boot.test.mjs and child-boot-reopen.test.mjs. Black box: nothing here reads
 * or fakes the product's client code or the SDK client context.
 * - stageInstance copies `<plugin>/packages/dsh-instance` (FBTEST_PLUGIN_DIR picks the checkout; default
 *   this repo) into the throwaway home, with dsh-connector linked beside it (since R-EMBED the
 *   instance ships its status line in src/child-settings/ itself, so no client file is copied).
 * - startHost spawns child-boot-host.mjs, which boots the selected SDK's own `web` profile with an
 *   overlay that appends the given rows after the native rows, as the instance's launch overlay does.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before } from 'node:test'
import { fileURLToPath } from 'node:url'
import { NODE, REPO, TEST_HOMES } from '../support/constants.mjs'
import { newHome } from '../support/host.mjs'
import { until } from '../support/util.mjs'
import { launchChromium, sdkRuntime } from './lite-browser.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const FIXTURES = path.join(REPO, 'test', 'support', 'fixtures')

export const CHILD_BOOT = Object.freeze({
  hostScript: path.join(HERE, 'child-boot-host.mjs'),
  /** Checkout whose packages/dsh-instance and packages/dsh-connector are booted (baseline runs). */
  pluginRoot: process.env.FBTEST_PLUGIN_DIR ? path.resolve(process.env.FBTEST_PLUGIN_DIR) : REPO,
  instancePackage: Object.freeze(['packages', 'dsh-instance']),
  connectorPackage: Object.freeze(['packages', 'dsh-connector']),
  connectorName: 'dsh-connector',
  /** Not part of a shipped snapshot; never copied into the stage. */
  stageSkip: Object.freeze(['node_modules', 'test']),
  stageDir: 'dsh-instance-stage',
  stageModules: 'node_modules',
  /** The SDK's package scope, linked into the stage only for rows that import SDK packages. */
  sdkScope: '@deepseek-ai',
  rowModule: (row) => ['child-web', row, 'index.js'],
  urlLine: /dsh web: (http\S+)/,
  /** Redacts the admission token from any host output a failure message may quote. */
  tokenParam: /([?&]token=)[^\s&]+/g,
  redacted: '$1<redacted>',
  outputTailChars: 3000,
  runtimeProbe: path.join('@deepseek-ai', 'dsh', 'lib', 'profile-boot.js'),
  ipc: Object.freeze({ call: 'call', reply: 'reply' }),
})

/** Host-side waiting only; none of these is a product oracle. */
export const HOST_BUDGET = Object.freeze({ hostStartMs: 90000, hostStopMs: 10000, pollMs: 100, callMs: 60000 })

export const ROW = Object.freeze({ page: 'fishball-page', settings: 'fishball-settings', recommend: 'fishball-recommend-plugins' })
export const stageRow = (stage, id) => ({ id, name: path.join(stage, ...CHILD_BOOT.rowModule(id)) })
/** The launch overlay marks fishball-page required (product fact). */
export const pageRow = (stage) => ({ ...stageRow(stage, ROW.page), required: true })

export const redact = (text) => text.replace(CHILD_BOOT.tokenParam, CHILD_BOOT.redacted)

/** Why `sdk` cannot be booted here, or null. */
export function sdkUnavailable(sdk) {
  if (!process.env.FBTEST_DSH_RUNTIME) return 'FBTEST_DSH_RUNTIME is not set (no SDK to boot)'
  const runtime = sdkRuntime(sdk)
  if (!runtime || !fs.existsSync(path.join(runtime, CHILD_BOOT.runtimeProbe))) return `SDK ${sdk} runtime not found beside FBTEST_DSH_RUNTIME`
  return null
}

/**
 * One suite's shared environment, registered as the calling file's node:test hooks: a headless
 * Chromium launched before the file's cases, and its cleanups awaited after them in reverse order.
 * Call once, at the top level of a test file. Returns:
 * - `browser()`: the launched browser, or null;
 * - `skipReason(sdk)`: why a case on `sdk` cannot run here, or null;
 * - `cleanups`: disposers the file pushes;
 * - `ownHome(label)`: a new throwaway home, removed afterwards only when it sits under the test-homes root.
 */
export function childBootEnvironment() {
  let browser = null
  let browserError = null
  const cleanups = []
  before(async () => {
    try { browser = await launchChromium() } catch (error) { browserError = error }
  })
  after(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup().catch(() => {})
    await browser?.stop()
  })
  function skipReason(sdk) {
    const unavailable = sdkUnavailable(sdk)
    if (unavailable) return unavailable
    if (browserError) return 'headless Chromium could not start: ' + browserError.message
    if (!browser) return 'no local headless Chromium (FBTEST_CHROME or the Playwright headless shell)'
    return null
  }
  function ownHome(label) {
    const home = newHome(label)
    cleanups.push(async () => { if (path.dirname(home) === TEST_HOMES) fs.rmSync(home, { recursive: true, force: true }) })
    return home
  }
  return { browser: () => browser, skipReason, cleanups, ownHome }
}

/**
 * Stage the shipped instance files with the install-time chunk, outside every checkout. With
 * `runtime`, the SDK's package scope is linked into the stage's node_modules: the stage is a plain
 * directory in the home, not an installed plugin, so rows that import SDK packages (the manager
 * rows) would otherwise not resolve them. The link points at the SDK's own files, so module
 * identity is the booted SDK's.
 */
export function stageInstance(home, { runtime } = {}) {
  const source = path.join(CHILD_BOOT.pluginRoot, ...CHILD_BOOT.instancePackage)
  const stage = path.join(home, CHILD_BOOT.stageDir)
  fs.cpSync(source, stage, { recursive: true, filter: (from) => !CHILD_BOOT.stageSkip.includes(path.relative(source, from).split(path.sep)[0]) })
  // R-EMBED (4): the instance ships its status line in src/child-settings/ itself; no client copy.
  // The instance imports dsh-connector/contract; in an install it is a sibling package.
  const modules = path.join(stage, CHILD_BOOT.stageModules)
  fs.mkdirSync(modules, { recursive: true })
  fs.symlinkSync(path.join(CHILD_BOOT.pluginRoot, ...CHILD_BOOT.connectorPackage), path.join(modules, CHILD_BOOT.connectorName))
  if (runtime) fs.symlinkSync(path.join(runtime, CHILD_BOOT.sdkScope), path.join(modules, CHILD_BOOT.sdkScope))
  return stage
}

/**
 * A new DevTools tab, optionally inside an isolated browser context (`browserContextId`, from
 * Target.createBrowserContext: its own cookies and storage, as a fresh browser profile has), with
 * Runtime enabled and `url` navigated. `onEvent` sees every protocol event of this tab.
 * Returns {sessionId, evaluate(expression), reload(), close()}.
 */
export async function openDevtoolsTab(devtools, url, { browserContextId, onEvent } = {}) {
  const { targetId } = await devtools.send('Target.createTarget', { url: 'about:blank', ...(browserContextId ? { browserContextId } : {}) })
  const { sessionId } = await devtools.send('Target.attachToTarget', { targetId, flatten: true })
  const off = onEvent ? devtools.onEvent((event) => { if (event.sessionId === sessionId) onEvent(event) }) : () => {}
  await devtools.send('Runtime.enable', {}, sessionId)
  await devtools.send('Page.navigate', { url }, sessionId)
  return {
    sessionId,
    /** The expression's JSON value (promises awaited); a page exception rejects. */
    async evaluate(expression) {
      const result = await devtools.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
      if (result.exceptionDetails) throw new Error('page evaluation failed: ' + (result.exceptionDetails.exception?.description ?? result.exceptionDetails.text))
      return result.result?.value
    },
    reload: () => devtools.send('Page.reload', {}, sessionId),
    async close() {
      off()
      await devtools.send('Target.closeTarget', { targetId }).catch(() => {})
    },
  }
}

/**
 * One real DSH web host. Options: `config` overlay operations placed before the row insert
 * ({id, config}), extra `env`, and `ipc` for the host's operations (call(op,
 * args)); see child-boot-host.mjs.
 */
export async function startHost(runtime, home, rows, { config = [], env = {}, ipc = false } = {}) {
  const child = spawn(NODE, [CHILD_BOOT.hostScript], {
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '', DSH_HOME: home,
      ...(process.env.TMPDIR ? { TMPDIR: process.env.TMPDIR } : {}),
      DSH_TELEMETRY_DISABLED: '1', NO_COLOR: '1',
      FBTEST_CHILD_RUNTIME: runtime, FBTEST_CHILD_ROWS: JSON.stringify(rows), FBTEST_CHILD_CONFIG: JSON.stringify(config),
      ...env,
    },
    // stdin is a pipe that is never written: DSH's launcher shuts down on stdin EOF.
    stdio: ['pipe', 'pipe', 'pipe', ...(ipc ? ['ipc'] : [])],
  })
  let output = ''
  let exited = null
  for (const stream of [child.stdout, child.stderr]) stream.setEncoding('utf8').on('data', (d) => { output += d })
  child.on('exit', (code, signal) => { exited = { code, signal } })
  const tail = () => redact(output.slice(-CHILD_BOOT.outputTailChars))
  const pending = new Map()
  let nextId = 0
  if (ipc) {
    child.on('message', (message) => {
      if (message?.type !== CHILD_BOOT.ipc.reply) return
      const waiter = pending.get(message.id)
      pending.delete(message.id)
      if (message.ok) waiter?.resolve(message.value)
      else waiter?.reject(new Error('child host op failed: ' + message.error))
    })
  }
  const stop = async () => {
    if (exited) return
    const gone = new Promise((resolve) => child.once('exit', resolve))
    child.stdin.end()
    const forced = setTimeout(() => { if (!exited) child.kill('SIGKILL') }, HOST_BUDGET.hostStopMs)
    await gone
    clearTimeout(forced)
  }
  const line = await until(() => exited || CHILD_BOOT.urlLine.exec(output), HOST_BUDGET.hostStartMs, HOST_BUDGET.pollMs)
  if (!line || exited) {
    await stop()
    throw new Error('child DSH host did not start (exit ' + JSON.stringify(exited) + '):\n' + tail())
  }
  function call(op, args = {}) {
    if (exited) return Promise.reject(new Error('child host exited ' + JSON.stringify(exited) + '\n' + tail()))
    const id = ++nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('child host op ' + op + ' timed out\n' + tail())) }, HOST_BUDGET.callMs)
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v) }, reject: (e) => { clearTimeout(timer); reject(e) } })
      child.send({ type: CHILD_BOOT.ipc.call, id, op, args })
    })
  }
  return { url: line[1], stop, tail, ...(ipc ? { call } : {}) }
}
