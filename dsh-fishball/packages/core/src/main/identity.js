/**
 * The generated `identity.id` (R-ID-10 "generated at first start"; F-WIRE). The user's own
 * `identity.id` setting wins whenever it holds a value; without one, core uses the id it generated
 * at its first start in this DSH, kept in its own storage domain so every later start reuses it.
 *
 * Why not the settings document: saving a setting makes DSH reconcile the profile at once, with or
 * without HMR (dsh-config-editor, both SDKs), so a first-start save would also apply core's moved
 * bundle order in the same start, while R-FB-12 has the guard hold "from the next start" with HMR
 * off. Storage writes reach nothing but this table.
 */
import { generateId } from '../identity/index.js'
import { IDENTITY_STORE } from './constants.js'

const recordSchema = Object.freeze({
  parse(value) {
    if (typeof value !== 'string' || value === '') throw new TypeError(IDENTITY_STORE.malformed)
    return value
  },
})

/**
 * @param ctx - a Cordis context with `ctx.storage.domain`
 * @param storageDomain - `{defineDomain, domainTable}` from `@deepseek-ai/dsh-storage-domain`
 * @returns {Promise<{id: string, close: () => Promise<void>}>} the generated id (created and saved
 *   when absent) and the domain's closer
 */
export async function openGeneratedId(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: IDENTITY_STORE.domain,
    version: IDENTITY_STORE.version,
    tables: { [IDENTITY_STORE.table]: domainTable(recordSchema) },
  }))
  const table = domain.table(IDENTITY_STORE.table)
  let id = table.get(IDENTITY_STORE.key)
  if (id === undefined) {
    id = generateId()
    await table.put(IDENTITY_STORE.key, id)
  }
  return { id, close: () => domain.close() }
}
