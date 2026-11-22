/**
 * Vocabulary several of dsh-instance's test areas share: the package modules the shared worlds load,
 * the K3 / K3a contracts the shared fakes play (README "The hosted token"; the connector's
 * dshConnectorTokens, restated here because a test never imports another package), and the fakes'
 * own texts. An area's constants.mjs builds on these instead of restating them.
 */

/** The package modules the shared worlds load, relative to the package root. */
export const MODULE = Object.freeze({
  host: 'host.js',
  runtime: 'src/native-runtime/index.js',
  constants: 'src/native-runtime/constants.js',
  credential: 'src/native-runtime/credential.js',
})

/** K3a HOSTED_IMPORT names: the reserved parent's credential in the child, and the channel's ops. */
export const HOSTED_IMPORT = Object.freeze({
  credentialRef: 'DSH_AGENT_TOKEN',
  savedRecord: 'fishball-core/hosted-agent',
  ops: Object.freeze({ probe: 'probe', import: 'import' }),
})

/** <DSH_HOME>/fishball/hosted.json (README "The hosted token"). */
export const HOSTED_RECORD = Object.freeze({ dir: 'fishball', file: 'hosted.json' })

/** K3 dshConnectorTokens (tokens.d.ts): its apiVersion, entry states and the retire answers the fakes give. */
export const TOKENS = Object.freeze({
  service: 'dshConnectorTokens',
  apiVersion: 1,
  entry: Object.freeze({ enabled: 'enabled', disabled: 'disabled', deleted: 'deleted' }),
  operationFailed: 'operation-failed',
  ok: Object.freeze({ ok: true }),
  /** A scripted retire answer that makes the call reject (treated like operation-failed). */
  reject: 'reject',
})

/** The kind of every credential record the fakes store (dsh-credentials). */
export const GRANT = 'grant'

/** MULTI-2: additional targets' credentials (MULTI-0 TARGETS names), which the reserved parent never reads or replaces. */
export const EXTRA_CREDENTIALS = Object.freeze([
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_abcdefghijklmnop__e_abcdefghijklmnop', tokenRecord: 'fishball-core/token-t-abcdefghijklmnop-e-abcdefghijklmnop', grantRecord: 'fishball-core/connect-t-abcdefghijklmnop-e-abcdefghijklmnop', value: 'multi-extra-a', origin: 'https://remote-a.example' }),
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_bcdefghijklmnopq__e_bcdefghijklmnopq', tokenRecord: 'fishball-core/token-t-bcdefghijklmnopq-e-bcdefghijklmnopq', grantRecord: 'fishball-core/connect-t-bcdefghijklmnopq-e-bcdefghijklmnopq', value: 'multi-extra-b', origin: 'https://remote-b.example' }),
])

/** What the fakes plant or throw: recognisable test texts, never real secrets. */
export const FAKE = Object.freeze({
  /** The reserved credential a child store starts with (`fakeChildCredentials({ref: true})`). */
  preexisting: 'dsht_FBTEST-HOST-PLANTED-preexisting',
  createFailed: 'dshi-test createHosted failed',
  retireRejected: 'dshi-test retire rejected',
  readOnly: 'dshi-test credential store is read-only',
  wireClosed: 'dshi-test wire closed',
})

/** The host row's config field, the loader's volatile update it follows, and the level of its warnings (host.js). */
export const ROW_CONFIG = Object.freeze({ enabled: 'enabled', volatileUpdate: 'loader/volatile-update', warnLevel: 'warn' })

/**
 * The host row's world (host-row.mjs): the query tag its modules carry, the builtin it swaps, what
 * its fake context answers, the service the row provides, and the fake runtime's interrupted start.
 */
export const ROW = Object.freeze({
  tag: 'dshirow',
  fsPromises: 'node:fs/promises',
  installAnchor: '',
  logLevels: Object.freeze(['debug', 'info', 'warn', 'error']),
  service: 'nativeFishballRuntime',
  interrupted: 'START_INTERRUPTED',
  state: Object.freeze({ ready: 'ready', stopped: 'stopped' }),
})
