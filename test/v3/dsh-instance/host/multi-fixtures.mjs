/** Fixtures spell MULTI-0 TARGETS credential names; no runtime/core implementation imports. */
import assert from 'node:assert/strict'

export const EXTRA_CREDENTIALS = Object.freeze([
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_abcdefghijklmnop__e_abcdefghijklmnop', tokenRecord: 'fishball-core/token-t-abcdefghijklmnop-e-abcdefghijklmnop', grantRecord: 'fishball-core/connect-t-abcdefghijklmnop-e-abcdefghijklmnop', value: 'multi-extra-a', origin: 'https://remote-a.example' }),
  Object.freeze({ ref: 'FISHBALL_TARGET_TOKEN_t_bcdefghijklmnopq__e_bcdefghijklmnopq', tokenRecord: 'fishball-core/token-t-bcdefghijklmnopq-e-bcdefghijklmnopq', grantRecord: 'fishball-core/connect-t-bcdefghijklmnopq-e-bcdefghijklmnopq', value: 'multi-extra-b', origin: 'https://remote-b.example' }),
])
export function seedExtraCredentials(credentials) {
  for (const entry of EXTRA_CREDENTIALS) {
    credentials.refs.set(entry.ref, entry.value)
    credentials.records.set(entry.tokenRecord, { kind: 'grant', payload: { origin: entry.origin, value: entry.value } })
    credentials.records.set(entry.grantRecord, { kind: 'grant', payload: { origin: entry.origin, accessToken: entry.value } })
  }
}
export function assertExtraCredentials(credentials) {
  for (const entry of EXTRA_CREDENTIALS) {
    assert.equal(credentials.refs.get(entry.ref), entry.value)
    assert.deepEqual(credentials.records.get(entry.tokenRecord), { kind: 'grant', payload: { origin: entry.origin, value: entry.value } })
    assert.deepEqual(credentials.records.get(entry.grantRecord), { kind: 'grant', payload: { origin: entry.origin, accessToken: entry.value } })
  }
}
