/**
 * The durable token entry records (design §5.3 "recorded in its storage domain"). One record per
 * entry, keyed by its opaque entry key. A record never holds a token value: only its HMAC
 * fingerprint, and the id of the key that took it (fingerprint.js).
 *
 * A record with `removed: true` is a deleted entry whose generated value is still to be unset
 * (the unset failed and is retried at every sync); it is never listed or matched.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { LOG, TOKEN_STORE } from './constants.js'

const isString = (value) => typeof value === 'string'
const isBoolean = (value) => typeof value === 'boolean'
const isGeneration = (value) => Number.isSafeInteger(value) && value >= 0

/**
 * One entry record. The domain calls `parse` on load only, so a malformed record fails the open
 * loudly (DSH's `invalid-record`) instead of being trusted. `domainTable` reads nothing but
 * `parse`, so this is a plain validator, as core's ledger is, rather than `z.object` as in
 * ../store.js: `zod` is a host peer that only a DSH profile provides, and this module must also
 * load where only DSH's own `@deepseek-ai/*` packages resolve (the repository's per-SDK runs
 * import it with nothing else installed). A changed shape bumps TOKEN_STORE.version.
 * - `fingerprint`: the HMAC of the value last seen under `ref`, or null when it had none;
 * - `keyId`: the fingerprint key's id; another id means the fingerprint cannot be compared;
 * - `awaitSave`: the value was unset outside a settings save, so none is generated for it until
 *   the next accepted settings save (the user's decisions 2026-11-14, C-TOKENS question 5 = B;
 *   registry.js `awaitsSave`).
 */
const entryRecord = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && isString(value.entryKey) && value.entryKey.length > 0
      && isString(value.ref) && isString(value.label) && isBoolean(value.enabled) && isGeneration(value.generation)
      && isBoolean(value.generated) && (value.fingerprint === null || isString(value.fingerprint)) && isString(value.keyId)
      && isBoolean(value.awaitSave) && isBoolean(value.removed)
    if (!ok) throw new TypeError(LOG.invalidRecord)
    return value
  },
})

export const tokenDomain = defineDomain({
  name: TOKEN_STORE.domain,
  version: TOKEN_STORE.version,
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
