/**
 * The one-time copy of the user's old settings into the `fishball-connector` row (design §0.2
 * "One-time settings migration", §18.2 C2 R4). The pre-split package `dsh-fishball` kept its limits
 * in the `fishball` row and the question mode in its store (`settings/questions`). The connector
 * keeps both in its own row config (src/config.js).
 *
 * Rules (design §0.2):
 * - It runs only while the store has no `migrations` marker and the new namespace has no user
 *   value yet. A user value means the user (or an earlier copy) already set something, and a copy
 *   would overwrite it.
 * - Old limit values come from (a) the live `fishball` form, while `settings.describe()` still
 *   lists it, or else (b) the `- id: fishball` config row of the profile's patch file. Only
 *   explicit user values are read, never resolved defaults. The mode comes from (c) the store
 *   record.
 * - Each field is checked by the new schema. An invalid one is skipped and logged by key, never
 *   by value. The copy is one revisioned `settings.update`, then the marker is stored. The marker
 *   is stored even when nothing was copied, so a later boot never copies over a choice made since.
 * - The old patch row and the old store records are left as they are, so a rollback to the old
 *   package still finds them. The brand and sidebar-entry record is not migrated (D22).
 *
 * It runs after the loader has settled every row, through DSH's optional `settings` service.
 * Without that service (a host with no profile) there is no form to copy into: nothing happens and
 * no marker is written, so a later boot under a profile still copies.
 */
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { QUESTION_MODE_KEY, SETTINGS_MIGRATION } from './constants.js'
import { diagnosticOf } from './errors.js'

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** An unevaluated `!!js` value of the patch: never a valid setting, so the schema skips it. */
const JS_EXPRESSION = Object.freeze({})
const PATCH_TAGS = Object.freeze([Object.freeze({ tag: SETTINGS_MIGRATION.jsTag, resolve: () => JS_EXPRESSION })])

/**
 * The old row's explicit config in the profile patch: the last plain row with that id and a
 * config, as DSH's config editor reads its own override (dsh-config-editor `configuration()`).
 * @returns the config record, or undefined when the patch has none (or no patch exists).
 */
async function patchValues(settings) {
  let text
  try {
    text = await readFile(await settings.prepareDocument(), SETTINGS_MIGRATION.encoding)
  } catch (error) {
    if (error?.code === SETTINGS_MIGRATION.missingFile) return undefined
    throw error
  }
  const rows = parse(text, { customTags: PATCH_TAGS })
  if (!Array.isArray(rows)) return undefined
  const row = rows.findLast((entry) => isRecord(entry) && entry.id === SETTINGS_MIGRATION.oldRowId && entry.insert === undefined && isRecord(entry.config))
  return row?.config
}

/**
 * The old values, before checking: the old row's limits from its live form or else its patch row,
 * plus the old store's question mode.
 * @returns {{ values: object, source: string }}
 */
async function oldValues(settings, descriptors, store, modeField) {
  const live = descriptors.find((descriptor) => descriptor.ns === SETTINGS_MIGRATION.oldRowId)
  const fromLive = live === undefined ? undefined : (isRecord(live.user) ? live.user : {})
  const fromPatch = fromLive === undefined ? await patchValues(settings) : undefined
  const limits = fromLive ?? fromPatch ?? {}
  const source = fromLive !== undefined ? SETTINGS_MIGRATION.source.liveForm : fromPatch !== undefined ? SETTINGS_MIGRATION.source.patch : SETTINGS_MIGRATION.source.none
  const mode = store.settings.get(QUESTION_MODE_KEY)?.mode
  return { values: { ...limits, ...(mode === undefined ? {} : { [modeField]: mode }) }, source }
}

/**
 * Keep only the fields the new schema declares and accepts. An absent or null value is no user
 * value and is not copied. A refused one is skipped by key.
 * @returns {{ accepted: object, skipped: string[] }}
 */
function checked(schema, values) {
  const accepted = {}
  const skipped = []
  for (const [field, fieldSchema] of Object.entries(schema.dict)) {
    const value = values[field]
    if (value === undefined || value === null) continue
    try {
      fieldSchema(value)
      accepted[field] = value
    } catch {
      skipped.push(field)
    }
  }
  return { accepted, skipped }
}

/**
 * Copy the old settings once (see the module comment). Never throws: a failure is logged by
 * its code, no marker is written, and the next boot tries again.
 * @param {object} options
 * @param {object} options.ctx - the connector row's context (its optional services are read with get).
 * @param {object} options.store - the open Store (settings, migrations).
 * @param {object} options.logger - the row's logger.
 * @param {string} options.namespace - the connector row's id, the settings namespace to fill.
 * @param {object} options.schema - the row's Config (schemastery object), which checks each field.
 * @param {string} options.modeField - the question mode's field name in that schema.
 * @param {() => boolean} options.isActive - false once the row is disposed; nothing is written then.
 * @returns {Promise<void>}
 */
export async function migrateSettings({ ctx, store, logger, namespace, schema, modeField, isActive }) {
  try {
    if (store.migrations.get(SETTINGS_MIGRATION.key) !== undefined) return
    const settings = ctx.get(SETTINGS_MIGRATION.service.settings)
    if (settings === undefined) return
    // The old row's live form exists only once the loader has applied every row. This row's own
    // apply does not wait for the migration, so awaiting the loader here cannot wait on itself.
    await ctx.get(SETTINGS_MIGRATION.service.loader)?.await()
    if (!isActive()) return
    const descriptors = settings.describe()
    const own = descriptors.find((descriptor) => descriptor.ns === namespace)
    // Not listed: the row is not editable in this profile now; the next boot tries again.
    if (own === undefined) return
    const hasUserValue = isRecord(own.user) && Object.keys(own.user).length > 0
    if (!hasUserValue) {
      const { values, source } = await oldValues(settings, descriptors, store, modeField)
      const { accepted, skipped } = checked(schema, values)
      for (const field of skipped) logger.warn('settings migration: skipped invalid %s', field)
      if (!isActive()) return
      const fields = Object.keys(accepted)
      // The revision makes a concurrent edit in DSH's form win: the write is refused and the next
      // boot finds that user value and copies nothing.
      if (fields.length > 0) await settings.update(namespace, accepted, own.revision)
      logger.info('settings migration: copied %s field(s) from %s (%s)', fields.length, source, fields.join(', '))
    }
    await store.migrations.put(SETTINGS_MIGRATION.key, { at: new Date().toISOString() })
  } catch (error) {
    logger.warn('settings migration failed (%s)', diagnosticOf(error))
  }
}
