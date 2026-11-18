/**
 * Core's durable target records and tool bindings (task MULTI-1; MULTI-0 `TargetRecord`,
 * `TARGETS.store`, `TARGETS.bindingStore`): one DSH storage domain with two tables, opened once by
 * core's main row. No record holds a token value.
 * - `targets`: one `TargetRecord` per id (the reserved parent's too: its name allocation persists,
 *   its URL never comes from here);
 * - `tool-bindings`: one record per model-facing tool name ever registered, `{name, tuple}`, so a
 *   name bound once to one `(target, epoch, name, origin, rawName)` tuple is never registered for
 *   another, after a rename, removal or restart included (PLAN-MULTI §4.4 tombstones).
 */
import { TARGETS } from '../../contracts/constants.js'
import { SEAM_TARGETS } from 'fishball-shared/ui-seam'
import { TARGET_MISUSE } from './constants.js'

const KINDS = new Set(Object.values(SEAM_TARGETS.kind))
const isText = (value) => typeof value === 'string'
const isSuffix = (value) => value === null || (Number.isSafeInteger(value) && value >= TARGETS.duplicate.firstSuffix)

const schema = (valid, message) => Object.freeze({
  parse(value) {
    if (value === null || typeof value !== 'object' || !valid(value)) throw new TypeError(message)
    return value
  },
})

const targetSchema = schema((value) => [value.id, value.url, value.endpointEpoch].every(isText) && KINDS.has(value.kind)
  && Number.isSafeInteger(value.order) && (value.serverName === null || isText(value.serverName)) && isSuffix(value.duplicateSuffix), TARGET_MISUSE.record)
const bindingSchema = schema((value) => isText(value.name) && isText(value.tuple), TARGET_MISUSE.binding)

/**
 * Opens the domain (both tables). The two `TARGETS` entries name one domain, so its name and
 * version are the store's.
 * @returns {Promise<{targets: object, bindings: object, close: () => Promise<void>}>}
 */
export async function openTargets(ctx, { defineDomain, domainTable }) {
  const domain = await ctx.storage.domain.open(defineDomain({
    name: TARGETS.store.domain,
    version: TARGETS.store.version,
    tables: { [TARGETS.store.table]: domainTable(targetSchema), [TARGETS.bindingStore.table]: domainTable(bindingSchema) },
  }))
  return { targets: domain.table(TARGETS.store.table), bindings: domain.table(TARGETS.bindingStore.table), close: () => domain.close() }
}

/**
 * The bindings over their table: `admit(name, tuple)` claims a free name for `tuple` and answers
 * whether the name is now `tuple`'s. The claim takes effect in memory at once (two claims of one
 * name in one turn are exclusive) and its record is queued; a failed write is logged. A name's
 * digest covers the random target id and epoch, so two tuples meet only by a hash collision: the
 * table exists to keep a retired name from ever being re-bound, across restarts.
 * Known limit: one record per name ever registered, kept for good (a tombstone that expired could
 * be re-bound); the count grows with targets, renames and contributed tools, not with time.
 */
export function createBindings(table, { warn = () => {} } = {}) {
  const claimed = new Map([...table.entries()].map(([name, record]) => [name, record.tuple]))
  return Object.freeze({
    admit(name, tuple) {
      const held = claimed.get(name)
      if (held !== undefined) return held === tuple
      claimed.set(name, tuple)
      void table.put(name, Object.freeze({ name, tuple })).catch(warn)
      return true
    },
  })
}
