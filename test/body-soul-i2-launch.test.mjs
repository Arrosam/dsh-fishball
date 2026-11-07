/**
 * I2 — the child launches as the host DSH does, and the launch fields leave the form
 * (docs/slim-native-design.md §0.5 "Child launch" and "Electron host", §0.7, §0.9 U1/U2,
 * §18.1 I2, §18.2 I2).
 * Observation points (no DSH boot):
 * - packages/instance/src/native-runtime/installation.js `childExecArgv(execArgv)` and
 *   `isolatedEnvironment(paths, host)` (host = a stand-in for `process`: env, versions, execPath),
 *   with `paths` from files.js `pathsFor(<temp main home>)`;
 * - packages/instance/host.js `Config` (the row's schema);
 * - packages/instance/src/settings-migration.js `migrateLaunchSettings(ctx, {namespace, schema})`
 *   with a stand-in row context whose profile context composes the old `fishball-native-host` row
 *   from a launch overlay (DSH's own patch reader does the composing).
 * The real spawn (executable, detached, no window, no stdin, both versions reach ready) is E1.
 *
 * | id | technique | expected |
 * |----|-----------|----------|
 * | I2-A-EP-01 | EP (empty) | [] → [] |
 * | I2-A-EP-02 | EP (DSH-X flags) | `--use-system-ca`, `--max-http-header-size=131072`, two `--import <hook>` pairs → unchanged, in order |
 * | I2-A-EP-03..07 | EP | `--inspect`, `--inspect=0`, `--inspect-brk`, `--inspect-port=9230`, `--debug-port=9229` → dropped, the rest kept in order |
 * | I2-A-EP-08 | EP | all debugger flags mixed between kept flags → only the kept ones, in order |
 * | I2-A-EP-09 | EP | `--inspect-port 9230` / `--debug-port 9229` as two items — todo: the design does not say whether the value item goes |
 * | I2-A-P-01 | P | the input array is not changed |
 * | I2-E-EP-01 | EP (NODE_OPTIONS unset) | absent in the child |
 * | I2-E-EP-02 | EP (NODE_OPTIONS set) | exactly the main value |
 * | I2-E-EP-03 | EP (fake key outside RUNTIME_ENV) | no main variable outside the runtime set reaches the child; the planted key value is in no child value |
 * | I2-E-EP-04 | EP (PATH) | absolute entries kept in order; relative and empty entries dropped |
 * | I2-E-P-01 | P | the isolated set (HOME, DSH_HOME, XDG_*, TMPDIR, DSH_TELEMETRY_DISABLED) is present and lies in the private layout, whatever the main values are |
 * | I2-E-DT-01 | DT (plain Node, no var) | no ELECTRON_RUN_AS_NODE |
 * | I2-E-DT-02 | DT (plain Node, var set in main) | no ELECTRON_RUN_AS_NODE (RUNTIME_ENV is [NODE_OPTIONS] only) |
 * | I2-E-DT-03 | DT (Electron, var `1` in main) | ELECTRON_RUN_AS_NODE=1 |
 * | I2-E-DT-04 | DT (Electron, no var) | ELECTRON_RUN_AS_NODE=1 |
 * | I2-E-DT-05 | DT (Electron, var `0` in main) | ELECTRON_RUN_AS_NODE=1 ("whatever the main process has") |
 * | I2-C-P-01 | P | Config has exactly the field `enabled` |
 * | I2-C-EP-01 | EP (old stored values) | a config with nodeExecutable / executableSearchPath / providerSync / limits is accepted (ignored, not an error) |
 * | I2-M-DT-01 | DT (old row: enabled + both old values; new empty; no marker) | copies only `{enabled}`; the old values are not written and not logged |
 * | I2-M-DT-02 | DT (old row: only the two old values) | nothing written; nothing about them logged |
 * | I2-M-DT-03 | DT (new row already has a user `enabled`) | not overwritten |
 * | I2-M-DT-04 | DT (marker present) | a second boot copies nothing |
 * | I2-M-DT-05 | DT (no old row) | nothing written |
 * | I2-M-EP-01 | EP (old `enabled` invalid) | skipped; logged by key, never by value |
 * | I2-S-01 | static | node-default.js is deleted; no `verifyNode` in packages/instance |
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { BODY_SOUL, loadInstance, runtimeAnchor, tempDir } from './support/body-soul-env.mjs'

const { childExecArgv, isolatedEnvironment } = await loadInstance('src/native-runtime/installation.js')
const { pathsFor } = await loadInstance('src/native-runtime/files.js')
const { Config } = await loadInstance('host.js')
const { migrateLaunchSettings } = await loadInstance('src/settings-migration.js')

const KEPT = Object.freeze(['--use-system-ca', '--max-http-header-size=131072', '--import', 'file:///Applications/DSH.app/compat/a.mjs', '--import', 'file:///Applications/DSH.app/compat/b.mjs'])
const FAKE_KEY = 'sk-fbtest-planted-0123456789abcdef'
const ISOLATED = Object.freeze(['HOME', 'DSH_HOME', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'TMPDIR', 'DSH_TELEMETRY_DISABLED'])
const ELECTRON = Object.freeze({ name: 'ELECTRON_RUN_AS_NODE', on: '1' })
const MAIN_HOME = path.resolve('/', 'fbtest-main-home-not-created')

/** A stand-in main process. */
function host({ env = {}, electron = false } = {}) {
  return { execPath: '/fbtest/bin/node', env: { PATH: '/usr/bin:/bin', ...env }, versions: { node: process.versions.node, ...(electron ? { electron: '38.0.0' } : {}) } }
}
const childEnv = (options) => isolatedEnvironment(pathsFor(MAIN_HOME), host(options))

describe('I2 execArgv', () => {
  it('I2-A-EP-01 an empty list stays empty', () => assert.deepEqual(childExecArgv([]), []))
  it('I2-A-EP-02 DSH-X\'s flags are kept as they are, in order', () => assert.deepEqual(childExecArgv([...KEPT]), [...KEPT]))
  for (const [id, flag] of [['I2-A-EP-03', '--inspect'], ['I2-A-EP-04', '--inspect=0'], ['I2-A-EP-05', '--inspect-brk'], ['I2-A-EP-06', '--inspect-port=9230'], ['I2-A-EP-07', '--debug-port=9229']]) {
    it(id + ' ' + flag + ' is dropped, the rest kept in order', () => {
      assert.deepEqual(childExecArgv([KEPT[0], flag, ...KEPT.slice(1)]), [...KEPT])
    })
  }
  it('I2-A-EP-08 every debugger flag mixed between kept flags → only the kept ones', () => {
    const input = ['--inspect', KEPT[0], '--inspect=0', KEPT[1], '--inspect-brk', KEPT[2], KEPT[3], '--inspect-port=9230', KEPT[4], KEPT[5], '--debug-port=9229']
    assert.deepEqual(childExecArgv(input), [...KEPT])
  })
  it('I2-A-EP-09 a debugger flag written with its value as the next item', { todo: 'open question: §0.5 drops "--inspect* and --debug-port flags" but does not say whether a separate value item (`--inspect-port 9230`) goes with it' }, () => {})
  it('I2-A-P-01 the input array is not changed', () => {
    const input = ['--inspect', ...KEPT]
    const copy = [...input]
    childExecArgv(input)
    assert.deepEqual(input, copy)
  })
})

describe('I2 environment', () => {
  it('I2-E-EP-01 NODE_OPTIONS unset → absent', () => assert.equal(Object.hasOwn(childEnv(), 'NODE_OPTIONS'), false))
  it('I2-E-EP-02 NODE_OPTIONS set → exactly the main value', () => {
    const value = '--require /Applications/DSH.app/compat/worker-events.cjs --require "/x y/instance-link.cjs"'
    assert.equal(childEnv({ env: { NODE_OPTIONS: value } }).NODE_OPTIONS, value)
  })
  it('I2-E-EP-03 a fake key in a main variable outside the runtime set never reaches the child', () => {
    const planted = { OPENAI_API_KEY: FAKE_KEY, DEEPSEEK_API_KEY: FAKE_KEY, DSH_X_INSTANCE_LINK: FAKE_KEY, DSH_TOKEN: FAKE_KEY, FBTEST_SECRET: FAKE_KEY }
    const main = host({ electron: true, env: { NODE_OPTIONS: '--no-warnings', ...planted } })
    const env = isolatedEnvironment(pathsFor(MAIN_HOME), main)
    for (const name of Object.keys(planted)) assert.equal(Object.hasOwn(env, name), false, name)
    assert.equal(Object.values(env).some((value) => String(value).includes(FAKE_KEY)), false, 'the key value is in no child variable')
    assert.equal(Object.keys(env).some((name) => name.startsWith('DSH_X_')), false, 'no DSH_X_* variable')
    // The only main variables whose values the child takes are RUNTIME_ENV = [NODE_OPTIONS] and PATH.
    const copied = Object.keys(main.env).filter((name) => env[name] === main.env[name])
    assert.deepEqual(copied.sort(), ['NODE_OPTIONS', 'PATH'])
  })
  it('I2-E-EP-04 PATH keeps only absolute entries, in order', () => {
    const main = ['/opt/homebrew/bin', 'node_modules/.bin', '', '/usr/bin', '.', '/bin'].join(path.delimiter)
    assert.equal(childEnv({ env: { PATH: main } }).PATH, ['/opt/homebrew/bin', '/usr/bin', '/bin'].join(path.delimiter))
  })
  it('I2-E-P-01 the isolated set is present, private, and not taken from main', () => {
    const paths = pathsFor(MAIN_HOME)
    const env = childEnv({ env: { HOME: '/Users/fbtest', DSH_HOME: '/Users/fbtest/.dsh', TMPDIR: '/tmp/main', XDG_CONFIG_HOME: '/Users/fbtest/.config' } })
    for (const name of ISOLATED) assert.ok(typeof env[name] === 'string' && env[name] !== '', name + ' set')
    for (const name of ISOLATED.filter((n) => n !== 'DSH_TELEMETRY_DISABLED')) {
      assert.ok(env[name].startsWith(paths.root + path.sep), name + ' lies in the private layout')
    }
  })
  for (const [id, options, expected] of [
    ['I2-E-DT-01 plain Node without the variable', { electron: false }, undefined],
    ['I2-E-DT-02 plain Node with ELECTRON_RUN_AS_NODE=1 in main', { electron: false, env: { [ELECTRON.name]: ELECTRON.on } }, undefined],
    ['I2-E-DT-03 Electron with ELECTRON_RUN_AS_NODE=1 in main', { electron: true, env: { [ELECTRON.name]: ELECTRON.on } }, ELECTRON.on],
    ['I2-E-DT-04 Electron without the variable', { electron: true }, ELECTRON.on],
    ['I2-E-DT-05 Electron with ELECTRON_RUN_AS_NODE=0 in main', { electron: true, env: { [ELECTRON.name]: '0' } }, ELECTRON.on],
  ]) {
    it(id + ' → ' + (expected === undefined ? 'no ELECTRON_RUN_AS_NODE' : 'ELECTRON_RUN_AS_NODE=' + expected), () => {
      assert.equal(childEnv(options)[ELECTRON.name], expected)
    })
  }
})

describe('I2 the row\'s form and the migration', () => {
  it('I2-C-P-01 the fishball-instance Config has exactly the field enabled', () => {
    assert.deepEqual(Object.keys(Config.dict), ['enabled'])
  })
  it('I2-C-EP-01 old stored values are accepted and ignored', () => {
    assert.doesNotThrow(() => Config({ enabled: true, nodeExecutable: '/opt/fake/node', executableSearchPath: ['/opt/fake'], providerSync: true, limits: {} }))
  })

  const OLD = Object.freeze({ nodeExecutable: '/opt/fbtest-old/node', executableSearchPath: ['/opt/fbtest-old/bin'] })
  /** A stand-in row context; `old` is the old row's config (undefined: no old row). */
  async function migration(t, { old, user = {}, marker = false } = {}) {
    const dir = await tempDir(t)
    const profile = path.join(dir, 'profile')
    fs.mkdirSync(profile)
    fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ name: 'fbtest-profile', private: true, dsh: { profile: { bundles: [] } } }))
    const logs = []
    const updates = []
    const store = new Map(marker ? [['fishball-native-host', { migratedAt: '2026-11-07T00:00:00.000Z' }]] : [])
    const ctx = {
      logger: () => ({ warn: (...a) => logs.push(a.join(' ')), info: (...a) => logs.push(a.join(' ')), debug: (...a) => logs.push(a.join(' ')) }),
      storageDomain: { open: async () => ({ table: () => ({ get: (k) => store.get(k), put: async (k, v) => { store.set(k, v) } }), close: async () => {} }) },
      settings: { describe: () => [{ ns: 'fishball-instance', user }], update: async (ns, values) => { updates.push([ns, values]) } },
      profileContext: {
        name: 'fbtest-profile', dir: profile, patchPath: path.join(profile, 'cordis.patch.yml'), installAnchor: runtimeAnchor(), cwd: dir, home: dir,
        startedBundles: [], telemetryDisabledEnv: undefined,
        overlays: old === undefined ? [] : [{ insert: [{ id: 'fishball-native-host', name: 'fishball-native-host', config: old }] }],
      },
    }
    const copied = await migrateLaunchSettings(ctx, { namespace: 'fishball-instance', schema: Config })
    const written = Object.assign({}, ...updates.map(([, values]) => values))
    const logText = logs.join('\n')
    return { copied, updates, written, logText }
  }
  const assertOldValuesSilent = (logText) => {
    for (const word of ['nodeExecutable', 'executableSearchPath', OLD.nodeExecutable, OLD.executableSearchPath[0]]) assert.equal(logText.includes(word), false, 'the log names ' + word)
  }

  it('I2-M-DT-01 copies only enabled; the old launch values are not written and not logged', async (t) => {
    const m = await migration(t, { old: { enabled: false, ...OLD } })
    assert.deepEqual(m.written, { enabled: false })
    assert.ok(m.updates.every(([ns]) => ns === 'fishball-instance'))
    assertOldValuesSilent(m.logText)
  })
  it('I2-M-DT-02 an old row with only the two launch values writes nothing and says nothing about them', async (t) => {
    const m = await migration(t, { old: { ...OLD } })
    assert.deepEqual(m.written, {})
    assertOldValuesSilent(m.logText)
  })
  it('I2-M-DT-03 a user value already in the new row is not overwritten', async (t) => {
    const m = await migration(t, { old: { enabled: false, ...OLD }, user: { enabled: true } })
    assert.equal(Object.hasOwn(m.written, 'enabled'), false)
  })
  it('I2-M-DT-04 with the marker present a second boot copies nothing', async (t) => {
    const m = await migration(t, { old: { enabled: false, ...OLD }, marker: true })
    assert.deepEqual(m.updates, [])
  })
  it('I2-M-DT-05 no old row → nothing written', async (t) => {
    const m = await migration(t, {})
    assert.deepEqual(m.written, {})
  })
  it('I2-M-EP-01 an invalid old enabled is skipped and logged by key, never by value', async (t) => {
    const m = await migration(t, { old: { enabled: 'fbtest-not-a-boolean', ...OLD } })
    assert.deepEqual(m.written, {})
    assert.ok(m.logText.includes('enabled'), 'logged by its key')
    assert.equal(m.logText.includes('fbtest-not-a-boolean'), false, 'never by its value')
    assertOldValuesSilent(m.logText)
  })
})

describe('I2 static', () => {
  it('I2-S-01 node-default.js is deleted and nothing names verifyNode', () => {
    assert.equal(fs.existsSync(path.join(BODY_SOUL.instance, 'src', 'native-runtime', 'node-default.js')), false)
    const files = ['host.js', 'native-child.js', ...fs.readdirSync(path.join(BODY_SOUL.instance, 'src'), { recursive: true }).map((f) => path.join('src', String(f)))].filter((f) => f.endsWith('.js'))
    const hits = files.filter((f) => fs.readFileSync(path.join(BODY_SOUL.instance, f), 'utf8').includes('verifyNode'))
    assert.deepEqual(hits, [])
  })
})
