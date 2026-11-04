/** Standalone official-SDK fixture: no launcher, real profile, environment lookup or secret export. */
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const FIXTURE = Object.freeze({
  runtime: process.env.FBTEST_DSH_RUNTIME ?? '/Users/samuel/Library/Application Support/DSH/data/versions/0.2.1-rc.3/node_modules',
  root: path.resolve(import.meta.dirname, '../../.runtime/provider-sync-homes'),
  prefix: 'provider-sync-', secretBytes: 48, suffixLength: 8, digest: 'sha256', ownerMode: 0o600,
  scope: 'llm-pi-ai', kind: 'api-key', encoding: 'base64url',
  noLeak: 'generated credential material must not occur in observable output',
})

const sdk = (name) => import(pathToFileURL(path.join(FIXTURE.runtime, '@deepseek-ai', name, 'lib/index.js')).href)

export async function officialCredentials() {
  const [{ Context, Service }, { default: LocalCredentialProvider, CREDENTIALS_FILENAME }, { credentialKey }, { createLaunchEnvironmentSnapshot }] = await Promise.all([
    sdk('cordis'), sdk('dsh-credentials-local'), sdk('dsh-credentials'), sdk('dsh-launch-environment'),
  ])
  await fs.mkdir(FIXTURE.root, { recursive: true })
  const home = await fs.mkdtemp(path.join(FIXTURE.root, FIXTURE.prefix))
  const context = new Context()
  // An explicit empty snapshot prevents an accidental fallback to process/project/user environment.
  context.launchEnvironment = createLaunchEnvironmentSnapshot([])
  const provider = new LocalCredentialProvider(context, { dshHome: home, watch: false })
  const lifecycle = provider[Service.init]()
  const disposer = (await lifecycle.next()).value
  await lifecycle.next()
  const canaries = new Set()
  const keyFor = (id) => credentialKey(FIXTURE.scope, id)
  const opaque = () => {
    const value = randomBytes(FIXTURE.secretBytes).toString(FIXTURE.encoding)
    canaries.add(value)
    return value
  }
  let closed = false
  return {
    home,
    file: path.join(home, CREDENTIALS_FILENAME),
    provider,
    opaque,
    record: () => ({ kind: FIXTURE.kind, key: opaque() }),
    async seed(id, record) { await provider.modifyRecord(keyFor(id), () => record) },
    async read(id) { return provider.readRecord(keyFor(id)) },
    async describe(id) { return provider.describeRecord(keyFor(id)) },
    async import(id, record) {
      let inserted = false
      await provider.modifyRecord(keyFor(id), (current) => {
        if (current !== undefined) return undefined
        inserted = true
        return record
      })
      return { status: inserted ? 'imported' : 'exists' }
    },
    assertNoLeak(value) {
      const text = typeof value === 'string' ? value : JSON.stringify(value)
      // Boolean assertions deliberately keep canaries out of node:test diagnostics on failure.
      assert.equal([...canaries].some((secret) => [secret, secret.slice(-FIXTURE.suffixLength), createHash(FIXTURE.digest).update(secret).digest('hex')].some((part) => text?.includes(part))), false, FIXTURE.noLeak)
    },
    async assertSame(id, expected) {
      const actual = await provider.readRecord(keyFor(id))
      assert.equal(actual?.kind === expected?.kind && actual?.key === expected?.key, true, 'official stored record must match expected in-memory record')
    },
    async assertOwnerOnly() {
      assert.equal((await fs.stat(path.join(home, CREDENTIALS_FILENAME))).mode & 0o777, FIXTURE.ownerMode)
    },
    async close() {
      if (closed) return
      closed = true
      await disposer()
      // Remove only this fixture's verified direct child; never sweep shared test homes.
      const absolute = await fs.realpath(home)
      const root = await fs.realpath(FIXTURE.root)
      assert.equal(path.dirname(absolute), root, 'cleanup target must remain a direct disposable child')
      assert.equal(path.basename(absolute).startsWith(FIXTURE.prefix), true)
      await fs.rm(absolute, { recursive: true, force: true })
    },
  }
}
