/**
 * The durable token entry records (design §5.1, §5.9 "storage decision: digest only"). One record
 * per entry, keyed by its opaque entry key. A record never holds a token value: only the
 * `TOKEN_VALUE.digestAlgorithm` digest of it, which is all `match` needs (a 256-bit random value is
 * not guessable from its digest, so no keyed digest is used, design §5.1).
 *
 * A record with `removed: true` is a deleted entry whose record could not be dropped yet (a failed
 * write, retried at every sync); it is never listed or matched, and its key never comes back.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { LOG, TOKEN_STORE } from './constants.js'

const isString = (value) => typeof value === 'string'
const isBoolean = (value) => typeof value === 'boolean'
const isGeneration = (value) => Number.isSafeInteger(value) && value >= 0

/**
 * One entry record `{entryKey, label, enabled, generation, digest, hosted, removed}`. The domain
 * calls `parse` on load only, so a malformed record fails the open loudly (DSH's `invalid-record`)
 * instead of being trusted. `domainTable` reads nothing but `parse`, so this is a plain validator,
 * as core's ledger is, rather than `z.object`: `zod` is a host peer that only a DSH profile
 * provides, and this module must also load where only DSH's own `@deepseek-ai/*` packages resolve
 * (the repository's per-SDK runs import it with nothing else installed).
 */
const entryRecord = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && isString(value.entryKey) && value.entryKey.length > 0
      && isString(value.label) && isBoolean(value.enabled) && isGeneration(value.generation)
      && isString(value.digest) && value.digest.length > 0 && isBoolean(value.hosted) && isBoolean(value.removed)
    if (!ok) throw new TypeError(LOG.invalidRecord)
    return value
  },
})

export const tokenDomain = defineDomain({
  name: TOKEN_STORE.domain,
  version: TOKEN_STORE.version,
  layout: TOKEN_STORE.layout,
  tables: { [TOKEN_STORE.table]: domainTable(entryRecord) },
})

/**
 * @param storageDomain - the context's `storageDomain` facility.
 * @returns {Promise<{table: object, close: () => Promise<void>}>} the KvTable and its closer; the
 *   caller owns the handle (as core's ledger does).
 */
export async function openTokenStore(storageDomain) {
  const domain = await storageDomain.open(tokenDomain)
  return { table: domain.table(TOKEN_STORE.table), close: () => domain.close() }
}
