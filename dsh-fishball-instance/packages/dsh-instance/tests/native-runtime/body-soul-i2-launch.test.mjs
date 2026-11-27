import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { pathsFor } from '../../src/native-runtime/files.js'
import { childExecArgv, isolatedEnvironment } from '../../src/native-runtime/installation.js'

const FLAGS = Object.freeze({
  ca: '--use-system-ca', headers: '--max-http-header-size=131072', import: '--import',
  compat: 'file:///fixture/compat.mjs', link: 'file:///fixture/instance-link.mjs',
  singleItem: ['--inspect', '--inspect=0', '--inspect-brk', '--inspect-wait', '--inspect-port=9230', '--debug-port=9229', '--inspect-publish-uid=http'],
  paired: { inspectPort: ['--inspect-port', '9230'], debugPort: ['--debug-port', '9229'], publishUid: ['--inspect-publish-uid', 'http'] },
})
const KEPT = Object.freeze([FLAGS.ca, FLAGS.headers, FLAGS.import, FLAGS.compat, FLAGS.import, FLAGS.link])
const ENV = Object.freeze({
  main: 'main-home', hostBin: 'host-bin', customBin: 'custom-bin',
  relativeBins: ['node_modules/.bin', '', '.'],
  hostValue: 'synthetic-host-only-value',
  dropped: ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'DSH_X_INSTANCE_LINK', 'DSH_TOKEN', 'FBTEST_SECRET'],
  nodeOptions: '--require /fixture/worker-events.cjs --require "/fixture with space/instance-link.cjs"',
  electron: '44.0.0', on: '1', off: '0',
  xdg: [['XDG_CONFIG_HOME', 'config'], ['XDG_CACHE_HOME', 'cache'], ['XDG_DATA_HOME', 'data'], ['XDG_STATE_HOME', 'state']],
})

function environmentFixture(t) {
  const root = tempRoot(cleanups(t))
  const paths = pathsFor(path.join(root, ENV.main))
  return {
    root, paths,
    childEnv: (env = {}, electron) => isolatedEnvironment(paths, { env, versions: { electron } }),
  }
}

describe('I2 child exec arguments', () => {
  it('returns a new empty list for empty host arguments', () => {
    const input = []
    const result = childExecArgv(input)
    assert.deepEqual(result, [])
    assert.notEqual(result, input)
  })

  it('keeps the host runtime flags and both import pairs in order', () => {
    assert.deepEqual(childExecArgv(KEPT), KEPT)
  })

  for (const debuggerArgs of [...FLAGS.singleItem.map(flag => [flag]), ...Object.values(FLAGS.paired)]) {
    it('drops ' + debuggerArgs.join(' ') + ' and keeps the following import pair', () => {
      const input = Object.freeze([FLAGS.ca, ...debuggerArgs, FLAGS.import, FLAGS.compat])
      assert.deepEqual(childExecArgv(input), [FLAGS.ca, FLAGS.import, FLAGS.compat])
    })
  }

  it('keeps the runtime flags in order when interleaved with debugger flags', () => {
    const input = Object.freeze([
      ...FLAGS.singleItem, FLAGS.ca, ...FLAGS.paired.inspectPort, FLAGS.headers,
      FLAGS.import, FLAGS.compat, ...FLAGS.paired.debugPort, FLAGS.import, FLAGS.link, ...FLAGS.paired.publishUid,
    ])
    assert.deepEqual(childExecArgv(input), KEPT)
  })
})

describe('I2 child environment', () => {
  it('omits NODE_OPTIONS when absent and copies its exact value when present', t => {
    const { childEnv } = environmentFixture(t)
    assert.equal(Object.hasOwn(childEnv(), 'NODE_OPTIONS'), false)
    assert.equal(childEnv({ NODE_OPTIONS: ENV.nodeOptions }).NODE_OPTIONS, ENV.nodeOptions)
  })

  it('forwards runtime options but not host keys, tokens or DSH_X_* values', t => {
    const { childEnv } = environmentFixture(t)
    const planted = Object.fromEntries(ENV.dropped.map(name => [name, ENV.hostValue]))
    const env = childEnv({ ...planted, NODE_OPTIONS: ENV.nodeOptions }, ENV.electron)
    assert.equal(env.NODE_OPTIONS, ENV.nodeOptions)
    for (const name of ENV.dropped) assert.equal(Object.hasOwn(env, name), false, name)
    assert.equal(Object.values(env).some(value => value.includes(ENV.hostValue)), false)
  })

  it('keeps only absolute PATH entries in order, and does not supply a default PATH', t => {
    const { root, childEnv } = environmentFixture(t)
    const first = path.join(root, ENV.customBin), last = path.join(root, ENV.hostBin)
    const [relative, empty, dot] = ENV.relativeBins
    assert.equal(childEnv({ PATH: [first, relative, empty, dot, last].join(path.delimiter) }).PATH, [first, last].join(path.delimiter))
    assert.equal(childEnv().PATH, '')
  })

  it('overrides the entire private home, config, cache, data, state and temp set', t => {
    const { paths, childEnv } = environmentFixture(t)
    const expected = {
      HOME: paths.osHome, USERPROFILE: paths.osHome, DSH_HOME: paths.home, DSH_AGENTS_HOME: paths.agentsHome,
      ...Object.fromEntries(ENV.xdg.map(([key, dir]) => [key, path.join(paths.osHome, dir)])),
      APPDATA: path.join(paths.osHome, 'config'), LOCALAPPDATA: path.join(paths.osHome, 'data'),
      TMPDIR: paths.tmp, TMP: paths.tmp, TEMP: paths.tmp, DSH_TELEMETRY_DISABLED: ENV.on,
    }
    const host = Object.fromEntries(Object.keys(expected).map(name => [name, ENV.hostValue]))
    assert.deepEqual(childEnv(host), { ...expected, PATH: '' })
  })

  for (const electron of [undefined, ENV.electron]) {
    for (const inherited of [undefined, ENV.on, ENV.off]) {
      it((electron ? 'Electron' : 'Node') + ' with host ELECTRON_RUN_AS_NODE=' + inherited, t => {
        const { childEnv } = environmentFixture(t)
        const host = inherited === undefined ? {} : { ELECTRON_RUN_AS_NODE: inherited }
        const env = childEnv(host, electron)
        if (electron) assert.equal(env.ELECTRON_RUN_AS_NODE, ENV.on)
        else assert.equal(Object.hasOwn(env, 'ELECTRON_RUN_AS_NODE'), false)
      })
    }
  }
})
