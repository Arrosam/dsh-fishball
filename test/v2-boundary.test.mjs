/**
 * V2 release boundary (docs/planning/v2-final-scope.md §1, §3.3, §4 BOUNDARY), black-box.
 *
 * V2 ships exactly fishball-connector and fishball-instance. Watchdog, board (board_search),
 * fold-notify (notify_user), bundled-plugin placement and MCP stay in the repository as V3 source
 * but must not be packed, loaded at startup, or selected by the V2 suite run.
 *
 * Techniques: EP = Equivalence Partitioning, BVA = Boundary Value Analysis, DT = Decision Table,
 * ST = State Transition. Every case carries its ID (V2B-...).
 *
 * npm runs fully isolated (no user/global config, fresh HOME and cache, offline, no scripts), so the
 * listing is the real `npm pack --dry-run` artifact without reading any credential.
 */
import assert from 'node:assert/strict'
import { execFile, execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { BODY_SOUL, loadConnector, loadCore, loadInstance } from './support/body-soul-env.mjs'
import { NODE, REPO } from './support/constants.mjs'
import { RUNTIME_PARENT_URL } from './support/provider-sync-sdk.mjs'

const run = promisify(execFile)

const V2B = Object.freeze({
  packages: Object.freeze({
    connector: Object.freeze({ name: 'fishball-connector', dir: BODY_SOUL.connector }),
    instance: Object.freeze({ name: 'fishball-instance', dir: BODY_SOUL.instance }),
  }),
  // V3 R-SHARED / R-ARCH-08 (approved design) adds the library workspace packages/shared;
  // V3 R-CORE (1) / design §9.1 adds fishball-core's workspace packages/core;
  // V3 R-EMBED / design §9.1 (DESIGN.md §17) adds fishball-embed-ui's workspace packages/embed-ui.
  workspaces: Object.freeze(['packages/connector', 'packages/core', 'packages/embed-ui', 'packages/instance', 'packages/shared']),
  /** Repository directories of the V3 packages (no V2 module may load from them). */
  v3Dirs: Object.freeze(['board', 'fold-notify', 'watchdog'].map((d) => path.join(REPO, 'packages', d))),
  /** A packed path segment naming a V3 area or the bundled asset directory. */
  v3Segment: /(^|\/)(board|fold-notify|watchdog|bundled)(\/|$)/,
  /** Text a packed V2 file must never contain. */
  v3Text: Object.freeze(['fishball-board', 'fishball-fold-notify', 'fishball-watchdog', 'board_search', 'notify_user', 'BUNDLED_PLUGIN_UNAVAILABLE']),
  v3PackageNames: Object.freeze(['fishball-board', 'fishball-fold-notify', 'fishball-watchdog']),
  /**
   * V3 rule (design e1e5577 §9.1, R-HOST-04; Fishball decisions 2026-11-15, I-PLACE): the instance
   * places the four set members into the child profile, so its placement constants name the V3
   * packages and its `files` carries `bundled/` (the set's sources in a packed instance, REL-PACK
   * output). Only these exceptions are allowed: the V3 package names in that one constants file
   * (never a V3 tool or code, never in another file) and the one `bundled/` files entry.
   */
  v3Allowed: Object.freeze({
    'fishball-instance': Object.freeze({
      names: Object.freeze({ 'src/native-runtime/constants.js': Object.freeze(['fishball-board', 'fishball-fold-notify', 'fishball-watchdog']) }),
      files: Object.freeze(['bundled/']),
    }),
  }),
  dependencyFields: Object.freeze(['dependencies', 'peerDependencies', 'optionalDependencies', 'bundleDependencies', 'bundledDependencies']),
  /** Words an overlay row id, name or absolute path may not carry. */
  v3Words: /board|fold-notify|watchdog|bundled/i,
  npm: Object.freeze({
    path: '/opt/homebrew/bin:/usr/bin:/bin',
    args: Object.freeze(['pack', '--dry-run', '--json', '--ignore-scripts']),
    timeoutMs: 90000,
    /** Upper bound of the captured `npm pack --json` stdout. */
    maxStdoutBytes: 16 * 1024 * 1024,
    tempPrefix: 'fbtest-v2b-npm-',
  }),
  entries: Object.freeze({
    instance: Object.freeze(['host.js', 'native-child.js', 'native-web.js', 'src/native-runtime/overlay.js', 'src/native-runtime/constants.js']),
    // V3 R-CORE (2) / design §9.1: the child page row and the slim app moved, unchanged, into fishball-core.
    core: Object.freeze(['ui/fishball-page/index.js', 'src/slim/child/app.js']),
    connector: Object.freeze(['index.js']),
  }),
  /** A path that does not exist: importing it only installs the helper hooks (see below). */
  hookProbe: '.v2b-hook-probe-missing.js',
  profileBundles: Object.freeze(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']),
  overlayRows: Object.freeze(['hmr', 'sandbox-policy', 'approval', 'webserver', 'web-runtime']),
  /** DT representative: one required row removed. */
  missingRow: 'approval',
  suitesModule: './v2-suites.mjs',
  dispositions: Object.freeze({ files: Object.freeze(['v3', 'own-runner']), cases: Object.freeze(['v3', 'non-gating-migration']) }),
  runner: Object.freeze({ script: 'test:v2', command: /(^|\s|&&\s*)node test\/run-v2\.mjs(\s|$)/, file: 'test/run-v2.mjs' }),
  rootTest: /^test\/[^/]+\.test\.mjs$/,
  ownRunnerPrefix: 'native-production-',
})

// ---------------------------------------------------------------------------------------------
// Module observer (B.1), written once as a preload module under the OS temp dir. This process
// imports it, and the spawned-entry case (native-child.js) loads the same file with `--import`, so
// both observe through identical hooks. The helper hooks are installed lazily by the first
// loadInstance call, so a probe import of a missing file installs them without loading any product
// module; the observer is then registered after (chained in front of) them and records every
// resolved and loaded file URL. The connector's own declared peers outside `@deepseek-ai/` (e.g.
// yaml) are provided by the DSH runtime too; the helpers map only `@deepseek-ai/*` and zod, so the
// rest come from its manifest.
const OBSERVER = Object.freeze({
  tempPrefix: 'fbtest-v2b-observer-',
  file: 'observer.mjs',
  key: 'fbtest.v2b.loadedUrls',
  /** Line prefix of the spawned child's report on stdout (the entry may print its own lines). */
  reportPrefix: 'V2B-LOADED ',
  childTimeoutMs: 30000,
  exitTimeoutMs: 5000,
})
/**
 * Entries whose contract is to be spawned by the main process with a dedicated parent pipe at fd 3
 * (LIFETIME.parentFd; launcher stdio ['ignore','ignore','pipe','pipe']): their top level opens that
 * fd, so they are observed in a child Node process that holds fd 3 open, not imported here.
 */
const SPAWNED_ENTRIES = Object.freeze(['native-child.js'])
const helperUrl = (file) => pathToFileURL(path.join(REPO, 'test', 'support', file)).href
const observerDir = fs.mkdtempSync(path.join(os.tmpdir(), OBSERVER.tempPrefix))
const observerFile = path.join(observerDir, OBSERVER.file)
fs.writeFileSync(observerFile, `
import fs from 'node:fs'
import path from 'node:path'
import { registerHooks } from 'node:module'
import { BODY_SOUL, loadInstance } from ${JSON.stringify(helperUrl('body-soul-env.mjs'))}
import { resolveFromRuntime } from ${JSON.stringify(helperUrl('provider-sync-sdk.mjs'))}
const urls = new Set()
globalThis[Symbol.for(${JSON.stringify(OBSERVER.key)})] = urls
await loadInstance(${JSON.stringify(V2B.hookProbe)}).then(
  () => { throw new Error('hook probe unexpectedly resolved') },
  (error) => { if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error },
)
const peers = Object.keys(JSON.parse(fs.readFileSync(path.join(BODY_SOUL.connector, 'package.json'), 'utf8')).peerDependencies ?? {})
  .filter((name) => !name.startsWith('@deepseek-ai/') && !BODY_SOUL.runtimePackages.includes(name))
resolveFromRuntime((specifier) => peers.some((name) => specifier === name || specifier.startsWith(name + '/')))
registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context)
    if (result?.url?.startsWith('file:')) urls.add(result.url)
    return result
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:')) urls.add(url)
    return nextLoad(url, context)
  },
})
`)
after(() => {
  // Guard the one recursive delete: only the directory created above, under the OS temp dir.
  if (path.dirname(observerDir) !== os.tmpdir() || !path.basename(observerDir).startsWith(OBSERVER.tempPrefix)) throw new Error('unexpected temp dir ' + observerDir)
  fs.rmSync(observerDir, { recursive: true, force: true })
})
await import(pathToFileURL(observerFile).href)
const loadedUrls = globalThis[Symbol.for(OBSERVER.key)]

/**
 * Import `entryUrl` in a child Node (same NODE and environment, so the same FBTEST_DSH_RUNTIME) under
 * the observer preload, with fd 3 a pipe this process holds open. Resolves `{ urls, error }` from the
 * child's report line; fd 3 is then closed (the entry's parent-loss signal) and the child killed if it
 * has not exited in time.
 */
function importInChild(entryUrl) {
  const report = `const urls = globalThis[Symbol.for(${JSON.stringify(OBSERVER.key)})]
let error = null
try { await import(${JSON.stringify(entryUrl)}) } catch (e) { error = { code: e?.code ?? null, message: String(e?.message ?? e) } }
process.stdout.write(${JSON.stringify(OBSERVER.reportPrefix)} + JSON.stringify({ urls: [...urls], error }) + '\\n')`
  const child = spawn(NODE, ['--import', pathToFileURL(observerFile).href, '--input-type=module', '-e', report],
    { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const stop = async () => {
    child.stdio[3].destroy()
    const timer = setTimeout(() => child.kill('SIGKILL'), OBSERVER.exitTimeoutMs)
    await exited
    clearTimeout(timer)
  }
  return new Promise((resolve, reject) => {
    let out = ''
    let err = ''
    const timer = setTimeout(() => reject(new Error('child import timed out; stderr: ' + err)), OBSERVER.childTimeoutMs)
    child.stderr.on('data', (chunk) => { err += chunk })
    child.stdout.on('data', (chunk) => {
      out += chunk
      // Only complete lines: the last split piece may still be arriving.
      const line = out.split('\n').slice(0, -1).find((l) => l.startsWith(OBSERVER.reportPrefix))
      if (line !== undefined) {
        clearTimeout(timer)
        resolve(JSON.parse(line.slice(OBSERVER.reportPrefix.length)))
      }
    })
    exited.then((code) => { clearTimeout(timer); reject(new Error('child exited (' + code + ') before reporting; stderr: ' + err)) })
  }).finally(stop)
}

const insideDir = (file, dir) => {
  const rel = path.relative(dir, file)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}
const v3Loaded = (urls = loadedUrls) => [...urls].map((u) => fileURLToPath(u)).filter((f) => V2B.v3Dirs.some((d) => insideDir(f, d) || f === d))

// ---------------------------------------------------------------------------------------------
// Isolated npm pack (A.*): one run per package, shared by the artifact cases.
const packs = new Map()
function packListing(pkg) {
  if (!packs.has(pkg.name)) packs.set(pkg.name, (async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), V2B.npm.tempPrefix))
    try {
      const home = path.join(tmp, 'home')
      const cache = path.join(tmp, 'cache')
      const userrc = path.join(tmp, 'userrc')
      const globalrc = path.join(tmp, 'globalrc') // a different file: npm refuses to load one file twice
      await mkdir(home)
      await mkdir(cache)
      await writeFile(userrc, '')
      await writeFile(globalrc, '')
      const { stdout } = await run('/usr/bin/env', ['-i', 'PATH=' + V2B.npm.path, 'HOME=' + home, 'npm_config_userconfig=' + userrc,
        'npm_config_globalconfig=' + globalrc, 'npm_config_cache=' + cache, 'npm_config_offline=true', 'npm', ...V2B.npm.args],
      { cwd: pkg.dir, timeout: V2B.npm.timeoutMs, maxBuffer: V2B.npm.maxStdoutBytes })
      const [entry] = JSON.parse(stdout)
      return entry.files.map((f) => f.path)
    } finally {
      // Guard the one recursive delete: only the directory created above, under the OS temp dir.
      if (path.dirname(tmp) !== os.tmpdir() || !path.basename(tmp).startsWith(V2B.npm.tempPrefix)) throw new Error('unexpected temp dir ' + tmp)
      await rm(tmp, { recursive: true, force: true })
    }
  })())
  return packs.get(pkg.name)
}
const manifest = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
const rootManifest = () => manifest(REPO)

async function loadYaml() {
  const file = createRequire(RUNTIME_PARENT_URL).resolve('yaml')
  return import(pathToFileURL(file).href)
}

// =============================================================================================
// A. Artifact contents
// =============================================================================================

// EP V2B-ART-01: the workspace list is exactly the two V2 packages (no V3 workspace, none missing).
test('V2B-ART-01 root workspaces are exactly connector and instance', () => {
  assert.deepEqual(rootManifest().workspaces, [...V2B.workspaces])
})

for (const pkg of Object.values(V2B.packages)) {
  // BVA V2B-ART-05: the listing is not empty and holds the manifest's main file (an empty listing cannot pass A.2/A.3).
  test(`V2B-ART-05 ${pkg.name} packed listing is non-empty and includes main`, async () => {
    const files = await packListing(pkg)
    assert.ok(files.length > 0, 'empty packed listing')
    assert.ok(files.includes(path.posix.normalize(manifest(pkg.dir).main)), 'main ' + manifest(pkg.dir).main + ' not packed')
  })

  // EP V2B-ART-02: no packed path is under, or names, board/, fold-notify/, watchdog/ or bundled/.
  test(`V2B-ART-02 ${pkg.name} packs no V3 or bundled path`, async () => {
    const offending = (await packListing(pkg)).filter((f) => V2B.v3Segment.test(f))
    assert.deepEqual(offending, [])
  })

  const allowed = V2B.v3Allowed[pkg.name]
  // EP V2B-ART-03a: no packed file (read from disk by its listed path) mentions a V3 name, tool or
  // code; the one exception is the instance's placement constants naming the V3 packages (§9.1, see V2B.v3Allowed).
  test(`V2B-ART-03a ${pkg.name} packed files never mention V3 names (V3 §9.1: only the instance constants may name the V3 packages)`, async () => {
    const hits = []
    for (const file of await packListing(pkg)) {
      const text = fs.readFileSync(path.join(pkg.dir, file), 'utf8')
      const permitted = allowed?.names[file] ?? []
      for (const word of V2B.v3Text) if (text.includes(word) && !permitted.includes(word)) hits.push(file + ': ' + word)
    }
    assert.deepEqual(hits, [])
  })

  // DT V2B-ART-03b: each dependency field (rows) x each V3 package name (columns) -> never named;
  // `files` has no bundled entry, except the instance's one `bundled/` (§9.1, see V2B.v3Allowed).
  test(`V2B-ART-03b ${pkg.name} manifest names no V3 dependency and no bundled files entry (V3 §9.1: the instance's files may hold bundled/)`, () => {
    const m = manifest(pkg.dir)
    const named = []
    for (const field of V2B.dependencyFields) {
      const value = m[field]
      const names = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.keys(value) : []
      for (const name of names) if (V2B.v3PackageNames.includes(name)) named.push(field + ': ' + name)
    }
    assert.deepEqual(named, [])
    assert.deepEqual((m.files ?? []).filter((entry) => /(^|\/)bundled(\/|$)/.test(entry) && !(allowed?.files ?? []).includes(entry)), [])
  })

  // EP V2B-ART-04: the package's cordis patch inserts exactly its own row (one row, id and name = package name).
  test(`V2B-ART-04 ${pkg.name} cordis patch inserts only its own row`, async () => {
    const { parse } = await loadYaml()
    const operations = parse(fs.readFileSync(path.join(pkg.dir, 'cordis.patch.yml'), 'utf8'))
    assert.ok(Array.isArray(operations), 'patch is not a list of operations')
    const rows = operations.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
    assert.deepEqual(rows.map((r) => [r.id, r.name]), [[pkg.name, pkg.name]])
  })
}

// =============================================================================================
// B. Startup loads no V3 module
// =============================================================================================

const startupEntries = [
  ...V2B.entries.instance.map((rel) => ({ rel, dir: BODY_SOUL.instance, load: loadInstance, label: 'instance' })),
  ...V2B.entries.core.map((rel) => ({ rel, dir: BODY_SOUL.core, load: loadCore, label: 'core' })),
  ...V2B.entries.connector.map((rel) => ({ rel, dir: BODY_SOUL.connector, load: loadConnector, label: 'connector' })),
]
for (const entry of startupEntries) {
  // EP V2B-LOAD-01: each V2 startup entry imports (failure reported, never skipped) and pulls in no V3 module.
  // ESM links the whole static graph before evaluating it, so the V3 check still holds when the
  // entry's top-level code throws; the import failure is then reported as this case's failure.
  // A spawned-contract entry (SPAWNED_ENTRIES) is imported in a child holding fd 3 open; its report
  // replaces this process's record for the case, with the same expectation.
  test(`V2B-LOAD-01 ${entry.label} ${entry.rel} loads no V3 module`, async () => {
    const entryUrl = pathToFileURL(path.join(entry.dir, entry.rel)).href
    let urls = loadedUrls
    let failure
    if (entry.dir === BODY_SOUL.instance && SPAWNED_ENTRIES.includes(entry.rel)) {
      const reported = await importInChild(entryUrl)
      urls = new Set(reported.urls)
      failure = reported.error && Object.assign(new Error(reported.error.message), { code: reported.error.code })
    } else {
      failure = await entry.load(entry.rel).then(() => null, (error) => error)
    }
    assert.ok(urls.has(entryUrl), 'observer did not record the entry itself' + (failure ? ': ' + failure.message : ''))
    assert.deepEqual(v3Loaded(urls), [])
    if (failure) throw new Error('import of ' + entry.rel + ' failed (graph was checked; no V3 module): ' + (failure.code ?? '') + ' ' + failure.message, { cause: failure })
  })
}

// EP V2B-LOAD-02: the child profile has exactly the two DSH base bundles and no bundledPlugins field.
test('V2B-LOAD-02 RUNTIME profile bundles and no bundledPlugins', async () => {
  const { RUNTIME } = await loadInstance('src/native-runtime/constants.js')
  assert.deepEqual(RUNTIME.profile.bundles, [...V2B.profileBundles])
  assert.equal(RUNTIME.bundledPlugins, undefined)
})

const overlayArgs = (rows) => {
  const base = path.join(os.tmpdir(), 'fbtest-v2b-overlay')
  const paths = { home: path.join(base, 'home'), agentsHome: path.join(base, 'agents'), workspace: path.join(base, 'workspace'), mainHome: path.join(base, 'main') }
  const childModule = path.join(BODY_SOUL.instance, 'native-child.js')
  const entries = rows.map((id) => ({ id, name: 'row-' + id, config: {} }))
  return { childModule, args: [paths, { hostId: 'h', instanceId: randomUUID() }, childModule, {}, {}, entries] }
}
const absoluteStrings = (value) => typeof value === 'string' ? (path.isAbsolute(value) ? [value] : [])
  : value && typeof value === 'object' ? Object.values(value).flatMap(absoluteStrings) : []

// DT V2B-LOAD-03a (rule: all required rows present -> overlay built): every inserted row's module sits
// in the child module's directory and no id, name or absolute path names a V3 area or bundled/.
test('V2B-LOAD-03a launchOverlay inserts only instance-owned rows', async () => {
  const { launchOverlay } = await loadInstance('src/native-runtime/overlay.js')
  const { childModule, args } = overlayArgs(V2B.overlayRows)
  const operations = launchOverlay(...args)
  const rows = operations.filter((op) => Array.isArray(op?.insert)).flatMap((op) => op.insert)
  assert.ok(rows.length > 0, 'overlay inserts no row')
  const dir = path.dirname(childModule)
  for (const row of rows) {
    assert.ok(typeof row.name === 'string' && path.isAbsolute(row.name) && insideDir(row.name, dir), 'row ' + row.id + ' name outside instance: ' + row.name)
    for (const text of [row.id, row.name, ...absoluteStrings(row)]) assert.doesNotMatch(String(text ?? ''), V2B.v3Words, 'row ' + row.id)
  }
  assert.deepEqual(v3Loaded(), [])
})

// DT V2B-LOAD-03b (rule: one required row missing -> throws; 'approval' represents the partition).
test('V2B-LOAD-03b launchOverlay throws when a required row is missing', async () => {
  const { launchOverlay } = await loadInstance('src/native-runtime/overlay.js')
  const { args } = overlayArgs(V2B.overlayRows.filter((id) => id !== V2B.missingRow))
  assert.throws(() => launchOverlay(...args))
})

// =============================================================================================
// C. V2 suite list (contract: test/v2-suites.mjs)
// =============================================================================================

const suites = () => import(V2B.suitesModule)
const tracked = () => execFileSync('git', ['ls-files', '*.test.mjs'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
const rootRule = () => fs.readdirSync(path.join(REPO, 'test')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith(V2B.ownRunnerPrefix)).map((f) => 'test/' + f)

const V3_FILES = [
  'packages/watchdog/test/instance-ext/wd-1.test.mjs', 'packages/board/test/instance-ext/b1.test.mjs',
  'packages/board/test/instance-ext/b11-search.test.mjs', 'packages/fold-notify/test/instance-ext/fn-1.test.mjs',
  'packages/connector/test/instance-ext/mcp-feasibility.test.mjs', 'test/instance-ext/x0-b.test.mjs', 'test/instance-ext/x0-a.test.mjs',
  'test/instance-ext/x0-g.test.mjs', 'test/verification/wd1-native.test.mjs', 'test/verification/w0-cordis.test.mjs',
  'docs/verification/v2-board-search-accept/supplemental.test.mjs',
]
const OWN_RUNNER_FILES = ['test/native-production-preflight.test.mjs']
const INCLUDED = [
  'test/body-soul-i1c-status.test.mjs', 'test/v2-d1-runtime.test.mjs', 'test/v2-d1-contract.test.mjs', 'test/v2-d1-d3-schema.test.mjs',
  'test/v2-d2-config-retention.test.mjs', 'test/v2-d3-connector-attention.test.mjs', 'test/v2-d3-signal-producer.test.mjs',
  'test/instance-ext-fakehost.test.mjs', 'test/v2-boundary.test.mjs',
  'test/instance-ext/x0-w.test.mjs', 'test/instance-ext/x0-i.test.mjs', 'test/instance-ext/x0-s.test.mjs',
  'packages/instance/test/instance-ext/x0-c.test.mjs', 'packages/instance/test/instance-ext/x0-c-held-context.test.mjs',
  'packages/connector/test/instance-ext/k1.test.mjs', 'test/verification/w0-host-session.test.mjs',
]

// EP V2B-SUITE-00: the contract module exports a frozen V2_SUITES and a well-formed selection.
test('V2B-SUITE-00 contract shape: frozen V2_SUITES, sorted unique repo-relative files', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  assert.ok(Object.isFrozen(V2_SUITES), 'V2_SUITES is not frozen')
  for (const key of ['nested', 'excludedFiles', 'excludedCases']) assert.ok(Array.isArray(V2_SUITES[key]), key + ' is not a list')
  const { files, skipPatterns } = selectV2Suites()
  assert.ok(Array.isArray(files) && Array.isArray(skipPatterns))
  assert.deepEqual(files, [...new Set(files)].sort(), 'files not sorted and unique')
  for (const f of files) {
    assert.ok(!path.isAbsolute(f) && !f.split('/').includes('..'), 'not repo-relative: ' + f)
    assert.ok(fs.existsSync(path.join(REPO, f)), 'missing file: ' + f)
  }
})

// DT V2B-SUITE-01 (in files x in excludedFiles: exactly one of the two per tracked file).
test('V2B-SUITE-01 every tracked suite file is classified exactly once', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  const files = new Set(selectV2Suites().files)
  const excluded = new Set(V2_SUITES.excludedFiles.map((e) => e.file))
  const unclassified = tracked().filter((f) => !files.has(f) && !excluded.has(f))
  const both = [...files].filter((f) => excluded.has(f))
  assert.deepEqual({ unclassified, both }, { unclassified: [], both: [] })
})

// EP V2B-SUITE-02: whole-file V3 and own-runner exclusions, with dispositions; all V3 package suites out.
test('V2B-SUITE-02 V3 and own-runner files are excluded with their disposition', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  const files = new Set(selectV2Suites().files)
  const disposition = new Map(V2_SUITES.excludedFiles.map((e) => [e.file, e.disposition]))
  const wrong = []
  for (const f of V3_FILES) if (disposition.get(f) !== 'v3') wrong.push(f + ' -> ' + disposition.get(f))
  for (const f of OWN_RUNNER_FILES) if (disposition.get(f) !== 'own-runner') wrong.push(f + ' -> ' + disposition.get(f))
  assert.deepEqual(wrong, [])
  assert.deepEqual([...V3_FILES, ...OWN_RUNNER_FILES].filter((f) => files.has(f)), [])
  const v3Prefixes = ['packages/board/', 'packages/fold-notify/', 'packages/watchdog/']
  const inV3Package = (f) => v3Prefixes.some((p) => f.startsWith(p))
  assert.deepEqual([...files].filter(inV3Package), [], 'a V3 package file is selected')
  assert.deepEqual(tracked().filter(inV3Package).filter((f) => !disposition.has(f)), [], 'a V3 package file is not excluded')
})

// EP V2B-SUITE-03: included files; files = root rule (test/*.test.mjs minus native-production-*) + nested.
test('V2B-SUITE-03 included files and root runner rule', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  const { files } = selectV2Suites()
  assert.deepEqual(INCLUDED.filter((f) => !files.includes(f)), [], 'required files missing')
  assert.deepEqual(V2_SUITES.nested.filter((f) => V2B.rootTest.test(f)), [], 'nested lists a root file')
  assert.deepEqual(files, [...new Set([...rootRule(), ...V2_SUITES.nested])].sort())
  assert.deepEqual(files.filter((f) => path.posix.basename(f).startsWith(V2B.ownRunnerPrefix)), [])
})

/**
 * V2B-SUITE-04 case-selection tables. `skip` is the expected outcome; `disposition` and `files` are the
 * expected excludedCases entry for a skipped name. A name is skipped when ANY skip pattern matches it.
 */
const X0S = 'test/instance-ext/x0-s.test.mjs'
const X0I = 'test/instance-ext/x0-i.test.mjs'
const K1 = 'packages/connector/test/instance-ext/k1.test.mjs'
const X0C = ['packages/instance/test/instance-ext/x0-c.test.mjs', 'packages/instance/test/instance-ext/x0-c-held-context.test.mjs']
const k1 = (id) => 'K1-MCP-' + id + ' | x'
const x = (id) => id + ' x'
const CASE_TABLES = {
  // BVA: XS-DT-10 vs XS-DT-01 / XS-DT-01b differ by one character; the rest are other partitions of X0-S.
  'X0-S': {
    kept: ['XS-DT-10 the gate is off'],
    skipped: ['XS-DT-01', 'XS-DT-01b', 'XS-DT-11', 'XS-DT-11b', 'XS-P-01', 'XS-BVA-03'].map(x),
    disposition: 'v3', files: [X0S],
  },
  // EP + BVA: XI-EP-02 | XI-EP-03 is the boundary inside the EP family.
  'X0-I': {
    kept: ['XI-EP-01', 'XI-EP-02'].map(x),
    skipped: ['XI-EP-03', 'XI-DT-01', 'XI-DT-02', 'XI-DT-03', 'XI-P-01', 'XI-P-02', 'XI-P-03', 'XI-ST-01', 'XI-ST-02', 'XI-ST-03', 'XI-BVA-01'].map(x),
    disposition: 'v3', files: [X0I],
  },
  // EP: actual-MCP cases vs rewritten D1-D3 cases sharing the K1-MCP- prefix.
  K1: {
    kept: ['UC-01-M', 'UC-01-E1', 'EP-01', 'EP-02', 'EP-03', 'EP-04', 'EP-06', 'EP-07', 'BVA-01', 'BVA-02', 'DT-01', 'DT-03', 'DT-04', 'ST-01', 'ST-02', 'ST-03', 'UC-02-M'].map(k1),
    skipped: ['UC-01-A1', 'EP-05', 'EP-08', 'DT-02', 'ST-04'].map(k1),
    disposition: 'v3', files: [K1],
  },
  // EP: V3 TODOs (board/Watchdog/fold image/MCP) vs retained X0-C and held-context cases.
  'X0-C': {
    kept: ['XC-UC-01-A4', 'XC-UC-01-E2', 'XC-UC-02-E3', 'XC-UC-04-M', 'XC-UC-04-E1', 'XC-BVA-BATCH-COUNT-1', 'XC-EP-BATCH-01', 'XC-DT-OFF-message_session', 'XC-EP-STUB-16', 'XC-EP-V-05', 'XC-HELD-ST-RESTART', 'XC-UC-03-M1'].map(x),
    skipped: ['XC-UC-01-A5', 'XC-UC-03-F', 'XC-UC-04-A1', 'XC-UC-05-M'].map(x),
    disposition: 'v3', files: X0C,
  },
  // EP: I2 migration assertions (non-gating, not V3) vs plain I2 cases.
  I2: {
    kept: ['I2-DT-01', 'I2-EP-01'].map(x),
    skipped: ['I2-M-DT-01', 'I2-M-DT-02', 'I2-M-DT-03', 'I2-M-DT-04', 'I2-M-DT-05', 'I2-M-EP-01'].map(x),
    disposition: 'non-gating-migration', files: null,
  },
  // EP: representative root names of other families are never skipped (non-interference).
  'non-interference': {
    kept: ['I1c-V-02', 'XW-P-01', 'D3-CONNECTOR-LATCH', 'X11-HOST-SESSION', 'V2B-SUITE-01'].map(x),
    skipped: [], disposition: null, files: null,
  },
}
for (const [family, table] of Object.entries(CASE_TABLES)) {
  test(`V2B-SUITE-04 ${family} case selection`, async () => {
    const { V2_SUITES, selectV2Suites } = await suites()
    const patterns = selectV2Suites().skipPatterns.map((p) => new RegExp(p))
    const skipped = (name) => patterns.some((re) => re.test(name))
    const wrong = [
      ...table.kept.filter(skipped).map((n) => 'kept but skipped: ' + n),
      ...table.skipped.filter((n) => !skipped(n)).map((n) => 'skipped but kept: ' + n),
    ]
    for (const name of table.skipped) {
      const owners = V2_SUITES.excludedCases.filter((e) => new RegExp(e.pattern).test(name))
      if (!owners.some((e) => e.disposition === table.disposition)) wrong.push('no ' + table.disposition + ' entry for ' + name)
      if (table.files && !owners.some((e) => table.files.includes(e.file))) wrong.push('entry for ' + name + ' names another file')
    }
    assert.deepEqual(wrong, [])
  })
}

// EP V2B-SUITE-05: every exclusion entry is valid (known disposition, reason, selected file, pattern in effect).
test('V2B-SUITE-05 exclusion entries are well-formed', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  const { files, skipPatterns } = selectV2Suites()
  const bad = []
  for (const e of V2_SUITES.excludedFiles) {
    if (!V2B.dispositions.files.includes(e.disposition)) bad.push('file disposition ' + e.file + ': ' + e.disposition)
    if (typeof e.reason !== 'string' || !e.reason.trim()) bad.push('file reason ' + e.file)
  }
  for (const e of V2_SUITES.excludedCases) {
    if (!files.includes(e.file)) bad.push('case file not selected ' + e.file)
    if (!V2B.dispositions.cases.includes(e.disposition)) bad.push('case disposition ' + e.pattern + ': ' + e.disposition)
    if (typeof e.reason !== 'string' || !e.reason.trim()) bad.push('case reason ' + e.pattern)
    try { new RegExp(e.pattern) } catch { bad.push('case pattern invalid ' + e.pattern) }
  }
  for (const p of skipPatterns) try { new RegExp(p) } catch { bad.push('skip pattern invalid ' + p) }
  assert.deepEqual(bad, [])
})

/**
 * Test titles a selected file declares, read from its source: the first string argument of
 * it/test/describe (and .todo/.skip/.only). A template literal contributes its static prefix before
 * the first `${`; an empty title is dropped (it names nothing a pattern could be checked against).
 */
const TITLE_CALL = /\b(?:it|test|describe)(?:\.(?:todo|skip|only))?\(\s*(?:'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|\$(?!\{)|[^`\\$])*))/g
const sourceTitles = (file) => [...fs.readFileSync(path.join(REPO, file), 'utf8').matchAll(TITLE_CALL)]
  .map((m) => (m[1] ?? m[2] ?? m[3]).replace(/\\(.)/g, '$1')).filter((title) => title !== '')
/** Titles generated at run time (K1 builds `<ID> | ...` from a case list): the known names of V2B-SUITE-04. */
const GENERATED_TITLES = Object.freeze({ [K1]: [...CASE_TABLES.K1.kept, ...CASE_TABLES.K1.skipped] })

// DT V2B-SUITE-07 (pattern x selected file: own file -> at least one match; any other file -> no match).
// node --test applies every --test-skip-pattern to every selected file, so a pattern must not reach a foreign title.
test('V2B-SUITE-07 every skip pattern stays inside its own file', async () => {
  const { V2_SUITES, selectV2Suites } = await suites()
  const titles = new Map(selectV2Suites().files.map((f) => [f, [...sourceTitles(f), ...(GENERATED_TITLES[f] ?? [])]]))
  const bad = []
  for (const entry of V2_SUITES.excludedCases) {
    const re = new RegExp(entry.pattern)
    if (!(titles.get(entry.file) ?? []).some((t) => re.test(t))) bad.push('no title of own file ' + entry.file + ' matches ' + entry.pattern)
    for (const [file, list] of titles) {
      if (file === entry.file) continue
      for (const title of list) if (re.test(title)) bad.push(file + ': ' + JSON.stringify(title) + ' matched by ' + entry.pattern + ' (owned by ' + entry.file + ')')
    }
  }
  assert.deepEqual(bad, [])
})

// EP V2B-SUITE-06: the V2 run has its own script and runner file.
test('V2B-SUITE-06 test:v2 script runs test/run-v2.mjs', () => {
  const script = rootManifest().scripts?.[V2B.runner.script]
  assert.match(String(script ?? ''), V2B.runner.command)
  assert.ok(fs.existsSync(path.join(REPO, V2B.runner.file)), V2B.runner.file + ' missing')
})
