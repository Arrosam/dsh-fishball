/**
 * P11 R3: the messenger's browser file and its package. One host for the route; the package checks read
 * the repository's own files and `npm pack --dry-run` (they never import or evaluate the messenger).
 *
 * | id     | technique | expected |
 * |--------|-----------|----------|
 * | MCJ-01 | EP (GET, look on) | 200; content-type 'text/javascript; charset=utf-8'; cache-control 'no-store'; body byte-for-byte packages/messenger/client.js |
 * | MCJ-02 | ST (look on -off-> off -on-> on) | the same answer while off and after on again |
 * | MCJ-03 | EP (POST) | not served: never 200 with the file's bytes |
 * | MCJ-04 | EP (no cookie) | not 200; the file's bytes are not in the answer |
 * | MCJ-05 | EP | packages/messenger/package.json names "dsh-fishball-messenger" |
 * | MCJ-06 | EP | dsh-fishball's files list packages/messenger/; npm pack --dry-run lists packages/messenger/package.json and packages/messenger/client.js |
 * | MCJ-07 | EP | client.js registers the module id dsh-fishball-messenger through window.__ModuleLoader__.load({ id: ... }) |
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'
import { API, MESSENGER, REPO } from './support/constants.mjs'
import { HOOK, T, settle } from './support/expect.mjs'
import { bootLive, newHome } from './support/host.mjs'

const NPM = '/opt/homebrew/bin/npm'
const fileBytes = () => fs.readFileSync(MESSENGER.clientFile)

describe('P11 the messenger\'s browser file', () => {
  let host
  /** One request to the route, with the raw body bytes and the two headers the requirement names. */
  const fetchRoute = async ({ method = 'GET', cookie = true } = {}) => {
    const res = await fetch(host.origin + MESSENGER.route, { method, headers: { ...(cookie ? { cookie: host.cookie } : {}), ...(method === 'POST' ? { origin: host.origin, 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}), redirect: 'manual' })
    const body = Buffer.from(await res.arrayBuffer())
    return { status: res.status, contentType: res.headers.get('content-type'), cacheControl: res.headers.get('cache-control'), body }
  }
  const assertServed = (r, label) => {
    assert.equal(r.status, 200, label)
    assert.equal(r.contentType, MESSENGER.contentType, label + ' content-type')
    assert.equal(r.cacheControl, MESSENGER.cacheControl, label + ' cache-control')
    assert.ok(r.body.equals(fileBytes()), label + ': body equals packages/messenger/client.js byte for byte (' + r.body.length + ' vs ' + fileBytes().length + ' bytes)')
  }

  before(async () => {
    host = (await bootLive(newHome('messenger-client'))).host
    await settle(host)
  }, HOOK)
  after(async () => { await host?.stop() }, HOOK)

  it('MCJ-01 GET answers the file with its type and no-store', T, async () => {
    assert.ok(fs.existsSync(MESSENGER.clientFile), 'precondition: packages/messenger/client.js exists')
    assert.deepEqual((await host.state()).look, { messenger: true }, 'precondition: look on')
    assertServed(await fetchRoute(), 'look on')
  })

  it('MCJ-02 it is served the same while the look is off and after it is on again', T, async () => {
    try {
      assert.equal((await host.post(API.plugins, { plugin: MESSENGER.key, on: false })).status, 200)
      assert.deepEqual((await host.state()).look, { messenger: false }, 'precondition: look off')
      assertServed(await fetchRoute(), 'look off')
    } finally {
      assert.equal((await host.post(API.plugins, { plugin: MESSENGER.key, on: true })).status, 200)
    }
    assertServed(await fetchRoute(), 'look on again')
  })

  it('MCJ-03 POST is not served by Fishball', T, async () => {
    const r = await fetchRoute({ method: 'POST' })
    assert.equal(r.status === 200 && r.body.equals(fileBytes()), false, 'POST got the file (status ' + r.status + ')')
    assert.notEqual(r.status, 200, 'status ' + r.status)
  })

  it('MCJ-04 without the browser cookie it is refused', T, async () => {
    const r = await fetchRoute({ cookie: false })
    assert.notEqual(r.status, 200)
    assert.equal(r.body.equals(fileBytes()), false)
  })
})

describe('P11 the messenger package', () => {
  it('MCJ-05 packages/messenger/package.json names dsh-fishball-messenger', () => {
    const pkg = JSON.parse(fs.readFileSync(MESSENGER.packageFile, 'utf8'))
    assert.equal(pkg.name, MESSENGER.packageName)
  })

  // M1 docs/package-layout.md: packages/messenger is unchanged but no plugin ships it (I8 retires it).
  it('MCJ-06 neither plugin ships the messenger package (files and npm pack --dry-run)', { timeout: 60000 }, () => {
    for (const dir of ['connector', 'instance']) {
      const root = path.join(REPO, 'packages', dir)
      const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      assert.ok(!(pkg.files ?? []).includes(MESSENGER.filesEntry), dir + ' files lists ' + MESSENGER.filesEntry + ': ' + JSON.stringify(pkg.files))
      const r = spawnSync(NPM, ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: process.env.HOME ?? '' } })
      assert.equal(r.status, 0, dir + ' npm pack --dry-run: ' + (r.stderr ?? '').slice(-1000))
      const packed = JSON.parse(r.stdout)[0].files.map((f) => f.path)
      assert.ok(!packed.some((p) => p.startsWith(MESSENGER.filesEntry)), dir + ' packs ' + JSON.stringify(packed.filter((p) => p.startsWith('packages/'))))
    }
  })

  it('MCJ-07 client.js registers the module id dsh-fishball-messenger through window.__ModuleLoader__.load', () => {
    const text = fs.readFileSync(MESSENGER.clientFile, 'utf8')
    const at = text.indexOf('window.__ModuleLoader__.load(')
    assert.ok(at >= 0, 'calls window.__ModuleLoader__.load(')
    assert.match(text.slice(at), /^window\.__ModuleLoader__\.load\(\s*\{[\s\S]*?\bid\s*:\s*(['"])dsh-fishball-messenger\1/, 'the load call names id dsh-fishball-messenger')
  })
})
