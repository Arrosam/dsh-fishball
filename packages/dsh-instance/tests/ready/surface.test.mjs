/**
 * I-READY's removals, checked on what the package ships (README: "It imports no Fishball-side code
 * and has no dsh-connector peer: it looks the connector's services up at runtime"; "Ready" is generic
 * DSH signals only; wire.js: the payload channels are the protocol, "Any other channel closes the
 * connection"), and the lifecycle wire's payload channels over a real TCP pair.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { caseTest, eachSdk } from '@dsh-instance/test-helpers/cases'
import { cleanups } from '@dsh-instance/test-helpers/scratch'
import { PACKAGE_DIR, packageFile } from '../support/instance.mjs'
import { READY, REMOVED } from './constants.mjs'
import { constantsOf, wirePair } from './subject.mjs'

/** The package's own modules: generated, bundled and test folders are not production code. */
function sourceFiles(dir = PACKAGE_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (REMOVED.skipDirs.includes(entry.name)) return []
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.(?:m?js|cjs)$/.test(entry.name) ? [file] : []
  })
}

eachSdk((sdk) => {
  caseTest(sdk, 'IREADY-EP-05', 'package', 'no removed modules, connector peer or native-web package entry', () => {
    const manifest = JSON.parse(fs.readFileSync(packageFile('package.json'), 'utf8'))
    assert.equal(manifest.peerDependencies?.[REMOVED.connectorPeer], undefined)
    assert.equal(manifest.files.includes(REMOVED.nativeWeb), false)
    for (const file of REMOVED.files) assert.equal(fs.existsSync(packageFile(file)), false, file)
  })
  caseTest(sdk, 'IREADY-EP-06', 'imports', 'production code contains no V2 readiness probe or connector import', () => {
    const files = sourceFiles()
    assert.ok(files.length > 0)
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8')
      for (const forbidden of REMOVED.sourceText) assert.equal(text.includes(forbidden), false, file + ': ' + forbidden)
      assert.doesNotMatch(text, REMOVED.connectorImport, file)
    }
  })
  caseTest(sdk, 'IREADY-EP-07', 'host', 'host has no migration, storageDomain injection or removed native routes', () => {
    const text = fs.readFileSync(packageFile('host.js'), 'utf8')
    for (const forbidden of REMOVED.hostText) assert.equal(text.includes(forbidden), false, forbidden)
  })
  caseTest(sdk, 'IREADY-EP-08', 'snapshot', 'lifecycle snapshot excludes native-web', async () => {
    const { RUNTIME } = await constantsOf(sdk)
    assert.equal(JSON.stringify(RUNTIME.snapshot).includes(REMOVED.nativeWeb), false)
  })

  for (const channel of READY.removedChannels) {
    caseTest(sdk, 'IREADY-WIRE-01', channel, 'removed payload channel closes authenticated connection', async (t) => {
      const { sender, receiver } = await wirePair(cleanups(t), sdk)
      const closed = new Promise((resolve) => receiver.once('closed', resolve))
      sender.send({ channel, payload: READY.sentinel })
      await closed
      assert.equal(receiver.closed, true)
    })
  }
  for (const [channel, transport] of READY.retainedChannels) {
    caseTest(sdk, 'IREADY-WIRE-02', channel, 'retained transport receives payload without closing', async (t) => {
      const { sender, receiver } = await wirePair(cleanups(t), sdk)
      const message = new Promise((resolve) => receiver[transport]().onMessage(resolve))
      sender.send({ channel, payload: READY.sentinel })
      assert.equal(await message, READY.sentinel)
      assert.equal(receiver.closed, false)
    })
  }
})
