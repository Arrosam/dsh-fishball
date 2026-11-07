/**
 * H-STUB vocabulary (docs/test-design/connector.md "H-STUB details"), shared by the fixture plugin
 * that runs inside the DSH worker and the test-side client. Contract names come from the public
 * `fishball-connector/contract` export, never from the connector's own source; the values here are
 * the harness's own: its row, its IPC message types, its default descriptor and its timings.
 */
import os from 'node:os'
import path from 'node:path'

export const STUB = Object.freeze({
  /** The fixture plugin (one row, its own id) and its folder. */
  row: 'fbtest-stub-instance',
  dir: path.join(import.meta.dirname, 'fixtures', 'fbtest-stub-instance'),
  /** The fixture's own IPC channel to the test process (beside the worker's 'call'/'reply'). */
  ipc: Object.freeze({ request: 'fbtest-stub', response: 'fbtest-stub-reply' }),
  /** The default descriptor fields; a case overrides any of them. */
  descriptor: Object.freeze({ id: 'stub-a', name: 'Stub A' }),
  /** What the stub serves and requires by default (contract §3.2: at least inbox.push). */
  capabilities: Object.freeze(['inbox.push']),
  /** status() answer before a case sets one (contract §6 STATUS). */
  status: Object.freeze({ state: 'ready', code: null }),
  /** Status modes beside a plain value: no status function at all, or one that throws. */
  statusMode: Object.freeze({ none: 'none', throws: 'throws' }),
  /** How long the fixture waits for the connector's reply to one of its requests. */
  replyTimeoutMs: 15000,
  /** The client's IPC wait, a little above the fixture's own reply wait. */
  ipcTimeoutMs: 25000,
  /** Poll step for the client's waits. */
  pollMs: 50,
  /** Default wait for an inbox item or an event. */
  waitMs: 10000,
  /** A quiet period used to show that nothing more arrives. */
  quietMs: 1500,
  /** The fixture's error marker for a reply that never came, or a channel that closed first. */
  noReply: Object.freeze({ timeout: 'fbtest-no-reply', closed: 'fbtest-channel-closed' }),
  /** A transport method made present but not a function (contract §1.1 "four functions"). */
  notAFunction: 'x',
})

/**
 * Throwaway OS-temp DSH homes. The worker refuses a home whose path has no `.runtime/test-homes`
 * part (support/worker.mjs), so the temp root keeps that suffix; nothing is written in the repo.
 */
const STUB_TEMP_PREFIX = 'fbtest-hstub-'
const STUB_TEMP = path.join(os.tmpdir(), STUB_TEMP_PREFIX + process.pid)
export const STUB_HOMES = Object.freeze({
  /** This process's own temp folder; every home of the process sits below it. */
  temp: STUB_TEMP,
  prefix: STUB_TEMP_PREFIX,
  root: path.join(STUB_TEMP, '.runtime', 'test-homes'),
})
