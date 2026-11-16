/**
 * Core's identity records (R-ID-07, AUTH-UC-05; `RECORDS`), in a DSH storage-domain table of the
 * Fishball DSH, keyed by kind and (target origin, credential id); the `ref` field holds the
 * credential's non-secret id (F-LINK-SAVE `LINK_SAVE.credentialId`, decided item 13):
 * - a paired record says "core paired, or chose to continue, with this token at this target"; its
 *   presence is what keeps core from calling `pair` again (R-ID-05);
 * - a declined record says the user chose a new token instead of this one (AUTH-UC-05 A2).
 * No record holds a token value.
 */
import { MISUSE, RECORDS } from './constants.js'

const isText = (value) => typeof value === 'string'
const isOptionalText = (value) => value === null || isText(value)
/** The name core last asked for and the connector's answer: absent until core asks. */
const isAsked = (value) => value === undefined
  || (value !== null && typeof value === 'object' && isOptionalText(value.name) && isText(value.source) && isOptionalText(value.refused))

const isPaired = (value) => isText(value.id) && isOptionalText(value.name) && Number.isSafeInteger(value.pairedAt) && isAsked(value.asked)
const isDeclined = (value) => Number.isSafeInteger(value.declinedAt)
const VALID_OF = Object.freeze({ [RECORDS.kind.paired]: isPaired, [RECORDS.kind.declined]: isDeclined })

/**
 * Validates a stored record when the domain opens (the domain calls `parse` on load only), so a
 * malformed record fails the open loudly instead of being trusted.
 */
const recordSchema = Object.freeze({
  parse(value) {
    const ok = value !== null && typeof value === 'object' && isText(value.origin) && isText(value.ref)
      && Object.hasOwn(VALID_OF, value.kind) && VALID_OF[value.kind](value)
    if (!ok) throw new TypeError(MISUSE.record)
    return value
  },
})

/**
 * Open the records table.
 * @param ctx - a Cordis context with `ctx.storage.domain` (dsh-storage-domain's facility).
 * @param storageDomain - `{defineDomain, domainTable}` from `@deepseek-ai/dsh-storage-domain`,
 *   passed in by the row that owns core's manifest (F-WIRE), so this module adds no dependency.
 * @returns {Promise<{table: object, close: () => Promise<void>}>} the KvTable and the domain's
 *   closer; the caller owns the handle and closes it.
 */
export async function openRecords(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: RECORDS.domain,
    version: RECORDS.version,
    tables: { [RECORDS.table]: domainTable(recordSchema) },
  }))
  return { table: domain.table(RECORDS.table), close: () => domain.close() }
}

/** The table key of (kind, origin, reference): a JSON array, so no separator can make two keys meet. */
const keyOf = (kind, origin, ref) => JSON.stringify([kind, origin, ref])

/**
 * The records over one KvTable (`get`, `put`; both SDKs).
 * @param table - a KvTable, from `openRecords` or any object with the same `get` and `put`
 */
export function createRecords(table) {
  const { paired, declined } = RECORDS.kind
  return Object.freeze({
    /** The paired record of (origin, ref), or `undefined`. */
    get: (origin, ref) => table.get(keyOf(paired, origin, ref)),
    /**
     * Writes the paired record of `{origin, ref}`: `{origin, ref, id, name, pairedAt, asked?}`, no
     * secret. `name` is the connector's name for the pair; `asked` is `{name, source, refused}`,
     * the name core last asked for, where (`pair` / `set_name`) and the refusal code or `null`.
     */
    put: (record) => table.put(keyOf(paired, record.origin, record.ref), Object.freeze({
      kind: paired, origin: record.origin, ref: record.ref, id: record.id, name: record.name, pairedAt: record.pairedAt,
      ...(record.asked === undefined ? {} : { asked: record.asked }),
    })),
    /** Whether the user declined the token of (origin, ref). */
    declined: (origin, ref) => table.get(keyOf(declined, origin, ref)) !== undefined,
    /** Marks the token of (origin, ref) declined, at `declinedAt` (epoch ms). */
    decline: (origin, ref, declinedAt) => table.put(keyOf(declined, origin, ref), Object.freeze({ kind: declined, origin, ref, declinedAt })),
  })
}
