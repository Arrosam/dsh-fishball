/**
 * Vocabulary of the reinstall-succession cases (README "The hosted token", "Reinstall"; hosted.js and
 * hosted-record.js JSDoc; the K3 contract dsh-connector host-services/tokens.d.ts, whose
 * `RetireRefusalCode` is restated here because a test never imports another package).
 */

/** K3 tokens.d.ts: `RetireRefusalCode = 'unknown-entry' | 'not-hosted' | 'successor-unpaired' | 'operation-failed'`. */
export const RETIRE = Object.freeze({
  unknownEntry: 'unknown-entry',
  notHosted: 'not-hosted',
  successorUnpaired: 'successor-unpaired',
  operationFailed: 'operation-failed',
})

/** What a scripted `retire` answers; `reject` makes the call reject (treated like operation-failed). */
export const OUTCOME = Object.freeze({
  ok: Object.freeze({ ok: true }),
  unpaired: Object.freeze({ ok: false, code: RETIRE.successorUnpaired }),
  failed: Object.freeze({ ok: false, code: RETIRE.operationFailed }),
  unknown: Object.freeze({ ok: false, code: RETIRE.unknownEntry }),
  notHosted: Object.freeze({ ok: false, code: RETIRE.notHosted }),
  reject: 'reject',
})

export const FIXTURE = Object.freeze({
  /** The instance's own stable id (hosted-record.js validId: a UUID). */
  instanceId: '0b9d3a1e-6c2f-4b7a-9e15-3f2a8c4d5e6f',
  entryPrefix: 'entry-',
  /** A planted token value, numbered per created entry: never anywhere but the child's import. */
  planted: 'dshi-planted-hosted-token-',
  label: 'Fishball',
  tempPrefix: 'dshi-succession-',
  /** The credential client's own bounds are product parameters; the largest timer delay, so none fires in a case. */
  clientTimeoutMs: 2 ** 31 - 1,
  writeFailure: 'dshi hosted.json write failed',
})

/** The hosted record's file and fields (hosted-record.js: `<mainHome>/fishball/hosted.json`, `{format, instanceId, entries, runtime?, succession?}`). */
export const RECORD = Object.freeze({ dirs: Object.freeze(['fishball']), file: 'hosted.json', entries: 'entries', runtime: 'runtime' })

/** The child credential names (README "The hosted token"; constants.js HOSTED). */
export const IMPORT = Object.freeze({ credentialRef: 'DSH_AGENT_TOKEN', savedRecord: 'fishball-core/hosted-agent', op: 'import' })

/** K3 child.d.ts entry states and refusals used here. */
export const K3 = Object.freeze({
  apiVersion: 1,
  entry: Object.freeze({ enabled: 'enabled', deleted: 'deleted' }),
  ready: Object.freeze({ state: 'ready', code: null }),
  unwritable: 'credentials-unwritable',
})

export const ENTRY = Object.freeze({
  e1: FIXTURE.entryPrefix + 1, e2: FIXTURE.entryPrefix + 2, e3: FIXTURE.entryPrefix + 3,
})

/** Child runtime ids (the runtime owner marker's hostId; a reinstall makes a new one). */
export const RUNTIME = Object.freeze({
  r1: 'dshi-runtime-1',
  r2: 'dshi-runtime-2',
  next: (n) => 'dshi-runtime-' + n,
})

/** Additional targets' credentials inside Fishball (README: they cannot satisfy the hosted probe). */
export const EXTRA_CREDENTIALS = Object.freeze([
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_abcdefghijklmnop__e_abcdefghijklmnop', tokenRecord: 'fishball-core/token-t-abcdefghijklmnop-e-abcdefghijklmnop', grantRecord: 'fishball-core/connect-t-abcdefghijklmnop-e-abcdefghijklmnop', value: 'multi-extra-a', origin: 'https://remote-a.example' }),
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_bcdefghijklmnopq__e_bcdefghijklmnopq', tokenRecord: 'fishball-core/token-t-bcdefghijklmnopq-e-bcdefghijklmnopq', grantRecord: 'fishball-core/connect-t-bcdefghijklmnopq-e-bcdefghijklmnopq', value: 'multi-extra-b', origin: 'https://remote-b.example' }),
])
