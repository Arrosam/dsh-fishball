/**
 * The one place that binds the I-SUCCEED cases to the code under test (the seam the dev session
 * relayed, 2026-11-17, and its round-2 amendment after the user's Q3 = A):
 *
 *   openHostedRecord(file) → {instanceId, entries(), runtime(), pending(), add(entryKey, {runtime?, succession?}), settle(oldEntryKey)}
 *   createHostedToken({tokens, record, credentials, instanceId, remoteTarget, runtimeId, changed, warn})
 *     → {firstStart(), reconnect(), targetStatus(), retryNotice(), notice(), close()}
 *
 * Everything else is the I-HOST suite's binding (test/v3/dsh-instance/host/subject.mjs): the real
 * hosted record on disk under a scratch main home, the real credential client and receiver over an
 * in-memory wire, the real locator over a fake lifecycle. The record the instance is given is the
 * real one behind a thin guard that can make its writes fail (S2: "the record write fails") and
 * journals them (S3: "writes nothing more"). Nothing here reads the implementation.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fakeChildCredentials, fakeLifecycle, fakeProviderSync } from '../host/fakes.mjs'
import { childLink, fixtureScope, hostedModule, locatorModule, recordFile, recordModule, scratch } from '../host/subject.mjs'
import { HOST_FIXTURE, RECORD_WRITES, RUNTIME, WAIT } from './constants.mjs'
import { scriptedTokens } from './fakes.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * `record` with its write members journaled in `writes` and failing while `state.broken`; every
 * other member is the record's own. A plain object, not a Proxy: the real record is frozen, and a
 * Proxy may not answer a frozen data property with another function.
 */
function guarded(record, state, writes) {
  const out = {}
  for (const name of Object.keys(record)) {
    const value = record[name]
    if (typeof value !== 'function') out[name] = value
    else if (!RECORD_WRITES.includes(name)) out[name] = (...args) => value.apply(record, args)
    else out[name] = async (...args) => {
      writes.push([name, ...args])
      if (state.broken) throw new Error(WAIT.writeFailure)
      return value.apply(record, args)
    }
  }
  return out
}

/**
 * One instance on `sdk`.
 * Options: `tokens` (scriptedTokens options; false = no connector), `service` (a real K3 service to
 * use instead), `remote` (the instance targetUrl), `runtime` (the child runtime id `runtimeId()`
 * answers; default RUNTIME.r1; pass `undefined` explicitly for "no runtime id").
 */
export async function successionWorld(t, sdk, options = {}) {
  const { createHostedToken } = await hostedModule(sdk)
  const { createChildLocator } = await locatorModule(sdk)
  const { openHostedRecord } = await recordModule(sdk)
  const tokens = options.tokens === false || options.service !== undefined ? undefined : scriptedTokens(options.tokens)
  const service = options.service ?? tokens?.service
  const credentials = fakeChildCredentials()
  const link = await childLink(t, sdk, { credentials })
  const file = recordFile(scratch(t))
  const lifecycle = fakeLifecycle()
  const warnings = []
  const writes = []
  const state = { broken: false }
  let remote = options.remote ?? HOST_FIXTURE.blank
  let runtime = 'runtime' in options ? options.runtime : RUNTIME.r1
  let runtimes = 1
  let record
  let hosted
  let locator
  /** A host-row start: the record reopened from its file and a new hosted-token logic over it. */
  async function open() {
    record = await openHostedRecord(file)
    hosted = createHostedToken({
      tokens: () => service,
      record: guarded(record, state, writes),
      credentials: () => link.client(),
      instanceId: () => HOST_FIXTURE.instanceId,
      remoteTarget: () => remote,
      runtimeId: () => runtime,
      changed: () => {},
      warn: (...args) => { warnings.push(args) },
    })
    locator = createChildLocator({ lifecycle, origin: lifecycle.origin, ticket: async () => HOST_FIXTURE.blank, hosted, providerSync: fakeProviderSync() })
  }
  await open()
  fixtureScope(t).defer(() => hosted.close?.())
  const reopened = () => openHostedRecord(file)
  const world = {
    tokens, credentials, file, warnings, link, writes,
    get record() { return record },
    get hosted() { return hosted },
    get locator() { return locator },
    get runtime() { return runtime },
    setRemote(value) { remote = value },
    setRuntime(value) { runtime = value },
    /** hosted.json writes fail until `mendWrites()`. */
    breakWrites() { state.broken = true },
    mendWrites() { state.broken = false },
    /** A start of the child (a new authenticated wire, then the first-start rule). */
    async start() { link.connect(); await hosted.firstStart() },
    /**
     * A reinstall (uninstall or runtime reset): a new child runtime, so a new runtime id, and the
     * child home with its credential store gone; then a start. With no runtime id it stays none.
     */
    async reinstall() {
      if (runtime !== undefined) { runtimes += 1; runtime = RUNTIME.next(runtimes) }
      credentials.wipe()
      await world.start()
    },
    /** Core dropped its hosted copy inside the same runtime (a Connect in the child): no new runtime id. */
    async sameRuntimeFirstStart() { credentials.wipe(); await world.start() },
    /** A host-row restart: the old logic closed, the record reopened from disk, then a start. */
    async restartHost() { hosted.close?.(); await open(); await world.start() },
    /** The pending old entry / the entries / the runtime as a freshly opened record reads hosted.json. */
    async pendingOnDisk() { return (await reopened()).pending() },
    async entriesOnDisk() { return (await reopened()).entries() },
    async runtimeOnDisk() { return (await reopened()).runtime() },
    /** The record file's text. */
    fileText: () => fs.readFileSync(file, 'utf8'),
    /** Rewrites hosted.json by hand (a user edit, or a pre-I-SUCCEED record): `edit(json)` changes the parsed file. */
    editFile(edit) {
      const json = JSON.parse(world.fileText())
      edit(json)
      fs.writeFileSync(file, JSON.stringify(json))
    },
    retired: () => tokens.calls.retired,
    created: () => tokens.calls.created.length,
  }
  return world
}

/**
 * Asserts the retire calls so far are exactly `expected`. The instance may call retire after the
 * awaited action resolves (a prompt retry on a connector change), so it first waits for `expected`'s
 * length to be reached, then watches WAIT.quietMs for any extra call.
 */
export async function expectRetired(calls, expected, message) {
  const end = Date.now() + HOST_FIXTURE.longTimeoutMs
  while (calls().length < expected.length && Date.now() < end) await sleep(HOST_FIXTURE.settleMs)
  await sleep(WAIT.quietMs)
  assert.deepEqual(calls(), expected, message)
}
