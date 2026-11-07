/**
 * One-time copy of the instance's launch settings from the old `fishball-native-host` row into
 * `fishball-instance` (design §0.2 "One-time settings migration", user decision 2026-11-07).
 *
 * Source: the old row's config as the profile composes it (bundle layers, the profile patch file,
 * the home patch and the launch overlays), read with DSH's own patch reader. The live form cannot
 * serve: the old row's fields were not volatile, so `settings.describe()` never listed them.
 *
 * Rules:
 * - it runs once: after the first pass a marker is stored and later boots copy nothing, so a value
 *   the user resets afterwards is not brought back;
 * - it copies `enabled` only. The old row's `nodeExecutable` and `executableSearchPath` are left
 *   behind without a word: the child now starts as the main DSH does (D28), so the new row has no
 *   such fields, and an old value is neither copied, validated nor logged;
 * - it never overwrites: a field the new row already has a user value for is left as it is;
 * - each copied value must pass the new schema; an invalid one is skipped and logged by its key,
 *   never by its value;
 * - the copy is one revisioned `settings.update`; the old patch is left untouched, so a rollback
 *   to the old package still finds it.
 */
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { composeEntries, readProfilePatches } from '@deepseek-ai/dsh-app-boot'

export const MIGRATION = Object.freeze({
  /** The row the values come from (the instance row's id before D22). */
  source: 'fishball-native-host',
  /** The only field copied: the one field of the new row's form (§0.7, D28). */
  fields: Object.freeze(['enabled']),
  /** The profile patches' binary name, as DSH's own config editor reads them. */
  binName: 'dsh',
  table: 'migrations',
  logger: 'fishball-instance',
})

/** The marker store: one record per finished migration, keyed by its source row. */
const migrationDomain = defineDomain({
  name: 'fishball_instance',
  version: 1,
  tables: { [MIGRATION.table]: domainTable(z.object({ migratedAt: z.string() })) },
})

/** Every row of composed entries, with group members (a row may sit inside a group). */
function rows(entries) {
  return entries.flatMap((row) => [row, ...(row.group && Array.isArray(row.config) ? rows(row.config) : [])])
}

/** The old row's composed config, or undefined when the profile has no such row. */
function sourceConfig(profileContext) {
  const composed = composeEntries([readProfilePatches(MIGRATION.binName, profileContext)])
  const config = rows(composed).find((row) => row.id === MIGRATION.source)?.config
  return config !== null && typeof config === 'object' && !Array.isArray(config) ? config : undefined
}

/**
 * Copy the launch values once. Call it after the row is active (DSH's settings service writes
 * only an active row) and before the first start, so that start uses the copied values.
 * @param ctx - the row's context: `settings`, `storageDomain`, `profileContext`, `logger`.
 * @param {{ namespace: string, schema: object }} target - the new row id and its Config schema.
 * @returns the copied field names; a failure is logged and never stops the start.
 */
export async function migrateLaunchSettings(ctx, { namespace, schema }) {
  const logger = ctx.logger(MIGRATION.logger)
  let domain
  try {
    domain = await ctx.storageDomain.open(migrationDomain)
    const markers = domain.table(MIGRATION.table)
    if (markers.get(MIGRATION.source) !== undefined) return []
    const old = sourceConfig(ctx.profileContext) ?? {}
    const user = ctx.settings.describe().find((form) => form.ns === namespace)?.user ?? {}
    const values = {}
    for (const field of MIGRATION.fields) {
      if (!Object.hasOwn(old, field) || Object.hasOwn(user, field)) continue
      try { schema.dict[field](old[field]) } catch { logger.warn('settings migration: skipped invalid %s', field); continue }
      values[field] = old[field]
    }
    const copied = Object.keys(values)
    if (copied.length > 0) await ctx.settings.update(namespace, values)
    // Stored only after the write, so a failed write is tried again at the next boot.
    await markers.put(MIGRATION.source, { migratedAt: new Date().toISOString() })
    if (copied.length > 0) logger.info('settings migration: copied %s from %s', copied.join(', '), MIGRATION.source)
    return copied
  } catch (error) {
    logger.warn('settings migration from %s failed: %s', MIGRATION.source, error?.code ?? error?.name ?? typeof error)
    return []
  } finally {
    await domain?.close().catch(() => {})
  }
}
