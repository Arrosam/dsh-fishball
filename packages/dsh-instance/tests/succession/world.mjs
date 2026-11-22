/**
 * One instance's hosted-token logic on one SDK, over its real parts and the shared fakes
 * (../support/fakes.mjs):
 * the real hosted record on disk (src/host/hosted-record.js) under a scratch main home, the real
 * hosted-token rules (src/host/hosted.js createHostedToken), the real credential client and receiver
 * (src/native-runtime/credential.js) over an in-memory wire, and the real locator
 * (src/host/locator.js), whose Reconnect and Retry are the settings page's. The record handed to the
 * logic is the real one behind a thin guard that journals its writes and can make them fail (the
 * disk refusing hosted.json).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { cleanups, tempRoot } from '@dsh-instance/test-helpers/scratch'
import { settled } from '@dsh-instance/test-helpers/wait'
import { credentialLink } from '../support/credential-link.mjs'
import { fakeChildCredentials, fakeLifecycle, fakeTokens } from '../support/fakes.mjs'
import { importInstance } from '../support/instance.mjs'
import { FIXTURE, RECORD, RUNTIME } from './constants.mjs'

/** The record's write members (hosted-record.js: add, settle). */
const WRITES = Object.freeze(['add', 'settle'])

function guarded(record, state, writes) {
  const out = {}
  for (const [name, value] of Object.entries(record)) {
    if (typeof value !== 'function') out[name] = value
    else if (!WRITES.includes(name)) out[name] = (...args) => value(...args)
    else out[name] = async (...args) => {
      writes.push([name, ...args])
      if (state.broken) throw new Error(FIXTURE.writeFailure)
      return value(...args)
    }
  }
  return out
}

/**
 * Options: `tokens` (fakeTokens options; false = no connector), `runtime` (what runtimeId()
 * answers; default RUNTIME.r1; pass undefined for "unknown").
 */
export async function successionWorld(t, sdk, options = {}) {
  const { createHostedToken } = await importInstance(sdk, 'src/host/hosted.js')
  const { openHostedRecord } = await importInstance(sdk, 'src/host/hosted-record.js')
  const { createChildLocator } = await importInstance(sdk, 'src/host/locator.js')
  const scope = cleanups(t)
  const home = tempRoot(scope, FIXTURE.tempPrefix)
  const dir = path.join(home, ...RECORD.dirs)
  fs.mkdirSync(dir, { mode: 0o700 })
  const file = path.join(dir, RECORD.file)
  const tokens = options.tokens === false ? undefined : fakeTokens({ fixture: FIXTURE, ...options.tokens })
  const credentials = fakeChildCredentials()
  const lifecycle = fakeLifecycle({ port: FIXTURE.childPort })
  const warnings = []
  const writes = []
  const state = { broken: false }
  let runtime = 'runtime' in options ? options.runtime : RUNTIME.r1
  let runtimes = 1
  // A new authenticated wire (a start): the old ends close, the receiver answers on the new one.
  const link = await credentialLink(sdk, credentials, { timeoutMs: FIXTURE.clientTimeoutMs })
  const { wires, connect, imports } = link
  let record
  let hosted
  let locator
  /** A host-row start: the record reopened from its file and new hosted-token logic over it. */
  async function open() {
    record = await openHostedRecord(file)
    hosted = createHostedToken({
      tokens: () => tokens,
      record: guarded(record, state, writes),
      credentials: () => link.client,
      instanceId: () => FIXTURE.instanceId,
      runtimeId: () => runtime,
      changed: () => {},
      warn: (...args) => { warnings.push(args) },
    })
    locator = createChildLocator({ lifecycle, origin: lifecycle.origin, ticket: async () => '', hosted, providerSync: {} })
  }
  await open()
  // Close the logic (and wait for its steps) before the scratch home is removed.
  scope.defer(async () => { link.close(); await hosted.close() })
  const reopened = () => openHostedRecord(file)
  const w = {
    tokens, credentials, file, warnings, writes, wires,
    get record() { return record },
    get hosted() { return hosted },
    get locator() { return locator },
    setRuntime(value) { runtime = value },
    breakWrites() { state.broken = true },
    mendWrites() { state.broken = false },
    /** A child start: a new wire, then the first-start rule; settled afterwards. */
    async start() { connect(); await hosted.firstStart(); await settled() },
    /** A reinstall: a new child runtime (so a new runtime id, unless unknown) and an empty store; then a start. */
    async reinstall() {
      if (runtime !== undefined) { runtimes += 1; runtime = RUNTIME.next(runtimes) }
      credentials.wipe()
      await w.start()
    },
    /** Core dropped its copy inside the same runtime (a Connect in the child): same runtime id. */
    async sameRuntimeFirstStart() { credentials.wipe(); await w.start() },
    /** A host-row restart: the logic closed, the record reopened from disk, then a start. */
    async restartHost() { await hosted.close(); await open(); await w.start() },
    async reconnect() { const answer = await locator.reconnect(); await settled(); return answer },
    async retry() { await locator.retry(); await settled() },
    /** A connector pair change, and what it set off. */
    async pairChange() { tokens.emit(); await settled() },
    pendingOnDisk: async () => (await reopened()).pending(),
    entriesOnDisk: async () => [...(await reopened()).entries()],
    runtimeOnDisk: async () => (await reopened()).runtime(),
    fileText: () => fs.readFileSync(file, 'utf8'),
    /** Rewrite hosted.json by hand (a user's edit, or a record from before runtimes were recorded). */
    editFile(edit) { const json = JSON.parse(w.fileText()); edit(json); fs.writeFileSync(file, JSON.stringify(json)) },
    retired: () => tokens.calls.retired,
    created: () => tokens.calls.created.length,
    /** The import frames the host sent, parsed. */
    imports,
  }
  return w
}

/** First install, then a reinstall whose retire calls answer `outcomes` in order (then ok). */
export async function reinstalled(t, sdk, outcomes = [], options = {}) {
  const w = await successionWorld(t, sdk, options)
  await w.start()
  w.tokens.answer(...outcomes)
  await w.reinstall()
  return w
}

/** The pending old entry, as the live record and as a reopened hosted.json read it. */
export async function assertPending(w, expected, message) {
  assert.equal(w.record.pending(), expected, message + ' (the live record)')
  assert.equal(await w.pendingOnDisk(), expected, message + ' (hosted.json reopened)')
}
