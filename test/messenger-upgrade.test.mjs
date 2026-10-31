/**
 * P11 R1/R2 on an EXISTING install: a home first booted with the version before P11 (commit e221d23,
 * extracted under .runtime with git archive, as plugins-upgrade does) until Fishball is live, with the
 * user's choices for two other built-ins, then booted with this version. The store has no choice for
 * builtin:messenger, so it must start on; the other choices are kept.
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | UPL-00 | precondition | the old version has no builtin:messenger entry and no look field (it really is the old version) |
 * | UPL-01 | DT (existing install × no stored choice) | after the upgrade: builtin:messenger on, status builtin, [disable], changedBy null; look {messenger:true} |
 * | UPL-02 | DT (existing install × other built-ins' stored choices) | builtin:reminders stays off and builtin:ask-user stays on (changedBy user) |
 * | UPL-03 | ST (restart of this version) | still on; look {messenger:true} |
 * | UPL-04 | ST (user off → restart) | off is kept; the upgrade default is not re-applied |
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { ACTION, API, CHANGED_BY, KIND, MESSENGER, PLUGIN_STATUS, PRE_MESSENGER, REPO, STATUS, TEST_HOMES } from './support/constants.mjs'
import { HOOK, T, catalogSettled, pluginIn, settle, settledIdle } from './support/expect.mjs'
import { bootHost, newHome } from './support/host.mjs'

const KEY = MESSENGER.key
const LONG = { timeout: 150000 }

describe('P11 Messenger look on an existing install (upgrade from the version before P11)', () => {
  let host
  let home
  let fb
  let oldDir
  let oldState

  const boot = async (env = {}) => {
    host = await bootHost(home, { env })
    const st = await host.waitStatus(STATUS.live)
    assert.equal(st?.status, STATUS.live, 'live: ' + JSON.stringify(st))
    await settle(host)
    return st
  }
  const restart = async (env) => { await settledIdle(host, fb); await host.stop(); const st = await boot(env); assert.equal(st.sessionId, fb, 'same session') }

  before(async () => {
    oldDir = path.join(path.dirname(TEST_HOMES), 'fbtest-premessenger-' + process.pid)
    fs.rmSync(oldDir, { recursive: true, force: true })
    fs.mkdirSync(oldDir, { recursive: true })
    const tar = oldDir + '.tar'
    execFileSync('git', ['-C', REPO, 'archive', '--output', tar, PRE_MESSENGER.commit])
    execFileSync('tar', ['-x', '-f', tar, '-C', oldDir])
    fs.rmSync(tar, { force: true })
    home = newHome('messenger-upgrade')
    const old = await boot({ FBTEST_PLUGIN_DIR: oldDir })
    fb = old.sessionId
    assert.equal((await host.post(API.plugins, { plugin: 'builtin:reminders', on: false })).status, 200)
    assert.equal((await host.post(API.plugins, { plugin: 'builtin:ask-user', on: true })).status, 200)
    await catalogSettled(host)
    oldState = await host.state()
    await restart({})
  }, { timeout: 240000 })
  after(async () => {
    await host?.stop()
    if (oldDir && path.basename(path.dirname(oldDir)) === '.runtime') fs.rmSync(oldDir, { recursive: true, force: true })
  }, HOOK)

  it('UPL-00 precondition: the old version knows no Messenger look', T, () => {
    assert.equal(pluginIn(oldState.catalog, KEY), undefined, 'no entry in the old version')
    assert.equal(Object.hasOwn(oldState, 'look'), false, 'no look field in the old version')
  })

  it('UPL-01 after the upgrade the Messenger look is on, with no stored choice', T, async () => {
    const p = pluginIn(await catalogSettled(host), KEY)
    assert.ok(p, 'listed')
    assert.equal(p.kind, KIND.builtin)
    assert.equal(p.status, PLUGIN_STATUS.builtin)
    assert.equal(p.on, true)
    assert.deepEqual(p.actions, [ACTION.disable])
    assert.equal(p.changedBy, null)
    assert.deepEqual((await host.state()).look, { messenger: true })
  })

  it('UPL-02 the user\'s earlier choices for other built-ins are kept', T, async () => {
    const c = await catalogSettled(host)
    assert.equal(pluginIn(c, 'builtin:reminders')?.on, false)
    assert.equal(pluginIn(c, 'builtin:reminders').changedBy, CHANGED_BY.user)
    assert.equal(pluginIn(c, 'builtin:ask-user')?.on, true)
    assert.equal(pluginIn(c, 'builtin:ask-user').changedBy, CHANGED_BY.user)
  })

  it('UPL-03 a restart keeps it on', LONG, async () => {
    await restart({})
    assert.equal(pluginIn(await catalogSettled(host), KEY)?.on, true)
    assert.deepEqual((await host.state()).look, { messenger: true })
  })

  it('UPL-04 switched off by the user, it stays off after a restart', LONG, async () => {
    const res = await host.post(API.plugins, { plugin: KEY, on: false })
    assert.equal(res.status, 200, res.text)
    await restart({})
    const p = pluginIn(await catalogSettled(host), KEY)
    assert.equal(p?.on, false)
    assert.equal(p.changedBy, CHANGED_BY.user)
    assert.deepEqual((await host.state()).look, { messenger: false })
  })
})
