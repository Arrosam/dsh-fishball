/**
 * The hosted-child integration package's own tools: the vocabulary its cases check (every product
 * value cites the requirement it comes from), the files a hosted child publishes under the
 * throwaway home, the instance's routes, and the fixtures (packed with npm pack --offline).
 *
 * Nothing here imports a product module: the cases observe the instance only through its routes,
 * the files it writes under the home, and the installed SDK's own public readers.
 */
import { spawnSync } from 'node:child_process'
import { after, describe } from 'node:test'
import { caseTest } from '@dsh-instance/test-helpers/cases'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { bootHost, newHome, removeHome, untilValue } from '@dsh-instance/test-helpers/host-dsh'
import { HOSTED, hostedEnv, hostedLinks, instanceStatus } from '@dsh-instance/test-helpers/hosted'
import { missingSibling } from '@dsh-instance/test-helpers/siblings'

export const show = (v) => JSON.stringify(v)

/** The instance's routes (packages/dsh-instance README "Settings page", "Plugins for Fishball", "Model sync"). */
export const ROUTE = Object.freeze({
  status: HOSTED.status,
  restart: '/api/dsh-instance/restart',
  reconnect: '/api/dsh-instance/reconnect',
  open: '/api/dsh-instance/open',
  list: '/api/dsh-instance/plugins',
  install: '/api/dsh-instance/plugins/install',
  cancel: '/api/dsh-instance/plugins/cancel',
  uninstall: '/api/dsh-instance/plugins/uninstall',
  use: '/api/dsh-instance/plugins/use',
  modelsCheck: '/api/dsh-instance/models/check',
  modelsAdd: '/api/dsh-instance/models/add',
  /** DSH's own plugin-manager route the child manager must not take over (README "Limits"). */
  mainDetailFile: '/api/plugin-manager/detail-file',
  /** The connector's settings page state (dsh-connector, its settings page): its entries and pair states. */
  connectorState: '/api/dsh-connector/settings/state',
})

/** README "Ready": the child's states; the status route answers {state, code, detail, notice} (+ busy). */
export const STATE = Object.freeze({ disabled: 'disabled', waiting: 'waiting', starting: 'starting', ready: 'ready', stopping: 'stopping', stopped: 'stopped', failed: 'failed' })
export const STATUS_KEYS = Object.freeze(['state', 'code', 'detail', 'notice'])

/** README "The child" / "Placement" / "The hosted token". */
export const CHILD = Object.freeze({
  runtime: Object.freeze(['fishball', 'runtime']),
  profile: HOSTED.childProfile,
  dshHome: Object.freeze(['fishball', 'runtime', 'dsh-home']),
  launches: HOSTED.launches,
  launchFile: 'launch.patch.yml',
  pidFile: 'pid.json',
  manifest: 'package.json',
  lockfile: 'pnpm-lock.yaml',
  patch: 'cordis.patch.yml',
  credentials: '.credentials.yaml',
  nodeModules: 'node_modules',
  copyDirs: Object.freeze(['vendor', 'node_modules']),
  /** fishball-placement.json in the child profile, mode 0600, {format: 1, placed: [names]}. */
  record: Object.freeze({ file: 'fishball-placement.json', format: 1, key: 'placed', mode: 0o600 }),
  /** <DSH_HOME>/fishball/hosted.json: the entry keys the instance created, outside the runtime tree. */
  hosted: Object.freeze(['fishball', 'hosted.json']),
  /** README "Model sync": the once-only marker in the runtime folder. */
  initialSync: 'initial-model-sync.json',
  /** constants.js INITIAL_SYNC.format */
  initialSyncFormat: 1,
  /** README "The hosted token": core's saved copy of the imported value in the child's own credential store. */
  savedRecord: 'fishball-core/hosted-agent',
})

/** The placed bundles and their file-only dependencies (README "Placement"). */
const CORE_BUNDLE = 'fishball-core'
const AMENITIES_BUNDLE = 'fishball-amenities'
export const SET = Object.freeze({
  core: CORE_BUNDLE,
  amenities: AMENITIES_BUNDLE,
  placed: Object.freeze([AMENITIES_BUNDLE, CORE_BUNDLE]),
  amenityPackages: Object.freeze(['fishball-board', 'fishball-heartbeat', 'fishball-taskboard']),
  library: 'fishball-shared',
  retired: 'fishball-ui',
  /** The child's base bundles (constants.js RUNTIME.profile.bundles). */
  base: Object.freeze(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']),
  instance: 'dsh-instance',
})

/** README "The child": the launch overlay's rows. */
export const OVERLAY = Object.freeze({
  hmr: 'hmr',
  runtimeRows: Object.freeze(['fishball-native-child', 'dsh-instance-child']),
  childRow: 'dsh-instance-child',
  targetField: 'targetUrl',
  /** README "The hosted token": the connector's endpoint on this DSH. */
  mcpPath: '/api/agent/mcp',
})

/** README "Placement": an enabled bundle the child cannot load fails the start, naming it. */
export const INCOMPATIBLE = Object.freeze({ code: 'PROFILE_INCOMPATIBLE', impossibleEngine: '>=99.0.0', message: /Enabled bundles cannot load: (\S+) \(/ })

/** Fishball tab refusals and answers (README "Plugins for Fishball", "Settings page"). */
export const CODE = Object.freeze({ protected: 'protected', busy: 'busy', notReady: 'not-ready', removeFailed: 'remove-failed', instanceDisabled: 'instance-disabled' })
export const APPLIED = Object.freeze({ nextStart: 'next-start', restarting: 'restarting' })
export const HTTP = Object.freeze({ ok: 200, seeOther: 303, badRequest: 400, forbidden: 403 })
/** The protected bundles the list route names (constants.js CHILD_OWN_BUNDLES, retired fishball-ui included). */
export const PROTECTED = Object.freeze([...SET.base, ...SET.placed, SET.retired, SET.instance])
/** DSH's cancelInstall outcomes (dsh-plugin-manager CancelInstallOutcome, both SDKs). */
export const CANCEL_OUTCOMES = Object.freeze(['cancelled', 'too-late', 'not-running'])

/** The package's offline fixtures (fixtures/). */
const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures')
export const FIXTURE = Object.freeze({
  tarball: Object.freeze({ name: 'fbtest-only-b', version: '0.0.1', dir: path.join(FIXTURES, 'fbtest-only-b') }),
  second: Object.freeze({ name: 'fbtest-only-c', version: '0.0.1', dir: path.join(FIXTURES, 'fbtest-only-c') }),
  /** Linked into the MAIN profile only, not selected (installed there, off): a name no installation ships. */
  mainOnly: Object.freeze({ name: 'fbtest-only', dir: path.join(FIXTURES, 'fbtest-only') }),
  /** An official optional bundle both SDKs ship (DSH's listBundles availability 'installation'). */
  shippedOfficial: '@deepseek-ai/dsh-experimental-session-search',
  unknownName: 'fbtest-not-shipped-anywhere',
  hangingSpec: 'fbtest-hang-registry-pkg@1.0.0',
  foreignOrigin: 'https://evil.example',
  oversizedBytes: 1024 * 1024,
  smallPadBytes: 512,
  /** A main-profile API-key provider for model sync (README "Model sync": https, API key, no custom headers). */
  providerKeyEnv: 'FBTEST_PROVIDER_KEY',
  providerKey: 'sk-fbtest-provider-0123456789abcdef',
  provider: Object.freeze({ id: 'fbtest-prov', ns: 'llm-pi-ai', profile: Object.freeze({ displayName: 'FB Test', api: 'openai-completions', baseURL: 'https://fbtest.invalid/v1', apiKeyEnv: 'FBTEST_PROVIDER_KEY', models: Object.freeze([Object.freeze({ id: 'fbtest-model' })]) }) }),
})

/** Why a case cannot run here, or false: the two sibling checkouts the hosted setup links. */
export const missing = () => missingSibling('connector') || missingSibling('fishball')

// ------------------------------------------------------------------------- files under the home
export const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null)
export const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null)

/** The child-side files of one main home. */
export function childFiles(home) {
  const profile = path.join(home, ...CHILD.profile)
  const manifestFile = path.join(profile, CHILD.manifest)
  const f = {
    profile, manifestFile,
    runtime: path.join(home, ...CHILD.runtime),
    dshHome: path.join(home, ...CHILD.dshHome),
    manifest: () => readJson(manifestFile),
    bundles: () => f.manifest()?.dsh?.profile?.bundles ?? [],
    deps: () => f.manifest()?.dependencies ?? {},
    record: () => readJson(path.join(profile, CHILD.record.file)),
    recordFile: path.join(profile, CHILD.record.file),
    hosted: () => readJson(path.join(home, ...CHILD.hosted)),
    copy: (name, dir) => path.join(profile, dir, name),
    launchDirs: () => { const d = path.join(home, ...CHILD.launches); return fs.existsSync(d) ? fs.readdirSync(d).sort() : [] },
    overlays: () => f.launchDirs().map((id) => path.join(home, ...CHILD.launches, id, CHILD.launchFile)).filter((x) => fs.existsSync(x)).map((x) => JSON.parse(fs.readFileSync(x, 'utf8'))),
    pids: () => f.launchDirs().map((id) => readJson(path.join(home, ...CHILD.launches, id, CHILD.pidFile))?.pid).filter((p) => Number.isInteger(p)),
    /** Write the child's bundle list while it is down, as DSH's plugin manager would (an owner switch). */
    setBundles(bundles) { const m = f.manifest(); m.dsh.profile.bundles = [...bundles]; fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2)) },
    /**
     * Remove a placed package while the child is down: its dependency and both copies, and (unless
     * `keepSelected`) its bundle entry, as a native remove does.
     */
    removePlaced(name, { keepSelected = false } = {}) {
      const m = f.manifest()
      delete m.dependencies?.[name]
      if (!keepSelected) m.dsh.profile.bundles = m.dsh.profile.bundles.filter((b) => b !== name)
      fs.writeFileSync(manifestFile, JSON.stringify(m, null, 2))
      for (const dir of CHILD.copyDirs) {
        const target = f.copy(name, dir)
        if (path.dirname(path.dirname(target)) !== profile || path.basename(target) !== name) throw new Error('unexpected placed copy ' + target)
        fs.rmSync(target, { recursive: true, force: true })
      }
    },
  }
  return f
}

export const insertedIds = (ops) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert).map((row) => row.id)
export const insertedRow = (ops, id) => ops.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert).find((row) => row.id === id)
export const disabledIds = (ops) => ops.filter((op) => op?.disabled === true).map((op) => op.id)

/** Whether a process runs (signal 0; ESRCH when it is gone). */
export function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

/** Whether /bin/ps can be run here (a sandbox may forbid it). */
export const psAvailable = () => spawnSync('/bin/ps', ['-p', String(process.pid), '-o', 'pid='], { encoding: 'utf8' }).status === 0

// ------------------------------------------------------------------------- per-SDK grouping
/**
 * Register one SDK's cases of a file inside a describe block whose `after` closes that SDK's
 * world, so only one hosted setup per file runs at a time. Cases run in order and later ones build on
 * earlier ones' state. `skip` (a sibling checkout is absent) is set on every case.
 */
export function perSdk(sdk, topic, world, register) {
  const skip = missing()
  describe(`[SDK ${sdk}] ${topic}`, () => {
    after(() => world.close())
    const row = (id, part, title, fn, options = {}) => caseTest(sdk, id, part, title, fn, skip ? { ...options, skip } : options)
    register(row)
  })
}

// ------------------------------------------------------------------------- a hosted setup with extras
/**
 * One hosted setup per test file and SDK (the standard links of test-helpers/hosted, plus `links`),
 * with `env` for the host process. `start` boots once and answers the settled status; `restart`
 * stops the host (which stops the child), runs `whileDown(home)` and boots again.
 */
export function hostedWorld(label, { links = [], env = {}, settled = HOSTED.settled } = {}) {
  let home
  let host
  let sdk
  const settle = (states = settled) => untilValue(async () => { const s = await instanceStatus(host).catch(() => undefined); return states.includes(s?.state) && s })
  const boot = async (extra = {}) => {
    host = await bootHost(home, { sdk, links: [...hostedLinks(), ...links], env: { ...hostedEnv(), ...env, ...extra } })
    return settle()
  }
  const w = {
    get home() { return home },
    get host() { return host },
    get child() { return childFiles(home) },
    settle,
    status: () => instanceStatus(host),
    async start(version) {
      if (host) return instanceStatus(host)
      sdk = version
      home = newHome(label)
      return boot()
    },
    /** `env`: extra host environment for this boot only (FISHBALL_REPO pointing at a scratch copy, say). */
    async restart(whileDown = () => {}, { env: extra = {} } = {}) {
      await host.stop()
      await whileDown(home)
      return boot(extra)
    },
    /** Wait until the child is ready on a launch other than `previous` (README: a restart is a new launch). */
    async readyAgain(previous) {
      return untilValue(async () => {
        const s = await instanceStatus(host).catch(() => undefined)
        const now = childFiles(home).launchDirs()
        return s?.state === STATE.ready && s.busy !== true && now.length > 0 && show(now) !== show(previous) && { status: s, launches: now }
      })
    },
    async close() {
      await host?.stop().catch(() => {})
      host = undefined
      if (home) removeHome(home, label)
      home = undefined
    },
  }
  return w
}

/**
 * POST JSON as the host's same-origin page, through node:http with no time bound: Node's fetch gives
 * up on a response whose headers take over 300 s (undici's headersTimeout), and an install held on a
 * registry that never answers takes longer than that. Answers {status, json, text}.
 */
export function longPost(host, pathname, body) {
  const url = new URL(pathname, host.origin)
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { cookie: host.cookie, origin: host.origin, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } }, (res) => {
      let text = ''
      res.setEncoding('utf8').on('data', (d) => { text += d }).on('end', () => {
        let json
        try { json = JSON.parse(text) } catch { json = undefined }
        resolve({ status: res.statusCode, json, text })
      })
    })
    req.on('error', reject)
    req.end(payload)
  })
}

/** npm pack (offline) a fixture folder into `dir`; answers the tarball path. */
export function packInto(source, dir) {
  const pack = spawnSync('npm', ['pack', source, '--offline', '--silent', '--pack-destination', dir], { encoding: 'utf8' })
  if (pack.status !== 0) throw new Error('npm pack failed: ' + pack.stderr)
  return path.join(dir, pack.stdout.trim().split('\n').at(-1))
}

/** A registry that accepts connections and never answers (a held install). */
export async function hangingRegistry() {
  const sockets = new Set()
  const server = net.createServer((s) => { sockets.add(s); s.on('close', () => sockets.delete(s)) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    url: 'http://127.0.0.1:' + server.address().port + '/',
    connections: () => sockets.size,
    close: () => { for (const s of sockets) s.destroy(); server.close() },
  }
}

// ------------------------------------------------------------------------- the child's own page
const BOOT_GRAPH = /globalThis\["__DSH_BOOT__"\]\s*=\s*(\{.*?\});?\s*<\/script>/s
const SDK_SCOPE = '@deepseek-ai/'

/** Open Fishball (README "Settings page": POST open {lang} → one admission URL) and follow the admission as a new tab would. */
export async function admitChild(host) {
  const open = await host.post(ROUTE.open, { lang: 'en' })
  if (open.json?.ok !== true || typeof open.json.url !== 'string') throw new Error('the host did not admit to the child: ' + show(open))
  const admission = await fetch(open.json.url, { redirect: 'manual' })
  await admission.arrayBuffer()
  const cookie = (admission.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ')
  return { origin: new URL(open.json.url).origin, status: admission.status, cookie }
}

/** The non-SDK client entry ids of a DSH page's boot graph (DSH's __DSH_BOOT__). */
export async function graphIds(origin, cookie) {
  const html = await (await fetch(origin + '/', { headers: { cookie } })).text()
  const match = BOOT_GRAPH.exec(html)
  if (!match) throw new Error('the page carries no __DSH_BOOT__ graph')
  return JSON.parse(match[1]).entries.map((entry) => entry.id).filter((id) => !id.startsWith(SDK_SCOPE))
}

/** The connector's entries as its settings page reads them (key, label, paired, id, name, connected). */
export async function connectorEntries(host) {
  return (await host.get(ROUTE.connectorState)).json?.entries ?? []
}

/**
 * A scratch checkout for FISHBALL_REPO with only core made incompatible (an engines.dsh range
 * no SDK meets). Amenities and its workspace packages are linked as siblings, and fishball-shared
 * is linked in node_modules. Placement reads those links without modifying the real checkout.
 * Answers `{repo, remove}`.
 */
export function incompatibleCoreRepo(siblingFishball) {
  const base = fs.realpathSync(os.tmpdir())
  const repo = fs.mkdtempSync(path.join(base, 'dshi-test-incompatible-'))
  const packages = path.join(repo, 'packages')
  const source = path.join(siblingFishball, 'packages')
  const core = path.join(packages, 'core')
  fs.cpSync(path.join(source, 'core'), core, { recursive: true, filter: (src) => path.basename(src) !== CHILD.nodeModules })
  const amenities = readJson(path.join(source, SET.amenities, CHILD.manifest))
  const bundledWorkspace = (amenities.bundleDependencies ?? []).filter((name) =>
    name !== SET.library && amenities.dependencies?.[name] === amenities.version)
  for (const name of [SET.amenities, ...bundledWorkspace]) fs.symlinkSync(path.join(source, name), path.join(packages, name), 'dir')
  const manifestFile = path.join(core, CHILD.manifest)
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  manifest.engines = { ...manifest.engines, dsh: INCOMPATIBLE.impossibleEngine }
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2))
  fs.mkdirSync(path.join(repo, 'node_modules'), { recursive: true })
  fs.symlinkSync(fs.realpathSync(path.join(siblingFishball, 'node_modules', SET.library)), path.join(repo, 'node_modules', SET.library))
  fs.writeFileSync(path.join(repo, CHILD.manifest), JSON.stringify({ name: 'dshi-test-incompatible', private: true }))
  return {
    repo,
    remove() {
      if (path.dirname(repo) !== base || !path.basename(repo).startsWith('dshi-test-incompatible-')) throw new Error('refusing to remove ' + repo)
      fs.rmSync(repo, { recursive: true, force: true })
    },
  }
}

/** The bundle a PROFILE_INCOMPATIBLE status names: K3 ChildStatus `plugin`, else the README's one-line detail. */
export function blockedBy(status) {
  if (typeof status?.plugin === 'string') return status.plugin
  const match = typeof status?.detail === 'string' ? INCOMPATIBLE.message.exec(status.detail) : null
  return match?.[1]
}

/** Run the instance's uninstall command (README "Uninstall") against `home`, from the linked package. */
export function runUninstall(home) {
  const script = path.join(home, 'profiles', 'dshi', 'node_modules', SET.instance, 'uninstall.js')
  return spawnSync(process.execPath, [script, '--home', home], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' } })
}